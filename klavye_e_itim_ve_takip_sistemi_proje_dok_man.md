# 🌐 Web Tabanlı On Parmak Klavye Eğitim ve Takip Sistemi (Proje Dokümanı)

## 1. Proje Özeti ve Mimari Yaklaşım

Bu proje, okul/kurum içindeki **tek bir ana bilgisayara (sunucuya)** kurulan ve aynı yerel ağdaki (LAN) tüm öğrenci/öğretmen bilgisayarlarından tarayıcı üzerinden IP adresiyle (`http://192.168.x.x:3000`) erişilebilen **Web Tabanlı On Parmak Klavye Eğitim Yazılımı**dır.

### Neden Web Tabanlı Yerel Sunucu Mimarisi?
* **Sıfır İstemci Kurulumu:** Öğrenci bilgisayarlarına tek tek kurulum (Setup) yapılmasına gerek kalmaz; güncel bir web tarayıcısı yeterlidir.
* **Merkezi Veri ve Anlık Takip:** Tüm sınıfların sınav sonuçları, tuş hata istatistikleri ve gelişim grafikleri tek bir merkezi veritabanında toplanır.
* **Gecikmesiz (Zero-Latency) Ölçüm:** Klavye tuş vuruşları (`keydown`/`keyup`) ve süre hesaplamaları istemci tarayıcısında (JavaScript) anlık olarak işlenir; test bitiminde sonuç paketi sunucuya iletilir. Böylece ağ gecikmesi hız ölçümlerini etkilemez.
* **Kolay Dağıtım:** Ana makineye tek tıkla kurulabilen bir paket (Docker veya Windows Arka Plan Servisi / Installer) ile sistem dakikalar içinde ayağa kaldırılır.

---

## 2. Teknoloji Yığını (Tech Stack)

* **Frontend (İstemci Arayüzü):** React.js (veya Vue.js) + TailwindCSS (Hızlı, tepkisel sanal klavye animasyonları ve modern arayüz için).
* **Backend (Sunucu & API):** Node.js (Express / Fastify) veya Python (FastAPI) veya C# (ASP.NET Core Web API).
* **Veritabanı:** **PostgreSQL** veya **SQLite (WAL Modu)** *(Eş zamanlı 30-50 öğrencinin aynı anda sınav verisi yazabilmesi için PostgreSQL önerilir).*
* **Grafik ve Veri Görselleştirme:** Chart.js veya Recharts (Admin paneli gelişim eğrileri ve sınıf analizleri için).
* **Kurulum ve Servis Yönetimi:** Ana makinede bilgisayar açıldığında otomatik başlaması için **NSSM (Non-Sucking Service Manager)** veya **Windows Service** yapılandırması.

---

## 3. Ağ ve Kurulum Gereksinimleri (Ana Makine)

1. **Sabit IP Tanımlaması:** Ana makineye yerel ağda değişmeyen bir IP adresi atanır (Örn: `192.168.1.100`).
2. **Güvenlik Duvarı (Firewall) İzni:** Windows Defender Güvenlik Duvarı üzerinden uygulamanın çalıştığı porta (Örn: `TCP 3000` veya `80`) gelen bağlantılar (Inbound Rules) açılır.
3. **Erişim:** Sınıftaki diğer bilgisayarlar tarayıcı adres çubuğuna `http://192.168.1.100:3000` yazarak doğrudan giriş ekranına ulaşır.

---

## 4. Sistem Rolleri ve Kullanıcı Akışı

### A. Öğrenci (Standart Kullanıcı) Akışı

1. **Giriş ve Dönem/Sınıf Seçimi:**
   * Kullanıcı adı ve şifre ile oturum açılır (İlk girişte kayıt formu veya admin tarafından önceden tanımlanmış hesap).
   * **Öğrenim Yılı** (Örn: `2026-2027`) ve **Sınıf** (Örn: `9-A`, `11-Bilişim`) seçilir.
2. **Klavye Düzeni Seçimi:**
   * **Türkçe F** veya **Türkçe Q** seçeneği belirlenir. (Her iki klavye düzeni için ayrı seviye ve hata istatistiği tutulur).
3. **Temel Oturuş ve Parmak Yerleşimi Rehberi:**
   * Seçilen klavyeye göre ekranda interaktif SVG tabanlı sanal klavye açılır.
   * **Temel Sıra (Home Row)** vurgulanır:
     * *Türkçe F:* Sol el (`U, İ, E, A`), Sağ el (`K, M, L, Y`).
     * *Türkçe Q:* Sol el (`A, S, D, F`), Sağ el (`J, K, L, Ş`).
   * Hangi parmağın hangi tuşlara basacağı renk kodları ve şeffaf el görseliyle gösterilir.
4. **1 Dakikalık Seviye Tespit Sınavı:**
   * 60 saniyelik geri sayım başlar.
   * Kullanıcı yazarken doğru harfler yeşil, hatalı basılan harfler kırmızı olarak işaretlenir; anlık WPM ve doğruluk göstergesi güncellenir.
   * Süre bitiminde sonuçlar sunucuya kaydedilir ve kullanıcıya seviyesi atanır (*Seviye 1 - Seviye 5*).
5. **Kişiselleştirilmiş Eğitim ve Alıştırma Modülü:**
   * Kullanıcının seviyesine uygun derslerin kilidi açılır:
     * *Seviye 1 (Temel Sıra):* 2 ve 3 harfli kombinasyonlar (Örn: `ak`, `al`, `el`, `kal`, `ela`, `kale`).
     * *Seviye 2 (Üst ve Alt Sıra):* Tüm harflerin dahil olduğu kelimeler.
     * *Seviye 3 (Cümle Pratikleri):* Büyük/küçük harf geçişleri ve anlamlı cümleler.
     * *Seviye 4 (İleri Düzey):* Noktalama işaretleri (`.`, `,`, `;`, `:`, `?`, `!`), parantezler `()`, tırnak `""` ve rakamlar.
   * **Akıllı Hata Odaklı Alıştırma (Zayıf Karakter Motoru):** Veritabanındaki tuş hata oranları analiz edilerek kullanıcının en çok hata yaptığı karakterlerden (Örn: `'Ğ'`, `'Ş'`, `'('`) oluşan dinamik özel alıştırma metinleri üretilir.
6. **Oyunlaştırma (Mini Oyunlar):**
   * *Kelime Yağmuru:* Yukarıdan düşen kelimeleri tabana ulaşmadan yazma.
   * *Hız Yarışı:* Doğru yazılan kelimelerle aracın hızlandığı zamana karşı yarış.
7. **Seviye Yükseltme Sınavı:**
   * Alıştırmaları tamamlayan öğrenci tekrar **1 Dakikalık Seviye Tespit Sınavı**na girer. Hedeflenen WPM ve doğruluk barajını geçerse seviyesi bir üst kademeye çıkarılır.

### B. Yönetici (Admin / Öğretmen) Akışı

1. **Yönetim Paneli Girişi:** Admin yetkisine sahip hesap ile giriş yapılır.
2. **Yıl ve Sınıf Bazlı Genel Gözlem:**
   * Üst filtre barından **Öğrenim Yılı** ve **Sınıf** seçilir.
   * Seçilen sınıftaki tüm öğrencilerin anlık durumu tablo halinde listelenir: *Öğrenci Adı, Klavye Türü (F/Q), Mevcut Seviye, Ortalama Hız (WPM), Doğruluk Oranı (%), Toplam Çalışma Süresi*.
   * Sınıfın genel hız ortalaması ve en çok hata yapılan ortak tuşlar özet kartlarda gösterilir.
3. **Öğrenci Detay Analizi (Drill-Down):**
   * Tablodaki herhangi bir öğrencinin satırına tıklandığında o öğrenciye ait detaylı analiz ekranı açılır:
     * **Gelişim Grafiği:** Tarihlere göre WPM hız ve doğruluk yüzdesi değişim grafiği.
     * **Klavye Isı Haritası (Heatmap):** Öğrencinin en çok hata yaptığı tuşların klavye şeması üzerinde kırmızı tonlarla vurgulanması.
     * **Sınav ve Alıştırma Geçmişi:** Tamamlanan tüm 1 dakikalık testlerin ve alıştırmaların tarih, süre, net vuruş ve yanlış karakter dökümü.

---

## 5. Veritabanı Tasarımı (İlişkisel Şema)

```
[Users]
- id (PK, UUID/Int)
- username (Unique)
- password_hash
- full_name
- role ('student' | 'admin')
- academic_year (Örn: '2026-2027')
- class_name (Örn: '10-B')
- preferred_keyboard ('F' | 'Q')
- current_level_f (Int: 1-5)
- current_level_q (Int: 1-5)
- created_at

[Sessions_And_Tests]
- id (PK)
- user_id (FK -> Users.id)
- activity_type ('placement_test' | 'lesson' | 'game')
- keyboard_layout ('F' | 'Q')
- wpm (Float)
- cpm (Float)
- accuracy (Float)
- error_count (Int)
- duration_seconds (Int)
- created_at

[Character_Error_Stats]
- id (PK)
- user_id (FK -> Users.id)
- keyboard_layout ('F' | 'Q')
- expected_char (Varchar(5))
- pressed_char (Varchar(5))
- error_count (Int)
- total_hits (Int)
```

---

## 6. Temel API Uç Noktaları (REST Endpoints)

* `POST /api/auth/login` — Kullanıcı girişi ve JWT oturum anahtarı üretimi.
* `POST /api/auth/register` — Yeni öğrenci kaydı (Sınıf ve öğrenim yılı bilgisiyle).
* `GET /api/lessons?layout=F&level=1` — Seçilen klavye ve seviyeye uygun ders listesini getirir.
* `GET /api/lessons/custom-weakness` — Kullanıcının en çok hata yaptığı karakterlere göre dinamik alıştırma üretir.
* `POST /api/results/submit` — Tamamlanan sınav/alıştırma sonucunu ve tuş hata matrisini kaydeder, gerekirse kullanıcı seviyesini günceller.
* `GET /api/admin/overview?year=2026-2027&class=10-B` — Seçilen yıl ve sınıftaki öğrencilerin özet performans listesini döner.
* `GET /api/admin/student/:id` — Tıklanan öğrencinin gelişim grafiklerini, ısı haritası verilerini ve sınav geçmişini getirir.

---

## 7. Puanlama ve Seviye Algoritması

* **Net Hız (WPM - Dakikadaki Kelime Sayısı):**
  $$
  \text{Net WPM} = \frac{(\text{Toplam Doğru Karakter} / 5) - \text{Düzeltilmemiş Hatalar}}{\text{Süre (Dakika)}}
  $$

* **Seviye Eşik Değerleri:**
  * **Seviye 1 (Başlangıç):** $0 - 15$ WPM veya Doğruluk $< \%80$ *(2-3 harfli temel sıra heceleri)*
  * **Seviye 2 (Gelişmekte):** $16 - 30$ WPM ve Doğruluk $\ge \%85$ *(Tüm harfler ve kelimeler)*
  * **Seviye 3 (Orta):** $31 - 45$ WPM ve Doğruluk $\ge \%90$ *(Cümleler ve büyük/küçük harf)*
  * **Seviye 4 (İleri):** $46 - 65$ WPM ve Doğruluk $\ge \%93$ *(Noktalama işaretleri, parantez ve rakamlar)*
  * **Seviye 5 (Uzman):** $65+$ WPM ve Doğruluk $\ge \%96$ *(Hız metinleri ve profesyonel yazım)*

---

## 8. Geliştirme Yol Haritası (Fazlar)

1. **Faz 1 (Altyapı & Veritabanı):** Backend API iskeleti, veritabanı tabloları, Login/Kayıt ve Sınıf/Yıl seçim ekranları.
2. **Faz 2 (Sanal Klavye & Seviye Tespit Motoru):** Türkçe F ve Q haritaları, parmak rehberi, 1 dakikalık test ekranı ve istemci tarafı gecikmesiz tuş ölçüm motoru.
3. **Faz 3 (Alıştırma & Zayıf Karakter Algoritması):** Kademeli ders içerikleri (2-3 harf -> noktalama işaretleri) ve hata istatistiğine göre özel ders üreten algoritma.
4. **Faz 4 (Oyunlaştırma):** Tarayıcı içi (Canvas/DOM) kelime yağmuru ve hız yarışı oyunları.
5. **Faz 5 (Admin Paneli):** Yıl/sınıf filtreleme, öğrenci tablosu, tıklanabilir öğrenci detay sayfası (gelişim grafikleri ve klavye ısı haritası).
6. **Faz 6 (Paketleme & Ağ Kurulumu):** Ana makine için tek tıkla kurulum/servis betiği ve Windows Firewall port yapılandırma rehberi.