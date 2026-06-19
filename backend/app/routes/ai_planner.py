"""
AI Proje Planlayıcı route'ları.

Akış:
  1) POST /api/ai/plan-project — Gemini'den plan üretir (DB'ye dokunmaz).
  2) POST /api/ai/commit-plan  — Kullanıcının düzenlediği planı atomik olarak
     bir Project + N Task kaydı olarak yazar.

Tenant scope: Her iki endpoint de çağıran kullanıcının organization_id'sini
kullanır; hiçbir kayıt başka workspace'e sızmaz.
"""
from datetime import date, timedelta
from flask import Blueprint, request, jsonify

from app.models import db, Project, Task, Identity
from app.logger import log_error, log_success
from app.services import ai_planner
from app.services import notifications as notif
from app.services import activity as act

ai_planner_bp = Blueprint('ai_planner', __name__)


def _parse_date(val):
    if not val:
        return None
    try:
        return date.fromisoformat(val)
    except (ValueError, TypeError):
        return None


def _scope_user(req):
    """tasks._scope_user benzeri — header → query → body sırasıyla user_id arar."""
    uid = req.headers.get('X-User-Id')
    if not uid:
        uid = req.args.get('user_id')
    if not uid and req.is_json:
        body = req.get_json(silent=True) or {}
        uid = body.get('user_id') or body.get('identity_id')
    try:
        uid = int(uid) if uid else None
    except (ValueError, TypeError):
        uid = None
    if not uid:
        return None
    return Identity.query.filter_by(id=uid, is_active=True).first()


@ai_planner_bp.route('/ai/plan-project', methods=['POST'])
def plan_project():
    """
    AI ile proje planı üret. DB'ye yazma yapmaz; sadece yapılandırılmış
    görev listesi döner. Kullanıcı düzenleyip /ai/commit-plan ile gönderir.

    Body:
      {
        "user_id": int,
        "project_name": str,
        "description": str,
        "start_date": "YYYY-MM-DD",
        "end_date": "YYYY-MM-DD" | null,
        "daily_hours": float,
        "experience": "baslangic"|"orta"|"ileri",
        "technologies": [str, ...]
      }
    """
    try:
        actor = _scope_user(request)
        if not actor:
            return jsonify({'success': False, 'message': 'Kullanıcı doğrulanamadı'}), 401

        data = request.get_json(silent=True) or {}
        project_name = (data.get('project_name') or '').strip()
        description = (data.get('description') or '').strip()
        start_date = _parse_date(data.get('start_date'))
        end_date = _parse_date(data.get('end_date'))
        try:
            daily_hours = float(data.get('daily_hours') or 0)
        except (ValueError, TypeError):
            daily_hours = 0.0
        experience = (data.get('experience') or 'orta').strip().lower()
        mode = (data.get('mode') or 'personal').strip().lower()
        if mode not in ('personal', 'team'):
            mode = 'personal'
        technologies = data.get('technologies') or []
        if isinstance(technologies, str):
            technologies = [t.strip() for t in technologies.split(',') if t.strip()]
        elif isinstance(technologies, list):
            technologies = [str(t).strip() for t in technologies if str(t).strip()]
        else:
            technologies = []

        if not project_name:
            return jsonify({'success': False, 'message': 'Proje adı gereklidir'}), 400
        if not description:
            return jsonify({'success': False, 'message': 'Açıklama gereklidir'}), 400
        if not start_date:
            return jsonify({'success': False, 'message': 'Başlama tarihi geçersiz'}), 400
        if daily_hours <= 0:
            return jsonify({'success': False, 'message': 'Günlük çalışma saati pozitif olmalı'}), 400
        if end_date and end_date < start_date:
            return jsonify({'success': False, 'message': 'Teslim tarihi başlama tarihinden önce olamaz'}), 400

        result = ai_planner.generate_plan(
            project_name=project_name,
            description=description,
            start_date=start_date,
            end_date=end_date,
            daily_hours=daily_hours,
            experience=experience,
            technologies=technologies,
            mode=mode,
        )

        # Önizleme rahatlığı için her görev için önerilen start/due tarihlerini hesapla
        for t in result.get('tasks', []):
            offset = t.get('day_offset', 0)
            duration = max(t.get('duration_days', 1), 1)
            sd = start_date + timedelta(days=offset)
            dd = sd + timedelta(days=duration - 1)
            t['suggested_start_date'] = sd.isoformat()
            t['suggested_due_date'] = dd.isoformat()

        status = 200 if result.get('success') else 502
        return jsonify(result), status
    except Exception as e:
        log_error(f"AI plan üretim hatası: {e}")
        return jsonify({'success': False, 'message': 'AI planı üretilemedi'}), 500


@ai_planner_bp.route('/ai/commit-plan', methods=['POST'])
def commit_plan():
    """
    Kullanıcının onayladığı (düzenlenmiş) planı DB'ye yazar.
    Önce Project oluşturur, sonra her görev için Task oluşturur — tek
    transaction; hata olursa rollback.

    Body:
      {
        "user_id": int,
        "project": {
          "name": str,
          "description": str,
          "start_date": "YYYY-MM-DD" | null,
          "end_date":   "YYYY-MM-DD" | null
        },
        "tasks": [
          { "title": str, "description": str,
            "start_date": "YYYY-MM-DD" | null,
            "due_date":   "YYYY-MM-DD",
            "priority": "dusuk|orta|yuksek|kritik" }
        ]
      }
    """
    try:
        actor = _scope_user(request)
        if not actor:
            return jsonify({'success': False, 'message': 'Kullanıcı doğrulanamadı'}), 401

        data = request.get_json(silent=True) or {}
        proj_data = data.get('project') or {}
        tasks_data = data.get('tasks') or []

        project_name = (proj_data.get('name') or '').strip()
        if not project_name:
            return jsonify({'success': False, 'message': 'Proje adı gereklidir'}), 400
        if not isinstance(tasks_data, list) or not tasks_data:
            return jsonify({'success': False, 'message': 'En az bir görev gereklidir'}), 400

        # Önce tüm görevleri validate et — hiçbir şey yazmadan önce
        validated_tasks = []
        for idx, t in enumerate(tasks_data):
            title = (t.get('title') or '').strip()
            if not title:
                return jsonify({
                    'success': False,
                    'message': f'{idx + 1}. görevin başlığı boş olamaz',
                }), 400
            due_date = _parse_date(t.get('due_date'))
            if not due_date:
                return jsonify({
                    'success': False,
                    'message': f'{idx + 1}. görevin teslim tarihi geçersiz',
                }), 400
            priority = (t.get('priority') or 'orta').strip().lower()
            if priority not in ('dusuk', 'orta', 'yuksek', 'kritik'):
                priority = 'orta'

            # Atanan kişi — verilmişse aynı org'da aktif bir kullanıcı olmalı,
            # değilse görevi planı oluşturana ata.
            assignee_id = t.get('assigned_to')
            try:
                assignee_id = int(assignee_id) if assignee_id else None
            except (ValueError, TypeError):
                assignee_id = None
            if assignee_id:
                assignee = Identity.query.filter_by(id=assignee_id, is_active=True).first()
                if not assignee or assignee.organization_id != actor.organization_id:
                    assignee_id = None
            if not assignee_id:
                assignee_id = actor.id

            validated_tasks.append({
                'title': title,
                'description': (t.get('description') or '').strip(),
                'start_date': _parse_date(t.get('start_date')),
                'due_date': due_date,
                'priority': priority,
                'assigned_to': assignee_id,
            })

        # Project oluştur
        project = Project(
            organization_id=actor.organization_id,
            name=project_name,
            description=(proj_data.get('description') or '').strip(),
            start_date=_parse_date(proj_data.get('start_date')),
            end_date=_parse_date(proj_data.get('end_date')),
            status='aktif',
            created_by=actor.id,
        )
        db.session.add(project)
        db.session.flush()

        created_tasks = []
        for vt in validated_tasks:
            task = Task(
                organization_id=actor.organization_id,
                title=vt['title'],
                description=vt['description'],
                project_id=project.id,
                team_id=None,
                assigned_to=vt['assigned_to'],
                assigned_by=actor.id,
                start_date=vt['start_date'],
                due_date=vt['due_date'],
                priority=vt['priority'],
                status='beklemede',
                # Yönetici atadığı için otomatik onaylı (kendine veya ekibine)
                approval_status='onaylandi',
            )
            db.session.add(task)
            db.session.flush()
            act.log(task_id=task.id, action='created', actor_id=actor.id,
                    new_value=task.title)
            try:
                notif.notify_task_assigned(task, actor_id=actor.id)
            except Exception as ne:
                # Bildirim hatası tüm transaction'ı yıkmasın
                log_error(f"Bildirim gönderme hatası (task={task.id}): {ne}")
            created_tasks.append(task)

        db.session.commit()
        log_success(
            f"AI planı commit edildi: Proje '{project_name}' + {len(created_tasks)} görev "
            f"(user={actor.id}, org={actor.organization_id})"
        )
        return jsonify({
            'success': True,
            'project': project.to_dict(),
            'tasks': [t.to_dict() for t in created_tasks],
        }), 201
    except Exception as e:
        db.session.rollback()
        log_error(f"AI plan commit hatası: {e}")
        return jsonify({'success': False, 'message': 'Plan kaydedilemedi'}), 500
