/**
 * App Store 用のスクリーンショットを組み立てる。
 *
 *   node store/make-screenshots.mjs
 *
 * photo/ に入れた実機のスクリーンショットを、App Store Connect が要求する
 * 6.9インチ枠 1320x2868 のキャンバスに載せ、上にキャプションの帯を置く。
 *
 * ・元画像を切り取って寸法を変えるとアップロードで弾かれるが、
 *   所定寸法のキャンバスに載せるのは自由。撮り直さずに枠を合わせられる
 * ・ステータスバー(時刻・電池)は top の割合指定で切り落とす
 * ・photo/ は .gitignore 対象(実機の記録が写るため手元のみ)。
 *   組み上がりだけ store/screenshots/ に残す
 *
 * COLORS と FONT をアプリのテーマに合わせて書き換えて使う。
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

/** 6.9インチが必須。6.5インチ(1284x2778)も出すなら SIZES に足す */
const SIZES = [
  { W: 1320, H: 2868, dir: 'store/screenshots' },
  { W: 1284, H: 2778, dir: 'store/screenshots-65' },
];

/** 版面の基準。ここからの比で余白と文字を決める */
const BASE_W = 1320;

// ---- アプリのテーマに合わせて書き換える ----
const PAPER = '#f5f5f0';   // 背景
const INK = '#33362f';     // 見出し文字
const MUTED = '#8b9085';   // サブ文字
const ACCENT = '#cf4a41';  // 差し色
const FONT = 'Yu Gothic UI, Meiryo, Hiragino Sans, sans-serif';

/** 帯の高さ(基準版面での値)。スクリーンショットはこの下に置く */
const BASE_BAND = 430;
/** 載せるスクリーンショットの幅(少し縮めて左右に余白を作る) */
const BASE_SHOT_W = 1080;

/**
 * photo/ 内のファイル名・キャプション・切り出し範囲。
 * top/bottom は元画像の高さに対する割合(既定 top でステータスバーを落とす)。
 */
const SHOTS = [
  { file: 'IMG_0001.PNG', title: 'キャプション1(最重要の1枚目)', sub: 'サブテキスト' },
  { file: 'IMG_0002.PNG', title: 'キャプション2', sub: 'サブテキスト' },
  { file: 'IMG_0003.PNG', title: 'キャプション3', sub: 'サブテキスト' },
  { file: 'IMG_0004.PNG', title: 'キャプション4', sub: 'サブテキスト' },
  { file: 'IMG_0005.PNG', title: 'キャプション5', sub: 'サブテキスト' },
];

const DEFAULT_TOP = 0.045;

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function band(W, bandH, scale, title, sub) {
  const titleSize = Math.round(72 * scale);
  const subSize = Math.round(40 * scale);
  const pad = Math.round(90 * scale);
  return Buffer.from(`<svg width="${W}" height="${bandH}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${bandH}" fill="${PAPER}"/>
    <rect x="${pad}" y="${Math.round(bandH * 0.30)}" width="${Math.round(10 * scale)}" height="${titleSize}" fill="${ACCENT}"/>
    <text x="${pad + Math.round(34 * scale)}" y="${Math.round(bandH * 0.30) + titleSize - Math.round(12 * scale)}"
      font-family="${FONT}" font-size="${titleSize}" font-weight="700" fill="${INK}">${esc(title)}</text>
    <text x="${pad + Math.round(34 * scale)}" y="${Math.round(bandH * 0.30) + titleSize + subSize + Math.round(24 * scale)}"
      font-family="${FONT}" font-size="${subSize}" fill="${MUTED}">${esc(sub)}</text>
  </svg>`);
}

for (const { W, H, dir } of SIZES) {
  const scale = W / BASE_W;
  const bandH = Math.round(BASE_BAND * scale);
  const shotW = Math.round(BASE_SHOT_W * scale);
  await mkdir(dir, { recursive: true });

  for (const [i, shot] of SHOTS.entries()) {
    const src = sharp(`photo/${shot.file}`);
    const meta = await src.metadata();
    const top = Math.round(meta.height * (shot.top ?? DEFAULT_TOP));
    const bottom = Math.round(meta.height * (shot.bottom ?? 0));
    const cropped = await src
      .extract({ left: 0, top, width: meta.width, height: meta.height - top - bottom })
      .resize({ width: shotW })
      .png()
      .toBuffer();

    const shotMeta = await sharp(cropped).metadata();
    const out = `${dir}/${String(i + 1).padStart(2, '0')}-${shot.file.replace(/\.png$/i, '')}.png`;

    await sharp({ create: { width: W, height: H, channels: 3, background: PAPER } })
      .composite([
        { input: band(W, bandH, scale, shot.title, shot.sub), top: 0, left: 0 },
        {
          input: cropped,
          top: bandH,
          left: Math.round((W - shotW) / 2),
          // 画面より縦に長い場合は下がはみ出すが、composite が切ってくれる
        },
      ])
      .png()
      .toFile(out);

    console.log(`${out} (${W}x${H}, shot ${shotW}x${shotMeta.height})`);
  }
}
