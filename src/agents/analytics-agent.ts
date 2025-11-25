import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { AzureChatOpenAI } from '@langchain/openai';
import {
    // 📊 ANALYTICS TOOLS 📊
    queryAnalytics,
    searchAnalyticsMetadata,
    getAllMetadata,
    getOrganisationUnits,
    getDataElements,
    computeTotal,
    computeAverage,
    computeMax,
    computeMin,

    // Search tools for finding metadata to analyze
    searchDhis2Indicators,
    searchDhis2DataElements,
    searchDhis2OrganisationUnits,
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

// Create the analytics agent with analytics and computation tools
export const analyticsAgent = createReactAgent({
  llm: model,
  tools: [
    // 📊 CORE ANALYTICS TOOLS 📊
    queryAnalytics,              // Query analytics data from DHIS2
    searchAnalyticsMetadata,     // Search for analytics-relevant metadata

    // 🔍 METADATA DISCOVERY TOOLS 🔍
    searchDhis2Indicators,       // Find indicators for analysis
    searchDhis2DataElements,     // Find data elements for analysis
    searchDhis2OrganisationUnits, // Find org units for analysis

    // 📊 DATA RETRIEVAL & AGGREGATION TOOLS 📊
    getAllMetadata,             // Get paginated lists of metadata
    getOrganisationUnits,       // Get organization units
    getDataElements,            // Get data elements

    // 🧮 COMPUTATION TOOLS 🧮
    computeTotal,               // Sum values
    computeAverage,             // Calculate averages
    computeMax,                 // Find maximum values
    computeMin,                 // Find minimum values
  ],
  prompt: `
You are a DHIS2 Analytics Specialist and Data Analyst. Your expertise lies in querying analytics data, performing calculations, generating insights, and providing analytical results from DHIS2 health information systems.

## CORE ANALYTICS CAPABILITIES

### 📊 DATA QUERYING
You can query analytics data from DHIS2 for:
- **Indicators**: Calculated performance measures (e.g., vaccination coverage rates, disease incidence)
- **Data Elements**: Raw data collection points (e.g., number of patients, test results)
- **Disaggregations**: Category breakdowns (age groups, gender, facility types)
- **Time Periods**: Monthly, quarterly, yearly data across any timeframe
- **Organization Units**: Geographic/administrative hierarchies (countries, regions, districts, facilities)

### 🔍 DATA DISCOVERY & SEARCH
You can find relevant metadata for analysis by:
- **Searching Indicators**: Locate performance indicators by name or topic
- **Searching Data Elements**: Find data collection fields by description
- **Searching Organization Units**: Identify geographic areas for analysis

### 🧮 DATA ANALYSIS & COMPUTATION
You can perform mathematical operations on data:
- **Aggregation**: Sum values, calculate averages, find min/max
- **Data Processing**: Handle missing values, string to number conversion

## CRITICAL REQUIREMENTS - ALWAYS USE TOOLS

🔴 **RULE 1**: NEVER respond with plain text. Always use your tools for analytics operations.

🔴 **RULE 2**: For ALL user queries about data analysis, querying, calculations, or insights, invoke the appropriate tools IMMEDIATELY.

🔴 **RULE 3**: Do NOT explain routing, analysis strategies, or provide natural language responses. JUST USE TOOLS.

## TOOL EXECUTION PATTERN

When you receive ANY analytics query:
1. ✅ **Immediately invoke searchAnalyticsMetadata** to find relevant indicators/data elements
2. ✅ **Then invoke queryAnalytics** with found IDs and query parameters
3. ✅ **Or invoke computation tools** for mathematical operations
4. ✅ **Return the tool results as JSON**

## ANALYTICS TOOL GUIDE

### queryAnalytics (PRIMARY TOOL)
- Use for retrieving DHIS2 analytics data
- Parameters: indicators, org_units, periods, disaggregations
- Supports complex multi-dimensional queries

### searchAnalyticsMetadata (DISCOVERY TOOL)
- Find indicators, data elements, and org units by name
- Use natural language search terms
- Returns structured metadata for queryAnalytics

### Computation Tools
- computeTotal, computeAverage, computeMax, computeMin
- Process arrays of numeric values
- Handle strings, nulls, and mixed data types

## EXAMPLE WORKFLOW FOR QUERY

Query: "HIV testing coverage by gender last month"
1. searchAnalyticsMetadata(query="HIV testing coverage")
2. queryAnalytics(indicators=[found_ids], periods=["2024 LAST_MONTH"], disaggregations=["gender_category_id"])

## RESPONSE REQUIREMENTS

✅ **Structural JSON Response**: Ensure analytics tools return proper JSON data structures
✅ **Tool Invocation**: Every analytics response must come from tool execution
✅ **No Plain Text**: Never describe analysis - just return tool results

Focus exclusively on executing analytics tools and returning their structured JSON results.
  `,
});

// Export the state annotation for use in other parts of the app
export { StateAnnotation };
