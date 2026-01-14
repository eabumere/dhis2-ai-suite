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

/**
 * Strip file content from query text to prevent sending binary data to LLM
 * This prevents security issues where sensitive file data gets sent to AI models
 */
function stripFileContent(query: string): string {
	if (!query || typeof query !== 'string') {
		return query;
	}

	// Remove file content sections that follow the pattern:
	// File: filename.ext
	// Content:
	// [binary/file data]
	const fileContentPattern = /File:\s*[^\n]+\nContent:\n[\s\S]*$/;

	return query.replace(fileContentPattern, '').trim();
}

// Initialize the ChatOpenAI model with Azure configuration
const model = ChatModels.createAgentModel();

// StateGraph Workflow Nodes

// 1. LLM-based workflow classification with clarification
async function classify_intent(state: typeof RouterAnnotation.State): Promise<Partial<typeof RouterAnnotation.State>> {
	const rawQuery = state.messages.filter(m => m.role === 'user').pop()?.content || '';
	// Strip file content from query to prevent sending binary data to LLM
	const query = stripFileContent(rawQuery);
	console.log('🤖 Router: Classifying workflow type for query (file content stripped):', query);

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

	// No clarification needed - check for follow-up first, then classify
	const fullConversationHistory = state.orchestrator?.currentUIState?.conversation || state.messages;

	// First check if this is a follow-up to a previous agent
	const followUpInfo = await detectFollowUpIntent(query, fullConversationHistory);
	console.log(`🔍 Router: Follow-up check: ${followUpInfo.isFollowUp ? 'YES' : 'NO'}`, followUpInfo);

	if (followUpInfo.isFollowUp && followUpInfo.targetAgent) {
		console.log(`🔄 Router: Detected follow-up to ${followUpInfo.targetAgent}, routing directly`);
		return {
			workflowType: followUpInfo.targetAgent,
			originalQuery: query
		};
	}

	// Not a follow-up, proceed with normal classification
	const workflowType = await detectWorkflowTypeLLM(query, fullConversationHistory);
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
		// Pass full conversation history for context-aware data entry routing
		const fullConversationHistory = state.orchestrator?.currentUIState?.conversation || state.messages;
		const dataEntryAgent = createRoutedDataEntryAgent(state.orchestrator);
		const result = await dataEntryAgent.invoke({
			messages: fullConversationHistory
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



// 7. Handle clarification requests
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
- data_entry: Setting up data collection structures or updating data values

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

// LLM-based follow-up detection
async function detectFollowUpIntent(query: string, conversationHistory: any[]): Promise<{
	isFollowUp: boolean;
	targetAgent?: string;
	reasoning: string;
}> {
	try {
		console.log('🔍 Router: Detecting follow-up intent for:', query);

		// Extract recent conversation context (last 3 messages for follow-up detection)
		const recentMessages = conversationHistory
			.filter(msg => msg.role !== 'user' || msg.content !== query) // Exclude current query
			.slice(-3) // Last 3 messages for context
			.map(msg => `${msg.role}: ${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}`)
			.join('\n');

		const followUpPrompt = `
Analyze this user query and recent conversation context to determine if it is a follow-up question/request.

Recent conversation context:
${recentMessages || 'No recent context'}

Current user query: "${query}"

Determine if this query is:
1. A FOLLOW-UP: References previous work, uses ordinals ("first", "last"), or continues a previous operation
2. A NEW QUERY: Starts a new topic or explicitly mentions a different agent/domain

Available agents: direct_search, analytics_routing, crud, data_entry

If this is a follow-up, specify which agent it should route to based on the recent conversation context.

Return JSON with:
{
  "isFollowUp": boolean,
  "targetAgent": "agent_name" (only if isFollowUp is true),
  "reasoning": "brief explanation"
}

Examples:
- "Update the first value to 10" after data submission → {"isFollowUp": true, "targetAgent": "data_entry", "reasoning": "Refers to previously submitted data values"}
- "Show me indicators" (new query) → {"isFollowUp": false, "reasoning": "New search request"}
`;

		const result = await model.invoke([new HumanMessage(followUpPrompt)]);
		const followUpInfo = JSON.parse(result.content as string);

		console.log('🔍 Router: Follow-up detection result:', followUpInfo);

		return {
			isFollowUp: followUpInfo.isFollowUp || false,
			targetAgent: followUpInfo.targetAgent,
			reasoning: followUpInfo.reasoning || 'No reasoning provided'
		};
	} catch (error) {
		console.error('🔍 Router: Follow-up detection failed:', error);
		return {
			isFollowUp: false,
			reasoning: `Detection failed: ${error.message}`
		};
	}
}



// LLM-based workflow type classification with conversation context
async function detectWorkflowTypeLLM(query: string, conversationHistory: any[] = []): Promise<string> {
	try {
		console.log('🤖 Router: Using LLM to classify workflow type for:', query);

		// Extract recent conversation context (last 5 messages, excluding current query)
		const recentMessages = conversationHistory
			.filter(msg => msg.role !== 'user' || msg.content !== query) // Exclude current query
			.slice(-5) // Last 5 messages
			.map(msg => `${msg.role}: ${msg.content}`)
			.join('\n');

		const classificationPrompt = `
Classify this DHIS2 query into ONE category. Consider the recent conversation context to understand references to previous operations.

Categories:
- direct_search: User wants to find/browse/search existing metadata (indicators, dataElements, orgUnits, etc.)
- analytics_routing: User wants analytics/data analysis/calculations/visualizations/reports
- crud: User wants to create/modify/delete metadata objects (data elements, indicators, org units, etc.)
- data_entry: User wants to create or configure data entry structures (programs, data sets, data elements for data collection), or update previously submitted data values

Recent conversation context:
${recentMessages || 'No recent context'}

Current query: "${query}"

Consider context clues like:
- "Update the first value" likely refers to data values from a recent data submission
- References to "previous", "last", "that data" often indicate data value operations
- Data submissions are often followed by value corrections

Category:`;

		const result = await model.invoke([new HumanMessage(classificationPrompt)]);
		const category = (result.content as string).trim().toLowerCase();

		console.log('🤖 Router: LLM classified as:', category);

		return category.includes('search') ? 'direct_search' :
			category.includes('analytics') ? 'analytics_routing' :
				category.includes('crud') ? 'crud' :
					category.includes('data_entry') ? 'data_entry' : 'unknown';
	} catch (error) {
		console.error('🤖 Router: LLM classification failed, using fallback');
		// Enhanced keyword fallback with context awareness
		const queryLower = query.toLowerCase();
		const isSearch = ['find', 'search', 'show', 'list', 'get', 'lookup'].some(k => queryLower.includes(k));
		const isAnalytics = ['analyze', 'calculate', 'sum', 'total', 'trend'].some(k => queryLower.includes(k));
		const isCRUD = ['create', 'add', 'update', 'delete', 'modify'].some(k => queryLower.includes(k));
		const isDataValueUpdate = ['change value', 'update value', 'correct value', 'fix value'].some(k => queryLower.includes(k)) ||
			(queryLower.includes('update') && (queryLower.includes('value') || queryLower.includes('data')));

		// Check for contextual clues in conversation history
		const hasRecentDataSubmission = conversationHistory.some(msg =>
			msg.role === 'assistant' && msg.content &&
			(typeof msg.content === 'string' ? msg.content.includes('submitted successfully') :
			 msg.content.message && msg.content.message.includes('submitted successfully'))
		);

		// Route data value updates to data_entry when context shows recent data work
		if (hasRecentDataSubmission && (queryLower.includes('update') || queryLower.includes('change') || isDataValueUpdate)) {
			return 'data_entry';
		}

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
