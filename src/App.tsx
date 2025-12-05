import { useDataQuery } from '@dhis2/app-runtime'
import i18n from '@dhis2/d2-i18n'
import React, { FC, useEffect, useState, useRef } from 'react'
import classes from './App.module.css'
import { DataEngineProvider} from "./utils/app-runtime/data-engine.provider";
import AnalyticsChart from './components/AnalyticsChart';
import AnalyticsMetadataSelector, { MetadataOption } from './components/AnalyticsMetadataSelector';

// Import the comprehensive workflow orchestrator
import { workflowOrchestrator, WorkflowUIState } from './utils/workflow-orchestrator';
import { createContextRouterAgent } from './agents/router-agent'

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

const MyApp: FC = () => {
    const {error, loading, data} = useDataQuery<QueryResults>(query)

    // Complete UI state is now managed by the orchestrator
    const [uiState, setUiState] = useState<WorkflowUIState>({
        showQueryInput: true,
        queryText: '',
        queryEnabled: true,
        showProcessing: false,
        showResults: false,
        showSelection: false,
        selectionOptions: [],
        selectionMultiple: true,
        showError: false
    });

    // Selection complete callback for the orchestrator
    const pendingSelectionCallback = useRef<((selectedItems: any[]) => void) | null>(null);

    // Context router agent instance with orchestrator reference
    const [contextRouterAgent, setContextRouterAgent] = useState<any>(null);

    // Register comprehensive callbacks with the orchestrator
    useEffect(() => {
        workflowOrchestrator.registerCallbacks({
            // UI state management - orchestrator fully controls what user sees
            onUIStateChange: (newState) => {
                setUiState(prevState => ({ ...prevState, ...newState }));
            },

            // Selection handling during workflows
            onSelection: (options, callback) => {
                // Store callback for when user completes selection
                pendingSelectionCallback.current = callback;
            },

            // Workflow lifecycle events
            onWorkflowStart: (workflowId, flowType) => {
                console.log(`🎬 Workflow ${workflowId} started: ${flowType}`);
            },
            onWorkflowComplete: (workflowId, result) => {
                console.log(`✅ Workflow ${workflowId} completed`);
            },
            onWorkflowError: (workflowId, error) => {
                console.error(`❌ Workflow ${workflowId} error:`, error);
            }
        });

        // Create context router agent with orchestrator reference
        const agent = createContextRouterAgent(workflowOrchestrator);
        setContextRouterAgent(agent);

        // Reset UI to initial state on component mount
        workflowOrchestrator.resetUIState();
    }, []);

    // Handle query submission - now delegated to orchestrator
    const handleQuerySubmit = async () => {
        if (!uiState.queryText.trim()) {
            workflowOrchestrator.updateUIState({
                showError: true,
                errorMessage: 'Please enter a query'
            });
            return;
        }

        // Start analytics workflow through orchestrator
        await workflowOrchestrator.startWorkflow(
            'analytics',
            {
                flow: 'analytics_query',
                input: { messages: [{ role: 'user', content: uiState.queryText }] },
                orchestrator: workflowOrchestrator // Pass orchestrator reference for selection interrupts
            },
            async (input) => {
                // Router agent routes to state graph for analytics
                // Extract user messages and pass them properly to the agent
                const userMessages = input.input?.messages || [{ role: 'user', content: input.query || '' }];
                console.log('🚀 Invoking context-aware router agent with messages:', userMessages);
                const result = await contextRouterAgent?.invoke({ messages: userMessages });
                console.log('📦 Router agent result:', result);

                const lastMessage = result.messages[result.messages.length - 1];
                const responseContent = lastMessage.content as string;

                // Debug the raw response
                console.log('🔍 Last message:', lastMessage);
                console.log('🔍 Raw response content:', responseContent);
                console.log('🔍 Response content length:', responseContent.length);

                try {
                    console.log('🔄 Parsing JSON response...');
                    const parsed = JSON.parse(responseContent);
                    console.log('✅ JSON parse successful:', parsed);
                    return parsed;
                } catch (parseError) {
                    console.error('❌ JSON parse error:', parseError);
                    console.error('❌ Failed to parse response:', responseContent);

                    // Return a result that won't crash the workflow
                    return {
                        success: false,
                        error: `JSON parse error: ${parseError.message}`,
                        rawResponse: responseContent,
                        debug: {
                            responseLength: responseContent.length,
                            responseType: typeof responseContent,
                            first100: responseContent.substring(0, 100)
                        },
                        type: 'parse_error'
                    };
                }
            }
        );
    };

    // Handle query text changes - update local state and keep orchestrator in sync
    const handleQueryChange = (newText: string) => {
        setUiState(prevState => ({ ...prevState, queryText: newText }));
    };

    // Handle selection completion - call stored callback
    const handleSelectionComplete = (selectedItems: MetadataOption[]) => {
        if (pendingSelectionCallback.current) {
            const transformedItems = selectedItems.map(item => ({
                name: item.name,
                id: item.id,
                type: item.type
            }));

            pendingSelectionCallback.current(transformedItems);
            pendingSelectionCallback.current = null;
        }
    };

    // Loading and error states for the main app
    if (error) {
        return <span>{i18n.t('ERROR')}</span>
    }

    if (loading) {
        return <span>{i18n.t('Loading...')}</span>
    }

    return (
        <div className={classes.container}>
            <h1>{i18n.t('Hello {{name}}', {name: data?.me?.name})}</h1>
            <h3>{i18n.t('DHIS2 Orchestrated Multi-Agent Assistant')}</h3>

            {/* Query Input Section - only show when orchestrator allows */}
            {uiState.showQueryInput && (
                <div style={{marginTop: '40px', maxWidth: '600px', width: '100%'}}>
                    <h3 style={{color: '#2c6693', borderBottom: '1px solid #e0e0e0', paddingBottom: '5px'}}>
                        {i18n.t('Ask Anything')}
                    </h3>
                    <p style={{color: '#666', marginBottom: '15px'}}>
                        Describe what you want to do - your query will be intelligently routed to specialized agents.
                    </p>

                    <div style={{display: 'flex', gap: '10px', marginBottom: '10px'}}>
                        <input
                            type="text"
                            value={uiState.queryText}
                            onChange={(e) => handleQueryChange(e.target.value)}
                            placeholder={i18n.t('e.g., "Find all data elements with HIV", "Create a program for maternal health"')}
                            disabled={!uiState.queryEnabled}
                            onKeyPress={(e) => e.key === 'Enter' && handleQuerySubmit()}
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
                            onClick={handleQuerySubmit}
                            disabled={!uiState.queryEnabled}
                            style={{
                                padding: '10px 20px',
                                fontSize: '16px',
                                backgroundColor: '#2c6693',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: uiState.queryEnabled ? 'pointer' : 'not-allowed',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            {uiState.showProcessing ? i18n.t('Processing...') : i18n.t('Execute')}
                        </button>
                    </div>
                </div>
            )}

            {/* Error Display - controlled by orchestrator */}
            {uiState.showError && uiState.errorMessage && (
                <div style={{
                    padding: '15px',
                    backgroundColor: '#ffebee',
                    color: '#c62828',
                    borderRadius: '4px',
                    border: '1px solid #ef5350',
                    marginBottom: '20px',
                    maxWidth: '600px'
                }}>
                    <strong>{i18n.t('Error')}:</strong> {uiState.errorMessage}
                </div>
            )}

            {/* Processing Indicator - controlled by orchestrator */}
            {uiState.showProcessing && (
                <div style={{
                    padding: '20px',
                    textAlign: 'center',
                    backgroundColor: '#e3f2fd',
                    borderRadius: '8px',
                    border: '1px solid #2196f3',
                    marginBottom: '20px',
                    maxWidth: '600px'
                }}>
                    <div style={{fontSize: '18px', marginBottom: '10px'}}>🔄</div>
                    <div>{uiState.processingMessage || i18n.t('Processing your request...')}</div>
                </div>
            )}

            {/* Analytics Metadata Selection - controlled by orchestrator */}
            {uiState.showSelection && uiState.selectionOptions.length > 0 && (
                <div style={{marginBottom: '20px', maxWidth: '600px'}}>
                    <AnalyticsMetadataSelector
                        selectionOptions={uiState.selectionOptions.map(opt => ({
                            ...opt,
                            type: opt.type as 'indicator' | 'dataElement'
                        }))}
                        originalQuery={uiState.queryText}
                        onSelection={(selectedItems) => handleSelectionComplete(selectedItems)}
                        allowMultiple={uiState.selectionMultiple}
                    />
                </div>
            )}

            {/* Results Display - controlled by orchestrator */}
            {uiState.showResults && uiState.results && (
                <div style={{marginTop: '20px', maxWidth: '800px'}}>
                    {/* Success Results */}
                    {uiState.results.success !== false ? (
                        <div style={{
                            backgroundColor: '#e8f5e8',
                            border: '1px solid #4CAF50',
                            borderRadius: '4px',
                            padding: '15px'
                        }}>
                            <h4 style={{color: '#2E7D32', marginBottom: '10px'}}>
                                {uiState.results.message || 'Operation Completed Successfully'}
                            </h4>

                            {/* Display tabular results */}
                            {uiState.results.results && (
                                <div style={{marginTop: '20px'}}>
                                    {Object.entries(uiState.results.results).map(([type, items]) => {
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

                            {/* Display creation/update results */}
                            {uiState.results.data && (
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
                                        <div>ID: {uiState.results.data.id}</div>
                                        <div>Name: {uiState.results.data.name}</div>
                                        {uiState.results.data.valueType && <div>Type: {uiState.results.data.valueType}</div>}
                                        {uiState.results.data.code && <div>Code: {uiState.results.data.code}</div>}
                                    </div>
                                </div>
                            )}

                            {/* Show operation summary */}
                            {uiState.results.count !== undefined && (
                                <div style={{marginTop: '10px', color: '#2E7D32'}}>
                                    <strong>Total results:</strong> {uiState.results.count}
                                </div>
                            )}

                            {/* Display analytics charts */}
                            {uiState.results.chart_id && uiState.results.echarts_option && (
                                <div style={{marginTop: '20px'}}>
                                    <AnalyticsChart
                                        chartData={uiState.results}
                                        chartId={uiState.results.chart_id}
                                        title={uiState.results.title}
                                        onFilter={(filters) => console.log('Chart filtered:', filters)}
                                        onExport={(format) => console.log('Chart exported as:', format)}
                                    />
                                </div>
                            )}

                            {/* Debug info for parse errors */}
                            {uiState.results.debug && (
                                <div style={{marginTop: '15px'}}>
                                    <strong>Debug Info:</strong>
                                    <div style={{
                                        fontFamily: 'monospace',
                                        fontSize: '12px',
                                        backgroundColor: '#f5f5f5',
                                        padding: '10px',
                                        borderRadius: '4px',
                                        marginTop: '5px'
                                    }}>
                                        <div>Length: {uiState.results.debug.responseLength}</div>
                                        <div>Type: {uiState.results.debug.responseType}</div>
                                        <div>First 100: {uiState.results.debug.first100}</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Error Results */
                        <div style={{
                            backgroundColor: '#ffebee',
                            border: '1px solid #ef5350',
                            borderRadius: '4px',
                            padding: '15px'
                        }}>
                            <h4 style={{color: '#c62828', marginBottom: '10px'}}>Operation Failed</h4>
                            <div><strong>Message:</strong> {uiState.results.error || uiState.results.message}</div>
                            {uiState.results.rawResponse && (
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
                                        {uiState.results.rawResponse}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Empty state when nothing is shown */}
            {!uiState.showQueryInput && !uiState.showProcessing && !uiState.showResults && !uiState.showSelection && !uiState.showError && (
                <div style={{
                    padding: '40px',
                    textAlign: 'center',
                    color: '#666',
                    fontStyle: 'italic',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '8px',
                    border: '1px solid #e0e0e0',
                    maxWidth: '600px',
                    marginTop: '20px'
                }}>
                    Ready to assist with DHIS2 metadata management and analytics.
                </div>
            )}
        </div>
    )
}

export default (props: any) => (
    <DataEngineProvider>
        <MyApp {...props} />
    </DataEngineProvider>
)
