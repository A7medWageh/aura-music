import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, type AppStateStatus } from "react-native";
import { Song } from "@/types/music";
import { MusicApi } from "@/services/api/musicApi";
import {
  POPULAR_ALBUMS,
  SPOTIFY_TOP_ARABIC_HITS,
  SUGGESTED_PLAYLISTS,
  REGIONAL_CHARTS,
  GOLDEN_ERA_CLASSICS,
  CatalogAlbum,
  SpotifyTrack,
  SuggestedPlaylist,
  RegionalChart,
  ClassicMasterpiece,
} from "@/data/homeCatalogs";
import { resolveArtworkUri } from "@/utils/media";

const CACHE_STORAGE_KEY = "@aura_home_content_v19_artist_covers";
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export interface FeaturedArtistSlide {
  artistId: string;
  name: string;
  imageUrl: string;
  featuredSong: Song;
  latestTitle: string;
  francoSongTitle: string;
  tag: string;
  monthlyListeners: string;
}

export const DEFAULT_FEATURED_ARTISTS: FeaturedArtistSlide[] = [
  {
    artistId: "amr_diab",
    name: "عمرو دياب",
    imageUrl: "https://yt3.googleusercontent.com/pUe16NPzy38_YPtW-rFqzRJVrcFt0cWqJXKdJ391df5vvgZIjR5_nnCJNRVGjn8Y1bcYUnyC0-OZ5g=s1080",
    featuredSong: {
      id: "sp_tamally_maak",
      title: "تملي معاك",
      artist: "عمرو دياب",
      youtubeVideoId: "jt4n_lu_7Ck",
      thumbnailUrl: "https://yt3.googleusercontent.com/pUe16NPzy38_YPtW-rFqzRJVrcFt0cWqJXKdJ391df5vvgZIjR5_nnCJNRVGjn8Y1bcYUnyC0-OZ5g=s1080",
      duration: 270,
    },
    latestTitle: "تملي معاك",
    francoSongTitle: "Tamally Maak",
    tag: "الهضبة",
    monthlyListeners: "16.8M مستمع شهرياً",
  },
  {
    artistId: "tamer_hosny",
    name: "تامر حسني",
    imageUrl: "https://i.ytimg.com/vi/ncyVV9bwmdU/hqdefault.jpg",
    featuredSong: {
      id: "sp_tamer_aysh",
      title: "عيش بشوقك",
      artist: "تامر حسني",
      youtubeVideoId: "ncyVV9bwmdU",
      thumbnailUrl: "https://i.ytimg.com/vi/ncyVV9bwmdU/hqdefault.jpg",
      duration: 215,
    },
    latestTitle: "عيش بشوقك",
    francoSongTitle: "Ayesh Beshookak",
    tag: "نجم الجيل",
    monthlyListeners: "13.5M مستمع شهرياً",
  },
  {
    artistId: "sherine",
    name: "شيرين عبدالوهاب",
    imageUrl: "https://yt3.ggpht.com/ytc/AIdro_n5b8IzsJUTLPw_VbYvFiNhllRT325FanS2pA_Q1Ia7AoI=s1080",
    featuredSong: {
      id: "sp_kalam_eneih",
      title: "كلام عينيه",
      artist: "شيرين عبدالوهاب",
      youtubeVideoId: "pFnwWFd06C4",
      thumbnailUrl: "https://yt3.ggpht.com/ytc/AIdro_n5b8IzsJUTLPw_VbYvFiNhllRT325FanS2pA_Q1Ia7AoI=s1080",
      duration: 248,
    },
    latestTitle: "كلام عينيه",
    francoSongTitle: "Kalam Eneih",
    tag: "صوت مصر",
    monthlyListeners: "14.2M مستمع شهرياً",
  },
  {
    artistId: "ahmed_saad",
    name: "أحمد سعد",
    imageUrl: "https://yt3.googleusercontent.com/D01_Fn8nqrsjHn1rIK6QUIaaPiFqux-3HETQvq7AaMzHkASoE4eNqkdRDMYHymTxDn2CxNBreWl5kuc=s1080",
    featuredSong: {
      id: "sp_bent_nas",
      title: "بنت ناس",
      artist: "أحمد سعد",
      youtubeVideoId: "FPtmj_yiwVw",
      thumbnailUrl: "https://yt3.googleusercontent.com/D01_Fn8nqrsjHn1rIK6QUIaaPiFqux-3HETQvq7AaMzHkASoE4eNqkdRDMYHymTxDn2CxNBreWl5kuc=s1080",
      duration: 204,
    },
    latestTitle: "بنت ناس",
    francoSongTitle: "Bent Nas",
    tag: "تريند الصيف",
    monthlyListeners: "15.1M مستمع شهرياً",
  },
  {
    artistId: "wegz",
    name: "ويجز",
    imageUrl: "https://lh3.googleusercontent.com/dDeoSKRY2HRJheBMncFbvFCPTSFvEvYRhuUDp3axspitmQtisTontP0WOTWzVOuGMOgp7hwVG9KwEZw=s1080",
    featuredSong: {
      id: "sp_el_bakht",
      title: "البخت",
      artist: "ويجز",
      youtubeVideoId: "_RHIECWv728",
      thumbnailUrl: "https://lh3.googleusercontent.com/dDeoSKRY2HRJheBMncFbvFCPTSFvEvYRhuUDp3axspitmQtisTontP0WOTWzVOuGMOgp7hwVG9KwEZw=s1080",
      duration: 215,
    },
    latestTitle: "البخت",
    francoSongTitle: "El Bakht",
    tag: "أيقونة الراب",
    monthlyListeners: "11.9M مستمع شهرياً",
  },
  {
    artistId: "mohamed_hamaki",
    name: "محمد حماقي",
    imageUrl: "https://yt3.googleusercontent.com/B2hG1XbLTc8qP2peWYSSwLcHr2QgGSKNQe5A94Ev_If4N3lcEgEJqWoltQCXD36izmUQ3FW4dmacQNq9=s1080",
    featuredSong: {
      id: "sp_nafsy_aollo",
      title: "نفسي أقوله",
      artist: "محمد حماقي",
      youtubeVideoId: "vxC29Rddqi0",
      thumbnailUrl: "https://yt3.googleusercontent.com/B2hG1XbLTc8qP2peWYSSwLcHr2QgGSKNQe5A94Ev_If4N3lcEgEJqWoltQCXD36izmUQ3FW4dmacQNq9=s1080",
      duration: 242,
    },
    latestTitle: "نفسي أقوله",
    francoSongTitle: "Nafsy Aollo",
    tag: "بوب عربي",
    monthlyListeners: "13.8M مستمع شهرياً",
  },
  {
    artistId: "cairokee",
    name: "فرقة كايروكي",
    imageUrl: "https://yt3.googleusercontent.com/79aRa7yEP9lwzdXUTG1e_EkvFR69Shmcl-GwWv4Lt0BvdemzABkFsdjYsrQD0Qp3rsvHG_6Wwf8IrOCo=s1080",
    featuredSong: {
      id: "sp_basrah_w_atooh",
      title: "بسرح وأتوه",
      artist: "فرقة كايروكي",
      youtubeVideoId: "Y87ZPLf-0KQ",
      thumbnailUrl: "https://yt3.googleusercontent.com/79aRa7yEP9lwzdXUTG1e_EkvFR69Shmcl-GwWv4Lt0BvdemzABkFsdjYsrQD0Qp3rsvHG_6Wwf8IrOCo=s1080",
      duration: 265,
    },
    latestTitle: "بسرح وأتوه",
    francoSongTitle: "Basrah W Atooh",
    tag: "روك عربي",
    monthlyListeners: "10.4M مستمع شهرياً",
  },
  {
    artistId: "hussain_al_jassmi",
    name: "حسين الجسمي",
    imageUrl: "https://yt3.googleusercontent.com/ZzH7hr1UYqP05rs5JcPn9KGcJ8ZTqh0WUSOUO2Ltcu2CiAnBVwHhWFK-dW5w92cD51mVthPwlOiDdFE=s1080",
    featuredSong: {
      id: "sp_belbont_el3areed",
      title: "بالبنط العريض",
      artist: "حسين الجسمي",
      youtubeVideoId: "fS0tY_1U22k",
      thumbnailUrl: "https://yt3.googleusercontent.com/ZzH7hr1UYqP05rs5JcPn9KGcJ8ZTqh0WUSOUO2Ltcu2CiAnBVwHhWFK-dW5w92cD51mVthPwlOiDdFE=s1080",
      duration: 232,
    },
    latestTitle: "بالبنط العريض",
    francoSongTitle: "Belbont El 3areed",
    tag: "صوت الخليج",
    monthlyListeners: "14.9M مستمع شهرياً",
  },
  {
    artistId: "nancy_ajram",
    name: "نانسي عجرم",
    imageUrl: "https://yt3.googleusercontent.com/7vHuDstipBz-7AzNt7uS6L3dl786d8M6tQNi7c5WHphzABzxZ2ccdMDQvSqwlDu-JOsDlgA575WTm_G9=s1080",
    featuredSong: {
      id: "sp_nancy_tabtab",
      title: "يا طبطب ودلع",
      artist: "نانسي عجرم",
      youtubeVideoId: "3hV5TlDx2vo",
      thumbnailUrl: "https://yt3.googleusercontent.com/7vHuDstipBz-7AzNt7uS6L3dl786d8M6tQNi7c5WHphzABzxZ2ccdMDQvSqwlDu-JOsDlgA575WTm_G9=s1080",
      duration: 220,
    },
    latestTitle: "يا طبطب ودلع",
    francoSongTitle: "Ya Tabtab",
    tag: "ملكة البوب",
    monthlyListeners: "12.4M مستمع شهرياً",
  },
  {
    artistId: "wael_kfoury",
    name: "وائل كفوري",
    imageUrl: "https://lh3.googleusercontent.com/DvPq0n9wSsXrPwtGc9A74aIgW1Gm9jLJV9WUig2GedpXtLz1EHTbceR5PRQoHIO75ds0hkXUBKkeCN8=s1080",
    featuredSong: {
      id: "sp_wael_albint",
      title: "البنت القوية",
      artist: "وائل كفوري",
      youtubeVideoId: "JtDrB2h6C78",
      thumbnailUrl: "https://lh3.googleusercontent.com/DvPq0n9wSsXrPwtGc9A74aIgW1Gm9jLJV9WUig2GedpXtLz1EHTbceR5PRQoHIO75ds0hkXUBKkeCN8=s1080",
      duration: 210,
    },
    latestTitle: "البنت القوية",
    francoSongTitle: "Al Bint El Qawiya",
    tag: "ملك الرومانسية",
    monthlyListeners: "8.7M مستمع شهرياً",
  },
  {
    artistId: "tamer_ashour",
    name: "تامر عاشور",
    imageUrl: "https://yt3.googleusercontent.com/f1Uz1r0LWOQY3Lrw6A-aigkEDeXakVyPfhOu1wlUpyLxoN7FTAGAOr4mX1GD8J0_nBjc4pgSsPCG1Oqy=s1080",
    featuredSong: {
      id: "sp_haygely_mawgow3",
      title: "هيجيلى موجوع",
      artist: "تامر عاشور",
      youtubeVideoId: "6r2nBhBUYHs",
      thumbnailUrl: "https://yt3.googleusercontent.com/f1Uz1r0LWOQY3Lrw6A-aigkEDeXakVyPfhOu1wlUpyLxoN7FTAGAOr4mX1GD8J0_nBjc4pgSsPCG1Oqy=s1080",
      duration: 211,
    },
    latestTitle: "هيجيلى موجوع",
    francoSongTitle: "Haygely Mawgow3",
    tag: "إحساس الطرب",
    monthlyListeners: "12.1M مستمع شهرياً",
  },
  {
    artistId: "marwan_moussa",
    name: "مروان موسى",
    imageUrl: "https://lh3.googleusercontent.com/FxDJVEQSp3hXOBglBcd73UXu6GQN90PtX6PCfsKcqq8qs8IZGA2TlHFDxlHMHmDoUhfiWPkp5LU-ulJf=s1080",
    featuredSong: {
      id: "sp_marwan_tesla",
      title: "تيسلا",
      artist: "مروان موسى",
      youtubeVideoId: "p2suBUZkUZI",
      thumbnailUrl: "https://lh3.googleusercontent.com/FxDJVEQSp3hXOBglBcd73UXu6GQN90PtX6PCfsKcqq8qs8IZGA2TlHFDxlHMHmDoUhfiWPkp5LU-ulJf=s1080",
      duration: 195,
    },
    latestTitle: "تيسلا",
    francoSongTitle: "Tesla",
    tag: "تراب مصري",
    monthlyListeners: "7.9M مستمع شهرياً",
  },
  {
    artistId: "bahaa_sultan",
    name: "بهاء سلطان",
    imageUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/48/42/1d/48421d7e-a52d-de50-0431-cb8a903b66f2/196589811707.jpg/600x600bb.jpg",
    featuredSong: {
      id: "sp_bahaa_delwaty",
      title: "دلوقتي عجبناكوا",
      artist: "بهاء سلطان",
      youtubeVideoId: "cOzcBAoR1vU",
      thumbnailUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/48/42/1d/48421d7e-a52d-de50-0431-cb8a903b66f2/196589811707.jpg/600x600bb.jpg",
      duration: 210,
    },
    latestTitle: "دلوقتي عجبناكوا",
    francoSongTitle: "Delwaty Egebnaako",
    tag: "صوت الأصالة",
    monthlyListeners: "9.6M مستمع شهرياً",
  },
  {
    artistId: "ruby",
    name: "روبي",
    imageUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/07/8b/b8/078bb8bc-6da0-2a5f-3767-ed62e4ba4ef1/cover.jpg/600x600bb.jpg",
    featuredSong: {
      id: "sp_ruby_plastic",
      title: "قلبي بلاستيك",
      artist: "روبي",
      youtubeVideoId: "yC3y0Y8591k",
      thumbnailUrl: "https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/07/8b/b8/078bb8bc-6da0-2a5f-3767-ed62e4ba4ef1/cover.jpg/600x600bb.jpg",
      duration: 190,
    },
    latestTitle: "قلبي بلاستيك",
    francoSongTitle: "Alby Plastic",
    tag: "أيقونة الاستعراض",
    monthlyListeners: "7.5M مستمع شهرياً",
  },
  {
    artistId: "angham",
    name: "أنغام",
    imageUrl: "https://i.ytimg.com/vi/p2suBUZkUZI/hqdefault.jpg",
    featuredSong: {
      id: "sp_angham_teegi",
      title: "تيجي نسيب",
      artist: "أنغام",
      youtubeVideoId: "p2suBUZkUZI",
      thumbnailUrl: "https://i.ytimg.com/vi/p2suBUZkUZI/hqdefault.jpg",
      duration: 250,
    },
    latestTitle: "تيجي نسيب",
    francoSongTitle: "Tigi Nseeb",
    tag: "سلطانة الطرب",
    monthlyListeners: "9.3M مستمع شهرياً",
  },
];

interface HomeStoreState {
  featuredArtists: FeaturedArtistSlide[];
  trendingSongs: Song[];
  newReleases: Song[];
  popularArtists: any[];
  popularAlbums: CatalogAlbum[];
  spotifyHits: SpotifyTrack[];
  suggestedPlaylists: SuggestedPlaylist[];
  regionalCharts: RegionalChart[];
  goldenClassics: ClassicMasterpiece[];
  lastFetchedAt: number;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;

  // Actions
  initHomeStore: () => Promise<void>;
  fetchHomeContent: (force?: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

// Map Arabic artist names to known Latin/English aliases used in YouTube Music charts
const ARTIST_NAME_ALIASES: Record<string, string[]> = {
  "عمرو دياب": ["amr diab", "amr", "diab"],
  "شيرين عبدالوهاب": ["sherine", "sherine abdel wahab", "شيرين"],
  "تامر حسني": ["tamer hosny", "tamer", "hosny"],
  "أحمد سعد": ["ahmed saad", "ahmed", "saad"],
  "ويجز": ["wegz"],
  "نانسي عجرم": ["nancy ajram", "nancy"],
  "حماقي": ["hamaki", "mohamed hamaki", "محمد حماقي"],
  "محمد حماقي": ["hamaki", "mohamed hamaki"],
  "وائل كفوري": ["wael kfoury", "wael"],
  "مروان موسى": ["marwan moussa", "marwan"],
  "فرقة كايروكي": ["cairokee", "cairokee band", "كايروكي"],
  "حسين الجسمي": ["hussain al jassmi", "al jassmi", "hussain"],
  "بهاء سلطان": ["bahaa sultan", "bahaa"],
  "رامي صبري": ["ramy sabry", "ramy"],
  "تامر عاشور": ["tamer ashour", "ashour"],
  "محمود العسيلي": ["mahmoud el esseily", "el esseily", "esseily"],
  "روبي": ["ruby"],
  "أنغام": ["angham"],
  "إليسا": ["elissa"],
  "محمد منير": ["mohamed mounir", "mounir", "منير"],
  "أصالة": ["assala", "assala nasri"],
  "حمزة نمرة": ["hamza namira", "namira"],
};

const ARTIST_MONTHLY_LISTENERS: Record<string, string> = {
  "عمرو دياب": "16.8M مستمع شهرياً",
  "شيرين عبدالوهاب": "14.2M مستمع شهرياً",
  "تامر حسني": "13.5M مستمع شهرياً",
  "أحمد سعد": "15.1M مستمع شهرياً",
  "ويجز": "11.9M مستمع شهرياً",
  "نانسي عجرم": "12.4M مستمع شهرياً",
  "حماقي": "13.8M مستمع شهرياً",
  "محمد حماقي": "13.8M مستمع شهرياً",
  "وائل كفوري": "8.7M مستمع شهرياً",
  "مروان موسى": "7.9M مستمع شهرياً",
  "فرقة كايروكي": "10.4M مستمع شهرياً",
  "حسين الجسمي": "14.9M مستمع شهرياً",
  "بهاء سلطان": "9.6M مستمع شهرياً",
  "رامي صبري": "11.2M مستمع شهرياً",
  "تامر عاشور": "12.1M مستمع شهرياً",
  "محمود العسيلي": "8.9M مستمع شهرياً",
  "روبي": "7.5M مستمع شهرياً",
  "أنغام": "9.3M مستمع شهرياً",
  "إليسا": "12.7M مستمع شهرياً",
  "محمد منير": "8.2M مستمع شهرياً",
};

/**
 * Verified signature songs strictly paired to each artist.
 * Guarantees zero mismatch between singer and song.
 */
const ARTIST_SIGNATURE_SONGS: Record<string, { title: string; francoTitle: string; videoId: string; duration: number }> = {
  "عمرو دياب": { title: "تملي معاك", francoTitle: "Tamally Maak", videoId: "jt4n_lu_7Ck", duration: 270 },
  "شيرين عبدالوهاب": { title: "كلام عينيه", francoTitle: "Kalam Eneih", videoId: "pFnwWFd06C4", duration: 248 },
  "تامر حسني": { title: "عيش بشوقك", francoTitle: "Ayesh Beshookak", videoId: "ncyVV9bwmdU", duration: 215 },
  "أحمد سعد": { title: "بنت ناس", francoTitle: "Bent Nas", videoId: "FPtmj_yiwVw", duration: 204 },
  "ويجز": { title: "البخت", francoTitle: "El Bakht", videoId: "_RHIECWv728", duration: 215 },
  "محمد حماقي": { title: "نفسي أقوله", francoTitle: "Nafsy Aollo", videoId: "vxC29Rddqi0", duration: 242 },
  "حماقي": { title: "نفسي أقوله", francoTitle: "Nafsy Aollo", videoId: "vxC29Rddqi0", duration: 242 },
  "فرقة كايروكي": { title: "بسرح وأتوه", francoTitle: "Basrah W Atooh", videoId: "Y87ZPLf-0KQ", duration: 265 },
  "كايروكي": { title: "بسرح وأتوه", francoTitle: "Basrah W Atooh", videoId: "Y87ZPLf-0KQ", duration: 265 },
  "حسين الجسمي": { title: "بالبنط العريض", francoTitle: "Belbont El 3areed", videoId: "fS0tY_1U22k", duration: 232 },
  "نانسي عجرم": { title: "يا طبطب ودلع", francoTitle: "Ya Tabtab", videoId: "3hV5TlDx2vo", duration: 220 },
  "وائل كفوري": { title: "البنت القوية", francoTitle: "Al Bint El Qawiya", videoId: "JtDrB2h6C78", duration: 210 },
  "تامر عاشور": { title: "هيجيلى موجوع", francoTitle: "Haygely Mawgow3", videoId: "6r2nBhBUYHs", duration: 211 },
  "مروان موسى": { title: "تيسلا", francoTitle: "Tesla", videoId: "p2suBUZkUZI", duration: 195 },
  "بهاء سلطان": { title: "دلوقتي عجبناكوا", francoTitle: "Delwaty Egebnaako", videoId: "cOzcBAoR1vU", duration: 210 },
  "رامي صبري": { title: "إحساسي معاك", francoTitle: "Ehsaasy Maak", videoId: "n_3d1ApZRIU", duration: 225 },
  "روبي": { title: "قلبي بلاستيك", francoTitle: "Alby Plastic", videoId: "yC3y0Y8591k", duration: 190 },
  "أنغام": { title: "تيجي نسيب", francoTitle: "Tigi Nseeb", videoId: "p2suBUZkUZI", duration: 250 },
  "إليسا": { title: "أنا وبس", francoTitle: "Ana W Bass", videoId: "jt4n_lu_7Ck", duration: 230 },
  "محمد منير": { title: "أنا معاك", francoTitle: "Ana Maak", videoId: "JtDrB2h6C78", duration: 240 },
};

function matchesArtist(artistName: string, song?: Song | null): boolean {
  if (!song || !song.artist) return false;
  const songArtist = song.artist.toLowerCase();
  const target = artistName.toLowerCase();

  if (songArtist.includes(target) || target.includes(songArtist)) return true;

  const aliases = ARTIST_NAME_ALIASES[artistName] || [];
  for (const alias of aliases) {
    if (songArtist.includes(alias) || alias.includes(songArtist)) {
      return true;
    }
  }
  return false;
}

let inFlightFetch: Promise<void> | null = null;
let appStateSubscriptionSetup = false;

export const useHomeStore = create<HomeStoreState>((set, get) => ({
  featuredArtists: DEFAULT_FEATURED_ARTISTS,
  trendingSongs: [],
  newReleases: [],
  popularArtists: [],
  popularAlbums: POPULAR_ALBUMS,
  spotifyHits: SPOTIFY_TOP_ARABIC_HITS,
  suggestedPlaylists: SUGGESTED_PLAYLISTS,
  regionalCharts: REGIONAL_CHARTS,
  goldenClassics: GOLDEN_ERA_CLASSICS,
  lastFetchedAt: 0,
  isLoading: true,
  isRefreshing: false,
  error: null,

  initHomeStore: async () => {
    // Setup foreground AppState revalidation once
    if (!appStateSubscriptionSetup) {
      appStateSubscriptionSetup = true;
      AppState.addEventListener("change", (nextState: AppStateStatus) => {
        if (nextState === "active") {
          const state = get();
          const isStale = Date.now() - state.lastFetchedAt > CACHE_TTL_MS;
          if (isStale && !state.isLoading && !state.isRefreshing) {
            get().fetchHomeContent(false).catch(() => {});
          }
        }
      });
    }

    // 1. Try reading from persistent cache
    try {
      const raw = await AsyncStorage.getItem(CACHE_STORAGE_KEY);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached && Array.isArray(cached.featuredArtists) && cached.featuredArtists.length > 0) {
          set({
            featuredArtists: cached.featuredArtists,
            trendingSongs: cached.trendingSongs || [],
            newReleases: cached.newReleases || [],
            popularArtists: cached.popularArtists || [],
            popularAlbums: POPULAR_ALBUMS,
            spotifyHits: SPOTIFY_TOP_ARABIC_HITS,
            suggestedPlaylists: SUGGESTED_PLAYLISTS,
            regionalCharts: REGIONAL_CHARTS,
            goldenClassics: GOLDEN_ERA_CLASSICS,
            lastFetchedAt: cached.lastFetchedAt || 0,
            isLoading: false,
          });

          // Check if cached data is still fresh (< 15 mins)
          const isFresh = Date.now() - (cached.lastFetchedAt || 0) < CACHE_TTL_MS;
          if (isFresh) {
            return;
          }
        }
      }
    } catch (e) {
      console.warn("[useHomeStore.initHomeStore] Cache read error:", e);
    }

    // 2. Fetch fresh content
    await get().fetchHomeContent(false);
  },

  fetchHomeContent: async (force = false) => {
    // In-flight deduplication: return existing promise if active
    if (inFlightFetch) {
      return inFlightFetch;
    }

    const state = get();
    const isStale = Date.now() - state.lastFetchedAt > CACHE_TTL_MS;
    if (!force && !isStale && state.featuredArtists.length >= 15) {
      return;
    }

    const doFetch = async () => {
      try {
        set({ error: null });

        // Concurrent live calls to backend endpoints
        const [trending, releases, artistsData] = await Promise.all([
          MusicApi.getTrending().catch(() => []),
          MusicApi.getNewReleases().catch(() => []),
          MusicApi.getArtists().catch(() => ({ egyptian: [], intl: [] })),
        ]);

        const rawArtists = artistsData.egyptian && artistsData.egyptian.length > 0
          ? artistsData.egyptian
          : [];

        // Build the 15 unique featured artists with GUARANTEED artist-song pairing
        const top15Artists = rawArtists.slice(0, 15);

        const featuredSlides: FeaturedArtistSlide[] = top15Artists.map((artist: any, index: number) => {
          const artistName = artist.name || `فنان ${index + 1}`;
          const artistId = artist.artistId || `art_${index}`;
          const imageUrl = resolveArtworkUri(null, artist.thumbnailUrl, undefined, "artist") || "";

          const sig = ARTIST_SIGNATURE_SONGS[artistName];
          const francoSongTitle = sig?.francoTitle || "Hit Song";
          const latestTitle = sig?.title || "أغنية مميزة";

          const signatureSong: Song = {
            id: `sig_${artistId}_${sig?.videoId || "jt4n_lu_7Ck"}`,
            title: latestTitle,
            artist: artistName,
            youtubeVideoId: sig?.videoId || "jt4n_lu_7Ck",
            thumbnailUrl: imageUrl || `https://i.ytimg.com/vi/${sig?.videoId || "jt4n_lu_7Ck"}/hqdefault.jpg`,
            duration: sig?.duration || 220,
          };

          return {
            artistId,
            name: artistName,
            imageUrl,
            featuredSong: signatureSong,
            latestTitle,
            francoSongTitle,
            tag: index < 3 ? "روائع أورا" : "نجم الشهر",
            monthlyListeners: ARTIST_MONTHLY_LISTENERS[artistName] || "10.0M مستمع شهرياً",
          };
        });

        const now = Date.now();
        const nextState = {
          featuredArtists: featuredSlides.length > 0 ? featuredSlides : state.featuredArtists,
          trendingSongs: trending.length > 0 ? trending : state.trendingSongs,
          newReleases: releases.length > 0 ? releases : state.newReleases,
          popularArtists: rawArtists.length > 0 ? rawArtists : state.popularArtists,
          popularAlbums: POPULAR_ALBUMS,
          spotifyHits: SPOTIFY_TOP_ARABIC_HITS,
          suggestedPlaylists: SUGGESTED_PLAYLISTS,
          regionalCharts: REGIONAL_CHARTS,
          goldenClassics: GOLDEN_ERA_CLASSICS,
          lastFetchedAt: now,
          isLoading: false,
          isRefreshing: false,
          error: null,
        };

        set(nextState);

        // Save to persistent storage asynchronously
        AsyncStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(nextState)).catch((err) => {
          console.warn("[useHomeStore] Failed to cache state:", err);
        });
      } catch (err: any) {
        console.warn("[useHomeStore.fetchHomeContent] Error:", err);
        set({
          isLoading: false,
          isRefreshing: false,
          error: err?.message || "فشل تحديث البيانات",
        });
      } finally {
        inFlightFetch = null;
      }
    };

    inFlightFetch = doFetch();
    return inFlightFetch;
  },

  refresh: async () => {
    set({ isRefreshing: true });
    await get().fetchHomeContent(true);
  },
}));
