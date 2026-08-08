import { getSetting, setSetting } from './db';
import type { MapProvider } from '../lib/maps';

/** 端末固有の設定。同期しない(そもそも同期サーバーがない) */
export const MAP_PROVIDER_KEY = 'mapProvider';
export const DISPLAY_NAME_KEY = 'displayName';

/**
 * 既定の地図アプリ。**未設定(null)なら初回の地図タップで一度だけ聞く。**
 * Google と Apple のどちらかに決め打ちしない(docs/ux-design.md §5.1)。
 */
export async function getMapProvider(): Promise<MapProvider | null> {
  const value = await getSetting(MAP_PROVIDER_KEY);
  return value === 'apple' || value === 'google' ? value : null;
}

export async function setMapProvider(provider: MapProvider): Promise<void> {
  await setSetting(MAP_PROVIDER_KEY, provider);
}

export async function getDisplayName(): Promise<string> {
  return (await getSetting(DISPLAY_NAME_KEY)) ?? '';
}

export async function setDisplayName(name: string): Promise<void> {
  await setSetting(DISPLAY_NAME_KEY, name.trim());
}

/* ────────── 一度きりのフラグ ────────── */

/**
 * 「もう見せた」を覚えるための印。
 *
 * ヒントは**必要な場面で1回だけ**出す。上前のカルーセルにしないのは、
 * 読まれないうえに、このアプリの非自明な価値(時刻を決めなくていい・
 * 長押しでまとめてずらせる)は**その場面が来たときに教えるほうが効く**から。
 */
export const FLAGS = {
  /** ようこそ画面を見終わった */
  onboarded: 'flag.onboarded',
  /** 長押しでアクションメニューが出ることを知っている */
  knowsLongPress: 'flag.knowsLongPress',
} as const;

export type FlagKey = (typeof FLAGS)[keyof typeof FLAGS];

export async function getFlag(key: FlagKey): Promise<boolean> {
  return (await getSetting(key)) === '1';
}

export async function setFlag(key: FlagKey): Promise<void> {
  await setSetting(key, '1');
}
