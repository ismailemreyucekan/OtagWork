"""
organization.py — Workspace yönetimi (üyeler, davetler, plan yükseltme).

Endpoint'ler:
    GET    /organization/me                       — aktif kullanıcının org bilgisi
    POST   /organization/upgrade-to-team          — solo planı team'e yükselt
    GET    /organization/members                  — workspace üyeleri listesi
    POST   /organization/members                  — direkt üye ekle (manager+)
    PUT    /organization/members/<id>/role        — üye rolü değiştir (owner)
    DELETE /organization/members/<id>             — üyeyi çıkar (owner)
    GET    /organization/invites                  — bekleyen davetler
    POST   /organization/invites                  — yeni davet linki üret (manager+)
    DELETE /organization/invites/<id>             — daveti iptal et (manager+)

Tüm yazma işlemleri permission decorator'ları ile korunur.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta

import bcrypt
from flask import Blueprint, request, jsonify, g

from app.models import db, Identity, Organization, OrgInvite
from app.logger import log_operation, log_error, log_success
from app.services import audit
from app.services.permissions import (
    require_auth, require_org_role, require_team_plan, get_current_user,
)
from app.scoping import is_manager, manager_member_ids

organization_bp = Blueprint('organization', __name__)


# ─────────────────────────────────────────────────────────────
# /organization/me — workspace bilgisi
# ─────────────────────────────────────────────────────────────

@organization_bp.route('/organization/me', methods=['GET'])
@require_auth
def get_my_organization():
    user = g.current_user
    org = user.organization
    if not org:
        return jsonify({'success': False, 'message': 'Bağlı workspace bulunamadı'}), 404
    return jsonify({
        'success': True,
        'organization': org.to_dict(),
        'role': user.org_role,
    }), 200


# ─────────────────────────────────────────────────────────────
# /organization/upgrade-to-team — solo → team
# ─────────────────────────────────────────────────────────────

@organization_bp.route('/organization/upgrade-to-team', methods=['POST'])
@require_org_role('owner')
def upgrade_to_team():
    """Solo plan'ı team'e yükseltir. Sadece owner çağırabilir."""
    org = g.current_org
    if org.plan_type == 'team':
        return jsonify({'success': False, 'message': 'Zaten team planındasınız'}), 400

    data = request.get_json() or {}
    new_name = (data.get('team_name') or '').strip()
    if new_name:
        org.name = new_name

    org.plan_type = 'team'
    db.session.commit()
    log_success(f"Organization upgraded to team: {org.slug}")
    audit.record(event='org_upgrade', actor_id=g.current_user.id, target=org.slug)
    db.session.commit()
    return jsonify({'success': True, 'organization': org.to_dict()}), 200


# ─────────────────────────────────────────────────────────────
# /organization/members — üye yönetimi
# ─────────────────────────────────────────────────────────────

@organization_bp.route('/organization/members', methods=['GET'])
@require_auth
def list_members():
    """Workspace üyeleri.

    Admin/owner → org'un tüm aktif üyeleri.
    Yönetici    → yalnız kendi yönettiği takımların üyeleri + kendisi.
    """
    org = g.current_org
    q = Identity.query.filter_by(organization_id=org.id, is_active=True)

    actor = g.current_user
    if is_manager(actor):
        ids = manager_member_ids(actor)
        if ids:
            q = q.filter(Identity.id.in_(ids))
        else:
            return jsonify({'success': True, 'members': [], 'total': 0}), 200

    members = q.order_by(Identity.created_at.asc()).all()
    return jsonify({
        'success': True,
        'members': [m.to_dict() for m in members],
        'total': len(members),
    }), 200


@organization_bp.route('/organization/members', methods=['POST'])
@require_org_role('manager')
@require_team_plan
def add_member_direct():
    """
    Direkt üye ekleme — yönetici e-posta + şifre + rol belirler.
    Yeni kullanıcı bilgileri ile uyarılır (bu noktada front-end mesaj iletmeli).
    """
    try:
        data = request.get_json() or {}
        email = (data.get('email') or '').strip().lower()
        password = data.get('password') or ''
        first_name = (data.get('first_name') or '').strip()
        last_name = (data.get('last_name') or '').strip()
        role = (data.get('role') or 'member').strip()

        if role not in ('manager', 'member'):
            return jsonify({'success': False, 'message': "Rol 'manager' veya 'member' olmalı"}), 400
        if not email or not password or not first_name or not last_name:
            return jsonify({
                'success': False,
                'message': 'E-posta, şifre, ad ve soyad zorunludur',
            }), 400
        if len(password) < 6:
            return jsonify({'success': False, 'message': 'Şifre en az 6 karakter olmalı'}), 400
        if Identity.query.filter_by(email=email).first():
            return jsonify({'success': False, 'message': 'Bu e-posta zaten kayıtlı'}), 409

        identity = Identity(
            email=email,
            password_hash=bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8'),
            first_name=first_name,
            last_name=last_name,
            organization_id=g.current_org.id,
            org_role=role,
            user_type='manager' if role == 'manager' else 'user',  # legacy uyumluluk
        )
        db.session.add(identity)
        db.session.commit()

        log_success(f"Üye eklendi: {email} (org={g.current_org.slug}, role={role})")
        audit.record(
            event='member_added',
            actor_id=g.current_user.id,
            target=email,
            detail=f"role={role}",
        )
        db.session.commit()

        return jsonify({'success': True, 'member': identity.to_dict()}), 201

    except Exception as e:
        db.session.rollback()
        log_error(f"add_member_direct hatası: {e}")
        return jsonify({'success': False, 'message': 'Üye eklenemedi'}), 500


@organization_bp.route('/organization/members/<int:member_id>/role', methods=['PUT'])
@require_org_role('owner')
def update_member_role(member_id):
    """Üye rolü değiştir. Owner kendini değiştiremez (önce başka owner atanmalı)."""
    member = Identity.query.filter_by(
        id=member_id, organization_id=g.current_org.id
    ).first()
    if not member:
        return jsonify({'success': False, 'message': 'Üye bulunamadı'}), 404

    data = request.get_json() or {}
    new_role = (data.get('role') or '').strip()
    if new_role not in ('owner', 'manager', 'member'):
        return jsonify({'success': False, 'message': "Geçersiz rol"}), 400

    # Owner kendini düşürürse: önce başka owner olmalı
    if member.id == g.current_user.id and new_role != 'owner':
        other_owners = Identity.query.filter(
            Identity.organization_id == g.current_org.id,
            Identity.org_role == 'owner',
            Identity.id != member.id,
        ).count()
        if other_owners == 0:
            return jsonify({
                'success': False,
                'message': 'Kendi rolünüzü düşürmek için önce başka bir owner atayın',
            }), 400

    member.org_role = new_role
    # Legacy user_type'i de senkron tut
    member.user_type = {'owner': 'admin', 'manager': 'manager', 'member': 'user'}[new_role]
    db.session.commit()
    audit.record(
        event='member_role_changed',
        actor_id=g.current_user.id,
        target=member.email,
        detail=f"new_role={new_role}",
    )
    db.session.commit()
    return jsonify({'success': True, 'member': member.to_dict()}), 200


@organization_bp.route('/organization/members/<int:member_id>', methods=['DELETE'])
@require_org_role('manager')
def remove_member(member_id):
    """Üyeyi workspace'ten çıkar (soft delete: is_active=False)."""
    member = Identity.query.filter_by(
        id=member_id, organization_id=g.current_org.id
    ).first()
    if not member:
        return jsonify({'success': False, 'message': 'Üye bulunamadı'}), 404

    # Owner çıkarılamaz
    if member.org_role == 'owner':
        return jsonify({
            'success': False,
            'message': 'Workspace sahibi çıkarılamaz. Önce owner devredilmeli.',
        }), 400

    # Manager sadece member çıkarabilir; owner her şeyi
    if g.current_user.org_role == 'manager' and member.org_role == 'manager':
        return jsonify({
            'success': False,
            'message': 'Manager rolündeki birini sadece owner çıkarabilir',
        }), 403

    member.is_active = False
    db.session.commit()
    audit.record(
        event='member_removed',
        actor_id=g.current_user.id,
        target=member.email,
    )
    db.session.commit()
    return jsonify({'success': True}), 200


# ─────────────────────────────────────────────────────────────
# /organization/invites — davet linki
# ─────────────────────────────────────────────────────────────

@organization_bp.route('/organization/invites', methods=['GET'])
@require_org_role('manager')
@require_team_plan
def list_invites():
    """Bekleyen + geçmiş davetler."""
    invites = OrgInvite.query.filter_by(
        organization_id=g.current_org.id
    ).order_by(OrgInvite.created_at.desc()).all()
    return jsonify({
        'success': True,
        'invites': [i.to_dict() for i in invites],
    }), 200


@organization_bp.route('/organization/invites', methods=['POST'])
@require_org_role('manager')
@require_team_plan
def create_invite():
    """Davet linki üretir. Body: { email, role }."""
    try:
        data = request.get_json() or {}
        email = (data.get('email') or '').strip().lower()
        role = (data.get('role') or 'member').strip()

        if not email or '@' not in email:
            return jsonify({'success': False, 'message': 'Geçerli bir e-posta gerekli'}), 400
        if role not in ('manager', 'member'):
            return jsonify({'success': False, 'message': "Rol 'manager' veya 'member' olmalı"}), 400
        if Identity.query.filter_by(email=email).first():
            return jsonify({
                'success': False,
                'message': 'Bu e-posta sistemde kayıtlı. Direkt üye ekleyin veya kullanıcıya giriş yaptırın.',
            }), 409

        # Aynı org + email + bekleyen davet varsa onu döndür (yeniden üretme yok)
        existing = OrgInvite.query.filter_by(
            organization_id=g.current_org.id,
            email=email,
            accepted_at=None,
        ).filter(OrgInvite.expires_at > datetime.utcnow()).first()
        if existing:
            return jsonify({
                'success': True,
                'invite': existing.to_dict(include_token=True),
                'message': 'Bu e-posta için bekleyen bir davet zaten var',
            }), 200

        invite = OrgInvite(
            organization_id=g.current_org.id,
            email=email,
            role=role,
            token=secrets.token_urlsafe(48),
            expires_at=datetime.utcnow() + timedelta(days=7),
            invited_by=g.current_user.id,
        )
        db.session.add(invite)
        db.session.commit()

        log_success(f"Davet üretildi: {email} (org={g.current_org.slug}, role={role})")
        audit.record(
            event='invite_created',
            actor_id=g.current_user.id,
            target=email,
            detail=f"role={role}",
        )
        db.session.commit()
        return jsonify({'success': True, 'invite': invite.to_dict(include_token=True)}), 201

    except Exception as e:
        db.session.rollback()
        log_error(f"create_invite hatası: {e}")
        return jsonify({'success': False, 'message': 'Davet oluşturulamadı'}), 500


@organization_bp.route('/organization/invites/<int:invite_id>', methods=['DELETE'])
@require_org_role('manager')
@require_team_plan
def cancel_invite(invite_id):
    """Davet iptal: kayıt silinir."""
    invite = OrgInvite.query.filter_by(
        id=invite_id, organization_id=g.current_org.id
    ).first()
    if not invite:
        return jsonify({'success': False, 'message': 'Davet bulunamadı'}), 404
    db.session.delete(invite)
    db.session.commit()
    return jsonify({'success': True}), 200
