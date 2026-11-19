/**
 * The two files a site keeps its reviews in:
 *
 * - `reviews.json` belongs to the sync, which rewrites it whole on every run: the reviews and the
 *   headline figures, as fetched.
 * - `featured.json` belongs to people: an ordered list of the review ids a site leads with. The sync
 *   reads it to warn about withdrawn reviews and never writes it.
 *
 * Keeping hand edits out of the sync's file is what lets the sync replace that file outright.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const DEFAULT_DIRECTORY = 'src/content/reviews'
export const REVIEWS_FILE = 'reviews.json'
export const FEATURED_FILE = 'featured.json'

/** Reads a JSON file, or returns `undefined` when it does not exist. */
async function readJSON(path) {
  let text
  try {
    text = await readFile(path, 'utf-8')
  } catch (error) {
    if (error.code === 'ENOENT') return undefined

    throw error
  }

  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`"${path}" is not valid JSON: ${error.message}`, { cause: error })
  }
}

function isReviewsFile(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.fetched === 'string' &&
    typeof value.summary?.rating === 'number' &&
    typeof value.summary?.count === 'number' &&
    Array.isArray(value.reviews)
  )
}

/** The stored reviews file, or `null` before the first sync. */
export async function readReviewsFile(directory) {
  const path = join(directory, REVIEWS_FILE)
  const contents = await readJSON(path)
  if (contents === undefined) return null

  if (!isReviewsFile(contents)) {
    throw new Error(`"${path}" is not a reviews file: it needs "fetched", "summary" and "reviews"`)
  }

  return contents
}

/** The featured review ids in display order, or an empty list when the site features none. */
export async function readFeatured(directory) {
  const path = join(directory, FEATURED_FILE)
  const contents = await readJSON(path)
  if (contents === undefined) return []

  if (!Array.isArray(contents) || !contents.every((id) => typeof id === 'string')) {
    throw new Error(`"${path}" must be a list of review ids, such as ["<review id>", "<review id>"]`)
  }

  const duplicates = contents.filter((id, index) => contents.indexOf(id) !== index)
  if (duplicates.length > 0) {
    throw new Error(`"${path}" lists ${duplicates.map((id) => `"${id}"`).join(', ')} more than once`)
  }

  return contents
}

/** The featured ids that match no review, in the order `featured.json` lists them. */
export function missingFeatured(featuredIds, reviews) {
  const reviewIds = new Set(reviews.map((review) => review.id))

  return featuredIds.filter((id) => !reviewIds.has(id))
}

/** Newest first, undated last, and reviews from the same day in id order, so a sync's diff is stable. */
export function sortReviews(reviews) {
  return [...reviews].sort(
    (first, second) => (second.date ?? '').localeCompare(first.date ?? '') || first.id.localeCompare(second.id)
  )
}

/** One review with its keys in a fixed order, leaving out the optional ones it does not have. */
function orderedReview({ id, author, rating, source, date, text }) {
  return {
    id,
    ...(author === undefined ? {} : { author }),
    rating,
    source,
    ...(date === undefined ? {} : { date }),
    text
  }
}

export function serializeReviewsFile({ fetched, summary, reviews }) {
  const file = {
    fetched,
    summary: { rating: summary.rating, count: summary.count },
    reviews: sortReviews(reviews).map(orderedReview)
  }

  return `${JSON.stringify(file, null, 2)}\n`
}

/**
 * Writes `reviews.json` through a temporary file renamed over it, so an interrupted run leaves either
 * the previous file or the new one, never a partial one.
 */
export async function writeReviewsFile(directory, file) {
  await mkdir(directory, { recursive: true })

  const path = join(directory, REVIEWS_FILE)
  const temporaryPath = `${path}.${process.pid}.tmp`
  await writeFile(temporaryPath, serializeReviewsFile(file))
  await rename(temporaryPath, path)
}
