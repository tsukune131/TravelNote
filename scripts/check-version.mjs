#!/usr/bin/env node
/**
 * 表示されるバージョンが2か所で食い違っていないか確かめる。
 *
 * 利用者に見える版数は**2つの場所**にある:
 *
 *   package.json の version   → 設定画面の「バージョン」(vite が焼き込む)
 *   MARKETING_VERSION         → App Store と TestFlight に出る版数
 *
 * どちらか片方だけ上げても**ビルドは普通に通る**。だから気づけない ──
 * 実際に package.json が 0.0.0 のまま、App Store 側だけ 1.0 になっていて、
 * 設定画面が「バージョン 0.0.0」と出す状態で審査直前まで来ていた。
 *
 * ビルド番号(CURRENT_PROJECT_VERSION)はここでは見ない。あれは
 * fastlane が TestFlight の最新+1 で毎回入れ直すもので、手で揃えるものではない。
 *
 * リリースで版数を上げるときは、**両方**を同じ値にすること。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PBXPROJ = path.join(ROOT, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');

const { version } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

/*
 * pbxproj には設定(Debug/Release × ターゲット数)のぶんだけ同じ行が並ぶ。
 * **全部を集めて種類を数える。** 1つだけ見て満足すると、
 * 拡張(ShareExtension)だけ古い版数のまま、という食い違いを見逃す。
 */
const found = [...readFileSync(PBXPROJ, 'utf8').matchAll(/MARKETING_VERSION = ([^;]+);/g)].map(
  (m) => m[1].trim(),
);

if (found.length === 0) {
  console.error(`✗ ${path.relative(ROOT, PBXPROJ)} に MARKETING_VERSION が見つかりません`);
  process.exit(1);
}

const marketing = [...new Set(found)];

if (marketing.length > 1) {
  console.error(
    `✗ MARKETING_VERSION がターゲットごとに違います: ${marketing.join(', ')}\n` +
      '  本体と拡張で版数がずれています。すべて同じ値にしてください。',
  );
  process.exit(1);
}

if (marketing[0] !== version) {
  console.error(
    `✗ バージョンが食い違っています\n` +
      `    package.json        ${version}      → 設定画面に出る\n` +
      `    MARKETING_VERSION   ${marketing[0]}      → App Store に出る\n\n` +
      '  どちらかに揃えてください(リリース時は両方を上げる)。',
  );
  process.exit(1);
}

console.log(`✓ バージョン ${version}(package.json と MARKETING_VERSION ${found.length}件が一致)`);
