import React, { useState, useCallback } from 'react';
import i18n from '@dhis2/d2-i18n';

export interface MetadataOption {
    name: string;
    id: string;
    type: 'indicator' | 'dataElement' | 'organisationUnit' | 'category' | 'categoryCombo' |
          'categoryOption' | 'dataSet' | 'program' | 'trackedEntityType' | 'trackedEntityAttribute' |
          'validationRule' | 'optionSet' | 'visualization' | 'dashboard' | 'user' | 'relationshipType';
}

export interface MetadataSelectorProps {
    selectionOptions: MetadataOption[];
    originalQuery: string;
    onSelection: (selectedItems: MetadataOption[], selectedIndices: number[]) => void;
    allowMultiple?: boolean;
}

const MetadataSelector: React.FC<MetadataSelectorProps> = ({
    selectionOptions,
    originalQuery,
    onSelection,
    allowMultiple = true
}) => {
    const [selectedIndices, setSelectedIndices] = useState<number[]>([]);

    // Helper function to get human-readable type names
    const getTypeDisplayName = (type: string): string => {
        const typeMap: Record<string, string> = {
            indicator: 'indicator',
            dataElement: 'data element',
            organisationUnit: 'organisation unit',
            category: 'category',
            categoryCombo: 'category combination',
            categoryOption: 'category option',
            dataSet: 'data set',
            program: 'program',
            trackedEntityType: 'tracked entity type',
            trackedEntityAttribute: 'tracked entity attribute',
            validationRule: 'validation rule',
            optionSet: 'option set',
            visualization: 'visualization',
            dashboard: 'dashboard',
            user: 'user',
            relationshipType: 'relationship type'
        };
        return typeMap[type] || type;
    };

    // Helper function to get plural form
    const getPluralForm = (type: string, count: number): string => {
        if (count === 1) return getTypeDisplayName(type);
        // Simple pluralization - could be enhanced for irregular plurals
        return `${getTypeDisplayName(type)}${getTypeDisplayName(type).endsWith('y') ?
            getTypeDisplayName(type).slice(0, -1) + 'ies' :
            getTypeDisplayName(type) + 's'}`;
    };

    // Analyze types present in selection options
    const typeAnalysis = React.useMemo(() => {
        const types = new Set(selectionOptions.map(opt => opt.type));
        const uniqueTypes = Array.from(types);

        if (uniqueTypes.length === 1) {
            // Single type
            const type = uniqueTypes[0];
            return {
                displayText: `${selectionOptions.length} potential ${getPluralForm(type, selectionOptions.length)}`,
                type: type
            };
        } else if (uniqueTypes.length === 2 && uniqueTypes.includes('indicator') && uniqueTypes.includes('dataElement')) {
            // Special case for the common indicator/dataElement combination
            return {
                displayText: `${selectionOptions.length} potential indicators/data elements`,
                type: 'mixed'
            };
        } else {
            // Multiple different types
            return {
                displayText: `${selectionOptions.length} potential metadata items`,
                type: 'mixed'
            };
        }
    }, [selectionOptions]);

    const handleChipClick = useCallback((index: number) => {
        if (allowMultiple) {
            setSelectedIndices(prev => {
                if (prev.includes(index)) {
                    return prev.filter(i => i !== index);
                } else {
                    return [...prev, index];
                }
            });
        } else {
            setSelectedIndices([index]);
        }
    }, [allowMultiple]);

    const handleProceed = useCallback(() => {
        if (selectedIndices.length === 0) return;

        const selectedItems = selectedIndices.map(index => selectionOptions[index]);
        onSelection(selectedItems, selectedIndices);
    }, [selectedIndices, selectionOptions, onSelection]);

    const handleSelectAll = useCallback(() => {
        setSelectedIndices(selectionOptions.map((_, index) => index));
    }, [selectionOptions]);

    const handleSelectNone = useCallback(() => {
        setSelectedIndices([]);
    }, []);

    if (!selectionOptions || selectionOptions.length === 0) {
        return (
            <div style={{
                padding: '20px',
                textAlign: 'center',
                color: '#666',
                backgroundColor: '#f8f9fa',
                borderRadius: '4px',
                border: '1px solid #e0e0e0'
            }}>
                No selection options available
            </div>
        );
    }

    return (
        <div style={{
            backgroundColor: '#e3f2fd',
            border: '1px solid #2196f3',
            borderRadius: '4px',
            padding: '20px'
        }}>
            <h4 style={{
                color: '#1565c0',
                marginBottom: '15px',
                marginTop: '0'
            }}>
                Select Metadata
            </h4>

            <p style={{
                color: '#666',
                marginBottom: '20px',
                fontSize: '14px'
            }}>
                Found {typeAnalysis.displayText} for analysis of: <em>"{originalQuery}"</em>
                <br />
                {allowMultiple
                    ? 'Select one or more items to use for the analysis:'
                    : 'Select the item to use for analysis:'
                }
            </p>

            {/* Selection Controls */}
            {allowMultiple && selectionOptions.length > 1 && (
                <div style={{
                    display: 'flex',
                    gap: '10px',
                    marginBottom: '15px',
                    alignItems: 'center'
                }}>
                    <button
                        onClick={handleSelectAll}
                        style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            backgroundColor: '#2196f3',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer'
                        }}
                    >
                        Select All
                    </button>
                    <button
                        onClick={handleSelectNone}
                        style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            backgroundColor: '#ffffff',
                            color: '#2196f3',
                            border: '1px solid #2196f3',
                            borderRadius: '3px',
                            cursor: 'pointer'
                        }}
                    >
                        Select None
                    </button>
                </div>
            )}

            {/* Selection Options as Chips */}
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '10px',
                marginBottom: '20px'
            }}>
                {selectionOptions.map((option, index) => {
                    const isSelected = selectedIndices.includes(index);
                    const displayName = option.type === 'indicator' ? `📊 ${option.name}` : `📋 ${option.name}`;

                    return (
                        <button
                            key={`${option.type}-${option.id}`}
                            onClick={() => handleChipClick(index)}
                            style={{
                                padding: '8px 16px',
                                backgroundColor: isSelected ? '#2196f3' : '#ffffff',
                                color: isSelected ? '#ffffff' : '#2196f3',
                                border: `1px solid ${isSelected ? '#1976d2' : '#2196f3'}`,
                                borderRadius: '20px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: isSelected ? 'bold' : 'normal',
                                transition: 'all 0.2s ease',
                                maxWidth: '400px',
                                textAlign: 'left',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                            }}
                            title={`${option.type}: ${option.name} (ID: ${option.id})`}
                        >
                            {displayName}
                        </button>
                    );
                })}
            </div>

            {/* Action Button */}
            <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px'
            }}>
                <button
                    onClick={handleProceed}
                    disabled={selectedIndices.length === 0}
                    style={{
                        padding: '10px 20px',
                        fontSize: '14px',
                        backgroundColor: selectedIndices.length > 0 ? '#2196f3' : '#cccccc',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: selectedIndices.length > 0 ? 'pointer' : 'not-allowed',
                        fontWeight: 'bold'
                    }}
                >
                    Analyze Selected ({selectedIndices.length})
                </button>
            </div>

            {/* Selection Summary */}
            {selectedIndices.length > 0 && (
                <div style={{
                    marginTop: '15px',
                    padding: '10px',
                    backgroundColor: '#ffffff',
                    borderRadius: '4px',
                    border: '1px solid #e0e0e0'
                }}>
                    <strong>Selected for analysis:</strong>
                    <ul style={{ margin: '5px 0 0 20px', color: '#666' }}>
                        {selectedIndices.map(index => {
                            const option = selectionOptions[index];
                            return (
                                <li key={`${option.type}-${option.id}`}>
                                    {option.type === 'indicator' ? '📊' : '📋'} {option.name}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default MetadataSelector;
