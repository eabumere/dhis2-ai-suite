# 🔍 Search Agent - Intelligent Metadata Discovery

## Overview

The Search Agent is an intelligent metadata discovery system that uses LLM-powered tool selection to find DHIS2 resources based on natural language queries. Unlike other agents that follow rigid workflows, the Search Agent dynamically selects and executes the most relevant search tools based on user intent.

**File Location**: `src/agents/search-agent.ts`

**Architecture**: LangChain ReactAgent with 32 search and retrieval tools

## 🏗️ Core Architecture

### Agent Definition
```typescript
export const searchAgent = createReactAgent({
  llm: model,
  tools: [
    // 18 search tools (core + extended)
    // 14 get-by-ID tools
    // 2 specialized tools (data values, reference resolution)
  ],
  prompt: `You are a DHIS2 metadata search specialist with RECOVERY CAPABILITIES...`
});
```

### Tool Categories

#### 1. **Search Tools (18 tools)**
Find resources by name/criteria with case-insensitive partial matching:

- **Core Searches (7)**: Data Elements, Organisation Units, Categories, Data Sets, Programs, Indicators
- **Extended Searches (11)**: Category Options, OU Groups, Tracked Entity Types, Option Sets, Visualizations, Users, etc.

#### 2. **Get-by-ID Tools (14 tools)**
Direct retrieval by DHIS2 resource ID for validation and reference resolution.

#### 3. **Specialized Tools (2 tools)**
- `getDhis2DataValues`: Retrieve actual data values
- `resolveResourceReference`: Intelligent reference resolution

## 🎯 Intelligent Tool Selection

### LLM-Driven Search Strategy

The agent uses sophisticated LLM prompting to determine search scope:

#### **Specific Searches** (1-3 tools)
```
Query: "data elements about HIV"
→ Uses: searchDhis2DataElements
Result: {"dataElements": [...]}
```

#### **Broad Discovery Searches** (4-8 tools)
```
Query: "metadata about HIV"
→ Uses: dataElements + indicators + organisationUnits + optionSets + programs
Result: {"dataElements": [...], "indicators": [...], "organisationUnits": [...], ...}
```

### Search Execution Patterns

#### Single Tool Execution
```typescript
// User: "find clinics in Nairobi"
await searchAgent.invoke({
  messages: [{ role: 'user', content: 'find clinics in Nairobi' }]
});
// Agent calls: searchDhis2OrganisationUnits
// Returns: {"organisationUnits": [{"name": "Clinic A", "id": "abc123", ...}]}
```

#### Multi-Tool Execution
```typescript
// User: "find everything about malaria"
await searchAgent.invoke({
  messages: [{ role: 'user', content: 'find everything about malaria' }]
});
// Agent calls: 6-8 different search tools
// Returns: {"dataElements": [...], "indicators": [...], "organisationUnits": [...], ...}
```

## 🔄 Result Formatting

### Standard Result Format
All results follow consistent structure:

```typescript
{
  "metadataType": [
    {
      "name": "Resource Name",
      "id": "dhis2-id",
      "displayName": "Display Name (if different)"
    }
  ]
}
```

### Multi-Type Results
For broad searches, results are combined:

```typescript
{
  "dataElements": [...],
  "indicators": [...],
  "organisationUnits": [...],
  "optionSets": [...],
  "programs": [...]
}
```

## 🚨 Recovery Capabilities

### Intelligent Failure Handling

When searches fail or return inadequate results, the agent provides structured recovery guidance:

```typescript
{
  "recoveryNeeded": true,
  "failedStep": "search_execution|permission_check|query_parsing",
  "errorDetails": {
    "reason": "No results found|Permission denied|Query too restrictive",
    "originalQuery": "user's query",
    "attemptedSearches": ["tool1", "tool2"]
  },
  "recoveryOptions": [
    {
      "id": "broaden_search",
      "label": "Broaden search terms",
      "description": "Use more general keywords or remove specific filters",
      "action": "suggest_broader_query"
    },
    {
      "id": "check_permissions",
      "label": "Check permissions",
      "description": "Verify you have access to view this metadata type",
      "action": "suggest_permission_check"
    },
    {
      "id": "refine_query",
      "label": "Refine search query",
      "description": "Try different spelling or more specific terms",
      "action": "suggest_query_refinement"
    }
  ],
  "userGuidance": "Clear instructions for user on how to proceed"
}
```

### Recovery Scenarios

#### **No Results Found**
- **Cause**: Query too specific, typos, or resource doesn't exist
- **Recovery**: Suggest broader terms, check spelling, verify resource exists

#### **Permission Issues**
- **Cause**: User lacks access to view certain metadata types
- **Recovery**: Guide to check permissions or contact administrator

#### **Partial Results**
```typescript
{
  "dataElements": [...],  // Found some
  "indicators": [...],    // Found some
  "partialResults": true,
  "missingTypes": ["organisationUnits", "optionSets"],
  "recoveryOptions": [...]
}
```

## 🎯 Agent Prompt Architecture

### Core Strategy Guidelines

The agent prompt provides clear decision frameworks:

#### **Specific Searches**
- User mentions specific type → Use targeted tool
- "data elements about HIV" → `searchDhis2DataElements`
- "clinics in district" → `searchDhis2OrganisationUnits`

#### **Discovery Searches**
- Broad queries → Multiple tools for comprehensive discovery
- "everything about malaria" → Core + extended searches
- "HIV metadata" → Data elements + indicators + programs + option sets

#### **Result Formatting Rules**
- Single tool → `{"metadataType": [results]}`
- Multiple tools → Combined object with multiple keys
- Preserve exact tool result structure
- No wrapper text or success/error objects

## 🔄 Workflow Integration

### Router Agent Integration
```
User Query → Router (classifies as 'direct_search') → Search Agent → Result
```

### Orchestrator Integration
- **Conversation Context**: Search results stored for future reference
- **Result Rendering**: Specialized display for multi-type search results
- **Recovery Handling**: Recovery options presented as user choices

### Conversation Context Storage
```typescript
conversationContext.addConversation(query, 'search', result, dataContext);
```

## 📊 Performance Considerations

### Tool Selection Optimization
- **LLM Caching**: Avoid redundant tool selection decisions
- **Query Analysis**: Pre-analyze query complexity for tool selection
- **Batch Execution**: Execute multiple tools efficiently

### Result Processing
- **Streaming**: Handle large result sets without memory issues
- **Filtering**: Apply relevance scoring to prioritize results
- **Pagination**: Support for large result sets

### Error Recovery
- **Fallback Strategies**: Alternative search approaches when primary fails
- **Partial Success**: Return available results with guidance for missing data
- **User Guidance**: Clear instructions for query refinement

## 🎯 Usage Examples

### Specific Resource Search
```
Query: "find data elements about HIV testing"
Agent: Calls searchDhis2DataElements
Result: {"dataElements": [{"name": "HIV Test Result", "id": "abc123"}, ...]}
```

### Geographic Search
```
Query: "find all clinics"
Agent: Calls searchDhis2OrganisationUnits with facility filter
Result: {"organisationUnits": [{"name": "Central Clinic", "id": "def456"}, ...]}
```

### Comprehensive Discovery
```
Query: "find everything related to malaria program"
Agent: Calls 7+ tools (indicators, dataElements, dataSets, programs, etc.)
Result: {
  "indicators": [...],
  "dataElements": [...],
  "dataSets": [...],
  "programs": [...]
}
```

### Recovery Example
```
Query: "find nonexistent resource xyz"
Agent: Searches fail, returns recovery object
Result: {
  "recoveryNeeded": true,
  "recoveryOptions": [
    {"id": "broaden_search", "label": "Try broader search terms"},
    {"id": "check_spelling", "label": "Check spelling and try again"}
  ]
}
```

## 🔍 Debugging & Monitoring

### Key Logging Points
- Tool selection decisions with reasoning
- Search execution results and timing
- Recovery triggers and options provided
- Multi-tool coordination

### Common Issues
- **Over-selection**: Calling too many tools for simple queries
- **Under-selection**: Missing relevant tools for broad queries
- **Result Formatting**: Inconsistent structure between single/multi-tool results
- **Recovery Over-use**: Triggering recovery for valid no-results scenarios

## 🚀 Extension Points

### Adding New Search Tools
1. Create new search tool in `structured-tools.ts`
2. Add to appropriate tool category array
3. Update agent prompt with usage guidance
4. Test tool selection logic

### Enhancing Search Intelligence
- Improve LLM prompts for better tool selection
- Add query preprocessing for intent extraction
- Implement result ranking and relevance scoring
- Add cross-reference validation

### Custom Search Strategies
- Domain-specific search patterns (health, education, etc.)
- Multilingual search support
- Fuzzy matching for typos
- Semantic search capabilities

---

The Search Agent provides intelligent, context-aware metadata discovery with robust error handling and recovery capabilities, enabling users to efficiently find DHIS2 resources through natural language queries.
