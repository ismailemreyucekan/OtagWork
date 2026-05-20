"""
Alt görev (subtask) ve bağımlılık (dependency) route'ları.
"""
from datetime import date
from flask import Blueprint, request, jsonify
from app.models import db, Task, TaskDependency
from app.logger import log_error, log_success
from app.services import activity as act
from app.services import notifications as notif

task_relations_bp = Blueprint('task_relations', __name__)


def _parse_date(val):
    if not val:
        return None
    try:
        return date.fromisoformat(val)
    except (ValueError, TypeError):
        return None


# ─── Alt Görevler ────────────────────────────────────────────

@task_relations_bp.route('/tasks/<int:task_id>/subtasks', methods=['GET'])
def list_subtasks(task_id):
    try:
        Task.query.get_or_404(task_id)
        subs = Task.query.filter_by(parent_id=task_id).order_by(Task.created_at.asc()).all()
        return jsonify({'success': True, 'subtasks': [t.to_dict() for t in subs]}), 200
    except Exception as e:
        log_error(f"Alt görev listeleme hatası: {e}")
        return jsonify({'success': False, 'message': 'Alt görevler alınamadı'}), 500


@task_relations_bp.route('/tasks/<int:task_id>/subtasks', methods=['POST'])
def create_subtask(task_id):
    """
    Body: { title, assigned_to, due_date, ... }
    Atayan kişi parent task'ın assigned_by'ından alınır eğer body'de yoksa.
    """
    try:
        parent = Task.query.get_or_404(task_id)
        data = request.get_json() or {}

        title = (data.get('title') or '').strip()
        assigned_to = data.get('assigned_to') or parent.assigned_to
        assigned_by = data.get('assigned_by') or parent.assigned_by
        due_date = _parse_date(data.get('due_date')) or parent.due_date

        if not title:
            return jsonify({'success': False, 'message': 'Alt görev başlığı gereklidir'}), 400
        if not due_date:
            return jsonify({'success': False, 'message': 'Son tarih gereklidir'}), 400

        sub = Task(
            title=title,
            description=data.get('description', ''),
            project_id=parent.project_id,
            team_id=parent.team_id,
            assigned_to=assigned_to,
            assigned_by=assigned_by,
            start_date=_parse_date(data.get('start_date')) or parent.start_date,
            due_date=due_date,
            priority=data.get('priority', parent.priority),
            status='beklemede',
            approval_status='onay_bekliyor',
            parent_id=parent.id,
        )
        db.session.add(sub)
        db.session.flush()

        act.log(task_id=parent.id, action='subtask_added', actor_id=assigned_by,
                new_value=sub.title)
        act.log(task_id=sub.id, action='created', actor_id=assigned_by,
                new_value=sub.title, note='alt görev')
        notif.notify_task_assigned(sub, actor_id=assigned_by)

        db.session.commit()
        log_success(f"Alt görev oluşturuldu: Parent={task_id}, Child={sub.id}")
        return jsonify({'success': True, 'subtask': sub.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        log_error(f"Alt görev oluşturma hatası: {e}")
        return jsonify({'success': False, 'message': 'Alt görev oluşturulamadı'}), 500


# ─── Bağımlılıklar ───────────────────────────────────────────

@task_relations_bp.route('/tasks/<int:task_id>/dependencies', methods=['GET'])
def list_dependencies(task_id):
    """
    İki yön: bu görevi engelleyenler (blockers) ve bu görevin engellediği (blocked).
    """
    try:
        Task.query.get_or_404(task_id)
        blockers = TaskDependency.query.filter_by(blocked_id=task_id).all()
        blocked = TaskDependency.query.filter_by(blocker_id=task_id).all()
        return jsonify({
            'success': True,
            'blockers': [d.to_dict() for d in blockers],
            'blocked': [d.to_dict() for d in blocked],
        }), 200
    except Exception as e:
        log_error(f"Bağımlılık listeleme hatası: {e}")
        return jsonify({'success': False, 'message': 'Bağımlılıklar alınamadı'}), 500


@task_relations_bp.route('/tasks/<int:task_id>/dependencies', methods=['POST'])
def add_dependency(task_id):
    """
    Body: { blocker_id: int, actor_id?: int }
    'task_id' bağımlı (blocked) — 'blocker_id' tamamlanmadan başlayamaz.
    """
    try:
        blocked = Task.query.get_or_404(task_id)
        data = request.get_json() or {}
        blocker_id = data.get('blocker_id')

        if not blocker_id:
            return jsonify({'success': False, 'message': 'blocker_id gereklidir'}), 400
        if int(blocker_id) == task_id:
            return jsonify({'success': False, 'message': 'Görev kendisini engelleyemez'}), 400

        blocker = Task.query.get(int(blocker_id))
        if not blocker:
            return jsonify({'success': False, 'message': 'Engelleyen görev bulunamadı'}), 404

        # Mevcutsa yeniden ekleme
        existing = TaskDependency.query.filter_by(
            blocker_id=blocker.id, blocked_id=blocked.id
        ).first()
        if existing:
            return jsonify({'success': True, 'dependency': existing.to_dict()}), 200

        # Döngü kontrolü (basit): blocker zaten bu task'e bağlı mı?
        cycle = TaskDependency.query.filter_by(
            blocker_id=blocked.id, blocked_id=blocker.id
        ).first()
        if cycle:
            return jsonify({'success': False, 'message': 'Döngüsel bağımlılık oluşturulamaz'}), 400

        dep = TaskDependency(blocker_id=blocker.id, blocked_id=blocked.id)
        db.session.add(dep)

        actor_id = data.get('actor_id') or blocked.assigned_by
        act.log(task_id=blocked.id, action='dependency_added', actor_id=actor_id,
                new_value=f'blocker: {blocker.title}')

        db.session.commit()
        log_success(f"Bağımlılık eklendi: {blocker.id} -> {blocked.id}")
        return jsonify({'success': True, 'dependency': dep.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        log_error(f"Bağımlılık ekleme hatası: {e}")
        return jsonify({'success': False, 'message': 'Bağımlılık eklenemedi'}), 500


@task_relations_bp.route('/dependencies/<int:dep_id>', methods=['DELETE'])
def delete_dependency(dep_id):
    try:
        dep = TaskDependency.query.get_or_404(dep_id)
        blocked_id = dep.blocked_id
        blocker_title = dep.blocker.title if dep.blocker else '—'
        db.session.delete(dep)

        act.log(task_id=blocked_id, action='dependency_removed',
                new_value=f'blocker: {blocker_title}')

        db.session.commit()
        return jsonify({'success': True, 'message': 'Bağımlılık silindi'}), 200
    except Exception as e:
        db.session.rollback()
        log_error(f"Bağımlılık silme hatası: {e}")
        return jsonify({'success': False, 'message': 'Bağımlılık silinemedi'}), 500
