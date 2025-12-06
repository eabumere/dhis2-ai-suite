import { Annotation, END, START, StateGraph } from '@langchain/langgraph/web';
import { AzureChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';
import { searchAgent } from './search-agent';
import { crudAgent } from './crud-agent';
import { analyticsGraphAgent } from './analytics-graph-agent';
import { addConversation, createMutationDataContext, createSearchDataContext } from '../utils/conversation-context';

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

// 1. LLM-based workflow classification
async function classify_intent(state: typeof RouterAnnotation.State): Promise<Partial<typeof RouterAnnotation.State>> {
	const query = state.messages.filter(m => m.role === 'user').pop()?.content || '';
	console.log('🤖 Router: Classifying workflow type for query:', query);

	const workflowType = await detectWorkflowTypeLLM(query);
	console.log(`🔄 Router: Classified as "${workflowType}"`);

	return {
		workflowType,
		originalQuery: query
	};
}

// 2. Direct search workflow - comprehensive search across all metadata types
async function invoke_search_agent(state: typeof RouterAnnotation.State): Promise<Partial<typeof RouterAnnotation.State>> {
	console.log('🔍 Router: Invoking comprehensive search across all metadata types');

	try {
		// Import search tools directly for comprehensive parallel searching
		const {
			searchDhis2DataElements,
			searchDhis2OrganisationUnits,
			searchDhis2Categories,
			searchDhis2CategoryCombos,
			searchDhis2DataSets,
			searchDhis2Programs,
			searchDhis2Indicators,
			searchDhis2CategoryOptions,
			searchDhis2OrganisationUnitGroups,
			searchDhis2Validations,
			searchDhis2OptionSets,
			searchDhis2Visualizations,
			searchDhis2Dashboards
		} = await import('../utils/tools/metadata');

		// Comprehensive search across core metadata types - run in parallel
		const searchPromises = [
			['dataElements', searchDhis2DataElements.invoke({ query: state.originalQuery, limit: 10 })],
			['indicators', searchDhis2Indicators.invoke({ query: state.originalQuery, limit: 10 })],
			['organisationUnits', searchDhis2OrganisationUnits.invoke({ query: state.originalQuery, limit: 10 })],
			['dataSets', searchDhis2DataSets.invoke({ query: state.originalQuery, limit: 10 })],
			['programs', searchDhis2Programs.invoke({ query: state.originalQuery, limit: 10 })],
			['categories', searchDhis2Categories.invoke({ query: state.originalQuery, limit: 5 })],
			['categoryCombos', searchDhis2CategoryCombos.invoke({ query: state.originalQuery, limit: 5 })],
			['optionSets', searchDhis2OptionSets.invoke({ query: state.originalQuery, limit: 5 })],
			['validationRules', searchDhis2Validations.invoke({ query: state.originalQuery, limit: 5 })],
			['visualizations', searchDhis2Visualizations.invoke({ query: state.originalQuery, limit: 5 })],
			['dashboards', searchDhis2Dashboards.invoke({ query: state.originalQuery, limit: 5 })]
		];

		// Execute all searches in parallel
		const searchResults = await Promise.allSettled(
			searchPromises.map(([type, promise]) => promise.then(result => ({
				type,
				result: JSON.parse(result as string)
			})).catch(error => ({
				type,
				error: error.message,
				result: []
			})))
		);

		// Aggregate results by type
		const aggregatedResults: any = {};
		let totalCount = 0;

		searchResults.forEach((result, index) => {
			const [type] = searchPromises[index];
			if (result.status === 'fulfilled') {
				const data = result.value.result;
				if (data && Array.isArray(data) && data.length > 0) {
					aggregatedResults[type] = data.slice(0, 10); // Limit to 10 items per type
					totalCount += data.length;
				}
			}
		});

		console.log(`🔍 Router: Found ${Object.keys(aggregatedResults).length} metadata types with ${totalCount} total results`);

		// Create unified response format
		const parsedResponse = {
			success: true,
			searchCount: Object.keys(aggregatedResults).length,
			totalResults: totalCount,
			query: state.originalQuery,
			...aggregatedResults
		};

		// Add to conversation context
		if (parsedResponse.success) {
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

		return {
			finalResult: {
				success: true,
				message: 'Search results rendered',
				rendered: true,
				data: parsedResponse
			}
		};
	} catch (error) {
		console.error('🔍 Router: Comprehensive search error:', error);
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

Query: "${query}"

Category:`;

		const result = await model.invoke([new HumanMessage(classificationPrompt)]);
		const category = (result.content as string).trim().toLowerCase();

		return category.includes('search') ? 'direct_search' :
			category.includes('analytics') ? 'analytics_routing' :
				category.includes('crud') ? 'crud' : 'unknown';
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
routerWorkflow.addNode('invoke_search_agent', invoke_search_agent);
routerWorkflow.addNode('invoke_analytics_agent', invoke_analytics_agent);
routerWorkflow.addNode('invoke_crud_agent', invoke_crud_agent);

// Add edges
// @ts-ignore
routerWorkflow.addEdge(START, 'classify_intent');

// Conditional routing based on workflow type
// @ts-ignore
routerWorkflow.addConditionalEdges('classify_intent', (state) => {
	if (state.workflowType === 'direct_search') return 'invoke_search_agent';
	if (state.workflowType === 'analytics_routing') return 'invoke_analytics_agent';
	if (state.workflowType === 'crud') return 'invoke_crud_agent';
	return END;
});

// Terminal nodes don't need additional edges
// @ts-ignore
routerWorkflow.addEdge('invoke_search_agent', END);
// @ts-ignore
routerWorkflow.addEdge('invoke_analytics_agent', END);
// @ts-ignore
routerWorkflow.addEdge('invoke_crud_agent', END);

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
