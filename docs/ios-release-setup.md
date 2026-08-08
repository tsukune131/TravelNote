# iOS / TestFlight 配布のセットアップ手順

Mac を持たずに GitHub Actions (macOS ランナー) だけで TestFlight まで配布するための手順。
コード側の実装は済んでいる前提で、ここに書くのは **Apple / GitHub 側の設定作業** だけ。

- Bundle ID: `com.tsukune.travelnote`
- ワークフロー: [.github/workflows/ios-testflight.yml](../.github/workflows/ios-testflight.yml)(手動実行)
- fastlane: [fastlane/Fastfile](../fastlane/Fastfile)

> 秘密(Key ID等)をこのファイルに書き込む運用にするなら、公開リポジトリには
> 入れないこと(.gitignore の docs/ を有効化)。

---

## 1. Apple Developer で App ID を作る

1. https://developer.apple.com/account/resources/identifiers/list
2. `+` → **App IDs** → **App**
3. Description: `たびのしおり` / Bundle ID: **Explicit** で `com.tsukune.travelnote`
4. Capabilities は最初は何もオンにしない(HealthKit等は使う段階で。
   ローカル通知は capability 不要)
5. Team ID を控える(Membership ページの10桁英数字)

## 2. App Store Connect にアプリを登録する

1. https://appstoreconnect.apple.com/apps → `+` → **新規アプリ**
2. プラットフォーム: iOS / 名前: `たびのしおり` / 主要言語: 日本語
3. バンドルID: 手順1の `com.tsukune.travelnote` を選ぶ
4. SKU: 任意の文字列

> 名前が他社に取られていた場合はここで弾かれる。その場合はアプリ名の
> 再検討が必要(Bundle ID は変えなくてよい)。

## 3. App Store Connect API キーを発行する

1. https://appstoreconnect.apple.com/access/integrations/api
2. **チームキー** タブ → `+`
3. 名前: `GitHub Actions` / アクセス権: **Admin**
   (match で証明書を作るため App Manager では足りない)
4. `.p8` をダウンロード(**再ダウンロード不可**。無くしたら作り直し)
5. **Key ID** と **Issuer ID** を控える

## 4. match 用のプライベートリポジトリを作る

証明書と秘密鍵を暗号化して置く場所。**必ず Private**。

1. GitHub で `TravelNote-certificates` を **Private** で作成(空でよい)
2. Fine-grained PAT を作る(Repository access: `TravelNote-certificates` のみ /
   Permissions: **Contents: Read and write**)
3. 暗号化パスフレーズを**自分で決める**(どこかの画面で設定する項目ではない。
   `MATCH_PASSWORD` として登録し、初回の certificates 実行時にこの値で暗号化される)
   - ランダム生成: `[Convert]::ToBase64String((1..24 | ForEach-Object { Get-Random -Max 256 }))`
   - **忘れると証明書を復号できない**。パスワードマネージャに保存

## 5. GitHub Secrets を登録する

リポジトリの Settings → Secrets and variables → Actions:

| Secret 名 | 値 |
|---|---|
| `ASC_KEY_ID` | 手順3の Key ID |
| `ASC_ISSUER_ID` | 手順3の Issuer ID |
| `ASC_KEY_P8_BASE64` | `.p8` を base64 にした文字列(下記) |
| `APPLE_TEAM_ID` | 手順1の Team ID(10桁) |
| `MATCH_GIT_URL` | `https://github.com/tsukune131/TravelNote-certificates.git` |
| `MATCH_PASSWORD` | 手順4のパスフレーズ |
| `MATCH_GIT_BASIC_AUTHORIZATION` | `tsukune131:<PAT>` を base64 にした文字列 |

PowerShell での base64 化:

```powershell
# .p8 ファイル
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\Downloads\AuthKey_XXXXXXXXXX.p8"))

# match 用の Basic 認証 (ユーザー名:PAT)
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("tsukune131:github_pat_xxxxx"))
```

> 改行が混ざらないよう、出力をそのままコピーして貼り付ける。

## 6. 証明書を作る(初回だけ)

手順1〜5がすべて前提。特に **App ID が未作成だと失敗する**。

1. Actions → **iOS TestFlight** → **Run workflow**
2. lane を **`certificates`** に変更(既定は beta なので必ず変える)して実行
3. 成功すると `TravelNote-certificates` に `certs/` と `profiles/` ができる

失敗したら `Run fastlane` のログを見る:

| エラー | 原因 |
|---|---|
| 401 Authentication credentials | `ASC_KEY_ID` / `ASC_ISSUER_ID` / p8 の base64 のどれかが違う |
| 403 Access forbidden | APIキーの権限が Admin でない |
| Couldn't find bundle identifier | App ID 未作成、または `APPLE_TEAM_ID` が違う |
| git の認証エラー / repository not found | `MATCH_GIT_URL` か `MATCH_GIT_BASIC_AUTHORIZATION`。PATの権限を確認 |

## 7. TestFlight にアップロードする

同じワークフローを lane **`beta`** で実行。
build → cap sync → match署名 → アーカイブ → TestFlight まで自動。

- ビルド番号は TestFlight の最新+1 を自動採番(初回は run number)
- App Store Connect 側の「処理中」が終わるまで数分〜数十分
- `.ipa` は Actions の Artifacts からもダウンロード可

## 7.5 App ID の Capability を変えたとき

HealthKit のように App ID 側で有効化が必要な機能を足したら、
**Capability をオンにしてからプロファイルを作り直す**。忘れると
`Provisioning profile ... doesn't include the ... entitlement` で失敗する。

1. Apple Developer で該当 App ID を開き Capability にチェック → Save
2. lane **`refresh_profiles`** を実行
3. そのあと lane `beta`

## 8. テスターに配布する

App Store Connect → TestFlight → **内部テスト**グループを作り、Apple ID を招待。
内部テスト(最大100名)は Apple のレビュー不要ですぐ配れる。

---

## つまずきやすいところ

- **輸出コンプライアンス**: Info.plist に `ITSAppUsesNonExemptEncryption = false` を
  入れておくと、アップロードのたびに聞かれない。これは「**非適用(non-exempt)の
  暗号化を使っていない**」という申告であって「通信していない」ではない。
  Apple標準APIのHTTPS/TLSだけ(広告SDKの通信を含む)なら false のままで正しい。
  独自の暗号実装や非標準アルゴリズムを積んだら申告し直す
- **証明書の作り直し**: `TravelNote-certificates` の中身を消してから lane=certificates を再実行
- **Xcode バージョン**: `latest-stable` 指定なら Apple の要件更新に自動追従
- **テスターが Apple ID の国・通貨を変えると TestFlight から外れる**。
  招待を再送すれば復旧。アプリは削除させない(ローカルデータが消える)
