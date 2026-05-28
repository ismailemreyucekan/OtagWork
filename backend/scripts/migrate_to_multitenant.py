"""
migrate_to_multitenant.py — Tek seferlik geçiş scripti.

Mevcut tek-tenant veriyi multi-tenant modele taşır:
  1. Şema güncellemesi: organizations, org_invites tabloları + tüm tablolara
     organization_id kolonu (SQLAlchemy create_all yeni kolonları otomatik
     ekleyemez; Alembic veya manuel ALTER TABLE gerekir — bu script ALTER'ı
     da çalıştırır).
  2. "Legacy" Organization oluşturur (plan_type='team', owner=ilk admin).
  3. Tüm Identity kayıtlarını Legacy org'a atar, org_role'unu user_type'a
     göre eşler (admin==>owner, manager==>manager, user==>member).
  4. Task, Timesheet, LeaveRequest, Project, Team, RecurrenceRule
     kayıtlarına organization_id = Legacy.id atar.

Idempotent: ikinci çalıştırmada yeni org oluşturmaz, sadece eksikleri doldurur.

Kullanım:
    cd backend
    python -m scripts.migrate_to_multitenant
"""
from __future__ import annotations

import sys
from datetime import datetime, timedelta
from sqlalchemy import text, inspect

# Sys.path setup: script doğrudan çalıştırıldığında "app" paketi bulunsun
sys.path.insert(0, '.')

from app import create_app
from app.models import (
    db, Identity, Organization, OrgInvite,
    Task, Timesheet, LeaveRequest, Project, Team, RecurrenceRule,
    TimesheetSetting,
)

ROLE_MAP = {'admin': 'owner', 'manager': 'manager', 'user': 'member'}

# Tüm yeni kolonlar (tablo, kolon adı, SQL tipi)
NEW_COLUMNS = [
    ('identities',         'organization_id', 'INTEGER'),
    ('identities',         'org_role',        "VARCHAR(20) DEFAULT 'member'"),
    ('timesheets',         'organization_id', 'INTEGER'),
    ('teams',              'organization_id', 'INTEGER'),
    ('projects',           'organization_id', 'INTEGER'),
    ('tasks',              'organization_id', 'INTEGER'),
    ('recurrence_rules',   'organization_id', 'INTEGER'),
    ('leave_requests',     'organization_id', 'INTEGER'),
    ('timesheet_settings', 'organization_id', 'INTEGER'),
]


def ensure_columns():
    """Eksik kolonları manuel ALTER TABLE ile ekler (idempotent)."""
    insp = inspect(db.engine)
    for table, col, coltype in NEW_COLUMNS:
        if not insp.has_table(table):
            print(f"  [SKIP] tablo yok: {table} (atlanıyor)")
            continue
        existing_cols = {c['name'] for c in insp.get_columns(table)}
        if col in existing_cols:
            print(f"  [OK] {table}.{col} zaten var")
            continue
        try:
            db.session.execute(text(f'ALTER TABLE {table} ADD COLUMN {col} {coltype}'))
            db.session.commit()
            print(f"  [ADD]{table}.{col} eklendi")
        except Exception as e:
            db.session.rollback()
            print(f"  [ERR] {table}.{col} eklenemedi: {e}")


def ensure_tables():
    """Yeni tabloları oluşturur (organizations, org_invites)."""
    db.create_all()
    print("  [OK] create_all() çalıştırıldı (yeni tablolar varsa eklendi)")


def get_or_create_legacy_org() -> Organization:
    """Legacy organization'ı al veya oluştur."""
    legacy = Organization.query.filter_by(slug='legacy').first()
    if legacy:
        print(f"  [OK] Legacy org zaten var (id={legacy.id})")
        return legacy

    # Owner: ilk admin, yoksa ilk kullanıcı
    owner = Identity.query.filter_by(user_type='admin').order_by(Identity.id).first()
    if not owner:
        owner = Identity.query.order_by(Identity.id).first()

    legacy = Organization(
        name='Legacy',
        slug='legacy',
        plan_type='team',
        owner_id=owner.id if owner else None,
    )
    db.session.add(legacy)
    db.session.commit()
    print(f"  [ADD]Legacy org oluşturuldu (id={legacy.id}, owner={owner.email if owner else 'yok'})")
    return legacy


def migrate_identities(legacy: Organization):
    """Tüm Identity'leri Legacy org'a atar, org_role'u user_type'tan map'ler."""
    users = Identity.query.all()
    updated = 0
    for u in users:
        changed = False
        if u.organization_id is None:
            u.organization_id = legacy.id
            changed = True
        # org_role'u her zaman senkron tut (varsayılan 'member' yerine doğru rol)
        expected_role = ROLE_MAP.get(u.user_type, 'member')
        if u.org_role != expected_role:
            u.org_role = expected_role
            changed = True
        if changed:
            updated += 1
    db.session.commit()
    print(f"  [OK] {updated}/{len(users)} kullanıcı güncellendi")


def migrate_data_tables(legacy: Organization):
    """Diğer tabloların organization_id'lerini Legacy'ye atar."""
    table_models = [
        ('Task',          Task),
        ('Timesheet',     Timesheet),
        ('LeaveRequest',  LeaveRequest),
        ('Project',       Project),
        ('Team',          Team),
        ('RecurrenceRule', RecurrenceRule),
        ('TimesheetSetting', TimesheetSetting),
    ]
    for name, model in table_models:
        try:
            updated = model.query.filter(model.organization_id.is_(None)).update(
                {model.organization_id: legacy.id},
                synchronize_session=False,
            )
            db.session.commit()
            print(f"  [OK] {name}: {updated} kayıt güncellendi")
        except Exception as e:
            db.session.rollback()
            print(f"  [ERR] {name}: hata — {e}")


def backfill_default_settings():
    """
    Tüm mevcut organization'lara eksik default TimesheetSetting kayıtlarını ekler.
    Idempotent: aynı (org, setting_type, value) zaten varsa atlar.
    """
    from app.routes.auth import _seed_default_settings
    orgs = Organization.query.all()
    seeded = 0
    for org in orgs:
        before = TimesheetSetting.query.filter_by(organization_id=org.id).count()
        _seed_default_settings(org.id)
        db.session.commit()
        after = TimesheetSetting.query.filter_by(organization_id=org.id).count()
        delta = after - before
        if delta > 0:
            seeded += delta
            print(f"  [ADD] {org.slug}: {delta} default ayar eklendi")
        else:
            print(f"  [OK] {org.slug}: tüm default'lar mevcut (atlandı)")
    return seeded


def main():
    app = create_app()
    with app.app_context():
        print("==> 1. Eksik kolonları kontrol et / ekle")
        ensure_columns()

        print("\n==> 2. Yeni tabloları oluştur (organizations, org_invites)")
        ensure_tables()

        print("\n==> 3. Legacy organization oluştur / al")
        legacy = get_or_create_legacy_org()

        print("\n==> 4. Identity'leri taşı")
        migrate_identities(legacy)

        print("\n==> 5. Diğer veri tablolarını taşı")
        migrate_data_tables(legacy)

        # Owner'ı geriye doğru bağla (organization.owner_id NULL ise)
        if legacy.owner_id is None:
            first_owner = Identity.query.filter_by(
                organization_id=legacy.id, org_role='owner'
            ).first()
            if first_owner:
                legacy.owner_id = first_owner.id
                db.session.commit()
                print(f"\n  [OK] Legacy.owner_id geriye baglandi: {first_owner.email}")

        print("\n==> 6. Tum org'lara default timesheet ayarlarini backfill")
        seeded = backfill_default_settings()
        print(f"  [OK] toplam {seeded} yeni default ayar eklendi")

        print("\n[DONE] Migration tamamlandi.")


if __name__ == '__main__':
    main()
