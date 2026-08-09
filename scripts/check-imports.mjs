#!/usr/bin/env node
/**
 * `src/` が import している外部パッケージが、すべて package.json に
 * 宣言されているか確かめる。
 *
 * なぜ要るか: 手元の node_modules には、過去に入れて package.json からは
 * 消えたパッケージが residue として残ることがある。すると
 * **手元のビルドだけ通って CI で落ちる**。実際に @capacitor/browser で踏んだ。
 * `npm ci` で消えるので CI は正しく落ちたが、気づくのは push のあとだった。
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const UNIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(UNIT, 'package.json'), 'utf8'));
const declared = new Set([
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
]);

/** `@scope/name` は2階層、それ以外は1階層で正規化する */
function packageOf(spec) {
  return spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
}

const used = new Map(); // package -> 最初に見つけたファイル

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    const text = readFileSync(full, 'utf8');
    // `from '...'` と `import('...')` の両方を拾う。相対パスと node: は除く
    for (const m of text.matchAll(/(?:from|import)\s*\(?\s*'([^']+)'/g)) {
      const spec = m[1];
      if (spec.startsWith('.') || spec.startsWith('node:')) continue;
      const name = packageOf(spec);
      if (!used.has(name)) used.set(name, path.relative(UNIT, full));
    }
  }
}

walk(path.join(UNIT, 'src'));

const missing = [...used].filter(([name]) => !declared.has(name));

if (missing.length > 0) {
  console.error('package.json に宣言されていない import があります:\n');
  for (const [name, file] of missing) console.error(`  ${name}  (${file})`);
  console.error('\n`npm install <パッケージ>` で宣言してください。');
  console.error('手元の node_modules に残っているだけだと、npm ci をする CI で落ちます。');
  process.exit(1);
}

console.log(`✓ src が使う ${used.size} パッケージはすべて宣言済み`);
