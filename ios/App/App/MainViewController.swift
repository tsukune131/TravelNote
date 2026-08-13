import Capacitor
import UIKit

/**
 プラグインを1つ手で登録するためだけの `CAPBridgeViewController`。

 ## なぜ要るのか

 Capacitor 8 は SPM 構成で、読み込むプラグインを
 `capacitor.config.json` の `packageClassList` から決める。
 ところが**あれは `npx cap sync` が node_modules を見て書き直す**ので、
 アプリ本体に置いたプラグインを書き足しても次の sync で消える。

 `capacitorDidLoad()` で明示的に登録すれば、生成物に触らずに済む
 (Capacitor が「アプリ内のプラグイン」向けに用意している場所)。
 */
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(CloudKitProbePlugin())
    }
}
