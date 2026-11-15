// Live TV (owner decision: curated, official, https only). Every entry is a free live stream the broadcaster itself
// publishes, on a host that belongs to the broadcaster (its own domain or its own named CDN host). Each one was checked
// on the verifiedAt date: https end to end, a valid HLS playlist, and CORS that lets myfitbike.com and localhost play
// it in the browser. Aggregators and rebroadcasters (FAST services, IPTV resellers, unknown CDNs) are never added.
// Source of candidates: the public iptv-org index; inclusion is our own check. No logos or artwork (project rule).

export type TvCategory = 'news' | 'business' | 'sport' | 'documentary' | 'public affairs';
export type TvChannel = {
  id: string; name: string; owner: string; country: string; language: string; category: TvCategory;
  url: string; verifiedAt: string;
};

/** Hosts we accept, each owned by the broadcaster named in `owner`. Adding a channel on any other host fails the tests. */
export const OFFICIAL_HOSTS: Record<string, string> = {
  'dwamdstream102.akamaized.net': 'Deutsche Welle', 'dwamdstream104.akamaized.net': 'Deutsche Welle',
  'live.france24.com': 'France Médias Monde',
  'cdn-euronews.akamaized.net': 'Euronews',
  'media-tyo.hls.nhkworld.jp': 'NHK',
  'tv-trtworld.medya.trt.com.tr': 'TRT',
  'cbsn-us.cbsnstream.cbsnews.com': 'CBS News',
  'www.bloomberg.com': 'Bloomberg',
  'english-livebkali.cgtn.com': 'CGTN',
  'rbmn-live.akamaized.net': 'Red Bull Media House',
  'tagesschau.akamaized.net': 'ARD',
  'web-ndtv24x7-us.akamaized.net': 'NDTV', 'ndtvprofit.akamaized.net': 'NDTV',
  'playhls.media.nic.in': 'Sansad TV (Government of India)',
  'stream.skynewsarabia.com': 'Sky News Arabia',
};

const V = '2026-11-15';
export const CHANNELS: TvChannel[] = [
  { id: 'dw-english', name: 'DW English', owner: 'Deutsche Welle', country: 'DE', language: 'English', category: 'news', url: 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/master.m3u8', verifiedAt: V },
  { id: 'france24-english', name: 'France 24 English', owner: 'France Médias Monde', country: 'FR', language: 'English', category: 'news', url: 'https://live.france24.com/hls/live/2037218/F24_EN_HI_HLS/master_2300.m3u8', verifiedAt: V },
  { id: 'euronews-english', name: 'Euronews English', owner: 'Euronews', country: 'FR', language: 'English', category: 'news', url: 'https://cdn-euronews.akamaized.net/live/eds/euronews-en/25002/index.m3u8', verifiedAt: V },
  { id: 'africanews-english', name: 'Africanews', owner: 'Euronews', country: 'CG', language: 'English', category: 'news', url: 'https://cdn-euronews.akamaized.net/live/eds/africanews-en/25049/index.m3u8', verifiedAt: V },
  { id: 'nhk-world', name: 'NHK World-Japan', owner: 'NHK', country: 'JP', language: 'English', category: 'news', url: 'https://media-tyo.hls.nhkworld.jp/hls/w/live/master.m3u8', verifiedAt: V },
  { id: 'trt-world', name: 'TRT World', owner: 'TRT', country: 'TR', language: 'English', category: 'news', url: 'https://tv-trtworld.medya.trt.com.tr/master.m3u8', verifiedAt: V },
  { id: 'cbs-news-247', name: 'CBS News 24/7', owner: 'CBS News', country: 'US', language: 'English', category: 'news', url: 'https://cbsn-us.cbsnstream.cbsnews.com/out/v1/55a8648e8f134e82a470f83d562deeca/master.m3u8', verifiedAt: V },
  { id: 'cgtn', name: 'CGTN', owner: 'CGTN', country: 'CN', language: 'English', category: 'news', url: 'https://english-livebkali.cgtn.com/live/encgtn.m3u8', verifiedAt: V },
  { id: 'ndtv-24x7', name: 'NDTV 24x7', owner: 'NDTV', country: 'IN', language: 'English', category: 'news', url: 'https://web-ndtv24x7-us.akamaized.net/hls/live/2109282/ndtv24x7us/master.m3u8', verifiedAt: V },
  { id: 'bloomberg-us', name: 'Bloomberg TV', owner: 'Bloomberg', country: 'US', language: 'English', category: 'business', url: 'https://www.bloomberg.com/media-manifest/streams/us.m3u8', verifiedAt: V },
  { id: 'ndtv-profit', name: 'NDTV Profit', owner: 'NDTV', country: 'IN', language: 'English', category: 'business', url: 'https://ndtvprofit.akamaized.net/hls/live/2107404/ndtvprofit/master_1.m3u8', verifiedAt: V },
  { id: 'red-bull-tv', name: 'Red Bull TV', owner: 'Red Bull Media House', country: 'AT', language: 'English', category: 'sport', url: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8', verifiedAt: V },
  { id: 'cgtn-documentary', name: 'CGTN Documentary', owner: 'CGTN', country: 'CN', language: 'English', category: 'documentary', url: 'https://english-livebkali.cgtn.com/live/doccgtn.m3u8', verifiedAt: V },
  { id: 'sansad-tv-1', name: 'Sansad TV 1', owner: 'Sansad TV (Government of India)', country: 'IN', language: 'Hindi', category: 'public affairs', url: 'https://playhls.media.nic.in/hls/live/lstv/lstv.m3u8', verifiedAt: V },
  { id: 'sansad-tv-2', name: 'Sansad TV 2', owner: 'Sansad TV (Government of India)', country: 'IN', language: 'Hindi', category: 'public affairs', url: 'https://playhls.media.nic.in/hls/live/rstv/rstv.m3u8', verifiedAt: V },
  { id: 'france24-french', name: 'France 24 (français)', owner: 'France Médias Monde', country: 'FR', language: 'French', category: 'news', url: 'https://live.france24.com/hls/live/2037179/F24_FR_HI_HLS/master_2300.m3u8', verifiedAt: V },
  { id: 'dw-espanol', name: 'DW Español', owner: 'Deutsche Welle', country: 'DE', language: 'Spanish', category: 'news', url: 'https://dwamdstream104.akamaized.net/hls/live/2015530/dwstream104/master.m3u8', verifiedAt: V },
  { id: 'euronews-spanish', name: 'Euronews Español', owner: 'Euronews', country: 'FR', language: 'Spanish', category: 'news', url: 'https://cdn-euronews.akamaized.net/live/eds/euronews-es/25053/index.m3u8', verifiedAt: V },
  { id: 'tagesschau24', name: 'tagesschau24', owner: 'ARD', country: 'DE', language: 'German', category: 'news', url: 'https://tagesschau.akamaized.net/hls/live/2020115/tagesschau/tagesschau_1/master.m3u8', verifiedAt: V },
  { id: 'skynews-arabia', name: 'Sky News Arabia', owner: 'Sky News Arabia', country: 'AE', language: 'Arabic', category: 'news', url: 'https://stream.skynewsarabia.com/hls/sna.m3u8', verifiedAt: V },
];

export const channelById = (id: string) => CHANNELS.find((c) => c.id === id);
export const CATEGORIES: TvCategory[] = ['news', 'business', 'sport', 'documentary', 'public affairs'];
export const LANGUAGES = [...new Set(CHANNELS.map((c) => c.language))];
