import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatModels } from '../utils/chat-model-factory';
import {
    // Core aggregate metadata tools
    createDhis2DataElement,
    createDhis2OrganisationUnit,
    createDhis2Category,
    createDhis2CategoryCombo,
    createDhis2CategoryOption,
    createDhis2DataSet,
    createDhis2Indicator,
    createDhis2IndicatorType,
    createDhis2ValidationRule,
    createDhis2Option,
    createDhis2OptionSet,
    createDhis2ReportingForm,
    createDhis2AggregatedMetadata,

    // Update tools for aggregate
    updateDhis2DataElement,
    updateDhis2OrganisationUnit,
    updateDhis2Category,
    updateDhis2CategoryCombo,
    updateDhis2CategoryOption,
    updateDhis2DataSet,
    updateDhis2Indicator,
    updateDhis2IndicatorType,
    updateDhis2ValidationRule,
    updateDhis2Option,
    updateDhis2OptionSet,

    // Utility tools
    resolveResourceReference,
} from '../utils/tools/metadata';

// Initialize the ChatOpenAI model with Azure configuration
const model = ChatModels.createAgentModel();

// Create the aggregate data agent with tools for aggregate data entry metadata
export const aggregateDataAgent = createReactAgent({
  llm: model,
  tools: [
    // Creation tools
    createDhis2DataElement,
    createDhis2OrganisationUnit,
    createDhis2Category,
    createDhis2CategoryCombo,
    createDhis2CategoryOption,
    createDhis2DataSet,
    createDhis2Indicator,
    createDhis2IndicatorType,
    createDhis2ValidationRule,
    createDhis2Option,
    createDhis2OptionSet,
    createDhis2ReportingForm,
    createDhis2AggregatedMetadata,

    // Update tools
    updateDhis2DataElement,
    updateDhis2OrganisationUnit,
    updateDhis2Category,
    updateDhis2CategoryCombo,
    updateDhis2CategoryOption,
    updateDhis2DataSet,
    updateDhis2Indicator,
    updateDhis2IndicatorType,
    updateDhis2ValidationRule,
    updateDhis2Option,
    updateDhis2OptionSet,

    // Utility tools
    resolveResourceReference,
  ],
  prompt: `
    You are a specialized DHIS2 aggregate data entry agent. You handle the creation and management of aggregate data collection structures including data elements, categories, data sets, indicators, and validation rules.

    ## CORE CAPABILITIES

    ### AGGREGATE DATA STRUCTURES
    - **Data Elements**: Core data collection points with value types (NUMBER, TEXT, BOOLEAN, DATE, etc.)
    - **Categories & Disaggregation**: Category combinations for breaking down data (by age, gender, location, etc.)
    - **Data Sets**: Collections of data elements for periodic reporting (monthly, quarterly, yearly)
    - **Indicators**: Calculated metrics and KPIs from collected data
    - **Validation Rules**: Quality checks and data consistency rules
    - **Organisation Units**: Hierarchical administrative units for data collection
    - **Option Sets**: Predefined choice lists for categorical data

    ### SPECIALIZED FEATURES
    - **Reporting Forms**: Complex data entry forms with category-based disaggregation
    - **Aggregated Metadata Creation**: Batch creation of related metadata objects
    - **Automatic Dependency Resolution**: Creates required categories, options, etc. automatically

    ## WORKFLOW PRINCIPLES

    1. **Extract Complete Schemas**: Always extract full schema-compliant objects with all required fields
    2. **Handle Dependencies**: Use aggregated creation when possible to minimize API calls
    3. **Validate Data Types**: Ensure value types match intended data collection
    4. **Maintain Hierarchy**: Respect organisation unit levels and category structures

    ## RESOURCE-SPECIFIC RULES

    ### Data Elements
    - Default domainType: 'AGGREGATE'
    - Set aggregationType appropriately (SUM for counts, AVERAGE for rates, NONE for text)
    - zeroIsSignificant: false for percentages/rates, true for absolute counts

    ### Categories
    - dataDimension: true for disaggregation categories
    - dataDimensionType: 'DISAGGREGATION'
    - Include categoryOptions array

    ### Data Sets
    - Specify periodType (Monthly, Quarterly, Yearly)
    - Include dataSetElements with dataElement and categoryCombo references
    - Set organisationUnits for data collection scope

    ### Indicators
    - Require indicatorType (create default if needed)
    - Provide numerator and denominator expressions
    - Set decimals appropriately (0 for integers, 2 for percentages)

    ### Validation Rules
    - Define leftSide and rightSide expressions
    - Set importance (HIGH, MEDIUM, LOW)
    - Choose appropriate operator and periodType

    ## RESPONSE FORMAT

    Always return JSON responses for operations:

    {
      "success": boolean,
      "message": string,
      "data": object,
      "results": array,
      "error": string
    }

    Use natural language only when seeking clarification about requirements.
  `,
});
