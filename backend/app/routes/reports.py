"""
Rapor endpoint'leri:
  CSV  → /api/reports/timesheets.csv, /api/reports/tasks.csv
  PDF  → /api/reports/timesheets.pdf, /api/reports/tasks.pdf
"""
import io
import os
import csv
from datetime import datetime, date
from flask import Blueprint, request, send_file, jsonify
from app.models import Task, Timesheet, Identity, Project, Team, TeamMember
from app.logger import log_error

reports_bp = Blueprint('reports', __name__)


def _parse_date(v):
    if not v: return None
    try: return date.fromisoformat(v)
    except (ValueError, TypeError): return None


def _csv_response(rows, filename, headers):
    """rows: list[dict]; headers: list[str] kolon sırası."""
    buf = io.StringIO()
    # UTF-8 BOM Excel'in Türkçe karakterleri doğru göstermesi için
    buf.write('﻿')
    w = csv.DictWriter(buf, fieldnames=headers, extrasaction='ignore')
    w.writeheader()
    for r in rows:
        w.writerow(r)
    data = buf.getvalue().encode('utf-8')
    return send_file(
        io.BytesIO(data),
        mimetype='text/csv; charset=utf-8',
        as_attachment=True,
        download_name=filename,
    )


# ─── Timesheet raporları ─────────────────────────────────────

def _timesheet_rows(user_id=None, start=None, end=None, manager_id=None):
    q = Timesheet.query
    if user_id: q = q.filter(Timesheet.identity_id == user_id)
    # Yönetici kapsamı: yalnız yönettiği takımların üyelerinin timesheet'leri
    if manager_id:
        team_ids = [t.id for t in Team.query.filter_by(manager_id=manager_id).all()]
        member_ids = [m.user_id for m in
                      TeamMember.query.filter(TeamMember.team_id.in_(team_ids)).all()] if team_ids else []
        if member_ids:
            q = q.filter(Timesheet.identity_id.in_(member_ids))
        else:
            return []  # yönettiği takım/üye yoksa boş rapor
    if start: q = q.filter(Timesheet.work_date >= start)
    if end: q = q.filter(Timesheet.work_date <= end)
    q = q.order_by(Timesheet.work_date.asc())
    items = q.all()

    # Kullanıcı adlarını tek seferde topla
    uids = list({t.identity_id for t in items})
    name_map = {u.id: f'{u.first_name} {u.last_name}'
                for u in Identity.query.filter(Identity.id.in_(uids)).all()} if uids else {}

    return [{
        'Tarih': t.work_date.isoformat() if t.work_date else '',
        'Kullanıcı': name_map.get(t.identity_id, f'#{t.identity_id}'),
        'Proje': t.project or '',
        'Aktivite': t.activity_type or '',
        'Çalışma Şekli': t.work_mode or '',
        'Saat': t.hours or 0,
        'Durum': t.status or '',
        'Açıklama': (t.description or '').replace('\n', ' '),
    } for t in items]


@reports_bp.route('/reports/timesheets.csv', methods=['GET'])
def timesheets_csv():
    try:
        rows = _timesheet_rows(
            user_id=request.args.get('user_id', type=int),
            manager_id=request.args.get('manager_id', type=int),
            start=_parse_date(request.args.get('start_date')),
            end=_parse_date(request.args.get('end_date')),
        )
        return _csv_response(
            rows,
            filename=f'timesheet-{date.today().isoformat()}.csv',
            headers=['Tarih', 'Kullanıcı', 'Proje', 'Aktivite', 'Çalışma Şekli', 'Saat', 'Durum', 'Açıklama'],
        )
    except Exception as e:
        log_error(f"Timesheet CSV hatası: {e}")
        return jsonify({'success': False, 'message': 'CSV oluşturulamadı'}), 500


# ─── Görev raporları ─────────────────────────────────────────

def _task_rows(manager_id=None, status=None, start=None, end=None):
    q = Task.query
    if manager_id: q = q.filter(Task.assigned_by == manager_id)
    if status: q = q.filter(Task.status == status)
    if start: q = q.filter(Task.due_date >= start)
    if end: q = q.filter(Task.due_date <= end)
    q = q.order_by(Task.due_date.asc())
    items = q.all()

    today = date.today()
    label_status = {'beklemede':'Beklemede','devam_ediyor':'Devam Ediyor','tamamlandi':'Tamamlandı','iptal':'İptal'}
    label_prio = {'dusuk':'Düşük','orta':'Orta','yuksek':'Yüksek','kritik':'Kritik'}
    label_appr = {'onay_bekliyor':'Onay Bekliyor','onaylandi':'Onaylandı','reddedildi':'Reddedildi'}

    return [{
        'ID': t.id,
        'Başlık': t.title,
        'Atanan': f'{t.assignee.first_name} {t.assignee.last_name}' if t.assignee else '',
        'Atayan': f'{t.assigner.first_name} {t.assigner.last_name}' if t.assigner else '',
        'Proje': t.project.name if t.project else '',
        'Başlangıç': t.start_date.isoformat() if t.start_date else '',
        'Son Tarih': t.due_date.isoformat() if t.due_date else '',
        'Öncelik': label_prio.get(t.priority, t.priority),
        'Durum': label_status.get(t.status, t.status),
        'Onay': label_appr.get(t.approval_status, t.approval_status),
        'Gecikmiş': 'Evet' if t.due_date and t.due_date < today and t.status != 'tamamlandi' else 'Hayır',
    } for t in items]


@reports_bp.route('/reports/tasks.csv', methods=['GET'])
def tasks_csv():
    try:
        rows = _task_rows(
            manager_id=request.args.get('manager_id', type=int),
            status=request.args.get('status'),
            start=_parse_date(request.args.get('start_date')),
            end=_parse_date(request.args.get('end_date')),
        )
        return _csv_response(
            rows,
            filename=f'gorevler-{date.today().isoformat()}.csv',
            headers=['ID','Başlık','Atanan','Atayan','Proje','Başlangıç','Son Tarih','Öncelik','Durum','Onay','Gecikmiş'],
        )
    except Exception as e:
        log_error(f"Görev CSV hatası: {e}")
        return jsonify({'success': False, 'message': 'CSV oluşturulamadı'}), 500


# ─── PDF (ReportLab) ─────────────────────────────────────────

_PDF_FONTS = None

def _pdf_fonts():
    """Türkçe destekli bir TrueType font kaydeder; bulunamazsa Helvetica'ya düşer.

    Yerleşik Helvetica, ş/ğ/ı/İ gibi Türkçe glyph'leri içermediğinden PDF'te
    bozuk/kutu karakter çıkıyordu. Döner: (regular_font_adı, bold_font_adı).
    """
    global _PDF_FONTS
    if _PDF_FONTS is not None:
        return _PDF_FONTS
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    candidates = [
        (r"C:\Windows\Fonts\arial.ttf",  r"C:\Windows\Fonts\arialbd.ttf"),
        (r"C:\Windows\Fonts\tahoma.ttf", r"C:\Windows\Fonts\tahomabd.ttf"),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ("/System/Library/Fonts/Supplemental/Arial.ttf",
         "/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
    ]
    for reg_path, bold_path in candidates:
        if os.path.exists(reg_path):
            try:
                pdfmetrics.registerFont(TTFont("_RPT", reg_path))
                if os.path.exists(bold_path):
                    pdfmetrics.registerFont(TTFont("_RPTB", bold_path))
                    _PDF_FONTS = ("_RPT", "_RPTB")
                else:
                    _PDF_FONTS = ("_RPT", "_RPT")
                return _PDF_FONTS
            except Exception:
                continue
    _PDF_FONTS = ("Helvetica", "Helvetica-Bold")  # Türkçe eksik olabilir
    return _PDF_FONTS


def _pdf_table(title, rows, headers):
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

    reg_font, bold_font = _pdf_fonts()

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4),
                            leftMargin=1*cm, rightMargin=1*cm, topMargin=1*cm, bottomMargin=1*cm)
    styles = getSampleStyleSheet()
    elements = []

    title_style = ParagraphStyle('t', parent=styles['Heading1'], fontSize=16, textColor=colors.HexColor('#1C2A38'), fontName=bold_font)
    sub_style = ParagraphStyle('s', parent=styles['Normal'], fontSize=9, textColor=colors.HexColor('#5A6B7C'), fontName=reg_font)

    elements.append(Paragraph(title, title_style))
    elements.append(Paragraph(f'Oluşturma: {datetime.now().strftime("%d.%m.%Y %H:%M")} · {len(rows)} kayıt', sub_style))
    elements.append(Spacer(1, 0.3*cm))

    data = [headers] + [[str(r.get(h, '') or '') for h in headers] for r in rows]
    if len(data) == 1:
        elements.append(Paragraph('Kayıt bulunamadı.', sub_style))
    else:
        tbl = Table(data, repeatRows=1)
        tbl.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1C2A38')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('FONTNAME', (0,0), (-1,-1), reg_font),
            ('FONTNAME', (0,0), (-1,0), bold_font),
            ('FONTSIZE', (0,0), (-1,-1), 8),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('GRID', (0,0), (-1,-1), 0.25, colors.HexColor('#e2e8f0')),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')]),
            ('LEFTPADDING', (0,0), (-1,-1), 4),
            ('RIGHTPADDING', (0,0), (-1,-1), 4),
            ('TOPPADDING', (0,0), (-1,-1), 4),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ]))
        elements.append(tbl)

    doc.build(elements)
    buf.seek(0)
    return buf


@reports_bp.route('/reports/timesheets.pdf', methods=['GET'])
def timesheets_pdf():
    try:
        rows = _timesheet_rows(
            user_id=request.args.get('user_id', type=int),
            manager_id=request.args.get('manager_id', type=int),
            start=_parse_date(request.args.get('start_date')),
            end=_parse_date(request.args.get('end_date')),
        )
        headers = ['Tarih', 'Kullanıcı', 'Proje', 'Aktivite', 'Çalışma Şekli', 'Saat', 'Durum']
        buf = _pdf_table('Timesheet Raporu', rows, headers)
        return send_file(buf, mimetype='application/pdf', as_attachment=True,
                         download_name=f'timesheet-{date.today().isoformat()}.pdf')
    except Exception as e:
        log_error(f"Timesheet PDF hatası: {e}")
        return jsonify({'success': False, 'message': 'PDF oluşturulamadı'}), 500


@reports_bp.route('/reports/tasks.pdf', methods=['GET'])
def tasks_pdf():
    try:
        rows = _task_rows(
            manager_id=request.args.get('manager_id', type=int),
            status=request.args.get('status'),
            start=_parse_date(request.args.get('start_date')),
            end=_parse_date(request.args.get('end_date')),
        )
        headers = ['ID', 'Başlık', 'Atanan', 'Proje', 'Son Tarih', 'Öncelik', 'Durum', 'Onay', 'Gecikmiş']
        buf = _pdf_table('Görev Raporu', rows, headers)
        return send_file(buf, mimetype='application/pdf', as_attachment=True,
                         download_name=f'gorevler-{date.today().isoformat()}.pdf')
    except Exception as e:
        log_error(f"Görev PDF hatası: {e}")
        return jsonify({'success': False, 'message': 'PDF oluşturulamadı'}), 500
