import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { addCounter, gotoFresh, openMenu } from './helpers'

// A11Y-02 : chaque état qui change le DOM passe par axe-core, dans les deux
// thèmes (A11Y-05). Le thème suit `prefers-color-scheme` tant qu'aucun choix
// n'est enregistré.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

// Exceptions connues, règle par règle (jamais pour toute la page) :
// - nested-interactive : la carte du compteur est un bouton (« Incrémenter »,
//   toucher la carte fait +1) qui contient d'autres boutons (−N, +N, actions).
//   Corriger demande de repenser la carte ; à traiter dans une PR dédiée.
// - label-content-name-mismatch : les boutons « −N » / « +N » ont pour nom
//   « Décrémenter » / « Incrémenter » (le pas change, le nom non), et les tests
//   e2e les ciblent par ce nom exact. À traiter avec nested-interactive.
const EXCEPTIONS = ['nested-interactive', 'label-content-name-mismatch']

async function violations(page: Page) {
  // Les cartes apparaissent par un fondu : on attend la fin des animations pour
  // que le contraste soit mesuré sur l'état final.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
  const results = await new AxeBuilder({ page }).withTags(TAGS).disableRules(EXCEPTIONS).analyze()
  return results.violations
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`thème ${scheme}`, () => {
    test.use({ colorScheme: scheme })

    test('axe : accueil vide', async ({ page }) => {
      await gotoFresh(page)
      await expect(page.getByRole('button', { name: 'Créer mon premier compteur' })).toBeVisible()
      expect(await violations(page)).toEqual([])
    })

    test('axe : avec un compteur', async ({ page }) => {
      await gotoFresh(page)
      await addCounter(page)
      expect(await violations(page)).toEqual([])
    })

    test('axe : menu ouvert', async ({ page }) => {
      await gotoFresh(page)
      await addCounter(page)
      await openMenu(page)
      expect(await violations(page)).toEqual([])
    })
  })
}
