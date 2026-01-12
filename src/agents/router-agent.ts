import { Annotation, END, START, StateGraph } from '@langchain/langgraph/web';
import { ChatModels } from '../utils/chat-model-factory';
import { HumanMessage } from '@langchain/core/messages';
import { searchAgent } from './search-agent';
import { crudAgent } from './crud-agent';
import { analyticsGraphAgent } from './analytics-graph-agent';
import { createRoutedDataEntryAgent } from './routed-data-entry-agent';
import { addConversation, createMutationDataContext, createSearchDataContext } from '../utils/conversation-context';
import { clarificationService, Interpretation } from '../utils/clarification-service';

// Define Router State - tracks workflow context and orchestrator reference
const RouterAnnotation = Annotation.Root({
	// Workflow context
	workflowType: Annotation<string>({
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
const model = ChatModels.createAgentModel();

// StateGraph Workflow Nodes

// 1. LLM-based workflow classification with clarification
async function classify_intent(state: typeof RouterAnnotation.State): Promise<Partial<typeof RouterAnnotation.State>> {
	const query = state.messages.filter(m => m.role === 'user').pop()?.content || '';
	console.log('🤖 Router: Classifying workflow type for query:', query);

	// Generate multiple interpretations for clarification service
	const interpretations = await generateIntentInterpretations(query);
	console.log('🤖 Router: Generated interpretations:', interpretations.map(i => `${i.intent} (${i.confidence})`));

	// Check if clarification is needed using the global clarification service
	const clarificationDecision = await clarificationService.shouldSeekClarification(
		query,
		interpretations,
		{
			domain: 'general',
			attemptCount: 0,
			conversationHistory: state.messages
		}
	);

	console.log('🤖 Router: Clarification decision:', clarificationDecision);

	if (clarificationDecision.seek) {
		console.log('🤔 Router: Seeking clarification for ambiguous query');

		// Generate clarification request
		const clarificationRequest = await clarificationService.generateClarificationRequest(
			query,
			interpretations,
			{
				domain: 'general',
				attemptCount: 0,
				conversationHistory: state.messages
			}
		);

		// Return clarification result instead of proceeding with routing
		return {
			workflowType: 'clarification_needed',
			originalQuery: query,
			finalResult: {
				type: 'clarification_needed',
				clarification: clarificationRequest,
				reason: clarificationDecision.reason
			}
		};
	}

	// No clarification needed - proceed with normal classification
	const workflowType = await detectWorkflowTypeLLM(query);
	console.log(`🔄 Router: Proceeding with "${workflowType}"`);

	return {
		workflowType,
		originalQuery: query
	};
}

// 2. Direct search workflow - LLM-driven tool selection
async function invoke_search_agent(state: typeof RouterAnnotation.State): Promise<Partial<typeof RouterAnnotation.State>> {
	console.log('🔍 Router: Invoking LLM-driven search agent');

	try {
		// Invoke search agent - let LLM intelligently choose which tools to use
		const result = await searchAgent.invoke({
			messages: [{ role: 'user', content: state.originalQuery }]
		});

		const responseContent = result.messages[result.messages.length - 1].content as string;

		// Parse response
		let parsedResponse;
		try {
			parsedResponse = JSON.parse(responseContent);
		} catch (parseError) {
			parsedResponse = { rawResponse: responseContent };
		}

		// Add to conversation context
		if (parsedResponse.success !== false) {
			const dataContext = createSearchDataContext(parsedResponse);
			addConversation(state.originalQuery, 'search', parsedResponse, dataContext);
		} else {
			addConversation(state.originalQuery, 'search', parsedResponse);
		}

		// For direct searches, render immediately through orchestrator
		if (state.orchestrator) {
			console.log('🔍 Router: Calling orchestrator.requestSearchRender()');
			await state.orchestrator.requestSearchRender(parsedResponse, state.originalQuery);
		}

		// Return the search results directly without wrapping - let orchestrator handle rendering
		return {
			finalResult: parsedResponse  // Pass search results directly
		};
	} catch (error) {
		console.error('🔍 Router: Search agent error:', error);
		const errorResponse = {
			success: false,
			error: `Search failed: ${error.message}`
		};
		addConversation(state.originalQuery, 'search', errorResponse);

		return { finalResult: errorResponse };
	}
}

// 3. Analytics workflow - invoke state graph agent
async function invoke_analytics_agent(state: typeof RouterAnnotation.State): Promise<Partial<typeof RouterAnnotation.State>> {
	console.log('📊 Router: Invoking analytics StateGraph directly');

	try {
		const result = await analyticsGraphAgent.invoke({
			messages: [{ role: 'user', content: state.originalQuery }],
			query: state.originalQuery,
			step: 'classify',
			orchestrator: state.orchestrator
		});

		// Add to conversation context
		addConversation(state.originalQuery, 'analytics', result.finalResult);

		return { finalResult: result.finalResult };
	} catch (error) {
		console.error('📊 Router: Analytics error:', error);
		const errorResponse = {
			success: false,
			error: `Analytics failed: ${error.message}`
		};
		addConversation(state.originalQuery, 'analytics', errorResponse);

		return { finalResult: errorResponse };
	}
}

// 4. CRUD workflow - invoke CRUD agent
async function invoke_crud_agent(state: typeof RouterAnnotation.State): Promise<Partial<typeof RouterAnnotation.State>> {
	console.log('🔧 Router: Invoking CRUD agent directly');

	try {
		const result = await crudAgent.invoke({
			messages: [{ role: 'user', content: state.originalQuery }]
		});

		const responseContent = result.messages[result.messages.length - 1].content as string;

		// Parse response
		let parsedResponse: { success?: any; rawResponse?: string; };
		try {
			parsedResponse = JSON.parse(responseContent);
		} catch (parseError) {
			parsedResponse = { rawResponse: responseContent };
		}

		// Add to conversation context
		if (parsedResponse.success !== false) {
			const operationType: 'creation' | 'update' =
				state.originalQuery.toLowerCase().includes('create') || state.originalQuery.toLowerCase().includes('add')
					? 'creation' : 'update';

			const dataContext = createMutationDataContext(operationType, parsedResponse);
			addConversation(state.originalQuery, 'crud', parsedResponse, dataContext);
		} else {
			addConversation(state.originalQuery, 'crud', parsedResponse);
		}

		return { finalResult: parsedResponse };
	} catch (error) {
		console.error('🔧 Router: CRUD error:', error);
		const errorResponse = {
			success: false,
			error: `CRUD operation failed: ${error.message}`
		};
		addConversation(state.originalQuery, 'crud', errorResponse);

		return { finalResult: errorResponse };
	}
}

// 5. Data entry workflow - invoke routed data entry agent
async function invoke_data_entry_router(state: typeof RouterAnnotation.State): Promise<Partial<typeof RouterAnnotation.State>> {
	console.log('📝 Router: Invoking data entry router');

	try {
		const dataEntryAgent = createRoutedDataEntryAgent(state.orchestrator);
		const result = await dataEntryAgent.invoke({
			messages: state.messages
		});

		const responseContent = result.messages[result.messages.length - 1].content as string;

		// Parse response - data entry router returns the final result directly
		let parsedResponse;
		try {
			parsedResponse = JSON.parse(responseContent);
		} catch (parseError) {
			parsedResponse = { rawResponse: responseContent };
		}

		// Note: Conversation context is already handled by the data entry router

		// For data entry workflows, render the result through the orchestrator
		// This ensures the data grid with action buttons gets added to the conversation
		if (state.orchestrator && parsedResponse) {
			console.log('📊 Router: Calling orchestrator.requestDataEntryRender()');
			await state.orchestrator.requestDataEntryRender(parsedResponse, state.originalQuery);
		}

		return { finalResult: parsedResponse };
	} catch (error) {
		console.error('📝 Router: Data entry router error:', error);
		const errorResponse = {
			success: false,
			error: `Data entry routing failed: ${error.message}`
		};
		addConversation(state.originalQuery, 'data_entry', errorResponse);

		return { finalResult: errorResponse };
	}
}

// 6. Handle clarification requests
async function handle_clarification(state: typeof RouterAnnotation.State): Promise<Partial<typeof RouterAnnotation.State>> {
	console.log('🤔 Router: Handling clarification request');

	// The clarification result is already prepared in finalResult from classify_intent
	// Just return it as-is - the orchestrator will handle displaying the clarification UI
	return {
		finalResult: state.finalResult
	};
}

// Generate multiple intent interpretations for clarification service
async function generateIntentInterpretations(query: string): Promise<Interpretation[]> {
	try {
		console.log('🤖 Router: Generating multiple interpretations for:', query);

		const interpretationPrompt = `
Analyze this DHIS2 query and provide up to 4 possible interpretations with confidence scores.

Query: "${query}"

Return a JSON array of interpretations, each with:
- intent: The workflow type (direct_search, analytics_routing, crud, data_entry)
- confidence: Number between 0-1 indicating certainty
- reasoning: Brief explanation of why this interpretation fits

Focus on DHIS2-specific workflows:
- direct_search: Finding/showing existing metadata
- analytics_routing: Analysis, calculations, visualizations
- crud: Creating/modifying/deleting metadata objects
- data_entry: Setting up data collection structures

Example output format:
[
  {
    "intent": "analytics_routing",
    "confidence": 0.8,
    "reasoning": "Query contains analysis keywords and visualization requests"
  }
]`;

		const result = await model.invoke([new HumanMessage(interpretationPrompt)]);
		const responseContent = (result.content as string).trim();

		const interpretations = JSON.parse(responseContent) as Interpretation[];

		// Validate and normalize interpretations
		return interpretations
			.filter(i => i.intent && typeof i.confidence === 'number')
			.map(i => ({
				...i,
				confidence: Math.max(0, Math.min(1, i.confidence)), // Clamp to 0-1
				domain: 'general' as const
			}))
			.sort((a, b) => b.confidence - a.confidence); // Sort by confidence descending

	} catch (error) {
		console.error('🤖 Router: Failed to generate interpretations:', error);

		// Fallback to simple keyword-based interpretations
		const queryLower = query.toLowerCase();
		const interpretations: Interpretation[] = [];

		// Check for analytics patterns
		if (['analyze', 'calculate', 'sum', 'total', 'trend', 'chart', 'graph'].some(k => queryLower.includes(k))) {
			interpretations.push({
				intent: 'analytics_routing',
				confidence: 0.7,
				reasoning: 'Contains analytics keywords',
				domain: 'general'
			});
		}

		// Check for search patterns
		if (['find', 'search', 'show', 'list', 'get', 'lookup'].some(k => queryLower.includes(k))) {
			interpretations.push({
				intent: 'direct_search',
				confidence: 0.7,
				reasoning: 'Contains search keywords',
				domain: 'general'
			});
		}

		// Check for CRUD patterns
		if (['create', 'add', 'update', 'delete', 'modify', 'change'].some(k => queryLower.includes(k))) {
			interpretations.push({
				intent: 'crud',
				confidence: 0.7,
				reasoning: 'Contains CRUD keywords',
				domain: 'general'
			});
		}

		// Check for data entry patterns
		if (['enter', 'input', 'submit', 'record', 'data entry', 'program', 'data set'].some(k => queryLower.includes(k))) {
			interpretations.push({
				intent: 'data_entry',
				confidence: 0.6,
				reasoning: 'Contains data entry keywords',
				domain: 'general'
			});
		}

		// If no specific interpretations, add general ones with lower confidence
		if (interpretations.length === 0) {
			interpretations.push(
				{
					intent: 'direct_search',
					confidence: 0.4,
					reasoning: 'Default search interpretation',
					domain: 'general'
				},
				{
					intent: 'analytics_routing',
					confidence: 0.3,
					reasoning: 'Possible analytics interpretation',
					domain: 'general'
				}
			);
		}

		return interpretations;
	}
}

// LLM-based workflow type classification
async function detectWorkflowTypeLLM(query: string): Promise<string> {
	try {
		console.log('🤖 Router: Using LLM to classify workflow type for:', query);

		const classificationPrompt = `
Classify this DHIS2 query into ONE category. Answer with ONLY the category name:

Categories:
- direct_search: User wants to find/browse/search existing metadata (indicators, dataElements, orgUnits, etc.)
- analytics_routing: User wants analytics/data analysis/calculations/visualizations/reports
- crud: User wants to create/modify/delete metadata objects
- data_entry: User wants to create or configure data entry structures (programs, data sets, data elements for data collection)

Query: "${query}"

Category:`;

		const result = await model.invoke([new HumanMessage(classificationPrompt)]);
		const category = (result.content as string).trim().toLowerCase();

		return category.includes('search') ? 'direct_search' :
			category.includes('analytics') ? 'analytics_routing' :
				category.includes('crud') ? 'crud' :
					category.includes('data_entry') ? 'data_entry' : 'unknown';
	} catch (error) {
		console.error('🤖 Router: LLM classification failed, using fallback');
		// Simple keyword fallback
		const queryLower = query.toLowerCase();
		const isSearch = ['find', 'search', 'show', 'list', 'get', 'lookup'].some(k => queryLower.includes(k));
		const isAnalytics = ['analyze', 'calculate', 'sum', 'total', 'trend'].some(k => queryLower.includes(k));
		const isCRUD = ['create', 'add', 'update', 'delete', 'modify'].some(k => queryLower.includes(k));

		if (isAnalytics) return 'analytics_routing';
		if (isCRUD) return 'crud';
		if (isSearch) return 'direct_search';
		return 'unknown';
	}
}

// Create and compile StateGraph workflow
const routerWorkflow = new StateGraph(RouterAnnotation);

// Add nodes
routerWorkflow.addNode('classify_intent', classify_intent);
routerWorkflow.addNode('handle_clarification', handle_clarification);
routerWorkflow.addNode('invoke_search_agent', invoke_search_agent);
routerWorkflow.addNode('invoke_analytics_agent', invoke_analytics_agent);
routerWorkflow.addNode('invoke_crud_agent', invoke_crud_agent);
routerWorkflow.addNode('invoke_data_entry_router', invoke_data_entry_router);

// Add edges
// @ts-ignore
routerWorkflow.addEdge(START, 'classify_intent');

	// Conditional routing based on workflow type
	// @ts-ignore
	routerWorkflow.addConditionalEdges('classify_intent', (state) => {
		if (state.workflowType === 'clarification_needed') return 'handle_clarification';
		if (state.workflowType === 'direct_search') return 'invoke_search_agent';
		if (state.workflowType === 'analytics_routing') return 'invoke_analytics_agent';
		if (state.workflowType === 'crud') return 'invoke_crud_agent';
		if (state.workflowType === 'data_entry') return 'invoke_data_entry_router';
		return END;
	});

// Terminal nodes don't need additional edges
// @ts-ignore
routerWorkflow.addEdge('handle_clarification', END);
// @ts-ignore
routerWorkflow.addEdge('invoke_search_agent', END);
// @ts-ignore
routerWorkflow.addEdge('invoke_analytics_agent', END);
// @ts-ignore
routerWorkflow.addEdge('invoke_crud_agent', END);
// @ts-ignore
routerWorkflow.addEdge('invoke_data_entry_router', END);

// Compile the workflow
const routerStateGraph = routerWorkflow.compile();

// StateGraph-based router agent (no LLM routing)
export function createContextRouterAgent(orchestrator: any) {
	return {
		invoke: async (input: any) => {
			console.log('🔄 Router StateGraph: Processing query');

			const initialState: Partial<typeof RouterAnnotation.State> = {
				messages: input.messages || [],
				orchestrator: orchestrator,
				workflowType: 'unknown',
				originalQuery: '',
			};

			// Execute StateGraph workflow
			const result = await routerStateGraph.invoke(initialState);

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
