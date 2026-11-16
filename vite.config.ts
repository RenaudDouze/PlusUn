import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Identifie précisément le code déployé (utile pour confirmer qu'un
// déploiement a bien pris effet, ou pour référencer une version exacte dans
// un rapport de bug). Un hash de commit ne demande aucune discipline de mise
// à jour manuelle, contrairement à un numéro de version dans package.json.
function getBuildVersion(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'dev'
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(getBuildVersion()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'PlusUn',
        short_name: 'PlusUn',
        description: 'Compteurs locaux avec incrément/décrément',
        theme_color: '#f8fafc',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // Accès rapides via un appui long sur l'icône de l'app installée.
        // Lus par App.tsx au chargement via le paramètre ?action=.
        shortcuts: [
          {
            name: 'Nouveau compteur',
            short_name: 'Nouveau',
            url: './?action=new',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Synchroniser',
            short_name: 'Synchroniser',
            url: './?action=sync',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
})
