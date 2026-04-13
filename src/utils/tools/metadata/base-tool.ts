import { tool, DynamicStructuredTool } from '@langchain/core/tools';
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
    deleteDhis2Metadata,
} from './helpers';
import { dhis2Api } from '../../app-runtime/dhis2-api';

// Global Workflow Orchestrator Singleton
// Set once by orchestrator during initialization, available to all tools
let globalOrchestratorInstance: any = null;

/**
 * Set the global orchestrator instance - called once during application initialization
 */
export function setOrchestratorInstance(orchestrator: any) {
    globalOrchestratorInstance = orchestrator;
    console.log('✅ Global workflow orchestrator instance registered', orchestrator);
}

/**
 * Get the global orchestrator instance - can be called from any tool
 */
export function getOrchestratorInstance(): any | null {
    return globalOrchestratorInstance;
}

/**
 * Extract required field names from a Zod schema for LLM prompting
 */
function getRequiredFieldsFromSchema(schema: z.ZodSchema): string[] {
    // For known schemas that were failing, return hardcoded required fields
    // This ensures the LLM gets explicit instructions about required fields
    try {
        // Try to detect which schema this is by checking for known field patterns
        const schemaDef = (schema as any)._def;

        if (schemaDef.typeName === 'ZodObject' && schemaDef.shape) {
            // Check for DataElement schema (has valueType, domainType, aggregationType)
            if (schemaDef.shape.valueType && schemaDef.shape.domainType && schemaDef.shape.aggregationType) {
                return ['name', 'valueType', 'domainType', 'aggregationType', 'shortName'];
            }

            // Check for Category schema (has dataDimension, categoryOptions array)
            if (schemaDef.shape.dataDimension && schemaDef.shape.categoryOptions && Array.isArray(schemaDef.shape.categoryOptions._def.type._def.shape)) {
                return ['name', 'shortName', 'dataDimensionType', 'categoryOptions'];
            }

            // Check for CategoryCombo schema (has categories array, dataDimensionType)
            if (schemaDef.shape.categories && schemaDef.shape.dataDimensionType && Array.isArray(schemaDef.shape.categories._def.type._def.shape)) {
                return ['name', 'shortName', 'dataDimensionType', 'categories'];
            }

            // Check for DataSet schema (has periodType, dataSetElements)
            if (schemaDef.shape.periodType && schemaDef.shape.dataSetElements) {
                return ['name', 'shortName', 'periodType', 'dataSetElements'];
            }

            // Fallback: try to extract dynamically
            const requiredFields: string[] = [];

            for (const [fieldName, fieldSchema] of Object.entries(schemaDef.shape)) {
                const fieldDef = (fieldSchema as any)._def;

                // Check if field is required (not optional or nullable by default)
                const isOptional = fieldDef.typeName === 'ZodOptional' ||
                                  fieldDef.typeName === 'ZodNullable' ||
                                  fieldDef.typeName === 'ZodDefault';

                if (!isOptional) {
                    requiredFields.push(fieldName);
                }
            }

            return requiredFields;
        }

        return [];
    } catch (error) {
        console.warn('Failed to extract required fields from schema:', error);
        // Return common required fields as fallback
        return ['name', 'shortName'];
    }
}

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
    checkExistence?: boolean;    // Enable automatic existence verification before creation
    searchLimit?: number;        // Max results to show in selection dialog
}

/**
 * LLM-First Tool Factory
 * Pure tool calling architecture: LLM handles everything, we handle validation & DHIS2 format
 */
export function createLLMFirstTool<T extends z.ZodSchema>(
    config: LLMToolConfig<T> & { dhis2SchemaName?: keyof typeof import('./schemas').Dhis2Schemas }
): DynamicStructuredTool {
    return tool(
        async ({ resource }: { resource: z.infer<T> }) => {
            try {
                // LLM provides structured parameters directly
                const llmInput = resource as any;

                // ✅ PRE-VALIDATION: Check for sufficient information BEFORE any processing
                // First get all required fields from schema
                const requiredFields = getRequiredFieldsFromSchema(config.schema);
                
                // Fields that can be safely auto-generated with defaults
                const autoGeneratableFields = ['id', 'shortName', 'code', 'displayName'];
                
                // Find required fields that user did NOT provide AND cannot be auto-generated
                const missingUserFields = requiredFields.filter(field => 
                    // Field is required
                    // User did NOT provide this field
                    llmInput[field] === undefined && 
                    // Field CANNOT be auto-generated
                    !autoGeneratableFields.includes(field)
                );

                // ✅ Also validate dependencies if configured
                const missingDependencyInfo: Record<string, string[]> = {};
                
                if (config.dependencies && config.dependencies.length > 0) {
                    for (const dep of config.dependencies) {
                        // Check if dependency has sufficient information to be created
                        if (dep.createIfNotFound && dep.createParams) {
                            const depSchemaName = Object.keys((await import('./schemas')).Dhis2Schemas)
                                .find(s => s.toLowerCase() === dep.type.slice(0, -1).toLowerCase());
                            
                            if (depSchemaName) {
                                const depSchema = (await import('./schemas')).Dhis2Schemas[depSchemaName as keyof typeof import('./schemas').Dhis2Schemas];
                                const depRequiredFields = getRequiredFieldsFromSchema(depSchema);
                                
                                const depMissingFields = depRequiredFields.filter(field => 
                                    dep.createParams![field] === undefined && 
                                    !autoGeneratableFields.includes(field)
                                );
                                
                                if (depMissingFields.length > 0) {
                                    missingDependencyInfo[dep.type] = depMissingFields;
                                }
                            }
                        }
                    }
                }

                // If ANY required information is missing - STOP HERE and inform user
                if (missingUserFields.length > 0 || Object.keys(missingDependencyInfo).length > 0) {
                    const errorResponse: any = {
                        success: false,
                        error: "Insufficient information provided to create metadata",
                        message: "Please provide the following missing information before proceeding:",
                        missingFields: {}
                    };

                    if (missingUserFields.length > 0) {
                        errorResponse.missingFields.mainResource = missingUserFields;
                    }

                    if (Object.keys(missingDependencyInfo).length > 0) {
                        errorResponse.missingFields.dependencies = missingDependencyInfo;
                    }

                    console.log('⚠️ Cannot create metadata: Missing required information', errorResponse.missingFields);
                    
                    return JSON.stringify(errorResponse);
                }

                // ✅ All required information is present - proceed with creation

                // ✅ GLOBAL EXISTENCE VERIFICATION (APPLIES TO ALL TOOLS)
                // Enable by default for all tools unless explicitly disabled
                const shouldCheckExistence = config.checkExistence !== false;
                
                if (shouldCheckExistence && llmInput.name) {
                    const searchLimit = config.searchLimit || 20;
                    const searchResults = await searchDhis2Metadata(config.metadataType, llmInput.name, searchLimit);

                    if (searchResults.length > 0) {
                        console.log(`⚠️ Found ${searchResults.length} existing ${config.metadataType} matching "${llmInput.name}"`);
                        
                        const orchestrator = getOrchestratorInstance();
                        
                        if (orchestrator && orchestrator.requestSelection) {
                            // Show verification dialog with all matches
                            // ✅ Build properly humanized strings directly (NO regex hacks needed)
                            const humanizeResourceName = (resource: string): string => {
                                const mappings: Record<string, string> = {
                                    'dataElement': 'Data Element',
                                    'dataElements': 'Data Elements',
                                    'indicator': 'Indicator',
                                    'indicators': 'Indicators',
                                    'organisationUnit': 'Organisation Unit',
                                    'organisationUnits': 'Organisation Units',
                                    'dataSet': 'Data Set',
                                    'dataSets': 'Data Sets',
                                    'program': 'Program',
                                    'programs': 'Programs',
                                    'category': 'Category',
                                    'categories': 'Categories',
                                    'categoryCombo': 'Category Combo',
                                    'categoryCombos': 'Category Combos',
                                    'optionSet': 'Option Set',
                                    'optionSets': 'Option Sets',
                                    'validationRule': 'Validation Rule',
                                    'validationRules': 'Validation Rules',
                                    'visualization': 'Visualization',
                                    'visualizations': 'Visualizations',
                                    'dashboard': 'Dashboard',
                                    'dashboards': 'Dashboards',
                                    'user': 'User',
                                    'users': 'Users',
                                    'categoryOption': 'Category Option',
                                    'categoryOptions': 'Category Options',
                                    'organisationUnitGroup': 'Organisation Unit Group',
                                    'organisationUnitGroups': 'Organisation Unit Groups',
                                    'trackedEntityType': 'Tracked Entity Type',
                                    'trackedEntityTypes': 'Tracked Entity Types'
                                };
                                
                                return mappings[resource] || resource.charAt(0).toUpperCase() + resource.slice(1).replace(/([A-Z])/g, ' $1');
                            };

                            const singular = config.metadataType.slice(0, -1);
                            const humanizedSingular = humanizeResourceName(singular);
                            const humanizedPlural = humanizeResourceName(config.metadataType);

                            const selection = await orchestrator.requestSelection({
                                title: `Existing ${humanizedSingular} found`,
                                description: `${searchResults.length} existing ${humanizedPlural} match "${llmInput.name}". Select one to use it, or create new:`,
                                items: searchResults.map(r => ({
                                    id: r.id,
                                    name: r.name,
                                    code: r.code || '',
                                    displayName: r.displayName
                                })),
                                allowCreateNew: true,
                                createNewLabel: "Create New Anyway",
                                confirmButtonText: "Use Existing",
                                parentResource: singular,
                                parentName: llmInput.name
                            });

                            if (selection && selection.id !== '__create_new__') {
                                // User selected existing resource
                                console.log(`✅ User selected existing ${config.metadataType.slice(0, -1)}: ${selection.name} (${selection.id})`);
                                return JSON.stringify({
                                    success: true,
                                    message: `✅ ${config.metadataType.slice(0, -1)} "${selection.name}" already exists`,
                                    id: selection.id,
                                    name: selection.name,
                                    exists: true,
                                    action: 'use_existing',
                                    llm_input: llmInput
                                });
                            }

                            // User selected create new or dismissed - proceed with creation
                            console.log(`✅ User chose to create new ${config.metadataType.slice(0, -1)}`);
                        } else {
                            // No UI available - log warning and proceed
                            console.log(`⚠️ ${searchResults.length} existing matches found, but no selection UI available. Proceeding with creation.`);
                        }
                    }
                }

                // 1. Run tool-specific payload transformation if provided
                const transformedInput = config.preparePayload ?
                    await config.preparePayload(llmInput) : llmInput;

                // 1.5. Check if resource already exists (set by preparePayload)
                if ((transformedInput as any)._exists) {
                    console.log(`Resource "${llmInput.name}" already exists (ID: ${(transformedInput as any)._existingId}) - skipping creation`);
                    return JSON.stringify({
                        success: false,
                        warning: true,
                        message: `⚠️ ${config.metadataType.slice(0, -1)} "${llmInput.name}" already exists. Creation skipped.`,
                        id: (transformedInput as any)._existingId,
                        name: llmInput.name,
                        exists: true,
                        action: 'skipped_creation',
                        llm_input: llmInput
                    });
                }

                // 2. Transform LLM input to full DHIS2 object
                let dhis2Object = {
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

                // Always populate DHIS2-required fields with defaults based on schema type
                if (config.dhis2SchemaName) {
                    switch (config.dhis2SchemaName) {
                        case 'DataElement':
                            dhis2Object = {
                                ...dhis2Object,
                                domainType: dhis2Object.domainType || 'AGGREGATE',
                                aggregationType: dhis2Object.aggregationType || 'SUM'
                            };
                            break;
                        case 'Category':
                            dhis2Object = {
                                ...dhis2Object,
                                dataDimensionType: dhis2Object.dataDimensionType || 'DISAGGREGATION'
                            };
                            break;
                        case 'CategoryCombo':
                            dhis2Object = {
                                ...dhis2Object,
                                dataDimensionType: dhis2Object.dataDimensionType || 'DISAGGREGATION'
                            };
                            break;
                    }
                }

                // 2. Use DLHIS2 schema for validation if provided
                const schemaToUse = config.dhis2SchemaName ?
                    (await import('./schemas')).Dhis2Schemas[config.dhis2SchemaName] :
                    config.schema;

                // Defensive check: ensure schema exists
                if (!schemaToUse) {
                    return JSON.stringify({
                        success: false,
                        error: `Schema validation failed: No schema found for ${config.dhis2SchemaName || 'config.schema'}. This may be a configuration issue.`,
                        provided: llmInput,
                        tool: config.name,
                        schemaName: config.dhis2SchemaName
                    });
                }

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
            description: `${config.description}\n\nIMPORTANT: You MUST provide ALL required fields from the schema. The following fields are REQUIRED and cannot be omitted: ${getRequiredFieldsFromSchema(config.schema).join(', ')}. Do not omit any required fields - this will cause API errors.`,
            schema: z.object({
                resource: config.schema
            }).describe(`Create a DHIS2 ${config.metadataType.slice(0, -1)} with ALL required properties specified. Required fields: ${getRequiredFieldsFromSchema(config.schema).join(', ')}`),
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
 * Create a delete tool for DHIS2 resources
 * Allows deleting existing resources by ID
 */
export function createDhis2DeleteTool<T extends z.ZodSchema>(
    config: LLMToolConfig<T>
) {
    return tool(
        async ({
            id,
            resource
        }: {
            id?: string;
            resource?: Record<string, any>;
        }) => {
            try {
                if (!id && !resource?.id) {
                    throw new Error('Must provide either id parameter or include id in resource object');
                }

                const resourceId = id || resource!.id;

                // Prepare the resource data for deletion
                const deleteData = {
                    id: resourceId,
                    ...resource
                };

                // Delete from DHIS2 using the new delete function
                const deleteResult = await deleteDhis2Metadata(
                    config.metadataType,
                    [deleteData]
                );

                return JSON.stringify({
                    success: true,
                    message: `${config.metadataType.slice(0, -1)} deleted successfully`,
                    id: resourceId,
                    apiResponse: deleteResult
                });

            } catch (error) {
                console.error(`Error deleting ${config.name}:`, error);
                return JSON.stringify({
                    success: false,
                    error: `Failed to delete resource: ${error.message}`,
                    id
                });
            }
        },
        {
            name: `delete_dhis2_${config.metadataType.toLowerCase()}`,
            description: `Delete an existing DHIS2 ${config.description.split(' ')[0]} resource`,
            schema: z.object({
                id: z.string().optional().describe("The ID of the resource to delete"),
                resource: config.schema.optional().describe(
                    "Resource object containing the ID to delete"
                ),
            }).describe(`Delete DHIS2 ${config.metadataType.slice(0, -1)} resource`),
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
