import React, { FC, ReactNode, useEffect, useRef } from 'react';

export type ModalSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    children: ReactNode;
    size?: ModalSize;
    showCloseButton?: boolean;
    closeOnBackdropClick?: boolean;
    closeOnEscape?: boolean;
    className?: string;
    footer?: ReactNode;
    centered?: boolean;
}

const Modal: FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    children,
    size = 'md',
    showCloseButton = true,
    closeOnBackdropClick = true,
    closeOnEscape = true,
    className = '',
    footer,
    centered = true
}) => {
    const modalRef = useRef<HTMLDivElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    // Handle escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (closeOnEscape && e.key === 'Escape') {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            // Store the currently focused element
            previousFocusRef.current = document.activeElement as HTMLElement;
            // Focus the modal
            setTimeout(() => {
                modalRef.current?.focus();
            }, 100);
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            // Restore focus when modal closes
            if (!isOpen && previousFocusRef.current) {
                previousFocusRef.current.focus();
            }
        };
    }, [isOpen, closeOnEscape, onClose]);

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }

        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    const getSizeStyles = (): React.CSSProperties => {
        switch (size) {
            case 'xs':
                return { maxWidth: '300px', width: '90vw' };
            case 'sm':
                return { maxWidth: '400px', width: '90vw' };
            case 'md':
                return { maxWidth: '500px', width: '90vw' };
            case 'lg':
                return { maxWidth: '700px', width: '90vw' };
            case 'xl':
                return { maxWidth: '900px', width: '90vw' };
            case 'full':
                return { maxWidth: '95vw', width: '95vw', maxHeight: '95vh' };
            default:
                return { maxWidth: '500px', width: '90vw' };
        }
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (closeOnBackdropClick && e.target === e.currentTarget) {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: centered ? 'center' : 'flex-start',
                justifyContent: 'center',
                zIndex: 1050,
                padding: '1rem',
                animation: 'modal-fade-in 0.2s ease-out'
            }}
            onClick={handleBackdropClick}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? "modal-title" : undefined}
        >
            <div
                ref={modalRef}
                tabIndex={-1}
                style={{
                    backgroundColor: 'var(--color-bg-primary)',
                    borderRadius: '12px',
                    boxShadow: 'var(--shadow-2xl)',
                    ...getSizeStyles(),
                    maxHeight: size === 'full' ? '95vh' : '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    animation: 'modal-slide-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                    outline: 'none'
                }}
                className={className}
            >
                {/* Header */}
                {(title || showCloseButton) && (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '1.5rem 1.5rem 1rem 1.5rem',
                            borderBottom: title ? '1px solid var(--color-border-light)' : 'none'
                        }}
                    >
                        {title && (
                            <h2
                                id="modal-title"
                                style={{
                                    margin: 0,
                                    fontSize: '1.25rem',
                                    fontWeight: '600',
                                    color: 'var(--color-text-primary)',
                                    flex: 1
                                }}
                            >
                                {title}
                            </h2>
                        )}

                        {showCloseButton && (
                            <button
                                onClick={onClose}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: '0.5rem',
                                    cursor: 'pointer',
                                    borderRadius: '6px',
                                    color: 'var(--color-text-secondary)',
                                    fontSize: '1.25rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '32px',
                                    height: '32px',
                                    transition: 'all var(--transition-fast)'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = 'var(--color-gray-100)';
                                    e.currentTarget.style.color = 'var(--color-text-primary)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    e.currentTarget.style.color = 'var(--color-text-secondary)';
                                }}
                                aria-label="Close modal"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                )}

                {/* Body */}
                <div
                    style={{
                        flex: 1,
                        padding: '1.5rem',
                        overflowY: 'auto',
                        maxHeight: size === 'full' ? 'calc(95vh - 140px)' : 'calc(90vh - 140px)'
                    }}
                >
                    {children}
                </div>

                {/* Footer */}
                {footer && (
                    <div
                        style={{
                            padding: '1rem 1.5rem 1.5rem 1.5rem',
                            borderTop: '1px solid var(--color-border-light)',
                            display: 'flex',
                            gap: '0.75rem',
                            justifyContent: 'flex-end'
                        }}
                    >
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
};

// Compound component for common modal patterns
export const ModalHeader: FC<{ children: ReactNode; className?: string }> = ({ children, className = '' }) => (
    <div
        className={className}
        style={{
            padding: '1.5rem 1.5rem 1rem 1.5rem',
            borderBottom: '1px solid var(--color-border-light)'
        }}
    >
        {children}
    </div>
);

export const ModalBody: FC<{ children: ReactNode; className?: string }> = ({ children, className = '' }) => (
    <div
        className={className}
        style={{
            flex: 1,
            padding: '1.5rem',
            overflowY: 'auto'
        }}
    >
        {children}
    </div>
);

export const ModalFooter: FC<{ children: ReactNode; className?: string }> = ({ children, className = '' }) => (
    <div
        className={className}
        style={{
            padding: '1rem 1.5rem 1.5rem 1.5rem',
            borderTop: '1px solid var(--color-border-light)',
            display: 'flex',
            gap: '0.75rem',
            justifyContent: 'flex-end'
        }}
    >
        {children}
    </div>
);

export default Modal;
