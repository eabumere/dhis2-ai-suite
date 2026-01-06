import React, { useState, useEffect, useRef } from 'react';
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
    onExport
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
            setChartType(chartData.chartType || 'bar');
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
                    const rowCocId = row.co; // COC ID column
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
                chartType: filteredData.chartType, // Use chartType from the passed data (which may be updated)
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
            {/* Title */}
            <div style={{ marginBottom: '15px' }}>
                <h3 style={{ margin: 0, color: '#2c6693' }}>
                    {title || chartData.title || 'Analytics Chart'}
                </h3>
            </div>

            {/* Collapsed/Expanded Filter Controls */}
            {Object.keys(filterOptions).length > 0 && (
                <div style={{
                    marginBottom: '15px',
                    border: '1px solid #e0e0e0',
                    borderRadius: '4px',
                    overflow: 'hidden'
                }}>
                    {/* Filter Header - Always Visible */}
                    <div style={{
                        backgroundColor: '#f8f9fa',
                        padding: '10px 15px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        borderBottom: filtersExpanded ? '1px solid #e0e0e0' : 'none'
                    }} onClick={() => setFiltersExpanded(!filtersExpanded)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#2c6693' }}>
                                📊 Filters
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
                                    backgroundColor: '#007bff',
                                    color: 'white',
                                    padding: '2px 6px',
                                    borderRadius: '10px',
                                    fontSize: '11px',
                                    fontWeight: 'bold'
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
                            fontSize: '12px',
                            color: '#666',
                            transform: filtersExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s'
                        }}>
                            ▼
                        </span>
                    </div>

                    {/* Expandable Filter Body */}
                    {filtersExpanded && (
                        <div style={{
                            backgroundColor: '#f8f9fa',
                            padding: '15px',
                            borderTop: '1px solid #e9ecef'
                        }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '15px' }}>
                                {/* Indicators filter */}
                                {filterOptions.indicators && filterOptions.indicators.length > 1 && (
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '12px' }}>
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
                                                minWidth: '120px',
                                                padding: '4px',
                                                border: '1px solid #ccc',
                                                borderRadius: '3px',
                                                minHeight: '50px',
                                                fontSize: '11px'
                                            }}
                                        >
                                            {filterOptions.indicators.map((indicator: string) => (
                                                <option key={indicator} value={indicator}>
                                                    {indicator.length > 20 ? indicator.substring(0, 17) + '...' : indicator}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Periods filter */}
                                {filterOptions.periods && filterOptions.periods.length > 0 && (
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '12px' }}>
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
                                                minWidth: '100px',
                                                padding: '4px',
                                                border: '1px solid #ccc',
                                                borderRadius: '3px',
                                                minHeight: '50px',
                                                fontSize: '11px'
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

                                {/* Organization Units filter */}
                                {filterOptions.orgUnits && filterOptions.orgUnits.length > 1 && (
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '12px' }}>
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
                                                minWidth: '120px',
                                                padding: '4px',
                                                border: '1px solid #ccc',
                                                borderRadius: '3px',
                                                minHeight: '50px',
                                                fontSize: '11px'
                                            }}
                                        >
                                            {filterOptions.orgUnits.map((orgUnit: string) => (
                                                <option key={orgUnit} value={orgUnit}>
                                                    {orgUnit.length > 20 ? orgUnit.substring(0, 17) + '...' : orgUnit}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Disaggregation filter controls - shown independently like categories */}
                                {filterOptions.disaggregations && filterOptions.disaggregations.length > 0 && filterOptions.disaggregations.map((disaggGroup: any) => (
                                    <div key={disaggGroup.categoryId}>
                                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '12px' }}>
                                            {disaggGroup.categoryName}:
                                        </label>
                                        <select
                                            multiple
                                            disabled={isFiltering}
                                            onChange={(e) => {
                                                const values = Array.from(e.target.selectedOptions, opt => opt.value);
                                                // Update the disaggregations filter with option IDs
                                                const newFilters = { ...filters, disaggregations: values };
                                                setFilters(newFilters);
                                                handleFilterChange('disaggregations', values);
                                            }}
                                            style={{
                                                minWidth: '120px',
                                                padding: '4px',
                                                border: '1px solid #ccc',
                                                borderRadius: '3px',
                                                minHeight: '50px',
                                                fontSize: '11px'
                                            }}
                                        >
                                            {disaggGroup.options.map((option: {name: string, id: string}) => (
                                                <option key={option.id} value={option.id}>
                                                    {option.name.length > 20 ? option.name.substring(0, 17) + '...' : option.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ))}

                                {/* Category-specific filter controls - shown independently */}
                                {filterOptions.categories && filterOptions.categories.length > 0 && filterOptions.categories.map((categoryGroup: any) => (
                                    <div key={categoryGroup.categoryId}>
                                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '12px' }}>
                                            {categoryGroup.name}:
                                        </label>
                                        <select
                                            multiple
                                            disabled={isFiltering}
                                            onChange={(e) => {
                                                const values = Array.from(e.target.selectedOptions, opt => opt.value);
                                                // Update the categories filter
                                                const newCategories = { ...filters.categories, [categoryGroup.categoryId]: values };
                                                const newFilters = { ...filters, categories: newCategories };
                                                setFilters(newFilters);
                                                handleCategoryFilterChange(categoryGroup.categoryId, values, newFilters);
                                            }}
                                            style={{
                                                minWidth: '120px',
                                                padding: '4px',
                                                border: '1px solid #ccc',
                                                borderRadius: '3px',
                                                minHeight: '50px',
                                                fontSize: '11px'
                                            }}
                                        >
                                            {categoryGroup.options.map((option: {name: string, id: string}) => (
                                                <option key={option.id} value={option.name}>
                                                    {option.name.length > 20 ? option.name.substring(0, 17) + '...' : option.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ))}

                                {/* Reset Filters Button */}
                                {(filters.indicators?.length || filters.periods?.length || filters.orgUnits?.length || filters.disaggregations?.length || (filters.categories && Object.values(filters.categories).some(arr => arr?.length > 0))) && (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'flex-end',
                                        marginBottom: '8px'
                                    }}>
                                        <button
                                            onClick={() => resetFilters()}
                                            disabled={isFiltering}
                                            style={{
                                                padding: '6px 10px',
                                                backgroundColor: '#6c757d',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '3px',
                                                cursor: 'pointer',
                                                fontSize: '11px'
                                            }}
                                        >
                                            Reset Filters
                                        </button>
                                    </div>
                                )}
                            </div>

                            {isFiltering && (
                                <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
                                    Applying filters...
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Chart Type and Export Controls */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '15px',
                padding: '10px 15px',
                backgroundColor: '#f8f9fa',
                border: '1px solid #e0e0e0',
                borderRadius: '4px'
            }}>
                {/* Chart Type Dropdown */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#2c6693' }}>
                        Chart Type:
                    </label>
                    <select
                        value={chartType}
                        onChange={(e) => handleChartTypeChange(e.target.value)}
                        disabled={isFiltering}
                        style={{
                            padding: '6px 8px',
                            border: '1px solid #ccc',
                            borderRadius: '3px',
                            backgroundColor: 'white',
                            fontSize: '12px',
                            minWidth: '80px'
                        }}
                    >
                        <option value="bar">Bar</option>
                        <option value="line">Line</option>
                        <option value="pie">Pie</option>
                    </select>
                </div>

                {/* Export Buttons */}
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={() => handleExport('png')}
                        disabled={isFiltering}
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
                        disabled={isFiltering}
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
                        disabled={isFiltering}
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
                        disabled={isFiltering}
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

            {/* Chart Display */}
            <div style={{
                border: '1px solid #e0e0e0',
                borderRadius: '4px',
                overflow: 'hidden',
                backgroundColor: 'white'
            }}>
                <ReactECharts
                    ref={echartsRef}
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
