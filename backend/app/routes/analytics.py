"""
Yönetici analitik endpoint'leri.

/api/analytics/overview        — Genel KPI'lar + grafik veri seti tek pakette
/api/analytics/user-workload   — Kişi başı görev yükü
/api/analytics/team-capacity   — Haftalık kapasite (saat)
"""
from datetime import datetime, date, timedelta
from collections import defaultdict
from flask import Blueprint, request, jsonify
from sqlalchemy import func, and_
from app.models import db, Task, Timesheet, Identity, Team, TeamMember
from app.logger import log_error

analytics_bp = Blueprint('analytics', __name__)


def _today():
    return date.today()


@analytics_bp.route('/analytics/overview', methods=['GET'])
def overview():
    """
    Query: ?manager_id=<int>   (verilirse o yöneticinin atadığı görevlerle sınırlanır)
    Çıktı: KPI'lar + grafik dataset'leri.
    """
    try:
        manager_id = request.args.get('manager_id', type=int)

        q = Task.query
        if manager_id:
            q = q.filter(Task.assigned_by == manager_id)

        all_tasks = q.all()
        today = _today()

        # KPI: durum bazlı sayım
        by_status = defaultdict(int)
        for t in all_tasks:
            by_status[t.status] += 1

        # KPI: gecikmiş
        overdue = sum(
            1 for t in all_tasks
            if t.due_date and t.due_date < today and t.status != 'tamamlandi'
        )

        # KPI: onay bekleyen
        pending_approval = sum(1 for t in all_tasks if t.approval_status == 'onay_bekliyor')

        # KPI: bu hafta tamamlanan
        week_start = today - timedelta(days=today.weekday())
        completed_this_week = sum(
            1 for t in all_tasks
            if t.status == 'tamamlandi' and t.updated_at
            and t.updated_at.date() >= week_start
        )

        # KPI: ek süre talebi bekleyen
        ext_pending = sum(
            1 for t in all_tasks
            if t.extension_requested and t.extension_status == 'onay_bekliyor'
        )

        # Grafik: öncelik dağılımı
        by_priority = defaultdict(int)
        for t in all_tasks:
            by_priority[t.priority] += 1

        # Grafik: son 14 gün — günlük yeni görev sayısı
        days = []
        for i in range(13, -1, -1):
            d = today - timedelta(days=i)
            days.append({
                'date': d.isoformat(),
                'created': sum(1 for t in all_tasks if t.created_at and t.created_at.date() == d),
                'completed': sum(1 for t in all_tasks
                                  if t.status == 'tamamlandi' and t.updated_at
                                  and t.updated_at.date() == d),
            })

        # Grafik: kişi başı görev yükü (top 8)
        per_user = defaultdict(lambda: {'total': 0, 'completed': 0, 'overdue': 0, 'name': ''})
        for t in all_tasks:
            uid = t.assigned_to
            per_user[uid]['total'] += 1
            if t.status == 'tamamlandi':
                per_user[uid]['completed'] += 1
            if t.due_date and t.due_date < today and t.status != 'tamamlandi':
                per_user[uid]['overdue'] += 1

        # Kullanıcı isimlerini getir
        if per_user:
            users = Identity.query.filter(Identity.id.in_(list(per_user.keys()))).all()
            name_map = {u.id: f'{u.first_name} {u.last_name}' for u in users}
            for uid, stats in per_user.items():
                stats['name'] = name_map.get(uid, f'#{uid}')

        user_workload = sorted(
            [{'user_id': uid, **stats} for uid, stats in per_user.items()],
            key=lambda x: -x['total']
        )[:8]

        # Timesheet özeti (manager filtresi yok — global)
        ts_query = Timesheet.query
        if manager_id:
            # manager'ın takım üyelerinin timesheet'leri
            team_ids = [t.id for t in Team.query.filter_by(manager_id=manager_id).all()]
            if team_ids:
                user_ids = [m.user_id for m in TeamMember.query.filter(TeamMember.team_id.in_(team_ids)).all()]
                if user_ids:
                    ts_query = ts_query.filter(Timesheet.identity_id.in_(user_ids))
                else:
                    ts_query = ts_query.filter(db.literal(False))
            else:
                ts_query = ts_query.filter(db.literal(False))

        ts_this_week = ts_query.filter(
            Timesheet.work_date >= week_start,
            Timesheet.work_date <= today,
            Timesheet.status != 'Taslak',
        ).all()

        ts_pending = ts_query.filter(Timesheet.status == 'Onay Bekliyor').count()
        hours_this_week = sum(t.hours or 0 for t in ts_this_week)

        # Ortalama tamamlanma süresi (gün)
        completed_tasks = [t for t in all_tasks if t.status == 'tamamlandi' and t.created_at and t.updated_at]
        avg_completion_days = 0
        if completed_tasks:
            total_days = sum((t.updated_at - t.created_at).total_seconds() / 86400.0 for t in completed_tasks)
            avg_completion_days = round(total_days / len(completed_tasks), 1)

        return jsonify({
            'success': True,
            'kpis': {
                'total_tasks': len(all_tasks),
                'overdue': overdue,
                'pending_approval': pending_approval,
                'completed_this_week': completed_this_week,
                'extension_pending': ext_pending,
                'timesheet_pending': ts_pending,
                'hours_this_week': round(hours_this_week, 1),
                'avg_completion_days': avg_completion_days,
            },
            'by_status': dict(by_status),
            'by_priority': dict(by_priority),
            'daily_trend': days,
            'user_workload': user_workload,
        }), 200
    except Exception as e:
        log_error(f"Analitik overview hatası: {e}")
        return jsonify({'success': False, 'message': 'Analitik verisi alınamadı'}), 500


@analytics_bp.route('/analytics/performance', methods=['GET'])
def performance():
    """
    Kişi bazlı performans tablosu.
    Her kullanıcı için:
      - assigned: atanan toplam görev
      - completed: tamamlanan
      - on_time: vadesinde tamamlanan
      - late: vadesi geçmişken tamamlanan veya hâlâ geciken
      - completion_rate: %
      - on_time_rate: %
      - avg_completion_days
      - score: basit normalize skor (0-100)
    """
    try:
        manager_id = request.args.get('manager_id', type=int)

        q = Task.query
        if manager_id:
            q = q.filter(Task.assigned_by == manager_id)
        tasks = q.all()
        today = _today()

        per = defaultdict(lambda: {
            'assigned': 0, 'completed': 0, 'on_time': 0, 'late': 0,
            'completion_days_sum': 0.0, 'completed_with_dates': 0,
        })

        for t in tasks:
            uid = t.assigned_to
            per[uid]['assigned'] += 1

            if t.status == 'tamamlandi':
                per[uid]['completed'] += 1
                if t.due_date and t.updated_at:
                    if t.updated_at.date() <= t.due_date:
                        per[uid]['on_time'] += 1
                    else:
                        per[uid]['late'] += 1
                    if t.created_at:
                        per[uid]['completion_days_sum'] += (t.updated_at - t.created_at).total_seconds() / 86400.0
                        per[uid]['completed_with_dates'] += 1
            elif t.due_date and t.due_date < today:
                # Tamamlanmamış ve süresi geçmiş
                per[uid]['late'] += 1

        # İsim eşle
        uids = list(per.keys())
        name_map = {}
        if uids:
            users = Identity.query.filter(Identity.id.in_(uids)).all()
            name_map = {u.id: f'{u.first_name} {u.last_name}' for u in users}

        result = []
        for uid, s in per.items():
            comp_rate = (s['completed'] / s['assigned'] * 100) if s['assigned'] else 0
            on_time_rate = (s['on_time'] / s['completed'] * 100) if s['completed'] else 0
            avg_days = (s['completion_days_sum'] / s['completed_with_dates']) if s['completed_with_dates'] else 0
            # Skor: tamamlanma oranı %40, zamanında tamamlama %50, hızlı tamamlama bonusu %10
            speed_bonus = max(0, min(10, 10 - (avg_days / 3))) if avg_days else 0
            score = round(comp_rate * 0.4 + on_time_rate * 0.5 + speed_bonus, 1)

            result.append({
                'user_id': uid,
                'name': name_map.get(uid, f'#{uid}'),
                'assigned': s['assigned'],
                'completed': s['completed'],
                'on_time': s['on_time'],
                'late': s['late'],
                'completion_rate': round(comp_rate, 1),
                'on_time_rate': round(on_time_rate, 1),
                'avg_completion_days': round(avg_days, 1),
                'score': score,
            })

        result.sort(key=lambda x: -x['score'])
        return jsonify({'success': True, 'rows': result}), 200
    except Exception as e:
        log_error(f"Performans analitiği hatası: {e}")
        return jsonify({'success': False, 'message': 'Performans verisi alınamadı'}), 500


@analytics_bp.route('/analytics/team-capacity', methods=['GET'])
def team_capacity():
    """
    Bu haftanın günlük toplam saat dağılımı (Onaylandı + Onay Bekliyor toplamı).
    Query: ?manager_id (opsiyonel — sadece o yöneticinin takım üyeleri)
    """
    try:
        manager_id = request.args.get('manager_id', type=int)
        today = _today()
        week_start = today - timedelta(days=today.weekday())

        q = Timesheet.query.filter(
            Timesheet.work_date >= week_start,
            Timesheet.work_date < week_start + timedelta(days=7),
            Timesheet.status != 'Taslak',
        )
        if manager_id:
            team_ids = [t.id for t in Team.query.filter_by(manager_id=manager_id).all()]
            user_ids = [m.user_id for m in TeamMember.query.filter(TeamMember.team_id.in_(team_ids)).all()] if team_ids else []
            if user_ids:
                q = q.filter(Timesheet.identity_id.in_(user_ids))
            else:
                return jsonify({'success': True, 'days': []}), 200

        rows = q.all()
        bucket = defaultdict(float)
        for r in rows:
            bucket[r.work_date.isoformat()] += r.hours or 0

        days = []
        for i in range(7):
            d = week_start + timedelta(days=i)
            days.append({'date': d.isoformat(),
                         'day_label': ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'][i],
                         'hours': round(bucket.get(d.isoformat(), 0), 1)})

        return jsonify({'success': True, 'days': days, 'week_start': week_start.isoformat()}), 200
    except Exception as e:
        log_error(f"Kapasite analitiği hatası: {e}")
        return jsonify({'success': False, 'message': 'Kapasite verisi alınamadı'}), 500
