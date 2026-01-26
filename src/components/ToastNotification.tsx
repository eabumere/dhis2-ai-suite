import React, { FC, useEffect, useState, createContext, useContext } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'progress';
export type ToastPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';

interface ToastProps {
    id: string;
    type: ToastType;
    title?: string;
    message: string;
    duration?: number;
    position?: ToastPosition;
    progress?: number; // 0-100 for progress toasts
    workflowId?: string;
    onClose: (id: string) => void;
    className?: string;
    actionButton?: {
        label: string;
        onClick: () => void;
    };
}

const Toast: FC<ToastProps> = ({
    id,
    type,
    title,
    message,
    duration = 4000,
    position = 'top-right',
    progress = 0,
    workflowId,
    onClose,
    className = '',
    actionButton
}) => {
    const [isVisible, setIsVisible] = useState(false);
    const [isExiting, setIsExiting] = useState(false);
    const [currentProgress, setCurrentProgress] = useState(progress);

    useEffect(() => {
        // Trigger enter animation
        setTimeout(() => setIsVisible(true), 10);

        // Update progress if it's a progress toast
        if (type === 'progress' && progress > 0) {
            setCurrentProgress(progress);
        }

        // Auto-hide timer (except for progress toasts)
        if (duration > 0 && type !== 'progress') {
            const timer = setTimeout(() => {
                handleClose();
            }, duration);
            return () => clearTimeout(timer);
        }
    }, [duration, type, progress]);

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
            case 'progress':
                return '🔄';
            default:
                return 'ℹ';
        }
    };

    const getColors = (type: ToastType) => {
        switch (type) {
            case 'success':
                return {
                    bg: 'linear-gradient(135deg, #e8f5e8, #f1f8e9)',
                    border: '#4caf50',
                    iconBg: '#4caf50',
                    text: '#2e7d32',
                    progress: '#4caf50'
                };
            case 'error':
                return {
                    bg: 'linear-gradient(135deg, #ffebee, #fce4ec)',
                    border: '#f44336',
                    iconBg: '#f44336',
                    text: '#c62828',
                    progress: '#f44336'
                };
            case 'warning':
                return {
                    bg: 'linear-gradient(135deg, #fff3e0, #fff8e1)',
                    border: '#ff9800',
                    iconBg: '#ff9800',
                    text: '#ef6c00',
                    progress: '#ff9800'
                };
            case 'info':
                return {
                    bg: 'linear-gradient(135deg, #e3f2fd, #e1f5fe)',
                    border: '#2196f3',
                    iconBg: '#2196f3',
                    text: '#1565c0',
                    progress: '#2196f3'
                };
            case 'progress':
                return {
                    bg: 'linear-gradient(135deg, rgba(33, 150, 243, 0.08), rgba(25, 118, 210, 0.05))',
                    border: 'rgba(33, 150, 243, 0.3)',
                    iconBg: '#2196f3',
                    text: '#1976d2',
                    progress: '#2196f3'
                };
            default:
                return {
                    bg: 'linear-gradient(135deg, #e3f2fd, #e1f5fe)',
                    border: '#2196f3',
                    iconBg: '#2196f3',
                    text: '#1565c0',
                    progress: '#2196f3'
                };
        }
    };

    const getPositionStyles = (position: ToastPosition) => {
        const base = {
            position: 'fixed' as const,
            zIndex: 9999,
            maxWidth: '420px',
            minWidth: '320px'
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

    const colors = getColors(type);
    const icon = getIcon(type);
    const positionStyles = getPositionStyles(position);

    return (
        <div
            className={`toast-notification-elegant ${className}`}
            style={{
                ...positionStyles,
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                borderRadius: '12px',
                boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15), 0 6px 12px rgba(0, 0, 0, 0.1)',
                padding: '16px',
                marginBottom: '8px',
                opacity: isVisible && !isExiting ? 1 : 0,
                transform: isVisible && !isExiting ? 'translateX(0) scale(1)' : 'translateX(100%) scale(0.95)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                pointerEvents: isExiting ? 'none' : 'auto',
                backdropFilter: 'blur(10px)'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                {/* Icon */}
                <div
                    style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        backgroundColor: colors.iconBg,
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        flexShrink: 0,
                        marginTop: '2px',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                        animation: type === 'progress' ? 'spin 1.5s linear infinite' : 'none'
                    }}
                >
                    {icon}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    {title && (
                        <div
                            style={{
                                fontSize: '15px',
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
                            lineHeight: '1.4',
                            opacity: 0.9
                        }}
                    >
                        {message}
                    </div>

                    {/* Progress bar for progress toasts */}
                    {type === 'progress' && (
                        <div style={{
                            marginTop: '12px',
                            width: '100%',
                            height: '4px',
                            backgroundColor: 'rgba(255, 255, 255, 0.3)',
                            borderRadius: '2px',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                width: `${currentProgress}%`,
                                height: '100%',
                                background: `linear-gradient(90deg, ${colors.progress}, ${colors.progress}dd)`,
                                borderRadius: '2px',
                                transition: 'width 0.3s ease',
                                position: 'relative'
                            }}>
                                {/* Animated shine effect */}
                                <div style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent)',
                                    animation: 'progress-fill 2s ease-in-out infinite'
                                }} />
                            </div>
                        </div>
                    )}

                    {/* Workflow ID for progress toasts */}
                    {workflowId && (
                        <div style={{
                            marginTop: '8px',
                            fontSize: '11px',
                            color: colors.text,
                            opacity: 0.7,
                            fontFamily: 'monospace'
                        }}>
                            Workflow: {workflowId}
                        </div>
                    )}

                    {/* Action button */}
                    {actionButton && (
                        <div style={{ marginTop: '12px' }}>
                            <button
                                onClick={actionButton.onClick}
                                style={{
                                    padding: '6px 12px',
                                    backgroundColor: colors.iconBg,
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: '500',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease'
                                }}
                                onMouseOver={(e) => {
                                    e.currentTarget.style.opacity = '0.9';
                                    e.currentTarget.style.transform = 'scale(1.02)';
                                }}
                                onMouseOut={(e) => {
                                    e.currentTarget.style.opacity = '1';
                                    e.currentTarget.style.transform = 'scale(1)';
                                }}
                            >
                                {actionButton.label}
                            </button>
                        </div>
                    )}
                </div>

                {/* Close Button */}
                <button
                    onClick={handleClose}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: colors.text,
                        cursor: 'pointer',
                        fontSize: '20px',
                        padding: '0',
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                        flexShrink: 0,
                        opacity: 0.7,
                        transition: 'opacity 0.2s ease',
                        marginTop: '2px'
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

            {/* Auto-hide progress bar for non-progress toasts */}
            {duration > 0 && type !== 'progress' && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: '0',
                        left: '0',
                        height: '3px',
                        backgroundColor: colors.border,
                        borderRadius: '0 0 12px 12px',
                        animation: `progress ${duration}ms linear forwards`
                    }}
                />
            )}
        </div>
    );
};

// Toast Manager Context
interface ToastManagerContextType {
    showToast: (toast: Omit<ToastProps, 'id' | 'onClose'>) => string;
    updateToast: (id: string, updates: Partial<ToastProps>) => void;
    removeToast: (id: string) => void;
    clearAllToasts: () => void;
}

const ToastManagerContext = createContext<ToastManagerContextType | null>(null);

// Toast Manager Hook
export const useToast = () => {
    const context = useContext(ToastManagerContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

// Toast Container Component
interface ToastContainerProps {
    toasts: ToastProps[];
    onRemoveToast: (id: string) => void;
    position?: ToastPosition;
}

const ToastContainer: FC<ToastContainerProps> = ({ toasts, onRemoveToast, position = 'top-right' }) => {
    const positionToasts = toasts.filter(toast => toast.position === position);

    if (positionToasts.length === 0) return null;

    return (
        <div style={{ position: 'fixed', pointerEvents: 'none', zIndex: 9999 }}>
            {positionToasts.map(toast => (
                <div key={toast.id} style={{ pointerEvents: 'auto' }}>
                    <Toast {...toast} onClose={onRemoveToast} />
                </div>
            ))}
        </div>
    );
};

// Toast Provider Component
interface ToastProviderProps {
    children: React.ReactNode;
}

export const ToastProvider: FC<ToastProviderProps> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastProps[]>([]);

    const showToast = (toast: Omit<ToastProps, 'id' | 'onClose'>): string => {
        const id = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newToast: ToastProps = {
            ...toast,
            id,
            onClose: () => removeToast(id)
        };

        setToasts(prev => [...prev, newToast]);
        return id;
    };

    const updateToast = (id: string, updates: Partial<ToastProps>) => {
        setToasts(prev => prev.map(toast =>
            toast.id === id ? { ...toast, ...updates } : toast
        ));
    };

    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
    };

    const clearAllToasts = () => {
        setToasts([]);
    };

    const contextValue: ToastManagerContextType = {
        showToast,
        updateToast,
        removeToast,
        clearAllToasts
    };

    return (
        <ToastManagerContext.Provider value={contextValue}>
            {children}

            {/* Render toast containers for each position */}
            <ToastContainer
                toasts={toasts}
                onRemoveToast={removeToast}
                position="top-right"
            />
            <ToastContainer
                toasts={toasts}
                onRemoveToast={removeToast}
                position="top-left"
            />
            <ToastContainer
                toasts={toasts}
                onRemoveToast={removeToast}
                position="bottom-right"
            />
            <ToastContainer
                toasts={toasts}
                onRemoveToast={removeToast}
                position="bottom-left"
            />
            <ToastContainer
                toasts={toasts}
                onRemoveToast={removeToast}
                position="top-center"
            />
            <ToastContainer
                toasts={toasts}
                onRemoveToast={removeToast}
                position="bottom-center"
            />
        </ToastManagerContext.Provider>
    );
};

// Progress CSS keyframes (injected once)
const progressKeyframes = `
    @keyframes progress {
        from { width: 100%; }
        to { width: 0%; }
    }
`;

if (typeof document !== 'undefined' && !document.getElementById('toast-progress-keyframes')) {
    const style = document.createElement('style');
    style.id = 'toast-progress-keyframes';
    style.textContent = progressKeyframes;
    document.head.appendChild(style);
}

export default Toast;
