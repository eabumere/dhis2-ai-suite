import React, { useState } from 'react';
import { Dropdown, Button, Modal, message } from 'antd';
import { MoreOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, SettingOutlined } from '@ant-design/icons';
import { MenuProps } from 'antd/lib/menu';
import EntityAttributeManager from './EntityAttributeManager';

interface EntityAction {
    key: string;
    label: string;
    icon: React.ReactNode;
    danger?: boolean;
    disabled?: boolean;
}

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

interface EntityActionsProps {
    entityId: string;
    entityName?: string;
    currentAttributes?: EntityAttribute[];
    availableAttributes?: Array<{
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
    onUpdate?: (entityId: string) => void;
    onDelete?: (entityId: string) => void;
    onViewDetails?: (entityId: string) => void;
    onUpdateAttributes?: (entityId: string, attributes: EntityAttribute[]) => Promise<void>;
    loading?: boolean;
    disabled?: boolean;
}

const EntityActions: React.FC<EntityActionsProps> = ({
    entityId,
    entityName = 'Entity',
    currentAttributes = [],
    availableAttributes = [],
    onUpdate,
    onDelete,
    onViewDetails,
    onUpdateAttributes,
    loading = false,
    disabled = false
}) => {
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);
    const [attributeManagerVisible, setAttributeManagerVisible] = useState(false);

    const handleMenuClick: MenuProps['onClick'] = ({ key }) => {
        switch (key) {
            case 'update':
                onUpdate?.(entityId);
                break;
            case 'manage_attributes':
                setAttributeManagerVisible(true);
                break;
            case 'delete':
                setDeleteModalVisible(true);
                break;
            case 'view':
                onViewDetails?.(entityId);
                break;
        }
    };

    const handleDeleteConfirm = () => {
        onDelete?.(entityId);
        setDeleteModalVisible(false);
        message.success(`${entityName} deleted successfully`);
    };

    const handleDeleteCancel = () => {
        setDeleteModalVisible(false);
    };

    const actions: EntityAction[] = [
        {
            key: 'update',
            label: 'Update Entity',
            icon: <EditOutlined />,
            disabled: !onUpdate
        },
        {
            key: 'manage_attributes',
            label: 'Manage Attributes',
            icon: <SettingOutlined />,
            disabled: !onUpdateAttributes
        },
        {
            key: 'view',
            label: 'View Details',
            icon: <span>👁️</span>,
            disabled: !onViewDetails
        },
        {
            key: 'delete',
            label: 'Delete Entity',
            icon: <DeleteOutlined />,
            danger: true,
            disabled: !onDelete
        }
    ];

    const menuItems: MenuProps['items'] = actions
        .filter(action => !action.disabled)
        .map(action => ({
            key: action.key,
            label: (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: action.danger ? 'var(--color-error)' : 'inherit'
                }}>
                    {action.icon}
                    <span>{action.label}</span>
                </div>
            ),
            danger: action.danger
        }));

    return (
        <>
            <Dropdown
                menu={{
                    items: menuItems,
                    onClick: handleMenuClick
                }}
                trigger={['click']}
                disabled={disabled || loading}
                placement="bottomRight"
            >
                <Button
                    type="text"
                    icon={<MoreOutlined />}
                    loading={loading}
                    style={{
                        border: 'none',
                        boxShadow: 'none',
                        padding: '4px 8px',
                        minWidth: '32px',
                        height: '32px'
                    }}
                    title="Entity actions"
                />
            </Dropdown>

            {/* Delete Confirmation Modal */}
            <Modal
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ExclamationCircleOutlined style={{ color: 'var(--color-warning)' }} />
                        Confirm Delete
                    </div>
                }
                open={deleteModalVisible}
                onOk={handleDeleteConfirm}
                onCancel={handleDeleteCancel}
                okText="Delete"
                cancelText="Cancel"
                okButtonProps={{
                    danger: true,
                    loading: loading
                }}
                centered
            >
                <div style={{ padding: '16px 0' }}>
                    <p>Are you sure you want to delete this {entityName.toLowerCase()}?</p>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                        Entity ID: <code>{entityId}</code>
                    </p>
                    <div style={{
                        backgroundColor: 'var(--color-warning-50)',
                        border: '1px solid var(--color-warning-200)',
                        borderRadius: '4px',
                        padding: '12px',
                        marginTop: '16px'
                    }}>
                        <strong>⚠️ Warning:</strong> This action cannot be undone. The entity and all its associated data will be permanently removed from DHIS2.
                    </div>
                </div>
            </Modal>

            {/* Attribute Manager Modal */}
            <EntityAttributeManager
                visible={attributeManagerVisible}
                onClose={() => setAttributeManagerVisible(false)}
                entityId={entityId}
                entityName={entityName}
                currentAttributes={currentAttributes}
                availableAttributes={availableAttributes}
                onSave={async (entityId, attributes) => {
                    if (onUpdateAttributes) {
                        await onUpdateAttributes(entityId, attributes);
                        setAttributeManagerVisible(false);
                    }
                }}
                loading={loading}
            />
        </>
    );
};

export default EntityActions;
