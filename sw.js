const CACHE_NAME = 'dimdim-v2.0.0';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/firebase-config.js',
  './manifest.json'
];

// 1. Instalação do Service Worker e Pre-cache dos Arquivos Principais
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting(); // Força a ativação do novo Service Worker sem esperar o usuário fechar a aba
});

// 2. Ativação: Limpa Caches Antigos e Assume o Controle de Todas as Janelas/PWA
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Limpando versão de cache antiga:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim(); // Garante controle imediato de todos os clientes abertos
});

// 3. Estratégia Network-First: Busca primeiro da rede; se offline, recorre ao cache
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Se a busca na rede foi bem-sucedida, atualiza a cópia salva no cache
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Se estiver sem conexão ou falhar a rede, entrega a versão armazenada em cache
        return caches.match(event.request);
      })
  );
});