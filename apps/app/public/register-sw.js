// Registra o service worker (necessário para "Instalar app" no Chrome/Edge do PC e do Android).
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
