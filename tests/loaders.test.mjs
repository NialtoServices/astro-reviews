import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { REVIEW_SUMMARY_ID, ReviewSchema, reviewsLoader, reviewSummaryLoader } from '../src/index.mjs'

const STORED = {
  fetched: '2026-11-19',
  summary: { rating: 4.9, count: 1234 },
  reviews: [
    { id: 'a', author: 'Alex Example', rating: 5, source: 'Google', date: '2026-01-01', text: 'First.' },
    { id: 'b', rating: 4.5, source: 'Checkatrade', text: 'Second.' },
    { id: 'c', author: 'Sam', rating: 5, source: 'Yell', date: '2025-01-01', text: 'Third.' }
  ]
}

/** A site root holding the given review files, and a loader context pointed at it. */
async function makeContext(files = {}) {
  const root = await mkdtemp(join(tmpdir(), 'astro-reviews-loader-'))
  const reviewsDirectory = join(root, 'src/content/reviews')
  await mkdir(reviewsDirectory, { recursive: true })
  for (const [name, contents] of Object.entries(files)) {
    await writeFile(join(reviewsDirectory, name), typeof contents === 'string' ? contents : JSON.stringify(contents))
  }

  const entries = new Map()
  const store = {
    set: (entry) => entries.set(entry.id, entry) && true,
    clear: () => entries.clear()
  }

  return {
    entries,
    context: {
      collection: 'reviews',
      store,
      config: { root: pathToFileURL(`${root}/`) },
      logger: { info: () => {}, warn: () => {}, debug: () => {} },
      parseData: async ({ data }) => data,
      generateDigest: (data) => JSON.stringify(data)
    }
  }
}

describe('.reviewsLoader', () => {
  it('is expected to emit one entry per review, numbering featured ones in featured order', async () => {
    const { entries, context } = await makeContext({ 'reviews.json': STORED, 'featured.json': ['c', 'a'] })
    await reviewsLoader().load(context)

    expect([...entries.keys()].sort()).toEqual(['a', 'b', 'c'])
    expect(entries.get('c').data.featured).toBe(1)
    expect(entries.get('a').data.featured).toBe(2)
  })

  it('is expected to leave unfeatured reviews without a featured key', async () => {
    const { entries, context } = await makeContext({ 'reviews.json': STORED, 'featured.json': ['a'] })
    await reviewsLoader().load(context)

    expect('featured' in entries.get('b').data).toBe(false)
  })

  it('is expected to carry the stored fields through unchanged', async () => {
    const { entries, context } = await makeContext({ 'reviews.json': STORED })
    await reviewsLoader().load(context)

    expect(entries.get('b').data).toEqual({ rating: 4.5, source: 'Checkatrade', text: 'Second.' })
  })

  describe('with a featured id that has no review', () => {
    it('is expected to fail the load naming it', async () => {
      const { context } = await makeContext({ 'reviews.json': STORED, 'featured.json': ['a', 'withdrawn'] })

      await expect(reviewsLoader().load(context)).rejects.toThrow(/"withdrawn"/)
    })
  })

  describe('with a malformed featured.json', () => {
    it('is expected to fail the load naming the file', async () => {
      const { context } = await makeContext({ 'reviews.json': STORED, 'featured.json': '{"a": 1}' })

      await expect(reviewsLoader().load(context)).rejects.toThrow(/featured\.json/)
    })
  })

  describe('with no reviews.json yet', () => {
    it('is expected to load nothing without failing', async () => {
      const { entries, context } = await makeContext()
      await reviewsLoader().load(context)

      expect(entries.size).toBe(0)
    })
  })
})

describe('.reviewSummaryLoader', () => {
  it('is expected to emit the totals as a single entry', async () => {
    const { entries, context } = await makeContext({ 'reviews.json': STORED })
    await reviewSummaryLoader().load(context)

    expect([...entries.keys()]).toEqual([REVIEW_SUMMARY_ID])
    expect(entries.get(REVIEW_SUMMARY_ID).data).toEqual({ rating: 4.9, count: 1234, fetched: '2026-11-19' })
  })

  describe('with no reviews.json yet', () => {
    it('is expected to load nothing without failing', async () => {
      const { entries, context } = await makeContext()
      await reviewSummaryLoader().load(context)

      expect(entries.size).toBe(0)
    })
  })
})

describe('ReviewSchema', () => {
  it('is expected to accept a stored review', () => {
    expect(ReviewSchema.safeParse({ ...STORED.reviews[0], featured: 1 }).success).toBe(true)
  })

  it('is expected to reject a rating above 5', () => {
    expect(ReviewSchema.safeParse({ ...STORED.reviews[0], rating: 6 }).success).toBe(false)
  })
})
