import React, { useState, useCallback } from 'react';
import { Button, Table, Input, Select, Modal, Alert, Progress } from 'antd';
import { UploadOutlined, SettingOutlined, PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';

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
    onConfigureProcessing: (config: {
        orgUnit: string;
        programId: string;
        attributeMappings: Record<string, string>;
    }) => void;
    onUploadDocument: (file: File) => void;
    onRetryProcessing: () => void;
    processingStep?: string;
    processingProgress?: number;
    error?: string;
}

const TrackerDataGrid: React.FC<TrackerDataGridProps> = ({
    extractedPatients,
    mappedTrackerData,
    onConfigureProcessing,
    onUploadDocument,
    onRetryProcessing,
    processingStep,
    processingProgress,
    error
}) => {
    const [configModalVisible, setConfigModalVisible] = useState(false);
    const [uploadModalVisible, setUploadModalVisible] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    // Configuration state
    const [orgUnit, setOrgUnit] = useState('');
    const [programId, setProgramId] = useState('');
    const [attributeMappings, setAttributeMappings] = useState<Record<string, string>>({});

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

    // Default DHIS2 attribute mappings
    const defaultAttributeMappings: Record<string, string> = {
        "Patient ID: National ID": "AuPLng5hLbE",
        "Transfer: (in) From Date": "HwDGCdte3Ck",
        "Surname and Given name": "TfdH5KvFmMy",
        "DoB": "gHGyrwKPzej",
        "Sex (m/f)": "CklPZdOd6H1",
        "ART No Patient ID:": "CWVHZ3hPwKs",
        "Physical Address": "VqEFza8wbwA",
        "Patient's Phone No": "P2cwLGskgxn",
        "ART Start Date": "saTeJuuVyBd"
    };

    React.useEffect(() => {
        // Initialize with default mappings
        setAttributeMappings(defaultAttributeMappings);
    }, []);

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
            title: 'Patient ID',
            dataIndex: 'trackedEntityInstance',
            key: 'trackedEntityInstance',
            width: 200,
        },
        {
            title: 'Program',
            dataIndex: 'program',
            key: 'program',
            width: 150,
        },
        {
            title: 'Org Unit',
            dataIndex: 'orgUnit',
            key: 'orgUnit',
            width: 150,
        },
        {
            title: 'Enrollment Date',
            dataIndex: 'enrollmentDate',
            key: 'enrollmentDate',
            render: (date: string) => new Date(date).toLocaleDateString(),
            width: 120,
        },
        {
            title: 'Attributes',
            dataIndex: 'attributes',
            key: 'attributes',
            render: (attributes: Array<{attribute: string, value: string}>) =>
                `${attributes.length} attributes`,
            width: 120,
        },
    ];

    // Transform extracted patients data for display
    const patientTableData = React.useMemo(() => {
        if (extractedPatients.length === 0) return [];

        // Use first patient as representative for field structure
        const firstPatient = extractedPatients[0];
        return Object.entries(firstPatient).map(([fieldName, fieldData]) => ({
            key: fieldName,
            fieldName,
            value: fieldData.value,
            confidence: fieldData.confidence,
        }));
    }, [extractedPatients]);

    // Transform mapped tracker data for display
    const trackerTableData = React.useMemo(() => {
        return mappedTrackerData.map((patient, index) => ({
            key: index,
            ...patient,
        }));
    }, [mappedTrackerData]);

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
            {extractedPatients.length > 0 && (
                <div style={{ marginBottom: '30px' }}>
                    <h3>📋 Extracted Patient Data ({extractedPatients.length} patients)</h3>
                    <Table
                        columns={patientColumns}
                        dataSource={patientTableData}
                        size="small"
                        pagination={false}
                        scroll={{ y: 300 }}
                    />
                </div>
            )}

            {/* Mapped Tracker Data Table */}
            {mappedTrackerData.length > 0 && (
                <div>
                    <h3>🏥 Mapped Tracker Data ({mappedTrackerData.length} entities)</h3>
                    <Table
                        columns={trackerColumns}
                        dataSource={trackerTableData}
                        size="small"
                        pagination={false}
                        scroll={{ y: 300 }}
                    />
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
                            placeholder="e.g., cYSowRjnmHE"
                            value={orgUnit}
                            onChange={(e) => setOrgUnit(e.target.value)}
                        />
                    </div>

                    <div>
                        <label>Program ID:</label>
                        <Input
                            placeholder="e.g., o3jXXatOefs"
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
        </div>
    );
};

export default TrackerDataGrid;
