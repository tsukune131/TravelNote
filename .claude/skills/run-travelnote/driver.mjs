#!/usr/bin/env node
/**
 * たびのしおり を実際に起動して触るためのドライバ。
 *
 *   node .claude/skills/run-travelnote/driver.mjs smoke
 *   node .claude/skills/run-travelnote/driver.mjs repl <<'EOF' ... EOF
 *
 * なぜ chromium-cli ではないか:
 * この開発機は Windows で chromium-cli が無い。代わりに playwright-core
 * (devDependency。ブラウザ本体はダウンロードしない)から、**すでに入っている
 * Chrome / Edge** を叩く。実機 iOS は Windows からは触れないので、
 * iPhone 相当のビューポートで WKWebView の代わりをさせている。
 *
 * Vite の dev サーバはこのドライバが起動して、終了時に落とす。
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UNIT = path.resolve(HERE, '../../..');
const SHOTS = path.join(UNIT, '.shots');

const PORT = Number(process.env.TN_PORT ?? 5199);
const URL = process.env.TN_URL ?? `http://127.0.0.1:${PORT}/`;
const HEADED = process.env.TN_HEADED === '1';
const DARK = process.env.TN_DARK === '1';
const LOCALE = process.env.TN_LOCALE ?? 'ja-JP';

/** Dexie のデータベース名(src/db/db.ts と揃える) */
const DB_NAME = 'tabinoshiori';

/* ───────────────── ブラウザを見つける ───────────────── */

const CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

function findBrowser() {
  // 明示指定は絶対。黙って別のブラウザにフォールバックすると、
  // 「指定したつもりの別物」で検証してしまう
  if (process.env.TN_BROWSER) {
    if (existsSync(process.env.TN_BROWSER)) return process.env.TN_BROWSER;
    console.error(`TN_BROWSER が指す実行ファイルがありません: ${process.env.TN_BROWSER}`);
    process.exit(2);
  }
  const hit = CANDIDATES.find((p) => existsSync(p));
  if (!hit) {
    console.error(
      'Chrome も Edge も見つかりませんでした。\n' +
        'TN_BROWSER に実行ファイルのパスを指定してください。\n' +
        '探した場所:\n  ' + CANDIDATES.join('\n  '),
    );
    process.exit(2);
  }
  return hit;
}

/* ───────────────── dev サーバ ───────────────── */

function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' }, () => {
      s.destroy();
      resolve(true);
    });
    s.on('error', () => resolve(false));
    s.setTimeout(500, () => {
      s.destroy();
      resolve(false);
    });
  });
}

async function startServer() {
  if (await portOpen(PORT)) {
    console.log(`· dev サーバは既に :${PORT} で動いています(起動しません)`);
    return null;
  }
  console.log(`· dev サーバを :${PORT} で起動します`);
  const child = spawn('npm', ['run', 'dev', '--', '--port', String(PORT), '--host', '127.0.0.1'], {
    cwd: UNIT,
    shell: true,
    stdio: 'ignore',
    // POSIX ではプロセスグループごと落とせるようにする。Windows では taskkill /T を使う
    detached: process.platform !== 'win32',
  });
  for (let i = 0; i < 60; i += 1) {
    await new Promise((r) => setTimeout(r, 400));
    if (await portOpen(PORT)) return child;
  }
  throw new Error(`dev サーバが :${PORT} で立ち上がりませんでした`);
}

/**
 * `shell: true` で起動しているので、child.pid は cmd.exe / sh のもの。
 * 実際の vite はその子なので、**ツリーごと**落とさないとポートが掴まれたまま残る。
 *
 * taskkill は必ず spawnSync で。非同期で投げた直後に process.exit() すると
 * 実行される前にこちらが消えて、dev サーバが生き残る(実際に踏んだ)。
 */
function stopServer(child) {
  if (!child) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM'); // detached なのでプロセスグループを落とす
    } catch {
      child.kill('SIGTERM');
    }
  }
}

let cleaned = false;
function registerCleanup(child) {
  if (!child) return;
  const run = () => {
    if (cleaned) return;
    cleaned = true;
    stopServer(child);
  };
  process.on('exit', run);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => {
      run();
      process.exit(130);
    });
  }
  process.on('uncaughtException', (err) => {
    console.error(err?.stack ?? String(err));
    run();
    process.exit(1);
  });
}

/* ───────────────── ページを開く ───────────────── */

async function open() {
  mkdirSync(SHOTS, { recursive: true });
  // ブラウザの解決を先に済ませる。dev サーバを立ててから落ちると後片付けが要る
  const executablePath = findBrowser();
  const server = await startServer();
  // 例外でも Ctrl-C でも、出力を head でちょん切られて EPIPE で死んでも、
  // dev サーバを道連れにする。残るとポートを掴んだままになる
  registerCleanup(server);
  const browser = await chromium.launch({ executablePath, headless: !HEADED });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 15 相当
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: LOCALE,
    timezoneId: 'Asia/Tokyo',
    colorScheme: DARK ? 'dark' : 'light',
  });
  // 既定の 30 秒は長すぎる。セレクタを間違えたときに待たされるだけなので短くする
  ctx.setDefaultTimeout(8000);
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });

  await page.goto(URL, { waitUntil: 'networkidle' });
  return { server, browser, page, errors };
}

async function close({ server, browser, errors }, label) {
  await browser.close();
  stopServer(server);
  console.log(`\n── ${label} / ブラウザのエラー ──`);
  console.log(errors.length === 0 ? 'なし' : errors.join('\n'));
  process.exit(errors.length === 0 ? 0 : 1);
}

const shot = (page, name) =>
  page.screenshot({ path: path.join(SHOTS, `${name}.png`) }).then(() => {
    console.log(`  shot: .shots/${name}.png`);
  });

/** 端末のデータを消して初期状態に戻す。DB 名だけがアプリとの結合点 */
async function reset(page) {
  await page.evaluate(
    (name) =>
      new Promise((res) => {
        const req = indexedDB.deleteDatabase(name);
        req.onsuccess = req.onerror = req.onblocked = () => res();
      }),
    DB_NAME,
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
}

/**
 * 旅と予定を UI 経由で作る。
 * 内部スキーマに触らないので、DB の形が変わっても壊れない
 * (代わりに UI のセレクタには依存する)。
 *
 * ⚠️ **日本語UI前提。** `TN_LOCALE=en-US` で起動するとボタン名が変わって当たらない。
 *    英語表示を見たいだけなら、日本語で seed してから locale を変えるか、
 *    素の空状態のスクリーンショットを撮る。
 */
async function seed(page, { title = '京都・大阪 3泊4日', places = [], offsetStart = -1, offsetEnd = 2 } = {}) {
  // reset 直後はようこそ画面が出ている。旅を作るには先に抜ける必要がある
  await skipWelcome(page);
  // ⚠️ toISOString() は UTC。深夜に走らせるとアプリのローカル日付と1日ずれ、
  //    「今日の Day」の検証が黙って無意味になる(実際に踏んだ)。
  //    アプリ側の toPlainDate と同じくローカルの年月日で組む
  const iso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const base = new Date();
  const s = new Date(base);
  s.setDate(s.getDate() + offsetStart);
  const e = new Date(base);
  e.setDate(e.getDate() + offsetEnd);

  await page.getByRole('button', { name: /旅をつくる/ }).click();
  await page.waitForSelector('#trip-name');
  await page.fill('#trip-name', title);
  await page.fill('#trip-start', iso(s));
  await page.fill('#trip-end', iso(e));
  await page.locator('.sheet').getByRole('button', { name: 'つくる', exact: true }).click();
  await page.waitForSelector('.daytabs .daytab');

  const input = page.getByPlaceholder('場所の名前');
  for (const name of places) {
    await input.fill(name);
    await input.press('Enter');
    await page.waitForTimeout(120);
  }
  console.log(`  seed: 「${title}」に ${places.length} 件`);
}

/** すでに開いている旅の、いま見ている Day に予定を足す */
async function seed2(page, places) {
  const input = page.getByPlaceholder('場所の名前');
  for (const name of places) {
    await input.fill(name);
    await input.press('Enter');
    await page.waitForTimeout(120);
  }
  console.log(`  追加: ${places.length} 件`);
}

/**
 * ようこそ画面が出ていたら抜ける。
 * 初回起動でしか出ないが、`reset` のたびに戻ってくる。
 */
async function skipWelcome(page) {
  if ((await page.locator('.welcome').count()) === 0) return false;
  await page.locator('.welcome .btn').click();
  await page.waitForTimeout(300);
  return true;
}

/**
 * 長押し(アクションメニューを開く)。
 * SwipeRow は pointerdown から 480ms 指が動かなければ発火する。
 */
async function longPress(page, selector, ms = 700) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`要素が見つかりません: ${selector}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
  await page.waitForTimeout(250);
}

/**
 * 横スワイプ(右=行った / 左=削除)。
 * 72px を超えると発火する。縦スクロールと区別するため、
 * **最初に横へ大きく動かしてから**離す。
 */
async function swipe(page, selector, direction) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`要素が見つかりません: ${selector}`);
  const y = box.y + box.height / 2;
  const from = direction === 'right' ? box.x + 20 : box.x + box.width - 20;
  const sign = direction === 'right' ? 1 : -1;
  await page.mouse.move(from, y);
  await page.mouse.down();
  for (const dx of [15, 45, 80, 100]) await page.mouse.move(from + sign * dx, y, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(350);
}

/** 予定に時刻を入れる(詳細シート経由) */
async function setTime(page, name, hhmm) {
  await page.locator('.ev-main').filter({ hasText: name }).first().click();
  await page.waitForSelector('.sheet');
  const toggle = page.getByLabel('時刻を決めない');
  if (await toggle.isChecked()) {
    // controlled checkbox の状態は IndexedDB 往復のあとに反映される。
    // uncheck() は即座に検証してしまうので click() + waitForSelector を使う
    await toggle.click();
    await page.waitForSelector('#ev-time');
  }
  await page.fill('#ev-time', hhmm);
  await page.locator('.sheet-head .iconbtn').last().click();
  await page.waitForTimeout(250);
}

/**
 * 予定に所要時間を入れる。
 * これが無いと「終わる時刻」が動かないので、
 * **間に合わない警告を出すシナリオが組めない**(実際に詰まった)。
 */
async function setDuration(page, name, minutes) {
  await page.locator('.ev-main').filter({ hasText: name }).first().click();
  await page.waitForSelector('.sheet');
  const toggle = page.getByLabel('時刻を決めない');
  if (await toggle.isChecked()) {
    await toggle.click();
    await page.waitForSelector('#ev-time');
  }
  await page.selectOption('#ev-dur', String(minutes));
  await page.locator('.sheet-head .iconbtn').last().click();
  await page.waitForTimeout(250);
}

/* ───────────────── smoke: 通しで一周する ───────────────── */

async function smoke() {
  const s = await open();
  const { page } = s;
  const step = (m) => console.log(`\n▶ ${m}`);

  step('初回起動 → ようこそ');
  await reset(page);
  await page.waitForSelector('.welcome');
  console.log('  見出し:', await page.locator('.welcome-body h1').textContent());
  await shot(page, 'smoke-00-welcome');
  await skipWelcome(page);

  step('旅一覧(空)');
  await page.waitForSelector('text=旅の一覧');
  console.log('  空状態:', await page.locator('.empty b').textContent());
  await shot(page, 'smoke-01-empty');

  step('旅をつくる → 空状態のチップ → 予定を連続で追加');
  await seed(page, { places: [] });
  console.log('  空状態のチップ:', (await page.locator('.seed').allTextContents()).join(' '));
  await seed2(page, ['東京駅', '二条城', '本家第一旭 たかばし本店', '清水寺', '% ARABICA 京都東山']);
  console.log('  Day タブ:', await page.locator('.daytab').count());
  console.log('  予定:', await page.locator('.ev').count());
  const pins = await page
    .locator('.ev-rail .pin')
    .evaluateAll((els) => els.map((e) => `${e.textContent.trim()}(${e.className.replace('pin ', '')})`));
  console.log('  推定カテゴリ:', pins.join(' '));
  await shot(page, 'smoke-02-timeline');

  step('詳細シート — 時刻・所要時間・リンク');
  await page.locator('.ev-main').filter({ hasText: '二条城' }).click();
  await page.waitForSelector('.sheet');
  await page.getByLabel('時刻を決めない').click();
  await page.waitForSelector('#ev-time');
  await page.fill('#ev-time', '11:20');
  await page.selectOption('#ev-dur', '90');
  await page.getByPlaceholder('https://tabelog.com/...').fill('https://nijo-jo.city.kyoto.lg.jp/');
  await page.locator('.sheet').getByRole('button', { name: '追加', exact: true }).click();
  await page.waitForTimeout(200);
  console.log('  リンクのラベル自動判定:', await page.locator('.linkrow .lbl').first().textContent());
  await shot(page, 'smoke-03-sheet');
  await page.locator('.sheet-head .iconbtn').last().click();
  await page.waitForTimeout(250);

  // seed は「昨日〜3日後」で作るので、今日は必ず Day 2(index 1)
  step('今日の Day に現在時刻ライン');
  await page.locator('.daytab').nth(1).click();
  await page.waitForTimeout(200);
  const input = page.getByPlaceholder('場所の名前');
  await input.fill('嵐山 竹林の小径');
  await input.press('Enter');
  await page.waitForTimeout(200);
  await setTime(page, '嵐山 竹林の小径', '09:00');
  console.log('  現在時刻ライン:', (await page.locator('.nowline').count()) > 0 ? 'あり' : 'なし');
  await shot(page, 'smoke-04-nowline');

  step('地図ボタン → 初回だけ地図アプリを聞く');
  await page.locator('.ev-map').first().click();
  await page.waitForSelector('.sheet');
  console.log('  聞かれた:', await page.locator('.sheet-head h2').textContent());
  await page.locator('.sheet-head .iconbtn').last().click();
  await page.waitForTimeout(200);

  step('戻る → 一覧 → 再読み込みで「今日」へ直行するか');
  await page.locator('.topbar .iconbtn').first().click();
  await page.waitForTimeout(300);
  console.log('  状態チップ:', await page.locator('.chip').first().textContent());
  await shot(page, 'smoke-05-list');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const landed = await page.locator('.daytabs').count();
  console.log('  旅の画面に直行:', landed > 0 ? 'した' : 'しなかった');
  console.log('  開いた Day:', await page.locator('.daytab[aria-selected="true"] b').textContent());
  await shot(page, 'smoke-06-landing');

  await close(s, 'smoke');
}

/* ───────────────── repl: 好きに触る ───────────────── */

const HELP = `
コマンド(引数の区切りは " :: ")

  goto  :: <url|/>            ページを開く
  reset                        端末のデータを消して初期状態へ
  seed  :: [タイトル] :: [場所,場所,...]   旅と予定を UI 経由で作る
  time  :: <予定名> :: <HH:MM>  予定に時刻を入れる
  dur   :: <予定名> :: <分>     所要時間を入れる(15/30/45/60/90/120/180/240)
  click :: <selector>          クリック(Playwright セレクタ)
  longpress :: <selector>      長押し → 予定のアクションメニュー
  swipe :: <selector> :: right|left   右=行った / 左=削除
  fill  :: <selector> :: <値>  入力
  press :: <selector> :: <キー> キー送信(Enter など)
  text  :: <selector>          一致した要素のテキストを全部出す
  count :: <selector>          一致した件数
  wait  :: <selector|ms>       出現待ち / ミリ秒待ち
  day   :: <n>                 Day タブの n 番目(1始まり)
  dark  :: on|off              配色を切り替えて再読み込み
  eval  :: <js>                ページ内で評価して結果を出す
  ss    :: <名前>              .shots/<名前>.png に保存
  errors                       これまでのブラウザのエラーを出す
  help / quit
`;

async function repl() {
  const s = await open();
  const { page, errors } = s;
  console.log(HELP);

  const rl = createInterface({ input: process.stdin, terminal: false });
  for await (const line of rl) {
    const raw = line.trim();
    if (raw.length === 0 || raw.startsWith('#')) continue;
    const [cmd, ...args] = raw.split('::').map((x) => x.trim());
    console.log(`> ${raw}`);
    try {
      switch (cmd) {
        case 'goto':
          await page.goto(args[0]?.startsWith('http') ? args[0] : URL, { waitUntil: 'networkidle' });
          break;
        case 'reset':
          await reset(page);
          break;
        case 'seed':
          await seed(page, {
            ...(args[0] ? { title: args[0] } : {}),
            places: args[1] ? args[1].split(',').map((x) => x.trim()) : [],
          });
          break;
        case 'time':
          await setTime(page, args[0], args[1]);
          break;
        case 'dur':
          await setDuration(page, args[0], Number(args[1]));
          break;
        case 'click':
          await page.locator(args[0]).first().click();
          await page.waitForTimeout(200);
          break;
        case 'longpress':
          await longPress(page, args[0]);
          break;
        case 'swipe':
          await swipe(page, args[0], args[1] === 'left' ? 'left' : 'right');
          break;
        case 'fill':
          await page.locator(args[0]).first().fill(args[1] ?? '');
          break;
        case 'press':
          await page.locator(args[0]).first().press(args[1] ?? 'Enter');
          await page.waitForTimeout(200);
          break;
        case 'text':
          console.log((await page.locator(args[0]).allTextContents()).join(' | ') || '(なし)');
          break;
        case 'count':
          console.log(await page.locator(args[0]).count());
          break;
        case 'wait':
          if (/^\d+$/.test(args[0])) await page.waitForTimeout(Number(args[0]));
          else await page.waitForSelector(args[0]);
          break;
        case 'day':
          await page.locator('.daytab').nth(Number(args[0]) - 1).click();
          await page.waitForTimeout(250);
          break;
        case 'dark':
          await page.emulateMedia({ colorScheme: args[0] === 'off' ? 'light' : 'dark' });
          await page.waitForTimeout(200);
          break;
        case 'eval':
          console.log(JSON.stringify(await page.evaluate(args.join(' :: ')), null, 2));
          break;
        case 'ss':
          await shot(page, args[0] ?? 'shot');
          break;
        case 'errors':
          console.log(errors.length === 0 ? 'なし' : errors.join('\n'));
          break;
        case 'help':
          console.log(HELP);
          break;
        case 'quit':
          await close(s, 'repl');
          break;
        default:
          console.log(`不明なコマンド: ${cmd}(help で一覧)`);
      }
    } catch (err) {
      console.log(`✗ ${err.message.split('\n')[0]}`);
    }
  }
  await close(s, 'repl');
}

/* ───────────────── entry ───────────────── */

const mode = process.argv[2] ?? 'smoke';
if (mode === 'smoke') await smoke();
else if (mode === 'repl') await repl();
else {
  console.error(`使い方: node driver.mjs [smoke|repl]\n${HELP}`);
  process.exit(2);
}
