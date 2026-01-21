import React, { FC } from 'react';

export interface ProgressStep {
    id: string;
    label: string;
    description?: string;
    status: 'pending' | 'active' | 'completed' | 'error';
    progress?: number; // 0-100 for steps with sub-progress
}

interface ProgressIndicatorProps {
    steps: ProgressStep[];
    currentStep?: string;
    overallProgress?: number;
    messages?: string[];
    compact?: boolean;
}

const ProgressIndicator: FC<ProgressIndicatorProps> = ({
    steps,
    currentStep,
    overallProgress = 0,
    messages = [],
    compact = false
}) => {
    const getStepIcon = (status: ProgressStep['status']) => {
        switch (status) {
            case 'completed':
                return '✅';
            case 'active':
                return '🔄';
            case 'error':
                return '❌';
            case 'pending':
            default:
                return '⏳';
        }
    };

    const getStepColor = (status: ProgressStep['status']) => {
        switch (status) {
            case 'completed':
                return '#4caf50';
            case 'active':
                return '#2196f3';
            case 'error':
                return '#f44336';
            case 'pending':
            default:
                return '#9e9e9e';
        }
    };

    const getConnectorColor = (step: ProgressStep, isLast: boolean) => {
        if (step.status === 'completed') return '#4caf50';
        if (step.status === 'active') return '#2196f3';
        if (step.status === 'error') return '#f44336';
        return '#e0e0e0';
    };

    if (compact) {
        // Compact horizontal layout
        return (
            <div style={{
                backgroundColor: 'white',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '16px'
            }}>
                {/* Overall Progress Bar */}
                <div style={{ marginBottom: '12px' }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '8px'
                    }}>
                        <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#333' }}>
                            Overall Progress
                        </span>
                        <span style={{ fontSize: '12px', color: '#666' }}>
                            {Math.round(overallProgress)}%
                        </span>
                    </div>
                    <div style={{
                        width: '100%',
                        height: '8px',
                        backgroundColor: '#e0e0e0',
                        borderRadius: '4px',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            width: `${overallProgress}%`,
                            height: '100%',
                            backgroundColor: '#2196f3',
                            transition: 'width 0.3s ease'
                        }} />
                    </div>
                </div>

                {/* Current Step Info */}
                {currentStep && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '14px',
                        color: '#666'
                    }}>
                        <span>🔄</span>
                        <span>
                            {steps.find(s => s.id === currentStep)?.label || currentStep}
                        </span>
                    </div>
                )}

                {/* Latest Message */}
                {messages.length > 0 && (
                    <div style={{
                        marginTop: '8px',
                        fontSize: '13px',
                        color: '#666',
                        fontStyle: 'italic'
                    }}>
                        {messages[messages.length - 1]}
                    </div>
                )}
            </div>
        );
    }

    // Full vertical layout
    return (
        <div style={{
            backgroundColor: 'white',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '16px',
            maxWidth: '500px'
        }}>
            <h4 style={{
                margin: '0 0 16px 0',
                color: '#333',
                fontSize: '16px',
                fontWeight: 'bold'
            }}>
                🔄 Workflow Progress
            </h4>

            {/* Overall Progress */}
            <div style={{ marginBottom: '20px' }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px'
                }}>
                    <span style={{ fontSize: '14px', color: '#666' }}>Overall Progress</span>
                    <span style={{ fontSize: '12px', color: '#666' }}>{Math.round(overallProgress)}%</span>
                </div>
                <div style={{
                    width: '100%',
                    height: '6px',
                    backgroundColor: '#f0f0f0',
                    borderRadius: '3px',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        width: `${overallProgress}%`,
                        height: '100%',
                        backgroundColor: '#2196f3',
                        transition: 'width 0.5s ease'
                    }} />
                </div>
            </div>

            {/* Steps */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {steps.map((step, index) => {
                    const isLast = index === steps.length - 1;
                    const stepColor = getStepColor(step.status);

                    return (
                        <div key={step.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                            {/* Step Icon */}
                            <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                backgroundColor: stepColor,
                                color: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '14px',
                                flexShrink: 0,
                                marginTop: '2px'
                            }}>
                                {getStepIcon(step.status)}
                            </div>

                            {/* Step Content */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                    color: stepColor,
                                    marginBottom: '2px'
                                }}>
                                    {step.label}
                                </div>
                                {step.description && (
                                    <div style={{
                                        fontSize: '12px',
                                        color: '#666',
                                        marginBottom: '4px',
                                        lineHeight: '1.3'
                                    }}>
                                        {step.description}
                                    </div>
                                )}

                                {/* Step Progress Bar (if applicable) */}
                                {step.progress !== undefined && step.status === 'active' && (
                                    <div style={{ marginTop: '6px' }}>
                                        <div style={{
                                            width: '100%',
                                            height: '4px',
                                            backgroundColor: '#f0f0f0',
                                            borderRadius: '2px',
                                            overflow: 'hidden'
                                        }}>
                                            <div style={{
                                                width: `${step.progress}%`,
                                                height: '100%',
                                                backgroundColor: stepColor,
                                                transition: 'width 0.3s ease'
                                            }} />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Connector Line (except for last item) */}
                            {!isLast && (
                                <div style={{
                                    position: 'absolute',
                                    left: '16px',
                                    top: '44px',
                                    width: '2px',
                                    height: '32px',
                                    backgroundColor: getConnectorColor(step, isLast)
                                }} />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Current Messages */}
            {messages.length > 0 && (
                <div style={{
                    marginTop: '20px',
                    padding: '12px',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '4px',
                    border: '1px solid #e9ecef'
                }}>
                    <div style={{
                        fontSize: '12px',
                        color: '#666',
                        marginBottom: '4px',
                        fontWeight: 'bold'
                    }}>
                        📋 Status Messages:
                    </div>
                    <div style={{
                        fontSize: '12px',
                        color: '#666',
                        maxHeight: '80px',
                        overflowY: 'auto'
                    }}>
                        {messages.slice(-3).map((message, index) => (
                            <div key={index} style={{ marginBottom: '2px' }}>
                                • {message}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProgressIndicator;
