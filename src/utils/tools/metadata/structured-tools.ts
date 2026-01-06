// ========== IMPORTS ==========

// External libraries (alphabetically)
import {tool} from '@langchain/core/tools';
import {z} from 'zod';
import {AzureChatOpenAI} from '@langchain/openai';

// Local imports (alphabetically by module)
import {
	addResourceToContext,
	createDhis2Metadata,
	createDhis2MetadataAggregated,
	createDhis2MetadataDirect,
	generateDhis2Code,
	generateDhis2Id,
	searchDhis2Metadata
} from './helpers';
import {createDhis2GetByIdTool, createDhis2SearchTool, createDhis2UpdateTool, createLLMFirstTool} from './base-tool';

// Schemas
import {Dhis2Schemas} from './schemas';

// =============================================================================
// ECHARTS VISUALIZATION TOOLS - NEW ANALYTICS CAPABILITIES
// =============================================================================

/**
 * ECharts Data Processing - Convert DHIS2 analytics to chart format
 */

interface AnalyticsChartData {
    id: string;
    title: string;
    timestamp: number;
    chartType: 'line' | 'bar' | 'pie';
    echartsConfig: any;
    filteredData: any[];
    dimensions: {
        indicators: string[];
        periods: string[];
        orgUnits: string[];
        disaggregations: any;
    };
    filterGroups: Array<{
        name: string;
        type: 'orgUnits' | 'periods' | 'category';
        options: Array<{name: string, id: string}>;
        selected: string[];
        categoryId?: string;
    }>;
    metaData: {
        indicators: any[];
        orgUnits: any[];
        periods: any[];
        items: Record<string, any>;
    };
}

/**
 * Build ECharts option object for analytics visualization
 */
export const buildAnalyticsChart = tool(
    async (input: {
        userQuery: string;
        analyticsData: any;
        chartType: 'line' | 'bar' | 'pie';
        indicators?: string[];
        periods?: string[];
        orgUnits?: string[];
        disaggregations?: string[];
        filterOptions?: any[];
	    optionsToCocs?: Record<string, string[]>;
        title?: string;
    }) => {
        try {
            const {
                userQuery,
                analyticsData,
                chartType,
                indicators = [],
                periods = [],
                orgUnits = [],
                disaggregations = [],
                title
            } = input;

            const addedCoDimension = disaggregations && disaggregations.length > 0;

            // Process analytics data to chart format
            const chartData = await processAnalyticsForChart({
                analyticsData,
                chartType,
                indicators,
                periods,
                orgUnits,
                disaggregations,
                filterOptions: input.filterOptions,
                title: title || `Analytics Chart: ${userQuery}`,
                hasCoDimension: addedCoDimension,
            });

            // Store chart configuration for persistence
            const chartId = storeAnalyticsChart(chartData);

            // Build ECharts option object
            const echartsOption = buildEChartsOption(chartData);
            console.log('Generated ECharts option:', JSON.stringify(echartsOption, null, 2));

    return JSON.stringify({
        success: true,
        chart_id: chartId,
        chart_type: chartType,
        echarts_option: echartsOption,
        filteredData: chartData.filteredData, // ✅ Include raw data for client-side filtering
        dimensions: chartData.dimensions,      // ✅ Include actual disaggregation values for filter dropdowns
        filterGroups: chartData.filterGroups, // ✅ Include grouped filter structure
        metaData: input.analyticsData?.data?.analytics.metaData,  // ✅ Include metadata for proper filtering
	    optionsToCocs: input.optionsToCocs,
        data_summary: {
            total_points: chartData.filteredData.length,
            indicators_count: chartData.dimensions.indicators.length,
            periods_count: chartData.dimensions.periods.length,
            org_units_count: chartData.dimensions.orgUnits.length,
            disaggregations_count: chartData.dimensions.disaggregations.length
        },
        title: chartData.title,
        export_available: true
    });

        } catch (error) {
            console.error('Error building analytics chart:', error);
            return JSON.stringify({
                success: false,
                error: `Failed to build chart: ${error.message}`,
                chart_type: input.chartType
            });
        }
    },
    {
        name: "build_analytics_chart",
        description: "Create interactive ECharts visualizations from DHIS2 analytics data with filtering capabilities",
        schema: z.object({
            userQuery: z.string().describe("The original user analytics query"),
            analyticsData: z.any().describe("DHIS2 analytics API response"),
            chartType: z.enum(['line', 'bar', 'pie']).describe("Type of chart to create"),
            indicators: z.array(z.string()).optional().describe("Selected indicators to display"),
            periods: z.array(z.string()).optional().describe("Selected time periods"),
            orgUnits: z.array(z.string()).optional().describe("Selected organization units"),
            disaggregations: z.array(z.string()).optional().describe("Selected category option values to filter by"),
            filterOptions: z.array(z.any()).optional().describe("Category filter options for chart filtering"),
            optionsToCocs: z.record(z.string(), z.array(z.string())).optional().describe("Pre-built option to COC mapping from disaggregation search"),
            title: z.string().optional().describe("Chart title (auto-generated if not provided)"),
	        metaData: z.array(z.any()).optional().describe("Meta Data"),
        })
    }
);

/**
 * Extract Date Period References using LLM
 * Uses AI understanding to identify date/period references and convert them to DHIS2 format
 */
export const extractDatePeriodLLM = tool(
    async (input: { query: string, context?: string }) => {
        try {
            console.log('📅 LLM date period extraction called for:', input.query);

            // Initialize Azure OpenAI LLM
	        const env = (import.meta as any).env;
	        const llm = new AzureChatOpenAI({
		        model: env.DHIS2_OPENAI_MODEL || 'gpt-4',
		        temperature: 0.1, // Low temperature for consistent filtering
		        maxTokens: 150,   // Longer output for period analysis
		        azureOpenAIApiKey: env.DHIS2_AZURE_KEY,
		        azureOpenAIEndpoint: env.DHIS2_AZURE_ENDPOINT,
		        azureOpenAIApiDeploymentName: env.DHIS2_AZURE_API_DEPLOYMENT_NAME,
		        azureOpenAIApiVersion: env.DHIS2_AZURE_API_VERSION,
	        });

            // Create comprehensive prompt for date/period extraction
            const prompt = `
Analyze this DHIS2 analytics query and extract date/period references, converting them to DHIS2 period format.

DHIS2 PERIOD FORMATS:
- Days: yyyyMMdd (20040315 = March 15, 2004)
- Weeks: yyyyWn (2004W10 = Week 10, 2004)
- Months: yyyyMM (200403 = March 2004)
- Quarters: yyyyQn (2004Q1 = Jan-Mar 2004)
- Six-month: yyyySn (2004S1 = Jan-Jun 2004)
- Six-month April: yyyyAprilSn (2004AprilS1 = Apr-Sep 2004)
- Years: yyyy (2004 = full year 2004)
- Financial Year April: yyyyApril (2004April = Apr 2004 - Mar 2005)
- Financial Year July: yyyyJuly (2004July = Jul 2004 - Jun 2005)
- Financial Year Oct: yyyyOct (2004Oct = Oct 2004 - Sep 2005)

RELATIVE PERIODS (relative to current date):
- THIS_WEEK, LAST_WEEK, LAST_4_WEEKS, LAST_12_WEEKS, LAST_52_WEEKS
- THIS_MONTH, LAST_MONTH, THIS_BIMONTH, LAST_BIMONTH
- THIS_QUARTER, LAST_QUARTER, THIS_SIX_MONTH, LAST_SIX_MONTH
- MONTHS_THIS_YEAR, QUARTERS_THIS_YEAR, THIS_YEAR, MONTHS_LAST_YEAR
- QUARTERS_LAST_YEAR, LAST_YEAR, LAST_5_YEARS, LAST_12_MONTHS
- LAST_3_MONTHS, LAST_6_BIMONTHS, LAST_4_QUARTERS, LAST_2_SIXMONTHS
- THIS_FINANCIAL_YEAR, LAST_FINANCIAL_YEAR, LAST_5_FINANCIAL_YEARS

QUERY: "${input.query}"
CONTEXT: ${input.context || 'Health analytics query - extract time periods for data analysis'}

EXAMPLES:
"Show data for March 2024" → ["202403"]
"HIV cases in 2023" → ["2023"]
"Last month results" → ["LAST_MONTH"]
"This week and last week" → ["THIS_WEEK", "LAST_WEEK"]
"Quarterly trends for 2023" → ["2023Q1", "2023Q2", "2023Q3", "2023Q4"]
"Financial year 2024April" → ["2024April"]
"March 15, 2024 to April 15, 2024" → ["20240315", "20240415"]

IMPORTANT RULES:
- Convert explicit dates to exact DHIS2 format (remove hyphens, use compact form)
- Use RELATIVE periods for phrases like "last month", "this year"
- For date ranges, list individual periods chronologically
- For year references (like "2023"), use full year format
- For month names, combine with year: "March 2024" → "202403"
- If multiple interpretations possible, prefer most specific format
- Return empty array [] if no date/period references found

Return ONLY a JSON object with:
{
  "periods": ["period1", "period2", ...],
  "matchedPhrases": ["March 2024", "2023"],
  "periodTypes": ["month", "year"],
  "confidence": "high|medium|low",
  "interpretation": "brief explanation of how periods were derived"
}
`;

            // Make LLM call
            const llmResponse = await llm.invoke([
                { role: "system", content: prompt },
                { role: "user", content: `Extract date periods: ${input.query}` }
            ]);

            console.log('📅 LLM response:', llmResponse.content);

            // Parse LLM response
            const content = (llmResponse.content as string).trim();
            let periodResult: any;

            try {
                periodResult = JSON.parse(content);
                // Validate expected structure
                if (!periodResult.periods || !Array.isArray(periodResult.periods)) {
                    throw new Error('Invalid response structure');
                }
            } catch (parseError) {
                console.warn('⚠️ LLM returned invalid JSON, attempting extraction');
                // Attempt basic extraction
                const periodMatch = content.match(/periods["\s:]+(\[[^\]]*\])/);
                if (periodMatch) {
                    try {
                        periodResult = { periods: JSON.parse(periodMatch[1]) };
                    } catch (e) {
                        periodResult = { periods: [] };
                    }
                } else {
                    periodResult = { periods: [] };
                }
            }

            // Clean and validate periods
            const cleanPeriods = (periodResult.periods || [])
                .filter((period: any) => typeof period === 'string' && period.length > 0)
                .map((period: string) => period.trim())
                .filter((period: string, index: number, arr: string[]) => arr.indexOf(period) === index) // Remove duplicates
                .slice(0, 10); // Limit to 10 periods

            console.log('📅 Extracted periods:', cleanPeriods);

            return JSON.stringify({
                periods: cleanPeriods,
                matchedPhrases: periodResult.matchedPhrases || [],
                periodTypes: periodResult.periodTypes || [],
                method: 'llm_extraction',
                llmModel: (llm as any).modelName,
                query: input.query,
                context: input.context,
                confidence: periodResult.confidence || (cleanPeriods.length > 0 ? 'high' : 'low'),
                interpretation: periodResult.interpretation || 'Period extraction result'
            });

        } catch (error) {
            console.error('❌ Error in LLM date period extraction:', error);

            // Graceful failure fallback
            return JSON.stringify({
                periods: [],
                error: `Date period extraction failed: ${error.message}`,
                method: 'failed_llm_extraction',
                query: input.query,
                fallback_available: true
            });
        }
    },
    {
        name: "extract_date_period_llm",
        description: "Extract date/period references from natural language queries and convert them to DHIS2 period format. Handles fixed periods (yyyyMMdd, yyyyWn, etc.) and relative periods (THIS_WEEK, LAST_MONTH, etc.) for analytics data queries.",
        schema: z.object({
            query: z.string().describe("The user's query text to analyze for date/period references"),
            context: z.string().optional().describe("Optional context about the analytics query type")
        })
    }
);


// =============================================================================
// ECHARTS DATA PROCESSING - INTERNAL FUNCTIONS
// =============================================================================

let analyticsCharts: AnalyticsChartData[] = [];
const MAX_CHARTS = 10; // Keep last 10 charts

/**
 * Process analytics data for chart visualization
 */
async function processAnalyticsForChart(params: {
    analyticsData: any;
    chartType: 'line' | 'bar' | 'pie';
    indicators: string[];
    periods: string[];
    orgUnits: string[];
    disaggregations: string[];
    filterOptions?: any[];
    title: string;
    hasCoDimension?: boolean;
}): Promise<AnalyticsChartData> {
    const { analyticsData, indicators, periods, orgUnits, disaggregations, title } = params;

    // Extract data from nested DHIS2 response structure
    const analytics = analyticsData?.data?.analytics;
    const rows = analytics?.rows || [];
    const headers = analytics?.headers || [];

    if (rows.length === 0) {
        throw new Error("No data available for chart visualization");
    }

    // First pass: collect all unique values to validate filtering
    const allIndicators = new Set<string>();
    const allPeriods = new Set<string>();
    const allOrgUnits = new Set<string>();

    rows.forEach((row: any[]) => {
        headers.forEach((header: any, index: number) => {
            if (header.column === 'Data') {
                allIndicators.add(row[index]);
            } else if (header.column === 'Period') {
                allPeriods.add(row[index]);
            } else if (header.column === 'Organisation unit') {
                allOrgUnits.add(row[index]);
            }
        });
    });

    // Process rows into chart-compatible format
    let filteredRows = rows.map((row: any[]) => {
        const rowObj: any = {};
        headers.forEach((header: any, index: number) => {
            const value = row[index];

            // Map header names to object properties (use API names, not display names)
            if (header.name === 'ou') {
                rowObj.org_unit = value;
            } else if (header.name === 'pe') {
                rowObj.period = value;
            } else if (header.name === 'dx') {
                rowObj.dx = value;
            } else if (header.name === 'value') {
                // Ensure numeric values
                rowObj.value = parseFloat(value.toString()) || 0;
            } else if (header.name.startsWith('co_')) { // Category options
                rowObj[header.name] = value;
            } else {
                rowObj[header.name.toLowerCase().replace(/\s+/g, '_')] = value;
            }
        });
        return rowObj;
    });

    // Apply disaggregation filtering if specific breakdowns are requested

    // Extract metadata for fallback lookups and display names
    const metaDataItems = analytics?.metaData?.items || {};
    const metaDataPeriods = analytics?.metaData?.dimensions?.pe || [];

    // Intelligent name resolution: Use readable names directly when provided by DHIS2,
    // or resolve from metadata when needed (backward compatibility)
    const resolveIndicatorNames = Array.from(allIndicators).map(value => {
        // If DHIS2 provided readable names in rows, use them directly
        if (typeof value === 'string' && value.length > 10) {
            return value; // Already readable (long text = human-readable name)
        }
        // Otherwise try metadata lookup (legacy compatibility)
        return metaDataItems[value]?.name || metaDataItems[value]?.displayName || value;
    });

    const resolveOrgUnitNames = Array.from(allOrgUnits).map(value => {
        // If DHIS2 provided readable names in rows, use them directly
        if (typeof value === 'string' && value.length > 2 && !/^[a-zA-Z0-9_-]+$/.test(value)) {
            return value; // Already readable (contains spaces/symbols = human-readable name)
        }
        // Otherwise try metadata lookup (legacy compatibility)
        return metaDataItems[value]?.name || metaDataItems[value]?.displayName || value;
    });

    // Build grouped filter structure
    const filterGroups: Array<{
        name: string;
        type: 'orgUnits' | 'periods' | 'category';
        options: Array<{name: string, id: string}>;
        selected: string[];
        categoryId?: string;
    }> = [];

    // Create a mapping of org unit IDs to names
    const orgUnitNameMap = new Map<string, string>();
    Array.from(allOrgUnits).forEach((id, index) => {
        orgUnitNameMap.set(id, resolveOrgUnitNames[index] || id);
    });

    // Add organization units filter group
    filterGroups.push({
        name: 'Organization Units',
        type: 'orgUnits',
        options: Array.from(allOrgUnits).map(id => ({
            name: orgUnitNameMap.get(id) || id,
            id: id
        })),
        selected: []
    });

    // Add periods filter group - use display names from metadata
    filterGroups.push({
        name: 'Periods',
        type: 'periods',
        options: Array.from(allPeriods).map(period => {
            const item = metaDataItems[period];
            return {
                name: item?.name || item?.displayName || period,
                id: period
            };
        }),
        selected: []
    });

    // Add category filter groups from passed filterOptions
    if (params.filterOptions && params.filterOptions.length > 0) {
        // Use the filterOptions passed from disaggregations metadata (these are the COCs we constructed)
        params.filterOptions.forEach((filterOption: any) => {
            // Convert arrays to objects for cleaner structure
            const options: Array<{name: string, id: string}> = filterOption.options.map((name: string, id: string) => ({
                name,
                id
            }));

            filterGroups.push({
                name: filterOption.name,
                type: 'category' as const,
                options,
                selected: [],
                categoryId: filterOption.categoryId
            });
        });
    }

    // Build disaggregations structure from dimension strings
    const disaggregationGroups: Array<{
        categoryId: string;
        categoryName: string;
        options: Array<{name: string, id: string}>;
    }> = [];

    // Parse disaggregation dimensions to extract option IDs and build proper structure
    if (params.disaggregations && params.disaggregations.length > 0) {
        params.disaggregations.forEach((dimensionStr: string) => {
            // Parse dimension string like "categoryId:optionId1;optionId2"
            const [categoryId, optionIdsStr] = dimensionStr.split(':');
            if (!categoryId || !optionIdsStr) return;

            const optionIds = optionIdsStr.split(';').filter(id => id.length > 0);

            // Find category in filterOptions to get category name and option details
            const categoryFilterOption = params.filterOptions?.find((fo: any) =>
                fo.categoryId === categoryId || fo.categoryId === categoryId
            );

            if (categoryFilterOption && optionIds.length > 0) {
                // Build options array with names and IDs
                const options: Array<{name: string, id: string}> = [];
                optionIds.forEach(optionId => {
                    // Find option name from category filter options
                    const optionIndex = categoryFilterOption.optionIds?.indexOf(optionId);
                    const optionName = optionIndex !== -1 && categoryFilterOption.options ?
                        categoryFilterOption.options[optionIndex] : optionId;

                    options.push({
                        name: optionName,
                        id: optionId
                    });
                });

                disaggregationGroups.push({
                    categoryId,
                    categoryName: categoryFilterOption.categoryName || `Category ${categoryId}`,
                    options
                });
            }
        });
    }

    return {
        id: generateAnalyticsMemoryId(),
        title,
        timestamp: Date.now(),
        chartType: params.chartType,
        echartsConfig: {},
        filteredData: filteredRows,
        dimensions: {
            indicators: Array.from(allIndicators), // Always use what's actually in the data
            periods: Array.from(allPeriods),       // Always use what's actually in the data
            orgUnits: orgUnits.length > 0 ? orgUnits : Array.from(allOrgUnits),
            disaggregations: disaggregationGroups  // Now contains proper structure with option IDs
        },
        filterGroups,
        metaData: {
            indicators: resolveIndicatorNames, // Human-readable indicator names
            orgUnits: resolveOrgUnitNames,     // Human-readable org unit names
            periods: Array.from(allPeriods),   // Period IDs for internal use
            items: metaDataItems               // Full metadata mapping for display names
        }
    };
}

/**
 * Build ECharts option object from processed chart data
 */
export function buildEChartsOption(chartData: AnalyticsChartData): any {
    const { filteredData, chartType, dimensions, title } = chartData;

    if (filteredData.length === 0) {
        return { title: { text: 'No Data Available' } };
    }

    // Group data by dimensions for charting - use display names for periods
    const dataByDimension = groupChartData(filteredData, chartType, chartData.metaData);

    const baseOption = {
        title: {
            text: title,
            left: 'center',
            textStyle: { fontSize: 16, fontWeight: 'bold' }
        },
        tooltip: {
            trigger: chartType === 'pie' ? 'item' : 'axis',
            formatter: chartType === 'pie'
                ? '{a} <br/>{b}: {c} ({d}%)'
                : '{b}<br/>{a}: {c}'
        },
        legend: {
            orient: 'horizontal',
            top: 30,
            data: []
        },
        grid: {
            left: '3%',
            right: '4%',
            bottom: '3%',
            containLabel: true
        },
        xAxis: chartType !== 'pie' ? {
            type: 'category',
            data: [],
            name: 'Period',
            nameLocation: 'middle',
            nameGap: 25
        } : undefined,
        yAxis: chartType !== 'pie' ? {
            type: 'value',
            name: 'Value',
            nameLocation: 'middle',
            nameGap: 40
        } : undefined,
        series: []
    };

    // Build series data
    if (chartType === 'pie' && dimensions.indicators.length === 1) {
        // Single pie chart for one indicator
        baseOption.series = [{
            name: dimensions.indicators[0],
            type: 'pie',
            radius: ['40%', '70%'],
            center: ['50%', '60%'],
            data: dataByDimension.pieData,
            emphasis: {
                itemStyle: {
                    shadowBlur: 10,
                    shadowOffsetX: 0,
                    shadowColor: 'rgba(0, 0, 0, 0.5)'
                }
            },
            label: {
                show: true,
                formatter: '{b}: {d}%'
            }
        }];
        baseOption.legend.data = dataByDimension.labels;
    } else if (chartType === 'bar' || chartType === 'line') {
        // Multi-series chart
        baseOption.xAxis.data = dataByDimension.categories;
        baseOption.series = dataByDimension.series.map(series => ({
            name: series.name,
            type: chartType,
            data: series.data,
            smooth: chartType === 'line',
            symbol: 'circle',
            symbolSize: 6,
            lineStyle: {
                width: 2
            },
            itemStyle: {
                borderRadius: chartType === 'bar' ? [2, 2, 0, 0] : undefined
            }
        }));
        baseOption.legend.data = dataByDimension.series.map(s => s.name);
    }

    // Color scheme
    const colors = ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc'];
    const chartOption: any = baseOption; // Cast to any to allow color assignment
    if (baseOption.series.length > 0) {
        chartOption.color = colors.slice(0, baseOption.series.length);
    }
    return chartOption;
}

/**
 * Sort DHIS2 periods chronologically
 * Handles various period formats: YYYYMM, YYYYQX, YYYY, YYYYWX, etc.
 */
function sortPeriodsChronologically(a: string, b: string): number {
    // Handle different period formats by converting to comparable values

    // Monthly periods: YYYYMM (e.g., 202401, 202402)
    if (/^\d{6}$/.test(a) && /^\d{6}$/.test(b)) {
        const yearA = parseInt(a.substring(0, 4));
        const monthA = parseInt(a.substring(4, 6));
        const yearB = parseInt(b.substring(0, 4));
        const monthB = parseInt(b.substring(4, 6));

        if (yearA !== yearB) return yearA - yearB;
        return monthA - monthB;
    }

    // Quarterly periods: YYYYQX (e.g., 2024Q1, 2024Q2)
    if (/^\d{4}Q[1-4]$/.test(a) && /^\d{4}Q[1-4]$/.test(b)) {
        const yearA = parseInt(a.substring(0, 4));
        const quarterA = parseInt(a.substring(5));
        const yearB = parseInt(b.substring(0, 4));
        const quarterB = parseInt(b.substring(5));

        if (yearA !== yearB) return yearA - yearB;
        return quarterA - quarterB;
    }

    // Six-month periods: YYYYSX (e.g., 2024S1, 2024S2)
    if (/^\d{4}S[1-2]$/.test(a) && /^\d{4}S[1-2]$/.test(b)) {
        const yearA = parseInt(a.substring(0, 4));
        const semesterA = parseInt(a.substring(5));
        const yearB = parseInt(b.substring(0, 4));
        const semesterB = parseInt(b.substring(5));

        if (yearA !== yearB) return yearA - yearB;
        return semesterA - semesterB;
    }

    // Financial year periods: YYYYApril, YYYYJuly, YYYYOct (e.g., 2024April)
    if (/^\d{4}(April|July|Oct)$/.test(a) && /^\d{4}(April|July|Oct)$/.test(b)) {
        const yearA = parseInt(a.substring(0, 4));
        const monthA = a.substring(4).toLowerCase();
        const yearB = parseInt(b.substring(0, 4));
        const monthB = b.substring(4).toLowerCase();

        // Map financial year start months to numbers
        const monthOrder: Record<string, number> = { 'april': 1, 'july': 2, 'oct': 3 };

        if (yearA !== yearB) return yearA - yearB;
        return monthOrder[monthA] - monthOrder[monthB];
    }

    // Weekly periods: YYYYWX (e.g., 2024W01, 2024W52)
    if (/^\d{4}W\d{2}$/.test(a) && /^\d{4}W\d{2}$/.test(b)) {
        const yearA = parseInt(a.substring(0, 4));
        const weekA = parseInt(a.substring(5));
        const yearB = parseInt(b.substring(0, 4));
        const weekB = parseInt(b.substring(5));

        if (yearA !== yearB) return yearA - yearB;
        return weekA - weekB;
    }

    // Six-month April periods: YYYYAprilSX (e.g., 2024AprilS1)
    if (/^\d{4}AprilS[1-2]$/.test(a) && /^\d{4}AprilS[1-2]$/.test(b)) {
        const yearA = parseInt(a.substring(0, 4));
        const semesterA = parseInt(a.substring(10));
        const yearB = parseInt(b.substring(0, 4));
        const semesterB = parseInt(b.substring(10));

        if (yearA !== yearB) return yearA - yearB;
        return semesterA - semesterB;
    }

    // Daily periods: YYYYMMDD (e.g., 20240115)
    if (/^\d{8}$/.test(a) && /^\d{8}$/.test(b)) {
        return a.localeCompare(b); // String comparison works for YYYYMMDD format
    }

    // Yearly periods: YYYY (e.g., 2023, 2024)
    if (/^\d{4}$/.test(a) && /^\d{4}$/.test(b)) {
        return parseInt(a) - parseInt(b);
    }

    // Relative periods or other formats - fall back to alphabetical sorting
    return a.localeCompare(b);
}

/**
 * Group chart data by appropriate dimensions
 */
function groupChartData(data: any[], chartType: string, metadata?: any): any {
    if (chartType === 'pie') {
        // For pie charts, group by periods/quarters
        const periodGroups: Record<string, number> = {};
        data.forEach(row => {
            const period = row.period || 'Unknown';
            periodGroups[period] = (periodGroups[period] || 0) + (row.value || 0);
        });

        return {
            pieData: Object.entries(periodGroups).map(([name, value]) => ({
                name,
                value
            })),
            labels: Object.keys(periodGroups)
        };
    } else {
        // For line/bar charts, organize by indicators over periods with disaggregation support
        const periodOrder: string[] = [];
        const seriesMap: Record<string, Record<string, number>> = {};

        // Detect if data has category option columns (disaggregation)
        const hasCategoryOptions = data.length > 0 && Object.keys(data[0]).some(key => key.startsWith('co'));

        console.log(`📊 Chart grouping - Has disaggregations: ${hasCategoryOptions}`);

        data.forEach(row => {
            const period = row.period || 'Unknown';
            const indicator = row.dx || 'Unknown';

            if (!periodOrder.includes(period)) {
                periodOrder.push(period);
            }

            // Build series key - include category option if present for disaggregation
            let seriesKey = indicator;
            
            if (hasCategoryOptions) {
                // Extract category option values from co_* columns
                const categoryOptionValues: string[] = [];
                
                for (const [key, value] of Object.entries(row)) {
                    if (key.startsWith('co_') && value) {
                        categoryOptionValues.push(String(value));
                    }
                }

                // If we found category options, append them to create unique series
                if (categoryOptionValues.length > 0) {
                    const categoryLabel = categoryOptionValues.join(' - ');
                    seriesKey = `${indicator} (${categoryLabel})`;
                    console.log(`📊 Creating disaggregated series: ${seriesKey}`);
                }
            }

            // Initialize series if needed
            if (!seriesMap[seriesKey]) {
                seriesMap[seriesKey] = {};
            }

            // Aggregate values by period for this series
            seriesMap[seriesKey][period] = (seriesMap[seriesKey][period] || 0) + (row.value || 0);
        });

        // Sort periods chronologically by their DHIS2 period IDs
        // Helper function to get period ID from period (which might be ID or display name)
        const getPeriodId = (period: string): string => {
            if (metadata?.items) {
                // If period is already an ID, return it
                if (metadata.items[period]) {
                    return period;
                }
                // Otherwise, find the ID by display name
                for (const [key, item] of Object.entries(metadata.items)) {
                    if (item['name'] === period) {
                        return key;
                    }
                }
            }
            return period;
        };

        periodOrder.sort((a, b) => {
            const idA = getPeriodId(a);
            const idB = getPeriodId(b);
            return sortPeriodsChronologically(idA, idB);
        });

        // Create display names in the same order as sorted period IDs
        const displayNames = periodOrder.map(periodId => {
            const item = metadata?.items?.[periodId];
            return item?.name || item?.displayName || periodId;
        });

        // Create mapping from period ID to display name
        const periodToDisplayMap = new Map<string, string>();
        periodOrder.forEach((periodId, index) => {
            periodToDisplayMap.set(periodId, displayNames[index]);
        });

        // Transform series data to use display names as keys instead of period IDs
        const displaySeriesMap: Record<string, Record<string, number>> = {};
        Object.entries(seriesMap).forEach(([seriesName, periodData]) => {
            displaySeriesMap[seriesName] = {};
            Object.entries(periodData).forEach(([periodId, value]) => {
                const displayName = periodToDisplayMap.get(periodId) || periodId;
                displaySeriesMap[seriesName][displayName] = value;
            });
        });

        console.log(`📊 Generated ${Object.keys(displaySeriesMap).length} series with ${displayNames.length} periods (using display names)`);

        return {
            categories: displayNames,  // Use display names for x-axis labels
            series: Object.entries(displaySeriesMap).map(([seriesName, periodData]) => ({
                name: seriesName,
                data: displayNames.map(displayName => periodData[displayName] || 0)
            }))
        };
    }
}

/**
 * Apply filters to chart data
 */
function applyChartFilters(chart: AnalyticsChartData, filters: any): any[] {
    let filteredData = [...chart.filteredData];

    if (filters.indicators && filters.indicators.length > 0) {
        filteredData = filteredData.filter(row => filters.indicators.includes(row.dx));
    }
    if (filters.periods && filters.periods.length > 0) {
        filteredData = filteredData.filter(row => filters.periods.includes(row.period));
    }
    if (filters.orgUnits && filters.orgUnits.length > 0) {
        filteredData = filteredData.filter(row => filters.orgUnits.includes(row.org_unit));
    }
    // Filter by selected category options in co* columns (disaggregation filtering)
    if (filters.disaggregations && filters.disaggregations.length > 0) {
        filteredData = filteredData.filter(row => {
            // Check if any co* column in this row contains any of the selected disaggregation options
            for (const [key, value] of Object.entries(row)) {
                if (key.startsWith('co') && value && filters.disaggregations.includes(value as string)) {
                    return true; // Include this row if it has a matching category option
                }
            }
            return false; // Exclude this row if no matching category options found
        });
    }

    return filteredData;
}

/**
 * Generate export data in requested format
 */
function generateChartExport(chart: AnalyticsChartData, format: string): any {
    switch (format) {
        case 'csv':
            // Convert chart data to CSV
            if (!chart.filteredData || chart.filteredData.length === 0) {
                return 'No data available';
            }
            const headers = Object.keys(chart.filteredData[0]);
            const csvRows = [headers.join(',')];
            chart.filteredData.forEach(row => {
                const values = headers.map(h => row[h] || '');
                csvRows.push(values.join(','));
            });
            return csvRows.join('\n');

        case 'json':
            return JSON.stringify(chart, null, 2);

        case 'png':
        case 'svg':
            // For image exports, this would need frontend canvas handling
            return {
                chartId: chart.id,
                title: chart.title,
                message: 'Image export requires frontend ECharts component'
            };

        default:
            throw new Error(`Unsupported export format: ${format}`);
    }
}

/**
 * Store analytics chart for persistence and follow-up queries
 */
function storeAnalyticsChart(chart: AnalyticsChartData): string {
    analyticsCharts.unshift(chart);
    if (analyticsCharts.length > MAX_CHARTS) {
        analyticsCharts = analyticsCharts.slice(0, MAX_CHARTS);
    }
    return chart.id;
}

// =============================================================================
// LLM-FIRST TOOLS - NEW ARCHITECTURE (RESTORED FROM ORIGINAL)
// Pure tool calling: LLM selects tool + extracts parameters from schema
// =============================================================================

/**
 * Generate unique ID for analytics memory entries
 */
function generateAnalyticsMemoryId(): string {
    return `analytics_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export const createDhis2Category = createLLMFirstTool({
    name: "create_dhis2_category",
    description: "Create DHIS2 categories that define disaggregation dimensions for data collection. Categories organize your data by dividing it into subgroups like Age categories ('<5', '5-14', '>14') or Gender categories ('Male', 'Female'). Categories require at least one category option and are created with separate option entities.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the data disaggregation category"),
        categoryOptions: z.array(z.string()).min(1).describe("List of category options like ['Male', 'Female'] or ['Urban', 'Rural']"),
        dataDimension: z.boolean().default(true).describe("Whether this category can be used in data analysis"),
        dataDimensionType: z.enum(['DISAGGREGATION', 'ATTRIBUTE']).default('DISAGGREGATION').describe("Whether this category is for data disaggregation or attribute-based categorization")
    }),
    metadataType: "categories",
    dhis2SchemaName: "Category",
    preparePayload: async (input) => {
        const { name, categoryOptions, dataDimension = true, dataDimensionType = 'DISAGGREGATION' } = input;

        // Generate category ID
        const categoryId = await generateDhis2Id();

        // Generate option IDs and create option entities
        const optionIds = await Promise.all(
            categoryOptions.map(async () => await generateDhis2Id())
        );

        // Build aggregated payload for both categories and category options
        return {
            categories: [{
                id: categoryId,
                name: name,
                displayName: name,
                shortName: name.length > 50 ? name.substring(0, 47) + '...' : name,
                code: generateDhis2Code(name),
                dataDimension: dataDimension,
                dataDimensionType: dataDimensionType,
                categoryOptions: optionIds.map((optionId: string) => ({ id: optionId }))
            }],
            categoryOptions: categoryOptions.map((optionName: string, index: number) => ({
                id: optionIds[index],
                name: optionName,
                displayName: optionName,
                shortName: optionName.length > 50 ? optionName.substring(0, 47) + '...' : optionName,
                code: generateDhis2Code(optionName),
                sortOrder: index + 1
            }))
        };
    }
});

export const createDhis2CategoryCombo = createLLMFirstTool({
    name: "create_dhis2_category_combo",
    description: "Create DHIS2 category combinations that combine multiple categories for complex disaggregation. For example, combine Age and Gender categories to get Age x Gender breakdowns. Requires at least one category.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the category combination"),
        categories: z.array(z.string()).min(1).describe("List of category names to combine")
    }),
    metadataType: "categoryCombos",
    dhis2SchemaName: "CategoryCombo",
    preparePayload: async (input) => {
        const { categories: categoryNames, ...otherInput } = input;

        // Resolve category names to category objects with IDs
        const resolvedCategories: Array<{ id: string }> = [];

        for (const categoryName of categoryNames) {
            try {
                // Search for existing category by name (exact match preferred)
                const searchResults = await searchDhis2Metadata('categories', categoryName, 10);

                let categoryId: string;

                // First check for exact name match
                const exactMatch = searchResults.find((cat: any) => cat.name === categoryName);

                if (exactMatch) {
                    // Found existing category with exact name match
                    categoryId = exactMatch.id;
                    console.log(`Found existing category "${categoryName}" with ID: ${categoryId}`);
                } else {
                    // No exact match found - create a new category with appropriate options
                    console.log(`No exact match for "${categoryName}". Attempting to create new category.`);

                    // Generate default options based on common category types
                    let defaultOptions: string[] = [];
                    if (categoryName.toLowerCase() === 'age' || categoryName.toLowerCase() === 'age groups') {
                        defaultOptions = ['<5 years', '5-14 years', '15-49 years', '50+ years'];
                    } else if (categoryName.toLowerCase() === 'gender' || categoryName.toLowerCase() === 'sex') {
                        defaultOptions = ['Male', 'Female'];
                    } else {
                        // Generic fallback - this shouldn't happen but provides some options
                        defaultOptions = ['Option 1', 'Option 2'];
                    }

                    // Create the category using the existing aggregated category creation approach
                    const newCategoryId = await generateDhis2Id();
                    const optionIds = await Promise.all(
                        defaultOptions.map(async () => await generateDhis2Id())
                    );

                    // Build aggregated payload for the new category and category options
                    const newCategoryPayload = {
                        categories: [{
                            id: newCategoryId,  // UID for ID field
                            name: categoryName,  // User-provided category name for name field
                            displayName: categoryName,
                            shortName: categoryName.length > 50 ? categoryName.substring(0, 47) + '...' : categoryName,
                            code: generateDhis2Code(categoryName),
                            dataDimension: true,
                            dataDimensionType: 'DISAGGREGATION',
                            categoryOptions: optionIds.map((optionId: string) => ({ id: optionId }))
                        }],
                        categoryOptions: defaultOptions.map((optionName: string, index: number) => ({
                            id: optionIds[index],  // UID for ID field
                            name: optionName,       // User-provided option name for name field
                            displayName: optionName,
                            shortName: optionName.length > 50 ? optionName.substring(0, 47) + '...' : optionName,
                            code: generateDhis2Code(optionName),
                            sortOrder: index + 1
                        }))
                    };

                    // Create the category
                    const categoryResult = await createDhis2MetadataAggregated(newCategoryPayload);
                    if (categoryResult.results.some(r => r.type === 'categories' && r.created)) {
                        categoryId = newCategoryId;
                        console.log(`Successfully created new category "${categoryName}" with options: ${defaultOptions.join(', ')}`);
                    } else {
                        throw new Error(`Failed to create category "${categoryName}"`);
                    }
                }

                resolvedCategories.push({ id: categoryId });
            } catch (error) {
                console.error(`Error resolving category "${categoryName}":`, error);
                throw new Error(`Failed to resolve category "${categoryName}": ${error.message}`);
            }
        }

        // Return the transformed payload with categories as objects with IDs
        return {
            ...otherInput,
            categories: resolvedCategories,
            dataDimensionType: 'DISAGGREGATION' // Ensure proper dataDimensionType
        };
    },
    dependencies: [
        {
            type: "categories",
            name: "default",
            createIfNotFound: true,
            createParams: {
                name: "Default Category",
                displayName: "Default Category",
                shortName: "Default Cat",
                dataDimension: true,
                dataDimensionType: 'DISAGGREGATION',
                categoryOptions: []
            }
        }
    ]
});

export const createDhis2DataSet = createLLMFirstTool({
    name: "create_dhis2_data_set",
    description: "Create DHIS2 data sets that define reporting forms and data collection templates. Data sets specify what indicators are collected, the reporting frequency, and which organisation units submit the data. Examples: 'Monthly Immunization Report', 'Quarterly Financial Summary', 'Weekly Surveillance Data'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the data set/reporting form"),
        description: z.string().optional().describe("Description of what this data set collects"),
        periodType: z.enum(['Daily', 'Weekly', 'Monthly', 'Quarterly', 'SixMonthly', 'Yearly', 'FinancialApril', 'FinancialJuly', 'FinancialOct']).default('Monthly').describe("How often data is reported"),
        categoryComboName: z.string().optional().describe("Name of category combination to use for disaggregation (e.g., 'Age and Gender'). If not specified, uses a default category combination.")
    }),
    metadataType: "dataSets",
    dhis2SchemaName: "DataSet",
    preparePayload: async (input) => {
        let result = { ...input };

        // If category combo name is specified, resolve it to category combo ID
        if (result.categoryComboName) {
            try {
                const searchResults = await searchDhis2Metadata('categoryCombos', result.categoryComboName, 10);

                const exactMatch = searchResults.find((combo: any) =>
                    combo.name.toLowerCase() === result.categoryComboName!.toLowerCase()
                ) || searchResults[0];

                if (exactMatch) {
                    result.categoryCombo = { id: exactMatch.id };
                    console.log(`Resolved category combo "${result.categoryComboName}" to ID: ${exactMatch.id}`);
                } else {
                    console.warn(`Category combo "${result.categoryComboName}" not found. Dataset will use default category combo.`);
                }
            } catch (error) {
                console.warn(`Failed to resolve category combo "${result.categoryComboName}":`, error);
            }
        }

        return result;
    },
    dependencies: [
        {
            type: "categoryCombos",
            name: "default",
            createIfNotFound: true,
            createParams: {
                name: "Default",
                displayName: "Default",
                shortName: "Default",
                dataDimensionType: "DISAGGREGATION",
                categories: []
            }
        }
    ]
});

export const createDhis2Program = createLLMFirstTool({
    name: "create_dhis2_program",
    description: "Create DHIS2 programs that define tracker or event-based data collection workflows. Programs are the top-level containers for tracker entities and their enrollment/enrollment processes. Examples: 'HIV Care Program', 'Tuberculosis Case Surveillance', 'Malaria Elimination Initiative'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the program/workflow"),
        description: z.string().optional().describe("Description of the program's purpose and scope"),
        programType: z.enum(['WITH_REGISTRATION', 'WITHOUT_REGISTRATION']).default('WITH_REGISTRATION').describe("WITH_REGISTRATION for tracker programs tracking individual entities over time, WITHOUT_REGISTRATION for event-only programs"),
        version: z.number().int().min(1).default(1).describe("Version number of the program")
    }),
    metadataType: "programs",
    dhis2SchemaName: "Program"
});

export const createDhis2IndicatorAdvanced = createLLMFirstTool({
    name: "create_dhis2_indicator_simple",
    description: "Create DHIS2 indicators that calculate performance measures and KPIs from data. Indicators perform mathematical calculations on data values to produce meaningful metrics like coverage rates, completion percentages, or averages. Choose this tool for simple indicators with direct parameter specification. Examples: 'HIV Testing Coverage', 'Vaccination Rate', 'Treatment Success Rate'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the indicator/performance measure"),
        description: z.string().optional().describe("Description of what this indicator measures"),
        numeratorExpression: z.string().min(1).describe("Mathematical expression for the numerator (e.g., '#{HIV_Tests_Completed}')"),
        denominatorExpression: z.string().min(1).describe("Mathematical expression for the denominator (e.g., '#{Target_Population}')"),
        annualized: z.boolean().default(false).describe("Whether this is an annualized indicator"),
        indicatorTypeId: z.string().optional().describe("ID of indicator type to use (specifies calculation method like percentage/count/etc)")
    }),
    metadataType: "indicators",
    dhis2SchemaName: "Indicator"
});

export const createDhis2Indicator = createDhis2IndicatorAdvanced; // Main export uses the simple LLM-first version

// Search Tools
export const searchDhis2DataElements = createDhis2SearchTool("dataElements", "Data Elements");
export const searchDhis2OrganisationUnits = createDhis2SearchTool("organisationUnits", "Organisation Units");
export const searchDhis2Categories = createDhis2SearchTool("categories", "Categories");
export const searchDhis2CategoryCombos = createDhis2SearchTool("categoryCombos", "Category Combinations");
export const searchDhis2CategoryOptions = createDhis2SearchTool("categoryOptions", "Category Options");
export const searchDhis2CategoryOptionCombos = createDhis2SearchTool("categoryOptionCombos", "Category Option Combinations");
export const searchDhis2OrganisationUnitGroups = createDhis2SearchTool("organisationUnitGroups", "Organisation Unit Groups");
export const searchDhis2OrganisationUnitGroupSets = createDhis2SearchTool("organisationUnitGroupSets", "Organisation Unit Group Sets");
export const searchDhis2DataSets = createDhis2SearchTool("dataSets", "Data Sets");
export const searchDhis2Programs = createDhis2SearchTool("programs", "Programs");
export const searchDhis2TrackedEntityTypes = createDhis2SearchTool("trackedEntityTypes", "Tracked Entity Types");
export const searchDhis2TrackedEntityAttributes = createDhis2SearchTool("trackedEntityAttributes", "Tracked Entity Attributes");
export const searchDhis2Validations = createDhis2SearchTool("validationRules", "Validation Rules");
export const searchDhis2OptionSets = createDhis2SearchTool("optionSets", "Option Sets");
export const searchDhis2Indicators = createDhis2SearchTool("indicators", "Indicators");
export const searchDhis2Visualizations = createDhis2SearchTool("visualizations", "Visualizations");
export const searchDhis2Dashboards = createDhis2SearchTool("dashboards", "Dashboards");
export const searchDhis2Users = createDhis2SearchTool("users", "Users");
export const searchDhis2RelationshipTypes = createDhis2SearchTool("relationshipTypes", "Relationship Types");

// Update Relationship Tools
export const updateDhis2RelationshipType = createDhis2UpdateTool({
    name: "update_dhis2_relationship_type",
    description: "Update DHIS2 relationship types using schema-compliant properties",
    schema: Dhis2Schemas.RelationshipType,
    metadataType: "relationshipTypes",
});

export const updateDhis2Relationship = createDhis2UpdateTool({
    name: "update_dhis2_relationship",
    description: "Update DHIS2 relationships using schema-compliant properties",
    schema: Dhis2Schemas.Relationship,
    metadataType: "relationships",
});

// Get by ID Tools
export const getDhis2DataElementById = createDhis2GetByIdTool("dataElements", "Data Element");
export const getDhis2RelationshipTypeById = createDhis2GetByIdTool("relationshipTypes", "Relationship Type");
export const getDhis2OrganisationUnitById = createDhis2GetByIdTool("organisationUnits", "Organisation Unit");
export const getDhis2CategoryById = createDhis2GetByIdTool("categories", "Category");
export const getDhis2CategoryOptionById = createDhis2GetByIdTool("categoryOptions", "Category Option");
export const getDhis2OrganisationUnitGroupById = createDhis2GetByIdTool("organisationUnitGroups", "Organisation Unit Group");
export const getDhis2OrganisationUnitGroupSetById = createDhis2GetByIdTool("organisationUnitGroupSets", "Organisation Unit Group Set");
export const getDhis2DataSetById = createDhis2GetByIdTool("dataSets", "Data Set");
export const getDhis2ProgramById = createDhis2GetByIdTool("programs", "Program");
export const getDhis2TrackedEntityTypeById = createDhis2GetByIdTool("trackedEntityTypes", "Tracked Entity Type");
export const getDhis2TrackedEntityAttributeById = createDhis2GetByIdTool("trackedEntityAttributes", "Tracked Entity Attribute");
export const getDhis2ValidationRuleById = createDhis2GetByIdTool("validationRules", "Validation Rule");
export const getDhis2OptionSetById = createDhis2GetByIdTool("optionSets", "Option Set");
export const getDhis2IndicatorById = createDhis2GetByIdTool("indicators", "Indicator");
export const getDhis2VisualizationById = createDhis2GetByIdTool("visualizations", "Visualization");
export const getDhis2DashboardById = createDhis2GetByIdTool("dashboards", "Dashboard");

// REMOVED: Direct CRUD Tools for Top-level Entities - replaced with LLM-first versions below

export const updateDhis2Option = createDhis2UpdateTool({
    name: "update_dhis2_option",
    description: "Update DHIS2 option values using schema-compliant properties",
    schema: Dhis2Schemas.Option,
    metadataType: "options",
});

export const updateDhis2TrackedEntityInstance = createDhis2UpdateTool({
    name: "update_dhis2_tracked_entity_instance",
    description: "Update DHIS2 tracked entity instances using schema-compliant properties",
    schema: Dhis2Schemas.TrackedEntityInstance,
    metadataType: "trackedEntityInstances",
});

export const updateDhis2Enrollment = createDhis2UpdateTool({
    name: "update_dhis2_enrollment",
    description: "Update DHIS2 enrollments using schema-compliant properties",
    schema: Dhis2Schemas.Enrollment,
    metadataType: "enrollments",
});

export const updateDhis2Event = createDhis2UpdateTool({
    name: "update_dhis2_event",
    description: "Update DHIS2 events using schema-compliant properties",
    schema: Dhis2Schemas.Event,
    metadataType: "events",
});

// Update Tools - Direct CRUD
export const updateDhis2DataElement = createDhis2UpdateTool({
    name: "update_dhis2_data_element",
    description: "Update DHIS2 data elements using schema-compliant properties",
    schema: Dhis2Schemas.DataElement,
    metadataType: "dataElements",
});

export const updateDhis2OrganisationUnit = createDhis2UpdateTool({
    name: "update_dhis2_organisation_unit",
    description: "Update DHIS2 organisation units using schema-compliant properties",
    schema: Dhis2Schemas.OrganisationUnit,
    metadataType: "organisationUnits",
});

export const updateDhis2Category = createDhis2UpdateTool({
    name: "update_dhis2_category",
    description: "Update DHIS2 categories using schema-compliant properties",
    schema: Dhis2Schemas.Category,
    metadataType: "categories",
});

export const updateDhis2CategoryCombo = createDhis2UpdateTool({
    name: "update_dhis2_category_combo",
    description: "Update DHIS2 category combinations using schema-compliant properties",
    schema: Dhis2Schemas.CategoryCombo,
    metadataType: "categoryCombos",
});

export const updateDhis2CategoryOption = createDhis2UpdateTool({
    name: "update_dhis2_category_option",
    description: "Update DHIS2 category options using schema-compliant properties",
    schema: Dhis2Schemas.CategoryOption,
    metadataType: "categoryOptions",
});

export const updateDhis2DataSet = createDhis2UpdateTool({
    name: "update_dhis2_data_set",
    description: "Update DHIS2 data sets using schema-compliant properties",
    schema: Dhis2Schemas.DataSet,
    metadataType: "dataSets",
});

export const updateDhis2OrganisationUnitGroup = createDhis2UpdateTool({
    name: "update_dhis2_organisation_unit_group",
    description: "Update DHIS2 organisation unit groups using schema-compliant properties",
    schema: Dhis2Schemas.OrganisationUnitGroup,
    metadataType: "organisationUnitGroups",
});

export const updateDhis2OrganisationUnitGroupSet = createDhis2UpdateTool({
    name: "update_dhis2_organisation_unit_group_set",
    description: "Update DHIS2 organisation unit group sets using schema-compliant properties",
    schema: Dhis2Schemas.OrganisationUnitGroupSet,
    metadataType: "organisationUnitGroupSets",
});

export const updateDhis2Program = createDhis2UpdateTool({
    name: "update_dhis2_program",
    description: "Update DHIS2 programs using schema-compliant properties",
    schema: Dhis2Schemas.Program,
    metadataType: "programs",
});

export const updateDhis2TrackedEntityType = createDhis2UpdateTool({
    name: "update_dhis2_tracked_entity_type",
    description: "Update DHIS2 tracked entity types using schema-compliant properties",
    schema: Dhis2Schemas.TrackedEntityType,
    metadataType: "trackedEntityTypes",
});

export const updateDhis2TrackedEntityAttribute = createDhis2UpdateTool({
    name: "update_dhis2_tracked_entity_attribute",
    description: "Update DHIS2 tracked entity attributes using schema-compliant properties",
    schema: Dhis2Schemas.TrackedEntityAttribute,
    metadataType: "trackedEntityAttributes",
});

export const updateDhis2Indicator = createDhis2UpdateTool({
    name: "update_dhis2_indicator",
    description: "Update DHIS2 indicators using schema-compliant properties",
    schema: Dhis2Schemas.Indicator,
    metadataType: "indicators",
});

export const updateDhis2IndicatorType = createDhis2UpdateTool({
    name: "update_dhis2_indicator_type",
    description: "Update DHIS2 indicator types using schema-compliant properties",
    schema: Dhis2Schemas.IndicatorType,
    metadataType: "indicatorTypes",
});

export const updateDhis2ValidationRule = createDhis2UpdateTool({
    name: "update_dhis2_validation_rule",
    description: "Update DHIS2 validation rules using schema-compliant properties",
    schema: Dhis2Schemas.ValidationRule,
    metadataType: "validationRules",
});

export const updateDhis2OptionSet = createDhis2UpdateTool({
    name: "update_dhis2_option_set",
    description: "Update DHIS2 option sets using schema-compliant properties",
    schema: Dhis2Schemas.OptionSet,
    metadataType: "optionSets",
});

export const createDhis2Visualization = createLLMFirstTool({
    name: "create_dhis2_visualization",
    description: "Create DHIS2 visualizations (charts and data visualizations) that display data from DHIS2 for analysis and monitoring. Visualizations can show trends, comparisons, and patterns in health data. Examples: 'Monthly Malaria Cases Trend', 'Immunization Coverage by District', 'HIV Testing Monthly Bar Chart'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the visualization/chart"),
        description: z.string().optional().describe("Description of what this visualization shows"),
        visualizationType: z.enum(['COLUMN', 'BAR', 'LINE', 'PIE', 'AREA', 'SINGLE_VALUE', 'PIVOT_TABLE']).default('COLUMN').describe("The type of chart or visualization"),
        dataElementIds: z.array(z.string()).min(1).describe("Array of data element IDs to include in the visualization")
    }),
    metadataType: "visualizations",
    dhis2SchemaName: "Visualization"
});

export const updateDhis2Visualization = createDhis2UpdateTool({
    name: "update_dhis2_visualization",
    description: "Update DHIS2 visualizations using schema-compliant properties",
    schema: Dhis2Schemas.Visualization,
    metadataType: "visualizations",
});

export const createDhis2Dashboard = createLLMFirstTool({
    name: "create_dhis2_dashboard",
    description: "Create DHIS2 dashboards that organize and display visualizations, charts, reports, and other analytical content for users to monitor health data and KPIs. Dashboards are the main interface for data analysis and decision-making. Examples: 'National Malaria Dashboard', 'Facility Performance Overview', 'COVID-19 Monitoring Board'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the dashboard"),
        description: z.string().optional().describe("Description of what this dashboard is used for")
    }),
    metadataType: "dashboards",
    dhis2SchemaName: "Dashboard",
    dependencies: [
        {
            type: "users",
            name: "default",
            createIfNotFound: true,
            createParams: {
                username: "default",
                firstName: "Default",
                surname: "User",
                userCredentials: {
                    username: "default",
                    disabled: false
                }
            }
        }
    ]
});

export const updateDhis2ProgramStage = createDhis2UpdateTool({
    name: "update_dhis2_program_stage",
    description: "Update DHIS2 program stages using schema-compliant properties",
    schema: Dhis2Schemas.ProgramStage,
    metadataType: "programStages",
});

export const updateDhis2ProgramRule = createDhis2UpdateTool({
    name: "update_dhis2_program_rule",
    description: "Update DHIS2 program rules using schema-compliant properties",
    schema: Dhis2Schemas.ProgramRule,
    metadataType: "programRules",
});

export const updateDhis2ProgramIndicator = createDhis2UpdateTool({
    name: "update_dhis2_program_indicator",
    description: "Update DHIS2 program indicators using schema-compliant properties",
    schema: Dhis2Schemas.ProgramIndicator,
    metadataType: "programIndicators",
});

export const updateDhis2DashboardItem = createDhis2UpdateTool({
    name: "update_dhis2_dashboard_item",
    description: "Update DHIS2 dashboard items using schema-compliant properties",
    schema: Dhis2Schemas.DashboardItem,
    metadataType: "dashboardItems",
});

export const updateDhis2User = createDhis2UpdateTool({
    name: "update_dhis2_user",
    description: "Update DHIS2 user accounts using schema-compliant properties",
    schema: Dhis2Schemas.User,
    metadataType: "users",
});

export const updateDhis2Dashboard = createDhis2UpdateTool({
    name: "update_dhis2_dashboard",
    description: "Update DHIS2 dashboards using schema-compliant properties",
    schema: Dhis2Schemas.Dashboard,
    metadataType: "dashboards",
});

/**
 * Create DHIS2 metadata using aggregated single payload for related resources
 * Reduces API calls by creating multiple related metadata types in one request
 * Automatically checks for existence to avoid duplicates
 */
export const createDhis2AggregatedMetadata = tool(
    async ({
        metadata,
    }: {
        metadata: Record<string, Record<string, any>[]>;
    }) => {
        try {
            console.log('Creating aggregated metadata:', JSON.stringify(metadata, null, 2));

            // Pre-process: Generate IDs for resources that don't have them
            for (const [metadataType, resources] of Object.entries(metadata)) {
                for (const resource of resources) {
                    if (!resource.id) {
                        resource.id = await generateDhis2Id();
                    }
                }
            }

            const result = await createDhis2MetadataAggregated(metadata);

            // Add successfully created resources to context
            for (const r of result.results) {
                if (r.created) {
                    const resource = metadata[r.type]?.find(res => res.id === r.id);
                    if (resource) {
                        addResourceToContext(r.id!, r.type, resource.name || `Unnamed ${r.type}`, 'created');
                    }
                }
            }

            const createdCount = result.results.filter(r => r.created).length;
            const existingCount = result.results.filter(r => !r.created).length;

            return JSON.stringify({
                success: true,
                message: `Processed ${result.results.length} resources: ${createdCount} created, ${existingCount} already existed`,
                total: result.results.length,
                created: createdCount,
                existing: existingCount,
                results: result.results,
                apiResponse: result.response,
            });

        } catch (error) {
            console.error('Error creating aggregated metadata:', error);
            return JSON.stringify({
                success: false,
                error: `Failed to create aggregated metadata: ${error.message}`,
            });
        }
    },
    {
        name: "create_dhis2_aggregated_metadata",
        description: "Create multiple related DHIS2 metadata objects in a single API call when all IDs are resolvable in the payload. Automatically checks for existence to avoid duplicates.",
        schema: z.object({
            metadata: z.record(
                z.string(), // metadata type (e.g., "categoryOptions", "categories", "categoryCombos", "dataElements")
                z.array(z.record(z.string(), z.any())) // array of resource objects
            ).describe("Aggregated metadata payload with multiple resource types. IDs must be resolvable within the payload. Example: { categoryOptions: [...], categories: [...], categoryCombos: [...], dataElements: [...] }"),
        }),
    }
);

/**
 * Create a complex DHIS2 reporting form with dependencies
 * Can use sequential creation (default - safe) or aggregated creation (fast)
 */
export const createDhis2ReportingForm = tool(
    async ({
        formName,
        dataElementName,
        categoryName,
        categoryOptions = [],
        dataElementDescription,
        periodType = 'Monthly',
        aggregated = false
    }: {
        formName: string;
        dataElementName: string;
        categoryName: string;
        categoryOptions?: string[];
        dataElementDescription?: string;
        periodType?: 'Monthly' | 'Weekly' | 'Daily' | 'Quarterly' | 'Yearly';
        aggregated?: boolean;
    }) => {

        // AGGREGATED MODE: Build complete payload and let DHIS2 handle dependencies
        if (aggregated) {
            console.log('Using aggregated creation mode for reporting form');
            return await createDhis2ReportingFormAggregated({
                formName,
                dataElementName,
                categoryName,
                categoryOptions,
                dataElementDescription,
                periodType
            });
        }

        // SEQUENTIAL MODE: Create components step by step (legacy approach)
        console.log('Using sequential creation mode for reporting form');
        return await createDhis2ReportingFormSequential({
            formName,
            dataElementName,
            categoryName,
            categoryOptions,
            dataElementDescription,
            periodType
        });
    },
    {
        name: "create_dhis2_reporting_form",
        description: "Create a complex DHIS2 reporting form with category-based disaggregation. Use aggregated=true for fast one-API-call creation when all references are resolvable.",
        schema: z.object({
            formName: z.string().describe("Name of the reporting form (DataSet)"),
            dataElementName: z.string().describe("Name of the main indicator/data element"),
            categoryName: z.string().describe("Name of the disaggregation category"),
            categoryOptions: z.array(z.string()).describe("List of category options for disaggregation (e.g., ['First Visit', 'Follow-up Visit'])"),
            dataElementDescription: z.string().optional().describe("Optional description for the data element"),
            periodType: z.enum(['Monthly', 'Weekly', 'Daily', 'Quarterly', 'Yearly']).default('Monthly').describe("Reporting frequency"),
            aggregated: z.boolean().optional().default(false).describe("If true, uses aggregated creation (one API call, DHIS2 resolves dependencies internally). If false, uses sequential creation (safe, multiple API calls)."),
        }),
    }
);

/**
 * Create reporting form using sequential mode (original approach - safe but slower)
 */
async function createDhis2ReportingFormSequential({
    formName,
    dataElementName,
    categoryName,
    categoryOptions = [],
    dataElementDescription,
    periodType = 'Monthly'
}: {
    formName: string;
    dataElementName: string;
    categoryName: string;
    categoryOptions?: string[];
    dataElementDescription?: string;
    periodType?: 'Monthly' | 'Weekly' | 'Daily' | 'Quarterly' | 'Yearly';
}) {
    try {
        // Step 1: Create CategoryOptions FIRST (sequentially)
        const categoryOptionIds: string[] = [];
        for (const option of categoryOptions) {
            const id = await generateDhis2Id();
            const optionData = {
                id,
                name: option,
                displayName: option,
                shortName: option.length > 50 ? option.substring(0, 47) + '...' : option,
                code: generateDhis2Code(option),
                sortOrder: categoryOptionIds.length + 1,
            };

            try {
                await createDhis2MetadataDirect('categoryOptions', optionData);
                categoryOptionIds.push(id);
                addResourceToContext(id, 'categoryOptions', option, 'created');
            } catch (error) {
                console.error(`Failed to create CategoryOption "${option}":`, error);
                throw error;
            }
        }

        // Step 2: Create Category with references to CategoryOptions
        const categoryId = await generateDhis2Id();
        const categoryData = {
            id: categoryId,
            name: categoryName,
            displayName: categoryName,
            shortName: categoryName.length > 50 ? categoryName.substring(0, 47) + '...' : categoryName,
            dataDimension: true,
            dataDimensionType: 'DISAGGREGATION',
            categoryOptions: categoryOptionIds.map(id => ({ id })),
        };

        await createDhis2MetadataDirect('categories', categoryData);
        addResourceToContext(categoryId, 'categories', categoryName, 'created');

        // Step 3: Create CategoryCombo
        const categoryComboId = await generateDhis2Id();
        const comboData = {
            id: categoryComboId,
            name: `${categoryName} Combo`,
            displayName: `${categoryName} Combo`,
            shortName: `${categoryName} Combo`.substring(0, 50),
            dataDimensionType: 'DISAGGREGATION',
            categories: [{ id: categoryId }],
        };

        await createDhis2MetadataDirect('categoryCombos', comboData);
        addResourceToContext(categoryComboId, 'categoryCombos', `${categoryName} Combo`, 'created');

        // Step 4: Create Data Element
        const dataElementId = await generateDhis2Id();
        const dataElementData = {
            id: dataElementId,
            name: dataElementName,
            displayName: dataElementName,
            shortName: dataElementName.length > 50 ? dataElementName.substring(0, 47) + '...' : dataElementName,
            valueType: 'INTEGER',
            domainType: 'AGGREGATE',
            aggregationType: 'COUNT',
            zeroIsSignificant: true,
            categoryCombo: { id: categoryComboId },
            description: dataElementDescription || `${dataElementName} tracked by ${categoryName}`,
        };

        await createDhis2MetadataDirect('dataElements', dataElementData);
        addResourceToContext(dataElementId, 'dataElements', dataElementName, 'created');

        // Step 5: Create DataSet with data elements
        const dataSetId = await generateDhis2Id();
        const dataSetData = {
            id: dataSetId,
            name: formName,
            displayName: formName,
            shortName: formName.length > 50 ? formName.substring(0, 47) + '...' : formName,
            periodType,
            openFuturePeriods: 1,
            dataSetElements: [{
                dataElement: { id: dataElementId },
                categoryCombo: { id: categoryComboId },
                sortOrder: 1,
            }],
            organisationUnits: [], // Will need to be set based on context
            description: `Monthly reporting form for ${formName}`,
        };

        await createDhis2MetadataDirect('dataSets', dataSetData);
        addResourceToContext(dataSetId, 'dataSets', formName, 'created');

        return JSON.stringify({
            success: true,
            message: `Successfully created ${formName} reporting form with disaggregation by ${categoryName}`,
            formId: dataSetId,
            dataElementId,
            categoryId,
            categoryOptionIds,
            categoryComboId,
            created: categoryOptions.length + 4, // categoryOptions + category + combo + dataElement + dataSet
            failed: 0,
            total: categoryOptions.length + 4,
            results: [{
                message: 'All components created successfully',
                status: 'SUCCESS'
            }],
        });

    } catch (error) {
        console.error('Error creating reporting form:', error);
        return JSON.stringify({
            success: false,
            error: `Failed to create reporting form: ${error.message}`,
        });
    }
}

/**
 * Create reporting form using aggregated mode (fast - one API call, DHIS2 handles dependencies)
 */
async function createDhis2ReportingFormAggregated({
    formName,
    dataElementName,
    categoryName,
    categoryOptions = [],
    dataElementDescription,
    periodType = 'Monthly'
}: {
    formName: string;
    dataElementName: string;
    categoryName: string;
    categoryOptions?: string[];
    dataElementDescription?: string;
    periodType?: 'Monthly' | 'Weekly' | 'Daily' | 'Quarterly' | 'Yearly';
}) {
    try {
        // Generate all IDs upfront
        const categoryOptionIds = await Promise.all(
            categoryOptions.map(async (_, index) => ({
                id: await generateDhis2Id(),
                index
            }))
        );

        const categoryId = await generateDhis2Id();
        const categoryComboId = await generateDhis2Id();
        const dataElementId = await generateDhis2Id();
        const dataSetId = await generateDhis2Id();

        // Build complete payload for DHIS2 aggregation
        const aggregatedPayload = {
            categoryOptions: categoryOptions.map((option, index) => ({
                id: categoryOptionIds[index].id,
                name: option,
                displayName: option,
                shortName: option.length > 50 ? option.substring(0, 47) + '...' : option,
                code: generateDhis2Code(option),
                sortOrder: index + 1,
            })),
            categories: [{
                id: categoryId,
                name: categoryName,
                displayName: categoryName,
                shortName: categoryName.length > 50 ? categoryName.substring(0, 47) + '...' : categoryName,
                dataDimension: true,
                dataDimensionType: 'DISAGGREGATION',
                categoryOptions: categoryOptionIds.map(item => ({ id: item.id })),
            }],
            categoryCombos: [{
                id: categoryComboId,
                name: `${categoryName} Combo`,
                displayName: `${categoryName} Combo`,
                shortName: `${categoryName} Combo`.substring(0, 50),
                dataDimensionType: 'DISAGGREGATION',
                categories: [{ id: categoryId }],
            }],
            dataElements: [{
                id: dataElementId,
                name: dataElementName,
                displayName: dataElementName,
                shortName: dataElementName.length > 50 ? dataElementName.substring(0, 47) + '...' : dataElementName,
                valueType: 'INTEGER',
                domainType: 'AGGREGATE',
                aggregationType: 'COUNT',
                zeroIsSignificant: true,
                categoryCombo: { id: categoryComboId },
                description: dataElementDescription || `${dataElementName} tracked by ${categoryName}`,
            }],
            dataSets: [{
                id: dataSetId,
                name: formName,
                displayName: formName,
                shortName: formName.length > 50 ? formName.substring(0, 47) + '...' : formName,
                periodType,
                openFuturePeriods: 1,
                dataSetElements: [{
                    dataElement: { id: dataElementId },
                    categoryCombo: { id: categoryComboId },
                    sortOrder: 1,
                }],
                organisationUnits: [], // Will need to be set based on context
                description: `Monthly reporting form for ${formName}`,
            }],
        };

        // Use the aggregated creation function
        const result = await createDhis2MetadataAggregated(aggregatedPayload);

        // Add successfully created resources to context
        for (const r of result.results) {
            if (r.created) {
                const resourceType = r.type;
                const resource = aggregatedPayload[resourceType]?.find(res => res.id === r.id);
                if (resource) {
                    addResourceToContext(r.id!, resourceType, resource.name || `Unnamed ${resourceType}`, 'created');
                }
            }
        }

        return JSON.stringify({
            success: true,
            message: `Successfully created ${formName} reporting form using aggregated approach (1 API call)`,
            formId: dataSetId,
            dataElementId,
            categoryId,
            categoryOptionIds: categoryOptionIds.map(item => item.id),
            categoryComboId,
            created: result.results.filter(r => r.created).length, // Actually created count from existence check
            existing: result.results.filter(r => !r.created).length, // Already existed count
            total: result.results.length,
            apiCalls: 1, // Always 1 for aggregated mode
            results: result.results,
            apiResponse: result.response,
        });

    } catch (error) {
        console.error('Error creating reporting form (aggregated):', error);
        return JSON.stringify({
            success: false,
            error: `Failed to create aggregated reporting form: ${error.message}`,
        });
    }
}

// REMOVED: Migration completed - now using LLM-first version above

    // REMOVED: Migration completed - legacy tools replaced with LLM-first versions above

// =============================================================================
// ANALYTICS TOOLS - DATA QUERYING AND COMPUTATION
// =============================================================================

/**
 * Helper function to detect if a period string is a date (yyyyMMdd format)
 */
function isDatePeriod(period: string): boolean {
    return /^\d{8}$/.test(period);
}

/**
 * Helper function to format date from yyyyMMdd to yyyy-MM-dd
 */
function formatDateWithHyphens(dateStr: string): string {
    if (dateStr.length !== 8) {
        throw new Error(`Invalid date format: ${dateStr}. Expected yyyyMMdd format.`);
    }
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    return `${year}-${month}-${day}`;
}

/**
 * Query Analytics Tool - Main analytics data retrieval using direct tool approach
 * Handles both indicators and dataElements with proper category dimension construction for disaggregation
 * 
 * PERIOD FILTERING SUPPORT:
 * - Supports startDate/endDate parameter combination for specific date ranges (yyyy-MM-dd format)
 * - Supports pe dimension for DHIS2 period codes (202403, 2023, LAST_MONTH, etc.)
 * - Both methods are mutually exclusive - only one is used per query
 */
export const queryAnalytics = tool(
    async (input: {
        indicators: string[];
        doc_type?: 'indicator' | 'dataElement';
        periods: string[];
        org_units: string[];
        disaggregations?: string[];
        include_coc_dimension?: boolean;
        skip_meta?: boolean;
        display_property?: string;
        include_num_den?: boolean;
        skip_data?: boolean;
        output_id_scheme?: string;
    }) => {
        try {
            // Import the DHIS2 API query function
            const { Dhis2Api } = await import('../../app-runtime/dhis2-api');

            // Pattern: "categoryId:optionId1;optionId2" should be in disaggregations, not indicators
            let cleanIndicators = [...input.indicators];
            let cleanDisaggregations = [...(input.disaggregations || [])];

            // Check indicators for category dimension strings and move them to disaggregations
            const categoryDimensionPattern = /^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+(;[a-zA-Z0-9_-]+)*$/;
            const misplacedDisaggregations: string[] = [];

            for (let i = cleanIndicators.length - 1; i >= 0; i--) {
                const indicator = cleanIndicators[i];
                if (categoryDimensionPattern.test(indicator)) {
                    console.log(`🔄 Detected category dimension string in indicators: ${indicator} → moving to disaggregations`);
                    misplacedDisaggregations.push(indicator);
                    cleanIndicators.splice(i, 1);
                }
            }

            // Add misplaced disaggregations to the disaggregations array
            if (misplacedDisaggregations.length > 0) {
                cleanDisaggregations.push(...misplacedDisaggregations);
                console.log(`✅ Auto-corrected ${misplacedDisaggregations.length} category dimension strings to disaggregations`);
            }

            // Build dimension parameters
            const indicator_string = cleanIndicators.join(";");
            const org_unit_string = input.org_units.join(";");

            const dimensions = [
                `dx:${indicator_string}`,
                `ou:${org_unit_string}`
            ];

            // Detect if periods are dates (yyyyMMdd) or DHIS2 period codes
            const allDates = input.periods.every(p => isDatePeriod(p));
            const someDates = input.periods.some(p => isDatePeriod(p));
            const noDates = !someDates;

            // DHIS2 Analytics API: startDate/endDate and pe are mutually exclusive
            let startDate: string | undefined;
            let endDate: string | undefined;

            if (allDates && input.periods.length > 0) {
                // All periods are dates - use startDate/endDate parameters
                const sortedDates = [...input.periods].sort();
                startDate = formatDateWithHyphens(sortedDates[0]);
                endDate = formatDateWithHyphens(sortedDates[sortedDates.length - 1]);
                
                console.log(`📅 Using startDate/endDate parameters: ${startDate} to ${endDate} (${input.periods.length} date(s))`);
                // Note: pe dimension is NOT added when using startDate/endDate
            } else {
                // Use pe dimension for DHIS2 period codes (default behavior)
                const period_string = input.periods.join(";");
                dimensions.push(`pe:${period_string}`);
                
                if (someDates && !allDates) {
                    console.warn(`⚠️ Mixed date and period formats detected. Using pe dimension for all periods. Consider using consistent format.`);
                }
                
                console.log(`📅 Using pe dimension: ${period_string}`);
            }

            // Handle disaggregation dimensions - use COC IDs directly in co dimension
            let cocDimension = '';

			console.log('Input', input)
            if (input.disaggregations && input.disaggregations.length > 0) {
                // Disaggregations are now Category Option Combo (COC) IDs directly
                // No parsing needed - just use them as-is in the co dimension
                cocDimension = `co:${input.disaggregations.join(';')}`;
                console.log(`Using COC IDs directly: ${cocDimension} from ${input.disaggregations.length} disaggregation dimensions`);
            }

            // Add co dimension for disaggregated dataElements
            if (cocDimension) {
                dimensions.push(cocDimension);
                console.log('Added category option combo (co) dimension:', cocDimension);
            } else if (input.doc_type === 'dataElement' || input.include_coc_dimension === true) {
                dimensions.push('co');
                console.log('Added empty category option combo (co) dimension for dataElement queries');
            }

            // Build analytics query configuration
            const baseParams: any = {
                displayProperty: input.display_property || "NAME",
                includeNumDen: input.include_num_den || false,
                skipMeta: input.skip_meta === true, // Default false - INCLUDE metadata for analytics
                skipData: input.skip_data || false,
                outputIdScheme: input.output_id_scheme || "NAME"
            };

            // Add startDate/endDate if using date filtering (mutually exclusive with pe dimension)
            if (startDate && endDate) {
                baseParams.startDate = startDate;
                baseParams.endDate = endDate;
            }

            const analyticsConfig = {
                analytics: {
                    resource: 'analytics',
                    params: dimensions.reduce((params: any, dimension) => {
                        params.dimension = params.dimension || [];
                        params.dimension.push(dimension);
                        return params;
                    }, baseParams)
                }
            };

            // Query the analytics endpoint
            const response = await Dhis2Api.query(analyticsConfig);

            // Store analytics data in memory for follow-up analysis
            const memoryId = storeAnalyticsData(
                `Query: ${input.indicators.join(', ')} for periods ${input.periods.join(', ')} in org units ${input.org_units.join(', ')}`,
                input.indicators,
                input.periods,
                input.org_units,
                response
            );

            // Determine if co dimensions were actually added to the query
            const hasCoDimension = !!(input.disaggregations?.length > 0) || input.doc_type === 'dataElement' || input.include_coc_dimension === true;

            return JSON.stringify({
                url: `analytics?${dimensions.map(dim => `dimension=${encodeURIComponent(dim)}`).join('&')}`,
                data: response,
                memory_id: memoryId,
                doc_type: input.doc_type || 'indicator',
                disaggregations: input.disaggregations || [],
                hasCoDimension: hasCoDimension,
                indicators: input.indicators,
                periods: input.periods,
                org_units: input.org_units
            });
        } catch (error) {
            console.error('Error querying analytics:', error);
            return JSON.stringify({
                error: `Failed to query analytics: ${error.message}`,
                doc_type: input.doc_type || 'indicator',
                indicators: input.indicators,
                periods: input.periods,
                org_units: input.org_units
            });
        }
    },
    {
        name: "query_analytics",
        description: "Query analytics data from DHIS2 for indicators or data elements with support for disaggregation, periods, and organization units",
        schema: z.object({
            indicators: z.array(z.string()).describe("Array of indicator or data element IDs to query"),
            doc_type: z.enum(['indicator', 'dataElement']).default('indicator').describe("Type of resource being queried"),
            periods: z.array(z.string()).describe("Array of period identifiers (e.g., ['202301', '202302'])"),
            org_units: z.array(z.string()).describe("Array of organization unit IDs"),
            disaggregations: z.array(z.string()).optional().describe("Array of Category Option Combo (COC) IDs for filtering by category options"),
            include_coc_dimension: z.boolean().optional().describe("Whether to include category option combo dimension"),
            skip_meta: z.boolean().default(false).describe("Whether to skip metadata in response"),
            display_property: z.string().default("NAME").describe("Display property format"),
            include_num_den: z.boolean().default(false).describe("Whether to include numerator/denominator data"),
            skip_data: z.boolean().default(false).describe("Whether to skip actual data values"),
            output_id_scheme: z.string().default("NAME").describe("Output ID scheme")
        })
    }
);

/**
 * Filter Categories for Disaggregation using LLM
 * Given available categories from dataElements and user query, select which categories to use for disaggregation
 */
export const filterCategoriesForDisaggregationLLM = tool(
    async (input: { query: string, availableCategories: Array<{name: string, id: string}> }) => {
        try {
            console.log('🧠 Filtering categories for disaggregation:', {
                query: input.query,
                categoryCount: input.availableCategories.length
            });

            // Initialize Azure OpenAI LLM
            const env = (import.meta as any).env;
            const llm = new AzureChatOpenAI({
                model: env.DHIS2_OPENAI_MODEL || 'gpt-4',
                temperature: 0.1, // Low temperature for consistent filtering
                maxTokens: 200,   // Longer output for category analysis
                azureOpenAIApiKey: env.DHIS2_AZURE_KEY,
                azureOpenAIEndpoint: env.DHIS2_AZURE_ENDPOINT,
                azureOpenAIApiDeploymentName: env.DHIS2_AZURE_API_DEPLOYMENT_NAME,
                azureOpenAIApiVersion: env.DHIS2_AZURE_API_VERSION,
            });

            const categoryList = input.availableCategories.map(cat => `"${cat.name}" (${cat.id})`).join(', ');

            // Create prompt for category filtering
            const prompt = `
Analyze this DHIS2 analytics query and determine which categories should be used for disaggregation.

QUERY: "${input.query}"
AVAILABLE CATEGORIES: [${categoryList}]

TASK: Identify which categories match the user's disaggregation intent. Consider:
- Natural language disaggregation: "by age group", "broken down by gender", "disaggregated by facility type"
- Data analysis intent: showing breakdowns, comparisons across groups
- Multi-dimensional analysis: user might want multiple categories

EXAMPLES:
Query: "Show HIV cases by age group and gender"
Categories: ["Age groups (abc123)", "Gender (def456)", "Facility Type (ghi789)"]
→ Select: ["Age groups", "Gender"]

Query: "Malaria trends disaggregated by district"
Categories: ["Age groups (abc123)", "Gender (def456)", "District (ghi789)"]  
→ Select: [] (district is org unit, handled elsewhere)

Query: "ART coverage by facility type"
Categories: ["Age groups (abc123)", "Facility Ownership (def456)", "Facility Type (ghi789)"]
→ Select: ["Facility Type"] (exact or close semantic match)

Query: "Total HIV cases" (no disaggregation mentioned)
Categories: ["Age groups (abc123)", "Gender (def456)"]
→ Select: [] (no disaggregation requested)

IMPORTANT RULES:
- Return ONLY category names that clearly match disaggregation intent
- IGNORE location categories (country, district, facility) - these are handled by org unit selection
- IGNORE time-based categories that overlap with periods
- Return empty array if no clear disaggregation intent
- Prefer exact or very close matches over loose associations

Return ONLY a JSON array of selected category names: ["Category Name 1", "Category Name 2", ...]
`;

            // Make LLM call
            const llmResponse = await llm.invoke([
                { role: "system", content: prompt },
                { role: "user", content: `Return JSON array of selected category names for: ${input.query}` }
            ]);

            console.log('🧠 Category filtering LLM response:', llmResponse.content);

            // Parse LLM response
            const content = (llmResponse.content as string).trim();
            let selectedCategories: string[];

            try {
                selectedCategories = JSON.parse(content);
                if (!Array.isArray(selectedCategories)) {
                    throw new Error('LLM returned non-array response');
                }
            } catch (parseError) {
                console.warn('⚠️ Category filtering LLM returned non-JSON response, attempting fallback parsing');
                const arrayMatch = content.match(/\[([^\]]*)\]/);
                if (arrayMatch) {
                    selectedCategories = arrayMatch[1].split(',')
                        .map(item => item.replace(/['"]/g, '').trim())
                        .filter(item => item.length > 0);
                } else {
                    selectedCategories = [];
                }
            }

            // Map selected names back to full category objects
            const selectedCategoryObjects = selectedCategories
                .map(name => input.availableCategories.find(cat => cat.name === name))
                .filter(cat => cat !== undefined);

            console.log('🧠 Selected categories for disaggregation:', selectedCategoryObjects);

            return JSON.stringify({
                selectedCategories: selectedCategoryObjects,
                method: 'llm_category_filtering',
                llmModel: (llm as any).modelName,
                query: input.query,
                totalAvailable: input.availableCategories.length,
                selectedCount: selectedCategoryObjects.length,
                confidence: selectedCategoryObjects.length > 0 ? 'high' : 'low'
            });

        } catch (error) {
            console.error('❌ Error in category filtering LLM:', error);

            return JSON.stringify({
                selectedCategories: [],
                error: `Category filtering failed: ${error.message}`,
                method: 'failed_llm_filtering',
                query: input.query,
                totalAvailable: input.availableCategories.length,
                selectedCount: 0,
                fallback_available: false
            });
        }
    },
    {
        name: "filter_categories_for_disaggregation_llm",
        description: "Given available categories from dataElements and user query, use LLM to determine which categories should be used for disaggregation. Avoids spelling issues by working with actual DHIS2 category names.",
        schema: z.object({
            query: z.string().describe("The user's query text"),
            availableCategories: z.array(z.object({
                name: z.string().describe("Category name"),
                id: z.string().describe("Category ID")
            })).describe("Available categories from the dataElements' category structure")
        })
    }
);

/**
 * Helper function to extract disaggregation keywords from query using regex
 */
function extractDisaggregationKeywords(query: string): string[] {
    const keywords: string[] = [];

    // Convert to lowercase for matching
    const queryLower = query.toLowerCase();

    // Common disaggregation dimensions
    const disaggregationTerms = [
        // Demographic categories
        'age group', 'age groups', 'age', 'ages', 'gender', 'sex',
        // Health system categories
        'facility type', 'facility types', 'service type', 'service types',
        'ownership', 'ownership type', 'ownership types',
        // Geographic categories (non-org unit)
        'urban', 'rural', 'urban/rural', 'urban rural',
        // Socioeconomic categories
        'income level', 'income levels', 'economic status', 'socioeconomic',
        'wealth quintile', 'wealth quintiles',
        // Program categories
        'treatment type', 'treatment types', 'intervention type', 'intervention types',
        // Common category breakdowns
        'category', 'categories', 'group', 'groups', 'breakdown', 'breakdowns'
    ];

    // Check for disaggregation keywords with "by" preposition
    const byPattern = /by\s+([a-zA-Z\s]+?)(?:\s|$|[,.;:!?])/gi;
    let match;
    while ((match = byPattern.exec(queryLower)) !== null) {
        const extracted = match[1].trim();
        if (extracted.length > 2 && !/\b(and|or|the|a|an|for|in|at|of|with)\b/i.test(extracted)) {
            keywords.push(extracted);
        }
    }

    // Check for explicit disaggregation terms
    for (const term of disaggregationTerms) {
        if (queryLower.includes(term)) {
            keywords.push(term.charAt(0).toUpperCase() + term.slice(1)); // Capitalize first letter
        }
    }

    // Check for "disaggregated by" patterns
    const disaggPattern = /disaggregated?\s+by\s+([a-zA-Z\s]+?)(?:\s|$|[,.;:!?])/gi;
    while ((match = disaggPattern.exec(queryLower)) !== null) {
        const extracted = match[1].trim();
        if (extracted.length > 2) {
            keywords.push(extracted);
        }
    }

    // Remove duplicates and clean up
    return [...new Set(keywords)].filter(keyword =>
        keyword.length > 2 &&
        !/\b(month|year|quarter|period|date|time|week|day)\b/i.test(keyword) && // Filter out time dimensions
        !/\b(country|countries|district|districts|province|provinces|region|regions|county|counties|facility|facilities|hospital|hospitals|clinic|clinics|centre|centers|center|centres)\b/i.test(keyword) // Filter out location dimensions
    );
}

/**
 * Extract Indicator/Data Element Keywords using LLM
 * Uses AI understanding to identify indicator and data element related terms from natural language queries
 */
export const extractIndicatorKeywordsLLM = tool(
    async (input: { query: string, context?: string }) => {
        try {
            console.log('📊 LLM indicator extraction called for:', input.query);

            // Initialize Azure OpenAI LLM
	        const env = (import.meta as any).env;
            const llm = new AzureChatOpenAI({
                model: env.DHIS2_OPENAI_MODEL || 'gpt-4',
                temperature: 0.1, // Low temperature for consistent extraction
                maxTokens: 150,   // Longer output for indicator analysis
                azureOpenAIApiKey: env.DHIS2_AZURE_KEY,
                azureOpenAIEndpoint: env.DHIS2_AZURE_ENDPOINT,
                azureOpenAIApiDeploymentName: env.DHIS2_AZURE_API_DEPLOYMENT_NAME,
                azureOpenAIApiVersion: env.DHIS2_AZURE_API_VERSION,
            });

            // Create comprehensive prompt for indicator/data element extraction
            const prompt = `
Analyze this DHIS2 analytics query and extract potential indicator and data element related terms.
Focus on measurable health metrics, program indicators, and data collection elements that could be DHIS2 indicators or data elements.

QUERY: "${input.query}"
CONTEXT: ${input.context || 'Health analytics context - focus on measurable indicators and data elements'}

EXAMPLES:
"Show HIV prevalence rates" → ["HIV prevalence", "prevalence"]
"HIV testing coverage and ART initiation" → ["HIV testing coverage", "ART initiation"]
"Malaria cases reported this month" → ["Malaria cases"]
"Vaccination coverage for children under 5" → ["Vaccination coverage"]
"ANC visits and deliveries" → ["ANC visits", "deliveries"]
"TB treatment success rate" → ["TB treatment success rate"]
"Number of patients screened" → ["patients screened"]
"Immunization rates" → ["Immunization rates"]

IMPORTANT RULES:
- Extract specific indicator names and data element concepts
- Include common health metrics and program indicators
- Focus on measurable quantities and rates
- Return relevant keywords that would match DHIS2 indicators/data elements
- IGNORE: locations, time periods, general verbs ("show", "analyze", "calculate")
- Be specific about health conditions, services, and outcomes
- Return empty array [] if no indicator/data element terms found

Return ONLY a JSON array of unique indicator/data element strings: ["indicator1", "indicator2", ...]
`;

            // Make LLM call
            const llmResponse = await llm.invoke([
                { role: "system", content: prompt },
                { role: "user", content: `Extract indicator keywords: ${input.query}` }
            ]);

            console.log('📊 LLM response:', llmResponse.content);

            // Parse LLM response - handle various formats
            const content = (llmResponse.content as string).trim();
            let keywordCandidates: string[];

            try {
                // Try to parse as JSON
                keywordCandidates = JSON.parse(content);
                if (!Array.isArray(keywordCandidates)) {
                    throw new Error('LLM returned non-array response');
                }
            } catch (parseError) {
                // Fallback parsing for non-JSON responses
                console.warn('⚠️ Indicator LLM returned non-JSON response, attempting fallback parsing');

                // Try to extract array-like content between brackets
                const arrayMatch = content.match(/\[([^\]]*)\]/);
                if (arrayMatch) {
	                keywordCandidates = arrayMatch[1].split(',')
	                    .map(item => item.replace(/['"]/g, '').trim())
	                    .filter(item => item.length > 0);
                } else {
                    keywordCandidates = [];
                }
            }

            // Clean and filter results
            keywordCandidates = keywordCandidates
                .filter(item => typeof item === 'string' && item.length > 1) // Remove empty/short strings
                .map(item => item.trim()) // Clean whitespace
                .filter((item, index, arr) => arr.indexOf(item) === index) // Remove duplicates
                .slice(0, 10); // Limit to 10 for safety

            console.log('📊 Extracted indicator keywords:', keywordCandidates);

            return JSON.stringify({
                keywordCandidates,
                method: 'llm_extraction',
                llmModel: (llm as any).modelName,
                query: input.query,
                context: input.context,
                confidence: keywordCandidates.length > 0 ? 'high' : 'low'
            });

        } catch (error) {
            console.error('❌ Error in LLM indicator extraction:', error);

            // Return graceful failure with empty array (fallback to direct search)
            return JSON.stringify({
                keywordCandidates: [], // Will trigger direct search fallback
                error: `LLM extraction failed: ${error.message}`,
                method: 'failed_llm_extraction',
                query: input.query,
                fallback_available: true
            });
        }
    },
    {
        name: "extract_indicator_keywords_llm",
        description: "Extract potential DHIS2 indicator and data element names from natural language queries using AI understanding. Focuses on measurable health metrics, program indicators, and data collection elements while filtering out locations, time periods, and general terms.",
        schema: z.object({
            query: z.string().describe("The user's query text to analyze for indicator/data element references"),
            context: z.string().optional().describe("Optional context about the analytics query type")
        })
    }
);

/**
 * Extract Organisation Unit Keywords using LLM
 * Uses context-aware understanding to identify geographic locations from natural language queries
 */
export const extractOrgUnitKeywordsLLM = tool(
    async (input: { query: string, context?: string }) => {
        try {
            console.log('🧠 LLM extraction called for:', input.query);

            // Initialize Azure OpenAI LLM
	        const env = (import.meta as any).env;
            const llm = new AzureChatOpenAI({
                model: env.DHIS2_OPENAI_MODEL || 'gpt-4',
                temperature: 0.1, // Low temperature for consistent extraction
                maxTokens: 100,   // Limit output for focused responses
                azureOpenAIApiKey: env.DHIS2_AZURE_KEY,
                azureOpenAIEndpoint: env.DHIS2_AZURE_ENDPOINT,
                azureOpenAIApiDeploymentName: env.DHIS2_AZURE_API_DEPLOYMENT_NAME,
                azureOpenAIApiVersion: env.DHIS2_AZURE_API_VERSION,
            });

            // Create prompt for organization unit extraction
            const prompt = `
Analyze this DHIS2 analytics query and extract potential organization unit location names.
Focus ONLY on geographic locations, administrative units, and facility names that could be DHIS2 organization units.

QUERY: "${input.query}"
CONTEXT: ${input.context || 'Health analytics context - focus on locations for geographical filtering'}

EXAMPLES:
"Show HIV prevalence in Burkina Faso" → ["Burkina Faso"]
"HIV testing data from Central Hospital and Rural Clinic" → ["Central Hospital", "Rural Clinic"]
"Malaria cases in Kenya for 2024" → ["Kenya"] (ignore "2024")
"Treatment success rates in District C" → ["District C"]
"ART coverage in urban areas of Accra" → ["Accra"]
"NCD indicators for facility level data" → [] (no specific locations)

IMPORTANT RULES:
- Return ONLY geographic/administrative location names
- IGNORE: medical terms (HIV, ART, treatment), program terms, temporal references (2024, December)
- IGNORE: general concepts ("rural areas", "facility level")
- Be specific: if mentioned, extract exact location names
- Return empty array [] if no locations found

Return ONLY a JSON array of unique location strings: ["location1", "location2", ...]
`;

            // Make LLM call
            const llmResponse = await llm.invoke([
                { role: "system", content: prompt },
                { role: "user", content: `JSON array only: ${JSON.stringify(input)}` }
            ]);

            console.log('🧠 LLM response:', llmResponse.content);

            // Parse LLM response - handle various formats
            const content = (llmResponse.content as string).trim();
            let keywordCandidates: string[];

            try {
                // Try to parse as JSON
                keywordCandidates = JSON.parse(content);
                if (!Array.isArray(keywordCandidates)) {
                    throw new Error('LLM returned non-array response');
                }
            } catch (parseError) {
                // Fallback parsing for non-JSON responses
                console.warn('⚠️ LLM returned non-JSON response, attempting fallback parsing');

                // Try to extract array-like content between brackets
                const arrayMatch = content.match(/\[([^\]]*)\]/);
                if (arrayMatch) {
	                keywordCandidates = arrayMatch[1].split(',')
	                    .map(item => item.replace(/['"]/g, '').trim())
	                    .filter(item => item.length > 0);
                } else {
                    keywordCandidates = [];
                }
            }

            // Clean and filter results
            keywordCandidates = keywordCandidates
                .filter(item => typeof item === 'string' && item.length > 1) // Remove empty/short strings
                .map(item => item.trim()) // Clean whitespace
                .filter((item, index, arr) => arr.indexOf(item) === index) // Remove duplicates
                .slice(0, 10); // Limit to 10 for safety

            console.log('🧠 Extracted keywords:', keywordCandidates);

            return JSON.stringify({
                keywordCandidates,
                method: 'llm_extraction',
                llmModel: (llm as any).modelName,
                query: input.query,
                context: input.context,
                confidence: keywordCandidates.length > 0 ? 'high' : 'low'
            });

        } catch (error) {
            console.error('❌ Error in LLM keyword extraction:', error);

            // Return graceful failure with empty array (fallback to regex)
            return JSON.stringify({
                keywordCandidates: [], // Will trigger regex fallback
                error: `LLM extraction failed: ${error.message}`,
                method: 'failed_llm_extraction',
                query: input.query,
                fallback_available: true
            });
        }
    },
    {
        name: "extract_org_unit_keywords_llm",
        description: "Extract potential DHIS2 organisation unit names from natural language queries using AI understanding. Focuses on geographic locations (countries, regions, districts, facilities) and administrative units while intelligently filtering out medical terms, programs, and temporal references. Returns empty array for fallbacks.",
        schema: z.object({
            query: z.string().describe("The user's query text to analyze for organization unit references"),
            context: z.string().optional().describe("Optional context about what kind of organization units are likely (country level, facility level, etc.)")
        })
    }
);

/**
 * Search Analytics Metadata Tool - Simplified version
 */
export const searchAnalyticsMetadata = tool(
    async (input: { query: string }) => {
        try {
            // Use the existing search functions with focus on analytics-relevant metadata
            const [indicators, dataElements, orgUnits] = await Promise.all([
                searchDhis2Metadata('indicators', input.query, 10),
                searchDhis2Metadata('dataElements', input.query, 10),
                searchDhis2Metadata('organisationUnits', input.query, 10)
            ]);

            const results = {
                indicators: indicators.map(ind => ({ name: ind.name, id: ind.id, type: 'indicator' })),
                dataElements: dataElements.map(de => ({ name: de.name, id: de.id, type: 'dataElement' })),
                organisationUnits: orgUnits.map(ou => ({ name: ou.name, id: ou.id, type: 'organisationUnit' }))
            };

            // Determine best match based on simple heuristic
            const allMatches = [...results.indicators, ...results.dataElements, ...results.organisationUnits];

            if (allMatches.length === 0) {
                return JSON.stringify({
                    status: "no_match",
                    message: "No analytics metadata matches found.",
                    suggestions: [],
                    query: input.query
                });
            }

            if (allMatches.length === 1) {
                return JSON.stringify({
                    status: "auto_selected",
                    selected: allMatches[0],
                    query: input.query
                });
            }

            return JSON.stringify({
                status: "multiple_matches",
                suggestions: allMatches.slice(0, 10), // Limit to 10 suggestions
                query: input.query
            });
        } catch (error) {
            console.error('Error searching analytics metadata:', error);
            return JSON.stringify({
                status: "error",
                message: `Search failed: ${error.message}`,
                query: input.query
            });
        }
    },
    {
        name: "search_analytics_metadata",
        description: "Search for analytics-relevant metadata including indicators, data elements, and organisation units",
        schema: z.object({
            query: z.string().describe("Search query for finding analytics metadata")
        })
    }
);

/**
 * Get All Metadata Tool - Paginated retrieval
 */
export const getAllMetadata = tool(
    async (input: {
        endpoint: string;
        key: string;
        fields?: string;
        filters?: Record<string, string>;
        page_size?: number;
    }) => {
        try {
            const Dhis2Api = await import('../../app-runtime/dhis2-api');

            const all_items = [];
            let page = 1;

            while (true) {
                const params: any = {
                    page: page,
                    pageSize: input.page_size || 1000,
                    fields: input.fields || "id,name"
                };

                // Add filters
                if (input.filters) {
                    Object.entries(input.filters).forEach(([field, condition]) => {
                        params[`filter`] = params[`filter`] || [];
                        params[`filter`].push(`${field}:${condition}`);
                    });
                }

                const response = await (Dhis2Api as any).default.query({
                    resource: input.endpoint,
                    params: params
                });

                const items = response[input.key] || [];

                if (!items || items.length === 0) {
                    break;
                }

                all_items.push(...items);

                // Check pagination info
                const pager = response.pager || {};
                if (pager.page >= pager.pageCount) {
                    break;
                }

                page += 1;

                // Safety limit to prevent infinite loops
                if (all_items.length > 10000) {
                    console.warn('Reached safety limit of 10,000 items in getAllMetadata');
                    break;
                }
            }

            return JSON.stringify({
                count: all_items.length,
                data: all_items,
                endpoint: input.endpoint,
                filters: input.filters || {}
            });
        } catch (error) {
            console.error('Error in getAllMetadata:', error);
            return JSON.stringify({
                error: `Failed to retrieve metadata from ${input.endpoint}: ${error.message}`,
                count: 0,
                data: [],
                endpoint: input.endpoint,
                filters: input.filters || {}
            });
        }
    },
    {
        name: "get_all_metadata",
        description: "Retrieve all metadata from a DHIS2 endpoint using pagination, with optional filtering",
        schema: z.object({
            endpoint: z.string().describe("API endpoint (e.g., 'indicators.json', 'dataElements.json')"),
            key: z.string().describe("JSON key containing the data array (e.g., 'indicators', 'dataElements')"),
            fields: z.string().default("id,name").describe("Comma-separated list of fields to retrieve"),
            filters: z.record(z.string(), z.any()).optional().describe("Optional filters as field:condition pairs"),
            page_size: z.number().int().min(1).max(5000).default(1000).describe("Page size for pagination")
        })
    }
);

/**
 * Computation Tools - Using direct approach
 */
export const computeTotal = tool(
    async (input: { values: (string | number | null)[] }) => {
        try {
            const numericValues = input.values
                .map(v => typeof v === 'string' ? parseFloat(v) : v)
                .filter(v => v !== null && v !== undefined && !isNaN(v as number));

            if (numericValues.length === 0) return 0;

            return numericValues.reduce((sum, val) => sum + (val as number), 0);
        } catch (error) {
            return `Error computing total: ${error.message}`;
        }
    },
    {
        name: "compute_total",
        description: "Compute the sum of a list of numeric values, handling strings and null values",
        schema: z.object({
            values: z.array(z.union([z.string(), z.number(), z.null()])).describe("Array of values to sum")
        })
    }
);

export const computeAverage = tool(
    async (input: { values: (string | number | null)[] }) => {
        try {
            const numericValues = input.values
                .map(v => typeof v === 'string' ? parseFloat(v) : v)
                .filter(v => v !== null && v !== undefined && !isNaN(v as number));

            if (numericValues.length === 0) return 0;

            const sum = numericValues.reduce((sum, val) => sum + (val as number), 0);
            return sum / numericValues.length;
        } catch (error) {
            return `Error computing average: ${error.message}`;
        }
    },
    {
        name: "compute_average",
        description: "Compute the average (mean) of a list of numeric values",
        schema: z.object({
            values: z.array(z.union([z.string(), z.number(), z.null()])).describe("Array of values to average")
        })
    }
);

export const computeMax = tool(
    async (input: { values: (string | number | null)[] }) => {
        try {
            const numericValues = input.values
                .map(v => typeof v === 'string' ? parseFloat(v) : v)
                .filter((v): v is number => v !== null && v !== undefined && !isNaN(v));

            if (numericValues.length === 0) return 0;

            return Math.max(...numericValues);
        } catch (error) {
            return `Error computing max: ${error.message}`;
        }
    },
    {
        name: "compute_max",
        description: "Find the maximum value in a list of numeric values",
        schema: z.object({
            values: z.array(z.union([z.string(), z.number(), z.null()])).describe("Array of values to find maximum")
        })
    }
);

export const computeMin = tool(
    async (input: { values: (string | number | null)[] }) => {
        try {
            const numericValues = input.values
                .map(v => typeof v === 'string' ? parseFloat(v) : v)
                .filter((v): v is number => v !== null && v !== undefined && !isNaN(v));

            if (numericValues.length === 0) return 0;

            return Math.min(...numericValues);
        } catch (error) {
            return `Error computing minimum: ${error.message}`;
        }
    },
    {
        name: "compute_min",
        description: "Find the minimum value in a list of numeric values",
        schema: z.object({
            values: z.array(z.union([z.string(), z.number(), z.null()])).describe("Array of values to find minimum")
        })
    }
);

        // Specific Metadata Getters using the standard tool pattern
export const getOrganisationUnits = tool(
    async (input: { filters?: Record<string, string> }) => {
        try {
            const { Dhis2Api } = await import('../../app-runtime/dhis2-api');

            const allItems = [];
            let page = 1;

            while (true) {
                const params: any = {
                    page: page,
                    pageSize: 1000,
                    fields: "id,name,level"
                };

                // Add filters
                if (input.filters) {
                    Object.entries(input.filters).forEach(([field, condition]) => {
                        params[`filter`] = params[`filter`] || [];
                        params[`filter`].push(`${field}:${condition}`);
                    });
                }

                const response = await (Dhis2Api as any).default.query({
                    resource: 'organisationUnits.json',
                    params: params
                });

                const items = response.organisationUnits || [];

                if (!items || items.length === 0) {
                    break;
                }

                allItems.push(...items);

                // Check pagination info
                const pager = response.pager || {};
                if (pager.page >= pager.pageCount) {
                    break;
                }

                page += 1;

                // Safety limit to prevent infinite loops
                if (allItems.length > 10000) {
                    console.warn('Reached safety limit of 10,000 items in getOrganisationUnits');
                    break;
                }
            }

            return JSON.stringify({
                organisationUnits: allItems,
                count: allItems.length,
                filters: input.filters || {}
            });
        } catch (error) {
            console.error('Error in getOrganisationUnits:', error);
            return JSON.stringify({
                error: `Failed to retrieve organisation units: ${error.message}`,
                organisationUnits: [],
                count: 0,
                filters: input.filters || {}
            });
        }
    },
    {
        name: "get_organisation_units",
        description: "Retrieve DHIS2 organisation units with optional filtering",
        schema: z.object({
            filters: z.record(z.string(), z.any()).optional().describe("Optional filters (e.g., { 'level': 'eq:2', 'name': 'ilike:Sierra' })")
        })
    }
);

export const getDataElements = tool(
    async (input: { filters?: Record<string, string> }) => {
        try {
            const { Dhis2Api } = await import('../../app-runtime/dhis2-api');

            const allItems = [];
            let page = 1;

            while (true) {
                const params: any = {
                    page: page,
                    pageSize: 1000,
                    fields: "id,name,categoryCombo[id,name,categories[id,name,categoryOptions[id,name]]]"
                };

                // Add filters
                if (input.filters) {
                    Object.entries(input.filters).forEach(([field, condition]) => {
                        params[`filter`] = params[`filter`] || [];
                        params[`filter`].push(`${field}:${condition}`);
                    });
                }

                const response = await (Dhis2Api as any).query(
	                {
	                    dataElements:{
		                    resource: 'dataElements.json',
			                params: params
	                }
                });

                const items = response?.data?.dataElements?.dataElements || [];
				console.log('Data Elements query:', items);

                if (!items || items.length === 0) {
                    break;
                }

                allItems.push(...items);

                // Check pagination info
                const pager = response?.pager || {};
                if (pager.page >= pager.pageCount) {
                    break;
                }

                page += 1;

                // Safety limit to prevent infinite loops
                if (allItems.length > 10000) {
                    console.warn('Reached safety limit of 10,000 items in getDataElements');
                    break;
                }
            }

            return JSON.stringify({
                dataElements: allItems,
                count: allItems.length,
                filters: input.filters || {}
            });
        } catch (error) {
            console.error('Error in getDataElements:', error);
            return JSON.stringify({
                error: `Failed to retrieve data elements: ${error.message}`,
                dataElements: [],
                count: 0,
                filters: input.filters || {}
            });
        }
    },
    {
        name: "get_data_elements",
        description: "Retrieve DHIS2 data elements with category information",
        schema: z.object({
            filters: z.record(z.string(), z.any()).optional().describe("Optional filters for data elements")
        })
    }
);

// DataValue Tool (special read-only tool)
export const getDhis2DataValues = tool(
    async ({ dataElementIds, period, orgUnits }: {
        dataElementIds: string[];
        period: string;
        orgUnits: string[];
    }) => {
        try {
            // This would fetch data values - special case as it's data, not metadata
            return JSON.stringify({ success: false, message: "DataValue retrieval not implemented - this is raw data, not metadata" });
        } catch (error) {
            return JSON.stringify({ success: false, error: error.message });
        }
    },
    {
        name: "get_dhis2_data_values",
        description: "Retrieve DHIS2 data values for specific data elements, periods, and organisation units",
        schema: z.object({
            dataElementIds: z.array(z.string()).describe("Array of data element IDs"),
            period: z.string().describe("Period identifier"),
            orgUnits: z.array(z.string()).describe("Array of organisation unit IDs"),
        }),
    }
);

// Tracker Event Relationship Tools
export const createDhis2TrackedEntityInstance = tool(
    async ({ resource }: { resource: any }) => {
        try {
            // Special handling for tracker entities with relationships
            const result = await createDhis2Metadata('trackedEntityInstances', [resource]);
            return JSON.stringify({ success: true, result });
        } catch (error) {
            return JSON.stringify({ success: false, error: error.message });
        }
    },
    {
        name: "create_dhis2_tracked_entity_instance",
        description: "Create DHIS2 tracked entity instances with relationships",
        schema: z.object({
            resource: Dhis2Schemas.TrackedEntityInstance.describe("Tracked entity instance object"),
        }),
    }
);

export const createDhis2Enrollment = tool(
    async ({ resource }: { resource: any }) => {
        try {
            const result = await createDhis2Metadata('enrollments', [resource]);
            return JSON.stringify({ success: true, result });
        } catch (error) {
            return JSON.stringify({ success: false, error: error.message });
        }
    },
    {
        name: "create_dhis2_enrollment",
        description: "Create DHIS2 enrollments",
        schema: z.object({
            resource: Dhis2Schemas.Enrollment.describe("Enrollment object"),
        }),
    }
);

export const createDhis2Event = tool(
    async ({ resource }: { resource: any }) => {
        try {
            const result = await createDhis2Metadata('events', [resource]);
            return JSON.stringify({ success: true, result });
        } catch (error) {
            return JSON.stringify({ success: false, error: error.message });
        }
    },
    {
        name: "create_dhis2_event",
        description: "Create DHIS2 events",
        schema: z.object({
            resource: Dhis2Schemas.Event.describe("Event object"),
        }),
    }
);

// LLM-First Creation Tools (new standard - LLM handles all NL processing)
export const createDhis2CategoryOption = createLLMFirstTool({
    name: "create_dhis2_category_option",
    description: "Create DHIS2 category options that represent values within disaggregation dimensions. Category options divide data into subgroups like 'Male' and 'Female' for Gender categories, or '<5 years' and '5-14 years' for Age categories. Examples: 'Male', 'Female', 'Urban', 'Rural', '<5 years', '5-14 years'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the category option value"),
        displayName: z.string().optional().describe("Display name (defaults to name)"),
        shortName: z.string().optional().describe("Short name (defaults to name truncated to 50 characters)"),
        code: z.string().optional().describe("Optional unique code - if not provided, automatically generated from the name")
    }),
    metadataType: "categoryOptions",
    dhis2SchemaName: "CategoryOption"
});

export const createDhis2Relationship = createLLMFirstTool({
    name: "create_dhis2_relationship",
    description: "Create DHIS2 relationships that link entities together in tracker programs. Relationships represent connections between tracked entities, such as parent-child relationships, referral links, or treatment partnerships. Examples: 'Mother-Child linkage', 'Referral from clinic A to clinic B'.",
    schema: z.object({
        relationshipType: z.object({
            id: z.string()
        }).describe("The relationship type that defines this connection"),
        from: z.object({
            trackedEntityInstance: z.object({
                id: z.string()
            }).optional(),
            enrollment: z.object({
                id: z.string()
            }).optional(),
            event: z.object({
                id: z.string()
            }).optional()
        }).describe("The source entity in the relationship"),
        to: z.object({
            trackedEntityInstance: z.object({
                id: z.string()
            }).optional(),
            enrollment: z.object({
                id: z.string()
            }).optional(),
            event: z.object({
                id: z.string()
            }).optional()
        }).describe("The target entity in the relationship")
    }),
    metadataType: "relationships",
    dhis2SchemaName: "Relationship"
});

export const createDhis2RelationshipType = createLLMFirstTool({
    name: "create_dhis2_relationship_type",
    description: "Create DHIS2 relationship types that define the nature of connections between entities in tracker programs. Relationship types specify what kinds of relationships are possible, such as 'Program partner', 'Spouse', 'Supervisor', 'Referral source'. Examples: 'Mother-Child', 'Doctor-Patient', 'Facility-Referral'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the relationship type"),
        description: z.string().optional().describe("Description of what this relationship represents"),
        bidirectional: z.boolean().default(false).describe("Whether the relationship works in both directions"),
        fromToName: z.string().describe("The forward direction name (e.g., 'mother')"),
        toFromName: z.string().describe("The reverse direction name (e.g., 'child')")
    }),
    metadataType: "relationshipTypes",
    dhis2SchemaName: "RelationshipType"
});

export const createDhis2User = createLLMFirstTool({
    name: "create_dhis2_user",
    description: "Create DHIS2 user accounts for system access and data entry. Users have roles that determine their permissions and access levels. Examples: 'Data Clerk - Region A', 'Program Manager', 'System Administrator', 'Facility In-Charge'.",
    schema: z.object({
        username: z.string().min(1).describe("The login username (must be unique)"),
        firstName: z.string().min(1).describe("The user's first name"),
        surname: z.string().min(1).describe("The user's last name"),
        email: z.string().email().optional().describe("Optional email address for notifications"),
        phoneNumber: z.string().optional().describe("Optional phone number"),
        password: z.string().optional().describe("Login password (if not provided, user must reset on first login)")
    }),
    metadataType: "users",
    dhis2SchemaName: "User",
    preparePayload: async (input) => {
        // Handle user-specific preparation
        const result = { ...input };

        // If password not provided, it might be handled differently
        if (!result.password) {
            console.log('Password not provided - user will need to reset on first login');
        }

        // Build user credentials object
        result.userCredentials = {
            username: result.username,
            disabled: false
        };

        // Remove password from top level (it's handled in userCredentials if needed)
        delete result.password;

        return result;
    }
});

export const createDhis2Option = createLLMFirstTool({
    name: "create_dhis2_option",
    description: "Create individual DHIS2 option values like 'Yes', 'No', 'Male', 'Female', 'High', 'Low', 'Positive', 'Negative'. Use for option values that appear in dropdown lists, not for creating data collection fields. Examples: create option 'Agreed', create option 'Critical Priority'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the option value"),
        displayName: z.string().optional().describe("Display name (defaults to name)"),
        shortName: z.string().optional().describe("Short name (defaults to name)"),
        code: z.string().optional().describe("Optional unique code - if not provided, automatically generated from the name (e.g. 'Agreed' becomes 'AGREED')"),
        sortOrder: z.number().int().min(1).describe("Sort order for the option (must be >= 1)")
    }),
    metadataType: "options",
    dhis2SchemaName: "Option", // Validates against actual DHIS2 Option schema
});

export const createDhis2DataElement = createLLMFirstTool({
    name: "create_dhis2_data_element",
    description: "Create DHIS2 data elements that collect data values. Data elements are fields in forms that store measurable data like numbers, text, dates, or selections from option sets. Examples: 'HIV test result (Yes/No)', 'Number of patients', 'Age in years', 'Registration date'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the data element"),
        valueType: z.enum(['TEXT', 'NUMBER', 'INTEGER', 'BOOLEAN', 'DATE', 'DATETIME']).default('TEXT').describe("The data type"),
        domainType: z.enum(['AGGREGATE', 'TRACKER']).default('AGGREGATE').describe("Domain type"),
        aggregationType: z.enum(['SUM', 'AVERAGE', 'COUNT', 'NONE']).optional().describe("How values are aggregated"),
        description: z.string().optional().describe("Description of the data element"),
        zeroIsSignificant: z.boolean().default(true).describe("Whether zero values are significant"),
        categoryCombo: z.object({
            id: z.string()
        }).optional().describe("Category combination reference for disaggregation. Specify as { id: 'category-combo-uid' }")
    }),
    metadataType: "dataElements",
    dhis2SchemaName: "DataElement" // Validates against actual DHIS2 DataElement schema
});

export const createDhis2OptionSet = createLLMFirstTool({
    name: "create_dhis2_option_set",
    description: "Create DHIS2 option sets that define dropdown lists for data elements. Option sets contain multiple mutually exclusive options. Examples: 'Sex (Male/Female)', 'Vaccine Types', 'Blood Groups (A/B/AB/O)', 'Yes/No/Maybe'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the option set"),
        description: z.string().optional().describe("Description of what this option set represents"),
        valueType: z.enum(['TEXT', 'NUMBER']).default('TEXT').describe("The data type - TEXT for text options, NUMBER for numeric codes")
    }),
    metadataType: "optionSets",
    dhis2SchemaName: "OptionSet" // Validates against actual DHIS2 OptionSet schema
});

export const createDhis2IndicatorType = createLLMFirstTool({
    name: "create_dhis2_indicator_type",
    description: "Create DHIS2 indicator types that define how indicator calculations are performed (counting vs percentage vs average). These specify the mathematical operations for indicators. Examples: 'Percentage', 'Count', 'Average', 'Ratio'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the indicator type"),
        description: z.string().optional().describe("Description of the indicator calculation method"),
        factor: z.number().int().default(1).describe("Number of decimal places to display (typically 1 for percentages)"),
        number: z.boolean().default(false).describe("Whether the result is treated as a number (false for percentages)")
    }),
    metadataType: "indicatorTypes",
    dhis2SchemaName: "IndicatorType" // Validates against actual DHIS2 IndicatorType schema
});

export const createDhis2OrganisationUnit = createLLMFirstTool({
    name: "create_dhis2_organisation_unit",
    description: "Create DHIS2 organisation units for geographic/administrative hierarchy. These represent facilities, regions, and administrative divisions in your health system. Examples: 'Country Hospital', 'Region A', 'District Clinic', 'National Ministry'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the organisation unit"),
        code: z.string().optional().describe("Unique code for the organization unit (e.g., 'SCC_2024', 'HC001')"),
        level: z.number().int().min(1).max(5).default(1).describe("Administrative level in hierarchy (1=country, 2=province/state, 3=district, 4=sub-district, 5=facility)"),
        openingDate: z.string().optional().describe("Date when the facility opened (ISO format, e.g., '2024-06-01')"),
        path: z.string().optional().describe("Full hierarchical path (auto-generated from parent if not provided)"),
        parentId: z.string().optional().describe("ID of the parent organisation unit (used to build hierarchy)"),
        parentName: z.string().optional().describe("Name of the parent organisation unit to search and link to")
    }),
    metadataType: "organisationUnits",
    dhis2SchemaName: "OrganisationUnit", // Validates against actual DHIS2 OrganisationUnit schema
    preparePayload: async (input) => {
        // Start with all original input - comprehensive copy
        let result = { ...input };

        // Auto-generate opening date if not provided
        if (!result.openingDate) {
            result.openingDate = new Date().toISOString().split('T')[0];
        }

        // Try to auto-resolve parent if none specified and level > 1
        if (!result.parentId && !result.parentName && (result.level || 1) > 1) {
            try {
                const level = result.level || 1;
                const parentLevel = level - 1;

                const searchResults = await searchDhis2Metadata('organisationUnits', '', 100) as any[];
                const potentialParents = searchResults.filter((org: any) => org.level === parentLevel);

                if (potentialParents.length > 0) {
                    const selectedParent = potentialParents[0];
                    result.parentId = selectedParent.id;
                    result.path = selectedParent.path ? `${selectedParent.path}/${await generateDhis2Id()}` : `/${selectedParent.id}/${await generateDhis2Id()}`;

                    console.log(`Auto-selected parent organisation: ${selectedParent.name} (${selectedParent.id}) at level ${parentLevel} for child at level ${result.level}`);
                } else {
                    console.warn(`No parent organisations found at level ${parentLevel} for creating child at level ${result.level}`);
                }
            } catch (error) {
                console.warn('Failed to search for parent organisation units:', error);
            }
        }

        // Try to resolve parent by name if specified
        if (!result.parentId && result.parentName) {
            try {
                const searchResults = await searchDhis2Metadata('organisationUnits', result.parentName, 10) as any[];
                const matchingParent = searchResults.find((org: any) => org.name === result.parentName);
                if (matchingParent) {
                    result.parentId = matchingParent.id;
                    result.path = matchingParent.path ? `${matchingParent.path}/${await generateDhis2Id()}` : `/${matchingParent.id}/${await generateDhis2Id()}`;
                }
            } catch (error) {
                console.warn(`Failed to find parent organisation "${result.parentName}":`, error);
            }
        }

        // Generate path if still not set
        if (!result.path) {
            result.path = result.parentId ? `/${result.parentId}/${await generateDhis2Id()}` : `/${await generateDhis2Id()}`;
        }

        return result;
    }
});

export const createDhis2OrganisationUnitGroup = createLLMFirstTool({
    name: "create_dhis2_organisation_unit_group",
    description: "Create DHIS2 organisation unit groups to organize facilities into logical collections. These groups are used for reporting, data access control, and analysis. Examples: 'Public Hospitals', 'Rural Clinics', 'Regional Facilities', 'Private Sector'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the organisation unit group"),
        description: z.string().optional().describe("Description of what this group represents"),
        shortName: z.string().min(1).describe("Short name for the group (defaults to name if not provided)")
    }),
    metadataType: "organisationUnitGroups",
    dhis2SchemaName: "OrganisationUnitGroup"
});

export const createDhis2OrganisationUnitGroupSet = createLLMFirstTool({
    name: "create_dhis2_organisation_unit_group_set",
    description: "Create DHIS2 organisation unit group sets to categorize different types of facility groupings. Group sets contain multiple groups and are used for complex access control and classification. Examples: 'Ownership Type' (containing Public/Private groups), 'Facility Tier' (Primary/Secondary/Tertiary), 'Service Level'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the organisation unit group set"),
        description: z.string().optional().describe("Description of the classification system"),
        compulsory: z.boolean().default(false).describe("Whether every org unit must belong to one of the groups"),
        dataDimension: z.boolean().default(true).describe("Whether this group set can be used in data analysis")
    }),
    metadataType: "organisationUnitGroupSets",
    dhis2SchemaName: "OrganisationUnitGroupSet"
});

export const createDhis2TrackedEntityType = createLLMFirstTool({
    name: "create_dhis2_tracked_entity_type",
    description: "Create DHIS2 tracked entity types that define the entities being tracked in tracker programs. These represent individuals, patients, assets, or other objects that have attributes and follow enrollment/enrollment workflows. Examples: 'Person', 'Patient', 'Contact Person', 'Equipment'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the tracked entity type"),
        description: z.string().optional().describe("Description of what this entity represents")
    }),
    metadataType: "trackedEntityTypes",
    dhis2SchemaName: "TrackedEntityType"
});

export const createDhis2TrackedEntityAttribute = createLLMFirstTool({
    name: "create_dhis2_tracked_entity_attribute",
    description: "Create DHIS2 tracked entity attributes that define the properties/fields of tracked entities. These are the characteristics that describe a tracked entity like name, age, phone number, date of birth, etc. Examples: 'First Name', 'Phone Number', 'Date of Birth', 'National ID', 'Blood Type'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the tracked entity attribute"),
        valueType: z.enum(['TEXT', 'NUMBER', 'INTEGER', 'BOOLEAN', 'DATE', 'DATETIME']).default('TEXT').describe("The data type of the attribute"),
        description: z.string().optional().describe("Description of what this attribute represents"),
        mandatory: z.boolean().default(false).describe("Whether this attribute is required"),
        unique: z.boolean().default(false).describe("Whether values must be unique across all entities")
    }),
    metadataType: "trackedEntityAttributes",
    dhis2SchemaName: "TrackedEntityAttribute"
});

export const createDhis2ProgramStage = createLLMFirstTool({
    name: "create_dhis2_program_stage",
    description: "Create DHIS2 program stages that define the steps/phases within a tracker program. Program stages represent different events or visits in a tracked entity's journey. Examples: 'Initial Assessment', 'Follow-up Visit', 'Treatment Phase', 'Discharge'. Each stage can collect specific data and have its own validation rules.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the program stage/visit type"),
        description: z.string().optional().describe("Description of this stage's purpose"),
        programId: z.string().min(1).describe("The ID of the parent program this stage belongs to"),
        minDaysFromStart: z.number().int().min(0).default(0).describe("Minimum days from program start when this stage can occur"),
        repeatable: z.boolean().default(false).describe("Whether this stage can be repeated multiple times")
    }),
    metadataType: "programStages",
    dhis2SchemaName: "ProgramStage"
});

export const createDhis2ProgramRule = createLLMFirstTool({
    name: "create_dhis2_program_rule",
    description: "Create DHIS2 program rules that define conditional logic and automated actions within tracker programs. Program rules enable dynamic behavior like skipping questions, showing warnings, or automatically calculating values based on user input. Examples: 'Skip delivery questions if pregnancy test is negative', 'Show HIV test warning for high-risk patients'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the program rule"),
        description: z.string().optional().describe("Description of the rule's logic and purpose"),
        programId: z.string().min(1).describe("The ID of the program this rule belongs to"),
        condition: z.string().min(1).describe("The condition that triggers the rule (e.g., '#{var} == 1')"),
        priority: z.number().int().min(0).default(0).describe("Rule priority (higher numbers execute first)")
    }),
    metadataType: "programRules",
    dhis2SchemaName: "ProgramRule"
});

export const createDhis2ProgramIndicator = createLLMFirstTool({
    name: "create_dhis2_program_indicator",
    description: "Create DHIS2 program indicators that calculate aggregations and statistics from tracker program data. These indicators perform calculations across enrolled entities, visits, and time periods. Examples: 'Percentage of patients completing treatment', 'Average hospital stay duration', 'Number of high-risk pregnancies this month'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the program indicator"),
        description: z.string().optional().describe("Description of what this indicator measures"),
        programId: z.string().min(1).describe("The ID of the program this indicator analyzes"),
        expression: z.string().min(1).describe("The calculation expression (mathematical formula)"),
        filter: z.string().optional().describe("Optional filter condition to limit which records are included"),
        analyticsType: z.enum(['EVENT', 'ENROLLMENT']).default('EVENT').describe("Whether to analyze at event or enrollment level")
    }),
    metadataType: "programIndicators",
    dhis2SchemaName: "ProgramIndicator"
});

export const createDhis2ValidationRule = createLLMFirstTool({
    name: "create_dhis2_validation_rule",
    description: "Create DHIS2 validation rules that enforce data quality and consistency checks on submitted data. Validation rules compare data across multiple fields and flag errors or warnings. Examples: 'Total males + females should equal total population', 'If HIV test positive, CD4 count must be provided', 'Birth date cannot be in the future'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the validation rule"),
        description: z.string().optional().describe("Description of the data validation logic"),
        operator: z.enum(['equal_to', 'not_equal_to', 'greater_than', 'greater_than_or_equal_to', 'less_than', 'less_than_or_equal_to']).default('equal_to').describe("The comparison operator"),
        rightSide: z.object({
            expression: z.string().min(1).describe("The right side expression to compare"),
            description: z.string().optional().describe("Description of the right side"),
            missingValueStrategy: z.enum(['NEVER_SKIP', 'SKIP_IF_ANY_VALUE_MISSING', 'SKIP_IF_ALL_VALUES_MISSING']).default('NEVER_SKIP').describe("How to handle missing values")
        }).describe("The right side of the comparison"),
        leftSide: z.object({
            expression: z.string().min(1).describe("The left side expression to compare"),
            description: z.string().optional().describe("Description of the left side"),
            missingValueStrategy: z.enum(['NEVER_SKIP', 'SKIP_IF_ANY_VALUE_MISSING', 'SKIP_IF_ALL_VALUES_MISSING']).default('NEVER_SKIP').describe("How to handle missing values")
        }).describe("The left side of the comparison"),
        importance: z.enum(['HIGH', 'MEDIUM', 'LOW']).default('MEDIUM').describe("Severity level of validation failures")
    }),
    metadataType: "validationRules",
    dhis2SchemaName: "ValidationRule"
});

export const createDhis2DashboardItem = createLLMFirstTool({
    name: "create_dhis2_dashboard_item",
    description: "Create DHIS2 dashboard items that display visualizations, charts, tables, or indicators on dashboard screens. Dashboard items are the building blocks of dashboards. Examples: chart showing vaccination coverage by month, table of facility performance, indicator showing % target achievement, map of disease outbreaks.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the dashboard item"),
        dashboardId: z.string().min(1).describe("The ID of the dashboard this item belongs to"),
        visualizationId: z.string().optional().describe("ID of visualization/chart to display (if this is a chart item)"),
        indicatorId: z.string().optional().describe("ID of indicator to display (if this is an indicator item)"),
        type: z.enum(['CHART', 'REPORT_TABLE', 'INDICATOR', 'MAP', 'CUSTOM']).default('CHART').describe("The type of dashboard item"),
        shape: z.enum(['NORMAL', 'DOUBLE_WIDTH', 'FULL_WIDTH']).default('NORMAL').describe("The width of the dashboard item")
    }),
    metadataType: "dashboardItems",
    dhis2SchemaName: "DashboardItem"
});

// Export all tools - TEMPORARY: Only including currently migrated LLM-first tools
export const Dhis2StructuredTools = {
    // LLM-First Creation Tools (Migrated)
    createDhis2DataElement,
    createDhis2OrganisationUnit,
    createDhis2Category,
    createDhis2CategoryCombo,
    createDhis2CategoryOption,
    createDhis2DataSet,
    createDhis2OrganisationUnitGroup,
    createDhis2OrganisationUnitGroupSet,
    createDhis2User,
    createDhis2Option,
    createDhis2OptionSet,
    createDhis2IndicatorType,
    createDhis2RelationshipType,
    createDhis2Relationship,

    // Legacy tools (not yet migrated - still available for now)
    // Program tools (now migrated to LLM-first)
    // createDhis2Program, // Now migrated
    // createDhis2TrackedEntityType, // Now migrated
    // createDhis2TrackedEntityAttribute, // Now migrated
    // createDhis2ProgramStage, // Now migrated
    // createDhis2ProgramRule, // Now migrated
    // createDhis2ProgramIndicator, // Now migrated
    createDhis2Indicator, // Complex tool with legacy parsing
    // createDhis2ValidationRule, // Now migrated
    // createDhis2DashboardItem, // Now migrated
    createDhis2TrackedEntityInstance,
    createDhis2Enrollment,
    createDhis2Event,

    // Update tools - Core
    updateDhis2DataElement,
    updateDhis2OrganisationUnit,
    updateDhis2Category,
    updateDhis2CategoryCombo,
    updateDhis2CategoryOption,
    updateDhis2DataSet,
    updateDhis2OrganisationUnitGroup,
    updateDhis2OrganisationUnitGroupSet,
    updateDhis2Program,
    updateDhis2TrackedEntityType,
    updateDhis2TrackedEntityAttribute,
    updateDhis2Indicator,
    updateDhis2IndicatorType,
    updateDhis2ValidationRule,
    updateDhis2Option,
    updateDhis2OptionSet,
    updateDhis2Dashboard,
    updateDhis2TrackedEntityInstance,
    updateDhis2Enrollment,
    updateDhis2Event,
    updateDhis2User,
    updateDhis2RelationshipType,
    updateDhis2Relationship,

    // 📊 ANALYTICS TOOLS 📊
    queryAnalytics,
    searchAnalyticsMetadata,
    extractOrgUnitKeywordsLLM,
    extractDatePeriodLLM,
    extractIndicatorKeywordsLLM,
    filterCategoriesForDisaggregationLLM,
    getAllMetadata,
    getOrganisationUnits,
    getDataElements,
    computeTotal,
    computeAverage,
    computeMax,
    computeMin,

    // Aggregated metadata creation tool
    createDhis2AggregatedMetadata,

    // Complex form creation tool
    createDhis2ReportingForm,

    // Data retrieval tools
    getDhis2DataValues,

    // Search tools - Existing
    searchDhis2DataElements,
    searchDhis2OrganisationUnits,
    searchDhis2Categories,
    searchDhis2CategoryCombos,
    searchDhis2DataSets,
    searchDhis2Programs,
    searchDhis2Indicators,
    searchDhis2Users,
    searchDhis2RelationshipTypes,

    // Get by ID tools - Existing
    getDhis2DataElementById,
    getDhis2OrganisationUnitById,
    getDhis2CategoryById,
    getDhis2DataSetById,
    getDhis2ProgramById,
};

/**
 * Store analytics data for follow-up queries
 */
function storeAnalyticsData(description: string, indicators: string[], periods: string[], orgUnits: string[], data: any): string {
    const memoryId = generateAnalyticsMemoryId();
    // Store in a simple map for demo - in real app, this would be more sophisticated
    // This is used by analytics agent for follow-up queries like filtering or charting
    console.log(`Stored analytics data with ID: ${memoryId} for ${description}`);
    return memoryId;
}

/**
 * Retrieve stored analytics chart
 */
function getAnalyticsChart(chartId: string): AnalyticsChartData | null {
    return analyticsCharts.find(chart => chart.id === chartId) || null;
}
