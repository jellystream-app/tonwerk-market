// Hörprotokoll: zeigt die Ereignis-API. Berechtigung "events" ist nötig.
tw.on('track:start', ({ track }) => {
  tw.log('Start:', track.artist, '–', track.title)
})

tw.on('track:end', ({ track, played, completed }) => {
  const min = Number(tw.settings.get().minSeconds) || 30
  if (played < min) return tw.log('Übersprungen nach', played, 's:', track.title)
  tw.log(completed ? 'Fertig gehört:' : 'Teilweise gehört:', track.title, `(${played} s)`)
})

tw.on('favorite', ({ track, on }) => {
  tw.log(on ? 'Favorit hinzugefügt:' : 'Favorit entfernt:', track.title)
})
