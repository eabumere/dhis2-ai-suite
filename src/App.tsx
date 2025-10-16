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
    content: string;
    metadata: {
        type: string;
        item_id: string;
    };
}

const MyApp: FC = () => {
    const { error, loading, data } = useDataQuery<QueryResults>(query)
    const [searchQuery, setSearchQuery] = useState<string>('')
    const [searchResults, setSearchResults] = useState<MetadataResult[]>([])
    const [isLoading, setIsLoading] = useState<boolean>(false)
    const [errorMessage, setErrorMessage] = useState<string>('')

    const handleSearch = async () => {
        if (!searchQuery.trim()) {
            setErrorMessage('Please enter a search query')
            return
        }

        setIsLoading(true)
        setErrorMessage('')
        setSearchResults([])

        try {
            const result = await metadataAgent.invoke({
                messages: [{ role: 'user', content: `Search for metadata containing: ${searchQuery}` }]
            })
            const lastMessage = result.messages[result.messages.length - 1]

            if (lastMessage.content) {
                try {
                    const parsedResults = JSON.parse(lastMessage.content as string)
                    setSearchResults(Array.isArray(parsedResults) ? parsedResults : [])
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

                {searchResults.length > 0 && (
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
                                        {i18n.t('Type')}
                                    </th>
                                    <th style={{
                                        padding: '12px',
                                        textAlign: 'left',
                                        borderBottom: '1px solid #ddd',
                                        fontWeight: 'bold'
                                    }}>
                                        {i18n.t('ID')}
                                    </th>
                                    <th style={{
                                        padding: '12px',
                                        textAlign: 'left',
                                        borderBottom: '1px solid #ddd',
                                        fontWeight: 'bold'
                                    }}>
                                        {i18n.t('Content')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {searchResults.map((result, index) => (
                                    <tr key={index} style={{
                                        backgroundColor: index % 2 === 0 ? 'white' : '#f9f9f9'
                                    }}>
                                        <td style={{
                                            padding: '12px',
                                            borderBottom: '1px solid #eee',
                                            fontFamily: 'monospace',
                                            fontSize: '14px'
                                        }}>
                                            {result.metadata.type}
                                        </td>
                                        <td style={{
                                            padding: '12px',
                                            borderBottom: '1px solid #eee',
                                            fontFamily: 'monospace',
                                            fontSize: '14px'
                                        }}>
                                            {result.metadata.item_id}
                                        </td>
                                        <td style={{
                                            padding: '12px',
                                            borderBottom: '1px solid #eee',
                                            fontFamily: 'monospace',
                                            fontSize: '12px',
                                            maxWidth: '300px',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {result.content}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {searchResults.length === 0 && !isLoading && !errorMessage && searchQuery && (
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
