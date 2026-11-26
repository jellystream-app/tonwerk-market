'use strict'
// Wrapped: wertet den lokalen Hörverlauf aus und zeigt ihn als Folgen aus großen Flächen mit Covern, Bewegung und Hintergrundmusik.
// Genutzt werden nur Daten, die der Benutzer freigegeben hat: Bibliothek, Verlauf und Musik aus der eigenen Bibliothek (library, history, audio).
const $ = id => document.getElementById(id)
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e }
const nf = new Intl.NumberFormat('de-DE')
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches
const DUR = 8000
const PAL = [['#1db954', '#0b1b10'], ['#f4d6ff', '#2a0b3a'], ['#2a1cff', '#e8e6ff'], ['#ff5c39', '#260a02'], ['#101010', '#f1f1f1'], ['#ffd23f', '#241a00'], ['#0f3d3a', '#c9fff2'], ['#ff7ac6', '#2d0720'], ['#e8e8e8', '#111111']]
const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

// ---------- Auswertung ----------
function analyze(events, lib, year) {
  const byId = new Map(lib.tracks.map(t => [t.id, t]))
  // Wiedergaben von YouTube, deren Titel inzwischen in der Bibliothek liegt, finden wir über Titel und Künstler wieder
  const norm = x => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
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
    const lt = lookup(e), d = new Date(e.ts), h = d.getHours(), wd = (d.getDay() + 6) % 7
    hours[h]++; week[wd]++
    const artist = main(e.artist || (lt && lt.artist)), title = e.title || (lt && lt.title) || ''
    if (artist) { const a = artists.get(artist) || { name: artist, plays: 0, sec: 0, tracks: new Map() }; a.plays++; a.sec += secOf(e); artists.set(artist, a) }
    if (title) {
      const key = lt ? lt.id : e.tid
      const t = tracks.get(key) || { id: key, libId: lt ? lt.id : '', title, artist: artist || '', plays: 0, sec: 0, cover: lt ? lt.cover : '', duration: lt ? lt.duration : 0, genres: lt ? (lt.genres || []) : [], hours: Array(24).fill(0), days: Array(7).fill(0) }
      t.plays++; t.sec += secOf(e); t.hours[h]++; t.days[wd]++; tracks.set(key, t)
      if (artist) artists.get(artist).tracks.set(key, t)
    }
    if (lt) for (const g of (lt.genres || []).slice(0, 2)) genres.set(g, (genres.get(g) || 0) + 1)
  }
  const rankBy = (list, n) => list.sort((a, b) => b.plays - a.plays || b.sec - a.sec).slice(0, n)
  const allTracks = [...tracks.values()]
  const bestOf = (list, score) => { let b = null, bs = 0; for (const t of list.filter(x => x.libId)) { const s = score(t); if (s > bs) { bs = s; b = t } } return b }
  const topTracks = rankBy([...allTracks], 9)
  const topArtists = rankBy([...artists.values()], 5).map(a => ({ name: a.name, plays: a.plays, sec: a.sec, cover: artistCover.get(a.name.toLowerCase()) || '', song: bestOf([...a.tracks.values()], t => t.plays) }))
  const peakHour = hours.indexOf(Math.max(...hours)), peakDay = week.indexOf(Math.max(...week))
  const genreList = [...genres].sort((a, b) => b[1] - a[1]).slice(0, 4).map(x => x[0])
  let busiest = null; for (const c of perDay.values()) if (!busiest || c.sec > busiest.sec) busiest = c
  return {
    label: year === 'all' ? 'Alles' : String(year), year,
    plays: plays.length, skips: skips.length, sec, minutes: Math.round(sec / 60),
    topArtists, topTracks, genres: genreList, hours, week, peakHour, peakDay, busiest,
    songHour: bestOf(allTracks, t => t.hours[peakHour]), songDay: bestOf(allTracks, t => t.days[peakDay]),
    songGenre: genreList[0] ? bestOf(allTracks.filter(t => t.genres.includes(genreList[0])), t => t.plays) : null,
    distinctArtists: artists.size, distinctTracks: new Set(plays.map(e => e.tid)).size,
  }
}

// ---------- Bausteine ----------
let cur = null   // Folie, die gerade gebaut wird (für Zähler)
const k = t => el('div', 'k fade', t)
const line = (t, cls) => { const d = el('div', 'ln ' + (cls || '')); d.append(el('span', '', t)); return d }
const big = t => line(t, 'big'), huge = t => line(t, 'huge'), mid = t => line(t, 'mid')
const sm = t => el('div', 'sm fade', t)
function counter(to, fmt) { const f = fmt || (n => nf.format(n)); const e = el('span', 'num', f(to)); cur.counters.push({ e, to, f }); return e }
const withCounter = (to, suffix, cls) => { const d = el('div', 'ln ' + cls); const s = el('span'); s.append(counter(to)); if (suffix) s.append(document.createTextNode(suffix)); d.append(s); return d }
function cover(src, cls, i) { if (!src) return null; const e = el('img', 'cv ' + (cls || '')); e.alt = ''; e.src = src; if (i != null) e.style.setProperty('--i', i); return e }
function stagger(nodes, step = .1, from = 0) { nodes.forEach((n, i) => { if (n) n.style.setProperty('--d', (from + i * step).toFixed(2) + 's') }); return nodes }
function row(i, title, sub, count, img, w, noMeter) {
  const r = el('div', 'row' + (img ? '' : ' nocv')); r.append(el('span', 'n', String(i)))
  if (img) r.append(cover(img, 'th'))
  const m = el('div'); m.append(el('div', 't', title)); if (sub) m.append(el('div', 's', sub)); r.append(m, el('span', 'c', count))
  if (!noMeter) { const mt = el('div', 'meter'); mt.style.setProperty('--w', String(Math.max(.04, w))); r.append(mt) }
  return r
}
const two = (a, b) => { const d = el('div', 'in two'); d.append(a, b); return { two: d } }
const col = (...n) => { const c = el('div', 'col'); n.filter(Boolean).forEach(x => c.append(x)); return c }
const hourWord = h => (h >= 5 && h < 11 ? 'Morgens' : h >= 11 && h < 14 ? 'Mittags' : h >= 14 && h < 18 ? 'Nachmittags' : h >= 18 && h < 23 ? 'Abends' : 'Nachts')
const dateDe = ts => new Date(ts).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })
const fromOf = t => (t && t.duration > 100 ? Math.round(t.duration * .28) : 0)

const imgCache = new Map()
async function image(id, size) {
  if (!/^jf:[0-9a-f]{32}$/i.test(id || '')) return ''
  const key = id + '@' + size; if (imgCache.has(key)) return imgCache.get(key)
  const p = tw.image(id, size).catch(() => ''); imgCache.set(key, p); return p
}
function songLine(t, im) { if (!t) return null; const s = el('div', 'song fade'); const c = cover(im.t[t.id], 'th'); if (c) s.append(c); s.append(el('div', 'sm', `${t.title} · ${t.artist}`)); return s }

// Folien bauen. Jede Folie: Farbe, Inhalt, optional ein Titel aus der Bibliothek, der dazu läuft.
function buildSlides(a, im) {
  const S = []
  const add = (p, track, build) => { const s = { p, track: track && track.libId ? track : null, music: '', from: 0, counters: [] }; cur = s; s.content = build(); S.push(s) }
  const A = a.topArtists, T = a.topTracks, maxH = Math.max(1, ...a.hours), maxW = Math.max(1, ...a.week)
  const top = T[0] || null
  const pool = [...new Map([...T, ...A.map(x => x.song)].filter(t => t && t.libId).map(t => [t.libId, t])).values()]
  const tiles = T.slice(0, 5).map((t, i) => cover(im.t[t.id], 'tile pop', i)).filter(Boolean)

  add(0, top, () => { // Titelfolie
    const left = col(k('Tonwerk Wrapped'), huge(a.label), withCounter(a.plays, ' Wiedergaben', 'mid')); stagger([...left.children], .12)
    if (!tiles.length) return { one: left }
    const fan = el('div', 'fan'); stagger(tiles, .14, .3).forEach(t => fan.append(t)); return two(left, fan)
  })

  add(2, null, () => { // Hörzeit, mit Laufband aus Covern
    const hrs = a.sec / 3600
    const n = [k('Hörzeit'), withCounter(a.minutes, '', 'big'), mid('Minuten'), a.minutes >= 120 ? sm(hrs >= 48 ? `Das sind ${(hrs / 24).toFixed(1).replace('.', ',')} Tage am Stück` : `Das sind ${nf.format(Math.round(hrs))} Stunden`) : null].filter(Boolean)
    stagger(n, .12); const c = col(...n)
    const covers = [...new Set([...T.map(t => im.t[t.id]), ...A.map(x => im.a[x.name])].filter(Boolean))]
    if (covers.length < 3) return { one: c }
    const run = []; while (run.length < 12) run.push(...covers)
    const mq = el('div', 'marq'), inner = el('div'); for (const s of [...run, ...run]) inner.append(cover(s)); mq.append(inner)
    return { one: c, extra: mq }
  })

  if (A[0]) {
    add(1, A[0].song || top, () => { // Künstler
      const left = col(k('Dein Künstler'), huge(A[0].name), withCounter(A[0].plays, ' Wiedergaben', 'mid')); stagger([...left.children], .12)
      const c = cover(im.a[A[0].name], 'hero pop'); if (c) { c.style.setProperty('--r', '3deg'); c.style.setProperty('--d', '.25s') }
      return c ? two(left, c) : { one: left }
    })
    if (A.length > 1) add(3, A[0].song, () => { // Top-Künstler
      const mx = A[0].plays || 1; const rows = A.map((x, i) => row(i + 1, x.name, '', nf.format(x.plays), im.a[x.name], x.plays / mx))
      stagger(rows, .11, .15); const r = el('div', 'rank'); rows.forEach(x => r.append(x)); return { one: col(k('Deine Top-Künstler'), r) }
    })
  }
  if (T[0]) {
    add(5, T[0], () => { // Titel
      const cnt = withCounter(T[0].plays, ' Wiedergaben', 'mid'); cnt.style.opacity = '.8'
      const left = col(k('Dein Titel'), huge(T[0].title), mid(T[0].artist), cnt); stagger([...left.children], .12)
      const c = cover(im.t[T[0].id], 'hero pop'); if (c) { c.style.setProperty('--r', '-3deg'); c.style.setProperty('--d', '.25s') }
      return c ? two(left, c) : { one: left }
    })
    if (T.length > 1) add(7, T[0], () => { // Top-Titel
      const mx = T[0].plays || 1; const rows = T.slice(0, 5).map((x, i) => row(i + 1, x.title, x.artist, nf.format(x.plays), im.t[x.id], x.plays / mx))
      stagger(rows, .11, .15); const r = el('div', 'rank'); rows.forEach(x => r.append(x)); return { one: col(k('Deine Top-Titel'), r) }
    })
  }

  if (a.plays >= 5) {
    add(6, a.songHour || top, () => { // Uhrzeit
      const bars = el('div', 'bars'); a.hours.forEach((n, i) => { const b = el('i', i === a.peakHour ? 'peak' : ''); b.style.setProperty('--i', i); b.style.height = Math.max(2, n / maxH * 100) + '%'; bars.append(b) })
      const lab = el('div', 'hours'); for (let h = 0; h < 24; h++) lab.append(el('span', '', h % 3 === 0 ? String(h) : ''))
      const chart = el('div', 'fade'); chart.append(bars, lab)
      const n = [k('Deine Uhrzeit'), huge(`${a.peakHour} Uhr`), mid(hourWord(a.peakHour)), chart, songLine(a.songHour, im)].filter(Boolean); stagger(n, .12)
      return { one: col(...n) }
    })
    add(8, a.songDay || top, () => { // Wochentag
      const wk = el('div', 'week fade'); a.week.forEach((n, i) => { const c = el('div', i === a.peakDay ? 'top' : ''); const b = el('i'); b.style.setProperty('--i', i); b.style.height = Math.max(2, n / maxW * 100) + '%'; c.append(b, el('span', '', DAYS[i].slice(0, 2))); wk.append(c) })
      const n = [k('Dein Wochentag'), huge(DAYS[a.peakDay]), wk, songLine(a.songDay, im)].filter(Boolean); stagger(n, .12)
      return { one: col(...n) }
    })
  }
  if (a.busiest && a.busiest.sec >= 600) add(3, null, () => { const n = [k('Dein längster Hörtag'), huge(dateDe(a.busiest.ts)), withCounter(Math.round(a.busiest.sec / 60), ' Minuten Musik', 'mid')]; stagger(n, .12); return { one: col(...n) } })
  if (a.genres.length) add(1, a.songGenre || top, () => {
    const w = el('div', 'words'); a.genres.forEach(g => w.append(line(g))); stagger([...w.children], .14, .2)
    return { one: col(k('Deine Genres'), w) }
  })
  if (a.skips > 0) add(2, null, () => { const n = [k('Übersprungen'), withCounter(Math.round(a.skips / (a.skips + a.plays) * 100), ' %', 'big'), mid(`${nf.format(a.skips)} von ${nf.format(a.skips + a.plays)} Titeln hast du weitergeschaltet`)]; stagger(n, .12); return { one: col(...n) } })
  if (a.distinctArtists > 1) add(5, null, () => { const n = [k('Vielfalt'), withCounter(a.distinctArtists, '', 'big'), mid('verschiedene Künstler'), sm(`${nf.format(a.distinctTracks)} verschiedene Titel`)]; stagger(n, .12); return { one: col(...n) } })

  add(4, top, () => { // Abschluss
    const sums = el('div', 'rank')
    ;[[A[0] ? A[0].name : '–', 'Künstler'], [T[0] ? T[0].title : '–', 'Titel'], [`${nf.format(a.minutes)} Minuten`, 'Hörzeit']].forEach(([t, s], i) => sums.append(row(i + 1, t, s, '', null, 1, true)))
    stagger([...sums.children], .12, .4)
    const left = col(k('Dein ' + a.label), huge(a.year === 'all' ? 'Das war dein Verlauf' : 'Das war dein Jahr'), sums); stagger([left.children[0], left.children[1]], .12)
    const imgs = T.map(t => im.t[t.id]).filter(Boolean).slice(0, 9)
    if (imgs.length < 4) return { one: left }
    const g = el('div', 'grid9'); imgs.forEach((s, i) => g.append(cover(s, '', i))); return two(left, g)
  })
  // Musik zuweisen: Folien mit eigenem Titel behalten ihn, die übrigen bekommen reihum einen anderen, nie zweimal denselben direkt hintereinander (wenn es mehr als einen gibt)
  let rot = 0, prev = ''
  for (const s of S) {
    if (!s.track && pool.length) {
      for (let tries = 0; tries < pool.length; tries++) { const t = pool[rot++ % pool.length]; if (t.libId !== prev || pool.length === 1) { s.track = t; break } }
    }
    if (s.track) { s.music = s.track.libId; s.from = fromOf(s.track); prev = s.music }
  }
  return S
}

// ---------- Zusammenfassung als Bild (SVG, eigenständig) ----------
function summarySvg(a, im) {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]))
  const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
  const F = 'Inter, Helvetica, Arial, sans-serif'
  const text = (x, y, s, size, w, o = 1) => `<text x="${x}" y="${y}" font-family="${F}" font-size="${size}" font-weight="${w}" opacity="${o}" fill="#f1f1f1">${esc(s)}</text>`
  const pic = (src, x, y, s) => (src ? `<image href="${src}" x="${x}" y="${y}" width="${s}" height="${s}" preserveAspectRatio="xMidYMid slice"/>` : `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="#262626"/>`)
  let o = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><rect width="1080" height="1920" fill="#101010"/><rect x="0" y="0" width="1080" height="24" fill="#1db954"/>`
  o += text(80, 160, 'TONWERK WRAPPED', 34, 800, .8) + text(80, 360, a.label, 200, 900) + text(80, 440, `${nf.format(a.minutes)} Minuten · ${nf.format(a.plays)} Wiedergaben`, 42, 700, .85)
  o += text(80, 560, 'KÜNSTLER', 28, 800, .7) + pic(a.topArtists[0] && im.a[a.topArtists[0].name], 780, 520, 220)
  a.topArtists.forEach((x, i) => { o += text(80, 640 + i * 70, `${i + 1}`, 42, 900, .6) + text(140, 640 + i * 70, cut(x.name, 24), 42, 800) })
  o += text(80, 1040, 'TITEL', 28, 800, .7) + pic(a.topTracks[0] && im.t[a.topTracks[0].id], 780, 1000, 220)
  a.topTracks.slice(0, 5).forEach((x, i) => { o += text(80, 1120 + i * 70, `${i + 1}`, 42, 900, .6) + text(140, 1120 + i * 70, cut(x.title, 24), 42, 800) })
  a.topTracks.map(t => im.t[t.id]).filter(Boolean).slice(0, 4).forEach((s, i) => { o += pic(s, 30 + i * 255, 1520, 240) })
  if (a.genres.length) o += text(80, 1830, a.genres.slice(0, 3).join('  ·  '), 36, 700, .75)
  return o + '</svg>'
}

// ---------- Ablauf ----------
let all = [], lib = null, years = [], data = null, slides = [], idx = -1, paused = false, timer = null, left = DUR, started = 0, imgs = { a: {}, t: {} }
const S = { sound: true, can: true, id: '' }

function setSlides(a) {
  $('stage').replaceChildren(); slides = []
  const list = a.plays ? buildSlides(a, imgs) : [{ p: 4, music: '', from: 0, counters: [], content: { one: col(line('Noch nichts gehört.', 'huge')) } }]
  for (const s of list) {
    const d = el('section', 'slide'); d.style.background = PAL[s.p][0]; d.style.color = PAL[s.p][1]
    const c = s.content; const inn = c.two || el('div', 'in'); if (c.one) inn.append(c.one); d.append(inn); if (c.extra) d.append(c.extra)
    $('stage').append(d); s.el = d; slides.push(s)
  }
}
function runCounters(s) {
  for (const c of s.counters) c.e.textContent = c.f(REDUCED ? c.to : 0)
  if (REDUCED || !s.counters.length) return
  const t0 = performance.now(); cancelAnimationFrame(s.raf)
  const tick = now => { const x = Math.min(1, (now - t0 - 350) / 1500), e = x <= 0 ? 0 : 1 - Math.pow(1 - x, 3); for (const c of s.counters) c.e.textContent = c.f(Math.round(c.to * e)); if (x < 1) s.raf = requestAnimationFrame(tick) }
  s.raf = requestAnimationFrame(tick)
}
function finishCounters(s) { cancelAnimationFrame(s.raf); for (const c of s.counters) c.e.textContent = c.f(c.to) }
function bars(i) {
  const p = $('prog'); p.replaceChildren(); p.classList.toggle('paused', paused)
  slides.forEach((_, n) => { const b = el('b', n < i ? 'done' : n === i && i < slides.length - 1 ? 'cur' : n === i ? 'done' : ''); if (n === i) b.style.setProperty('--dur', left + 'ms'); p.append(b) })
}
function schedule() { clearTimeout(timer); if (paused || idx >= slides.length - 1) return; started = Date.now(); timer = setTimeout(() => show(idx + 1), left) }
function music(s) {
  if (!S.sound || !S.can) return
  const id = s.music; if (!id || id === S.id) return
  S.id = id
  tw.sound.play(id, { from: s.from }).catch(e => { S.id = ''; if (/Berechtigung/.test(e.message)) { S.can = false; $('sound').hidden = true } tw.log('Musik: ' + e.message) })
}
function show(i) {
  const next = Math.max(0, Math.min(slides.length - 1, i)); if (next === idx) return
  const prev = slides[idx]; idx = next; left = DUR
  if (prev) { finishCounters(prev); prev.el.classList.remove('on'); prev.el.classList.add('out'); setTimeout(() => { if (prev !== slides[idx]) prev.el.classList.remove('out') }, 800) }
  const s = slides[idx]; s.el.classList.remove('out'); void s.el.offsetWidth; s.el.classList.add('on'); runCounters(s)
  const [bg, fg] = PAL[s.p]; document.body.style.background = bg; document.documentElement.style.setProperty('--fg', fg); document.body.style.color = fg
  bars(idx); schedule(); music(s)
}
function setPaused(v) {
  if (v === paused) return; paused = v; $('pause').textContent = v ? 'Weiter' : 'Pause'
  if (v) { clearTimeout(timer); left = Math.max(300, left - (Date.now() - started)); $('prog').classList.add('paused') } else { $('prog').classList.remove('paused'); schedule() }
}
function setSound(on) { S.sound = on; $('sound').textContent = on ? 'Ton an' : 'Ton aus'; tw.storage.set('sound', on).catch(() => {}); if (!on) { S.id = ''; tw.sound.stop().catch(() => {}) } else if (slides[idx]) music(slides[idx]) }

async function start(year) {
  $('pick').hidden = true; tw.storage.set('period', String(year)).catch(() => {})
  const a = analyze(all, lib, year)
  // Cover laden (parallel, höchstens 7 Sekunden warten, Fehlendes bleibt einfach weg)
  imgs = { a: {}, t: {} }
  const jobs = []
  a.topArtists.forEach((x, i) => jobs.push(image(x.cover, i === 0 ? 640 : 300).then(d => { if (d) imgs.a[x.name] = d })))
  a.topTracks.forEach((x, i) => jobs.push(image(x.cover, i === 0 ? 640 : 300).then(d => { if (d) imgs.t[x.id] = d })))
  for (const t of [a.songHour, a.songDay]) if (t && t.cover && !a.topTracks.includes(t)) jobs.push(image(t.cover, 300).then(d => { if (d) imgs.t[t.id] = d }))
  await Promise.race([Promise.all(jobs), new Promise(r => setTimeout(r, 7000))])
  data = a; S.id = ''; idx = -1; paused = false; $('pause').textContent = 'Pause'
  S.can = a.plays > 0 && [...a.topTracks, ...a.topArtists.map(x => x.song)].some(t => t && t.libId); $('sound').hidden = !S.can
  setSlides(a); show(0)
}
function pick() {
  clearTimeout(timer); const p = $('pick'); p.replaceChildren(); const inn = el('div', 'in'); inn.append(el('div', 'k', 'Zeitraum'))
  for (const y of [...years, 'all']) { const b = el('button', 'sel', y === 'all' ? 'Alles' : String(y)); b.type = 'button'; b.onclick = () => start(y); inn.append(b) }
  p.append(inn); p.hidden = false; (p.querySelector('button') || p).focus()
}

$('fwd').onclick = () => show(idx + 1); $('back').onclick = () => show(idx - 1)
$('pause').onclick = () => setPaused(!paused); $('period').onclick = pick; $('sound').onclick = () => setSound(!S.sound)
$('save').onclick = async () => { if (!data || !data.plays) return; try { await tw.save(`wrapped-${data.label.toLowerCase()}.svg`, summarySvg(data, imgs)) } catch (e) { tw.log('Speichern: ' + e.message) } }
window.addEventListener('keydown', e => {
  if (!$('pick').hidden) return
  if (e.key === 'ArrowRight') show(idx + 1); else if (e.key === 'ArrowLeft') show(idx - 1)
  else if (e.key === ' ') { e.preventDefault(); setPaused(!paused) }
})

;(async () => {
  await tw.ready
  const [library, events, snd] = await Promise.all([tw.library(), tw.history({ limit: 50000 }), tw.storage.get('sound').catch(() => null)])
  lib = library; all = events; S.sound = snd !== false; $('sound').textContent = S.sound ? 'Ton an' : 'Ton aus'
  years = [...new Set(all.filter(e => e.type !== 'like').map(e => new Date(e.ts).getFullYear()))].sort((a, b) => b - a)
  const saved = await tw.storage.get('period').catch(() => null)
  const ok = saved && (saved === 'all' || years.includes(Number(saved)))
  if (years.length > 1 && !ok) return pick()
  start(ok ? (saved === 'all' ? 'all' : Number(saved)) : (years[0] || 'all'))
})().catch(e => { document.body.append(el('div', 'empty', 'Daten konnten nicht geladen werden.')); tw.log('Fehler: ' + e.message) })
