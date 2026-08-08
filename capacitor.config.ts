import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tsukune.travelnote',
  appName: 'たびのしおり',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      // 描画が済んだらJS側から閉じる(白い画面を挟まないため)。
      // ただし自動非表示は切らない。JSが動かなかったときに
      // スプラッシュが出たまま戻らなくなるのを避けるための保険
      launchAutoHide: true,
      launchShowDuration: 3000,
      backgroundColor: '#ffffff',
    },
  },
};

export default config;
