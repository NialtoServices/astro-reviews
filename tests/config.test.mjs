import { describe, expect, it } from 'vitest'
import { readConfig } from '../src/config.mjs'
import { makeSiteDirectory } from './support/site-directory.mjs'

describe('.readConfig', () => {
  it('is expected to read astroReviews.widgetId', async () => {
    const siteDirectory = await makeSiteDirectory({ astroReviews: { widgetId: '1a2b3c4d5e6f' } })

    await expect(readConfig(siteDirectory)).resolves.toEqual({ widgetId: '1a2b3c4d5e6f' })
  })

  describe('with no package.json', () => {
    it('is expected to name the file and the directory it looked in', async () => {
      const siteDirectory = await makeSiteDirectory()
      const reading = readConfig(siteDirectory)

      await expect(reading).rejects.toThrow(/package\.json/)
      await expect(reading).rejects.toThrow(siteDirectory)
    })
  })

  describe('with no astroReviews setting', () => {
    it('is expected to name the setting', async () => {
      const siteDirectory = await makeSiteDirectory({ name: 'example-site' })

      await expect(readConfig(siteDirectory)).rejects.toThrow(/astroReviews\.widgetId/)
    })
  })

  describe.each([
    ['with an embed URL', 'https://cdn.trustindex.io/loader.js?1a2b3c4d5e6f%27%3E'],
    ['with a content URL', 'https://cdn.trustindex.io/widgets/1a/1a2b3c4d5e6f/content.html'],
    ['with an empty id', ''],
    ['with an id that is not a string', 1234]
  ])('%s', (_, widgetId) => {
    it('is expected to refuse it and show the expected form', async () => {
      const siteDirectory = await makeSiteDirectory({ astroReviews: { widgetId } })

      await expect(readConfig(siteDirectory)).rejects.toThrow(/bare widget id/)
    })
  })
})
