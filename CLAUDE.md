# Proje kuralları

## Yapı

`core/` altyapıdır ve domain bilgisi içermez. `common/` modüllerin paylaştığı
kelime dağarcığıdır. `modules/<ad>/` iş mantığıdır — yeni modül yazarken
`modules/auth/`'a bak.

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
- İstek bilgisi (`requestId`, `ip`, `userAgent`, `userId`) parametreyle taşınmaz;
  servis `ClsService`'ten okur.
- Yazan servis metodu son parametrede `Prisma.TransactionClient` alır;
  varsayılansızsa yalnızca bir transaction içinde anlamlıdır.
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

- `@SerializeOptions({ schema })` ve `@ApiOkResponse({ standardSchema })` birlikte
  kullanılır: biri alanları ayıklar, diğeri aynı şemayı OpenAPI'ye yazar.
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

- `@ApiOkResponse` / `@ApiCreatedResponse` (`{ standardSchema }` ile) zorunlu;
  vermezsen istemcide cevap `unknown` olur.
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
- Olay adları modülün `<ad>.constants.ts`'inde sabittir; `core/` olay adı bilmez,
  böylece yeni modül audit koduna dokunmadan kendi olaylarını ekler.
- Kişisel veri tutan her modül kendi `anonymize(id, tx)` metodunu açar. Yeni PII
  kolonunun temizliğini oraya bir satır olarak gir — unutursan iz sessizce geri
  gelir.

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
- **`ThrottlerModule.forRoot([...])` dizi formunu kullanma.** `storage` alanı
  yalnızca nesne formunda var; dizi verirsen sessizce yok sayılır.
- **Codec (`z.codec`) kullanma.** Serializer decode yönünü çalıştırır, cevap için
  yanlış yön.
- **`deletedAt: null` filtresini unutma.** Her sorguya elle yazılır;
  `include`/`select` ile gelen ilişkide çekilen kaydı elle kontrol et.
- **Prisma sürümü sabit** (`7.10.0`); `latest` etiketi bir release candidate
  gösteriyor.
- **Prisma komutlarında `pnpm exec`**, `pnpm dlx` değil — `dlx` `latest`'i indirir
  ve farklı bir CLI gelir.
