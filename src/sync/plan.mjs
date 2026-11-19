/**
 * What a sync would change, and whether it is safe to make those changes unattended.
 *
 * Every check guards against the same failure: a widget document that parses cleanly but no longer
 * carries every review, which would otherwise read as reviews withdrawn by their authors and delete
 * them from the site.
 */

/** More removals than a withdrawal or two would explain, in a single run. */
export const MAX_REMOVALS_WITHOUT_FORCE = 5

/** How far the review count may fall against the stored file before a parse looks incomplete. */
export const MINIMUM_RETAINED_SHARE = 0.8

const REVIEW_FIELDS = ['author', 'rating', 'source', 'date', 'text']

function differs(stored, parsed) {
  return REVIEW_FIELDS.some((field) => stored[field] !== parsed[field])
}

/** Reviews matched by id: new ones, ones whose content changed, and ones the widget no longer carries. */
export function planChanges(stored, parsed) {
  const storedById = new Map(stored.map((review) => [review.id, review]))
  const parsedIds = new Set(parsed.map((review) => review.id))

  return {
    added: parsed.filter((review) => !storedById.has(review.id)),
    updated: parsed.filter((review) => storedById.has(review.id) && differs(storedById.get(review.id), review)),
    removed: stored.filter((review) => !parsedIds.has(review.id))
  }
}

function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/** Why the planned changes should not be written, one message per tripped check, or none when they may. */
export function safetyRefusals({ blockCount, droppedCount, removedCount, storedCount, parsedCount }) {
  const refusals = []

  if (blockCount === 0) {
    refusals.push(
      'The widget carries no review cards, so its markup has most likely changed. Run with --force to write ' +
        'it with no reviews.'
    )
  }

  if (droppedCount > 0) {
    refusals.push(
      `${plural(droppedCount, 'review block')} in the widget could not be read, so the widget's markup may have ` +
        'changed. Run with --force to write the reviews that were read and remove the rest.'
    )
  }

  if (removedCount > MAX_REMOVALS_WITHOUT_FORCE) {
    refusals.push(
      `This run would remove ${plural(removedCount, 'review')}, more than the ${MAX_REMOVALS_WITHOUT_FORCE} a ` +
        "withdrawal or two explains: check the widget's review limit and filters in Trustindex. " +
        'Run with --force if they really have gone.'
    )
  }

  const floor = Math.floor(storedCount * MINIMUM_RETAINED_SHARE)
  if (storedCount > 0 && parsedCount < floor) {
    refusals.push(
      `The widget carries ${plural(parsedCount, 'review')} against the ${storedCount} stored, below the ${floor} ` +
        'that looks like a complete widget. Run with --force to write it anyway.'
    )
  }

  return refusals
}
