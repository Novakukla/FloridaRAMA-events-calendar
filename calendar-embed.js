(function () {
  'use strict';

  // ── Resolve base URL from this script's src ──
  var scripts = document.querySelectorAll('script[src]');
  var BASE = '';
  for (var i = 0; i < scripts.length; i++) {
    if (scripts[i].src.indexOf('calendar-embed.js') !== -1) {
      BASE = scripts[i].src.replace(/calendar-embed\.js.*$/, '');
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

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) { resolve(); return; }
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // Fonts + shared styles
  loadCSS('https://fonts.googleapis.com/css2?family=Baloo+2:wght@400;600;700&display=swap');
  loadCSS(BASE + 'shared.css');

  // FullCalendar styles
  loadCSS('https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.css');

  // ── Inject page-specific CSS ──
  var style = document.createElement('style');
  style.textContent =
    '.fc-scroller::-webkit-scrollbar { width: 0; height: 0; display: none; }' +
    '.fc-scroller { -ms-overflow-style: none; scrollbar-width: none; }' +
    ':root { --fc-page-bg-color: transparent !important; --fc-neutral-bg-color: transparent !important; --fc-border-color: transparent !important; }' +
    '#fr-events-calendar { max-width: 100%; margin: 0 auto; min-height: 800px; }' +
    '#fr-events-calendar *, .fc *, .fc-theme-standard td, .fc-theme-standard th, .fc-theme-standard .fc-scrollgrid, .fc-header-toolbar, .fc-col-header-cell { background-color: transparent !important; background: transparent !important; border-color: transparent !important; }' +
    '.fc-daygrid-day-frame { background-color: transparent !important; }' +
    '.fc-scrollgrid { border: none; }' +
    '.fc-daygrid-day-frame { min-height: 130px; background-color: transparent !important; border: none; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.05); border-radius: 8px; padding: 2px; }' +
    '.fc-daygrid-day-number { font-weight: 600; color: var(--brand-green); margin: 2px; }' +
    '.fc-daygrid-day-events { max-height: none !important; }' +
    '.fc-daygrid-event-harness { height: auto !important; margin-bottom: 4px; }' +
    '.fc-daygrid-event { height: auto !important; white-space: normal; padding: 0; overflow: hidden; border-radius: 12px; box-shadow: 0 3px 6px rgba(0,0,0,0.1); transition: transform 0.2s; }' +
    '.fc-daygrid-event:hover { transform: translateY(-2px); box-shadow: 0 6px 12px rgba(0,0,0,0.15); }' +
    '.fc-daygrid-day-events, .fc-daygrid-event-harness, .fc-daygrid-event { width: 100%; max-width: 100%; box-sizing: border-box; margin: 0; }' +
    '.fr-event-card { display: flex; flex-direction: column; font-size: 11px; color: #fff; width: 100%; box-sizing: border-box; min-height: 200px; font-family: "Baloo 2", sans-serif; }' +
    '.fr-event-card img { width: 100%; height: 150px; object-fit: cover; display: block; }' +
    '.fr-event-title { padding: 6px; font-weight: 600; font-size: 15px; }' +
    '.fr-event-time { padding: 0 6px 6px; font-size: 12px; opacity: 0.9; }' +
    '.fc-day-today .fc-daygrid-day-frame { background: rgba(248,201,100,0.35) !important; box-shadow: 0 0 0 2px rgba(248,201,100,0.9), inset 0 0 0 1px rgba(0,0,0,0.06); }' +
    '.fc-day-today .fc-daygrid-day-number { color: var(--brand-pink); font-weight: 700; }' +
    '@media (max-width: 600px) {' +
      '.fc-daygrid-day-frame { min-height: auto; padding: 2px; }' +
      '.fc-daygrid-day-events { max-height: none !important; }' +
      '.fc-daygrid-event-harness { height: auto !important; }' +
      '.fc-daygrid-event { height: auto !important; }' +
      '.fr-event-title, .fr-event-time { display: none; }' +
      '.fr-event-card { aspect-ratio: 1/1; padding: 0; min-height: 0; }' +
      '.fr-event-card img { width: 100%; height: 100%; max-height: none; object-fit: cover; display: block; }' +
    '}' +
    '.fr-cal-modal-overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.55); z-index: 1000; justify-content: center; align-items: center; }' +
    '.fr-cal-modal-overlay.open { display: flex; }' +
    '.fr-cal-modal { background: transparent; border-radius: 16px; max-width: 900px; width: 95%; max-height: 90%; overflow-y: auto; box-shadow: 0 12px 40px rgba(0,0,0,0.35); position: relative; animation: frCalModalIn 0.2s ease; }' +
    '@keyframes frCalModalIn { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }' +
    '.fr-cal-modal-close { position: absolute; top: 10px; right: 12px; background: rgba(0,0,0,0.45); border: none; color: #fff; font-size: 1.2rem; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 2; transition: background 0.2s; }' +
    '.fr-cal-modal-close:hover { background: rgba(0,0,0,0.7); }' +
    '.fr-cal-modal img { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; }' +
    '.fr-cal-modal-body { padding: 18px 22px 22px; font-family: "Baloo 2", sans-serif; }' +
    '.fr-cal-modal-title { font-size: 1.3rem; font-weight: 700; color: #2d1b4e; margin: 0 0 4px; }' +
    '.fr-cal-modal-meta { font-size: 0.9rem; color: #5c3d91; margin-bottom: 12px; }' +
    '.fr-cal-modal-desc { font-size: 0.95rem; color: #444; line-height: 1.5; white-space: pre-line; margin-bottom: 14px; }' +
    '.fr-cal-modal-tickets { display: inline-block; background: var(--brand-pink); color: #fff; border: none; padding: 10px 24px; border-radius: 10px; font-size: 0.95rem; font-weight: 600; cursor: pointer; text-decoration: none; transition: background 0.2s; }' +
    '.fr-cal-modal-tickets:hover { background: var(--brand-orange); }';
  document.head.appendChild(style);

  // ── Helpers ──
  function esc(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function openCalendarModal(ev) {
    closeCalendarModal();

    var imgHtml = ev.thumbnail
      ? '<img src="' + esc(ev.thumbnail) + '" alt="' + esc(ev.title) + '" />'
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
      ? '<div class="fr-cal-modal-desc">' + esc(ev.description) + '</div>'
      : '';

    var ticketsHtml = ev.url
      ? '<a class="fr-cal-modal-tickets" href="' + esc(ev.url) + '" target="_blank">Get Tickets</a>'
      : '';

    var overlay = document.createElement('div');
    overlay.className = 'fr-cal-modal-overlay open';
    overlay.id = 'fr-cal-modal-overlay';
    overlay.innerHTML =
      '<div class="fr-cal-modal">' +
        '<button class="fr-cal-modal-close" id="fr-cal-modal-close">&times;</button>' +
        imgHtml +
        '<div class="fr-cal-modal-body">' +
          '<h2 class="fr-cal-modal-title">' + esc(ev.title) + '</h2>' +
          '<div class="fr-cal-modal-meta">' + meta + '</div>' +
          descHtml +
          ticketsHtml +
        '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    overlay.querySelector('#fr-cal-modal-close').addEventListener('click', closeCalendarModal);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeCalendarModal(); });
  }

  function closeCalendarModal() {
    var existing = document.getElementById('fr-cal-modal-overlay');
    if (existing) existing.remove();
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
    // Wait for FullCalendar
    await loadScript('https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js');

    var calendarEl = document.getElementById('fr-events-calendar');
    if (!calendarEl) {
      console.error('calendar-embed.js: no #fr-events-calendar element found');
      return;
    }
    calendarEl.style.position = 'relative';

    var events = [];
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
        var title = typeof event.title === 'string' ? event.title.trim() : '';
        var start = typeof event.start === 'string' ? event.start : '';
        if (!title || !start) continue;

        var key = (typeof event.id === 'string' && event.id.trim())
          ? 'id:' + event.id.trim()
          : title + '::' + start + '::' + (event.end || '');
        byKey.set(key, event);
      }

      events = Array.from(byKey.values()).sort(function (a, b) {
        return String(a.start || '').localeCompare(String(b.start || ''));
      });
    } catch (err) {
      console.error('Failed to load calendar data files', err);
    }

    var calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: 'dayGridMonth',
      height: 'auto',
      events: events,

      eventClick: function (info) {
        var props = info.event.extendedProps;
        var hasDesc = !!(props.description && props.description.trim());
        info.jsEvent.preventDefault();

        if (hasDesc) {
          openCalendarModal({
            title: info.event.title,
            start: info.event.start ? info.event.start.toISOString() : '',
            end: info.event.end ? info.event.end.toISOString() : '',
            thumbnail: props.thumbnail || '',
            description: props.description || '',
            url: info.event.url || ''
          });
        } else if (info.event.url) {
          window.open(info.event.url, '_blank');
        } else {
          openCalendarModal({
            title: info.event.title,
            start: info.event.start ? info.event.start.toISOString() : '',
            end: info.event.end ? info.event.end.toISOString() : '',
            thumbnail: props.thumbnail || '',
            description: props.description || ''
          });
        }
      },

      eventContent: function (info) {
        var props = info.event.extendedProps;
        var thumbnail = props.thumbnail;
        var title = info.event.title;

        var palette = [
          getComputedStyle(document.documentElement).getPropertyValue('--brand-pink').trim(),
          getComputedStyle(document.documentElement).getPropertyValue('--brand-blue').trim(),
          getComputedStyle(document.documentElement).getPropertyValue('--brand-green').trim(),
          getComputedStyle(document.documentElement).getPropertyValue('--brand-yellow').trim(),
          getComputedStyle(document.documentElement).getPropertyValue('--brand-orange').trim()
        ];

        var color = palette[Math.floor(Math.random() * palette.length)];

        var container = document.createElement('div');
        container.className = 'fr-event-card';
        container.style.background =
          'linear-gradient(135deg, ' + color + ' 0%, ' + color + ' 80%, rgba(255,255,255,0.15) 100%)';

        if (thumbnail) {
          var img = document.createElement('img');
          img.src = thumbnail;
          img.alt = title;
          container.appendChild(img);
        }

        var titleEl = document.createElement('div');
        titleEl.className = 'fr-event-title';
        titleEl.textContent = title;
        container.appendChild(titleEl);

        return { domNodes: [container] };
      }
    });

    calendar.render();
  }

  // Run on DOMContentLoaded or immediately if already loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
