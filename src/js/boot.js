document.documentElement.classList.add('js');
// if the app script never starts, show the content instead of leaving it hidden
setTimeout(function () {
  if (!window.__loordReady) document.documentElement.classList.add('no-app');
}, 4000);
