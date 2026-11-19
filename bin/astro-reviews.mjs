#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { runSync } from '../src/sync/run.mjs'

const USAGE = `Usage: astro-reviews sync [options]

Fetches the site's reviews from its Trustindex widget (astroReviews.widgetId in package.json) and
writes them to src/content/reviews/reviews.json. Run it from the site's root, then commit the result.

Options:
  --force   Write the changes even when a safety check refuses them`

const [command, ...commandArguments] = process.argv.slice(2)

if (command === '--help' || command === '-h') {
  console.log(USAGE)
  process.exit(0)
}

if (command !== 'sync') {
  console.error(USAGE)
  process.exit(2)
}

let parsed
try {
  parsed = parseArgs({
    args: commandArguments,
    options: {
      force: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false }
    }
  })
} catch (error) {
  console.error(`${error.message}\n\n${USAGE}`)
  process.exit(2)
}

if (parsed.values.help) {
  console.log(USAGE)
  process.exit(0)
}

// An unexpected failure, such as a file that cannot be written, is reported as its message: a stack
// trace would read as a fault in this package.
try {
  process.exit(await runSync({ siteDirectory: process.cwd(), force: parsed.values.force }))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
