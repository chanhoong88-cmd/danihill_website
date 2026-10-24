/* Dani Hill smooth scrolling (Lenis).
   Desktop mouse/trackpad only: touch devices keep native scrolling,
   and visitors who ask for reduced motion keep native scrolling too. */
(function () {
  'use strict';
  if (typeof window.Lenis !== 'function') return;
  var mq = function (q) { return window.matchMedia && window.matchMedia(q).matches; };
  if (mq('(prefers-reduced-motion: reduce)') || !mq('(hover: hover) and (pointer: fine)')) return;

  var lenis = new window.Lenis({
    lerp: 0.075,            // gentle glide: lower = softer, longer ease-out
    wheelMultiplier: 0.85,  // a little less distance per wheel notch
    smoothWheel: true,
    syncTouch: false,
    anchors: { offset: -84 }, // in-page links clear the fixed header
    autoRaf: true
  });
  window.lenis = lenis;

  // Pause while a modal is open (gallery photo viewer, open menu).
  function sync() {
    var modal = document.querySelector('dialog[open]');
    if (modal) lenis.stop(); else lenis.start();
  }
  new MutationObserver(sync).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['open'] });

  // Keep the scroll height right when lazy images load or the gallery filter changes.
  window.addEventListener('load', function () { lenis.resize(); });
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('[role="tab"]')) setTimeout(function () { lenis.resize(); }, 50);
  });
})();
