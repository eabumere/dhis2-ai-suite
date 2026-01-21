import React, { FC } from 'react';

export type LoadingSpinnerSize = 'small' | 'medium' | 'large';
export type LoadingSpinnerVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'error';

interface LoadingSpinnerProps {
    size?: LoadingSpinnerSize;
    variant?: LoadingSpinnerVariant;
    className?: string;
    message?: string;
}

const LoadingSpinner: FC<LoadingSpinnerProps> = ({
    size = 'medium',
    variant = 'primary',
    className = '',
    message
}) => {
    const getSizeStyles = (size: LoadingSpinnerSize) => {
        const sizeConfigs = {
            small: {
                width: '16px',
                height: '16px',
                borderWidth: '2px'
            },
            medium: {
                width: '24px',
                height: '24px',
                borderWidth: '3px'
            },
            large: {
                width: '32px',
                height: '32px',
                borderWidth: '4px'
            }
        };
        return sizeConfigs[size];
    };

    const getVariantColor = (variant: LoadingSpinnerVariant) => {
        const colorMap = {
            primary: '#2196f3',
            secondary: '#757575',
            success: '#4caf50',
            warning: '#ff9800',
            error: '#f44336'
        };
        return colorMap[variant];
    };

    const sizeStyles = getSizeStyles(size);
    const color = getVariantColor(variant);

    return (
        <div className={`loading-spinner-container ${className}`} style={{
            display: 'inline-flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px'
        }}>
            <div
                className="loading-spinner"
                style={{
                    ...sizeStyles,
                    border: `${sizeStyles.borderWidth} solid rgba(255, 255, 255, 0.3)`,
                    borderTop: `${sizeStyles.borderWidth} solid ${color}`,
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    display: 'inline-block'
                }}
            />
            {message && (
                <span style={{
                    fontSize: '12px',
                    color: '#666',
                    textAlign: 'center'
                }}>
                    {message}
                </span>
            )}
        </div>
    );
};

export default LoadingSpinner;
