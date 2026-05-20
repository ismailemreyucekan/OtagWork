"""
RFC 6238 TOTP — standart kütüphane ile.
Google Authenticator / Authy / Microsoft Authenticator uyumlu.
"""
import base64
import hashlib
import hmac
import os
import struct
import time


def generate_secret(length_bytes=20):
    """20 byte (160 bit) random secret. Base32 encoded string olarak döner."""
    raw = os.urandom(length_bytes)
    # base32, padding'siz
    return base64.b32encode(raw).decode('ascii').rstrip('=')


def _decode_secret(secret_b32):
    """Base32 secret'i bytes'a çevirir. Padding'i toleranslı."""
    s = secret_b32.replace(' ', '').upper()
    # Padding ekle
    pad = (-len(s)) % 8
    s = s + ('=' * pad)
    return base64.b32decode(s)


def totp(secret_b32, t=None, step=30, digits=6, algo='sha1'):
    """RFC 6238 TOTP kodu üret."""
    if t is None:
        t = int(time.time())
    counter = t // step
    key = _decode_secret(secret_b32)
    msg = struct.pack('>Q', counter)
    h = hmac.new(key, msg, getattr(hashlib, algo)).digest()
    offset = h[-1] & 0x0F
    code = (
        (h[offset] & 0x7F) << 24
        | (h[offset + 1] & 0xFF) << 16
        | (h[offset + 2] & 0xFF) << 8
        | (h[offset + 3] & 0xFF)
    )
    return str(code % (10 ** digits)).zfill(digits)


def verify(secret_b32, code, window=1):
    """
    window: ± kaç step toleransa izin verir (saat farkı için).
    True/False döner.
    """
    if not code or not secret_b32:
        return False
    code = str(code).strip().replace(' ', '')
    if not code.isdigit() or len(code) != 6:
        return False
    now = int(time.time())
    for i in range(-window, window + 1):
        if hmac.compare_digest(totp(secret_b32, t=now + i * 30), code):
            return True
    return False


def provisioning_uri(secret_b32, account_name, issuer='İş Akış Yönetim Sistemi'):
    """
    otpauth:// URL'si — QR kod kütüphaneleri bunu görsel QR'a çevirir.
    Kullanıcı uygulamada (Authenticator) manuel da girebilir.
    """
    from urllib.parse import quote
    label = quote(f'{issuer}:{account_name}')
    iss = quote(issuer)
    return f'otpauth://totp/{label}?secret={secret_b32}&issuer={iss}&algorithm=SHA1&digits=6&period=30'
