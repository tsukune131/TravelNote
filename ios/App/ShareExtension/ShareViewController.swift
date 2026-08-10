import UIKit
import UniformTypeIdentifiers

/**
 共有シートの「たびのしおり」。

 **画面を出さない。** 受け取って、書いて、すぐ閉じる。
 ここで旅や Day を選ばせると「共有 → 終わり」の速さが消える
 (docs/ux-design.md §4.4)。配置はアプリ側のインボックスで後からやる。

 拡張はアプリとは**別プロセス**で、アプリの IndexedDB には書けない。
 書けるのは App Group で共有した入れ物だけなので、そこに置いて、
 アプリが起動・復帰したときに拾わせる。

 保存先のキーが `_cap_inbox` なのは、アプリ側が `@capacitor/preferences` で
 読むため。あのプラグインは UserDefaults のキーに `_cap_` を前置する。
 **片方だけ変えると静かに読めなくなる。**
 */
final class ShareViewController: UIViewController {
    private let appGroup = "group.com.tsukune.travelnote"
    private let storageKey = "_cap_inbox"

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        receive()
    }

    private func receive() {
        guard
            let item = extensionContext?.inputItems.first as? NSExtensionItem,
            let provider = item.attachments?.first(where: {
                $0.hasItemConformingToTypeIdentifier(UTType.url.identifier)
            })
        else {
            return finish()
        }

        /*
         ページの題名。Safari は本文テキストとしてタイトルを渡してくることが多いが、
         **必ず入っている保証はない。** 空でも受け取りは続ける ──
         名前はアプリ側で直せるが、URL を取り落とすと何も残らない。
         */
        let title = item.attributedContentText?.string ?? ""

        provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { [weak self] value, _ in
            let url = (value as? URL)?.absoluteString ?? (value as? String) ?? ""
            self?.save(url: url, title: title)
            self?.finish()
        }
    }

    /** 既にあるものの後ろに足す。アプリが拾うまで何件でも溜まる */
    private func save(url: String, title: String) {
        guard !url.isEmpty, let defaults = UserDefaults(suiteName: appGroup) else { return }

        var items: [[String: Any]] = []
        if
            let raw = defaults.string(forKey: storageKey),
            let data = raw.data(using: .utf8),
            let parsed = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        {
            items = parsed
        }

        items.append([
            "url": url,
            "title": title.trimmingCharacters(in: .whitespacesAndNewlines),
            "at": Int(Date().timeIntervalSince1970 * 1000),
        ])

        if
            let data = try? JSONSerialization.data(withJSONObject: items),
            let json = String(data: data, encoding: .utf8)
        {
            defaults.set(json, forKey: storageKey)
        }
    }

    private func finish() {
        DispatchQueue.main.async { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil)
        }
    }
}
