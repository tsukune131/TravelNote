# つばメイト(旧: たびのしおり)

React + TypeScript + Vite + Capacitor の iOSアプリ。
Windows + GitHub Actions のみで開発・配布する(Macは使わない)。

> ⚠️ **2026-08-13、この原則を1回だけ破る判断をした**(ROADMAP E-0)。
> CloudKit の `cloudkit.share` は **Production では作れず、コンソールでも
> 手作りできず、Development で1度動かす以外に生やす方法が無い**。
> そして Development に入る道は Xcode のデバッグビルドだけ
> (TestFlight を向ける逃げ道は Apple が明確に禁止。検証済み)。
>
> **これは「スキーマを1回生やす」ためだけの例外で、開発と配布は Windows のまま。**
> ⚠️ **常用に戻さないこと。** 次に同じ壁が来たら、まず
> 「本当に Mac でしかできないのか」を疑う ── 通常のレコード型は
> **コンソールで手作りできる**ので、この壁はシステム型に限った話。

## 不変の識別子(表示名が変わっても据え置く)

- Bundle ID: `com.tsukune.travelnote`(**変更禁止**。変えるとTestFlight配布が切れる)
- GitHubリポジトリ: `tsukune131/TravelNote`(Public。macOSランナーを無料で使うため)
- 証明書リポジトリ: `tsukune131/TravelNote-certificates`(Private)
- 表示名「つばメイト」は日本語(英語は TsubaMate。2026-10-02 に「たびのしおり」から改名)。**ASCIIが要る箇所(ipa名・Artifact名・
  リポジトリ名)は `TravelNote` を使う**
- **データの識別子は旧名のまま据え置く**: DB 名 `tabinoshiori`・共有ファイルの形式
  `tabinoshiori.trip`・拡張子 `.tabishiori`。変えると既存のデータと送ったファイルが読めなくなる

> ⚠️ **`docs/` は git 管理外**(`.gitignore`)。競合分析と価格戦略が含まれるため、
> Public リポジトリには入れていない。**開発機の手元にだけある。**
> 以下の `docs/...` へのリンクは、クローンした環境では開けない。
> 設計の根拠が要るときは開発機の `TravelNote/docs/` を見ること。
>
> | ファイル | 中身 |
> |---|---|
> | `docs/ux-design.md` | UI/UX の正。画面を作る前に読む |
> | `docs/pricing.md` | 価格と 無料 / Pro の線引き |
> | `docs/competitive-landscape.md` | 競合とポジショニングの根拠 |
> | `docs/ios-release-setup.md` | TestFlight 自動配布の構築手順 |
> | `docs/appstore-paid-setup.md` | 有料App契約まわりの手順 |
> | `docs/admob-setup.md` | AdMob の ID・app-ads.txt・テストデバイス・公開後の手順 |

## 方針

- ターゲット: 複数人で旅行に行く人(家族・友人・カップル)
- ポジショニング: **同行者と一緒に作って、旅行中に片手で見る旅のしおり**
- **差別化の軸は「旅行中に強い」。** 競合はどれも*計画*ツールで出発後が薄い。
  時刻の任意化・オフライン編集・移動コネクタ・リフローがその中身
  (根拠と競合の実データ: [docs/competitive-landscape.md](docs/competitive-landscape.md))
- 獲得は**日本語圏**。ただし**共有相手の言語で表示できる**道は残す(下記 i18n)
- 収益モデル: **広告(下帯+全画面)+ 自動更新サブスク Pro**(月額¥300 / 年額¥1,800)。
  2026-09-24 に「サブスクのみ・広告なし」から変更(ROADMAP 現在地)
- 線引き: **共有は無料。Pro は「広告なし・天気・タスク割り振り」**
  (詳細は docs/pricing.md。2026-09-25 に新方針で書き直し済み)
- 共有は **CloudKit に統一**(利用者自身の iCloud。自前のサーバーは持たない)
- 通信: **あり**(CloudKit・WeatherKit・広告)
- **UI/UX の正は [docs/ux-design.md](docs/ux-design.md)。画面を作る前に必ず読む**
- やらないこと: docs/ux-design.md の「11. やらないと決めたこと」に集約する

### i18n:文言をハードコードしない(A-1 から徹底)

インバウンド特化はしないと決めた(理由: competitive-landscape.md §4)。
代わりに**共有相手の言語で表示できる**道だけ残す。
着手時なら追加コストはほぼゼロ、あとからだと全画面の書き直しになる。

- UI文言は `src/i18n/messages/*.ts` に集約し、**JSX に日本語を直書きしない**
- 日付・時刻・数値・通貨は `Intl.*` を使う(自前フォーマットを書かない)
- 既定は `ja`。未翻訳のキーは `ja` にフォールバックする
- **英語版のリリースは当面しない。** 下地だけ持っておく

### 共有は CloudKit(2026-09-24 に方針変更)

**共有は無料。方式は CloudKit(CKShare)に統一し、ファイル共有(`src/share/`)は廃止する。**
データは利用者自身の iCloud に置き、自前のサーバーは持たない。
共有相手も**編集できる**(読み書き)。経緯と未解決の穴は ROADMAP フェーズE。

⚠️ **E-0 の関門(`cloudkit.share` を Production に生やす)が未解決。**
Mac を1回だけ借りる判断済み(冒頭の注記)。**ここが越えられないと 1.0 が出せない。**

- **アカウントは作らせない。** 識別は Apple ID(CloudKit)と表示名・アイコンだけ。
  5.1.1(v)(アカウント作成をさせるならアプリ内削除が必須)を発生させないため。
  Sign in with Apple も入れない
- **メンバー**: 共有の参加者は自動でメンバーになり、スマホを持たない人
  (子ども・祖父母)は手動で追加できる。アイコンは写真かプリセット
- Production はレコード型を作れない。**スキーマを変えたら CloudKit コンソールで
  Deploy してからリリース**(忘れると実機でだけ動かない)
- 解析・エラー監視SDKは引き続き入れない(クラッシュは App Store Connect で見る)
- **RevenueCat 等の課金SDKは入れない**(StoreKit 2 を直接叩く)

### 広告

- **下帯広告 + 全画面広告**(AdMob。全画面は最短5分間隔)
- ⚠️ **旅行中の旅があるあいだは全画面広告を出さない。** 差別化の軸
  「旅行中に強い」を守るための線。帯は出してよい(判定: `src/ads/policy.ts`)
- 全画面を出すのは旅一覧 ⇄ 旅の画面の切り替え時だけ。スキップまでの秒数は
  AdMob 側で決まり、アプリからは指定できない
- **広告の ID は本番**(`src/ads/config.ts` と Info.plist。変えるときは両方)。
  TestFlight でも本物の広告が出るので**自分の広告を押さない**
- プライバシーラベルは**「データを収集しています(トラッキングあり)」**になる。
  ATT の許可ダイアログが要る。プライバシーポリシー・規約は書き直し
- オフラインでは広告が出ない。**広告が読めなくても画面は崩さない・待たせない**

### 収益:広告 + サブスク Pro(月¥300 / 年¥1,800)

| Pro の中身 | 誰に効くか |
|---|---|
| **広告なし** | **本人だけ**(各自の契約で決まる) |
| **天気**(WeatherKit。旅先1か所の予報を各日に表示・10日先まで) | **旅の作成者が Pro なら参加者全員** |
| **タスク割り振り**(メモタブで「Aさん:食事 / Bさん:観光」) | **旅の作成者が Pro なら参加者全員** |

- **共有・受け取り・編集はすべて無料。** 課金で共有を止めない
- 旧方針の `shareWindowUntil`(送信期限の凍結)は**不要になる**。
  `src/pro/entitlement.ts` は作り直し
- **無料プランで旅の数を制限しない / 解約してもデータをロックしない**(据え置き)
- サブスクの継続的な価値(3.1.2)は「広告なし+旅ごとの天気・割り振り」で説明する
- **購入を復元ボタン・価格・期間・規約とポリシーへのリンクをアプリ内に置く**(3.1.2)。
  **価格は StoreKit から取った値を表示する。ただし円で返ったときだけ** ──
  円以外なら `PRICE_TEXT_JPY`(日本の定価)に差し替える。日本のみ配信なので
  本番で円以外が返る経路は無く、実利用では常に StoreKit の値が出る。
  **Sandbox が米国ストアフロントに落ちてドル表示から抜けられなかった**ための分岐
  (`src/ui/Paywall.tsx` の `priceOf`)。**丸ごとのハードコードには戻さない**
- **プライバシーポリシーと利用規約(EULA)のURLは必須。**
  `public/legal/` を GitHub Pages で公開し、アプリ内からもリンクする
- **輸出コンプライアンス**: 通信は HTTPS(OS 標準の暗号)だけなので
  `ITSAppUsesNonExemptEncryption = false` のままでよい見込み(E-9 で確認)

## 進め方

- ROADMAP.md の関門付きフェーズ制で進める。**各フェーズ末のチェックポイントで
  ユーザー確認を取り、勝手に次フェーズへ進まない**
- 完了したタスクは ROADMAP.md のチェックを更新する
- ストア掲載テキストは store/appstore-listing.md を正とする

## 技術メモ

- ビルド: `npm run build`(相対パス `base: './'`。WKWebViewにサブパスビルドを
  読ませると真っ白になる)
- 型チェック: `npx tsc -b`(tsconfig.json は references のソリューション形式)
- Lint: `npm run lint`(oxlint)
- React プラグインは `@vitejs/plugin-react-swc`
- Capacitorプラグインは**静的import**(動的importで実機が固まった前例あり)
- コード分割(React.lazy)は自前コードのみ可。ただし**現状は分割していない** ──
  バンドルの86%が React と Dexie で、どちらも起動時に必要だから(A-4 で実測)
- **バンドルの上限は `npm run size`**(CI で回る)。上限に当たったら、
  まず本当に起動時から要るか問う。数字を上げるなら理由をコミットに書く
- **スプラッシュは固定秒数で待たせない。** 描画が済んだら `hideSplash()` で閉じる
  (`launchShowDuration` は JS が動かなかったときの保険)
- ストレージ: Dexie(IndexedDB)。バックアップはiCloudのアプリコンテナ復元に委ねる
- TestFlight配布: Actions → iOS TestFlight → lane=beta(手順は docs/ios-release-setup.md)
- Capability変更時は lane=refresh_profiles を先に実行

## 親ハーネス

`..`(tripnote)のスキル(/new-ios-app, /ios-release-pipeline,
/ios-native-features, /iap-onetime, /appstore-listing)と
release-auditor エージェント、`..\playbooks\lessons.md`(落とし穴集)を参照。

> playbooks と template は「完全ローカル・広告なし」を前提に書かれている。
> 広告・通信に関する記述は本アプリでは読み替えること。
