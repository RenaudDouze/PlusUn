// Pas ancré (`^`/`$`) : inutile, la comparaison finale avec `value` dans
// isValidIsoDate ci-dessous rejette déjà tout caractère superflu avant/après
// (elle re-sérialise depuis les composants captés et compare la chaîne
// entière), un ancrage n'y changerait donc rien d'observable.
const ISO_DATE_PATTERN = /(\d{4})-(\d{2})-(\d{2})/

/** Vrai si `value` est une date calendaire réelle au format YYYY-MM-DD — pas
 * seulement une chaîne de la bonne forme : le 30 février est rejeté, alors
 * que le constructeur `Date` le reporterait silencieusement début mars.
 * Sert de garde avant tout passage à `Intl.DateTimeFormat`/`daysBetween`
 * ci-dessous : une chaîne malformée (ex: reçue via la synchro, non
 * ré-authentifiée par appareil, voir useRemoteSync.ts) produirait sinon un
 * `Invalid Date`, sur lequel `Intl.DateTimeFormat.format` lève un
 * `RangeError` au lieu de simplement afficher une valeur incorrecte. */
export function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE_PATTERN.exec(value)
  if (!match) return false
  const [, yearStr, monthStr, dayStr] = match
  // Construit depuis des composants numériques (jamais depuis une chaîne
  // recomposée) puis reformate : contrairement à `new Date(chaîne)`, ce
  // constructeur ne produit jamais d'`Invalid Date` (il reporte les valeurs
  // hors bornes sur les unités suivantes, ex: jour 30 en février) — comparer
  // le résultat à la chaîne d'origine détecte à la fois un composant hors
  // bornes et tout caractère superflu qu'un motif non ancré aurait ignoré.
  const date = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr))
  return toIsoDate(date.getTime()) === value
}

export function toIsoDate(timestamp: number): string {
  const d = new Date(timestamp)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayIsoDate(): string {
  return toIsoDate(Date.now())
}

/** Nombre de jours entre deux dates ISO (YYYY-MM-DD), à l'heure du jour près. */
export function daysBetween(startIsoDate: string, endIsoDate: string): number {
  const start = new Date(`${startIsoDate}T00:00:00`)
  const end = new Date(`${endIsoDate}T00:00:00`)
  const startMidnight = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const endMidnight = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  const diffMs = endMidnight.getTime() - startMidnight.getTime()
  return Math.max(0, Math.round(diffMs / 86_400_000))
}

/** Nombre de jours écoulés entre une date ISO (YYYY-MM-DD) et aujourd'hui. */
export function daysSince(isoDate: string): number {
  return daysBetween(isoDate, todayIsoDate())
}

export function formatStartDate(isoDate: string, compact = false): string {
  const days = daysSince(isoDate)
  const date = new Date(`${isoDate}T00:00:00`)

  if (compact) {
    const label = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' }).format(date)
    const suffix = days === 0 ? 'auj.' : `${days} j`
    return `${label} · ${suffix}`
  }

  const label = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
  const suffix = days === 0 ? "aujourd'hui" : days === 1 ? '1 jour' : `${days} jours`
  return `${label} · ${suffix}`
}

/** Durée totale figée entre deux dates ISO (YYYY-MM-DD), ex: pour un
 * compteur archivé (contrairement à `formatStartDate`, qui compte les jours
 * écoulés jusqu'à aujourd'hui pour un compteur toujours actif). */
export function formatDuration(startIsoDate: string, endIsoDate: string, compact = false): string {
  const days = daysBetween(startIsoDate, endIsoDate)
  const start = new Date(`${startIsoDate}T00:00:00`)
  const end = new Date(`${endIsoDate}T00:00:00`)

  if (compact) {
    const fmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' })
    return `${fmt.format(start)} → ${fmt.format(end)} · ${days} j`
  }

  const fmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  const suffix = days === 0 ? "aujourd'hui" : days === 1 ? '1 jour' : `${days} jours`
  return `${fmt.format(start)} → ${fmt.format(end)} · ${suffix}`
}

/** Moyenne d'incrément par jour sur une durée figée (compte total divisé par
 * le nombre de jours écoulés), pour les stats d'un compteur archivé. Un
 * intervalle de moins d'une journée compte comme 1 jour, pour éviter une
 * division par zéro qui produirait une moyenne infinie. */
export function formatAveragePerDay(count: number, days: number): string {
  const average = count / Math.max(days, 1)
  return `${average.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} / jour`
}
