import React, {useCallback, useState} from 'react';

export interface ResolutionItem {
    rowIndex: number;
    colIndex: number;
    originalValue: string;
    fieldType: 'dataElement' | 'orgUnit' | 'categoryOptionCombos' | 'attributeOptionCombos';
    searchResults?: any[];
    resolvedId?: string;
    status: 'pending' | 'searching' | 'needs_selection' | 'resolved' | 'failed';
}

export interface AggregateDataGridProps {
    headers: string[];
    rows: any[][];
    resolutionState: [string, ResolutionItem][];
    resourceDetails?: Map<string, { exists: boolean; details?: any }>; // Batch validation results with COC details
    displayNames?: Map<string, string>; // Human-readable names for resolved IDs
    dataSetId?: string; // ID of the data set this data belongs to
    dataSetName?: string; // Name of the data set this data belongs to
    isExistingData?: boolean; // Whether this is existing data that can be edited after submission
    onResolveAll: () => void;
    onEditCell: (rowIndex: number, colIndex: number, newValue: string) => void;
    onDeleteRow: (rowIndex: number) => void;
    onConfirmSubmit: () => void;
    onResolveItem: (rowIndex: number, colIndex: number) => void;
    onUpdateDataSet?: () => void; // For updating existing data sets
    onAddRow?: () => void; // For adding new rows to existing data sets
}

const AggregateDataGrid: React.FC<AggregateDataGridProps> = ({
    headers,
    rows,
    resolutionState,
    resourceDetails,
    displayNames,
    dataSetId,
    dataSetName,
    isExistingData,
    onResolveAll,
    onEditCell,
    onDeleteRow,
    onConfirmSubmit,
    onResolveItem,
    onUpdateDataSet,
    onAddRow
}) => {
    const [editingCell, setEditingCell] = useState<{row: number, col: number} | null>(null);
    const [editValue, setEditValue] = useState('');

    // Create resolution state lookup map
    const resolutionMap = new Map(resolutionState);

    // Convert displayNames array back to Map if needed
    const displayNamesMap = displayNames instanceof Map ? displayNames : new Map(displayNames || []);

    // Convert resourceDetails array back to Map if needed
    const resourceDetailsMap = resourceDetails instanceof Map ? resourceDetails : new Map(resourceDetails || []);

    const getCellResolutionStatus = (rowIndex: number, colIndex: number) => {
        const key = `${rowIndex}-${colIndex}`;
        return resolutionMap.get(key);
    };

    const getCellStyle = (rowIndex: number, colIndex: number) => {
        const resolution = getCellResolutionStatus(rowIndex, colIndex);
        const baseStyle: React.CSSProperties = {
            padding: '8px 12px',
            borderBottom: '1px solid #e0e0e0',
            borderRight: '1px solid #e0e0e0',
            minWidth: '120px',
            maxWidth: '200px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
        };

        if (resolution) {
            switch (resolution.status) {
                case 'pending':
                    return { ...baseStyle, backgroundColor: '#fff3cd', border: '2px solid #ffc107' };
                case 'searching':
                    return { ...baseStyle, backgroundColor: '#d1ecf1', border: '2px solid #17a2b8' };
                case 'needs_selection':
                    return { ...baseStyle, backgroundColor: '#f8d7da', border: '2px solid #dc3545' };
                case 'resolved':
                    return { ...baseStyle, backgroundColor: '#d4edda', border: '2px solid #28a745' };
                case 'failed':
                    return { ...baseStyle, backgroundColor: '#f5c6cb', border: '2px solid #dc3545' };
                default:
                    return baseStyle;
            }
        }

        return baseStyle;
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'pending': return '⏳';
            case 'searching': return '🔍';
            case 'needs_selection': return '❓';
            case 'resolved': return '✅';
            case 'failed': return '❌';
            default: return '';
        }
    };

    const handleCellClick = useCallback((rowIndex: number, colIndex: number) => {
        const resolution = getCellResolutionStatus(rowIndex, colIndex);
        if (resolution && (resolution.status === 'pending' || resolution.status === 'failed')) {
            onResolveItem(rowIndex, colIndex);
        } else {
            // Allow editing if no resolution needed
            setEditingCell({ row: rowIndex, col: colIndex });
            setEditValue(rows[rowIndex][colIndex] || '');
        }
    }, [rows, resolutionMap, onResolveItem]);

    const handleEditSave = useCallback(() => {
        if (editingCell) {
            onEditCell(editingCell.row, editingCell.col, editValue);
            setEditingCell(null);
            setEditValue('');
        }
    }, [editingCell, editValue, onEditCell]);

    const handleEditCancel = useCallback(() => {
        setEditingCell(null);
        setEditValue('');
    }, []);

    const getCellTooltip = (rowIndex: number, colIndex: number) => {
        const resolution = getCellResolutionStatus(rowIndex, colIndex);

        if (!resolution) {
            return '';
        }

        const fieldTypeLabels = {
            dataElement: 'Data Element',
            orgUnit: 'Organisation Unit',
            categoryOptionCombos: 'Category Option Combo',
            attributeOptionCombos: 'Attribute Option Combo'
        };

        const fieldLabel = fieldTypeLabels[resolution.fieldType] || resolution.fieldType;

        let tooltip = `${fieldLabel} - ${resolution.status.charAt(0).toUpperCase() + resolution.status.slice(1)}`;

        if (resolution.resolvedId) {
            // Show human-readable name if available, otherwise show the resolved ID
            const resourceKey = `${resolution.fieldType}:${resolution.resolvedId}`;
            const humanName = displayNamesMap.get(resourceKey);
            if (humanName) {
                tooltip += `\nName: ${humanName}`;
            }
            tooltip += `\nID: ${resolution.resolvedId}`;
        } else if (resolution.originalValue) {
            tooltip += `\nOriginal: "${resolution.originalValue}"`;

            // Add detailed COC information if available
            if (resolution.fieldType === 'categoryOptionCombos' || resolution.fieldType === 'attributeOptionCombos') {
                const resourceKey = `${resolution.fieldType}:${resolution.resolvedId}`;
                const resourceDetail = resourceDetailsMap?.get(resourceKey);

                if (resourceDetail && typeof resourceDetail === 'object' && 'details' in resourceDetail && (resourceDetail as any).details) {
                    const details = (resourceDetail as any).details;

                    // Show category options that make up this COC
                    if (details.categoryOptions && details.categoryOptions.length > 0) {
                        const optionNames = details.categoryOptions.map((opt: any) => opt.name).join(' + ');
                        tooltip += `\nCombination: ${optionNames}`;
                    }

                    // Show categories this COC belongs to
                    if (details.categories && details.categories.length > 0) {
                        const categoryNames = details.categories.map((cat: any) => cat.name).join(', ');
                        tooltip += `\nCategories: ${categoryNames}`;
                    }

                    // Show COC name if different from combination
                    if (details.name && details.name !== resolution.originalValue) {
                        tooltip += `\nCOC Name: ${details.name}`;
                    }
                }
            }
        }

        if (resolution.status === 'failed') {
            tooltip += '\n\n⚠️ This resource was not found in DHIS2. Please check the name or provide a valid ID.';
        } else if (resolution.status === 'needs_selection') {
            tooltip += '\n\nClick to select from multiple matches found.';
        } else if (resolution.status === 'pending') {
            tooltip += '\n\nClick to resolve this name to an ID.';
        }

        return tooltip;
    };

    const unresolvedCount = resolutionState.filter(([, item]) => item.status !== 'resolved').length;
    const canSubmit = unresolvedCount === 0;

    return (
        <div style={{
            backgroundColor: '#f8f9fa',
            border: '1px solid #dee2e6',
            borderRadius: '8px',
            padding: '20px',
            maxWidth: '100%',
            overflow: 'auto'
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px'
            }}>
                <h3 style={{ margin: 0, color: '#495057' }}>
                    {isExistingData ? `${dataSetName || 'Data Set'} (${rows.length} rows)` : `Aggregate Data Upload (${rows.length} rows)`}
                </h3>
                <div style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center'
                }}>
                    {unresolvedCount > 0 && (
                        <span style={{
                            color: '#dc3545',
                            fontSize: '14px',
                            fontWeight: 'bold'
                        }}>
                            {unresolvedCount} items need resolution
                        </span>
                    )}

                    {/* Show different buttons based on whether this is existing data or new data */}
                    {isExistingData ? (
                        <>
                            {onUpdateDataSet && (
                                <button
                                    onClick={onUpdateDataSet}
                                    style={{
                                        padding: '8px 16px',
                                        backgroundColor: '#ffc107',
                                        color: 'black',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        fontWeight: 'bold'
                                    }}
                                >
                                    Update Data Set
                                </button>
                            )}
                            {onAddRow && (
                                <button
                                    onClick={onAddRow}
                                    style={{
                                        padding: '8px 16px',
                                        backgroundColor: '#17a2b8',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '14px'
                                    }}
                                >
                                    Add New Row
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            <button
                                onClick={onResolveAll}
                                disabled={unresolvedCount === 0}
                                style={{
                                    padding: '8px 16px',
                                    backgroundColor: unresolvedCount > 0 ? '#007bff' : '#6c757d',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: unresolvedCount > 0 ? 'pointer' : 'not-allowed',
                                    fontSize: '14px'
                                }}
                            >
                                Resolve All Pending
                            </button>
                            <button
                                onClick={onConfirmSubmit}
                                disabled={!canSubmit}
                                style={{
                                    padding: '8px 16px',
                                    backgroundColor: canSubmit ? '#28a745' : '#6c757d',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: canSubmit ? 'pointer' : 'not-allowed',
                                    fontSize: '14px',
                                    fontWeight: 'bold'
                                }}
                            >
                                Confirm & Submit
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Legend */}
            <div style={{
                display: 'flex',
                gap: '16px',
                marginBottom: '16px',
                flexWrap: 'wrap'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '16px', height: '16px', backgroundColor: '#fff3cd', border: '2px solid #ffc107' }}></div>
                    <span style={{ fontSize: '12px' }}>Pending Resolution</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '16px', height: '16px', backgroundColor: '#d1ecf1', border: '2px solid #17a2b8' }}></div>
                    <span style={{ fontSize: '12px' }}>Searching...</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '16px', height: '16px', backgroundColor: '#f8d7da', border: '2px solid #dc3545' }}></div>
                    <span style={{ fontSize: '12px' }}>Needs Selection</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '16px', height: '16px', backgroundColor: '#d4edda', border: '2px solid #28a745' }}></div>
                    <span style={{ fontSize: '12px' }}>Resolved</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '16px', height: '16px', backgroundColor: '#f5c6cb', border: '2px solid #dc3545' }}></div>
                    <span style={{ fontSize: '12px' }}>Failed</span>
                </div>
            </div>

            {/* Data Table */}
            <div style={{
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                overflow: 'auto',
                maxHeight: '400px'
            }}>
                <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    backgroundColor: 'white'
                }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f8f9fa' }}>
                            <th style={{
                                padding: '12px 8px',
                                borderBottom: '2px solid #dee2e6',
                                borderRight: '1px solid #dee2e6',
                                textAlign: 'left',
                                fontWeight: 'bold',
                                fontSize: '14px',
                                position: 'sticky',
                                top: 0,
                                backgroundColor: '#f8f9fa',
                                zIndex: 1
                            }}>
                                Row
                            </th>
                            {headers.map((header, index) => (
                                <th key={index} style={{
                                    padding: '12px 8px',
                                    borderBottom: '2px solid #dee2e6',
                                    borderRight: index < headers.length - 1 ? '1px solid #dee2e6' : 'none',
                                    textAlign: 'left',
                                    fontWeight: 'bold',
                                    fontSize: '14px',
                                    position: 'sticky',
                                    top: 0,
                                    backgroundColor: '#f8f9fa',
                                    zIndex: 1,
                                    minWidth: '120px'
                                }}>
                                    {header}
                                </th>
                            ))}
                            <th style={{
                                padding: '12px 8px',
                                borderBottom: '2px solid #dee2e6',
                                textAlign: 'center',
                                fontWeight: 'bold',
                                fontSize: '14px',
                                position: 'sticky',
                                top: 0,
                                backgroundColor: '#f8f9fa',
                                zIndex: 1
                            }}>
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, rowIndex) => (
                            <tr key={rowIndex} style={{
                                backgroundColor: rowIndex % 2 === 0 ? 'white' : '#f8f9fa'
                            }}>
                                <td style={{
                                    padding: '8px 12px',
                                    borderBottom: '1px solid #e0e0e0',
                                    borderRight: '1px solid #e0e0e0',
                                    fontSize: '12px',
                                    color: '#6c757d',
                                    textAlign: 'center'
                                }}>
                                    {rowIndex + 1}
                                </td>
                                {headers.map((header, colIndex) => {
                                    const rawCellValue = row[colIndex] || '';
                                    const resolution = getCellResolutionStatus(rowIndex, colIndex);
                                    const isEditing = editingCell?.row === rowIndex && editingCell?.col === colIndex;

                                    // Show human-readable name if available, otherwise show raw value
                                    let displayValue = rawCellValue;
                                    if (resolution?.resolvedId && displayNamesMap) {
                                        const resourceKey = `${resolution.fieldType}:${resolution.resolvedId}`;
                                        const humanName = displayNamesMap.get(resourceKey);
                                        if (humanName) {
                                            displayValue = humanName;
                                        }
                                    }

                                    return (
                                        <td
                                            key={colIndex}
                                            style={getCellStyle(rowIndex, colIndex)}
                                            onClick={() => !isEditing && handleCellClick(rowIndex, colIndex)}
                                            title={getCellTooltip(rowIndex, colIndex)}
                                        >
                                            {isEditing ? (
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    <input
                                                        type="text"
                                                        value={editValue}
                                                        onChange={(e) => setEditValue(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleEditSave();
                                                            if (e.key === 'Escape') handleEditCancel();
                                                        }}
                                                        style={{
                                                            flex: 1,
                                                            padding: '4px',
                                                            border: '1px solid #ced4da',
                                                            borderRadius: '3px',
                                                            fontSize: '12px'
                                                        }}
                                                        autoFocus
                                                    />
                                                    <button
                                                        onClick={handleEditSave}
                                                        style={{
                                                            padding: '4px 8px',
                                                            backgroundColor: '#28a745',
                                                            color: 'white',
                                                            border: 'none',
                                                            borderRadius: '3px',
                                                            fontSize: '10px',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        ✓
                                                    </button>
                                                    <button
                                                        onClick={handleEditCancel}
                                                        style={{
                                                            padding: '4px 8px',
                                                            backgroundColor: '#dc3545',
                                                            color: 'white',
                                                            border: 'none',
                                                            borderRadius: '3px',
                                                            fontSize: '10px',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        ✕
                                                    </button>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    {resolution && (
                                                        <span style={{ fontSize: '12px' }}>
                                                            {getStatusIcon(resolution.status)}
                                                        </span>
                                                    )}
                                                    <span style={{
                                                        fontSize: '12px',
                                                        cursor: resolution?.status === 'pending' || resolution?.status === 'failed' ? 'pointer' : 'default',
                                                        textDecoration: resolution?.status === 'pending' || resolution?.status === 'failed' ? 'underline' : 'none'
                                                    }}>
                                                        {displayValue}
                                                    </span>
                                                </div>
                                            )}
                                        </td>
                                    );
                                })}
                                <td style={{
                                    padding: '8px 12px',
                                    borderBottom: '1px solid #e0e0e0',
                                    textAlign: 'center'
                                }}>
                                    <button
                                        onClick={() => onDeleteRow(rowIndex)}
                                        style={{
                                            padding: '4px 8px',
                                            backgroundColor: '#dc3545',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '3px',
                                            fontSize: '10px',
                                            cursor: 'pointer'
                                        }}
                                        title="Delete this row"
                                    >
                                        🗑️
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {rows.length === 0 && (
                <div style={{
                    textAlign: 'center',
                    padding: '40px',
                    color: '#6c757d'
                }}>
                    No data rows to display
                </div>
            )}
        </div>
    );
};

export default AggregateDataGrid;
