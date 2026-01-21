import React, { useState, useRef, useCallback, useEffect } from 'react';
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
    const fileInputRef = useRef<HTMLInputElement>(null);

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

    // Real-time validation
    useEffect(() => {
        const validationResult = validateInput(value, attachments);
        setValidation(validationResult);
    }, [value, attachments, validateInput]);

    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const createFileAttachment = (file: File): FileAttachment => ({
        file,
        id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        size: file.size,
        type: file.type
    });

    const handleFileSelect = useCallback((files: FileList | null) => {
        if (!files) return;

        const newAttachments: FileAttachment[] = [];
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            // Basic validation - could be enhanced
            if (file.size > 10 * 1024 * 1024) { // 10MB limit
                console.warn(`File ${file.name} is too large (${formatFileSize(file.size)})`);
                continue;
            }
            newAttachments.push(createFileAttachment(file));
        }

        setAttachments(prev => [...prev, ...newAttachments]);
    }, []);

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
                    marginBottom: '8px',
                    padding: '8px',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '4px',
                    border: '1px solid #e9ecef'
                }}>
                    <div style={{
                        fontSize: '12px',
                        color: '#6c757d',
                        marginBottom: '4px',
                        fontWeight: 'bold'
                    }}>
                        📎 {attachments.length} file{attachments.length !== 1 ? 's' : ''} attached
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {attachments.map((attachment) => (
                            <div
                                key={attachment.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '4px 8px',
                                    backgroundColor: '#ffffff',
                                    border: '1px solid #dee2e6',
                                    borderRadius: '4px',
                                    fontSize: '12px'
                                }}
                            >
                                <span style={{ color: '#495057' }}>
                                    📄 {attachment.name}
                                </span>
                                <span style={{ color: '#6c757d' }}>
                                    ({formatFileSize(attachment.size)})
                                </span>
                                <button
                                    onClick={() => removeAttachment(attachment.id)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#dc3545',
                                        cursor: 'pointer',
                                        padding: '0',
                                        fontSize: '14px',
                                        lineHeight: 1
                                    }}
                                    title="Remove file"
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Input Area with Drag & Drop */}
            <div
                style={{
                    position: 'relative',
                    border: dragOver ? '2px dashed #007bff' : '1px solid #ccc',
                    borderRadius: '8px',
                    backgroundColor: dragOver ? '#f8f9ff' : '#ffffff',
                    transition: 'all 0.2s ease'
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
                        backgroundColor: 'rgba(0, 123, 255, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '6px',
                        zIndex: 10,
                        pointerEvents: 'none'
                    }}>
                        <div style={{
                            textAlign: 'center',
                            color: '#007bff',
                            fontWeight: 'bold'
                        }}>
                            📂 Drop files here
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', gap: '8px', padding: '12px' }}>
                    {/* File Upload Button */}
                    <Tooltip content="Attach CSV, Excel, JSON, PDF, or image files. Max 50MB total.">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={disabled || isProcessing}
                            style={{
                                padding: '8px',
                                backgroundColor: '#f8f9fa',
                                border: '1px solid #dee2e6',
                                borderRadius: '4px',
                                cursor: disabled || isProcessing ? 'not-allowed' : 'pointer',
                                color: '#495057',
                                fontSize: '14px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}
                            title="Attach files"
                        >
                            📎
                        </button>
                    </Tooltip>

                    {/* Hidden File Input */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".csv,.xlsx,.xls,.json,.txt"
                        onChange={(e) => handleFileSelect(e.target.files)}
                        style={{ display: 'none' }}
                    />

                    {/* Text Input */}
                    <textarea
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder={placeholder}
                        disabled={disabled || isProcessing}
                        rows={value.split('\n').length > 3 ? Math.min(value.split('\n').length, 5) : 1}
                        style={{
                            flex: 1,
                            padding: '8px 12px',
                            fontSize: '16px',
                            border: 'none',
                            outline: 'none',
                            resize: 'vertical',
                            minHeight: '20px',
                            maxHeight: '120px',
                            fontFamily: 'inherit'
                        }}
                    />

                    {/* Send Button */}
                    <button
                        onClick={handleSubmit}
                        disabled={disabled || isProcessing || (!value.trim() && attachments.length === 0)}
                        style={{
                            padding: '8px 16px',
                            fontSize: '14px',
                            backgroundColor: (disabled || isProcessing || (!value.trim() && attachments.length === 0))
                                ? '#cccccc'
                                : '#2c6693',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: (disabled || isProcessing || (!value.trim() && attachments.length === 0))
                                ? 'not-allowed'
                                : 'pointer',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}
                    >
                        {isProcessing ? (
                            <>
                                <span style={{ fontSize: '12px' }}>⏳</span>
                                {i18n.t('Processing...')}
                            </>
                        ) : (
                            <>
                                <span>📤</span>
                                {i18n.t('Send')}
                            </>
                        )}
                    </button>
                </div>

                {/* Drag hint */}
                {!dragOver && (
                    <div style={{
                        padding: '4px 12px',
                        fontSize: '11px',
                        color: '#6c757d',
                        textAlign: 'center',
                        borderTop: '1px solid #f8f9fa'
                    }}>
                        💡 Tip: Drag and drop files here, or click 📎 to attach files
                    </div>
                )}
            </div>
        </div>
    );
};

export default EnhancedInput;
