/**
 * Content loaders serving the synced reviews to an Astro site, so pages read them through the content
 * layer like any other collection, on prerendered and on-demand routes alike.
 */
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_DIRECTORY,
  FEATURED_FILE,
  missingFeatured,
  readFeatured,
  readReviewsFile,
  REVIEWS_FILE
} from './files.mjs'
import { ReviewSchema, ReviewSummarySchema } from './schemas.mjs'

/** The id of the one entry in the review summary collection. */
export const REVIEW_SUMMARY_ID = 'summary'

function reviewsDirectoryOf(context) {
  return fileURLToPath(new URL(`${DEFAULT_DIRECTORY}/`, context.config.root))
}

/** Reloads in dev whenever either review file is created, changed or deleted. */
function watchReviewFiles(context, reload) {
  const { watcher } = context
  if (!watcher) return

  const directory = reviewsDirectoryOf(context)
  const paths = [join(directory, REVIEWS_FILE), join(directory, FEATURED_FILE)]
  watcher.add(paths)

  for (const event of ['add', 'change', 'unlink']) {
    watcher.on(event, async (changedPath) => {
      if (paths.includes(changedPath)) await reload()
    })
  }
}

async function loadReviews(context) {
  const directory = reviewsDirectoryOf(context)
  const file = await readReviewsFile(directory)
  const featuredIds = await readFeatured(directory)
  const reviews = file?.reviews ?? []

  const missing = missingFeatured(featuredIds, reviews)
  if (missing.length > 0) {
    throw new Error(
      `featured.json lists ${missing.map((id) => `"${id}"`).join(', ')}, which no synced review has. ` +
        'The review was most likely withdrawn by its author: pick a replacement in featured.json.'
    )
  }

  if (!file) context.logger.info('No reviews.json yet: run `astro-reviews sync` to fetch the reviews.')

  context.store.clear()
  for (const [order, review] of reviews.entries()) {
    const position = featuredIds.indexOf(review.id)
    const { id, ...fields } = review
    const data = position === -1 ? { ...fields, order } : { ...fields, order, featured: position + 1 }

    context.store.set({ id, data: await context.parseData({ id, data }), digest: context.generateDigest(data) })
  }
}

async function loadSummary(context) {
  const file = await readReviewsFile(reviewsDirectoryOf(context))

  context.store.clear()
  if (!file) return

  const data = { ...file.summary, fetched: file.fetched }
  context.store.set({
    id: REVIEW_SUMMARY_ID,
    data: await context.parseData({ id: REVIEW_SUMMARY_ID, data }),
    digest: context.generateDigest(data)
  })
}

/**
 * One entry per synced review, keyed by its Trustindex id. Fails the build when `featured.json` lists
 * a review that no longer exists, so a site cannot deploy with a featured slot pointing at a
 * withdrawn review.
 */
export function reviewsLoader() {
  return {
    name: 'astro-reviews:reviews',
    schema: ReviewSchema,
    async load(context) {
      await loadReviews(context)
      watchReviewFiles(context, () => loadReviews(context))
    }
  }
}

/** A single entry, `REVIEW_SUMMARY_ID`, holding the headline rating and count and the day they were synced. */
export function reviewSummaryLoader() {
  return {
    name: 'astro-reviews:summary',
    schema: ReviewSummarySchema,
    async load(context) {
      await loadSummary(context)
      watchReviewFiles(context, () => loadSummary(context))
    }
  }
}
