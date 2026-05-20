"""
Etiket (Tag) CRUD + görev-etiket ilişkisi + global arama.
"""
from flask import Blueprint, request, jsonify
from sqlalchemy import or_, func
from app.models import db, Tag, TaskTag, Task, Project, Identity
from app.logger import log_error

tags_search_bp = Blueprint('tags_search', __name__)


# ─── Etiket CRUD ─────────────────────────────────────────────

@tags_search_bp.route('/tags', methods=['GET'])
def list_tags():
    try:
        rows = Tag.query.order_by(Tag.name.asc()).all()
        return jsonify({'success': True, 'tags': [r.to_dict() for r in rows]}), 200
    except Exception as e:
        log_error(f"Etiket listeleme hatası: {e}")
        return jsonify({'success': False, 'message': 'Etiketler alınamadı'}), 500


@tags_search_bp.route('/tags', methods=['POST'])
def create_tag():
    """Body: { name, color? }"""
    try:
        data = request.get_json() or {}
        name = (data.get('name') or '').strip()
        color = (data.get('color') or '#FFD700').strip()
        if not name:
            return jsonify({'success': False, 'message': 'İsim gereklidir'}), 400

        existing = Tag.query.filter(func.lower(Tag.name) == name.lower()).first()
        if existing:
            return jsonify({'success': True, 'tag': existing.to_dict()}), 200

        t = Tag(name=name, color=color)
        db.session.add(t)
        db.session.commit()
        return jsonify({'success': True, 'tag': t.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        log_error(f"Etiket oluşturma hatası: {e}")
        return jsonify({'success': False, 'message': 'Etiket oluşturulamadı'}), 500


@tags_search_bp.route('/tags/<int:tag_id>', methods=['DELETE'])
def delete_tag(tag_id):
    try:
        t = Tag.query.get_or_404(tag_id)
        db.session.delete(t)
        db.session.commit()
        return jsonify({'success': True}), 200
    except Exception as e:
        db.session.rollback()
        log_error(f"Etiket silme hatası: {e}")
        return jsonify({'success': False, 'message': 'Etiket silinemedi'}), 500


# ─── Görev <-> Etiket ────────────────────────────────────────

@tags_search_bp.route('/tasks/<int:task_id>/tags', methods=['POST'])
def add_tag_to_task(task_id):
    """Body: { tag_id }"""
    try:
        Task.query.get_or_404(task_id)
        data = request.get_json() or {}
        tag_id = data.get('tag_id')
        if not tag_id:
            return jsonify({'success': False, 'message': 'tag_id gereklidir'}), 400
        Tag.query.get_or_404(int(tag_id))

        existing = TaskTag.query.filter_by(task_id=task_id, tag_id=int(tag_id)).first()
        if existing:
            return jsonify({'success': True, 'task_tag': {'id': existing.id}}), 200

        tt = TaskTag(task_id=task_id, tag_id=int(tag_id))
        db.session.add(tt)
        db.session.commit()
        return jsonify({'success': True}), 201
    except Exception as e:
        db.session.rollback()
        log_error(f"Etiket atama hatası: {e}")
        return jsonify({'success': False, 'message': 'Etiket atanamadı'}), 500


@tags_search_bp.route('/tasks/<int:task_id>/tags/<int:tag_id>', methods=['DELETE'])
def remove_tag_from_task(task_id, tag_id):
    try:
        tt = TaskTag.query.filter_by(task_id=task_id, tag_id=tag_id).first()
        if not tt:
            return jsonify({'success': True}), 200
        db.session.delete(tt)
        db.session.commit()
        return jsonify({'success': True}), 200
    except Exception as e:
        db.session.rollback()
        log_error(f"Etiket kaldırma hatası: {e}")
        return jsonify({'success': False, 'message': 'Etiket kaldırılamadı'}), 500


# ─── Global Arama ────────────────────────────────────────────

@tags_search_bp.route('/search', methods=['GET'])
def global_search():
    """
    Query: q (en az 2 karakter), limit (varsayılan 8)
    Üç tip sonuç: tasks, projects, users
    """
    try:
        q = (request.args.get('q') or '').strip()
        if len(q) < 2:
            return jsonify({'success': True, 'tasks': [], 'projects': [], 'users': []}), 200

        limit = request.args.get('limit', default=8, type=int)
        limit = max(1, min(limit, 30))
        like = f'%{q}%'

        tasks = (Task.query
                 .filter(or_(Task.title.ilike(like), Task.description.ilike(like)))
                 .order_by(Task.created_at.desc())
                 .limit(limit).all())

        projects = (Project.query
                    .filter(or_(Project.name.ilike(like), Project.description.ilike(like)))
                    .limit(limit).all())

        users = (Identity.query
                 .filter(or_(
                     Identity.first_name.ilike(like),
                     Identity.last_name.ilike(like),
                     Identity.email.ilike(like),
                 ))
                 .limit(limit).all())

        return jsonify({
            'success': True,
            'tasks': [{'id': t.id, 'title': t.title, 'status': t.status,
                       'assignee_name': f'{t.assignee.first_name} {t.assignee.last_name}' if t.assignee else None}
                      for t in tasks],
            'projects': [{'id': p.id, 'name': p.name, 'status': p.status} for p in projects],
            'users': [{'id': u.id, 'name': f'{u.first_name} {u.last_name}',
                       'email': u.email, 'user_type': u.user_type} for u in users],
        }), 200
    except Exception as e:
        log_error(f"Arama hatası: {e}")
        return jsonify({'success': False, 'message': 'Arama başarısız'}), 500
