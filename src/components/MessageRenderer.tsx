import React, { FC, useState } from 'react';
import { ConversationMessage, workflowOrchestrator } from '../utils/workflow-orchestrator';
import AnalyticsChart from './AnalyticsChart';
import MetadataSelector, { MetadataOption } from './MetadataSelector';
import AggregateDataGrid from './AggregateDataGrid';
import TrackerDataGrid from './TrackerDataGrid';
import ResolutionSelector from './ResolutionSelector';
import ActionButton from './ActionButton';

// Import centralized LLM classification service
import { llmClassificationService } from '../utils/llm-classification-service';

// Expandable Text Component for handling overflow content
interface ExpandableTextProps {
    text: string;
    maxLength?: number;
    className?: string;
}

const ExpandableText: FC<ExpandableTextProps> = ({ text, maxLength = 500, className = '' }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const shouldTruncate = text.length > maxLength;
    const displayText = shouldTruncate && !isExpanded ? text.substring(0, maxLength) + '...' : text;

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
                        fontWeight: 'var(--font-weight-medium)',
                        padding: '0 var(--space-1)',
                        textDecoration: 'underline',
                        marginLeft: 'var(--space-1)'
                    }}
                    className="hover-lift"
                >
                    {isExpanded ? 'Show less' : 'Read more'}
                </button>
            )}
        </span>
    );
};

interface ErrorMessageProps {
    message: ConversationMessage;
}

const ErrorMessage: FC<ErrorMessageProps> = ({ message }) => {
    const [showDetails, setShowDetails] = useState(false);
    const [showRecoveryActions, setShowRecoveryActions] = useState(false);

    const handleRecoveryAction = (actionId: string) => {
        console.log('Recovery action selected:', actionId);
        // TODO: Integrate with RecoveryModal or handle recovery actions
        workflowOrchestrator.addAssistantMessage(
            `Attempting recovery action: ${actionId}`,
            'info'
        );
    };

    const getRecoveryActions = () => {
        // Extract recovery actions from message data or provide defaults
        if (message.data?.recoveryOptions) {
            return message.data.recoveryOptions;
        }

        // Default recovery actions based on error type
        return [
            { id: 'retry', label: 'Retry', action: 'retry' },
            { id: 'skip', label: 'Skip', action: 'skip' },
            { id: 'manual', label: 'Manual Entry', action: 'manual_data_entry' }
        ];
    };

    return (
        <div style={{
            backgroundColor: '#ffebee',
            border: '1px solid #ef5350',
            borderRadius: '8px',
            padding: '16px',
            color: '#c62828'
        }}>
            {/* Error Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '8px'
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '16px',
                    fontWeight: 'bold'
                }}>
                    <span>❌ Error:</span>
                    <span>{message.content}</span>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '8px' }}>
                    <ActionButton
                        variant="retry"
                        size="small"
                        onClick={() => handleRecoveryAction('retry')}
                    >
                        Retry
                    </ActionButton>
                    <button
                        onClick={() => setShowRecoveryActions(!showRecoveryActions)}
                        style={{
                            padding: '4px 8px',
                            backgroundColor: 'transparent',
                            border: '1px solid #c62828',
                            borderRadius: '4px',
                            color: '#c62828',
                            cursor: 'pointer',
                            fontSize: '12px'
                        }}
                    >
                        {showRecoveryActions ? 'Hide Options' : 'More Options'}
                    </button>
                </div>
            </div>

            {/* Recovery Actions Panel */}
            {showRecoveryActions && (
                <div style={{
                    backgroundColor: '#fff3e0',
                    border: '1px solid #ff9800',
                    borderRadius: '6px',
                    padding: '12px',
                    marginTop: '12px'
                }}>
                    <h5 style={{
                        margin: '0 0 8px 0',
                        color: '#e65100',
                        fontSize: '14px'
                    }}>
                        Recovery Options:
                    </h5>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {getRecoveryActions().map((action: any) => (
                            <ActionButton
                                key={action.id}
                                variant={action.id === 'retry' ? 'retry' :
                                        action.id === 'skip' ? 'skip' :
                                        action.id === 'manual' ? 'manual' : 'alternative'}
                                size="small"
                                onClick={() => handleRecoveryAction(action.action)}
                            >
                                {action.label}
                            </ActionButton>
                        ))}
                    </div>
                </div>
            )}

            {/* Expandable Details */}
            {message.data && (
                <div style={{ marginTop: '12px' }}>
                    <button
                        onClick={() => setShowDetails(!showDetails)}
                        style={{
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: '#c62828',
                            cursor: 'pointer',
                            fontSize: '12px',
                            textDecoration: 'underline',
                            padding: '0'
                        }}
                    >
                        {showDetails ? 'Hide Details ▲' : 'Show Details ▼'}
                    </button>

                    {showDetails && (
                        <div style={{
                            marginTop: '8px',
                            padding: '12px',
                            backgroundColor: '#fafafa',
                            borderRadius: '4px',
                            border: '1px solid #e0e0e0',
                            fontSize: '12px',
                            fontFamily: 'monospace',
                            whiteSpace: 'pre-wrap',
                            maxHeight: '200px',
                            overflowY: 'auto'
                        }}>
                            {JSON.stringify(message.data, null, 2)}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

interface MessageRendererProps {
    message: ConversationMessage;
}

interface ThreadedMessageRendererProps {
    messages: ConversationMessage[];
}

interface ProgressMessageProps {
    message: ConversationMessage;
}

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
            {/* Progress Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '12px',
                fontSize: '16px',
                fontWeight: 'bold'
            }}>
                <span>🔄</span>
                <span>{message.content}</span>
                {progress > 0 && (
                    <span style={{
                        fontSize: '12px',
                        color: '#666',
                        marginLeft: 'auto'
                    }}>
                        {Math.round(progress)}%
                    </span>
                )}
            </div>

            {/* Progress Bar */}
            {progress > 0 && (
                <div style={{ marginBottom: '16px' }}>
                    <div style={{
                        width: '100%',
                        height: '8px',
                        backgroundColor: '#e0e0e0',
                        borderRadius: '4px',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            width: `${progress}%`,
                            height: '100%',
                            backgroundColor: '#9c27b0',
                            transition: 'width 0.5s ease'
                        }} />
                    </div>
                </div>
            )}

            {/* Steps Progress (if available) */}
            {steps.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                    <div style={{
                        fontSize: '12px',
                        color: '#666',
                        marginBottom: '8px',
                        fontWeight: 'bold'
                    }}>
                        Steps:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {steps.map((step: any, index: number) => {
                            const isCompleted = step.status === 'completed';
                            const isActive = step.status === 'active';
                            const isCurrent = step.id === currentStep;

                            return (
                                <div
                                    key={step.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '4px 0'
                                    }}
                                >
                                    <div style={{
                                        width: '16px',
                                        height: '16px',
                                        borderRadius: '50%',
                                        backgroundColor: isCompleted ? '#4caf50' :
                                                       isActive ? '#2196f3' : '#e0e0e0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '10px',
                                        color: 'white'
                                    }}>
                                        {isCompleted ? '✓' : isActive ? '●' : '○'}
                                    </div>
                                    <span style={{
                                        fontSize: '12px',
                                        color: isCompleted ? '#4caf50' :
                                               isActive ? '#2196f3' : '#666',
                                        fontWeight: isCurrent ? 'bold' : 'normal'
                                    }}>
                                        {step.label}
                                    </span>
                                    {step.progress !== undefined && isActive && (
                                        <div style={{
                                            marginLeft: 'auto',
                                            fontSize: '10px',
                                            color: '#666'
                                        }}>
                                            {step.progress}%
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Additional Details */}
            {message.data && Object.keys(message.data).length > 0 && (
                <div style={{
                    padding: '8px',
                    backgroundColor: '#fafafa',
                    borderRadius: '4px',
                    border: '1px solid #e9ecef',
                    fontSize: '11px',
                    color: '#666'
                }}>
                    {message.data.details || message.data.message || 'Processing...'}
                </div>
            )}
        </div>
    );
};

export const ThreadedMessageRenderer: FC<ThreadedMessageRendererProps> = ({ messages }) => {
    // Group messages by threadId
    const groupedMessages = messages.reduce((groups, message) => {
        const threadId = message.threadId || 'unthreaded';
        if (!groups[threadId]) {
            groups[threadId] = [];
        }
        groups[threadId].push(message);
        return groups;
    }, {} as Record<string, ConversationMessage[]>);

    // Sort messages within each thread by timestamp
    Object.keys(groupedMessages).forEach(threadId => {
        groupedMessages[threadId].sort((a, b) => a.timestamp - b.timestamp);
    });

    const renderThread = (threadId: string, threadMessages: ConversationMessage[]) => {
        const isThreaded = threadId !== 'unthreaded';
        const firstMessage = threadMessages[0];
        const isUserThread = firstMessage?.role === 'user';

        if (!isThreaded) {
            // Render unthreaded messages normally
            return threadMessages.map(message => (
                <MessageRenderer key={message.id} message={message} />
            ));
        }

        // Render threaded messages with enhanced visual indicators
        return (
            <div
                key={threadId}
                style={{
                    position: 'relative',
                    marginBottom: 'var(--space-6)',
                    paddingLeft: 'var(--space-8)'
                }}
            >
                {/* Enhanced thread indicator line with gradient */}
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
                        : '0 0 8px rgba(76, 175, 80, 0.4)',
                    opacity: 0.8
                }} />

                {/* Enhanced thread header with icon and count */}
                <div style={{
                    position: 'absolute',
                    left: 'var(--space-1)',
                    top: 'var(--space-2)',
                    width: 'var(--space-6)',
                    height: 'var(--space-6)',
                    borderRadius: '50%',
                    backgroundColor: isUserThread ? 'var(--color-primary)' : 'var(--color-success)',
                    border: '3px solid var(--color-bg-primary)',
                    boxShadow: 'var(--shadow-md)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-inverse)',
                    fontWeight: 'var(--font-weight-bold)',
                    zIndex: 2
                }}>
                    {isUserThread ? '👤' : '🤖'}
                </div>

                {/* Thread info badge */}
                <div style={{
                    position: 'absolute',
                    left: 'var(--space-8)',
                    top: 'var(--space-1)',
                    backgroundColor: 'var(--color-bg-primary)',
                    border: '1px solid var(--color-border-light)',
                    borderRadius: 'var(--radius-full)',
                    padding: 'var(--space-1) var(--space-3)',
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-secondary)',
                    fontWeight: 'var(--font-weight-medium)',
                    boxShadow: 'var(--shadow-sm)',
                    zIndex: 1
                }}>
                    {threadMessages.length} message{threadMessages.length !== 1 ? 's' : ''}
                </div>

                {/* Messages in thread with enhanced spacing */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-3)',
                    marginTop: 'var(--space-6)'
                }}>
                    {threadMessages.map((message, index) => (
                        <div
                            key={message.id}
                            style={{
                                position: 'relative',
                                marginLeft: index === 0 ? '0' : 'var(--space-6)'
                            }}
                        >
                            {/* Enhanced connection indicator for subsequent messages */}
                            {index > 0 && (
                                <div style={{
                                    position: 'absolute',
                                    left: 'calc(-1 * var(--space-8))',
                                    top: 'var(--space-4)',
                                    width: 'var(--space-4)',
                                    height: 'var(--space-4)',
                                    borderRadius: '50%',
                                    backgroundColor: isUserThread ? 'var(--color-primary)' : 'var(--color-success)',
                                    border: '3px solid var(--color-bg-primary)',
                                    boxShadow: 'var(--shadow-sm)',
                                    opacity: 0.9,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 'var(--font-size-xs)',
                                    color: 'var(--color-text-inverse)',
                                    fontWeight: 'var(--font-weight-bold)'
                                }}>
                                    {index + 1}
                                </div>
                            )}

                            {/* Connection line for subsequent messages */}
                            {index > 0 && (
                                <div style={{
                                    position: 'absolute',
                                    left: 'calc(-1 * var(--space-6))',
                                    top: 'var(--space-2)',
                                    width: 'var(--space-4)',
                                    height: '2px',
                                    backgroundColor: isUserThread ? 'var(--color-primary-300)' : 'var(--color-success-300)',
                                    opacity: 0.6
                                }} />
                            )}

                            <MessageRenderer message={message} />
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            {Object.entries(groupedMessages).map(([threadId, threadMessages]) =>
                renderThread(threadId, threadMessages)
            )}
        </div>
    );
};

// LLM-based helper function to determine field type from header
const getFieldTypeFromHeader = async (header: string): Promise<'dataElement' | 'orgUnit' | 'period' | 'categoryOptionCombos' | 'attributeOptionCombos' | 'value' | null> => {
    try {
        console.log('🤖 MessageRenderer: Detecting column type for header:', header);

        const columnTypeAnalysis = await llmClassificationService.detectColumnType(header, {
            context: 'DHIS2 data entry grid column headers for aggregate/tracker data',
            expectedTypes: ['dataElement', 'orgUnit', 'period', 'categoryOptionCombos', 'attributeOptionCombos', 'value']
        });

        console.log(`🤖 MessageRenderer: Detected column type "${columnTypeAnalysis.type}" with confidence ${columnTypeAnalysis.confidence}`);

        return columnTypeAnalysis.type as any;
    } catch (error) {
        console.error('❌ MessageRenderer: Column type detection failed:', error);

        // Fallback to keyword-based detection for reliability
        console.log('🔄 MessageRenderer: Falling back to keyword detection');
        return getFieldTypeFromHeaderFallback(header);
    }
};

// Fallback keyword-based function for reliability
const getFieldTypeFromHeaderFallback = (header: string): 'dataElement' | 'orgUnit' | 'period' | 'categoryOptionCombos' | 'attributeOptionCombos' | 'value' | null => {
    const lowerHeader = header.toLowerCase();

    if (lowerHeader.includes('dataelement') || lowerHeader.includes('data_element')) {
        return 'dataElement';
    }
    if (lowerHeader.includes('orgunit') || lowerHeader.includes('org_unit') || lowerHeader.includes('organisation')) {
        return 'orgUnit';
    }
    if (lowerHeader.includes('period')) {
        return 'period';
    }
    if (lowerHeader.includes('categoryoption') || lowerHeader.includes('category_option')) {
        return 'categoryOptionCombos';
    }
    if (lowerHeader.includes('attributeoption') || lowerHeader.includes('attribute_option')) {
        return 'attributeOptionCombos';
    }
    if (lowerHeader.includes('value')) {
        return 'value';
    }

    return null;
};

const MessageRenderer: FC<MessageRendererProps> = ({ message }) => {
    const isUser = message.role === 'user';

    // Format timestamp
    const formatTime = (timestamp: number) => {
        return new Date(timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const renderMessageContent = () => {
        switch (message.type) {
            case 'query':
                return (
                    <div style={{ whiteSpace: 'pre-wrap' }}>
                        <ExpandableText text={message.content} maxLength={300} />
                    </div>
                );

            case 'response':
                return (
                    <div>
                        {/* Text content */}
                        {message.content && (
                            <div style={{ marginBottom: message.data ? '16px' : '0' }}>
                                <ExpandableText text={message.content} maxLength={500} />
                            </div>
                        )}

                        {/* Render results data */}
                        {message.data && renderDataContent(message.data)}
                    </div>
                );

            case 'error':
                return <ErrorMessage message={message} />;

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
                        {message.data && (
                            <div style={{ marginTop: '8px', fontSize: '12px' }}>
                                <strong>Details:</strong>
                                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '11px' }}>
                                    {JSON.stringify(message.data, null, 2).substring(0, 500)}
                                </pre>
                            </div>
                        )}
                    </div>
                );

            case 'warning':
                return (
                    <div style={{
                        backgroundColor: '#fff3e0',
                        border: '1px solid #ff9800',
                        borderRadius: '4px',
                        padding: '12px',
                        color: '#e65100'
                    }}>
                        <strong>⚠️ Warning:</strong> {message.content}
                        {message.data && (
                            <div style={{ marginTop: '8px', fontSize: '12px' }}>
                                <strong>Details:</strong>
                                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '11px' }}>
                                    {JSON.stringify(message.data, null, 2).substring(0, 500)}
                                </pre>
                            </div>
                        )}
                    </div>
                );

            case 'info':
                return (
                    <div style={{
                        backgroundColor: '#e3f2fd',
                        border: '1px solid #2196f3',
                        borderRadius: '4px',
                        padding: '12px',
                        color: '#0d47a1'
                    }}>
                        <strong>ℹ️ Info:</strong> {message.content}
                        {message.data && (
                            <div style={{ marginTop: '8px', fontSize: '12px' }}>
                                <strong>Details:</strong>
                                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '11px' }}>
                                    {JSON.stringify(message.data, null, 2).substring(0, 500)}
                                </pre>
                            </div>
                        )}
                    </div>
                );

            case 'progress':
                return <ProgressMessage message={message} />;

            case 'selection':
                return (
                    <div>
                        <div style={{ marginBottom: '8px' }}>{message.content}</div>
                        {message.data?.selectionOptions && (
                            <div style={{
                                backgroundColor: 'white',
                                padding: '12px',
                                borderRadius: '4px',
                                maxWidth: '500px',
                                overflowX: 'auto',
                                overflowY: 'auto',
                                maxHeight: '400px'
                            }}>
                                <MetadataSelector
                                    selectionOptions={message.data.selectionOptions.map((opt: any) => ({
                                        ...opt,
                                        type: opt.type as 'indicator' | 'dataElement'
                                    }))}
                                    originalQuery={message.data.originalQuery || ''}
                                    onSelection={(selected) => {
                                        console.log('Selection made in message:', selected);
                                        // This would be handled by the orchestrator
                                    }}
                                    allowMultiple={message.data.allowMultiple !== false}
                                />
                            </div>
                        )}
                    </div>
                );

            case 'data_grid':
                console.log('🎨 MessageRenderer data_grid props:', {
                    displayHeaders: message.data?.displayHeaders,
                    headers: message.data?.headers,
                    dataSetName: message.data?.dataSetName,
                    reviewMode: message.data?.reviewMode
                });

                // Check if this is a tracker review grid
                if (message.data?.reviewMode) {
                    return (
                        <div>
                            <div style={{ marginBottom: '8px' }}>{message.content}</div>
                            {message.data && (
                                <TrackerDataGrid
                                    extractedPatients={message.data.extractedPatients || []}
                                    mappedTrackerData={message.data.mappedTrackerData || []}
                                    headerMappings={message.data.headerMappings || {}}
                                    headerDisplayNames={message.data.headerDisplayNames || {}}
                                    reviewMode={true}
                                onConfirmSave={() => {
                                    workflowOrchestrator.handleDataGridInteraction({
                                        type: 'confirm_save',
                                        data: {}
                                    });
                                }}
                                onCancelSave={() => {
                                    workflowOrchestrator.handleDataGridInteraction({
                                        type: 'cancel_save',
                                        data: {}
                                    });
                                }}
                                onUpdateEntity={(entityId) => {
                                    workflowOrchestrator.handleDataGridInteraction({
                                        type: 'update_entity',
                                        data: { entityId }
                                    });
                                }}
                                onDeleteEntity={(entityId) => {
                                    workflowOrchestrator.handleDataGridInteraction({
                                        type: 'delete_entity',
                                        data: { entityId }
                                    });
                                }}
                                onViewEntityDetails={(entityId) => {
                                    workflowOrchestrator.handleDataGridInteraction({
                                        type: 'view_entity_details',
                                        data: { entityId }
                                    });
                                }}
                                />
                            )}
                        </div>
                    );
                }

                // Default: render aggregate data grid
                return (
                    <div>
                        <div style={{ marginBottom: '8px' }}>{message.content}</div>
                        {message.data && (
                            <AggregateDataGrid
                                headers={message.data.headers || []}
                                displayHeaders={message.data.displayHeaders}
                                rows={message.data.rows || []}
                                resolutionState={message.data.resolutionState || []}
                                resourceDetails={message.data.resourceDetails}
                                displayNames={message.data.displayNames}
                                dataSetId={message.data.dataSetId}
                                dataSetName={message.data.dataSetName}
                                isExistingData={message.data.isExistingData}
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
                                onDeleteRow={(rowIndex) => {
                                    workflowOrchestrator.handleDataGridInteraction({
                                        type: 'delete_row',
                                        data: { rowIndex }
                                    });
                                }}
                                onConfirmSubmit={() => {
                                    workflowOrchestrator.handleDataGridInteraction({
                                        type: 'confirm_submit',
                                        data: {}
                                    });
                                }}
                                onResolveItem={(rowIndex, colIndex) => {
                                    // Get the original value from the data
                                    const originalValue = message.data.rows[rowIndex]?.[colIndex] || '';
                                    const headers = message.data.headers || [];
                                    const fieldType = getFieldTypeFromHeader(headers[colIndex]);

                                    workflowOrchestrator.handleDataGridInteraction({
                                        type: 'resolve_item',
                                        data: {
                                            rowIndex,
                                            colIndex,
                                            originalValue,
                                            fieldType
                                        }
                                    });
                                }}
                                onUpdateDataSet={() => {
                                    workflowOrchestrator.handleDataGridInteraction({
                                        type: 'update_data_set',
                                        data: { dataSetId: message.data.dataSetId }
                                    });
                                }}
                                onAddRow={() => {
                                    workflowOrchestrator.handleDataGridInteraction({
                                        type: 'add_row',
                                        data: { dataSetId: message.data.dataSetId }
                                    });
                                }}
                            />
                        )}
                    </div>
                );

            case 'resolution_selection':
                return (
                    <div>
                        <div style={{ marginBottom: '8px' }}>{message.content}</div>
                        {message.data && (
                            <ResolutionSelector
                                fieldType={message.data.fieldType}
                                searchQuery={message.data.searchQuery}
                                options={message.data.options || []}
                                rowIndex={message.data.rowIndex}
                                colIndex={message.data.colIndex}
                                onSelection={(selectedId, rowIndex, colIndex) => {
                                    console.log('Resolution selection:', selectedId, rowIndex, colIndex);
                                    // This would be handled by the orchestrator
                                }}
                                onSkip={(rowIndex, colIndex) => {
                                    console.log('Resolution skip:', rowIndex, colIndex);
                                    // This would be handled by the orchestrator
                                }}
                                onRetry={(rowIndex, colIndex) => {
                                    console.log('Resolution retry:', rowIndex, colIndex);
                                    // This would be handled by the orchestrator
                                }}
                            />
                        )}
                    </div>
                );

            case 'data_set_selection':
                return (
                    <div>
                        <div style={{ marginBottom: '8px' }}>{message.content}</div>
                        {message.data?.options && (
                            <div style={{
                                backgroundColor: 'white',
                                padding: '12px',
                                borderRadius: '4px',
                                maxWidth: '600px',
                                border: '1px solid #e0e0e0'
                            }}>
                                <MetadataSelector
                                    selectionOptions={message.data.options.map((opt: any) => ({
                                        id: opt.id,
                                        name: opt.name,
                                        description: opt.description,
                                        type: 'dataSet' as any
                                    }))}
                                    originalQuery={message.data.searchQuery || ''}
                                    onSelection={(selected) => {
                                        console.log('Dataset selection made:', selected);
                                        // Handle dataset selection through orchestrator
                                        workflowOrchestrator.handleDatasetSelection(selected);
                                    }}
                                    allowMultiple={false}
                                />
                            </div>
                        )}
                    </div>
                );

            case 'tracker_data_grid':
                console.log('🏥 MessageRenderer tracker_data_grid props:', {
                    extractedPatients: message.data?.extractedPatients,
                    mappedTrackerData: message.data?.mappedTrackerData,
                    headerMappings: message.data?.headerMappings,
                    headerDisplayNames: message.data?.headerDisplayNames,
                    reviewMode: message.data?.reviewMode
                });

                return (
                    <div>
                        <div style={{ marginBottom: '8px' }}>{message.content}</div>
                        {message.data && (
                            <TrackerDataGrid
                                extractedPatients={message.data.extractedPatients || []}
                                mappedTrackerData={message.data.mappedTrackerData || []}
                                headerMappings={message.data.headerMappings || {}}
                                headerDisplayNames={message.data.headerDisplayNames || {}}
                                reviewMode={message.data.reviewMode || false}
                                onConfigureProcessing={(config) => {
                                    workflowOrchestrator.handleConfigureProcessing(config);
                                }}
                                onUploadDocument={(file) => {
                                    workflowOrchestrator.handleUploadDocument(file);
                                }}
                                onRetryProcessing={() => {
                                    workflowOrchestrator.handleRetryProcessing();
                                }}
                                onConfirmSave={() => {
                                    workflowOrchestrator.handleConfirmSave();
                                }}
                                onCancelSave={() => {
                                    workflowOrchestrator.handleCancelSave();
                                }}
                                onUpdateEntity={(entityId) => {
                                    workflowOrchestrator.handleDataGridInteraction({
                                        type: 'update_entity',
                                        data: { entityId }
                                    });
                                }}
                                onDeleteEntity={(entityId) => {
                                    workflowOrchestrator.handleDataGridInteraction({
                                        type: 'delete_entity',
                                        data: { entityId }
                                    });
                                }}
                                onViewEntityDetails={(entityId) => {
                                    workflowOrchestrator.handleDataGridInteraction({
                                        type: 'view_entity_details',
                                        data: { entityId }
                                    });
                                }}
                                processingStep={workflowOrchestrator.getTrackerState().processingStep}
                                processingProgress={workflowOrchestrator.getTrackerState().processingProgress}
                                error={workflowOrchestrator.getTrackerState().error}
                            />
                        )}
                    </div>
                );

            default:
                return <div>{message.content}</div>;
        }
    };

    const renderDataContent = (data: any) => {
        // Handle tabular results - check for top-level object with arrays (search results) or nested results
        const resultObject = data.results || data; // Fall back to data itself if no .results
        const hasMultipleResults = resultObject &&
            typeof resultObject === 'object' &&
            !Array.isArray(resultObject) &&
            Object.values(resultObject).some(val => Array.isArray(val));

        if (hasMultipleResults) {
            return (
                <div style={{ marginTop: '16px' }}>
                    {Object.entries(resultObject).map(([type, items]: [string, any]) => {
                        if (!Array.isArray(items) || items.length === 0) return null;

                        return (
                            <div key={type} style={{ marginBottom: '24px' }}>
                                <h5 style={{
                                    marginBottom: '8px',
                                    color: '#2c6693',
                                    textTransform: 'capitalize',
                                    borderBottom: '2px solid #e0e0e0',
                                    paddingBottom: '4px',
                                    fontSize: '14px'
                                }}>
                                    {type.replace(/([A-Z])/g, ' $1').trim()}
                                </h5>
                                <div style={{
                                    border: '1px solid #ddd',
                                    borderRadius: '4px',
                                    overflow: 'hidden',
                                    maxHeight: '300px',
                                    overflowY: 'auto'
                                }}>
                                    <table style={{
                                        width: '100%',
                                        borderCollapse: 'collapse'
                                    }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#f5f5f5' }}>
                                                <th style={{
                                                    padding: '8px 12px',
                                                    textAlign: 'left',
                                                    borderBottom: '1px solid #ddd',
                                                    fontWeight: 'bold',
                                                    fontSize: '12px'
                                                }}>
                                                    ID
                                                </th>
                                                <th style={{
                                                    padding: '8px 12px',
                                                    textAlign: 'left',
                                                    borderBottom: '1px solid #ddd',
                                                    fontWeight: 'bold',
                                                    fontSize: '12px'
                                                }}>
                                                    Name
                                                </th>
                                                <th style={{
                                                    padding: '8px 12px',
                                                    textAlign: 'left',
                                                    borderBottom: '1px solid #ddd',
                                                    fontWeight: 'bold',
                                                    fontSize: '12px'
                                                }}>
                                                    Description
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {items.slice(0, 10).map((item: any, index: number) => (
                                                <tr key={item.id || index} style={{
                                                    backgroundColor: index % 2 === 0 ? 'white' : '#f9f9f9'
                                                }}>
                                                    <td style={{
                                                        padding: '8px 12px',
                                                        borderBottom: '1px solid #eee',
                                                        fontFamily: 'monospace',
                                                        fontSize: '12px',
                                                        maxWidth: '150px',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis'
                                                    }}>
                                                        {item.id || ''}
                                                    </td>
                                                    <td style={{
                                                        padding: '8px 12px',
                                                        borderBottom: '1px solid #eee',
                                                        fontSize: '12px',
                                                        maxWidth: '200px',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis'
                                                    }}>
                                                        {item.name || ''}
                                                    </td>
                                                    <td style={{
                                                        padding: '8px 12px',
                                                        borderBottom: '1px solid #eee',
                                                        fontSize: '12px',
                                                        maxWidth: '250px',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis'
                                                    }}>
                                                        {item.description || item.displayName || '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {items.length > 10 && (
                                        <div style={{
                                            padding: '8px',
                                            textAlign: 'center',
                                            backgroundColor: '#f5f5f5',
                                            fontSize: '12px',
                                            color: '#666'
                                        }}>
                                            ... and {items.length - 10} more results
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            );
        }

        // Handle chart data - allow full width for better visualization
        if (data.data?.echarts_option || data.chart?.echarts_option || data.echarts_option) {
            const chartData = data.data || data.chart || data;
            // Use stable chart ID based on message ID to prevent re-rendering
            const stableChartId = chartData.chart_id || `chart_msg_${message.id}_${chartData.title || 'chart'}`.replace(/\s+/g, '_');

            // Check if chart should show loading state
            const isLoading = !chartData.echarts_option || chartData.isLoading;

            return (
                <div style={{ marginTop: '16px', width: '100%' }}>
                    <AnalyticsChart
                        chartData={chartData}
                        chartId={stableChartId}
                        title={chartData.title || 'Analytics Chart'}
                        isLoading={isLoading}
                        onFilter={(filters) => console.log('Chart filtered:', filters)}
                        onExport={(format) => console.log('Chart exported as:', format)}
                    />
                </div>
            );
        }

        // Handle summary data
        if (data.count !== undefined) {
            return (
                <div style={{ marginTop: '8px', color: '#2E7D32', fontSize: '14px' }}>
                    <strong>Total results:</strong> {data.count}
                </div>
            );
        }

        return null;
    };

    return (
        <div style={{
            display: 'flex',
            justifyContent: isUser ? 'flex-end' : 'flex-start',
            marginBottom: '8px',
            animation: 'animate-fade-in-up'
        }}>
            <div style={{
                maxWidth: isUser ? '70%' : '85%',
                minWidth: '200px'
            }}>
                {/* Message header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: '4px',
                    fontSize: '12px',
                    color: '#666'
                }}>
                    <span style={{
                        fontWeight: 'bold',
                        color: isUser ? '#2c6693' : '#4CAF50'
                    }}>
                        {isUser ? 'You' : 'Assistant'}
                    </span>
                    <span style={{ margin: '0 8px' }}>•</span>
                    <span>{formatTime(message.timestamp)}</span>
                </div>

                {/* Enhanced Message bubble with gradients and shadows */}
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
                    border: isUser ? 'none' : '1px solid var(--color-border-light)',
                    position: 'relative',
                    transition: 'var(--transition-fast)',
                    maxWidth: '85%'
                }}>
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
                    }}></div>

                    {/* Message content */}
                    {renderMessageContent()}

                    {/* Enhanced timestamp and status */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: isUser ? 'flex-start' : 'flex-end',
                        gap: 'var(--space-3)',
                        marginTop: 'var(--space-3)',
                        paddingTop: 'var(--space-2)',
                        borderTop: isUser
                            ? '1px solid rgba(255, 255, 255, 0.2)'
                            : '1px solid var(--color-border-light)',
                        fontSize: 'var(--font-size-xs)',
                        opacity: 0.8
                    }}>
                        {/* Message status indicators */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--space-1)'
                        }}>
                            {/* Processing indicator for assistant messages */}
                            {message.type === 'progress' && (
                                <div style={{
                                    width: '6px',
                                    height: '6px',
                                    borderRadius: '50%',
                                    backgroundColor: 'var(--color-warning)',
                                    animation: 'pulse 2s infinite'
                                }}></div>
                            )}

                            {/* Status badges */}
                            {message.type === 'error' && (
                                <span style={{
                                    color: 'var(--color-error)',
                                    fontSize: 'var(--font-size-xs)',
                                    fontWeight: 'var(--font-weight-semibold)'
                                }}>
                                    ❌ Error
                                </span>
                            )}

                            {message.type === 'success' && (
                                <span style={{
                                    color: 'var(--color-success)',
                                    fontSize: 'var(--font-size-xs)',
                                    fontWeight: 'var(--font-weight-semibold)'
                                }}>
                                    ✅ Success
                                </span>
                            )}

                            {message.type === 'warning' && (
                                <span style={{
                                    color: 'var(--color-warning-dark)',
                                    fontSize: 'var(--font-size-xs)',
                                    fontWeight: 'var(--font-weight-semibold)'
                                }}>
                                    ⚠️ Warning
                                </span>
                            )}

                            {/* Delivery status for user messages */}
                            {isUser && (
                                <span style={{
                                    color: 'var(--color-success)',
                                    fontSize: 'var(--font-size-xs)',
                                    display: 'flex',
                                    alignItems: 'center'
                                }}>
                                    ✓✓
                                </span>
                            )}
                        </div>

                        {/* Timestamp */}
                        <span style={{
                            color: isUser ? 'rgba(255, 255, 255, 0.8)' : 'var(--color-text-muted)',
                            fontSize: 'var(--font-size-xs)',
                            fontWeight: 'var(--font-weight-medium)',
                            fontFamily: 'monospace'
                        }}>
                            {formatTime(message.timestamp)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MessageRenderer;
