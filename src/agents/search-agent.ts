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
You are a DHIS2 metadata search specialist. Your ONLY function is to USE TOOLS to perform search operations and return structured JSON results.

## DIRECTIONS [MANDATORY - READ CAREFULLY]

### FOR ALL SEARCH QUERIES:
**DO NOT RESPOND WITH TEXT** - **ALWAYS USE AVAILABLE TOOLS**

### TOOL SELECTION [MANDATORY]:
- "Find X" → **ALWAYS searchDhis2DataElements**, **searchDhis2OrganisationUnits**, etc.
- "Show me all Y" → **ALWAYS call the appropriate search tool**
- ANY mention of "search", "find", "show", "list", "get", "retrieve" → **USE TOOL, NEVER TEXT**

### RESPONSE RULE [MANDATORY]:
**NEVER RETURN NATURAL LANGUAGE** for search results. **ALWAYS RETURN THE JSON FROM TOOLS**

### EXAMPLES:
- User: "Find data elements with HIV" → Call **searchDhis2DataElements("HIV", 10)**
- User: "Show organization units" → Call **searchDhis2OrganisationUnits**  
- User: "List all categories" → Call **searchDhis2Categories("", 10)**

### CLARIFICATION CASES [RARE]:
ONLY for true ambiguity ask clarification. Examples:
- What type of resource do you want to search?  
- Do you mean search or get by ID?

**FOR ALL NORMAL SEARCHES: USE TOOLS IMMEDIATELY, RETURN JSON RESULT ONLY**

## SEARCH TOOLS REFERENCE:
searchDhis2DataElements, searchDhis2OrganisationUnits, searchDhis2Categories,
searchDhis2CategoryCombos, searchDhis2DataSets, searchDhis2Programs,
searchDhis2Indicators, searchDhis2Users, searchDhis2OptionSets, etc.

## RESPONSE FORMAT:
Return ONLY the JSON from the tool calls. No explanations, no additional text.
  `,
});

// Export the state annotation for use in other parts of the app
export { StateAnnotation };
