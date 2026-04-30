import { Annotation, END, START, StateGraph } from '@langchain/langgraph/web';
import { ChatModels } from '../utils/chat-model-factory';
import { Dhis2Api } from '../utils/app-runtime/dhis2-api';

// Import search tools for finding resources to delete
import {
	deleteDhis2Resource,
} from '../utils/tools/metadata';

// Initialize the ChatOpenAI model with Azure configuration and retry logic for rate limiting
const model = ChatModels.createAgentModelWithRetry();

// Define the state using Annotation API (as per LangGraph official docs)
const DeleteGraphAnnotation = Annotation.Root({
	// Input state
	messages: Annotation<any[]>({
		reducer: (left: any[], right: any[]) => {
			if (Array.isArray(right)) {
				return left.concat(right);
			}
			return left.concat([right]);
		},
		default: () => [],
	}),

	// Processing state
	query: Annotation<string>({
		reducer: (left, right) => right,
		default: () => '',
	}),
	step: Annotation<string>({
		reducer: (left, right) => right,
		default: () => 'parse_request',
	}),

	// Delete workflow state
	parsedRequest: Annotation<any>({
		reducer: (left, right) => right,
		default: () => null,
	}),
	resourceSearchResult: Annotation<any>({
		reducer: (left, right) => right,
		default: () => null,
	}),
	selectedResource: Annotation<any>({
		reducer: (left, right) => right,
		default: () => null,
	}),
	deleteResult: Annotation<any>({
		reducer: (left, right) => right,
		default: () => null,
	}),

	// Workflow pause/resume state
	workflowId: Annotation<string>({
		reducer: (left, right) => right,
		default: () => '',
	}),
	workflowPaused: Annotation<boolean>({
		reducer: (left, right) => right,
		default: () => false,
	}),
	selectedItems: Annotation<any[]>({
		reducer: (left, right) => left.concat(right || []),
		default: () => [],
	}),

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
			totalSteps: 5,
			stepName: 'Initializing',
			message: 'Preparing delete workflow...',
			isIndeterminate: true
		}),
	}),

	// Output state
	finalResult: Annotation<any>({
		reducer: (left, right) => right,
		default: () => null,
	}),
	error: Annotation<string>({
		reducer: (left, right) => right,
		default: () => '',
	}),

	// Orchestrator reference for selection
	orchestrator: Annotation<any>({
		reducer: (left, right) => right,
		default: () => null,
	}),
});

// Helper to advance progress and send UI updates
function advanceProgress(state: typeof DeleteGraphAnnotation.State, step: number, stepName: string, message: string, isIndeterminate = false): void {
	// Update the workflow progress state
	const progressUpdate = {
		currentStep: step,
		totalSteps: 5,
		stepName,
		message,
		isIndeterminate
	};

	// Send progress message to orchestrator for UI display
	state.orchestrator?.addProgressMessage(message, {
		progress: step / 5 * 100, // Convert to percentage
		currentStep: step,
		totalSteps: 5,
		stepName,
		isIndeterminate,
		workflowId: state.workflowId
	});

	console.log(`📊 Delete Progress: Step ${step}/5 - ${stepName}: ${message}`);
}

// Parse delete request from user input
async function parseDeleteRequest(state: typeof DeleteGraphAnnotation.State): Promise<Partial<typeof DeleteGraphAnnotation.State>> {
	console.log('🔍 Parsing delete request');

	advanceProgress(state, 1, 'Parsing Request', 'Analyzing your delete request...', false);

	// Extract query from messages if not set
	const query = state.query || state.messages.filter(m => m.role === 'user').pop()?.content || '';

	// Use LLM to parse the delete request
	const parsePrompt = `
Parse this DHIS2 delete request and extract the key components.

REQUEST: "${query}"

Extract:
1. RESOURCE_TYPE: What type of DHIS2 resource to delete (dataElements, organisationUnits, categories, dataSets, indicators, programs, etc.)
2. RESOURCE_NAME: The name of the resource to delete
3. CONFIRM_DELETE: Whether this appears to be a confirmed delete request

Examples:
"delete data set 'Monthly Summary'" →
{
  "resourceType": "dataSets",
  "resourceName": "Monthly Summary",
  "confirmDelete": true
}

"remove the category 'Age Groups'" →
{
  "resourceType": "categories",
  "resourceName": "Age Groups",
  "confirmDelete": true
}

Return JSON only with: resourceType, resourceName, confirmDelete
`;

	try {
		const result = await model.invoke([{ role: "user", content: parsePrompt }]);
		const response = (result.content as string).trim();

		console.log('🤖 LLM parse response:', response);

		const parsedRequest = JSON.parse(response);
		console.log('📋 Parsed request:', parsedRequest);

		return {
			parsedRequest,
			step: 'search_resource'
		};

	} catch (error) {
		console.error('❌ Failed to parse delete request:', error);
		return {
			error: `Failed to parse delete request: ${error.message}`,
			step: 'completed',
			finalResult: {
				success: false,
				error: `Could not understand the delete request: ${error.message}`,
				type: 'delete'
			}
		};
	}
}

// Search for the resource to delete
async function searchResource(state: typeof DeleteGraphAnnotation.State): Promise<Partial<typeof DeleteGraphAnnotation.State>> {
	console.log('🔍 Searching for resource to delete');

	advanceProgress(state, 2, 'Finding Resource', 'Searching for the resource to delete...', false);

	const { resourceType, resourceName } = state.parsedRequest;

	try {
		// Call deleteDhis2Resource tool to find the resource
		const searchResult = await deleteDhis2Resource.invoke({
			resourceType,
			resourceName,
			confirmDeletion: false,
			showSelector: false
		});

		const result = JSON.parse(searchResult);
		console.log('🔍 Resource search result:', result);

		return {
			resourceSearchResult: result,
			step: 'handle_search_result'
		};

	} catch (error) {
		console.error('❌ Resource search failed:', error);
		return {
			error: error.message,
			step: 'completed',
			finalResult: {
				success: false,
				error: `Failed to search for resource: ${error.message}`,
				type: 'delete'
			}
		};
	}
}

// Handle the search result - either proceed with delete or request selection/confirmation
async function handleSearchResult(state: typeof DeleteGraphAnnotation.State): Promise<Partial<typeof DeleteGraphAnnotation.State>> {
	console.log('🎯 Handling search result');

	const result = state.resourceSearchResult;

	// Check if this requires user selection
	if ((result.action === 'SHOW_SELECTOR' && result.selectorOptions) || 
		(result.action === 'SHOW_SIMILAR' && result.similarMatches)) {
		
		console.log('⏸️ Multiple/similar matches found, requesting user selection');

		advanceProgress(state, 3, 'User Selection', 
			result.action === 'SHOW_SIMILAR' 
				? 'No exact match found. Please select which resource to delete...' 
				: 'Multiple resources found, waiting for your selection...', 
			true);

		if (!state.orchestrator) {
			console.error('No orchestrator available for selection');
			return {
				step: 'completed',
				finalResult: {
					success: false,
					message: 'Cannot request user selection - no orchestrator available',
					type: 'delete'
				}
			};
		}

		try {
			// Get selection options from either selectorOptions or similarMatches
			const options = result.selectorOptions || result.similarMatches;
			
			// Transform options to the format expected by requestSelection
			const selectionOptions = options?.map((option: any) => ({
				name: option.name,
				id: option.id,
				type: option.type || result.resourceType
			})) || [];

			// Request selection through orchestrator
			const selectedItems = await state.orchestrator.requestSelection(state.workflowId, selectionOptions, false);
			const selectedItem = selectedItems[0];

			console.log('▶️ User selected resource:', selectedItem);

			if (selectedItem) {
				return {
					selectedResource: selectedItem,
					step: 'confirm_deletion'
				};
			} else {
				// Selection was cancelled
				return {
					step: 'completed',
					finalResult: {
						success: false,
						message: 'Resource selection was cancelled. No deletion performed.',
						type: 'delete'
					}
				};
			}
		} catch (selectionError) {
			console.warn('⏸️ Metadata selection failed, falling back:', selectionError.message);

			// Fallback: Auto-select the first option
			const options = result.selectorOptions || result.similarMatches;
			const autoSelected = options[0];
			console.log('▶️ Auto-selected first resource due to selection failure:', autoSelected);

			return {
				selectedResource: autoSelected,
				step: 'confirm_deletion'
			};
		}
	} else if (result.action === 'CONFIRMATION_REQUIRED') {
		// Single match found, proceed to confirmation
		console.log('✅ Single match found, proceeding to confirmation');

		return {
			selectedResource: result.exactMatch,
			step: 'confirm_deletion'
		};
	} else {
		// Direct result - resource not found or other direct responses
		return {
			step: 'finalize_result'
		};
	}
}

// Confirm deletion before proceeding
async function confirmDeletion(state: typeof DeleteGraphAnnotation.State): Promise<Partial<typeof DeleteGraphAnnotation.State>> {
	console.log('⚠️ Confirming deletion');

	advanceProgress(state, 4, 'Confirm Deletion', 'Confirming deletion request...', false);

	const selectedResource = state.selectedResource;
	const { confirmDelete } = state.parsedRequest;

	if (!confirmDelete) {
		// Request confirmation from user
		console.log('⏸️ Deletion requires confirmation');

		if (!state.orchestrator) {
			return {
				step: 'completed',
				finalResult: {
					success: false,
					message: 'Cannot request deletion confirmation - no orchestrator available',
					type: 'delete'
				}
			};
		}

		try {
			// Request confirmation through orchestrator
			const confirmed = await state.orchestrator.requestConfirmation(
				state.workflowId,
				`Are you sure you want to permanently delete the ${selectedResource.type.slice(0, -1)} "${selectedResource.name}"? This action cannot be undone.`,
				false
			);

			if (confirmed) {
				console.log('✅ User confirmed deletion');
				return {
					step: 'perform_deletion'
				};
			} else {
				console.log('❌ User cancelled deletion');
				return {
					step: 'completed',
					finalResult: {
						success: false,
						message: `Deletion of ${selectedResource.name} was cancelled by user.`,
						type: 'delete'
					}
				};
			}
		} catch (confirmationError) {
			console.warn('⚠️ Confirmation request failed, proceeding with deletion:', confirmationError.message);
			// For safety, don't proceed without explicit confirmation
			return {
				step: 'completed',
				finalResult: {
					success: false,
					message: 'Could not confirm deletion request. Operation cancelled for safety.',
					type: 'delete'
				}
			};
		}
	} else {
		// Already confirmed, proceed directly
		console.log('✅ Deletion already confirmed, proceeding');
		return {
			step: 'perform_deletion'
		};
	}
}

// Perform the actual deletion
async function performDeletion(state: typeof DeleteGraphAnnotation.State): Promise<Partial<typeof DeleteGraphAnnotation.State>> {
	console.log('🗑️ Performing deletion');

	advanceProgress(state, 5, 'Deleting Resource', 'Deleting the selected resource...', false);

	const selectedResource = state.selectedResource;

	try {
		console.log(`🗑️ Deleting ${selectedResource}: ${selectedResource.id}`);

		// Call DHIS2 API directly to delete the resource
		const result = await Dhis2Api.mutate({
			resource: `${selectedResource.type}/${selectedResource.id}`,
			type: 'delete'
		});

		console.log('✅ Delete API call completed:', result);

		// Format result to match expected deleteResult structure
		const deleteResult = {
			success: result.success,
			error: result.success ? null : (result.error || 'Unknown error'),
			message: result.success ? 'Resource deleted successfully' : `Deletion failed: ${result.error || 'Unknown error'}`,
			resourceType: selectedResource.type,
			resourceId: selectedResource.id,
			resourceName: selectedResource.name
		};

		return {
			deleteResult,
			step: 'finalize_result'
		};

	} catch (error) {
		console.error('❌ Deletion failed:', error);
		return {
			error: error.message,
			step: 'completed',
			finalResult: {
				success: false,
				error: `Failed to delete resource: ${error.message}`,
				type: 'delete'
			}
		};
	}
}

// Finalize and return the result
async function finalizeResult(state: typeof DeleteGraphAnnotation.State): Promise<Partial<typeof DeleteGraphAnnotation.State>> {
	console.log('🏁 Finalizing delete result');

	// Check if we have a direct result from search or a delete result
	let finalResult;

	if (state.deleteResult) {
		// We performed a deletion
		const deleteResult = state.deleteResult;
		finalResult = {
			success: deleteResult.success,
			message: deleteResult.success
				? `Successfully deleted ${deleteResult.resourceName}`
				: `Failed to delete resource: ${deleteResult.error}`,
			deletedResource: deleteResult.success ? {
				id: deleteResult.resourceId,
				name: deleteResult.resourceName,
				type: deleteResult.resourceType
			} : null,
			error: deleteResult.success ? null : deleteResult.error,
			type: 'delete'
		};
	} else if (state.resourceSearchResult) {
		// Direct result from search (resource not found, etc.)
		const searchResult = state.resourceSearchResult;
		finalResult = {
			success: searchResult.success !== false, // Treat search results as success unless explicitly false
			message: searchResult.message || 'Delete operation completed',
			deletedResource: searchResult.deletedResource || null,
			error: searchResult.error || null,
			type: 'delete'
		};
	} else {
		// Fallback
		finalResult = {
			success: false,
			message: 'Delete operation completed with unknown result',
			type: 'delete'
		};
	}

	return {
		step: 'completed',
		finalResult
	};
}

// Create the StateGraph workflow
const workflow = new StateGraph(DeleteGraphAnnotation);

// Add nodes
workflow.addNode('parse_request', parseDeleteRequest);
workflow.addNode('search_resource', searchResource);
workflow.addNode('handle_search_result', handleSearchResult);
workflow.addNode('confirm_deletion', confirmDeletion);
workflow.addNode('perform_deletion', performDeletion);
workflow.addNode('finalize_result', finalizeResult);

// Add edges
// @ts-ignore
workflow.addEdge(START, 'parse_request');
// @ts-ignore
workflow.addEdge('parse_request', 'search_resource');
// @ts-ignore
workflow.addEdge('search_resource', 'handle_search_result');

// Conditional edges from handle_search_result
// @ts-ignore
workflow.addConditionalEdges('handle_search_result', (state) => {
	if (state.step === 'confirm_deletion') return 'confirm_deletion';
	if (state.step === 'finalize_result') return 'finalize_result';
	return END;
});

// @ts-ignore
workflow.addEdge('confirm_deletion', 'perform_deletion');
// @ts-ignore
workflow.addEdge('perform_deletion', 'finalize_result');
// @ts-ignore
workflow.addEdge('finalize_result', END);

// Compile the workflow
const deleteStateGraph = workflow.compile();

// StateGraph-based delete agent wrapper
export function createDeleteGraphAgent(orchestrator: any) {
	return {
		invoke: async (input: any) => {
			console.log('🗑️ Delete StateGraph: Processing delete request');

			// Extract messages from input (handle workflow orchestrator structure)
			const messages = input.messages || input.input?.messages || [];
			const userMessages = messages?.filter((m: any) => m.role === 'user') || [];
			const lastUserMessage = userMessages[userMessages.length - 1];
			const originalQuery = lastUserMessage?.content || '';

			const initialState: Partial<typeof DeleteGraphAnnotation.State> = {
				messages: messages || [],
				query: originalQuery || '',
				orchestrator: orchestrator,
				workflowId: `delete_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
			};

			console.log('Initial delete state', initialState);

			// Execute the StateGraph workflow
			const result = await deleteStateGraph.invoke(initialState);

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

// The delete agent is now only available through the workflow orchestrator
// Use workflowOrchestrator.getAgentFunction('delete') to get the StateGraph version

export { deleteStateGraph as deleteGraphAgent, DeleteGraphAnnotation };
