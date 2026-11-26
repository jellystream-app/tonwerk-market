'use strict'
const $ = id => document.getElementById(id)
const nf = new Intl.NumberFormat('de-DE')
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const CATS = [
  ['Ohne Genre', t => !t.genres || !t.genres.length],
  ['Ohne Jahr', t => !t.year],
  ['Ohne Album', t => !String(t.album || '').trim()],
  ['Dauer fehlt', t => !t.duration],
  ['Ohne Titelnummer', t => t.album && !t.track],
  ['Dateiendung im Titel', t => /\.(mp3|flac|opus|ogg|m4a|wav|aac)$/i.test(t.title)],
  ['Ohne Künstler', t => !String(t.artist || '').trim() || /^(unbekannt|unknown|various artists)$/i.test(String(t.artist).trim())],
  ['Titel in Großbuchstaben', t => t.title.length > 4 && t.title === t.title.toUpperCase() && /[A-ZÄÖÜ]/.test(t.title)],
]
let tracks = [], sel = -1, hits = []
function render() {
  const total = tracks.length
  $('total').textContent = `${nf.format(total)} Titel geprüft`
  hits = CATS.map(([, f]) => tracks.filter(f))
  $('cats').innerHTML = CATS.map(([n], i) => { const c = hits[i].length, p = total ? c / total * 100 : 0
    return `<button class="cat${c ? '' : ' ok'}" type="button" data-i="${i}" aria-pressed="${sel === i}"><b>${nf.format(c)}</b><span>${esc(n)}</span><i><u style="width:${p.toFixed(1)}%"></u></i></button>` }).join('')
  for (const b of $('cats').querySelectorAll('.cat')) b.onclick = () => { sel = Number(b.dataset.i); render(); list() }
}
function list() {
  const l = hits[sel] || []
  $('bar').hidden = false; $('catname').textContent = `${CATS[sel][0]}: ${nf.format(l.length)}`
  $('rows').innerHTML = l.slice(0, 200).map(t => `<tr><td>${esc(t.title)}</td><td>${esc(t.artist)}</td><td>${esc(t.album)}</td><td>${t.year || ''}</td></tr>`).join('')
  $('more').textContent = l.length > 200 ? `${nf.format(l.length - 200)} weitere im CSV-Export` : ''
}
$('csv').onclick = () => {
  if (sel < 0) return
  const q = c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"'
  tw.save(`check-${CATS[sel][0].toLowerCase().replace(/[^a-zäöüß]+/g, '-')}.csv`, [['Titel', 'Künstler', 'Album', 'Jahr', 'ID'], ...hits[sel].map(t => [t.title, t.artist, t.album, t.year || '', t.id])].map(r => r.map(q).join(';')).join('\n')).catch(e => tw.log('Speichern: ' + e.message))
}
;(async () => { await tw.ready; tracks = (await tw.library()).tracks; render() })().catch(e => { $('total').textContent = 'Bibliothek konnte nicht gelesen werden.'; tw.log(e.message) })
