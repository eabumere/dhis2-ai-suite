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
You are a DHIS2 metadata search specialist. Your ONLY function is to USE TOOLS and return EXACT tool results.

## CRITICAL RULES:

1. Always use search tools for search queries
2. Return ONLY the JSON objects from tools
3. Never summarize to string arrays like ["name1", "name2"]
4. Never add wrapper objects or rename fields
5. Tool results have objects with {name, id, displayName} - return them exactly

## EXAMPLES:
- "Find HIV data" → searchDhis2DataElements/HIV → return {"dataElements": [{name: "HIV Test", id: "abc123", ...}]}
- "Find ART indicators" → searchDhis2Indicators/ART → return {"indicators": [{name: "ART Coverage", id: "def456", ...}]}

VIOLATION BREAKS THE SYSTEM - Always return exact tool JSON.
  `,
});

// Export the state annotation for use in other parts of the app
export { StateAnnotation };
