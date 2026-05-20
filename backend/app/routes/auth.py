"""
Kimlik doğrulama route'ları
"""
from flask import Blueprint, request, jsonify
import bcrypt
from app.models import db, Identity
from app.logger import log_operation, log_error, log_success
from app.services import audit
from app.services.rate_limit import rate_limit

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/login', methods=['POST'])
@rate_limit(max_calls=8, period_seconds=60, scope='login')
def login():
    """Kullanıcı veya admin girişi"""
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')
        user_type = data.get('user_type')
        
        log_operation("Login isteği", f"Email: {email}, Tip: {user_type}")
        
        if not email or not password or not user_type:
            log_error("Login başarısız - Eksik bilgi")
            return jsonify({
                'success': False,
                'message': 'E-posta, şifre ve kullanıcı tipi gereklidir'
            }), 400
        
        # Kullanıcı tipi kontrolü: 'user' girişi ile manager'lar da giriş yapabilir
        if user_type == 'user':
            # 'user' girişi ile hem 'user' hem de 'manager' rolündeki kullanıcılar giriş yapabilir
            identity = Identity.query.filter(
                Identity.email == email,
                Identity.user_type.in_(['user', 'manager'])
            ).first()
        else:
            # 'admin' girişi için sadece admin rolündeki kullanıcılar
            identity = Identity.query.filter_by(email=email, user_type=user_type).first()
        
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
        
        # 2FA aktifse ikinci adıma yönlendir
        if identity.totp_enabled:
            log_success(f"Login 1. adım OK, 2FA bekleniyor - {identity.email}")
            audit.record(event='login_success', actor_id=identity.id, target=email,
                         detail='2FA bekliyor')
            db.session.commit()
            return jsonify({
                'success': True,
                '2fa_required': True,
                'user_id': identity.id,
                'message': '2FA kodu gerekli',
            }), 200

        log_success(f"Login başarılı - {identity.first_name} {identity.last_name} ({email})")
        audit.record(event='login_success', actor_id=identity.id, target=email)
        db.session.commit()
        return jsonify({
            'success': True,
            'message': 'Giriş başarılı',
            'user': {
                'id': identity.id,
                'email': identity.email,
                'first_name': identity.first_name,
                'last_name': identity.last_name,
                'user_type': identity.user_type
            }
        }), 200
        
    except Exception as e:
        log_error(f"Login hatası: {e}")
        return jsonify({
            'success': False,
            'message': 'Bir hata oluştu'
        }), 500

