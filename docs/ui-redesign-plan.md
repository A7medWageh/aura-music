# خطة إعادة تصميم واجهة Aura — **تطبيق React Native / Expo أولًا** (Aura Design System)

> الحالة: **مسودة بانتظار الاعتماد**. لا كود يتغيّر قبل موافقتك على هذه الخطة.
> **النطاق الحالي: `aura-music-mobile` فقط** (11 شاشة + 12 مكوّنًا + الطبقة الحركية والأصول).
> الويب داخل نفس الملف كمرجع لاحق (مؤجّل): نُبني الـ tokens في مصدر مشترك حتى لا نعيد شغلاً لما نبدأ الويب، لكن **لا نلمس أي صفحة ويب الآن**، و**ترقية Tailwind v4 خرجت من المسار الحرج**.
> المنهج: نظام تصميم مركزي ← الموبايل ← الويب لاحقًا. الهوية: Obsidian + ذهب كهرماني. الحركة: مستوى بريميوم/معقّد (Skia + Reanimated).

---

## 0) الأساس: هوية «Obsidian Gold»

### 0.1 الألوان (tokens ثابتة، لا ألوان عشوائية في الصفحات بعد اليوم)

| الدور | القيمة | الاستعمال |
|---|---|---|
| `ink.0` | `#0A0908` | خلفية الصفحة الأساسية |
| `ink.1` | `#100D0B` | أسطح البطاقات |
| `ink.2` | `#151209` | أسطح مرتفعة / sheets |
| `ink.edge` | `#241E15` | حدود بدرجة ذهب مطفي 8% |
| `gold.500` | `#E2B13C` | اللون الأساسي من اللوجو (زر رئيسي، مؤشر التقدم، السطر الحالي من الكلمات) |
| `gold.300` | `#F4D47C` | hover / توهّج (إضاءة اللوجو) |
| `gold.700` | `#C08F24` | pressed (ظل اللوجو) |
| `copper.500` | `#8C6A2E` | عناصر ثانوية، شارات "Premium/Offline" |
| `text.primary` | `#F5F0E6` | نص أساسي |
| `text.secondary` | `#9A928A` | نص مساعد |
| `text.muted` | `#6B655F` | timestamps، تسميات |
| `success / danger / live` | `#5FCF8E / #E0603C / #E2B13C` | حالات فقط، لا زخرفة |

تدرّج العلامة (signature gradient): `135deg #F4D47C → #E2B13C → #C08F24` (نفس تدرّج اللوجو) — يُستخدم في 3 مواضع فقط: زر Play الرئيسي، شريط التقدم، شعار Aura. الإفراط فيه يقتل الفخامة.

### 0.2 الطباعة — عربي أولًا (لا يوجد خط مخصّص محمّل حاليًا في أي منصة)

| الدور | الويب | الموبايل |
|---|---|---|
| Display (عناوين كبيرة، اسم الأغنية في المشغّل) | `Alexandria` 600/700 | `Alexandria` (static TTF) |
| UI / نص عادي | `IBM Plex Sans Arabic` 400/500/600 | نفس العائلة |
| أرقام (زمن، عدّادات، EQ) | `Space Grotesk` tabular | `Space Grotesk` |

- أحجام ويب: `12/13/14/16/20/24/30/40` مع `line-height` عربي موسّع قليلًا (`1.55` للنصوص، `1.15` للعناوين) لأن الحرف العربي يحتاج نفسًا.
- **استضافة ذاتية للخطوط** (`.woff2` للويب، `.ttf` للموبايل) داخل `public/fonts/` و`assets/fonts/`: تحافظ على العمل دون اتصال (PWA) ولا تعتمد على CDN خارجي.
- **RN لا يتعامل جيدًا مع fonts متغيّرة**: نحمّل نسخًا ثابتة (Regular/Medium/SemiBold) فقط.
- `font-feature-settings: "ss01","tnum"` للأرقام.

### 0.3 إيقاع ومساحة
- مسافات من مضاعفات 4: `4 8 12 16 24 32 48 64`؛ نصف قطر موحّد `8 / 14 / 20 / 999`.
- ظلال = توهّج ذهبي منخفضOpacity وليس أسود: `0 18px 48px -22px rgba(232,180,74,.35)`.
- شبكة: الموبايل عمودان للبطاقات؛ الويب `12-col` بهوامش `24/40`.

### 0.4 مصدر واحد للحقيقة (يمنع تكرار المشكلة الحالية)
`design/tokens.json` ← سكربت `scripts/design-tokens/build.mjs` (بدون اعتماديات ثقيلة) يولّد:
- `src/styles/theme.css` → Tailwind v4 `@theme { --color-gold-500: … }`
- `aura-music-mobile/src/theme/tokens.ts` → كائن ثابت يستهلكه `src/theme/index.ts`

أي رقم لوني في أي شاشة بعد الآن يجب أن يكون `token`؛ لا hex خام (نضيف lint يحظر الـ hex خارج ملف الـ tokens).

---

## 1) مشاكل يجب أن يصلحها التصميم (من التدقيق الحالي)

1. **ثلاثة ثيمات متناقضة**: ويب `themeColor #6366f1`، `manifest.json #1DB954` (أخضر سبوتيفاي!)، accent `#00e5ff` سماوي، وTailwind indigo مُعاد تعريفه لسماوي. الموبايل: لوحة قرمزية مُرحّلة جزئيًا مع تسرّب `#6366f1/#818cf8` في `library.tsx`. → كل هذا يُمسح ويُبنى من `tokens.json`.
2. **RTL غير مُعالج**: الموبايل لا يستدعي `I18nManager.forceRTL` إطلاقًا؛ الويب يحتاج استراتيجية خصائص منطقية.
3. **كود ميت/غير قابل للوصول**: ~1,400 سطر في واجهة الموبايل + `library/page.tsx` بـ 1,243 سطر غير قابلة للصيانة.
4. **ميزات وهمية (Placebo)** — يجب حذفها أو تنفيذها فعليًا: مضخّم صوت وهمي 125–200%، EQ presets بلا مرشّحات، "8D Audio"، شارة "24-BIT LOSSLESS FLAC"، "42-band equalizer".
5. **الأصول**: صورة PNG واحدة بحجم 929KB مستنسخة كأيقونة + splash + شعار، وصور Unsplash كـ fallback → تُستبدل بأصول هوية.

---

## 2) البنية التقنية للويب — **مؤجّلة خارج النطاق الحالي** (مرجع فقط)

لن نُنفّذ أيًا مما يلي الآن؛ نُبقيه موثّقًا لأن الـ tokens التي نبنيها للموبايل هي نفسها التي سيستهلكها الويب لاحقًا بدون إعادة شغل.

- **Tailwind v4**: حذف `tailwind.config.ts`، `@import "tailwindcss"` + `@theme` في CSS، PostCSS `@tailwindcss/postcss`. مكسب فعلي: خصائص منطقية (`ms-/me-/ps-/pe-/text-s-`) تُصلح RTL، وسرعة بناء، وtokens من نفس المصدر.
- **الحركة**: `framer-motion@11` ← `motion/react` (v12) مع `layoutId` للعناصر المشتركة.
- **تمرير ناعم**: `lenis` (خفيف) لصفحات الديسكفري/الألبومات.
- **Shaders للويب**: WebGL2 fragment shader مكتوب يدويًا (لا three.js) خلف `<canvas>` لطبقة الغلاف الجوي، مع انخفاض تلقائي لـ `prefers-reduced-motion` و`save-data`.
- **الـ PWA**: تحميل الخطوط والأصول داخل الـ service worker cache (السلوك دون اتصال لا ينكسر)، وتحديث `manifest.json` (theme/background = `#0A0908`).
- **حزم**: `optimizePackageImports` لـ motion، فصل Skia/WebGL في dynamic import حتى لا يدخل الـ main bundle.

**حواجز أداء تسري على المنصتين**: أول صوت للأغنية يبقى **ثوانٍ** (لا يُقبل أي إرجاع لملء كامل قبل التشغيل)، استجابة Range 206 كما هي، صفر تراجع في `src/services/**`؛ وعلى الويب لاحقًا LCP < 2.0s على 4G وCLS ≈ 0.

---

## 3) مكتبات الموبايل (مُتحقَّق من توافقها، لا من الذاكرة)

Expo SDK 58 = React Native 0.88 + React 19.3.0 (New Architecture فقط). المُثبت:

| المكتبة | الإصدار المتوافق | الدور |
|---|---|---|
| `@shopify/react-native-skia` | **2.13.1** | شيدرات، particles، blur حقيقي، موجات بصرية |
| `react-native-reanimated` | **4.7.0** | كل الحركة + Shared Element Transitions أصلي |
| `react-native-gesture-handler` | **~3.2.1** | إيماءات السحب/التحكم |
| `@shopify/react-native-skia` + FlashList | **FlashList 2.3.2** | قوائم طويلة 60fps |
| `expo-haptics` / `expo-blur` | SDK 58 | اهتزاز لمسي + زجاج iOS |

قرارات احترازية:
- **`@gorhom/bottom-sheet`**: تاريخ تعارض مع New Architecture (issue #1944) → **لا نثبّته**. نبني الـ sheet بأنفسنا بـ Reanimated + Gesture Handler (هويتنا أصلاً تحتاج sheet مخصّصًا).
- **Shared element**: Reanimated 4 `sharedTransitionTag` (أصلي، يحتاج new arch — متحقّق) بدل مكتبات خارجية.
- **`InteractionManager` / `Modal animated` أُزيلوا في 0.88** → نمرّ على أي استعمال قبل التسليم.
- **صوت/EQ حقيقي على الموبايل**: `expo-av` لا يعطي EQ ولا now-playing metadata → **في هذه الجولة نحذف كل ما هو وهمي من الموبايل** (مضخّم الصوت 125–200%، EQ presets، 8D، شارة "24-BIT LOSSLESS FLAC"، "42-band equalizer") ونستبدلها بمعلومات صحيحة عن الصيغة الفعلية. EQ حقيقي على الويب (Web Audio `BiquadFilterNode` × 6 نطاقات) يأتي مع جولة الويب، ومع spike منفصل لمشغّل native لو قرّرنا EQ على الموبايل.

---

## 4) مراحل التنفيذ (كل مرحلة commit + deploy + اختبار حقيقي قبل التالية)

### المرحلة 0 — الأساس (≈ يوم عمل)
`design/tokens.json` + مولّد + خطوط self-hosted + مسح الألوان المتناقضة + توحيد `app.json` + lint يمنع hex الخام.
**مخرجات**: ثيم مُوحّد يُبنى منه المنصتان، بدون أي تغيير بصري بعد.

### المرحلة 1 — أساس الموبايل
توصيل `tokens.ts` للموبايل، تحميل الخطوط بـ `expo-font` (نسخ static: Regular/Medium/SemiBold)، `I18nManager.forceRTL(true)` مبكّرًا في `app/_layout.tsx` قبل أول render، توحيد `app.json` (theme/background = `#0A0908`)، حذف الكود الميت (~1,400 سطر)، إصلاح `SongItem.tsx` (الـ prop `onOptionsPress` معرّف في الواجهة وغير مستلَم عند line 26-30 → قائمة الخيارات لا تُستدعى من `playlist/[id].tsx:161`)، وتقسيم `index.tsx` (2,628 سطر) و`library.tsx` (2,475 سطر) لوحدات قابلة للصيانة.
**بوّابة**: التطبيق يفتح، الخطوط معبّأة قبل أول إطار، RTL صحيح، وصفر تراجع في التشغيل/التنزيل.

### المرحلة 2 — مكتبة مكوّنات الموبايل (Primitives)
`AuraButton / AuraCard / AuraChip / AuraSheet (Reanimated) / AuraTabs / AuraField / AuraIcon / AuraSkeleton / AuraMediaArt / AuraMarquee / AuraProgressBar / AuraToast / AuraHapticTouch`.
- حالات: pressed / disabled / loading (hover غير موجود على اللمس) + مقاسات لمس ≥ 44pt.
- خصائص منطقية (`writingDirection`) بدل `marginLeft/Right` حتى لا ينكسر RTL.
- **Shell جديد**: `MobileTabBar` + `MiniPlayer` + `FullPlayerModal` كلها من الـ primitives، لا hex خام في أي منها.

### المرحلة 3 — شاشات الموبايل (بالترتيب)
1. `(tabs)/index` — Home: Hero شخصي + «واصلت الاستماع» + شرائح ألبومات أفقية.
2. `(tabs)/search` — بحث بهوية: field كبير، chips للأنواع، نتائج بـ FlashList.
3. `(tabs)/library` — مكتبة + قائمة التشغيل + تنزيلات بألواح من الـ primitives.
4. `(tabs)/favorites` و`(tabs)/profile` (بداخلها الإعدادات ووضع «تقليل الحركة»).
5. `artist/[id]` — شاشة سينمائية: بانر مضبّب من غلاف الأشهر ألبوم، grid ألبومات، تبويبات.
6. `album/[id]` و`playlist/[id]` — رأس كبير + قائمة التراكات + زرا «تشغيل» و«خلط عشوائي».
7. `(tabs)/ai-dj` — إمّا شاشة «قيد الإنشاء» بموجة Skia أنيقة، أو حذف التبويب فعليًا (قرارك).
8. `FullPlayerModal` — الغلاف بأكبر مساحة، عناصر يمين/شمال النوتش (المساحة المُثبتة سابقًا)، شريط تقدّم بتدرّج signature.
9. `LyricsView` + `QueueModal` — الكلمات بتمرير لمسي طبيعي، السطر الحالي بتوهّج ذهبي وقناع blur على الحواف.
- شريط حالة آيفون: لا عنصر تحت النوتش، وكل المقاسات متناسبة مع حجم الشاشة كما أثبتناها سابقًا.

### المرحلة 4 — طبقة الحركة للموبايل (المستوى المعقّد)
- **Skia 2.13.1**: شيدر aurora ذهبي على الغلاف أثناء التشغيل، جزيئات عند تبديل الأغنية، visualizer حقيقي من طاقة الصوت (لا رسم وهمي)، blur حقيقي للـ headers.
- **Reanimated 4.7**: `sharedTransitionTag` لغلاف الأغنية من البطاقة ← المشغّل الكامل، سحب `MiniPlayer` للتوسيع بـ gesture، قائمة خيارات Long-press عبر `AuraSheet`، haptics على كل لمسة مؤثرة (play/seek/long-press).
- **FlashList 2.3.2** بدل FlatList في كل القوائم الطويلة.
- `reduceMotion` switch في الإعدادات + تقييم تلقائي على الأجهزة الضعيفة.
- **بوّابة**: 60fps على iPhone A12 كحدّ أدنى، ولا سقوط إطارات ملحوظ عند فتح المشغّل.

### المرحلة 5 — الأصول والتنميق
شعار SVG جديد، أيقونة 1024 + maskable، splash، غلاف افتراضي بالهوية بدل Unsplash، أغطية مشتقة ألوانيًا للألبومات بلا صورة، ثم جولة تدقيق على كل الشاشات (320px/iPhone SE ← Pro Max ← Android صغير) بالعربي والإنجليزي.

---

### لاحقًا — خارج النطاق الحالي: الويب
لما نبدأ الويب، الترتيب المحفوظ: (أ) primitives من نفس الـ tokens، (ب) Tailwind v4 + `@theme` + خصائص منطقية لـ RTL، (ج) الصفحات بالترتيب `page.tsx → search/discover → artist/album → library (تفكيك 1,243 سطر) → favorites/profile → onboarding/auth → ai-dj → admin → loading/offline/modals`، (د) طبقة الحركة بـ `motion/react` (layoutId + Lenis + WebGL shader خفيف + visualizer من `AnalyserNode`). لا شيء من هذا يُنفّذ الآن.
---

## 5) الحوكمة والجودة

- **قبل/بعد لكل شاشة**: لقطة من الإنتاج تُرفق في تعليق الـ commit.
- **بروتوكول التحقق** (كما اشترطت): لا يُقال «تم» من الكود وحده — أركّب dev/expo build وأشغّل أغنية حقيقية على الآيفون، أقيس زمن أول صوت، ألعب للآخر بلا انقطاع عند الدقيقة 60، وأتأكّد أن الكلمات تتحرك سطرًا بسطر، قبل إغلاق أي مرحلة.
- **بوّابات**: لا مرحلة تنتقل للتالية وفيها أي من: أول صوت > 3s، توقّف المشغّل قبل نهاية الأغنية، console errors، أو أي تغيّر في سلوك 206/Streaming.
- **Rollback**: كل مرحلة commit مستقل قابل للعكس؛ لا force-push.

## 6) مخاطر معروفة

| خطر | التخفيف |
|---|---|
| Skia/Reanimated على RN 0.88 (new arch) | التثبيت من إصدارات SDK 58 المُعلنة (Skia 2.13.1 / Reanimated 4.7.0)، وspike يوم واحد قبل الالتزام في المرحلة 4 |
| `I18nManager.forceRTL` يحتاج إعادة تشغيل التطبيق وقد يكسر تخطيطات مبنية على left/right | ترحيل الخصائص المنطقية في المرحلة 2 قبل تفعيله، واختبار كل شاشة في الاتجاهين |
| `InteractionManager` و`Modal animated` أُزيلوا في 0.88 | grep شامل قبل إغلاق المرحلة 1 واستبدالها بـ Reanimated |
| حجم الحزمة/البطء على الأجهزة الضعيفة مع طبقة الحركة | dynamic import لشيدر Skia + وضع `reduceMotion` + عتبة GPU/بطارية |
| كسر التنزيل/التشغيل أثناء إعادة الهيكلة | ممنوع لمس `src/services/**` و`src/store/**` أثناء المراحل 1–4؛ تعديل الـ UI فقط، وكل مرحلة commit قابل للعكس |
| زمن التسليم (الموقع يعمل الآن) | التصميم فوق المسارات الموجودة؛ لا إعادة كتابة لمنطق الصوت |

## 7) بنود جانبية يجب حسمها (ليست تصميم، لكنها ظهرت أثناء التدقيق)
- `worker-start.js` متتبَّع في git وفيه string اتصال Neon مضمّن → يجب إخراجه للمتغيرات ونقله من التاريخ.
- `RAPIDAPI_KEY` مكتوب مباشرة في `src/app/api/lyrics/route.ts` → env var.
- صفوف مكرّرة قديمة في `telegram_audio_cache` (مثل `feGhPuoxVdo` ×3) تحتاج تنظيفًا بموافقتك.
- `aura-music-mobile/` **غير متتبَّع في Git إطلاقًا** (untracked) — لا شبكة أمان للرجوع. عملت snapshot يدوي في `scratch/mobile-baseline/`. يُنصح بمتابعة المجلد (تجاهل `node_modules/` و`.expo/` مفعّل فعلًا في `aura-music-mobile/.gitignore`) — لكن هذا قرار لك لأن الدفع سيضيف شجرة كاملة لمستودع GitHub.
- `expo-av` مُعلَن Deprecated في تحذير التشغيل (المسار المقترح `expo-audio`) — يُراجع في موجة المشغّل.
- إصدار CORS على هدف الويب فقط: الطلبات ترسل `cache-control` ومنتِج الويب يرفضها في preflight (`Access-Control-Allow-Headers`) — لا يؤثر على native، لكن في `expo start --web` نحتاج إما إسقاط الهيدر أو ضبط `Access-Control-Allow-Headers: cache-control` في `src/app/api/**`.
- لا شاشة واحدة كانت تستخدم `Typography.*` (صفر مرجع في `app/` و`src/components/`) — لذلك الخطوط مُحمّلة ومُعرّفة لكن غير مطبّقة بعد؛ تطبيقها يأتي مع `AuraText`/المكوّنات في المرحلة 2 وترحيل التنسيقات في المرحلة 3.

---

### القرارات (حسمتها بتفويض «قرر انت بالأحسن»)
1. **الهوية والخطوط**: Obsidian + ذهب كما هي. العناوين `Almarai` (أوزان ثابتة) والواجهة `IBM Plex Sans Arabic` (أوزان ثابتة). استبعدنا `Space Grotesk` و`Alexandria` لأن المتاح منهما نسخ متغيّرة فقط، وخطوط variable غير موثوقة مع React Native.
2. الترتيب: مراحل 0→5 على `aura-music-mobile` فقط، والويب يتأجل لموجة ثانية.
3. **`ai-dj`**: التبويب **حقيقي** — `MusicApi.getAiDj(mood.id)` مع fallback إلى `getTrending()` في `app/(tabs)/ai-dj.tsx:66` → يُبقى ويعاد تصميمه في المرحلة 3.
4. **الميزات الوهمية**: **حُذفت فعليًا** (مضخّم الصوت الخارق، أنماط الاستوديو بيس/8D، Equalizer الـ42 عمود، شارات 24-BIT LOSSLESS). `expo-av` لا يعطي EQ، فلا EQ على الموبايل قبل مشغّل native يدعمه. سرعة التشغيل حقيقية (`sound.setRateAsync`) وبقيت.
5. **RTL**: **أُجّل `forceRTL(true)` إلى نهاية المرحلة 3** — الشاشات ما زالت تستخدم `marginLeft/Right` و`textAlign` صريحة، وتفعيله قبل الترحيل للخصائص المنطقية كان سيكسر التخطيط.
6. **المرحلة 0 منفّذة**: `design/tokens.json` + المولّد + `src/theme/tokens.ts` + ترميز 550 لونًا خامًا (432 hex + 118 rgba) في 17 ملف واجهة + تحميل الخطوط قبل أول إطار + حذف الميزات الوهمية. التحقق: `tsc --noEmit` نظيف، و`expo export` ينتج Hermes bundle وفيه الخطوط الثمانية.
