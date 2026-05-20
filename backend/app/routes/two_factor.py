"""
İki Faktörlü Doğrulama (TOTP) endpoint'leri.

  POST /auth/2fa/setup    { user_id }              → secret + provisioning URI
  POST /auth/2fa/enable   { user_id, code }        → setup sonrası kodu doğrula ve aktive et
  POST /auth/2fa/disable  { user_id, code }        → 2FA'yı kapat
  POST /auth/2fa/verify   { user_id, code }        → login ikinci adımı

Frontend login akışı:
  1) POST /login → response 2fa_required=true ise oturumu açma
  2) POST /auth/2fa/verify → success ise oturumu kabul et
"""
from flask import Blueprint, request, jsonify
from app.models import db, Identity
from app.logger import log_error, log_success
from app.services import totp, audit
from app.services.rate_limit import rate_limit

two_factor_bp = Blueprint('two_factor', __name__)


@two_factor_bp.route('/auth/2fa/setup', methods=['POST'])
def setup():
    """Kullanıcı için yeni TOTP secret üretir (henüz aktive ETMEZ)."""
    try:
        data = request.get_json() or {}
        user_id = data.get('user_id')
        if not user_id:
            return jsonify({'success': False, 'message': 'user_id gereklidir'}), 400
        u = Identity.query.get_or_404(int(user_id))

        secret = totp.generate_secret()
        u.totp_secret = secret
        # Aktivasyon enable çağrısıyla olur — şu an sadece secret'i yazdık.
        u.totp_enabled = False
        db.session.commit()

        uri = totp.provisioning_uri(secret, account_name=u.email)
        return jsonify({
            'success': True,
            'secret': secret,
            'provisioning_uri': uri,
        }), 200
    except Exception as e:
        db.session.rollback()
        log_error(f"2FA setup hatası: {e}")
        return jsonify({'success': False, 'message': '2FA kurulamadı'}), 500


@two_factor_bp.route('/auth/2fa/enable', methods=['POST'])
def enable():
    """Setup sonrası kullanıcının verdiği kod ile aktivasyonu tamamla."""
    try:
        data = request.get_json() or {}
        user_id = data.get('user_id')
        code = (data.get('code') or '').strip()

        if not user_id or not code:
            return jsonify({'success': False, 'message': 'user_id ve code gereklidir'}), 400

        u = Identity.query.get_or_404(int(user_id))
        if not u.totp_secret:
            return jsonify({'success': False, 'message': 'Önce setup çağrısı yapılmalı'}), 400

        if not totp.verify(u.totp_secret, code):
            return jsonify({'success': False, 'message': 'Kod hatalı veya süresi dolmuş'}), 401

        u.totp_enabled = True
        audit.record(event='2fa_enabled', actor_id=u.id, target=u.email)
        db.session.commit()
        log_success(f"2FA aktive edildi: {u.email}")
        return jsonify({'success': True, 'message': '2FA aktive edildi'}), 200
    except Exception as e:
        db.session.rollback()
        log_error(f"2FA enable hatası: {e}")
        return jsonify({'success': False, 'message': '2FA aktive edilemedi'}), 500


@two_factor_bp.route('/auth/2fa/disable', methods=['POST'])
def disable():
    """Kullanıcı kodla doğrulayarak 2FA'yı kapatır."""
    try:
        data = request.get_json() or {}
        user_id = data.get('user_id')
        code = (data.get('code') or '').strip()

        if not user_id or not code:
            return jsonify({'success': False, 'message': 'user_id ve code gereklidir'}), 400

        u = Identity.query.get_or_404(int(user_id))
        if not u.totp_enabled or not u.totp_secret:
            return jsonify({'success': False, 'message': '2FA zaten aktif değil'}), 400

        if not totp.verify(u.totp_secret, code):
            return jsonify({'success': False, 'message': 'Kod hatalı'}), 401

        u.totp_enabled = False
        u.totp_secret = None
        audit.record(event='2fa_disabled', actor_id=u.id, target=u.email)
        db.session.commit()
        log_success(f"2FA devre dışı bırakıldı: {u.email}")
        return jsonify({'success': True, 'message': '2FA devre dışı'}), 200
    except Exception as e:
        db.session.rollback()
        log_error(f"2FA disable hatası: {e}")
        return jsonify({'success': False, 'message': '2FA kapatılamadı'}), 500


@two_factor_bp.route('/auth/2fa/verify', methods=['POST'])
@rate_limit(max_calls=8, period_seconds=60, scope='2fa-verify')
def verify_login():
    """Login akışının ikinci adımı: kod doğrula ve kullanıcı bilgisini döndür."""
    try:
        data = request.get_json() or {}
        user_id = data.get('user_id')
        code = (data.get('code') or '').strip()

        if not user_id or not code:
            return jsonify({'success': False, 'message': 'user_id ve code gereklidir'}), 400

        u = Identity.query.get_or_404(int(user_id))
        if not u.totp_enabled or not u.totp_secret:
            return jsonify({'success': False, 'message': '2FA aktif değil'}), 400

        if not totp.verify(u.totp_secret, code):
            audit.record(event='2fa_failed', actor_id=u.id, target=u.email)
            db.session.commit()
            return jsonify({'success': False, 'message': 'Kod hatalı'}), 401

        audit.record(event='2fa_verified', actor_id=u.id, target=u.email)
        db.session.commit()
        log_success(f"2FA doğrulandı: {u.email}")
        return jsonify({
            'success': True,
            'user': {
                'id': u.id, 'email': u.email,
                'first_name': u.first_name, 'last_name': u.last_name,
                'user_type': u.user_type,
            }
        }), 200
    except Exception as e:
        log_error(f"2FA verify hatası: {e}")
        return jsonify({'success': False, 'message': 'Doğrulama başarısız'}), 500
