import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Ne dépend pas des tags git (voir vite.config.ts) : les tests
  // n'ont besoin que d'une valeur stable pour la variable globale.
  define: {
    __APP_VERSION__: JSON.stringify('test'),
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    exclude: ['node_modules/**', 'e2e/**', 'dist/**', 'worker/**'],
    // Le défaut (5000ms) est parfois trop court sous couverture v8 (surcoût
    // d'instrumentation) pour les tests les plus longs (ex: App.test.tsx,
    // qui enchaîne de nombreuses interactions sur plusieurs compteurs) —
    // seul en CI, où le runner est aussi plus chargé. Timeout généreux plutôt
    // que de relancer le job à la main à chaque fois qu'il expire de peu.
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/test/**',
        'src/**/*.d.ts',
      ],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
})
