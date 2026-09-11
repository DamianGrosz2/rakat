# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Rakat

Prayer times and a free, correct mushaf. Prayer core is the product; the Salah Lock ships behind a
feature flag. Build spec: `~/agent/companies-context/dadama/product/drafts/2026-09-10-quran-app-v1-build-spec.md`.

## Design system — read before building any screen

**@DESIGN.md** is frozen and binding. Every screen inherits it. The source of truth for values is
`src/theme/tokens.ts`; DESIGN.md is the reasoning.

Read it before writing UI. The rules most often broken, and what breaks:

- **Four Latin sizes, two weights.** Enforced by `src/theme/parity.test.ts`. If a screen needs a
  fifth, the screen is wrong.
- **`letterSpacing: 0` on every Arabic label.** Positive tracking breaks the joins between letters
  and turns shaped Arabic into nonsense. No exceptions.
- **One `<Text>` per line of Arabic.** Highlights are absolutely-positioned `<View>`s behind the
  text, never a background on a nested Text. Shaping happens per node.
- **Amiri Quran is for Quranic text only**, never UI chrome.
- **No faces, figures, or depiction of prophets** — anywhere, including share images and store
  screenshots. Calligraphy, geometry, landscape only.
- **`now` (the warm hue) marks the present moment and nothing else.** Never a missed prayer, never
  an error. The tracker reads as consistency, never as debt — it counts up.
- **RTL:** `start`/`end`, never `left`/`right`.

## Native colours are generated, never hand-written

```
npm run gen:theme
```

Regenerates `targets/widget/Theme.swift` and the Kotlin `colors.xml` pair from `src/theme/tokens.ts`.
`npm test` fails on drift in either direction. Never hand-edit a generated file.

## Architecture rules (from the spec, non-negotiable)

- **Every calculation on-device.** Location is read once and stored locally. No analytics SDK that
  can see coordinates.
- **Prayer calculation lives in TypeScript** so a wrong institution parameter is patchable the same
  hour via EAS Update, inside Apple guideline 2.5.2. `src/prayer/` imports no React, no React
  Native, no Expo — it must run under plain vitest in node.
- **Settings survive updates.** An update must never silently change the user's calculation method.
- **Offline-first.** No network on the critical path.
- `runtimeVersion.policy` is `fingerprint`: a native change invalidates the OTA bundle, because OTA
  cannot touch the native quarter.

## Review dependency

Nothing with Arabic on it ships without the Muslim reviewer's sign-off. Track every Arabic surface
in `REVIEW.md`.
