
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta

db = SQLAlchemy()


# ─────────────────────────────────────────────────────────────
# MULTI-TENANT — ORGANIZATION (workspace)
# ─────────────────────────────────────────────────────────────

class Organization(db.Model):
    """
    Workspace / Organization — multi-tenant SaaS modeli.
    Her kullanıcı bir Organization'a aittir; tüm veriler (Task, Timesheet,
    Leave, Project, Team, RecurringTaskRule) organization_id ile izole edilir.

    plan_type:
      - 'solo' : tek kişilik workspace (bireysel kullanıcı self-signup)
      - 'team' : çoklu üye workspace (takım yöneticisi self-signup yapar,
                üye ekler/davet eder)
    """
    __tablename__ = 'organizations'

    id          = db.Column(db.Integer, primary_key=True)
    name        = db.Column(db.String(120), nullable=False)
    slug        = db.Column(db.String(80), unique=True, nullable=False, index=True)
    plan_type   = db.Column(db.String(20), nullable=False, default='solo')  # 'solo' | 'team'
    owner_id    = db.Column(db.Integer, db.ForeignKey('identities.id', use_alter=True, name='fk_org_owner'), nullable=True)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at  = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner = db.relationship('Identity', foreign_keys=[owner_id], post_update=True)

    def __repr__(self):
        return f'<Organization {self.slug} ({self.plan_type})>'

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'slug': self.slug,
            'plan_type': self.plan_type,
            'owner_id': self.owner_id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class OrgInvite(db.Model):
    """
    Davet linki — yönetici e-posta + rol girerek davet üretir.
    Token URL ile kullanıcıya verilir; kullanıcı /invite/:token sayfasında
    şifresini belirler ve organizasyona katılır.

    Token tek kullanımlık (accepted_at sonrası geçersiz) ve 7 gün geçerlidir.
    """
    __tablename__ = 'org_invites'

    id              = db.Column(db.Integer, primary_key=True)
    organization_id = db.Column(db.Integer, db.ForeignKey('organizations.id'), nullable=False, index=True)
    email           = db.Column(db.String(255), nullable=False, index=True)
    role            = db.Column(db.String(20), nullable=False, default='member')  # 'manager' | 'member'
    token           = db.Column(db.String(96), unique=True, nullable=False, index=True)
    expires_at      = db.Column(db.DateTime, nullable=False)
    accepted_at     = db.Column(db.DateTime, nullable=True)
    invited_by      = db.Column(db.Integer, db.ForeignKey('identities.id'), nullable=True)
    created_at      = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    organization = db.relationship('Organization', foreign_keys=[organization_id])
    inviter      = db.relationship('Identity', foreign_keys=[invited_by])

    def is_valid(self):
        """Davet hâlâ kullanılabilir mi?"""
        return self.accepted_at is None and self.expires_at > datetime.utcnow()

    def to_dict(self, include_token=False):
        d = {
            'id': self.id,
            'organization_id': self.organization_id,
            'organization': self.organization.to_dict() if self.organization else None,
            'email': self.email,
            'role': self.role,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'accepted_at': self.accepted_at.isoformat() if self.accepted_at else None,
            'invited_by': self.invited_by,
            'is_valid': self.is_valid(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
        if include_token:
            d['token'] = self.token
        return d


# ─────────────────────────────────────────────────────────────
# IDENTITY (kullanıcı)
# ─────────────────────────────────────────────────────────────

class Identity(db.Model):

    __tablename__ = 'identities'

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    user_type = db.Column(db.String(20), nullable=False, default='user')  # legacy: 'user', 'manager', 'admin' (geriye dönük)
    phone_number = db.Column(db.String(20), nullable=True)
    first_name = db.Column(db.String(255), nullable=False)
    last_name = db.Column(db.String(255), nullable=False)

    # ── Multi-tenant ───────────────────────────────────────────
    # nullable=True başlangıçta — migration tüm satırları doldurur, sonra
    # uygulama düzeyinde zorunlu kılınır (signup zaten doldurur).
    organization_id = db.Column(db.Integer, db.ForeignKey('organizations.id'), nullable=True, index=True)
    org_role        = db.Column(db.String(20), nullable=False, default='member')  # 'owner' | 'manager' | 'member'

    # İlişkiler
    organization = db.relationship('Organization', foreign_keys=[organization_id], backref='members')
    managed_teams = db.relationship('Team', foreign_keys='Team.manager_id', backref='manager', lazy='dynamic')
    team_memberships = db.relationship('TeamMember', foreign_keys='TeamMember.user_id', backref='user', lazy='dynamic')
    assigned_tasks = db.relationship('Task', foreign_keys='Task.assigned_to', backref='assignee', lazy='dynamic')
    created_tasks = db.relationship('Task', foreign_keys='Task.assigned_by', backref='assigner', lazy='dynamic')

    def __repr__(self):
        return f'<Identity {self.email} ({self.org_role}@org{self.organization_id})>'

    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'first_name': self.first_name,
            'last_name': self.last_name,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'user_type': self.user_type,        # legacy
            'org_role': self.org_role,           # yeni
            'organization_id': self.organization_id,
            'phone_number': self.phone_number
        }


class Timesheet(db.Model):
    
    __tablename__ = 'timesheets'

    id = db.Column(db.Integer, primary_key=True)
    organization_id = db.Column(db.Integer, db.ForeignKey('organizations.id'), nullable=True, index=True)  # tenant scope
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
    """Timesheet ayarları (projeler, aktivite tipleri, çalışma şekilleri).
    Tenant scope: her organization kendi listesini tutar."""

    __tablename__ = 'timesheet_settings'

    id = db.Column(db.Integer, primary_key=True)
    organization_id = db.Column(db.Integer, db.ForeignKey('organizations.id'), nullable=True, index=True)
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
    organization_id = db.Column(db.Integer, db.ForeignKey('organizations.id'), nullable=True, index=True)  # tenant scope
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
    organization_id = db.Column(db.Integer, db.ForeignKey('organizations.id'), nullable=True, index=True)  # tenant scope
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
    organization_id = db.Column(db.Integer, db.ForeignKey('organizations.id'), nullable=True, index=True)  # tenant scope
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)

    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=True, index=True)
    team_id = db.Column(db.Integer, db.ForeignKey('teams.id'), nullable=True, index=True)
    assigned_to = db.Column(db.Integer, db.ForeignKey('identities.id'), nullable=False, index=True)
    assigned_by = db.Column(db.Integer, db.ForeignKey('identities.id'), nullable=False, index=True)

    # Alt görev / hiyerarşi
    parent_id = db.Column(db.Integer, db.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=True, index=True)
    subtasks = db.relationship('Task',
                                backref=db.backref('parent', remote_side='Task.id'),
                                cascade='all, delete-orphan',
                                single_parent=True)

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
            'parent_id': self.parent_id,
            'subtask_count': len(self.subtasks) if self.subtasks is not None else 0,
            'tags': [
                {'id': tt.tag.id, 'name': tt.tag.name, 'color': tt.tag.color}
                for tt in TaskTag.query.filter_by(task_id=self.id).all() if tt.tag
            ],
        }


class Tag(db.Model):
    """Görev etiketi (basit etiketleme)."""
    __tablename__ = 'tags'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(60), nullable=False, unique=True)
    color = db.Column(db.String(20), nullable=False, default='#FFD700')
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    def to_dict(self):
        return {'id': self.id, 'name': self.name, 'color': self.color}


class TaskTag(db.Model):
    """Görev-etiket ilişkisi."""
    __tablename__ = 'task_tags'

    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False, index=True)
    tag_id = db.Column(db.Integer, db.ForeignKey('tags.id', ondelete='CASCADE'), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    tag = db.relationship('Tag')

    __table_args__ = (db.UniqueConstraint('task_id', 'tag_id', name='uq_task_tag'),)


class TaskDependency(db.Model):
    """Görev bağımlılığı: blocker tamamlanmadan blocked başlayamaz."""
    __tablename__ = 'task_dependencies'

    id = db.Column(db.Integer, primary_key=True)
    blocker_id = db.Column(db.Integer, db.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False, index=True)
    blocked_id = db.Column(db.Integer, db.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (db.UniqueConstraint('blocker_id', 'blocked_id', name='uq_dep_pair'),)

    blocker = db.relationship('Task', foreign_keys=[blocker_id])
    blocked = db.relationship('Task', foreign_keys=[blocked_id])

    def to_dict(self):
        return {
            'id': self.id,
            'blocker_id': self.blocker_id,
            'blocked_id': self.blocked_id,
            'blocker': {
                'id': self.blocker.id,
                'title': self.blocker.title,
                'status': self.blocker.status,
            } if self.blocker else None,
            'blocked': {
                'id': self.blocked.id,
                'title': self.blocked.title,
                'status': self.blocked.status,
            } if self.blocked else None,
        }


# ─────────────────────────────────────────────────────────────
# GÖREV YORUMLARI & AKTİVİTE GÜNLÜĞÜ
# ─────────────────────────────────────────────────────────────

class RecurrenceRule(db.Model):
    """Tekrarlayan görev şablonu.

    frequency: daily | weekly | monthly
    weekdays:   weekly için CSV (0=Pzt..6=Paz), örn. '0,2,4'
    day_of_month: monthly için 1-28
    Şablon: title/description/priority/assignee/team/project, görev kopyalanırken kullanılır.
    """
    __tablename__ = 'recurrence_rules'

    id = db.Column(db.Integer, primary_key=True)
    organization_id = db.Column(db.Integer, db.ForeignKey('organizations.id'), nullable=True, index=True)  # tenant scope
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    assigned_to = db.Column(db.Integer, db.ForeignKey('identities.id'), nullable=False)
    assigned_by = db.Column(db.Integer, db.ForeignKey('identities.id'), nullable=False)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=True)
    team_id = db.Column(db.Integer, db.ForeignKey('teams.id'), nullable=True)
    priority = db.Column(db.String(20), nullable=False, default='orta')

    frequency = db.Column(db.String(20), nullable=False, default='weekly')
    weekdays = db.Column(db.String(20), nullable=True)
    day_of_month = db.Column(db.Integer, nullable=True)
    due_days_offset = db.Column(db.Integer, nullable=False, default=0)  # oluşturma günü + N gün = due_date

    start_date = db.Column(db.Date, nullable=False, default=datetime.utcnow().date)
    end_date = db.Column(db.Date, nullable=True)
    last_generated_on = db.Column(db.Date, nullable=True)

    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    assignee = db.relationship('Identity', foreign_keys=[assigned_to])
    assigner = db.relationship('Identity', foreign_keys=[assigned_by])
    project = db.relationship('Project', foreign_keys=[project_id])
    team = db.relationship('Team', foreign_keys=[team_id])

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description,
            'assigned_to': self.assigned_to,
            'assignee': {
                'id': self.assignee.id,
                'first_name': self.assignee.first_name,
                'last_name': self.assignee.last_name,
            } if self.assignee else None,
            'assigned_by': self.assigned_by,
            'project_id': self.project_id,
            'project': {'id': self.project.id, 'name': self.project.name} if self.project else None,
            'team_id': self.team_id,
            'team': {'id': self.team.id, 'name': self.team.name} if self.team else None,
            'priority': self.priority,
            'frequency': self.frequency,
            'weekdays': self.weekdays,
            'day_of_month': self.day_of_month,
            'due_days_offset': self.due_days_offset,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'end_date': self.end_date.isoformat() if self.end_date else None,
            'last_generated_on': self.last_generated_on.isoformat() if self.last_generated_on else None,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class LeaveRequest(db.Model):
    """İzin/tatil talebi."""
    __tablename__ = 'leave_requests'

    id = db.Column(db.Integer, primary_key=True)
    organization_id = db.Column(db.Integer, db.ForeignKey('organizations.id'), nullable=True, index=True)  # tenant scope
    user_id = db.Column(db.Integer, db.ForeignKey('identities.id'), nullable=False, index=True)
    leave_type = db.Column(db.String(40), nullable=False, default='yillik')
    # yillik | mazeret | saglik | ucretsiz | dogum | diger
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    reason = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(20), nullable=False, default='onay_bekliyor')
    # onay_bekliyor | onaylandi | reddedildi | iptal
    reject_reason = db.Column(db.Text, nullable=True)
    approved_by = db.Column(db.Integer, db.ForeignKey('identities.id'), nullable=True)
    approved_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    user = db.relationship('Identity', foreign_keys=[user_id])
    approver = db.relationship('Identity', foreign_keys=[approved_by])

    def days(self):
        if not self.start_date or not self.end_date:
            return 0
        return (self.end_date - self.start_date).days + 1

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'user': {
                'id': self.user.id,
                'first_name': self.user.first_name,
                'last_name': self.user.last_name,
                'email': self.user.email,
            } if self.user else None,
            'leave_type': self.leave_type,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'end_date': self.end_date.isoformat() if self.end_date else None,
            'days': self.days(),
            'reason': self.reason,
            'status': self.status,
            'reject_reason': self.reject_reason,
            'approved_by': self.approved_by,
            'approver': {
                'id': self.approver.id,
                'first_name': self.approver.first_name,
                'last_name': self.approver.last_name,
            } if self.approver else None,
            'approved_at': self.approved_at.isoformat() if self.approved_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class SystemAudit(db.Model):
    """Sistem güvenlik olaylarını tutan audit log.

    Olay tipleri:
      login_success | login_failed | logout |
      password_reset_requested | password_reset_done |
      2fa_setup | 2fa_enabled | 2fa_disabled | 2fa_verified | 2fa_failed |
      user_created | user_deleted | user_role_changed |
      task_deleted | rate_limited
    """
    __tablename__ = 'system_audit'

    id = db.Column(db.Integer, primary_key=True)
    event = db.Column(db.String(60), nullable=False, index=True)
    actor_id = db.Column(db.Integer, db.ForeignKey('identities.id'), nullable=True, index=True)
    target = db.Column(db.String(255), nullable=True)
    ip_address = db.Column(db.String(64), nullable=True)
    user_agent = db.Column(db.String(255), nullable=True)
    detail = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    actor = db.relationship('Identity', foreign_keys=[actor_id])

    def to_dict(self):
        return {
            'id': self.id,
            'event': self.event,
            'actor_id': self.actor_id,
            'actor': {
                'id': self.actor.id,
                'first_name': self.actor.first_name,
                'last_name': self.actor.last_name,
                'email': self.actor.email,
            } if self.actor else None,
            'target': self.target,
            'ip_address': self.ip_address,
            'detail': self.detail,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class PasswordResetToken(db.Model):
    """Şifre sıfırlama tokeni — tek kullanımlık, süreli."""
    __tablename__ = 'password_reset_tokens'

    id = db.Column(db.Integer, primary_key=True)
    identity_id = db.Column(db.Integer, db.ForeignKey('identities.id'), nullable=False, index=True)
    token = db.Column(db.String(128), nullable=False, unique=True, index=True)
    expires_at = db.Column(db.DateTime, nullable=False)
    used_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


class TaskComment(db.Model):
    """Görev yorumu"""
    __tablename__ = 'task_comments'

    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('identities.id'), nullable=False, index=True)
    body = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    user = db.relationship('Identity', foreign_keys=[user_id])

    def to_dict(self):
        return {
            'id': self.id,
            'task_id': self.task_id,
            'user_id': self.user_id,
            'user': {
                'id': self.user.id,
                'first_name': self.user.first_name,
                'last_name': self.user.last_name,
            } if self.user else None,
            'body': self.body,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class TaskActivity(db.Model):
    """Görev üzerinde gerçekleşen sistem olayları (audit trail).

    action örnekleri:
      created | status_changed | approval_changed | extension_requested |
      extension_reviewed | assignee_changed | due_date_changed | reopened |
      commented
    """
    __tablename__ = 'task_activities'

    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=False, index=True)
    actor_id = db.Column(db.Integer, db.ForeignKey('identities.id'), nullable=True)
    action = db.Column(db.String(60), nullable=False)
    # Eski/yeni değer veya kısa açıklama
    old_value = db.Column(db.String(255), nullable=True)
    new_value = db.Column(db.String(255), nullable=True)
    note = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    actor = db.relationship('Identity', foreign_keys=[actor_id])

    def to_dict(self):
        return {
            'id': self.id,
            'task_id': self.task_id,
            'actor_id': self.actor_id,
            'actor': {
                'id': self.actor.id,
                'first_name': self.actor.first_name,
                'last_name': self.actor.last_name,
            } if self.actor else None,
            'action': self.action,
            'old_value': self.old_value,
            'new_value': self.new_value,
            'note': self.note,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


# ─────────────────────────────────────────────────────────────
# DOSYA EKLERİ
# ─────────────────────────────────────────────────────────────

class Attachment(db.Model):
    """Görev veya proje dosya eki."""
    __tablename__ = 'attachments'

    id = db.Column(db.Integer, primary_key=True)
    task_id = db.Column(db.Integer, db.ForeignKey('tasks.id', ondelete='CASCADE'), nullable=True, index=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id', ondelete='CASCADE'), nullable=True, index=True)
    uploader_id = db.Column(db.Integer, db.ForeignKey('identities.id'), nullable=False, index=True)

    original_name = db.Column(db.String(255), nullable=False)
    stored_name = db.Column(db.String(255), nullable=False, unique=True)
    mime_type = db.Column(db.String(120), nullable=True)
    size_bytes = db.Column(db.Integer, nullable=False, default=0)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    uploader = db.relationship('Identity', foreign_keys=[uploader_id])

    def to_dict(self):
        return {
            'id': self.id,
            'task_id': self.task_id,
            'project_id': self.project_id,
            'uploader_id': self.uploader_id,
            'uploader': {
                'id': self.uploader.id,
                'first_name': self.uploader.first_name,
                'last_name': self.uploader.last_name,
            } if self.uploader else None,
            'original_name': self.original_name,
            'mime_type': self.mime_type,
            'size_bytes': self.size_bytes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


# ─────────────────────────────────────────────────────────────
# BİLDİRİM SİSTEMİ
# ─────────────────────────────────────────────────────────────

class Notification(db.Model):
    """Kullanıcı bildirimleri"""
    __tablename__ = 'notifications'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('identities.id'), nullable=False, index=True)

    # Olay tipi: task_assigned | task_approved | task_rejected |
    #            extension_requested | extension_approved | extension_rejected |
    #            timesheet_approved | timesheet_rejected | task_due_soon | comment_added
    type = db.Column(db.String(50), nullable=False, index=True)

    title = db.Column(db.String(255), nullable=False)
    body = db.Column(db.Text, nullable=True)

    # İlgili kayda referans (örn. task_id, timesheet_id)
    ref_type = db.Column(db.String(50), nullable=True)
    ref_id = db.Column(db.Integer, nullable=True)

    # Bildirimi tetikleyen kişi (opsiyonel)
    actor_id = db.Column(db.Integer, db.ForeignKey('identities.id'), nullable=True)

    read_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    actor = db.relationship('Identity', foreign_keys=[actor_id])

    def __repr__(self):
        return f'<Notification {self.type} → user {self.user_id}>'

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'type': self.type,
            'title': self.title,
            'body': self.body,
            'ref_type': self.ref_type,
            'ref_id': self.ref_id,
            'actor_id': self.actor_id,
            'actor': {
                'id': self.actor.id,
                'first_name': self.actor.first_name,
                'last_name': self.actor.last_name,
            } if self.actor else None,
            'read_at': self.read_at.isoformat() if self.read_at else None,
            'is_read': self.read_at is not None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }