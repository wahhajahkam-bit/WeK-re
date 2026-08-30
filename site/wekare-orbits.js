/* We Käre — comet orbits around the Konsälidön mark.
   Adapted from the reference to run inside a fixed-size container on a light
   ground, rather than full-viewport with a light/dark toggle.

   window.WeKareOrbits.mount(wrapper) — wrapper must contain
   canvas[data-orbit-back], the mark, and canvas[data-orbit-front].
*/
(function () {
  "use strict";
  var TAU = Math.PI * 2, RAD = Math.PI / 180;
  var REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // deeper than the mark so the comets read against it on white
  var PALETTE = ['#6B46E5', '#8A63F0', '#A277F5', '#5C6FE8', '#7C4DD8', '#9B6BE8'];

  // Six rings, never drawn — only the comets riding them are visible. rx tips a
  // ring away from the viewer, rz swings that tipped ring around. The periods
  // share no small common factor, so the crossings never settle into a pattern.
  function orbits() {
    return [
      { r: 0.276, rx: 78, rz: 0,   T: 6.8,  dir: 1,  hue: 0, comets: [{ ph: 0.00, tail: 2.00, w: 5.4, t0: 0.0,  dur: 19.4 }] },
      { r: 0.310, rx: 76, rz: 90,  T: 9.4,  dir: -1, hue: 1, comets: [{ ph: 0.90, tail: 1.70, w: 4.8, t0: 9.6,  dur: 18.8 }] },
      { r: 0.337, rx: 72, rz: 42,  T: 12.3, dir: 1,  hue: 2, comets: [{ ph: 0.00, tail: 1.50, w: 4.4, t0: 3.4,  dur: 19.0 }, { ph: 3.40, tail: 1.15, w: 3.2, t0: 19.2, dur: 18.2 }] },
      { r: 0.363, rx: 70, rz: -46, T: 8.1,  dir: -1, hue: 3, comets: [{ ph: 1.70, tail: 2.30, w: 5.0, t0: 13.0, dur: 19.6 }] },
      { r: 0.324, rx: 34, rz: 18,  T: 15.6, dir: 1,  hue: 4, comets: [{ ph: 2.30, tail: 1.30, w: 4.0, t0: 22.4, dur: 18.6 }] },
      { r: 0.383, rx: 58, rz: 118, T: 10.9, dir: -1, hue: 5, comets: [{ ph: 0.40, tail: 1.90, w: 5.6, t0: 6.2,  dur: 19.2 }, { ph: 2.90, tail: 1.00, w: 3.0, t0: 16.4, dur: 18.0 }] }
    ];
  }

  var SEG = 36;

  function rotX(v, a) { var c = Math.cos(a), s = Math.sin(a); return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]; }
  function rotY(v, a) { var c = Math.cos(a), s = Math.sin(a); return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; }
  function rotZ(v, a) { var c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // Each comet is only alight for part of a shared cycle, so the field thins
  // out and refills instead of showing all eight at once.
  var CYCLE = 26, FADE = 1.4;
  function duty(t, cm) {
    var p = ((t - cm.t0) % CYCLE + CYCLE) % CYCLE;
    if (p >= cm.dur) return 0;
    var v = Math.min(1, p / FADE, (cm.dur - p) / FADE);
    return v <= 0 ? 0 : v * v * (3 - 2 * v);
  }

  var rgbCache = {};
  function rgba(hex, a) {
    var c = rgbCache[hex];
    if (!c) { var n = parseInt(hex.slice(1), 16); c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; rgbCache[hex] = c; }
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }

  function mount(wrap) {
    if (!wrap || wrap.dataset.orbitBound) return null;
    var back = wrap.querySelector('[data-orbit-back]');
    var front = wrap.querySelector('[data-orbit-front]');
    if (!back || !front) return null;
    var box = wrap.getBoundingClientRect();
    if (!box.width || !box.height) return null;
    wrap.dataset.orbitBound = '1';

    var bctx = back.getContext('2d'), fctx = front.getContext('2d');
    var ORBITS = orbits();
    var W = 0, H = 0, cx = 0, cy = 0, minDim = 0, focal = 0, dpr = 1;
    var clock = 0, last = 0, raf = null, visible = true;

    function resize() {
      var r = wrap.getBoundingClientRect();
      if (!r.width || !r.height) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      [back, front].forEach(function (c) {
        c.width = Math.round(W * dpr);
        c.height = Math.round(H * dpr);
        c.style.width = W + 'px';
        c.style.height = H + 'px';
      });
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = W / 2; cy = H / 2;
      minDim = Math.min(W, H);
      focal = minDim * 3.2;
      ORBITS.forEach(function (o) {
        o.R = o.r * minDim;
        o.u0 = rotZ(rotX([1, 0, 0], o.rx * RAD), o.rz * RAD);
        o.v0 = rotZ(rotX([0, 1, 0], o.rx * RAD), o.rz * RAD);
      });
      draw(clock);
    }

    function point(o, ang) {
      var c = Math.cos(ang), s = Math.sin(ang), R = o.R;
      var x = R * (c * o.u[0] + s * o.v[0]);
      var y = R * (c * o.u[1] + s * o.v[1]);
      var z = R * (c * o.u[2] + s * o.v[2]);
      var k = focal / (focal - z);
      return { x: cx + x * k, y: cy + y * k, z: z, k: k };
    }
    // near = 1, far = 0.42 — the depth cue that sells the third dimension
    function depthFade(k) { return 0.42 + 0.58 * clamp((k - 0.88) / 0.26, 0, 1); }

    function draw(t) {
      if (!W || !H) return;
      [bctx, fctx].forEach(function (ctx) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, W, H);
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'round';
      });

      // the whole constellation precesses, so no two crossings repeat
      var gy = t * TAU / 210;
      var gx = 0.22 * Math.sin(t * TAU / 330);
      ORBITS.forEach(function (o) {
        o.u = rotX(rotY(o.u0, gy), gx);
        o.v = rotX(rotY(o.v0, gy), gx);
      });

      for (var oi = 0; oi < ORBITS.length; oi++) {
        var o = ORBITS[oi];
        var col = PALETTE[o.hue];
        var spin = o.dir * TAU * (t / o.T);

        for (var ci = 0; ci < o.comets.length; ci++) {
          var cm = o.comets[ci];
          var vis = duty(t, cm);
          if (vis < 0.004) continue;
          var head = cm.ph + spin;

          for (var i = 0; i < SEG; i++) {
            var t0 = i / SEG, t1 = (i + 1) / SEG;
            var p0 = point(o, head - o.dir * cm.tail * t0);
            var p1 = point(o, head - o.dir * cm.tail * t1);
            var km = (p0.k + p1.k) / 2;
            var tm = (t0 + t1) / 2;
            var a = Math.pow(1 - tm, 1.55) * depthFade(km) * 0.26 * vis;
            if (a < 0.004) continue;
            var w = Math.max(0.35, cm.w * km * Math.pow(1 - tm, 0.7));
            var ctx = ((p0.z + p1.z) > 0) ? fctx : bctx;

            // soft bloom under the core, so the tail has air around it
            ctx.globalAlpha = a * 0.10;
            ctx.lineWidth = w * 3.4;
            ctx.strokeStyle = col;
            ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();

            ctx.globalAlpha = a;
            ctx.lineWidth = w;
            ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
          }

          var hp = point(o, head);
          var hctx = hp.z > 0 ? fctx : bctx;
          var hd = depthFade(hp.k) * vis;
          var r = cm.w * hp.k * 2.4;
          var g = hctx.createRadialGradient(hp.x, hp.y, 0, hp.x, hp.y, r * 2.6);
          g.addColorStop(0, rgba(col, 0.30 * hd));
          g.addColorStop(0.32, rgba(col, 0.10 * hd));
          g.addColorStop(1, rgba(col, 0));
          hctx.globalAlpha = 1;
          hctx.fillStyle = g;
          hctx.beginPath(); hctx.arc(hp.x, hp.y, r * 2.6, 0, TAU); hctx.fill();
          hctx.fillStyle = rgba(col, Math.min(1, 0.36 * hd));
          hctx.beginPath(); hctx.arc(hp.x, hp.y, r * 0.40, 0, TAU); hctx.fill();
        }
      }
      bctx.globalAlpha = fctx.globalAlpha = 1;
    }

    function frame(now) {
      if (!last) last = now;
      clock += Math.min(now - last, 60) / 1000;
      last = now;
      draw(clock);
      raf = visible ? requestAnimationFrame(frame) : null;
    }

    resize();
    [60, 260, 800].forEach(function (ms) { setTimeout(resize, ms); });
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) { var ro = new ResizeObserver(resize); ro.observe(wrap); }

    if (REDUCE) {
      clock = 2.4;   // a composed still, rings already spread out
      draw(clock);
    } else {
      if (window.IntersectionObserver) {
        var io = new IntersectionObserver(function (es) {
          visible = es[0].isIntersecting;
          if (visible && !raf) { last = 0; raf = requestAnimationFrame(frame); }
        }, { threshold: 0 });
        io.observe(wrap);
      }
      raf = requestAnimationFrame(frame);
    }
    return true;
  }

  window.WeKareOrbits = { mount: mount };
})();
