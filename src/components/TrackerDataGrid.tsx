import React, {useCallback, useState} from 'react';
import {Alert, Button, Input, Modal, Progress, Select, Spin, Table, Tag, message} from 'antd';
import {ReloadOutlined, RobotOutlined, SettingOutlined, UploadOutlined} from '@ant-design/icons';
import {matchPdfHeadersToMapping, validateHeaderMatchingResult} from '../utils/tools/metadata/header-matching';
import {dhis2Config} from '../utils/env-config';
import LoadingSkeleton from './LoadingSkeleton';
import AttributeEditor from './AttributeEditor';
import EntityActions from './EntityActions';
import dayjs from 'dayjs';

const { Option } = Select;
const { TextArea } = Input;

interface ExtractedPatientData {
    [key: string]: {
        value: string;
        confidence: number;
    };
}

interface TrackerDataValue {
    trackedEntityInstance: string;
    program: string;
    orgUnit: string;
    enrollmentDate: string;
    incidentDate?: string;
    attributes: Array<{
        attribute: string;
        value: string;
    }>;
    events?: Array<{
        programStage: string;
        orgUnit: string;
        eventDate: string;
        dataValues: Array<{
            dataElement: string;
            value: string;
        }>;
    }>;
}

interface TrackerDataGridProps {
    extractedPatients: ExtractedPatientData[];
    mappedTrackerData: TrackerDataValue[];
    headerMappings?: Record<string, string>; // PDF header -> DHIS2 attribute ID mapping
    headerDisplayNames?: Record<string, string>; // PDF header -> DHIS2 display name mapping
    attributeMetadata?: Record<string, {
        valueType: string;
        optionSet?: { id: string; name: string; options: Array<{ id: string; name: string }> };
        mandatory?: boolean;
        unique?: boolean;
    }>; // Attribute metadata for dynamic input rendering
    onConfigureProcessing?: (config: {
        orgUnit: string;
        programId: string;
        attributeMappings: Record<string, string>;
    }) => void;
    onUploadDocument?: (file: File) => void;
    onRetryProcessing?: () => void;
    onConfirmSave?: (modifiedData?: any) => void;
    onCancelSave?: () => void;
    onUpdateEntity?: (entityId: string) => void;
    onDeleteEntity?: (entityId: string) => void;
    onViewEntityDetails?: (entityId: string) => void;
    processingStep?: string;
    processingProgress?: number;
    error?: string;
    reviewMode?: boolean;
}

const TrackerDataGrid: React.FC<TrackerDataGridProps> = ({
    extractedPatients,
    mappedTrackerData,
    headerMappings = {},
    headerDisplayNames = {},
    attributeMetadata = {},
    onConfigureProcessing,
    onUploadDocument,
    onRetryProcessing,
    onConfirmSave,
    onCancelSave,
    onUpdateEntity,
    onDeleteEntity,
    onViewEntityDetails,
    processingStep,
    processingProgress,
    error,
    reviewMode = false
}) => {
    const [configModalVisible, setConfigModalVisible] = useState(false);
    const [uploadModalVisible, setUploadModalVisible] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [llmMatchingModalVisible, setLlmMatchingModalVisible] = useState(false);
    const [llmMatchingLoading, setLlmMatchingLoading] = useState(false);
    const [llmMatchingResult, setLlmMatchingResult] = useState<any>(null);
    const [llmMatchingError, setLlmMatchingError] = useState<string | null>(null);

    // Configuration state
    const [orgUnit, setOrgUnit] = useState('');
    const [programId, setProgramId] = useState('');
    const [attributeMappings, setAttributeMappings] = useState<Record<string, string>>({});

    // Attribute display name mapping for column headers
    const [attributeDisplayNames, setAttributeDisplayNames] = useState<Record<string, string>>({});

    // Editable grid state for review mode
    const [editingData, setEditingData] = useState<Record<string, Record<string, string>>>({});
    const [modifiedRows, setModifiedRows] = useState<Set<number>>(new Set());

    // Cell editing handlers
    const handleCellEdit = useCallback((rowIndex: number, fieldName: string, value: string) => {
        const rowKey = `row_${rowIndex}`;
        setEditingData(prev => ({
            ...prev,
            [rowKey]: {
                ...prev[rowKey],
                [fieldName]: value
            }
        }));
        setModifiedRows(prev => new Set([...prev, rowIndex]));
    }, []);

    const handleCellSave = useCallback((rowIndex: number, fieldName: string) => {
        // Save is handled automatically when onConfirmSave is called with the modified data
        console.log(`Cell saved: row ${rowIndex}, field ${fieldName}`);
    }, []);

    const handleCellCancel = useCallback((rowIndex: number, fieldName: string) => {
        const rowKey = `row_${rowIndex}`;
        setEditingData(prev => {
            const newData = { ...prev };
            if (newData[rowKey]) {
                delete newData[rowKey][fieldName];
                if (Object.keys(newData[rowKey]).length === 0) {
                    delete newData[rowKey];
                }
            }
            return newData;
        });

        // Check if this row still has modifications
        const rowKeyCheck = `row_${rowIndex}`;
        const hasOtherModifications = Object.keys(editingData[rowKeyCheck] || {}).some(key => key !== fieldName);
        if (!hasOtherModifications) {
            setModifiedRows(prev => {
                const newSet = new Set(prev);
                newSet.delete(rowIndex);
                return newSet;
            });
        }
    }, [editingData]);

    // Get the edited value for a cell
    const getEditedValue = useCallback((rowIndex: number, fieldName: string, originalValue: string) => {
        const rowKey = `row_${rowIndex}`;
        return editingData[rowKey]?.[fieldName] ?? originalValue;
    }, [editingData]);

    // Check if a cell has been modified
    const isCellModified = useCallback((rowIndex: number, fieldName: string) => {
        const rowKey = `row_${rowIndex}`;
        return editingData[rowKey]?.[fieldName] !== undefined;
    }, [editingData]);

    // Get all available field names from extracted patients
    const availableFields = React.useMemo(() => {
        const fields = new Set<string>();
        extractedPatients.forEach(patient => {
            Object.keys(patient).forEach(key => fields.add(key));
        });
        return Array.from(fields);
    }, [extractedPatients]);

    const handleConfigure = useCallback(() => {
        onConfigureProcessing({
            orgUnit,
            programId,
            attributeMappings
        });
        setConfigModalVisible(false);
    }, [orgUnit, programId, attributeMappings, onConfigureProcessing]);

    const handleFileUpload = useCallback(() => {
        if (selectedFile) {
            onUploadDocument(selectedFile);
            setUploadModalVisible(false);
            setSelectedFile(null);
        }
    }, [selectedFile, onUploadDocument]);

    const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setSelectedFile(file);
        }
    }, []);

    const updateAttributeMapping = useCallback((fieldName: string, attributeId: string) => {
        setAttributeMappings(prev => ({
            ...prev,
            [fieldName]: attributeId
        }));
    }, []);

    // LLM Header Matching handler
    const handleLlmHeaderMatching = useCallback(async () => {
        if (!extractedPatients.length) return;

        setLlmMatchingLoading(true);
        setLlmMatchingError(null);
        setLlmMatchingResult(null);

        try {
            // Get PDF headers from extracted patients
            const pdfHeaders = availableFields;

            // Common DHIS2 tracker field names for mapping
            const mappingHeaders = [
                "Patient ID: National ID",
                "Transfer: (in) From Date",
                "Surname and Given name",
                "DoB",
                "Sex (m/f)",
                "ART No Patient ID:",
                "Physical Address",
                "Patient's Phone No",
                "ART Start Date",
                "Weight (kg)",
                "Height (cm)",
                "CD4 Count",
                "WHO Stage (1,2,3,4)",
                "TB Screen (n,p)",
                "Functional Status (a,w,b)",
                "CTX Prophylaxis (y,n)",
                "Regimen Initial ART",
                "MUAC (cm)",
                "Pregnant (y,n)",
                "FP method used",
                "LMP",
                "INH (IPT) Prophylaxis"
            ];

            console.log('🧠 Starting LLM header matching with:', {
                pdfHeaders,
                mappingHeaders,
                confidenceThreshold: 0.7
            });

            // Call the LLM header matching tool
            const result = await matchPdfHeadersToMapping.invoke({
                pdfHeaders,
                mappingHeaders,
                confidenceThreshold: 0.7,
                context: 'DHIS2 tracker data mapping for patient registers'
            });

            console.log('🧠 LLM header matching result:', result);

            setLlmMatchingResult(result);

            // Validate the result
            const isValid = validateHeaderMatchingResult(result);
            if (!isValid) {
                setLlmMatchingError('Header matching validation failed. Please review the matches.');
            }

        } catch (error) {
            console.error('❌ Error in LLM header matching:', error);
            setLlmMatchingError(`LLM header matching failed: ${error.message}`);
        } finally {
            setLlmMatchingLoading(false);
        }
    }, [extractedPatients, availableFields]);

    // Apply LLM matching results to attribute mappings
    const applyLlmMatchingResults = useCallback(() => {
        if (!llmMatchingResult || !llmMatchingResult.matches) return;

        const newMappings: Record<string, string> = { ...attributeMappings };

        // Apply the LLM matches
        llmMatchingResult.matches.forEach((match: any) => {
            if (match.isMatch && match.confidence >= 0.7) {
                newMappings[match.pdfHeader] = match.mappingHeader;
            }
        });

        setAttributeMappings(newMappings);
        setLlmMatchingModalVisible(false);
    }, [llmMatchingResult, attributeMappings]);

    // Initialize attributeMappings from props
    React.useEffect(() => {
        if (Object.keys(headerMappings).length > 0) {
            setAttributeMappings(headerMappings);
            console.log(`📋 Initialized attributeMappings from props:`, headerMappings);
        }
    }, [headerMappings]);

    // Initialize attributeDisplayNames from props
    React.useEffect(() => {
        if (Object.keys(headerDisplayNames).length > 0) {
            setAttributeDisplayNames(headerDisplayNames);
            console.log(`📋 Initialized attributeDisplayNames from props:`, headerDisplayNames);
        }
    }, [headerDisplayNames]);

    const patientColumns = [
        {
            title: 'Field Name',
            dataIndex: 'fieldName',
            key: 'fieldName',
            width: 200,
        },
        {
            title: 'Value',
            dataIndex: 'value',
            key: 'value',
            render: (value: string, record: any) => (
                <span style={{
                    color: record.confidence < 0.8 ? '#ff4d4f' : 'inherit',
                    fontWeight: record.confidence < 0.8 ? 'bold' : 'normal'
                }}>
                    {value || '-'}
                    {record.confidence < 0.8 && (
                        <span style={{ fontSize: '12px', color: '#ff4d4f', marginLeft: '8px' }}>
                            ({Math.round(record.confidence * 100)}%)
                        </span>
                    )}
                </span>
            ),
        },
        {
            title: 'Confidence',
            dataIndex: 'confidence',
            key: 'confidence',
            render: (confidence: number) => `${Math.round(confidence * 100)}%`,
            width: 100,
        },
    ];

    const trackerColumns = [
        {
            title: (
                <div style={{
                    fontWeight: 'var(--font-weight-semibold)',
                    color: 'var(--color-text-primary)',
                    fontSize: 'var(--font-size-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)'
                }}>
                    👤 Patient ID
                </div>
            ),
            dataIndex: 'trackedEntityInstance',
            key: 'trackedEntityInstance',
            width: 220,
            onCell: (record: any) => ({
                style: {
                    transition: 'var(--transition-fast)',
                },
                onMouseEnter: (e: React.MouseEvent<HTMLTableCellElement>) => {
                    const target = e.currentTarget as HTMLTableCellElement;
                    target.style.backgroundColor = 'var(--color-primary-50)';
                    target.style.transform = 'scale(1.01)';
                },
                onMouseLeave: (e: React.MouseEvent<HTMLTableCellElement>) => {
                    const target = e.currentTarget as HTMLTableCellElement;
                    target.style.backgroundColor = '';
                    target.style.transform = '';
                }
            }),
            render: (id: string) => (
                <div style={{
                    fontFamily: 'monospace',
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-primary-700)',
                    fontWeight: 'var(--font-weight-medium)',
                    backgroundColor: 'var(--color-primary-50)',
                    padding: 'var(--space-1) var(--space-2)',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                }}>
                    {id}
                </div>
            ),
        },
        {
            title: (
                <div style={{
                    fontWeight: 'var(--font-weight-semibold)',
                    color: 'var(--color-text-primary)',
                    fontSize: 'var(--font-size-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)'
                }}>
                    🏥 Program
                </div>
            ),
            dataIndex: 'program',
            key: 'program',
            width: 180,
            onCell: (record: any) => ({
                style: {
                    transition: 'var(--transition-fast)',
                },
                onMouseEnter: (e: React.MouseEvent<HTMLTableCellElement>) => {
                    const target = e.currentTarget as HTMLTableCellElement;
                    target.style.backgroundColor = 'var(--color-success-50)';
                    target.style.transform = 'scale(1.01)';
                },
                onMouseLeave: (e: React.MouseEvent<HTMLTableCellElement>) => {
                    const target = e.currentTarget as HTMLTableCellElement;
                    target.style.backgroundColor = '';
                    target.style.transform = '';
                }
            }),
            render: (program: string) => (
                <div style={{
                    color: 'var(--color-success-700)',
                    fontWeight: 'var(--font-weight-medium)',
                    backgroundColor: 'var(--color-success-50)',
                    padding: 'var(--space-1) var(--space-2)',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                }}>
                    {program}
                </div>
            ),
        },
        {
            title: (
                <div style={{
                    fontWeight: 'var(--font-weight-semibold)',
                    color: 'var(--color-text-primary)',
                    fontSize: 'var(--font-size-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)'
                }}>
                    📍 Org Unit
                </div>
            ),
            dataIndex: 'orgUnit',
            key: 'orgUnit',
            width: 180,
            onCell: (record: any) => ({
                style: {
                    transition: 'var(--transition-fast)',
                },
                onMouseEnter: (e: React.MouseEvent<HTMLTableCellElement>) => {
                    const target = e.currentTarget as HTMLTableCellElement;
                    target.style.backgroundColor = 'var(--color-info-50)';
                    target.style.transform = 'scale(1.01)';
                },
                onMouseLeave: (e: React.MouseEvent<HTMLTableCellElement>) => {
                    const target = e.currentTarget as HTMLTableCellElement;
                    target.style.backgroundColor = '';
                    target.style.transform = '';
                }
            }),
            render: (orgUnit: string) => (
                <div style={{
                    color: 'var(--color-info-700)',
                    fontWeight: 'var(--font-weight-medium)',
                    backgroundColor: 'var(--color-info-50)',
                    padding: 'var(--space-1) var(--space-2)',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                }}>
                    {orgUnit}
                </div>
            ),
        },
        {
            title: (
                <div style={{
                    fontWeight: 'var(--font-weight-semibold)',
                    color: 'var(--color-text-primary)',
                    fontSize: 'var(--font-size-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)'
                }}>
                    📅 Enrollment Date
                </div>
            ),
            dataIndex: 'enrollmentDate',
            key: 'enrollmentDate',
            width: 140,
            onCell: (record: any) => ({
                style: {
                    transition: 'var(--transition-fast)',
                },
                onMouseEnter: (e: React.MouseEvent<HTMLTableCellElement>) => {
                    const target = e.currentTarget as HTMLTableCellElement;
                    target.style.backgroundColor = 'var(--color-warning-50)';
                    target.style.transform = 'scale(1.01)';
                },
                onMouseLeave: (e: React.MouseEvent<HTMLTableCellElement>) => {
                    const target = e.currentTarget as HTMLTableCellElement;
                    target.style.backgroundColor = '';
                    target.style.transform = '';
                }
            }),
            render: (date: string) => {
                const formattedDate = new Date(date).toLocaleDateString();
                return (
                    <div style={{
                        color: 'var(--color-warning-700)',
                        fontWeight: 'var(--font-weight-medium)',
                        backgroundColor: 'var(--color-warning-50)',
                        padding: 'var(--space-1) var(--space-2)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 'var(--font-size-sm)',
                        textAlign: 'center'
                    }}>
                        {formattedDate}
                    </div>
                );
            },
        },
        {
            title: (
                <div style={{
                    fontWeight: 'var(--font-weight-semibold)',
                    color: 'var(--color-text-primary)',
                    fontSize: 'var(--font-size-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)'
                }}>
                    📊 Attributes
                </div>
            ),
            dataIndex: 'attributes',
            key: 'attributes',
            width: 140,
            onCell: (record: any) => ({
                style: {
                    transition: 'var(--transition-fast)',
                },
                onMouseEnter: (e: React.MouseEvent<HTMLTableCellElement>) => {
                    const target = e.currentTarget as HTMLTableCellElement;
                    target.style.backgroundColor = 'var(--color-gray-50)';
                    target.style.transform = 'scale(1.01)';
                },
                onMouseLeave: (e: React.MouseEvent<HTMLTableCellElement>) => {
                    const target = e.currentTarget as HTMLTableCellElement;
                    target.style.backgroundColor = '';
                    target.style.transform = '';
                }
            }),
            render: (attributes: Array<{attribute: string, value: string}>) => {
                const count = attributes?.length || 0;
                return (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)',
                        padding: 'var(--space-1) var(--space-2)',
                        backgroundColor: count > 0 ? 'var(--color-gray-100)' : 'var(--color-gray-50)',
                        borderRadius: 'var(--radius-lg)',
                        fontSize: 'var(--font-size-sm)',
                        fontWeight: 'var(--font-weight-medium)',
                        color: count > 0 ? 'var(--color-text-primary)' : 'var(--color-text-muted)'
                    }}>
                        <span>📋</span>
                        <span>{count} {count === 1 ? 'attribute' : 'attributes'}</span>
                    </div>
                );
            },
        },
        {
            title: (
                <div style={{
                    fontWeight: 'var(--font-weight-semibold)',
                    color: 'var(--color-text-primary)',
                    fontSize: 'var(--font-size-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)'
                }}>
                    ⚡ Actions
                </div>
            ),
            key: 'actions',
            width: 120,
            fixed: 'right' as const,
            render: (record: TrackerDataValue) => {
                const attrMeta = attributeMetadata || {};
                return (
                    <EntityActions
                        entityId={record.trackedEntityInstance}
                        entityName="Tracker Entity"
                        currentAttributes={record.attributes.map(attr => {
                            const meta = attrMeta[attr.attribute];
                            return {
                                attribute: attr.attribute,
                                value: attr.value,
                                displayName: headerDisplayNames?.[attr.attribute] || attr.attribute,
                                valueType: meta?.valueType || 'TEXT',
                                optionSet: meta?.optionSet
                            };
                        })}
                        availableAttributes={Object.entries(attrMeta).map(([id, meta]) => ({
                            id,
                            name: headerDisplayNames?.[id] || id,
                            valueType: meta.valueType || 'TEXT',
                            optionSet: meta.optionSet,
                            mandatory: meta.mandatory
                        }))}
                        onUpdate={onUpdateEntity}
                        onDelete={onDeleteEntity}
                        onViewDetails={onViewEntityDetails}
                        onUpdateAttributes={async (entityId, attributes) => {
                            // Create partial update payload
                            const updatePayload = {
                                trackedEntityInstance: entityId,
                                attributes: attributes.map(attr => ({
                                    attribute: attr.attribute,
                                    value: attr.value
                                }))
                            };

                            // Call the workflow orchestrator
                            if (onUpdateEntity) {
                                // For now, we'll trigger the update action with attribute data
                                // In a full implementation, this would call a specific attribute update handler
                                console.log('Attribute update requested:', updatePayload);
                                // TODO: Implement actual attribute update logic
                            }
                        }}
                    />
                );
            },
        },
    ];

    // Create dynamic columns from extracted field names with proper DHIS2 attribute display names
    const dynamicPatientColumns = React.useMemo(() => {
        if (extractedPatients.length === 0) return [];

        // Get all field names from the first patient (they should be consistent)
        const firstPatient = extractedPatients[0];
        const fieldNames = Object.keys(firstPatient);

        // Create columns for each field with proper display names
        const columns = fieldNames.map(fieldName => {
            // Try to get display name from attribute mappings
            let displayName = fieldName;

            // Check if this field is mapped to a DHIS2 attribute ID
            const attributeId = attributeMappings[fieldName];
            if (attributeId && attributeDisplayNames[attributeId]) {
                // Use the DHIS2 attribute display name instead of raw PDF header
                displayName = attributeDisplayNames[attributeId];
                console.log(`📋 Using display name "${displayName}" for PDF header "${fieldName}" (attribute ID: ${attributeId})`);
            } else {
                console.log(`📋 Using raw PDF header "${fieldName}" (no mapping found)`);
            }

            return {
                title: (
                    <div style={{
                        fontWeight: 'var(--font-weight-semibold)',
                        color: 'var(--color-text-primary)',
                        fontSize: 'var(--font-size-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-2)'
                    }}>
                        {displayName}
                        {reviewMode && modifiedRows.size > 0 && (
                            <span style={{
                                backgroundColor: 'var(--color-warning)',
                                color: 'var(--color-text-inverse)',
                                padding: 'var(--space-1) var(--space-2)',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: 'var(--font-size-xs)',
                                fontWeight: 'var(--font-weight-bold)'
                            }}>
                                ✏️
                            </span>
                        )}
                    </div>
                ),
                dataIndex: fieldName,
                key: fieldName,
                width: 200,
                onCell: (record: any, rowIndex: number) => ({
                    style: {
                        transition: 'var(--transition-fast)',
                        backgroundColor: isCellModified(rowIndex, fieldName) ? 'var(--color-warning-50)' : 'transparent',
                        border: isCellModified(rowIndex, fieldName) ? '2px solid var(--color-warning)' : 'none'
                    },
                    onMouseEnter: (e: React.MouseEvent<HTMLTableCellElement>) => {
                        const target = e.currentTarget as HTMLTableCellElement;
                        target.style.backgroundColor = isCellModified(rowIndex, fieldName) ? 'var(--color-warning-100)' : 'var(--color-gray-50)';
                        target.style.transform = 'scale(1.01)';
                    },
                    onMouseLeave: (e: React.MouseEvent<HTMLTableCellElement>) => {
                        const target = e.currentTarget as HTMLTableCellElement;
                        target.style.backgroundColor = isCellModified(rowIndex, fieldName) ? 'var(--color-warning-50)' : '';
                        target.style.transform = '';
                    }
                }),
                render: (value: { value: string; confidence: number }, record: any, rowIndex: number) => {
                    const confidence = value.confidence || 0;
                    const isLowConfidence = confidence < 0.8;
                    const editedValue = getEditedValue(rowIndex, fieldName, value.value || '');
                    const hasBeenModified = isCellModified(rowIndex, fieldName);

                    if (reviewMode) {
                        // Editable mode in review
                        return (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-2)',
                                padding: 'var(--space-1)'
                            }}>
                                <Input
                                    value={editedValue}
                                    onChange={(e) => handleCellEdit(rowIndex, fieldName, e.target.value)}
                                    style={{
                                        flex: 1,
                                        borderColor: hasBeenModified ? 'var(--color-warning)' : 'var(--color-border-light)',
                                        backgroundColor: hasBeenModified ? 'var(--color-warning-25)' : 'var(--color-bg-primary)'
                                    }}
                                    size="small"
                                />
                                {isLowConfidence && (
                                    <span style={{
                                        backgroundColor: 'var(--color-error)',
                                        color: 'var(--color-text-inverse)',
                                        padding: 'var(--space-1) var(--space-2)',
                                        borderRadius: 'var(--radius-lg)',
                                        fontSize: 'var(--font-size-xs)',
                                        fontWeight: 'var(--font-weight-bold)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 'var(--space-1)'
                                    }}>
                                        ⚠️ {Math.round(confidence * 100)}%
                                    </span>
                                )}
                                {hasBeenModified && (
                                    <span style={{
                                        backgroundColor: 'var(--color-success)',
                                        color: 'var(--color-text-inverse)',
                                        padding: 'var(--space-1) var(--space-2)',
                                        borderRadius: 'var(--radius-lg)',
                                        fontSize: 'var(--font-size-xs)',
                                        fontWeight: 'var(--font-weight-bold)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 'var(--space-1)'
                                    }}>
                                        ✓ Edited
                                    </span>
                                )}
                            </div>
                        );
                    } else {
                        // Read-only mode
                        return (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--space-2)',
                                padding: 'var(--space-2)'
                            }}>
                                <span style={{
                                    color: isLowConfidence ? 'var(--color-error)' : 'var(--color-text-primary)',
                                    fontWeight: isLowConfidence ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)',
                                    flex: 1,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                }}>
                                    {value.value || '-'}
                                </span>
                                {isLowConfidence && (
                                    <span style={{
                                        backgroundColor: 'var(--color-error)',
                                        color: 'var(--color-text-inverse)',
                                        padding: 'var(--space-1) var(--space-2)',
                                        borderRadius: 'var(--radius-lg)',
                                        fontSize: 'var(--font-size-xs)',
                                        fontWeight: 'var(--font-weight-bold)',
                                        animation: 'pulse 2s infinite',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 'var(--space-1)'
                                    }}>
                                        ⚠️ {Math.round(confidence * 100)}%
                                    </span>
                                )}
                            </div>
                        );
                    }
                },
            };
        });

        return columns;
    }, [extractedPatients, attributeMappings, attributeDisplayNames, reviewMode, modifiedRows, editingData, handleCellEdit, getEditedValue, isCellModified]);

    // Transform extracted patients data for patient-by-patient display
    const patientTableData = React.useMemo(() => {
        return extractedPatients.map((patient, index) => ({
            key: index,
            ...patient, // Spread all field data
        }));
    }, [extractedPatients]);

    // Transform mapped tracker data for display
    const trackerTableData = React.useMemo(() => {
        return mappedTrackerData.map((patient, index) => ({
            key: index,
            ...patient,
        }));
    }, [mappedTrackerData]);

    if (reviewMode) {
        return (
            <div style={{ padding: '20px' }}>
                <div style={{ marginBottom: '20px' }}>
                    <h2>📋 Review Extracted Patient Data</h2>
                    <p>Please review the extracted patient data before saving to DHIS2. Each row represents one patient.</p>
                </div>

                {error && (
                    <Alert
                        message="Processing Error"
                        description={error}
                        type="error"
                        showIcon
                        style={{ marginBottom: '20px' }}
                    />
                )}

                {/* Patient Table in Review Mode */}
                {extractedPatients.length > 0 && (
                    <div style={{ marginBottom: '30px' }}>
                        <div style={{
                            overflow: 'auto',
                            maxHeight: '400px',
                            border: '1px solid #f0f0f0',
                            borderRadius: '4px'
                        }}>
                            <Table
                                columns={dynamicPatientColumns}
                                dataSource={patientTableData}
                                size="middle"
                                pagination={false}
                                scroll={{
                                    x: 'max-content',
                                    y: 'calc(100% - 40px)'  // Fill container height minus padding
                                }}
                                bordered
                                sticky
                            />
                        </div>
                    </div>
                )}

                {/* Action Buttons */}
                <div style={{
                    display: 'flex',
                    gap: '10px',
                    justifyContent: 'flex-end',
                    padding: '20px',
                    borderTop: '1px solid #f0f0f0'
                }}>
                    <Button
                        type="primary"
                        size="large"
                        onClick={() => {
                            // Pass edited data back to parent
                            const modifiedData = {
                                editedPatients: patientTableData.map((patient, index) => {
                                    const editedPatient = { ...patient };
                                    const rowKey = `row_${index}`;

                                    // Apply edits to the patient data
                                    if (editingData[rowKey]) {
                                        Object.entries(editingData[rowKey]).forEach(([fieldName, value]) => {
                                            if (editedPatient[fieldName]) {
                                                editedPatient[fieldName] = {
                                                    ...editedPatient[fieldName],
                                                    value: value
                                                };
                                            }
                                        });
                                    }

                                    return editedPatient;
                                }),
                                hasModifications: modifiedRows.size > 0,
                                modifiedRowCount: modifiedRows.size
                            };

                            if (onConfirmSave) {
                                onConfirmSave(modifiedData);
                            }
                        }}
                        style={{ minWidth: '120px' }}
                    >
                        ✅ Save to DHIS2 {modifiedRows.size > 0 && `(${modifiedRows.size} edited)`}
                    </Button>
                    <Button
                        danger
                        size="large"
                        onClick={onCancelSave}
                        style={{ minWidth: '120px' }}
                    >
                        ❌ Cancel
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ padding: '20px' }}>
            <div style={{ marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <Button
                    type="primary"
                    icon={<SettingOutlined />}
                    onClick={() => setConfigModalVisible(true)}
                >
                    Configure Processing
                </Button>

                <Button
                    type="default"
                    icon={<UploadOutlined />}
                    onClick={() => setUploadModalVisible(true)}
                >
                    Upload Document
                </Button>

                <Button
                    type="default"
                    icon={<ReloadOutlined />}
                    onClick={onRetryProcessing}
                    disabled={!extractedPatients.length}
                >
                    Retry Processing
                </Button>

                <Button
                    type="default"
                    icon={<RobotOutlined />}
                    onClick={() => setLlmMatchingModalVisible(true)}
                    disabled={!extractedPatients.length}
                    style={{ backgroundColor: '#f6ffed', borderColor: '#b7eb8f' }}
                >
                    🤖 LLM Header Matching
                </Button>

                {processingStep && (
                    <div style={{ marginLeft: '20px', flex: 1 }}>
                        <div style={{ marginBottom: '5px' }}>
                            <strong>Processing:</strong> {processingStep}
                        </div>
                        {processingProgress !== undefined && (
                            <Progress percent={processingProgress} size="small" />
                        )}
                    </div>
                )}
            </div>

            {error && (
                <Alert
                    message="Processing Error"
                    description={error}
                    type="error"
                    showIcon
                    style={{ marginBottom: '20px' }}
                />
            )}

            {/* Extracted Patients Table */}
            {(extractedPatients.length > 0 || processingStep) && (
                <div style={{ marginBottom: '30px' }}>
                    <h3>📋 Extracted Patient Data {extractedPatients.length > 0 ? `(${extractedPatients.length} patients)` : '(Processing...)'}</h3>
                    {extractedPatients.length > 0 ? (
                        <Table
                            columns={dynamicPatientColumns}
                            dataSource={patientTableData}
                            size="small"
                            pagination={false}
                            scroll={{ x: 'max-content', y: 300 }}
                            bordered
                        />
                    ) : processingStep ? (
                        <LoadingSkeleton type="table" rows={5} />
                    ) : null}
                </div>
            )}

            {/* Mapped Tracker Data Table */}
            {(mappedTrackerData.length > 0 || processingStep) && (
                <div>
                    <h3>🏥 Mapped Tracker Data {mappedTrackerData.length > 0 ? `(${mappedTrackerData.length} entities)` : '(Processing...)'}</h3>
                    {mappedTrackerData.length > 0 ? (
                        <Table
                            columns={trackerColumns}
                            dataSource={trackerTableData}
                            size="small"
                            pagination={false}
                            scroll={{ y: 300 }}
                        />
                    ) : processingStep ? (
                        <LoadingSkeleton type="table" rows={5} />
                    ) : null}
                </div>
            )}

            {/* Show skeleton when processing but no data yet */}
            {processingStep && extractedPatients.length === 0 && mappedTrackerData.length === 0 && (
                <div style={{ marginTop: '20px' }}>
                    <div style={{ marginBottom: '30px' }}>
                        <h3>📋 Extracted Patient Data (Processing...)</h3>
                        <LoadingSkeleton type="table" rows={5} />
                    </div>
                    <div>
                        <h3>🏥 Mapped Tracker Data (Processing...)</h3>
                        <LoadingSkeleton type="table" rows={5} />
                    </div>
                </div>
            )}

            {/* Configuration Modal */}
            <Modal
                title="Configure Tracker Processing"
                open={configModalVisible}
                onOk={handleConfigure}
                onCancel={() => setConfigModalVisible(false)}
                width={800}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                        <label>Organisation Unit ID:</label>
                        <Input
                            placeholder={`e.g., ${dhis2Config.getDefaultOrgUnit()}`}
                            value={orgUnit}
                            onChange={(e) => setOrgUnit(e.target.value)}
                        />
                    </div>

                    <div>
                        <label>Program ID:</label>
                        <Input
                            placeholder="Enter program ID"
                            value={programId}
                            onChange={(e) => setProgramId(e.target.value)}
                        />
                    </div>

                    <div>
                        <label>Attribute Mappings:</label>
                        <div style={{ marginTop: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                            {availableFields.map(fieldName => (
                                <div key={fieldName} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <span style={{ minWidth: '200px', fontWeight: 'bold' }}>{fieldName}:</span>
                                    <Input
                                        placeholder="DHIS2 Attribute ID"
                                        value={attributeMappings[fieldName] || ''}
                                        onChange={(e) => updateAttributeMapping(fieldName, e.target.value)}
                                        style={{ flex: 1 }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Upload Modal */}
            <Modal
                title="Upload Document"
                open={uploadModalVisible}
                onOk={handleFileUpload}
                onCancel={() => {
                    setUploadModalVisible(false);
                    setSelectedFile(null);
                }}
                okButtonProps={{ disabled: !selectedFile }}
            >
                <div>
                    <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.tiff"
                        onChange={handleFileSelect}
                        style={{ marginBottom: '16px' }}
                    />
                    {selectedFile && (
                        <div>
                            <strong>Selected:</strong> {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                        </div>
                    )}
                    <Alert
                        message="Supported formats: PDF, PNG, JPG, JPEG, TIFF"
                        description="Maximum file size: 50MB"
                        type="info"
                        showIcon
                        style={{ marginTop: '16px' }}
                    />
                </div>
            </Modal>

            {/* LLM Header Matching Modal */}
            <Modal
                title="🤖 LLM Header Matching"
                open={llmMatchingModalVisible}
                onCancel={() => setLlmMatchingModalVisible(false)}
                width={1000}
                footer={[
                    <Button key="cancel" onClick={() => setLlmMatchingModalVisible(false)}>
                        Cancel
                    </Button>,
                    <Button
                        key="apply"
                        type="primary"
                        onClick={applyLlmMatchingResults}
                        disabled={!llmMatchingResult || llmMatchingLoading}
                    >
                        Apply Matches
                    </Button>
                ]}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* LLM Matching Controls */}
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <Button
                            type="primary"
                            icon={<RobotOutlined />}
                            onClick={handleLlmHeaderMatching}
                            disabled={llmMatchingLoading || !extractedPatients.length}
                        >
                            Run LLM Matching
                        </Button>
                        <span style={{ color: '#666' }}>
                            {availableFields.length} PDF headers → {llmMatchingResult?.totalMappingHeaders || 21} DHIS2 fields
                        </span>
                    </div>

                    {/* Loading State */}
                    {llmMatchingLoading && (
                        <div style={{ textAlign: 'center', padding: '20px' }}>
                            <Spin size="large" />
                            <div style={{ marginTop: '10px', color: '#666' }}>
                                Analyzing headers with AI... This may take a moment.
                            </div>
                        </div>
                    )}

                    {/* Error State */}
                    {llmMatchingError && (
                        <Alert
                            message="LLM Matching Error"
                            description={llmMatchingError}
                            type="error"
                            showIcon
                            style={{ marginBottom: '16px' }}
                        />
                    )}

                    {/* Results Display */}
                    {llmMatchingResult && !llmMatchingLoading && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Summary */}
                            <div style={{
                                display: 'flex',
                                gap: '20px',
                                padding: '12px',
                                backgroundColor: '#f6ffed',
                                border: '1px solid #b7eb8f',
                                borderRadius: '4px'
                            }}>
                                <div>
                                    <strong>Matches Found:</strong> {llmMatchingResult.matchedCount}/{llmMatchingResult.totalPdfHeaders}
                                </div>
                                <div>
                                    <strong>Unmatched PDF Headers:</strong> {llmMatchingResult.unmatchedPdfHeaders.length}
                                </div>
                                <div>
                                    <strong>Unmatched Mapping Headers:</strong> {llmMatchingResult.unmatchedMappingHeaders.length}
                                </div>
                            </div>

                            {/* Matches Table */}
                            {llmMatchingResult.matches && llmMatchingResult.matches.length > 0 && (
                                <div>
                                    <h4>✅ Header Matches</h4>
                                    <Table
                                        columns={[
                                            {
                                                title: 'PDF Header',
                                                dataIndex: 'pdfHeader',
                                                key: 'pdfHeader',
                                                width: 250,
                                            },
                                            {
                                                title: 'Mapped To',
                                                dataIndex: 'mappingHeader',
                                                key: 'mappingHeader',
                                                width: 250,
                                            },
                                            {
                                                title: 'Confidence',
                                                dataIndex: 'confidence',
                                                key: 'confidence',
                                                width: 120,
                                                render: (confidence: number) => (
                                                    <Tag color={confidence >= 0.8 ? 'green' : confidence >= 0.6 ? 'orange' : 'red'}>
                                                        {Math.round(confidence * 100)}%
                                                    </Tag>
                                                ),
                                            },
                                            {
                                                title: 'Reason',
                                                dataIndex: 'reason',
                                                key: 'reason',
                                                width: 300,
                                                ellipsis: true,
                                            }
                                        ]}
                                        dataSource={llmMatchingResult.matches.map((match: any, index: number) => ({
                                            key: index,
                                            ...match
                                        }))}
                                        size="small"
                                        pagination={false}
                                        scroll={{ y: 200 }}
                                    />
                                </div>
                            )}

                            {/* Unmatched Headers */}
                            {(llmMatchingResult.unmatchedPdfHeaders.length > 0 || llmMatchingResult.unmatchedMappingHeaders.length > 0) && (
                                <div style={{ display: 'flex', gap: '20px' }}>
                                    {llmMatchingResult.unmatchedPdfHeaders.length > 0 && (
                                        <div style={{ flex: 1 }}>
                                            <h4>❓ Unmatched PDF Headers</h4>
                                            <div style={{
                                                maxHeight: '150px',
                                                overflowY: 'auto',
                                                border: '1px solid #d9d9d9',
                                                borderRadius: '4px',
                                                padding: '8px',
                                                backgroundColor: '#fff2f0'
                                            }}>
                                                {llmMatchingResult.unmatchedPdfHeaders.map((header: string, index: number) => (
                                                    <div key={index} style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                                                        {header}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {llmMatchingResult.unmatchedMappingHeaders.length > 0 && (
                                        <div style={{ flex: 1 }}>
                                            <h4>❓ Unmatched Mapping Headers</h4>
                                            <div style={{
                                                maxHeight: '150px',
                                                overflowY: 'auto',
                                                border: '1px solid #d9d9d9',
                                                borderRadius: '4px',
                                                padding: '8px',
                                                backgroundColor: '#f6ffed'
                                            }}>
                                                {llmMatchingResult.unmatchedMappingHeaders.map((header: string, index: number) => (
                                                    <div key={index} style={{ padding: '4px 0', borderBottom: '1px solid #f0f0f0' }}>
                                                        {header}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Instructions */}
                    {!llmMatchingResult && !llmMatchingLoading && (
                        <Alert
                            message="How LLM Header Matching Works"
                            description={
                                <div>
                                    <p>1. <strong>Run LLM Matching:</strong> Click the button to analyze your extracted headers using AI</p>
                                    <p>2. <strong>Review Matches:</strong> The AI will match PDF headers to DHIS2 tracker fields with confidence scores</p>
                                    <p>3. <strong>Apply Results:</strong> Click "Apply Matches" to update your attribute mappings automatically</p>
                                    <p><strong>Benefits:</strong> Handles variations like "DoB" → "Date of Birth", "Sex (m/f)" → "Gender", etc.</p>
                                </div>
                            }
                            type="info"
                            showIcon
                        />
                    )}
                </div>
            </Modal>
        </div>
    );
};

export default TrackerDataGrid;
