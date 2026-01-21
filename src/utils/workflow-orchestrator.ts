// Workflow Orchestrator - complete UI and workflow lifecycle management
export interface SelectionOptions {
    name: string;
    id: string;
    type: 'indicator' | 'dataElement';
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
    type: 'query' | 'response' | 'selection' | 'error' | 'selection_response' | 'data_grid' | 'resolution_selection'
	    | 'tracker_processing_complete' | 'data_set_selection';
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

    // Error states
    showError: boolean;
    errorMessage?: string;

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
}

class WorkflowOrchestrator {
    private activeWorkflows = new Map<string, any>();
    private uiCallbacks: ComprehensiveWorkflowCallbacks | null = null;
    private fileRegistry = new Map<string, FileRegistryEntry>();
    private currentFileId: string | null = null;
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
        showError: false,
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
            showError: false,
            conversation: [],
            showConversation: true
        };
        this.uiCallbacks?.onUIStateChange(this.currentUIState);
    }

    // Initialize UI state for a new chat session (clear conversation history)
    initializeNewChatSession() {
        console.log('🔄 Initializing new chat session - clearing conversation history');
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
            showError: false,
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
            processingMessage: 'Thinking...',
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
                                showError: false
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
                                    showError: false
                                });
                            } else {
                                // Default: update UI state for generic results
                                console.log('📋 Using default UI state update for result');
                                this.updateUIState({
                                    showProcessing: false,
                                    showResults: true,
                                    results: result,
                                    resultsType: result.type || 'default',
                                    showError: false
                                });
                            }
                        }
                    } else if (result?.error) {
                        this.updateUIState({
                            showError: true,
                            errorMessage: result.error,
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
            this.updateUIState({
                showError: true,
                errorMessage: error.message,
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
            showError: false
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
                showError: false
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
        const message: ConversationMessage = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            role: 'user',
            content,
            data,
            type
        };

        this.updateUIState({
            conversation: [...this.currentUIState.conversation, message]
        });

        return message;
    }

    // Add assistant message to conversation
    addAssistantMessage(content: string, type: ConversationMessage['type'] = 'response', data?: any) {
        const message: ConversationMessage = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            role: 'assistant',
            content,
            data,
            type
        };

        this.updateUIState({
            conversation: [...this.currentUIState.conversation, message]
        });

        return message;
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
            showError: false
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
                            showError: false
                        });
                    }
                }).catch((error: any) => {
                    console.error('❌ Workflow continuation failed:', error);
                    this.updateUIState({
                        showError: true,
                        errorMessage: error.message,
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
                // TODO: Implement data set update workflow
                this.addAssistantMessage(
                    'Data set update functionality will be implemented soon.',
                    'response'
                );
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
    registerFile(fileId: string, content: Uint8Array | string, metadata: {
        name: string;
        type: string;
        size: number;
        isBinary?: boolean;
    }): void {
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

        this.fileRegistry.set(fileId, entry);
        console.log(`📁 Registered file: ${fileId} (${metadata.size} bytes, ${isBinary ? 'binary' : 'text'})`);
    }

    // Get file content by ID
    getFile(fileId: string): FileRegistryEntry | null {
        const entry = this.fileRegistry.get(fileId);
        if (entry) {
            entry.lastAccessed = Date.now();
        }
        return entry || null;
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
    getCurrentFile(): FileRegistryEntry | null {
        if (!this.currentFileId) {
            return null;
        }
        return this.getFile(this.currentFileId);
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
