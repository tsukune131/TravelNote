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
