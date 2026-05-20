"""
Sistem güvenlik olaylarını SystemAudit tablosuna yazar.
"""
from flask import request, has_request_context
from app.models import db, SystemAudit
from app.logger import log_error


def record(event, actor_id=None, target=None, detail=None):
    """Tek bir audit kaydı oluştur — caller commit etmeli."""
    try:
        ip = None
        ua = None
        if has_request_context():
            ip = request.headers.get('X-Forwarded-For', request.remote_addr) or None
            ua = (request.headers.get('User-Agent') or '')[:255] or None

        a = SystemAudit(
            event=event,
            actor_id=actor_id,
            target=target,
            ip_address=ip,
            user_agent=ua,
            detail=detail,
        )
        db.session.add(a)
        return a
    except Exception as e:
        log_error(f"Audit kayıt hatası ({event}): {e}")
        return None
