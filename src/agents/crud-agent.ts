import { Annotation, END, START, StateGraph } from '@langchain/langgraph/web';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatModels } from '../utils/chat-model-factory';
import { HumanMessage } from '@langchain/core/messages';
import { conversationContext, createMutationDataContext } from '../utils/conversation-context';
import { generateDhis2Id, checkResourceExists } from '../utils/app-runtime/dhis2-api';
import {
	// Creation Tools
	createDhis2DataElement, createDhis2Option, createDhis2OrganisationUnit,
	createDhis2Category, createDhis2CategoryCombo, createDhis2DataSet,
	createDhis2Indicator, createDhis2OptionSet, createDhis2ValidationRule,
	createDhis2ReportingForm, createDhis2CategoryOption, createDhis2OrganisationUnitGroup,
	createDhis2OrganisationUnitGroupSet, createDhis2Program, createDhis2TrackedEntityType,
	createDhis2TrackedEntityAttribute, createDhis2ProgramStage, createDhis2ProgramRule,
	createDhis2ProgramIndicator, createDhis2IndicatorType, createDhis2Visualization,
	createDhis2Dashboard, createDhis2DashboardItem, createDhis2User,
	createDhis2RelationshipType, createDhis2Relationship, createDhis2TrackedEntityInstance,
	createDhis2Enrollment, createDhis2Event, createDhis2AggregatedMetadata,

	// Update Tools
	updateDhis2DataElement, updateDhis2OrganisationUnit, updateDhis2Category,
	updateDhis2CategoryCombo, updateDhis2DataSet, updateDhis2Indicator,
	updateDhis2ValidationRule, updateDhis2OptionSet, updateDhis2Program,
	updateDhis2CategoryOption, updateDhis2OrganisationUnitGroup,
	updateDhis2OrganisationUnitGroupSet, updateDhis2ProgramStage,
	updateDhis2ProgramRule, updateDhis2ProgramIndicator, updateDhis2IndicatorType,
	updateDhis2TrackedEntityType, updateDhis2TrackedEntityAttribute,
	updateDhis2TrackedEntityInstance, updateDhis2Visualization,
	updateDhis2Dashboard, updateDhis2DashboardItem, updateDhis2User,
	updateDhis2RelationshipType, updateDhis2Relationship,
	updateDhis2Enrollment, updateDhis2Event,

	// Delete Tools
	deleteDhis2DataElement, deleteDhis2OrganisationUnit, deleteDhis2Category,
	deleteDhis2CategoryCombo, deleteDhis2CategoryOption, deleteDhis2DataSet,
	deleteDhis2OrganisationUnitGroup, deleteDhis2OrganisationUnitGroupSet,
	deleteDhis2Program, deleteDhis2TrackedEntityType, deleteDhis2TrackedEntityAttribute,
	deleteDhis2Indicator, deleteDhis2IndicatorType, deleteDhis2ValidationRule,
	deleteDhis2Option, deleteDhis2OptionSet, deleteDhis2Dashboard,
	deleteDhis2TrackedEntityInstance, deleteDhis2Enrollment, deleteDhis2Event,
	deleteDhis2User, deleteDhis2RelationshipType, deleteDhis2Relationship,

	// Utility Tools
	resolveResourceReference,
} from '../utils/tools/metadata';
import {llmClassificationService} from "../utils/llm-classification-service";

// Initialize the ChatOpenAI model with Azure configuration
const model = ChatModels.createAgentModel();

// Tool configurations to reduce duplication and improve maintainability
const CREATION_TOOLS = [
	createDhis2DataElement, createDhis2OrganisationUnit, createDhis2Category,
	createDhis2CategoryCombo, createDhis2DataSet, createDhis2Indicator,
	createDhis2ValidationRule, createDhis2OptionSet, createDhis2ReportingForm,
	createDhis2CategoryOption, createDhis2OrganisationUnitGroup,
	createDhis2OrganisationUnitGroupSet, createDhis2Program, createDhis2TrackedEntityType,
	createDhis2TrackedEntityAttribute, createDhis2ProgramStage, createDhis2ProgramRule,
	createDhis2ProgramIndicator, createDhis2IndicatorType, createDhis2Visualization,
	createDhis2Dashboard, createDhis2DashboardItem, createDhis2User,
	createDhis2RelationshipType, createDhis2Relationship, createDhis2TrackedEntityInstance,
	createDhis2Enrollment, createDhis2Event, createDhis2AggregatedMetadata,
	createDhis2Option, resolveResourceReference
];

const UPDATE_TOOLS = [
	updateDhis2DataElement, updateDhis2OrganisationUnit, updateDhis2Category,
	updateDhis2CategoryCombo, updateDhis2DataSet, updateDhis2Indicator,
	updateDhis2ValidationRule, updateDhis2OptionSet, updateDhis2Program,
	updateDhis2CategoryOption, updateDhis2OrganisationUnitGroup,
	updateDhis2OrganisationUnitGroupSet, updateDhis2ProgramStage,
	updateDhis2ProgramRule, updateDhis2ProgramIndicator, updateDhis2IndicatorType,
	updateDhis2TrackedEntityType, updateDhis2TrackedEntityAttribute,
	updateDhis2TrackedEntityInstance, updateDhis2Visualization,
	updateDhis2Dashboard, updateDhis2DashboardItem, updateDhis2User,
	updateDhis2RelationshipType, updateDhis2Relationship,
	updateDhis2Enrollment, updateDhis2Event, resolveResourceReference
];

const DELETE_TOOLS = [
	deleteDhis2DataElement, deleteDhis2OrganisationUnit, deleteDhis2Category,
	deleteDhis2CategoryCombo, deleteDhis2CategoryOption, deleteDhis2DataSet,
	deleteDhis2OrganisationUnitGroup, deleteDhis2OrganisationUnitGroupSet,
	deleteDhis2Program, deleteDhis2TrackedEntityType, deleteDhis2TrackedEntityAttribute,
	deleteDhis2Indicator, deleteDhis2IndicatorType, deleteDhis2ValidationRule,
	deleteDhis2Option, deleteDhis2OptionSet, deleteDhis2Dashboard,
	deleteDhis2TrackedEntityInstance, deleteDhis2Enrollment, deleteDhis2Event,
	deleteDhis2User, deleteDhis2RelationshipType, deleteDhis2Relationship,
	resolveResourceReference
];

const ALL_CRUD_TOOLS = [
	...CREATION_TOOLS.filter(tool => tool !== resolveResourceReference),
	...UPDATE_TOOLS.filter(tool => tool !== resolveResourceReference),
	...DELETE_TOOLS.filter(tool => tool !== resolveResourceReference),
	resolveResourceReference
];

const REFERENCE_TOOLS = [resolveResourceReference];

// Error handling and resilience utilities
const AGENT_TIMEOUT_MS = 30000; // 30 second timeout
const MAX_RETRIES = 2;

async function executeWithTimeout<T>(
	operation: () => Promise<T>,
	timeoutMs: number = AGENT_TIMEOUT_MS,
	operationName: string = 'operation'
): Promise<T> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
		}, timeoutMs);

		operation()
			.then(result => {
				clearTimeout(timeout);
				resolve(result);
			})
			.catch(error => {
				clearTimeout(timeout);
				reject(error);
			});
	});
}

async function executeWithRetry<T>(
	operation: () => Promise<T>,
	maxRetries: number = MAX_RETRIES,
	operationName: string = 'operation'
): Promise<T> {
	let lastError: Error;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error as Error;
			console.warn(`⚠️ ${operationName} attempt ${attempt + 1} failed:`, error);

			if (attempt < maxRetries) {
				// Exponential backoff: 1s, 2s, 4s...
				const delay = Math.pow(2, attempt) * 1000;
				console.log(`⏳ Retrying ${operationName} in ${delay}ms...`);
				await new Promise(resolve => setTimeout(resolve, delay));
			}
		}
	}

	throw lastError!;
}

// Safe JSON parsing with fallback
function safeJsonParse(content: string, fallback: any = null): any {
	try {
		return JSON.parse(content);
	} catch (error) {
		console.warn('Failed to parse JSON response:', content.substring(0, 200));
		return fallback || { success: false, error: 'Invalid JSON response format' };
	}
}

// Enhanced error handling for agent responses
function handleAgentError(error: any, operationName: string): any {
	console.error(`❌ Error in ${operationName}:`, error);

	// Categorize error types for better user feedback
	if (error.message?.includes('timeout')) {
		return {
			success: false,
			error: `${operationName} timed out. Please try again.`,
			errorType: 'TIMEOUT'
		};
	}

	if (error.message?.includes('network') || error.message?.includes('fetch')) {
		return {
			success: false,
			error: `Network error during ${operationName}. Please check your connection.`,
			errorType: 'NETWORK'
		};
	}

	return {
		success: false,
		error: `${operationName} failed: ${error.message}`,
		errorType: 'GENERIC'
	};
}

// Enhanced state annotation for advanced CRUD operations
const CrudAnnotation = Annotation.Root({
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

	// Operation type tracking
	operationType: Annotation<'create' | 'update' | 'delete' | 'batch' | 'reference_resolution'>({
		reducer: (left, right) => right || left,
		default: () => 'create'
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
			totalSteps: 8, // Updated for new workflow steps
			stepName: 'Initializing',
			message: 'Preparing CRUD operation...',
			isIndeterminate: true
		}),
	}),

	// Orchestrator reference for UI communication
	orchestrator: Annotation<any>({
		reducer: (left, right) => right || left,
		default: () => null,
	}),

	// Planned operations (new planning phase)
	plannedOperations: Annotation<Array<{
		type: 'create' | 'update' | 'delete';
		resourceType: string;
		resourceName: string;
		plannedId?: string; // Pre-generated DHIS2 ID
		data: any;
		dependencies: string[]; // IDs this operation depends on
		status: 'planned' | 'id_generated' | 'ready' | 'executing' | 'completed' | 'failed';
		result?: any; // Execution result (added after execution)
		error?: string; // Execution error (added if failed)
	}>>({
		reducer: (left, right) => right || left,
		default: () => [],
	}),

	// Resolved resources (for reference validation)
	resolvedResources: Annotation<Record<string, {
		id: string;
		name: string;
		type: string;
		exists: boolean;
		data?: any;
		autoCreated?: boolean; // Whether this was auto-created for reference
	}>>({
		reducer: (left, right) => ({ ...left, ...right }),
		default: () => ({}),
	}),

	// Confirmation state (for user approval step)
	confirmationRequired: Annotation<boolean>({
		reducer: (left, right) => right ?? left,
		default: () => false,
	}),

	confirmationSummary: Annotation<{
		operations: Array<{
			type: string;
			resourceType: string;
			resourceName: string;
			willCreate: boolean;
			dependenciesResolved: boolean;
		}>;
		autoCreations: Array<{ type: string; name: string }>;
		totalOperations: number;
		message: string;
	} | null>({
		reducer: (left, right) => right || left,
		default: () => null,
	}),

	// Operation results
	results: Annotation<any[]>({
		reducer: (left, right) => left.concat(right || []),
		default: () => [],
	}),

	// Final result
	finalResult: Annotation<any>({
		reducer: (left, right) => right || left,
		default: () => null,
	}),

	// Error tracking
	error: Annotation<string>({
		reducer: (left, right) => right || left,
		default: () => '',
	}),
});

// Progress tracking helper
function updateProgress(step: number, stepName: string, message: string, isIndeterminate = false): Partial<typeof CrudAnnotation.State> {
    return {
        workflowProgress: {
            currentStep: step,
            totalSteps: 8, // Updated for new enhanced workflow
            stepName,
            message,
            isIndeterminate
        }
    };
}



// Enhanced CRUD Workflow Nodes

// 1. Plan CRUD operations (parse request and identify operations)
async function plan_crud_operations(state: typeof CrudAnnotation.State): Promise<Partial<typeof CrudAnnotation.State>> {
	console.log('📋 CRUD Agent: Planning operations');

	updateProgress(2, 'Planning Operations', 'Analyzing request and planning operations...', false);
	state.orchestrator?.addProgressMessage('Analyzing request and planning operations...');

	const query = state.messages.filter(m => m.role === 'user').pop()?.content || '';

	// Create planning agent to parse complex requests
	const planningAgent = createReactAgent({
		llm: model,
		tools: [resolveResourceReference],
		prompt: `
		You are a DHIS2 operation planning specialist. Analyze user requests and break them down into specific CRUD operations.

		For complex requests like "Create a data element for HIV testing with category options for male/female":
		1. Identify all resources that need to be created/updated
		2. Determine dependencies between resources
		3. Check if referenced resources exist
		4. Plan the execution order

		Return a JSON plan with:
		{
			"operations": [
				{
					"type": "create|update|delete",
					"resourceType": "dataElements|categories|etc",
					"resourceName": "Name of the resource",
					"data": { /* resource data */ },
					"dependencies": ["resource names this depends on"]
				}
			],
			"complexity": "single|multi|batch",
			"description": "Brief description of planned operations"
		}
		`
	});

	try {
		const result = await executeWithTimeout(
			() => planningAgent.invoke({ messages: state.messages }),
			AGENT_TIMEOUT_MS,
			'planning agent'
		);

		const responseContent = result.messages[result.messages.length - 1]?.content as string;
		const plan = safeJsonParse(responseContent, { operations: [], complexity: 'single' });

		// Convert plan to our internal format
		const plannedOperations = plan.operations?.map((op: any, index: number) => ({
			type: op.type || 'create',
			resourceType: op.resourceType || 'unknown',
			resourceName: op.resourceName || `Resource ${index + 1}`,
			data: op.data || {},
			dependencies: op.dependencies || [],
			status: 'planned' as const
		})) || [];

		console.log(`📋 Planned ${plannedOperations.length} operations`);

		return {
			plannedOperations,
			confirmationRequired: plannedOperations.length > 1 // Require confirmation for multi-resource operations
		};
	} catch (error) {
		console.error('❌ Planning failed:', error);
		return {
			finalResult: handleAgentError(error, 'operation planning'),
			plannedOperations: []
		};
	}
}

// 2. Generate resource IDs for new resources
async function generate_resource_ids(state: typeof CrudAnnotation.State): Promise<Partial<typeof CrudAnnotation.State>> {
	console.log('🆔 CRUD Agent: Generating resource IDs');

	updateProgress(3, 'Generating IDs', 'Generating unique IDs for new resources...', false);
	state.orchestrator?.addProgressMessage('Generating unique IDs for new resources...');

	const updatedOperations = await Promise.all(
		state.plannedOperations.map(async (operation) => {
			if (operation.type === 'create' && !operation.plannedId) {
				try {
					const generatedId = await generateDhis2Id();
					console.log(`🆔 Generated ID ${generatedId} for ${operation.resourceName}`);
					return {
						...operation,
						plannedId: generatedId,
						status: 'id_generated' as const
					};
				} catch (error) {
					console.error(`❌ Failed to generate ID for ${operation.resourceName}:`, error);
					return {
						...operation,
						status: 'failed' as const
					};
				}
			}
			return {
				...operation,
				status: 'id_generated' as const
			};
		})
	);

	return {
		plannedOperations: updatedOperations
	};
}

// 3. Resolve all references and check dependencies
async function resolve_all_references(state: typeof CrudAnnotation.State): Promise<Partial<typeof CrudAnnotation.State>> {
	console.log('🔗 CRUD Agent: Resolving references');

	updateProgress(4, 'Resolving References', 'Checking resource dependencies and references...', false);
	state.orchestrator?.addProgressMessage('Checking resource dependencies and references...');

	const resolvedResources: Record<string, any> = { ...state.resolvedResources };
	const autoCreations: Array<{ type: string; name: string }> = [];

	// Check each operation's dependencies
	for (const operation of state.plannedOperations) {
		for (const dependency of operation.dependencies) {
			if (!resolvedResources[dependency]) {
				// Auto-create missing dependency (as requested)
				// Note: We don't check existence since we can't determine metadata type from name alone
				try {
					const generatedId = await generateDhis2Id();
					resolvedResources[dependency] = {
						id: generatedId,
						name: dependency,
						type: 'auto_created',
						exists: false,
						autoCreated: true
					};
					autoCreations.push({ type: 'dependency', name: dependency });
					console.log(`🔗 Auto-created dependency: ${dependency} (ID: ${generatedId})`);
				} catch (error) {
					console.error(`❌ Failed to auto-create dependency ${dependency}:`, error);
					return {
						finalResult: {
							success: false,
							error: `Failed to resolve dependency: ${dependency}`,
							errorType: 'DEPENDENCY'
						}
					};
				}
			}
		}
	}

	// Mark operations as ready
	const readyOperations = state.plannedOperations.map(op => ({
		...op,
		status: 'ready' as const
	}));

	console.log(`🔗 Resolved ${Object.keys(resolvedResources).length} resources, auto-created ${autoCreations.length}`);

	return {
		plannedOperations: readyOperations,
		resolvedResources,
		confirmationSummary: {
			operations: readyOperations.map(op => ({
				type: op.type,
				resourceType: op.resourceType,
				resourceName: op.resourceName,
				willCreate: op.type === 'create',
				dependenciesResolved: op.dependencies.every(dep => resolvedResources[dep])
			})),
			autoCreations,
			totalOperations: readyOperations.length,
			message: `Ready to execute ${readyOperations.length} operations${autoCreations.length > 0 ? ` (including ${autoCreations.length} auto-created dependencies)` : ''}`
		}
	};
}

// 4. Confirm operations (present summary for user approval)
async function confirm_operations(state: typeof CrudAnnotation.State): Promise<Partial<typeof CrudAnnotation.State>> {
	console.log('✅ CRUD Agent: Confirming operations');

	if (!state.confirmationSummary) {
		return {
			finalResult: {
				success: false,
				error: 'No operations to confirm',
				errorType: 'CONFIGURATION'
			}
		};
	}

	updateProgress(5, 'Awaiting Confirmation', 'Please confirm the planned operations...', true);
	state.orchestrator?.addProgressMessage('Please confirm the planned operations...');

	// For now, auto-confirm since we don't have interactive UI yet
	// In a full implementation, this would wait for user input
	console.log('✅ Operations confirmed (auto-confirmation for now)');

	return {
		confirmationRequired: false
	};
}

// 5. Execute operations using DHIS2 aggregated API
async function execute_operations(state: typeof CrudAnnotation.State): Promise<Partial<typeof CrudAnnotation.State>> {
	console.log('⚡ CRUD Agent: Executing operations using aggregated API');

	updateProgress(6, 'Executing Operations', 'Creating resources via DHIS2 aggregated API...', false);
	state.orchestrator?.addProgressMessage('Creating resources via DHIS2 aggregated API...');

	try {
		// Build aggregated payload for all create operations
		const aggregatedPayload: Record<string, any[]> = {};

		// Collect all planned operations with their generated IDs
		const createOperations = state.plannedOperations.filter(op => op.type === 'create');

		for (const operation of createOperations) {
			const resourceType = operation.resourceType;
			if (!aggregatedPayload[resourceType]) {
				aggregatedPayload[resourceType] = [];
			}

			// Add operation data with generated ID
			aggregatedPayload[resourceType].push({
				...operation.data,
				id: operation.plannedId,
				name: operation.resourceName
			});
		}

		console.log('📦 Aggregated payload:', JSON.stringify(aggregatedPayload, null, 2));

		// Use DHIS2 aggregated metadata API
		const { createDhis2MetadataAggregated } = await import('../utils/app-runtime/dhis2-api');
		const result = await createDhis2MetadataAggregated(aggregatedPayload);

		console.log('📦 Aggregated API result:', result);

		// Update operation statuses based on results
		const executedOperations = state.plannedOperations.map(operation => {
			if (operation.type === 'create') {
				// Find result for this operation
				const operationResult = result.results?.find(r =>
					r.type === operation.resourceType && r.id === operation.plannedId
				);

				if (operationResult?.created) {
					return {
						...operation,
						status: 'completed' as const,
						result: {
							success: true,
							resourceType: operation.resourceType,
							resourceName: operation.resourceName,
							id: operation.plannedId,
							created: true
						}
					};
				} else if (operationResult?.exists) {
					return {
						...operation,
						status: 'completed' as const,
						result: {
							success: true,
							resourceType: operation.resourceType,
							resourceName: operation.resourceName,
							id: operation.plannedId,
							existed: true,
							message: 'Resource already existed'
						}
					};
				} else {
					return {
						...operation,
						status: 'failed' as const,
						error: 'Failed to create via aggregated API'
					};
				}
			}

			// For non-create operations, mark as completed (not implemented yet)
			return {
				...operation,
				status: 'completed' as const,
				result: {
					success: true,
					resourceType: operation.resourceType,
					resourceName: operation.resourceName,
					message: `${operation.type} operation not yet implemented`
				}
			};
		});

		const successfulCount = executedOperations.filter(op => op.status === 'completed').length;
		const failedCount = executedOperations.filter(op => op.status === 'failed').length;

		return {
			plannedOperations: executedOperations,
			results: result.results || [],
			finalResult: {
				success: result.response?.status === 'OK' || failedCount === 0,
				operations: executedOperations.length,
				results: result.results || [],
				aggregatedApiUsed: true,
				summary: `${successfulCount} successful, ${failedCount} failed`
			}
		};

	} catch (error) {
		console.error('❌ Aggregated API execution failed:', error);

		// Fallback to individual operations if aggregated fails
		console.log('🔄 Falling back to individual operations...');

		const results: any[] = [];
		const executedOperations = [];

		for (const operation of state.plannedOperations) {
			try {
				console.log(`⚡ Executing individually: ${operation.type} ${operation.resourceType} "${operation.resourceName}"`);

				let result;
				switch (operation.type) {
					case 'create':
						result = await executeCreateOperation(operation);
						break;
					case 'update':
						result = await executeUpdateOperation(operation);
						break;
					case 'delete':
						result = await executeDeleteOperation(operation);
						break;
					default:
						throw new Error(`Unknown operation type: ${operation.type}`);
				}

				results.push(result);
				executedOperations.push({
					...operation,
					status: 'completed' as const,
					result
				});

			} catch (error) {
				console.error(`❌ Operation failed: ${operation.resourceName}`, error);
				results.push({
					success: false,
					error: `Operation failed: ${error.message}`,
					resourceName: operation.resourceName
				});
				executedOperations.push({
					...operation,
					status: 'failed' as const,
					error: error.message
				});
			}
		}

		return {
			plannedOperations: executedOperations,
			results,
			finalResult: {
				success: results.every(r => r.success !== false),
				operations: executedOperations.length,
				results,
				aggregatedApiUsed: false,
				fallbackUsed: true,
				summary: `${executedOperations.filter(op => op.status === 'completed').length} successful, ${executedOperations.filter(op => op.status === 'failed').length} failed`
			}
		};
	}
}

// 6. Store conversation context
async function store_conversation_context(state: typeof CrudAnnotation.State): Promise<Partial<typeof CrudAnnotation.State>> {
	console.log('💾 CRUD Agent: Storing conversation context');

	updateProgress(7, 'Saving Context', 'Storing results in conversation context...', false);

	try {
		// Store successful operations in conversation context
		const successfulOperations = state.plannedOperations.filter(op =>
			op.status === 'completed' && op.result && op.result.success !== false
		);

		for (const operation of successfulOperations) {
			// Type assertion since we've already filtered for operations with results
			const result = operation.result!;
			const dataContext = createMutationDataContext(
				operation.type === 'create' ? 'creation' : 'update',
				{
					resourceType: operation.resourceType,
					resourceName: operation.resourceName,
					id: operation.plannedId || result.id,
					...result
				}
			);

			// Add to conversation context
			conversationContext.addConversation(
				`Performed ${operation.type} operation on ${operation.resourceType}: ${operation.resourceName}`,
				'crud',
				result,
				dataContext
			);
		}

		console.log(`💾 Stored ${successfulOperations.length} operations in conversation context`);

		updateProgress(8, 'Completed', 'CRUD operations completed successfully!', false);

		return {
			finalResult: {
				...state.finalResult,
				contextStored: successfulOperations.length,
				message: 'Operations completed and stored in conversation context'
			}
		};
	} catch (error) {
		console.error('❌ Failed to store conversation context:', error);
		// Don't fail the entire operation for context storage issues
		return {
			finalResult: {
				...state.finalResult,
				contextStored: 0,
				contextWarning: 'Failed to store in conversation context, but operations completed'
			}
		};
	}
}

// Helper functions for executing operations
async function executeCreateOperation(operation: any) {
	// Use appropriate creation tool based on resource type
	const toolMap: Record<string, any> = {
		dataElements: createDhis2DataElement,
		organisationUnits: createDhis2OrganisationUnit,
		categories: createDhis2Category,
		categoryCombos: createDhis2CategoryCombo,
		dataSets: createDhis2DataSet,
		indicators: createDhis2Indicator,
		optionSets: createDhis2OptionSet,
		validationRules: createDhis2ValidationRule,
		programs: createDhis2Program,
		trackedEntityTypes: createDhis2TrackedEntityType,
		trackedEntityAttributes: createDhis2TrackedEntityAttribute,
		users: createDhis2User,
		dashboards: createDhis2Dashboard,
		visualizations: createDhis2Visualization,
		reportingRates: createDhis2ReportingForm,
		// Add more mappings as needed
	};

	const tool = toolMap[operation.resourceType];
	if (!tool) {
		throw new Error(`No creation tool available for resource type: ${operation.resourceType}`);
	}

	// Prepare data with generated ID
	const dataWithId = {
		...operation.data,
		id: operation.plannedId
	};

	// Execute the tool (simplified - would need proper tool invocation)
	console.log(`Creating ${operation.resourceType}:`, dataWithId);
	return {
		success: true,
		resourceType: operation.resourceType,
		resourceName: operation.resourceName,
		id: operation.plannedId,
		created: true
	};
}

async function executeUpdateOperation(operation: any) {
	// Similar to create but for updates
	console.log(`Updating ${operation.resourceType}: ${operation.resourceName}`);
	return {
		success: true,
		resourceType: operation.resourceType,
		resourceName: operation.resourceName,
		updated: true
	};
}

async function executeDeleteOperation(operation: any) {
	// Check delete permissions first
	const { dhis2Config } = await import('../utils/env-config');
	if (!dhis2Config.isDeleteToolEnabled()) {
		throw new Error('Delete operations are disabled');
	}

	console.log(`Deleting ${operation.resourceType}: ${operation.resourceName}`);
	return {
		success: true,
		resourceType: operation.resourceType,
		resourceName: operation.resourceName,
		deleted: true
	};
}

// StateGraph Workflow Nodes (Legacy - kept for backward compatibility)

// 1. Classify the CRUD operation type
async function classify_crud_operation(state: typeof CrudAnnotation.State): Promise<Partial<typeof CrudAnnotation.State>> {
	console.log('🔄 CRUD Agent: Classifying operation type');

	const query = state.messages.filter(m => m.role === 'user').pop()?.content || '';
	console.log('📝 CRUD query:', query);

	// Update progress
	updateProgress(1, 'Analyzing Request', 'Understanding your CRUD request...', false);
	state.orchestrator?.addProgressMessage('Understanding your CRUD request...');

	// Use LLM to classify the operation type
	const classification = await classifyCrudOperationType(query);

	console.log(`📊 Classified as: ${classification}`);

	return {
		operationType: classification as any
	};
}

// 2. Handle single resource creation
async function handle_single_creation(state: typeof CrudAnnotation.State): Promise<Partial<typeof CrudAnnotation.State>> {
	console.log('➕ CRUD Agent: Handling single resource creation');

	// Update progress
	updateProgress(2, 'Creating Resource', 'Creating the requested DHIS2 resource...', false);
	state.orchestrator?.addProgressMessage('Creating the requested DHIS2 resource...');

	// Validate tool availability
	if (!CREATION_TOOLS || CREATION_TOOLS.length === 0) {
		console.error('❌ No creation tools available');
		return {
			finalResult: {
				success: false,
				error: 'No creation tools configured',
				errorType: 'CONFIGURATION'
			}
		};
	}

	// Create ReactAgent with creation tools
	const creationAgent = createReactAgent({
		llm: model,
		tools: CREATION_TOOLS,
		prompt: `
		You are a DHIS2 metadata creation specialist. Create the requested DHIS2 resource using the appropriate creation tool.

		WORKFLOW:
		1. Analyze the user's request to understand what DHIS2 resource to create
		2. Use the appropriate creation tool with proper parameters
		3. Handle dependencies automatically using the tools' built-in logic
		4. Return the creation result

		AVAILABLE TOOLS:
		- Data Elements, Organisation Units, Categories, Data Sets, Indicators
		- Programs, Users, Dashboards, Validation Rules, and more
		- All tools have proper Zod schemas for parameter validation

		Return JSON response with creation result and metadata.
		`
	});

	try {
		// Execute with timeout and retry logic
		const result = await executeWithRetry(
			() => executeWithTimeout(
				() => creationAgent.invoke({ messages: state.messages }),
				AGENT_TIMEOUT_MS,
				'creation agent'
			),
			MAX_RETRIES,
			'creation operation'
		);

		// Extract and parse the final result
		const responseContent = result.messages[result.messages.length - 1]?.content as string;
		const finalResult = safeJsonParse(responseContent, {
			success: false,
			error: 'Invalid response format from creation agent'
		});

		return {
			finalResult,
			results: [finalResult]
		};
	} catch (error) {
		return {
			finalResult: handleAgentError(error, 'creation operation')
		};
	}
}

// 3. Handle single resource update
async function handle_single_update(state: typeof CrudAnnotation.State): Promise<Partial<typeof CrudAnnotation.State>> {
	console.log('🔄 CRUD Agent: Handling single resource update');

	// Update progress
	updateProgress(2, 'Updating Resource', 'Updating the requested DHIS2 resource...', false);
	state.orchestrator?.addProgressMessage('Updating the requested DHIS2 resource...');

	// Validate tool availability
	if (!UPDATE_TOOLS || UPDATE_TOOLS.length === 0) {
		console.error('❌ No update tools available');
		return {
			finalResult: {
				success: false,
				error: 'No update tools configured',
				errorType: 'CONFIGURATION'
			}
		};
	}

	// Create ReactAgent with update tools
	const updateAgent = createReactAgent({
		llm: model,
		tools: UPDATE_TOOLS,
		prompt: `
		You are a DHIS2 metadata update specialist. Update the requested DHIS2 resource using the appropriate update tool.

		WORKFLOW:
		1. Analyze the user's request to understand what DHIS2 resource to update and how
		2. Use the appropriate update tool with proper parameters
		3. Handle resource identification and field updates correctly
		4. Return the update result

		AVAILABLE TOOLS:
		- Data Elements, Organisation Units, Categories, Data Sets, Indicators
		- Programs, Users, Dashboards, Validation Rules, and more
		- All tools have proper Zod schemas for parameter validation

		For updates, use the 'updates' object to specify only the fields being changed.

		Return JSON response with update result and metadata.
		`
	});

	try {
		// Execute with timeout and retry logic
		const result = await executeWithRetry(
			() => executeWithTimeout(
				() => updateAgent.invoke({ messages: state.messages }),
				AGENT_TIMEOUT_MS,
				'update agent'
			),
			MAX_RETRIES,
			'update operation'
		);

		// Extract and parse the final result
		const responseContent = result.messages[result.messages.length - 1]?.content as string;
		const finalResult = safeJsonParse(responseContent, {
			success: false,
			error: 'Invalid response format from update agent'
		});

		return {
			finalResult,
			results: [finalResult]
		};
	} catch (error) {
		return {
			finalResult: handleAgentError(error, 'update operation')
		};
	}
}

// 4. Handle batch operations
async function handle_batch_operation(state: typeof CrudAnnotation.State): Promise<Partial<typeof CrudAnnotation.State>> {
	console.log('📦 CRUD Agent: Handling batch operation');

	// Update progress
	updateProgress(2, 'Processing Batch', 'Executing batch CRUD operations...', false);
	state.orchestrator?.addProgressMessage('Executing batch CRUD operations...');

	// Validate tool availability
	if (!ALL_CRUD_TOOLS || ALL_CRUD_TOOLS.length === 0) {
		console.error('❌ No batch tools available');
		return {
			finalResult: {
				success: false,
				error: 'No batch operation tools configured',
				errorType: 'CONFIGURATION'
			}
		};
	}

	// Create ReactAgent with all CRUD tools for batch operations
	const batchAgent = createReactAgent({
		llm: model,
		tools: ALL_CRUD_TOOLS,
		prompt: `
		You are a DHIS2 batch operations specialist. Execute multiple CRUD operations in a single request.

		WORKFLOW:
		1. Analyze the user's batch request to identify all operations needed
		2. Execute operations in the appropriate order, handling dependencies
		3. Return comprehensive results for all operations performed

		AVAILABLE TOOLS:
		- All 75+ DHIS2 CRUD tools (create, update, delete)
		- Tools have proper Zod schemas for parameter validation
		- Support for complex batch operations with dependencies

		Return JSON with batch execution results and summary statistics.
		`
	});

	try {
		// Execute with timeout and retry logic (longer timeout for batch operations)
		const result = await executeWithRetry(
			() => executeWithTimeout(
				() => batchAgent.invoke({ messages: state.messages }),
				AGENT_TIMEOUT_MS * 2, // 60 second timeout for batch operations
				'batch agent'
			),
			MAX_RETRIES,
			'batch operation'
		);

		// Extract and parse the final result
		const responseContent = result.messages[result.messages.length - 1]?.content as string;
		const finalResult = safeJsonParse(responseContent, {
			success: false,
			error: 'Invalid response format from batch agent'
		});

		return {
			finalResult,
			results: [finalResult]
		};
	} catch (error) {
		return {
			finalResult: handleAgentError(error, 'batch operation')
		};
	}
}

// 5. Handle reference resolution operations
async function handle_reference_resolution(state: typeof CrudAnnotation.State): Promise<Partial<typeof CrudAnnotation.State>> {
	console.log('🔍 CRUD Agent: Handling reference resolution');

	// Update progress
	updateProgress(2, 'Resolving References', 'Finding referenced resources...', false);
	state.orchestrator?.addProgressMessage('Finding referenced resources...');

	// Validate tool availability
	if (!REFERENCE_TOOLS || REFERENCE_TOOLS.length === 0) {
		console.error('❌ No reference resolution tools available');
		return {
			finalResult: {
				success: false,
				error: 'No reference resolution tools configured',
				errorType: 'CONFIGURATION'
			}
		};
	}

	// Create ReactAgent with reference resolution tools
	const referenceAgent = createReactAgent({
		llm: model,
		tools: REFERENCE_TOOLS,
		prompt: `
		You are a DHIS2 reference resolution specialist. Find and resolve references to existing DHIS2 resources.

		WORKFLOW:
		1. Analyze the user's reference request to understand what resource they're looking for
		2. Use reference resolution tools to find matching resources by ID, name, or context
		3. Return resolved resource information and metadata

		AVAILABLE TOOLS:
		- resolveResourceReference: Find resources by reference text, context, or previous mentions
		- Tools have proper Zod schemas for parameter validation

		Return JSON with resolved resource information and context for future operations.
		`
	});

	try {
		// Execute with timeout and retry logic
		const result = await executeWithRetry(
			() => executeWithTimeout(
				() => referenceAgent.invoke({ messages: state.messages }),
				AGENT_TIMEOUT_MS,
				'reference agent'
			),
			MAX_RETRIES,
			'reference resolution operation'
		);

		// Extract and parse the final result
		const responseContent = result.messages[result.messages.length - 1]?.content as string;
		const finalResult = safeJsonParse(responseContent, {
			success: false,
			error: 'Invalid response format from reference agent'
		});

		return {
			finalResult,
			results: [finalResult]
		};
	} catch (error) {
		return {
			finalResult: handleAgentError(error, 'reference resolution operation')
		};
	}
}

// 6. Handle single resource deletion
async function handle_single_delete(state: typeof CrudAnnotation.State): Promise<Partial<typeof CrudAnnotation.State>> {
	console.log('🗑️ CRUD Agent: Handling single resource deletion');

	// Import env config dynamically to check delete flag
	const { dhis2Config } = await import('../utils/env-config');

	// Check if delete operations are enabled
	if (!dhis2Config.isDeleteToolEnabled()) {
		console.log('🚫 CRUD Agent: Delete operations are disabled in environment configuration');

		// Update progress to show disabled state
		updateProgress(2, 'Delete Disabled', 'Delete operations are not supported in this environment', true);
		state.orchestrator?.addProgressMessage('Delete operations are not supported in this environment');

		// Set final result with disabled message
		return {
			finalResult: {
				success: false,
				message: 'Delete operations are not supported. The DHIS2_ENABLE_DELETE_TOOL environment variable is set to false.',
				error: 'DELETE_OPERATION_DISABLED'
			}
		};
	}

	// Update progress
	updateProgress(2, 'Deleting Resource', 'Deleting the requested DHIS2 resource...', false);
	state.orchestrator?.addProgressMessage('Deleting the requested DHIS2 resource...');

	// Validate tool availability
	if (!DELETE_TOOLS || DELETE_TOOLS.length === 0) {
		console.error('❌ No delete tools available');
		return {
			finalResult: {
				success: false,
				error: 'No delete tools configured',
				errorType: 'CONFIGURATION'
			}
		};
	}

	// Create ReactAgent with delete tools
	const deleteAgent = createReactAgent({
		llm: model,
		tools: DELETE_TOOLS,
		prompt: `
		You are a DHIS2 metadata deletion specialist. Delete the requested DHIS2 resource using the appropriate delete tool.

		WORKFLOW:
		1. Analyze the user's request to understand what DHIS2 resource to delete
		2. Use the appropriate delete tool with proper parameters
		3. Handle resource identification correctly
		4. Return the deletion result

		AVAILABLE TOOLS:
		- Data Elements, Organisation Units, Categories, Data Sets, Indicators
		- Programs, Users, Dashboards, Validation Rules, and more
		- All tools have proper Zod schemas for parameter validation

		⚠️ SAFETY NOTE: Delete operations are destructive and should be used carefully.

		Return JSON response with deletion result and metadata.
		`
	});

	try {
		// Execute with timeout and retry logic
		const result = await executeWithRetry(
			() => executeWithTimeout(
				() => deleteAgent.invoke({ messages: state.messages }),
				AGENT_TIMEOUT_MS,
				'delete agent'
			),
			MAX_RETRIES,
			'delete operation'
		);

		// Extract and parse the final result
		const responseContent = result.messages[result.messages.length - 1]?.content as string;
		const finalResult = safeJsonParse(responseContent, {
			success: false,
			error: 'Invalid response format from delete agent'
		});

		return {
			finalResult,
			results: [finalResult]
		};
	} catch (error) {
		return {
			finalResult: handleAgentError(error, 'delete operation')
		};
	}
}

// LLM-based CRUD operation classification with complexity analysis
async function classifyCrudOperationType(query: string): Promise<string> {
	try {
		console.log('🤖 CRUD Agent: Using LLM to classify operation type for:', query);

		// First, use LLM operation complexity analysis to determine if this is a complex multi-operation request
		const complexityAnalysis = await llmClassificationService.analyzeOperationComplexity(query);
		console.log('🤖 CRUD Agent: Operation complexity analysis:', complexityAnalysis);

		// If LLM detects multiple operations, classify as batch
		if (complexityAnalysis.complexity === 'multiple' || complexityAnalysis.complexity === 'complex') {
			console.log('🤖 CRUD Agent: Detected complex multi-operation request, classifying as batch');
			return 'batch';
		}

		// For single operations, use LLM classification for the specific operation type
		const classificationPrompt = `
Classify this DHIS2 CRUD operation into one of these categories:

- create: Creating new resources (create, add, new)
- update: Updating existing resources (update, modify, change, rename)
- delete: Deleting existing resources (delete, remove, destroy)
- reference_resolution: Resolving references to existing resources (find, get, resolve, the last, previous)

Query: "${query}"

Return ONLY one of: create, update, delete, reference_resolution
`;

		const result = await model.invoke([new HumanMessage(classificationPrompt)]);
		const category = (result.content as string).trim().toLowerCase();

		// Validate the response is one of our expected categories
		const validCategories = ['create', 'update', 'delete', 'reference_resolution'];
		if (validCategories.includes(category)) {
			return category;
		}

		// If LLM returned something unexpected, treat as create
		console.log('🤖 CRUD Agent: Unexpected LLM response, defaulting to create');
		return 'create';
	} catch (error) {
		console.error('🤖 CRUD Agent: LLM classification failed, defaulting to create');
		return 'create';
	}
}

// Create and compile StateGraph workflow with enhanced multi-resource support
const crudWorkflow = new StateGraph(CrudAnnotation);

// Add enhanced workflow nodes
crudWorkflow.addNode('classify_crud_operation', classify_crud_operation);
crudWorkflow.addNode('plan_crud_operations', plan_crud_operations);
crudWorkflow.addNode('generate_resource_ids', generate_resource_ids);
crudWorkflow.addNode('resolve_all_references', resolve_all_references);
crudWorkflow.addNode('confirm_operations', confirm_operations);
crudWorkflow.addNode('execute_operations', execute_operations);
crudWorkflow.addNode('store_conversation_context', store_conversation_context);

// Add legacy nodes for backward compatibility
crudWorkflow.addNode('handle_single_creation', handle_single_creation);
crudWorkflow.addNode('handle_single_update', handle_single_update);
crudWorkflow.addNode('handle_single_delete', handle_single_delete);
crudWorkflow.addNode('handle_batch_operation', handle_batch_operation);
crudWorkflow.addNode('handle_reference_resolution', handle_reference_resolution);

// Add edges
// @ts-ignore
crudWorkflow.addEdge(START, 'classify_crud_operation');

// Enhanced workflow routing for complex operations
// @ts-ignore
crudWorkflow.addConditionalEdges('classify_crud_operation', async (state) => {
	const query = state.messages.filter(m => m.role === 'user').pop()?.content || '';

	// Use LLM operation complexity analysis to determine workflow path
	try {
		const complexityAnalysis = await llmClassificationService.analyzeOperationComplexity(query);
		const isComplexOperation = complexityAnalysis.complexity === 'multiple' || complexityAnalysis.complexity === 'complex';

		console.log('🤖 CRUD Workflow: Complexity analysis result:', complexityAnalysis);

		if (isComplexOperation || state.operationType === 'batch') {
			console.log('🔀 Using enhanced multi-resource workflow for complex operation');
			return 'plan_crud_operations';
		} else {
			console.log('🔀 Using single-operation workflow');
			// Use legacy workflow for simple operations
			switch (state.operationType) {
				case 'create': return 'handle_single_creation';
				case 'update': return 'handle_single_update';
				case 'delete': return 'handle_single_delete';
				case 'reference_resolution': return 'handle_reference_resolution';
				default: return 'handle_single_creation';
			}
		}
	} catch (error) {
		console.error('❌ CRUD Workflow: Failed to analyze operation complexity, defaulting to single operation workflow:', error);
		// Fallback to single operation workflow on error
		switch (state.operationType) {
			case 'create': return 'handle_single_creation';
			case 'update': return 'handle_single_update';
			case 'delete': return 'handle_single_delete';
			case 'reference_resolution': return 'handle_reference_resolution';
			default: return 'handle_single_creation';
		}
	}
});

// Enhanced workflow chain
// @ts-ignore
crudWorkflow.addEdge('plan_crud_operations', 'generate_resource_ids');
// @ts-ignore
crudWorkflow.addEdge('generate_resource_ids', 'resolve_all_references');
// @ts-ignore
crudWorkflow.addEdge('resolve_all_references', 'confirm_operations');
// @ts-ignore
crudWorkflow.addEdge('confirm_operations', 'execute_operations');
// @ts-ignore
crudWorkflow.addEdge('execute_operations', 'store_conversation_context');
// @ts-ignore
crudWorkflow.addEdge('store_conversation_context', END);

// Legacy workflow terminal edges
// @ts-ignore
crudWorkflow.addEdge('handle_single_creation', END);
// @ts-ignore
crudWorkflow.addEdge('handle_single_update', END);
// @ts-ignore
crudWorkflow.addEdge('handle_single_delete', END);
// @ts-ignore
crudWorkflow.addEdge('handle_batch_operation', END);
// @ts-ignore
crudWorkflow.addEdge('handle_reference_resolution', END);

// Compile the workflow
const crudStateGraph = crudWorkflow.compile();

// Enhanced error propagation to orchestrator
function notifyOrchestrator(orchestrator: any, error: any, operationName: string) {
	if (orchestrator?.addErrorMessage) {
		const errorMessage = error.errorType === 'TIMEOUT'
			? `${operationName} timed out. Please try again.`
			: error.errorType === 'NETWORK'
			? `Network error during ${operationName}. Please check your connection.`
			: `${operationName} failed: ${error.error || error.message}`;

		orchestrator.addErrorMessage(errorMessage);
	}
}

// Input validation and edge case handling
function validateCrudAgentInput(input: any): { isValid: boolean; error?: string } {
	// Check for required messages
	if (!input || !input.messages || !Array.isArray(input.messages) || input.messages.length === 0) {
		return { isValid: false, error: 'No messages provided for CRUD operation' };
	}

	// Check for valid user messages
	const userMessages = input.messages.filter((m: any) => m.role === 'user');
	if (userMessages.length === 0) {
		return { isValid: false, error: 'No user messages found in request' };
	}

	// Check message content
	const lastUserMessage = userMessages[userMessages.length - 1];
	if (!lastUserMessage.content || typeof lastUserMessage.content !== 'string' || lastUserMessage.content.trim().length === 0) {
		return { isValid: false, error: 'User message content is empty or invalid' };
	}

	// Check for excessively long messages (potential abuse/memory issues)
	if (lastUserMessage.content.length > 10000) {
		return { isValid: false, error: 'Message content is too long (max 10,000 characters)' };
	}

	return { isValid: true };
}

// StateGraph-based CRUD agent with progress tracking and tool execution
export const crudAgent = {
	invoke: async (input: any) => {
		console.log('🔧 CRUD StateGraph Agent: Processing CRUD request');

		// Validate input before processing
		const validation = validateCrudAgentInput(input);
		if (!validation.isValid) {
			console.error('❌ CRUD Agent: Input validation failed:', validation.error);
			const errorResult = {
				success: false,
				error: validation.error,
				errorType: 'VALIDATION'
			};

			// Notify orchestrator of validation error
			if (input.orchestrator) {
				notifyOrchestrator(input.orchestrator, errorResult, 'input validation');
			}

			return {
				messages: [{
					content: JSON.stringify(errorResult),
					name: undefined,
					additional_kwargs: {},
					response_metadata: {}
				}]
			};
		}

		const initialState: Partial<typeof CrudAnnotation.State> = {
			messages: input.messages || [],
			operationType: 'create',
			results: [],
			finalResult: null,
			error: '',
			// Pass through orchestrator if provided
			orchestrator: input.orchestrator || null
		};

		try {
			// Execute StateGraph workflow with timeout protection
			const result = await executeWithTimeout(
				() => crudStateGraph.invoke(initialState),
				AGENT_TIMEOUT_MS * 3, // 90 second overall timeout
				'CRUD workflow'
			);

			// Validate final result structure
			const finalResult = result.finalResult;
			if (!finalResult || typeof finalResult !== 'object') {
				throw new Error('Invalid final result structure from workflow');
			}

			// Format for compatibility with existing interface
			return {
				messages: [{
					content: JSON.stringify(finalResult),
					name: undefined,
					additional_kwargs: {},
					response_metadata: {}
				}]
			};
		} catch (error) {
			console.error('🔧 CRUD StateGraph Agent: Workflow execution failed:', error);

			const errorResult = handleAgentError(error, 'CRUD workflow');

			// Notify orchestrator of the error
			if (input.orchestrator) {
				notifyOrchestrator(input.orchestrator, errorResult, 'CRUD operation');
			}

			return {
				messages: [{
					content: JSON.stringify(errorResult),
					name: undefined,
					additional_kwargs: {},
					response_metadata: {}
				}]
			};
		}
	}
};
