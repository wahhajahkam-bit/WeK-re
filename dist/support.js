/*
 * support.js — minimal runtime for the We Käre ".dc.html" component pages.
 *
 * Each page's <script type="text/x-dc" data-dc-script> defines a
 * `class Component extends DCLogic` with a `renderVals()` method that
 * returns a flat object of template values, event handlers and refs.
 * Markup uses `{{ name }}` placeholders (in text and in attributes,
 * including inside a `style="..."` string), a `ref="{{ name }}"` binding,
 * `<sc-if value="{{ name }}">...</sc-if>` for conditional sections,
 * `style-hover` / `style-focus` for hover/focus style overrides, and
 * plain `onClick` / `onMouseEnter` / `onMouseLeave` handlers.
 *
 * This file implements just enough of that contract to run the pages as
 * plain static HTML + JS, with each page's imports (Nav/Footer) already
 * inlined at build time by build.py.
 */
(function () {
  'use strict';

  // The only React API the components use is React.createRef().
  window.React = window.React || {
    createRef: function () { return { current: null }; }
  };

  var TEMPLATE_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

  function resolveTemplate(str, vals) {
    return str.replace(TEMPLATE_RE, function (m, name) {
      var v = vals[name];
      return v === undefined || v === null ? '' : String(v);
    });
  }

  function parseStyleString(str) {
    var out = {};
    str.split(';').forEach(function (decl) {
      var i = decl.indexOf(':');
      if (i === -1) return;
      var k = decl.slice(0, i).trim();
      var v = decl.slice(i + 1).trim();
      if (k) out[k] = v;
    });
    return out;
  }

  // Base class every page/component's `Component` extends.
  window.DCLogic = function (props) {
    this.props = props || {};
    this.state = this.state || {};
  };
  window.DCLogic.prototype.setState = function (update) {
    this.state = typeof update === 'function'
      ? Object.assign({}, this.state, update(this.state))
      : Object.assign({}, this.state, update);
    if (this._render) this._render();
  };
  window.DCLogic.prototype.renderVals = function () { return {}; };

  var EVENT_ATTRS = {
    onclick: 'click',
    onmouseenter: 'mouseenter',
    onmouseleave: 'mouseleave',
    onfocus: 'focus',
    onblur: 'blur',
    onchange: 'change',
    oninput: 'input',
    onsubmit: 'submit'
  };

  function walk(root, boundaryAttr, visit) {
    visit(root);
    var children = root.children;
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (boundaryAttr && child.hasAttribute(boundaryAttr) && child !== root) continue;
      walk(child, boundaryAttr, visit);
    }
  }

  function mount(container, ComponentClass, initialProps) {
    var inst = new ComponentClass(initialProps);
    var bindings = []; // {type:'attr', el, name, template} | {type:'scif', el, name}
    var hoverBindings = []; // {el, hoverStyle, focusStyle, base}

    walk(container, 'data-dc-boundary', function (el) {
      if (el.tagName === 'SC-IF') {
        var valAttr = el.getAttribute('value') || '';
        var m = TEMPLATE_RE.exec(valAttr);
        TEMPLATE_RE.lastIndex = 0;
        if (m) bindings.push({ type: 'scif', el: el, name: m[1] });
        el.removeAttribute('hint-placeholder-val');
        return;
      }

      var attrs = Array.prototype.slice.call(el.attributes || []);
      var baseStyle = el.getAttribute('style');
      var hoverStyle = el.getAttribute('style-hover');
      var focusStyle = el.getAttribute('style-focus');
      if (hoverStyle || focusStyle) {
        hoverBindings.push({
          el: el,
          base: baseStyle ? parseStyleString(baseStyle) : {},
          hover: hoverStyle ? parseStyleString(hoverStyle) : null,
          focus: focusStyle ? parseStyleString(focusStyle) : null
        });
        el.removeAttribute('style-hover');
        el.removeAttribute('style-focus');
      }

      Array.prototype.slice.call(el.childNodes).forEach(function (node) {
        if (node.nodeType === 3 && node.nodeValue.indexOf('{{') !== -1) {
          bindings.push({ type: 'text', node: node, template: node.nodeValue });
        }
      });

      attrs.forEach(function (a) {
        var name = a.name, value = a.value;
        var lower = name.toLowerCase();

        if (lower === 'ref') {
          var rm = TEMPLATE_RE.exec(value);
          TEMPLATE_RE.lastIndex = 0;
          if (rm) inst[rm[1]] = { current: el };
          el.removeAttribute(name);
          return;
        }

        if (EVENT_ATTRS[lower]) {
          var em = TEMPLATE_RE.exec(value);
          TEMPLATE_RE.lastIndex = 0;
          if (em) {
            var key = em[1];
            el.addEventListener(EVENT_ATTRS[lower], function (evt) {
              var fn = inst._vals && inst._vals[key];
              if (typeof fn === 'function') fn(evt);
            });
          }
          el.removeAttribute(name);
          return;
        }

        if (value.indexOf('{{') !== -1) {
          bindings.push({ type: 'attr', el: el, name: name, template: value });
        }
      });
    });

    // Hover/focus interaction, independent of re-render.
    hoverBindings.forEach(function (b) {
      // Resetting must not just re-apply the base style string — a hover
      // style commonly introduces properties (transform, box-shadow, an
      // --icon-* custom property) that the base string never declared at
      // all, so re-applying only the base's own keys leaves those stuck
      // forever after the first hover. Explicitly clear every key the
      // hover/focus style touches, then layer the base back on top.
      //
      // Critically, "the base" must come from `b.base` — the object
      // captured once at mount time — and NOT from re-reading
      // `el.getAttribute('style')` here. The style attribute and the
      // live `el.style` CSSOM are the same underlying data, so by the
      // time this runs our own removeProperty() calls just above have
      // already mutated that very attribute; reading it back returns
      // whatever's left over from the mutation, not the original values
      // (e.g. "background" removed, then never re-applied at all).
      var reset = function (introduced) {
        for (var k in introduced) b.el.style.removeProperty(k);
        for (var k in b.base) b.el.style.setProperty(k, b.base[k]);
      };
      if (b.hover) {
        b.el.addEventListener('mouseenter', function () { for (var k in b.hover) b.el.style.setProperty(k, b.hover[k]); });
        b.el.addEventListener('mouseleave', function () { reset(b.hover); });
      }
      if (b.focus) {
        b.el.addEventListener('focus', function () { for (var k in b.focus) b.el.style.setProperty(k, b.focus[k]); });
        b.el.addEventListener('blur', function () { reset(b.focus); });
      }
    });

    inst._bindings = bindings;
    inst._render = function () {
      inst._vals = inst.renderVals();
      bindings.forEach(function (b) {
        if (b.type === 'scif') {
          b.el.hidden = !inst._vals[b.name];
        } else if (b.type === 'text') {
          b.node.nodeValue = resolveTemplate(b.template, inst._vals);
        } else {
          b.el.setAttribute(b.name, resolveTemplate(b.template, inst._vals));
        }
      });
    };

    inst._render();
    if (inst.componentDidMount) inst.componentDidMount();
    return inst;
  }

  // Lightweight stand-in for the design-tool's <image-slot> — a plain,
  // clearly-labelled placeholder box, since real photography has to be
  // supplied by a person, not fabricated.
  if (!customElements.get('image-slot')) {
    customElements.define('image-slot', class extends HTMLElement {
      connectedCallback() {
        var shape = this.getAttribute('shape') || 'rounded';
        var radius = this.getAttribute('radius') || '12';
        var placeholder = this.getAttribute('placeholder') || 'Image';
        this.style.display = 'flex';
        this.style.width = this.style.width || '100%';
        this.style.height = this.style.height || '100%';
        this.style.alignItems = 'center';
        this.style.justifyContent = 'center';
        this.style.textAlign = 'center';
        this.style.color = '#8A85A0';
        this.style.background = this.style.background || 'linear-gradient(135deg,#EBE9F5,#DFDBF0)';
        this.style.overflow = 'hidden';
        if (shape === 'circle') this.style.borderRadius = '50%';
        else if (shape === 'pill') this.style.borderRadius = '999px';
        else if (shape === 'rounded') this.style.borderRadius = radius + 'px';
        var span = document.createElement('span');
        span.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;opacity:.85;padding:12px;font-size:12.5px;line-height:1.4';
        span.innerHTML = '<i class="ph ph-image" style="font-size:22px"></i><span>' + placeholder.replace(/</g, '&lt;') + '</span>';
        this.appendChild(span);
      }
    });
  }

  // Where form submissions (Get Help, Become a Mentor) are sent.
  window.WEKARE_CONTACT_EMAIL = 'ahkam.khalid@konsalidon.com';

  // Reads every labelled field inside `container` (skips checkboxes —
  // use collectCheckedLabels for those) using each <label>'s own text as
  // the field name, so forms don't need explicit name= attributes.
  function collectFormFields(container) {
    var out = [];
    container.querySelectorAll('label').forEach(function (label) {
      var control = label.querySelector('input, select, textarea');
      if (!control || control.type === 'checkbox') return;
      var clone = label.cloneNode(true);
      var innerControl = clone.querySelector('input, select, textarea');
      if (innerControl) innerControl.remove();
      var fieldName = clone.textContent.replace(/\s+/g, ' ').trim();
      out.push({ field: fieldName, value: control.value || '' });
    });
    return out;
  }

  function collectCheckedLabels(container) {
    var out = [];
    container.querySelectorAll('label').forEach(function (label) {
      var cb = label.querySelector('input[type="checkbox"]');
      if (cb && cb.checked) out.push(label.textContent.replace(/\s+/g, ' ').trim());
    });
    return out;
  }

  // Blocks progress until every required field inside `container` is
  // filled in. Uses the browser's own HTML5 constraint validation (each
  // control needs a `required` attribute), and surfaces the native
  // validation bubble on the first empty one so it's obvious what's
  // missing. Returns true only once everything required is filled.
  function validateRequired(container) {
    var controls = container.querySelectorAll('[required]');
    for (var i = 0; i < controls.length; i++) {
      if (!controls[i].checkValidity()) {
        controls[i].reportValidity();
        controls[i].focus();
        return false;
      }
    }
    return true;
  }

  // Last-resort fallback if the real send (below) fails outright — e.g. the
  // visitor is offline. Opens their own mail client with everything
  // pre-filled; not used in the normal path.
  function mailtoSubmit(subject, fields, checkedLabels) {
    var lines = fields.map(function (f) { return f.field + ': ' + (f.value || '—'); });
    if (checkedLabels && checkedLabels.length) {
      lines.push('', 'Selected: ' + checkedLabels.join('; '));
    }
    var url = 'mailto:' + encodeURIComponent(window.WEKARE_CONTACT_EMAIL) +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(lines.join('\n'));
    window.location.href = url;
  }

  // The real send: a static site has no server of its own, so this posts
  // straight to FormSubmit (https://formsubmit.co) — a no-account,
  // no-dashboard relay that turns a POST into a structured email sent to
  // WEKARE_CONTACT_EMAIL. The visitor is never the sender or a recipient;
  // their details are just fields in the body. FormSubmit emails
  // WEKARE_CONTACT_EMAIL once, the very first time, asking it to confirm
  // ("Activate Form") — every submission after that click goes straight
  // through with no further action from anyone.
  //
  // Returns a Promise: resolves once FormSubmit accepts the request,
  // rejects on a network failure or a non-2xx response (offline, the
  // inbox not yet activated, etc.) so callers can fall back to mailtoSubmit
  // rather than silently losing the submission.
  function submitStructuredEmail(subject, fields, checkedLabels) {
    var payload = {
      _subject: subject,
      _template: 'table',
      _captcha: 'false'
    };
    fields.forEach(function (f) { payload[f.field] = f.value || '—'; });
    if (checkedLabels && checkedLabels.length) payload['Selected'] = checkedLabels.join('; ');

    var endpoint = 'https://formsubmit.co/ajax/' + encodeURIComponent(window.WEKARE_CONTACT_EMAIL);
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) throw new Error('FormSubmit responded with ' + res.status);
      return res;
    });
  }

  window.DC = {
    mount: mount,
    collectFormFields: collectFormFields,
    collectCheckedLabels: collectCheckedLabels,
    mailtoSubmit: mailtoSubmit,
    submitStructuredEmail: submitStructuredEmail,
    validateRequired: validateRequired
  };
})();
