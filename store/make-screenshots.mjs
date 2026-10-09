/**
 * App Store 用のスクリーンショットを組み立てる(6.9インチ 1320x2868)。
 *
 *   TN_CDP=http://127.0.0.1:9333 node store/make-screenshots.mjs
 *
 * デザインは 2026-10-03 に決めた「A + ルーペ」:
 * - 地はアイコンと同じ夕焼けのグラデーション、白い大きな見出し(検索結果の白い画面で目立ち、
 *   アイコンと同じアプリだと一目で分かる)
 * - 画面は iPhone の枠に入れ、**大事な場所をルーペで拡大**して重ねる(縮めても機能が伝わる)
 * - つばめと点線の軌跡は**見出しより上の帯だけ**を飛ぶ(見出しに重ねない)
 *
 * 元画像は `photo/`(.gitignore。実機の記録が写るため手元のみ)、組み上がりは `store/screenshots/`。
 * 撮る画面と注意は store/screenshot-shotlist.md(手元のみ)。
 *
 * ⚠️ **共有シートは、アプリの列(AirDrop・つばメイト・メッセージ・メール)だけを切り出す。**
 * その上には LINE の連絡先(実在の人の名前と写真・他社のマーク)と、サイトの画像
 * (第三者の著作物)が写る。App Store の素材に入れてはいけない(5.2.1)。
 *
 * sharp は使わない。Chrome に描かせて撮る(make-icon.mjs と同じ)。
 */
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const W = 1320;
const H = 2868;
const OUT = 'store/screenshots';
const SRC_RATIO = 2622 / 1206;

const photo = async (name) => `data:image/png;base64,${(await readFile(`photo/${name}`)).toString('base64')}`;

/**
 * 1枚ごとの中身。
 * - screen: 枠に入れる画面。top / bottom は上下を落とす割合(ステータスバー・余白)
 * - loupe: 拡大して重ねる場所(元画像の縦の割合 from〜to)。ふだんは拡大元の真上に重ねる。
 *   at を指定すると、その高さに置く(共有シートのように、別の画像を拡大するとき)
 */
const SHOTS = [
  {
    // 2行目(シンプルに作って、かんたん共有)が15字で入らないので「、」で折って3行。
    // 3行だと小見出しの場所が無いので、小見出しは置かない
    caption: ['旅行の予定を', 'シンプルに作って、', 'かんたん共有'],
    mark: 'かんたん共有',
    captionTop: 330,
    screen: { file: 'IMG_2871.PNG', top: 0.05, bottom: 0 },
    loupe: { file: 'IMG_2871.PNG', from: 0.795, to: 0.885 },
    // 共有がどう起きるかも伝える(iCloud)。2行目でうれしさを言う
    // pointer: 三角を置く横位置(画面幅に対する割合)。上のバーのメンバーの顔
    callout: { title: 'iCloud でみんなと共有', note: '直したことは、数秒で全員に届く', top: 860, pointer: 0.6 },
  },
  {
    caption: ['行きたい・やりたい', 'まずここへ'],
    mark: 'まずここへ',
    sub: '場所とやることを自動で仕分け。決まったら日へ',
    screen: { file: 'IMG_2872.PNG', top: 0.05, bottom: 0 },
    loupe: { file: 'IMG_2872.PNG', from: 0.495, to: 0.66 },
  },
  {
    caption: ['見つけたお店は', '共有でそのまま予定に'],
    mark: 'そのまま予定に',
    sub: '共有ボタンから、つばメイトを選ぶだけ',
    // 2行目が10文字で、ふだんの大きさ(122px)だと右へはみ出す
    captionSize: 110,
    screen: { file: 'IMG_2874.PNG', top: 0.05, bottom: 0 },
    // 共有シートのアプリの列だけ(LINE の連絡先とサイトの画像は入れない)
    loupe: { file: 'IMG_2873.PNG', from: 0.695, to: 0.835, at: 1000, ring: { x: 0.3893, y: 0.7462, size: 0.168 },
      // 左端に共有シートの裏のサイトのイラスト(第三者の画像)がのぞくので、左へずらして外へ出す
      shift: 0.04 },
  },
  {
    caption: ['準備も予約番号も、', 'ひとまとめ'],
    mark: 'ひとまとめ',
    sub: '持ち物のチェックと、予約のまとめ',
    screen: { file: 'IMG_2875.PNG', top: 0.378, bottom: 0 },
    loupe: { file: 'IMG_2875.PNG', from: 0.855, to: 0.935 },
  },
  {
    caption: ['旅ごとに、', 'ぜんぶまとまる'],
    mark: 'ぜんぶまとまる',
    sub: '旅行中の旅が、いちばん上に',
    screen: { file: 'IMG_2876.PNG', top: 0.05, bottom: 0 },
    // 拡大を控えめにして、カードの右端のアルバムのボタンまで入れる
    loupe: { file: 'IMG_2876.PNG', from: 0.155, to: 0.455, scale: 1.12 },
    // 旅のカードの右のアルバムのボタンを指す
    callout: { title: 'アルバムのリンクを貼っておけば', note: '旅のあとも、いつでも思い出へ', top: 860, pointer: 0.93 },
  },
];

const PHONE = { left: 155, top: 960, width: 1010, bezel: 22 };

function phoneHtml(src, screen) {
  const h = PHONE.width * SRC_RATIO;
  const cut = Math.round(h * screen.top);
  const shown = Math.round(h * (1 - screen.top - screen.bottom));
  return `<div class="device" style="left:${PHONE.left}px;top:${PHONE.top}px">
    <div class="screen" style="width:${PHONE.width}px;height:${shown}px">
      <img src="${src}" style="width:${PHONE.width}px;margin-top:-${cut}px"></div></div>`;
}

function loupeHtml(src, l, screen) {
  const scale = l.scale ?? 1.28;
  const boxW = 1150;
  const imgW = PHONE.width * scale;
  const h = imgW * SRC_RATIO;
  const boxH = Math.round(h * (l.to - l.from));
  if (l.at === undefined) {
    // 枠の中での拡大元の中心(元の大きさ)に、ルーペの中心を合わせる
    const base = PHONE.width * SRC_RATIO;
    const center = PHONE.top + PHONE.bezel + base * ((l.from + l.to) / 2 - screen.top);
    l = { ...l, at: Math.round(center - boxH / 2) };
  }
  // 枠は**中心**を、拡大後の画像の中のその位置に合わせる(画像を左へずらした分も引く)
  const shiftX = Math.round(PHONE.width * (l.shift ?? 0.012));
  const ringSize = l.ring ? Math.round(imgW * l.ring.size) + 40 : 0;
  const ring = l.ring
    ? `<span class="ring" style="left:${Math.round(imgW * l.ring.x) - shiftX}px;top:${Math.round(h * (l.ring.y - l.from))}px;width:${ringSize}px;height:${ringSize}px"></span>`
    : '';
  return `<div class="loupe" style="left:${(W - boxW) / 2}px;top:${l.at}px;width:${boxW}px;height:${boxH}px">
    <img src="${src}" style="width:${imgW}px;margin-top:-${Math.round(h * l.from)}px;margin-left:-${shiftX}px">${ring}</div>`;
}

const CSS = `
* { box-sizing: border-box; margin: 0; }
body { width: ${W}px; height: ${H}px; overflow: hidden; }
.canvas { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; color: #fff;
  background: linear-gradient(162deg, #ff9a76 0%, #f07784 32%, #e35d8b 58%, #c94f98 100%);
  font-family: 'Hiragino Sans', sans-serif; }
.route { position: absolute; left: 0; top: 0; width: ${W}px; height: 300px; }
.route path { fill: none; stroke: rgba(255,255,255,.6); stroke-width: 12; stroke-linecap: round; stroke-dasharray: 0 34; }
.birds { position: absolute; right: 60px; top: 40px; width: 290px; }
h1 { position: absolute; left: 110px; top: 360px; font-weight: 800; font-size: 122px; line-height: 1.22;
  letter-spacing: .01em; text-shadow: 0 6px 30px rgba(120, 20, 60, .25); z-index: 2; }
h1 .em { color: #fff6c9; }
.sub { position: absolute; left: 114px; top: 710px; font-size: 54px; font-weight: 600; opacity: .92; z-index: 2; }
.device { position: absolute; padding: ${PHONE.bezel}px; border-radius: 118px; background: #1f1a21;
  box-shadow: 0 60px 120px rgba(80, 20, 50, .35), inset 0 0 0 4px #3a3240; }
.screen { overflow: hidden; border-radius: 96px; background: #fff7f5; }
.screen img, .loupe img { display: block; }
.loupe { position: absolute; z-index: 4; overflow: hidden; border-radius: 48px; background: #fff7f5;
  border: 10px solid #fff; box-shadow: 0 40px 90px rgba(90, 20, 50, .45), 0 0 0 4px rgba(227, 93, 139, .5); }
.ring { position: absolute; border-radius: 72px; border: 10px solid #e35d8b;
  box-shadow: 0 0 0 10px rgba(227, 93, 139, .25); transform: translate(-50%, -50%); }
.callout { position: absolute; right: 70px; z-index: 5; background: #fff; color: #c2406f;
  padding: 30px 48px 32px 40px; border-radius: 40px; display: flex; align-items: center; gap: 26px;
  box-shadow: 0 24px 60px rgba(90, 20, 50, .3); }
.callout .dot { flex: 0 0 auto; width: 26px; height: 26px; border-radius: 50%; background: #e35d8b; box-shadow: 0 0 0 10px rgba(227,93,139,.2); }
.callout b { display: block; font-size: 50px; font-weight: 800; line-height: 1.25; }
.callout small { display: block; margin-top: 6px; font-size: 38px; font-weight: 600; color: #8a5a6e; }
/* 下向きの小さな三角(指しているものへ) */
.callout::after { content: ''; position: absolute; left: var(--pointer, auto); right: var(--pointer-right, 120px); bottom: -22px; width: 44px; height: 44px; background: #fff;
  transform: rotate(45deg); border-radius: 6px; }
`;

/**
 * 吹き出しの三角を、画面の横の割合 pointer の位置へ(吹き出しは右寄せなので、右からの距離で置く)
 */
function calloutPointer(c) {
  if (c.pointer === undefined) return '';
  const x = PHONE.left + PHONE.bezel + PHONE.width * c.pointer;
  return `--pointer-right:${Math.round(W - 70 - x - 22)}px`;
}

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

// アイコンの原画から白いつばめだけを抜き出す(store/icon-compose.mjs と同じ考え方)
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

await mkdir(OUT, { recursive: true });
for (const [i, shot] of SHOTS.entries()) {
  const cap = shot.caption.map((l) => l.replace(shot.mark, `<span class="em">${shot.mark}</span>`)).join('<br>');
  const capStyle = [
    shot.captionSize && `font-size:${shot.captionSize}px`,
    shot.captionTop && `top:${shot.captionTop}px`,
  ].filter(Boolean).join(';');
  const html = `<style>${CSS}</style><div class="canvas">
    <svg class="route" viewBox="0 0 ${W} 300"><path d="M -40 250 C 260 270, 560 200, 820 150 S 1010 110, 1040 120" /></svg>
    <img class="birds" src="${birds}">
    <h1${capStyle ? ` style="${capStyle}"` : ''}>${cap}</h1>${shot.sub ? `<p class="sub">${shot.sub}</p>` : ''}
    ${phoneHtml(await photo(shot.screen.file), shot.screen)}
    ${shot.loupe ? loupeHtml(await photo(shot.loupe.file), shot.loupe, shot.screen) : ''}
    ${shot.callout ? `<div class="callout" style="top:${shot.callout.top}px;${calloutPointer(shot.callout)}"><span class="dot"></span><span><b>${shot.callout.title}</b><small>${shot.callout.note}</small></span></div>` : ''}
  </div>`;
  await page.setContent(html);
  await page.waitForTimeout(200);
  const name = `${OUT}/${String(i + 1).padStart(2, '0')}.png`;
  await page.screenshot({ path: name });
  console.log(`✓ ${name}  ${shot.caption.join('')}`);
}
await browser.close();
