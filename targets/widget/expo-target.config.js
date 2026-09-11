/** @type {import('@kingstinct/expo-apple-targets/build/config').Config} */
module.exports = {
  type: 'widget',
  name: 'RakatWidget',
  displayName: 'Rakat',
  // Colours come from Theme.swift, which `npm run gen:theme` writes into this
  // folder from src/theme/tokens.ts. Do not add a `colors` block here — it would
  // be a second source of truth and the parity test could not see it.
  frameworks: ['SwiftUI', 'WidgetKit'],
  // 17.0 because `containerBackground(_:for:)` is the iOS 17 API and is what
  // makes a widget render correctly in every modern context. The APP still
  // targets the RN minimum; only this extension needs 17.
  deploymentTarget: '17.0',
  // The widget reads the same App Group the app writes its timeline into.
  // Without this it gets no entitlements at all and always shows the placeholder.
  //
  // It must carry the app group and NOTHING ELSE. In particular it must NEVER
  // carry com.apple.developer.family-controls: a widget is not a Screen Time
  // extension, and Apple's automated review rejects an archive where a
  // non-Screen-Time extension claims it. noreeels' tools/verify/archive-entitlements.sh
  // exists precisely to catch this and is worth porting (see HANDOFF.md).
  entitlements: {
    'com.apple.security.application-groups': ['group.com.dadama.rakat'],
  },
};
