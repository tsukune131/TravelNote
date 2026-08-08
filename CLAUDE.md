# たびのしおり

React + TypeScript + Vite + Capacitor の iOSアプリ。
Windows + GitHub Actions のみで開発・配布する(Macは使わない)。

## 不変の識別子(表示名が変わっても据え置く)

- Bundle ID: `com.tsukune.travelnote`(**変更禁止**。変えるとTestFlight配布が切れる)
- GitHubリポジトリ: `tsukune131/TravelNote`(Public。macOSランナーを無料で使うため)
- 証明書リポジトリ: `tsukune131/TravelNote-certificates`(Private)
- 表示名「たびのしおり」は日本語。**ASCIIが要る箇所(ipa名・Artifact名・
  リポジトリ名)は `TravelNote` を使う**

## 方針

- ターゲット: 複数人で旅行に行く人(家族・友人・カップル)
- ポジショニング: **同行者と一緒に作って、旅行中に片手で見る旅のしおり**
- **差別化の軸は「旅行中に強い」。** 競合はどれも*計画*ツールで出発後が薄い。
  時刻の任意化・オフライン編集・移動コネクタ・リフローがその中身
  (根拠と競合の実データ: [docs/competitive-landscape.md](docs/competitive-landscape.md))
- 獲得は**日本語圏**。ただし**共有相手の言語で表示できる**道は残す(下記 i18n)
- 収益モデル: **未確定**(広告 / 買い切り / 併用)。チェックポイントBで決める
- 共有は**サーバーを持たない**。しおりを1ファイルにして送り合う非同期方式
- 通信: **広告を入れる場合のみ**。それ以外に外部と通信しない
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

### 共有はサーバーを持たない(このアプリの背骨・最重要)

**同期サーバーを作らない。** しおりを1ファイル(`.tabishiori`)に書き出して
共有シートで送り、受け取った側が手元とつき合わせる非同期方式
(設計: docs/ux-design.md §6 / 実装: `src/share/`)。

**この判断が守っているもの:**

- **プライバシーラベルは「データを収集していません」。**
  旅程は端末から出ない(ユーザーが自分で送るファイルを除く)。
  **競合(tabiori / Wanderlog)が絶対に言えない訴求**であり、最大の資産。
  **これを崩す変更は、崩す価値があるか必ず立ち止まって判断する**
- 維持費が永久に0円。オフラインは定義上つねに成立

**したがって、以下を入れてはいけない:**

- 解析・エラー監視SDK(クラッシュは App Store Connect のレポートで見る)
- 旅程を外部へ送る機能全般
- 実効のない「閲覧のみ」権限。ファイルを渡した相手は何でもできる。
  **守れる顔をしたUIを作らない**

**アカウントは作らせない。** 端末ごとの匿名IDと表示名だけ。
App Store Review Guideline **5.1.1(v)**(アカウント作成をさせるなら
アプリ内でアカウント削除が必須)を発生させないため。
Sign in with Apple も入れない(入れた瞬間に同じ要件が復活する)。

**マージの取り決め**(`src/share/merge.ts`。実行して検証済み):

- 最後にやり取りした時点(baseline)から**どちら側が動いたか**で決める
- 両方が動いた日だけ「**案**」に分けて両方残す。粒度は Day
- **衝突していないものまで分岐させない**。枝が増えると読めなくなる
- 並び順は fractional indexing(配列インデックスだと同時並べ替えで壊れる)
- CRDT ではない。3回以上すれ違うと古い側が拾われないことがある割り切り

リアルタイム同期は**捨てたのではなく保留**(ROADMAP B-4)。
実際に使って「送り返すのが面倒」という不満が出たら復活させる。

### 収益モデルが未定のあいだの扱い

- **A-5 で広告バナーの占有領域だけは確保しておく。**
  入れないと決めたら空けるだけで済むが、あとから足すとレイアウトの作り直しになる
- **プライバシーポリシーのURLは、広告の有無に関わらず用意する。**
  `public/legal/privacy.html` を GitHub Pages で公開し、アプリ内からもリンクする
- **輸出コンプライアンス**: `ITSAppUsesNonExemptEncryption = false` は
  「非適用の暗号化を使っていない」という申告。Apple標準APIのHTTPS/TLSだけなら
  false のままで正しい。独自暗号を実装したら申告し直す

#### 広告を採用した場合にのみ発生する制約(採用が決まったら有効化)

**広告を入れた時点でプライバシーラベルは「収集しています」に変わる。**
上の最大の訴求を手放すことになるので、収益額と天秤にかけて判断する。

- **ATT(AppTrackingTransparency)**: パーソナライズ広告を行うなら
  トラッキング許可ダイアログの実装と `NSUserTrackingUsageDescription` が必須。
  **許可しなくてもアプリの全機能が使えること**(Apple の要件)
- **プライバシーマニフェスト**: 広告SDKは `PrivacyInfo.xcprivacy` と
  署名の同梱が要る(サードパーティSDKの要件)。SDK採用時に確認する
- **Kids Category には出さない**(広告とトラッキングの制約が跳ね上がるため)
- **広告SDKに旅程の中身を渡さない**

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
- コード分割(React.lazy)は自前コードのみ可
- ストレージ: Dexie(IndexedDB)。バックアップはiCloudのアプリコンテナ復元に委ねる
- TestFlight配布: Actions → iOS TestFlight → lane=beta(手順は docs/ios-release-setup.md)
- Capability変更時は lane=refresh_profiles を先に実行

## 親ハーネス

`..`(tripnote)のスキル(/new-ios-app, /ios-release-pipeline,
/ios-native-features, /iap-onetime, /appstore-listing)と
release-auditor エージェント、`..\playbooks\lessons.md`(落とし穴集)を参照。

> playbooks と template は「完全ローカル・広告なし」を前提に書かれている。
> 広告・通信に関する記述は本アプリでは読み替えること。
