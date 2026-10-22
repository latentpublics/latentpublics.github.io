(function () {
  "use strict";

  // 인쇄·PDF 모드에서는 뷰어를 켜지 않는다.
  if (document.documentElement.classList.contains("print")) return;

  var track = document.getElementById("track");
  var ticksEl = document.getElementById("ticks");
  var prevBtn = document.getElementById("prev");
  var nextBtn = document.getElementById("next");
  var fsBtn = document.getElementById("fs");
  var curEl = document.getElementById("cur");
  var totalEl = document.getElementById("total");
  var stage = document.querySelector(".stage");
  var viewport = document.querySelector(".viewport");
  if (!track) return;

  var cells = Array.prototype.slice.call(track.querySelectorAll(".cell"));
  var TOTAL = cells.length;
  var ticks = [];
  var index = 0;
  if (totalEl) totalEl.textContent = String(TOTAL);

  // 1920×1080 슬라이드를 뷰포트 폭에 맞춰 축소한다.
  function fit() {
    var k = viewport.clientWidth / 1920;
    track.style.setProperty("--k", k);
  }
  if (window.ResizeObserver) new ResizeObserver(fit).observe(viewport);
  window.addEventListener("resize", fit);
  fit();

  cells.forEach(function (c, i) {
    c.setAttribute("aria-label", "슬라이드 " + (i + 1) + " / " + TOTAL);
    var t = document.createElement("button");
    t.type = "button";
    t.className = "tick";
    t.setAttribute("role", "tab");
    t.setAttribute("aria-label", (i + 1) + "번 슬라이드");
    t.appendChild(document.createElement("i"));
    t.addEventListener("click", function () { go(i); });
    ticksEl.appendChild(t);
    ticks.push(t);
  });

  // 영상을 재생할 수 없는 브라우저(예: 서버 Range 미지원 상태의 iOS Safari)에서는
  // 흰 화면 대신 마지막 장면 정지 화면을 보여준다.
  function fallback(video) {
    var f = video.parentNode;
    if (f && f.classList) f.classList.add("fallback");
  }
  function failed(video) {
    // 마지막 <source>까지 실패했는지. networkState는 소스를 고르는 도중에도
    // 잠깐 NETWORK_NO_SOURCE가 되므로 판단에 쓰지 않는다.
    return !!video.error || video.dataset.srcfailed === "1";
  }
  // 오류 리스너는 페이지 로드 때 붙인다. preload="metadata"라 소스 오류는
  // 6쪽에 들어가기 전에 이미 끝날 수 있다. 이미 실패한 영상은 바로 전환한다.
  Array.prototype.forEach.call(document.querySelectorAll(".slide video"), function (video) {
    video.addEventListener("error", function () { fallback(video); });
    var srcs = video.querySelectorAll("source");
    if (srcs.length) srcs[srcs.length - 1].addEventListener("error", function () {
      video.dataset.srcfailed = "1";
      fallback(video);
    });
    if (failed(video)) fallback(video);
  });
  // 오류 없이 멈춰 있는 경우(재생이 시작되지 않음)는 6쪽에 머문 지 4초 뒤 전환한다.
  function watch(video) {
    if (failed(video)) { fallback(video); return; }
    if (video.dataset.watched) return;
    video.dataset.watched = "1";
    // 리스너를 붙이기 전에 소스가 모두 실패한 경우: 1초가 지나도 소스 없음 상태면 전환
    setTimeout(function () {
      if (video.networkState === 3 && video.readyState === 0) fallback(video);
    }, 1000);
    setTimeout(function () {
      delete video.dataset.watched;
      var cell = video.closest(".cell");
      if (cell && cell.getAttribute("aria-hidden") === "true") return; // 그 사이 다른 쪽으로 넘김
      if (failed(video) || video.currentTime === 0 || video.readyState < 2) fallback(video);
    }, 4000);
  }

  function render(animate) {
    if (!animate) track.classList.add("nomove");
    track.style.transform = "translateX(" + (-index * 100) + "%)";
    if (!animate) { void track.offsetWidth; track.classList.remove("nomove"); }
    curEl.textContent = String(index + 1);
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === TOTAL - 1;
    for (var n = 0; n < TOTAL; n++) {
      ticks[n].setAttribute("aria-current", n === index ? "true" : "false");
      cells[n].setAttribute("aria-hidden", n === index ? "false" : "true");
      // 현재 슬라이드의 영상만 처음부터 재생한다.
      var vids = cells[n].querySelectorAll("video");
      for (var v = 0; v < vids.length; v++) {
        if (n === index) {
          vids[v].preload = "auto";
          try { vids[v].currentTime = 0; } catch (e) {}
          var pr = vids[v].play();
          if (pr && pr.catch) pr.catch(function () {});
          watch(vids[v]);
        } else {
          vids[v].pause();
        }
      }
    }
  }

  function go(k, animate) {
    k = Math.max(0, Math.min(TOTAL - 1, k));
    if (k === index) return;
    index = k;
    render(animate !== false);
    if (history.replaceState) history.replaceState(null, "", "#s" + (index + 1));
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

  var x0 = null, y0 = null;
  stage.addEventListener("touchstart", function (e) {
    if (e.touches.length !== 1) { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  stage.addEventListener("touchend", function (e) {
    if (x0 === null) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - x0, dy = t.clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy)) go(index + (dx < 0 ? 1 : -1));
  }, { passive: true });

  if (fsBtn) {
    if (!stage.requestFullscreen) {
      fsBtn.style.display = "none";
    } else {
      fsBtn.addEventListener("click", function () {
        if (document.fullscreenElement) document.exitFullscreen();
        else stage.requestFullscreen();
      });
      document.addEventListener("fullscreenchange", function () { setTimeout(fit, 50); });
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
