import React, { ReactNode, Component } from 'react';
import { useDataEngine } from '@dhis2/app-runtime';

// Types for API operations
export type Dhis2ApiResult<T = any> = {
    success: boolean;
    data?: T;
    error?: string;
    httpStatus?: number;
};

// Global variable to hold the data engine
let globalDataEngine: any = null;

/**
 * Internal component that initializes the global data engine
 * This is a side-effect component that doesn't render anything visible
 */
class DataEngineInitializer extends Component<{ engine: any }, {}> {
    componentDidMount() {
        globalDataEngine = this.props.engine;
    }

    componentDidUpdate(prevProps: { engine: any }) {
        if (prevProps.engine !== this.props.engine) {
            globalDataEngine = this.props.engine;
        }
    }

    render() {
        return null;
    }
}

/**
 * React provider component that initializes the global data engine
 * Must be wrapped around the app
 */
export const DataEngineProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const engine = useDataEngine();

    return (
        <>
            <DataEngineInitializer engine={engine} />
            {children}
        </>
    );
};

// Simple API class that uses the global engine
export class Dhis2Api {
    /**
     * Get the global data engine
     */
    private static getEngine(): any {
        if (!globalDataEngine) {
            throw new Error('DHIS2 app-runtime data engine not available. Make sure DataEngineProvider is wrapped around your app.');
        }
        return globalDataEngine;
    }

    /**
     * Generate a unique DHIS2 ID using system endpoint
     */
    static async generateId(): Promise<string> {
        try {
            const engine = this.getEngine();
            const result = await engine.query({
                systemId: {
                    resource: 'system/id',
                    params: { limit: 1 }
                }
            });

            if (result.systemId?.codes?.[0]) {
                return result.systemId.codes[0];
            }

            throw new Error('No ID returned from DHIS2 system');
        } catch (error) {
            console.error('Error generating DHIS2 ID:', error);
            // Fallback to timestamp-based ID
            return `generated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }
    }

    /**
     * Search for DHIS2 metadata by name
     */
    static async searchMetadata(
        metadataType: string,
        query: string,
        limit: number = 10
    ): Promise<Array<{ id: string; name: string; code?: string; displayName: string }>> {
        try {
            const engine = this.getEngine();
            const result = await engine.query({
                search: {
                    resource: metadataType,
                    params: {
                        filter: `name:ilike:${encodeURIComponent(query)}`,
                        fields: 'id,name,code,displayName',
                        paging: false
                    }
                }
            });

            const items = result.search?.[metadataType] || [];
            return items.slice(0, limit);
        } catch (error) {
            console.error(`Error searching ${metadataType}:`, error);
            return [];
        }
    }

    /**
     * Execute a mutation
     */
    static async mutate(config: any): Promise<Dhis2ApiResult> {
        try {
            const engine = this.getEngine();
            const result = await engine.mutate(config);
            return {
                success: true,
                data: result,
                httpStatus: 200
            };
        } catch (error: any) {
            console.error('DHIS2 mutation error:', error);
            return {
                success: false,
                error: error.message || 'Mutation failed',
                httpStatus: error.httpStatusCode || 500
            };
        }
    }

    /**
     * Execute a query
     */
    static async query(config: any): Promise<Dhis2ApiResult> {
        try {
            const engine = this.getEngine();
            const result = await engine.query(config);
            return {
                success: true,
                data: result,
                httpStatus: 200
            };
        } catch (error: any) {
            console.error('DHIS2 query error:', error);
            return {
                success: false,
                error: error.message || 'Query failed',
                httpStatus: error.httpStatusCode || 500
            };
        }
    }
}

/**
 * Exported singleton instance for easier access
 */
export const dhis2Api = Dhis2Api;

/**
 * Utility functions that use the Dhis2Api class
 * These can be called from anywhere after the provider has been initialized
 */

/**
 * Generate a unique DHIS2 ID using system endpoint
 */
export async function generateDhis2Id(): Promise<string> {
    return await Dhis2Api.generateId();
}

/**
 * Search for DHIS2 metadata by name
 */
export async function searchDhis2Metadata(
    metadataType: string,
    query: string,
    limit: number = 10
): Promise<Array<{ id: string; name: string; code?: string; displayName: string }>> {
    return await Dhis2Api.searchMetadata(metadataType, query, limit);
}

/**
 * Check if a specific resource exists
 */
export async function checkResourceExists(
    metadataType: string,
    name?: string,
    id?: string,
    code?: string
): Promise<{ exists: boolean; id?: string; data?: any } | null> {
    try {
        if (id) {
            // Check by ID
            const result = await Dhis2Api.query({
                resource: {
                    resource: `${metadataType}/${id}`,
                    params: { fields: 'id,name,code,displayName' }
                }
            });

            if (result.success && result.data?.resource) {
                return { exists: true, id: result.data.resource.id, data: result.data.resource };
            } else {
                return { exists: false };
            }
        } else if (name) {
            // First try exact name match
            const searchResults = await Dhis2Api.searchMetadata(metadataType, name, 5);
            const exactMatch = searchResults.find(item =>
                item.name.toLowerCase() === name.toLowerCase() ||
                (item.code && item.code.toLowerCase() === name.toLowerCase())
            );

            if (exactMatch) {
                return { exists: true, id: exactMatch.id, data: exactMatch };
            }

            // For data elements, also try searching by code if name search failed
            if (metadataType === 'dataElements' && code) {
                const result = await Dhis2Api.query({
                    resource: {
                        resource: metadataType,
                        params: {
                            filter: `code:eq:${encodeURIComponent(code)}`,
                            fields: 'id,name,code,displayName',
                            paging: false
                        }
                    }
                });

                const items = result.data?.resource?.[metadataType] || [];
                if (items.length > 0) {
                    return { exists: true, id: items[0].id, data: items[0] };
                }
            }

            return { exists: false };
        }

        return null;
    } catch (error: any) {
        console.error('Error checking resource existence:', error);
        // If 404, resource doesn't exist
        if (error.message?.includes('404') || error.httpStatusCode === 404) {
            return { exists: false };
        }
        return null;
    }
}

/**
 * Create DHIS2 metadata using aggregated single payload
 */
export async function createDhis2MetadataAggregated(
    aggregatedPayload: Record<string, Record<string, any>[]>
): Promise<{ response: any; httpStatus: number; results: Array<{ type: string; id?: string; exists?: boolean; created?: boolean }> }> {
    const results: Array<{ type: string; id?: string; exists?: boolean; created?: boolean }> = [];

    // Process each resource type - check existence first
    for (const [metadataType, resources] of Object.entries(aggregatedPayload)) {
        for (const resource of resources) {
            const existsCheck = await checkResourceExists(
                metadataType,
                resource.name,
                resource.id,
                metadataType === 'dataElements' ? resource.code : undefined
            );
            if (existsCheck?.exists) {
                console.log(`✅ Resource already exists: ${metadataType} '${resource.name}' with ID: ${existsCheck.id}`);
                results.push({ type: metadataType, id: existsCheck.id, exists: true, created: false });
                continue;
            }
            results.push({ type: metadataType, id: resource.id, exists: false, created: true });
        }
    }

    // Filter to only include resources that don't exist
    const filteredPayload: Record<string, Record<string, any>[]> = {};
    let hasNewResources = false;

    for (const [metadataType, resources] of Object.entries(aggregatedPayload)) {
        const newResources = resources.filter(resource => {
            const result = results.find(r => r.type === metadataType && r.id === resource.id);
            return !result?.exists;
        });

        if (newResources.length > 0) {
            filteredPayload[metadataType] = newResources;
            hasNewResources = true;
        }
    }

    if (!hasNewResources) {
        console.log('All resources already exist, no creation needed');
        return {
            response: { status: 'OK', message: 'All resources already exist' },
            httpStatus: 200,
            results
        };
    }

    console.log('Creating aggregated metadata:', JSON.stringify(filteredPayload, null, 2));

    const mutationConfig = {
        resource: 'metadata',
        type: 'create',
        data: filteredPayload,
        params: {
            importStrategy: 'CREATE_UPDATE',
            atomic: false
        }
    };

    const result = await Dhis2Api.mutate(mutationConfig);

    if (!result.success) {
        console.error('Aggregated metadata creation failed:', result);
        throw new Error(`Aggregated metadata API error: ${result.httpStatus} ${result.error}`);
    }

    console.log('Aggregated metadata creation success:', result.data);
    return {
        response: result.data,
        httpStatus: result.httpStatus || 200,
        results
    };
}

/**
 * Create DHIS2 metadata directly via single API calls
 */
export async function createDhis2MetadataDirect(
    metadataType: string,
    payload: Record<string, any>
): Promise<{ response: any; httpStatus: number; uid?: string; exists?: boolean }> {
    if (Array.isArray(payload)) {
        throw new Error('createMetadataDirect only supports single objects, not arrays');
    }

    // Check if resource already exists
    const existsCheck = await checkResourceExists(metadataType, payload.name, payload.id);
    if (existsCheck?.exists) {
        console.log(`✅ Resource already exists: ${metadataType} '${payload.name}' with ID: ${existsCheck.id}`);
        return {
            response: existsCheck.data,
            httpStatus: 200,
            uid: existsCheck.id,
            exists: true
        };
    }

    const metadataPayload = { [metadataType]: [payload] };

    console.log('Creating metadata directly:', JSON.stringify(metadataPayload, null, 2));

    const mutationConfig = {
        resource: 'metadata',
        type: 'create',
        data: metadataPayload,
        params: {
            importStrategy: 'CREATE_UPDATE'
        }
    };

    const result = await Dhis2Api.mutate(mutationConfig);

    if (!result.success) {
        // Check if it's a conflict (resource exists but wasn't detected)
        if (result.httpStatus === 409 || result.error?.includes('already exists')) {
            console.log('Resource conflicts (409), checking if it actually exists:');
            const existsAfterConflict = await checkResourceExists(metadataType, payload.name, payload.id);
            if (existsAfterConflict?.exists) {
                console.log(`✅ Resource existed after conflict: ${metadataType} '${payload.name}' with ID: ${existsAfterConflict.id}`);
                return {
                    response: existsAfterConflict.data,
                    httpStatus: 200,
                    uid: existsAfterConflict.id,
                    exists: true
                };
            }
        }

        console.error('Metadata creation failed:', {
            status: result.httpStatus,
            error: result.error,
            data: result
        });
        throw new Error(`Metadata API error: ${result.httpStatus} ${result.error}`);
    }

    console.log('Metadata creation success:', result.data);
    return {
        response: result.data,
        httpStatus: result.httpStatus || 200,
        uid: payload.id, // Return the ID that was used
        exists: false
    };
}
