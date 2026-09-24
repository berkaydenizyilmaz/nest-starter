# NestJS Starter

Yeni bir backend projesine iş mantığından başlayabilmen için hazırlanmış bir
iskelet. Kimlik doğrulama, oturum yönetimi, şifre sıfırlama, denetim kaydı,
mail, arka plan işleri, hata yönetimi, doğrulama, loglama ve kötüye kullanım
koruması kurulu ve birbirine bağlı gelir; sen yalnızca kendi modüllerini
eklersin.

**Nest 12** (Express 5, ESM) · **Prisma 7** + PostgreSQL · **pg-boss** ·
**Zod 4** · **pino** · **nestjs-cls** · **argon2** · **Resend** · **Vitest** ·
**oxlint**

## İçindekiler

- [Hızlı başlangıç](#hızlı-başlangıç)
- [Proje yapısı](#proje-yapısı)
- [Yeni modül eklemek](#yeni-modül-eklemek)
- [API](#api)
- [Kimlik doğrulama ve oturumlar](#kimlik-doğrulama-ve-oturumlar)
- [Hesap silme ve anonimleştirme](#hesap-silme-ve-anonimleştirme)
- [Denetim kaydı](#denetim-kaydı)
- [Kötüye kullanım koruması](#kötüye-kullanım-koruması)
- [Mail](#mail)
- [Loglama ve istek bağlamı](#loglama-ve-istek-bağlamı)
- [Yapılandırma](#yapılandırma)
- [Arka plan işleri](#arka-plan-işleri)
- [Yayına alma](#yayına-alma)
- [Komutlar](#komutlar)
- [Kapsam dışı](#kapsam-dışı)
- [Bilinen tuzaklar](#bilinen-tuzaklar)

## Hızlı başlangıç

**Gerekenler:** Node.js LTS (**22.22.3+** veya **24.15+**; 23.x ve 25.x
desteklenmiyor), pnpm ve PostgreSQL.

```bash
git clone https://github.com/berkaydenizyilmaz/nest-starter.git yeni-proje
cd yeni-proje
rm -rf .git && git init

pnpm install                  # postinstall, Prisma client'ı üretir
cp .env.example .env
openssl rand -base64 48       # çıktıyı .env'deki JWT_ACCESS_SECRET'a yaz

pnpm exec prisma migrate dev  # şemayı veritabanına uygular
pnpm start:dev
```

Uygulama `http://localhost:3000/api` altında açılır. OpenAPI arayüzü
`/api/docs`'ta, ham spec `/api/docs-json`'da (yalnızca `NODE_ENV` `production`
değilken).

**İlk admin:** Admin atayan bir endpoint yok. Kayıt olduktan sonra kullanıcının
`role` alanını veritabanında `ADMIN` yap (`pnpm exec prisma studio` en kolay
yolu), sonra yeniden giriş yap; rol access token'a girişte yazılır.

## Proje yapısı

```
src/
├── main.ts          Uygulamayı ayağa kaldırır: prefix, versiyon, CORS, Swagger, kapanış
├── app.module.ts    Global guard, pipe, interceptor ve filter burada bağlanır
├── config/          Env şeması (Zod)
├── core/            Altyapı; domain bilmez
│   ├── prisma/          PrismaService
│   ├── audit/           AuditService: denetim kaydı yazıcısı
│   ├── mail/            MailService ve sürücüleri (console, resend)
│   ├── queue/           pg-boss kuyruğu: QueueService, iş keşfi, zamanlamalar
│   ├── one-time-token/  OneTimeTokenService: maille giden tek kullanımlık token'lar
│   ├── logger.module.ts
│   └── request-context.module.ts
├── common/          Modüllerin ortak dili: hata sınıfları, decorator'lar,
│                    RolesGuard, RateLimitGuard, ortak şemalar, util'ler
└── modules/
    ├── auth/        Kayıt, giriş, token, oturumlar; stil ve dosya düzeni için örnek
    ├── user/        Profil, hesap silme, anonimleştirme; başka modüle bağımlı örnek
    ├── audit-log/   Denetim kaydı okuma, admin endpoint'i, saklama süresi
    └── health/      Liveness ve readiness
```

Bağımlılık yönü tek taraflıdır: `modules/*`, `common/` ve `core/`'u serbestçe
kullanır; bir modül başka bir modüle yalnızca onun public servisi üzerinden
bağlanır, başka modülün tablosunu doğrudan sorgulamaz.

**Bir isteğin yolculuğu:**

1. `x-request-id`, IP, user agent ve cihaz adı istek bağlamına (CLS) yazılır.
2. pino-http isteği loglamaya başlar.
3. Guard'lar sırayla çalışır: `JwtAuthGuard` token'ı doğrular ve kullanıcıyı
   bağlama koyar, `RateLimitGuard` kullanıcıya ya da IP'ye göre sayar,
   `RolesGuard` `@Roles(...)` gereksinimini kontrol eder.
4. Zod şeması gövdeyi, parametreleri ve query'yi doğrular; başarısızsa `422`.
5. Controller servisi çağırır; servis domain nesnesi döndürür.
6. Response şeması cevabı ayıklar ve dönüştürür (ör. `Date` → ISO string).
7. Herhangi bir adımda fırlatılan hata `AllExceptionsFilter`'da tek formata
   çevrilir.

Katman, adlandırma ve yazım kurallarının tamamı `CLAUDE.md`'de.

## Yeni modül eklemek

`modules/auth/` stil ve dosya düzeni için örnektir. Kısaca:

1. `src/modules/<ad>/` altında `<ad>.module.ts`, `<ad>.constants.ts`,
   servis ve controller oluştur; modülü `app.module.ts`'e ekle.
2. Hata kodlarını ve audit olay adlarını `<ad>.constants.ts`'e sabit olarak yaz.
3. Servis veriye `PrismaService` ile erişir, `DomainError` alt sınıflarından
   birini fırlatır (`NotFoundError`, `ConflictError`…), HTTP bilmez.
4. Her endpoint'in girdisini ve çıktısını birer Zod şemasıyla `dto/` altında
   tanımla. Girdi `@Body({ schema })` / `@Query({ schema })`, çıktı
   `@SerializeOptions({ schema })` + `@ApiOkResponse({ standardSchema })`.
5. Endpoint'ler varsayılan olarak korumalıdır; açmak için `@Public()`, rol için
   `@Roles(Role.ADMIN)`. Kullanıcı kimliğini `@CurrentUser()` ile al.
6. Durum değiştiren işlemin audit kaydını aynı transaction'da
   `AuditService.record(..., tx)` ile yaz.
7. Modül kişisel veri tutuyorsa `anonymize(id, tx)` metodu aç ve
   `UserAnonymizationService`'e bağla.
8. Mail gönderecekse içeriği `mails/<olay>.mail.ts` içinde `MailContent`
   döndüren bir fonksiyon olarak yaz; gönderimi bir arka plan işinden yap (bkz.
   [Mail](#mail)).
9. Arka plan ya da zamanlanmış iş gerekiyorsa `jobs/` altına bir tanım
   (`<olay>.job.ts`) ve bir handler (`<olay>.handler.ts`) ekle (bkz.
   [Arka plan işleri](#arka-plan-işleri)).
10. Doğrulama linki ya da kodu gerekiyorsa (e-posta doğrulama, e-posta
    değişikliği, işlem onayı) token'ı `OneTimeTokenService` ile üret ve tüket;
    türü modülün sabitlerinde `<modül>.<olay>` olarak tanımla.

## API

Bütün yollar `/api` ile başlar; iş endpoint'leri `v1` altındadır.

| Method   | Yol                             | Erişim | Açıklama                                     |
| -------- | ------------------------------- | ------ | -------------------------------------------- |
| `POST`   | `/api/v1/auth/register`         | açık   | Kayıt; token çifti döner                     |
| `POST`   | `/api/v1/auth/login`            | açık   | Giriş; token çifti ve `reactivated`          |
| `POST`   | `/api/v1/auth/refresh`          | açık   | Refresh token ile yeni token çifti           |
| `POST`   | `/api/v1/auth/logout`           | açık   | Refresh token'ın oturumunu kapatır           |
| `POST`   | `/api/v1/auth/password/change`  | bearer | Şifreyi değiştirir; diğer oturumları kapatır |
| `POST`   | `/api/v1/auth/password/forgot`  | açık   | Şifre sıfırlama maili gönderir               |
| `POST`   | `/api/v1/auth/password/reset`   | açık   | Maildeki token ile yeni şifre belirler       |
| `GET`    | `/api/v1/auth/sessions`         | bearer | Aktif oturumlar; mevcut olan işaretli        |
| `DELETE` | `/api/v1/auth/sessions/:id`     | bearer | Tek oturumu kapatır                          |
| `DELETE` | `/api/v1/auth/sessions`         | bearer | Bütün oturumları kapatır                     |
| `GET`    | `/api/v1/users/me`              | bearer | Profil                                       |
| `GET`    | `/api/v1/users/me/security-log` | bearer | Hesaba dair olaylar (cursor sayfalı)         |
| `DELETE` | `/api/v1/users/me`              | bearer | Hesabı siler (geri alınabilir)               |
| `GET`    | `/api/v1/admin/audit-logs`      | admin  | Denetim kayıtları (filtreli, sayfalı)        |
| `GET`    | `/api/health/live`              | açık   | Süreç ayakta mı                              |
| `GET`    | `/api/health/ready`             | açık   | Veritabanı erişilebilir mi; değilse 503      |

İstemci isteğe bağlı olarak `x-device-name` (oturum listesinde görünen cihaz
adı) ve `x-request-id` (log korelasyonu; `[A-Za-z0-9._-]`, en fazla 128
karakter) başlıklarını gönderebilir.

**İstemci tipi:** Spec şemalardan üretilir; component'ler isimli,
`operationId`'ler metot adıdır (`listSessions`, `revokeSession`). Böylece
`openapi-typescript` gibi bir araçla doğrudan tip üretilebilir.

### Hata formatı

Her hata aynı şekilde döner. İstemci `code` alanına bakar; `message`
geliştirici içindir ve kullanıcıya gösterilmez.

```json
{
  "statusCode": 422,
  "code": "VALIDATION_FAILED",
  "message": "Request validation failed",
  "timestamp": "2026-09-23T10:00:00.000Z",
  "path": "/api/v1/auth/register",
  "requestId": "4f0c2c1e-8a0e-4c47-9b0a-6f1f3d2a9c11",
  "errors": [
    {
      "field": "password",
      "code": "too_small",
      "message": "Too small: expected string to have >=8 characters"
    }
  ]
}
```

| Statü | Ne zaman                                                        |
| ----- | --------------------------------------------------------------- |
| `400` | Bozuk JSON gövdesi                                              |
| `401` | Token yok, geçersiz ya da süresi dolmuş; hatalı giriş bilgisi   |
| `403` | Rol yetersiz                                                    |
| `404` | Kayıt ya da yol bulunamadı                                      |
| `409` | Çakışma (ör. `EMAIL_TAKEN`)                                     |
| `413` | Gövde 100 KB sınırını aşıyor                                    |
| `422` | Şema doğrulaması başarısız; `errors[]` alan bazlı ayrıntı taşır |
| `429` | Rate limit ya da hesap kilidi; `Retry-After` başlığı taşır      |
| `500` | Beklenmeyen hata; ayrıntı yalnızca logda                        |

`429` iki farklı `code` ile gelir: rate limit için `TOO_MANY_REQUESTS`, hesap
kilidi için `ACCOUNT_TEMPORARILY_LOCKED`. İstemci ikisini de tanımalı.

## Kimlik doğrulama ve oturumlar

**İki token.** Access token kısa ömürlü bir JWT'dir ve yalnızca `sub`, `role`,
`sid` taşır; e-posta gibi kişisel veri içermez. Refresh token 256 bitlik opak
bir değerdir; veritabanında yalnızca SHA-256 hash'i saklanır. Şifreler argon2
ile hash'lenir (8–128 karakter).

**Rotasyon ve çalınma tespiti.** Her refresh isteği yeni bir refresh token
verir ve eskisini kullanılmış sayar. Bir oturumun verdiği bütün token'lar
`RefreshToken` tablosunda bir aile olarak tutulur. Kullanılmış bir token tekrar
gelirse token çalınmış sayılır: kullanıcının bütün oturumları kapanır ve olay
denetim kaydına düşer.

**Tolerans penceresi.** İki sekme aynı token'la aynı anda refresh yaparsa
ikincisi hata almaz; 30 saniye içinde gelen tekrar, geçerli bir **kardeş**
token alır. Kardeşlerden biri kullanıldığında diğeri silinir; onu tutan sekme
`401 INVALID_REFRESH_TOKEN` alır ama oturumlar kapanmaz. Bu, OAuth 2.0 Security
BCP'nin (RFC 9700) önerdiği rotasyonun yaygın bir esnetmesidir; bedeli, token'ı
pencere içinde çalan birinin fark edilmeden kardeş token alabilmesidir.

**Oturum ömrü sabittir.** `REFRESH_TTL_DAYS` oturum açıldığında başlar ve
refresh ile uzamaz; süre dolunca kullanıcı yeniden giriş yapar.

**Oturum yönetimi.** Her oturum cihaz adı, IP, user agent ve son kullanım
zamanını tutar. Kullanıcı başına en fazla 10 aktif oturum kalır; yenisi
açıldığında en uzun süredir kullanılmayan kapanır.

**Şifre değiştirme.** Giriş yapmış kullanıcı mevcut şifresini vererek yenisini
belirler. Bu cihazdaki oturum açık kalır, diğer bütün oturumlar kapanır. Mevcut
şifre yanlışsa cevap `401` değil `422 INVALID_CURRENT_PASSWORD` olur; `401`
istemcide "oturum düştü" diye yorumlanıp kullanıcıyı atardı.

**Şifre sıfırlama.** `password/forgot` e-posta kayıtlı olsun olmasın `204`
döner; kayıtlıysa `APP_URL` + `/reset-password?token=…` linkini içeren bir mail
gider. Token tek kullanımlıktır, 1 saat geçerlidir ve veritabanında hash'li
durur; yeni istek eskisini geçersiz kılar, aynı hesap için 60 saniyede bir
mailden fazlası gönderilmez. `password/reset` başarılı olunca bütün oturumlar
kapanır, giriş kilidi sıfırlanır; kullanıcı yeni şifreyle giriş yapar. Geçersiz
ya da kullanılmış token `422 INVALID_RESET_TOKEN`, süresi dolmuş token
`422 RESET_TOKEN_EXPIRED` döner. Web uygulamasının `/reset-password` sayfası
token'ı query'den alıp bu endpoint'e göndermelidir; mobil aynı linki universal
link olarak yakalar.

**Tek kullanımlık token'lar.** Sıfırlama token'ı, maille ya da SMS'le giden
bütün doğrulama token'ları için ortak olan `OneTimeToken` tablosunda durur ve
yalnızca `core/one-time-token`'daki `OneTimeTokenService` ile yönetilir. Her
token bir kullanıcıya ve bir türe (`auth.password-reset` gibi) bağlıdır;
kullanıcı başına her türden tek token olur, yenisi eskisinin yerine geçer.
Servis token'ı üretir, yalnızca hash'ini saklar, tek kullanımı ve süreyi
denetler; tüketme sonucunu (`valid`, `invalid`, `expired`) çağıran modül kendi
hata koduna çevirir.

**İptalin sınırı.** Oturum kapatmak refresh'i hemen keser ama access token
stateless doğrulandığı için ömrü dolana kadar (`JWT_ACCESS_TTL`, varsayılan 15
dakika) geçerli kalır. Aynısı çalınma tespitinde ve şifre değiştirmede de
geçerlidir.

**Refresh token'ı nerede saklamalı?** Token cevap gövdesinde döner; saklamak
istemcinin işidir. Sunucu tarafı olan bir web uygulamasında (Next.js gibi)
token o sunucuda kalmalı, tarayıcıya inmemeli. Mobilde Keychain / Keystore
kullan. `localStorage` gibi tarayıcının erişebildiği bir yerde XSS ile
doğrudan çalınır.

## Hesap silme ve anonimleştirme

`DELETE /users/me` hesabı soft delete yapar ve bütün oturumları kapatır.
Kullanıcı `USER_ANONYMIZATION_AFTER_DAYS` (varsayılan 14 gün) içinde tekrar
giriş yaparsa hesap geri açılır ve login cevabı `reactivated: true` taşır.

Süre dolunca günlük iş hesabı anonimleştirir: e-posta ve şifre hash'i
değiştirilir; oturumlardaki ve denetim kayıtlarındaki IP ile istemci bilgisi
silinir. Denetim satırlarındaki `actorId` korunur; artık kimseyi tanımlamayan
bir kullanıcıya işaret ettiği için iz kopmaz. Anonimleştirme ile geri açılma
aynı anda denk gelirse ikisi birbirini ezmez; önce yazılan kazanır.

Her modül kendi kişisel verisini kendisi temizler: yeni bir kişisel veri
kolonu eklersen o modülün `anonymize()` metoduna bir satır eklemen gerekir.

## Denetim kaydı

Güvenlikle ilgili olaylar kalıcı olarak `AuditLog` tablosuna yazılır: kayıt,
giriş (başarılı ve başarısız), çıkış, hesap kilidi, şifre değiştirme, şifre
sıfırlama isteği ve sıfırlama, oturum iptali, token tekrar kullanımı, yetki
reddi, hesap silme, geri açma ve anonimleştirme. Olay
adları OWASP Logging Vocabulary'ye dayanır (`authn_login`, `user_deleted`);
sonuç ayrı bir `outcome` alanındadır (`SUCCESS` / `FAILURE`).

Her kayıt üç kimlik taşır:

| Alan                     | Anlamı                                         |
| ------------------------ | ---------------------------------------------- |
| `actorId`                | İşlemi kim yaptı (kimliği doğrulanmadıysa boş) |
| `subjectId`              | Olay kimin hakkında                            |
| `targetType`, `targetId` | Neye dokunuldu                                 |

Kullanıcı `/users/me/security-log`'da hesabına dair olayları görür (ör. kendi
hesabına yapılan başarısız giriş denemeleri). Admin `/admin/audit-logs`'ta
bütün kayıtları olay, sonuç, üç kimlik ve tarih aralığına göre filtreleyebilir.

Durum değiştiren işlem ile audit kaydı aynı transaction'da yazılır; biri
başarısız olursa ikisi de geri alınır. `metadata` alanı yalnızca makine okunur
değer taşır (enum, sayı, id); ham kullanıcı girdisi girmez. Kayıtlar
`AUDIT_RETENTION_DAYS` (varsayılan 730 gün) sonra silinir.

## Kötüye kullanım koruması

İki ayrı kontrol var, çünkü farklı saldırıları durdururlar.

**Rate limit** tek bir kaynaktan gelen seli durdurur. Korumalı endpoint'lerde
kullanıcıya, açık endpoint'lerde IP'ye göre sayar. Sayaç **endpoint başına**
tutulur: `THROTTLE_LIMIT=100`, her endpoint için pencere başına 100 istek
demektir. `/auth/login`, `/auth/register` ve `/auth/password/*` dakikada 5
istekle sınırlı. Health endpoint'leri limitten muaf.

**Hesap kilidi** binlerce IP'den tek hesaba yapılan denemeyi yavaşlatır. Üç
başarısız girişten sonra her yeni başarısızlık hesabın girişini kademeli olarak
geciktirir (1 sn, 2 sn, 4 sn… en fazla 5 dk). Sayaç başarılı girişte ya da bir
saat boyunca yeni hata gelmezse sıfırlanır. Aynı anda yapılan denemeler de
doğru sayılır; kilit oluştuktan sonra doğru şifre de reddedilir.

**Bilerek bırakılan sınırlar:**

- Israrlı bir saldırgan bir hesabın girişini tavan süre boyunca kapalı
  tutabilir; hesabı anahtar alan her kilit tasarımında durum aynıdır.
  Kullanıcının çıkış yolu OWASP'ın önerdiği gibi şifre sıfırlamadır: başarılı
  sıfırlama kilidi ve başarısız giriş sayacını sıfırlar.
- Hesap numaralandırması engellenmez: kilitli hesap `429`, olmayan hesap `401`
  döner; `register` de `409 EMAIL_TAKEN` ile aynı bilgiyi verir. Giriş
  denemesinin cevap süresi ise e-postanın kayıtlı olup olmadığını ele vermez.
- Hacimsel saldırıya karşı uygulama içi limit yetmez; o kenar katmanın işi
  (nginx `limit_req`, Cloudflare).

## Mail

Gönderim `core/mail`'deki `MailService` ile yapılır; `core/mail` ne
gönderileceğini bilmez. Her mailin içeriği ait olduğu modülde, `mails/`
klasöründe `{ subject, html, text }` döndüren bir fonksiyondur
(`modules/auth/mails/password-reset.mail.ts`). HTML'e giren her dinamik değer
`escapeHtml`'den geçer, ortak iskelet `mailLayout()`'tur.

```ts
await this.mail.send({ to: user.email, ...appointmentReminderMail({ ... }) });
```

Sürücü `MAIL_DRIVER` ile seçilir:

| Sürücü    | Ne yapar                                                                   |
| --------- | -------------------------------------------------------------------------- |
| `console` | Göndermez, maili loga yazar. Geliştirme içindir; production'da reddedilir. |
| `resend`  | [Resend](https://resend.com) API'siyle gönderir; `RESEND_API_KEY` ister.   |

Başka bir sağlayıcı için `core/mail/transports/`'a `MailTransport`'u uygulayan
bir sınıf ekleyip `MAIL_DRIVER`'a bir değer eklemek yeterli; mail gönderen kod
değişmez.

Mail istek içinde gönderilmez. İstek, işlemle aynı transaction'da kuyruğa
yalnızca id taşıyan bir iş bırakır; worker veriyi okuyup maili render eder ve
gönderir. Gönderim başarısız olursa iş, bekleme süresi artarak tekrar denenir.
Şifre sıfırlamada token da worker'da üretilir, böylece açık link kuyruğa hiç
yazılmaz.

## Loglama ve istek bağlamı

pino yapılandırılmış JSON log üretir (geliştirmede okunaklı tek satır). Her
istek tek bir "request completed" satırı yazar; satır `x-request-id`'yi,
doğrulanmış kullanıcının `userId`'sini ve hata varsa `errorCode` ile
`errorMessage`'ı taşır. Seviye statü koduna göre seçilir: 5xx `error`, 4xx
`warn`, diğerleri `info`. Beklenmeyen hatalar stack trace ile ayrıca loglanır.
`Authorization` ve `Cookie` başlıkları loga girmez.

`requestId`, IP, user agent, cihaz adı ve kullanıcı id'si istek boyunca
`AsyncLocalStorage`'da (nestjs-cls) tutulur. Servisler bunları parametreyle
almaz, bağlamdan okur; audit kayıtları da `requestId`'yi buradan alır, böylece
bir denetim satırı uygulama loguyla eşleştirilebilir.

İstek logu her satırda IP ve istemci bilgisi taşır. Bu bilinçli: 5651 sayılı
Kanun kapsamındaki trafik bilgisi zaten saklanması gereken bir alandır. Çıktı
`stdout`'a yazılır; saklama süresi, bütünlük ve erişim kontrolü deployment'ın
işidir.

## Yapılandırma

Bütün değişkenler `src/config/env.schema.ts`'te Zod ile doğrulanır. Eksik ya
da geçersiz bir değer varsa uygulama **açılmaz** ve sorunlu değişkenleri
listeler.

| Değişken                         | Varsayılan    | Açıklama                                                            |
| -------------------------------- | ------------- | ------------------------------------------------------------------- |
| `DATABASE_URL`                   | **zorunlu**   | PostgreSQL bağlantı adresi                                          |
| `JWT_ACCESS_SECRET`              | **zorunlu**   | En az 32 karakter; `openssl rand -base64 48`                        |
| `NODE_ENV`                       | `development` | `development` · `test` · `production`; production'da Swagger kapalı |
| `PORT`                           | `3000`        |                                                                     |
| `DATABASE_POOL_MAX`              | `10`          | Instance başına azami veritabanı bağlantısı                         |
| `JWT_ACCESS_TTL`                 | `15m`         | Access token ömrü; birim zorunlu: `s`, `m`, `h`, `d`                |
| `REFRESH_TTL_DAYS`               | `7`           | Oturum ömrü (gün)                                                   |
| `TRUST_PROXY`                    | `0`           | Güvenilir proxy'ler: hop sayısı ya da IP/CIDR listesi               |
| `CORS_ORIGINS`                   | boş           | Virgülle ayrılmış origin listesi; boşsa CORS kapalı                 |
| `LOG_LEVEL`                      | `info`        | `error` · `warn` · `info` · `debug`                                 |
| `THROTTLE_ENABLED`               | `true`        | Rate limit açık mı                                                  |
| `THROTTLE_TTL`                   | `60`          | Rate limit penceresi (saniye)                                       |
| `THROTTLE_LIMIT`                 | `100`         | Pencere başına, endpoint başına istek                               |
| `QUEUE_WORKERS_ENABLED`          | `true`        | Bu kopya kuyruktaki işleri ve zamanlamaları çalıştırsın mı          |
| `SESSION_CLEANUP_RETENTION_DAYS` | `7`           | Süresi dolmuş / kapatılmış oturumların saklanma süresi (gün)        |
| `USER_ANONYMIZATION_AFTER_DAYS`  | `14`          | Silinen hesabın geri alınabileceği süre (gün)                       |
| `AUDIT_RETENTION_DAYS`           | `730`         | Denetim kayıtlarının saklanma süresi (gün)                          |
| `APP_URL`                        | **zorunlu**   | Maildeki linklerin gittiği web uygulamasının kök adresi             |
| `MAIL_DRIVER`                    | `console`     | `console` · `resend`; production'da `console` kabul edilmez         |
| `MAIL_FROM`                      | **zorunlu**   | Gönderen, ör. `Uygulama <no-reply@alanadi.com>`                     |
| `RESEND_API_KEY`                 | —             | `MAIL_DRIVER=resend` ise zorunlu                                    |

## Arka plan işleri

Kuyruk [pg-boss](https://github.com/timgit/pg-boss) ile PostgreSQL üzerinde
çalışır; ek altyapı gerekmez. İşler kendi `pgboss` şemasında durur ve Prisma
migration'ları bu şemaya dokunmaz. Bir iş en az bir kez çalışır: başarısız olursa
kuyruğun ayarına göre tekrar denenir, tekrarlar biterse `failed` olarak kalır ve
loglanır.

Her iş kendi modülünde iki dosyadır:

```ts
// modules/auth/jobs/password-reset-mail.job.ts
export const passwordResetMailJob = defineJob({
  name: AUTH_JOB.AUTH_PASSWORD_RESET_MAIL,
  payload: z.object({ userId: z.uuid() }).strict(),
  options: { retryLimit: 3, retryDelay: 3, retryBackoff: true },
});

// modules/auth/jobs/password-reset-mail.handler.ts
@HandlesJob(passwordResetMailJob)
@Injectable()
export class PasswordResetMailHandler implements JobHandler<
  JobPayload<typeof passwordResetMailJob>
> {
  constructor(private readonly passwords: PasswordService) {}

  handle({ userId }: JobPayload<typeof passwordResetMailJob>): Promise<void> {
    return this.passwords.sendResetMail(userId);
  }
}
```

İş kuyruğa `QueueService.send(job, payload, tx)` ile girer; `tx` verilirse
işlemle birlikte kaydedilir ya da geri alınır. Handler açılışta bulunur ve
worker olarak kaydedilir; `core/queue`'ya dokunmak gerekmez. Payload yalnızca id
taşır, sır ve kişisel veri kuyruğa girmez. İşi başlatan isteğin `requestId`'si
işle taşınır; worker logları ve işin yazdığı audit kayıtları o isteğe bağlanır.

Zamanlanmış işler tanıma bir `schedule` ekler; zamanlama veritabanında tutulur
ve birden fazla kopyada her tetiklenme tek bir iş üretir. Saatler
`Europe/Istanbul` saat dilimindedir.

| İş                     | Saat  | Ne yapar                                                               |
| ---------------------- | ----- | ---------------------------------------------------------------------- |
| `auth.session-cleanup` | 03:00 | Saklama süresi geçmiş, süresi dolmuş ya da kapatılmış oturumları siler |
| `audit-log.cleanup`    | 04:00 | Saklama süresi dolan denetim kayıtlarını siler                         |
| `user.anonymization`   | 05:00 | Geri alma süresi dolan silinmiş hesapları anonimleştirir               |

## Yayına alma

- **`TRUST_PROXY`'ye asla `true` verme.** İstemci `X-Forwarded-For` göndererek
  IP'sini sahteleyebilir; bu oturum ve denetim kayıtlarını ve IP'ye dayalı rate
  limit'i zehirler. Proxy arkasında `0` bırakırsan bütün istemciler proxy'nin
  IP'sini paylaşır ve `/auth/login` herkes için toplam dakikada 5 istekle
  sınırlanır. İki biçim var:
  - **Hop sayısı** (`1`, `2`…): Bütün istekler aynı proxy zincirinden geliyorsa.
  - **IP/CIDR listesi** (`10.0.0.0/8, 127.0.0.1`; `loopback`, `linklocal`,
    `uniquelocal` adları da geçer): İstekler farklı yollardan geliyorsa, ör. web
    BFF ve proxy üzerinden, mobil yalnızca proxy üzerinden. Express, zincirde
    listede olmayan ilk adresi istemci IP'si sayar; sahte başlık işe yaramaz.
- **Birden fazla replika:** Zamanlanmış işler replika sayısından bağımsız olarak
  bir kez çalışır. İşleri API'den ayrı bir süreçte çalıştırmak istersen API
  kopyalarında `QUEUE_WORKERS_ENABLED=false` ver; iş eklemeye devam ederler.
  Rate limit sayaçları süreç belleğindedir ve
  her replika kendi sayacını tutar; paylaşımlı bir sayaç için
  `ThrottlerStorage`'ı uygulayan bir sınıf yazıp `app.module.ts`'teki `storage`
  alanına ver.
- **Veritabanı bağlantıları:** Her kopya `DATABASE_POOL_MAX` + 3 (pg-boss'un
  havuzu) bağlantı açar; toplam, veritabanının `max_connections` değerini
  aşmamalı.
- **BFF arkasındaysan** (ör. Next.js sunucusu) BFF gerçek `X-Forwarded-For`,
  `User-Agent` ve `X-Device-Name` başlıklarını iletmeli ve BFF'nin adresi
  `TRUST_PROXY` listesinde olmalı; yoksa bütün kullanıcılar aynı cihaz ve aynı
  IP görünür. Liste yöntemi BFF'nin adresi bilindiğinde çalışır (aynı sunucu ya
  da özel ağ); çıkış IP'si değişen bir platformda (ör. Vercel) çalışmaz.
- **Kapanış:** `SIGTERM` gelince yeni istek kabul edilmez, süren işler
  tamamlanır ve bağlantılar kapanır. 10 saniyede bitmezse süreç kendini
  sonlandırır, platformun `SIGKILL`'ini beklemez.
- **Sağlık kontrolü:** Liveness için `/api/health/live`, readiness için
  `/api/health/ready` kullan; ikincisi veritabanına ulaşamazsa `503` döner.
- **Migration:** Yayında `pnpm exec prisma migrate deploy` çalıştır.

## Komutlar

| Komut                                      | Ne yapar                        |
| ------------------------------------------ | ------------------------------- |
| `pnpm start:dev`                           | Geliştirme sunucusu (watch)     |
| `pnpm build`                               | `dist/`'e derler                |
| `pnpm start:prod`                          | Derlenmiş uygulamayı çalıştırır |
| `pnpm lint`                                | oxlint (type-aware)             |
| `pnpm format`                              | Prettier                        |
| `pnpm test`                                | Vitest                          |
| `pnpm exec prisma migrate dev --name <ad>` | Şema değişikliği için migration |
| `pnpm exec prisma migrate deploy`          | Bekleyen migration'ları uygular |
| `pnpm exec prisma studio`                  | Veritabanı arayüzü              |

## Kapsam dışı

Bunlar bilerek eklenmedi; ihtiyaç duyan proje kendisi ekler:

- E-posta doğrulama (mail, kuyruk ve tek kullanımlık token altyapısı hazır;
  yalnızca akış projeye göre eklenir)
- MFA ve CAPTCHA (dış servis ister)
- Profil güncelleme, kullanıcı listeleme, admin atama gibi CRUD endpoint'leri
- Cache, dosya yükleme, i18n, Docker, Redis

## Bilinen tuzaklar

- **ESM projesi.** Relative import'lar `.js` uzantısıyla yazılır; uzantısız
  import derlenir ama çalışma zamanında patlar.
- **Prisma `7.10.0`'da sabit.** `prisma` paketinin `latest` etiketi bir release
  candidate gösteriyor; `@latest` ile güncelleme yapma. Prisma komutlarında
  `pnpm exec` kullan, `pnpm dlx` sabit sürüm yerine `latest`'i indirir.
- **`app.module.ts`'teki boş `imports: []` kasıtlı.** `@nestjs/throttler`'ın
  tipleri Nest 12'nin dışa açmadığı bir alt yoldan import ediliyor; bu yüzden
  alan tip düzeyinde zorunlu görünüyor. Silersen derleme kırılır.
- **`src/generated/`** Prisma'nın ürettiği koddur, repoda tutulmaz;
  `pnpm install` sonrası oluşur.
