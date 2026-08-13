import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

/*
 * 設定画面に出すバージョン。package.json を正とする。
 *
 * ⚠️ **process.env.npm_package_version を使わない。** あれが入るのは
 * `npm run build` を経由したときだけで、`npx vite build` で直に叩くと
 * undefined になり、**黙って 0.0.0 の表示でビルドが通ってしまう**
 * (実際に設定画面が 0.0.0 のまま審査直前まで残っていた)。
 * ここで読めば呼ばれ方に依存しないし、読めなければビルドが落ちる。
 *
 * App Store 側の MARKETING_VERSION と揃っているかは
 * scripts/check-version.mjs が CI で確かめる。
 */
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// 配信先はiOSアプリ(WKWebView)。必ず相対パスで出す。
// サブパス配信(base: '/リポジトリ名/')のビルドをWKWebViewから読むと
// 全アセットが404になり画面が真っ白になる。
export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
});
