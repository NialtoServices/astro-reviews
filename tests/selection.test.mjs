import { describe, expect, it } from 'vitest'
import { formatReviewDate, selectFeaturedReviews, sortNewestFirst } from '../src/selection.mjs'

/** A stand-in for a collection entry: selection reads only `id` and these `data` fields. */
function review(id, date, featured, order) {
  return {
    id,
    data: { ...(date ? { date } : {}), ...(featured ? { featured } : {}), ...(order === undefined ? {} : { order }) }
  }
}

const ids = (reviews) => reviews.map((entry) => entry.id)

describe('.sortNewestFirst', () => {
  it('is expected to order reviews newest first, with undated ones last', () => {
    expect(ids(sortNewestFirst([review('a', '2025-01-01'), review('b'), review('c', '2026-01-01')]))).toEqual([
      'c',
      'a',
      'b'
    ])
  })

  describe('with reviews from the same day', () => {
    it('is expected to order them by their synced order, whatever order they arrive in', () => {
      const reviews = [review('later-id', '2026-01-01', undefined, 1), review('earlier-id', '2026-01-01', undefined, 0)]

      expect(ids(sortNewestFirst(reviews))).toEqual(['earlier-id', 'later-id'])
    })
  })

  it('is expected to leave the given list as it was', () => {
    const reviews = [review('a', '2025-01-01'), review('c', '2026-01-01')]
    sortNewestFirst(reviews)

    expect(ids(reviews)).toEqual(['a', 'c'])
  })
})

describe('.selectFeaturedReviews', () => {
  const reviews = [
    review('old', '2024-01-01'),
    review('newest', '2026-06-01'),
    review('second-pick', '2023-01-01', 2),
    review('first-pick', '2022-01-01', 1),
    review('newer', '2026-01-01')
  ]

  it('is expected to lead with featured reviews in their order, then fill with the newest of the rest', () => {
    expect(ids(selectFeaturedReviews(reviews, 4))).toEqual(['first-pick', 'second-pick', 'newest', 'newer'])
  })

  describe('with more featured reviews than the limit', () => {
    it('is expected to show only the featured ones', () => {
      expect(ids(selectFeaturedReviews(reviews, 1))).toEqual(['first-pick', 'second-pick'])
    })
  })

  describe('with nothing featured', () => {
    it('is expected to show the newest up to the limit', () => {
      expect(ids(selectFeaturedReviews([review('a', '2025-01-01'), review('b', '2026-01-01')], 1))).toEqual(['b'])
    })
  })
})

describe('.formatReviewDate', () => {
  it('is expected to write a British calendar date', () => {
    expect(formatReviewDate('2026-07-06')).toBe('6 July 2026')
  })

  it('is expected not to slip the first of a month back a day', () => {
    expect(formatReviewDate('2026-01-01')).toBe('1 January 2026')
  })
})
