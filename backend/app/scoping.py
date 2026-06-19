"""
Rol bazlı veri kapsamı (scoping) yardımcıları.

Üç rol vardır:
  - admin / owner : organizasyonun tamamını görür/yönetir.
  - manager       : YALNIZ yönettiği takımların (Team.manager_id == kendisi)
                    üyelerini, onların görevlerini, izinlerini, timesheet'lerini
                    ve kendi oluşturduğu/ekibinin çalıştığı projeleri görür.
  - member / user : standart kullanıcı (AdminDashboard'a girmez).

Bu modül route'lar tarafından paylaşılır; her route kendi tenant (organization)
filtresini zaten uygular — buradaki yardımcılar bunun ÜZERİNE yönetici kısıtı ekler.
"""
from app.models import Identity, Team, TeamMember


def resolve_actor(req):
    """İsteği yapan kullanıcıyı X-User-Id / user_id / manager_id üzerinden çözer."""
    uid = req.headers.get('X-User-Id') or req.args.get('user_id') or req.args.get('manager_id')
    if not uid and req.is_json:
        body = req.get_json(silent=True) or {}
        uid = body.get('user_id') or body.get('manager_id')
    try:
        uid = int(uid) if uid else None
    except (ValueError, TypeError):
        uid = None
    return Identity.query.filter_by(id=uid, is_active=True).first() if uid else None


def is_admin(actor):
    """Owner veya admin mi? (tam yetki)"""
    if not actor:
        return False
    return actor.org_role == 'owner' or actor.user_type == 'admin'


def is_manager(actor):
    """Yönetici mi? (admin/owner DEĞİL — kapsamı kendi ekibiyle sınırlı)"""
    if not actor:
        return False
    return (actor.org_role == 'manager' or actor.user_type == 'manager') and not is_admin(actor)


def manager_team_ids(actor):
    """Bu yöneticinin yönettiği aktif takımların id listesi."""
    if not actor:
        return []
    return [t.id for t in Team.query.filter_by(manager_id=actor.id).all()]


def manager_member_ids(actor):
    """Yöneticinin yönettiği takımların üye id'leri + yöneticinin kendisi (set)."""
    ids = set()
    team_ids = manager_team_ids(actor)
    if team_ids:
        ids.update(
            m.user_id for m in TeamMember.query.filter(TeamMember.team_id.in_(team_ids)).all()
        )
    if actor:
        ids.add(actor.id)
    return ids
