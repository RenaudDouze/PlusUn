import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CounterSettingsPanel } from './CounterSettingsPanel'
import type { Counter, CounterAppearance } from '../types'

const TEST_COLORS = ['#2563eb', '#7c3aed', '#0d9488']

type CounterOverrides = Partial<Omit<Counter, 'appearance'>> & Partial<CounterAppearance>

function makeCounter(overrides: CounterOverrides = {}): Counter {
  const { color, displayStyle, backgroundImageUrl, ...rest } = overrides
  return {
    id: 'counter-1',
    name: 'Compteur 1',
    count: 0,
    createdAt: new Date(2026, 7, 1).getTime(),
    behavior: {},
    ...rest,
    appearance: { color: color ?? '#2563eb', displayStyle, backgroundImageUrl },
  }
}

function renderPanel(
  counterOverrides: CounterOverrides = {},
  props: Partial<Parameters<typeof CounterSettingsPanel>[0]> = {}
) {
  const counter = makeCounter(counterOverrides)
  const handlers = {
    colors: TEST_COLORS,
    onClose: vi.fn(),
    onUpdate: vi.fn(),
    onNavigate: vi.fn(),
    ...props,
  }
  const utils = render(<CounterSettingsPanel counter={counter} {...handlers} {...props} />)
  return { counter, ...handlers, ...utils }
}

describe('CounterSettingsPanel', () => {
  it('affiche le nom du compteur dans le titre', () => {
    renderPanel({ name: 'Mon compteur' })
    expect(screen.getByText('Personnaliser « Mon compteur »')).toBeInTheDocument()
  })

  it('ferme au clic sur la croix', () => {
    const { onClose } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('associe un nom accessible aux champs Nom et Image de fond (aria-labelledby)', () => {
    renderPanel()
    expect(screen.getByLabelText('Nom')).toBeInTheDocument()
    expect(screen.getByLabelText('Image de fond')).toBeInTheDocument()
  })

  it('navigue vers le panneau "Valeur & réglages" au clic sur le lien dédié', () => {
    const { onNavigate } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Valeur & réglages' }))
    expect(onNavigate).toHaveBeenCalledWith('comportement')
  })

  it('navigue vers le panneau "Actions" au clic sur le lien dédié', () => {
    const { onNavigate } = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }))
    expect(onNavigate).toHaveBeenCalledWith('actions')
  })

  describe('nom', () => {
    it('affiche le nom actuel dans le champ', () => {
      renderPanel({ name: 'Mon compteur' })
      expect(screen.getByDisplayValue('Mon compteur')).toBeInTheDocument()
    })

    it('renomme au blur', () => {
      const { onUpdate } = renderPanel({ name: 'Ancien' })
      const input = screen.getByDisplayValue('Ancien')
      fireEvent.change(input, { target: { value: 'Nouveau' } })
      fireEvent.blur(input)
      expect(onUpdate).toHaveBeenCalledWith({ name: 'Nouveau' })
    })

    it('renomme sur Entrée', () => {
      const { onUpdate } = renderPanel({ name: 'Ancien' })
      const input = screen.getByDisplayValue('Ancien')
      fireEvent.change(input, { target: { value: 'Nouveau' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onUpdate).toHaveBeenCalledWith({ name: 'Nouveau' })
    })

    it('ignore une autre touche que Entrée', () => {
      const { onUpdate } = renderPanel({ name: 'Ancien' })
      const input = screen.getByDisplayValue('Ancien')
      fireEvent.change(input, { target: { value: 'Nouveau' } })
      fireEvent.keyDown(input, { key: 'a' })
      expect(onUpdate).not.toHaveBeenCalled()
    })

    it('remplace un nom vide (ou uniquement des espaces) par "Sans nom"', () => {
      const { onUpdate } = renderPanel({ name: 'Ancien' })
      const input = screen.getByDisplayValue('Ancien')
      fireEvent.change(input, { target: { value: '   ' } })
      fireEvent.blur(input)
      expect(onUpdate).toHaveBeenCalledWith({ name: 'Sans nom' })
      expect(screen.getByDisplayValue('Sans nom')).toBeInTheDocument()
    })
  })

  describe('couleur', () => {
    it('affiche une option par couleur de la palette', () => {
      renderPanel()
      TEST_COLORS.forEach((c) => {
        expect(screen.getByRole('button', { name: `Choisir la couleur ${c}` })).toBeInTheDocument()
      })
    })

    it('marque la couleur actuellement sélectionnée', () => {
      renderPanel({ color: TEST_COLORS[1] })
      const selected = screen.getByRole('button', { name: `Choisir la couleur ${TEST_COLORS[1]}` })
      expect(selected.className).toContain('selected')
      const other = screen.getByRole('button', { name: `Choisir la couleur ${TEST_COLORS[0]}` })
      expect(other.className).not.toContain('selected')
    })

    it('choisit une couleur de la palette', () => {
      const { onUpdate } = renderPanel({ color: TEST_COLORS[0] })
      fireEvent.click(screen.getByRole('button', { name: `Choisir la couleur ${TEST_COLORS[1]}` }))
      expect(onUpdate).toHaveBeenCalledWith({ appearance: expect.objectContaining({ color: TEST_COLORS[1] }) })
    })

    it('reste ouvert après avoir choisi une couleur', () => {
      const { onClose } = renderPanel()
      fireEvent.click(screen.getByRole('button', { name: `Choisir la couleur ${TEST_COLORS[1]}` }))
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  describe("style d'affichage", () => {
    it('affiche une option par style disponible', () => {
      renderPanel()
      ;['Odomètre', 'Volets', '7 segments', 'Anneau', 'Éditorial', 'Pastille'].forEach((label) => {
        expect(screen.getByRole('button', { name: `Choisir le style ${label}` })).toBeInTheDocument()
      })
    })

    it("marque 'Odomètre' comme sélectionné quand aucun style n'est défini", () => {
      renderPanel()
      expect(screen.getByRole('button', { name: 'Choisir le style Odomètre' }).className).toContain('selected')
      expect(screen.getByRole('button', { name: 'Choisir le style Volets' }).className).not.toContain('selected')
    })

    it('marque le style actuellement sélectionné', () => {
      renderPanel({ displayStyle: 'flap' })
      expect(screen.getByRole('button', { name: 'Choisir le style Volets' }).className).toContain('selected')
      expect(screen.getByRole('button', { name: 'Choisir le style Odomètre' }).className).not.toContain('selected')
    })

    it('choisit un style personnalisé', () => {
      const { onUpdate } = renderPanel()
      fireEvent.click(screen.getByRole('button', { name: 'Choisir le style 7 segments' }))
      expect(onUpdate).toHaveBeenCalledWith({ appearance: expect.objectContaining({ displayStyle: 'segment7' }) })
    })

    it("repasse à 'undefined' (style par défaut) en choisissant Odomètre", () => {
      const { onUpdate } = renderPanel({ displayStyle: 'badge' })
      fireEvent.click(screen.getByRole('button', { name: 'Choisir le style Odomètre' }))
      expect(onUpdate).toHaveBeenCalledWith({ appearance: expect.objectContaining({ displayStyle: undefined }) })
    })

    it('reste ouvert après avoir choisi un style', () => {
      const { onClose } = renderPanel()
      fireEvent.click(screen.getByRole('button', { name: 'Choisir le style Anneau' }))
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  describe('image de fond', () => {
    it('préremplit le champ avec l\'URL actuelle', () => {
      renderPanel({ backgroundImageUrl: 'https://exemple.com/actuel.jpg' })
      expect(screen.getByDisplayValue('https://exemple.com/actuel.jpg')).toBeInTheDocument()
    })

    it('champ vide sans image définie', () => {
      renderPanel()
      const input = screen.getByPlaceholderText('https://exemple.com/image.jpg') as HTMLInputElement
      expect(input.value).toBe('')
    })

    it('définit une image de fond avec une URL http(s) valide (Entrée)', () => {
      const { onUpdate } = renderPanel()
      const input = screen.getByPlaceholderText('https://exemple.com/image.jpg')
      fireEvent.change(input, { target: { value: 'https://exemple.com/photo.png' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onUpdate).toHaveBeenCalledWith({
        appearance: expect.objectContaining({ backgroundImageUrl: 'https://exemple.com/photo.png' }),
      })
    })

    it('valide aussi au blur', () => {
      const { onUpdate } = renderPanel()
      const input = screen.getByPlaceholderText('https://exemple.com/image.jpg')
      fireEvent.change(input, { target: { value: 'https://exemple.com/blur.jpg' } })
      fireEvent.blur(input)
      expect(onUpdate).toHaveBeenCalledWith({
        appearance: expect.objectContaining({ backgroundImageUrl: 'https://exemple.com/blur.jpg' }),
      })
    })

    it('ignore une URL invalide, affiche une erreur et garde la saisie affichée', () => {
      const { onUpdate } = renderPanel({ backgroundImageUrl: 'https://exemple.com/ancien.jpg' })
      const input = screen.getByDisplayValue('https://exemple.com/ancien.jpg')
      fireEvent.change(input, { target: { value: 'pas-une-url' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onUpdate).not.toHaveBeenCalled()
      expect(screen.getByText('URL http(s) invalide.')).toBeInTheDocument()
      expect(screen.getByDisplayValue('pas-une-url')).toBeInTheDocument()
    })

    it("garde l'erreur d'URL affichée si le champ reperd le focus sans être corrigé", () => {
      renderPanel({ backgroundImageUrl: 'https://exemple.com/ancien.jpg' })
      const input = screen.getByDisplayValue('https://exemple.com/ancien.jpg')
      fireEvent.change(input, { target: { value: 'pas-une-url' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(screen.getByText('URL http(s) invalide.')).toBeInTheDocument()
      fireEvent.blur(input)
      expect(screen.getByText('URL http(s) invalide.')).toBeInTheDocument()
    })

    it('efface l\'image de fond si la saisie est vidée', () => {
      const { onUpdate } = renderPanel({ backgroundImageUrl: 'https://exemple.com/ancien.jpg' })
      const input = screen.getByDisplayValue('https://exemple.com/ancien.jpg')
      fireEvent.change(input, { target: { value: '' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onUpdate).toHaveBeenCalledWith({ appearance: expect.objectContaining({ backgroundImageUrl: undefined }) })
    })

    it("ignore une URL invalide en repartant d'aucune image définie", () => {
      const { onUpdate } = renderPanel()
      const input = screen.getByPlaceholderText('https://exemple.com/image.jpg')
      fireEvent.change(input, { target: { value: 'pas-une-url' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onUpdate).not.toHaveBeenCalled()
      expect((input as HTMLInputElement).value).toBe('pas-une-url')
    })

    it("ne commite pas sur une touche autre qu'Entrée", () => {
      const { onUpdate } = renderPanel()
      const input = screen.getByPlaceholderText('https://exemple.com/image.jpg')
      fireEvent.change(input, { target: { value: 'https://exemple.com/photo.png' } })
      fireEvent.keyDown(input, { key: 'a' })
      expect(onUpdate).not.toHaveBeenCalled()
    })

    it("n'affiche pas de bouton pour vider le champ quand il est vide", () => {
      renderPanel()
      expect(screen.queryByRole('button', { name: "Vider l'image de fond" })).not.toBeInTheDocument()
    })

    it('affiche un bouton pour vider le champ quand une image est définie', () => {
      renderPanel({ backgroundImageUrl: 'https://exemple.com/actuel.jpg' })
      expect(screen.getByRole('button', { name: "Vider l'image de fond" })).toBeInTheDocument()
    })

    it('vide le champ et efface l\'image de fond au clic sur le bouton', () => {
      const { onUpdate } = renderPanel({ backgroundImageUrl: 'https://exemple.com/actuel.jpg' })
      fireEvent.click(screen.getByRole('button', { name: "Vider l'image de fond" }))
      expect(onUpdate).toHaveBeenCalledWith({ appearance: expect.objectContaining({ backgroundImageUrl: undefined }) })
      expect((screen.getByPlaceholderText('https://exemple.com/image.jpg') as HTMLInputElement).value).toBe('')
    })

    it('fait disparaître le bouton une fois le champ vidé', () => {
      renderPanel({ backgroundImageUrl: 'https://exemple.com/actuel.jpg' })
      fireEvent.click(screen.getByRole('button', { name: "Vider l'image de fond" }))
      expect(screen.queryByRole('button', { name: "Vider l'image de fond" })).not.toBeInTheDocument()
    })
  })

  describe('compteur archivé (lecture seule)', () => {
    it('affiche un bandeau signalant la lecture seule', () => {
      renderPanel({ archived: true })
      expect(screen.getByText(/Compteur archivé : lecture seule/)).toBeInTheDocument()
    })

    it("n'affiche pas le bandeau pour un compteur actif", () => {
      renderPanel({ archived: false })
      expect(screen.queryByText(/Compteur archivé : lecture seule/)).not.toBeInTheDocument()
    })

    it('désactive le champ de nom', () => {
      renderPanel({ archived: true, name: 'Figé' })
      expect(screen.getByDisplayValue('Figé')).toBeDisabled()
    })

    it('désactive les options de couleur', () => {
      renderPanel({ archived: true, color: TEST_COLORS[0] })
      expect(screen.getByRole('button', { name: `Choisir la couleur ${TEST_COLORS[1]}` })).toBeDisabled()
    })

    it('désactive les options de style', () => {
      renderPanel({ archived: true })
      expect(screen.getByRole('button', { name: 'Choisir le style Volets' })).toBeDisabled()
    })

    it("désactive le champ d'image de fond et le bouton pour le vider", () => {
      renderPanel({ archived: true, backgroundImageUrl: 'https://exemple.com/actuel.jpg' })
      expect(screen.getByDisplayValue('https://exemple.com/actuel.jpg')).toBeDisabled()
      expect(screen.getByRole('button', { name: "Vider l'image de fond" })).toBeDisabled()
    })

    it('ignore un clic sur une couleur désactivée', () => {
      const { onUpdate } = renderPanel({ archived: true, color: TEST_COLORS[0] })
      fireEvent.click(screen.getByRole('button', { name: `Choisir la couleur ${TEST_COLORS[1]}` }))
      expect(onUpdate).not.toHaveBeenCalled()
    })
  })

  describe('états visuels et accessibles', () => {
    it('couleur : exprime la sélection par classe, aria-pressed, titre et fond', () => {
      renderPanel({ color: TEST_COLORS[1] })
      const selected = screen.getByRole('button', { name: `Choisir la couleur ${TEST_COLORS[1]}` })
      const other = screen.getByRole('button', { name: `Choisir la couleur ${TEST_COLORS[0]}` })
      expect(selected).toHaveClass('counter-color-option', 'selected')
      expect(selected).toHaveAttribute('aria-pressed', 'true')
      expect(other.className).toBe('counter-color-option')
      expect(other).toHaveAttribute('aria-pressed', 'false')
      expect(other).toHaveAttribute('aria-label', `Choisir la couleur ${TEST_COLORS[0]}`)
      expect(other).toHaveAttribute('title', `Choisir la couleur ${TEST_COLORS[0]}`)
      expect(other.style.background).toBe('rgb(37, 99, 235)')
    })

    it('style : exprime la sélection par classe et aria-pressed', () => {
      renderPanel({ displayStyle: 'flap' })
      const selected = screen.getByRole('button', { name: 'Choisir le style Volets' })
      const other = screen.getByRole('button', { name: 'Choisir le style Odomètre' })
      expect(selected).toHaveClass('display-style-option', 'selected')
      expect(selected).toHaveAttribute('aria-pressed', 'true')
      expect(other.className).toBe('display-style-option')
      expect(other).toHaveAttribute('aria-pressed', 'false')
    })

    it("style : l'aperçu de l'anneau montre une progression", () => {
      renderPanel()
      expect(within(screen.getByRole('button', { name: 'Choisir le style Anneau' })).getByText('60 %')).toBeInTheDocument()
    })

    it("image de fond : aria-invalid et message d'erreur suivent l'état de validation", () => {
      renderPanel()
      const input = screen.getByPlaceholderText('https://exemple.com/image.jpg')
      expect(input).toHaveAttribute('aria-invalid', 'false')
      expect(document.querySelector('.modal-error')).not.toBeInTheDocument()
      fireEvent.change(input, { target: { value: 'pas-une-url' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(document.querySelector('.modal-error')).toHaveTextContent('URL http(s) invalide.')
    })

    it("image de fond : l'erreur disparaît dès que la saisie change", () => {
      renderPanel()
      const input = screen.getByPlaceholderText('https://exemple.com/image.jpg')
      fireEvent.change(input, { target: { value: 'pas-une-url' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      fireEvent.change(input, { target: { value: 'pas-une-url-2' } })
      expect(screen.queryByText('URL http(s) invalide.')).not.toBeInTheDocument()
      expect(input).toHaveAttribute('aria-invalid', 'false')
    })

    it("image de fond : le bouton « Vider » efface aussi l'erreur affichée", () => {
      renderPanel()
      const input = screen.getByPlaceholderText('https://exemple.com/image.jpg')
      fireEvent.change(input, { target: { value: 'pas-une-url' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      fireEvent.click(screen.getByRole('button', { name: "Vider l'image de fond" }))
      expect(screen.queryByText('URL http(s) invalide.')).not.toBeInTheDocument()
    })

    it("image de fond : ignore les espaces autour de l'URL", () => {
      const { onUpdate } = renderPanel()
      const input = screen.getByPlaceholderText('https://exemple.com/image.jpg')
      fireEvent.change(input, { target: { value: '  https://exemple.com/photo.png  ' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onUpdate).toHaveBeenCalledWith({
        appearance: expect.objectContaining({ backgroundImageUrl: 'https://exemple.com/photo.png' }),
      })
    })

    it("image de fond : une saisie d'espaces seuls vaut champ vide", () => {
      const { onUpdate } = renderPanel({ backgroundImageUrl: 'https://exemple.com/ancien.jpg' })
      const input = screen.getByDisplayValue('https://exemple.com/ancien.jpg')
      fireEvent.change(input, { target: { value: '   ' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onUpdate).toHaveBeenCalledWith({ appearance: expect.objectContaining({ backgroundImageUrl: undefined }) })
      expect(screen.queryByText('URL http(s) invalide.')).not.toBeInTheDocument()
    })
  })
})
