# 🚨 Error Handling & Recovery - Orchestrator Integration

## Overview

The Error Handling & Recovery system in the Workflow Orchestrator provides intelligent error classification, automated recovery strategies, and user-guided error resolution. It transforms raw errors into actionable user experiences while maintaining workflow continuity and providing multiple recovery pathways.

**File Location**: `src/utils/workflow-orchestrator.ts`

**Key Responsibilities**:
- Error classification and severity assessment
- Automated recovery strategy generation
- User-guided error resolution workflows
- Workflow state preservation during errors
- Error persistence and recovery resumption

## 🏗️ Architecture

### Error Classification System

#### Error Types
```typescript
export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';
export type ErrorClassification = 'recoverable' | 'non-recoverable' | 'partial-success';
```

#### Classified Error Structure
```typescript
export interface ClassifiedError {
    originalError: any;
    classification: ErrorClassification;
    severity: ErrorSeverity;
    errorCode?: string;
    userMessage: string;
    technicalMessage: string;
    recoveryStrategies: RecoveryStrategy[];
    context: {
        workflowId?: string;
        stepId?: string;
        agent?: string;
        operation?: string;
    };
}
```

### Recovery Strategy Framework

#### Recovery Strategy Interface
```typescript
export interface RecoveryStrategy {
    id: string;
    name: string;
    description: string;
    action: string;
    priority: number; // 1 = highest priority
    requiresUserInput: boolean;
    automated: boolean;
}
```

## 🔄 Error Classification Process

### LLM-Powered Classification

#### Intelligent Error Analysis
```typescript
async classifyError(error: any, context?: ErrorContext): Promise<ClassifiedError>
```
- **Multilingual Support**: Analyzes errors in multiple languages
- **Context Awareness**: Considers workflow state and operation context
- **Pattern Recognition**: Identifies common error patterns and solutions

#### Classification Categories

##### Recoverable Errors
- **Network Issues**: Connection timeouts, API unavailability
- **Authentication**: Token expiration, permission issues
- **Validation**: Input format errors, missing required fields
- **Resource Not Found**: Missing metadata, invalid references

##### Non-Recoverable Errors
- **Server Errors**: 5xx status codes, system failures
- **Critical Failures**: Data corruption, security violations
- **Configuration Issues**: Invalid system setup

##### Partial Success
- **Batch Operations**: Some items succeed, others fail
- **Incomplete Processing**: Partial data processing completion

### Fallback Classification

#### Keyword-Based Analysis
```typescript
private classifyErrorType(error: any, message: string, code: string): ErrorClassification
```
- **Pattern Matching**: Searches for known error patterns
- **HTTP Status Codes**: Maps status codes to classifications
- **Error Message Analysis**: Extracts meaning from error text

## 🎯 Recovery Strategy Generation

### Automated Strategy Selection

#### Priority-Based Ordering
```typescript
private generateRecoveryStrategies(
    classification: ErrorClassification,
    severity: ErrorSeverity,
    context?: any
): RecoveryStrategy[]
```

#### Common Recovery Strategies

##### Retry Operations
- **Immediate Retry**: Automatic retry for transient failures
- **Exponential Backoff**: Progressive delay for repeated failures
- **Conditional Retry**: Retry based on error type and context

##### User-Guided Recovery
- **Manual Data Entry**: Switch to manual input mode
- **Alternative Approaches**: Suggest different operation methods
- **Contact Support**: Provide support contact information

##### Workflow-Specific Recovery
- **Checkpoint Recovery**: Resume from last successful state
- **Partial Processing**: Continue with successful items only
- **State Reset**: Clean restart for corrupted workflows

### Context-Aware Strategies

#### Workflow Context Integration
- **Operation Type**: Different strategies for CRUD vs. analytics operations
- **Data Sensitivity**: Adjusted approaches for sensitive data handling
- **User Permissions**: Recovery options based on user access levels

## 🔄 Recovery Execution

### Strategy Execution Framework

#### Automated Recovery
```typescript
async executeRecoveryAction(
    workflowId: string,
    actionId: string,
    actionData?: any
): Promise<any>
```

#### Supported Recovery Actions
- **retry**: Restart the operation with same parameters
- **resume**: Continue paused workflow
- **checkpoint_recovery**: Restore from saved checkpoint
- **manual_data_entry**: Switch to manual input mode
- **skip_failed**: Continue with successful items only
- **contact_support**: Display support information

### User Interaction Integration

#### Selection Interface
- **Strategy Presentation**: User-friendly recovery option display
- **Context Information**: Clear explanation of each option
- **Guided Selection**: Recommendations based on error severity

#### Workflow Continuation
- **State Preservation**: Maintains workflow context during recovery
- **Parameter Adjustment**: Modifies inputs based on recovery strategy
- **Progress Reset**: Appropriate progress indication for recovery

## 📊 Error Persistence & Recovery

### Workflow State Preservation

#### Error State Storage
```typescript
storeWorkflowState(workflowId: string, state: any): void
```
- **Checkpoint Creation**: Saves workflow state at key points
- **Error Context**: Preserves error information for recovery
- **Recovery Metadata**: Stores available recovery options

#### Persistent Storage
- **LocalStorage Integration**: Browser-based state persistence
- **Automatic Cleanup**: Removes old saved states
- **Version Management**: Handles state format compatibility

### Recovery State Management

#### Checkpoint System
```typescript
addProgressCheckpoint(workflowId: string, checkpointId: string, data?: any): void
```
- **Automatic Checkpoints**: Saves state at workflow milestones
- **Manual Checkpoints**: User-triggered state preservation
- **Recovery Points**: Multiple restoration options

#### Resumable Workflows
```typescript
getResumableWorkflows(): any[]
getResumableWorkflowsFromStorage(): any[]
```
- **Active Recovery**: Lists workflows that can be resumed
- **Stored Recovery**: Retrieves saved workflow states
- **Metadata Display**: Shows recovery options and timestamps

## 🚨 Error Propagation & Display

### User Communication

#### Error Message Formatting
```typescript
handleClassifiedError(classifiedError: ClassifiedError): void
```
- **User-Friendly Messages**: Clear, actionable error descriptions
- **Severity Indicators**: Visual cues for error importance
- **Recovery Guidance**: Step-by-step resolution instructions

#### Conversation Integration
- **Error Messages**: Adds error information to conversation thread
- **Recovery Options**: Presents recovery strategies in chat
- **Progress Updates**: Maintains operation status during recovery

### Technical Error Handling

#### Error Logging
- **Technical Details**: Preserves full error information for debugging
- **Context Capture**: Records workflow and system state
- **Audit Trail**: Maintains error history for analysis

#### Error Boundaries
- **Graceful Degradation**: Continues operation when possible
- **Resource Cleanup**: Proper cleanup on error conditions
- **State Consistency**: Maintains system integrity during errors

## 📈 Performance & Reliability

### Error Processing Optimization

#### Efficient Classification
- **LLM Call Optimization**: Minimizes AI service calls
- **Caching**: Reuses classifications for similar errors
- **Batch Processing**: Handles multiple errors efficiently

#### Memory Management
- **State Cleanup**: Removes unnecessary error state
- **Resource Limits**: Prevents error handling from consuming excessive resources
- **Timeout Handling**: Prevents hanging recovery operations

### Reliability Features

#### Fallback Mechanisms
- **LLM Fallback**: Keyword-based classification when AI fails
- **Recovery Fallback**: Manual intervention when automated recovery fails
- **Progressive Degradation**: Reduced functionality during high error rates

## 🔧 Integration Points

### Agent Error Handling

#### Agent Communication
- **Error Propagation**: Standardized error reporting from agents
- **Context Enrichment**: Adds agent-specific error context
- **Recovery Coordination**: Agent-aware recovery strategies

### UI State Management

#### Error Display
- **Toast Notifications**: Immediate error feedback
- **Modal Dialogs**: Detailed error information and recovery options
- **Progress Indicators**: Error state visualization

### Conversation System

#### Error Messages
- **Thread Integration**: Errors become part of conversation flow
- **Context Preservation**: Maintains conversation continuity
- **Recovery Tracking**: Tracks recovery attempts in conversation

## 📋 Usage Examples

### Automatic Error Recovery
```typescript
try {
    const result = await agent.invoke(input);
} catch (error) {
    const classifiedError = await orchestrator.classifyError(error, {
        workflowId: 'workflow_123',
        agent: 'metadata_agent'
    });

    // Automatic retry for recoverable errors
    if (classifiedError.classification === 'recoverable') {
        return orchestrator.executeRecoveryAction('workflow_123', 'retry');
    }
}
```

### User-Guided Recovery
```typescript
// Error occurs during workflow
const classifiedError = await orchestrator.classifyError(error);

// Present recovery options to user
orchestrator.handleClassifiedError(classifiedError);

// User selects recovery strategy
const recoveryResult = await orchestrator.executeRecoveryAction(
    workflowId,
    selectedStrategy.id,
    userInput
);
```

### Workflow Checkpoint Recovery
```typescript
// Add checkpoint during long-running operations
orchestrator.addProgressCheckpoint(workflowId, 'data_processing_complete', {
    processedItems: 150,
    totalItems: 200
});

// On error, resume from checkpoint
const checkpoints = orchestrator.getWorkflowCheckpoints(workflowId);
await orchestrator.resumeFromCheckpoint(workflowId, 'data_processing_complete');
```

## 🔍 Debugging & Monitoring

### Error Analytics

#### Classification Metrics
- **Success Rates**: Error classification accuracy
- **Recovery Effectiveness**: Success rate of recovery strategies
- **Pattern Analysis**: Common error types and resolutions

#### Performance Monitoring
- **Response Times**: Error classification and recovery speed
- **Resource Usage**: Memory and CPU usage during error handling
- **User Experience**: Time to resolution and user satisfaction

### Common Issues

#### Classification Failures
- **LLM Unavailability**: Fallback to keyword-based classification
- **Ambiguous Errors**: Default to recoverable with user guidance
- **Context Loss**: Reduced recovery options without proper context

#### Recovery Execution Issues
- **Strategy Conflicts**: Multiple recovery strategies interfering
- **State Corruption**: Invalid workflow state after recovery
- **Resource Exhaustion**: Recovery operations consuming too many resources

## 🚀 Extension Points

### Custom Error Classifiers

#### Domain-Specific Classification
1. Implement custom classification logic for specific error types
2. Add domain-specific recovery strategies
3. Integrate with existing classification framework
4. Update LLM prompts for specialized domains

### Enhanced Recovery Strategies

#### Advanced Recovery Options
1. Implement machine learning-based recovery prediction
2. Add collaborative recovery (multiple strategy combinations)
3. Integrate with external support systems
4. Create context-aware recovery workflows

### Error Analytics Integration

#### Advanced Monitoring
1. Implement error trend analysis
2. Add predictive error prevention
3. Create error impact assessment
4. Develop automated error resolution systems

---

The Error Handling & Recovery system transforms error conditions into productive user experiences, maintaining workflow continuity while providing intelligent recovery pathways and comprehensive error management throughout the DHIS2 AI Suite.
