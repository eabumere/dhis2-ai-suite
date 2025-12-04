# DHIS2 AI Suite Documentation

## Overview

The DHIS2 AI Suite provides an intelligent conversational interface for managing DHIS2 health information systems metadata and analytics. This documentation covers the key features and capabilities.

## 📋 **Table of Contents**

1. [Unified Conversation Context System](#conversation-context)
2. [External Search API Integration](#external-search)
3. [Installation and Configuration](#installation)
4. [Usage Examples](#usage-examples)
5. [API Reference](#api-reference)

<a id="conversation-context"></a>
# Unified Conversation Context System

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

<a id="external-search"></a>
# External Search API Integration

## Overview

The DHIS2 AI Suite now supports integration with external search APIs to improve search performance and provide more relevant results before falling back to DHIS2's native search capabilities.

## Key Features

### 🔍 **External Search First**
- Attempts external search API call before DHIS2 native search
- Configurable timeout with automatic fallback
- Intelligent result filtering by metadata type

### 📡 **API Integration**
- POST request to configured endpoint
- JSON body with `{ query: "search term", limit: 10 }`
- Optional bearer token authentication
- Comprehensive error handling

### 🔄 **Seamless Fallback**
- Automatic fallback to DHIS2 API if external search fails
- No disruption to existing functionality
- Graceful error handling and logging

## External API Specification

### Request Format
```http
POST https://your-search-api.example.com/search
Content-Type: application/json
Authorization: Bearer <optional-api-key>

{
  "query": "HIV testing",
  "limit": 10
}
```

### Response Format
```json
[
  {
    "content": "GEND_GBV - GEND_GBV: Individuals receiving post gender based violence (GBV) clinical care...",
    "metadata": {
      "item_id": "e1gILLJKU3w",
      "name": "GEND_GBV",
      "type": "dataElements"
    }
  },
  {
    "content": "HIV Testing Coverage - Percentage of population tested for HIV in facility",
    "metadata": {
      "item_id": "indicator123",
      "name": "HIV Testing Coverage",
      "type": "indicators"
    }
  }
]
```

### Response Processing
- **item_id**: Maps to DHIS2 metadata ID
- **name**: Used as both name and code fields
- **type**: Filtered by requested metadata type (dataElements, indicators, etc.)
- **content**: Used as display name for rich descriptions

## Configuration

### Environment Variables (.env)
```bash
# External Search API Configuration
EXTERNAL_SEARCH_URL=https://your-search-api.example.com/search
EXTERNAL_SEARCH_API_KEY=your-api-key-here
EXTERNAL_SEARCH_TIMEOUT=5000
```

### Fallback Behavior
1. **External API available**: Try POST call with timeout
2. **Success with matched results**: Return filtered, transformed results
3. **Success but no matches**: Fall back to DHIS2 search
4. **API error/timeout**: Fall back to DHIS2 search
5. **No external URL**: Skip directly to DHIS2 search

## Benefits

✅ **Improved Relevance**: External search can provide better-ranked results
✅ **Performance Gains**: Faster response times for cached/prefiltered data
✅ **Backward Compatible**: Existing DHIS2 search remains fully functional
✅ **Fault Tolerant**: Graceful degradation if external API unavailable

## Integration Examples

### Search Request Flow
1. User searches: "Find dataElements with HIV"
2. System calls: `POST /search { query: "HIV", limit: 10 }`
3. Receives results, filters by type: `dataElements`
4. Transforms to DHIS2 format: `{ id, name, code, displayName }`
5. Returns results or falls back to DHIS2 API

### Error Scenarios
- **Timeout**: "⚠️ External search timeout, using DHIS2 API"
- **HTTP Error**: "⚠️ External search failed, using DHIS2 API"
- **No Results**: "No external matches, using DHIS2 API"
- **Wrong Type**: Filter and return only matching types

## Implementation Details

### Core Functions
- `callExternalSearchApi()`: Makes POST request with timeout
- `filterExternalResultsByType()`: Filters by metadata type
- `transformExternalResults()`: Converts to DHIS2 format
- `searchDhis2Metadata()`: Main function with fallback logic

### Type Support
Currently supports all DHIS2 metadata types:
- dataElements, indicators, organisationUnits
- categories, categoryCombos, categoryOptions
- dataSets, programs, trackedEntityTypes, etc.

<a id="installation"></a>
# Installation and Configuration

## Prerequisites
- Node.js 18+
- Yarn or npm
- DHIS2 instance access

## Basic Setup
1. Clone repository
2. Install dependencies: `yarn install`
3. Configure environment variables in `.env`
4. Start development server: `yarn start`

## Environment Configuration
```bash
# DHIS2 Connection
DHIS2_API_BASE_URL=https://your-instance.dhis2.org/api
DHIS2_USERNAME=your-username
DHIS2_PASSWORD=your-password

# Azure OpenAI (for agent intelligence)
DHIS2_AZURE_KEY=your-key
DHIS2_AZURE_ENDPOINT=https://your-endpoint.openai.azure.com/
DHIS2_OPENAI_MODEL=gpt-4

# Optional: External Search API
EXTERNAL_SEARCH_URL=https://your-search-api.com/search
EXTERNAL_SEARCH_API_KEY=optional-key
EXTERNAL_SEARCH_TIMEOUT=5000
```

## Advanced Configuration
- Adjust conversation memory limits
- Configure tool timeouts
- Set up agent routing preferences

<a id="usage-examples"></a>
# Usage Examples

## Basic Queries
```
"Find all data elements with HIV"
"Create a new data element for vaccination status"
"How many people tested for HIV last month"
```

## Follow-up Queries (with context)
```
"Filter that chart by age group"
"Update the data element I just created"
"Show me more details about those results"
```

## Context-Aware Responses
- Remembers previous queries and results
- References "that chart", "these results", "last search"
- Maintains conversation state across refreshes

<a id="api-reference"></a>
# API Reference

## Core Components

### Unified Agent
```typescript
import { unifiedAgent } from './agents/unified-agent';
const result = await unifiedAgent.invoke({
  messages: [{ role: 'user', content: query }]
});
```

### Conversation Context
```typescript
import { conversationContext } from './utils/conversation-context';
conversationContext.addConversation(query, agent, response, context);
```

### Search Functions
```typescript
import { searchDhis2Metadata } from './utils/tools/metadata/helpers';
// Automatically uses external search if configured
const results = await searchDhis2Metadata('dataElements', 'HIV', 10);
```

## Configuration Options
- **External Search**: Configure via environment variables
- **Conversation Memory**: Adjust limits and retention
- **Agent Behavior**: Modify prompts and routing logic

## Troubleshooting
- Check browser console for error messages
- Verify environment variables are set correctly
- Ensure external APIs are accessible and properly configured
