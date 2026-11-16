import { useEffect, useState, useSyncExternalStore } from 'react'
import { initUpdatePrompt, type UpdatePromptDeps } from '../updatePrompt'

function subscribeToConnectivity(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

const isOnline = () => navigator.onLine

interface Props {
  register: UpdatePromptDeps['register']
}

/** Bandeaux PWA : « nouvelle version disponible » (rechargement sur demande) et « hors ligne ». */
export function PwaBanners({ register }: Props) {
  const [reload, setReload] = useState<(() => void) | null>(null)
  const online = useSyncExternalStore(subscribeToConnectivity, isOnline)

  useEffect(() => {
    initUpdatePrompt({ register, showBanner: (onReload) => setReload(() => onReload) })
  }, [register])

  return (
    <>
      {!online && (
        <div id="offline-banner" className="pwa-banner" role="status">
          <span>Hors ligne : l'application reste utilisable, la synchronisation reprendra au retour du réseau.</span>
        </div>
      )}
      {reload && (
        <div id="update-banner" className="pwa-banner" role="status">
          <span>Une nouvelle version est disponible.</span>
          <button id="update-reload" type="button" onClick={() => reload()}>
            Recharger
          </button>
          <button id="update-later" type="button" onClick={() => setReload(null)}>
            Plus tard
          </button>
        </div>
      )}
    </>
  )
}
