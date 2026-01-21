import React, { useState } from 'react';
import Button, { ButtonVariant } from './Button';
import Input, { Textarea } from './Input';
import Modal, { ModalFooter } from './Modal';
import Spacing, { VStack, HStack, Container } from './Spacing';
import ActionButton from './ActionButton';

const DesignSystemDemo: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [textareaValue, setTextareaValue] = useState('');

    const buttonVariants: ButtonVariant[] = [
        'primary', 'secondary', 'success', 'warning', 'error', 'ghost', 'outline'
    ];

    const actionButtonVariants = [
        'primary', 'secondary', 'retry', 'skip', 'manual', 'alternative', 'cancel'
    ];

    return (
        <Container size="lg">
            <VStack spacing="xl">
                <div>
                    <h1 style={{
                        fontSize: 'var(--font-size-4xl)',
                        fontWeight: 'var(--font-weight-bold)',
                        color: 'var(--color-text-primary)',
                        marginBottom: 'var(--space-2)'
                    }}>
                        🎨 DHIS2 AI Suite - Design System
                    </h1>
                    <p style={{
                        fontSize: 'var(--font-size-lg)',
                        color: 'var(--color-text-secondary)',
                        lineHeight: 'var(--line-height-relaxed)'
                    }}>
                        Comprehensive design system demonstrating visual consistency across all components
                    </p>
                </div>

                {/* Color Palette */}
                <div>
                    <h2 style={{
                        fontSize: 'var(--font-size-2xl)',
                        fontWeight: 'var(--font-weight-semibold)',
                        color: 'var(--color-text-primary)',
                        marginBottom: 'var(--space-4)'
                    }}>
                        🎨 Color Palette
                    </h2>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                        gap: 'var(--space-3)'
                    }}>
                        {[
                            { name: 'Primary', color: 'var(--color-primary)' },
                            { name: 'Success', color: 'var(--color-success)' },
                            { name: 'Warning', color: 'var(--color-warning)' },
                            { name: 'Error', color: 'var(--color-error)' },
                            { name: 'Info', color: 'var(--color-info)' },
                            { name: 'Background', color: 'var(--color-bg-primary)' },
                            { name: 'Secondary', color: 'var(--color-bg-secondary)' },
                            { name: 'Border', color: 'var(--color-border-light)' }
                        ].map(({ name, color }) => (
                            <div key={name} style={{
                                backgroundColor: color,
                                padding: 'var(--space-4)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--color-border-light)',
                                textAlign: 'center'
                            }}>
                                <div style={{
                                    fontSize: 'var(--font-size-sm)',
                                    fontWeight: 'var(--font-weight-medium)',
                                    color: 'var(--color-text-primary)',
                                    marginBottom: 'var(--space-1)'
                                }}>
                                    {name}
                                </div>
                                <div style={{
                                    fontSize: 'var(--font-size-xs)',
                                    color: 'var(--color-text-secondary)',
                                    fontFamily: 'monospace'
                                }}>
                                    {color}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Typography Scale */}
                <div>
                    <h2 style={{
                        fontSize: 'var(--font-size-2xl)',
                        fontWeight: 'var(--font-weight-semibold)',
                        color: 'var(--color-text-primary)',
                        marginBottom: 'var(--space-4)'
                    }}>
                        📝 Typography Scale
                    </h2>
                    <VStack spacing="md">
                        {[
                            { size: '4xl', text: 'Heading 4XL (2.25rem)', class: 'text-4xl' },
                            { size: '3xl', text: 'Heading 3XL (1.875rem)', class: 'text-3xl' },
                            { size: '2xl', text: 'Heading 2XL (1.5rem)', class: 'text-2xl' },
                            { size: 'xl', text: 'Heading XL (1.25rem)', class: 'text-xl' },
                            { size: 'lg', text: 'Heading LG (1.125rem)', class: 'text-lg' },
                            { size: 'base', text: 'Body Base (1rem)', class: 'text-base' },
                            { size: 'sm', text: 'Body SM (0.875rem)', class: 'text-sm' },
                            { size: 'xs', text: 'Body XS (0.75rem)', class: 'text-xs' }
                        ].map(({ text, class: className }) => (
                            <div key={text} style={{
                                padding: 'var(--space-2)',
                                border: '1px solid var(--color-border-light)',
                                borderRadius: 'var(--radius-sm)',
                                backgroundColor: 'var(--color-bg-primary)'
                            }}>
                                <span className={className} style={{
                                    color: 'var(--color-text-primary)',
                                    fontWeight: 'var(--font-weight-medium)'
                                }}>
                                    {text}
                                </span>
                            </div>
                        ))}
                    </VStack>
                </div>

                {/* Button Components */}
                <div>
                    <h2 style={{
                        fontSize: 'var(--font-size-2xl)',
                        fontWeight: 'var(--font-weight-semibold)',
                        color: 'var(--color-text-primary)',
                        marginBottom: 'var(--space-4)'
                    }}>
                        🔘 Button Components
                    </h2>

                    <VStack spacing="lg">
                        {/* Standard Button Variants */}
                        <div>
                            <h3 style={{
                                fontSize: 'var(--font-size-lg)',
                                fontWeight: 'var(--font-weight-semibold)',
                                color: 'var(--color-text-primary)',
                                marginBottom: 'var(--space-3)'
                            }}>
                                Standard Buttons
                            </h3>
                            <VStack spacing="md">
                                {buttonVariants.map(variant => (
                                    <HStack key={variant} spacing="md" align="center">
                                        <span style={{
                                            fontSize: 'var(--font-size-sm)',
                                            color: 'var(--color-text-secondary)',
                                            minWidth: '80px',
                                            textTransform: 'capitalize'
                                        }}>
                                            {variant}:
                                        </span>
                                        <Button variant={variant} size="sm">Small</Button>
                                        <Button variant={variant} size="md">Medium</Button>
                                        <Button variant={variant} size="lg">Large</Button>
                                        <Button variant={variant} size="md" loading>Loading</Button>
                                        <Button variant={variant} size="md" disabled>Disabled</Button>
                                    </HStack>
                                ))}
                            </VStack>
                        </div>

                        {/* Action Buttons */}
                        <div>
                            <h3 style={{
                                fontSize: 'var(--font-size-lg)',
                                fontWeight: 'var(--font-weight-semibold)',
                                color: 'var(--color-text-primary)',
                                marginBottom: 'var(--space-3)'
                            }}>
                                Action Buttons (Legacy)
                            </h3>
                            <HStack spacing="md" style={{ flexWrap: 'wrap' }}>
                                {actionButtonVariants.map(variant => (
                                    <ActionButton key={variant} variant={variant as any} size="medium">
                                        {variant.charAt(0).toUpperCase() + variant.slice(1)}
                                    </ActionButton>
                                ))}
                            </HStack>
                        </div>
                    </VStack>
                </div>

                {/* Input Components */}
                <div>
                    <h2 style={{
                        fontSize: 'var(--font-size-2xl)',
                        fontWeight: 'var(--font-weight-semibold)',
                        color: 'var(--color-text-primary)',
                        marginBottom: 'var(--space-4)'
                    }}>
                        📝 Input Components
                    </h2>

                    <VStack spacing="lg">
                        {/* Input Variants */}
                        <div>
                            <h3 style={{
                                fontSize: 'var(--font-size-lg)',
                                fontWeight: 'var(--font-weight-semibold)',
                                color: 'var(--color-text-primary)',
                                marginBottom: 'var(--space-3)'
                            }}>
                                Input Variants
                            </h3>
                            <VStack spacing="md">
                                <Input
                                    label="Default Input"
                                    placeholder="Enter text..."
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                />
                                <Input
                                    variant="filled"
                                    label="Filled Input"
                                    placeholder="Enter text..."
                                />
                                <Input
                                    variant="outlined"
                                    label="Outlined Input"
                                    placeholder="Enter text..."
                                />
                                <Input
                                    label="Input with Error"
                                    placeholder="Enter text..."
                                    error="This field is required"
                                />
                                <Input
                                    label="Input with Helper"
                                    placeholder="Enter text..."
                                    helperText="This is a helpful message"
                                />
                                <Input
                                    label="Input with Icons"
                                    placeholder="Search..."
                                    leftIcon="🔍"
                                    rightIcon="✕"
                                />
                            </VStack>
                        </div>

                        {/* Textarea */}
                        <div>
                            <h3 style={{
                                fontSize: 'var(--font-size-lg)',
                                fontWeight: 'var(--font-weight-semibold)',
                                color: 'var(--color-text-primary)',
                                marginBottom: 'var(--space-3)'
                            }}>
                                Textarea
                            </h3>
                            <Textarea
                                label="Auto-resize Textarea"
                                placeholder="Type something..."
                                value={textareaValue}
                                onChange={(e) => setTextareaValue(e.target.value)}
                                autoResize
                                rows={3}
                            />
                        </div>
                    </VStack>
                </div>

                {/* Spacing Utilities */}
                <div>
                    <h2 style={{
                        fontSize: 'var(--font-size-2xl)',
                        fontWeight: 'var(--font-weight-semibold)',
                        color: 'var(--color-text-primary)',
                        marginBottom: 'var(--space-4)'
                    }}>
                        📐 Spacing Utilities
                    </h2>

                    <VStack spacing="lg">
                        <div>
                            <h3 style={{
                                fontSize: 'var(--font-size-lg)',
                                fontWeight: 'var(--font-weight-semibold)',
                                color: 'var(--color-text-primary)',
                                marginBottom: 'var(--space-3)'
                            }}>
                                VStack (Vertical Stack)
                            </h3>
                            <div style={{
                                border: '1px solid var(--color-border-light)',
                                borderRadius: 'var(--radius-md)',
                                padding: 'var(--space-4)'
                            }}>
                                <VStack spacing="md" align="center">
                                    <div style={{
                                        backgroundColor: 'var(--color-primary-50)',
                                        padding: 'var(--space-3)',
                                        borderRadius: 'var(--radius-sm)',
                                        textAlign: 'center'
                                    }}>
                                        Item 1
                                    </div>
                                    <div style={{
                                        backgroundColor: 'var(--color-success-50)',
                                        padding: 'var(--space-3)',
                                        borderRadius: 'var(--radius-sm)',
                                        textAlign: 'center'
                                    }}>
                                        Item 2
                                    </div>
                                    <div style={{
                                        backgroundColor: 'var(--color-warning-50)',
                                        padding: 'var(--space-3)',
                                        borderRadius: 'var(--radius-sm)',
                                        textAlign: 'center'
                                    }}>
                                        Item 3
                                    </div>
                                </VStack>
                            </div>
                        </div>

                        <div>
                            <h3 style={{
                                fontSize: 'var(--font-size-lg)',
                                fontWeight: 'var(--font-weight-semibold)',
                                color: 'var(--color-text-primary)',
                                marginBottom: 'var(--space-3)'
                            }}>
                                HStack (Horizontal Stack)
                            </h3>
                            <div style={{
                                border: '1px solid var(--color-border-light)',
                                borderRadius: 'var(--radius-md)',
                                padding: 'var(--space-4)'
                            }}>
                                <HStack spacing="md" justify="center">
                                    <div style={{
                                        backgroundColor: 'var(--color-primary-50)',
                                        padding: 'var(--space-3)',
                                        borderRadius: 'var(--radius-sm)',
                                        textAlign: 'center'
                                    }}>
                                        Item 1
                                    </div>
                                    <div style={{
                                        backgroundColor: 'var(--color-success-50)',
                                        padding: 'var(--space-3)',
                                        borderRadius: 'var(--radius-sm)',
                                        textAlign: 'center'
                                    }}>
                                        Item 2
                                    </div>
                                    <div style={{
                                        backgroundColor: 'var(--color-warning-50)',
                                        padding: 'var(--space-3)',
                                        borderRadius: 'var(--radius-sm)',
                                        textAlign: 'center'
                                    }}>
                                        Item 3
                                    </div>
                                </HStack>
                            </div>
                        </div>
                    </VStack>
                </div>

                {/* Modal Demo */}
                <div>
                    <h2 style={{
                        fontSize: 'var(--font-size-2xl)',
                        fontWeight: 'var(--font-weight-semibold)',
                        color: 'var(--color-text-primary)',
                        marginBottom: 'var(--space-4)'
                    }}>
                        🪟 Modal Component
                    </h2>

                    <Button variant="primary" onClick={() => setIsModalOpen(true)}>
                        Open Modal Demo
                    </Button>

                    <Modal
                        isOpen={isModalOpen}
                        onClose={() => setIsModalOpen(false)}
                        title="Design System Modal"
                        size="md"
                    >
                        <VStack spacing="md">
                            <p style={{
                                color: 'var(--color-text-primary)',
                                lineHeight: 'var(--line-height-relaxed)'
                            }}>
                                This modal demonstrates the consistent design system in action.
                                All components use the same spacing, colors, and typography.
                            </p>

                            <div style={{
                                backgroundColor: 'var(--color-gray-50)',
                                padding: 'var(--space-4)',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--color-border-light)'
                            }}>
                                <h4 style={{
                                    margin: 0,
                                    marginBottom: 'var(--space-2)',
                                    fontSize: 'var(--font-size-md)',
                                    fontWeight: 'var(--font-weight-semibold)',
                                    color: 'var(--color-text-primary)'
                                }}>
                                    Key Features:
                                </h4>
                                <ul style={{
                                    margin: 0,
                                    paddingLeft: 'var(--space-4)',
                                    color: 'var(--color-text-secondary)'
                                }}>
                                    <li>Consistent spacing using design tokens</li>
                                    <li>Accessible focus management</li>
                                    <li>Responsive design</li>
                                    <li>Keyboard navigation support</li>
                                    <li>Reduced motion preferences</li>
                                </ul>
                            </div>
                        </VStack>

                        <ModalFooter>
                            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                                Cancel
                            </Button>
                            <Button variant="primary" onClick={() => setIsModalOpen(false)}>
                                Confirm
                            </Button>
                        </ModalFooter>
                    </Modal>
                </div>

                {/* Shadows & Borders */}
                <div>
                    <h2 style={{
                        fontSize: 'var(--font-size-2xl)',
                        fontWeight: 'var(--font-weight-semibold)',
                        color: 'var(--color-text-primary)',
                        marginBottom: 'var(--space-4)'
                    }}>
                        🌟 Shadows & Effects
                    </h2>

                    <HStack spacing="lg" style={{ flexWrap: 'wrap' }}>
                        {[
                            { name: 'None', class: 'shadow-none' },
                            { name: 'SM', class: 'shadow-sm' },
                            { name: 'MD', class: 'shadow' },
                            { name: 'LG', class: 'shadow-lg' },
                            { name: 'XL', class: 'shadow-xl' },
                            { name: '2XL', class: 'shadow-2xl' }
                        ].map(({ name, class: className }) => (
                            <div key={name} style={{
                                backgroundColor: 'var(--color-bg-primary)',
                                border: '1px solid var(--color-border-light)',
                                borderRadius: 'var(--radius-lg)',
                                padding: 'var(--space-6)',
                                textAlign: 'center',
                                minWidth: '120px'
                            }} className={className}>
                                <div style={{
                                    fontSize: 'var(--font-size-sm)',
                                    fontWeight: 'var(--font-weight-medium)',
                                    color: 'var(--color-text-primary)',
                                    marginBottom: 'var(--space-2)'
                                }}>
                                    {name}
                                </div>
                                <div style={{
                                    fontSize: 'var(--font-size-xs)',
                                    color: 'var(--color-text-secondary)'
                                }}>
                                    .{className}
                                </div>
                            </div>
                        ))}
                    </HStack>
                </div>

                {/* Hover & Focus States */}
                <div>
                    <h2 style={{
                        fontSize: 'var(--font-size-2xl)',
                        fontWeight: 'var(--font-weight-semibold)',
                        color: 'var(--color-text-primary)',
                        marginBottom: 'var(--space-4)'
                    }}>
                        🎯 Interactive States
                    </h2>

                    <VStack spacing="md">
                        <div>
                            <h3 style={{
                                fontSize: 'var(--font-size-lg)',
                                fontWeight: 'var(--font-weight-semibold)',
                                color: 'var(--color-text-primary)',
                                marginBottom: 'var(--space-3)'
                            }}>
                                Hover Effects
                            </h3>
                            <HStack spacing="md">
                                <div className="hover-lift" style={{
                                    backgroundColor: 'var(--color-bg-primary)',
                                    border: '1px solid var(--color-border-light)',
                                    borderRadius: 'var(--radius-md)',
                                    padding: 'var(--space-4)',
                                    cursor: 'pointer'
                                }}>
                                    Hover Lift Effect
                                </div>
                                <div className="hover-scale" style={{
                                    backgroundColor: 'var(--color-bg-primary)',
                                    border: '1px solid var(--color-border-light)',
                                    borderRadius: 'var(--radius-md)',
                                    padding: 'var(--space-4)',
                                    cursor: 'pointer'
                                }}>
                                    Hover Scale Effect
                                </div>
                            </HStack>
                        </div>

                        <div>
                            <h3 style={{
                                fontSize: 'var(--font-size-lg)',
                                fontWeight: 'var(--font-weight-semibold)',
                                color: 'var(--color-text-primary)',
                                marginBottom: 'var(--space-3)'
                            }}>
                                Focus States (Tab through these)
                            </h3>
                            <HStack spacing="md">
                                <Button variant="primary" className="focus-ring-primary">
                                    Focusable Button
                                </Button>
                                <Input
                                    placeholder="Focusable input"
                                    style={{ width: '200px' }}
                                />
                            </HStack>
                        </div>
                    </VStack>
                </div>
            </VStack>
        </Container>
    );
};

export default DesignSystemDemo;
