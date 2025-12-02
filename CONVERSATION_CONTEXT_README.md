# Unified Conversation Context System for DHIS2 AI Suite

## Overview

This system provides a unified approach for conversation awareness across the entire DHIS2 AI Suite, enabling natural follow-up questions and seamless data-driven discussions.

## Key Features

### 🔄 **Conversation Awareness**
- LLM remembers all previous discussions and operations
- Intelligent routing based on conversation context
- Automatic detection of follow-up question intent

### 📊 **Analytics Data Integration**
- Analytics response data becomes part of the discussion context
- Charts and visualization data are stored and referenceable
- Support for follow-up queries like "filter that chart by gender"

### 🗣️ **Natural Language References**
- References like "previous data", "last search", "that chart", "these results"
- Topic tracking across conversation (HIV/AIDS, Malaria, Vaccination, etc.)
- Active topic maintenance for contextual relevance

### 💾 **Persistent Conversations**
- LocalStorage persistence for conversation continuity
- Automatic cleanup of old conversations
- Export/import functionality for conversation management

### 🔀 **Unified Agent Routing**
- Single router agent handles all follow-up questions
- Context-aware intent analysis
- Seamless experience across search, CRUD, and analytics operations

## Architecture

### Core Components

1. **`ConversationContextManager`** (`src/utils/conversation-context.ts`)
   - Main conversation memory and management
   - Data context storage and retrieval
   - Topic extraction and active topic tracking

2. **`contextRouterAgent`** (`src/agents/router-agent.ts`)
   - Context-aware routing with conversation prompts
   - Automatic conversation context addition
   - Smart routing based on conversation history

3. **Enhanced State Management** (`src/utils/state.ts`)
   - Conversation state annotations
   - Data context integration
   - Active topic tracking

### Data Flow

```
User Query → ContextRouterAgent → Specialized Agent → Response
     ↓              ↓                      ↓               ↓
Conversation ← Context Manager ← Data Context ← Analytics/Search/CRUD
     ↑              ↑                      ↑               ↑
Follow-up ────── Context ──────────────── Result ──────── LLM
```

## Usage Examples

### Analytics Follow-ups
```typescript
// Primary query
User: "Show me HIV testing data for the last 12 months"
System: [Queries analytics, creates chart, stores in context]

// Follow-up with context awareness
User: "Filter that chart by age group"
System: [Understands "that chart" refers to previous analytic result]

// Another follow-up
User: "Show trends in the data we just discussed"
System: [Knows about previous analytics context]
```

### Search Context Awareness
```typescript
// Primary search
User: "Find all data elements with HIV"
System: [Searches and stores results]

// Follow-up referencing search
User: "Show me more details about that first result"
System: [Knows about previous search results]
```

### CRUD Context Tracking
```typescript
// Creation operation
User: "Create a new data element for vaccination status"
System: [Creates resource, stores in context]

// Follow-up referencing creation
User: "Update that data element I just created"
System: [Knows about recently created resource]
```

## Conversation Context Types

### `DataContext` Types
- **`analytics`**: Analytics responses with chart data and metadata
- **`search`**: Search results and finding metadata
- **`creation`**: Newly created DHIS2 resources
- **`update`**: Modified DHIS2 resources

### Context Metadata
- **indicators**: List of indicator IDs in analytics context
- **periods**: Time periods covered in analytics
- **orgUnits**: Organization units in analytics data
- **chartId**: Reference to generated chart
- **count**: Number of results/items

## API Reference

### `ConversationContextManager`

```typescript
import { conversationContext } from './utils/conversation-context';

// Add conversation entry
conversationContext.addConversation(query, agent, response, dataContext);

// Get relevant context for a query
const context = conversationContext.findRelevantContext(query);
console.log(context.recentConversations);
console.log(context.lastAnalyticsData);

// Create data contexts
const analyticsContext = conversationContext.createAnalyticsDataContext(response);
const searchContext = conversationContext.createSearchDataContext(response);
```

### Conversation Router Agent

```typescript
import { contextRouterAgent } from './agents/router-agent';

// Use for all queries (primary and follow-up)
const result = await contextRouterAgent.invoke({
    messages: [{ role: 'user', content: userQuery }]
});
```

## Configuration

### Prompt Enhancement
All routing tools are enhanced with conversation context:

- **Recent conversations**: Last 5-8 conversation entries
- **Active topics**: Current discussion topics
- **Analytics memory**: Previous analytics data and charts
- **Data contexts**: Available data for follow-up operations

### Memory Management
- **Conversation limit**: 50 entries (automatic cleanup)
- **Data context retention**: Analyzed data kept longer than search results
- **Topic tracking**: Top 5 active discussion topics maintained

## Benefits

✅ **Seamless User Experience**: One unified system for all conversation types
✅ **Intelligent Follow-ups**: LLM understands conversational references
✅ **Data-Driven Discussions**: Analytics data becomes part of conversation
✅ **Persistent Context**: Conversations survive page refreshes
✅ **Smart Routing**: Appropriate agent selection based on context
✅ **Scalable Architecture**: Easy to extend with new context types

## Future Enhancements

- **Multi-session conversations**: Import/export conversations across devices
- **Conversation threading**: Visual conversation flow tracking
- **Advanced context summarization**: LLM-generated conversation summaries
- **Collaborative conversations**: Share conversation context with team members
- **Conversation analytics**: Analyze conversation patterns and effectiveness

## Integration Notes

- **Backward Compatibility**: Original `routerAgent` still available
- **State Management**: New annotations integrated into existing state flow
- **Agent Prompts**: Context-aware but maintains existing functionality
- **Storage**: Automatic localStorage management with error handling

## Testing

The system supports natural follow-up conversations like:

- "Show me trends in those results"
- "Filter the chart by facility type"
- "Update the data element I created"
- "Find categories related to this data"
- "Analyze the same data but by gender"
