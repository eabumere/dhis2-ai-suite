import React, { FC, useEffect, useRef } from 'react';
import { ConversationMessage } from '../utils/workflow-orchestrator';
import MessageRenderer, { ThreadedMessageRenderer } from './MessageRenderer';

interface MessageContainerProps {
    messages: ConversationMessage[];
    className?: string;
}

const MessageContainer: FC<MessageContainerProps> = ({ messages, className = '' }) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new messages are added
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    return (
        <div
            ref={scrollRef}
            className={`message-container ${className}`}
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                padding: '16px',
                height: '100%', // Fill available container height
                overflowY: 'auto',
                backgroundColor: '#f8f9fa',
                scrollBehavior: 'smooth' // Smooth scrolling transitions
            }}
        >
            {messages.length === 0 ? (
                <div style={{
                    textAlign: 'center',
                    color: '#666',
                    fontStyle: 'italic',
                    padding: '40px',
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    No conversation history yet. Start by entering a query below.
                </div>
            ) : (
                <ThreadedMessageRenderer messages={messages} />
            )}
        </div>
    );
};

export default MessageContainer;
