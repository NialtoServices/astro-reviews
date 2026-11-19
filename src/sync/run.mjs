/**
 * One sync: fetch the widget, read it, check the changes are safe, and write `reviews.json`.
 *
 * Every step that can fail does so before anything is written, except the featured check, which runs
 * after: a withdrawn review is gone whatever the site features, so the file is written without it and
 * the run fails to prompt a replacement in `featured.json`.
 */
import { join } from 'node:path'
import { readConfig } from '../config.mjs'
import { DEFAULT_DIRECTORY, missingFeatured, readFeatured, readReviewsFile, writeReviewsFile } from '../files.mjs'
import { fetchWidget, widgetContentURL } from '../trustindex/fetch.mjs'
import { parseReviews, parseSummary } from '../trustindex/parse.mjs'
import { planChanges, safetyRefusals } from './plan.mjs'

function describeReview(review) {
  return `"${review.id}"${review.author ? ` (${review.author})` : ''}`
}

/** Returns the exit code: 0 when the file was written and nothing needs attention, 1 otherwise. */
export async function runSync({
  siteDirectory,
  force = false,
  fetch = globalThis.fetch,
  now = () => new Date(),
  log = console.log,
  error = console.error
}) {
  const reviewsDirectory = join(siteDirectory, DEFAULT_DIRECTORY)

  let widgetHtml, featuredIds, stored
  try {
    const { widgetId } = await readConfig(siteDirectory)
    featuredIds = await readFeatured(reviewsDirectory)
    stored = await readReviewsFile(reviewsDirectory)
    widgetHtml = await fetchWidget(widgetContentURL(widgetId), { fetch, warn: error })
  } catch (failure) {
    error(failure.message)
    return 1
  }

  let summary
  try {
    summary = parseSummary(widgetHtml)
  } catch (failure) {
    error(failure.message)
    return 1
  }

  const { reviews, dropped, blockCount } = parseReviews(widgetHtml)
  const storedReviews = stored?.reviews ?? []
  const { added, updated, removed } = planChanges(storedReviews, reviews)
  const changeLine = `${added.length} added, ${updated.length} updated, ${removed.length} removed`

  for (const drop of dropped)
    error(`Could not read review block ${drop.id ? `"${drop.id}"` : 'with no id'}: ${drop.reason}`)

  const refusals = safetyRefusals({
    blockCount,
    droppedCount: dropped.length,
    removedCount: removed.length,
    storedCount: storedReviews.length,
    parsedCount: reviews.length
  })

  if (refusals.length > 0 && !force) {
    for (const refusal of refusals) error(refusal)
    error(`Nothing was written. This run would have made: ${changeLine}.`)
    for (const review of removed) error(`  would remove ${describeReview(review)}`)
    return 1
  }

  const fetched = now().toISOString().slice(0, 10)
  await writeReviewsFile(reviewsDirectory, { fetched, summary, reviews })
  log(`Reviews: ${changeLine}. Rated ${summary.rating} from ${summary.count} reviews.`)
  for (const review of removed) log(`  removed ${describeReview(review)}`)

  const withdrawnFeatured = missingFeatured(featuredIds, reviews)
  if (withdrawnFeatured.length > 0) {
    for (const id of withdrawnFeatured) {
      error(`Featured review "${id}" is no longer on Trustindex, so its author has likely withdrawn it.`)
    }
    error('Pick a replacement in featured.json: the site will not build while it lists a missing review.')
    return 1
  }

  return 0
}
