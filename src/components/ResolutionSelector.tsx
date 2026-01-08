import React, { useState, useCallback } from 'react';

export interface ResolutionOption {
    id: string;
    name: string;
    description?: string;
}

export interface ResolutionSelectorProps {
    fieldType: 'dataElement' | 'orgUnit' | 'categoryOptionCombos' | 'attributeOptionCombos';
    searchQuery: string;
    options: ResolutionOption[];
    rowIndex: number;
    colIndex: number;
    onSelection: (selectedId: string, rowIndex: number, colIndex: number) => void;
    onSkip: (rowIndex: number, colIndex: number) => void;
    onRetry: (rowIndex: number, colIndex: number) => void;
}

const ResolutionSelector: React.FC<ResolutionSelectorProps> = ({
    fieldType,
    searchQuery,
    options,
    rowIndex,
    colIndex,
    onSelection,
    onSkip,
    onRetry
}) => {
    const [selectedId, setSelectedId] = useState<string>('');

    const getFieldTypeDisplayName = (type: string) => {
        switch (type) {
            case 'dataElement': return 'Data Element';
            case 'orgUnit': return 'Organisation Unit';
            case 'categoryOptionCombos': return 'Category Option Combo';
            case 'attributeOptionCombos': return 'Attribute Option Combo';
            default: return type;
        }
    };

    const handleOptionSelect = useCallback((optionId: string) => {
        setSelectedId(optionId);
    }, []);

    const handleConfirm = useCallback(() => {
        if (selectedId) {
            onSelection(selectedId, rowIndex, colIndex);
        }
    }, [selectedId, rowIndex, colIndex, onSelection]);

    const handleSkip = useCallback(() => {
        onSkip(rowIndex, colIndex);
    }, [rowIndex, colIndex, onSkip]);

    const handleRetry = useCallback(() => {
        onRetry(rowIndex, colIndex);
    }, [rowIndex, colIndex, onRetry]);

    if (!options || options.length === 0) {
        return (
            <div style={{
                backgroundColor: '#f8d7da',
                border: '1px solid #f5c6cb',
                borderRadius: '8px',
                padding: '20px',
                textAlign: 'center'
            }}>
                <h4 style={{ color: '#721c24', marginTop: 0 }}>
                    No matches found for "{searchQuery}"
                </h4>
                <p style={{ color: '#721c24', marginBottom: '16px' }}>
                    Could not find any {getFieldTypeDisplayName(fieldType).toLowerCase()} matching your search.
                </p>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                    <button
                        onClick={handleRetry}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px'
                        }}
                    >
                        Try Different Search
                    </button>
                    <button
                        onClick={handleSkip}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: '#6c757d',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px'
                        }}
                    >
                        Skip This Item
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={{
            backgroundColor: '#e3f2fd',
            border: '1px solid #2196f3',
            borderRadius: '8px',
            padding: '20px',
            maxWidth: '600px'
        }}>
            <h4 style={{
                color: '#1565c0',
                marginTop: 0,
                marginBottom: '8px'
            }}>
                Select {getFieldTypeDisplayName(fieldType)}
            </h4>

            <p style={{
                color: '#666',
                marginBottom: '16px',
                fontSize: '14px'
            }}>
                Found {options.length} possible match{options.length !== 1 ? 'es' : ''} for "{searchQuery}".
                Please select the correct one:
            </p>

            {/* Options List */}
            <div style={{
                maxHeight: '300px',
                overflowY: 'auto',
                marginBottom: '16px'
            }}>
                {options.map((option) => (
                    <div
                        key={option.id}
                        onClick={() => handleOptionSelect(option.id)}
                        style={{
                            padding: '12px 16px',
                            marginBottom: '8px',
                            backgroundColor: selectedId === option.id ? '#2196f3' : '#ffffff',
                            color: selectedId === option.id ? '#ffffff' : '#333',
                            border: `2px solid ${selectedId === option.id ? '#1976d2' : '#e0e0e0'}`,
                            borderRadius: '6px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <div style={{
                            fontWeight: 'bold',
                            fontSize: '14px',
                            marginBottom: '4px'
                        }}>
                            {option.name}
                        </div>
                        {option.description && (
                            <div style={{
                                fontSize: '12px',
                                opacity: selectedId === option.id ? 0.9 : 0.7
                            }}>
                                {option.description}
                            </div>
                        )}
                        <div style={{
                            fontSize: '11px',
                            fontFamily: 'monospace',
                            opacity: selectedId === option.id ? 0.8 : 0.6,
                            marginTop: '4px'
                        }}>
                            ID: {option.id}
                        </div>
                    </div>
                ))}
            </div>

            {/* Action Buttons */}
            <div style={{
                display: 'flex',
                gap: '8px',
                justifyContent: 'flex-end'
            }}>
                <button
                    onClick={handleRetry}
                    style={{
                        padding: '8px 16px',
                        backgroundColor: '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px'
                    }}
                >
                    Search Again
                </button>
                <button
                    onClick={handleSkip}
                    style={{
                        padding: '8px 16px',
                        backgroundColor: '#ffc107',
                        color: '#212529',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px'
                    }}
                >
                    Skip This Item
                </button>
                <button
                    onClick={handleConfirm}
                    disabled={!selectedId}
                    style={{
                        padding: '8px 16px',
                        backgroundColor: selectedId ? '#28a745' : '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: selectedId ? 'pointer' : 'not-allowed',
                        fontSize: '14px',
                        fontWeight: 'bold'
                    }}
                >
                    Confirm Selection
                </button>
            </div>

            {/* Selection Summary */}
            {selectedId && (
                <div style={{
                    marginTop: '12px',
                    padding: '8px',
                    backgroundColor: '#d4edda',
                    borderRadius: '4px',
                    border: '1px solid #c3e6cb'
                }}>
                    <strong style={{ color: '#155724' }}>Selected:</strong>
                    <div style={{ color: '#155724', marginTop: '4px' }}>
                        {options.find(opt => opt.id === selectedId)?.name} (ID: {selectedId})
                    </div>
                </div>
            )}
        </div>
    );
};

export default ResolutionSelector;
