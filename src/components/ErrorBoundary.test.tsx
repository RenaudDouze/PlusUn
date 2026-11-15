import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

function Boom(): never {
  throw new Error('boom')
}

describe('ErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let reloadSpy: ReturnType<typeof vi.fn>
  let originalLocation: Location

  beforeEach(() => {
    // React logue lui-même l'erreur rattrapée en plus de notre
    // componentDidCatch : sans ce silencieux, chaque test ici polluerait la
    // sortie de test avec la trace complète.
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    reloadSpy = vi.fn()
    originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadSpy },
    })
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  })

  it("rend normalement ses enfants tant qu'aucune erreur ne survient", () => {
    render(
      <ErrorBoundary fallback={() => <p>Secours</p>}>
        <p>Contenu normal</p>
      </ErrorBoundary>
    )
    expect(screen.getByText('Contenu normal')).toBeInTheDocument()
    expect(screen.queryByText('Secours')).not.toBeInTheDocument()
  })

  it('rend le secours au lieu de démonter toute la page quand un enfant lève une exception au rendu', () => {
    render(
      <ErrorBoundary fallback={() => <p>Secours</p>}>
        <Boom />
      </ErrorBoundary>
    )
    expect(screen.getByText('Secours')).toBeInTheDocument()
  })

  it("journalise l'erreur rattrapée", () => {
    render(
      <ErrorBoundary fallback={() => <p>Secours</p>}>
        <Boom />
      </ErrorBoundary>
    )
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Erreur rattrapée par ErrorBoundary :',
      expect.objectContaining({ message: 'boom' }),
      expect.anything()
    )
  })

  it('le `retry` passé au secours recharge la page', () => {
    render(
      <ErrorBoundary fallback={(retry) => <button onClick={retry}>Recharger</button>}>
        <Boom />
      </ErrorBoundary>
    )
    screen.getByRole('button', { name: 'Recharger' }).click()
    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })
})
