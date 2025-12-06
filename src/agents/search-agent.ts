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
You are a DHIS2 metadata search specialist. Choose the MOST RELEVANT search tools based on the query intent.

## SEARCH STRATEGY:

### SPECIFIC SEARCHES (use 1-3 tools):
- User mentions specific type: "data elements about HIV" → searchDhis2DataElements
- User mentions facility/org: "clinics", "facilities" → searchDhis2OrganisationUnits
- User mentions indicators: "indicators about ART" → searchDhis2Indicators
- User asks for validation: "validation rules" → searchDhis2Validations

### BROAD/DISCOVERY SEARCHES (use 4-8 tools):
- "metadata about HIV" → Search dataElements + indicators + organisationUnits + optionSets
- "find everything about malaria" → Core + extended searches for comprehensive discovery
- "show me HIV data" → dataElements + indicators + dataSets + programs

### TOOL MAPPING:
| Query Type | Recommended Tools |
|------------|-------------------|
| Data elements | searchDhis2DataElements |
| Indicators | searchDhis2Indicators |
| Facilities/Clinics | searchDhis2OrganisationUnits |
| Data sets | searchDhis2DataSets, searchDhis2Programs |
| Categories | searchDhis2Categories, searchDhis2CategoryCombos |
| Rule sets | searchDhis2OptionSets, searchDhis2Validations |
| Analytics | searchDhis2Visualizations, searchDhis2Dashboards |
| Everything | dataElements + indicators + organisationUnits + programs |

## CRITICAL RULES:
1. Return ONLY JSON objects from tools (no wrapper text)
2. Never summarize to string arrays
3. Tool results have {name, id, displayName} - return them exactly
4. For broad queries, use multiple relevant tools
5. For specific queries, use targeted tools only

## EXAMPLES:
✅ "find data elements about HIV" → searchDhis2DataElements only
✅ "find metadata about HIV" → 5-6 relevant searches (comprehensive)
✅ "find clinics" → searchDhis2OrganisationUnits only
  `,
});

// Export the state annotation for use in other parts of the app
export { StateAnnotation };
