/* Dani Hill site script: consent, analytics events, campaign attribution, enquiry forms.
   Analytics events never carry names, phone numbers, emails or typed messages. */
(function () {
  'use strict';

  // ---- Configuration -------------------------------------------------------
  // Paste your Google Tag Manager container ID here (e.g. 'GTM-XXXXXXX') once the
  // container has been cleaned of the old Wix page-load conversion tags.
  var GTM_ID = 'GTM-PSR5GD2Z';
  var WHATSAPP = '601162265257';
  var ENDPOINT = '/api/enquiry';

  var w = window, d = document;
  var ls = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  // ---- Consent Mode + GTM ----------------------------------------------------
  w.dataLayer = w.dataLayer || [];
  function gtag() { w.dataLayer.push(arguments); }
  var saved = ls.get('dh_consent');
  gtag('consent', 'default', {
    ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    wait_for_update: 500
  });
  if (saved && saved.choice === 'granted') applyConsent('granted');
  function applyConsent(choice) {
    var v = choice === 'granted' ? 'granted' : 'denied';
    gtag('consent', 'update', { ad_storage: v, analytics_storage: v, ad_user_data: v, ad_personalization: v });
  }
  if (GTM_ID) {
    w.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    var s = d.createElement('script'); s.async = true;
    s.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(GTM_ID);
    d.head.appendChild(s);
  }

  function track(event, params) {
    var o = { event: event, page: location.pathname };
    for (var k in params) if (Object.prototype.hasOwnProperty.call(params, k)) o[k] = params[k];
    w.dataLayer.push(o);
  }
  w.dhTrack = track;

  function consentBanner() {
    if (ls.get('dh_consent')) return;
    var b = d.createElement('div');
    b.className = 'consent'; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'Cookie choices');
    b.innerHTML = '<p>We use cookies to understand how visitors use this site and to measure our advertising. ' +
      'See our <a href="privacy.html">privacy notice</a>.</p>' +
      '<div class="consent-actions"><button type="button" class="btn btn-line ink" data-c="denied">Decline</button>' +
      '<button type="button" class="btn btn-dark" data-c="granted">Accept</button></div>';
    b.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-c]'); if (!btn) return;
      var c = btn.getAttribute('data-c');
      ls.set('dh_consent', { choice: c, at: Date.now() });
      applyConsent(c);
      b.remove();
    });
    d.body.appendChild(b);
  }

  // ---- Campaign attribution (kept with the lead, not sent to analytics) ------
  var ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'gbraid', 'wbraid', 'fbclid'];
  function captureAttribution() {
    var q = new URLSearchParams(location.search), hit = {}, any = false;
    ATTR_KEYS.forEach(function (k) { var v = q.get(k); if (v) { hit[k] = v.slice(0, 200); any = true; } });
    var ref = d.referrer && d.referrer.indexOf(location.host) === -1 ? d.referrer.split('?')[0] : '';
    var last = ls.get('dh_attr_last');
    if (any || !last) {
      hit.landing_page = location.pathname; hit.referrer = ref; hit.at = Date.now();
      ls.set('dh_attr_last', hit);
      var first = ls.get('dh_attr_first');
      if (!first || Date.now() - first.at > 90 * 864e5) {
        ls.set('dh_attr_first', { source: hit.utm_source || (ref ? ref.replace(/^https?:\/\//, '').split('/')[0] : 'direct'), at: Date.now() });
      }
    }
  }
  function attribution() {
    var a = ls.get('dh_attr_last') || {}, f = ls.get('dh_attr_first') || {}, out = {};
    ATTR_KEYS.concat(['landing_page', 'referrer']).forEach(function (k) { if (a[k]) out[k] = a[k]; });
    if (f.source) out.first_touch_source = f.source;
    return out;
  }
  function sourceCode() {
    var a = ls.get('dh_attr_last') || {};
    var s = a.utm_source || (a.gclid || a.gbraid || a.wbraid ? 'google' : a.fbclid ? 'meta' : 'web');
    return String(s).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'WEB';
  }

  // ---- WhatsApp links carry a reference code instead of personal details -----
  function tagWhatsApp() {
    d.querySelectorAll('a[data-wa]').forEach(function (a) {
      var kind = a.getAttribute('data-wa');
      var msg = {
        wedding: "Hi Dani Hill, I'd like to check a wedding date.",
        viewing: "Hi Dani Hill, I'd like to book a site visit.",
        stay: "Hi Dani Hill, I'd like to plan a stay."
      }[kind] || 'Hi Dani Hill.';
      var ref = { wedding: 'WED', viewing: 'VIEW', stay: 'STAY' }[kind] || 'GEN';
      a.href = 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(msg + ' (Ref: ' + ref + '-' + sourceCode() + ')');
    });
  }

  // ---- Click tracking ----------------------------------------------------------
  d.addEventListener('click', function (e) {
    var a = e.target.closest('a,button'); if (!a) return;
    var loc = a.getAttribute('data-loc') || (a.closest('[id]') ? a.closest('[id]').id : '');
    if (a.hasAttribute('data-cta')) track('cta_click', { cta_type: a.getAttribute('data-cta'), cta_location: loc, cta_text: (a.textContent || '').trim().slice(0, 60) });
    if (a.tagName === 'A' && /wa\.me\//.test(a.getAttribute('href') || '')) track('whatsapp_click', { cta_location: loc, wa_type: a.getAttribute('data-wa') || 'general' });
    if (a.hasAttribute('data-brochure')) track('brochure_download', { file_name: a.getAttribute('data-brochure'), cta_location: loc });
  });

  // ---- Enquiry forms -------------------------------------------------------------
  var SUBMIT_EVENT = { wedding: 'wedding_enquiry_submit', viewing: 'viewing_request_submit', stay: 'stay_enquiry_submit' };
  function guestBand(n) {
    n = parseInt(n, 10); if (!n) return 'unknown';
    return n < 50 ? 'under_50' : n < 100 ? '50_99' : n < 200 ? '100_199' : n <= 300 ? '200_300' : n <= 500 ? '301_500' : 'over_500';
  }
  function safeParams(type, data) {
    if (type === 'wedding') return { guest_band: guestBand(data.guests), event_month: (data.event_date || '').slice(0, 7) || 'unknown', stay_interest: /^Yes/.test(data.stay || '') ? 'yes' : (data.stay === 'No' ? 'no' : 'unsure'), guest_country: data.country || 'not_asked' };
    if (type === 'viewing') return { slot_type: /Weekend/.test(data.visit_slot || '') ? 'weekend' : (data.visit_slot ? 'weekday' : 'unknown'), attending: data.attending || 'unknown' };
    return { residence: data.residence || 'unknown', purpose: data.purpose || 'unknown', guest_band: guestBand(data.guests) };
  }

  function initForm(f) {
    var type = f.getAttribute('data-form'), started = false, t0 = Date.now();
    var status = f.querySelector('.form-status'), btn = f.querySelector('button[type="submit"]');
    f.addEventListener('focusin', function () {
      if (started) return; started = true; t0 = Date.now();
      track('enquiry_start', { form_type: type });
    });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var data = {}, fd = new FormData(f);
      fd.forEach(function (v, k) { data[k] = typeof v === 'string' ? v.trim() : v; });
      var problem = '';
      if (!data.name) problem = 'Please add your name.';
      else if (!data.phone && !data.email) problem = 'Please add a phone number or email so we can reply.';
      else if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) problem = 'Please check your email address.';
      else if (!f.querySelector('[name="consent"]').checked) problem = 'Please tick the box so we can contact you about this enquiry.';
      if (problem) { show(status, problem, 'error'); return; }
      var payload = { form_type: type, consent: true, page: location.pathname, elapsed_ms: Date.now() - t0, attribution: attribution() };
      Object.keys(data).forEach(function (k) { if (k !== 'consent') payload[k] = data[k]; });
      btn.disabled = true; var label = btn.textContent; btn.textContent = 'Sending…';
      show(status, '', '');
      // Never leave the button on "Sending…": give up after 20 seconds.
      var ctrl = w.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);
      fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok && j.ok, j: j }; }, function () { return { ok: false, j: {} }; }); })
        .then(function (res) {
          clearTimeout(timer);
          if (!res.ok) throw new Error(res.j && res.j.error);
          track(SUBMIT_EVENT[type], Object.assign({ form_type: type }, safeParams(type, data)));
          btn.textContent = 'Sent ✓';
          var done = f.parentNode.querySelector('[data-done="' + type + '"]');
          if (done) {
            var ref = done.querySelector('.ref'); if (ref) ref.textContent = res.j.lead_id || '';
            var em = done.querySelector('.email-note');
            if (em) em.hidden = !(data.email && res.j.email_sent);
            setTimeout(function () { f.hidden = true; done.hidden = false; done.focus(); }, 900);
          }
        })
        .catch(function () {
          clearTimeout(timer);
          btn.disabled = false; btn.textContent = label;
          show(status, 'Sorry, your enquiry could not be sent just now. Please try again, or message us on WhatsApp at 011-6226 5257.', 'error');
        });
    });
  }
  function show(el, msg, kind) {
    if (!el) return; el.textContent = msg; el.className = 'form-status' + (kind ? ' ' + kind : '');
  }

  // ---- Boot ----------------------------------------------------------------------
  function boot() {
    captureAttribution();
    tagWhatsApp();
    d.querySelectorAll('form[data-form]').forEach(initForm);
    d.querySelectorAll('.menu-panel a').forEach(function (x) { x.addEventListener('click', function () { x.closest('details').removeAttribute('open'); }); });
    consentBanner();
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot); else boot();
})();
