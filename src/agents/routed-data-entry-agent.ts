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
	console.log('🔍 Data Entry Router: state.messages:', state.messages);
	console.log('🔍 Data Entry Router: state.messages length:', state.messages?.length || 0);

	const userMessages = state.messages?.filter(m => m.role === 'user') || [];
	console.log('🔍 Data Entry Router: user messages:', userMessages);

	const query = userMessages.pop()?.content || '';
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
	console.log(`🔍 Data Entry Router: Data grid context - hasDataGridContext: ${hasDataGridContext}`);

	// Check for data grid action intent ONLY if we have an actual data grid present
	// (don't check action intent just because it's a follow-up)
	if (hasDataGridContext) {
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
			console.log('🔄 Detected data value update request, handling directly via orchestrator');

			// Parse the update request to identify what to update
			const updateDetails = await parseDataValueUpdateRequest(query, state.orchestrator);
			if (updateDetails) {
				console.log('🔄 Parsed update details:', updateDetails);

				// Call orchestrator's data grid interaction to update the value
				const updateResult = await state.orchestrator.handleDataValueUpdate(updateDetails);
				if (updateResult.success) {
					return {
						finalResult: {
							success: true,
							message: updateResult.message,
							action: 'data_value_updated'
						}
					};
				} else {
					return {
						finalResult: {
							success: false,
							error: updateResult.error || 'Failed to update data value',
							action: 'data_value_update_failed'
						}
					};
				}
			} else {
				return {
					finalResult: {
						success: false,
						error: 'Could not parse the data value update request. Please specify which row and what value to update.',
						action: 'data_value_update_parse_failed'
					}
				};
			}
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

// 2. Handle unclear classification - generate LLM-powered user selection prompt
async function handle_unclear_classification(state: typeof DataEntryRouterAnnotation.State): Promise<Partial<typeof DataEntryRouterAnnotation.State>> {
	console.log('❓ Data Entry Router: Classification unclear, generating LLM-powered user selection prompt');

	const query = state.originalQuery || state.messages.filter(m => m.role === 'user').pop()?.content || '';

	// Generate LLM-powered selection options for unclear data entry classification
	const selectionOptions = await generateLLMDataEntrySelectionOptions(query);

	const selectionPrompt = {
		type: 'user_selection_required',
		message: 'Please select the data entry category that best matches your request:',
		options: selectionOptions,
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
			messages: state.messages,
			dataEntryType: state.dataEntryType // Pass follow-up context
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
Analyze this data entry grid action query in any language (English, French, Spanish, Arabic, Portuguese).

Context: ${isTrackerReviewGrid ? 'Tracker data review interface' : isAggregateDataGrid ? 'Aggregate data entry with unresolved items' : 'Data entry interface'}

ACTIONS:
${isTrackerReviewGrid ? `
- confirm_save: Save/confirm tracker data
- cancel_save: Cancel tracker data save` : `
- resolve_all: Resolve/fix all pending items
- submit_data: Submit/send data to DHIS2
- update_data_value: Update/modify specific data value`}

EXAMPLES:
${isTrackerReviewGrid ? `
- "save the data" → confirm_save
- "cancel" → cancel_save` : `
- "resolve all" → resolve_all
- "submit the data" → submit_data
- "update first value to 10" → update_data_value`}

Query: "${query}"

Return: ${isTrackerReviewGrid ? '"confirm_save", "cancel_save"' : '"resolve_all", "submit_data", "update_data_value"'} or null`;

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

// Efficient LLM-based data entry category classification
async function classifyDataEntryCategoryLLM(query: string): Promise<string> {
	try {
		console.log('🤖 Data Entry Router: Using efficient multilingual LLM classification for:', query);

		const classificationPrompt = `
Classify this DHIS2 data entry query into ONE category. You understand queries in multiple languages (English, French, Spanish, Arabic, Portuguese).

CATEGORIES:
- aggregate_data: Periodic/facility-level data entry (monthly reports, quarterly summaries)
- events: Individual event recording (cases, surveys, outbreaks)
- tracker: Individual record management (patients, beneficiaries, longitudinal tracking)
- unclear: Not clearly data entry or ambiguous

EXAMPLES:
- "enter monthly facility data" → aggregate_data
- "record malaria case" → events
- "enter patient information" → tracker
- "submit quarterly report" → aggregate_data

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

// Generate LLM-powered data entry selection options for unclear classification
async function generateLLMDataEntrySelectionOptions(query: string): Promise<any[]> {
	try {
		console.log('🤖 Data Entry Router: Generating efficient LLM-powered selection options for:', query);

		const selectionPrompt = `
Generate 3 user-friendly selection options for this ambiguous data entry query.

You understand: English, French, Spanish, Arabic, Portuguese.

Query: "${query}"

Categories:
- aggregate_data: Periodic/facility-level data entry (monthly reports, quarterly summaries)
- events: Individual event recording (cases, surveys, outbreaks)
- tracker: Individual record management (patients, beneficiaries, longitudinal tracking)

Return JSON:
{
  "options": [
    {"value": "aggregate_data", "label": "Description..."},
    {"value": "events", "label": "Description..."},
    {"value": "tracker", "label": "Description..."}
  ]
}

Examples:
- "enter monthly data" → "Aggregate Data - Enter periodic facility statistics"
- "record malaria case" → "Events - Record individual disease cases"
- "enter patient info" → "Tracker - Manage patient records"
`;

		const result = await model.invoke([new HumanMessage(selectionPrompt)]);
		const response = JSON.parse(result.content as string);

		console.log('🤖 Data Entry Router: LLM generated selection options:', response.options);

		return response.options || [];

	} catch (error) {
		console.error('🤖 Data Entry Router: Failed to generate LLM selection options:', error);

		// Fallback to enhanced keyword-based options
		console.log('🔄 Data Entry Router: Falling back to enhanced keyword-based selection options');

		return generateFallbackDataEntrySelectionOptions(query);
	}
}

// Parse data value update request to extract update details
async function parseDataValueUpdateRequest(query: string, orchestrator: any): Promise<{
	rowIndex: number;
	colIndex: number;
	newValue: string;
	reasoning: string;
} | null> {
	try {
		console.log('🔍 Parsing data value update request:', query);

		// Get the current data grid to understand the structure
		const currentDataGrid = orchestrator?.currentUIState?.conversation
			?.filter((msg: any) => msg.type === 'data_grid')
			?.pop();

		if (!currentDataGrid?.data) {
			console.warn('No current data grid found for update parsing');
			return null;
		}

		const { headers, rows } = currentDataGrid.data;
		const valueColumnIndex = headers?.findIndex((h: string) => h.toLowerCase().includes('value'));

		if (valueColumnIndex === undefined || valueColumnIndex < 0) {
			console.warn('No value column found in data grid');
			return null;
		}

		// Use LLM to parse the update request
		const parsePrompt = `
You are parsing a data value update request for a DHIS2 data grid.

DATA GRID STRUCTURE:
- Headers: [${headers?.join(', ')}]
- Number of rows: ${rows?.length || 0}
- Value column index: ${valueColumnIndex}

USER REQUEST: "${query}"

EXTRACT:
1. Which row to update (0-based index, or "first", "second", "last", etc.)
2. What the new value should be
3. Reasoning for your interpretation

Return JSON:
{
  "rowIndex": number,
  "newValue": string,
  "reasoning": "explanation"
}

Examples:
- "update the first row to 10" → {"rowIndex": 0, "newValue": "10", "reasoning": "User specified first row"}
- "change second entry to 25" → {"rowIndex": 1, "newValue": "25", "reasoning": "User said second entry"}
- "set last value to 8" → {"rowIndex": ${rows?.length ? rows.length - 1 : 0}, "newValue": "8", "reasoning": "User said last value"}
`;

		const result = await model.invoke([new HumanMessage(parsePrompt)]);
		const parsed = JSON.parse(result.content as string);

		if (parsed.rowIndex !== undefined && parsed.newValue !== undefined) {
			return {
				rowIndex: parsed.rowIndex,
				colIndex: valueColumnIndex,
				newValue: parsed.newValue,
				reasoning: parsed.reasoning || 'Parsed from user request'
			};
		}

		return null;
	} catch (error) {
		console.error('Failed to parse data value update request:', error);
		return null;
	}
}

// Enhanced fallback selection options when LLM fails
function generateFallbackDataEntrySelectionOptions(query: string): any[] {
	const queryLower = query.toLowerCase();

	const options = [
		{
			value: 'aggregate_data',
			label: 'Aggregate Data - Enter periodic reporting data like monthly facility statistics and quarterly summaries'
		},
		{
			value: 'events',
			label: 'Events - Record individual events like disease cases, surveys, or one-time data collection'
		},
		{
			value: 'tracker',
			label: 'Tracker - Manage individual records like patient tracking, beneficiary follow-up, or longitudinal studies'
		}
	];

	// Prioritize options based on query keywords
	if (queryLower.includes('patient') || queryLower.includes('individual') || queryLower.includes('follow') || queryLower.includes('track')) {
		// Move tracker to front
		return [
			options[2], // tracker
			options[0], // aggregate
			options[1]  // events
		];
	} else if (queryLower.includes('event') || queryLower.includes('case') || queryLower.includes('outbreak') || queryLower.includes('survey')) {
		// Move events to front
		return [
			options[1], // events
			options[0], // aggregate
			options[2]  // tracker
		];
	}

	// Default order
	return options;
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
			console.log('🔄 Data Entry Router: Processing data entry query', input);

			// Check if a specific agent was selected for direct routing
			const selectedAgent = input.selectedAgent;
			let initialCategory = 'unknown';

			if (selectedAgent === 'aggregate-data-entry') {
				initialCategory = 'aggregate_data';
				console.log('🎯 Data Entry Router: Direct routing to aggregate data agent');
			} else if (selectedAgent === 'tracker-data-entry') {
				initialCategory = 'tracker';
				console.log('🎯 Data Entry Router: Direct routing to tracker data agent');
			} else if (selectedAgent === 'event-data-entry') {
				initialCategory = 'events';
				console.log('🎯 Data Entry Router: Direct routing to events agent');
			}

			// Extract messages from input (handle both direct and nested structures)
			const messages = input.messages || input.input?.messages || [];
			const userMessages = messages?.filter(m => m.role === 'user') || [];
			const lastUserMessage = userMessages[userMessages.length - 1];
			const originalQuery = lastUserMessage?.content || '';
			console.log('Original Query: ', originalQuery);

			const initialState: Partial<typeof DataEntryRouterAnnotation.State> = {
				messages: messages || [],
				dataEntryType: input.dataEntryType || null, // Use data entry type context from router
				isDataValueUpdate: input.isDataValueUpdate || false,
				orchestrator: orchestrator,
				dataEntryCategory: initialCategory,
				originalQuery: originalQuery,
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
