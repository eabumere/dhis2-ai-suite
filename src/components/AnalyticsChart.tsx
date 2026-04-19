import React, { useState, useEffect, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import LoadingSkeleton from './LoadingSkeleton';

interface AnalyticsChartProps {
    chartData: any;
    chartId?: string;
    title?: string;
    onFilter?: (filters: any) => void;
    onExport?: (format: string) => void;
    isLoading?: boolean;
}

interface ChartFilter {
    indicators?: string[];
    periods?: string[];
    orgUnits?: string[];
    disaggregations?: string[];
    categories?: Record<string, string[]>; // categoryId -> selected option names
}

interface FilterGroup {
    name: string;
    type: 'orgUnits' | 'periods' | 'category';
    options: Array<{name: string, id: string}>;
    selected: string[];
    categoryId?: string;
}

export const AnalyticsChart: React.FC<AnalyticsChartProps> = ({
    chartData,
    chartId,
    title,
    onFilter,
    onExport,
    isLoading = false
}) => {
    const [echartsOption, setEchartsOption] = useState<any>(null);
    const [fullChartData, setFullChartData] = useState<any>(null);
    const [filters, setFilters] = useState<ChartFilter>({});
    const [isFiltering, setIsFiltering] = useState(false);
    const [filterOptions, setFilterOptions] = useState<any>({});
    const [filtersExpanded, setFiltersExpanded] = useState(false);
    const [chartType, setChartType] = useState<string>('bar');
    const echartsRef = useRef<any>(null);

    useEffect(() => {
        if (chartData) {
            setFullChartData(chartData);
            
            // ✅ AUTO CHART TYPE SELECTION
            // Automatic multi-series detection:
            // - 1 series: default bar chart
            // - 2+ series: grouped multi-series bar chart
            if (chartData.echarts_option?.series?.length > 1) {
                console.log(`📊 Auto-detected ${chartData.echarts_option.series.length} series - using grouped multi-series chart`);
                setChartType('bar'); // Grouped bars is default for multiple series
                
                // Enable legend for multi-series charts if not already present
                if (!chartData.echarts_option.legend) {
                    chartData.echarts_option.legend = {
                        show: true,
                        top: 'top',
                        type: 'scroll',
                        textStyle: {
                            fontSize: 12
                        }
                    };
                }
            } else {
                setChartType(chartData.chartType || 'bar');
            }
            
            if (chartData.echarts_option) {
                setEchartsOption(chartData.echarts_option);
                // Extract filter options from chart data
                extractFilterOptions(chartData);
            }
        }
    }, [chartData]);

    const extractFilterOptions = (data: any) => {
        const options: any = {};

        // Extract traditional dimension filters
        if (data.dimensions?.indicators?.length > 0) {
            options.indicators = data.dimensions.indicators;
        }
        if (data.dimensions?.periods?.length > 0) {
            options.periods = data.dimensions.periods;
        }
        if (data.dimensions?.orgUnits?.length > 0) {
            options.orgUnits = data.dimensions.orgUnits;
        }

        // Extract disaggregation groups from dimensions.disaggregations first
        if (data.dimensions?.disaggregations?.length > 0) {
            options.disaggregations = data.dimensions.disaggregations;
        }

        // Extract category filter groups from filterGroups, but exclude categories already used for disaggregation
        if (data.filterGroups?.length > 0) {
            const disaggregationCategoryIds = new Set(
                (data.dimensions?.disaggregations || []).map((disagg: any) => disagg.categoryId)
            );

            options.categories = data.filterGroups.filter((group: any) =>
                group.type === 'category' && !disaggregationCategoryIds.has(group.categoryId)
            );
        }

        setFilterOptions(options);
    };

    const handleFilterChange = async (filterType: keyof ChartFilter, values: string[]) => {
	    console.log('Filters:', filterType, values);
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

            // Update the ECharts instance while preserving interactivity
            if (echartsRef.current) {
                echartsRef.current.getEchartsInstance().setOption(filteredOption, false, true);
            } else {
                setEchartsOption(filteredOption);
            }

            onFilter?.(newFilters);
        } catch (error) {
            console.error('❌ Error applying chart filter:', error);
        } finally {
            setIsFiltering(false);
        }
    };

    const handleCategoryFilterChange = async (categoryId: string, values: string[], newFilters: ChartFilter) => {
        if (!chartData) return;

        setIsFiltering(true);

        try {
            console.log(`📊 Applying category filter: ${categoryId} = [${values.join(', ')}]`);

            // Apply client-side filtering to the analytics data
            const filteredChartData = await applyClientSideFiltering(chartData, newFilters);

            // Update the chart options with filtered data
            const filteredOption = await generateFilteredChartOption(filteredChartData);

            // Update the ECharts instance while preserving interactivity
            if (echartsRef.current) {
                echartsRef.current.getEchartsInstance().setOption(filteredOption, false, true);
            } else {
                setEchartsOption(filteredOption);
            }

            onFilter?.(newFilters);
        } catch (error) {
            console.error('❌ Error applying category filter:', error);
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

        console.log(`📊 Filtering ${filteredData.length} data points with filters:`, filters, data);

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

        // Filter by disaggregations (option IDs mapped to COCs using optionsToCocs)
        console.log(`📊 Checking disaggregations filter: ${filters.disaggregations?.length || 0} items`, data);
        if (filters.disaggregations && filters.disaggregations.length > 0 && data?.optionsToCocs) {
            console.log(`📊 Applying disaggregations filter: ${filters.disaggregations.join(', ')}`);
            const validCOCIds = new Set<string>();

            // Map selected option IDs to their associated COCs using optionsToCocs directly
            filters.disaggregations.forEach((optionId: string) => {
                if (data.optionsToCocs[optionId]) {
                    data.optionsToCocs[optionId].forEach(cocId => validCOCIds.add(cocId));
                }
            });

            if (validCOCIds.size > 0) {
                filteredRows = filteredRows.filter(row => {
                    // Find COC ID column - could be 'co', 'co_0', etc.
                    const cocColumn = Object.keys(row).find(key => key.startsWith('co'));
                    const rowCocId = cocColumn ? row[cocColumn] : undefined;
                    return rowCocId && validCOCIds.has(rowCocId);
                });

                console.log(`📊 Filtered by disaggregations (${validCOCIds.size} valid COCs): ${filteredRows.length} points remaining`);
            } else {
                console.log(`📊 No valid COCs found for disaggregation filters - keeping all rows`);
            }
        } else if (filters.disaggregations && filters.disaggregations.length > 0) {
            console.log(`📊 Disaggregations filter applied but no optionsToCocs available`);
        } else {
            console.log(`📊 No disaggregations filter applied`);
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

    // Generate chart option from filtered data by updating existing chart structure
    const generateFilteredChartOption = async (filteredData: any): Promise<any> => {
        // Import buildEChartsOption directly for efficient regeneration
        const { buildEChartsOption } = await import('../utils/tools/metadata/structured-tools');

        if (!filteredData || !filteredData.filteredData) {
            return null;
        }

        console.log(`📊 Re-generating chart with filtered data: ${filteredData.filteredData.length} points`);

        try {
            // Create a complete chart data object with chartType and metadata from filtered data (like optionsToCocs)
            const completeChartData = {
                ...filteredData,
                chartType: filteredData.chartType || filteredData['chart_type'], // Use chartType from the passed data or current state
                metaData: filteredData.metaData || fullChartData?.metaData || chartData.metaData // Use metadata preserved through filtering (like optionsToCocs)
            };

            // Regenerate the ECharts option with the complete chart data
            const echartsOption = buildEChartsOption(completeChartData);

            console.log('📊 Successfully generated filtered chart options');
            return echartsOption;

        } catch (error) {
            console.error('❌ Error generating filtered chart:', error);
            return null;
        }
    };

    // Handle chart type change
    const handleChartTypeChange = async (newChartType: string) => {
        if (!chartData || newChartType === chartType) return;

        console.log(`📊 Changing chart type from ${chartType} to ${newChartType}`);
        setChartType(newChartType);
        setIsFiltering(true);

        try {
            // Create modified chart data with new chart type
            const updatedChartData = {
                ...fullChartData,
                chartType: newChartType
            };

            // Regenerate chart options with new type
            const newOption = await generateFilteredChartOption(updatedChartData);

            // Update the ECharts instance
            if (echartsRef.current) {
                echartsRef.current.getEchartsInstance().setOption(newOption, false, true);
            } else {
                setEchartsOption(newOption);
            }
        } catch (error) {
            console.error('❌ Error changing chart type:', error);
        } finally {
            setIsFiltering(false);
        }
    };

    // Reset filters back to showing all data
    const resetFilters = async () => {
        if (!chartData) return;

        setFilters({});
        setIsFiltering(true);

        try {
            console.log('🔄 Resetting chart filters');

            // Regenerate chart options with original unfiltered data
            const originalOption = await generateFilteredChartOption(fullChartData);
            setEchartsOption(originalOption);

            // Update the ECharts instance
            if (echartsRef.current) {
                echartsRef.current.getEchartsInstance().setOption(originalOption, false, true);
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
            console.log(`Export chart ${chartId} as ${format}: Generating download...`);

            if (format === 'png' || format === 'svg') {
                // Use ECharts built-in export functionality
                if (echartsRef.current) {
                    const echartsInstance = echartsRef.current.getEchartsInstance();

                    let dataURL: string;
                    if (format === 'svg') {
                        // Temporarily switch to SVG renderer for proper SVG export
                        echartsInstance.setOption({}, false, { renderer: 'svg' });
                        dataURL = echartsInstance.getDataURL({
                            type: 'svg',
                            backgroundColor: '#ffffff'
                        });
                        // Restore canvas renderer
                        echartsInstance.setOption({}, false, { renderer: 'canvas' });
                    } else {
                        // PNG export with canvas renderer
                        dataURL = echartsInstance.getDataURL({
                            type: 'png',
                            pixelRatio: 2, // Higher quality
                            backgroundColor: '#ffffff'
                        });
                    }

                    // Create download link
                    const link = document.createElement('a');
                    link.href = dataURL;
                    link.download = `chart-${chartId}.${format}`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);

                    console.log(`✅ Chart exported as ${format.toUpperCase()}`);
                }
            } else if (format === 'csv') {
                // Generate CSV from chart data
                const csvData = generateCSVData();
                const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);

                const link = document.createElement('a');
                link.href = url;
                link.download = `chart-${chartId}.csv`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);

                console.log('✅ Chart data exported as CSV');
            } else if (format === 'json') {
                // Export chart data as JSON
                const jsonData = {
                    chartId,
                    title: title || chartData.title || 'Analytics Chart',
                    chartType,
                    data: fullChartData,
                    filters: filters,
                    exportDate: new Date().toISOString()
                };

                const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);

                const link = document.createElement('a');
                link.href = url;
                link.download = `chart-${chartId}.json`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);

                console.log('✅ Chart data exported as JSON');
            }

            onExport?.(format);
        } catch (error) {
            console.error('Error exporting chart:', error);
        }
    };

    const generateCSVData = (): string => {
        if (!fullChartData?.filteredData || !Array.isArray(fullChartData.filteredData)) {
            return 'No data available';
        }

        const headers = Object.keys(fullChartData.filteredData[0] || {});
        const csvRows = [headers.join(',')];

        fullChartData.filteredData.forEach(row => {
            const values = headers.map(header => {
                const value = row[header];
                // Escape commas and quotes in CSV
                if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value || '';
            });
            csvRows.push(values.join(','));
        });

        return csvRows.join('\n');
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

    // Show skeleton when loading or no chart data
    if (isLoading || !echartsOption) {
        return <LoadingSkeleton type="chart" />;
    }

    return (
        <div style={{
            marginBottom: 'var(--space-8)',
            backgroundColor: 'var(--color-bg-primary)',
            border: '1px solid var(--color-border-light)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-md)',
            overflow: 'hidden',
            position: 'relative',
            animation: 'fade-in-up var(--transition-normal)',
            opacity: 1,
            transform: 'translateY(0)'
        }}>
            {/* Title */}
            <div style={{
                marginBottom: 'var(--space-4)',
                padding: 'var(--space-4) var(--space-6)',
                background: 'linear-gradient(135deg, var(--color-primary-50), var(--color-primary-100))',
                borderBottom: '1px solid var(--color-border-light)'
            }}>
                <h3 style={{
                    margin: 0,
                    color: 'var(--color-primary-700)',
                    fontSize: 'var(--font-size-xl)',
                    fontWeight: 'var(--font-weight-semibold)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)'
                }}>
                    <span>📊</span>
                    <span
                        style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '500px',
                            cursor: 'default'
                        }}
                        title={title || chartData.title || 'Analytics Chart'}
                    >
                        {title || chartData.title || 'Analytics Chart'}
                    </span>
                </h3>
                {chartData.data_summary && (
                    <div style={{
                        marginTop: 'var(--space-2)',
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--color-text-secondary)'
                    }}>
                        {chartData.data_summary.total_points && (
                            <span>📈 {chartData.data_summary.total_points} data points</span>
                        )}
                        {chartData.data_summary.indicators_count && (
                            <span> • 🎯 {chartData.data_summary.indicators_count} indicators</span>
                        )}
                        {chartData.data_summary.periods_count && (
                            <span> • 📅 {chartData.data_summary.periods_count} periods</span>
                        )}
                        {chartData.data_summary.org_units_count && (
                            <span> • 🏢 {chartData.data_summary.org_units_count} org units</span>
                        )}
                    </div>
                )}
            </div>

            {/* Collapsed/Expanded Filter Controls */}
            {Object.keys(filterOptions).length > 0 && (
                <div style={{
                    margin: 'var(--space-4) var(--space-6)',
                    border: '1px solid var(--color-border-light)',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                    backgroundColor: 'var(--color-bg-primary)',
                    boxShadow: 'var(--shadow-sm)'
                }}>
                    {/* Filter Header - Always Visible */}
                    <div style={{
                        background: 'linear-gradient(135deg, var(--color-gray-50), var(--color-gray-100))',
                        padding: 'var(--space-3) var(--space-4)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        borderBottom: filtersExpanded ? '1px solid var(--color-border-light)' : 'none',
                        transition: 'var(--transition-fast)'
                    }}
                    className="hover-lift"
                    onClick={() => setFiltersExpanded(!filtersExpanded)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                            <span style={{
                                fontSize: 'var(--font-size-sm)',
                                fontWeight: 'var(--font-weight-semibold)',
                                color: 'var(--color-primary-700)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-2)'
                            }}>
                                <span>🔍</span>
                                Filters & Controls
                            </span>
                            {/* Show active filter count */}
                            {Object.keys(filters).some(key => {
                                const filterValue = filters[key as keyof ChartFilter];
                                if (key === 'categories' && filterValue) {
                                    return Object.values(filterValue as Record<string, string[]>).some(arr => arr?.length > 0);
                                }
                                return (filterValue as string[])?.length > 0;
                            }) && (
                                <span style={{
                                    background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-600))',
                                    color: 'var(--color-text-inverse)',
                                    padding: 'var(--space-1) var(--space-2)',
                                    borderRadius: 'var(--radius-full)',
                                    fontSize: 'var(--font-size-xs)',
                                    fontWeight: 'var(--font-weight-bold)',
                                    boxShadow: 'var(--shadow-sm)'
                                }}>
                                    {Object.keys(filters).reduce((count, key) => {
                                        const filterValue = filters[key as keyof ChartFilter];
                                        if (key === 'categories' && filterValue) {
                                            return count + Object.values(filterValue as Record<string, string[]>).reduce((catCount, arr) => catCount + (arr?.length || 0), 0);
                                        }
                                        return count + ((filterValue as string[])?.length || 0);
                                    }, 0)} active
                                </span>
                            )}
                        </div>
                        <span style={{
                            fontSize: 'var(--font-size-sm)',
                            color: 'var(--color-text-secondary)',
                            transform: filtersExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'var(--transition-fast)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '20px',
                            height: '20px',
                            backgroundColor: 'var(--color-gray-200)',
                            borderRadius: 'var(--radius-full)'
                        }}>
                            ▼
                        </span>
                    </div>

                    {/* Expandable Filter Body - Enhanced with card-based filters */}
                    {filtersExpanded && (
                        <div style={{
                            background: 'linear-gradient(135deg, var(--color-gray-50), var(--color-gray-100))',
                            padding: 'var(--space-4)',
                            borderTop: '1px solid var(--color-border-light)'
                        }}>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                                gap: 'var(--space-4)',
                                marginBottom: 'var(--space-4)'
                            }}>
                                {/* Indicators filter */}
                                {filterOptions.indicators && filterOptions.indicators.length > 1 && (
                                    <div style={{
                                        backgroundColor: 'var(--color-bg-primary)',
                                        border: '1px solid var(--color-border-light)',
                                        borderRadius: 'var(--radius-lg)',
                                        padding: 'var(--space-3)',
                                        boxShadow: 'var(--shadow-sm)'
                                    }}>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 'var(--space-2)',
                                            marginBottom: 'var(--space-2)'
                                        }}>
                                            <span style={{
                                                fontSize: 'var(--font-size-sm)',
                                                fontWeight: 'var(--font-weight-semibold)',
                                                color: 'var(--color-primary-700)'
                                            }}>
                                                🎯 Indicators
                                            </span>
                                            {filters.indicators?.length > 0 && (
                                                <span style={{
                                                    backgroundColor: 'var(--color-primary)',
                                                    color: 'var(--color-text-inverse)',
                                                    padding: 'var(--space-1) var(--space-2)',
                                                    borderRadius: 'var(--radius-full)',
                                                    fontSize: 'var(--font-size-xs)',
                                                    fontWeight: 'var(--font-weight-bold)'
                                                }}>
                                                    {filters.indicators.length}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: 'var(--space-2)'
                                        }}>
                                            {filterOptions.indicators.map((indicator: string) => {
                                                const isSelected = filters.indicators?.includes(indicator);
                                                return (
                                                    <button
                                                        key={indicator}
                                                        onClick={() => {
                                                            const newValues = isSelected
                                                                ? filters.indicators?.filter(i => i !== indicator) || []
                                                                : [...(filters.indicators || []), indicator];
                                                            handleFilterChange('indicators', newValues);
                                                        }}
                                                        disabled={isFiltering}
                                                        style={{
                                                            padding: 'var(--space-2) var(--space-3)',
                                                            backgroundColor: isSelected ? 'var(--color-primary)' : 'var(--color-bg-secondary)',
                                                            color: isSelected ? 'var(--color-text-inverse)' : 'var(--color-text-primary)',
                                                            border: `1px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border-light)'}`,
                                                            borderRadius: 'var(--radius-lg)',
                                                            cursor: 'pointer',
                                                            fontSize: 'var(--font-size-sm)',
                                                            fontWeight: isSelected ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)',
                                                            transition: 'var(--transition-fast)',
                                                            maxWidth: '200px',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                        className="hover-lift"
                                                        title={indicator}
                                                    >
                                                        {indicator.length > 15 ? indicator.substring(0, 12) + '...' : indicator}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Periods filter */}
                                {filterOptions.periods && filterOptions.periods.length > 0 && (
                                    <div style={{
                                        backgroundColor: 'var(--color-bg-primary)',
                                        border: '1px solid var(--color-border-light)',
                                        borderRadius: 'var(--radius-lg)',
                                        padding: 'var(--space-3)',
                                        boxShadow: 'var(--shadow-sm)'
                                    }}>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 'var(--space-2)',
                                            marginBottom: 'var(--space-2)'
                                        }}>
                                            <span style={{
                                                fontSize: 'var(--font-size-sm)',
                                                fontWeight: 'var(--font-weight-semibold)',
                                                color: 'var(--color-warning-700)'
                                            }}>
                                                📅 Periods
                                            </span>
                                            {filters.periods?.length > 0 && (
                                                <span style={{
                                                    backgroundColor: 'var(--color-warning)',
                                                    color: 'var(--color-text-inverse)',
                                                    padding: 'var(--space-1) var(--space-2)',
                                                    borderRadius: 'var(--radius-full)',
                                                    fontSize: 'var(--font-size-xs)',
                                                    fontWeight: 'var(--font-weight-bold)'
                                                }}>
                                                    {filters.periods.length}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: 'var(--space-2)'
                                        }}>
                                            {filterOptions.periods.map((period: string) => {
                                                const isSelected = filters.periods?.includes(period);
                                                return (
                                                    <button
                                                        key={period}
                                                        onClick={() => {
                                                            const newValues = isSelected
                                                                ? filters.periods?.filter(p => p !== period) || []
                                                                : [...(filters.periods || []), period];
                                                            handleFilterChange('periods', newValues);
                                                        }}
                                                        disabled={isFiltering}
                                                        style={{
                                                            padding: 'var(--space-2) var(--space-3)',
                                                            backgroundColor: isSelected ? 'var(--color-warning)' : 'var(--color-bg-secondary)',
                                                            color: isSelected ? 'var(--color-text-inverse)' : 'var(--color-text-primary)',
                                                            border: `1px solid ${isSelected ? 'var(--color-warning)' : 'var(--color-border-light)'}`,
                                                            borderRadius: 'var(--radius-lg)',
                                                            cursor: 'pointer',
                                                            fontSize: 'var(--font-size-sm)',
                                                            fontWeight: isSelected ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)',
                                                            transition: 'var(--transition-fast)'
                                                        }}
                                                        className="hover-lift"
                                                    >
                                                        {period}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Organization Units filter */}
                                {filterOptions.orgUnits && filterOptions.orgUnits.length > 1 && (
                                    <div style={{
                                        backgroundColor: 'var(--color-bg-primary)',
                                        border: '1px solid var(--color-border-light)',
                                        borderRadius: 'var(--radius-lg)',
                                        padding: 'var(--space-3)',
                                        boxShadow: 'var(--shadow-sm)'
                                    }}>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 'var(--space-2)',
                                            marginBottom: 'var(--space-2)'
                                        }}>
                                            <span style={{
                                                fontSize: 'var(--font-size-sm)',
                                                fontWeight: 'var(--font-weight-semibold)',
                                                color: 'var(--color-info-700)'
                                            }}>
                                                🏢 Org Units
                                            </span>
                                            {filters.orgUnits?.length > 0 && (
                                                <span style={{
                                                    backgroundColor: 'var(--color-info)',
                                                    color: 'var(--color-text-inverse)',
                                                    padding: 'var(--space-1) var(--space-2)',
                                                    borderRadius: 'var(--radius-full)',
                                                    fontSize: 'var(--font-size-xs)',
                                                    fontWeight: 'var(--font-weight-bold)'
                                                }}>
                                                    {filters.orgUnits.length}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: 'var(--space-2)'
                                        }}>
                                            {filterOptions.orgUnits.map((orgUnit: string) => {
                                                const isSelected = filters.orgUnits?.includes(orgUnit);
                                                return (
                                                    <button
                                                        key={orgUnit}
                                                        onClick={() => {
                                                            const newValues = isSelected
                                                                ? filters.orgUnits?.filter(o => o !== orgUnit) || []
                                                                : [...(filters.orgUnits || []), orgUnit];
                                                            handleFilterChange('orgUnits', newValues);
                                                        }}
                                                        disabled={isFiltering}
                                                        style={{
                                                            padding: 'var(--space-2) var(--space-3)',
                                                            backgroundColor: isSelected ? 'var(--color-info)' : 'var(--color-bg-secondary)',
                                                            color: isSelected ? 'var(--color-text-inverse)' : 'var(--color-text-primary)',
                                                            border: `1px solid ${isSelected ? 'var(--color-info)' : 'var(--color-border-light)'}`,
                                                            borderRadius: 'var(--radius-lg)',
                                                            cursor: 'pointer',
                                                            fontSize: 'var(--font-size-sm)',
                                                            fontWeight: isSelected ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)',
                                                            transition: 'var(--transition-fast)',
                                                            maxWidth: '200px',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap'
                                                        }}
                                                        className="hover-lift"
                                                        title={orgUnit}
                                                    >
                                                        {orgUnit.length > 15 ? orgUnit.substring(0, 12) + '...' : orgUnit}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Disaggregation filter controls */}
                                {filterOptions.disaggregations && filterOptions.disaggregations.length > 0 && filterOptions.disaggregations.map((disaggGroup: any) => (
                                    <div key={disaggGroup.categoryId} style={{
                                        backgroundColor: 'var(--color-bg-primary)',
                                        border: '1px solid var(--color-border-light)',
                                        borderRadius: 'var(--radius-lg)',
                                        padding: 'var(--space-3)',
                                        boxShadow: 'var(--shadow-sm)'
                                    }}>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 'var(--space-2)',
                                            marginBottom: 'var(--space-2)'
                                        }}>
                                            <span style={{
                                                fontSize: 'var(--font-size-sm)',
                                                fontWeight: 'var(--font-weight-semibold)',
                                                color: 'var(--color-secondary-700)'
                                            }}>
                                                📊 {disaggGroup.categoryName}
                                            </span>
                                            {filters.disaggregations?.length > 0 && (
                                                <span style={{
                                                    backgroundColor: 'var(--color-secondary)',
                                                    color: 'var(--color-text-inverse)',
                                                    padding: 'var(--space-1) var(--space-2)',
                                                    borderRadius: 'var(--radius-full)',
                                                    fontSize: 'var(--font-size-xs)',
                                                    fontWeight: 'var(--font-weight-bold)'
                                                }}>
                                                    {filters.disaggregations.length}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: 'var(--space-2)'
                                        }}>
                                            {disaggGroup.options.map((option: {name: string, id: string}) => {
                                                const isSelected = filters.disaggregations?.includes(option.id);
                                                return (
                                                    <button
                                                        key={option.id}
                                                        onClick={() => {
                                                            const newValues = isSelected
                                                                ? filters.disaggregations?.filter(d => d !== option.id) || []
                                                                : [...(filters.disaggregations || []), option.id];
                                                            const newFilters = { ...filters, disaggregations: newValues };
                                                            setFilters(newFilters);
                                                            handleFilterChange('disaggregations', newValues);
                                                        }}
                                                        disabled={isFiltering}
                                                        style={{
                                                            padding: 'var(--space-2) var(--space-3)',
                                                            backgroundColor: isSelected ? 'var(--color-secondary)' : 'var(--color-bg-secondary)',
                                                            color: isSelected ? 'var(--color-text-inverse)' : 'var(--color-text-primary)',
                                                            border: `1px solid ${isSelected ? 'var(--color-secondary)' : 'var(--color-border-light)'}`,
                                                            borderRadius: 'var(--radius-lg)',
                                                            cursor: 'pointer',
                                                            fontSize: 'var(--font-size-sm)',
                                                            fontWeight: isSelected ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)',
                                                            transition: 'var(--transition-fast)'
                                                        }}
                                                        className="hover-lift"
                                                    >
                                                        {option.name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}

                                {/* Category-specific filter controls */}
                                {filterOptions.categories && filterOptions.categories.length > 0 && filterOptions.categories.map((categoryGroup: any) => (
                                    <div key={categoryGroup.categoryId} style={{
                                        backgroundColor: 'var(--color-bg-primary)',
                                        border: '1px solid var(--color-border-light)',
                                        borderRadius: 'var(--radius-lg)',
                                        padding: 'var(--space-3)',
                                        boxShadow: 'var(--shadow-sm)'
                                    }}>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 'var(--space-2)',
                                            marginBottom: 'var(--space-2)'
                                        }}>
                                            <span style={{
                                                fontSize: 'var(--font-size-sm)',
                                                fontWeight: 'var(--font-weight-semibold)',
                                                color: 'var(--color-success-700)'
                                            }}>
                                                🏷️ {categoryGroup.name}
                                            </span>
                                            {(filters.categories?.[categoryGroup.categoryId]?.length || 0) > 0 && (
                                                <span style={{
                                                    backgroundColor: 'var(--color-success)',
                                                    color: 'var(--color-text-inverse)',
                                                    padding: 'var(--space-1) var(--space-2)',
                                                    borderRadius: 'var(--radius-full)',
                                                    fontSize: 'var(--font-size-xs)',
                                                    fontWeight: 'var(--font-weight-bold)'
                                                }}>
                                                    {filters.categories[categoryGroup.categoryId].length}
                                                </span>
                                            )}
                                        </div>
                                        <div style={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: 'var(--space-2)'
                                        }}>
                                            {categoryGroup.options.map((option: {name: string, id: string}) => {
                                                const isSelected = filters.categories?.[categoryGroup.categoryId]?.includes(option.name);
                                                return (
                                                    <button
                                                        key={option.id}
                                                        onClick={() => {
                                                            const currentValues = filters.categories?.[categoryGroup.categoryId] || [];
                                                            const newValues = isSelected
                                                                ? currentValues.filter(v => v !== option.name)
                                                                : [...currentValues, option.name];
                                                            const newCategories = { ...filters.categories, [categoryGroup.categoryId]: newValues };
                                                            const newFilters = { ...filters, categories: newCategories };
                                                            setFilters(newFilters);
                                                            handleCategoryFilterChange(categoryGroup.categoryId, newValues, newFilters);
                                                        }}
                                                        disabled={isFiltering}
                                                        style={{
                                                            padding: 'var(--space-2) var(--space-3)',
                                                            backgroundColor: isSelected ? 'var(--color-success)' : 'var(--color-bg-secondary)',
                                                            color: isSelected ? 'var(--color-text-inverse)' : 'var(--color-text-primary)',
                                                            border: `1px solid ${isSelected ? 'var(--color-success)' : 'var(--color-border-light)'}`,
                                                            borderRadius: 'var(--radius-lg)',
                                                            cursor: 'pointer',
                                                            fontSize: 'var(--font-size-sm)',
                                                            fontWeight: isSelected ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)',
                                                            transition: 'var(--transition-fast)'
                                                        }}
                                                        className="hover-lift"
                                                    >
                                                        {option.name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Action buttons */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                {/* Reset Filters Button */}
                                {(filters.indicators?.length || filters.periods?.length || filters.orgUnits?.length || filters.disaggregations?.length || (filters.categories && Object.values(filters.categories).some(arr => arr?.length > 0))) && (
                                    <button
                                        onClick={() => resetFilters()}
                                        disabled={isFiltering}
                                        style={{
                                            padding: 'var(--space-2) var(--space-4)',
                                            backgroundColor: 'var(--color-gray-600)',
                                            color: 'var(--color-text-inverse)',
                                            border: 'none',
                                            borderRadius: 'var(--radius-lg)',
                                            cursor: 'pointer',
                                            fontSize: 'var(--font-size-sm)',
                                            fontWeight: 'var(--font-weight-medium)',
                                            transition: 'var(--transition-fast)',
                                            boxShadow: 'var(--shadow-sm)'
                                        }}
                                        className="hover-lift"
                                    >
                                        🔄 Reset All Filters
                                    </button>
                                )}

                                {/* Filter status */}
                                {isFiltering && (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 'var(--space-2)',
                                        fontSize: 'var(--font-size-sm)',
                                        color: 'var(--color-text-secondary)'
                                    }}>
                                        <div style={{
                                            width: '16px',
                                            height: '16px',
                                            border: '2px solid var(--color-primary)',
                                            borderTop: '2px solid transparent',
                                            borderRadius: '50%',
                                            animation: 'spin 1s linear infinite'
                                        }}></div>
                                        <span>Applying filters...</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Enhanced Chart Type and Export Controls */}
            <div style={{
                margin: 'var(--space-4) var(--space-6)',
                background: 'linear-gradient(135deg, var(--color-gray-50), var(--color-gray-100))',
                border: '1px solid var(--color-border-light)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-4)',
                flexWrap: 'wrap',
                boxShadow: 'var(--shadow-sm)'
            }}>
                {/* Chart Type Selector */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    flexShrink: 0
                }}>
                    <span style={{
                        fontSize: 'var(--font-size-sm)',
                        fontWeight: 'var(--font-weight-semibold)',
                        color: 'var(--color-primary-700)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)'
                    }}>
                        <span>📈</span>
                        Chart Type
                    </span>
                    <div style={{
                        position: 'relative',
                        display: 'flex',
                        gap: 'var(--space-1)'
                    }}>
                        {[
                            { type: 'bar', icon: '📊', label: 'Bar' },
                            { type: 'line', icon: '📈', label: 'Line' },
                            { type: 'pie', icon: '🥧', label: 'Pie' }
                        ].map(({ type, icon, label }) => (
                            <button
                                key={type}
                                onClick={() => handleChartTypeChange(type)}
                                disabled={isFiltering}
                                style={{
                                    padding: 'var(--space-2) var(--space-3)',
                                    backgroundColor: chartType === type ? 'var(--color-primary)' : 'var(--color-bg-primary)',
                                    color: chartType === type ? 'var(--color-text-inverse)' : 'var(--color-text-primary)',
                                    border: `1px solid ${chartType === type ? 'var(--color-primary)' : 'var(--color-border-light)'}`,
                                    borderRadius: 'var(--radius-md)',
                                    cursor: 'pointer',
                                    fontSize: 'var(--font-size-sm)',
                                    fontWeight: 'var(--font-weight-medium)',
                                    transition: 'var(--transition-fast)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 'var(--space-2)',
                                    minWidth: '70px',
                                    justifyContent: 'center',
                                    boxShadow: chartType === type ? 'var(--shadow-sm)' : 'none'
                                }}
                                className="hover-lift"
                                title={`Switch to ${label} chart`}
                            >
                                <span>{icon}</span>
                                <span>{label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Export Controls */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    flexShrink: 0
                }}>
                    <span style={{
                        fontSize: 'var(--font-size-sm)',
                        fontWeight: 'var(--font-weight-semibold)',
                        color: 'var(--color-primary-700)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)'
                    }}>
                        <span>💾</span>
                        Export
                    </span>
                    <div style={{
                        display: 'flex',
                        gap: 'var(--space-2)',
                        flexWrap: 'wrap'
                    }}>
                        {[
                            { format: 'png', icon: '🖼️', label: 'PNG', color: 'var(--color-success)' },
                            { format: 'svg', icon: '🎨', label: 'SVG', color: 'var(--color-info)' },
                            { format: 'csv', icon: '📊', label: 'CSV', color: 'var(--color-warning)' },
                            { format: 'json', icon: '📋', label: 'JSON', color: 'var(--color-secondary)' }
                        ].map(({ format, icon, label, color }) => (
                            <button
                                key={format}
                                onClick={() => handleExport(format)}
                                disabled={isFiltering}
                                style={{
                                    padding: 'var(--space-2) var(--space-3)',
                                    backgroundColor: color,
                                    color: 'var(--color-text-inverse)',
                                    border: 'none',
                                    borderRadius: 'var(--radius-md)',
                                    cursor: 'pointer',
                                    fontSize: 'var(--font-size-sm)',
                                    fontWeight: 'var(--font-weight-medium)',
                                    transition: 'var(--transition-fast)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 'var(--space-2)',
                                    minWidth: '65px',
                                    justifyContent: 'center',
                                    boxShadow: 'var(--shadow-sm)'
                                }}
                                className="hover-lift"
                                title={`Export as ${label.toUpperCase()}`}
                            >
                                <span>{icon}</span>
                                <span>{label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Loading Indicator */}
                {isFiltering && (
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        backgroundColor: 'var(--color-bg-primary)',
                        padding: 'var(--space-2) var(--space-4)',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: 'var(--shadow-lg)',
                        border: '1px solid var(--color-border-light)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                        zIndex: 10
                    }}>
                        <div style={{
                            width: '16px',
                            height: '16px',
                            border: '2px solid var(--color-primary)',
                            borderTop: '2px solid transparent',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite'
                        }}></div>
                        <span style={{
                            fontSize: 'var(--font-size-sm)',
                            color: 'var(--color-text-primary)',
                            fontWeight: 'var(--font-weight-medium)'
                        }}>
                            Updating chart...
                        </span>
                    </div>
                )}
            </div>

            {/* Chart Display - Responsive height using available screen space */}
            <div style={{
                border: '1px solid var(--color-border-light)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                backgroundColor: 'var(--color-bg-primary)',
                minHeight: '300px',
                maxHeight: '60vh', // Use up to 60% of viewport height
                display: 'flex',
                flexDirection: 'column'
            }}>
                <ReactECharts
                    ref={echartsRef}
                    option={echartsOption}
                    style={{
                        height: '100%',
                        width: '100%',
                        minHeight: '300px',
                        flex: 1
                    }}
                    opts={{
                        renderer: 'canvas',
                        devicePixelRatio: window.devicePixelRatio || 1
                    }}
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
