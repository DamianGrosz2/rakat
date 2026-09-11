# Rakat — v1 basic version

Against the build spec's week 1–3 order plus onboarding. Spec:
`~/agent/companies-context/dadama/product/drafts/2026-09-10-quran-app-v1-build-spec.md`

Scope is the spec's weeks 1–3 + onboarding. **Out:** memorisation/SRS, Ramadan mode, converts path,
mushaf page mode, payment, AI Q&A, music, ads, hadith.

---

## 0 · Foundation — DONE

- [x] `create-expo-app` scaffold, SDK 57.0.21, expo-router, TS. `CLAUDE.md` + `.claude/settings.json` kept.
- [x] `eas.json` with `development` / `preview` / `production` EAS Update channels.
- [x] `app.json`: `com.dadama.rakat` both platforms, `runtimeVersion.policy: fingerprint`.
- [x] Two visual directions built and reviewed → **A · Timetable** chosen for all four surfaces.
- [x] `DESIGN.md` frozen + `design.html` component guide published.
- [x] `src/theme/tokens.ts` as single source → generates `Theme.swift` + Kotlin `colors.xml` pair.
- [x] `src/theme/parity.test.ts` — 40 tests: drift, contrast AA, type budget, Arabic tracking. Drift
      failure verified by tampering with a generated file.
- [x] `DESIGN.md` wired into `CLAUDE.md` via `AGENTS.md`.

## 1 · Prayer core

- [x] `src/prayer/` — engine on `adhan` 4.4.6. 8 institution presets by name, Asr madhab, per-prayer
      offsets, high-latitude rule, `nextPrayer` handling the after-Isha rollover. **44 tests.**
      Found and fixed a real polar bug (inverted order at Tromsø in June).
- [x] `src/prayer/hijri.ts` — `@umalqura/core` + regional sighting offset.
- [x] `src/prayer/settings.ts` — versioned settings, with a test proving a version bump leaves
      method/madhab/offsets byte-identical.
- [x] Persistence on `expo-sqlite/kv-store` (survives updates better than a plist blob).
- [x] Location read **once**, stored locally, reverse-geocoded on-device. No network call anywhere
      in the path.
- [x] **Athan, end to end.** Planner (12 tests: the 64-cap, nearest-first, no-churn re-planning)
      plus the scheduling edge on `expo-notifications`, rewritten on every foreground. The CC0
      recording ("Beautiful adhan", Adam-synagda, Wikimedia) ships trimmed to 29s as the notification
      sound — iOS hard-caps it at 30 — with the full 154s version for the in-app preview.
- [x] **Per-prayer offsets ("match my mosque")** — the engine already supported them; the UI now
      exists. This is the escape hatch that makes the institution presets honest.
- [x] **Qibla** — great-circle bearing + distance, unit-tested against four known cities. Degrades
      honestly where there is no magnetometer: static dial, plainly labelled, rather than a dial that
      silently never moves. Simulator-verified (Berlin 137°, 4,130 km).
- [x] **Home screen** — next-prayer field, timetable with the `now` hairline, method label, tracker
      strip, daily ayah. Simulator-verified with real DITIB/Hanafi Berlin times.

## 2 · Salah Lock (feature-flagged) + habit layer

- [x] `src/lock/` — window model ported from noreeels' `FocusScheduleRule`, rolling ≤4-day schedule
      budget under the 20-monitor cap, menses/travel exclusion, Jumu'ah window. **48 tests.**
- [x] iOS bridge: `react-native-device-activity` 0.6.1. All three extension targets exist in the
      Xcode project with `family-controls` + the app group; the widget correctly has the app group
      and **not** family-controls. **Device-verify only** — Screen Time does not run in the simulator.
- [x] `src/lock/monitor.ts` — the REAL DeviceActivity budget. Found a genuine gap: the planner
      collapses windows and caps at 20, but DeviceActivity has no "these weekdays" schedule, so one
      collapsed window covering 3 weekdays costs 3 monitors. Registering past 20 fails silently.
      **8 new tests**, including the midnight-crossing weekday roll.
- [x] `src/lock/shield.ts` — shield configuration and button behaviour, colours from tokens,
      **13 tests** including one asserting the copy never shames.
- [x] `src/lock/engine.ts` + `use-lock-sync.ts` — registration, stale-monitor cleanup, rewrite on
      every foreground. Fails soft everywhere so the simulator still runs the rest of the app.
- [x] Feature flag (`LOCK_FEATURE_ENABLED`) + Settings section with the app picker.
- [ ] **"I prayed" needs a device to confirm.** This library does not record shield taps as events,
      so the primary button unblocks *and opens the app*, which then records the mark. Whether
      `openApp` works from a ManagedSettingsUI shield is the single thing that must be checked on
      hardware first.
- [ ] Android: wrap noreeels' `wrapper/blocking/` as a local Expo module, add a time-window rule
      beside the daily allowance. Keep the `UsageTracker` overcounting note verbatim.
- [x] Tracker screen: mark by tap, on-time vs late decided against the real prayer window
      (this prayer → next prayer, not the short lock window). Counts up only; a test asserts no
      field is named missed/debt/owed/streak. Simulator-verified.
- [x] **Menses mode** — pauses the tracker, writes no lock schedules, days are skipped by the
      consistency count rather than failed, and are never owed as qada'. 13 tests.
- [x] **Qada' tracker** — owed, made-up, pace, projected finish date. Nothing is owed on a fresh
      install; the word "debt" appears nowhere a user can see. 16 tests.

## 3 · Reader (text mode only)

- [x] **Full mushaf bundled** in `expo-sqlite`: 114 surahs, 6236 ayahs, 5.26 MB.
      **The spec's named Arabic edition was wrong** — `ara_kingfahadquranc` is *al-Tafsir al-Muyassar*,
      commentary, not the Quran. Ships `ara_quranuthmanihaf` (Uthmani/Hafs) instead. See HANDOFF §1.
- [x] **Checksums committed and asserted on every `npm test`.** Proven by mutating one letter of
      2:255 and watching it fail.
- [x] German QuranEnc `deu_frankbubenheima` v1.1.0-csv.1, English `eng_rowwadtranslati`. Both
      licence-clean; the tanzil-sourced Bubenheim edition is in `FORBIDDEN_KEYS`.
- [x] Reader screen: surah index, verse view, DE / EN / Arabic-only. One `<Text>` per verse,
      `letterSpacing: 0`, verse number outside the Arabic run. Attribution beside the text.
- [x] Daily ayah card, now database-backed and verified. *(Share image not built.)*
- [ ] Audio player scaffolded behind a flag — reciter rights still pending. The adhan preview uses
      `expo-audio`, so the plumbing exists.

## 4 · Widgets

- [x] iOS widget target (`targets/widget/`), SwiftUI, colours from the generated `Theme.swift`.
      Two widgets: next prayer (small + medium + Lock Screen rectangular) and daily ayah.
- [x] Amiri and Amiri Quran bundled **into the widget target** — an extension cannot reach the host
      app's fonts, and system Arabic lacks the Quranic marks.
- [x] Refresh done properly: the app writes **seven days** of marks and the widget builds one
      timeline entry per prayer, so WidgetKit stays correct for a week with the app never opened.
      That is the actual fix for "the widget doesn't even work"; a single reload policy is not.
- [x] `src/widgets/state.ts` + **8 tests** pinning the JSON contract against the Swift struct —
      a renamed key is a silently blank widget, not a crash.
- [ ] Android: `react-native-android-widget`.
- [x] App icon, splash (light + dark) and the notification sound all generated from the design
      tokens. The Expo placeholders are gone.

## 5 · Onboarding

- [x] **Onboarding** — 6 screens, Skip on every one and permanent, no account, no paywall.
      Simulator-verified end to end including the location permission grant.
- [x] Screen 2 is the institution picker with parameters printed next to each name.

## 6 · Ship-readiness

- [x] `HANDOFF.md` — every open human action, including the engine's six advisor questions.
- [x] `REVIEW.md` — every Arabic surface. Arabic was consolidated into 3 files so the review is
      tractable.
- [ ] Simulator verification pass on every screen (accessibility tree to navigate, screenshots to
      judge visuals).
- [ ] Port noreeels' `tools/verify/archive-entitlements.sh` — it catches the development-vs-
      distribution Family Controls entitlement trap that rejected noreeels 1.0 (1).

---

## Standing constraints

- Every calculation on-device. Location read once, stored locally. No analytics SDK that sees coordinates.
- Prayer calculation in TS → OTA-patchable via EAS Update, inside Apple guideline 2.5.2.
- Offline-first. Settings survive updates.
- OTA cannot touch the native quarter — hence `runtimeVersion.policy: fingerprint`.
- Nothing with Arabic on it ships without the reviewer's sign-off.
- No feature the spec excludes. Name nothing "Salah Lock" in user-facing copy — that app exists.

## Review

**Verified on the iOS simulator (iPhone, Berlin 52.52/13.40):** onboarding all six screens →
location permission → home → tracker mark. Home shows DITIB · Diyanet · Hanafi, 29 Rabiʿ al-Awwal
1448, Fajr 04:59 / Sunrise 06:27 / Dhuhr 13:08 / Asr 17:31 / Maghrib 19:38 / Isha 21:06, with the
`now` hairline correctly placed between Sunrise and Dhuhr. Arabic joins correctly, tashkeel is not
clipped. Marking Fajr at 10:10 counted as **on time**, which is right: the Fajr window runs to Dhuhr.

**Gates:** `npx tsc --noEmit` 0 errors · `npx expo lint` 0 problems · `npm test` 144 passing.

**Three defects found by running it, not by reading it:**
1. CocoaPods failed with an `Encoding::CompatibilityError` that masked the real error — a non-UTF-8
   shell locale. Builds need `LANG=en_US.UTF-8`.
2. The daily ayah was missing from the home screen entirely; the brief specifies three things there.
3. Safe-area handling was wrong twice in opposite directions — first double-applied (first row 60pt
   too low), then absent (first row under the Dynamic Island) because `StyleSheet.absoluteFill`
   escapes a `SafeAreaView`'s padding. Now owned by one `Screen` component with the reasoning
   written down so it does not regress.
