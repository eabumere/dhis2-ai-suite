# 🔄 Graph State Architecture - StateGraph Patterns

## Overview

The Graph State Architecture forms the foundation of complex workflow orchestration in the DHIS2 AI Suite. Using LangGraph's StateGraph and StateAnnotation patterns, agents implement sophisticated state machines that manage multi-step operations, error recovery, and user interactions while maintaining type safety and predictable state transitions.

**File Location**: Various agent implementations using `Annotation.Root()`

**Key Responsibilities**:
- Define strongly-typed state structures for complex workflows
- Manage state transitions through conditional routing
- Implement progress tracking and error recovery
- Enable resumable operations with checkpoint persistence
- Coordinate multi-step processes with user interaction

## 🏗️ Architecture Overview

### LangGraph StateGraph Pattern

The StateGraph architecture provides a robust framework for implementing complex, multi-step workflows:

```typescript
// State definition using Annotation.Root
const WorkflowAnnotation = Annotation.Root({
    // State fields with reducers
    messages: Annotation<any[]>({ reducer: messageReducer }),
    workflowProgress: Annotation<ProgressState>({ reducer: progressReducer }),
    orchestrator: Annotation<any>({ reducer: (left, right) => right || left }),

    // Custom state fields
    operationData: Annotation<OperationData>({ reducer: dataReducer }),
    finalResult: Annotation<any>({ reducer: (left, right) => right || left })
});

// Workflow compilation
const workflow = new StateGraph(WorkflowAnnotation)
    .addNode('step1', step1Function)
    .addNode('step2', step2Function)
    .addConditionalEdges('step1', routingFunction)
    .compile();
```

### State Annotation Fundamentals

#### Core Principles

1. **Type Safety**: All state fields are strongly typed with TypeScript interfaces
2. **Reducers**: Each field has a reducer function defining how state updates work
3. **Immutability**: State updates create new state objects, not mutations
4. **Composition**: Complex workflows composed from simpler state machines

#### Basic StateAnnotation Structure

```typescript
const BasicAnnotation = Annotation.Root({
    // Required fields with defaults
    messages: Annotation<any[]>({
        reducer: (left: any[], right: any[]) => right ? right : left,
        default: () => []
    }),

    // Optional fields
    result: Annotation<any>({
        reducer: (left, right) => right || left,
        default: () => null
    }),

    // Complex state with custom reducer
    progress: Annotation<{
        current: number;
        total: number;
        step: string;
    }>({
        reducer: (left, right) => right || left,
        default: () => ({ current: 0, total: 1, step: 'initial' })
    })
});
```

## 🔄 State Transition Patterns

### Conditional Routing

#### Pattern: Decision-Based Routing
```typescript
// Define routing function
function routeBasedOnResult(state: typeof WorkflowAnnotation.State) {
    if (state.finalResult?.success) return 'success_handler';
    if (state.finalResult?.needsUserInput) return 'user_interaction';
    return 'error_handler';
}

// Apply conditional edges
workflow.addConditionalEdges('process_data', routeBasedOnResult);
```

#### Pattern: State-Based Branching
```typescript
function routeBasedOnState(state: typeof WorkflowAnnotation.State) {
    const complexity = analyzeComplexity(state.operationData);

    switch (complexity) {
        case 'simple': return 'simple_processor';
        case 'complex': return 'complex_processor';
        default: return 'fallback_processor';
    }
}
```

### State Reducer Patterns

#### Message Accumulation
```typescript
const messageReducer = (left: any[], right: any[]) => {
    if (Array.isArray(right)) {
        return left.concat(right);
    }
    return left.concat([right]);
};
```

#### Latest Value Override
```typescript
const latestValueReducer = (left: any, right: any) => right || left;
```

#### Incremental Updates
```typescript
const progressReducer = (left: Progress, right: Partial<Progress>) =>
    right ? { ...left, ...right } : left;
```

#### Map/Object Merging
```typescript
const objectMergeReducer = (left: Record<string, any>, right: Record<string, any>) =>
    ({ ...left, ...right });
```

## 🎯 Workflow Implementation Patterns

### CRUD Operations Workflow

#### Complex State Definition
```typescript
const CrudAnnotation = Annotation.Root({
    // Input state
    messages: Annotation<any[]>({ reducer: messageReducer, default: () => [] }),

    // Progress tracking
    workflowProgress: Annotation<ProgressState>({ reducer: progressReducer }),

    // Orchestrator integration
    orchestrator: Annotation<any>({ reducer: latestValueReducer }),

    // Planned operations
    plannedOperations: Annotation<PlannedOperation[]>({ reducer: latestValueReducer }),

    // Reference resolution
    resolvedResources: Annotation<Record<string, ResourceInfo>>({
        reducer: objectMergeReducer,
        default: () => ({})
    }),

    // User interaction
    confirmationRequired: Annotation<boolean>({ reducer: latestValueReducer }),
    confirmationSummary: Annotation<ConfirmationData>({ reducer: latestValueReducer }),

    // Results and errors
    results: Annotation<any[]>({ reducer: resultAccumulator }),
    finalResult: Annotation<any>({ reducer: latestValueReducer }),
    error: Annotation<string>({ reducer: latestValueReducer })
});
```

#### Multi-Step Workflow Nodes
```typescript
// 1. Planning phase
async function plan_operations(state) {
    // Analyze request and plan operations
    const operations = await analyzeAndPlan(state.messages);
    return { plannedOperations: operations };
}

// 2. Resource preparation
async function prepare_resources(state) {
    // Generate IDs, resolve dependencies
    const prepared = await prepareOperations(state.plannedOperations);
    return { plannedOperations: prepared };
}

// 3. User confirmation (conditional)
async function confirm_operations(state) {
    if (state.confirmationRequired) {
        // Present to user and wait for confirmation
        return await requestUserConfirmation(state.confirmationSummary);
    }
    return {}; // Skip confirmation
}

// 4. Execution
async function execute_operations(state) {
    const results = await executeAllOperations(state.plannedOperations);
    return { results, finalResult: summarizeResults(results) };
}
```

### Analytics Workflow Pattern

#### StateGraph with Branching Logic
```typescript
const AnalyticsAnnotation = Annotation.Root({
    // Query processing state
    messages: Annotation<any[]>({ reducer: messageReducer }),
    query: Annotation<string>({ reducer: latestValueReducer }),
    step: Annotation<string>({ reducer: latestValueReducer }),

    // Metadata extraction
    extractedEntities: Annotation<EntityInfo[]>({ reducer: latestValueReducer }),
    selectedItems: Annotation<SelectedItem[]>({ reducer: latestValueReducer }),

    // Chart generation
    chartData: Annotation<any>({ reducer: latestValueReducer }),
    finalResult: Annotation<any>({ reducer: latestValueReducer })
});

// Complex routing based on query analysis
function routeAnalyticsStep(state) {
    switch (state.step) {
        case 'classify': return 'extract_metadata';
        case 'extract_metadata': return state.extractedEntities?.length > 0
            ? 'request_selection' : 'generate_chart';
        case 'generate_chart': return 'finalize_result';
        default: return END;
    }
}
```

## 📊 Progress Tracking & Recovery

### Progress State Management

#### Standardized Progress Structure
```typescript
interface ProgressState {
    currentStep: number;
    totalSteps: number;
    stepName: string;
    message: string;
    isIndeterminate?: boolean;
}

// Progress update helper
function updateProgress(step: number, stepName: string, message: string): Partial<State> {
    return {
        workflowProgress: {
            currentStep: step,
            totalSteps: 8, // Workflow-specific
            stepName,
            message,
            isIndeterminate: false
        }
    };
}
```

#### Checkpoint & Recovery System

##### State Persistence
```typescript
// Store workflow state for recovery
async function storeCheckpoint(state, checkpointId: string) {
    const checkpoint = {
        id: checkpointId,
        state: state,
        timestamp: Date.now(),
        progress: state.workflowProgress
    };

    await orchestrator.storeWorkflowCheckpoint(checkpoint);
    return { lastCheckpoint: checkpointId };
}
```

##### Recovery Routing
```typescript
function routeWithRecovery(state) {
    if (state.error && state.lastCheckpoint) {
        return 'recovery_handler';
    }
    return 'normal_flow';
}
```

## 🔄 State Composition Patterns

### Hierarchical State Machines

#### Parent-Child Workflow Pattern
```typescript
// Parent workflow delegates to child workflows
const ParentAnnotation = Annotation.Root({
    subWorkflows: Annotation<SubWorkflowState[]>({ reducer: latestValueReducer }),
    overallProgress: Annotation<Progress>({ reducer: progressReducer })
});

// Child workflow handles specific operations
const ChildAnnotation = Annotation.Root({
    operationData: Annotation<any>({ reducer: latestValueReducer }),
    childResult: Annotation<any>({ reducer: latestValueReducer })
});
```

### State Sharing Patterns

#### Orchestrator Integration
```typescript
const SharedAnnotation = Annotation.Root({
    // Shared orchestrator reference
    orchestrator: Annotation<WorkflowOrchestrator>({
        reducer: latestValueReducer
    }),

    // UI state synchronization
    uiState: Annotation<UIState>({
        reducer: (left, right) => right || left
    }),

    // Cross-workflow communication
    sharedData: Annotation<Record<string, any>>({
        reducer: objectMergeReducer,
        default: () => ({})
    })
});
```

## 🚨 Error Handling in StateGraphs

### Error State Integration

#### Error-Aware State Definition
```typescript
const ResilientAnnotation = Annotation.Root({
    // Normal operation state
    operationData: Annotation<any>({ reducer: latestValueReducer }),

    // Error tracking
    error: Annotation<ErrorInfo>({ reducer: latestValueReducer }),
    retryCount: Annotation<number>({
        reducer: (left, right) => right ?? left,
        default: () => 0
    }),

    // Recovery state
    recoveryStrategy: Annotation<string>({ reducer: latestValueReducer }),
    checkpointData: Annotation<any>({ reducer: latestValueReducer })
});
```

#### Error Recovery Routing
```typescript
function routeWithErrorHandling(state) {
    if (state.error) {
        if (state.retryCount < MAX_RETRIES) {
            return 'retry_operation';
        }
        return 'error_recovery';
    }
    return 'continue_workflow';
}
```

### Fallback State Patterns

#### Graceful Degradation
```typescript
async function handleOperationError(state) {
    // Attempt recovery strategies
    const recoveryResult = await attemptRecovery(state.error, state.recoveryStrategy);

    if (recoveryResult.success) {
        return {
            error: null,
            operationData: recoveryResult.data,
            retryCount: 0 // Reset on success
        };
    }

    // Fallback to simplified operation
    return {
        error: state.error,
        operationData: await fallbackOperation(state.operationData),
        recoveryStrategy: 'fallback_used'
    };
}
```

## 📈 Performance Optimizations

### State Size Management

#### Selective State Updates
```typescript
// Only update changed fields
function optimizedUpdate(changes: Partial<State>): Partial<State> {
    return Object.keys(changes).reduce((acc, key) => {
        if (changes[key] !== undefined) {
            acc[key] = changes[key];
        }
        return acc;
    }, {});
}
```

#### State Cleanup
```typescript
function cleanupState(state: State): Partial<State> {
    const cleaned = { ...state };

    // Remove temporary data
    delete cleaned.tempData;
    delete cleaned.processingCache;

    // Compress large objects if needed
    if (cleaned.largeData) {
        cleaned.largeData = compressData(cleaned.largeData);
    }

    return cleaned;
}
```

### Memory-Efficient Patterns

#### Lazy State Loading
```typescript
const LazyAnnotation = Annotation.Root({
    // Load data on demand
    lazyData: Annotation<any>({
        reducer: async (left, right) => {
            if (right === 'LOAD_REQUESTED') {
                return await loadDataFromStorage();
            }
            return right || left;
        }
    }),

    // Cache management
    dataCache: Annotation<Map<string, any>>({
        reducer: (left, right) => right || left,
        default: () => new Map()
    })
});
```

## 🔧 Integration Patterns

### Orchestrator Communication

#### UI State Synchronization
```typescript
const UIIntegratedAnnotation = Annotation.Root({
    // Orchestrator reference
    orchestrator: Annotation<any>({ reducer: latestValueReducer }),

    // UI feedback
    progressUpdates: Annotation<ProgressUpdate[]>({
        reducer: (left, right) => left.concat(right),
        default: () => []
    }),

    // User interaction handling
    userResponses: Annotation<UserResponse[]>({
        reducer: (left, right) => left.concat(right),
        default: () => []
    })
});
```

### Conversation Context Integration

#### Context-Aware State
```typescript
const ContextAwareAnnotation = Annotation.Root({
    // Conversation integration
    conversationContext: Annotation<ConversationData>({ reducer: latestValueReducer }),

    // Session awareness
    sessionId: Annotation<string>({ reducer: latestValueReducer }),
    threadId: Annotation<string>({ reducer: latestValueReducer }),

    // Context sharing
    sharedContext: Annotation<Record<string, any>>({
        reducer: objectMergeReducer,
        default: () => ({})
    })
});
```

## 📋 Usage Examples

### Basic CRUD Workflow
```typescript
const crudWorkflow = new StateGraph(CrudAnnotation)
    .addNode('plan', planOperations)
    .addNode('prepare', prepareResources)
    .addNode('confirm', confirmWithUser)
    .addNode('execute', executeOperations)
    .addEdge(START, 'plan')
    .addEdge('plan', 'prepare')
    .addConditionalEdges('prepare',
        (state) => state.confirmationRequired ? 'confirm' : 'execute'
    )
    .addEdge('confirm', 'execute')
    .addEdge('execute', END)
    .compile();
```

### Error-Resilient Analytics
```typescript
const analyticsWorkflow = new StateGraph(AnalyticsAnnotation)
    .addNode('extract', extractMetadata)
    .addNode('select', handleSelection)
    .addNode('generate', generateChart)
    .addNode('recover', handleErrors)
    .addEdge(START, 'extract')
    .addConditionalEdges('extract',
        (state) => state.error ? 'recover' : 'select'
    )
    .addEdge('select', 'generate')
    .addEdge('generate', END)
    .addEdge('recover', 'extract') // Retry after recovery
    .compile();
```

## 🔍 Debugging & Monitoring

### State Inspection
```typescript
// Log state transitions
function debugStateTransition(nodeName: string, state: State) {
    console.log(`🔄 ${nodeName} state:`, {
        progress: state.workflowProgress,
        error: state.error,
        result: state.finalResult
    });
}
```

### Performance Monitoring
```typescript
// Track execution times
const startTime = Date.now();
const result = await workflow.invoke(initialState);
const duration = Date.now() - startTime;

console.log(`⚡ Workflow completed in ${duration}ms`);
```

### State Validation
```typescript
function validateState(state: State): boolean {
    // Check required fields
    if (!state.messages?.length) return false;
    if (state.workflowProgress.currentStep > state.workflowProgress.totalSteps) return false;

    // Validate state consistency
    return true;
}
```

## 🚀 Extension Points

### Custom State Annotations

#### Domain-Specific State
```typescript
const DomainAnnotation = Annotation.Root({
    // Domain-specific fields
    domainData: Annotation<DomainData>({ reducer: domainReducer }),
    domainRules: Annotation<DomainRules>({ reducer: latestValueReducer }),

    // Integration with base state
    ...BaseAnnotation.State
});
```

### Advanced Routing Logic

#### ML-Based Routing
```typescript
async function intelligentRoute(state: State) {
    const prediction = await mlModel.predict(state);
    return prediction.nextNode;
}
```

### State Persistence

#### Database Integration
```typescript
async function persistState(state: State, workflowId: string) {
    await database.saveWorkflowState(workflowId, state);
}

async function loadState(workflowId: string): Promise<State> {
    return await database.loadWorkflowState(workflowId);
}
```

---

The Graph State Architecture provides a powerful, type-safe foundation for implementing complex workflows in the DHIS2 AI Suite. By leveraging LangGraph's StateAnnotation and StateGraph patterns, agents can manage sophisticated state transitions, error recovery, and user interactions while maintaining code clarity and reliability.
