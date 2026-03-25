import React, { FC, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { ConversationMessage } from '../utils/workflow-orchestrator';
import MessageRenderer, { ThreadedMessageRenderer } from './MessageRenderer';

interface MessageContainerProps {
    messages: ConversationMessage[];
    className?: string;
}

// Virtual scrolling configuration
const ITEM_HEIGHT = 120; // Estimated height per message
const BUFFER_SIZE = 5; // Extra items to render above/below viewport
const CONTAINER_HEIGHT = 400; // Minimum container height

const MessageContainer: FC<MessageContainerProps> = ({ messages, className = '' }) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(CONTAINER_HEIGHT);

    // Use virtual scrolling for large message lists (>50 messages)
    const useVirtualScrolling = messages.length > 50;

    // Calculate visible range for virtual scrolling
    const visibleRange = useMemo(() => {
        if (!useVirtualScrolling) return { start: 0, end: messages.length };

        const start = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER_SIZE);
        const visibleCount = Math.ceil(containerHeight / ITEM_HEIGHT);
        const end = Math.min(messages.length, start + visibleCount + BUFFER_SIZE * 2);

        return { start, end };
    }, [scrollTop, containerHeight, messages.length, useVirtualScrolling]);

    // Get visible messages for virtual scrolling
    const visibleMessages = useMemo(() => {
        if (!useVirtualScrolling) return messages;
        return messages.slice(visibleRange.start, visibleRange.end);
    }, [messages, visibleRange, useVirtualScrolling]);

    // Handle scroll events
    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const newScrollTop = e.currentTarget.scrollTop;
        setScrollTop(newScrollTop);

        // Update container height if it changed
        const newHeight = e.currentTarget.clientHeight;
        if (newHeight !== containerHeight) {
            setContainerHeight(newHeight);
        }
    }, [containerHeight]);

    // Auto-scroll to bottom when new messages are added (only for small lists)
    useEffect(() => {
        if (scrollRef.current && !useVirtualScrolling) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, useVirtualScrolling]);

    return (
        <div
            ref={scrollRef}
            className={`message-container ${className}`}
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-4)',
                padding: 'var(--space-4) var(--space-6)',
                height: '100%', // Fill available container height
                overflowY: 'auto',
                backgroundColor: 'var(--color-bg-secondary)',
                scrollBehavior: 'smooth', // Smooth scrolling transitions
                scrollbarWidth: 'thin', // Firefox
                scrollbarColor: 'var(--color-border-medium) transparent'
            }}
            onScroll={useVirtualScrolling ? handleScroll : undefined}
        >
            {messages.length === 0 ? (
                <div style={{
                    textAlign: 'center',
                    color: 'var(--color-text-muted)',
                    fontStyle: 'italic',
                    padding: 'var(--space-16)',
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 'var(--space-4)'
                }}>
                    <div style={{
                        fontSize: 'var(--font-size-4xl)',
                        opacity: 0.5
                    }}>
                        💬
                    </div>
                    <div style={{
                        fontSize: 'var(--font-size-lg)',
                        fontWeight: 'var(--font-weight-medium)',
                        color: 'var(--color-text-secondary)'
                    }}>
                        No conversation history yet
                    </div>
                    <div style={{
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--color-text-muted)',
                        maxWidth: '400px',
                        lineHeight: 'var(--line-height-relaxed)'
                    }}>
                        Start by entering a query below. Try asking about DHIS2 data, uploading files, or exploring analytics.
                    </div>
                </div>
            ) : (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: '100%',
                    position: 'relative'
                }}>
                    {useVirtualScrolling ? (
                        // Virtual scrolling container
                        <div style={{
                            height: messages.length * ITEM_HEIGHT,
                            position: 'relative'
                        }}>
                            <div style={{
                                transform: `translateY(${visibleRange.start * ITEM_HEIGHT}px)`,
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0
                            }}>
                                {visibleMessages.map((message, index) => (
                                    <div
                                        key={message.id}
                                        style={{
                                            height: ITEM_HEIGHT,
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            marginBottom: 'var(--space-2)'
                                        }}
                                    >
                                        <MessageRenderer message={message} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        // Regular rendering for smaller lists
                        <ThreadedMessageRenderer messages={messages} />
                    )}

                    {/* Virtual scrolling indicator */}
                    {useVirtualScrolling && (
                        <div style={{
                            position: 'fixed',
                            top: '20px',
                            right: '20px',
                            backgroundColor: 'var(--color-bg-primary)',
                            border: '1px solid var(--color-border-light)',
                            borderRadius: 'var(--radius-md)',
                            padding: 'var(--space-2) var(--space-3)',
                            fontSize: 'var(--font-size-xs)',
                            color: 'var(--color-text-secondary)',
                            boxShadow: 'var(--shadow-sm)',
                            zIndex: 10
                        }}>
                            Virtual scrolling active ({messages.length} messages)
                        </div>
                    )}
                </div>
            )}

            {/* Scroll to bottom indicator */}
            {messages.length > 3 && (
                <button
                    onClick={() => {
                        if (useVirtualScrolling) {
                            setScrollTop(messages.length * ITEM_HEIGHT);
                            scrollRef.current?.scrollTo({ top: messages.length * ITEM_HEIGHT, behavior: 'smooth' });
                        } else {
                            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
                        }
                    }}
                    style={{
                        position: 'absolute',
                        bottom: '100px',
                        right: '20px',
                        backgroundColor: 'var(--color-primary)',
                        color: 'var(--color-text-inverse)',
                        border: 'none',
                        borderRadius: 'var(--radius-full)',
                        width: '40px',
                        height: '40px',
                        cursor: 'pointer',
                        boxShadow: 'var(--shadow-md)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 'var(--font-size-lg)',
                        transition: 'var(--transition-fast)',
                        zIndex: 5
                    }}
                    title="Scroll to bottom"
                    className="hover-lift"
                >
                    ↓
                </button>
            )}
        </div>
    );
};

export default MessageContainer;
