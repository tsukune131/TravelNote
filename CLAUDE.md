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
- 収益モデル: **基本無料 + 広告収入**(買い切りIAPは現時点で予定なし)
- 通信: **あり**(広告配信 + 旅程の共有・同時編集)
- **UI/UX の正は [docs/ux-design.md](docs/ux-design.md)。画面を作る前に必ず読む**
- やらないこと: docs/ux-design.md の「11. やらないと決めたこと」に集約する

### 広告と通信を入れたことによる制約(このアプリ固有・最重要)

このハーネスの既定は「完全ローカル・広告なし・データ収集なし」だが、
**本アプリはその既定から意図的に外れている**。以下を常に前提に判断すること。

- **プライバシーラベルは「データを収集しています」**。広告SDKが集める
  識別子・使用状況データ・おおよその位置を申告する。
  `store/appstore-listing.md` の申告根拠を、SDKを足すたびに更新する
- **ATT(AppTrackingTransparency)**: パーソナライズ広告を行うなら
  トラッキング許可ダイアログの実装と `NSUserTrackingUsageDescription` が必須。
  **許可しなくてもアプリの全機能が使えること**(Apple の要件)
- **プライバシーポリシーのURLが必須**。`public/legal/privacy.html` を
  GitHub Pages で公開し、アプリ内(設定・オンボーディング)からもリンクする
- **輸出コンプライアンス**: `ITSAppUsesNonExemptEncryption = false` は
  「非適用の暗号化を使っていない」という申告。Apple標準APIのHTTPS/TLSだけなら
  false のままで正しい。独自暗号を実装したら申告し直す
- **プライバシーマニフェスト**: 広告SDKは `PrivacyInfo.xcprivacy` と
  署名の同梱が要る(サードパーティSDKの要件)。SDK採用時に確認する
- **Kids Category には出さない**(広告とトラッキングの制約が跳ね上がるため)
- **広告SDKに旅程の中身を渡さない**。「広告は出すが、あなたの記録は渡さない」を
  守れる境界にする(共有のためにサーバへ送る先と、広告事業者は別物)

### 共有・同時編集を入れたことによる制約

**旅程データは端末内に留まらない。** 同行者と同時編集するため同期サーバへ送る。
ハーネス既定の「完全ローカル」からはここでも外れている。

- **アカウントは作らせない**(招待リンク + 匿名ID方式)。
  アカウントを作らせると App Store Review Guideline **5.1.1(v)** により
  **アプリ内でのアカウント削除が必須**になる。Sign in with Apple も入れない
  (入れた瞬間にアカウント概念が生まれ、同じ要件が復活する)
- **オフラインファースト必須**。旅先に電波はない。読み書きはまずローカル(Dexie)、
  接続時に差分同期。UI はサーバ応答を待たない
- **並び順は fractional indexing** で持つ。配列インデックスだと
  2人が同時に並べ替えた瞬間に順序が壊れる
- プライバシーラベルに「**ユーザーコンテンツ**」(旅程・メモ)が加わる。
  用途は「App の機能」であって広告ではない、と分けて申告する
- 同期基盤は**未確定**(ROADMAP の B-4)。決めたらここに追記する

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
