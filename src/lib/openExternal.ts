import { Browser } from '@capacitor/browser';
import { directionsUrl, placeUrl } from './maps';
import type { MapPlace, MapProvider, TravelMode } from './maps';

/**
 * 外部を開く。Capacitor のプラグインは**静的 import**
 * (動的importで実機が固まった前例あり — CLAUDE.md 技術メモ)。
 */

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
  window.open(placeUrl(provider, place).web, '_blank');
}

export function openDirections(
  provider: MapProvider,
  from: MapPlace,
  to: MapPlace,
  mode: TravelMode,
): void {
  window.open(directionsUrl(provider, from, to, mode).web, '_blank');
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
 */
export async function openLink(url: string): Promise<void> {
  try {
    await Browser.open({ url, presentationStyle: 'popover' });
  } catch {
    // Web で動かしているときなど、プラグインが使えない環境向けの逃げ道
    window.open(url, '_blank', 'noopener');
  }
}

/** ユーザーが打ったものを URL として扱えるように整える */
export function normalizeUrl(input: string): string | null {
  const text = input.trim();
  if (text.length === 0) return null;
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    return url.hostname.includes('.') ? url.toString() : null;
  } catch {
    return null;
  }
}
