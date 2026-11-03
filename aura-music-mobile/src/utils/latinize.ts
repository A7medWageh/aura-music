/**
 * Arabic → Franco/Latin display helpers.
 *
 * Used only for the "الأكثر استماعاً الآن" chart so that no Arabic title or
 * artist name is mixed with Latin ones. Playback data is never mutated.
 */

const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const ARABIC_RANGE = "\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF\\uFB50-\\uFDFF\\uFE70-\\uFEFF";
const ARABIC_CHAR = new RegExp(`[${ARABIC_RANGE}]`);
const ARABIC_ALL = new RegExp(`[${ARABIC_RANGE}]`, "g");

export function normalizeArabicName(input: string | null | undefined): string {
  return (input || "")
    .replace(DIACRITICS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ؤئ]/g, "ء")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function containsArabic(input: string | null | undefined): boolean {
  return !!input && ARABIC_CHAR.test(input);
}

const LETTERS: Record<string, string> = {
  ا: "a",
  أ: "a",
  إ: "e",
  آ: "aa",
  ٱ: "a",
  ب: "b",
  ت: "t",
  ث: "th",
  ج: "g",
  ح: "7",
  خ: "kh",
  د: "d",
  ذ: "z",
  ر: "r",
  ز: "z",
  س: "s",
  ش: "sh",
  ص: "s",
  ض: "d",
  ط: "t",
  ظ: "z",
  ع: "3",
  غ: "gh",
  ف: "f",
  ق: "2",
  ك: "k",
  ل: "l",
  م: "m",
  ن: "n",
  ه: "h",
  ة: "a",
  و: "w",
  ي: "y",
  ى: "a",
  ء: "2",
  ئ: "2",
  ؤ: "2",
};

function transliterateLetters(text: string): string {
  let out = "";
  for (const char of text) {
    const mapped = LETTERS[char];
    if (mapped !== undefined) {
      out += mapped;
    } else if (ARABIC_CHAR.test(char)) {
      // Arabic presentation forms and rare letters are dropped so the result
      // can never leak a single Arabic glyph into the chart.
      continue;
    } else {
      out += char;
    }
  }
  return out;
}

function transliterate(text: string): string {
  return text
    .split(/\s+/)
    .map((word) => {
      if (/^ال[\u0600-\u06FF]/.test(word) && word.length > 3) {
        return "El " + transliterateLetters(word.slice(2));
      }
      return transliterateLetters(word);
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function polish(text: string): string {
  const trimmed = text
    .replace(ARABIC_ALL, "")
    .replace(/^[\s\-–—|•·,.;:()]+|[\s\-–—|•·,.;:()]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!trimmed) return "";
  return trimmed.replace(/(^|[\s\-])([a-z])/g, (_m, lead, c) => lead + c.toUpperCase());
}

const ARTIST_OVERRIDES: Record<string, string> = {
  "عمرو دياب": "Amr Diab",
  "شيرين عبد الوهاب": "Sherine",
  "شيرين عبدالوهاب": "Sherine",
  "تامر حسني": "Tamer Hosny",
  "محمد حماقي": "Hamaki",
  حماقي: "Hamaki",
  ويجز: "Wegz",
  "أحمد سعد": "Ahmed Saad",
  "نانسي عجرم": "Nancy Ajram",
  "وائل كفوري": "Wael Kfoury",
  "حسين الجسمي": "Hussain Al Jassmi",
  "بهاء سلطان": "Bahaa Sultan",
  كايروكي: "Cairokee",
  "فرقة كايروكي": "Cairokee",
  "مروان موسى": "Marwan Moussa",
  "مروان بابلو": "Marwan Pablo",
  "محمد رمضان": "Mohamed Ramadan",
  "رامي صبري": "Ramy Sabry",
  "إليسا": "Elissa",
  اليسا: "Elissa",
  "أصالة": "Assala",
  "أنغام": "Angham",
  "فضل شاكر": "Fadel Shaker",
  "حمزة نمرة": "Hamza Namira",
  "محمد منير": "Mohamed Mounir",
  "عبد الحليم حافظ": "Abdel Halim Hafez",
  "أم كلثوم": "Umm Kulthum",
  فيروز: "Fairuz",
  "كاظم الساهر": "Kadim Al Sahir",
  "ماجد المهندس": "Majid Al Muhandis",
  "راشد الماجد": "Rashed Al Majed",
  "محمد عبده": "Mohammed Abdu",
  "سعد لمجرد": "Saad Lamjarred",
  "راغب علامة": "Ragheb Alama",
  "نوال الزغبي": "Nawal Al Zoghbi",
  "ميريام فارس": "Myriam Fares",
  "زياد برجي": "Ziad Bourji",
  "مروان خوري": "Marwan Khoury",
  "محمد فؤاد": "Mohamed Fouad",
  "هاني شاكر": "Hany Shaker",
  "مدحت صالح": "Medhat Saleh",
  "علي الحجار": "Ali El Haggar",
  "هشام عباس": "Hisham Abbas",
  "إيهاب توفيق": "Ehab Tawfik",
  "مصطفى الشريعى": "Mostafa El Shreai",
  "مصطفي الشريعي": "Mostafa El Shreai",
  "رحمه محسن": "Rahma Mohsen",
  "رحمة محسن": "Rahma Mohsen",
  "حسن شاكوش": "Hassan Shakosh",
  "عصام صاصا": "Essam Saasa",
  "محمود السوهاجي": "Mahmoud El Sohagy",
  "أمينة": "Amina",
  "Amina - أمينة": "Amina",
  "مصطفي الجن و هادي الصغير - تيم الابداع": "Mostafa El Gen & Hady El Soghayar",
  "مصطفى الجن و هادي الصغير - تيم الابداع": "Mostafa El Gen & Hady El Soghayar",
  عفروتو: "Afroto",
  "تامر عاشور": "Tamer Ashour",
  "مصطفى حجاج": "Mostafa Hagag",
  "عمر كمال": "Omar Kamal",
  "أحمد شيبة": "Ahmed Sheba",
  "رضا البحراوي": "Reda El Bahrawy",
  "محمد الشامي": "Mohamed El Shamy",
  مسلم: "Muslim",
  "أبو": "Abu",
  "أحمد عبده": "Ahmed Abdo",
  "سيرين عبد النور": "Cyrine Abdelnour",
  "عاصي الحلاني": "Assi El Helani",
  يارا: "Yara",
  "مايا دياب": "Maya Diab",
  "خالد عجاج": "Khaled Aggag",
  "محمد العسيلي": "Mahmoud El Esseily",
  "محمود العسيلي": "Mahmoud El Esseily",
  "أحمد مكي": "Ahmed Mekky",
};

const TITLE_OVERRIDES: Record<string, string> = {
  "فرتكة فرتكة": "Fartaka Fartaka",
  درويله: "Darwila",
  "انتى الوحش": "Enty El Wa7sh",
  "هنا متعيشوهاش": "Hena Mat3ishohash",
  "انا بنسي نفسي معاك": "Ana Bansi Nefsy Ma3ak",
  "الدنيا ملبشه": "El Donia Malabsha",
  "محكمه ودخلنا علي المفرمه": "Mahkama W Dakhalna 3al Mafarma",
  "سر وجعنا": "Ser Waga3na",
  "الغابة ليها بابا": "El Ghaba Leha Baba",
  "تملي معاك": "Tamally Maak",
  "مكانك في قلبي": "Makanak Fe Albi",
  يتعلموا: "Yet3alemo",
  "برج الحوت": "Borg El Hout",
  "وهي عاملة إيه": "We Heya 3amla Eh",
  مشايعري: "Masha3ery",
  مشاعر: "Mashaaer",
  كدابين: "Kaddabin",
  "على بالي": "3ala Bali",
  "حبه جنة": "7obba Ganna",
  "كله غيران": "Kollo Gheran",
  "ناسيني ليه": "Nassini Leh",
  "كفاياك أعذار": "Kefayak A3zar",
  ارجعلي: "Erga3ly",
  صعبة: "Sa3ba",
  "هرمون السعادة": "Hormone El Sa3ada",
  "ما بلاش": "Ma Balash",
  "يا ستار": "Ya Sattar",
  "أحلى حاجة فيكي": "Ahla Haga Fiky",
  "لا ملامة": "La Malama",
  ظلموني: "Zalimouni",
  "يا مرايتي": "Ya Merayti",
  كرهني: "Krahni",
  "ع بالي حبيبي": "3a Bali Habibi",
  "مكتوبة ليك": "Maktouba Leek",
  "سلملي عليه": "Sallemly 3aleih",
  "ذاك الغبي": "Zak El Ghaby",
  "بنت أكابر": "Bent Akaber",
  "جابوا سيرته": "Gabou Serto",
  غلبان: "Ghalban",
  "شكراً": "Shokran",
  "سيدي وصالك": "Sidi W Salak",
  "أكتبلك تعهد": "Aktablek Taahod",
  "حالة خاصة جداً": "Hala Khasa Gedan",
  "ياريتك فاهمني": "Yaretak Fahemni",
  "ونفضل نرقص": "W Nefdal Norks",
  "البنت القوية": "El Bent El Qawiya",
  "كلنا مننجر": "Kollena Menongor",
  "الغرام المستحيل": "El Gharam El Mostahil",
  "يا ضلي يا روحي": "Ya Dilly Ya Rohy",
  "يا غايب": "Ya Ghayeb",
  "مع السلامة": "Ma3a El Salama",
  "ضحكت الدنيا": "Dehket El Donia",
  "يا ترى": "Ya Tara",
  "أنا غلطان": "Ana Ghaltan",
  "الواد قلبه بيوجعه": "El Wad Albo Beywga3o",
  "غريب الحب": "Ghareeb El Hob",
  "مسألتنيش": "Masa2altinish",
  "فاضي شوية": "Fady Shewaya",
  "داري يا قلبي": "Dary Ya Alby",
  "بالبنط العريض": "Bel Bont El 3areed",
};

function buildLookup(source: Record<string, string>): Record<string, string> {
  const lookup: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    lookup[normalizeArabicName(key)] = value;
  }
  return lookup;
}

const ARTIST_LOOKUP = buildLookup(ARTIST_OVERRIDES);
const TITLE_LOOKUP = buildLookup(TITLE_OVERRIDES);

export function latinizeArtist(name: string | null | undefined): string {
  const raw = (name || "").trim();
  if (!raw) return "Artist";
  const known = ARTIST_LOOKUP[normalizeArabicName(raw)];
  if (known) return known;
  if (!containsArabic(raw)) return raw;
  return polish(transliterate(raw)) || "Artist";
}

export function latinizeTitle(title: string | null | undefined): string {
  const raw = (title || "").trim();
  if (!raw) return "Track";
  const known = TITLE_LOOKUP[normalizeArabicName(raw)];
  if (known) return known;
  if (!containsArabic(raw)) return raw;
  return polish(transliterate(raw)) || "Track";
}
