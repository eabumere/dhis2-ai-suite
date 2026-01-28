import { z } from 'zod';
import { generateDhis2Id, searchDhis2Metadata, validateResourceData, checkResourceExists } from './helpers';
import { dhis2Api } from '../../app-runtime/dhis2-api';

// Note: DHIS2 authentication now handled by app-runtime automatically

/**
 * Metadata operation types
 */
export type MetadataOperation = 'CREATE' | 'UPDATE' | 'DELETE';

/**
 * Individual metadata item for batch processing
 */
export interface MetadataItem {
    type: string;
    operation: MetadataOperation;
    id?: string;
    data: Record<string, any>;
    dependencies?: Array<{
        type: string;
        name: string;
        createIfNotFound?: boolean;
        createParams?: Record<string, any>;
    }>;
    schema?: z.ZodSchema;
}

/**
 * Batch metadata request
 */
export interface BatchMetadataRequest {
    items: MetadataItem[];
    options?: {
        importStrategy?: 'CREATE' | 'UPDATE' | 'CREATE_UPDATE' | 'DELETE';
        atomic?: boolean; // If true, all operations succeed or all fail
        dryRun?: boolean; // If true, validate but don't execute
    };
}

/**
 * Batch metadata response
 */
export interface BatchMetadataResponse {
    success: boolean;
    total: number;
    successful: number;
    failed: number;
    results: Array<{
        type: string;
        operation: MetadataOperation;
        id?: string;
        success: boolean;
        data?: any;
        error?: string;
        apiResponse?: any;
    }>;
    apiResponse?: any;
    errors?: string[];
}

/**
 * Unified metadata API manager for batch operations
 */
export class UnifiedMetadataManager {
    private static instance: UnifiedMetadataManager;
    private pendingOperations: MetadataItem[] = [];
    private operationQueue: BatchMetadataRequest[] = [];

    private constructor() {}

    static getInstance(): UnifiedMetadataManager {
        if (!UnifiedMetadataManager.instance) {
            UnifiedMetadataManager.instance = new UnifiedMetadataManager();
        }
        return UnifiedMetadataManager.instance;
    }

    /**
     * Add a metadata operation to the batch with smart duplicate detection
     */
    async addOperation(
        type: string,
        operation: MetadataOperation,
        data: Record<string, any>,
        options: {
            id?: string;
            dependencies?: MetadataItem['dependencies'];
            schema?: z.ZodSchema;
        } = {}
    ): Promise<string> {
        // For CREATE operations, check if resource already exists
        if (operation === 'CREATE') {
            const existing = await this.checkExistingResource(type, data);
            if (existing.exists) {
                // Resource already exists, return success without creating
                console.log(`✓ Resource already exists: ${existing.name} (${existing.id})`);
                return existing.id;
            }
        }

        // Generate ID if not provided and operation requires it
        let itemId = options.id;
        if (!itemId && (operation === 'CREATE' || operation === 'UPDATE')) {
            itemId = await generateDhis2Id();
        }

        const item: MetadataItem = {
            type,
            operation,
            id: itemId,
            data: { ...data, ...(itemId ? { id: itemId } : {}) },
            dependencies: options.dependencies,
            schema: options.schema,
        };

        // Validate data if schema provided
        if (options.schema) {
            const validation = validateResourceData(options.schema, item.data);
            if (!validation.success) {
                throw new Error(`Validation failed for ${type}: ${validation.errors.join(', ')}`);
            }
            item.data = validation.data;
        }

        // Resolve dependencies if any
        if (options.dependencies && options.dependencies.length > 0) {
            await this.resolveDependencies(item);
        }

        this.pendingOperations.push(item);
        return itemId || `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Execute batch with enhanced duplicate detection and user feedback
     */
    async executeBatchWithDuplicateDetection(options: {
        importStrategy?: 'CREATE' | 'UPDATE' | 'CREATE_UPDATE' | 'DELETE';
        atomic?: boolean;
        dryRun?: boolean;
    } = {}): Promise<BatchMetadataResponse> {
        if (this.pendingOperations.length === 0) {
            return {
                success: true,
                total: 0,
                successful: 0,
                failed: 0,
                results: [],
            };
        }

        const {
            importStrategy = 'CREATE_UPDATE',
            atomic = true,
            dryRun = false
        } = options;

        // Track which resources already exist
        const existingResources: Array<{ type: string; name: string; id: string }> = [];
        const newResources: Array<{ type: string; name: string; id: string }> = [];

        // Pre-check all CREATE operations for existing resources
        for (const item of this.pendingOperations) {
            if (item.operation === 'CREATE') {
                const existing = await this.checkExistingResource(item.type, item.data);
                if (existing.exists) {
                    existingResources.push({
                        type: item.type,
                        name: existing.name || item.data.name || 'Unknown',
                        id: existing.id!
                    });
                } else {
                    newResources.push({
                        type: item.type,
                        name: item.data.name || 'Unknown',
                        id: item.id || 'Unknown'
                    });
                }
            }
        }

        console.log(`Batch operation summary:`);
        console.log(`- Existing resources (will be skipped): ${existingResources.length}`);
        console.log(`- New resources (will be created): ${newResources.length}`);
        console.log(`- Total operations: ${this.pendingOperations.length}`);

        if (existingResources.length > 0) {
            console.log(`Existing resources:`);
            existingResources.forEach(res => {
                console.log(`  ✓ ${res.type}: ${res.name} (${res.id})`);
            });
        }

        if (newResources.length > 0) {
            console.log(`New resources to create:`);
            newResources.forEach(res => {
                console.log(`  + ${res.type}: ${res.name} (${res.id})`);
            });
        }

        // Filter out existing resources from pending operations
        const filteredOperations = this.pendingOperations.filter(item => {
            if (item.operation === 'CREATE') {
                const existing = existingResources.find(res =>
                    res.type === item.type &&
                    res.name === (item.data.name || item.data.displayName)
                );
                return !existing;
            }
            return true; // Keep UPDATE and DELETE operations
        });

        if (filteredOperations.length === 0) {
            console.log('All CREATE operations were for existing resources, no API calls needed');
            return {
                success: true,
                total: this.pendingOperations.length,
                successful: this.pendingOperations.length,
                failed: 0,
                results: this.pendingOperations.map(item => ({
                    type: item.type,
                    operation: item.operation,
                    id: item.id,
                    success: true,
                    data: item.data,
                    error: undefined,
                    apiResponse: { message: 'Resource already exists, skipped creation' }
                })),
            };
        }

        // Execute the filtered batch
        const originalOperations = this.pendingOperations;
        this.pendingOperations = filteredOperations;

        try {
            const result = await this.executeBatch(options);

            // Restore original operations for return
            this.pendingOperations = originalOperations;

            // Enhance results with duplicate detection info
            const enhancedResults = this.enhanceResultsWithDuplicateInfo(result.results, existingResources, newResources);

            return {
                ...result,
                results: enhancedResults,
            };

        } catch (error) {
            // Restore original operations even on error
            this.pendingOperations = originalOperations;
            throw error;
        }
    }

    /**
     * Enhance results with duplicate detection information
     */
    private enhanceResultsWithDuplicateInfo(
        results: BatchMetadataResponse['results'],
        existingResources: Array<{ type: string; name: string; id: string }>,
        newResources: Array<{ type: string; name: string; id: string }>
    ): BatchMetadataResponse['results'] {
        const enhancedResults = [...results];

        // Add entries for existing resources that were skipped
        for (const existing of existingResources) {
            enhancedResults.push({
                type: existing.type,
                operation: 'CREATE' as MetadataOperation,
                id: existing.id,
                success: true,
                data: { name: existing.name, id: existing.id },
                error: undefined,
                apiResponse: {
                    message: 'Resource already exists, creation skipped',
                    duplicate: true
                }
            });
        }

        return enhancedResults;
    }

    /**
     * Check if a resource already exists by name or code
     */
    private async checkExistingResource(
        type: string,
        data: Record<string, any>
    ): Promise<{ exists: boolean; id?: string; name?: string }> {
        try {
            const name = data.name || data.displayName;
            const code = data.code;

            if (!name && !code) {
                return { exists: false };
            }

            // Search by name first
            if (name) {
                const existingByName = await searchDhis2Metadata(type, name, 5);
                if (existingByName.length > 0) {
                    // Check for exact name match (case-insensitive)
                    const exactMatch = existingByName.find(item =>
                        item.name?.toLowerCase() === name.toLowerCase()
                    );
                    if (exactMatch) {
                        return { exists: true, id: exactMatch.id, name: exactMatch.name };
                    }
                }
            }

            // Search by code if provided
            if (code) {
                const existingByCode = await checkResourceExists(type, undefined, undefined, code);
                if (existingByCode && existingByCode.exists && existingByCode.id) {
                    return { exists: true, id: existingByCode.id, name: existingByCode.data?.name };
                }
            }

            return { exists: false };
        } catch (error) {
            console.warn(`Failed to check existing resource for ${type}:`, error);
            return { exists: false };
        }
    }

    /**
     * Resolve dependencies for a metadata item
     */
    private async resolveDependencies(item: MetadataItem): Promise<void> {
        if (!item.dependencies) return;

        for (const dep of item.dependencies) {
            // Search for existing dependency
            const existing = await searchDhis2Metadata(dep.type, dep.name, 1);

            if (existing.length > 0) {
                // Update the data to reference the existing dependency
                this.updateDependencyReference(item.data, dep, existing[0].id);
            } else if (dep.createIfNotFound && dep.createParams) {
                // Create the dependency
                const depId = await generateDhis2Id();
                const depData = {
                    id: depId,
                    ...dep.createParams,
                };

                // Add dependency creation to pending operations
                this.pendingOperations.push({
                    type: dep.type,
                    operation: 'CREATE',
                    id: depId,
                    data: depData,
                });

                // Update the data to reference the new dependency
                this.updateDependencyReference(item.data, dep, depId);
            } else {
                throw new Error(`Dependency not found: ${dep.name} (${dep.type})`);
            }
        }
    }

    /**
     * Update dependency references in the data object
     */
    private updateDependencyReference(
        data: Record<string, any>,
        dependency: { type: string; name: string },
        id: string
    ): void {
        console.log('Update dependencies', data, dependency, id)
        // Handle common dependency patterns
        if (data.categoryCombo && dependency.type === 'categoryCombos') {
            data.categoryCombo = { id };
        } else if (data.categoryCombo?.categories && Array.isArray(data.categoryCombo.categories) && dependency.type === 'categories') {
            // Update category references in category combo
            data.categoryCombo.categories = data.categoryCombo.categories.map((cat: any) =>
                cat.name === dependency.name ? { id } : cat
            );
        } else if (data.organisationUnits && Array.isArray(data.organisationUnits) && dependency.type === 'organisationUnits') {
            data.organisationUnits = data.organisationUnits.map((ou: any) =>
                ou.name === dependency.name ? { id } : ou
            );
        } else if (data.dataElements && Array.isArray(data.dataElements) && dependency.type === 'dataElements') {
            data.dataElements = data.dataElements.map((de: any) =>
                de.name === dependency.name ? { id } : de
            );
        } else if (data.programStages && Array.isArray(data.programStages) && dependency.type === 'programStages') {
            data.programStages = data.programStages.map((ps: any) =>
                ps.name === dependency.name ? { id } : ps
            );
        }
        // Add more dependency patterns as needed
    }

    /**
     * Execute all pending operations in a single batch
     */
    async executeBatch(options: {
        importStrategy?: 'CREATE' | 'UPDATE' | 'CREATE_UPDATE' | 'DELETE';
        atomic?: boolean;
        dryRun?: boolean;
    } = {}): Promise<BatchMetadataResponse> {
        if (this.pendingOperations.length === 0) {
            return {
                success: true,
                total: 0,
                successful: 0,
                failed: 0,
                results: [],
            };
        }

        const {
            importStrategy = 'CREATE_UPDATE',
            atomic = true,
            dryRun = false
        } = options;

        try {
            // Group operations by type for the API payload
            const metadataPayload: Record<string, any[]> = {};

            for (const item of this.pendingOperations) {
                if (!metadataPayload[item.type]) {
                    metadataPayload[item.type] = [];
                }

                // Ensure ID is included in the data
                const payloadData = { ...item.data };
                if (item.id && !payloadData.id) {
                    payloadData.id = item.id;
                }

                metadataPayload[item.type].push(payloadData);
            }

            if (dryRun) {
                // Return validation results without making API call
                return {
                    success: true,
                    total: this.pendingOperations.length,
                    successful: this.pendingOperations.length,
                    failed: 0,
                    results: this.pendingOperations.map(item => ({
                        type: item.type,
                        operation: item.operation,
                        id: item.id,
                        success: true,
                        data: item.data,
                    })),
                };
            }

            // Execute the batch API call
            const apiResponse = await this.executeMetadataAPI(metadataPayload, importStrategy);

            // Process results
            const results = this.processBatchResults(this.pendingOperations, apiResponse);

            // Clear pending operations on success if atomic
            if (atomic && results.failed === 0) {
                this.pendingOperations = [];
            }

            return {
                success: results.failed === 0,
                total: results.total,
                successful: results.successful,
                failed: results.failed,
                results: results.results,
                apiResponse,
            };

        } catch (error) {
            console.error('Batch metadata operation failed:', error);

            return {
                success: false,
                total: this.pendingOperations.length,
                successful: 0,
                failed: this.pendingOperations.length,
                results: this.pendingOperations.map(item => ({
                    type: item.type,
                    operation: item.operation,
                    id: item.id,
                    success: false,
                    error: error.message,
                })),
                apiResponse: null,
                errors: [error.message],
            };
        }
    }

    /**
     * Execute the unified metadata API call using app-runtime
     */
    private async executeMetadataAPI(
        payload: Record<string, any[]>,
        importStrategy: string
    ): Promise<any> {
        console.log('Executing unified metadata API:', JSON.stringify(payload, null, 2));

        const result = await dhis2Api.mutate({
            resource: 'metadata',
            type: 'create',
            data: payload,
            params: {
                importStrategy: importStrategy as any,
                atomic: false
            }
        });

        if (!result.success) {
            console.error('Unified metadata API Error:', result);
            throw new Error(`App-runtime metadata API error: ${result.error || 'Unknown error'}`);
        }

        console.log('Unified metadata API Response:', result.data);
        return result.data;
    }

    /**
     * Process batch API results and map back to individual operations
     */
    private processBatchResults(
        operations: MetadataItem[],
        apiResponse: any
    ): { total: number; successful: number; failed: number; results: BatchMetadataResponse['results'] } {
        const results: BatchMetadataResponse['results'] = [];
        let successful = 0;
        let failed = 0;

        // Process each operation based on API response
        for (const item of operations) {
            const typeStats = apiResponse.typeReports?.find((report: any) => report.klass === item.type);

            if (typeStats) {
                const objectReports = typeStats.objectReports || [];

                // Find the specific object report for this item
                const objectReport = item.id
                    ? objectReports.find((report: any) => report.uid === item.id)
                    : objectReports[0]; // For operations without specific IDs

                if (objectReport) {
                    const success = objectReport.errorReports?.length === 0;

                    results.push({
                        type: item.type,
                        operation: item.operation,
                        id: item.id,
                        success,
                        data: item.data,
                        error: success ? undefined : objectReport.errorReports?.[0]?.message,
                        apiResponse: objectReport,
                    });

                    if (success) successful++;
                    else failed++;
                } else {
                    // No specific report found, check success based on operation type and stats
                    let success = false;
                    let error = typeStats.errorReports?.[0]?.message;

                    if (item.operation === 'DELETE') {
                        // For DELETE operations, check if the type stats show successful deletions
                        success = (typeStats.stats?.deleted > 0 && !typeStats.errorReports?.length) ||
                                 (typeStats.stats?.total > 0 && typeStats.stats?.deleted === typeStats.stats?.total);
                        if (!success && !error) {
                            error = 'Delete operation completed but no detailed confirmation available';
                        }
                    } else {
                        // For other operations, assume success if no errors at type level
                        success = !typeStats.errorReports?.length;
                    }

                    results.push({
                        type: item.type,
                        operation: item.operation,
                        id: item.id,
                        success,
                        data: item.data,
                        error,
                        apiResponse: typeStats,
                    });

                    if (success) successful++;
                    else failed++;
                }
            } else {
                // No report for this type, assume failure
                results.push({
                    type: item.type,
                    operation: item.operation,
                    id: item.id,
                    success: false,
                    data: item.data,
                    error: 'No response from API for this operation',
                });
                failed++;
            }
        }

        return {
            total: operations.length,
            successful,
            failed,
            results,
        };
    }

    /**
     * Clear all pending operations
     */
    clear(): void {
        this.pendingOperations = [];
    }

    /**
     * Get current pending operations count
     */
    getPendingCount(): number {
        return this.pendingOperations.length;
    }

    /**
     * Get pending operations (for debugging)
     */
    getPendingOperations(): MetadataItem[] {
        return [...this.pendingOperations];
    }

    /**
     * Rollback operations (for atomic mode failures)
     */
    async rollback(failedOperations: MetadataItem[]): Promise<BatchMetadataResponse> {
        const rollbackOperations: MetadataItem[] = [];

        for (const item of failedOperations) {
            if (item.id && item.operation === 'CREATE') {
                // Add delete operation for created items
                rollbackOperations.push({
                    type: item.type,
                    operation: 'DELETE',
                    id: item.id,
                    data: { id: item.id },
                });
            }
        }

        if (rollbackOperations.length === 0) {
            return {
                success: true,
                total: 0,
                successful: 0,
                failed: 0,
                results: [],
            };
        }

        // Temporarily replace pending operations with rollback operations
        const originalOperations = this.pendingOperations;
        this.pendingOperations = rollbackOperations;

        try {
            const result = await this.executeBatch({ importStrategy: 'DELETE' });

            // Restore original operations
            this.pendingOperations = originalOperations;

            return result;
        } catch (error) {
            // Restore original operations even on error
            this.pendingOperations = originalOperations;
            throw error;
        }
    }
}

/**
 * Convenience function to get the unified metadata manager instance
 */
export function getUnifiedMetadataManager(): UnifiedMetadataManager {
    return UnifiedMetadataManager.getInstance();
}

/**
 * Batch create multiple different resource types in a single API call with smart duplicate detection
 */
export async function batchCreateMetadata(
    items: Array<{
        type: string;
        data: Record<string, any>;
        dependencies?: MetadataItem['dependencies'];
        schema?: z.ZodSchema;
    }>,
    options: {
        importStrategy?: 'CREATE' | 'UPDATE' | 'CREATE_UPDATE' | 'DELETE';
        atomic?: boolean;
        dryRun?: boolean;
    } = {}
): Promise<BatchMetadataResponse> {
    const manager = getUnifiedMetadataManager();

    // Clear any existing operations
    manager.clear();

    // Add all items to the batch
    for (const item of items) {
        await manager.addOperation(
            item.type,
            'CREATE',
            item.data,
            {
                dependencies: item.dependencies,
                schema: item.schema,
            }
        );
    }

    // Execute the batch with enhanced duplicate detection
    return manager.executeBatchWithDuplicateDetection(options);
}

/**
 * Batch update multiple different resource types in a single API call
 */
export async function batchUpdateMetadata(
    items: Array<{
        type: string;
        id: string;
        data: Record<string, any>;
        schema?: z.ZodSchema;
    }>,
    options: {
        importStrategy?: 'CREATE' | 'UPDATE' | 'CREATE_UPDATE' | 'DELETE';
        atomic?: boolean;
        dryRun?: boolean;
    } = {}
): Promise<BatchMetadataResponse> {
    const manager = getUnifiedMetadataManager();

    // Clear any existing operations
    manager.clear();

    // Add all items to the batch
    for (const item of items) {
        await manager.addOperation(
            item.type,
            'UPDATE',
            item.data,
            {
                id: item.id,
                schema: item.schema,
            }
        );
    }

    // Execute the batch
    return manager.executeBatch(options);
}
