/**
 * AdMob の ID。
 *
 * ⚠️ **いまは Google が公開しているテスト用の ID。** 本番の ID は AdMob の
 * 管理画面でアプリと広告ユニットを作ってから差し替える(ROADMAP E-4)。
 * テスト ID のまま審査に出しても広告は「Test Ad」と出るだけで収益にならない。
 *
 * アプリ ID(`ca-app-pub-...~...`)は JS ではなく `ios/App/App/Info.plist` の
 * `GADApplicationIdentifier` に書く。**差し替えるときは両方。**
 */
export const AD_UNITS = {
  banner: 'ca-app-pub-3940256099942544/2934735716',
  interstitial: 'ca-app-pub-3940256099942544/4411468910',
};

/** 本番の ID に差し替えたら false にする。true のあいだはテスト広告を要求する */
export const AD_TESTING = true;
