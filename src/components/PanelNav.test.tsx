import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PanelNav } from './PanelNav'

describe('PanelNav', () => {
  it('affiche un lien vers chacune des 2 autres modales', () => {
    render(<PanelNav current="personnalisation" onNavigate={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Valeur & réglages' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Actions' })).toBeInTheDocument()
  })

  it("n'affiche pas de lien vers la modale actuelle", () => {
    render(<PanelNav current="personnalisation" onNavigate={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Personnalisation' })).not.toBeInTheDocument()
  })

  it('affiche les 2 autres liens quand la modale actuelle est "comportement"', () => {
    render(<PanelNav current="comportement" onNavigate={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Personnalisation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Actions' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Valeur & réglages' })).not.toBeInTheDocument()
  })

  it('affiche les 2 autres liens quand la modale actuelle est "actions"', () => {
    render(<PanelNav current="actions" onNavigate={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Personnalisation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Valeur & réglages' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument()
  })

  it('sépare les deux liens par un seul séparateur, placé avant le second', () => {
    const { container } = render(<PanelNav current="personnalisation" onNavigate={vi.fn()} />)
    const items = container.querySelectorAll('.panel-nav-item')
    expect(items).toHaveLength(2)
    expect(items[0].querySelector('.panel-nav-sep')).toBeNull()
    expect(items[1].querySelector('.panel-nav-sep')).not.toBeNull()
    expect(container.querySelectorAll('.panel-nav-sep')).toHaveLength(1)
  })

  it('appelle onNavigate avec la bonne cible au clic', () => {
    const onNavigate = vi.fn()
    render(<PanelNav current="personnalisation" onNavigate={onNavigate} />)
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }))
    expect(onNavigate).toHaveBeenCalledWith('actions')
  })
})
