# 🛠️ Utility Functions - Helper Libraries & Common Patterns

## Overview

The DHIS2 AI Suite includes a comprehensive collection of utility functions that provide common functionality across the application. These utilities handle environment configuration, DHIS2 API interactions, chat model management, service worker operations, and state management patterns.

**File Location**: Various utility files in `src/utils/`

**Key Utility Modules**:
- Environment configuration management
- DHIS2 API client and utilities
- Chat model factory for AI services
- Service worker management
- State management patterns

---

## 🔧 **Environment Configuration Utilities**

### `src/utils/env-config.ts` - Environment Variable Management

#### Safe Environment Variable Access

```typescript
import { getEnvVar, getEnvVarNumber, getEnvVarBoolean, dhis2Config } from '../utils/env-config';

// String variables with fallbacks
const endpoint = getEnvVar('API_ENDPOINT', 'https://api.example.com');

// Number variables with validation
const port = getEnvVarNumber('PORT', 3000);

// Boolean variables with parsing
const debugMode = getEnvVarBoolean('DEBUG', false);

// Type-safe DHIS2 configuration
const azureEndpoint = dhis2Config.getAzureEndpoint();
const modelName = dhis2Config.getModelName();
const isDeleteEnabled = dhis2Config.isDeleteToolEnabled();
```

#### Core Functions

##### `getEnvVar(key, fallback?)`
- **Purpose**: Safely retrieve string environment variables
- **Validation**: Throws error for missing required variables
- **Fallback**: Optional default value for optional variables

##### `getEnvVarNumber(key, fallback?)`
- **Purpose**: Parse and validate numeric environment variables
- **Validation**: Ensures valid number format
- **Type Safety**: Returns number type with validation

##### `getEnvVarBoolean(key, fallback?)`
- **Purpose**: Parse boolean environment variables from various formats
- **Formats**: Accepts `true/false`, `1/0`, `yes/no` (case-insensitive)
- **Type Safety**: Returns strict boolean values

#### DHIS2 Configuration Object

```typescript
export const dhis2Config = {
    // Azure OpenAI Configuration
    getAzureEndpoint(): string,
    getAzureKey(): string,
    getModelName(): string,
    getDeploymentName(): string,
    getApiVersion(): string,

    // Document Intelligence
    getDocIntelligenceEndpoint(): string,
    getDocIntelligenceKey(): string,
    getModelId(): string,

    // Azure Storage
    getStorageConnectionString(): string,
    getStorageContainer(): string,

    // Default Values
    getDefaultProgramId(): string,      // 'o3jXXatOefs'
    getDefaultOrgUnit(): string,        // 'cYSowRjnmHE'

    // Feature Flags
    isDeleteToolEnabled(): boolean,     // false by default

    // AI Parameters
    getTemperature(): number,           // 0 by default
};
```

#### Environment Validation

##### `validateEnvironment()`
- **Purpose**: Validates all required environment variables on startup
- **Required Variables**: Lists all mandatory configuration variables
- **Error Handling**: Throws detailed error for missing variables
- **Development Safety**: Prevents runtime errors from missing config

---

## 🔗 **DHIS2 API Utilities**

### `src/utils/app-runtime/dhis2-api.ts` - DHIS2 Platform Integration

#### Core API Client

```typescript
import { Dhis2Api, generateDhis2Id, searchDhis2Metadata, getCurrentUserInfo } from '../utils/app-runtime/dhis2-api';

// Generate unique DHIS2 IDs
const newId = await generateDhis2Id();

// Search metadata
const dataElements = await searchDhis2Metadata('dataElements', 'HIV', 5);

// Get current user information
const userInfo = await getCurrentUserInfo();
```

#### API Operations

##### ID Generation
```typescript
static async generateId(): Promise<string>
```
- **Purpose**: Generate unique DHIS2 resource IDs
- **API Endpoint**: Uses `/api/system/id` system endpoint
- **Fallback**: Timestamp-based ID generation on API failure

##### Metadata Search
```typescript
static async searchMetadata(metadataType, query, limit?): Promise<MetadataItem[]>
```
- **Purpose**: Search DHIS2 metadata by name
- **Filtering**: Case-insensitive name matching
- **Fields**: Returns `id`, `name`, `code`, `displayName`
- **Pagination**: Configurable result limits

##### Query Operations
```typescript
static async query(config): Promise<Dhis2ApiResult>
```
- **Purpose**: Execute DHIS2 read queries
- **Engine Integration**: Uses DHIS2 data engine
- **Error Handling**: Structured error responses

##### Mutation Operations
```typescript
static async mutate(config): Promise<Dhis2ApiResult>
```
- **Purpose**: Execute DHIS2 create/update/delete operations
- **Engine Integration**: Uses DHIS2 data engine
- **Result Structure**: Success/error status with data

#### Advanced Utilities

##### User Information Retrieval
```typescript
export async function getCurrentUserInfo(): Promise<UserInfo | null>
```
- **Purpose**: Get current user details and organization units
- **API Endpoint**: `/api/me` with organization unit details
- **Data Structure**: User info with org unit hierarchy

##### Resource Existence Checking
```typescript
export async function checkResourceExists(metadataType, name?, id?, code?): Promise<ResourceCheck>
```
- **Purpose**: Verify if DHIS2 resources exist before operations
- **Lookup Methods**: By ID, name, or code
- **Conflict Prevention**: Avoids duplicate resource creation

##### Aggregated Metadata Creation
```typescript
export async function createDhis2MetadataAggregated(payload): Promise<AggregatedResult>
```
- **Purpose**: Create multiple DHIS2 resources in single API call
- **Existence Checking**: Validates resources before creation
- **Batch Efficiency**: Reduces API calls for bulk operations
- **Conflict Resolution**: Handles existing resources gracefully

##### Direct Metadata Creation
```typescript
export async function createDhis2MetadataDirect(metadataType, payload): Promise<DirectResult>
```
- **Purpose**: Create single DHIS2 resources directly
- **Existence Validation**: Checks for existing resources
- **Import Strategy**: Uses `CREATE_UPDATE` for safe creation
- **Conflict Handling**: Manages 409 conflicts appropriately

---

## 🤖 **Chat Model Factory**

### `src/utils/chat-model-factory.ts` - AI Model Management

#### Model Creation Patterns

```typescript
import { ChatModels } from '../utils/chat-model-factory';

// Create models for different use cases
const agentModel = ChatModels.createAgentModel();           // Deterministic workflows
const extractionModel = ChatModels.createExtractionModel(); // Data parsing
const analysisModel = ChatModels.createAnalysisModel();     // Categorization
const creativeModel = ChatModels.createCreativeModel();     // Flexible generation

// Custom configuration
const customModel = ChatModels.createAgentModel({
    temperature: 0.2,
    maxTokens: 300
});
```

#### Model Presets

```typescript
export const MODEL_PRESETS = {
  AGENT: {
    temperature: 0,      // Deterministic for workflows
    maxTokens: undefined,
  },
  EXTRACTION: {
    temperature: 0.1,    // Low creativity for parsing
    maxTokens: 150,
  },
  ANALYSIS: {
    temperature: 0.1,    // Focused analysis
    maxTokens: 200,
  },
  CREATIVE: {
    temperature: 0.3,    // Higher creativity when needed
    maxTokens: 500,
  },
} as const;
```

#### Provider Auto-Detection

##### `detectModelType()`
- **Purpose**: Automatically select best available AI provider
- **Priority Order**: Azure OpenAI → OpenAI → Future providers
- **Configuration Check**: Validates required environment variables
- **Fallback Logic**: Graceful degradation between providers

#### Azure OpenAI Integration

##### Configuration Management
```typescript
function getAzureConfig(): AzureConfig {
    return {
        model: env.DHIS2_OPENAI_MODEL,
        azureOpenAIApiKey: env.DHIS2_AZURE_KEY,
        azureOpenAIEndpoint: env.DHIS2_AZURE_ENDPOINT,
        azureOpenAIApiDeploymentName: env.DHIS2_AZURE_API_DEPLOYMENT_NAME,
        azureOpenAIApiVersion: env.DHIS2_AZURE_API_VERSION,
    };
}
```

##### Model Creation
```typescript
function createAzureChatModel(preset, overrides): AzureChatOpenAI {
    const baseConfig = getAzureConfig();
    const presetConfig = MODEL_PRESETS[preset];
    const finalConfig = { ...baseConfig, ...presetConfig, ...overrides };
    return new AzureChatOpenAI(finalConfig);
}
```

---

## 🌐 **Service Worker Management**

### `src/utils/serviceWorker.ts` - Offline Support & Caching

#### Service Worker Registration

```typescript
import { registerServiceWorker, updateServiceWorker, clearCache } from '../utils/serviceWorker';

// Register service worker with callbacks
await registerServiceWorker({
    onUpdate: (registration) => {
        console.log('Service Worker update available');
        // Show update prompt to user
    },
    onSuccess: (registration) => {
        console.log('Service Worker registered successfully');
    },
    onError: (error) => {
        console.error('Service Worker registration failed:', error);
    }
});

// Manual update check
await updateServiceWorker();

// Cache management
const cacheSize = await getCacheSize();
await clearCache();
```

#### Core Features

##### Update Management
```typescript
class ServiceWorkerManager {
    async register(config): Promise<void> {
        // Handle installation and updates
        registration.addEventListener('updatefound', () => {
            // New version available
        });
    }

    async update(): Promise<void> {
        // Trigger manual update check
    }

    async skipWaiting(): Promise<void> {
        // Activate waiting service worker
    }
}
```

##### Cache Operations
```typescript
async getCacheSize(): Promise<number> {
    // Communicate with service worker to get cache size
}

async clearCache(): Promise<void> {
    // Clear all cached resources
}
```

#### Utility Functions

##### Status Checking
```typescript
export const isServiceWorkerSupported = (): boolean => {
    return 'serviceWorker' in navigator;
};

export const isOffline = (): boolean => {
    return !navigator.onLine;
};

export const isUpdateAvailable = (): boolean => {
    return swManager.isUpdateAvailable();
};
```

##### Event Listening
```typescript
export const onOnlineStatusChange = (callback): (() => void) => {
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
```

##### Cache Formatting
```typescript
export const formatCacheSize = (bytes: number): string => {
    // Format bytes to human-readable format (B, KB, MB, GB)
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
};
```

---

## 📊 **State Management Patterns**

### `src/utils/state.ts` - LangGraph State Integration

#### Basic State Structure

```typescript
import { MessagesAnnotation } from "@langchain/langgraph/web";

// Simple state annotation using LangGraph's built-in MessagesAnnotation
export const StateAnnotation = MessagesAnnotation;
```

#### StateAnnotation Fundamentals

##### Built-in Annotations
- **MessagesAnnotation**: For conversation-based workflows
- **Reducer Pattern**: Immutable state updates
- **Type Safety**: Full TypeScript integration
- **Serialization**: JSON-compatible state storage

##### Usage Pattern
```typescript
const workflow = new StateGraph(StateAnnotation)
    .addNode('process_message', processMessageNode)
    .addEdge(START, 'process_message')
    .addEdge('process_message', END)
    .compile();

// Invoke with message state
const result = await workflow.invoke({
    messages: [{ role: 'user', content: 'Hello' }]
});
```

---

## 🔧 **Common Patterns & Best Practices**

### Error Handling Patterns

#### Safe Async Operations
```typescript
// Timeout protection for API calls
const result = await executeWithTimeout(
    () => apiCall(),
    5000, // 5 second timeout
    'API call'
);

// Retry logic for transient failures
const result = await executeWithRetry(
    () => riskyOperation(),
    3, // Max 3 retries
    'risky operation'
);
```

#### JSON Parsing Safety
```typescript
const safeJsonParse = (content: string, fallback: any = null): any => {
    try {
        return JSON.parse(content);
    } catch (error) {
        console.warn('Failed to parse JSON response:', content.substring(0, 200));
        return fallback || { success: false, error: 'Invalid JSON response format' };
    }
};
```

### Validation Patterns

#### Input Validation
```typescript
function validateCrudAgentInput(input: any): { isValid: boolean; error?: string } {
    // Required field checks
    if (!input?.messages?.length) {
        return { isValid: false, error: 'No messages provided' };
    }

    // Content validation
    const userMessage = input.messages.find(m => m.role === 'user');
    if (!userMessage?.content?.trim()) {
        return { isValid: false, error: 'Empty user message' };
    }

    return { isValid: true };
}
```

### Resource Management

#### Cleanup Patterns
```typescript
// Automatic resource cleanup
const cleanup = () => {
    // Remove event listeners
    window.removeEventListener('online', handleOnline);

    // Clear timeouts
    clearTimeout(timeoutId);

    // Close connections
    messageChannel.close();
};

// Usage with cleanup guarantee
try {
    await operation();
} finally {
    cleanup();
}
```

### Configuration Patterns

#### Hierarchical Configuration
```typescript
// Environment-based configuration hierarchy
const config = {
    // Base configuration
    baseUrl: getEnvVar('BASE_URL', 'https://api.example.com'),

    // Feature flags
    features: {
        deleteEnabled: getEnvVarBoolean('ENABLE_DELETE', false),
        cachingEnabled: getEnvVarBoolean('ENABLE_CACHING', true),
    },

    // Provider-specific settings
    providers: {
        azure: {
            endpoint: getEnvVar('AZURE_ENDPOINT'),
            key: getEnvVar('AZURE_KEY'),
        }
    }
};
```

---

## 📈 **Performance Optimizations**

### Caching Strategies

#### Multi-Level Caching
```typescript
// Instance cache for frequent access
private cache = new Map<string, CachedResult>();

// Shared cache across service instances
private static sharedCache = new Map<string, CachedResult>();

// Cache key generation
private hashInput(input: any): string {
    const str = JSON.stringify(input);
    return str.split('').reduce((hash, char) => {
        return ((hash << 5) - hash) + char.charCodeAt(0);
    }, 0).toString(36);
}
```

### Memory Management

#### Efficient Data Structures
```typescript
// Use Maps for frequent lookups
const resourceCache = new Map<string, Resource>();

// Use Sets for membership testing
const processedIds = new Set<string>();

// Lazy loading for heavy objects
const lazyLoadData = async (): Promise<HeavyData> => {
    if (!this.cachedData) {
        this.cachedData = await loadHeavyData();
    }
    return this.cachedData;
};
```

### Batch Operations

#### Request Batching
```typescript
// Collect multiple requests
const batch: BatchRequest[] = [];
const processBatch = () => {
    if (batch.length > 0) {
        // Process all collected requests
        processBatchRequests(batch);
        batch.length = 0; // Clear batch
    }
};

// Throttled batch processing
setTimeout(processBatch, BATCH_DELAY);
```

---

## 🔍 **Debugging & Monitoring**

### Logging Patterns

#### Structured Logging
```typescript
console.log('🔄 Agent execution:', {
    agent: 'crud',
    operation: operationType,
    duration: Date.now() - startTime,
    success: result.success,
    errorCount: errors.length
});
```

#### Performance Monitoring
```typescript
const startTime = performance.now();
// Operation execution
const duration = performance.now() - startTime;

console.log(`⚡ Operation completed in ${duration.toFixed(2)}ms`);
```

### Health Checks

#### Service Availability
```typescript
export const healthCheck = async (): Promise<HealthStatus> => {
    const checks = await Promise.all([
        checkDatabaseConnection(),
        checkExternalAPIs(),
        checkCacheHealth(),
        checkServiceWorkers()
    ]);

    return {
        status: checks.every(c => c.healthy) ? 'healthy' : 'degraded',
        checks,
        timestamp: Date.now()
    };
};
```

---

## 🚀 **Extension Points**

### Adding New Utility Functions

#### Utility Module Structure
```typescript
// utils/new-utility.ts
export class NewUtility {
    // Core functionality
    async performOperation(): Promise<Result> {
        // Implementation
    }
}

// Convenience exports
export const newUtility = new NewUtility();
export { NewUtility };
```

#### Integration with Existing Systems
1. **Type Definitions**: Add to global types
2. **Error Handling**: Integrate with error classification
3. **Configuration**: Add environment variables
4. **Testing**: Add unit and integration tests
5. **Documentation**: Update utility documentation

### Custom Configuration Providers

#### Environment Provider Pattern
```typescript
export interface ConfigProvider {
    get(key: string): string | undefined;
    getNumber(key: string, fallback?: number): number;
    getBoolean(key: string, fallback?: boolean): boolean;
}

// Multiple provider support
export class CompositeConfigProvider implements ConfigProvider {
    constructor(private providers: ConfigProvider[]) {}

    get(key: string): string | undefined {
        for (const provider of this.providers) {
            const value = provider.get(key);
            if (value !== undefined) return value;
        }
        return undefined;
    }
}
```

### Advanced Caching Strategies

#### Cache Invalidation
```typescript
export class SmartCache<T> {
    private cache = new Map<string, CacheEntry<T>>();

    set(key: string, value: T, ttl: number, dependencies: string[] = []) {
        this.cache.set(key, {
            value,
            expires: Date.now() + ttl,
            dependencies
        });
    }

    invalidateDependencies(changedKeys: string[]) {
        for (const [key, entry] of this.cache.entries()) {
            if (entry.dependencies.some(dep => changedKeys.includes(dep))) {
                this.cache.delete(key);
            }
        }
    }
}
```

---

These utility functions form the backbone of the DHIS2 AI Suite, providing reliable, type-safe, and performant implementations of common patterns used throughout the application. They ensure consistency, maintainability, and scalability across all system components.
