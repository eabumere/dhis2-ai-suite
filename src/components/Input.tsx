import React, { FC, InputHTMLAttributes, TextareaHTMLAttributes, useState, useRef, useCallback } from 'react';

export type InputVariant = 'default' | 'filled' | 'outlined';
export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
    variant?: InputVariant;
    inputSize?: InputSize;
    label?: string;
    error?: string;
    helperText?: string;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    fullWidth?: boolean;
    required?: boolean;
}

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> {
    variant?: InputVariant;
    inputSize?: InputSize;
    label?: string;
    error?: string;
    helperText?: string;
    fullWidth?: boolean;
    required?: boolean;
    autoResize?: boolean;
}

const Input: FC<InputProps> = ({
    variant = 'default',
    inputSize = 'md',
    label,
    error,
    helperText,
    leftIcon,
    rightIcon,
    fullWidth = false,
    required = false,
    disabled = false,
    className,
    id,
    ...props
}) => {
    const [isFocused, setIsFocused] = useState(false);
    const [hasValue, setHasValue] = useState(Boolean(props.value || props.defaultValue));
    const inputRef = useRef<HTMLInputElement>(null);

    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;

    const getContainerStyles = (): React.CSSProperties => {
        return {
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            ...(fullWidth ? { width: '100%' } : {})
        };
    };

    const getInputContainerStyles = (): React.CSSProperties => {
        const baseStyles: React.CSSProperties = {
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            borderRadius: '6px',
            transition: 'all var(--transition-fast)',
            backgroundColor: 'var(--color-bg-primary)'
        };

        if (error) {
            return {
                ...baseStyles,
                border: '2px solid var(--color-error)',
                boxShadow: '0 0 0 3px rgba(244, 67, 54, 0.1)'
            };
        }

        if (isFocused) {
            return {
                ...baseStyles,
                border: '2px solid var(--color-primary)',
                boxShadow: '0 0 0 3px rgba(44, 102, 147, 0.1)'
            };
        }

        switch (variant) {
            case 'filled':
                return {
                    ...baseStyles,
                    border: '1px solid var(--color-border-light)',
                    backgroundColor: 'var(--color-gray-50)'
                };
            case 'outlined':
                return {
                    ...baseStyles,
                    border: '1px solid var(--color-border-light)',
                    backgroundColor: 'var(--color-bg-primary)'
                };
            default: // 'default'
                return {
                    ...baseStyles,
                    border: '1px solid var(--color-border-light)',
                    backgroundColor: 'var(--color-bg-primary)'
                };
        }
    };

    const getInputStyles = (): React.CSSProperties => {
        const baseStyles: React.CSSProperties = {
            flex: 1,
            border: 'none',
            outline: 'none',
            backgroundColor: 'transparent',
            fontFamily: 'inherit',
            color: disabled ? 'var(--color-text-disabled)' : 'var(--color-text-primary)',
            ...(leftIcon ? { paddingLeft: '40px' } : { paddingLeft: '12px' }),
            ...(rightIcon ? { paddingRight: '40px' } : { paddingRight: '12px' })
        };

        switch (inputSize) {
            case 'sm':
                return {
                    ...baseStyles,
                    paddingTop: '6px',
                    paddingBottom: '6px',
                    fontSize: '14px',
                    height: '32px'
                };
            case 'lg':
                return {
                    ...baseStyles,
                    paddingTop: '12px',
                    paddingBottom: '12px',
                    fontSize: '16px',
                    height: '48px'
                };
            default: // 'md'
                return {
                    ...baseStyles,
                    paddingTop: '8px',
                    paddingBottom: '8px',
                    fontSize: '14px',
                    height: '36px'
                };
        }
    };

    const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(true);
        props.onFocus?.(e);
    }, [props.onFocus]);

    const handleBlur = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(false);
        props.onBlur?.(e);
    }, [props.onBlur]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setHasValue(Boolean(e.target.value));
        props.onChange?.(e);
    }, [props.onChange]);

    return (
        <div style={getContainerStyles()}>
            {label && (
                <label
                    htmlFor={inputId}
                    style={{
                        fontSize: '14px',
                        fontWeight: '500',
                        color: disabled ? 'var(--color-text-disabled)' : 'var(--color-text-primary)',
                        marginBottom: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}
                >
                    {label}
                    {required && (
                        <span style={{ color: 'var(--color-error)' }} aria-label="required">
                            *
                        </span>
                    )}
                </label>
            )}

            <div style={getInputContainerStyles()}>
                {leftIcon && (
                    <div style={{
                        position: 'absolute',
                        left: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: disabled ? 'var(--color-text-disabled)' : 'var(--color-text-secondary)',
                        zIndex: 1
                    }}>
                        {leftIcon}
                    </div>
                )}

                <input
                    {...props}
                    ref={inputRef}
                    id={inputId}
                    disabled={disabled}
                    required={required}
                    style={getInputStyles()}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onChange={handleChange}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
                />

                {rightIcon && (
                    <div style={{
                        position: 'absolute',
                        right: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: disabled ? 'var(--color-text-disabled)' : 'var(--color-text-secondary)',
                        zIndex: 1
                    }}>
                        {rightIcon}
                    </div>
                )}
            </div>

            {(error || helperText) && (
                <div
                    id={error ? `${inputId}-error` : `${inputId}-helper`}
                    style={{
                        fontSize: '12px',
                        color: error ? 'var(--color-error)' : 'var(--color-text-secondary)',
                        marginTop: '4px'
                    }}
                    role={error ? 'alert' : undefined}
                    aria-live={error ? 'polite' : undefined}
                >
                    {error || helperText}
                </div>
            )}
        </div>
    );
};

const Textarea: FC<TextareaProps> = ({
    variant = 'default',
    inputSize = 'md',
    label,
    error,
    helperText,
    fullWidth = false,
    required = false,
    disabled = false,
    autoResize = false,
    rows = 3,
    className,
    id,
    ...props
}) => {
    const [isFocused, setIsFocused] = useState(false);
    const [hasValue, setHasValue] = useState(Boolean(props.value || props.defaultValue));
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const textareaId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`;

    const getContainerStyles = (): React.CSSProperties => {
        return {
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            ...(fullWidth ? { width: '100%' } : {})
        };
    };

    const getTextareaContainerStyles = (): React.CSSProperties => {
        const baseStyles: React.CSSProperties = {
            position: 'relative',
            borderRadius: '6px',
            transition: 'all var(--transition-fast)',
            backgroundColor: 'var(--color-bg-primary)'
        };

        if (error) {
            return {
                ...baseStyles,
                border: '2px solid var(--color-error)',
                boxShadow: '0 0 0 3px rgba(244, 67, 54, 0.1)'
            };
        }

        if (isFocused) {
            return {
                ...baseStyles,
                border: '2px solid var(--color-primary)',
                boxShadow: '0 0 0 3px rgba(44, 102, 147, 0.1)'
            };
        }

        switch (variant) {
            case 'filled':
                return {
                    ...baseStyles,
                    border: '1px solid var(--color-border-light)',
                    backgroundColor: 'var(--color-gray-50)'
                };
            case 'outlined':
                return {
                    ...baseStyles,
                    border: '1px solid var(--color-border-light)',
                    backgroundColor: 'var(--color-bg-primary)'
                };
            default: // 'default'
                return {
                    ...baseStyles,
                    border: '1px solid var(--color-border-light)',
                    backgroundColor: 'var(--color-bg-primary)'
                };
        }
    };

    const getTextareaStyles = (): React.CSSProperties => {
        const baseStyles: React.CSSProperties = {
            width: '100%',
            border: 'none',
            outline: 'none',
            backgroundColor: 'transparent',
            fontFamily: 'inherit',
            color: disabled ? 'var(--color-text-disabled)' : 'var(--color-text-primary)',
            resize: autoResize ? 'none' : 'vertical',
            padding: '12px',
            lineHeight: '1.5'
        };

        switch (inputSize) {
            case 'sm':
                return {
                    ...baseStyles,
                    fontSize: '14px',
                    minHeight: '80px'
                };
            case 'lg':
                return {
                    ...baseStyles,
                    fontSize: '16px',
                    minHeight: '120px'
                };
            default: // 'md'
                return {
                    ...baseStyles,
                    fontSize: '14px',
                    minHeight: '100px'
                };
        }
    };

    const handleFocus = useCallback((e: React.FocusEvent<HTMLTextAreaElement>) => {
        setIsFocused(true);
        props.onFocus?.(e);
    }, [props.onFocus]);

    const handleBlur = useCallback((e: React.FocusEvent<HTMLTextAreaElement>) => {
        setIsFocused(false);
        props.onBlur?.(e);
    }, [props.onBlur]);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setHasValue(Boolean(e.target.value));
        props.onChange?.(e);

        // Auto-resize if enabled
        if (autoResize && textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
    }, [props.onChange, autoResize]);

    return (
        <div style={getContainerStyles()}>
            {label && (
                <label
                    htmlFor={textareaId}
                    style={{
                        fontSize: '14px',
                        fontWeight: '500',
                        color: disabled ? 'var(--color-text-disabled)' : 'var(--color-text-primary)',
                        marginBottom: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}
                >
                    {label}
                    {required && (
                        <span style={{ color: 'var(--color-error)' }} aria-label="required">
                            *
                        </span>
                    )}
                </label>
            )}

            <div style={getTextareaContainerStyles()}>
                <textarea
                    {...props}
                    ref={textareaRef}
                    id={textareaId}
                    disabled={disabled}
                    required={required}
                    rows={rows}
                    style={getTextareaStyles()}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onChange={handleChange}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? `${textareaId}-error` : helperText ? `${textareaId}-helper` : undefined}
                />
            </div>

            {(error || helperText) && (
                <div
                    id={error ? `${textareaId}-error` : `${textareaId}-helper`}
                    style={{
                        fontSize: '12px',
                        color: error ? 'var(--color-error)' : 'var(--color-text-secondary)',
                        marginTop: '4px'
                    }}
                    role={error ? 'alert' : undefined}
                    aria-live={error ? 'polite' : undefined}
                >
                    {error || helperText}
                </div>
            )}
        </div>
    );
};

// Export both components
export { Textarea };
export default Input;
