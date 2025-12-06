import React, { FC } from 'react';
import { ConversationMessage } from '../utils/workflow-orchestrator';
import AnalyticsChart from './AnalyticsChart';
import AnalyticsMetadataSelector, { MetadataOption } from './AnalyticsMetadataSelector';

interface MessageRendererProps {
    message: ConversationMessage;
}

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
                            <div style={{ backgroundColor: 'white', padding: '12px', borderRadius: '4px' }}>
                                <AnalyticsMetadataSelector
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

            default:
                return <div>{message.content}</div>;
        }
    };

    const renderDataContent = (data: any) => {
        // Handle tabular results
        if (data.results && Array.isArray(Object.values(data.results)[0])) {
            return (
                <div style={{ marginTop: '16px' }}>
                    {Object.entries(data.results).map(([type, items]: [string, any]) => {
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
                                                    Name
                                                </th>
                                                <th style={{
                                                    padding: '8px 12px',
                                                    textAlign: 'left',
                                                    borderBottom: '1px solid #ddd',
                                                    fontWeight: 'bold',
                                                    fontSize: '12px'
                                                }}>
                                                    Code
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
                                                        fontFamily: 'monospace',
                                                        fontSize: '12px'
                                                    }}>
                                                        {item.code || ''}
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
