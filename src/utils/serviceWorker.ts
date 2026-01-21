// Service Worker registration and management utilities

export interface ServiceWorkerConfig {
    onUpdate?: (registration: ServiceWorkerRegistration) => void;
    onSuccess?: (registration: ServiceWorkerRegistration) => void;
    onError?: (error: Error) => void;
}

class ServiceWorkerManager {
    private registration: ServiceWorkerRegistration | null = null;
    private updateAvailable = false;

    async register(config: ServiceWorkerConfig = {}): Promise<void> {
        if (!('serviceWorker' in navigator)) {
            console.log('Service Worker not supported');
            return;
        }

        try {
            const registration = await navigator.serviceWorker.register('/sw.js', {
                scope: '/'
            });

            console.log('Service Worker registered:', registration);

            // Handle updates
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                if (newWorker) {
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // New content is available
                            this.updateAvailable = true;
                            config.onUpdate?.(registration);
                        }
                    });
                }
            });

            // Handle controller change (new SW activated)
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                console.log('Service Worker controller changed');
                window.location.reload();
            });

            this.registration = registration;
            config.onSuccess?.(registration);

        } catch (error) {
            console.error('Service Worker registration failed:', error);
            config.onError?.(error as Error);
        }
    }

    async update(): Promise<void> {
        if (this.registration) {
            try {
                await this.registration.update();
                console.log('Service Worker update triggered');
            } catch (error) {
                console.error('Service Worker update failed:', error);
            }
        }
    }

    async skipWaiting(): Promise<void> {
        if (this.registration?.waiting) {
            this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
    }

    async getCacheSize(): Promise<number> {
        return new Promise((resolve) => {
            if (this.registration?.active) {
                const messageChannel = new MessageChannel();
                messageChannel.port1.onmessage = (event) => {
                    resolve(event.data.cacheSize || 0);
                };
                this.registration.active.postMessage(
                    { type: 'GET_CACHE_SIZE' },
                    [messageChannel.port2]
                );
            } else {
                resolve(0);
            }
        });
    }

    async clearCache(): Promise<void> {
        return new Promise((resolve) => {
            if (this.registration?.active) {
                const messageChannel = new MessageChannel();
                messageChannel.port1.onmessage = (event) => {
                    if (event.data.success) {
                        console.log('Cache cleared successfully');
                    }
                    resolve();
                };
                this.registration.active.postMessage(
                    { type: 'CLEAR_CACHE' },
                    [messageChannel.port2]
                );
            } else {
                resolve();
            }
        });
    }

    isUpdateAvailable(): boolean {
        return this.updateAvailable;
    }

    getRegistration(): ServiceWorkerRegistration | null {
        return this.registration;
    }
}

// Singleton instance
const swManager = new ServiceWorkerManager();

// Convenience functions
export const registerServiceWorker = (config?: ServiceWorkerConfig) => {
    return swManager.register(config);
};

export const updateServiceWorker = () => {
    return swManager.update();
};

export const skipWaiting = () => {
    return swManager.skipWaiting();
};

export const getCacheSize = () => {
    return swManager.getCacheSize();
};

export const clearCache = () => {
    return swManager.clearCache();
};

export const isUpdateAvailable = () => {
    return swManager.isUpdateAvailable();
};

export const getServiceWorkerRegistration = () => {
    return swManager.getRegistration();
};

// Format cache size for display
export const formatCacheSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Check if service worker is supported
export const isServiceWorkerSupported = (): boolean => {
    return 'serviceWorker' in navigator;
};

// Check if app is running in offline mode
export const isOffline = (): boolean => {
    return !navigator.onLine;
};

// Listen for online/offline events
export const onOnlineStatusChange = (callback: (isOnline: boolean) => void): (() => void) => {
    const handleOnline = () => callback(true);
    const handleOffline = () => callback(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Return cleanup function
    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
};

export default swManager;
