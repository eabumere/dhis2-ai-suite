import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
    generateDhis2Id,
    searchDhis2Metadata,
    createDhis2Metadata,
    validateResourceData,
    parseNaturalLanguageDescription,
    generateShortName,
    resolveDependencies,
    batchProcessResources
} from "./helpers";

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
 * Create a structured DHIS2 resource tool
 */
export function createDhis2ResourceTool<T extends z.ZodSchema>(
    config: Dhis2ToolConfig<T>
) {
    return tool(
        async ({
            description,
            descriptions,
            customId,
            dependencies = []
        }: {
            description?: string;
            descriptions?: string[];
            customId?: string;
            dependencies?: Array<{
                type: string;
                name: string;
                createIfNotFound?: boolean;
                createParams?: Record<string, any>;
            }>;
        }) => {
            try {
                // Handle both single and batch input
                const descriptionsToProcess = description
                    ? [description]
                    : descriptions || [];

                if (descriptionsToProcess.length === 0) {
                    throw new Error('Must provide either description or descriptions parameter');
                }

                const results = [];

                for (const desc of descriptionsToProcess) {
                    try {
                        // Parse natural language description
                        const parseResult = config.parseDescription
                            ? config.parseDescription(desc)
                            : parseNaturalLanguageDescription(desc);

                        // Generate ID (either custom or from DHIS2)
                        const id = customId || await generateDhis2Id();

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

                        // Create resource data
                        const resourceData = {
                            id,
                            name: parseResult.name,
                            displayName: parseResult.name,
                            shortName: generateShortName(parseResult.name),
                            ...parseResult.properties,
                            ...resolvedDeps,
                        };

                        // Validate against schema
                        const validation = validateResourceData(config.schema, resourceData);
                        if (!validation.success) {
                            results.push({
                                success: false,
                                error: `Validation failed for "${desc}": ${validation.errors.join(', ')}`,
                                description: desc
                            });
                            continue;
                        }

                        // Create in DHIS2
                        const createResult = await createDhis2Metadata(
                            config.metadataType,
                            validation.data
                        );

                        results.push({
                            success: true,
                            data: validation.data,
                            description: desc,
                            apiResponse: createResult
                        });

                    } catch (error) {
                        results.push({
                            success: false,
                            error: `Failed to process "${desc}": ${error.message}`,
                            description: desc
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
                    request: { description, descriptions, customId, dependencies }
                });
            }
        },
        {
            name: config.name,
            description: config.description,
            schema: z.object({
                description: z.string().optional().describe(
                    "Single natural language description of the resource to create"
                ),
                descriptions: z.array(z.string()).optional().describe(
                    "Array of natural language descriptions for batch creation"
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
                    createParams: z.record(z.any()).optional().describe(
                        "Parameters for creating the dependency if it doesn't exist"
                    ),
                })).optional().describe(
                    "Dependencies that need to be resolved before creating this resource"
                ),
            }).describe(`Create DHIS2 ${config.metadataType} from natural language descriptions`),
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
