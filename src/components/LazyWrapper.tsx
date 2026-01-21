import React, { ComponentType, FC, Suspense, lazy, useState } from 'react';

interface LazyWrapperProps {
    component: () => Promise<{ default: ComponentType<any> }>;
    fallback?: React.ReactNode;
    loadingTrigger?: 'immediate' | 'viewport' | 'hover' | 'click';
    rootMargin?: string;
    className?: string;
    style?: React.CSSProperties;
    [key: string]: any; // Props to pass to the lazy component
}

const LazyWrapper: FC<LazyWrapperProps> = ({
    component,
    fallback,
    loadingTrigger = 'immediate',
    rootMargin = '50px',
    className,
    style,
    ...props
}) => {
    const [isVisible, setIsVisible] = useState(loadingTrigger === 'immediate');
    const [hasBeenTriggered, setHasBeenTriggered] = useState(loadingTrigger === 'immediate');
    const [LazyComponent, setLazyComponent] = useState<React.LazyExoticComponent<ComponentType<any>> | null>(null);

    // Create intersection observer for viewport-based loading
    React.useEffect(() => {
        if (loadingTrigger === 'viewport') {
            const observer = new IntersectionObserver(
                ([entry]) => {
                    if (entry.isIntersecting && !hasBeenTriggered) {
                        setIsVisible(true);
                        setHasBeenTriggered(true);
                        observer.disconnect();
                    }
                },
                { rootMargin }
            );

            const element = document.getElementById(`lazy-${Math.random()}`);
            if (element) {
                observer.observe(element);
            }

            return () => observer.disconnect();
        }
    }, [loadingTrigger, rootMargin, hasBeenTriggered]);

    // Load component when triggered
    React.useEffect(() => {
        if (isVisible && !LazyComponent) {
            const Component = lazy(component);
            setLazyComponent(Component);
        }
    }, [isVisible, LazyComponent, component]);

    const handleTrigger = () => {
        if (!hasBeenTriggered) {
            setIsVisible(true);
            setHasBeenTriggered(true);
        }
    };

    const defaultFallback = (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            backgroundColor: '#f8f9fa',
            border: '1px solid #e9ecef',
            borderRadius: '8px',
            color: '#6c757d'
        }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{
                    width: '24px',
                    height: '24px',
                    border: '2px solid #e9ecef',
                    borderTop: '2px solid #007bff',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    margin: '0 auto 8px'
                }} />
                <div>Loading component...</div>
            </div>
        </div>
    );

    const triggerProps = loadingTrigger === 'hover' ? { onMouseEnter: handleTrigger } :
                        loadingTrigger === 'click' ? { onClick: handleTrigger } : {};

    if (!isVisible) {
        return (
            <div
                id={`lazy-${Math.random()}`}
                className={className}
                style={{
                    minHeight: '100px',
                    backgroundColor: '#f8f9fa',
                    border: '1px dashed #dee2e6',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#6c757d',
                    cursor: loadingTrigger === 'click' ? 'pointer' : 'default',
                    ...style
                }}
                {...triggerProps}
            >
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', marginBottom: '8px' }}>📦</div>
                    <div>
                        {loadingTrigger === 'click' && 'Click to load component'}
                        {loadingTrigger === 'hover' && 'Hover to load component'}
                        {loadingTrigger === 'viewport' && 'Component will load when visible'}
                    </div>
                </div>
            </div>
        );
    }

    if (!LazyComponent) {
        return <div className={className} style={style}>{fallback || defaultFallback}</div>;
    }

    return (
        <Suspense fallback={fallback || defaultFallback}>
            <div className={className} style={style}>
                <LazyComponent {...props} />
            </div>
        </Suspense>
    );
};

// Pre-configured lazy wrapper for common heavy components
export const LazyAnalyticsChart = (props: any) => (
    <LazyWrapper
        component={() => import('./AnalyticsChart')}
        loadingTrigger="viewport"
        {...props}
    />
);

export const LazyAggregateDataGrid = (props: any) => (
    <LazyWrapper
        component={() => import('./AggregateDataGrid')}
        loadingTrigger="viewport"
        {...props}
    />
);

export const LazyTrackerDataGrid = (props: any) => (
    <LazyWrapper
        component={() => import('./TrackerDataGrid')}
        loadingTrigger="viewport"
        {...props}
    />
);

export const LazyMetadataSelector = (props: any) => (
    <LazyWrapper
        component={() => import('./MetadataSelector')}
        loadingTrigger="hover"
        {...props}
    />
);

export default LazyWrapper;
