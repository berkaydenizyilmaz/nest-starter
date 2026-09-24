# Proje kuralları

## Yapı

`core/` altyapıdır ve domain bilgisi içermez. `common/` modüllerin paylaştığı
kelime dağarcığıdır. `modules/<ad>/` iş mantığıdır. Kod yazım stili, dosya
düzeni ve adlandırma için `modules/auth/`'a bak; o modül her senaryonun şablonu
değil. Örnek ile kural çeliştiğinde bu dosya geçerlidir.

**Dosya adı türü söyler, klasör 2+ olunca gruplar.** DTO'lar istisna: `dto/` her
zaman ayrı, 4+ olunca `dto/request/` ve `dto/response/`. Klasör adı sınıfların
önekidir: `modules/audit-log/` → `AuditLog*`.

**Bir parça `common/`'a mı modüle mi ait?** Ölçüt: içinde o modüle ait mantık var
mı? `RolesGuard` sadece metadata karşılaştırır → `common/`. `JwtAuthGuard` token'ı
auth secret'ıyla doğrular → `modules/auth/`.

**Bağımlılık yönü:** `modules/*` → `common/` ve `core/` serbest. `modules/*` →
`modules/*` yalnızca kasıtlı, tek yönlü bir domain bağımlılığıysa ve modülün
public servisi üzerinden — başka modülün tablosunu asla doğrudan sorgulama.
Paylaşılan yardımcı için de asla; o `common/`'a taşınır.

## Katmanlar

- Controller sadece: girdiyi şemayla al, servisi çağır, sonucu döndür.
- Service HTTP bilmez. `Request`, `Response` veya `HttpException` import etme.
- Service veriye doğrudan `PrismaService` ile erişir. Repository katmanı ekleme.
- Servisin public metotları modülün yetenek listesi gibi okunur; dışarıdan
  çağıranı olmayan metot `private`'tır.
- Servis metotları `find` ailesi: `findById`, çoğulu `findAll` / `findAllByActor`;
  `findById` bulamazsa **fırlatır** (TypeORM'ün tersi), null isteyen `…OrNull`.
  Yazma `create` / `update` / `remove`, gerisi kendi fiili. Sınıf bağlamını
  tekrarlama: `UserService.remove`, `deleteAccount` değil.
- Inject edilen alan = sınıf adı eksi `Service`, koleksiyonsa çoğul: `AuditService`
  → `audit`, `AuditLogService` → `auditLogs`.
- Yardımcı fonksiyon şu üçünden birini sağlamalı: 2+ çağrı yeri, ismin kodun
  söylemediğini söylemesi, ya da çağıranı tek soyutlama seviyesinde tutması.
  "Metot uzadı" ve "ileride lazım olur" geçerli gerekçe değil — her çıkarma
  okuyucuya bir sıçrama maliyeti yükler.
- Yan yana aynı tipte iki parametre varsa girdiyi tek nesneye topla.
- İstek meta verisi (`requestId`, `ip`, `userAgent`, cihaz) parametreyle
  taşınmaz; servis `ClsService`'ten okur. İşlemin kimin hesabında yapıldığı ise
  domain girdisidir: controller `@CurrentUser()` ile alır, servise parametre
  olarak verir.
- Başka bir servisin transaction'ına katılması gereken yazma metodu son
  parametrede `Prisma.TransactionClient` alır; varsayılansızsa yalnızca bir
  transaction içinde anlamlıdır.
- Servislerde `PinoLogger`, hata `logger.error({ err }, 'mesaj')` ile. Nest'in
  `Logger`'ı yalnızca DI'ın olmadığı yerde — argüman sıraları farklı.

## Hata yönetimi

- Service `DomainError` fırlatır: `new NotFoundError('USER_NOT_FOUND', '...')`.
  İlk parametre makine okunur koddur, istemci ona bakar.
- HTTP'ye çeviren tek yer `AllExceptionsFilter`. Yeni hata türü `DomainError`'dan
  türer, filter'a dokunulmaz.
- Hata kodları modülün `<ad>.constants.ts`'inde sabittir. Serbest string yazma:
  typo derlenir ve istemci sözleşmesi sessizce kırılır. Anahtar değerin
  `UPPER_SNAKE` hâlidir (`AUTHN_LOGIN: 'authn_login'`) — kekelese de ayrışamaz.
- Mesajlar İngilizce ve geliştiriciye bakar, kullanıcıya gösterilmez. Mesaja
  kullanıcı girdisi koyma — `User ${email} not found` e-postayı sızdırır.
- Doğrulama hataları **422**, 400 değil; cevap `errors: [{ field, code, message }]`
  taşır.
- Öngördüğün durumu serviste yakala. Filter'daki Prisma eşlemesi (`P2002` → 409)
  güvenlik ağıdır, birincil yol değil.

## Doğrulama ve cevap şekli

Her endpoint'in girdisi ve çıktısı birer Zod şemasıyla tanımlanır. Şema tek
kaynaktır: çalışma zamanı dönüşümü, TypeScript tipi ve OpenAPI kontratı ondan
türer. Elle yazılmış ikinci bir tanım (DTO sınıfı, `@ApiProperty`) tutma.

**Girdi:**

- `@Body({ schema })`, şemalar `.strict()` ile — yoksa fazladan alan sessizce
  geçer.
- Şemayı ortak dosyaya çıkarma, kuralı her DTO'da yeniden yaz. Yalnızca birinin
  karar verdiği değerleri sabite al (şifre min/max); `min(1)` yerinde kalır.

**Çıktı:**

- `@ApiOkResponse` / `@ApiCreatedResponse` (`{ standardSchema }` ile) zorunlu;
  yoksa istemcide cevap `unknown` olur. Domain nesnesi döndüren endpoint'te
  yanına aynı şemayla `@SerializeOptions({ schema })` gelir: biri alanları
  ayıklar, diğeri şemayı OpenAPI'ye yazar.
- Controller'ın dönüş tipi `z.input<typeof şema>` — serialize edilmeden önceki hâl
  (`Date` içerir). `z.infer` istemcinin aldığı tiptir; serializer'ı atlayan kod
  (yalnızca filter) yoksa export etme.
- Servis **domain nesnesi** döndürür, cevabın şeklini bilmez. Koruma decorator
  hatırlamaya değil şemaya bağlıdır: `passwordHash` şemada yoksa istemciye ulaşmaz.
- Yeni response şemasına `.meta({ id: 'Ad' })` ver — yoksa üretilen istemcide her
  kullanım için ayrı anonim tip çıkar.

**Ad üçlüsü:** şema sabiti → TS tipi → component id türetilir:
`loginRequestSchema` → `LoginRequest`, `tokenPairResponseSchema` →
`TokenPairResponseInput`. Component id paylaşılan şekilde kaynak adıdır
(`TokenPair`, `Session`), tek operasyona aitse operasyon adı (`LoginResponse`).

**Şekil gerçekten farklıysa** (yeniden adlandırma, düzleştirme, hesaplanmış alan)
saf bir mapper yaz ve controller'da çağır. Mapper bağımlılık almaz; alıyorsa o iş
mapper'ın işi değildir. Sınıf üzerinde statik metot yapma — statik bağımlılık
alamaz.

## OpenAPI

Spec, UI için değil istemci tipi üretmek için. Ölçüt: **`content` ekleyen
decorator gerekli, eklemeyen gereksiz.**

- `@ApiErrors(...)` — endpoint'in gerçekten döndürebildiği hata kodları.
- `@ApiBearerAuth()` — korumalı controller'a.
- 204 dönen endpoint'e response decorator'ı ekleme.

`operationId` metot adından üretilir — metot adı istemcideki fonksiyon adıdır ve
spec içinde benzersiz olmalı. Fiil + kaynak yaz (`listSessions`, `revokeSession`);
çıplak `list` bir sonraki controller'da çakışır.

## Auth

- Her endpoint varsayılan olarak korumalı; açmak için `@Public()`, yetkilendirme
  `@Roles(Role.<ROLE>)`.
- Guard sırası önemli: `JwtAuthGuard` `request.user`'ı yazar, `RateLimitGuard`
  onu anahtar yapar, `RolesGuard` okur — sırayı `app.module.ts` belirler.
- Kullanıcı kimliği `@CurrentUser()` ile alınır, istek gövdesinden asla.

## Denetim ve anonimleştirme

- Kayıt `core/audit`'teki `AuditService.record()` ile yazılır, okuma
  `modules/audit-log`'un işi. Tabloya doğrudan yazma.
- Durum değiştiren işlem ile onun audit kaydı aynı transaction'da yazılır.
  Durum değiştirmeyen olay (yetki reddi, var olmayan hesaba giriş denemesi) tek
  başına yazılır.
- Olay adları modülün `<ad>.constants.ts`'inde sabittir; `core/` olay adı bilmez,
  böylece yeni modül audit koduna dokunmadan kendi olaylarını ekler.
- Kişisel veri tutan her modül kendi `anonymize(id, tx)` metodunu açar. Yeni PII
  kolonunun temizliğini oraya bir satır olarak gir — unutursan iz sessizce geri
  gelir.
- `actorId` kim yaptı, `subjectId` kimin hakkında, `target*` neye dokunuldu.
  `subjectId` elle verilir — vermezsen olay kullanıcının güvenlik günlüğüne düşmez.
  Korumalı istekte `actorId`'yi verme, `AuditService` CLS'ten alır. Açık
  endpoint'te yalnızca kimlik o istekte kanıtlandıysa ver (kayıt, başarılı giriş,
  logout); kanıtlanmadıysa (başarısız giriş, token tekrar kullanımı, sistem işi)
  boş kalır.
- `metadata` makine okuru taşır: enum, sayı, id, sebep kodu. Ham kullanıcı girdisi
  girmez; kişisel verinin yeri ayrılmış kolonlar ya da modülün kendi tablosudur.

## Mail

- Gönderim `core/mail`'deki `MailService.send()` ile; `core/mail` içerik bilmez.
  İçerik modülün `mails/` klasöründe (`dto/` gibi her zaman ayrı) `MailContent`
  döndüren saf fonksiyondur: `password-reset.mail.ts` → `passwordResetMail()`.
  HTML'e giren her dinamik değer `escapeHtml`'den geçer.
- Mail işlem commit'lendikten sonra gönderilir; gönderim hatası işlemi geri
  almaz, `logger.error` ile loglanır. Alıcı adresini loglama.

## Tuzaklar

- **ESM projesi.** Relative import'lar `.js` uzantılı olmalı; uzantısız yazarsan
  derlenir ama çalışmaz.
- **Tarih alanlarında düz `.transform()` yazma.** `isoDate()` / `nullableIsoDate()`
  kullan — zod-openapi çeviremiyor ve **uygulama açılmıyor**.
- **Liste endpoint'inde iki farklı şema.** `@SerializeOptions` eleman şemasını,
  `@ApiOkResponse` dizi şemasını ister. İkisine de `z.array(...)` verirsen 500.
- **Tüm query nesnesini alan şemaya `.meta({ id })` verme.** `$ref`'e dönüşür,
  OpenAPI 3.0 ise adsız parametrede `$ref` kabul etmez — swagger parametrelerin
  hepsini **sessizce düşürür** ve istemci filtreleri hiç görmez. Cevapta zorunlu,
  gövdede serbest, adlı parametrede de sorunsuz.
- **Codec (`z.codec`) kullanma.** Serializer decode yönünü çalıştırır, cevap için
  yanlış yön.
- **`deletedAt: null` filtresini unutma.** Her sorguya elle yazılır;
  `include`/`select` ile gelen ilişkide çekilen kaydı elle kontrol et.
- **Prisma komutlarında `pnpm exec`**, `pnpm dlx` değil — `dlx` `latest`'i indirir
  ve farklı bir CLI gelir.
