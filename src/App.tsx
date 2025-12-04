import { useDataQuery } from '@dhis2/app-runtime'
import i18n from '@dhis2/d2-i18n'
import React, { FC, useState } from 'react'
import classes from './App.module.css'
import { stateGraphAgent } from './agents/state-graph-agent'
import {DataEngineProvider} from "./utils/app-runtime/data-engine.provider";
import AnalyticsChart from './components/AnalyticsChart';

interface QueryResults {
    me: {
        name: string
    }
}

const query = {
    me: {
        resource: 'me',
    },
}

interface MetadataResult {
    [key: string]: any[];
}

const MyApp: FC = () => {
    const {error, loading, data} = useDataQuery<QueryResults>(query)
    // Universal query state for multi-agent architecture
    const [universalQuery, setUniversalQuery] = useState<string>('')
    const [queryResults, setQueryResults] = useState<any>(null)
    const [isProcessing, setIsProcessing] = useState<boolean>(false)
    const [queryErrorMessage, setQueryErrorMessage] = useState<string>('')

    // Unified handler for multi-agent routing
    const handleUniversalQuery = async () => {
        if (!universalQuery.trim()) {
            setQueryErrorMessage('Please enter a query')
            return
        }

        setIsProcessing(true)
        setQueryErrorMessage('')
        setQueryResults(null)

        try {
            // Use state graph agent (eliminates recursion with structured workflow)
            const result = await stateGraphAgent.invoke({
                messages: [{ role: 'user', content: universalQuery }]
            })

            // StateGraph returns final state, extract finalResult
            if (result.finalResult) {
                setQueryResults(result.finalResult)
            } else if (result.error) {
                setQueryResults({
                    success: false,
                    error: result.error,
                    type: 'unknown'
                })
            } else {
                setQueryResults({
                    success: false,
                    message: 'No result returned from agent',
                    type: 'unknown'
                })
            }
        } catch (error) {
            console.error('Error processing query:', error)
            setQueryErrorMessage(`Error processing query: ${error.message}`)
        } finally {
            setIsProcessing(false)
        }
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleUniversalQuery()
        }
    }

    if (error) {
        return <span>{i18n.t('ERROR')}</span>
    }

    if (loading) {
        return <span>{i18n.t('Loading...')}</span>
    }

    return (
        <div className={classes.container}>
            <h1>{i18n.t('Hello {{name}}', {name: data?.me?.name})}</h1>
            <h3>{i18n.t('DHIS2 Multi-Agent Metadata Assistant')}</h3>

            {/* Universal Query Section */}
            <div style={{marginTop: '40px', maxWidth: '600px', width: '100%'}}>
                <h3 style={{color: '#2c6693', borderBottom: '1px solid #e0e0e0', paddingBottom: '5px'}}>
                    {i18n.t('Ask Anything')}
                </h3>
                <p style={{color: '#666', marginBottom: '15px'}}>
                    Describe what you want to do - search for existing metadata, create new resources, update configurations, etc.
                </p>

                <div style={{display: 'flex', gap: '10px', marginBottom: '10px'}}>
                    <input
                        type="text"
                        value={universalQuery}
                        onChange={(e) => setUniversalQuery(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder={i18n.t('e.g., "Find all data elements with HIV", "Create a program for maternal health", "Show me programs about malaria"')}
                        disabled={isProcessing}
                        style={{
                            flex: 1,
                            padding: '10px',
                            fontSize: '16px',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            outline: 'none'
                        }}
                    />
                    <button
                        onClick={handleUniversalQuery}
                        disabled={isProcessing}
                        style={{
                            padding: '10px 20px',
                            fontSize: '16px',
                            backgroundColor: '#2c6693',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: isProcessing ? 'not-allowed' : 'pointer',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {isProcessing ? i18n.t('Processing...') : i18n.t('Execute')}
                    </button>
                </div>

                {queryErrorMessage && (
                    <div style={{
                        padding: '10px',
                        backgroundColor: '#ffebee',
                        color: '#c62828',
                        borderRadius: '4px',
                        border: '1px solid #ef5350',
                        marginBottom: '10px'
                    }}>
                        {queryErrorMessage}
                    </div>
                )}

                {queryResults && (
                    <div style={{marginTop: '20px'}}>
                        {/* Display query results based on agent response format */}
                        {queryResults.success === false ? (
                            <div style={{
                                backgroundColor: '#ffebee',
                                border: '1px solid #ef5350',
                                borderRadius: '4px',
                                padding: '15px'
                            }}>
                                <h4 style={{color: '#c62828', marginBottom: '10px'}}>Error</h4>
                                <div><strong>Message:</strong> {queryResults.error || queryResults.message}</div>
                                {queryResults.rawResponse && (
                                    <div style={{marginTop: '10px'}}>
                                        <strong>Raw Response:</strong>
                                        <div style={{
                                            fontSize: '12px',
                                            color: '#666',
                                            maxHeight: '100px',
                                            overflow: 'auto',
                                            whiteSpace: 'pre-wrap',
                                            backgroundColor: '#f8f9fa',
                                            padding: '8px',
                                            borderRadius: '4px',
                                            marginTop: '5px'
                                        }}>
                                            {queryResults.rawResponse}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{
                                backgroundColor: '#e8f5e8',
                                border: '1px solid #4CAF50',
                                borderRadius: '4px',
                                padding: '15px'
                            }}>
                                <h4 style={{color: '#2E7D32', marginBottom: '10px'}}>
                                    {queryResults.message || 'Operation Completed Successfully'}
                                </h4>

                                {/* Handle search results */}
                                {queryResults.results && (
                                    <div style={{marginTop: '20px'}}>
                                        {Object.entries(queryResults.results).map(([type, items]) => {
                                            if (!Array.isArray(items) || items.length === 0) return null;

                                            return (
                                                <div key={type} style={{marginBottom: '30px'}}>
                                                    <h5 style={{
                                                        marginBottom: '10px',
                                                        color: '#2c6693',
                                                        textTransform: 'capitalize',
                                                        borderBottom: '2px solid #e0e0e0',
                                                        paddingBottom: '5px'
                                                    }}>
                                                        {type.replace(/([A-Z])/g, ' $1').trim()}
                                                    </h5>
                                                    <div style={{
                                                        border: '1px solid #ddd',
                                                        borderRadius: '4px',
                                                        overflow: 'hidden'
                                                    }}>
                                                        <table style={{
                                                            width: '100%',
                                                            borderCollapse: 'collapse'
                                                        }}>
                                                            <thead>
                                                            <tr style={{backgroundColor: '#f5f5f5'}}>
                                                                <th style={{
                                                                    padding: '12px',
                                                                    textAlign: 'left',
                                                                    borderBottom: '1px solid #ddd',
                                                                    fontWeight: 'bold'
                                                                }}>
                                                                    Name
                                                                </th>
                                                                <th style={{
                                                                    padding: '12px',
                                                                    textAlign: 'left',
                                                                    borderBottom: '1px solid #ddd',
                                                                    fontWeight: 'bold'
                                                                }}>
                                                                    Code
                                                                </th>
                                                            </tr>
                                                            </thead>
                                                            <tbody>
                                                            {items.map((item, index) => (
                                                                <tr key={item.id || index} style={{
                                                                    backgroundColor: index % 2 === 0 ? 'white' : '#f9f9f9'
                                                                }}>
                                                                    <td style={{
                                                                        padding: '12px',
                                                                        borderBottom: '1px solid #eee',
                                                                        fontSize: '14px'
                                                                    }}>
                                                                        {item.rawContent ? (
                                                                            <div>
                                                                                <div style={{
                                                                                    fontWeight: 'bold',
                                                                                    marginBottom: '5px'
                                                                                }}>
                                                                                    {item.name || 'Results'}
                                                                                </div>
                                                                                <div style={{
                                                                                    fontSize: '12px',
                                                                                    color: '#666',
                                                                                    maxHeight: '100px',
                                                                                    overflow: 'auto',
                                                                                    whiteSpace: 'pre-wrap',
                                                                                    backgroundColor: '#f8f9fa',
                                                                                    padding: '8px',
                                                                                    borderRadius: '4px'
                                                                                }}>
                                                                                    {item.rawContent}
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            item.name || ''
                                                                        )}
                                                                    </td>
                                                                    <td style={{
                                                                        padding: '12px',
                                                                        borderBottom: '1px solid #eee',
                                                                        fontFamily: 'monospace',
                                                                        fontSize: '14px'
                                                                    }}>
                                                                        {item.code || ''}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Handle creation/update results */}
                                {queryResults.data && (
                                    <div style={{marginTop: '15px'}}>
                                        <strong>Created/Updated Resource:</strong>
                                        <div style={{
                                            fontFamily: 'monospace',
                                            fontSize: '14px',
                                            backgroundColor: '#f5f5f5',
                                            padding: '10px',
                                            borderRadius: '4px',
                                            marginTop: '5px'
                                        }}>
                                            <div>ID: {queryResults.data.id}</div>
                                            <div>Name: {queryResults.data.name}</div>
                                            {queryResults.data.valueType && <div>Type: {queryResults.data.valueType}</div>}
                                            {queryResults.data.code && <div>Code: {queryResults.data.code}</div>}
                                        </div>
                                    </div>
                                )}

                                {/* Show operation summary */}
                                {queryResults.count !== undefined && (
                                    <div style={{marginTop: '10px', color: '#2E7D32'}}>
                                        <strong>Total results:</strong> {queryResults.count}
                                    </div>
                                )}

                                {/* Display analytics charts */}
                                {queryResults.chart_id && queryResults.echarts_option && (
                                    <div style={{marginTop: '20px'}}>
                                        <AnalyticsChart
                                            chartData={queryResults}
                                            chartId={queryResults.chart_id}
                                            title={queryResults.title}
                                            onFilter={(filters) => {
                                                console.log('Chart filtered:', filters);
                                            }}
                                            onExport={(format) => {
                                                console.log('Chart exported as:', format);
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {!isProcessing && !queryResults && (
                    <div style={{
                        padding: '20px',
                        textAlign: 'center',
                        color: '#666',
                        fontStyle: 'italic',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '4px',
                        border: '1px solid #e0e0e0'
                    }}>
                        Enter a query above to search, create, or manage DHIS2 metadata
                    </div>
                )}
            </div>
        </div>
    )
}

export default (props: any) => (
    <DataEngineProvider>
        <MyApp {...props} />
    </DataEngineProvider>
)
