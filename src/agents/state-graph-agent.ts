import { StateGraph, END } from '@langchain/langgraph';
import { AzureChatOpenAI } from '@langchain/openai';
import { tool } from '@langchain/core/tools';
import { MessagesAnnotation, START, StateGraphArgs } from '@langchain/langgraph/web';
import { z } from 'zod';

// Import tools
import {
  // Search tools
  searchDhis2DataElements,
  searchDhis2OrganisationUnits,
  searchDhis2Categories,
  searchDhis2CategoryCombos,
  searchDhis2DataSets,
  searchDhis2Programs,
  searchDhis2Indicators,
  searchDhis2CategoryOptions,
  searchDhis2OrganisationUnitGroups,
  searchDhis2OrganisationUnitGroupSets,
  searchDhis2TrackedEntityTypes,
  searchDhis2TrackedEntityAttributes,
  searchDhis2Validations,
  searchDhis2OptionSets,
  searchDhis2Visualizations,
  searchDhis2Dashboards,
  searchDhis2Users,
  searchDhis2RelationshipTypes,

  // CRUD tools
  createDhis2DataElement,
  createDhis2OrganisationUnit,
  createDhis2Category,
  createDhis2CategoryCombo,
  createDhis2CategoryOption,
  createDhis2DataSet,
  createDhis2Program,
  createDhis2Indicator,
  createDhis2User,
  createDhis2Option,
  createDhis2OptionSet,
  createDhis2TrackedEntityType,

  updateDhis2DataElement,
  updateDhis2OrganisationUnit,
  updateDhis2Category,

  // Analytics tools
  searchAnalyticsMetadata,
  queryAnalytics,
  buildAnalyticsChart,
  filterAnalyticsChart,
  exportAnalyticsChart,

  // Utility tools
  resolveResourceReference
} from '../utils/tools/metadata';

// Import conversation context
import { conversationContext, findRelevantContext, addConversation, createAnalyticsDataContext, createSearchDataContext, createMutationDataContext } from '../utils/conversation-context';

// Initialize the ChatOpenAI model
const model = new AzureChatOpenAI({
  model: (import.meta as any).env.DHIS2_OPENAI_MODEL,
  temperature: 0,
  maxTokens: undefined,
  azureOpenAIApiKey: (import.meta as any).env.DHIS2_AZURE_KEY,
  azureOpenAIEndpoint: (import.meta as any).env.DHIS2_AZURE_ENDPOINT,
  azureOpenAIApiDeploymentName: (import.meta as any).env.DHIS2_AZURE_API_DEPLOYMENT_NAME,
  azureOpenAIApiVersion: (import.meta as any).env.DHIS2_AZURE_API_VERSION,
});

// Define the StateGraph state structure
interface GraphState {
  // Core properties
  messages: any[];
  query: string;
  intent: 'search' | 'crud' | 'analytics' | 'unknown';
  context: any;

  // Search operation state
  searchResults?: any[];
  searchCompleted?: boolean;

  // CRUD operation state
  crudOperation?: 'create' | 'update';
  crudType?: string;
  crudData?: any;
  crudCompleted?: boolean;

  // Analytics operation state
  analyticsStep?: 'metadata' | 'query' | 'chart' | 'complete';
  metadataSearch?: any;
  dataQuery?: any;
  chartData?: any;
  analyticsCompleted?: boolean;

  // Completion state
  finalResult?: any;
  error?: string;
  completed: boolean;
}

// Define the StateGraph configuration
const graphState: StateGraphArgs<GraphState>["channels"] = {
  messages: { value: (x: any[], y: any[]) => x.concat(y) },
  query: null,
  intent: null,
  context: null,
  searchResults: null,
  searchCompleted: null,
  crudOperation: null,
  crudType: null,
  crudData: null,
  crudCompleted: null,
  analyticsStep: null,
  metadataSearch: null,
  dataQuery: null,
  chartData: null,
  analyticsCompleted: null,
  finalResult: null,
  error: null,
  completed: null
};

// Create the StateGraph
const workflow = new StateGraph<GraphState>({ channels: graphState });

// ==================== NODES ====================

/**
 * Node 1: Initialize and extract query from messages
 */
async function initialize(state: GraphState): Promise<Partial<GraphState>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const query = lastMessage?.content || '';

  // Get conversation context
  const context = findRelevantContext(query);

  return {
    query,
    context,
    completed: false
  };
}

/**
 * Node 2: Classify intent using LLM (simple classification)
 */
async function classifyIntent(state: GraphState): Promise<Partial<GraphState>> {
  const query = state.query.toLowerCase();

  // Simple keyword-based intent classification (fast, no recursion)
  const searchKeywords = ['find', 'search', 'show', 'list', 'get', 'retrieve', 'display', 'see', 'view', 'discover', 'browse', 'explore', 'what are', 'which', 'where is', 'who has', 'check', 'verify', 'inspect', 'examine', 'review', 'details', 'information', 'fetch', 'obtain', 'access', 'download'];
  const crudKeywords = ['create', 'add', 'new', 'make', 'build', 'setup', 'establish', 'develop', 'update', 'change', 'modify', 'edit', 'revise', 'alter', 'rename', 'adjust', 'save', 'store', 'upload', 'import', 'insert', 'put', 'generate', 'produce', 'construct', 'design', 'configure'];
  const analyticsKeywords = ['analyze', 'calculate', 'compute', 'aggregate', 'trend', 'compare', 'query', 'extract', 'retrieve data values', 'analytics', 'reporting', 'sum', 'average', 'min', 'max', 'total', 'percentage', 'rate', 'coverage', 'performance', 'insights', 'time series', 'monthly', 'quarterly', 'yearly', 'time periods', 'over time', 'how many', 'what is the total', 'calculations', 'data analysis'];

  let intent: 'search' | 'crud' | 'analytics' | 'unknown' = 'unknown';

  const hasSearch = searchKeywords.some(kw => query.includes(kw));
  const hasCRUD = crudKeywords.some(kw => query.includes(kw));
  const hasAnalytics = analyticsKeywords.some(kw => query.includes(kw));

  // Priority order: analytics > CRUD > search (analytics is most complex)
  if (hasAnalytics) {
    intent = 'analytics';
  } else if (hasCRUD) {
    intent = 'crud';
  } else if (hasSearch) {
    intent = 'search';
  }

  return { intent };
}

/**
 * Node 3: Execute search operations
 */
async function executeSearch(state: GraphState): Promise<Partial<GraphState>> {
  try {
    console.log(`🔍 Executing search for: ${state.query}`);

    // Determine which search tool to use based on query content
    const queryLower = state.query.toLowerCase();
    let searchTool: any = searchDhis2DataElements; // default
    let metadataType = 'dataElements';

    if (queryLower.includes('organisation') || queryLower.includes('org unit') || queryLower.includes('facility')) {
      searchTool = searchDhis2OrganisationUnits;
      metadataType = 'organisationUnits';
    } else if (queryLower.includes('category') && !queryLower.includes('option') && !queryLower.includes('combo')) {
      searchTool = searchDhis2Categories;
      metadataType = 'categories';
    } else if (queryLower.includes('category option')) {
      searchTool = searchDhis2CategoryOptions;
      metadataType = 'categoryOptions';
    } else if (queryLower.includes('category combo')) {
      searchTool = searchDhis2CategoryCombos;
      metadataType = 'categoryCombos';
    } else if (queryLower.includes('data set')) {
      searchTool = searchDhis2DataSets;
      metadataType = 'dataSets';
    } else if (queryLower.includes('program')) {
      searchTool = searchDhis2Programs;
      metadataType = 'programs';
    } else if (queryLower.includes('indicator')) {
      searchTool = searchDhis2Indicators;
      metadataType = 'indicators';
    }

    // Execute the search
    const result = await searchTool({ query: state.query, limit: 10 });
    const parsedResult = JSON.parse(result);

    // Add to conversation context
    addConversation(state.query, 'search', parsedResult);

    return {
      searchResults: parsedResult.results || [parsedResult],
      searchCompleted: true,
      finalResult: {
        success: true,
        message: `Found ${parsedResult.count || 0} results`,
        data: parsedResult.results || parsedResult,
        type: 'search'
      },
      completed: true
    };
  } catch (error) {
    console.error('Search execution failed:', error);
    return {
      error: `Search failed: ${error.message}`,
      finalResult: {
        success: false,
        error: error.message,
        type: 'search'
      },
      completed: true
    };
  }
}

/**
 * Node 4: Execute CRUD operations
 */
async function executeCRUD(state: GraphState): Promise<Partial<GraphState>> {
  try {
    console.log(`🔧 Executing CRUD for: ${state.query}`);

    // Determine operation and type
    const queryLower = state.query.toLowerCase();
    const isCreate = /create|add|new|make|build|setup|establish|develop/i.test(queryLower);
    const operation: 'create' | 'update' = isCreate ? 'create' : 'update';

    // Determine CRUD type and tool
    let crudTool: any = createDhis2DataElement; // default
    let crudType = 'dataElements';

    if (queryLower.includes('data element')) {
      crudTool = isCreate ? createDhis2DataElement : updateDhis2DataElement;
      crudType = 'dataElements';
    } else if (queryLower.includes('category') && !queryLower.includes('option')) {
      crudTool = isCreate ? createDhis2Category : updateDhis2Category;
      crudType = 'categories';
    } else if (queryLower.includes('organisation unit') || queryLower.includes('facility')) {
      crudTool = isCreate ? createDhis2OrganisationUnit : updateDhis2OrganisationUnit;
      crudType = 'organisationUnits';
    } else if (queryLower.includes('indicator')) {
      crudTool = isCreate ? createDhis2Indicator : updateDhis2Indicator;
      crudType = 'indicators';
    }

    // For now, return invalid as we need LLM to extract parameters
    return {
      crudOperation: operation,
      crudType,
      crudData: {}, // Would be filled by LLM extraction
      crudCompleted: true,
      finalResult: {
        success: false,
        message: 'CRUD operations require manual tool invocation',
        type: 'crud',
        operation,
        crudType
      },
      completed: true
    };
  } catch (error) {
    console.error('CRUD execution failed:', error);
    return {
      error: `CRUD failed: ${error.message}`,
      finalResult: {
        success: false,
        error: error.message,
        type: 'crud'
      },
      completed: true
    };
  }
}

/**
 * Node 5: Execute analytics operations (sub-workflow)
 */
async function executeAnalytics(state: GraphState): Promise<Partial<GraphState>> {
  try {
    console.log(`📊 Starting analytics workflow for: ${state.query}`);

    // Step 1: Search for relevant metadata
    const metadataResult = await searchAnalyticsMetadata({ query: state.query });
    const metadata = JSON.parse(metadataResult);

    // Step 2: If we found relevant indicators/data elements, query analytics
    let dataQuery: any = null;
    if (metadata.status === 'auto_selected' || metadata.suggestions?.length > 0) {
      const selectedId = metadata.selected?.id ||
        (metadata.suggestions?.[0]?.indicator ? metadata.suggestions[0].indicator.id : metadata.suggestions?.[0]?.id);

      if (selectedId) {
        // Query analytics data
        const isIndicator = metadata.suggestions?.[0]?.type === 'indicator';
        const queryResult = await queryAnalytics({
          indicators: isIndicator ? [selectedId] : [],
          doc_type: isIndicator ? 'indicator' : 'dataElement',
          periods: ['2024'], // Default to current year
          org_units: [], // Would need to be resolved
          disaggregations: []
        });
        dataQuery = JSON.parse(queryResult);
      }
    }

    // Step 3: Build chart if we have data
    let chartData: any = null;
    if (dataQuery?.data) {
      const chartResult = await buildAnalyticsChart({
        userQuery: state.query,
        analyticsData: dataQuery.data,
        chartType: 'bar',
        indicators: dataQuery.indicators || [],
        periods: dataQuery.periods || ['2024'],
        orgUnits: dataQuery.org_units || [],
        disaggregations: dataQuery.disaggregations || []
      });
      chartData = JSON.parse(chartResult);
    }

    // Add to conversation context
    if (chartData?.success) {
      addConversation(state.query, 'analytics', chartData, createAnalyticsDataContext(chartData));
    } else {
      addConversation(state.query, 'analytics', { metadata, dataQuery, chartData });
    }

    return {
      metadataSearch: metadata,
      dataQuery: dataQuery,
      chartData: chartData,
      analyticsStep: 'complete',
      analyticsCompleted: true,
      finalResult: {
        success: chartData?.success || false,
        message: chartData?.success ? 'Analytics query completed' : 'Analytics query failed',
        data: chartData || { metadata, dataQuery },
        metadata: metadata,
        chart: chartData,
        type: 'analytics'
      },
      completed: true
    };
  } catch (error) {
    console.error('Analytics execution failed:', error);
    return {
      error: `Analytics failed: ${error.message}`,
      analyticsCompleted: true,
      finalResult: {
        success: false,
        error: error.message,
        type: 'analytics'
      },
      completed: true
    };
  }
}

/**
 * Node 6: Handle unknown intent
 */
async function handleUnknown(state: GraphState): Promise<Partial<GraphState>> {
  return {
    error: 'Could not determine query intent',
    finalResult: {
      success: false,
      error: 'Could not determine whether this is a search, CRUD, or analytics query',
      type: 'unknown'
    },
    completed: true
  };
}

// ==================== EDGES AND CONDITIONAL LOGIC ====================

/**
 * Conditional function to determine next node based on intent
 */
function routeBasedOnIntent(state: GraphState): string {
  switch (state.intent) {
    case 'search':
      return 'execute_search';
    case 'crud':
      return 'execute_crud';
    case 'analytics':
      return 'execute_analytics';
    case 'unknown':
    default:
      return 'handle_unknown';
  }
}

/**
 * Check if the workflow should end
 */
function shouldEnd(state: GraphState): boolean {
  return state.completed === true && (state.finalResult !== undefined || state.error !== undefined);
}

// ==================== BUILD THE GRAPH ====================

// Add nodes
workflow.addNode('initialize', initialize);
workflow.addNode('classify_intent', classifyIntent);
workflow.addNode('execute_search', executeSearch);
workflow.addNode('execute_crud', executeCRUD);
workflow.addNode('execute_analytics', executeAnalytics);
workflow.addNode('handle_unknown', handleUnknown);

// Add edges
workflow.addEdge(START, 'initialize');
workflow.addEdge('initialize', 'classify_intent');
workflow.addConditionalEdges('classify_intent', routeBasedOnIntent);

// All execution nodes lead to completion
workflow.addEdge('execute_search', END);
workflow.addEdge('execute_crud', END);
workflow.addEdge('execute_analytics', END);
workflow.addEdge('handle_unknown', END);

// Compile the workflow
export const stateGraphAgent = workflow.compile();

// Export state annotation for use in other parts
export const StateAnnotation = MessagesAnnotation;
