import { Annotation, END, START, StateGraph } from '@langchain/langgraph/web';
import { AzureChatOpenAI } from '@langchain/openai';
import { HumanMessage } from '@langchain/core/messages';

// Import analytics tools
import { buildAnalyticsChart, getDataElements, queryAnalytics, searchDhis2CategoryOptionCombos } from '../utils/tools/metadata';

// Import LLM-based keyword extraction tools
import { extractOrgUnitKeywordsLLM, filterCategoriesForDisaggregationLLM, extractDatePeriodLLM, extractIndicatorKeywordsLLM } from '../utils/tools/metadata';

// Import 2-level search function
import { searchDhis2Metadata } from '../utils/tools/metadata/helpers';

// Import conversation context
import { addConversation, conversationContext, createAnalyticsDataContext } from '../utils/conversation-context';

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
	datePeriodsMetadata: Annotation<any>({
		reducer: (left, right) => right,
		default: () => null,
	}),
	orgUnitsMetadata: Annotation<any>({
		reducer: (left, right) => right,
		default: () => null,
	}),
	disaggregationsMetadata: Annotation<any>({
		reducer: (left, right) => right,
		default: () => null,
	}),
	data: Annotation<any>({
		reducer: (left, right) => right,
		default: () => null,
	}),
	metaData: Annotation<any>({
		reducer: (left, right) => right,
		default: () => null,
	}),
	chart: Annotation<any>({
		reducer: (left, right) => right,
		default: () => null,
	}),

	// Workflow pause/resume state
	workflowId: Annotation<string>({
		reducer: (left, right) => right,
		default: () => '',
	}),
	workflowPaused: Annotation<boolean>({
		reducer: (left, right) => right,
		default: () => false,
	}),
	selectedItems: Annotation<any[]>({
		reducer: (left, right) => left.concat(right || []),
		default: () => [],
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

	// Orchestrator reference for selection
	orchestrator: Annotation<any>({
		reducer: (left, right) => right,
		default: () => null,
	}),

	cocMapping: Annotation<any>({
		reducer: (left, right) => right,
		default: () => {},
	}),

	optionsToCocs: Annotation<any>({
		reducer: (left, right) => right,
		default: () => {},
	})
});

// LLM-based intent classification with conversation context awareness
async function classifyIntent(state: typeof GraphAnnotation.State): Promise<Partial<typeof GraphAnnotation.State>> {
	console.log('🤖 Classifying intent with LLM for query:', state.query);

	// Extract query from messages if not set
	const query = state.query || state.messages.filter(m => m.role === 'user').pop()?.content || '';
	console.log('🔍 Extracted query:', query);

	// Get recent conversation context to understand if this is a follow-up
	const context = conversationContext.findRelevantContext(query);

	console.log('📚 Conversation context:', {
		hasLastAnalytics: !!context.lastAnalyticsData,
		relevantContexts: context.relevantDataContexts.length,
		lastAnalyticsSummary: context.lastAnalyticsData?.summary
	});

	// Build context summary for LLM
	let contextSummary = '';
	if (context.lastAnalyticsData) {
		contextSummary = `Recent analytics summary: ${context.lastAnalyticsData.summary}`;
	} else if (context.relevantDataContexts.length > 0) {
		const latestContext = context.relevantDataContexts[context.relevantDataContexts.length - 1];
		contextSummary = `Previous context: ${latestContext.summary}`;
	}

	const prompt = `
Analyze this query in the context of DHIS2 analytics. Consider the conversation history.

${contextSummary ? `CONVERSATION CONTEXT:\n${contextSummary}\n\n` : ''}CURRENT QUERY: "${query}"

Classify the intent as one of:
- new_analytics_query: New analytics request requiring data search and visualization
- followup_data_analysis: Follow-up question about existing analytics data (asking about months, values, highest/lowest, trends, etc.)
- non_analytics: Not related to analytics

Return only a JSON object with:
{
  "intent": "new_analytics_query|followup_data_analysis|non_analytics",
  "confidence": "high|medium|low",
  "reasoning": "brief explanation"
}`;

	try {
		const result = await model.invoke([new HumanMessage(prompt)]);
		const response = (result.content as string).trim();

		console.log('🤖 LLM classification response:', response);

		const classification = JSON.parse(response);
		console.log('📊 Parsed classification:', classification);

		if (classification.intent === 'non_analytics') {
			return {
				query,
				step: 'completed',
				finalResult: {
					success: false,
					message: 'Query is not analytics related',
					type: 'non_analytics',
					classification
				}
			};
		}

		// Check if query already includes selected metadata (follow-up query)
		const hasSelectedMetadata = query.toLowerCase().includes('selected metadata:') ||
			query.toLowerCase().includes('analyze using these') ||
			(query.toLowerCase().includes('indicator:') && query.toLowerCase().includes('(id:'));

		if (classification.intent === 'followup_data_analysis' || hasSelectedMetadata) {
			console.log('🔄 Follow-up analytics query detected');
			return {
				query,
				step: hasSelectedMetadata ? 'parse_selected_metadata' : 'analyze_existing_data'
			};
		} else {
			console.log('🆕 New analytics query detected');
			return {
				query,
				step: 'search_metadata'
			};
		}

	} catch (error) {
		console.error('🤖 LLM classification failed:', error);
		// Pure LLM-only fallback - no keywords, multilingual support
		console.log('🔄 LLM classification failed - using intelligent context-based fallback');

		// If we have recent analytics context, assume this is a follow-up query
		// This works regardless of language since we're in analytics workflow
		if (context.lastAnalyticsData) {
			console.log('📊 Recent analytics context found - treating as follow-up analysis');
			return {
				query,
				step: 'analyze_existing_data'
			};
		}

		// Check if query includes selected metadata (works across languages with pattern matching)
		const hasSelectedMetadata = query.toLowerCase().includes('selected metadata:') ||
			query.toLowerCase().includes('analyze using these') ||
			(query.toLowerCase().includes('indicator:') && query.toLowerCase().includes('(id:'));

		if (hasSelectedMetadata) {
			console.log('📋 Selected metadata pattern detected - parsing selection');
			return {
				query,
				step: 'parse_selected_metadata'
			};
		}

		// No context and no special patterns - assume new analytics query
		// Since we're in the analytics agent, user likely wants analytics
		console.log('🆕 No special context - defaulting to new analytics query');
		return {
			query,
			step: 'search_metadata'
		};
	}
}

// Follow-up data analysis function for existing chart data
async function analyzeExistingData(state: typeof GraphAnnotation.State): Promise<Partial<typeof GraphAnnotation.State>> {
	console.log('🔍 Analyzing existing chart data for follow-up query');

	const query = state.query;
	const context = conversationContext.findRelevantContext(query);

	if (!context.lastAnalyticsData) {
		return {
			step: 'completed',
			finalResult: {
				success: false,
				message: 'No previous analytics data available to analyze',
				type: 'analytics'
			}
		};
	}

	const lastResult = context.lastAnalyticsData.data;
	console.log('📊 Last analytics result:', lastResult);

	if (!lastResult?.data) {
		return {
			step: 'completed',
			finalResult: {
				success: false,
				message: 'Previous analytics result has no chart data to analyze',
				type: 'analytics'
			}
		};
	}

	// Use LLM to analyze the existing chart data based on the follow-up question
	const analysisPrompt = `
Analyze this follow-up question about existing analytics data and provide insights.

FOLLOW-UP QUESTION: "${query}"

PREVIOUS ANALYTICS CONTEXT:
- Chart data available: ${JSON.stringify(lastResult.data, null, 2)}

Provide a natural language answer to the follow-up question based on the chart data. Focus on:
- Finding highest/lowest values
- Identifying trends or patterns
- Comparing different categories or time periods
- Extracting specific insights requested

Answer directly and conversationally, as if you're explaining the data to the user.`;

	try {
		const result = await model.invoke([new HumanMessage(analysisPrompt)]);
		const analysis = (result.content as string).trim();

		console.log('📊 Data analysis result:', analysis);

		const analysisResult = {
			success: true,
			message: analysis,
			data: lastResult.data, // Include the original chart data
			metadata: lastResult.metadata,
			queryData: lastResult.queryData,
			type: 'analytics',
			isFollowUpAnalysis: true,
			followUpQuery: query
		};

		// Add to conversation context
		addConversation(query, 'analytics', analysisResult);

		return {
			step: 'completed',
			finalResult: analysisResult
		};

	} catch (error) {
		console.error('❌ Data analysis failed:', error);
		return {
			step: 'completed',
			finalResult: {
				success: false,
				error: `Failed to analyze chart data: ${error.message}`,
				type: 'analytics'
			}
		};
	}
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
		console.log('📊 Searching for analytics metadata using LLM extraction and 2-level search');

		// First, extract indicator/data element keywords using LLM
		const llmResult = await extractIndicatorKeywordsLLM.invoke({
			query: state.query,
			context: 'health analytics - extract measurable indicators and data elements'
		});

		const llmResponse = JSON.parse(llmResult as string);
		console.log('📊 LLM indicator extraction result:', llmResponse);

		// Extract keywords from LLM response
		const indicatorKeywords = llmResponse.keywordCandidates || [];
		console.log('📊 Extracted indicator keywords from LLM:', indicatorKeywords);

		// Create search query from extracted keywords
		let searchQuery = state.query; // Fallback to original query
		if (indicatorKeywords.length > 0) {
			// Use extracted keywords for more targeted search
			searchQuery = indicatorKeywords.join(' ');
			console.log('📊 Using LLM-extracted keywords for search:', searchQuery);
		} else {
			console.log('📊 No keywords extracted by LLM, using original query for search');
		}

		// Search for indicators and data elements using 2-level search (external API first, then DHIS2)
		const indicators = await searchDhis2Metadata('indicators', searchQuery);
		const dataElements = await searchDhis2Metadata('dataElements', searchQuery);

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
			rawSearchResults: {indicators, dataElements}
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
			// Multiple matches found - request selection through orchestrator
			console.log('⏸️ Requesting user selection through orchestrator');

			if (!state.orchestrator) {
				console.error('No orchestrator available for selection');
				return {
					step: 'completed',
					finalResult: {
						success: false,
						message: 'Cannot request user selection - no orchestrator available',
						type: 'analytics'
					}
				};
			}

			// Request selection through orchestrator (this will show UI and wait)
			const selectedItems = await state.orchestrator.requestSelection(
				state.workflowId || 'analytics_workflow',
				suggestions,
				true // Allow multiple selection
			);

			console.log('▶️ Received selection from orchestrator:', selectedItems);

			if (selectedItems && selectedItems.length > 0) {
				// Update metadata with selected items
				const updatedMetadata = {
					...metadata,
					suggestions: selectedItems,
					status: 'user_selected'
				};

				// Continue with query_data using selected items
				return {
					metadata: updatedMetadata,
					step: 'query_data'
				};
			} else {
				// Selection was cancelled
				return {
					step: 'completed',
					finalResult: {
						success: false,
						message: 'Selection was cancelled by user',
						type: 'analytics'
					}
				};
			}
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

		// Extract organisation unit IDs from resolved metadata
		const orgUnitIds: string[] = [];
		if (state.orgUnitsMetadata?.suggestions?.length > 0) {
			orgUnitIds.push(...state.orgUnitsMetadata.suggestions.map((suggestion: any) => suggestion.id));
		}

		// Extract date periods from resolved metadata
		const periods: string[] = [];
		if (state.datePeriodsMetadata?.periods?.length > 0) {
			periods.push(...state.datePeriodsMetadata.periods);
		} else {
			// Fallback to current year if no periods extracted
			const currentYear = new Date().getFullYear().toString();
			periods.push(currentYear);
			console.log('📊 No periods extracted, using current year fallback:', currentYear);
		}

		// Extract disaggregation metadata for filtering structure
		let disaggregationDimensions: string[] = [];
		if (state.disaggregationsMetadata?.suggestions?.length > 0) {
			disaggregationDimensions = state.disaggregationsMetadata.suggestions.map((suggestion: any) => suggestion.formattedDimension);
		}

		// Group suggestions by type to properly handle both indicators and dataElements
		const groupedSuggestions = {
			indicators: state.metadata.suggestions.filter((s: any) => s.type === 'indicator').map((s: any) => s.id),
			dataElements: state.metadata.suggestions.filter((s: any) => s.type === 'dataElement').map((s: any) => s.id)
		};

		console.log('📊 Grouped suggestions:', groupedSuggestions);

		// CRITICAL FIX: Split indicators and dataElements into separate arrays
		// The analytics API requires separate handling for indicators vs dataElements
		const indicators = groupedSuggestions.indicators;
		const dataElements = groupedSuggestions.dataElements;

		const hasIndicators = indicators.length > 0;
		const hasDataElements = dataElements.length > 0;

		// Validate we have something to query
		if (!hasIndicators && !hasDataElements) {
			return {
				step: 'completed',
				finalResult: {
					success: false,
					message: 'No valid indicators or dataElements found for analytics query',
					data: state.metadata,
					type: 'analytics'
				}
			};
		}

		// Determine primary type and include coc dimension when using dataElements
		const primaryType = hasIndicators ? 'indicator' : 'dataElement';
		const includeCocDimension = hasDataElements && !hasIndicators; // Add COC for dataElement-only queries

		// OPTION A: Merge dataElements into indicators since DHIS2 dx dimension accepts mixed ID types
		const dxDimensionIds = [...indicators, ...dataElements];

		const result = await queryAnalytics.invoke({
			indicators: dxDimensionIds,     // All IDs (indicators + dataElements) go to dx dimension
			doc_type: primaryType,
			periods: periods, // Now using resolved date periods
			org_units: orgUnitIds, // Now using resolved organisation units
			disaggregations: disaggregationDimensions, // Now using resolved disaggregation dimensions
			include_coc_dimension: includeCocDimension // Enable COC dimension for dataElement queries
		});

		const data = JSON.parse(result);
		console.log('📊 Data query completed:', data);

		// Add all metadata to conversation context
		addConversation(state.query, 'analytics', {
			...state.metadata,
			orgUnitsMetadata: state.orgUnitsMetadata,
			disaggregationsMetadata: state.disaggregationsMetadata,
			queryData: data
		});

		// Always proceed to chart building - the chart node will handle cases where no data exists
		return {
			data,
			finalResult: !data.data ? {
				success: false,
				message: 'No data found for the analytics query',
				data: {
					metadata: state.metadata,
					orgUnitsMetadata: state.orgUnitsMetadata,
					disaggregationsMetadata: state.disaggregationsMetadata,
					queryData: data
				},
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
				data: {
					metadata: state.metadata,
					orgUnitsMetadata: state.orgUnitsMetadata,
					disaggregationsMetadata: state.disaggregationsMetadata
				},
				type: 'analytics'
			}
		};
	}
}

async function buildChart(state: typeof GraphAnnotation.State): Promise<Partial<typeof GraphAnnotation.State>> {
	try {
		console.log('📊 Building analytics chart using pure DHIS2 data', state);

		// Check if we have analytics data to build chart from
		if (!state.data || !state.data.data) {
			console.warn('📊 No analytics data available - chart building not possible');

			const noDataResult = {
				success: true, // Success in the sense we have metadata but no data
				message: 'Metadata resolved but no analytics data available for visualization',
				data: {
					metadata: state.metadata,
					orgUnitsMetadata: state.orgUnitsMetadata,
					queryData: state.data
				},
				queryData: state.data,
				type: 'analytics',
				chartAttempted: false,
				chartFailed: false,
				chartError: 'No analytics data returned from DHIS2'
			};

			return {
				step: 'completed',
				finalResult: noDataResult
			};
		}
		const result = await buildAnalyticsChart.invoke({
			userQuery: state.query,
			analyticsData: state.data.data, // Pure DHIS2 structured data only
			chartType: 'bar',
			indicators: state.data.indicators || [],
			periods: state.data.periods || ['2024'],
			orgUnits: state.data.org_units || [],
			disaggregations: state.data.disaggregations || [], // Pass the disaggregations from query data
			filterOptions: state.disaggregationsMetadata?.filterOptions || [], // Pass category filter options for chart filtering
			optionsToCocs: state.optionsToCocs,
		});

		const chart = JSON.parse(result);
		console.log('📊 Chart building result:', chart);

		if (chart.success) {
			// Chart building succeeded - trigger chart rendering through orchestrator
			const finalResult = {
				success: true,
				message: 'Analytics query completed successfully',
				data: chart,
				metadata: state.metadata,
				queryData: state.data,
				orgUnitsMetadata: state.orgUnitsMetadata,
				chart: chart,
				type: 'analytics'
			};

			// Add final result to conversation via orchestrator and save to context
			if (state.orchestrator) {
				state.orchestrator.addAssistantMessage(finalResult.message || 'Analytics completed successfully', 'response', finalResult);
				state.orchestrator.renderChart(finalResult);
			}

			// Also save to conversation context with proper DataContext structure
			const dataContext = createAnalyticsDataContext(finalResult);
			addConversation(state.query, 'analytics', finalResult, dataContext);

			return {
				chart,
				step: 'completed',
				finalResult
			};
		} else {
			// Chart building failed - but we still have valid analytics data
			// Create a simple fallback chart structure for orchestrator compatibility
			console.warn('📊 Chart building failed - creating fallback chart visualization');

			// Create a basic chart structure that can be displayed
			const fallbackChartData = {
				success: true,
				chart_id: `fallback_${Date.now()}`,
				chart_type: 'bar',
				title: state.query,
				echarts_option: {
					title: {
						text: 'Analytics Data Available',
						subtext: 'Chart building failed - data available for export',
						left: 'center'
					},
					tooltip: { trigger: 'axis' },
					xAxis: { type: 'category', data: ['Value'] },
					yAxis: { type: 'value' },
					series: [{
						name: 'Count',
						type: 'bar',
            data: [parseFloat(state.data.data?.rows?.[0]?.[6] || '0') || 1], // Extract value from raw analytics data (minimum 1 for visibility)
						itemStyle: { color: '#ff9800' } // Orange color for fallback
					}]
				},
				data_summary: {
					total_points: 1,
					indicators_count: 1,
					periods_count: 1,
					org_units_count: 1,
					disaggregations_count: 0
				}
			};

			const fallbackResult = {
				success: true, // Success because we have valid data
				message: 'Analytics data retrieved successfully (using fallback chart)',
				data: fallbackChartData,  // Consistent structure - data contains the chart result
				metadata: state.metadata,
				queryData: state.data,
				orgUnitsMetadata: state.orgUnitsMetadata,
				chart: fallbackChartData,  // Also available here for consistency
				type: 'analytics',
				chartAttempted: true,
				chartFailed: true,
				chartError: chart.error || 'Chart building failed - fallback visualization created'
			};

			addConversation(state.query, 'analytics', fallbackResult);

			return {
				chart: fallbackChartData,
				step: 'completed',
				finalResult: fallbackResult
			};
		}
	} catch (chartError) {
		console.error('❌ Chart building exception:', chartError);
		// Even if chart building completely fails, we still have the analytics data
		// This is a major improvement: never fail the entire query just because chart fails

		// Create a minimal fallback chart for severe failures
		const minimalFallbackChart = {
			success: true,
			chart_id: `error_${Date.now()}`,
			chart_type: 'bar',
			title: state.query,
			echarts_option: {
				title: {
					text: 'Data Retrieved',
					subtext: 'Visualization error - check console for details',
					left: 'center',
					textStyle: { color: '#666' }
				},
				tooltip: { trigger: 'axis' },
				xAxis: { type: 'category', data: ['Data'] },
				yAxis: { type: 'value' },
				series: [{
					name: 'Value',
					type: 'bar',
					data: [1], // Dummy data to show something
					itemStyle: { color: '#ccc' } // Gray for error state
				}]
			},
			data_summary: {
				total_points: 1,
				indicators_count: 1,
				periods_count: 1,
				org_units_count: 1,
				disaggregations_count: 0
			}
		};

		const fallbackResult = {
			success: true, // Success because analytics data is valid
			message: 'Analytics data retrieved successfully',
			data: minimalFallbackChart,  // Consistent structure - always has chart data
			metadata: state.metadata,
			orgUnitsMetadata: state.orgUnitsMetadata,
			chart: minimalFallbackChart,
			type: 'analytics',
			chartAttempted: true,
			chartFailed: true,
			chartError: chartError.message,
			humanReadable: "Analytics query completed - basic visualization available"
		};

		addConversation(state.query, 'analytics', fallbackResult);

		return {
			chart: minimalFallbackChart,
			step: 'completed',
			finalResult: fallbackResult
		};
	}
}

// New organisation unit resolution function
async function searchOrgUnits(state: typeof GraphAnnotation.State): Promise<Partial<typeof GraphAnnotation.State>> {
	try {
		console.log('🏥 Searching for organisation units in query using LLM extraction');

		// Extract organisation unit keywords using LLM-powered tool
		const llmResult = await extractOrgUnitKeywordsLLM.invoke({
			query: state.query,
			context: 'health analytics - extract geographic locations and organization unit names'
		});

		const llmResponse = JSON.parse(llmResult as string);
		console.log('🏥 LLM extraction result:', llmResponse);

		// Extract keyword candidates from LLM response
		const orgUnitKeywords = llmResponse.keywordCandidates || [];
		console.log('🏥 Extracted org unit keywords from LLM:', orgUnitKeywords);

		// If no keywords found by LLM, fallback to regex extraction as backup
		let keywordsForSearch = orgUnitKeywords;
		if (keywordsForSearch.length === 0) {
			console.log('🏥 No keywords found by LLM, using regex fallback');
			keywordsForSearch = extractOrgUnitKeywords(state.query);
		}

		if (keywordsForSearch.length === 0) {
			console.log('🏥 No organisation unit keywords found, using default org unit');

			// Get the first available org unit as default (often the top-level/root org unit)
			const allOrgUnits = await searchDhis2Metadata('organisationUnits', '', 1); // Get at least one

			if (allOrgUnits.length > 0) {
				const defaultOrgUnit = {
					status: 'default_selected',
					suggestions: [{
						name: allOrgUnits[0].name,
						id: allOrgUnits[0].id,
						type: 'organisationUnit'
					}],
					query: state.query
				};

				console.log('🏥 Using default org unit:', defaultOrgUnit);
				return {
					orgUnitsMetadata: defaultOrgUnit,
					step: 'query_data'
				};
			} else {
				// No org units available
				console.warn('🏥 No organisation units available in DHIS2');
				return {
					step: 'completed',
					finalResult: {
						success: false,
						message: 'No organisation units available for analytics query',
						type: 'analytics'
					}
				};
			}
		}

		// Search for organisation units using extracted keywords
		console.log('🏥 Searching with keywords:', keywordsForSearch);
		const combinedKeywords = keywordsForSearch.join(' ');
		const orgUnits = await searchDhis2Metadata('organisationUnits', combinedKeywords, 10);

		console.log(`🏥 Found ${orgUnits.length} organisation unit matches`);

		// Transform results into analytics metadata format
		const suggestions = orgUnits.map(item => ({
			name: item.name,
			id: item.id,
			type: 'organisationUnit'
		}));

		// Determine status based on results
		const orgUnitsMetadata = {
			status: suggestions.length > 1 ? 'multiple_matches' :
				suggestions.length === 1 ? 'auto_selected' : 'no_match',
			suggestions,
			query: state.query,
			rawSearchResults: orgUnits,
			keywords: keywordsForSearch,
			llmResponse: llmResponse.analysis ? llmResponse : undefined
		};

		console.log('🏥 Organisation units metadata:', orgUnitsMetadata);

		const hasResults = suggestions.length > 0;
		const autoSelected = orgUnitsMetadata.status === 'auto_selected';
		const multipleMatches = orgUnitsMetadata.status === 'multiple_matches';

		if (!hasResults) {
			// No organisation unit matches found
			console.log('🏥 No organisation unit matches found');

			// Try fallback: get root/top-level org unit
			const fallbackOrgUnits = await searchDhis2Metadata('organisationUnits', '', 1);

			if (fallbackOrgUnits.length > 0) {
				const fallbackSuggestion = [{
					name: fallbackOrgUnits[0].name,
					id: fallbackOrgUnits[0].id,
					type: 'organisationUnit'
				}];

				console.log('🏥 Using fallback org unit:', fallbackSuggestion[0]);

				return {
					orgUnitsMetadata: {
						...orgUnitsMetadata,
						status: 'fallback_selected',
						suggestions: fallbackSuggestion
					},
					step: 'query_data'
				};
			} else {
				return {
					orgUnitsMetadata,
					step: 'completed',
					finalResult: {
						success: false,
						message: 'No organisation units found for analytics query',
						data: orgUnitsMetadata,
						type: 'analytics'
					}
				};
			}
		} else if (multipleMatches) {
			// Multiple matches found - request selection through orchestrator
			console.log('⏸️ Requesting org unit selection through orchestrator');

			if (!state.orchestrator) {
				console.error('No orchestrator available for org unit selection');
				return {
					step: 'completed',
					finalResult: {
						success: false,
						message: 'Cannot request organisation unit selection - no orchestrator available',
						type: 'analytics'
					}
				};
			}

			// Request selection through orchestrator (this will show UI and wait)
			const selectedItems = await state.orchestrator.requestSelection(
				state.workflowId || 'org_units_workflow',
				suggestions,
				true // Allow multiple selection for org units
			);

			console.log('▶️ Received org unit selection from orchestrator:', selectedItems);

			if (selectedItems && selectedItems.length > 0) {
				// Update metadata with selected items
				const updatedOrgUnitsMetadata = {
					...orgUnitsMetadata,
					suggestions: selectedItems,
					status: 'user_selected'
				};

				// Continue with query_data using selected org units
				return {
					orgUnitsMetadata: updatedOrgUnitsMetadata,
					step: 'query_data'
				};
			} else {
				// Selection was cancelled
				return {
					step: 'completed',
					finalResult: {
						success: false,
						message: 'Organisation unit selection was cancelled by user',
						type: 'analytics'
					}
				};
			}
		} else {
			// Single match or auto-selected - proceed directly to query
			return {
				orgUnitsMetadata,
				step: 'query_data'
			};
		}
	} catch (error) {
		console.error('🏥 Organisation unit search failed:', error);
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

async function searchDisaggregations(state: typeof GraphAnnotation.State): Promise<Partial<typeof GraphAnnotation.State>> {
	try {
		console.log('🔢 Searching for disaggregations in query using LLM extraction');

		// Initialize cocMapping for the entire function scope
		let cocMapping: Record<string, string[]> = state.cocMapping || {};

		// Extract available categories directly from dataElements categoryCombo (no extra API calls needed)
		let availableCategories: Array<{name: string, id: string}> = [];

		// Check if we have dataElements in metadata
		if (state.metadata?.suggestions?.some((s: any) => s.type === 'dataElement')) {
			const dataElementIds = state.metadata.suggestions
				.filter((s: any) => s.type === 'dataElement')
				.map((s: any) => s.id);

			// Fetch dataElements with category structure (this contains full categoryCombo)
			try {
				const toolResult = await getDataElements.invoke({
					filters: { id: `in:[${dataElementIds.join(',')}]` }
				});
				const dataElementsWithCategories = JSON.parse(toolResult as string);

				// Format: {"dataElements": [{"categoryCombo": {"categories": [{"name":"","id":"","categoryOptions":[...]}]}}]}
				const categoryMap = new Map<string, {name: string, categoryOptions: any[]}>();

				dataElementsWithCategories.dataElements?.forEach((de: any) => {
					de.categoryCombo?.categories?.forEach((cat: any) => {
						// Keep full category info including categoryOptions for dimension generation
						if (!categoryMap.has(cat.id)) {
							categoryMap.set(cat.id, {
								name: cat.name,
								categoryOptions: cat.categoryOptions || []
							});
						}
					});
				});

				// Convert to simple format for LLM filtering
				availableCategories = Array.from(categoryMap.entries()).map(([id, {name}]) => ({ id, name }));
				console.log('🔢 Available categories from dataElements:', availableCategories);

				// Store full category details for later dimension generation
				// @ts-ignore - Adding non-property to state
				state.fullCategoryDetails = categoryMap;

				// Query for COCs that belong to the categoryCombos used by these dataElements
				const categoryComboIds = [...new Set(dataElementsWithCategories.dataElements?.map((de: any) => de.categoryCombo?.id).filter(id => id))];

				if (categoryComboIds.length > 0) {
					try {
						// Use direct API call instead of search tool for categoryCombo filtering
						const { Dhis2Api } = await import('../utils/app-runtime/dhis2-api');

						const cocResponse = await (Dhis2Api as any).query({
							categoryOptionCombos: {
								resource: 'categoryOptionCombos.json',
								params: {
									filter: `categoryCombo.id:in:[${categoryComboIds.join(',')}]`,
									fields: 'id,categoryOptions[id]',
									paging: false
								}
							}
						});

						const categoryOptionCombos = cocResponse?.data?.categoryOptionCombos?.categoryOptionCombos || [];

						categoryOptionCombos.forEach((coc: any) => {
							coc.categoryOptions?.forEach((opt: any) => {
								if (!cocMapping[opt.id]) cocMapping[opt.id] = [];
								cocMapping[opt.id].push(coc.id);
							});
						});
						state.cocMapping = cocMapping;
						console.log('🔢 Built accurate COC to category options mapping from categoryOptionCombos API');
					} catch (cocError) {
						console.warn('🔢 Failed to fetch categoryOptionCombos:', cocError.message);
					}
				}

			} catch (dataElementError) {
				console.warn('🔢 Failed to fetch dataElement categories:', dataElementError.message);
				availableCategories = [];
			}
		}

		// Use LLM to filter categories for disaggregation
		const llmResult = await filterCategoriesForDisaggregationLLM.invoke({
			query: state.query,
			availableCategories
		});

		const llmResponse = JSON.parse(llmResult as string);
		console.log('🔢 LLM category filtering result:', llmResponse);

		// Extract selected categories from LLM response
		const selectedCategories = llmResponse.selectedCategories || [];
		console.log('🔢 Selected categories from LLM:', selectedCategories, state);

		const hasAvailableCategories = availableCategories.length > 0;
		const hasSelectedCategories = selectedCategories.length > 0;

		if (!hasAvailableCategories || !hasSelectedCategories) {
			console.log('🔢 No dataElements or no disaggregation categories selected - proceeding without disaggregation');

			// No disaggregations found or no dataElements - proceed to query data
			const noDisaggMetadata = {
				status: 'none_found',
				suggestions: [],
				query: state.query,
				llmResponse: llmResponse,
				availableCategories: availableCategories
			};

			return {
				disaggregationsMetadata: noDisaggMetadata,
				step: 'query_data'
			};
		}

		// Build optionToCocs mapping only for validated options from selected categories
		const optionToCocs: Record<string, string[]> = {};

		// Only include options that were validated/selected during disaggregation search
		for (const selectedCategory of selectedCategories) {
			const fullCategoryInfo = (state as any).fullCategoryDetails?.get(selectedCategory.id);
			if (!fullCategoryInfo) continue;

			const { categoryOptions: allOptions } = fullCategoryInfo;

			// Get valid options (those that appear in COCs)
			const validOptions = allOptions.filter((opt: any) => {
				// Check if this option appears in any COC
				return Object.keys(cocMapping).includes(opt.id);
			});

			// Build optionToCocs for valid options only
			validOptions.forEach((opt: any) => {
				optionToCocs[opt.id] = [...cocMapping[opt.id]];
			});
		}

		console.log('🔢 Built optionToCocs mapping with', Object.keys(optionToCocs).length, 'validated options', state);

		// Store optionToCocs on state
		(state as any).optionToCocs = optionToCocs;

		const suggestions: any[] = [];
		const filterOptions: any[] = [];

		// @ts-ignore - Access the stored full category details
		const fullCategoryDetails = state.fullCategoryDetails || new Map();

		for (const selectedCategory of selectedCategories) {
			// Get full category info from the already-fetched data
			const fullCategoryInfo = fullCategoryDetails.get(selectedCategory.id);
			if (!fullCategoryInfo) continue;

			const { name: categoryName, categoryOptions: allOptions } = fullCategoryInfo;

			// Cross-reference with cocMapping to only include options that appear in COCs
			const validOptions = allOptions.filter((opt: any) => {
				// Check if this option appears in any COC
				return Object.keys(cocMapping).includes(opt.id);
			});

			console.log(`🔢 Category ${categoryName}: ${allOptions.length} total options, ${validOptions.length} valid options in COCs`);

			if (validOptions.length === 0) {
				console.log(`🔢 Skipping category ${categoryName} - no options appear in COCs`);
				continue;
			}

			// Create dimension suggestion with category_id and valid option_ids only
			const optionIds = validOptions.map((opt: any) => opt.id).join(';');
			suggestions.push({
				name: `Disaggregate by ${categoryName}`,
				id: `dimension_${selectedCategory.id}`, // Composite ID for the category dimension
				categoryId: selectedCategory.id, // Actual DHIS2 category ID
				categoryName: categoryName,
				optionIds: optionIds,
				optionCount: validOptions.length,
				type: 'categoryDimension',
				formattedDimension: `${selectedCategory.id}:${optionIds}`
			});

			// Construct category options for filtering - only include options that appear in COCs
			const categoryOptionNames = validOptions.map((opt: any) => opt.name || opt.displayName || opt.id);
			filterOptions.push({
				categoryId: selectedCategory.id,
				categoryName: categoryName,
				options: categoryOptionNames,
				optionIds: validOptions.map((opt: any) => opt.id),
				type: 'categoryFilter'
			});
		}

		// optionToCocs will be built from cocMapping in buildAnalyticsChart

		// Determine status based on results
		const disaggregationsMetadata = {
			status: suggestions.length > 3 ? 'multiple_matches' : // Allow more for disagg since they can be combined
				suggestions.length === 1 ? 'auto_selected' : 'no_match',
			suggestions,
			filterOptions, // Include the constructed category options for filtering
			query: state.query,
			rawSearchResults: suggestions, // Use actual generated suggestions
			selectedCategories: selectedCategories,
			llmResponse: llmResponse
		};

		console.log('🔢 Disaggregations metadata:', disaggregationsMetadata);

		const hasResults = suggestions.length > 0;
		const autoSelected = disaggregationsMetadata.status === 'auto_selected';
		const multipleMatches = disaggregationsMetadata.status === 'multiple_matches';

		if (!hasResults) {
			// No disaggregation matches found
			console.log('🔢 No category option combo matches found');

			return {
				disaggregationsMetadata: {
					...disaggregationsMetadata,
					status: 'none_found'
				},
				step: 'query_data'
			};
		} else if (multipleMatches) {
			// Multiple matches found - request selection through orchestrator
			console.log('⏸️ Requesting disaggregation selection through orchestrator');

			if (!state.orchestrator) {
				console.error('No orchestrator available for disaggregation selection');
				return {
					step: 'completed',
					finalResult: {
						success: false,
						message: 'Cannot request disaggregation selection - no orchestrator available',
						type: 'analytics'
					}
				};
			}

			// Request selection through orchestrator (this will show UI and wait)
			const selectedItems = await state.orchestrator.requestSelection(
				state.workflowId || 'disaggregations_workflow',
				suggestions,
				true // Allow multiple selection for disaggregations
			);

			console.log('▶️ Received disaggregation selection from orchestrator:', selectedItems);

			if (selectedItems && selectedItems.length > 0) {
				// Update metadata with selected items
				const updatedDisaggMetadata = {
					...disaggregationsMetadata,
					suggestions: selectedItems,
					status: 'user_selected'
				};

				// Continue with query_data using selected disaggregations
				return {
					disaggregationsMetadata: updatedDisaggMetadata,
					optionsToCocs: optionToCocs,
					step: 'query_data'
				};
			} else {
				// Selection was cancelled - proceed without disaggregations
				console.log('⏭️ Disaggregation selection cancelled - proceeding without disaggregation');

				const cancelledDisaggMetadata = {
					...disaggregationsMetadata,
					status: 'cancelled',
					suggestions: []
				};

				return {
					disaggregationsMetadata: cancelledDisaggMetadata,
					optionsToCocs: optionToCocs,
					step: 'query_data'
				};
			}
		} else {
			// Single match or auto-selected - proceed directly to query
			return {
				disaggregationsMetadata,
				optionsToCocs: optionToCocs,
				step: 'query_data'
			};
		}
	} catch (error) {
		console.error('🔢 Disaggregation search failed:', error);
		return {
			step: 'completed',
			finalResult: {
				success: false,
				error: error.message,
				message: 'Disaggregation search failed',
				type: 'analytics'
			}
		};
	}
}

// New date period resolution function
async function searchDatePeriods(state: typeof GraphAnnotation.State): Promise<Partial<typeof GraphAnnotation.State>> {
	try {
		console.log('📅 Searching for date periods in query using LLM extraction');

		// Extract date/period references using LLM-powered tool
		const llmResult = await extractDatePeriodLLM.invoke({
			query: state.query,
			context: 'health analytics - extract time periods for data analysis'
		});

		const llmResponse = JSON.parse(llmResult as string);
		console.log('📅 LLM date period extraction result:', llmResponse);

		// Extract periods from LLM response
		const extractedPeriods = llmResponse.periods || [];
		console.log('📅 Extracted periods from LLM:', extractedPeriods);

		// If no periods found by LLM, use default period (current year)
		if (extractedPeriods.length === 0) {
			console.log('📅 No periods found by LLM, using default current year');

			const currentYear = new Date().getFullYear().toString();
			const defaultPeriodMetadata = {
				status: 'default_selected',
				periods: [currentYear],
				query: state.query,
				method: 'default_fallback',
				llmResponse: llmResponse
			};

			console.log('📅 Using default period:', currentYear);
			return {
				datePeriodsMetadata: defaultPeriodMetadata,
				step: 'query_data'
			};
		}

		// Create metadata object with extracted periods
		const datePeriodsMetadata = {
			status: 'extracted',
			periods: extractedPeriods,
			query: state.query,
			method: 'llm_extraction',
			llmResponse: llmResponse,
			matchedPhrases: llmResponse.matchedPhrases || [],
			periodTypes: llmResponse.periodTypes || [],
			confidence: llmResponse.confidence || 'medium'
		};

		console.log('📅 Date periods metadata:', datePeriodsMetadata);

		return {
			datePeriodsMetadata,
			step: 'query_data'
		};

	} catch (error) {
		console.error('📅 Date period search failed:', error);

		// Graceful fallback - use current year
		console.log('📅 Using fallback period due to error');

		const currentYear = new Date().getFullYear().toString();
		const fallbackPeriodsMetadata = {
			status: 'fallback_selected',
			periods: [currentYear],
			query: state.query,
			method: 'error_fallback',
			error: error.message
		};

		return {
			datePeriodsMetadata: fallbackPeriodsMetadata,
			step: 'query_data'
		};
	}
}

// Helper function to extract organisation unit keywords from query
function extractOrgUnitKeywords(query: string): string[] {
	const keywords: string[] = [];

	// Convert to lowercase for matching
	const queryLower = query.toLowerCase();

	// Administrative levels and geographic terms
	const adminLevels = [
		'country', 'countries', 'province', 'provinces', 'district', 'districts',
		'county', 'counties', 'region', 'regions', 'state', 'states',
		'municipality', 'municipalities', 'town', 'towns', 'city', 'cities',
		'village', 'villages', 'ward', 'wards', 'subdistrict', 'subdistricts',
		'level 1', 'level 2', 'level 3', 'level 4', 'level 5'
	];

	// Facility types and health system terms
	const facilityTypes = [
		'hospital', 'hospitals', 'clinic', 'clinics', 'health center', 'health centers',
		'medical center', 'medical centers', 'facility', 'facilities', 'centre', 'centres',
		'center', 'centers', 'health post', 'health posts', 'dispensary', 'dispensaries'
	];

	// Common organisation unit patterns
	const orgUnitPatterns = [
		// Geographic patterns: "in [location]", "for [location]", "at [location]"
		/in\s+([a-zA-Z\s]+?)(?:\s|$|[,.;:!?])/gi,
		/for\s+([a-zA-Z\s]+?)(?:\s|$|[,.;:!?])/gi,
		/at\s+([a-zA-Z\s]+?)(?:\s|$|[,.;:!?])/gi,
		/(?:in|at|for)\s+the\s+([a-zA-Z\s]+?)(?:\s|$|[,.;:!?])/gi,
		// Organisation unit names: quoted strings, proper nouns
		/"([^"]+)"/g,
		/'([^']+)'/g,
		// Specific patterns for common formats
		/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g, // Title Case words
	];

	// Check for administrative and facility keywords
	for (const level of adminLevels) {
		if (queryLower.includes(level)) {
			keywords.push(level.charAt(0).toUpperCase() + level.slice(1)); // Capitalize first letter
		}
	}

	for (const facility of facilityTypes) {
		if (queryLower.includes(facility)) {
			keywords.push(facility.charAt(0).toUpperCase() + facility.slice(1)); // Capitalize first letter
		}
	}

	// Extract using patterns
	orgUnitPatterns.forEach(pattern => {
		let match: any;
		while ((match = pattern.exec(queryLower)) !== null) {
			const extracted = match[1].trim();
			if (extracted.length > 2) { // Ignore very short matches
				keywords.push(extracted);
			}
		}
	});

	// Remove duplicates and clean up
	return [...new Set(keywords)].filter(keyword =>
		keyword.length > 2 && !/\b(and|the|for|in|at|of|with|by|from|a|an|is|are|were|was)\b/i.test(keyword)
	);
}

// Create the StateGraph workflow according to LangGraph docs
const workflow = new StateGraph(GraphAnnotation);

// Add nodes
workflow.addNode('classify_intent', classifyIntent);
workflow.addNode('analyze_existing_data', analyzeExistingData);
workflow.addNode('parse_selected_metadata', parseSelectedMetadata);
workflow.addNode('search_metadata', searchMetadata);
workflow.addNode('search_date_periods', searchDatePeriods);
workflow.addNode('search_org_units', searchOrgUnits);
workflow.addNode('search_disaggregations', searchDisaggregations);
workflow.addNode('query_data', queryData);
workflow.addNode('build_chart', buildChart);

// Add edges
// @ts-ignore
workflow.addEdge(START, 'classify_intent');

/**
 * Simplified Linear Flow for Analytics:
 * 1. Intent Classification
 * 2. Metadata Resolution (indicators/dataElements + orgUnits)
 * 3. Data Query (DHIS2 Analytics API)
 * 4. Chart Building (from DHIS2 data rows)
 *
 * This ensures charts always render when DHIS2 returns valid analytics data.
 */

// @ts-ignore
workflow.addConditionalEdges('classify_intent', (state) => {
	if (state.step === 'search_metadata') return 'search_metadata';
	if (state.step === 'parse_selected_metadata') return 'parse_selected_metadata';
	if (state.step === 'analyze_existing_data') return 'analyze_existing_data';
	return END;
});

// Direct edges for reliable flow - always attempt next step
// @ts-ignore
workflow.addEdge('parse_selected_metadata', 'query_data'); // Selected metadata always goes to data query
// @ts-ignore
workflow.addEdge('search_metadata', 'search_date_periods'); // Always try date period search after metadata search
// @ts-ignore
workflow.addEdge('search_date_periods', 'search_org_units'); // Always try org unit search after date period search
// @ts-ignore
workflow.addEdge('search_org_units', 'search_disaggregations'); // Always try disaggregation search after org unit search
// @ts-ignore
workflow.addEdge('search_disaggregations', 'query_data');   // Always proceed to data query after disaggregation attempt
// @ts-ignore
workflow.addEdge('query_data', 'build_chart');             // Always try chart building after data query
// @ts-ignore
workflow.addEdge('build_chart', END);
// @ts-ignore
workflow.addEdge('analyze_existing_data', END);            // Follow-up analysis completes workflow

// Compile the workflow
const stateGraphAgent = workflow.compile();

export { stateGraphAgent as analyticsGraphAgent, GraphAnnotation };
