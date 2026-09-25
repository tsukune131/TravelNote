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

     ⚠️ **先に MapKit の検索(`MKLocalSearch`)で引く。** 以前は `CLGeocoder` だけで、
     これは住所の変換なので「ニューヨーク」のようなカタカナの海外の都市名を
     引けなかった(「アメリカ合衆国」は引けた。実機で確認)。マップの検索は
     地図アプリと同じ引き方なので、日本語の海外地名も通る。
     何も返らなかったときだけ `CLGeocoder` に回す。

     ⚠️ **検索範囲(region)は付けない。** 「世界全体」(`MKMapRect.world`)を渡していた版では
     「ハワイ」「釜山」は出るのに「トロント」「ニューヨーク」が出なかった ──
     MapKit の検索が毎回空で、`CLGeocoder` に落ちていたとみられる(緯度の幅 170° 超の
     範囲を無効として扱う疑い)。範囲なしなら端末の近くに寄るだけで、世界中を探す。

     返り値の `debug` に、それぞれの検索が何を返したか(件数かエラー)を入れる。
     設定の隠し表示(広告の診断と同じ場所)で見られる。実機でしか確かめられないため。
     */
    @objc func geocode(_ call: CAPPluginCall) {
        let query = call.getString("query") ?? ""
        if query.trimmingCharacters(in: .whitespaces).isEmpty {
            call.resolve(["places": []])
            return
        }

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
            let mapkit = "mapkit: " + self.describe(count: found.count, error: error)
            if !found.isEmpty {
                call.resolve(["places": self.places(from: found, query: query), "debug": mapkit])
                return
            }
            self.geocodeAddress(query, call, debug: mapkit)
        }
    }

    /** 住所としての変換。MapKit の検索で何も出なかったときの控え */
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
