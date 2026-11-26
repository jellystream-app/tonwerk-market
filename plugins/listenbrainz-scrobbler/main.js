// ListenBrainz-Scrobbler. Regel wie bei ListenBrainz üblich: Ein Titel zählt, wenn er mindestens 30 Sekunden lang ist
// und zur Hälfte oder vier Minuten lang gehört wurde. Die Meldung geht mit dem Zeitpunkt des Hörbeginns raus.
const API = 'https://api.listenbrainz.org/1/'
let queue = [], busy = false, bad = false, started = null

const token = () => String(tw.settings.get().token || '').trim()
const meta = t => ({
  artist_name: String(t.artist || '').split(',')[0].trim(),
  track_name: t.title,
  ...(t.album ? { release_name: t.album } : {}),
  additional_info: { media_player: 'Tonwerk', submission_client: 'Tonwerk', ...(t.duration ? { duration: Math.round(t.duration) } : {}) },
})
const counts = (played, duration) => duration >= 30 && played >= Math.min(240, duration / 2)
const persist = () => tw.storage.set('queue', queue.slice(-500)).catch(() => {})

async function post(type, payload) {
  return tw.fetch(API + 'submit-listens', { method: 'POST', headers: { Authorization: 'Token ' + token(), 'Content-Type': 'application/json' }, body: JSON.stringify({ listen_type: type, payload }) })
}
async function flush() {
  if (busy || !queue.length || !token() || bad) return
  busy = true
  try {
    while (queue.length) {
      const batch = queue.slice(0, 50)
      const r = await post('import', batch)
      if (r.status === 200) { queue = queue.slice(batch.length); await persist(); tw.log(`${batch.length} Wiedergabe(n) gesendet`); continue }
      if (r.status === 401) { bad = true; tw.log('Token ungültig. Bitte in den Plugin-Einstellungen prüfen. Wiedergaben bleiben gespeichert.'); break }
      if (r.status === 400) { tw.log('ListenBrainz hat die Meldung abgelehnt (400). Die Wiedergaben werden verworfen: ' + r.body.slice(0, 120)); queue = queue.slice(batch.length); await persist(); continue }
      tw.log(`ListenBrainz antwortet mit ${r.status}, nächster Versuch später`); break
    }
  } catch (e) { tw.log('Senden fehlgeschlagen: ' + e.message) } finally { busy = false }
}

tw.on('track:start', ({ track }) => {
  started = { id: track.id, at: Math.floor(Date.now() / 1000) }
  if (!token() || bad || tw.settings.get().playingNow === false || !track.title || !track.artist) return
  post('playing_now', [{ track_metadata: meta(track) }]).then(r => { if (r.status === 401) { bad = true; tw.log('Token ungültig.') } }).catch(() => {})
})
tw.on('track:end', ({ track, played, duration }) => {
  if (!track.title || !track.artist || !counts(played, duration || track.duration || 0)) return
  const at = started && started.id === track.id ? started.at : Math.floor(Date.now() / 1000) - Math.round(played)
  queue.push({ listened_at: at, track_metadata: meta(track) }); persist(); flush()
})
tw.settings.onChange(() => { bad = false; flush() })
tw.storage.get('queue').then(q => { if (Array.isArray(q)) queue = q; if (queue.length) tw.log(`${queue.length} gespeicherte Wiedergabe(n) gefunden`); flush() }).catch(() => {})
setInterval(flush, 5 * 60 * 1000)
