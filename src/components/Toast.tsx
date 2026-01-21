import React, { FC, useEffect, useState } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';
export type ToastPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';

interface ToastProps {
    id: string;
    type: ToastType;
    title?: string;
    message: string;
    duration?: number;
    position?: ToastPosition;
    onClose: (id: string) => void;
    className?: string;
}

const Toast: FC<ToastProps> = ({
    id,
    type,
    title,
    message,
    duration = 4000,
    position = 'top-right',
    onClose,
    className = ''
}) => {
    const [isVisible, setIsVisible] = useState(false);
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        // Trigger enter animation
        setTimeout(() => setIsVisible(true), 10);

        // Auto-hide timer
        if (duration > 0) {
            const timer = setTimeout(() => {
                handleClose();
            }, duration);
            return () => clearTimeout(timer);
        }
    }, [duration]);

    const handleClose = () => {
        setIsExiting(true);
        setTimeout(() => {
            onClose(id);
        }, 300); // Match animation duration
    };

    const getIcon = (type: ToastType) => {
        switch (type) {
            case 'success':
                return '✓';
            case 'error':
                return '✕';
            case 'warning':
                return '⚠';
            case 'info':
                return 'ℹ';
            default:
                return 'ℹ';
        }
    };

    const getColors = (type: ToastType) => {
        switch (type) {
            case 'success':
                return {
                    bg: '#e8f5e8',
                    border: '#4caf50',
                    iconBg: '#4caf50',
                    text: '#2e7d32'
                };
            case 'error':
                return {
                    bg: '#ffebee',
                    border: '#f44336',
                    iconBg: '#f44336',
                    text: '#c62828'
                };
            case 'warning':
                return {
                    bg: '#fff3e0',
                    border: '#ff9800',
                    iconBg: '#ff9800',
                    text: '#ef6c00'
                };
            case 'info':
                return {
                    bg: '#e3f2fd',
                    border: '#2196f3',
                    iconBg: '#2196f3',
                    text: '#1565c0'
                };
            default:
                return {
                    bg: '#e3f2fd',
                    border: '#2196f3',
                    iconBg: '#2196f3',
                    text: '#1565c0'
                };
        }
    };

    const colors = getColors(type);
    const icon = getIcon(type);

    const getPositionStyles = (position: ToastPosition) => {
        const base = {
            position: 'fixed' as const,
            zIndex: 9999,
            maxWidth: '400px',
            minWidth: '300px'
        };

        switch (position) {
            case 'top-right':
                return { ...base, top: '20px', right: '20px' };
            case 'top-left':
                return { ...base, top: '20px', left: '20px' };
            case 'bottom-right':
                return { ...base, bottom: '20px', right: '20px' };
            case 'bottom-left':
                return { ...base, bottom: '20px', left: '20px' };
            case 'top-center':
                return { ...base, top: '20px', left: '50%', transform: 'translateX(-50%)' };
            case 'bottom-center':
                return { ...base, bottom: '20px', left: '50%', transform: 'translateX(-50%)' };
            default:
                return { ...base, top: '20px', right: '20px' };
        }
    };

    const positionStyles = getPositionStyles(position);

    return (
        <div
            className={`toast ${className}`}
            style={{
                ...positionStyles,
                backgroundColor: colors.bg,
                border: `1px solid ${colors.border}`,
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                padding: '16px',
                marginBottom: '8px',
                opacity: isVisible && !isExiting ? 1 : 0,
                transform: isVisible && !isExiting ? 'translateX(0) scale(1)' : 'translateX(100%) scale(0.95)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                pointerEvents: isExiting ? 'none' : 'auto'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                {/* Icon */}
                <div
                    style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: colors.iconBg,
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        flexShrink: 0,
                        marginTop: '2px'
                    }}
                >
                    {icon}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    {title && (
                        <div
                            style={{
                                fontSize: '14px',
                                fontWeight: '600',
                                color: colors.text,
                                marginBottom: '4px'
                            }}
                        >
                            {title}
                        </div>
                    )}
                    <div
                        style={{
                            fontSize: '14px',
                            color: colors.text,
                            lineHeight: '1.4'
                        }}
                    >
                        {message}
                    </div>
                </div>

                {/* Close Button */}
                <button
                    onClick={handleClose}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: colors.text,
                        cursor: 'pointer',
                        fontSize: '18px',
                        padding: '0',
                        width: '20px',
                        height: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                        flexShrink: 0,
                        opacity: 0.7,
                        transition: 'opacity 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = '1';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '0.7';
                    }}
                >
                    ×
                </button>
            </div>

            {/* Progress Bar */}
            {duration > 0 && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: '0',
                        left: '0',
                        height: '3px',
                        backgroundColor: colors.border,
                        borderRadius: '0 0 8px 8px',
                        animation: `progress ${duration}ms linear`
                    }}
                />
            )}
        </div>
    );
};

export default Toast;
