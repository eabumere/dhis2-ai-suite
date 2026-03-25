import React, { FC, ReactNode } from 'react';

export type SpacingSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
export type SpacingDirection = 'all' | 'horizontal' | 'vertical' | 'top' | 'right' | 'bottom' | 'left';

export interface SpacingProps {
    children: ReactNode;
    size?: SpacingSize;
    direction?: SpacingDirection;
    className?: string;
    style?: React.CSSProperties;
}

const Spacing: FC<SpacingProps> = ({
    children,
    size = 'md',
    direction = 'all',
    className = '',
    style = {}
}) => {
    const getSpacingValue = (size: SpacingSize): string => {
        switch (size) {
            case 'xs': return 'var(--space-1)';    // 4px
            case 'sm': return 'var(--space-2)';    // 8px
            case 'md': return 'var(--space-4)';    // 16px
            case 'lg': return 'var(--space-6)';    // 24px
            case 'xl': return 'var(--space-8)';    // 32px
            case '2xl': return 'var(--space-12)';  // 48px
            case '3xl': return 'var(--space-16)';  // 64px
            default: return 'var(--space-4)';
        }
    };

    const getSpacingStyles = (): React.CSSProperties => {
        const value = getSpacingValue(size);

        switch (direction) {
            case 'all':
                return { padding: value };
            case 'horizontal':
                return { paddingLeft: value, paddingRight: value };
            case 'vertical':
                return { paddingTop: value, paddingBottom: value };
            case 'top':
                return { paddingTop: value };
            case 'right':
                return { paddingRight: value };
            case 'bottom':
                return { paddingBottom: value };
            case 'left':
                return { paddingLeft: value };
            default:
                return { padding: value };
        }
    };

    return (
        <div
            className={className}
            style={{
                ...getSpacingStyles(),
                ...style
            }}
        >
            {children}
        </div>
    );
};

// Specialized spacing components for common patterns
export const VStack: FC<{
    children: ReactNode;
    spacing?: SpacingSize;
    className?: string;
    style?: React.CSSProperties;
    align?: 'start' | 'center' | 'end' | 'stretch';
}> = ({ children, spacing = 'md', className = '', style = {}, align = 'stretch' }) => {
    const spacingValue = (() => {
        switch (spacing) {
            case 'xs': return 'var(--space-1)';
            case 'sm': return 'var(--space-2)';
            case 'md': return 'var(--space-4)';
            case 'lg': return 'var(--space-6)';
            case 'xl': return 'var(--space-8)';
            case '2xl': return 'var(--space-12)';
            case '3xl': return 'var(--space-16)';
            default: return 'var(--space-4)';
        }
    })();

    const alignValue = (() => {
        switch (align) {
            case 'start': return 'flex-start';
            case 'center': return 'center';
            case 'end': return 'flex-end';
            case 'stretch': return 'stretch';
            default: return 'stretch';
        }
    })();

    return (
        <div
            className={className}
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: spacingValue,
                alignItems: alignValue,
                ...style
            }}
        >
            {children}
        </div>
    );
};

export const HStack: FC<{
    children: ReactNode;
    spacing?: SpacingSize;
    className?: string;
    style?: React.CSSProperties;
    align?: 'start' | 'center' | 'end' | 'stretch';
    justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
}> = ({
    children,
    spacing = 'md',
    className = '',
    style = {},
    align = 'center',
    justify = 'start'
}) => {
    const spacingValue = (() => {
        switch (spacing) {
            case 'xs': return 'var(--space-1)';
            case 'sm': return 'var(--space-2)';
            case 'md': return 'var(--space-4)';
            case 'lg': return 'var(--space-6)';
            case 'xl': return 'var(--space-8)';
            case '2xl': return 'var(--space-12)';
            case '3xl': return 'var(--space-16)';
            default: return 'var(--space-4)';
        }
    })();

    const alignValue = (() => {
        switch (align) {
            case 'start': return 'flex-start';
            case 'center': return 'center';
            case 'end': return 'flex-end';
            case 'stretch': return 'stretch';
            default: return 'center';
        }
    })();

    const justifyValue = (() => {
        switch (justify) {
            case 'start': return 'flex-start';
            case 'center': return 'center';
            case 'end': return 'flex-end';
            case 'between': return 'space-between';
            case 'around': return 'space-around';
            case 'evenly': return 'space-evenly';
            default: return 'flex-start';
        }
    })();

    return (
        <div
            className={className}
            style={{
                display: 'flex',
                flexDirection: 'row',
                gap: spacingValue,
                alignItems: alignValue,
                justifyContent: justifyValue,
                ...style
            }}
        >
            {children}
        </div>
    );
};

// Margin utilities
export const Margin: FC<{
    children: ReactNode;
    size?: SpacingSize;
    direction?: SpacingDirection;
    className?: string;
    style?: React.CSSProperties;
}> = ({ children, size = 'md', direction = 'all', className = '', style = {} }) => {
    const getMarginValue = (size: SpacingSize): string => {
        switch (size) {
            case 'xs': return 'var(--space-1)';
            case 'sm': return 'var(--space-2)';
            case 'md': return 'var(--space-4)';
            case 'lg': return 'var(--space-6)';
            case 'xl': return 'var(--space-8)';
            case '2xl': return 'var(--space-12)';
            case '3xl': return 'var(--space-16)';
            default: return 'var(--space-4)';
        }
    };

    const getMarginStyles = (): React.CSSProperties => {
        const value = getMarginValue(size);

        switch (direction) {
            case 'all':
                return { margin: value };
            case 'horizontal':
                return { marginLeft: value, marginRight: value };
            case 'vertical':
                return { marginTop: value, marginBottom: value };
            case 'top':
                return { marginTop: value };
            case 'right':
                return { marginRight: value };
            case 'bottom':
                return { marginBottom: value };
            case 'left':
                return { marginLeft: value };
            default:
                return { margin: value };
        }
    };

    return (
        <div
            className={className}
            style={{
                ...getMarginStyles(),
                ...style
            }}
        >
            {children}
        </div>
    );
};

// Layout container with consistent spacing
export const Container: FC<{
    children: ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
    className?: string;
    style?: React.CSSProperties;
}> = ({ children, size = 'md', className = '', style = {} }) => {
    const getMaxWidth = (size: string): string => {
        switch (size) {
            case 'sm': return '640px';
            case 'md': return '768px';
            case 'lg': return '1024px';
            case 'xl': return '1280px';
            case 'full': return '100%';
            default: return '768px';
        }
    };

    return (
        <div
            className={className}
            style={{
                width: '100%',
                maxWidth: getMaxWidth(size),
                margin: '0 auto',
                padding: '0 var(--space-4)',
                ...style
            }}
        >
            {children}
        </div>
    );
};

export default Spacing;
