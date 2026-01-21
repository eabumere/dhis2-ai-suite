import React, { FC, ButtonHTMLAttributes } from 'react';

export type ActionButtonVariant = 'retry' | 'skip' | 'manual' | 'alternative' | 'cancel' | 'primary' | 'secondary';
export type ActionButtonSize = 'small' | 'medium' | 'large';

interface ActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
    variant: ActionButtonVariant;
    size?: ActionButtonSize;
    loading?: boolean;
    fullWidth?: boolean;
}

const ActionButton: FC<ActionButtonProps> = ({
    variant,
    size = 'medium',
    loading = false,
    fullWidth = false,
    children,
    disabled,
    style,
    ...props
}) => {
    const getVariantStyles = (variant: ActionButtonVariant, disabled: boolean, loading: boolean) => {
        const baseStyles = {
            border: 'none',
            borderRadius: '6px',
            fontWeight: '500',
            cursor: disabled || loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontFamily: 'inherit',
            textDecoration: 'none',
            outline: 'none'
        };

        const variantConfigs = {
            retry: {
                backgroundColor: disabled || loading ? '#cccccc' : '#2196f3',
                color: 'white',
                border: '1px solid #1976d2',
                icon: '🔄'
            },
            skip: {
                backgroundColor: disabled || loading ? '#f5f5f5' : '#f5f5f5',
                color: disabled || loading ? '#999' : '#666',
                border: '1px solid #ddd',
                icon: '⏭️'
            },
            manual: {
                backgroundColor: disabled || loading ? '#cccccc' : '#ff9800',
                color: 'white',
                border: '1px solid #f57c00',
                icon: '✏️'
            },
            alternative: {
                backgroundColor: disabled || loading ? '#cccccc' : '#9c27b0',
                color: 'white',
                border: '1px solid #7b1fa2',
                icon: '🔀'
            },
            cancel: {
                backgroundColor: disabled || loading ? '#f5f5f5' : '#f5f5f5',
                color: disabled || loading ? '#999' : '#666',
                border: '1px solid #ddd',
                icon: '❌'
            },
            primary: {
                backgroundColor: disabled || loading ? '#cccccc' : '#2196f3',
                color: 'white',
                border: '1px solid #1976d2',
                icon: null
            },
            secondary: {
                backgroundColor: disabled || loading ? '#f5f5f5' : '#f5f5f5',
                color: disabled || loading ? '#999' : '#666',
                border: '1px solid #ddd',
                icon: null
            }
        };

        return {
            ...baseStyles,
            ...variantConfigs[variant]
        };
    };

    const getSizeStyles = (size: ActionButtonSize) => {
        const sizeConfigs = {
            small: {
                padding: '6px 12px',
                fontSize: '12px',
                minHeight: '28px'
            },
            medium: {
                padding: '8px 16px',
                fontSize: '14px',
                minHeight: '36px'
            },
            large: {
                padding: '12px 24px',
                fontSize: '16px',
                minHeight: '44px'
            }
        };

        return sizeConfigs[size];
    };

    const variantStyles = getVariantStyles(variant, !!disabled, loading);
    const sizeStyles = getSizeStyles(size);

    const finalStyles = {
        ...variantStyles,
        ...sizeStyles,
        ...(fullWidth && { width: '100%' }),
        ...style
    };

    const getVariantIcon = (variant: ActionButtonVariant) => {
        const icons = {
            retry: '🔄',
            skip: '⏭️',
            manual: '✏️',
            alternative: '🔀',
            cancel: '❌',
            primary: null,
            secondary: null
        };
        return icons[variant];
    };

    const icon = getVariantIcon(variant);

    return (
        <button
            style={finalStyles}
            disabled={disabled || loading}
            {...props}
        >
            {loading && <span style={{ fontSize: '12px' }}>⏳</span>}
            {icon && !loading && <span style={{ fontSize: '12px' }}>{icon}</span>}
            {children}
        </button>
    );
};

// Convenience components for specific variants
export const RetryButton: FC<Omit<ActionButtonProps, 'variant'>> = (props) => (
    <ActionButton {...props} variant="retry" />
);

export const SkipButton: FC<Omit<ActionButtonProps, 'variant'>> = (props) => (
    <ActionButton {...props} variant="skip" />
);

export const ManualButton: FC<Omit<ActionButtonProps, 'variant'>> = (props) => (
    <ActionButton {...props} variant="manual" />
);

export const AlternativeButton: FC<Omit<ActionButtonProps, 'variant'>> = (props) => (
    <ActionButton {...props} variant="alternative" />
);

export const CancelButton: FC<Omit<ActionButtonProps, 'variant'>> = (props) => (
    <ActionButton {...props} variant="cancel" />
);

export const PrimaryButton: FC<Omit<ActionButtonProps, 'variant'>> = (props) => (
    <ActionButton {...props} variant="primary" />
);

export const SecondaryButton: FC<Omit<ActionButtonProps, 'variant'>> = (props) => (
    <ActionButton {...props} variant="secondary" />
);

export default ActionButton;
