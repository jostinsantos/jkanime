/**
 * JKAnime repo para Nuvio / app de repos.
 * Métodos: getHome, getDiscover, getDiscoverFilters, search, getMeta, getStreams, getNews
 * Usa cheerio (globalThis.__cheerio) y fetch puenteado por la app.
 */

const BASE = 'https://jkanime.net';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function cfg(key, fallback) {
  try {
    const c =
      (globalThis.__nuvioConfig &&
        (globalThis.__nuvioConfig.current || globalThis.__nuvioConfig.jkanime)) ||
      {};
    const v = c[key];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  } catch (_) {}
  return fallback;
}

function baseUrl() {
  const u = cfg('baseUrl', BASE).replace(/\/+$/, '');
  return u || BASE;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-ES,es;q=0.9',
      Referer: baseUrl() + '/',
    },
  });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  return await res.text();
}

function cheerioLoad(html) {
  const c = globalThis.__cheerio;
  if (!c || typeof c.load !== 'function') {
    throw new Error('cheerio no disponible en el runtime');
  }
  return c.load(html);
}

function absUrl(href) {
  if (!href) return '';
  href = String(href).trim();
  if (href.startsWith('//')) return 'https:' + href;
  if (href.startsWith('http')) return href;
  if (href.startsWith('/')) return baseUrl() + href;
  return baseUrl() + '/' + href;
}

function slugFromUrl(url) {
  if (!url) return '';
  try {
    const u = url.replace(/\/+$/, '');
    const parts = u.split('/').filter(Boolean);
    // .../anime-slug/ o .../anime-slug/12/
    const last = parts[parts.length - 1];
    if (/^\d+$/.test(last) && parts.length >= 2) return parts[parts.length - 2];
    return last;
  } catch (_) {
    return url;
  }
}

function idFromUrl(url) {
  const slug = slugFromUrl(url);
  return slug ? 'jk:' + slug : url;
}

function episodeId(animeSlug, ep) {
  return 'jk:' + animeSlug + ':' + ep;
}

function itemFromCard($, el, overrides) {
  const $el = $(el);
  const a = $el.find('a').first();
  let href = a.attr('href') || $el.attr('href') || '';
  href = absUrl(href);
  const img =
    a.find('img').attr('src') ||
    $el.find('img').attr('src') ||
    $el.attr('data-setbg') ||
    '';
  const title =
    $el.find('h2, h5.card-title, h5, .card-title').first().text().trim() ||
    a.attr('title') ||
    a.find('img').attr('alt') ||
    '';
  const status =
    $el.find('.badge, .ainfo span, .card-info p').first().text().trim() || '';
  const type =
    $el.find('.ainfo span').eq(0).text().trim() ||
    $el.find('.badge').eq(0).text().trim() ||
    'series';

  const id = idFromUrl(href);
  return Object.assign(
    {
      id: id,
      title: title || 'Sin título',
      poster: absUrl(img),
      backdrop: absUrl(img),
      type: 'series',
      overview: status,
      year: '',
      genres: type ? [type] : [],
      extra: { url: href, source: 'jkanime' },
    },
    overrides || {}
  );
}

// ───────────────────── HOME ─────────────────────

async function getHome() {
  const html = await fetchHtml(baseUrl() + '/');
  const $ = cheerioLoad(html);
  const rows = [];

  // Hero
  const heroItems = [];
  $('div.hero__items').each((_, el) => {
    const $el = $(el);
    const image = absUrl($el.attr('data-setbg') || '');
    const type = $el.find('div.ainfo span').eq(0).text().trim();
    const status = $el.find('div.ainfo span').eq(1).text().trim();
    const title = $el.find('h2').text().trim();
    const desc = $el.find('p').text().trim();
    const links = $el.find('div.slider-btns a');
    const detailsUrl = absUrl(links.eq(0).attr('href') || '');
    heroItems.push({
      id: idFromUrl(detailsUrl),
      title: title || 'Destacado',
      poster: image,
      backdrop: image,
      type: 'series',
      overview: desc || status,
      genres: type ? [type] : [],
      extra: { url: detailsUrl, status: status },
    });
  });
  if (heroItems.length) {
    rows.push({
      id: 'hero',
      title: 'Destacados',
      type: 'hero',
      imageStyle: 'backdrop',
      items: heroItems,
    });
  }

  // Horario / recientes por pestaña
  const scheduleTabs = [
    { id: 'animes', title: 'Últimos animes' },
    { id: 'donghuas', title: 'Donghuas' },
    { id: 'ovas', title: 'OVAs' },
  ];
  for (const tab of scheduleTabs) {
    const items = [];
    $('#' + tab.id + ' div.card').each((_, el) => {
      const it = itemFromCard($, el);
      const ep = $(el).find('div.badges span.badge').first().text().trim();
      if (ep) it.extra = Object.assign({}, it.extra, { episode: ep });
      if (it.id) items.push(it);
    });
    if (items.length) {
      rows.push({
        id: 'schedule_' + tab.id,
        title: tab.title,
        type: 'row',
        imageStyle: 'poster',
        items: items,
      });
    }
  }

  // Top / ranking
  function extractTop(rowClass, title) {
    const items = [];
    const seen = {};
    $('div.row.' + rowClass + ', div.' + rowClass)
      .find('div.toplist')
      .each((_, el) => {
        const it = itemFromCard($, el);
        if (!it.id || seen[it.id]) return;
        seen[it.id] = true;
        const rank = $(el).find('div[data-rank] span').text().trim();
        if (rank) it.extra = Object.assign({}, it.extra, { rank: rank });
        items.push(it);
      });
    if (items.length) {
      rows.push({
        id: 'top_' + rowClass,
        title: title,
        type: 'row',
        imageStyle: 'poster',
        items: items,
      });
    }
  }
  extractTop('upto', 'Top animes');
  extractTop('lower', 'Más populares');

  // Sidebar recientes
  const recent = [];
  $('div.trending_div div.p-3.d-flex').each((_, el) => {
    const $el = $(el);
    const a = $el.find('div.custom_thumb_home a').first();
    const href = absUrl(a.attr('href') || '');
    const img = absUrl(a.find('img').attr('src') || '');
    const title = $el.find('h5.card-title a').text().trim();
    const status = $el.find('div.card-info p').first().text().trim();
    if (!href) return;
    recent.push({
      id: idFromUrl(href),
      title: title || 'Anime',
      poster: img,
      backdrop: img,
      type: 'series',
      overview: status,
      extra: { url: href },
    });
  });
  if (recent.length) {
    rows.push({
      id: 'recent',
      title: 'Recientes',
      type: 'row',
      imageStyle: 'poster',
      items: recent,
    });
  }

  return rows;
}

// ───────────────────── NEWS / NOVEDADES ─────────────────────

async function getNews() {
  const html = await fetchHtml(baseUrl() + '/');
  const $ = cheerioLoad(html);
  const items = [];
  const seen = {};

  // Priorizar últimos episodios del home
  $('#animes div.card, #donghuas div.card').each((_, el) => {
    const it = itemFromCard($, el);
    if (!it.id || seen[it.id]) return;
    seen[it.id] = true;
    const ep = $(el).find('div.badges span.badge').first().text().trim();
    items.push({
      id: it.id,
      title: it.title + (ep ? ' · ' + ep : ''),
      poster: it.poster,
      backdrop: it.backdrop,
      type: 'series',
      overview: ep || it.overview || 'Nuevo episodio',
      date: '',
      extra: it.extra,
    });
  });

  // Fallback: hero
  if (items.length < 5) {
    $('div.hero__items').each((_, el) => {
      const $el = $(el);
      const title = $el.find('h2').text().trim();
      const image = absUrl($el.attr('data-setbg') || '');
      const links = $el.find('div.slider-btns a');
      const detailsUrl = absUrl(links.eq(0).attr('href') || '');
      const id = idFromUrl(detailsUrl);
      if (!id || seen[id]) return;
      seen[id] = true;
      items.push({
        id: id,
        title: title,
        poster: image,
        backdrop: image,
        type: 'series',
        overview: $el.find('p').text().trim() || 'Destacado',
        extra: { url: detailsUrl },
      });
    });
  }

  return items;
}

// ───────────────────── SEARCH ─────────────────────

async function search(query) {
  const q = String(query || '').trim();
  if (!q) return [];
  const url = baseUrl() + '/buscar/' + encodeURIComponent(q);
  const html = await fetchHtml(url);
  const $ = cheerioLoad(html);
  const items = [];
  const seen = {};

  // Resultados típicos de búsqueda JK
  $('div.anime__item, div.card, div.custom_item, .anime_list a, .row .col-6 a').each(
    (_, el) => {
      const $el = $(el);
      let href = $el.attr('href') || $el.find('a').first().attr('href') || '';
      href = absUrl(href);
      if (!href || href.indexOf(baseUrl()) !== 0) return;
      // Evitar links de navegación
      if (/\/(genero|letra|directorio|buscar|horario)\//i.test(href)) return;
      const img =
        $el.find('img').attr('src') ||
        $el.find('img').attr('data-src') ||
        '';
      const title =
        $el.find('h5, h6, .title, .card-title').text().trim() ||
        $el.attr('title') ||
        $el.find('img').attr('alt') ||
        '';
      const status = $el.find('.badge, .status, span').first().text().trim();
      const id = idFromUrl(href);
      if (!id || seen[id] || !title) return;
      seen[id] = true;
      items.push({
        id: id,
        title: title,
        poster: absUrl(img),
        backdrop: absUrl(img),
        type: 'series',
        overview: status,
        extra: { url: href },
      });
    }
  );

  // Alternativa: listado con data-setbg / estructura antigua
  if (items.length === 0) {
    $('div[class*="anime"], a[href*="jkanime"]').each((_, el) => {
      const $el = $(el);
      const href = absUrl($el.attr('href') || $el.find('a').attr('href') || '');
      if (!href || seen[idFromUrl(href)]) return;
      const title =
        $el.find('h5, h2, .title').text().trim() ||
        $el.attr('title') ||
        '';
      if (!title) return;
      const img = absUrl(
        $el.find('img').attr('src') || $el.attr('data-setbg') || ''
      );
      const id = idFromUrl(href);
      seen[id] = true;
      items.push({
        id: id,
        title: title,
        poster: img,
        backdrop: img,
        type: 'series',
        extra: { url: href },
      });
    });
  }

  return items;
}

// ───────────────────── DISCOVER ─────────────────────

async function getDiscoverFilters() {
  return [
    {
      id: 'tipo',
      name: 'Tipo',
      type: 'select',
      options: [
        { id: '', label: 'Todos' },
        { id: 'tv', label: 'Anime TV' },
        { id: 'movie', label: 'Película' },
        { id: 'ova', label: 'OVA' },
        { id: 'ona', label: 'ONA' },
        { id: 'special', label: 'Especial' },
      ],
    },
    {
      id: 'estado',
      name: 'Estado',
      type: 'select',
      options: [
        { id: '', label: 'Todos' },
        { id: '1', label: 'En emisión' },
        { id: '2', label: 'Finalizado' },
      ],
    },
    {
      id: 'orden',
      name: 'Orden',
      type: 'select',
      options: [
        { id: '', label: 'Por defecto' },
        { id: 'titulo', label: 'Título' },
        { id: 'fecha', label: 'Fecha' },
        { id: 'rating', label: 'Rating' },
      ],
    },
  ];
}

function buildDirectorioUrl(page, filters) {
  // jkanime directorio acepta query params variables; usamos los más comunes
  const params = [];
  params.push('p=' + (page || 1));
  const f = filters || {};
  if (f.tipo) params.push('tipo=' + encodeURIComponent(f.tipo));
  if (f.estado) params.push('estado=' + encodeURIComponent(f.estado));
  if (f.orden) params.push('orden=' + encodeURIComponent(f.orden));
  if (f.genre || f.genero) {
    params.push('genero=' + encodeURIComponent(f.genre || f.genero));
  }
  return baseUrl() + '/directorio/?' + params.join('&');
}

async function getDiscover(opts) {
  opts = opts || {};
  const page = Number(opts.page) || 1;
  const filters = Object.assign({}, opts);
  delete filters.page;

  const url = buildDirectorioUrl(page, filters);
  let html;
  try {
    html = await fetchHtml(url);
  } catch (e) {
    // fallback página simple
    html = await fetchHtml(baseUrl() + '/directorio/');
  }
  const $ = cheerioLoad(html);
  const items = [];
  const seen = {};

  // Muchas páginas de directorio traen JSON embebido
  const scripts = $('script').toArray();
  for (const s of scripts) {
    const txt = $(s).html() || '';
    const m = txt.match(/var\s+animes\s*=\s*(\[[\s\S]*?\]);/);
    if (m) {
      try {
        const arr = JSON.parse(m[1]);
        for (const a of arr) {
          const slug = a.slug || a.url || a.id || '';
          const href = absUrl(
            a.url || (slug ? '/' + String(slug).replace(/^\//, '') + '/' : '')
          );
          const id = idFromUrl(href) || 'jk:' + slug;
          if (seen[id]) continue;
          seen[id] = true;
          items.push({
            id: id,
            title: a.title || a.nombre || a.name || 'Anime',
            poster: absUrl(a.image || a.poster || a.img || ''),
            backdrop: absUrl(a.image || a.poster || a.img || ''),
            type: 'series',
            overview: a.synopsis || a.sinopsis || a.description || '',
            year: String(a.year || a.ano || a.aired || ''),
            genres: Array.isArray(a.genres)
              ? a.genres
              : a.tipo
                ? [String(a.tipo)]
                : [],
            rating: a.rating || a.score || null,
            extra: { url: href, raw: a },
          });
        }
      } catch (_) {}
    }
  }

  if (items.length === 0) {
    $('div.anime__item, div.card, a[href*="jkanime.net"]').each((_, el) => {
      const it = itemFromCard($, el);
      if (!it.id || seen[it.id]) return;
      if (/\/(genero|letra|directorio|buscar)\//i.test(it.extra && it.extra.url))
        return;
      seen[it.id] = true;
      items.push(it);
    });
  }

  const hasMore = items.length >= 20;
  return { items: items, hasMore: hasMore, page: page };
}

// ───────────────────── META ─────────────────────

async function getMeta(id, extra) {
  let url = '';
  if (typeof id === 'string' && id.startsWith('http')) {
    url = id;
  } else if (typeof id === 'string' && id.startsWith('jk:')) {
    const rest = id.slice(3);
    // jk:slug o jk:slug:12
    const parts = rest.split(':');
    const slug = parts[0];
    url = baseUrl() + '/' + slug + '/';
  } else {
    url = absUrl(String(id));
  }

  const html = await fetchHtml(url);
  const $ = cheerioLoad(html);

  const title =
    $('h1').first().text().trim() ||
    $('meta[property="og:title"]').attr('content') ||
    $('title').text().trim();
  const poster =
    absUrl(
      $('meta[property="og:image"]').attr('content') ||
        $('.anime_info img, .poster img, .sinopsis img').first().attr('src') ||
        ''
    );
  const overview =
    $('meta[property="og:description"]').attr('content') ||
    $('.sinopsis p, .anime_info p, .description').first().text().trim() ||
    '';
  const genres = [];
  $('a[href*="/genero/"], .genres a, .genero a').each((_, el) => {
    const t = $(el).text().trim();
    if (t && genres.indexOf(t) < 0) genres.push(t);
  });

  // Episodios: intentar listado en página o links /slug/N/
  const slug = slugFromUrl(url);
  const episodes = [];
  const seenEp = {};

  // Enlaces de episodios
  $('a[href*="/' + slug + '/"]').each((_, el) => {
    const href = absUrl($(el).attr('href') || '');
    const m = href.match(new RegExp('/' + slug + '/(\\d+)/?'));
    if (!m) return;
    const num = parseInt(m[1], 10);
    if (!num || seenEp[num]) return;
    seenEp[num] = true;
    episodes.push({
      number: num,
      id: episodeId(slug, num),
      title: 'Episodio ' + num,
      still: poster,
      overview: '',
    });
  });

  // Regex en HTML por si hay JSON de episodios
  if (episodes.length === 0) {
    const re = new RegExp('/' + slug + '/(\\d+)/', 'g');
    let match;
    while ((match = re.exec(html)) !== null) {
      const num = parseInt(match[1], 10);
      if (!num || seenEp[num]) continue;
      seenEp[num] = true;
      episodes.push({
        number: num,
        id: episodeId(slug, num),
        title: 'Episodio ' + num,
        still: poster,
      });
    }
  }

  episodes.sort((a, b) => a.number - b.number);

  // Si no hay episodios detectados, generar placeholder 1..N si hay texto "X episodios"
  if (episodes.length === 0) {
    const epCountMatch = html.match(/(\d+)\s*episodios?/i);
    const total = epCountMatch ? parseInt(epCountMatch[1], 10) : 12;
    for (let i = 1; i <= Math.min(total, 200); i++) {
      episodes.push({
        number: i,
        id: episodeId(slug, i),
        title: 'Episodio ' + i,
        still: poster,
      });
    }
  }

  const seasons = [
    {
      number: 1,
      name: 'Temporada 1',
      episodes: episodes,
    },
  ];

  return {
    id: idFromUrl(url),
    title: title.replace(/\s*-\s*JKAnime.*$/i, '').trim() || 'Anime',
    poster: poster,
    backdrop: poster,
    type: 'series',
    overview: overview,
    genres: genres,
    seasons: seasons,
    extra: { url: url, slug: slug },
  };
}

// ───────────────────── STREAMS ─────────────────────

function fixHost(u) {
  if (!u) return u;
  return u
    .replace('https://sfastwish.com/', 'https://flaswish.com/')
    .replace('http://sfastwish.com/', 'https://flaswish.com/')
    .replace('https://vidhidevip.com/', 'https://callistanise.com/')
    .replace('http://vidhidevip.com/', 'https://callistanise.com/');
}

function episodeUrlFromId(id) {
  // jk:slug:12  o  url completa
  if (typeof id === 'string' && id.startsWith('http')) return id;
  if (typeof id === 'string' && id.startsWith('jk:')) {
    const rest = id.slice(3);
    const parts = rest.split(':');
    if (parts.length >= 2) {
      return baseUrl() + '/' + parts[0] + '/' + parts[1] + '/';
    }
    return baseUrl() + '/' + parts[0] + '/';
  }
  return absUrl(String(id));
}

async function getStreams(id, type, season, episode) {
  // Compat: getStreams(id) | getStreams(id, type, s, e) | getStreams({id, season, episode})
  let epUrl = '';
  if (id && typeof id === 'object') {
    const o = id;
    id = o.id || o.metaId || o.url;
    season = o.season != null ? o.season : season;
    episode = o.episode != null ? o.episode : episode;
  }

  if (typeof id === 'string' && id.indexOf(':') > -1 && !id.startsWith('http')) {
    // jk:slug:ep
    const parts = id.replace(/^jk:/, '').split(':');
    if (parts.length >= 2 && /^\d+$/.test(parts[1])) {
      epUrl = baseUrl() + '/' + parts[0] + '/' + parts[1] + '/';
    } else if (episode != null) {
      epUrl = baseUrl() + '/' + parts[0] + '/' + episode + '/';
    } else {
      epUrl = baseUrl() + '/' + parts[0] + '/1/';
    }
  } else if (episode != null && typeof id === 'string') {
    const slug = slugFromUrl(id.startsWith('http') ? id : baseUrl() + '/' + id);
    epUrl = baseUrl() + '/' + slug + '/' + episode + '/';
  } else {
    epUrl = episodeUrlFromId(id);
  }

  // Si la URL no termina en /N/, forzar episodio 1
  if (!/\/\d+\/?$/.test(epUrl)) {
    epUrl = epUrl.replace(/\/?$/, '/1/');
  }

  const html = await fetchHtml(epUrl);
  const streams = [];
  const seen = {};

  // video[N] = '...iframe src=...'
  const videoRe = /video\[(\d+)\]\s*=\s*([^;]+);/gi;
  let m;
  while ((m = videoRe.exec(html)) !== null) {
    const idx = parseInt(m[1], 10);
    const content = m[2] || '';
    const iframeM = content.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (!iframeM) continue;
    let src = iframeM[1]
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'");
    if (src.startsWith('//')) src = 'https:' + src;
    src = fixHost(src);
    if (!src || seen[src]) continue;
    seen[src] = true;
    streams.push({
      url: src,
      name: 'Servidor ' + (idx + 1),
      provider: 'jkanime',
      language: cfg('preferLanguage', 'any') === 'latino' ? 'Latino' : 'Sub',
      headers: { Referer: baseUrl() + '/', 'User-Agent': UA },
      isHls: /\.m3u8/i.test(src),
    });
  }

  // servers / downloads remotos
  const remoteRe =
    /(?:remote|data-url|href)=["'](https?:\/\/[^"']+(?:streamwish|vidhide|filemoon|mp4upload|dood|ok\.ru)[^"']*)["']/gi;
  while ((m = remoteRe.exec(html)) !== null) {
    let src = fixHost(m[1]);
    if (seen[src]) continue;
    seen[src] = true;
    let name = 'Servidor';
    if (/streamwish|flaswish|sfastwish/i.test(src)) name = 'StreamWish';
    else if (/vidhide|callistanise/i.test(src)) name = 'VidHide';
    else if (/filemoon/i.test(src)) name = 'Filemoon';
    else if (/mp4upload/i.test(src)) name = 'Mp4Upload';
    streams.push({
      url: src,
      name: name,
      provider: 'jkanime',
      headers: { Referer: baseUrl() + '/', 'User-Agent': UA },
      isHls: /\.m3u8/i.test(src),
    });
  }

  // iframes sueltos
  const iframeRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
  while ((m = iframeRe.exec(html)) !== null) {
    let src = m[1].replace(/&amp;/g, '&');
    if (src.startsWith('//')) src = 'https:' + src;
    src = fixHost(src);
    if (!src || seen[src]) continue;
    if (!/^https?:\/\//i.test(src)) continue;
    // filtrar tracking
    if (/google|facebook|ads/i.test(src)) continue;
    seen[src] = true;
    streams.push({
      url: src,
      name: 'Embed',
      provider: 'jkanime',
      headers: { Referer: baseUrl() + '/', 'User-Agent': UA },
      isHls: /\.m3u8/i.test(src),
    });
  }

  return streams;
}

// ───────────────────── EXPORTS ─────────────────────

module.exports = {
  getHome,
  getNews,
  search,
  getDiscover,
  getDiscoverFilters,
  getMeta,
  getStreams,
};
