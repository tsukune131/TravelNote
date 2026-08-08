# たびのしおり (TravelNote)

旅の記録をまとめる iOS アプリ。React + TypeScript + Vite + Capacitor。
Windows + GitHub Actions のみで開発・配布する(Macは使わない)。

- Bundle ID: `com.tsukune.travelnote`(変更禁止)
- 紹介ページ: https://tsukune131.github.io/TravelNote/
- 収益モデル: 基本無料 + 広告収入(通信あり)

## 開発

```powershell
npm install
npm run dev        # 開発サーバ
npm run build      # tsc -b && vite build (base: './' の相対パスビルド)
npm run lint       # oxlint
npx cap sync ios   # dist/ を iOS プロジェクトへ反映
```

## ドキュメント

| ファイル | 内容 |
|---|---|
| [CLAUDE.md](CLAUDE.md) | 開発方針。**広告・通信ありによる制約**はここが正 |
| [ROADMAP.md](ROADMAP.md) | 関門付きフェーズ制の進行表。現在地もここ |
| [docs/ios-release-setup.md](docs/ios-release-setup.md) | TestFlight 自動配布の構築手順 |
| [store/appstore-listing.md](store/appstore-listing.md) | ストア掲載テキストとプライバシーラベル |

## 配布

GitHub Actions → **iOS TestFlight** ワークフローを `lane=beta` で実行。
初回のみ `lane=certificates`、Capability 変更時は `lane=refresh_profiles`。
