import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import './index.css'
import App from './App.tsx'
import { PwaBanners } from './components/PwaBanners.tsx'
import { registerSW } from 'virtual:pwa-register'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

// Style en dur (pas de classes de App.css) : ce filet doit rester lisible
// même si la panne qui l'a déclenché a empêché le reste de l'app — styles
// compris — de charger correctement.
const fallbackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '16px',
  minHeight: '100dvh',
  padding: '24px',
  textAlign: 'center',
  fontFamily: 'system-ui, sans-serif',
  color: '#0f172a',
  background: '#f8fafc',
}

const fallbackButtonStyle: React.CSSProperties = {
  padding: '10px 18px',
  borderRadius: '999px',
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#0f172a',
  fontSize: '0.95rem',
  fontWeight: 600,
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Filet de dernier recours : une exception non rattrapée n'importe où
        dans l'app (au-delà des cas déjà couverts par un ErrorBoundary plus
        ciblé, ex : SyncPanel dans App.tsx) démonterait sinon tout jusqu'ici,
        laissant une page blanche sans aucune indication — voir
        ErrorBoundary.tsx pour le déclencheur le plus probable (chunk JS
        disparu après un déploiement). */}
    <ErrorBoundary
      fallback={(retry) => (
        <div style={fallbackStyle}>
          <p>Une erreur est survenue. Recharge la page pour continuer.</p>
          <button style={fallbackButtonStyle} onClick={retry}>
            Recharger la page
          </button>
        </div>
      )}
    >
      {/* Désactive automatiquement les animations basées sur des transforms
          (framer-motion) pour les utilisateurs ayant activé la préférence
          système "mouvement réduit" (odomètre, rebond au clic, glisser...). */}
      <MotionConfig reducedMotion="user">
        <App />
        <PwaBanners register={registerSW} />
      </MotionConfig>
    </ErrorBoundary>
  </StrictMode>,
)
