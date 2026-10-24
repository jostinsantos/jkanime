/**
 * JKAnime repo — adaptado del scraper de tu app.
 * Headers y parseo iguales a lib/scraper (home, buscar, directorio, servidores).
 * Detecta challenge de Cloudflare y falla con mensaje claro.
 */

var BASE = 'https://jkanime.net';
var UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function getCheerio() {
  try {
    if (typeof require === 'function') {
      var c = require('cheerio');
      if (c && typeof c.load === 'function') return c;
      if (c && c.default && typeof c.default.load === 'function') return c.default;
    }
  } catch (_) {}
  if (globalThis.__cheerio && typeof globalThis.__cheerio.load === 'function') {
    return globalThis.__cheerio;
  }
  throw new Error('cheerio no disponible — el runtime no cargó cheerio');
}

function cfg(key, fallback) {
  try {
    var c =
      (globalThis.__nuvioConfig &&
        (globalThis.__nuvioConfig.current ||
          globalThis.__nuvioConfig.jkanime)) ||
      {};
    if (c[key] != null && String(c[key]).trim() !== '') return String(c[key]).trim();
  } catch (_) {}
  return fallback;
}

function baseUrl() {
  return (cfg('baseUrl', BASE) || BASE).replace(/\/+$/, '');
}

/** Headers idénticos a tu BuscarApi / DirectorioApi / JkAnimeApi */
function pageHeaders(extra) {
  var h = {
    'User-Agent': UA,
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9',
    Referer: baseUrl() + '/',
    'Accept-Encoding': 'gzip, deflate',
    Connection: 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
  };
  if (extra) {
    for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) h[k] = extra[k];
  }
  return h;
}

function isCloudflareChallenge(html, status) {
  if (status === 403 || status === 503) return true;
  if (!html || typeof html !== 'string') return false;
  var s = html.slice(0, 2500).toLowerCase();
  return (
    s.indexOf('just a moment') >= 0 ||
    s.indexOf('cf-mitigated') >= 0 ||
    s.indexOf('challenge-platform') >= 0 ||
    s.indexOf('cdn-cgi/challenge') >= 0 ||
    s.indexOf('enable javascript and cookies') >= 0
  );
}

async function fetchHtml(url, headers) {
  var res = await fetch(url, {
    method: 'GET',
    headers: headers || pageHeaders(),
    redirect: 'follow',
  });
  var text = '';
  try {
    text = await res.text();
  } catch (e) {
    throw new Error('No se pudo leer body de ' + url + ': ' + e);
  }
  if (isCloudflareChallenge(text, res.status)) {
    throw new Error(
      'Cloudflare bloqueó la petición a jkanime (status ' +
        res.status +
        '). En el dispositivo suele pasar si la IP/red está marcada. ' +
        'Prueba otra red o VPN. URL: ' +
        url
    );
  }
  if (!res.ok) {
    throw new Error('HTTP ' + res.status + ' en ' + url);
  }
  return text;
}

function absUrl(href) {
  if (!href) return '';
  href = String(href).trim();
  if (href.indexOf('//') === 0) return 'https:' + href;
  if (/^https?:\/\//i.test(href)) return href;
  if (href.charAt(0) === '/') return baseUrl() + href;
  return baseUrl() + '/' + href;
}

function slugFromUrl(url) {
  if (!url) return '';
  try {
    var u = String(url).replace(/\/+$/, '');
    var path = u.replace(/^https?:\/\/[^/]+/i, '');
    var segs = path.split('/').filter(Boolean);
    if (!segs.length) return '';
    var last = segs[segs.length - 1];
    if (/^\d+$/.test(last) && segs.length >= 2) return segs[segs.length - 2];
    return last;
  } catch (_) {
    return '';
  }
}

function idFromUrl(url) {
  var slug = slugFromUrl(url);
  return slug ? 'jk:' + slug : String(url || '');
}

function episodeId(slug, ep) {
  return 'jk:' + slug + ':' + ep;
}

function clean(t) {
  if (t == null) return '';
  return String(t).replace(/\s+/g, ' ').trim();
}

function fixHost(u) {
  if (!u) return u;
  return String(u)
    .replace(/https?:\/\/sfastwish\.com\//gi, 'https://flaswish.com/')
    .replace(/https?:\/\/vidhidevip\.com\//gi, 'https://callistanise.com/');
}

function b64decode(str) {
  try {
    if (typeof atob === 'function') return atob(str);
  } catch (_) {}
  try {
    if (typeof Buffer !== 'undefined') return Buffer.from(str, 'base64').toString('utf8');
  } catch (_) {}
  var chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  var output = '';
  str = String(str).replace(/[=]+$/, '');
  if (str.length % 4 === 1) return '';
  for (
    var bc = 0, bs, buffer, idx = 0;
    (buffer = str.charAt(idx++));
    ~buffer &&
    ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
      ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
      : 0
  ) {
    buffer = chars.indexOf(buffer);
  }
  return output;
}

// ───────────────────── HOME ─────────────────────

async function getHome() {
  var html = await fetchHtml(baseUrl() + '/');
  var $ = getCheerio().load(html);
  var rows = [];

  var heroItems = [];
  $('div.hero__items').each(function (_, el) {
    var $el = $(el);
    var image = absUrl($el.attr('data-setbg') || '');
    var spans = $el.find('div.ainfo span');
    var type = clean(spans.eq(0).text());
    var status = clean(spans.eq(1).text());
    var title = clean($el.find('h2').text());
    var desc = clean($el.find('p').text());
    var links = $el.find('div.slider-btns a');
    var detailsUrl = absUrl(links.eq(0).attr('href') || '');
    if (!title && !detailsUrl) return;
    heroItems.push({
      id: idFromUrl(detailsUrl) || 'jk:hero-' + heroItems.length,
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

  function scheduleTab(tabId, title) {
    var items = [];
    $('#' + tabId + ' div.card').each(function (_, el) {
      var $card = $(el);
      var link = $card.find('a').first();
      var href = absUrl(link.attr('href') || '');
      if (!href) return;
      var img = absUrl(link.find('img').attr('src') || '');
      var alt = clean(link.find('img').attr('alt') || '');
      var badges = $card.find('div.badges span.badge');
      var episode = clean(badges.eq(0).text());
      var date = clean(badges.eq(1).text());
      var t = clean($card.find('h5.card-title, .card-title, h5').first().text()) || alt;
      items.push({
        id: idFromUrl(href),
        title: t || 'Anime',
        poster: img,
        backdrop: img,
        type: 'series',
        overview: episode || date,
        extra: { url: href, episode: episode, date: date },
      });
    });
    if (items.length) {
      rows.push({
        id: 'schedule_' + tabId,
        title: title,
        type: 'row',
        imageStyle: 'poster',
        items: items,
      });
    }
  }
  scheduleTab('animes', 'Últimos animes');
  scheduleTab('donghuas', 'Donghuas');
  scheduleTab('ovas', 'OVAs');

  function extractTop(rowClass, title) {
    var items = [];
    var seen = {};
    $('div.row.' + rowClass + ', div.' + rowClass)
      .find('div.toplist')
      .each(function (_, el) {
        var $card = $(el);
        var link = $card.find('a').first();
        var href = absUrl(link.attr('href') || '');
        if (!href) return;
        var id = idFromUrl(href);
        if (seen[id]) return;
        seen[id] = true;
        var img = absUrl(link.find('img').attr('src') || '');
        var t = clean($card.find('h5.card-title').text()) || clean(link.find('img').attr('alt') || '');
        var rank = clean($card.find('div[data-rank] span').text());
        items.push({
          id: id,
          title: t || 'Anime',
          poster: img,
          backdrop: img,
          type: 'series',
          extra: { url: href, rank: rank },
        });
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

  var recent = [];
  $('div.trending_div div.p-3.d-flex').each(function (_, el) {
    var $el = $(el);
    var a = $el.find('div.custom_thumb_home a').first();
    var href = absUrl(a.attr('href') || '');
    if (!href) return;
    var img = absUrl(a.find('img').attr('src') || '');
    var t = clean($el.find('h5.card-title a').text());
    var status = clean($el.find('div.card-info p').first().text());
    recent.push({
      id: idFromUrl(href),
      title: t || 'Anime',
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

  if (!rows.length) {
    throw new Error(
      'Home vacío: el HTML no tiene hero/cards. Posible bloqueo o layout distinto. len=' +
        html.length
    );
  }
  return rows;
}

// ───────────────────── NEWS ─────────────────────

async function getNews() {
  var html = await fetchHtml(baseUrl() + '/');
  var $ = getCheerio().load(html);
  var items = [];
  var seen = {};

  $('#animes div.card, #donghuas div.card, #ovas div.card').each(function (_, el) {
    var $card = $(el);
    var link = $card.find('a').first();
    var href = absUrl(link.attr('href') || '');
    if (!href) return;
    var id = idFromUrl(href);
    if (seen[id]) return;
    seen[id] = true;
    var img = absUrl(link.find('img').attr('src') || '');
    var t =
      clean($card.find('h5.card-title, .card-title, h5').first().text()) ||
      clean(link.find('img').attr('alt') || '');
    var ep = clean($card.find('div.badges span.badge').first().text());
    items.push({
      id: id,
      title: t + (ep ? ' · ' + ep : ''),
      poster: img,
      backdrop: img,
      type: 'series',
      overview: ep || 'Nuevo',
      extra: { url: href, episode: ep },
    });
  });

  if (!items.length) {
    $('div.hero__items').each(function (_, el) {
      var $el = $(el);
      var title = clean($el.find('h2').text());
      var image = absUrl($el.attr('data-setbg') || '');
      var detailsUrl = absUrl($el.find('div.slider-btns a').eq(0).attr('href') || '');
      var id = idFromUrl(detailsUrl);
      if (!id || seen[id]) return;
      seen[id] = true;
      items.push({
        id: id,
        title: title,
        poster: image,
        backdrop: image,
        type: 'series',
        overview: clean($el.find('p').text()),
        extra: { url: detailsUrl },
      });
    });
  }
  return items;
}

// ───────────────────── SEARCH ─────────────────────

async function search(query) {
  var q = clean(query);
  if (!q) return [];
  var url = baseUrl() + '/buscar/' + encodeURIComponent(q);
  var html = await fetchHtml(url);
  var $ = getCheerio().load(html);
  var items = [];
  var seen = {};

  $('div.page_directorio div.anime__item, div.anime__item').each(function (_, el) {
    var $item = $(el);
    var linkNode = $item.find('h5 a').first();
    if (!linkNode.length) linkNode = $item.find('a[href*="jkanime"]').first();
    if (!linkNode.length) linkNode = $item.find('a').first();

    var title = clean(linkNode.text());
    var href = absUrl(linkNode.attr('href') || '');
    if (!title || !href) return;

    var picNode = $item.find('div.anime__item__pic').first();
    var image = picNode.attr('data-setbg') || '';
    if (!image) {
      var style = picNode.attr('style') || '';
      var m = /url\(["']?(.*?)["']?\)/i.exec(style);
      if (m) image = m[1];
    }
    if (!image) image = $item.find('img').attr('src') || '';

    var status = '';
    var type = '';
    var lis = $item.find('div.anime__item__text ul li');
    if (lis.length > 0) status = clean(lis.eq(0).text());
    if (lis.length > 1) type = clean(lis.eq(1).text());

    var id = idFromUrl(href);
    if (seen[id]) return;
    seen[id] = true;

    items.push({
      id: id,
      title: title,
      poster: absUrl(image),
      backdrop: absUrl(image),
      type: 'series',
      overview: status,
      genres: type ? [type] : [],
      extra: { url: href, status: status, type: type },
    });
  });

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
        { id: 'animes', label: 'Animes' },
        { id: 'peliculas', label: 'Películas' },
        { id: 'ovas', label: 'OVAs' },
        { id: 'onas', label: 'ONAs' },
        { id: 'especiales', label: 'Especiales' },
      ],
    },
    {
      id: 'categoria',
      name: 'Categoría',
      type: 'select',
      options: [
        { id: '', label: 'Todas' },
        { id: 'donghua', label: 'Donghua' },
        { id: 'latino', label: 'Latino' },
      ],
    },
    {
      id: 'filtro',
      name: 'Ordenar por',
      type: 'select',
      options: [
        { id: '', label: 'Fecha' },
        { id: 'nombre', label: 'Nombre' },
        { id: 'popularidad', label: 'Popularidad' },
      ],
    },
    {
      id: 'orden',
      name: 'Dirección',
      type: 'select',
      options: [
        { id: '', label: 'Desc' },
        { id: 'asc', label: 'Asc' },
      ],
    },
  ];
}

function buildDirectorioUrl(page, filters) {
  var params = [];
  if (page > 1) params.push('p=' + page);
  var f = filters || {};
  if (f.filtro) params.push('filtro=' + encodeURIComponent(f.filtro));
  if (f.tipo) params.push('tipo=' + encodeURIComponent(f.tipo));
  if (f.categoria) params.push('categoria=' + encodeURIComponent(f.categoria));
  if (f.genero || f.genre)
    params.push('genero=' + encodeURIComponent(f.genero || f.genre));
  if (f.orden) params.push('orden=' + encodeURIComponent(f.orden));
  var q = params.length ? '?' + params.join('&') : '';
  return baseUrl() + '/directorio' + q;
}

async function getDiscover(opts) {
  opts = opts || {};
  var page = Number(opts.page) || 1;
  var filters = {};
  ['filtro', 'tipo', 'categoria', 'genero', 'genre', 'orden'].forEach(function (k) {
    if (opts[k] != null && String(opts[k]) !== '') filters[k] = opts[k];
  });
  if (opts.filter && !filters.tipo) filters.tipo = opts.filter;
  if (opts.genre && !filters.genero) filters.genero = opts.genre;

  var url = buildDirectorioUrl(page, filters);
  var html = await fetchHtml(url);

  var match = /var\s+animes\s*=\s*(\{[\s\S]*?\});/i.exec(html);
  var items = [];
  var hasMore = false;
  var lastPage = 1;

  if (match) {
    try {
      var decoded = JSON.parse(match[1]);
      var data = decoded.data || [];
      lastPage = Number(decoded.last_page) || 1;
      hasMore = page < lastPage;
      for (var i = 0; i < data.length; i++) {
        var a = data[i];
        if (!a || typeof a !== 'object') continue;
        var href = absUrl(a.url || '');
        if (!href && a.slug) href = baseUrl() + '/' + a.slug + '/';
        var img = absUrl(a.image || a.poster || '');
        items.push({
          id: idFromUrl(href) || 'jk:' + (a.id || i),
          title: a.title || a.short_title || a.name || 'Anime',
          poster: img,
          backdrop: img,
          type: 'series',
          overview: a.synopsis || a.status || '',
          genres: a.tipo ? [String(a.tipo)] : [],
          extra: {
            url: href,
            status: a.status || a.estado || '',
            tipo: a.tipo || '',
          },
        });
      }
    } catch (e) {
      throw new Error('JSON animes inválido: ' + e);
    }
  }

  if (!items.length) {
    var $ = getCheerio().load(html);
    var seen = {};
    $('div.page_directorio div.anime__item, div.anime__item').each(function (_, el) {
      var $item = $(el);
      var linkNode = $item.find('h5 a').first();
      if (!linkNode.length) linkNode = $item.find('a').first();
      var title = clean(linkNode.text());
      var href = absUrl(linkNode.attr('href') || '');
      if (!title || !href) return;
      var id = idFromUrl(href);
      if (seen[id]) return;
      seen[id] = true;
      var picNode = $item.find('div.anime__item__pic').first();
      var image = picNode.attr('data-setbg') || '';
      if (!image) {
        var style = picNode.attr('style') || '';
        var m = /url\(["']?(.*?)["']?\)/i.exec(style);
        if (m) image = m[1];
      }
      items.push({
        id: id,
        title: title,
        poster: absUrl(image),
        backdrop: absUrl(image),
        type: 'series',
        extra: { url: href },
      });
    });
    hasMore = items.length >= 20;
  }

  return { items: items, hasMore: hasMore, page: page };
}

// ───────────────────── META ─────────────────────

async function getMeta(id, extra) {
  var url = '';
  if (typeof id === 'string' && /^https?:\/\//i.test(id)) {
    url = id;
  } else if (typeof id === 'string' && id.indexOf('jk:') === 0) {
    var rest = id.slice(3);
    var parts = rest.split(':');
    url = baseUrl() + '/' + parts[0] + '/';
  } else {
    url = absUrl(String(id));
  }
  if (!/\/$/.test(url)) url += '/';

  var html = await fetchHtml(url);
  var $ = getCheerio().load(html);

  var title =
    clean($('h1').first().text()) ||
    clean($('meta[property="og:title"]').attr('content')) ||
    clean($('title').text());
  title = title.replace(/\s*[-|]\s*JKAnime.*$/i, '').trim();

  var poster = absUrl(
    $('meta[property="og:image"]').attr('content') ||
      $('.anime_info img, .poster img, .sinopsis img, .anime__details__pic').first().attr('src') ||
      $('.anime__details__pic').attr('data-setbg') ||
      ''
  );
  var overview =
    clean($('meta[property="og:description"]').attr('content')) ||
    clean($('.sinopsis p, .anime_info p, .description, #sinopsis').first().text());

  var genres = [];
  $('a[href*="/genero/"], .genres a, .genero a, .anime__details__widget a').each(
    function (_, el) {
      var t = clean($(el).text());
      if (t && genres.indexOf(t) < 0) genres.push(t);
    }
  );

  var slug = slugFromUrl(url);
  var episodes = [];
  var seenEp = {};
  var re = new RegExp('/' + slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/(\\d+)/?', 'g');
  var m;
  while ((m = re.exec(html)) !== null) {
    var num = parseInt(m[1], 10);
    if (!num || seenEp[num]) continue;
    seenEp[num] = true;
    episodes.push({
      number: num,
      id: episodeId(slug, num),
      title: 'Episodio ' + num,
      still: poster,
    });
  }

  if (!episodes.length) {
    var epCountMatch = html.match(/(\d+)\s*episodios?/i);
    var total = epCountMatch ? parseInt(epCountMatch[1], 10) : 0;
    if (total > 0 && total < 2000) {
      for (var i = 1; i <= total; i++) {
        episodes.push({
          number: i,
          id: episodeId(slug, i),
          title: 'Episodio ' + i,
          still: poster,
        });
      }
    }
  }

  episodes.sort(function (a, b) {
    return a.number - b.number;
  });

  return {
    id: idFromUrl(url),
    title: title || 'Anime',
    poster: poster,
    backdrop: poster,
    type: 'series',
    overview: overview,
    genres: genres,
    seasons: [
      {
        number: 1,
        name: 'Temporada 1',
        episodes: episodes,
      },
    ],
    extra: { url: url, slug: slug },
  };
}

// ───────────────────── STREAMS ─────────────────────

function episodeUrlFromArgs(id, type, season, episode) {
  if (id && typeof id === 'object') {
    var o = id;
    id = o.id || o.metaId || o.url;
    if (o.episode != null) episode = o.episode;
    if (o.season != null) season = o.season;
  }
  if (typeof id === 'string' && /^https?:\/\//i.test(id) && /\/\d+\/?$/.test(id)) {
    return id.replace(/\/?$/, '/');
  }
  if (typeof id === 'string' && id.indexOf('jk:') === 0) {
    var rest = id.slice(3);
    var parts = rest.split(':');
    if (parts.length >= 2 && /^\d+$/.test(parts[1])) {
      return baseUrl() + '/' + parts[0] + '/' + parts[1] + '/';
    }
    var ep = episode != null ? episode : 1;
    return baseUrl() + '/' + parts[0] + '/' + ep + '/';
  }
  var slug = slugFromUrl(String(id));
  var epn = episode != null ? episode : 1;
  return baseUrl() + '/' + slug + '/' + epn + '/';
}

async function getStreams(id, type, season, episode) {
  var epUrl = episodeUrlFromArgs(id, type, season, episode);
  var html = await fetchHtml(epUrl, pageHeaders({ Referer: baseUrl() + '/' }));
  var streams = [];
  var seen = {};

  function push(src, name, language) {
    src = fixHost(String(src || '').replace(/&amp;/g, '&'));
    if (!src || seen[src]) return;
    if (!/^https?:\/\//i.test(src)) return;
    if (/google|facebook|doubleclick|ads\./i.test(src)) return;
    seen[src] = true;
    streams.push({
      url: src,
      name: name || 'Servidor',
      provider: 'jkanime',
      language: language || undefined,
      headers: {
        Referer: baseUrl() + '/',
        'User-Agent': UA,
      },
      isHls: /\.m3u8/i.test(src),
    });
  }

  var videoRe = /video\[(\d+)\]\s*=\s*([^;]+);/gi;
  var m;
  while ((m = videoRe.exec(html)) !== null) {
    var idx = parseInt(m[1], 10);
    var content = m[2] || '';
    var iframeM = content.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (iframeM) push(iframeM[1], 'Servidor ' + (idx + 1));
  }

  var serversMatch = /var\s+servers\s*=\s*\[([\s\S]*?)\];/i.exec(html);
  if (serversMatch) {
    var chunk = serversMatch[1];
    var objRe = /\{([^}]+)\}/g;
    var om;
    while ((om = objRe.exec(chunk)) !== null) {
      var objStr = om[1];
      var server = {};
      var pairs = objStr.split(',');
      for (var pi = 0; pi < pairs.length; pi++) {
        var pair = pairs[pi];
        if (pair.indexOf(':') < 0) continue;
        var colon = pair.indexOf(':');
        var key = pair.slice(0, colon).trim().replace(/["']/g, '');
        var value = pair
          .slice(colon + 1)
          .trim()
          .replace(/^["'\s]+|["'\s]+$/g, '');
        if (key === 'remote') {
          try {
            value = b64decode(value);
          } catch (_) {}
        }
        server[key] = value;
      }
      if (server.remote) {
        var langName = 'Sub';
        var lc = parseInt(server.lang || '1', 10);
        if (lc === 2 || lc === 4) langName = 'Latino';
        push(server.remote, server.server || 'Servidor', langName);
      }
    }
  }

  var iframeRe = /<iframe[^>]+src=["']([^"']+)["']/gi;
  while ((m = iframeRe.exec(html)) !== null) {
    push(m[1], 'Embed');
  }

  return streams;
}

module.exports = {
  getHome: getHome,
  getNews: getNews,
  search: search,
  getDiscover: getDiscover,
  getDiscoverFilters: getDiscoverFilters,
  getMeta: getMeta,
  getStreams: getStreams,
};
