// Workflow Orchestrator - complete UI and workflow lifecycle management
export interface SelectionOptions {
    name: string;
    id: string;
    type: 'indicator' | 'dataElement';
}

export interface ConversationMessage {
    id: string;
    timestamp: number;
    role: 'user' | 'assistant';
    content: string;
    data?: any;
    type: 'query' | 'response' | 'selection' | 'error' | 'selection_response';
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

                    // Show appropriate success/error UI
                    if (result?.success !== false) {
                        this.showResults(result, result.type || 'default');
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
        this.updateUIState({
            showProcessing: false,
            showResults: true,
            results: result,
            resultsType: resultType,
            showError: false
        });
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

        // Check if we have search results to render
        if (!searchResult || (!searchResult.results && !searchResult.data)) {
            // No search data, just add a simple message
            return this.addAssistantMessage(
                searchResult?.message || 'Search completed',
                'response',
                searchResult
            );
        }

        // Create a rich search result message
        const totalResults = this.calculateTotalResults(searchResult);
        const content = `Found ${totalResults} metadata ${totalResults === 1 ? 'item' : 'items'} matching "${originalQuery}"`;

        // Add the search result as a specialized message type
        const message = this.addAssistantMessage(
            content,
            'response',
            {
                ...searchResult,
                displayType: 'search_results', // Flag for specialized rendering
                originalQuery,
                totalResults
            }
        );

        return message;
    }

    // Calculate total results across all result categories
    private calculateTotalResults(searchResult: any): number {
        if (searchResult.count !== undefined) {
            return searchResult.count;
        }

        if (searchResult.results) {
            return Object.values(searchResult.results).reduce((total: number, items: any) => {
                return total + (Array.isArray(items) ? items.length : 0);
            }, 0);
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

    // Get current UI state
    getCurrentUIState(): WorkflowUIState {
        return { ...this.currentUIState };
    }
}

// Export singleton instance
export const workflowOrchestrator = new WorkflowOrchestrator();
