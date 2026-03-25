# 💬 Conversation Context System - Persistent Memory Management

## Overview

The Conversation Context System is the **memory and persistence layer** of the DHIS2 AI Suite, enabling intelligent follow-up conversations, context-aware responses, and seamless user experience across all agents. It maintains conversation history, data contexts, and session management to provide coherent, contextually aware interactions.

**File Location**: `src/utils/conversation-context.ts`

**Architecture**: Singleton context manager with LLM-powered analysis and local storage persistence

## 🏗️ Core Architecture

### Memory Structure

#### **ConversationEntry - Individual Conversation Records**
```typescript
interface ConversationEntry {
    id: string;
    timestamp: number;
    query: string;
    agent: 'search' | 'crud' | 'analytics' | 'router' | 'data_entry' | ...;
    response: any;
    dataContext?: DataContext;
    summary?: string;        // LLM-generated summary for future context
    discussionTopic?: string; // Extracted topic (e.g., "HIV/AIDS", "Malaria Control")
}
```

#### **DataContext - Structured Data Memory**
```typescript
interface DataContext {
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
```

#### **ConversationMemory - Complete Memory State**
```typescript
interface ConversationMemory {
    conversations: ConversationEntry[];
    dataContexts: Map<string, DataContext>;
    activeTopics: string[];
    lastAnalyticsQuery?: ConversationEntry;
    sessionId?: string;
    sessionStartTime?: number;
}
```

## 🔄 Core Functionality

### 1. Conversation Entry Management

#### **Adding Conversations**
```typescript
addConversation(query: string, agent: string, response: any, dataContext?: DataContext): ConversationEntry {
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

    // Update active topics and trim history
    this.updateActiveTopics(entry);
    this.trimConversationHistory(50);

    // Persist to storage
    this.saveToStorage();

    return entry;
}
```

#### **Conversation History Trimming**
```typescript
trimConversationHistory(maxEntries: number): void {
    if (this.memory.conversations.length > maxEntries) {
        const removedEntries = this.memory.conversations.splice(0, this.memory.conversations.length - maxEntries);

        // Clean up orphaned data contexts (keep recent ones)
        const oldestTimestamp = Math.min(...this.memory.conversations.map(c => c.timestamp));
        for (const [key, context] of this.memory.dataContexts.entries()) {
            if (context.type !== 'analytics' && context.data.timestamp < oldestTimestamp) {
                this.memory.dataContexts.delete(key);
            }
        }
    }
}
```

### 2. Context Retrieval and Relevance

#### **Finding Relevant Context**
```typescript
findRelevantContext(query: string): {
    recentConversations: ConversationEntry[];
    relevantDataContexts: DataContext[];
    lastAnalyticsData?: DataContext;
} {
    const recentConversations = this.getRecentContext(8);

    // Find data contexts relevant to query
    const relevantDataContexts = Array.from(this.memory.dataContexts.values())
        .filter(context => this.isContextRelevantToQuery(context, query));

    const lastAnalyticsData = this.memory.lastAnalyticsQuery?.dataContext;

    return { recentConversations, relevantDataContexts, lastAnalyticsData };
}
```

#### **Context Relevance Checking**
```typescript
isContextRelevantToQuery(context: DataContext, query: string): boolean {
    // Use LLM for semantic relevance checking
    const prompt = `Determine if this data context is relevant to the user's query.
Consider semantic meaning, not just exact keyword matches.

Data Context Summary: ${context.summary}
User Query: "${query}"

Return only "true" or "false".`;

    const result = await this.getCachedLLMResult('context_relevance', { context: context.summary, query }, prompt);
    return result === 'true';
}
```

### 3. Data Context Creation

#### **Analytics Data Context**
```typescript
createAnalyticsDataContext(response: any): DataContext {
    return {
        type: 'analytics',
        data: response,
        memoryId: this.generateMemoryId('analytics'),
        summary: this.summarizeAnalyticsResponse(response),
        metadata: {
            indicators: response.originalIndicators || [],
            periods: response.originalPeriods || [],
            orgUnits: response.originalOrgUnits || [],
            chartId: response.chart_id,
            count: response.count || Object.keys(response.data || {}).length
        }
    };
}
```

**Analytics Summary Format**: `type=analytics|chart=HIV Cases|indicators=HIV_PREV;HIV_INCIDENCE|periods=2023;2024|orgUnits=District A;District B|count=24`

#### **Search Data Context**
```typescript
createSearchDataContext(response: any): DataContext {
    const types = Object.keys(response.results || {});
    const totalCount = Object.values(response.results || {}).reduce((sum: number, items: any) =>
        sum + (Array.isArray(items) ? items.length : 0), 0
    );

    return {
        type: 'search',
        data: response,
        memoryId: this.generateMemoryId('search'),
        summary: `type=search|count=${totalCount}|categories=${types.join(';')}`
    };
}
```

#### **Mutation Data Context**
```typescript
createMutationDataContext(operationType: 'creation' | 'update', response: any): DataContext {
    const summary = response.data?.name
        ? `type=${operationType}|resource=${response.data.name}|id=${response.data.id}|status=success`
        : `type=${operationType}|status=success`;

    return {
        type: operationType,
        data: response,
        memoryId: this.generateMemoryId(operationType),
        summary
    };
}
```

### 4. Contextual Query Enhancement

#### **Generating Contextual Queries**
```typescript
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

    return { enhancedQuery, contextSummary, relevantDataAvailable };
}
```

### 5. Session Management

#### **Session Lifecycle**
```typescript
startNewSession(): string {
    const sessionId = this.generateId();
    const sessionStartTime = Date.now();

    console.log(`🔄 Starting new conversation session: ${sessionId}`);

    // Clear conversation history and set new session
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

getCurrentSession(): { sessionId?: string; sessionStartTime?: number; isActive: boolean } {
    return {
        sessionId: this.memory.sessionId,
        sessionStartTime: this.memory.sessionStartTime,
        isActive: !!this.memory.sessionId
    };
}
```

#### **Session-Aware Context Retrieval**
```typescript
findCurrentSessionContext(query: string): {
    recentConversations: ConversationEntry[];
    relevantDataContexts: DataContext[];
    lastAnalyticsData?: DataContext;
} {
    // Only return conversations and contexts from current session
    const currentSessionConversations = this.getCurrentSessionConversations();
    const recentConversations = currentSessionConversations.slice(-8);

    const relevantDataContexts = Array.from(this.memory.dataContexts.values())
        .filter(context => {
            const contextTime = context.data?.timestamp || context.data?.createdAt || 0;
            return this.memory.sessionStartTime && contextTime >= this.memory.sessionStartTime &&
                   this.isContextRelevantToQuery(context, query);
        });

    const lastAnalyticsData = currentSessionConversations
        .filter(entry => entry.agent === 'analytics' && entry.response?.success !== false)
        .pop()?.dataContext;

    return { recentConversations, relevantDataContexts, lastAnalyticsData };
}
```

## 🎯 LLM Integration

### 1. Intelligent Topic Extraction

#### **Discussion Topic Analysis**
```typescript
extractDiscussionTopic(query: string, response: any): string | undefined {
    const prompt = `Analyze this DHIS2 conversation and extract the main discussion topic.
Return a concise topic name (max 3 words) that captures what this conversation is about.

Query: "${query}"
Response type: ${response?.type || 'unknown'}

Examples: "HIV/AIDS", "Malaria Control", "Vaccination Programs", "Data Analysis"
Return only the topic name or "general" if no specific topic.`;

    const result = await this.getCachedLLMResult('topic_extraction', { query, response }, prompt);
    return result && result !== 'general' ? result : undefined;
}
```

#### **Active Topic Tracking**
```typescript
updateActiveTopics(entry: ConversationEntry): void {
    if (entry.discussionTopic) {
        this.memory.activeTopics = [
            entry.discussionTopic,
            ...this.memory.activeTopics.filter(t => t !== entry.discussionTopic)
        ].slice(0, 5); // Keep top 5 active topics
    }
}
```

### 2. Semantic Context Relevance

#### **Context Matching Algorithm**
- **Semantic Analysis**: Uses LLM to understand query intent vs context meaning
- **Not Keyword Matching**: "HIV testing trends" matches "HIV/AIDS" topic even without exact keywords
- **Caching**: Results cached for 30 minutes to improve performance

#### **Relevance Scoring**
```typescript
// Example relevance matches:
Context: "type=analytics|indicators=HIV_PREV;HIV_INCIDENCE"
Query: "What about malaria instead?"
→ Result: false (different diseases)

Context: "type=analytics|indicators=HIV_PREV;HIV_INCIDENCE"
Query: "Show me the rates over time"
→ Result: true (same HIV context, different time aspect)
```

### 3. LLM Caching System

#### **Intelligent Caching**
```typescript
private llmCache = new Map<string, { result: any; timestamp: number; ttl: number }>();
private cacheTTL = 30 * 60 * 1000; // 30 minutes

getCachedLLMResult(cacheKey: string, input: any, prompt: string): Promise<any> {
    const inputHash = this.hashInput(input);
    const cached = this.llmCache.get(`${cacheKey}_${inputHash}`);

    if (cached && (Date.now() - cached.timestamp) < cached.ttl) {
        return cached.result;
    }

    // Make LLM call and cache result
    const result = await this.llmModel.invoke([{ role: 'user', content: prompt }];
    this.llmCache.set(`${cacheKey}_${inputHash}`, {
        result,
        timestamp: Date.now(),
        ttl: this.cacheTTL
    });

    return result;
}
```

## 💾 Persistence and Storage

### 1. Local Storage Integration

#### **Storage Format Conversion**
```typescript
saveToStorage(): void {
    try {
        // Convert Map to plain object for storage
        const storageData = this.exportConversation();
        localStorage.setItem(this.storageKey, JSON.stringify(storageData));
    } catch (error) {
        console.warn('Failed to save conversation context to storage:', error);
    }
}

loadFromStorage(): void {
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
```

#### **Export/Import Functionality**
```typescript
exportConversation(): ConversationMemoryExport {
    return {
        ...this.memory,
        dataContexts: Object.fromEntries(this.memory.dataContexts.entries())
    };
}

importConversation(savedMemory: ConversationMemoryExport): void {
    this.memory = {
        ...savedMemory,
        dataContexts: new Map(Object.entries(savedMemory.dataContexts || {}))
    };
}
```

### 2. Memory Limits and Cleanup

#### **Automatic Cleanup**
- **Conversation History**: Limited to 50 most recent entries
- **Data Contexts**: Older contexts cleaned up when conversations are trimmed
- **Cache Cleanup**: Expired LLM results automatically removed
- **Session Isolation**: Each session maintains separate conversation history

## 🔄 Integration with Agents

### 1. Router Agent Integration

#### **Follow-up Detection**
```typescript
// Router uses context to detect follow-up queries
const context = findRelevantContext(query);
if (context.lastAnalyticsData) {
    return { intent: 'followup_analytics', context: context.lastAnalyticsData };
}
```

### 2. Analytics Agent Integration

#### **Context-Aware Queries**
```typescript
// Analytics agent enhances queries with context
const contextualQuery = generateContextualQuery(originalQuery, followUpQuery);
// Result: "Regarding the previous analytics data (HIV cases by district): show trends"
```

### 3. Search Agent Integration

#### **Conversation History**
```typescript
// Search agent uses recent conversations for better understanding
const recentContext = getRecentContext(5);
// Provides context about what user has been searching for
```

## 🎯 Usage Examples

### Complete Conversation Flow
```
User: "Show me HIV testing data for 2024"
→ Router: analytics → Analytics Agent → Chart generated
→ Context: "type=analytics|indicators=HIV_TESTS|periods=2024"

User: "What about malaria instead?"
→ Router: Uses context relevance → Detects different topic → New analytics
→ Context: "type=analytics|indicators=MALARIA_TESTS|periods=2024"

User: "Show me trends over time"
→ Router: Uses context relevance → Detects same HIV topic → Follow-up analytics
→ Enhanced Query: "Regarding previous HIV testing data: show trends over time"
```

### Session Management
```
User: Starts new session
→ Context: startNewSession() → Clear history, new sessionId

User: Multiple queries in session
→ Context: All stored under same sessionId

User: "New chat" button clicked
→ Context: startNewSession() → Fresh conversation history
```

### Data Context Usage
```
Analytics Response: { chart_id: "hiv_chart", originalIndicators: ["HIV_PREV"] }
→ Data Context: {
    type: "analytics",
    summary: "type=analytics|chart=HIV Cases|indicators=HIV_PREV",
    metadata: { indicators: ["HIV_PREV"], chartId: "hiv_chart" }
  }

Follow-up: "What about incidence?"
→ Context Relevance: Checks if HIV_PREV context relevant to incidence query
→ Result: true → Enhanced query with HIV context
```

## 🔍 Debugging & Monitoring

### Key Logging Points
- Session start/end with IDs and timestamps
- Context relevance decisions with reasoning
- LLM cache hits/misses and performance
- Memory cleanup operations and entry counts
- Topic extraction results and active topic updates

### Common Issues
- **Session Confusion**: Multiple tabs/windows sharing same session
- **Context Loss**: Memory limits causing old context cleanup
- **Cache Staleness**: LLM results cached too long becoming outdated
- **Storage Corruption**: Invalid JSON in localStorage causing load failures

## 🚀 Extension Points

### Enhanced Context Types
- Add new DataContext types (reports, dashboards, user preferences)
- Implement cross-session context sharing
- Add context versioning for backward compatibility

### Advanced Relevance
- Implement machine learning-based relevance scoring
- Add user feedback for relevance accuracy
- Support multi-language context matching

### Performance Optimizations
- Implement Redis/external caching for LLM results
- Add context compression for memory efficiency
- Implement context prioritization and selective retention

---

The Conversation Context System serves as the intelligent memory layer that enables natural, contextually aware conversations across the entire DHIS2 AI Suite, maintaining coherence and understanding throughout complex multi-step workflows.
