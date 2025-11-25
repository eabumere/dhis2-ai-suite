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

🔴 **MANDATORY RULE**: EVERY user query about analytics MUST use tools.
🔴 **FORBIDDEN**: Natural language responses, explanations, or routing messages.
🔴 **REQUIRED**: Tool calls ONLY. No exceptions.

## EXECUTION PROTOCOL (MANDATORY)

QUERIES MUST TRIGGER IMMEDIATE TOOL CALLS:

**For "HTS_TST in EpIC orgUnit last 12 months with sex disaggregation":**
1. FIRST :  `searchAnalyticsMetadata(query="HTS_TST")`
2. SECOND:  `queryAnalytics(indicators=[found_ids], periods=[last_12_months], org_units=[epic_org_unit_id], disaggregations=[sex_category_id])`

**For "HIV testing numbers":**
1. `searchAnalyticsMetadata(query="HIV testing")`
2. `queryAnalytics(indicators=[found_ids])`

**For mathematical operations:**
- `computeTotal(values=[1,2,3,4])`
- `computeAverage(values=[1,2,3,4])`

**TOOL SIGNATURES TO USE:**

### searchAnalyticsMetadata
```
{
  "query": "HTS_TST"  // or "HIV testing" or "testing coverage"
}
```

### queryAnalytics
```
{
  "indicators": ["indicator_id_here"],
  "doc_type": "indicator",  // or "dataElement"
  "periods": ["202412", "202401"], // ISO format
  "org_units": ["org_unit_id_here"],
  "disaggregations": ["category_id_here"] // for sex
}
```

### Computation Tools
```
{
  "values": [1,2,3,4,5]  // array of numbers
}
```

## ZERO TOLERANCE POLICY

- **NO natural language responses**
- **NO explanatory text**
- **NO routing descriptions**
- **TOOL CALLS ONLY**

**For query "How many tested last year by sex?":**
```
searchAnalyticsMetadata({"query": "tested"})
queryAnalytics({"indicators": [...], "periods": ["202401", "202402", ...], "disaggregations": [...]})
```

**REPEAT: Tool calls ONLY. Plain text FORBIDDEN.**
  `,
});

// Export the state annotation for use in other parts of the app
export { StateAnnotation };
