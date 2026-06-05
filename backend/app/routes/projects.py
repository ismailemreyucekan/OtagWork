"""
Proje yönetimi route'ları
"""
from flask import Blueprint, request, jsonify
from app.models import db, Project, Identity, TimesheetSetting, Task
from app.logger import log_error, log_success
from app.scoping import is_manager, manager_member_ids

projects_bp = Blueprint('projects', __name__)


def _scope_user(req):
    """İsteği yapan kullanıcının organization_id'sini al."""
    uid = req.headers.get('X-User-Id') or req.args.get('user_id')
    if not uid and req.is_json:
        body = req.get_json(silent=True) or {}
        uid = body.get('user_id') or body.get('created_by')
    try: uid = int(uid) if uid else None
    except: uid = None
    return Identity.query.filter_by(id=uid, is_active=True).first() if uid else None


@projects_bp.route('/projects', methods=['GET'])
def get_projects():
    """Projeleri listele. TENANT SCOPE: çağıran kullanıcının org'u."""
    try:
        q = Project.query
        actor = _scope_user(request)
        if actor and actor.organization_id:
            q = q.filter(Project.organization_id == actor.organization_id)
        # Yönetici kapsamı: kendi oluşturduğu projeler + ekibinin görevlerinin projeleri
        if is_manager(actor):
            from sqlalchemy import or_
            member_ids = manager_member_ids(actor)
            proj_ids = set()
            if member_ids:
                proj_ids = {
                    pid for (pid,) in db.session.query(Task.project_id)
                    .filter(Task.assigned_to.in_(member_ids), Task.project_id.isnot(None))
                    .distinct().all()
                }
            conds = [Project.created_by == actor.id]
            if proj_ids:
                conds.append(Project.id.in_(proj_ids))
            q = q.filter(or_(*conds))
        projects = q.order_by(Project.created_at.desc()).all()
        return jsonify({'success': True, 'projects': [p.to_dict() for p in projects]}), 200
    except Exception as e:
        log_error(f"Proje listesi hatası: {e}")
        return jsonify({'success': False, 'message': 'Projeler listelenemedi'}), 500


@projects_bp.route('/projects', methods=['POST'])
def create_project():
    """Yeni proje oluştur. organization_id, created_by kullanıcısından alınır."""
    try:
        data = request.get_json()
        name = data.get('name', '').strip()
        if not name:
            return jsonify({'success': False, 'message': 'Proje adı gereklidir'}), 400

        from datetime import date
        start_date = None
        end_date = None
        if data.get('start_date'):
            start_date = date.fromisoformat(data['start_date'])
        if data.get('end_date'):
            end_date = date.fromisoformat(data['end_date'])

        creator_id = data.get('created_by')
        creator = Identity.query.get(creator_id) if creator_id else None
        org_id = creator.organization_id if creator else None

        project = Project(
            organization_id=org_id,
            name=name,
            description=data.get('description', ''),
            start_date=start_date,
            end_date=end_date,
            status=data.get('status', 'aktif'),
            created_by=creator_id,
        )
        db.session.add(project)
        db.session.commit()
        log_success(f"Proje oluşturuldu: {name}")
        return jsonify({'success': True, 'project': project.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        log_error(f"Proje oluşturma hatası: {e}")
        return jsonify({'success': False, 'message': 'Proje oluşturulamadı'}), 500


@projects_bp.route('/projects/combined', methods=['GET'])
def list_combined_projects():
    """Görev modal'ı için birleşik proje listesi: gerçek Project'ler + timesheet
    ayarlarındaki proje etiketleri. Tenant-scoped.

    Yanıt formatı:
      {
        "success": true,
        "items": [
          { "key": "p:5",   "label": "Web Sitesi", "source": "project",    "project_id": 5,  "order": 0 },
          { "key": "ts:12", "label": "Mobil",      "source": "ts_setting", "ts_id": 12,      "order": 1 }
        ]
      }

    Project'ler created_at ASC, sonra timesheet etiketleri display_order ASC olarak gelir.
    Aynı isim her iki yerde varsa Project öncelikli (duplicate silinir).
    """
    try:
        actor = _scope_user(request)
        if not actor:
            return jsonify({'success': True, 'items': []}), 200

        projects = Project.query.filter(
            Project.organization_id == actor.organization_id
        ).order_by(Project.created_at.asc()).all()

        ts_projects = TimesheetSetting.query.filter(
            TimesheetSetting.organization_id == actor.organization_id,
            TimesheetSetting.setting_type == 'project',
            TimesheetSetting.is_active == True,
        ).order_by(TimesheetSetting.display_order.asc(), TimesheetSetting.value.asc()).all()

        items = []
        seen_names = set()
        for idx, p in enumerate(projects):
            items.append({
                'key': f'p:{p.id}',
                'label': p.name,
                'source': 'project',
                'project_id': p.id,
                'order': idx,
            })
            seen_names.add((p.name or '').strip().lower())

        for ts in ts_projects:
            name_norm = (ts.value or '').strip().lower()
            if name_norm in seen_names:
                continue
            items.append({
                'key': f'ts:{ts.id}',
                'label': ts.value,
                'source': 'ts_setting',
                'ts_id': ts.id,
                'order': len(items),
            })

        return jsonify({'success': True, 'items': items}), 200
    except Exception as e:
        log_error(f"Birleşik proje listesi hatası: {e}")
        return jsonify({'success': False, 'message': 'Liste alınamadı'}), 500


@projects_bp.route('/projects/ensure', methods=['POST'])
def ensure_project():
    """Verilen isimde bir Project varsa onu döner, yoksa oluşturur.

    Self-task modal'ında kullanıcı timesheet etiketinden bir proje seçtiğinde
    çağrılır — gerçek Project kaydı garanti edilmiş olur.

    Body: { user_id, name, description? }
    """
    try:
        data = request.get_json() or {}
        name = (data.get('name') or '').strip()
        if not name:
            return jsonify({'success': False, 'message': 'Proje adı gereklidir'}), 400

        actor = _scope_user(request)
        if not actor:
            return jsonify({'success': False, 'message': 'Kullanıcı doğrulanamadı'}), 401

        existing = Project.query.filter(
            Project.organization_id == actor.organization_id,
            db.func.lower(Project.name) == name.lower(),
        ).first()
        if existing:
            return jsonify({'success': True, 'project': existing.to_dict(), 'created': False}), 200

        project = Project(
            organization_id=actor.organization_id,
            name=name,
            description=(data.get('description') or '').strip(),
            status='aktif',
            created_by=actor.id,
        )
        db.session.add(project)
        db.session.commit()
        log_success(f"Lazy Project oluşturuldu: {name} (user={actor.id})")
        return jsonify({'success': True, 'project': project.to_dict(), 'created': True}), 201
    except Exception as e:
        db.session.rollback()
        log_error(f"Project ensure hatası: {e}")
        return jsonify({'success': False, 'message': 'Proje oluşturulamadı'}), 500


@projects_bp.route('/projects/<int:project_id>', methods=['GET'])
def get_project(project_id):
    """Tek proje getir"""
    try:
        project = Project.query.get_or_404(project_id)
        return jsonify({'success': True, 'project': project.to_dict()}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': 'Proje bulunamadı'}), 404


@projects_bp.route('/projects/<int:project_id>', methods=['PUT'])
def update_project(project_id):
    """Proje güncelle"""
    try:
        project = Project.query.get_or_404(project_id)
        data = request.get_json()
        from datetime import date

        if 'name' in data:
            project.name = data['name'].strip()
        if 'description' in data:
            project.description = data['description']
        if 'status' in data:
            project.status = data['status']
        if 'start_date' in data and data['start_date']:
            project.start_date = date.fromisoformat(data['start_date'])
        if 'end_date' in data and data['end_date']:
            project.end_date = date.fromisoformat(data['end_date'])

        db.session.commit()
        return jsonify({'success': True, 'project': project.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        log_error(f"Proje güncelleme hatası: {e}")
        return jsonify({'success': False, 'message': 'Proje güncellenemedi'}), 500


@projects_bp.route('/projects/<int:project_id>', methods=['DELETE'])
def delete_project(project_id):
    """Proje sil"""
    try:
        project = Project.query.get_or_404(project_id)
        db.session.delete(project)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Proje silindi'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': 'Proje silinemedi'}), 500
