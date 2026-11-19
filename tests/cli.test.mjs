import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const run = promisify(execFile)
const COMMAND = fileURLToPath(new URL('../bin/astro-reviews.mjs', import.meta.url))

async function runCommand(argumentsList, cwd = tmpdir()) {
  try {
    const { stdout, stderr } = await run('node', [COMMAND, ...argumentsList], { cwd })
    return { code: 0, output: stdout + stderr }
  } catch (error) {
    return { code: error.code, output: error.stdout + error.stderr }
  }
}

describe('astro-reviews', () => {
  describe('--help', () => {
    it('is expected to exit 0 with the usage', async () => {
      const { code, output } = await runCommand(['--help'])

      expect(code).toBe(0)
      expect(output).toMatch(/Usage: astro-reviews sync/)
    })
  })

  describe('with no command', () => {
    it('is expected to exit 2 with the usage', async () => {
      const { code, output } = await runCommand([])

      expect(code).toBe(2)
      expect(output).toMatch(/Usage: astro-reviews sync/)
    })
  })

  describe('with an unknown command', () => {
    it('is expected to exit 2 with the usage', async () => {
      const { code } = await runCommand(['publish'])

      expect(code).toBe(2)
    })
  })

  describe('sync', () => {
    describe('with an unknown option', () => {
      it('is expected to exit 2 with the usage', async () => {
        const { code, output } = await runCommand(['sync', '--allow-bulk-removal'])

        expect(code).toBe(2)
        expect(output).toMatch(/Usage: astro-reviews sync/)
      })
    })

    describe('outside a site', () => {
      it('is expected to exit 1 naming package.json', async () => {
        const { code, output } = await runCommand(['sync'])

        expect(code).toBe(1)
        expect(output).toMatch(/package\.json/)
      })
    })
  })
})
