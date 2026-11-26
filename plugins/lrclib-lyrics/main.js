// Songtext-Quelle. Berechtigungen: "lyrics" und das Netzwerkziel "network:lrclib.net".
// Tonwerk fragt alle Songtext-Plugins nacheinander, der erste Treffer gewinnt.

// "[01:23.45] Zeile" in { t: Sekunden, s: Text } umwandeln
function parseLrc(lrc) {
  const out = []
  for (const line of lrc.split('\n')) {
    const m = /^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/.exec(line)
    if (m) out.push({ t: Number(m[1]) * 60 + Number(m[2]), s: m[3] })
  }
  return out
}

tw.lyrics(async track => {
  const q = new URLSearchParams({ track_name: track.title, artist_name: track.artist.split(',')[0] })
  if (track.duration) q.set('duration', String(track.duration))
  const r = await tw.fetch('https://lrclib.net/api/get?' + q)
  if (r.status !== 200) return null            // null = "keine Ahnung", Tonwerk fragt die nächste Quelle
  const j = JSON.parse(r.body)
  return { synced: j.syncedLyrics ? parseLrc(j.syncedLyrics) : [], plain: j.plainLyrics || '' }
})
