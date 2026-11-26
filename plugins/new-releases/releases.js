'use strict'
// Neuerscheinungen deiner Künstler über MusicBrainz. MusicBrainz erlaubt höchstens eine Anfrage pro Sekunde und verlangt
// einen erkennbaren User-Agent. Ergebnisse bleiben 24 Stunden im Speicher des Plugins, damit nicht bei jedem Öffnen neu gefragt wird.
const $ = id => document.getElementById(id)
const UA = 'Tonwerk-Neuerscheinungen/1.0 (https://github.com/jellystream-app/tonwerk)'
const MB = 'https://musicbrainz.org/ws/2/'
const MAX_ARTISTS = 40, TTL = 24 * 3600 * 1000, DAY = 86400000
const strip = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const norm = s => strip(s).replace(/\s[-–]\s.*$/, '').replace(/[(\[][^)\]]*[)\]]/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const TYPES = { Album: 'Album', EP: 'EP', Single: 'Single' }
let busy = false, last = 0

async function mb(path) {
  const wait = 1100 - (Date.now() - last); if (wait > 0) await new Promise(r => setTimeout(r, wait)); last = Date.now()
  for (let i = 0; i < 3; i++) {
    const r = await tw.fetch(MB + path, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
    if (r.status === 503 || r.status === 429) { await new Promise(x => setTimeout(x, 2500 * (i + 1))); last = Date.now(); continue }
    if (r.status !== 200) throw new Error('MusicBrainz antwortet mit ' + r.status)
    return JSON.parse(r.body)
  }
  throw new Error('MusicBrainz ist gerade überlastet, bitte später erneut versuchen')
}

// Künstler mit den meisten Titeln in der Bibliothek zuerst
function pickArtists(lib) {
  const n = new Map()
  for (const t of lib.tracks) { const a = String(t.albumArtist || t.artist || '').split(',')[0].trim(); if (a) n.set(a, (n.get(a) || 0) + 1 + (t.fav ? 2 : 0)) }
  return [...n].sort((a, b) => b[1] - a[1]).slice(0, MAX_ARTISTS).map(x => x[0])
}
async function lookup(name, own) {
  const s = await mb('artist/?query=' + encodeURIComponent('artist:"' + name.replace(/["\\]/g, '') + '"') + '&fmt=json&limit=5')
  const cands = (s.artists || []).filter(a => (a.score || 0) >= 95 && norm(a.name) === norm(name))
  if (!cands.length) return []
  // Bei gleichnamigen Künstlern gilt der, dessen Veröffentlichungen zu deiner Bibliothek passen
  let best = null
  for (const c of cands.slice(0, 3)) {
    const g = await mb(`release-group?artist=${c.id}&type=album%7Csingle%7Cep&fmt=json&limit=100`)
    const groups = (g['release-groups'] || []).filter(r => r['first-release-date'] && !(r['secondary-types'] || []).length)
    const hit = groups.filter(r => own.has(norm(r.title))).length
    if (!best || hit > best.hit) best = { hit, groups }
    if (cands.length === 1) break
  }
  return best && (best.hit > 0 || cands.length === 1) ? best.groups : []
}
const dateMs = d => { const p = d.split('-').map(Number); return Date.UTC(p[0], (p[1] || 1) - 1, p[2] || 1) }

// Pro Künstler gespeichert: { name: { at, items } }. Wer nicht geladen werden konnte, steht nicht im Speicher und wird beim nächsten Mal erneut versucht.
async function run(force) {
  if (busy) return; busy = true; $('reload').disabled = true
  let failed = 0
  try {
    const lib = await tw.library()
    const own = new Set(lib.albums.map(a => norm(a.title)).concat(lib.tracks.map(t => norm(t.album))).filter(Boolean))
    const ownTracks = new Set(lib.tracks.map(t => norm(t.title)))
    let cache = (await tw.storage.get('artists')) || {}
    const names = pickArtists(lib)
    const todo = names.filter(n => force || !cache[n] || Date.now() - cache[n].at > TTL)
    if (todo.length) {
      const p = $('p'); p.hidden = false; p.max = todo.length
      for (let i = 0; i < todo.length; i++) {
        $('st').textContent = `Prüfe ${todo[i]} (${i + 1} von ${todo.length})`; p.value = i
        try {
          const groups = await lookup(todo[i], own)
          cache[todo[i]] = { at: Date.now(), items: groups.map(r => ({ title: r.title, date: r['first-release-date'], type: r['primary-type'] || '' })) }
          await tw.storage.set('artists', cache)
        } catch (e) { failed++; tw.log(`${todo[i]}: ${e.message}`) }
      }
      p.hidden = true
    }
    const items = []; for (const n of names) if (cache[n]) for (const r of cache[n].items) items.push({ ...r, artist: n })
    show(items, own, ownTracks, failed)
  } catch (e) { $('st').textContent = 'Fehler: ' + e.message; tw.log(e.message) } finally { busy = false; $('reload').disabled = false; $('p').hidden = true }
}
function show(items, own, ownTracks, failed) {
  const days = Number($('range').value), from = Date.now() - days * DAY
  const list = items.filter(r => TYPES[r.type] && dateMs(r.date) >= from && dateMs(r.date) <= Date.now() + 30 * DAY && !own.has(norm(r.title)) && !ownTracks.has(norm(r.title)))
    .sort((a, b) => dateMs(b.date) - dateMs(a.date))
  const head = list.length ? `${list.length} Neuerscheinung${list.length === 1 ? '' : 'en'} in den letzten ${days} Tagen` : ''
  $('st').textContent = head + (failed ? `${head ? ' · ' : ''}${failed} Künstler konnten nicht geprüft werden. „Neu prüfen“ versucht es erneut.` : '')
  $('out').innerHTML = list.length ? list.map(r => `<div class="d"><span class="when">${esc(new Date(dateMs(r.date)).toLocaleDateString('de-DE', r.date.length > 7 ? {} : { month: 'long', year: 'numeric' }))}</span><span><span class="t">${esc(r.title)}</span><br><span class="a">${esc(r.artist)}</span></span><span class="ty">${esc(TYPES[r.type])}</span></div>`).join('') : `<div class="empty">Keine neuen Veröffentlichungen deiner Künstler in diesem Zeitraum.</div>`
}
$('range').onchange = () => run(false); $('reload').onclick = () => run(true)
tw.ready.then(() => run(false))
