import { Annotation, END, START, StateGraph } from '@langchain/langgraph/web';
import { ChatModels } from '../utils/chat-model-factory';
import { HumanMessage } from '@langchain/core/messages';

// Import analytics tools
import {
	buildAnalyticsChart,
	getDataElements,
	queryAnalytics,
	searchDhis2CategoryOptionCombos
} from '../utils/tools/metadata';

// Import LLM-based keyword extraction tools
import {
	extractOrgUnitKeywordsLLM,
	filterCategoriesForDisaggregationLLM,
	extractDatePeriodLLM,
	extractIndicatorKeywordsLLM,
	extractAnalyticsIntent
} from '../utils/tools/metadata';

// Import 2-level search function
import { searchDhis2Metadata } from '../utils/tools/metadata/helpers';

// Import conversation context
import { addConversation, createAnalyticsDataContext } from '../utils/conversation-context';
// Initialize the ChatOpenAI model with Azure configuration
const model = ChatModels.createAgentModel();

// Direct analytics data storage functions (using IndexedDB)
import { indexedDBStorage } from '../utils/indexeddb-storage';
import { conversationContext } from '../utils/conversation-context';

function saveAnalyticsDataDirectly(analyticsResult: any): void {
	try {
		// Get current session ID to associate analytics with session
		const currentSession = conversationContext.getCurrentSession();
		const sessionId = currentSession.sessionId || 'unknown_session';

		// Create a compressed version with essential data only
		const analyticsData = {
			id: `analytics_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
			timestamp: Date.now(),
			query: analyticsResult.query || '',
			summary: analyticsResult.message || '',
			sessionId: sessionId, // Associate with current session
			chartData: analyticsResult.chartData || null,
			dataSummary: analyticsResult.dataSummary || null,
			metadata: {
				indicators: analyticsResult.metadata?.suggestions?.map((s: any) => s.name) || [],
				periods: analyticsResult.datePeriodsMetadata?.periods || [],
				orgUnits: analyticsResult.orgUnitsMetadata?.suggestions?.map((s: any) => s.name) || []
			},
			// Store minimal data needed for follow-up analysis
			rawData: {
				chartValues: analyticsResult.dataSummary ? {
					totalRecords: analyticsResult.dataSummary.totalRecords,
					totalValue: analyticsResult.dataSummary.totalValue,
					averageValue: analyticsResult.dataSummary.averageValue,
					minValue: analyticsResult.dataSummary.minValue,
					maxValue: analyticsResult.dataSummary.maxValue,
					periodData: analyticsResult.chartData?.echarts_option?.xAxis?.data || [],
					valueData: analyticsResult.chartData?.echarts_option?.series?.[0]?.data || []
				} : null
			}
		};

		indexedDBStorage.saveAnalytics(analyticsData);
		console.log('💾 Analytics data saved directly to IndexedDB for session:', sessionId, analyticsData);
	} catch (error) {
		console.warn('Failed to save analytics data directly:', error);
	}
}

async function getAnalyticsDataDirectly(): Promise<any | null> {
	try {
		// Get current session ID to filter analytics by session
		const currentSession = conversationContext.getCurrentSession();
		const sessionId = currentSession.sessionId;

		if (!sessionId) {
			console.log('⚠️ No active session found, skipping analytics data retrieval');
			return null;
		}

		// Load analytics data for the current session only
		const data = await indexedDBStorage.loadLatestAnalyticsForSession(sessionId);
		if (data) {
			// Check if data is recent (within last hour) and belongs to current session
			const isRecent = Date.now() - data.timestamp < 60 * 60 * 1000;
			if (isRecent) {
				console.log('📖 Analytics data retrieved from IndexedDB for current session:', sessionId);
				return data;
			} else {
				console.log('⏰ Analytics data is too old, ignoring');
				// Note: Old data will be cleaned up by the storage quota management
			}
		} else {
			console.log('📭 No analytics data found for current session:', sessionId);
		}
	} catch (error) {
		console.warn('Failed to retrieve analytics data directly:', error);
	}
	return null;
}

// Recovery context interface for analytics agent
export interface AnalyticsRecoveryContext {
	failedStep: string;
	errorDetails: any;
	recoveryOptions: RecoveryOption[];
	userGuidance: string;
}

export interface RecoveryOption {
	id: string;
	label: string;
	description: string;
	action: () => Promise<Partial<typeof GraphAnnotation.State>>;
}

// Define the state using Annotation API (as per LangGraph official docs)
const GraphAnnotation = Annotation.Root({
	// Recovery context for handling failures
	recoveryContext: Annotation<AnalyticsRecoveryContext | null>({
		reducer: (left, right) => right || left,
		default: () => null
	}),

	// Input state
	messages: Annotation<any[]>({
		reducer: (left: any[], right: any[]) => {
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
	chartData: Annotation<any>({
		reducer: (left, right) => right,
		default: () => null,
	}),
	chartError: Annotation<string>({
		reducer: (left, right) => right,
		default: () => '',
	}),
	dataSummary: Annotation<{
		totalRecords: number;
		totalValue: number;
		averageValue: number;
		minValue: number;
		maxValue: number;
		nonZeroCount: number;
		orgUnitCount: number;
		periodCount: number;
		indicatorCount: number;
		summaryText: string;
		insights: string[];
	}>({
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

	// Progress tracking state
	workflowProgress: Annotation<{
		currentStep: number;
		totalSteps: number;
		stepName: string;
		message: string;
		isIndeterminate?: boolean;
	}>({
		reducer: (left, right) => right || left,
		default: () => ({
			currentStep: 0,
			totalSteps: 8,
			stepName: 'Initializing',
			message: 'Preparing analytics workflow...',
			isIndeterminate: true
		}),
	}),

	// UI action state for orchestrator communication
	uiAction: Annotation<string>({
		reducer: (left, right) => right || left,
		default: () => '',
	}),

	recoveryAction: Annotation<string>({
		reducer: (left, right) => right || left,
		default: () => '',
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
		default: () => {
		},
	}),

	optionsToCocs: Annotation<any>({
		reducer: (left, right) => right,
		default: () => {
		},
	}),

	// ✅ NEW INTENT EXTRACTION STATE (PHASE 2)
	// Complete extracted analytics intent from unified LLM extraction
	intent: Annotation<any>({
		reducer: (left, right) => right || left,
		default: () => null
	}),

	// ✅ INDICATOR MAPPING BETWEEN LLM NAMES AND ACTUAL SELECTED INDICATORS
	// This maps the exact string from LLM intent to the final selected indicator
	intentIndicatorMapping: Annotation<Record<string, any>>({
		reducer: (left, right) => right || left,
		default: () => ({})
	}),

	// Intent dimension resolution state
	dimensions: Annotation<{
		dx: any[],
		ou: any[],
		pe: any[],
		co: any[],
		filters: any[]
	}>({
		reducer: (left, right) => ({...left, ...right}),
		default: () => ({dx: [], ou: [], pe: [], co: [], filters: []})
	}),

	// Intent conditions processing state
	conditions: Annotation<any[]>({
		reducer: (left, right) => right || left,
		default: () => []
	}),

	// Intent ranking processing state
	ranking: Annotation<any>({
		reducer: (left, right) => right || left,
		default: () => null
	}),

	// Intent visualization preferences
	visualization: Annotation<any>({
		reducer: (left, right) => right || left,
		default: () => null
	}),

	// ✅ NEW PHASE 7: Per-series visualization configuration
	seriesConfig: Annotation<Array<{
		indicatorId: string;
		indicatorName: string;
		chartType: 'line' | 'bar' | 'area' | 'scatter';
		yAxisIndex: number;
		color?: string;
		showLabel?: boolean;
		smooth?: boolean;
	}>>({
		reducer: (left, right) => right || left,
		default: () => []
	}),

	visualizationConfig: Annotation<{
		title?: string;
		showLegend?: boolean;
		showGrid?: boolean;
		stacked?: boolean;
		dualAxis?: boolean;
		detectedChartType?: string;
		finalChartType?: string;
		fallbackReason?: string;
		axisLabels: {
			x?: string;
			y?: string;
			y2?: string;
		};
	}>({
		reducer: (left, right) => ({...left, ...right}),
		default: () => ({
			showLegend: true,
			showGrid: true,
			stacked: false,
			dualAxis: false,
			axisLabels: {}
		})
	})
});

// LLM-based intent classification with conversation context awareness
// Progress tracking helper with improved step management
function updateProgress(step: number, stepName: string, message: string, isIndeterminate = false): Partial<typeof GraphAnnotation.State> {
	return {
		workflowProgress: {
			currentStep: step,
			totalSteps: 8,
			stepName,
			message,
			isIndeterminate
		}
	};
}

// Helper to advance progress and send UI updates
function advanceProgress(state: typeof GraphAnnotation.State, step: number, stepName: string, message: string, isIndeterminate = false): void {
	// Update the workflow progress state
	const progressUpdate = updateProgress(step, stepName, message, isIndeterminate);

	// Send progress message to orchestrator for UI display
	state.orchestrator?.addProgressMessage(message, {
		progress: step / 8 * 100, // Convert to percentage
		currentStep: step,
		totalSteps: 8,
		stepName,
		isIndeterminate,
		workflowId: state.workflowId
	});

	console.log(`📊 Progress: Step ${step}/8 - ${stepName}: ${message}`);
}

async function classifyIntent(state: typeof GraphAnnotation.State): Promise<Partial<typeof GraphAnnotation.State>> {
	console.log('🤖 Classifying intent with LLM for query:', state.query);

	// Update progress
	updateProgress(1, 'Analyzing Query', 'Understanding your analytics request...', false);
	state.orchestrator?.addProgressMessage('Understanding your analytics request...');

	// Extract query from messages if not set
	const query = state.query || state.messages.filter(m => m.role === 'user').pop()?.content || '';
	console.log('🔍 Extracted query:', query);

	// Check if this is an empty query (agent selected from dropdown without user input)
	const trimmedQuery = query.trim();
	if (!trimmedQuery) {
		console.log('📊 Empty query detected - providing analytics interface');

		// Check if we have recent analytics data available for follow-up
		const directAnalyticsData = await getAnalyticsDataDirectly();

		if (directAnalyticsData) {
			console.log('🔄 Recent analytics data found - offering follow-up analysis');
			return {
				query: '',
				step: 'analyze_existing_data'
			};
		} else {
			console.log('🆕 No recent analytics data - showing analytics options');
			// No recent data and no query - provide analytics welcome interface
			return {
				query: '',
				step: 'completed',
				finalResult: {
					success: true,
					message: 'Welcome to Analytics! I can help you analyze health data from DHIS2. Here are some things I can do:\n\n📊 **Create Charts & Reports**\n- Show trends over time\n- Compare data across locations\n- Analyze indicators and data elements\n\n🔍 **Explore Data**\n- Search for available indicators\n- Find data elements and categories\n- Browse organisation units\n\n📈 **Ask Questions**\n- "Show me HIV testing data for the last year"\n- "Compare malaria cases between districts"\n- "What are the top performing health facilities?"\n\n💡 **Tip:** Try typing a question above or select from available options.',
					type: 'analytics',
					showAnalyticsInterface: true,
					actions: [
						{
							type: 'show_recent_analytics',
							label: '📊 Recent Analytics',
							description: 'View your recent analytics queries'
						},
						{
							type: 'explore_metadata',
							label: '🔍 Explore Data',
							description: 'Browse available indicators and data elements'
						}
					]
				}
			};
		}
	}

	// First try direct IndexedDB for analytics data (bypasses conversation context issues)
	const directAnalyticsData = await getAnalyticsDataDirectly();

	// Also get conversation context as fallback
	const context = conversationContext.findRelevantContext(query);

	console.log('📚 Context check:', {
		directAnalyticsFound: !!directAnalyticsData,
		conversationLastAnalytics: !!context.lastAnalyticsData,
		directSummary: directAnalyticsData?.summary?.substring(0, 50) + '...'
	});

	// Build context summary for LLM - include existing analytics data if available
	let contextSummary = '';
	if (context.lastAnalyticsData) {
		contextSummary = `Recent analytics summary: ${context.lastAnalyticsData.summary}`;
	} else if (context.relevantDataContexts.length > 0) {
		const latestContext = context.relevantDataContexts[context.relevantDataContexts.length - 1];
		contextSummary = `Previous context: ${latestContext.summary}`;
	}

	const prompt = `
Analyze this analytics query. You understand multiple languages (English, French, Spanish, Arabic, Portuguese).

${contextSummary ? `CONTEXT: ${contextSummary}\n\n` : ''}QUERY: "${query}"

Classify intent:
- new_analytics_query: New analytics request (charts, analysis, reports)
- followup_data_analysis: Follow-up about existing data (trends, values, comparisons)
- non_analytics: Not analytics-related

Return JSON:
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

		// Pure LLM-based routing - no keyword checks
		if (classification.intent === 'followup_data_analysis' || classification.intent === 'follow_up') {
			console.log('🔄 Follow-up analytics query detected by LLM');
			return {
				query,
				step: 'analyze_existing_data'
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

// ✅ NEW EXTRACT INTENT NODE (PHASE 3)
async function extractIntent(state: typeof GraphAnnotation.State): Promise<Partial<typeof GraphAnnotation.State>> {
	console.log('🔍 Extracting complete analytics intent with unified LLM', state.query);

	// Update progress
	updateProgress(2, 'Finding Indicators', 'Searching for relevant data indicators...', false);
	state.orchestrator?.addProgressMessage('Searching for relevant data indicators...');

	try {
		// Call the new unified extractAnalyticsIntent tool
		const intentResult = await extractAnalyticsIntent.invoke({
			query: state.query,
			context: 'DHIS2 health analytics query',
			existingAnalyticsData: await getAnalyticsDataDirectly()
		});

		const intent = JSON.parse(intentResult as string);
		console.log('✅ Extracted analytics intent:', intent);

		const indicatorKeywords = intent.dimensions?.dx || [];
		const disaggregationKeywords = intent.apiHints?.columns || [];
		console.log('📊 Extracted from unified LLM:', {
			indicators: indicatorKeywords,
			orgUnits: intent.dimensions?.ou || [],
			periods: intent.dimensions?.pe || [],
			disaggregations: disaggregationKeywords
		});

		// Create search queries from extracted keywords
		let searchQueries: string[] = [state.query]; // Fallback to original query
		if (indicatorKeywords.length > 0) {
			// ✅ Use EACH extracted keyword INDIVIDUALLY for targeted search (multi-indicator support)
			// LLM returns separate indicators like ["TX_CURR", "HIV Case Finding Rate"] - search each separately
			searchQueries = indicatorKeywords;
			console.log('📊 Using LLM-extracted keywords for individual search:', searchQueries);
		} else {
			console.log('📊 No keywords extracted by LLM, using original query for search');
		}

		// ✅ 100% PER KEYWORD PROCESSING ONLY
		// No bulk search, no merged results, no aggregate lists
		// Each keyword is processed independently, results never merged

		const selection: any[] = [];
		const collision: string[] = [];
		const autoSelection: any[] = [];
		const processedIds = new Set<string>();
		const selectedKeywords: string[] = [];
		const unselectedKeywords: string[] = [];

		// Process each extracted keyword INDIVIDUALLY
		for (const keyword of indicatorKeywords) {
			// Clean keyword: remove quotes, trim whitespace
			const cleanedKeyword = keyword.trim().replace(/^['"]|['"]$/g, '');

			console.log(`🔍 Processing keyword: "${cleanedKeyword}"`);

			// Run separate search FOR THIS KEYWORD ONLY
			const indicatorResults = await searchDhis2Metadata('indicators', cleanedKeyword, 1000);
			const dataElementResults = await searchDhis2Metadata('dataElements', cleanedKeyword, 1000);

			console.log(`✅ Results: ${indicatorResults.length} indicators, ${dataElementResults.length} dataElements`);

			// Find EXACT MATCH ONLY (no partial matches)
			const indicatorMatch = indicatorResults.find(i =>
				i.id.trim() === cleanedKeyword.trim() ||
				i.name.trim().toLowerCase() === cleanedKeyword.trim().toLowerCase()
			);

			const dataElementMatch = dataElementResults.find(i =>
				i.id.trim() === cleanedKeyword.trim() ||
				i.name.trim().toLowerCase() === cleanedKeyword.trim().toLowerCase()
			);

			if (indicatorMatch && dataElementMatch) {
				// ✅ COLLISION: exists in both types
				unselectedKeywords.push(keyword)
				if (!processedIds.has(indicatorMatch.id)) {
					selection.push({
						name: indicatorMatch.name,
						id: indicatorMatch.id,
						type: 'indicator'
					});
					processedIds.add(indicatorMatch.id);
				}
				if (!processedIds.has(dataElementMatch.id)) {
					selection.push({
						name: dataElementMatch.name,
						id: dataElementMatch.id,
						type: 'dataElement'
					});
					processedIds.add(dataElementMatch.id);
				}
				collision.push(cleanedKeyword);
				console.log(`⚠️ Collision detected for: "${cleanedKeyword}" - added 2 items to selection`);
			} else if (indicatorMatch && !dataElementMatch) {
				// ✅ AUTO SELECT: only exists as indicator
				selectedKeywords.push(keyword);
				if (!processedIds.has(indicatorMatch.id)) {
					autoSelection.push({
						name: indicatorMatch.name,
						id: indicatorMatch.id,
						type: 'indicator'
					});
					processedIds.add(indicatorMatch.id);
					console.log(`✅ Auto-selected indicator: "${indicatorMatch.name}"`);
				}
			} else if (dataElementMatch && !indicatorMatch) {
				// ✅ AUTO SELECT: only exists as dataElement
				selectedKeywords.push(keyword);
				if (!processedIds.has(dataElementMatch.id)) {
					autoSelection.push({
						name: dataElementMatch.name,
						id: dataElementMatch.id,
						type: 'dataElement'
					});
					processedIds.add(dataElementMatch.id);
					console.log(`✅ Auto-selected dataElement: "${dataElementMatch.name}"`);
				}
			} else {
				// ✅ NO EXACT MATCH: add all search results to selection
				console.log(`⚠️ No exact match for "${cleanedKeyword}" - adding all ${indicatorResults.length + dataElementResults.length} results to selection`);
				unselectedKeywords.push(keyword);
				for (const item of indicatorResults) {
					if (!processedIds.has(item.id)) {
						selection.push({
							name: item.name,
							id: item.id,
							type: 'indicator'
						});
						processedIds.add(item.id);
					}
				}

				for (const item of dataElementResults) {
					if (!processedIds.has(item.id)) {
						selection.push({
							name: item.name,
							id: item.id,
							type: 'dataElement'
						});
						processedIds.add(item.id);
					}
				}
			}
		}

		// Create metadata object in expected format
		const metadata = {
			status: selection.length > 0 ? 'multiple_matches' :
				autoSelection.length >= 1 ? 'auto_selected' : 'no_match',
			suggestions: [...autoSelection, ...selection],
			query: state.query,
			rawSearchResults: {
				extraction: intent // ✅ SAVE THE FULL EXTRACTION OBJECT WITH orgUnits AND periods
			}
		};

		console.log('📊 Analytics metadata:', metadata);

		// Check if we found relevant metadata
		const hasResults = autoSelection.length + selection.length > 0;
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

			try {
				console.log(`📊 Processing complete: ${autoSelection.length} auto-selected, ${selection.length} require user selection`);

				// ✅ ONLY SHOW SELECTION UI IF THERE ARE ITEMS TO SELECT
				let userSelectedItems: any[] = [];

				if (selection.length > 0) {
					// ✅ Filter out auto-selected items from selection UI
					const itemsToShow = selection.filter(item => {
						// Only show items that are NOT for already auto-selected keywords
						const itemName = item.name.trim().toLowerCase();
						return !selectedKeywords.some(selectedKeyword =>
							selectedKeyword.trim().toLowerCase() === itemName
						);
					});

					// ✅ Build dialog with proper requested items list (HTML <br> for proper line breaks)
					let dialogDescription = "You requested the following items:<br/><br/>";

					// ✅ First list auto-selected items
					if (autoSelection.length > 0) {
						dialogDescription += "✅ Automatically selected:<br/>";
						autoSelection.forEach(item => {
							dialogDescription += `• ${item.name}<br/>`;
						});
						dialogDescription += "<br/>";
					}

					// ✅ Then list items requiring user selection
					if (unselectedKeywords.length > 0) {
						dialogDescription += "⚠️ Please select which versions you would like to use:<br/>";
						unselectedKeywords.forEach(keyword => {
							dialogDescription += `• ${keyword.trim().replace(/^['"]|['"]$/g, '')}<br/>`;
						});
					}

					// Add collision warnings if any exist
					if (collision.length > 0) {
						dialogDescription += "<br/>Additional information:<br/>";
						collision.forEach(name => {
							dialogDescription += `⚠️ ${name} appears both as a Data Element and an Indicator<br/>`;
						});
					}

					// Only show selection UI if there are actual items to select
					const selectedResult = await state.orchestrator.requestSelection({
						workflowId: state.workflowId,
						title: "Indicators / Data Elements selection",
						description: dialogDescription,
						items: itemsToShow,
						allowMultiple: true,
						confirmButtonText: "Continue Analysis"
					});

					if (selectedResult && selectedResult.length > 0) {
						userSelectedItems = selectedResult;
						console.log(`✅ User selected ${userSelectedItems.length} items`);
					} else {
						console.log('⚠️ Selection cancelled by user');
					}
				}

				// ✅ MERGE FINAL SELECTION
				const finalItems = [...autoSelection, ...userSelectedItems];
				console.log('Final Results:', finalItems);

				if (finalItems.length === 0) {
					return {
						step: 'completed',
						finalResult: {
							success: false,
							message: 'No valid items found for analysis',
							type: 'analytics'
						}
					};
				}

				console.log(`✅ Final selection: ${finalItems.length} total items (${autoSelection.length} auto + ${userSelectedItems.length} user)`);

				// ✅ BUILD MAPPING BETWEEN LLM INTENT NAMES AND ACTUAL SELECTED INDICATORS
				const intentIndicatorMapping: Record<string, any> = {};

				// For each indicator name in LLM intent
				for (const llmIndicatorName of intent.dimensions.dx) {
					// Find matching indicator from final selection
					const matchedIndicator = finalItems.find(indicator => {
						const indicatorName = indicator.name.trim().toLowerCase();
						const llmName = llmIndicatorName.trim().toLowerCase();

						// Exact match first
						if (indicatorName === llmName) return true;
						// LLM name is substring of actual name
						if (indicatorName.includes(llmName)) return true;
						// Actual name is substring of LLM name
						if (llmName.includes(indicatorName)) return true;

						return false;
					});

					if (matchedIndicator) {
						intentIndicatorMapping[llmIndicatorName] = matchedIndicator;
						console.log(`✅ Mapped LLM indicator "${llmIndicatorName}" → "${matchedIndicator.name}" (${matchedIndicator.id})`);
					} else {
						console.log(`⚠️ No match found for LLM indicator: "${llmIndicatorName}"`);
					}
				}

				console.log('✅ Built intent indicator mapping:', Object.keys(intentIndicatorMapping));

				const updatedMetadata = {
					...metadata,
					suggestions: finalItems,
					status: userSelectedItems.length > 0 ? 'user_selected' : 'auto_selected',
					autoSelectedCount: autoSelection.length,
					userSelectedCount: userSelectedItems.length
				};

				advanceProgress(state, 3, 'Processing Selection', 'Selection completed, proceeding...', false);

				return {
					intent,
					intentIndicatorMapping,
					metadata: updatedMetadata,
					dimensions: intent.dimensions || {dx: [], ou: [], pe: [], co: [], filters: []},
					conditions: intent.conditions || [],
					ranking: intent.ranking || null,
					visualization: intent.visualization || null,
					step: 'search_date_periods'
				};
			} catch (selectionError) {
				// Handle case where orchestrator selection fails (e.g., no UI callbacks registered)
				console.warn('⏸️ Orchestrator selection failed, falling back to auto-selection:', selectionError.message);

				// Fallback: Auto-select the first available item to continue workflow
				const allItems = [...autoSelection, ...selection];
				const autoSelectedItem = allItems[0];
				console.log('▶️ Auto-selected first item due to selection failure:', autoSelectedItem);

				const updatedMetadata = {
					...metadata,
					suggestions: [autoSelectedItem],
					status: 'auto_selected_fallback',
					fallbackReason: 'Selection UI unavailable, auto-selected first option'
				};

				// Continue with query_data using auto-selected item
				return {
					intent,
					metadata: updatedMetadata,
					dimensions: intent.dimensions || {dx: [], ou: [], pe: [], co: [], filters: []},
					conditions: intent.conditions || [],
					ranking: intent.ranking || null,
					visualization: intent.visualization || null,
					step: 'search_date_periods'
				};
			}
		} else {
			// Single match or auto-selected - proceed to query
			return {
				intent,
				metadata,
				dimensions: intent.dimensions || {dx: [], ou: [], pe: [], co: [], filters: []},
				conditions: intent.conditions || [],
				ranking: intent.ranking || null,
				visualization: intent.visualization || null,
				step: 'search_date_periods'
			};
		}

	} catch (error) {
		console.warn('⚠️ Unified intent extraction failed, falling back to legacy flow:', error.message);
		// Fallback to legacy metadata search flow
		return {
			step: 'search_metadata'
		};
	}
}

// Hybrid LLM-assisted analytics analysis for follow-up questions
async function analyzeExistingData(state: typeof GraphAnnotation.State): Promise<Partial<typeof GraphAnnotation.State>> {
	console.log('🔍 Analyzing existing chart data for follow-up query using hybrid approach');

	const query = state.query;
	const directAnalyticsData = await getAnalyticsDataDirectly();

	if (!directAnalyticsData) {
		return {
			step: 'completed',
			finalResult: {
				success: false,
				message: 'No previous analytics data available to analyze. Please run an analytics query first.',
				type: 'analytics'
			}
		};
	}

	console.log('📊 Retrieved analytics data for follow-up analysis:', directAnalyticsData.summary);

	try {
		// Phase 1: LLM extracts intent and parameters from the follow-up question
		const intentPrompt = `
Analyze this follow-up question about analytics data and extract the analysis intent and parameters.

FOLLOW-UP QUESTION: "${query}"

CONTEXT: The user is asking about previously displayed analytics data.

Extract:
1. INTENT: What type of analysis is requested? (find_max, find_min, calculate_total, calculate_average, find_trend, compare_periods, etc.)
2. DIMENSION: What dimension to analyze? (period, value, location, etc.)
3. METRIC: What metric to compute? (highest, lowest, total, average, etc.)
4. FILTERS: Any specific filters mentioned? (time periods, categories, etc.)

Return JSON:
{
  "intent": "find_max|find_min|calculate_total|calculate_average|find_trend|compare|etc",
  "dimension": "period|value|location|category",
  "metric": "highest|lowest|total|average|sum|etc",
  "filters": ["filter1", "filter2"],
  "timeframe": "specific_periods_mentioned_or_null"
}`;

		const intentResult = await model.invoke([new HumanMessage(intentPrompt)]);
		console.log('intentResult', intentResult);

		// Extract JSON from LLM response, handling cases where LLM returns text + JSON code block
		let intentAnalysis: any;
		try {
			const content = (intentResult.content as string).trim();

			// Try to extract JSON from code block first (```json ... ```)
			const jsonCodeBlockMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
			if (jsonCodeBlockMatch) {
				intentAnalysis = JSON.parse(jsonCodeBlockMatch[1].trim());
			} else {
				// Fallback: try parsing the entire content as JSON
				intentAnalysis = JSON.parse(content);
			}
		} catch (parseError) {
			console.error('Failed to parse LLM response as JSON:', parseError);
			console.error('LLM response content:', intentResult.content);

			// Provide fallback analysis when parsing fails
			intentAnalysis = {
				intent: null,
				dimension: null,
				metric: null,
				filters: [],
				timeframe: null,
				parseError: parseError.message,
				fallback: true
			};
		}

		console.log('🤖 Extracted analysis intent:', intentAnalysis);

		// Phase 2: Programmatically compute the requested metrics from stored data
		const rawData = directAnalyticsData.rawData || {};
		const chartValues = rawData.chartValues || {};
		const periodData = chartValues.periodData || [];
		const valueData = chartValues.valueData || [];
		const dataSummary = directAnalyticsData.dataSummary || {};

		let computedResult: any = {};

		// Create period-value pairs for analysis
		const periodValuePairs = periodData.map((period: string, index: number) => ({
			period,
			value: valueData[index] || 0
		}));

		switch (intentAnalysis.intent) {
			case 'find_max':
			case 'find_highest':
				if (intentAnalysis.dimension === 'period') {
					const maxEntry = periodValuePairs.reduce((max, current) =>
						current.value > max.value ? current : max
					);
					computedResult = {
						type: 'maximum',
						dimension: 'period',
						result: maxEntry.period,
						value: maxEntry.value,
						metric: 'highest value'
					};
				}
				break;

			case 'find_min':
			case 'find_lowest':
				if (intentAnalysis.dimension === 'period') {
					const minEntry = periodValuePairs.reduce((min, current) =>
						current.value < min.value ? current : min
					);
					computedResult = {
						type: 'minimum',
						dimension: 'period',
						result: minEntry.period,
						value: minEntry.value,
						metric: 'lowest value'
					};
				}
				break;

			case 'calculate_total':
			case 'find_sum':
				computedResult = {
					type: 'total',
					result: dataSummary.totalValue || valueData.reduce((sum, val) => sum + val, 0),
					metric: 'total value'
				};
				break;

			case 'calculate_average':
			case 'find_average':
				computedResult = {
					type: 'average',
					result: dataSummary.averageValue || (valueData.reduce((sum, val) => sum + val, 0) / valueData.length),
					metric: 'average value'
				};
				break;

			case 'find_trend':
				// Simple trend analysis
				const trend = periodValuePairs.length >= 2 ?
					(periodValuePairs[periodValuePairs.length - 1].value > periodValuePairs[0].value ? 'increasing' : 'decreasing') :
					'stable';
				computedResult = {
					type: 'trend',
					result: trend,
					metric: 'overall trend'
				};
				break;

			default:
				// Fallback: provide general statistics
				computedResult = {
					type: 'general',
					result: dataSummary,
					metric: 'general statistics'
				};
		}

		console.log('🔢 Computed result:', computedResult);

		// Phase 3: LLM humanizes the computed results
		const humanizePrompt = `
Convert these computed analytics results into a natural, conversational response.

QUESTION: "${query}"
COMPUTED RESULT: ${JSON.stringify(computedResult)}
CONTEXT: ${directAnalyticsData.summary}

Provide a human-friendly answer that:
- Directly answers the question
- Uses conversational language
- Includes the specific numbers/values
- Provides brief context from the analytics summary
- Is concise but informative

Answer as if you're explaining the data to the user.`;

		const humanizeResult = await model.invoke([new HumanMessage(humanizePrompt)]);
		const humanizedResponse = (humanizeResult.content as string).trim();

		console.log('💬 Humanized response:', humanizedResponse);

		const analysisResult = {
			success: true,
			message: humanizedResponse,
			computedResult,
			intentAnalysis,
			// Include stored data for reference
			chartData: directAnalyticsData.chartData,
			dataSummary: dataSummary,
			metadata: directAnalyticsData.metadata,
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
		console.error('❌ Follow-up analysis failed:', error);

		// Fallback: provide basic information about available data
		const fallbackResult = {
			success: true,
			message: `I have analytics data available showing ${directAnalyticsData.summary}. The data includes ${directAnalyticsData.rawData?.chartValues?.length || 0} data points across ${directAnalyticsData.rawData?.periodData?.length || 0} time periods.`,
			type: 'analytics',
			isFollowUpAnalysis: true,
			followUpQuery: query,
			fallback: true
		};

		addConversation(query, 'analytics', fallbackResult);

		return {
			step: 'completed',
			finalResult: fallbackResult
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


async function queryData(state: typeof GraphAnnotation.State): Promise<Partial<typeof GraphAnnotation.State>> {
	try {
		console.log('📊 Querying analytics data');

		// Update progress - show preparation step first
		updateProgress(6, 'Preparing Data Query', 'Finalizing query parameters...', false);
		state.orchestrator?.addProgressMessage('Finalizing query parameters...');

		// Update progress for actual querying
		updateProgress(7, 'Querying Data', 'Fetching analytics data from DHIS2...', false);
		state.orchestrator?.addProgressMessage('Fetching analytics data from DHIS2...');

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

		// ✅ CRITICAL RULE: INDICATORS CANNOT BE DISAGGREGATED
		// If ANY selected item is an indicator, we CANNOT do disaggregation
		// Disaggregation only works for dataElements
		const disaggregationAllowed = hasDataElements && !hasIndicators;

		// Set disaggregations to empty array when indicators are present

		if (disaggregationAllowed) {
			// Only extract disaggregation metadata when using dataElements only
			if (state.disaggregationsMetadata?.suggestions?.length > 0) {
				disaggregationDimensions = state.disaggregationsMetadata.suggestions.map((suggestion: any) => suggestion.formattedDimension);
			}
		} else {
			console.log('✅ SKIPPING disaggregation: selection contains indicators which cannot be disaggregated');
			// NO RETURN STATEMENT HERE. Just continue to API call normally.
		}

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

		// Proceed to summarization step instead of directly to chart building
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

// New summarization node - computes statistics and generates humanized summary
async function summarizeAnalyticsData(state: typeof GraphAnnotation.State): Promise<Partial<typeof GraphAnnotation.State>> {
	try {
		console.log('📈 Summarizing analytics data', state);

		// Update progress
		updateProgress(8, 'Analyzing Results', 'Computing statistics and generating insights...', false);
		state.orchestrator?.addProgressMessage('Computing statistics and generating insights...');

		// Use the dataSummary that was correctly computed in build_chart
		if (!state.dataSummary) {
			console.warn('📈 No data summary available from chart processing');
			return {
				step: 'completed',
				finalResult: {
					success: false,
					message: 'No data summary available',
					type: 'analytics'
				}
			};
		}

		// Use the existing dataSummary with correct statistics from chart processing
		const dataSummary = {...state.dataSummary};

		// Generate humanized summary using LLM
		const summaryPrompt = `
Generate a humanized summary of these analytics results for the query: "${state.query}"

STATISTICS:
- Total Records: ${dataSummary.totalRecords}
- Total Value: ${dataSummary.totalValue.toLocaleString()}
- Average Value: ${dataSummary.averageValue.toLocaleString(undefined, {maximumFractionDigits: 2})}
- Min Value: ${dataSummary.minValue.toLocaleString()}
- Max Value: ${dataSummary.maxValue.toLocaleString()}
- Non-Zero Values: ${dataSummary.nonZeroCount}
- Organisation Units: ${dataSummary.orgUnitCount}
- Time Periods: ${dataSummary.periodCount}
- Indicators/Data Elements: ${dataSummary.indicatorCount}

CONTEXT:
- Indicators: ${state.metadata?.suggestions?.map(s => s.name).join(', ') || 'N/A'}
- Organisation Units: ${state.orgUnitsMetadata?.suggestions?.map(s => s.name).join(', ') || 'N/A'}
- Periods: ${state.datePeriodsMetadata?.periods?.join(', ') || 'N/A'}

Write a natural, conversational summary that:
1. Explains what the data shows in simple terms
2. Highlights key insights and trends
3. Uses appropriate context for health data
4. Is engaging and easy to understand

Keep it concise but informative. Return just the summary text.`;

		try {
			const summaryResult = await model.invoke([new HumanMessage(summaryPrompt)]);
			dataSummary.summaryText = (summaryResult.content as string).trim();

			// Extract key insights
			dataSummary.insights = [
				dataSummary.totalRecords > 0 ? `Found ${dataSummary.totalRecords} data points across ${dataSummary.orgUnitCount} locations` : 'No data points found',
				dataSummary.nonZeroCount > 0 ? `Average value of ${dataSummary.averageValue.toFixed(1)} (range: ${dataSummary.minValue} - ${dataSummary.maxValue})` : 'All values are zero',
				dataSummary.periodCount > 1 ? `Data spans ${dataSummary.periodCount} time periods` : 'Data for single time period'
			].filter(Boolean);

		} catch (summaryError) {
			console.warn('📈 LLM summary generation failed, using basic summary:', summaryError);
			dataSummary.summaryText = `Found ${dataSummary.totalRecords} data points with total value of ${dataSummary.totalValue.toLocaleString()}.`;
			dataSummary.insights = [`Total: ${dataSummary.totalValue.toLocaleString()}`, `Average: ${dataSummary.averageValue.toFixed(1)}`];
		}

		console.log('📈 Data summary computed:', dataSummary);

		// Generate final result with summary, chart data, and lazy loading support
		const finalResult = {
			success: true,
			message: dataSummary.summaryText,
			summary: {
				text: dataSummary.summaryText,
				insights: dataSummary.insights,
				statistics: {
					totalRecords: dataSummary.totalRecords,
					totalValue: dataSummary.totalValue,
					averageValue: dataSummary.averageValue,
					minValue: dataSummary.minValue,
					maxValue: dataSummary.maxValue,
					orgUnitCount: dataSummary.orgUnitCount,
					periodCount: dataSummary.periodCount,
					indicatorCount: dataSummary.indicatorCount
				}
			},
			chartAvailable: !!state.chartData,
			chartData: state.chartData,
			metadata: state.metadata,
			queryData: state.data,
			orgUnitsMetadata: state.orgUnitsMetadata,
			dataSummary: dataSummary,
			type: 'analytics',
			chartRendered: false, // Flag to indicate chart is not yet rendered
			actions: [{
				type: 'view_chart',
				label: '📊 View Chart',
				description: 'Show the data as an interactive chart',
				actionId: 'render_chart'
			}]
		};

		// Save analytics data directly to localStorage for follow-up queries
		saveAnalyticsDataDirectly(finalResult);

		// Also add to conversation context as backup
		const dataContext = createAnalyticsDataContext(finalResult);
		addConversation(state.query, 'analytics', finalResult, dataContext);

		console.log('📈 Analytics summary completed with lazy chart loading');

		return {
			step: 'completed',
			finalResult
		};

	} catch (error) {
		console.error('📈 Data summarization failed:', error);
		return {
			step: 'completed',
			finalResult: {
				success: false,
				error: `Failed to summarize analytics data: ${error.message}`,
				type: 'analytics'
			}
		};
	}
}

async function buildChart(state: typeof GraphAnnotation.State): Promise<Partial<typeof GraphAnnotation.State>> {
	try {
		console.log('📊 Processing analytics data and building chart');

		// Check if we have analytics data
		if (!state.data?.data) {
			console.warn('📊 No analytics data available');
			return {
				step: 'summarize_analytics_data' // Continue to summarization even with no data
			};
		}

		// Chart type normalization mapping (handles LLM returning plural/alternative names)
		const chartTypeNormalization: Record<string, string> = {
			// Bar chart variations
			'bars': 'bar',
			'bar chart': 'bar',
			'column': 'bar',
			'columns': 'bar',
			'column chart': 'bar',
			// Line chart variations
			'lines': 'line',
			'line chart': 'line',
			'trend line': 'line',
			// Area chart variations
			'areas': 'area',
			'area chart': 'area',
			'stacked area': 'area',
			// Pie chart variations
			'pie chart': 'pie',
			'donut': 'pie',
			'donut chart': 'pie',
			'ring': 'pie',
			// Scatter variations
			'scatter plot': 'scatter',
			'scatter chart': 'scatter',
			'bubble': 'scatter',
			'bubble chart': 'scatter',
			// Other chart types
			'funnel chart': 'funnel',
			'radar chart': 'radar',
			'gauge chart': 'gauge',
			'heatmap': 'heatmap',
			'heat map': 'heatmap',
			'tree map': 'treemap',
			'sunburst chart': 'sunburst',
			'sankey diagram': 'sankey',
			'sankey chart': 'sankey'
		};

		// Get chart type from intent with proper normalization
		let chartType = state.visualization?.suggestedType || state.visualizationConfig?.finalChartType || 'bar';
		const normalizedChartType = chartTypeNormalization[chartType.toLowerCase()] || chartType.toLowerCase();

		console.log(`📊 Chart type: requested="${chartType}", normalized="${normalizedChartType}"`);

		// Build the chart data to process the raw data into usable format
		const chartResult = await buildAnalyticsChart.invoke({
			userQuery: state.query,
			analyticsData: state.data.data,
			chartType: normalizedChartType,
			seriesConfig: state.seriesConfig || [],
			indicators: state.data.indicators || [],
			periods: state.data.periods || ['2024'],
			orgUnits: state.data.org_units || [],
			disaggregations: state.data.disaggregations || [],
			filterOptions: state.disaggregationsMetadata?.filterOptions || [],
			optionsToCocs: state.optionsToCocs
		});

		const chartData = JSON.parse(chartResult);
		console.log('📊 Chart data processed successfully');

		// Extract actual values from processed chart data for summarization
		const series = chartData.echarts_option?.series || [];
		const chartValues: number[] = [];

		series.forEach((s: any) => {
			if (s.data && Array.isArray(s.data)) {
				s.data.forEach((val: any) => {
					if (typeof val === 'number' && !isNaN(val)) {
						chartValues.push(val);
					}
				});
			}
		});

		// Initialize dataSummary if it doesn't exist
		if (!state.dataSummary) {
			state.dataSummary = {
				totalRecords: 0,
				totalValue: 0,
				averageValue: 0,
				minValue: 0,
				maxValue: 0,
				nonZeroCount: 0,
				orgUnitCount: state.orgUnitsMetadata?.suggestions?.length || 0,
				periodCount: state.datePeriodsMetadata?.periods?.length || 1,
				indicatorCount: state.metadata?.suggestions?.length || 0,
				summaryText: '',
				insights: []
			};
		}

		// Update dataSummary with actual chart values
		const totalValue = chartValues.reduce((sum, val) => sum + val, 0);
		const averageValue = chartValues.length > 0 ? totalValue / chartValues.length : 0;
		const minValue = chartValues.length > 0 ? Math.min(...chartValues) : 0;
		const maxValue = chartValues.length > 0 ? Math.max(...chartValues) : 0;
		const nonZeroCount = chartValues.filter(v => v > 0).length;

		// Update the dataSummary with correct values from processed data
		state.dataSummary.totalRecords = chartValues.length;
		state.dataSummary.totalValue = totalValue;
		state.dataSummary.averageValue = averageValue;
		state.dataSummary.minValue = minValue;
		state.dataSummary.maxValue = maxValue;
		state.dataSummary.nonZeroCount = nonZeroCount;

		console.log('📊 Updated dataSummary with processed chart values:', {
			totalRecords: chartValues.length,
			totalValue,
			averageValue,
			minValue,
			maxValue,
			nonZeroCount
		});

		// Store chart data and updated dataSummary for summarization
		return {
			chartData, // Pass chart data to next step
			dataSummary: state.dataSummary, // Pass updated statistics to next step
			step: 'summarize_analytics_data'
		};

	} catch (chartError) {
		console.error('❌ Chart processing failed:', chartError);

		// Initialize basic dataSummary even if chart processing fails
		if (!state.dataSummary) {
			state.dataSummary = {
				totalRecords: 0,
				totalValue: 0,
				averageValue: 0,
				minValue: 0,
				maxValue: 0,
				nonZeroCount: 0,
				orgUnitCount: state.orgUnitsMetadata?.suggestions?.length || 0,
				periodCount: state.datePeriodsMetadata?.periods?.length || 1,
				indicatorCount: state.metadata?.suggestions?.length || 0,
				summaryText: '',
				insights: []
			};
		}

		// Continue to summarization even if chart processing fails
		return {
			chartData: null,
			chartError: chartError.message,
			step: 'summarize_analytics_data'
		};
	}
}

// New organisation unit resolution function
async function searchOrgUnits(state: typeof GraphAnnotation.State): Promise<Partial<typeof GraphAnnotation.State>> {
	try {
		console.log('🏥 Resolving organisation units');

		// Update progress - advance to org unit search step
		advanceProgress(state, 4, 'Finding Locations', 'Resolving organisation units...', false);

		// ✅ USE ALREADY EXTRACTED ORG UNITS FROM UNIFIED EXTRACTION
		// NO NEED TO RUN ANOTHER LLM CALL. WE ALREADY DID THIS ONCE.
		let orgUnitKeywords: string[] = [];
		let selectedLevel: any = null;
		let selectedGroup: any = null;

		// ✅ FULL INTENT FORMAT SUPPORT
		// Check new orgUnitConfig structure first (correct format)
		if (state.intent?.orgUnitConfig) {
			console.log('✅ Found orgUnitConfig in extracted intent:', state.intent.orgUnitConfig);

			// Read all fields from new intent structure
			const {specificNames, level, grouping} = state.intent.orgUnitConfig;

			if (specificNames && Array.isArray(specificNames) && specificNames.length > 0) {
				orgUnitKeywords = specificNames;
				console.log('✅ Mapped specificNames from orgUnitConfig:', orgUnitKeywords);
			}

			if (level) {
				selectedLevel = level;
				console.log('✅ Found level selection in intent:', selectedLevel);
			}

			if (grouping) {
				selectedGroup = grouping;
				console.log('✅ Found grouping selection in intent:', selectedGroup);
			}
		}

		// ✅ BACKWARDS COMPATIBILITY: Fallback to old dimensions.ou format
		if (orgUnitKeywords.length === 0 && state.metadata?.rawSearchResults?.extraction?.orgUnits) {
			orgUnitKeywords = state.metadata.rawSearchResults.extraction.orgUnits;
			console.log('✅ Using legacy dimensions.ou extraction:', orgUnitKeywords);
		}

		// ✅ FIRST: Handle explicit level/grouping requests BEFORE falling back to user default
		if (selectedLevel || selectedGroup) {
			console.log('✅ Found level/grouping request in intent:', {selectedLevel, selectedGroup});

			// ✅ Handle grouping aliases like "by_country" → maps to level = "country"
			if (selectedGroup && !selectedLevel) {
				// Extract level name from grouping value (remove "by_" prefix)
				if (selectedGroup.startsWith('by_')) {
					selectedLevel = selectedGroup.replace('by_', '');
					console.log('✅ Mapped grouping value to level:', selectedGroup, '→', selectedLevel);
				}
			}

			try {
				const {Dhis2Api} = await import('../utils/app-runtime/dhis2-api');

				// ✅ STEP 1: FIRST ASK USER TO SELECT COUNTRY (ORG UNIT LEVEL 2)
				console.log('✅ STEP 1: Fetching all countries (Level 2 organisation units)');

				const countriesResponse = await (Dhis2Api as any).query({
					organisationUnits: {
						resource: 'organisationUnits.json',
						params: {
							filter: `level:eq:2`,
							fields: 'id,name,path',
							paging: false
						}
					}
				});

				const countries = countriesResponse?.data?.organisationUnits?.organisationUnits || [];
				console.log(`✅ Found ${countries.length} countries at level 2`);

				if (countries.length === 0) {
					console.warn('⚠️ No countries found at level 2');
					// Fall back to user default if no countries
					throw new Error('No countries available at level 2');
				}

				// ✅ Always show country selection first
				const countryOptions = countries.map(country => ({
					id: country.id,
					name: country.name,
					type: 'organisationUnit',
					path: country.path
				}));

				// ✅ Allow multiple selection when grouping by country
				const allowMultiCountrySelection = selectedGroup === 'by_country';

				const selectedCountryResult = await state.orchestrator.requestSelection({
					workflowId: state.workflowId,
					title: allowMultiCountrySelection ? "Select Countries" : "Select Country",
					description: allowMultiCountrySelection 
						? `Please select which countries you would like to view ${selectedLevel} data for:`
						: `Please select which country you would like to view ${selectedLevel} data for:`,
					items: countryOptions,
					allowMultiple: allowMultiCountrySelection,
					confirmButtonText: allowMultiCountrySelection ? "Select Countries" : "Select Country"
				});

				if (!selectedCountryResult || selectedCountryResult.length === 0) {
					console.log('⚠️ Country selection cancelled by user');
					return {
						step: 'completed',
						finalResult: {
							success: false,
							message: 'Country selection was cancelled',
							type: 'analytics'
						}
					};
				}

				const selectedCountries = selectedCountryResult;
				console.log(`✅ User selected ${selectedCountries.length} countries`);

				// ✅ SKIP level selection entirely when grouping by country
				if (selectedGroup === 'by_country') {
					console.log('✅ Grouping by country - skipping level selection, using selected countries directly');
					
					// Use selected countries directly as final org units
					const levelOrgUnits = selectedCountries;
					console.log(`✅ Using ${levelOrgUnits.length} countries for analytics`);

					// ✅ AUTO PROCEED WITH ALL SELECTED COUNTRIES
					const suggestions = levelOrgUnits.map(ou => ({
						name: ou.name,
						id: ou.id,
						type: 'organisationUnit',
						isLevelSelection: true,
						sourceLevel: { name: 'Country', level: 2 },
						parentCountry: ou.name
					}));

					const orgUnitsMetadata = {
						status: 'level_selected',
						suggestions,
						query: state.query,
						selectedCountries,
						selectedLevel: { name: 'Country', level: 2 },
						totalOrgUnitsAtLevel: levelOrgUnits.length,
						autoSelected: false,
						reason: `Using ${levelOrgUnits.length} selected countries directly for by_country grouping`
					};

					advanceProgress(state, 4, 'Processing Selection', `Using ${levelOrgUnits.length} selected countries`, false);

					return {
						orgUnitsMetadata,
						step: 'query_data'
					};
				}

				// ✅ ONLY RUN THIS CODE WHEN NOT GROUPING BY COUNTRY
				const selectedCountry = selectedCountries[0];
				console.log('✅ User selected single country:', selectedCountry.name);

				// ✅ STEP 2: NOW ASK USER TO SELECT ACTUAL ORG UNIT LEVEL
				console.log('✅ STEP 2: Fetching system org unit levels');

				const levelsResponse = await (Dhis2Api as any).query({
					organisationUnitLevels: {
						resource: 'organisationUnitLevels.json',
						params: {
							fields: 'id,name,level',
							paging: false
						}
					}
				});

				const orgUnitLevels = levelsResponse?.data?.organisationUnitLevels?.organisationUnitLevels || [];
				console.log('✅ Loaded system org unit levels:', orgUnitLevels.length);

				const levelOptions = orgUnitLevels.map(level => ({
					id: level.level,
					name: `${level.name} (Level ${level.level})`,
					type: 'organisationUnitLevel',
					level: level.level
				}));

				const selectedLevelResult = await state.orchestrator.requestSelection({
					workflowId: state.workflowId,
					title: "Select Organisation Unit Level",
					description: `Please select which level corresponds to "${selectedLevel}" in ${selectedCountry.name}:`,
					items: levelOptions,
					allowMultiple: false,
					confirmButtonText: "Select Level"
				});

				if (!selectedLevelResult || selectedLevelResult.length === 0) {
					console.log('⚠️ Level selection cancelled by user');
					return {
						step: 'completed',
						finalResult: {
							success: false,
							message: 'Organisation unit level selection was cancelled',
							type: 'analytics'
						}
					};
				}

				const chosenLevel = selectedLevelResult[0];
				console.log('✅ User selected level:', chosenLevel.name, 'Level', chosenLevel.id);

				// ✅ STEP 3: FETCH ALL ORG UNITS AT SELECTED LEVEL UNDER SELECTED COUNTRY
				console.log(`✅ STEP 3: Fetching all ${chosenLevel.name} under ${selectedCountry.name}`);

				const levelOrgUnitsResponse = await (Dhis2Api as any).query({
					organisationUnits: {
						resource: 'organisationUnits.json',
						params: {
							filter: [
								`level:eq:${chosenLevel.id}`,
								`path:like:${selectedCountry.id}`
							],
							fields: 'id,name,path',
							paging: false
						}
					}
				});

				const levelOrgUnits = levelOrgUnitsResponse?.data?.organisationUnits?.organisationUnits || [];
				console.log(`✅ Fetched ${levelOrgUnits.length} ${chosenLevel.name} organisation units under ${selectedCountry.name}`);

				if (levelOrgUnits.length === 0) {
					return {
						step: 'completed',
						finalResult: {
							success: false,
							message: `No ${chosenLevel.name} organisation units found under ${selectedCountry.name}`,
							type: 'analytics'
						}
					};
				}

				// ✅ AUTO PROCEED WITH ALL FOUND ORG UNITS
				const suggestions = levelOrgUnits.map(ou => ({
					name: ou.name,
					id: ou.id,
					type: 'organisationUnit',
					isLevelSelection: true,
					sourceLevel: chosenLevel,
					parentCountry: selectedCountry.name
				}));

				const orgUnitsMetadata = {
					status: 'level_selected',
					suggestions,
					query: state.query,
					selectedCountry,
					selectedLevel: chosenLevel,
					totalOrgUnitsAtLevel: levelOrgUnits.length,
					autoSelected: false,
					reason: `Selected all ${chosenLevel.name} organisation units under ${selectedCountry.name}`
				};

				advanceProgress(state, 4, 'Processing Selection', `Found ${levelOrgUnits.length} ${chosenLevel.name} under ${selectedCountry.name}`, false);

				return {
					orgUnitsMetadata,
					step: 'query_data'
				};

			} catch (error) {
				console.warn('⚠️ Level selection flow failed:', error.message);
				// Fall through to default user org unit handling
			}
		}

		// ✅ FINAL FALLBACK: Run separate LLM extraction only if nothing else found
		if (orgUnitKeywords.length === 0 && !selectedLevel && !selectedGroup) {
			console.log('⚠️ No org units found in intent, falling back to separate LLM call');
			const llmResult = await extractOrgUnitKeywordsLLM.invoke({
				query: state.query,
				context: 'health analytics - extract geographic locations and organization unit names'
			});

			const llmResponse = JSON.parse(llmResult as string);
			orgUnitKeywords = llmResponse.keywordCandidates || [];
		}

		// ✅ 3 Question Framework: WHERE = Organisation Unit
		// When LLM returns empty array [] it means NO org units mentioned in query
		// ✅ DEFAULT BEHAVIOR: Use CURRENT USER'S ASSIGNED ORGANISATION UNIT
		if (orgUnitKeywords.length === 0 && !selectedLevel && !selectedGroup) {
			console.log('🏥 No organisation unit mentioned in query. DEFAULTING TO CURRENT USER ORG UNIT.');

			try {
				// ✅ Fetch current authenticated user and their organisation units
				const {Dhis2Api} = await import('../utils/app-runtime/dhis2-api');
				const meResponse = await (Dhis2Api as any).query({
					me: {
						resource: 'me.json',
						params: {
							fields: 'id,name,organisationUnits[id,name,level,path],dataViewOrganisationUnits[id,name,level,path]',
							paging: false
						}
					}
				});

				const currentUser = meResponse?.data?.me;
				console.log('✅ Fetched current user:', currentUser?.name);

				let userOrgUnits: any[] = [];

				// Prefer dataViewOrganisationUnits first (user's assigned data view scope)
				if (currentUser?.dataViewOrganisationUnits && currentUser.dataViewOrganisationUnits.length > 0) {
					userOrgUnits = currentUser.dataViewOrganisationUnits;
					console.log('✅ Using user dataViewOrganisationUnits:', userOrgUnits.length);
				}
				// Fallback to regular organisationUnits
				else if (currentUser?.organisationUnits && currentUser.organisationUnits.length > 0) {
					userOrgUnits = currentUser.organisationUnits;
					console.log('✅ Using user organisationUnits:', userOrgUnits.length);
				}

				if (userOrgUnits.length > 0) {
					// ✅ SELECT FIRST ORG UNIT AUTOMATICALLY
					// This is the default behavior every user expects
					const autoSelectedOrgUnit = userOrgUnits[0];

					console.log('✅ Auto-selected current user org unit:', autoSelectedOrgUnit.name);

					const orgUnitsMetadata = {
						status: 'user_default',
						suggestions: [{
							name: autoSelectedOrgUnit.name,
							id: autoSelectedOrgUnit.id,
							type: 'organisationUnit',
							isDefaultUserOrgUnit: true,
							source: 'current_user'
						}],
						query: state.query,
						autoSelected: true,
						reason: 'No organisation unit specified, defaulting to current user assigned location'
					};

					// ✅ PROCEED DIRECTLY. NO UI. NO 409. NO USER PROMPT.
					advanceProgress(state, 4, 'Processing Selection', 'Using your default organisation unit', false);

					return {
						orgUnitsMetadata,
						step: 'query_data'
					};
				}

				console.warn('⚠️ No organisation units found for current user');

			} catch (userFetchError) {
				console.warn('⚠️ Failed to fetch current user organisation units:', userFetchError.message);
			}

			// ✅ FALLBACK ONLY IF USER HAS NO ASSIGNED ORG UNITS
			console.log('🏥 No organisation unit mentioned and no user default available. Requesting user selection.');

			return {
				step: 'completed',
				finalResult: {
					success: false,
					error: "ORG_UNIT_REQUIRED",
					message: 'Please specify which location / organisation unit you want this data for',
					type: 'analytics',
					requiredInput: 'organisationUnit',
					hint: 'Try adding a location to your query, for example: "for Region A", "in District B", "at Facility X"'
				}
			};
		}

		// ✅ ORG UNIT CLASSIFICATION: SPECIFIC vs LEVEL
		// Fetch system org unit levels for matching
		let orgUnitLevels: Array<{ level: number, name: string, id: string }> = [];

		try {
			const {Dhis2Api} = await import('../utils/app-runtime/dhis2-api');
			const levelsResponse = await (Dhis2Api as any).query({
				organisationUnitLevels: {
					resource: 'organisationUnitLevels.json',
					params: {
						fields: 'id,name,level',
						paging: false
					}
				}
			});

			orgUnitLevels = levelsResponse?.data?.organisationUnitLevels?.organisationUnitLevels || [];
			console.log('✅ Loaded actual org unit levels from system:', orgUnitLevels.length);
		} catch (levelError) {
			console.warn('⚠️ Failed to load organisation unit levels:', levelError.message);
		}

		// Classify each extracted keyword
		const levelMatches: any[] = [];
		const specificMatches: any[] = [];

		// ✅ ALIAS MAPPING SYSTEM
		const levelAliases: Record<string, string[]> = {
			'country': ['nation', 'national', 'countries'],
			'region': ['province', 'state', 'provincial', 'regional'],
			'district': ['county', 'sub-region', 'municipality', 'zone'],
			'facility': ['clinic', 'health center', 'hospital', 'dispensary', 'health post', 'health facility'],
			'ward': ['village', 'community', 'catchment area']
		};

		for (const keyword of orgUnitKeywords) {
			const normalizedKeyword = keyword.trim().toLowerCase();

			// Check direct matches first
			let levelMatch = orgUnitLevels.find(level =>
				level.name.trim().toLowerCase() === normalizedKeyword ||
				`level ${level.level}` === normalizedKeyword
			);

			// Check alias matches if no direct match found
			if (!levelMatch) {
				for (const [levelName, aliases] of Object.entries(levelAliases)) {
					if (aliases.includes(normalizedKeyword)) {
						// Find matching system level for this alias
						levelMatch = orgUnitLevels.find(level =>
							level.name.trim().toLowerCase() === levelName
						);
						if (levelMatch) {
							console.log(`✅ Alias matched: "${keyword}" → alias for ${levelName} → system level ${levelMatch.level}: ${levelMatch.name}`);
							break;
						}
					}
				}
			}

			if (levelMatch) {
				console.log(`✅ Identified level term: "${keyword}" → matches system level ${levelMatch.level}: ${levelMatch.name}`);
				levelMatches.push({
					keyword,
					levelId: levelMatch.id,
					levelNumber: levelMatch.level,
					levelName: levelMatch.name
				});
			} else {
				specificMatches.push(keyword);
			}
		}

		console.log('🏥 Classification result:', {
			levelTerms: levelMatches.length,
			specificNames: specificMatches.length
		});

		// ✅ MIXED QUERY HANDLING: Specific + Level combinations
		if (levelMatches.length > 0 && specificMatches.length > 0) {
			console.log('🏥 MIXED QUERY detected: specific names + level terms');

			// When user asks "show all clinics in Region A"
			// 1. Fetch the specific parent org unit
			// 2. Then fetch all children at requested level

			if (specificMatches.length === 1 && levelMatches.length === 1) {
				// Optimal case: exactly one parent + one level
				const parentName = specificMatches[0];
				const levelMatch = levelMatches[0];

				console.log(`🏥 Mixed query: parent="${parentName}" level="${levelMatch.levelName}"`);

				// Find the specific parent org unit
				const parentSearchResults = await searchDhis2Metadata('organisationUnits', parentName, 10);

				if (parentSearchResults.length > 0) {
					// Auto select first matching parent
					const parentOrgUnit = parentSearchResults[0];

					console.log(`🏥 Found parent organisation unit: ${parentOrgUnit.name}`);

					// Fetch all children of this parent at the requested level
					try {
						const {Dhis2Api} = await import('../utils/app-runtime/dhis2-api');
						const levelChildrenResponse = await (Dhis2Api as any).query({
							organisationUnits: {
								resource: 'organisationUnits.json',
								params: {
									filter: [
										`parent.id:eq:${parentOrgUnit.id}`,
										`level:eq:${levelMatch.levelNumber}`
									],
									fields: 'id,name',
									paging: false
								}
							}
						});

						const levelChildren = levelChildrenResponse?.data?.organisationUnits?.organisationUnits || [];

						if (levelChildren.length > 0) {
							console.log(`✅ Fetched ${levelChildren.length} ${levelMatch.levelName}s under ${parentOrgUnit.name}`);

							const suggestions = levelChildren.map(ou => ({
								name: ou.name,
								id: ou.id,
								type: 'organisationUnit',
								isLevelSelection: true,
								parentOrgUnit: parentOrgUnit,
								sourceLevel: levelMatch
							}));

							const orgUnitsMetadata = {
								status: 'mixed_resolved',
								suggestions,
								query: state.query,
								parentOrgUnit,
								selectedLevel: levelMatch,
								totalOrgUnitsFound: levelChildren.length
							};

							// Continue directly with resolved child org units
							return {
								orgUnitsMetadata,
								step: 'query_data'
							};
						}
					} catch (childFetchError) {
						console.warn('⚠️ Failed to fetch child org units at level:', childFetchError.message);
					}
				}
			}

			// Fall through to normal selection if mixed resolution fails
			console.log('🏥 Mixed query automatic resolution failed, falling back to standard flow');
		}

		// ✅ HANDLE LEVEL SELECTION CASE
		if (levelMatches.length > 0) {
			console.log('🏥 Level terms detected, showing level selection UI');

			// Show selection dialog with actual system levels
			const levelOptions = orgUnitLevels.map(level => ({
				id: level.id,
				name: `${level.name} (Level ${level.level})`,
				type: 'organisationUnitLevel',
				level: level.level
			}));

			try {
				const selectedLevel = await state.orchestrator.requestSelection({
					workflowId: state.workflowId,
					title: "Select Organisation Unit Level",
					description: `You requested data for: ${levelMatches.map(m => m.keyword).join(', ')}<br><br>Please select which organisation unit level you would like to use:`,
					items: levelOptions,
					allowMultiple: false,
					confirmButtonText: "Select Level"
				});

				if (selectedLevel && selectedLevel.length > 0) {
					console.log('✅ User selected level:', selectedLevel[0]);

					// Fetch ALL org units at this selected level
					const {Dhis2Api} = await import('../utils/app-runtime/dhis2-api');
					const levelOrgUnitsResponse = await (Dhis2Api as any).query({
						organisationUnits: {
							resource: 'organisationUnits.json',
							params: {
								filter: `level:eq:${selectedLevel[0].level}`,
								fields: 'id,name',
								paging: false
							}
						}
					});

					const levelOrgUnits = levelOrgUnitsResponse?.data?.organisationUnits?.organisationUnits || [];
					console.log(`✅ Fetched ${levelOrgUnits.length} organisation units at level ${selectedLevel[0].level}`);

					// Create suggestions from fetched org units
					const suggestions = levelOrgUnits.map(ou => ({
						name: ou.name,
						id: ou.id,
						type: 'organisationUnit',
						isLevelSelection: true,
						sourceLevel: selectedLevel[0]
					}));

					const orgUnitsMetadata = {
						status: 'level_selected',
						suggestions,
						query: state.query,
						selectedLevel: selectedLevel[0],
						totalOrgUnitsAtLevel: levelOrgUnits.length
					};

					// Continue with all org units from this level
					return {
						orgUnitsMetadata,
						step: 'query_data'
					};
				} else {
					console.log('⚠️ Level selection cancelled by user');
					return {
						step: 'completed',
						finalResult: {
							success: false,
							message: 'Organisation unit level selection was cancelled',
							type: 'analytics'
						}
					};
				}

			} catch (selectionError) {
				console.warn('⚠️ Level selection failed:', selectionError.message);
				// Fall through to normal specific search
			}
		}

		// Search for organisation units using extracted keywords
		console.log('🏥 Searching with keywords:', orgUnitKeywords);
		const combinedKeywords = orgUnitKeywords.join(' ');
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
			keywords: orgUnitKeywords,
			llmResponse: undefined
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

			try {
				// ✅ EXACT MATCH AUTO-SELECT INTELLIGENCE
				// Check for exact name matches first before showing selection UI
				const autoSelectedItems: any[] = [];
				const remainingSuggestions: any[] = [];

				for (const suggestion of suggestions) {
					// Check if any LLM extracted keyword matches exactly (case insensitive, trimmed)
					const isExactMatch = orgUnitKeywords.some(keyword =>
						keyword.trim().toLowerCase() === suggestion.name.trim().toLowerCase()
					);

					if (isExactMatch) {
						autoSelectedItems.push(suggestion);
						console.log(`✅ Auto-selected exact match: "${suggestion.name}"`);
					} else {
						remainingSuggestions.push(suggestion);
					}
				}

				// ✅ If we have enough auto-selected items matching LLM extracted count, NO UI
				if (autoSelectedItems.length >= orgUnitKeywords.length) {
					console.log(`✅ All organisation units auto-selected. Skipping selection UI.`);

					const updatedOrgUnitsMetadata = {
						...orgUnitsMetadata,
						suggestions: autoSelectedItems,
						status: 'auto_selected',
						autoSelected: true
					};

					advanceProgress(state, 4, 'Processing Selection', 'Locations found automatically, proceeding to data resolution...', false);

					return {
						orgUnitsMetadata: updatedOrgUnitsMetadata,
						step: 'query_data'
					};
				}

				// ✅ Otherwise show selection UI with modern signature
				console.log(`⏸️ Showing selection UI: ${autoSelectedItems.length} auto-selected, need ${orgUnitKeywords.length} total`);

				// ✅ Build dialog description showing auto-selected items
				let dialogDescription = "";

				// First list auto-selected items
				if (autoSelectedItems.length > 0) {
					dialogDescription += "✅ Automatically selected:<br>";
					autoSelectedItems.forEach(item => {
						dialogDescription += `• ${item.name}<br>`;
					});
					dialogDescription += "<br>";
				}

				// Then list items requiring user selection
				if (remainingSuggestions.length > 0) {
					dialogDescription += "⚠️ Please select which locations you would like to use:";
				}

				// Request selection through orchestrator with proper title and context
				const selectedItems = await state.orchestrator.requestSelection({
					workflowId: state.workflowId,
					title: "Select Location",
					description: dialogDescription,
					items: remainingSuggestions,
					allowMultiple: true,
					confirmButtonText: "Continue Analysis"
				});
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
			} catch (selectionError) {
				// Handle case where orchestrator selection fails (e.g., no UI callbacks registered)
				console.warn('⏸️ Org unit selection failed, falling back to auto-selection:', selectionError.message);

				// Fallback: Auto-select the first available org unit to continue workflow
				const autoSelectedItem = suggestions[0];
				console.log('▶️ Auto-selected first org unit due to selection failure:', autoSelectedItem);

				const updatedOrgUnitsMetadata = {
					...orgUnitsMetadata,
					suggestions: [autoSelectedItem],
					status: 'auto_selected_fallback',
					fallbackReason: 'Selection UI unavailable, auto-selected first org unit'
				};

				// Continue with query_data using auto-selected org unit
				return {
					orgUnitsMetadata: updatedOrgUnitsMetadata,
					step: 'query_data'
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
		// ✅ FIRST GUARD CHECK: Absolute validation - ALL items MUST be data elements
		const hasOnlyDataElements = state.metadata?.suggestions?.every((s: any) => s.type === 'dataElement');

		if (!hasOnlyDataElements) {
			console.log('⚠️ GUARD CLAUSE: Selection contains indicators - DISABLING all disaggregation processing');

			return {
				disaggregationsMetadata: {
					status: 'disabled_indicators_present',
					suggestions: [],
					query: state.query,
					reason: 'Disaggregation disabled: selection contains indicators'
				},
				step: 'query_data'
			};
		}

		console.log('🔢 Searching for disaggregations in query using LLM extraction');

		// Update progress - advance to disaggregation search step
		advanceProgress(state, 5, 'Finding Categories', 'Searching for data categories...', false);

		// Initialize cocMapping for the entire function scope
		let cocMapping: Record<string, string[]> = state.cocMapping || {};

		// Fetch actual organisation unit levels from DHIS2 system
		let orgUnitLevels: Array<{ level: number, name: string, id: string }> = [];

		try {
			const {Dhis2Api} = await import('../utils/app-runtime/dhis2-api');
			const levelsResponse = await (Dhis2Api as any).query({
				organisationUnitLevels: {
					resource: 'organisationUnitLevels.json',
					params: {
						fields: 'id,name,level',
						paging: false
					}
				}
			});

			orgUnitLevels = levelsResponse?.data?.organisationUnitLevels?.organisationUnitLevels || [];
			console.log('✅ Loaded actual org unit levels from system:', orgUnitLevels.length);
		} catch (levelError) {
			console.warn('⚠️ Failed to load organisation unit levels:', levelError.message);
		}

		// Extract available categories directly from dataElements categoryCombo (no extra API calls needed)
		let availableCategories: Array<{ name: string, id: string }> = [];

		// Check if we have dataElements in metadata
		if (state.metadata?.suggestions?.some((s: any) => s.type === 'dataElement')) {
			const dataElementIds = state.metadata.suggestions
				.filter((s: any) => s.type === 'dataElement')
				.map((s: any) => s.id);

			// Fetch dataElements with category structure (this contains full categoryCombo)
			try {
				const toolResult = await getDataElements.invoke({
					filters: {id: `in:[${dataElementIds.join(',')}]`}
				});
				const dataElementsWithCategories = JSON.parse(toolResult as string);

				// Format: {"dataElements": [{"categoryCombo": {"categories": [{"name":"","id":"","categoryOptions":[...]}]}}]}
				const categoryMap = new Map<string, { name: string, categoryOptions: any[] }>();

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
				availableCategories = Array.from(categoryMap.entries()).map(([id, {name}]) => ({id, name}));
				console.log('🔢 Available categories from dataElements:', availableCategories);

				// Store full category details for later dimension generation
				// @ts-ignore - Adding non-property to state
				state.fullCategoryDetails = categoryMap;

				// Query for COCs that belong to the categoryCombos used by these dataElements
				const categoryComboIds = [...new Set(dataElementsWithCategories.dataElements?.map((de: any) => de.categoryCombo?.id).filter(id => id))];

				if (categoryComboIds.length > 0) {
					try {
						// Use direct API call instead of search tool for categoryCombo filtering
						const {Dhis2Api} = await import('../utils/app-runtime/dhis2-api');

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

		// ✅ FIRST CHECK: Use columns from intent apiHints if available
		let selectedCategories: Array<{name: string, id: string}> = [];
		let unmatchedColumns: string[] = [];
		
		// ✅ BLACKLIST: System DHIS2 dimensions that are NOT category disaggregations
		const SYSTEM_DIMENSION_BLACKLIST = new Set([
			'dx', 'ou', 'pe', 'co', 'ao',
			'value', 'eventdate', 'lastupdated', 'created', 'deleted',
			'programstage', 'program', 'trackedentityinstance'
		]);
		
		if (state.intent?.apiHints?.columns && state.intent.apiHints.columns.length > 0) {
			console.log('🔢 Using categories from intent apiHints.columns:', state.intent.apiHints.columns);

			// Build map of all available category options → parent category
			const optionNameToCategory = new Map<string, { name: string, id: string }>();

			// Extract all category options from the full category details
			const fullCategoryDetails = (state as any).fullCategoryDetails || new Map();
			for (const [categoryId, categoryInfo] of fullCategoryDetails.entries()) {
				const {name: categoryName, categoryOptions} = categoryInfo as any;
				categoryOptions.forEach((opt: any) => {
					optionNameToCategory.set(opt.name.trim().toLowerCase(), {
						name: categoryName,
						id: categoryId
					});
				});
			}

			console.log(`🔢 Loaded ${optionNameToCategory.size} category options for matching`);

			// Match each column against actual category OPTION names first (not category names)
			for (const columnName of state.intent.apiHints.columns) {
				const normalizedColumnName = columnName.trim().toLowerCase();

				// ✅ SKIP ALL BLACKLISTED SYSTEM DIMENSIONS COMPLETELY
				if (SYSTEM_DIMENSION_BLACKLIST.has(normalizedColumnName)) {
					console.log(`✅ FILTERED system dimension: "${columnName}" - skipped automatically`);
					continue;
				}

				// First try exact match on category option names
				const matchedCategory = optionNameToCategory.get(normalizedColumnName);

				if (matchedCategory) {
					// Avoid duplicate categories
					if (!selectedCategories.find(c => c.id === matchedCategory.id)) {
						selectedCategories.push(matchedCategory);
					}
					console.log(`✅ Matched column "${columnName}" → option found in category: ${matchedCategory.name}`);
				} else {
					// Fallback: try matching against category name directly
					const categoryMatch = availableCategories.find(cat =>
						cat.name.trim().toLowerCase() === normalizedColumnName
					);

					if (categoryMatch) {
						if (!selectedCategories.find(c => c.id === categoryMatch.id)) {
							selectedCategories.push(categoryMatch);
						}
						console.log(`✅ Matched column "${columnName}" → direct category match: ${categoryMatch.name}`);
					} else {
						unmatchedColumns.push(columnName);
						console.log(`⚠️ No matching category/option found for column: "${columnName}"`);
					}
				}
			}

			// If we have unmatched columns, show selection UI for these only
			if (unmatchedColumns.length > 0 && state.orchestrator) {
				console.log(`🔢 Showing selection UI for ${unmatchedColumns.length} unmatched columns`);

				try {
					const selectedItems = await state.orchestrator.requestSelection({
						workflowId: state.workflowId,
						title: "Select Disaggregation Categories",
						description: `Could not automatically match these categories:<br><br>${unmatchedColumns.map(c => `• ${c}`).join('<br>')}<br><br>Please select which categories you would like to use:`,
						items: availableCategories,
						allowMultiple: true,
						confirmButtonText: "Continue Analysis"
					});

					if (selectedItems && selectedItems.length > 0) {
						selectedItems.forEach((item: any) => {
							if (!selectedCategories.find(c => c.id === item.id)) {
								selectedCategories.push(item);
							}
						});
						console.log(`✅ User selected ${selectedItems.length} additional categories`);
					}
				} catch (selectionError) {
					console.warn('🔢 Column selection failed, proceeding with automatically matched categories only');
				}
			}
		}
		// ✅ FALLBACK: Use LLM extraction if no columns found in intent
		else {
			console.log('🔢 No columns in intent, falling back to LLM extraction');
			const llmResult = await filterCategoriesForDisaggregationLLM.invoke({
				query: state.query,
				availableCategories
			});

			const llmResponse = JSON.parse(llmResult as string);
			console.log('🔢 LLM category filtering result:', llmResponse);

			selectedCategories = llmResponse.selectedCategories || [];
		}

		console.log('🔢 Final selected categories:', selectedCategories, state);

		const hasAvailableCategories = availableCategories.length > 0;
		const hasSelectedCategories = selectedCategories.length > 0;

		if (!hasAvailableCategories || !hasSelectedCategories) {
			console.log('🔢 No dataElements or no disaggregation categories selected - proceeding without disaggregation');

			// No disaggregations found or no dataElements - proceed to query data
			const noDisaggMetadata = {
				status: 'none_found',
				suggestions: [],
				query: state.query,
				llmResponse: state.intent?.apiHints || null,
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

			const {categoryOptions: allOptions} = fullCategoryInfo;

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

			const {name: categoryName, categoryOptions: allOptions} = fullCategoryInfo;

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
			llmResponse: state.intent?.apiHints || null
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

			try {
				// ✅ EXACT MATCH AUTO-SELECT INTELLIGENCE
				// Check for exact name matches first before showing selection UI
				const autoSelectedItems: any[] = [];
				const remainingSuggestions: any[] = [];

				for (const suggestion of suggestions) {
					// Check if any LLM selected category matches exactly (case insensitive, trimmed)
					const isExactMatch = selectedCategories.some(category =>
						category.name.trim().toLowerCase() === suggestion.categoryName.trim().toLowerCase()
					);

					if (isExactMatch) {
						autoSelectedItems.push(suggestion);
						console.log(`✅ Auto-selected exact match: "${suggestion.name}"`);
					} else {
						remainingSuggestions.push(suggestion);
					}
				}

				// ✅ If we have enough auto-selected items matching LLM selected count, NO UI
				if (autoSelectedItems.length >= selectedCategories.length) {
					console.log(`✅ All disaggregation categories auto-selected. Skipping selection UI.`);

					const updatedDisaggMetadata = {
						...disaggregationsMetadata,
						suggestions: autoSelectedItems,
						status: 'auto_selected',
						autoSelected: true
					};

					advanceProgress(state, 5, 'Processing Selection', 'Categories found automatically, proceeding to data resolution...', false);

					return {
						disaggregationsMetadata: updatedDisaggMetadata,
						optionsToCocs: optionToCocs,
						step: 'query_data'
					};
				}

				// ✅ Otherwise show selection UI with modern signature
				console.log(`⏸️ Showing selection UI: ${autoSelectedItems.length} auto-selected, need ${selectedCategories.length} total`);

				// Request selection through orchestrator with proper title and context
				const selectedItems = await state.orchestrator.requestSelection({
					workflowId: state.workflowId,
					title: "Select Category",
					description: "Which data category would you like to disaggregate by?",
					items: remainingSuggestions,
					allowMultiple: true,
					confirmButtonText: "Continue Analysis"
				});
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
			} catch (selectionError) {
				// Handle case where orchestrator selection fails (e.g., no UI callbacks registered)
				console.warn('⏸️ Disaggregation selection failed, falling back to auto-selection:', selectionError.message);

				// Fallback: Auto-select the first suggestion to continue workflow
				const autoSelectedItem = suggestions[0];
				console.log('▶️ Auto-selected first disaggregation due to selection failure:', autoSelectedItem);

				const updatedDisaggMetadata = {
					...disaggregationsMetadata,
					suggestions: [autoSelectedItem],
					status: 'auto_selected_fallback',
					fallbackReason: 'Selection UI unavailable, auto-selected first disaggregation'
				};

				// Continue with query_data using auto-selected disaggregation
				return {
					disaggregationsMetadata: updatedDisaggMetadata,
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

		// Update progress - advance to date period search step
		advanceProgress(state, 3, 'Extracting Time Periods', 'Finding relevant time periods for your analysis...', false);

		// ✅ ALWAYS USE comprehensive extractDatePeriodLLM tool
		// This tool provides proper period validation, relative date parsing, DHIS2 period format support
		// and comprehensive date range handling that is not available in the unified extraction
		console.log('✅ Using comprehensive extractDatePeriodLLM for date period extraction');

		const llmResult = await extractDatePeriodLLM.invoke({
			query: state.query,
			context: 'health analytics - extract time periods for data analysis'
		});

		const llmResponse = JSON.parse(llmResult as string);
		const extractedPeriods = llmResponse.periods || [];
		console.log('📅 LLM date period extraction result:', llmResponse);

		console.log('📅 Final extracted periods:', extractedPeriods);

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
			method: llmResponse ? 'llm_extraction' : 'unified_extraction',
			llmResponse: llmResponse,
			matchedPhrases: llmResponse?.matchedPhrases || [],
			periodTypes: llmResponse?.periodTypes || [],
			confidence: llmResponse?.confidence || 'high'
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

// Recovery functions for handling failures gracefully

// Query parsing recovery - when intent classification or query parsing fails
async function handle_query_parsing_recovery(state: typeof GraphAnnotation.State): Promise<Partial<typeof GraphAnnotation.State>> {
	console.log('🔄 Handling query parsing recovery');

	const recoveryOptions: RecoveryOption[] = [
		{
			id: 'rephrase_query',
			label: 'Rephrase your query',
			description: 'Try asking the question in a different way with clearer terms',
			action: async () => ({
				uiAction: 'show_query_examples',
				recoveryAction: 'rephrase_query'
			})
		},
		{
			id: 'provide_examples',
			label: 'See example queries',
			description: 'View examples of analytics queries that work well',
			action: async () => ({
				uiAction: 'show_query_examples',
				recoveryAction: 'provide_examples'
			})
		},
		{
			id: 'simplify_query',
			label: 'Simplify the query',
			description: 'Break down complex queries into simpler parts',
			action: async () => ({
				uiAction: 'show_simplified_examples',
				recoveryAction: 'simplify_query'
			})
		}
	];

	return {
		recoveryContext: {
			failedStep: 'query_parsing',
			errorDetails: {
				reason: 'Could not understand the analytics query structure',
				originalQuery: state.query,
				suggestion: 'Try using specific indicator names, time periods, or geographic locations'
			},
			recoveryOptions,
			userGuidance: 'Query parsing failed. Try rephrasing with more specific terms:'
		},
		uiAction: 'show_recovery_options',
		recoveryAction: 'query_parsing_recovery'
	};
}

// Data access recovery - when DHIS2 API calls fail or no data is returned
async function handle_data_access_recovery(state: typeof GraphAnnotation.State): Promise<Partial<typeof GraphAnnotation.State>> {
	console.log('🔄 Handling data access recovery');

	const recoveryOptions: RecoveryOption[] = [
		{
			id: 'check_permissions',
			label: 'Check data permissions',
			description: 'Verify you have access to the requested data in DHIS2',
			action: async () => ({
				uiAction: 'show_permission_help',
				recoveryAction: 'check_permissions'
			})
		},
		{
			id: 'try_different_period',
			label: 'Try different time period',
			description: 'Use a different time period that may have data available',
			action: async () => ({
				uiAction: 'suggest_alternative_periods',
				recoveryAction: 'try_different_period'
			})
		},
		{
			id: 'broaden_search',
			label: 'Broaden your search',
			description: 'Use broader terms or remove specific filters to find more data',
			action: async () => ({
				uiAction: 'show_broader_queries',
				recoveryAction: 'broaden_search'
			})
		}
	];

	return {
		recoveryContext: {
			failedStep: 'data_access',
			errorDetails: {
				reason: 'Could not access or retrieve analytics data from DHIS2',
				possibleCauses: ['Permission issues', 'No data for selected criteria', 'API connectivity problems']
			},
			recoveryOptions,
			userGuidance: 'Data access failed. Choose how to resolve the issue:'
		},
		uiAction: 'show_recovery_options',
		recoveryAction: 'data_access_recovery'
	};
}

// Chart generation recovery - when chart building fails
async function handle_chart_generation_recovery(state: typeof GraphAnnotation.State): Promise<Partial<typeof GraphAnnotation.State>> {
	console.log('🔄 Handling chart generation recovery');

	const recoveryOptions: RecoveryOption[] = [
		{
			id: 'show_table_instead',
			label: 'Show data as table',
			description: 'Display the analytics data in table format instead of chart',
			action: async () => ({
				uiAction: 'switch_to_table_view',
				recoveryAction: 'show_table_instead'
			})
		},
		{
			id: 'try_different_chart',
			label: 'Try different chart type',
			description: 'Use a different visualization type (line, pie, etc.)',
			action: async () => ({
				uiAction: 'suggest_chart_alternatives',
				recoveryAction: 'try_different_chart'
			})
		},
		{
			id: 'export_raw_data',
			label: 'Export raw data',
			description: 'Download the data for external analysis and visualization',
			action: async () => ({
				uiAction: 'show_export_options',
				recoveryAction: 'export_raw_data'
			})
		}
	];

	return {
		recoveryContext: {
			failedStep: 'chart_generation',
			errorDetails: {
				reason: 'Chart generation failed but data was successfully retrieved',
				dataAvailable: !!state.data?.data,
				chartTypeAttempted: 'bar'
			},
			recoveryOptions,
			userGuidance: 'Chart generation failed but data is available. Choose how to view your data:'
		},
		uiAction: 'show_recovery_options',
		recoveryAction: 'chart_generation_recovery'
	};
}

// Timeout recovery - when queries take too long or are interrupted
async function handle_timeout_recovery(state: typeof GraphAnnotation.State): Promise<Partial<typeof GraphAnnotation.State>> {
	console.log('🔄 Handling timeout recovery');

	const recoveryOptions: RecoveryOption[] = [
		{
			id: 'retry_with_less_data',
			label: 'Retry with less data',
			description: 'Reduce the scope of your query to speed up processing',
			action: async () => ({
				uiAction: 'show_scope_reduction_options',
				recoveryAction: 'retry_with_less_data'
			})
		},
		{
			id: 'continue_in_background',
			label: 'Continue in background',
			description: 'Process the query in the background and notify when complete',
			action: async () => ({
				uiAction: 'start_background_processing',
				recoveryAction: 'continue_in_background'
			})
		},
		{
			id: 'save_partial_results',
			label: 'Save partial results',
			description: 'Save any results that were obtained before timeout',
			action: async () => ({
				uiAction: 'show_partial_results',
				recoveryAction: 'save_partial_results'
			})
		}
	];

	return {
		recoveryContext: {
			failedStep: 'timeout',
			errorDetails: {
				reason: 'Query processing timed out or took too long',
				suggestion: 'Try narrowing your search criteria or reducing data volume'
			},
			recoveryOptions,
			userGuidance: 'Query timed out. Choose how to proceed with your analytics request:'
		},
		uiAction: 'show_recovery_options'
	};
}

// ✅ NEW APPLY CONDITIONS NODE (PHASE 5)
async function applyConditions(state: typeof GraphAnnotation.State): Promise<Partial<typeof GraphAnnotation.State>> {
	console.log('🔍 Applying conditions and filters to analytics data');

	if (!state.data?.data || !state.data.data.rows) {
		console.log('⚠️ No analytics data available for filtering');
		return {step: 'apply_ranking'};
	}

	if (!state.conditions || state.conditions.length === 0) {
		console.log('✅ No conditions defined, skipping filtering');
		return {step: 'apply_ranking'};
	}

	try {
		console.log(`🔍 Processing ${state.conditions.length} conditions`);

		const originalRows = state.data.data.rows || [];
		let filteredRows = [...originalRows];
		const appliedConditions: any[] = [];
		const conditionResults: any[] = [];

		for (const condition of state.conditions) {
			console.log(`🔍 Processing condition:`, condition);

			const {field, operator, value, type} = condition;

			switch (operator) {
				case '>':
					filteredRows = filteredRows.filter(row => parseFloat(row[field]) > parseFloat(value));
					break;
				case '<':
					filteredRows = filteredRows.filter(row => parseFloat(row[field]) < parseFloat(value));
					break;
				case '>=':
					filteredRows = filteredRows.filter(row => parseFloat(row[field]) >= parseFloat(value));
					break;
				case '<=':
					filteredRows = filteredRows.filter(row => parseFloat(row[field]) <= parseFloat(value));
					break;
				case '==':
					filteredRows = filteredRows.filter(row => row[field]?.toString() === value.toString());
					break;
				case '!=':
					filteredRows = filteredRows.filter(row => row[field]?.toString() !== value.toString());
					break;
				case 'contains':
					filteredRows = filteredRows.filter(row =>
						row[field]?.toString().toLowerCase().includes(value.toLowerCase())
					);
					break;
				case 'not_contains':
					filteredRows = filteredRows.filter(row =>
						!row[field]?.toString().toLowerCase().includes(value.toLowerCase())
					);
					break;
				default:
					console.log(`⚠️ Unknown operator: ${operator}, skipping condition`);
			}

			appliedConditions.push(condition);
			conditionResults.push({
				condition,
				remainingRows: filteredRows.length,
				rowsRemoved: originalRows.length - filteredRows.length
			});
		}

		console.log(`✅ Conditions applied: ${originalRows.length} → ${filteredRows.length} rows remaining`);

		// Update data with filtered rows
		const updatedData = {
			...state.data,
			data: {
				...state.data.data,
				rows: filteredRows
			},
			conditionResults,
			originalRowCount: originalRows.length,
			filteredRowCount: filteredRows.length
		};

		return {
			data: updatedData,
			step: 'apply_ranking'
		};

	} catch (error) {
		console.warn('⚠️ Conditions processing failed:', error.message);
		return {step: 'apply_ranking'};
	}
}

// ✅ NEW APPLY RANKING NODE (PHASE 5)
async function applyRanking(state: typeof GraphAnnotation.State): Promise<Partial<typeof GraphAnnotation.State>> {
	console.log('🏆 Applying ranking and sorting to analytics data');

	if (!state.ranking) {
		console.log('✅ No ranking defined, skipping sorting');
		return {step: 'configure_visualization'};
	}

	if (!state.data?.data || !state.data.data.rows) {
		console.log('⚠️ No analytics data available for ranking');
		return {step: 'configure_visualization'};
	}

	try {
		console.log('🏆 Processing ranking:', state.ranking);

		const {field, order = 'desc', limit, offset = 0, type = 'top'} = state.ranking;
		let rows = [...(state.data.data.rows || [])];

		// ✅ SORTING
		if (field && order) {
			console.log(`🏆 Sorting by ${field} ${order}`);

			rows.sort((a, b) => {
				const valA = parseFloat(a[field]) || 0;
				const valB = parseFloat(b[field]) || 0;

				if (order === 'desc') {
					return valB - valA;
				} else {
					return valA - valB;
				}
			});
		}

		// ✅ TOP N / BOTTOM N LIMIT
		if (limit && limit > 0) {
			if (type === 'bottom') {
				// Bottom N
				rows = rows.slice(Math.max(0, rows.length - limit), rows.length);
			} else {
				// Top N
				rows = rows.slice(offset, offset + limit);
			}
			console.log(`🏆 Applied ${type} ${limit} limit: ${rows.length} rows remaining`);
		}

		// ✅ RANK ASSIGNMENT
		const rankedRows = rows.map((row, index) => ({
			...row,
			rank: index + 1,
			rankType: type
		}));

		// Update data with ranked rows
		const updatedData = {
			...state.data,
			data: {
				...state.data.data,
				rows: rankedRows
			},
			rankingApplied: true,
			rankingConfig: state.ranking,
			rankedRowCount: rankedRows.length
		};

		console.log('✅ Ranking applied successfully');

		return {
			data: updatedData,
			step: 'configure_visualization'
		};

	} catch (error) {
		console.warn('⚠️ Ranking processing failed:', error.message);
		return {step: 'configure_visualization'};
	}
}

// ✅ NEW PHASE 7: CONFIGURE VISUALIZATION NODE
async function configureVisualization(state: typeof GraphAnnotation.State): Promise<Partial<typeof GraphAnnotation.State>> {
	console.log('📊 Configuring visualization and chart types');

	try {
		// Update progress
		updateProgress(8, 'Configuring Chart', 'Setting up visualization options...', false);
		state.orchestrator?.addProgressMessage('Setting up visualization options...');

		const indicators = state.metadata?.suggestions || [];
		const seriesConfig: any[] = [];

		// ✅ FIRST: Read explicit series configuration from intent
		const barIndicators: string[] = state.visualization?.config?.series?.bars || [];
		const lineIndicators: string[] = state.visualization?.config?.series?.line || [];

		console.log('✅ Extracted explicit series configuration:', {
			bars: barIndicators,
			lines: lineIndicators
		});

		// ✅ Analyze query for chart type requests only if no explicit config exists
		const queryLower = state.query.toLowerCase();

		// Chart type detection from natural language
		const chartTypeMappings: Record<string, string> = {
			'line chart': 'line',
			'show as line': 'line',
			'trend line': 'line',
			'trend chart': 'line',
			'over time': 'line',
			'bar chart': 'bar',
			'show as bars': 'bar',
			'column chart': 'bar',
			'compare': 'bar',
			'area chart': 'area',
			'show as area': 'area',
			'stacked area': 'area',
			'cumulative': 'area',
			'scatter plot': 'scatter',
			'scatter chart': 'scatter',
			'correlation': 'scatter',
			'combination chart': 'combination',
			'mixed chart': 'combination',
			'dual axis': 'dual_axis',
			'two axes': 'dual_axis',
			'secondary axis': 'dual_axis',
			'stacked chart': 'stacked',
			'show stacked': 'stacked',
			'breakdown': 'stacked'
		};

		let detectedChartType: string | null = null;

		// Only do global detection if there's NO explicit series config
		if (barIndicators.length === 0 && lineIndicators.length === 0) {
			for (const [phrase, type] of Object.entries(chartTypeMappings)) {
				if (queryLower.includes(phrase)) {
					detectedChartType = type;
					console.log(`✅ Detected chart type request: "${phrase}" → ${type}`);
					break;
				}
			}
		}

		// ✅ Configure each indicator series
		for (let i = 0; i < indicators.length; i++) {
			const indicator = indicators[i];
			let chartType = 'bar'; // Default

			// ✅ FIRST: Use intentIndicatorMapping to match series assignments
			// Find which LLM indicator name maps to this actual selected indicator
			let matchedLlmName: string | null = null;

			for (const [llmName, mappedIndicator] of Object.entries(state.intentIndicatorMapping)) {
				if ((mappedIndicator as any).id === indicator.id) {
					matchedLlmName = llmName;
					break;
				}
			}

			// ✅ Check explicit series assignments using MAPPED LLM NAME
			if (matchedLlmName) {
				if (barIndicators.includes(matchedLlmName)) {
					chartType = 'bar';
					console.log(`✅ Assigned bar chart type to: ${indicator.name} (matched LLM name: "${matchedLlmName}")`);
				} else if (lineIndicators.includes(matchedLlmName)) {
					chartType = 'line';
					console.log(`✅ Assigned line chart type to: ${indicator.name} (matched LLM name: "${matchedLlmName}")`);
				}
			}
			// ✅ Fallback to direct name matching only if mapping not found
			else {
				const indicatorName = indicator.name.trim().toLowerCase();
				if (barIndicators.some((name: string) => name.trim().toLowerCase() === indicatorName)) {
					chartType = 'bar';
					console.log(`✅ Assigned bar chart type to: ${indicator.name} (direct match)`);
				} else if (lineIndicators.some((name: string) => name.trim().toLowerCase() === indicatorName)) {
					chartType = 'line';
					console.log(`✅ Assigned line chart type to: ${indicator.name} (direct match)`);
				}
				// ✅ Fallback to detected chart type only if no explicit assignment
				else if (detectedChartType) {
					chartType = detectedChartType;
				}
			}

			// ✅ Special cases for combination charts
			if (indicators.length > 1 && detectedChartType === 'combination' && barIndicators.length === 0 && lineIndicators.length === 0) {
				// Default combination: first as bar, others as line
				chartType = i === 0 ? 'bar' : 'line';
			}

			// ✅ Dual axis support
			let yAxisIndex = 0;
			if (detectedChartType === 'dual_axis' && i > 0) {
				yAxisIndex = 1;
			}

			seriesConfig.push({
				indicatorId: indicator.id,
				indicatorName: indicator.name,
				chartType,
				yAxisIndex,
				smooth: chartType === 'line',
				showLabel: indicators.length <= 3
			});
		}

		console.log('✅ Generated series configuration:', seriesConfig);

		// ✅ ✨ UNLIMITED ECHARTS PASS THROUGH MODE ✨
		// NO WHITELIST. NO VALIDATION. NO FALLBACKS.
		// ANYTHING THE LLM RETURNS GOES DIRECTLY TO ECHARTS.
		// IF ECHARTS SUPPORTS IT, IT WILL RENDER.

		let finalChartType = detectedChartType || 'bar';
		let fallbackReason: string | null = null;

		if (detectedChartType) {
			console.log(`✨ Passing through chart type directly: "${detectedChartType}"`);
			console.log(`✨ ECharts will handle rendering natively`);
		}

		// ✅ Override series configuration with validated type if needed
		if (fallbackReason && finalChartType) {
			for (let i = 0; i < seriesConfig.length; i++) {
				if (finalChartType === 'combination') {
					seriesConfig[i].chartType = i === 0 ? 'bar' : 'line';
				} else if (finalChartType === 'stacked') {
					seriesConfig[i].chartType = 'bar';
				} else if (finalChartType === 'dual_axis') {
					seriesConfig[i].chartType = i === 0 ? 'bar' : 'line';
					seriesConfig[i].yAxisIndex = i > 0 ? 1 : 0;
				} else {
					seriesConfig[i].chartType = finalChartType;
				}
			}
		}

		// ✅ Build visualization config
		const visualizationConfig = {
			title: state.query.length > 80 ? state.query.substring(0, 80) + '...' : state.query,
			showLegend: indicators.length > 1,
			showGrid: true,
			stacked: finalChartType === 'stacked',
			dualAxis: finalChartType === 'dual_axis',
			detectedChartType: detectedChartType,
			finalChartType: finalChartType,
			fallbackReason: fallbackReason,
			axisLabels: {
				x: 'Period',
				y: indicators[0]?.name || 'Value',
				y2: indicators[1]?.name || 'Secondary Value'
			}
		};

		console.log('✅ Visualization configuration complete');

		// ✅ AUTO-ENABLE STACKED MODE WHEN DISAGGREGATIONS ARE PRESENT
		// When disaggregation categories are detected, automatically set stacked: true
		// This creates stacked bars for disaggregated data instead of separate bars
		if (state.data?.disaggregations && state.data.disaggregations.length > 0) {
			visualizationConfig.stacked = true;
			console.log('✅ Auto-enabled stacked mode for disaggregated data');
		}

		return {
			seriesConfig,
			visualizationConfig,
			step: 'summarize_analytics_data'
		};

	} catch (error) {
		console.warn('⚠️ Visualization configuration failed:', error.message);
		// Fallback to defaults
		return {
			seriesConfig: [],
			visualizationConfig: {
				showLegend: true,
				showGrid: true,
				stacked: false,
				dualAxis: false,
				axisLabels: {}
			},
			step: 'summarize_analytics_data'
		};
	}
}

// Create the StateGraph workflow according to LangGraph docs
const workflow = new StateGraph(GraphAnnotation);

// Add nodes
workflow.addNode('classify_intent', classifyIntent);
workflow.addNode('extract_intent', extractIntent);
workflow.addNode('apply_conditions', applyConditions);
workflow.addNode('apply_ranking', applyRanking);
workflow.addNode('configure_visualization', configureVisualization);
workflow.addNode('analyze_existing_data', analyzeExistingData);
workflow.addNode('parse_selected_metadata', parseSelectedMetadata);
workflow.addNode('search_date_periods', searchDatePeriods);
workflow.addNode('search_org_units', searchOrgUnits);
workflow.addNode('search_disaggregations', searchDisaggregations);
workflow.addNode('query_data', queryData);
workflow.addNode('summarize_analytics_data', summarizeAnalyticsData);
workflow.addNode('build_chart', buildChart);

// Recovery nodes
workflow.addNode('handle_query_parsing_recovery', handle_query_parsing_recovery);
workflow.addNode('handle_data_access_recovery', handle_data_access_recovery);
workflow.addNode('handle_chart_generation_recovery', handle_chart_generation_recovery);
workflow.addNode('handle_timeout_recovery', handle_timeout_recovery);

// Add edges
// @ts-ignore
workflow.addEdge(START, 'classify_intent');

/**
 * Analytics Workflow Flow:
 *
 * Initial queries: classify_intent → search_metadata → search_date_periods → search_org_units →
 *                  search_disaggregations → query_data → build_chart → summarize_analytics_data → END
 *
 * Follow-up queries: classify_intent → analyze_existing_data → END
 *
 * Selected metadata: classify_intent → parse_selected_metadata → query_data → build_chart → summarize_analytics_data → END
 */

// @ts-ignore
workflow.addConditionalEdges('classify_intent', (state) => {
	// Initial routing based on intent
	if (state.step === 'parse_selected_metadata') return 'parse_selected_metadata';
	if (state.step === 'analyze_existing_data') return 'analyze_existing_data';

	// ✅ NEW UNIFIED INTENT FLOW ENABLED
	// All new analytics queries go through the unified intent extraction pipeline first
	if (state.step === 'search_metadata') {
		console.log('✅ Routing to new unified intent extraction flow');
		return 'extract_intent';
	}

	// ✅ FALLBACK ONLY: Legacy searchMetadata path used only if new flow fails
	if (state.step === 'search_metadata_fallback') return 'search_metadata';

	// Sequential flow for analytics pipeline
	if (state.step === 'search_date_periods') return 'search_date_periods';
	if (state.step === 'search_org_units') return 'search_org_units';
	if (state.step === 'search_disaggregations') return 'search_disaggregations';
	if (state.step === 'query_data') return 'query_data';
	if (state.step === 'build_chart') return 'build_chart';
	if (state.step === 'summarize_analytics_data') return 'summarize_analytics_data';

	return END;
});

// Direct sequential edges for the analytics pipeline
// @ts-ignore
workflow.addEdge('extract_intent', 'search_date_periods');
// @ts-ignore
workflow.addEdge('search_date_periods', 'search_org_units');
// @ts-ignore
workflow.addConditionalEdges('search_org_units', (state) => {
	// ✅ STRICT DISAGGREGATION CHECK: ALL items MUST be data elements
	const hasOnlyDataElements = state.metadata?.suggestions?.every((s: any) => s.type === 'dataElement');

	if (hasOnlyDataElements) {
		console.log('✅ All selected items are data elements - proceeding to disaggregation search');
		return 'search_disaggregations';
	} else {
		console.log('⚠️ Selection contains indicators - SKIPPING disaggregation search completely');
		return 'query_data';
	}
});
// @ts-ignore
workflow.addEdge('search_disaggregations', 'query_data');
// @ts-ignore
workflow.addEdge('query_data', 'configure_visualization');
// @ts-ignore
workflow.addEdge('configure_visualization', 'build_chart');
// @ts-ignore
workflow.addEdge('build_chart', 'apply_conditions');
// @ts-ignore
workflow.addEdge('apply_conditions', 'apply_ranking');
// @ts-ignore
workflow.addEdge('apply_ranking', 'summarize_analytics_data');
// @ts-ignore
workflow.addEdge('summarize_analytics_data', END);

// Follow-up analysis bypasses the full pipeline
// @ts-ignore
workflow.addEdge('analyze_existing_data', END);

// Selected metadata goes directly to query (bypasses metadata resolution)
// @ts-ignore
workflow.addEdge('parse_selected_metadata', 'query_data');

// Compile the workflow
const stateGraphAgent = workflow.compile();

// StateGraph-based analytics agent wrapper for proper input handling
export function createAnalyticsGraphAgent(orchestrator: any) {
	return {
		invoke: async (input: any) => {
			console.log('📊 Analytics StateGraph: Processing analytics request');

			// Extract messages from input (handle workflow orchestrator structure)
			// Workflow orchestrator passes messages as input.input
			const messages = input.messages || input.input || [];
			const userMessages = messages?.filter((m: any) => m.role === 'user') || [];
			const lastUserMessage = userMessages[userMessages.length - 1];
			const originalQuery = lastUserMessage?.content || '';

			const initialState: Partial<typeof GraphAnnotation.State> = {
				messages: messages || [],
				query: originalQuery || '',
				orchestrator: orchestrator,
				workflowId: `analytics_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
			};
			console.log('Initial state', initialState);
			// Execute the StateGraph workflow
			const result = await stateGraphAgent.invoke(initialState);

			// Format for compatibility with existing interface (StateGraph returns result directly)
			return {
				messages: [{
					content: JSON.stringify(result.finalResult),
					name: undefined,
					additional_kwargs: {},
					response_metadata: {}
				}]
			};
		}
	};
}

export { stateGraphAgent as analyticsGraphAgent, GraphAnnotation };
