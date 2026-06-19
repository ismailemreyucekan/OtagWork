"""
ai_planner.py — Google Gemini tabanlı AI proje planlayıcı.

Public API:
    generate_plan(project_name, description, start_date, end_date,
                  daily_hours, experience, technologies) -> dict
        Dönüş yapısı:
        {
            "success": bool,
            "summary": str,              # 2-3 cümle plan özeti
            "tasks": [
                {
                    "title": str,
                    "description": str,
                    "priority": "dusuk|orta|yuksek|kritik",
                    "estimated_hours": float,
                    "day_offset": int,       # start_date'ten kaç gün sonra başlar
                    "duration_days": int,    # kaç günde tamamlanacak
                }, ...
            ],
            "model": str,
            "error": str | None,
        }

Kurulum gereksinimleri:
    - pip install google-genai
    - .env içine: GEMINI_API_KEY=AIza...

Notlar:
    - API key yoksa veya çağrı başarısız olursa graceful fallback döner.
    - Tüm metin Türkçedir.
"""

from __future__ import annotations

import json
import os
from datetime import date
from typing import Any, Dict, List, Optional

from app.logger import log_error, log_success, log_operation

_genai_available = True
try:
    from google import genai
    from google.genai import types as genai_types
except ImportError:
    _genai_available = False
    genai = None
    genai_types = None


DEFAULT_MODEL = "gemini-2.5-flash"
FALLBACK_MODEL = "gemini-2.5-flash-lite"

VALID_PRIORITIES = ("dusuk", "orta", "yuksek", "kritik")
VALID_EXPERIENCE = ("baslangic", "orta", "ileri")
VALID_MODES = ("personal", "team")


def _empty_result(error: Optional[str] = None) -> Dict[str, Any]:
    return {
        "success": False,
        "summary": "AI plan üretimi şu anda yapılamıyor.",
        "tasks": [],
        "model": "",
        "error": error or "AI planı üretilemedi",
    }


def _build_prompt(
    project_name: str,
    description: str,
    start_date: date,
    end_date: Optional[date],
    daily_hours: float,
    experience: str,
    technologies: List[str],
    mode: str,
) -> str:
    if end_date:
        total_days = max((end_date - start_date).days, 1)
        deadline_line = (
            f"Teslim tarihi: {end_date.isoformat()} (toplam {total_days} gün)"
        )
    else:
        total_days = 30
        deadline_line = "Teslim tarihi belirtilmedi — makul bir süre öner (yaklaşık 20-40 gün)."

    total_capacity = round(daily_hours * total_days, 1)

    exp_map = {
        "baslangic": "Başlangıç seviyesi — adımları küçük tut, daha çok ve detaylı görev üret, açıklamaları öğretici yaz.",
        "orta": "Orta seviye — dengeli görev sayısı (orta detay), pratik açıklamalar.",
        "ileri": "İleri seviye — üst düzey görevler, fazla detaya girme; deneyimli geliştiriciye yönelik.",
    }
    exp_line = exp_map.get(experience, exp_map["orta"])

    tech_line = (
        f"Kullanılacak teknolojiler: {', '.join(technologies)}. "
        "Görev başlıklarında ve açıklamalarında bu teknolojileri yerinde kullan."
        if technologies else
        "Teknolojiler belirtilmedi — genel iş akışı tabanlı planla."
    )

    if mode == "personal":
        context_line = (
            "Bağlam: SOLO / KİŞİSEL kullanım. Kullanıcı bu projede tek başına çalışıyor — ekibi yok.\n"
            "ÖNEMLİ — Şu tür görevleri ASLA önerme: 'ekiple toplantı', 'sprint planlama', 'kod review (başkasıyla)', "
            "'müşteri ile sunum', 'stand-up', 'ekip içi koordinasyon', 'görev dağılımı', 'iletişim toplantısı', "
            "'paydaş görüşmesi'. Sadece kullanıcının kendi başına oturup yapabileceği somut, üretken görevler üret "
            "(öğrenme/araştırma, tasarım, kodlama, test yazma, dokümantasyon, deploy, refactor vb.)."
        )
    else:
        context_line = (
            "Bağlam: EKİP / TAKIM ortamında çalışılıyor. Toplantı, koordinasyon, görev dağılımı, code review, "
            "sprint planlama gibi takım içi görevleri uygun yerlerde önerebilirsin — ama bunlar planın çoğunluğunu "
            "değil, doğal akışın parçası olmalı."
        )

    prompt = f"""Sen kıdemli bir proje yöneticisi ve teknik mentorsun. Aşağıdaki bilgilere göre Türkçe bir proje planı çıkar ve görevlere böl.

{context_line}

Proje adı: {project_name}
Açıklama / hedef: {description}
Başlama tarihi: {start_date.isoformat()}
{deadline_line}
Günlük çalışılabilecek saat: {daily_hours} saat
Toplam kapasite (yaklaşık): {total_capacity} saat
Deneyim seviyesi: {experience} — {exp_line}
{tech_line}

Görevin:
1. **summary**: 2-3 cümle, planın genel yaklaşımını özetler.
2. **tasks**: 5-20 arası görev. Her görev şu alanları içerir:
   - title (kısa, eyleme dönük başlık, Türkçe)
   - description (1-3 cümle, ne yapılacak)
   - priority: "dusuk" | "orta" | "yuksek" | "kritik"
   - estimated_hours: float, toplam tahmini saat
   - day_offset: int, başlama tarihine göre kaç gün sonra başlayacak (ilk görev 0)
   - duration_days: int, kaç günde tamamlanacak (en az 1)

Kurallar:
- Görevler mantıklı bir sırada olsun (öğrenme/altyapı → geliştirme → test → teslim).
- Toplam estimated_hours günlük kapasite × süreyi (yaklaşık {total_capacity} saat) aşmasın.
- day_offset + duration_days değerleri toplam süreye sığsın.
- Türkçe ve profesyonel ton kullan.

Dönüş formatı: SADECE JSON. Şema:
{{
  "summary": "string",
  "tasks": [
    {{
      "title": "string",
      "description": "string",
      "priority": "dusuk|orta|yuksek|kritik",
      "estimated_hours": 0,
      "day_offset": 0,
      "duration_days": 1
    }}
  ]
}}
"""
    return prompt


def _normalize_task(raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    title = str(raw.get("title", "")).strip()
    if not title:
        return None
    priority = str(raw.get("priority", "orta")).strip().lower()
    if priority not in VALID_PRIORITIES:
        priority = "orta"
    try:
        est_hours = float(raw.get("estimated_hours") or 0)
    except (ValueError, TypeError):
        est_hours = 0.0
    try:
        day_offset = max(int(raw.get("day_offset") or 0), 0)
    except (ValueError, TypeError):
        day_offset = 0
    try:
        duration_days = max(int(raw.get("duration_days") or 1), 1)
    except (ValueError, TypeError):
        duration_days = 1
    return {
        "title": title,
        "description": str(raw.get("description", "")).strip(),
        "priority": priority,
        "estimated_hours": round(est_hours, 1),
        "day_offset": day_offset,
        "duration_days": duration_days,
    }


def generate_plan(
    project_name: str,
    description: str,
    start_date: date,
    end_date: Optional[date],
    daily_hours: float,
    experience: str = "orta",
    technologies: Optional[List[str]] = None,
    mode: str = "personal",
) -> Dict[str, Any]:
    """Gemini ile yapılandırılmış proje planı üret.

    mode:
      - "personal": Solo kullanıcı — takım/toplantı görevleri önerilmez.
      - "team":     Ekip ortamı — koordinasyon/toplantı görevleri serbest.
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

    if experience not in VALID_EXPERIENCE:
        experience = "orta"
    if mode not in VALID_MODES:
        mode = "personal"

    prompt = _build_prompt(
        project_name=project_name,
        description=description,
        start_date=start_date,
        end_date=end_date,
        daily_hours=daily_hours,
        experience=experience,
        technologies=technologies or [],
        mode=mode,
    )
    log_operation("Gemini AI plan çağrısı", f"prompt {len(prompt)} karakter")

    try:
        client = genai.Client(api_key=api_key)
        config_kwargs = {
            "response_mime_type": "application/json",
            "temperature": 0.7,
            "max_output_tokens": 8192,
        }
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

        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            cleaned = text.strip().lstrip("`").lstrip("json").rstrip("`").strip()
            try:
                parsed = json.loads(cleaned)
            except json.JSONDecodeError:
                return _empty_result(f"AI yanıtı JSON olarak okunamadı: {text[:120]}…")

        raw_tasks = parsed.get("tasks", []) or []
        tasks: List[Dict[str, Any]] = []
        for raw in raw_tasks:
            if not isinstance(raw, dict):
                continue
            normalized = _normalize_task(raw)
            if normalized:
                tasks.append(normalized)

        result = {
            "success": True,
            "summary": str(parsed.get("summary", "")).strip() or "Proje planı hazırlandı.",
            "tasks": tasks,
            "model": model_used,
            "error": None,
        }
        log_success(
            f"Gemini AI plan yanıtı: {len(tasks)} görev, model={model_used}"
        )
        return result

    except Exception as e:
        log_error(f"Gemini plan çağrısı başarısız: {type(e).__name__}: {e}")
        return _empty_result(f"Gemini API hatası: {type(e).__name__}: {str(e)[:400]}")
