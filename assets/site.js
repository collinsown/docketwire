/* Docket Wire: enhancements. Every page works without this file. */
(function () {
  'use strict';

  var ROOT = document.documentElement.getAttribute('data-root') || './';
  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('dw:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('dw:' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  var now = new Date();
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var TODAY = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  var dayNum = function (iso) { return Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) || 1) / 864e5; };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var copyText = function (text, btn, done) {
    var restore = btn.textContent;
    var ok = function () { btn.textContent = done; setTimeout(function () { btn.textContent = restore; }, 1800); };
    if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(ok, function () {}); return; }
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); ok(); } catch (e) { /* nothing to do */ }
    document.body.removeChild(ta);
  };
  var pageUrl = function () { return location.href.split('#')[0]; };
  var motion = 'IntersectionObserver' in window && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- filters on the dockets page ---------- */
  var form = $('[data-filter-form]');
  if (form) {
    var items = $$('[data-item]');
    var countEl = $('[data-filter-count]', form);
    var emptyEl = $('[data-filter-empty]');
    var fields = $$('input[name], select[name]', form);
    var params = new URLSearchParams(location.search);
    fields.forEach(function (f) {
      var v = params.get(f.name);
      if (v !== null && (f.tagName !== 'SELECT' || f.querySelector('option[value="' + v.replace(/"/g, '') + '"]'))) f.value = v;
    });
    var apply = function () {
      var shown = 0, query = new URLSearchParams(), q = '', picks = [];
      fields.forEach(function (f) {
        var v = f.value.trim();
        if (!v) return;
        query.set(f.name, v);
        if (f.name === 'q') q = v.toLowerCase(); else picks.push([f.name, v]);
      });
      items.forEach(function (el) {
        var ok = (!q || (el.getAttribute('data-search') || '').indexOf(q) !== -1) && picks.every(function (p) {
          return (el.getAttribute('data-' + p[0]) || '').split('|').indexOf(p[1]) !== -1;
        });
        el.hidden = !ok;
        if (ok) shown++;
      });
      if (countEl) countEl.textContent = shown + (shown === 1 ? ' docket' : ' dockets');
      if (emptyEl) emptyEl.hidden = shown !== 0;
      var qs = query.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    };
    fields.forEach(function (f) { f.addEventListener(f.tagName === 'SELECT' ? 'change' : 'input', apply); });
    form.hidden = false;
    apply();
  }

  /* ---------- cause list: drop passed dates, count down to the rest ---------- */
  $$('.ci[data-end]').forEach(function (el) { if (el.getAttribute('data-end') < TODAY) el.hidden = true; });
  $$('.cl-group').forEach(function (g) { if (!$('.ci:not([hidden])', g)) g.hidden = true; });
  $$('.ci.ci-day[data-end]:not([hidden])').forEach(function (li) {
    var n = Math.round(dayNum(li.getAttribute('data-end')) - dayNum(TODAY));
    if (n < 0 || n > 60) return;
    var small = $('.ci-date span', li);
    var about = small && /approx/.test(small.textContent) ? 'about ' : '';
    var tag = document.createElement('span');
    tag.className = 'ci-rel' + (n <= 7 ? ' is-soon' : '');
    tag.textContent = n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : 'In ' + about + n + ' days';
    var body = $('.ci-body', li);
    if (body) body.insertBefore(tag, body.firstChild);
  });

  /* ---------- tooltips for gates, timeline points and the matrix ---------- */
  $$('.track-sm .gate[title]').forEach(function (li) { li.setAttribute('data-tip', li.getAttribute('title')); li.removeAttribute('title'); });
  var tip = document.createElement('div');
  tip.className = 'tip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true;
  document.body.appendChild(tip);
  var tipFor = null, lastPointer = 'mouse';
  var placeTip = function (el) {
    var r = el.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    var x = Math.max(8, Math.min(r.left + r.width / 2 - tw / 2, window.innerWidth - tw - 8));
    var y = r.top - th - 10;
    if (y < 8) y = r.bottom + 10;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  };
  var showTip = function (el) {
    var text = el.getAttribute('data-tip');
    if (!text) return;
    tip.innerHTML = text.split('\n').map(function (line, i) { return i ? '<span>' + esc(line) + '</span>' : '<strong>' + esc(line) + '</strong>'; }).join('');
    tip.hidden = false; tipFor = el; placeTip(el);
  };
  var hideTip = function () { tip.hidden = true; tipFor = null; };
  var tipTarget = function (e) { return e.target && e.target.closest ? e.target.closest('[data-tip]') : null; };
  document.addEventListener('pointerdown', function (e) { lastPointer = e.pointerType; }, true);
  document.addEventListener('pointerover', function (e) { var el = tipTarget(e); if (el && e.pointerType !== 'touch') showTip(el); });
  document.addEventListener('pointerout', function (e) { var el = tipTarget(e); if (el && (!e.relatedTarget || !el.contains(e.relatedTarget))) hideTip(); });
  document.addEventListener('focusin', function (e) { var el = tipTarget(e); if (el) showTip(el); });
  document.addEventListener('focusout', function (e) { if (tipTarget(e)) hideTip(); });
  document.addEventListener('click', function (e) {
    var el = tipTarget(e);
    if (!el) { if (tipFor) hideTip(); return; }
    if (lastPointer === 'touch' && tipFor !== el) { e.preventDefault(); showTip(el); }
  }, true);
  window.addEventListener('scroll', function () { if (tipFor) hideTip(); }, { passive: true });

  /* ---------- the timeline ---------- */
  $$('[data-tl]').forEach(function (tl) {
    var sc = $('.tl-scroll', tl);
    var start = +tl.getAttribute('data-start'), end = +tl.getAttribute('data-end'), W = +tl.getAttribute('data-w');
    var mark = $('[data-tl-today]', tl);
    var x = ((now.getTime() - start) / (end - start)) * W;
    var toToday = function (smooth) { sc.scrollTo({ left: Math.max(0, x - sc.clientWidth * 0.62), behavior: smooth ? 'smooth' : 'auto' }); };
    toToday(false);
    if (mark && x > 0 && x < W) {
      var bx = +mark.getAttribute('data-x');
      var land = 'translateX(' + (x - bx).toFixed(1) + 'px)';
      if (motion) {
        mark.style.transform = 'translateX(' + (sc.scrollLeft - bx).toFixed(1) + 'px)';
        requestAnimationFrame(function () { requestAnimationFrame(function () { mark.style.transition = 'transform 1.4s cubic-bezier(.2,.7,.2,1)'; mark.style.transform = land; }); });
      } else mark.style.transform = land;
    }
    var jump = $('[data-tl-jump]');
    if (jump) { jump.hidden = false; jump.addEventListener('click', function () { toToday(true); sc.focus({ preventScroll: true }); }); }
    var down = null, moved = false;
    sc.addEventListener('pointerdown', function (e) { if (e.pointerType === 'mouse' && e.button === 0) { down = { x: e.clientX, left: sc.scrollLeft }; moved = false; } });
    window.addEventListener('pointermove', function (e) {
      if (!down) return;
      var dx = e.clientX - down.x;
      if (!moved && Math.abs(dx) > 4) { moved = true; sc.classList.add('is-dragging'); hideTip(); }
      if (moved) sc.scrollLeft = down.left - dx;
    });
    window.addEventListener('pointerup', function () { if (!down) return; down = null; setTimeout(function () { moved = false; sc.classList.remove('is-dragging'); }, 0); });
    sc.addEventListener('click', function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); } }, true);
    sc.addEventListener('scroll', function () { if (tipFor) hideTip(); }, { passive: true });
  });

  /* ---------- following dockets and what is new ---------- */
  var follows = store.get('follow', []);
  var seen = store.get('seen', {});
  var isOn = function (slug) { return follows.indexOf(slug) !== -1; };
  var saveFollow = function () { store.set('follow', follows); store.set('seen', seen); };
  var rowFor = function (slug) { return $('.board-row[data-docket="' + slug + '"]'); };
  var paintRows = function () {
    $$('.board-row[data-docket]').forEach(function (row) {
      var slug = row.getAttribute('data-docket'), last = row.getAttribute('data-last') || '';
      row.classList.toggle('is-followed', isOn(slug));
      row.classList.toggle('has-new', isOn(slug) && Boolean(last) && Boolean(seen[slug]) && last > seen[slug]);
    });
    $$('[data-following]').forEach(function (box) {
      var rows = follows.map(rowFor).filter(Boolean);
      box.hidden = !rows.length;
      if (!rows.length) { box.innerHTML = ''; return; }
      box.innerHTML = '<p class="fl-h">Following</p>' + rows.map(function (row) {
        var a = $('.br-main', row), title = $('h3', row).textContent;
        return '<a class="fl-chip" href="' + a.getAttribute('href') + '"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.8l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z"/></svg>' + esc(title) + (row.classList.contains('has-new') ? '<span class="fl-new">New</span>' : '') + '</a>';
      }).join('');
    });
  };
  $$('[data-follow]').forEach(function (btn) {
    var slug = btn.getAttribute('data-follow');
    var host = btn.closest('[data-docket]');
    var title = host && $('h3, h1', host) ? $('h3, h1', host).textContent : 'this docket';
    var paint = function () {
      var on = isOn(slug);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.classList.toggle('is-on', on);
      var label = $('span', btn);
      if (label) label.textContent = on ? 'Following' : 'Follow';
      if (btn.classList.contains('follow-icon')) btn.setAttribute('aria-label', (on ? 'Stop following ' : 'Follow ') + title);
    };
    btn.hidden = false;
    paint();
    btn.addEventListener('click', function () {
      if (isOn(slug)) follows = follows.filter(function (s) { return s !== slug; });
      else { follows.push(slug); if (!seen[slug] && host) seen[slug] = host.getAttribute('data-last') || TODAY; }
      saveFollow(); paint(); paintRows();
    });
  });
  var docket = $('article.docket[data-docket]');
  if (docket) {
    var slug = docket.getAttribute('data-docket'), last = docket.getAttribute('data-last') || '', before = seen[slug];
    if (before) $$('.sheet li[data-date]').forEach(function (li) {
      if (li.getAttribute('data-date') > before) {
        li.classList.add('is-new');
        var no = $('.sh-date', li);
        if (no) no.insertAdjacentHTML('beforeend', '<span class="is-new-badge">New</span>');
      }
    });
    if (last) { seen[slug] = last; saveFollow(); }
  }
  paintRows();
  var lastVisit = store.get('visit', null);
  if (lastVisit && lastVisit < TODAY) $$('.wire li[data-date]').forEach(function (li) {
    if (li.getAttribute('data-date') > lastVisit) { var meta = $('.w-meta', li); if (meta) meta.insertAdjacentHTML('beforeend', '<span class="is-new-badge">New since your last visit</span>'); }
  });
  store.set('visit', TODAY);

  /* ---------- docket pages: age, share, save as PDF, links to entries ---------- */
  $$('.dh-age[data-since]').forEach(function (el) {
    var n = Math.round(dayNum(TODAY) - dayNum(el.getAttribute('data-since')));
    if (n > 0) { el.textContent = 'Open for ' + n + ' days'; el.hidden = false; }
  });
  $$('[data-share-native]').forEach(function (btn) {
    btn.hidden = false;
    if (!navigator.share) btn.textContent = 'Copy link';
    btn.addEventListener('click', function () {
      if (navigator.share) navigator.share({ title: document.title, url: pageUrl() }).catch(function () {});
      else copyText(pageUrl(), btn, 'Link copied');
    });
  });
  $$('[data-print]').forEach(function (btn) { btn.hidden = false; btn.addEventListener('click', function () { window.print(); }); });
  $$('.sheet li[id]').forEach(function (li) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'sh-link'; b.textContent = 'Copy link';
    b.setAttribute('aria-label', 'Copy a link to entry ' + li.id.replace('e-', ''));
    b.addEventListener('click', function () { copyText(pageUrl() + '#' + li.id, b, 'Copied'); });
    ($('.sh-body', li) || li).appendChild(b);
  });

  /* ---------- citations and sharing on analysis ---------- */
  var citeBtn = $('[data-copy-cite]'), cite = $('[data-cite]');
  if (citeBtn && cite) {
    citeBtn.hidden = false;
    citeBtn.addEventListener('click', function () {
      var text = cite.textContent.trim();
      if (!$('[data-cite-url]', cite)) text += ', ' + pageUrl();
      copyText(text, citeBtn, 'Copied');
    });
  }
  var share = $('[data-share]');
  if (share) {
    var url = pageUrl(), title = share.getAttribute('data-title') || document.title, e = encodeURIComponent;
    var links = {
      linkedin: 'https://www.linkedin.com/sharing/share-offsite/?url=' + e(url),
      whatsapp: 'https://wa.me/?text=' + e(title + ' ' + url),
      x: 'https://twitter.com/intent/tweet?text=' + e(title) + '&url=' + e(url),
      email: 'mailto:?subject=' + e(title) + '&body=' + e(url)
    };
    $$('[data-net]', share).forEach(function (a) { if (a.getAttribute('href') === '#') a.setAttribute('href', links[a.getAttribute('data-net')]); });
    var copy = $('[data-copy]', share);
    if (copy) { copy.hidden = false; copy.addEventListener('click', function () { copyText(url, copy, 'Link copied'); }); }
  }

  /* ---------- reading progress on analysis ---------- */
  var prose = $('.post-prose');
  if (prose) {
    var bar = document.createElement('div');
    bar.className = 'progress'; bar.setAttribute('aria-hidden', 'true'); bar.innerHTML = '<span></span>';
    document.body.appendChild(bar);
    var fill = bar.firstChild, ticking = false;
    var update = function () {
      ticking = false;
      var r = prose.getBoundingClientRect(), total = Math.max(1, r.height - window.innerHeight * 0.5);
      fill.style.transform = 'scaleX(' + Math.min(1, Math.max(0, (window.innerHeight * 0.25 - r.top) / total)) + ')';
    };
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  /* ---------- search: Ctrl+K, Cmd+K or / from anywhere ---------- */
  var openBtn = $('[data-search-open]');
  var index = null, loading = null, pal = null, input = null, list = null, results = [], active = -1, opener = null;
  var ORDER = { Docket: 0, Regulator: 1, Analysis: 2, Date: 3, Entry: 4, Page: 5 };
  var GROUP = { Docket: 'Dockets', Regulator: 'Regulators and courts', Analysis: 'Analysis', Date: 'Cause list', Entry: 'Docket entries', Page: 'Pages' };
  var norm = function (s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); };
  var load = function () {
    if (!loading) loading = fetch(ROOT + 'search.json').then(function (r) { return r.json(); }).then(function (d) {
      index = d.items.map(function (it) { it._t = norm(it.title); it._s = norm(it.sub); it._k = norm(it.k); return it; });
    }).catch(function () { loading = null; });
    return loading;
  };
  var scoreOf = function (it, toks) {
    var total = 0;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i], at = it._t.indexOf(t);
      if (at === 0) total += 12;
      else if (at > 0) total += /[\s(,:.\-]/.test(it._t.charAt(at - 1)) ? 9 : 5;
      else if (it._k.indexOf(t) !== -1) total += 4;
      else if (it._s.indexOf(t) !== -1) total += 3;
      else return 0;
    }
    return total + (6 - ORDER[it.t]) * 0.4;
  };
  var find = function (q) {
    var toks = norm(q).split(/\s+/).filter(Boolean);
    if (!toks.length) return index.filter(function (it) { return it.t === 'Docket'; }).slice(0, 8).concat(index.filter(function (it) { return it.t === 'Page'; }));
    var scored = [];
    index.forEach(function (it) { var s = scoreOf(it, toks); if (s) scored.push([s, it]); });
    scored.sort(function (a, b) { return b[0] - a[0]; });
    var per = {}, out = [];
    scored.forEach(function (r) { var t = r[1].t; per[t] = (per[t] || 0) + 1; if (per[t] <= 5 && out.length < 18) out.push(r[1]); });
    return out.sort(function (a, b) { return ORDER[a.t] - ORDER[b.t]; });
  };
  var mark = function (text, q) {
    var toks = norm(q).split(/\s+/).map(function (t) { return t.replace(/[^a-z0-9]/g, ''); }).filter(function (t) { return t.length > 1; });
    if (!toks.length) return esc(text);
    return String(text).split(new RegExp('(' + toks.join('|') + ')', 'gi')).map(function (part, i) { return i % 2 ? '<mark>' + esc(part) + '</mark>' : esc(part); }).join('');
  };
  var setActive = function (i) {
    var opts = $$('[role="option"]', list);
    if (!opts.length) { active = -1; input.removeAttribute('aria-activedescendant'); return; }
    active = (i + opts.length) % opts.length;
    opts.forEach(function (o, k) { o.setAttribute('aria-selected', k === active ? 'true' : 'false'); });
    input.setAttribute('aria-activedescendant', opts[active].id);
    opts[active].scrollIntoView({ block: 'nearest' });
  };
  var render = function () {
    if (!index) { list.innerHTML = '<li class="cmdk-empty" role="presentation">Loading the docket...</li>'; return; }
    var q = input.value;
    results = find(q);
    if (!results.length) { list.innerHTML = '<li class="cmdk-empty" role="presentation">Nothing on the docket matches "' + esc(q) + '".</li>'; active = -1; return; }
    var html = '', group = '';
    results.forEach(function (it, k) {
      if (it.t !== group) { group = it.t; html += '<li class="cmdk-group" role="presentation">' + (q.trim() ? GROUP[group] : group === 'Docket' ? 'Dockets' : 'Go to') + '</li>'; }
      html += '<li class="cmdk-opt" role="option" id="cmdk-o-' + k + '" data-k="' + k + '" aria-selected="false"><span class="cmdk-title">' + mark(it.title, q) + '</span>' + (it.sub ? '<span class="cmdk-sub">' + mark(it.sub, q) + '</span>' : '') + '</li>';
    });
    list.innerHTML = html;
    setActive(0);
  };
  var go = function (k) { var it = results[k]; if (it) location.href = ROOT + it.url; };
  var build = function () {
    pal = document.createElement('div');
    pal.className = 'cmdk'; pal.hidden = true;
    pal.innerHTML = '<div class="cmdk-backdrop" data-cmdk-close></div><div class="cmdk-panel" role="dialog" aria-modal="true" aria-label="Search Docket Wire"><div class="cmdk-top"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.75"/><path d="M13 13l4.5 4.5"/></svg><input type="search" role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-autocomplete="list" aria-label="Search dockets, regulators, entries and dates" placeholder="Search dockets, regulators, entries and dates" autocomplete="off" spellcheck="false"><button type="button" class="cmdk-esc" data-cmdk-close>Esc</button></div><ul class="cmdk-list" id="cmdk-list" role="listbox" aria-label="Results"></ul><p class="cmdk-foot"><span><kbd>&uarr;</kbd> <kbd>&darr;</kbd> to move</span><span><kbd>Enter</kbd> to open</span><span><kbd>Esc</kbd> to close</span></p></div>';
    document.body.appendChild(pal);
    input = $('input', pal); list = $('.cmdk-list', pal);
    input.addEventListener('input', render);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); go(active); }
      else if (e.key === 'Tab') { e.preventDefault(); }
    });
    list.addEventListener('click', function (e) { var o = e.target.closest('[role="option"]'); if (o) go(+o.getAttribute('data-k')); });
    list.addEventListener('mousemove', function (e) { var o = e.target.closest('[role="option"]'); if (o && +o.getAttribute('data-k') !== active) setActive(+o.getAttribute('data-k')); });
    $$('[data-cmdk-close]', pal).forEach(function (el) { el.addEventListener('click', close); });
  };
  var open = function () {
    if (!pal) build();
    if (!pal.hidden) return;
    opener = document.activeElement;
    pal.hidden = false; document.body.classList.add('cmdk-open');
    input.value = ''; render(); input.focus();
    load().then(function () { if (!pal.hidden) render(); });
  };
  var close = function () {
    if (!pal || pal.hidden) return;
    pal.hidden = true; document.body.classList.remove('cmdk-open');
    if (opener && opener.focus) opener.focus();
  };
  if (openBtn) {
    openBtn.hidden = false;
    var kbd = $('kbd', openBtn);
    if (kbd && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) kbd.textContent = '\u2318K';
    openBtn.addEventListener('click', open);
    openBtn.addEventListener('mouseenter', load, { once: true });
  }
  document.addEventListener('keydown', function (e) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '') || (e.target && e.target.isContentEditable);
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (pal && !pal.hidden) close(); else open(); }
    else if (e.key === '/' && !typing) { e.preventDefault(); open(); }
    else if (e.key === 'Escape') { if (pal && !pal.hidden) close(); if (tipFor) hideTip(); }
  });

  /* ---------- motion: tracks draw in, docket sheets drop in, counts tick up ---------- */
  var tickUp = function (el) {
    var end = +el.getAttribute('data-count');
    if (!(end > 0)) return;
    var t0 = null, dur = Math.min(1400, 450 + end * 3);
    var step = function (ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      el.textContent = String(Math.round(end * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    };
    el.textContent = '0';
    requestAnimationFrame(step);
  };
  if (motion) {
    var seenIO = new IntersectionObserver(function (list) {
      list.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        seenIO.unobserve(el);
        if (el.hasAttribute('data-count')) tickUp(el);
        else el.classList.add(el.classList.contains('track') ? 'is-drawn' : 'is-in');
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0 });
    $$('.track').forEach(function (t) { t.classList.add('will-draw'); seenIO.observe(t); });
    $$('.sheet').forEach(function (t) { t.classList.add('will-drop'); seenIO.observe(t); });
    $$('.mx').forEach(function (t) { t.classList.add('will-fill'); seenIO.observe(t); });
    $$('[data-count]').forEach(function (t) { seenIO.observe(t); });
  }

  /* ---------- install as an app, and keep pages for offline reading ---------- */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register(ROOT + 'sw.js').catch(function () {}); });
  }
  var installBtn = $('[data-install]'), deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; if (installBtn) installBtn.hidden = false; });
  if (installBtn) installBtn.addEventListener('click', function () {
    if (!deferred) return;
    deferred.prompt();
    deferred.userChoice.then(function () { deferred = null; installBtn.hidden = true; }, function () {});
  });
})();
