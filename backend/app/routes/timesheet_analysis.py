"""
Timesheet analiz (PDF + AI yorumu) route'ları
"""

from flask import Blueprint, request, jsonify, send_file
from io import BytesIO

from app.logger import log_error, log_operation
from app.services.timesheet_analysis import (
    create_timesheet_analysis_pdf,
    analyze_timesheet_entries,
)
from app.services.gemini_analyst import generate_review

timesheet_analysis_bp = Blueprint("timesheet_analysis", __name__)


def _adapt_stats_for_ai(stats: dict) -> dict:
    """
    analyze_timesheet_entries çıktısını (liste-bazlı) Gemini servisinin
    beklediği dict-bazlı yapıya çevirir.
    """
    def to_dict(lst, key_field):
        return {row.get(key_field, "—"): row.get("hours", 0) for row in (lst or [])}

    return {
        "total_hours":   stats.get("total_hours", 0),
        "total_days":    (stats.get("mesai") or {}).get("toplam_gun", 0),
        "by_activity":   to_dict(stats.get("by_activity_type"), "activity_type"),
        "by_work_mode":  to_dict(stats.get("by_work_mode"),     "work_mode"),
        "by_project":    to_dict(stats.get("by_project"),       "project"),
        "mesai":         stats.get("mesai") or {},
    }


@timesheet_analysis_bp.route("/timesheets/analysis/pdf", methods=["POST"])
def timesheet_analysis_pdf():
    """
    PDF üretir.

    Amaç: Frontend'de takvim ekranında görünen `timesheets` datasını göndererek
    analiz/PDF'i birebir aynı verilerle üretmek.
    """
    try:
        data = request.get_json() or {}
        entries = data.get("timesheets") or []
        start_date = data.get("start_date")
        end_date = data.get("end_date")
        user_id = data.get("user_id")
        user_name = data.get("user_name", "")

        pdf_bytes = create_timesheet_analysis_pdf(
            entries,
            start_date=start_date,
            end_date=end_date,
            user_id=user_id,
            user_name=user_name,
        )

        buffer = BytesIO(pdf_bytes)
        return send_file(
            buffer,
            mimetype="application/pdf",
            as_attachment=True,
            download_name="timesheet_analysis.pdf",
        )

    except Exception as e:
        log_error(f"Timesheet PDF analiz hatası: {e}")
        return jsonify({
            "success": False,
            "message": "PDF oluşturulurken bir hata oluştu",
        }), 500


@timesheet_analysis_bp.route("/timesheets/ai-review", methods=["POST"])
def timesheet_ai_review():
    """
    Belirli bir tarih aralığındaki timesheet kayıtları için Gemini'den
    yapısal AI yorumu üretir (genel değerlendirme, güçlü yönler, öneriler,
    risk uyarıları).

    Body:
        {
            "timesheets": [...],          # frontend'in elinde olan kayıt listesi
            "start_date": "YYYY-MM-DD",
            "end_date":   "YYYY-MM-DD",
            "user_id":    int (opsiyonel — sadece loglama için),
            "user_name":  str (opsiyonel — prompt'a yerleşir)
        }

    Response:
        {
            "success": bool,
            "review": {
                "general":      "string",
                "strengths":    ["...", ...],
                "improvements": ["...", ...],
                "risks":        ["...", ...],
                "model":        "gemini-2.0-flash",
                "error":        null | "..."
            },
            "stats": { özet kpi'lar (UI bilgi amaçlı) }
        }
    """
    try:
        data = request.get_json() or {}
        entries = data.get("timesheets") or []
        start_date = data.get("start_date")
        end_date = data.get("end_date")
        user_name = (data.get("user_name") or "").strip()

        log_operation(
            "AI review isteği",
            f"{len(entries)} kayıt · {start_date} → {end_date}",
        )

        if not entries:
            return jsonify({
                "success": False,
                "message": "Seçilen tarih aralığında değerlendirilecek kayıt yok.",
            }), 400

        # 1) İstatistikleri hesapla
        stats = analyze_timesheet_entries(entries)
        adapted = _adapt_stats_for_ai(stats)

        # 2) AI yorumu al (hata olursa graceful fallback gelir)
        review = generate_review(
            stats=adapted,
            entries=entries,
            date_range=(start_date, end_date),
            user_name=user_name,
        )

        # UI'ya da küçük bir özet ver (dashboard kartlarıyla aynı KPI)
        summary = {
            "total_hours":     adapted["total_hours"],
            "total_days":      adapted["total_days"],
            "avg_daily_hours": stats.get("avg_daily_hours", 0),
            "top_activity":    next(iter(adapted["by_activity"]), None),
        }

        return jsonify({
            "success": True,
            "review":  review,
            "stats":   summary,
        }), 200

    except Exception as e:
        log_error(f"Timesheet AI review hatası: {e}")
        return jsonify({
            "success": False,
            "message": "AI yorumu üretilirken bir hata oluştu",
        }), 500

