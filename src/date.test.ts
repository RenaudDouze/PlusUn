import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  daysBetween,
  daysSince,
  formatAveragePerDay,
  formatDuration,
  formatStartDate,
  isValidIsoDate,
  toIsoDate,
  todayIsoDate,
} from './date'

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
const compactDateFormatter = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' })

describe('isValidIsoDate', () => {
  it('accepte une date réelle au format YYYY-MM-DD', () => {
    expect(isValidIsoDate('2026-08-22')).toBe(true)
  })

  it("refuse une chaîne qui n'a pas la forme YYYY-MM-DD", () => {
    expect(isValidIsoDate('22/08/2026')).toBe(false)
  })

  it('refuse une chaîne vide', () => {
    expect(isValidIsoDate('')).toBe(false)
  })

  it("refuse une date qui a la bonne forme mais ne correspond à aucun jour réel (ex: payload corrompu reçu via la synchro)", () => {
    expect(isValidIsoDate('9999-99-99')).toBe(false)
  })

  it("refuse le 30 février (jour hors bornes pour ce mois, que `new Date` reporterait silencieusement en mars)", () => {
    expect(isValidIsoDate('2024-02-30')).toBe(false)
  })

  it('refuse un texte quelconque de 10 caractères', () => {
    expect(isValidIsoDate('n-importe!')).toBe(false)
  })

  it('refuse une date précédée de caractères parasites', () => {
    expect(isValidIsoDate('x2026-08-22')).toBe(false)
  })

  it('refuse une date suivie de caractères parasites', () => {
    expect(isValidIsoDate('2026-08-22x')).toBe(false)
  })
})

describe('toIsoDate', () => {
  it('formate une date avec mois et jour à deux chiffres', () => {
    const d = new Date(2026, 0, 5) // 5 janvier 2026
    expect(toIsoDate(d.getTime())).toBe('2026-01-05')
  })

  it('formate une date avec mois et jour déjà à deux chiffres', () => {
    const d = new Date(2026, 11, 25) // 25 décembre 2026
    expect(toIsoDate(d.getTime())).toBe('2026-12-25')
  })
})

describe('todayIsoDate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("retourne la date du jour au format ISO", () => {
    vi.setSystemTime(new Date(2026, 7, 22, 15, 44))
    expect(todayIsoDate()).toBe('2026-08-22')
  })
})

describe('daysSince', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 22, 15, 44)) // 22 août 2026, 15h44
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retourne 0 pour aujourd\'hui', () => {
    expect(daysSince('2026-08-22')).toBe(0)
  })

  it("ignore l'heure du jour pour le calcul (0 quel que soit le moment de la journée)", () => {
    vi.setSystemTime(new Date(2026, 7, 22, 0, 1))
    expect(daysSince('2026-08-22')).toBe(0)
    vi.setSystemTime(new Date(2026, 7, 22, 23, 59))
    expect(daysSince('2026-08-22')).toBe(0)
  })

  it('retourne 1 pour hier', () => {
    expect(daysSince('2026-08-21')).toBe(1)
  })

  it('retourne le bon nombre de jours pour une date plus ancienne', () => {
    expect(daysSince('2026-08-01')).toBe(21)
  })

  it('ramène à 0 une date dans le futur', () => {
    expect(daysSince('2026-08-23')).toBe(0)
  })
})

describe('daysBetween', () => {
  it('retourne 0 pour deux dates identiques', () => {
    expect(daysBetween('2026-08-22', '2026-08-22')).toBe(0)
  })

  it('retourne le nombre de jours entre une date de début et une date de fin', () => {
    expect(daysBetween('2026-08-01', '2026-08-22')).toBe(21)
  })

  it('ramène à 0 un intervalle négatif (fin avant le début)', () => {
    expect(daysBetween('2026-08-22', '2026-08-01')).toBe(0)
  })
})

describe('formatStartDate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 22, 12, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('utilise bien la locale française (mois abrégé "août", pas "Aug")', () => {
    expect(formatStartDate('2026-08-22')).toContain('août')
  })

  it('utilise le format jour/mois en locale française pour le mode compact', () => {
    // fr-FR ordonne jour puis mois (22/08) ; d'autres locales inverseraient.
    expect(formatStartDate('2026-08-22', true)).toContain('22/08')
  })

  it("mode complet (par défaut) : aujourd'hui", () => {
    const label = dateFormatter.format(new Date('2026-08-22T00:00:00'))
    expect(formatStartDate('2026-08-22')).toBe(`${label} · aujourd'hui`)
  })

  it('mode complet explicite (compact=false) : au singulier pour 1 jour', () => {
    const label = dateFormatter.format(new Date('2026-08-21T00:00:00'))
    expect(formatStartDate('2026-08-21', false)).toBe(`${label} · 1 jour`)
  })

  it('mode complet : au pluriel pour plusieurs jours', () => {
    const label = dateFormatter.format(new Date('2026-08-01T00:00:00'))
    expect(formatStartDate('2026-08-01', false)).toBe(`${label} · 21 jours`)
  })

  it('mode complet : au pluriel pour 2 jours (limite singulier/pluriel)', () => {
    const label = dateFormatter.format(new Date('2026-08-20T00:00:00'))
    expect(formatStartDate('2026-08-20', false)).toBe(`${label} · 2 jours`)
  })

  it('mode compact : "auj." pour aujourd\'hui', () => {
    const label = compactDateFormatter.format(new Date('2026-08-22T00:00:00'))
    expect(formatStartDate('2026-08-22', true)).toBe(`${label} · auj.`)
  })

  it('mode compact : "N j" pour les jours passés (y compris 1 jour)', () => {
    const label = compactDateFormatter.format(new Date('2026-08-21T00:00:00'))
    expect(formatStartDate('2026-08-21', true)).toBe(`${label} · 1 j`)
  })

  it('mode compact : "N j" pour plusieurs jours', () => {
    const label = compactDateFormatter.format(new Date('2026-08-01T00:00:00'))
    expect(formatStartDate('2026-08-01', true)).toBe(`${label} · 21 j`)
  })
})

describe('formatDuration', () => {
  it('utilise bien la locale française (mois abrégé "août", pas "Aug")', () => {
    expect(formatDuration('2026-08-01', '2026-08-22')).toContain('août')
  })

  it('inclut la date de début et de fin séparées par une flèche', () => {
    const startLabel = dateFormatter.format(new Date('2026-08-01T00:00:00'))
    const endLabel = dateFormatter.format(new Date('2026-08-22T00:00:00'))
    expect(formatDuration('2026-08-01', '2026-08-22')).toBe(`${startLabel} → ${endLabel} · 21 jours`)
  })

  it('mode complet : au singulier pour 1 jour', () => {
    const startLabel = dateFormatter.format(new Date('2026-08-21T00:00:00'))
    const endLabel = dateFormatter.format(new Date('2026-08-22T00:00:00'))
    expect(formatDuration('2026-08-21', '2026-08-22')).toBe(`${startLabel} → ${endLabel} · 1 jour`)
  })

  it("mode complet : \"aujourd'hui\" quand début et fin sont la même date", () => {
    const label = dateFormatter.format(new Date('2026-08-22T00:00:00'))
    expect(formatDuration('2026-08-22', '2026-08-22')).toBe(`${label} → ${label} · aujourd'hui`)
  })

  it('mode compact : dates au format jour/mois séparées par une flèche', () => {
    const startLabel = compactDateFormatter.format(new Date('2026-08-01T00:00:00'))
    const endLabel = compactDateFormatter.format(new Date('2026-08-22T00:00:00'))
    expect(formatDuration('2026-08-01', '2026-08-22', true)).toBe(`${startLabel} → ${endLabel} · 21 j`)
  })
})

describe('formatAveragePerDay', () => {
  it('retourne une moyenne entière quand la division tombe juste', () => {
    expect(formatAveragePerDay(90, 9)).toBe('10 / jour')
  })

  it("retourne une décimale quand la division ne tombe pas juste", () => {
    expect(formatAveragePerDay(100, 9)).toBe('11,1 / jour')
  })

  it('compte un intervalle de moins d\'une journée comme 1 jour (évite la division par zéro)', () => {
    expect(formatAveragePerDay(5, 0)).toBe('5 / jour')
  })

  it('retourne 0 pour un compte nul', () => {
    expect(formatAveragePerDay(0, 5)).toBe('0 / jour')
  })

  it('gère une moyenne négative (compte net décroissant)', () => {
    expect(formatAveragePerDay(-6, 3)).toBe('-2 / jour')
  })
})
