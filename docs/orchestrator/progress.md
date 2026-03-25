# 📊 Progress Tracking - Workflow Lifecycle Management

## Overview

The Progress Tracking system provides comprehensive workflow lifecycle management with real-time progress indication, checkpoint persistence, and recovery capabilities. It enables users to monitor long-running operations, resume interrupted workflows, and maintain state across sessions.

**File Location**: `src/utils/workflow-orchestrator.ts`

**Key Features**:
- Step-by-step progress indication
- Workflow state persistence and recovery
- Checkpoint-based resumption
- Real-time progress updates

---

## 🏗️ **Progress Tracking Architecture**

### Core Interfaces

#### WorkflowStep Interface
```typescript
interface WorkflowStep {
    id: string;
    label: string;
    description?: string;
    status: 'pending' | 'active' | 'completed' | 'error';
    progress?: number;        // 0-100 for individual steps
    startTime?: number;
    endTime?: number;
    error?: string;
}
```

#### WorkflowProgress Interface
```typescript
interface WorkflowProgress {
    workflowId: string;
    steps: WorkflowStep[];
    overallProgress: number;           // 0-100 across all steps
    currentStep?: string;
    startTime: number;
    estimatedTimeRemaining?: number;
}
```

#### Workflow State Management
```typescript
interface WorkflowState {
    workflowId: string;
    flowType: string;
    status: 'running' | 'paused' | 'completed' | 'error';
    input: any;
    progress?: WorkflowProgress;
    recoveryState?: any;
    checkpoints?: Map<string, Checkpoint>;
    intermediateResults?: Map<string, IntermediateResult>;
    pauseReason?: string;
    pausedAt?: number;
    startTime: number;
    error?: any;
}
```

---

## 📈 **Progress Management Methods**

### Workflow Initialization

#### `initializeWorkflowProgress()`
```typescript
initializeWorkflowProgress(workflowId: string, steps: WorkflowStep[]): WorkflowProgress
```
- **Purpose**: Set up progress tracking for a new workflow
- **Parameters**:
  - `workflowId`: Unique workflow identifier
  - `steps`: Array of workflow steps with metadata
- **Returns**: Complete progress tracking object
- **Integration**: Automatically calculates overall progress

#### Usage Example
```typescript
const progress = workflowOrchestrator.initializeWorkflowProgress('workflow_123', [
    { id: 'upload', label: 'Upload Document', description: 'Processing file upload' },
    { id: 'extract', label: 'Extract Data', description: 'OCR and data extraction' },
    { id: 'validate', label: 'Validate Data', description: 'Data quality checks' },
    { id: 'submit', label: 'Submit to DHIS2', description: 'Final data submission' }
]);
```

### Step Progress Updates

#### `updateStepProgress()`
```typescript
updateStepProgress(workflowId: string, stepId: string, updates: Partial<WorkflowStep>): void
```
- **Purpose**: Update progress for individual workflow steps
- **Parameters**:
  - `workflowId`: Target workflow identifier
  - `stepId`: Specific step to update
  - `updates`: Partial step updates (status, progress, error, etc.)
- **Effects**: Automatically recalculates overall workflow progress

#### Step Lifecycle Methods
```typescript
// Start a step
startStep(workflowId: string, stepId: string): void

// Complete a step successfully
completeStep(workflowId: string, stepId: string): void

// Mark step as failed with error
errorStep(workflowId: string, stepId: string, error: string): void
```

#### Usage Patterns
```typescript
// Start processing step
orchestrator.startStep('workflow_123', 'extract');

// Update progress during processing
orchestrator.updateStepProgress('workflow_123', 'extract', {
    progress: 75,
    description: 'Processing page 3 of 4...'
});

// Complete step successfully
orchestrator.completeStep('workflow_123', 'extract');

// Or mark as error
orchestrator.errorStep('workflow_123', 'extract', 'OCR service unavailable');
```

### Progress Retrieval

#### `getWorkflowProgress()`
```typescript
getWorkflowProgress(workflowId: string): WorkflowProgress | null
```
- **Purpose**: Retrieve current progress for a workflow
- **Returns**: Complete progress state or null if not found

#### Real-time Progress Monitoring
```typescript
// Poll for progress updates
const progressInterval = setInterval(() => {
    const progress = orchestrator.getWorkflowProgress('workflow_123');
    if (progress) {
        updateProgressUI(progress);
        if (progress.overallProgress >= 100) {
            clearInterval(progressInterval);
        }
    }
}, 1000);
```

---

## 💾 **Checkpoint & Persistence System**

### Checkpoint Management

#### `addProgressCheckpoint()`
```typescript
addProgressCheckpoint(workflowId: string, checkpointId: string, data?: any): void
```
- **Purpose**: Create recovery points at critical workflow stages
- **Parameters**:
  - `workflowId`: Target workflow
  - `checkpointId`: Unique checkpoint identifier
  - `data`: Optional checkpoint-specific data
- **Effects**: Automatically persists workflow state

#### Checkpoint Structure
```typescript
interface Checkpoint {
    id: string;
    timestamp: number;
    data: any;                    // Checkpoint-specific data
    progress: WorkflowProgress;   // Progress state at checkpoint
}
```

#### Usage in Workflows
```typescript
// Add checkpoint after data validation
orchestrator.addProgressCheckpoint('workflow_123', 'data_validated', {
    validatedRecords: records.length,
    validationRules: appliedRules
});

// Add checkpoint before final submission
orchestrator.addProgressCheckpoint('workflow_123', 'ready_for_submission', {
    finalData: processedData,
    targetDataSet: dataSetId
});
```

### Recovery from Checkpoints

#### `resumeFromCheckpoint()`
```typescript
resumeFromCheckpoint(workflowId: string, checkpointId: string): Promise<any>
```
- **Purpose**: Resume workflow execution from a specific checkpoint
- **Process**:
  1. Restore workflow progress state
  2. Load checkpoint data
  3. Continue workflow from checkpoint
- **Returns**: Workflow execution result

#### Checkpoint Discovery
```typescript
getWorkflowCheckpoints(workflowId: string): CheckpointInfo[]
```
- **Purpose**: List available checkpoints for recovery
- **Returns**: Array of checkpoint metadata

#### Recovery Workflow
```typescript
// List available checkpoints
const checkpoints = orchestrator.getWorkflowCheckpoints('workflow_123');

// User selects checkpoint
const selectedCheckpoint = checkpoints.find(cp => cp.id === 'data_validated');

// Resume from checkpoint
const result = await orchestrator.resumeFromCheckpoint('workflow_123', selectedCheckpoint.id);
```

---

## 🔄 **Workflow Pause & Resume**

### Pause Functionality

#### `pauseWorkflow()`
```typescript
pauseWorkflow(workflowId: string, reason?: string): void
```
- **Purpose**: Temporarily halt workflow execution
- **Use Cases**: User interaction required, resource unavailability
- **Effects**: Preserves current state for later resumption

#### Pause Scenarios
```typescript
// Pause for user input
orchestrator.pauseWorkflow('workflow_123', 'User selection required');

// Pause for external dependency
orchestrator.pauseWorkflow('workflow_123', 'Waiting for DHIS2 API availability');
```

### Resume Capabilities

#### `resumeWorkflow()`
```typescript
resumeWorkflow(workflowId: string, resumeData?: any): Promise<any>
```
- **Purpose**: Continue paused workflow execution
- **Parameters**:
  - `workflowId`: Target workflow
  - `resumeData`: Optional data for resumption (user input, resolved dependencies)
- **Returns**: Workflow execution result

#### Resumable Workflow Discovery
```typescript
getResumableWorkflows(): ResumableWorkflow[]
```
- **Purpose**: Find workflows that can be resumed
- **Returns**: Workflows in paused state with recovery metadata

#### Complete Pause/Resume Flow
```typescript
// Workflow pauses for user input
orchestrator.pauseWorkflow('workflow_123', 'Dataset selection required');

// User provides input
const userSelection = await requestUserSelection();

// Resume with user data
const result = await orchestrator.resumeWorkflow('workflow_123', {
    selectedDataset: userSelection
});
```

---

## 💽 **State Persistence**

### Auto-Save Functionality

#### `saveWorkflowState()`
```typescript
saveWorkflowState(workflowId: string): Promise<void>
```
- **Purpose**: Persist workflow state to storage
- **Storage**: localStorage (production would use database)
- **Data**: Complete workflow state including progress and checkpoints

#### Auto-Save Enablement
```typescript
enableAutoSave(workflowId: string, intervalMs?: number): () => void
```
- **Purpose**: Enable periodic automatic state saving
- **Parameters**:
  - `intervalMs`: Save interval (default: 30 seconds)
- **Returns**: Cleanup function to disable auto-save

#### Auto-Save Implementation
```typescript
// Enable auto-save for long-running workflow
const disableAutoSave = orchestrator.enableAutoSave('workflow_123', 30000);

// ... workflow execution ...

// Disable when complete
disableAutoSave();
```

### State Restoration

#### `loadWorkflowState()`
```typescript
loadWorkflowState(workflowId: string): Promise<WorkflowState>
```
- **Purpose**: Restore workflow from persistent storage
- **Returns**: Complete workflow state for resumption

#### Resume from Saved State
```typescript
resumeFromSavedState(workflowId: string): Promise<any>
```
- **Purpose**: Completely restore and continue workflow execution
- **Process**:
  1. Load saved state
  2. Restore to active workflows
  3. Continue execution

#### Saved State Discovery
```typescript
getResumableWorkflowsFromStorage(): SavedWorkflow[]
```
- **Purpose**: Find workflows saved in persistent storage
- **Returns**: Metadata for saved workflow states

---

## 📦 **Intermediate Results Storage**

### Result Management

#### `storeIntermediateResult()`
```typescript
storeIntermediateResult(workflowId: string, resultId: string, result: any): void
```
- **Purpose**: Store partial results for recovery or reuse
- **Use Cases**: Large dataset processing, multi-stage validation

#### Result Retrieval
```typescript
getIntermediateResults(workflowId: string): IntermediateResult[]
```
- **Purpose**: Access stored intermediate results
- **Returns**: Array of result metadata with timestamps

#### Intermediate Result Structure
```typescript
interface IntermediateResult {
    id: string;
    timestamp: number;
    data: any;  // Result payload
}
```

### Usage Patterns

#### Batch Processing with Results
```typescript
// Store results after each batch
for (let i = 0; i < batches.length; i++) {
    const batchResult = await processBatch(batches[i]);
    orchestrator.storeIntermediateResult('workflow_123', `batch_${i}`, batchResult);

    // Update progress
    orchestrator.updateStepProgress('workflow_123', 'process_data', {
        progress: ((i + 1) / batches.length) * 100
    });
}

// Combine results for final output
const allResults = orchestrator.getIntermediateResults('workflow_123');
const finalResult = combineBatchResults(allResults);
```

---

## 🧹 **Maintenance & Cleanup**

### Garbage Collection

#### `cleanupOldSavedStates()`
```typescript
cleanupOldSavedStates(maxAge?: number): void
```
- **Purpose**: Remove old saved workflow states
- **Parameters**:
  - `maxAge`: Maximum age in milliseconds (default: 7 days)
- **Effects**: Cleans localStorage of expired workflow data

#### Automatic Cleanup
```typescript
// Clean up weekly
setInterval(() => {
    orchestrator.cleanupOldSavedStates(7 * 24 * 60 * 60 * 1000);
}, 24 * 60 * 60 * 1000); // Daily
```

### Resource Management

#### Active Workflow Limits
```typescript
getActiveWorkflows(): ActiveWorkflow[]
```
- **Purpose**: Monitor currently running workflows
- **Returns**: Array of active workflow metadata

#### Workflow Completion
```typescript
clearCompletedWorkflows(): void
```
- **Purpose**: Remove completed/error workflows from memory
- **Use Cases**: Memory cleanup, performance optimization

---

## 🎯 **Progress Tracking Integration**

### UI Integration Patterns

#### Progress Display Components
```jsx
// Progress bar with step indicators
<WorkflowProgress
    workflowId="workflow_123"
    showSteps={true}
    showTimeEstimate={true}
/>

// Step-by-step progress
<StepProgressIndicator
    steps={progress.steps}
    currentStep={progress.currentStep}
/>
```

#### Real-time Updates
```typescript
// Subscribe to progress updates
useEffect(() => {
    const interval = setInterval(() => {
        const progress = orchestrator.getWorkflowProgress(workflowId);
        if (progress) {
            setProgress(progress);
        }
    }, 1000);

    return () => clearInterval(interval);
}, [workflowId]);
```

### Error Recovery Integration

#### Progress-Aware Error Handling
```typescript
// Update progress on error
orchestrator.errorStep(workflowId, currentStep, error.message);

// Show recovery options with progress context
const recoveryOptions = orchestrator.createRecoveryOptions(workflowId, error);
```

### Conversation Integration

#### Progress Messages in Chat
```typescript
// Add progress updates to conversation
orchestrator.addProgressMessage(
    `Processing step ${currentStep + 1} of ${totalSteps}: ${stepLabel}`
);
```

#### Completion Notifications
```typescript
// Notify on workflow completion
orchestrator.addAssistantMessage(
    `✅ Workflow completed successfully in ${duration}s`,
    'response',
    { workflowId, duration, result }
);
```

---

## 🔍 **Monitoring & Debugging**

### Progress State Inspection
```typescript
// Log detailed progress state
console.log('Workflow Progress:', {
    workflowId,
    overallProgress: progress.overallProgress,
    currentStep: progress.currentStep,
    steps: progress.steps.map(step => ({
        id: step.id,
        status: step.status,
        progress: step.progress,
        duration: step.endTime ? step.endTime - (step.startTime || 0) : null
    })),
    estimatedTimeRemaining: progress.estimatedTimeRemaining
});
```

### Performance Metrics
```typescript
// Track progress update performance
const updateStart = performance.now();
orchestrator.updateStepProgress(workflowId, stepId, updates);
const updateTime = performance.now() - updateStart;

console.log(`Progress update took ${updateTime.toFixed(2)}ms`);
```

### Checkpoint Validation
```typescript
// Verify checkpoint integrity
const checkpoints = orchestrator.getWorkflowCheckpoints(workflowId);
checkpoints.forEach(checkpoint => {
    if (!checkpoint.progress || !checkpoint.timestamp) {
        console.warn(`Invalid checkpoint: ${checkpoint.id}`);
    }
});
```

---

## 🚀 **Advanced Features**

### Time Estimation

#### Automatic Time Estimation
```typescript
// Calculate estimated completion time
private calculateEstimatedTime(progress: WorkflowProgress): number {
    if (!progress.startTime || progress.overallProgress <= 0) return 0;

    const elapsed = Date.now() - progress.startTime;
    const estimatedTotal = (elapsed / progress.overallProgress) * 100;
    return Math.max(0, estimatedTotal - elapsed);
}
```

#### Progress Rate Analysis
```typescript
// Analyze progress velocity
private getProgressVelocity(progress: WorkflowProgress): number {
    const recentSteps = progress.steps.filter(step =>
        step.endTime && (Date.now() - step.endTime) < 60000 // Last minute
    );

    if (recentSteps.length === 0) return 0;

    const recentProgress = recentSteps.reduce((sum, step) => {
        const stepDuration = step.endTime! - (step.startTime || step.endTime!);
        return sum + (stepDuration > 0 ? 100 / stepDuration : 0);
    }, 0);

    return recentProgress / recentSteps.length;
}
```

### Predictive Analytics

#### Failure Prediction
```typescript
// Predict potential workflow failures
predictWorkflowFailure(workflowId: string): FailurePrediction {
    const progress = this.getWorkflowProgress(workflowId);
    const velocity = this.getProgressVelocity(progress);

    // Simple heuristics for failure prediction
    if (velocity < 0.1 && progress.overallProgress > 50) {
        return {
            risk: 'high',
            reason: 'Progress velocity significantly decreased',
            suggestedAction: 'Check system resources'
        };
    }

    return { risk: 'low' };
}
```

### Workflow Analytics

#### Performance Tracking
```typescript
// Track workflow completion statistics
interface WorkflowStats {
    workflowId: string;
    totalDuration: number;
    stepDurations: Record<string, number>;
    success: boolean;
    retryCount: number;
    checkpointUsage: number;
}

// Store workflow statistics for analysis
storeWorkflowStats(workflowId: string): void {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) return;

    const stats: WorkflowStats = {
        workflowId,
        totalDuration: Date.now() - (workflow.startTime || 0),
        stepDurations: {},
        success: workflow.status === 'completed',
        retryCount: workflow.retryCount || 0,
        checkpointUsage: workflow.checkpoints?.size || 0
    };

    // Calculate step durations
    workflow.progress?.steps.forEach(step => {
        if (step.startTime && step.endTime) {
            stats.stepDurations[step.id] = step.endTime - step.startTime;
        }
    });

    // Store for analytics (would go to database in production)
    console.log('Workflow completed:', stats);
}
```

---

## 📋 **Usage Examples**

### Complete Workflow with Progress Tracking
```typescript
// Initialize workflow progress
const progress = orchestrator.initializeWorkflowProgress('doc_processing_123', [
    { id: 'upload', label: 'Upload Document', description: 'File validation and storage' },
    { id: 'extract', label: 'Extract Text', description: 'OCR processing' },
    { id: 'parse', label: 'Parse Data', description: 'Extract structured data' },
    { id: 'validate', label: 'Validate', description: 'Data quality checks' },
    { id: 'submit', label: 'Submit', description: 'Send to DHIS2' }
]);

// Enable auto-save
const disableAutoSave = orchestrator.enableAutoSave('doc_processing_123');

// Execute workflow steps
try {
    orchestrator.startStep('doc_processing_123', 'upload');
    await uploadDocument(file);
    orchestrator.completeStep('doc_processing_123', 'upload');

    orchestrator.startStep('doc_processing_123', 'extract');
    const extractedData = await performOCR(file);
    orchestrator.addProgressCheckpoint('doc_processing_123', 'ocr_complete', extractedData);
    orchestrator.completeStep('doc_processing_123', 'extract');

    // ... continue with other steps ...

    orchestrator.startStep('doc_processing_123', 'submit');
    await submitToDHIS2(finalData);
    orchestrator.completeStep('doc_processing_123', 'submit');

} catch (error) {
    orchestrator.errorStep('doc_processing_123', 'submit', error.message);
    throw error;
} finally {
    disableAutoSave();
}
```

### Recovery from Saved State
```typescript
// Find resumable workflows
const resumableWorkflows = orchestrator.getResumableWorkflowsFromStorage();

// Resume specific workflow
const workflowToResume = resumableWorkflows.find(w => w.id === 'doc_processing_123');
if (workflowToResume) {
    const result = await orchestrator.resumeFromSavedState('doc_processing_123');
    console.log('Workflow resumed:', result);
}
```

### Checkpoint-Based Recovery
```typescript
// List available checkpoints
const checkpoints = orchestrator.getWorkflowCheckpoints('doc_processing_123');

// Resume from most recent checkpoint
const latestCheckpoint = checkpoints.sort((a, b) => b.timestamp - a.timestamp)[0];
if (latestCheckpoint) {
    const result = await orchestrator.resumeFromCheckpoint('doc_processing_123', latestCheckpoint.id);
    console.log('Resumed from checkpoint:', result);
}
```

---

The Progress Tracking system provides robust workflow lifecycle management with real-time monitoring, persistence, and recovery capabilities, ensuring reliable execution of complex, long-running operations in the DHIS2 AI Suite.
