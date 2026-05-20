"""
Şifre sıfırlama akışı.
  POST /auth/forgot-password  { email }            → token üret ve e-posta yolla
  POST /auth/reset-password   { token, new_password } → yeni şifre kaydet
"""
import secrets
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, current_app
import bcrypt
from app.models import db, Identity, PasswordResetToken
from app.logger import log_error, log_success, log_operation
from app.services import mailer, audit
from app.services.rate_limit import rate_limit

password_reset_bp = Blueprint('password_reset', __name__)

TOKEN_TTL_HOURS = 1


@password_reset_bp.route('/auth/forgot-password', methods=['POST'])
@rate_limit(max_calls=3, period_seconds=300, scope='forgot')
def forgot_password():
    """
    Body: { email }
    Güvenlik: kullanıcı bulunsa da bulunmasa da aynı mesajı döner
              (e-posta varlığını sızdırmamak için).
    """
    try:
        data = request.get_json() or {}
        email = (data.get('email') or '').strip().lower()
        if not email:
            return jsonify({'success': False, 'message': 'E-posta gereklidir'}), 400

        identity = Identity.query.filter(db.func.lower(Identity.email) == email).first()

        if identity and identity.is_active:
            # Eski geçerli tokenleri iptal et
            old = PasswordResetToken.query.filter_by(identity_id=identity.id, used_at=None).all()
            for o in old:
                o.used_at = datetime.utcnow()  # logical revoke

            token = secrets.token_urlsafe(48)
            prt = PasswordResetToken(
                identity_id=identity.id,
                token=token,
                expires_at=datetime.utcnow() + timedelta(hours=TOKEN_TTL_HOURS),
            )
            db.session.add(prt)
            db.session.commit()

            frontend = current_app.config.get('FRONTEND_URL', 'http://localhost:5173')
            link = f'{frontend}/?reset_token={token}'

            mailer.send_email(
                to=identity.email,
                subject='Şifre sıfırlama isteği — İş Akış Yönetim Sistemi',
                body_text=(
                    f'Merhaba {identity.first_name},\n\n'
                    'Hesabınız için bir şifre sıfırlama talebi aldık.\n\n'
                    f'Aşağıdaki bağlantı 1 saat geçerlidir:\n{link}\n\n'
                    f'Talepte bulunmadıysanız bu e-postayı yok sayabilirsiniz.\n\n'
                    '— İş Akış Yönetim Sistemi'
                ),
            )
            audit.record(event='password_reset_requested', actor_id=identity.id, target=identity.email)
            db.session.commit()
            log_success(f"Şifre sıfırlama tokeni üretildi: {identity.email}")

        # Her durumda aynı yanıt (enumeration koruması)
        return jsonify({
            'success': True,
            'message': 'Eğer bu e-posta sistemde kayıtlıysa, sıfırlama bağlantısı gönderildi.'
        }), 200
    except Exception as e:
        db.session.rollback()
        log_error(f"Şifre sıfırlama isteği hatası: {e}")
        return jsonify({'success': False, 'message': 'Bir hata oluştu'}), 500


@password_reset_bp.route('/auth/reset-password', methods=['POST'])
def reset_password():
    """Body: { token, new_password }"""
    try:
        data = request.get_json() or {}
        token = (data.get('token') or '').strip()
        new_password = data.get('new_password') or ''

        if not token or not new_password:
            return jsonify({'success': False, 'message': 'Token ve yeni şifre gereklidir'}), 400
        if len(new_password) < 6:
            return jsonify({'success': False, 'message': 'Şifre en az 6 karakter olmalıdır'}), 400

        prt = PasswordResetToken.query.filter_by(token=token).first()
        if not prt:
            return jsonify({'success': False, 'message': 'Geçersiz token'}), 400
        if prt.used_at:
            return jsonify({'success': False, 'message': 'Bu token zaten kullanılmış'}), 400
        if prt.expires_at < datetime.utcnow():
            return jsonify({'success': False, 'message': 'Tokenin süresi dolmuş'}), 400

        identity = Identity.query.get(prt.identity_id)
        if not identity or not identity.is_active:
            return jsonify({'success': False, 'message': 'Kullanıcı bulunamadı'}), 404

        # Şifreyi güncelle
        hashed = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt())
        identity.password_hash = hashed.decode('utf-8')
        prt.used_at = datetime.utcnow()

        audit.record(event='password_reset_done', actor_id=identity.id, target=identity.email)
        db.session.commit()
        log_success(f"Şifre sıfırlandı: {identity.email}")

        return jsonify({'success': True, 'message': 'Şifre başarıyla güncellendi'}), 200
    except Exception as e:
        db.session.rollback()
        log_error(f"Şifre sıfırlama hatası: {e}")
        return jsonify({'success': False, 'message': 'Şifre güncellenemedi'}), 500
