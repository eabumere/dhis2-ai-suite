/**
 * Unified Conversation Context System for DHIS2 AI Suite
 *
 * Manages conversation history, data context, and analytics memory across all agents.
 * Enables follow-up questions with full conversation awareness.
 */

import { ChatModels } from './chat-model-factory';
import { indexedDBStorage } from './indexeddb-storage';

export interface ConversationEntry {
    id: string;
    timestamp: number;
    query: string;
    agent: 'search' | 'crud' | 'analytics' | 'router' | 'data_entry' | 'data_entry_aggregate' | 'data_entry_events' | 'data_entry_tracker';
    response: any;
    dataContext?: DataContext;
    summary?: string; // LLM-generated summary for future context
    discussionTopic?: string; // What the conversation was about
}

export interface DataContext {
    type: 'analytics' | 'search' | 'creation' | 'update';
    data: any;
    memoryId: string;
    summary: string;
    metadata?: {
        indicators?: string[];
        periods?: string[];
        orgUnits?: string[];
        chartId?: string;
        count?: number;
    };
}

export interface ConversationMemory {
    conversations: ConversationEntry[];
    dataContexts: Map<string, DataContext>;
    activeTopics: string[];
    lastAnalyticsQuery?: ConversationEntry;
    sessionId?: string; // Track which session this context belongs to
    sessionStartTime?: number; // When this session started
}

/**
 * Conversation Context Manager
 * Handles conversation history, data context, and memory management
 */
export class ConversationContextManager {
    private memory: ConversationMemory;
    private storageKey = 'dhis2_conversation_context';
    private llmModel: any;
    private llmCache = new Map<string, { result: any; timestamp: number; ttl: number }>();
    private cacheTTL = 30 * 60 * 1000; // 30 minutes cache TTL

    constructor() {
        this.memory = {
            conversations: [],
            dataContexts: new Map(),
            activeTopics: []
        };

        // Initialize LLM model for multilingual classification
        try {
            this.llmModel = ChatModels.createAgentModel();
        } catch (error) {
            console.warn('Failed to initialize LLM model for conversation context:', error);
            this.llmModel = null;
        }

        // Load from storage asynchronously (fire and forget for now)
        this.loadFromStorage().catch(error => {
            console.warn('Failed to load conversation context on initialization:', error);
        });
    }

    /**
     * Add a new conversation entry
     */
    addConversation(query: string, agent: ConversationEntry['agent'], response: any, dataContext?: DataContext): ConversationEntry {
        const entry: ConversationEntry = {
            id: this.generateId(),
            timestamp: Date.now(),
            query,
            agent,
            response,
            dataContext,
            discussionTopic: this.extractDiscussionTopic(query, response)
        };

        this.memory.conversations.push(entry);

        // Add data context if provided
        if (dataContext) {
            this.memory.dataContexts.set(dataContext.memoryId, dataContext);
        }

        // Update active topics
        this.updateActiveTopics(entry);

        // Track last analytics query for easy reference
        if (agent === 'analytics' && response.success !== false) {
            this.memory.lastAnalyticsQuery = entry;
        }

        // Keep conversation history within limits
        this.trimConversationHistory(50); // Keep last 50 entries

        // Persist conversation entry to IndexedDB
        this.saveConversationEntry(entry);

        // Save updated memory context
        this.saveMemoryToStorage();

        return entry;
    }

    /**
     * Get recent conversation context for LLM prompts
     */
    getRecentContext(limit: number = 10): ConversationEntry[] {
        return this.memory.conversations.slice(-limit);
    }

    /**
     * Find relevant context for a new query
     */
    findRelevantContext(query: string): {
        recentConversations: ConversationEntry[];
        relevantDataContexts: DataContext[];
        lastAnalyticsData?: DataContext;
    } {
        const recentConversations = this.getRecentContext(8);

        // Find data contexts that might be relevant to this query
        const relevantDataContexts = Array.from(this.memory.dataContexts.values()).filter(context =>
            this.isContextRelevantToQuery(context, query)
        );

        const lastAnalyticsData = this.memory.lastAnalyticsQuery?.dataContext;

        return {
            recentConversations,
            relevantDataContexts,
            lastAnalyticsData
        };
    }

    /**
     * Get specific data context by memory ID
     */
    getDataContext(memoryId: string): DataContext | undefined {
        return this.memory.dataContexts.get(memoryId);
    }

    /**
     * Generate analytics data context
     */
    createAnalyticsDataContext(response: any): DataContext {
        const dataContext: DataContext = {
            type: 'analytics',
            data: response,
            memoryId: this.generateMemoryId('analytics'),
            summary: this.summarizeAnalyticsResponse(response),
            metadata: {
                indicators: response.originalIndicators || [],
                periods: response.originalPeriods || [],
                orgUnits: response.originalOrgUnits || [],
                chartId: response.chart_id,
                count: response.count || (response.data ? Object.keys(response.data).length : 0)
            }
        };

        return dataContext;
    }

    /**
     * Generate search results context
     */
    createSearchDataContext(response: any): DataContext {
        const dataContext: DataContext = {
            type: 'search',
            data: response,
            memoryId: this.generateMemoryId('search'),
            summary: this.summarizeSearchResponse(response),
            metadata: {
                count: response.count
            }
        };

        return dataContext;
    }

    /**
     * Create creation/update context
     */
    createMutationDataContext(operationType: 'creation' | 'update', response: any): DataContext {
        const dataContext: DataContext = {
            type: operationType,
            data: response,
            memoryId: this.generateMemoryId(operationType),
            summary: this.summarizeMutationResponse(operationType, response)
        };

        return dataContext;
    }

    /**
     * Generate follow-up question with context awareness
     */
    generateContextualQuery(originalQuery: string, followUpQuery: string): {
        enhancedQuery: string;
        contextSummary: string;
        relevantDataAvailable: boolean;
    } {
        const context = this.findRelevantContext(followUpQuery);
        const lastEntry = this.getLastConversation();

        let enhancedQuery = followUpQuery;
        let contextSummary = '';
        let relevantDataAvailable = false;

        // Add context references if data is available
        if (context.lastAnalyticsData) {
            enhancedQuery = `Regarding the previous analytics data (${context.lastAnalyticsData.summary}): ${followUpQuery}`;
            contextSummary = `Previous analytic data available: ${context.lastAnalyticsData.summary}`;
            relevantDataAvailable = true;
        } else if (context.relevantDataContexts.length > 0) {
            const latestContext = context.relevantDataContexts[context.relevantDataContexts.length - 1];
            enhancedQuery = `Building on previous context (${latestContext.summary}): ${followUpQuery}`;
            contextSummary = `Previous context: ${latestContext.summary}`;
            relevantDataAvailable = true;
        } else if (lastEntry && lastEntry.discussionTopic) {
            enhancedQuery = `Continuing discussion about ${lastEntry.discussionTopic}: ${followUpQuery}`;
            contextSummary = `Previous discussion topic: ${lastEntry.discussionTopic}`;
        }

        return {
            enhancedQuery,
            contextSummary,
            relevantDataAvailable
        };
    }

    /**
     * Start a new session - clear conversation history and set new session ID
     */
    async startNewSession(): Promise<string> {
        const sessionId = this.generateId();
        const sessionStartTime = Date.now();

        console.log(`🔄 Starting new conversation session: ${sessionId}`);

        // Clear old session's analytics data from IndexedDB
        try {
            await indexedDBStorage.clearAllAnalytics();
            console.log('🗑️ Cleared previous session analytics data from IndexedDB');
        } catch (error) {
            console.warn('Failed to clear analytics data:', error);
        }

        // Clear old conversations from IndexedDB to prevent bleeding across sessions
        try {
            await indexedDBStorage.clearAllConversations();
            console.log('🗑️ Cleared previous session conversations from IndexedDB');
        } catch (error) {
            console.warn('Failed to clear conversations:', error);
        }

        // Clear old memory/conversation context from IndexedDB
        try {
            await indexedDBStorage.clearMemory(this.storageKey);
            console.log('🗑️ Cleared previous session memory from IndexedDB');
        } catch (error) {
            console.warn('Failed to clear memory:', error);
        }

        this.memory = {
            conversations: [],
            dataContexts: new Map(),
            activeTopics: [],
            sessionId,
            sessionStartTime
        };
        this.saveToStorage();

        return sessionId;
    }

    /**
     * Get current session information
     */
    getCurrentSession(): { sessionId?: string; sessionStartTime?: number; isActive: boolean } {
        return {
            sessionId: this.memory.sessionId,
            sessionStartTime: this.memory.sessionStartTime,
            isActive: !!this.memory.sessionId
        };
    }

    /**
     * Check if conversation belongs to current session
     */
    isCurrentSessionConversation(entry: ConversationEntry): boolean {
        // If no session ID is set, consider all conversations current (backward compatibility)
        if (!this.memory.sessionId) return true;

        // Check if entry was created after session start
        return !this.memory.sessionStartTime || entry.timestamp >= this.memory.sessionStartTime;
    }

    /**
     * Get conversations only from current session
     */
    getCurrentSessionConversations(): ConversationEntry[] {
        return this.memory.conversations.filter(entry => this.isCurrentSessionConversation(entry));
    }

    /**
     * Find relevant context for current session only
     */
    findCurrentSessionContext(query: string): {
        recentConversations: ConversationEntry[];
        relevantDataContexts: DataContext[];
        lastAnalyticsData?: DataContext;
    } {
        const currentSessionConversations = this.getCurrentSessionConversations();
        const recentConversations = currentSessionConversations.slice(-8); // Last 8 from current session

        // Find data contexts that might be relevant to this query (from current session only)
        const relevantDataContexts = Array.from(this.memory.dataContexts.values()).filter(context => {
            // Only include contexts created during current session
            const contextTime = context.data?.timestamp || context.data?.createdAt || 0;
            return this.memory.sessionStartTime && contextTime >= this.memory.sessionStartTime && this.isContextRelevantToQuery(context, query);
        });

        // Find last analytics query from current session
        const lastAnalyticsQuery = currentSessionConversations
            .filter(entry => entry.agent === 'analytics' && entry.response?.success !== false)
            .pop();

        const lastAnalyticsData = lastAnalyticsQuery?.dataContext;

        return {
            recentConversations,
            relevantDataContexts,
            lastAnalyticsData
        };
    }

    /**
     * Clear conversation history
     */
    clearHistory(): void {
        this.memory = {
            conversations: [],
            dataContexts: new Map(),
            activeTopics: []
        };
        this.saveToStorage();
    }

    /**
     * Export conversation for analysis/persistence
     */
    exportConversation(): Omit<ConversationMemory, 'dataContexts'> & { dataContexts: { [key: string]: DataContext } } {
        // Return a copy with Map converted to plain object for JSON serialization
        return {
            ...this.memory,
            dataContexts: Object.fromEntries(this.memory.dataContexts.entries())
        };
    }

    /**
     * Import conversation from export
     */
    importConversation(savedMemory: Omit<ConversationMemory, 'dataContexts'> & { dataContexts: { [key: string]: DataContext } }): void {
        this.memory = {
            ...savedMemory,
            dataContexts: new Map(Object.entries(savedMemory.dataContexts || {}))
        };
        this.saveToStorage();
    }

    // Private helper methods

    private generateId(): string {
        return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private generateMemoryId(type: string): string {
        return `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private extractDiscussionTopic(query: string, response: any): string | undefined {
        // Try LLM-based extraction (synchronous with caching)
        if (this.llmModel) {
            try {
                const llmResult = this.extractDiscussionTopicLLMSync(query, response);
                if (llmResult) return llmResult;
            } catch (error) {
                console.warn('LLM topic extraction failed:', error);
            }
        }

        // No fallback - return undefined if LLM unavailable
        return undefined;
    }

    private isContextRelevantToQuery(context: DataContext, query: string): boolean {
        // Try LLM-based relevance checking (synchronous with caching)
        if (this.llmModel) {
            try {
                const llmResult = this.isContextRelevantToQueryLLMSync(context, query);
                if (llmResult !== undefined) return llmResult;
            } catch (error) {
                console.warn('LLM context relevance check failed:', error);
            }
        }

        // No fallback - return false if LLM unavailable or no cached result
        return false;
    }

    private updateActiveTopics(entry: ConversationEntry): void {
        if (entry.discussionTopic) {
            this.memory.activeTopics = [
                entry.discussionTopic,
                ...this.memory.activeTopics.filter(t => t !== entry.discussionTopic)
            ].slice(0, 5); // Keep top 5 active topics
        }
    }

    private trimConversationHistory(maxEntries: number): void {
        if (this.memory.conversations.length > maxEntries) {
            const removedEntries = this.memory.conversations.splice(0, this.memory.conversations.length - maxEntries);

            // Clean up orphaned data contexts (optional - can be kept for longer)
            const keepRecentContexts = Math.floor(maxEntries / 2);
            if (removedEntries.length > keepRecentContexts) {
                // Remove data contexts older than what we keep in conversations
                const oldestTimestamp = Math.min(...this.memory.conversations.map(c => c.timestamp));
                for (const [key, context] of this.memory.dataContexts.entries()) {
                    if (context.type !== 'analytics' && context.data.timestamp < oldestTimestamp) {
                        this.memory.dataContexts.delete(key);
                    }
                }
            }
        }
    }

    private summarizeAnalyticsResponse(response: any): string {
        if (!response) return "type=empty";

        const parts = ["type=analytics"];

        if (response.chart_id) {
            parts.push(`chart=${response.title || 'unnamed'}`);
        }

        if (response.originalIndicators && response.originalIndicators.length > 0) {
            parts.push(`indicators=${response.originalIndicators.join(';')}`);
        }

        if (response.originalPeriods && response.originalPeriods.length > 0) {
            parts.push(`periods=${response.originalPeriods.join(';')}`);
        }

        if (response.originalOrgUnits && response.originalOrgUnits.length > 0) {
            parts.push(`orgUnits=${response.originalOrgUnits.join(';')}`);
        }

        if (response.count !== undefined) {
            parts.push(`count=${response.count}`);
        }

        return parts.join('|');
    }

    private summarizeSearchResponse(response: any): string {
        if (!response || !response.results) return "type=search|status=empty";

        const types = Object.keys(response.results);
        const totalCount = Object.values(response.results).reduce((sum: number, items: any) =>
            sum + (Array.isArray(items) ? items.length : 0), 0
        );

        return `type=search|count=${totalCount}|categories=${types.join(';')}`;
    }

    private summarizeMutationResponse(type: 'creation' | 'update', response: any): string {
        if (!response) return `type=${type}|status=empty`;

        const parts = [`type=${type}`];

        if (response.data?.name) {
            parts.push(`resource=${response.data.name}`, `id=${response.data.id}`);
        }

        parts.push(`status=success`);

        return parts.join('|');
    }

    private getLastConversation(): ConversationEntry | undefined {
        return this.memory.conversations[this.memory.conversations.length - 1];
    }

    // LLM caching and classification methods

    /**
     * Get cached LLM result or fetch new one
     */
    private async getCachedLLMResult(cacheKey: string, input: any, prompt: string): Promise<any> {
        const inputHash = this.hashInput(input);

        // Check cache first
        const cached = this.llmCache.get(`${cacheKey}_${inputHash}`);
        if (cached && (Date.now() - cached.timestamp) < cached.ttl) {
            return cached.result;
        }

        // Not in cache or expired, make LLM call
        if (!this.llmModel) {
            console.warn('LLM model not available, using fallback for:', cacheKey);
            return this.getFallbackResult(cacheKey, input);
        }

        try {
            const result = await this.llmModel.invoke([{ role: 'user', content: prompt }]);
            const response = (result.content as string).trim();

            // Cache the result
            this.llmCache.set(`${cacheKey}_${inputHash}`, {
                result: response,
                timestamp: Date.now(),
                ttl: this.cacheTTL
            });

            // Clean up old cache entries periodically
            this.cleanCache();

            return response;
        } catch (error) {
            console.warn(`LLM call failed for ${cacheKey}, using fallback:`, error);
            return this.getFallbackResult(cacheKey, input);
        }
    }

    /**
     * Clean up expired cache entries
     */
    private cleanCache(): void {
        const now = Date.now();
        for (const [key, value] of this.llmCache.entries()) {
            if (now - value.timestamp > value.ttl) {
                this.llmCache.delete(key);
            }
        }
    }

    /**
     * Generate hash for input caching
     */
    private hashInput(input: any): string {
        const str = JSON.stringify(input);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(36);
    }

    /**
     * Default results when LLM is unavailable
     */
    private getFallbackResult(cacheKey: string, input: any): any {
        switch (cacheKey) {
            case 'topic_extraction':
                // No fallback - return undefined when LLM unavailable
                return undefined;

            case 'context_relevance':
                // No fallback - return false when LLM unavailable
                return 'false';

            default:
                return null;
        }
    }

    /**
     * Synchronous LLM-based topic extraction (with caching)
     */
    private extractDiscussionTopicLLMSync(query: string, response: any): string | undefined {
        // For synchronous context, we need to check cache synchronously
        const inputHash = this.hashInput({ query, response });
        const cacheKey = `topic_extraction_${inputHash}`;
        const cached = this.llmCache.get(cacheKey);

        if (cached && (Date.now() - cached.timestamp) < cached.ttl) {
            return cached.result && cached.result !== 'general' ? cached.result : undefined;
        }

        // If not in cache, use fallback for now (could trigger async LLM call in background)
        return undefined; // Let it fall back to keyword-based
    }

    /**
     * Synchronous LLM-based context relevance checking (with caching)
     */
    private isContextRelevantToQueryLLMSync(context: DataContext, query: string): boolean | undefined {
        // For synchronous context, we need to check cache synchronously
        const inputHash = this.hashInput({ context: context.summary, query });
        const cacheKey = `context_relevance_${inputHash}`;
        const cached = this.llmCache.get(cacheKey);

        if (cached && (Date.now() - cached.timestamp) < cached.ttl) {
            return cached.result === 'true';
        }

        // If not in cache, use fallback for now (could trigger async LLM call in background)
        return undefined; // Let it fall back to keyword-based
    }

    /**
     * LLM-based topic extraction
     */
    private async extractDiscussionTopicLLM(query: string, response: any): Promise<string | undefined> {
        const prompt = `Analyze this DHIS2 conversation and extract the main discussion topic.
Return a concise topic name (max 3 words) that captures what this conversation is about.

Query: "${query}"
Response type: ${response?.type || 'unknown'}

Examples: "HIV/AIDS", "Malaria Control", "Vaccination Programs", "Data Analysis"
Return only the topic name or "general" if no specific topic.`;

        const result = await this.getCachedLLMResult('topic_extraction', { query, response }, prompt);
        return result && result !== 'general' ? result : undefined;
    }

    /**
     * LLM-based context relevance checking
     */
    private async isContextRelevantToQueryLLM(context: DataContext, query: string): Promise<boolean> {
        const prompt = `Determine if this data context is relevant to the user's query.
Consider semantic meaning, not just exact keyword matches.

Data Context Summary: ${context.summary}
User Query: "${query}"

Return only "true" or "false".`;

        const result = await this.getCachedLLMResult('context_relevance', { context: context.summary, query }, prompt);
        return result === 'true';
    }



    /**
     * Save a conversation entry to IndexedDB
     */
    private async saveConversationEntry(entry: ConversationEntry): Promise<void> {
        try {
            await indexedDBStorage.saveConversation(entry);
        } catch (error) {
            console.warn('Failed to save conversation entry to IndexedDB:', error);
        }
    }

    /**
     * Save conversation memory to IndexedDB
     */
    private async saveMemoryToStorage(): Promise<void> {
        try {
            await indexedDBStorage.saveMemory(this.storageKey, this.memory);
        } catch (error) {
            console.warn('Failed to save conversation memory to IndexedDB:', error);
        }
    }

    /**
     * Load conversation memory from IndexedDB
     */
    private async loadMemoryFromStorage(): Promise<void> {
        try {
            const loadedMemory = await indexedDBStorage.loadMemory(this.storageKey);
            if (loadedMemory) {
                this.memory = loadedMemory;
                console.log('📚 Loaded conversation memory from IndexedDB');
            }

            // Also load recent conversations
            const recentConversations = await indexedDBStorage.loadConversations(50);
            if (recentConversations.length > 0) {
                this.memory.conversations = recentConversations;
                console.log(`📚 Loaded ${recentConversations.length} conversations from IndexedDB`);
            }
        } catch (error) {
            console.warn('Failed to load conversation context from IndexedDB:', error);
        }
    }

    private saveToStorage(): void {
        // For backward compatibility, still save to IndexedDB
        this.saveMemoryToStorage();
    }

    private async loadFromStorage(): Promise<void> {
        // Load from IndexedDB asynchronously
        await this.loadMemoryFromStorage();
    }
}

// Global singleton instance
export const conversationContext = new ConversationContextManager();

// Export convenience functions
export const addConversation = (
    query: string,
    agent: ConversationEntry['agent'],
    response: any,
    dataContext?: DataContext
) => conversationContext.addConversation(query, agent, response, dataContext);

export const getRecentContext = (limit?: number) => conversationContext.getRecentContext(limit);

export const findRelevantContext = (query: string) => conversationContext.findRelevantContext(query);

export const createAnalyticsDataContext = (response: any) => conversationContext.createAnalyticsDataContext(response);

export const createSearchDataContext = (response: any) => conversationContext.createSearchDataContext(response);

export const createMutationDataContext = (operationType: 'creation' | 'update', response: any) =>
    conversationContext.createMutationDataContext(operationType, response);

export const generateContextualQuery = (originalQuery: string, followUpQuery: string) =>
    conversationContext.generateContextualQuery(originalQuery, followUpQuery);

// Session management functions
export const startNewSession = () => conversationContext.startNewSession();
export const getCurrentSession = () => conversationContext.getCurrentSession();
export const getCurrentSessionConversations = () => conversationContext.getCurrentSessionConversations();
export const findCurrentSessionContext = (query: string) => conversationContext.findCurrentSessionContext(query);
