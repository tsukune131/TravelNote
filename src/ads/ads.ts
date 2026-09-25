import { useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  AdMob,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize,
  InterstitialAdPluginEvents,
} from '@capacitor-community/admob';
import { getSetting, setSetting } from '../db/db';
import { AD_TESTING, AD_UNITS } from './config';
import { shouldShowInterstitial } from './policy';
import type { InterstitialState } from './policy';

/**
 * 広告の配線(AdMob)。**出すかどうかの判断は `policy.ts` と `showsAds`**。
 * ここは外の世界とのやりとりだけ。
 *
 * - 下帯: 画面の一番下(ホームバーの上)。高さは `--ad-h` で CSS に渡し、
 *   入力欄やシートを帯の上へ持ち上げる(src/index.css の `--safe-bottom`)
 * - 全画面: 区切りのときに `maybeShowInterstitial` で出す
 *
 * ⚠️ **読めなくても画面を崩さない・待たせない。** 圏外は旅先の日常で、
 * 広告が来ないだけで困る人はいない。失敗はすべて黙って捨てる(帯の高さは 0 のまま)。
 *
 * web(開発中)では本物を出せないので、同じ位置に灰色の箱を出す(`useDevAds`)。
 * レイアウトの確かめ用で、本番のビルドには入らない。
 */

const FIRST_LAUNCH_KEY = 'ads.firstLaunchAt';
const LAST_SHOWN_KEY = 'ads.lastInterstitialAt';

const native = Capacitor.isNativePlatform();

let running = false;
let initialized = false;
let interstitialReady = false;
let state: InterstitialState | null = null;

/* ────────── 開発用の見せかけ ────────── */

type DevAds = { banner: boolean; interstitial: boolean };
let dev: DevAds = { banner: false, interstitial: false };
const devListeners = new Set<() => void>();

function setDev(next: Partial<DevAds>) {
  dev = { ...dev, ...next };
  for (const l of devListeners) l();
}

export function useDevAds(): DevAds {
  return useSyncExternalStore(
    (l) => {
      devListeners.add(l);
      return () => devListeners.delete(l);
    },
    () => dev,
    () => dev,
  );
}

export function closeDevInterstitial(): void {
  setDev({ interstitial: false });
}

/* ────────── 診断(設定の隠し表示) ────────── */

/**
 * 広告がいまどうなっているか。**推測ではなく AdMob の返事を見る**ための記録。
 *
 * 広告は読めなくても黙って帯を 0 にする作りなので、出ないときに理由が
 * どこにも残らなかった(本番の ID に替えて帯が消え、原因を当て推量するしかなかった)。
 * 設定のバージョンの行を5回押すと出る(Settings.tsx)。普段は誰にも見せない。
 */
export type AdDiagnostics = {
  /** 'off' = 出していない(Pro など)/ 'web' / 'starting' / 'started' / 'error' */
  stage: string;
  /** ATT の状態(authorized / denied / notDetermined / restricted) */
  att: string | null;
  /** 帯の最後の結果。'loaded' か、AdMob のエラー(コード: 文言) */
  banner: string | null;
  /** 全画面の最後の結果。'ready' か、エラー */
  interstitial: string | null;
  testing: boolean;
  updatedAt: number | null;
};

let diag: AdDiagnostics = {
  stage: 'off',
  att: null,
  banner: null,
  interstitial: null,
  testing: AD_TESTING,
  updatedAt: null,
};
const diagListeners = new Set<() => void>();

function setDiag(next: Partial<AdDiagnostics>) {
  diag = { ...diag, ...next, updatedAt: Date.now() };
  for (const l of diagListeners) l();
}

/** エラーを「コード: 文言」に。プラグインの返すものは形がまちまちなので広めに拾う */
function describeError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { code?: unknown; message?: unknown };
    const code = e.code !== undefined ? `${String(e.code)}: ` : '';
    return `${code}${String(e.message ?? JSON.stringify(err))}`;
  }
  return String(err);
}

export function useAdDiagnostics(): AdDiagnostics {
  return useSyncExternalStore(
    (l) => {
      diagListeners.add(l);
      return () => diagListeners.delete(l);
    },
    () => diag,
    () => diag,
  );
}

/* ────────── 帯の高さ ────────── */

function setBannerHeight(px: number) {
  document.documentElement.style.setProperty('--ad-h-live', `${Math.round(px)}px`);
}

/**
 * キーボードが出ているあいだは帯の高さを 0 として扱う。
 * 帯はキーボードの下に隠れるので、入力欄を帯のぶん持ち上げると隙間が空く。
 */
function watchKeyboard() {
  const typing = (el: EventTarget | null) =>
    el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
  document.addEventListener('focusin', (e) => {
    if (typing(e.target)) document.documentElement.dataset.kb = '';
  });
  document.addEventListener('focusout', () => {
    delete document.documentElement.dataset.kb;
  });
}

/* ────────── 開始・停止 ────────── */

async function loadState(): Promise<InterstitialState> {
  const now = Date.now();
  let first = Number(await getSetting(FIRST_LAUNCH_KEY));
  if (!first) {
    first = now;
    await setSetting(FIRST_LAUNCH_KEY, String(now));
  }
  const last = Number(await getSetting(LAST_SHOWN_KEY));
  return { firstLaunchAt: first, lastShownAt: last || null, actionsSince: 0, countingSince: now };
}

/**
 * 広告を出し始める。**Pro なら呼ばない**(呼び出し側で `showsAds` を見る)。
 * 何度呼んでもよい。
 */
export async function startAds(): Promise<void> {
  if (running) return;
  running = true;
  state ??= await loadState();

  if (!native) {
    setDiag({ stage: 'web' });
    if (import.meta.env.DEV) {
      setBannerHeight(50);
      setDev({ banner: true });
    }
    return;
  }

  setDiag({ stage: 'starting' });
  try {
    if (!initialized) {
      initialized = true;
      watchKeyboard();
      await AdMob.initialize({ initializeForTesting: AD_TESTING });
      /*
       * ATT(トラッキングの許可)。**聞くのは1回だけ**で、OS が覚える。
       * 断られても広告は出る(パーソナライズされないだけ)。
       */
      const { status } = await AdMob.trackingAuthorizationStatus();
      if (status === 'notDetermined') await AdMob.requestTrackingAuthorization();
      // 聞いたあとの状態を記録する(テストデバイスの判定は許可が無いと効かない)
      setDiag({ att: (await AdMob.trackingAuthorizationStatus()).status });

      await AdMob.addListener(BannerAdPluginEvents.SizeChanged, (size) =>
        setBannerHeight(running ? size.height : 0),
      );
      await AdMob.addListener(BannerAdPluginEvents.Loaded, () => setDiag({ banner: 'loaded' }));
      await AdMob.addListener(BannerAdPluginEvents.FailedToLoad, (info) => {
        setBannerHeight(0);
        setDiag({ banner: describeError(info) });
      });
      await AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
        interstitialReady = false;
        void prepareInterstitial();
      });
    }
    await AdMob.showBanner({
      adId: AD_UNITS.banner,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      margin: 0,
      isTesting: AD_TESTING,
    });
    setDiag({ stage: 'started' });
    void prepareInterstitial();
  } catch (err) {
    // 出せないなら出さないだけ。画面は帯なしのまま
    setBannerHeight(0);
    setDiag({ stage: 'error', banner: describeError(err) });
  }
}

/** 広告をやめる(Pro になった直後など) */
export async function stopAds(): Promise<void> {
  if (!running) return;
  running = false;
  setBannerHeight(0);
  setDev({ banner: false, interstitial: false });
  setDiag({ stage: 'off' });
  if (!native) return;
  try {
    await AdMob.removeBanner();
  } catch {
    // 帯が無ければ何もしない
  }
}

async function prepareInterstitial() {
  if (!native || interstitialReady || !running) return;
  try {
    await AdMob.prepareInterstitial({ adId: AD_UNITS.interstitial, isTesting: AD_TESTING });
    interstitialReady = true;
    setDiag({ interstitial: 'ready' });
  } catch (err) {
    interstitialReady = false;
    setDiag({ interstitial: describeError(err) });
  }
}

/* ────────── 全画面 ────────── */

/** 操作を1回数える(予定の追加・Day の切り替えなど) */
export function noteAdAction(): void {
  if (state) state.actionsSince += 1;
}

/**
 * 区切り(旅一覧 ⇄ 旅の画面)で呼ぶ。条件を満たしていれば全画面広告を出す。
 * **待たない。** 用意できていなければ今回は見送る。
 */
export function maybeShowInterstitial(context: { onTripInProgress: boolean }): void {
  if (!running || !state) return;
  const now = Date.now();
  if (!shouldShowInterstitial(state, now, context)) return;

  if (native) {
    if (!interstitialReady) return;
    interstitialReady = false;
    void AdMob.showInterstitial().catch(() => undefined);
  } else if (import.meta.env.DEV) {
    setDev({ interstitial: true });
  } else {
    return;
  }

  state = { ...state, lastShownAt: now, actionsSince: 0, countingSince: now };
  void setSetting(LAST_SHOWN_KEY, String(now));
}
