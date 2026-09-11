//
//  RakatWidget.swift
//
//  Next prayer on the Home Screen and the Lock Screen, plus the daily ayah.
//
//  Colours come from Theme.swift, which is GENERATED from src/theme/tokens.ts by
//  `npm run gen:theme`. A widget extension runs in its own process and cannot
//  reach the JS bundle, so the values have to be compiled in — which is exactly
//  why the parity test exists. Never hand-edit Theme.swift.
//

import SwiftUI
import WidgetKit

// MARK: - Data, as the app writes it

/// Written by the app into the shared App Group on every foreground.
/// See `src/widgets/bridge.ts` — the two shapes must stay in step.
struct WidgetState: Codable {
    struct Mark: Codable {
        let key: String
        let latin: String
        let arabic: String
        /// Epoch seconds. Marks span several days on purpose — see the timeline note.
        let at: Double
        /// Sunrise is displayed but is not a prayer, and must never be "next".
        let isPrayer: Bool

        var date: Date { Date(timeIntervalSince1970: at) }
    }

    struct Ayah: Codable {
        let arabic: String
        let reference: String
    }

    let method: String
    let madhab: String
    let hijri: String
    let marks: [Mark]
    let ayah: Ayah?
}

enum SharedStore {
    static let appGroup = "group.com.dadama.rakat"
    static let key = "widget.state"

    static func read() -> WidgetState? {
        guard
            let defaults = UserDefaults(suiteName: appGroup),
            let raw = defaults.string(forKey: key),
            let data = raw.data(using: .utf8)
        else { return nil }
        return try? JSONDecoder().decode(WidgetState.self, from: data)
    }
}

// MARK: - Formatting

/// 24-hour, zero-padded, always — matching the app. A locale-driven 12-hour
/// format would put "5:15 PM" in a slot sized for "17:15".
private let clock: DateFormatter = {
    let f = DateFormatter()
    f.dateFormat = "HH:mm"
    return f
}()

private func untilLabel(from: Date, to: Date) -> String {
    let mins = max(0, Int((to.timeIntervalSince(from) / 60).rounded()))
    let h = mins / 60
    return h > 0 ? "in \(h)h \(mins % 60)m" : "in \(mins)m"
}

// MARK: - Timeline

struct PrayerEntry: TimelineEntry {
    let date: Date
    let next: WidgetState.Mark?
    let today: [WidgetState.Mark]
    let method: String
    let ayah: WidgetState.Ayah?

    static let placeholder = PrayerEntry(
        date: Date(),
        next: WidgetState.Mark(key: "asr", latin: "Asr", arabic: "العصر",
                               at: Date().addingTimeInterval(9660).timeIntervalSince1970,
                               isPrayer: true),
        today: [],
        method: "DITIB · Diyanet",
        ayah: WidgetState.Ayah(arabic: "إِنَّ مَعَ ٱلْعُسْرِ يُسْرًا", reference: "94:6")
    )
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> PrayerEntry { .placeholder }

    func getSnapshot(in context: Context, completion: @escaping (PrayerEntry) -> Void) {
        completion(entry(at: Date()) ?? .placeholder)
    }

    /// One entry per upcoming prayer, for as many days as the app wrote.
    ///
    /// This is the fix for the category's top widget complaint ("the widget
    /// doesn't even work"). Rather than showing one value and hoping a reload
    /// arrives, the app writes several days of marks and WidgetKit advances
    /// through them on its own — so the widget stays correct even if the user
    /// does not open the app for a week.
    func getTimeline(in context: Context, completion: @escaping (Timeline<PrayerEntry>) -> Void) {
        let now = Date()
        guard let state = SharedStore.read() else {
            completion(Timeline(entries: [.placeholder], policy: .after(now.addingTimeInterval(900))))
            return
        }

        let upcoming = state.marks.filter { $0.date > now }
        var entries: [PrayerEntry] = []

        // Now, plus the moment each mark passes.
        var cursors: [Date] = [now]
        cursors.append(contentsOf: upcoming.map { $0.date })

        for cursor in cursors.prefix(64) {
            if let e = entry(at: cursor, state: state) { entries.append(e) }
        }
        if entries.isEmpty { entries = [.placeholder] }

        // Ask for a refresh shortly after the data runs out, so a user who has
        // not opened the app still gets one more chance to be correct.
        let end = entries.last?.date.addingTimeInterval(3600) ?? now.addingTimeInterval(3600)
        completion(Timeline(entries: entries, policy: .after(end)))
    }

    private func entry(at date: Date, state: WidgetState? = nil) -> PrayerEntry? {
        guard let state = state ?? SharedStore.read() else { return nil }
        let cal = Calendar.current
        // Sunrise is shown in the list but can never be "next" — it is not a prayer.
        let next = state.marks.first { $0.date > date && $0.isPrayer }
        let today = state.marks.filter { cal.isDate($0.date, inSameDayAs: date) }
        return PrayerEntry(date: date, next: next, today: today,
                           method: state.method, ayah: state.ayah)
    }
}

// MARK: - Next prayer

struct NextPrayerView: View {
    @Environment(\.widgetFamily) var family
    let entry: PrayerEntry

    var body: some View {
        switch family {
        case .systemMedium: medium
        case .accessoryRectangular: accessory
        default: small
        }
    }

    /// The next-prayer field from the app, at widget scale: a solid accent field,
    /// the time in the display size, nothing floating.
    private var small: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("NEXT").font(.system(size: 10, weight: .semibold))
                .kerning(1.6).foregroundStyle(Theme.accentInk.opacity(0.72))
            if let next = entry.next {
                Text(next.latin).font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Theme.accentInk)
                Spacer(minLength: 4)
                Text(clock.string(from: next.date))
                    .font(.system(size: 34, weight: .semibold))
                    .monospacedDigit()
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
                    .foregroundStyle(Theme.accentInk)
                Text(untilLabel(from: entry.date, to: next.date))
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.accentInk.opacity(0.78))
            } else {
                Spacer()
                Text("Open Rakat").font(.system(size: 13))
                    .foregroundStyle(Theme.accentInk.opacity(0.8))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackground(Theme.accent, for: .widget)
    }

    /// The timetable, ruled, exactly as on the home screen.
    private var medium: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(entry.method.uppercased())
                .font(.system(size: 9, weight: .semibold)).kerning(1.2)
                .foregroundStyle(Theme.accent)
                .padding(.bottom, 6)
            ForEach(entry.today.filter { $0.isPrayer }, id: \.key) { mark in
                let isNext = mark.key == entry.next?.key
                HStack {
                    Text(mark.latin)
                        .font(.system(size: 13, weight: isNext ? .semibold : .regular))
                    Spacer()
                    Text(mark.arabic)
                        .font(.custom("Amiri-Regular", size: 13))
                        .kerning(0)
                        .foregroundStyle(Theme.inkMuted)
                    Spacer()
                    Text(clock.string(from: mark.date))
                        .font(.system(size: 13, weight: isNext ? .semibold : .regular))
                        .monospacedDigit()
                }
                .foregroundStyle(isNext ? Theme.accent : Theme.ink)
                .padding(.vertical, 3)
                Divider().background(Theme.hairline)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackground(Theme.ground, for: .widget)
    }

    /// Lock Screen. iOS renders accessory families monochrome over vibrancy —
    /// it takes the wallpaper's tint, not ours — so this is a hierarchy decision
    /// only. We lead with the clock time, per the frozen direction.
    private var accessory: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let next = entry.next {
                HStack {
                    Text(next.latin.uppercased())
                        .font(.system(size: 11, weight: .semibold)).kerning(1)
                    Spacer()
                    Text(clock.string(from: next.date))
                        .font(.system(size: 16, weight: .semibold)).monospacedDigit()
                }
                Text(untilLabel(from: entry.date, to: next.date))
                    .font(.system(size: 11)).opacity(0.8)
            } else {
                Text("Rakat").font(.system(size: 13, weight: .semibold))
            }
        }
        .containerBackground(.clear, for: .widget)
    }
}

// MARK: - Daily ayah

struct DailyAyahView: View {
    @Environment(\.widgetFamily) var family
    let entry: PrayerEntry

    var body: some View {
        VStack(alignment: .trailing, spacing: 8) {
            if let ayah = entry.ayah {
                // One Text for the whole line, kerning 0. Splitting the line or
                // adding tracking breaks the joins between Arabic letters.
                Text(ayah.arabic)
                    .font(.custom("AmiriQuran-Regular", size: family == .systemMedium ? 22 : 17))
                    .kerning(0)
                    .lineSpacing(family == .systemMedium ? 10 : 6)
                    .multilineTextAlignment(.trailing)
                    .environment(\.layoutDirection, .rightToLeft)
                    .minimumScaleFactor(0.6)
                    .foregroundStyle(Theme.ink)
                Text(ayah.reference)
                    .font(.system(size: 9, weight: .semibold)).kerning(1.2)
                    .foregroundStyle(Theme.inkMuted)
            } else {
                Text("Open Rakat").font(.system(size: 13)).foregroundStyle(Theme.inkMuted)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        .containerBackground(Theme.surface, for: .widget)
    }
}

// MARK: - Widgets

struct NextPrayerWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "RakatNextPrayer", provider: Provider()) { entry in
            NextPrayerView(entry: entry)
        }
        .configurationDisplayName("Next prayer")
        .description("The next prayer and how long until it.")
        // accessoryRectangular is the Lock Screen. iOS renders it monochrome
        // over vibrancy, so it takes the wallpaper's tint rather than ours.
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

struct DailyAyahWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "RakatDailyAyah", provider: Provider()) { entry in
            DailyAyahView(entry: entry)
        }
        .configurationDisplayName("Daily ayah")
        .description("Today's ayah.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct RakatWidgetBundle: WidgetBundle {
    var body: some Widget {
        NextPrayerWidget()
        DailyAyahWidget()
    }
}
