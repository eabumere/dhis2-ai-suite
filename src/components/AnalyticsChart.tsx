import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';

interface AnalyticsChartProps {
    chartData: any;
    chartId?: string;
    title?: string;
    onFilter?: (filters: any) => void;
    onExport?: (format: string) => void;
}

interface ChartFilter {
    indicators?: string[];
    periods?: string[];
    orgUnits?: string[];
    disaggregations?: string[];
}

export const AnalyticsChart: React.FC<AnalyticsChartProps> = ({
    chartData,
    chartId,
    title,
    onFilter,
    onExport
}) => {
    const [echartsOption, setEchartsOption] = useState<any>(null);
    const [filters, setFilters] = useState<ChartFilter>({});
    const [isFiltering, setIsFiltering] = useState(false);
    const [filterOptions, setFilterOptions] = useState<any>({});

    useEffect(() => {
        if (chartData?.echarts_option) {
            setEchartsOption(chartData.echarts_option);
            // Extract filter options from chart data
            extractFilterOptions(chartData);
        }
    }, [chartData]);

    const extractFilterOptions = (data: any) => {
        const options: any = {};
        if (data.dimensions?.indicators?.length > 0) {
            options.indicators = data.dimensions.indicators;
        }
        if (data.dimensions?.periods?.length > 0) {
            options.periods = data.dimensions.periods;
        }
        if (data.dimensions?.orgUnits?.length > 0) {
            options.orgUnits = data.dimensions.orgUnits;
        }
        if (data.dimensions?.disaggregations?.length > 0) {
            options.disaggregations = data.dimensions.disaggregations;
        }
        setFilterOptions(options);
    };

    const handleFilterChange = async (filterType: keyof ChartFilter, values: string[]) => {
        if (!chartData || !values.length) return;

        const newFilters = { ...filters, [filterType]: values };
        setFilters(newFilters);
        setIsFiltering(true);

        try {
            console.log(`📊 Applying filter: ${filterType} = [${values.join(', ')}]`);

            // Apply client-side filtering to the analytics data
            const filteredChartData = await applyClientSideFiltering(chartData, newFilters);

            // Update the chart options with filtered data
            const filteredOption = await generateFilteredChartOption(filteredChartData);

            // Update the ECharts instance
            setEchartsOption(filteredOption);

            onFilter?.(newFilters);
        } catch (error) {
            console.error('❌ Error applying chart filter:', error);
        } finally {
            setIsFiltering(false);
        }
    };

    // Reset filters back to showing all data
    // Apply client-side filtering to the analytics data
    const applyClientSideFiltering = async (data: any, filters: ChartFilter): Promise<any> => {
        const { filteredData } = data;

        if (!filteredData || !Array.isArray(filteredData)) {
            return data;
        }

        console.log(`📊 Filtering ${filteredData.length} data points with filters:`, filters);

        let filteredRows = [...filteredData];

        // Filter by indicators (dx column)
        if (filters.indicators && filters.indicators.length > 0) {
            filteredRows = filteredRows.filter(row => filters.indicators!.includes(row.dx));
            console.log(`📊 Filtered by indicators: ${filteredRows.length} points remaining`);
        }

        // Filter by periods (period column)
        if (filters.periods && filters.periods.length > 0) {
            filteredRows = filteredRows.filter(row => filters.periods!.includes(row.period));
            console.log(`📊 Filtered by periods: ${filteredRows.length} points remaining`);
        }

        // Filter by org units (org_unit column)
        if (filters.orgUnits && filters.orgUnits.length > 0) {
            filteredRows = filteredRows.filter(row => filters.orgUnits!.includes(row.org_unit));
            console.log(`📊 Filtered by org units: ${filteredRows.length} points remaining`);
        }

        // Filter by disaggregations (category option values)
        if (filters.disaggregations && filters.disaggregations.length > 0) {
            const coColumnRegex = /^co_/;
            const coValuesToKeep = new Set(filters.disaggregations);

            filteredRows = filteredRows.filter(row => {
                // Check if any co_ column contains a value that matches our filter
                let hasMatchingDisaggregation = false;

                for (const [key, value] of Object.entries(row)) {
                    if (coColumnRegex.test(key) && typeof value === 'string' && value.length > 0) {
                        if (coValuesToKeep.has(value)) {
                            hasMatchingDisaggregation = true;
                            break;
                        }
                    }
                }

                // If we have disaggregation filters but no matching disaggregation values found,
                // keep rows without disaggregation (they might be "Unknown" category)
                if (!hasMatchingDisaggregation && filters.disaggregations.length > 0) {
                    // Check if this row has any disaggregation values
                    const hasAnyDisaggregation = Object.keys(row).some(key =>
                        coColumnRegex.test(key) && row[key] && String(row[key]).length > 0
                    );

                    // Keep rows without disaggregation if they exist
                    if (!hasAnyDisaggregation) {
                        return true;
                    }
                }

                return hasMatchingDisaggregation;
            });

            console.log(`📊 Filtered by disaggregations: ${filteredRows.length} points remaining`);
        }

        // Return the original data but with filtered rows
        return {
            ...data,
            filteredData: filteredRows,
            data_summary: {
                ...data.data_summary,
                total_points: filteredRows.length,
                filtered: true,
                original_point_count: data.data_summary?.total_points || 0,
                filter_applied: Object.keys(filters).filter(key => filters[key as keyof ChartFilter]?.length).join(', ')
            }
        };
    };

    // Generate chart option from filtered data using the same logic as structured-tools.ts
    const generateFilteredChartOption = async (filteredData: any): Promise<any> => {
        // Import the chart processing functions
        const { buildEChartsOption, groupChartData } = await import('../utils/tools/metadata/structured-tools');

        if (!filteredData || !filteredData.filteredData) {
            return null;
        }

        console.log(`📊 Generating chart options from ${filteredData.filteredData.length} filtered data points`);

        // Get the dimensions from the original/enhanced chart data
        const dimensions = filteredData.dimensions || {};
        const chartType = filteredData.chartType === 'line' || filteredData.chartType === 'bar' || filteredData.chartType === 'pie'
            ? filteredData.chartType
            : 'bar'; // Default fallback

        // Re-group the filtered data using the same logic as in structured-tools.ts
        const groupedData = groupChartData(filteredData.filteredData, chartType);

        // Build ECharts option object - create a mock chartData structure
        const mockChartData = {
            filteredData: filteredData.filteredData,
            dimensions,
            title: filteredData.title || 'Filtered Chart',
            chartType
        };

        const echartsOption = buildEChartsOption(mockChartData);

        console.log(`📊 Generated filtered chart with ${groupedData.series?.length || 0} series`);

        return echartsOption;
    };

    // Reset filters back to showing all data
    const resetFilters = async () => {
        if (!chartData) return;

        setFilters({});
        setIsFiltering(true);

        try {
            console.log('🔄 Resetting chart filters');

            // Re-generate the original chart options
            if (chartData.echarts_option) {
                setEchartsOption(chartData.echarts_option);
            }
        } catch (error) {
            console.error('❌ Error resetting filters:', error);
        } finally {
            setIsFiltering(false);
        }
    };

    const handleExport = async (format: string) => {
        if (!chartId) return;

        try {
            // For now, disable direct export - use main input instead
            // TODO: Implement proper export through main conversation interface
            console.log(`Export chart ${chartId} as ${format}: Generating download...`);

            // Simulate basic PNG/SVG export using ECharts
            if (format === 'png' || format === 'svg') {
                // ECharts provides built-in export functionality
                console.log('Use ECharts built-in export for visual formats');
            }

            onExport?.(format);
        } catch (error) {
            console.error('Error exporting chart:', error);
        }
    };

    const downloadFile = (data: any, filename: string, format: string) => {
        if (format === 'json') {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.click();
            URL.revokeObjectURL(url);
        } else if (format === 'csv' && typeof data === 'string') {
            const blob = new Blob([data], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.click();
            URL.revokeObjectURL(url);
        }
        // For PNG/SVG, the data would be handled by ECharts component
    };

    if (!echartsOption) {
        return (
            <div style={{
                padding: '20px',
                textAlign: 'center',
                color: '#666',
                border: '1px solid #ddd',
                borderRadius: '4px'
            }}>
                No chart data available
            </div>
        );
    }

    return (
        <div style={{ marginBottom: '30px' }}>
            {/* Chart Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '15px',
                paddingBottom: '10px',
                borderBottom: '1px solid #e0e0e0'
            }}>
                <h3 style={{ margin: 0, color: '#2c6693' }}>
                    {title || chartData.title || 'Analytics Chart'}
                </h3>

                {/* Export Buttons */}
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => handleExport('png')}
                        style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            backgroundColor: '#4CAF50',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer'
                        }}
                    >
                        PNG
                    </button>
                    <button
                        onClick={() => handleExport('svg')}
                        style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            backgroundColor: '#2196F3',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer'
                        }}
                    >
                        SVG
                    </button>
                    <button
                        onClick={() => handleExport('csv')}
                        style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            backgroundColor: '#FF9800',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer'
                        }}
                    >
                        CSV
                    </button>
                    <button
                        onClick={() => handleExport('json')}
                        style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            backgroundColor: '#9C27B0',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer'
                        }}
                    >
                        JSON
                    </button>
                </div>
            </div>

            {/* Filter Controls */}
            {Object.keys(filterOptions).length > 0 && (
                <div style={{
                    backgroundColor: '#f8f9fa',
                    padding: '15px',
                    borderRadius: '4px',
                    marginBottom: '15px',
                    border: '1px solid #e0e0e0'
                }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#2c6693' }}>Filters</h4>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
                        {filterOptions.indicators && filterOptions.indicators.length > 1 && (
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                                    Indicators:
                                </label>
                                <select
                                    multiple
                                    disabled={isFiltering}
                                    onChange={(e) => {
                                        const values = Array.from(e.target.selectedOptions, opt => opt.value);
                                        handleFilterChange('indicators', values);
                                    }}
                                    style={{
                                        minWidth: '150px',
                                        padding: '4px',
                                        border: '1px solid #ccc',
                                        borderRadius: '3px',
                                        minHeight: '60px'
                                    }}
                                >
                                    {filterOptions.indicators.map((indicator: string) => (
                                        <option key={indicator} value={indicator}>
                                            {indicator}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {filterOptions.periods && filterOptions.periods.length > 1 && (
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                                    Periods:
                                </label>
                                <select
                                    multiple
                                    disabled={isFiltering}
                                    onChange={(e) => {
                                        const values = Array.from(e.target.selectedOptions, opt => opt.value);
                                        handleFilterChange('periods', values);
                                    }}
                                    style={{
                                        minWidth: '120px',
                                        padding: '4px',
                                        border: '1px solid #ccc',
                                        borderRadius: '3px',
                                        minHeight: '60px'
                                    }}
                                >
                                    {filterOptions.periods.map((period: string) => (
                                        <option key={period} value={period}>
                                            {period}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {filterOptions.orgUnits && filterOptions.orgUnits.length > 1 && (
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                                    Organization Units:
                                </label>
                                <select
                                    multiple
                                    disabled={isFiltering}
                                    onChange={(e) => {
                                        const values = Array.from(e.target.selectedOptions, opt => opt.value);
                                        handleFilterChange('orgUnits', values);
                                    }}
                                    style={{
                                        minWidth: '150px',
                                        padding: '4px',
                                        border: '1px solid #ccc',
                                        borderRadius: '3px',
                                        minHeight: '60px'
                                    }}
                                >
                                    {filterOptions.orgUnits.map((orgUnit: string) => (
                                        <option key={orgUnit} value={orgUnit}>
                                            {orgUnit}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {filterOptions.disaggregations && filterOptions.disaggregations.length > 1 && (
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                                    Disaggregations:
                                </label>
                                <select
                                    multiple
                                    disabled={isFiltering}
                                    onChange={(e) => {
                                        const values = Array.from(e.target.selectedOptions, opt => opt.value);
                                        handleFilterChange('disaggregations', values);
                                    }}
                                    style={{
                                        minWidth: '140px',
                                        padding: '4px',
                                        border: '1px solid #ccc',
                                        borderRadius: '3px',
                                        minHeight: '60px'
                                    }}
                                >
                                    {filterOptions.disaggregations.map((disagg: string) => (
                                        <option key={disagg} value={disagg}>
                                            {disagg}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Reset Filters Button */}
                        {(filters.indicators?.length || filters.periods?.length || filters.orgUnits?.length || filters.disaggregations?.length) && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'flex-end',
                                marginBottom: '8px'
                            }}>
                                <button
                                    onClick={() => resetFilters()}
                                    disabled={isFiltering}
                                    style={{
                                        padding: '6px 12px',
                                        backgroundColor: '#6c757d',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '3px',
                                        cursor: 'pointer',
                                        fontSize: '12px'
                                    }}
                                >
                                    Reset Filters
                                </button>
                            </div>
                        )}
                    </div>

                    {isFiltering && (
                        <div style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>
                            Applying filters...
                        </div>
                    )}
                </div>
            )}

            {/* Chart Display */}
            <div style={{
                border: '1px solid #e0e0e0',
                borderRadius: '4px',
                overflow: 'hidden',
                backgroundColor: 'white'
            }}>
                <ReactECharts
                    option={echartsOption}
                    style={{ height: '400px', width: '100%' }}
                    opts={{ renderer: 'canvas' }}
                />
            </div>

            {/* Chart Info */}
            {chartData.data_summary && (
                <div style={{
                    marginTop: '10px',
                    fontSize: '12px',
                    color: '#666',
                    backgroundColor: '#f8f9fa',
                    padding: '8px',
                    borderRadius: '4px'
                }}>
                    {chartData.data_summary.total_points && (
                        <span>Total points: {chartData.data_summary.total_points} | </span>
                    )}
                    {chartData.data_summary.indicators_count && (
                        <span>Indicators: {chartData.data_summary.indicators_count} | </span>
                    )}
                    {chartData.data_summary.periods_count && (
                        <span>Periods: {chartData.data_summary.periods_count} | </span>
                    )}
                    {chartData.data_summary.org_units_count && (
                        <span>Org Units: {chartData.data_summary.org_units_count}</span>
                    )}
                </div>
            )}

            {/* Follow-up through main input: Use natural language queries like "filter by period" or "export as PNG" */}
        </div>
    );
};

export default AnalyticsChart;
