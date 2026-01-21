import React, { FC, ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'ghost' | 'outline';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    fullWidth?: boolean;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
    className?: string;
    children: ReactNode;
}

const Button: FC<ButtonProps> = ({
    variant = 'primary',
    size = 'md',
    loading = false,
    fullWidth = false,
    leftIcon,
    rightIcon,
    className,
    disabled,
    children,
    ...props
}) => {
    const getVariantStyles = (): React.CSSProperties => {
        const baseStyles: React.CSSProperties = {
            border: 'none',
            borderRadius: '6px',
            fontWeight: '500',
            fontFamily: 'inherit',
            cursor: disabled || loading ? 'not-allowed' : 'pointer',
            transition: 'all var(--transition-fast)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            whiteSpace: 'nowrap',
            position: 'relative',
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

        switch (variant) {
            case 'primary':
                return {
                    ...baseStyles,
                    backgroundColor: 'var(--color-primary)',
                    color: 'var(--color-text-inverse)',
                    boxShadow: 'var(--shadow-sm)'
                };
            case 'secondary':
                return {
                    ...baseStyles,
                    backgroundColor: 'var(--color-gray-100)',
                    color: 'var(--color-text-primary)',
                    border: '1px solid var(--color-border-light)'
                };
            case 'success':
                return {
                    ...baseStyles,
                    backgroundColor: 'var(--color-success)',
                    color: 'var(--color-text-inverse)',
                    boxShadow: 'var(--shadow-sm)'
                };
            case 'warning':
                return {
                    ...baseStyles,
                    backgroundColor: 'var(--color-warning)',
                    color: 'var(--color-text-inverse)',
                    boxShadow: 'var(--shadow-sm)'
                };
            case 'error':
                return {
                    ...baseStyles,
                    backgroundColor: 'var(--color-error)',
                    color: 'var(--color-text-inverse)',
                    boxShadow: 'var(--shadow-sm)'
                };
            case 'ghost':
                return {
                    ...baseStyles,
                    backgroundColor: 'transparent',
                    color: 'var(--color-text-primary)',
                    border: '1px solid transparent'
                };
            case 'outline':
                return {
                    ...baseStyles,
                    backgroundColor: 'transparent',
                    color: 'var(--color-primary)',
                    border: '1px solid var(--color-primary)'
                };
            default:
                return baseStyles;
        }
    };

    const getSizeStyles = (): React.CSSProperties => {
        switch (size) {
            case 'xs':
                return {
                    padding: '4px 8px',
                    fontSize: '12px',
                    height: '28px',
                    minWidth: '28px'
                };
            case 'sm':
                return {
                    padding: '6px 12px',
                    fontSize: '14px',
                    height: '32px',
                    minWidth: '32px'
                };
            case 'md':
                return {
                    padding: '8px 16px',
                    fontSize: '14px',
                    height: '36px',
                    minWidth: '36px'
                };
            case 'lg':
                return {
                    padding: '10px 20px',
                    fontSize: '16px',
                    height: '44px',
                    minWidth: '44px'
                };
            case 'xl':
                return {
                    padding: '12px 24px',
                    fontSize: '18px',
                    height: '52px',
                    minWidth: '52px'
                };
            default:
                return {
                    padding: '8px 16px',
                    fontSize: '14px',
                    height: '36px',
                    minWidth: '36px'
                };
        }
    };

    const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (disabled || loading) return;

        const target = e.currentTarget;
        switch (variant) {
            case 'primary':
                target.style.backgroundColor = 'var(--color-primary-600)';
                target.style.transform = 'translateY(-1px)';
                target.style.boxShadow = 'var(--shadow-md)';
                break;
            case 'secondary':
                target.style.backgroundColor = 'var(--color-gray-200)';
                break;
            case 'success':
                target.style.backgroundColor = 'var(--color-success-dark)';
                target.style.transform = 'translateY(-1px)';
                target.style.boxShadow = 'var(--shadow-md)';
                break;
            case 'warning':
                target.style.backgroundColor = '#f57c00';
                target.style.transform = 'translateY(-1px)';
                target.style.boxShadow = 'var(--shadow-md)';
                break;
            case 'error':
                target.style.backgroundColor = 'var(--color-error-dark)';
                target.style.transform = 'translateY(-1px)';
                target.style.boxShadow = 'var(--shadow-md)';
                break;
            case 'ghost':
                target.style.backgroundColor = 'var(--color-gray-100)';
                break;
            case 'outline':
                target.style.backgroundColor = 'var(--color-primary-50)';
                target.style.borderColor = 'var(--color-primary-600)';
                target.style.color = 'var(--color-primary-600)';
                break;
        }
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
        if (disabled || loading) return;

        const target = e.currentTarget;
        const variantStyles = getVariantStyles();
        target.style.backgroundColor = variantStyles.backgroundColor as string;
        target.style.transform = 'translateY(0)';
        target.style.boxShadow = variantStyles.boxShadow as string;
        target.style.borderColor = variantStyles.border as string;
        target.style.color = variantStyles.color as string;
    };

    const combinedStyles: React.CSSProperties = {
        ...getVariantStyles(),
        ...getSizeStyles(),
        ...(fullWidth ? { width: '100%' } : {})
    };

    return (
        <button
            {...props}
            disabled={disabled || loading}
            className={`gpu-accelerated will-animate ${className}`}
            style={combinedStyles}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            aria-busy={loading}
        >
            {loading && (
                <div style={{
                    width: size === 'xs' ? '12px' : size === 'sm' ? '14px' : '16px',
                    height: size === 'xs' ? '12px' : size === 'sm' ? '14px' : '16px',
                    border: `2px solid currentColor`,
                    borderTop: '2px solid transparent',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    flexShrink: 0
                }} />
            )}

            {!loading && leftIcon && (
                <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    {leftIcon}
                </span>
            )}

            <span style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                {children}
            </span>

            {!loading && rightIcon && (
                <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    {rightIcon}
                </span>
            )}
        </button>
    );
};

export default Button;
