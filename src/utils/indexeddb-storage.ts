/**
 * IndexedDB Storage Utility for DHIS2 AI Suite
 *
 * Provides IndexedDB-based storage with quota management and automatic cleanup.
 * Handles conversation context and analytics data persistence.
 */

import { dhis2Config } from './env-config';
import type { ConversationEntry } from './conversation-context';

export interface AnalyticsData {
    id: string;
    timestamp: number;
    query: string;
    summary: string;
    chartData?: any;
    dataSummary?: any;
    metadata?: any;
    rawData?: any;
    sessionId?: string; // Track which session this analytics data belongs to
}

export interface ConversationMemory {
    conversations: ConversationEntry[];
    dataContexts: Map<string, any>;
    activeTopics: string[];
    lastAnalyticsQuery?: ConversationEntry;
    sessionId?: string;
    sessionStartTime?: number;
}

export interface FileData {
    id: string;
    name: string;
    type: string;
    size: number;
    content: Uint8Array | string;
    isBinary: boolean;
    uploadedAt: number;
    lastAccessed?: number;
}

class IndexedDBStorage {
    private db: IDBDatabase | null = null;
    private readonly dbName = 'dhis2_ai_suite';
    private readonly dbVersion = 2; // Increment version to add files store
    private readonly maxStorageMB = dhis2Config.getIndexedDBMaxStorageMB();
    private readonly conversationsStore = 'conversations';
    private readonly analyticsStore = 'analytics';
    private readonly memoryStore = 'memory';
    private readonly filesStore = 'files';

    /**
     * Initialize IndexedDB database and create object stores
     */
    async init(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.error('Failed to open IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('IndexedDB initialized successfully');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                this.createObjectStores(db);
            };
        });
    }

    /**
     * Create object stores with indexes
     */
    private createObjectStores(db: IDBDatabase): void {
        // Conversations store - indexed by timestamp for efficient cleanup
        if (!db.objectStoreNames.contains(this.conversationsStore)) {
            const conversationsStore = db.createObjectStore(this.conversationsStore, { keyPath: 'id' });
            conversationsStore.createIndex('timestamp', 'timestamp', { unique: false });
            conversationsStore.createIndex('agent', 'agent', { unique: false });
        }

        // Analytics store - indexed by timestamp for efficient cleanup
        if (!db.objectStoreNames.contains(this.analyticsStore)) {
            const analyticsStore = db.createObjectStore(this.analyticsStore, { keyPath: 'id' });
            analyticsStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Files store - indexed by uploadedAt and type for efficient cleanup
        if (!db.objectStoreNames.contains(this.filesStore)) {
            const filesStore = db.createObjectStore(this.filesStore, { keyPath: 'id' });
            filesStore.createIndex('uploadedAt', 'uploadedAt', { unique: false });
            filesStore.createIndex('type', 'type', { unique: false });
            filesStore.createIndex('lastAccessed', 'lastAccessed', { unique: false });
        }

        // Memory store for conversation context
        if (!db.objectStoreNames.contains(this.memoryStore)) {
            db.createObjectStore(this.memoryStore, { keyPath: 'key' });
        }
    }

    /**
     * Check if storage quota is exceeded and cleanup if necessary
     */
    private async checkAndCleanupStorage(): Promise<void> {
        try {
            const estimate = await navigator.storage.estimate();
            const usedMB = (estimate.usage || 0) / (1024 * 1024);

            if (usedMB >= this.maxStorageMB) {
                console.log(`Storage quota exceeded: ${usedMB.toFixed(2)}MB used, limit: ${this.maxStorageMB}MB. Starting cleanup...`);
                await this.cleanupOldData();
            }
        } catch (error) {
            console.warn('Failed to check storage quota:', error);
        }
    }

    /**
     * Remove oldest entries to free up storage space
     */
    private async cleanupOldData(): Promise<void> {
        if (!this.db) throw new Error('Database not initialized');

        // Remove oldest conversations first
        await this.cleanupStore(this.conversationsStore, 20); // Keep last 20 conversations

        // Remove old analytics data
        await this.cleanupStore(this.analyticsStore, 5); // Keep last 5 analytics results

        // Remove old files (more aggressive cleanup for files)
        await this.cleanupStore(this.filesStore, 10); // Keep last 10 files

        console.log('Storage cleanup completed');
    }

    /**
     * Remove oldest entries from a specific store
     */
    private async cleanupStore(storeName: string, keepCount: number): Promise<void> {
        if (!this.db) return;

        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);

        // Get all entries sorted by timestamp (oldest first)
        const index = store.index('timestamp');
        const request = index.openCursor();

        return new Promise((resolve, reject) => {
            const entriesToDelete: string[] = [];

            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest).result;
                if (cursor) {
                    entriesToDelete.push(cursor.primaryKey as string);
                    cursor.continue();
                } else {
                    // Delete entries beyond the keep count
                    const deleteCount = Math.max(0, entriesToDelete.length - keepCount);
                    if (deleteCount > 0) {
                        console.log(`Removing ${deleteCount} old entries from ${storeName}`);
                        for (let i = 0; i < deleteCount; i++) {
                            store.delete(entriesToDelete[i]);
                        }
                    }
                    resolve();
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Save conversation entry
     */
    async saveConversation(entry: ConversationEntry): Promise<void> {
        if (!this.db) await this.init();
        if (!this.db) throw new Error('Database not initialized');

        await this.checkAndCleanupStorage();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.conversationsStore], 'readwrite');
            const store = transaction.objectStore(this.conversationsStore);
            const request = store.put(entry);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Load conversation entries (with optional limit)
     */
    async loadConversations(limit?: number): Promise<ConversationEntry[]> {
        if (!this.db) await this.init();
        if (!this.db) throw new Error('Database not initialized');

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.conversationsStore], 'readonly');
            const store = transaction.objectStore(this.conversationsStore);
            const index = store.index('timestamp');

            const request = limit ? index.openCursor(null, 'prev') : index.openCursor();
            const results: ConversationEntry[] = [];
            let count = 0;

            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest).result;
                if (cursor && (!limit || count < limit)) {
                    results.push(cursor.value);
                    count++;
                    cursor.continue();
                } else {
                    // Sort by timestamp descending (most recent first)
                    results.sort((a, b) => b.timestamp - a.timestamp);
                    resolve(results);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Save analytics data
     */
    async saveAnalytics(data: AnalyticsData): Promise<void> {
        if (!this.db) await this.init();
        if (!this.db) throw new Error('Database not initialized');

        await this.checkAndCleanupStorage();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.analyticsStore], 'readwrite');
            const store = transaction.objectStore(this.analyticsStore);
            const request = store.put(data);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Load latest analytics data
     */
    async loadLatestAnalytics(): Promise<AnalyticsData | null> {
        if (!this.db) await this.init();
        if (!this.db) throw new Error('Database not initialized');

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.analyticsStore], 'readonly');
            const store = transaction.objectStore(this.analyticsStore);
            const index = store.index('timestamp');

            const request = index.openCursor(null, 'prev'); // Most recent first

            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest).result;
                if (cursor) {
                    resolve(cursor.value);
                } else {
                    resolve(null);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Load latest analytics data for a specific session
     */
    async loadLatestAnalyticsForSession(sessionId: string): Promise<AnalyticsData | null> {
        if (!this.db) await this.init();
        if (!this.db) throw new Error('Database not initialized');

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.analyticsStore], 'readonly');
            const store = transaction.objectStore(this.analyticsStore);
            const index = store.index('timestamp');

            const request = index.openCursor(null, 'prev'); // Most recent first

            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest).result;
                if (cursor) {
                    const data: AnalyticsData = cursor.value;
                    // Check if this analytics data belongs to the specified session
                    if (data.sessionId === sessionId) {
                        resolve(data);
                    } else {
                        // Continue searching for analytics from this session
                        cursor.continue();
                    }
                } else {
                    resolve(null);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Clear all analytics data for a specific session
     */
    async clearAnalyticsForSession(sessionId: string): Promise<void> {
        if (!this.db) await this.init();
        if (!this.db) throw new Error('Database not initialized');

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.analyticsStore], 'readwrite');
            const store = transaction.objectStore(this.analyticsStore);
            const request = store.openCursor();

            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest).result;
                if (cursor) {
                    const data: AnalyticsData = cursor.value;
                    if (data.sessionId === sessionId) {
                        cursor.delete();
                    }
                    cursor.continue();
                } else {
                    console.log(`🗑️ Cleared analytics data for session: ${sessionId}`);
                    resolve();
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Clear all analytics data (for new session start)
     */
    async clearAllAnalytics(): Promise<void> {
        if (!this.db) await this.init();
        if (!this.db) throw new Error('Database not initialized');

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.analyticsStore], 'readwrite');
            const store = transaction.objectStore(this.analyticsStore);
            const request = store.clear();

            request.onsuccess = () => {
                console.log('🗑️ Cleared all analytics data from IndexedDB');
                resolve();
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Clear all conversations (for new session start)
     */
    async clearAllConversations(): Promise<void> {
        if (!this.db) await this.init();
        if (!this.db) throw new Error('Database not initialized');

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.conversationsStore], 'readwrite');
            const store = transaction.objectStore(this.conversationsStore);
            const request = store.clear();

            request.onsuccess = () => {
                console.log('🗑️ Cleared all conversations from IndexedDB');
                resolve();
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Clear memory/conversation context (for new session start)
     */
    async clearMemory(key: string): Promise<void> {
        if (!this.db) await this.init();
        if (!this.db) throw new Error('Database not initialized');

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.memoryStore], 'readwrite');
            const store = transaction.objectStore(this.memoryStore);
            const request = store.delete(key);

            request.onsuccess = () => {
                console.log(`🗑️ Cleared memory for key: ${key}`);
                resolve();
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Save conversation memory/context
     */
    async saveMemory(key: string, data: ConversationMemory): Promise<void> {
        if (!this.db) await this.init();
        if (!this.db) throw new Error('Database not initialized');

        await this.checkAndCleanupStorage();

        // Convert Map to plain object for storage
        const storageData = {
            key,
            ...data,
            dataContexts: Object.fromEntries(data.dataContexts.entries())
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.memoryStore], 'readwrite');
            const store = transaction.objectStore(this.memoryStore);
            const request = store.put(storageData);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Load conversation memory/context
     */
    async loadMemory(key: string): Promise<ConversationMemory | null> {
        if (!this.db) await this.init();
        if (!this.db) throw new Error('Database not initialized');

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.memoryStore], 'readonly');
            const store = transaction.objectStore(this.memoryStore);
            const request = store.get(key);

            request.onsuccess = () => {
                const result = request.result;
                if (result) {
                    // Convert back to Map
                    const memory: ConversationMemory = {
                        ...result,
                        dataContexts: new Map(Object.entries(result.dataContexts || {}))
                    };
                    resolve(memory);
                } else {
                    resolve(null);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Save file data
     */
    async saveFile(fileData: FileData): Promise<void> {
        if (!this.db) await this.init();
        if (!this.db) throw new Error('Database not initialized');

        await this.checkAndCleanupStorage();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.filesStore], 'readwrite');
            const store = transaction.objectStore(this.filesStore);
            const request = store.put(fileData);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Load file data by ID
     */
    async loadFile(fileId: string): Promise<FileData | null> {
        if (!this.db) await this.init();
        if (!this.db) throw new Error('Database not initialized');

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.filesStore], 'readonly');
            const store = transaction.objectStore(this.filesStore);
            const request = store.get(fileId);

            request.onsuccess = () => {
                const result = request.result;
                if (result) {
                    resolve(result);
                } else {
                    resolve(null);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Load recent files (for file picker/history)
     */
    async loadRecentFiles(limit: number = 10): Promise<FileData[]> {
        if (!this.db) await this.init();
        if (!this.db) throw new Error('Database not initialized');

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.filesStore], 'readonly');
            const store = transaction.objectStore(this.filesStore);
            const index = store.index('uploadedAt');

            const request = index.openCursor(null, 'prev'); // Most recent first
            const results: FileData[] = [];
            let count = 0;

            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest).result;
                if (cursor && count < limit) {
                    results.push(cursor.value);
                    count++;
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };

            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Delete file data
     */
    async deleteFile(fileId: string): Promise<void> {
        if (!this.db) await this.init();
        if (!this.db) throw new Error('Database not initialized');

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.filesStore], 'readwrite');
            const store = transaction.objectStore(this.filesStore);
            const request = store.delete(fileId);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Update file last accessed timestamp
     */
    async updateFileAccess(fileId: string): Promise<void> {
        if (!this.db) await this.init();
        if (!this.db) throw new Error('Database not initialized');

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([this.filesStore], 'readwrite');
            const store = transaction.objectStore(this.filesStore);
            const getRequest = store.get(fileId);

            getRequest.onsuccess = () => {
                const fileData = getRequest.result;
                if (fileData) {
                    fileData.lastAccessed = Date.now();
                    const putRequest = store.put(fileData);
                    putRequest.onsuccess = () => resolve();
                    putRequest.onerror = () => reject(putRequest.error);
                } else {
                    resolve(); // File doesn't exist, nothing to update
                }
            };

            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    /**
     * Clear all data (useful for testing or reset)
     */
    async clearAll(): Promise<void> {
        if (!this.db) await this.init();
        if (!this.db) throw new Error('Database not initialized');

        const transaction = this.db.transaction([this.conversationsStore, this.analyticsStore, this.memoryStore, this.filesStore], 'readwrite');

        return new Promise((resolve, reject) => {
            let completed = 0;
            const total = 4;

            const checkComplete = () => {
                completed++;
                if (completed === total) resolve();
            };

            transaction.objectStore(this.conversationsStore).clear().onsuccess = checkComplete;
            transaction.objectStore(this.analyticsStore).clear().onsuccess = checkComplete;
            transaction.objectStore(this.memoryStore).clear().onsuccess = checkComplete;
            transaction.objectStore(this.filesStore).clear().onsuccess = checkComplete;

            transaction.onerror = () => reject(transaction.error);
        });
    }

    /**
     * Get storage statistics
     */
    async getStorageStats(): Promise<{
        conversations: number;
        analytics: number;
        memory: number;
        totalEntries: number;
        estimatedSizeMB: number;
    }> {
        if (!this.db) await this.init();
        if (!this.db) throw new Error('Database not initialized');

        const stats = {
            conversations: 0,
            analytics: 0,
            memory: 0,
            totalEntries: 0,
            estimatedSizeMB: 0
        };

        try {
            const estimate = await navigator.storage.estimate();
            stats.estimatedSizeMB = (estimate.usage || 0) / (1024 * 1024);
        } catch (error) {
            console.warn('Failed to get storage estimate:', error);
        }

        // Count entries in each store
        const transaction = this.db.transaction([this.conversationsStore, this.analyticsStore, this.memoryStore], 'readonly');

        const countStore = (storeName: string): Promise<number> => {
            return new Promise((resolve) => {
                const store = transaction.objectStore(storeName);
                const request = store.count();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => resolve(0);
            });
        };

        stats.conversations = await countStore(this.conversationsStore);
        stats.analytics = await countStore(this.analyticsStore);
        stats.memory = await countStore(this.memoryStore);
        stats.totalEntries = stats.conversations + stats.analytics + stats.memory;

        return stats;
    }
}

// Export singleton instance
export const indexedDBStorage = new IndexedDBStorage();
