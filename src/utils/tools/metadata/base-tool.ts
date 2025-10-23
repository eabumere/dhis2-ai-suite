import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
    createDhis2Metadata,
    generateDhis2Id,
    generateShortName,
    resolveDependencies,
    searchDhis2Metadata,
    validateResourceData,
    addResourceToContext,
    updateDhis2Metadata,
} from './helpers';

/**
 * Configuration for creating a DHIS2 resource tool
 */
export interface Dhis2ToolConfig<T extends z.ZodSchema> {
    name: string;
    description: string;
    schema: T;
    metadataType: string;
    defaultDependencies?: Array<{
        type: string;
        name: string;
        createIfNotFound?: boolean;
        createParams?: Record<string, any>;
    }>;
    parseDescription?: (description: string) => {
        name: string;
        properties: Record<string, any>;
    };
}

/**
 * Create a structured DHIS2 resource tool - LLM-driven extraction
 * Expects schema-compliant objects populated by LLM instead of manual parsing
 */
export function createDhis2ResourceTool<
    T extends z.ZodSchema & { _output: Record<string, any> }
>(
    config: Dhis2ToolConfig<T>
) {
    return tool(
        async ({
            resource,
            resources,
            customId,
            dependencies = []
        }: {
            resource?: z.infer<T>;
            resources?: z.infer<T>[];
            customId?: string;
            dependencies?: Array<{
                type: string;
                name: string;
                createIfNotFound?: boolean;
                createParams?: Record<string, any>;
            }>;
        }) => {
            try {
                let resourcesToProcess: any[];

                if (resources && resources.length > 0) {
                    // Use explicitly provided resources array for batch operations
                    resourcesToProcess = resources;
                } else if (resource) {
                    // Single resource provided
                    resourcesToProcess = [resource];
                } else {
                    throw new Error('Must provide either resource or resources parameter');
                }

                const results = [];

                for (const resourceData of resourcesToProcess) {
                    try {
                        // Generate ID if not provided (either custom or from DHIS2)
                        const id = (resourceData.id || customId) || await generateDhis2Id();

                        // Set the ID on the resource data
                        const dataWithId = { ...resourceData, id };

                        // Generate derived fields if not provided
                        const finalData = {
                            ...dataWithId,
                            name: dataWithId.name,
                            displayName: dataWithId.displayName || dataWithId.name,
                            shortName: dataWithId.shortName || generateShortName(dataWithId.name || 'Unknown'),
                        };

                        // Combine default and custom dependencies
                        const allDependencies = [
                            ...(config.defaultDependencies || []),
                            ...dependencies
                        ];

                        // Resolve dependencies
                        const resolvedDeps = await resolveDependencies(
                            config.schema,
                            allDependencies
                        );

                        // Merge resolved dependencies
                        const finalResourceData = {
                            ...finalData,
                            ...resolvedDeps,
                        };

                        // Validate against schema
                        const validation = validateResourceData(config.schema, finalResourceData);
                        if (!validation.success) {
                            results.push({
                                success: false,
                                error: `Validation failed: ${(validation as any).errors?.join(', ') || 'Unknown validation error'}`,
                                resource: resourceData
                            });
                            continue;
                        }

                        // Create in DHIS2
                        const createResult = await createDhis2Metadata(
                            config.metadataType,
                            validation.data
                        );

                        // Track successful creations in conversation context
                        try {
                            addResourceToContext(validation.data.id, config.metadataType, validation.data.name, 'created');
                        } catch (contextError) {
                            console.warn('Failed to add resource to context:', contextError);
                        }

                        results.push({
                            success: true,
                            data: validation.data,
                            resource: resourceData,
                            apiResponse: createResult
                        });

                    } catch (error) {
                        results.push({
                            success: false,
                            error: `Failed to process resource: ${error.message}`,
                            resource: resourceData
                        });
                    }
                }

                // Return summary for batch operations
                const successCount = results.filter(r => r.success).length;
                const failureCount = results.filter(r => !r.success).length;

                return JSON.stringify({
                    success: failureCount === 0,
                    total: results.length,
                    successful: successCount,
                    failed: failureCount,
                    results: results
                });

            } catch (error) {
                console.error(`Error in ${config.name}:`, error);
                return JSON.stringify({
                    success: false,
                    error: `Tool error: ${error.message}`,
                    request: { resource, resources, customId, dependencies }
                });
            }
        },
        {
            name: config.name,
            description: config.description,
            schema: z.object({
                resource: config.schema.optional().describe(
                    "Single resource object with schema-compliant properties to create"
                ),
                resources: z.array(config.schema).optional().describe(
                    "Array of schema-compliant resource objects for batch creation"
                ),
                customId: z.string().optional().describe(
                    "Custom ID for the resource (if not provided, will be generated)"
                ),
                dependencies: z.array(z.object({
                    type: z.string().describe("Type of dependency (e.g., 'categoryCombos')"),
                    name: z.string().describe("Name of the dependency to search for"),
                    createIfNotFound: z.boolean().optional().describe(
                        "Whether to create the dependency if not found"
                    ),
                    createParams: z.record(z.string(), z.any()).optional().describe(
                        "Parameters for creating the dependency if it doesn't exist"
                    ),
                })).optional().describe(
                    "Dependencies that need to be resolved before creating this resource"
                ),
            }).describe(`Create DHIS2 resource from structured schema objects`),
        }
    );
}

/**
 * Create a search tool for DHIS2 resources
 */
export function createDhis2SearchTool(metadataType: string, displayName: string) {
    return tool(
        async ({ query, limit }: { query: string; limit: number }) => {
            try {
                const results = await searchDhis2Metadata(metadataType, query, limit);

                return JSON.stringify({
                    success: true,
                    query,
                    limit,
                    count: results.length,
                    results: results
                });
            } catch (error) {
                console.error(`Error searching ${metadataType}:`, error);
                return JSON.stringify({
                    success: false,
                    error: `Failed to search ${metadataType}: ${error.message}`,
                    query,
                    limit
                });
            }
        },
        {
            name: `search_dhis2_${metadataType.toLowerCase()}`,
            description: `Search DHIS2 ${displayName} by name`,
            schema: z.object({
                query: z.string().describe("The search query to match against resource names"),
                limit: z.number().int().min(1).max(100).default(10).describe(
                    "Maximum number of results to return"
                ),
            }),
        }
    );
}

/**
 * Create an update tool for DHIS2 resources
 * Allows modifying existing resources using schema-compliant objects
 */
export function createDhis2UpdateTool<T extends z.ZodSchema>(
    config: Dhis2ToolConfig<T>
) {
    return tool(
        async ({
            id,
            resource,
            customId,
            dependencies = []
        }: {
            id?: string;
            resource?: Record<string, any>;
            customId?: string;
            dependencies?: Array<{
                type: string;
                name: string;
                createIfNotFound?: boolean;
                createParams?: Record<string, any>;
            }>;
        }) => {
            try {
                if (!id && !resource?.id) {
                    throw new Error('Must provide either id parameter or include id in resource object');
                }

                const resourceId = id || resource!.id;
                let updatedResource: Record<string, any> = resource || {};

                // Handle partial updates - merge with existing resource
                if (resource && Object.keys(resource).length > 0) {
                    try {
                        const existing = await fetch(`${(import.meta as any).env.DHIS2_API_BASE_URL}/${config.metadataType}/${resourceId}`, {
                            method: "GET",
                            headers: {
                                'Authorization': `Basic ${btoa(`${(import.meta as any).env.DHIS2_USERNAME}:${(import.meta as any).env.DHIS2_PASSWORD}`)}`,
                                'Content-Type': 'application/json',
                            },
                        });

                        if (existing.ok) {
                            const existingData = await existing.json();
                            // Merge existing data with updates
                            updatedResource = {
                                ...existingData,
                                ...resource,
                                id: resourceId
                            };
                        } else {
                            // If can't fetch existing, use provided data
                            updatedResource = {
                                ...resource,
                                id: resourceId
                            };
                        }
                    } catch (fetchError) {
                        // Fallback to provided data only
                        updatedResource = {
                            ...resource,
                            id: resourceId
                        };
                    }
                }

                // Generate derived fields if not provided
                const finalData = {
                    ...updatedResource,
                    id: resourceId,
                    name: updatedResource.name || `Unnamed ${config.metadataType}`,
                    displayName: updatedResource.displayName || updatedResource.name || `Unnamed ${config.metadataType}`,
                    shortName: updatedResource.shortName || generateShortName(updatedResource.name || `Unnamed ${config.metadataType}`),
                };

                // Combine default and custom dependencies
                const allDependencies = [
                    ...(config.defaultDependencies || []),
                    ...dependencies
                ];

                // Resolve dependencies
                const resolvedDeps = await resolveDependencies(
                    config.schema,
                    allDependencies
                );

                // Merge resolved dependencies
                const finalResourceData = {
                    ...finalData,
                    ...resolvedDeps,
                };

                // Validate against schema
                const validation = validateResourceData(config.schema, finalResourceData);
                if (!validation.success) {
                    return JSON.stringify({
                        success: false,
                        error: `Validation failed: ${(validation as any).errors?.join(', ') || 'Unknown validation error'}`,
                        resource: finalResourceData
                    });
                }

                // Update in DHIS2
                const updateResult = await updateDhis2Metadata(
                    config.metadataType,
                    [validation.data]
                );

                return JSON.stringify({
                    success: true,
                    message: `${config.metadataType} updated successfully`,
                    data: validation.data,
                    resource: finalData,
                    apiResponse: updateResult
                });

            } catch (error) {
                console.error(`Error updating ${config.name}:`, error);
                return JSON.stringify({
                    success: false,
                    error: `Failed to update resource: ${error.message}`,
                    id,
                    resource
                });
            }
        },
        {
            name: `update_dhis2_${config.metadataType.toLowerCase()}`,
            description: `Update an existing DHIS2 ${config.description.split(' ')[0]} resource using schema-compliant data`,
            schema: z.object({
                id: z.string().optional().describe("The ID of the resource to update"),
                resource: config.schema.describe(
                    "Schema-compliant resource object with updated properties"
                ),
                customId: z.string().optional().describe(
                    "Custom ID for the resource (if not provided, will be generated)"
                ),
                dependencies: z.array(z.object({
                    type: z.string().describe("Type of dependency (e.g., 'categoryCombos')"),
                    name: z.string().describe("Name of the dependency to search for"),
                    createIfNotFound: z.boolean().optional().describe(
                        "Whether to create the dependency if not found"
                    ),
                    createParams: z.record(z.string(), z.any()).optional().describe(
                        "Parameters for creating the dependency if it doesn't exist"
                    ),
                })).optional().describe(
                    "Dependencies that need to be resolved before updating"
                ),
            }).describe(`Update DHIS2 ${config.metadataType} resource with schema objects`),
        }
    );
}

/**
 * Create a get by ID tool for DHIS2 resources
 */
export function createDhis2GetByIdTool(metadataType: string, displayName: string) {
    return tool(
        async ({ id }: { id: string }) => {
            try {
                const result = await fetch(`${import.meta.env.DHIS2_API_BASE_URL}/${metadataType}/${id}`, {
                    method: "GET",
                    headers: {
                        'Authorization': `Basic ${btoa(`${import.meta.env.DHIS2_USERNAME}:${import.meta.env.DHIS2_PASSWORD}`)}`,
                        'Content-Type': 'application/json',
                    },
                });

                if (!result.ok) {
                    throw new Error(`DHIS2 API error: ${result.status} ${result.statusText}`);
                }

                const data = await result.json();

                return JSON.stringify({
                    success: true,
                    [metadataType]: data
                });
            } catch (error) {
                console.error(`Error getting ${metadataType} by ID:`, error);
                return JSON.stringify({
                    success: false,
                    error: `Failed to get ${metadataType}: ${error.message}`,
                    id
                });
            }
        },
        {
            name: `get_dhis2_${metadataType.toLowerCase()}_by_id`,
            description: `Get DHIS2 ${displayName} by ID`,
            schema: z.object({
                id: z.string().describe("The ID of the resource to retrieve"),
            }),
        }
    );
}
