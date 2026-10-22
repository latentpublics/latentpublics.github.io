// ?print 로 열면 모든 장을 세로로 펼친 인쇄·PDF 모드로 전환한다. <head>에서 동기 로드.
if (/[?&]print\b/.test(location.search)) document.documentElement.classList.add('print');
