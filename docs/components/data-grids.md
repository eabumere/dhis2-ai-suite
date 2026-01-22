# 📊 Data Grid Components - Interactive Data Entry Interfaces

## Overview

The Data Grid Components provide sophisticated, interactive interfaces for data entry and validation workflows in the DHIS2 AI Suite. These components handle complex resolution processes, progressive loading, inline editing, and AI-powered data mapping, enabling users to efficiently process both aggregate and tracker data.

**Components**: `AggregateDataGrid`, `TrackerDataGrid`

**Key Features**:
- Real-time data validation and resolution
- Progressive loading for large datasets
- Inline editing with change tracking
- AI-powered field mapping and OCR processing
- Interactive resolution workflows

---

## 🧮 **AggregateDataGrid - CSV Data Processing**

### Overview

The AggregateDataGrid handles CSV and structured data imports, providing intelligent field resolution, validation, and submission workflows for periodic/facility-level data entry.

**File Location**: `src/components/AggregateDataGrid.tsx`

**Use Cases**: CSV uploads, bulk data entry, dataset population

### Core Features

#### 1. Intelligent Field Resolution

##### Resolution Types
The grid supports resolution for four key DHIS2 field types:

```typescript
type ResolutionFieldType =
    | 'dataElement'     // Indicators and data elements
    | 'orgUnit'         // Organization units/facilities
    | 'categoryOptionCombos'  // Category option combinations
    | 'attributeOptionCombos' // Attribute option combinations
```

##### Resolution States
```typescript
interface ResolutionItem {
    rowIndex: number;
    colIndex: number;
    originalValue: string;
    fieldType: ResolutionFieldType;
    status: 'pending' | 'searching' | 'needs_selection' | 'resolved' | 'failed';
    resolvedId?: string;     // DHIS2 resource ID
    searchResults?: any[];   // Available matches
}
```

##### Visual Resolution Indicators
- **⏳ Pending**: Yellow border - Click to resolve
- **🔍 Searching**: Blue border - Background processing
- **❓ Needs Selection**: Red border - Multiple matches found
- **✅ Resolved**: Green border - Successfully mapped
- **❌ Failed**: Red border - Resource not found

#### 2. Progressive Loading

##### Configuration Options
```typescript
interface AggregateDataGridProps {
    enableProgressiveLoading?: boolean;  // Enable chunked loading
    initialLoadCount?: number;            // Initial rows to display (default: 50)
    loadMoreIncrement?: number;           // Rows per load (default: 50)
}
```

##### Load More Interface
```typescript
// Automatic load triggering
const loadMoreRows = useCallback(() => {
    setLoadedRowCount(prev => Math.min(prev + loadMoreIncrement, rows.length));
}, [loadMoreIncrement, rows.length]);
```

#### 3. Inline Editing

##### Edit Mode Activation
- Click any cell to enter edit mode
- Automatic focus and keyboard navigation
- Save/Cancel with Enter/Escape keys

##### Change Tracking
```typescript
const handleEditCell = (rowIndex: number, colIndex: number, newValue: string) => {
    onEditCell(rowIndex, colIndex, newValue);
    // Triggers re-resolution if field requires it
};
```

#### 4. Resolution Workflows

##### Single Field Resolution
```typescript
const onResolveItem = (rowIndex: number, colIndex: number) => {
    // Trigger resolution for specific cell
    // Updates resolution state and visual indicators
};
```

##### Bulk Resolution
```typescript
const onResolveAll = () => {
    // Resolve all pending items in batch
    // Processes fields requiring resolution
};
```

##### Submission Validation
```typescript
const unresolvedCount = resolutionState.filter(
    ([, item]) => item.status !== 'resolved' &&
    resolvableFields.includes(item.fieldType)
).length;

const canSubmit = unresolvedCount === 0;
```

### Data Display Features

#### Enhanced Tooltips
```typescript
const getCellTooltip = (rowIndex: number, colIndex: number) => {
    const resolution = getCellResolutionStatus(rowIndex, colIndex);

    if (!resolution) return '';

    // Show field type, status, resolved ID, and detailed COC information
    return `${fieldType}: ${status}\nID: ${resolvedId}\n${cocDetails}`;
};
```

#### Human-Readable Names
```typescript
// Display names map for resolved IDs
const displayNames = new Map([
    ['dataElement:abc123', 'HIV Testing Performed'],
    ['orgUnit:def456', 'Central Hospital']
]);
```

### Action Buttons

#### Context-Aware Actions
```typescript
// New data submission
{!isExistingData && (
    <>
        <button onClick={onResolveAll}>Resolve All Pending</button>
        <button onClick={onConfirmSubmit} disabled={!canSubmit}>
            Confirm & Submit
        </button>
    </>
)}

// Existing data management
{isExistingData && (
    <>
        <button onClick={onUpdateDataSet}>Update Data Set</button>
        <button onClick={onAddRow}>Add New Row</button>
    </>
)}
```

---

## 🏥 **TrackerDataGrid - Patient Data Processing**

### Overview

The TrackerDataGrid manages patient-level data processing with OCR integration, AI-powered header matching, and comprehensive review workflows for tracker entity management.

**File Location**: `src/components/TrackerDataGrid.tsx`

**Use Cases**: Document OCR, patient registration, tracker data validation

### Core Features

#### 1. OCR Data Extraction

##### Extracted Patient Structure
```typescript
interface ExtractedPatientData {
    [fieldName: string]: {
        value: string;
        confidence: number;  // OCR confidence score
    };
}
```

##### Confidence Visualization
```typescript
// Low confidence indicators
{confidence < 0.8 && (
    <Tag color="red">{Math.round(confidence * 100)}% ⚠️</Tag>
)}
```

#### 2. AI-Powered Header Matching

##### LLM Header Matching
```typescript
const handleLlmHeaderMatching = async () => {
    const result = await matchPdfHeadersToMapping.invoke({
        pdfHeaders: availableFields,
        mappingHeaders: dhis2TrackerFields,
        confidenceThreshold: 0.7,
        context: 'DHIS2 tracker data mapping'
    });
};
```

##### Dynamic Attribute Mapping
```typescript
// PDF header → DHIS2 attribute ID mapping
const attributeMappings = {
    'Surname and Given name': 'w75KJ2mc4zz',  // Full Name attribute
    'DoB': 'qZP982qpSPS',                      // Date of Birth
    'Sex (m/f)': 'cejWyOfXge6',               // Gender
};
```

#### 3. Review Mode Editing

##### Inline Cell Editing
```typescript
const handleCellEdit = (rowIndex: number, fieldName: string, value: string) => {
    setEditingData(prev => ({
        ...prev,
        [rowIndex]: { ...prev[rowIndex], [fieldName]: value }
    }));
    setModifiedRows(prev => new Set([...prev, rowIndex]));
};
```

##### Change Tracking
```typescript
// Visual indicators for modified cells
const cellStyle = isCellModified(rowIndex, fieldName) ? {
    backgroundColor: 'var(--color-warning-50)',
    border: '2px solid var(--color-warning)'
} : {};
```

#### 4. Tracker Entity Management

##### Entity Actions Interface
```typescript
<EntityActions
    entityId={trackedEntityInstance}
    entityName="Tracker Entity"
    currentAttributes={attributes}
    availableAttributes={attributeMetadata}
    onUpdate={onUpdateEntity}
    onDelete={onDeleteEntity}
    onViewDetails={onViewEntityDetails}
    onUpdateAttributes={handleAttributeUpdate}
/>
```

##### Mapped Tracker Data Structure
```typescript
interface TrackerDataValue {
    trackedEntityInstance: string;
    program: string;
    orgUnit: string;
    enrollmentDate: string;
    attributes: Array<{
        attribute: string;
        value: string;
    }>;
    events?: Array<{
        programStage: string;
        dataValues: Array<{
            dataElement: string;
            value: string;
        }>;
    }>;
}
```

### Configuration Workflows

#### Processing Setup
```typescript
// Configuration modal for org unit, program, attribute mappings
<Modal title="Configure Tracker Processing">
    <Input placeholder="Org Unit ID" value={orgUnit} />
    <Input placeholder="Program ID" value={programId} />

    {/* Dynamic attribute mapping */}
    {availableFields.map(fieldName => (
        <div key={fieldName}>
            <span>{fieldName}:</span>
            <Input
                placeholder="DHIS2 Attribute ID"
                value={attributeMappings[fieldName]}
                onChange={(e) => updateAttributeMapping(fieldName, e.target.value)}
            />
        </div>
    ))}
</Modal>
```

#### Document Upload Integration
```typescript
// File upload with format validation
<input
    type="file"
    accept=".pdf,.png,.jpg,.jpeg,.tiff"
    onChange={handleFileSelect}
/>

// Size and format validation
const validateFile = (file: File): boolean => {
    const maxSize = 50 * 1024 * 1024; // 50MB
    const supportedTypes = ['application/pdf', 'image/png', 'image/jpeg'];

    return file.size <= maxSize && supportedTypes.includes(file.type);
};
```

### Processing States

#### Multi-Phase Processing
```typescript
const processingSteps = [
    'Uploading document...',
    'Extracting text with OCR...',
    'Parsing patient data...',
    'Validating data structure...',
    'Mapping to DHIS2 fields...',
    'Ready for review'
];
```

#### Progress Visualization
```typescript
{processingStep && (
    <div>
        <strong>Processing:</strong> {processingStep}
        <Progress percent={processingProgress} size="small" />
    </div>
)}
```

---

## 🔄 **Interactive Features & Actions**

### Cell-Level Interactions

#### Click Handlers
```typescript
const handleCellClick = (rowIndex: number, colIndex: number) => {
    const resolution = getCellResolutionStatus(rowIndex, colIndex);

    if (resolution?.status === 'pending') {
        onResolveItem(rowIndex, colIndex);  // Trigger resolution
    } else {
        setEditingCell({ row, col });       // Enter edit mode
    }
};
```

#### Keyboard Navigation
```typescript
onKeyDown={(e) => {
    if (e.key === 'Enter') handleEditSave();
    if (e.key === 'Escape') handleEditCancel();
}}
```

### Bulk Operations

#### Row Management
```typescript
const onDeleteRow = (rowIndex: number) => {
    // Remove row and update resolution states
    rows.splice(rowIndex, 1);
    updateResolutionStatesAfterDeletion(rowIndex);
};
```

#### Batch Resolution
```typescript
const onResolveAll = () => {
    // Process all pending resolutions
    const pendingItems = resolutionState.filter(
        ([, item]) => item.status === 'pending'
    );

    pendingItems.forEach(([, item]) => {
        resolveItem(item.rowIndex, item.colIndex);
    });
};
```

### Data Validation

#### Real-time Validation
```typescript
const validateCellValue = (value: string, fieldType: string): ValidationResult => {
    // Type-specific validation rules
    switch (fieldType) {
        case 'date': return validateDateFormat(value);
        case 'number': return validateNumeric(value);
        case 'boolean': return validateBoolean(value);
        default: return validateText(value);
    }
};
```

#### Submission Readiness
```typescript
const canSubmit = useMemo(() => {
    const unresolvedCount = resolutionState.filter(
        ([, item]) => item.status !== 'resolved'
    ).length;

    const hasValidData = rows.length > 0 && rows.every(row =>
        row.some(cell => cell && cell.trim())
    );

    return unresolvedCount === 0 && hasValidData;
}, [resolutionState, rows]);
```

---

## 🎨 **Visual Design & UX**

### Status Color Coding

#### AggregateDataGrid Legend
```css
.pending    { background: #fff3cd; border: 2px solid #ffc107; }
.searching  { background: #d1ecf1; border: 2px solid #17a2b8; }
.needs_selection { background: #f8d7da; border: 2px solid #dc3545; }
.resolved   { background: #d4edda; border: 2px solid #28a745; }
.failed     { background: #f5c6cb; border: 2px solid #dc3545; }
```

#### TrackerDataGrid Indicators
```css
.modified   { background: var(--color-warning-50); border: 2px solid var(--color-warning); }
.low-confidence { background: var(--color-error); color: var(--color-text-inverse); }
```

### Progressive Enhancement

#### Loading States
```typescript
{isLoadingMore ? (
    <div className="loading-indicator">
        <Spin size="small" />
        <span>Loading more rows...</span>
    </div>
) : (
    <button onClick={loadMoreRows}>
        Load {remainingRows} More Rows
    </button>
)}
```

#### Empty States
```typescript
{rows.length === 0 && (
    <div className="empty-state">
        <h3>No data to display</h3>
        <p>Upload a CSV file or add data manually</p>
    </div>
)}
```

---

## 🔧 **Integration Patterns**

### Orchestrator Communication

#### Event Callbacks
```typescript
// Data grid actions trigger orchestrator events
onResolveItem={(row, col) => {
    workflowOrchestrator.handleDataGridInteraction({
        type: 'resolve_item',
        data: { rowIndex: row, colIndex: col }
    });
}}

onConfirmSubmit={() => {
    workflowOrchestrator.handleDataGridInteraction({
        type: 'confirm_submit',
        data: { resolvedData: finalData }
    });
}}
```

#### State Synchronization
```typescript
// Real-time updates from workflow orchestrator
useEffect(() => {
    const subscription = workflowOrchestrator.subscribe('resolution_update', (update) => {
        updateResolutionState(update.rowIndex, update.colIndex, update.status);
    });

    return () => subscription.unsubscribe();
}, []);
```

### LLM Service Integration

#### Intelligent Field Mapping
```typescript
// TrackerDataGrid LLM header matching
const llmMatchingResult = await matchPdfHeadersToMapping.invoke({
    pdfHeaders: extractedFields,
    mappingHeaders: dhis2TrackerFields,
    confidenceThreshold: 0.7
});

// Apply high-confidence matches automatically
llmMatchingResult.matches
    .filter(match => match.confidence >= 0.8)
    .forEach(match => {
        setAttributeMapping(match.pdfHeader, match.mappingHeader);
    });
```

#### Resolution Assistance
```typescript
// AggregateDataGrid resolution with AI suggestions
const suggestions = await llmClassificationService.analyzeQuery(
    `Resolve "${originalValue}" for ${fieldType}`,
    { context: 'data_resolution' }
);
```

---

## 📊 **Performance Considerations**

### Memory Management

#### Large Dataset Handling
```typescript
// Progressive loading prevents memory issues
const MAX_VISIBLE_ROWS = 1000;
const LOAD_INCREMENT = 100;

const visibleRows = useMemo(() => {
    return enableProgressiveLoading
        ? rows.slice(0, loadedRowCount)
        : rows.slice(0, MAX_VISIBLE_ROWS);
}, [rows, loadedRowCount, enableProgressiveLoading]);
```

#### Cleanup Strategies
```typescript
// Clear editing state on unmount
useEffect(() => {
    return () => {
        setEditingCell(null);
        setEditValue('');
        setModifiedRows(new Set());
    };
}, []);
```

### Rendering Optimization

#### Virtual Scrolling
```typescript
// For very large datasets (>1000 rows)
const VirtualizedTable = ({ rows, columns }) => {
    const { virtualItems, totalHeight } = useVirtual({
        size: rows.length,
        estimateSize: () => 40, // Row height estimate
    });

    return (
        <div style={{ height: totalHeight }}>
            {virtualItems.map(virtualItem => (
                <div key={virtualItem.index} style={{
                    transform: `translateY(${virtualItem.start}px)`
                }}>
                    {/* Render row */}
                </div>
            ))}
        </div>
    );
};
```

#### Memoized Computations
```typescript
const resolutionMap = useMemo(() =>
    new Map(resolutionState),
    [resolutionState]
);

const visibleData = useMemo(() =>
    applyFiltersAndSorting(rows, filters, sortConfig),
    [rows, filters, sortConfig]
);
```

---

## 🚨 **Error Handling & Validation**

### Data Validation

#### Type-Specific Validation
```typescript
const validateFieldValue = (value: string, fieldType: string): ValidationError[] => {
    const errors: ValidationError[] = [];

    switch (fieldType) {
        case 'date':
            if (!isValidDate(value)) {
                errors.push({ type: 'format', message: 'Invalid date format' });
            }
            break;
        case 'number':
            if (isNaN(Number(value))) {
                errors.push({ type: 'format', message: 'Must be a valid number' });
            }
            break;
        case 'boolean':
            if (!['true', 'false', '1', '0', 'yes', 'no'].includes(value.toLowerCase())) {
                errors.push({ type: 'format', message: 'Must be true/false or yes/no' });
            }
            break;
    }

    return errors;
};
```

### Resolution Error Handling

#### Failed Resolution Recovery
```typescript
const handleResolutionFailure = (rowIndex: number, colIndex: number, error: string) => {
    // Update resolution state
    updateResolutionStatus(rowIndex, colIndex, 'failed');

    // Show user-friendly error
    showNotification({
        type: 'error',
        title: 'Resolution Failed',
        message: `${error}. Click to try again or edit manually.`,
        action: () => retryResolution(rowIndex, colIndex)
    });
};
```

#### Network Error Recovery
```typescript
const handleNetworkError = (operation: string, retry: () => void) => {
    showModal({
        title: 'Connection Error',
        content: `Failed to ${operation} due to network issues.`,
        actions: [
            { label: 'Retry', action: retry },
            { label: 'Cancel', action: () => {} }
        ]
    });
};
```

---

## 📋 **Usage Examples**

### Aggregate Data Entry
```typescript
<AggregateDataGrid
    headers={['dataElement', 'orgUnit', 'period', 'value']}
    displayHeaders={['Data Element', 'Facility', 'Period', 'Value']}
    rows={csvData}
    resolutionState={resolutionMap}
    displayNames={humanReadableNames}
    dataSetId="dataset123"
    dataSetName="Monthly Reporting"
    onResolveAll={handleBulkResolve}
    onEditCell={handleCellEdit}
    onConfirmSubmit={handleSubmit}
    enableProgressiveLoading={true}
    initialLoadCount={50}
/>
```

### Tracker Data Processing
```typescript
<TrackerDataGrid
    extractedPatients={ocrResults}
    mappedTrackerData={dhis2Entities}
    headerMappings={attributeMappings}
    headerDisplayNames={displayNames}
    attributeMetadata={fieldDefinitions}
    onConfigureProcessing={setupProcessing}
    onConfirmSave={saveToDHIS2}
    onCancelSave={cancelOperation}
    reviewMode={true}
    processingStep="Validating data..."
    processingProgress={75}
/>
```

### Configuration Setup
```typescript
const configureTrackerProcessing = (config: {
    orgUnit: string;
    programId: string;
    attributeMappings: Record<string, string>;
}) => {
    // Apply configuration to processing pipeline
    setOrgUnit(config.orgUnit);
    setProgramId(config.programId);
    setAttributeMappings(config.attributeMappings);

    // Trigger re-processing with new mappings
    restartProcessing();
};
```

---

## 🔍 **Debugging & Monitoring**

### State Inspection
```typescript
// Log grid state for debugging
console.log('DataGrid State:', {
    totalRows: rows.length,
    visibleRows: loadedRowCount,
    unresolvedItems: unresolvedCount,
    modifiedCells: modifiedRows.size,
    resolutionStates: resolutionMap.size
});
```

### Performance Metrics
```typescript
// Track rendering performance
const renderStart = performance.now();
// ... rendering logic ...
const renderTime = performance.now() - renderStart;

console.log(`Grid render time: ${renderTime.toFixed(2)}ms`);
```

### Common Issues

#### Resolution Problems
- **Stuck in pending**: Check network connectivity and DHIS2 API access
- **Multiple matches**: Review naming conventions and provide more specific identifiers
- **Failed resolutions**: Verify resource exists in DHIS2 and check permissions

#### Performance Issues
- **Large datasets**: Enable progressive loading and virtual scrolling
- **Slow rendering**: Implement memoization and reduce re-renders
- **Memory usage**: Clear unused data and implement proper cleanup

#### Data Quality Issues
- **Invalid formats**: Add client-side validation and format hints
- **Missing required fields**: Highlight mandatory fields and prevent submission
- **Inconsistent data**: Provide data cleaning suggestions and bulk corrections

---

The Data Grid Components provide powerful, user-friendly interfaces for complex data entry workflows, combining intelligent resolution, progressive loading, and comprehensive validation to ensure efficient and accurate DHIS2 data management.
