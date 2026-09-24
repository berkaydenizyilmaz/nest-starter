# Proje kuralları

## Mimari

- `core/` altyapıdır ve domain bilmez; hiçbir katmana bağımlı değildir.
  `common/` modüllerin paylaştığı kelime dağarcığıdır (hata sınıfları,
  decorator'lar, ortak şemalar). `modules/<ad>/` iş mantığıdır.
- Bağımlılık yönü: `modules` → `common`, `core`; `common` → `core`. Bir modül
  başka bir modüle yalnızca kasıtlı, tek yönlü bir domain bağımlılığıysa ve onun
  public servisi üzerinden bağlanır; başka modülün tablosunu asla sorgulamaz.
- Bir parça nereye ait? İçinde bir modüle ait mantık varsa o modüle, yoksa
  `common/`'a; altyapıysa `core/`'a. `RolesGuard` yalnızca metadata karşılaştırır
  → `common/`; `JwtAuthGuard` auth secret'ını bilir → `modules/auth/`.
- Kesitsel ihtiyaçlar (denetim, mail, kuyruk, doğrulama token'ı ve sonradan
  gelecek her benzeri) `core/`'da domain bilmeyen bir servistir: `core`
  mekanizmayı bilir, içeriği ve adları modül verir. Yeni bir ihtiyaçta önce
  `core/`'a bak; yoksa aynı ilkeyle `core/`'a ekle, bir modülün içine gömme.
  Modüller altyapının tablolarına doğrudan dokunmaz.
- Kod yazım stili, dosya düzeni ve adlandırma için `modules/auth/`'a bak; o modül
  her senaryonun şablonu değil. Örnek ile kural çeliştiğinde bu dosya geçerlidir.

## Dosya ve adlandırma

- Dosya adı türü söyler (`*.service.ts`, `*.request.ts`, `*.job.ts`); klasör 2+
  dosya olunca gruplar. Her zaman ayrı klasörde duranlar: `dto/` (4+ olunca
  `request/` ve `response/`), `mails/`, `jobs/`.
- Klasör adı sınıfların önekidir: `modules/audit-log/` → `AuditLog*`.
- Modülün dışarıya verdiği adlar (hata kodları, olay, iş ve token adları)
  `<ad>.constants.ts`'te sabittir; serbest string yazma, typo derlenir ve
  sözleşme sessizce kırılır. Anahtar değerin `UPPER_SNAKE` hâlidir
  (`AUTHN_LOGIN: 'authn_login'`). Modüllerin ortak kullandığı bir ad alanında
  değer `<modül>.<olay>` olur.

## Katmanlar

- Controller ve kuyruk handler'ı sadece: girdiyi al, servisi çağır, sonucu
  döndür. İş mantığı serviste.
- Service HTTP bilmez: `Request`, `Response` veya `HttpException` import etme.
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
  "Metot uzadı" ve "ileride lazım olur" geçerli gerekçe değil.
- Yan yana aynı tipte iki parametre varsa girdiyi tek nesneye topla.
- İstek meta verisi (`requestId`, `ip`, `userAgent`, cihaz) parametreyle
  taşınmaz; servis `ClsService`'ten okur. İşlemin kimin hesabında yapıldığı ise
  domain girdisidir: controller `@CurrentUser()` ile alır, servise verir.
- Başka bir servisin transaction'ına katılması gereken yazma metodu son
  parametrede `Prisma.TransactionClient` alır; varsayılansızsa yalnızca bir
  transaction içinde anlamlıdır.
- Servislerde `PinoLogger`, hata `logger.error({ err }, 'mesaj')` ile. Nest'in
  `Logger`'ı yalnızca DI'ın olmadığı yerde; argüman sıraları farklı.

## Veri ve tutarlılık

- Durum değiştiren işlem ile onun yan kayıtları (denetim kaydı, kuyruğa eklenen
  iş, tüketilen token) aynı transaction'da yazılır. Durum değiştirmeyen olay
  (yetki reddi, başarısız giriş) tek başına yazılır.
- Yarışı oku-sonra-yaz ile değil koşullu yazmayla kapat:
  `updateMany({ where: { id, <beklenen durum> } })` ve etkilenen satır sayısına
  bak.
- Soft delete: `deletedAt: null` filtresi her sorguya elle yazılır;
  `include`/`select` ile gelen ilişkide çekilen kaydı da kontrol et.
- Kişisel veri tutan her modül `anonymize(id, tx)` açar; yeni kişisel veri kolonu
  oraya bir satır olarak eklenir, unutulursa iz sessizce geri gelir.

## Güvenlik ve gizlilik

- Her endpoint varsayılan olarak korumalı; açmak için `@Public()`, yetkilendirme
  `@Roles(Role.<ROLE>)`. Kullanıcı kimliği `@CurrentUser()` ile alınır, istek
  gövdesinden asla.
- Sırlar (şifre, token) veritabanında yalnızca hash olarak durur.
- Yardımcı kayıtlara (kuyruk payload'ı, denetim `metadata`'sı, log) sır ve
  kişisel veri girmez; id, enum, sayı ve sebep kodu girer. Alıcı adresi
  loglanmaz.
- HTML'e giren dinamik değer kaçırılır. Hata mesajına kullanıcı girdisi koyma:
  `User ${email} not found` e-postayı sızdırır.
- Denetimde `actorId` kim yaptı, `subjectId` kimin hakkında, `target*` neye
  dokunuldu. `subjectId` elle verilir; vermezsen olay kullanıcının güvenlik
  günlüğüne düşmez. `actorId` korumalı istekte bağlamdan gelir; açık endpoint'te
  yalnızca kimlik o istekte kanıtlandıysa verilir.

## Asenkron işler

- Dış bir servise giden, başarısız olabilen ve sonucunu kullanıcının
  beklemediği iş (mail, bildirim, aktarım) istek içinde değil kuyrukta yapılır.
- Sonucunu kullanıcının beklediği iş (yüklenen dosyanın doğrulanması) istekte
  yapılır, hata o an döner; tekrar deneyen kullanıcıdır. Kuyruğa atılırsa
  başarısızlık kullanıcı ekrandan ayrıldıktan sonra ortaya çıkar. Böyle bir
  istekteki dış çağrının zaman aşımı ve tekrar sayısı kısa tutulur.
- İş en az bir kez çalışır; handler tekrar çalıştığında zarar vermemeli.
- Payload yalnızca id taşır; worker veriyi kendisi okur.
- Kullanıcının elle tekrarlayabildiği bir işin tekrar denemeleri, kullanıcıya
  uygulanan bekleme süresinin içinde bitmeli; yoksa iki sonuç üretir.

## Hata yönetimi

- Service `DomainError` fırlatır: `new NotFoundError('USER_NOT_FOUND', '...')`.
  İlk parametre makine okunur koddur, istemci ona bakar.
- HTTP'ye çeviren tek yer `AllExceptionsFilter`. Yeni hata türü `DomainError`'dan
  türer, filter'a dokunulmaz.
- Mesajlar İngilizce ve geliştiriciye bakar, kullanıcıya gösterilmez.
- Doğrulama hataları **422**, 400 değil; cevap `errors: [{ field, code, message }]`
  taşır. Kullanıcının düzeltebileceği bir girdi hatası da `401` değil `422`'dir;
  istemci `401`'i oturumun düştüğü diye yorumlar.
- Öngördüğün durumu serviste yakala. Filter'daki Prisma eşlemesi (`P2002` → 409)
  güvenlik ağıdır, birincil yol değil.

## Doğrulama ve cevap şekli

Her endpoint'in girdisi ve çıktısı birer Zod şemasıyla tanımlanır. Şema tek
kaynaktır: çalışma zamanı dönüşümü, TypeScript tipi ve OpenAPI kontratı ondan
türer. Elle yazılmış ikinci bir tanım (DTO sınıfı, `@ApiProperty`) tutma.

- Girdi `@Body({ schema })`, şemalar `.strict()` ile; yoksa fazladan alan
  sessizce geçer. Şemayı ortak dosyaya çıkarma, kuralı her DTO'da yeniden yaz;
  yalnızca birinin karar verdiği değerler sabittir (şifre min/max).
- `@ApiOkResponse` / `@ApiCreatedResponse` (`{ standardSchema }` ile) zorunlu;
  yoksa istemcide cevap `unknown` olur. Domain nesnesi döndüren endpoint'te
  yanına aynı şemayla `@SerializeOptions({ schema })` gelir.
- Controller'ın dönüş tipi `z.input<typeof şema>` (serialize öncesi, `Date`
  içerir). `z.infer` istemcinin aldığı tiptir; gerekmedikçe export etme.
- Servis domain nesnesi döndürür, cevabın şeklini bilmez. Koruma şemaya
  bağlıdır: `passwordHash` şemada yoksa istemciye ulaşmaz.
- Yeni response şemasına `.meta({ id: 'Ad' })` ver; yoksa üretilen istemcide her
  kullanım için ayrı anonim tip çıkar. Ad üçlüsü: `loginRequestSchema` →
  `LoginRequest`, `tokenPairResponseSchema` → `TokenPairResponseInput`; component
  id paylaşılan şekilde kaynak adı (`Session`), tek operasyona aitse operasyon
  adı (`LoginResponse`).
- Şekil gerçekten farklıysa saf bir mapper yaz ve controller'da çağır. Mapper
  bağımlılık almaz, sınıfta statik metot olmaz.

## OpenAPI

Spec, UI için değil istemci tipi üretmek için. Ölçüt: `content` ekleyen
decorator gerekli, eklemeyen gereksiz.

- `@ApiErrors(...)`: endpoint'in gerçekten döndürebildiği hata kodları.
- `@ApiBearerAuth()`: korumalı endpoint'e. 204 dönen endpoint'e response
  decorator'ı ekleme.
- `operationId` metot adından üretilir ve spec içinde benzersiz olmalı: fiil +
  kaynak (`listSessions`, `revokeSession`); çıplak `list` çakışır.

## Tuzaklar

- **ESM projesi.** Relative import'lar `.js` uzantılı olmalı; uzantısız yazarsan
  derlenir ama çalışmaz. İki dosya birbirini import etmesin: decorator metadata'sı
  açılışta henüz yüklenmemiş sınıfa erişir ve uygulama açılmaz (bu yüzden iş
  tanımı ile handler'ı ayrı dosyadadır).
- **Tarih alanlarında düz `.transform()` yazma.** `isoDate()` / `nullableIsoDate()`
  kullan; zod-openapi çeviremiyor ve uygulama açılmıyor.
- **Liste endpoint'inde iki farklı şema.** `@SerializeOptions` eleman şemasını,
  `@ApiOkResponse` dizi şemasını ister. İkisine de `z.array(...)` verirsen 500.
- **Tüm query nesnesini alan şemaya `.meta({ id })` verme.** `$ref`'e dönüşür,
  OpenAPI 3.0 adsız parametrede `$ref` kabul etmez; swagger parametrelerin
  hepsini sessizce düşürür.
- **Codec (`z.codec`) kullanma.** Serializer decode yönünü çalıştırır, cevap için
  yanlış yön.
- **Guard sırası önemli.** `JwtAuthGuard` `request.user`'ı yazar,
  `RateLimitGuard` onu anahtar yapar, `RolesGuard` okur; sırayı `app.module.ts`
  belirler.
- **Prisma komutlarında `pnpm exec`**, `pnpm dlx` değil; `dlx` `latest`'i indirir.
