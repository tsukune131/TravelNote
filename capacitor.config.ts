import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tsukune.travelnote',
  appName: 'たびのしおり',
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
      backgroundColor: '#eceee9',
    },
  },
};

export default config;
