/**
 * つばメイトのアイコンの原画を組む。
 *
 *   node store/icon-compose.mjs      → store/icon.png
 *   node store/make-icon.mjs         → iOS のアイコンと起動画面に焼く
 *
 * 元の絵(store/icon-source.png)は ChatGPT で作った 1254x1254。
 * そのままだと2羽も軌跡も小さく、60px のホーム画面では何の絵か分からない。
 * そこで**白いつばめだけを抜き出して約1.8倍にし**、地のグラデーションと
 * 点の軌跡は描き直す(軌跡の点は元の絵のままだと縮めると消える)。
 *
 * 抜き出しは「白さ」で決める: 3色の最小値が地(80〜150)と白(245〜)の間なら
 * その割合を不透明度にする。輪郭の中間色がそのまま滑らかな縁になる。
 *
 * ここで出す PNG にはアルファが付く。App Store に出すのは make-icon.mjs が
 * 撮り直したほうで、そちらにはアルファが無い(撮ったあとに検証している)。
 *
 * Chrome は TN_CDP で起動済みのものにつなぐ(Mac の VS Code から起動すると
 * 即死するため。.claude/skills/run-travelnote/SKILL.md の Gotchas)。
 * TN_CDP が無ければ driver.mjs と同じ探し方で起動する。
 */
import { chromium } from 'playwright-core';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const [src = 'store/icon-source.png', out = 'store/icon.png'] = process.argv.slice(2);
const b64 = (await readFile(src)).toString('base64');

// 調整用のつまみ
const P = {
  birds: { sx: 480, sy: 360, sw: 545, sh: 385 }, // 元画像(1254)の中で2羽を囲む枠
  scale: 1.5, // 出力(1024)上での倍率
  // 枠に入りこむ元の軌跡の点(元画像の座標)。白抜きから外す
  erase: [{ x: 479, y: 724, r: 16 }],
  at: { x: 150, y: 205 }, // 枠の左上を置く位置
  dots: [
    // 尾から左下へ。手前ほど大きい
    { x: 150, y: 762, r: 21 },
    { x: 110, y: 804, r: 18 },
    { x: 76, y: 846, r: 15 },
    { x: 50, y: 888, r: 12 },
  ],
};

const browser = await openBrowser();
const ctx = await browser.newContext();
const page = await ctx.newPage();
const dataUrl = await page.evaluate(
  async ({ b64, P }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const W = img.width;

    // 元画像を読む
    const srcC = new OffscreenCanvas(W, W);
    const s = srcC.getContext('2d');
    s.drawImage(img, 0, 0);

    // 地の色は元画像の左上・中央・右下から拾う(つばめの無い場所)
    const avg = (x, y) => {
      const d = s.getImageData(x, y, 40, 40).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4;
      return `rgb(${(r / n) | 0},${(g / n) | 0},${(b / n) | 0})`;
    };
    const c0 = avg(10, 10), c1 = avg(300, 1000), c2 = avg(W - 50, W - 50);

    // つばめの白だけを抜く。白(min≈255)と地(min≈80〜110)の間を不透明度に直す
    const { sx, sy, sw, sh } = P.birds;
    const cut = s.getImageData(sx, sy, sw, sh);
    const d = cut.data;
    for (let i = 0; i < d.length; i += 4) {
      const m = Math.min(d[i], d[i + 1], d[i + 2]);
      const a = Math.max(0, Math.min(1, (m - 150) / (245 - 150)));
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = Math.round(a * 255);
    }
    for (const e of P.erase) {
      for (let y = -e.r; y <= e.r; y++) for (let x = -e.r; x <= e.r; x++) {
        if (x * x + y * y > e.r * e.r) continue;
        const cx = e.x - sx + x, cy = e.y - sy + y;
        if (cx < 0 || cy < 0 || cx >= sw || cy >= sh) continue;
        d[(cy * sw + cx) * 4 + 3] = 0;
      }
    }
    const birdC = new OffscreenCanvas(sw, sh);
    birdC.getContext('2d').putImageData(cut, 0, 0);

    // 組む
    const N = 1024;
    const o = new OffscreenCanvas(N, N);
    const g = o.getContext('2d');
    const grad = g.createLinearGradient(0, 0, N, N);
    grad.addColorStop(0, c0);
    grad.addColorStop(0.5, c1);
    grad.addColorStop(1, c2);
    g.fillStyle = grad;
    g.fillRect(0, 0, N, N);

    g.save();
    g.shadowColor = 'rgba(125,32,68,0.28)';
    g.shadowBlur = 30;
    g.shadowOffsetY = 14;
    g.imageSmoothingQuality = 'high';
    g.drawImage(birdC, P.at.x, P.at.y, sw * P.scale, sh * P.scale);
    g.restore();

    g.fillStyle = 'rgba(255,255,255,0.92)';
    for (const p of P.dots) {
      g.beginPath();
      g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      g.fill();
    }

    const blob = await o.convertToBlob({ type: 'image/png' });
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(bin);
  },
  { b64, P },
);
await writeFile(out, Buffer.from(dataUrl, 'base64'));
await browser.close();
console.log(`wrote ${out}`);

async function openBrowser() {
  if (process.env.TN_CDP) return chromium.connectOverCDP(process.env.TN_CDP);
  const exe = [
    process.env.TN_BROWSER,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find((p) => p && existsSync(p));
  if (!exe) throw new Error('Chrome も Edge も見つかりませんでした。TN_BROWSER か TN_CDP を渡してください');
  return chromium.launch({ executablePath: exe });
}
