import { Annotation, END, START, StateGraph } from '@langchain/langgraph/web';
import { ChatModels } from '../utils/chat-model-factory';
import { HumanMessage } from '@langchain/core/messages';
import { searchAgent } from './search-agent';
import { crudAgent } from './crud-agent';
import { analyticsGraphAgent } from './analytics-graph-agent';
import { createRoutedDataEntryAgent } from './routed-data-entry-agent';
import { addConversation, createMutationDataContext, createSearchDataContext, findCurrentSessionContext } from '../utils/conversation-context';
import { clarificationService, Interpretation } from '../utils/clarification-service';
import { llmClassificationService } from '../utils/llm-classification-service';

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

	// Data entry context for follow-ups
	dataEntryType: Annotation<'tracker' | 'aggregate' | null>({
		reducer: (left, right) => right || left,
		default: () => null
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
	// Find the text message (not file content) for classification
	// Prioritize messages that don't start with "File:" and have actual text content
	const userMessages = state.messages.filter(m => m.role === 'user');
	const textMessage = userMessages.find(m =>
		m.content && typeof m.content === 'string' &&
		!m.content.startsWith('File:') &&
		m.content.trim().length > 0
	);

	const rawQuery = textMessage?.content || userMessages[userMessages.length - 1]?.content || '';
	// Strip file content from query to prevent sending binary data to LLM
	const query = stripFileContent(rawQuery);
	console.log('🤖 Router: Classifying workflow type for query (text message prioritized, file content stripped):', query);

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

	// No clarification needed - FIRST: Classify intent properly (new task vs follow-up)
	const fullConversationHistory = state.orchestrator?.currentUIState?.conversation || state.messages;
	// Use session-aware context for better intent classification
	const sessionContext = findCurrentSessionContext(query);
	const recentSessionMessages = sessionContext.recentConversations.map(entry => ({
		role: entry.agent === 'router' ? 'user' : 'assistant',
		content: entry.query,
		type: entry.agent === 'router' ? 'query' : 'response'
	}));
	const intentClassification = await classifyIntentType(query, recentSessionMessages);
	console.log(`🔍 Router: Intent classification: ${intentClassification.type} (${intentClassification.confidence})`, intentClassification);

	// SECOND: Handle based on intent type
	if (intentClassification.type === 'new_task') {
		// This is a new task - classify which workflow type
		const workflowType = await detectWorkflowTypeLLM(query, fullConversationHistory);
		console.log(`🔄 Router: New task classified as "${workflowType}"`);

		return {
			workflowType,
			originalQuery: query
		};
	} else if (intentClassification.type === 'follow_up') {
		// This is a follow-up - determine which agent to route to
		const followUpInfo = await determineFollowUpAgent(query, recentSessionMessages, intentClassification);
		console.log(`🔄 Router: Follow-up detected, routing to ${followUpInfo.targetAgent}${followUpInfo.dataEntryType ? ` (${followUpInfo.dataEntryType})` : ''}`);

		return {
			workflowType: followUpInfo.targetAgent,
			originalQuery: query,
			// Store data entry type context for the data entry router
			dataEntryType: followUpInfo.dataEntryType
		};
	} else if (intentClassification.type === 'ambiguous') {
		// Intent is ambiguous - provide user selection options
		console.log('🤔 Router: Intent is ambiguous, providing user selection options');

		const selectionOptions = [
			{ name: "Search existing metadata", id: "direct_search", type: "search" },
			{ name: "Create/update metadata", id: "crud", type: "crud" },
			{ name: "Data analysis and visualization", id: "analytics_routing", type: "analytics" },
			{ name: "Data entry and collection", id: "data_entry", type: "data_entry" }
		];

		return {
			workflowType: 'user_selection_needed',
			originalQuery: query,
			finalResult: {
				type: 'user_selection_needed',
				message: 'I need to clarify what you want to do. Please select the most appropriate option:',
				selectionOptions: selectionOptions,
				reason: intentClassification.reasoning
			}
		};
	} else {
		// Fallback to normal classification
		const workflowType = await detectWorkflowTypeLLM(query, fullConversationHistory);
		console.log(`🔄 Router: Fallback classification as "${workflowType}"`);

		return {
			workflowType,
			originalQuery: query
		};
	}
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
			messages: [{ role: 'user', content: state.originalQuery }],
			orchestrator: state.orchestrator // Pass orchestrator for UI feedback
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
			messages: fullConversationHistory,
			dataEntryType: state.dataEntryType // Pass data entry type context
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

// Generate multiple intent interpretations for clarification service using LLM classification
async function generateIntentInterpretations(query: string): Promise<Interpretation[]> {
	try {
		console.log('🤖 Router: Generating multiple interpretations for:', query);

		// Use the centralized LLM classification service
		const intentClassification = await llmClassificationService.classifyIntent(query);

		// Convert to clarification service format
		const interpretations: Interpretation[] = [
			{
				intent: intentClassification.intent as any, // Map to clarification service format
				confidence: intentClassification.confidence,
				reasoning: intentClassification.reasoning,
				domain: 'general' as const
			}
		];

		// Add alternatives if available
		if (intentClassification.alternatives && intentClassification.alternatives.length > 0) {
			interpretations.push(...intentClassification.alternatives.map(alt => ({
				intent: alt.intent as any,
				confidence: alt.confidence,
				reasoning: `Alternative interpretation: ${alt.intent}`,
				domain: 'general' as const
			})));
		}

		// Sort by confidence descending
		return interpretations.sort((a, b) => b.confidence - a.confidence);

	} catch (error) {
		console.error('🤖 Router: Failed to generate interpretations:', error);

		// Fallback to simple keyword-based interpretations (minimal fallback)
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

// LLM-based intent type classification (new task vs follow-up vs ambiguous)
async function classifyIntentType(query: string, conversationHistory: any[]): Promise<{
	type: 'new_task' | 'follow_up' | 'ambiguous';
	confidence: number;
	reasoning: string;
}> {
	try {
		console.log('🔍 Router: Classifying intent type for:', query);

		// Extract recent conversation context (last 5 messages for better context)
		const recentMessages = conversationHistory
			.filter(msg => msg.role !== 'user' || msg.content !== query) // Exclude current query
			.slice(-5) // Last 5 messages for context
			.map(msg => {
				let content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
				// Include data grid information if present
				if (msg.type === 'data_grid' && msg.data) {
					content += ` [DataGrid: reviewMode=${msg.data.reviewMode}, hasHeaders=${!!msg.data.headers}]`;
				}
				return `${msg.role}: ${content}`;
			})
			.join('\n');

		const intentClassificationPrompt = `
Analyze this user query and recent conversation context to determine the intent type.

Recent conversation context:
${recentMessages || 'No recent context'}

Current user query: "${query}"

Classify the intent type as ONE of the following:

1. "new_task": This is a completely new task or request that doesn't reference previous work
   - Examples: "Create tracked entity attributes", "Find indicators", "Show me data for 2024"

2. "follow_up": This is a follow-up to a previous operation or request
   - Examples: "Update the first value", "Submit the data", "Continue with the selected items"

3. "ambiguous": The intent is unclear and could be interpreted multiple ways
   - Examples: "Do this", "Handle it", "Process the data"

Return JSON with:
{
  "type": "new_task|follow_up|ambiguous",
  "confidence": 0-1,
  "reasoning": "brief explanation"
}

Consider:
- Does the query reference previous work or operations?
- Are there pronouns like "this", "that", "it" without clear antecedents?
- Are there ordinals like "first", "last", "previous"?
- Is the query too vague or generic?
- Does it clearly specify a new operation?

Examples:
- "Create the following tracked entity attributes" → {"type": "new_task", "confidence": 0.9, "reasoning": "Clear request to create new metadata"}
- "Submit the patient data" → {"type": "follow_up", "confidence": 0.8, "reasoning": "References previous data processing operation"}
- "Do this" → {"type": "ambiguous", "confidence": 0.9, "reasoning": "Vague reference without clear context"}
`;

		const result = await model.invoke([new HumanMessage(intentClassificationPrompt)]);
		const intentInfo = JSON.parse(result.content as string);

		console.log('🔍 Router: Intent classification result:', intentInfo);

		return {
			type: intentInfo.type || 'new_task',
			confidence: intentInfo.confidence || 0.5,
			reasoning: intentInfo.reasoning || 'No reasoning provided'
		};
	} catch (error) {
		console.error('🔍 Router: Intent classification failed:', error);
		return {
			type: 'ambiguous',
			confidence: 0.3,
			reasoning: `Classification failed: ${error.message}`
		};
	}
}

// LLM-based follow-up detection
async function detectFollowUpIntent(query: string, conversationHistory: any[]): Promise<{
	isFollowUp: boolean;
	targetAgent?: string;
	dataEntryType?: 'tracker' | 'aggregate'; // Add context about data entry type
	reasoning: string;
}> {
	try {
		console.log('🔍 Router: Detecting follow-up intent for:', query);

		// Extract recent conversation context (last 5 messages for better context)
		const recentMessages = conversationHistory
			.filter(msg => msg.role !== 'user' || msg.content !== query) // Exclude current query
			.slice(-5) // Last 5 messages for context
			.map(msg => {
				let content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
				// Include data grid information if present
				if (msg.type === 'data_grid' && msg.data) {
					content += ` [DataGrid: reviewMode=${msg.data.reviewMode}, hasHeaders=${!!msg.data.headers}]`;
				}
				return `${msg.role}: ${content}`;
			})
			.join('\n');

		// Check for recent data grid context to determine data entry type
		let recentDataEntryType: 'tracker' | 'aggregate' | null = null;
		const recentDataGrid = conversationHistory
			.filter(msg => msg.type === 'data_grid')
			.slice(-1)[0]; // Most recent data grid

		if (recentDataGrid?.data) {
			if (recentDataGrid.data.reviewMode === true) {
				recentDataEntryType = 'tracker';
			} else if (recentDataGrid.data.headers && Array.isArray(recentDataGrid.data.headers)) {
				recentDataEntryType = 'aggregate';
			}
		}

		const followUpPrompt = `
Analyze this user query and recent conversation context to determine if it is a follow-up question/request.

Recent conversation context:
${recentMessages || 'No recent context'}

Current user query: "${query}"

Determine if this query is:
1. A FOLLOW-UP: References previous work, uses ordinals ("first", "last"), or continues a previous operation
2. A NEW QUERY: Starts a new topic or explicitly mentions a different agent/domain

Available agents: direct_search, analytics_routing, crud, data_entry

If this is a follow-up to data_entry, also determine the data entry type:
- tracker: If context shows tracker data review, patient data, or "save to DHIS2" operations
- aggregate: If context shows data grid with headers like dataElement, orgUnit, period, etc.

Return JSON with:
{
  "isFollowUp": boolean,
  "targetAgent": "agent_name" (only if isFollowUp is true),
  "dataEntryType": "tracker|aggregate" (only if targetAgent is "data_entry"),
  "reasoning": "brief explanation including data entry type detection"
}

Examples:
- "Submit the patient data" after tracker review → {"isFollowUp": true, "targetAgent": "data_entry", "dataEntryType": "tracker", "reasoning": "Follow-up to tracker data review operation"}
- "Submit the data" after aggregate data entry → {"isFollowUp": true, "targetAgent": "data_entry", "dataEntryType": "aggregate", "reasoning": "Follow-up to aggregate data submission"}
- "Show me indicators" (new query) → {"isFollowUp": false, "reasoning": "New search request"}
`;

		const result = await model.invoke([new HumanMessage(followUpPrompt)]);
		const followUpInfo = JSON.parse(result.content as string);

		console.log('🔍 Router: Follow-up detection result:', followUpInfo);

		// If LLM didn't detect dataEntryType but we found it from context, use that
		if (followUpInfo.targetAgent === 'data_entry' && !followUpInfo.dataEntryType && recentDataEntryType) {
			followUpInfo.dataEntryType = recentDataEntryType;
			followUpInfo.reasoning += ` (inferred ${recentDataEntryType} from recent data grid context)`;
		}

		return {
			isFollowUp: followUpInfo.isFollowUp || false,
			targetAgent: followUpInfo.targetAgent,
			dataEntryType: followUpInfo.dataEntryType,
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

// Determine which agent to route to for follow-up queries
async function determineFollowUpAgent(query: string, conversationHistory: any[], intentClassification: any): Promise<{
	targetAgent: string;
	dataEntryType?: 'tracker' | 'aggregate';
	reasoning: string;
}> {
	try {
		console.log('🔄 Router: Determining follow-up agent for:', query);

		// Extract recent conversation context (last 5 messages for better context)
		const recentMessages = conversationHistory
			.filter(msg => msg.role !== 'user' || msg.content !== query) // Exclude current query
			.slice(-5) // Last 5 messages for context
			.map(msg => {
				let content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
				// Include data grid information if present
				if (msg.type === 'data_grid' && msg.data) {
					content += ` [DataGrid: reviewMode=${msg.data.reviewMode}, hasHeaders=${!!msg.data.headers}]`;
				}
				return `${msg.role}: ${content}`;
			})
			.join('\n');

		// Check for recent data grid context to determine data entry type
		let recentDataEntryType: 'tracker' | 'aggregate' | null = null;
		const recentDataGrid = conversationHistory
			.filter(msg => msg.type === 'data_grid')
			.slice(-1)[0]; // Most recent data grid

		if (recentDataGrid?.data) {
			if (recentDataGrid.data.reviewMode === true) {
				recentDataEntryType = 'tracker';
			} else if (recentDataGrid.data.headers && Array.isArray(recentDataGrid.data.headers)) {
				recentDataEntryType = 'aggregate';
			}
		}

		const agentDeterminationPrompt = `
Analyze this user query and recent conversation context to determine which agent should handle this follow-up.

Recent conversation context:
${recentMessages || 'No recent context'}

Current user query: "${query}"

Intent classification: ${intentClassification.type} (confidence: ${intentClassification.confidence})

Available agents:
- direct_search: For finding existing metadata
- analytics_routing: For data analysis and visualization
- crud: For creating/modifying/deleting metadata
- data_entry: For data entry operations and data value updates

Determine the most appropriate agent based on:
1. The nature of the current query
2. The recent conversation context
3. The intent classification

Return JSON with:
{
  "targetAgent": "agent_name",
  "dataEntryType": "tracker|aggregate" (only if targetAgent is "data_entry"),
  "reasoning": "brief explanation"
}

Examples:
- Query: "Submit the patient data" after tracker review → {"targetAgent": "data_entry", "dataEntryType": "tracker", "reasoning": "Follow-up to tracker data review operation"}
- Query: "Create the selected indicators" after search → {"targetAgent": "crud", "reasoning": "Follow-up to search operation, creating new metadata"}
- Query: "Analyze the data" after data entry → {"targetAgent": "analytics_routing", "reasoning": "Follow-up to data entry, performing analysis"}
`;

		const result = await model.invoke([new HumanMessage(agentDeterminationPrompt)]);
		const agentInfo = JSON.parse(result.content as string);

		console.log('🔄 Router: Agent determination result:', agentInfo);

		// If LLM didn't detect dataEntryType but we found it from context, use that
		if (agentInfo.targetAgent === 'data_entry' && !agentInfo.dataEntryType && recentDataEntryType) {
			agentInfo.dataEntryType = recentDataEntryType;
			agentInfo.reasoning += ` (inferred ${recentDataEntryType} from recent data grid context)`;
		}

		return {
			targetAgent: agentInfo.targetAgent || 'direct_search',
			dataEntryType: agentInfo.dataEntryType,
			reasoning: agentInfo.reasoning || 'No reasoning provided'
		};
	} catch (error) {
		console.error('🔄 Router: Agent determination failed:', error);
		return {
			targetAgent: 'direct_search',
			reasoning: `Agent determination failed: ${error.message}`
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
- crud: User wants to CREATE NEW metadata objects or MODIFY/DELETE existing ones (data elements, indicators, org units, categories, data sets, programs, validation rules, etc.)
- data_entry: User wants to ENTER DATA VALUES into existing data collection structures, or configure data collection for ALREADY EXISTING metadata structures

Key distinctions:
- CRUD: Focus on creating/modifying the metadata DEFINITIONS themselves
- data_entry: Focus on the process of data collection and value entry into EXISTING structures

Examples:
- "Create a new data set called Monthly Report" → crud (creating new metadata)
- "Create a data element for HIV testing" → crud (creating new metadata)
- "Enter data for the HIV dataset" → data_entry (entering values into existing structure)
- "Submit monthly numbers to the existing report" → data_entry (entering values)
- "Set up data collection for the new program" → crud (creating metadata structures)
- "Configure the reporting form for data entry" → data_entry (configuring existing structures)

Recent conversation context:
${recentMessages || 'No recent context'}

Current query: "${query}"

Consider context clues like:
- "Update the first value" likely refers to data values from a recent data submission
- References to "previous", "last", "that data" often indicate data value operations
- Data submissions are often followed by value corrections

Category:`;

		const result = await model.invoke([new HumanMessage(classificationPrompt)]);

		// Extract just the category from the response, ignoring reasoning
		const responseText = (result.content as string).trim();
		const responseLines = responseText.split('\n');
		const categoryLine = responseLines[0]; // First line should be the category
		const category = categoryLine.replace(/\*\*/g, '').trim().toLowerCase(); // Remove markdown formatting

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
				messages: input.input?.messages || input.messages || [],
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
