import { Annotation, END, START, StateGraph } from '@langchain/langgraph/web';
import { ChatModels } from '../utils/chat-model-factory';
import { Dhis2Api } from '../utils/app-runtime/dhis2-api';
import { METADATA_TYPE_SCHEMAS, searchDhis2Metadata } from '../utils/tools/metadata/helpers';

// Import update tools
import {
	// ████████ ALL UPDATE TOOLS ████████
	// Core Updates (11 tools)
	updateDhis2DataElement,
	updateDhis2OrganisationUnit,
	updateDhis2Category,
	updateDhis2CategoryCombo,
	updateDhis2DataSet,
	updateDhis2Indicator,
	updateDhis2OptionSet,
	updateDhis2ValidationRule,
	updateDhis2Program,
	updateDhis2CategoryOption,
	updateDhis2OrganisationUnitGroup,
	updateDhis2OrganisationUnitGroupSet,

	// Advanced Updates (13 tools)
	updateDhis2ProgramStage,
	updateDhis2ProgramRule,
	updateDhis2ProgramIndicator,
	updateDhis2IndicatorType,
	updateDhis2TrackedEntityType,
	updateDhis2TrackedEntityAttribute,
	updateDhis2TrackedEntityInstance,
	updateDhis2Visualization,
	updateDhis2Dashboard,
	updateDhis2DashboardItem,
	updateDhis2User,
	updateDhis2RelationshipType,
	updateDhis2Relationship,
	updateDhis2Enrollment,
	updateDhis2Event,

	// ████████ ENHANCED UPDATE TOOLS ████████
	updateDhis2Resource,

	// ████████ UTILITY TOOLS (CONTEXT/HELPERS) ████████
	resolveResourceReference,
} from '../utils/tools/metadata';

// Initialize the ChatOpenAI model with Azure configuration and retry logic for rate limiting
const model = ChatModels.createAgentModelWithRetry();

// Define the state using Annotation API (as per LangGraph official docs)
const UpdateGraphAnnotation = Annotation.Root({
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

	// Update workflow state
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
	fullResource: Annotation<any>({
		reducer: (left, right) => right,
		default: () => null,
	}),
	updateResult: Annotation<any>({
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
			totalSteps: 6,
			stepName: 'Initializing',
			message: 'Preparing update workflow...',
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
function advanceProgress(state: typeof UpdateGraphAnnotation.State, step: number, stepName: string, message: string, isIndeterminate = false): void {
	// Update the workflow progress state
	const progressUpdate = {
		currentStep: step,
		totalSteps: 6,
		stepName,
		message,
		isIndeterminate
	};

	// Send progress message to orchestrator for UI display
	state.orchestrator?.addProgressMessage(message, {
		progress: step / 6 * 100, // Convert to percentage
		currentStep: step,
		totalSteps: 6,
		stepName,
		isIndeterminate,
		workflowId: state.workflowId
	});

	console.log(`📊 Update Progress: Step ${step}/6 - ${stepName}: ${message}`);
}

// Parse update request from user input
async function parseUpdateRequest(state: typeof UpdateGraphAnnotation.State): Promise<Partial<typeof UpdateGraphAnnotation.State>> {
	console.log('🔍 Parsing update request');

	advanceProgress(state, 1, 'Parsing Request', 'Analyzing your update request...', false);

	// Extract query from messages if not set
	const query = state.query || state.messages.filter(m => m.role === 'user').pop()?.content || '';

	// Use LLM to parse the update request
	const parsePrompt = `
Parse this DHIS2 update request and extract the key components.

REQUEST: "${query}"

Extract:
1. RESOURCE_TYPE: What type of DHIS2 resource to update (dataElements, organisationUnits, categories, dataSets, indicators, programs, etc.)
2. RESOURCE_NAME: The name of the resource to update
3. UPDATES: What properties to change (name, description, etc.)
4. CONFIRM_UPDATE: Whether this appears to be a confirmed update request

Examples:
"rename data set 'Monthly Summary' to 'Monthly Summary - TBA'" →
{
  "resourceType": "dataSets",
  "resourceName": "Monthly Summary",
  "updates": {"name": "Monthly Summary - TBA"},
  "confirmUpdate": true
}

"change the name of category 'Age Groups' to 'Age Categories'" →
{
  "resourceType": "categories",
  "resourceName": "Age Groups",
  "updates": {"name": "Age Categories"},
  "confirmUpdate": true
}

Return JSON only with: resourceType, resourceName, updates, confirmUpdate
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
		console.error('❌ Failed to parse update request:', error);
		return {
			error: `Failed to parse update request: ${error.message}`,
			step: 'completed',
			finalResult: {
				success: false,
				error: `Could not understand the update request: ${error.message}`,
				type: 'update'
			}
		};
	}
}

// Search for the resource to update
async function searchResource(state: typeof UpdateGraphAnnotation.State): Promise<Partial<typeof UpdateGraphAnnotation.State>> {
	console.log('🔍 Searching for resource to update');

	advanceProgress(state, 2, 'Finding Resource', 'Searching for the resource to update...', false);

	const { resourceType, resourceName, updates, confirmUpdate } = state.parsedRequest;

	try {
		// Call updateDhis2Resource tool to find the resource
		const searchResult = (await searchDhis2Metadata(resourceType, resourceName)).map(r => ({
			...r,
			type: resourceType
		}));

		console.log('🔍 Resource search result:', searchResult);

		return {
			resourceSearchResult: {
				selectorOptions: searchResult,
				action: searchResult.length > 1 ? 'SHOW_SELECTOR': ''
			},
			step: 'handle_search_result',
		};

	} catch (error) {
		console.error('❌ Resource search failed:', error);
		return {
			error: error.message,
			step: 'completed',
			finalResult: {
				success: false,
				error: `Failed to search for resource: ${error.message}`,
				type: 'update'
			}
		};
	}
}

// Comprehensive field selector mapping for efficient resource fetching
// Includes all necessary fields with object references limited to level 1
const RESOURCE_FIELD_SELECTORS: Record<string, string> = {
  // Data Elements
  'dataElements': 'id,name,displayName,shortName,code,valueType,domainType,aggregationType,categoryCombo[id],zeroIsSignificant,description,url',

  // Organisation Units
  'organisationUnits': 'id,name,displayName,shortName,code,level,path,openingDate',

  // Categories and Category Combos
  'categories': 'id,name,displayName,shortName,code,dataDimension,dataDimensionType,categoryOptions[id]',
  'categoryCombos': 'id,name,displayName,shortName,code,dataDimensionType,categories[id],categoryOptionCombos[id]',
  'categoryOptions': 'id,name,displayName,shortName,code,startDate,endDate',
  'categoryOptionCombos': 'id,name,displayName,code,categoryOptions[id],categoryCombo[id]',

  // Data Sets
  'dataSets': 'id,name,displayName,shortName,code,description,periodType,categoryCombo[id],dataSetElements[id],organisationUnits[id],sections[id],compulsoryDataElementOperands[id],expiryDays,timelyDays,openFuturePeriods,dataEntryForm[id]',

  // Programs and Program Stages
  'programs': 'id,name,displayName,shortName,code,description,version,programType,trackedEntityType[id],programStages[id],programRules[id],programIndicators[id],organisationUnits[id],categoryCombo[id],useFirstStageDuringRegistration,displayFrontPageList,onlyEnrollOnce,selectEnrollmentDatesInFuture,selectIncidentDatesInFuture,incidentDateLabel,enrollmentDateLabel',
  'programStages': 'id,name,displayName,shortName,code,description,program[id],sortOrder,repeatable,minDaysFromStart,generatedByEnrollmentDate,blockEntryForm,reportDateToUse,programStageDataElements[id],programStageSections[id],validationStrategy,executionDateLabel,dueDateLabel,allowGenerateNextVisit,openAfterEnrollment,remindCompleted',

  // Indicators
  'indicators': 'id,name,displayName,shortName,code,description,numerator,denominator,indicatorType[id],decimals,annualized',
  'indicatorTypes': 'id,name,displayName,factor,number',

  // Validation Rules
  'validationRules': 'id,name,displayName,description,instruction,importance,operator,leftSide,periodType,organisationUnitLevels',

  // Option Sets
  'optionSets': 'id,name,displayName,code,valueType,options[id]',

  // Tracker Program Components
  'trackedEntityTypes': 'id,name,displayName,shortName,code,description,trackedEntityTypeAttributes[id],allowAuditLog,minAttributesRequiredToSearch,maxTeiCountToReturn',
  'trackedEntityAttributes': 'id,name,displayName,shortName,code,description,valueType,unique,inherit,optionSet[id],pattern,confidential,aggregationType',

  // Visualizations and Dashboards
  'visualizations': 'id,name,displayName,type,dataDimensionItems[id],columns[id],rows[id],filters[id],organisationUnits[id],periods[id],created,lastUpdated',
  'dashboards': 'id,name,displayName,description,dashboardItems[id],created,lastUpdated,user[id],publicAccess,externalAccess,userAccesses[id],userGroupAccesses[id]',

  // Users
  'users': 'id,username,firstName,surname,email,phoneNumber,organisationUnits[id],userCredentials[id]',

  // Relationship Types
  'relationshipTypes': 'id,name,displayName,fromToName,toFromName,bidirectional',

  // Organisation Unit Groups
  'organisationUnitGroups': 'id,name,displayName,shortName,code,organisationUnits[id],symbol',
  'organisationUnitGroupSets': 'id,name,displayName,shortName,code,description,compulsory,dataDimension,organisationUnitGroups[id]',

  // Program Rules and Indicators
  'programRules': 'id,name,displayName,description,program[id],programStage[id],condition,priority,programRuleActions[id]',
  'programIndicators': 'id,name,displayName,shortName,code,description,program[id],expression,filter,aggregationType,analyticsType,displayInForm',

  // Default fallback for unmapped types
  'default': 'id,name,displayName,shortName,code,description'
};

// Utility function to get DHIS2 field selectors for efficient resource fetching
function constructFieldSelector(resourceType: string): string {
  // Return the predefined field selector for the resource type
  const fieldSelector = RESOURCE_FIELD_SELECTORS[resourceType];

  if (fieldSelector) {
    console.log(`📋 Using predefined field selector for ${resourceType}: ${fieldSelector}`);
    return fieldSelector;
  } else {
    console.warn(`No field selector defined for ${resourceType}, using default`);
    return RESOURCE_FIELD_SELECTORS['default'];
  }
}

// Fetch the full resource by ID for updating
async function fetchFullResource(state: typeof UpdateGraphAnnotation.State): Promise<Partial<typeof UpdateGraphAnnotation.State>> {
	console.log('📥 Fetching full resource');

	advanceProgress(state, 3, 'Fetching Resource', 'Retrieving complete resource data...', false);

	const selectedResource = state.selectedResource;

	try {
		// Construct schema-based field selector for efficient fetching
		const fieldSelector = constructFieldSelector(selectedResource.type);
		console.log(`📋 Using field selector for ${selectedResource.type}: ${fieldSelector}`);

		// Query for the full resource with optimized fields
		const result = await Dhis2Api.query({
			resource: {
				resource: `${selectedResource.type}/${selectedResource.id}`,
				params: {
					fields: fieldSelector
				}
			}
		});

		if (result.success && result.data?.resource) {
			console.log('✅ Full resource fetched:', result.data.resource);

			return {
				fullResource: result.data.resource,
				step: 'perform_update'
			};
		} else {
			throw new Error(`Failed to fetch resource: ${result.error || 'Unknown error'}`);
		}

	} catch (error) {
		console.error('❌ Failed to fetch full resource:', error);
		return {
			error: error.message,
			step: 'completed',
			finalResult: {
				success: false,
				error: `Failed to fetch resource data: ${error.message}`,
				type: 'update'
			}
		};
	}
}

// Handle the search result - either proceed with update or request selection
async function handleSearchResult(state: typeof UpdateGraphAnnotation.State): Promise<Partial<typeof UpdateGraphAnnotation.State>> {
	console.log('🎯 Handling search result');

	const result = state.resourceSearchResult;

	// Check if we have valid search results
	if (result.selectorOptions && result.selectorOptions.length > 0) {
		// Case 1: Multiple matches found - show selector
		if (result.action === 'SHOW_SELECTOR' && result.selectorOptions.length > 1) {
			console.log('⏸️ Multiple matches found, requesting user selection');

			advanceProgress(state, 4, 'User Selection', 'Multiple resources found, waiting for your selection...', true);

			if (!state.orchestrator) {
				console.error('No orchestrator available for selection');
				return {
					step: 'completed',
					finalResult: {
						success: false,
						message: 'Cannot request user selection - no orchestrator available',
						type: 'update'
					}
				};
			}

			try {
				// Transform selectorOptions to the format expected by requestSelection
				const selectionOptions = result.selectorOptions?.map((option: any) => ({
					name: option.name,
					id: option.id,
					type: option.type
				})) || [];

			// Request selection through orchestrator (single selection only, allowMultiple = false)
			const selectedItems = await state.orchestrator.requestSelection(state.workflowId, selectionOptions, false);
			
			// Safety validation: ensure only one item was selected (enforce single selection)
			if (selectedItems.length !== 1) {
				console.warn(`⚠️ Expected exactly 1 selected item, got ${selectedItems.length}`);
				
				// Fallback to first item if multiple somehow got selected
				if (selectedItems.length > 0) {
					console.log('▶️ Falling back to first selected item');
				} else {
					// Selection was cancelled
					return {
						step: 'completed',
						finalResult: {
							success: false,
							message: 'Resource selection was cancelled. No update performed.',
							type: 'update'
						}
					};
				}
			}
			
			const selectedItem = selectedItems[0];
			console.log('▶️ User selected resource:', selectedItem);

			if (selectedItem) {
					return {
						selectedResource: selectedItem,
						step: 'fetch_full_resource'
					};
				} else {
					// Selection was cancelled
					return {
						step: 'completed',
						finalResult: {
							success: false,
							message: 'Resource selection was cancelled. No update performed.',
							type: 'update'
						}
					};
				}
			} catch (selectionError) {
				console.warn('⏸️ Metadata selection failed, falling back:', selectionError.message);

				// Fallback: Auto-select the first option
				const autoSelected = result.selectorOptions[0];
				console.log('▶️ Auto-selected first resource due to selection failure:', autoSelected);

				return {
					selectedResource: autoSelected,
					step: 'fetch_full_resource'
				};
			}
		} 
		// Case 2: Exactly one match found - auto select and proceed directly
		else if (result.selectorOptions.length === 1) {
			console.log('✅ Single match found, auto-selecting resource:', result.selectorOptions[0]);
			
			return {
				selectedResource: result.selectorOptions[0],
				step: 'fetch_full_resource'
			};
		}
	}

	// Case 3: No matches found or invalid result
	console.log('❌ No resources found matching search query');
	return {
		step: 'finalize_result',
		finalResult: {
			success: false,
			message: 'No matching resources found to update.',
			type: 'update'
		}
	};
}

// Perform the actual update
async function performUpdate(state: typeof UpdateGraphAnnotation.State): Promise<Partial<typeof UpdateGraphAnnotation.State>> {
	console.log('🔄 Performing update');

	advanceProgress(state, 5, 'Updating Resource', 'Applying changes to the selected resource...', false);

	const selectedResource = state.selectedResource;
	const fullResource = state.fullResource;
	const { updates } = state.parsedRequest;

	console.log('Updating resource:', updates, selectedResource);

	try {
		// Merge updates into the full resource
		const updatedResource = { ...fullResource, ...updates };

		console.log(`🔄 Updating ${selectedResource}: ${selectedResource.id}`);

		// Call DHIS2 API directly to avoid schema validation issues
		const result = await Dhis2Api.mutate({
			resource: `${selectedResource.type}/${selectedResource.id}`,
			type: 'update',
			data: updatedResource
		});

		console.log('✅ Update API call completed:', result);

		// Format result to match expected updateResult structure
		const updateResult = {
			success: result.success,
			error: result.success ? null : (result.error || 'Unknown error'),
			data: result.success ? updatedResource : null,
			message: result.success ? 'Resource updated successfully' : `Update failed: ${result.error || 'Unknown error'}`,
			resourceType: selectedResource.type,
			resourceId: selectedResource.id
		};

		return {
			updateResult,
			step: 'finalize_result'
		};

	} catch (error) {
		console.error('❌ Update failed:', error);
		return {
			error: error.message,
			step: 'completed',
			finalResult: {
				success: false,
				error: `Failed to update resource: ${error.message}`,
				type: 'update'
			}
		};
	}
}

// Finalize and return the result
async function finalizeResult(state: typeof UpdateGraphAnnotation.State): Promise<Partial<typeof UpdateGraphAnnotation.State>> {
	console.log('🏁 Finalizing update result');

	advanceProgress(state, 6, 'Completing Update', 'Update operation completed.', false);

	// Check if we have a direct result from search or an update result
	let finalResult;

	if (state.updateResult) {
		// We performed an update after selection
		const updateResult = state.updateResult;
		finalResult = {
			success: updateResult.success,
			message: updateResult.success
				? `Successfully updated ${state.selectedResource.name}`
				: `Failed to update resource: ${updateResult.error}`,
			data: updateResult,
			type: 'update'
		};
	} else if (state.resourceSearchResult) {
		// Direct result from search (single match or error)
		const searchResult = state.resourceSearchResult;
		finalResult = {
			success: searchResult.success,
			message: searchResult.message,
			data: searchResult,
			type: 'update'
		};
	} else {
		// Fallback
		finalResult = {
			success: false,
			message: 'Update operation completed with unknown result',
			type: 'update'
		};
	}

	return {
		step: 'completed',
		finalResult
	};
}

// Create the StateGraph workflow
const workflow = new StateGraph(UpdateGraphAnnotation);

// Add nodes
workflow.addNode('parse_request', parseUpdateRequest);
workflow.addNode('search_resource', searchResource);
workflow.addNode('handle_search_result', handleSearchResult);
workflow.addNode('fetch_full_resource', fetchFullResource);
workflow.addNode('perform_update', performUpdate);
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
	if (state.step === 'fetch_full_resource') return 'fetch_full_resource';
	if (state.step === 'finalize_result') return 'finalize_result';
	return END;
});

// @ts-ignore
workflow.addEdge('fetch_full_resource', 'perform_update');
// @ts-ignore
workflow.addEdge('perform_update', 'finalize_result');
// @ts-ignore
workflow.addEdge('finalize_result', END);

// Compile the workflow
const updateStateGraph = workflow.compile();

// StateGraph-based update agent wrapper
export function createUpdateGraphAgent(orchestrator: any) {
	return {
		invoke: async (input: any) => {
			console.log('🔄 Update StateGraph: Processing update request');

			// Extract messages from input (handle workflow orchestrator structure)
			const messages = input.messages || input.input?.messages || [];
			const userMessages = messages?.filter((m: any) => m.role === 'user') || [];
			const lastUserMessage = userMessages[userMessages.length - 1];
			const originalQuery = lastUserMessage?.content || '';

			const initialState: Partial<typeof UpdateGraphAnnotation.State> = {
				messages: messages || [],
				query: originalQuery || '',
				orchestrator: orchestrator,
				workflowId: `update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
			};

			console.log('Initial update state', initialState);

			// Execute the StateGraph workflow
			const result = await updateStateGraph.invoke(initialState);

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

// The update agent is now only available through the workflow orchestrator
// Use workflowOrchestrator.getAgentFunction('update') to get the StateGraph version

export { updateStateGraph as updateGraphAgent, UpdateGraphAnnotation };
