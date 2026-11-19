/**
 * Reading a Trustindex widget's content document: the review cards it carries, and the headline
 * figures in its "All reviews" header.
 *
 * Everything here treats the markup as untrusted third-party input: its structure is whatever
 * Trustindex serves, and its text is whatever a member of the public wrote.
 */
import { WidgetRequirementError } from './widget-requirement-error.mjs'

export { WidgetRequirementError }

/**
 * The id shape Trustindex emits. Validated rather than trusted because sites may use it in file
 * names and URLs, where a `/` or `..` would resolve somewhere else.
 */
const REVIEW_ID_PATTERN = /^[A-Za-z0-9_-]+$/

/** Every rating is stored on this scale, whatever scale the platform uses. */
const RATING_SCALE = 5

function decodeEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/** The inner HTML of an element as plain text on one line. */
function htmlToText(inner) {
  return decodeEntities(inner.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Like `htmlToText`, but keeps the reviewer's line breaks: reviews arrive with paragraphs, and some
 * platforms put the job title on a line of its own above the text. Runs of blank lines collapse to
 * a single paragraph break.
 */
function htmlToMultilineText(inner) {
  return decodeEntities(inner.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * The reviewer's display name, an empty string when the element is present but empty, or `null`
 * when the element is missing. Some platforms publish reviews anonymously, so an empty name is a
 * real review; a missing element means the markup has changed.
 */
function nameField(block) {
  const match = block.match(/class="[^"]*ti-name[^"]*"[^>]*>([\s\S]*?)<\/div>/)
  return match ? htmlToText(match[1]) : null
}

/** Collapses consecutive duplicate words ("Sam Sam" becomes "Sam"), a common Google quirk. */
function cleanName(name) {
  if (!name) return name

  const words = name.split(/\s+/)
  return words.filter((word, index) => index === 0 || word.toLowerCase() !== words[index - 1].toLowerCase()).join(' ')
}

/**
 * Reviewers set their own display name on Google, so they arrive as "alex example" as often as
 * "Alex Example". Only a name typed entirely in lowercase is capitalised: a capital anywhere means
 * the reviewer styled it, so it is left exactly as written, keeping particles, initials and business
 * names as they are ("Ana Sample da Costa", "JT deVries", "Example & Co Ltd").
 */
function capitalizeName(name) {
  if (!name || /\p{Lu}/u.test(name)) return name

  return name.replace(/(^|[\s\-'’])(\p{Ll})/gu, (_, boundary, letter) => `${boundary}${letter.toUpperCase()}`)
}

/**
 * Reviews with photos lead the text container with an image block whose "+N" counter would
 * otherwise be captured as the text. Reads up to the "read more" control (present on every card),
 * drops the image block, then strips the remaining markup.
 */
function reviewText(block) {
  const match = block.match(/ti-review-text-container[^>]*>([\s\S]*?)<span class="ti-read-more/)
  if (!match) return null

  return htmlToMultilineText(match[1].replace(/<div class="ti-more-image-count">[\s\S]*?<\/div>/g, ' '))
}

/**
 * A rating on the platform's own scale, restated out of five: a platform scoring out of ten gives 9
 * for 4.5 stars. Returns `NaN` for anything that is not a rating between one and the scale's top.
 */
function normalizeRating(rawRating, rawMaximum) {
  const rating = Number(rawRating)
  const maximum = rawMaximum === undefined ? RATING_SCALE : Number(rawMaximum)
  if (!(maximum > 0) || !(rating >= 1 && rating <= maximum)) return Number.NaN

  return Math.round((rating / maximum) * RATING_SCALE * 100) / 100
}

/** A Unix timestamp in seconds as a `YYYY-MM-DD` calendar day in UTC, or `undefined` when unreadable. */
function calendarDay(rawTime) {
  const seconds = Number(rawTime)
  if (!Number.isFinite(seconds) || rawTime === undefined) return undefined

  return new Date(seconds * 1000).toISOString().slice(0, 10)
}

/**
 * Splits widget HTML into the reviews it carries and the blocks that could not be read.
 *
 * A block is dropped when it lacks a field a review cannot do without, or carries an id that is not
 * safe to use. A rating that is missing, unreadable or outside the platform's scale is a drop:
 * storing one would misstate what the reviewer said. A missing or unparsable timestamp is not: the
 * review is kept without a date rather than lost. An empty name is kept as an anonymous review with
 * no `author`; a missing name element is a drop.
 */
export function parseReviews(html) {
  const blocks = html
    .split(/(?=<div class="ti-review-item)/)
    .filter((segment) => segment.startsWith('<div class="ti-review-item'))

  const reviews = []
  const dropped = []

  for (const block of blocks) {
    const header = block.slice(0, block.indexOf('>') + 1)
    const id = header.match(/data-id="([^"]+)"/)?.[1]
    const rating = normalizeRating(
      header.match(/data-rating="([^"]+)"/)?.[1],
      header.match(/data-max-rating="([^"]+)"/)?.[1]
    )
    const date = calendarDay(header.match(/data-time="([^"]+)"/)?.[1])
    const source = header.match(/source-([A-Za-z]+)/)?.[1] ?? 'Google'
    const name = nameField(block)
    const text = reviewText(block)

    if (!id) {
      dropped.push({ reason: 'no data-id' })
      continue
    }

    if (!REVIEW_ID_PATTERN.test(id)) {
      dropped.push({ id, reason: 'data-id is not a safe file name' })
      continue
    }

    if (name === null) {
      dropped.push({ id, reason: 'no author' })
      continue
    }

    if (!text) {
      dropped.push({ id, reason: 'no review text' })
      continue
    }

    if (Number.isNaN(rating)) {
      dropped.push({ id, reason: 'no readable rating' })
      continue
    }

    const author = capitalizeName(cleanName(name))
    reviews.push({
      id,
      ...(author ? { author } : {}),
      rating,
      source,
      ...(date ? { date } : {}),
      text
    })
  }

  return { reviews, dropped, blockCount: blocks.length }
}

/**
 * The headline rating and count from the widget's "All reviews" header: the figures the live widget
 * shows, totalled across every platform. Each platform has a header of its own beside it, which is
 * skipped. They cover every rating, text or not, so they are larger than the number of review cards
 * the widget carries.
 *
 * Throws a `WidgetRequirementError` for anything it cannot read as a rating out of five and a whole
 * count, because figures that cannot be vouched for must never reach a page.
 */
export function parseSummary(html) {
  const header = html.match(
    /<div class="ti-header-content source-all\b[\s\S]*?(?=<div class="ti-header-content |$)/
  )?.[0]
  if (!header) throw new WidgetRequirementError('no "All reviews" header (ti-header-content source-all)')

  const rawRating = header.match(/<span class="ti-header-rating">\s*([^<]+?)\s*<\/span>/)?.[1]
  const rawCount = header.match(/<span class="ti-header-rating-reviews">\s*([\d,]+)\s+reviews?\s*<\/span>/)?.[1]
  if (rawCount === undefined) {
    throw new WidgetRequirementError('no review count in its "All reviews" header (ti-header-rating-reviews)')
  }

  const rating = Number(rawRating)
  if (rawRating === undefined || !/^\d+(\.\d+)?$/.test(rawRating) || rating < 0 || rating > RATING_SCALE) {
    throw new WidgetRequirementError('no readable rating in its "All reviews" header (ti-header-rating)')
  }

  const count = Number(rawCount.replace(/,/g, ''))
  if (!Number.isInteger(count)) {
    throw new WidgetRequirementError('no readable review count in its "All reviews" header (ti-header-rating-reviews)')
  }

  return { rating, count }
}
