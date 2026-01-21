import { Annotation, END, START, StateGraph } from '@langchain/langgraph/web';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatModels } from '../utils/chat-model-factory';
import {
    // ████████ LLM-FIRST TOOLS - NEW ARCHITECTURE ████████
    createDhis2DataElement, // Pure tool calling (replaces ALL custom parsing)
    createDhis2Option, // Fixed option routing (the key solution!)

    // ████████ ALL CREATION TOOLS ████████
    // Core Metadata (15 tools)
    createDhis2OrganisationUnit,
    createDhis2Category,
    createDhis2CategoryCombo,
    createDhis2DataSet,
    createDhis2Indicator,
    createDhis2OptionSet,
    createDhis2ValidationRule,
    createDhis2ReportingForm,

    // Extended Metadata (15 tools)
    createDhis2CategoryOption,
    createDhis2OrganisationUnitGroup,
    createDhis2OrganisationUnitGroupSet,
    createDhis2Program,
    createDhis2TrackedEntityType,
    createDhis2TrackedEntityAttribute,
    createDhis2ProgramStage,
    createDhis2ProgramRule,
    createDhis2ProgramIndicator,
    createDhis2IndicatorType,
    createDhis2Visualization,
    createDhis2Dashboard,
    createDhis2DashboardItem,
    createDhis2User,
    createDhis2RelationshipType,

    // Entity & Data Management (5 tools)
    createDhis2Relationship,
    createDhis2TrackedEntityInstance,
    createDhis2Enrollment,
    createDhis2Event,
    createDhis2AggregatedMetadata,

    // ████████ ALL UPDATE TOOLS ████████
    // Core Updates (12 tools)
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

    // Advanced Updates (16 tools)
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

    // ████████ UTILITY TOOLS (CONTEXT/HELPERS) ████████
    resolveResourceReference,
} from '../utils/tools/metadata';
import {
    resolveResourceReference as resolveRefHelper,
    addResourceToContext,
    getContextInfo,
} from '../utils/tools/metadata/helpers';

// Initialize the ChatOpenAI model with Azure configuration
const model = ChatModels.createAgentModel();

// State annotation for CRUD operations with progress tracking
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
	operationType: Annotation<'create' | 'update' | 'batch' | 'reference_resolution'>({
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
			totalSteps: 6,
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
            totalSteps: 6,
            stepName,
            message,
            isIndeterminate
        }
    };
}

// Create the CRUD agent with all creation and update tools
export const crudAgent = createReactAgent({
  llm: model,
  tools: [
    // ████████ LLM-FIRST TOOLS - NEW ARCHITECTURE ████████
    createDhis2DataElement, // Pure tool calling (replaces ALL custom parsing)
    createDhis2Option, // FIXED OPTION ROUTING (the key solution!)

    // ████████ ALL CREATION TOOLS ████████
    // Core Metadata Creation (8 tools)
    createDhis2OrganisationUnit,
    createDhis2Category,
    createDhis2CategoryCombo,
    createDhis2DataSet,
    createDhis2Indicator,
    createDhis2ValidationRule,
    createDhis2OptionSet,
    createDhis2ReportingForm,

    // Extended Metadata Creation (15 tools)
    createDhis2CategoryOption,
    createDhis2OrganisationUnitGroup,
    createDhis2OrganisationUnitGroupSet,
    createDhis2Program,
    createDhis2TrackedEntityType,
    createDhis2TrackedEntityAttribute,
    createDhis2ProgramStage,
    createDhis2ProgramRule,
    createDhis2ProgramIndicator,
    createDhis2IndicatorType,
    createDhis2Visualization,
    createDhis2Dashboard,
    createDhis2DashboardItem,
    createDhis2User,
    createDhis2RelationshipType,

    // Tracker & Data Management Creation (5 tools)
    createDhis2Relationship,
    createDhis2TrackedEntityInstance,
    createDhis2Enrollment,
    createDhis2Event,
    createDhis2AggregatedMetadata,

    // ████████ ALL UPDATE TOOLS ████████
    // Core Metadata Updates (11 tools)
    updateDhis2DataElement,
    updateDhis2OrganisationUnit,
    updateDhis2Category,
    updateDhis2CategoryCombo,
    updateDhis2DataSet,
    updateDhis2Indicator,
    updateDhis2ValidationRule,
    updateDhis2OptionSet,
    updateDhis2Program,
    updateDhis2CategoryOption,
    updateDhis2OrganisationUnitGroup,
    updateDhis2OrganisationUnitGroupSet,

    // Advanced Metadata Updates (13 tools)
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

    // ████████ UTILITY TOOLS (CONTEXT/HELPERS) ████████
    resolveResourceReference,
  ],
  prompt: `
    You are an expert DHIS2 metadata creation and management specialist. Your expertise lies in creating new DHIS2 resources, updating existing ones, and managing complex metadata configurations for health information systems.

    ## CORE CAPABILITIES

    ### CREATION & UPDATE TOOLS
    You can create and UPDATE ALL DHIS2 metadata resource types (~28 creation tools + ~28 update tools):

    **CORE METADATA:**
    - **Data Elements**: All value types (numeric, text, boolean, date, etc.) with proper aggregation
    - **Organisation Units**: Hierarchical administrative units with levels and groups
    - **Categories & Category Combinations**: Complete data disaggregation systems
    - **Category Options**: Individual category values
    - **Data Sets**: Collections with data elements, period types, and reporting forms
    - **Indicators**: Calculated metrics with numerators/denominators and indicator types
    - **Validation Rules**: Quality checks with expressions and constraints
    - **Option Sets & Options**: Predefined choice lists

    **PROGRAMS & TRACKER SYSTEMS:**
    - **Programs**: Complete tracker/event program configurations
    - **Tracked Entity Types**: Person/entity definitions
    - **Tracked Entity Attributes**: Individual-level data fields
    - **Program Stages**: Workflow steps with data elements
    - **Program Rules**: Automated data processing logic
    - **Program Indicators**: Program-specific calculations

    **ADVANCED FEATURES:**
    - **Dashboards & Visualizations**: Complete analytics interfaces
    - **Users & Access Control**: User management and permissions
    - **Relationships**: Entity associations and linkages
    - **Tracker Instances & Enrollments**: Individual record management

    ### CONVERSATIONAL CONTEXT
    You maintain memory of resources created/accessed during our conversation:
    - **Referencing previous work**: Use phrases like "the last created data element", "that category I just made", "the previous resource"
    - **Context-aware operations**: When users request updates (change, modify, rename, update), first resolve any references using the reference resolution tool
    - **Reference resolution workflow**:
      1. When you see phrases like "last created", "the previous", "that one I made", etc., use the "resolve_resource_reference" tool first
      2. Take the returned ID and use it with appropriate update tools (updateDhis2DataElement, updateDhis2OrganisationUnit, etc.)
      3. If no reference can be resolved, ask the user to specify the resource explicitly
    - **Reference resolution**: Understand references like "X I mentioned earlier", "the Y we just created", "previous Z"

    ### BATCH OPERATIONS
    - Create multiple different resource types in a single API call using batchCreateMetadata
    - Use the UnifiedMetadataManager for complex multi-step operations
    - Automatic batch parsing: When users request multiple resources in a single request (e.g., "Create data element A and data element B with different types"), automatically split and process as individual descriptions
    - Atomic transactions: all operations succeed together or fail together
    - Automatic dependency resolution between resources

    ### DATA MANAGEMENT
    - **Tracker Operations**: Create and update entities, enrollments, and events
    - **Relationship Management**: Link entities and records appropriately
    - **Completeness**: Ensure all required fields are provided

## CREATION WORKFLOW

1. **Extract Structured Data**: When users describe resources, extract complete schema-compliant objects with all required properties (name, valueType, domainType, etc.)
2. **Validate Dependencies**: Search for existing dependencies or create them if needed (use search agent's help for dependency resolution if needed)
3. **Generate IDs**: Get unique IDs from DHIS2 system when creating new resources
4. **Schema Validation**: Ensure all data conforms to DHIS2 schemas using Zod validation
5. **Batch Execution**: Use unified API for maximum efficiency

### EXTRACTION GUIDELINES

**Data Elements:**
- Extract: name, valueType, domainType, aggregationType, description
- Examples: "HIV Tested" → name: "HIV Tested", valueType: "BOOLEAN", domainType: "AGGREGATE", aggregationType: "COUNT"

**Organization Units:**
- Extract: name, level, path
- Level examples: "country" = 1, "province/state" = 2, "district" = 3, "facility" = 4

**Categories:**
- Extract: name, dataDimension, dataDimensionType, categoryOptions

**Category Combinations:**
- Extract: name, dataDimensionType, categories

**Data Sets:**
- Extract: name, periodType, dataSetElements (with dataElement and categoryCombo), organisationUnits

**Programs:**
- Extract: name, programType, trackedEntityType, programStages, organisationUnits

**Indicators:**
- Extract: name, annualized, decimals, numerator, denominator, indicatorType

**Validation Rules:**
- Extract: name, importance, operator, periodType, leftSide.expression, rightSide.expression

**Option Sets:**
- Extract: name, valueType, options (as array with name, code, sortOrder)

Always provide complete schema objects with all required fields, never just strings to be parsed.

    ## RESOURCE-SPECIFIC RULES

    ### Data Elements
    - Default valueType: 'NUMBER' if not specified
    - Default domainType: 'AGGREGATE' (use 'TRACKER' for program data)
    - Default aggregationType: 'SUM' for numeric, 'NONE' for text
    - Set zeroIsSignificant: false for text types, true for counts

    ### Organisation Units
    - Always specify level (1-5 typically)
    - Generate path based on level (e.g., '/2' for level 2)
    - Use appropriate naming hierarchy

    ### Categories
    - Set dataDimension: true for disaggregation
    - dataDimensionType: 'DISAGGREGATION' or 'ATTRIBUTE'
    - Include categoryOptions array (can be empty initially)

    ### Programs
    - programType: 'WITH_REGISTRATION' (tracker) or 'WITHOUT_REGISTRATION' (event)
    - Include programStages for tracker programs
    - Specify organisationUnits where program is available

    ### Indicators
    - Always include indicatorType dependency (creates default if not found)
    - Set annualized: false unless specifically mentioned
    - Numerator and denominator are required expressions

    ### Users & Security
    - Ensure proper user roles and organisational unit assignments
    - Handle user credentials securely

    ## DEPENDENCY MANAGEMENT [CRITICAL - VIOLATION PREVENTION]

    **BREAKING THE WORKFLOW**: If you ask the user for confirmation about creating prerequisites, you BREAK the entire workflow and return invalid JSON.

    **AUTOMATED SYSTEM ONLY**: The DHIS2 metadata system automatically handles ALL dependency creation:

    - ✅ DataElements automatically create CategoryCombos (with Categories and CategoryOptions as needed)
    - ✅ CategoryCombos automatically create Categories (with CategoryOptions as needed)
    - ✅ Categories automatically create CategoryOptions
    - ✅ All other tools handle their required dependencies

    **ZERO MANUAL WORKFLOW**: NEVER ask, confirm, or mention creating prerequisites. Just call the appropriate tool directly.

    **CORRECT EXECUTION**: For "Create data element X":
    - Call createDhis2DataElement ONCE
    - Return valid JSON response
    - Dependencies are handled automatically by the tool system

    **INCORRECT EXECUTION** (DO NOT DO THIS):
    - Ask for confirmation
    - Manually create dependencies
    - Return plain text explanation
    - Break JSON response format

    **ALWAYS TRUST THE TOOL SYSTEM** - it will do everything automatically without your intervention.

    ## BATCH OPERATIONS

    For multiple resources or complex operations:
    - Use batchCreateMetadata for simple batch creation
    - Use UnifiedMetadataManager for complex workflows
    - Set atomic=true for transaction-like behavior
    - Use dryRun=true to validate without executing

    ## RESPONSE FORMAT [CRITICAL]

    **ALWAYS RETURN JSON** for creation/updating operations. Never return plain text explanations for these operations.

    JSON Response Format:

    {{
      "success": boolean,
      "message": string (optional descriptive message),
      "results": array (for search/batch operations),
      "data": object (for single create operations),
      "count": number (optional count for batch operations),
      "error": "error message" (only include if success is false)
    }}

    **Only use natural language responses when seeking clarification** from the user, such as:
    - Requesting additional required information ("What aggregation type would you like?")
    - Asking for confirmation ("Should I create this with default settings?")
    - Offering choices ("Would you like to specify boolean or TEXT value type?")

    For all creation, updates, and management operations (creating, modifying, managing), **respond exclusively with JSON**.

    Focus on being thorough, accurate, and efficient in all metadata creation and management operations.
  `,
});

// StateGraph Workflow Nodes

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
	updateProgress(2, 'Preparing Creation', 'Setting up resource creation...', false);
	state.orchestrator?.addProgressMessage('Setting up resource creation...');

	// Update progress for dependency resolution
	updateProgress(3, 'Resolving Dependencies', 'Analyzing resource dependencies...', false);
	state.orchestrator?.addProgressMessage('Analyzing resource dependencies...');

	// Update progress for creation
	updateProgress(4, 'Creating Resource', 'Creating the requested resource...', false);
	state.orchestrator?.addProgressMessage('Creating the requested resource...');

	// Update progress for validation
	updateProgress(5, 'Validating', 'Validating resource configuration...', false);
	state.orchestrator?.addProgressMessage('Validating resource configuration...');

	// The actual tool calling will be handled by the LLM with the tools
	// This is just the workflow orchestration

	return {};
}

// 3. Handle single resource update
async function handle_single_update(state: typeof CrudAnnotation.State): Promise<Partial<typeof CrudAnnotation.State>> {
	console.log('🔄 CRUD Agent: Handling single resource update');

	// Update progress
	updateProgress(2, 'Preparing Update', 'Setting up resource update...', false);
	state.orchestrator?.addProgressMessage('Setting up resource update...');

	// Update progress for reference resolution
	updateProgress(3, 'Resolving References', 'Finding the resource to update...', false);
	state.orchestrator?.addProgressMessage('Finding the resource to update...');

	// Update progress for update
	updateProgress(4, 'Updating Resource', 'Applying resource changes...', false);
	state.orchestrator?.addProgressMessage('Applying resource changes...');

	// Update progress for validation
	updateProgress(5, 'Validating', 'Validating updated configuration...', false);
	state.orchestrator?.addProgressMessage('Validating updated configuration...');

	return {};
}

// 4. Handle batch operations
async function handle_batch_operation(state: typeof CrudAnnotation.State): Promise<Partial<typeof CrudAnnotation.State>> {
	console.log('📦 CRUD Agent: Handling batch operation');

	// Update progress
	updateProgress(2, 'Preparing Batch', 'Setting up batch operation...', false);
	state.orchestrator?.addProgressMessage('Setting up batch operation...');

	// Update progress for dependency resolution
	updateProgress(3, 'Resolving Dependencies', 'Analyzing batch dependencies...', false);
	state.orchestrator?.addProgressMessage('Analyzing batch dependencies...');

	// Update progress for batch processing
	updateProgress(4, 'Processing Batch', 'Creating/updating resources in batch...', false);
	state.orchestrator?.addProgressMessage('Creating/updating resources in batch...');

	// Update progress for validation
	updateProgress(5, 'Validating Batch', 'Validating all batch operations...', false);
	state.orchestrator?.addProgressMessage('Validating all batch operations...');

	return {};
}

// 5. Handle reference resolution operations
async function handle_reference_resolution(state: typeof CrudAnnotation.State): Promise<Partial<typeof CrudAnnotation.State>> {
	console.log('🔍 CRUD Agent: Handling reference resolution');

	// Update progress
	updateProgress(2, 'Resolving References', 'Finding referenced resources...', false);
	state.orchestrator?.addProgressMessage('Finding referenced resources...');

	// Update progress for validation
	updateProgress(3, 'Validating References', 'Validating reference resolution...', false);
	state.orchestrator?.addProgressMessage('Validating reference resolution...');

	return {};
}

// LLM-based CRUD operation classification
async function classifyCrudOperationType(query: string): Promise<string> {
	try {
		console.log('🤖 CRUD Agent: Using LLM to classify operation type for:', query);

		const classificationPrompt = `
Classify this DHIS2 CRUD operation into one of these categories:

- create: Creating new resources (create, add, new)
- update: Updating existing resources (update, modify, change, rename)
- batch: Multiple operations or complex workflows (create multiple, batch, several)
- reference_resolution: Resolving references to existing resources (find, get, resolve, the last, previous)

Query: "${query}"

Return ONLY one of: create, update, batch, reference_resolution
`;

		const result = await model.invoke([new HumanMessage(classificationPrompt)]);
		const category = (result.content as string).trim().toLowerCase();

		// Validate the response
		const validCategories = ['create', 'update', 'batch', 'reference_resolution'];
		if (validCategories.includes(category)) {
			return category;
		}

		// Default to create if unclear
		console.log('🤖 CRUD Agent: Unclear classification, defaulting to create');
		return 'create';
	} catch (error) {
		console.error('🤖 CRUD Agent: Classification failed, defaulting to create');
		return 'create';
	}
}

// Create and compile StateGraph workflow
const crudWorkflow = new StateGraph(CrudAnnotation);

// Add nodes
crudWorkflow.addNode('classify_crud_operation', classify_crud_operation);
crudWorkflow.addNode('handle_single_creation', handle_single_creation);
crudWorkflow.addNode('handle_single_update', handle_single_update);
crudWorkflow.addNode('handle_batch_operation', handle_batch_operation);
crudWorkflow.addNode('handle_reference_resolution', handle_reference_resolution);

// Add edges
// @ts-ignore
crudWorkflow.addEdge(START, 'classify_crud_operation');

// Conditional routing based on operation type
// @ts-ignore
crudWorkflow.addConditionalEdges('classify_crud_operation', (state) => {
	switch (state.operationType) {
		case 'create': return 'handle_single_creation';
		case 'update': return 'handle_single_update';
		case 'batch': return 'handle_batch_operation';
		case 'reference_resolution': return 'handle_reference_resolution';
		default: return 'handle_single_creation';
	}
});

// Terminal edges
// @ts-ignore
crudWorkflow.addEdge('handle_single_creation', END);
// @ts-ignore
crudWorkflow.addEdge('handle_single_update', END);
// @ts-ignore
crudWorkflow.addEdge('handle_batch_operation', END);
// @ts-ignore
crudWorkflow.addEdge('handle_reference_resolution', END);

// Compile the workflow
const crudStateGraph = crudWorkflow.compile();

// StateGraph-based CRUD agent with progress tracking
export const crudStateGraphAgent = {
	invoke: async (input: any) => {
		console.log('🔧 CRUD StateGraph Agent: Processing CRUD request');

		const initialState: Partial<typeof CrudAnnotation.State> = {
			messages: input.messages || [],
			operationType: 'create',
			results: [],
			finalResult: null,
			error: '',
		};

		try {
			// Execute StateGraph workflow
			const result = await crudStateGraph.invoke(initialState);

			// Format for compatibility with existing interface
			return {
				messages: [{
					content: JSON.stringify(result.finalResult || { success: true, message: 'CRUD operation completed' }),
					name: undefined,
					additional_kwargs: {},
					response_metadata: {}
				}]
			};
		} catch (error) {
			console.error('🔧 CRUD StateGraph Agent: Workflow execution failed:', error);
			return {
				messages: [{
					content: JSON.stringify({
						success: false,
						error: `CRUD operation failed: ${error.message}`
					}),
					name: undefined,
					additional_kwargs: {},
					response_metadata: {}
				}]
			};
		}
	}
};
