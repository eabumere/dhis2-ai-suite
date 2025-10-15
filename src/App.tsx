import { useDataQuery } from '@dhis2/app-runtime'
import i18n from '@dhis2/d2-i18n'
import React, { FC, useState } from 'react'
import classes from './App.module.css'
import { dateAgent } from './agent'

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

const MyApp: FC = () => {
    const { error, loading, data } = useDataQuery<QueryResults>(query)
    const [dateResult, setDateResult] = useState<string>('')
    const [isLoading, setIsLoading] = useState<boolean>(false)

    const handleGetDate = async () => {
        setIsLoading(true)
        try {
            const result = await dateAgent.invoke({
                messages: [{ role: 'user', content: 'What is today\'s date?' }]
            })
            const lastMessage = result.messages[result.messages.length - 1]
            setDateResult(lastMessage.content as string)
        } catch (error) {
            console.error('Error getting date:', error)
            setDateResult('Error retrieving date')
        } finally {
            setIsLoading(false)
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
            <h3>{i18n.t('Welcome to DHIS2 with TypeScript!')}</h3>

            <div style={{ marginTop: '20px' }}>
                <button
                    onClick={handleGetDate}
                    disabled={isLoading}
                    style={{
                        padding: '10px 20px',
                        fontSize: '16px',
                        backgroundColor: '#2c6693',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: isLoading ? 'not-allowed' : 'pointer'
                    }}
                >
                    {isLoading ? i18n.t('Getting Date...') : i18n.t('Get Today\'s Date')}
                </button>

                {dateResult && (
                    <div style={{
                        marginTop: '10px',
                        padding: '10px',
                        backgroundColor: '#f5f5f5',
                        borderRadius: '4px',
                        border: '1px solid #ddd'
                    }}>
                        <label style={{ fontWeight: 'bold' }}>
                            {i18n.t('Today\'s Date:')}
                        </label>
                        <p style={{ margin: '5px 0 0 0' }}>{dateResult}</p>
                    </div>
                )}
            </div>
        </div>
    )
}

export default MyApp
