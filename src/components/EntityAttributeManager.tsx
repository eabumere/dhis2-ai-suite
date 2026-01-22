import React, { useState, useEffect } from 'react';
import { Modal, Button, Table, Form, message, Spin, Alert } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import AttributeEditor from './AttributeEditor';

interface EntityAttribute {
    attribute: string;
    value: string;
    displayName?: string;
    valueType?: string;
    optionSet?: {
        id: string;
        name: string;
        options: Array<{ id: string; name: string }>;
    };
}

interface EntityAttributeManagerProps {
    visible: boolean;
    onClose: () => void;
    entityId: string;
    entityName?: string;
    currentAttributes: EntityAttribute[];
    availableAttributes: Array<{
        id: string;
        name: string;
        valueType: string;
        optionSet?: {
            id: string;
            name: string;
            options: Array<{ id: string; name: string }>;
        };
        mandatory?: boolean;
    }>;
    onSave: (entityId: string, updatedAttributes: EntityAttribute[]) => Promise<void>;
    loading?: boolean;
}

const EntityAttributeManager: React.FC<EntityAttributeManagerProps> = ({
    visible,
    onClose,
    entityId,
    entityName = 'Entity',
    currentAttributes,
    availableAttributes,
    onSave,
    loading = false
}) => {
    const [attributes, setAttributes] = useState<EntityAttribute[]>(currentAttributes);
    const [modifiedAttributes, setModifiedAttributes] = useState<Set<string>>(new Set());
    const [saving, setSaving] = useState(false);
    const [addingAttribute, setAddingAttribute] = useState(false);

    // Reset state when modal opens
    useEffect(() => {
        if (visible) {
            setAttributes([...currentAttributes]);
            setModifiedAttributes(new Set());
            setAddingAttribute(false);
        }
    }, [visible, currentAttributes]);

    const handleAttributeChange = (attributeId: string, newValue: string) => {
        setAttributes(prev => prev.map(attr =>
            attr.attribute === attributeId
                ? { ...attr, value: newValue }
                : attr
        ));
        setModifiedAttributes(prev => new Set([...prev, attributeId]));
    };

    const handleAddAttribute = (attributeId: string) => {
        const attribute = availableAttributes.find(attr => attr.id === attributeId);
        if (!attribute) return;

        const newAttribute: EntityAttribute = {
            attribute: attribute.id,
            value: '',
            displayName: attribute.name,
            valueType: attribute.valueType,
            optionSet: attribute.optionSet
        };

        setAttributes(prev => [...prev, newAttribute]);
        setModifiedAttributes(prev => new Set([...prev, attributeId]));
        setAddingAttribute(false);
    };

    const handleRemoveAttribute = (attributeId: string) => {
        setAttributes(prev => prev.filter(attr => attr.attribute !== attributeId));
        setModifiedAttributes(prev => new Set([...prev, attributeId]));
    };

    const handleSave = async () => {
        if (modifiedAttributes.size === 0) {
            message.info('No changes to save');
            return;
        }

        setSaving(true);
        try {
            await onSave(entityId, attributes);
            message.success(`${entityName} attributes updated successfully`);
            onClose();
        } catch (error) {
            message.error(`Failed to update ${entityName} attributes: ${error.message}`);
        } finally {
            setSaving(false);
        }
    };

    const getAvailableAttributesForAddition = () => {
        const currentAttributeIds = attributes.map(attr => attr.attribute);
        return availableAttributes.filter(attr => !currentAttributeIds.includes(attr.id));
    };

    const columns = [
        {
            title: 'Attribute Name',
            dataIndex: 'displayName',
            key: 'displayName',
            width: 200,
            render: (displayName: string, record: EntityAttribute) => (
                <div>
                    <div style={{ fontWeight: 'medium' }}>{displayName || record.attribute}</div>
                    <div style={{ fontSize: '12px', color: '#666', fontFamily: 'monospace' }}>
                        {record.attribute}
                    </div>
                </div>
            )
        },
        {
            title: 'Value Type',
            dataIndex: 'valueType',
            key: 'valueType',
            width: 120,
            render: (valueType: string) => (
                <span style={{
                    backgroundColor: '#f0f0f0',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontFamily: 'monospace'
                }}>
                    {valueType || 'TEXT'}
                </span>
            )
        },
        {
            title: 'Current Value',
            dataIndex: 'value',
            key: 'value',
            render: (value: string, record: EntityAttribute, index: number) => {
                const isModified = modifiedAttributes.has(record.attribute);
                return (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '4px',
                        backgroundColor: isModified ? '#fff7e6' : 'transparent',
                        border: isModified ? '1px solid #ffd591' : '1px solid transparent',
                        borderRadius: '4px'
                    }}>
                        <AttributeEditor
                            value={value || ''}
                            onChange={(newValue) => handleAttributeChange(record.attribute, newValue)}
                            attributeMetadata={{
                                valueType: record.valueType || 'TEXT',
                                optionSet: record.optionSet,
                                mandatory: false // We'll handle this in validation if needed
                            }}
                            size="small"
                            style={{ flex: 1 }}
                        />
                        {isModified && (
                            <span style={{
                                backgroundColor: '#faad14',
                                color: 'white',
                                padding: '2px 6px',
                                borderRadius: '10px',
                                fontSize: '10px',
                                fontWeight: 'bold'
                            }}>
                                MODIFIED
                            </span>
                        )}
                    </div>
                );
            }
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 100,
            render: (record: EntityAttribute) => (
                <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    size="small"
                    onClick={() => handleRemoveAttribute(record.attribute)}
                    title="Remove this attribute"
                />
            )
        }
    ];

    const footer = [
        <Button key="cancel" onClick={onClose} disabled={saving}>
            Cancel
        </Button>,
        <Button
            key="save"
            type="primary"
            onClick={handleSave}
            loading={saving}
            disabled={modifiedAttributes.size === 0}
        >
            Save Changes ({modifiedAttributes.size})
        </Button>
    ];

    return (
        <Modal
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <EditOutlined />
                    Manage Attributes - {entityName}
                    <span style={{ fontSize: '12px', color: '#666', fontFamily: 'monospace' }}>
                        ID: {entityId}
                    </span>
                </div>
            }
            open={visible}
            onCancel={onClose}
            footer={footer}
            width={900}
            maskClosable={false}
        >
            <div style={{ marginBottom: '16px' }}>
                <Alert
                    message="Attribute Management"
                    description="Edit existing attribute values or remove attributes. Use the 'Add Attribute' button to include new attributes for this entity."
                    type="info"
                    showIcon
                    style={{ marginBottom: '16px' }}
                />

                {modifiedAttributes.size > 0 && (
                    <Alert
                        message={`${modifiedAttributes.size} attribute(s) modified`}
                        description="Changes will be saved when you click 'Save Changes'."
                        type="warning"
                        showIcon
                        style={{ marginBottom: '16px' }}
                    />
                )}
            </div>

            {/* Add Attribute Section */}
            <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#fafafa', borderRadius: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <PlusOutlined />
                    <strong>Add New Attribute</strong>
                </div>

                {addingAttribute ? (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <Form.Item label="Select Attribute" style={{ margin: 0, flex: 1 }}>
                            <select
                                style={{
                                    width: '100%',
                                    padding: '4px 8px',
                                    border: '1px solid #d9d9d9',
                                    borderRadius: '4px'
                                }}
                                onChange={(e) => {
                                    if (e.target.value) {
                                        handleAddAttribute(e.target.value);
                                    }
                                }}
                            >
                                <option value="">Choose an attribute to add...</option>
                                {getAvailableAttributesForAddition().map(attr => (
                                    <option key={attr.id} value={attr.id}>
                                        {attr.name} ({attr.valueType})
                                    </option>
                                ))}
                            </select>
                        </Form.Item>
                        <Button size="small" onClick={() => setAddingAttribute(false)}>
                            Cancel
                        </Button>
                    </div>
                ) : (
                    <Button
                        type="dashed"
                        icon={<PlusOutlined />}
                        onClick={() => setAddingAttribute(true)}
                        disabled={getAvailableAttributesForAddition().length === 0}
                    >
                        Add Attribute
                        {getAvailableAttributesForAddition().length > 0 &&
                            ` (${getAvailableAttributesForAddition().length} available)`
                        }
                    </Button>
                )}
            </div>

            {/* Attributes Table */}
            {loading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                    <Spin size="large" />
                    <div style={{ marginTop: '16px', color: '#666' }}>
                        Loading entity attributes...
                    </div>
                </div>
            ) : (
                <Table
                    columns={columns}
                    dataSource={attributes.map((attr, index) => ({ ...attr, key: attr.attribute || index }))}
                    size="small"
                    pagination={false}
                    scroll={{ y: 400 }}
                    locale={{
                        emptyText: 'No attributes found for this entity'
                    }}
                />
            )}
        </Modal>
    );
};

export default EntityAttributeManager;
