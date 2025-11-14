import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { AzureChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { StateAnnotation } from '../utils/state';
import { searchAgent } from './search-agent';
import { crudAgent } from './crud-agent';

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

// Routing tools for delegating to specialized agents
const routeToSearchAgent = tool(
    async ({ userQuery }: { userQuery: string }) => {
        try {
            // Actually invoke the search agent
            const result = await searchAgent.invoke({
                messages: [{ role: 'user', content: userQuery }]
            });

            const lastMessage = result.messages[result.messages.length - 1];
            return lastMessage.content as string;
        } catch (error) {
            console.error('Error routing to search agent:', error);
            return JSON.stringify({
                success: false,
                error: `Failed to route to search agent: ${error.message}`,
                routedTo: "search",
                originalQuery: userQuery
            });
        }
    },
    {
        name: "route_to_search_agent",
        description: "Route query to the search agent for finding, locating, and retrieving existing DHIS2 metadata resources",
        schema: JSON.parse(`{
            "type": "object",
            "properties": {
                "userQuery": {
                    "type": "string",
                    "description": "The complete user query to route to search agent"
                }
            },
            "required": ["userQuery"]
        }`)
    }
);

const routeToCRUDAgent = tool(
    async ({ userQuery }: { userQuery: string }) => {
        try {
            // Actually invoke the CRUD agent
            const result = await crudAgent.invoke({
                messages: [{ role: 'user', content: userQuery }]
            });

            const lastMessage = result.messages[result.messages.length - 1];
            return lastMessage.content as string;
        } catch (error) {
            console.error('Error routing to CRUD agent:', error);
            return JSON.stringify({
                success: false,
                error: `Failed to route to CRUD agent: ${error.message}`,
                routedTo: "crud",
                originalQuery: userQuery
            });
        }
    },
    {
        name: "route_to_crud_agent",
        description: "Route query to the CRUD agent for creating, updating, and modifying DHIS2 metadata resources",
        schema: JSON.parse(`{
            "type": "object",
            "properties": {
                "userQuery": {
                    "type": "string",
                    "description": "The complete user query to route to CRUD agent"
                }
            },
            "required": ["userQuery"]
        }`)
    }
);

// Create the router agent with routing tools
export const routerAgent = createReactAgent({
  llm: model,
  tools: [routeToSearchAgent, routeToCRUDAgent],
  prompt: `
    You are a DHIS2 intelligent routing agent. Your role is to analyze user queries and route them to the most appropriate specialized agent based on intent analysis.

    ## ROUTING DECISIONS

    ### SEARCH AGENT ROUTING
    Route to SEARCH AGENT for operations that involve:
    - **Finding/Retrieving**: find, search, lookup, show, list, get, retrieve, display, see, view
    - **Discovery**: browse, explore, what are, which, where is, who has
    - **Examination**: check, verify, inspect, examine, review, details, information
    - **Reading/Access**: fetch, obtain, access, download, export, export

    **Examples of SEARCH queries:**
    - "Find all data elements with HIV"
    - "Show me the organization units in District A"
    - "Search for programs about malaria"
    - "List all categories"
    - "Get details of data element DE123"
    - "What indicators exist for tuberculosis?"

    ### CRUD AGENT ROUTING
    Route to CRUD AGENT for operations that involve:
    - **Creating**: create, add, new, make, build, setup, establish, develop
    - **Modifying**: update, change, modify, edit, revise, alter, rename, adjust
    - **Writing/Saving**: save, store, upload, import, insert, put
    - **Actions**: generate, produce, construct, design, configure

    **Examples of CRUD queries:**
    - "Create a data element for patient age"
    - "Add an organization unit for Central Hospital"
    - "Update the malaria program with new indicators"
    - "Make a category for age groups"
    - "Set up a new validation rule"
    - "Generate dashboard for COVID reporting"

    ## INTENT ANALYSIS RULES

    ### Primary Keywords (High Priority)
    - SEARCH: find, search, show, list, get, display, view, see, lookup, retrieve, discover, explore, browse, check, verify, examine, details, information
    - CRUD: create, add, make, new, update, change, modify, edit, build, setup, generate, produce, construct, design, save, store

    ### Contextual Analysis
    - **Question format** suggests SEARCH: "What are...", "Where is...", "Which...", "How many..."
    - **Imperative format** suggests CRUD: "Create...", "Add...", "Update...", "Make..."
    - **Object references** can go either way: "the data element" (could be creating or retrieving)

    ### Ambiguous Cases
    If intent is unclear, ask user for clarification rather than guessing wrong.

    ## ROUTING WORKFLOW

    1. **Analyze**: Read the complete user query
    2. **Extract Intent**: Identify primary action keywords
    3. **Context Check**: Consider surrounding words and grammar
    4. **Route**: Use appropriate routing tool (routeToSearchAgent or routeToCRUDAgent)
    5. **Execute**: The tool will handle the delegation

    ## IMPORTANT NOTES

    - **Always route** - never handle queries directly yourself
    - **Single routing** - pick exactly one agent (search or crud)
    - **No tool execution** - just analyze and route to the right agent
    - **Preserve context** - pass the entire user query to the agent
    - **No explanation** - don't explain routing decisions, just route

    ## RESPONSE BEHAVIOR

    **ALWAYS use routing tools** - never respond directly with answers.
    **Use natural language only when seeking clarification** about ambiguous queries.
    **For all other cases, route immediately using the appropriate tool.**

    Your primary function is intelligent routing - let the specialized agents do the actual work.
  `,
});

// Export the state annotation for use in other parts of the app
export { StateAnnotation };

// Export the routing functions for use in the main application
export { routeToSearchAgent, routeToCRUDAgent };
