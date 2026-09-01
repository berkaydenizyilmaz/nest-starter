# NestJS Starter

Yeni backend projeleri için başlangıç iskeleti. Auth, oturum yönetimi, hata
yönetimi, doğrulama ve loglama altyapısı kurulu gelir.

Nest 12 + ESM · Zod · Prisma 7 · pino · Vitest

## Kurulum

```bash
git clone https://github.com/berkaydenizyilmaz/nest-starter.git yeni-proje && cd yeni-proje
rm -rf .git && git init

npm install                      # postinstall Prisma client'ı üretir
cp .env.example .env
openssl rand -base64 48          # JWT_ACCESS_SECRET'a yaz

npx prisma migrate dev --name init
npm run start:dev
```

Node.js'in stabil (LTS) sürümlerinden biri (**22.22.3+** veya **24.15+**) ve PostgreSQL gerekir.
Ara/deneme sürümleri (23.x, 25.x gibi) desteklenmiyor — mutlaka LTS kullanın.

## Endpoint'ler

| Method | Yol | Auth |
|---|---|---|
| `POST` | `/api/v1/auth/register` | — |
| `POST` | `/api/v1/auth/login` | — |
| `POST` | `/api/v1/auth/refresh` | — |
| `POST` | `/api/v1/auth/logout` | — |
| `GET` | `/api/v1/auth/sessions` | bearer |
| `DELETE` | `/api/v1/auth/sessions/:id` | bearer |
| `DELETE` | `/api/v1/auth/sessions` | bearer |
| `GET` | `/api/v1/users/me` | bearer |
| `DELETE` | `/api/v1/users/me` | bearer |
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
| `DATABASE_POOL_MAX` | hayır | `10` | Havuzdaki azami bağlantı |
| `NODE_ENV` | hayır | `development` | `production`'da Swagger kapanır |
| `PORT` | hayır | `3000` | |
| `JWT_ACCESS_TTL` | hayır | `15m` | Access token ömrü |
| `REFRESH_TTL_DAYS` | hayır | `7` | Oturum ömrü (gün) |
| `TRUST_PROXY` | hayır | `0` | Güvenilen proxy hop sayısı |
| `CORS_ORIGINS` | hayır | boş | Virgülle ayrılmış; boşsa CORS kapalı |
| `LOG_LEVEL` | hayır | `info` | `error` · `warn` · `info` · `debug` |
| `CRON_CLEANUP_ENABLED` | hayır | `true` | Oturum temizleme cron'u |
| `SESSION_CLEANUP_RETENTION_DAYS` | hayır | `7` | Ölü oturumların saklanma süresi (gün) |

`TRUST_PROXY`'ye **asla `true` verme.** Reverse proxy arkasındaysan hop sayısı
yaz (genelde `1`). `true` ile istemci `X-Forwarded-For` göndererek IP'sini
sahteleyebilir; bu oturum kayıtlarını ve IP tabanlı her kontrolü zehirler.

İstekler bir BFF üzerinden geliyorsa (web istemcisi API'yi kendi sunucusundan
çağırıyorsa) `request.ip` ve `User-Agent` o sunucunun değerleri olur — oturum listesi
bütün web kullanıcılarını aynı cihaz gibi gösterir. BFF gerçek `X-Forwarded-For`,
`User-Agent` ve `X-Device-Name` değerlerini iletmeli, `TRUST_PROXY` de zincirdeki
hop sayısına eşit olmalı.

## Komutlar

| Komut | |
|---|---|
| `npm run start:dev` | Geliştirme (watch) |
| `npm run build` | Derleme |
| `npm run lint` | oxlint |
| `npm test` | Vitest |
| `npx prisma migrate dev --name <ad>` | Şema değişikliği |
| `npx prisma studio` | Veritabanı arayüzü |

## Yapı

```
src/
├── config/     Zod env şeması
├── core/       Altyapı — Prisma, logger (global, domain bilgisi yok)
├── common/     Ortak parçalar — decorator, guard, hata sınıfları, şema, util
└── modules/
    ├── auth/   Örnek modül (yeni modül yazarken buna bak)
    ├── user/   auth'a bağımlı modül örneği
    └── health/
```

Ayrıntılı kurallar `CLAUDE.md`'de.

## Neler kurulu

**Auth.** Kayıt, giriş, çıkış. Access token JWT; refresh token opaque, veritabanında
hash'li ve her kullanımda döndürülüyor. İptal edilmiş bir token tekrar sunulursa
çalınma sayılıp o kullanıcının tüm oturumları kapanıyor — ama 30 saniyelik bir
tolerans penceresi var ki iki sekme aynı anda yenileme yaparsa kullanıcı atılmasın.

Refresh token cevap gövdesinde döner; nerede saklanacağı istemcinin işidir. Sunucu
tarafı olan bir web istemcisinde (Next.js gibi) token o sunucuda kalmalı, tarayıcıya
inmemeli. Mobilde Keychain / Keystore. Tarayıcının erişebildiği bir yere koyarsan
(`localStorage`) XSS'te doğrudan çalınır.

**Oturum yönetimi.** Aktif oturumları listeleme, tek tek veya toplu iptal. Her
oturum cihaz adı, IP ve son kullanım zamanını tutuyor; liste hangi oturumun
"bu cihaz" olduğunu işaretliyor.

Oturum iptali refresh akışını **anında** kesiyor ama access token'ı kesmiyor.
JWT stateless doğrulandığı için iptal edilen cihaz, elindeki access token'ı ömrü
dolana kadar (`JWT_ACCESS_TTL`, varsayılan 15 dk) kullanmaya devam edebilir; aynısı
çalıntı token tespitinde tüm oturumlar kapatıldığında da geçerli.

**Hesap silme.** `DELETE /users/me` soft delete yapar (`deletedAt`) ve kullanıcının
tüm oturumlarını kapatır. Silinmiş bir hesapla tekrar giriş yapılırsa hesap geri
açılır ve cevap `reactivated: true` taşır. Geri alma süresi login'de değil,
anonimleştirme işinde tanımlıdır: kayıt anonimleştirilmişse e-posta zaten
bulunamaz. Anonimleştirme cron'u starter kapsamında değil.

**Yetkilendirme.** Her endpoint varsayılan olarak korumalı; açmak için `@Public()`.
Rol kontrolü `@Roles(Role.ADMIN)` ile.

**Doğrulama.** Zod; env, request ve response aynı kütüphaneyle. Doğrulama hatası
`422` ve alan bazlı `errors[]` döndürüyor, istemci hatalı input'u işaretleyebilsin
diye.

**Hata yönetimi.** Tek cevap formatı, makine okunur `code` alanı, stack sızmıyor.
Öngörülmeyen Prisma hataları da (unique ihlali, kayıt bulunamadı) doğru HTTP
koduna çevriliyor.

**Loglama.** pino, yapılandırılmış JSON. Her isteğe `x-request-id`, doğrulanmış
isteklere `userId` düşüyor. Statü koduna göre seviye. Token ve cookie redact
ediliyor.

**OpenAPI.** Şemalardan üretiliyor, isimli component'ler ve temiz `operationId`'lerle
— `openapi-typescript` gibi araçlarla doğrudan istemci tipi üretilebiliyor.

**Güvenlik.** helmet, yapılandırılabilir CORS, graceful shutdown.

## Neler kurulu değil

Bilerek dışarıda; ihtiyaç duyan projede eklenir.

- **Rate limiting** — `@nestjs/throttler` henüz Nest 12'yi desteklemiyor. Eklerken
  sayacı yalnızca IP'ye bağlama; BFF arkasında tüm web trafiği tek IP'den gelir
- **Şifre değiştirme, şifre sıfırlama, e-posta doğrulama** — mail altyapısı gerektirir
- Cache, file upload, i18n, Docker, Redis
- Profil güncelleme, kullanıcı listeleme gibi CRUD endpoint'leri

## Dikkat

- **ESM projesi.** Relative import'lar `.js` uzantılı olmalı.
- **Prisma sürümü sabit** (`7.10.0`). `prisma` paketinin npm `latest` etiketi bir
  release candidate gösteriyor; `@latest` ile güncelleme yapma.
- `src/generated/` üretilen kod, gitignore'da. `npm install` sonrası otomatik oluşur.
