"""
E-posta gönderim servisi.

SMTP yapılandırılmışsa gerçek mail yollar; yoksa console + logger'a düşer
(dev modu için yeterli, üretimde SMTP_HOST set edilmeli).
"""
import smtplib
from email.message import EmailMessage
from flask import current_app
from app.logger import log_operation, log_error, log_success


def send_email(to, subject, body_text, body_html=None):
    """
    to: str veya list[str]
    Geri dönüş: bool — true ise mail başarıyla bırakıldı (SMTP veya console).
    """
    if not to:
        return False

    if isinstance(to, str):
        to_list = [to]
    else:
        to_list = list(to)

    cfg = current_app.config
    host = cfg.get('SMTP_HOST', '')
    from_addr = cfg.get('SMTP_FROM', 'noreply@otagwork.local')

    # Dev modu: SMTP yapılandırılmamışsa log'a yaz, başarı dön
    if not host:
        preview = body_text[:300] + ('…' if len(body_text) > 300 else '')
        log_operation(
            'E-posta (DEV - SMTP yok)',
            f'TO: {", ".join(to_list)} | SUBJECT: {subject}\n----\n{preview}',
        )
        return True

    try:
        msg = EmailMessage()
        msg['Subject'] = subject
        msg['From'] = from_addr
        msg['To'] = ', '.join(to_list)
        msg.set_content(body_text)
        if body_html:
            msg.add_alternative(body_html, subtype='html')

        port = int(cfg.get('SMTP_PORT', 587))
        user = cfg.get('SMTP_USER', '')
        pwd = cfg.get('SMTP_PASS', '')
        use_tls = cfg.get('SMTP_USE_TLS', True)

        with smtplib.SMTP(host, port, timeout=10) as s:
            if use_tls:
                s.starttls()
            if user and pwd:
                s.login(user, pwd)
            s.send_message(msg)

        log_success(f"E-posta gönderildi: {to_list[0]} | {subject}")
        return True
    except Exception as e:
        log_error(f"E-posta gönderim hatası ({to_list}): {e}")
        return False
