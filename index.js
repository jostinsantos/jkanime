/**
 * JKAnime repo — alineado con tu lib (home, buscar, directorio, content_api).
 * - Home: selectores JkAnimeApi + fallback directorio si el HTML no parsea
 * - Buscar: selectores exactos BuscarApi + variantes de URL
 * - Descubrir: filtros completos (tipos, géneros, categorías) + var animes = {...}
 * - Meta: div.anime_info / anime_pic / anime_data + AJAX episodios
 */

var BASE = 'https://jkanime.net';
var CDN = 'https://cdn.jkdesa.com';
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
  throw new Error('cheerio no disponible');
}

function cfg(key, fallback) {
  try {
    var c =
      (globalThis.__nuvioConfig &&
        (globalThis.__nuvioConfig.current || globalThis.__nuvioConfig.jkanime)) ||
      {};
    if (c[key] != null && String(c[key]).trim() !== '') return String(c[key]).trim();
  } catch (_) {}
  return fallback;
}

function baseUrl() {
  return (cfg('baseUrl', BASE) || BASE).replace(/\/+$/, '');
}

function pageHeaders(extra) {
  var h = {
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9',
    Referer: baseUrl() + '/',
    'Accept-Encoding': 'gzip, deflate',
    Connection: 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
  };
  if (extra) {
    for (var k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) h[k] = extra[k];
    }
  }
  return h;
}

function isCloudflareChallenge(html, status) {
  if (status === 403 || status === 503) return true;
  if (!html || typeof html !== 'string') return false;
  var s = html.slice(0, 2800).toLowerCase();
  return (
    s.indexOf('just a moment') >= 0 ||
    s.indexOf('cf-mitigated') >= 0 ||
    s.indexOf('challenge-platform') >= 0 ||
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
    throw new Error('body fail ' + url + ': ' + e);
  }
  if (isCloudflareChallenge(text, res.status)) {
    throw new Error('Cloudflare bloqueó ' + url + ' (status ' + res.status + ')');
  }
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  return text;
}

async function fetchPost(url, body, headers) {
  var res = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: body,
    redirect: 'follow',
  });
  var text = '';
  try {
    text = await res.text();
  } catch (e) {
    throw new Error('post body fail: ' + e);
  }
  return { status: res.status, text: text, headers: res.headers };
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
    var path = String(url).replace(/\/+$/, '').replace(/^https?:\/\/[^/]+/i, '');
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
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  var output = '';
  str = String(str).replace(/[=]+$/, '');
  if (str.length % 4 === 1) return '';
  for (
    var bc = 0, bs, buffer, idx = 0;
    (buffer = str.charAt(idx++));
    ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
      ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
      : 0
  ) {
    buffer = chars.indexOf(buffer);
  }
  return output;
}

function parseAnimesJson(html) {
  var match = /var\s+animes\s*=\s*(\{[\s\S]*?\});/i.exec(html);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (e) {
    // intentar balancear llaves si el no-greedy cortó mal
    var start = html.search(/var\s+animes\s*=\s*\{/i);
    if (start < 0) return null;
    var i = html.indexOf('{', start);
    var depth = 0;
    var end = -1;
    for (var p = i; p < html.length; p++) {
      var ch = html.charAt(p);
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = p;
          break;
        }
      }
    }
    if (end > i) {
      try {
        return JSON.parse(html.slice(i, end + 1));
      } catch (_) {}
    }
    return null;
  }
}

function directorioItemsToContent(data) {
  var items = [];
  var list = (data && data.data) || [];
  for (var i = 0; i < list.length; i++) {
    var a = list[i];
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
      overview: a.synopsis || a.status || a.estado || '',
      genres: a.tipo ? [String(a.tipo)] : [],
      year: a.year || a.aired || '',
      rating: a.rating || a.score || null,
      extra: {
        url: href,
        status: a.status || a.estado || '',
        tipo: a.tipo || '',
        animeId: a.id,
      },
    });
  }
  return items;
}

async function fetchDirectorioPage(page, filters) {
  var params = [];
  if (page > 1) params.push('p=' + page);
  var f = filters || {};
  if (f.filtro) params.push('filtro=' + encodeURIComponent(f.filtro));
  if (f.tipo) params.push('tipo=' + encodeURIComponent(f.tipo));
  if (f.categoria) params.push('categoria=' + encodeURIComponent(f.categoria));
  if (f.genero) params.push('genero=' + encodeURIComponent(f.genero));
  if (f.orden) params.push('orden=' + encodeURIComponent(f.orden));
  var q = params.length ? '?' + params.join('&') : '';
  var url = baseUrl() + '/directorio' + q;
  var html = await fetchHtml(url);
  return parseAnimesJson(html);
}

// ───────────────────── HOME ─────────────────────

async function getHome() {
  var rows = [];
  var html = '';
  try {
    html = await fetchHtml(baseUrl() + '/');
  } catch (e) {
    // Home bloqueado → armar con directorio
    return await homeFromDirectorio('Home (fallback directorio): ' + e);
  }

  var $;
  try {
    $ = getCheerio().load(html);
  } catch (e) {
    return await homeFromDirectorio('cheerio fail: ' + e);
  }

  // Hero
  var heroItems = [];
  $('div.hero__items, .hero__items, .hero-item, div.hero_items').each(function (_, el) {
    var $el = $(el);
    var image = absUrl(
      $el.attr('data-setbg') ||
        $el.find('[data-setbg]').first().attr('data-setbg') ||
        $el.find('img').attr('src') ||
        ''
    );
    var spans = $el.find('div.ainfo span, .ainfo span');
    var type = clean(spans.eq(0).text());
    var status = clean(spans.eq(1).text());
    var title = clean($el.find('h2, h1, .title').first().text());
    var desc = clean($el.find('p').first().text());
    var links = $el.find('div.slider-btns a, a.btn, a');
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
    var sel =
      '#' +
      tabId +
      ' div.card, #' +
      tabId +
      ' .card, [data-tab="' +
      tabId +
      '"] div.card';
    $(sel).each(function (_, el) {
      var $card = $(el);
      var link = $card.find('a').first();
      var href = absUrl(link.attr('href') || '');
      if (!href) return;
      var img = absUrl(
        link.find('img').attr('src') ||
          $card.find('img').attr('src') ||
          $card.attr('data-setbg') ||
          ''
      );
      var alt = clean(link.find('img').attr('alt') || '');
      var badges = $card.find('div.badges span.badge, .badge');
      var episode = clean(badges.eq(0).text());
      var date = clean(badges.eq(1).text());
      var t =
        clean($card.find('h5.card-title, .card-title, h5, h6').first().text()) ||
        alt;
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
    $('div.row.' + rowClass + ', div.' + rowClass + ', .' + rowClass)
      .find('div.toplist, .toplist')
      .each(function (_, el) {
        var $card = $(el);
        var link = $card.find('a').first();
        var href = absUrl(link.attr('href') || '');
        if (!href) return;
        var id = idFromUrl(href);
        if (seen[id]) return;
        seen[id] = true;
        var img = absUrl(link.find('img').attr('src') || '');
        var t =
          clean($card.find('h5.card-title, .card-title').text()) ||
          clean(link.find('img').attr('alt') || '');
        items.push({
          id: id,
          title: t || 'Anime',
          poster: img,
          backdrop: img,
          type: 'series',
          extra: { url: href },
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
  $('div.trending_div div.p-3.d-flex, .trending_div .d-flex').each(function (_, el) {
    var $el = $(el);
    var a = $el.find('div.custom_thumb_home a, a').first();
    var href = absUrl(a.attr('href') || '');
    if (!href) return;
    var img = absUrl(a.find('img').attr('src') || '');
    var t = clean($el.find('h5.card-title a, h5 a, .card-title').text());
    var status = clean($el.find('div.card-info p, p').first().text());
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

  // Último recurso: cualquier enlace a anime con imagen
  if (!rows.length) {
    var seen = {};
    var grab = [];
    $('a[href*="jkanime.net/"]').each(function (_, el) {
      var href = absUrl($(el).attr('href') || '');
      if (!href || /\/(buscar|directorio|genero|letra|horario|login)/i.test(href)) return;
      if (/\/\d+\/?$/.test(href)) return; // episodio
      var id = idFromUrl(href);
      if (!id || seen[id]) return;
      var img = absUrl(
        $(el).find('img').attr('src') ||
          $(el).closest('[data-setbg]').attr('data-setbg') ||
          ''
      );
      var t = clean($(el).find('img').attr('alt') || $(el).text());
      if (!t || t.length < 2) return;
      seen[id] = true;
      grab.push({
        id: id,
        title: t,
        poster: img,
        backdrop: img,
        type: 'series',
        extra: { url: href },
      });
    });
    if (grab.length) {
      rows.push({
        id: 'grab',
        title: 'Animes',
        type: 'row',
        imageStyle: 'poster',
        items: grab.slice(0, 40),
      });
    }
  }

  if (!rows.length) {
    return await homeFromDirectorio('HTML home sin items (len=' + html.length + ')');
  }
  return rows;
}

async function homeFromDirectorio(reason) {
  var rows = [];
  try {
    var latest = await fetchDirectorioPage(1, {});
    var items = directorioItemsToContent(latest);
    if (items.length) {
      rows.push({
        id: 'hero',
        title: 'Destacados',
        type: 'hero',
        imageStyle: 'backdrop',
        items: items.slice(0, 8),
      });
      rows.push({
        id: 'latest',
        title: 'Últimos agregados',
        type: 'row',
        imageStyle: 'poster',
        items: items,
      });
    }
  } catch (_) {}
  try {
    var pop = await fetchDirectorioPage(1, { filtro: 'popularidad' });
    var items2 = directorioItemsToContent(pop);
    if (items2.length) {
      rows.push({
        id: 'popular',
        title: 'Popularidad',
        type: 'row',
        imageStyle: 'poster',
        items: items2,
      });
    }
  } catch (_) {}
  try {
    var dong = await fetchDirectorioPage(1, { categoria: 'donghua' });
    var items3 = directorioItemsToContent(dong);
    if (items3.length) {
      rows.push({
        id: 'donghua',
        title: 'Donghua',
        type: 'row',
        imageStyle: 'poster',
        items: items3,
      });
    }
  } catch (_) {}
  try {
    var lat = await fetchDirectorioPage(1, { categoria: 'latino' });
    var items4 = directorioItemsToContent(lat);
    if (items4.length) {
      rows.push({
        id: 'latino',
        title: 'Latino',
        type: 'row',
        imageStyle: 'poster',
        items: items4,
      });
    }
  } catch (_) {}

  if (!rows.length) {
    throw new Error('Home vacío. ' + (reason || ''));
  }
  return rows;
}

// ───────────────────── NEWS ─────────────────────

async function getNews() {
  try {
    var rows = await getHome();
    var items = [];
    var seen = {};
    for (var r = 0; r < rows.length; r++) {
      var list = rows[r].items || [];
      for (var i = 0; i < list.length; i++) {
        var it = list[i];
        if (!it || !it.id || seen[it.id]) continue;
        seen[it.id] = true;
        items.push({
          id: it.id,
          title: it.title,
          poster: it.poster,
          backdrop: it.backdrop,
          type: 'series',
          overview: it.overview || 'Novedad',
          extra: it.extra || {},
        });
      }
    }
    return items.slice(0, 40);
  } catch (e) {
    var data = await fetchDirectorioPage(1, {});
    return directorioItemsToContent(data);
  }
}

// ───────────────────── SEARCH ─────────────────────

function parseSearchHtml(html) {
  var $ = getCheerio().load(html);
  var items = [];
  var seen = {};

  // Exacto BuscarApi
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

  // Fallback genérico
  if (!items.length) {
    $('a[href*="jkanime.net/"]').each(function (_, el) {
      var href = absUrl($(el).attr('href') || '');
      if (!href || /\/(buscar|directorio|genero|letra|horario)/i.test(href)) return;
      if (/\/\d+\/?$/.test(href)) return;
      var id = idFromUrl(href);
      if (!id || seen[id]) return;
      var $el = $(el);
      var title = clean($el.find('h5, h6, .title').text() || $el.attr('title') || $el.text());
      if (!title || title.length < 2) return;
      var img = absUrl(
        $el.find('img').attr('src') ||
          $el.closest('[data-setbg]').attr('data-setbg') ||
          $el.parent().find('[data-setbg]').attr('data-setbg') ||
          ''
      );
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

async function search(query) {
  var q = clean(query);
  if (!q) return [];

  var encoded = encodeURIComponent(q);
  var urls = [
    baseUrl() + '/buscar/' + encoded,
    baseUrl() + '/buscar/' + encoded + '/',
    baseUrl() + '/buscar/' + q.replace(/\s+/g, '+'),
  ];

  var lastErr = null;
  for (var i = 0; i < urls.length; i++) {
    try {
      var html = await fetchHtml(urls[i]);
      var items = parseSearchHtml(html);
      if (items.length) return items;
    } catch (e) {
      lastErr = e;
    }
  }

  // Fallback: directorio no tiene search real; devolver vacío o error claro
  if (lastErr) throw lastErr;
  return [];
}

// ───────────────────── DISCOVER ─────────────────────

async function getDiscoverFilters() {
  // Igual que directorio.dart de tu app
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
      id: 'genero',
      name: 'Género',
      type: 'select',
      options: [
        { id: '', label: 'Todos' },
        { id: 'accion', label: 'Acción' },
        { id: 'aventura', label: 'Aventura' },
        { id: 'comedia', label: 'Comedia' },
        { id: 'drama', label: 'Drama' },
        { id: 'ecchi', label: 'Ecchi' },
        { id: 'fantasia', label: 'Fantasía' },
        { id: 'misterio', label: 'Misterio' },
        { id: 'romance', label: 'Romance' },
        { id: 'sci-fi', label: 'Sci-Fi' },
        { id: 'shounen', label: 'Shounen' },
        { id: 'shoujo', label: 'Shoujo' },
        { id: 'seinen', label: 'Seinen' },
        { id: 'sobrenatural', label: 'Sobrenatural' },
        { id: 'terror', label: 'Terror' },
        { id: 'deportes', label: 'Deportes' },
        { id: 'mecha', label: 'Mecha' },
        { id: 'isekai', label: 'Isekai' },
        { id: 'harem', label: 'Harem' },
        { id: 'latino', label: 'Español Latino' },
      ],
    },
    {
      id: 'filtro',
      name: 'Ordenar por',
      type: 'select',
      options: [
        { id: '', label: 'Por fecha' },
        { id: 'nombre', label: 'Por nombre' },
        { id: 'popularidad', label: 'Por popularidad' },
      ],
    },
    {
      id: 'orden',
      name: 'Orden',
      type: 'select',
      options: [
        { id: '', label: 'Descendente' },
        { id: 'asc', label: 'Ascendente' },
      ],
    },
  ];
}

async function getDiscover(opts) {
  opts = opts || {};
  var page = Number(opts.page) || 1;
  var filters = {};

  // La app puede mandar filterId / filters map
  ['filtro', 'tipo', 'categoria', 'genero', 'genre', 'orden'].forEach(function (k) {
    if (opts[k] != null && String(opts[k]) !== '') filters[k] = String(opts[k]);
  });
  if (opts.filter && !filters.tipo) {
    // mapear filter genérico
    var f = String(opts.filter);
    if (
      ['animes', 'peliculas', 'ovas', 'onas', 'especiales'].indexOf(f) >= 0
    ) {
      filters.tipo = f;
    } else if (['donghua', 'latino'].indexOf(f) >= 0) {
      filters.categoria = f;
    } else if (f === 'popularidad' || f === 'nombre') {
      filters.filtro = f;
    } else {
      filters.genero = f;
    }
  }
  if (opts.genre && !filters.genero) filters.genero = opts.genre;
  if (filters.genre && !filters.genero) {
    filters.genero = filters.genre;
    delete filters.genre;
  }

  var data = await fetchDirectorioPage(page, filters);
  if (!data) {
    // fallback HTML
    var params = [];
    if (page > 1) params.push('p=' + page);
    if (filters.tipo) params.push('tipo=' + encodeURIComponent(filters.tipo));
    if (filters.categoria)
      params.push('categoria=' + encodeURIComponent(filters.categoria));
    if (filters.genero) params.push('genero=' + encodeURIComponent(filters.genero));
    if (filters.filtro) params.push('filtro=' + encodeURIComponent(filters.filtro));
    if (filters.orden) params.push('orden=' + encodeURIComponent(filters.orden));
    var q = params.length ? '?' + params.join('&') : '';
    var html = await fetchHtml(baseUrl() + '/directorio' + q);
    var items = parseSearchHtml(html);
    return { items: items, hasMore: items.length >= 20, page: page };
  }

  var items = directorioItemsToContent(data);
  var lastPage = Number(data.last_page) || 1;
  var hasMore = page < lastPage || items.length >= 20;
  return { items: items, hasMore: hasMore, page: page };
}

// ───────────────────── META (ContentApi) ─────────────────────

async function fetchEpisodesAjax(animeId, slug, csrf, cookieHeader) {
  var all = [];
  var page = 1;
  var total = 0;
  var maxPages = 50;

  while (page <= maxPages) {
    var url = baseUrl() + '/ajax/episodes/' + animeId + '/' + page;
    var headers = pageHeaders({
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRF-TOKEN': csrf || '',
      Origin: baseUrl(),
      Referer: baseUrl() + '/' + slug + '/',
    });
    if (cookieHeader) headers['Cookie'] = cookieHeader;

    var res = await fetchPost(url, '_token=' + encodeURIComponent(csrf || ''), headers);
    if (res.status === 419) break;
    if (res.status !== 200) break;

    var json;
    try {
      json = JSON.parse(res.text);
    } catch (_) {
      break;
    }
    var list = json.data || [];
    total = Number(json.total) || total;
    if (!list.length) break;

    for (var i = 0; i < list.length; i++) {
      var ep = list[i];
      var number =
        typeof ep.number === 'number' ? ep.number : parseInt(ep.number, 10) || 0;
      if (!number) continue;
      var img = String(ep.image || '');
      var image;
      if (img.length > 10) {
        image = CDN + '/assets/images/animes/video/image_thumb/' + img.replace(/^\//, '');
      } else {
        image = CDN + '/assets/images/animes/image/' + slug + '.jpg';
      }
      all.push({
        number: number,
        id: episodeId(slug, number),
        title: 'Capítulo ' + number,
        still: image,
        overview: '',
      });
    }

    if (all.length >= total && total > 0) break;
    page++;
  }

  all.sort(function (a, b) {
    return a.number - b.number;
  });
  return all;
}

async function getMeta(id, extra) {
  var url = '';
  if (typeof id === 'string' && /^https?:\/\//i.test(id)) {
    url = id;
  } else if (typeof id === 'string' && id.indexOf('jk:') === 0) {
    var rest = id.slice(3);
    var parts = rest.split(':');
    url = baseUrl() + '/' + parts[0] + '/';
  } else if (id && typeof id === 'object') {
    url = id.url || id.extra && id.extra.url || '';
    if (!url && id.id) return getMeta(id.id, extra);
  } else {
    url = absUrl(String(id));
  }
  if (!url) throw new Error('getMeta: id vacío');
  if (!/\/$/.test(url)) url += '/';

  var html = await fetchHtml(url);
  var $ = getCheerio().load(html);

  // Título: div.anime_info h3 (ContentApi)
  var title = clean($('div.anime_info h3').first().text());
  if (!title) {
    title = clean($('meta[property="og:title"]').attr('content'));
    title = title.replace(/\s*[—\-–|]\s*Jk?Anime.*$/i, '').trim();
  }
  if (!title) {
    title = clean($('title').text()).replace(/\s*[—\-–|]\s*Jk?Anime.*$/i, '').trim();
  }

  // Sinopsis: div.anime_info p.scroll
  var overview = clean($('div.anime_info p.scroll').first().text());
  if (!overview) {
    overview =
      clean($('meta[property="og:description"]').attr('content')) ||
      clean($('.sinopsis p, #sinopsis, .anime_info p').first().text());
  }

  // Imagen: div.anime_pic img
  var poster = absUrl($('div.anime_pic img').first().attr('src') || '');
  if (!poster) {
    poster = absUrl(
      $('meta[property="og:image"]').attr('content') ||
        $('.anime__details__pic').attr('data-setbg') ||
        ''
    );
  }

  var type = '';
  var genres = [];
  var studios = [];
  var status = '';
  var episodesCount = '';
  var aired = '';
  var duration = '';
  var rating = null;

  // div.anime_data ul li
  $('div.anime_data ul li, .anime_data li, .anime__details__widget ul li').each(
    function (_, el) {
      var text = clean($(el).text());
      var span = clean($(el).find('span').first().text()).toLowerCase();
      var value = text
        .replace(new RegExp(span, 'i'), '')
        .replace(/^:/, '')
        .trim();

      if (span.indexOf('tipo') >= 0) type = value;
      else if (span.indexOf('genero') >= 0 || span.indexOf('género') >= 0) {
        $(el)
          .find('a')
          .each(function (__, a) {
            var g = clean($(a).text());
            if (g && genres.indexOf(g) < 0) genres.push(g);
          });
        if (!genres.length && value) {
          value.split(/[,/]/).forEach(function (g) {
            g = clean(g);
            if (g && genres.indexOf(g) < 0) genres.push(g);
          });
        }
      } else if (span.indexOf('estudio') >= 0 || span.indexOf('studios') >= 0) {
        studios.push(value);
      } else if (span.indexOf('estado') >= 0 || span.indexOf('status') >= 0) {
        status = value;
      } else if (span.indexOf('episodio') >= 0) {
        episodesCount = value;
      } else if (span.indexOf('emitido') >= 0 || span.indexOf('estreno') >= 0) {
        aired = value;
      } else if (span.indexOf('duracion') >= 0 || span.indexOf('duración') >= 0) {
        duration = value;
      }
    }
  );

  // géneros por links
  if (!genres.length) {
    $('a[href*="/genero/"]').each(function (_, el) {
      var t = clean($(el).text());
      if (t && genres.indexOf(t) < 0) genres.push(t);
    });
  }

  var likes = clean($('span.vot').text());
  if (likes) {
    var n = parseFloat(likes.replace(',', '.'));
    if (!isNaN(n)) rating = n;
  }

  var slug = slugFromUrl(url);
  var csrf =
    $('meta[name="csrf-token"]').attr('content') ||
    (html.match(/name="csrf-token"\s+content="([^"]+)"/i) || [])[1] ||
    '';
  var animeId =
    $('[data-anime]').attr('data-anime') ||
    (html.match(/data-anime="(\d+)"/i) || [])[1] ||
    '';

  var episodes = [];
  if (animeId && csrf) {
    try {
      episodes = await fetchEpisodesAjax(animeId, slug, csrf, '');
    } catch (_) {}
  }

  // Fallback episodios por links / regex
  if (!episodes.length) {
    var seenEp = {};
    var re = new RegExp(
      '/' + slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/(\\d+)/?',
      'g'
    );
    var m;
    while ((m = re.exec(html)) !== null) {
      var num = parseInt(m[1], 10);
      if (!num || seenEp[num]) continue;
      seenEp[num] = true;
      episodes.push({
        number: num,
        id: episodeId(slug, num),
        title: 'Capítulo ' + num,
        still: poster,
      });
    }
    episodes.sort(function (a, b) {
      return a.number - b.number;
    });
  }

  if (!episodes.length && episodesCount) {
    var total = parseInt(String(episodesCount).replace(/\D/g, ''), 10) || 0;
    if (total > 0 && total < 2000) {
      for (var i = 1; i <= total; i++) {
        episodes.push({
          number: i,
          id: episodeId(slug, i),
          title: 'Capítulo ' + i,
          still: poster,
        });
      }
    }
  }

  // Último fallback: al menos 1 episodio para que se pueda abrir
  if (!episodes.length && slug) {
    episodes.push({
      number: 1,
      id: episodeId(slug, 1),
      title: 'Capítulo 1',
      still: poster,
    });
  }

  var overviewParts = [];
  if (overview) overviewParts.push(overview);
  if (status) overviewParts.push('Estado: ' + status);
  if (type) overviewParts.push('Tipo: ' + type);
  if (aired) overviewParts.push('Emitido: ' + aired);
  if (duration) overviewParts.push('Duración: ' + duration);
  if (studios.length) overviewParts.push('Estudio: ' + studios.join(', '));

  return {
    id: idFromUrl(url),
    title: title || slug || 'Anime',
    poster: poster,
    backdrop: poster,
    type: 'series',
    overview: overviewParts.join('\n') || overview || '',
    genres: genres,
    year: (aired.match(/\d{4}/) || [])[0] || '',
    rating: rating,
    seasons: [
      {
        number: 1,
        name: 'Temporada 1',
        episodes: episodes,
      },
    ],
    extra: {
      url: url,
      slug: slug,
      animeId: animeId,
      status: status,
      tipo: type,
      studios: studios,
    },
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
      headers: { Referer: baseUrl() + '/', 'User-Agent': UA },
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
