"""
Görev yorum ve aktivite günlüğü route'ları.
"""
from flask import Blueprint, request, jsonify
from app.models import db, Task, TaskComment, TaskActivity, Identity
from app.logger import log_error, log_success
from app.services import notifications as notif
from app.services import activity as act

task_comments_bp = Blueprint('task_comments', __name__)


@task_comments_bp.route('/tasks/<int:task_id>/comments', methods=['GET'])
def list_comments(task_id):
    try:
        Task.query.get_or_404(task_id)
        rows = TaskComment.query.filter_by(task_id=task_id).order_by(TaskComment.created_at.asc()).all()
        return jsonify({'success': True, 'comments': [c.to_dict() for c in rows]}), 200
    except Exception as e:
        log_error(f"Yorum listeleme hatası: {e}")
        return jsonify({'success': False, 'message': 'Yorumlar alınamadı'}), 500


@task_comments_bp.route('/tasks/<int:task_id>/comments', methods=['POST'])
def add_comment(task_id):
    """
    Body: { user_id: int, body: str }
    """
    try:
        task = Task.query.get_or_404(task_id)
        data = request.get_json() or {}
        user_id = data.get('user_id')
        body = (data.get('body') or '').strip()

        if not user_id:
            return jsonify({'success': False, 'message': 'user_id gereklidir'}), 400
        if not body:
            return jsonify({'success': False, 'message': 'Yorum boş olamaz'}), 400
        if not Identity.query.get(user_id):
            return jsonify({'success': False, 'message': 'Kullanıcı bulunamadı'}), 404

        c = TaskComment(task_id=task_id, user_id=int(user_id), body=body)
        db.session.add(c)
        db.session.flush()

        act.log(task_id=task_id, action='commented', actor_id=int(user_id),
                note=body[:200])
        notif.notify_task_comment(task, comment_author_id=int(user_id), comment_excerpt=body)

        db.session.commit()
        log_success(f"Yorum eklendi: Task={task_id}, User={user_id}")
        return jsonify({'success': True, 'comment': c.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        log_error(f"Yorum ekleme hatası: {e}")
        return jsonify({'success': False, 'message': 'Yorum eklenemedi'}), 500


@task_comments_bp.route('/comments/<int:comment_id>', methods=['DELETE'])
def delete_comment(comment_id):
    try:
        c = TaskComment.query.get_or_404(comment_id)
        # Basit yetki: yalnızca yorum sahibi siler (user_id query/body üzerinden)
        data = request.get_json(silent=True) or {}
        requester = data.get('user_id') or request.args.get('user_id', type=int)
        if requester is not None and int(requester) != c.user_id:
            return jsonify({'success': False, 'message': 'Bu yorumu silme yetkiniz yok'}), 403
        db.session.delete(c)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Yorum silindi'}), 200
    except Exception as e:
        db.session.rollback()
        log_error(f"Yorum silme hatası: {e}")
        return jsonify({'success': False, 'message': 'Yorum silinemedi'}), 500


@task_comments_bp.route('/tasks/<int:task_id>/activity', methods=['GET'])
def list_activity(task_id):
    """Görev aktivite günlüğü (audit trail) — eskiden yeniye sırayla."""
    try:
        Task.query.get_or_404(task_id)
        rows = TaskActivity.query.filter_by(task_id=task_id).order_by(TaskActivity.created_at.asc()).all()
        return jsonify({'success': True, 'activities': [r.to_dict() for r in rows]}), 200
    except Exception as e:
        log_error(f"Aktivite listeleme hatası: {e}")
        return jsonify({'success': False, 'message': 'Aktiviteler alınamadı'}), 500


@task_comments_bp.route('/tasks/<int:task_id>/timeline', methods=['GET'])
def task_timeline(task_id):
    """Yorumlar + aktiviteler birleşik kronolojik akış."""
    try:
        Task.query.get_or_404(task_id)
        comments = TaskComment.query.filter_by(task_id=task_id).all()
        activities = TaskActivity.query.filter_by(task_id=task_id).all()

        items = []
        for c in comments:
            items.append({
                'kind': 'comment',
                'created_at': c.created_at.isoformat() if c.created_at else None,
                'data': c.to_dict(),
            })
        for a in activities:
            items.append({
                'kind': 'activity',
                'created_at': a.created_at.isoformat() if a.created_at else None,
                'data': a.to_dict(),
            })
        items.sort(key=lambda x: x['created_at'] or '')
        return jsonify({'success': True, 'timeline': items}), 200
    except Exception as e:
        log_error(f"Timeline hatası: {e}")
        return jsonify({'success': False, 'message': 'Timeline alınamadı'}), 500
