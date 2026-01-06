import { Annotation, END, START, StateGraph } from '@langchain/langgraph/web';
import { AzureChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { aggregateDataAgent } from './aggregate-data-agent';
import { eventsAgent } from './events-agent';
import { trackerAgent } from './tracker-agent';
import { addConversation, createMutationDataContext } from '../utils/conversation-context';

// Define Router State - tracks workflow context and orchestrator reference
const DataEntryRouterAnnotation = Annotation.Root({
	// Workflow context
	dataEntryCategory: Annotation<string>({
		reducer: (left, right) => right || left,
		default: () => 'unknown'
	}),
	originalQuery: Annotation<string>({
		reducer: (left, right) => right || left,
		default: () => ''
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
const model = new AzureChatOpenAI({
	model: (import.meta as any).env.DHIS2_OPENAI_MODEL,
	temperature: 0,
	maxTokens: undefined,
	azureOpenAIApiKey: (import.meta as any).env.DHIS2_AZURE_KEY,
	azureOpenAIEndpoint: (import.meta as any).env.DHIS2_AZURE_ENDPOINT,
	azureOpenAIApiDeploymentName: (import.meta as any).env.DHIS2_AZURE_API_DEPLOYMENT_NAME,
	azureOpenAIApiVersion: (import.meta as any).env.DHIS2_AZURE_API_VERSION,
});

// StateGraph Workflow Nodes

// 1. LLM-based data entry category classification
async function classify_data_entry_intent(state: typeof DataEntryRouterAnnotation.State): Promise<Partial<typeof DataEntryRouterAnnotation.State>> {
	const query = state.messages.filter(m => m.role === 'user').pop()?.content || '';
	console.log('🤖 Data Entry Router: Classifying data entry category for query:', query);

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

	try {
		const result = await aggregateDataAgent.invoke({
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
			addConversation(state.originalQuery, 'data_entry_aggregate', parsedResponse, dataContext);
		} else {
			addConversation(state.originalQuery, 'data_entry_aggregate', parsedResponse);
		}

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
	console.log('👤 Data Entry Router: Routing to tracker agent');

	try {
		const result = await trackerAgent.invoke({
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
			addConversation(state.originalQuery, 'data_entry_tracker', parsedResponse, dataContext);
		} else {
			addConversation(state.originalQuery, 'data_entry_tracker', parsedResponse);
		}

		return {
			finalResult: parsedResponse
		};
	} catch (error) {
		console.error('👤 Data Entry Router: Tracker agent error:', error);
		const errorResponse = {
			success: false,
			error: `Tracker data entry failed: ${error.message}`
		};
		addConversation(state.originalQuery, 'data_entry_tracker', errorResponse);

		return { finalResult: errorResponse };
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
dataEntryRouterWorkflow.addNode('classify_data_entry_intent', classify_data_entry_intent);
dataEntryRouterWorkflow.addNode('handle_unclear_classification', handle_unclear_classification);
dataEntryRouterWorkflow.addNode('invoke_aggregate_agent', invoke_aggregate_agent);
dataEntryRouterWorkflow.addNode('invoke_events_agent', invoke_events_agent);
dataEntryRouterWorkflow.addNode('invoke_tracker_agent', invoke_tracker_agent);

// Add edges
// @ts-ignore
dataEntryRouterWorkflow.addEdge(START, 'classify_data_entry_intent');

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
