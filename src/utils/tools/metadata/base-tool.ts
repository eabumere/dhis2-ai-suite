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
import { dhis2Api } from '../../app-runtime/dhis2-api';

/**
 * New LLM-First Tool Configuration
 * Pure tool calling: LLM selects tool + extracts parameters from schema
 * No custom NL processing in tools - let LLM handle everything
 */
export interface LLMToolConfig<T extends z.ZodSchema> {
    name: string;
    description: string;           // Clear, specific description for LLM tool selection
    schema: T;                   // Pure Zod schema for LLM parameter extraction
    metadataType: string;        // DHIS2 API endpoint
    dependencies?: Array<{       // Optional default dependencies
        type: string;
        name: string;
        createIfNotFound?: boolean;
        createParams?: Record<string, any>;
    }>;
    preparePayload?: (input: any) => any; // Tool-specific payload transformation
}

/**
 * LLM-First Tool Factory
 * Pure tool calling architecture: LLM handles everything, we handle validation & DHIS2 format
 */
export function createLLMFirstTool<T extends z.ZodSchema>(
    config: LLMToolConfig<T> & { dhis2SchemaName?: keyof typeof import('./schemas').Dhis2Schemas }
) {
    return tool(
        async ({ resource }: { resource: z.infer<T> }) => {
            try {
                // LLM provides structured parameters directly
                const llmInput = resource as any;

                // 1. Run tool-specific payload transformation if provided
                const transformedInput = config.preparePayload ?
                    await config.preparePayload(llmInput) : llmInput;

                // 2. Transform LLM input to full DHIS2 object
                const dhis2Object = {
                    // LLM-provided fields
                    ...transformedInput,

                    // Auto-generate required fields if missing
                    id: transformedInput.id || await generateDhis2Id(),
                    name: transformedInput.name,
                    displayName: transformedInput.displayName || transformedInput.name,
                    shortName: transformedInput.shortName || generateShortName(transformedInput.name || 'Unknown'),

                    // Explicitly generate code if not provided
                    code: transformedInput.code || (transformedInput.name ?
                        transformedInput.name.toUpperCase().replace(/[^A-Z0-9]/g, '_') :
                        `CODE_${Date.now()}`)
                };

                // 2. Use DLHIS2 schema for validation if provided
                const schemaToUse = config.dhis2SchemaName ?
                    (await import('./schemas')).Dhis2Schemas[config.dhis2SchemaName] :
                    config.schema;

                // Validate against DHIS2 schema
                const validation = validateResourceData(schemaToUse, dhis2Object);
                if (!validation.success) {
                    return JSON.stringify({
                        success: false,
                        error: `Validation failed: ${(validation as any).errors?.join(', ') || 'Unknown validation error'}`,
                        provided: llmInput,
                        required: 'Depends on DHIS2 schema requirements'
                    });
                }

                // 3. Resolve dependencies (default category combos for data elements, etc.)
                if (config.dependencies && config.dependencies.length > 0) {
                    const resolvedDeps = await resolveDependencies(
                        schemaToUse,
                        config.dependencies
                    );
                    validation.data = {
                        ...validation.data,
                        ...resolvedDeps,
                    };
                }

                // 4. Create in DHIS2
                const createResult = await createDhis2Metadata(
                    config.metadataType,
                    [validation.data]
                );

                // 5. Track in conversation context
                try {
                    addResourceToContext((validation.data as any).id, config.metadataType, (validation.data as any).name, 'created');
                } catch (contextError) {
                    console.warn('Failed to add resource to context:', contextError);
                }

                // 6. Return success response
                return JSON.stringify({
                    success: true,
                    message: `Successfully created ${config.metadataType.slice(0, -1)}: ${validation.data.name}`,
                    id: validation.data.id,
                    name: validation.data.name,
                    code: validation.data.code,
                    sortOrder: validation.data.sortOrder,
                    llm_input: llmInput,
                    dhis2_object: validation.data
                });

            } catch (error) {
                console.error(`Error in ${config.name}:`, error);
                return JSON.stringify({
                    success: false,
                    error: `Failed to create resource: ${error.message}`,
                    tool: config.name,
                    llm_params: { resource }
                });
            }
        },
        {
            name: config.name,
            description: config.description,
            schema: z.object({
                resource: config.schema
            }).describe(`Create a DHIS2 ${config.metadataType.slice(0, -1)} with these properties`),
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
    config: LLMToolConfig<T>
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
                        const existingResult = await dhis2Api.query({
                            resource: config.metadataType,
                            id: resourceId,
                            type: 'read'
                        });

                        if (existingResult.success) {
                            const existingData = existingResult.data;
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
                    ...(config.dependencies || []),
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
                const result = await dhis2Api.query({
                    resource: metadataType,
                    id: id,
                    type: 'read'
                });

                if (!result.success) {
                    throw new Error(`DHIS2 API error: ${result.error}`);
                }

                return JSON.stringify({
                    success: true,
                    [metadataType]: result.data
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
