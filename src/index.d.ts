import type { Loader } from 'astro/loaders'
import type { z } from 'astro/zod'

/** A review as a site reads it: what the sync stored, plus its position in `featured.json`, if any. */
export declare const ReviewSchema: z.ZodObject<{
  author: z.ZodOptional<z.ZodString>
  rating: z.ZodNumber
  source: z.ZodString
  date: z.ZodOptional<z.ZodString>
  text: z.ZodString
  featured: z.ZodOptional<z.ZodNumber>
}>

export type Review = z.output<typeof ReviewSchema>

/** The headline figures from the widget's "All reviews" header, and the day they were synced. */
export declare const ReviewSummarySchema: z.ZodObject<{
  rating: z.ZodNumber
  count: z.ZodNumber
  fetched: z.ZodString
}>

export type ReviewSummary = z.output<typeof ReviewSummarySchema>

/** The id of the one entry in the review summary collection. */
export declare const REVIEW_SUMMARY_ID: 'summary'

/** One entry per synced review, keyed by its Trustindex id. */
export declare function reviewsLoader(): Loader & { schema: typeof ReviewSchema }

/** A single entry, `REVIEW_SUMMARY_ID`, holding the headline figures. */
export declare function reviewSummaryLoader(): Loader & { schema: typeof ReviewSummarySchema }

/** The fields the selection helpers read, so they accept collection entries or plain objects. */
export interface SelectableReview {
  data: { date?: string; featured?: number }
}

/** Newest first; a review with no date sorts last. */
export declare function sortNewestFirst<T extends SelectableReview>(reviews: T[]): T[]

/**
 * Featured reviews first, in their `featured` order, then the newest of the rest until `limit` is
 * reached. Featuring more than `limit` shows only the featured ones.
 */
export declare function selectFeaturedReviews<T extends SelectableReview>(reviews: T[], limit: number): T[]

/** "2026-07-06" as "6 July 2026". */
export declare function formatReviewDate(date: string): string
