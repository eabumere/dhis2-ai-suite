// Service Worker for DHIS2 AI Suite
// Handles caching of static assets and offline functionality

const CACHE_NAME = 'dhis2-ai-suite-v1.0.0';
const STATIC_CACHE = 'dhis2-ai-suite-static-v1.0.0';
const DYNAMIC_CACHE = 'dhis2-ai-suite-dynamic-v1.0.0';
const IMAGE_CACHE = 'dhis2-ai-suite-images-v1.0.0';

// Assets to cache immediately
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/favicon.ico',
    '/static/js/bundle.js',
    '/static/css/main.css'
];

// API endpoints that should be cached
const API_CACHE_PATTERNS = [
    /\/api\/metadata/,
    /\/api\/dataElements/,
    /\/api\/organisationUnits/,
    /\/api\/categoryOptionCombos/
];

// Install event - cache static assets
self.addEventListener('install', event => {
    console.log('[SW] Installing service worker');
    event.waitUntil(
        caches.open(STATIC_CACHE).then(cache => {
            console.log('[SW] Caching static assets');
            return cache.addAll(STATIC_ASSETS);
        }).catch(error => {
            console.error('[SW] Failed to cache static assets:', error);
        })
    );
    // Force activation of new service worker
    self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    console.log('[SW] Activating service worker');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== STATIC_CACHE &&
                        cacheName !== DYNAMIC_CACHE &&
                        cacheName !== IMAGE_CACHE &&
                        cacheName !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // Take control of all clients
            return self.clients.claim();
        })
    );
});

// Fetch event - handle requests
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Handle different types of requests
    if (request.method === 'GET') {
        // Cache images
        if (request.destination === 'image' || url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) {
            event.respondWith(cacheFirst(request, IMAGE_CACHE));
        }
        // Cache API calls that match patterns
        else if (API_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname))) {
            event.respondWith(networkFirst(request, DYNAMIC_CACHE));
        }
        // Cache static assets
        else if (STATIC_ASSETS.includes(url.pathname) || request.destination === 'script' || request.destination === 'style') {
            event.respondWith(cacheFirst(request, STATIC_CACHE));
        }
        // For navigation requests, try network first, then cache
        else if (request.mode === 'navigate') {
            event.respondWith(networkFirst(request, DYNAMIC_CACHE));
        }
        // Default: try cache first, then network
        else {
            event.respondWith(cacheFirst(request, DYNAMIC_CACHE));
        }
    }
});

// Cache-first strategy
async function cacheFirst(request, cacheName) {
    try {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }

        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        console.error('[SW] Cache-first failed:', error);
        // Return offline fallback if available
        if (request.destination === 'document') {
            const cache = await caches.open(STATIC_CACHE);
            return cache.match('/offline.html') || new Response('Offline', { status: 503 });
        }
        throw error;
    }
}

// Network-first strategy
async function networkFirst(request, cacheName) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        console.log('[SW] Network failed, trying cache:', error);
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        throw error;
    }
}

// Background sync for offline actions
self.addEventListener('sync', event => {
    if (event.tag === 'background-sync') {
        event.waitUntil(doBackgroundSync());
    }
});

async function doBackgroundSync() {
    console.log('[SW] Performing background sync');
    // Implement background sync logic here
    // This could sync offline actions when connection is restored
}

// Push notifications (if needed in the future)
self.addEventListener('push', event => {
    if (event.data) {
        const data = event.data.json();
        const options = {
            body: data.body,
            icon: '/icon-192x192.png',
            badge: '/icon-192x192.png',
            vibrate: [100, 50, 100],
            data: {
                dateOfArrival: Date.now(),
                primaryKey: data.primaryKey
            }
        };
        event.waitUntil(
            self.registration.showNotification(data.title, options)
        );
    }
});

// Notification click handler
self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data.url || '/')
    );
});

// Message handler for communication with main thread
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'GET_CACHE_SIZE') {
        calculateCacheSize().then(size => {
            event.ports[0].postMessage({ cacheSize: size });
        });
    }

    if (event.data && event.data.type === 'CLEAR_CACHE') {
        clearAllCaches().then(() => {
            event.ports[0].postMessage({ success: true });
        });
    }
});

// Calculate total cache size
async function calculateCacheSize() {
    try {
        const cacheNames = await caches.keys();
        let totalSize = 0;

        for (const cacheName of cacheNames) {
            const cache = await caches.open(cacheName);
            const keys = await cache.keys();

            for (const request of keys) {
                const response = await cache.match(request);
                if (response) {
                    const blob = await response.blob();
                    totalSize += blob.size;
                }
            }
        }

        return totalSize;
    } catch (error) {
        console.error('[SW] Failed to calculate cache size:', error);
        return 0;
    }
}

// Clear all caches
async function clearAllCaches() {
    try {
        const cacheNames = await caches.keys();
        await Promise.all(
            cacheNames.map(cacheName => caches.delete(cacheName))
        );
        console.log('[SW] All caches cleared');
    } catch (error) {
        console.error('[SW] Failed to clear caches:', error);
    }
}

// Periodic cache cleanup
self.addEventListener('periodicsync', event => {
    if (event.tag === 'cache-cleanup') {
        event.waitUntil(cleanupOldCache());
    }
});

async function cleanupOldCache() {
    try {
        const cache = await caches.open(DYNAMIC_CACHE);
        const keys = await cache.keys();

        // Remove entries older than 1 hour
        const oneHourAgo = Date.now() - (60 * 60 * 1000);

        for (const request of keys) {
            const response = await cache.match(request);
            if (response) {
                const date = response.headers.get('date');
                if (date && new Date(date).getTime() < oneHourAgo) {
                    await cache.delete(request);
                }
            }
        }

        console.log('[SW] Cache cleanup completed');
    } catch (error) {
        console.error('[SW] Cache cleanup failed:', error);
    }
}
