import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  missingFeatured,
  readFeatured,
  readReviewsFile,
  serializeReviewsFile,
  sortReviews,
  writeReviewsFile
} from '../src/files.mjs'

async function makeReviewsDirectory() {
  return mkdtemp(join(tmpdir(), 'astro-reviews-files-'))
}

const NEWER = { id: 'b', author: 'Alex Example', rating: 5, source: 'Google', date: '2026-02-01', text: 'Newer.' }
const OLDER = { id: 'a', rating: 4.5, source: 'Checkatrade', date: '2025-06-01', text: 'Older.' }
const UNDATED = { id: 'c', author: 'Sam', rating: 5, source: 'Yell', text: 'No date.' }
const SAME_DAY = {
  id: 'aa',
  author: 'Jordan Sample',
  rating: 5,
  source: 'Google',
  date: '2026-02-01',
  text: 'Same day.'
}

const FILE = { fetched: '2026-11-19', summary: { rating: 4.9, count: 1234 }, reviews: [OLDER, UNDATED, NEWER] }

describe('.readReviewsFile', () => {
  describe('with no reviews.json', () => {
    it('is expected to return null', async () => {
      await expect(readReviewsFile(await makeReviewsDirectory())).resolves.toBeNull()
    })
  })

  describe('with a reviews.json that is not a reviews file', () => {
    it('is expected to throw naming the file', async () => {
      const directory = await makeReviewsDirectory()
      await writeFile(join(directory, 'reviews.json'), '{"reviews": "none"}')

      await expect(readReviewsFile(directory)).rejects.toThrow(/reviews\.json/)
    })
  })
})

describe('.writeReviewsFile', () => {
  it('is expected to write a file readReviewsFile reads back, reviews sorted', async () => {
    const directory = await makeReviewsDirectory()
    await writeReviewsFile(directory, FILE)

    await expect(readReviewsFile(directory)).resolves.toEqual({ ...FILE, reviews: [NEWER, OLDER, UNDATED] })
  })

  it('is expected to leave nothing beside reviews.json', async () => {
    const directory = await makeReviewsDirectory()
    await writeReviewsFile(directory, FILE)

    await expect(readdir(directory)).resolves.toEqual(['reviews.json'])
  })

  describe('with a directory that does not exist yet', () => {
    it('is expected to create it', async () => {
      const directory = join(await makeReviewsDirectory(), 'src', 'content', 'reviews')
      await writeReviewsFile(directory, FILE)

      await expect(readFile(join(directory, 'reviews.json'), 'utf-8')).resolves.toBe(serializeReviewsFile(FILE))
    })
  })
})

describe('.sortReviews', () => {
  it('is expected to put the newest first and undated last', () => {
    expect(sortReviews([UNDATED, OLDER, NEWER]).map((review) => review.id)).toEqual(['b', 'a', 'c'])
  })

  describe('with reviews from the same day', () => {
    it("is expected to keep them in the order given, which is the widget's newest-first order", () => {
      expect(sortReviews([OLDER, NEWER, SAME_DAY]).map((review) => review.id)).toEqual(['b', 'aa', 'a'])
      expect(sortReviews([OLDER, SAME_DAY, NEWER]).map((review) => review.id)).toEqual(['aa', 'b', 'a'])
    })
  })
})

describe('.serializeReviewsFile', () => {
  it('is expected to write keys in a fixed order with a trailing newline', () => {
    const shuffled = { text: 'Hi.', source: 'Google', date: '2026-01-01', rating: 5, author: 'Alex', id: 'x' }

    expect(serializeReviewsFile({ reviews: [shuffled], summary: { count: 1, rating: 5 }, fetched: '2026-11-19' })).toBe(
      `{
  "fetched": "2026-11-19",
  "summary": {
    "rating": 5,
    "count": 1
  },
  "reviews": [
    {
      "id": "x",
      "author": "Alex",
      "rating": 5,
      "source": "Google",
      "date": "2026-01-01",
      "text": "Hi."
    }
  ]
}
`
    )
  })
})

describe('.readFeatured', () => {
  describe('with no featured.json', () => {
    it('is expected to return an empty list', async () => {
      await expect(readFeatured(await makeReviewsDirectory())).resolves.toEqual([])
    })
  })

  it('is expected to return the ids in order', async () => {
    const directory = await makeReviewsDirectory()
    await writeFile(join(directory, 'featured.json'), '["b", "a"]')

    await expect(readFeatured(directory)).resolves.toEqual(['b', 'a'])
  })

  describe.each([
    ['with an object', '{"a": 1}'],
    ['with numbers', '[1, 2]'],
    ['with a duplicate id', '["a", "a"]'],
    ['with invalid JSON', 'not json']
  ])('%s', (_, contents) => {
    it('is expected to throw naming featured.json', async () => {
      const directory = await makeReviewsDirectory()
      await writeFile(join(directory, 'featured.json'), contents)

      await expect(readFeatured(directory)).rejects.toThrow(/featured\.json/)
    })
  })
})

describe('.missingFeatured', () => {
  it('is expected to list featured ids with no review, in featured order', () => {
    expect(missingFeatured(['z', 'b', 'y'], [NEWER, OLDER])).toEqual(['z', 'y'])
  })
})
