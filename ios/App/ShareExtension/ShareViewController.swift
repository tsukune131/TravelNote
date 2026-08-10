import UIKit
import UniformTypeIdentifiers

/**
 共有シートの「たびのしおり」。

 受け取って、App Group のファイルに追記して、閉じる。
 **旅や Day は選ばせない** ── ここで選ばせると「共有 → 終わり」の速さが消える
 (docs/ux-design.md §4.4)。配置はアプリ側で後からやる。
 そもそも共有した時点では、旅が1つも無いこともある。

 ## 受け渡しがファイルなのは

 拡張はアプリとは**別プロセス**で、アプリの IndexedDB にも Documents にも書けない。
 書けるのは App Group で共有したコンテナだけ。

 当初は `@capacitor/preferences` の `group` で読めると思って UserDefaults に
 書いていたが、**あのプラグインは group をキーの接頭辞にしか使わず、
 読むのは常に `UserDefaults.standard`**(node_modules の実装を読んで判明)。
 App Group は原理的に見えない。
 いまは **App Group のファイル → SceneDelegate が Documents へ移す →
 JS が @capacitor/filesystem で読む**、という道にしてある。

 ⚠️ この JSON の置き場と形は SceneDelegate.swift・src/share/inbox.ts と揃っている。
 どれか1つだけ変えると、**エラーも出ずに黙って届かなくなる。**
 */
final class ShareViewController: UIViewController {
    private let appGroup = "group.com.tsukune.travelnote"
    private let fileName = "shared-inbox.json"

    private lazy var label: UILabel = {
        let label = UILabel()
        label.textAlignment = .center
        label.numberOfLines = 0
        label.font = .systemFont(ofSize: 16, weight: .semibold)
        label.textColor = .label
        label.translatesAutoresizingMaskIntoConstraints = false
        return label
    }()

    override func viewDidLoad() {
        super.viewDidLoad()

        /*
         **何か出す。** 以前は無言で閉じていたが、それだと
         うまくいったのか失敗したのかユーザーに分からない(実際に踏んだ)。
         押させるボタンは足さない ── 速さがこの機能の値打ちなので。
         */
        view.backgroundColor = .systemBackground
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            label.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
            label.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -24),
        ])

        receive()
    }

    private func receive() {
        guard
            let item = extensionContext?.inputItems.first as? NSExtensionItem,
            let provider = item.attachments?.first(where: {
                $0.hasItemConformingToTypeIdentifier(UTType.url.identifier)
            })
        else {
            return finish(message: "リンクが見つかりませんでした")
        }

        // ページの題名。Safari は本文テキストとして渡してくることが多いが、保証はない
        let title = item.attributedContentText?.string ?? ""

        provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { [weak self] value, _ in
            let url = (value as? URL)?.absoluteString ?? (value as? String) ?? ""
            let saved = self?.save(url: url, title: title) ?? false
            self?.finish(message: saved ? "たびのしおりに入れました" : "保存できませんでした")
        }
    }

    /** 既にあるものの後ろに足す。アプリが拾うまで何件でも溜まる */
    private func save(url: String, title: String) -> Bool {
        guard
            !url.isEmpty,
            let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)
        else {
            return false
        }
        let file = dir.appendingPathComponent(fileName)

        var items: [[String: Any]] = []
        if
            let data = try? Data(contentsOf: file),
            let parsed = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        {
            items = parsed
        }

        items.append([
            "url": url,
            "title": title.trimmingCharacters(in: .whitespacesAndNewlines),
            "at": Int(Date().timeIntervalSince1970 * 1000),
        ])

        guard let data = try? JSONSerialization.data(withJSONObject: items) else { return false }
        return (try? data.write(to: file, options: .atomic)) != nil
    }

    /** 手応えを一瞬だけ見せてから閉じる。長く出すと「共有 → 終わり」が遅くなる */
    private func finish(message: String) {
        DispatchQueue.main.async { [weak self] in
            self?.label.text = message
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
                self?.extensionContext?.completeRequest(returningItems: nil)
            }
        }
    }
}
