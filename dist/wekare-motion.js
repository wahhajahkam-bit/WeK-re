/* We Käre motion helpers — canvas 2D, no dependencies.
   window.WeKareMotion.field(canvas)        purple dot field on bone, cursor repel + spring + parallax
   window.WeKareMotion.scramble(el, lines)  cycles lines, letters settling in
   window.WeKareMotion.dotPortrait(host)    dot veil over a portrait frame; scatters, then rolls away
*/
(function () {
  const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PURPLE = [108, 99, 196];
  const LAVENDER = [167, 159, 232];

  function dpr() { return Math.min(window.devicePixelRatio || 1, 2); }

  function fitCanvas(cv) {
    const r = cv.getBoundingClientRect();
    const d = dpr();
    if (!r.width || !r.height) return null;
    cv.width = Math.round(r.width * d);
    cv.height = Math.round(r.height * d);
    const ctx = cv.getContext('2d');
    ctx.setTransform(d, 0, 0, d, 0, 0);
    return { ctx, w: r.width, h: r.height };
  }

  /* ---------------------------------------------------------------- field */
  function field(cv, opts) {
    opts = opts || {};
    const host = opts.host || cv.parentElement;
    let ctx, W, H, dots = [], raf = null, visible = true;
    const ptr = { x: -9e5, y: -9e5, active: false };
    const par = { x: 0, y: 0, tx: 0, ty: 0 };
    const R = opts.repel || 118;
    const FORCE = opts.force || 0.9;
    const SPRING = 0.014;
    const DAMP = 0.9;

    function build() {
      const box = fitCanvas(cv);
      if (!box) return false;
      ctx = box.ctx; W = box.w; H = box.h;
      const target = Math.min(1500, Math.round((W * H) / 2200));
      dots = new Array(target);
      for (let i = 0; i < target; i++) {
        const x = Math.random() * W, y = Math.random() * H;
        const lav = Math.random() < 0.3;
        const pulse = Math.random() < 0.12;
        dots[i] = {
          hx: x, hy: y, x: x, y: y, vx: 0, vy: 0,
          r: 0.7 + Math.random() * 1.7,
          a: 0.14 + Math.random() * 0.34,
          c: lav ? LAVENDER : PURPLE,
          pulse: pulse, ph: Math.random() * Math.PI * 2, rate: 0.5 + Math.random() * 1.4,
          depth: 0.35 + Math.random() * 0.9
        };
      }
      return true;
    }

    function draw(now) {
      ctx.clearRect(0, 0, W, H);
      par.x += (par.tx - par.x) * 0.045;
      par.y += (par.ty - par.y) * 0.045;
      const t = now * 0.001;
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        if (ptr.active) {
          const dx = d.x - ptr.x, dy = d.y - ptr.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < R * R) {
            const dist = Math.sqrt(d2) || 0.001;
            const f = (1 - dist / R) * FORCE;
            d.vx += (dx / dist) * f * 3.2;
            d.vy += (dy / dist) * f * 3.2;
          }
        }
        d.vx += (d.hx - d.x) * SPRING;
        d.vy += (d.hy - d.y) * SPRING;
        d.vx *= DAMP; d.vy *= DAMP;
        d.x += d.vx; d.y += d.vy;
        let a = d.a;
        if (d.pulse) a = d.a * (0.45 + 0.75 * (0.5 + 0.5 * Math.sin(t * d.rate + d.ph)));
        ctx.beginPath();
        ctx.fillStyle = 'rgba(' + d.c[0] + ',' + d.c[1] + ',' + d.c[2] + ',' + a.toFixed(3) + ')';
        ctx.arc(d.x + par.x * d.depth, d.y + par.y * d.depth, d.r, 0, 6.2832);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    }

    function still() {
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        ctx.beginPath();
        ctx.fillStyle = 'rgba(' + d.c[0] + ',' + d.c[1] + ',' + d.c[2] + ',' + d.a.toFixed(3) + ')';
        ctx.arc(d.x, d.y, d.r, 0, 6.2832);
        ctx.fill();
      }
    }

    function start() { if (!raf && !REDUCED) raf = requestAnimationFrame(draw); }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

    if (!build()) return null;
    still();
    if (REDUCED) return { destroy: function () {} };

    const onMove = function (e) {
      const r = cv.getBoundingClientRect();
      ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top; ptr.active = true;
      par.tx = ((ptr.x / r.width) - 0.5) * 26;
      par.ty = ((ptr.y / r.height) - 0.5) * 18;
    };
    const onLeave = function () { ptr.active = false; par.tx = 0; par.ty = 0; };
    const onResize = function () { if (build()) still(); };

    (host || window).addEventListener('pointermove', onMove, { passive: true });
    (host || window).addEventListener('pointerleave', onLeave);
    window.addEventListener('resize', onResize);

    let io = null;
    if (window.IntersectionObserver) {
      io = new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (visible) start(); else stop();
      }, { threshold: 0 });
      io.observe(cv);
    }
    start();

    return {
      destroy: function () {
        stop();
        if (io) io.disconnect();
        (host || window).removeEventListener('pointermove', onMove);
        (host || window).removeEventListener('pointerleave', onLeave);
        window.removeEventListener('resize', onResize);
      }
    };
  }

  /* ------------------------------------------------------------- scramble */
  function scramble(el, lines, opts) {
    opts = opts || {};
    const CH = 'abcdefghijklmnopqrstuvwxyz';
    const hold = opts.hold || 4200;
    const step = 34;
    const ghost = opts.ghost || 'rgba(108,99,196,.45)';
    let idx = 0, raf = null, prev = 0, frame = 0, waited = 0, chars = null, settle = null, last = 0;

    // Settled text is the resting state: painted synchronously, and whatever
    // happens to the frame clock the element is left holding a real sentence.
    function settleNow() { el.textContent = lines[idx]; }
    settleNow();
    if (REDUCED) return { destroy: function () {} };

    function begin(target) {
      chars = target.split('');
      settle = chars.map(function (c, i) { return c === ' ' ? 0 : 5 + i * 1.6; });
      last = Math.max.apply(null, settle);
      frame = 0;
    }

    function paint() {
      let out = '';
      for (let i = 0; i < chars.length; i++) {
        const c = chars[i];
        if (c === ' ') { out += ' '; continue; }
        if (frame >= settle[i]) {
          out += c === '<' ? '&lt;' : c === '&' ? '&amp;' : c;
        } else if (/[a-z]/i.test(c)) {
          out += '<span style="color:' + ghost + '">' + CH[(Math.random() * 26) | 0] + '</span>';
        } else {
          out += '<span style="color:' + ghost + '">' + c + '</span>';
        }
      }
      el.innerHTML = out;
    }

    function tick(now) {
      raf = requestAnimationFrame(tick);
      const dt = prev ? Math.min(now - prev, 120) : 16;
      prev = now;
      if (chars) {
        waited += dt;
        while (waited >= step) {
          waited -= step;
          frame++;
          if (frame > last + 1) { chars = null; waited = 0; settleNow(); break; }
        }
        if (chars) paint();
      } else {
        waited += dt;
        if (waited >= hold) { waited = 0; idx = (idx + 1) % lines.length; begin(lines[idx]); }
      }
    }

    function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } prev = 0; chars = null; waited = 0; settleNow(); }
    function start() { if (!raf) { prev = 0; raf = requestAnimationFrame(tick); } }

    const onVis = function () { if (document.visibilityState === 'hidden') stop(); else start(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('beforeprint', stop);
    window.addEventListener('afterprint', start);
    if (document.visibilityState !== 'hidden') start();

    return {
      destroy: function () {
        stop();
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('beforeprint', stop);
        window.removeEventListener('afterprint', start);
      }
    };
  }

  /* --------------------------------------------------------- dot portrait */
  function dotPortrait(host, opts) {
    opts = opts || {};
    const cv = host.querySelector('canvas');
    const reveal = host.querySelector('[data-dp-reveal]');
    const cue = host.querySelector('[data-dp-cue]');
    if (!cv) return null;

    let ctx, W, H, dots = [], raf = null, open = false, plate = 1;
    const ptr = { x: -9e5, y: -9e5, active: false };
    const R = 66, GAP = opts.gap || 11;
    const PLATE = opts.plate || [235, 233, 245];

    function build() {
      const box = fitCanvas(cv);
      if (!box) return false;
      ctx = box.ctx; W = box.w; H = box.h;
      dots = [];
      for (let y = GAP / 2; y < H; y += GAP) {
        for (let x = GAP / 2; x < W; x += GAP) {
          const jx = x + (Math.random() - 0.5) * 2.2;
          const jy = y + (Math.random() - 0.5) * 2.2;
          dots.push({
            hx: jx, hy: jy, x: jx, y: jy, vx: 0, vy: 0,
            r: 1.5 + Math.random() * 1.5,
            a: 0.42 + Math.random() * 0.4,
            c: Math.random() < 0.26 ? LAVENDER : PURPLE,
            gone: 0
          });
        }
      }
      return true;
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      if (plate > 0.002) {
        ctx.fillStyle = 'rgba(' + PLATE[0] + ',' + PLATE[1] + ',' + PLATE[2] + ',' + plate.toFixed(3) + ')';
        ctx.fillRect(0, 0, W, H);
      }
      plate += ((open ? 0 : 1) - plate) * 0.09;
      let moving = false;
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        if (open) {
          d.vx += 0.55 + Math.random() * 0.5;
          d.vy += (Math.random() - 0.5) * 0.5;
          d.vx *= 0.985; d.vy *= 0.985;
          d.x += d.vx; d.y += d.vy;
          d.gone += (1 - d.gone) * 0.035;
        } else {
          if (ptr.active) {
            const dx = d.x - ptr.x, dy = d.y - ptr.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < R * R) {
              const dist = Math.sqrt(d2) || 0.001;
              const f = (1 - dist / R) * 1.5;
              d.vx += (dx / dist) * f * 2.6;
              d.vy += (dy / dist) * f * 2.6;
            }
          }
          d.vx += (d.hx - d.x) * 0.02;
          d.vy += (d.hy - d.y) * 0.02;
          d.vx *= 0.88; d.vy *= 0.88;
          d.x += d.vx; d.y += d.vy;
          d.gone += (0 - d.gone) * 0.10;
        }
        const a = d.a * (1 - d.gone);
        if (a > 0.004) {
          moving = true;
          ctx.beginPath();
          ctx.fillStyle = 'rgba(' + d.c[0] + ',' + d.c[1] + ',' + d.c[2] + ',' + a.toFixed(3) + ')';
          ctx.arc(d.x, d.y, d.r, 0, 6.2832);
          ctx.fill();
        }
      }
      if (moving || plate > 0.004 || !open) raf = requestAnimationFrame(draw);
      else raf = null;
    }

    function paintStill() {
      ctx.clearRect(0, 0, W, H);
      if (!open) {
        ctx.fillStyle = 'rgba(' + PLATE[0] + ',' + PLATE[1] + ',' + PLATE[2] + ',1)';
        ctx.fillRect(0, 0, W, H);
      }
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        const a = d.a * (1 - d.gone);
        if (a <= 0.004) continue;
        ctx.beginPath();
        ctx.fillStyle = 'rgba(' + d.c[0] + ',' + d.c[1] + ',' + d.c[2] + ',' + a.toFixed(3) + ')';
        ctx.arc(d.x, d.y, d.r, 0, 6.2832);
        ctx.fill();
      }
    }

    function kick() { if (!raf) raf = requestAnimationFrame(draw); }

    function setOpen(next) {
      open = next;
      host.setAttribute('data-dp-open', next ? 'true' : 'false');
      if (reveal) {
        reveal.style.opacity = next ? '1' : '0';
        reveal.style.pointerEvents = next ? 'auto' : 'none';
        reveal.style.transform = next ? 'translateY(0)' : 'translateY(10px)';
      }
      if (cue) cue.style.opacity = next ? '0' : '1';
      if (!next) { for (let i = 0; i < dots.length; i++) { const d = dots[i]; d.x = d.hx; d.y = d.hy; d.vx = 0; d.vy = 0; } }
      kick();
    }

    if (!build()) return null;
    setOpen(false);
    paintStill();

    if (!REDUCED) {
      host.addEventListener('pointermove', function (e) {
        const r = cv.getBoundingClientRect();
        ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top; ptr.active = true;
        kick();
      }, { passive: true });
      host.addEventListener('pointerleave', function () { ptr.active = false; kick(); });
    }

    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-dp-back]')) { setOpen(false); return; }
      if (!open) setOpen(true);
    });
    host.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); }
      if (e.key === 'Escape') setOpen(false);
    });
    window.addEventListener('resize', function () { if (build()) { setOpen(open); paintStill(); } });

    return { open: function () { setOpen(true); }, close: function () { setOpen(false); } };
  }

  window.WeKareMotion = { field: field, scramble: scramble, dotPortrait: dotPortrait, reduced: REDUCED };
})();
