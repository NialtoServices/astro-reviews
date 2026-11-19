import { readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ReviewSchema } from '../../src/schemas.mjs'
import { runSync } from '../../src/sync/run.mjs'
import { makeSiteDirectory } from '../support/site-directory.mjs'

const WIDGET_HTML = readFileSync(new URL('../fixtures/widget.html', import.meta.url), 'utf-8')
const FIXTURE_IDS = [...WIDGET_HTML.matchAll(/data-id="([^"]+)"/g)].map((match) => match[1])
const NOW = () => new Date('2026-11-19T10:00:00Z')

/** A site directory with the package's setting, plus whatever review files `files` holds. */
async function makeSite(files = {}) {
  const siteDirectory = await makeSiteDirectory({ astroReviews: { widgetId: '1a2b3c4d5e6f' } })
  const reviewsDirectory = join(siteDirectory, 'src/content/reviews')
  await mkdir(reviewsDirectory, { recursive: true })
  for (const [name, contents] of Object.entries(files)) {
    await writeFile(join(reviewsDirectory, name), typeof contents === 'string' ? contents : JSON.stringify(contents))
  }

  return { siteDirectory, reviewsPath: join(reviewsDirectory, 'reviews.json') }
}

/** A stored reviews file holding the fixture's ids plus `extraIds`, so a sync sees those as removed. */
function storedFile(extraIds = []) {
  return {
    fetched: '2026-11-01',
    summary: { rating: 4.8, count: 1000 },
    reviews: [...FIXTURE_IDS, ...extraIds].map((id) => ({ id, rating: 5, source: 'Google', text: `Review ${id}.` }))
  }
}

function serving(html, calls = []) {
  return async (url) => {
    calls.push(url)
    return new Response(html, { status: 200 })
  }
}

async function sync(siteDirectory, { html = WIDGET_HTML, force = false, calls } = {}) {
  const lines = []
  const record = (line) => lines.push(line)
  const code = await runSync({
    siteDirectory,
    force,
    fetch: serving(html, calls),
    now: NOW,
    log: record,
    error: record
  })

  return { code, output: lines.join('\n') }
}

async function readStored(reviewsPath) {
  return JSON.parse(await readFile(reviewsPath, 'utf-8'))
}

const withDroppedBlock = WIDGET_HTML.replace(/ data-id="a1b2c3d4e5f60718293a4b5c6d7e8f90"/, '')

const withoutCards = WIDGET_HTML.slice(0, WIDGET_HTML.indexOf('<div class="ti-review-item')) + '</div>\n'

describe('.runSync', () => {
  describe('with the lowest rating on a ten-point scale', () => {
    it('is expected to write a review the loader schema accepts', async () => {
      const { siteDirectory, reviewsPath } = await makeSite()
      await sync(siteDirectory, { html: WIDGET_HTML.replace('data-rating="10.0"', 'data-rating="1.0"') })
      const { reviews } = await readStored(reviewsPath)

      expect(reviews.every((review, order) => ReviewSchema.safeParse({ ...review, order }).success)).toBe(true)
    })
  })

  describe('with no review cards in the widget', () => {
    it('is expected to refuse, write nothing and exit 1', async () => {
      const { siteDirectory, reviewsPath } = await makeSite()
      const { code, output } = await sync(siteDirectory, { html: withoutCards })

      expect(code).toBe(1)
      expect(output).toMatch(/no review cards/)
      await expect(readFile(reviewsPath, 'utf-8')).rejects.toThrow(/ENOENT/)
    })
  })

  describe('with nothing stored yet', () => {
    it('is expected to write every review and the totals, and exit 0', async () => {
      const { siteDirectory, reviewsPath } = await makeSite()
      const { code } = await sync(siteDirectory)
      const stored = await readStored(reviewsPath)

      expect(code).toBe(0)
      expect(stored.reviews).toHaveLength(5)
      expect(stored.summary).toEqual({ rating: 4.9, count: 1234 })
      expect(stored.fetched).toBe('2026-11-19')
    })

    it('is expected to report the totals', async () => {
      const { siteDirectory } = await makeSite()
      const { output } = await sync(siteDirectory)

      expect(output).toMatch(/Rated 4\.9 from 1234 review\(s\)/)
    })

    it('is expected to fetch the widget named in package.json', async () => {
      const { siteDirectory } = await makeSite()
      const calls = []
      await sync(siteDirectory, { calls })

      expect(String(calls[0])).toMatch(/^https:\/\/cdn\.trustindex\.io\/widgets\/1a\/1a2b3c4d5e6f\/content\.html\?/)
    })
  })

  describe('with no "All reviews" header', () => {
    it('is expected to write nothing and exit 1, even with --force', async () => {
      const { siteDirectory, reviewsPath } = await makeSite({ 'reviews.json': storedFile() })
      const before = await readFile(reviewsPath, 'utf-8')
      const { code, output } = await sync(siteDirectory, {
        html: WIDGET_HTML.replace('source-all', 'source-Yell'),
        force: true
      })

      expect(code).toBe(1)
      expect(output).toMatch(/#widget-requirements/)
      await expect(readFile(reviewsPath, 'utf-8')).resolves.toBe(before)
    })
  })

  describe('with a block that could not be read', () => {
    it('is expected to refuse, leave the file untouched and exit 1', async () => {
      const { siteDirectory, reviewsPath } = await makeSite({ 'reviews.json': storedFile() })
      const before = await readFile(reviewsPath, 'utf-8')
      const { code, output } = await sync(siteDirectory, { html: withDroppedBlock })

      expect(code).toBe(1)
      expect(output).toMatch(/could not be read/)
      await expect(readFile(reviewsPath, 'utf-8')).resolves.toBe(before)
    })

    describe('and --force', () => {
      it('is expected to write the reviews that were read and exit 0', async () => {
        const { siteDirectory, reviewsPath } = await makeSite({ 'reviews.json': storedFile() })
        const { code } = await sync(siteDirectory, { html: withDroppedBlock, force: true })

        expect(code).toBe(0)
        expect((await readStored(reviewsPath)).reviews).toHaveLength(4)
      })
    })
  })

  describe('with six reviews gone from the widget', () => {
    const extraIds = ['gone1', 'gone2', 'gone3', 'gone4', 'gone5', 'gone6']

    it('is expected to refuse and exit 1', async () => {
      const { siteDirectory, reviewsPath } = await makeSite({ 'reviews.json': storedFile(extraIds) })
      const { code, output } = await sync(siteDirectory)

      expect(code).toBe(1)
      expect(output).toMatch(/remove 6 reviews/)
      expect((await readStored(reviewsPath)).reviews).toHaveLength(11)
    })

    describe('and --force', () => {
      it('is expected to remove them and exit 0', async () => {
        const { siteDirectory, reviewsPath } = await makeSite({ 'reviews.json': storedFile(extraIds) })
        const { code } = await sync(siteDirectory, { force: true })

        expect(code).toBe(0)
        expect((await readStored(reviewsPath)).reviews).toHaveLength(5)
      })
    })
  })

  describe('with a featured review withdrawn upstream', () => {
    it('is expected to write the file without it, name it and exit 1', async () => {
      const { siteDirectory, reviewsPath } = await makeSite({
        'reviews.json': storedFile(['withdrawn']),
        'featured.json': ['withdrawn', FIXTURE_IDS[0]]
      })
      const { code, output } = await sync(siteDirectory)
      const storedIds = (await readStored(reviewsPath)).reviews.map((review) => review.id)

      expect(code).toBe(1)
      expect(storedIds).not.toContain('withdrawn')
      expect(output).toMatch(/"withdrawn"/)
      expect(output).toMatch(/featured\.json/)
    })
  })

  describe('with a featured review edited upstream', () => {
    it('is expected to keep it and exit 0', async () => {
      const { siteDirectory } = await makeSite({ 'reviews.json': storedFile(), 'featured.json': [FIXTURE_IDS[0]] })
      const { code, output } = await sync(siteDirectory)

      expect(code).toBe(0)
      expect(output).toMatch(/5 updated/)
    })
  })

  describe('with a malformed featured.json', () => {
    it('is expected to fail before fetching anything', async () => {
      const { siteDirectory } = await makeSite({ 'featured.json': '[1]' })
      const calls = []
      const { code, output } = await sync(siteDirectory, { calls })

      expect(code).toBe(1)
      expect(output).toMatch(/featured\.json/)
      expect(calls).toEqual([])
    })
  })

  describe('with no astroReviews setting', () => {
    it('is expected to say what to set and exit 1', async () => {
      const siteDirectory = await makeSiteDirectory({ name: 'example-site' })
      const { code, output } = await sync(siteDirectory)

      expect(code).toBe(1)
      expect(output).toMatch(/astroReviews\.widgetId/)
    })
  })
})
