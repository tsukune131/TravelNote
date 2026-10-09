/**
 * App Store のクリエイティブアセット(製品ページのヘッダーと検索結果の画像)を組み立てる。
 *
 *   TN_CDP=http://127.0.0.1:9333 node store/make-creative-assets.mjs
 *
 * 2026-10-05 に App Store Connect で使えるようになった枠。iOS 27 以降でだけ出る。
 * スクリーンショットの代わりではなく、その上に足すもの(無くても困らない)。
 * 仕様: https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications/
 *
 * **16:9(5244x2950・PNG)を1枚だけ作る。** ヘッダーと検索結果の両方が受け付ける
 * 大きさはこれだけなので、1枚で両方に使える。そのかわり、置かれる場所で切り取られる:
 * - ヘッダー(21:9 で見せる)→ 上下が 352px ずつ落ちる
 * - 検索結果(3:2 で見せる)→ 左右が 410px ずつ落ちる
 * だから**文字と画面は、その内側(SAFE)にだけ置く**。外にはみ出してよいのは地と飾りだけ。
 *
 * ⚠️ **透明(アルファ)は不可。** 撮ったあと JPEG を経由してアルファを落とす。
 * ⚠️ 価格・「無料」・URL・© ・Apple の賞は入れない(Apple のガイド)。
 *
 * 見た目は make-screenshots.mjs と同じ(夕焼けの地・白い見出し・つばめ)。
 * 元画像は `photo/`(.gitignore)。組み上がりは `store/creative-assets/`。
 */
import { chromium } from 'playwright-core';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const W = 5244;
const H = 2950;
const SAFE = { left: 410, right: W - 410, top: 352, bottom: H - 352 };
const OUT = 'store/creative-assets';
const SRC_RATIO = 2622 / 1206;

const photo = async (name) => `data:image/png;base64,${(await readFile(`photo/${name}`)).toString('base64')}`;

/**
 * 並べる画面。下端は地の外へはみ出させる(切れても困らない)。
 * top: 端末の上端。cut: 元画像の上を落とす割合(ステータスバー)
 */
const PHONES = [
  { file: 'IMG_2872.PNG', left: 2700, top: 1000, width: 820, cut: 0.05 },
  { file: 'IMG_2876.PNG', left: 3966, top: 1000, width: 820, cut: 0.05 },
  // 真ん中(いちばん前):旅行中の一日
  { file: 'IMG_2871.PNG', left: 3270, top: 660, width: 960, cut: 0.05, front: true },
];

const BEZEL = 24;

function phoneHtml(src, p) {
  const h = p.width * SRC_RATIO;
  return `<div class="device${p.front ? ' front' : ''}" style="left:${p.left}px;top:${p.top}px">
    <div class="screen" style="width:${p.width}px;height:${Math.round(h * (1 - p.cut))}px">
      <img src="${src}" style="width:${p.width}px;margin-top:-${Math.round(h * p.cut)}px"></div></div>`;
}

const CSS = `
* { box-sizing: border-box; margin: 0; }
body { width: ${W}px; height: ${H}px; overflow: hidden; }
.canvas { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; color: #fff;
  background: linear-gradient(118deg, #ff9a76 0%, #f07784 30%, #e35d8b 58%, #c94f98 100%);
  font-family: 'Hiragino Sans', sans-serif; }
.route { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; }
.route path { fill: none; stroke: rgba(255,255,255,.55); stroke-width: 22; stroke-linecap: round; stroke-dasharray: 0 62; }
.birds { position: absolute; left: 1800px; top: 420px; width: 520px; }
.copy { position: absolute; left: ${SAFE.left + 110}px; top: 900px; z-index: 2; }
.lead { font-size: 132px; font-weight: 700; line-height: 1.45; text-shadow: 0 8px 40px rgba(120, 20, 60, .2); }
/* アプリの名前(黄色・いちばん大きく) */
h1 { margin-top: 60px; font-weight: 800; font-size: 330px; line-height: 1.1; letter-spacing: .02em; color: #fff6c9;
  text-shadow: 0 12px 60px rgba(120, 20, 60, .25); }
.device { position: absolute; padding: ${BEZEL}px; border-radius: 120px; background: #1f1a21;
  box-shadow: 0 80px 160px rgba(80, 20, 50, .35), inset 0 0 0 5px #3a3240; }
.device.front { z-index: 1; box-shadow: 0 100px 200px rgba(80, 20, 50, .45), inset 0 0 0 5px #3a3240; }
.screen { overflow: hidden; border-radius: 98px; background: #fff7f5; }
.screen img { display: block; }
`;

async function openBrowser() {
  if (process.env.TN_CDP) return chromium.connectOverCDP(process.env.TN_CDP);
  const exe = [
    process.env.TN_BROWSER,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].find((p) => p && existsSync(p));
  if (!exe) throw new Error('Chrome が見つかりません。TN_CDP か TN_BROWSER を渡してください');
  return chromium.launch({ executablePath: exe });
}

const browser = await openBrowser();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

// アイコンの原画から白いつばめだけを抜き出す(make-screenshots.mjs と同じ)
const iconSrc = `data:image/png;base64,${(await readFile('store/icon-source.png')).toString('base64')}`;
await page.setContent('<canvas></canvas>');
const birds = await page.evaluate(async (src) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const c = new OffscreenCanvas(img.width, img.height);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const sx = 480, sy = 360, sw = 545, sh = 385;
  const d = g.getImageData(sx, sy, sw, sh);
  for (let i = 0; i < d.data.length; i += 4) {
    const m = Math.min(d.data[i], d.data[i + 1], d.data[i + 2]);
    const a = Math.max(0, Math.min(1, (m - 150) / 95));
    d.data[i] = d.data[i + 1] = d.data[i + 2] = 255;
    d.data[i + 3] = Math.round(a * 255);
  }
  for (let y = -16; y <= 16; y++) for (let x = -16; x <= 16; x++) {
    if (x * x + y * y > 256) continue;
    const cx = 479 - sx + x, cy = 724 - sy + y;
    if (cx >= 0 && cy >= 0 && cx < sw && cy < sh) d.data[(cy * sw + cx) * 4 + 3] = 0;
  }
  const o = new OffscreenCanvas(sw, sh);
  o.getContext('2d').putImageData(d, 0, 0);
  const b = new Uint8Array(await (await o.convertToBlob({ type: 'image/png' })).arrayBuffer());
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return 'data:image/png;base64,' + btoa(s);
}, iconSrc);

const phones = await Promise.all(PHONES.map(async (p) => phoneHtml(await photo(p.file), p)));
await page.setContent(`<style>${CSS}</style><div class="canvas">
  <svg class="route" viewBox="0 0 ${W} ${H}"><path d="M ${SAFE.left - 200} 760 C 900 820, 1400 700, 1850 600" /></svg>
  <img class="birds" src="${birds}">
  <div class="copy"><p class="lead">旅行の予定を<br>シンプルに作って、かんたん共有</p>
    <h1>つばメイト</h1></div>
  ${phones.join('')}
</div>`);
await page.waitForTimeout(300);

await mkdir(OUT, { recursive: true });
const name = `${OUT}/universal-16x9.png`;
const tmp = `${OUT}/.tmp.jpg`;
await page.screenshot({ path: tmp, type: 'jpeg', quality: 100 });
await browser.close();
// JPEG を経由してアルファを落とす(16:9 は PNG しか受け付けない)
execFileSync('sips', ['-s', 'format', 'png', tmp, '--out', name], { stdio: 'ignore' });
await rm(tmp);
console.log(`✓ ${name}  ${W}x${H}`);
