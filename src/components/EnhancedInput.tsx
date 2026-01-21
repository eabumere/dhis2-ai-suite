import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import i18n from '@dhis2/d2-i18n';

export interface FileAttachment {
    file: File;
    id: string;
    name: string;
    size: number;
    type: string;
    preview?: string;
}

export interface EnhancedInputProps {
    value: string;
    onChange: (value: string) => void;
    onSubmit: (text: string, attachments: FileAttachment[]) => void;
    disabled?: boolean;
    placeholder?: string;
    isProcessing?: boolean;
    showValidation?: boolean;
}

interface ValidationState {
    isValid: boolean;
    message: string;
    type: 'info' | 'warning' | 'error';
}

interface TooltipProps {
    content: string;
    children: React.ReactNode;
    position?: 'top' | 'bottom' | 'left' | 'right';
}

const Tooltip: React.FC<TooltipProps> = ({ content, children, position = 'top' }) => {
    const [showTooltip, setShowTooltip] = useState(false);

    const getTooltipStyle = (): React.CSSProperties => {
        const baseStyle: React.CSSProperties = {
            position: 'absolute',
            backgroundColor: '#333',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            whiteSpace: 'nowrap',
            zIndex: 1000,
            pointerEvents: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
        };

        switch (position) {
            case 'top':
                return { ...baseStyle, bottom: '100%', left: '50%', transform: 'translateX(-50%) translateY(-4px)' };
            case 'bottom':
                return { ...baseStyle, top: '100%', left: '50%', transform: 'translateX(-50%) translateY(4px)' };
            case 'left':
                return { ...baseStyle, right: '100%', top: '50%', transform: 'translateY(-50%) translateX(-4px)' };
            case 'right':
                return { ...baseStyle, left: '100%', top: '50%', transform: 'translateY(-50%) translateX(4px)' };
            default:
                return baseStyle;
        }
    };

    return (
        <div
            style={{ position: 'relative', display: 'inline-block' }}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
        >
            {children}
            {showTooltip && (
                <div style={getTooltipStyle()}>
                    {content}
                </div>
            )}
        </div>
    );
};

const EnhancedInput: React.FC<EnhancedInputProps> = ({
    value,
    onChange,
    onSubmit,
    disabled = false,
    placeholder = i18n.t('Ask me anything about DHIS2...'),
    isProcessing = false,
    showValidation = true
}) => {
    const [attachments, setAttachments] = useState<FileAttachment[]>([]);
    const [dragOver, setDragOver] = useState(false);
    const [validation, setValidation] = useState<ValidationState | null>(null);
    const [isFocused, setIsFocused] = useState(false);
    const [fileProcessing, setFileProcessing] = useState<Set<string>>(new Set());
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Validation logic
    const validateInput = useCallback((input: string, files: FileAttachment[]): ValidationState | null => {
        if (!showValidation) return null;

        // Check for empty input
        if (!input.trim() && files.length === 0) {
            return {
                isValid: false,
                message: 'Please enter a question or attach a file',
                type: 'info'
            };
        }

        // Check input length
        if (input.length > 1000) {
            return {
                isValid: false,
                message: 'Input is too long (max 1000 characters)',
                type: 'warning'
            };
        }

        // Check for potentially problematic content
        const suspiciousPatterns = [
            /<script/i,
            /javascript:/i,
            /on\w+\s*=/i,
            /<iframe/i,
            /<object/i
        ];

        if (suspiciousPatterns.some(pattern => pattern.test(input))) {
            return {
                isValid: false,
                message: 'Input contains potentially unsafe content',
                type: 'error'
            };
        }

        // Check file types
        const allowedExtensions = ['.csv', '.xlsx', '.xls', '.json', '.txt', '.pdf', '.png', '.jpg', '.jpeg'];
        const invalidFiles = files.filter(file => {
            const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
            return !allowedExtensions.includes(ext);
        });

        if (invalidFiles.length > 0) {
            return {
                isValid: false,
                message: `Unsupported file type(s): ${invalidFiles.map(f => f.name).join(', ')}`,
                type: 'warning'
            };
        }

        // Check total file size
        const totalSize = files.reduce((sum, file) => sum + file.size, 0);
        const maxTotalSize = 50 * 1024 * 1024; // 50MB

        if (totalSize > maxTotalSize) {
            return {
                isValid: false,
                message: `Total file size exceeds limit (${formatFileSize(totalSize)} > ${formatFileSize(maxTotalSize)})`,
                type: 'warning'
            };
        }

        // Success validation
        if (input.trim()) {
            return {
                isValid: true,
                message: 'Ready to send',
                type: 'info'
            };
        }

        return null;
    }, [showValidation]);

    // Debounced validation
    const debouncedValidation = useMemo(() => {
        let timeoutId: NodeJS.Timeout;
        return (input: string, files: FileAttachment[]) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                const validationResult = validateInput(input, files);
                setValidation(validationResult);
            }, 300);
        };
    }, [validateInput]);

    useEffect(() => {
        debouncedValidation(value, attachments);
    }, [value, attachments, debouncedValidation]);

    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const getFileIcon = (fileName: string): string => {
        const ext = fileName.toLowerCase().split('.').pop() || '';
        switch (ext) {
            case 'csv': return '📊';
            case 'xlsx':
            case 'xls': return '📈';
            case 'json': return '🔧';
            case 'txt': return '📄';
            case 'pdf': return '📕';
            case 'png':
            case 'jpg':
            case 'jpeg': return '🖼️';
            default: return '📎';
        }
    };

    const createFileAttachment = useCallback(async (file: File): Promise<FileAttachment> => {
        const attachment: FileAttachment = {
            file,
            id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: file.name,
            size: file.size,
            type: file.type
        };

        // Generate preview for images
        if (file.type.startsWith('image/') && file.size < 1024 * 1024) { // Only for images < 1MB
            try {
                const preview = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target?.result as string);
                    reader.readAsDataURL(file);
                });
                attachment.preview = preview;
            } catch (error) {
                console.warn('Failed to generate file preview:', error);
            }
        }

        return attachment;
    }, []);

    const handleFileSelect = useCallback(async (files: FileList | null) => {
        if (!files) return;

        const newAttachments: FileAttachment[] = [];
        const processingIds = new Set<string>();

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            // Basic validation - could be enhanced
            if (file.size > 10 * 1024 * 1024) { // 10MB limit
                console.warn(`File ${file.name} is too large (${formatFileSize(file.size)})`);
                continue;
            }

            const tempId = `temp_${Date.now()}_${i}`;
            processingIds.add(tempId);

            try {
                setFileProcessing(prev => new Set([...prev, tempId]));
                const attachment = await createFileAttachment(file);
                newAttachments.push(attachment);
            } catch (error) {
                console.error(`Failed to process file ${file.name}:`, error);
            } finally {
                processingIds.delete(tempId);
                setFileProcessing(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(tempId);
                    return newSet;
                });
            }
        }

        setAttachments(prev => [...prev, ...newAttachments]);
    }, [createFileAttachment, formatFileSize]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        handleFileSelect(e.dataTransfer.files);
    }, [handleFileSelect]);

    const removeAttachment = useCallback((attachmentId: string) => {
        setAttachments(prev => prev.filter(att => att.id !== attachmentId));
    }, []);

    const handleSubmit = useCallback(() => {
        if (!value.trim() && attachments.length === 0) return;
        onSubmit(value.trim(), attachments);
        onChange(''); // Clear input
        setAttachments([]); // Clear attachments
    }, [value, attachments, onSubmit, onChange]);

    const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    }, [handleSubmit]);

    return (
        <div style={{ width: '100%' }}>
            {/* Validation Messages */}
            {validation && showValidation && (
                <div style={{
                    marginBottom: '8px',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    backgroundColor: validation.type === 'error' ? '#ffebee' :
                                   validation.type === 'warning' ? '#fff3e0' : '#e3f2fd',
                    border: `1px solid ${validation.type === 'error' ? '#ffcdd2' :
                                        validation.type === 'warning' ? '#ffcc02' : '#bbdefb'}`,
                    color: validation.type === 'error' ? '#c62828' :
                           validation.type === 'warning' ? '#f57c00' : '#1976d2'
                }}>
                    <span style={{ fontWeight: 'bold' }}>
                        {validation.type === 'error' ? '❌ ' :
                         validation.type === 'warning' ? '⚠️ ' : 'ℹ️ '}
                    </span>
                    {validation.message}
                </div>
            )}

            {/* File Attachments Display */}
            {attachments.length > 0 && (
                <div style={{
                    marginBottom: '12px',
                    padding: '12px',
                    background: 'linear-gradient(135deg, var(--color-gray-50), var(--color-gray-100))',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border-light)',
                    boxShadow: 'var(--shadow-sm)'
                }}>
                    <div style={{
                        fontSize: '14px',
                        color: 'var(--color-primary-700)',
                        marginBottom: '8px',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}>
                        <span>📎</span>
                        <span>{attachments.length} file{attachments.length !== 1 ? 's' : ''} attached</span>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', fontWeight: 'normal' }}>
                            ({formatFileSize(attachments.reduce((sum, f) => sum + f.size, 0))} total)
                        </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {attachments.map((attachment) => (
                            <div
                                key={attachment.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '8px 12px',
                                    backgroundColor: 'var(--color-bg-primary)',
                                    border: '1px solid var(--color-border-light)',
                                    borderRadius: '6px',
                                    fontSize: '13px',
                                    boxShadow: 'var(--shadow-sm)',
                                    transition: 'all var(--transition-fast)',
                                    maxWidth: '280px'
                                }}
                                className="hover-lift"
                            >
                                {/* File Preview for Images */}
                                {attachment.preview ? (
                                    <img
                                        src={attachment.preview}
                                        alt={attachment.name}
                                        style={{
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: '4px',
                                            objectFit: 'cover',
                                            border: '1px solid var(--color-border-light)'
                                        }}
                                    />
                                ) : (
                                    <span style={{ fontSize: '16px' }}>
                                        {getFileIcon(attachment.name)}
                                    </span>
                                )}

                                {/* File Info */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        fontWeight: '500',
                                        color: 'var(--color-text-primary)',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}
                                    title={attachment.name}>
                                        {attachment.name}
                                    </div>
                                    <div style={{
                                        fontSize: '11px',
                                        color: 'var(--color-text-secondary)',
                                        marginTop: '2px'
                                    }}>
                                        {formatFileSize(attachment.size)}
                                    </div>
                                </div>

                                {/* Remove Button */}
                                <Tooltip content="Remove file">
                                    <button
                                        onClick={() => removeAttachment(attachment.id)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: 'var(--color-error)',
                                            cursor: 'pointer',
                                            padding: '4px',
                                            borderRadius: '50%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: '20px',
                                            height: '20px',
                                            transition: 'all var(--transition-fast)',
                                            fontSize: '14px'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = 'var(--color-error-light)';
                                            e.currentTarget.style.color = 'var(--color-bg-primary)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = 'transparent';
                                            e.currentTarget.style.color = 'var(--color-error)';
                                        }}
                                        title="Remove file"
                                        aria-label={`Remove ${attachment.name}`}
                                    >
                                        ✕
                                    </button>
                                </Tooltip>
                            </div>
                        ))}

                        {/* Processing Files Indicator */}
                        {fileProcessing.size > 0 && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 12px',
                                backgroundColor: 'var(--color-bg-secondary)',
                                border: '1px solid var(--color-border-light)',
                                borderRadius: '6px',
                                fontSize: '13px',
                                color: 'var(--color-text-secondary)',
                                animation: 'pulse 2s infinite'
                            }}>
                                <div style={{
                                    width: '16px',
                                    height: '16px',
                                    border: '2px solid var(--color-primary)',
                                    borderTop: '2px solid transparent',
                                    borderRadius: '50%',
                                    animation: 'spin 1s linear infinite'
                                }} />
                                <span>Processing {fileProcessing.size} file{fileProcessing.size !== 1 ? 's' : ''}...</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Input Area with Drag & Drop */}
            <div
                style={{
                    position: 'relative',
                    border: dragOver ? '2px dashed var(--color-primary)' :
                           isFocused ? '2px solid var(--color-primary)' : '1px solid var(--color-border-light)',
                    borderRadius: '12px',
                    backgroundColor: dragOver ? 'var(--color-primary-50)' : 'var(--color-bg-primary)',
                    transition: 'all var(--transition-fast)',
                    boxShadow: dragOver ? 'var(--shadow-lg)' :
                             isFocused ? 'var(--shadow-md)' : 'var(--shadow-sm)'
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {/* Drag overlay */}
                {dragOver && (
                    <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'linear-gradient(135deg, var(--color-primary-50), var(--color-primary-100))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '10px',
                        zIndex: 10,
                        pointerEvents: 'none',
                        animation: 'pulse 2s infinite'
                    }}>
                        <div style={{
                            textAlign: 'center',
                            color: 'var(--color-primary)',
                            fontWeight: '600',
                            fontSize: '18px'
                        }}>
                            📂 Drop files here to attach
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', gap: '12px', padding: '16px', alignItems: 'flex-end' }}>
                    {/* File Upload Button */}
                    <Tooltip content="Attach CSV, Excel, JSON, PDF, or image files. Max 50MB total.">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={disabled || isProcessing}
                            style={{
                                padding: '12px',
                                backgroundColor: 'var(--color-bg-secondary)',
                                border: '1px solid var(--color-border-light)',
                                borderRadius: '8px',
                                cursor: disabled || isProcessing ? 'not-allowed' : 'pointer',
                                color: disabled || isProcessing ? 'var(--color-text-disabled)' : 'var(--color-text-primary)',
                                fontSize: '16px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all var(--transition-fast)',
                                width: '48px',
                                height: '48px'
                            }}
                            onMouseEnter={(e) => {
                                if (!(disabled || isProcessing)) {
                                    e.currentTarget.style.backgroundColor = 'var(--color-primary-50)';
                                    e.currentTarget.style.borderColor = 'var(--color-primary)';
                                    e.currentTarget.style.color = 'var(--color-primary)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!(disabled || isProcessing)) {
                                    e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary)';
                                    e.currentTarget.style.borderColor = 'var(--color-border-light)';
                                    e.currentTarget.style.color = 'var(--color-text-primary)';
                                }
                            }}
                            title="Attach files"
                            aria-label="Attach files"
                        >
                            📎
                        </button>
                    </Tooltip>

                    {/* Hidden File Input */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".csv,.xlsx,.xls,.json,.txt,.pdf,.png,.jpg,.jpeg"
                        onChange={(e) => handleFileSelect(e.target.files)}
                        style={{ display: 'none' }}
                        aria-label="File upload"
                    />

                    {/* Text Input Container */}
                    <div style={{ flex: 1, position: 'relative' }}>
                        <textarea
                            ref={textareaRef}
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            onFocus={() => setIsFocused(true)}
                            onBlur={() => setIsFocused(false)}
                            onKeyPress={handleKeyPress}
                            placeholder={placeholder}
                            disabled={disabled || isProcessing}
                            rows={value.split('\n').length > 3 ? Math.min(value.split('\n').length, 6) : 1}
                            style={{
                                width: '100%',
                                padding: '12px 16px',
                                fontSize: '16px',
                                border: 'none',
                                outline: 'none',
                                resize: 'vertical',
                                minHeight: '48px',
                                maxHeight: '200px',
                                fontFamily: 'inherit',
                                lineHeight: '1.5',
                                color: disabled || isProcessing ? 'var(--color-text-disabled)' : 'var(--color-text-primary)',
                                backgroundColor: 'transparent'
                            }}
                            aria-label="Message input"
                            aria-describedby={value.length > 900 ? "char-counter" : undefined}
                        />

                        {/* Character Counter */}
                        {value.length > 800 && (
                            <div
                                id="char-counter"
                                style={{
                                    position: 'absolute',
                                    bottom: '8px',
                                    right: '12px',
                                    fontSize: '11px',
                                    color: value.length > 1000 ? 'var(--color-error)' :
                                           value.length > 950 ? 'var(--color-warning)' : 'var(--color-text-secondary)',
                                    backgroundColor: 'var(--color-bg-primary)',
                                    padding: '2px 6px',
                                    borderRadius: '10px',
                                    border: value.length > 1000 ? '1px solid var(--color-error)' : 'none'
                                }}
                            >
                                {value.length}/1000
                            </div>
                        )}
                    </div>

                    {/* Send Button */}
                    <Tooltip content={isProcessing ? "Processing your request..." : "Send message"}>
                        <button
                            onClick={handleSubmit}
                            disabled={disabled || isProcessing || (!value.trim() && attachments.length === 0)}
                            style={{
                                padding: '12px 20px',
                                fontSize: '15px',
                                fontWeight: '600',
                                backgroundColor: (disabled || isProcessing || (!value.trim() && attachments.length === 0))
                                    ? 'var(--color-gray-300)'
                                    : 'var(--color-primary)',
                                color: (disabled || isProcessing || (!value.trim() && attachments.length === 0))
                                    ? 'var(--color-text-disabled)'
                                    : 'var(--color-text-inverse)',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: (disabled || isProcessing || (!value.trim() && attachments.length === 0))
                                    ? 'not-allowed'
                                    : 'pointer',
                                whiteSpace: 'nowrap',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all var(--transition-fast)',
                                minWidth: '80px',
                                height: '48px',
                                justifyContent: 'center',
                                boxShadow: (disabled || isProcessing || (!value.trim() && attachments.length === 0))
                                    ? 'none'
                                    : 'var(--shadow-sm)'
                            }}
                            onMouseEnter={(e) => {
                                if (!(disabled || isProcessing || (!value.trim() && attachments.length === 0))) {
                                    e.currentTarget.style.backgroundColor = 'var(--color-primary-600)';
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                    e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!(disabled || isProcessing || (!value.trim() && attachments.length === 0))) {
                                    e.currentTarget.style.backgroundColor = 'var(--color-primary)';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                                }
                            }}
                            aria-label={isProcessing ? "Processing" : "Send message"}
                        >
                            {isProcessing ? (
                                <>
                                    <div style={{
                                        width: '16px',
                                        height: '16px',
                                        border: '2px solid var(--color-text-inverse)',
                                        borderTop: '2px solid transparent',
                                        borderRadius: '50%',
                                        animation: 'spin 1s linear infinite'
                                    }} />
                                    <span style={{ fontSize: '13px' }}>
                                        {i18n.t('Processing...')}
                                    </span>
                                </>
                            ) : (
                                <>
                                    <span style={{ fontSize: '16px' }}>✈️</span>
                                    <span>{i18n.t('Send')}</span>
                                </>
                            )}
                        </button>
                    </Tooltip>
                </div>

                {/* Footer with hints and keyboard shortcuts */}
                {!dragOver && (
                    <div style={{
                        padding: '8px 16px',
                        fontSize: '12px',
                        color: 'var(--color-text-secondary)',
                        textAlign: 'center',
                        borderTop: '1px solid var(--color-border-light)',
                        backgroundColor: 'var(--color-gray-50)',
                        borderRadius: '0 0 12px 12px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>💡 Drag & drop files or click 📎 to attach</span>
                            <span style={{ fontSize: '11px', opacity: 0.7 }}>
                                Press Enter to send • Shift+Enter for new line
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EnhancedInput;
