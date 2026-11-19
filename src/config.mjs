import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Trustindex widget ids are short hexadecimal hashes. */
const WIDGET_ID_PATTERN = /^[A-Za-z0-9]+$/

const EXPECTED_FORM = '"astroReviews": { "widgetId": "<id>" }'

/**
 * A site's options, read from `astroReviews` in its package.json so there is no extra config file to
 * keep. The widget id is public (it appears in the site's embed snippet), so it is committed with the
 * site and every clone can sync.
 */
export async function readConfig(siteDirectory) {
  const manifestPath = join(siteDirectory, 'package.json')

  let text
  try {
    text = await readFile(manifestPath, 'utf-8')
  } catch (error) {
    throw new Error(`No package.json in "${siteDirectory}": run astro-reviews from the site's root`, { cause: error })
  }

  let manifest
  try {
    manifest = JSON.parse(text)
  } catch (error) {
    throw new Error(`The site's package.json is not valid JSON: ${error.message}`, { cause: error })
  }

  const widgetId = manifest.astroReviews?.widgetId
  if (widgetId === undefined) {
    throw new Error(`Set astroReviews.widgetId in the site's package.json: ${EXPECTED_FORM}`)
  }

  if (typeof widgetId !== 'string' || !WIDGET_ID_PATTERN.test(widgetId)) {
    throw new Error(
      `astroReviews.widgetId must be the bare widget id, the hash after "loader.js?" in the embed snippet, ` +
        `not a URL: ${EXPECTED_FORM} (found ${JSON.stringify(widgetId)})`
    )
  }

  return { widgetId }
}
