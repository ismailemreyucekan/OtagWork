"""
migrate_add_notification_prefs.py — Bildirim tercihleri + due-soon dedup kolonları.

SQLAlchemy create_all() var olan tablolara yeni kolon ekleyemez; bu script
manuel ALTER TABLE ile aşağıdaki kolonları idempotent şekilde ekler:

  identities.notify_due_soon      BOOLEAN DEFAULT 1
  identities.due_soon_days        INTEGER DEFAULT 3
  identities.notify_email         BOOLEAN DEFAULT 1
  identities.notif_disabled_types TEXT
  tasks.due_soon_notified_at      DATETIME

Idempotent: zaten var olan kolonları atlar.

Kullanım:
    cd backend
    python -m scripts.migrate_add_notification_prefs
"""
from __future__ import annotations

import sys
from sqlalchemy import text, inspect

sys.path.insert(0, '.')

from app import create_app
from app.models import db

# (tablo, kolon, SQL tipi+default)
# Tipler hem PostgreSQL hem SQLite ile uyumlu seçildi:
#   BOOLEAN DEFAULT TRUE  → Postgres + SQLite (≥3.23)
#   TIMESTAMP             → Postgres + SQLite
NEW_COLUMNS = [
    ('identities', 'notify_due_soon',      'BOOLEAN DEFAULT TRUE'),
    ('identities', 'due_soon_days',        'INTEGER DEFAULT 3'),
    ('identities', 'notify_email',         'BOOLEAN DEFAULT TRUE'),
    ('identities', 'notif_disabled_types', 'TEXT'),
    ('tasks',      'due_soon_notified_at', 'TIMESTAMP'),
]


def ensure_columns():
    insp = inspect(db.engine)
    for table, col, coltype in NEW_COLUMNS:
        if not insp.has_table(table):
            print(f"  [SKIP] tablo yok: {table}")
            continue
        existing = {c['name'] for c in insp.get_columns(table)}
        if col in existing:
            print(f"  [OK] {table}.{col} zaten var")
            continue
        try:
            db.session.execute(text(f'ALTER TABLE {table} ADD COLUMN {col} {coltype}'))
            db.session.commit()
            print(f"  [ADD] {table}.{col} eklendi")
        except Exception as e:
            db.session.rollback()
            print(f"  [ERR] {table}.{col} eklenemedi: {e}")


def main():
    app = create_app()
    with app.app_context():
        print("[*] Bildirim tercihleri kolonlari kontrol ediliyor...")
        ensure_columns()
        # Fresh DB için yeni kolonlu modelleri de garanti et
        db.create_all()
        print("[OK] Tamamlandi.")


if __name__ == '__main__':
    main()
