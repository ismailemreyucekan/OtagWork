"""
Takım yönetimi route'ları
"""
from flask import Blueprint, request, jsonify
from app.models import db, Team, TeamMember, Identity
from app.logger import log_operation, log_error, log_success

teams_bp = Blueprint('teams', __name__)


@teams_bp.route('/teams', methods=['GET'])
def get_teams():
    """Tüm takımları listele"""
    try:
        teams = Team.query.filter_by(is_active=True).order_by(Team.created_at.desc()).all()
        return jsonify({'success': True, 'teams': [t.to_dict() for t in teams]}), 200
    except Exception as e:
        log_error(f"Takım listesi hatası: {e}")
        return jsonify({'success': False, 'message': 'Takımlar listelenemedi'}), 500


@teams_bp.route('/teams', methods=['POST'])
def create_team():
    """Yeni takım oluştur"""
    try:
        data = request.get_json()
        name = data.get('name', '').strip()
        if not name:
            return jsonify({'success': False, 'message': 'Takım adı gereklidir'}), 400

        team = Team(
            name=name,
            description=data.get('description', ''),
            manager_id=data.get('manager_id'),
        )
        db.session.add(team)
        db.session.commit()
        log_success(f"Takım oluşturuldu: {name}")
        return jsonify({'success': True, 'team': team.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        log_error(f"Takım oluşturma hatası: {e}")
        return jsonify({'success': False, 'message': 'Takım oluşturulamadı'}), 500


@teams_bp.route('/teams/<int:team_id>', methods=['PUT'])
def update_team(team_id):
    """Takım güncelle"""
    try:
        team = Team.query.get_or_404(team_id)
        data = request.get_json()
        if 'name' in data:
            team.name = data['name'].strip()
        if 'description' in data:
            team.description = data['description']
        if 'manager_id' in data:
            team.manager_id = data['manager_id']
        if 'is_active' in data:
            team.is_active = data['is_active']
        db.session.commit()
        return jsonify({'success': True, 'team': team.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        log_error(f"Takım güncelleme hatası: {e}")
        return jsonify({'success': False, 'message': 'Takım güncellenemedi'}), 500


@teams_bp.route('/teams/<int:team_id>', methods=['DELETE'])
def delete_team(team_id):
    """Takım sil (soft delete)"""
    try:
        team = Team.query.get_or_404(team_id)
        team.is_active = False
        db.session.commit()
        return jsonify({'success': True, 'message': 'Takım silindi'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': 'Takım silinemedi'}), 500


@teams_bp.route('/teams/<int:team_id>/members', methods=['GET'])
def get_team_members(team_id):
    """Takım üyelerini getir"""
    try:
        team = Team.query.get_or_404(team_id)
        members = TeamMember.query.filter_by(team_id=team_id).all()
        return jsonify({
            'success': True,
            'team': team.to_dict(),
            'members': [m.to_dict() for m in members]
        }), 200
    except Exception as e:
        log_error(f"Takım üyeleri hatası: {e}")
        return jsonify({'success': False, 'message': 'Üyeler getirilemedi'}), 500


@teams_bp.route('/teams/<int:team_id>/members', methods=['POST'])
def add_team_member(team_id):
    """Takıma üye ekle"""
    try:
        data = request.get_json()
        user_id = data.get('user_id')
        if not user_id:
            return jsonify({'success': False, 'message': 'Kullanıcı ID gereklidir'}), 400

        # Zaten üye mi kontrol et
        existing = TeamMember.query.filter_by(team_id=team_id, user_id=user_id).first()
        if existing:
            return jsonify({'success': False, 'message': 'Kullanıcı zaten bu takımın üyesi'}), 400

        member = TeamMember(team_id=team_id, user_id=user_id)
        db.session.add(member)
        db.session.commit()
        log_success(f"Takıma üye eklendi: Team={team_id}, User={user_id}")
        return jsonify({'success': True, 'member': member.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        log_error(f"Üye ekleme hatası: {e}")
        return jsonify({'success': False, 'message': 'Üye eklenemedi'}), 500


@teams_bp.route('/teams/<int:team_id>/members/<int:user_id>', methods=['DELETE'])
def remove_team_member(team_id, user_id):
    """Takımdan üye çıkar"""
    try:
        member = TeamMember.query.filter_by(team_id=team_id, user_id=user_id).first_or_404()
        db.session.delete(member)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Üye çıkarıldı'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': 'Üye çıkarılamadı'}), 500


@teams_bp.route('/users/<int:user_id>/teams', methods=['GET'])
def get_user_teams(user_id):
    """Kullanıcının üye olduğu takımları getir"""
    try:
        memberships = TeamMember.query.filter_by(user_id=user_id).all()
        team_ids = [m.team_id for m in memberships]
        teams = Team.query.filter(Team.id.in_(team_ids), Team.is_active == True).all()
        return jsonify({'success': True, 'teams': [t.to_dict() for t in teams]}), 200
    except Exception as e:
        log_error(f"Kullanıcı takımları hatası: {e}")
        return jsonify({'success': False, 'message': 'Takımlar getirilemedi'}), 500
