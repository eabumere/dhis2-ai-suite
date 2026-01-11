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

export interface ConversationMessage {
    id: string;
    timestamp: number;
    role: 'user' | 'assistant';
    content: string;
    attachments?: FileAttachment[];
    data?: any;
    type: 'query' | 'response' | 'selection' | 'error' | 'selection_response' | 'data_grid' | 'resolution_selection' | 'tracker_processing_complete';
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
            input
        });

        let currentInput = { ...input };
        let maxIterations = 5; // Prevent infinite loops
        let iterationCount = 0;

        try {
            while (iterationCount < maxIterations) {
                iterationCount++;

                console.log(`🔄 Workflow ${workflowId} iteration ${iterationCount} with input:`, currentInput);

                const result = await agentFn(currentInput);
                console.log(`📋 Workflow ${workflowId} iteration ${iterationCount} result:`, result);

                // Check if selection is required
                if (result?.requiresSelection && result?.selectionOptions?.length > 0) {
                    console.log(`⏸️ Workflow ${workflowId} requires user selection`);

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
        if (result?.type === 'data_grid' || result?.type === 'resolution_selection' || result?.type === 'resolution_error') {
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

    // Handle data grid interactions
    handleDataGridInteraction(interaction: any) {
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
                // Update the data in the conversation message
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
            Array.from(resolutionState.values()).filter((item: any) => item.status !== 'resolved') : [];

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
            // Get the resolved data set from the aggregate data agent
            // We need to find the dataSet from the conversation or state
            let dataSetId: string | null = null;

            // Look for dataSet in the conversation messages
            for (const message of this.currentUIState.conversation) {
                if (message.data?.dataSet?.id) {
                    dataSetId = message.data.dataSet.id;
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
                        case 'categoryOptionCombo':
                            if (finalValue) dataValue.categoryOptionCombo = finalValue;
                            break;
                        case 'attributeOptionCombo':
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
                dataSet: dataSetId,
                completeDate: new Date().toISOString().split('T')[0], // Current date in YYYY-MM-DD format
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

    // Get current UI state
    getCurrentUIState(): WorkflowUIState {
        return { ...this.currentUIState };
    }
}

// Export singleton instance
export const workflowOrchestrator = new WorkflowOrchestrator();
