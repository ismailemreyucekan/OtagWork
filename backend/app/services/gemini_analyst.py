"""
gemini_analyst.py — Timesheet verisi için Google Gemini tabanlı AI yorum üretici.

Public API:
    generate_review(stats: dict, entries: list, date_range: tuple) -> dict
        Dönüş yapısı:
        {
            "success": bool,
            "general": str,              # 3-4 cümle özet paragraf
            "strengths": list[str],      # 2-3 madde
            "improvements": list[str],   # 3-5 madde
            "risks": list[str],          # 0-3 madde
            "model": str,                # kullanılan model adı
            "error": str | None,         # hata mesajı (varsa)
        }

Kurulum gereksinimleri:
    - pip install google-genai
    - .env içine: GEMINI_API_KEY=AIza... (Google AI Studio'dan ücretsiz alınır)

Notlar:
    - API key yoksa veya çağrı başarısız olursa graceful fallback döner
      (kural-bazlı sade yorum + success=False, hata mesajıyla).
    - Tüm metin Türkçedir.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional, Tuple

from app.logger import log_error, log_success, log_operation

# Lazy import: SDK eksikse modül yüklenmesi diğer endpoint'leri kırmasın.
_genai_available = True
try:
    from google import genai
    from google.genai import types as genai_types
except ImportError:
    _genai_available = False
    genai = None
    genai_types = None


# Türkçe Gemini modelleri (ücretsiz tier'da erişilebilen, 2026 itibarıyla aktif)
# - gemini-2.5-flash      : kaliteli yanıt, biraz daha yavaş (ana model)
# - gemini-2.5-flash-lite : daha hızlı, biraz daha kısa (fallback)
DEFAULT_MODEL = "gemini-2.5-flash"
FALLBACK_MODEL = "gemini-2.5-flash-lite"


def _empty_result(error: Optional[str] = None) -> Dict[str, Any]:
    """API çağrısı yapılamazsa veya hata olursa düşülen güvenli yanıt."""
    return {
        "success": False,
        "general": "AI değerlendirmesi şu anda üretilemiyor.",
        "strengths": [],
        "improvements": [],
        "risks": [],
        "model": "",
        "error": error or "AI yorumu üretilemedi",
    }


def _build_prompt(stats: Dict[str, Any], entries: List[Dict[str, Any]],
                  date_range: Tuple[Optional[str], Optional[str]],
                  user_name: str = "") -> str:
    """Gemini'ye gönderilecek prompt. Yapısal JSON çıktı bekler."""
    start, end = date_range
    period_line = f"{start} → {end}" if start and end else "Belirtilmemiş dönem"

    # İstatistik özeti (analyze_timesheets çıktısının özetlenmiş hali)
    total_hours = stats.get("total_hours") or 0
    total_days = stats.get("total_days") or 0
    avg_per_day = round(total_hours / total_days, 2) if total_days else 0

    # Aktivite tipi dağılımı (en fazla 8 madde)
    activity_breakdown = []
    by_activity = stats.get("by_activity") or {}
    for label, hours in sorted(by_activity.items(), key=lambda x: -x[1])[:8]:
        pct = round((hours / total_hours) * 100, 1) if total_hours else 0
        activity_breakdown.append(f"- {label}: {hours} saat (%{pct})")

    # Çalışma modu dağılımı
    by_mode = stats.get("by_work_mode") or {}
    mode_lines = []
    for mode, hours in sorted(by_mode.items(), key=lambda x: -x[1]):
        pct = round((hours / total_hours) * 100, 1) if total_hours else 0
        mode_lines.append(f"- {mode}: {hours} saat (%{pct})")

    # Proje dağılımı (top 5)
    by_project = stats.get("by_project") or {}
    project_lines = []
    for proj, hours in sorted(by_project.items(), key=lambda x: -x[1])[:5]:
        project_lines.append(f"- {proj}: {hours} saat")

    name_line = f"\nKullanıcı: {user_name}" if user_name else ""

    prompt = f"""Sen bir İK ve verimlilik danışmanısın. Aşağıdaki timesheet (mesai çizelgesi) verisini Türkçe olarak değerlendir.
{name_line}
Dönem: {period_line}
Toplam çalışma saati: {total_hours} saat
Çalışılan gün sayısı: {total_days} gün
Günlük ortalama: {avg_per_day} saat
Toplam kayıt sayısı: {len(entries)}

Aktivite tipine göre dağılım:
{chr(10).join(activity_breakdown) if activity_breakdown else "- veri yok"}

Çalışma modu dağılımı:
{chr(10).join(mode_lines) if mode_lines else "- veri yok"}

Proje dağılımı (ilk 5):
{chr(10).join(project_lines) if project_lines else "- veri yok"}

Görevin:
1. **general**: 3-4 cümle özet paragraf. Dönemin genel değerlendirmesi, sayılarla destekli.
2. **strengths**: 2-3 madde. Kullanıcının iyi yaptığı şeyler (verimlilik, denge, çeşitlilik vb.).
3. **improvements**: 3-5 madde. Somut, eyleme dönük öneriler.
4. **risks**: 0-3 madde. Burnout, fazla mesai, dengesizlik gibi riskler. Risk yoksa boş liste.

Tüm metinleri Türkçe yaz, profesyonel ve yapıcı bir ton kullan. Genelleme yapmaktan kaçın, sayıları referans al.
Dönüş formatı: JSON. Şema:
{{
  "general": "string",
  "strengths": ["string", ...],
  "improvements": ["string", ...],
  "risks": ["string", ...]
}}
"""
    return prompt


def generate_review(
    stats: Dict[str, Any],
    entries: List[Dict[str, Any]],
    date_range: Tuple[Optional[str], Optional[str]] = (None, None),
    user_name: str = "",
) -> Dict[str, Any]:
    """
    Timesheet istatistik ve kayıtlarına bakarak AI yorumu üretir.

    Hata durumlarında graceful fallback döner — endpoint asla 500 atmaz.
    """
    if not _genai_available:
        return _empty_result(
            "google-genai paketi yüklü değil. `pip install google-genai` çalıştırın."
        )

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        return _empty_result(
            "GEMINI_API_KEY ortam değişkeni tanımlı değil. "
            "https://aistudio.google.com/apikey adresinden ücretsiz anahtar alın."
        )

    prompt = _build_prompt(stats, entries, date_range, user_name)
    log_operation("Gemini AI çağrısı", f"prompt {len(prompt)} karakter")

    try:
        client = genai.Client(api_key=api_key)

        # Structured output (response_mime_type=application/json) ile
        # parse zahmeti olmadan JSON döndürtüyoruz.
        # Gemini 2.5 modellerinde "thinking" varsayılan açık — token bütçesini
        # düşünmeye harcayıp çıktı kesilebilir. Thinking'i kapatıp tam JSON al.
        config_kwargs = {
            "response_mime_type": "application/json",
            "temperature": 0.6,
            "max_output_tokens": 4096,
        }
        # ThinkingConfig 2.5 ailesinde mevcut; eski sürümlerde import varsa kullan
        if hasattr(genai_types, "ThinkingConfig"):
            try:
                config_kwargs["thinking_config"] = genai_types.ThinkingConfig(thinking_budget=0)
            except Exception:
                pass

        config = genai_types.GenerateContentConfig(**config_kwargs)

        try:
            response = client.models.generate_content(
                model=DEFAULT_MODEL,
                contents=prompt,
                config=config,
            )
            model_used = DEFAULT_MODEL
        except Exception as e_primary:
            log_error(f"Gemini {DEFAULT_MODEL} başarısız, fallback deneniyor: {e_primary}")
            response = client.models.generate_content(
                model=FALLBACK_MODEL,
                contents=prompt,
                config=config,
            )
            model_used = FALLBACK_MODEL

        text = (response.text or "").strip()
        if not text:
            return _empty_result("Gemini boş yanıt döndürdü.")

        # JSON parse — structured output sayesinde direkt JSON gelmeli
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            # Bazen model JSON çevresinde ```json ... ``` ekler — temizle
            cleaned = text.strip().lstrip("`").lstrip("json").rstrip("`").strip()
            try:
                parsed = json.loads(cleaned)
            except json.JSONDecodeError:
                return _empty_result(f"AI yanıtı JSON olarak okunamadı: {text[:120]}…")

        # Şema doğrulaması — eksik alanları boş listeyle doldur
        result = {
            "success": True,
            "general": str(parsed.get("general", "")).strip() or "Bu dönem için özet üretilemedi.",
            "strengths": [str(s).strip() for s in parsed.get("strengths", []) if str(s).strip()],
            "improvements": [str(s).strip() for s in parsed.get("improvements", []) if str(s).strip()],
            "risks": [str(s).strip() for s in parsed.get("risks", []) if str(s).strip()],
            "model": model_used,
            "error": None,
        }
        log_success(
            f"Gemini AI yanıtı: {len(result['strengths'])} güçlü yön, "
            f"{len(result['improvements'])} öneri, {len(result['risks'])} risk"
        )
        return result

    except Exception as e:
        log_error(f"Gemini çağrısı başarısız: {e}")
        return _empty_result(f"Gemini API hatası: {type(e).__name__}")
