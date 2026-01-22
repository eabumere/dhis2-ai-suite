import React, { useCallback } from 'react';
import { Input, InputNumber, Checkbox, Select, DatePicker } from 'antd';
import dayjs from 'dayjs';

const { Option } = Select;
const { TextArea } = Input;

interface AttributeMetadata {
    valueType: string;
    optionSet?: {
        id: string;
        name: string;
        options: Array<{ id: string; name: string }>;
    };
    mandatory?: boolean;
    unique?: boolean;
}

interface AttributeEditorProps {
    value: string;
    onChange: (value: string) => void;
    attributeMetadata: AttributeMetadata;
    placeholder?: string;
    size?: 'small' | 'middle' | 'large';
    disabled?: boolean;
    style?: React.CSSProperties;
}

const AttributeEditor: React.FC<AttributeEditorProps> = ({
    value,
    onChange,
    attributeMetadata,
    placeholder,
    size = 'small',
    disabled = false,
    style
}) => {
    const handleChange = useCallback((newValue: any) => {
        let stringValue = '';

        if (attributeMetadata.valueType === 'BOOLEAN') {
            stringValue = newValue ? 'true' : 'false';
        } else if (attributeMetadata.valueType === 'DATE' || attributeMetadata.valueType === 'DATETIME') {
            // Handle dayjs objects from DatePicker
            if (newValue && typeof newValue === 'object' && newValue.isValid && newValue.isValid()) {
                if (attributeMetadata.valueType === 'DATE') {
                    stringValue = newValue.format('YYYY-MM-DD');
                } else {
                    stringValue = newValue.format('YYYY-MM-DDTHH:mm:ss');
                }
            } else {
                stringValue = newValue || '';
            }
        } else if (attributeMetadata.valueType === 'INTEGER' || attributeMetadata.valueType === 'NUMBER') {
            stringValue = newValue !== null && newValue !== undefined ? String(newValue) : '';
        } else {
            stringValue = String(newValue || '');
        }

        onChange(stringValue);
    }, [onChange, attributeMetadata.valueType]);

    const getParsedValue = useCallback(() => {
        if (!value) return null;

        switch (attributeMetadata.valueType) {
            case 'BOOLEAN':
                return value.toLowerCase() === 'true';
            case 'INTEGER':
                const intVal = parseInt(value, 10);
                return isNaN(intVal) ? null : intVal;
            case 'NUMBER':
                const numVal = parseFloat(value);
                return isNaN(numVal) ? null : numVal;
            case 'DATE':
            case 'DATETIME':
                const dayjsVal = dayjs(value);
                return dayjsVal.isValid() ? dayjsVal : null;
            default:
                return value;
        }
    }, [value, attributeMetadata.valueType]);

    const parsedValue = getParsedValue();

    // Render appropriate input component based on value type
    switch (attributeMetadata.valueType) {
        case 'TEXT':
            return (
                <Input
                    value={parsedValue || ''}
                    onChange={(e) => handleChange(e.target.value)}
                    placeholder={placeholder || 'Enter text...'}
                    size={size}
                    disabled={disabled}
                    style={style}
                />
            );

        case 'NUMBER':
            return (
                <InputNumber
                    value={parsedValue}
                    onChange={handleChange}
                    placeholder={placeholder || 'Enter number...'}
                    size={size}
                    disabled={disabled}
                    style={{ width: '100%', ...style }}
                    precision={2}
                />
            );

        case 'INTEGER':
            return (
                <InputNumber
                    value={parsedValue}
                    onChange={handleChange}
                    placeholder={placeholder || 'Enter integer...'}
                    size={size}
                    disabled={disabled}
                    style={{ width: '100%', ...style }}
                    precision={0}
                />
            );

        case 'BOOLEAN':
            return (
                <div style={{ display: 'flex', alignItems: 'center', ...style }}>
                    <Checkbox
                        checked={parsedValue || false}
                        onChange={(e) => handleChange(e.target.checked)}
                        disabled={disabled}
                    >
                        {attributeMetadata.mandatory ? 'Required' : 'Optional'}
                    </Checkbox>
                </div>
            );

        case 'DATE':
            return (
                <DatePicker
                    value={parsedValue}
                    onChange={handleChange}
                    placeholder={placeholder || 'Select date...'}
                    size={size}
                    disabled={disabled}
                    style={{ width: '100%', ...style }}
                    format="YYYY-MM-DD"
                />
            );

        case 'DATETIME':
            return (
                <DatePicker
                    value={parsedValue}
                    onChange={handleChange}
                    placeholder={placeholder || 'Select date and time...'}
                    size={size}
                    disabled={disabled}
                    style={{ width: '100%', ...style }}
                    format="YYYY-MM-DD HH:mm:ss"
                    showTime
                />
            );

        default:
            // Check if it's an option set
            if (attributeMetadata.optionSet && attributeMetadata.optionSet.options) {
                return (
                    <Select
                        value={parsedValue || undefined}
                        onChange={handleChange}
                        placeholder={placeholder || 'Select option...'}
                        size={size}
                        disabled={disabled}
                        style={{ width: '100%', ...style }}
                        allowClear={!attributeMetadata.mandatory}
                    >
                        {attributeMetadata.optionSet.options.map(option => (
                            <Option key={option.id} value={option.id}>
                                {option.name}
                            </Option>
                        ))}
                    </Select>
                );
            }

            // Fallback to text input for unknown types
            return (
                <Input
                    value={parsedValue || ''}
                    onChange={(e) => handleChange(e.target.value)}
                    placeholder={placeholder || `Enter ${attributeMetadata.valueType.toLowerCase()}...`}
                    size={size}
                    disabled={disabled}
                    style={style}
                />
            );
    }
};

export default AttributeEditor;
