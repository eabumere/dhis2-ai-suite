import { Annotation, END, START, StateGraph } from '@langchain/langgraph/web';
import { HumanMessage } from '@langchain/core/messages';
import { ChatModels } from '../utils/chat-model-factory';
import { createAggregateDataAgent } from './aggregate-data-agent';
import { eventsAgent } from './events-agent';
import { createTrackerDataAgent } from './tracker-agent';
import { addConversation, createMutationDataContext } from '../utils/conversation-context';

// Import the data value update function directly for handling update_data_value actions
// Note: This function is not exported from aggregate-data-agent.ts, so we need to handle this differently

// Define Router State - tracks workflow context and orchestrator reference
const DataEntryRouterAnnotation = Annotation.Root({
	// Progress tracking state
	workflowProgress: Annotation<{
		currentStep: number;
		totalSteps: number;
		stepName: string;
		message: string;
		isIndeterminate?: boolean;
	}>({
		reducer: (left, right) => right || left,
		default: () => ({
			currentStep: 0,
			totalSteps: 4,
			stepName: 'Initializing',
			message: 'Preparing data entry workflow...',
			isIndeterminate: true
		}),
	}),

	// Orchestrator reference for UI communication
	orchestrator: Annotation<any>({
		reducer: (left, right) => right || left,
		default: () => null,
	}),

	// Workflow context
	dataEntryCategory: Annotation<string>({
		reducer: (left, right) => right || left,
		default: () => 'unknown'
	}),
	originalQuery: Annotation<string>({
		reducer: (left, right) => right || left,
		default: () => ''
	}),

	// Data entry type context (passed from router agent for follow-ups)
	dataEntryType: Annotation<'tracker' | 'aggregate' | null>({
		reducer: (left, right) => right || left,
		default: () => null
	}),

	// Flag to indicate this is a data value update request
	isDataValueUpdate: Annotation<boolean>({
		reducer: (left, right) => right || left,
		default: () => false
	}),

	// Orchestrator reference for direct calls and rendering
	orchestrator: Annotation<any>({
		reducer: (left, right) => right || left,
		default: () => null
	}),

	// Messages for processing
	messages: Annotation<any[]>({
		reducer: (left: any[], right: any[]) => right ? right : left,
		default: () => []
	}),

	// Final result
	finalResult: Annotation<any>({
		reducer: (left, right) => right || left,
		default: () => null
	}),
});

// Initialize the ChatOpenAI model with Azure configuration
const model = ChatModels.createAgentModel();

// StateGraph Workflow Nodes

// Progress tracking helper
function updateProgress(step: number, stepName: string, message: string, isIndeterminate = false): Partial<typeof DataEntryRouterAnnotation.State> {
    return {
        workflowProgress: {
            currentStep: step,
            totalSteps: 4,
            stepName,
            message,
            isIndeterminate
        }
    };
}

// 1. Check for data grid action intent (resolve/submit via natural language)
async function check_data_grid_action_intent(state: typeof DataEntryRouterAnnotation.State): Promise<Partial<typeof DataEntryRouterAnnotation.State>> {
	const query = state.messages.filter(m => m.role === 'user').pop()?.content || '';
	console.log('🔍 Data Entry Router: Checking for data grid action intent:', query);

	// Update progress
	updateProgress(1, 'Analyzing Request', 'Checking for data grid actions...', false);
	state.orchestrator?.addProgressMessage('Checking for data grid actions...');

	// Check if there are recent data_grid messages in the conversation (for action intents)
	const hasDataGridContext = state.orchestrator?.currentUIState?.conversation?.some((msg: any) =>
		msg.type === 'data_grid' && msg.timestamp > Date.now() - 300000 // Within last 5 minutes
	);

	// For follow-ups, use the dataEntryType context passed from the router agent
	const isFollowUp = !!state.dataEntryType;
	const followUpType = state.dataEntryType;

	console.log(`🔍 Data Entry Router: Follow-up context - isFollowUp: ${isFollowUp}, type: ${followUpType}`);

	// Check for data grid action intent (if we have data grid context or follow-up context)
	if (hasDataGridContext || isFollowUp) {
		const actionIntent = await detectDataGridActionIntent(query, state.orchestrator, followUpType);
		console.log(`🔍 Detected data grid action intent: ${actionIntent}`);

		if (actionIntent === 'resolve_all') {
			console.log('🔄 Triggering resolve all action via orchestrator');
			// Trigger resolve all action
			state.orchestrator.handleDataGridInteraction({
				type: 'resolve_all',
				data: {}
			});

			return {
				finalResult: {
					success: true,
					message: 'Started resolving all pending items. The resolution process will continue in the background.',
					action: 'resolve_all_triggered'
				}
			};
		} else if (actionIntent === 'submit_data') {
			console.log('📤 Triggering submit data action via orchestrator');
			// Trigger submit action
			state.orchestrator.handleDataGridInteraction({
				type: 'confirm_submit',
				data: {}
			});

			return {
				finalResult: {
					success: true,
					message: 'Data submission initiated. Processing and validating data for DHIS2 submission.',
					action: 'submit_triggered'
				}
			};
		} else if (actionIntent === 'confirm_save') {
			console.log('✅ Triggering tracker confirm save action via orchestrator');
			// Trigger tracker save action
			state.orchestrator.handleDataGridInteraction({
				type: 'confirm_save',
				data: {}
			});

			return {
				finalResult: {
					success: true,
					message: 'Tracker data save initiated. Processing and validating tracker data for DHIS2 submission.',
					action: 'tracker_save_triggered'
				}
			};
		} else if (actionIntent === 'cancel_save') {
			console.log('❌ Triggering tracker cancel save action via orchestrator');
			// Trigger tracker cancel action
			state.orchestrator.handleDataGridInteraction({
				type: 'cancel_save',
				data: {}
			});

			return {
				finalResult: {
					success: true,
					message: 'Tracker data save cancelled.',
					action: 'tracker_cancel_triggered'
				}
			};
		} else if (actionIntent === 'update_data_value') {
			console.log('🔄 Detected data value update request, routing to aggregate agent');
			// For data value updates, set the flag and route to aggregate agent
			return {
				dataEntryCategory: 'aggregate_data',
				originalQuery: query,
				isDataValueUpdate: true
			};
		}
	}

	// No action intent detected
	if (isFollowUp && followUpType) {
		// For follow-ups with known type, set category directly to bypass LLM classification
		const category = followUpType === 'aggregate' ? 'aggregate_data' : 'tracker';
		console.log(`🔍 Follow-up detected with type ${followUpType}, setting category to ${category} and routing directly to agent`);
		return {
			dataEntryCategory: category,
			originalQuery: query
		};
	}

	// Continue to normal classification for non-follow-up requests
	console.log('🔍 No data grid action intent detected, proceeding to category classification');
	return {};
}

// 2. LLM-based data entry category classification
async function classify_data_entry_intent(state: typeof DataEntryRouterAnnotation.State): Promise<Partial<typeof DataEntryRouterAnnotation.State>> {
	const query = state.messages.filter(m => m.role === 'user').pop()?.content || '';

	// If category was already set (e.g., for follow-ups), use it
	if (state.dataEntryCategory && state.dataEntryCategory !== 'unknown') {
		console.log(`🤖 Data Entry Router: Category already set to "${state.dataEntryCategory}", skipping LLM classification`);
		return {
			originalQuery: query
		};
	}

	console.log('🤖 Data Entry Router: Classifying data entry category for query:', query);

	// Update progress
	updateProgress(2, 'Classifying Category', 'Determining data entry type...', false);
	state.orchestrator?.addProgressMessage('Determining data entry type...');

	const category = await classifyDataEntryCategoryLLM(query);
	console.log(`🔄 Data Entry Router: Classified as "${category}"`);

	return {
		dataEntryCategory: category,
		originalQuery: query
	};
}

// 2. Handle unclear classification - return user selection prompt
async function handle_unclear_classification(state: typeof DataEntryRouterAnnotation.State): Promise<Partial<typeof DataEntryRouterAnnotation.State>> {
	console.log('❓ Data Entry Router: Classification unclear, prompting user selection');

	const selectionPrompt = {
		type: 'user_selection_required',
		message: 'Please select the data entry category that best matches your request:',
		options: [
			{ value: 'aggregate_data', label: 'Aggregate Data - Create data elements, categories, data sets for periodic reporting' },
			{ value: 'events', label: 'Events - Set up event programs and record individual events' },
			{ value: 'tracker', label: 'Tracker - Manage tracked entities, enrollments, and longitudinal tracking' }
		],
		originalQuery: state.originalQuery
	};

	return {
		finalResult: selectionPrompt
	};
}

// 3. Route to aggregate data agent
async function invoke_aggregate_agent(state: typeof DataEntryRouterAnnotation.State): Promise<Partial<typeof DataEntryRouterAnnotation.State>> {
	console.log('📊 Data Entry Router: Routing to aggregate data agent');

	// Update progress
	updateProgress(3, 'Processing Aggregate Data', 'Delegating to aggregate data agent...', false);
	state.orchestrator?.addProgressMessage('Delegating to aggregate data agent...');

	try {
		// Use the StateGraph-based agent for data import workflows
		const aggregateDataAgent = createAggregateDataAgent(state.orchestrator);
		const result = await aggregateDataAgent.invoke({
			messages: state.messages
		});

		const responseContent = result.messages[result.messages.length - 1].content as string;
		let parsedResponse;
		try {
			parsedResponse = JSON.parse(responseContent);
		} catch (parseError) {
			parsedResponse = { rawResponse: responseContent };
		}

		// Note: Conversation context is handled by the StateGraph agent
		// The data grid rendering is handled by the orchestrator

		return {
			finalResult: parsedResponse
		};
	} catch (error) {
		console.error('📊 Data Entry Router: Aggregate agent error:', error);
		const errorResponse = {
			success: false,
			error: `Aggregate data entry failed: ${error.message}`
		};
		addConversation(state.originalQuery, 'data_entry_aggregate', errorResponse);

		return { finalResult: errorResponse };
	}
}

// 4. Route to events agent
async function invoke_events_agent(state: typeof DataEntryRouterAnnotation.State): Promise<Partial<typeof DataEntryRouterAnnotation.State>> {
	console.log('📅 Data Entry Router: Routing to events agent');

	try {
		const result = await eventsAgent.invoke({
			messages: [{ role: 'user', content: state.originalQuery }]
		});

		const responseContent = result.messages[result.messages.length - 1].content as string;
		let parsedResponse;
		try {
			parsedResponse = JSON.parse(responseContent);
		} catch (parseError) {
			parsedResponse = { rawResponse: responseContent };
		}

		// Add to conversation context
		if (parsedResponse.success !== false) {
			const dataContext = createMutationDataContext('creation', parsedResponse);
			addConversation(state.originalQuery, 'data_entry_events', parsedResponse, dataContext);
		} else {
			addConversation(state.originalQuery, 'data_entry_events', parsedResponse);
		}

		return {
			finalResult: parsedResponse
		};
	} catch (error) {
		console.error('📅 Data Entry Router: Events agent error:', error);
		const errorResponse = {
			success: false,
			error: `Events data entry failed: ${error.message}`
		};
		addConversation(state.originalQuery, 'data_entry_events', errorResponse);

		return { finalResult: errorResponse };
	}
}

// 5. Route to tracker agent
async function invoke_tracker_agent(state: typeof DataEntryRouterAnnotation.State): Promise<Partial<typeof DataEntryRouterAnnotation.State>> {
	console.log('👤 Data Entry Router: Routing to tracker StateGraph agent');

	try {
		// Use the StateGraph-based agent for document processing workflows
		const trackerDataAgent = createTrackerDataAgent(state.orchestrator);
		const result = await trackerDataAgent.invoke({
			messages: state.messages
		});

		const responseContent = result.messages[result.messages.length - 1].content as string;
		let parsedResponse;
		try {
			parsedResponse = JSON.parse(responseContent);
		} catch (parseError) {
			parsedResponse = { rawResponse: responseContent };
		}

		// Note: Conversation context is handled by the StateGraph agent
		// The tracker data processing UI is handled by the orchestrator

		return {
			finalResult: parsedResponse
		};
	} catch (error) {
		console.error('👤 Data Entry Router: Tracker StateGraph agent error:', error);
		const errorResponse = {
			success: false,
			error: `Tracker data entry failed: ${error.message}`
		};
		addConversation(state.originalQuery, 'data_entry_tracker', errorResponse);

		return { finalResult: errorResponse };
	}
}

// Detect data grid action intent (resolve/submit via natural language)
async function detectDataGridActionIntent(query: string, orchestrator: any, followUpType?: 'tracker' | 'aggregate' | null): Promise<'resolve_all' | 'submit_data' | 'confirm_save' | 'cancel_save' | 'update_data_value' | null> {
	try {
		console.log('🔍 Data Entry Router: Detecting data grid action intent for:', query);

		// Use follow-up context if available (passed from router agent), otherwise infer from conversation
		let isTrackerReviewGrid = false;
		let isAggregateDataGrid = false;

		if (followUpType) {
			// Use context passed from router agent (for follow-ups)
			isTrackerReviewGrid = followUpType === 'tracker';
			isAggregateDataGrid = followUpType === 'aggregate';
			console.log(`🔍 Data Entry Router: Using follow-up context - Tracker: ${isTrackerReviewGrid}, Aggregate: ${isAggregateDataGrid}`);
		} else {
			// Fallback: infer from conversation history
			if (orchestrator?.currentUIState?.conversation) {
				// Find the most recent data_grid message
				const recentDataGrid = orchestrator.currentUIState.conversation
					.filter((msg: any) => msg.type === 'data_grid')
					.pop(); // Get the last one

				if (recentDataGrid?.data) {
					isTrackerReviewGrid = recentDataGrid.data.reviewMode === true;
					isAggregateDataGrid = !isTrackerReviewGrid && recentDataGrid.data.headers && Array.isArray(recentDataGrid.data.headers);
				}
			}
			console.log(`🔍 Data Entry Router: Inferred grid context - Tracker Review: ${isTrackerReviewGrid}, Aggregate: ${isAggregateDataGrid}`);
		}

		const detectionPrompt = `
Analyze this user query in the context of a DHIS2 data entry interface${isTrackerReviewGrid ? ' showing tracker data for review' : isAggregateDataGrid ? ' with aggregate data that may have unresolved items' : ''}.

Determine if the user is asking to perform one of these specific actions:
${isTrackerReviewGrid ? `
- confirm_save: User wants to save/confirm the reviewed tracker data to DHIS2
- cancel_save: User wants to cancel the tracker data save operation` : `
- resolve_all: User wants to resolve/fix/complete all pending unresolved items
- submit_data: User wants to submit/send the data to DHIS2
- update_data_value: User wants to update/modify a specific data value`}

${isTrackerReviewGrid ? `
Examples of confirm_save:
- "save the data"
- "confirm save"
- "save to DHIS2"
- "submit the tracker data"
- "confirm the patient data"

Examples of cancel_save:
- "cancel"
- "cancel save"
- "don't save"
- "abort"` : `
Examples of resolve_all:
- "resolve all the pending items"
- "fix the unresolved entries"
- "complete the missing data"
- "resolve all issues"
- "finish resolving"

Examples of submit_data:
- "submit the data"
- "send to DHIS2"
- "confirm submission"
- "upload the data"
- "submit now"

Examples of update_data_value:
- "update the first value to 10"
- "change row 3 to 25"
- "modify the second entry"
- "correct the last data point"
- "fix value 5 to 8"
- "update first row to 15"`}

Return ONLY one of these values: ${isTrackerReviewGrid ? '"confirm_save", "cancel_save"' : '"resolve_all", "submit_data", "update_data_value"'}, or null if neither matches.

Query: "${query}"

Response:`;

		const result = await model.invoke([new HumanMessage(detectionPrompt)]);
		const intent = (result.content as string).trim();

		// Validate the response based on context
		const validIntents = isTrackerReviewGrid
			? ['confirm_save', 'cancel_save']
			: ['resolve_all', 'submit_data', 'update_data_value'];

		if (validIntents.includes(intent)) {
			return intent as any;
		}

		return null;
	} catch (error) {
		console.error('🔍 Data Entry Router: Action intent detection failed:', error);
		return null;
	}
}

// LLM-based data entry category classification
async function classifyDataEntryCategoryLLM(query: string): Promise<string> {
	try {
		console.log('🤖 Data Entry Router: Using LLM to classify data entry category for:', query);

		const classificationPrompt = `
Classify this DHIS2 data entry query into ONE category. If the query is not clearly about data entry or you cannot determine the category with confidence, respond with "unclear".

Categories:
- aggregate_data: Creating/modifying aggregate data structures (data elements, categories, data sets, indicators, reporting forms, validation rules for periodic reporting)
- events: Setting up event programs (WITHOUT_REGISTRATION) or recording individual events without entity tracking
- tracker: Setting up tracker programs (WITH_REGISTRATION), managing tracked entities, enrollments, or entity relationships
- unclear: Query is ambiguous, not clearly data entry, or doesn't fit the above categories

Query: "${query}"

Category:`;

		const result = await model.invoke([new HumanMessage(classificationPrompt)]);
		const category = (result.content as string).trim().toLowerCase();

		// Validate the response is one of our expected categories
		const validCategories = ['aggregate_data', 'events', 'tracker', 'unclear'];
		if (validCategories.includes(category)) {
			return category;
		}

		// If LLM returned something unexpected, treat as unclear
		console.log('🤖 Data Entry Router: Unexpected LLM response, treating as unclear');
		return 'unclear';
	} catch (error) {
		console.error('🤖 Data Entry Router: LLM classification failed, defaulting to unclear');
		return 'unclear';
	}
}

// Create and compile StateGraph workflow
const dataEntryRouterWorkflow = new StateGraph(DataEntryRouterAnnotation);

// Add nodes
dataEntryRouterWorkflow.addNode('check_data_grid_action_intent', check_data_grid_action_intent);
dataEntryRouterWorkflow.addNode('classify_data_entry_intent', classify_data_entry_intent);
dataEntryRouterWorkflow.addNode('handle_unclear_classification', handle_unclear_classification);
dataEntryRouterWorkflow.addNode('invoke_aggregate_agent', invoke_aggregate_agent);
dataEntryRouterWorkflow.addNode('invoke_events_agent', invoke_events_agent);
dataEntryRouterWorkflow.addNode('invoke_tracker_agent', invoke_tracker_agent);

// Add edges
// @ts-ignore
dataEntryRouterWorkflow.addEdge(START, 'check_data_grid_action_intent');

// Conditional routing from data grid action check
// @ts-ignore
dataEntryRouterWorkflow.addConditionalEdges('check_data_grid_action_intent', (state) => {
	if (state.finalResult) return END; // Action was handled, end workflow
	return 'classify_data_entry_intent'; // No action detected, continue to classification
});

// Conditional routing based on data entry category
// @ts-ignore
dataEntryRouterWorkflow.addConditionalEdges('classify_data_entry_intent', (state) => {
	if (state.dataEntryCategory === 'aggregate_data') return 'invoke_aggregate_agent';
	if (state.dataEntryCategory === 'events') return 'invoke_events_agent';
	if (state.dataEntryCategory === 'tracker') return 'invoke_tracker_agent';
	if (state.dataEntryCategory === 'unclear') return 'handle_unclear_classification';
	return 'handle_unclear_classification';
});

// Terminal nodes don't need additional edges
// @ts-ignore
dataEntryRouterWorkflow.addEdge('invoke_aggregate_agent', END);
// @ts-ignore
dataEntryRouterWorkflow.addEdge('invoke_events_agent', END);
// @ts-ignore
dataEntryRouterWorkflow.addEdge('invoke_tracker_agent', END);
// @ts-ignore
dataEntryRouterWorkflow.addEdge('handle_unclear_classification', END);

// Compile the workflow
const dataEntryRouterStateGraph = dataEntryRouterWorkflow.compile();

// StateGraph-based data entry router agent
export function createRoutedDataEntryAgent(orchestrator: any) {
	return {
		invoke: async (input: any) => {
			console.log('🔄 Data Entry Router: Processing data entry query');

			const initialState: Partial<typeof DataEntryRouterAnnotation.State> = {
				messages: input.messages || [],
				dataEntryType: input.dataEntryType || null, // Use data entry type context from router
				isDataValueUpdate: input.isDataValueUpdate || false,
				orchestrator: orchestrator,
				dataEntryCategory: 'unknown',
				originalQuery: '',
			};

			// Execute StateGraph workflow
			const result = await dataEntryRouterStateGraph.invoke(initialState);

			// Format for compatibility with existing interface
			return {
				messages: [{
					content: JSON.stringify(result.finalResult),
					name: undefined,
					additional_kwargs: {},
					response_metadata: {}
				}]
			};
		}
	};
}
