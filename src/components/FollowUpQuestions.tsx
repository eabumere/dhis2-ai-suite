import React, { useState } from 'react';
import { routerAgent } from '../agents/router-agent';

interface FollowUpQuestionsProps {
    chartId?: string;
    chartContext?: any;
    onNewQuestion?: (question: string, response: any) => void;
}

interface FollowUpEntry {
    id: string;
    question: string;
    response: any;
    timestamp: number;
    isProcessing?: boolean;
}

export const FollowUpQuestions: React.FC<FollowUpQuestionsProps> = ({
    chartId,
    chartContext,
    onNewQuestion
}) => {
    const [followUpQuestion, setFollowUpQuestion] = useState<string>('');
    const [questionHistory, setQuestionHistory] = useState<FollowUpEntry[]>([]);
    const [isProcessingQuestion, setIsProcessingQuestion] = useState(false);

    const generateQuestionId = () => `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const handleFollowUpQuestion = async () => {
        if (!followUpQuestion.trim()) return;

        const questionId = generateQuestionId();
        const question = followUpQuestion.trim();

        // Add to history as processing
        const processingEntry: FollowUpEntry = {
            id: questionId,
            question,
            response: null,
            timestamp: Date.now(),
            isProcessing: true
        };

        setQuestionHistory(prev => [...prev, processingEntry]);
        setIsProcessingQuestion(true);
        setFollowUpQuestion('');

        try {
            // Create context-aware follow-up query
            let followUpQuery = question;

            if (chartId) {
                followUpQuery = `About the chart "${chartId}": ${question}`;
            }

            const result = await routerAgent.invoke({
                messages: [{ role: 'user', content: followUpQuery }]
            });

            const lastMessage = result.messages[result.messages.length - 1];
            let response;

            try {
                response = JSON.parse(lastMessage.content as string);
            } catch (parseError) {
                response = {
                    success: false,
                    message: 'Received non-JSON response',
                    rawResponse: lastMessage.content
                };
            }

            // Update the processing entry with the actual response
            const completedEntry: FollowUpEntry = {
                id: questionId,
                question,
                response,
                timestamp: Date.now(),
                isProcessing: false
            };

            setQuestionHistory(prev =>
                prev.map(entry =>
                    entry.id === questionId ? completedEntry : entry
                )
            );

            onNewQuestion?.(question, response);
        } catch (error) {
            console.error('Error processing follow-up question:', error);

            const errorEntry: FollowUpEntry = {
                id: questionId,
                question,
                response: {
                    success: false,
                    error: `Failed to process question: ${error.message}`
                },
                timestamp: Date.now(),
                isProcessing: false
            };

            setQuestionHistory(prev =>
                prev.map(entry =>
                    entry.id === questionId ? errorEntry : entry
                )
            );
        } finally {
            setIsProcessingQuestion(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleFollowUpQuestion();
        }
    };

    const renderResponse = (response: any) => {
        if (!response) return null;

        if (response.success === false) {
            return (
                <div style={{
                    backgroundColor: '#ffebee',
                    border: '1px solid #ef5350',
                    borderRadius: '4px',
                    padding: '10px',
                    color: '#c62828'
                }}>
                    <strong>Error:</strong> {response.error || response.message}
                    {response.rawResponse && (
                        <div style={{ marginTop: '8px', fontSize: '12px' }}>
                            <strong>Raw Response:</strong>
                            <div style={{
                                whiteSpace: 'pre-wrap',
                                backgroundColor: '#f8f9fa',
                                padding: '6px',
                                borderRadius: '3px',
                                maxHeight: '100px',
                                overflow: 'auto',
                                marginTop: '4px'
                            }}>
                                {response.rawResponse}
                            </div>
                        </div>
                    )}
                </div>
            );
        }

        return (
            <div style={{
                backgroundColor: '#e8f5e8',
                border: '1px solid #4CAF50',
                borderRadius: '4px',
                padding: '10px'
            }}>
                {/* Analytics Chart Response */}
                {response.chart_id && response.echarts_option && (
                    <div>
                        <h5 style={{ color: '#2E7D32', marginBottom: '10px' }}>
                            New Chart Generated
                        </h5>
                        <div style={{
                            fontSize: '12px',
                            color: '#666',
                            marginBottom: '8px'
                        }}>
                            Chart ID: {response.chart_id} | Type: {response.chart_type}
                        </div>
                    </div>
                )}

                {/* Data Response */}
                {response.data && (
                    <div>
                        <h5 style={{ color: '#2E7D32', marginBottom: '10px' }}>
                            Data Results
                        </h5>
                        <div style={{
                            fontFamily: 'monospace',
                            fontSize: '12px',
                            backgroundColor: '#f5f5f5',
                            padding: '8px',
                            borderRadius: '3px'
                        }}>
                            {typeof response.data === 'string' ? response.data :
                             JSON.stringify(response.data, null, 2)}
                        </div>
                    </div>
                )}

                {/* Search Results */}
                {response.results && (
                    <div>
                        <h5 style={{ color: '#2E7D32', marginBottom: '10px' }}>
                            Search Results
                        </h5>
                        <div style={{
                            maxHeight: '150px',
                            overflow: 'auto',
                            backgroundColor: '#f8f9fa',
                            borderRadius: '3px',
                            padding: '8px'
                        }}>
                            {Object.entries(response.results).map(([type, items]) => (
                                <div key={type} style={{ marginBottom: '10px' }}>
                                    <strong>{type}:</strong> {Array.isArray(items) ? items.length : 0} items
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* General Message */}
                {response.message && !response.chart_id && !response.data && !response.results && (
                    <div>
                        <strong>Response:</strong> {response.message}
                    </div>
                )}

                {/* Count Information */}
                {response.count !== undefined && (
                    <div style={{ marginTop: '8px' }}>
                        <strong>Total Results:</strong> {response.count}
                    </div>
                )}

                {/* General successful response - display all remaining key-value pairs */}
                {response.success !== false && !response.chart_id && !response.data && !response.results && !response.message && response.count === undefined && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {Object.entries(response).map(([key, value]) => (
                            <div key={key} style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '13px',
                                padding: '4px 0',
                                borderBottom: '1px solid #f0f0f0'
                            }}>
                                <span style={{
                                    fontWeight: 'bold',
                                    color: '#2E7D32',
                                    textTransform: 'capitalize',
                                    marginRight: '15px'
                                }}>
                                    {key.replace(/[_]/g, ' ')}:
                                </span>
                                <span style={{
                                    textAlign: 'right',
                                    fontFamily: typeof value === 'number' ? 'monospace' : 'inherit'
                                }}>
                                    {typeof value === 'string' ? value :
                                     typeof value === 'number' ? value.toLocaleString() :
                                     Array.isArray(value) ? `[${value.length} items]` :
                                     JSON.stringify(value)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div style={{
            marginTop: '20px',
            padding: '15px',
            backgroundColor: '#f8f9fa',
            borderRadius: '4px',
            border: '1px solid #e0e0e0'
        }}>
            <h4 style={{ margin: '0 0 15px 0', color: '#2c6693' }}>
                Ask Follow-up Questions
            </h4>

            {/* Follow-up Question Input */}
            <div style={{ marginBottom: '15px' }}>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <textarea
                        value={followUpQuestion}
                        onChange={(e) => setFollowUpQuestion(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Ask a follow-up question about this chart or data..."
                        disabled={isProcessingQuestion}
                        style={{
                            flex: 1,
                            padding: '8px',
                            fontSize: '14px',
                            border: '1px solid #ccc',
                            borderRadius: '3px',
                            resize: 'vertical',
                            minHeight: '36px',
                            outline: 'none'
                        }}
                        rows={2}
                    />
                    <button
                        onClick={handleFollowUpQuestion}
                        disabled={isProcessingQuestion || !followUpQuestion.trim()}
                        style={{
                            padding: '8px 16px',
                            fontSize: '14px',
                            backgroundColor: '#2c6693',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: isProcessingQuestion || !followUpQuestion.trim() ? 'not-allowed' : 'pointer',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {isProcessingQuestion ? 'Asking...' : 'Ask'}
                    </button>
                </div>

                {/* Context Hint */}
                <div style={{
                    marginTop: '8px',
                    fontSize: '12px',
                    color: '#666'
                }}>
                    You can ask about filtering data, calculating totals, comparing values, or generating new visualizations.
                </div>
            </div>

            {/* Question History */}
            {questionHistory.length > 0 && (
                <div>
                    <h5 style={{
                        marginBottom: '10px',
                        color: '#2c6693',
                        borderBottom: '1px solid #e0e0e0',
                        paddingBottom: '5px'
                    }}>
                        Follow-up Conversation
                    </h5>

                    <div style={{
                        maxHeight: '400px',
                        overflow: 'auto',
                        backgroundColor: 'white',
                        borderRadius: '4px',
                        border: '1px solid #ddd'
                    }}>
                        {questionHistory.map((entry) => (
                            <div
                                key={entry.id}
                                style={{
                                    padding: '15px',
                                    borderBottom: '1px solid #eee',
                                    backgroundColor: entry.isProcessing ? '#f8f9fa' : 'white'
                                }}
                            >
                                {/* Question */}
                                <div style={{
                                    marginBottom: '10px',
                                    fontWeight: 'bold',
                                    color: '#2c6693'
                                }}>
                                    Q: {entry.question}
                                </div>

                                {/* Response */}
                                {entry.isProcessing ? (
                                    <div style={{
                                        padding: '10px',
                                        backgroundColor: '#fff3cd',
                                        border: '1px solid #ffeaa7',
                                        borderRadius: '3px',
                                        color: '#856404'
                                    }}>
                                        Analyzing your question...
                                    </div>
                                ) : (
                                    <div>
                                        <div style={{
                                            fontSize: '12px',
                                            color: '#666',
                                            marginBottom: '8px',
                                            fontWeight: 'bold'
                                        }}>
                                            A:
                                        </div>
                                        {renderResponse(entry.response)}
                                    </div>
                                )}

                                {/* Timestamp */}
                                <div style={{
                                    fontSize: '11px',
                                    color: '#999',
                                    marginTop: '8px'
                                }}>
                                    {new Date(entry.timestamp).toLocaleTimeString()}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default FollowUpQuestions;
