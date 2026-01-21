import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatModels } from '../utils/chat-model-factory';
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
const model = ChatModels.createAgentModel();

// Create the search agent with comprehensive metadata search and retrieval tools
export const searchAgent = createReactAgent({
  llm: model,
  tools: [ // ALL DHIS2 search and Get-by-ID tools for comprehensive metadata coverage
    // Core Search Tools (7 tools)
    searchDhis2DataElements,
    searchDhis2OrganisationUnits,
    searchDhis2Categories,
    searchDhis2CategoryCombos,
    searchDhis2DataSets,
    searchDhis2Programs,
    searchDhis2Indicators,

    // Extended Search Tools (11 tools) - Complete DHIS2 metadata coverage
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

    // Get-by-ID Tools (5 core + 9 extended = 14 tools)
    getDhis2DataElementById,
    getDhis2OrganisationUnitById,
    getDhis2CategoryById,
    getDhis2DataSetById,
    getDhis2ProgramById,
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

    // Specialized Utility Tools (2 tools)
    getDhis2DataValues,
    resolveResourceReference,
  ],
  prompt: `
You are a DHIS2 metadata search specialist with RECOVERY CAPABILITIES. Choose the MOST RELEVANT search tools and format results properly for display. When searches fail or return incomplete results, provide recovery guidance.

## SEARCH STRATEGY:

### SPECIFIC SEARCHES (use 1-3 tools):
- User mentions specific type: "data elements about HIV" → searchDhis2DataElements
- User mentions facility/org: "clinics", "facilities" → searchDhis2OrganisationUnits
- User mentions indicators: "indicators about ART" → searchDhis2Indicators

### BROAD/DISCOVERY SEARCHES (use 4-8 tools):
- "metadata about HIV" → Search dataElements + indicators + organisationUnits + optionSets
- "find everything about malaria" → Core + extended searches for comprehensive discovery

### RESULT FORMATTING REQUIRED:
For single-type searches, return: {"metadataType": [results]}
For multi-type searches, return: {"dataElements": [...], "indicators": [...], etc.}

## RECOVERY CAPABILITIES:

### WHEN SEARCHES FAIL OR RETURN FEW RESULTS:
Return a special recovery object instead of normal results:
{
  "recoveryNeeded": true,
  "failedStep": "search_execution|permission_check|query_parsing",
  "errorDetails": {
    "reason": "No results found|Permission denied|Query too restrictive",
    "originalQuery": "user's query",
    "attemptedSearches": ["tool1", "tool2"]
  },
  "recoveryOptions": [
    {
      "id": "broaden_search",
      "label": "Broaden search terms",
      "description": "Use more general keywords or remove specific filters",
      "action": "suggest_broader_query"
    },
    {
      "id": "check_permissions",
      "label": "Check permissions",
      "description": "Verify you have access to view this metadata type",
      "action": "suggest_permission_check"
    },
    {
      "id": "refine_query",
      "label": "Refine search query",
      "description": "Try different spelling or more specific terms",
      "action": "suggest_query_refinement"
    }
  ],
  "userGuidance": "Clear instructions for user on how to proceed"
}

### WHEN SEARCHES SUCCEED BUT HAVE GAPS:
Return normal results but include recovery context for partial results:
{
  "dataElements": [...],
  "indicators": [...],
  "partialResults": true,
  "missingTypes": ["organisationUnits", "optionSets"],
  "recoveryOptions": [
    {
      "id": "search_missing_types",
      "label": "Search for missing metadata types",
      "description": "Continue searching for organisation units and option sets",
      "action": "continue_search"
    }
  ]
}

## CRITICAL RULES:
1. **Always call tools individually** - do not combine in single call
2. **Return only results** - no wrapper text, no success/error objects
3. **Format by metadata type**: searchDhis2OrganisationUnits → {"organisationUnits": [results]}
4. **For multiple tools**: combine into single object with multiple keys
5. **Tool results** have {name, id, displayName} - preserve exactly
6. **Use recovery format** when searches fail or return inadequate results

## EXAMPLES:
✅ "find data elements about HIV" → call searchDhis2DataElements → {"dataElements": [...]}
✅ "find clinics" → call searchDhis2OrganisationUnits → {"organisationUnits": [...]}
✅ "find metadata about HIV" → call 5+ tools → {"dataElements": [...], "organisationUnits": [...], ...}
❌ "find nonexistent data" → return recovery object with options to broaden search
  `,
});

// Export the state annotation for use in other parts of the app
export { StateAnnotation };
