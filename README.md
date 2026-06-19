# OtagWork — İş Akışı Yönetim Sistemi

Takımlar ve bireyler için **görev, timesheet, izin ve ekip yönetimini** tek panelde toplayan,
çok kiracılı (multi-tenant) bir iş akışı yönetim uygulaması. Yapay zekâ destekli proje
planlama, gerçek zamanlı bildirimler ve PDF/CSV raporlama içerir.

> Bitirme projesi olarak geliştirilmiştir. Backend **Flask + PostgreSQL**, frontend **React + Vite**.

---

## ✨ Özellikler

- **Çok kiracılı çalışma alanı (workspace)** — Bireysel (solo) ve Takım (team) planları; her
  organizasyonun verisi birbirinden izole.
- **Roller** — Çalışan, Yönetici ve Sahip (owner). Yöneticiler yalnız **kendi takımlarının**
  üyelerini, görevlerini, izinlerini, timesheet'lerini ve raporlarını görür.
- **Görev yönetimi** — Kanban panosu (sürükle-bırak), takvim ve Gantt görünümleri; atama,
  onay/red akışı, ek süre talebi, öncelik, etiket, alt görev, görev bağımlılıkları, dosya
  ekleri, yorumlar ve zaman çizelgesi.
- **AI Proje Planlayıcı** — Google Gemini ile proje açıklamasından otomatik görev planı üretir;
  kişisel/takım modu ayrımı, görevleri ekip üyelerine atama.
- **Timesheet** — Günlük çalışma girişi, taslak → onay akışı, proje/aktivite/çalışma şekli
  ayarları (sürükle-bırak sıralama).
- **İzin yönetimi** — Talep/onay süreci ve izin bakiyesi.
- **Bildirimler** — Uygulama içi + e-posta; yaklaşan son tarih hatırlatmaları, kişiye özel
  bildirim tercihleri, bildirime tıklayınca ilgili kayda gitme.
- **Analitik & Raporlar** — KPI'lar, grafikler ve CSV/PDF dışa aktarma (Türkçe karakter
  destekli PDF), ekip kapsamına göre filtreli.
- **PWA** — Üretim build'inde service worker (offline-dostu, ağ-öncelikli HTML stratejisi).

---

## 🧱 Teknolojiler

| Katman | Teknolojiler |
|--------|--------------|
| **Frontend** | React 18, Vite 5, saf CSS (tema değişkenleri), rol bazlı kod bölme (code splitting) |
| **Backend** | Flask 3, SQLAlchemy, Flask-CORS, bcrypt |
| **Veritabanı** | PostgreSQL |
| **AI** | Google Gemini (`google-genai`) |
| **Raporlama** | ReportLab (PDF), CSV (UTF-8 BOM) |

---

## 📁 Proje Yapısı

```
is-akisi-yonetim/
├── backend/                # Flask API (port 5000)
│   ├── app/
│   │   ├── routes/         # API uçları (tasks, timesheets, leaves, analytics, ai_planner, ...)
│   │   ├── services/       # İş mantığı (ai_planner, notifications, mailer, ...)
│   │   ├── models.py       # SQLAlchemy modelleri
│   │   ├── scoping.py      # Rol bazlı veri kapsamı (yönetici/ekip)
│   │   └── config.py       # Yapılandırma
│   ├── scripts/            # Tablo oluşturma, migration, seed
│   ├── requirements.txt
│   └── run.py              # Giriş noktası
└── frontEnd/               # React + Vite (port 5173)
    ├── src/components/      # Dashboard'lar, modaller, bileşenler
    ├── public/             # manifest, service worker, ikon
    └── vite.config.js
```

---

## 🚀 Kurulum

### Gereksinimler
- **Python 3.10+**
- **Node.js 18+**
- **PostgreSQL 13+**

### 1) Veritabanı
PostgreSQL'de bir veritabanı oluşturun (varsayılan ad: `is_akis`):

```sql
CREATE DATABASE is_akis;
```

Bağlantı bilgisi `backend/app/config.py` içindedir. Kendi kullanıcı adı/şifrenize göre
güncelleyin (bkz. [Güvenlik](#-güvenlik)).

### 2) Backend

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
# source venv/bin/activate

pip install -r requirements.txt

# .env dosyasını oluşturun (örnekten kopyalayın) ve kendi değerlerinizi girin
cp .env.example .env

# Tabloları oluşturun
python -m scripts.create_tables

# (Var olan bir veritabanını taşıyorsanız migration'lar)
python -m scripts.migrate_to_multitenant
python -m scripts.migrate_add_notification_prefs

# Sunucuyu başlatın (http://localhost:5000)
python run.py
```

### 3) Frontend

```bash
cd frontEnd
npm install
npm run dev          # http://localhost:5173
```

Üretim için:

```bash
npm run build        # dist/ üretir
npm run preview      # build'i yerelde önizler
```

---

## ⚙️ Ortam Değişkenleri (`backend/.env`)

| Değişken | Açıklama |
|----------|----------|
| `SECRET_KEY` | Flask gizli anahtarı |
| `GEMINI_API_KEY` | Google Gemini API anahtarı ([ücretsiz al](https://aistudio.google.com/apikey)). Tanımsızsa AI özelliği zarifçe devre dışı kalır. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` / `SMTP_USE_TLS` | E-posta gönderimi (boş bırakılırsa mailler console'a düşer — dev modu) |
| `FRONTEND_URL` | Şifre sıfırlama bağlantısı için (varsayılan `http://localhost:5173`) |

---

## 👥 Roller

| Rol | Erişim |
|-----|--------|
| **Sahip / Yönetici** (team owner) | Workspace'in tamamı — üyeler, takımlar, projeler, görevler, raporlar |
| **Yönetici** (alt yönetici) | Yalnız kendi yönettiği takımların üyeleri ve onların görev/izin/timesheet verileri |
| **Çalışan** | Kendi görevleri, timesheet'i ve (takım planında) izin talepleri |

---

## 🔒 Güvenlik

> **GitHub'a göndermeden önce mutlaka okuyun.**

- `backend/.env.example` içinde **gerçek bir `GEMINI_API_KEY` örneği** bulunabilir — bunu
  **silin/iptal edin** ve kendi anahtarınızı `.env` içine koyun. `.env` dosyasını **asla**
  commit etmeyin (`.gitignore`'a ekleyin).
- `backend/app/config.py` içindeki **veritabanı bağlantısı (kullanıcı/şifre) gömülüdür**.
  Üretimde bunu bir ortam değişkenine taşıyın ve varsayılan şifreyi değiştirin.
- `SECRET_KEY`'i üretimde rastgele güçlü bir değerle değiştirin.

---

## 📜 Lisans

Eğitim amaçlı bitirme projesi. Aksi belirtilmedikçe tüm hakları saklıdır.
