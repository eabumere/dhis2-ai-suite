import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import { Dhis2Schemas } from './schemas';

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

// DHIS2 environment variables - configured for build environments
const DHIS2_API_BASE_URL = process.env.DHIS2_API_BASE_URL || 'http://localhost:8080';
const DHIS2_USERNAME = process.env.DHIS2_USERNAME || 'admin';
const DHIS2_PASSWORD = process.env.DHIS2_PASSWORD || 'district';

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
    try {
        const response = await fetch(`${DHIS2_API_BASE_URL}/system/id?limit=1`, {
            method: "GET",
            headers: authHeaders(),
        });

        if (!response.ok) {
            throw new Error(`Failed to generate ID: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.codes?.[0] || `generated_${Date.now()}`;
    } catch (error) {
        console.error('Error generating DHIS2 ID:', error);
        // Fallback to timestamp-based ID
        return `generated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

function authHeaders(): HeadersInit {
    return {
        'Authorization': `Basic ${btoa(`${DHIS2_USERNAME}:${DHIS2_PASSWORD}`)}`,
        'Content-Type': 'application/json',
    };
}

/**
 * Search for existing DHIS2 metadata by name or code
 */
export async function searchDhis2Metadata(
    metadataType: string,
    query: string,
    limit: number = 10
): Promise<Array<{ id: string; name: string; code?: string; displayName: string }>> {
    try {
        const response = await fetch(
            `${DHIS2_API_BASE_URL}/${metadataType}?filter=name:ilike:${encodeURIComponent(query)}&fields=id,name,code,displayName&paging=false`,
            {
                method: "GET",
                headers: authHeaders(),
            }
        );

        if (!response.ok) {
            throw new Error(`DHIS2 API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return (data[metadataType] || []).slice(0, limit);
    } catch (error) {
        console.error('Error searching DHIS2 metadata:', error);
        return [];
    }
}

/**
 * Check if a specific resource exists and get its ID
 */
export async function checkResourceExists(
    metadataType: string,
    name?: string,
    id?: string
): Promise<{ exists: boolean; id?: string; data?: any } | null> {
    try {
        let url: string;
        if (id) {
            url = `${DHIS2_API_BASE_URL}/${metadataType}/${id}?fields=id,name,code,displayName`;
        } else if (name) {
            const exactMatch = await searchDhis2Metadata(metadataType, name, 5);
            const match = exactMatch.find(item =>
                item.name.toLowerCase() === name.toLowerCase() ||
                (item.code && item.code.toLowerCase() === name.toLowerCase())
            );
            if (match) {
                return { exists: true, id: match.id, data: match };
            } else {
                return { exists: false };
            }
        } else {
            return null;
        }

        const response = await fetch(url, {
            method: "GET",
            headers: authHeaders(),
        });

        if (response.ok) {
            const data = await response.json();
            return { exists: true, id: data.id, data };
        } else if (response.status === 404) {
            return { exists: false };
        } else {
            throw new Error(`DHIS2 API error: ${response.status} ${response.statusText}`);
        }
    } catch (error) {
        console.error('Error checking resource existence:', error);
        return null;
    }
}

/**
 * Create DHIS2 metadata using aggregated single payload (for related resources where all IDs are resolvable)
 * Reduces number of API calls by creating multiple related metadata types at once
 * Checks for existence first for each resource
 */
export async function createDhis2MetadataAggregated(
    aggregatedPayload: Record<string, Record<string, any>[]>
): Promise<{ response: any; httpStatus: number; results: Array<{ type: string; id?: string; exists?: boolean; created?: boolean }> }> {
    const results: Array<{ type: string; id?: string; exists?: boolean; created?: boolean }> = [];

    // Process each resource type
    for (const [metadataType, resources] of Object.entries(aggregatedPayload)) {
        for (const resource of resources) {
            // Check if resource already exists
            const existsCheck = await checkResourceExists(metadataType, resource.name, resource.id);
            if (existsCheck?.exists) {
                console.log(`✅ Resource already exists: ${metadataType} '${resource.name}' with ID: ${existsCheck.id}`);
                results.push({ type: metadataType, id: existsCheck.id, exists: true, created: false });
                // Skip this resource but continue with others
                continue;
            }

            // Mark as will be created
            results.push({ type: metadataType, id: resource.id, exists: false, created: true });
        }
    }

    // Filter the payload to only include resources that don't exist
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

    const response = await fetch(`${DHIS2_API_BASE_URL}/metadata?importStrategy=CREATE_UPDATE`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(filteredPayload)
    });

    const data = await response.json();

    if (!response.ok) {
        console.error('Aggregated metadata creation failed:', {
            status: response.status,
            statusText: response.statusText,
            data
        });
        throw new Error(`Aggregated metadata API error: ${response.status} ${response.statusText} - ${JSON.stringify(data)}`);
    }

    console.log('Aggregated metadata creation success:', data);
    return {
        response: data,
        httpStatus: response.status,
        results
    };
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
    if (Array.isArray(payload)) {
        throw new Error('createDhis2MetadataDirect only supports single objects, not arrays');
    }

    // Check if resource already exists
    const existsCheck = await checkResourceExists(metadataType, payload.name, payload.id);
    if (existsCheck?.exists) {
        console.log(`✅ Resource already exists: ${metadataType} '${payload.name}' with ID: ${existsCheck.id}`);
        return {
            response: existsCheck.data,
            httpStatus: 200, // Pretend it's a successful creation
            uid: existsCheck.id,
            exists: true
        };
    }

    const metadataPayload = { [metadataType]: [payload] };

    console.log('Creating metadata directly:', JSON.stringify(metadataPayload, null, 2));

    const response = await fetch(`${DHIS2_API_BASE_URL}/metadata?importStrategy=CREATE_UPDATE`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(metadataPayload)
    });

    const data = await response.json();

    if (!response.ok) {
        // If 409 conflict (resource exists), try to get the existing ID
        if (response.status === 409) {
            console.log('Resource conflicts (409), checking if it actually exists:');
            const existsAfterConflict = await checkResourceExists(metadataType, payload.name, payload.id);
            if (existsAfterConflict?.exists) {
                console.log(`✅ Resource existed after 409: ${metadataType} '${payload.name}' with ID: ${existsAfterConflict.id}`);
                return {
                    response: existsAfterConflict.data,
                    httpStatus: 200,
                    uid: existsAfterConflict.id,
                    exists: true
                };
            }
        }

        console.error('Metadata creation failed:', {
            status: response.status,
            statusText: response.statusText,
            data
        });
        throw new Error(`Metadata API error: ${response.status} ${response.statusText} - ${JSON.stringify(data)}`);
    }

    console.log('Metadata creation success:', data);
    return {
        response: data,
        httpStatus: response.status,
        uid: payload.id, // Return the ID that was used
        exists: false
    };
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
 */
export const DEPENDENCY_ORDER = [
    'indicatorTypes',
    'categoryOptions',
    'categories',
    'categoryCombos',
    'categoryOptionCombos',
    'optionSets',
    'dataElements',
    'organisationUnits',
    'trackedEntityTypes',
    'trackedEntityAttributes',
    'programStages',
    'programs',
    'indicators',
    'validationRules'
];

/**
 * Resolve dependencies for a resource
 * Creates dependencies in sequential order to respect dependency chains
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

    for (const dep of orderedDeps) {
        // Search for existing resource
        const existing = await searchDhis2Metadata(dep.type, dep.name, 1);

        if (existing.length > 0) {
            resolved[dep.name] = { id: existing[0].id, name: existing[0].name };
        } else if (dep.createIfNotFound && dep.createParams) {
            // CRITICAL STEP: Recursively resolve THIS DEPENDENCY'S nested dependencies first
            // This ensures CategoryCombos resolve their Category dependencies,
            // and Categories resolve their CategoryOption dependencies
            const nestedDeps = TOOL_DEFAULT_DEPENDENCIES[dep.type] || [];
            if (nestedDeps.length > 0) {
                console.log(`🔄 Resolving nested dependencies for ${dep.type} '${dep.name}' - needs: ${nestedDeps.map(nd => nd.type).join(', ')}`);
                await resolveDependencies(schema, nestedDeps.map(nd => ({
                    ...nd,
                    name: `${dep.name}-${nd.name}` // Make nested dep names unique
                })));
            }

            // Create the dependency if it doesn't exist
            const id = await generateDhis2Id();
            const newResource = {
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
                console.log(`⚠ Fallback validated ${dep.type} '${dep.name}'`);
            }

            if (!validation.success) {
                throw new Error(`❌ Failed to create dependency ${dep.name}: Validation failed - ${validation.errors?.join(', ') || 'Unknown validation error'}`);
            }

            try {
                // Use direct creation to avoid batch issues with sequential dependencies
                await createDhis2MetadataDirect(dep.type, validation.data);
                resolved[dep.name] = { id, name: dep.createParams.name };
                console.log(`✅ Created ${dep.type} '${dep.name}'`);
            } catch (error) {
                console.error(`❌ Failed to create dependency ${dep.name}:`, error);
                throw new Error(`Failed to create dependency ${dep.name}: ${error.message}`);
            }
        } else {
            throw new Error(`Dependency not found: ${dep.name} (${dep.type})`);
        }
    }

    return resolved;
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
