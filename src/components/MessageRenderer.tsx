import React, { FC } from 'react';
import { ConversationMessage, workflowOrchestrator } from '../utils/workflow-orchestrator';
import AnalyticsChart from './AnalyticsChart';
import MetadataSelector, { MetadataOption } from './MetadataSelector';
import AggregateDataGrid from './AggregateDataGrid';
import TrackerDataGrid from './TrackerDataGrid';
import ResolutionSelector from './ResolutionSelector';

interface MessageRendererProps {
    message: ConversationMessage;
}

// Helper function to determine field type from header
const getFieldTypeFromHeader = (header: string): 'dataElement' | 'orgUnit' | 'period' | 'categoryOptionCombos' | 'attributeOptionCombos' | 'value' | null => {
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
                return <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>;

            case 'response':
                return (
                    <div>
                        {/* Text content */}
                        {message.content && (
                            <div style={{ marginBottom: message.data ? '16px' : '0' }}>
                                {message.content}
                            </div>
                        )}

                        {/* Render results data */}
                        {message.data && renderDataContent(message.data)}
                    </div>
                );

            case 'error':
                return (
                    <div style={{
                        backgroundColor: '#ffebee',
                        border: '1px solid #ef5350',
                        borderRadius: '4px',
                        padding: '12px',
                        color: '#c62828'
                    }}>
                        <strong>Error:</strong> {message.content}
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

        // Handle chart data
        if (data.data?.echarts_option || data.chart?.echarts_option || data.echarts_option) {
            const chartData = data.data || data.chart || data;
            // Use stable chart ID based on message ID to prevent re-rendering
            const stableChartId = chartData.chart_id || `chart_msg_${message.id}_${chartData.title || 'chart'}`.replace(/\s+/g, '_');

            return (
                <div style={{ marginTop: '16px', maxWidth: '600px' }}>
                    <AnalyticsChart
                        chartData={chartData}
                        chartId={stableChartId}
                        title={chartData.title || 'Analytics Chart'}
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
            marginBottom: '8px'
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

                {/* Message bubble */}
                <div style={{
                    backgroundColor: isUser ? '#2c6693' : 'white',
                    color: isUser ? 'white' : '#333',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    border: isUser ? 'none' : '1px solid #e0e0e0'
                }}>
                    {renderMessageContent()}
                </div>
            </div>
        </div>
    );
};

export default MessageRenderer;
