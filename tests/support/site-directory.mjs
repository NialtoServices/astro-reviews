import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** A fresh temporary directory standing in for a site's root, with an optional `package.json`. */
export async function makeSiteDirectory(manifest) {
  const siteDirectory = await mkdtemp(join(tmpdir(), 'astro-reviews-'))
  if (manifest !== undefined) {
    await writeFile(join(siteDirectory, 'package.json'), JSON.stringify(manifest))
  }

  return siteDirectory
}
