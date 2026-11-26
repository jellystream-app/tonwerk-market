// Reine Plugin-Hilfen ohne Electron: Manifest- und Paketprüfung, Theme-Filter, Netzwerkregeln
const path = require('path')
const zlib = require('zlib')
const dns = require('dns').promises
const net = require('net')
const API = 1
const ID_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/
const HOST_RE = /^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/
const SIMPLE_PERMS = new Set(['events', 'lyrics', 'source', 'library', 'history', 'player', 'control', 'audio'])
const ALLOWED_EXT = new Set(['.js', '.css', '.json', '.md', '.txt', '.svg', '.html'])
const MAX_FILE = 1024 * 1024, MAX_TOTAL = 3 * 1024 * 1024

// ---------- Paket und Manifest ----------
function parseManifest(m) {
  if (!m || typeof m !== 'object') throw new Error('plugin.json fehlt oder ist ungültig')
  const s = (k, max, req = true) => { const v = m[k]; if (v == null || v === '') { if (req) throw new Error(`plugin.json: „${k}“ fehlt`); return '' } if (typeof v !== 'string' || v.length > max) throw new Error(`plugin.json: „${k}“ ungültig`); return v }
  const id = s('id', 40); if (!ID_RE.test(id)) throw new Error('plugin.json: „id“ muss aus Kleinbuchstaben, Ziffern und Bindestrichen bestehen (3 bis 40 Zeichen)')
  const version = s('version', 20); if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('plugin.json: „version“ muss wie 1.0.0 aussehen')
  if (m.api !== API) throw new Error(`Dieses Plugin braucht Plugin-API ${m.api}, Tonwerk unterstützt API ${API}`)
  const perms = Array.isArray(m.permissions) ? m.permissions : []
  for (const p of perms) {
    if (typeof p !== 'string') throw new Error('plugin.json: Berechtigung ungültig')
    if (p.startsWith('network:')) { if (!HOST_RE.test(p.slice(8))) throw new Error(`plugin.json: ungültiger Host „${p.slice(8)}“ (nur Domainnamen, keine IP-Adressen oder Platzhalter)`) }
    else if (!SIMPLE_PERMS.has(p)) throw new Error(`plugin.json: unbekannte Berechtigung „${p}“`)
  }
  const main = m.main == null ? '' : String(m.main); const theme = m.theme == null ? '' : String(m.theme)
  const okPath = (f, ext) => !(f.includes('..') || f.startsWith('/') || f.includes('\\') || path.extname(f) !== ext || path.posix.basename(f).startsWith('__'))
  if (main && !okPath(main, '.js')) throw new Error('plugin.json: „main“ muss eine .js-Datei mit relativem Pfad sein')
  if (theme && !okPath(theme, '.css')) throw new Error('plugin.json: „theme“ muss eine .css-Datei mit relativem Pfad sein')
  if (m.pages != null && !Array.isArray(m.pages)) throw new Error('plugin.json: „pages“ muss eine Liste sein')
  if ((m.pages || []).length > 5) throw new Error('plugin.json: höchstens 5 Seiten')
  const seenPages = new Set()
  const pages = (m.pages || []).map(x => {
    if (!x || typeof x !== 'object' || !/^[a-z0-9][a-z0-9-]{0,30}$/.test(x.id || '')) throw new Error('plugin.json: Seiten-ID ungültig (Kleinbuchstaben, Ziffern, Bindestriche)')
    if (typeof x.title !== 'string' || !x.title.trim() || x.title.length > 30) throw new Error('plugin.json: Seitentitel fehlt oder ist länger als 30 Zeichen')
    if (typeof x.file !== 'string' || !okPath(x.file, '.html')) throw new Error(`plugin.json: Seite „${x.id}“ braucht eine .html-Datei mit relativem Pfad`)
    if (seenPages.has(x.id)) throw new Error(`plugin.json: Seiten-ID „${x.id}“ doppelt`)
    seenPages.add(x.id); return { id: x.id, title: x.title.trim(), file: x.file }
  })
  if (!main && !theme && !pages.length) throw new Error('plugin.json: „main“, „theme“ oder „pages“ angeben')
  const settings = (Array.isArray(m.settings) ? m.settings : []).map(x => {
    if (!x || !/^[a-zA-Z][a-zA-Z0-9_]{0,30}$/.test(x.key || '') || typeof x.label !== 'string') throw new Error('plugin.json: Einstellung ungültig')
    const type = ['text', 'password', 'toggle', 'select'].includes(x.type) ? x.type : 'text'
    return { key: x.key, label: x.label.slice(0, 80), type, options: type === 'select' ? (x.options || []).map(String).slice(0, 30) : undefined, default: x.default }
  })
  return { id, name: s('name', 60), version, description: s('description', 300, false), author: s('author', 80, false), license: s('license', 40, false), homepage: s('homepage', 200, false), api: API, main, theme, pages, permissions: [...new Set(perms)], settings }
}
function readPackage(buf) {
  let j; try { j = JSON.parse(zlib.gunzipSync(buf, { maxOutputLength: 8 * 1024 * 1024 }).toString('utf8')) } catch { throw new Error('Keine gültige .twplugin-Datei') }
  const manifest = parseManifest(j.manifest)
  const files = {}; let total = 0
  for (const [name, text] of Object.entries(j.files || {})) {
    if (typeof text !== 'string' || name.includes('..') || name.startsWith('/') || name.includes('\\') || name === 'plugin.json' || path.posix.basename(name).startsWith('__') || !ALLOWED_EXT.has(path.extname(name))) throw new Error(`Datei „${name}“ ist nicht erlaubt`)
    if (text.length > MAX_FILE) throw new Error(`Datei „${name}“ ist zu groß`)
    total += text.length; if (total > MAX_TOTAL) throw new Error('Plugin ist zu groß')
    files[name] = text
  }
  for (const f of [manifest.main, manifest.theme, ...manifest.pages.map(x => x.file)]) if (f && !(f in files)) throw new Error(`Datei „${f}“ fehlt im Paket`)
  return { manifest, files }
}
// Theme-CSS: nur Darstellung, keine Nachladeversuche
function cleanCss(css) {
  // Erst normalisieren (Kommentare raus, CSS-Escapes wie \72 auflösen), dann prüfen. So helfen Verschleierungen nicht.
  const flat = String(css)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\\([0-9a-f]{1,6})\s?/gi, (_, h) => { const c = parseInt(h, 16); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : '' })
    .replace(/\\(.)/g, '$1')
  if (/@import|@font-face|@namespace|expression\s*\(|javascript:|vbscript:|behavior\s*:|-moz-binding/i.test(flat)) throw new Error('Theme enthält nicht erlaubte Anweisungen (@import, @font-face, javascript:, …)')
  if (/(^|[^a-z-])(image-set|image|cross-fade|element|paint|src)\s*\(/i.test(flat)) throw new Error('Theme enthält nicht erlaubte Funktionen (image, image-set, cross-fade, src, …)')
  for (const m of flat.matchAll(/url\(\s*([^)]*)\)/gi)) if (!/^['"]?data:image\/(png|jpeg|gif|webp|svg\+xml)[;,]/i.test(m[1].trim())) throw new Error('Theme darf nur eingebettete Bilder (data:) verwenden')
  if (/[<>]/.test(flat.replace(/data:image\/svg\+xml[^)]*/gi, ''))) throw new Error('Theme enthält nicht erlaubte Zeichen')
  return css
}

// ---------- Netzwerk: nur freigegebene Hosts, nur https, keine internen Adressen ----------
const isPrivateIp = ip => {
  if (net.isIPv6(ip)) { const l = ip.toLowerCase(); return l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l.startsWith('::ffff:') ? (l.startsWith('::ffff:') ? isPrivateIp(l.slice(7)) : true) : l === '::' }
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
}
async function checkUrl(grants, url) {
  let u; try { u = new URL(url) } catch { throw new Error('Ungültige Adresse') }
  if (u.protocol !== 'https:') throw new Error('Nur https-Adressen sind erlaubt')
  if (u.username || u.password) throw new Error('Adressen mit Zugangsdaten sind nicht erlaubt')
  if (net.isIP(u.hostname)) throw new Error('IP-Adressen sind nicht erlaubt')
  const hosts = grants.filter(p => p.startsWith('network:')).map(p => p.slice(8))
  if (!hosts.some(h => u.hostname === h || u.hostname.endsWith('.' + h))) throw new Error(`Zugriff auf „${u.hostname}“ ist nicht freigegeben`)
  const addrs = await dns.lookup(u.hostname, { all: true }).catch(() => { throw new Error('Host nicht gefunden') })
  if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) throw new Error('Interne Adressen sind nicht erlaubt')
  return u
}
const FORBIDDEN_H = /^(host|cookie|origin|referer|content-length|connection|transfer-encoding|proxy-.*|sec-.*)$/i
async function guardedFetch(grants, url, opts = {}, { maxBytes = 5 * 1024 * 1024, stream = false } = {}) {
  let cur = url
  const headers = {}; for (const [k, v] of Object.entries(opts.headers || {})) if (!FORBIDDEN_H.test(k)) headers[k] = String(v)
  const method = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'].includes(String(opts.method || 'GET').toUpperCase()) ? String(opts.method || 'GET').toUpperCase() : 'GET'
  for (let hop = 0; hop < 4; hop++) {
    const u = await checkUrl(grants, cur)
    const r = await fetch(u.href, { method, headers, body: method === 'GET' || method === 'HEAD' ? undefined : (opts.body == null ? undefined : String(opts.body).slice(0, 1024 * 1024)), redirect: 'manual', signal: AbortSignal.timeout(stream ? 30000 : 15000) })
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { cur = new URL(r.headers.get('location'), u).href; continue }
    if (stream) return r
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > maxBytes) throw new Error('Antwort ist zu groß')
    return { status: r.status, headers: { 'content-type': r.headers.get('content-type') || '' }, body: buf.toString('utf8') }
  }
  throw new Error('Zu viele Weiterleitungen')
}

module.exports = { util: { API, ID_RE, ALLOWED_EXT, readPackage, parseManifest, cleanCss, isPrivateIp, checkUrl, guardedFetch } }
