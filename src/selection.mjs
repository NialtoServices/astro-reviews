/**
 * Ordering and picking reviews for display. These work on review collection entries, reading only
 * `data.date` and `data.featured`, and are free of `astro:content` so they run anywhere.
 */

/** Newest first; a review with no date sorts last. */
export function sortNewestFirst(reviews) {
  return [...reviews].sort((first, second) => (second.data.date ?? '').localeCompare(first.data.date ?? ''))
}

/**
 * The reviews a band or carousel shows: featured ones first, in their `featured` order, then the
 * newest of the rest until `limit` is reached. Featuring more than `limit` shows only the featured
 * ones, so curation always wins over recency.
 */
export function selectFeaturedReviews(reviews, limit) {
  const sorted = sortNewestFirst(reviews)
  const featured = sorted
    .filter((review) => review.data.featured !== undefined)
    .sort((first, second) => first.data.featured - second.data.featured)
  const latest = sorted.filter((review) => review.data.featured === undefined)

  return [...featured, ...latest].slice(0, Math.max(limit, featured.length))
}

/**
 * Review dates are calendar days with no time zone; formatting them in UTC keeps a date from
 * slipping back a day on a machine west of Greenwich.
 */
const REVIEW_DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC'
})

/** "2026-07-06" as "6 July 2026". */
export function formatReviewDate(date) {
  return REVIEW_DATE_FORMAT.format(new Date(`${date}T00:00:00Z`))
}
