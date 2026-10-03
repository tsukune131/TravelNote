import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'com.tsukune.travelnote',
  appName: 'つばメイト',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      /**
       * **描画が済んだら JS 側から閉じる**(src/main.tsx)。
       * 本番ビルドの実測で、タイムラインが見えるまで 98ms しかかからない。
       * ここを固定待ちにすると、準備できているのに待たせることになる。
       *
       * `launchAutoHide` は切らない。JS が動かなかったときに
       * スプラッシュが出たまま戻らなくなるのを避けるための保険。
       * その保険としての 1.5 秒(3 秒は長すぎた)。
       */
      launchAutoHide: true,
      launchShowDuration: 1500,
      /**
       * index.css の --paper。**起動画像の地と同じ値**にしておくこと
       * (store/make-icon.mjs の PAPER)。ずれていると、画像が出るまでの
       * 一瞬だけ違う色が見える。2026-08-09 の配色変更のとき、
       * ここだけ前の生成り色 #eceee9 が残っていた
       */
      backgroundColor: '#fff7f5',
    },
    Keyboard: {
      /**
       * **キーボードが出たら、画面を押し上げずに WebView ごと縮める。**
       * 既定では iOS が入力欄を見せようとして画面全体を上へ押し上げ、旅の名前や
       * Day タブがステータスバーの裏へ潜っていた(実機: 予定の時刻と時計が重なった)。
       * 縮めれば、上は見えたまま、下に固定した追加バーがキーボードの上に乗る
       */
      resize: KeyboardResize.Native,
      resizeOnFullScreen: true,
    },
  },
};

export default config;
