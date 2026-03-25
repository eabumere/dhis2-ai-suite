# 🏗️ Metadata Agent - DHIS2 CRUD Operations

## Overview

The Metadata Agent is the core DHIS2 metadata management system, providing comprehensive Create, Read, Update, and Delete (CRUD) operations for all DHIS2 resource types. It serves as the primary interface for metadata manipulation in the DHIS2 AI Suite.

**File Location**: `src/agent.ts` (metadataAgent definition)

**Architecture**: LangChain ReactAgent with 75+ specialized DHIS2 tools

## 🏗️ Core Architecture

### Agent Definition
```typescript
export const metadataAgent = createReactAgent({
  llm: model,
  tools: [
    // 30+ creation tools
    // 28+ update tools
    // 15+ search tools
    // 8+ get-by-id tools
    // Specialized tools (data values, references)
  ],
  prompt: `You are an expert DHIS2 metadata management assistant...`
});
```

### Tool Categories

#### 1. Creation Tools (30+ tools)
- **Core Metadata**: Data Elements, Organisation Units, Categories, Data Sets, Indicators
- **Program Systems**: Programs, Tracked Entity Types, Program Stages, Rules
- **Advanced Features**: Dashboards, Visualizations, Users, Relationships
- **Supporting Objects**: Option Sets, Validation Rules, Reporting Forms

#### 2. Update Tools (28+ tools)
- Mirrors creation tools but for modification operations
- Uses `updates` object to specify changed fields only
- Maintains referential integrity

#### 3. Search Tools (15+ tools)
- **Core Searches**: Data Elements, Organisation Units, Categories, etc.
- **Extended Searches**: Users, Relationships, Visualizations
- Case-insensitive name-based searching
- Returns multiple matches for selection

#### 4. Get-by-ID Tools (8+ tools)
- Direct retrieval by DHIS2 resource ID
- Used for validation and reference resolution
- Returns complete resource objects

#### 5. Specialized Tools
- **getDhis2DataValues**: Retrieve actual data values
- **resolveResourceReference**: Intelligent reference resolution

## 🔧 Tool Architecture

### Tool Structure
Each tool follows a consistent pattern:

```typescript
// Tool Definition (in structured-tools.ts)
export const createDhis2DataElement = tool({
  name: "createDhis2DataElement",
  description: "Create a new DHIS2 data element with specified properties",
  schema: createDataElementSchema,
  execute: async (params) => {
    // Validation, API call, response formatting
  }
});
```

### Schema Validation
All tools use Zod schemas for parameter validation:
```typescript
const createDataElementSchema = z.object({
  name: z.string().min(1),
  valueType: z.enum(['NUMBER', 'TEXT', 'BOOLEAN', 'DATE']),
  domainType: z.enum(['AGGREGATE', 'TRACKER']),
  aggregationType: z.enum(['SUM', 'COUNT', 'AVERAGE']).optional(),
  // ... additional fields
});
```

### Error Handling
- **Validation Errors**: Zod schema validation with detailed messages
- **API Errors**: DHIS2-specific error handling and user-friendly messages
- **Dependency Errors**: Automatic resolution of resource dependencies

## 📋 Tool Catalog

### Creation Tools

#### Core Metadata (8 tools)
| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `createDhis2DataElement` | Measurable data points | name, valueType, domainType |
| `createDhis2OrganisationUnit` | Geographic/admin units | name, level, parent |
| `createDhis2Category` | Data disaggregation | name, dataDimension |
| `createDhis2CategoryCombo` | Category combinations | name, categories |
| `createDhis2DataSet` | Data collection forms | name, periodType, dataElements |
| `createDhis2Indicator` | Calculated metrics | name, numerator, denominator |
| `createDhis2ValidationRule` | Data quality checks | name, operator, expressions |
| `createDhis2OptionSet` | Choice lists | name, valueType, options |

#### Extended Metadata (15 tools)
| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `createDhis2CategoryOption` | Category values | name, category |
| `createDhis2OrganisationUnitGroup` | OU groupings | name, organisationUnits |
| `createDhis2Program` | Tracker/Event programs | name, programType |
| `createDhis2TrackedEntityType` | Entity definitions | name, trackedEntityAttributes |
| `createDhis2TrackedEntityAttribute` | Individual attributes | name, valueType |
| `createDhis2ProgramStage` | Workflow steps | name, program, dataElements |
| `createDhis2ProgramRule` | Business logic | name, condition, actions |
| `createDhis2ProgramIndicator` | Program calculations | name, expression |
| `createDhis2IndicatorType` | Calculation types | name, factor |
| `createDhis2Visualization` | Charts/reports | name, type, dataElements |
| `createDhis2Dashboard` | Report collections | name, dashboardItems |
| `createDhis2User` | System users | username, userRoles |
| `createDhis2RelationshipType` | Entity relationships | name, fromToName |
| `createDhis2Relationship` | Entity associations | relationshipType, from, to |
| `createDhis2TrackedEntityInstance` | Individual records | trackedEntityType, attributes |

### Update Tools

#### Core Updates (12 tools)
Mirror creation tools but use `updates` parameter:
```typescript
await updateDhis2DataElement.invoke({
  id: "dataElementId",
  updates: {
    name: "New Name",
    aggregationType: "COUNT"
  }
});
```

#### Advanced Updates (13 tools)
Include complex updates for programs, indicators, and visualizations.

### Search Tools

#### Core Searches (7 tools)
```typescript
// Returns multiple matches for user selection
const result = await searchDhis2DataElements.invoke({
  name: "HIV", // Case-insensitive partial match
  limit: 10
});
// Returns: { dataElements: [{ id, name, ... }] }
```

#### Extended Searches (10 tools)
Include specialized searches for users, relationships, visualizations.

### Get-by-ID Tools

#### Direct Retrieval (8 tools)
```typescript
const dataElement = await getDhis2DataElementById.invoke({
  id: "dataElementId"
});
// Returns complete resource object
```

## 🔄 Dependency Management

### Automatic Resolution
The agent automatically handles DHIS2 resource dependencies:

```typescript
// User request: "Create data element with category options"
await createDhis2DataElement.invoke({
  name: "HIV Tests",
  valueType: "NUMBER",
  // Agent automatically creates:
  // 1. Category "default" (if needed)
  // 2. CategoryOptions "male", "female" (if needed)
  // 3. CategoryCombo with the category
});
```

### Reference Resolution Tool
```typescript
const reference = await resolveResourceReference.invoke({
  reference: "the HIV data element I created earlier"
});
// Returns: { id: "abc123", name: "HIV Tests", type: "dataElements" }
```

## 🎯 Agent Prompt

The agent uses a comprehensive prompt covering:

### Core Capabilities
- All DHIS2 resource types and their schemas
- Creation, updating, searching, and retrieval operations
- Dependency management and automatic resolution

### Conversational Context
- Memory of previously created resources
- Reference resolution using phrases like "the last created", "that category"
- Context-aware operation suggestions

### Batch Operations
- Multiple resource creation in single API calls
- Atomic transactions with rollback on failure
- Dependency resolution across batch operations

### Error Handling
- Clear error messages with actionable recovery steps
- Validation error explanations
- Alternative approach suggestions

## 🔄 Workflow Integration

### Router Agent Integration
The Metadata Agent is invoked by the Router Agent for CRUD-classified queries:
```
User Query → Router (classifies as 'crud') → Metadata Agent → Result
```

### Orchestrator Integration
- Progress tracking during long-running operations
- Conversation context storage
- Error message formatting and display

### Conversation Context
All successful operations are stored for future reference:
```typescript
conversationContext.addConversation(query, 'metadata', result, dataContext);
```

## 📊 Performance Considerations

### API Optimization
- **Batch Operations**: Multiple resources created via single API calls
- **Efficient Queries**: Optimized search with pagination
- **Caching**: Resource reference caching

### Error Recovery
- **Retry Logic**: Automatic retries for transient failures
- **Graceful Degradation**: Fallback to individual operations if batch fails
- **Timeout Protection**: Configurable timeouts for long operations

### Memory Management
- **Streaming Results**: Large result sets handled efficiently
- **Reference Cleanup**: Proper cleanup of resolved references
- **Context Limits**: Bounded conversation history

## 🚨 Error Handling

### Validation Errors
```json
{
  "success": false,
  "error": "Invalid valueType. Must be one of: NUMBER, TEXT, BOOLEAN, DATE",
  "field": "valueType"
}
```

### API Errors
```json
{
  "success": false,
  "error": "DHIS2 API Error: Resource already exists",
  "dhis2Error": {
    "httpStatus": "Conflict",
    "httpStatusCode": 409,
    "message": "Data element with name 'HIV Tests' already exists"
  }
}
```

### Dependency Errors
```json
{
  "success": false,
  "error": "Missing dependency: CategoryCombo 'default' not found",
  "autoCreated": true,
  "resolution": "Dependency will be auto-created"
}
```

## 🔧 Key Functions

### Resource Creation
```typescript
async function createResource(resourceType: string, params: any) {
  // 1. Validate parameters against schema
  // 2. Resolve dependencies
  // 3. Generate DHIS2 ID if needed
  // 4. Call DHIS2 API
  // 5. Return formatted result
}
```

### Dependency Resolution
```typescript
async function resolveDependencies(resourceType: string, params: any) {
  // 1. Identify required dependencies
  // 2. Check if they exist
  // 3. Auto-create missing dependencies
  // 4. Return resolved parameter set
}
```

### Reference Resolution
```typescript
async function resolveReference(reference: string, context: any) {
  // 1. Parse reference text
  // 2. Search conversation context
  // 3. Query DHIS2 API if needed
  // 4. Return resolved resource
}
```

## 🎯 Usage Examples

### Simple Creation
```
User: "Create a data element for HIV testing results"
Agent: Creates data element with proper defaults and validation
```

### Complex Creation with Dependencies
```
User: "Create a data set for monthly HIV reporting with age and gender disaggregation"
Agent: Creates data set + data elements + categories + category combos automatically
```

### Update with Reference
```
User: "Update the HIV data element to be text type"
Agent: Resolves "the HIV data element" reference, updates the resource
```

### Batch Operations
```
User: "Create indicators for HIV prevalence, incidence, and testing rate"
Agent: Creates all three indicators in optimized batch operation
```

## 🔍 Debugging & Monitoring

### Logging Points
- Tool invocation with parameters
- API call results and timing
- Dependency resolution steps
- Error conditions and recovery attempts

### Common Issues
- **Schema Validation**: Incorrect parameter types or missing required fields
- **Dependency Conflicts**: Circular dependencies or missing prerequisites
- **API Limits**: DHIS2 API rate limiting or payload size restrictions
- **Permission Issues**: Insufficient user permissions for operations

## 🚀 Extension Points

### Adding New Tools
1. Create tool definition in `structured-tools.ts`
2. Add Zod schema validation
3. Implement DHIS2 API integration
4. Add to appropriate tool category arrays
5. Update agent prompt documentation

### Custom Operations
- Extend prompt for specialized workflows
- Add custom validation logic
- Implement domain-specific error handling
- Create composite operations combining multiple tools

---

The Metadata Agent serves as the comprehensive DHIS2 resource management system, handling all CRUD operations with intelligent dependency resolution, conversational context awareness, and robust error handling.
