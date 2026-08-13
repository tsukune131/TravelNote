/**
 * CloudKit の Development スキーマに `cloudkit.share` を作らせるための道具
 * (ROADMAP E-0)。**アプリには一切入らない。開発時に1回使うだけ。**
 *
 * ## なぜ要るのか
 *
 * CKShare は `cloudkit.share` というシステム型を使う。
 * **Production はレコード型を新しく作れず**、この型は
 * CloudKit コンソールで手作りすることもできない(ユーザーが作れる型ではない)。
 * 正規の解き方は「Development で1度 JIT 生成させて Deploy」だが、
 * **Development に入る道(Xcode のデバッグビルド)は Mac が要る。**
 *
 * TestFlight のビルドを Development に向ける逃げ道は Apple が塞いでいる:
 *   exportOptionsPlist error for key "iCloudContainerEnvironment":
 *   value "Development" is not allowed
 *
 * 残った道が **CloudKit Web Services(REST)**。ブラウザと Node だけで
 * private データベースに書けて、環境も `development` を指定できる。
 *
 * ## 使い方
 *
 *   1) node scripts/cloudkit-schema.mjs signin
 *      → 表示された URL をブラウザで開き、Apple ID でサインイン
 *      → 受け取った ckWebAuthToken を控える
 *
 *   2) CK_WEB_AUTH_TOKEN=... node scripts/cloudkit-schema.mjs share
 *      → ゾーンとレコードを作り、**createShortGUID で共有を作らせる**
 *      → これで Development スキーマに cloudkit.share が生える
 *
 *   3) CloudKit コンソールで Deploy Schema Changes → Production
 *
 * ⚠️ 書くのは自分の private データベースの捨て駒レコード1件だけ。
 *    費用は発生しない(private データは利用者自身の iCloud 容量)。
 */

const CONTAINER = process.env.CK_CONTAINER ?? 'iCloud.com.tsukune.travelnote';
const ENVIRONMENT = 'development';
const DATABASE = 'private';
const ZONE_NAME = 'ProbeZone';
const RECORD_TYPE = 'ProbeTrip';

const API_TOKEN = process.env.CK_API_TOKEN;
const WEB_AUTH_TOKEN = process.env.CK_WEB_AUTH_TOKEN;

const BASE = `https://api.apple-cloudkit.com/database/1/${CONTAINER}/${ENVIRONMENT}/${DATABASE}`;

function url(path) {
  const params = new URLSearchParams({ ckAPIToken: API_TOKEN ?? '' });
  // サインイン前は web auth token を持っていない。付けずに投げると
  // **401/421 と一緒に「ここでサインインしろ」という URL が返る**
  if (WEB_AUTH_TOKEN) params.set('ckWebAuthToken', WEB_AUTH_TOKEN);
  return `${BASE}${path}?${params}`;
}

async function call(path, body) {
  const res = await fetch(url(path), {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

function requireApiToken() {
  if (API_TOKEN) return;
  console.error(
    'CK_API_TOKEN がありません。\n' +
      'CloudKit コンソール → 対象コンテナ → Settings → Tokens で\n' +
      'API トークンを発行し、環境変数に入れてください。',
  );
  process.exit(1);
}

/** ① サインイン用の URL をもらう */
async function signin() {
  requireApiToken();
  const { status, json, text } = await call('/users/current');

  // 認証済みならそのまま通る(2回目以降)
  if (status === 200) {
    console.log('すでにサインイン済みです。');
    console.log(JSON.stringify(json, null, 2));
    return;
  }

  const redirect = json?.redirectURL;
  if (!redirect) {
    console.error(`想定外の応答 (status ${status}):\n${text}`);
    process.exit(1);
  }

  console.log('\n▼ この URL をブラウザで開いて、Apple ID でサインインしてください\n');
  console.log(redirect);
  console.log(
    '\nサインインすると ckWebAuthToken が表示されます(または URL に付いて返ります)。\n' +
      'その値を控えて、次を実行してください:\n\n' +
      '  CK_API_TOKEN=... CK_WEB_AUTH_TOKEN=... node scripts/cloudkit-schema.mjs share\n',
  );
}

/**
 * ② ゾーンとレコードを作り、**共有を作らせる**。
 *
 * `createShortGUID: true` が肝。これを付けて保存すると CloudKit 側が
 * **その場で共有(cloudkit.share)を作る** ── Development は JIT スキーマなので、
 * このとき型そのものが生える。**これが目的のすべて。**
 */
async function share() {
  requireApiToken();
  if (!WEB_AUTH_TOKEN) {
    console.error('CK_WEB_AUTH_TOKEN がありません。先に signin を実行してください。');
    process.exit(1);
  }

  console.log('1/3 ゾーンを作ります …');
  const zone = await call('/zones/modify', {
    operations: [
      { operationType: 'create', zone: { zoneID: { zoneName: ZONE_NAME } } },
    ],
  });
  // すでに有るときも先へ進む(作り直す必要はない)
  report('zones/modify', zone);

  console.log('2/3 レコードを作り、共有を作らせます …');
  const record = await call('/records/modify', {
    zoneID: { zoneName: ZONE_NAME },
    operations: [
      {
        operationType: 'create',
        record: {
          recordType: RECORD_TYPE,
          recordName: `schema-seed-${Date.now()}`,
          fields: {
            title: { value: 'schema seed' },
            updatedAt: { value: Date.now() },
          },
          // ★ ここが目的。共有を作らせて cloudkit.share を生やす
          createShortGUID: true,
        },
      },
    ],
  });
  report('records/modify', record);

  const created = record.json?.records?.[0];
  const shortGUID = created?.shortGUID;

  console.log('3/3 結果');
  if (shortGUID) {
    console.log(`  ✓ 共有ができました (shortGUID: ${shortGUID})`);
    console.log(
      '\n  → CloudKit コンソール → Development → Schema に cloudkit.share が\n' +
        '     出ているはずです。出ていたら Deploy Schema Changes で Production へ。\n',
    );
  } else {
    console.log('  ✗ shortGUID が返りませんでした。上の応答を見てください。');
    process.exit(1);
  }
}

function report(label, { status, json, text }) {
  if (status === 200) {
    const errors = (json?.records ?? []).filter((r) => r.serverErrorCode);
    if (errors.length === 0) {
      console.log(`  ✓ ${label}`);
      return;
    }
    // **200 でも中で失敗していることがある。** 黙らせない
    for (const e of errors) {
      console.log(`  ✗ ${label}: ${e.serverErrorCode} / ${e.reason ?? ''}`);
    }
    return;
  }
  console.log(`  ✗ ${label}: status ${status}\n${text}`);
}

/**
 * ③ Sign in Callback を空にできなかったとき用の受け取り口。
 *
 * コンソールで `http://localhost:7788/` を登録した場合、サインイン後に
 * ブラウザがここへ飛んでくる。**トークンを端末の外へ出さない**のが狙い
 * ── GitHub Pages などを callback にすると、セッショントークンが
 * アドレスバーと相手のサーバーのログに乗る。
 */
async function catchToken() {
  const { createServer } = await import('node:http');
  const port = 7788;

  const server = createServer((req, res) => {
    const token = new URL(req.url, `http://localhost:${port}`).searchParams.get('ckWebAuthToken');
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });

    if (!token) {
      res.end('ckWebAuthToken が付いていません。このタブは閉じて構いません。');
      return;
    }
    res.end('受け取りました。このタブは閉じてください。');
    console.log('\n✓ ckWebAuthToken を受け取りました:\n');
    console.log(token);
    console.log('\n次はこれを実行してください:\n');
    console.log('  CK_API_TOKEN=... CK_WEB_AUTH_TOKEN=<上の値> node scripts/cloudkit-schema.mjs share\n');
    server.close();
  });

  server.listen(port, () => {
    console.log(`http://localhost:${port}/ で待っています。`);
    console.log('別の窓で signin を実行し、出てきた URL をブラウザで開いてください。');
    console.log('(Ctrl-C で終了)');
  });
}

const command = process.argv[2];
if (command === 'signin') await signin();
else if (command === 'share') await share();
else if (command === 'catch') await catchToken();
else {
  console.log('使い方: node scripts/cloudkit-schema.mjs <signin|catch|share>');
  process.exit(1);
}
