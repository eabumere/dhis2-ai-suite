// Main exports for DHIS2 metadata tools
export * from './schemas';
export * from './helpers';
export * from './base-tool';
export * from './structured-tools';

// Re-export tools for easy access
export {
    // Creation tools
    createDhis2DataElement,
    createDhis2OrganisationUnit,
    createDhis2Category,
    createDhis2CategoryCombo,
    createDhis2DataSet,
    createDhis2Program,
    createDhis2Indicator,
    createDhis2ValidationRule,
    createDhis2OptionSet,

    // Search tools
    searchDhis2DataElements,
    searchDhis2OrganisationUnits,
    searchDhis2Categories,
    searchDhis2CategoryCombos,
    searchDhis2DataSets,
    searchDhis2Programs,
    searchDhis2Indicators,

    // Get by ID tools
    getDhis2DataElementById,
    getDhis2OrganisationUnitById,
    getDhis2CategoryById,
    getDhis2DataSetById,
    getDhis2ProgramById,

    // Legacy tools
    searchDhis2Metadata,
    createDhis2Metadata,
} from './tools';

// Export the complete tools collection
export { Dhis2StructuredTools } from './structured-tools';
