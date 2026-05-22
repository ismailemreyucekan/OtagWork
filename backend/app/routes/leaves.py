"""
İzin/tatil yönetimi route'ları.

Akış:
  Kullanıcı POST /leaves  → 'onay_bekliyor'
  Yönetici PUT /leaves/:id/approval → 'onaylandi' | 'reddedildi'
  Kullanıcı PUT /leaves/:id/cancel  → 'iptal' (sadece kendi bekleyenleri için)
"""
from datetime import datetime, date
from flask import Blueprint, request, jsonify
from app.models import db, LeaveRequest, Identity, TeamMember, Team
from app.logger import log_error, log_success
from app.services import notifications as notif

leaves_bp = Blueprint('leaves', __name__)

VALID_TYPES = {'yillik', 'mazeret', 'saglik', 'ucretsiz', 'dogum', 'diger'}


def _parse_date(v):
    if not v:
        return None
    try:
        return date.fromisoformat(v)
    except (ValueError, TypeError):
        return None


@leaves_bp.route('/leaves', methods=['GET'])
def list_leaves():
    """
    Query:
      user_id        → bu kullanıcının talepleri
      manager_id     → bu yöneticinin takım üyelerinin talepleri (onay paneli)
      status         → durum filtresi
    """
    try:
        q = LeaveRequest.query
        user_id = request.args.get('user_id', type=int)
        manager_id = request.args.get('manager_id', type=int)
        status = request.args.get('status')

        if user_id:
            q = q.filter(LeaveRequest.user_id == user_id)
        elif manager_id:
            # Bu yöneticinin yönettiği takımların üyeleri
            team_ids = [t.id for t in Team.query.filter_by(manager_id=manager_id).all()]
            if team_ids:
                user_ids = [m.user_id for m in
                            TeamMember.query.filter(TeamMember.team_id.in_(team_ids)).all()]
                if user_ids:
                    q = q.filter(LeaveRequest.user_id.in_(user_ids))
                else:
                    return jsonify({'success': True, 'leaves': []}), 200
            else:
                return jsonify({'success': True, 'leaves': []}), 200
        if status:
            q = q.filter(LeaveRequest.status == status)

        rows = q.order_by(LeaveRequest.created_at.desc()).all()
        return jsonify({'success': True, 'leaves': [r.to_dict() for r in rows]}), 200
    except Exception as e:
        log_error(f"İzin listeleme hatası: {e}")
        return jsonify({'success': False, 'message': 'İzinler alınamadı'}), 500


@leaves_bp.route('/leaves', methods=['POST'])
def create_leave():
    """Body: { user_id, leave_type, start_date, end_date, reason? }"""
    try:
        data = request.get_json() or {}
        user_id = data.get('user_id')
        leave_type = (data.get('leave_type') or 'yillik').strip()
        start = _parse_date(data.get('start_date'))
        end = _parse_date(data.get('end_date'))
        reason = (data.get('reason') or '').strip()

        if not user_id:
            return jsonify({'success': False, 'message': 'user_id gereklidir'}), 400
        if leave_type not in VALID_TYPES:
            return jsonify({'success': False, 'message': f'Geçersiz tip: {leave_type}'}), 400
        if not start or not end:
            return jsonify({'success': False, 'message': 'Başlangıç ve bitiş tarihi gereklidir'}), 400
        if end < start:
            return jsonify({'success': False, 'message': 'Bitiş başlangıçtan önce olamaz'}), 400
        if not Identity.query.get(int(user_id)):
            return jsonify({'success': False, 'message': 'Kullanıcı bulunamadı'}), 404

        lr = LeaveRequest(
            user_id=int(user_id),
            leave_type=leave_type,
            start_date=start,
            end_date=end,
            reason=reason or None,
            status='onay_bekliyor',
        )
        db.session.add(lr)
        db.session.flush()

        # Kullanıcının takım yöneticilerine bildirim
        team_ids = [m.team_id for m in TeamMember.query.filter_by(user_id=int(user_id)).all()]
        manager_ids = {t.manager_id for t in Team.query.filter(Team.id.in_(team_ids)).all() if t.manager_id}
        for mid in manager_ids:
            if mid == int(user_id):
                continue
            notif._create(
                user_id=mid,
                type_='leave_requested',
                title='Yeni izin talebi',
                body=f'{lr.days()} günlük {leave_type} izin talebi ({lr.start_date} → {lr.end_date})',
                ref_type='leave',
                ref_id=lr.id,
                actor_id=int(user_id),
            )

        db.session.commit()
        log_success(f"İzin talebi: user={user_id}, {start}→{end}")
        return jsonify({'success': True, 'leave': lr.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        log_error(f"İzin talebi hatası: {e}")
        return jsonify({'success': False, 'message': 'Talep oluşturulamadı'}), 500


@leaves_bp.route('/leaves/<int:leave_id>/approval', methods=['PUT'])
def review_leave(leave_id):
    """Body: { status: 'onaylandi'|'reddedildi', reject_reason?, approver_id }"""
    try:
        lr = LeaveRequest.query.get_or_404(leave_id)
        data = request.get_json() or {}
        new_status = data.get('status')
        approver_id = data.get('approver_id')

        if new_status not in ('onaylandi', 'reddedildi'):
            return jsonify({'success': False, 'message': 'Geçersiz durum'}), 400
        if not approver_id:
            return jsonify({'success': False, 'message': 'approver_id gereklidir'}), 400
        approver = Identity.query.get(int(approver_id))
        if not approver or approver.user_type not in ('admin', 'manager'):
            return jsonify({'success': False, 'message': 'Yetkisiz onaylayıcı'}), 403

        lr.status = new_status
        lr.approved_by = int(approver_id)
        lr.approved_at = datetime.utcnow()
        if new_status == 'reddedildi':
            lr.reject_reason = (data.get('reject_reason') or '').strip() or None
        else:
            lr.reject_reason = None

        # Bildirim: izin sahibine
        if new_status == 'onaylandi':
            notif._create(
                user_id=lr.user_id, type_='leave_approved',
                title='İzin talebiniz onaylandı',
                body=f'{lr.start_date} → {lr.end_date} ({lr.days()} gün)',
                ref_type='leave', ref_id=lr.id, actor_id=int(approver_id),
            )
        else:
            notif._create(
                user_id=lr.user_id, type_='leave_rejected',
                title='İzin talebiniz reddedildi',
                body=f'Sebep: {lr.reject_reason or "—"}',
                ref_type='leave', ref_id=lr.id, actor_id=int(approver_id),
            )

        db.session.commit()
        log_success(f"İzin {new_status}: id={leave_id}")
        return jsonify({'success': True, 'leave': lr.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        log_error(f"İzin onay hatası: {e}")
        return jsonify({'success': False, 'message': 'İşlem başarısız'}), 500


@leaves_bp.route('/leaves/<int:leave_id>/cancel', methods=['PUT'])
def cancel_leave(leave_id):
    """Body: { user_id }  — sadece kendi onay_bekliyor talepleri iptal edilebilir."""
    try:
        lr = LeaveRequest.query.get_or_404(leave_id)
        data = request.get_json() or {}
        user_id = data.get('user_id')

        if not user_id or int(user_id) != lr.user_id:
            return jsonify({'success': False, 'message': 'Yetkisiz'}), 403
        if lr.status != 'onay_bekliyor':
            return jsonify({'success': False, 'message': 'Sadece bekleyen talepler iptal edilebilir'}), 400

        lr.status = 'iptal'
        db.session.commit()
        return jsonify({'success': True, 'leave': lr.to_dict()}), 200
    except Exception as e:
        db.session.rollback()
        log_error(f"İzin iptal hatası: {e}")
        return jsonify({'success': False, 'message': 'İptal başarısız'}), 500


@leaves_bp.route('/leaves/balance/<int:user_id>', methods=['GET'])
def leave_balance(user_id):
    """
    Bu yıl içinde kullanıcının onaylanan/bekleyen toplam izin günleri.
    Varsayılan yıllık hak: 14 (basit; gerçek hayatta tenure'a göre).
    """
    try:
        Identity.query.get_or_404(user_id)
        year = datetime.utcnow().year

        rows = LeaveRequest.query.filter(
            LeaveRequest.user_id == user_id,
            LeaveRequest.start_date >= date(year, 1, 1),
            LeaveRequest.start_date <= date(year, 12, 31),
        ).all()

        approved_days = sum(r.days() for r in rows if r.status == 'onaylandi' and r.leave_type == 'yillik')
        pending_days = sum(r.days() for r in rows if r.status == 'onay_bekliyor' and r.leave_type == 'yillik')

        annual_quota = 14
        return jsonify({
            'success': True,
            'year': year,
            'annual_quota': annual_quota,
            'approved_days': approved_days,
            'pending_days': pending_days,
            'remaining': max(0, annual_quota - approved_days),
        }), 200
    except Exception as e:
        log_error(f"İzin bakiyesi hatası: {e}")
        return jsonify({'success': False, 'message': 'Bakiye alınamadı'}), 500
