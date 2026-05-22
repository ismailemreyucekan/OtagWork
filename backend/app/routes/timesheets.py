"""
Timesheet route'ları
"""
from flask import Blueprint, request, jsonify
from datetime import datetime
from app.models import db, Timesheet, Identity
from app.logger import log_operation, log_error, log_success
from app.services import notifications as notif

timesheets_bp = Blueprint('timesheets', __name__)


def parse_date(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).date()
    except Exception:
        return None


@timesheets_bp.route('/timesheets', methods=['GET'])
def list_timesheets():
    """Timesheet kayıtlarını listeler (opsiyonel filtreler: user_id, start_date, end_date)"""
    try:
        user_id = request.args.get('user_id', type=int)
        start_date = parse_date(request.args.get('start_date'))
        end_date = parse_date(request.args.get('end_date'))
        include_drafts = request.args.get('include_drafts', 'false').lower() == 'true'
        status_filter = request.args.get('status')

        query = Timesheet.query
        if user_id:
            query = query.filter(Timesheet.identity_id == user_id)
        if start_date:
            query = query.filter(Timesheet.work_date >= start_date)
        if end_date:
            query = query.filter(Timesheet.work_date <= end_date)
        if not include_drafts:
            query = query.filter(Timesheet.status != 'Taslak')
        if status_filter:
            query = query.filter(Timesheet.status == status_filter)

        timesheets = query.order_by(Timesheet.work_date.desc(), Timesheet.id.desc()).all()
        log_success(f"Timesheet listelendi: {len(timesheets)} kayıt")
        return jsonify({
            'success': True,
            'timesheets': [t.to_dict() for t in timesheets],
            'total': len(timesheets)
        }), 200

    except Exception as e:
        log_error(f"Timesheet listeleme hatası: {e}")
        return jsonify({
            'success': False,
            'message': 'Timesheet listelenirken bir hata oluştu'
        }), 500


@timesheets_bp.route('/timesheets', methods=['POST'])
def create_timesheet():
    """Yeni timesheet kaydı oluşturur"""
    try:
        data = request.get_json() or {}
        identity_id = data.get('identity_id')
        work_date = parse_date(data.get('work_date'))
        project = data.get('project')
        activity_type = data.get('activity_type')
        work_mode = data.get('work_mode')
        hours = data.get('hours')
        description = data.get('description')
        status = data.get('status') or 'Taslak'

        if not identity_id or not work_date or not project or not activity_type or not work_mode or hours is None:
            return jsonify({
                'success': False,
                'message': 'identity_id, work_date, project, activity_type, work_mode ve hours zorunludur'
            }), 400

        # Kullanıcı var mı?
        identity = Identity.query.get(identity_id)
        if not identity:
            return jsonify({'success': False, 'message': 'Kullanıcı bulunamadı'}), 404

        ts = Timesheet(
            identity_id=identity_id,
            work_date=work_date,
            project=project,
            activity_type=activity_type,
            work_mode=work_mode,
            hours=hours,
            description=description,
            status=status,
            reject_reason=None
        )
        db.session.add(ts)
        db.session.flush()

        # Oluştururken doğrudan onaya gönderildiyse, yöneticilere bildirim
        if status == 'Onay Bekliyor':
            notif.notify_timesheet_submitted(ts)

        db.session.commit()

        log_success(f"Timesheet oluşturuldu: Kullanıcı {identity.email} - {work_date}")
        return jsonify({'success': True, 'timesheet': ts.to_dict()}), 201

    except Exception as e:
        db.session.rollback()
        log_error(f"Timesheet oluşturma hatası: {e}")
        return jsonify({
            'success': False,
            'message': 'Timesheet oluşturulurken bir hata oluştu'
        }), 500


@timesheets_bp.route('/timesheets/<int:ts_id>', methods=['PUT'])
def update_timesheet(ts_id):
    """Timesheet kaydını günceller"""
    try:
        data = request.get_json() or {}
        ts = Timesheet.query.get_or_404(ts_id)

        if 'work_date' in data:
            parsed = parse_date(data.get('work_date'))
            if parsed:
                ts.work_date = parsed
        if 'project' in data:
            ts.project = data.get('project', ts.project)
        if 'activity_type' in data:
            ts.activity_type = data.get('activity_type', ts.activity_type)
        if 'work_mode' in data:
            ts.work_mode = data.get('work_mode', ts.work_mode)
        if 'hours' in data and data['hours'] is not None:
            ts.hours = data['hours']
        if 'description' in data:
            ts.description = data.get('description')
        status_changed = False
        new_status_val = None
        if 'status' in data:
            new_status = data.get('status', ts.status)
            if new_status != ts.status:
                status_changed = True
                new_status_val = new_status
            ts.status = new_status
            if new_status == 'Reddedildi':
                ts.reject_reason = data.get('reject_reason')
            else:
                ts.reject_reason = None

        if status_changed and new_status_val == 'Onay Bekliyor':
            # Kullanıcı taslağı onaya gönderdi → yöneticilere bildirim
            notif.notify_timesheet_submitted(ts)

        if status_changed and new_status_val in ('Onaylandı', 'Reddedildi'):
            notif.notify_timesheet_status(
                ts, new_status_val,
                reject_reason=ts.reject_reason,
                actor_id=data.get('actor_id'),
            )

        db.session.commit()
        log_success(f"Timesheet güncellendi: ID {ts_id}")
        return jsonify({'success': True, 'timesheet': ts.to_dict()}), 200

    except Exception as e:
        db.session.rollback()
        log_error(f"Timesheet güncelleme hatası: {e}")
        return jsonify({
            'success': False,
            'message': 'Timesheet güncellenirken bir hata oluştu'
        }), 500


@timesheets_bp.route('/timesheets/<int:ts_id>', methods=['DELETE'])
def delete_timesheet(ts_id):
    """Timesheet kaydını siler"""
    try:
        ts = Timesheet.query.get_or_404(ts_id)
        db.session.delete(ts)
        db.session.commit()
        log_success(f"Timesheet silindi: ID {ts_id}")
        return jsonify({'success': True, 'message': 'Silindi'}), 200
    except Exception as e:
        db.session.rollback()
        log_error(f"Timesheet silme hatası: {e}")
        return jsonify({
            'success': False,
            'message': 'Timesheet silinirken bir hata oluştu'
        }), 500


