import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { appVersion } from './.github/scripts/app-version.mjs'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  define: {
    // Dernier tag v* (VER-09) ; le checkout de CI doit avoir l'historique (fetch-depth: 0).
    __APP_VERSION__: JSON.stringify(appVersion()),
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
