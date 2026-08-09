# たびのしおり (TravelNote)

旅の記録をまとめる iOS アプリ。React + TypeScript + Vite + Capacitor。
Windows + GitHub Actions のみで開発・配布する(Macは使わない)。

- Bundle ID: `com.tsukune.travelnote`(変更禁止)
- 紹介ページ: https://tsukune131.github.io/TravelNote/
- 収益モデル: 自動更新サブスク(月¥300 / 年¥1,800)。**広告なし・サーバーなし・通信なし**
- 線引き: 無料は個人利用のすべて。**共有を始めるときだけ Pro、受け取る側は無料**
- プライバシーラベル: **データを収集していません**

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
| [CLAUDE.md](CLAUDE.md) | 開発方針。守るべき制約はここが正 |
| [ROADMAP.md](ROADMAP.md) | 関門付きフェーズ制の進行表。現在地もここ |
| [store/appstore-listing.md](store/appstore-listing.md) | ストア掲載テキストとプライバシーラベル |

> `docs/` は git 管理外(競合分析と価格戦略が含まれるため)。開発機の手元にだけある。

## 配布

GitHub Actions → **iOS TestFlight** ワークフローを `lane=beta` で実行。
初回のみ `lane=certificates`、Capability 変更時は `lane=refresh_profiles`。
