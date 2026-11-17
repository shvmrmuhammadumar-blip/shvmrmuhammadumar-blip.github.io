LUMO — Project README & Handoff Guide
Loyiha holati: mavjud ilova ustida ishlash davom etmoqda. Hozirgi bosqichda chat/Connect funksiyalarini to‘ldirish va loyihani keyingi dizayn bosqichiga tayyorlash rejalashtirilgan. Yangi dizayn rasmlari yuborilib, foydalanuvchi ishni boshlashni aniq so‘raganidan keyingina katta dizayn/implementatsiya ishlari boshlanadi.

1. Loyiha haqida
   Lumo — chat, kontent, video, hamjamiyat va boshqa ijtimoiy imkoniyatlarni yagona ilovada birlashtirishni ko‘zlagan social ecosystem.

Maqsad — shunchaki chiroyli maket yaratish emas, balki mavjud loyihaga mos, ishlaydigan, responsive va izchil mahsulot interfeysini ishlab chiqish. 2. Texnologiyalar
Loyihada hozirgacha ishlatilgani ma’lum bo‘lgan texnologiyalar:

- Expo (loyihada Expo SDK 54 ishlatilgani qayd etilgan; aniq versiyani package.json va lockfile’dan tekshirish kerak)
- React Native
- Expo Router
- TypeScript
- Supabase — autentifikatsiya, ma’lumotlar bazasi va storage
  Texnologiyalar va versiyalar bo‘yicha package.json, lockfile, app.json va mavjud source code asosiy haqiqat manbai hisoblanadi. README’dagi ma’lumot sababli dependency yoki konfiguratsiyalarni yangilamang.

3. Asosiy mahsulot bo‘limlari
   Asosiy navigatsiya konsepsiyasi

- Home — asosiy feed.
- Video — qisqa va uzun videolar, playlistlar va Live.
- Connect — shaxsiy/guruh chatlari va qo‘ng‘iroqlar.
- Spaces — guruhlar, kanallar, hamjamiyatlar, forumlar va voice room’lar.
- Market — mahsulotlar, do‘konlar va xizmatlar.
- Map — joylar, tadbirlar va foydalanuvchi ruxsat bergan joylashuv imkoniyatlari.
- Studio — creator boshqaruvi va analitika.
- Profile — foydalanuvchining universal profili.
- Notifications & Settings — bildirishnomalar va ilova sozlamalari.
  Bu ro‘yxat mahsulot konsepsiyasini ifodalaydi. Repo ichidagi haqiqiy route va navigatsiya tuzilmasi alohida tekshirilishi kerak.
  Qo‘shimcha modullar
- Universal Create / Composer
- Universal Search
- Stories
- Channels
- Groups & Communities
- Live
- Mini Apps
- Events
- Wallet
  Bu modullarni birdaniga to‘liq ishlab chiqish shart emas. Ish tartibi foydalanuvchi yuboradigan yakuniy dizaynlar va mavjud kod holatiga qarab belgilanadi.

4. Dizayn yo‘nalishi — Lumo Soft Apple
   Lumo uchun tanlangan yo‘nalish:

Soft Apple-inspired UI + Premium Glassmorphism.

Asosiy tamoyillar:

- Sokin, nafis, jiddiy va premium ko‘rinish.
- Glassmorphism sezilib turadi, lekin har bir element blur bilan qoplanmaydi.
- Shaffof, tutunsimon glass qatlamlari, nozik reflekslar va yumshoq soyalar.
- Toza tipografika, aniq vizual ierarxiya va puxta spacing.
- Desktop, tablet va mobile ekranlariga moslashuv.
- Barcha tablarda yagona dizayn tizimi, lekin har bir modulning o‘z funksional xarakteri bo‘lishi kerak.
  Ranglar
  Asosiy neytral palitra:
  Token Hex
  Obsidian #090C12
  Graphite #12161C
  Slate #20252D
  Silver / White Ekran kontrasti va matn ierarxiyasiga mos neytral och ranglar

Ranglar faqat oq-qora bilan cheklanmaydi. Zarur joylarda soft, muted va funksional aksentlardan foydalanish mumkin. Masalan, holat, faol tanlov, ogohlantirish yoki media kategoriyasini farqlash uchun.

Quyidagilar asosiy brend aksenti sifatida ishlatilmasin: yorqin/neon qizil, yashil, sariq, binafsha va rang-barang gradientlar. Sage, Soft Sand va Dusty Rose ranglari tanlangan palitraga kiritilmagan.
Tipografika

- Sarlavhalar uchun: Plus Jakarta Sans yo‘nalishi.
- Interfeys matnlari uchun: DM Sans yo‘nalishi.
- Repo’da mavjud font va asset’larni tekshirmasdan almashtirmang.
  Taqiqlangan dizayn odatlari
- Ortiqcha neon, glow, blur yoki 3D bezaklar.
- Har bir kartaga gradient berish.
- Haddan tashqari ko‘p rangli badge va ikonlar.
- Bolalarcha, generic yoki sun’iy AI maket ko‘rinishi.
- Instagram, Telegram, TikTok yoki WhatsApp interfeysini bevosita ko‘chirish.
- Ishlayotgan funksiyalarni faqat dizayn uchun olib tashlash.

5. Mavjud loyiha bilan ishlash qoidalari
   Bu yangi, bo‘sh loyiha emas. Ishni boshlashdan oldin mavjud kod to‘liq tekshirilishi shart.
1. Avval repo tuzilmasi, route’lar, komponentlar, API qatlamlari, Supabase schema va migrations o‘rganilsin.
1. package.json, lockfile, app.json va TypeScript konfiguratsiyasi tekshirilsin.
1. Mavjud autentifikatsiya, Supabase ulanishi, database query’lari, storage, API va navigatsiya sababsiz o‘zgartirilmasin.
1. Ishlayotgan funksiyalar saqlansin. UI yangilanishi mavjud business logic’ni buzmasligi kerak.
1. Bir xil vazifani bajaradigan yangi komponent yaratishdan oldin mavjud komponentlar qidirilsin.
1. Database o‘zgarishi zarur bo‘lsa, migration yozilsin; production ma’lumotlariga xavf tug‘diradigan amallar alohida tekshirilsin.
1. Environment variable nomlari saqlansin. Hech qanday secret, token, service role key yoki parol kodga yozilmasin.
1. Katta refactor faqat zarur bo‘lsa va sababi aniq bo‘lsa bajarilsin.
1. O‘zgarishlar kichik, tekshiriladigan bosqichlarga ajratilsin.
1. Har bir bosqichdan keyin TypeScript va mavjud build/start tekshiruvlari bajarilsin.
1. Chat / Connect bo‘yicha hozirgi bosqich
   Hozir foydalanuvchi chat funksiyalarini to‘ldirish ustida ishlamoqda. Shu sababli:

- Chat’ning mavjud funksional holati avval tekshirilsin.
- Hozir ishlayotgan xabar yuborish, media/fayl jo‘natish, chat ro‘yxati va boshqa mavjud imkoniyatlar saqlansin.
- Chat dizayni yoki arxitekturasini qayta yozishdan oldin foydalanuvchining aniq topshirig‘i kutiladi.
- Yangi dizaynlar kelganda ular mavjud chat funksiyalariga moslashtirilsin; funksiyalar dizaynga moslash uchun yo‘qotilmasin.
  Qaysi chat funksiyalari to‘liq, qaysilari chala yoki ishlamayotgani faqat repo va foydalanuvchi bergan test natijalari orqali tasdiqlanadi. README buni oldindan tasdiqlamaydi.

7. Yangi dizaynlar yuborilgandagi ish tartibi
   Foydalanuvchi yangi dizayn rasmlarini yuborib, “loyihani boshlaysan” deb aniq aytganidan keyin:
1. Barcha dizayn rasmlari va reference’lar birma-bir tahlil qilinadi.
1. Har bir ekran mavjud Expo Router route va komponentlar bilan taqqoslanadi.
1. Qaysi ekran mavjud, qaysi biri yangilanadi, qaysi biri yangi yaratilishi aniqlanadi.
1. Dizayn komponentlari va umumiy tokenlar belgilanadi.
1. Implementatsiya mavjud arxitekturani saqlagan holda bajariladi.
1. Desktop, tablet va mobile holatlari tekshiriladi.
1. Rasm/video/media, loading, empty, error va interaction holatlari ko‘rib chiqiladi.
1. TypeScript va mavjud build/start tekshiruvlari bajariladi.
1. O‘zgartirilgan fayllar va tekshiruv natijalari aniq hisobot qilinadi.
   Muhim: dizayn rasmlarini olish yoki README’ni tayyorlashning o‘zi implementatsiyani boshlashga ruxsat hisoblanmaydi. Ish faqat foydalanuvchining aniq ko‘rsatmasidan keyin boshlanadi.
1. Loyihani yuborishga tayyorlash
   Yordamchi loyihani to‘liq tekshira olishi uchun repo’ni ZIP shaklida yuborish mumkin.
   ZIP ichida qolsin

- README.md
- package.json va ishlatilayotgan lockfile (package-lock.json, pnpm-lock.yaml yoki yarn.lock)
- app/, components/, lib/ kabi source papkalar
- assets/, public/ va ishlatilayotgan boshqa media asset’lar
- supabase/migrations/ va kerakli schema/type fayllari
- app.json, tsconfig.json, Babel/Metro config va boshqa loyiha konfiguratsiyalari
- design-references/ — yangi UI dizayn rasmlari va reference’lar
- .env.example — faqat o‘zgaruvchi nomlari va namunaviy qiymatlar bilan
  ZIP ichiga kiritilmasin
- node_modules/
- .expo/
- .git/
- dist/, build/, web-build/
- android/ va ios/ ichidagi generatsiya qilingan build artefaktlari (agar aynan kerak bo‘lmasa)
- .env va barcha haqiqiy secret/token/parollar
- vaqtinchalik backup, cache va log fayllari
  Tavsiya etilgan reference papkasi
  lumo/
  ├── README.md
  ├── design-references/
  │ ├── home/
  │ ├── main-tabs/
  │ ├── additional-modules/
  │ └── internal-screens/
  ├── app/
  ├── components/
  ├── lib/
  ├── assets/
  ├── supabase/
  ├── package.json
  └── ...
  Repo’da bu papkalarning nomlari boshqacha bo‘lishi mumkin. Mavjud tuzilmani majburan o‘zgartirish shart emas; bu faqat reference’larni tartiblash uchun tavsiya.

9. Ishga tushirish va tekshirish
   Loyihaning root papkasida:
   npm install
   npx expo start
   Web’da tekshirish kerak bo‘lsa:
   npx expo start --web
   TypeScript tekshiruvi:
   npx tsc --noEmit
   Buyruqlar repo’dagi package manager, scripts va Expo konfiguratsiyasiga qarab tekshiriladi. Keraksiz dependency yangilash yoki SDK upgrade qilmang.

10. Yakuniy maqsad
    Lumo’ni yagona vizual tilga ega, professional, responsive va real ishlaydigan ijtimoiy ekotizimga aylantirish. Bunda dizayn sifati bilan bir qatorda mavjud funksiyalar, ma’lumotlar xavfsizligi, Supabase arxitekturasi va foydalanuvchi tajribasi saqlanishi shart.


## Premium UI implementation update — 2026-11-14

This source package keeps the existing Expo Router + React Native + Supabase architecture and existing authenticated flows. The shared UI foundation now uses the Soft Apple-inspired graphite palette (`#090C12`, `#12161C`, `#1A2029`, `#20252D`) with restrained silver accents and explicit keyboard focus styles.

### Connected areas in this source

- Home feed, posts, comments, Stories, profiles and media viewer.
- Personal conversations, message attachments, groups and channels.
- Video discovery from existing video posts, Spaces from existing groups/channels, and Search across people/posts/videos/public groups/public channels.
- Studio displays only real post, follower and like totals. It does not invent views, reach, watch time or earnings.

### Modules awaiting backend services

Market, Map, Events, Mini Apps, Live and Wallet currently show explicit not-connected states. The connected Supabase schema inspected for this build does not contain commerce, location sharing, events, mini-app registry, live-stream, wallet/ledger or creator-analytics tables, and no Edge Functions were found. No fake purchases, money transfers, live sessions or location sharing are simulated.

### Setup

Copy `.env.example` to `.env` and provide your own Supabase project URL and publishable/anon key. Never commit `.env`. Then run `npm install` and `npx expo start` (or `npx expo start --web`).

`IMPLEMENTATION_PLAN.md` records the supplied reference-to-route map, preserved backend boundaries and verification scope. `DESIGN.md` is the current shared visual-system source of truth.
