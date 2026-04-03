(function () {
  'use strict';

  // ── Resolve base URL from this script's src ──
  var scripts = document.querySelectorAll('script[src]');
  var BASE = '';
  for (var i = 0; i < scripts.length; i++) {
    if (scripts[i].src.indexOf('grid-embed.js') !== -1) {
      BASE = scripts[i].src.replace(/grid-embed\.js.*$/, '');
      break;
    }
  }

  // ── Inject dependencies ──
  function loadCSS(href) {
    if (document.querySelector('link[href="' + href + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  loadCSS('https://fonts.googleapis.com/css2?family=Baloo+2:wght@400;600;700&display=swap');
  loadCSS(BASE + 'shared.css');

  // ── Inject page-specific CSS ──
  var style = document.createElement('style');
  style.textContent =
    '#fr-grid-root { background: transparent; }' +
    '#fr-grid-root .fr-featured-grid { flex-wrap: nowrap; }' +
    '.fr-pagination { display: flex; justify-content: center; align-items: center; gap: 16px; padding: 10px 0 20px; font-family: "Baloo 2", sans-serif; }' +
    '.fr-pagination-btn { background: var(--brand-blue); color: #fff; border: none; width: 40px; height: 40px; border-radius: 50%; font-size: 1.2rem; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.2s, opacity 0.2s; }' +
    '.fr-pagination-btn:hover { background: var(--brand-green); }' +
    '.fr-pagination-btn:disabled { opacity: 0.3; cursor: default; background: #aaa; }' +
    '.fr-pagination-info { font-size: 0.9rem; color: #fff; font-weight: 600; min-width: 80px; text-align: center; }';
  document.head.appendChild(style);

  // ── Helpers ──
  function esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var PAGE_SIZE = 3;
  var allEvents = [];
  var currentPage = 0;

  function openEventModal(ev) {
    var detail = document.getElementById('fr-detail');
    var grid = document.getElementById('fr-featured-grid');
    var pagination = document.getElementById('fr-pagination');

    var imgHtml = ev.thumbnail
      ? '<div class="fr-detail-img"><img src="' + esc(ev.thumbnail) + '" alt="' + esc(ev.title) + '" /></div>'
      : '';

    var meta = '';
    if (ev.start) {
      var d = new Date(ev.start);
      meta = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
           + ' \u2022 '
           + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      if (ev.end) {
        var ed = new Date(ev.end);
        meta += ' \u2013 ' + ed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      }
    }

    var descHtml = ev.description
      ? '<div class="fr-detail-desc">' + esc(ev.description) + '</div>'
      : '';

    var ticketsHtml = ev.url
      ? '<a class="fr-detail-tickets" href="' + esc(ev.url) + '" target="_blank">Get Tickets</a>'
      : '';

    detail.innerHTML =
      '<button class="fr-detail-back" id="fr-detail-back">\u2190 Back to Events</button>' +
      '<div class="fr-detail-inner">' +
        imgHtml +
        '<div class="fr-detail-body">' +
          '<h2 class="fr-detail-title">' + esc(ev.title) + '</h2>' +
          '<div class="fr-detail-meta">' + meta + '</div>' +
          descHtml +
          ticketsHtml +
        '</div>' +
      '</div>';

    detail.classList.add('open');
    grid.style.display = 'none';
    pagination.style.display = 'none';

    document.getElementById('fr-detail-back').addEventListener('click', closeDetail);
  }

  function closeDetail() {
    var detail = document.getElementById('fr-detail');
    var grid = document.getElementById('fr-featured-grid');
    var pagination = document.getElementById('fr-pagination');
    detail.classList.remove('open');
    detail.innerHTML = '';
    grid.style.display = '';
    pagination.style.display = '';
  }

  function renderPage() {
    var gridEl = document.getElementById('fr-featured-grid');
    gridEl.innerHTML = '';

    var totalPages = Math.ceil(allEvents.length / PAGE_SIZE);
    if (currentPage >= totalPages) currentPage = totalPages - 1;
    if (currentPage < 0) currentPage = 0;

    var start = currentPage * PAGE_SIZE;
    var pageItems = allEvents.slice(start, start + PAGE_SIZE);
    var isMobile = window.matchMedia('(max-width: 600px)').matches;

    var brandColors = [
      getComputedStyle(document.documentElement).getPropertyValue('--brand-blue').trim(),
      getComputedStyle(document.documentElement).getPropertyValue('--brand-green').trim(),
      getComputedStyle(document.documentElement).getPropertyValue('--brand-yellow').trim(),
      getComputedStyle(document.documentElement).getPropertyValue('--brand-orange').trim()
    ];

    for (var p = 0; p < pageItems.length; p++) {
      var item = pageItems[p];
      var card = document.createElement('div');
      card.className = 'fr-featured-card';
      var hasDesc = !!(item.description && item.description.trim());
      var randColor = brandColors[Math.floor(Math.random() * brandColors.length)];

      var frontContent = document.createDocumentFragment();

      if (item.thumbnail) {
        var img = document.createElement('img');
        img.className = 'fr-featured-card-img';
        img.src = item.thumbnail;
        img.alt = item.title;
        frontContent.appendChild(img);
      }

      var body = document.createElement('div');
      body.className = 'fr-featured-card-body';
      body.style.background = randColor;

      var title = document.createElement('div');
      title.className = 'fr-featured-card-title';
      title.textContent = item.title;
      body.appendChild(title);

      var metaRow = document.createElement('div');
      metaRow.className = 'fr-featured-card-subtitle';

      if (item.start) {
        var d = new Date(item.start);
        var dateStr = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
        var timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        var label = dateStr + ' ' + timeStr;
        if (item.end) {
          var ed = new Date(item.end);
          label += ' \u2013 ' + ed.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        }
        metaRow.textContent = label;
      }

      body.appendChild(metaRow);
      frontContent.appendChild(body);

      if (hasDesc) {
        var btn = document.createElement('span');
        btn.className = 'fr-featured-card-btn';
        btn.textContent = 'More Info';
        frontContent.appendChild(btn);
      } else if (item.url) {
        var btn = document.createElement('a');
        btn.className = 'fr-featured-card-btn';
        btn.textContent = 'Get Tickets';
        btn.href = item.url;
        btn.target = '_blank';
        btn.addEventListener('click', function (e) { e.stopPropagation(); });
        frontContent.appendChild(btn);
      } else {
        var btn = document.createElement('span');
        btn.className = 'fr-featured-card-btn';
        btn.textContent = 'More Info';
        frontContent.appendChild(btn);
      }

      if (isMobile) {
        var inner = document.createElement('div');
        inner.className = 'fr-featured-card-inner';

        var front = document.createElement('div');
        front.className = 'fr-featured-card-front';
        front.appendChild(frontContent);
        inner.appendChild(front);

        var back = document.createElement('div');
        back.className = 'fr-featured-card-back';
        back.style.background = randColor;

        if (hasDesc) {
          var backDesc = document.createElement('div');
          backDesc.className = 'fr-featured-card-back-desc';
          backDesc.textContent = item.description;
          back.appendChild(backDesc);
        }

        if (item.url) {
          var backBtn = document.createElement('a');
          backBtn.className = 'fr-featured-card-back-btn';
          backBtn.textContent = 'Get Tickets';
          backBtn.href = item.url;
          backBtn.target = '_blank';
          backBtn.addEventListener('click', function (e) { e.stopPropagation(); });
          back.appendChild(backBtn);
        }

        inner.appendChild(back);
        card.appendChild(inner);

        (function (c) {
          c.addEventListener('click', function (e) {
            if (e.target.closest('.fr-featured-card-back-btn')) return;
            c.classList.toggle('flipped');
          });
        })(card);
        card.style.cursor = 'pointer';
      } else {
        card.appendChild(frontContent);

        (function (c, itm, hd) {
          if (hd)
            c.addEventListener('click', function () { openEventModal(itm); });
          else if (itm.url)
            c.addEventListener('click', function () { window.open(itm.url, '_blank'); });
          else
            c.addEventListener('click', function () { openEventModal(itm); });
        })(card, item, hasDesc);
        card.style.cursor = 'pointer';
      }

      gridEl.appendChild(card);
    }

    // pagination controls
    var paginationEl = document.getElementById('fr-pagination');
    var prevBtn = document.getElementById('fr-prev');
    var nextBtn = document.getElementById('fr-next');
    var pageInfo = document.getElementById('fr-page-info');

    if (totalPages > 1) {
      paginationEl.style.display = 'flex';
      prevBtn.disabled = currentPage === 0;
      nextBtn.disabled = currentPage >= totalPages - 1;
      pageInfo.textContent = (currentPage + 1) + ' / ' + totalPages;
    } else {
      paginationEl.style.display = 'none';
    }
  }

  // ── Boot ──
  async function loadJsonArray(path) {
    try {
      var response = await fetch(path, { cache: 'no-store' });
      if (!response.ok) {
        if (response.status === 404) return [];
        throw new Error('HTTP ' + response.status);
      }
      var data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('Failed to load ' + path, err);
      return [];
    }
  }

  async function init() {
    var root = document.getElementById('fr-grid-root');
    if (!root) {
      console.error('grid-embed.js: no #fr-grid-root element found');
      return;
    }

    // Build DOM structure
    root.innerHTML =
      '<div id="fr-detail" class="fr-detail"></div>' +
      '<div id="fr-featured-grid" class="fr-featured-grid"></div>' +
      '<div class="fr-pagination" id="fr-pagination" style="display:none;">' +
        '<button class="fr-pagination-btn" id="fr-prev" aria-label="Previous page">&#8249;</button>' +
        '<span class="fr-pagination-info" id="fr-page-info"></span>' +
        '<button class="fr-pagination-btn" id="fr-next" aria-label="Next page">&#8250;</button>' +
      '</div>';

    document.getElementById('fr-prev').addEventListener('click', function () {
      if (currentPage > 0) { currentPage--; renderPage(); }
    });

    document.getElementById('fr-next').addEventListener('click', function () {
      var totalPages = Math.ceil(allEvents.length / PAGE_SIZE);
      if (currentPage < totalPages - 1) { currentPage++; renderPage(); }
    });

    try {
      var results = await Promise.all([
        loadJsonArray(BASE + 'events.json'),
        loadJsonArray(BASE + 'manual-events.json')
      ]);
      var syncedEvents = results[0];
      var manualEvents = results[1];

      var merged = syncedEvents.concat(manualEvents);
      var byKey = new Map();

      for (var i = 0; i < merged.length; i++) {
        var event = merged[i];
        if (!event || typeof event !== 'object') continue;
        var t = typeof event.title === 'string' ? event.title.trim() : '';
        var s = typeof event.start === 'string' ? event.start : '';
        if (!t || !s) continue;

        var key = (typeof event.id === 'string' && event.id.trim())
          ? 'id:' + event.id.trim()
          : t + '::' + s + '::' + (event.end || '');
        byKey.set(key, event);
      }

      var events = Array.from(byKey.values()).sort(function (a, b) {
        return String(a.start || '').localeCompare(String(b.start || ''));
      });

      var now = new Date();
      var upcoming = events.filter(function (e) { return new Date(e.start) >= now; });

      var seen = new Set();
      for (var i = 0; i < upcoming.length; i++) {
        var name = (upcoming[i].title || '').trim().toLowerCase();
        if (!seen.has(name)) { seen.add(name); allEvents.push(upcoming[i]); }
      }

      renderPage();
    } catch (err) {
      console.error('Failed to load event data', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
