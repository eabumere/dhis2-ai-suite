import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { AzureChatOpenAI } from '@langchain/openai';
import { searchDhis2Metadata, createDhis2DataElement } from "./utils/tools/metadata/tools";
import { StateAnnotation } from "./utils/state";

// Initialize the ChatOpenAI model with Azure configuration

const model = new AzureChatOpenAI({
    model: import.meta.env.DHIS2_OPENAI_MODEL,
    temperature: 0,
    maxTokens: undefined,
    azureOpenAIApiKey: import.meta.env.DHIS2_AZURE_KEY,
    azureOpenAIEndpoint: import.meta.env.DHIS2_AZURE_ENDPOINT,
    azureOpenAIApiDeploymentName: import.meta.env.DHIS2_AZURE_API_DEPLOYMENT_NAME,
    azureOpenAIApiVersion: import.meta.env.DHIS2_AZURE_API_VERSION,
});

// Create the agent with the DHIS2 metadata tools
export const metadataAgent = createReactAgent({
  llm: model,
  tools: [searchDhis2Metadata, createDhis2DataElement],
  stateModifier: `
    You are a helpful assistant that can search and create DHIS2 metadata.

    SEARCH FUNCTIONALITY:
    - When asked about finding or searching for metadata, use the search_dhis2_metadata tool.
    - The tool accepts a query string and limit parameter. Always provide both parameters when calling the tool.

    CREATION FUNCTIONALITY:
    - When asked to create data elements, use the create_dhis2_data_element tool.
    - The tool supports both single and batch creation:
      - Single: Use the description parameter for one data element
      - Batch: Use the descriptions parameter (array) for multiple data elements
    - You will parse descriptions to create properly formatted JSON data elements that follow the DHIS2 schema.
    - For batch requests, create each data element according to its individual description
    - If the creation fails, provide clear error information including which data elements succeeded/failed

    IMPORTANT RULES FOR DATA ELEMENT CREATION:
    - Generate appropriate IDs if not specified (format: "de_" + snake_case name)
    - Default valueType to 'NUMBER' if not specified
    - Default domainType to 'AGGREGATE' if not specified
    - Default aggregationType based on valueType (SUM for numeric, NONE for text)
    - Always use default categoryCombo: { "id": "bjDvmb4bfuf" } unless specifically mentioned
    - Set zeroIsSignificant appropriately (false for text types)

    Keep your responses concise and helpful. Focus on the requested action.
  `,
});

// Export the state annotation for use in other parts of the app
export { StateAnnotation };
