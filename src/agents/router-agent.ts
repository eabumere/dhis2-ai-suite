import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { AzureChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { StateAnnotation } from '../utils/state';
import { searchAgent } from './search-agent';
import { crudAgent } from './crud-agent';
import { analyticsAgent } from './analytics-agent';
import { resolveResourceReference } from '../utils/tools/metadata';

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

const routeToAnalyticsAgent = tool(
    async ({ userQuery }: { userQuery: string }) => {
        try {
            // Actually invoke the analytics agent
            const result = await analyticsAgent.invoke({
                messages: [{ role: 'user', content: userQuery }]
            });

            const lastMessage = result.messages[result.messages.length - 1];
            return lastMessage.content as string;
        } catch (error) {
            console.error('Error routing to analytics agent:', error);
            return JSON.stringify({
                success: false,
                error: `Failed to route to analytics agent: ${error.message}`,
                routedTo: "analytics",
                originalQuery: userQuery
            });
        }
    },
    {
        name: "route_to_analytics_agent",
        description: "Route query to the analytics agent for data analysis, querying analytics endpoints, performing calculations, and generating insights from DHIS2 data",
        schema: JSON.parse(`{
            "type": "object",
            "properties": {
                "userQuery": {
                    "type": "string",
                    "description": "The complete user query to route to analytics agent"
                }
            },
            "required": ["userQuery"]
        }`)
    }
);

// Create the router agent with routing tools
export const routerAgent = createReactAgent({
  llm: model,
  tools: [routeToSearchAgent, routeToCRUDAgent, routeToAnalyticsAgent, resolveResourceReference],
  prompt: `
    You are a DHIS2 intelligent routing agent. Your role is to analyze user queries and route them to the most appropriate specialized agent based on intent analysis.

    ## CRITICAL REQUIREMENTS - ALWAYS USE TOOLS

    🔴 **RULE 1**: NEVER respond with plain text. ALWAYS route queries using your routing tools, never respond with explanations or descriptions of routing.

    🔴 **RULE 2**: For ALL user queries requiring data/metadata operations, invoke the appropriate routing tool IMMEDIATELY. Routing tools return JSON responses from specialized agents.

    🔴 **RULE 3**: DO NOT explain routing, analysis strategies, or provide natural language responses. JUST USE ROUTING TOOLS.

    🔴 **RULE 4**: If routing fails or response is not JSON, return structured error JSON, not plain text.

    🔴 **RULE 5**: Response must always be JSON from specialized agents, never from your own reasoning.

    ## ROUTING WORKFLOW

    When you receive ANY query:
    stepwise 1. ✅ **Check for conversational references** like "last data element", "the category I created" using resolveResourceReference tool
    stepwise 2. ✅ **Immediately identify intent** using keyword analysis
    stepwise 3. ✅ **Invoke single routing tool** (routeToSearchAgent, routeToCRUDAgent, or routeToAnalyticsAgent)
    stepwise 4. ✅ **Return tool result** as pure JSON response

    ## ROUTING DECISIONS

    ### SEARCH AGENT ROUTING
    Route to SEARCH AGENT for operations that involve:
    - **Finding/Retrieving**: find, search, lookup, show, list, get, retrieve, display, see, view
    - **Discovery**: browse, explore, what are, which, where is, who has
    - **Examination**: check, verify, inspect, examine, review, details, information
    - **Reading/Access**: fetch, obtain, access, download, export, export

    ### CRUD AGENT ROUTING
    Route to CRUD AGENT for operations that involve:
    - **Creating**: create, add, new, make, build, setup, establish, develop
    - **Modifying**: update, change, modify, edit, revise, alter, rename, adjust
    - **Writing/Saving**: save, store, upload, import, insert, put
    - **Actions**: generate, produce, construct, design, configure

    ### ANALYTICS AGENT ROUTING
    Route to ANALYTICS AGENT for operations that involve:
    - **Data Analysis**: analyze, calculate, compute, aggregate, trend, compare
    - **Querying Data**: query, extract, retrieve data values, analytics, reporting
    - **Mathematical Operations**: sum, average, min, max, total, percentage, rate
    - **Insights & Reporting**: performance, coverage, trends, patterns, insights
    - **Time Series**: monthly, quarterly, yearly data, time periods, over time
    - **Questions about data**: "How many", "What is the total", "Calculate", "Show me coverage"

    ## RESPONSE REQUIREMENTS

    ✅ **Tool Invocation ONLY**: Every query response must come from routing tool execution
    ✅ **JSON Response ONLY**: Never return plain text responses or explanations
    ✅ **No Plain Text**: Never describe routing decisions - just return tool results

    ## EXAMPLES (TOOL ONLY RESPONSES)

    Query: "Find all data elements with HIV"
    Response: {result from routeToSearchAgent tool}

    Query: "Create a data element for patient age"
    Response: {result from routeToCRUDAgent tool}

    Query: "How many people have been tested in the Last 12 months"
    Response: {result from routeToAnalyticsAgent tool}

    Focus exclusively on invoking routing tools and returning their structured JSON results.
    Never respond in plain text explaining routing - that violates the rules.
  `,
});

// Export the state annotation for use in other parts of the app
export { StateAnnotation };

// Export the routing functions for use in the main application
export { routeToSearchAgent, routeToCRUDAgent, routeToAnalyticsAgent };
