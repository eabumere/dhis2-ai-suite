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
    extractOrgUnitKeywordsLLM,
    extractDatePeriodLLM,
    filterCategoriesForDisaggregationLLM,
    getAllMetadata,
    getOrganisationUnits,
    getDataElements,
    computeTotal,
    computeAverage,
    computeMax,
    computeMin,

    // Charting tools
    buildAnalyticsChart,

    // Search tools for analytics
    searchDhis2Indicators,
    searchDhis2DataElements,
    searchDhis2OrganisationUnits,
    searchDhis2Categories
} from './structured-tools';

// No legacy tools - using structured tools only

// Export the complete tools collection
export { Dhis2StructuredTools } from './structured-tools';

export { createDhis2Option, createDhis2DataElement, createDhis2Category, createDhis2CategoryCombo, createDhis2DataSet, createDhis2Program } from './structured-tools';
export { getUnifiedMetadataManager, batchCreateMetadata, batchUpdateMetadata } from './batch-manager';

// Update tools
export {
    updateDhis2DataElement,
    updateDhis2OrganisationUnit,
    updateDhis2Category,
    updateDhis2CategoryCombo,
    updateDhis2CategoryOption,
    updateDhis2DataSet,
    updateDhis2OrganisationUnitGroup,
    updateDhis2OrganisationUnitGroupSet,
    updateDhis2Program,
    updateDhis2TrackedEntityType,
    updateDhis2TrackedEntityAttribute,
    updateDhis2Indicator,
    updateDhis2IndicatorType,
    updateDhis2ValidationRule,
    updateDhis2OptionSet,
    updateDhis2Dashboard,
    updateDhis2TrackedEntityInstance,
    updateDhis2Enrollment,
    updateDhis2Event,
    updateDhis2User,
    updateDhis2RelationshipType,
    updateDhis2Relationship,
    updateDhis2ProgramStage,
    updateDhis2ProgramRule,
    updateDhis2ProgramIndicator,
    updateDhis2Visualization,
    updateDhis2DashboardItem,
    updateDhis2Resource,
} from './structured-tools';
