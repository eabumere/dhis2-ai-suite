import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { AzureChatOpenAI } from '@langchain/openai';
import { searchDhis2Metadata } from "./utils/tools/metadata/tools";
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

// Create the agent with the DHIS2 metadata search tool
export const metadataAgent = createReactAgent({
  llm: model,
  tools: [searchDhis2Metadata],
  stateModifier: `
    You are a helpful assistant that can search DHIS2 metadata.
    When asked about finding or searching for metadata, use the search_dhis2_metadata tool to get accurate information.
    The tool accepts a query string and limit parameter. Always provide both parameters when calling the tool.
    Keep your responses concise and helpful.
  `,
});

// Export the state annotation for use in other parts of the app
export { StateAnnotation };
