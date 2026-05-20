"""
Route kayıt modülü
"""
from app.routes.auth import auth_bp
from app.routes.health import health_bp
from app.routes.users import users_bp
from app.routes.timesheets import timesheets_bp
from app.routes.settings import settings_bp
from app.routes.timesheet_analysis import timesheet_analysis_bp
from app.routes.teams import teams_bp
from app.routes.projects import projects_bp
from app.routes.tasks import tasks_bp
from app.routes.notifications import notifications_bp
from app.routes.task_comments import task_comments_bp
from app.routes.attachments import attachments_bp
from app.routes.task_relations import task_relations_bp
from app.routes.tags_search import tags_search_bp
from app.routes.analytics import analytics_bp
from app.routes.reports import reports_bp
from app.routes.password_reset import password_reset_bp
from app.routes.two_factor import two_factor_bp
from app.routes.audit_log import audit_log_bp

def register_routes(app):
    """Tüm route'ları uygulamaya kaydeder"""
    app.register_blueprint(auth_bp, url_prefix='/api')
    app.register_blueprint(health_bp, url_prefix='/api')
    app.register_blueprint(users_bp, url_prefix='/api')
    app.register_blueprint(timesheets_bp, url_prefix='/api')
    app.register_blueprint(settings_bp, url_prefix='/api')
    app.register_blueprint(timesheet_analysis_bp, url_prefix='/api')
    app.register_blueprint(teams_bp, url_prefix='/api')
    app.register_blueprint(projects_bp, url_prefix='/api')
    app.register_blueprint(tasks_bp, url_prefix='/api')
    app.register_blueprint(notifications_bp, url_prefix='/api')
    app.register_blueprint(task_comments_bp, url_prefix='/api')
    app.register_blueprint(attachments_bp, url_prefix='/api')
    app.register_blueprint(task_relations_bp, url_prefix='/api')
    app.register_blueprint(tags_search_bp, url_prefix='/api')
    app.register_blueprint(analytics_bp, url_prefix='/api')
    app.register_blueprint(reports_bp, url_prefix='/api')
    app.register_blueprint(password_reset_bp, url_prefix='/api')
    app.register_blueprint(two_factor_bp, url_prefix='/api')
    app.register_blueprint(audit_log_bp, url_prefix='/api')
