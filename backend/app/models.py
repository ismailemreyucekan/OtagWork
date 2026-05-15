
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class Identity(db.Model):
    
    __tablename__ = 'identities'
    
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    user_type = db.Column(db.String(20), nullable=False, default='user')  # 'user', 'manager', 'admin'
    phone_number = db.Column(db.String(20), nullable=True)
    first_name = db.Column(db.String(255), nullable=False)
    last_name = db.Column(db.String(255), nullable=False)
    
    # İlişkiler
    managed_teams = db.relationship('Team', foreign_keys='Team.manager_id', backref='manager', lazy='dynamic')
    team_memberships = db.relationship('TeamMember', foreign_keys='TeamMember.user_id', backref='user', lazy='dynamic')
    assigned_tasks = db.relationship('Task', foreign_keys='Task.assigned_to', backref='assignee', lazy='dynamic')
    created_tasks = db.relationship('Task', foreign_keys='Task.assigned_by', backref='assigner', lazy='dynamic')
    
    def __repr__(self):
        return f'<Identity {self.email} ({self.user_type})>'
    
    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'first_name': self.first_name,
            'last_name': self.last_name,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'user_type': self.user_type,
            'phone_number': self.phone_number
        }


class Timesheet(db.Model):
    
    __tablename__ = 'timesheets'

    id = db.Column(db.Integer, primary_key=True)
    identity_id = db.Column(db.Integer, db.ForeignKey('identities.id'), nullable=False, index=True)
    work_date = db.Column(db.Date, nullable=False, index=True)
    project = db.Column(db.String(255), nullable=False)
    activity_type = db.Column(db.String(100), nullable=False)
    work_mode = db.Column(db.String(50), nullable=False)
    hours = db.Column(db.Float, nullable=False)
    description = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(50), nullable=False, default='Taslak')
    reject_reason = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'identity_id': self.identity_id,
            'work_date': self.work_date.isoformat() if self.work_date else None,
            'project': self.project,
            'activity_type': self.activity_type,
            'work_mode': self.work_mode,
            'hours': self.hours,
            'description': self.description,
            'status': self.status,
            'reject_reason': self.reject_reason,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class TimesheetSetting(db.Model):
    """Timesheet ayarları (projeler, aktivite tipleri, çalışma şekilleri)"""
    
    __tablename__ = 'timesheet_settings'
    
    id = db.Column(db.Integer, primary_key=True)
    setting_type = db.Column(db.String(50), nullable=False, index=True)
    value = db.Column(db.String(255), nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    display_order = db.Column(db.Integer, default=0, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    
    def __repr__(self):
        return f'<TimesheetSetting {self.setting_type}: {self.value}>'
    
    def to_dict(self):
        return {
            'id': self.id,
            'setting_type': self.setting_type,
            'value': self.value,
            'is_active': self.is_active,
            'display_order': self.display_order,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


# ─────────────────────────────────────────────────────────────
# GÖREV YÖNETİMİ MODELLERİ
# ─────────────────────────────────────────────────────────────

class Team(db.Model):
    """Takım modeli"""
    __tablename__ = 'teams'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    manager_id = db.Column(db.Integer, db.ForeignKey('identities.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)

    members = db.relationship('TeamMember', backref='team', lazy='dynamic', cascade='all, delete-orphan')

    def __repr__(self):
        return f'<Team {self.name}>'

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'manager_id': self.manager_id,
            'manager': {
                'id': self.manager.id,
                'first_name': self.manager.first_name,
                'last_name': self.manager.last_name,
            } if self.manager else None,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'member_count': self.members.count(),
        }


class TeamMember(db.Model):
    """Takım üyeliği"""
    __tablename__ = 'team_members'

    id = db.Column(db.Integer, primary_key=True)
    team_id = db.Column(db.Integer, db.ForeignKey('teams.id'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('identities.id'), nullable=False, index=True)
    joined_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (db.UniqueConstraint('team_id', 'user_id', name='uq_team_user'),)

    def to_dict(self):
        return {
            'id': self.id,
            'team_id': self.team_id,
            'user_id': self.user_id,
            'user': {
                'id': self.user.id,
                'first_name': self.user.first_name,
                'last_name': self.user.last_name,
                'email': self.user.email,
                'user_type': self.user.user_type,
            } if self.user else None,
            'joined_at': self.joined_at.isoformat() if self.joined_at else None,
        }


class Project(db.Model):
    """Proje modeli"""
    __tablename__ = 'projects'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    start_date = db.Column(db.Date, nullable=True)
    end_date = db.Column(db.Date, nullable=True)
    status = db.Column(db.String(50), nullable=False, default='aktif')  # aktif, tamamlandi, iptal
    created_by = db.Column(db.Integer, db.ForeignKey('identities.id'), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    creator = db.relationship('Identity', foreign_keys=[created_by], backref='created_projects')
    tasks = db.relationship('Task', backref='project', lazy='dynamic', cascade='all, delete-orphan')

    def __repr__(self):
        return f'<Project {self.name}>'

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'end_date': self.end_date.isoformat() if self.end_date else None,
            'status': self.status,
            'created_by': self.created_by,
            'creator': {
                'id': self.creator.id,
                'first_name': self.creator.first_name,
                'last_name': self.creator.last_name,
            } if self.creator else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'task_count': self.tasks.count(),
        }


class Task(db.Model):
    """Görev modeli"""
    __tablename__ = 'tasks'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)

    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=True, index=True)
    team_id = db.Column(db.Integer, db.ForeignKey('teams.id'), nullable=True, index=True)
    assigned_to = db.Column(db.Integer, db.ForeignKey('identities.id'), nullable=False, index=True)
    assigned_by = db.Column(db.Integer, db.ForeignKey('identities.id'), nullable=False, index=True)

    start_date = db.Column(db.Date, nullable=True)
    due_date = db.Column(db.Date, nullable=False)

    # İş durumu
    status = db.Column(db.String(50), nullable=False, default='beklemede')
    # beklemede | devam_ediyor | tamamlandi | iptal

    # Öncelik
    priority = db.Column(db.String(20), nullable=False, default='orta')
    # dusuk | orta | yuksek | kritik

    # Onay süreci
    approval_status = db.Column(db.String(50), nullable=False, default='onay_bekliyor')
    # onay_bekliyor | onaylandi | reddedildi
    reject_reason = db.Column(db.Text, nullable=True)

    # Ek süre talebi
    extension_requested = db.Column(db.Boolean, default=False, nullable=False)
    extension_days = db.Column(db.Integer, nullable=True)
    extension_reason = db.Column(db.Text, nullable=True)
    extension_status = db.Column(db.String(20), nullable=True)
    # onay_bekliyor | onaylandi | reddedildi

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    team = db.relationship('Team', foreign_keys=[team_id], backref='tasks')

    def __repr__(self):
        return f'<Task {self.title}>'

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'project_id': self.project_id,
            'project': {
                'id': self.project.id,
                'name': self.project.name,
            } if self.project else None,
            'team_id': self.team_id,
            'team': {
                'id': self.team.id,
                'name': self.team.name,
            } if self.team else None,
            'assigned_to': self.assigned_to,
            'assignee': {
                'id': self.assignee.id,
                'first_name': self.assignee.first_name,
                'last_name': self.assignee.last_name,
                'email': self.assignee.email,
            } if self.assignee else None,
            'assigned_by': self.assigned_by,
            'assigner': {
                'id': self.assigner.id,
                'first_name': self.assigner.first_name,
                'last_name': self.assigner.last_name,
            } if self.assigner else None,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'status': self.status,
            'priority': self.priority,
            'approval_status': self.approval_status,
            'reject_reason': self.reject_reason,
            'extension_requested': self.extension_requested,
            'extension_days': self.extension_days,
            'extension_reason': self.extension_reason,
            'extension_status': self.extension_status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }