import React, { useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import { routerAgent } from '../agents/router-agent';
import FollowUpQuestions from './FollowUpQuestions';

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
        if (!chartId || !values.length) return;

        const newFilters = { ...filters, [filterType]: values };
        setFilters(newFilters);
        setIsFiltering(true);

        try {
            // Call filter analytics chart tool
            const filterQuery = `Filter chart ${chartId} by ${filterType}: ${values.join(', ')}`;
            const result = await routerAgent.invoke({
                messages: [{ role: 'user', content: filterQuery }]
            });

            const lastMessage = result.messages[result.messages.length - 1];
            const response = JSON.parse(lastMessage.content as string);

            if (response.success && response.echarts_option) {
                setEchartsOption(response.echarts_option);
            }

            onFilter?.(newFilters);
        } catch (error) {
            console.error('Error filtering chart:', error);
        } finally {
            setIsFiltering(false);
        }
    };

    const handleExport = async (format: string) => {
        if (!chartId) return;

        try {
            const exportQuery = `Export chart ${chartId} as ${format}`;
            const result = await routerAgent.invoke({
                messages: [{ role: 'user', content: exportQuery }]
            });

            const lastMessage = result.messages[result.messages.length - 1];
            const response = JSON.parse(lastMessage.content as string);

            if (response.success) {
                // Handle download logic here
                if (response.data) {
                    downloadFile(response.data, response.filename || `chart.${format}`, format);
                }
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

            {/* Follow-up Questions */}
            <FollowUpQuestions
                chartId={chartId}
                chartContext={chartData}
                onNewQuestion={(question, response) => {
                    console.log('Follow-up question asked:', question, response);
                }}
            />
        </div>
    );
};

export default AnalyticsChart;
