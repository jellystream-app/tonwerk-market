'use strict'
// Wrapped: wertet den lokalen Hörverlauf aus und zeigt ihn als Folgen aus großen Flächen. Es werden nur Daten gelesen, die der Benutzer freigegeben hat (library, history).
const $ = id => document.getElementById(id)
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e }
const nf = new Intl.NumberFormat('de-DE')
const DUR = 7000
// Hintergrund, Schrift je Folie
const PAL = [['#1db954', '#0b1b10'], ['#f4d6ff', '#2a0b3a'], ['#2a1cff', '#e8e6ff'], ['#ff5c39', '#260a02'], ['#101010', '#f1f1f1'], ['#ffd23f', '#241a00'], ['#0f3d3a', '#c9fff2'], ['#ff7ac6', '#2d0720'], ['#e8e8e8', '#111111']]
const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

// ---------- Auswertung ----------
function analyze(events, lib, year) {
  const byId = new Map(lib.tracks.map(t => [t.id, t]))
  // Wiedergaben von YouTube, deren Titel inzwischen in der Bibliothek liegt, finden wir über Titel und Künstler wieder
  const norm = x => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
  const byName = new Map(lib.tracks.map(t => [norm(t.title) + '|' + norm((t.albumArtist || t.artist || '').split(',')[0]), t]))
  const lookup = e => byId.get(e.tid) || byName.get(norm(e.title) + '|' + norm((e.artist || '').split(',')[0])) || null
  const libArtists = new Set(lib.artists.map(a => a.name.toLowerCase()))
  const artistCover = new Map(lib.artists.map(a => [a.name.toLowerCase(), a.cover]))
  // "A, B, C" auf den Künstler aus der Bibliothek zurückführen, sonst der erste Name
  const main = s => { s = String(s || '').trim(); if (!s) return ''; if (libArtists.has(s.toLowerCase())) return s; const parts = s.split(/,\s*/); return parts.find(p => libArtists.has(p.toLowerCase())) || parts[0] }
  const inRange = e => year === 'all' || new Date(e.ts).getFullYear() === Number(year)
  const ev = events.filter(e => e.type !== 'like' && inRange(e))
  const isPlay = e => e.type === 'complete' || (e.type === 'partial' && e.pos >= 30)
  const secOf = e => Math.max(0, Math.min(e.pos || 0, e.dur > 0 ? e.dur : (e.pos || 0)))

  const plays = ev.filter(isPlay), skips = ev.filter(e => e.type === 'skip')
  const sec = ev.reduce((s, e) => s + secOf(e), 0)
  const tracks = new Map(), artists = new Map(), genres = new Map()
  const hours = Array(24).fill(0), week = Array(7).fill(0), perDay = new Map()
  for (const e of ev) { const d = new Date(e.ts); const k = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); const c = perDay.get(k) || { sec: 0, ts: e.ts }; c.sec += secOf(e); perDay.set(k, c) }
  for (const e of plays) {
    const lt = lookup(e), d = new Date(e.ts)
    hours[d.getHours()]++; week[(d.getDay() + 6) % 7]++
    const artist = main(e.artist || (lt && lt.artist)), title = e.title || (lt && lt.title) || ''
    if (artist) { const a = artists.get(artist) || { name: artist, plays: 0, sec: 0 }; a.plays++; a.sec += secOf(e); artists.set(artist, a) }
    if (title) { const t = tracks.get(e.tid) || { id: e.tid, title, artist: artist || '', plays: 0, sec: 0, cover: lt ? lt.cover : '' }; t.plays++; t.sec += secOf(e); tracks.set(e.tid, t) }
    if (lt) for (const g of (lt.genres || []).slice(0, 2)) genres.set(g, (genres.get(g) || 0) + 1)
  }
  const top = (m, n) => [...m.values()].sort((a, b) => b.plays - a.plays || b.sec - a.sec).slice(0, n)
  const topArtists = top(artists, 5).map(a => ({ ...a, cover: artistCover.get(a.name.toLowerCase()) || '' }))
  const peakHour = hours.indexOf(Math.max(...hours)), peakDay = week.indexOf(Math.max(...week))
  let busiest = null; for (const c of perDay.values()) if (!busiest || c.sec > busiest.sec) busiest = c
  return {
    label: year === 'all' ? 'Alles' : String(year), year,
    plays: plays.length, skips: skips.length, sec, minutes: Math.round(sec / 60),
    topArtists, topTracks: top(tracks, 5),
    genres: [...genres].sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]),
    hours, week, peakHour, peakDay, busiest,
    distinctArtists: artists.size, distinctTracks: new Set(plays.map(e => e.tid)).size,
  }
}

// ---------- Bausteine ----------
const k = t => el('div', 'k', t), big = t => el('div', 'big', t), huge = t => el('div', 'huge', t), mid = t => el('div', 'mid', t), sm = t => el('div', 'sm', t)
function row(i, title, sub, count, first) {
  const r = el('div', 'row' + (first ? ' first' : '')); r.append(el('span', 'n', String(i)))
  const mid_ = el('div'); mid_.append(el('div', 't', title)); if (sub) mid_.append(el('div', 's', sub)); r.append(mid_, el('span', 'c', count)); return r
}
const rank = rows => { const d = el('div', 'rank'); rows.forEach(r => d.append(r)); return d }
function cover(src, square) { if (!src) return null; const i = el('img', 'cover' + (square ? ' sq' : '')); i.alt = ''; i.src = src; return i }
function withCover(img, ...texts) { const d = el('div', 'duo'); if (img) d.append(img); const t = el('div'); t.style.display = 'grid'; t.style.gap = '1.6vmin'; texts.forEach(x => t.append(x)); d.append(t); if (!img) d.className = ''; return d }
const hourWord = h => (h >= 5 && h < 11 ? 'Morgens' : h >= 11 && h < 14 ? 'Mittags' : h >= 14 && h < 18 ? 'Nachmittags' : h >= 18 && h < 23 ? 'Abends' : 'Nachts')
const dateDe = ts => new Date(ts).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })

async function image(id, size) {
  if (!/^jf:[0-9a-f]{32}$/i.test(id || '')) return ''
  try { return await tw.image(id, size) } catch { return '' }
}

function buildSlides(a, img) {
  const S = []; const add = (p, ...nodes) => S.push({ p, nodes })
  const maxH = Math.max(1, ...a.hours), maxW = Math.max(1, ...a.week)
  add(0, k('Tonwerk Wrapped'), big(a.label), mid(`${nf.format(a.plays)} Wiedergaben`))

  const hrs = a.sec / 3600
  add(2, k('Hörzeit'), big(nf.format(a.minutes)), mid('Minuten'), a.minutes >= 120 ? sm(hrs >= 48 ? `Das sind ${(hrs / 24).toFixed(1).replace('.', ',')} Tage am Stück` : `Das sind ${nf.format(Math.round(hrs))} Stunden`) : el('span'))

  const A = a.topArtists
  if (A[0]) {
    add(1, k('Dein Künstler'), withCover(cover(img.artist, true), huge(A[0].name), mid(`${nf.format(A[0].plays)} Wiedergaben`)))
    if (A.length > 1) add(3, k('Deine Top-Künstler'), rank(A.map((x, i) => row(i + 1, x.name, '', nf.format(x.plays), i === 0))))
  }
  const T = a.topTracks
  if (T[0]) {
    add(5, k('Dein Titel'), withCover(cover(img.track, true), huge(T[0].title), mid(T[0].artist), sm(`${nf.format(T[0].plays)} Wiedergaben`)))
    if (T.length > 1) add(7, k('Deine Top-Titel'), rank(T.map((x, i) => row(i + 1, x.title, x.artist, nf.format(x.plays), i === 0))))
  }

  if (a.plays >= 5) {
    const bars = el('div', 'bars'); a.hours.forEach((n, i) => { const b = el('i'); b.style.setProperty('--i', i); b.style.height = Math.max(2, n / maxH * 100) + '%'; bars.append(b) })
    const lab = el('div', 'hours'); for (let h = 0; h < 24; h++) lab.append(el('span', '', h % 3 === 0 ? String(h) : ''))
    add(6, k('Deine Uhrzeit'), huge(`${a.peakHour} Uhr`), mid(hourWord(a.peakHour)), (() => { const d = el('div'); d.append(bars, lab); return d })())

    const wk = el('div', 'week'); a.week.forEach((n, i) => { const c = el('div', i === a.peakDay ? 'top' : ''); const b = el('i'); b.style.setProperty('--i', i); b.style.height = Math.max(2, n / maxW * 100) + '%'; c.append(b, el('span', '', DAYS[i].slice(0, 2))); wk.append(c) })
    add(8, k('Dein Wochentag'), huge(DAYS[a.peakDay]), wk)
  }
  if (a.busiest && a.busiest.sec >= 600) add(3, k('Dein längster Hörtag'), huge(dateDe(a.busiest.ts)), mid(`${nf.format(Math.round(a.busiest.sec / 60))} Minuten Musik`))
  if (a.genres.length) { const g = el('div'); a.genres.forEach(x => g.append(el('span', 'pill', x))); add(1, k('Deine Genres'), huge(a.genres[0]), g) }
  if (a.skips > 0) add(2, k('Übersprungen'), big(Math.round(a.skips / (a.skips + a.plays) * 100) + ' %'), mid(`${nf.format(a.skips)} von ${nf.format(a.skips + a.plays)} Titeln hast du weitergeschaltet`))
  if (a.distinctArtists > 1) add(5, k('Vielfalt'), big(nf.format(a.distinctArtists)), mid('verschiedene Künstler'), sm(`${nf.format(a.distinctTracks)} verschiedene Titel`))

  const fin = el('div', 'rank')
  fin.append(row(1, A[0] ? A[0].name : '–', 'Künstler', ''), row(2, T[0] ? T[0].title : '–', 'Titel', ''), row(3, `${nf.format(a.minutes)} Minuten`, 'Hörzeit', ''))
  add(4, k('Dein ' + a.label), huge('Das war dein Jahr'.replace('Jahr', a.year === 'all' ? 'Verlauf' : 'Jahr')), fin)
  return S
}

// ---------- Bild zum Speichern (SVG, eigenständig) ----------
function summarySvg(a, img) {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]))
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
  const F = 'Inter, Helvetica, Arial, sans-serif'
  const text = (x, y, s, size, w, o = 1) => `<text x="${x}" y="${y}" font-family="${F}" font-size="${size}" font-weight="${w}" opacity="${o}" fill="#f1f1f1">${esc(s)}</text>`
  const im = (src, x, y, s) => (src ? `<image href="${src}" x="${x}" y="${y}" width="${s}" height="${s}" preserveAspectRatio="xMidYMid slice"/>` : `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="#262626"/>`)
  let o = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><rect width="1080" height="1920" fill="#101010"/><rect x="0" y="0" width="1080" height="24" fill="#1db954"/>`
  o += text(80, 170, 'TONWERK WRAPPED', 34, 800, .8) + text(80, 400, a.label, 230, 900) + text(80, 490, `${nf.format(a.minutes)} Minuten · ${nf.format(a.plays)} Wiedergaben`, 44, 700, .85)
  o += text(80, 640, 'KÜNSTLER', 30, 800, .7); o += im(img.artist, 760, 600, 240)
  a.topArtists.forEach((x, i) => { o += text(80, 720 + i * 82, `${i + 1}`, 46, 900, .6) + text(150, 720 + i * 82, cut(x.name, 22), 46, 800) })
  o += text(80, 1180, 'TITEL', 30, 800, .7); o += im(img.track, 760, 1140, 240)
  a.topTracks.forEach((x, i) => { o += text(80, 1260 + i * 82, `${i + 1}`, 46, 900, .6) + text(150, 1260 + i * 82, cut(x.title, 22), 46, 800) })
  if (a.genres.length) o += text(80, 1790, a.genres.slice(0, 3).join('  ·  '), 38, 700, .75)
  return o + '</svg>'
}

// ---------- Ablauf ----------
let all = [], lib = null, years = [], cur = null, slides = [], idx = 0, paused = false, timer = null, left = DUR, started = 0, imgs = {}

function setSlides(a) {
  $('stage').replaceChildren(); slides = []
  const list = a.plays ? buildSlides(a, imgs) : [{ p: 4, nodes: [mid('Noch nichts gehört.')] }]
  for (const s of list) {
    const d = el('section', 'slide'); d.style.background = PAL[s.p][0]; d.style.color = PAL[s.p][1]
    const inn = el('div', 'in'); s.nodes.forEach(n => inn.append(n)); d.append(inn); $('stage').append(d); s.el = d; slides.push(s)
  }
}
function bars(i) {
  const p = $('prog'); p.replaceChildren(); p.classList.toggle('paused', paused)
  slides.forEach((_, n) => { const b = el('b', n < i ? 'done' : n === i && i < slides.length - 1 ? 'cur' : n === i ? 'done' : ''); if (n === i) b.style.setProperty('--dur', left + 'ms'); p.append(b) })
}
function schedule() { clearTimeout(timer); if (paused || idx >= slides.length - 1) return; started = Date.now(); timer = setTimeout(() => show(idx + 1), left) }
function show(i, keep) {
  idx = Math.max(0, Math.min(slides.length - 1, i)); if (!keep) left = DUR
  slides.forEach((s, n) => { s.el.classList.toggle('on', n === idx); s.el.setAttribute('aria-hidden', String(n !== idx)) })
  const [bg, fg] = PAL[slides[idx].p]; document.body.style.background = bg; document.documentElement.style.setProperty('--fg', fg)
  bars(idx); schedule()
}
function setPaused(v) {
  if (v === paused) return; paused = v; $('pause').textContent = v ? 'Weiter' : 'Pause'
  if (v) { clearTimeout(timer); left = Math.max(300, left - (Date.now() - started)); $('prog').classList.add('paused') } else { $('prog').classList.remove('paused'); schedule() }
}

async function start(year) {
  $('pick').hidden = true; cur = year; tw.storage.set('period', String(year)).catch(() => {})
  const a = analyze(all, lib, year); cur = a
  const A = a.topArtists[0], T = a.topTracks[0]
  const [ia, it] = await Promise.all([image(A && A.cover, 400), image(T && T.cover, 400)]); imgs = { artist: ia, track: it }
  paused = false; $('pause').textContent = 'Pause'; setSlides(a); show(0)
}
function pick() {
  clearTimeout(timer); const p = $('pick'); p.replaceChildren(); const inn = el('div', 'in'); inn.append(el('div', 'k', 'Zeitraum'))
  for (const y of [...years, 'all']) { const b = el('button', 'sel', y === 'all' ? 'Alles' : String(y)); b.type = 'button'; b.onclick = () => start(y); inn.append(b) }
  p.append(inn); p.hidden = false; (p.querySelector('button') || p).focus()
}

$('fwd').onclick = () => show(idx + 1); $('back').onclick = () => show(idx - 1)
$('pause').onclick = () => setPaused(!paused); $('period').onclick = pick
$('save').onclick = async () => { if (!cur || !cur.plays) return; try { await tw.save(`wrapped-${cur.label.toLowerCase()}.svg`, summarySvg(cur, imgs)) } catch (e) { tw.log('Speichern: ' + e.message) } }
window.addEventListener('keydown', e => {
  if (!$('pick').hidden) return
  if (e.key === 'ArrowRight') show(idx + 1); else if (e.key === 'ArrowLeft') show(idx - 1)
  else if (e.key === ' ') { e.preventDefault(); setPaused(!paused) }
})

;(async () => {
  await tw.ready
  const [library, events] = await Promise.all([tw.library(), tw.history({ limit: 50000 })])
  lib = library; all = events
  years = [...new Set(all.filter(e => e.type !== 'like').map(e => new Date(e.ts).getFullYear()))].sort((a, b) => b - a)
  const saved = await tw.storage.get('period').catch(() => null)
  if (years.length > 1 && !(saved && (saved === 'all' || years.includes(Number(saved))))) return pick()
  start(saved && (saved === 'all' || years.includes(Number(saved))) ? (saved === 'all' ? 'all' : Number(saved)) : (years[0] || 'all'))
})().catch(e => { document.body.append(el('div', 'empty', 'Daten konnten nicht geladen werden.')); tw.log('Fehler: ' + e.message) })
