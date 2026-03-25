import React, { FC, useState, useRef, useEffect, useCallback } from 'react';

export interface OptimizedImageProps {
    src: string;
    alt: string;
    width?: number;
    height?: number;
    className?: string;
    style?: React.CSSProperties;
    placeholder?: string;
    loading?: 'lazy' | 'eager';
    quality?: number;
    sizes?: string;
    onLoad?: () => void;
    onError?: () => void;
    priority?: boolean;
    blurDataURL?: string;
}

const OptimizedImage: FC<OptimizedImageProps> = ({
    src,
    alt,
    width,
    height,
    className = '',
    style = {},
    placeholder,
    loading = 'lazy',
    quality = 75,
    sizes,
    onLoad,
    onError,
    priority = false,
    blurDataURL
}) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const [isError, setIsError] = useState(false);
    const [isInView, setIsInView] = useState(!loading || loading === 'eager');
    const imgRef = useRef<HTMLImageElement>(null);
    const observerRef = useRef<IntersectionObserver | null>(null);

    // Intersection Observer for lazy loading
    useEffect(() => {
        if (loading === 'lazy' && !priority && !isInView) {
            observerRef.current = new IntersectionObserver(
                ([entry]) => {
                    if (entry.isIntersecting) {
                        setIsInView(true);
                        observerRef.current?.disconnect();
                    }
                },
                {
                    rootMargin: '50px',
                    threshold: 0.1
                }
            );

            if (imgRef.current) {
                observerRef.current.observe(imgRef.current);
            }

            return () => observerRef.current?.disconnect();
        }
    }, [loading, priority, isInView]);

    // Handle image load
    const handleLoad = useCallback(() => {
        setIsLoaded(true);
        setIsError(false);
        onLoad?.();
    }, [onLoad]);

    // Handle image error
    const handleError = useCallback(() => {
        setIsError(true);
        setIsLoaded(false);
        onError?.();
    }, [onError]);

    // Generate responsive image sources (if needed)
    const generateSrcSet = useCallback((src: string, quality: number) => {
        // This is a simplified version - in a real implementation,
        // you might want to generate multiple sizes
        return `${src}?quality=${quality}`;
    }, []);

    const imageSrc = isInView ? generateSrcSet(src, quality) : placeholder || blurDataURL;

    const combinedStyles: React.CSSProperties = {
        transition: 'opacity 0.3s ease-in-out, filter 0.3s ease-in-out',
        opacity: isLoaded ? 1 : 0.7,
        filter: isLoaded ? 'none' : 'blur(10px)',
        ...style
    };

    const placeholderStyles: React.CSSProperties = {
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: blurDataURL ? 'transparent' : '#f0f0f0',
        backgroundImage: blurDataURL ? `url(${blurDataURL})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        transition: 'opacity 0.3s ease-in-out',
        opacity: isLoaded ? 0 : 1,
        filter: blurDataURL ? 'blur(10px)' : 'none'
    };

    return (
        <div
            className={`optimized-image-container ${className}`}
            style={{
                position: 'relative',
                overflow: 'hidden',
                display: 'inline-block',
                width: width || 'auto',
                height: height || 'auto',
                backgroundColor: '#f0f0f0'
            }}
        >
            {/* Placeholder/Blur background */}
            {!isLoaded && (placeholder || blurDataURL) && (
                <div style={placeholderStyles} />
            )}

            {/* Main image */}
            {isInView && (
                <img
                    ref={imgRef}
                    src={imageSrc}
                    alt={alt}
                    width={width}
                    height={height}
                    sizes={sizes}
                    loading={priority ? 'eager' : loading}
                    decoding="async"
                    style={combinedStyles}
                    onLoad={handleLoad}
                    onError={handleError}
                    className="optimized-image"
                />
            )}

            {/* Error state */}
            {isError && (
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#f8f9fa',
                        color: '#6c757d',
                        fontSize: '14px',
                        textAlign: 'center',
                        padding: '8px'
                    }}
                >
                    <div>
                        <div style={{ fontSize: '24px', marginBottom: '4px' }}>🖼️</div>
                        <div>Failed to load image</div>
                    </div>
                </div>
            )}

            {/* Loading state */}
            {!isLoaded && !isError && isInView && (
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '24px',
                        height: '24px',
                        border: '2px solid #e9ecef',
                        borderTop: '2px solid #007bff',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                    }}
                />
            )}
        </div>
    );
};

// Service Worker helper for caching images
export const registerImageCache = () => {
    if ('serviceWorker' in navigator && 'caches' in window) {
        navigator.serviceWorker.register('/sw.js').then(registration => {
            console.log('Service Worker registered for image caching');
        });
    }
};

// Image preloader utility
export const preloadImage = (src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = src;
    });
};

// Batch image preloader
export const preloadImages = (srcs: string[]): Promise<void[]> => {
    return Promise.all(srcs.map(src => preloadImage(src)));
};

export default OptimizedImage;
