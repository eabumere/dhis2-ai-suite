// Workflow Orchestrator - complete UI and workflow lifecycle management
import { startNewSession } from './conversation-context';
import { llmClassificationService } from './llm-classification-service';
import { indexedDBStorage, FileData } from './indexeddb-storage';

export interface SelectionOptions {
    name: string;
    id: string;
    type: 'indicator' | 'dataElement';
}

export interface RecoveryOption {
    id: string;
    label: string;
    description: string;
    action: string;
}

export interface FileAttachment {
    file: File;
    id: string;
    name: string;
    size: number;
    type: string;
    preview?: string;
}

export interface FileRegistryEntry {
    id: string;
    name: string;
    size: number;
    type: string;
    content: Uint8Array | string; // Raw file content
    isBinary: boolean; // Whether content is binary data or text
    uploadedAt: number;
    lastAccessed?: number;
}

export interface ConversationMessage {
    id: string;
    timestamp: number;
    role: 'user' | 'assistant';
    content: string;
    attachments?: FileAttachment[];
    data?: any;
    threadId?: string; // For grouping related messages (request → processing → result)
    type: 'query' | 'response' | 'selection' | 'error' | 'selection_response' | 'data_grid' | 'resolution_selection'
	    | 'tracker_processing_complete' | 'data_set_selection' | 'tracker_data_grid' | 'success' | 'warning' | 'info' | 'progress' | 'confirmation';
}

export interface WorkflowStep {
    id: string;
    label: string;
    description?: string;
    status: 'pending' | 'active' | 'completed' | 'error';
    progress?: number; // 0-100
    startTime?: number;
    endTime?: number;
    error?: string;
}

export interface WorkflowProgress {
    workflowId: string;
    steps: WorkflowStep[];
    overallProgress: number;
    currentStep?: string;
    startTime: number;
    estimatedTimeRemaining?: number;
}

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';
export type ErrorClassification = 'recoverable' | 'non-recoverable' | 'partial-success';

export interface ClassifiedError {
    originalError: any;
    classification: ErrorClassification;
    severity: ErrorSeverity;
    errorCode?: string;
    userMessage: string;
    technicalMessage: string;
    recoveryStrategies: RecoveryStrategy[];
    context: {
        workflowId?: string;
        stepId?: string;
        agent?: string;
        operation?: string;
    };
}

export interface RecoveryStrategy {
    id: string;
    name: string;
    description: string;
    action: string;
    priority: number; // 1 = highest priority
    requiresUserInput: boolean;
    automated: boolean;
}

export interface WorkflowUIState {
    // Input states
    showQueryInput: boolean;
    queryText: string;
    queryEnabled: boolean;

    // Processing states
    showProcessing: boolean;
    processingMessage?: string;

    // Results states
    showResults: boolean;
    results?: any;
    resultsType?: string;

    // Chart states
    showChart: boolean;
    chartData?: any;

    // Selection states
    showSelection: boolean;
    selectionOptions: SelectionOptions[];
    selectionMultiple: boolean;

    // General states
    currentWorkflowId?: string;

    // Conversation states
    conversation: ConversationMessage[];
    showConversation: boolean;
}

export interface TrackerWorkflowState {
    extractedPatients: any[];
    mappedTrackerData: any[];
    programId: string;
    processingStep: string;
    processingProgress: number;
    error: string;
    reviewMode: boolean;
}

// Comprehensive UI orchestration callbacks
export interface ComprehensiveWorkflowCallbacks {
    // UI state management
    onUIStateChange: (newState: Partial<WorkflowUIState>) => void;

    // Selection handling
    onSelection: (options: SelectionOptions[], callback: (selectedItems: SelectionOptions[]) => void) => void;

    // Chart rendering
    onChartRender: (chartData: any) => void;

    // Lifecycle events
    onWorkflowStart: (workflowId: string, flowType: string) => void;
    onWorkflowComplete: (workflowId: string, result: any) => void;
    onWorkflowError: (workflowId: string, error: string) => void;

    // Toast notifications (optional)
    showToast?: (type: 'success' | 'error' | 'warning' | 'info' | 'progress', title: string, message: string, options?: any) => string;
}

class WorkflowOrchestrator {
    private activeWorkflows = new Map<string, any>();
    private uiCallbacks: ComprehensiveWorkflowCallbacks | null = null;
    private fileRegistry = new Map<string, FileRegistryEntry>();
    private currentFileId: string | null = null;
    private pendingConfirmations: Map<string, (confirmed: boolean) => void> = new Map();
    private currentUIState: WorkflowUIState = {
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
    };

    // Tracker workflow state - moved from App.tsx
    private trackerState: TrackerWorkflowState = {
        extractedPatients: [],
        mappedTrackerData: [],
        programId: '',
        processingStep: '',
        processingProgress: 0,
        error: '',
        reviewMode: false
    };

    // Initialize default UI state
    resetUIState() {
        this.currentUIState = {
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
        };
        this.uiCallbacks?.onUIStateChange(this.currentUIState);
    }

    // Initialize UI state for a new chat session (clear conversation history)
    initializeNewChatSession() {
        console.log('🔄 Initializing new chat session - clearing conversation history and starting new context session');

        // Start a new session in the conversation context
        const sessionId = startNewSession();

        this.currentUIState = {
            showQueryInput: true,
            queryText: '',
            queryEnabled: true,
            showProcessing: false,
            showResults: false,
            showChart: false,
            showSelection: false,
            selectionOptions: [],
            selectionMultiple: true,
            conversation: [], // Clear conversation history for new session
            showConversation: true
        };
        this.uiCallbacks?.onUIStateChange(this.currentUIState);
    }

    // Register comprehensive UI callbacks
    registerCallbacks(callbacks: ComprehensiveWorkflowCallbacks) {
        this.uiCallbacks = callbacks;
        // Send initial state
        this.uiCallbacks.onUIStateChange(this.currentUIState);
    }

    // Update UI state (public for direct access from App.tsx)
    public updateUIState(updates: Partial<WorkflowUIState>) {
        this.currentUIState = { ...this.currentUIState, ...updates };
        this.uiCallbacks?.onUIStateChange(this.currentUIState);
    }

    // Start a new workflow
    async startWorkflow<T extends { flow: string; input: any; workflowId?: string; selectedItems?: any[] }>(
        flowType: string,
        input: T,
        agentFn: (input: any) => Promise<any>
    ): Promise<any> {
        const workflowId = input.workflowId || `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        console.log(`🏁 Starting workflow ${workflowId} for ${flowType}`);

        // Process messages to convert file content to references
        const processedInput = {
            ...input,
            input: {
                ...input.input,
                messages: this.processMessagesForFileReferences(input.input?.messages || [])
            }
        };

        // Notify UI of workflow start
        this.uiCallbacks?.onWorkflowStart(workflowId, flowType);
        this.updateUIState({
            showQueryInput: false,
            showProcessing: true,
            processingMessage: 'Analyzing your request...',
            currentWorkflowId: workflowId
        });

        // Store workflow context
        this.activeWorkflows.set(workflowId, {
            flowType,
            status: 'running',
            startTime: Date.now(),
            input: processedInput
        });

        let currentInput = { ...processedInput };
        let maxIterations = 5; // Prevent infinite loops
        let iterationCount = 0;

        try {
            while (iterationCount < maxIterations) {
                iterationCount++;

                console.log(`🔄 Workflow ${workflowId} iteration ${iterationCount} with input:`, currentInput);

                // Update progress message for agent execution
                this.addProgressMessage(`Processing with ${flowType} agent...`);

                const result = await agentFn(currentInput);
                console.log(`📋 Workflow ${workflowId} iteration ${iterationCount} result:`, result);

                // Check if user selection is required
                if (result?.type === 'user_selection_needed' && result?.selectionOptions?.length > 0) {
                    console.log(`⏸️ Workflow ${workflowId} requires user selection`);

                    // Request user selection
                    const selectedOption = await this.requestUserSelection(workflowId, result.selectionOptions, result.message);

                    if (selectedOption) {
                        console.log(`▶️ Workflow ${workflowId} received selection: ${selectedOption.id}, continuing with:`, selectedOption);

                        // Route to the selected agent
                        const selectedAgent = selectedOption.id;
                        const selectedAgentFn = this.getAgentFunction(selectedAgent);

                        if (selectedAgentFn) {
                            // Update input with selected agent context
                            currentInput = {
                                ...currentInput,
                                workflowType: selectedAgent,
                                // Update the user message to include selected agent context
                                input: {
                                    ...currentInput.input,
                                    messages: currentInput.input.messages.map((msg: any) => {
                                        if (msg.role === 'user') {
                                            return {
                                                ...msg,
                                                content: `Continue with ${selectedOption.name}: ${input.input.messages[0]?.content || msg.content}`
                                            };
                                        }
                                        return msg;
                                    })
                                }
                            };

                            // Update UI for next iteration
                            this.updateUIState({
                                showProcessing: true,
                                processingMessage: `Processing with ${selectedOption.name}...`
                            });

                            continue; // Continue the loop with selected agent
                        } else {
                            throw new Error(`Unknown agent: ${selectedAgent}`);
                        }
                    } else {
                        // User cancelled selection
                        throw new Error('Selection was cancelled by user');
                    }
                }

                // Check if metadata selection is required (existing logic)
                if (result?.requiresSelection && result?.selectionOptions?.length > 0) {
                    console.log(`⏸️ Workflow ${workflowId} requires metadata selection`);

                    // Request user selection
                    const selectedItems = await this.requestSelection(workflowId, result.selectionOptions, result.allowMultiple || true);

                    if (selectedItems && selectedItems.length > 0) {
                        console.log(`▶️ Workflow ${workflowId} received selection, continuing with:`, selectedItems);

                        // Update input with selected items for next iteration
                        currentInput = {
                            ...currentInput,
                            selectedItems,
                            // Update the user message to include selected metadata for follow-up queries
                            input: {
                                ...currentInput.input,
                                messages: currentInput.input.messages.map((msg: any) => {
                                    if (msg.role === 'user') {
                                        // Format selected items for analytics continuation
                                        const selectedFormatted = selectedItems.map((item: any) =>
                                            `${item.type}:${item.name}(ID:${item.id})`
                                        ).join(', ');

                                        return {
                                            ...msg,
                                            content: `Continue analytics using these selected metadata: ${selectedFormatted}. Original query: ${input.input.messages[0]?.content || msg.content}`
                                        };
                                    }
                                    return msg;
                                })
                            }
                        };

                        // Update UI for next iteration
                        this.updateUIState({
                            showProcessing: true,
                            processingMessage: `Processing selected items...`
                        });

                        continue; // Continue the loop with selected items
                    } else {
                        // User cancelled selection
                        throw new Error('Selection was cancelled by user');
                    }
                } else {
                    // No selection required or final result, complete the workflow
                    console.log(`✅ Workflow ${workflowId} completed after ${iterationCount} iterations`);

                    this.activeWorkflows.set(workflowId, {
                        ...this.activeWorkflows.get(workflowId),
                        status: 'completed',
                        result
                    });

                    // Notify UI of completion
                    this.uiCallbacks?.onWorkflowComplete(workflowId, result);

                    // Show success toast notification
                    this.uiCallbacks?.showToast?.('success', 'Workflow Completed', `${flowType} workflow finished successfully`, {
                        workflowId,
                        position: 'bottom-right'
                    });

                    // Add completion feedback
                    this.addProgressMessage('✅ Operation completed successfully');

                    // Handle rendering based on result type - orchestrator controls all UI decisions
                    if (result?.success !== false) {
                        console.log('🎭 Workflow completion: handling successful result', result);

                        // Check if this is a data entry result from aggregate data agent
                        const isDataEntryResult = result && result.data && typeof result.data === 'object' &&
                            (result.data.uploadedData || result.data.resolutionState);

                        if (isDataEntryResult) {
                            console.log('📊 Detected data entry result, calling requestDataEntryRender');
                            // For data entry results, render through conversation
                            this.requestDataEntryRender(result, input?.input?.messages?.[0]?.content || 'Data import');
                            // Reset UI state for data entry results
                            this.updateUIState({
                                showProcessing: false,
                                showQueryInput: true,
                                queryEnabled: true,
                            });
                        } else {
                            // Check for other specialized result types
                            if (result?.type === 'data_grid' || result?.type === 'resolution_selection' || result?.type === 'resolution_error') {
                                console.log('📊 Detected specialized data entry result, calling requestDataEntryRender');
                                this.requestDataEntryRender(result, input?.input?.messages?.[0]?.content || 'Data import');
                            } else if (result && (
                                result.dataElements || result.indicators || result.organisationUnits ||
                                result.dataSets || result.programs || result.categories ||
                                (result.data && Array.isArray(result.data))
                            )) {
                                console.log('🔍 Detected search result, calling requestSearchRender');
                                this.requestSearchRender(result, input?.input?.messages?.[0]?.content || 'Search query');
                                // Reset UI state for search results - they are handled through conversation
                                this.updateUIState({
                                    showProcessing: false,
                                    showQueryInput: true,
                                    queryEnabled: true,
                                });

                                // Complete the workflow early for search results to prevent duplicate rendering
                                this.activeWorkflows.set(workflowId, {
                                    ...this.activeWorkflows.get(workflowId),
                                    status: 'completed',
                                    result
                                });

                                // Notify UI of completion
                                this.uiCallbacks?.onWorkflowComplete(workflowId, result);

                                // Show success toast notification
                                this.uiCallbacks?.showToast?.('success', 'Search Completed', 'Search results displayed successfully', {
                                    workflowId,
                                    position: 'bottom-right'
                                });

                                return result;
                            } else if (result?.data?.echarts_option || result?.chart?.echarts_option || result?.echarts_option) {
                                console.log('📊 Detected chart result, calling renderChart');
                                this.renderChart(result);
                            } else if (result?.success === true && result?.message) {
                                // Handle general successful operation results (CRUD operations, etc.)
                                console.log('✅ Detected general successful operation result, adding to conversation');
                                console.log('📋 Result message:', result.message);
                                this.addAssistantMessage(result.message, 'response', result);
                                // Reset UI state for successful operations
                                this.updateUIState({
                                    showProcessing: false,
                                    showQueryInput: true,
                                    queryEnabled: true,
                                });
                            } else {
                                // Default: update UI state for generic results
                                console.log('📋 Using default UI state update for result');
                                this.updateUIState({
                                    showProcessing: false,
                                    showResults: true,
                                    results: result,
                                    resultsType: result.type || 'default',
                                });
                            }
                        }
                    } else if (result?.error) {
                        this.updateUIState({
                            showProcessing: false
                        });
                    }

                    return result;
                }
            }

            // Max iterations reached
            throw new Error(`Workflow ${workflowId} exceeded maximum iterations (${maxIterations})`);

        } catch (error) {
            console.error(`❌ Workflow ${workflowId} failed:`, error);

            this.activeWorkflows.set(workflowId, {
                ...this.activeWorkflows.get(workflowId),
                status: 'error',
                error: error.message
            });

            // Notify UI of error
            this.uiCallbacks?.onWorkflowError(workflowId, error.message);

            // Show error toast notification
            this.uiCallbacks?.showToast?.('error', 'Workflow Failed', `${flowType} workflow encountered an error: ${error.message}`, {
                workflowId,
                position: 'bottom-right',
                duration: 8000
            });

            this.updateUIState({
                showProcessing: false
            });

            throw error;
        }
    }

    // Show query input
    showQueryInput(text = '', enabled = true) {
        this.updateUIState({
            showQueryInput: true,
            queryText: text,
            queryEnabled: enabled
        });
    }

    // Show processing state
    showProcessing(message = 'Processing...') {
        this.updateUIState({
            showProcessing: true,
            processingMessage: message,
        });
    }

    // Show results
    showResults(result: any, resultType = 'query') {
        console.log('📊 showResults called with:', result, resultType);

        // Check if this is a data entry result that needs special rendering
        const isDataEntryResult = result && (
            result.type === 'data_grid' ||
            result.type === 'resolution_selection' ||
            result.type === 'resolution_error' ||
            // Also check for results that contain data entry data structure
            (result.data && typeof result.data === 'object' &&
             (result.data.resolutionState || result.data.headers || result.data.rows))
        );

        if (isDataEntryResult) {
            console.log('📊 Detected data entry result, calling requestDataEntryRender');
            // For data entry results, render through the conversation system
            this.requestDataEntryRender(result, 'Data import request');
        } else {
            // For other results, just update UI state
            this.updateUIState({
                showProcessing: false,
                showResults: true,
                results: result,
                resultsType: resultType,
            });
        }
    }

    // Request user selection during workflow
    async requestSelection(workflowId: string, options: SelectionOptions[], multiple = true): Promise<SelectionOptions[]> {
        console.log(`⏸️ Workflow ${workflowId} requesting user selection`);

        return new Promise((resolve, reject) => {
            if (!this.uiCallbacks?.onSelection) {
                reject(new Error('No UI callbacks registered for workflow orchestration'));
                return;
            }

            // Add selection prompt to conversation
            const selectionMessage = `Please select the relevant items from the ${options.length} available options${multiple ? ' (multiple selection allowed)' : ''}`;
            this.addAssistantMessage(selectionMessage, 'selection', {
                selectionOptions: options,
                allowMultiple: multiple,
                workflowId
            });

            // Update UI to show selection
            this.updateUIState({
                showProcessing: false,
                showSelection: true,
                selectionOptions: options,
                selectionMultiple: multiple
            });

            this.uiCallbacks.onSelection(options, (selectedItems) => {
                console.log(`▶️ Workflow ${workflowId} received selection:`, selectedItems);

                // Hide selection UI
                this.updateUIState({
                    showSelection: false,
                    selectionOptions: []
                });

                resolve(selectedItems);
            });
        });
    }

    // Request user selection for agent choice
    async requestUserSelection(workflowId: string, options: any[], message: string): Promise<any> {
        console.log(`⏸️ Workflow ${workflowId} requesting user agent selection`);

        return new Promise((resolve, reject) => {
            if (!this.uiCallbacks?.onSelection) {
                reject(new Error('No UI callbacks registered for workflow orchestration'));
                return;
            }

            // Add selection prompt to conversation
            this.addAssistantMessage(message, 'selection', {
                selectionOptions: options,
                allowMultiple: false,
                workflowId
            });

            // Update UI to show selection
            this.updateUIState({
                showProcessing: false,
                showSelection: true,
                selectionOptions: options,
                selectionMultiple: false
            });

            this.uiCallbacks.onSelection(options, (selectedItems) => {
                console.log(`▶️ Workflow ${workflowId} received agent selection:`, selectedItems);

                // Hide selection UI
                this.updateUIState({
                    showSelection: false,
                    selectionOptions: []
                });

                // Return the first (and only) selected item
                resolve(selectedItems[0]);
            });
        });
    }

    // Get agent function by name
    private getAgentFunction(agentName: string): any {
        // Import agents dynamically to avoid circular dependencies
        switch (agentName) {
            case 'direct_search':
                return async (input: any) => {
                    const { searchAgent } = await import('../agents/search-agent');
                    return searchAgent.invoke(input);
                };
            case 'analytics_routing':
                return async (input: any) => {
                    const { analyticsGraphAgent } = await import('../agents/analytics-graph-agent');
                    return analyticsGraphAgent.invoke(input);
                };
            case 'crud':
                return async (input: any) => {
                    const { crudAgent } = await import('../agents/crud-agent');
                    return crudAgent.invoke(input);
                };
            case 'data_entry':
                return async (input: any) => {
                    const { createRoutedDataEntryAgent } = await import('../agents/routed-data-entry-agent');
                    const dataEntryAgent = createRoutedDataEntryAgent(this);
                    return dataEntryAgent.invoke(input);
                };
            default:
                return null;
        }
    }

    // Request chart rendering
    renderChart(chartData: any) {
        console.log(`📊 Rendering chart:`, chartData);
        this.updateUIState({
            showChart: true,
            chartData: chartData
        });
        this.uiCallbacks?.onChartRender(chartData);
    }

    // Get workflow status
    getWorkflowStatus(workflowId: string) {
        return this.activeWorkflows.get(workflowId);
    }

    // Get all active workflows
    getActiveWorkflows() {
        return Array.from(this.activeWorkflows.entries()).map(([id, data]) => ({
            id,
            ...data
        })).filter(workflow => workflow.status === 'running');
    }

    // Clear completed workflows
    clearCompletedWorkflows() {
        for (const [id, workflow] of this.activeWorkflows) {
            if (workflow.status === 'completed' || workflow.status === 'error') {
                this.activeWorkflows.delete(id);
            }
        }
    }

    // Conversation management methods

    // Add user message to conversation
    addUserMessage(content: string, type: ConversationMessage['type'] = 'query', data?: any) {
        const threadId = `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const message: ConversationMessage = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            role: 'user',
            content,
            data,
            type,
            threadId
        };

        this.updateUIState({
            conversation: [...this.currentUIState.conversation, message]
        });

        return message;
    }

    // Add assistant message to conversation
    addAssistantMessage(content: string, type: ConversationMessage['type'] = 'response', data?: any, threadId?: string) {
        // Use provided threadId or find the most recent user message thread
        const finalThreadId = threadId || this.getCurrentThreadId();
        const message: ConversationMessage = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            role: 'assistant',
            content,
            data,
            type,
            threadId: finalThreadId
        };

        this.updateUIState({
            conversation: [...this.currentUIState.conversation, message]
        });

        return message;
    }

    // Add progress message to conversation (updates existing or creates new)
    addProgressMessage(content: string, data?: any) {
        // Use the current thread ID for progress messages
        const threadId = this.getCurrentThreadId();

        // Check if there's already a progress message in the conversation for this thread
        const existingProgressIndex = this.currentUIState.conversation.findIndex(
            msg => msg.type === 'progress' && msg.role === 'assistant' && msg.threadId === threadId
        );

        const progressMessage: ConversationMessage = {
            id: existingProgressIndex >= 0
                ? this.currentUIState.conversation[existingProgressIndex].id
                : `progress_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            role: 'assistant',
            content,
            data,
            type: 'progress',
            threadId
        };

        if (existingProgressIndex >= 0) {
            // Update existing progress message
            const updatedConversation = [...this.currentUIState.conversation];
            updatedConversation[existingProgressIndex] = progressMessage;
            this.updateUIState({
                conversation: updatedConversation
            });
        } else {
            // Add new progress message
            this.updateUIState({
                conversation: [...this.currentUIState.conversation, progressMessage]
            });
        }

        return progressMessage;
    }

    // Get the current thread ID (most recent user message thread)
    private getCurrentThreadId(): string | undefined {
        // Find the most recent user message and return its threadId
        const userMessages = this.currentUIState.conversation
            .filter(msg => msg.role === 'user')
            .sort((a, b) => b.timestamp - a.timestamp);

        return userMessages[0]?.threadId;
    }

    // Specialized method for rendering direct search results in conversation
    requestSearchRender(searchResult: any, originalQuery: string) {
        console.log('🔍 Rendering direct search results:', searchResult);

        // Handle different response formats from search agent
        let cleanSearchResult = searchResult;

        // If search agent returned a flat array, wrap it in correct format for MessageRenderer
        if (Array.isArray(searchResult)) {
            console.log('🔍 Array search result detected, wrapping as organisationUnits');
            cleanSearchResult = { organisationUnits: searchResult };
        }
        // If wrapped in success response, extract the core results
        else if (searchResult.success !== undefined && searchResult.data && Array.isArray(searchResult.data)) {
            console.log('🔍 Wrapped search result detected, extracting and wrapping as organisationUnits');
            cleanSearchResult = { organisationUnits: searchResult.data };
        }
        // If already in correct multi-type format, use as-is
        else if (cleanSearchResult && typeof cleanSearchResult === 'object' && !Array.isArray(cleanSearchResult)) {
            // Check if it has metadata type keys
            const hasMetadataKeys = Object.keys(cleanSearchResult).some(key =>
                ['dataElements', 'indicators', 'organisationUnits', 'dataSets', 'programs', 'categories', 'optionSets', 'validationRules'].includes(key)
            );
            if (!hasMetadataKeys && cleanSearchResult.results && Array.isArray(cleanSearchResult.results)) {
                // Wrap results under organisationUnits key
                cleanSearchResult = { organisationUnits: cleanSearchResult.results };
            }
        }

        // Check if we have actual search results to render
        if (!cleanSearchResult || (!Array.isArray(cleanSearchResult) && Object.keys(cleanSearchResult).length === 0)) {
            // No search data, just add a simple message
            return this.addAssistantMessage(
                'Search completed',
                'response',
                { searchResult, originalQuery }
            );
        }

        // Create a rich search result message
        const totalResults = this.calculateTotalResults(cleanSearchResult);
        const content = `Found ${totalResults} metadata ${totalResults === 1 ? 'item' : 'items'} matching "${originalQuery}"`;

        // Preserve the original multi-type structure that MessageRenderer expects
        // Search agent should return the correct format: { dataElements: [...], indicators: [...], etc. }
        const messageData = {
            ...cleanSearchResult,
            displayType: 'search_results', // Flag for specialized rendering
            originalQuery,
            totalResults
        };

        // Add the search result as a specialized message type
        return this.addAssistantMessage(
            content,
            'response',
            messageData
        );
    }

    // Specialized method for rendering tracker data results in conversation
    requestTrackerRender(trackerResult: any, originalQuery: string) {
        console.log('🏥 Rendering tracker data results:', trackerResult);

        // Handle tracker data results - these come from tracker agent
        // and contain extracted patients and mapped tracker data

        if (!trackerResult || trackerResult.success === false) {
            // Error case - add error message
            return this.addAssistantMessage(
                trackerResult?.error || 'Tracker processing failed',
                'error',
                trackerResult
            );
        }

        // Check if this is tracker data with extracted patients
        if (trackerResult.extractedPatients && Array.isArray(trackerResult.extractedPatients)) {
            const patientCount = trackerResult.extractedPatients.length;
            const mappedCount = trackerResult.mappedTrackerData ? trackerResult.mappedTrackerData.length : 0;

            let content = `Document processed successfully!`;
            content += `\n\n📋 Extracted ${patientCount} patient record(s)`;
            if (mappedCount > 0) {
                content += `\n🏥 Mapped ${mappedCount} to DHIS2 tracker entities`;
            }

            // Add the tracker data grid as a specialized message type
            return this.addAssistantMessage(
                content,
                'tracker_data_grid',
                {
                    extractedPatients: trackerResult.extractedPatients,
                    mappedTrackerData: trackerResult.mappedTrackerData || [],
                    headerMappings: trackerResult.headerMappings || {},
                    headerDisplayNames: trackerResult.headerDisplayNames || {},
                    reviewMode: trackerResult.reviewMode || false
                }
            );
        }

        // Default case - add as regular response with data
        const content = trackerResult.message || 'Tracker processing completed';
        return this.addAssistantMessage(
            content,
            'response',
            trackerResult
        );
    }

    // Specialized method for rendering data entry results in conversation
    requestDataEntryRender(dataEntryResult: any, originalQuery: string) {
        console.log('📊 Rendering data entry results:', dataEntryResult);

        // Handle data entry results - these typically come from aggregate data agent
        // and contain a data grid with headers, rows, and resolution state

        if (!dataEntryResult || dataEntryResult.success === false) {
            // Error case - add error message
            return this.addAssistantMessage(
                dataEntryResult?.error || 'Data entry processing failed',
                'error',
                dataEntryResult
            );
        }

        // Check if this is a data grid result (from aggregate data agent)
        if (dataEntryResult.type === 'data_grid' && dataEntryResult.data) {
            const { data } = dataEntryResult;
            const rowCount = data.rows ? data.rows.length : 0;
            const unresolvedCount = data.resolutionState ?
                Array.from(data.resolutionState.values()).filter((item: any) => item.status === 'pending').length : 0;

            let content = `Data entry grid loaded with ${rowCount} rows`;
            if (unresolvedCount > 0) {
                content += `. ${unresolvedCount} items need name resolution before submission.`;
            } else {
                content += '. All data is ready for submission.';
            }

            // Add the data grid as a specialized message type
            return this.addAssistantMessage(
                content,
                'data_grid',
                data
            );
        }

        // Check if this is a result with data entry data directly in the data field
        // (e.g., from aggregate data agent that hasn't reached display_data_grid yet)
        if (dataEntryResult.data && typeof dataEntryResult.data === 'object') {
            const data = dataEntryResult.data;

            // Check if it has the structure of parsed CSV data
            if (data.headers && Array.isArray(data.headers) && data.rows && Array.isArray(data.rows)) {
                const rowCount = data.rows.length;
                const unresolvedCount = data.resolutionState ?
                    Array.from(data.resolutionState.values()).filter((item: any) => item.status === 'pending').length : 0;

                let content = `CSV file parsed successfully. Here is a summary of the data rows and referenced DHIS2 resources.`;
                content += `\n\nData grid loaded with ${rowCount} rows`;
                if (unresolvedCount > 0) {
                    content += `. ${unresolvedCount} items need name resolution before submission.`;
                } else {
                    content += '. All data is ready for submission.';
                }

                // Add the data grid as a specialized message type
                return this.addAssistantMessage(
                    content,
                    'data_grid',
                    {
                        headers: data.headers,
                        rows: data.rows,
                        resolutionState: data.resolutionState || [],
                        actions: ['resolve_all', 'edit_cell', 'delete_row', 'confirm_submit']
                    }
                );
            }
        }

        // Check if this is a resolution selection needed
        if (dataEntryResult.type === 'resolution_selection' && dataEntryResult.data) {
            const content = dataEntryResult.message || 'Please select the correct match for this data entry field';

            return this.addAssistantMessage(
                content,
                'resolution_selection',
                dataEntryResult.data
            );
        }

        // Check if this is a dataset selection
        if (dataEntryResult.type === 'data_set_selection' && dataEntryResult.data) {
            const content = dataEntryResult.message || 'Please select a data set';

            return this.addAssistantMessage(
                content,
                'data_set_selection',
                dataEntryResult.data
            );
        }

        // Check if this is a tracker review grid
        if (dataEntryResult.type === 'show_review_grid' && dataEntryResult.data) {
            const content = dataEntryResult.message || 'Please review the extracted patient data before saving';

            // Add the review grid as a specialized data_grid message with review actions
            const reviewMessage = this.addAssistantMessage(
                content,
                'data_grid',
                {
                    ...dataEntryResult.data,
                    reviewMode: true,
                    actions: dataEntryResult.actions || ['confirm_save', 'cancel_save'],
                    requiresUserAction: dataEntryResult.requiresUserAction || true
                }
            );

            // For review grids, don't complete the workflow - return the message and let user interact
            // The workflow should remain active and wait for user confirmation/cancellation
            console.log('📋 Review grid displayed - workflow paused for user interaction');
            return reviewMessage;
        }

        // Check if this is a resolution error
        if (dataEntryResult.type === 'resolution_error' && dataEntryResult.data) {
            const content = dataEntryResult.message || 'Error resolving data entry field';

            return this.addAssistantMessage(
                content,
                'error',
                dataEntryResult.data
            );
        }

        // Default case - add as regular response with data
        const content = dataEntryResult.message || 'Data entry completed';
        return this.addAssistantMessage(
            content,
            'response',
            dataEntryResult
        );
    }

    // Calculate total results across all result categories
    private calculateTotalResults(searchResult: any): number {
        if (searchResult.count !== undefined) {
            return searchResult.count;
        }

        // Handle properly formatted search results: {organisationUnits: [...], dataElements: [...]}
        if (searchResult && typeof searchResult === 'object' && !Array.isArray(searchResult)) {
            const metadataTypeKeys = ['dataElements', 'indicators', 'organisationUnits', 'dataSets', 'programs',
                                     'categories', 'categoryCombos', 'optionSets', 'validationRules',
                                     'visualizations', 'dashboards', 'users', 'categoryOptions',
                                     'organisationUnitGroups', 'trackedEntityTypes'];

            // Count results in metadata type arrays
            return metadataTypeKeys.reduce((total, key) => {
                const items = searchResult[key];
                return total + (Array.isArray(items) ? items.length : 0);
            }, 0);
        }

        // Fallback for legacy formats
        if (searchResult.results) {
            return Object.values(searchResult.results).reduce((total: number, items: any) => {
                return total + (Array.isArray(items) ? items.length : 0);
            }, 0) as number;
        }

        if (searchResult.data && Array.isArray(searchResult.data)) {
            return searchResult.data.length;
        }

        return 0;
    }

    // Load conversation history from conversation context
    loadConversationFromStorage() {
        try {
            // Import the conversation context dynamically to avoid circular dependencies
            import('./conversation-context').then(({ conversationContext }) => {
                const recentContext = conversationContext.getRecentContext(20); // Load last 20 conversations

                // Convert conversation entries to conversation messages
                const messages: ConversationMessage[] = [];

                recentContext.forEach(entry => {
                    // Add user message
                    messages.push({
                        id: `user_${entry.id}`,
                        timestamp: entry.timestamp - 1, // User message slightly before
                        role: 'user',
                        content: entry.query,
                        type: 'query'
                    });

                    // Add assistant message
                    messages.push({
                        id: `assistant_${entry.id}`,
                        timestamp: entry.timestamp,
                        role: 'assistant',
                        content: this.formatResponseContent(entry.response, entry.agent),
                        data: entry.response,
                        type: this.getMessageTypeFromAgent(entry.agent)
                    });
                });

                // Sort by timestamp
                messages.sort((a, b) => a.timestamp - b.timestamp);

                this.updateUIState({
                    conversation: messages
                });

                console.log(`📚 Loaded ${messages.length} messages from conversation history`);
            }).catch(error => {
                console.warn('Failed to load conversation history:', error);
            });
        } catch (error) {
            console.warn('Failed to load conversation history:', error);
        }
    }

    // Clear conversation history
    clearConversation() {
        this.updateUIState({
            conversation: []
        });
    }

    // Private helper methods for conversation management
    private formatResponseContent(response: any, agent: string): string {
        if (!response) return 'No response';

        if (response.message) return response.message;
        if (response.error) return `Error: ${response.error}`;
        if (response.success !== false) {
            if (response.count !== undefined) {
                return `Found ${response.count} results`;
            }
            if (response.data) {
                return 'Results returned';
            }
            return 'Operation completed successfully';
        }

        return JSON.stringify(response).substring(0, 200) + '...';
    }

    private getMessageTypeFromAgent(agent: string): ConversationMessage['type'] {
        switch (agent) {
            case 'search': return 'response';
            case 'crud': return 'response';
            case 'analytics': return 'response';
            case 'router': return 'response';
            default: return 'response';
        }
    }

    // Handle workflow result rendering - orchestrator controls all UI decisions
    private handleWorkflowResultRendering(result: any, input: any) {
        console.log('🎭 handleWorkflowResultRendering called with:', result);

        // Check if this is a data entry result from aggregate data agent
        const isDataEntryResult = result && result.data && typeof result.data === 'object' &&
            (result.data.uploadedData || result.data.resolutionState);

        if (isDataEntryResult) {
            console.log('📊 Detected data entry result, calling requestDataEntryRender');
            // For data entry results, render through conversation
            this.requestDataEntryRender(result, input?.input?.messages?.[0]?.content || 'Data import');
            return;
        }

        // Check for other specialized result types
        if (result?.type === 'data_grid' || result?.type === 'resolution_selection' || result?.type === 'resolution_error' || result?.type === 'data_set_selection') {
            console.log('📊 Detected specialized data entry result, calling requestDataEntryRender');
            this.requestDataEntryRender(result, input?.input?.messages?.[0]?.content || 'Data import');
            return;
        }

        // Check if this is a search result that should be rendered in conversation
        const isSearchResult = result && (
            result.dataElements || result.indicators || result.organisationUnits ||
            result.dataSets || result.programs || result.categories ||
            (result.data && Array.isArray(result.data))
        );

        if (isSearchResult) {
            console.log('🔍 Detected search result, calling requestSearchRender');
            this.requestSearchRender(result, input?.input?.messages?.[0]?.content || 'Search query');
            return;
        }

        // Check if this is a chart result
        if (result?.data?.echarts_option || result?.chart?.echarts_option || result?.echarts_option) {
            console.log('📊 Detected chart result, calling renderChart');
            this.renderChart(result);
            return;
        }

        // Default: update UI state for generic results
        console.log('📋 Using default UI state update for result');
        this.updateUIState({
            showProcessing: false,
            showResults: true,
            results: result,
            resultsType: result.type || 'default',
        });
    }

    // Handle dataset selection from data_set_selection UI
    handleDatasetSelection(selectedDatasets: any) {
        console.log('📋 Handling dataset selection:', selectedDatasets);

        // Handle array format (MetadataSelector returns array even for single select)
        const selectedDataset = Array.isArray(selectedDatasets) ? selectedDatasets[0] : selectedDatasets;

        if (!selectedDataset) {
            console.warn('No dataset selected');
            return;
        }

        // Find the data_set_selection message in the conversation
        const datasetSelectionMessage = this.currentUIState.conversation
            .filter(msg => msg.type === 'data_set_selection')
            .pop();

        if (!datasetSelectionMessage) {
            console.warn('No data_set_selection message found in conversation');
            return;
        }

        // Update the conversation with the selected dataset
        const updatedMessage = {
            ...datasetSelectionMessage,
            data: {
                ...datasetSelectionMessage.data,
                selectedDataset: selectedDataset
            }
        };

        const updatedConversation = this.currentUIState.conversation.map(msg =>
            msg.id === datasetSelectionMessage.id ? updatedMessage : msg
        );

        this.updateUIState({
            conversation: updatedConversation
        });

        // Add confirmation message
        this.addAssistantMessage(
            `Selected data set: ${selectedDataset.name}`,
            'response'
        );

        // Continue the workflow using the state graph properly
        // Restart the aggregate workflow with the selected dataset already resolved

        if (datasetSelectionMessage?.data?.uploadedData && datasetSelectionMessage.data.uploadedData.length > 0) {
            // We have CSV data - restart the workflow with dataset resolved
            console.log('📋 Dataset selected, restarting workflow with resolved dataset for CSV processing');

            // Import the workflow graph directly to avoid circular dependencies
            import('../agents/aggregate-data-agent').then((module) => {
                // Access the compiled workflow graph directly
                const aggregateDataStateGraph = (module as any).aggregateDataStateGraph;

                if (!aggregateDataStateGraph) {
                    console.error('❌ Could not access aggregate data workflow graph');
                    return;
                }

                // Create initial state with resolved dataset
                const initialState = {
                    messages: this.currentUIState.conversation.filter(msg => msg.role === 'user'),
                    orchestrator: this,
                    uploadedData: datasetSelectionMessage.data.uploadedData,
                    resolutionState: new Map(),
                    currentResolution: null,
                    processedData: [],
                    uiAction: '',
                    resourceDetails: new Map(),
                    displayNames: new Map(),
                    dataSet: {
                        id: selectedDataset.id,
                        name: selectedDataset.name,
                        resolved: true
                    },
                    submittedDataSets: new Map(),
                    displayHeaders: [],
                    finalResult: null
                };

                console.log('📋 Restarting workflow with dataset:', initialState.dataSet);
                console.log('📋 Uploaded data length:', initialState.uploadedData?.length);

                // Execute the workflow starting from map_headers (skipping dataset resolution)
                aggregateDataStateGraph.invoke(initialState).then((result: any) => {
                    console.log('📋 Workflow continuation completed:', result);

                    // Handle the final result
                    if (result?.finalResult) {
                        this.requestDataEntryRender(result.finalResult, 'Data set selection continuation');
                        // Reset UI state
                        this.updateUIState({
                            showProcessing: false,
                            showQueryInput: true,
                            queryEnabled: true,
                        });
                    }
                }).catch((error: any) => {
                    console.error('❌ Workflow continuation failed:', error);
                    this.updateUIState({
                        showProcessing: false
                    });
                });
            }).catch((error) => {
                console.error('❌ Failed to import aggregate data agent:', error);
                this.addAssistantMessage(
                    '❌ Failed to process data set selection. Please try again.',
                    'error'
                );
            });
        } else {
            // No uploaded data - show empty grid for manual entry
            console.log('📋 Dataset selected, showing empty data grid for manual entry');
            this.requestDataEntryRender({
                type: 'data_grid',
                message: `Data set "${selectedDataset.name}" selected. You can now manually enter data or upload a CSV file.`,
                data: {
                    headers: ['dataElement', 'orgUnit', 'period', 'categoryOptionCombos', 'attributeOptionCombos', 'value'],
                    rows: [],
                    resolutionState: [],
                    actions: ['resolve_all', 'edit_cell', 'delete_row', 'confirm_submit', 'add_row'],
                    dataSetId: selectedDataset.id,
                    dataSetName: selectedDataset.name
                }
            }, 'Manual data entry');
        }
    }

    // Handle data grid interactions
    async handleDataGridInteraction(interaction: any) {
        console.log('📊 Handling data grid interaction:', interaction);

        const { type, data } = interaction;

        switch (type) {
            case 'resolve_item':
                console.log('🔍 Resolving item:', data.rowIndex, data.colIndex, data.originalValue, data.fieldType);
                this.addAssistantMessage(
                    `Resolving "${data.originalValue}" for ${data.fieldType}...`,
                    'response'
                );
                // TODO: Trigger resolution workflow for specific item
                break;

            case 'edit_cell':
                console.log('✏️ Editing cell:', data.rowIndex, data.colIndex, data.newValue);
                // Update the data grid cell
                this.updateDataGridCell(data.rowIndex, data.colIndex, data.newValue);
                this.addAssistantMessage(
                    `Updated cell (${data.rowIndex + 1}, ${data.colIndex + 1}) to: ${data.newValue}`,
                    'response'
                );
                break;

            case 'delete_row':
                console.log('🗑️ Deleting row:', data.rowIndex);
                // Remove the row from the data grid
                this.deleteDataGridRow(data.rowIndex);
                this.addAssistantMessage(
                    `Deleted row ${data.rowIndex + 1}`,
                    'response'
                );
                break;

            case 'confirm_submit':
                console.log('📤 Submitting data to DHIS2...');
                this.submitDataToDHIS2();
                break;

            case 'update_data_set':
                console.log('📝 Updating data set:', data.dataSetId);
                // For follow-up data entry, submit the data to update existing values
                this.submitDataToDHIS2();
                break;

            case 'add_row':
                console.log('➕ Adding new row to data set:', data.dataSetId);
                // TODO: Implement add row workflow
                this.addAssistantMessage(
                    'Add row functionality will be implemented soon.',
                    'response'
                );
                break;

            case 'confirm_save':
            case 'cancel_save':
                console.log(`📋 Handling tracker interaction: ${type}`);

                // For tracker interactions, get data from the conversation instead of active workflow
                // Find the tracker review grid message in the conversation
                const reviewMessage = this.currentUIState.conversation
                    .filter(msg => msg.type === 'data_grid' && msg.data?.reviewMode)
                    .pop();

                if (reviewMessage?.data) {
                    // Import the tracker agent dynamically
                    try {
                        const { createTrackerDataAgent } = await import('../agents/tracker-agent');
                        const trackerAgent = createTrackerDataAgent(this);

                        if (trackerAgent?.handleUIInteraction) {
                            // Create current state from the review message data
                            const currentState = {
                                uploadedDocument: null, // Not needed for continuation
                                extractedPatients: reviewMessage.data.extractedPatients || [],
                                mappedTrackerData: reviewMessage.data.mappedTrackerData || [],
                                orgUnit: '', // Default
                                programId: '', // Default
                                attributeMappings: {}, // Default
                                uiAction: '',
                                messages: [],
                                orchestrator: this,
                                finalResult: null
                            };

                            // Call the tracker agent's UI interaction handler
                            const updatedState = await trackerAgent.handleUIInteraction(
                                { type, data },
                                currentState
                            );

                            // Handle the result
                            if (updatedState.finalResult) {
                                this.updateUIState({
                                    showProcessing: false,
                                    showResults: true,
                                    results: updatedState.finalResult,
                                    resultsType: 'tracker_processing_complete'
                                });

                                // Add completion message
                                this.addAssistantMessage(
                                    updatedState.finalResult.message || 'Tracker processing completed',
                                    'tracker_processing_complete',
                                    updatedState.finalResult
                                );
                            } else {
                                // If no final result, show a confirmation message
                                const actionMessage = type === 'confirm_save'
                                    ? '✅ Data saved to DHIS2 successfully!'
                                    : '❌ Save cancelled by user.';

                                this.addAssistantMessage(
                                    actionMessage,
                                    'response'
                                );

                                // Reset UI
                                this.updateUIState({
                                    showProcessing: false,
                                    showQueryInput: true,
                                    queryEnabled: true
                                });
                            }
                        } else {
                            console.warn('Tracker agent handleUIInteraction not available');
                            this.addAssistantMessage(
                                'Unable to process tracker interaction - agent not available',
                                'error'
                            );
                        }
                    } catch (error) {
                        console.error('Failed to import tracker agent:', error);
                        this.addAssistantMessage(
                            'Unable to process tracker interaction - agent loading failed',
                            'error'
                        );
                    }
                } else {
                    console.warn('No tracker review grid found in conversation');
                    this.addAssistantMessage(
                        'Unable to process tracker interaction - no review data found',
                        'error'
                    );
                }
                break;

            case 'resolve_all':
                console.log('🔄 Resolving all pending items...');
                this.addAssistantMessage(
                    'Bulk resolution started for all pending items...',
                    'response'
                );
                // TODO: Trigger bulk resolution workflow
                break;

            case 'update_entity_attributes':
                console.log('🔧 Updating entity attributes:', data);

                // Import the tracker agent to handle the attribute update
                try {
                    const { createTrackerDataAgent } = await import('../agents/tracker-agent');
                    const trackerAgent = createTrackerDataAgent(this);

                    if (trackerAgent?.handleUIInteraction) {
                        // Create current state (minimal state needed for attribute update)
                        const currentState = {
                            uploadedDocument: null,
                            extractedPatients: [],
                            mappedTrackerData: [],
                            orgUnit: '',
                            programId: '',
                            attributeMappings: {},
                            uiAction: '',
                            messages: this.currentUIState.conversation.filter(msg => msg.role === 'user'),
                            orchestrator: this,
                            finalResult: null
                        };

                        // Call the tracker agent's UI interaction handler
                        const updatedState = await trackerAgent.handleUIInteraction(
                            { type, data },
                            currentState
                        );

                        // Handle the result
                        if (updatedState.finalResult) {
                            this.addAssistantMessage(
                                updatedState.finalResult.message || 'Entity attributes updated successfully',
                                'response',
                                updatedState.finalResult
                            );
                        } else {
                            // If no final result, show a confirmation message
                            this.addAssistantMessage(
                                'Entity attributes updated successfully',
                                'response'
                            );
                        }
                    } else {
                        console.warn('Tracker agent handleUIInteraction not available');
                        this.addAssistantMessage(
                            'Unable to process attribute update - agent not available',
                            'error'
                        );
                    }
                } catch (error) {
                    console.error('Failed to import tracker agent for attribute update:', error);
                    this.addAssistantMessage(
                        'Unable to process attribute update - agent loading failed',
                        'error'
                    );
                }
                break;

            default:
                console.warn('Unknown data grid interaction:', type);
        }
    }

    // Update a cell in the data grid
    private updateDataGridCell(rowIndex: number, colIndex: number, newValue: string) {
        // Find the data_grid message in the conversation and update it
        const updatedConversation = this.currentUIState.conversation.map(message => {
            if (message.type === 'data_grid' && message.data) {
                const updatedData = { ...message.data };
                if (updatedData.rows && updatedData.rows[rowIndex]) {
                    updatedData.rows[rowIndex][colIndex] = newValue;
                }
                return { ...message, data: updatedData };
            }
            return message;
        });

        this.updateUIState({
            conversation: updatedConversation
        });
    }

    // Delete a row from the data grid
    private deleteDataGridRow(rowIndex: number) {
        // Find the data_grid message in the conversation and update it
        const updatedConversation = this.currentUIState.conversation.map(message => {
            if (message.type === 'data_grid' && message.data) {
                const updatedData = { ...message.data };
                if (updatedData.rows) {
                    updatedData.rows.splice(rowIndex, 1);
                }
                // Also update resolution state by removing items for this row
                if (updatedData.resolutionState) {
                    const updatedResolutionState = new Map();
                    for (const [key, item] of updatedData.resolutionState) {
                        const [rIndex, cIndex] = key.split('-').map(Number);
                        if (rIndex !== rowIndex) {
                            // Adjust row indices for items after the deleted row
                            const newKey = rIndex > rowIndex ? `${rIndex - 1}-${cIndex}` : key;
                            updatedResolutionState.set(newKey, item);
                        }
                        // Skip items from the deleted row
                    }
                    updatedData.resolutionState = Array.from(updatedResolutionState.entries());
                }
                return { ...message, data: updatedData };
            }
            return message;
        });

        this.updateUIState({
            conversation: updatedConversation
        });
    }

    // File management methods for proper file handling

    // Register a file in the orchestrator's file registry
    async registerFile(fileId: string, content: Uint8Array | string, metadata: {
        name: string;
        type: string;
        size: number;
        isBinary?: boolean;
    }): Promise<void> {
        // Determine if content is binary based on type or explicit flag
        const isBinary = metadata.isBinary !== undefined ?
            metadata.isBinary :
            this.isBinaryFileType(metadata.type);

        const entry: FileRegistryEntry = {
            id: fileId,
            name: metadata.name,
            type: metadata.type,
            size: metadata.size,
            content: content,
            isBinary: isBinary,
            uploadedAt: Date.now()
        };

        // Store in memory registry for immediate access
        this.fileRegistry.set(fileId, entry);

        // Set as current file for agents to access
        this.currentFileId = fileId;

        // Persist to IndexedDB for long-term storage
        try {
            const fileData: FileData = {
                id: fileId,
                name: metadata.name,
                type: metadata.type,
                size: metadata.size,
                content: content,
                isBinary: isBinary,
                uploadedAt: entry.uploadedAt,
                lastAccessed: entry.uploadedAt
            };

            await indexedDBStorage.saveFile(fileData);
            console.log(`📁 Registered and saved file: ${fileId} (${metadata.size} bytes, ${isBinary ? 'binary' : 'text'}) as current file`);
        } catch (error) {
            console.error('Failed to save file to IndexedDB:', error);
            // Continue with in-memory storage only
        }
    }

    // Get file content by ID
    async getFile(fileId: string): Promise<FileRegistryEntry | null> {
        // First check in-memory registry
        let entry = this.fileRegistry.get(fileId);
        if (entry) {
            entry.lastAccessed = Date.now();
            return entry;
        }

        // If not in memory, try to load from IndexedDB
        try {
            const fileData = await indexedDBStorage.loadFile(fileId);
            if (fileData) {
                // Create FileRegistryEntry from FileData
                entry = {
                    id: fileData.id,
                    name: fileData.name,
                    type: fileData.type,
                    size: fileData.size,
                    content: fileData.content,
                    isBinary: fileData.isBinary,
                    uploadedAt: fileData.uploadedAt,
                    lastAccessed: Date.now()
                };

                // Store in memory for future access
                this.fileRegistry.set(fileId, entry);

                // Update last accessed timestamp in IndexedDB
                indexedDBStorage.updateFileAccess(fileId).catch(error => {
                    console.warn('Failed to update file access timestamp:', error);
                });

                console.log(`📁 Loaded file from IndexedDB: ${fileId}`);
                return entry;
            }
        } catch (error) {
            console.warn('Failed to load file from IndexedDB:', error);
        }

        return null;
    }

    // Check if file exists
    hasFile(fileId: string): boolean {
        return this.fileRegistry.has(fileId);
    }

    // List all registered files
    listFiles(): FileRegistryEntry[] {
        return Array.from(this.fileRegistry.values());
    }

    // Remove a file from registry
    removeFile(fileId: string): boolean {
        const removed = this.fileRegistry.delete(fileId);
        if (removed) {
            console.log(`🗑️ Removed file: ${fileId}`);
        }
        return removed;
    }

    // Get the current file being processed (for agents that need file access)
    async getCurrentFile(): Promise<FileRegistryEntry | null> {
        if (!this.currentFileId) {
            return null;
        }

        // First check in-memory registry
        let entry = this.fileRegistry.get(this.currentFileId);
        if (entry) {
            entry.lastAccessed = Date.now();
            return entry;
        }

        // If not in memory, try to load from IndexedDB
        try {
            const fileData = await indexedDBStorage.loadFile(this.currentFileId);
            if (fileData) {
                // Create FileRegistryEntry from FileData
                entry = {
                    id: fileData.id,
                    name: fileData.name,
                    type: fileData.type,
                    size: fileData.size,
                    content: fileData.content,
                    isBinary: fileData.isBinary,
                    uploadedAt: fileData.uploadedAt,
                    lastAccessed: Date.now()
                };

                // Store in memory for future access
                this.fileRegistry.set(this.currentFileId, entry);

                // Update last accessed timestamp in IndexedDB
                indexedDBStorage.updateFileAccess(this.currentFileId).catch(error => {
                    console.warn('Failed to update file access timestamp:', error);
                });

                console.log(`📁 Loaded current file from IndexedDB: ${this.currentFileId}`);
                return entry;
            }
        } catch (error) {
            console.warn('Failed to load current file from IndexedDB:', error);
        }

        return null;
    }

    // Convert file content in messages to file references
    processMessagesForFileReferences(messages: any[]): any[] {
        return messages.map(message => {
            if (message.role === 'user' && message.content && typeof message.content === 'string') {
                // Check if message contains file content (legacy format or new format)
                const fileContentMatch = message.content.match(/File:\s*([^\n]+)\nContent:\n([\s\S]*)$/);
                const hasBinaryContent = message.binaryContent instanceof Uint8Array;
                const hasAttachments = message.attachments && message.attachments.length > 0;

                if (fileContentMatch || hasBinaryContent || hasAttachments) {
                    // Extract filename from various sources
                    let filename = 'unknown_file';
                    if (fileContentMatch) {
                        filename = fileContentMatch[1];
                    } else if (hasAttachments) {
                        filename = message.attachments[0].name;
                    } else if (message.content.startsWith('File: ')) {
                        filename = message.content.replace('File: ', '').split('\n')[0];
                    }

                    // Generate file ID
                    const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

                    // Get attachment info from message
                    const attachment = message.attachments?.[0];
                    const mimeType = attachment?.type || this.getFileTypeFromName(filename);
                    const isBinary = this.isBinaryFileType(mimeType);

                    let processedContent: Uint8Array | string;
                    let contentSize = 0;

                    if (hasBinaryContent) {
                        // Use binary content directly from message
                        processedContent = message.binaryContent;
                        contentSize = processedContent.length;
                        console.log(`📁 Using binary content from message: ${filename} (${contentSize} bytes)`);
                    } else if (fileContentMatch) {
                        // Legacy format: content embedded in string
                        const [, , rawContent] = fileContentMatch;

                        if (isBinary) {
                            // For binary files in legacy format, content should be Uint8Array
                            if (rawContent instanceof Uint8Array) {
                                processedContent = rawContent;
                                contentSize = processedContent.length;
                            } else {
                                console.error(`❌ Expected Uint8Array for binary file ${filename}, got ${typeof rawContent}`);
                                // Fallback: try to handle as string (might be corrupted)
                                processedContent = new Uint8Array(rawContent.length);
                                for (let i = 0; i < rawContent.length; i++) {
                                    processedContent[i] = rawContent.charCodeAt(i);
                                }
                                contentSize = processedContent.length;
                            }
                        } else {
                            // For text files, content is already a string
                            processedContent = typeof rawContent === 'string' ? rawContent : String(rawContent);
                            contentSize = processedContent.length;
                        }
                    } else {
                        // No content found - create placeholder
                        processedContent = '';
                        contentSize = 0;
                        console.warn(`⚠️ No content found for file ${filename}`);
                    }

                    // Register file in orchestrator
                    this.registerFile(fileId, processedContent, {
                        name: filename,
                        type: mimeType,
                        size: contentSize,
                        isBinary: isBinary
                    });

                    // Replace file content with reference
                    const processedMessage = {
                        ...message,
                        content: message.content.replace(
                            /File:\s*[^\n]+\nContent:\n[\s\S]*$/,
                            `file:${fileId}`
                        ).replace(
                            /^File:\s*[^\n]+$/,
                            `file:${fileId}`
                        ),
                        attachments: [{
                            id: fileId,
                            name: filename,
                            type: mimeType,
                            size: contentSize
                        }]
                    };

                    // Remove binaryContent from processed message (no longer needed)
                    if (processedMessage.binaryContent) {
                        delete processedMessage.binaryContent;
                    }

                    // Set as current file for agents to access
                    this.currentFileId = fileId;

                    console.log(`🔄 Converted file content to reference: ${filename} → ${fileId} (${isBinary ? 'binary' : 'text'}, set as current file)`);
                    return processedMessage;
                }
            }
            return message;
        });
    }

    // Check if a file type is binary
    private isBinaryFileType(mimeType: string): boolean {
        const binaryTypes = [
            'application/pdf',
            'image/png',
            'image/jpeg',
            'image/jpg',
            'image/gif',
            'image/tiff',
            'image/bmp',
            'application/octet-stream'
        ];
        return binaryTypes.includes(mimeType.toLowerCase());
    }

    // Get MIME type from filename
    private getFileTypeFromName(filename: string): string {
        const ext = filename.toLowerCase().split('.').pop() || '';
        const mimeTypes: Record<string, string> = {
            'pdf': 'application/pdf',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'csv': 'text/csv',
            'txt': 'text/plain',
            'json': 'application/json'
        };
        return mimeTypes[ext] || 'application/octet-stream';
    }

    // Progress tracking methods for workflow steps

    // Initialize workflow progress with steps
    initializeWorkflowProgress(workflowId: string, steps: Omit<WorkflowStep, 'status' | 'startTime' | 'endTime'>[]): WorkflowProgress {
        const workflowProgress: WorkflowProgress = {
            workflowId,
            steps: steps.map(step => ({
                ...step,
                status: 'pending' as const,
                startTime: undefined,
                endTime: undefined
            })),
            overallProgress: 0,
            startTime: Date.now()
        };

        // Store in active workflows
        const existingWorkflow = this.activeWorkflows.get(workflowId);
        if (existingWorkflow) {
            existingWorkflow.progress = workflowProgress;
            this.activeWorkflows.set(workflowId, existingWorkflow);
        }

        console.log(`📊 Initialized workflow progress for ${workflowId}:`, workflowProgress);
        return workflowProgress;
    }

    // Update step progress
    updateStepProgress(workflowId: string, stepId: string, updates: Partial<WorkflowStep>): void {
        const workflow = this.activeWorkflows.get(workflowId);
        if (!workflow?.progress) {
            console.warn(`No progress tracking found for workflow ${workflowId}`);
            return;
        }

        const stepIndex = workflow.progress.steps.findIndex(step => step.id === stepId);
        if (stepIndex === -1) {
            console.warn(`Step ${stepId} not found in workflow ${workflowId}`);
            return;
        }

        // Update step
        const updatedStep = { ...workflow.progress.steps[stepIndex], ...updates };
        workflow.progress.steps[stepIndex] = updatedStep;

        // Update overall progress
        const completedSteps = workflow.progress.steps.filter(step => step.status === 'completed').length;
        const totalSteps = workflow.progress.steps.length;
        workflow.progress.overallProgress = Math.round((completedSteps / totalSteps) * 100);

        // Set current step
        const activeStep = workflow.progress.steps.find(step => step.status === 'active');
        workflow.progress.currentStep = activeStep?.id;

        // Estimate time remaining (simple linear extrapolation)
        if (workflow.progress.startTime && workflow.progress.overallProgress > 0) {
            const elapsed = Date.now() - workflow.progress.startTime;
            const estimatedTotal = (elapsed / workflow.progress.overallProgress) * 100;
            workflow.progress.estimatedTimeRemaining = Math.max(0, estimatedTotal - elapsed);
        }

        console.log(`📊 Updated step progress for ${workflowId}.${stepId}:`, updatedStep);
    }

    // Start a step
    startStep(workflowId: string, stepId: string): void {
        this.updateStepProgress(workflowId, stepId, {
            status: 'active',
            startTime: Date.now()
        });
    }

    // Complete a step
    completeStep(workflowId: string, stepId: string): void {
        this.updateStepProgress(workflowId, stepId, {
            status: 'completed',
            endTime: Date.now()
        });
    }

    // Mark step as error
    errorStep(workflowId: string, stepId: string, error: string): void {
        this.updateStepProgress(workflowId, stepId, {
            status: 'error',
            error,
            endTime: Date.now()
        });
    }

    // Get workflow progress
    getWorkflowProgress(workflowId: string): WorkflowProgress | null {
        return this.activeWorkflows.get(workflowId)?.progress || null;
    }

    // Recovery workflow resumption capabilities

    // Pause a workflow for user interaction
    pauseWorkflow(workflowId: string, reason: string = 'User interaction required'): void {
        const workflow = this.activeWorkflows.get(workflowId);
        if (workflow) {
            workflow.status = 'paused';
            workflow.pauseReason = reason;
            workflow.pausedAt = Date.now();
            console.log(`⏸️ Workflow ${workflowId} paused: ${reason}`);
        }
    }

    // Resume a paused workflow
    async resumeWorkflow(workflowId: string, resumeData?: any): Promise<any> {
        const workflow = this.activeWorkflows.get(workflowId);
        if (!workflow || workflow.status !== 'paused') {
            throw new Error(`Workflow ${workflowId} is not paused or does not exist`);
        }

        console.log(`▶️ Resuming workflow ${workflowId}`);

        // Update workflow status
        workflow.status = 'running';
        delete workflow.pauseReason;
        delete workflow.pausedAt;

        // Continue workflow execution with resume data
        const currentInput = {
            ...workflow.input,
            resumeData,
            workflowId
        };

        // Get the agent function and continue
        const agentFn = this.getAgentFunction(workflow.flowType);
        if (!agentFn) {
            throw new Error(`Unknown agent type: ${workflow.flowType}`);
        }

        return this.startWorkflow(workflow.flowType, currentInput, agentFn);
    }

    // Store workflow state for recovery
    storeWorkflowState(workflowId: string, state: any): void {
        const workflow = this.activeWorkflows.get(workflowId);
        if (workflow) {
            workflow.recoveryState = {
                ...state,
                storedAt: Date.now(),
                workflowId
            };
            console.log(`💾 Stored recovery state for workflow ${workflowId}`);
        }
    }

    // Retrieve stored workflow state
    getWorkflowRecoveryState(workflowId: string): any {
        return this.activeWorkflows.get(workflowId)?.recoveryState;
    }

    // Create recovery options for failed workflow
    createRecoveryOptions(workflowId: string, error: any): RecoveryOption[] {
        const workflow = this.activeWorkflows.get(workflowId);
        const recoveryOptions: RecoveryOption[] = [];

        if (!workflow) return recoveryOptions;

        // Always offer retry option
        recoveryOptions.push({
            id: 'retry_workflow',
            label: 'Retry Workflow',
            description: 'Restart the workflow from the beginning',
            action: 'retry'
        });

        // If workflow was paused, offer resume option
        if (workflow.status === 'paused') {
            recoveryOptions.push({
                id: 'resume_workflow',
                label: 'Resume Workflow',
                description: 'Continue from where the workflow was paused',
                action: 'resume'
            });
        }

        // If there's stored recovery state, offer recovery from checkpoint
        if (workflow.recoveryState) {
            recoveryOptions.push({
                id: 'recover_from_checkpoint',
                label: 'Recover from Checkpoint',
                description: 'Resume from the last successful checkpoint',
                action: 'checkpoint_recovery'
            });
        }

        // Offer manual data entry as fallback
        recoveryOptions.push({
            id: 'manual_entry',
            label: 'Manual Data Entry',
            description: 'Enter data manually instead of processing automatically',
            action: 'manual_data_entry'
        });

        // Offer to contact support
        recoveryOptions.push({
            id: 'contact_support',
            label: 'Contact Support',
            description: 'Get help from technical support',
            action: 'contact_support'
        });

        return recoveryOptions;
    }

    // Execute recovery action
    async executeRecoveryAction(workflowId: string, actionId: string, actionData?: any): Promise<any> {
        const workflow = this.activeWorkflows.get(workflowId);
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }

        console.log(`🔧 Executing recovery action ${actionId} for workflow ${workflowId}`);

        switch (actionId) {
            case 'retry':
                // Restart the entire workflow
                return this.startWorkflow(workflow.flowType, workflow.input, this.getAgentFunction(workflow.flowType));

            case 'resume':
                // Resume from paused state
                return this.resumeWorkflow(workflowId, actionData);

            case 'checkpoint_recovery':
                // Resume from stored checkpoint
                const recoveryState = this.getWorkflowRecoveryState(workflowId);
                if (recoveryState) {
                    return this.resumeWorkflow(workflowId, { checkpoint: recoveryState });
                }
                throw new Error('No recovery checkpoint available');

            case 'manual_data_entry':
                // Switch to manual data entry mode
                this.addAssistantMessage(
                    'Switching to manual data entry mode. Please provide the data you want to enter.',
                    'info'
                );
                // This would trigger manual data entry UI
                break;

            case 'contact_support':
                // Provide support contact information
                this.addAssistantMessage(
                    'Please contact technical support with the following information:\n' +
                    `- Workflow ID: ${workflowId}\n` +
                    `- Error: ${workflow.error || 'Unknown error'}\n` +
                    `- Timestamp: ${new Date().toISOString()}`,
                    'info'
                );
                break;

            default:
                throw new Error(`Unknown recovery action: ${actionId}`);
        }
    }

    // Request user confirmation (supports both UI buttons and text responses)
    async requestConfirmation(workflowId: string, operations: any[], message: string): Promise<boolean> {
        console.log(`⏸️ Workflow ${workflowId} requesting user confirmation`);

        return new Promise((resolve, reject) => {
            if (!this.uiCallbacks?.onSelection) {
                reject(new Error('No UI callbacks registered for workflow orchestration'));
                return;
            }

            // Add confirmation prompt to conversation
            this.addAssistantMessage(message, 'confirmation', {
                operations,
                workflowId,
                actions: ['confirm', 'cancel'],
                supportsTextResponse: true
            });

            // Update UI to show confirmation
            this.updateUIState({
                showProcessing: false,
                // Note: confirmation UI is shown via conversation message
            });

            // Store the resolve function for signalConfirmation to use
            this.pendingConfirmations = this.pendingConfirmations || new Map();
            this.pendingConfirmations.set(workflowId, resolve);

            // Function to parse text confirmation responses
            const parseConfirmationResponse = (text: string): boolean | null => {
                const lowerText = text.toLowerCase().trim();

                // Positive responses
                const positiveResponses = ['yes', 'y', 'confirm', 'ok', 'proceed', 'continue', 'go ahead', 'sure', 'approved', 'accept'];
                // Negative responses
                const negativeResponses = ['no', 'n', 'cancel', 'stop', 'abort', 'quit', 'decline', 'reject'];

                if (positiveResponses.some(resp => lowerText.includes(resp))) {
                    return true;
                }
                if (negativeResponses.some(resp => lowerText.includes(resp))) {
                    return false;
                }

                return null; // Not a clear confirmation response
            };

            // Override user message method to intercept confirmation responses
            const originalAddUserMessage = this.addUserMessage.bind(this);
            this.addUserMessage = (content: string, type, data) => {
                // Check if this is a confirmation response and we have a pending confirmation
                const confirmationResult = parseConfirmationResponse(content);
                if (confirmationResult !== null && this.pendingConfirmations?.has(workflowId)) {
                    console.log(`▶️ Workflow ${workflowId} received text confirmation: ${confirmationResult} ("${content}")`);

                    // Resolve the promise
                    const resolveFn = this.pendingConfirmations.get(workflowId);
                    this.pendingConfirmations.delete(workflowId);
                    resolveFn(confirmationResult);

                    // Restore methods
                    this.addUserMessage = originalAddUserMessage;

                    // Still add the message to conversation for context
                    return originalAddUserMessage(content, type, data);
                }

                // Not a confirmation response, proceed normally
                return originalAddUserMessage(content, type, data);
            };
        });
    }

    // Signal confirmation result from UI (resolves the requestConfirmation promise)
    signalConfirmation(workflowId: string, confirmed: boolean): void {
        console.log(`🎯 Signaling confirmation for workflow ${workflowId}: ${confirmed}`);

        if (this.pendingConfirmations?.has(workflowId)) {
            const resolveFn = this.pendingConfirmations.get(workflowId);
            this.pendingConfirmations.delete(workflowId);
            resolveFn(confirmed);
        } else {
            console.warn(`No pending confirmation found for workflow ${workflowId}`);
        }
    }

    // Resume workflow with confirmation result
    async resumeWorkflowWithConfirmation(workflowId: string, confirmed: boolean): Promise<any> {
        const workflow = this.activeWorkflows.get(workflowId);

        // Handle completed workflows gracefully (user might click confirm multiple times)
        if (!workflow) {
            console.warn(`Workflow ${workflowId} does not exist - may have already been processed`);
            return { success: true, message: 'Workflow already completed' };
        }

        if (workflow.status === 'completed') {
            console.log(`Workflow ${workflowId} already completed - ignoring duplicate confirmation`);
            return workflow.result || { success: true, message: 'Workflow already completed' };
        }

        if (workflow.status !== 'running') {
            throw new Error(`Workflow ${workflowId} is not running or does not exist`);
        }

        console.log(`▶️ Resuming workflow ${workflowId} with confirmation: ${confirmed}`);

        // For CRUD agent workflows, we need to inject the confirmation result
        // into the workflow state and resume from the confirmation step
        if (workflow.flowType === 'crud') {
            // Find the confirmation message in the conversation
            const confirmationMessage = this.currentUIState.conversation
                .filter(msg => msg.type === 'confirmation' && msg.data?.workflowId === workflowId)
                .pop();

            if (confirmationMessage) {
                // Update the message to show the result
                const resultMessage = confirmed ?
                    '✅ Operations confirmed. Proceeding with execution...' :
                    '❌ Operation cancelled by user.';

                // Replace the confirmation message with a response
                const updatedConversation = this.currentUIState.conversation.map(msg =>
                    msg.id === confirmationMessage.id ? {
                        ...msg,
                        type: confirmed ? 'success' : 'warning' as any,
                        content: resultMessage
                    } : msg
                );

                this.updateUIState({
                    conversation: updatedConversation
                });
            }

            // For now, we'll just complete the workflow since we don't have full pause/resume
            // In a complete implementation, this would resume the actual StateGraph workflow
            this.activeWorkflows.set(workflowId, {
                ...workflow,
                status: 'completed',
                result: {
                    success: confirmed,
                    confirmed,
                    message: confirmed ? 'Operations confirmed and executed' : 'Operation cancelled'
                }
            });

            return workflow.result;
        }

        throw new Error(`Workflow type ${workflow.flowType} does not support confirmation resume`);
    }

    // Get resumable workflows
    getResumableWorkflows(): any[] {
        return Array.from(this.activeWorkflows.entries())
            .filter(([_, workflow]) => workflow.status === 'paused' || workflow.recoveryState)
            .map(([id, workflow]) => ({
                id,
                flowType: workflow.flowType,
                pausedReason: workflow.pauseReason,
                hasRecoveryState: !!workflow.recoveryState,
                pausedAt: workflow.pausedAt
            }));
    }

    // Error Classification System

    // Classify an error and create recovery strategies using LLM
    async classifyError(error: any, context?: {
        workflowId?: string;
        stepId?: string;
        agent?: string;
        operation?: string;
    }): Promise<ClassifiedError> {
        try {
            const errorMessage = error?.message || error?.error || String(error);
            const errorCode = error?.code || error?.statusCode || 'UNKNOWN';

            console.log('🤖 Workflow Orchestrator: Classifying error with LLM:', errorMessage);

            // Use LLM classification service for multilingual error analysis
            const errorClassification = await llmClassificationService.classifyError(error);

            // Map LLM classification to our internal format
            const classification: ErrorClassification = errorClassification.category === 'resource' || errorClassification.category === 'auth' || errorClassification.category === 'network' || errorClassification.category === 'input'
                ? 'recoverable'
                : errorClassification.category === 'server'
                ? 'non-recoverable'
                : 'recoverable'; // Default to recoverable

            // Map severity from LLM response
            const severityMap = {
                'low': 'info' as const,
                'medium': 'warning' as const,
                'high': 'error' as const,
                'critical': 'critical' as const
            };
            const severity = severityMap[errorClassification.severity] || 'error';

            // Use LLM-generated reasoning for user message
            const userMessage = errorClassification.suggestedActions?.[0] || this.createUserFriendlyMessage(error, classification, severity);

            // Create technical message for debugging
            const technicalMessage = this.createTechnicalMessage(error, context);

            // Use LLM-suggested actions as recovery strategies
            const recoveryStrategies = errorClassification.suggestedActions?.map((action, index) => ({
                id: `llm_recovery_${index}`,
                name: action,
                description: action,
                action: action.toLowerCase().replace(/\s+/g, '_'),
                priority: index + 1,
                requiresUserInput: action.toLowerCase().includes('provide') || action.toLowerCase().includes('enter'),
                automated: !action.toLowerCase().includes('provide') && !action.toLowerCase().includes('enter')
            })) || this.generateRecoveryStrategies(classification, severity, context);

            return {
                originalError: error,
                classification,
                severity,
                errorCode,
                userMessage,
                technicalMessage,
                recoveryStrategies,
                context: context || {}
            };
        } catch (llmError) {
            console.error('❌ LLM error classification failed, falling back to keyword-based:', llmError);
            // Fallback to original keyword-based classification
            return this.classifyErrorFallback(error, context);
        }
    }

    // Fallback keyword-based error classification
    private classifyErrorFallback(error: any, context?: {
        workflowId?: string;
        stepId?: string;
        agent?: string;
        operation?: string;
    }): ClassifiedError {
        const errorMessage = error?.message || error?.error || String(error);
        const errorCode = error?.code || error?.statusCode || 'UNKNOWN';

        // Classify the error type
        const classification = this.classifyErrorType(error, errorMessage, errorCode);

        // Determine severity
        const severity = this.determineErrorSeverity(error, classification);

        // Create user-friendly message
        const userMessage = this.createUserFriendlyMessage(error, classification, severity);

        // Create technical message for debugging
        const technicalMessage = this.createTechnicalMessage(error, context);

        // Generate recovery strategies based on classification
        const recoveryStrategies = this.generateRecoveryStrategies(classification, severity, context);

        return {
            originalError: error,
            classification,
            severity,
            errorCode,
            userMessage,
            technicalMessage,
            recoveryStrategies,
            context: context || {}
        };
    }

    // Classify error type based on error characteristics
    private classifyErrorType(error: any, message: string, code: string): ErrorClassification {
        const lowerMessage = message.toLowerCase();

        // Check for recoverable errors
        if (this.isRecoverableError(error, message, code)) {
            return 'recoverable';
        }

        // Check for partial success
        if (this.isPartialSuccess(error, message, code)) {
            return 'partial-success';
        }

        // Default to non-recoverable
        return 'non-recoverable';
    }

    // Determine if an error is recoverable
    private isRecoverableError(error: any, message: string, code: string): boolean {
        const recoverablePatterns = [
            // Network/connection errors
            'network error',
            'connection refused',
            'timeout',
            'connection reset',

            // Authentication errors
            'unauthorized',
            'invalid token',
            'authentication failed',

            // Resource not found (but user can specify)
            'not found',
            'does not exist',

            // Validation errors that can be fixed
            'invalid format',
            'missing required field',
            'invalid value',

            // Permission errors that might be recoverable
            'access denied',
            'insufficient permissions',

            // File processing errors
            'file not found',
            'unsupported format',
            'corrupted file'
        ];

        const lowerMessage = message.toLowerCase();
        return recoverablePatterns.some(pattern => lowerMessage.includes(pattern));
    }

    // Determine if this is a partial success
    private isPartialSuccess(error: any, message: string, code: string): boolean {
        const partialSuccessPatterns = [
            'partial success',
            'some items failed',
            'partially processed',
            'completed with warnings',
            'finished with errors'
        ];

        const lowerMessage = message.toLowerCase();
        return partialSuccessPatterns.some(pattern => lowerMessage.includes(pattern));
    }

    // Determine error severity
    private determineErrorSeverity(error: any, classification: ErrorClassification): ErrorSeverity {
        // Critical errors
        if (classification === 'non-recoverable') {
            return 'critical';
        }

        // Check error codes and types for severity
        const errorCode = error?.code || error?.statusCode;
        if (errorCode) {
            if ([500, 502, 503, 504].includes(errorCode)) {
                return 'critical'; // Server errors
            }
            if ([400, 401, 403].includes(errorCode)) {
                return 'error'; // Client errors
            }
            if ([404].includes(errorCode)) {
                return 'warning'; // Not found
            }
        }

        // Default severity based on classification
        switch (classification) {
            case 'recoverable':
                return 'warning';
            case 'partial-success':
                return 'info';
            default:
                return 'error';
        }
    }

    // Create user-friendly error message
    private createUserFriendlyMessage(error: any, classification: ErrorClassification, severity: ErrorSeverity): string {
        const errorMessage = error?.message || error?.error || String(error);

        // Customize message based on error type and severity
        switch (classification) {
            case 'recoverable':
                return `I encountered an issue that can be resolved. ${this.getRecoveryHint(errorMessage)}`;

            case 'partial-success':
                return `The operation completed partially. Some items may need attention.`;

            case 'non-recoverable':
                return `A critical error occurred that requires technical assistance.`;

            default:
                return `An unexpected error occurred: ${errorMessage}`;
        }
    }

    // Get recovery hint for recoverable errors
    private getRecoveryHint(errorMessage: string): string {
        const lowerMessage = errorMessage.toLowerCase();

        if (lowerMessage.includes('not found') || lowerMessage.includes('does not exist')) {
            return 'Please check the name or ID and try again.';
        }
        if (lowerMessage.includes('unauthorized') || lowerMessage.includes('authentication')) {
            return 'Please check your credentials and try again.';
        }
        if (lowerMessage.includes('network') || lowerMessage.includes('connection')) {
            return 'Please check your internet connection and try again.';
        }
        if (lowerMessage.includes('invalid format') || lowerMessage.includes('validation')) {
            return 'Please check the data format and correct any issues.';
        }

        return 'Please try again or contact support if the problem persists.';
    }

    // Create technical message for debugging
    private createTechnicalMessage(error: any, context?: any): string {
        const parts = [];

        if (error?.code || error?.statusCode) {
            parts.push(`Code: ${error.code || error.statusCode}`);
        }

        if (error?.stack) {
            parts.push(`Stack: ${error.stack}`);
        }

        if (context) {
            parts.push(`Context: ${JSON.stringify(context)}`);
        }

        return parts.join('\n');
    }

    // Generate recovery strategies based on error classification
    private generateRecoveryStrategies(
        classification: ErrorClassification,
        severity: ErrorSeverity,
        context?: any
    ): RecoveryStrategy[] {
        const strategies: RecoveryStrategy[] = [];

        // Always offer retry for recoverable errors
        if (classification === 'recoverable') {
            strategies.push({
                id: 'retry',
                name: 'Retry Operation',
                description: 'Attempt the operation again',
                action: 'retry',
                priority: 1,
                requiresUserInput: false,
                automated: true
            });
        }

        // Offer manual intervention for higher severity errors
        if (classification === 'recoverable' || classification === 'partial-success') {
            strategies.push({
                id: 'manual_input',
                name: 'Provide Manual Input',
                description: 'Enter the required information manually',
                action: 'manual_data_entry',
                priority: 2,
                requiresUserInput: true,
                automated: false
            });
        }

        // Offer alternative approaches
        strategies.push({
            id: 'alternative_approach',
            name: 'Try Different Approach',
            description: 'Use an alternative method or data source',
            action: 'select_alternative',
            priority: 3,
            requiresUserInput: true,
            automated: false
        });

        // Skip option for partial success
        if (classification === 'partial-success') {
            strategies.push({
                id: 'skip_failed_items',
                name: 'Skip Failed Items',
                description: 'Continue with successfully processed items only',
                action: 'skip_failed',
                priority: 4,
                requiresUserInput: false,
                automated: true
            });
        }

        // Contact support as last resort
        strategies.push({
            id: 'contact_support',
            name: 'Contact Support',
            description: 'Get help from technical support',
            action: 'contact_support',
            priority: 5,
            requiresUserInput: false,
            automated: false
        });

        return strategies;
    }

    // Handle classified error - create user-friendly response
    handleClassifiedError(classifiedError: ClassifiedError): void {
        // Add error message to conversation
        this.addAssistantMessage(
            classifiedError.userMessage,
            'error',
            {
                classifiedError,
                recoveryStrategies: classifiedError.recoveryStrategies
            }
        );

        // Log technical details for debugging
        console.error('🔍 Classified Error:', {
            classification: classifiedError.classification,
            severity: classifiedError.severity,
            userMessage: classifiedError.userMessage,
            technicalMessage: classifiedError.technicalMessage,
            strategies: classifiedError.recoveryStrategies.length
        });
    }

    // Get error recovery strategies for a workflow
    async getErrorRecoveryStrategies(workflowId: string): Promise<RecoveryStrategy[]> {
        const workflow = this.activeWorkflows.get(workflowId);
        if (!workflow?.error) {
            return [];
        }

        // Classify the workflow error using LLM
        const classifiedError = await this.classifyError(workflow.error, {
            workflowId,
            agent: workflow.flowType
        });

        return classifiedError.recoveryStrategies;
    }

    // Progress Persistence System

    // Save workflow state to persistent storage
    async saveWorkflowState(workflowId: string): Promise<void> {
        const workflow = this.activeWorkflows.get(workflowId);
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }

        const workflowState = {
            workflowId,
            flowType: workflow.flowType,
            status: workflow.status,
            input: workflow.input,
            progress: workflow.progress,
            recoveryState: workflow.recoveryState,
            pauseReason: workflow.pauseReason,
            pausedAt: workflow.pausedAt,
            startTime: workflow.startTime,
            error: workflow.error,
            savedAt: Date.now(),
            version: '1.0'
        };

        try {
            // Use localStorage for persistence (in production, this would be a proper database)
            const key = `workflow_${workflowId}`;
            localStorage.setItem(key, JSON.stringify(workflowState));
            console.log(`💾 Saved workflow state for ${workflowId}`);
        } catch (error) {
            console.error(`Failed to save workflow state for ${workflowId}:`, error);
            throw new Error('Failed to persist workflow state');
        }
    }

    // Load workflow state from persistent storage
    async loadWorkflowState(workflowId: string): Promise<any> {
        try {
            const key = `workflow_${workflowId}`;
            const savedState = localStorage.getItem(key);

            if (!savedState) {
                throw new Error(`No saved state found for workflow ${workflowId}`);
            }

            const workflowState = JSON.parse(savedState);
            console.log(`📂 Loaded workflow state for ${workflowId}`);
            return workflowState;
        } catch (error) {
            console.error(`Failed to load workflow state for ${workflowId}:`, error);
            throw new Error('Failed to load workflow state');
        }
    }

    // Resume workflow from saved state
    async resumeFromSavedState(workflowId: string): Promise<any> {
        const savedState = await this.loadWorkflowState(workflowId);

        // Restore workflow to active workflows
        this.activeWorkflows.set(workflowId, {
            ...savedState,
            status: 'running'
        });

        console.log(`▶️ Resumed workflow ${workflowId} from saved state`);

        // Continue workflow execution
        return this.startWorkflow(savedState.flowType, savedState.input, this.getAgentFunction(savedState.flowType));
    }

    // Add progress checkpoint at key workflow stages
    addProgressCheckpoint(workflowId: string, checkpointId: string, data?: any): void {
        const workflow = this.activeWorkflows.get(workflowId);
        if (!workflow) {
            console.warn(`Cannot add checkpoint: workflow ${workflowId} not found`);
            return;
        }

        if (!workflow.checkpoints) {
            workflow.checkpoints = new Map();
        }

        const checkpoint = {
            id: checkpointId,
            timestamp: Date.now(),
            data: data || {},
            progress: workflow.progress
        };

        workflow.checkpoints.set(checkpointId, checkpoint);

        // Auto-save workflow state at checkpoints
        this.saveWorkflowState(workflowId).catch(error => {
            console.warn('Failed to auto-save workflow state at checkpoint:', error);
        });

        console.log(`📍 Added progress checkpoint: ${checkpointId} for workflow ${workflowId}`);
    }

    // Get available checkpoints for a workflow
    getWorkflowCheckpoints(workflowId: string): any[] {
        const workflow = this.activeWorkflows.get(workflowId);
        if (!workflow?.checkpoints) {
            return [];
        }

        return Array.from(workflow.checkpoints.entries()).map(([id, checkpoint]) => ({
            id,
            timestamp: checkpoint.timestamp,
            progress: checkpoint.progress?.overallProgress || 0
        }));
    }

    // Resume workflow from specific checkpoint
    async resumeFromCheckpoint(workflowId: string, checkpointId: string): Promise<any> {
        const workflow = this.activeWorkflows.get(workflowId);
        if (!workflow?.checkpoints) {
            throw new Error(`No checkpoints found for workflow ${workflowId}`);
        }

        const checkpoint = workflow.checkpoints.get(checkpointId);
        if (!checkpoint) {
            throw new Error(`Checkpoint ${checkpointId} not found in workflow ${workflowId}`);
        }

        console.log(`⏮️ Resuming workflow ${workflowId} from checkpoint ${checkpointId}`);

        // Restore workflow progress to checkpoint state
        workflow.progress = checkpoint.progress;
        workflow.status = 'running';

        // Continue workflow execution with checkpoint data
        const resumeInput = {
            ...workflow.input,
            checkpointData: checkpoint.data,
            resumeFromCheckpoint: checkpointId
        };

        return this.startWorkflow(workflow.flowType, resumeInput, this.getAgentFunction(workflow.flowType));
    }

    // Store intermediate results for recovery
    storeIntermediateResult(workflowId: string, resultId: string, result: any): void {
        const workflow = this.activeWorkflows.get(workflowId);
        if (!workflow) {
            console.warn(`Cannot store intermediate result: workflow ${workflowId} not found`);
            return;
        }

        if (!workflow.intermediateResults) {
            workflow.intermediateResults = new Map();
        }

        const intermediateResult = {
            id: resultId,
            timestamp: Date.now(),
            data: result
        };

        workflow.intermediateResults.set(resultId, intermediateResult);
        console.log(`📦 Stored intermediate result: ${resultId} for workflow ${workflowId}`);
    }

    // Retrieve intermediate results
    getIntermediateResults(workflowId: string): any[] {
        const workflow = this.activeWorkflows.get(workflowId);
        if (!workflow?.intermediateResults) {
            return [];
        }

        return Array.from(workflow.intermediateResults.entries()).map(([id, result]) => ({
            id,
            timestamp: result.timestamp,
            data: result.data
        }));
    }

    // Clean up old saved states (garbage collection)
    cleanupOldSavedStates(maxAge: number = 7 * 24 * 60 * 60 * 1000): void { // 7 days default
        const now = Date.now();
        const keysToRemove: string[] = [];

        // Find old workflow states in localStorage
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith('workflow_')) {
                try {
                    const savedState = JSON.parse(localStorage.getItem(key) || '{}');
                    if (savedState.savedAt && (now - savedState.savedAt) > maxAge) {
                        keysToRemove.push(key);
                    }
                } catch (error) {
                    // Invalid saved state, remove it
                    keysToRemove.push(key);
                }
            }
        }

        // Remove old states
        keysToRemove.forEach(key => {
            localStorage.removeItem(key);
            console.log(`🗑️ Cleaned up old saved state: ${key}`);
        });

        if (keysToRemove.length > 0) {
            console.log(`🧹 Cleaned up ${keysToRemove.length} old workflow states`);
        }
    }

    // Get list of resumable workflows from saved states
    getResumableWorkflowsFromStorage(): any[] {
        const resumableWorkflows: any[] = [];

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith('workflow_')) {
                try {
                    const savedState = JSON.parse(localStorage.getItem(key) || '{}');
                    if (savedState.workflowId && (savedState.status === 'paused' || savedState.recoveryState)) {
                        resumableWorkflows.push({
                            id: savedState.workflowId,
                            flowType: savedState.flowType,
                            savedAt: savedState.savedAt,
                            progress: savedState.progress?.overallProgress || 0,
                            hasRecoveryState: !!savedState.recoveryState
                        });
                    }
                } catch (error) {
                    console.warn(`Invalid saved state for key ${key}:`, error);
                }
            }
        }

        return resumableWorkflows;
    }

    // Enable auto-save for workflows at regular intervals
    enableAutoSave(workflowId: string, intervalMs: number = 30000): () => void { // 30 seconds default
        const autoSave = () => {
            this.saveWorkflowState(workflowId).catch(error => {
                console.warn('Auto-save failed:', error);
            });
        };

        const intervalId = setInterval(autoSave, intervalMs);

        // Return cleanup function
        return () => {
            clearInterval(intervalId);
            console.log(`⏹️ Disabled auto-save for workflow ${workflowId}`);
        };
    }

    // Tracker workflow handlers - moved from App.tsx
    updateTrackerState(updates: Partial<TrackerWorkflowState>) {
        this.trackerState = { ...this.trackerState, ...updates };
    }

    getTrackerState(): TrackerWorkflowState {
        return this.trackerState;
    }

    handleConfigureProcessing(config: {
        orgUnit: string;
        programId: string;
        attributeMappings: Record<string, string>;
    }) {
        console.log('🔧 Configure processing:', config);
        // Update tracker state with configuration
        this.updateTrackerState({
            processingStep: 'Configuring processing...',
            processingProgress: 10
        });
    }

    handleUploadDocument(file: File) {
        console.log('📁 Upload document:', file.name);
        // Update tracker state for document upload
        this.updateTrackerState({
            processingStep: 'Uploading document...',
            processingProgress: 20
        });
    }

    handleRetryProcessing() {
        console.log('🔄 Retry processing');
        this.updateTrackerState({
            error: '',
            processingStep: 'Retrying processing...',
            processingProgress: 0
        });
    }

    handleConfirmSave() {
        console.log('✅ Confirm save to DHIS2');
        this.updateTrackerState({
            reviewMode: false,
            processingStep: 'Saving to DHIS2...',
            processingProgress: 90
        });
    }

    handleCancelSave() {
        console.log('❌ Cancel save');
        this.updateTrackerState({
            reviewMode: false,
            error: 'Save cancelled by user'
        });
    }

    // Handle data value update requests
    async handleDataValueUpdate(updateDetails: {
        rowIndex: number;
        colIndex: number;
        newValue: string;
        reasoning: string;
    }): Promise<{ success: boolean; message?: string; error?: string }> {
        console.log('🔄 Handling data value update:', updateDetails);

        try {
            // Find the current data grid in conversation
            const dataGridMessage = this.currentUIState.conversation
                .filter(msg => msg.type === 'data_grid')
                .pop();

            if (!dataGridMessage?.data) {
                return {
                    success: false,
                    error: 'No data grid found to update'
                };
            }

            const { data } = dataGridMessage;
            const { headers, rows, dataSetId, dataSetName } = data;

            // Validate the update request
            if (updateDetails.rowIndex < 0 || updateDetails.rowIndex >= rows.length) {
                return {
                    success: false,
                    error: `Invalid row index: ${updateDetails.rowIndex}. Grid has ${rows.length} rows.`
                };
            }

            if (updateDetails.colIndex < 0 || updateDetails.colIndex >= headers.length) {
                return {
                    success: false,
                    error: `Invalid column index: ${updateDetails.colIndex}. Grid has ${headers.length} columns.`
                };
            }

            // Get the original value for comparison
            const originalValue = rows[updateDetails.rowIndex][updateDetails.colIndex];

            // Update the data grid
            const updatedRows = [...rows];
            updatedRows[updateDetails.rowIndex] = [...rows[updateDetails.rowIndex]];
            updatedRows[updateDetails.rowIndex][updateDetails.colIndex] = updateDetails.newValue;

            // Update the conversation with the new data
            const updatedData = {
                ...data,
                rows: updatedRows
            };

            const updatedConversation = this.currentUIState.conversation.map(msg =>
                msg.id === dataGridMessage.id ? { ...msg, data: updatedData } : msg
            );

            this.updateUIState({
                conversation: updatedConversation
            });

            // Submit the update to DHIS2
            if (dataSetId) {
                console.log('📤 Submitting data value update to DHIS2...');

                // Build the data value object for DHIS2
                const dataValue: any = {};

                // Map grid columns to DHIS2 fields
                headers.forEach((header: string, colIndex: number) => {
                    const value = updatedRows[updateDetails.rowIndex][colIndex];

                    // Skip the updated column since we're only updating that specific value
                    if (colIndex === updateDetails.colIndex) {
                        // Use the new value for the updated column
                        switch (header) {
                            case 'dataElement':
                                dataValue.dataElement = value;
                                break;
                            case 'orgUnit':
                                dataValue.orgUnit = value;
                                break;
                            case 'period':
                                dataValue.period = value;
                                break;
                            case 'categoryOptionCombos':
                                if (value) dataValue.categoryOptionCombo = value;
                                break;
                            case 'attributeOptionCombos':
                                if (value) dataValue.attributeOptionCombo = value;
                                break;
                            case 'value':
                                dataValue.value = isNaN(Number(value)) ? value : Number(value);
                                break;
                        }
                    } else {
                        // Use existing values for other columns
                        switch (header) {
                            case 'dataElement':
                                dataValue.dataElement = value;
                                break;
                            case 'orgUnit':
                                dataValue.orgUnit = value;
                                break;
                            case 'period':
                                dataValue.period = value;
                                break;
                            case 'categoryOptionCombos':
                                if (value) dataValue.categoryOptionCombo = value;
                                break;
                            case 'attributeOptionCombos':
                                if (value) dataValue.attributeOptionCombo = value;
                                break;
                            case 'value':
                                dataValue.value = isNaN(Number(value)) ? value : Number(value);
                                break;
                        }
                    }
                });

                // Submit to DHIS2
                const { Dhis2Api } = await import('./app-runtime/dhis2-api');
                const mutationConfig = {
                    resource: 'dataValues',
                    type: 'create', // DHIS2 uses 'create' for data values (upsert behavior)
                    data: dataValue
                };

                const response = await Dhis2Api.mutate(mutationConfig);

                if (response.success) {
                    console.log('✅ Data value update successful in DHIS2');
                    return {
                        success: true,
                        message: `Successfully updated value from "${originalValue}" to "${updateDetails.newValue}" in row ${updateDetails.rowIndex + 1}.`
                    };
                } else {
                    console.error('❌ DHIS2 update failed:', response.error);
                    return {
                        success: false,
                        error: `DHIS2 update failed: ${response.error || 'Unknown error'}`
                    };
                }
            } else {
                // No data set ID, just update the UI
                console.log('⚠️ No data set ID found, updated UI only');
                return {
                    success: true,
                    message: `Updated value from "${originalValue}" to "${updateDetails.newValue}" in row ${updateDetails.rowIndex + 1} (UI only - no DHIS2 sync).`
                };
            }

        } catch (error) {
            console.error('❌ Data value update failed:', error);
            return {
                success: false,
                error: `Update failed: ${error.message}`
            };
        }
    }

    // Submit data to DHIS2
    private async submitDataToDHIS2() {
        console.log('📤 Starting DHIS2 data submission...');

        // Find the data_grid message with the processed data
        const dataGridMessage = this.currentUIState.conversation
            .filter(msg => msg.type === 'data_grid')
            .pop();

        if (!dataGridMessage?.data) {
            this.addAssistantMessage(
                '❌ No data found to submit. Please ensure you have processed data ready.',
                'error'
            );
            return;
        }

        const { data } = dataGridMessage;
        const { headers, rows, resolutionState } = data;

        // Check if all items are resolved
        const unresolvedItems = resolutionState ?
            Array.from(resolutionState.values()).filter((item: any) => item[1].status !== 'resolved') : [];

        if (unresolvedItems.length > 0) {
            this.addAssistantMessage(
                `❌ Cannot submit data. ${unresolvedItems.length} items still need resolution.`,
                'error'
            );
            return;
        }

        this.addAssistantMessage(
            '📤 Data submission initiated. Processing data values...',
            'response'
        );

        try {
            // Get the resolved data set from the data grid
            // Look for dataSetId in the data grid message
            let dataSetId: string | null = null;
            let dataSetName: string = 'Unknown Data Set';

            // Look for dataSetId in the conversation messages (data_grid type)
            for (const message of this.currentUIState.conversation) {
                if (message.type === 'data_grid' && message.data?.dataSetId) {
                    dataSetId = message.data.dataSetId;
                    dataSetName = message.data.dataSetName || dataSetName;
                    break;
                }
            }

            if (!dataSetId) {
                throw new Error('No data set found. Please ensure data set resolution was completed.');
            }

            // Prepare data values for submission
            const dataValues = [];

            for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
                const row = rows[rowIndex];
                const dataValue: any = {};

                headers.forEach((header: string, colIndex: number) => {
                    const value = row[colIndex];
                    const resolutionKey = `${rowIndex}-${colIndex}`;
                    const resolution = resolutionState ?
                        Array.from(resolutionState).find(([key]) => key === resolutionKey)?.[1] : null;

                    // Use resolved ID if available, otherwise use the raw value
                    const finalValue = resolution?.resolvedId || value;

                    // Map to DHIS2 field names - period and orgUnit go in each dataValue
                    switch (header) {
                        case 'dataElement':
                            dataValue.dataElement = finalValue;
                            break;
                        case 'orgUnit':
                            dataValue.orgUnit = finalValue;
                            break;
                        case 'period':
                            dataValue.period = finalValue;
                            break;
                        case 'categoryOptionCombos':
                            if (finalValue) dataValue.categoryOptionCombo = finalValue;
                            break;
                        case 'attributeOptionCombos':
                            if (finalValue) dataValue.attributeOptionCombo = finalValue;
                            break;
                        case 'value':
                            dataValue.value = isNaN(Number(finalValue)) ? finalValue : Number(finalValue);
                            break;
                    }
                });

                // Only add complete data values
                if (dataValue.dataElement && dataValue.orgUnit && dataValue.period && dataValue.value !== undefined) {
                    dataValues.push(dataValue);
                }
            }

            // Create the complete DHIS2 data set payload
            const dataSetPayload = {
                dataValues: dataValues
            };

            console.log(`📤 Submitting data set payload to DHIS2:`, dataSetPayload);

            // Import the DHIS2 API dynamically to avoid circular dependencies
            const { Dhis2Api } = await import('./app-runtime/dhis2-api');

            // Submit the complete data set to DHIS2
            const mutationConfig = {
                resource: 'dataValueSets',
                type: 'create',
                data: dataSetPayload
            };
            const response = await Dhis2Api.mutate(mutationConfig);

            if (response.success) {
                // Store the submitted data set for future follow-up operations
                const submittedDataSet = {
                    dataSetId: dataSetId,
                    dataSetName: 'Unknown Data Set', // TODO: Get from data grid context
                    submittedData: dataValues,
                    submissionDate: new Date(),
                    lastModified: new Date()
                };

                // Store in conversation context (in a real app, this would be persisted)
                // For now, we'll add it as metadata to the conversation
                const submissionMessage = {
                    type: 'data_submission_success',
                    message: `✅ Data submitted successfully! ${dataValues.length} data values imported to DHIS2 data set "${submittedDataSet.dataSetName}".`,
                    data: {
                        dataSetId: submittedDataSet.dataSetId,
                        dataSetName: submittedDataSet.dataSetName,
                        submittedData: submittedDataSet.submittedData,
                        submissionDate: submittedDataSet.submissionDate,
                        followUpActions: [
                            'update_data_set',
                            'delete_data',
                            'add_new_data',
                            'view_data_set'
                        ]
                    }
                };

                this.addAssistantMessage(
                    submissionMessage.message,
                    'data_grid',
                    submissionMessage.data
                );
                console.log('📤 DHIS2 submission successful:', response);
            } else {
                throw new Error(response.error || 'Unknown submission error');
            }

        } catch (error) {
            console.error('📤 DHIS2 submission failed:', error);
            this.addAssistantMessage(
                `❌ Data submission failed: ${error.message}`,
                'error'
            );
        }
    }
}

// Export singleton instance
export const workflowOrchestrator = new WorkflowOrchestrator();
