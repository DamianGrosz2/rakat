# Arabic review sheet

**Nothing on this list ships without sign-off.** That is a build dependency from the spec, not a
courtesy. A wrong letter in the mushaf is an existential bug for this product, and the category's
sharpest criticism of competitors is *"I don't think this app is really made by Muslims for
Muslims."*

Every Arabic string in the app is in **three files**. It was deliberately consolidated so this review
is tractable: a string copy-pasted across five screens cannot be reviewed once.

| | |
|---|---|
| Reviewer | *unassigned — this is the blocker* |
| Last reviewed | never |
| Build | pre-alpha, simulator only |

---

## 1 · Prayer names — `src/prayer/labels.ts`

Shown on the home timetable, the next-prayer field and the tracker. Rendered in **Amiri**, 15pt
(`ui`) and 21pt (`display`), `letterSpacing: 0`.

| Key | Latin | Arabic | Check |
|---|---|---|---|
| `fajr` | Fajr | الفجر | ☐ |
| `sunrise` | Sunrise | الشروق | ☐ |
| `dhuhr` | Dhuhr | الظهر | ☐ |
| `asr` | Asr | العصر | ☐ |
| `maghrib` | Maghrib | المغرب | ☐ |
| `isha` | Isha | العشاء | ☐ |

Questions for the reviewer:
- Are the bare definite forms right for a timetable, or should they carry vowels (الفَجْر)?
- Is "Sunrise / الشروق" correctly presented as **not a prayer**? It is excluded from the type that
  can be marked, from the tracker, and from `nextPrayer` — but it is displayed in the list.
- Latin transliteration: bare "Isha"/"Dhuhr" or diacritics ("ʿIshāʾ", "Ẓuhr")?

## 1b · The qibla screen — `src/app/(tabs)/qibla.tsx`

One word, rendered in **Amiri**, 21pt (`display`), `letterSpacing: 0`, one `<Text>`.

| Latin | Arabic | Check |
|---|---|---|
| Qibla | القبلة | ☐ |

- ☐ Is the bare definite form right as a screen title, or should it be vowelled (ٱلْقِبْلَة)?
- ☐ The screen prints the bearing as a **map bearing from true north** (Berlin 137°). Confirm that is
  the right thing to show, and that "from true north" is the right label — several qibla apps show
  magnetic bearing without saying so, which is a several-degree lie.
- ☐ "Turn right / Turn left" deliberately does **not** mirror under RTL, because it refers to the
  user's body rather than the layout. Confirm that reads correctly to an Arabic-reading user.

## 2 · Hijri month names — `src/prayer/hijri.ts`

Shown top-right of the home screen with the day and year.

| # | Latin | Arabic | Check |
|---|---|---|---|
| 1 | Muharram | محرم | ☐ |
| 2 | Safar | صفر | ☐ |
| 3 | Rabiʿ al-Awwal | ربيع الأول | ☐ |
| 4 | Rabiʿ al-Akhir | ربيع الآخر | ☐ |
| 5 | Jumada al-Ula | جمادى الأولى | ☐ |
| 6 | Jumada al-Akhira | جمادى الآخرة | ☐ |
| 7 | Rajab | رجب | ☐ |
| 8 | Shaʿban | شعبان | ☐ |
| 9 | Ramadan | رمضان | ☐ |
| 10 | Shawwal | شوال | ☐ |
| 11 | Dhu al-Qaʿda | ذو القعدة | ☐ |
| 12 | Dhu al-Hijja | ذو الحجة | ☐ |

Also to check:
- ☐ **The computed date itself.** Umm al-Qura via `@umalqura/core`, with a user-settable regional
  sighting offset of −2..+2 days. Confirm the default of 0 is right for the German/Turkish audience,
  and that the offset range is wide enough.
- ☐ Month 4 and 6 naming: "al-Akhir/al-Akhira" vs "ath-Thani/ath-Thaniya" — both are in use.

## 3 · The daily ayah — `src/app/reader.tsx`

**Highest-stakes item on this page.** Rendered in **Amiri Quran**, 23pt, line-height 2.0,
`letterSpacing: 0`, one `<Text>`.

> إِنَّ مَعَ ٱلْعُسْرِ يُسْرًا

| | |
|---|---|
| Reference | Ash-Sharh 94:6 |
| German | "Gewiss, mit der Erschwernis ist Erleichterung." |
| Attribution shown | Bubenheim & Elyas |

- ☐ **Arabic text verbatim**, including every tashkeel mark and the superscript alif.
- ☑ **The German line is no longer written from memory.** It now comes from the bundled database,
  QuranEnc `deu_frankbubenheima` v1.1.0-csv.1. Worth noting how wrong the memory version was:
  placeholder `"Gewiss, mit der Erschwernis ist Erleichterung."` vs actual
  `"gewiß, mit der Erschwernis ist Erleichterung"` — different casing, ß not ss, no full stop. The
  "Translation unverified" marker was doing real work.
- ☐ Confirm the attribution rendered beside the text satisfies QuranEnc's terms (source + version).
- ☐ Attribution format: QuranEnc's terms require "QuranEnc.com" plus the publisher and the retained
  version number. The current card shows neither the source nor the version.
- ☐ Is a single hardcoded verse acceptable as a placeholder at all, or should the reader ship empty
  until the checksummed Tanzil database lands?

## 3a · Uthmani orthography — one concrete question, found in the shipped data

The bundled Arabic is KFGQPC Uthmani (Hafs). Its conventions differ from the Imlaei spelling most
people type from memory, and one difference shows up immediately at **94:6**.

Shipped text, by codepoint:

```
… ر U+0631   ࣰ U+08F0 (ARABIC OPEN FATHATAN)   ␣ U+0020 SPACE   ا U+0627
```

i.e. `يُسۡرࣰ ا` — the tanween sits on the rāʾ, then **a literal space**, then the silent alif.
Typed from memory the same word is `يُسْرًا` (U+064B on the alif, no space).

- ☐ **Is the space correct KFGQPC Uthmani convention, or is it a defect in this mirror?** This
  decides whether the mushaf we ship is right. Nobody on this side may "tidy" it either way —
  editing the text is not a formatting decision.
- ☐ Does Amiri Quran render U+08F0 + space + alif correctly on device, without a visible gap that
  reads as a word break?
- ☐ Same check for the other open-tanween forms (U+08F0/U+08F1/U+08F2) wherever they occur.

The checksum test pins whatever is decided, so this question only has to be answered once.

## 3b · The widget and the shield

Both run in their **own processes** and cannot reach the app's fonts or its theme, so each carries
its own copy of what it needs. That makes them the easiest places in the codebase for a divergence
to survive unnoticed.

**Widget — `targets/widget/RakatWidget.swift`**

- ☐ The Arabic prayer names on the medium widget are the same strings as §1 (they come from the same
  `MARK_LABEL`, written into the App Group by the app — not a second copy).
- ☐ The daily-ayah widget renders the §3 verse in **Amiri Quran, bundled into the widget target**
  with `kerning(0)` and RTL layout. Check the joins and that no tashkeel is clipped at widget size —
  the widget is small and `minimumScaleFactor(0.6)` can shrink it further.
- ☐ Is a Quranic verse on a Home Screen widget acceptable at all, and does it need any adab
  (handling) note — e.g. should it be suppressed on the Lock Screen?

**Shield — `src/lock/shield.ts`** (declarative; no custom Swift)

Currently English only. Every string lands here again when German and Turkish exist.

| Element | Text | Check |
|---|---|---|
| Title | "{Prayer} has begun" | ☐ |
| Subtitle | "This app is paused until you mark the prayer." | ☐ |
| Primary button | "I prayed" | ☐ |
| Secondary button | "Not now" | ☐ |
| Icon | SF Symbol `clock` | ☐ |

- ☐ **Is "I prayed" the right thing to ask?** It is an attestation, and the user is the only one who
  knows. A test asserts the copy never shames, but whether the *question* is appropriate is a
  judgement only the reviewer can make.
- ☐ The icon is a clock, deliberately — not a crescent, not a mosque. The shield is about time, and
  claiming a religious symbol there felt like a statement the app should not make. Confirm.
- ☐ "Not now" closes the screen and leaves the app paused. Is that the right non-coercive balance?

## 4 · Rendering — verify on a device, not a screenshot

These are the failure modes that make Arabic *wrong* rather than merely ugly. The first two are
enforced by tests; the rest need eyes.

- ☐ Letters join correctly everywhere (`letterSpacing: 0` is asserted in `src/theme/parity.test.ts`).
- ☐ Tashkeel is not clipped at the top or bottom of any line — the 2.0 line height on Quranic text
  exists for this.
- ☐ No line is split across multiple `<Text>` nodes (shaping happens per node; the join at the
  boundary would be lost).
- ☐ Amiri Quran is used **only** for Quranic text; prayer names and UI use Amiri.
- ☐ RTL layout: the timetable mirrors correctly when the device is set to Arabic.
- ☐ Rendering checked at the largest Dynamic Type setting.

## 5 · Institution names and parameters — `src/prayer/methods.ts`

Not Arabic script, but religiously consequential: these name real institutions and the numbers
decide when people pray.

| Key | Shown as | Shown parameters | Check |
|---|---|---|---|
| `ditib` | DITIB · Diyanet | 18° / 17° + offsets | ☐ |
| `igmg` | IGMG | 18° / 17° | ☐ |
| `isna` | ISNA | 15° / 15° | ☐ |
| `mwl` | Muslim World League | 18° / 17° | ☐ |
| `ummalqura` | Umm al-Qura | 18.5° / 90 min | ☐ |
| `egyptian` | Egyptian General Authority | 19.5° / 17.5° | ☐ |
| `karachi` | University of Karachi | 18° / 18° | ☐ |
| `jafari` | Shia Ithna-Ashari | 16° / 14° | ☐ |

- ☐ Is naming an institution acceptable when we are approximating it? **DITIB's offsets currently
  ship as all zeros** and its high-latitude behaviour is known to diverge from DITIB's published
  German tables (see `HANDOFF.md` §3). Should the label say "DITIB (approximate)" until the tables
  are matched?
- ☐ Asr labels: "Shafi, Maliki, Hanbali" (shadow ×1) and "Hanafi" (shadow ×2).

## 5b · Menses mode and qada' — `src/tracker/`, tracker tab

No Arabic script on this surface (the prayer names come from §1; "qada'" is written in Latin
transliteration on purpose, so no new Arabic string was introduced). But it is the most
**religiously consequential non-Arabic screen in the app**: it encodes two rulings in code and
states them to the user as fact.

**The two rulings as encoded.** Both are asserted by tests, so a reviewer correction is a one-line
change plus a red test, not an archaeology project.

| | Encoded behaviour | Where |
|---|---|---|
| Prayers are **lifted** during menses, not postponed | An excluded day contributes exactly **zero** qada'. Fasts are not modelled at all. | `src/tracker/menses.ts`, test *"menses days are never owed as qada"* |
| An excluded day is **not** a day the user fell short | Skipped by `daysConsistent` rather than counted as incomplete; the lock writes no schedules for it; the week strip shows a neutral field, never the `now` hue | `src/tracker/consistency.ts`, `excludedKeys()` |

- ☐ **Is "not made up" right, stated that plainly, with no madhhab qualifier?** The screen says so in
  as many words. It is the settled position for salah (and the deliberate contrast with the fasts of
  Ramadan, which are made up) — but confirm the phrasing is safe across the Hanafi/Shafi audience
  this app is aimed at, and whether the fasting contrast should be mentioned at all rather than
  quietly omitted as out of scope.
- ☐ **Nifas (post-natal) and istihada (irregular bleeding) are not modelled.** A period is one date
  range with one meaning. Is one undifferentiated "paused" state acceptable, or does lumping nifas in
  with menses mislead? The data model takes an open-ended range, so nifas needs no code change — only
  a decision about what the screen is allowed to call it.
- ☐ **The user decides the boundaries, not the app.** Nothing computes a cycle, predicts a start, or
  questions a length. Confirm that is the right posture — the alternative (prompting "has it ended?")
  was rejected as exactly the nagging the product rule forbids.
- ☐ **Marking is disabled on a paused day** rather than merely uncounted. A woman who prays a
  voluntary prayer that day cannot record it. Correct, or too blunt?
- ☐ **The derived backlog.** Qada' owed is inferred from days that passed with nothing tapped. It is
  stamped from first launch so no backlog is ever invented on install, and it is correctable
  downwards by hand — but a user who prays faithfully and forgets to tap will still be shown a
  number. Is inferring at all defensible, or should qada' be **entirely** hand-entered?
- ☐ **Is the pace picker (five a week / one a day / two a day) appropriate framing**, or does
  scheduling make-up prayers on a productivity cadence cheapen them?
- ☐ Copy check, verbatim from the screen: *"the prayers missed during menses are not made up later"*,
  *"I'm on my period"*, *"Making up prayers"*, *"Prayed one"*, *"left"*, *"made up"*. The word "debt"
  appears nowhere a user can see, by rule.

## 6 · Not yet built — will need review before it ships

- The bundled mushaf and its checksum against the canonical Tanzil source
- German, English and Turkish translations, each with attribution and version
- The daily-ayah share image *(no faces, no figures, no depiction of prophets — ever)*
- The shield screen's copy, in every language
- The app icon and the shield glyph (two arches, a mihrab profile — no figures)
- Onboarding copy, including how the institution picker is introduced
- App Store screenshots and description

---

## Standing rules that constrain every item above

From the research, sourced to Muslim scholarly sources, not inference:

1. **No depiction of prophets, companions, or any animate being** in any surface — app, share image,
   store screenshot or ad. Calligraphy, geometry, landscape only.
2. **No music or processed audio under recitation.** Ship silence by default.
3. **No celebrity Quran narration.** Recitation needs a trained reciter; the required register is
   *tarteel*.
4. **No LLM answering religious questions,** and no AI paraphrase of the Quran. Out of scope by
   design — it is both a theological ruling (Dar al-Ifta, January 2026) and an App Review risk
   (guideline 1.1.5).
