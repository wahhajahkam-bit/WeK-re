/* We Käre — numbered step timeline interaction.
   Mirrors Home's How It Works behaviour for any number of steps.

   Expected markup inside the container:
     [data-step-row]      one per step
       [data-step-circle]   the numbered circle
       [data-step-line]     the connector below it (absent on the last row)
       [data-step-card]     the box that triggers everything

   Rules:
     - hovering a CARD lights that circle (with a burst ring); circles and lines
       are not themselves hover targets
     - moving between adjacent cards sends a glow along the connector, from the
       circle you left into the one you arrived at, which lights only on arrival
     - the plain connector line is always visible; only the glow comes and goes
   All animated values are written as literals — never through CSS variables.
*/
(function () {
  var REST_BG = 'rgba(158,151,224,.09)', REST_FG = '#4F47A6', REST_BD = 'rgba(196,190,232,.42)';
  var LIT_BG = '#9E97E0', LIT_FG = '#F7F5F0', LIT_BD = 'transparent';
  var RING = '0 0 10px 2px rgba(158,151,224,.5), 0 0 26px 8px rgba(158,151,224,.28), 0 0 54px 18px rgba(158,151,224,.14)';
  var GROW = 520, DRAIN = 340, ARRIVE = GROW + DRAIN - 120;
  var EASE = 'cubic-bezier(.33,.02,.3,1)';

  // a halo in the element's own colour, so nothing is recoloured on hover
  function glow(rgb, alpha, blur) {
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb || '');
    if (!m) return '0 0 ' + blur + 'px rgba(108,99,196,' + alpha + ')';
    return '0 0 ' + blur + 'px rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',' + alpha + ')';
  }

  function init(container) {
    if (!container || container.dataset.stepsBound) return null;
    var rows = [].slice.call(container.querySelectorAll('[data-step-row]'));
    if (!rows.length) return null;
    container.dataset.stepsBound = '1';

    var steps = rows.map(function (row, i) {
      var circle = row.querySelector('[data-step-circle]');
      var line = row.querySelector('[data-step-line]');
      var card = row.querySelector('[data-step-card]');
      var burst = null, fill = null;

      if (circle) {
        circle.style.background = REST_BG;
        circle.style.color = REST_FG;
        circle.style.border = '0';
        circle.style.boxShadow = 'none';
        circle.style.boxSizing = 'border-box';
        circle.style.transitionProperty = 'background,color,border-color,box-shadow';
        circle.style.transitionDuration = '.4s,.4s,.4s,.5s';
        circle.style.transitionTimingFunction = EASE;

        var wrap = document.createElement('span');
        wrap.style.cssText = 'position:relative;display:flex;align-items:center;justify-content:center;flex:0 0 auto';
        circle.parentNode.insertBefore(wrap, circle);
        burst = document.createElement('span');
        var size = circle.style.width || '52px';
        burst.style.cssText = 'position:absolute;left:50%;top:50%;box-sizing:border-box;width:' + size +
          ';height:' + size + ';border-radius:999px;background:rgba(158,151,224,.32);' +
          'box-shadow:0 0 14px 3px rgba(158,151,224,.35);pointer-events:none;opacity:0;' +
          'transform:translate(-50%,-50%) scale(.55)';
        wrap.appendChild(burst);
        wrap.appendChild(circle);
      }

      if (line) {
        line.style.position = 'relative';
        line.style.width = '2px';
        line.style.borderRadius = '2px';
        line.style.overflow = 'hidden';
        line.style.background = '#E8E5F6';
        fill = document.createElement('span');
        fill.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;border-radius:2px;' +
          'background:linear-gradient(#BDB6EE,#A79FE8);box-shadow:0 0 12px 2px rgba(167,159,232,.55);' +
          'opacity:0;transform:scaleY(0);transform-origin:top center';
        line.appendChild(fill);
      }

      var icon = card ? card.querySelector('i[class*="ph-"]') : null;
      var kicker = null;
      if (card) {
        kicker = [].slice.call(card.querySelectorAll('span')).filter(function (el) {
          return getComputedStyle(el).textTransform === 'uppercase';
        })[0] || null;
      }
      var iconRest = icon ? getComputedStyle(icon).color : null;
      var kickerRest = kicker ? getComputedStyle(kicker).color : null;
      if (icon) icon.style.transition = 'color .45s ' + EASE + ',text-shadow .55s ' + EASE;
      if (kicker) kicker.style.transition = 'color .45s ' + EASE + ',text-shadow .55s ' + EASE;
      return { circle: circle, fill: fill, card: card, burst: burst, index: i + 1,
               icon: icon, kicker: kicker, iconRest: iconRest, kickerRest: kickerRest };
    });

    var last = 0, lastAt = 0, timers = [], gen = 0;
    function clear() { timers.forEach(clearTimeout); timers = []; }
    function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
    // Transitions cannot be trusted to complete in every host, so every beat
    // schedules a commit of its own end state. If the transition already ran the
    // values are identical and nothing is seen; if it stalled, this lands it.
    function commit(el, styles, afterMs, myGen) {
      later(function () {
        if (myGen !== gen || !el) return;
        // a stalled transition keeps overriding the inline value, so cancel it
        // outright before landing the end state
        if (el.getAnimations) {
          el.getAnimations().forEach(function (a) { try { a.cancel(); } catch (e) {} });
        }
        el.style.transition = 'none';
        Object.keys(styles).forEach(function (k) { el.style[k] = styles[k]; });
        void el.offsetWidth;
      }, afterMs);
    }

    function paint(n, delay) {
      var myGen = gen;
      steps.forEach(function (st) {
        var on = st.index === n;
        if (!st.circle) return;
        var end = {
          background: on ? LIT_BG : REST_BG,
          color: on ? LIT_FG : REST_FG,
          boxShadow: on ? RING : 'none'
        };
        st.circle.style.transition = 'background .4s ' + EASE + ' ' + (on ? (delay || 0) : 0) + 'ms,' +
          'color .4s ' + EASE + ' ' + (on ? (delay || 0) : 0) + 'ms,' +
          'border-color .4s ' + EASE + ' ' + (on ? (delay || 0) : 0) + 'ms,' +
          'box-shadow .5s ' + EASE + ' ' + (on ? (delay || 0) : 0) + 'ms';
        Object.keys(end).forEach(function (k) { st.circle.style[k] = end[k]; });
        commit(st.circle, end, (on ? (delay || 0) : 0) + 620, myGen);

        var wait = on ? (delay || 0) : 0;
        if (st.icon) {
          var iEnd = {
            color: st.iconRest,
            textShadow: on ? glow(st.iconRest, .8, 14) + ',' + glow(st.iconRest, .5, 30) : 'none'
          };
          st.icon.style.transitionDelay = wait + 'ms';
          st.icon.style.color = iEnd.color;
          st.icon.style.textShadow = iEnd.textShadow;
          commit(st.icon, iEnd, wait + 620, myGen);
        }
        if (st.kicker) {
          var kEnd = {
            color: st.kickerRest,
            textShadow: on ? glow(st.kickerRest, .8, 12) + ',' + glow(st.kickerRest, .5, 26) : 'none'
          };
          st.kicker.style.transitionDelay = wait + 'ms';
          st.kicker.style.color = kEnd.color;
          st.kicker.style.textShadow = kEnd.textShadow;
          commit(st.kicker, kEnd, wait + 620, myGen);
        }
      });
    }

    function blast(n, after) {
      var st = steps[n - 1];
      if (!st || !st.burst) return;
      var b = st.burst;
      var myGen = gen;
      later(function () {
        b.style.transition = 'none';
        b.style.transform = 'translate(-50%,-50%) scale(.55)';
        b.style.opacity = '0.9';
        void b.offsetWidth;
        later(function () {
          b.style.transition = 'transform .85s cubic-bezier(.16,.75,.3,1),opacity .85s ease-out';
          b.style.transform = 'translate(-50%,-50%) scale(1.4)';
          b.style.opacity = '0';
          commit(b, { opacity: '0', transform: 'translate(-50%,-50%) scale(.55)' }, 980, myGen);
        }, 30);
      }, after);
    }

    function resetFills() {
      steps.forEach(function (st) {
        if (!st.fill) return;
        st.fill.style.transition = 'none';
        st.fill.style.opacity = '0';
        st.fill.style.transform = 'scaleY(0)';
      });
    }

    function travel(lineIndex, down) {
      var st = steps[lineIndex - 1];
      if (!st || !st.fill) return;
      var f = st.fill;
      var myGen = gen;
      f.style.transition = 'none';
      f.style.transformOrigin = down ? 'top center' : 'bottom center';
      f.style.transform = 'scaleY(0)';
      f.style.opacity = '1';
      void f.offsetWidth;
      f.style.transition = 'transform ' + GROW + 'ms ' + EASE;
      f.style.transform = 'scaleY(1)';
      later(function () {
        f.style.transition = 'none';
        f.style.transformOrigin = down ? 'bottom center' : 'top center';
        void f.offsetWidth;
        f.style.transition = 'transform ' + DRAIN + 'ms ' + EASE + ',opacity ' + DRAIN + 'ms linear';
        f.style.transform = 'scaleY(0)';
        f.style.opacity = '0';
        commit(f, { opacity: '0', transform: 'scaleY(0)' }, DRAIN + 140, myGen);
      }, GROW);
    }

    steps.forEach(function (st) {
      if (!st.card) return;
      st.card.addEventListener('mouseenter', function () {
        clear();
        gen++;
        var now = Date.now();
        // sweeping across a card on the way in is not "coming from" it
        var dwelled = last && (now - lastAt) > 200;
        var from = dwelled ? last : 0;
        var n = st.index;
        last = n; lastAt = now;
        resetFills();
        if (from && Math.abs(n - from) === 1) {
          var lineIndex = Math.min(n, from);
          travel(lineIndex, n > from);
          paint(n, ARRIVE);
          blast(n, ARRIVE);
        } else {
          paint(n, 0);
          blast(n, 0);
        }
      });
    });

    container.addEventListener('mouseleave', function () {
      clear();
      gen++;
      last = 0; lastAt = 0;
      resetFills();
      paint(0, 0);
    });

    paint(0, 0);
    resetFills();
    return { steps: steps.length };
  }

  window.WeKareSteps = { init: init };
})();
