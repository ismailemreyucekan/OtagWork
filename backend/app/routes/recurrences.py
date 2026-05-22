"""
Tekrarlayan görev kurallarının yönetimi + manuel "şimdi tetikle".

Otomatik tetiklenmesi için POST /recurrences/generate çağrısı bir cron/worker tarafından
günlük yapılmalı. Manuel test için endpoint açık.
"""
from datetime import datetime, date, timedelta
from flask import Blueprint, request, jsonify
from app.models import db, RecurrenceRule, Task, Identity
from app.logger import log_error, log_success
from app.services import notifications as notif
from app.services import activity as act

recurrences_bp = Blueprint('recurrences', __name__)


def _parse_date(v):
    if not v: return None
    try: return date.fromisoformat(v)
    except (ValueError, TypeError): return None


def _due_today(rule, today):
    """Bu kural bugün yeni görev üretmeli mi?"""
    if not rule.is_active:
        return False
    if rule.start_date and today < rule.start_date:
        return False
    if rule.end_date and today > rule.end_date:
        return False
    if rule.last_generated_on and rule.last_generated_on == today:
        # Aynı gün ikinci kez üretme
        return False

    if rule.frequency == 'daily':
        return True
    if rule.frequency == 'weekly':
        wd = today.weekday()  # 0=Pzt..6=Paz
        wds = [int(x) for x in (rule.weekdays or '').split(',') if x.strip().isdigit()]
        return wd in wds
    if rule.frequency == 'monthly':
        return rule.day_of_month and today.day == rule.day_of_month
    return False


def _spawn_task(rule, today):
    due = today + timedelta(days=int(rule.due_days_offset or 0))
    t = Task(
        title=rule.title,
        description=rule.description,
        project_id=rule.project_id,
        team_id=rule.team_id,
        assigned_to=rule.assigned_to,
        assigned_by=rule.assigned_by,
        start_date=today,
        due_date=due,
        priority=rule.priority,
        status='beklemede',
        approval_status='onay_bekliyor',
    )
    db.session.add(t)
    db.session.flush()
    act.log(task_id=t.id, action='created', actor_id=rule.assigned_by,
            new_value=t.title, note=f'tekrarlayan görev (kural #{rule.id})')
    notif.notify_task_assigned(t, actor_id=rule.assigned_by)
    rule.last_generated_on = today
    return t


@recurrences_bp.route('/recurrences', methods=['GET'])
def list_rules():
    try:
        q = RecurrenceRule.query
        owner = request.args.get('owner_id', type=int)
        if owner:
            q = q.filter(RecurrenceRule.assigned_by == owner)
        rows = q.order_by(RecurrenceRule.created_at.desc()).all()
        return jsonify({'success': True, 'rules': [r.to_dict() for r in rows]}), 200
    except Exception as e:
        log_error(f"Recurrence listeleme hatası: {e}")
        return jsonify({'success': False, 'message': 'Kurallar alınamadı'}), 500


@recurrences_bp.route('/recurrences', methods=['POST'])
def create_rule():
    try:
        data = request.get_json() or {}
        title = (data.get('title') or '').strip()
        assigned_to = data.get('assigned_to')
        assigned_by = data.get('assigned_by')
        frequency = data.get('frequency', 'weekly')

        if not title:
            return jsonify({'success': False, 'message': 'Başlık zorunlu'}), 400
        if not assigned_to or not assigned_by:
            return jsonify({'success': False, 'message': 'Atanan/Atayan gereklidir'}), 400
        if frequency not in ('daily', 'weekly', 'monthly'):
            return jsonify({'success': False, 'message': 'Geçersiz frekans'}), 400

        weekdays = data.get('weekdays')
        if frequency == 'weekly':
            if not weekdays:
                return jsonify({'success': False, 'message': 'Haftalık tekrar için gün listesi gereklidir'}), 400
            wds = [str(int(x)) for x in str(weekdays).split(',') if str(x).strip().isdigit() and 0 <= int(x) <= 6]
            if not wds:
                return jsonify({'success': False, 'message': 'Gün listesi geçersiz'}), 400
            weekdays = ','.join(wds)

        dom = data.get('day_of_month')
        if frequency == 'monthly':
            try:
                dom = int(dom)
                if dom < 1 or dom > 28:
                    raise ValueError()
            except (TypeError, ValueError):
                return jsonify({'success': False, 'message': 'day_of_month 1-28 arası olmalı'}), 400

        rule = RecurrenceRule(
            title=title,
            description=data.get('description'),
            assigned_to=int(assigned_to),
            assigned_by=int(assigned_by),
            project_id=data.get('project_id') or None,
            team_id=data.get('team_id') or None,
            priority=data.get('priority', 'orta'),
            frequency=frequency,
            weekdays=weekdays if frequency == 'weekly' else None,
            day_of_month=dom if frequency == 'monthly' else None,
            due_days_offset=int(data.get('due_days_offset', 0) or 0),
            start_date=_parse_date(data.get('start_date')) or date.today(),
            end_date=_parse_date(data.get('end_date')),
            is_active=bool(data.get('is_active', True)),
        )
        db.session.add(rule)
        db.session.commit()
        log_success(f"Tekrarlayan görev kuralı: {title} | {frequency}")
        return jsonify({'success': True, 'rule': rule.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        log_error(f"Recurrence oluşturma hatası: {e}")
        return jsonify({'success': False, 'message': 'Kural oluşturulamadı'}), 500


@recurrences_bp.route('/recurrences/<int:rule_id>', methods=['PUT'])
def update_rule(rule_id):
    try:
        rule = RecurrenceRule.query.get_or_404(rule_id)
        data = request.get_json() or {}
        for f in ('title', 'description', 'priority', 'frequency'):
            if f in data:
                setattr(rule, f, data[f])
        if 'is_active' in data:
            rule.is_active = bool(data['is_active'])
        if 'weekdays' in data:
            rule.weekdays = data['weekdays']
        if 'day_of_month' in data:
            rule.day_of_month = data['day_of_month']
        if 'due_days_offset' in data:
            rule.due_days_offset = int(data['due_days_offset'])
        if 'end_date' in data:
            rule.end_date = _parse_date(data['end_date'])
        db.session.commit()
        return jsonify({'success': True, 'rule': rule.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        log_error(f"Recurrence güncelleme hatası: {e}")
        return jsonify({'success': False, 'message': 'Güncellenemedi'}), 500


@recurrences_bp.route('/recurrences/<int:rule_id>', methods=['DELETE'])
def delete_rule(rule_id):
    try:
        rule = RecurrenceRule.query.get_or_404(rule_id)
        db.session.delete(rule)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Silindi'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': 'Silinemedi'}), 500


@recurrences_bp.route('/recurrences/generate', methods=['POST'])
def generate_now():
    """
    Manuel tetikleme: tüm aktif kurallar için bugün üretilmesi gerekenleri üretir.
    Bu uç günlük bir cron tarafından çağrılmalıdır (örn. 06:00 UTC).
    Body opsiyonel: { date: 'YYYY-MM-DD' }  → o tarihi varsayar (test için).
    """
    try:
        data = request.get_json(silent=True) or {}
        target = _parse_date(data.get('date')) or date.today()

        rules = RecurrenceRule.query.filter_by(is_active=True).all()
        spawned = []
        for r in rules:
            if _due_today(r, target):
                t = _spawn_task(r, target)
                spawned.append({'rule_id': r.id, 'task_id': t.id, 'title': t.title})

        db.session.commit()
        log_success(f"Tekrarlayan görev üretimi: {len(spawned)} görev | tarih={target}")
        return jsonify({'success': True, 'generated': spawned, 'date': target.isoformat()}), 200
    except Exception as e:
        db.session.rollback()
        log_error(f"Recurrence generate hatası: {e}")
        return jsonify({'success': False, 'message': 'Üretim başarısız'}), 500
