import Capacitor
import CloudKit
import UIKit

/**
 旅の同期と共有(ROADMAP E-1 / E-2)。設計は ROADMAP E-1 の引用ブロックが正。

 ## 分担

 - **データの正は Dexie(JS)。** ネイティブは「送る前の欄」と「受け取った変更」を
   ファイルに持つ中継役。JS がアプリを開いていないあいだに届いた変更も、
   ここに貯まっていて JS が起動したときに取りに来る(`pull` → `ack`)
 - 送受信は `CKSyncEngine` が持つ(オフライン中の貯め込み・再送・プッシュ通知での取得)。
   private(自分の旅)と shared(受け取った旅)で2台
 - **欄はすべて文字列(中身は JSON)。** 型を JS 側で決められ、スキーマが増えない

 ## 項目ごとのあと勝ち

 送るのは**自分が直した欄だけ**(`pending`)。サーバーの記録が先に進んでいたら
 (`serverRecordChanged`)、サーバーの最新に自分の欄だけ重ねて送り直す。
 受け取るときは、まだ送っていない自分の欄を JS に渡さない(上書きさせない)。

 ⚠️ **スキーマを変えたら CloudKit コンソールで Deploy してからリリース。**
 欄を足すと、デバッグビルドでは Development に自動でできるが、Production には無い。
 */
final class CloudSync: NSObject, CKSyncEngineDelegate, @unchecked Sendable {
    static let shared = CloudSync()

    static let containerID = "iCloud.com.tsukune.travelnote"
    let container = CKContainer(identifier: CloudSync.containerID)

    /// JS への通知。プラグインが付いたら差し込まれる
    var notify: ((_ event: String, _ data: [String: Any]) -> Void)?

    private let lock = NSLock()
    private var store = Store()
    private var privateEngine: CKSyncEngine?
    private var sharedEngine: CKSyncEngine?
    private var started = false
    /// 診断用(設定の「iCloud の同期」)。黙って失敗させないため
    private var lastError = ""
    private var lastSyncAt: Date?

    /* ────────── 保存 ────────── */

    /// 1件の記録。`system` はサーバーの記録のシステム欄(変更タグ)。無ければまだ送っていない
    struct Entry: Codable {
        var recordType: String
        var system: Data?
        /// まだ送っていない欄(欄名 → JSON 文字列)
        var pending: [String: String]
    }

    /// JS がまだ取りに来ていない受信
    struct Inbound: Codable {
        var seq: Int
        /// "record" | "zoneDeleted"
        var kind: String
        var scope: String
        var owner: String
        var zone: String
        var recordType: String?
        var recordName: String?
        var fields: [String: String]?
    }

    struct Store: Codable {
        var entries: [String: Entry] = [:]
        var inbound: [Inbound] = []
        var nextSeq = 1
        /// 作成を頼んだ private ゾーン(何度も頼まないため)
        var zones: Set<String> = []
        var privateState: CKSyncEngine.State.Serialization?
        var sharedState: CKSyncEngine.State.Serialization?
        /// どの CloudKit 環境の状態か。違えば捨てる(下の `environment`)
        var environment: String?
    }

    /**
     デバッグビルドは Development、TestFlight と App Store は Production を見る。
     **同じ端末で両方を入れ替えると、片方の変更タグやゾーンの記憶をもう片方に
     持ち込んでしまう**(アプリの入れ物は Bundle ID が同じなので残る)。
     環境が変わったら同期の記憶を捨て、旅は JS 側で上げ直させる(`status().reset`)。
     */
    #if DEBUG
    static let environment = "development"
    #else
    static let environment = "production"
    #endif
    private(set) var environmentReset = false

    private var storeURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("CloudSync", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("store.json")
    }

    private func load() {
        guard let data = try? Data(contentsOf: storeURL),
              let decoded = try? JSONDecoder().decode(Store.self, from: data) else { return }
        store = decoded
    }

    /// 呼ぶ側が lock を持っていること
    private func save() {
        guard let data = try? JSONEncoder().encode(store) else { return }
        try? data.write(to: storeURL, options: .atomic)
    }

    /* ────────── 起動 ────────── */

    func start() {
        lock.lock()
        if started { lock.unlock(); return }
        started = true
        load()
        if store.environment != Self.environment {
            // はじめて起動したときも通る。そのときは捨てるものが無いだけ
            environmentReset = store.environment != nil
            store = Store()
            store.environment = Self.environment
            save()
        }
        let privateState = store.privateState
        let sharedState = store.sharedState
        lock.unlock()

        privateEngine = CKSyncEngine(CKSyncEngine.Configuration(
            database: container.privateCloudDatabase,
            stateSerialization: privateState,
            delegate: self
        ))
        sharedEngine = CKSyncEngine(CKSyncEngine.Configuration(
            database: container.sharedCloudDatabase,
            stateSerialization: sharedState,
            delegate: self
        ))
    }

    private func engine(for scope: String) -> CKSyncEngine? {
        scope == "shared" ? sharedEngine : privateEngine
    }

    private func scope(of engine: CKSyncEngine) -> String {
        engine === sharedEngine ? "shared" : "private"
    }

    /* ────────── 鍵 ────────── */

    static func zoneID(owner: String, zone: String) -> CKRecordZone.ID {
        CKRecordZone.ID(zoneName: zone, ownerName: owner.isEmpty ? CKCurrentUserDefaultName : owner)
    }

    private static func key(scope: String, _ id: CKRecord.ID) -> String {
        "\(scope)|\(id.zoneID.ownerName)|\(id.zoneID.zoneName)|\(id.recordName)"
    }

    private static func zoneKey(scope: String, _ zoneID: CKRecordZone.ID) -> String {
        "\(scope)|\(zoneID.ownerName)|\(zoneID.zoneName)"
    }

    /// JS に見せる持ち主の名前。自分のゾーンは空文字(端末ごとに表記が揺れないように)
    private static func ownerForJS(_ zoneID: CKRecordZone.ID, scope: String) -> String {
        scope == "private" ? "" : zoneID.ownerName
    }

    /* ────────── JS から: 送る ────────── */

    struct Outgoing {
        var scope: String
        var owner: String
        var zone: String
        var recordType: String
        var recordName: String
        var fields: [String: String]
    }

    func enqueue(_ items: [Outgoing]) {
        var byScope: [String: [CKRecord.ID]] = [:]
        var newZones: [CKRecordZone.ID] = []
        lock.lock()
        for item in items {
            let zoneID = Self.zoneID(owner: item.owner, zone: item.zone)
            let id = CKRecord.ID(recordName: item.recordName, zoneID: zoneID)
            let k = Self.key(scope: item.scope, id)
            var entry = store.entries[k] ?? Entry(recordType: item.recordType, system: nil, pending: [:])
            for (field, value) in item.fields { entry.pending[field] = value }
            store.entries[k] = entry
            byScope[item.scope, default: []].append(id)
            if item.scope == "private" {
                let zk = Self.zoneKey(scope: "private", zoneID)
                if !store.zones.contains(zk) {
                    store.zones.insert(zk)
                    newZones.append(zoneID)
                }
            }
        }
        save()
        lock.unlock()

        if !newZones.isEmpty {
            privateEngine?.state.add(pendingDatabaseChanges: newZones.map { .saveZone(CKRecordZone(zoneID: $0)) })
        }
        for (scope, ids) in byScope {
            engine(for: scope)?.state.add(pendingRecordZoneChanges: ids.map { .saveRecord($0) })
        }
    }

    /// 旅を消す。作成者ならゾーンごと消え(参加者には写しが残る)、参加者なら共有から抜ける
    func deleteZone(scope: String, owner: String, zone: String) {
        let zoneID = Self.zoneID(owner: owner, zone: zone)
        purge(scope: scope, zoneID: zoneID)
        engine(for: scope)?.state.add(pendingDatabaseChanges: [.deleteZone(zoneID)])
    }

    private func purge(scope: String, zoneID: CKRecordZone.ID) {
        let prefix = Self.zoneKey(scope: scope, zoneID) + "|"
        lock.lock()
        store.entries = store.entries.filter { !$0.key.hasPrefix(prefix) }
        store.zones.remove(Self.zoneKey(scope: scope, zoneID))
        save()
        lock.unlock()
        if let engine = engine(for: scope) {
            let stale = engine.state.pendingRecordZoneChanges.filter {
                switch $0 {
                case .saveRecord(let id), .deleteRecord(let id): return id.zoneID == zoneID
                @unknown default: return false
                }
            }
            engine.state.remove(pendingRecordZoneChanges: stale)
        }
    }

    /* ────────── JS から: 受け取る ────────── */

    func pull() -> [[String: Any]] {
        lock.lock()
        defer { lock.unlock() }
        return store.inbound.map { item in
            var d: [String: Any] = [
                "seq": item.seq, "kind": item.kind, "scope": item.scope,
                "owner": item.owner, "zone": item.zone,
            ]
            if let t = item.recordType { d["recordType"] = t }
            if let n = item.recordName { d["recordName"] = n }
            if let f = item.fields { d["fields"] = f }
            return d
        }
    }

    /// JS が Dexie に入れ終えたぶんを消す(`seq` 以下)
    func ack(upTo seq: Int) {
        lock.lock()
        store.inbound.removeAll { $0.seq <= seq }
        save()
        lock.unlock()
    }

    func syncNow() async {
        for engine in [privateEngine, sharedEngine].compactMap({ $0 }) {
            try? await engine.fetchChanges()
            try? await engine.sendChanges()
        }
    }

    /// 呼ぶ側が lock を持っていること
    private func appendInbound(_ item: Inbound) {
        var item = item
        item.seq = store.nextSeq
        store.nextSeq += 1
        store.inbound.append(item)
    }

    private func announce() {
        let notify = self.notify
        DispatchQueue.main.async { notify?("changes", [:]) }
    }

    /* ────────── CKSyncEngineDelegate ────────── */

    func handleEvent(_ event: CKSyncEngine.Event, syncEngine: CKSyncEngine) async {
        let scope = scope(of: syncEngine)
        switch event {
        case .stateUpdate(let e):
            saveState(e.stateSerialization, scope: scope)
        case .accountChange(let e):
            handleAccountChange(e, scope: scope)
        case .fetchedDatabaseChanges(let e):
            guard !e.deletions.isEmpty else { return }
            for deletion in e.deletions { zoneDeleted(deletion.zoneID, scope: scope) }
            announce()
        case .fetchedRecordZoneChanges(let e):
            guard !e.modifications.isEmpty else { return }
            receiveAll(e.modifications.map(\.record), scope: scope)
            announce()
        case .sentDatabaseChanges(let e):
            // 作れなかったゾーンは、次に送るときにもう一度頼む
            forgetZones(e.failedZoneSaves.map(\.zone.zoneID), scope: scope)
        case .sentRecordZoneChanges(let e):
            handleSent(e, scope: scope, engine: syncEngine)
        case .didFetchChanges, .didSendChanges:
            lock.withLock { lastSyncAt = Date() }
        default:
            break
        }
    }

    func diagnostics() -> [String: Any] {
        lock.withLock {
            let waiting = store.entries.values.filter { !$0.pending.isEmpty }.count
            var d: [String: Any] = [
                "pendingRecords": waiting,
                "inbound": store.inbound.count,
                "zones": store.zones.count,
                "lastError": lastError,
            ]
            if let at = lastSyncAt { d["lastSyncAt"] = Int(at.timeIntervalSince1970 * 1000) }
            return d
        }
    }

    /*
     ロックを取るのは同期の関数の中だけ。async の関数で NSLock を直接使うと、
     await をまたいで持ったままになりうる(Swift 6 ではエラー)。
     */

    private func saveState(_ state: CKSyncEngine.State.Serialization, scope: String) {
        lock.withLock {
            if scope == "shared" { store.sharedState = state } else { store.privateState = state }
            save()
        }
    }

    private func zoneDeleted(_ zoneID: CKRecordZone.ID, scope: String) {
        purge(scope: scope, zoneID: zoneID)
        lock.withLock {
            appendInbound(Inbound(
                seq: 0, kind: "zoneDeleted", scope: scope,
                owner: Self.ownerForJS(zoneID, scope: scope),
                zone: zoneID.zoneName
            ))
            save()
        }
    }

    private func receiveAll(_ records: [CKRecord], scope: String) {
        lock.withLock {
            for record in records { receive(record, scope: scope) }
            save()
        }
    }

    private func forgetZones(_ zoneIDs: [CKRecordZone.ID], scope: String) {
        guard !zoneIDs.isEmpty else { return }
        lock.withLock {
            lastError = "\(scope) zone save failed"
            for zoneID in zoneIDs { store.zones.remove(Self.zoneKey(scope: scope, zoneID)) }
            save()
        }
    }

    func nextRecordZoneChangeBatch(
        _ context: CKSyncEngine.SendChangesContext,
        syncEngine: CKSyncEngine
    ) async -> CKSyncEngine.RecordZoneChangeBatch? {
        let scope = scope(of: syncEngine)
        let changes = syncEngine.state.pendingRecordZoneChanges.filter { context.options.scope.contains($0) }
        return await CKSyncEngine.RecordZoneChangeBatch(pendingChanges: changes) { id in
            self.buildRecord(id, scope: scope)
        }
    }

    /// 送る記録を組む。サーバーの最新(のシステム欄)に、まだ送っていない欄を重ねる
    private func buildRecord(_ id: CKRecord.ID, scope: String) -> CKRecord? {
        lock.lock()
        defer { lock.unlock() }
        guard let entry = store.entries[Self.key(scope: scope, id)], !entry.pending.isEmpty else { return nil }
        let record = entry.system.flatMap(Self.decodeSystem) ?? CKRecord(recordType: entry.recordType, recordID: id)
        for (field, value) in entry.pending { record[field] = value as NSString }
        return record
    }

    /// 呼ぶ側が lock を持っていること
    private func receive(_ record: CKRecord, scope: String) {
        let k = Self.key(scope: scope, record.recordID)
        var entry = store.entries[k] ?? Entry(recordType: record.recordType, system: nil, pending: [:])
        entry.system = Self.encodeSystem(record)
        store.entries[k] = entry

        // まだ送っていない自分の欄は渡さない(送ったときに自分が勝つので)
        var fields: [String: String] = [:]
        for field in record.allKeys() where entry.pending[field] == nil {
            if let value = record[field] as? String { fields[field] = value }
        }
        appendInbound(Inbound(
            seq: 0, kind: "record", scope: scope,
            owner: Self.ownerForJS(record.recordID.zoneID, scope: scope),
            zone: record.recordID.zoneID.zoneName,
            recordType: record.recordType, recordName: record.recordID.recordName,
            fields: fields
        ))
    }

    private func handleSent(_ e: CKSyncEngine.Event.SentRecordZoneChanges, scope: String, engine: CKSyncEngine) {
        var retry: [CKRecord.ID] = []
        var zonesToCreate: [CKRecordZone.ID] = []
        var received = false
        lock.lock()
        for record in e.savedRecords {
            let k = Self.key(scope: scope, record.recordID)
            guard var entry = store.entries[k] else { continue }
            entry.system = Self.encodeSystem(record)
            // 送ったあとにまた直された欄は残す(値が違えば次で送る)
            for (field, value) in entry.pending where (record[field] as? String) == value {
                entry.pending.removeValue(forKey: field)
            }
            store.entries[k] = entry
            if !entry.pending.isEmpty { retry.append(record.recordID) }
        }
        for failure in e.failedRecordSaves {
            let id = failure.record.recordID
            let k = Self.key(scope: scope, id)
            if failure.error.code != .serverRecordChanged {
                lastError = "\(scope) save ck\(failure.error.code.rawValue)"
            }
            switch failure.error.code {
            case .serverRecordChanged:
                // 誰かが先に直した。サーバーの最新を受け取り、自分の欄だけ重ねて送り直す
                if let server = failure.error.serverRecord {
                    receive(server, scope: scope)
                    received = true
                }
                retry.append(id)
            case .zoneNotFound:
                if scope == "private" {
                    zonesToCreate.append(id.zoneID)
                    store.zones.insert(Self.zoneKey(scope: scope, id.zoneID))
                    retry.append(id)
                }
            case .unknownItem:
                // サーバーから消えていた。新しく作り直す
                store.entries[k]?.system = nil
                retry.append(id)
            case .networkFailure, .networkUnavailable, .zoneBusy, .serviceUnavailable,
                 .requestRateLimited, .notAuthenticated, .quotaExceeded, .operationCancelled:
                // CKSyncEngine が自分で再送する
                break
            default:
                // 権限が無い(読むだけの参加者)など。送っても通らないので捨てる
                store.entries[k]?.pending = [:]
            }
        }
        save()
        lock.unlock()

        if !zonesToCreate.isEmpty {
            engine.state.add(pendingDatabaseChanges: zonesToCreate.map { .saveZone(CKRecordZone(zoneID: $0)) })
        }
        if !retry.isEmpty {
            engine.state.add(pendingRecordZoneChanges: retry.map { .saveRecord($0) })
        }
        if received { announce() }
    }

    private func handleAccountChange(_ e: CKSyncEngine.Event.AccountChange, scope: String) {
        switch e.changeType {
        case .signIn:
            break
        case .signOut, .switchAccounts:
            // 前のアカウントの記録を次のアカウントに持ち込まない(端末の旅は JS 側に残る)
            lock.lock()
            let prefix = scope + "|"
            store.entries = store.entries.filter { !$0.key.hasPrefix(prefix) }
            store.zones = store.zones.filter { !$0.hasPrefix(prefix) }
            if scope == "shared" { store.sharedState = nil } else { store.privateState = nil }
            save()
            lock.unlock()
        @unknown default:
            break
        }
        let notify = self.notify
        DispatchQueue.main.async { notify?("account", ["scope": scope]) }
    }

    /* ────────── システム欄 ────────── */

    static func encodeSystem(_ record: CKRecord) -> Data {
        let coder = NSKeyedArchiver(requiringSecureCoding: true)
        record.encodeSystemFields(with: coder)
        coder.finishEncoding()
        return coder.encodedData
    }

    static func decodeSystem(_ data: Data) -> CKRecord? {
        guard let coder = try? NSKeyedUnarchiver(forReadingFrom: data) else { return nil }
        coder.requiresSecureCoding = true
        defer { coder.finishDecoding() }
        return CKRecord(coder: coder)
    }

    /* ────────── 共有 ────────── */

    /// 共有を受け入れた(リンクをタップした)。受け取った旅は shared の取得で届く
    func accept(_ metadata: CKShare.Metadata) {
        Task {
            do {
                _ = try await container.accept(metadata)
                try? await sharedEngine?.fetchChanges()
            } catch {
                let notify = self.notify
                let message = (error as? CKError).map { "ck\($0.code.rawValue)" } ?? error.localizedDescription
                DispatchQueue.main.async { notify?("shareError", ["stage": "accept", "error": message]) }
            }
        }
    }

    /**
     **開発環境に、同期する欄を全部作る**(デバッグビルドの起動時。JS の `SCHEMA` から)。

     本番(Production)は**まだ見たことのない欄を受け付けない**。開発環境は書いた欄を
     その場で作るので、試験で一度も書かれなかった欄(予約・費用など)はスキーマに無く、
     そのまま Deploy すると**本番でだけ**その欄を含む記録が送れなくなる。
     だから全部の欄に1回ずつ書いてから、使い捨てのゾーンごと消す(型は残る)。
     */
    func seedSchema(_ types: [String: [String]]) async throws {
        guard Self.environment == "development" else { return }
        let zoneID = CKRecordZone.ID(zoneName: "schema-seed", ownerName: CKCurrentUserDefaultName)
        let db = container.privateCloudDatabase
        _ = try await db.modifyRecordZones(saving: [CKRecordZone(zoneID: zoneID)], deleting: [])
        let records = types.map { type, fields -> CKRecord in
            let record = CKRecord(recordType: type, recordID: CKRecord.ID(recordName: "seed-\(type)", zoneID: zoneID))
            for field in fields { record[field] = "null" as NSString }
            return record
        }
        let result = try await db.modifyRecords(saving: records, deleting: [], savePolicy: .allKeys)
        for (_, saved) in result.saveResults {
            if case .failure(let error) = saved { throw error }
        }
        _ = try await db.modifyRecordZones(saving: [], deleting: [zoneID])
    }

    /**
     招待リンク(`https://www.icloud.com/share/...`)から参加する。

     **LINE で受け取ったリンクは、タップしてもアプリに渡らない**(LINE の中のブラウザで
     iCloud の Web ページが開くだけ。2026-10-02 に実機で確認)。だからリンクを貼り付けて
     もらい、ここで中身を問い合わせて受諾する。経路に左右されない。
     */
    func acceptLink(_ url: URL) async throws -> CKShare.Metadata {
        let metadata = try await container.shareMetadata(for: url)
        if metadata.participantRole != .owner {
            _ = try await container.accept(metadata)
        }
        try? await sharedEngine?.fetchChanges()
        return metadata
    }

    /// 旅のゾーンの共有。まだ無ければ nil
    func existingShare(zone: String) async throws -> CKShare? {
        let zoneID = Self.zoneID(owner: "", zone: zone)
        let shareID = CKRecord.ID(recordName: CKRecordNameZoneWideShare, zoneID: zoneID)
        do {
            return try await container.privateCloudDatabase.record(for: shareID) as? CKShare
        } catch let error as CKError where error.code == .unknownItem || error.code == .zoneNotFound {
            return nil
        }
    }

    /// 旅のゾーンの共有を用意する(無ければ作る)。先に旅の中身を送り切っておく
    func prepareShare(zone: String, title: String) async throws -> CKShare {
        let zoneID = Self.zoneID(owner: "", zone: zone)
        let db = container.privateCloudDatabase
        _ = try await db.modifyRecordZones(saving: [CKRecordZone(zoneID: zoneID)], deleting: [])
        try? await privateEngine?.sendChanges()

        let shareID = CKRecord.ID(recordName: CKRecordNameZoneWideShare, zoneID: zoneID)
        var share: CKShare
        do {
            guard let existing = try await db.record(for: shareID) as? CKShare else {
                throw CKError(.unknownItem)
            }
            // 招待した人のみ(publicPermission = none)で作ってしまった共有のうち、
            // まだ誰も参加していないものは、標準のリンク方式に直す(2026-10-02 の方針変更より前の分)
            let joined = existing.participants.filter { $0.role != .owner && $0.acceptanceStatus == .accepted }
            guard existing.publicPermission == .none, joined.isEmpty else { return existing }
            share = existing
        } catch let error as CKError where error.code == .unknownItem {
            share = CKShare(recordZoneID: zoneID)
        }
        share[CKShare.SystemFieldKey.title] = title as NSString
        /*
         **標準は「リンクを知っている人は誰でも参加・編集できる」**(ユーザー判断 2026-10-02)。
         非公開(招待した人のみ)だと相手を連絡先から選ぶ必要があり、
         LINE のグループにそのまま貼れなかった。iOS の画面の「共有オプション」で
         「招待した人のみ」に切り替えることはできる(availablePermissions)。
         */
        share.publicPermission = .readWrite
        let result = try await db.modifyRecords(saving: [share], deleting: [])
        if case .success(let saved)? = result.saveResults[share.recordID], let savedShare = saved as? CKShare {
            return savedShare
        }
        return share
    }
}

/* ────────── Capacitor プラグイン ────────── */

@objc(CloudSyncPlugin)
public class CloudSyncPlugin: CAPPlugin, CAPBridgedPlugin, UICloudSharingControllerDelegate {
    public let identifier = "CloudSyncPlugin"
    public let jsName = "CloudSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "diagnostics", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enqueue", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pull", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ack", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncNow", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteZone", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manageShare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "acceptLink", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "seedSchema", returnType: CAPPluginReturnPromise),
    ]

    private var shareTitle = ""

    override public func load() {
        let sync = CloudSync.shared
        sync.notify = { [weak self] event, data in
            self?.notifyListeners(event, data: data)
        }
        sync.start()
    }

    @objc func status(_ call: CAPPluginCall) {
        CloudSync.shared.container.accountStatus { status, error in
            let name: String
            switch status {
            case .available: name = "available"
            case .noAccount: name = "noAccount"
            case .restricted: name = "restricted"
            case .temporarilyUnavailable: name = "temporarilyUnavailable"
            case .couldNotDetermine: name = "couldNotDetermine"
            @unknown default: name = "unknown"
            }
            call.resolve([
                "account": name,
                "error": error?.localizedDescription ?? "",
                "environment": CloudSync.environment,
                "reset": CloudSync.shared.environmentReset,
            ])
        }
    }

    @objc func diagnostics(_ call: CAPPluginCall) {
        call.resolve(CloudSync.shared.diagnostics())
    }

    @objc func enqueue(_ call: CAPPluginCall) {
        let raw = call.getArray("items", JSObject.self) ?? []
        let items: [CloudSync.Outgoing] = raw.compactMap { o in
            guard let scope = o["scope"] as? String, let zone = o["zone"] as? String,
                  let type = o["recordType"] as? String, let name = o["recordName"] as? String,
                  let fields = o["fields"] as? [String: String] else { return nil }
            return CloudSync.Outgoing(
                scope: scope, owner: o["owner"] as? String ?? "", zone: zone,
                recordType: type, recordName: name, fields: fields
            )
        }
        CloudSync.shared.enqueue(items)
        call.resolve(["accepted": items.count])
    }

    @objc func pull(_ call: CAPPluginCall) {
        call.resolve(["items": CloudSync.shared.pull()])
    }

    @objc func ack(_ call: CAPPluginCall) {
        CloudSync.shared.ack(upTo: call.getInt("upTo") ?? 0)
        call.resolve()
    }

    @objc func syncNow(_ call: CAPPluginCall) {
        Task {
            await CloudSync.shared.syncNow()
            call.resolve()
        }
    }

    @objc func deleteZone(_ call: CAPPluginCall) {
        guard let scope = call.getString("scope"), let zone = call.getString("zone") else {
            call.reject("scope and zone are required")
            return
        }
        CloudSync.shared.deleteZone(scope: scope, owner: call.getString("owner") ?? "", zone: zone)
        call.resolve()
    }

    /**
     招待を送る。**いつもの共有シート**(LINE・メッセージ・メール…)に、招待の文とリンクを渡す。

     iOS の共有管理画面(`UICloudSharingController`)は、共有ができたあとは
     「管理」の画面になり、送り先のアプリを選べない(リンクをコピーして自分で
     LINE を開く必要があった)。だから送るのは共有シート、管理は `manageShare` に分けた。

     **シートを出した時点で resolve する。** その後どこへ送ったかはアプリに関係ない。
     */
    @objc func share(_ call: CAPPluginCall) {
        guard let zone = call.getString("zone") else {
            call.reject("zone is required")
            return
        }
        let title = call.getString("title") ?? ""
        let message = call.getString("message") ?? title
        Task {
            do {
                let share = try await CloudSync.shared.prepareShare(zone: zone, title: title)
                guard let url = share.url else {
                    call.reject("share has no url", "noUrl")
                    return
                }
                await MainActor.run {
                    let sheet = UIActivityViewController(activityItems: [message, url], applicationActivities: nil)
                    // iPad では吹き出しの出どころが要る(無いと落ちる)
                    if let view = self.bridge?.viewController?.view {
                        sheet.popoverPresentationController?.sourceView = view
                        sheet.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 0, height: 0)
                    }
                    self.bridge?.viewController?.present(sheet, animated: true)
                    call.resolve(["result": "presented"])
                }
            } catch {
                let code = (error as? CKError).map { "ck\($0.code.rawValue)" } ?? "unknown"
                call.reject(error.localizedDescription, code)
            }
        }
    }

    /**
     共有の管理(参加している人・共有オプション・共有の停止)。iOS 標準の画面に任せる。
     まだ共有していなければ `noShare` で断る(作るのは `share` だけ)。
     */
    @objc func manageShare(_ call: CAPPluginCall) {
        guard let zone = call.getString("zone") else {
            call.reject("zone is required")
            return
        }
        let title = call.getString("title") ?? ""
        Task {
            do {
                guard let share = try await CloudSync.shared.existingShare(zone: zone) else {
                    call.reject("not shared yet", "noShare")
                    return
                }
                await MainActor.run {
                    self.shareTitle = title
                    let controller = UICloudSharingController(share: share, container: CloudSync.shared.container)
                    controller.availablePermissions = [.allowPublic, .allowPrivate, .allowReadWrite, .allowReadOnly]
                    controller.delegate = self
                    controller.modalPresentationStyle = .formSheet
                    self.bridge?.viewController?.present(controller, animated: true)
                    call.resolve(["result": "presented"])
                }
            } catch {
                let code = (error as? CKError).map { "ck\($0.code.rawValue)" } ?? "unknown"
                call.reject(error.localizedDescription, code)
            }
        }
    }

    @objc func seedSchema(_ call: CAPPluginCall) {
        let raw = call.getObject("types") ?? [:]
        var types: [String: [String]] = [:]
        for (type, value) in raw { types[type] = value as? [String] ?? [] }
        Task {
            do {
                try await CloudSync.shared.seedSchema(types)
                call.resolve(["environment": CloudSync.environment])
            } catch {
                let code = (error as? CKError).map { "ck\($0.code.rawValue)" } ?? "unknown"
                call.reject(error.localizedDescription, code)
            }
        }
    }

    @objc func acceptLink(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw) else {
            call.reject("url is required", "badUrl")
            return
        }
        Task {
            do {
                let metadata = try await CloudSync.shared.acceptLink(url)
                let zoneID = metadata.share.recordID.zoneID
                call.resolve([
                    "owner": metadata.participantRole == .owner ? "" : zoneID.ownerName,
                    "zone": zoneID.zoneName,
                    "isOwner": metadata.participantRole == .owner,
                    "title": metadata.share[CKShare.SystemFieldKey.title] as? String ?? "",
                ])
            } catch {
                let code = (error as? CKError).map { "ck\($0.code.rawValue)" } ?? "unknown"
                call.reject(error.localizedDescription, code)
            }
        }
    }

    public func itemTitle(for csc: UICloudSharingController) -> String? {
        shareTitle
    }

    public func cloudSharingController(_ csc: UICloudSharingController, failedToSaveShareWithError error: Error) {
        let code = (error as? CKError).map { "ck\($0.code.rawValue)" } ?? "unknown"
        notifyListeners("shareError", data: ["stage": "save", "error": code])
    }

    public func cloudSharingControllerDidStopSharing(_ csc: UICloudSharingController) {
        notifyListeners("shareStopped", data: [:])
    }
}
