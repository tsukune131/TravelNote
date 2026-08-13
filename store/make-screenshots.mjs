/**
 * App Store 用のスクリーンショットを組み立てる。
 *
 *   node store/make-screenshots.mjs
 *
 * `photo/` に入れた実機のスクリーンショットを、App Store Connect が要求する
 * 6.9インチ枠 1320x2868 のキャンバスに載せ、上にキャプションを置く。
 *
 * ・**元画像を切り取って寸法を変えるとアップロードで弾かれる**が、
 *   所定寸法のキャンバスに載せるのは自由。撮り直さずに枠を合わせられる
 * ・ステータスバー(時刻・電池)は上から割合で切り落とす
 * ・`photo/` は .gitignore 対象(実機の記録が写るため手元のみ)。
 *   組み上がりだけ `store/screenshots/` に残す
 *
 * **sharp は使わない**(Windows でネイティブビルドが詰まる)。
 * アイコン(store/make-icon.mjs)と同じく、入っている Chrome / Edge に
 * 描かせて撮る。playwright-core は devDependency に入っている。
 */
import { chromium } from 'playwright-core';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const W = 1320;
const H = 2868;
const OUT_DIR = 'store/screenshots';

/** アプリの配色(src/index.css と揃える) */
const PAPER = '#fff7f5';
const INK = '#3d2a33';
const PRIMARY = '#e35d8b';
const FONT = "'Yu Gothic UI', 'Meiryo', 'Hiragino Sans', sans-serif";

/** ステータスバーを落とす割合(元画像の高さに対して) */
const CROP_TOP = 0.05;

/**
 * 下を落とす割合。**共有シートの下段アクションを画面外へ追い出すために要る。**
 *
 * ⚠️ 2枚目の元画像(IMG_2471)の最下部には **「Brave で開く」** が写っている。
 * 他社ブラウザのロゴと名称が App Store の販売素材に入ると 5.2.1(第三者の
 * 知的財産)に触れるうえ、キャプションが「Safari の共有シートから」なのに
 * 別のブラウザが写るのは訴求としても矛盾する(2026-08-12 の監査で検出)。
 *
 * **元画像は加工しない。** 上を切るのと同じく、枠の高さを縮めて overflow で
 * 隠す ── 撮り直さずに済み、切る量が数字としてここに残る。
 *
 * 0.055 = 元画像 2622px のうち下 144px。「プリント」の行までを残し、
 * その下の区切り線と Brave の行、ホームインジケータが枠の外に出る。
 */
const CROP_BOTTOM_SHARESHEET = 0.055;

/**
 * 並び順に意味がある。
 * 1枚目に全体像、2枚目に**アプリの外で動くところ**(共有シート)。
 * 3枚目以降で「同行者と」「旅の前後」を足す。
 */
const SHOTS = [
  {
    file: 'IMG_2473.PNG',
    caption: '旅行中は、片手で3秒',
    sub: '電波がなくても、現在地から次の予定まで確認可能',
  },
  {
    pair: ['IMG_2471.PNG', 'IMG_2472.PNG'],
    caption: '見つけたスポットは、その場で予定に組み込む',
    sub: 'Safari の共有シートから。あとで好きな日に入れられます',
  },
  {
    file: 'IMG_2479.PNG',
    caption: '登録なしで、一緒に行く人に共有可能',
    sub: '相手はアプリを入れるだけ。登録も支払いも要りません',
  },
  {
    file: 'IMG_2478.PNG',
    caption: '持ち物も予約番号も、ここに',
    sub: '準備からお土産のリストまで活用可能',
  },
  { file: 'IMG_2477.PNG', caption: '旅ごとに、ぜんぶまとまる', sub: '旅行中の旅がいちばん上に出ます' },
];

const CANDIDATES = [
  process.env.TN_BROWSER,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
].filter(Boolean);

const exe = CANDIDATES.find((p) => existsSync(p));
if (!exe) {
  console.error('Chrome も Edge も見つかりませんでした。TN_BROWSER にパスを渡してください');
  process.exit(1);
}

async function dataUri(name) {
  const buf = await readFile(`photo/${name}`);
  return `data:image/png;base64,${buf.toString('base64')}`;
}

/** 元画像の寸法(iPhone 6.9インチのスクリーンショット) */
const SRC_W = 1206;
const SRC_H = 2622;

/**
 * 端末のスクリーンショット1枚。上を切って角を丸め、影をつける。
 *
 * ⚠️ **切る量は px で計算する。** CSS の % マージンは
 * **高さではなく幅**に対する割合なので、`margin-top:-5%` では
 * ほとんど切れない(実際に踏んだ)。
 */
function phone(src, width, cropBottom = 0) {
  const shown = (width * SRC_H) / SRC_W;
  const cut = Math.round(shown * CROP_TOP);
  const cutBottom = Math.round(shown * cropBottom);
  return `<div class="phone" style="width:${width}px;height:${Math.round(shown) - cut - cutBottom}px">
    <img src="${src}" style="width:${width}px;margin-top:-${cut}px">
  </div>`;
}

/** 長いキャプションは小さくする */
function captionSize(text) {
  const n = [...text].length;
  if (n <= 11) return 96;
  if (n <= 15) return 84;
  return 76;
}

/**
 * 長いキャプションは**折り返す場所を決める。**
 * 任せると「その場で放/り込む」のように語の途中で切れる(実際に踏んだ)。
 * 読点があればそこで折る ── 書いた人が意味の切れ目を置いた場所なので。
 */
function captionHtml(text) {
  if ([...text].length <= 15) return text;
  const i = text.indexOf('、');
  return i > 0 ? `${text.slice(0, i + 1)}<br>${text.slice(i + 1)}` : text;
}

const css = `
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width:${W}px; height:${H}px;
    background: linear-gradient(160deg, #fffdfc 0%, ${PAPER} 45%, #ffeef0 100%);
    font-family:${FONT}; color:${INK};
    display:flex; flex-direction:column; align-items:center;
    overflow:hidden;
  }
  .band { padding: 130px 60px 0; text-align:center; }
  .caption {
    font-weight: 800; line-height: 1.35;
    letter-spacing: 0.01em;
  }
  .sub {
    margin-top: 34px; font-size: 44px; line-height: 1.5;
    color: ${PRIMARY}; font-weight: 700;
  }
  /* 余白は上下に振り分ける。下にだけ溜まると作りかけに見える */
  .stage { flex:1; display:flex; align-items:center; justify-content:center;
           padding-bottom:60px; position:relative; }

  /*
   * 2枚並べるとき。**横に並べるだけでは縦長のキャンバスが埋まらない**ので、
   * 重ねてずらす。左右は少しはみ出させて、画面の外へ続いて見せる。
   */
  .pair { position:relative; width:${W}px; height:2030px; }
  .pair .phone { position:absolute; }
  .pair .phone:nth-of-type(1) { left:-34px; top:0; }
  .pair .phone:nth-of-type(2) { right:-34px; top:584px; }
  /* 上を切るのはここ。元画像そのものは加工していない */
  .phone {
    overflow:hidden; border-radius:52px;
    box-shadow: 0 26px 70px rgba(150,80,110,.28);
    background:${PAPER};
  }
  .phone img { display:block; }
  /* 重なりの真ん中に置く。流れが「左上 → 右下」だと分かる位置 */
  .arrow {
    position:absolute; top:46%; left:50%; transform:translate(-50%,-50%) rotate(28deg);
    width:120px; height:120px; border-radius:50%;
    background:${PRIMARY}; color:#fff;
    display:grid; place-items:center;
    font-size:74px; font-weight:800; line-height:1;
    box-shadow: 0 12px 30px rgba(190,60,110,.4);
  }
`;

await mkdir(OUT_DIR, { recursive: true });
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: W, height: H } });

for (const [i, shot] of SHOTS.entries()) {
  const stage = shot.pair
    ? `<div class="pair">
         ${phone(await dataUri(shot.pair[0]), 700, CROP_BOTTOM_SHARESHEET)}
         ${phone(await dataUri(shot.pair[1]), 700)}
         <div class="arrow">→</div>
       </div>`
    : phone(await dataUri(shot.file), 1000);

  await page.setContent(`<style>${css}</style>
    <div class="band">
      <div class="caption" style="font-size:${captionSize(shot.caption)}px">${captionHtml(shot.caption)}</div>
      <div class="sub">${shot.sub}</div>
    </div>
    <div class="stage">${stage}</div>`);

  const png = await page.screenshot();
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  if (w !== W || h !== H) throw new Error(`寸法が違います: ${w}x${h}`);

  const name = `${String(i + 1).padStart(2, '0')}.png`;
  await writeFile(`${OUT_DIR}/${name}`, png);
  console.log(`✓ ${OUT_DIR}/${name}  ${w}x${h}  ${(png.length / 1024).toFixed(0)}KB  ${shot.caption}`);
}

await browser.close();
