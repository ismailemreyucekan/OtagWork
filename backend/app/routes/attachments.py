"""
Dosya eki route'ları.
Dosyalar backend/uploads/ altında stored_name ile saklanır,
istemciye original_name ile sunulur.
"""
import os
import uuid
import mimetypes
from flask import Blueprint, request, jsonify, send_from_directory, abort
from werkzeug.utils import secure_filename
from app.models import db, Attachment, Task, Identity
from app.logger import log_error, log_success
from app.services import activity as act

attachments_bp = Blueprint('attachments', __name__)

# ── Yapılandırma ──────────────────────────────────────────────
MAX_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_EXTS = {
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg',
    'txt', 'csv', 'md', 'log',
    'zip', 'rar', '7z',
}

UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    'uploads'
)
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _ext_ok(filename):
    if not filename or '.' not in filename:
        return False
    return filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTS


def _save_file(file_storage):
    """Dosyayı diske kaydeder, (stored_name, size_bytes) döner."""
    original = secure_filename(file_storage.filename) or 'dosya'
    ext = original.rsplit('.', 1)[1].lower() if '.' in original else ''
    stored = f"{uuid.uuid4().hex}.{ext}" if ext else uuid.uuid4().hex
    path = os.path.join(UPLOAD_DIR, stored)
    file_storage.save(path)
    size = os.path.getsize(path)
    return stored, size, original


@attachments_bp.route('/tasks/<int:task_id>/attachments', methods=['GET'])
def list_task_attachments(task_id):
    try:
        Task.query.get_or_404(task_id)
        rows = Attachment.query.filter_by(task_id=task_id).order_by(Attachment.created_at.desc()).all()
        return jsonify({'success': True, 'attachments': [r.to_dict() for r in rows]}), 200
    except Exception as e:
        log_error(f"Ek listeleme hatası: {e}")
        return jsonify({'success': False, 'message': 'Ekler alınamadı'}), 500


@attachments_bp.route('/tasks/<int:task_id>/attachments', methods=['POST'])
def upload_task_attachment(task_id):
    """
    multipart/form-data:
      file: dosya
      uploader_id: int
    """
    try:
        task = Task.query.get_or_404(task_id)

        if 'file' not in request.files:
            return jsonify({'success': False, 'message': 'Dosya gönderilmedi'}), 400
        f = request.files['file']
        if not f or not f.filename:
            return jsonify({'success': False, 'message': 'Geçersiz dosya'}), 400

        uploader_id = request.form.get('uploader_id', type=int)
        if not uploader_id:
            return jsonify({'success': False, 'message': 'uploader_id gereklidir'}), 400
        if not Identity.query.get(uploader_id):
            return jsonify({'success': False, 'message': 'Yükleyici bulunamadı'}), 404

        if not _ext_ok(f.filename):
            return jsonify({'success': False, 'message': 'Bu dosya tipine izin verilmiyor'}), 415

        # Boyut kontrolü için diske yazmadan önce stream uzunluğunu deneriz
        f.seek(0, os.SEEK_END)
        size = f.tell()
        f.seek(0)
        if size > MAX_BYTES:
            return jsonify({'success': False, 'message': f'Dosya {MAX_BYTES // (1024*1024)} MB sınırını aşıyor'}), 413

        stored, real_size, original = _save_file(f)
        mime = f.mimetype or mimetypes.guess_type(original)[0] or 'application/octet-stream'

        a = Attachment(
            task_id=task_id,
            uploader_id=uploader_id,
            original_name=original,
            stored_name=stored,
            mime_type=mime,
            size_bytes=real_size,
        )
        db.session.add(a)
        db.session.flush()

        act.log(task_id=task_id, action='file_uploaded', actor_id=uploader_id,
                new_value=original, note=f'{real_size} bytes')

        db.session.commit()
        log_success(f"Dosya yüklendi: Task={task_id}, {original} ({real_size} B)")
        return jsonify({'success': True, 'attachment': a.to_dict()}), 201
    except Exception as e:
        db.session.rollback()
        log_error(f"Dosya yükleme hatası: {e}")
        return jsonify({'success': False, 'message': 'Dosya yüklenemedi'}), 500


@attachments_bp.route('/attachments/<int:att_id>/download', methods=['GET'])
def download_attachment(att_id):
    try:
        a = Attachment.query.get_or_404(att_id)
        if not a.stored_name:
            abort(404)
        return send_from_directory(
            UPLOAD_DIR,
            a.stored_name,
            as_attachment=True,
            download_name=a.original_name,
            mimetype=a.mime_type or 'application/octet-stream',
        )
    except Exception as e:
        log_error(f"Dosya indirme hatası: {e}")
        return jsonify({'success': False, 'message': 'Dosya bulunamadı'}), 404


@attachments_bp.route('/attachments/<int:att_id>', methods=['DELETE'])
def delete_attachment(att_id):
    """Sadece yükleyici veya admin/manager silebilir. requester_id query/body ile gelir."""
    try:
        a = Attachment.query.get_or_404(att_id)

        data = request.get_json(silent=True) or {}
        requester_id = data.get('user_id') or request.args.get('user_id', type=int)

        # Basit yetki: yükleyici kendi dosyasını silebilir; admin/manager herkesinkini
        if requester_id is not None:
            requester = Identity.query.get(int(requester_id))
            if not requester:
                return jsonify({'success': False, 'message': 'İstek yapan bulunamadı'}), 404
            if int(requester_id) != a.uploader_id and requester.user_type not in ('admin', 'manager'):
                return jsonify({'success': False, 'message': 'Bu dosyayı silme yetkiniz yok'}), 403

        # Fiziksel dosyayı sil
        try:
            os.remove(os.path.join(UPLOAD_DIR, a.stored_name))
        except OSError:
            pass

        task_id = a.task_id
        original = a.original_name
        db.session.delete(a)

        if task_id:
            act.log(task_id=task_id, action='file_deleted', actor_id=requester_id,
                    new_value=original)

        db.session.commit()
        return jsonify({'success': True, 'message': 'Dosya silindi'}), 200
    except Exception as e:
        db.session.rollback()
        log_error(f"Dosya silme hatası: {e}")
        return jsonify({'success': False, 'message': 'Dosya silinemedi'}), 500
