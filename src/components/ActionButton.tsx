import React, { FC, ButtonHTMLAttributes } from 'react';
import LoadingSpinner from './LoadingSpinner';

export type ActionButtonVariant = 'retry' | 'skip' | 'manual' | 'alternative' | 'cancel' | 'primary' | 'secondary';
export type ActionButtonSize = 'small' | 'medium' | 'large';

interface ActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
    variant: ActionButtonVariant;
    size?: ActionButtonSize;
    loading?: boolean;
    fullWidth?: boolean;
    className?: string;
}

const ActionButton: FC<ActionButtonProps> = ({
    variant,
    size = 'medium',
    loading = false,
    fullWidth = false,
    children,
    disabled,
    style,
    className = '',
    ...props
}) => {
    const getVariantStyles = (variant: ActionButtonVariant, disabled: boolean, loading: boolean) => {
        const baseStyles = {
            border: 'none',
            borderRadius: 'var(--radius-md)',
            fontWeight: 'var(--font-weight-medium)',
            cursor: disabled || loading ? 'not-allowed' : 'pointer',
            transition: 'all var(--transition-fast)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            fontFamily: 'inherit',
            textDecoration: 'none',
            outline: 'none',
            position: 'relative' as const,
            overflow: 'hidden'
        };

        if (disabled || loading) {
            return {
                ...baseStyles,
                backgroundColor: 'var(--color-gray-200)',
                color: 'var(--color-text-disabled)',
                cursor: 'not-allowed'
            };
        }

        const variantConfigs = {
            retry: {
                backgroundColor: 'var(--color-info)',
                color: 'var(--color-text-inverse)',
                boxShadow: 'var(--shadow-sm)',
                icon: '🔄'
            },
            skip: {
                backgroundColor: 'var(--color-bg-secondary)',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border-light)',
                icon: '⏭️'
            },
            manual: {
                backgroundColor: 'var(--color-warning)',
                color: 'var(--color-text-inverse)',
                boxShadow: 'var(--shadow-sm)',
                icon: '✏️'
            },
            alternative: {
                backgroundColor: 'var(--color-primary-600)',
                color: 'var(--color-text-inverse)',
                boxShadow: 'var(--shadow-sm)',
                icon: '🔀'
            },
            cancel: {
                backgroundColor: 'var(--color-bg-secondary)',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border-light)',
                icon: '❌'
            },
            primary: {
                backgroundColor: 'var(--color-primary)',
                color: 'var(--color-text-inverse)',
                boxShadow: 'var(--shadow-sm)',
                icon: null
            },
            secondary: {
                backgroundColor: 'var(--color-bg-secondary)',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border-light)',
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
                padding: 'var(--space-2) var(--space-3)',
                fontSize: 'var(--font-size-sm)',
                height: '32px',
                minWidth: '32px'
            },
            medium: {
                padding: 'var(--space-2) var(--space-4)',
                fontSize: 'var(--font-size-sm)',
                height: '36px',
                minWidth: '36px'
            },
            large: {
                padding: 'var(--space-3) var(--space-6)',
                fontSize: 'var(--font-size-md)',
                height: '44px',
                minWidth: '44px'
            }
        };

        return sizeConfigs[size];
    };

    const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (disabled || loading) return;

        const target = e.currentTarget;
        const variantStyles = getVariantStyles(variant, false, false);

        // Apply hover effects based on variant
        switch (variant) {
            case 'primary':
            case 'retry':
            case 'manual':
            case 'alternative':
                target.style.backgroundColor = variant === 'primary' ? 'var(--color-primary-600)' :
                                            variant === 'retry' ? 'var(--color-info-dark)' :
                                            variant === 'manual' ? 'var(--color-warning-dark)' :
                                            'var(--color-primary-700)';
                target.style.transform = 'translateY(-1px)';
                target.style.boxShadow = 'var(--shadow-md)';
                break;
            case 'skip':
            case 'cancel':
            case 'secondary':
                target.style.backgroundColor = 'var(--color-gray-100)';
                break;
        }
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (disabled || loading) return;

        const target = e.currentTarget;
        const variantStyles = getVariantStyles(variant, false, false);

        // Reset to original styles
        target.style.backgroundColor = (variantStyles as any).backgroundColor;
        target.style.transform = 'translateY(0)';
        target.style.boxShadow = (variantStyles as any).boxShadow || 'none';
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
            className={`btn-hover-scale ${className}`}
            disabled={disabled || loading}
            {...props}
        >
            {loading && <LoadingSpinner size="small" variant="secondary" />}
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
