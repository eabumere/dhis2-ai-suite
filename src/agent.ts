import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatModels } from './utils/chat-model-factory';
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

    // ████████ ALL SEARCH TOOLS ████████
    // Core Searches (7 tools)
    searchDhis2DataElements,
    searchDhis2OrganisationUnits,
    searchDhis2Categories,
    searchDhis2CategoryCombos,
    searchDhis2DataSets,
    searchDhis2Programs,
    searchDhis2Indicators,

    // Extended Searches (10 tools)
    searchDhis2CategoryOptions,
    searchDhis2OrganisationUnitGroups,
    searchDhis2OrganisationUnitGroupSets,
    searchDhis2TrackedEntityTypes,
    searchDhis2TrackedEntityAttributes,
    searchDhis2Validations,
    searchDhis2OptionSets,
    searchDhis2Visualizations,
    searchDhis2Dashboards,
    searchDhis2Users,
    searchDhis2RelationshipTypes,

    // ████████ ALL GET-BY-ID TOOLS ████████
    // Core Get-by-ID (5 tools)
    getDhis2DataElementById,
    getDhis2OrganisationUnitById,
    getDhis2CategoryById,
    getDhis2DataSetById,
    getDhis2ProgramById,

    // Extended Get-by-ID (8 tools)
    getDhis2CategoryOptionById,
    getDhis2OrganisationUnitGroupById,
    getDhis2OrganisationUnitGroupSetById,
    getDhis2TrackedEntityTypeById,
    getDhis2TrackedEntityAttributeById,
    getDhis2ValidationRuleById,
    getDhis2OptionSetById,
    getDhis2IndicatorById,
    getDhis2VisualizationById,
    getDhis2DashboardById,
    getDhis2RelationshipTypeById,

    // ████████ SPECIALIZED TOOLS ████████
    getDhis2DataValues,
} from './utils/tools/metadata';
import {
    resolveResourceReference,
    addResourceToContext,
    getContextInfo,
} from './utils/tools/metadata/helpers';
import { StateAnnotation } from './utils/state';

// Initialize the ChatOpenAI model with Azure configuration
const model = ChatModels.createAgentModel();

// Create the agent with all DHIS2 metadata tools
export const metadataAgent = createReactAgent({
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

    // ████████ ALL SEARCH TOOLS ████████
    // Core Metadata Searches (7 tools)
    searchDhis2DataElements,
    searchDhis2OrganisationUnits,
    searchDhis2Categories,
    searchDhis2CategoryCombos,
    searchDhis2DataSets,
    searchDhis2Programs,
    searchDhis2Indicators,

    // Extended Metadata Searches (10 tools)
    searchDhis2CategoryOptions,
    searchDhis2OrganisationUnitGroups,
    searchDhis2OrganisationUnitGroupSets,
    searchDhis2TrackedEntityTypes,
    searchDhis2TrackedEntityAttributes,
    searchDhis2Validations,
    searchDhis2OptionSets,
    searchDhis2Visualizations,
    searchDhis2Dashboards,
    searchDhis2Users,
    searchDhis2RelationshipTypes,

    // ████████ ALL GET-BY-ID TOOLS ████████
    // Core Metadata Get-by-ID (5 tools)
    getDhis2DataElementById,
    getDhis2OrganisationUnitById,
    getDhis2CategoryById,
    getDhis2DataSetById,
    getDhis2ProgramById,

    // Extended Metadata Get-by-ID (8 tools)
    getDhis2CategoryOptionById,
    getDhis2OrganisationUnitGroupById,
    getDhis2OrganisationUnitGroupSetById,
    getDhis2TrackedEntityTypeById,
    getDhis2TrackedEntityAttributeById,
    getDhis2ValidationRuleById,
    getDhis2OptionSetById,
    getDhis2IndicatorById,
    getDhis2VisualizationById,
    getDhis2DashboardById,
    getDhis2RelationshipTypeById,

    // ████████ SPECIALIZED TOOLS ████████
    getDhis2DataValues,

    // ████████ UTILITY TOOLS ████████
    resolveResourceReference,
  ],
  prompt: `
    You are an expert DHIS2 metadata management assistant with comprehensive capabilities for creating, searching, and managing all types of DHIS2 metadata resources.

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

    ### SEARCH & DISCOVERY
    - Search any metadata type by name (case-insensitive)
    - Find existing resources before creating new ones
    - Get detailed information about specific resources by ID

    ### BATCH OPERATIONS
    - Create multiple different resource types in a single API call using batchCreateMetadata
    - Use the UnifiedMetadataManager for complex multi-step operations
    - Automatic batch parsing: When users request multiple resources in a single request (e.g., "Create data element A and data element B with different types"), automatically split and process as individual descriptions
    - Atomic transactions: all operations succeed together or fail together
    - Automatic dependency resolution between resources

    ### BATCH REQUEST DETECTION
    When users make compound requests like:
    - "Create data element A with type number and data element B with type text"
    - "Add organization unit X and organization unit Y"
    - "1. data element Z, 2. data element W"

    Use the 'descriptions' array parameter instead of 'description' to ensure each resource gets parsed correctly.

## CREATION WORKFLOW

1. **Extract Structured Data**: When users describe resources, extract complete schema-compliant objects with all required properties (name, valueType, domainType, etc.)
2. **Validate Dependencies**: Search for existing dependencies or create them if needed
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

    ## ERROR HANDLING

    - Provide clear, actionable error messages
    - Explain which operations succeeded vs failed
    - Suggest fixes for validation errors
    - Handle partial failures in non-atomic operations

    ## PERFORMANCE OPTIMIZATION

    - Always prefer batch operations over individual API calls
    - Use search tools before creating to avoid duplicates
    - Validate data before API calls to prevent failures
    - Use appropriate import strategies (CREATE_UPDATE vs CREATE)

## RESPONSE FORMAT [CRITICAL]

**ALWAYS RETURN JSON** for creation/updating/search operations. Never return plain text explanations for these operations.

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

For all other operations (creation, updates, searches), **respond exclusively with JSON**.

    Focus on being helpful, accurate, and efficient in all metadata operations.
  `,
});

// Export the state annotation for use in other parts of the app
export { StateAnnotation };
