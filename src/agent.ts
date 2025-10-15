import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { AzureChatOpenAI } from '@langchain/openai';
import { getTodaysDate } from "./utils/tools";
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

// Create the agent with the date tool
export const dateAgent = createReactAgent({
  llm: model,
  tools: [getTodaysDate],
  stateModifier: `
    You are a helpful assistant that can provide today's date.
    When asked about the current date or today's date, use the get_todays_date tool to get accurate information.
    Keep your responses concise and helpful.
  `,
});

// Export the state annotation for use in other parts of the app
export { StateAnnotation };
