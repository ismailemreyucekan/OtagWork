"""
permissions.py — Multi-tenant yetkilendirme katmanı.

Sistem stateless: her endpoint, çağrıyı yapan kullanıcının kimliğini
HTTP header'dan ('X-User-Id') veya query/body'den ('user_id') tespit eder.
(Token tabanlı session henüz yok; bu refactor sonrası eklenebilir.)

Sunulan decorator'lar:
    @require_auth            — istek yapan kullanıcı geçerli mi
    @require_org_role(role)  — kullanıcının org_role'u en az `role` mü
                               ('owner' > 'manager' > 'member')
    @require_team_plan       — kullanıcının workspace'i 'team' plan mı
    @scoped_to_org(Model)    — list/get endpoint'lerinde otomatik org filtresi

Kullanım örneği:
    @app.route('/api/tasks', methods=['GET'])
    @require_auth
    def list_tasks():
        user = g.current_user
        query = Task.query.filter_by(organization_id=user.organization_id)
        ...

Yardımcı fonksiyon:
    get_current_user(request) -> Identity | None
        Header / query / body'den user_id'i tespit eder, Identity döner.
"""
from __future__ import annotations

from functools import wraps
from typing import Optional

from flask import request, jsonify, g

from app.models import Identity, Organization
from app.logger import log_error


# Rol hiyerarşisi (sayısal karşılık, büyük > yetki)
ROLE_LEVEL = {'member': 1, 'manager': 2, 'owner': 3}


def get_current_user(req=None) -> Optional[Identity]:
    """
    İstek yapan kullanıcıyı tespit eder. Birden fazla kaynak denenir:
      1. Header 'X-User-Id'
      2. JSON body 'user_id' (POST/PUT)
      3. Query string 'user_id'
      4. JSON body 'identity_id' (timesheet uyumluluğu)
    """
    r = req or request
    uid = None
    try:
        uid = r.headers.get('X-User-Id') or r.args.get('user_id')
        if not uid and r.is_json:
            data = r.get_json(silent=True) or {}
            uid = data.get('user_id') or data.get('identity_id')
    except Exception:
        return None

    if not uid:
        return None

    try:
        uid = int(uid)
    except (ValueError, TypeError):
        return None

    return Identity.query.filter_by(id=uid, is_active=True).first()


# ─────────────────────────────────────────────────────────────
# DECORATOR'LAR
# ─────────────────────────────────────────────────────────────

def require_auth(fn):
    """Geçerli aktif kullanıcı yoksa 401 döner. `g.current_user` set edilir."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({
                'success': False,
                'message': 'Kimlik doğrulama gerekli (user_id eksik veya geçersiz)',
            }), 401
        g.current_user = user
        # Organization eagerly load et — sonraki kontroller için
        g.current_org = user.organization
        return fn(*args, **kwargs)
    return wrapper


def require_org_role(min_role: str):
    """
    En az `min_role` seviyesinde olmayı zorunlu kılar.
    Hiyerarşi: owner (3) > manager (2) > member (1).
    """
    min_level = ROLE_LEVEL.get(min_role, 99)

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = get_current_user()
            if not user:
                return jsonify({'success': False, 'message': 'Kimlik doğrulama gerekli'}), 401
            user_level = ROLE_LEVEL.get(user.org_role, 0)
            if user_level < min_level:
                return jsonify({
                    'success': False,
                    'message': f"Bu işlem en az '{min_role}' yetkisi gerektirir (sizin rolünüz: {user.org_role})",
                }), 403
            g.current_user = user
            g.current_org = user.organization
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def require_team_plan(fn):
    """
    Workspace plan_type='team' değilse 403. Solo plan'da olmayan özellikler
    (takım üyeleri, davet, vb.) için kullanılır.
    """
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({'success': False, 'message': 'Kimlik doğrulama gerekli'}), 401
        org = user.organization
        if not org or org.plan_type != 'team':
            return jsonify({
                'success': False,
                'message': 'Bu özellik takım planı gerektirir. Solo workspace\'inizi yükseltin.',
            }), 403
        g.current_user = user
        g.current_org = org
        return fn(*args, **kwargs)
    return wrapper


def assert_same_org(record, user: Optional[Identity] = None) -> bool:
    """
    Bir kaydın `organization_id`'sinin aktif kullanıcının org'una eşit olduğunu
    kontrol eder. Aksi halde False döner — endpoint 403/404 dönmeli.

    Kullanım:
        if not assert_same_org(task):
            return jsonify({'success': False, 'message': 'Bulunamadı'}), 404
    """
    u = user or getattr(g, 'current_user', None)
    if not u:
        return False
    record_org = getattr(record, 'organization_id', None)
    if record_org is None:
        # Henüz migration yapılmamış legacy kayıtlar için tolerant ol (uygulama
        # tarafından eklenen yeni kayıtlar her zaman org_id'ye sahip).
        return True
    return record_org == u.organization_id
