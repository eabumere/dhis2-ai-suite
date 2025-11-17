import React from 'react';
import Plot from 'react-plotly.js';

const MyApp: React.FC = () => {
    // Mock data for the Plotly chart
    const data = [
        {
            x: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            y: [5, 20, 36, 10, 10, 20],
            type: 'scatter',
            mode: 'lines+markers',
            marker: {color: 'red'},
            name: 'Sales Trend'
        },
        {
            x: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            y: [2, 13, 30, 8, 15, 18],
            type: 'bar',
            name: 'Monthly Sales',
            marker: {color: 'blue'}
        }
    ];

    const layout = {
        title: 'Simple Plotly.js Chart Demo',
        xaxis: {title: 'Month'},
        yaxis: {title: 'Value'},
        showlegend: true
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
