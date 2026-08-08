import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

// 配信先はiOSアプリ(WKWebView)。必ず相対パスで出す。
// サブパス配信(base: '/リポジトリ名/')のビルドをWKWebViewから読むと
// 全アセットが404になり画面が真っ白になる。
export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    // 設定画面に出すバージョン。package.json を正とする
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  },
});
