import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * The `@/` alias, mirroring tsconfig.json's `paths`. Without it a pure module
 * that imports `@/prayer/labels` typechecks but cannot be unit-tested, which
 * quietly pushes logic out of the tested layer.
 *
 * Only pure modules run here — anything importing React Native would need a
 * different environment. Keep `src/prayer`, `src/lock`, `src/notify`,
 * `src/widgets` and `src/theme` free of RN imports and this stays true.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
