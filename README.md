# @nialto-services/astro-reviews

Brings a business's reviews from its [Trustindex](https://www.trustindex.io) widget into an Astro site as
ordinary content, so pages render them as static HTML with no third-party script, no cookie banner entry and no
layout shift.

A command, `astro-reviews sync`, fetches the widget, reads every review and the headline rating and count, and
writes them to a JSON file you commit. Two content loaders serve that file to the site through
`getCollection` and `getEntry`, and a second, hand-edited file chooses which reviews the site leads with. The
build itself never contacts Trustindex.

## Install

```sh
pnpm add @nialto-services/astro-reviews
```

It needs Astro 7.4 or later and Node 22.12 or later.

## Widget requirements

Trustindex has no review API. The sync reads the same document the widget's embed loads, so **the widget must
be set up in a way the sync can read**. These are hard requirements: a widget that misses one fails the sync
with a message naming what is missing.

1. **The layout must have an "All reviews" header showing the rating and the review count**, totalled across
   every platform the widget collects. The sync takes the site's headline figures from that header and from
   nowhere else. In the widget's markup this is layout 79.

   <!-- TODO(owner): name the layout as the Trustindex dashboard shows it, and where to choose it. -->

2. **The header must show the review count**, not only the rating. Some widgets on the right layout still hide
   it.

   <!-- TODO(owner): name the setting that shows the count in the header. -->

3. **The widget's review limit must be high enough to carry every review.** The sync can only store what the
   widget carries. A widget capped below the number of reviews makes the older ones look withdrawn, and the
   sync's safety checks then refuse the run. Raise the limit whenever the review count approaches it.

   <!-- TODO(owner): name the review limit setting. -->

The figures in the header count every rating, with or without text, while the widget only carries reviews that
have text. So the headline count is usually larger than the number of reviews a site shows, and that is
expected.

## Setting up a site

1. **Find the widget id.** Trustindex's embed snippet loads `https://cdn.trustindex.io/loader.js?<id>`: the id
   is the hash after the `?`, such as `1a2b3c4d5e6f7a8b9c0d1e2f3a4`. Use the id alone, not the URL.

2. **Add it to the site's `package.json`**, with a script for the sync:

   ```json
   "scripts": {
     "sync:reviews": "astro-reviews sync"
   },
   "astroReviews": {
     "widgetId": "1a2b3c4d5e6f7a8b9c0d1e2f3a4"
   }
   ```

   Commit it: the id is public, since it appears in the embed snippet, and committing it lets anyone with a
   clone run the sync.

3. **Run the first sync** from the site's root, and commit the file it writes:

   ```sh
   pnpm sync:reviews
   git add src/content/reviews/reviews.json
   ```

4. **Add the collections** to `src/content.config.ts`:

   ```ts
   import { reviewsLoader, reviewSummaryLoader } from '@nialto-services/astro-reviews'
   import { defineCollection } from 'astro:content'

   const reviews = defineCollection({ loader: reviewsLoader() })
   const reviewSummary = defineCollection({ loader: reviewSummaryLoader() })

   export const collections = { reviews, reviewSummary }
   ```

   The loaders bring their own schemas, so entries are fully typed.

5. **Choose the featured reviews**, if the site leads with some, in `src/content/reviews/featured.json`: a list
   of review ids in the order to show them. The ids are the keys of the entries in `reviews.json`.

   ```json
   ["9f8e7d6c5b4a39281706f5e4d3c2b1a0", "0a1b2c3d4e5f60718293a4b5c6d7e8f9"]
   ```

   A site that features none can leave the file out.

## Using the reviews

Each entry in `reviews` is one review:

| Field      | Notes                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------ |
| `author`   | Absent on an anonymous review: some platforms publish reviews without a name.              |
| `rating`   | Out of five, and may be fractional: ratings on other scales are restated out of five.      |
| `source`   | The platform, as Trustindex names it: `Google`, `Checkatrade`, `Yell` and so on.           |
| `date`     | `YYYY-MM-DD`, when Trustindex gives one.                                                   |
| `text`     | The review's prose, with its line breaks.                                                  |
| `featured` | The review's 1-based position in `featured.json`; absent on a review that is not featured. |

**Render `text` only as text.** Members of the public wrote it. Passed to `set:html` or a Markdown renderer, a
link or raw element in it would render on the site.

The `reviewSummary` collection holds one entry, `REVIEW_SUMMARY_ID`, with `rating`, `count` and `fetched` (the
day the figures were synced). The figures span every platform the widget collects, so copy built from them
should not credit a single one, as in "4.9 from 350 reviews" rather than "4.9 on Google".

The package also exports three helpers that work on review entries:

```ts
import {
  formatReviewDate,
  REVIEW_SUMMARY_ID,
  selectFeaturedReviews,
  sortNewestFirst
} from '@nialto-services/astro-reviews'
import { getCollection, getEntry } from 'astro:content'

const reviews = sortNewestFirst(await getCollection('reviews'))

// Featured reviews first, in their featured.json order, then the newest of the rest up to the limit.
// Featuring more than the limit shows only the featured ones.
const leading = selectFeaturedReviews(reviews, 3)

const summary = await getEntry('reviewSummary', REVIEW_SUMMARY_ID)

formatReviewDate('2026-07-06') // "6 July 2026"
```

## Syncing

Run `pnpm sync:reviews` whenever the reviews should be refreshed, then commit `reviews.json` and deploy. The
sync rewrites that file whole on every run and never touches `featured.json`.

A run:

1. reads the widget id and `featured.json`, and fails at once if either is missing or malformed;
2. fetches the widget, with a cache-busting parameter, because Trustindex's CDN otherwise serves a copy up to
   half a day old;
3. reads the headline figures, failing if the widget does not meet the [requirements](#widget-requirements);
4. reads the reviews and compares them with the stored file;
5. runs the safety checks below;
6. writes `reviews.json` in one go, so a failed run never leaves a partial file;
7. checks that every review in `featured.json` still exists.

### Safety checks

Each of these refuses the run, writes nothing and exits 1, because each looks like a widget that has stopped
carrying every review rather than reviews that have really gone:

- **A review block could not be read**, which usually means Trustindex has changed its markup.
- **More than 5 reviews would be removed** in one run. A withdrawal is one or two at a time; more usually means
  the widget's review limit or filters have changed.
- **Fewer than 80% of the stored reviews came back.**

Once you have checked the widget and the changes are real, run the sync again with `--force` to write exactly
what it planned:

```sh
pnpm sync:reviews --force
```

`--force` cannot override a widget that fails the requirements, because there are no figures to write.

### Withdrawn featured reviews

A review that disappears from the widget has almost always been withdrawn by its author, so the sync removes
it, featured or not. When it was featured, the sync still writes the file but exits 1 naming the review, and
the site's build fails while `featured.json` lists it. Pick a replacement in `featured.json`, and the build
passes again.

## Licence

MIT
