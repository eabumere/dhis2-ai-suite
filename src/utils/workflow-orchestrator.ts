// Workflow Orchestrator - complete UI and workflow lifecycle management
export interface SelectionOptions {
    name: string;
    id: string;
    type: 'indicator' | 'dataElement';
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

    // Selection states
    showSelection: boolean;
    selectionOptions: SelectionOptions[];
    selectionMultiple: boolean;

    // Error states
    showError: boolean;
    errorMessage?: string;

    // General states
    currentWorkflowId?: string;
}

// Comprehensive UI orchestration callbacks
export interface ComprehensiveWorkflowCallbacks {
    // UI state management
    onUIStateChange: (newState: Partial<WorkflowUIState>) => void;

    // Selection handling
    onSelection: (options: SelectionOptions[], callback: (selectedItems: SelectionOptions[]) => void) => void;

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
        showSelection: false,
        selectionOptions: [],
        selectionMultiple: true,
        showError: false
    };

    // Initialize default UI state
    resetUIState() {
        this.currentUIState = {
            showQueryInput: true,
            queryText: '',
            queryEnabled: true,
            showProcessing: false,
            showResults: false,
            showSelection: false,
            selectionOptions: [],
            selectionMultiple: true,
            showError: false
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
    async startWorkflow<T extends { flow: string; input: any; workflowId?: string }>(
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
            processingMessage: `Starting ${flowType} workflow...`,
            currentWorkflowId: workflowId
        });

        // Store workflow context
        this.activeWorkflows.set(workflowId, {
            flowType,
            status: 'running',
            startTime: Date.now(),
            input
        });

        try {
            const result = await agentFn(input);
            this.activeWorkflows.set(workflowId, {
                ...this.activeWorkflows.get(workflowId),
                status: 'completed',
                result
            });

            // Notify UI of completion
            this.uiCallbacks?.onWorkflowComplete(workflowId, result);

            return result;
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

    // Get current UI state
    getCurrentUIState(): WorkflowUIState {
        return { ...this.currentUIState };
    }
}

// Export singleton instance
export const workflowOrchestrator = new WorkflowOrchestrator();
