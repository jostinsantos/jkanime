# JKAnime – Repo para tu app

Repo adaptado desde el `lib` de tu otra app (scraper de jkanime.net) para que tu app principal lo lea como **repositorio Nuvio**.

## Secciones

| Sección        | Método JS            | Descripción                                      |
|----------------|----------------------|--------------------------------------------------|
| **Home**       | `getHome`            | Hero, últimos animes, donghuas, OVAs, top, recientes |
| **Descubrir**  | `getDiscover` + filtros | Directorio con tipo / estado / orden             |
| **Buscar**     | `search`             | Búsqueda en jkanime                              |
| **Novedades**  | `getNews`            | Últimos episodios / destacados                  |
| **Config**     | campos en `nuvio.json` | URL base + idioma preferido                      |
| Meta / Streams | `getMeta`, `getStreams` | Ficha + servidores del episodio                |

## Archivos

- `nuvio.json` – manifesto del repo (id, capabilities, config)
- `index.js` – lógica de scraping con cheerio + fetch

## Cómo instalarlo en tu app

1. Sube esta carpeta a un repo de GitHub, **o**
2. Sirve los archivos por URL directa (raw), **o**
3. En la app, añade el repo apuntando a la URL del `nuvio.json`.

Ejemplo de URL de manifesto:

```
https://raw.githubusercontent.com/TU_USUARIO/jkanime-repo/main/nuvio.json
```

La app descargará `index.js` automáticamente (`entry`).

## Configuración

En **Configuraciones** del repo dentro de la app puedes cambiar:

- **URL base del sitio** (por defecto `https://jkanime.net`)
- **Idioma preferido** (Latino / Subtitulado / Cualquiera)

## Notas técnicas

- Compatible con el runtime JS de tu app (`flutter_js` + cheerio + puente `fetch`).
- IDs de contenido: `jk:slug` y episodios `jk:slug:numero`.
- Los streams devuelven embeds (StreamWish, VidHide, iframes, etc.) con headers de Referer.
- Si el HTML de jkanime cambia, habrá que ajustar selectores en `index.js`.
