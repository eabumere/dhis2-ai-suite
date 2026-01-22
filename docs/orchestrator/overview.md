# 🎭 Workflow Orchestrator - Central Coordination System

## Overview

The Workflow Orchestrator is the **central nervous system** of the DHIS2 AI Suite, responsible for coordinating all system components, managing user interactions, and maintaining application state. It acts as the bridge between AI agents, UI components, and user workflows, ensuring seamless communication and state consistency.

**File Location**: `src/utils/workflow-orchestrator.ts`

**Architecture**: Singleton orchestrator class with comprehensive state management and lifecycle coordination

## 🏗️ Core Architecture

### Orchestrator Responsibilities

The orchestrator serves as the **single source of truth** for:

1. **UI State Management**: Centralized control of all user interface states
2. **Workflow Lifecycle**: Start, pause, resume, and complete agent workflows
3. **Conversation Management**: Thread conversation messages and maintain context
4. **Error Handling**: Classify errors and provide recovery strategies
5. **File Management**: Handle file uploads, storage, and processing
6. **Progress Tracking**: Monitor workflow execution and provide user feedback

### Key Interfaces

#### WorkflowUIState - Complete UI State
```typescript
interface WorkflowUIState {
    // Input controls
    showQueryInput: boolean;
    queryText: string;
    queryEnabled: boolean;

    // Processing feedback
    showProcessing: boolean;
    processingMessage?: string;

    // Results display
    showResults: boolean;
    results?: any;
    resultsType?: string;

    // Specialized views
    showChart: boolean;
    chartData?: any;
    showSelection: boolean;
    selectionOptions: SelectionOptions[];

    // Conversation management
    conversation: ConversationMessage[];
    showConversation: boolean;
}
```

#### ConversationMessage - Rich Message Types
```typescript
interface ConversationMessage {
    id: string;
    timestamp: number;
    role: 'user' | 'assistant';
    content: string;
    attachments?: FileAttachment[];
    data?: any;
    threadId?: string;
    type: 'query' | 'response' | 'selection' | 'error' | 'progress' | ...;
}
```

#### ComprehensiveWorkflowCallbacks - UI Integration
```typescript
interface ComprehensiveWorkflowCallbacks {
    onUIStateChange: (newState: Partial<WorkflowUIState>) => void;
    onSelection: (options: SelectionOptions[], callback) => void;
    onChartRender: (chartData: any) => void;
    onWorkflowStart: (workflowId: string, flowType: string) => void;
    onWorkflowComplete: (workflowId: string, result: any) => void;
    onWorkflowError: (workflowId: string, error: string) => void;
}
```

## 🔄 Core Functionality

### 1. Workflow Lifecycle Management

#### Starting Workflows
```typescript
async startWorkflow<T>(
    flowType: string,
    input: T,
    agentFn: (input: any) => Promise<any>
): Promise<any> {
    const workflowId = `workflow_${Date.now()}_${Math.random()}`;

    // Initialize workflow tracking
    this.activeWorkflows.set(workflowId, {
        flowType,
        status: 'running',
        startTime: Date.now(),
        input: processedInput
    });

    // Process file references in messages
    const processedInput = this.processMessagesForFileReferences(input);

    // Execute workflow with iteration limits
    let iterationCount = 0;
    while (iterationCount < 5) { // Prevent infinite loops
        const result = await agentFn(currentInput);

        // Handle user selections and workflow continuation
        if (result?.type === 'user_selection_needed') {
            const selectedOption = await this.requestUserSelection(workflowId, result.selectionOptions);
            // Continue workflow with selection
        }

        // Handle metadata selections
        if (result?.requiresSelection) {
            const selectedItems = await this.requestSelection(workflowId, result.selectionOptions);
            // Continue workflow with selected items
        }

        // Check completion conditions
        if (noMoreSelectionsNeeded) {
            break;
        }
    }

    return finalResult;
}
```

#### Workflow States
- **running**: Active execution
- **paused**: Waiting for user input
- **completed**: Successfully finished
- **error**: Failed execution

### 2. UI State Coordination

#### Centralized State Management
```typescript
class WorkflowOrchestrator {
    private currentUIState: WorkflowUIState = {
        showQueryInput: true,
        queryText: '',
        queryEnabled: true,
        showProcessing: false,
        showResults: false,
        showChart: false,
        showSelection: false,
        selectionOptions: [],
        conversation: [],
        showConversation: true
    };

    // Update UI state and notify callbacks
    updateUIState(updates: Partial<WorkflowUIState>) {
        this.currentUIState = { ...this.currentUIState, ...updates };
        this.uiCallbacks?.onUIStateChange(this.currentUIState);
    }
}
```

#### State Transitions
The orchestrator manages complex UI state transitions:

- **Query Input** ↔ **Processing** ↔ **Results/Chart/Selection**
- **Linear workflows**: Query → Processing → Results
- **Interactive workflows**: Query → Processing → Selection → Continue
- **Error states**: Any state → Error display → Recovery options

### 3. Conversation Management

#### Message Threading
```typescript
// Add messages with threading support
addAssistantMessage(content: string, type: string, data?: any, threadId?: string) {
    const finalThreadId = threadId || this.getCurrentThreadId();

    const message: ConversationMessage = {
        id: `msg_${Date.now()}`,
        timestamp: Date.now(),
        role: 'assistant',
        content,
        data,
        type,
        threadId: finalThreadId
    };

    this.updateUIState({
        conversation: [...this.currentUIState.conversation, message]
    });
}
```

#### Specialized Rendering Methods
```typescript
// Search results rendering
requestSearchRender(searchResult: any, originalQuery: string) {
    const totalResults = this.calculateTotalResults(cleanSearchResult);
    const content = `Found ${totalResults} metadata items matching "${originalQuery}"`;

    const messageData = {
        ...cleanSearchResult,
        displayType: 'search_results',
        originalQuery,
        totalResults
    };

    this.addAssistantMessage(content, 'response', messageData);
}

// Data entry results rendering
requestDataEntryRender(dataEntryResult: any, originalQuery: string) {
    // Handle various data entry result types
    if (dataEntryResult.type === 'data_grid') {
        const content = `Data grid loaded with ${dataEntryResult.data.rows?.length || 0} rows`;
        this.addAssistantMessage(content, 'data_grid', dataEntryResult.data);
    }
}
```

### 4. File Management System

#### File Registry
```typescript
interface FileRegistryEntry {
    id: string;
    name: string;
    size: number;
    type: string;
    content: Uint8Array | string;
    isBinary: boolean;
    uploadedAt: number;
    lastAccessed?: number;
}

class WorkflowOrchestrator {
    private fileRegistry = new Map<string, FileRegistryEntry>();
    private currentFileId: string | null = null;

    registerFile(fileId: string, content: Uint8Array | string, metadata: FileMetadata) {
        const entry: FileRegistryEntry = {
            id: fileId,
            ...metadata,
            content,
            uploadedAt: Date.now()
        };
        this.fileRegistry.set(fileId, entry);
    }
}
```

#### Message Processing for Files
```typescript
processMessagesForFileReferences(messages: any[]): any[] {
    return messages.map(message => {
        if (message.role === 'user' && message.content?.includes('File:')) {
            // Extract file content and create registry entry
            const fileId = `file_${Date.now()}`;
            const fileEntry = this.extractFileFromMessage(message);

            this.registerFile(fileId, fileEntry.content, fileEntry.metadata);

            // Replace file content with reference
            return {
                ...message,
                content: message.content.replace(/File:.*Content:[\s\S]*$/, `file:${fileId}`),
                attachments: [{
                    id: fileId,
                    name: fileEntry.metadata.name,
                    type: fileEntry.metadata.type,
                    size: fileEntry.metadata.size
                }]
            };
        }
        return message;
    });
}
```

### 5. Progress Tracking

#### Workflow Progress Management
```typescript
interface WorkflowProgress {
    workflowId: string;
    steps: WorkflowStep[];
    overallProgress: number;
    currentStep?: string;
    startTime: number;
    estimatedTimeRemaining?: number;
}

interface WorkflowStep {
    id: string;
    label: string;
    description?: string;
    status: 'pending' | 'active' | 'completed' | 'error';
    progress?: number;
    startTime?: number;
    endTime?: number;
    error?: string;
}
```

#### Progress Updates
```typescript
// Update step progress
updateStepProgress(workflowId: string, stepId: string, updates: Partial<WorkflowStep>) {
    const workflow = this.activeWorkflows.get(workflowId);
    if (workflow?.progress) {
        const stepIndex = workflow.progress.steps.findIndex(step => step.id === stepId);
        if (stepIndex >= 0) {
            workflow.progress.steps[stepIndex] = {
                ...workflow.progress.steps[stepIndex],
                ...updates
            };

            // Recalculate overall progress
            this.recalculateOverallProgress(workflow.progress);
        }
    }
}
```

### 6. Error Classification & Recovery

#### LLM-Powered Error Analysis
```typescript
async classifyError(error: any, context?: any): Promise<ClassifiedError> {
    // Use LLM classification service for intelligent error analysis
    const errorClassification = await llmClassificationService.classifyError(error);

    // Map to internal error types
    const classification = this.mapLLMClassification(errorClassification);

    // Generate recovery strategies
    const recoveryStrategies = errorClassification.suggestedActions?.map(action => ({
        id: `llm_recovery_${index}`,
        name: action,
        description: action,
        action: action.toLowerCase().replace(/\s+/g, '_'),
        priority: index + 1
    })) || this.generateRecoveryStrategies(classification, severity, context);

    return {
        originalError: error,
        classification,
        severity,
        errorCode,
        userMessage,
        technicalMessage,
        recoveryStrategies,
        context: context || {}
    };
}
```

#### Error Categories
- **recoverable**: Network issues, authentication problems, validation errors
- **non-recoverable**: Server errors, critical failures
- **partial-success**: Some operations succeeded, others failed

### 7. Selection Management

#### User Selection Workflows
```typescript
async requestSelection(workflowId: string, options: SelectionOptions[], multiple = true): Promise<SelectionOptions[]> {
    return new Promise((resolve, reject) => {
        if (!this.uiCallbacks?.onSelection) {
            reject(new Error('No UI callbacks registered'));
            return;
        }

        // Add selection prompt to conversation
        const selectionMessage = `Please select relevant items from ${options.length} options`;
        this.addAssistantMessage(selectionMessage, 'selection', {
            selectionOptions: options,
            allowMultiple: multiple,
            workflowId
        });

        // Update UI for selection
        this.updateUIState({
            showProcessing: false,
            showSelection: true,
            selectionOptions: options,
            selectionMultiple: multiple
        });

        // Wait for user selection callback
        this.uiCallbacks.onSelection(options, (selectedItems) => {
            this.updateUIState({
                showSelection: false,
                selectionOptions: []
            });
            resolve(selectedItems);
        });
    });
}
```

### 8. Agent Function Routing

#### Dynamic Agent Loading
```typescript
private getAgentFunction(agentName: string): any {
    switch (agentName) {
        case 'direct_search':
            return async (input: any) => {
                const { searchAgent } = await import('../agents/search-agent');
                return searchAgent.invoke(input);
            };
        case 'analytics_routing':
            return async (input: any) => {
                const { analyticsGraphAgent } = await import('../agents/analytics-graph-agent');
                return analyticsGraphAgent.invoke(input);
            };
        // ... other agents
    }
}
```

## 🔄 Integration Patterns

### Agent Communication
All agents receive the orchestrator instance for:
- **Progress updates**: `orchestrator.addProgressMessage()`
- **UI state changes**: Direct access to updateUIState
- **File access**: `orchestrator.getCurrentFile()`
- **Conversation management**: `orchestrator.addAssistantMessage()`

### Callback System
The orchestrator uses callbacks for UI integration:
```typescript
registerCallbacks({
    onUIStateChange: (newState) => updateReactState(newState),
    onSelection: (options, callback) => showSelectionModal(options, callback),
    onChartRender: (chartData) => renderChart(chartData),
    onWorkflowStart: (id, type) => showWorkflowIndicator(id, type),
    onWorkflowComplete: (id, result) => hideWorkflowIndicator(id),
    onWorkflowError: (id, error) => showErrorModal(error)
});
```

### State Synchronization
- **Single source of truth**: Orchestrator maintains all UI state
- **Reactive updates**: UI components respond to state changes
- **Consistency guarantee**: All state changes go through orchestrator

## 📊 Advanced Features

### Workflow Persistence
```typescript
// Save workflow state for recovery
async saveWorkflowState(workflowId: string) {
    const workflow = this.activeWorkflows.get(workflowId);
    const workflowState = {
        workflowId,
        flowType: workflow.flowType,
        status: workflow.status,
        input: workflow.input,
        progress: workflow.progress,
        savedAt: Date.now()
    };

    localStorage.setItem(`workflow_${workflowId}`, JSON.stringify(workflowState));
}

// Resume from saved state
async resumeFromSavedState(workflowId: string) {
    const savedState = await this.loadWorkflowState(workflowId);
    // Restore workflow and continue execution
}
```

### Progress Checkpointing
```typescript
addProgressCheckpoint(workflowId: string, checkpointId: string, data?: any) {
    // Save progress at key workflow stages
    // Enable resuming from checkpoints
}
```

### Conversation History Management
```typescript
// Load conversation from persistent storage
loadConversationFromStorage() {
    const recentContext = conversationContext.getRecentContext(20);
    const messages = recentContext.map(entry => ({
        id: `user_${entry.id}`,
        timestamp: entry.timestamp,
        role: 'user',
        content: entry.query,
        type: 'query'
    }));

    this.updateUIState({ conversation: messages });
}
```

## 🎯 Usage Examples

### Complete Workflow Execution
```typescript
// 1. User submits query
const workflowId = await orchestrator.startWorkflow(
    'analytics_routing',
    { input: { messages: userMessages } },
    analyticsAgent
);

// 2. Orchestrator manages UI state transitions
// - Show processing indicator
// - Handle user selections if needed
// - Update progress messages

// 3. Workflow completes
// - Hide processing indicator
// - Display results
// - Add completion message to conversation
```

### Interactive Data Entry Flow
```typescript
// 1. Start CSV processing workflow
await orchestrator.startWorkflow('data_entry', { input: csvData }, aggregateAgent);

// 2. Orchestrator handles file processing
// - Registers uploaded file
// - Shows progress messages
// - Presents data grid for review

// 3. User interacts with data grid
// - Edits cells, deletes rows, resolves names
// - Orchestrator updates conversation and UI

// 4. User confirms submission
// - Orchestrator submits to DHIS2
// - Shows success/failure feedback
```

### Error Recovery Flow
```typescript
// 1. Workflow encounters error
// - Orchestrator classifies error using LLM
// - Presents recovery options to user

// 2. User selects recovery action
// - "Retry with different parameters"
// - "Switch to manual entry"
// - "Contact support"

// 3. Orchestrator executes recovery
// - Resumes workflow with new parameters
// - Changes to alternative workflow type
// - Shows support contact information
```

## 🔍 Debugging & Monitoring

### Key Logging Points
- Workflow start/completion with timing
- UI state transitions
- File registration and access
- Agent function routing
- Error classification and recovery

### Common Issues
- **State synchronization**: UI not updating after orchestrator changes
- **Callback registration**: Missing UI callbacks causing selection failures
- **File reference issues**: Broken links between messages and file registry
- **Workflow loops**: Infinite iterations from improper completion conditions

## 🚀 Extension Points

### Adding New Agent Types
1. Add agent routing case in `getAgentFunction()`
2. Define workflow type in router agent
3. Implement progress tracking for new workflows
4. Add specialized result rendering if needed

### Custom UI States
- Extend `WorkflowUIState` interface
- Add new state management in orchestrator
- Update callback interfaces
- Implement UI component responses

### Enhanced Error Handling
- Add new error classification categories
- Implement custom recovery strategies
- Extend LLM error analysis prompts
- Add domain-specific error handling

---

The Workflow Orchestrator serves as the sophisticated central coordinator that enables complex multi-agent, multi-step workflows with seamless user interaction, robust error handling, and consistent state management across the entire DHIS2 AI Suite application.
