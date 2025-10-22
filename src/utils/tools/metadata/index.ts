// Main exports for DHIS2 metadata tools
export * from './schemas';
export * from './helpers';
export * from './base-tool';
export * from './structured-tools';
export * from './batch-manager';

// Re-export legacy tools for backward compatibility
export {
    searchDhis2Metadata,
    createDhis2Metadata,
} from './tools';

// Export the complete tools collection
export { Dhis2StructuredTools } from './structured-tools';

// Export unified metadata manager
export { getUnifiedMetadataManager, batchCreateMetadata, batchUpdateMetadata } from './batch-manager';

// Export test functions for development and testing
export * from './test-batch';
