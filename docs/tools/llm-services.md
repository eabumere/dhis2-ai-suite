# 🤖 LLM Classification Services - AI-Powered Analysis

## Overview

The LLM Classification Services provide intelligent, multilingual AI-powered analysis capabilities throughout the DHIS2 AI Suite. This centralized service handles intent classification, column type detection, query analysis, error classification, and operation complexity assessment using advanced language models.

**File Location**: `src/utils/llm-classification-service.ts`

**Key Responsibilities**:
- Intent classification from natural language queries
- DHIS2 column type detection from headers
- Query complexity and entity extraction
- Error classification and recovery suggestions
- Operation complexity analysis
- Performance optimization through caching and batching

## 🏗️ Architecture

### Core Service Structure

```typescript
export class LLMClassificationService {
    private llmModel: any;
    private cache = new Map<string, { result: any; timestamp: number; ttl: number }>();
    private cacheTTL = 30 * 60 * 1000; // 30 minutes

    // Shared cache instance for cross-service cache sharing
    private static sharedCache = new Map<string, { result: any; timestamp: number; ttl: number; service: string }>();

    // Batch processing queue for multiple simultaneous requests
    private static batchQueue: Array<{...}>;
}
```

### Service Capabilities

#### 1. Intent Classification
```typescript
async classifyIntent(query: string, context?: any): Promise<IntentClassification>
```
- **Categories**: search, analytics, crud, data_entry, unknown
- **Output**: Primary intent with confidence score and alternatives
- **Multilingual**: Supports English, French, Spanish, Arabic, Portuguese

#### 2. Column Type Detection
```typescript
async detectColumnType(header: string, context?: any): Promise<ColumnTypeAnalysis>
```
- **DHIS2 Types**: dataElement, orgUnit, period, categoryOption, attributeOption, value
- **Language Agnostic**: Recognizes synonyms across languages
- **Context Aware**: Uses surrounding context for better detection

#### 3. Query Analysis
```typescript
async analyzeQuery(query: string, context?: any): Promise<QueryAnalysis>
```
- **Intent Extraction**: Primary user intent
- **Entity Recognition**: Named entities (indicators, org units, periods)
- **Complexity Assessment**: simple, moderate, complex
- **Metadata Requirements**: Whether selection interfaces are needed

#### 4. Error Classification
```typescript
async classifyError(error: any): Promise<ErrorClassification>
```
- **Categories**: resource, auth, network, input, server, unknown
- **Severity Levels**: low, medium, high, critical
- **Recovery Suggestions**: Actionable recovery steps

#### 5. Operation Complexity Analysis
```typescript
async analyzeOperationComplexity(query: string): Promise<OperationAnalysis>
```
- **Complexity Levels**: single, multiple, complex
- **Operation Detection**: Individual operations within queries
- **Confirmation Requirements**: When user confirmation is needed

## 🎯 Key Features

### Multilingual Support

#### Language Agnostic Processing
- **Supported Languages**: English, French, Spanish, Arabic, Portuguese
- **Synonym Recognition**: Understands domain-specific terms in multiple languages
- **Cultural Context**: Considers regional DHIS2 terminology variations

#### Example Multilingual Recognition
```
English: "data element" → dataElement
French:  "élément de données" → dataElement
Spanish: "elemento de datos" → dataElement
Arabic:  "عنصر البيانات" → dataElement
```

### Performance Optimization

#### Intelligent Caching

##### Instance-Specific Cache
```typescript
private cache = new Map<string, { result: any; timestamp: number; ttl: number }>();
```
- **TTL**: 30 minutes default
- **Hash-Based Keys**: Input hashing for cache lookup
- **Automatic Cleanup**: Removes expired entries

##### Shared Cache System
```typescript
private static sharedCache = new Map<string, { result: any; timestamp: number; ttl: number; service: string }>();
```
- **Cross-Service Sharing**: Cache results across service instances
- **Service Tagging**: Identifies cache entry sources
- **Global Optimization**: Reduces redundant LLM calls

#### Batch Processing

##### Request Batching
```typescript
private static batchQueue: Array<{...}>;
private static readonly BATCH_SIZE = 5;
private static readonly BATCH_DELAY = 100; // ms
```
- **Concurrent Processing**: Up to 5 simultaneous requests
- **Queue Management**: Collects requests before processing
- **Rate Limiting**: Prevents API overload

##### Batch Classification
```typescript
async batchClassifyIntents(requests: Array<{ query: string; context?: any; id: string }>): Promise<Map<string, IntentClassification>>
```
- **Bulk Processing**: Handles multiple intents simultaneously
- **Optimized Prompting**: Single prompt for multiple classifications
- **Result Mapping**: Maintains request-to-response correlation

### Fallback Mechanisms

#### Graceful Degradation
When LLM services are unavailable, the service provides keyword-based fallbacks:

##### Intent Classification Fallback
```typescript
private getFallbackIntentClassification(query: string): IntentClassification
```
- **Keyword Matching**: Simple pattern recognition
- **Reduced Confidence**: Lower confidence scores for fallbacks
- **Basic Functionality**: Maintains system operation

##### Column Type Detection Fallback
```typescript
private getFallbackColumnType(header: string): ColumnTypeAnalysis
```
- **Term Recognition**: Identifies common DHIS2 terms
- **Language Support**: Works across supported languages
- **Confidence Scoring**: Appropriate confidence levels

##### Error Classification Fallback
```typescript
private getFallbackErrorClassification(errorText: string): ErrorClassification
```
- **Pattern Matching**: Recognizes common error patterns
- **Category Assignment**: Maps errors to appropriate categories
- **Severity Assessment**: Determines error impact levels

## 🔄 Integration Points

### Agent Communication

#### Router Agent Integration
- **Intent Classification**: Routes queries to appropriate agents
- **Context Provision**: Supplies conversation context for better classification
- **Confidence Scoring**: Provides routing confidence levels

#### Analytics Agent Integration
- **Query Analysis**: Extracts entities for metadata selection
- **Complexity Assessment**: Determines processing requirements
- **Multilingual Support**: Handles queries in multiple languages

### Workflow Orchestrator

#### Error Recovery
- **Error Classification**: Provides intelligent error analysis
- **Recovery Strategies**: Suggests automated recovery approaches
- **User Guidance**: Offers clear recovery instructions

#### Progress Tracking
- **Operation Analysis**: Assesses workflow complexity
- **Confirmation Requirements**: Determines when user input is needed
- **Performance Monitoring**: Tracks classification success rates

### Metadata Tools

#### Column Type Detection
- **Header Analysis**: Automatically detects DHIS2 data types
- **Mapping Generation**: Creates appropriate field mappings
- **Validation Support**: Ensures data structure compatibility

## 📊 Performance & Reliability

### Cache Statistics

#### Monitoring Capabilities
```typescript
getCacheStats(): { instanceCache: number; sharedCache: number; hitRate: number }
```
- **Instance Cache Size**: Current cached entries count
- **Shared Cache Size**: Global cache utilization
- **Hit Rate Calculation**: Cache effectiveness measurement

#### Cache Management
```typescript
clearAllCaches(): void
```
- **Emergency Clearing**: Removes all cached data
- **Memory Management**: Frees up system resources
- **Fresh State**: Forces fresh LLM calls

### Reliability Features

#### Service Resilience
- **LLM Failure Handling**: Graceful fallback to keyword-based methods
- **Timeout Management**: Prevents hanging requests
- **Error Isolation**: Contains failures to individual requests

#### Quality Assurance
- **Confidence Scoring**: Provides reliability indicators
- **Alternative Suggestions**: Offers multiple classification options
- **Reasoning Documentation**: Explains classification decisions

## 🎯 Usage Examples

### Intent Classification
```typescript
const result = await llmClassificationService.classifyIntent(
    "Show me malaria cases by district for Q1 2024"
);
// Result: { intent: 'analytics', confidence: 0.92, reasoning: "...", alternatives: [...] }
```

### Column Type Detection
```typescript
const result = await llmClassificationService.detectColumnType(
    "Data Element", { context: "DHIS2 aggregate data" }
);
// Result: { type: 'dataElement', confidence: 0.95, reasoning: "...", alternatives: [...] }
```

### Batch Processing
```typescript
const requests = [
    { id: 'req1', query: "Create new indicator", context: {} },
    { id: 'req2', query: "Show data for Kenya", context: {} }
];
const results = await llmClassificationService.batchClassifyIntents(requests);
// Result: Map { 'req1' => { intent: 'crud', ... }, 'req2' => { intent: 'analytics', ... } }
```

### Error Classification
```typescript
const result = await llmClassificationService.classifyError(
    new Error("Data element not found")
);
// Result: { severity: 'medium', category: 'resource', reasoning: "...", suggestedActions: [...] }
```

## 🔧 Configuration Options

### Cache Configuration

#### Shared Cache Control
```typescript
llmClassificationService.enableSharedCache();  // Enable cross-service caching
llmClassificationService.disableSharedCache(); // Disable shared caching
```

#### Cache TTL Adjustment
```typescript
// Modify cache TTL (default: 30 minutes)
private cacheTTL = 30 * 60 * 1000; // 30 minutes
```

### Batch Processing Configuration

#### Batch Size Adjustment
```typescript
private static readonly BATCH_SIZE = 5; // Concurrent requests
private static readonly BATCH_DELAY = 100; // Collection delay (ms)
```

#### Global Batch Processing
```typescript
LLMClassificationService.enableBatchProcessing(); // Enable batch optimization
```

## 🔍 Debugging & Monitoring

### Cache Monitoring
```typescript
const stats = llmClassificationService.getCacheStats();
console.log(`Cache hit rate: ${stats.hitRate * 100}%`);
console.log(`Instance cache: ${stats.instanceCache} entries`);
console.log(`Shared cache: ${stats.sharedCache} entries`);
```

### Classification Logging
- **Request Tracking**: Logs all classification requests
- **Confidence Scores**: Monitors classification reliability
- **Fallback Usage**: Tracks when fallbacks are used
- **Performance Metrics**: Response times and success rates

### Common Issues

#### Cache-Related Issues
- **Stale Data**: Old cached results causing incorrect classifications
- **Memory Usage**: Large cache sizes impacting performance
- **Cache Conflicts**: Shared cache corruption between services

#### LLM Service Issues
- **API Limits**: Rate limiting causing request failures
- **Model Changes**: Updated models affecting classification accuracy
- **Network Issues**: Connectivity problems with AI services

#### Fallback Degradation
- **Reduced Accuracy**: Keyword-based methods less accurate than LLM
- **Limited Language Support**: Fallbacks may not handle all languages
- **Missing Context**: Without LLM, context-aware classification is lost

## 🚀 Extension Points

### Custom Classification Types

#### Adding New Intent Categories
1. Extend intent classification prompt
2. Add fallback keyword patterns
3. Update return type definitions
4. Integrate with routing logic

#### Domain-Specific Classifiers
1. Create specialized classification methods
2. Add domain-specific prompts
3. Implement custom fallback logic
4. Integrate with existing service architecture

### Enhanced Multilingual Support

#### New Language Addition
1. Update classification prompts with new language examples
2. Add language-specific synonym recognition
3. Test classification accuracy across languages
4. Update fallback keyword patterns

### Advanced Caching Strategies

#### Predictive Caching
1. Implement usage pattern analysis
2. Pre-cache common queries
3. Add cache warming strategies
4. Optimize cache invalidation

---

The LLM Classification Services form the intelligent core of the DHIS2 AI Suite, enabling natural language understanding and automated decision-making while maintaining high performance through advanced caching and fallback mechanisms.
