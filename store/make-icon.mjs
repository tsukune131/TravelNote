/**
 * store/icon.svg から、iOSのアプリアイコンと起動画面を焼く。
 *
 *   node store/make-icon.mjs
 *
 * sharp は入れていない(Windows だとネイティブビルドで詰まる)。代わりに
 * 開発でもう使っている Chrome / Edge に描かせて撮る。playwright-core は
 * devDependency に入っていて、ブラウザ本体は既存のものを使う。
 *
 * iOS のアイコンの決まり:
 * ・1024x1024 の1枚だけでよい(Xcode 14 以降。Contents.json は single size)
 * ・**アルファを含めない。** 透明が1pxでもあると App Store Connect が弾く
 * ・**角を丸めない。** iOS が自分でマスクする
 * この3つは撮ったあとに検証している。
 *
 * 起動画面は 2732x2732 の1枚を 1x/2x/3x に置く(Capacitor の作りに合わせる)。
 * **地の色は capacitor.config.ts の backgroundColor と揃えること。**
 * ずれていると、画像が出るまでの一瞬だけ違う色が見える。
 */
import { chromium } from 'playwright-core';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const SRC = 'store/icon.svg';
const OUT = 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png';
const SIZE = 1024;

/** 起動画面。3枚とも同じ絵(Capacitor の生成物がそうなっている) */
const SPLASH_DIR = 'ios/App/App/Assets.xcassets/Splash.imageset';
const SPLASH_FILES = ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'];
const SPLASH_SIZE = 2732;
/** index.css の --paper。capacitor.config.ts の backgroundColor と同じ値 */
const PAPER = '#fff7f5';
/** 起動画面に置くアイコンの大きさ。画面の1/4より小さく、控えめに */
const MARK = 640;

/** driver.mjs と同じ探し方。ブラウザ本体はダウンロードしない */
const CANDIDATES = [
  process.env.TN_BROWSER,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
].filter(Boolean);

const exe = CANDIDATES.find((p) => existsSync(p));
if (!exe) {
  console.error('Chrome も Edge も見つかりませんでした。TN_BROWSER にパスを渡してください');
  process.exit(1);
}

const svg = await readFile(SRC, 'utf8');
const browser = await chromium.launch({ executablePath: exe });

/** 焼いたものが注文どおりか、PNG のヘッダを直接読んで確かめる */
function check(png, size, { needsOpaque }) {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const colorType = png[25]; // IHDR の color type。6 = RGBA、2 = RGB
  if (width !== size || height !== size) throw new Error(`寸法が違います: ${width}x${height}`);
  if (needsOpaque && (colorType === 6 || colorType === 4)) {
    throw new Error('アルファチャンネルが入っています。App Store Connect に弾かれます');
  }
  return { width, height };
}

async function shoot(size, body) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  // 余白と背景を混ぜないため、body ごと潰してから中身を置く
  await page.setContent(
    `<style>html,body{margin:0;padding:0}svg{display:block}</style><body>${body}</body>`,
  );
  const png = await page.screenshot({ omitBackground: false });
  await page.close();
  return png;
}

// ── アプリアイコン(角丸にしない・透明を入れない) ──
const icon = await shoot(SIZE, `<style>body{background:#fff}</style>${svg}`);
check(icon, SIZE, { needsOpaque: true });
await writeFile(OUT, icon);
console.log(`✓ ${OUT}  ${SIZE}x${SIZE}  ${(icon.length / 1024).toFixed(0)}KB  アルファなし`);

// ── 起動画面(紙の色の上に、角を丸めたアイコンを1つ) ──
const mark = svg.replace('width="1024" height="1024"', `width="${MARK}" height="${MARK}"`);
const splash = await shoot(
  SPLASH_SIZE,
  `<style>
     body{background:${PAPER};display:grid;place-items:center;height:${SPLASH_SIZE}px}
     .mark{width:${MARK}px;height:${MARK}px;border-radius:${Math.round(MARK * 0.22)}px;overflow:hidden}
   </style>
   <div class="mark">${mark}</div>`,
);
check(splash, SPLASH_SIZE, { needsOpaque: false });
for (const name of SPLASH_FILES) await writeFile(`${SPLASH_DIR}/${name}`, splash);
console.log(
  `✓ ${SPLASH_DIR}/  ${SPLASH_SIZE}x${SPLASH_SIZE} を${SPLASH_FILES.length}枚  ` +
    `${(splash.length / 1024).toFixed(0)}KB  地=${PAPER}`,
);

await browser.close();
