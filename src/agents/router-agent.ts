import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { Annotation, StateGraph, START, END } from '@langchain/langgraph/web';
import { AzureChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { searchAgent } from './search-agent';
import { crudAgent } from './crud-agent';
import { stateGraphAgent } from './state-graph-agent';
import { resolveResourceReference } from '../utils/tools/metadata';
import { conversationContext, findRelevantContext, addConversation, createAnalyticsDataContext, createSearchDataContext, createMutationDataContext } from '../utils/conversation-context';

 // Define Router State - tracks workflow context and orchestrator reference
 const RouterAnnotation = Annotation.Root({
   // Workflow context
   workflowType: Annotation<string>({
     reducer: (left, right) => right || left,
     default: () => 'unknown'
   }),
   originalQuery: Annotation<string>({
     reducer: (left, right) => right || left,
     default: () => ''
   }),
   lastRouteAction: Annotation<string>({
     reducer: (left, right) => right || left,
     default: () => 'none'
   }),

   // Results and processing
   searchResult: Annotation<any>({
     reducer: (left, right) => right || left,
     default: () => null
   }),

   // Orchestrator reference for direct calls
   orchestrator: Annotation<any>({
     reducer: (left, right) => right || left,
     default: () => null
   }),

   // Messages for processing
   messages: Annotation<any[]>({
     reducer: (left: any[], right: any[]) => right ? right : left,
     default: () => []
   }),

   // Final result
   finalResult: Annotation<any>({
     reducer: (left, right) => right || left,
     default: () => null
   }),
 });

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

// Router StateGraph Workflow Nodes
async function detectWorkflowType(state: typeof RouterAnnotation.State): Promise<Partial<typeof RouterAnnotation.State>> {
   const query = state.messages.filter(m => m.role === 'user').pop()?.content || '';
   console.log('🔄 Router: Detecting workflow type for query:', query);

   const queryLower = query.toLowerCase();

   // Determine workflow type based on query analysis
   const isAnalyticsQuery = [
     'analyze', 'calculate', 'compute', 'aggregate', 'trend', 'compare',
     'query', 'extract', 'retrieve', 'sum', 'average', 'min', 'max', 'total',
     'percentage', 'rate', 'performance', 'coverage', 'insights', 'monthly',
     'quarterly', 'yearly', 'how many', 'what is the total', 'calculations'
   ].some(keyword => queryLower.includes(keyword));

   const isCRUDQuery = [
     'create', 'add', 'new', 'make', 'build', 'update', 'change', 'modify',
     'edit', 'revise', 'alter', 'save', 'store', 'upload', 'generate'
   ].some(keyword => queryLower.includes(keyword));

   const isSearchQuery = [
     'find', 'search', 'lookup', 'show', 'list', 'get', 'retrieve', 'display',
     'see', 'view', 'browse', 'explore', 'what are', 'which', 'where is', 'who has',
     'check', 'verify', 'inspect', 'examine', 'review', 'details', 'information',
     'fetch', 'obtain', 'access', 'download', 'export'
   ].some(keyword => queryLower.includes(keyword));

   let workflowType = 'unknown';
   if (isAnalyticsQuery) workflowType = 'analytics_routing';
   else if (isCRUDQuery) workflowType = 'crud';
   else if (isSearchQuery) workflowType = 'direct_search';

   console.log(`🔄 Router: Detected workflow type: ${workflowType}`);

   return {
     workflowType,
     originalQuery: query,
     lastRouteAction: 'detected'
   };
}

async function routeDirectSearch(state: typeof RouterAnnotation.State): Promise<Partial<typeof RouterAnnotation.State>> {
   console.log('🔍 Router: Routing to direct search processing');
   // This will be handled by the routing tool, but we set context here
   return { lastRouteAction: 'search' };
}

async function routeAnalytics(state: typeof RouterAnnotation.State): Promise<Partial<typeof RouterAnnotation.State>> {
   console.log('📊 Router: Routing to analytics workflow');
   return { lastRouteAction: 'analytics' };
}

async function routeCRUD(state: typeof RouterAnnotation.State): Promise<Partial<typeof RouterAnnotation.State>> {
   console.log('🔧 Router: Routing to CRUD workflow');
   return { lastRouteAction: 'crud' };
}

async function processSearchResult(state: typeof RouterAnnotation.State): Promise<Partial<typeof RouterAnnotation.State>> {
   console.log('🔍 Router: Processing direct search result');

   if (!state.searchResult) {
     console.log('🔍 Router: No search result to render');
     return { finalResult: { success: false, message: 'No search result available' } };
   }

   // For direct search workflows, call orchestrator to render directly
   if (state.workflowType === 'direct_search' && state.orchestrator) {
     console.log('🔍 Router: Calling orchestrator.requestSearchRender() for direct search');

     try {
       await state.orchestrator.requestSearchRender(state.searchResult, state.originalQuery);
       return {
         finalResult: {
           success: true,
           message: 'Direct search results rendered',
           rendered: true
         }
       };
     } catch (error) {
       console.error('🔍 Router: Failed to render search results:', error);
       return {
         finalResult: {
           success: false,
           error: `Failed to render search results: ${error.message}`
         }
       };
     }
   }

   // Fall back to returning result normally
   return { finalResult: state.searchResult };
}

// Factory function to create routing tools with workflow state awareness
function createRoutingTools(orchestrator: any, workflowContext: any = {}) {
  const routeToSearchAgent = tool(
    async ({ userQuery }: { userQuery: string }) => {
        console.log('🔍 Router Tool: Routing to search agent, userQuery:', userQuery);

        try {
            // Actually invoke the search agent
            const result = await searchAgent.invoke({
                messages: [{ role: 'user', content: userQuery }]
            });

            const lastMessage = result.messages[result.messages.length - 1];
            const responseContent = lastMessage.content as string;

            console.log('🔍 Router Tool: Search agent response length:', responseContent.length);

            // Parse the response
            let parsedResponse;
            try {
                parsedResponse = JSON.parse(responseContent);
            } catch (parseError) {
                console.warn('🔍 Router Tool: Search response not JSON, wrapping:', parseError.message);
                parsedResponse = { rawResponse: responseContent };
            }

            // Add to conversation context
            if (parsedResponse.success !== false) {
                const dataContext = createSearchDataContext(parsedResponse);
                addConversation(userQuery, 'search', parsedResponse, dataContext);
            } else {
                addConversation(userQuery, 'search', parsedResponse);
            }

            // For direct search workflows, immediately render through orchestrator
            const isDirectSearch = workflowContext.workflowType === 'direct_search';
            if (isDirectSearch && orchestrator) {
                console.log('🔍 Router Tool: Direct search workflow detected, calling orchestrator.requestSearchRender');
                try {
                    await orchestrator.requestSearchRender(parsedResponse, userQuery);
                    return JSON.stringify({
                        success: true,
                        routedTo: 'search',
                        workflowType: 'direct_search',
                        rendered: true,
                        message: 'Direct search results rendered'
                    });
                } catch (renderError) {
                    console.error('🔍 Router Tool: Failed to render search results:', renderError);
                }
            }

            // Return response for workflow processing
            return JSON.stringify({
                ...parsedResponse,
                routedTo: 'search',
                workflowType: workflowContext.workflowType
            });

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
        description: "Route query to the search agent for finding, locating, and retrieving existing DHIS2 metadata resources. Handles direct search workflow rendering automatically.",
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
              console.log('🔍 Routing query to analytics StateGraph:', userQuery);

              // Initialize state with user query
              const initialState: any = {
                  messages: [{ role: 'user', content: userQuery }],
                  query: userQuery,  // Explicitly set the query for StateGraph processing
                  step: 'classify'   // Set initial step
              };

              // Actually invoke the StateGraph analytics agent with proper initial state
              const result = await stateGraphAgent.invoke({
                  ...initialState,
                  orchestrator: orchestrator // Pass orchestrator reference for selection interrupts
              });

              console.log('📊 StateGraph result:', result);
              console.log('📊 Checking for finalResult:', result.finalResult);
              console.log('📊 finalResult exists:', !!result.finalResult);

              // StateGraph returns final state with finalResult directly
              if (result.finalResult) {
                  const parsedResponse = result.finalResult;
                  console.log('📊 Extracting finalResult:', parsedResponse);

                  // Add to conversation context
                  if (parsedResponse.success !== false) {
                      // Analytics responses may include chart data - add to memory
                      const dataContext = createAnalyticsDataContext(parsedResponse);
                      addConversation(userQuery, 'analytics', parsedResponse, dataContext);
                  } else {
                      addConversation(userQuery, 'analytics', parsedResponse);
                  }

                  return JSON.stringify(parsedResponse);
              } else if (result.error) {
                  console.log('📊 StateGraph returned error:', result.error);
                  const errorResponse = {
                      success: false,
                      error: result.error,
                      routedTo: "state_graph_analytics",
                      originalQuery: userQuery
                  };
                  addConversation(userQuery, 'analytics', errorResponse);
                  return JSON.stringify(errorResponse);
              } else {
                  console.log('📊 No finalResult returned from StateGraph');
                  const errorResponse = {
                      success: false,
                      message: 'No result returned from analytics StateGraph',
                      routedTo: "state_graph_analytics",
                      originalQuery: userQuery,
                      stateKeys: Object.keys(result),
                      stateDump: result
                  };
                  addConversation(userQuery, 'analytics', errorResponse);
                  return JSON.stringify(errorResponse);
              }
          } catch (error) {
              console.error('Error routing to analytics StateGraph:', error);
              const errorResponse = {
                  success: false,
                  error: `Failed to route to analytics StateGraph: ${error.message}`,
                  routedTo: "state_graph_analytics",
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

  // Return all tools from factory
  return {
    routeToSearchAgent,
    routeToCRUDAgent,
    routeToAnalyticsAgent,
    resolveResourceReference
  };
}

// Create StateGraph workflow for state-aware routing
const routerWorkflow = new StateGraph(RouterAnnotation);

// Add nodes
routerWorkflow.addNode('detect_workflow_type', detectWorkflowType);
routerWorkflow.addNode('route_direct_search', routeDirectSearch);
routerWorkflow.addNode('route_analytics', routeAnalytics);
routerWorkflow.addNode('route_crud', routeCRUD);
routerWorkflow.addNode('process_search_result', processSearchResult);

// Add conditional edges based on workflow type
// @ts-ignore
routerWorkflow.addEdge(START, 'detect_workflow_type');

// @ts-ignore
routerWorkflow.addConditionalEdges('detect_workflow_type', (state) => {
  if (state.workflowType === 'direct_search') return 'route_direct_search';
  if (state.workflowType === 'analytics_routing') return 'route_analytics';
  if (state.workflowType === 'crud') return 'route_crud';
  return END;
});

// After routing actions, process search results for direct searches
// @ts-ignore
routerWorkflow.addEdge('route_direct_search', 'process_search_result');

// Terminal nodes (route_analytics, route_crud, process_search_result) don't need edges - they end the workflow

// Compile the router StateGraph
const stateRouterGraph = routerWorkflow.compile();

// Legacy escaped function - no longer needed since we use StateGraph

// Enhanced context-aware router agent with workflow type detection
export function createContextRouterAgent(orchestrator: any) {
  // Function to detect workflow type from query
  const detectWorkflowType = (query: string): string => {
    const queryLower = query.toLowerCase();

    // Determine workflow type based on query analysis
    const isAnalyticsQuery = [
      'analyze', 'calculate', 'compute', 'aggregate', 'trend', 'compare',
      'query', 'extract', 'retrieve', 'sum', 'average', 'min', 'max', 'total',
      'percentage', 'rate', 'performance', 'coverage', 'insights', 'monthly',
      'quarterly', 'yearly', 'how many', 'what is the total', 'calculations'
    ].some(keyword => queryLower.includes(keyword));

    const isCRUDQuery = [
      'create', 'add', 'new', 'make', 'build', 'update', 'change', 'modify',
      'edit', 'revise', 'alter', 'save', 'store', 'upload', 'generate'
    ].some(keyword => queryLower.includes(keyword));

    const isSearchQuery = [
      'find', 'search', 'lookup', 'show', 'list', 'get', 'retrieve', 'display',
      'see', 'view', 'browse', 'explore', 'what are', 'which', 'where is', 'who has',
      'check', 'verify', 'inspect', 'examine', 'review', 'details', 'information',
      'fetch', 'obtain', 'access', 'download', 'export'
    ].some(keyword => queryLower.includes(keyword));

    if (isAnalyticsQuery) return 'analytics_routing';
    if (isCRUDQuery) return 'crud';
    if (isSearchQuery) return 'direct_search';
    return 'unknown';
  };

  // Create tools with workflow context
  const tools = createRoutingTools(orchestrator, { workflowType: 'unknown' });

  const agent = createReactAgent({
    llm: model,
    tools: [tools.routeToSearchAgent, tools.routeToCRUDAgent, tools.routeToAnalyticsAgent, tools.resolveResourceReference],
    prompt: `
    You are a DHIS2 intelligent routing agent. Route queries to specialized agents.

    WORKFLOW TYPE AWARENESS:
    - First, detect if query is 'direct_search', 'analytics_routing', or 'crud'
    - Pass workflow context to routing tools for appropriate handling

    For search queries (find, list, show, etc.):
    - Call route_to_search_agent with direct_search context

    For analytics queries (analyze, calculate, etc.):
    - Call route_to_analytics_agent with analytics_routing context

    For CRUD queries (create, update, etc.):
    - Call route_to_crud_agent with crud context

    Return only JSON results from tools.`,
  });

  // Override invoke to add workflow detection
  const originalInvoke = agent.invoke.bind(agent);
  agent.invoke = async (input: any) => {
    console.log('🔄 Enhanced Router Agent called:', input);

    // Detect workflow type
    const query = input.messages?.find((m: any) => m.role === 'user')?.content || '';
    const workflowType = detectWorkflowType(query);

    console.log(`🔄 Router: Detected workflow type "${workflowType}" for query: ${query}`);

    // Update tools with current workflow context
    const updatedTools = createRoutingTools(orchestrator, { workflowType });
    agent.tools = [updatedTools.routeToSearchAgent, updatedTools.routeToCRUDAgent, updatedTools.routeToAnalyticsAgent, updatedTools.resolveResourceReference];

    // Call original invoke
    const result = await originalInvoke(input);
    console.log('🔄 Router: Result from routing:', result);

    return result;
  };

  return agent;
}
