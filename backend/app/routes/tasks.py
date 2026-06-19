"""
Görev yönetimi route'ları
"""
from flask import Blueprint, request, jsonify
from datetime import date
from sqlalchemy.orm import joinedload, selectinload
from app.models import db, Task, Team, TeamMember, Identity, TaskDependency
from app.logger import log_error, log_success
from app.services import notifications as notif
from app.services import activity as act
from app.scoping import is_manager, manager_member_ids, manager_team_ids

tasks_bp = Blueprint('tasks', __name__)


def _parse_date(val):
    if not val:
        return None
    try:
        return date.fromisoformat(val)
    except (ValueError, TypeError):
        return None


def _scope_user(request):
    """
    İsteği yapan kullanıcının organization_id'sini tespit eder. Aşağıdaki
    sıraya göre arar: header X-User-Id → query user_id / assigned_by /
    team_tasks_for → body user_id / assigned_by / identity_id.
    Tenant filtresi için kritik — bulamazsa None döner ve endpoint
    boş yanıt döndürür (sızıntı yapmaz).
    """
    uid = request.headers.get('X-User-Id')
    for k in ('user_id', 'assigned_by', 'team_tasks_for', 'manager_id'):
        if not uid:
            uid = request.args.get(k)
    if not uid and request.is_json:
        body = request.get_json(silent=True) or {}
        uid = body.get('user_id') or body.get('assigned_by') or body.get('identity_id')
    try:
        uid = int(uid) if uid else None
    except (ValueError, TypeError):
        uid = None
    if not uid:
        return None
    return Identity.query.filter_by(id=uid, is_active=True).first()


@tasks_bp.route('/tasks', methods=['GET'])
def get_tasks():
    """
    Görevleri listele. Aktif kullanıcının organization'ına TENANT SCOPE
    uygulanır — başka workspace'lerin görevleri asla dönmez.

    Query params:
      - user_id       : sadece bu kullanıcıya atanmış görevler (kendi org'unda)
      - assigned_by   : bu yönetici tarafından atanmış
      - team_id       : takım filtresi
      - project_id    : proje filtresi
      - status        : durum filtresi
      - team_tasks_for: bu user_id'nin bulunduğu takımlardaki tüm görevler
    """
    try:
        actor = _scope_user(request)
        if not actor:
            return jsonify({'success': True, 'tasks': []}), 200

        # Tenant scope: her zaman aktif kullanıcının org'una bağlı.
        # Eager-load: to_dict project/team/assignee/assigner/subtasks erişiyor;
        # bunlar olmadan görev başına N+1 sorgu oluşur.
        q = (Task.query
             .options(
                 joinedload(Task.project),
                 joinedload(Task.team),
                 joinedload(Task.assignee),
                 joinedload(Task.assigner),
                 selectinload(Task.subtasks),
             )
             .filter(Task.organization_id == actor.organization_id))

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
            # Kullanıcının takımlarındaki tüm görevler (kendi org içinde)
            memberships = TeamMember.query.filter_by(user_id=team_tasks_for).all()
            team_ids = [m.team_id for m in memberships]
            if team_ids:
                q = q.filter(Task.team_id.in_(team_ids))
            else:
                return jsonify({'success': True, 'tasks': []}), 200

        # Yönetici kapsamı: yalnız kendi ekibinin görevleri, kendi takımlarının
        # görevleri veya kendi atadığı görevler. (admin/owner tüm org'u görür)
        if is_manager(actor):
            from sqlalchemy import or_
            member_ids = manager_member_ids(actor)
            team_ids = manager_team_ids(actor)
            conds = [Task.assigned_by == actor.id]
            if member_ids:
                conds.append(Task.assigned_to.in_(member_ids))
            if team_ids:
                conds.append(Task.team_id.in_(team_ids))
            q = q.filter(or_(*conds))

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

        # Tenant scope: atayan + atanan aynı org'da olmalı, task org otomatik atanır
        actor = Identity.query.filter_by(id=assigned_by, is_active=True).first()
        assignee = Identity.query.filter_by(id=assigned_to, is_active=True).first()
        if not actor or not assignee:
            return jsonify({'success': False, 'message': 'Kullanıcı bulunamadı'}), 404
        if actor.organization_id != assignee.organization_id:
            return jsonify({
                'success': False,
                'message': 'Görev atanan kişi aynı workspace\'te değil',
            }), 403

        # Solo kullanıcı için: kendi kendine atama otomatik onaylı
        is_self = (assigned_to == assigned_by)
        approval_status = 'onaylandi' if is_self else 'onay_bekliyor'

        task = Task(
            organization_id=actor.organization_id,
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
            approval_status=approval_status,
        )
        db.session.add(task)
        db.session.flush()
        act.log(task_id=task.id, action='created', actor_id=assigned_by,
                new_value=task.title)
        notif.notify_task_assigned(task, actor_id=assigned_by)
        db.session.commit()
        log_success(f"Görev oluşturuldu: {title} → User {assigned_to}")
        return jsonify({'success': True, 'task': task.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        log_error(f"Görev oluşturma hatası: {e}")
        return jsonify({'success': False, 'message': 'Görev oluşturulamadı'}), 500


@tasks_bp.route('/tasks/<int:task_id>', methods=['GET'])
def get_task(task_id):
    """Tek görev getir — sadece aynı org içinde."""
    try:
        task = Task.query.get_or_404(task_id)
        actor = _scope_user(request)
        if actor and task.organization_id and task.organization_id != actor.organization_id:
            return jsonify({'success': False, 'message': 'Görev bulunamadı'}), 404
        return jsonify({'success': True, 'task': task.to_dict()}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': 'Görev bulunamadı'}), 404


@tasks_bp.route('/tasks/<int:task_id>', methods=['PUT'])
def update_task(task_id):
    """Görev bilgilerini güncelle (yönetici/admin)"""
    try:
        task = Task.query.get_or_404(task_id)
        data = request.get_json()
        actor_id = data.get('actor_id') or task.assigned_by

        if 'title' in data:
            task.title = data['title'].strip()
        if 'description' in data:
            task.description = data['description']
        if 'project_id' in data:
            task.project_id = data['project_id']
        if 'team_id' in data:
            task.team_id = data['team_id']
        if 'assigned_to' in data and data['assigned_to'] != task.assigned_to:
            old = task.assigned_to
            task.assigned_to = data['assigned_to']
            act.log(task_id=task.id, action='assignee_changed', actor_id=actor_id,
                    old_value=old, new_value=task.assigned_to)
            # Yeni atanan kişiye bildirim
            notif.notify_task_assigned(task, actor_id=actor_id)
        if 'start_date' in data:
            task.start_date = _parse_date(data['start_date'])
        if 'due_date' in data:
            new_due = _parse_date(data['due_date'])
            if new_due != task.due_date:
                act.log(task_id=task.id, action='due_date_changed', actor_id=actor_id,
                        old_value=task.due_date, new_value=new_due)
                # Son tarih değişti → yaklaşan-tarih bildirimi yeniden tetiklenebilsin
                task.due_soon_notified_at = None
            task.due_date = new_due
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

        # Bağımlılık kontrolü: 'devam_ediyor' / 'tamamlandi'a geçerken tüm blocker'lar tamamlanmış olmalı
        if new_status in ('devam_ediyor', 'tamamlandi'):
            blockers = TaskDependency.query.filter_by(blocked_id=task_id).all()
            unfinished = [d for d in blockers if d.blocker and d.blocker.status != 'tamamlandi']
            if unfinished:
                titles = ', '.join(d.blocker.title for d in unfinished)
                return jsonify({
                    'success': False,
                    'message': f'Önce şu görevler tamamlanmalı: {titles}',
                    'blockers': [d.to_dict() for d in unfinished],
                }), 409

        old_status = task.status
        task.status = new_status
        actor_id = data.get('actor_id') or task.assigned_to
        act.log(task_id=task.id, action='status_changed', actor_id=actor_id,
                old_value=old_status, new_value=new_status)
        notif.notify_task_status_changed(task, new_status, actor_id=actor_id)
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

        actor_id = data.get('actor_id') or task.assigned_by
        act.log(task_id=task.id, action='approval_changed', actor_id=actor_id,
                new_value=new_approval,
                note=task.reject_reason if new_approval == 'reddedildi' else None)
        if new_approval == 'onaylandi':
            notif.notify_task_approval(task, approved=True, actor_id=actor_id)
        elif new_approval == 'reddedildi':
            notif.notify_task_approval(task, approved=False,
                                       reject_reason=task.reject_reason, actor_id=actor_id)

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

        act.log(task_id=task.id, action='extension_requested', actor_id=task.assigned_to,
                new_value=f'{ext_days} gün', note=ext_reason)
        notif.notify_extension_requested(task, actor_id=task.assigned_to)
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
            # Son tarih ileri alındı → yaklaşan-tarih bildirimi yeniden tetiklenebilsin
            task.due_soon_notified_at = None
            log_success(f"Ek süre onaylandı: Task={task_id}, Yeni deadline={task.due_date}")

        actor_id = data.get('actor_id') or task.assigned_by
        act.log(task_id=task.id, action='extension_reviewed', actor_id=actor_id,
                new_value=ext_status)
        notif.notify_extension_reviewed(task,
                                        approved=(ext_status == 'onaylandi'),
                                        actor_id=actor_id)
        db.session.commit()
        return jsonify({'success': True, 'task': task.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        log_error(f"Ek süre inceleme hatası: {e}")
        return jsonify({'success': False, 'message': 'Ek süre işlemi tamamlanamadı'}), 500
