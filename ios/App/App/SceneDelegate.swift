import UIKit
import Capacitor
import CloudKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // 共有拡張が置いたものを、WebView が起きる前に読める場所へ移しておく
        SharedInbox.drain()

        window = UIWindow(windowScene: windowScene)
        // 素の CAPBridgeViewController ではなく、CloudKit プラグインを
        // 登録する版を使う(MainViewController.swift に理由)
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    /**
     裏から戻ってきたとき。**iOS は「いま共有された」を教えてくれない**ので、
     ここで拾わないと、共有してからアプリに切り替えても何も起きない。
     */
    func sceneWillEnterForeground(_ scene: UIScene) {
        SharedInbox.drain()
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    /**
     共有リンクをタップされたとき(ROADMAP E-0)。

     ⚠️ **`CKSharingSupported` を Info.plist に立てていないと、ここは呼ばれない。**
     リンクをタップしても Safari が iCloud の Web ページを開くだけになる。

     受諾は非同期で、**そのときアプリが起動したばかりだと WebView がまだ居ない**。
     だから結果を `AcceptedShares` に置いて、JS が起動後に取りに来る形にした
     (共有拡張のインボックスと同じ考え方)。
     */
    func windowScene(_ windowScene: UIWindowScene, userDidAcceptCloudKitShareWith metadata: CKShare.Metadata) {
        let operation = CKAcceptSharesOperation(shareMetadatas: [metadata])
        operation.perShareCompletionBlock = { metadata, _, error in
            guard error == nil else { return }
            let title = metadata.share[CKShare.SystemFieldKey.title] as? String
            AcceptedShares.add(title ?? "")
        }
        CKContainer(identifier: "iCloud.com.tsukune.travelnote").add(operation)
    }
}
