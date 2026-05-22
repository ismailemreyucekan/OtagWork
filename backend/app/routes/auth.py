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

