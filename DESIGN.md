# Rakat — design system

Frozen 2026-09-11 from direction **A · Timetable**. Chosen over "Horizon" across all four surfaces.

The source of truth is [`src/theme/tokens.ts`](src/theme/tokens.ts), not this file. This file is the
why. The native colour files are generated — see [Parity](#parity-one-source-three-outputs).

## The idea in one line

The printed mosque prayer timetable, done properly. Ruled rows, tabular figures, a solid green field
for the next prayer, and one warm hairline for *now*. It should read as a document you trust, not as
an app that wants something from you.

That is a product argument, not a taste: the thing users switch for is correctness, and correctness
has a look. Nothing on the home screen floats, glows or bounces.

## Colour

Light is the primary appearance. Dark is a designed second appearance, not an inversion.

| Token | Light | Dark | Where it goes |
|---|---|---|---|
| `ground` | `#EDEEE9` | `#101413` | Page. A cool paper grey with a faint green bias — deliberately *not* a warm cream. |
| `surface` | `#FFFFFF` | `#181D1C` | The raised row, the ayah card. Used sparingly; most of the app sits on `ground`. |
| `ink` | `#171C1A` | `#E8EBE8` | All body text and figures. |
| `inkMuted` | `#5E6866` | `#929C99` | Secondary times, Arabic prayer names, captions. |
| `hairline` | `#CFD3CE` | `#2A302E` | Row rules, tracker marks at rest. |
| `accent` | `#15564A` | `#4E9E8A` | Next-prayer field, checks, the method label. The one bold spend. |
| `accentInk` | `#F2F1EA` | `#0B100F` | Text **on** accent. Flips with appearance — never hardcode white. |
| `now` | `#A6412B` | `#E07B5F` | The "now" hairline and its time tag. **Nothing else, ever.** |

Two rules that are easy to break and expensive to fix:

- **`now` is not an error colour and not a "missed" colour.** It marks the present moment on the
  timetable. The tracker never renders a missed prayer in warm colour, because the product rule is
  that the tracker reads as consistency and never as debt.
- **The accent flips role between appearances.** On light it is a dark fill carrying pale text; on
  dark it is a light fill carrying near-black. That is why `accentInk` is its own token.

Every pair that actually occurs in the UI is asserted at WCAG AA in `src/theme/parity.test.ts`. A
colour change that drops text below 4.5:1 fails the build.

## Type

### Latin — four sizes, two weights. That is the entire budget.

| Token | Size | Use |
|---|---|---|
| `label` | 11 | Uppercase micro-label, `+0.12em` tracking |
| `body` | 15 | Table rows, paragraphs, buttons |
| `title` | 20 | Screen and section titles |
| `display` | 44 | The one hero figure on a screen. Exactly two exist: the next-prayer time, and the qibla bearing. |

Weights: `400` and `600`. No 500, no 700.

The budget is enforced — `parity.test.ts` fails if a fifth size or a third weight appears. If a screen
seems to need one, the screen is wrong.

`display` is rationed rather than banned: **one figure per screen, and only on a screen that has a
single thing to say.** Home says "the next prayer is at 17:31"; Qibla says "137°". A screen reaching
for a second `display` is a screen that has not decided what it is about.

**The Latin pair:**
- **Newsreader** — display, text, and every figure. Tabular figures on by default so times never
  shift column.
- **Archivo** — uppercase labels at 11px, buttons, tab bar. A serif is weak at that size; this is the
  only place Archivo appears.

### Arabic — its own scale, never the Latin one

At a shared point size Arabic reads optically smaller than Latin, and Quranic text carries full
tashkeel that needs vertical room.

| Token | Size | Font | Line height |
|---|---|---|---|
| `ui` | 15 | Amiri | 1.6 |
| `display` | 21 | Amiri | 1.4 |
| `quran` | 23 | **Amiri Quran** | **2.0** |

**Amiri Quran is for Quranic text only.** Never for UI chrome, never for a prayer name.

### The rendering rules, from the build spec

Non-negotiable, and the reason they exist is that breaking them produces text that is not merely ugly
but *wrong*:

1. **`letterSpacing: 0` on every Arabic label, always.** Positive tracking breaks the joins between
   letters. There is no "just a little". Asserted in `parity.test.ts`.
2. **One `<Text>` per line.** Do not split a line into multiple Text nodes to style part of it —
   shaping happens per node, and the join at the boundary is lost.
3. **Highlights are absolutely-positioned `<View>`s *behind* the text**, never a background on a
   nested Text. Same reason.
4. React Native shapes through CoreText and Minikin, which handle Arabic correctly. The Flutter
   shaping bugs cited in the research do not apply to us — do not import workarounds for them.

## Layout

**8pt grid**, with a single 4pt half-step for optical nudges: `4 · 8 · 12 · 16 · 24 · 32`.

Screen gutter is `16`. Row vertical padding is `12`, which with 15pt text gives a 44pt row — Apple's
minimum touch target, and timetable rows are tappable (tap a prayer to mark it). This started at `8`
and was corrected once the rows became interactive; a 38pt row is a miss-tap. The next-prayer field
breaks the gutter and runs full-bleed, because on a printed timetable the header band does too.

**RTL:** every layout is direction-aware. Use `start`/`end`, never `left`/`right`, and never a
hardcoded `flexDirection: 'row'` where the order carries meaning. The timetable mirrors wholesale in
RTL: Latin name moves to the end, time to the start.

### Radius

`0` for structure — rows, rules, the next-prayer field. They are printed, not floating.
`2` for tracker marks. `8` for buttons, and only buttons.

If you are reaching for a radius, ask whether the thing is genuinely tappable. Usually it is not.

## Motion

The timetable does not move.

The only motion in the system is a **180ms ease-out cross-fade** when a time rolls over — short
enough to read as a print refresh rather than an animation. Under Reduce Motion every duration drops
to `0`.

No skeleton shimmer, no spring, no parallax, no bouncing tab bar. The loader, if one is ever needed,
is a static state, not a spinner.

## Imagery

**No faces, no figures, no depiction of prophets or companions — ever, in any surface, including
share images and App Store screenshots.** Calligraphy, geometry and landscape only. This is a
theological constraint sourced in the research, not a style preference, and it has no exceptions.

The app glyph is two arches (a mihrab profile). It appears as the app icon, the shield icon, and
nowhere else.

## Vertical video

Every screen may end up filmed for TikTok. On a 1080×1920 canvas all text must sit inside
**x 130–950, y 230–1440** — see the safe-zone rules in the global CLAUDE.md. The largest figure on
the home screen is the next-prayer time, which lands around 18% of frame height. Verify with a frame
extract and the drawbox overlay; do not eyeball the full frame.

## Parity: one source, three outputs

```
src/theme/tokens.ts  ──npm run gen:theme──>  targets/widget/Theme.swift
                     └──────────────────────>  modules/rakat-blocking/android/.../values/colors.xml
                                             └  ...values-night/colors.xml
```

The widget, the Shield Configuration extension and the Shield Action extension run in their own
processes and cannot reach the JS bundle, so their colours must be compiled in. Same for the Kotlin
block screen.

`src/theme/parity.test.ts` re-runs the generator in memory and diffs against disk. Drift in either
direction fails, and the message is always `run: npm run gen:theme`. **Never hand-edit a generated
file.** (Pattern lifted from noreeels' `ThemeTokenParityTest.kt`, with the expectation table replaced
by the generator itself so there is no third place to update.)

## Review dependency

Nothing with Arabic on it ships without the Muslim reviewer's sign-off. Every Arabic surface is
tracked in [`REVIEW.md`](REVIEW.md). That is a build dependency, not a later hire.
