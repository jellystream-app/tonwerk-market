# Tonwerk Marktplatz

Plugin-Quelle für [Tonwerk](https://github.com/jellystream-app/tonwerk). Das Repo enthält die Quelltexte der Plugins (`plugins/<id>/`), die fertigen Pakete (`dist/*.twplugin`) und den Index (`index.json`), den Tonwerk als Marktplatz liest.

## Quelle in Tonwerk eintragen

In Tonwerk unter **Plugins → Quellen** diese Adresse eintragen:

```
https://raw.githubusercontent.com/jellystream-app/tonwerk-market/main/index.json
```

Danach erscheinen die Plugins im Marktplatz. Bei jeder Installation prüft Tonwerk die SHA-256-Prüfsumme des Pakets und zeigt vorher die Berechtigungen zur Bestätigung an.

## Plugins

| Plugin | Version | Berechtigungen |
|---|---|---|
| `wrapped` – Wrapped | 1.0.0 | `library`, `history` |
| `listenbrainz-scrobbler` – ListenBrainz Scrobbler | 1.0.0 | `events`, `network:listenbrainz.org` |
| `new-releases` – Neuerscheinungen | 1.0.0 | `library`, `network:musicbrainz.org` |
| `duplicate-finder` – Dubletten-Finder | 1.0.0 | `library` |
| `library-check` – Bibliotheks-Check | 1.0.0 | `library` |
| `lrclib-lyrics` – LRCLIB Songtexte | 1.0.0 | `lyrics`, `network:lrclib.net` |
| `flat-contrast` – Hoher Kontrast (Theme) | 1.0.0 | keine |
| `now-playing-log` – Hörprotokoll | 1.0.0 | `events` |

## Neu bauen

```
node scripts/build.mjs           # baut dist/ und index.json
node scripts/build.mjs --check   # prüft nur
```

Die Prüfung ist dieselbe wie in Tonwerk. `scripts/plugins_util.js` ist eine Kopie von `main/plugins_util.js` aus dem Tonwerk-Repository und muss mit ihm aktualisiert werden.

Baut alle Pakete aus `plugins/` nach `dist/` und schreibt `index.json` mit frischen Prüfsummen neu. `dist/` und `index.json` gehören mit ins Repo, weil Tonwerk sie direkt über die RAW-URL lädt.

## Plugin beisteuern

1. Ordner `plugins/<id>/` anlegen (id: Kleinbuchstaben, Ziffern, Bindestriche, 3–40 Zeichen) mit `plugin.json` und `main.js`, `theme.css` und/oder Seiten (`pages`). `description`, `author` und `license` sind Pflicht. Format und API stehen in der Tonwerk-Doku (`docs/PLUGINS.md`).
2. Nur Berechtigungen anfordern, die das Plugin wirklich braucht.
3. `node scripts/build.mjs` ausführen und `plugins/`, `dist/` und `index.json` committen.
4. Bei Änderungen die Version in `plugin.json` erhöhen (`x.y.z`).

## Lizenz

MIT, siehe `LICENSE`.
