"""
Basit in-memory rate limiter.

Üretimde Redis ile yapılır; bitirme/dev için yeterli.
Process restart'ta sayaç sıfırlanır.

Kullanım:
    @rate_limit(max_calls=5, period_seconds=60, key_fn=lambda: request.remote_addr)
    def login(): ...
"""
import time
import threading
from functools import wraps
from flask import request, jsonify

_lock = threading.Lock()
_buckets = {}  # key -> list[timestamps]


def _now():
    return time.time()


def _check(key, max_calls, period):
    now = _now()
    cutoff = now - period
    with _lock:
        arr = _buckets.get(key, [])
        # Eski timestamp'leri at
        arr = [t for t in arr if t > cutoff]
        if len(arr) >= max_calls:
            _buckets[key] = arr
            # En eski denemeden sonra ne zaman yeni hak kazanır
            retry_after = max(1, int(period - (now - arr[0]) + 1))
            return False, retry_after
        arr.append(now)
        _buckets[key] = arr
        return True, 0


def rate_limit(max_calls=10, period_seconds=60, key_fn=None, scope=''):
    """
    key_fn: () -> str — varsayılan: client IP + endpoint
    scope: birden çok endpoint'i tek limit altında toplamak için (örn. 'auth').
    """
    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            if key_fn:
                k = key_fn()
            else:
                ip = request.headers.get('X-Forwarded-For', request.remote_addr) or 'unknown'
                k = f'{scope or fn.__name__}:{ip}'
            ok, retry = _check(k, max_calls, period_seconds)
            if not ok:
                return jsonify({
                    'success': False,
                    'message': f'Çok fazla deneme. {retry} saniye sonra tekrar deneyin.',
                }), 429
            return fn(*args, **kwargs)
        return wrapper
    return deco
