import type { Song } from "@/types/music";

export type MoodKey = "ai_dj" | "romantic" | "classic" | "trending" | "sad";

export interface MoodCapsule {
  id: MoodKey;
  title: string;
  desc: string;
  icon: "sparkles" | "mic" | "award" | "flame" | "heart";
}

/** Curated moods — each resolves to real tracks from the offline catalog or live trending. */
export const MOOD_CAPSULES: MoodCapsule[] = [
  { id: "ai_dj", title: "ميكس AI", desc: "توليد بحسب ذوقك", icon: "sparkles" },
  { id: "romantic", title: "روقان", desc: "هدوء وتركيز", icon: "mic" },
  { id: "classic", title: "طرب", desc: "روائع الزمن الجميل", icon: "award" },
  { id: "trending", title: "طاقة", desc: "الأكثر استماعاً الآن", icon: "flame" },
  { id: "sad", title: "حزن", desc: "أغاني المشاعر العميقة", icon: "heart" },
];

export interface SpotifyTrack {
  id: string;
  rank: number;
  francoTitle: string;
  francoArtist: string;
  arabicTitle: string;
  arabicArtist: string;
  youtubeVideoId: string;
  thumbnailUrl: string;
  duration: number;
  streams: string;
}

/** Top Spotify Arabic Mega-Hits with 100% Franco Titles & Artists */
export const SPOTIFY_TOP_ARABIC_HITS: SpotifyTrack[] = [
  {
    id: "sp_el_bakht",
    rank: 1,
    francoTitle: "El Bakht",
    francoArtist: "Wegz",
    arabicTitle: "البخت",
    arabicArtist: "ويجز",
    youtubeVideoId: "_RHIECWv728",
    thumbnailUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/56/7d/be/567dbe02-fc06-16be-f878-8aa652af26db/artwork.jpg/600x600bb.jpg",
    duration: 215,
    streams: "185M+",
  },
  {
    id: "sp_tamally_maak",
    rank: 2,
    francoTitle: "Tamally Maak",
    francoArtist: "Amr Diab",
    arabicTitle: "تملي معاك",
    arabicArtist: "عمرو دياب",
    youtubeVideoId: "jt4n_lu_7Ck",
    thumbnailUrl: "https://yt3.googleusercontent.com/pUe16NPzy38_YPtW-rFqzRJVrcFt0cWqJXKdJ391df5vvgZIjR5_nnCJNRVGjn8Y1bcYUnyC0-OZ5g=s1080",
    duration: 270,
    streams: "160M+",
  },
  {
    id: "sp_belbont_el3areed",
    rank: 3,
    francoTitle: "Belbont El 3areed",
    francoArtist: "Hussain Al Jassmi",
    arabicTitle: "بالبنط العريض",
    arabicArtist: "حسين الجسمي",
    youtubeVideoId: "fS0tY_1U22k",
    thumbnailUrl: "https://yt3.googleusercontent.com/ZzH7hr1UYqP05rs5JcPn9KGcJ8ZTqh0WUSOUO2Ltcu2CiAnBVwHhWFK-dW5w92cD51mVthPwlOiDdFE=s1080",
    duration: 232,
    streams: "142M+",
  },
  {
    id: "sp_bent_nas",
    rank: 4,
    francoTitle: "Bent Nas",
    francoArtist: "Ahmed Saad",
    arabicTitle: "بنت ناس",
    arabicArtist: "أحمد سعد",
    youtubeVideoId: "FPtmj_yiwVw",
    thumbnailUrl: "https://yt3.googleusercontent.com/D01_Fn8nqrsjHn1rIK6QUIaaPiFqux-3HETQvq7AaMzHkASoE4eNqkdRDMYHymTxDn2CxNBreWl5kuc=s1080",
    duration: 204,
    streams: "98M+",
  },
  {
    id: "sp_3_daqat",
    rank: 5,
    francoTitle: "3 Daqat",
    francoArtist: "Abu ft. Yousra",
    arabicTitle: "٣ دقات",
    arabicArtist: "أبو ويسرا",
    youtubeVideoId: "ejvpVhvKesM",
    thumbnailUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/d2/a6/a6/d2a6a66d-eb2c-e28d-f366-a724a2efd808/6221117018908.jpg/600x600bb.jpg",
    duration: 243,
    streams: "135M+",
  },
  {
    id: "sp_kalam_eneih",
    rank: 6,
    francoTitle: "Kalam Eneih",
    francoArtist: "Sherine",
    arabicTitle: "كلام عينيه",
    arabicArtist: "شيرين عبدالوهاب",
    youtubeVideoId: "pFnwWFd06C4",
    thumbnailUrl: "https://yt3.ggpht.com/ytc/AIdro_n5b8IzsJUTLPw_VbYvFiNhllRT325FanS2pA_Q1Ia7AoI=s1080",
    duration: 248,
    streams: "124M+",
  },
  {
    id: "sp_enta_el_haz",
    rank: 7,
    francoTitle: "Enta El Haz",
    francoArtist: "Amr Diab",
    arabicTitle: "إنت الحظ",
    arabicArtist: "عمرو دياب",
    youtubeVideoId: "n_3d1ApZRIU",
    thumbnailUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/ea/c0/4d/eac04d0a-9e41-fa44-255f-b255f611f035/196872488401.jpg/600x600bb.jpg",
    duration: 236,
    streams: "118M+",
  },
  {
    id: "sp_el_ghezala_ray2a",
    rank: 8,
    francoTitle: "El Ghezala Ray2a",
    francoArtist: "Karim Mahmoud Abdel Aziz",
    arabicTitle: "الغزالة رايقة",
    arabicArtist: "كريم محمود عبد العزيز",
    youtubeVideoId: "-kC9ZRTR6D4",
    thumbnailUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/b6/19/3e/b6193e0e-89ba-224e-102e-0b1c406a06e9/886449826308.jpg/600x600bb.jpg",
    duration: 198,
    streams: "112M+",
  },
  {
    id: "sp_el_youm_el_helw",
    rank: 9,
    francoTitle: "El Youm El Helw Dah",
    francoArtist: "Ahmed Saad",
    arabicTitle: "اليوم الحلو ده",
    arabicArtist: "أحمد سعد",
    youtubeVideoId: "gfB1exz-Suk",
    thumbnailUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/90/86/8a/90868aaa-b00d-ab3a-0237-681b31c948a5/196589297341.jpg/600x600bb.jpg",
    duration: 202,
    streams: "105M+",
  },
  {
    id: "sp_basrah_w_atooh",
    rank: 10,
    francoTitle: "Basrah W Atooh",
    francoArtist: "Cairokee",
    arabicTitle: "بسرح وأتوه",
    arabicArtist: "فرقة كايروكي",
    youtubeVideoId: "Y87ZPLf-0KQ",
    thumbnailUrl: "https://yt3.googleusercontent.com/79aRa7yEP9lwzdXUTG1e_EkvFR69Shmcl-GwWv4Lt0BvdemzABkFsdjYsrQD0Qp3rsvHG_6Wwf8IrOCo=s1080",
    duration: 265,
    streams: "96M+",
  },
  {
    id: "sp_nafsy_aollo",
    rank: 11,
    francoTitle: "Nafsy Aollo",
    francoArtist: "Hamaki",
    arabicTitle: "نفسي أقوله",
    arabicArtist: "محمد حماقي",
    youtubeVideoId: "vxC29Rddqi0",
    thumbnailUrl: "https://yt3.googleusercontent.com/B2hG1XbLTc8qP2peWYSSwLcHr2QgGSKNQe5A94Ev_If4N3lcEgEJqWoltQCXD36izmUQ3FW4dmacQNq9=s1080",
    duration: 242,
    streams: "89M+",
  },
  {
    id: "sp_haygely_mawgow3",
    rank: 12,
    francoTitle: "Haygely Mawgow3",
    francoArtist: "Tamer Ashour",
    arabicTitle: "هيجيلى موجوع",
    arabicArtist: "تامر عاشور",
    youtubeVideoId: "6r2nBhBUYHs",
    thumbnailUrl: "https://yt3.googleusercontent.com/f1Uz1r0LWOQY3Lrw6A-aigkEDeXakVyPfhOu1wlUpyLxoN7FTAGAOr4mX1GD8J0_nBjc4pgSsPCG1Oqy=s1080",
    duration: 211,
    streams: "94M+",
  },
];

export interface SuggestedPlaylist {
  id: string;
  title: string;
  subtitle: string;
  followers: string;
  coverUrl: string;
  song: Song;
}

/** Suggested Playlists for You matching the design reference */
export const SUGGESTED_PLAYLISTS: SuggestedPlaylist[] = [
  {
    id: "sug_summer",
    title: "صيف 2026",
    subtitle: "إيقاعات صيفية منعشة",
    followers: "670.6K متابع",
    coverUrl: "https://yt3.googleusercontent.com/pUe16NPzy38_YPtW-rFqzRJVrcFt0cWqJXKdJ391df5vvgZIjR5_nnCJNRVGjn8Y1bcYUnyC0-OZ5g=s1080",
    song: {
      id: "sp_tamally_maak",
      title: "Tamally Maak",
      artist: "Amr Diab",
      youtubeVideoId: "jt4n_lu_7Ck",
      thumbnailUrl: "https://yt3.googleusercontent.com/pUe16NPzy38_YPtW-rFqzRJVrcFt0cWqJXKdJ391df5vvgZIjR5_nnCJNRVGjn8Y1bcYUnyC0-OZ5g=s1080",
      duration: 270,
    },
  },
  {
    id: "sug_best",
    title: "أجمل الأغاني",
    subtitle: "أروع ما غنى نجوم العرب",
    followers: "392.2K متابع",
    coverUrl: "https://yt3.ggpht.com/ytc/AIdro_n5b8IzsJUTLPw_VbYvFiNhllRT325FanS2pA_Q1Ia7AoI=s1080",
    song: {
      id: "sp_kalam_eneih",
      title: "Kalam Eneih",
      artist: "Sherine",
      youtubeVideoId: "pFnwWFd06C4",
      thumbnailUrl: "https://yt3.ggpht.com/ytc/AIdro_n5b8IzsJUTLPw_VbYvFiNhllRT325FanS2pA_Q1Ia7AoI=s1080",
      duration: 248,
    },
  },
  {
    id: "sug_tarab",
    title: "سهرة طرب",
    subtitle: "ألحان الأصالة والزمن الجميل",
    followers: "189.4K متابع",
    coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music128/v4/38/61/f6/3861f6c5-a877-3f8c-46ae-425ebb18f750/5055373545134.png/600x600bb.jpg",
    song: {
      id: "sp_alf_leila",
      title: "Alf Leila We Leila",
      artist: "Om Kalthoum",
      youtubeVideoId: "pW_r5tUvH3U",
      thumbnailUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music128/v4/38/61/f6/3861f6c5-a877-3f8c-46ae-425ebb18f750/5055373545134.png/600x600bb.jpg",
      duration: 540,
    },
  },
  {
    id: "sug_feel",
    title: "مزيكا للشعور",
    subtitle: "أجواء الاسترخاء والتأمل",
    followers: "245.6K متابع",
    coverUrl: "https://yt3.googleusercontent.com/ZzH7hr1UYqP05rs5JcPn9KGcJ8ZTqh0WUSOUO2Ltcu2CiAnBVwHhWFK-dW5w92cD51mVthPwlOiDdFE=s1080",
    song: {
      id: "sp_belbont_el3areed",
      title: "Belbont El 3areed",
      artist: "Hussain Al Jassmi",
      youtubeVideoId: "fS0tY_1U22k",
      thumbnailUrl: "https://yt3.googleusercontent.com/ZzH7hr1UYqP05rs5JcPn9KGcJ8ZTqh0WUSOUO2Ltcu2CiAnBVwHhWFK-dW5w92cD51mVthPwlOiDdFE=s1080",
      duration: 232,
    },
  },
  {
    id: "sug_rap",
    title: "تراك وسين",
    subtitle: "أقوى هيتس الهيب هوب والراب",
    followers: "520.4K متابع",
    coverUrl: "https://lh3.googleusercontent.com/dDeoSKRY2HRJheBMncFbvFCPTSFvEvYRhuUDp3axspitmQtisTontP0WOTWzVOuGMOgp7hwVG9KwEZw=s1080",
    song: {
      id: "sp_el_bakht",
      title: "El Bakht",
      artist: "Wegz",
      youtubeVideoId: "_RHIECWv728",
      thumbnailUrl: "https://lh3.googleusercontent.com/dDeoSKRY2HRJheBMncFbvFCPTSFvEvYRhuUDp3axspitmQtisTontP0WOTWzVOuGMOgp7hwVG9KwEZw=s1080",
      duration: 215,
    },
  },
];

export interface RegionalChart {
  id: string;
  title: string;
  sub: string;
  flag: string;
  query: string;
  song: Song;
}

export const REGIONAL_CHARTS: RegionalChart[] = [
  {
    id: "top_egypt",
    title: "توب 50 مصر",
    sub: "الأعلى استماعاً في المحروسة",
    flag: "🇪🇬",
    query: "أغاني مصرية تريند 2026",
    song: {
      id: "sp_el_bakht",
      title: "El Bakht",
      artist: "Wegz",
      youtubeVideoId: "_RHIECWv728",
      thumbnailUrl: "https://lh3.googleusercontent.com/dDeoSKRY2HRJheBMncFbvFCPTSFvEvYRhuUDp3axspitmQtisTontP0WOTWzVOuGMOgp7hwVG9KwEZw=s1080",
      duration: 215,
    },
  },
  {
    id: "top_khaleeji",
    title: "توب 50 الخليج",
    sub: "أقوى أغاني الخليج والسعودية",
    flag: "🇸🇦",
    query: "أغاني خليجية تريند",
    song: {
      id: "sp_belbont_el3areed",
      title: "Belbont El 3areed",
      artist: "Hussain Al Jassmi",
      youtubeVideoId: "fS0tY_1U22k",
      thumbnailUrl: "https://yt3.googleusercontent.com/ZzH7hr1UYqP05rs5JcPn9KGcJ8ZTqh0WUSOUO2Ltcu2CiAnBVwHhWFK-dW5w92cD51mVthPwlOiDdFE=s1080",
      duration: 232,
    },
  },
  {
    id: "top_levant",
    title: "توب 50 بلاد الشام",
    sub: "أجمل ألحان لبنان والأردن وسوريا",
    flag: "🇱🇧",
    query: "أغاني شامية لبنانية",
    song: {
      id: "sp_wael_albint",
      title: "Al Bint El Qawiya",
      artist: "Wael Kfoury",
      youtubeVideoId: "JtDrB2h6C78",
      thumbnailUrl: "https://lh3.googleusercontent.com/DvPq0n9wSsXrPwtGc9A74aIgW1Gm9jLJV9WUig2GedpXtLz1EHTbceR5PRQoHIO75ds0hkXUBKkeCN8=s1080",
      duration: 210,
    },
  },
  {
    id: "top_maghreb",
    title: "توب 50 المغرب العربي",
    sub: "راي وإيقاعات المغرب والجزائر",
    flag: "🇲🇦",
    query: "راي وموسيقى مغاربية",
    song: {
      id: "sp_saad_lmjarred",
      title: "Ghaltana",
      artist: "Saad Lamjarred",
      youtubeVideoId: "cOzcBAoR1vU",
      thumbnailUrl: "https://i.ytimg.com/vi/cOzcBAoR1vU/hqdefault.jpg",
      duration: 240,
    },
  },
];

export interface ClassicMasterpiece {
  id: string;
  title: string;
  artist: string;
  year: string;
  coverUrl: string;
  song: Song;
}

export const GOLDEN_ERA_CLASSICS: ClassicMasterpiece[] = [
  {
    id: "classic_om_kalthoum",
    title: "ألف ليلة وليلة",
    artist: "أم كلثوم",
    year: "1969",
    coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music128/v4/38/61/f6/3861f6c5-a877-3f8c-46ae-425ebb18f750/5055373545134.png/600x600bb.jpg",
    song: {
      id: "cls_alf_leila",
      title: "ألف ليلة وليلة",
      artist: "أم كلثوم",
      youtubeVideoId: "B_w_t1U0-m8",
      thumbnailUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music128/v4/38/61/f6/3861f6c5-a877-3f8c-46ae-425ebb18f750/5055373545134.png/600x600bb.jpg",
      duration: 540,
    },
  },
  {
    id: "classic_abdel_halim",
    title: "قارئة الفنجان",
    artist: "عبد الحليم حافظ",
    year: "1976",
    coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music6/v4/31/ba/2e/31ba2e68-58d2-d3c7-9cbc-365c846a1b2f/dj.ocqqrslp.jpg/600x600bb.jpg",
    song: {
      id: "cls_qariat_el_fengan",
      title: "قارئة الفنجان",
      artist: "عبد الحليم حافظ",
      youtubeVideoId: "6u7Vb_v-p74",
      thumbnailUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music6/v4/31/ba/2e/31ba2e68-58d2-d3c7-9cbc-365c846a1b2f/dj.ocqqrslp.jpg/600x600bb.jpg",
      duration: 620,
    },
  },
  {
    id: "classic_fairuz",
    title: "نسم علينا الهوى",
    artist: "فيروز",
    year: "1967",
    coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/0a/f8/cd/0af8cd47-d6da-42be-3457-96ade9125f5c/6221216199195.png/600x600bb.jpg",
    song: {
      id: "cls_nasam_alayna",
      title: "نسم علينا الهوى",
      artist: "فيروز",
      youtubeVideoId: "d4e2rXWJg3Q",
      thumbnailUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music122/v4/0a/f8/cd/0af8cd47-d6da-42be-3457-96ade9125f5c/6221216199195.png/600x600bb.jpg",
      duration: 250,
    },
  },
  {
    id: "classic_warda",
    title: "بتونس بيك",
    artist: "وردة الجزائرية",
    year: "1992",
    coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/01/cf/6d/01cf6d47-e59d-2344-f604-46200a889701/dj.xoqowext.jpg/600x600bb.jpg",
    song: {
      id: "cls_batwanes_beek",
      title: "بتونس بيك",
      artist: "وردة الجزائرية",
      youtubeVideoId: "TcLlR200w7c",
      thumbnailUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/01/cf/6d/01cf6d47-e59d-2344-f604-46200a889701/dj.xoqowext.jpg/600x600bb.jpg",
      duration: 380,
    },
  },
];

export interface CatalogAlbum {
  id: string;
  title: string;
  artist: string;
  year: string;
  coverUrl: string;
  song: Song;
}

export const POPULAR_ALBUMS: CatalogAlbum[] = [
  {
    id: "amr_sahran",
    title: "سهران",
    artist: "عمرو دياب",
    year: "2020",
    coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/69/2f/b0/692fb07e-6ab9-467a-01f4-f12ec0a39a41/194660835758.jpg/600x600bb.jpg",
    song: {
      id: "alb_sahran_track",
      title: "سهران",
      artist: "عمرو دياب",
      albumName: "سهران",
      youtubeVideoId: "n_3d1ApZRIU",
      thumbnailUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/69/2f/b0/692fb07e-6ab9-467a-01f4-f12ec0a39a41/194660835758.jpg/600x600bb.jpg",
      duration: 230,
    },
  },
  {
    id: "tamer_aysh",
    title: "عيش بشوقك",
    artist: "تامر حسني",
    year: "2018",
    coverUrl: "https://yt3.googleusercontent.com/cSP4BHue5ZJT959SCuYn5rZaQSOI8fwSWgcM6ApFBngl-_mqlk2cUntE-k3fDYfFqsoZu_LIvQ=s1080",
    song: {
      id: "alb_aysh_track",
      title: "عيش بشوقك",
      artist: "تامر حسني",
      albumName: "عيش بشوقك",
      youtubeVideoId: "FPtmj_yiwVw",
      thumbnailUrl: "https://yt3.googleusercontent.com/cSP4BHue5ZJT959SCuYn5rZaQSOI8fwSWgcM6ApFBngl-_mqlk2cUntE-k3fDYfFqsoZu_LIvQ=s1080",
      duration: 215,
    },
  },
  {
    id: "sherine_nassay",
    title: "نساي",
    artist: "شيرين عبدالوهاب",
    year: "2018",
    coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/9d/7e/42/9d7e42a4-bb6a-17a3-8545-d7f3a75a3fdf/942835.jpg/600x600bb.jpg",
    song: {
      id: "alb_nassay_track",
      title: "نساي",
      artist: "شيرين عبدالوهاب",
      albumName: "نساي",
      youtubeVideoId: "cOzcBAoR1vU",
      thumbnailUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music114/v4/9d/7e/42/9d7e42a4-bb6a-17a3-8545-d7f3a75a3fdf/942835.jpg/600x600bb.jpg",
      duration: 220,
    },
  },
  {
    id: "hamaki_yafatni",
    title: "يا فاتني",
    artist: "محمد حماقي",
    year: "2021",
    coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/b0/08/97/b008972e-503f-45c0-aab9-2146ede56d8e/886449715237.jpg/600x600bb.jpg",
    song: {
      id: "alb_yafatni_track",
      title: "يا فاتني",
      artist: "محمد حماقي",
      albumName: "يا فاتني",
      youtubeVideoId: "vxC29Rddqi0",
      thumbnailUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music221/v4/b0/08/97/b008972e-503f-45c0-aab9-2146ede56d8e/886449715237.jpg/600x600bb.jpg",
      duration: 245,
    },
  },
  {
    id: "cairokee_roma",
    title: "روما",
    artist: "كايروكي",
    year: "2022",
    coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/46/81/82/468182bd-6914-bf7d-2f4a-4cb4bd5175cd/196925215671.jpg/600x600bb.jpg",
    song: {
      id: "alb_roma_track",
      title: "روما",
      artist: "كايروكي",
      albumName: "روما",
      youtubeVideoId: "Y87ZPLf-0KQ",
      thumbnailUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music112/v4/46/81/82/468182bd-6914-bf7d-2f4a-4cb4bd5175cd/196925215671.jpg/600x600bb.jpg",
      duration: 270,
    },
  },
  {
    id: "angham_teegi",
    title: "تيجي نسيب",
    artist: "أنغام",
    year: "2024",
    coverUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/58/80/aa/5880aa61-b353-3e7e-682b-3e43d5393f1c/cover.jpg/600x600bb.jpg",
    song: {
      id: "alb_teegi_track",
      title: "تيجي نسيب",
      artist: "أنغام",
      albumName: "تيجي نسيب",
      youtubeVideoId: "p2suBUZkUZI",
      thumbnailUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/58/80/aa/5880aa61-b353-3e7e-682b-3e43d5393f1c/cover.jpg/600x600bb.jpg",
      duration: 250,
    },
  },
];
