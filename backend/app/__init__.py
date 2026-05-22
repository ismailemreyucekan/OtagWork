"""
Flask uygulama factory
"""
# .env dosyasını config'den önce yükle (GEMINI_API_KEY, SMTP_*, vb. için)
from dotenv import load_dotenv
load_dotenv()

from flask import Flask
from flask_cors import CORS
from app.config import Config
from app.models import db
from app.logger import log_operation, log_success

def create_app(config_class=Config):
    """Flask uygulaması oluşturur"""
    app = Flask(__name__)
    app.config.from_object(config_class)
    
    log_operation("Flask uygulaması oluşturuluyor")
    
    db.init_app(app)
    CORS(app)
    
    from app.routes import register_routes
    register_routes(app)
    
    log_success("Flask uygulaması hazır")
    return app

