import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseReviews, parseSummary, WidgetRequirementError } from '../../src/trustindex/parse.mjs'

const WIDGET_HTML = readFileSync(new URL('../fixtures/widget.html', import.meta.url), 'utf-8')

/** The fixture's review cards, one string each, in order. */
const CARDS = WIDGET_HTML.split(/(?=<div class="ti-review-item)/).filter((segment) =>
  segment.startsWith('<div class="ti-review-item')
)

/** A widget holding just the given cards, behind the fixture's headers. */
function widgetWith(...cards) {
  const headers = WIDGET_HTML.slice(0, WIDGET_HTML.indexOf('<div class="ti-review-item'))
  return `${headers}${cards.join('')}</div>\n`
}

function fixtureReviewsById() {
  return Object.fromEntries(parseReviews(WIDGET_HTML).reviews.map((review) => [review.id, review]))
}

describe('.parseReviews', () => {
  it('is expected to read every card in the widget', () => {
    const { reviews, dropped, blockCount } = parseReviews(WIDGET_HTML)

    expect(blockCount).toBe(5)
    expect(dropped).toEqual([])
    expect(reviews.map((review) => review.source)).toEqual(['Google', 'Google', 'Checkatrade', 'Checkatrade', 'Yell'])
  })

  it('is expected to leave the photo counter out of the text and decode entities', () => {
    expect(fixtureReviewsById().a1b2c3d4e5f60718293a4b5c6d7e8f90.text).toBe(
      "Lovely work on our armchair & footstool. We'd happily recommend them."
    )
  })

  it("is expected to keep the reviewer's line breaks", () => {
    expect(fixtureReviewsById().b2c3d4e5f60718293a4b5c6d7e8f90a1.text).toBe('First line\nSecond line')
  })

  it('is expected to write the date as a UTC calendar day', () => {
    expect(fixtureReviewsById().b2c3d4e5f60718293a4b5c6d7e8f90a1.date).toBe('2025-12-31')
  })

  describe('with a lowercase name', () => {
    it('is expected to capitalise it', () => {
      expect(fixtureReviewsById().b2c3d4e5f60718293a4b5c6d7e8f90a1.author).toBe('Alex Example')
    })
  })

  describe('with a name that already carries capitals', () => {
    it('is expected to leave it as written', () => {
      const card = CARDS[0].replace('Morgan Example', 'JT deVries')

      expect(parseReviews(widgetWith(card)).reviews[0].author).toBe('JT deVries')
    })
  })

  describe.each([
    ['a particle among capitalised words', 'Ana Sample da Costa', 'Ana Sample da Costa'],
    ['a particle in an all-lowercase name', 'ana sample da costa', 'Ana Sample da Costa'],
    ['a particle as the first word', 'de sample', 'De Sample'],
    ['lowercase words beside capitalised ones', 'Sam taylor jones', 'Sam Taylor Jones'],
    ['a lowercase initial', 'Jo e', 'Jo E']
  ])('with %s', (_, typed, shown) => {
    it(`is expected to show "${typed}" as "${shown}"`, () => {
      const card = CARDS[0].replace('Morgan Example', typed)

      expect(parseReviews(widgetWith(card)).reviews[0].author).toBe(shown)
    })
  })

  describe('with a duplicated name', () => {
    it('is expected to collapse it', () => {
      expect(fixtureReviewsById().e5f60718293a4b5c6d7e8f90a1b2c3d4.author).toBe('Sam')
    })
  })

  describe('with an empty name', () => {
    it('is expected to keep the review without an author key', () => {
      expect('author' in fixtureReviewsById().c3d4e5f60718293a4b5c6d7e8f90a1b2).toBe(false)
    })
  })

  describe('with a ten-point rating', () => {
    it('is expected to restate it out of five', () => {
      const reviews = fixtureReviewsById()

      expect(reviews.c3d4e5f60718293a4b5c6d7e8f90a1b2.rating).toBe(5)
      expect(reviews.d4e5f60718293a4b5c6d7e8f90a1b2c3.rating).toBe(4.5)
    })
  })

  describe('with an unreadable timestamp', () => {
    it('is expected to keep the review without a date key', () => {
      const card = CARDS[0].replace(/data-time="\d+"/, 'data-time="soon"')
      const [review] = parseReviews(widgetWith(card)).reviews

      expect('date' in review).toBe(false)
    })
  })

  describe.each([
    ['with no data-id', (card) => card.replace(/ data-id="[^"]+"/, ''), 'no data-id'],
    [
      'with an id that is not a safe file name',
      (card) => card.replace(/data-id="[^"]+"/, 'data-id="../escape"'),
      'data-id is not a safe file name'
    ],
    ['with no name element', (card) => card.replace(/<div class="ti-name">[^<]*<\/div>/, ''), 'no author'],
    ['with empty text', (card) => card.replace(/<!-- R-CONTENT -->[\s\S]*?<!-- R-CONTENT -->/, ''), 'no review text'],
    [
      'with a rating above the scale',
      (card) => card.replace('data-rating="5.0"', 'data-rating="6.0"'),
      'no readable rating'
    ]
  ])('%s', (_, edit, reason) => {
    it(`is expected to drop the card as "${reason}"`, () => {
      const { reviews, dropped, blockCount } = parseReviews(widgetWith(edit(CARDS[0])))

      expect(blockCount).toBe(1)
      expect(reviews).toEqual([])
      expect(dropped.map((drop) => drop.reason)).toEqual([reason])
    })
  })
})

describe('.parseSummary', () => {
  it('is expected to read the "All reviews" header, not a platform header', () => {
    expect(parseSummary(WIDGET_HTML)).toEqual({ rating: 4.9, count: 1234 })
  })

  describe('with a singular count', () => {
    it('is expected to read it', () => {
      expect(parseSummary(WIDGET_HTML.replace('1,234 reviews', '1 review'))).toEqual({ rating: 4.9, count: 1 })
    })
  })

  describe.each([
    ['with no "All reviews" header', (html) => html.replace('source-all', 'source-Yell'), /"All reviews" header/],
    [
      'with no review count in the header',
      (html) => html.replace(/<span class="ti-header-rating-reviews">1,234 reviews<\/span>/g, ''),
      /review count/
    ],
    ['with an unreadable rating in the header', (html) => html.replace(/>4\.9</g, '>five<'), /rating/]
  ])('%s', (_, edit, message) => {
    it('is expected to throw a WidgetRequirementError pointing at the requirements', () => {
      const html = edit(WIDGET_HTML)

      expect(() => parseSummary(html)).toThrow(WidgetRequirementError)
      expect(() => parseSummary(html)).toThrow(message)
      expect(() => parseSummary(html)).toThrow(/#widget-requirements/)
    })
  })
})
