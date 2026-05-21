import { Annotation, END, START, StateGraph } from '@langchain/langgraph/web';
import { ChatModels } from '../utils/chat-model-factory';
import { createAgent } from './create-agent';
import { createDeleteGraphAgent } from './delete-agent';

// Define CRUD State - tracks operation type and workflow context
const CrudAnnotation = Annotation.Root({
	// Workflow context
	operationType: Annotation<'create' | 'update' | 'delete' | 'unknown'>({
		reducer: (left, right) => right || left,
		default: () => 'unknown'
	}),
	originalQuery: Annotation<string>({
		reducer: (left, right) => right || left,
		default: () => ''
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

// Initialize the ChatOpenAI model with Azure configuration and retry logic for rate limiting
const model = ChatModels.createAgentModelWithRetry();

// StateGraph Workflow Nodes

// 1. Classify operation type (Create/Update/Delete)
async function classify_operation(state: typeof CrudAnnotation.State): Promise<Partial<typeof CrudAnnotation.State>> {
	console.log('🔄 CRUD: Classifying operation type for query:', state.originalQuery);

	// Build conversation context from messages (excluding the current query)
	const conversationContext = state.messages
		.filter((msg: any) => msg.content !== state.originalQuery)
		.map((msg: any) => `${msg.role}: ${msg.content}`)
		.join('\n');

	const classificationPrompt = `
Analyze this DHIS2 CRUD request and classify it as CREATE, UPDATE, or DELETE operation.
Use the full conversation history to resolve any references or pronouns in the user's query.

IMPORTANT: This system supports MULTIPLE LANGUAGES. Users may query in English, French, Spanish, Arabic, Portuguese, or any other language. Focus on INTENT and MEANING, not specific keywords.

CLASSIFICATION RULES (Language-Agnostic):
- CREATE: Actions that CREATE NEW resources, entities, or metadata to the system
- UPDATE: Actions that UPDATE, MODIFY, CHANGE, ADD TO, REMOVE FROM, or ALTER existing resources
- DELETE: Actions that DELETE, DESTROY, or ELIMINATE existing resources from the system

SEMANTIC INDICATORS:
- CREATE: Adding something new, establishing, setting up, building, making
- UPDATE: Modifying existing items, changing properties, editing, revising
- DELETE: Removing items, destroying, eliminating, erasing permanently. DO NOT USE the for removing items from a relationship, use updating instead

EXAMPLES (Multilingual):
- "Create a new data element" → CREATE
- "Créer un nouvel élément de données" (French) → CREATE
- "Crear un nuevo elemento de datos" (Spanish) → CREATE
- "Update the data element I just created" → UPDATE
- "Modifier l'élément de données que je viens de créer" (French) → UPDATE
- "Delete the Monthly Summary dataset" → DELETE
- "Supprimer le jeu de données Résumé Mensuel" (French) → DELETE

Conversation history (for context):
${conversationContext || 'No previous context'}

Current query: "${state.originalQuery}"

Return ONLY a JSON object:
{
  "operationType": "create|update|delete",
  "confidence": 0-1,
  "reasoning": "brief explanation of intent detection"
}
`;

	try {
		const result = await model.invoke([{
			role: 'system',
			content: 'You are a CRUD operation classifier. Return only valid JSON.'
		}, {
			role: 'user',
			content: classificationPrompt
		}]);

		const response = JSON.parse(result.content as string);
		console.log('🔄 CRUD: Classified operation as:', response.operationType, `(confidence: ${response.confidence})`);

		return {
			operationType: response.operationType || 'unknown',
			originalQuery: state.originalQuery
		};
	} catch (error) {
		console.error('🔄 CRUD: Classification failed, defaulting to unknown');
		return {
			operationType: 'unknown',
			originalQuery: state.originalQuery
		};
	}
}

// 2. Route to Create Agent
async function invoke_create_agent(state: typeof CrudAnnotation.State): Promise<Partial<typeof CrudAnnotation.State>> {
	console.log('➕ CRUD: Routing to Create Agent');

	try {
		const result = await createAgent.invoke({
			messages: state.messages
		});

		const responseContent = result.messages[result.messages.length - 1].content as string;
		let parsedResponse;
		try {
			parsedResponse = JSON.parse(responseContent);
		} catch (parseError) {
			parsedResponse = { rawResponse: responseContent };
		}

		return { finalResult: parsedResponse };
	} catch (error) {
		console.error('➕ CRUD: Create agent error:', error);
		const errorResponse = {
			success: false,
			error: `Create operation failed: ${error.message}`
		};
		return { finalResult: errorResponse };
	}
}

// 3. Route to Update Agent
async function invoke_update_agent(state: typeof CrudAnnotation.State): Promise<Partial<typeof CrudAnnotation.State>> {
	console.log('🔄 CRUD: Routing to Update Agent');

	try {
		// Use workflow orchestrator's agent routing instead of direct call
		const { workflowOrchestrator } = await import('../utils/workflow-orchestrator');
		const updateAgentFn = workflowOrchestrator.getAgentFunction('update');

		const result = await updateAgentFn({
			flow: 'metadata',
			input: { messages: state.messages },
			selectedAgent: 'update'
		});

		// The workflow orchestrator returns the final result directly
		// No need to parse messages since it's already processed
		return { finalResult: result };
	} catch (error) {
		console.error('🔄 CRUD: Update agent error:', error);
		const errorResponse = {
			success: false,
			error: `Update operation failed: ${error.message}`
		};
		return { finalResult: errorResponse };
	}
}

// 4. Route to Delete Agent
async function invoke_delete_agent(state: typeof CrudAnnotation.State): Promise<Partial<typeof CrudAnnotation.State>> {
	console.log('🗑️ CRUD: Routing to Delete Agent');

	try {
		// Use workflow orchestrator's agent routing instead of direct call
		const { workflowOrchestrator } = await import('../utils/workflow-orchestrator');
		const deleteAgentFn = workflowOrchestrator.getAgentFunction('delete');

		const result = await deleteAgentFn({
			flow: 'metadata',
			input: { messages: state.messages },
			selectedAgent: 'delete'
		});

		// The workflow orchestrator returns the final result directly
		// No need to parse messages since it's already processed
		return { finalResult: result };
	} catch (error) {
		console.error('🗑️ CRUD: Delete agent error:', error);
		const errorResponse = {
			success: false,
			error: `Delete operation failed: ${error.message}`
		};
		return { finalResult: errorResponse };
	}
}

// 5. Handle unknown operation type
async function handle_unknown_operation(state: typeof CrudAnnotation.State): Promise<Partial<typeof CrudAnnotation.State>> {
	console.log('❓ CRUD: Handling unknown operation type');

	const clarificationResponse = {
		success: false,
		error: 'Unable to determine operation type (create/update/delete). Please specify whether you want to create, update, or delete a resource.',
		suggestion: 'Try rephrasing your request with clear action words like "create", "update", or "delete".'
	};

	return { finalResult: clarificationResponse };
}

// Create and compile StateGraph workflow
const crudWorkflow = new StateGraph(CrudAnnotation);

// Add nodes
crudWorkflow.addNode('classify_operation', classify_operation);
crudWorkflow.addNode('invoke_create_agent', invoke_create_agent);
crudWorkflow.addNode('invoke_update_agent', invoke_update_agent);
crudWorkflow.addNode('invoke_delete_agent', invoke_delete_agent);
crudWorkflow.addNode('handle_unknown_operation', handle_unknown_operation);

// Add edges
// @ts-ignore
crudWorkflow.addEdge(START, 'classify_operation');

// Conditional routing based on operation type
// @ts-ignore
crudWorkflow.addConditionalEdges('classify_operation', (state) => {
	if (state.operationType === 'create') return 'invoke_create_agent';
	if (state.operationType === 'update') return 'invoke_update_agent';
	if (state.operationType === 'delete') return 'invoke_delete_agent';
	return 'handle_unknown_operation';
});

// Terminal nodes don't need additional edges
// @ts-ignore
crudWorkflow.addEdge('invoke_create_agent', END);
// @ts-ignore
crudWorkflow.addEdge('invoke_update_agent', END);
// @ts-ignore
crudWorkflow.addEdge('invoke_delete_agent', END);
// @ts-ignore
crudWorkflow.addEdge('handle_unknown_operation', END);

// Compile the workflow
const crudStateGraph = crudWorkflow.compile();

// StateGraph-based CRUD router agent
export function createCrudAgent() {
	return {
		invoke: async (input: any) => {
			console.log('🔧 CRUD StateGraph: Processing CRUD request');

			// Extract messages and original query with proper fallback logic
			const messages = input.input?.messages || input.messages || [];
			// Prefer explicitly passed originalQuery (for follow-up context), fall back to last user message
			const originalQuery = input.originalQuery ||
			                      (input.messages && input.messages.length > 0
			                        ? input.messages[input.messages.length - 1]?.content
			                        : '') ||
			                      '';

			const initialState: Partial<typeof CrudAnnotation.State> = {
				messages: messages,
				originalQuery: originalQuery,
				operationType: 'unknown',
			};

			// Execute StateGraph workflow
			const result = await crudStateGraph.invoke(initialState);

			// Format for compatibility with existing interface
			// Return plain object directly without extra messages array wrapping
			return result.finalResult;
		}
	};
}

// Export the StateGraph-based CRUD agent for backward compatibility
export const crudAgent = createCrudAgent();

// Export the state annotation for use in other parts of the app
export { CrudAnnotation as StateAnnotation };
