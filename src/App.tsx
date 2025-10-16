import { useDataQuery } from '@dhis2/app-runtime'
import i18n from '@dhis2/d2-i18n'
import React, { FC, useState } from 'react'
import classes from './App.module.css'
import { metadataAgent } from './agent'

interface QueryResults {
    me: {
        name: string
    }
}

const query = {
    me: {
        resource: 'me',
    },
}

interface MetadataResult {
    [key: string]: any[];
}

const MyApp: FC = () => {
    const { error, loading, data } = useDataQuery<QueryResults>(query)
    const [searchQuery, setSearchQuery] = useState<string>('')
    const [searchResults, setSearchResults] = useState<MetadataResult | null>(null)
    const [isLoading, setIsLoading] = useState<boolean>(false)
    const [errorMessage, setErrorMessage] = useState<string>('')

    // Function to parse natural language response from LLM
    const parseNaturalLanguageResponse = (content: string): MetadataResult => {
        const results: MetadataResult = {};

        // Split by numbered items (1., 2., etc.)
        const itemMatches = content.match(/\d+\.\s+[^\n]+/g);

        if (itemMatches) {
            itemMatches.forEach(item => {
                // Extract name (everything after the number and period)
                const nameMatch = item.match(/\d+\.\s+(.+)/);
                const name = nameMatch ? nameMatch[1].trim() : '';

                // Look for Type and ID in the following lines
                const lines = content.split('\n');
                const itemIndex = lines.findIndex(line => line.includes(item.trim()));

                if (itemIndex !== -1) {
                    // Get next few lines to find Type and ID
                    for (let i = itemIndex + 1; i < Math.min(itemIndex + 4, lines.length); i++) {
                        const line = lines[i].trim();

                        if (line.includes('- Type:')) {
                            const type = line.replace('- Type:', '').trim();
                            // Initialize array for this type if it doesn't exist
                            if (!results[type]) {
                                results[type] = [];
                            }

                            // Look for ID in next line
                            if (i + 1 < lines.length) {
                                const nextLine = lines[i + 1].trim();
                                if (nextLine.includes('- ID:')) {
                                    const id = nextLine.replace('- ID:', '').trim();

                                    // Add item to results
                                    results[type].push({
                                        id: id,
                                        name: name,
                                        code: '' // Natural language response doesn't include code
                                    });
                                }
                            }
                            break;
                        }
                    }
                }
            });
        }

        return results;
    }

    const handleSearch = async () => {
        if (!searchQuery.trim()) {
            setErrorMessage('Please enter a search query')
            return
        }

        setIsLoading(true)
        setErrorMessage('')
        setSearchResults(null)

        try {
            const result = await metadataAgent.invoke({
                messages: [{ role: 'user', content: `Search for metadata containing: ${searchQuery}` }]
            })
            const lastMessage = result.messages[result.messages.length - 1]

            if (lastMessage.content) {
                try {
                    const content = lastMessage.content as string

                    // Check if it's a natural language response (contains phrases like "I found")
                    if (content.includes('I found') && content.includes('metadata items')) {
                        // Parse natural language response
                        const parsedResults = parseNaturalLanguageResponse(content)
                        setSearchResults(parsedResults)
                    } else {
                        // Try to parse as JSON (structured response)
                        try {
                            const parsedResults = JSON.parse(content)
                            // Handle grouped object structure (like the sample response)
                            if (typeof parsedResults === 'object' && parsedResults !== null && !Array.isArray(parsedResults)) {
                                setSearchResults(parsedResults)
                            } else {
                                // If it's an array or other format, wrap it in a generic structure
                                setSearchResults({ results: Array.isArray(parsedResults) ? parsedResults : [] })
                            }
                        } catch (jsonError) {
                            // If JSON parsing fails, display the raw content in a simple format
                            console.log('Content is not JSON, displaying as raw text:', content)
                            setSearchResults({
                                'Search Results': [{
                                    id: 'raw-content',
                                    name: 'Raw Search Results',
                                    code: '',
                                    rawContent: content
                                }]
                            })
                        }
                    }
                } catch (parseError) {
                    console.error('Error parsing search results:', parseError)
                    setErrorMessage('Error parsing search results')
                }
            }
        } catch (error) {
            console.error('Error searching metadata:', error)
            setErrorMessage(`Error searching metadata: ${error.message}`)
        } finally {
            setIsLoading(false)
        }
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSearch()
        }
    }

    if (error) {
        return <span>{i18n.t('ERROR')}</span>
    }

    if (loading) {
        return <span>{i18n.t('Loading...')}</span>
    }

    return (
        <div className={classes.container}>
            <h1>{i18n.t('Hello {{name}}', { name: data?.me?.name })}</h1>
            <h3>{i18n.t('DHIS2 Metadata Search')}</h3>

            <div style={{ marginTop: '20px', maxWidth: '600px', width: '100%' }}>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder={i18n.t('Enter metadata search query...')}
                        disabled={isLoading}
                        style={{
                            flex: 1,
                            padding: '10px',
                            fontSize: '16px',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            outline: 'none'
                        }}
                    />
                    <button
                        onClick={handleSearch}
                        disabled={isLoading}
                        style={{
                            padding: '10px 20px',
                            fontSize: '16px',
                            backgroundColor: '#2c6693',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {isLoading ? i18n.t('Searching...') : i18n.t('Search')}
                    </button>
                </div>

                {errorMessage && (
                    <div style={{
                        padding: '10px',
                        backgroundColor: '#ffebee',
                        color: '#c62828',
                        borderRadius: '4px',
                        border: '1px solid #ef5350',
                        marginBottom: '10px'
                    }}>
                        {errorMessage}
                    </div>
                )}

                {searchResults && (
                    <div style={{ marginTop: '20px' }}>
                        {Object.entries(searchResults).map(([type, items]) => {
                            if (!Array.isArray(items) || items.length === 0) return null;

                            return (
                                <div key={type} style={{ marginBottom: '30px' }}>
                                    <h4 style={{
                                        marginBottom: '10px',
                                        color: '#2c6693',
                                        textTransform: 'capitalize',
                                        borderBottom: '2px solid #e0e0e0',
                                        paddingBottom: '5px'
                                    }}>
                                        {type.replace(/([A-Z])/g, ' $1').trim()}
                                    </h4>
                                    <div style={{
                                        border: '1px solid #ddd',
                                        borderRadius: '4px',
                                        overflow: 'hidden'
                                    }}>
                                        <table style={{
                                            width: '100%',
                                            borderCollapse: 'collapse'
                                        }}>
                                            <thead>
                                                <tr style={{ backgroundColor: '#f5f5f5' }}>
                                                    <th style={{
                                                        padding: '12px',
                                                        textAlign: 'left',
                                                        borderBottom: '1px solid #ddd',
                                                        fontWeight: 'bold'
                                                    }}>
                                                        Name
                                                    </th>
                                                    <th style={{
                                                        padding: '12px',
                                                        textAlign: 'left',
                                                        borderBottom: '1px solid #ddd',
                                                        fontWeight: 'bold'
                                                    }}>
                                                        Code
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {items.map((item, index) => (
                                                    <tr key={item.id || index} style={{
                                                        backgroundColor: index % 2 === 0 ? 'white' : '#f9f9f9'
                                                    }}>
                                                        <td style={{
                                                            padding: '12px',
                                                            borderBottom: '1px solid #eee',
                                                            fontSize: '14px'
                                                        }}>
                                                            {item.rawContent ? (
                                                                <div>
                                                                    <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                                                                        {item.name || 'Search Results'}
                                                                    </div>
                                                                    <div style={{
                                                                        fontSize: '12px',
                                                                        color: '#666',
                                                                        maxHeight: '100px',
                                                                        overflow: 'auto',
                                                                        whiteSpace: 'pre-wrap',
                                                                        backgroundColor: '#f8f9fa',
                                                                        padding: '8px',
                                                                        borderRadius: '4px'
                                                                    }}>
                                                                        {item.rawContent}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                item.name || ''
                                                            )}
                                                        </td>
                                                        <td style={{
                                                            padding: '12px',
                                                            borderBottom: '1px solid #eee',
                                                            fontFamily: 'monospace',
                                                            fontSize: '14px'
                                                        }}>
                                                            {item.code || ''}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {searchResults && Object.keys(searchResults).length === 0 && !isLoading && !errorMessage && searchQuery && (
                    <div style={{
                        padding: '20px',
                        textAlign: 'center',
                        color: '#666',
                        fontStyle: 'italic'
                    }}>
                        {i18n.t('No results found for "{{query}}"', { query: searchQuery })}
                    </div>
                )}
            </div>
        </div>
    )
}

export default MyApp
