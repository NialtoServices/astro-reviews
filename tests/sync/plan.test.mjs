import { describe, expect, it } from 'vitest'
import { planChanges, safetyRefusals } from '../../src/sync/plan.mjs'

function review(id, overrides = {}) {
  return {
    id,
    author: 'Alex Example',
    rating: 5,
    source: 'Google',
    date: '2026-01-01',
    text: `Review ${id}.`,
    ...overrides
  }
}

const ids = (reviews) => reviews.map((entry) => entry.id)

describe('.planChanges', () => {
  it('is expected to sort reviews into added, updated and removed', () => {
    const stored = [review('kept'), review('edited'), review('withdrawn')]
    const parsed = [review('kept'), review('edited', { text: 'Edited.' }), review('new')]
    const { added, updated, removed } = planChanges(stored, parsed)

    expect([ids(added), ids(updated), ids(removed)]).toEqual([['new'], ['edited'], ['withdrawn']])
  })

  describe('with a review edited upstream', () => {
    it('is expected to count it as updated, never removed', () => {
      const { updated, removed } = planChanges([review('a')], [review('a', { rating: 4 })])

      expect([ids(updated), ids(removed)]).toEqual([['a'], []])
    })
  })

  describe('with a review that lost an optional field', () => {
    it('is expected to count it as updated', () => {
      const { author: _, ...anonymous } = review('a')
      const { updated } = planChanges([review('a')], [anonymous])

      expect(ids(updated)).toEqual(['a'])
    })
  })
})

describe('.safetyRefusals', () => {
  it('is expected to allow a clean run', () => {
    expect(
      safetyRefusals({ blockCount: 10, droppedCount: 0, removedCount: 5, storedCount: 10, parsedCount: 8 })
    ).toEqual([])
  })

  describe('with a dropped block', () => {
    it('is expected to refuse, saying how many', () => {
      const refusals = safetyRefusals({
        blockCount: 10,
        droppedCount: 1,
        removedCount: 0,
        storedCount: 10,
        parsedCount: 10
      })

      expect(refusals).toEqual([expect.stringMatching(/1 review block.*could not be read/)])
    })
  })

  describe('with more than five removals', () => {
    it('is expected to refuse, saying how many', () => {
      const refusals = safetyRefusals({
        blockCount: 10,
        droppedCount: 0,
        removedCount: 6,
        storedCount: 30,
        parsedCount: 30
      })

      expect(refusals).toEqual([expect.stringMatching(/remove 6 reviews/)])
    })
  })

  describe('with a parse below 80% of the stored count', () => {
    it('is expected to refuse, naming both counts', () => {
      const refusals = safetyRefusals({
        blockCount: 10,
        droppedCount: 0,
        removedCount: 0,
        storedCount: 32,
        parsedCount: 24
      })

      expect(refusals).toEqual([expect.stringMatching(/24 reviews.*32/)])
    })
  })

  describe('with no review cards in the widget', () => {
    it('is expected to refuse', () => {
      const refusals = safetyRefusals({
        blockCount: 0,
        droppedCount: 0,
        removedCount: 0,
        storedCount: 0,
        parsedCount: 0
      })

      expect(refusals).toEqual([expect.stringMatching(/no review cards/)])
    })
  })

  describe('with nothing stored yet', () => {
    it('is expected to skip the count check', () => {
      expect(
        safetyRefusals({ blockCount: 10, droppedCount: 0, removedCount: 0, storedCount: 0, parsedCount: 3 })
      ).toEqual([])
    })
  })

  describe('with every check tripped', () => {
    it('is expected to report all three, each pointing at --force', () => {
      const refusals = safetyRefusals({
        blockCount: 10,
        droppedCount: 2,
        removedCount: 9,
        storedCount: 40,
        parsedCount: 20
      })

      expect(refusals).toHaveLength(3)
      expect(refusals.every((refusal) => refusal.includes('--force'))).toBe(true)
    })
  })
})
