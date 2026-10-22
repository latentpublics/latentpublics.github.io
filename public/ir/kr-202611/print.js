// <head>에서 동기 로드된다. 문서보다 먼저 실행되어야 하는 두 가지만 둔다.

// 1) ?print 로 열면 모든 장을 세로로 펼친 인쇄·PDF 모드로 전환한다.
if (/[?&]print\b/.test(location.search)) document.documentElement.classList.add('print');

// 2) 영상의 마지막 <source>가 실패하면 그 칸을 정지 화면으로 바꾼다.
//    <source>의 error 이벤트는 버블링되지 않고, viewer.js(문서 끝)가 리스너를 붙이기 전에
//    날 수 있으므로 캡처 단계에서 문서 전체로 받는다. 실패한 <source>에서는 video.error가
//    설정되지 않아 나중에 검사할 수도 없다.
document.addEventListener('error', function (e) {
  var t = e.target;
  if (!t || t.tagName !== 'SOURCE') return;
  var video = t.parentNode;
  if (!video || video.tagName !== 'VIDEO' || video.lastElementChild !== t) return;
  video.setAttribute('data-srcfailed', '1');
  if (video.parentNode && video.parentNode.classList) video.parentNode.classList.add('fallback');
}, true);
