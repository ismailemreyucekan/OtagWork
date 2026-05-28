"""
Timesheet ayarları route'ları
"""
from flask import Blueprint, request, jsonify
from app.models import db, TimesheetSetting, Identity
from app.logger import log_operation, log_error, log_success

settings_bp = Blueprint('settings', __name__)


def _scope_user(req):
    """X-User-Id veya query/body user_id ile çağıran kullanıcıyı al."""
    uid = req.headers.get('X-User-Id') or req.args.get('user_id')
    if not uid and req.is_json:
        body = req.get_json(silent=True) or {}
        uid = body.get('user_id')
    try: uid = int(uid) if uid else None
    except: uid = None
    return Identity.query.filter_by(id=uid, is_active=True).first() if uid else None


@settings_bp.route('/timesheet-settings', methods=['GET'])
def list_settings():
    """Timesheet ayarlarını listeler (tenant-scoped + opsiyonel filtreler)."""
    try:
        setting_type = request.args.get('setting_type')
        include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'
        actor = _scope_user(request)

        try:
            query = TimesheetSetting.query
            # Tenant scope — kullanıcının org'una ait olanlar
            if actor and actor.organization_id:
                query = query.filter(TimesheetSetting.organization_id == actor.organization_id)
        except Exception as db_error:
            log_error(f"Veritabanı sorgu hatası: {db_error}")
            try:
                db.create_all()
                log_success("Timesheet settings tablosu oluşturuldu")
                query = TimesheetSetting.query
            except Exception as create_error:
                log_error(f"Tablo oluşturma hatası: {create_error}")
                return jsonify({
                    'success': True,
                    'settings': [],
                    'total': 0,
                    'message': 'Tablo henüz oluşturulmadı'
                }), 200
        
        if setting_type:
            query = query.filter(TimesheetSetting.setting_type == setting_type)
        
        if not include_inactive:
            query = query.filter(TimesheetSetting.is_active == True)
        
        settings = query.order_by(
            TimesheetSetting.setting_type,
            TimesheetSetting.display_order,
            TimesheetSetting.value
        ).all()
        
        log_success(f"Timesheet ayarları listelendi: {len(settings)} kayıt")
        return jsonify({
            'success': True,
            'settings': [s.to_dict() for s in settings],
            'total': len(settings)
        }), 200

    except Exception as e:
        log_error(f"Timesheet ayarları listeleme hatası: {e}")
        return jsonify({
            'success': True,
            'settings': [],
            'total': 0,
            'message': f'Ayarlar listelenirken bir hata oluştu: {str(e)}'
        }), 200


@settings_bp.route('/timesheet-settings', methods=['POST'])
def create_setting():
    """Yeni timesheet ayarı oluşturur"""
    try:
        data = request.get_json() or {}
        setting_type = data.get('setting_type')
        value = data.get('value')
        is_active = data.get('is_active', True)
        display_order = data.get('display_order', 0)

        if not setting_type or not value:
            return jsonify({
                'success': False,
                'message': 'setting_type ve value zorunludur'
            }), 400

        # Geçerli setting_type kontrolü
        valid_types = ['project', 'activity_type', 'work_mode']
        if setting_type not in valid_types:
            return jsonify({
                'success': False,
                'message': f'setting_type şunlardan biri olmalıdır: {", ".join(valid_types)}'
            }), 400

        # Tenant scope kullanıcısı
        actor = _scope_user(request)
        org_id = actor.organization_id if actor else None

        # Aynı değerin aynı tipte aynı org'da olup olmadığını kontrol et
        try:
            existing = TimesheetSetting.query.filter_by(
                setting_type=setting_type,
                value=value,
                organization_id=org_id,
            ).first()
        except Exception as db_error:
            log_error(f"Veritabanı sorgu hatası: {db_error}")
            try:
                db.create_all()
                log_success("Timesheet settings tablosu oluşturuldu")
                existing = None
            except Exception as create_error:
                log_error(f"Tablo oluşturma hatası: {create_error}")
                return jsonify({
                    'success': False,
                    'message': f'Veritabanı hatası: {str(create_error)}. Lütfen veritabanı tablosunu oluşturun.'
                }), 500
        
        if existing:
            return jsonify({
                'success': False,
                'message': 'Bu ayar zaten mevcut'
            }), 400

        setting = TimesheetSetting(
            organization_id=org_id,
            setting_type=setting_type,
            value=value,
            is_active=is_active,
            display_order=display_order
        )
        db.session.add(setting)
        db.session.commit()
        log_success(f"Timesheet ayarı oluşturuldu (org={org_id}): {setting_type} - {value}")
        return jsonify({'success': True, 'setting': setting.to_dict()}), 201

    except Exception as e:
        db.session.rollback()
        log_error(f"Timesheet ayarı oluşturma hatası: {e}")
        return jsonify({
            'success': False,
            'message': f'Ayar oluşturulurken bir hata oluştu: {str(e)}'
        }), 500


@settings_bp.route('/timesheet-settings/<int:setting_id>', methods=['PUT'])
def update_setting(setting_id):
    """Timesheet ayarını günceller (tenant scope)."""
    try:
        data = request.get_json() or {}
        setting = TimesheetSetting.query.get_or_404(setting_id)
        actor = _scope_user(request)
        if actor and setting.organization_id and setting.organization_id != actor.organization_id:
            return jsonify({'success': False, 'message': 'Bulunamadı'}), 404

        if 'value' in data:
            # Aynı değerin başka bir kayıtta olup olmadığını kontrol et
            existing = TimesheetSetting.query.filter_by(
                setting_type=setting.setting_type,
                value=data['value']
            ).filter(TimesheetSetting.id != setting_id).first()
            
            if existing:
                return jsonify({
                    'success': False,
                    'message': 'Bu değer zaten mevcut'
                }), 400
            
            setting.value = data['value']
        
        if 'is_active' in data:
            setting.is_active = data['is_active']
        
        if 'display_order' in data:
            setting.display_order = data['display_order']

        db.session.commit()
        log_success(f"Timesheet ayarı güncellendi: ID {setting_id}")
        return jsonify({'success': True, 'setting': setting.to_dict()}), 200

    except Exception as e:
        db.session.rollback()
        log_error(f"Timesheet ayarı güncelleme hatası: {e}")
        return jsonify({
            'success': False,
            'message': 'Ayar güncellenirken bir hata oluştu'
        }), 500


@settings_bp.route('/timesheet-settings/<int:setting_id>', methods=['DELETE'])
def delete_setting(setting_id):
    """Timesheet ayarını siler (tenant scope)."""
    try:
        setting = TimesheetSetting.query.get_or_404(setting_id)
        actor = _scope_user(request)
        if actor and setting.organization_id and setting.organization_id != actor.organization_id:
            return jsonify({'success': False, 'message': 'Bulunamadı'}), 404
        db.session.delete(setting)
        db.session.commit()
        log_success(f"Timesheet ayarı silindi: ID {setting_id}")
        return jsonify({'success': True, 'message': 'Silindi'}), 200
    except Exception as e:
        db.session.rollback()
        log_error(f"Timesheet ayarı silme hatası: {e}")
        return jsonify({
            'success': False,
            'message': 'Ayar silinirken bir hata oluştu'
        }), 500


@settings_bp.route('/timesheet-settings/grouped', methods=['GET'])
def get_grouped_settings():
    """Timesheet ayarlarını tipine göre gruplandırılmış olarak döner (tenant-scoped).
    Çağıran kullanıcının X-User-Id veya user_id'sine göre sadece kendi org'unun
    kayıtları döner — başka workspace'lerin değerleri sızmaz."""
    try:
        include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'
        actor = _scope_user(request)

        query = TimesheetSetting.query
        # Tenant scope — kullanıcının org'u
        if actor and actor.organization_id:
            query = query.filter(TimesheetSetting.organization_id == actor.organization_id)
        if not include_inactive:
            query = query.filter(TimesheetSetting.is_active == True)
        
        settings = query.order_by(
            TimesheetSetting.setting_type,
            TimesheetSetting.display_order,
            TimesheetSetting.value
        ).all()
        
        # Gruplandır
        grouped = {
            'projects': [],
            'activity_types': [],
            'work_modes': []
        }
        
        for s in settings:
            if s.setting_type == 'project':
                grouped['projects'].append(s.value)
            elif s.setting_type == 'activity_type':
                grouped['activity_types'].append(s.value)
            elif s.setting_type == 'work_mode':
                grouped['work_modes'].append(s.value)
        
        log_success("Gruplandırılmış timesheet ayarları döndürüldü")
        return jsonify({
            'success': True,
            'settings': grouped
        }), 200

    except Exception as e:
        log_error(f"Gruplandırılmış ayarlar hatası: {e}")
        return jsonify({
            'success': False,
            'message': 'Ayarlar getirilirken bir hata oluştu'
        }), 500
