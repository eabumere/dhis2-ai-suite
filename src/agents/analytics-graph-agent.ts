import { Annotation, END, START, StateGraph } from '@langchain/langgraph/web';

// Import analytics tools
import { buildAnalyticsChart, queryAnalytics } from '../utils/tools/metadata';

// Import LLM-based org unit keyword extraction
import { extractOrgUnitKeywordsLLM } from '../utils/tools/metadata';

// Import 2-level search function
import { searchDhis2Metadata } from '../utils/tools/metadata/helpers';

// Import conversation context
import { addConversation } from '../utils/conversation-context';

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
	orgUnitsMetadata: Annotation<any>({
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

		console.log('📊 Using org units for query:', orgUnitIds);

		// Use the first suggestion for now (simplified approach)
		const suggestion = state.metadata.suggestions[0];
		const isIndicator = suggestion.type === 'indicator';

		const result = await queryAnalytics.invoke({
			indicators: isIndicator ? [suggestion.id] : [],
			doc_type: isIndicator ? 'indicator' : 'dataElement',
			periods: ['2024'], // Default
			org_units: orgUnitIds, // Now using resolved organisation units
			disaggregations: []
		});

		const data = JSON.parse(result);
		console.log('📊 Data query completed:', data);

		// Add org units metadata to conversation context
		addConversation(state.query, 'analytics', {
			...state.metadata,
			orgUnitsMetadata: state.orgUnitsMetadata,
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
					orgUnitsMetadata: state.orgUnitsMetadata
				},
				type: 'analytics'
			}
		};
	}
}

async function buildChart(state: typeof GraphAnnotation.State): Promise<Partial<typeof GraphAnnotation.State>> {
	try {
		console.log('📊 Building analytics chart using pure DHIS2 data');

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

		// CRITICAL: Use ONLY structured DHIS2 data for chart building
		// Avoid any mixing with LLM interpretation data
		const result = await buildAnalyticsChart.invoke({
			userQuery: state.query,
			analyticsData: state.data.data, // Pure DHIS2 structured data only
			chartType: 'bar',
			indicators: state.data.indicators || [],
			periods: state.data.periods || ['2024'],
			orgUnits: state.data.org_units || [],
			disaggregations: state.data.disaggregations || []
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

			addConversation(state.query, 'analytics', finalResult);

			// Explicitly trigger chart rendering through orchestrator
			if (state.orchestrator) {
				state.orchestrator.renderChart(finalResult);
			}

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
						data: [parseFloat(state.data.data?.rows?.[0]?.[6] || '0') || 0], // Extract value from raw analytics data
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
workflow.addNode('parse_selected_metadata', parseSelectedMetadata);
workflow.addNode('search_metadata', searchMetadata);
workflow.addNode('search_org_units', searchOrgUnits);
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
	return END;
});

// Direct edges for reliable flow - always attempt next step
// @ts-ignore
workflow.addEdge('parse_selected_metadata', 'query_data'); // Selected metadata always goes to data query
// @ts-ignore
workflow.addEdge('search_metadata', 'search_org_units');    // Always try org unit search after metadata search
// @ts-ignore
workflow.addEdge('search_org_units', 'query_data');         // Always proceed to data query after org unit attempt
// @ts-ignore
workflow.addEdge('query_data', 'build_chart');             // Always try chart building after data query
// @ts-ignore
workflow.addEdge('build_chart', END);

// Compile the workflow
const stateGraphAgent = workflow.compile();

export { stateGraphAgent as analyticsGraphAgent, GraphAnnotation };
