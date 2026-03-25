# 🎨 MessageRenderer - Intelligent Message Display System

## Overview

The MessageRenderer is the central UI component responsible for intelligently displaying different types of messages in the DHIS2 AI Suite conversation interface. It handles everything from simple text responses to complex interactive data grids, charts, and selection interfaces, providing a unified and adaptive user experience.

**File Location**: `src/components/MessageRenderer.tsx`

**Architecture**: React component with specialized rendering for 15+ message types and LLM-powered content analysis

## 🏗️ Core Architecture

### Message Type System

The MessageRenderer handles a comprehensive set of message types with unified UI feedback:

```typescript
type ConversationMessageType =
    | 'query' | 'response' | 'selection' | 'error' | 'success' | 'warning' | 'info'
    | 'progress' | 'data_grid' | 'resolution_selection' | 'data_set_selection'
    | 'tracker_data_grid' | 'tracker_processing_complete';
```

### Component Structure

#### **Main MessageRenderer Component**
```typescript
interface MessageRendererProps {
    message: ConversationMessage;
}

const MessageRenderer: FC<MessageRendererProps> = ({ message }) => {
    const isUser = message.role === 'user';

    return (
        <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: isUser ? '70%' : '85%', minWidth: '200px' }}>
                {/* Message header with timestamp and role */}
                <MessageHeader message={message} />

                {/* Enhanced message bubble */}
                <MessageBubble message={message} />
            </div>
        </div>
    );
};
```

#### **Threaded Message Renderer**
```typescript
interface ThreadedMessageRendererProps {
    messages: ConversationMessage[];
}

const ThreadedMessageRenderer: FC<ThreadedMessageRendererProps> = ({ messages }) => {
    // Groups messages by threadId and renders with visual thread indicators
    const groupedMessages = messages.reduce((groups, message) => {
        const threadId = message.threadId || 'unthreaded';
        // Group and render with thread visual indicators
    }, {});
};
```

## 🎨 Message Type Rendering

### 1. Text-Based Messages

#### **Query Messages**
```typescript
case 'query':
    return (
        <div style={{ whiteSpace: 'pre-wrap' }}>
            <ExpandableText text={message.content} maxLength={300} />
        </div>
    );
```

**Features**:
- Preserves whitespace formatting
- Expandable text for long queries
- Automatic truncation with "Read more" functionality

#### **Response Messages**
```typescript
case 'response':
    return (
        <div>
            {/* Text content */}
            <ExpandableText text={message.content} maxLength={500} />

            {/* Render results data */}
            {message.data && renderDataContent(message.data)}
        </div>
    );
```

**Features**:
- Text content with expandable sections
- Integrated data rendering for search results
- Chart embedding for analytics responses

### 2. Status Messages

#### **Error Messages**
```typescript
const ErrorMessage: FC<ErrorMessageProps> = ({ message }) => {
    const [showDetails, setShowDetails] = useState(false);
    const [showRecoveryActions, setShowRecoveryActions] = useState(false);

    return (
        <div style={{
            backgroundColor: '#ffebee',
            border: '1px solid #ef5350',
            borderRadius: '8px',
            padding: '16px',
            color: '#c62828'
        }}>
            {/* Error header with recovery actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>❌ Error: {message.content}</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <ActionButton variant="retry" size="small" onClick={handleRetry} />
                    <button onClick={() => setShowRecoveryActions(!showRecoveryActions)}>
                        {showRecoveryActions ? 'Hide Options' : 'More Options'}
                    </button>
                </div>
            </div>

            {/* Expandable recovery options */}
            {showRecoveryActions && (
                <RecoveryOptionsPanel recoveryOptions={getRecoveryActions()} />
            )}

            {/* Expandable technical details */}
            {message.data && (
                <ExpandableDetails data={message.data} />
            )}
        </div>
    );
};
```

**Features**:
- Color-coded error display
- Integrated recovery action buttons
- Expandable technical details
- Multiple recovery strategies presentation

#### **Progress Messages**
```typescript
const ProgressMessage: FC<ProgressMessageProps> = ({ message }) => {
    const progress = message.data?.progress || 0;
    const steps = message.data?.steps || [];
    const currentStep = message.data?.currentStep;

    return (
        <div style={{
            backgroundColor: '#f3e5f5',
            border: '1px solid #9c27b0',
            borderRadius: '8px',
            padding: '16px',
            color: '#4a148c'
        }}>
            {/* Progress header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🔄</span>
                <span>{message.content}</span>
                <span style={{ marginLeft: 'auto' }}>{Math.round(progress)}%</span>
            </div>

            {/* Progress bar */}
            <div style={{ marginBottom: '16px' }}>
                <div style={{
                    width: '100%', height: '8px',
                    backgroundColor: '#e0e0e0', borderRadius: '4px'
                }}>
                    <div style={{
                        width: `${progress}%`, height: '100%',
                        backgroundColor: '#9c27b0',
                        transition: 'width 0.5s ease'
                    }} />
                </div>
            </div>

            {/* Step-by-step progress */}
            {steps.length > 0 && (
                <StepProgressIndicator steps={steps} currentStep={currentStep} />
            )}
        </div>
    );
};
```

**Features**:
- Visual progress bars with smooth animations
- Step-by-step progress indicators
- Real-time progress updates
- Estimated completion times

#### **Success/Warning/Info Messages**
```typescript
case 'success':
    return (
        <div style={{
            backgroundColor: '#e8f5e8',
            border: '1px solid #4caf50',
            borderRadius: '4px',
            padding: '12px',
            color: '#2e7d32'
        }}>
            <strong>✅ Success:</strong> {message.content}
            {message.data && <DetailsSection data={message.data} />}
        </div>
    );
```

### 3. Interactive Components

#### **Selection Messages**
```typescript
case 'selection':
    return (
        <div>
            <div style={{ marginBottom: '8px' }}>{message.content}</div>
            <MetadataSelector
                selectionOptions={message.data.selectionOptions}
                originalQuery={message.data.originalQuery}
                onSelection={(selected) => handleSelection(selected)}
                allowMultiple={message.data.allowMultiple !== false}
            />
        </div>
    );
```

#### **Data Grid Messages**
```typescript
case 'data_grid':
    if (message.data?.reviewMode) {
        // Tracker review mode
        return (
            <TrackerDataGrid
                extractedPatients={message.data.extractedPatients}
                mappedTrackerData={message.data.mappedTrackerData}
                headerMappings={message.data.headerMappings}
                reviewMode={true}
                onConfirmSave={() => handleConfirmSave()}
                onCancelSave={() => handleCancelSave()}
            />
        );
    } else {
        // Aggregate data entry grid
        return (
            <AggregateDataGrid
                headers={message.data.headers}
                displayHeaders={message.data.displayHeaders}
                rows={message.data.rows}
                resolutionState={message.data.resolutionState}
                onResolveAll={() => handleResolveAll()}
                onEditCell={(row, col, value) => handleEditCell(row, col, value)}
                onConfirmSubmit={() => handleSubmit()}
            />
        );
    }
```

#### **Resolution Selection Messages**
```typescript
case 'resolution_selection':
    return (
        <ResolutionSelector
            fieldType={message.data.fieldType}
            searchQuery={message.data.searchQuery}
            options={message.data.options}
            onSelection={(selectedId, row, col) => handleResolution(selectedId, row, col)}
            onSkip={(row, col) => handleSkipResolution(row, col)}
            onRetry={(row, col) => handleRetryResolution(row, col)}
        />
    );
```

#### **Dataset Selection Messages**
```typescript
case 'data_set_selection':
    return (
        <MetadataSelector
            selectionOptions={message.data.options.map(opt => ({
                id: opt.id,
                name: opt.name,
                description: opt.description,
                type: 'dataSet'
            }))}
            onSelection={(selected) => handleDatasetSelection(selected)}
            allowMultiple={false}
        />
    );
```

### 4. Chart Integration

#### **Analytics Chart Rendering**
```typescript
// Handle chart data in response messages
if (data.data?.echarts_option || data.chart?.echarts_option || data.echarts_option) {
    const chartData = data.data || data.chart || data;
    const stableChartId = chartData.chart_id || `chart_msg_${message.id}`;

    return (
        <div style={{ marginTop: '16px', width: '100%' }}>
            <AnalyticsChart
                chartData={chartData}
                chartId={stableChartId}
                title={chartData.title || 'Analytics Chart'}
                isLoading={!chartData.echarts_option}
                onFilter={(filters) => handleChartFilter(filters)}
                onExport={(format) => handleChartExport(format)}
            />
        </div>
    );
}
```

## 🎯 Advanced Features

### 1. Threaded Message Display

#### **Thread Grouping Logic**
```typescript
const groupedMessages = messages.reduce((groups, message) => {
    const threadId = message.threadId || 'unthreaded';
    if (!groups[threadId]) {
        groups[threadId] = [];
    }
    groups[threadId].push(message);
    return groups;
}, {} as Record<string, ConversationMessage[]>);
```

#### **Visual Thread Indicators**
```typescript
// Enhanced thread indicator line with gradient
<div style={{
    position: 'absolute',
    left: 'var(--space-3)',
    top: 'var(--space-4)',
    bottom: 'var(--space-4)',
    width: '3px',
    background: isUserThread
        ? 'linear-gradient(180deg, var(--color-primary-400), var(--color-primary-600))'
        : 'linear-gradient(180deg, var(--color-success-400), var(--color-success-600))',
    borderRadius: 'var(--radius-lg)',
    boxShadow: isUserThread
        ? '0 0 8px rgba(44, 102, 147, 0.4)'
        : '0 0 8px rgba(76, 175, 80, 0.4)'
}} />

// Thread header with icon and count
<div style={{
    position: 'absolute',
    left: 'var(--space-1)',
    top: 'var(--space-2)',
    width: 'var(--space-6)',
    height: 'var(--space-6)',
    borderRadius: '50%',
    backgroundColor: isUserThread ? 'var(--color-primary)' : 'var(--color-success)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-text-inverse)'
}}>
    {isUserThread ? '👤' : '🤖'}
</div>
```

### 2. Expandable Text Component

#### **Smart Text Truncation**
```typescript
const ExpandableText: FC<ExpandableTextProps> = ({ text, maxLength = 500, className = '' }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const shouldTruncate = text.length > maxLength;
    const displayText = shouldTruncate && !isExpanded
        ? text.substring(0, maxLength) + '...'
        : text;

    if (!shouldTruncate) {
        return <span className={className}>{text}</span>;
    }

    return (
        <span className={className}>
            {displayText}
            {shouldTruncate && (
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    style={{
                        backgroundColor: 'transparent',
                        border: 'none',
                        color: 'var(--color-primary)',
                        cursor: 'pointer',
                        fontSize: 'inherit',
                        textDecoration: 'underline',
                        marginLeft: 'var(--space-1)'
                    }}
                >
                    {isExpanded ? 'Show less' : 'Read more'}
                </button>
            )}
        </span>
    );
};
```

### 3. LLM-Powered Column Type Detection

#### **Intelligent Field Recognition**
```typescript
const getFieldTypeFromHeader = async (header: string): Promise<string | null> => {
    try {
        const columnTypeAnalysis = await llmClassificationService.detectColumnType(header, {
            context: 'DHIS2 data entry grid column headers for aggregate/tracker data',
            expectedTypes: ['dataElement', 'orgUnit', 'period', 'categoryOptionCombos', 'attributeOptionCombos', 'value']
        });

        return columnTypeAnalysis.type;
    } catch (error) {
        // Fallback to keyword-based detection
        return getFieldTypeFromHeaderFallback(header);
    }
};
```

**Multilingual Support**: Recognizes field types in English, French, Spanish, Arabic, Portuguese

### 4. Data Content Rendering

#### **Multi-Type Result Tables**
```typescript
const renderDataContent = (data: any) => {
    // Handle multiple result types (search results)
    if (hasMultipleResults) {
        return Object.entries(resultObject).map(([type, items]) => (
            <div key={type}>
                <h5>{type.replace(/([A-Z])/g, ' $1').trim()}</h5>
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Description</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.slice(0, 10).map((item: any) => (
                            <tr key={item.id}>
                                <td>{item.id}</td>
                                <td>{item.name}</td>
                                <td>{item.description}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        ));
    }
};
```

## 🔄 Integration with Orchestrator

### 1. Event Handling

#### **Data Grid Interactions**
```typescript
onResolveAll={() => {
    workflowOrchestrator.handleDataGridInteraction({
        type: 'resolve_all',
        data: {}
    });
}}

onEditCell={(rowIndex, colIndex, newValue) => {
    workflowOrchestrator.handleDataGridInteraction({
        type: 'edit_cell',
        data: { rowIndex, colIndex, newValue }
    });
}}
```

#### **Selection Handling**
```typescript
onSelection={(selected) => {
    console.log('Selection made in message:', selected);
    // Handled by orchestrator
}}
```

### 2. State Synchronization

#### **Message Updates**
```typescript
// Update message content and data through orchestrator
workflowOrchestrator.addAssistantMessage(
    'Data submitted successfully',
    'success',
    submissionData
);
```

## 🎨 Visual Design System

### 1. Message Bubble Styling

#### **Enhanced Message Bubbles**
```typescript
<div style={{
    background: isUser
        ? 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))'
        : 'linear-gradient(135deg, var(--color-bg-primary), var(--color-gray-50))',
    color: isUser ? 'var(--color-text-inverse)' : 'var(--color-text-primary)',
    borderRadius: 'var(--radius-xl)',
    padding: 'var(--space-3) var(--space-4)',
    boxShadow: isUser
        ? 'var(--shadow-lg), 0 0 20px rgba(44, 102, 147, 0.3)'
        : 'var(--shadow-md), 0 0 15px rgba(0, 0, 0, 0.1)',
    border: isUser ? 'none' : '1px solid var(--color-border-light)'
}}>
```

#### **Status Indicators**
```typescript
{/* Message status indicator */}
<div style={{
    position: 'absolute',
    top: '-2px',
    right: isUser ? '-2px' : 'auto',
    left: isUser ? 'auto' : '-2px',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: isUser ? 'var(--color-success)' : 'var(--color-info)',
    border: '2px solid var(--color-bg-primary)',
    boxShadow: '0 0 4px rgba(0,0,0,0.2)'
}} />
```

### 2. Animation and Transitions

#### **Fade-in Animation**
```typescript
<div style={{
    animation: 'animate-fade-in-up',
    // Smooth entrance animation for new messages
}}>
```

#### **Hover Effects**
```typescript
<button className="hover-lift" style={{
    transition: 'var(--transition-fast)',
    // Subtle lift effect on interaction
}}>
```

## 📊 Performance Optimizations

### 1. Lazy Loading

#### **Chart Rendering**
```typescript
const isLoading = !chartData.echarts_option || chartData.isLoading;
<AnalyticsChart
    isLoading={isLoading}
    // Charts render only when data is available
/>
```

### 2. Result Limiting

#### **Table Row Limiting**
```typescript
{items.slice(0, 10).map((item: any) => (
    // Limit display to first 10 results
    <tr key={item.id}>
        <td>{item.id}</td>
        <td>{item.name}</td>
    </tr>
))}
{items.length > 10 && (
    <div>... and {items.length - 10} more results</div>
)}
```

### 3. Efficient Re-rendering

#### **Stable Chart IDs**
```typescript
const stableChartId = chartData.chart_id || `chart_msg_${message.id}_${chartData.title}`.replace(/\s+/g, '_');
// Prevents unnecessary chart re-renders
```

## 🔍 Debugging & Monitoring

### Key Logging Points
- Message type rendering decisions
- LLM column type detection results
- Component interaction callbacks
- Chart rendering performance
- Thread grouping and display logic

### Common Issues
- **Message type handling**: New message types not rendering correctly
- **Data structure changes**: Component expecting different data formats
- **Performance**: Large datasets causing rendering delays
- **Styling**: CSS variable conflicts across themes

## 🚀 Extension Points

### Adding New Message Types
1. Add new type to `ConversationMessageType`
2. Implement rendering case in `renderMessageContent()`
3. Add any required props/interfaces
4. Update orchestrator message creation calls

### Custom Component Integration
- Extend data rendering for new result types
- Add specialized interaction handlers
- Implement custom visual themes
- Create domain-specific message components

### Enhanced Interactions
- Add drag-and-drop for file uploads
- Implement inline editing capabilities
- Create collapsible message sections
- Add message threading controls

---

The MessageRenderer serves as the sophisticated presentation layer that transforms raw agent responses into rich, interactive user experiences, handling everything from simple text messages to complex data grids and real-time progress indicators.
