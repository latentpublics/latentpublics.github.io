/* Institute for Latent Publics — contact slide-out panel.
   This is the site's only client-side JavaScript. If it fails to load, every
   text on the page and the contact@latentpublics.com mailto link still read
   normally; only the Contact button stops working. */
(function () {
  "use strict";

  /* The Turnstile site key is a public value. Replace this string once the key
     is issued (see README). */
  var TURNSTILE_SITE_KEY = "REPLACE_ME";
  /* Local development — Cloudflare's published "always passes" test site key.
     Used only on localhost-style hosts, never in production. */
  var TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
  var TURNSTILE_API = "https://challenges.cloudflare.com/turnstile/v0/api.js";
  var ENDPOINT = "/api/contact";
  var MAX_MESSAGE = 2000;

  var IS_LOCAL = ["localhost", "127.0.0.1", "[::1]", "::1"].indexOf(location.hostname) !== -1;
  var SITE_KEY = IS_LOCAL ? TURNSTILE_TEST_SITE_KEY : TURNSTILE_SITE_KEY;

  /* English only. The Korean page sits outside public/ and is not published,
     so there is no language branch here. */
  var T = {
    title: "Contact",
    lede: "Choose a topic and write your message. It will be sent to contact@latentpublics.com.",
    submit: "Send",
    sending: "Sending…",
    success: "Received. A confirmation email has been sent to the address you provided.",
    failure: "Could not send. Please email contact@latentpublics.com directly.",
    expired: "Verification expired. Please press the button again.",
    altPrefix: "or ",
    close: "Close",
    required: "Required.",
    badEmail: "Check the email format.",
    tooLong: "Over 2000 characters.",
    topicPlaceholder: "Select a topic",
    fields: {
      name: { label: "Name", placeholder: "" },
      email: { label: "Email", placeholder: "name@example.com" },
      org: { label: "Affiliation", placeholder: "Institution, company, or lab" },
      topic: { label: "Topic" },
      message: { label: "Message", placeholder: "Tell us what you would like to discuss." }
    },
    topics: [
      "Research collaboration",
      "Urban Currents",
      "Speaking & media",
      "Method or data inquiry",
      "Other"
    ]
  };

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  /* tabindex="-1" is excluded — the honeypot input would otherwise be caught. */
  var FOCUSABLE =
    'a[href]:not([tabindex="-1"]),button:not([disabled]):not([tabindex="-1"]),' +
    'input:not([disabled]):not([tabindex="-1"]),select:not([disabled]):not([tabindex="-1"]),' +
    'textarea:not([disabled]):not([tabindex="-1"]),iframe,[tabindex]:not([tabindex="-1"])';

  var overlay = null;
  var panel = null;
  var form = null;
  var opener = null;
  var widgetId = null;
  var turnstileLoading = false;
  var prevBodyOverflow = "";

  /* ---------- build ---------- */

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        /* An empty string is a valid value — data-* markers and
           <option value=""> depend on this. */
        if (attrs[k] !== null && attrs[k] !== undefined) {
          node.setAttribute(k, attrs[k]);
        }
      });
    }
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function field(key, type, required) {
    var spec = T.fields[key];
    var id = "cf-" + key;
    var wrap = el("div", { class: "cf-field" });

    var head = el("div", { class: "cf-field-head" });
    var label = el("label", { for: id });
    label.appendChild(document.createTextNode(spec.label));
    if (required) label.appendChild(el("span", { class: "cf-req", "aria-hidden": "true" }, "*"));
    head.appendChild(label);
    if (key === "message") {
      head.appendChild(el("span", { class: "cf-count", "data-count": "" }, "0 / " + MAX_MESSAGE));
    }
    wrap.appendChild(head);

    var control;
    if (type === "textarea") {
      control = el("textarea", { id: id, name: key, rows: "6", maxlength: String(MAX_MESSAGE) });
      if (spec.placeholder) control.setAttribute("placeholder", spec.placeholder);
    } else if (type === "select") {
      control = el("select", { id: id, name: key });
      var ph = el("option", { value: "" }, T.topicPlaceholder);
      ph.disabled = true;
      ph.selected = true;
      control.appendChild(ph);
      T.topics.forEach(function (t) {
        control.appendChild(el("option", { value: t }, t));
      });
    } else {
      control = el("input", { id: id, type: type, name: key });
      if (spec.placeholder) control.setAttribute("placeholder", spec.placeholder);
      if (key === "name") control.setAttribute("autocomplete", "name");
      if (key === "email") control.setAttribute("autocomplete", "email");
      if (key === "org") control.setAttribute("autocomplete", "organization");
    }
    if (required) control.setAttribute("aria-required", "true");
    control.setAttribute("aria-describedby", id + "-err");
    wrap.appendChild(control);
    wrap.appendChild(el("p", { class: "cf-err", id: id + "-err", role: "alert" }));
    return wrap;
  }

  function buildForm() {
    var f = el("form", { class: "cf-form", novalidate: "novalidate" });

    f.appendChild(field("name", "text", true));
    f.appendChild(field("email", "email", true));
    f.appendChild(field("org", "text", false));
    f.appendChild(field("topic", "select", true));
    f.appendChild(field("message", "textarea", true));

    /* Honeypot — off screen, out of the accessibility tree, out of tab order. */
    var hp = el("div", { class: "cf-hp", "aria-hidden": "true" });
    var hpInput = el("input", {
      type: "text",
      name: "website",
      tabindex: "-1",
      autocomplete: "off"
    });
    hp.appendChild(hpInput);
    f.appendChild(hp);

    f.appendChild(el("div", { class: "cf-turnstile", "data-turnstile": "" }));
    /* The alert sits directly above the submit button. Placed at the top of the
       form it lands off screen when the panel is scrolled, and the person who
       just pressed the button never sees the failure. */
    f.appendChild(el("p", { class: "cf-alert", "data-alert": "", role: "alert" }));
    var actions = el("p", { class: "cf-actions" });
    actions.appendChild(el("button", { type: "submit", class: "cta" }, T.submit));
    f.appendChild(actions);

    var counter = f.querySelector("[data-count]");
    var message = f.querySelector("#cf-message");
    message.addEventListener("input", function () {
      counter.textContent = message.value.length + " / " + MAX_MESSAGE;
    });

    f.addEventListener("input", function (e) {
      clearError(e.target);
    });
    f.addEventListener("change", function (e) {
      clearError(e.target);
    });
    f.addEventListener("submit", onSubmit);
    return f;
  }

  function build() {
    overlay = el("div", { class: "cf-overlay", "data-contact-overlay": "" });
    overlay.addEventListener("click", close);

    panel = el("aside", {
      class: "cf-panel",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "cf-title"
    });

    var inner = el("div", { class: "cf-inner" });
    var head = el("div", { class: "cf-head" });
    head.appendChild(el("h2", { id: "cf-title" }, T.title));
    var closeBtn = el("button", { type: "button", class: "cf-close", "aria-label": T.close }, "×");
    closeBtn.addEventListener("click", close);
    head.appendChild(closeBtn);
    inner.appendChild(head);
    inner.appendChild(el("p", { class: "cf-lede" }, T.lede));

    form = buildForm();
    inner.appendChild(form);

    var alt = el("p", { class: "cf-alt" });
    alt.appendChild(document.createTextNode(T.altPrefix));
    alt.appendChild(el("a", { href: "mailto:contact@latentpublics.com" }, "contact@latentpublics.com"));
    inner.appendChild(alt);

    panel.appendChild(inner);
    panel.addEventListener("keydown", onPanelKeydown);

    document.body.appendChild(overlay);
    document.body.appendChild(panel);
  }

  /* ---------- open / close ---------- */

  function open(trigger) {
    opener = trigger || null;
    if (!panel) build();
    if (form && form.dataset.done === "1") resetForm();

    overlay.classList.add("is-open");
    panel.classList.add("is-open");
    prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onDocKeydown, true);

    loadTurnstile();
    var first = panel.querySelector("#cf-name");
    if (first) first.focus();
  }

  function close() {
    if (!panel) return;
    overlay.classList.remove("is-open");
    panel.classList.remove("is-open");
    document.body.style.overflow = prevBodyOverflow;
    document.removeEventListener("keydown", onDocKeydown, true);
    if (opener && document.contains(opener)) opener.focus();
    opener = null;
  }

  function isOpen() {
    return !!panel && panel.classList.contains("is-open");
  }

  function onDocKeydown(e) {
    if (e.key === "Escape" && isOpen()) {
      e.preventDefault();
      close();
    }
  }

  function onPanelKeydown(e) {
    if (e.key !== "Tab") return;
    var items = Array.prototype.filter.call(panel.querySelectorAll(FOCUSABLE), function (n) {
      return n.offsetParent !== null || n.tagName === "IFRAME";
    });
    if (!items.length) {
      e.preventDefault();
      return;
    }
    var first = items[0];
    var last = items[items.length - 1];
    var active = document.activeElement;
    if (e.shiftKey && (active === first || !panel.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /* ---------- Turnstile ---------- */

  function loadTurnstile() {
    var slot = panel.querySelector("[data-turnstile]");
    if (!slot || widgetId !== null) return;
    if (window.turnstile) {
      renderTurnstile(slot);
      return;
    }
    if (turnstileLoading) return;
    turnstileLoading = true;
    window.latentPublicsTurnstileReady = function () {
      var s = panel.querySelector("[data-turnstile]");
      if (s) renderTurnstile(s);
    };
    var s = document.createElement("script");
    s.src = TURNSTILE_API + "?render=explicit&onload=latentPublicsTurnstileReady";
    s.defer = true;
    s.onerror = function () {
      turnstileLoading = false;
    };
    document.head.appendChild(s);
  }

  function renderTurnstile(slot) {
    if (!window.turnstile || widgetId !== null) return;
    try {
      widgetId = window.turnstile.render(slot, {
        sitekey: SITE_KEY,
        theme: "auto",
        language: "en"
      });
    } catch (err) {
      widgetId = null;
    }
  }

  function turnstileToken() {
    if (!window.turnstile || widgetId === null) return "";
    try {
      return window.turnstile.getResponse(widgetId) || "";
    } catch (err) {
      return "";
    }
  }

  function resetTurnstile() {
    if (!window.turnstile || widgetId === null) return;
    try {
      window.turnstile.reset(widgetId);
    } catch (err) {
      /* Ignored — with no token the server rejects the submission anyway. */
    }
  }

  /* ---------- validation ---------- */

  function setError(control, msg) {
    var wrap = control.closest(".cf-field");
    if (!wrap) return;
    wrap.classList.add("has-err");
    var p = wrap.querySelector(".cf-err");
    if (p) p.textContent = msg;
    control.setAttribute("aria-invalid", "true");
  }

  function clearError(control) {
    if (!control || !control.closest) return;
    var wrap = control.closest(".cf-field");
    if (!wrap) return;
    wrap.classList.remove("has-err");
    var p = wrap.querySelector(".cf-err");
    if (p) p.textContent = "";
    control.removeAttribute("aria-invalid");
  }

  function validate(data) {
    var bad = null;
    function check(key, ok, msg) {
      var control = form.querySelector("#cf-" + key);
      if (ok) {
        clearError(control);
        return;
      }
      setError(control, msg);
      if (!bad) bad = control;
    }
    check("name", data.name.length > 0, T.required);
    check("email", data.email.length > 0 && EMAIL_RE.test(data.email),
      data.email.length === 0 ? T.required : T.badEmail);
    check("topic", data.topic.length > 0, T.required);
    check("message",
      data.message.length > 0 && data.message.length <= MAX_MESSAGE,
      data.message.length === 0 ? T.required : T.tooLong);
    return bad;
  }

  /* ---------- submit ---------- */

  function readForm() {
    return {
      name: form.querySelector("#cf-name").value.trim(),
      email: form.querySelector("#cf-email").value.trim(),
      org: form.querySelector("#cf-org").value.trim(),
      topic: form.querySelector("#cf-topic").value,
      message: form.querySelector("#cf-message").value.trim(),
      website: form.querySelector('[name="website"]').value
    };
  }

  function showAlert(msg) {
    var box = form.querySelector("[data-alert]");
    box.textContent = msg || "";
    form.classList.toggle("has-alert", !!msg);
  }

  function onSubmit(e) {
    e.preventDefault();
    var data = readForm();
    showAlert("");

    var bad = validate(data);
    if (bad) {
      bad.focus();
      return;
    }

    data["cf-turnstile-response"] = turnstileToken();

    var button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = T.sending;

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    })
      .then(function (res) {
        return res.json().catch(function () {
          return { ok: false, error: "bad_response" };
        });
      })
      .then(function (body) {
        if (body && body.ok) {
          showSuccess();
        } else {
          fail(button, body && body.error);
        }
      })
      .catch(function () {
        fail(button);
      });
  }

  function fail(button, code) {
    /* Input values are left in place — the person must be able to resend. */
    button.disabled = false;
    button.textContent = T.submit;
    resetTurnstile();
    /* An expired token passes on a second press, so it is worded differently
       from a general failure. */
    showAlert(code === "captcha_failed" ? T.expired : T.failure);
    var box = form.querySelector("[data-alert]");
    if (box) box.scrollIntoView({ block: "nearest" });
  }

  function showSuccess() {
    form.dataset.done = "1";
    form.innerHTML = "";
    form.classList.remove("has-alert");
    form.appendChild(el("p", { class: "cf-success", role: "status" }, T.success));
    widgetId = null;
  }

  function resetForm() {
    var fresh = buildForm();
    form.parentNode.replaceChild(fresh, form);
    form = fresh;
    widgetId = null;
  }

  /* ---------- trigger ---------- */

  document.addEventListener("click", function (e) {
    var trigger = e.target.closest ? e.target.closest("[data-contact-open]") : null;
    if (!trigger) return;
    e.preventDefault();
    open(trigger);
  });
})();
