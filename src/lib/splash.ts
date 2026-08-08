import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';

/**
 * スプラッシュを閉じる。
 *
 * **固定秒数で待たせない。** 本番ビルドの実測では、旅程が画面に出るまで
 * 100ms 前後しかかからない。`launchShowDuration` に頼ると、
 * 準備できているのにユーザーを待たせることになる。
 *
 * Capacitor プラグインは**静的 import**(動的 import で実機が固まった前例あり)。
 * ネイティブでないときは何もしない ── ブラウザで動かしたときに落ちないように。
 */
export async function hideSplash(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await SplashScreen.hide();
  } catch {
    // 閉じられなくても launchAutoHide が保険になる。ここで落とす理由はない
  }
}
