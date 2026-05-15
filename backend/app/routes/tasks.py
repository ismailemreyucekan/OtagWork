"""
Görev yönetimi route'ları
"""
from flask import Blueprint, request, jsonify
from datetime import date
from app.models import db, Task, Team, TeamMember, Identity
from app.logger import log_error, log_success

tasks_bp = Blueprint('tasks', __name__)


def _parse_date(val):
    if not val:
        return None
    try:
        return date.fromisoformat(val)
    except (ValueError, TypeError):
        return None


@tasks_bp.route('/tasks', methods=['GET'])
def get_tasks():
    """
    Görevleri listele.
    Query params:
      - user_id       : sadece bu kullanıcıya atanmış görevler
      - assigned_by   : bu yönetici tarafından atanmış
      - team_id       : takım filtresi
      - project_id    : proje filtresi
      - status        : durum filtresi
      - team_tasks_for: bu user_id'nin bulunduğu takımlardaki tüm görevler
    """
    try:
        q = Task.query

        user_id = request.args.get('user_id', type=int)
        assigned_by = request.args.get('assigned_by', type=int)
        team_id = request.args.get('team_id', type=int)
        project_id = request.args.get('project_id', type=int)
        status = request.args.get('status')
        team_tasks_for = request.args.get('team_tasks_for', type=int)

        if user_id:
            q = q.filter(Task.assigned_to == user_id)
        if assigned_by:
            q = q.filter(Task.assigned_by == assigned_by)
        if team_id:
            q = q.filter(Task.team_id == team_id)
        if project_id:
            q = q.filter(Task.project_id == project_id)
        if status:
            q = q.filter(Task.status == status)
        if team_tasks_for:
            # Kullanıcının takımlarındaki tüm görevler (kendi görevi dahil)
            memberships = TeamMember.query.filter_by(user_id=team_tasks_for).all()
            team_ids = [m.team_id for m in memberships]
            if team_ids:
                q = q.filter(Task.team_id.in_(team_ids))
            else:
                return jsonify({'success': True, 'tasks': []}), 200

        tasks = q.order_by(Task.due_date.asc()).all()
        return jsonify({'success': True, 'tasks': [t.to_dict() for t in tasks]}), 200
    except Exception as e:
        log_error(f"Görev listesi hatası: {e}")
        return jsonify({'success': False, 'message': 'Görevler listelenemedi'}), 500


@tasks_bp.route('/tasks', methods=['POST'])
def create_task():
    """
    Yeni görev oluştur.
    Sadece admin veya manager oluşturabilir (frontend tarafında kontrol edilir,
    backend assigned_by alanıyla kimin atadığını kaydeder).
    """
    try:
        data = request.get_json()
        title = data.get('title', '').strip()
        assigned_to = data.get('assigned_to')
        assigned_by = data.get('assigned_by')
        due_date_str = data.get('due_date')

        if not title:
            return jsonify({'success': False, 'message': 'Görev başlığı gereklidir'}), 400
        if not assigned_to:
            return jsonify({'success': False, 'message': 'Atanacak kişi gereklidir'}), 400
        if not assigned_by:
            return jsonify({'success': False, 'message': 'Atayan kişi gereklidir'}), 400
        if not due_date_str:
            return jsonify({'success': False, 'message': 'Son tarih (deadline) gereklidir'}), 400

        due_date = _parse_date(due_date_str)
        if not due_date:
            return jsonify({'success': False, 'message': 'Geçersiz tarih formatı'}), 400

        task = Task(
            title=title,
            description=data.get('description', ''),
            project_id=data.get('project_id'),
            team_id=data.get('team_id'),
            assigned_to=assigned_to,
            assigned_by=assigned_by,
            start_date=_parse_date(data.get('start_date')),
            due_date=due_date,
            priority=data.get('priority', 'orta'),
            status='beklemede',
            approval_status='onay_bekliyor',
        )
        db.session.add(task)
        db.session.commit()
        log_success(f"Görev oluşturuldu: {title} → User {assigned_to}")
        return jsonify({'success': True, 'task': task.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        log_error(f"Görev oluşturma hatası: {e}")
        return jsonify({'success': False, 'message': 'Görev oluşturulamadı'}), 500


@tasks_bp.route('/tasks/<int:task_id>', methods=['GET'])
def get_task(task_id):
    """Tek görev getir"""
    try:
        task = Task.query.get_or_404(task_id)
        return jsonify({'success': True, 'task': task.to_dict()}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': 'Görev bulunamadı'}), 404


@tasks_bp.route('/tasks/<int:task_id>', methods=['PUT'])
def update_task(task_id):
    """Görev bilgilerini güncelle (yönetici/admin)"""
    try:
        task = Task.query.get_or_404(task_id)
        data = request.get_json()

        if 'title' in data:
            task.title = data['title'].strip()
        if 'description' in data:
            task.description = data['description']
        if 'project_id' in data:
            task.project_id = data['project_id']
        if 'team_id' in data:
            task.team_id = data['team_id']
        if 'assigned_to' in data:
            task.assigned_to = data['assigned_to']
        if 'start_date' in data:
            task.start_date = _parse_date(data['start_date'])
        if 'due_date' in data:
            task.due_date = _parse_date(data['due_date'])
        if 'priority' in data:
            task.priority = data['priority']
        if 'status' in data:
            task.status = data['status']
        if 'approval_status' in data:
            task.approval_status = data['approval_status']
        if 'reject_reason' in data:
            task.reject_reason = data['reject_reason']

        db.session.commit()
        return jsonify({'success': True, 'task': task.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        log_error(f"Görev güncelleme hatası: {e}")
        return jsonify({'success': False, 'message': 'Görev güncellenemedi'}), 500


@tasks_bp.route('/tasks/<int:task_id>', methods=['DELETE'])
def delete_task(task_id):
    """Görevi sil"""
    try:
        task = Task.query.get_or_404(task_id)
        db.session.delete(task)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Görev silindi'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': 'Görev silinemedi'}), 500


@tasks_bp.route('/tasks/<int:task_id>/status', methods=['PUT'])
def update_task_status(task_id):
    """
    Çalışan görev durumunu günceller.
    status: beklemede | devam_ediyor | tamamlandi | iptal
    """
    try:
        task = Task.query.get_or_404(task_id)
        data = request.get_json()
        new_status = data.get('status')

        valid = ['beklemede', 'devam_ediyor', 'tamamlandi', 'iptal']
        if new_status not in valid:
            return jsonify({'success': False, 'message': f'Geçersiz durum. Geçerli: {valid}'}), 400

        task.status = new_status
        db.session.commit()
        log_success(f"Görev durumu güncellendi: Task={task_id} → {new_status}")
        return jsonify({'success': True, 'task': task.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        log_error(f"Görev durum güncelleme hatası: {e}")
        return jsonify({'success': False, 'message': 'Durum güncellenemedi'}), 500


@tasks_bp.route('/tasks/<int:task_id>/approval', methods=['PUT'])
def update_task_approval(task_id):
    """
    Yönetici görev onayı/reddini günceller.
    approval_status: onaylandi | reddedildi
    """
    try:
        task = Task.query.get_or_404(task_id)
        data = request.get_json()
        new_approval = data.get('approval_status')

        valid = ['onaylandi', 'reddedildi', 'onay_bekliyor']
        if new_approval not in valid:
            return jsonify({'success': False, 'message': f'Geçersiz onay durumu'}), 400

        task.approval_status = new_approval
        if new_approval == 'reddedildi':
            task.reject_reason = data.get('reject_reason', '')
        else:
            task.reject_reason = None

        db.session.commit()
        log_success(f"Görev onay durumu: Task={task_id} → {new_approval}")
        return jsonify({'success': True, 'task': task.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        log_error(f"Görev onay güncelleme hatası: {e}")
        return jsonify({'success': False, 'message': 'Onay durumu güncellenemedi'}), 500


@tasks_bp.route('/tasks/<int:task_id>/extension', methods=['POST'])
def request_extension(task_id):
    """
    Çalışan ek süre talep eder.
    Body: { extension_days: int, extension_reason: str }
    """
    try:
        task = Task.query.get_or_404(task_id)
        data = request.get_json()

        ext_days = data.get('extension_days')
        ext_reason = data.get('extension_reason', '').strip()

        if not ext_days or int(ext_days) <= 0:
            return jsonify({'success': False, 'message': 'Geçerli bir ek gün sayısı girin'}), 400
        if not ext_reason:
            return jsonify({'success': False, 'message': 'Ek süre talebi için açıklama gereklidir'}), 400

        task.extension_requested = True
        task.extension_days = int(ext_days)
        task.extension_reason = ext_reason
        task.extension_status = 'onay_bekliyor'

        db.session.commit()
        log_success(f"Ek süre talebi: Task={task_id}, Gün={ext_days}")
        return jsonify({'success': True, 'task': task.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        log_error(f"Ek süre talep hatası: {e}")
        return jsonify({'success': False, 'message': 'Ek süre talep edilemedi'}), 500


@tasks_bp.route('/tasks/<int:task_id>/extension', methods=['PUT'])
def review_extension(task_id):
    """
    Yönetici ek süre talebini onaylar veya reddeder.
    Body: { extension_status: 'onaylandi' | 'reddedildi' }
    Onaylanırsa due_date otomatik ileri alınır.
    """
    try:
        task = Task.query.get_or_404(task_id)
        data = request.get_json()
        ext_status = data.get('extension_status')

        if ext_status not in ['onaylandi', 'reddedildi']:
            return jsonify({'success': False, 'message': 'Geçersiz ek süre durumu'}), 400

        task.extension_status = ext_status

        if ext_status == 'onaylandi' and task.extension_days:
            from datetime import timedelta
            task.due_date = task.due_date + timedelta(days=task.extension_days)
            log_success(f"Ek süre onaylandı: Task={task_id}, Yeni deadline={task.due_date}")

        db.session.commit()
        return jsonify({'success': True, 'task': task.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        log_error(f"Ek süre inceleme hatası: {e}")
        return jsonify({'success': False, 'message': 'Ek süre işlemi tamamlanamadı'}), 500
