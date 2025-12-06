import { useDataQuery } from '@dhis2/app-runtime'
import i18n from '@dhis2/d2-i18n'
import React, { FC, useEffect, useState, useRef } from 'react'
import classes from './App.module.css'
import { DataEngineProvider} from "./utils/app-runtime/data-engine.provider";
import MetadataSelector, { MetadataOption } from './components/MetadataSelector';

import MessageContainer from './components/MessageContainer';

// Import the comprehensive workflow orchestrator
import { workflowOrchestrator, WorkflowUIState, ConversationMessage } from './utils/workflow-orchestrator';
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

    // Add spin animation CSS for loading indicator
    const spinKeyframes = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;

    // Inject the keyframes into the document head
    React.useEffect(() => {
        const style = document.createElement('style');
        style.textContent = spinKeyframes;
        document.head.appendChild(style);
        return () => {
            document.head.removeChild(style);
        };
    }, []);

    // Complete UI state is now managed by the orchestrator
    const [uiState, setUiState] = useState<WorkflowUIState>({
        showQueryInput: true,
        queryText: '',
        queryEnabled: true,
        showProcessing: false,
        showResults: false,
        showChart: false,
        showSelection: false,
        selectionOptions: [],
        selectionMultiple: true,
        showError: false,
        conversation: [],
        showConversation: true
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

            // Chart rendering
            onChartRender: (chartData) => {
                console.log('📊 Chart render callback called:', chartData);
                // Store the chart data and show the chart
                setUiState(prevState => ({
                    ...prevState,
                    showChart: true,
                    chartData: chartData
                }));
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

        // Load existing conversation history
        workflowOrchestrator.loadConversationFromStorage();

        // Reset UI to initial state on component mount (but preserve conversation)
        workflowOrchestrator.resetUIState();
    }, []);

    // Handle query submission - now adds to conversation
    const handleQuerySubmit = async () => {
        if (!uiState.queryText.trim()) {
            workflowOrchestrator.updateUIState({
                showError: true,
                errorMessage: 'Please enter a query'
            });
            return;
        }

        const queryText = uiState.queryText.trim();

        try {
            // Add user message to conversation
            workflowOrchestrator.addUserMessage(queryText, 'query');

            // Clear the query input
            setUiState(prevState => ({ ...prevState, queryText: '' }));

            // Start analytics workflow through orchestrator
            const result = await workflowOrchestrator.startWorkflow(
                'analytics',
                {
                    flow: 'analytics_query',
                    input: { messages: [{ role: 'user', content: queryText }] },
                    orchestrator: workflowOrchestrator // Pass orchestrator reference for selection interrupts
                },
                async (input) => {
                    // Router agent routes to state graph for analytics
                    // Extract user messages and pass them properly to the agent
                    const userMessages = input.input?.messages || [{ role: 'user', content: input.query || '' }];
                    console.log('🚀 Invoking context-aware router agent with messages:', userMessages);
                    const agentResult = await contextRouterAgent?.invoke({ messages: userMessages });
                    console.log('📦 Router agent result:', agentResult);

                    const lastMessage = agentResult.messages[agentResult.messages.length - 1];
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

            // Add assistant response to conversation (only for non-specialized cases)
            if (result?.success === false) {
                // Only add error messages to conversation
                workflowOrchestrator.addAssistantMessage(
                    result.error || 'Operation failed',
                    'error',
                    result
                );
            }
            // For successful operations, router agent handles specialized rendering (search, analytics, etc.)

        } catch (error) {
            console.error('Query submission error:', error);
            workflowOrchestrator.addAssistantMessage(
                `Error: ${error.message}`,
                'error',
                { error: error.message }
            );
        }
    };

    // Handle query text changes - update local state and keep orchestrator in sync
    const handleQueryChange = (newText: string) => {
        setUiState(prevState => ({ ...prevState, queryText: newText }));
    };

    // Handle selection completion - call stored callback and add to conversation
    const handleSelectionComplete = (selectedItems: MetadataOption[]) => {
        if (pendingSelectionCallback.current) {
            // Add user selection to conversation
            const selectionText = `Selected ${selectedItems.length} item(s): ${selectedItems.map(item => item.name).join(', ')}`;
            workflowOrchestrator.addUserMessage(selectionText, 'selection_response', { selectedItems });

            // Call the stored callback
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

            {/* Main Chat Interface */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                height: '600px', // Fixed height to prevent wobbling
                marginTop: '20px',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                overflow: 'hidden',
                backgroundColor: '#ffffff'
            }}>
                {/* Conversation Display Area */}
                {uiState.showConversation && (
                    <div style={{
                        flex: 1,
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <MessageContainer messages={uiState.conversation} />

                        {/* Processing overlay - only show spinner, no text box */}
                        {uiState.showProcessing && (
                            <div style={{
                                position: 'absolute',
                                bottom: '80px', // Above input area
                                right: '20px',
                                zIndex: 10,
                                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                borderRadius: '50%',
                                padding: '12px',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                                border: '1px solid #e0e0e0'
                            }}>
                                <div style={{
                                    fontSize: '18px',
                                    animation: 'spin 1s linear infinite'
                                }}>
                                    🔄
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Selection overlay (when selection is active) */}
                {uiState.showSelection && uiState.selectionOptions.length > 0 && (
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(255, 255, 255, 0.95)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 20
                    }}>
                        <div style={{
                            backgroundColor: 'white',
                            borderRadius: '8px',
                            padding: '20px',
                            border: '1px solid #e0e0e0',
                            maxWidth: '600px',
                            maxHeight: '80vh',
                            overflow: 'auto'
                        }}>
                            <MetadataSelector
                                selectionOptions={uiState.selectionOptions.map(opt => ({
                                    ...opt,
                                    type: opt.type as 'indicator' | 'dataElement'
                                }))}
                                originalQuery={uiState.queryText}
                                onSelection={(selectedItems) => handleSelectionComplete(selectedItems)}
                                allowMultiple={uiState.selectionMultiple}
                            />
                        </div>
                    </div>
                )}

                {/* Query Input Section - Always at the bottom */}
                <div style={{
                    borderTop: '1px solid #e0e0e0',
                    padding: '16px',
                    backgroundColor: '#f8f9fa'
                }}>
                    <div style={{display: 'flex', gap: '10px', maxWidth: '1200px', margin: '0 auto'}}>
                        <input
                            type="text"
                            value={uiState.queryText}
                            onChange={(e) => handleQueryChange(e.target.value)}
                            placeholder={i18n.t('Ask me anything about DHIS2...')}
                            disabled={!uiState.queryEnabled}
                            onKeyPress={(e) => e.key === 'Enter' && handleQuerySubmit()}
                            style={{
                                flex: 1,
                                padding: '12px 16px',
                                fontSize: '16px',
                                border: '1px solid #ccc',
                                borderRadius: '8px',
                                outline: 'none'
                            }}
                        />
                        <button
                            onClick={handleQuerySubmit}
                            disabled={!uiState.queryEnabled || uiState.showProcessing}
                            style={{
                                padding: '12px 24px',
                                fontSize: '16px',
                                backgroundColor: uiState.queryEnabled && !uiState.showProcessing ? '#2c6693' : '#cccccc',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: uiState.queryEnabled && !uiState.showProcessing ? 'pointer' : 'not-allowed',
                                whiteSpace: 'nowrap',
                                minWidth: '120px'
                            }}
                        >
                            {uiState.showProcessing ? i18n.t('Processing...') : i18n.t('Send')}
                        </button>
                    </div>
                </div>
            </div>

            {/* Error Display - shown outside the chat area */}
            {uiState.showError && uiState.errorMessage && (
                <div style={{
                    marginTop: '16px',
                    padding: '12px 16px',
                    backgroundColor: '#ffebee',
                    color: '#c62828',
                    borderRadius: '4px',
                    border: '1px solid #ef5350',
                    maxWidth: '800px'
                }}>
                    <strong>{i18n.t('Error')}:</strong> {uiState.errorMessage}
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
