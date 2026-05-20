"""
Akıllı öneri endpoint'leri.

  POST /ai/suggest-activity
    Body: { description, user_id?, project? }
    Geçmiş timesheet kayıtlarındaki açıklama-aktivite eşleşmelerinden
    naive Bayes benzeri bir skorlama ile en olası aktivite tipini önerir.

  POST /ai/suggest-duration
    Body: { title, description?, priority? }
    Geçmiş tamamlanmış görevlerin başlık+öncelik kombinasyonuna göre
    ortalama tamamlanma günlerini döner.

Dış kütüphane gerektirmez — saf Python.
"""
import math
import re
from collections import defaultdict, Counter
from datetime import datetime
from flask import Blueprint, request, jsonify
from app.models import Timesheet, Task
from app.logger import log_error

ai_suggest_bp = Blueprint('ai_suggest', __name__)

# Türkçe yaygın stop word'leri
STOP = set('''
ve veya ile için ama de da çok az bir bu şu o ki mi mı mu mü diye
ben sen biz siz onlar ben'in benim senin onun bizim sizin onların
icin gibi sonra önce kadar buradan oradan
'''.split())


def _tokens(text):
    if not text:
        return []
    text = text.lower()
    # Sadece harfler + Türkçe karakterler
    parts = re.findall(r"[a-z0-9çğıöşü]+", text)
    return [p for p in parts if p and p not in STOP and len(p) > 1]


def _activity_classifier(samples, query_tokens):
    """
    Çok sade bir TF + label prior skorlayıcı.
    samples: [(label, tokens)]
    """
    if not samples or not query_tokens:
        return []

    # P(label)
    label_counts = Counter(lbl for lbl, _ in samples)
    total = sum(label_counts.values())

    # P(token | label) frekansları
    word_in_label = defaultdict(Counter)
    label_size = defaultdict(int)
    vocab = set()
    for lbl, toks in samples:
        for t in toks:
            word_in_label[lbl][t] += 1
            label_size[lbl] += 1
            vocab.add(t)
    V = max(1, len(vocab))

    scores = {}
    for lbl in label_counts:
        # Laplace smoothing
        log_prior = math.log(label_counts[lbl] / total)
        ll = log_prior
        for t in query_tokens:
            num = word_in_label[lbl].get(t, 0) + 1
            den = label_size[lbl] + V
            ll += math.log(num / den)
        scores[lbl] = ll

    # Softmax-ish: en yüksek puanı normalize et
    if not scores:
        return []
    items = sorted(scores.items(), key=lambda x: -x[1])
    top = items[0][1]
    out = []
    for lbl, sc in items:
        confidence = max(0.0, min(1.0, math.exp(sc - top)))
        out.append({'label': lbl, 'score': round(confidence, 3), 'count': label_counts[lbl]})
    return out


@ai_suggest_bp.route('/ai/suggest-activity', methods=['POST'])
def suggest_activity():
    """
    Body:
      description: str (zorunlu, en az 3 karakter)
      user_id: int (opsiyonel — sadece bu kullanıcının geçmişiyle eğit)
      project: str (opsiyonel — proje filtreli)
    """
    try:
        data = request.get_json() or {}
        desc = (data.get('description') or '').strip()
        if len(desc) < 3:
            return jsonify({'success': False, 'message': 'En az 3 karakter girin'}), 400

        q = Timesheet.query.filter(
            Timesheet.description.isnot(None),
            Timesheet.activity_type.isnot(None),
            Timesheet.status != 'Taslak',
        )
        if data.get('user_id'):
            q = q.filter(Timesheet.identity_id == int(data['user_id']))
        if data.get('project'):
            q = q.filter(Timesheet.project == data['project'])

        rows = q.order_by(Timesheet.work_date.desc()).limit(2000).all()

        samples = [(r.activity_type, _tokens(r.description or '')) for r in rows]
        samples = [(lbl, toks) for lbl, toks in samples if toks]

        if not samples:
            return jsonify({
                'success': True,
                'suggestions': [],
                'note': 'Yeterli geçmiş veri yok',
            }), 200

        tokens = _tokens(desc)
        ranked = _activity_classifier(samples, tokens)

        return jsonify({
            'success': True,
            'suggestions': ranked[:3],
            'sample_size': len(samples),
        }), 200
    except Exception as e:
        log_error(f"AI suggest-activity hatası: {e}")
        return jsonify({'success': False, 'message': 'Öneri üretilemedi'}), 500


@ai_suggest_bp.route('/ai/suggest-duration', methods=['POST'])
def suggest_duration():
    """
    Görev için tahmini tamamlanma süresi (gün cinsinden).
    Body: { title, priority? }
    Geçmiş tamamlanmış görevlerin (öncelik bazlı) ortalama tamamlanma süresini döner.
    """
    try:
        data = request.get_json() or {}
        priority = data.get('priority')

        q = Task.query.filter(
            Task.status == 'tamamlandi',
            Task.created_at.isnot(None),
            Task.updated_at.isnot(None),
        )
        if priority:
            q = q.filter(Task.priority == priority)

        items = q.order_by(Task.updated_at.desc()).limit(500).all()
        if not items:
            return jsonify({'success': True, 'estimated_days': None,
                            'note': 'Yeterli geçmiş veri yok'}), 200

        durations = []
        for t in items:
            secs = (t.updated_at - t.created_at).total_seconds()
            durations.append(secs / 86400.0)
        durations.sort()
        # Median (aykırı değerlere karşı daha sağlam)
        n = len(durations)
        median = durations[n // 2] if n % 2 else (durations[n // 2 - 1] + durations[n // 2]) / 2
        avg = sum(durations) / n

        return jsonify({
            'success': True,
            'sample_size': n,
            'estimated_days': round(median, 1),
            'mean_days': round(avg, 1),
            'note': f'{n} benzer görev örneklendi',
        }), 200
    except Exception as e:
        log_error(f"AI suggest-duration hatası: {e}")
        return jsonify({'success': False, 'message': 'Tahmin üretilemedi'}), 500
