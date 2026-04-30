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

// Enhanced CSS animations for elegant visual feedback
const enhancedNotificationStyles = `
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    @keyframes pulse-ring {
        0% {
            transform: scale(0.8);
            opacity: 1;
        }
        100% {
            transform: scale(1.3);
            opacity: 0;
        }
    }

    @keyframes pulse-dot {
        0%, 100% {
            opacity: 1;
            transform: scale(1);
        }
        50% {
            opacity: 0.6;
            transform: scale(0.9);
        }
    }

    @keyframes gradient-shift {
        0% { background-position: 0% 50%; }
        50% { background-position: 100% 50%; }
        100% { background-position: 0% 50%; }
    }

    @keyframes slide-in-up {
        0% {
            opacity: 0;
            transform: translateY(20px);
        }
        100% {
            opacity: 1;
            transform: translateY(0);
        }
    }

    @keyframes progress-fill {
        0% { width: 0%; }
        100% { width: var(--progress-width, 0%); }
    }

    @keyframes bounce-in {
        0% {
            opacity: 0;
            transform: scale(0.3);
        }
        50% {
            opacity: 1;
            transform: scale(1.05);
        }
        70% {
            transform: scale(0.9);
        }
        100% {
            opacity: 1;
            transform: scale(1);
        }
    }

    .progress-message-enhanced {
        animation: slide-in-up 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .processing-overlay-elegant {
        backdrop-filter: blur(8px);
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .toast-notification-elegant {
        animation: bounce-in 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 255, 255, 0.1);
    }

    .progress-ring-elegant {
        filter: drop-shadow(0 2px 4px rgba(33, 150, 243, 0.3));
    }
`;

// Inject enhanced styles into document head
if (typeof document !== 'undefined' && !document.getElementById('enhanced-notification-styles')) {
    const style = document.createElement('style');
    style.id = 'enhanced-notification-styles';
    style.textContent = enhancedNotificationStyles;
    document.head.appendChild(style);
}

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

interface CrudConfirmationProps {
    message: ConversationMessage;
}

interface ProgressMessageProps {
    message: ConversationMessage;
}

const CrudConfirmation: FC<CrudConfirmationProps> = ({ message }) => {
    const [showDetails, setShowDetails] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const handleConfirm = async () => {
        if (isProcessing) return;

        setIsProcessing(true);
        console.log('✅ CRUD operations confirmed by user');

        try {
            // Signal confirmation to the workflow (this will resolve the requestConfirmation promise)
            workflowOrchestrator.signalConfirmation(message.data?.workflowId, true);

            // Add confirmation response to conversation
            workflowOrchestrator.addAssistantMessage(
                '✅ Operations confirmed. Executing operations...',
                'progress'
            );
        } catch (error) {
            console.error('Failed to signal confirmation:', error);
            workflowOrchestrator.addAssistantMessage(
                '❌ Failed to process confirmation. Please try again.',
                'error'
            );
        } finally {
            setIsProcessing(false);
        }
    };

    const handleCancel = async () => {
        if (isProcessing) return;

        setIsProcessing(true);
        console.log('❌ CRUD operations cancelled by user');

        try {
            // Signal cancellation to the workflow
            workflowOrchestrator.signalConfirmation(message.data?.workflowId, false);

            // Add cancellation response to conversation
            workflowOrchestrator.addAssistantMessage(
                '❌ Operation cancelled by user.',
                'warning'
            );
        } catch (error) {
            console.error('Failed to signal cancellation:', error);
            workflowOrchestrator.addAssistantMessage(
                '❌ Failed to process cancellation. Please try again.',
                'error'
            );
        } finally {
            setIsProcessing(false);
        }
    };

    const operations = message.data?.operations || [];
    const autoCreations = message.data?.autoCreations || [];
    const totalOperations = message.data?.totalOperations || 0;
    const existingCount = message.data?.existingCount || 0;
    const newCount = message.data?.newCount || 0;

    // Separate existing and new operations
    const existingOperations = operations.filter((op: any) => op.exists);
    const newOperations = operations.filter((op: any) => !op.exists);

    return (
        <div style={{
            background: 'linear-gradient(135deg, #fff3e0, #fff8e1)',
            border: '2px solid #ff9800',
            borderRadius: '12px',
            padding: '20px',
            margin: '12px 0',
            position: 'relative',
            boxShadow: '0 4px 12px rgba(255, 152, 0, 0.15)'
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '16px'
            }}>
                <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    backgroundColor: '#ff9800',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px'
                }}>
                    ⚠️
                </div>
                <div>
                    <h3 style={{
                        margin: '0 0 4px 0',
                        color: '#e65100',
                        fontSize: '18px',
                        fontWeight: 'bold'
                    }}>
                        Confirm CRUD Operations
                    </h3>
                    <p style={{
                        margin: 0,
                        color: '#bf360c',
                        fontSize: '14px'
                    }}>
                        Please review and confirm the following metadata operations
                    </p>
                </div>
            </div>

            {/* Summary */}
            <div style={{
                backgroundColor: '#fff',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '16px'
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px'
                }}>
                    <span style={{
                        fontSize: '16px',
                        fontWeight: 'bold',
                        color: '#333'
                    }}>
                        Operation Summary
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {existingCount > 0 && (
                            <span style={{
                                backgroundColor: '#fff3e0',
                                color: '#ef6c00',
                                padding: '4px 12px',
                                borderRadius: '16px',
                                fontSize: '14px',
                                fontWeight: 'bold'
                            }}>
                                {existingCount} existing
                            </span>
                        )}
                        {newCount > 0 && (
                            <span style={{
                                backgroundColor: '#e8f5e8',
                                color: '#2e7d32',
                                padding: '4px 12px',
                                borderRadius: '16px',
                                fontSize: '14px',
                                fontWeight: 'bold'
                            }}>
                                {newCount} new
                            </span>
                        )}
                    </div>
                </div>

                <div style={{ fontSize: '14px', color: '#666' }}>
                    <p style={{ margin: '0 0 8px 0' }}>
                        {message.data?.message || 'Ready to execute the planned operations.'}
                    </p>
                    {existingCount > 0 && (
                        <p style={{
                            margin: '8px 0 0 0',
                            color: '#ef6c00',
                            fontWeight: '500'
                        }}>
                            ⚠️ {existingCount} resource(s) already exist and will be updated if you proceed.
                        </p>
                    )}
                </div>
            </div>

            {/* Operations List */}
            <div style={{
                backgroundColor: '#fff',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '16px',
                maxHeight: showDetails ? '400px' : '200px',
                overflowY: showDetails ? 'auto' : 'hidden'
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px'
                }}>
                    <h4 style={{
                        margin: 0,
                        color: '#333',
                        fontSize: '16px'
                    }}>
                        Planned Operations
                    </h4>
                    <button
                        onClick={() => setShowDetails(!showDetails)}
                        style={{
                            backgroundColor: 'transparent',
                            border: '1px solid #2196f3',
                            borderRadius: '4px',
                            color: '#2196f3',
                            cursor: 'pointer',
                            padding: '4px 12px',
                            fontSize: '12px'
                        }}
                    >
                        {showDetails ? 'Show Less' : 'Show Details'}
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {operations.slice(0, showDetails ? operations.length : 3).map((op: any, index: number) => (
                        <div
                            key={index}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '8px 12px',
                                backgroundColor: index % 2 === 0 ? '#f9f9f9' : '#fff',
                                borderRadius: '4px',
                                border: '1px solid #e0e0e0'
                            }}
                        >
                            <div style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '50%',
                                backgroundColor: op.willCreate ? '#4caf50' : '#2196f3',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '12px',
                                color: 'white',
                                fontWeight: 'bold'
                            }}>
                                {op.type === 'create' ? '+' : op.type === 'update' ? '↑' : op.type === 'delete' ? '×' : '?'}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                    color: '#333',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}>
                                    {op.resourceType}: {op.resourceName}
                                    {op.exists ? (
                                        <span style={{
                                            fontSize: '10px',
                                            backgroundColor: '#fff3e0',
                                            color: '#ef6c00',
                                            padding: '2px 6px',
                                            borderRadius: '8px',
                                            fontWeight: 'bold'
                                        }}>
                                            EXISTS
                                        </span>
                                    ) : (
                                        <span style={{
                                            fontSize: '10px',
                                            backgroundColor: '#e8f5e8',
                                            color: '#2e7d32',
                                            padding: '2px 6px',
                                            borderRadius: '8px',
                                            fontWeight: 'bold'
                                        }}>
                                            NEW
                                        </span>
                                    )}
                                </div>
                                <div style={{
                                    fontSize: '12px',
                                    color: '#666'
                                }}>
                                    {op.type} operation • Dependencies: {op.dependenciesResolved ? 'Resolved' : 'Pending'}
                                    {op.exists && op.existingId && (
                                        <span style={{ marginLeft: '8px', fontFamily: 'monospace', fontSize: '11px' }}>
                                            ID: {op.existingId}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}

                    {!showDetails && operations.length > 3 && (
                        <div style={{
                            textAlign: 'center',
                            padding: '8px',
                            color: '#666',
                            fontSize: '12px'
                        }}>
                            ... and {operations.length - 3} more operations
                        </div>
                    )}
                </div>

                {/* Auto-creations warning */}
                {autoCreations.length > 0 && (
                    <div style={{
                        marginTop: '16px',
                        padding: '12px',
                        backgroundColor: '#fff3e0',
                        border: '1px solid #ff9800',
                        borderRadius: '4px'
                    }}>
                        <div style={{
                            fontSize: '14px',
                            fontWeight: 'bold',
                            color: '#e65100',
                            marginBottom: '4px'
                        }}>
                            ⚠️ Auto-created Dependencies
                        </div>
                        <div style={{ fontSize: '12px', color: '#bf360c' }}>
                            The following dependencies will be automatically created:
                            <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                                {autoCreations.map((ac: any, index: number) => (
                                    <li key={index}>{ac.type}: {ac.name}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}
            </div>

            {/* Action Buttons */}
            <div style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'flex-end',
                paddingTop: '16px',
                borderTop: '1px solid #e0e0e0'
            }}>
                <button
                    onClick={handleCancel}
                    style={{
                        padding: '10px 20px',
                        backgroundColor: '#f44336',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#d32f2f'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f44336'}
                >
                    ❌ Cancel
                </button>
                <button
                    onClick={handleConfirm}
                    style={{
                        padding: '10px 20px',
                        backgroundColor: '#4caf50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#388e3c'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#4caf50'}
                >
                    ✅ Confirm & Execute
                </button>
            </div>
        </div>
    );
};

const ProgressMessage: FC<ProgressMessageProps> = ({ message }) => {
    const progress = message.data?.progress || 0;
    const steps = message.data?.steps || [];
    const currentStep = message.data?.currentStep;
    const estimatedTimeRemaining = message.data?.estimatedTimeRemaining;

    // Find current active step for display
    const activeStep = steps.find((step: any) => step.status === 'active') ||
                      steps.find((step: any) => step.id === currentStep);

    // Format time remaining
    const formatTimeRemaining = (ms: number) => {
        if (ms < 60000) return '< 1m';
        const minutes = Math.ceil(ms / 60000);
        return `~${minutes}m`;
    };

    // Check if this progress message indicates completion
    const isCompleted = message.content.includes('✅') ||
                       message.content.toLowerCase().includes('completed') ||
                       message.content.toLowerCase().includes('finished') ||
                       message.content.toLowerCase().includes('success');

    // Check if this is an error state
    const isError = message.content.toLowerCase().includes('error') ||
                   message.content.toLowerCase().includes('failed') ||
                   message.content.toLowerCase().includes('❌');

    return (
        <div className="progress-message-enhanced" style={{
            background: isCompleted
                ? 'linear-gradient(135deg, rgba(76, 175, 80, 0.08), rgba(56, 142, 60, 0.05))'
                : isError
                ? 'linear-gradient(135deg, rgba(244, 67, 54, 0.08), rgba(211, 47, 47, 0.05))'
                : 'linear-gradient(135deg, rgba(33, 150, 243, 0.08), rgba(25, 118, 210, 0.05))',
            border: isCompleted
                ? '1px solid rgba(76, 175, 80, 0.2)'
                : isError
                ? '1px solid rgba(244, 67, 54, 0.2)'
                : '1px solid rgba(33, 150, 243, 0.2)',
            borderRadius: '12px',
            padding: '16px',
            margin: '8px 0',
            position: 'relative',
            overflow: 'hidden'
        }}>
            {/* Animated background gradient */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundImage: isCompleted
                    ? 'linear-gradient(45deg, transparent, rgba(76, 175, 80, 0.03), transparent)'
                    : isError
                    ? 'linear-gradient(45deg, transparent, rgba(244, 67, 54, 0.03), transparent)'
                    : 'linear-gradient(45deg, transparent, rgba(33, 150, 243, 0.03), transparent)',
                backgroundSize: '200% 200%',
                animation: isCompleted || isError ? 'none' : 'gradient-shift 3s ease infinite',
                pointerEvents: 'none'
            }} />

            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                position: 'relative',
                zIndex: 1
            }}>
                {/* Enhanced status indicator - changes based on completion state */}
                <div className="progress-ring-elegant" style={{
                    position: 'relative',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    {isCompleted ? (
                        // Completed state - static checkmark
                        <div style={{
                            fontSize: '20px',
                            color: '#4caf50',
                            fontWeight: 'bold'
                        }}>
                            ✓
                        </div>
                    ) : isError ? (
                        // Error state - static X
                        <div style={{
                            fontSize: '20px',
                            color: '#f44336',
                            fontWeight: 'bold'
                        }}>
                            ✗
                        </div>
                    ) : (
                        // In progress state - spinning animation
                        <>
                            {/* Outer ring - gradient border */}
                            <div style={{
                                position: 'absolute',
                                width: '32px',
                                height: '32px',
                                border: '3px solid transparent',
                                borderTop: '3px solid #2196f3',
                                borderRight: '3px solid #1976d2',
                                borderRadius: '50%',
                                animation: 'spin 1.5s linear infinite1'
                            }} />

                            {/* Inner ring - pulsing effect */}
                            <div style={{
                                position: 'absolute',
                                width: '16px',
                                height: '16px',
                                border: '2px solid #e3f2fd',
                                borderRadius: '50%',
                                animation: 'pulse-ring 1.5s ease-out infinite1'
                            }} />

                            {/* Center dot */}
                            <div style={{
                                width: '6px',
                                height: '6px',
                                backgroundColor: '#2196f3',
                                borderRadius: '50%',
                                animation: 'pulse-dot 1.5s ease-in-out infinite'
                            }} />
                        </>
                    )}
                </div>

                {/* Progress content */}
                <div style={{ flex: 1 }}>
                    <div style={{
                        fontSize: '15px',
                        fontWeight: '600',
                        color: '#1976d2',
                        marginBottom: '4px'
                    }}>
                        {message.content}
                    </div>

                    {/* Progress details */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        flexWrap: 'wrap'
                    }}>
                        {/* Progress percentage */}
                        {progress > 0 && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '13px',
                                color: '#1976d2',
                                fontWeight: '500'
                            }}>
                                <span>Progress:</span>
                                <span style={{
                                    backgroundColor: '#e3f2fd',
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                    fontWeight: 'bold'
                                }}>
                                    {Math.round(progress)}%
                                </span>
                            </div>
                        )}

                        {/* Current step info */}
                        {activeStep && (
                            <div style={{
                                fontSize: '13px',
                                color: '#666',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}>
                                <span>📋</span>
                                <span>{activeStep.label}</span>
                            </div>
                        )}

                        {/* Time remaining */}
                        {estimatedTimeRemaining && estimatedTimeRemaining > 0 && (
                            <div style={{
                                fontSize: '13px',
                                color: '#666',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}>
                                <span>⏱️</span>
                                <span>{formatTimeRemaining(estimatedTimeRemaining)} remaining</span>
                            </div>
                        )}
                    </div>

                    {/* Enhanced progress bar */}
                    {progress > 0 && (
                        <div style={{
                            marginTop: '12px',
                            width: '100%',
                            height: '6px',
                            backgroundColor: 'rgba(33, 150, 243, 0.1)',
                            borderRadius: '3px',
                            overflow: 'hidden',
                            position: 'relative'
                        }}>
                            <div style={{
                                width: `${progress}%`,
                                height: '100%',
                                background: 'linear-gradient(90deg, #2196f3, #1976d2)',
                                borderRadius: '3px',
                                transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                                position: 'relative'
                            }}>
                                {/* Animated shine effect */}
                                <div style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent)',
                                    animation: 'progress-fill 2s ease-in-out infinite'
                                }} />
                            </div>
                        </div>
                    )}

                    {/* Step indicators */}
                    {steps.length > 1 && (
                        <div style={{
                            display: 'flex',
                            gap: '8px',
                            marginTop: '12px',
                            flexWrap: 'wrap'
                        }}>
                            {steps.slice(0, 5).map((step: any, index: number) => (
                                <div
                                    key={step.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '4px 8px',
                                        borderRadius: '12px',
                                        fontSize: '11px',
                                        fontWeight: '500',
                                        backgroundColor: step.status === 'completed' ? '#e8f5e8' :
                                                       step.status === 'active' ? '#e3f2fd' : '#f5f5f5',
                                        color: step.status === 'completed' ? '#2e7d32' :
                                               step.status === 'active' ? '#1976d2' : '#666',
                                        border: step.status === 'active' ? '1px solid #2196f3' : '1px solid transparent',
                                        animation: step.status === 'active' ? 'pulse 2s infinite' : 'none'
                                    }}
                                >
                                    <span>
                                        {step.status === 'completed' ? '✓' :
                                         step.status === 'active' ? '🔄' :
                                         step.status === 'error' ? '✗' : '○'}
                                    </span>
                                    <span style={{ maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {step.label}
                                    </span>
                                </div>
                            ))}
                            {steps.length > 5 && (
                                <div style={{
                                    padding: '4px 8px',
                                    borderRadius: '12px',
                                    fontSize: '11px',
                                    fontWeight: '500',
                                    backgroundColor: '#f5f5f5',
                                    color: '#666'
                                }}>
                                    +{steps.length - 5} more
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
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

    // State for lazy chart loading in analytics messages
    const [showChart, setShowChart] = useState(false);

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
                // Special handling for analytics results
                if (message.data && (message.data.chartAvailable || (message.data.actions && message.data.type === 'analytics'))) {
                    return (
                        <div>
                            {/* Analytics summary text */}
                            {message.content && (
                                <div style={{ marginBottom: message.data.actions ? '16px' : '0' }}>
                                    <ExpandableText text={message.content} maxLength={500} />
                                </div>
                            )}

                            {/* Analytics action buttons */}
                            {message.data.actions && Array.isArray(message.data.actions) && message.data.actions.length > 0 && !showChart && (
                                <div style={{ marginTop: '16px' }}>
                                    {message.data.actions.map((action: any, index: number) => (
                                        <button
                                            key={index}
                                            onClick={() => {
                                                console.log('Analytics action clicked:', action);
                                                if (action.actionId === 'render_chart') {
                                                    setShowChart(true);
                                                }
                                            }}
                                            style={{
                                                marginRight: '8px',
                                                marginBottom: '8px',
                                                padding: '8px 16px',
                                                backgroundColor: '#1976d2',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                fontSize: '14px',
                                                fontWeight: '500'
                                            }}
                                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1565c0'}
                                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1976d2'}
                                        >
                                            {action.label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Lazy-loaded chart */}
                            {showChart && message.data.chartData && (
                                <div style={{ marginTop: '16px', width: '100%' }}>
                                    <AnalyticsChart
                                        chartData={message.data.chartData}
                                        chartId={`chart_msg_${message.id}_analytics`}
                                        title={message.data.chartData.title || 'Analytics Chart'}
                                        isLoading={false}
                                        onFilter={(filters) => console.log('Chart filtered:', filters)}
                                        onExport={(format) => console.log('Chart exported as:', format)}
                                    />
                                </div>
                            )}

                            {/* Analytics summary data (without actions) */}
                            {message.data && renderAnalyticsDataContent(message.data)}
                        </div>
                    );
                }

                // Regular response handling
                return (
                    <div>
                        {/* ✅ ONLY SHOW TEXT MESSAGE IF THERE IS NO GRID DATA ✅ */}
                        {/* ✅ SUPPRESS ALL TEXT WHEN ACTUAL RESULTS ARE PRESENT ✅ */}
                        {message.content && !messageContainsGridData(message.data) && (
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

            case 'confirmation':
                return <CrudConfirmation message={message} />;

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
                                    sortBy={message.data.sortBy}
                                    sortDirection={message.data.sortDirection}
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
                                    sortBy={message.data.sortBy}
                                    sortDirection={message.data.sortDirection}
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

    // Special function for rendering analytics data without actions (since actions are handled separately)
    const renderAnalyticsDataContent = (data: any) => {
        // Create a copy of data without actions to avoid table rendering
        const dataWithoutActions = { ...data };
        delete dataWithoutActions.actions;

        // Call the regular renderDataContent with actions removed
        return renderDataContent(dataWithoutActions);
    };

    // ✅ PERMANENT CHECK: Detect if message contains actual grid data
    const messageContainsGridData = (data: any): boolean => {
        if (!data) return false;
        
        const resultObject = data.results || data;
        
        // Check for search results format (multiple metadata arrays)
        if (typeof resultObject === 'object' && !Array.isArray(resultObject)) {
            const hasAnyResults = Object.values(resultObject).some(val => 
                Array.isArray(val) && val.length > 0
            );
            
            return hasAnyResults;
        }
        
        return false;
    };

    const renderDataContent = (data: any) => {
        // Handle recovery options - render as simple text suggestions instead of table
        if (data.recoveryOptions && Array.isArray(data.recoveryOptions)) {
            return (
                <div style={{ marginTop: '16px', fontSize: '14px', color: '#666' }}>
                    {data.recoveryOptions.map((option: any, index: number) => (
                        <div key={option.id || index} style={{ marginBottom: '8px' }}>
                            • {option.description}
                        </div>
                    ))}
                </div>
            );
        }

        // Handle tabular results - check for top-level object with arrays (search results) or nested results
        const resultObject = data.results || data; // Fall back to data itself if no .results

        // ✅ ALWAYS RENDER THE GRID. NO EXCEPTIONS.
        // ✅ Render for ANY search results, even partial, even if some types have 0 items
        // ✅ Removed the stupid check that was hiding actual data from users

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
                                    border: '2px solid #e3f2fd',
                                    borderRadius: '12px',
                                    overflow: 'hidden',
                                    maxHeight: '450px',
                                    overflowY: 'auto',
                                    boxShadow: '0 4px 16px rgba(33, 150, 243, 0.1)',
                                    width: '100%'
                                }}>
                                    <table style={{
                                        width: '100%',
                                        borderCollapse: 'collapse'
                                    }}>
                                        <thead>
                                            <tr style={{ 
                                                background: 'linear-gradient(135deg, #2196f3, #1976d2)',
                                                color: 'white'
                                            }}>
                                                <th style={{
                                                    padding: '12px 16px',
                                                    textAlign: 'left',
                                                    borderBottom: 'none',
                                                    fontWeight: '600',
                                                    fontSize: '13px',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.5px'
                                                }}>
                                                    🆔 ID
                                                </th>
                                                <th style={{
                                                    padding: '12px 16px',
                                                    textAlign: 'left',
                                                    borderBottom: 'none',
                                                    fontWeight: '600',
                                                    fontSize: '13px',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.5px'
                                                }}>
                                                    📋 Name
                                                </th>
                                                <th style={{
                                                    padding: '12px 16px',
                                                    textAlign: 'left',
                                                    borderBottom: 'none',
                                                    fontWeight: '600',
                                                    fontSize: '13px',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.5px'
                                                }}>
                                                    ℹ️ Description
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {items.slice(0, 10).map((item: any, index: number) => (
                                                <tr key={item.id || index} style={{
                                                    backgroundColor: index % 2 === 0 ? 'white' : '#f8fbff',
                                                    transition: 'background-color 0.2s ease'
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e3f2fd'}
                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = index % 2 === 0 ? 'white' : '#f8fbff'}
                                                >
                                                    <td style={{
                                                        padding: '12px 16px',
                                                        borderBottom: '1px solid #e0e0e0',
                                                        fontFamily: 'monospace',
                                                        fontSize: '12px',
                                                        maxWidth: '180px',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        color: '#1976d2',
                                                        fontWeight: '500'
                                                    }}>
                                                        {item.id || ''}
                                                    </td>
                                                    <td style={{
                                                        padding: '12px 16px',
                                                        borderBottom: '1px solid #e0e0e0',
                                                        fontSize: '14px',
                                                        maxWidth: '280px',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        fontWeight: '500',
                                                        color: '#333'
                                                    }}>
                                                        {item.name || ''}
                                                    </td>
                                                    <td style={{
                                                        padding: '12px 16px',
                                                        borderBottom: '1px solid #e0e0e0',
                                                        fontSize: '13px',
                                                        maxWidth: '350px',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        color: '#666'
                                                    }}>
                                                        {item.description || item.displayName || '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {items.length > 10 && (
                                        <div style={{
                                            padding: '14px',
                                            textAlign: 'center',
                                            background: 'linear-gradient(90deg, #e3f2fd, #bbdefb)',
                                            fontSize: '13px',
                                            color: '#1565c0',
                                            fontWeight: '500',
                                            borderTop: '1px solid #90caf9'
                                        }}>
                                            ➕ ... and {items.length - 10} more {items.length - 10 === 1 ? 'result' : 'results'}
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

        // Handle actions - render as buttons instead of table
        if (data.actions && Array.isArray(data.actions) && data.actions.length > 0) {
            return (
                <div style={{ marginTop: '16px' }}>
                    {data.actions.map((action: any, index: number) => (
                        <button
                            key={index}
                            onClick={() => {
                                console.log('Action clicked:', action);
                                // For now, just log - lazy loading implementation would go here
                                // Could call workflowOrchestrator.handleAnalyticsAction(action, message) or similar
                            }}
                            style={{
                                marginRight: '8px',
                                marginBottom: '8px',
                                padding: '8px 16px',
                                backgroundColor: '#1976d2',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: '500'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1565c0'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#1976d2'}
                        >
                            {action.label}
                        </button>
                    ))}
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
