import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { AzureChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { StateAnnotation } from '../utils/state';
import { searchAgent } from './search-agent';
import { crudAgent } from './crud-agent';
import { analyticsAgent } from './analytics-agent';
import { resolveResourceReference } from '../utils/tools/metadata';
import { conversationContext, findRelevantContext, addConversation, createAnalyticsDataContext, createSearchDataContext, createMutationDataContext } from '../utils/conversation-context';

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
            const responseContent = lastMessage.content as string;

            // Parse and add to conversation context
            try {
                const parsedResponse = JSON.parse(responseContent);
                if (parsedResponse.success !== false) {
                    const dataContext = createSearchDataContext(parsedResponse);
                    addConversation(userQuery, 'search', parsedResponse, dataContext);
                } else {
                    addConversation(userQuery, 'search', parsedResponse);
                }
            } catch (parseError) {
                // If it's not JSON, still add to conversation
                addConversation(userQuery, 'search', { rawResponse: responseContent });
            }

            return responseContent;
        } catch (error) {
            console.error('Error routing to search agent:', error);
            const errorResponse = {
                success: false,
                error: `Failed to route to search agent: ${error.message}`,
                routedTo: "search",
                originalQuery: userQuery
            };
            addConversation(userQuery, 'search', errorResponse);
            return JSON.stringify(errorResponse);
        }
    },
    {
        name: "route_to_search_agent",
        description: "Route query to the search agent for finding, locating, and retrieving existing DHIS2 metadata resources. Automatically adds search results to conversation context for follow-up questions.",
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
            const responseContent = lastMessage.content as string;

            // Parse and add to conversation context
            try {
                const parsedResponse = JSON.parse(responseContent);
                if (parsedResponse.success !== false) {
                    // Determine operation type
                    const operationType: 'creation' | 'update' =
                        userQuery.toLowerCase().includes('create') || userQuery.toLowerCase().includes('add') ||
                        userQuery.toLowerCase().includes('new') || userQuery.toLowerCase().includes('make')
                        ? 'creation' : 'update';

                    const dataContext = createMutationDataContext(operationType, parsedResponse);
                    addConversation(userQuery, 'crud', parsedResponse, dataContext);
                } else {
                    addConversation(userQuery, 'crud', parsedResponse);
                }
            } catch (parseError) {
                // If it's not JSON, still add to conversation
                addConversation(userQuery, 'crud', { rawResponse: responseContent });
            }

            return responseContent;
        } catch (error) {
            console.error('Error routing to CRUD agent:', error);
            const errorResponse = {
                success: false,
                error: `Failed to route to CRUD agent: ${error.message}`,
                routedTo: "crud",
                originalQuery: userQuery
            };
            addConversation(userQuery, 'crud', errorResponse);
            return JSON.stringify(errorResponse);
        }
    },
    {
        name: "route_to_crud_agent",
        description: "Route query to the CRUD agent for creating, updating, and modifying DHIS2 metadata resources. Automatically adds creation/update results to conversation context for follow-up questions.",
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
            const responseContent = lastMessage.content as string;

            // Parse and add to conversation context
            try {
                const parsedResponse = JSON.parse(responseContent);
                if (parsedResponse.success !== false) {
                    // Analytics responses may include chart data - add to memory
                    const dataContext = createAnalyticsDataContext(parsedResponse);
                    addConversation(userQuery, 'analytics', parsedResponse, dataContext);
                } else {
                    addConversation(userQuery, 'analytics', parsedResponse);
                }
            } catch (parseError) {
                // If it's not JSON, still add to conversation
                addConversation(userQuery, 'analytics', { rawResponse: responseContent });
            }

            return responseContent;
        } catch (error) {
            console.error('Error routing to analytics agent:', error);
            const errorResponse = {
                success: false,
                error: `Failed to route to analytics agent: ${error.message}`,
                routedTo: "analytics",
                originalQuery: userQuery
            };
            addConversation(userQuery, 'analytics', errorResponse);
            return JSON.stringify(errorResponse);
        }
    },
    {
        name: "route_to_analytics_agent",
        description: "Route query to the analytics agent for data analysis, querying analytics endpoints, performing calculations, and generating insights from DHIS2 data. Automatically adds analytics results and chart data to conversation context for follow-up questions.",
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

// Create a context-aware router agent that includes conversation context
export const contextRouterAgent = createReactAgent({
  llm: model,
  tools: [routeToSearchAgent, routeToCRUDAgent, routeToAnalyticsAgent, resolveResourceReference],
  prompt: ({ messages }: any) => {
    // Get the current user query from messages
    const lastUserMessage = messages.filter((m: any) => m.role === 'user').slice(-1)[0];
    const currentQuery = lastUserMessage?.content || '';

    // Find relevant conversation context
    const context = findRelevantContext(currentQuery);

    return `
    You are a DHIS2 intelligent routing agent with full conversation awareness. You understand the context of previous discussions and can route follow-up questions appropriately.

    ## CRITICAL REQUIREMENTS - ALWAYS USE TOOLS

    🔴 **RULE 1**: NEVER respond with plain text. ALWAYS route queries using your routing tools, never respond with explanations or descriptions of routing.

    🔴 **RULE 2**: For ALL user queries requiring data/metadata operations, invoke the appropriate routing tool IMMEDIATELY. Routing tools return JSON responses from specialized agents.

    🔴 **RULE 3**: DO NOT explain routing, analysis strategies, or provide natural language responses. JUST USE ROUTING TOOLS.

    🔴 **RULE 4**: If routing fails or response is not JSON, return structured error JSON, not plain text.

    🔴 **RULE 5**: Response must always be JSON from specialized agents, never from your own reasoning.

    ## CONVERSATION CONTEXT AWARENESS

    Current conversation includes:
    - Recent topics discussed: ${conversationContext.memory.activeTopics.join(', ') || 'None'}
    - Previous analytics available: ${context.lastAnalyticsData?.summary || 'None'}
    - Data contexts available: ${context.relevantDataContexts.length > 0 ? context.relevantDataContexts.map(c => c.summary).join('; ') : 'None'}

    ## ROUTING WORKFLOW

    When you receive ANY query (including follow-ups):
    stepwise 1. ✅ **Use conversation context** to understand references like "the previous data", "that chart", "last search", etc.
    stepwise 2. ✅ **Check for conversational references** like "last data element", "the category I created" using resolveResourceReference tool
    stepwise 3. ✅ **Immediately identify intent** using keyword analysis and conversation context
    stepwise 4. ✅ **Invoke single routing tool** (routeToSearchAgent, routeToCRUDAgent, or routeToAnalyticsAgent)
    stepwise 5. ✅ **Return tool result** as pure JSON response (routing tools automatically add responses to conversation context)

    ## CONTEXT-AWARE ROUTING EXAMPLES

    ### Follow-up Questions:
    - "Filter that chart by gender" → Route to Analytics Agent (knows about previous chart)
    - "Show me more about the HIV data" → Route to Analytics Agent (knows about previous analytics)
    - "Update the data element I created" → Route to CRUD Agent (knows about created resources)
    - "Find categories related to those results" → Route to Search Agent (knows about previous search)

    ## ROUTING DECISIONS

    ### SEARCH AGENT ROUTING
    Route to SEARCH AGENT for operations that involve:
    - **Finding/Retrieving**: find, search, lookup, show, list, get, retrieve, display, see, view
    - **Discovery**: browse, explore, what are, which, where is, who has
    - **Examination**: check, verify, inspect, examine, review, details, information
    - **Reading/Access**: fetch, obtain, access, download, export, export
    - **References to context**: "more like that", "find related to..."

    ### CRUD AGENT ROUTING
    Route to CRUD AGENT for operations that involve:
    - **Creating**: create, add, new, make, build, setup, establish, develop
    - **Modifying**: update, change, modify, edit, revise, alter, rename, adjust
    - **Writing/Saving**: save, store, upload, import, insert, put
    - **Actions**: generate, produce, construct, design, configure
    - **References to context**: "update the one I created", "modify that category"

    ### ANALYTICS AGENT ROUTING
    Route to ANALYTICS AGENT for operations that involve:
    - **Data Analysis**: analyze, calculate, compute, aggregate, trend, compare
    - **Querying Data**: query, extract, retrieve data values, analytics, reporting
    - **Mathematical Operations**: sum, average, min, max, total, percentage, rate
    - **Insights & Reporting**: performance, coverage, trends, patterns, insights
    - **Time Series**: monthly, quarterly, yearly data, time periods, over time
    - **Questions about data**: "How many", "What is the total", "Calculate", "Show me coverage"
    - **References to context**: "filter the chart", "show trends in that data", "analyze those results"

    ## RESPONSE REQUIREMENTS

    ✅ **Tool Invocation ONLY**: Every query response must come from routing tool execution
    ✅ **JSON Response ONLY**: Never return plain text responses or explanations
    ✅ **No Plain Text**: Never describe routing decisions - just return tool results

    ## EXAMPLES (TOOL ONLY RESPONSES)

    Primary Queries:
    Query: "Find all data elements with HIV"
    Response: {result from routeToSearchAgent tool}

    Query: "Create a data element for patient age"
    Response: {result from routeToCRUDAgent tool}

    Query: "How many people have been tested in the Last 12 months"
    Response: {result from routeToAnalyticsAgent tool}

    Follow-ups with Context:
    Query: "Show me trends in that data" (referring to previous analytics)
    Response: {result from routeToAnalyticsAgent tool - knows about previous analytics data}

    Query: "Filter the chart by gender" (referring to previous chart)
    Response: {result from routeToAnalyticsAgent tool - has chart context}

    Query: "Update the one I created" (referring to created resource)
    Response: {result from routeToCRUDAgent tool - knows about created resources}

    Focus exclusively on invoking routing tools and returning their structured JSON results.
    Never respond in plain text explaining routing - that violates the rules.
    Use conversation context intelligently for follow-up questions.
  `
  },
});

// Keep the original router agent for backward compatibility
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
