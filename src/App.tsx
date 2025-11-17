import React, { useState } from 'react';
import Plot from 'react-plotly.js';

const MyApp: React.FC = () => {
    const [chartType, setChartType] = useState<string>('combined');

    const getChartData = () => {
        const baseData = [
            {
                x: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                y: [5, 20, 36, 10, 10, 20],
                type: 'scatter' as const,
                mode: 'lines+markers' as const,
                marker: {color: 'red'},
                name: 'Sales Trend'
            },
            {
                x: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                y: [2, 13, 30, 8, 15, 18],
                type: 'bar' as const,
                name: 'Monthly Sales',
                marker: {color: 'blue'}
            }
        ];

        switch (chartType) {
            case 'line':
                return [baseData[0]];
            case 'bar':
                return [baseData[1]];
            default:
                return baseData;
        }
    };

    const data = getChartData();

    const layout = {
        title: 'Simple Plotly.js Chart Demo',
        xaxis: {title: 'Month'},
        yaxis: {title: 'Value'},
        showlegend: chartType === 'combined'
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
                <Plot
                    data={data}
                    layout={layout}
                    style={{
                        width: '800px',
                        height: '500px'
                    }}
                />
            </div>
        </div>
    );
};

export default MyApp;
