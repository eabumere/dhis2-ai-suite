import React from 'react';

interface LoadingSkeletonProps {
    type?: 'table' | 'card' | 'text' | 'avatar' | 'button' | 'chart';
    rows?: number;
    className?: string;
}

const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({
    type = 'text',
    rows = 3,
    className = ''
}) => {
    if (type === 'chart') {
        return (
            <div className={`skeleton-chart ${className}`} style={{
                border: '1px solid var(--color-border-light)',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                backgroundColor: 'var(--color-bg-primary)',
                boxShadow: 'var(--shadow-md)',
                minHeight: '300px',
                maxHeight: '60vh',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {/* Chart Title Skeleton */}
                <div style={{
                    marginBottom: 'var(--space-4)',
                    padding: 'var(--space-4) var(--space-6)',
                    background: 'linear-gradient(135deg, var(--color-gray-50), var(--color-gray-100))',
                    borderBottom: '1px solid var(--color-border-light)'
                }}>
                    <div className="skeleton" style={{
                        height: '24px',
                        width: '200px',
                        borderRadius: 'var(--radius-md)',
                        marginBottom: 'var(--space-2)'
                    }}></div>
                    <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
                        <div className="skeleton" style={{ height: '14px', width: '80px' }}></div>
                        <div className="skeleton" style={{ height: '14px', width: '60px' }}></div>
                        <div className="skeleton" style={{ height: '14px', width: '90px' }}></div>
                        <div className="skeleton" style={{ height: '14px', width: '70px' }}></div>
                    </div>
                </div>

                {/* Chart Controls Skeleton */}
                <div style={{
                    margin: 'var(--space-4) var(--space-6)',
                    background: 'linear-gradient(135deg, var(--color-gray-50), var(--color-gray-100))',
                    border: '1px solid var(--color-border-light)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--space-4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 'var(--space-4)',
                    flexWrap: 'wrap'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                        <div className="skeleton" style={{ height: '20px', width: '80px' }}></div>
                        <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                            <div className="skeleton" style={{ height: '32px', width: '65px', borderRadius: 'var(--radius-md)' }}></div>
                            <div className="skeleton" style={{ height: '32px', width: '65px', borderRadius: 'var(--radius-md)' }}></div>
                            <div className="skeleton" style={{ height: '32px', width: '65px', borderRadius: 'var(--radius-md)' }}></div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                        <div className="skeleton" style={{ height: '20px', width: '60px' }}></div>
                        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                            <div className="skeleton" style={{ height: '32px', width: '55px', borderRadius: 'var(--radius-md)' }}></div>
                            <div className="skeleton" style={{ height: '32px', width: '55px', borderRadius: 'var(--radius-md)' }}></div>
                            <div className="skeleton" style={{ height: '32px', width: '55px', borderRadius: 'var(--radius-md)' }}></div>
                            <div className="skeleton" style={{ height: '32px', width: '55px', borderRadius: 'var(--radius-md)' }}></div>
                        </div>
                    </div>
                </div>

                {/* Chart Area Skeleton */}
                <div style={{
                    flex: 1,
                    border: '1px solid var(--color-border-light)',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                    backgroundColor: 'var(--color-bg-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative'
                }}>
                    <div style={{
                        position: 'absolute',
                        top: '20%',
                        left: '10%',
                        right: '10%',
                        bottom: '20%',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-4)'
                    }}>
                        {/* Mock chart bars/lines */}
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'end', gap: 'var(--space-2)', height: '40px' }}>
                                <div className="skeleton" style={{
                                    width: '60px',
                                    height: '16px',
                                    marginRight: 'var(--space-2)'
                                }}></div>
                                {Array.from({ length: 8 }).map((_, j) => (
                                    <div key={j} className="skeleton" style={{
                                        width: '30px',
                                        height: `${Math.random() * 30 + 10}px`,
                                        flexShrink: 0
                                    }}></div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (type === 'table') {
        return (
            <div className={`skeleton-table ${className}`}>
                {/* Table Header Skeleton */}
                <div className="skeleton-table-row" style={{
                    borderBottom: '2px solid var(--color-gray-300)',
                    marginBottom: 'var(--space-2)'
                }}>
                    <div className="skeleton skeleton-table-cell" style={{ flex: '0 0 200px' }}>
                        <div className="skeleton-text" style={{ width: '80%' }}></div>
                    </div>
                    <div className="skeleton skeleton-table-cell" style={{ flex: '0 0 150px' }}>
                        <div className="skeleton-text" style={{ width: '90%' }}></div>
                    </div>
                    <div className="skeleton skeleton-table-cell" style={{ flex: '0 0 150px' }}>
                        <div className="skeleton-text" style={{ width: '70%' }}></div>
                    </div>
                    <div className="skeleton skeleton-table-cell" style={{ flex: '0 0 120px' }}>
                        <div className="skeleton-text" style={{ width: '85%' }}></div>
                    </div>
                    <div className="skeleton skeleton-table-cell" style={{ flex: '0 0 140px' }}>
                        <div className="skeleton-text" style={{ width: '75%' }}></div>
                    </div>
                </div>

                {/* Table Rows Skeleton */}
                {Array.from({ length: rows }).map((_, index) => (
                    <div key={index} className="skeleton-table-row">
                        <div className="skeleton skeleton-table-cell">
                            <div className="skeleton-text" style={{ width: '85%' }}></div>
                        </div>
                        <div className="skeleton skeleton-table-cell">
                            <div className="skeleton-text" style={{ width: '65%' }}></div>
                        </div>
                        <div className="skeleton skeleton-table-cell">
                            <div className="skeleton-text" style={{ width: '75%' }}></div>
                        </div>
                        <div className="skeleton skeleton-table-cell">
                            <div className="skeleton-text" style={{ width: '55%' }}></div>
                        </div>
                        <div className="skeleton skeleton-table-cell">
                            <div className="skeleton-text" style={{ width: '45%' }}></div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (type === 'card') {
        return (
            <div className={`skeleton-card ${className}`} style={{
                padding: 'var(--space-4)',
                border: '1px solid var(--color-border-light)',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'var(--color-bg-primary)'
            }}>
                <div className="skeleton skeleton-avatar" style={{
                    marginBottom: 'var(--space-3)'
                }}></div>
                <div className="skeleton skeleton-text" style={{ width: '90%' }}></div>
                <div className="skeleton skeleton-text" style={{ width: '75%' }}></div>
                <div className="skeleton skeleton-text" style={{ width: '60%' }}></div>
            </div>
        );
    }

    if (type === 'avatar') {
        return <div className={`skeleton skeleton-avatar ${className}`}></div>;
    }

    if (type === 'button') {
        return <div className={`skeleton skeleton-button ${className}`}></div>;
    }

    // Default text skeleton
    return (
        <div className={className}>
            {Array.from({ length: rows }).map((_, index) => (
                <div key={index} className="skeleton skeleton-text"></div>
            ))}
        </div>
    );
};

export default LoadingSkeleton;
