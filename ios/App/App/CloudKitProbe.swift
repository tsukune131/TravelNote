import Capacitor
import CloudKit
import Foundation

/**
 CloudKit の**実現可能性を確かめるためだけ**のプラグイン(ROADMAP E-0)。

 ## これは製品コードではない

 旅程のレコードは1件も触らない。**専用のテスト用レコードタイプ
 (`ProbeTrip`)と専用のゾーン(`ProbeZone`)しか読み書きしない。**
 E-1 でレコード設計が決まったら、ここは作り直して捨てる。

 ## なぜ試作が要るのか

 Mac が無いので、ネイティブの挙動は **push → CI → TestFlight → 実機**の
 往復でしか確かめられない。本実装を全部書いてから初めて動かすと、
 落ちたときに「プラグインの配線」「entitlements」「レコード設計」の
 どれが悪いのか切り分けられない。**先に一番細い線を1本通す。**

 ## 確かめること(ROADMAP E-0)

 1. Capacitor から CloudKit を叩けるか(= このプラグインが JS から見えるか)
 2. `accountStatus()` が実機で何を返すか(未サインインの見え方)
 3. **書き込みのドライランで `quotaExceeded` を検出できるか**
    ── 容量の残りを問い合わせる API は存在せず、
    **書いてみて失敗して初めて分かる**。課金の前にこれを通す必要がある
    (ROADMAP「現在地」2026-08-13 / Apple 3.1.2(c))
 4. CKShare を作って受諾できるか(読み取り専用の共有が成立するか)

 ## API の選び方について

 **コンパイラが手元に無い**ので、記憶があやしい新しい API より
 **形が確実なほうを選んでいる**(古い completion 版で警告が出ても、
 ビルドは通る。通らないと1往復まるごと無駄になる)。
 */
@objc(CloudKitProbePlugin)
public class CloudKitProbePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CloudKitProbePlugin"
    public let jsName = "CloudKitProbe"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "accountStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "dryRun", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "createShare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "fetchShared", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takePendingShare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cleanUp", returnType: CAPPluginReturnPromise)
    ]

    /// ⚠️ Apple Developer ポータルで作るコンテナ名と1文字でも違うと、
    /// 実機で `notAuthenticated` ではなく**署名の段階**で落ちる。
    private static let containerID = "iCloud.com.tsukune.travelnote"
    private static let zoneName = "ProbeZone"
    private static let recordType = "ProbeTrip"

    private var container: CKContainer { CKContainer(identifier: Self.containerID) }
    private var zoneID: CKRecordZone.ID { CKRecordZone.ID(zoneName: Self.zoneName, ownerName: CKCurrentUserDefaultName) }

    /* ────────── 1. アカウントの状態 ────────── */

    /**
     iCloud にサインインしているか。

     **サインインしていない端末では、共有は何もできない。** これは課金の前に
     出す案内(E-2)の材料になるので、実機で何が返るかを見ておく。
     */
    @objc func accountStatus(_ call: CAPPluginCall) {
        container.accountStatus { status, error in
            if let error = error {
                call.resolve(["status": "error", "error": error.localizedDescription])
                return
            }
            call.resolve(["status": Self.describe(status)])
        }
    }

    private static func describe(_ status: CKAccountStatus) -> String {
        switch status {
        case .available: return "available"
        case .noAccount: return "noAccount"
        case .restricted: return "restricted"
        case .couldNotDetermine: return "couldNotDetermine"
        case .temporarilyUnavailable: return "temporarilyUnavailable"
        @unknown default: return "unknown"
        }
    }

    /* ────────── 2. 書き込みのドライラン ────────── */

    /**
     **課金の前に必ず通す関門**(ROADMAP E-2 / 現在地 2026-08-13)。

     ゾーンを作る → 小さなレコードを書く → 読み戻す → 消す、を1往復。
     これが通らない端末では CKShare も作れないので、**ペイウォールを出さない**。

     iCloud の残量を問い合わせる API は無い。**書いて `quotaExceeded` が
     返って初めて満杯だと分かる** ── これはファイル共有には存在しなかった、
     CloudKit 固有の負債。

     所要時間(`ms`)も返す。課金の直前に走らせる以上、
     **何秒待たせるのかを知らずに UI を決められない。**
     */
    @objc func dryRun(_ call: CAPPluginCall) {
        let started = Date()
        let database = container.privateCloudDatabase
        let recordID = CKRecord.ID(recordName: "probe-\(UUID().uuidString)", zoneID: zoneID)

        // **アカウントの状態を毎回一緒に返す。** 実機での1往復が高いので、
        // ②が落ちたときに「①も押してください」ともう1往復させない
        container.accountStatus { status, _ in
            let account = Self.describe(status)

            /// 結果に account を足してから返す
            func finish(_ payload: [String: Any]) {
                var merged = payload
                merged["account"] = account
                call.resolve(merged)
            }

            self.ensureZone(in: database) { zoneError in
            if let zoneError = zoneError {
                finish(Self.failure(zoneError, stage: "zone", started: started))
                return
            }

            let record = CKRecord(recordType: Self.recordType, recordID: recordID)
            record["title"] = "probe" as CKRecordValue
            record["updatedAt"] = Date() as CKRecordValue

            database.save(record) { saved, saveError in
                if let saveError = saveError {
                    finish(Self.failure(saveError, stage: "write", started: started))
                    return
                }

                database.fetch(withRecordID: saved?.recordID ?? recordID) { fetched, fetchError in
                    if let fetchError = fetchError {
                        finish(Self.failure(fetchError, stage: "read", started: started))
                        return
                    }
                    let readBack = (fetched?["title"] as? String) == "probe"

                    // 消せなかったとしてもドライランは成功。ゴミは cleanUp で拾う
                    database.delete(withRecordID: recordID) { _, _ in
                        finish([
                            "ok": readBack,
                            "ms": Self.elapsed(started),
                            "stage": "done"
                        ])
                    }
                }
            }
            }
        }
    }

    /* ────────── 3. 読み取り専用の共有を作る ────────── */

    /**
     CKShare を作って、共有URLを返す。

     ⚠️ **ルートレコードと CKShare は同じ操作で一緒に保存する。**
     先にレコードだけ保存してからシェアを付けると弾かれる。

     `publicPermission = .readOnly` にしてある。理由:
     - **参加者をメールや電話番号で指定しない。** 指定する形にすると、
       連絡先を引くことになり「データを収集していません」の説明が重くなる。
       リンクを知っている人が見られる形なら、こちらは誰も特定しない
     - 送る手段(LINE / AirDrop)は**いまのファイル共有と同じ共有シート**でよく、
       ユーザーの操作は「ファイルではなくリンクが飛ぶ」だけの違いになる

     オーナーは**あとから取り消せる**(リンク共有をやめる)。
     これがリンク埋め込み案を捨てて CloudKit を採った決め手だった。
     */
    @objc func createShare(_ call: CAPPluginCall) {
        let started = Date()
        let database = container.privateCloudDatabase
        let title = call.getString("title") ?? "たびのしおり"
        let recordID = CKRecord.ID(recordName: "share-\(UUID().uuidString)", zoneID: zoneID)

        ensureZone(in: database) { zoneError in
            if let zoneError = zoneError {
                call.resolve(Self.failure(zoneError, stage: "zone", started: started))
                return
            }

            let root = CKRecord(recordType: Self.recordType, recordID: recordID)
            root["title"] = title as CKRecordValue
            root["updatedAt"] = Date() as CKRecordValue

            let share = CKShare(rootRecord: root)
            share[CKShare.SystemFieldKey.title] = title as CKRecordValue
            share.publicPermission = .readOnly

            let operation = CKModifyRecordsOperation(recordsToSave: [root, share], recordIDsToDelete: nil)
            operation.savePolicy = .allKeys
            operation.modifyRecordsCompletionBlock = { saved, _, error in
                if let error = error {
                    call.resolve(Self.failure(error, stage: "share", started: started))
                    return
                }
                let url = saved?.compactMap { $0 as? CKShare }.first?.url?.absoluteString
                call.resolve([
                    "ok": url != nil,
                    "ms": Self.elapsed(started),
                    "url": url ?? "",
                    "recordName": recordID.recordName,
                    "stage": "done"
                ])
            }
            database.add(operation)
        }
    }

    /* ────────── 4. 受け取った側から読む ────────── */

    /**
     共有された(= 他人の iCloud にある)レコードを読む。

     **受け取る側は自分のデータを持たない** ── オーナーの iCloud を
     見ているだけ。オーナーが共有をやめれば相手の画面から消える。
     ファイル方式では相手にコピーが残っていたので、ここは明確な後退で、
     E-2 の「自分の旅として保存(無料)」で埋める必要がある。
     */
    @objc func fetchShared(_ call: CAPPluginCall) {
        let started = Date()
        let database = container.sharedCloudDatabase

        database.fetchAllRecordZones { zones, error in
            if let error = error {
                call.resolve(Self.failure(error, stage: "zones", started: started))
                return
            }
            guard let zones = zones, !zones.isEmpty else {
                call.resolve(["ok": true, "ms": Self.elapsed(started), "titles": [], "stage": "done"])
                return
            }

            var titles: [String] = []
            let group = DispatchGroup()
            var failure: Error?

            for zone in zones {
                group.enter()
                // ⚠️ CKQuery は使わない。**自動生成されたスキーマには
                // queryable な索引が付かない**ので、実機で
                // 「Field 'recordName' is not marked queryable」で落ちる。
                // 変更差分の取得なら索引は要らず、本実装でも同じ経路を使う
                // 引数ラベルは省略しない。**`configurationsByRecordZoneID` に
                // 既定値がある保証が無く**、手元にコンパイラが無い以上
                // 「たぶん通る」で1往復を捨てたくない
                let operation = CKFetchRecordZoneChangesOperation(
                    recordZoneIDs: [zone.zoneID],
                    configurationsByRecordZoneID: nil
                )
                operation.recordChangedBlock = { record in
                    if let title = record["title"] as? String { titles.append(title) }
                }
                operation.fetchRecordZoneChangesCompletionBlock = { error in
                    if let error = error { failure = error }
                    group.leave()
                }
                database.add(operation)
            }

            group.notify(queue: .main) {
                if let failure = failure {
                    call.resolve(Self.failure(failure, stage: "changes", started: started))
                    return
                }
                call.resolve([
                    "ok": true,
                    "ms": Self.elapsed(started),
                    "titles": titles,
                    "stage": "done"
                ])
            }
        }
    }

    /**
     共有リンクをタップして受諾されたぶんを引き取る。

     受諾は **SceneDelegate に届く**(アプリが起動していないこともある)ので、
     いったん `AcceptedShares` に溜めて、JS 側が起動後に取りに来る。
     ── Share Extension のインボックスと同じ考え方。
     */
    @objc func takePendingShare(_ call: CAPPluginCall) {
        call.resolve(["titles": AcceptedShares.drain()])
    }

    /* ────────── 後片付け ────────── */

    /// 試作が置いたゾーンごと消す。**E-0 が終わったら実機で1回押す**
    @objc func cleanUp(_ call: CAPPluginCall) {
        container.privateCloudDatabase.delete(withRecordZoneID: zoneID) { _, error in
            call.resolve(["ok": error == nil, "error": error?.localizedDescription ?? ""])
        }
    }

    /* ────────── 道具 ────────── */

    /// ゾーンを作る。**すでに有れば、それも成功として扱う**(作り直さない)
    private func ensureZone(in database: CKDatabase, completion: @escaping (Error?) -> Void) {
        let zone = CKRecordZone(zoneID: zoneID)
        let operation = CKModifyRecordZonesOperation(recordZonesToSave: [zone], recordZoneIDsToDelete: nil)
        operation.modifyRecordZonesCompletionBlock = { _, _, error in completion(error) }
        database.add(operation)
    }

    private static func elapsed(_ started: Date) -> Int {
        Int(Date().timeIntervalSince(started) * 1000)
    }

    /**
     失敗を JS へ返す形にする。

     **`code` を分けて返すのが肝。** 満杯(`quotaExceeded`)・未サインイン
     (`notAuthenticated`)・圏外(`networkUnavailable`)は、
     UI で言うべきことが全部違う。`localizedDescription` だけ返すと
     JS 側で文字列を見分ける羽目になる。
     */
    private static func failure(_ error: Error, stage: String, started: Date) -> [String: Any] {
        let (code, message) = classify(error)
        return [
            "ok": false,
            "ms": elapsed(started),
            "stage": stage,
            "code": code,
            "error": message
        ]
    }

    /**
     エラーを「見て意味の分かる形」にする。

     ⚠️ **`partialFailure`(ck2)は中身が空のラッパー。**
     `partialErrorsByItemID` を開かないと本当の原因が出てこない
     ── 最初の版がこれを開いておらず、実機で
     「dryRun NG / zone / ck2 / failed to modify some record zones」としか
     出せなかった。**知りたいことだけが捨てられていた。**

     入れ子は1段とは限らないので**再帰で開く**。
     */
    private static func classify(_ error: Error) -> (String, String) {
        guard let ckError = error as? CKError else {
            return ("unknown", error.localizedDescription)
        }

        if ckError.code == .partialFailure {
            // 最初の1件で足りる。**どの item で落ちたかも一緒に返す**
            if let partials = ckError.partialErrorsByItemID, let (item, inner) = partials.first {
                let (innerCode, innerMessage) = classify(inner)
                return (innerCode, "[\(item)] \(innerMessage)")
            }
            return ("partialFailure", ckError.localizedDescription)
        }

        let code: String
        switch ckError.code {
        case .quotaExceeded: code = "quotaExceeded"
        case .notAuthenticated: code = "notAuthenticated"
        case .networkUnavailable, .networkFailure: code = "network"
        case .permissionFailure: code = "permission"
        case .managedAccountRestricted: code = "restricted"
        case .zoneNotFound, .userDeletedZone: code = "zoneNotFound"
        case .serverRecordChanged: code = "conflict"
        case .badContainer: code = "badContainer"
        case .missingEntitlement: code = "missingEntitlement"
        case .internalError: code = "internalError"
        case .serverRejectedRequest: code = "serverRejected"
        case .invalidArguments: code = "invalidArguments"
        default: code = "ck\(ckError.errorCode)"
        }
        // **番号も必ず残す。** 名前だけだと Apple の資料と突き合わせられない
        return (code, "ck\(ckError.errorCode): \(ckError.localizedDescription)")
    }
}

/**
 受諾された共有の置き場。

 SceneDelegate は WebView より先に動くので、**受諾された瞬間には
 JS がまだ居ないことがある**。溜めておいて取りに来させる。
 */
enum AcceptedShares {
    private static let lock = NSLock()
    private static var titles: [String] = []

    static func add(_ title: String) {
        lock.lock()
        titles.append(title)
        lock.unlock()
    }

    static func drain() -> [String] {
        lock.lock()
        let taken = titles
        titles = []
        lock.unlock()
        return taken
    }
}
