/* Homepage wedding gallery: pinned film strip that pans sideways as the page scrolls.
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

  /* ---- heading reveal on enter ---- */
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -12% 0px', threshold: .15 }) : null;
  function revealAll() {
    sec.querySelectorAll('.wg-rv').forEach(function (el) {
      if (reduce || !io) el.classList.add('in'); else if (!el.classList.contains('in')) io.observe(el);
    });
  }

  /* ---- film strip ---- */
  var A = sec.querySelector('.wg-a');
  function runA() {
    var pin = A.querySelector('.pin'), track = A.querySelector('.track');
    if (mm('(max-width:760px)')) return;
    var r = pin.getBoundingClientRect(), vh = innerHeight;
    var p = clamp(-r.top / (r.height - vh), 0, 1);
    var last = track.lastElementChild, padR = parseFloat(getComputedStyle(track).paddingRight) || 0;
    var dist = Math.max(0, last.offsetLeft + last.offsetWidth + padR - innerWidth);   // stop with the page margin after the last photo
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

  /* ---- loop, only while on screen ---- */
  var near = false, raf = 0;
  function frame() {
    if (reduce) return;
    runA();
  }
  function loop() { frame(); raf = near ? requestAnimationFrame(loop) : 0; }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { near = es[0].isIntersecting; if (near && !raf) raf = requestAnimationFrame(loop); }, { rootMargin: '200px 0px' }).observe(sec);
  } else { addEventListener('scroll', frame, { passive: true }); }
  addEventListener('resize', frame);

  revealAll(); frame();
})();
