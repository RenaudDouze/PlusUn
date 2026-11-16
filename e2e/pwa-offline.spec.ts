import { expect, test } from '@playwright/test'
import { addCounter, gotoFresh } from './helpers'

test.describe('PWA et fonctionnement hors-ligne', () => {
  test('expose un manifest web app valide', async ({ page, baseURL }) => {
    const response = await page.request.get(`${baseURL}/manifest.webmanifest`)
    expect(response.ok()).toBeTruthy()
    const manifest = await response.json()
    expect(manifest.name).toBe('PlusUn')
    expect(manifest.display).toBe('standalone')
    expect(manifest.icons.length).toBeGreaterThan(0)
    expect(manifest.shortcuts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Nouveau compteur', url: expect.stringContaining('action=new') }),
        expect.objectContaining({ name: 'Synchroniser', url: expect.stringContaining('action=sync') }),
      ])
    )
  })

  test('le raccourci "Nouveau compteur" crée un compteur au chargement', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/?action=new`)
    await expect(page.locator('.counter-name-input')).toHaveValue('Compteur 1')
    expect(new URL(page.url()).search).toBe('')
  })

  test('le raccourci "Synchroniser" ouvre le panneau au chargement', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/?action=sync`)
    await expect(page.getByText('Synchroniser mes compteurs')).toBeVisible()
    expect(new URL(page.url()).search).toBe('')
  })

  test('enregistre un service worker', async ({ page }) => {
    await gotoFresh(page)
    const hasServiceWorker = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready
      return !!reg.active
    })
    expect(hasServiceWorker).toBe(true)
  })

  test("fonctionne hors-ligne après une première visite", async ({ page, context }) => {
    await gotoFresh(page)
    await addCounter(page)
    await page.locator('.counter-card').click()
    await expect(page.locator('.counter-value')).toHaveText('1')

    // Laisse le service worker terminer sa mise en cache des assets.
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    await page.waitForTimeout(500)

    await expect(page.locator('#offline-banner')).toHaveCount(0)
    await context.setOffline(true)
    await page.reload()

    await expect(page.getByRole('heading', { name: 'PlusUn', exact: true })).toBeVisible()
    await expect(page.locator('.counter-value')).toHaveText('1')
    // L'interface dit qu'elle est hors ligne (PWA-05).
    await expect(page.locator('#offline-banner')).toContainText('Hors ligne')

    await context.setOffline(false)
    await expect(page.locator('#offline-banner')).toHaveCount(0)
  })

  test('les compteurs restent disponibles hors-ligne (localStorage local)', async ({ page, context }) => {
    await gotoFresh(page)
    await addCounter(page)
    await page.getByText('Compteur 1', { exact: true }).click()
    await page.locator('.counter-name-input').fill('Hors-ligne')
    await page.locator('.counter-name-input').press('Enter')

    await page.evaluate(async () => {
      await navigator.serviceWorker.ready
    })
    await page.waitForTimeout(500)

    await context.setOffline(true)
    await page.reload()
    await expect(page.getByText('Hors-ligne', { exact: true })).toBeVisible()

    // Toujours utilisable hors-ligne : incrémenter fonctionne normalement.
    await page.locator('.counter-card').click()
    await expect(page.locator('.counter-value')).toHaveText('1')

    await context.setOffline(false)
  })
})
