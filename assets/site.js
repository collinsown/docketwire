/* Docket Wire: small enhancements. The site works without this file. */
(function () {
  'use strict';

  /* Filters on the dockets page. Items carry data-search plus one data-* attribute per filter;
     an attribute can hold several values separated by "|". */
  var form = document.querySelector('[data-filter-form]');
  if (form) {
    var items = Array.prototype.slice.call(document.querySelectorAll('[data-item]'));
    var countEl = form.querySelector('[data-filter-count]');
    var emptyEl = document.querySelector('[data-filter-empty]');
    var fields = Array.prototype.slice.call(form.querySelectorAll('input[name], select[name]'));
    var params = new URLSearchParams(location.search);
    fields.forEach(function (f) {
      var v = params.get(f.name);
      if (v !== null && (f.tagName !== 'SELECT' || f.querySelector('option[value="' + v.replace(/"/g, '') + '"]'))) f.value = v;
    });
    var apply = function () {
      var shown = 0;
      var query = new URLSearchParams();
      var q = '';
      var picks = [];
      fields.forEach(function (f) {
        var v = f.value.trim();
        if (!v) return;
        query.set(f.name, v);
        if (f.name === 'q') q = v.toLowerCase();
        else picks.push([f.name, v]);
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

  /* Cause list: drop dates that have passed since the site was last built. */
  var today = new Date();
  var iso = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  document.querySelectorAll('.ci[data-end]').forEach(function (el) {
    if (el.getAttribute('data-end') < iso) el.hidden = true;
  });
  document.querySelectorAll('.cl-group').forEach(function (g) {
    if (!g.querySelector('.ci:not([hidden])')) g.hidden = true;
  });

  /* Copy a docket citation. */
  var copyText = function (text, btn, done) {
    var restore = btn.textContent;
    var ok = function () { btn.textContent = done; setTimeout(function () { btn.textContent = restore; }, 1800); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(ok, function () {});
    else {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) { /* nothing to do */ }
      document.body.removeChild(ta);
    }
  };
  var citeBtn = document.querySelector('[data-copy-cite]');
  var cite = document.querySelector('[data-cite]');
  if (citeBtn && cite) {
    citeBtn.hidden = false;
    citeBtn.addEventListener('click', function () {
      var text = cite.textContent.trim();
      if (!cite.querySelector('[data-cite-url]')) text += ', ' + location.href.split('#')[0];
      copyText(text, citeBtn, 'Copied');
    });
  }

  /* Share buttons on explainers: fill in local links and offer copy. */
  var share = document.querySelector('[data-share]');
  if (share) {
    var url = location.href.split('#')[0];
    var title = share.getAttribute('data-title') || document.title;
    var e = encodeURIComponent;
    var links = {
      linkedin: 'https://www.linkedin.com/sharing/share-offsite/?url=' + e(url),
      whatsapp: 'https://wa.me/?text=' + e(title + ' ' + url),
      x: 'https://twitter.com/intent/tweet?text=' + e(title) + '&url=' + e(url),
      email: 'mailto:?subject=' + e(title) + '&body=' + e(url)
    };
    share.querySelectorAll('[data-net]').forEach(function (a) {
      if (a.getAttribute('href') === '#') a.setAttribute('href', links[a.getAttribute('data-net')]);
    });
    var copy = share.querySelector('[data-copy]');
    if (copy) {
      copy.hidden = false;
      copy.addEventListener('click', function () { copyText(url, copy, 'Link copied'); });
    }
  }
})();
