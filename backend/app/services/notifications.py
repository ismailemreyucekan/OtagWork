"""
Bildirim servis katmanı.

Tek görevi: çağıran route'tan veri alıp Notification kaydı oluşturmak.
Hataları yutmaz ama log'lar — bildirim oluşturulamasa da ana işlem akışını bozmaz.
"""
from app.models import db, Notification, Identity
from app.logger import log_error
from app.services import mailer

# Bu tipler in-app bildirim DIŞINDA e-posta da yollar.
# Yorumlar ve durum değişiklikleri (gürültülü) hariç tutulur.
EMAIL_NOTIFY_TYPES = {
    'task_assigned',
    'task_approved',
    'task_rejected',
    'extension_requested',
    'extension_approved',
    'extension_rejected',
    'timesheet_rejected',  # onayda mail atmıyoruz — gereksiz spam
}


def _send_email_for(notif):
    """Bildirimi alacak kullanıcıya e-posta da gönder."""
    try:
        if notif.type not in EMAIL_NOTIFY_TYPES:
            return
        u = Identity.query.get(notif.user_id)
        if not u or not u.email:
            return
        mailer.send_email(
            to=u.email,
            subject=f'[OtagWork] {notif.title}',
            body_text=(
                f'Merhaba {u.first_name},\n\n'
                f'{notif.body or notif.title}\n\n'
                'Sisteme giriş yapmak için: http://localhost:5173\n\n'
                '— OtagWork'
            ),
        )
    except Exception as e:
        log_error(f"Bildirim e-postası gönderilemedi: {e}")


def _create(user_id, type_, title, body=None, ref_type=None, ref_id=None, actor_id=None):
    """Tek bir bildirim kaydı oluşturur. Caller sonra commit etmeli."""
    try:
        if not user_id:
            return None
        if actor_id and int(actor_id) == int(user_id):
            # Kendi yaptığı işlem için bildirim üretme
            return None
        n = Notification(
            user_id=user_id,
            type=type_,
            title=title,
            body=body,
            ref_type=ref_type,
            ref_id=ref_id,
            actor_id=actor_id,
        )
        db.session.add(n)
        # E-posta (SMTP yoksa console fallback — Faz 4.3)
        _send_email_for(n)
        return n
    except Exception as e:
        log_error(f"Bildirim oluşturulamadı ({type_}): {e}")
        return None


# ─── Görev bildirimleri ──────────────────────────────────────

def notify_task_assigned(task, actor_id=None):
    return _create(
        user_id=task.assigned_to,
        type_='task_assigned',
        title='Yeni görev atandı',
        body=f'"{task.title}" görevi size atandı. Son tarih: {task.due_date}',
        ref_type='task',
        ref_id=task.id,
        actor_id=actor_id,
    )


def notify_task_approval(task, approved, reject_reason=None, actor_id=None):
    if approved:
        return _create(
            user_id=task.assigned_to,
            type_='task_approved',
            title='Göreviniz onaylandı',
            body=f'"{task.title}" görevi onaylandı.',
            ref_type='task',
            ref_id=task.id,
            actor_id=actor_id,
        )
    return _create(
        user_id=task.assigned_to,
        type_='task_rejected',
        title='Göreviniz reddedildi',
        body=f'"{task.title}" görevi reddedildi. Sebep: {reject_reason or "—"}',
        ref_type='task',
        ref_id=task.id,
        actor_id=actor_id,
    )


def notify_task_status_changed(task, new_status, actor_id=None):
    """Görevin durumu değiştiğinde atayan kişiye bildirim."""
    if not task.assigned_by:
        return None
    status_label = {
        'beklemede': 'beklemede',
        'devam_ediyor': 'devam ediyor',
        'tamamlandi': 'tamamlandı',
        'iptal': 'iptal edildi',
    }.get(new_status, new_status)
    return _create(
        user_id=task.assigned_by,
        type_='task_status_changed',
        title='Görev durumu güncellendi',
        body=f'"{task.title}" görevinin durumu: {status_label}',
        ref_type='task',
        ref_id=task.id,
        actor_id=actor_id,
    )


def notify_extension_requested(task, actor_id=None):
    """Çalışan ek süre talep ettiğinde atayan yöneticiye bildirim."""
    if not task.assigned_by:
        return None
    return _create(
        user_id=task.assigned_by,
        type_='extension_requested',
        title='Ek süre talebi',
        body=f'"{task.title}" görevi için {task.extension_days} gün ek süre talep edildi.',
        ref_type='task',
        ref_id=task.id,
        actor_id=actor_id,
    )


def notify_extension_reviewed(task, approved, actor_id=None):
    """Yönetici ek süreyi onayladığında/reddettiğinde çalışana bildirim."""
    if approved:
        return _create(
            user_id=task.assigned_to,
            type_='extension_approved',
            title='Ek süre onaylandı',
            body=f'"{task.title}" için ek süreniz onaylandı. Yeni son tarih: {task.due_date}',
            ref_type='task',
            ref_id=task.id,
            actor_id=actor_id,
        )
    return _create(
        user_id=task.assigned_to,
        type_='extension_rejected',
        title='Ek süre reddedildi',
        body=f'"{task.title}" için ek süre talebiniz reddedildi.',
        ref_type='task',
        ref_id=task.id,
        actor_id=actor_id,
    )


# ─── Timesheet bildirimleri ───────────────────────────────────

def notify_timesheet_submitted(timesheet):
    """
    Kullanıcı bir timesheet'i 'Onay Bekliyor' durumuna aldığında,
    o kullanıcının üye olduğu takımların yöneticilerine bildirim atar.
    """
    try:
        # Geç import — circular import'tan kaçınmak için
        from app.models import Identity, TeamMember, Team

        owner = Identity.query.get(timesheet.identity_id)
        if not owner:
            return

        team_ids = [m.team_id for m in TeamMember.query.filter_by(user_id=owner.id).all()]
        manager_ids = set()
        if team_ids:
            for t in Team.query.filter(Team.id.in_(team_ids)).all():
                if t.manager_id and t.manager_id != owner.id:
                    manager_ids.add(t.manager_id)

        full_name = f'{owner.first_name} {owner.last_name}'.strip() or owner.email
        body = (
            f'{full_name} kullanıcısı {timesheet.work_date} tarihli '
            f'{timesheet.hours} saatlik timesheet kaydını onaya sundu.'
        )
        for mid in manager_ids:
            _create(
                user_id=mid,
                type_='timesheet_submitted',
                title='Yeni timesheet onay bekliyor',
                body=body,
                ref_type='timesheet',
                ref_id=timesheet.id,
                actor_id=owner.id,
            )
    except Exception as e:
        log_error(f"Timesheet submitted bildirimi hatası: {e}")


def notify_timesheet_status(timesheet, new_status, reject_reason=None, actor_id=None):
    """Timesheet onay/red durumunda kullanıcıya bildirim."""
    if new_status == 'Onaylandı' or new_status == 'onaylandi':
        return _create(
            user_id=timesheet.identity_id,
            type_='timesheet_approved',
            title='Timesheet onaylandı',
            body=f'{timesheet.work_date} tarihli timesheet kaydınız onaylandı.',
            ref_type='timesheet',
            ref_id=timesheet.id,
            actor_id=actor_id,
        )
    if new_status == 'Reddedildi' or new_status == 'reddedildi':
        return _create(
            user_id=timesheet.identity_id,
            type_='timesheet_rejected',
            title='Timesheet reddedildi',
            body=f'{timesheet.work_date} tarihli timesheet kaydınız reddedildi. Sebep: {reject_reason or "—"}',
            ref_type='timesheet',
            ref_id=timesheet.id,
            actor_id=actor_id,
        )
    return None


# ─── Yorum bildirimleri ───────────────────────────────────────

def notify_task_comment(task, comment_author_id, comment_excerpt):
    """Görev üzerine yorum eklendiğinde diğer ilgili taraflara bildirim."""
    recipients = set()
    if task.assigned_to:
        recipients.add(task.assigned_to)
    if task.assigned_by:
        recipients.add(task.assigned_by)
    recipients.discard(comment_author_id)

    for uid in recipients:
        _create(
            user_id=uid,
            type_='comment_added',
            title='Göreve yeni yorum',
            body=f'"{task.title}": {comment_excerpt[:120]}',
            ref_type='task',
            ref_id=task.id,
            actor_id=comment_author_id,
        )
