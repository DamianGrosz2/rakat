# Testing Rakat locally

Everything below runs on the iOS simulator except the four things in §6, which
physically cannot.

## 0 · Run it

```bash
cd ~/Development/rakat && LANG=en_US.UTF-8 npx expo run:ios
```

**`LANG=en_US.UTF-8` is not optional.** Without a UTF-8 locale CocoaPods dies with an
`Encoding::CompatibilityError` while *printing* a different error, and the real failure is invisible.

After the first build, JS-only changes just need the app relaunched (Metro stays up). A change to
`app.json`, a new native module, or anything under `targets/` needs:

```bash
LANG=en_US.UTF-8 npx expo prebuild -p ios --clean && LANG=en_US.UTF-8 npx expo run:ios
```

## 1 · The gates

```bash
npx tsc --noEmit && npx expo lint && npm test
```

## 2 · Onboarding

Six screens, and **every one must be skippable**. Delete the app and relaunch to see it again.

- Skip (top right) on any screen leaves the flow permanently — relaunching must NOT show onboarding again.
- Screen 2 is the institution picker. Every row prints its actual angles. This is the screen the app exists for.
- Screen 4 asks for location. Set a coordinate first so the simulator has one to give:
  ```bash
  xcrun simctl location booted set 52.520008,13.404954
  ```
  It should resolve to "Berlin" on-device. Denying is a valid path, not an error.
- Screen 5 turns on the athan. Denying notification permission must leave the toggle OFF.

## 3 · Prayer core

- Home shows the method and madhab top-left. It must never change on its own.
- The `now` hairline sits *between* the two rows the current time falls between.
- Change the method in Settings → every time on Home changes, the widget changes, and the athan queue is rewritten.
- Change the madhab to Hanafi → Asr moves later. That is the whole point of the toggle.
- Travel: change the simulator location and reopen the app; times follow.

**Athan.** Notifications fire on a real clock, so to see one without waiting:
```bash
xcrun simctl status_bar booted override --time "13:07"   # cosmetic only
```
The honest test is to set the device clock forward in Settings → General → Date & Time, or simply
check the queue is populated:
```bash
xcrun simctl spawn booted log stream --predicate 'subsystem == "com.apple.UserNotifications"' | head -20
```
Settings → Athan → **Hear it** plays the full recording immediately — use that to judge the sound.

## 4 · Widgets

Long-press the home screen → Edit → Add widget → search "Rakat". Four previews: next prayer small,
next prayer medium, Lock Screen rectangular, daily ayah.

- The widget reads the App Group, so it only has data **after the app has been opened once**.
- It carries seven days of prayer times, so it stays correct without the app being opened again.
- Lock Screen widgets render monochrome over the wallpaper — that is iOS, not a bug.

## 5 · Tracker, menses, qada, reader, qibla

- Tap a prayer to mark it. Marking inside the prayer's own window counts as **on time**; after the
  next prayer has begun it counts as **late**. Nothing anywhere counts down or says "missed".
- Menses mode: the days it covers are skipped by the tracker, write no lock schedules, and are never
  owed as qada'.
- Qibla: on the simulator there is no magnetometer, so it shows a **static** bearing and says so.
  A dial that silently never moves would be worse than no dial.
- Reader: the Arabic must join correctly and no tashkeel may be clipped. Check at the largest
  Dynamic Type setting.

## 6 · What the simulator cannot test

| | Why |
|---|---|
| The app lock (shield) | FamilyControls / DeviceActivity / ManagedSettings are device-only. Also needs Apple's Family Controls entitlement. |
| Live qibla heading | No magnetometer in the simulator. |
| The real 64-notification cap | The simulator does not enforce it the same way. |
| Haptics | Not simulated. |

`HANDOFF.md` §5 lists exactly what to check on hardware, including the one genuinely risky unknown:
whether `openApp` works from a ManagedSettingsUI shield, which the whole "I prayed" flow depends on.

## 7 · Appearance

Both appearances are designed, not inverted. Check both:

```bash
xcrun simctl ui booted appearance dark
xcrun simctl ui booted appearance light
```

Every colour comes from `src/theme/tokens.ts`; `npm test` asserts WCAG AA on every pair that occurs
in the UI, so a contrast regression fails the build rather than shipping.

## 8 · Resetting

```bash
xcrun simctl uninstall booted com.dadama.rakat     # wipes settings, tracker, onboarding
```
