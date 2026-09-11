# Rakat — open human actions

Everything here needs a person. Nothing on this list can be closed by writing code.
Ordered by lead time: the things at the top block TestFlight and take weeks, the things at the
bottom take minutes.

---

## 1 · Licensing — start these first, they are slower than the code

### Reciter audio — the blocker for synced recitation
**Status: not started. Nothing on GitHub grants reciter rights.**

The audio player is scaffolded behind a feature flag with placeholder audio for exactly this reason.
Timings are open (CC BY 4.0, `Wider-Community/quranic-universal-audio`, `cpfair/quran-align`); the
recordings are not.

- [ ] Email Quran Foundation / QuranicAudio for per-reciter permission
- [ ] Email Tarteel / QUL for the same
- [ ] Or commission a reciter directly — cleanest rights position, and the only one that scales to a
      paid tier later
- [ ] Avoid QUA's `*_yt` sets (YouTube-sourced) and any Maqra/HuggingFace audio mirror for anything
      commercial

### KFGQPC font and text terms
- [ ] Verify at `dm.qurancomplex.gov.sa/rights`. Two repos quote KFGQPC's own terms as free for
      software worldwide with only commercial *printing* restricted — confirm that directly rather
      than trusting the quote.
- [ ] Not currently blocking: the shipped faces are Amiri and Amiri Quran under OFL-1.1, with the
      licences bundled at `assets/fonts/licenses/`.

### Quran text and translations

**⚠ The single most dangerous thing in this repo. Read before changing an edition key.**

`fawazahmed0/quran-api` mirrors two licence families under near-identical names, and at least one
name is actively misleading:

- **`ara_kingfahadquranc`** sounds like the KFGQPC mushaf and is sourced from tanzil.net (which
  would make it CC BY). **It is not the Quran.** It is *al-Tafsir al-Muyassar* — undiacritised
  Arabic commentary. Its 1:1 reads
  "سورة الفاتحة سميت هذه السورة بالفاتحة؛ لأنه يفتتح بها القرآن العظيم…". Shipping it as the mushaf
  would have been exactly the existential bug this product cannot have. It is listed in
  `FORBIDDEN_KEYS`.
- **`ara_quranuthmanihaf`** is the real Uthmani (Hafs) text, full tashkeel, from
  qurancomplex.gov.sa. This is what ships.
- **`deu_asfbubenheimand`** and **`deu_frankbubenheima`** are both credited to Bubenheim & Elyas.
  The first is tanzil-sourced and **non-commercial**; only the second (QuranEnc v1.1.0-csv.1) may
  ship in a paid app.

- [ ] **Because the Arabic now comes from KFGQPC rather than Tanzil, the KFGQPC terms check below is
      load-bearing, not optional.** Verify at `dm.qurancomplex.gov.sa/rights` before any public
      build. If the terms turn out to restrict us, the fallback is Tanzil's own `quran-uthmani.txt`
      (CC BY 3.0) downloaded directly from tanzil.net — not from this mirror.
- [ ] The checksum test pins the shipped text so it cannot change unnoticed. A wrong letter is an
      existential bug for this product.
- [ ] German is QuranEnc Bubenheim & Elyas via `fawazahmed0/quran-api`, edition
      `deu_frankbubenheima`. Republishing incl. commercial is permitted **with** attribution
      ("QuranEnc.com" + publisher), the version number retained, updates tracked, and no ads beside
      it. The single German line currently on screen is unverified — see `REVIEW.md`.
- [ ] **Never** ship a Tanzil-sourced translation (Abu Rida, Khoury, Zaidan, Diyanet, Saheeh
      International). They are non-commercial and this app will have a paid tier.

### Hadith
Out of scope for v1. If it ever ships, request a `sunnah.com` API key by GitHub issue and use the
API — scraping is forbidden, and `AhmedBaset/hadith-json` is scraped from it.

---

## 2 · Apple — Family Controls

**You said you are filing this in the background and expect direct approval because the developer
account already carries other Family Controls apps.** Recorded here so it is not lost:

These are the **actual generated bundle IDs**, read out of the prebuilt Xcode project — not guesses:

```
com.dadama.rakat                              (app)
com.dadama.rakat.ActivityMonitorExtension
com.dadama.rakat.ShieldAction
com.dadama.rakat.ShieldConfiguration
```

App Group: `group.com.dadama.rakat`

- [x] Entitlements verified in the prebuild: the app and all three Screen Time extensions carry
      `family-controls` + the app group. **The widget (`com.dadama.rakat.RakatWidget`) carries the
      app group and NOT family-controls** — it needs the group to read prayer times, but a widget is
      not a Screen Time extension and Apple's automated review rejects an archive where one claims
      the entitlement.
- [ ] Port noreeels' `tools/verify/archive-entitlements.sh`. It checks exactly the split above, plus
      the development-vs-distribution signing trap that rejected noreeels 1.0 (1).
- [ ] That same script also catches the trap that got noreeels 1.0 (1) rejected: an archive signed
      `Apple Development` carries the **development** Family Controls entitlement, which Apple's
      automated check rejects even when all five entitlement files are correct. Check for a valid
      Apple Distribution identity before the first upload.

---

## 3 · The Muslim advisor — before any Arabic or any prayer time ships

`REVIEW.md` lists every Arabic surface. Separately, the prayer engine has **six judgement calls that
need an advisor, not an engineer.** These came out of building it and each one changes real prayer
times:

1. **DITIB offsets currently ship as all zeros.** The seam exists (`DITIB_OFFSETS`, tested to stack
   additively on adhan's Turkey offsets), but the minutes were not invented, deliberately —
   fabricated offsets are wrong prayer times shipped with confidence. Concrete lead: adhan's `Turkey`
   applies `sunrise −7, dhuhr +5, asr +4, maghrib +7` (Diyanet temkin, reverse-engineered against
   *Turkish* cities). If DITIB's German tables print plain astronomical sunrise/maghrib, the
   correction is roughly `sunrise +7, maghrib −7`. **One table lookup settles it.**
2. **High latitude matters more than any offset, and is the biggest open fidelity question.**
   In Berlin on 21 June every angle-based method collapses to the same Fajr 03:42 / Isha 22:35 — the
   high-latitude *rule* is deciding, not the institution. Diyanet/DITIB use *aqrab al-ayyam* (nearest
   day the angle is reached) for European cities; `adhan` has no equivalent for the sub-polar case,
   so Berlin summer times will differ from DITIB's published table by more than any per-prayer offset
   can absorb. Flagged inline in `src/prayer/methods.ts` and `src/prayer/times.ts`.
3. **IGMG carries `dhuhr +1` minute.** Angles are 18°/17° as specified; the safety minute past true
   zawal was added because MWL, ISNA, Egypt, Karachi and Diyanet all apply it and praying before
   zawal is invalid. Confirm against an IGMG table.
4. **Jafari carries `maghribAngle: 4`.** Part of the Jafari definition, not an embellishment —
   omitting it would silently hand Shia users the Sunni Maghrib, several minutes early.
5. **An unknown saved method throws rather than falling back.** `migrateSettings` preserves an
   unrecognised method string verbatim (dropping it would be the silent change the spec forbids) and
   `getMethod` then throws. The UI must catch this and prompt. `hasUsableMethod(settings)` is
   exported for the check. **This UI path is not built yet.**
6. **A real polar bug was found and fixed.** At Tromsø in June both of adhan's polar resolvers emit
   an inverted order on some days, because under midnight sun a seventh of the night is ~3 minutes
   and the method's own temkin offsets overrun it. `computePrayerTimes` now clamps `fajr ≤ sunrise`
   and `isha ≥ maghrib`. Worth an advisor's opinion on whether collapsing the window is the right
   behaviour there, or whether those latitudes should show a different UI entirely.

---

## 4 · Infrastructure

- [ ] `eas init` — needs an Expo account login, creates the cloud project ID. `eas.json` is written
      with `development` / `preview` / `production` channels; the project is not yet linked.
- [ ] `eas update:configure` once the project exists.
- [ ] App icon and splash are still the `create-expo-app` placeholders.
- [ ] Adhan audio: download the original CC0 "Beautiful adhan" by Adam-synagda from Wikimedia
      Commons. Do **not** lift the trimmed copy out of `TheAbubakrAbu/Al-Adhan-iOS` without
      re-checking provenance.

---

## 5 · Device-verify — cannot be checked in the simulator

- [ ] **The whole app lock.** FamilyControls, DeviceActivity and ManagedSettings do not work in the
      simulator. The maths is unit-tested (69 tests: windows, the rolling horizon, the real
      20-monitor budget, the shield config and copy, the prayed transition) and all four extension
      targets build and embed — but **no part of the lock has been observed working on hardware.**
      Treat it as unverified until it has. Specifically, on a device:
    - [ ] Does the Family Controls prompt appear, and does the toggle then stick? In the simulator
          `requestAuthorization` never resolves *or* rejects, so there is now an 8s timeout that
          returns "not granted" rather than hanging silently.
    - [ ] **Does `openApp` actually work from a ManagedSettingsUI shield?** This is the single
          riskiest unknown. The library exposes it, but Apple's `ShieldActionDelegate` completion
          handlers are only `.close` / `.defer` / `.none`. "I prayed" depends on it: the library
          does not record shield taps as events, so if the app cannot be opened from the shield,
          nothing ever learns the prayer was marked and the whole flow needs redesigning.
    - [ ] Does a window crossing midnight enforce for 30 minutes and not 23½ hours? The weekday roll
          is unit-tested but the DeviceActivity semantics are not.
- [x] **Widgets verified in the simulator.** Both widgets render with real App Group data; Amiri
      Quran renders correctly inside the extension. Live Activities are not built.
- [ ] Notification scheduling against the real 64-pending cap.
- [ ] Qibla — needs a real magnetometer.

## 6 · Android

- [ ] Tab bar icons. `NativeTabs.Trigger.Icon` takes `drawable="ic_name"` on Android; only the iOS
      SF Symbols are wired. Marked `TODO(android)` in `src/components/app-tabs.tsx`.
- [ ] Wrap noreeels' `wrapper/blocking/` as a local Expo module. Keep the `UsageTracker`
      overcounting note verbatim — it documents a trap that cost real debugging time.
- [ ] The generated `colors.xml` pair already exists at
      `modules/rakat-blocking/android/src/main/res/`, produced by `npm run gen:theme`.

---

## 7 · Product decisions still open

- **"Days consistent" is a rolling 30-day count, not a streak.** Days in the last month where all
  five were marked. Chosen because a streak has a reset and a reset is the "you broke it" moment the
  spec forbids; a rolling count moves gently in both directions. If you want something else on
  screen, it needs a non-punitive definition first.
- **Per-prayer offsets ("match my mosque") have no UI yet.** The engine supports them fully and they
  are tested; only the settings screen is missing.
- **Times are 24-hour, always.** Printed prayer timetables are 24-hour, and a locale-driven 12-hour
  format would put "5:15 PM" in a column sized for "17:15" and break the alignment the design rests
  on. If US 12-hour is wanted it needs a settings toggle and a wider column.
