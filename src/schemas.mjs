import { z } from 'astro/zod'

/** A review as a site reads it: what the sync stored, plus its position in `featured.json`, if any. */
export const ReviewSchema = z.object({
  /** Absent on an anonymous review: some platforms publish reviews without a name. */
  author: z.string().optional(),

  /**
   * Out of five, and may be fractional: ratings on other scales are restated out of five, so the lowest
   * score on a ten-point platform is 0.5.
   */
  rating: z.number().positive().max(5),

  /** The platform the review was posted on, as Trustindex names it (Google, Checkatrade, Yell). */
  source: z.string(),

  /** The day the review was posted, `YYYY-MM-DD`, when Trustindex gives one. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),

  /**
   * The review's prose, line breaks included. Members of the public wrote it, so it renders only as
   * text: never through Markdown or `set:html`, where a link or raw element in it would render.
   */
  text: z.string(),

  /**
   * The review's 0-based place in `reviews.json`, which lists reviews newest first by exact time.
   * Astro returns a collection's entries sorted by id, so this is what keeps same-day reviews in order.
   */
  order: z.number().int().nonnegative(),

  /** The review's 1-based position in `featured.json`; absent on a review that is not featured. */
  featured: z.number().int().positive().optional()
})

/**
 * The headline figures from the widget's "All reviews" header. They total every platform the widget
 * collects, text or not, so they are larger than the number of reviews, and copy built from them must
 * not name a single platform.
 */
export const ReviewSummarySchema = z.object({
  rating: z.number().min(0).max(5),
  count: z.number().int().nonnegative(),

  /** The day the figures were synced, `YYYY-MM-DD`. */
  fetched: z.string()
})
