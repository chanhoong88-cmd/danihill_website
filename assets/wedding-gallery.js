/* Homepage wedding gallery preview — scroll-driven motion for variants A, B and C.
   Reads the page scroll each frame (works with Lenis smooth scroll), only while the section is near the viewport.
   Reduced-motion visitors and phones get the static layouts defined in wedding-gallery.css. */
(function () {
  'use strict';
  var sec = document.getElementById('wedding-gallery');
  if (!sec) return;
  var mm = function (q) { return window.matchMedia && window.matchMedia(q).matches; };
  var reduce = mm('(prefers-reduced-motion: reduce)');
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var ease = function (t) { return 1 - Math.pow(1 - t, 3); };           // easeOutCubic
  var easeIO = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

  /* ---- variant switcher (preview only) ---- */
  var params = new URLSearchParams(location.search);
  var v = (params.get('v') || 'a').toLowerCase();
  if ('abc'.indexOf(v) < 0) v = 'a';
  function setV(x) {
    v = x; sec.dataset.v = x;
    document.querySelectorAll('.wg-switch button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === x ? 'true' : 'false'); });
    try { history.replaceState(null, '', '?v=' + x + '#wedding-gallery'); } catch (e) {}
    if (window.lenis) window.lenis.resize();
    revealAll(); frame();
  }
  document.querySelectorAll('.wg-switch button').forEach(function (b) {
    b.addEventListener('click', function () { setV(b.dataset.v); var t = sec.getBoundingClientRect().top + scrollY - 40; window.lenis ? window.lenis.scrollTo(t, { duration: 1.2 }) : scrollTo({ top: t, behavior: 'smooth' }); });
  });

  /* ---- reveal-on-enter (headings, C curtains) ---- */
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -12% 0px', threshold: .15 }) : null;
  function revealAll() {
    if (reduce) sec.querySelectorAll('.wg-c figure').forEach(function (f) { f.classList.add('in'); });
    sec.querySelectorAll('.wg-rv').forEach(function (el) {
      if (reduce || !io) el.classList.add('in'); else if (!el.classList.contains('in')) io.observe(el);
    });
  }

  /* ---- A · film strip ---- */
  var A = sec.querySelector('.wg-a');
  function runA() {
    var pin = A.querySelector('.pin'), track = A.querySelector('.track');
    if (mm('(max-width:760px)')) return;
    var r = pin.getBoundingClientRect(), vh = innerHeight;
    var p = clamp(-r.top / (r.height - vh), 0, 1);
    var dist = track.scrollWidth - innerWidth;
    var x = -easeIO(p) * dist;
    track.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0)';
    var imgs = track.querySelectorAll('figure img'), vw = innerWidth;
    imgs.forEach(function (img) {
      var fr = img.parentNode.getBoundingClientRect();
      var c = (fr.left + fr.width / 2 - vw / 2) / vw;           // -1..1 across the screen
      img.style.transform = 'translate3d(' + (-c * 7).toFixed(2) + '%,0,0)';
    });
    A.querySelector('.bar i').style.transform = 'scaleX(' + p.toFixed(4) + ')';
    var n = imgs.length, k = clamp(Math.round(p * (n - 1)) + 1, 1, n);
    A.querySelector('.count').textContent = String(k).padStart(2, '0') + ' / ' + String(n).padStart(2, '0');
  }

  /* ---- B · zoom-out mosaic ---- */
  var B = sec.querySelector('.wg-b');
  function runB() {
    var pin = B.querySelector('.pin'), stick = B.querySelector('.stick'), cells = B.querySelectorAll('.cell');
    if (mm('(max-width:760px)')) return;
    var r = pin.getBoundingClientRect(), vh = innerHeight;
    var p = clamp(-r.top / (r.height - vh), 0, 1);
    var t = ease(clamp((p - .08) / .72, 0, 1));                   // hold a beat, then zoom out
    var c = B.querySelector('.cell.c'), cr = c.offsetWidth, ch = c.offsetHeight;
    var s0 = Math.max(innerWidth / cr, vh / ch) * 1.02;           // start: centre photo covers the screen
    var s = s0 + (1 - s0) * t;
    c.style.transform = 'scale(' + s.toFixed(4) + ')';
    cells.forEach(function (el) {
      if (el === c) return;
      var dx = +el.dataset.x, dy = +el.dataset.y, d = (1 - t);
      var stagger = clamp((t - (+el.dataset.k) * .05) / (1 - .4), 0, 1);
      var o = ease(stagger);
      el.style.opacity = o.toFixed(3);
      el.style.transform = 'translate3d(' + (dx * d * 38).toFixed(2) + 'vw,' + (dy * d * 30).toFixed(2) + 'vh,0) scale(' + (0.86 + 0.14 * o).toFixed(3) + ')';
    });
    stick.classList.toggle('done', t > .97);
  }

  /* ---- C · parallax columns ---- */
  var C = sec.querySelector('.wg-c');
  function runC() {
    var vh = innerHeight;
    // curtain reveal: a clipped photo is invisible to IntersectionObserver, so check position each frame
    C.querySelectorAll('figure:not(.in)').forEach(function (f) { if (f.getBoundingClientRect().top < vh * .9) f.classList.add('in'); });
    if (mm('(max-width:760px)')) return;
    var r = C.getBoundingClientRect();
    var p = clamp((vh - r.top) / (r.height + vh), 0, 1) - .5;     // -0.5..0.5 as it passes
    var speeds = [-90, 70, -140];
    C.querySelectorAll('.col').forEach(function (col, i) { col.style.transform = 'translate3d(0,' + (p * speeds[i]).toFixed(1) + 'px,0)'; });
  }

  /* ---- loop, only while on screen ---- */
  var near = false, raf = 0;
  function frame() {
    if (reduce) return;
    if (v === 'a') runA(); else if (v === 'b') runB(); else runC();
  }
  function loop() { frame(); raf = near ? requestAnimationFrame(loop) : 0; }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { near = es[0].isIntersecting; if (near && !raf) raf = requestAnimationFrame(loop); }, { rootMargin: '200px 0px' }).observe(sec);
  } else { addEventListener('scroll', frame, { passive: true }); }
  addEventListener('resize', frame);

  setV(v);
})();
