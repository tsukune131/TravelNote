---
name: run-travelnote
description: Build, run, and drive たびのしおり (TravelNote). Use when asked to start the app, run the dev server, take a screenshot of a screen, click through a flow, verify a UI change works, build the web bundle, typecheck, lint, or sync the Capacitor iOS project.
---

React + Vite + Capacitor の iOSアプリ。開発は Windows で、**実機 iOS は触れない**。
代わりに `.claude/skills/run-travelnote/driver.mjs` が **すでに入っている Chrome / Edge** を
iPhone 相当のビューポート(390×844・ja-JP・Asia/Tokyo)で起動して、WKWebView の代わりにする。
dev サーバはドライバが自分で立てて、終了時に落とす。

以下のパスはすべて `TravelNote/` からの相対。

## Prerequisites

- **Node 22** と npm(検証時 v22.14.0 / npm 10.9.2)
- **Chrome か Edge が入っていること。** ドライバはブラウザ本体をダウンロードしない
  (`playwright-core` は devDependency に入っているが、実行ファイルは既存のものを使う)。
  自動で探す場所は driver.mjs の `CANDIDATES`。別の場所にあるなら `TN_BROWSER` で指定する

Linux / macOS の CI で回すなら Chromium を入れる:

```bash
sudo apt-get update && sudo apt-get install -y chromium
```

## Setup

```bash
npm install
```

## Build / Typecheck / Lint

```bash
npx tsc -b --force     # tsconfig.json は references のソリューション形式。--noEmit は使えない
npm run build          # tsc -b && vite build。base: './' の相対パスビルド
npm run lint           # oxlint
npx cap sync ios       # dist/ を iOS プロジェクトへ反映
```

`npm run build` が通ったら `dist/index.html` のアセットが `./assets/...` に
なっていることを確認する。絶対パスになっていると **WKWebView で全部404になり実機が真っ白**。

## Run (agent path)

### 1. 通しで一周する

```bash
node .claude/skills/run-travelnote/driver.mjs smoke
```

旅の作成 → 予定5件の連続追加 → 詳細シート(時刻・所要時間・リンク)→
今日の Day で現在時刻ライン → 地図アプリの初回選択 → 一覧へ戻る →
再読み込みで「今日」へ直行、まで通す。

**ブラウザに `pageerror` / `console.error` が1件でもあれば exit 1。**
スクリーンショットは `.shots/smoke-*.png`(gitignore 済み)。

### 2. 好きに触る

標準入力に1行1コマンドを流す。tmux は要らない。

```bash
node .claude/skills/run-travelnote/driver.mjs repl <<'EOF'
reset
seed :: 沖縄 2泊3日 :: 那覇空港,首里城,国際通り,ひめゆりの塔,古宇利島
count :: .ev
text :: .ev-name
time :: 首里城 :: 10:30
day :: 2
text :: .empty b
dark :: on
ss :: my-shot
errors
quit
EOF
```

引数の区切りは **` :: `**。セレクタに空白が入っても壊れないようにするため。

| コマンド | 何をするか |
|---|---|
| `reset` | IndexedDB を消して初期状態へ(+再読み込み) |
| `seed :: [タイトル] :: [場所,場所,...]` | 旅と予定を **UI 経由で**作る。**旅一覧の画面にいるときだけ・日本語UIのときだけ**動く |
| `time :: <予定名> :: <HH:MM>` | 予定に時刻を入れる(詳細シートを開いて閉じる)。同じく日本語UI前提 |
| `click / fill / press :: <selector> [:: <値>]` | Playwright セレクタで操作 |
| `text :: <selector>` | 一致した要素のテキストを全部出す |
| `count :: <selector>` | 一致件数 |
| `wait :: <selector\|ms>` | 出現待ち / ミリ秒待ち |
| `day :: <n>` | Day タブの n 番目(1始まり) |
| `dark :: on\|off` | 配色を切り替える |
| `eval :: <js>` | ページ内で評価して結果を出す |
| `ss :: <名前>` | `.shots/<名前>.png` に保存 |
| `errors` | それまでのブラウザのエラー |
| `help` / `quit` | |

**スクリーンショットは必ず開いて見ること。** 真っ白なら起動できていない。

### 環境変数

| 変数 | 既定 | 用途 |
|---|---|---|
| `TN_BROWSER` | 自動検出 | Chrome / Edge の実行ファイルのパス |
| `TN_PORT` | `5199` | dev サーバのポート |
| `TN_URL` | `http://127.0.0.1:<TN_PORT>/` | 別の場所で動いているものを見る |
| `TN_HEADED` | – | `1` でブラウザを表示する |
| `TN_DARK` | – | `1` でダークモードで起動 |
| `TN_LOCALE` | `ja-JP` | `en-US` にすると i18n のフォールバックを確認できる。**ただし `seed` / `time` は日本語UI前提なので動かない**(空状態の見た目を確かめる用) |

## Run (human path)

```bash
npm run dev    # → http://localhost:5173 。Ctrl-C で止める
```

ブラウザの開発者ツールでモバイル表示(390×844)にしないと、
下端固定の追加バーとセーフエリアの見え方が実機と違う。

## Test

**テストランナーは入っていない。** 純粋ロジックの検証は使い捨ての `tsx` スクリプトで
実行してきた(履歴は git log を参照)。品質の門は `npx tsc -b --force` と
`npm run lint`、そして上の `smoke`。

## Gotchas

- **`npx tsc` は TypeScript ではない。** プロジェクト直下以外から叩くと
  npm が `tsc@2.0.4` という別パッケージを取ってきて
  「This is not the tsc command you are looking for」と出る。
  **必ず `TravelNote/` に `cd` してから**叩く
- **`tsc --noEmit` は使えない。** `tsconfig.json` が references のソリューション形式なので
  `tsc -b` を使う(各プロジェクト側で `noEmit: true` なので出力は出ない)
- **`.uncheck()` / `.check()` は落ちる。** 「時刻を決めない」などのチェックボックスは
  IndexedDB 往復のあとに状態が変わる controlled component。Playwright の
  `uncheck()` はクリック直後に検証するので "did not change its state" で失敗する。
  **`click()` してから `waitForSelector('#ev-time')` で待つ**(driver.mjs の `setTime` がそうしている)
- **`getByRole('button', { name: 'つくる' })` は2件に当たる。** 旅一覧の
  「+ 旅をつくる」と部分一致する。`.locator('.sheet').getByRole(..., { exact: true })` で絞る
- **dev サーバを殺し損ねるとポートを掴んだまま残る。** `shell: true` で起動しているので
  `child.pid` は cmd.exe のもの。ツリーごと `taskkill /T /F` する必要があり、
  **かつ `spawnSync` で**。非同期で投げた直後に `process.exit()` すると実行前に消える。
  ドライバは `process.on('exit')` でも片付けるので、出力を `head` で切って
  EPIPE で死んでも残らない
- **`seed` は旅一覧の画面にいるときだけ動く。** 旅の画面から呼ぶと
  「旅をつくる」ボタンが無くてタイムアウトする。先に `reset` するのが確実
- **`seed` の日程は今日を挟む4日固定**(昨日〜3日後)。タイトルに「2泊3日」と書いても
  日数は変わらない。**今日の Day が必ず存在する**ので現在時刻ラインを試せる、という設計
- **Git Bash は POSIX パスを勝手に Windows パスへ変換する。** `TN_BROWSER=/nope/nope` が
  `C:/Program Files/Git/nope/nope` になる。Windows のパスをそのまま渡すこと
  (シングルクォートで囲む)
- **Capacitor プラグインは静的 import。** 動的 import で実機が固まった前例がある
  (CLAUDE.md 技術メモ)
- 地図は `comgooglemaps://` ではなく `https://www.google.com/maps/...` を開く。
  Universal Link なのでアプリが入っていれば開き、`LSApplicationQueriesSchemes` が要らない。
  **ブラウザで試すと Google マップの Web が新しいタブで開くだけ**なので、
  ドライバは開いたかどうかまでは確かめていない

## Troubleshooting

- **`Chrome も Edge も見つかりませんでした`**: `TN_BROWSER` に実行ファイルの
  絶対パスを渡す。例: `TN_BROWSER='C:\Program Files\Google\Chrome\Application\chrome.exe'`
- **`dev サーバが :5199 で立ち上がりませんでした`**: そのポートを別のものが
  使っている。`netstat -ano | grep ':5199 '` で PID を見て `taskkill //PID <pid> //T //F`、
  または `TN_PORT=5200` で逃げる
- **`locator.click: Timeout 8000ms exceeded`**: セレクタが今の画面に無い。
  `ss :: debug` を撮って、どの画面にいるか目で見る
- **`strict mode violation: ... resolved to N elements`**: セレクタが複数に当たっている。
  `.first()` か、`.locator('.sheet')` などで祖先を絞る
