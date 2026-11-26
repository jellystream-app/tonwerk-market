#!/usr/bin/env node
// Baut alle Pakete aus plugins/<id>/ nach dist/ und erzeugt index.json neu.
// Format wie in Tonwerk (main/plugins_util.js): .twplugin = gzip(JSON { manifest, files }).
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ALLOWED = new Set(['.js', '.css', '.json', '.md', '.txt', '.svg'])
const ID_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/
const die = m => { console.error('Fehler: ' + m); process.exit(1) }

const HOST_RE = /^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/
const SIMPLE_PERMS = new Set(['events', 'lyrics', 'source'])

// Wie parseManifest in Tonwerk (main/plugins_util.js): prüft und normalisiert das Manifest (Feldreihenfolge inklusive).
function normalizeManifest(m) {
  const str = (k, max, req = true) => {
    const v = m[k]
    if (v == null || v === '') { if (req) die(`plugin.json: „${k}“ fehlt`); return '' }
    if (typeof v !== 'string' || v.length > max) die(`plugin.json: „${k}“ ungültig`)
    return v
  }
  const id = str('id', 40)
  if (!ID_RE.test(id)) die('plugin.json: ungültige id')
  const version = str('version', 20)
  if (!/^\d+\.\d+\.\d+$/.test(version)) die('plugin.json: version muss wie 1.0.0 aussehen')
  if (m.api !== 1) die(`plugin.json: api muss 1 sein (ist ${m.api})`)
  const perms = Array.isArray(m.permissions) ? m.permissions : []
  for (const p of perms) {
    if (typeof p !== 'string') die('plugin.json: Berechtigung ungültig')
    if (p.startsWith('network:')) { if (!HOST_RE.test(p.slice(8))) die(`plugin.json: ungültiger Host „${p.slice(8)}“`) }
    else if (!SIMPLE_PERMS.has(p)) die(`plugin.json: unbekannte Berechtigung „${p}“`)
  }
  const main = m.main == null ? '' : String(m.main)
  const theme = m.theme == null ? '' : String(m.theme)
  for (const f of [main, theme]) if (f && (f.includes('..') || f.startsWith('/') || !ALLOWED.has(path.extname(f)))) die('plugin.json: ungültiger Dateipfad')
  if (!main && !theme) die('plugin.json: „main“ oder „theme“ angeben')
  const settings = (Array.isArray(m.settings) ? m.settings : []).map(x => {
    if (!x || !/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/.test(x.key || '') || typeof x.label !== 'string') die('plugin.json: Einstellung ungültig')
    const type = ['text', 'password', 'toggle', 'select'].includes(x.type) ? x.type : 'text'
    return { key: x.key, label: x.label.slice(0, 80), type, options: type === 'select' ? (x.options || []).map(String).slice(0, 30) : undefined, default: x.default }
  })
  return { id, name: str('name', 60), version, description: str('description', 300, false), author: str('author', 80, false), license: str('license', 40, false), homepage: str('homepage', 200, false), api: 1, main, theme, permissions: [...new Set(perms)], settings }
}

function readPlugin(dir) {
  const mf = path.join(dir, 'plugin.json')
  if (!fs.existsSync(mf)) die('plugin.json fehlt in ' + dir)
  const manifest = normalizeManifest(JSON.parse(fs.readFileSync(mf, 'utf8')))
  if (manifest.id !== path.basename(dir)) die(`Ordnername und id passen nicht zusammen: ${dir}`)
  const files = {}
  const walk = d => {
    for (const n of fs.readdirSync(d).sort()) {
      const f = path.join(d, n), rel = path.relative(dir, f).split(path.sep).join('/')
      if (n.startsWith('.') || n === 'node_modules' || rel === 'plugin.json' || n.endsWith('.twplugin')) continue
      if (fs.statSync(f).isDirectory()) walk(f)
      else if (ALLOWED.has(path.extname(n))) files[rel] = fs.readFileSync(f, 'utf8')
      else console.warn('übersprungen (Dateityp nicht erlaubt): ' + rel)
    }
  }
  walk(dir)
  return { manifest, files }
}

fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true })
fs.mkdirSync(path.join(root, 'dist'))
const ids = fs.readdirSync(path.join(root, 'plugins')).filter(n => fs.statSync(path.join(root, 'plugins', n)).isDirectory()).sort()
if (!ids.length) die('keine Plugins in plugins/')
const plugins = []
for (const id of ids) {
  const { manifest: m, files } = readPlugin(path.join(root, 'plugins', id))
  const buf = zlib.gzipSync(Buffer.from(JSON.stringify({ manifest: m, files })))
  const name = `${m.id}-${m.version}.twplugin`
  fs.writeFileSync(path.join(root, 'dist', name), buf)
  plugins.push({
    id: m.id, name: m.name, version: m.version, description: m.description || '', author: m.author || '',
    permissions: Array.isArray(m.permissions) ? m.permissions : [],
    download: `dist/${name}`, sha256: crypto.createHash('sha256').update(buf).digest('hex'),
  })
  console.log(`${name}: ${Object.keys(files).length} Datei(en), ${buf.length} Bytes`)
}
fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify({ version: 1, plugins }, null, 2) + '\n')
console.log(`index.json: ${plugins.length} Plugin(s)`)
