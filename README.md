# NestJS Starter

Yeni backend projeleri için başlangıç iskeleti. Auth, oturum yönetimi, denetim
kaydı, hata yönetimi, doğrulama ve loglama altyapısı kurulu gelir.

Nest 12 + ESM · Zod · Prisma 7 · pino · Vitest

## Kurulum

```bash
git clone https://github.com/berkaydenizyilmaz/nest-starter.git yeni-proje && cd yeni-proje
rm -rf .git && git init

pnpm install                      # postinstall Prisma client'ı üretir
cp .env.example .env
openssl rand -base64 48           # JWT_ACCESS_SECRET'a yaz

pnpm exec prisma migrate dev --name init
pnpm start:dev
```

Node.js'in LTS sürümlerinden biri (**22.22.3+** veya **24.15+**) ve PostgreSQL
gerekir. Tek numaralı hatlar (23.x, 25.x) desteklenmiyor.

## Endpoint'ler

| Method | Yol | Erişim |
|---|---|---|
| `POST` | `/api/v1/auth/register` | — |
| `POST` | `/api/v1/auth/login` | — |
| `POST` | `/api/v1/auth/refresh` | — |
| `POST` | `/api/v1/auth/logout` | — |
| `GET` | `/api/v1/auth/sessions` | bearer |
| `DELETE` | `/api/v1/auth/sessions/:id` | bearer |
| `DELETE` | `/api/v1/auth/sessions` | bearer |
| `GET` | `/api/v1/users/me` | bearer |
| `GET` | `/api/v1/users/me/security-log` | bearer |
| `DELETE` | `/api/v1/users/me` | bearer |
| `GET` | `/api/v1/admin/audit-logs` | admin |
| `GET` | `/api/health/live` | — |
| `GET` | `/api/health/ready` | — |

OpenAPI: `/api/docs` (yalnızca `NODE_ENV !== production`).

## Ortam değişkenleri

Şema `src/config/env.schema.ts`. Eksik veya geçersiz bir değişkende uygulama
**açılmaz** ve sorunlu olanları listeler.

| Değişken | Zorunlu | Varsayılan | Not |
|---|---|---|---|
| `DATABASE_URL` | **evet** | — | PostgreSQL bağlantı adresi |
| `JWT_ACCESS_SECRET` | **evet** | — | En az 32 karakter |
| `NODE_ENV` | hayır | `development` | `production`'da Swagger kapanır |
| `PORT` | hayır | `3000` | |
| `DATABASE_POOL_MAX` | hayır | `10` | Havuzdaki azami bağlantı |
| `JWT_ACCESS_TTL` | hayır | `15m` | Access token ömrü |
| `REFRESH_TTL_DAYS` | hayır | `7` | Oturum ömrü (gün) |
| `TRUST_PROXY` | hayır | `0` | Güvenilen proxy hop sayısı |
| `CORS_ORIGINS` | hayır | boş | Virgülle ayrılmış; boşsa CORS kapalı |
| `LOG_LEVEL` | hayır | `info` | `error` · `warn` · `info` · `debug` |
| `CRON_ENABLED` | hayır | `true` | Zamanlanmış işler bu instance'ta koşsun mu |
| `SESSION_CLEANUP_RETENTION_DAYS` | hayır | `7` | Ölü oturumların saklanma süresi (gün) |
| `USER_ANONYMIZATION_AFTER_DAYS` | hayır | `14` | Silinen hesabın geri alma süresi (gün) |
| `AUDIT_RETENTION_DAYS` | hayır | `730` | Denetim kayıtlarının saklanma süresi (gün) |

`TRUST_PROXY`'ye **asla `true` verme.** Reverse proxy arkasındaysan zincirdeki
hop sayısını yaz (genelde `1`). `true` ile istemci `X-Forwarded-For` göndererek
IP'sini sahteleyebilir; bu oturum kayıtlarını, denetim kayıtlarını ve IP tabanlı
her kontrolü zehirler.

`DATABASE_POOL_MAX`'ı çoğaltırken hatırla: toplam bağlantı = havuz × instance
sayısı ve bu, veritabanının `max_connections` değerini aşmamalı.

## Komutlar

| Komut | |
|---|---|
| `pnpm start:dev` | Geliştirme (watch) |
| `pnpm build` | Derleme |
| `pnpm lint` | oxlint (type-aware) |
| `pnpm test` | Vitest |
| `pnpm exec prisma migrate dev --name <ad>` | Şema değişikliği |
| `pnpm exec prisma studio` | Veritabanı arayüzü |

Prisma komutlarında `pnpm exec` kullan, `pnpm dlx` **değil** — `dlx` sabitlenmiş
sürümü değil `latest` etiketini indirir.

## Yapı

```
src/
├── config/     Zod env şeması
├── core/       Altyapı — Prisma, logger, istek bağlamı, denetim yazıcısı
├── common/     Ortak parçalar — decorator, guard, hata sınıfları, şema, util
└── modules/
    ├── auth/   Örnek modül (yeni modül yazarken buna bak)
    ├── user/   Başka modüle bağımlı modül örneği
    ├── audit/  Denetim kaydı okuma yüzeyi + admin controller
    └── health/
```

`core/` domain bilgisi taşımaz, `common/` modüllerin paylaştığı kelime
dağarcığıdır, iş mantığı `modules/` altındadır. Ayrıntılı kurallar `CLAUDE.md`'de.

## Neler kurulu

**Auth.** Kayıt, giriş, çıkış. Access token JWT ve yalnızca `sub`, `role`, `sid`
taşır — e-posta gibi kişisel veri token'a girmez. Refresh token opaque,
veritabanında hash'li ve her kullanımda döndürülüyor. İptal edilmiş bir token
tekrar sunulursa çalınma sayılıp o kullanıcının tüm oturumları kapanıyor; ama 30
saniyelik bir tolerans penceresi var ki iki sekme aynı anda yenileme yaparsa
kullanıcı atılmasın.

Refresh token cevap gövdesinde döner; nerede saklanacağı istemcinin işidir.
Sunucu tarafı olan bir web istemcisinde (Next.js gibi) token o sunucuda kalmalı,
tarayıcıya inmemeli. Mobilde Keychain / Keystore. Tarayıcının erişebildiği bir
yere koyarsan (`localStorage`) XSS'te doğrudan çalınır.

**Oturum yönetimi.** Aktif oturumları listeleme, tek tek veya toplu iptal. Her
oturum cihaz adı, IP ve son kullanım zamanını tutuyor; liste hangi oturumun "bu
cihaz" olduğunu işaretliyor. Kullanıcı başına en fazla 10 aktif oturum kalır, en
eskisi düşer.

Oturum iptali refresh akışını **anında** kesiyor ama access token'ı kesmiyor. JWT
stateless doğrulandığı için iptal edilen cihaz, elindeki access token'ı ömrü
dolana kadar (`JWT_ACCESS_TTL`, varsayılan 15 dk) kullanmaya devam edebilir;
aynısı çalıntı token tespitinde tüm oturumlar kapatıldığında da geçerli.

**Hesap silme ve anonimleştirme.** `DELETE /users/me` soft delete yapar
(`deletedAt`) ve tüm oturumları kapatır. Silinmiş bir hesapla tekrar giriş
yapılırsa hesap geri açılır ve cevap `reactivated: true` taşır. Geri alma süresi
login'de değil anonimleştirme işinde tanımlı: `USER_ANONYMIZATION_AFTER_DAYS`
dolduğunda cron e-postayı, şifre hash'ini ve oturum/denetim kayıtlarındaki IP ile
istemci bilgisini temizler.

Her modül kendi kişisel verisini kendisi temizler; yeni bir PII kolonu
eklediğinde o modülün `anonymize()` metoduna bir satır girer. Denetim kaydındaki
`actorId` **korunur** — artık kimseyi tanımlamayan bir satıra işaret ettiği için
iz kopmadan kalır.

**Denetim kaydı.** Giriş, çıkış, kayıt, oturum iptali, token yeniden kullanımı,
yetki reddi, hesap silme ve anonimleştirme kalıcı olarak kaydediliyor. Olay
adları OWASP Logging Vocabulary tabanlı (`authn_login`, `user_deleted`), sonuç
ayrı bir `outcome` alanında; `requestId` satırı uygulama loglarına bağlıyor.

Kullanıcı kendi geçmişini `/users/me/security-log`'da dar bir şemayla görür,
admin tümünü `/admin/audit-logs`'ta filtreleyerek gezer.

**Yetkilendirme.** Her endpoint varsayılan olarak korumalı; açmak için
`@Public()`. Rol kontrolü `@Roles(Role.ADMIN)` ile; reddedilen istek denetim
kaydına `authz_fail` olarak düşer.

**İstek bağlamı.** `requestId`, IP, istemci ve doğrulanmış kullanıcı
`AsyncLocalStorage`'da (nestjs-cls) tutuluyor. Servisler bunları parametre olarak
almaz, bağlamdan okur — yeni bir servis yazarken istek bilgisini controller'dan
sürüklemene gerek yok.

**Doğrulama ve cevap şekli.** Zod; env, request ve response aynı kütüphaneyle.
Şema tek kaynak: çalışma zamanı dönüşümü, TypeScript tipi ve OpenAPI kontratı
ondan türer. Doğrulama hatası `422` ve alan bazlı `errors[]` döndürüyor.

**Hata yönetimi.** Tek cevap formatı, makine okunur `code` alanı, stack sızmıyor.
Mesajlar İngilizce ve geliştiriciye bakar — kullanıcının gördüğü metni istemci
`code`'a göre kendi üretir. Öngörülmeyen Prisma hataları da (unique ihlali, kayıt
bulunamadı) doğru HTTP koduna çevriliyor.

**Loglama.** pino, yapılandırılmış JSON. Her isteğe `x-request-id` (gelen başlık
varsa benimsenir), doğrulanmış isteklere `userId` düşüyor. Statü koduna göre
seviye. Token ve cookie redact ediliyor.

**OpenAPI.** Şemalardan üretiliyor, isimli component'ler ve temiz
`operationId`'lerle — `openapi-typescript` gibi araçlarla doğrudan istemci tipi
üretilebiliyor.

**Kapanış.** `SIGTERM` alınınca uçuştaki işler bitirilip bağlantılar kapatılıyor;
10 saniyede tamamlanmazsa süreç hata loglayıp kendi çıkıyor, böylece takılan bir
kapanış platformun `SIGKILL`'ini beklemiyor.

**Güvenlik.** helmet, yapılandırılabilir CORS, bağlantı havuzu zaman aşımı ve
argon2 — kullanıcı bulunamadığında da çalışır, cevap süresi e-postanın kayıtlı
olduğunu sızdırmaz.

## Zamanlanmış işler

| İş | Saat | Ne yapıyor |
|---|---|---|
| `session-cleanup` | 03:00 | Süresi dolmuş ve iptal edilmiş oturumları siler |
| `audit-log-cleanup` | 04:00 | Saklama süresi dolan denetim kayıtlarını siler |
| `user-anonymization` | 05:00 | Geri alma süresi dolan silinmiş hesapları anonimleştirir |

Saat dilimi `common/constants/time.constants.ts`'te (`Europe/Istanbul`). Üçü de
`CRON_ENABLED` bayrağına bağlı — birden fazla replika çalıştırıyorsan yalnızca
birinde açık bırak, yoksa hepsi aynı işi koşar.

## Neler kurulu değil

Bilerek dışarıda; ihtiyaç duyan projede eklenir.

- **Rate limiting** — `@nestjs/throttler` henüz Nest 12'yi desteklemiyor.
  Eklerken sayacı yalnızca IP'ye bağlama: dağıtılmış saldırıda etkisiz kalır ve
  BFF arkasında tüm web trafiği tek IP'den gelir. IP + hesap çift anahtarlı kur.
- **Şifre değiştirme, şifre sıfırlama, e-posta doğrulama** — mail altyapısı ister
- **Profil güncelleme, kullanıcı listeleme** gibi CRUD endpoint'leri
- Cache, file upload, i18n, Docker, Redis

## Dikkat

- **ESM projesi.** Relative import'lar `.js` uzantılı olmalı.
- **Prisma sürümü sabit** (`7.10.0`). `prisma` paketinin `latest` etiketi bir
  release candidate gösteriyor; `@latest` ile güncelleme yapma.
- **`nestjs-cls` peer aralığı Nest 12'yi kapsamıyor.** Kurulum ve çalışma
  doğrulandı, uyarı görmezden geliniyor;
  [#626](https://github.com/Papooch/nestjs-cls/issues/626) kapandığında güncelle.
- **BFF arkasındaysan** `request.ip` ve `User-Agent` o sunucunun değerleri olur;
  oturum ve denetim kayıtları bütün web kullanıcılarını aynı cihaz gibi gösterir.
  BFF gerçek `X-Forwarded-For`, `User-Agent` ve `X-Device-Name` başlıklarını
  iletmeli, `TRUST_PROXY` de zincirdeki hop sayısına eşit olmalı.
- `src/generated/` üretilen kod, gitignore'da. `pnpm install` sonrası oluşur.
