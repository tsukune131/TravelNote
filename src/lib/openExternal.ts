import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { directionsUrl, isAppLink, placeUrl } from './maps';
import type { MapPlace, MapProvider, TravelMode } from './maps';

/**
 * 外部を開く。Capacitor のプラグインは**静的 import**
 * (動的importで実機が固まった前例あり — CLAUDE.md 技術メモ)。
 */

/**
 * アプリの外へ出る。
 *
 * **実機では window.open を使わない。**
 * WKWebView は「ユーザー操作の直後」でない window.open をポップアップとみなして
 * 黙って捨てる。地図を開く前に設定を1回 await で読んでいたので、
 * **2回目以降は押しても何も起きなかった**(初回だけは選択シートの中から
 * 同期で呼んでいたので動いていた)。エラーも出ないので気づきにくい。
 *
 * 代わりに画面遷移として投げる。Capacitor の decidePolicyFor が
 * 「アプリの外のURL」と判定して UIApplication.open に渡し、webview 自身は動かない
 * (node_modules/@capacitor/ios ... WebViewDelegationHandler.swift)。
 * 操作直後かどうかに左右されないので、何度でも開く。
 */
function openOutside(url: string): void {
  if (Capacitor.isNativePlatform()) {
    window.location.href = url;
    return;
  }
  // ブラウザで動かしているときは、アプリを置いていかないよう別タブで
  window.open(url, '_blank', 'noopener');
}

/**
 * 地図アプリを開く。
 *
 * **カスタムURLスキーム(`comgooglemaps://`)ではなく https を使う。**
 * `maps.apple.com` と `google.com/maps` はどちらも Universal Link として
 * 扱われるので、アプリが入っていればアプリが開き、無ければ Safari に落ちる。
 * `canOpenURL` も `LSApplicationQueriesSchemes` も要らず、判定を間違えようがない。
 *
 * 地図はアプリを離れてよい場所なので、アプリ内ブラウザには入れない。
 */
export function openMap(provider: MapProvider, place: MapPlace): void {
  openOutside(placeUrl(provider, place).web);
}

export function openDirections(
  provider: MapProvider,
  from: MapPlace,
  to: MapPlace,
  mode: TravelMode,
): void {
  openOutside(directionsUrl(provider, from, to, mode).web);
}

/**
 * 法務ページの置き場。GitHub Pages で公開する(ROADMAP B-3)。
 * **App Store Connect も到達できる URL でなければならない**ので、
 * アプリ内に同梱せず、必ずこの公開ページを指す。
 */
export const LEGAL_BASE = 'https://tsukune131.github.io/TravelNote/legal';

/**
 * リンクは**アプリ内ブラウザ**で開く。
 * Safari に飛ばしてアプリを離れさせない(docs/ux-design.md §5.2)。
 *
 * **ただしアプリが持っているリンクは外に出す。**
 * LINE アルバムや Googleフォトをアプリ内ブラウザで開くと Universal Link が
 * 効かず、ログインを求める web 版が出るだけで写真にたどり着けない。
 * 地図と同じ扱いにして、OS にアプリを開かせる。
 */
export async function openLink(url: string): Promise<void> {
  if (isAppLink(url)) {
    openOutside(url);
    return;
  }
  try {
    await Browser.open({ url, presentationStyle: 'popover' });
  } catch {
    // Web で動かしているときなど、プラグインが使えない環境向けの逃げ道
    window.open(url, '_blank', 'noopener');
  }
}

/**
 * 文の中から URL を1本だけ取り出す。見つからなければ null。
 *
 * 共有メニューやブラウザによっては「ページ名 + URL」の形でコピーされる
 * (例: 「〇〇旅館 公式サイト\nhttps://...」)。名前を手で消させないために、
 * 最初に見つかった URL だけを拾う。
 *
 * 区切りは空白と、日本語の文で URL の直後に来やすい括弧・句読点。
 * 末尾の `.` `,` や、対応する `(` の無い `)` は文の一部とみなして落とす。
 */
export function extractUrl(input: string): string | null {
  const m = /(?:https?:\/\/|www\.)[^\s<>"「」『』【】（）、。]+/i.exec(input);
  if (!m) return null;
  let url = m[0].replace(/[.,;:!?'\]]+$/, '');
  if (url.endsWith(')') && !url.includes('(')) url = url.slice(0, -1);
  return url;
}

/** ユーザーが打ったものを URL として扱えるように整える */
export function normalizeUrl(input: string): string | null {
  const text = extractUrl(input) ?? input.trim();
  if (text.length === 0) return null;
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    return url.hostname.includes('.') ? url.toString() : null;
  } catch {
    return null;
  }
}
