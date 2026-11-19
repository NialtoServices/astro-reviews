import { describe, expect, it } from 'vitest'
import { fetchWidget, widgetContentURL } from '../../src/trustindex/fetch.mjs'

const URL_TO_FETCH = new URL('https://cdn.example.com/content.html')

/** A `fetch` stand-in answering each call with the next response in `answers`, recording requests. */
function scriptedFetch(...answers) {
  const requests = []
  const fetch = async (url, options) => {
    requests.push({ url, options })

    const answer = answers[Math.min(requests.length, answers.length) - 1]
    if (answer instanceof Error) throw answer

    return new Response(answer.body ?? '', { status: answer.status })
  }

  return { fetch, requests }
}

const quietly = { retryDelayMs: 0, warn: () => {} }

describe('.widgetContentURL', () => {
  it("is expected to shard by the id's first two characters and bust the cache", () => {
    expect(widgetContentURL('1a2b3c4d5e6f', { now: 123 }).href).toBe(
      'https://cdn.trustindex.io/widgets/1a/1a2b3c4d5e6f/content.html?cache-bust=123'
    )
  })
})

describe('.fetchWidget', () => {
  it('is expected to return the body of a successful response', async () => {
    const { fetch } = scriptedFetch({ status: 200, body: '<div class="ti-widget"></div>' })

    await expect(fetchWidget(URL_TO_FETCH, { fetch, ...quietly })).resolves.toBe('<div class="ti-widget"></div>')
  })

  it('is expected to send a browser user agent and ask for an uncached copy', async () => {
    const { fetch, requests } = scriptedFetch({ status: 200 })
    await fetchWidget(URL_TO_FETCH, { fetch, ...quietly })

    expect(requests[0].options.headers['user-agent']).toMatch(/^Mozilla\/5\.0/)
    expect(requests[0].options.headers['cache-control']).toBe('no-cache')
  })

  describe('with a server error', () => {
    it('is expected to retry and return the next success', async () => {
      const { fetch, requests } = scriptedFetch({ status: 503 }, { status: 200, body: 'ok' })

      await expect(fetchWidget(URL_TO_FETCH, { fetch, ...quietly })).resolves.toBe('ok')
      expect(requests).toHaveLength(2)
    })
  })

  describe('with a network error', () => {
    it('is expected to retry and return the next success', async () => {
      const { fetch } = scriptedFetch(new TypeError('fetch failed'), { status: 200, body: 'ok' })

      await expect(fetchWidget(URL_TO_FETCH, { fetch, ...quietly })).resolves.toBe('ok')
    })
  })

  describe('with a 404', () => {
    it('is expected to fail at once, naming the status', async () => {
      const { fetch, requests } = scriptedFetch({ status: 404 })

      await expect(fetchWidget(URL_TO_FETCH, { fetch, ...quietly })).rejects.toThrow(/HTTP 404/)
      expect(requests).toHaveLength(1)
    })
  })

  describe('with every attempt failing', () => {
    it('is expected to give up after the last attempt', async () => {
      const { fetch, requests } = scriptedFetch({ status: 500 })

      await expect(fetchWidget(URL_TO_FETCH, { fetch, ...quietly })).rejects.toThrow(/after 3 attempts/)
      expect(requests).toHaveLength(3)
    })
  })
})
