import { describe, expect, it, vi } from 'vitest'
import { initUpdatePrompt } from './updatePrompt'

function setup() {
  const applyUpdate = vi.fn(async () => {})
  let onNeedRefresh: () => void = () => {}
  const register = vi.fn((options: { onNeedRefresh: () => void }) => {
    onNeedRefresh = options.onNeedRefresh
    return applyUpdate
  })
  const showBanner = vi.fn()
  initUpdatePrompt({ register, showBanner })
  return { applyUpdate, register, showBanner, needRefresh: () => onNeedRefresh() }
}

describe('initUpdatePrompt', () => {
  it('enregistre le service worker une seule fois', () => {
    const { register } = setup()
    expect(register).toHaveBeenCalledTimes(1)
  })

  it("n'affiche rien tant qu'aucune nouvelle version n'est prête", () => {
    const { showBanner } = setup()
    expect(showBanner).not.toHaveBeenCalled()
  })

  it('annonce la nouvelle version sans recharger la page', () => {
    const { showBanner, applyUpdate, needRefresh } = setup()
    needRefresh()
    expect(showBanner).toHaveBeenCalledTimes(1)
    expect(applyUpdate).not.toHaveBeenCalled()
  })

  it("applique la mise à jour et recharge quand l'utilisateur accepte", () => {
    const { showBanner, applyUpdate, needRefresh } = setup()
    needRefresh()
    const onReload = showBanner.mock.calls[0][0] as () => void
    onReload()
    expect(applyUpdate).toHaveBeenCalledTimes(1)
    expect(applyUpdate).toHaveBeenCalledWith(true)
  })
})
