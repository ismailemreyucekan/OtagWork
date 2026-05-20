# Tanıtım Sayfası (Landing Page) Planı

> İş Akış Yönetim Sistemi — siteye ilk girişte gösterilecek tanıtım sayfası.
> Hedef: Ziyaretçiyi 10 saniyede ürünün ne işe yaradığına ikna etmek, ardından "Giriş Yap" / "Demo İste" aksiyonuna yönlendirmek.

---

## 1. Amaç ve Hedef Kitle

**Amaç**
- Yeni ziyaretçiye sistemin amacını ve katma değerini anlatmak.
- Mevcut kullanıcı için hızlı "Giriş Yap" yolunu açık tutmak.
- Yöneticilere yönelik ürün vitrini olmak (bitirme projesi sunumu için de).

**Hedef kitle**
- **İşletme/ekip yöneticileri:** "Çalışanlarımın saatlerini ve görevlerini tek panelde nasıl izlerim?"
- **Çalışanlar:** "Timesheet'imi nasıl girerim, görevlerimi nereden takip ederim?"
- **Akademik jüri / tanıtım:** "Bu proje neyi çözüyor, hangi teknolojileri kullanıyor?"

---

## 2. Kullanıcı Yolculuğu

```
[Site açılışı]
     ↓
[Landing Page]  ──── "Giriş Yap" ────▶  [LoginPage seçim ekranı]
     │                                          ↓
     │                                  [Kullanıcı/Admin formu]
     │                                          ↓
     │                                  [Dashboard]
     │
     └── Oturum varsa: Otomatik Dashboard'a yönlendir (Landing'i atla)
```

**Önemli kural:** Daha önce giriş yapmış ve "Beni hatırla" işaretli kullanıcı landing'i görmemeli — `localStorage`/`sessionStorage`'da oturum varsa direkt dashboard.

---

## 3. Sayfa Bölümleri

Tek sayfalık (one-page) tasarım. Üstten alta:

### 3.1 Navbar (sabit, yarı saydam)
- Sol: Logo + "İş Akış Yönetim Sistemi"
- Orta: Bölüm bağlantıları → Özellikler · Nasıl Çalışır · Kullanıcılar · Sıkça Sorulanlar
- Sağ: **[Giriş Yap]** birincil buton

### 3.2 Hero (ekranın tamamı)
- **Başlık (H1):** "İş Akışınızı Tek Yerden Yönetin"
- **Alt başlık:** "Görev atayın, ekibinizin saatlerini takip edin, raporlayın. Yöneticiler ve çalışanlar için tek panel."
- **Birincil CTA:** "Hemen Giriş Yap" → `LoginPage`
- **İkincil CTA:** "Özellikleri Keşfet" → `#features` anchor scroll
- **Arka plan:** Mevcut tema (#0a0e27 lacivert) + altın/sarı (#FFD700) vurgu, animasyonlu ışıltı/grid pattern
- **Görsel:** Sağda dashboard mockup (gerçek ekran görüntüsü/illüstrasyon)
- **Sosyal kanıt mini bandı:** "5 dakikada başlayın · Türkçe arayüz · Açık kaynak"

### 3.3 Sayılarla Sistem (kısa istatistik şeridi)
4 mini kart — animasyonlu sayaç:
- ⏱ **Saat takibi** — Günlük/haftalık özet
- 📋 **Görev** — Kanban, takvim, Gantt
- 👥 **Takım** — Çoklu rol desteği
- 🔔 **Bildirim** — Anında haberdar

### 3.4 Ana Özellikler (`#features`)
3 sütunlu grid (mobilde tek sütun) — her özellik için ikon + başlık + 1-2 satır açıklama:

1. **Timesheet & Onay Akışı** — Günlük saat girişi, taslak/onay döngüsü, yönetici onayı, red gerekçesi.
2. **Görev Yönetimi** — Görev ata, öncelik (kritik/yüksek/orta/düşük), onay süreci, ek süre talebi.
3. **Kanban Panosu** — Sürükle-bırak ile durum güncelle: Beklemede → Devam → Tamamlandı.
4. **Takvim & Gantt** — Aylık takvim ve proje bazlı Gantt zaman çizelgesi.
5. **Bildirim Sistemi** — Görev atamaları, onaylar, yorumlar; çan ikonu + okunmamış sayacı.
6. **Yorum & Aktivite Günlüğü** — Görev üzerinde tartışma ve audit trail.
7. **Dosya Ekleri** — Sürükle-bırak yükleme; pdf/docx/png/xlsx desteği.
8. **Alt Görev & Bağımlılık** — Hiyerarşi ve "önce şu tamamlanmalı" kuralı.
9. **Etiket & Global Arama** — Renkli etiketler, Ctrl/Cmd+K kısayolu.

### 3.5 Nasıl Çalışır (`#how`)
3 adımlı süreç (numaralı kartlar, soldan sağa):

1. **Giriş Yap** — Yönetici veya çalışan olarak sisteme girin.
2. **Görev & Saat Gir** — Çalışan günlük timesheet'ini girer, yönetici görev atar.
3. **Onayla & Raporla** — Yönetici onaylar, sistem rapor üretir.

### 3.6 Kim İçin? (`#users`)
2 sütunlu vitrin — mevcut LoginPage'deki "Kullanıcı / Admin" kart tasarımının daha açıklayıcı versiyonu:

**Çalışanlar için**
- Saatlerimi kaydet
- Görevlerimi sürükle-bırak ile yönet
- Ek süre talep et
- Görev üzerine yorum ve dosya ekle

**Yöneticiler & Admin için**
- Takım/proje oluştur
- Görev ata, onayla
- Timesheet analizi (mevcut servis)
- Tüm görevleri Kanban/Gantt/Takvim'de gör

### 3.7 Ekran Görüntüleri (`#screens`)
- Sekmeli galeri (Kanban / Takvim / Gantt / Timesheet) veya hover'da büyüyen 4'lü grid
- Şimdilik yer tutucular, sonra gerçek ekran görüntüleri konulacak

### 3.8 Sıkça Sorulanlar (`#faq`)
Açılır-kapanır accordion:
- "Verilerim güvende mi?" — PostgreSQL, bcrypt şifreleme.
- "Mobil cihazlarda çalışıyor mu?" — Responsive tasarım.
- "Kaç kullanıcı destekleniyor?" — Sınırsız (limit yok).
- "Sistem hangi teknolojiyle yazıldı?" — React + Flask + PostgreSQL.

### 3.9 Son CTA Bandı
Tam genişlik, koyu lacivert üzerine altın sarı buton:
- **Başlık:** "Şimdi ekibinizi bir adım öne çıkarın."
- **Buton:** "Sisteme Giriş Yap"

### 3.10 Footer
- Sol: Logo + kısa açıklama
- Orta: Linkler (Hakkımızda · İletişim · Gizlilik)
- Sağ: GitHub repo bağlantısı, "© 2026 İş Akış Yönetim Sistemi"

---

## 4. Tasarım Dili

**Renk paleti (mevcuttan)**
- Arkaplan ana: `#0a0e27` (lacivert)
- Yüzey: `#0f1534` (panel/kart)
- Accent / aksiyon: `#FFD700` (altın sarı)
- Vurgu hover: `#FFA500` (turuncu)
- Metin birincil: `#f3f4f6`
- Metin ikincil: `#94a3b8`
- Başarı: `#10b981`, Uyarı: `#f59e0b`, Hata: `#ef4444`

**Tipografi**
- Sistem fontu (mevcut `-apple-system, ... Segoe UI, Roboto`)
- H1: 48–64px / 700, satır yüksekliği 1.1
- H2: 32–40px / 700
- Gövde: 16px / 1.6, ikincil 14px

**Spacing & motion**
- Bölüm aralığı: 80–120px dikey
- Container max-width: 1200px
- Animasyonlar: `IntersectionObserver` ile bölümler viewport'a girince soft fade-in + translateY (mevcut `fadeIn` keyframe yeniden kullanılabilir)
- Logo yüzme animasyonu (mevcut `logoFloat`) korunur

**Erişilebilirlik**
- Kontrast en az AA (4.5:1)
- `aria-label`'lar
- Klavye ile gezinilebilir (Tab/Enter)
- Reduced motion için `@media (prefers-reduced-motion)` ile animasyonları kapat

---

## 5. Frontend Implementasyon Planı

### 5.1 Dosya yapısı
```
frontEnd/src/components/landing/
├── LandingPage.jsx          # Ana orkestra, tüm bölümleri sırayla render
├── LandingPage.css          # Sayfaya özgü stiller
├── sections/
│   ├── LandingNavbar.jsx
│   ├── HeroSection.jsx
│   ├── StatsBar.jsx
│   ├── FeaturesGrid.jsx     # 9 özellik kartı
│   ├── HowItWorks.jsx       # 3 adımlı süreç
│   ├── UserTypes.jsx        # Çalışan / Yönetici kartları
│   ├── ScreensGallery.jsx
│   ├── FAQ.jsx
│   ├── FinalCTA.jsx
│   └── LandingFooter.jsx
└── data/
    └── features.js          # Özellik listesi, ikon + metin sabitleri (içerik yönetimi kolaylaşır)
```

### 5.2 Routing entegrasyonu

Şu an `App.jsx` tek bir `LoginPage` döndürüyor. Routing yok, state ile geçişler yapılıyor.

**En sade yaklaşım (önerilen):** `App.jsx` içine `view` state ekle — `'landing' | 'login' | 'dashboard'`. Router kütüphanesi getirme.

```jsx
// App.jsx (taslak)
function App() {
  const [view, setView] = useState(() => {
    // Daha önce giriş yapmış kullanıcıyı landing'e takılmadan login'e/dashboard'a düşür
    const saved = localStorage.getItem('iay_session') || sessionStorage.getItem('iay_session')
    return saved ? 'login' : 'landing'
  })

  if (view === 'landing') return <LandingPage onEnter={() => setView('login')} />
  return <LoginPage initialUser={null} />   // mevcut akış
}
```

**Alternatif (ileride):** `react-router-dom` ekle, `/` → landing, `/login` → LoginPage, `/app/*` → dashboard. Bu refactor zaman alır; bitirme süresi kısaysa state-tabanlı yaklaşım yeterli.

### 5.3 LoginPage'e dokunmadan landing'i koymak

Mevcut "welcome-screen" bloğu (Kullanıcı/Admin seçim ekranı) `LoginPage` içinde duruyor. Yeni akış:
1. `App.jsx` → `LandingPage` ilk açılır.
2. Navbar'daki "Giriş Yap" → `setView('login')` → mevcut LoginPage'in seçim ekranı gelir.
3. Logout sonrası `view='landing'` yapılır (`LoginPage`'in `onLogout`'unda parent state güncellenir).

### 5.4 Performans
- Görseller `loading="lazy"`
- Bölümler `IntersectionObserver` ile animasyonu sadece görünürken tetikler
- CSS animasyonları transform/opacity (composite layer)
- Toplam bundle artışı 30 KB altında kalmalı (lottie vb. heavy lib yok)

### 5.5 Responsive kırılım noktaları
- Mobil: < 640px (tek sütun, hamburger menü)
- Tablet: 640–1024px (2 sütun)
- Desktop: > 1024px (3 sütun, tam genişlik)

---

## 6. İçerik Taslağı (Türkçe Metinler)

**Hero**
- H1: "İş Akışınızı Tek Yerden Yönetin"
- Alt: "Görev atamadan saat takibine, onay süreçlerinden raporlamaya — ekibiniz için modern bir iş akış sistemi."
- CTA: "Giriş Yap" / "Özellikleri Gör"

**Tagline (mini bant)**
- "Türkçe arayüz · Modern teknoloji · Açık geliştirme"

**Final CTA**
- "Ekibinizi bir adım öne çıkarın."
- "Saat takibinden Gantt'a, bildirimden raporlamaya kadar her şey burada."

---

## 7. Yapılacaklar Listesi (Sıralı Adımlar)

- [ ] **1.** `frontEnd/src/components/landing/` klasör yapısı oluştur.
- [ ] **2.** `LandingPage.jsx` iskelet (bölüm component'leri henüz boş).
- [ ] **3.** `App.jsx` state yönetimi: `view = 'landing' | 'login'`.
- [ ] **4.** `LandingNavbar.jsx` — sticky, "Giriş Yap" butonu.
- [ ] **5.** `HeroSection.jsx` — başlık, CTA, sağda mockup/illüstrasyon.
- [ ] **6.** `StatsBar.jsx` — 4 mini metric.
- [ ] **7.** `FeaturesGrid.jsx` + `data/features.js` — 9 özellik kartı.
- [ ] **8.** `HowItWorks.jsx` — 3 adımlı süreç.
- [ ] **9.** `UserTypes.jsx` — Çalışan / Yönetici karşılaştırma.
- [ ] **10.** `ScreensGallery.jsx` — Şimdilik yer tutucu, sonra gerçek ekran görüntüsü.
- [ ] **11.** `FAQ.jsx` — Accordion (native `<details>` ile).
- [ ] **12.** `FinalCTA.jsx` + `LandingFooter.jsx`.
- [ ] **13.** Responsive test (DevTools mobil görünüm).
- [ ] **14.** IntersectionObserver ile soft fade-in animasyonları.
- [ ] **15.** Erişilebilirlik geçişi: kontrast, klavye, `aria-*`.
- [ ] **16.** Gerçek ekran görüntülerini ekle (Kanban, Gantt, Takvim, Timesheet'ten alıntı).

**İlk teslim hedefi:** Adım 1-9 (statik bir sayfa, animasyon yok) — temel görsel.
**Cilalı sürüm:** Adım 10-16 (animasyon, ekran görüntüleri, a11y).

---

## 8. Açık Sorular / Karar Verilecekler

- **Ekran görüntüleri nasıl üretilecek?** Gerçek dashboard'dan screen-record/screenshot mı, illüstrasyon mı?
- **Router eklenecek mi?** Şimdilik state ile yetinmek mi, yoksa `react-router-dom` ile temiz URL'ler mi?
- **Çoklu dil?** Sadece TR mi yoksa EN de eklenecek mi? (Şimdilik TR yeterli.)
- **Demo modu?** "Giriş yapmadan keşfet" gibi bir read-only demo gerekli mi?
- **Footer link içerikleri?** "Hakkımızda", "Gizlilik" sayfaları da yapılacak mı yoksa sadece bağlantı mı?
