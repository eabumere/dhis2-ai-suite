/**
 * Unified Conversation Context System for DHIS2 AI Suite
 *
 * Manages conversation history, data context, and analytics memory across all agents.
 * Enables follow-up questions with full conversation awareness.
 */

export interface ConversationEntry {
    id: string;
    timestamp: number;
    query: string;
    agent: 'search' | 'crud' | 'analytics' | 'router';
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
}

/**
 * Conversation Context Manager
 * Handles conversation history, data context, and memory management
 */
export class ConversationContextManager {
    private memory: ConversationMemory;
    private storageKey = 'dhis2_conversation_context';

    constructor() {
        this.memory = {
            conversations: [],
            dataContexts: new Map(),
            activeTopics: []
        };
        this.loadFromStorage();
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

        // Persist to storage
        this.saveToStorage();

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
        // Extract topic from query and response
        const lowerQuery = query.toLowerCase();

        if (lowerQuery.includes('hiv') || lowerQuery.includes('aids')) return 'HIV/AIDS';
        if (lowerQuery.includes('malaria')) return 'Malaria';
        if (lowerQuery.includes('tb') || lowerQuery.includes('tuberculosis')) return 'Tuberculosis';
        if (lowerQuery.includes('vaccin')) return 'Vaccination';
        if (lowerQuery.includes('immunization')) return 'Immunization';
        if (lowerQuery.includes('maternal') || lowerQuery.includes('pregnan')) return 'Maternal Health';
        if (lowerQuery.includes('child') || lowerQuery.includes('infant')) return 'Child Health';
        if (lowerQuery.includes('reporting')) return 'Reporting Systems';

        // Try to extract from response if it's an analytics response
        if (response && response.originalIndicators) {
            return `Analytics: ${response.originalIndicators.join(', ')}`;
        }

        return undefined;
    }

    private isContextRelevantToQuery(context: DataContext, query: string): boolean {
        const lowerQuery = query.toLowerCase();

        // Check if query mentions "previous", "last", "that data", etc.
        if (lowerQuery.includes('previous') || lowerQuery.includes('last') ||
            lowerQuery.includes('that data') || lowerQuery.includes('this data')) {
            return true;
        }

        // Check topic relevance
        if (context.metadata?.indicators) {
            const hasIndicatorMatch = context.metadata.indicators.some(ind =>
                lowerQuery.includes(ind.toLowerCase())
            );
            if (hasIndicatorMatch) return true;
        }

        // Check if query is analytical and we have analytics context
        if (context.type === 'analytics' && (
            lowerQuery.includes('analyze') || lowerQuery.includes('show') ||
            lowerQuery.includes('calculate') || lowerQuery.includes('compare')
        )) {
            return true;
        }

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
        if (!response) return "Empty response";

        let summary = "";

        if (response.chart_id) {
            summary += `Analytics chart '${response.title || 'Unnamed'}'`;
        }

        if (response.originalIndicators) {
            summary += ` showing ${response.originalIndicators.join(', ')}`;
        }

        if (response.originalPeriods) {
            summary += ` for period(s) ${response.originalPeriods.join(', ')}`;
        }

        if (response.originalOrgUnits) {
            summary += ` in ${response.originalOrgUnits.join(', ')}`;
        }

        if (response.count !== undefined) {
            summary += ` (${response.count} records)`;
        }

        return summary || "Analytics data";
    }

    private summarizeSearchResponse(response: any): string {
        if (!response || !response.results) return "Search results";

        const types = Object.keys(response.results);
        const totalCount = Object.values(response.results).reduce((sum: number, items: any) =>
            sum + (Array.isArray(items) ? items.length : 0), 0
        );

        return `Search results: ${totalCount} items found (${types.join(', ')})`;
    }

    private summarizeMutationResponse(type: 'creation' | 'update', response: any): string {
        if (!response) return `${type} operation result`;

        const action = type === 'creation' ? 'Created' : 'Updated';

        if (response.data?.name) {
            return `${action} ${response.data.name} (${response.data.id})`;
        }

        return `${action} resource successfully`;
    }

    private getLastConversation(): ConversationEntry | undefined {
        return this.memory.conversations[this.memory.conversations.length - 1];
    }

    private saveToStorage(): void {
        try {
            // Convert Map to plain object for storage
            const storageData = this.exportConversation();
            localStorage.setItem(this.storageKey, JSON.stringify(storageData));
        } catch (error) {
            console.warn('Failed to save conversation context to storage:', error);
        }
    }

    private loadFromStorage(): void {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const parsedData = JSON.parse(stored);
                this.importConversation(parsedData);
            }
        } catch (error) {
            console.warn('Failed to load conversation context from storage:', error);
        }
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
