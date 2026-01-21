import React, { FC, useState } from 'react';

// Import recovery types from agents (they have slightly different interfaces, so we'll define a common one)
export interface RecoveryOption {
    id: string;
    label: string;
    description: string;
    action: string; // Action identifier for the orchestrator
}

export interface RecoveryContext {
    failedStep: string;
    errorDetails: any;
    recoveryOptions: RecoveryOption[];
    userGuidance: string;
}

interface RecoveryModalProps {
    recoveryContext: RecoveryContext;
    onRecoveryAction: (actionId: string, data?: any) => void;
    onClose: () => void;
    isOpen: boolean;
}

const RecoveryModal: FC<RecoveryModalProps> = ({
    recoveryContext,
    onRecoveryAction,
    onClose,
    isOpen
}) => {
    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    const [additionalData, setAdditionalData] = useState<any>({});

    if (!isOpen) return null;

    const handleRecoveryAction = () => {
        if (selectedOption) {
            onRecoveryAction(selectedOption, additionalData);
            setSelectedOption(null);
            setAdditionalData({});
        }
    };

    const renderRecoveryOption = (option: RecoveryOption) => {
        const isSelected = selectedOption === option.id;

        return (
            <div
                key={option.id}
                style={{
                    border: `2px solid ${isSelected ? '#2196f3' : '#e0e0e0'}`,
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '12px',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? '#f3f9ff' : '#ffffff',
                    transition: 'all 0.2s ease'
                }}
                onClick={() => setSelectedOption(option.id)}
            >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <input
                        type="radio"
                        checked={isSelected}
                        onChange={() => setSelectedOption(option.id)}
                        style={{ marginTop: '2px' }}
                    />
                    <div style={{ flex: 1 }}>
                        <h4 style={{
                            margin: '0 0 4px 0',
                            color: '#1976d2',
                            fontSize: '16px',
                            fontWeight: 'bold'
                        }}>
                            {option.label}
                        </h4>
                        <p style={{
                            margin: '0',
                            color: '#666',
                            fontSize: '14px',
                            lineHeight: '1.4'
                        }}>
                            {option.description}
                        </p>
                    </div>
                </div>
            </div>
        );
    };

    const renderAdditionalInputs = () => {
        if (!selectedOption) return null;

        const option = recoveryContext.recoveryOptions.find(opt => opt.id === selectedOption);
        if (!option) return null;

        // Add specific inputs based on recovery action type
        switch (option.action) {
            case 'manual_data_entry':
                return (
                    <div style={{ marginTop: '16px', padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                        <h5 style={{ margin: '0 0 8px 0', color: '#495057' }}>Manual Data Entry</h5>
                        <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#666' }}>
                            You can manually enter the data that couldn't be processed automatically.
                        </p>
                        <textarea
                            placeholder="Enter the data in CSV format or as key-value pairs..."
                            value={additionalData.manualData || ''}
                            onChange={(e) => setAdditionalData({ ...additionalData, manualData: e.target.value })}
                            rows={4}
                            style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #ced4da',
                                borderRadius: '4px',
                                fontFamily: 'monospace',
                                fontSize: '13px'
                            }}
                        />
                    </div>
                );

            case 'select_alternative':
                return (
                    <div style={{ marginTop: '16px', padding: '16px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                        <h5 style={{ margin: '0 0 8px 0', color: '#495057' }}>Select Alternative</h5>
                        <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#666' }}>
                            Choose an alternative approach or data source.
                        </p>
                        <select
                            value={additionalData.alternative || ''}
                            onChange={(e) => setAdditionalData({ ...additionalData, alternative: e.target.value })}
                            style={{
                                width: '100%',
                                padding: '8px',
                                border: '1px solid #ced4da',
                                borderRadius: '4px'
                            }}
                        >
                            <option value="">Choose an alternative...</option>
                            <option value="different_file">Upload a different file</option>
                            <option value="manual_entry">Enter data manually</option>
                            <option value="skip_step">Skip this step</option>
                            <option value="contact_support">Contact support</option>
                        </select>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
        }}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                maxWidth: '600px',
                maxHeight: '80vh',
                width: '100%',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {/* Header */}
                <div style={{
                    padding: '20px 24px',
                    borderBottom: '1px solid #e0e0e0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <h3 style={{
                        margin: 0,
                        color: '#d32f2f',
                        fontSize: '18px',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        🔧 Recovery Required
                    </h3>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '24px',
                            cursor: 'pointer',
                            color: '#666',
                            padding: '0',
                            lineHeight: 1
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Content */}
                <div style={{
                    padding: '20px 24px',
                    overflowY: 'auto',
                    flex: 1
                }}>
                    {/* Error Summary */}
                    <div style={{
                        backgroundColor: '#ffebee',
                        border: '1px solid #ffcdd2',
                        borderRadius: '8px',
                        padding: '16px',
                        marginBottom: '20px'
                    }}>
                        <h4 style={{
                            margin: '0 0 8px 0',
                            color: '#c62828',
                            fontSize: '16px'
                        }}>
                            ⚠️ Issue: {recoveryContext.failedStep}
                        </h4>
                        {recoveryContext.userGuidance && (
                            <p style={{
                                margin: '0',
                                color: '#d32f2f',
                                fontSize: '14px',
                                lineHeight: '1.4'
                            }}>
                                {recoveryContext.userGuidance}
                            </p>
                        )}
                    </div>

                    {/* Recovery Options */}
                    <div style={{ marginBottom: '20px' }}>
                        <h4 style={{
                            margin: '0 0 12px 0',
                            color: '#333',
                            fontSize: '16px'
                        }}>
                            Choose a recovery option:
                        </h4>
                        {recoveryContext.recoveryOptions.map(renderRecoveryOption)}
                    </div>

                    {/* Additional Inputs */}
                    {renderAdditionalInputs()}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '16px 24px',
                    borderTop: '1px solid #e0e0e0',
                    display: 'flex',
                    gap: '12px',
                    justifyContent: 'flex-end'
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '8px 16px',
                            border: '1px solid #ddd',
                            backgroundColor: '#f5f5f5',
                            color: '#666',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleRecoveryAction}
                        disabled={!selectedOption}
                        style={{
                            padding: '8px 16px',
                            border: 'none',
                            backgroundColor: selectedOption ? '#2196f3' : '#cccccc',
                            color: 'white',
                            borderRadius: '4px',
                            cursor: selectedOption ? 'pointer' : 'not-allowed'
                        }}
                    >
                        Apply Recovery
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RecoveryModal;
