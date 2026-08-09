/**
 * 外部の地図アプリへ渡す URL を組み立てる。
 *
 * 方針(docs/ux-design.md §5.1):
 * 地図はアプリ内に埋め込まない。APIキー・利用規約・プライバシー申告のコストを
 * 招くうえ、旅行者は結局慣れたナビを使う。**既定のアプリをユーザーに選ばせて投げる。**
 *
 * 実装上の落とし穴:
 * `comgooglemaps` を Info.plist の `LSApplicationQueriesSchemes` に登録しないと、
 * Google マップが入っていても `canOpenURL` が false を返し、常に Web に落ちる。
 */
export type MapProvider = 'apple' | 'google';

export type TravelMode = 'walk' | 'transit' | 'drive';

export type MapPlace = {
  name?: string;
  lat?: number;
  lng?: number;
  /** ユーザーが貼った地図リンク。名前より優先する */
  url?: string;
};

/**
 * 地図リンクから座標を拾う。
 *
 * **貼られたリンクは「その店そのもの」を指している。**名前で検索すると
 * 同名の別の店に飛ぶ(「一蘭」「スターバックス」で経路が出せないのと同じ)。
 * 場所検索APIは使わない方針なので、URL に書いてある座標だけを見る。
 *
 * 拾える形:
 *   .../@34.9857,135.7588,17z        Google の場所ページ
 *   !3d34.9857!4d135.7588            Google の data= の中
 *   ?q= / ?query= / ?ll= / ?daddr=   数値が2つ並んでいるもの(Apple も同じ)
 *
 * 短縮 URL(maps.app.goo.gl)は開かないと分からない。**通信はしない**ので
 * 諦めて、リンクそのものを開くか名前に落ちる。
 */
export function coordsFromMapUrl(url: string): { lat: number; lng: number } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const at = /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/.exec(parsed.pathname + parsed.search);
  if (at) return check(Number(at[1]), Number(at[2]));

  const data = /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/.exec(parsed.pathname + parsed.search);
  if (data) return check(Number(data[1]), Number(data[2]));

  for (const key of ['q', 'query', 'll', 'daddr', 'sll', 'center']) {
    const value = parsed.searchParams.get(key);
    const pair = value && /^\s*(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/.exec(value);
    if (pair) return check(Number(pair[1]), Number(pair[2]));
  }
  return null;

  function check(lat: number, lng: number) {
    const ok = Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    return ok ? { lat, lng } : null;
  }
}

/**
 * 地図に渡す文字列。**地図リンク → 座標 → 名前**の順。
 * 名前を先に使うと、同名の別の場所へ案内してしまう。
 */
function query(place: MapPlace): string {
  const fromLink = place.url ? coordsFromMapUrl(place.url) : null;
  if (fromLink) return `${fromLink.lat},${fromLink.lng}`;
  if (place.lat !== undefined && place.lng !== undefined) {
    return `${place.lat},${place.lng}`;
  }
  return place.name?.trim() ?? '';
}

/** 予定に貼られたリンクのうち、地図のもの(最初の1本) */
export function mapLinkOf(
  links: readonly { url: string; label: LinkLabelId }[],
): string | undefined {
  return links.find((l) => l.label === 'map')?.url;
}

/** その地点を座標で指せるか。指せないなら、渡せるのは名前だけ */
function isPinned(place: MapPlace): boolean {
  if (place.url && coordsFromMapUrl(place.url)) return true;
  return place.lat !== undefined && place.lng !== undefined;
}

/**
 * 2地点の経路を**正確に**引けるか。
 *
 * **Googleマップアプリの「リンクをコピー」は短縮リンク(`maps.app.goo.gl`)**で、
 * 中に座標が入っていない。解決するには通信が要る ── しない方針なので、
 * 貼ってあっても座標は取れない。そのまま名前で経路を引くと、
 * 「一蘭」「市役所」で同名の別の場所へ案内してしまう。
 *
 * そこで UI 側はこれを見て、**正確に引けないなら経路をやめて
 * 目的地そのものを開く**(貼られたリンクは場所を確実に指しているので、
 * そこから1タップで現在地からの経路が出せる)。
 */
export function canRouteExactly(from: MapPlace, to: MapPlace): boolean {
  return isPinned(from) && isPinned(to);
}

const APPLE_MODE: Record<TravelMode, string> = { walk: 'w', transit: 'r', drive: 'd' };
const GOOGLE_MODE: Record<TravelMode, string> = {
  walk: 'walking',
  transit: 'transit',
  drive: 'driving',
};

/** 1地点を開く URL。`app` は端末にアプリが入っている前提の URL スキーム */
export function placeUrl(provider: MapProvider, place: MapPlace): { app: string; web: string } {
  /*
   * 座標が読めない地図リンク(短縮 URL など)は、**そのリンクを開く。**
   * 名前で引き直すより、ユーザーが貼ったものをそのまま開くほうが確実。
   * 既定の地図アプリの設定より、貼られたリンクを優先する ──
   * その1本を選んだのはユーザー自身なので。
   */
  if (place.url && coordsFromMapUrl(place.url) === null) {
    return { app: place.url, web: place.url };
  }

  const q = encodeURIComponent(query(place));
  const label = place.name ? encodeURIComponent(place.name) : '';

  if (provider === 'apple') {
    // Apple マップは https でもアプリが開く。web/app を分ける必要がない
    const url =
      place.lat !== undefined && place.lng !== undefined
        ? `https://maps.apple.com/?ll=${place.lat},${place.lng}${label ? `&q=${label}` : ''}`
        : `https://maps.apple.com/?q=${q}`;
    return { app: url, web: url };
  }

  return {
    app: `comgooglemaps://?q=${q}`,
    web: `https://www.google.com/maps/search/?api=1&query=${q}`,
  };
}

/** 2地点の経路。移動コネクタのタップで使う */
export function directionsUrl(
  provider: MapProvider,
  from: MapPlace,
  to: MapPlace,
  mode: TravelMode,
): { app: string; web: string } {
  const origin = encodeURIComponent(query(from));
  const destination = encodeURIComponent(query(to));

  if (provider === 'apple') {
    const url = `https://maps.apple.com/?saddr=${origin}&daddr=${destination}&dirflg=${APPLE_MODE[mode]}`;
    return { app: url, web: url };
  }

  const m = GOOGLE_MODE[mode];
  return {
    app: `comgooglemaps://?saddr=${origin}&daddr=${destination}&directionsmode=${m}`,
    web: `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=${m}`,
  };
}

/** `canOpenURL` に渡すスキーム。Info.plist の LSApplicationQueriesSchemes と揃える */
export const APP_SCHEMES: Record<MapProvider, string | null> = {
  apple: null, // 標準アプリなので問い合わせ不要
  google: 'comgooglemaps',
};

/* ────────── 移動時間の概算 ────────── */

/**
 * 直線距離(km)から移動手段を推定する。
 * **経路探索APIは使わない**(課金とプライバシー申告が増える)。
 * あくまで概算で、UI 側では必ず「約」を付けて出す。
 */
export function guessTravelMode(km: number): TravelMode {
  if (km <= 1.2) return 'walk';
  if (km <= 30) return 'transit';
  return 'drive';
}

/** 手段ごとの実効速度(km/h)。直線距離を道なりに換算する係数を織り込んである */
const SPEED_KMH: Record<TravelMode, number> = { walk: 3.6, transit: 22, drive: 30 };

export function estimateTravelMinutes(km: number, mode: TravelMode): number {
  const minutes = (km / SPEED_KMH[mode]) * 60;
  // 乗り換えや駐車の固定コスト
  const overhead = mode === 'walk' ? 0 : mode === 'transit' ? 8 : 5;
  return Math.max(1, Math.round(minutes + overhead));
}

/** 2地点の直線距離(km)。Haversine */
export function distanceKm(a: Required<Pick<MapPlace, 'lat' | 'lng'>>, b: Required<Pick<MapPlace, 'lat' | 'lng'>>): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/* ────────── リンクのラベル自動判定 ────────── */

export type LinkLabelId =
  | 'tabelog'
  | 'booking'
  | 'official'
  | 'photo'
  | 'album'
  | 'map'
  | 'other';

/**
 * **並び順に意味がある。** 上から順に当てて、最初に当たったものを採る。
 * アルバムを地図より先に置いてあるのは、`photos.google.com` が
 * 地図の規則(`google.*`)にも当たってしまうため。
 */
const LINK_RULES: ReadonlyArray<{ test: RegExp; id: LinkLabelId }> = [
  { test: /(^|\.)tabelog\.com$/i, id: 'tabelog' },
  {
    test: /(^|\.)(jalan\.net|travel\.rakuten\.co\.jp|booking\.com|expedia\.|agoda\.com|ikyu\.com|jtb\.co\.jp|hotels\.com)$/i,
    id: 'booking',
  },
  {
    test: /(^|\.)(line\.me|lin\.ee|photos\.google\.com|photos\.app\.goo\.gl|icloud\.com|photos\.amazon\.)/i,
    id: 'album',
  },
  { test: /(^|\.)(instagram\.com|flickr\.com|pinterest\.)/i, id: 'photo' },
  { test: /(^|\.)(google\.[a-z.]+|maps\.apple\.com|goo\.gl)$/i, id: 'map' },
];

/**
 * その URL は**アプリが持っている**か(LINE・Googleフォト・iCloud写真)。
 *
 * アプリ内ブラウザ(SFSafariViewController)で開くと Universal Link が
 * 効かず、**LINE アプリではなく web 版が出る**。アルバムを見るには
 * アプリへ渡さないと意味がないので、ここだけは外に投げる
 * (src/lib/openExternal.ts)。
 */
export function isAppLink(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return /(^|\.)(line\.me|lin\.ee|photos\.google\.com|photos\.app\.goo\.gl|icloud\.com)$/i.test(
      host,
    );
  } catch {
    return false;
  }
}

/** URL からリンクの種別を推定する。UI 側で i18n の `linkLabel.*` に引く */
export function guessLinkLabel(url: string): LinkLabelId {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return 'other';
  }
  for (const rule of LINK_RULES) {
    if (rule.test.test(host)) return rule.id;
  }
  return 'official';
}

/** 旅の一覧から1タップで開く先。アルバムがあればそれ、無ければ最初の1本 */
export function primaryLink<T extends { label: LinkLabelId }>(links: readonly T[] | undefined): T | null {
  if (!links || links.length === 0) return null;
  return links.find((l) => l.label === 'album') ?? links[0];
}
