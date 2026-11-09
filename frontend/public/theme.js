// Il tema, prima che la pagina si disegni: quello scelto su questo dispositivo (`tema`), se no quello del sistema,
// seguito quando cambia. La barra del telefono prende lo stesso colore dello sfondo.
(() => {
  const system = matchMedia('(prefers-color-scheme: dark)');
  const chosen = () => {
    try {
      return JSON.parse(localStorage.getItem('tema'));
    } catch {
      return null;
    }
  };
  const apply = () => {
    const dark = (chosen() ?? (system.matches ? 'dark' : 'light')) === 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#0b0d10' : '#e8ebef');
  };
  apply();
  system.addEventListener('change', apply);
})();
