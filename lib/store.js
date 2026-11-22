// Purchases, kept in one JSON file on the persistent volume (DATA_DIR). Small shop scale: fine.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

export function createStore(dir) {
  const file = join(dir, 'purchases.json')
  let data = null, queue = Promise.resolve()
  async function load() {
    if (data) return data
    await mkdir(dir, { recursive: true })
    try { data = JSON.parse(await readFile(file, 'utf8')) } catch { data = { purchases: [] } }
    return data
  }
  // writes go one after another, via a temp file, so a crash never leaves half a file
  const save = () => (queue = queue.then(async () => { const tmp = file + '.tmp'; await writeFile(tmp, JSON.stringify(data, null, 1)); await rename(tmp, file) }))
  return {
    async all() { return (await load()).purchases },
    async bySession(id) { return (await load()).purchases.find(p => p.session === id) },
    async byToken(token) { return (await load()).purchases.find(p => p.token === token) },
    async byEmail(email) { return (await load()).purchases.filter(p => p.email === email.toLowerCase()) },
    // idempotent: the thank-you page and the webhook may both report the same payment
    async addOnce(session, fields) {
      const d = await load()
      const found = d.purchases.find(p => p.session === session)
      if (found) return { purchase: found, created: false }
      const purchase = { session, token: randomBytes(24).toString('base64url'), created: new Date().toISOString(), downloads: 0, email_status: 'pending', ...fields }
      d.purchases.push(purchase); await save()
      return { purchase, created: true }
    },
    async update(p, fields) { Object.assign(p, fields); await save(); return p },
  }
}
