import React, { FC, useEffect, useState } from 'react';

export type AnimationType = 'success' | 'error' | 'warning';

interface SuccessAnimationProps {
    type?: AnimationType;
    message?: string;
    className?: string;
    autoHide?: boolean;
    duration?: number;
    onComplete?: () => void;
}

const SuccessAnimation: FC<SuccessAnimationProps> = ({
    type = 'success',
    message,
    className = '',
    autoHide = true,
    duration = 2000,
    onComplete
}) => {
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        if (autoHide && duration > 0) {
            const timer = setTimeout(() => {
                setVisible(false);
                onComplete?.();
            }, duration);
            return () => clearTimeout(timer);
        }
    }, [autoHide, duration, onComplete]);

    const getIcon = (type: AnimationType) => {
        switch (type) {
            case 'success':
                return '✓';
            case 'error':
                return '✕';
            case 'warning':
                return '⚠';
            default:
                return '✓';
        }
    };

    const getColor = (type: AnimationType) => {
        switch (type) {
            case 'success':
                return '#4caf50';
            case 'error':
                return '#f44336';
            case 'warning':
                return '#ff9800';
            default:
                return '#4caf50';
        }
    };

    const icon = getIcon(type);
    const color = getColor(type);

    if (!visible) return null;

    return (
        <div
            className={`success-animation ${className}`}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                backgroundColor: 'white',
                borderRadius: '6px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                border: `1px solid ${color}20`,
                animation: 'fadeInUp 0.3s ease-out',
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(-10px)',
                transition: 'opacity 0.3s ease, transform 0.3s ease'
            }}
        >
            <div
                className="animation-icon"
                style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    backgroundColor: color,
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    animation: 'bounceIn 0.6s ease-out'
                }}
            >
                {icon}
            </div>
            {message && (
                <span
                    style={{
                        fontSize: '14px',
                        color: '#333',
                        fontWeight: '500',
                        animation: 'slideInRight 0.4s ease-out 0.2s both'
                    }}
                >
                    {message}
                </span>
            )}
        </div>
    );
};

export default SuccessAnimation;
