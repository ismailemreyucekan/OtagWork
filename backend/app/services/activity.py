"""
Görev aktivite günlüğü (audit trail) yardımcıları.
Caller commit etmeli.
"""
from app.models import db, TaskActivity
from app.logger import log_error


def log(task_id, action, actor_id=None, old_value=None, new_value=None, note=None):
    try:
        if not task_id or not action:
            return None
        a = TaskActivity(
            task_id=task_id,
            actor_id=actor_id,
            action=action,
            old_value=str(old_value) if old_value is not None else None,
            new_value=str(new_value) if new_value is not None else None,
            note=note,
        )
        db.session.add(a)
        return a
    except Exception as e:
        log_error(f"Aktivite log hatası ({action}): {e}")
        return None
