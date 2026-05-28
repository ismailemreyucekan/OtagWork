"""
Kimlik doğrulama route'ları — login + multi-tenant signup (solo/team/invite)
"""
import re
import secrets
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify
import bcrypt
from app.models import db, Identity, Organization, OrgInvite, TimesheetSetting
from app.logger import log_operation, log_error, log_success
from app.services import audit
from app.services.rate_limit import rate_limit


# Default timesheet ayarları — yeni org oluşturulduğunda otomatik seed edilir.
# Tüm 3 tip (project / activity_type / work_mode) için genel kullanıma uygun başlangıç değerleri.
# Kullanıcı sonradan ekleyebilir/silebilir/düzenleyebilir.
DEFAULT_PROJECTS = [
    ('Genel',         10),
    ('İç İşler',      20),
    ('Müşteri İşleri', 30),
]
DEFAULT_ACTIVITY_TYPES = [
    ('Geliştirme', 10),
    ('Toplantı',    20),
    ('Araştırma',   30),
    ('Eğitim',      40),
    ('Bakım',       50),
    ('İzin',        60),
    ('Diğer',       70),
]
DEFAULT_WORK_MODES = [
    ('Ofis',          10),
    ('Uzaktan',       20),
    ('Hibrit',        30),
    ('Müşteri Ofisi', 40),
]

# Tip → default değerler eşlemesi (backfill ve seed için ortak)
DEFAULT_SETTINGS_BY_TYPE = {
    'project':       DEFAULT_PROJECTS,
    'activity_type': DEFAULT_ACTIVITY_TYPES,
    'work_mode':     DEFAULT_WORK_MODES,
}


def _seed_default_settings(org_id: int) -> None:
    """
    Verilen org için **eksik** default ayarları üretir. Idempotent:
    aynı tip+değer zaten varsa atlanır (yeniden eklemez).
    """
    existing = {
        (s.setting_type, s.value)
        for s in TimesheetSetting.query.filter_by(organization_id=org_id).all()
    }
    for setting_type, defaults in DEFAULT_SETTINGS_BY_TYPE.items():
        for value, order in defaults:
            if (setting_type, value) in existing:
                continue
            db.session.add(TimesheetSetting(
                organization_id=org_id,
                setting_type=setting_type,
                value=value,
                display_order=order,
                is_active=True,
            ))

auth_bp = Blueprint('auth', __name__)


# ─────────────────────────────────────────────────────────────
# Yardımcılar
# ─────────────────────────────────────────────────────────────

def _slugify(text: str) -> str:
    """Workspace slug üretici — küçük harf, alfanumerik + tire."""
    text = (text or '').lower().strip()
    text = re.sub(r'[^a-z0-9]+', '-', text)
    text = re.sub(r'-+', '-', text).strip('-')
    return text or 'workspace'


def _unique_slug(base: str) -> str:
    """Aynı slug varsa sonuna -2, -3 ... ekler."""
    slug = _slugify(base)
    if not Organization.query.filter_by(slug=slug).first():
        return slug
    i = 2
    while Organization.query.filter_by(slug=f'{slug}-{i}').first():
        i += 1
    return f'{slug}-{i}'


def _hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def _build_login_response(identity: Identity, message: str = 'Giriş başarılı'):
    """Login/signup başarısında ortak response yapısı."""
    org = identity.organization
    return jsonify({
        'success': True,
        'message': message,
        'user': {
            'id': identity.id,
            'email': identity.email,
            'first_name': identity.first_name,
            'last_name': identity.last_name,
            'user_type': identity.user_type,         # legacy
            'org_role': identity.org_role,            # yeni
            'organization_id': identity.organization_id,
        },
        'organization': org.to_dict() if org else None,
    }), 200

@auth_bp.route('/login', methods=['POST'])
@rate_limit(max_calls=8, period_seconds=60, scope='login')
def login():
    """Kullanıcı veya admin girişi"""
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')
        user_type = data.get('user_type')  # opsiyonel — geriye dönük uyumluluk için tutuldu

        log_operation("Login isteği", f"Email: {email}, Tip: {user_type or '—'}")

        if not email or not password:
            log_error("Login başarısız - Eksik bilgi")
            return jsonify({
                'success': False,
                'message': 'E-posta ve şifre gereklidir'
            }), 400

        # Tek-giriş akışı: email tabanlı arama yapılır, tip bilgisi yanıtta döner.
        # Eğer çağıran taraf user_type gönderdiyse ekstra filtre olarak uygulanır
        # (eski iki-form akışıyla geriye dönük uyumluluk için).
        query = Identity.query.filter(Identity.email == email)
        if user_type == 'admin':
            query = query.filter(Identity.user_type == 'admin')
        elif user_type == 'user':
            query = query.filter(Identity.user_type.in_(['user', 'manager']))
        identity = query.first()
        
        if not identity or not identity.is_active:
            log_error(f"Login başarısız - Kullanıcı bulunamadı veya aktif değil: {email}")
            audit.record(event='login_failed', target=email, detail='Kullanıcı yok / pasif')
            db.session.commit()
            return jsonify({
                'success': False,
                'message': 'E-posta veya şifre hatalı'
            }), 401

        if not bcrypt.checkpw(password.encode('utf-8'), identity.password_hash.encode('utf-8')):
            log_error(f"Login başarısız - Şifre hatalı: {email}")
            audit.record(event='login_failed', actor_id=identity.id, target=email, detail='Şifre hatalı')
            db.session.commit()
            return jsonify({
                'success': False,
                'message': 'E-posta veya şifre hatalı'
            }), 401
        
        log_success(f"Login başarılı - {identity.first_name} {identity.last_name} ({email})")
        audit.record(event='login_success', actor_id=identity.id, target=email)
        db.session.commit()
        return _build_login_response(identity)

    except Exception as e:
        log_error(f"Login hatası: {e}")
        return jsonify({
            'success': False,
            'message': 'Bir hata oluştu'
        }), 500


# ─────────────────────────────────────────────────────────────
# SIGNUP — bireysel (solo) ve takım (team) self-registration
# ─────────────────────────────────────────────────────────────

def _validate_signup_payload(data: dict, require_team_name: bool = False):
    """Ortak signup doğrulama. (None, response) döner — None ise OK."""
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    first_name = (data.get('first_name') or '').strip()
    last_name = (data.get('last_name') or '').strip()

    if not email or not password or not first_name or not last_name:
        return None, (jsonify({
            'success': False,
            'message': 'E-posta, şifre, ad ve soyad zorunludur',
        }), 400)
    if len(password) < 6:
        return None, (jsonify({
            'success': False,
            'message': 'Şifre en az 6 karakter olmalı',
        }), 400)
    if require_team_name and not (data.get('team_name') or '').strip():
        return None, (jsonify({
            'success': False,
            'message': 'Takım adı zorunludur',
        }), 400)
    if Identity.query.filter_by(email=email).first():
        return None, (jsonify({
            'success': False,
            'message': 'Bu e-posta zaten kayıtlı',
        }), 409)

    return {
        'email': email,
        'password': password,
        'first_name': first_name,
        'last_name': last_name,
    }, None


@auth_bp.route('/auth/register-solo', methods=['POST'])
@rate_limit(max_calls=5, period_seconds=60, scope='register')
def register_solo():
    """Bireysel kayıt: yeni 1-kişilik 'solo' workspace + owner kullanıcı."""
    try:
        data = request.get_json() or {}
        parsed, err = _validate_signup_payload(data)
        if err:
            return err

        # 1) Önce Identity oluştur (organization_id NULL olarak — sonra atayacağız)
        identity = Identity(
            email=parsed['email'],
            password_hash=_hash_password(parsed['password']),
            first_name=parsed['first_name'],
            last_name=parsed['last_name'],
            user_type='admin',         # legacy: solo kullanıcı kendi workspace'inin admini
            org_role='owner',
        )
        db.session.add(identity)
        db.session.flush()  # identity.id alabilmek için

        # 2) Solo organization oluştur
        org_name = f"{parsed['first_name']}'in Çalışma Alanı"
        org = Organization(
            name=org_name,
            slug=_unique_slug(f"{parsed['first_name']}-{parsed['last_name']}"),
            plan_type='solo',
            owner_id=identity.id,
        )
        db.session.add(org)
        db.session.flush()

        # 3) Identity'yi org'a bağla
        identity.organization_id = org.id
        # 4) Default timesheet ayarları (activity_type + work_mode)
        _seed_default_settings(org.id)
        db.session.commit()

        log_success(f"Solo signup - {identity.email} (org={org.slug})")
        audit.record(event='signup_solo', actor_id=identity.id, target=identity.email)
        db.session.commit()

        return _build_login_response(identity, 'Hesap oluşturuldu')

    except Exception as e:
        db.session.rollback()
        log_error(f"register_solo hatası: {e}")
        return jsonify({'success': False, 'message': 'Kayıt oluşturulamadı'}), 500


@auth_bp.route('/auth/register-team', methods=['POST'])
@rate_limit(max_calls=5, period_seconds=60, scope='register')
def register_team():
    """Takım kuran kayıt: yeni 'team' workspace + owner kullanıcı."""
    try:
        data = request.get_json() or {}
        parsed, err = _validate_signup_payload(data, require_team_name=True)
        if err:
            return err

        team_name = data['team_name'].strip()

        # 1) Identity
        identity = Identity(
            email=parsed['email'],
            password_hash=_hash_password(parsed['password']),
            first_name=parsed['first_name'],
            last_name=parsed['last_name'],
            user_type='admin',
            org_role='owner',
        )
        db.session.add(identity)
        db.session.flush()

        # 2) Team organization
        org = Organization(
            name=team_name,
            slug=_unique_slug(team_name),
            plan_type='team',
            owner_id=identity.id,
        )
        db.session.add(org)
        db.session.flush()

        identity.organization_id = org.id
        _seed_default_settings(org.id)
        db.session.commit()

        log_success(f"Team signup - {identity.email} (org={org.slug}, name={team_name})")
        audit.record(event='signup_team', actor_id=identity.id, target=identity.email, detail=f"org={org.slug}")
        db.session.commit()

        return _build_login_response(identity, 'Takım çalışma alanı oluşturuldu')

    except Exception as e:
        db.session.rollback()
        log_error(f"register_team hatası: {e}")
        return jsonify({'success': False, 'message': 'Takım oluşturulamadı'}), 500


# ─────────────────────────────────────────────────────────────
# DAVET LİNKİ — token ile katılma
# ─────────────────────────────────────────────────────────────

@auth_bp.route('/auth/invite/<token>', methods=['GET'])
def get_invite(token):
    """Token'a ait davet bilgilerini döndürür (preview için, login öncesi)."""
    invite = OrgInvite.query.filter_by(token=token).first()
    if not invite:
        return jsonify({'success': False, 'message': 'Davet bulunamadı'}), 404
    if not invite.is_valid():
        return jsonify({
            'success': False,
            'message': 'Bu davet artık geçerli değil (kullanılmış veya süresi dolmuş)',
            'invite': invite.to_dict(),
        }), 410

    return jsonify({'success': True, 'invite': invite.to_dict()}), 200


@auth_bp.route('/auth/accept-invite', methods=['POST'])
@rate_limit(max_calls=5, period_seconds=60, scope='accept_invite')
def accept_invite():
    """
    Davet linki ile kayıt:
    Body: { token, password, first_name, last_name }
    """
    try:
        data = request.get_json() or {}
        token = (data.get('token') or '').strip()
        password = data.get('password') or ''
        first_name = (data.get('first_name') or '').strip()
        last_name = (data.get('last_name') or '').strip()

        if not token or not password or not first_name or not last_name:
            return jsonify({
                'success': False,
                'message': 'Token, şifre, ad ve soyad zorunludur',
            }), 400
        if len(password) < 6:
            return jsonify({'success': False, 'message': 'Şifre en az 6 karakter olmalı'}), 400

        invite = OrgInvite.query.filter_by(token=token).first()
        if not invite or not invite.is_valid():
            return jsonify({
                'success': False,
                'message': 'Davet geçersiz veya süresi dolmuş',
            }), 410

        # Aynı e-posta zaten varsa hata ver
        existing = Identity.query.filter_by(email=invite.email).first()
        if existing:
            return jsonify({
                'success': False,
                'message': 'Bu e-posta zaten kayıtlı. Lütfen mevcut hesapla giriş yapın.',
            }), 409

        # Identity oluştur
        identity = Identity(
            email=invite.email,
            password_hash=_hash_password(password),
            first_name=first_name,
            last_name=last_name,
            organization_id=invite.organization_id,
            org_role=invite.role,                # 'manager' veya 'member'
            user_type='manager' if invite.role == 'manager' else 'user',  # legacy uyumluluk
        )
        db.session.add(identity)

        # Davet tüketildi
        invite.accepted_at = datetime.utcnow()
        db.session.commit()

        log_success(f"Davet kabul edildi: {identity.email} (org={invite.organization_id}, role={invite.role})")
        audit.record(
            event='invite_accepted',
            actor_id=identity.id,
            target=identity.email,
            detail=f"org={invite.organization_id}",
        )
        db.session.commit()

        return _build_login_response(identity, 'Hesap oluşturuldu ve workspace\'e katıldınız')

    except Exception as e:
        db.session.rollback()
        log_error(f"accept_invite hatası: {e}")
        return jsonify({'success': False, 'message': 'Davet kabul edilemedi'}), 500

