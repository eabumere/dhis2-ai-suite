import { StateGraph, START, END, Annotation } from '@langchain/langgraph/web';

// Import analytics tools
import {
  queryAnalytics,
  buildAnalyticsChart,
} from '../utils/tools/metadata';

// Import 2-level search function
import { searchDhis2Metadata } from '../utils/tools/metadata/helpers';

// Import conversation context
import { conversationContext, findRelevantContext, addConversation } from '../utils/conversation-context';

// Define the state using Annotation API (as per LangGraph official docs)
const GraphAnnotation = Annotation.Root({
  // Input state
  messages: Annotation<any[]>({
    reducer: (left: any[], right: any) => {
      if (Array.isArray(right)) {
        return left.concat(right);
      }
      return left.concat([right]);
    },
    default: () => [],
  }),

  // Processing state
  query: Annotation<string>({
    reducer: (left, right) => right,
    default: () => '',
  }),
  step: Annotation<string>({
    reducer: (left, right) => right,
    default: () => 'classify',
  }),

  // Analytics workflow state
  metadata: Annotation<any>({
    reducer: (left, right) => right,
    default: () => null,
  }),
  data: Annotation<any>({
    reducer: (left, right) => right,
    default: () => null,
  }),
  chart: Annotation<any>({
    reducer: (left, right) => right,
    default: () => null,
  }),

  // Output state
  finalResult: Annotation<any>({
    reducer: (left, right) => right,
    default: () => null,
  }),
  error: Annotation<string>({
    reducer: (left, right) => right,
    default: () => '',
  }),
});

// Node functions for the StateGraph
async function classifyIntent(state: typeof GraphAnnotation.State): Promise<Partial<typeof GraphAnnotation.State>> {
  console.log('🔍 Classifying intent for query:', state.query);

  // Extract query from messages if not set
  const query = state.query || state.messages.filter(m => m.role === 'user').pop()?.content || '';
  console.log('🔍 Extracted query:', query);

  const queryLower = query.toLowerCase();
  const analyticsKeywords = ['analyze', 'calculate', 'compute', 'aggregate', 'trend', 'compare', 'query', 'extract', 'retrieve data values', 'analytics', 'reporting', 'sum', 'average', 'min', 'max', 'total', 'percentage', 'rate', 'coverage', 'performance', 'insights', 'time series', 'monthly', 'quarterly', 'yearly', 'time periods', 'over time', 'how many', 'what is the total', 'calculations', 'data analysis'];

  const isAnalytics = analyticsKeywords.some(keyword => queryLower.includes(keyword));

  // Check if query already includes selected metadata (follow-up query)
  const hasSelectedMetadata = queryLower.includes('selected metadata:') ||
                             queryLower.includes('analyze using these') ||
                             queryLower.includes('indicator:') && queryLower.includes('(id:');

  if (!isAnalytics) {
    return {
      query,
      step: 'completed',
      finalResult: {
        success: false,
        message: 'Query is not analytics related',
        type: 'non_analytics'
      }
    };
  }

  console.log('📊 Analytics query detected, includes selected metadata:', hasSelectedMetadata);

  return {
    query,
    step: hasSelectedMetadata ? 'parse_selected_metadata' : 'search_metadata'
  };
}

async function parseSelectedMetadata(state: typeof GraphAnnotation.State): Promise<Partial<typeof GraphAnnotation.State>> {
  console.log('🔄 Parsing selected metadata from follow-up query');

  const query = state.query.toLowerCase();

  // Parse selected metadata from the query format: "Analyze using these selected metadata: indicator:name(ID:id), ..."
  const suggestions = [];
  const regex = /(indicator|dataElement):([^,(]+)\(ID:([^)]+)\)/gi;

  let match;
  while ((match = regex.exec(query)) !== null) {
    const [, type, name, id] = match;
    suggestions.push({
      name: name.trim(),
      id: id.trim(),
      type: type
    });
  }

  console.log('📊 Parsed selected metadata:', suggestions);

  if (suggestions.length === 0) {
    return {
      step: 'completed',
      finalResult: {
        success: false,
        message: 'Could not parse selected metadata from query',
        type: 'analytics'
      }
    };
  }

  // Create metadata object with selected items
  const metadata = {
    status: 'user_selected',
    suggestions,
    query: state.query,
    isFollowUpSelection: true
  };

  addConversation(state.query, 'analytics', metadata);

  return {
    metadata,
    step: 'query_data'
  };
}

async function searchMetadata(state: typeof GraphAnnotation.State): Promise<Partial<typeof GraphAnnotation.State>> {
  try {
    console.log('📊 Searching for analytics metadata using 2-level search (external + DHIS2 fallback)');

    // Search for indicators and data elements using 2-level search (external API first, then DHIS2)
    const indicators = await searchDhis2Metadata('indicators', state.query);
    const dataElements = await searchDhis2Metadata('dataElements', state.query);

    console.log(`📊 Found ${indicators.length} indicators and ${dataElements.length} data elements`);

    // Combine and transform results into analytics metadata format
    const suggestions = [];

    // Transform indicators
    suggestions.push(...indicators.map(item => ({
      name: item.name,
      id: item.id,
      type: 'indicator'
    })));

    // Transform data elements
    suggestions.push(...dataElements.map(item => ({
      name: item.name,
      id: item.id,
      type: 'dataElement'
    })));

    // Create metadata object in expected format
    const metadata = {
      status: suggestions.length > 1 ? 'multiple_matches' :
             suggestions.length === 1 ? 'auto_selected' : 'no_match',
      suggestions,
      query: state.query,
      rawSearchResults: { indicators, dataElements }
    };

    console.log('📊 Analytics metadata:', metadata);

    // Check if we found relevant metadata
    const hasResults = suggestions.length > 0;
    const autoSelected = metadata.status === 'auto_selected';
    const multipleMatches = metadata.status === 'multiple_matches';

    addConversation(state.query, 'analytics', metadata);

    if (!hasResults) {
      // No matches found
      return {
        metadata,
        step: 'completed',
        finalResult: {
          success: false,
          message: 'No relevant analytics metadata found',
          data: metadata,
          type: 'analytics'
        }
      };
    } else if (multipleMatches) {
      // Multiple matches found - require user selection
      return {
        metadata,
        step: 'completed',
        finalResult: {
          success: true,
          message: `Found ${suggestions.length} potential indicators/data elements for analysis. Please select which ones to use.`,
          data: metadata,
          type: 'analytics_selection_required',
          requiresSelection: true,
          selectionOptions: suggestions
        }
      };
    } else {
      // Single match or auto-selected - proceed to query
      return {
        metadata,
        step: 'query_data'
      };
    }
  } catch (error) {
    console.error('Metadata search failed:', error);
    return {
      error: error.message,
      step: 'completed',
      finalResult: {
        success: false,
        error: error.message,
        type: 'analytics'
      }
    };
  }
}

async function queryData(state: typeof GraphAnnotation.State): Promise<Partial<typeof GraphAnnotation.State>> {
  try {
    console.log('📊 Querying analytics data');

    if (!state.metadata?.suggestions?.length) {
      return {
        step: 'completed',
        finalResult: {
          success: false,
          message: 'Insufficient metadata for data query',
          data: state.metadata,
          type: 'analytics'
        }
      };
    }

    // Use the first suggestion for now (simplified approach)
    const suggestion = state.metadata.suggestions[0];
    const isIndicator = suggestion.type === 'indicator';

    const result = await queryAnalytics.invoke({
      indicators: isIndicator ? [suggestion.id] : [],
      doc_type: isIndicator ? 'indicator' : 'dataElement',
      periods: ['2024'], // Default
      org_units: [], // Would need org unit resolution
      disaggregations: []
    });

    const data = JSON.parse(result);
    console.log('📊 Data query completed:', data);

    addConversation(state.query, 'analytics', { ...state.metadata, queryData: data });

    return {
      data,
      step: data.data ? 'build_chart' : 'completed',
      finalResult: !data.data ? {
        success: false,
        message: 'No data found for the analytics query',
        data: { metadata: state.metadata, queryData: data },
        type: 'analytics'
      } : undefined
    };
  } catch (error) {
    console.error('Data query failed:', error);
    return {
      error: error.message,
      step: 'completed',
      finalResult: {
        success: false,
        error: error.message,
        data: state.metadata,
        type: 'analytics'
      }
    };
  }
}

async function buildChart(state: typeof GraphAnnotation.State): Promise<Partial<typeof GraphAnnotation.State>> {
  try {
    console.log('📊 Building analytics chart');

    const result = await buildAnalyticsChart.invoke({
      userQuery: state.query,
      analyticsData: state.data.data,
      chartType: 'bar',
      indicators: state.data.indicators || [],
      periods: state.data.periods || ['2024'],
      orgUnits: state.data.org_units || [],
      disaggregations: state.data.disaggregations || []
    });

    const chart = JSON.parse(result);
    console.log('📊 Chart building completed:', chart);

    const finalResult = chart.success ? {
      success: true,
      message: 'Analytics query completed successfully',
      data: chart,
      metadata: state.metadata,
      queryData: state.data,
      chart: chart,
      type: 'analytics'
    } : {
      success: false,
      message: 'Chart building failed',
      data: { metadata: state.metadata, queryData: state.data, chart },
      chart: chart,
      type: 'analytics'
    };

    addConversation(state.query, 'analytics', finalResult);

    return {
      chart,
      step: 'completed',
      finalResult
    };
  } catch (error) {
    console.error('Chart building failed:', error);
    return {
      error: error.message,
      step: 'completed',
      finalResult: {
        success: false,
        error: error.message,
        data: { metadata: state.metadata, queryData: state.data },
        type: 'analytics'
      }
    };
  }
}

// Create the StateGraph workflow according to LangGraph docs
const workflow = new StateGraph(GraphAnnotation);

// Add nodes
workflow.addNode('classify_intent', classifyIntent);
workflow.addNode('parse_selected_metadata', parseSelectedMetadata);
workflow.addNode('search_metadata', searchMetadata);
workflow.addNode('query_data', queryData);
workflow.addNode('build_chart', buildChart);

// Add edges
workflow.addEdge(START, 'classify_intent');

// Conditional routing based on step
// Since LangGraph v0.4, conditional edges can use a path map or function
// Here we use conditional edges for routing after each node
workflow.addConditionalEdges('classify_intent', (state) => {
  if (state.step === 'search_metadata') return 'search_metadata';
  if (state.step === 'parse_selected_metadata') return 'parse_selected_metadata';
  return END;
});
workflow.addConditionalEdges('parse_selected_metadata', (state) => state.step === 'query_data' ? 'query_data' : END);
workflow.addConditionalEdges('search_metadata', (state) => state.step === 'query_data' ? 'query_data' : END);
workflow.addConditionalEdges('query_data', (state) => state.step === 'build_chart' ? 'build_chart' : END);
workflow.addEdge('build_chart', END);

// Compile the workflow
const stateGraphAgent = workflow.compile();

export { stateGraphAgent, GraphAnnotation };
