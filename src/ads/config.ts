/**
 * AdMob の ID(本番。2026-09-25 に AdMob の管理画面で作成)。
 *
 * アプリ ID(`ca-app-pub-5400380982443361~4357517098`)は JS ではなく
 * `ios/App/App/Info.plist` の `GADApplicationIdentifier` に書く。**変えるときは両方。**
 *
 * ⚠️ 本番 ID なので TestFlight でも本物の広告が出る。**自分の広告を押さない**
 * (AdMob のアカウント停止の理由になる)。開発機の iPhone は AdMob の管理画面で
 * テストデバイスに登録しておくと、その端末にだけテスト広告が出る。
 */
export const AD_UNITS = {
  banner: 'ca-app-pub-5400380982443361/5527217820',
  interstitial: 'ca-app-pub-5400380982443361/2095239279',
};

/** true にすると Google のテスト広告を要求する(本番 ID のまま収益にならなくなる) */
export const AD_TESTING = false;
