import Foundation

/**
 共有拡張が置いたものを、アプリが読める場所へ移す。

 ## なぜ「移す」必要があるのか

 拡張は別プロセスで、書けるのは **App Group のコンテナ**だけ。
 一方 JS 側(`@capacitor/filesystem`)が読めるのは**アプリ自身の Documents** だけで、
 App Group を指す方法が無い。だからネイティブで1回だけ橋渡しする。

 `@capacitor/preferences` の `group` で読めるかと思ったが、**あれは group を
 キーの接頭辞にしか使わず、読むのは常に `UserDefaults.standard`**。
 App Group は原理的に見えない(プラグインの実装を読んで判明)。

 ## いつ動くか

 iOS は「いま共有された」をアプリに教えてくれない。だから
 **起動したときと前面に戻ったとき**に呼ぶ(SceneDelegate)。

 ⚠️ ファイル名と JSON の形は ShareExtension/ShareViewController.swift と
 src/share/inbox.ts に揃えてある。**どれか1つだけ変えると黙って届かなくなる。**
 */
enum SharedInbox {
    private static let appGroup = "group.com.tsukune.travelnote"
    private static let fileName = "shared-inbox.json"

    /**
     App Group にあるものを Documents へ移す。**移したら向こうは消す。**

     すでに Documents にあるもの(JS がまだ拾っていないぶん)の後ろに足す。
     上書きすると、続けて共有したときに前のぶんが消える。
     */
    static func drain() {
        let fm = FileManager.default
        guard
            let groupDir = fm.containerURL(forSecurityApplicationGroupIdentifier: appGroup),
            let documents = fm.urls(for: .documentDirectory, in: .userDomainMask).first
        else {
            return
        }

        let source = groupDir.appendingPathComponent(fileName)
        guard let incoming = readItems(at: source), !incoming.isEmpty else { return }

        let destination = documents.appendingPathComponent(fileName)
        let merged = (readItems(at: destination) ?? []) + incoming

        guard
            let data = try? JSONSerialization.data(withJSONObject: merged),
            (try? data.write(to: destination, options: .atomic)) != nil
        else {
            // 書けなかったら向こうは消さない。次の機会にやり直せる
            return
        }
        try? fm.removeItem(at: source)
    }

    private static func readItems(at url: URL) -> [[String: Any]]? {
        guard
            let data = try? Data(contentsOf: url),
            let parsed = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else {
            return nil
        }
        return parsed
    }
}
