# Proje kuralları

## Yapı

`core/` altyapıdır (Prisma, logger) ve domain bilgisi içermez. `common/`
modüllerin paylaştığı kelime dağarcığıdır. `modules/<ad>/` iş mantığıdır —
yeni modül yazarken `modules/auth/`'a bak.

**Dosya adı türü söyler, klasör 2+ olunca gruplar.** `.controller.ts`,
`.service.ts`, `.guard.ts`, `.type.ts`, `.schema.ts`, `.util.ts` gibi son ekler
zorunlu; bir türden tek dosya varsa kökte durur, ikinci gelince klasöre taşınır.
DTO'lar istisna: `dto/` her zaman ayrı, 4+ olunca `dto/request/` ve `dto/response/`.

**Bir parça `common/`'a mı modüle mi ait?** Ölçüt: içinde o modüle ait mantık var
mı? `@Public()`, `@Roles()`, `RolesGuard` sadece metadata okuyup karşılaştırır →
`common/`. `JwtAuthGuard` token'ı auth secret'ıyla doğrular → `modules/auth/`.

**Bağımlılık yönü:** `modules/*` → `common/` ve `core/` serbest. `modules/*` →
`modules/*` yalnızca kasıtlı, tek yönlü bir domain bağımlılığıysa ve modülün
public servisi üzerinden. Paylaşılan yardımcı için asla — o `common/`'a taşınır.

## Katmanlar

- Controller sadece: girdiyi şemayla al, servisi çağır, sonucu döndür. İş mantığı
  ve veri erişimi controller'da olmaz.
- Service HTTP bilmez. `Request`, `Response` veya `HttpException` import etme.
- Service veriye doğrudan `PrismaService` ile erişir. Repository katmanı ekleme.
- Servisin public metotları modülün yetenek listesi gibi okunmalı; controller'daki
  endpoint'lerle örtüşür. Dışarıdan çağıranı olmayan metot `private`'tır.
- Yardımcı fonksiyon şu üçünden birini sağlamalı: 2+ çağrı yeri, ismin kodun
  söylemediğini söylemesi, ya da çağıranı tek soyutlama seviyesinde tutması.
  "Metot uzadı" ve "ileride lazım olur" geçerli gerekçe değil — her çıkarma
  okuyucuya bir sıçrama maliyeti yükler.
- Servis metodunun yan yana aynı tipte iki parametresi ya da fazlası varsa,
  girdiyi tek nesneye topla: `login(input: LoginDto, context)`.

## Hata yönetimi

- Service `DomainError` sınıflarını fırlatır:
  `throw new NotFoundError('USER_NOT_FOUND', 'User not found')`. İlk parametre
  makine okunur sabit koddur, istemci ona bakar.
- HTTP'ye çeviren tek yer `AllExceptionsFilter`. Yeni hata türü gerekiyorsa
  `DomainError`'dan türet, filter'a dokunma.
- Hata kodları modülün `<ad>.constants.ts` dosyasında sabit olarak durur
  (`AUTH_ERROR.EMAIL_TAKEN`). Serbest string yazma: typo derlenir ve istemci
  sözleşmesi sessizce kırılır.
- Mesajlar İngilizce ve geliştiriciye bakar; kullanıcıya gösterilmez. İstemci
  metni `code`'a göre kendi üretir. Mesaja kullanıcı girdisi koyma —
  `User ${email} not found` e-postanın kayıtlı olduğunu sızdırır.
- Doğrulama hataları **422**, 400 değil: 400 ayrıştırılamayan istek için (bozuk
  JSON), 422 "istek okundu ama değerler kurala uymuyor" demek. Cevap
  `errors: [{ field, code, message }]` taşır.
- Öngördüğün durumları serviste domain error ile yakala. Öngöremediklerin için
  filter'da Prisma eşlemesi var (`P2002` → 409, `P2025` → 404); güvenlik ağıdır,
  birincil yol değil.

## Doğrulama ve cevap şekli

Her endpoint'in girdisi ve çıktısı birer Zod şemasıyla tanımlanır. Şema tek
kaynaktır: çalışma zamanı dönüşümü, TypeScript tipi ve OpenAPI kontratı ondan
türer. Elle yazılmış ikinci bir tanım (DTO sınıfı, `@ApiProperty`) tutma.

**Girdi:**

- `@Body({ schema: loginSchema })`, şemalar `.strict()` ile. `.strict()` olmadan
  fazladan alan sessizce geçer.
- Şemayı ortak dosyaya çıkarma; kuralı her DTO'da yeniden yaz. Sadece **anlamlı
  değerleri** sabite al: şifre min/max uzunluğu gibi, birinin karar verdiği ve
  değişebilecek değerler. `min(1)` gibi "boş olmasın"dan ibaret olanlar yerinde
  kalır — sabite çıkarmak gürültüdür.

**Çıktı:**

- `@SerializeOptions({ schema })` çalışma zamanında alanları ayıklar;
  `@ApiOkResponse({ standardSchema })` aynı şemayı OpenAPI'ye yazar. İkisi
  birlikte kullanılır.
- Controller'ın dönüş tipi `z.input<typeof şema>` olmalı — serialize edilmeden
  önceki hâl (`Date` içerir). `z.infer` istemcinin aldığı tiptir (`string`).
  Karıştırırsan `Type 'Date' is not assignable to type 'string'` alırsın.
- Servis **domain nesnesi** döndürür, cevabın şeklini bilmez. `passwordHash`
  servisten çıkabilir; şemada olmadığı için istemciye ulaşmaz. Koruma decorator
  hatırlamaya değil şemaya bağlıdır.
- Yeni response şemasına `.meta({ id: 'Ad' })` ver — OpenAPI'de isimli component
  olur ve üretilen istemcide `Session` gibi düzgün bir tip çıkar. Vermezsen şema
  operasyona gömülür ve her kullanımda ayrı anonim tip üretilir.

**Şekil gerçekten farklıysa** (yeniden adlandırma, düzleştirme, hesaplanmış alan)
saf bir mapper fonksiyonu yaz ve controller'da çağır. Mapper bağımlılık almaz;
alıyorsa o iş mapper'ın işi değildir. Sınıf üzerinde statik metot yapma — statik
bağımlılık alamadığı için her çağıranı kuryeye çevirir.

## OpenAPI

Spec, UI için değil istemci tipi üretmek için. Ölçüt: **`content` ekleyen
decorator gerekli, eklemeyen gereksiz.**

- `@ApiOkResponse` / `@ApiCreatedResponse` (`{ standardSchema }` ile) — zorunlu;
  vermezsen istemcide cevap `unknown` olur.
- `@ApiErrors(...)` — endpoint'in gerçekten döndürebildiği hata kodları.
- `@ApiBearerAuth()` — korumalı controller'a.
- 204 dönen endpoint'e response decorator'ı ekleme; katkısı yok.

`operationId` metot adından üretilir — metot adı istemcideki fonksiyon adıdır.

## Auth

- Her endpoint varsayılan olarak korumalı; açmak için `@Public()`. Yetkilendirme
  `@Roles(Role.<ROLE>)` ile.
- Guard sırası önemli: `JwtAuthGuard` önce çalışıp `request.user`'ı yazar,
  `RolesGuard` sonra okur — `app.module.ts`'teki kayıt sırası bunu belirler.
- Kullanıcı kimliği `@CurrentUser()` ile alınır, istek gövdesinden asla.

## Tuzaklar

- **ESM projesi.** Relative import'lar `.js` uzantılı olmak zorunda. Uzantısız
  yazarsan derlenir ama çalışmaz.
- **Tarih alanlarında düz `.transform()` yazma.** `common/schemas/iso-date.schema.ts`
  içindeki `isoDate()` / `nullableIsoDate()` kullan — zod-openapi transform'lu
  çıktı şemalarını `.meta()` olmadan çeviremiyor ve **uygulama açılmıyor**.
- **Liste endpoint'inde iki farklı şema.** `@SerializeOptions` diziyi eleman eleman
  doğrular, yani **eleman şemasını** ister; `@ApiOkResponse` OpenAPI için **dizi
  şemasını**. İkisine de `z.array(...)` verirsen 500 alırsın.
- **Codec (`z.codec`) kullanma.** Nest'in serializer'ı decode yönünü çalıştırır,
  cevap için yanlış yön.
- **`deletedAt: null` filtresini unutma.** Soft delete'li modelde her sorguya
  elle yazılır. `include`/`select` ile gelen ilişkiye yazılamaz — orada çekilen
  kaydı elle kontrol et.
- **Prisma sürümü sabit** (`7.10.0`). `prisma` paketinin npm `latest` etiketi bir
  release candidate gösteriyor; `@latest` ile güncelleme yapma.
