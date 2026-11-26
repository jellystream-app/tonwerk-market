'use strict'
const $ = id => document.getElementById(id)
const nf = new Intl.NumberFormat('de-DE')
const strip = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
// "Titel (Remastered 2011)" und "Titel - 2011 Remaster" sind derselbe Titel. "(Part II)" oder "(Live)" bleiben unterschiedlich.
const NOISE = /remaster|version|mono|stereo|deluxe|bonus|edit\b|single|radio/
const nt = s => strip(s).replace(/\s[-–]\s.*(remaster|version|mono|stereo|edit).*$/, '').replace(/[(\[]([^)\]]*)[)\]]/g, (m, x) => (NOISE.test(x) ? ' ' : ' ' + x + ' ')).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const na = s => strip(String(s || '').split(',')[0]).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const dur = s => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '–')
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
let groups = []

function build(tracks) {
  const m = new Map()
  for (const t of tracks) { const k = nt(t.title) + '|' + na(t.albumArtist || t.artist); if (k.startsWith('|')) continue; const l = m.get(k); l ? l.push(t) : m.set(k, [t]) }
  return [...m.values()].filter(l => l.length > 1).map(l => {
    const albums = new Set(l.map(t => strip(t.album).trim()))
    return { tracks: l.sort((a, b) => (a.album || '').localeCompare(b.album || '', 'de')), same: albums.size < l.length, title: l[0].title, artist: l[0].albumArtist || l[0].artist }
  }).sort((a, b) => b.tracks.length - a.tracks.length || a.artist.localeCompare(b.artist, 'de'))
}
function render() {
  const mode = $('mode').value, q = strip($('q').value).trim()
  const list = groups.filter(g => (mode === 'all' || (mode === 'same') === g.same) && (!q || strip(g.title + ' ' + g.artist).includes(q)))
  const extra = list.reduce((s, g) => s + g.tracks.length - 1, 0)
  $('sum').innerHTML = `<div><b>${nf.format(list.length)}</b><span>Gruppen</span></div><div><b>${nf.format(extra)}</b><span>überzählige Titel</span></div>`
  $('list').innerHTML = list.length ? list.slice(0, 300).map(g => `<div class="g"><h3>${esc(g.title)}<small>${esc(g.artist)}</small></h3>${g.tracks.map(t => `<div class="r"><span>${esc(t.album || 'ohne Album')}</span><span>${t.year || '–'}</span><span>${dur(t.duration)}</span><span>${esc(t.src)}</span></div>`).join('')}</div>`).join('') + (list.length > 300 ? `<div class="empty">${list.length - 300} weitere Gruppen. Filtere, um sie zu sehen.</div>` : '') : '<div class="empty">Keine Dubletten gefunden.</div>'
}
$('mode').onchange = render; $('q').oninput = render
$('csv').onclick = () => {
  const q = c => '"' + String(c).replace(/"/g, '""') + '"'
  const rows = [['Titel', 'Künstler', 'Album', 'Jahr', 'Dauer', 'ID']]
  for (const g of groups) for (const t of g.tracks) rows.push([t.title, t.artist, t.album, t.year || '', dur(t.duration), t.id])
  tw.save('dubletten.csv', rows.map(r => r.map(q).join(';')).join('\n')).catch(e => tw.log('Speichern: ' + e.message))
}
;(async () => { await tw.ready; const lib = await tw.library(); groups = build(lib.tracks); render() })().catch(e => { $('list').textContent = 'Bibliothek konnte nicht gelesen werden.'; tw.log(e.message) })
