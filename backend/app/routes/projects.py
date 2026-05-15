"""
Proje yönetimi route'ları
"""
from flask import Blueprint, request, jsonify
from app.models import db, Project
from app.logger import log_error, log_success

projects_bp = Blueprint('projects', __name__)


@projects_bp.route('/projects', methods=['GET'])
def get_projects():
    """Projeleri listele"""
    try:
        projects = Project.query.order_by(Project.created_at.desc()).all()
        return jsonify({'success': True, 'projects': [p.to_dict() for p in projects]}), 200
    except Exception as e:
        log_error(f"Proje listesi hatası: {e}")
        return jsonify({'success': False, 'message': 'Projeler listelenemedi'}), 500


@projects_bp.route('/projects', methods=['POST'])
def create_project():
    """Yeni proje oluştur"""
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

        project = Project(
            name=name,
            description=data.get('description', ''),
            start_date=start_date,
            end_date=end_date,
            status=data.get('status', 'aktif'),
            created_by=data.get('created_by'),
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
