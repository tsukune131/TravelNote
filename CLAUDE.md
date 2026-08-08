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

- ターゲット: (誰のためのアプリか)
- ポジショニング: (ひと言で)
- 収益モデル: **基本無料 + 広告収入**(買い切りIAPは現時点で予定なし)
- 通信: **あり**(広告配信。他に外部通信を足す場合はここに追記する)
- やらないこと: (不採用にした機能を理由ごとここに追記し、再提案しない)

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
- **記録データそのものは端末内に留める**。広告SDKに旅の記録を渡さない。
  「広告は出すが、あなたの記録は送らない」を守れる境界にする

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
