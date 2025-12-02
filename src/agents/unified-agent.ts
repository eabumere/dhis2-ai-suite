import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { AzureChatOpenAI } from '@langchain/openai';

// Import ALL tools from specialized agents (40+ tools)
import {
    // ████████ SEARCH TOOLS FROM SEARCH-AGENT ████████
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

    // ████████ GET-BY-ID TOOLS FROM SEARCH-AGENT ████████
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
    getDhis2DataValues,

    // ████████ CRUD TOOLS FROM CRUD-AGENT ████████
    // Core Creation Tools (7 tools)
    createDhis2DataElement,
    createDhis2OrganisationUnit,
    createDhis2Category,
    createDhis2CategoryCombo,
    createDhis2DataSet,
    createDhis2Program,
    createDhis2Indicator,

    // Extended Creation Tools (8 tools)
    createDhis2CategoryOption,
    createDhis2OrganisationUnitGroup,
    createDhis2OrganisationUnitGroupSet,
    createDhis2TrackedEntityType,
    createDhis2TrackedEntityAttribute,
    createDhis2ValidationRule,
    createDhis2OptionSet,
    createDhis2RelationshipType,

    // Update Tools (7 tools)
    updateDhis2DataElement,
    updateDhis2OrganisationUnit,
    updateDhis2Category,
    updateDhis2CategoryCombo,
    updateDhis2DataSet,
    updateDhis2Program,
    updateDhis2Indicator,

    // ████████ ANALYTICS TOOLS FROM ANALYTICS-AGENT ████████
    queryAnalytics,
    searchAnalyticsMetadata,
    buildAnalyticsChart,
    filterAnalyticsChart,
    exportAnalyticsChart,
    getAllMetadata,
    getOrganisationUnits,
    getDataElements,
    computeTotal,
    computeAverage,
    computeMax,
    computeMin,

    // ████████ UTILITY TOOLS ████████
    resolveResourceReference,
} from '../utils/tools/metadata';

// Import conversation context system
import { findRelevantContext, addConversation, createAnalyticsDataContext, createSearchDataContext, createMutationDataContext } from '../utils/conversation-context';

import { StateAnnotation } from '../utils/state';
import { conversationContext } from '../utils/conversation-context';

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

// Create the unified agent with ALL 40+ tools from search, CRUD, and analytics agents
// This eliminates recursion by avoiding nested agent executions
export const unifiedAgent = createReactAgent({
  llm: model,
  // Combine ALL tools into one agent - no nested executions!
  tools: [
    // ████████ SEARCH TOOLS ████████ (25 tools)
    searchDhis2DataElements,
    searchDhis2OrganisationUnits,
    searchDhis2Categories,
    searchDhis2CategoryCombos,
    searchDhis2DataSets,
    searchDhis2Programs,
    searchDhis2Indicators,
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
    getDhis2DataValues,

    // ████████ CRUD TOOLS ████████ (15 tools)
    createDhis2DataElement,
    createDhis2OrganisationUnit,
    createDhis2Category,
    createDhis2CategoryCombo,
    createDhis2DataSet,
    createDhis2Program,
    createDhis2Indicator,
    createDhis2CategoryOption,
    createDhis2OrganisationUnitGroup,
    createDhis2OrganisationUnitGroupSet,
    createDhis2TrackedEntityType,
    createDhis2TrackedEntityAttribute,
    createDhis2ValidationRule,
    createDhis2OptionSet,
    createDhis2RelationshipType,
    updateDhis2DataElement,
    updateDhis2OrganisationUnit,
    updateDhis2Category,
    updateDhis2CategoryCombo,
    updateDhis2DataSet,
    updateDhis2Program,
    updateDhis2Indicator,

    // ████████ ANALYTICS TOOLS ████████ (11 tools)
    queryAnalytics,
    searchAnalyticsMetadata,
    buildAnalyticsChart,
    filterAnalyticsChart,
    exportAnalyticsChart,
    getAllMetadata,
    getOrganisationUnits,
    getDataElements,
    computeTotal,
    computeAverage,
    computeMax,
    computeMin,

    // ████████ UTILITY TOOLS ████████ (1 tool)
    resolveResourceReference,
  ],
  prompt: ({ messages }: any) => {
    // Get the current user query from messages
    const lastUserMessage = messages.filter((m: any) => m.role === 'user').slice(-1)[0];
    const currentQuery = lastUserMessage?.content || '';

    // Find relevant conversation context for intelligent routing
    const context = findRelevantContext(currentQuery);

    return `
    You are a unified DHIS2 intelligent agent with full conversation awareness and tool routing capabilities. You combine SEARCH, CRUD, and ANALYTICS functionality into a single, powerful interface.

    ## CRITICAL RULES - ALWAYS USE TOOLS
    🔴 **RULE 1**: NEVER respond with plain text. ALWAYS use your tools for operations.
    🔴 **RULE 2**: For ALL user queries, identify intent and invoke appropriate tools IMMEDIATELY.
    🔴 **RULE 3**: DO NOT explain tool selection or provide natural language responses.
    🔴 **RULE 4**: Tool execution results become your response - return JSON only.

    ## CONVERSATION CONTEXT AWARENESS
    Current conversation includes:
    - Recent topics discussed: ${conversationContext.memory.activeTopics.join(', ') || 'None'}
    - Previous analytics data: ${context.lastAnalyticsData?.summary || 'None'}
    - Data contexts available: ${context.relevantDataContexts.length > 0 ? context.relevantDataContexts.map(c => c.summary).join('; ') : 'None'}

    ## TOOL ROUTING INTELLIGENCE

    ### SEARCH OPERATIONS
    Route ANY query with: find, search, lookup, show, list, get, retrieve, display, see, view, discover, browse, explore, what are, which, where is, who has, check, verify, inspect, examine, review, details, information, fetch, obtain, access, download

    ### CRUD OPERATIONS
    Route ANY query with: create, add, new, make, build, setup, establish, develop, update, change, modify, edit, revise, alter, rename, adjust, save, store, upload, import, insert, put, generate, produce, construct, design, configure

    ### ANALYTICS OPERATIONS
    Route ANY query with: analyze, calculate, compute, aggregate, trend, compare, query, extract, retrieve data values, analytics, reporting, sum, average, min, max, total, percentage, rate, coverage, performance, insights, time series, monthly, quarterly, yearly, time periods, over time, "How many", "What is the total", calculations, data analysis

    ## CONVERSATION-AWARE ROUTING

    ### Follow-up Questions:
    - "Filter that chart by gender" → Use filterAnalyticsChart with previous analytics context
    - "Show me more about the HIV data" → Use queryAnalytics with previous data context
    - "Update the data element I created" → Use update tools referencing CRUD context
    - "Find categories related to those results" → Use search tools with previous results context

    ## ANALYTICS WORKFLOW [MANDATORY FOR ANALYTICS QUERIES]
    When receiving analytics queries:
    1. ✅ **searchAnalyticsMetadata(query)** ← Find relevant indicators/data elements first
    2. ✅ **queryAnalytics({indicators: [...], periods: [...], org_units: [...], disaggregations: [...]})** ← Query data with found IDs
    3. ✅ **buildAnalyticsChart({userQuery, analyticsData: previous_result.data, ...})** ← Always build visualization

    ## SEARCH WORKFLOW [MANDATORY FOR SEARCH QUERIES]
    When receiving search queries:
    1. ✅ **Use appropriate search tool** (searchDhis2DataElements, searchDhis2OrganisationUnits, etc.)
    2. ✅ **Return structured search results**

    ## CRUD WORKFLOW [MANDATORY FOR CREATE/UPDATE QUERIES]
    When receiving CRUD queries:
    1. ✅ **Use appropriate create/update tool**
    2. ✅ **Return structured creation/update results**

    ## CONVERSATION CONTEXT HANDLING
    - Use resolveResourceReference for "last data element", "the category I created" references
    - Leverage active topics for query disambiguation
    - Reference previous analytics for follow-up filtering/charting

    ## RESPONSE REQUIREMENTS
    ✅ **Tool Invocation ONLY**: Every query response must be from tool execution
    ✅ **JSON Response ONLY**: Never return plain text or explanations
    ✅ **Always buildCharts**: Analytics queries must end with buildAnalyticsChart
    ✅ **Context Preservation**: Add results to conversation context via tool execution

    ## EXAMPLES

    Search Query: "Find all data elements with HIV"
    → Call: searchDhis2DataElements("HIV", 10)

    Analytics Query: "How many people tested for HIV last month"
    → Call: searchAnalyticsMetadata("HIV testing") → queryAnalytics(...) → buildAnalyticsChart(...)

    CRUD Query: "Create a new data element for age"
    → Call: createDhis2DataElement({name: "Age", valueType: "AGE", ...})

    Follow-up: "Filter that chart by gender" (referring to previous analytics)
    → Call: filterAnalyticsChart({chartId: previous_chart_id, filters: {category: "gender"}})

    Always invoke tools immediately, never delay, never explain routing.
    Return only the JSON result from tool executions.
  `
  },
});

// Export the state annotation for use in other parts of the app
export { StateAnnotation };

// Export functions for managing conversation context
export { addConversation, findRelevantContext, createAnalyticsDataContext, createSearchDataContext, createMutationDataContext };
