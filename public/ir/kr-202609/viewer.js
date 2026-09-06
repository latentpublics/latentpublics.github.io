(function () {
  "use strict";

  var TOTAL = 25;
  var track = document.getElementById("track");
  var ticksEl = document.getElementById("ticks");
  var prevBtn = document.getElementById("prev");
  var nextBtn = document.getElementById("next");
  var fsBtn = document.getElementById("fs");
  var curEl = document.getElementById("cur");
  var stage = document.querySelector(".stage");
  if (!track) return;

  var imgs = [];
  var ticks = [];
  var i, n;

  function pad(v) { return v < 10 ? "0" + v : String(v); }

  // Build slides and tick marks.
  for (i = 1; i <= TOTAL; i++) {
    var img = document.createElement("img");
    img.alt = "슬라이드 " + i + " / " + TOTAL;
    img.width = 1920;
    img.height = 1080;
    img.draggable = false;
    if (i === 1) {
      img.src = "slides/slide-" + pad(i) + ".webp";
      img.fetchPriority = "high";
    } else {
      img.dataset.src = "slides/slide-" + pad(i) + ".webp";
    }
    track.appendChild(img);
    imgs.push(img);

    var t = document.createElement("button");
    t.type = "button";
    t.className = "tick";
    t.setAttribute("role", "tab");
    t.setAttribute("aria-label", i + "번 슬라이드");
    t.appendChild(document.createElement("i"));
    (function (idx) {
      t.addEventListener("click", function () { go(idx); });
    })(i - 1);
    ticksEl.appendChild(t);
    ticks.push(t);
  }

  var index = 0;

  function load(k) {
    if (k < 0 || k >= TOTAL) return;
    var el = imgs[k];
    if (el.dataset.src) {
      el.src = el.dataset.src;
      delete el.dataset.src;
    }
  }

  function render(animate) {
    if (!animate) track.classList.add("nomove");
    track.style.transform = "translateX(" + (-index * 100) + "%)";
    if (!animate) {
      // Force reflow so the next change animates again.
      void track.offsetWidth;
      track.classList.remove("nomove");
    }
    curEl.textContent = String(index + 1);
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === TOTAL - 1;
    for (n = 0; n < TOTAL; n++) {
      ticks[n].setAttribute("aria-current", n === index ? "true" : "false");
    }
    // Keep the current slide and its neighbours resident.
    load(index); load(index + 1); load(index - 1); load(index + 2);
  }

  function go(k, animate) {
    k = Math.max(0, Math.min(TOTAL - 1, k));
    if (k === index) return;
    index = k;
    render(animate !== false);
    if (history.replaceState) {
      history.replaceState(null, "", "#s" + (index + 1));
    }
  }

  prevBtn.addEventListener("click", function () { go(index - 1); });
  nextBtn.addEventListener("click", function () { go(index + 1); });

  document.addEventListener("keydown", function (e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    var tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    switch (e.key) {
      case "ArrowRight": case "PageDown": go(index + 1); break;
      case "ArrowLeft":  case "PageUp":   go(index - 1); break;
      case " ":          go(index + 1); break;
      case "Home":       go(0); break;
      case "End":        go(TOTAL - 1); break;
      default: return;
    }
    e.preventDefault();
  });

  // Touch swipe.
  var x0 = null, y0 = null;
  stage.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1) { x0 = null; return; }
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
  }, { passive: true });
  stage.addEventListener("touchend", function (e) {
    if (x0 === null) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - x0, dy = t.clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy)) {
      go(index + (dx < 0 ? 1 : -1));
    }
  }, { passive: true });

  if (fsBtn) {
    if (!stage.requestFullscreen) {
      fsBtn.style.display = "none";
    } else {
      fsBtn.addEventListener("click", function () {
        if (document.fullscreenElement) document.exitFullscreen();
        else stage.requestFullscreen();
      });
    }
  }

  function fromHash() {
    var m = /^#s(\d+)$/.exec(location.hash || "");
    return m ? Math.max(0, Math.min(TOTAL - 1, parseInt(m[1], 10) - 1)) : 0;
  }
  window.addEventListener("hashchange", function () { go(fromHash()); });

  index = fromHash();
  render(false);
})();
