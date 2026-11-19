/** The sync fetches the widget document the way a visitor's browser would, so it presents as one. */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'

/**
 * The widget's content document. Trustindex serves it `max-age=43200, immutable`, so a CDN edge keeps
 * serving a stale copy for half a day after an update; the cache-busting parameter makes a sync see
 * what has actually been published. The CDN shards widgets by the id's first two characters.
 */
export function widgetContentURL(widgetId, { now = Date.now() } = {}) {
  const url = new URL(`https://cdn.trustindex.io/widgets/${widgetId.slice(0, 2)}/${widgetId}/content.html`)
  url.searchParams.set('cache-bust', String(now))

  return url
}

class ClientError extends Error {}

/**
 * Fetches the widget document, retrying a network error, a timeout or a 5xx but never a 4xx, which
 * will not improve on a retry. Without a timeout a stalled response holds the command open for
 * minutes before the HTTP client gives up.
 */
export async function fetchWidget(
  url,
  { fetch = globalThis.fetch, attempts = 3, timeoutMs = 20_000, retryDelayMs = 1000, warn = console.warn } = {}
) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': USER_AGENT, 'cache-control': 'no-cache' },
        signal: AbortSignal.timeout(timeoutMs)
      })

      if (response.ok) return await response.text()
      if (response.status < 500)
        throw new ClientError(`Failed to fetch the Trustindex widget (HTTP ${response.status})`)

      warn(`Attempt ${attempt}/${attempts} failed with HTTP ${response.status}`)
    } catch (error) {
      if (error instanceof ClientError) throw error

      warn(`Attempt ${attempt}/${attempts} failed: ${error.message}`)
    }

    if (attempt < attempts) await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * retryDelayMs))
  }

  throw new Error(`Failed to fetch the Trustindex widget after ${attempts} attempts`)
}
