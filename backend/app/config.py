
import os

class Config:
    
    # SQLAlchemy veritabanı URI'si - doğrudan değerlerle oluştur
    # database.py'den import yerine doğrudan burada tanımlıyoruz
    SQLALCHEMY_DATABASE_URI = (
        "postgresql://postgres:12345678@localhost:5432/is_akis"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ECHO = False  
    
    # Flask yapılandırması
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    DEBUG = True

    # Dosya yükleme — 12 MB istek sınırı (gerçek dosya sınırı route'ta 10 MB)
    MAX_CONTENT_LENGTH = 12 * 1024 * 1024

    # SMTP yapılandırması — boş bırakılırsa e-postalar console'a düşer (dev modu)
    SMTP_HOST = os.environ.get('SMTP_HOST', '')
    SMTP_PORT = int(os.environ.get('SMTP_PORT', '587'))
    SMTP_USER = os.environ.get('SMTP_USER', '')
    SMTP_PASS = os.environ.get('SMTP_PASS', '')
    SMTP_FROM = os.environ.get('SMTP_FROM', 'noreply@is-akis.local')
    SMTP_USE_TLS = os.environ.get('SMTP_USE_TLS', 'true').lower() == 'true'

    # Frontend URL — şifre sıfırlama bağlantısı için
    FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:5173')

