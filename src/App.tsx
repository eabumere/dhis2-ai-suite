import React, { useState } from 'react';
import ReactECharts from 'echarts-for-react';

const MyApp: React.FC = () => {
    const [chartType, setChartType] = useState<string>('combined');

    const getChartSeries = () => {
        const baseSeries = [
            {
                name: 'Sales Trend',
                type: 'line' as const,
                data: [5, 20, 36, 10, 10, 20],
                itemStyle: {
                    color: 'red'
                },
                symbol: 'circle',
                symbolSize: 6
            },
            {
                name: 'Monthly Sales',
                type: 'bar' as const,
                data: [2, 13, 30, 8, 15, 18],
                itemStyle: {
                    color: 'blue'
                }
            }
        ];

        switch (chartType) {
            case 'line':
                return [baseSeries[0]];
            case 'bar':
                return [baseSeries[1]];
            default:
                return baseSeries;
        }
    };

    const option = {
        title: {
            text: 'Simple ECharts Chart Demo',
            left: 'center'
        },
        tooltip: {
            trigger: 'axis'
        },
        legend: {
            data: chartType === 'line' ? ['Sales Trend'] :
                  chartType === 'bar' ? ['Monthly Sales'] :
                  ['Sales Trend', 'Monthly Sales'],
            top: '10%'
        },
        xAxis: {
            type: 'category',
            data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            name: 'Month'
        },
        yAxis: {
            type: 'value',
            name: 'Value'
        },
        series: getChartSeries()
    };

    return (
        <div style={{
            width: '100vw',
            height: '100vh',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: '#f5f5f5'
        }}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '8px',
                boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
                padding: '20px'
            }}>
                <div style={{
                    marginBottom: '20px',
                    display: 'flex',
                    justifyContent: 'center'
                }}>
                    <select
                        value={chartType}
                        onChange={(e) => setChartType(e.target.value)}
                        style={{
                            padding: '8px 12px',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            fontSize: '14px',
                            backgroundColor: 'white',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="combined">Combined Chart</option>
                        <option value="line">Line Chart</option>
                        <option value="bar">Bar Chart</option>
                    </select>
                </div>
                <ReactECharts
                    option={option}
                    notMerge={true}
                    style={{
                        height: '500px',
                        width: '800px'
                    }}
                />
            </div>
        </div>
    );
};

export default MyApp;
