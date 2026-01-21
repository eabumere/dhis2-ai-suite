import React, { FC } from 'react';

export interface Suggestion {
    id: string;
    title: string;
    description: string;
    action: string;
    priority: 'high' | 'medium' | 'low';
    category?: string;
}

interface SuggestionPanelProps {
    suggestions: Suggestion[];
    onSuggestionSelect: (suggestionId: string, action: string) => void;
    title?: string;
    maxSuggestions?: number;
    showCategories?: boolean;
}

const SuggestionPanel: FC<SuggestionPanelProps> = ({
    suggestions,
    onSuggestionSelect,
    title = "💡 Suggestions",
    maxSuggestions = 5,
    showCategories = false
}) => {
    const getPriorityColor = (priority: Suggestion['priority']) => {
        switch (priority) {
            case 'high':
                return '#d32f2f';
            case 'medium':
                return '#f57c00';
            case 'low':
                return '#388e3c';
            default:
                return '#666';
        }
    };

    const getPriorityIcon = (priority: Suggestion['priority']) => {
        switch (priority) {
            case 'high':
                return '🔴';
            case 'medium':
                return '🟡';
            case 'low':
                return '🟢';
            default:
                return '💡';
        }
    };

    // Group suggestions by category if showCategories is true
    const groupedSuggestions = showCategories
        ? suggestions.reduce((groups, suggestion) => {
            const category = suggestion.category || 'General';
            if (!groups[category]) {
                groups[category] = [];
            }
            groups[category].push(suggestion);
            return groups;
        }, {} as Record<string, Suggestion[]>)
        : { 'All': suggestions };

    // Limit total suggestions displayed
    const limitedSuggestions = Object.values(groupedSuggestions).flat().slice(0, maxSuggestions);

    const renderSuggestion = (suggestion: Suggestion) => (
        <div
            key={suggestion.id}
            style={{
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '8px',
                backgroundColor: 'white',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}
            onClick={() => onSuggestionSelect(suggestion.id, suggestion.action)}
            onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
                e.currentTarget.style.borderColor = '#2196f3';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                e.currentTarget.style.borderColor = '#e0e0e0';
            }}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                {/* Priority Indicator */}
                <div style={{
                    fontSize: '12px',
                    marginTop: '2px',
                    flexShrink: 0
                }}>
                    {getPriorityIcon(suggestion.priority)}
                </div>

                {/* Content */}
                <div style={{ flex: 1 }}>
                    <div style={{
                        fontSize: '14px',
                        fontWeight: 'bold',
                        color: '#333',
                        marginBottom: '4px'
                    }}>
                        {suggestion.title}
                    </div>
                    <div style={{
                        fontSize: '12px',
                        color: '#666',
                        lineHeight: '1.4'
                    }}>
                        {suggestion.description}
                    </div>
                </div>

                {/* Action Arrow */}
                <div style={{
                    fontSize: '14px',
                    color: '#2196f3',
                    flexShrink: 0,
                    marginTop: '2px'
                }}>
                    →
                </div>
            </div>
        </div>
    );

    if (limitedSuggestions.length === 0) {
        return null;
    }

    return (
        <div style={{
            backgroundColor: '#f8f9fa',
            border: '1px solid #e9ecef',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '16px'
        }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '12px'
            }}>
                <span style={{
                    fontSize: '16px',
                    fontWeight: 'bold',
                    color: '#495057'
                }}>
                    {title}
                </span>
                <span style={{
                    fontSize: '12px',
                    color: '#6c757d',
                    backgroundColor: '#e9ecef',
                    padding: '2px 6px',
                    borderRadius: '10px'
                }}>
                    {limitedSuggestions.length}
                </span>
            </div>

            <div>
                {showCategories ? (
                    // Grouped by category
                    Object.entries(groupedSuggestions).map(([category, categorySuggestions]) => {
                        const limitedCategorySuggestions = categorySuggestions.slice(0, maxSuggestions);
                        if (limitedCategorySuggestions.length === 0) return null;

                        return (
                            <div key={category} style={{ marginBottom: '16px' }}>
                                <h5 style={{
                                    margin: '0 0 8px 0',
                                    fontSize: '12px',
                                    color: '#6c757d',
                                    textTransform: 'uppercase',
                                    fontWeight: 'bold',
                                    letterSpacing: '0.5px'
                                }}>
                                    {category}
                                </h5>
                                {limitedCategorySuggestions.map(renderSuggestion)}
                            </div>
                        );
                    })
                ) : (
                    // Flat list
                    limitedSuggestions.map(renderSuggestion)
                )}
            </div>

            {/* Show more indicator */}
            {suggestions.length > maxSuggestions && (
                <div style={{
                    textAlign: 'center',
                    padding: '8px',
                    fontSize: '12px',
                    color: '#6c757d',
                    borderTop: '1px solid #e9ecef',
                    marginTop: '8px'
                }}>
                    And {suggestions.length - maxSuggestions} more suggestions available
                </div>
            )}
        </div>
    );
};

export default SuggestionPanel;
