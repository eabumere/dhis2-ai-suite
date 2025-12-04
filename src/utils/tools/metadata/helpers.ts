import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import { Dhis2Schemas } from './schemas';

// Import app-runtime functions instead of fetch-based ones
import {
    generateDhis2Id as generateDhis2IdAppRuntime,
    searchDhis2Metadata as searchDhis2MetadataAppRuntime,
    checkResourceExists as checkResourceExistsAppRuntime,
    createDhis2MetadataAggregated as createDhis2MetadataAggregatedAppRuntime,
    createDhis2MetadataDirect as createDhis2MetadataDirectAppRuntime,
} from '../../app-runtime/dhis2-api';

/**
 * Resolve conversational references to resource IDs
 */
export const resolveResourceReference = tool(
  async ({ reference }: { reference: string }) => {
    const resolved = resolveReference(reference);
    if (resolved && resolved.id) {
      return JSON.stringify({
        success: true,
        id: resolved.id,
        name: resolved.name,
        type: resolved.type,
        reference: reference
      });
    } else {
      return JSON.stringify({
        success: false,
        error: `Could not resolve reference: ${reference}`,
        availableReferences: Object.keys(getContextInfo().availableReferences)
      });
    }
  },
  {
    name: "resolve_resource_reference",
    description: "Resolve conversational references like 'the last created data element' to actual resource IDs. Use this when users reference previously created resources.",
    schema: z.object({
      reference: z.string().describe("Conversational reference to resolve (e.g., 'the last created data element', 'that category I made')")
    }),
  }
);

/**
 * Reference Resolution for Conversational Context
 * Helps resolve references like "the last created data element"
 */
export interface ContextReference {
    type: 'last' | 'previous' | 'recent' | 'mentioned';
    resourceType: string;
    operation: 'created' | 'updated' | 'accessed';
    pattern: RegExp;
}

/**
 * Common conversational reference patterns
 */
export const REFERENCE_PATTERNS: ContextReference[] = [
    {
        type: 'last',
        resourceType: 'dataElements',
        operation: 'created',
        pattern: /(?:the\s+)?last\s+(?:created\s+)?data\s+element/i
    },
    {
        type: 'last',
        resourceType: 'organisationUnits',
        operation: 'created',
        pattern: /(?:the\s+)?last\s+(?:created\s+)?(?:org(?:anisation)?\s+unit|facility)/i
    },
    {
        type: 'last',
        resourceType: 'categories',
        operation: 'created',
        pattern: /(?:the\s+)?last\s+(?:created\s+)?categor/i
    },
    {
        type: 'previous',
        resourceType: '',
        operation: 'created',
        pattern: /(?:the\s+)?previous\s+(?:one|resource|item)/i
    },
    {
        type: 'mentioned',
        resourceType: '',
        operation: 'accessed',
        pattern: /(?:that|the)\s+(?:\w+\s+)?i\s+(?:mentioned|talked\s+about)/i
    }
];

/**
 * Parse context references from natural language
 */
export function parseContextReference(text: string): ContextReference | null {
    for (const ref of REFERENCE_PATTERNS) {
        if (ref.pattern.test(text)) {
            return ref;
        }
    }
    return null;
}

/**
 * Generate example context references for the LLM
 */
export function getContextReferenceExamples(): string[] {
    return [
        'the last created data element',
        'that category I just made',
        'the previous organization unit',
        'the data element we mentioned earlier',
        'change the name of the last created resource'
    ];
}

// DHIS2 authentication now handled by app-runtime - no more manual environment variables needed

/**
 * Simulate conversation context for reference resolution
 * In a real implementation, this would be stored in session state
 */
let conversationContext = {
  createdResources: [] as Array<{ id: string; type: string; name: string; operation: string; timestamp: number }>,
  lastByType: {} as Record<string, { id: string; name: string }>,
  references: {} as Record<string, { id: string; name: string }>
};

/**
 * Add a resource to the conversation context
 */
export function addResourceToContext(id: string, type: string, name: string, operation: 'created' | 'updated' = 'created') {
  const resource = { id, type, name, operation, timestamp: Date.now() };
  conversationContext.createdResources.unshift(resource); // Most recent first
  conversationContext.lastByType[type] = { id, name };
}

/**
 * Resolve a conversational reference to a resource ID
 */
export function resolveReference(reference: string): { id?: string; name?: string; type?: string } | null {
  const ref = parseContextReference(reference);
  if (!ref) return null;

  // Handle different reference types
  switch (ref.type) {
    case 'last':
      return conversationContext.lastByType[ref.resourceType];
    case 'previous':
      if (reference.toLowerCase().includes('one') || reference.toLowerCase().includes('resource')) {
        // Find the most recently accessed resource
        return conversationContext.createdResources[0];
      }
      // Type-specific previous
      const typeResources = conversationContext.createdResources.filter(r => r.type === ref.resourceType);
      return typeResources.length >= 2 ? typeResources[1] : null;
    case 'mentioned':
      // Return the most recently accessed resource
      return conversationContext.createdResources[0];
    default:
      return null;
  }
}

/**
 * Get context information for the LLM
 */
export function getContextInfo(): {
  lastCreatedResources: Array<{ type: string; name: string }>;
  referenceExamples: string[];
  availableReferences: Record<string, string>;
} {
  const lastCreatedResources = Object.entries(conversationContext.lastByType).map(([type, resource]) => ({
    type,
    name: resource.name
  }));

  const availableReferences = Object.entries(conversationContext.lastByType).reduce((acc, [type, resource]) => {
    acc[`last ${type.slice(0, -1)}`] = resource.name; // Remove 's' from plural
    return acc;
  }, {} as Record<string, string>);

  return {
    lastCreatedResources,
    referenceExamples: getContextReferenceExamples(),
    availableReferences
  };
}

/**
 * Generate a unique ID from DHIS2 API
 */
export async function generateDhis2Id(): Promise<string> {
    return await generateDhis2IdAppRuntime();
}



/**
 * Interface for external search API response
 */
interface ExternalSearchResult {
    content: string;
    metadata: {
        item_id: string;
        name: string;
        type: string;
    };
}

/**
 * Interface for external search API response format
 */
interface ExternalSearchApiResponse extends Array<ExternalSearchResult> {}

/**
 * Call external search API with query and limit
 */
export async function callExternalSearchApi(
    query: string,
    targetType: string,
    limit: number
): Promise<ExternalSearchApiResponse | null> {
    const externalUrl = (import.meta as any).env.EXTERNAL_SEARCH_URL;
    const apiKey = (import.meta as any).env.EXTERNAL_SEARCH_API_KEY;
    const timeout = parseInt((import.meta as any).env.EXTERNAL_SEARCH_TIMEOUT) || 5000;

    // Check if external search is configured
    if (!externalUrl) {
        return null;
    }

    try {
        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(externalUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(apiKey && { 'Authorization': `Bearer ${apiKey}` })
            },
            body: JSON.stringify({
                query: query,
                limit: limit
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            console.warn(`External search API returned ${response.status}: ${response.statusText}`);
            return null;
        }

        const results: ExternalSearchApiResponse = await response.json();

        // Validate response structure
        if (!Array.isArray(results)) {
            console.warn('External search API returned invalid response format (not an array)');
            return null;
        }

        return results;

    } catch (error) {
        if (error.name === 'AbortError') {
            console.warn('External search API call timed out, falling back to DHIS2');
        } else {
            console.warn('External search API call failed:', error.message);
        }
        return null;
    }
}

/**
 * Filter external search results by target metadata type
 */
export function filterExternalResultsByType(
    results: ExternalSearchApiResponse,
    targetType: string
): ExternalSearchApiResponse {
    return results.filter(result =>
        result.metadata?.type === targetType ||
        result.metadata?.type?.toLowerCase() === targetType.toLowerCase() ||
        // Handle plural forms (dataElements vs dataElement, etc.)
        result.metadata?.type?.toLowerCase() === targetType.slice(0, -1).toLowerCase() ||
        result.metadata?.type?.slice(0, -1).toLowerCase() === targetType.toLowerCase()
    );
}

/**
 * Transform external search results to match DHIS2 metadata format
 */
export function transformExternalResults(
    results: ExternalSearchApiResponse
): Array<{ id: string; name: string; code?: string; displayName: string }> {
    return results.map(result => ({
        id: result.metadata.item_id,
        name: result.metadata.name,
        code: result.metadata.name, // Use name as code since external API might not provide separate codes
        displayName: result.content || result.metadata.name // Use content as display name if available, fallback to name
    }));
}

/**
 * Search for existing DHIS2 metadata by name or code
 * Now includes external search API call with fallback to DHIS2 native search
 */
export async function searchDhis2Metadata(
    metadataType: string,
    query: string,
    limit: number = 10
): Promise<Array<{ id: string; name: string; code?: string; displayName: string }>> {

    // STEP 1: Try external search API first (if configured)
    try {
        const externalResults = await callExternalSearchApi(query, metadataType, limit);

        if (externalResults && externalResults.length > 0) {
            // Filter results by the requested metadata type
            const filteredResults = filterExternalResultsByType(externalResults, metadataType);

            if (filteredResults.length > 0) {
                console.log(`✅ External search found ${filteredResults.length} results for type '${metadataType}'`);
                return transformExternalResults(filteredResults.slice(0, limit));
            }

            console.log(`⚠️ External search found results but none matched type '${metadataType}'`);
        } else {
            console.log('No external search results, falling back to DHIS2 API');
        }
    } catch (externalError) {
        console.warn('External search failed, falling back to DHIS2 API:', externalError.message);
    }

    // STEP 2: Fall back to DHIS2 native search
    console.log(`🔄 Using DHIS2 native search for ${metadataType}`);
    return await searchDhis2MetadataAppRuntime(metadataType, query, limit);
}

/**
 * Check if a specific resource exists and get its ID
 * For data elements, also checks by code field
 */
export async function checkResourceExists(
    metadataType: string,
    name?: string,
    id?: string,
    code?: string
): Promise<{ exists: boolean; id?: string; data?: any } | null> {
    return await checkResourceExistsAppRuntime(metadataType, name, id, code);
}

/**
 * Create DHIS2 metadata using aggregated single payload (for related resources where all IDs are resolvable)
 * Reduces number of API calls by creating multiple related metadata types at once
 * Checks for existence first for each resource
 */
export async function createDhis2MetadataAggregated(
    aggregatedPayload: Record<string, Record<string, any>[]>
): Promise<{ response: any; httpStatus: number; results: Array<{ type: string; id?: string; exists?: boolean; created?: boolean }> }> {
    return await createDhis2MetadataAggregatedAppRuntime(aggregatedPayload);
}

/**
 * Create DHIS2 metadata directly via single API calls (bypasses batch manager)
 * Use for sequential dependency creation where order matters
 * Checks for existence first, and returns existing ID if resource already exists (409 status)
 */
export async function createDhis2MetadataDirect(
    metadataType: string,
    payload: Record<string, any>
): Promise<{ response: any; httpStatus: number; uid?: string; exists?: boolean }> {
    return await createDhis2MetadataDirectAppRuntime(metadataType, payload);
}

/**
 * Create DHIS2 metadata using unified batch API (for multiple resources at once)
 */
export async function createDhis2Metadata(
    metadataType: string,
    payload: Record<string, any> | Record<string, any>[]
): Promise<any> {
    const { batchCreateMetadata } = await import('./batch-manager');

    const items = Array.isArray(payload)
        ? payload.map(data => ({ type: metadataType, data }))
        : [{ type: metadataType, data: payload }];

    const result = await batchCreateMetadata(items, {
        importStrategy: 'CREATE_UPDATE',
        atomic: false // Allow partial success for backward compatibility
    });

    if (!result.success) {
        throw new Error(`Failed to create metadata: ${result.errors?.join(', ')}`);
    }

    return result.apiResponse;
}

/**
 * Update DHIS2 metadata using unified batch API (for multiple resources at once)
 */
export async function updateDhis2Metadata(
    metadataType: string,
    payload: Record<string, any> | Record<string, any>[]
): Promise<any> {
    const { batchUpdateMetadata } = await import('./batch-manager');

    const items = Array.isArray(payload)
        ? payload.map(data => ({ type: metadataType, id: data.id, data }))
        : [{ type: metadataType, id: payload.id, data: payload }];

    const result = await batchUpdateMetadata(items, {
        importStrategy: 'UPDATE',
        atomic: false // Allow partial success for backward compatibility
    });

    if (!result.success) {
        throw new Error(`Failed to update metadata: ${result.errors?.join(', ')}`);
    }

    return result.apiResponse;
}

/**
 * Registry of default dependencies for each metadata type
 * This enables recursive dependency resolution
 */
export const TOOL_DEFAULT_DEPENDENCIES: Record<string, Array<{
    type: string;
    name: string;
    createIfNotFound?: boolean;
    createParams?: Record<string, any>;
}>> = {
    'dataElements': [
        {
            type: "categoryCombos",
            name: "default",
            createIfNotFound: true,
            createParams: {
                name: "Default",
                displayName: "Default",
                shortName: "Default",
                dataDimensionType: "DISAGGREGATION",
                categories: []
            }
        }
    ],
    'categories': [
        {
            type: "categoryOptions",
            name: "default",
            createIfNotFound: true,
            createParams: {
                name: "Default",
                displayName: "Default",
                shortName: "Default",
                code: "DEFAULT"
            }
        }
    ],
    'categoryCombos': [
        {
            type: "categories",
            name: "default",
            createIfNotFound: true,
            createParams: {
                name: "Default Category",
                displayName: "Default Category",
                shortName: "Default Cat",
                dataDimension: true,
                dataDimensionType: 'DISAGGREGATION',
                categoryOptions: []
            }
        }
    ],
    'dataSets': [
        {
            type: "categoryCombos",
            name: "default",
            createIfNotFound: true,
            createParams: {
                name: "Default",
                displayName: "Default",
                shortName: "Default",
                dataDimensionType: "DISAGGREGATION",
                categories: []
            }
        }
    ],
    'indicators': [
        {
            type: "indicatorTypes",
            name: "default",
            createIfNotFound: true,
            createParams: {
                name: "Default",
                displayName: "Default",
                factor: 1,
                number: false
            }
        }
    ],
};

/**
 * Dependency creation order (from most fundamental to complex)
 * This ensures dependencies are created in the correct sequence
 * Based on DHIS2 schema analysis and resource relationships
 */
export const DEPENDENCY_ORDER = [
    // User management (no dependencies)
    'userRoles',
    'userCredentials',
    'users',

    // Organisation units and groups
    'organisationUnits',
    'organisationUnitGroups',
    'organisationUnitGroupSets',

    // Core metadata types
    'indicatorTypes',
    'categoryOptions',
    'categories',
    'categoryCombos',
    'categoryOptionCombos',
    'optionSets',
    'dataElements',

    // Data sets and forms
    'dataSets',
    'dataEntryForms',

    // Tracker program components
    'trackedEntityTypes',
    'trackedEntityAttributes',
    'programStages',
    'programs',
    'programIndicators',
    'programRules',
    'programRuleVariables',

    // Indicators and validation
    'indicators',
    'validationRules',

    // Analytics and reporting
    'visualizations',
    'maps',
    'charts',
    'reportTables',
    'reports',
    'dashboards',

    // Additional metadata types
    'relationshipTypes',
    'periods',
    'analyticsQueries'
];

/**
 * Resolve dependencies for a resource
 * Creates dependencies in aggregated batches to minimize API calls
 */
export async function resolveDependencies<T extends z.ZodSchema>(
    schema: T,
    dependencies: Array<{
        type: string;
        name: string;
        createIfNotFound?: boolean;
        createParams?: Record<string, any>;
    }>
): Promise<Record<string, { id: string; name: string }>> {
    const resolved: Record<string, { id: string; name: string }> = {};

    // Group dependencies by their type's creation order
    const orderedDeps = dependencies.sort((a, b) => {
        const orderA = DEPENDENCY_ORDER.indexOf(a.type);
        const orderB = DEPENDENCY_ORDER.indexOf(b.type);
        return (orderA === -1 ? 999 : orderA) - (orderB === -1 ? 999 : orderB);
    });

    // Collect all resources that need to be created in batches
    const resourcesToCreate: Record<string, Array<{ name: string; data: any; dep: any }>> = {};

    for (const dep of orderedDeps) {
        // Check if resource exists using comprehensive existence check
        const existing = await checkResourceExists(dep.type, dep.name);

        if (existing && existing.exists && existing.id) {
            resolved[dep.name] = { id: existing.id, name: dep.name };
        } else if (dep.createIfNotFound && dep.createParams) {
            // CRITICAL STEP: Recursively resolve THIS DEPENDENCY'S nested dependencies first
            // This applies to EVERY resource type - not just categories/categoryCombos
            // The recursive resolution works by detecting reference fields in createParams and resolving them
            const nestedDeps = TOOL_DEFAULT_DEPENDENCIES[dep.type] || [];
            const referenceFields = getReferenceFields(dep.type, dep.createParams);

            // Collect all dependencies to resolve (both predefined and dynamically detected)
            const allNestedDeps: Array<{
                type: string;
                name: string;
                createIfNotFound?: boolean;
                createParams?: Record<string, any>;
            }> = [...nestedDeps];

            // Add dynamically detected reference dependencies
            for (const [fieldName, references] of Object.entries(referenceFields)) {
                if (Array.isArray(references)) {
                    for (const ref of references) {
                        if (typeof ref === 'object' && 'name' in ref) {
                            // This is an object reference with a name to resolve
                            const refType = getReferenceType(dep.type, fieldName);
                            if (refType) {
                                allNestedDeps.push({
                                    type: refType,
                                    name: ref.name,
                                    createIfNotFound: true,
                                    createParams: ref.createParams || getDefaultCreateParamsForReference(refType, ref.name)
                                });
                            }
                        }
                    }
                } else if (typeof references === 'object' && 'name' in references) {
                    // Single object reference
                    const refType = getReferenceType(dep.type, fieldName);
                    if (refType) {
                        allNestedDeps.push({
                            type: refType,
                            name: references.name,
                            createIfNotFound: true,
                            createParams: references.createParams || getDefaultCreateParamsForReference(refType, references.name)
                        });
                    }
                }
            }

            if (allNestedDeps.length > 0) {
                const dedupedDeps = allNestedDeps.filter((item, index, arr) =>
                    arr.findIndex(d => d.type === item.type && d.name === item.name) === index
                );

                console.log(`🔄 Resolving nested dependencies for ${dep.type} '${dep.name}' - needs: ${dedupedDeps.map(nd => `${nd.type}:${nd.name}`).join(', ')}`);

                const nestedResolved = await resolveDependencies(schema, dedupedDeps.map(nd => ({
                    ...nd,
                    name: `${dep.name}-${nd.name}` // Make nested dep names unique
                })));

                // Link the resolved nested dependencies to the parent resource
                for (const [nestedName, nestedResource] of Object.entries(nestedResolved)) {
                    const depInfo = dedupedDeps.find(nd => nd.name === nestedName?.split('-').pop());
                    if (depInfo) {
                        const parentDependencyField = await getParentDependencyField(dep.type, depInfo.type);
                        if (parentDependencyField) {
                            // Handle both single references and array references
                            const currentValue = dep.createParams[parentDependencyField];
                            if (Array.isArray(currentValue)) {
                                dep.createParams[parentDependencyField] = [...currentValue, { id: nestedResource.id }];
                            } else {
                                dep.createParams[parentDependencyField] = { id: nestedResource.id };
                            }
                        }
                    }
                }
            }

            // Prepare the resource for batch creation
            const id = await generateDhis2Id();
            let newResource = {
                id,
                ...dep.createParams,
            };

            // Validate against the correct schema for this dependency type
            const depSchema = METADATA_TYPE_SCHEMAS[dep.type];
            let validation: { success: boolean; data?: any; errors?: string[] };

            if (depSchema) {
                // Use the specific schema for this dependency type
                validation = validateResourceData(depSchema, newResource);
                console.log(`✓ Validated ${dep.type} '${dep.name}' against schema`);
            } else {
                // Fallback to validating against the provided schema (less accurate but better than nothing)
                validation = validateResourceData(schema, newResource);
                console.log(`⚠ Fallback validated ${dep.type} '${dep.name}' - using fallback schema`);
            }

            if (!validation.success) {
                console.error(`❌ Validation failed for ${dep.type} '${dep.name}':`, validation.errors);
                // Don't throw immediately - try to create with minimal valid object and warn
                const minimalValidObject = await createMinimalValidObject(dep.type, newResource);
                if (minimalValidObject) {
                    console.log(`⚠ Using minimal valid object for ${dep.type} '${dep.name}'`);
                    newResource = minimalValidObject;
                    validation = validateResourceData(depSchema || schema, newResource);
                    if (!validation.success) {
                        throw new Error(`❌ Failed to create dependency ${dep.name}: Even minimal validation failed - ${validation.errors?.join(', ') || 'Unknown validation error'}`);
                    }
                } else {
                    throw new Error(`❌ Failed to create dependency ${dep.name}: Validation failed - ${validation.errors?.join(', ') || 'Unknown validation error'}`);
                }
            }

            // Collect for batch creation instead of creating immediately
            if (!resourcesToCreate[dep.type]) {
                resourcesToCreate[dep.type] = [];
            }
            resourcesToCreate[dep.type].push({
                name: dep.name,
                data: validation.data,
                dep: dep
            });

            // Store the resolved reference (will be updated with actual ID after batch creation)
            resolved[dep.name] = { id, name: dep.createParams.name };
        } else {
            throw new Error(`Dependency not found: ${dep.name} (${dep.type})`);
        }
    }

    // Create all collected resources in aggregated batches
    if (Object.keys(resourcesToCreate).length > 0) {
        console.log(`📦 Creating dependencies in aggregated batches: ${Object.entries(resourcesToCreate).map(([type, resources]) => `${resources.length} ${type}`).join(', ')}`);

        // Convert to aggregated payload format
        const aggregatedPayload: Record<string, any[]> = {};
        for (const [resourceType, resources] of Object.entries(resourcesToCreate)) {
            aggregatedPayload[resourceType] = resources.map(r => r.data);
        }

        try {
            const batchResult = await createDhis2MetadataAggregated(aggregatedPayload);

            if (batchResult.httpStatus < 200 || batchResult.httpStatus >= 300) {
                throw new Error(`Batch creation failed: HTTP ${batchResult.httpStatus}`);
            }

            // Update resolved references with actual results
            let resourceIndex = 0;
            for (const [resourceType, resources] of Object.entries(resourcesToCreate)) {
                const typeResults = batchResult.results.filter(r => r.type === resourceType);

                for (let i = 0; i < resources.length; i++) {
                    const resource = resources[i];
                    const result = typeResults[i];

                    if (result && result.created && result.id) {
                        // Update the resolved reference with the actual created ID
                        resolved[resource.name] = { id: result.id, name: resource.dep.createParams.name };
                        console.log(`✅ Created ${resourceType} '${resource.name}' with ID: ${result.id}`);
                    } else {
                        console.warn(`⚠ Could not confirm creation of ${resourceType} '${resource.name}'`);
                    }
                }
            }

            console.log(`📦 Successfully created ${batchResult.results.filter(r => r.created).length} dependencies in 1 API call`);
        } catch (error) {
            console.error('❌ Batch dependency creation failed:', error);
            throw new Error(`Failed to create dependencies in batch: ${error.message}`);
        }
    }

    return resolved;
}

/**
 * Build comprehensive parent-child dependency mapping from schemas
 */
async function buildSchemaReferenceMapping(): Promise<Record<string, Record<string, string>>> {
    const mapping: Record<string, Record<string, string>> = {};
    const schemas = (await import('./schemas')).Dhis2Schemas;

    // Resource type name mappings (plural vs singular)
    const pluralToSingular: Record<string, string> = {
        'categories': 'category',
        'categoryOptions': 'categoryOption',
        'organisationUnits': 'organisationUnit',
        'programStages': 'programStage',
        'programIndicators': 'programIndicator',
        'trackedEntityAttributes': 'trackedEntityAttribute',
        'trackedEntityTypeAttributes': 'trackedEntityTypeAttribute',
        'programRuleActions': 'programRuleAction',
        'programRuleVariables': 'programRuleVariable',
        'dataSetElements': 'dataSetElement',
        'programStageDataElements': 'programStageDataElement',
        'programStageSections': 'programStageSection',
        'dataElementOperands': 'dataElementOperand',
        'sections': 'section',
        'dashboardItems': 'dashboardItem',
        'dataDimensionItems': 'dataDimensionItem',
        'columns': 'dimensionItem',
        'rows': 'dimensionItem',
        'filters': 'dimensionItem',
        'mapViews': 'mapView',
        'organisationUnitGroups': 'organisationUnitGroup',
        'validationResults': 'validationResult',
        'dataValues': 'dataValue',
        'notes': 'note',
        'relationships': 'relationship',
        'enrollments': 'enrollment',
        'events': 'event',
        'options': 'option',
        'userCredentials': 'userCredentials',
        'userRoles': 'userRole',
        'userAccesses': 'userAccess',
        'userGroupAccesses': 'userGroupAccess',
        'periods': 'period'
    };

    for (const [schemaName, schema] of Object.entries(schemas)) {
        try {
            // Convert schema name to resource type (e.g., "DataElement" -> "dataElements")
            const resourceType = schemaName.charAt(0).toLowerCase() +
                               schemaName.slice(1).replace(/Schema$/, '') + 's';
            const correctedResourceType = resourceType.replace(/ss$/, 's'); // Fix double 's'

            // Analyze the schema's shape to find reference fields
            const referenceFields = analyzeSchemaForReferences(schema);
            if (referenceFields.length > 0) {
                mapping[correctedResourceType] = {};
                for (const [fieldName, refInfo] of referenceFields) {
                    mapping[correctedResourceType][refInfo.type] = fieldName;
                }
            }
        } catch (error) {
            console.warn(`Failed to analyze schema ${schemaName}:`, error);
        }
    }

    return mapping;
}

/**
 * Analyze a Zod schema to find reference fields and their target types
 */
function analyzeSchemaForReferences(schema: any): Array<[string, { type: string; isArray: boolean }]> {
    const references: Array<[string, { type: string; isArray: boolean }]> = [];

    try {
        // Access the schema's shape if available (Zod object schemas have _def.shape)
        const shape = schema._def?.shape;
        if (!shape) return references;

        for (const [fieldName, fieldSchema] of Object.entries(shape)) {
            const ref = analyzeFieldForReference(fieldName, fieldSchema);
            if (ref) {
                references.push([fieldName, ref]);
            }
        }
    } catch (error) {
        // Schema analysis failed, return empty array
    }

    return references;
}

/**
 * Analyze a single field schema to determine if it contains references
 */
function analyzeFieldForReference(fieldName: string, fieldSchema: any): { type: string; isArray: boolean } | null {
    try {
        // Check if it's an array schema
        if (fieldSchema._def?.typeName === 'ZodArray') {
            const elementSchema = fieldSchema._def.element;
            const elementRef = analyzeObjectFieldForReference(elementSchema);
            if (elementRef) {
                return { type: elementRef.type, isArray: true };
            }
        }

        // Check if it's a direct object schema with references
        const directRef = analyzeObjectFieldForReference(fieldSchema);
        if (directRef) {
            return { type: directRef.type, isArray: false };
        }

        // Check for optional schemas
        if (fieldSchema._def?.typeName === 'ZodOptional' ||
            fieldSchema._def?.typeName === 'ZodNullable') {
            return analyzeFieldForReference(fieldName, fieldSchema._def.innerType);
        }

        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Analyze an object field to find if it has an id field (indicating a reference)
 */
function analyzeObjectFieldForReference(fieldSchema: any): { type: string } | null {
    try {
        if (fieldSchema._def?.typeName === 'ZodObject') {
            const shape = fieldSchema._def.shape;

            // Look for an 'id' field which indicates a DHIS2 resource reference
            if (shape && 'id' in shape) {
                // Try to infer the type from the field name
                const fieldName = Object.keys(shape).find(key => key === 'id');
                if (fieldName) {
                    // Map common field patterns to resource types
                    const fieldToTypeMapping: Record<string, string> = {
                        'categoryCombo': 'categoryCombos',
                        'categoryOption': 'categoryOptions',
                        'category': 'categories',
                        'organisationUnit': 'organisationUnits',
                        'programStage': 'programStages',
                        'trackedEntityType': 'trackedEntityTypes',
                        'trackedEntityAttribute': 'trackedEntityAttributes',
                        'dataElement': 'dataElements',
                        'indicatorType': 'indicatorTypes',
                        'optionSet': 'optionSets',
                        'program': 'programs',
                        'indicator': 'indicators',
                        'user': 'users',
                        'relationshipType': 'relationshipTypes',
                        'relationship': 'relationships',
                        'enrollment': 'enrollments',
                        'event': 'events'
                    };

                    // Try field-specific mapping first
                    for (const [pattern, type] of Object.entries(fieldToTypeMapping)) {
                        if (pattern + 'Id' in shape || pattern + '_id' in shape) {
                            return { type };
                        }
                    }

                    // Fallback: singular to plural conversion
                    let inferredType = fieldName.replace(/Id$/, '');
                    if (!inferredType.endsWith('s')) {
                        inferredType += 's'; // Simple pluralization
                    }

                    return { type: inferredType };
                }
            }
        }

        // Check for union types that might include objects
        if (fieldSchema._def?.typeName === 'ZodUnion') {
            const options = fieldSchema._def.options || [];
            for (const option of options) {
                const ref = analyzeObjectFieldForReference(option);
                if (ref) return ref;
            }
        }

        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Get the field name that links parent resources to child dependencies
 * Uses the actual schema definitions to build comprehensive mappings
 */
async function getParentDependencyField(parentType: string, childType: string): Promise<string | null> {
    // Build dynamic mapping from schemas
    const schemaMapping = await buildSchemaReferenceMapping();

    // First try the dynamic schema-based mapping
    if (schemaMapping[parentType]?.[childType]) {
        return schemaMapping[parentType][childType];
    }

    // Fallback to hardcoded mappings for complex relationships not easily parsed from schemas
    const fallbackMapping: Record<string, Record<string, string>> = {
        // Complex array relationships that contain multiple reference types
        'dataSets': {
            // dataSetElements array contains both dataElement and categoryCombo references
            'dataElements': 'dataSetElements', // Via dataSetElements[].dataElement
            'categoryCombos': 'dataSetElements'  // Via dataSetElements[].categoryCombo
        },
        'programStages': {
            // programStageDataElements array contains dataElement references
            'dataElements': 'programStageDataElements', // Via programStageDataElements[].dataElement
            'trackedEntityAttributes': 'programStageDataElements' // ProgramStage may also reference attributes indirectly
        },
        'trackedEntityTypes': {
            // trackedEntityTypeAttributes array contains attribute references
            'trackedEntityAttributes': 'trackedEntityTypeAttributes'
        },
        'programRules': {
            // programRuleActions may reference various resources
            'dataElements': 'programRuleActions',
            'trackedEntityAttributes': 'programRuleActions',
            'programStages': 'programRuleActions'
        },
        'dashboards': {
            // dashboardItems may reference visualizations, maps, charts, etc.
            'visualizations': 'dashboardItems',
            'charts': 'dashboardItems',
            'maps': 'dashboardItems',
            'reportTables': 'dashboardItems'
        },
        'visualizations': {
            // dataDimensionItems may reference dataElements, indicators, etc.
            'dataElements': 'dataDimensionItems',
            'indicators': 'dataDimensionItems',
            'dataSets': 'dataDimensionItems'
        }
    };

    return fallbackMapping[parentType]?.[childType] || null;
}

/**
 * Cache for schema reference mapping to avoid rebuilding it multiple times
 */
let schemaReferenceCache: Record<string, Record<string, string>> | null = null;

/**
 * Get cached schema reference mapping
 */
async function getSchemaReferenceMapping(): Promise<Record<string, Record<string, string>>> {
    if (!schemaReferenceCache) {
        schemaReferenceCache = await buildSchemaReferenceMapping();
    }
    return schemaReferenceCache;
}

/**
 * Detect reference fields that need to be resolved from createParams
 */
function getReferenceFields(resourceType: string, createParams: Record<string, any>): Record<string, any> {
    const references: Record<string, any> = {};

    // Common reference field patterns across DHIS2 resource types
    const referenceFieldPatterns = {
        // Object references (single)
        categoryCombo: 'categoryCombos',
        optionSet: 'optionSets',
        indicatorType: 'indicatorTypes',
        trackedEntityType: 'trackedEntityTypes',
        program: 'programs',
        organisationUnit: 'organisationUnits',

        // Array references
        categories: 'categories',
        categoryOptions: 'categoryOptions',
        organisationUnits: 'organisationUnits',
        dataElements: 'dataElements',
        programStages: 'programStages',
        programStageDataElements: 'dataElements',
        programIndicators: 'indicators',
        validationRules: 'validationRules',
        trackedEntityAttributes: 'trackedEntityAttributes'
    };

    for (const [fieldName, fieldValue] of Object.entries(createParams)) {
        if (fieldValue === null || fieldValue === undefined) continue;

        // Check for object references with { name: ... } pattern
        if (typeof fieldValue === 'object' && !Array.isArray(fieldValue) && 'name' in fieldValue) {
            references[fieldName] = fieldValue;
        }
        // Check for array references where items have { name: ... }
        else if (Array.isArray(fieldValue) && fieldValue.length > 0) {
            const namedReferences = fieldValue.filter(item =>
                typeof item === 'object' && item !== null && 'name' in item
            );
            if (namedReferences.length > 0) {
                references[fieldName] = fieldValue; // Keep the whole array but flag for processing
            }
        }
    }

    return references;
}

/**
 * Determine the resource type for a reference field within a parent resource
 */
function getReferenceType(parentType: string, fieldName: string): string | null {
    const referenceTypeMapping: Record<string, Record<string, string>> = {
        // Data element references
        'dataElements': {
            'categoryCombo': 'categoryCombos'
        },
        // Data set references
        'dataSets': {
            'categoryCombo': 'categoryCombos',
            'organisationUnits': 'organisationUnits',
            'dataSetElements': 'dataElements'
        },
        // Category combo references
        'categoryCombos': {
            'categories': 'categories'
        },
        // Category references
        'categories': {
            'categoryOptions': 'categoryOptions'
        },
        // Program references
        'programs': {
            'trackedEntityType': 'trackedEntityTypes',
            'programStages': 'programStages',
            'organisationUnits': 'organisationUnits'
        },
        // Program stage references
        'programStages': {
            'programStageDataElements': 'dataElements',
            'program Indicators': 'indicators'
        },
        // Indicator references
        'indicators': {
            'indicatorType': 'indicatorTypes'
        },
        // Tracked entity type references
        'trackedEntityTypes': {
            'trackedEntityAttributes': 'trackedEntityAttributes'
        },
        // Option set references (can be used by dataElements, attributes, etc.)
        'optionSets': {
            'options': 'options'
        }
    };

    return referenceTypeMapping[parentType]?.[fieldName] || null;
}

/**
 * Generate default creation parameters for a reference
 */
function getDefaultCreateParamsForReference(referenceType: string, name: string): Record<string, any> {
    const defaults: Record<string, Record<string, any>> = {
        'categoryCombos': {
            name,
            displayName: name,
            shortName: name.length > 50 ? name.substring(0, 47) + '...' : name,
            dataDimensionType: 'DISAGGREGATION',
            categories: []
        },
        'categories': {
            name,
            displayName: name,
            shortName: name.length > 50 ? name.substring(0, 47) + '...' : name,
            dataDimension: true,
            dataDimensionType: 'DISAGGREGATION',
            categoryOptions: inferCategoryOptionsFromName(name)
        },
        'categoryOptions': {
            name,
            displayName: name,
            shortName: name.length > 50 ? name.substring(0, 47) + '...' : name,
            code: name.toUpperCase().replace(/[^A-Z0-9_]/g, '_')
        },
        'organisationUnits': {
            name,
            displayName: name,
            shortName: name.length > 50 ? name.substring(0, 47) + '...' : name,
            level: 1,
            path: `/${Date.now()}`,  // Use timestamp for uniqueness (will be replaced if exists)
            openingDate: new Date().toISOString().split('T')[0]
        },
        'indicatorTypes': {
            name,
            displayName: name,
            factor: 1,
            number: false
        },
        'optionSets': {
            name,
            displayName: name,
            valueType: 'TEXT'
        },
        'trackedEntityTypes': {
            name,
            displayName: name,
            shortName: name.length > 50 ? name.substring(0, 47) + '...' : name,
            description: `${name} tracked entity type`
        },
        'trackedEntityAttributes': {
            name,
            displayName: name,
            shortName: name.length > 50 ? name.substring(0, 47) + '...' : name,
            valueType: 'TEXT',
            unique: false,
            mandatory: false
        }
    };

    return defaults[referenceType] || { name };
}

/**
 * Infer appropriate category options based on category name
 */
function inferCategoryOptionsFromName(categoryName: string): Array<{ name: string }> {
    const name = categoryName.toLowerCase();

    // Common health data category patterns
    if (name.includes('satisfaction') || name.includes('satisfied')) {
        return [
            { name: 'Satisfied' },
            { name: 'Not Satisfied' }
        ];
    }

    if (name.includes('gender') || name.includes('sex')) {
        return [
            { name: 'Male' },
            { name: 'Female' }
        ];
    }

    if (name.includes('age') || name.includes('age group')) {
        return [
            { name: '<5 years' },
            { name: '5-14 years' },
            { name: '15-49 years' },
            { name: '50+ years' }
        ];
    }

    if (name.includes('yes') || name.includes('no') || name.includes('boolean')) {
        return [
            { name: 'Yes' },
            { name: 'No' }
        ];
    }

    if (name.includes('positive') || name.includes('negative')) {
        return [
            { name: 'Positive' },
            { name: 'Negative' }
        ];
    }

    if (name.includes('result') || name.includes('outcome')) {
        return [
            { name: 'Positive' },
            { name: 'Negative' },
            { name: 'Inconclusive' }
        ];
    }

    if (name.includes('status')) {
        return [
            { name: 'Active' },
            { name: 'Inactive' }
        ];
    }

    if (name.includes('level') || name.includes('tier')) {
        return [
            { name: 'Low' },
            { name: 'Medium' },
            { name: 'High' }
        ];
    }

    if (name.includes('priority')) {
        return [
            { name: 'Low' },
            { name: 'Medium' },
            { name: 'High' },
            { name: 'Critical' }
        ];
    }

    if (name.includes('quality')) {
        return [
            { name: 'Poor' },
            { name: 'Fair' },
            { name: 'Good' },
            { name: 'Excellent' }
        ];
    }

    // Default fallback for unknown categories
    return [
        { name: 'Option A' },
        { name: 'Option B' }
    ];
}

/**
 * Create a minimal valid object for schema compliance when validation fails
 */
async function createMinimalValidObject(type: string, baseObject: any): Promise<any | null> {
    switch (type) {
        case 'categoryCombos':
            // If we have an empty categories array, we need a valid category
            if (!baseObject.categories || baseObject.categories.length === 0) {
                // Create a minimal category first
                try {
                    const categoryId = await generateDhis2Id();
                    const categoryData = {
                        id: categoryId,
                        name: "Minimal Category",
                        displayName: "Minimal Category",
                        shortName: "Min Cat",
                        dataDimension: true,
                        dataDimensionType: 'DISAGGREGATION',
                        categoryOptions: []
                    };
                    await createDhis2MetadataDirect('categories', categoryData);
                    baseObject.categories = [{ id: categoryId }];
                    console.log(`✓ Created fallback category for category combo with ID: ${categoryId}`);
                } catch (error) {
                    console.error('Failed to create minimal category:', error);
                    return null;
                }
            }
            return {
                ...baseObject,
                categories: baseObject.categories,
                dataDimensionType: baseObject.dataDimensionType || 'DISAGGREGATION'
            };
        case 'categories':
            return {
                ...baseObject,
                categoryOptions: baseObject.categoryOptions || [],
                dataDimension: baseObject.dataDimension ?? true,
                dataDimensionType: baseObject.dataDimensionType || 'DISAGGREGATION'
            };
        default:
            return null;
    }
}

/**
 * Schema mapping for dependency validation
 */
export const METADATA_TYPE_SCHEMAS: Record<string, z.ZodSchema> = {
    'dataElements': Dhis2Schemas.DataElement,
    'organisationUnits': Dhis2Schemas.OrganisationUnit,
    'categories': Dhis2Schemas.Category,
    'categoryCombos': Dhis2Schemas.CategoryCombo,
    'categoryOptions': Dhis2Schemas.CategoryOption,
    'categoryOptionCombos': Dhis2Schemas.CategoryOptionCombo,
    'dataSets': Dhis2Schemas.DataSet,
    'programs': Dhis2Schemas.Program,
    'programStages': Dhis2Schemas.ProgramStage,
    'indicators': Dhis2Schemas.Indicator,
    'indicatorTypes': Dhis2Schemas.IndicatorType,
    'validationRules': Dhis2Schemas.ValidationRule,
    'optionSets': Dhis2Schemas.OptionSet,
    'trackedEntityTypes': Dhis2Schemas.TrackedEntityType,
    'trackedEntityAttributes': Dhis2Schemas.TrackedEntityAttribute,
};

/**
 * Validate resource data against schema
 */
export function validateResourceData<T extends z.ZodSchema>(
    schema: T,
    data: unknown
): { success: true; data: z.infer<T> } | { success: false; errors: string[] } {
    try {
        const validated = schema.parse(data);
        return { success: true, data: validated };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return {
                success: false,
                errors: error.issues.map(err => `${err.path.join('.')}: ${err.message}`)
            };
        }
        return { success: false, errors: [error.message] };
    }
}

/**
 * Generate a short name from a given name (for DHIS2 shortName field)
 */
export function generateShortName(name: string, maxLength: number = 50): string {
    if (!name) return 'Unknown';

    // Trim spaces and limit length
    const trimmed = name.trim();
    if (trimmed.length <= maxLength) {
        return trimmed;
    }

    // Take first part of compound name or truncate with ellipses
    const words = trimmed.split(/\s+/);
    if (words.length > 1) {
        // Try to create a meaningful abbreviation
        const abbreviation = words.map(word => word.charAt(0).toUpperCase()).join('');

        // If abbreviation is short enough and reasonable, use it
        if (abbreviation.length <= maxLength && abbreviation.length >= 2) {
            return abbreviation;
        }
    }

    // Fall back to truncation with ellipses
    return trimmed.substring(0, maxLength - 3) + '...';
}

/**
 * Generate a DHIS2-compliant code from a name (for DHIS2 code field)
 * Codes must be <= 50 characters and contain only uppercase letters, numbers, and underscores
 */
export function generateDhis2Code(name: string): string {
    if (!name?.trim()) return 'DEFAULT';

    // Clean and truncate (47 max to potentially leave room for uniqueness suffixes if needed)
    const cleaned = name.toUpperCase().replace(/[^A-Z0-9]/g, '_');

    // Remove multiple consecutive underscores
    const normalized = cleaned.replace(/_+/g, '_');

    // Remove leading/trailing underscores
    const trimmed = normalized.replace(/^_+|_+$/g, '');

    // Truncate to 47 characters (leaving room for potential uniqueness suffixes)
    return trimmed.length > 47 ? trimmed.substring(0, 47) : trimmed || 'DEFAULT';
}

/**
 * Parse DHIS2 expressions to extract data element references
 * Handles patterns like #{DE_Code} and returns the referenced data elements
 */
export function parseExpressionForDataElements(expression: string): Array<{
    code: string;
    name: string;
    inferredValueType: 'INTEGER' | 'NUMBER' | 'BOOLEAN' | 'TEXT';
}> {
    if (!expression || typeof expression !== 'string') {
        return [];
    }

    const trimmed = expression.trim();

    // Match DHIS2 data element references: #{...}
    const dataElementRefRegex = /#\{([^}]+)\}/g;
    const matches = [];
    let match;

    while ((match = dataElementRefRegex.exec(trimmed)) !== null) {
        const code = match[1].trim();
        if (code) {
            matches.push({
                code,
                name: parseDataElementCodeToName(code),
                inferredValueType: inferValueType(code, trimmed)
            });
        }
    }

    return matches;
}

/**
 * Parse data element codes to generate human-readable names
 * Converts codes like DE_Immunised_U5_all_schedule to "Immunised U5 all schedule"
 */
function parseDataElementCodeToName(code: string): string {
    if (!code) return 'Unnamed Data Element';

    // Remove common prefixes
    let name = code.replace(/^(DE|ID)_/, '');

    // Split on underscores and capitalize each word
    const words = name.split('_').map(word => {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    });

    // Join words with spaces
    name = words.join(' ');

    // Clean up common abbreviations (expand for better readability)
    const abbreviations: Record<string, string> = {
        'U5': 'Under 5',
        'U1': 'Under 1',
        'Immvax': 'Immunization',
        'Tb': 'Tuberculosis',
        'Sti': 'STI',
        'Ovc': 'OVC',
        'Hiv': 'HIV',
        'Art': 'ART',
        'Cd4': 'CD4',
        'Vl': 'Viral Load',
        'Svc': 'Service',
        'Pop': 'Population',
        'Num': 'Number',
        'Tot': 'Total',
        'Cnt': 'Count',
        'Rat': 'Rate',
        'Per': 'Percent',
        'Pro': 'Proportion',
        'Cov': 'Coverage',
        'Sch': 'Schedule',
        'All': 'All',
        'Ful': 'Fully',
        'Com': 'Completed'
    };

    for (const [abbrev, full] of Object.entries(abbreviations)) {
        name = name.replace(new RegExp(`\\b${abbrev}\\b`, 'gi'), full);
    }

    return name;
}

/**
 * Infer value type from data element code and context
 */
function inferValueType(code: string, expression: string): 'INTEGER' | 'NUMBER' | 'BOOLEAN' | 'TEXT' {
    const codeLower = code.toLowerCase();
    const exprLower = expression.toLowerCase();

    // Check if expression suggests count (integer), percentage (number), or yes/no (boolean)
    if (exprLower.includes('count') || exprLower.includes('number of') ||
        codeLower.includes('total') || codeLower.includes('sum')) {
        return 'INTEGER';
    }

    if (exprLower.includes('percent') || exprLower.includes('rate') ||
        codeLower.includes('proportion') || codeLower.includes('coverage')) {
        return 'NUMBER';
    }

    if (codeLower.includes('yesno') || codeLower.includes('positive') ||
        codeLower.includes('negative') || codeLower.includes('confirmed')) {
        return 'BOOLEAN';
    }

    // Default to INTEGER for aggregated data
    return 'INTEGER';
}

/**
 * Generate data element creation parameters from expression parsing
 */
export function generateDataElementFromExpression(code: string, name: string, valueType: string): Record<string, any> {
    return {
        code,
        name,
        displayName: name,
        shortName: name.length > 50 ? name.substring(0, 47) + '...' : name,
        valueType,
        domainType: 'AGGREGATE',
        aggregationType: valueType === 'BOOLEAN' ? 'COUNT' :
                        valueType === 'INTEGER' ? 'COUNT' :
                        valueType === 'NUMBER' ? 'AVERAGE' : 'NONE',
        zeroIsSignificant: true, // Most health data elements need to track zeros
    };
}

/**
 * Parse natural language descriptions to extract resource names and properties
 * Used by LLM-driven tools to interpret user descriptions
 */
export function parseNaturalLanguageDescription(description: string): {
    name: string;
    properties: Record<string, any>;
} {
    if (!description || typeof description !== 'string') {
        return {
            name: 'Unnamed Resource',
            properties: {}
        };
    }

    const trimmed = description.trim();

    // Simple name extraction - take the first meaningful phrase
    // For more complex parsing, this could be enhanced with NLP
    let name = trimmed;

    // Try to extract name from common patterns
    const sentences = trimmed.split(/[.!?]+/).filter(s => s.trim());
    if (sentences.length > 0) {
        name = sentences[0].trim();
    }

    // Remove common prefixes that aren't part of the name
    const prefixPatterns = [
        /^create\s+/i,
        /^make\s+/i,
        /^add\s+/i,
        /^setup\s+/i,
        /^new\s+/i,
        /^a\s+/i,
        /^an\s+/i
    ];

    for (const pattern of prefixPatterns) {
        name = name.replace(pattern, '');
    }

    // Clean up the name
    name = name.trim();

    // If name is too short or too long, use default
    if (name.length < 2 || name.length > 50) {
        name = 'Unnamed Resource';
    }

    // Basic properties extraction (could be enhanced)
    const properties: Record<string, any> = {
        description: trimmed
    };

    return {
        name,
        properties
    };
}
