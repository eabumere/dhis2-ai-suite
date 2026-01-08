import React, { useState, useCallback } from 'react';
import i18n from '@dhis2/d2-i18n';

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
    onResolveAll: () => void;
    onEditCell: (rowIndex: number, colIndex: number, newValue: string) => void;
    onDeleteRow: (rowIndex: number) => void;
    onConfirmSubmit: () => void;
    onResolveItem: (rowIndex: number, colIndex: number) => void;
}

const AggregateDataGrid: React.FC<AggregateDataGridProps> = ({
    headers,
    rows,
    resolutionState,
    onResolveAll,
    onEditCell,
    onDeleteRow,
    onConfirmSubmit,
    onResolveItem
}) => {
    const [editingCell, setEditingCell] = useState<{row: number, col: number} | null>(null);
    const [editValue, setEditValue] = useState('');

    // Create resolution state lookup map
    const resolutionMap = new Map(resolutionState);

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
                    Aggregate Data Upload ({rows.length} rows)
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
                                    const cellValue = row[colIndex] || '';
                                    const resolution = getCellResolutionStatus(rowIndex, colIndex);
                                    const isEditing = editingCell?.row === rowIndex && editingCell?.col === colIndex;

                                    return (
                                        <td
                                            key={colIndex}
                                            style={getCellStyle(rowIndex, colIndex)}
                                            onClick={() => !isEditing && handleCellClick(rowIndex, colIndex)}
                                            title={resolution ? `${resolution.fieldType}: ${resolution.status}` : ''}
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
                                                        {cellValue}
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
