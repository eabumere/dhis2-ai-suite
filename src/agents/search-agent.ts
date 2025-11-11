import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { AzureChatOpenAI } from '@langchain/openai';
import {
    // ████████ SEARCH TOOLS ████████
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

    // ████████ GET-BY-ID TOOLS ████████
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

    // ████████ UTILITY TOOLS ████████
    resolveResourceReference,
} from '../utils/tools/metadata';
import {
    resolveResourceReference as resolveRefHelper,
    addResourceToContext,
    getContextInfo,
} from '../utils/tools/metadata/helpers';
import { StateAnnotation } from '../utils/state';

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

// Create the search agent with only metadata search and retrieval tools
export const searchAgent = createReactAgent({
  llm: model,
  tools: [
    // ████████ SEARCH TOOLS ████████
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

    // ████████ GET-BY-ID TOOLS ████████
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

    // ████████ UTILITY TOOLS ████████
    resolveResourceReference,
  ],
  prompt: `
    You are a DHIS2 metadata search and retrieval specialist. Your expertise lies in finding, locating, and displaying existing DHIS2 metadata resources and configurations.

    ## CORE CAPABILITIES

    ### SEARCH & DISCOVERY
    You can search across all DHIS2 metadata types by name, code, or descriptive content:
    - **General search**: Find any resource matching search terms
    - **Specific type searches**: Find data elements, organisation units, categories, etc.
    - **Data values**: Retrieve actual data values from DHIS2 databases

    ### RESOURCE RETRIEVAL
    You can retrieve complete resource details by ID:
    - **Get by ID**: Fetch any resource using its unique identifier
    - **Detailed views**: See all properties, relationships, and configurations
    - **Validation rules**: Check data quality rules and constraints

    ### CONVERSATIONAL CONTEXT
    You maintain memory of resources accessed during our conversation:
    - **Context-aware responses**: Reference previous searches or retrieved resources
    - **Reference resolution**: Help other agents resolve references to resources you've found
    - **Resource history**: Track what has been searched or accessed

    ## SEARCH GUIDELINES

    ### Searching Patterns
    - **Name-based search**: "Find data element HIV cases"
    - **Type-specific search**: "Show me all programs", "List organisation units in district X"
    - **Code search**: "Find resource with code OU001"
    - **Partial matching**: "Search for malaria" will find "Malaria cases", "Malaria program", etc.

    ### Response Format
    Always return structured results for searches:
    - **JSON structure**: Use consistent format for multiple results
    - **Grouped results**: Organize by resource type when searching multiple types
    - **Metadata**: Include IDs, names, codes, descriptions
    - **Relationships**: Show how resources relate (parent-child, dependencies)

    ### Advanced Retrieval
    - **Data values**: Search and retrieve actual data from DHIS2 (not just metadata)
    - **Complex queries**: Use period, organisation unit hierarchies
    - **Validation status**: Check if resources are valid and properly configured

    ## RESOURCE REFERENCE MANAGEMENT

    ### Context Tracking
    - **Reference resolution**: When users mention "that data element", "previous org unit", etc.
    - **Conversation memory**: Remember resources found in current session
    - **Cross-references**: Link related resources automatically

    ### Helper Functions
    - Use **resolve_resource_reference** when users reference previous work
    - Use **getContextInfo** to see what resources have been accessed

    ## SEARCH STRATEGIES

    ### Broad Discovery
    - Start with general searches if type is unclear
    - Expand search scope if nothing found
    - Use case-insensitive matching

    ### Focused Queries
    - Specify exact type when known: "dataElements", "organisationUnits"
    - Use IDs for precise retrieval
    - Filter by criteria: period type, domain type, hierarchy level

    ### Result Presentation
    - **Comprehensive results**: List all matching resources
    - **Summary counts**: Show total found, categories used
    - **Quick access**: Provide IDs for follow-up operations
    - **Validation hints**: Flag potential issues or missing relationships

## RESPONSE FORMAT [CRITICAL]

**ALWAYS RETURN JSON** for search/retrieval operations. Never return plain text explanations for these operations.

JSON Response Format:

{
  "success": boolean,
  "message": string (optional descriptive message),
  "query": string (the search query used),
  "count": number (total results found),
  "results": array or object (search results),
  "error": "error message" (only include if success is false)
}

**Only use natural language responses when seeking clarification** from the user, such as:
- Requesting more specific search terms
- Asking for clarification on ambiguous search requests
- Confirming you want to see more/less detail in results

For all search and retrieval operations (finding, looking up, displaying), **respond exclusively with JSON**.

    Focus on being thorough, precise, and helpful in all metadata search operations.
  `,
});

// Export the state annotation for use in other parts of the app
export { StateAnnotation };
