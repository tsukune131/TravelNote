import Capacitor
import CoreLocation
import Foundation
import MapKit
import WeatherKit

/**
 天気予報(WeatherKit)と地名検索(MapKit の検索 → だめなら CLGeocoder)。
 JS 側は `src/weather/weather.ts`。

 ## 前提(ROADMAP E-6)

 - entitlements に `com.apple.developer.weatherkit`
 - Apple Developer ポータルで App ID に **WeatherKit を2か所**有効にする
   (Capabilities と App Services)→ `lane=refresh_profiles`
   ⚠️ 片方だけだと、署名は通っても実行時に認証エラーで何も返らない
 - WeatherKit は **iOS 16 から**。15 の端末では `unavailable` を返す
   (deployment target は 15.0 のまま)

 ## Apple Weather の表示義務

 予報を出す画面には Apple Weather のマークと、データソースのページへのリンクが要る。
 マークの URL は `WeatherService.shared.attribution` から取って JS に渡す。

 ## API の選び方

 **コンパイラが手元に無い**ので、形が確実な API だけを使っている
 (CloudKitProbe.swift と同じ方針)。
 */
@objc(WeatherPlugin)
public class WeatherPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WeatherPlugin"
    public let jsName = "TravelNoteWeather"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "geocode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "forecast", returnType: CAPPluginReturnPromise)
    ]

    /* ────────── 地名検索 ────────── */

    /**
     地名 → 座標とタイムゾーン。**入れた文字列は Apple に送られる**
     (プライバシーポリシーに書く)。

     返す名前は「京都市 京都府」のように市区町村と都道府県まで。
     候補は最大5つ(同名の地名を選べるように)。

     ## 3段で引く(上から、見つかったところで止める)

     1. **補完(`MKLocalSearchCompleter`)** … マップアプリで打ち込むと出る候補と同じもの。
        候補を `MKLocalSearch.Request(completion:)` で座標に直す
     2. **住所検索(`MKLocalSearch`、住所だけ)**
     3. **住所の変換(`CLGeocoder`)**

     ⚠️ **経緯(実機で確認):** `CLGeocoder` だけの版と、2 → 3 の版では、
     「ハワイ」「釜山」は出るのに「ニューヨーク」「トロント」が出なかった。
     診断の表示は `mapkit: MKErrorDomain 4`(placemarkNotFound)/
     `geocoder: kCLErrorDomain 8`(結果なし)── どちらも**探して見つからなかった**。
     カタカナの海外の都市名は、住所としては引けない。マップアプリが候補を出せるのは
     補完のほうなので、それを先に使う。(その前に疑った「検索範囲が広すぎる」は外れ)

     返り値の `debug` に、それぞれの段が何を返したか(件数かエラー)を入れる。
     設定の隠し表示で見られる。実機でしか確かめられないため。
     */
    @objc func geocode(_ call: CAPPluginCall) {
        let query = call.getString("query") ?? ""
        if query.trimmingCharacters(in: .whitespaces).isEmpty {
            call.resolve(["places": []])
            return
        }

        // 補完はメインスレッドで使う(プラグインのメソッドは別のスレッドで呼ばれる)
        DispatchQueue.main.async {
            let completer = PlaceCompleter()
            // 返事が来るまで持っておく。持たないと結果が返る前に解放される
            self.completers.append(completer)
            completer.run(query) { completions, error in
                self.completers.removeAll { $0 === completer }
                let step = "completer: " + self.describe(count: completions.count, error: error)
                if completions.isEmpty {
                    self.searchAddress(query, call, debug: step)
                    return
                }
                self.resolveCompletions(Array(completions.prefix(5)), query: query, call, debug: step)
            }
        }
    }

    /** 実行中の補完。同時に2回探されても、それぞれ最後まで返事を待てるように配列で持つ */
    private var completers: [PlaceCompleter] = []

    /** 補完の候補を座標に直す。順番は候補の並びのまま */
    private func resolveCompletions(
        _ completions: [MKLocalSearchCompletion],
        query: String,
        _ call: CAPPluginCall,
        debug: String
    ) {
        var results = [(CLPlacemark, TimeZone?)?](repeating: nil, count: completions.count)
        let group = DispatchGroup()
        for (index, completion) in completions.enumerated() {
            group.enter()
            MKLocalSearch(request: MKLocalSearch.Request(completion: completion)).start { response, _ in
                if let item = response?.mapItems.first {
                    let placemark: CLPlacemark = item.placemark
                    results[index] = (placemark, item.timeZone)
                }
                group.leave()
            }
        }
        group.notify(queue: .main) {
            let found = results.compactMap { $0 }
            let step = debug + " → \(found.count)件"
            if found.isEmpty {
                self.searchAddress(query, call, debug: step)
                return
            }
            call.resolve(["places": self.places(from: found, query: query), "debug": step])
        }
    }

    /** 住所検索。補完で何も出なかったとき */
    private func searchAddress(_ query: String, _ call: CAPPluginCall, debug: String) {
        let request = MKLocalSearch.Request()
        request.naturalLanguageQuery = query
        // 地名だけ。店や施設まで混ぜると「ニューヨーク」で同名の店が並ぶ
        request.resultTypes = .address

        MKLocalSearch(request: request).start { response, error in
            var found: [(CLPlacemark, TimeZone?)] = []
            for item in response?.mapItems ?? [] {
                let placemark: CLPlacemark = item.placemark
                found.append((placemark, item.timeZone))
            }
            let step = debug + " / mapkit: " + self.describe(count: found.count, error: error)
            if !found.isEmpty {
                call.resolve(["places": self.places(from: found, query: query), "debug": step])
                return
            }
            self.geocodeAddress(query, call, debug: step)
        }
    }

    /** 住所としての変換。最後の控え */
    private func geocodeAddress(_ query: String, _ call: CAPPluginCall, debug: String) {
        let locale = Locale(identifier: Locale.preferredLanguages.first ?? "ja_JP")
        CLGeocoder().geocodeAddressString(query, in: nil, preferredLocale: locale) { placemarks, error in
            var found: [(CLPlacemark, TimeZone?)] = []
            for placemark in placemarks ?? [] {
                found.append((placemark, placemark.timeZone))
            }
            // 見つからないときもエラーで返ってくる。JS では「見つかりませんでした」
            let all = debug + " / geocoder: " + self.describe(count: found.count, error: error)
            call.resolve(["places": self.places(from: found, query: query), "debug": all])
        }
    }

    /** 検索の結果を1語で。「3件」か「MKErrorDomain 4」 */
    private func describe(count: Int, error: Error?) -> String {
        if let error = error {
            let e = error as NSError
            return "\(e.domain) \(e.code)"
        }
        return "\(count)件"
    }

    /** JS に返す形にする。同じ座標の候補は1つにまとめ、最大5つ */
    private func places(from found: [(CLPlacemark, TimeZone?)], query: String) -> [[String: Any]] {
        var places: [[String: Any]] = []
        var seen = Set<String>()
        for (placemark, timeZone) in found {
            if places.count >= 5 { break }
            guard let coordinate = placemark.location?.coordinate else { continue }
            let key = String(format: "%.3f,%.3f", coordinate.latitude, coordinate.longitude)
            if seen.contains(key) { continue }
            seen.insert(key)

            var parts: [String] = []
            for part in [placemark.locality ?? placemark.name, placemark.administrativeArea] {
                if let part = part, !part.isEmpty, !parts.contains(part) {
                    parts.append(part)
                }
            }
            var place: [String: Any] = [
                "name": parts.isEmpty ? query : parts.joined(separator: " "),
                "lat": coordinate.latitude,
                "lng": coordinate.longitude
            ]
            if let tz = timeZone?.identifier {
                place["timeZone"] = tz
            }
            places.append(place)
        }
        return places
    }

    /* ────────── 予報 ────────── */

    /**
     日ごとの予報(WeatherKit が返すのは今日から10日ぶん)と、表示義務のあるマーク。

     日付は**旅先のタイムゾーンの暦**で `yyyy-MM-dd` にする。端末の暦で切ると、
     時差のある旅先で1日ずれる。
     */
    @objc func forecast(_ call: CAPPluginCall) {
        guard #available(iOS 16.0, *) else {
            call.reject("WeatherKit requires iOS 16", "unavailable")
            return
        }
        guard let lat = call.getDouble("lat"), let lng = call.getDouble("lng") else {
            call.reject("lat and lng are required")
            return
        }
        let timeZone = call.getString("timeZone").flatMap { TimeZone(identifier: $0) } ?? TimeZone.current
        let location = CLLocation(latitude: lat, longitude: lng)

        Task {
            do {
                let daily = try await WeatherService.shared.weather(for: location, including: .daily)
                let attribution = try await WeatherService.shared.attribution

                let formatter = DateFormatter()
                formatter.calendar = Calendar(identifier: .gregorian)
                formatter.locale = Locale(identifier: "en_US_POSIX")
                formatter.timeZone = timeZone
                formatter.dateFormat = "yyyy-MM-dd"

                var days: [[String: Any]] = []
                for day in daily {
                    days.append([
                        "date": formatter.string(from: day.date),
                        "symbol": day.symbolName,
                        "high": day.highTemperature.converted(to: .celsius).value,
                        "low": day.lowTemperature.converted(to: .celsius).value,
                        "precip": day.precipitationChance
                    ])
                }
                call.resolve([
                    "days": days,
                    "attribution": [
                        "logoLight": attribution.combinedMarkLightURL.absoluteString,
                        "logoDark": attribution.combinedMarkDarkURL.absoluteString,
                        "legalUrl": attribution.legalPageURL.absoluteString
                    ]
                ])
            } catch {
                call.reject(error.localizedDescription, "failed")
            }
        }
    }
}

/**
 地名の補完(マップアプリで打ち込むと出る候補)。デリゲートで返ってくるので、
 1回ぶんの問い合わせをこのクラスに閉じ込めて、完了ハンドラの形にする。

 - 最初に返ってきた候補の一覧で終える(打ち込み途中の更新を待たない。文字列は確定している)
 - **5秒で打ち切る。** 返事が来ないことがあるので、次の段へ進ませる
 - 地名だけ(`.address`)。店や施設は混ぜない
 */
private final class PlaceCompleter: NSObject, MKLocalSearchCompleterDelegate {
    private let completer = MKLocalSearchCompleter()
    private var done: (([MKLocalSearchCompletion], Error?) -> Void)?

    func run(_ query: String, done: @escaping ([MKLocalSearchCompletion], Error?) -> Void) {
        self.done = done
        completer.delegate = self
        completer.resultTypes = .address
        completer.queryFragment = query
        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
            self?.finish([], NSError(domain: "timeout", code: 0))
        }
    }

    func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) {
        finish(completer.results, nil)
    }

    func completer(_ completer: MKLocalSearchCompleter, didFailWithError error: Error) {
        finish([], error)
    }

    private func finish(_ results: [MKLocalSearchCompletion], _ error: Error?) {
        guard let done = done else { return }
        self.done = nil
        completer.cancel()
        done(results, error)
    }
}
