#!/usr/bin/env node
/**
 * バンドルの上限。`npm run build` のあとに走らせる。
 *
 * 今のサイズが問題なのではない ── **あとから重いライブラリが入るのが問題**。
 * 実測では本番ビルドでタイムラインが見えるまで 100ms 前後で、
 * その 86% は React と Dexie(どちらも起動時に必要)。
 * だから「今すぐ削る」ではなく「気づかないうちに倍にしない」ための門にする。
 *
 * 上限に当たったら、まず本当に必要か問う。必要なら React.lazy で
 * 起動時から外せないかを見る。それでも要るなら、この数字を上げて理由を書く。
 */
import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UNIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(UNIT, 'dist', 'assets');

/** 2026-08-09 時点: JS 345 KB(gzip 112)/ CSS 13 KB(gzip 3.5)。約2割の余裕 */
const BUDGET = {
  js: { raw: 420 * 1024, gzip: 135 * 1024 },
  css: { raw: 24 * 1024, gzip: 7 * 1024 },
};

function measure(ext) {
  let raw = 0;
  let gzip = 0;
  for (const name of readdirSync(ASSETS)) {
    if (!name.endsWith(ext)) continue;
    const buf = readFileSync(path.join(ASSETS, name));
    raw += buf.length;
    gzip += gzipSync(buf).length;
  }
  return { raw, gzip };
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

try {
  statSync(ASSETS);
} catch {
  console.error('dist/assets がありません。先に npm run build を実行してください');
  process.exit(2);
}

let failed = false;
for (const [ext, budget] of [
  ['.js', BUDGET.js],
  ['.css', BUDGET.css],
]) {
  const got = measure(ext);
  for (const kind of ['raw', 'gzip']) {
    const over = got[kind] > budget[kind];
    if (over) failed = true;
    const pct = Math.round((got[kind] / budget[kind]) * 100);
    console.log(
      `${over ? '✗' : '✓'} ${ext.slice(1).toUpperCase()} ${kind.padEnd(4)} ${kb(got[kind]).padStart(9)} / ${kb(budget[kind])}  (${pct}%)`,
    );
  }
}

if (failed) {
  console.error(
    '\nバンドルが上限を超えました。\n' +
      '足したものが本当に起動時から要るか確かめ、要らないなら React.lazy で外す。\n' +
      '要るなら scripts/size-budget.mjs の数字を上げて、理由をコミットに書く。',
  );
  process.exit(1);
}
