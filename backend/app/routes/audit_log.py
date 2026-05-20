"""
Admin için sistem audit log listeleme.
"""
from flask import Blueprint, request, jsonify
from app.models import SystemAudit, Identity
from app.logger import log_error

audit_log_bp = Blueprint('audit_log', __name__)


@audit_log_bp.route('/audit', methods=['GET'])
def list_audit():
    """
    Query:
      requester_id (admin yetkisi için)
      event        — opsiyonel tip filtresi
      limit        — varsayılan 100, max 500
    """
    try:
        requester_id = request.args.get('requester_id', type=int)
        if not requester_id:
            return jsonify({'success': False, 'message': 'requester_id gereklidir'}), 400

        requester = Identity.query.get(requester_id)
        if not requester or requester.user_type != 'admin':
            return jsonify({'success': False, 'message': 'Yetkisiz'}), 403

        q = SystemAudit.query
        event = request.args.get('event')
        if event:
            q = q.filter(SystemAudit.event == event)

        limit = request.args.get('limit', default=100, type=int)
        limit = max(1, min(limit, 500))

        rows = q.order_by(SystemAudit.created_at.desc()).limit(limit).all()
        return jsonify({'success': True, 'entries': [r.to_dict() for r in rows]}), 200
    except Exception as e:
        log_error(f"Audit listeleme hatası: {e}")
        return jsonify({'success': False, 'message': 'Audit log alınamadı'}), 500
