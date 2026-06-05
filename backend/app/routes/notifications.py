"""
Bildirim route'ları.
"""
import json
from datetime import datetime
from flask import Blueprint, request, jsonify
from app.models import db, Notification, Identity
from app.services import notifications as notif_service
from app.logger import log_error

notifications_bp = Blueprint('notifications', __name__)

# Frontend'in göstereceği, kullanıcı tarafından kapatılabilen bildirim tipleri.
# task_due_soon kendi master anahtarıyla (notify_due_soon) yönetilir.
TOGGLEABLE_TYPES = [
    'task_assigned', 'task_approved', 'task_rejected', 'task_status_changed',
    'extension_requested', 'extension_approved', 'extension_rejected',
    'timesheet_submitted', 'timesheet_approved', 'timesheet_rejected',
    'comment_added',
]


@notifications_bp.route('/notifications', methods=['GET'])
def list_notifications():
    """
    Kullanıcının bildirimlerini listeler.
    Query params:
      - user_id (zorunlu)
      - unread_only=true → sadece okunmamışlar
      - limit (default 50)
    """
    try:
        user_id = request.args.get('user_id', type=int)
        if not user_id:
            return jsonify({'success': False, 'message': 'user_id gereklidir'}), 400

        unread_only = request.args.get('unread_only', '').lower() == 'true'
        limit = request.args.get('limit', default=50, type=int)
        limit = max(1, min(limit, 200))

        q = Notification.query.filter_by(user_id=user_id)
        if unread_only:
            q = q.filter(Notification.read_at.is_(None))

        items = q.order_by(Notification.created_at.desc()).limit(limit).all()
        unread_count = Notification.query.filter_by(user_id=user_id).filter(
            Notification.read_at.is_(None)
        ).count()

        return jsonify({
            'success': True,
            'notifications': [n.to_dict() for n in items],
            'unread_count': unread_count,
        }), 200
    except Exception as e:
        log_error(f"Bildirim listesi hatası: {e}")
        return jsonify({'success': False, 'message': 'Bildirimler alınamadı'}), 500


@notifications_bp.route('/notifications/unread-count', methods=['GET'])
def unread_count():
    """Sadece okunmamış sayacı (polling için hafif uç)."""
    try:
        user_id = request.args.get('user_id', type=int)
        if not user_id:
            return jsonify({'success': False, 'message': 'user_id gereklidir'}), 400
        count = Notification.query.filter_by(user_id=user_id).filter(
            Notification.read_at.is_(None)
        ).count()
        return jsonify({'success': True, 'unread_count': count}), 200
    except Exception as e:
        log_error(f"Okunmamış sayım hatası: {e}")
        return jsonify({'success': False, 'message': 'Sayım alınamadı'}), 500


@notifications_bp.route('/notifications/<int:notif_id>/read', methods=['PUT'])
def mark_read(notif_id):
    """Tek bildirimi okundu olarak işaretle."""
    try:
        n = Notification.query.get_or_404(notif_id)
        if n.read_at is None:
            n.read_at = datetime.utcnow()
            db.session.commit()
        return jsonify({'success': True, 'notification': n.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        log_error(f"Bildirim okundu işaretleme hatası: {e}")
        return jsonify({'success': False, 'message': 'İşlem başarısız'}), 500


@notifications_bp.route('/notifications/read-all', methods=['PUT'])
def mark_all_read():
    """Kullanıcının tüm okunmamış bildirimlerini okundu yap."""
    try:
        data = request.get_json() or {}
        user_id = data.get('user_id') or request.args.get('user_id', type=int)
        if not user_id:
            return jsonify({'success': False, 'message': 'user_id gereklidir'}), 400

        now = datetime.utcnow()
        updated = Notification.query.filter_by(user_id=int(user_id)).filter(
            Notification.read_at.is_(None)
        ).update({'read_at': now}, synchronize_session=False)
        db.session.commit()
        return jsonify({'success': True, 'updated': updated}), 200
    except Exception as e:
        db.session.rollback()
        log_error(f"Tümünü okundu yapma hatası: {e}")
        return jsonify({'success': False, 'message': 'İşlem başarısız'}), 500


@notifications_bp.route('/notifications/preferences', methods=['GET'])
def get_preferences():
    """Kullanıcının bildirim tercihlerini döner."""
    try:
        user_id = request.args.get('user_id', type=int)
        if not user_id:
            return jsonify({'success': False, 'message': 'user_id gereklidir'}), 400
        user = Identity.query.get(user_id)
        if not user:
            return jsonify({'success': False, 'message': 'Kullanıcı bulunamadı'}), 404
        return jsonify({
            'success': True,
            'preferences': user.notification_preferences(),
            'toggleable_types': TOGGLEABLE_TYPES,
        }), 200
    except Exception as e:
        log_error(f"Tercih getirme hatası: {e}")
        return jsonify({'success': False, 'message': 'Tercihler alınamadı'}), 500


@notifications_bp.route('/notifications/preferences', methods=['PUT'])
def update_preferences():
    """Kullanıcının bildirim tercihlerini günceller.

    Body: {
      user_id, notify_due_soon?, due_soon_days?, notify_email?, disabled_types?
    }
    """
    try:
        data = request.get_json() or {}
        user_id = data.get('user_id') or request.args.get('user_id', type=int)
        if not user_id:
            return jsonify({'success': False, 'message': 'user_id gereklidir'}), 400
        user = Identity.query.get(int(user_id))
        if not user:
            return jsonify({'success': False, 'message': 'Kullanıcı bulunamadı'}), 404

        if 'notify_due_soon' in data:
            user.notify_due_soon = bool(data['notify_due_soon'])
        if 'due_soon_days' in data:
            try:
                d = int(data['due_soon_days'])
                user.due_soon_days = max(0, min(d, 30))  # 0–30 gün makul aralık
            except (ValueError, TypeError):
                pass
        if 'notify_email' in data:
            user.notify_email = bool(data['notify_email'])
        if 'disabled_types' in data and isinstance(data['disabled_types'], list):
            # Sadece bilinen tipleri kaydet
            cleaned = [t for t in data['disabled_types'] if t in TOGGLEABLE_TYPES]
            user.notif_disabled_types = json.dumps(cleaned)

        db.session.commit()
        return jsonify({'success': True, 'preferences': user.notification_preferences()}), 200
    except Exception as e:
        db.session.rollback()
        log_error(f"Tercih güncelleme hatası: {e}")
        return jsonify({'success': False, 'message': 'Tercihler güncellenemedi'}), 500


@notifications_bp.route('/notifications/scan-due-soon', methods=['POST'])
def scan_due_soon():
    """Yaklaşan son tarih taraması.

    Body: { user_id }  → sadece o kullanıcı için tarar.
    user_id yoksa → tüm aktif kullanıcılar (cron kullanımı).
    Dedup sayesinde sık çağrılması güvenlidir.
    """
    try:
        data = request.get_json(silent=True) or {}
        user_id = data.get('user_id') or request.args.get('user_id', type=int)
        if user_id:
            created = notif_service.scan_due_soon_for_user(int(user_id))
        else:
            created = notif_service.scan_due_soon_all()
        return jsonify({'success': True, 'created': created}), 200
    except Exception as e:
        log_error(f"Due-soon scan route hatası: {e}")
        return jsonify({'success': False, 'message': 'Tarama başarısız'}), 500


@notifications_bp.route('/notifications/<int:notif_id>', methods=['DELETE'])
def delete_notification(notif_id):
    """Bildirimi sil."""
    try:
        n = Notification.query.get_or_404(notif_id)
        db.session.delete(n)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Bildirim silindi'}), 200
    except Exception as e:
        db.session.rollback()
        log_error(f"Bildirim silme hatası: {e}")
        return jsonify({'success': False, 'message': 'Bildirim silinemedi'}), 500
