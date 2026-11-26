#!/usr/bin/env node
// Baut alle Pakete aus plugins/<id>/ nach dist/ und erzeugt index.json neu.
// Die Prüfung ist dieselbe wie in Tonwerk (scripts/plugins_util.js ist eine Kopie von main/plugins_util.js).
//   node scripts/build.mjs           baut dist/ und index.json
//   node scripts/build.mjs --check   prüft nur, schreibt nichts
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { util: U } = require('./plugins_util.js')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const checkOnly = process.argv.includes('--check')
const die = m => { console.error('Fehler: ' + m); process.exit(1) }

function readPlugin(dir) {
  const mf = path.join(dir, 'plugin.json')
  if (!fs.existsSync(mf)) die('plugin.json fehlt in ' + dir)
  const manifest = U.parseManifest(JSON.parse(fs.readFileSync(mf, 'utf8')))
  if (manifest.id !== path.basename(dir)) die(`Ordnername und id passen nicht zusammen: ${dir}`)
  for (const k of ['description', 'author', 'license']) if (!manifest[k]) die(`${manifest.id}: „${k}“ fehlt`)
  const files = {}
  const walk = d => {
    for (const n of fs.readdirSync(d).sort()) {
      const f = path.join(d, n), rel = path.relative(dir, f).split(path.sep).join('/')
      if (n.startsWith('.') || n === 'node_modules' || rel === 'plugin.json' || n.endsWith('.twplugin')) continue
      if (fs.statSync(f).isDirectory()) walk(f)
      else if (U.ALLOWED_EXT.has(path.extname(n))) files[rel] = fs.readFileSync(f, 'utf8')
      else die(`${manifest.id}/${rel}: Dateityp nicht erlaubt`)
    }
  }
  walk(dir)
  return { manifest, files }
}

const ids = fs.readdirSync(path.join(root, 'plugins')).filter(n => fs.statSync(path.join(root, 'plugins', n)).isDirectory() && !n.startsWith('.')).sort()
if (!ids.length) die('keine Plugins in plugins/')
const built = []
for (const id of ids) {
  try {
    const { manifest: m, files } = readPlugin(path.join(root, 'plugins', id))
    if (m.theme) U.cleanCss(files[m.theme])
    const buf = zlib.gzipSync(Buffer.from(JSON.stringify({ manifest: m, files })))
    U.readPackage(buf)
    built.push({ m, buf, files: Object.keys(files).length })
  } catch (e) { die(`${id}: ${e.message}`) }
}
if (checkOnly) { for (const b of built) console.log(`OK  ${b.m.id} ${b.m.version}  [${b.m.permissions.join(', ') || 'keine Berechtigungen'}]`); process.exit(0) }

fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true })
fs.mkdirSync(path.join(root, 'dist'))
const plugins = built.map(({ m, buf, files }) => {
  const name = `${m.id}-${m.version}.twplugin`
  fs.writeFileSync(path.join(root, 'dist', name), buf)
  console.log(`${name}: ${files} Datei(en), ${buf.length} Bytes`)
  return { id: m.id, name: m.name, version: m.version, description: m.description || '', author: m.author || '', permissions: m.permissions, download: `dist/${name}`, sha256: crypto.createHash('sha256').update(buf).digest('hex') }
})
fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify({ version: 1, plugins }, null, 2) + '\n')
console.log(`index.json: ${plugins.length} Plugin(s)`)
