import Capacitor
import CoreLocation
import Foundation
import WeatherKit

/**
 天気予報(WeatherKit)と地名検索(CLGeocoder)。JS 側は `src/weather/weather.ts`。

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
     */
    @objc func geocode(_ call: CAPPluginCall) {
        let query = call.getString("query") ?? ""
        if query.trimmingCharacters(in: .whitespaces).isEmpty {
            call.resolve(["places": []])
            return
        }
        let locale = Locale(identifier: Locale.preferredLanguages.first ?? "ja_JP")
        CLGeocoder().geocodeAddressString(query, in: nil, preferredLocale: locale) { placemarks, error in
            if error != nil {
                // 見つからないときもエラーで返ってくる。JS では「見つかりませんでした」
                call.resolve(["places": []])
                return
            }
            var places: [[String: Any]] = []
            for placemark in (placemarks ?? []).prefix(5) {
                guard let coordinate = placemark.location?.coordinate else { continue }
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
                if let tz = placemark.timeZone?.identifier {
                    place["timeZone"] = tz
                }
                places.append(place)
            }
            call.resolve(["places": places])
        }
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
