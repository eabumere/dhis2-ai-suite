import React, { FC } from 'react';
import { ConversationMessage } from '../utils/workflow-orchestrator';
import MessageRenderer from './MessageRenderer';
import AnalyticsChart from './AnalyticsChart';

interface MessageContainerProps {
    messages: ConversationMessage[];
    className?: string;
}

const MessageContainer: FC<MessageContainerProps> = ({ messages, className = '' }) => {
    return (
        <div className={`message-container ${className}`} style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            padding: '16px',
            height: 'calc(100vh - 200px)', // Adjust based on input area height
            overflowY: 'auto',
            backgroundColor: '#f8f9fa'
        }}>
            {messages.length === 0 ? (
                <div style={{
                    textAlign: 'center',
                    color: '#666',
                    fontStyle: 'italic',
                    padding: '40px'
                }}>
                    No conversation history yet. Start by entering a query below.
                </div>
            ) : (
                messages.map((message) => (
                    <MessageRenderer key={message.id} message={message} />
                ))
            )}
        </div>
    );
};

export default MessageContainer;
