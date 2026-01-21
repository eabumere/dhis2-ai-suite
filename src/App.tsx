import { useDataQuery } from '@dhis2/app-runtime'
import i18n from '@dhis2/d2-i18n'
import React, { FC, useEffect, useState, useRef } from 'react'
import classes from './App.module.css'
import { DataEngineProvider} from "./utils/app-runtime/data-engine.provider";
import MetadataSelector, { MetadataOption } from './components/MetadataSelector';

import MessageContainer from './components/MessageContainer';
import EnhancedInput, { FileAttachment } from './components/EnhancedInput';
import TrackerDataGrid from './components/TrackerDataGrid';

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
        conversation: [],
        showConversation: true
    });

    // Get tracker state from orchestrator
    const trackerState = workflowOrchestrator.getTrackerState();

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

        // Initialize new chat session (clear conversation history)
        workflowOrchestrator.initializeNewChatSession();
    }, []);

    // Handle query submission - now adds to conversation
    const handleQuerySubmit = async () => {
        if (!uiState.queryText.trim()) {
            workflowOrchestrator.addAssistantMessage(
                'Empty query detected. Please enter a question or request before submitting. For example: "Show me HIV data" or "Upload CSV file".',
                'error'
            );
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
                `Request processing failed: ${error.message}. This may be due to network issues, invalid input format, or system constraints. Please try rephrasing your query or check your connection. If the problem persists, contact support with the error details.`,
                'error',
                { error: error.message, errorType: 'query_processing', timestamp: new Date().toISOString() }
            );
        }
    };

    // Handle query text changes - update local state and keep orchestrator in sync
    const handleQueryChange = (newText: string) => {
        setUiState(prevState => ({ ...prevState, queryText: newText }));
    };

    // Handle enhanced query submission with file attachments
    const handleEnhancedQuerySubmit = async (text: string, attachments: FileAttachment[]) => {
        if (!text.trim() && attachments.length === 0) {
            workflowOrchestrator.addAssistantMessage(
                'No input provided. Please either type a question or attach a file for processing. Supported file types: CSV, PDF, images. Try: "Upload my data file" or "Process this document".',
                'error'
            );
            return;
        }

        const queryText = text.trim();

        try {
            // Add user message to conversation with attachments
            workflowOrchestrator.addUserMessage(queryText, 'query', { attachments });

            // Clear the query input
            setUiState(prevState => ({ ...prevState, queryText: '' }));

            // Prepare messages with file content for agents that need it
            const messages = [{ role: 'user', content: queryText }];

            // Add file content to messages for agents that can process files
            if (attachments.length > 0) {
                for (const attachment of attachments) {
                    try {
                        // Determine if file is binary or text based on MIME type
                        const isBinary = attachment.type.startsWith('application/') ||
                                       attachment.type.startsWith('image/') ||
                                       attachment.name.toLowerCase().endsWith('.pdf');

                        let fileContent: Uint8Array | string;

                        if (isBinary) {
                            // For binary files, read as ArrayBuffer and convert to Uint8Array
                            const arrayBuffer = await attachment.file.arrayBuffer();
                            fileContent = new Uint8Array(arrayBuffer);
                            console.log(`📁 Read binary file: ${attachment.name} (${fileContent.length} bytes)`);
                        } else {
                            // For text files, read as text
                            fileContent = await attachment.file.text();
                            console.log(`📄 Read text file: ${attachment.name} (${fileContent.length} characters)`);
                        }

                        // Add file content to messages with proper typing
                        const fileMessage: any = {
                            role: 'user',
                            content: `File: ${attachment.name}`,
                            attachments: [{
                                id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                name: attachment.name,
                                type: attachment.type,
                                size: attachment.size
                            }]
                        };

                        // Store binary content separately to preserve it
                        if (isBinary) {
                            fileMessage.binaryContent = fileContent;
                        } else {
                            fileMessage.content += `\nContent:\n${fileContent}`;
                        }

                        messages.push(fileMessage);
                    } catch (fileError) {
                        console.warn(`Could not read file ${attachment.name}:`, fileError);
                        // Still include the message but without file content
                        messages.push({
                            role: 'user',
                            content: `File attached: ${attachment.name} (${attachment.type}, ${attachment.size} bytes)`
                        });
                    }
                }
            }

            // Start workflow with enhanced input
            const result = await workflowOrchestrator.startWorkflow(
                'analytics',
                {
                    flow: 'analytics_query',
                    input: { messages },
                    orchestrator: workflowOrchestrator
                },
                async (input) => {
                    // Router agent routes to appropriate agent based on content + files
                    console.log('🚀 Invoking context-aware router agent with messages and attachments:', input.input?.messages);
                    const agentResult = await contextRouterAgent?.invoke({ messages: input.input?.messages });
                    console.log('📦 Router agent result:', agentResult);

                    const lastMessage = agentResult.messages[agentResult.messages.length - 1];
                    const responseContent = lastMessage.content as string;

                    try {
                        const parsed = JSON.parse(responseContent);
                        console.log('✅ JSON parse successful:', parsed);
                        return parsed;
                    } catch (parseError) {
                        console.error('❌ JSON parse error:', parseError);
                        return {
                            success: false,
                            error: `JSON parse error: ${parseError.message}`,
                            rawResponse: responseContent,
                            type: 'parse_error'
                        };
                    }
                }
            );

            // Handle response
            if (result?.success === false) {
                workflowOrchestrator.addAssistantMessage(
                    result.error || 'Operation failed',
                    'error',
                    result
                );
            }

        } catch (error) {
            console.error('Enhanced query submission error:', error);
            workflowOrchestrator.addAssistantMessage(
                `File processing failed: ${error.message}. This may be due to unsupported file format, corrupted file content, or processing limits. Please check your file type (supported: CSV, PDF, images) and size (max 10MB). Try re-uploading or contact support if the issue persists.`,
                'error',
                { error: error.message, errorType: 'file_processing', supportedFormats: ['CSV', 'PDF', 'PNG', 'JPG', 'JPEG'], maxSize: '10MB' }
            );
        }
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

    // Tracker workflow handlers - now delegate to orchestrator
    const handleConfigureProcessing = (config: {
        orgUnit: string;
        programId: string;
        attributeMappings: Record<string, string>;
    }) => {
        workflowOrchestrator.handleConfigureProcessing(config);
    };

    const handleUploadDocument = (file: File) => {
        workflowOrchestrator.handleUploadDocument(file);
    };

    const handleRetryProcessing = () => {
        workflowOrchestrator.handleRetryProcessing();
    };

    const handleConfirmSave = () => {
        workflowOrchestrator.handleConfirmSave();
    };

    const handleCancelSave = () => {
        workflowOrchestrator.handleCancelSave();
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

                        {/* Processing overlay - shows progress messages */}
                        {uiState.showProcessing && (
                            <div style={{
                                position: 'absolute',
                                bottom: '80px', // Above input area
                                right: '20px',
                                zIndex: 10,
                                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                borderRadius: '12px',
                                padding: '16px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                border: '1px solid #e0e0e0',
                                minWidth: '200px',
                                maxWidth: '300px'
                            }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px'
                                }}>
                                    <div style={{
                                        fontSize: '20px',
                                        animation: 'spin 1s linear infinite'
                                    }}>
                                        🔄
                                    </div>
                                    <div style={{
                                        flex: 1,
                                        fontSize: '14px',
                                        color: '#333',
                                        lineHeight: '1.4'
                                    }}>
                                        <div style={{
                                            fontWeight: 'bold',
                                            marginBottom: '4px',
                                            color: '#2c6693'
                                        }}>
                                            Processing...
                                        </div>
                                        <div style={{
                                            fontSize: '13px',
                                            color: '#666'
                                        }}>
                                            {uiState.processingMessage || 'Please wait while we process your request'}
                                        </div>
                                    </div>
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
                                    type: opt.type
                                }))}
                                originalQuery={uiState.queryText}
                                onSelection={(selectedItems) => handleSelectionComplete(selectedItems)}
                                allowMultiple={uiState.selectionMultiple}
                            />
                        </div>
                    </div>
                )}

                {/* Enhanced Input Section - Always at the bottom */}
                <div style={{
                    borderTop: '1px solid #e0e0e0',
                    padding: '16px',
                    backgroundColor: '#f8f9fa'
                }}>
                    <div style={{maxWidth: '1200px', margin: '0 auto'}}>
                        <EnhancedInput
                            value={uiState.queryText}
                            onChange={handleQueryChange}
                            onSubmit={(text, attachments) => handleEnhancedQuerySubmit(text, attachments)}
                            disabled={!uiState.queryEnabled}
                            isProcessing={uiState.showProcessing}
                        />
                    </div>
                </div>
            </div>



            {/* Tracker Data Grid - Hidden by default, shown when tracker workflow is active */}
            {trackerState.extractedPatients.length > 0 && (
                <div style={{
                    marginTop: '20px',
                    border: '1px solid #e0e0e0',
                    borderRadius: '8px',
                    backgroundColor: '#ffffff'
                }}>
                    <TrackerDataGrid
                        extractedPatients={trackerState.extractedPatients}
                        mappedTrackerData={trackerState.mappedTrackerData}
                        programId={trackerState.programId}
                        onConfigureProcessing={handleConfigureProcessing}
                        onUploadDocument={handleUploadDocument}
                        onRetryProcessing={handleRetryProcessing}
                        onConfirmSave={handleConfirmSave}
                        onCancelSave={handleCancelSave}
                        processingStep={trackerState.processingStep}
                        processingProgress={trackerState.processingProgress}
                        error={trackerState.error}
                        reviewMode={trackerState.reviewMode}
                    />
                </div>
            )}
        </div>
    )
};

export default (props: any) => (
    <DataEngineProvider>
        <MyApp {...props} />
    </DataEngineProvider>
)
