"""
Bildirim route'ları.
"""
from datetime import datetime
from flask import Blueprint, request, jsonify
from app.models import db, Notification
from app.logger import log_error

notifications_bp = Blueprint('notifications', __name__)


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
