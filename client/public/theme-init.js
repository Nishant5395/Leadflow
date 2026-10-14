// Runs before first paint (loaded as a blocking script so there is no light-mode flash).
// Kept as a separate file because the production Content-Security-Policy forbids inline scripts.
(function () {
  try {
    var stored = localStorage.getItem('leadflow-theme');
    var theme = stored || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();
