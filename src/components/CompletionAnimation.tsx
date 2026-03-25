import React, { FC, useEffect, useState } from 'react';

export type CompletionType = 'success' | 'complete' | 'finished' | 'done';

interface CompletionAnimationProps {
    type?: CompletionType;
    message?: string;
    showConfetti?: boolean;
    className?: string;
    autoHide?: boolean;
    duration?: number;
    onComplete?: () => void;
}

const CompletionAnimation: FC<CompletionAnimationProps> = ({
    type = 'complete',
    message,
    showConfetti = false,
    className = '',
    autoHide = true,
    duration = 2500,
    onComplete
}) => {
    const [isVisible, setIsVisible] = useState(true);
    const [showParticles, setShowParticles] = useState(false);

    useEffect(() => {
        // Trigger particle animation after checkmark
        const particleTimer = setTimeout(() => {
            if (showConfetti) {
                setShowParticles(true);
            }
        }, 600);

        // Auto-hide timer
        if (autoHide && duration > 0) {
            const hideTimer = setTimeout(() => {
                setIsVisible(false);
                onComplete?.();
            }, duration);
            return () => {
                clearTimeout(particleTimer);
                clearTimeout(hideTimer);
            };
        }

        return () => clearTimeout(particleTimer);
    }, [autoHide, duration, showConfetti, onComplete]);

    const getIcon = (type: CompletionType) => {
        switch (type) {
            case 'success':
                return '✅';
            case 'complete':
                return '🎉';
            case 'finished':
                return '🏁';
            case 'done':
                return '✨';
            default:
                return '✅';
        }
    };

    const getColors = (type: CompletionType) => {
        switch (type) {
            case 'success':
                return {
                    bg: 'linear-gradient(135deg, #e8f5e8, #f1f8e9)',
                    border: '#4caf50',
                    iconBg: '#4caf50',
                    text: '#2e7d32',
                    particle: '#4caf50'
                };
            case 'complete':
                return {
                    bg: 'linear-gradient(135deg, #e3f2fd, #f3e5f5)',
                    border: '#2196f3',
                    iconBg: '#2196f3',
                    text: '#0d47a1',
                    particle: '#2196f3'
                };
            case 'finished':
                return {
                    bg: 'linear-gradient(135deg, #fff3e0, #fce4ec)',
                    border: '#ff9800',
                    iconBg: '#ff9800',
                    text: '#e65100',
                    particle: '#ff9800'
                };
            case 'done':
                return {
                    bg: 'linear-gradient(135deg, #f3e5f5, #fce4ec)',
                    border: '#9c27b0',
                    iconBg: '#9c27b0',
                    text: '#4a148c',
                    particle: '#9c27b0'
                };
            default:
                return {
                    bg: 'linear-gradient(135deg, #e8f5e8, #f1f8e9)',
                    border: '#4caf50',
                    iconBg: '#4caf50',
                    text: '#2e7d32',
                    particle: '#4caf50'
                };
        }
    };

    const icon = getIcon(type);
    const colors = getColors(type);

    if (!isVisible) return null;

    return (
        <div
            className={`completion-animation ${className}`}
            style={{
                position: 'relative',
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '16px',
                padding: '24px 32px',
                background: colors.bg,
                border: `2px solid ${colors.border}`,
                borderRadius: '16px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
                animation: 'completion-bounce-in 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                transform: isVisible ? 'scale(1)' : 'scale(0.8)',
                opacity: isVisible ? 1 : 0,
                transition: 'all 0.3s ease',
                overflow: 'hidden'
            }}
        >
            {/* Main Icon with Checkmark Animation */}
            <div
                className="completion-icon"
                style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    backgroundColor: colors.iconBg,
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '36px',
                    animation: 'completion-checkmark 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
                    position: 'relative',
                    zIndex: 2
                }}
            >
                {icon}
            </div>

            {/* Success Message */}
            {message && (
                <div
                    style={{
                        textAlign: 'center',
                        fontSize: '18px',
                        fontWeight: '600',
                        color: colors.text,
                        animation: 'completion-slide-up 0.6s ease-out 0.3s both',
                        maxWidth: '300px'
                    }}
                >
                    {message}
                </div>
            )}

            {/* Confetti Particles */}
            {showParticles && showConfetti && (
                <div
                    className="confetti-container"
                    style={{
                        position: 'absolute',
                        top: '10px',
                        left: '10px',
                        right: '10px',
                        bottom: '10px',
                        pointerEvents: 'none',
                        zIndex: 1
                    }}
                >
                    {Array.from({ length: 20 }).map((_, i) => (
                        <div
                            key={i}
                            className="confetti-particle"
                            style={{
                                position: 'absolute',
                                width: '8px',
                                height: '8px',
                                backgroundColor: colors.particle,
                                borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                                animation: `confetti-fall-${i % 3} ${2 + Math.random()}s ease-out both`,
                                left: `${10 + Math.random() * 80}%`,
                                animationDelay: `${Math.random() * 0.5}s`,
                                opacity: 0.8
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Ripple Effect */}
            <div
                className="completion-ripple"
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: '120px',
                    height: '120px',
                    border: `2px solid ${colors.iconBg}40`,
                    borderRadius: '50%',
                    transform: 'translate(-50%, -50%)',
                    animation: 'completion-ripple 1.2s ease-out',
                    pointerEvents: 'none'
                }}
            />
        </div>
    );
};

export default CompletionAnimation;
