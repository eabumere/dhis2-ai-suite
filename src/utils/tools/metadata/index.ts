// Main exports for DHIS2 metadata tools
export * from './schemas';
export * from './helpers';
export * from './base-tool';
export * from './structured-tools';
export * from './batch-manager';

// Analytics tools
export {
    queryAnalytics,
    searchAnalyticsMetadata,
    getAllMetadata,
    getOrganisationUnits,
    getDataElements,
    computeTotal,
    computeAverage,
    computeMax,
    computeMin
} from './structured-tools';

// No legacy tools - using structured tools only

// Export the complete tools collection
export { Dhis2StructuredTools } from './structured-tools';

export { createDhis2Option, createDhis2DataElement, createDhis2Category, createDhis2CategoryCombo, createDhis2DataSet, createDhis2Program } from './structured-tools';
export { getUnifiedMetadataManager, batchCreateMetadata, batchUpdateMetadata } from './batch-manager';
