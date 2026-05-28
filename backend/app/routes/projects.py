"""
Proje yönetimi route'ları
"""
from flask import Blueprint, request, jsonify
from app.models import db, Project, Identity
from app.logger import log_error, log_success

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
