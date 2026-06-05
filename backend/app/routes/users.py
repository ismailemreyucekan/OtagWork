"""
Kullanıcı yönetimi route'ları
"""
from flask import Blueprint, request, jsonify
import bcrypt
from app.models import db, Identity
from app.logger import log_operation, log_error, log_success
from app.scoping import resolve_actor, is_manager, manager_member_ids

users_bp = Blueprint('users', __name__)

def hash_password(password):
    """Şifreyi hash'ler"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

@users_bp.route('/users', methods=['GET'])
def get_users():
    """Kullanıcıları listele.

    - Tenant scope: çağıranın organizasyonu.
    - Yönetici (manager) ise SADECE kendi yönettiği takımların üyeleri + kendisi.
    - Admin/owner ise org'un tüm kullanıcıları.
    """
    try:
        log_operation("Kullanıcı listesi isteği")

        actor = resolve_actor(request)
        q = Identity.query

        # Tenant scope — başka org'ların kullanıcıları sızmasın
        if actor and actor.organization_id:
            q = q.filter(Identity.organization_id == actor.organization_id)

        # Yönetici kapsamı — yalnız kendi ekibi
        if is_manager(actor):
            ids = manager_member_ids(actor)
            if ids:
                q = q.filter(Identity.id.in_(ids))
            else:
                return jsonify({'success': True, 'users': [], 'total': 0}), 200

        identities = q.order_by(Identity.created_at.desc()).all()
        users = [identity.to_dict() for identity in identities]

        log_success(f"{len(users)} kullanıcı listelendi")
        return jsonify({
            'success': True,
            'users': users,
            'total': len(users)
        }), 200
        
    except Exception as e:
        log_error(f"Kullanıcı listesi hatası: {e}")
        return jsonify({
            'success': False,
            'message': 'Kullanıcılar listelenirken bir hata oluştu'
        }), 500

@users_bp.route('/users', methods=['POST'])
def create_user():
    """Yeni kullanıcı oluştur"""
    try:
        data = request.get_json()
        email = data.get('email')
        password = data.get('password')
        first_name = data.get('first_name')
        last_name = data.get('last_name')
        user_type = data.get('user_type', 'user')
        phone_number = data.get('phone_number')
        
        log_operation("Yeni kullanıcı oluşturma isteği", f"Email: {email}")
        
        # Validasyon
        if not email or not password or not first_name or not last_name:
            log_error("Kullanıcı oluşturma başarısız - Eksik bilgi")
            return jsonify({
                'success': False,
                'message': 'E-posta, şifre, ad ve soyad gereklidir'
            }), 400
        
        # Email kontrolü
        existing = Identity.query.filter_by(email=email).first()
        if existing:
            log_error(f"Kullanıcı oluşturma başarısız - Email zaten kullanılıyor: {email}")
            return jsonify({
                'success': False,
                'message': 'Bu e-posta adresi zaten kullanılıyor'
            }), 400
        
        # Kullanıcı oluştur
        password_hash = hash_password(password)
        identity = Identity(
            email=email,
            password_hash=password_hash,
            first_name=first_name,
            last_name=last_name,
            user_type=user_type,
            phone_number=phone_number,
            is_active=True
        )
        
        db.session.add(identity)
        db.session.commit()
        
        log_success(f"Kullanıcı oluşturuldu: {first_name} {last_name} ({email})")
        return jsonify({
            'success': True,
            'message': 'Kullanıcı başarıyla oluşturuldu',
            'user': identity.to_dict()
        }), 201
        
    except Exception as e:
        db.session.rollback()
        log_error(f"Kullanıcı oluşturma hatası: {e}")
        return jsonify({
            'success': False,
            'message': 'Kullanıcı oluşturulurken bir hata oluştu'
        }), 500

@users_bp.route('/users/<int:user_id>', methods=['PUT'])
def update_user(user_id):
    """Kullanıcı bilgilerini güncelle"""
    try:
        data = request.get_json()
        identity = Identity.query.get_or_404(user_id)
        
        log_operation("Kullanıcı güncelleme isteği", f"ID: {user_id}, Email: {identity.email}")
        
        # Email değişikliği kontrolü
        new_email = data.get('email')
        if new_email and new_email != identity.email:
            existing = Identity.query.filter_by(email=new_email).first()
            if existing:
                log_error(f"Kullanıcı güncelleme başarısız - Email zaten kullanılıyor: {new_email}")
                return jsonify({
                    'success': False,
                    'message': 'Bu e-posta adresi zaten kullanılıyor'
                }), 400
        
        # Güncelleme
        if 'email' in data:
            identity.email = data['email']
        if 'first_name' in data:
            identity.first_name = data['first_name']
        if 'last_name' in data:
            identity.last_name = data['last_name']
        if 'user_type' in data:
            identity.user_type = data['user_type']
        if 'phone_number' in data:
            identity.phone_number = data.get('phone_number')
        if 'password' in data and data['password']:
            identity.password_hash = hash_password(data['password'])
        if 'is_active' in data:
            identity.is_active = data['is_active']
        
        db.session.commit()
        
        log_success(f"Kullanıcı güncellendi: {identity.first_name} {identity.last_name} ({identity.email})")
        return jsonify({
            'success': True,
            'message': 'Kullanıcı başarıyla güncellendi',
            'user': identity.to_dict()
        }), 200
        
    except Exception as e:
        db.session.rollback()
        log_error(f"Kullanıcı güncelleme hatası: {e}")
        return jsonify({
            'success': False,
            'message': 'Kullanıcı güncellenirken bir hata oluştu'
        }), 500

@users_bp.route('/users/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    """Kullanıcıyı sil (soft delete - is_active=False)"""
    try:
        identity = Identity.query.get_or_404(user_id)
        
        log_operation("Kullanıcı silme isteği", f"ID: {user_id}, Email: {identity.email}")
        
        # Soft delete - is_active=False yap
        identity.is_active = False
        db.session.commit()
        
        log_success(f"Kullanıcı silindi: {identity.first_name} {identity.last_name} ({identity.email})")
        return jsonify({
            'success': True,
            'message': 'Kullanıcı başarıyla silindi'
        }), 200
        
    except Exception as e:
        db.session.rollback()
        log_error(f"Kullanıcı silme hatası: {e}")
        return jsonify({
            'success': False,
            'message': 'Kullanıcı silinirken bir hata oluştu'
        }), 500

