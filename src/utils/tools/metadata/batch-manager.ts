import { z } from 'zod';
import { generateDhis2Id, searchDhis2Metadata, validateResourceData } from './helpers';

// DHIS2 environment variables
const dhis2BaseUrl = (import.meta as any).env.DHIS2_API_BASE_URL;
const username = (import.meta as any).env.DHIS2_USERNAME;
const password = (import.meta as any).env.DHIS2_PASSWORD;

const auth = `${username}:${password}`;

function authHeaders(): HeadersInit {
    return {
        'Authorization': `Basic ${btoa(auth)}`,
        'Content-Type': 'application/json',
    };
}

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
     * Add a metadata operation to the batch
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
                errors: [error.message],
            };
        }
    }

    /**
     * Execute the unified metadata API call
     */
    private async executeMetadataAPI(
        payload: Record<string, any[]>,
        importStrategy: string
    ): Promise<any> {
        console.log('Executing unified metadata API:', JSON.stringify(payload, null, 2));

        const response = await fetch(`${dhis2BaseUrl}/metadata?importStrategy=${importStrategy}`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const responseText = await response.text();
            console.error('Unified metadata API Error:', response.status, responseText);
            throw new Error(`HTTP error! status: ${response.status}, response: ${responseText}`);
        }

        const data = await response.json();
        console.log('Unified metadata API Response:', data);
        return data;
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
                    // No specific report found, assume success if no errors at type level
                    results.push({
                        type: item.type,
                        operation: item.operation,
                        id: item.id,
                        success: !typeStats.errorReports?.length,
                        data: item.data,
                        error: typeStats.errorReports?.[0]?.message,
                        apiResponse: typeStats,
                    });

                    if (!typeStats.errorReports?.length) successful++;
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
 * Batch create multiple different resource types in a single API call
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

    // Execute the batch
    return manager.executeBatch(options);
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
