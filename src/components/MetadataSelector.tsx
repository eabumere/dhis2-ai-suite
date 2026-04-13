import React, { useState, useCallback, useEffect, useRef } from 'react';
import i18n from '@dhis2/d2-i18n';

export interface MetadataOption {
    name: string;
    id: string;
    type: 'indicator' | 'dataElement' | 'organisationUnit' | 'category' | 'categoryCombo' |
          'categoryOption' | 'dataSet' | 'program' | 'trackedEntityType' | 'trackedEntityAttribute' |
          'validationRule' | 'optionSet' | 'visualization' | 'dashboard' | 'user' | 'relationshipType' | 'action';
}

export interface MetadataSelectorProps {
    selectionOptions: MetadataOption[];
    originalQuery: string;
    onSelection: (selectedItems: MetadataOption[], selectedIndices: number[]) => void;
    allowMultiple?: boolean;
    title?: string;
    description?: string;
    allowCreateNew?: boolean;
    createNewLabel?: string;
    confirmButtonText?: string;
    onCreateNew?: () => void;
}

const MetadataSelector: React.FC<MetadataSelectorProps> = ({
    selectionOptions,
    originalQuery,
    onSelection,
    allowMultiple = true,
    title = "Select Metadata Items",
    description,
    allowCreateNew = false,
    createNewLabel = "Create New",
    confirmButtonText,
    onCreateNew
}) => {
    const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
    const [summaryExpanded, setSummaryExpanded] = useState(false);
    const [focusedIndex, setFocusedIndex] = useState<number>(-1);
    const containerRef = useRef<HTMLDivElement>(null);

    // Get unique types for filtering
    const availableTypes = React.useMemo(() => {
        const types = new Set(selectionOptions.map(opt => opt.type));
        return Array.from(types).sort();
    }, [selectionOptions]);

    // Filter and sort options based on search and type filters
    const filteredOptions = React.useMemo(() => {
        return selectionOptions
            .map((option, originalIndex) => ({ option, originalIndex }))
            .filter(({ option, originalIndex }) => {
                // Search filter
                const matchesSearch = !searchQuery ||
                    option.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    option.id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    option.type?.toLowerCase().includes(searchQuery.toLowerCase());

                // Type filter
                const matchesType = selectedTypes.size === 0 || selectedTypes.has(option.type);

                return matchesSearch && matchesType;
            })
            .sort((a, b) => {
                // Sort alphabetically by name, case-insensitive
                return a.option.name.toLowerCase().localeCompare(b.option.name.toLowerCase());
            });
    }, [selectionOptions, searchQuery, selectedTypes]);

    // Helper function to get human-readable type names
    const getTypeDisplayName = (type: string): string => {
        const typeMap: Record<string, string> = {
            indicator: 'Indicator',
            dataElement: 'Data Element',
            organisationUnit: 'Org Unit',
            category: 'Category',
            categoryCombo: 'Category Combo',
            categoryOption: 'Category Option',
            dataSet: 'Data Set',
            program: 'Program',
            trackedEntityType: 'Entity Type',
            trackedEntityAttribute: 'Entity Attribute',
            validationRule: 'Validation Rule',
            optionSet: 'Option Set',
            visualization: 'Visualization',
            dashboard: 'Dashboard',
            user: 'User',
            relationshipType: 'Relationship'
        };
        return typeMap[type] || type;
    };

    // Get type-specific styling
    const getTypeStyling = (type: string) => {
        const typeStyles = {
            indicator: { icon: '📊', color: 'var(--color-success)', bgColor: 'var(--color-success-50)' },
            dataElement: { icon: '📋', color: 'var(--color-info)', bgColor: 'var(--color-info-50)' },
            organisationUnit: { icon: '🏢', color: 'var(--color-warning)', bgColor: 'var(--color-warning-50)' },
            program: { icon: '🏥', color: 'var(--color-primary)', bgColor: 'var(--color-primary-50)' },
            dataSet: { icon: '📊', color: 'var(--color-secondary)', bgColor: 'var(--color-secondary-50)' },
            default: { icon: '📄', color: 'var(--color-gray-600)', bgColor: 'var(--color-gray-50)' }
        };
        return typeStyles[type as keyof typeof typeStyles] || typeStyles.default;
    };

    const handleItemToggle = useCallback((index: number) => {
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

    const handleTypeFilterToggle = useCallback((type: string) => {
        setSelectedTypes(prev => {
            const newSet = new Set(prev);
            if (newSet.has(type)) {
                newSet.delete(type);
            } else {
                newSet.add(type);
            }
            return newSet;
        });
    }, []);

    const handleProceed = useCallback(() => {
        if (selectedIndices.length === 0) return;
        const selectedItems = selectedIndices.map(index => selectionOptions[index]);
        onSelection(selectedItems, selectedIndices);
    }, [selectedIndices, selectionOptions, onSelection]);

    // Bulk actions
    const handleSelectAllVisible = useCallback(() => {
        const visibleIndices = filteredOptions.map(({ originalIndex }) => originalIndex);
        if (allowMultiple) {
            setSelectedIndices(prev => [...new Set([...prev, ...visibleIndices])]);
        } else if (visibleIndices.length > 0) {
            setSelectedIndices([visibleIndices[0]]);
        }
    }, [filteredOptions, allowMultiple]);

    const handleSelectNone = useCallback(() => {
        setSelectedIndices([]);
    }, []);

    const handleInvertSelection = useCallback(() => {
        if (!allowMultiple) return;
        const visibleIndices = filteredOptions.map(({ originalIndex }) => originalIndex);
        setSelectedIndices(prev => {
            const newSelection = [...prev];
            visibleIndices.forEach(index => {
                const currentIndex = newSelection.indexOf(index);
                if (currentIndex === -1) {
                    newSelection.push(index);
                } else {
                    newSelection.splice(currentIndex, 1);
                }
            });
            return newSelection;
        });
    }, [filteredOptions, allowMultiple]);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!containerRef.current?.contains(e.target as Node)) return;

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    setFocusedIndex(prev =>
                        prev < filteredOptions.length - 1 ? prev + 1 : 0
                    );
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    setFocusedIndex(prev =>
                        prev > 0 ? prev - 1 : filteredOptions.length - 1
                    );
                    break;
                case 'Enter':
                case ' ':
                    e.preventDefault();
                    if (focusedIndex >= 0 && focusedIndex < filteredOptions.length) {
                        handleItemToggle(filteredOptions[focusedIndex].originalIndex);
                    }
                    break;
                case 'Escape':
                    e.preventDefault();
                    setFocusedIndex(-1);
                    break;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [focusedIndex, filteredOptions, handleItemToggle]);

    if (!selectionOptions || selectionOptions.length === 0) {
        return (
            <div style={{
                padding: 'var(--space-6)',
                textAlign: 'center',
                color: 'var(--color-text-muted)',
                backgroundColor: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border-light)'
            }}>
                <div style={{ fontSize: 'var(--font-size-2xl)', marginBottom: 'var(--space-2)' }}>📭</div>
                <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-medium)' }}>
                    No selection options available
                </div>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            style={{
                backgroundColor: 'var(--color-bg-primary)',
                border: '1px solid var(--color-border-light)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-lg)',
                maxWidth: '800px',
                margin: '0 auto'
            }}
            tabIndex={-1}
        >
            {/* Header */}
            <div style={{
                padding: 'var(--space-4) var(--space-6)',
                background: 'linear-gradient(135deg, var(--color-primary-50), var(--color-primary-100))',
                borderBottom: '1px solid var(--color-border-light)',
                borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0'
            }}>
                <h3 style={{
                    margin: 0,
                    color: 'var(--color-primary-700)',
                    fontSize: 'var(--font-size-xl)',
                    fontWeight: 'var(--font-weight-semibold)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)'
                }}>
                    <span>🎯</span>
                    {title}
                </h3>
                <p style={{
                    margin: 'var(--space-2) 0 0 0',
                    color: 'var(--color-text-secondary)',
                    fontSize: 'var(--font-size-sm)'
                }}>
                    {description || `Found <strong>${selectionOptions.length}</strong> items for analysis of: <em>"${originalQuery}"</em>`}
                </p>
            </div>

            {/* Search and Filters */}
            <div style={{
                padding: 'var(--space-4) var(--space-6)',
                borderBottom: '1px solid var(--color-border-light)',
                backgroundColor: 'var(--color-gray-50)'
            }}>
                {/* Search */}
                <div style={{ marginBottom: 'var(--space-3)' }}>
                    <div style={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center'
                    }}>
                        <span style={{
                            position: 'absolute',
                            left: 'var(--space-3)',
                            color: 'var(--color-text-muted)',
                            fontSize: 'var(--font-size-sm)',
                            pointerEvents: 'none'
                        }}>🔍</span>
                        <input
                            type="text"
                            placeholder="Search by name, ID, or type..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                width: '100%',
                                padding: 'var(--space-3) var(--space-3) var(--space-3) var(--space-8)',
                                border: '1px solid var(--color-border-light)',
                                borderRadius: 'var(--radius-lg)',
                                fontSize: 'var(--font-size-sm)',
                                backgroundColor: 'var(--color-bg-primary)',
                                transition: 'var(--transition-fast)',
                                outline: 'none'
                            }}
                            onFocus={(e) => e.target.style.borderColor = 'var(--color-primary)'}
                            onBlur={(e) => e.target.style.borderColor = 'var(--color-border-light)'}
                        />
                    </div>
                </div>

                {/* Type Filters */}
                {availableTypes.length > 1 && (
                    <div>
                        <div style={{
                            fontSize: 'var(--font-size-sm)',
                            fontWeight: 'var(--font-weight-medium)',
                            color: 'var(--color-text-primary)',
                            marginBottom: 'var(--space-2)'
                        }}>
                            Filter by Type:
                        </div>
                        <div style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 'var(--space-2)'
                        }}>
                            {availableTypes.map(type => {
                                const isSelected = selectedTypes.has(type);
                                const typeStyle = getTypeStyling(type);
                                return (
                                    <button
                                        key={type}
                                        onClick={() => handleTypeFilterToggle(type)}
                                        style={{
                                            padding: 'var(--space-2) var(--space-3)',
                                            backgroundColor: isSelected ? typeStyle.color : 'var(--color-bg-primary)',
                                            color: isSelected ? 'var(--color-text-inverse)' : 'var(--color-text-primary)',
                                            border: `1px solid ${isSelected ? typeStyle.color : 'var(--color-border-light)'}`,
                                            borderRadius: 'var(--radius-lg)',
                                            cursor: 'pointer',
                                            fontSize: 'var(--font-size-xs)',
                                            fontWeight: isSelected ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)',
                                            transition: 'var(--transition-fast)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 'var(--space-1)'
                                        }}
                                        className="hover-lift"
                                    >
                                        <span>{typeStyle.icon}</span>
                                        <span>{getTypeDisplayName(type)}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Bulk Actions */}
            {allowMultiple && (
                <div style={{
                    padding: 'var(--space-3) var(--space-6)',
                    borderBottom: '1px solid var(--color-border-light)',
                    backgroundColor: 'var(--color-bg-secondary)'
                }}>
                    <div style={{
                        display: 'flex',
                        gap: 'var(--space-2)',
                        flexWrap: 'wrap',
                        alignItems: 'center'
                    }}>
                        <span style={{
                            fontSize: 'var(--font-size-sm)',
                            fontWeight: 'var(--font-weight-medium)',
                            color: 'var(--color-text-primary)'
                        }}>
                            Bulk Actions:
                        </span>
                        <button
                            onClick={handleSelectAllVisible}
                            style={{
                                padding: 'var(--space-2) var(--space-3)',
                                backgroundColor: 'var(--color-success)',
                                color: 'var(--color-text-inverse)',
                                border: 'none',
                                borderRadius: 'var(--radius-md)',
                                cursor: 'pointer',
                                fontSize: 'var(--font-size-xs)',
                                fontWeight: 'var(--font-weight-medium)',
                                transition: 'var(--transition-fast)'
                            }}
                            className="hover-lift"
                        >
                            Select All Visible
                        </button>
                        <button
                            onClick={handleInvertSelection}
                            style={{
                                padding: 'var(--space-2) var(--space-3)',
                                backgroundColor: 'var(--color-warning)',
                                color: 'var(--color-text-inverse)',
                                border: 'none',
                                borderRadius: 'var(--radius-md)',
                                cursor: 'pointer',
                                fontSize: 'var(--font-size-xs)',
                                fontWeight: 'var(--font-weight-medium)',
                                transition: 'var(--transition-fast)'
                            }}
                            className="hover-lift"
                        >
                            Invert Selection
                        </button>
                        <button
                            onClick={handleSelectNone}
                            style={{
                                padding: 'var(--space-2) var(--space-3)',
                                backgroundColor: 'var(--color-gray-600)',
                                color: 'var(--color-text-inverse)',
                                border: 'none',
                                borderRadius: 'var(--radius-md)',
                                cursor: 'pointer',
                                fontSize: 'var(--font-size-xs)',
                                fontWeight: 'var(--font-weight-medium)',
                                transition: 'var(--transition-fast)'
                            }}
                            className="hover-lift"
                        >
                            Clear All
                        </button>
                    </div>
                </div>
            )}

            {/* Selection Items - Card Layout */}
            <div style={{
                padding: 'var(--space-4) var(--space-6)',
                maxHeight: '400px',
                overflowY: 'auto'
            }}>
                {filteredOptions.length === 0 ? (
                    <div style={{
                        textAlign: 'center',
                        padding: 'var(--space-8)',
                        color: 'var(--color-text-muted)'
                    }}>
                        <div style={{ fontSize: 'var(--font-size-2xl)', marginBottom: 'var(--space-2)' }}>🔍</div>
                        <div>No items match your search criteria</div>
                    </div>
                ) : (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                        gap: 'var(--space-3)'
                    }}>
                        {filteredOptions.map(({ option, originalIndex }, index) => {
                            const isSelected = selectedIndices.includes(originalIndex);
                            const isFocused = focusedIndex === index;
                            const typeStyle = getTypeStyling(option.type);

                            return (
                                <div
                                    key={`${option.type}-${option.id}`}
                                    onClick={() => handleItemToggle(originalIndex)}
                                    style={{
                                        backgroundColor: 'var(--color-bg-primary)',
                                        border: `2px solid ${isSelected ? typeStyle.color : 'var(--color-border-light)'}`,
                                        borderRadius: 'var(--radius-lg)',
                                        padding: 'var(--space-4)',
                                        cursor: 'pointer',
                                        transition: 'var(--transition-fast)',
                                        boxShadow: isSelected ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                                        transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                                        position: 'relative',
                                        outline: isFocused ? '2px solid var(--color-primary)' : 'none',
                                        outlineOffset: '2px'
                                    }}
                                    className="hover-lift"
                                    tabIndex={0}
                                    onFocus={() => setFocusedIndex(index)}
                                    onBlur={() => setFocusedIndex(-1)}
                                >
                                    {/* Selection Checkbox */}
                                    <div style={{
                                        position: 'absolute',
                                        top: 'var(--space-2)',
                                        right: 'var(--space-2)'
                                    }}>
                                        <div style={{
                                            width: '20px',
                                            height: '20px',
                                            borderRadius: 'var(--radius-sm)',
                                            border: `2px solid ${isSelected ? typeStyle.color : 'var(--color-border-light)'}`,
                                            backgroundColor: isSelected ? typeStyle.color : 'var(--color-bg-primary)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            transition: 'var(--transition-fast)'
                                        }}>
                                            {isSelected && (
                                                <span style={{
                                                    color: 'var(--color-text-inverse)',
                                                    fontSize: 'var(--font-size-xs)',
                                                    fontWeight: 'var(--font-weight-bold)'
                                                }}>
                                                    ✓
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Item Content */}
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 'var(--space-3)'
                                    }}>
                                        {/* Type Icon */}
                                        <div style={{
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: 'var(--radius-lg)',
                                            backgroundColor: typeStyle.bgColor,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: 'var(--font-size-lg)',
                                            flexShrink: 0
                                        }}>
                                            {typeStyle.icon}
                                        </div>

                                        {/* Item Details */}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontSize: 'var(--font-size-sm)',
                                                fontWeight: 'var(--font-weight-semibold)',
                                                color: 'var(--color-text-primary)',
                                                marginBottom: 'var(--space-1)',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }}
                                            title={option.name}>
                                                {option.name}
                                            </div>
                                            <div style={{
                                                fontSize: 'var(--font-size-xs)',
                                                color: 'var(--color-text-secondary)',
                                                marginBottom: 'var(--space-1)'
                                            }}>
                                                Type: {getTypeDisplayName(option.type)}
                                            </div>
                                            <div style={{
                                                fontSize: 'var(--font-size-xs)',
                                                color: 'var(--color-text-muted)',
                                                fontFamily: 'monospace'
                                            }}>
                                                ID: {option.id}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Selection Indicator */}
                                    {isSelected && (
                                        <div style={{
                                            marginTop: 'var(--space-2)',
                                            padding: 'var(--space-1) var(--space-2)',
                                            backgroundColor: typeStyle.color,
                                            color: 'var(--color-text-inverse)',
                                            borderRadius: 'var(--radius-md)',
                                            fontSize: 'var(--font-size-xs)',
                                            fontWeight: 'var(--font-weight-semibold)',
                                            textAlign: 'center'
                                        }}>
                                            Selected ✓
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Expandable Selection Summary */}
            {selectedIndices.length > 0 && (
                <div style={{
                    borderTop: '1px solid var(--color-border-light)',
                    backgroundColor: 'var(--color-gray-50)'
                }}>
                    <button
                        onClick={() => setSummaryExpanded(!summaryExpanded)}
                        style={{
                            width: '100%',
                            padding: 'var(--space-3) var(--space-6)',
                            backgroundColor: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: 'var(--font-size-sm)',
                            fontWeight: 'var(--font-weight-medium)',
                            color: 'var(--color-primary-700)'
                        }}
                        className="hover-lift"
                    >
                        <span>
                            📋 Selected Items ({selectedIndices.length})
                        </span>
                        <span style={{
                            transform: summaryExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'var(--transition-fast)'
                        }}>
                            ▼
                        </span>
                    </button>

                    {summaryExpanded && (
                        <div style={{
                            padding: '0 var(--space-6) var(--space-4)',
                            maxHeight: '200px',
                            overflowY: 'auto'
                        }}>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                gap: 'var(--space-2)'
                            }}>
                                {selectedIndices.map(index => {
                                    const option = selectionOptions[index];
                                    const typeStyle = getTypeStyling(option.type);
                                    return (
                                        <div
                                            key={`${option.type}-${option.id}`}
                                            style={{
                                                backgroundColor: 'var(--color-bg-primary)',
                                                border: `1px solid ${typeStyle.color}`,
                                                borderRadius: 'var(--radius-md)',
                                                padding: 'var(--space-2)',
                                                fontSize: 'var(--font-size-xs)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 'var(--space-2)'
                                            }}
                                        >
                                            <span>{typeStyle.icon}</span>
                                            <span style={{
                                                flex: 1,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }}
                                            title={option.name}>
                                                {option.name}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Action Footer */}
            <div style={{
                padding: 'var(--space-4) var(--space-6)',
                borderTop: '1px solid var(--color-border-light)',
                backgroundColor: 'var(--color-bg-secondary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderRadius: '0 0 var(--radius-lg) var(--radius-lg)'
            }}>
                <div style={{
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-secondary)'
                }}>
                    {allowMultiple
                        ? `${selectedIndices.length} of ${selectionOptions.length} items selected`
                        : selectedIndices.length > 0 ? '1 item selected' : 'No selection'
                    }
                </div>

                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <button
                        onClick={() => onSelection([], [])}
                        style={{
                            padding: 'var(--space-2) var(--space-4)',
                            backgroundColor: 'var(--color-gray-600)',
                            color: 'var(--color-text-inverse)',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            cursor: 'pointer',
                            fontSize: 'var(--font-size-sm)',
                            fontWeight: 'var(--font-weight-medium)',
                            transition: 'var(--transition-fast)'
                        }}
                        className="hover-lift"
                    >
                        Cancel
                    </button>

                    {allowCreateNew && (
                        <button
                            onClick={onCreateNew}
                            style={{
                                padding: 'var(--space-2) var(--space-4)',
                                backgroundColor: 'var(--color-success)',
                                color: 'var(--color-text-inverse)',
                                border: 'none',
                                borderRadius: 'var(--radius-md)',
                                cursor: 'pointer',
                                fontSize: 'var(--font-size-sm)',
                                fontWeight: 'var(--font-weight-medium)',
                                transition: 'var(--transition-fast)'
                            }}
                            className="hover-lift"
                        >
                            ✨ {createNewLabel}
                        </button>
                    )}

                    <button
                        onClick={handleProceed}
                        disabled={selectedIndices.length === 0}
                        style={{
                            padding: 'var(--space-2) var(--space-4)',
                            backgroundColor: selectedIndices.length > 0 ? 'var(--color-primary)' : 'var(--color-gray-400)',
                            color: 'var(--color-text-inverse)',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            cursor: selectedIndices.length > 0 ? 'pointer' : 'not-allowed',
                            fontSize: 'var(--font-size-sm)',
                            fontWeight: 'var(--font-weight-semibold)',
                            transition: 'var(--transition-fast)',
                            boxShadow: selectedIndices.length > 0 ? 'var(--shadow-md)' : 'none'
                        }}
                        className={selectedIndices.length > 0 ? 'hover-lift' : ''}
                    >
                        {confirmButtonText || (allowMultiple ? `Analyze Selected (${selectedIndices.length})` : 'Select Item')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MetadataSelector;
