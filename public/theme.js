(() => {
  const key = 'unison-theme';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const saved = () => { try { return localStorage.getItem(key); } catch { return null; } };
  let preference = saved();
  const isDark = () => preference === 'dark' || (preference !== 'light' && system.matches);
  function updateButtons() {
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const dark = isDark();
      button.setAttribute('aria-pressed', String(dark));
      button.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
      const label = dark ? '☀ Light mode' : '◐ Dark mode';
      if (button.textContent !== label) button.textContent = label;
    });
  }
  function apply() {
    document.documentElement.dataset.theme = isDark() ? 'dark' : 'light';
    updateButtons();
  }
  apply();
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-theme-toggle]')) return;
    preference = isDark() ? 'light' : 'dark';
    try { localStorage.setItem(key, preference); } catch { /* In-memory preference still works. */ }
    apply();
  });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) { preference = saved(); apply(); }
  });
  system.addEventListener('change', () => { if (!['light', 'dark'].includes(preference)) apply(); });
  document.addEventListener('DOMContentLoaded', () => {
    updateButtons();
    // Login and workspace render dynamically; new controls inherit the current mode.
    new MutationObserver(updateButtons).observe(document.body, { childList: true, subtree: true });
  });
})();
