# Tuş Atölyesi

Tuş Atölyesi, okulun yerel ağında çalışan Türkçe F ve Q on parmak klavye eğitimidir. Öğrenci bilgisayarları tarayıcıyla bağlanır. Öğrenci hesapları, ilerleme ve öğretmen raporları ana bilgisayardaki SQLite veritabanında saklanır.

## Windows kurulumu

1. Ana bilgisayarda `Tus-Atolyesi-Kurulum.exe` dosyasını çalıştırın ve Windows yönetici onayını verin.
2. **Yerel ağ ayarları** ekranında TCP portunu seçin. Varsayılan `3000`. `1–65535` aralığında, başka bir uygulamanın kullanmadığı bir port seçilebilir.
3. Kurulum, sunucuyu başlatır ve seçilen port için Windows Güvenlik Duvarı'na otomatik gelen TCP kuralı ekler. Kural tüm ağ profillerinde geçerlidir ve paketle gelen sunucu programına aynı alt ağdan gelen bağlantılarla sınırlıdır.
4. Kurulum sonunda **İlk öğretmen için kurulum parolası belirle** seçeneğini işaretleyin veya Başlat menüsünde **Tuş Atölyesi → Kurulum parolası belirle** kısayolunu kullanın. Tarayıcıda **Oturum aç → İlk öğretmeni kur** bağlantısından bu parolayla ilk öğretmen hesabını oluşturun.
5. Ana bilgisayarda `http://localhost:<port>` adresini açın. Ağdaki bilgisayarlar için ana bilgisayarın IPv4 adresini ve seçilen portu kullanın. Örneğin `http://192.168.1.100:3000`. IPv4 adresini `ipconfig` ile görebilirsiniz. Adresin değişmemesi için okulun ağ yöneticisi DHCP rezervasyonu yapabilir.

Sunucu, Windows Görev Zamanlayıcı'daki `TusAtolyesi` göreviyle bilgisayar açıldığında, kullanıcı oturumu açılmadan başlar. Port değiştirmek için kurulum paketini yeniden çalıştırıp yeni port seçin. Kurulum yeni dinleyiciyi denetler ve önceki güvenlik duvarı kuralını başarılı geçişten sonra kaldırır. Sessiz kurulumda `/VERYSILENT /PORT=3180` kullanılabilir.

Veritabanı `%ProgramData%\TusAtolyesi\data\atolye.sqlite` konumundadır. Kaldırma, başlangıç görevini ve uygulamanın güvenlik duvarı kurallarını kaldırır. Öğrenci kayıtları veri klasöründe kalır. Dosya tabanlı yedek için görevi durdurun, veri klasörünü bütün olarak kopyalayın ve görevi yeniden başlatın. Kurulum tanılama kaydı `%ProgramData%\TusAtolyesi\setup.log` dosyasındadır.

Varsayılan HTTP erişimi okulun güvenilir yerel ağı içindir. HTTPS kullanılan bir ters vekil sunucu arkasında `ATOLYE_SECURE_COOKIE=1` ile oturum çerezi yalnızca HTTPS üzerinden iletilebilir.

## Kaynak koddan çalıştırma

Node.js 24 veya üzeri gerekir. Terminali proje klasöründe açın.

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start -- --port 3000 --host 0.0.0.0
```

Sadece bu bilgisayarda denemek için `--host 127.0.0.1` kullanın. Otomatik Windows güvenlik duvarı ayarı için kurulum paketini kullanın. Sunucuya `--data C:\KlavyeData` verilerek veritabanı klasörü seçilebilir. Varsayılan çalışma klasöründeki `data` dizinidir. İlk öğretmen için kurulum parolası belirlemek üzere aşağıdaki komutu çalıştırın.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File installer/admin.ps1 -Runtime (Get-Command node.exe).Source -Server (Resolve-Path dist/server.cjs).Path -Data (Join-Path (Get-Location) 'data')
```

Kurulum paketini yeniden üretmek için Windows x64 Node.js ve Inno Setup 6 yüklüyken:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/package-windows.ps1
```

Çıktı `artifacts\installer\Tus-Atolyesi-Kurulum.exe` konumuna yazılır. Node çalışma zamanı, uygulama ve yazı tipleri pakete dahildir. Öğrenci istemcileri ve kurulum tamamlandıktan sonraki sunucu için internet gerekmez.

## Öğretmen hesapları ve öğrenci onayı

- İlk öğretmen oluşturulduğunda kurulum oturumları kapanır ve kurulum parolasıyla oturum açma sona erer. Aynı parola ana bilgisayardaki veritabanı sıfırlama ekranında kullanılabilir. Eski bir sürümden geçişte mevcut yönetici hesabıyla bir kez oturum açarak ilk öğretmeni oluşturabilirsiniz.
- Öğretmenler kendi kullanıcı adları ve parolalarıyla giriş yapar. **Hesap yönetimi** ekranından yeni öğretmen hesabı oluşturabilirler.
- Öğrenciler kayıt formundan başvuru gönderir. Öğretmen **Hesap yönetimi → Onay bekleyen öğrenciler** listesinden başvuruyu onayladıktan sonra öğrenci kendi parolasıyla giriş yapar.
- Öğretmen, başvuru listesinde sunucunun gördüğü IP adresini, başvuru tarihini ve saatini, ayrıca ağın DNS kayıtları sağlıyorsa cihaz adını görür.
- Güncelleme sırasında mevcut öğrenci hesapları ve çalışma geçmişleri korunur. Onay akışı yeni başvurulara uygulanır.
- Öğretmenler **Sınıf takibi → Öğrenci detayı → Öğrenciyi sil** ile bir öğrencinin hesabını ve sonuçlarını kalıcı olarak silebilir. Onay bekleyen başvurular **Hesap yönetimi** ekranından silinebilir.

## Veritabanını arayüzden sıfırlama

Ana bilgisayarda tarayıcıyla `http://localhost:<port>` adresini açın. **Oturum aç → Veritabanını sıfırla** bağlantısına gidin, kurulum parolasını girin ve onay alanına `SIFIRLA` yazın. Eski kurulumlarda ekran mevcut yönetici kullanıcı adını da isteyebilir.

Uygulama önce veri klasöründeki `yedekler` dizinine bir SQLite yedeği alır. Öğretmen ve öğrenci hesapları, sınavlar, sonuçlar ve oturumlar temizlenir. Ardından aynı kurulum parolasıyla **İlk öğretmeni kur** seçeneğini kullanın.

## Eğitim ve ölçüm

- Öğrenim yılı, sınıf ve klavye düzeni öğrenci hesabıyla ilişkilidir. Sınıf değişse bile önceki çalışmalar yapıldıkları sınıfın raporunda görünür.
- F ve Q için ayrı seviye, hata matrisi ve ders durumu tutulur. İlk sınav kazanılan seviyeyi atar. Sonraki sınavlar eşikler karşılanıyorsa en fazla bir kademe yükseltir. Net hız eksiye düşerse 0 gösterilir. Seviye 5 eşiği, dokümandaki 46–65 aralığıyla çakışmaması için 66 WPM'dir.
- Öğrenci sınavdan önce 1, 5, 10, 15 veya 20 dakika seçer. Tuş vuruşları ve seçilen süre tarayıcıda işlenir. Sunucu etkinliğin zaman ve tuş dizisinden puanı yeniden hesaplar. Sonuç yeniden gönderildiğinde aynı çalışma ikinci kez yazılmaz.
- Seviye sınavında bilgisayarın fiziksel klavyesini seçilen F veya Q düzenine ayarlayın. Sanal klavye tuşları, kaydedilen sınavda rehber olarak gösterilir. Alıştırmalarda ekran üzerinden de yazılabilir.
- Öğrenci ilerlemesi ve öğretmen raporları veritabanındaki oturumlardan hesaplanır. Öğretmen sayfasındaki **Yenile** düğmesi son kayıtları getirir.

## Sınıfa sınav atama

1. Öğretmen hesabında **Sınıf sınavları** bölümünü açın. Öğrenim yılını, sınıfı, seviyeyi ve süreyi seçip **Sınavı yayımla** düğmesine basın.
2. Sınıfın onaylı öğrencileri **Sınıf sınavlarım** bölümünden aynı metin ve süreyle sınava girer. Sınav yayındayken onaylanan yeni öğrenciler de katılabilir. Her öğrenci için süre sınavı başlattığında işlemeye başlar.
3. **Sonuçları aç** bölümünde katılımı ve puanları izleyin. **Sınavı durdur** sınavı öğrenci listesinden kaldırır. Sınav ekranı açık öğrenciler sonuç gönderebilir. **Yayına al** aynı sınavı daha önce başlamayanlara açar ve mevcut sonuçları korur.
4. Daha önce katılanlara yeni bir hak vermek için **Yeni sınıf sınavı** oluşturup yayımlayın.

## Sınıf raporlarını dışa aktarma

- **Sınıf takibi** veya **Sınıf sınavları → Sonuçları aç** ekranında **PDF indir** veya **Excel indir** seçeneğini kullanın. Genel sınıf raporunda, her öğrencinin ilgili klavye düzeniyle tamamladığı son sınıf sınavının puanı yer alır.
- Sınıf sınavı puanı, net WPM'nin seviye hedefine oranının (en çok 1) doğruluk yüzdesiyle çarpılıp tam sayıya yuvarlanmasıyla hesaplanır. Seviye 1–5 için hedefler sırasıyla 10, 16, 31, 46 ve 66 WPM'dir. Teslimi olmayan öğrencilerin puan alanı boş kalır.
