// Mise à jour annoncée, jamais silencieuse (registerType 'prompt') : quand le
// service worker a une nouvelle version prête, on l'annonce ; la page ne se
// recharge que si l'utilisateur le demande, pour ne pas perdre une saisie.
export type ApplyUpdate = (reloadPage?: boolean) => Promise<void>

export interface UpdatePromptDeps {
  register: (options: { onNeedRefresh: () => void }) => ApplyUpdate
  showBanner: (onReload: () => void) => void
}

export function initUpdatePrompt({ register, showBanner }: UpdatePromptDeps): void {
  const applyUpdate = register({
    onNeedRefresh: () =>
      showBanner(() => {
        void applyUpdate(true)
      }),
  })
}
