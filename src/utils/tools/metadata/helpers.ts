import { z } from 'zod';
import { Dhis2Schemas } from './schemas';

/**
 * LLM-powered extraction tools that convert natural language descriptions into structured DHIS2 metadata
 */
import { tool } from '@langchain/core/tools';

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
 * Extract data element information from natural language
 */
export const extractDataElementFromDescription = tool(
  async ({ description }: { description: string }) => {
    // This will be handled by the LLM through tool schemas and prompts
    // The LLM will extract structured data directly
    return description;
  },
  {
    name: "extract_data_element",
    description: "Extract structured data element information from natural language description. Returns complete DataElement schema with name, valueType, domainType, etc.",
    schema: z.object({
      description: z.string().describe("Natural language description of the data element to extract")
    }),
  }
);

/**
 * Extract organization unit information from natural language
 */
export const extractOrganisationUnitFromDescription = tool(
  async ({ description }: { description: string }) => {
    return description;
  },
  {
    name: "extract_organisation_unit",
    description: "Extract structured organization unit information from natural language description. Returns OrganisationUnit schema with name, level, path, etc.",
    schema: z.object({
      description: z.string().describe("Natural language description of the organization unit to extract")
    }),
  }
);

/**
 * Extract category information from natural language
 */
export const extractCategoryFromDescription = tool(
  async ({ description }: { description: string }) => {
    return description;
  },
  {
    name: "extract_category",
    description: "Extract structured category information from natural language description. Returns Category schema with name, dataDimension settings, etc.",
    schema: z.object({
      description: z.string().describe("Natural language description of the category to extract")
    }),
  }
);

/**
 * Extract category combo information from natural language
 */
export const extractCategoryComboFromDescription = tool(
  async ({ description }: { description: string }) => {
    return description;
  },
  {
    name: "extract_category_combo",
    description: "Extract structured category combination information from natural language description. Returns CategoryCombo schema with name, dataDimensionType, categories, etc.",
    schema: z.object({
      description: z.string().describe("Natural language description of the category combination to extract")
    }),
  }
);

/**
 * Extract data set information from natural language
 */
export const extractDataSetFromDescription = tool(
  async ({ description }: { description: string }) => {
    return description;
  },
  {
    name: "extract_data_set",
    description: "Extract structured data set information from natural language description. Returns DataSet schema with name, periodType, data elements, organisation units, etc.",
    schema: z.object({
      description: z.string().describe("Natural language description of the data set to extract")
    }),
  }
);

/**
 * Extract program information from natural language
 */
export const extractProgramFromDescription = tool(
  async ({ description }: { description: string }) => {
    return description;
  },
  {
    name: "extract_program",
    description: "Extract structured program information from natural language description. Returns Program schema with name, programType, trackedEntityType, programStages, etc.",
    schema: z.object({
      description: z.string().describe("Natural language description of the program to extract")
    }),
  }
);

/**
 * Extract indicator information from natural language
 */
export const extractIndicatorFromDescription = tool(
  async ({ description }: { description: string }) => {
    return description;
  },
  {
    name: "extract_indicator",
    description: "Extract structured indicator information from natural language description. Returns Indicator schema with name, numerator, denominator, annualized settings, etc.",
    schema: z.object({
      description: z.string().describe("Natural language description of the indicator to extract")
    }),
  }
);

/**
 * Extract validation rule information from natural language
 */
export const extractValidationRuleFromDescription = tool(
  async ({ description }: { description: string }) => {
    return description;
  },
  {
    name: "extract_validation_rule",
    description: "Extract structured validation rule information from natural language description. Returns ValidationRule schema with name, importance, operator, expressions, etc.",
    schema: z.object({
      description: z.string().describe("Natural language description of the validation rule to extract")
    }),
  }
);

/**
 * Extract option set information from natural language
 */
export const extractOptionSetFromDescription = tool(
  async ({ description }: { description: string }) => {
    return description;
  },
  {
    name: "extract_option_set",
    description: "Extract structured option set information from natural language description. Returns OptionSet schema with name, valueType, options, etc.",
    schema: z.object({
      description: z.string().describe("Natural language description of the option set to extract")
    }),
  }
);

/**
 * Parse compound natural language descriptions into individual resource descriptions
 * Detects batch creation requests and splits them into separate descriptions
 */
export function parseBatchDescriptions(description: string, resourceType?: string): string[] {
    const descLower = description.toLowerCase().trim();

    // Common resource types and their keywords for pattern matching
    const resourceKeywords = {
        dataElements: ['data element', 'data elements', 'indicator variable', 'variable'],
        organisationUnits: ['organisation unit', 'org unit', 'orgunit', 'facility', 'health facility'],
        categories: ['category', 'categories', 'dimension'],
        categoryCombos: ['category combination', 'category combo', 'dimension combo'],
        dataSets: ['data set', 'dataset', 'data sets'],
        programs: ['program', 'programs', 'tracker program', 'event program'],
        indicators: ['indicator', 'indicators', 'kpi', 'key performance indicator'],
        validationRules: ['validation rule', 'validation rules'],
        optionSets: ['option set', 'optionset', 'option sets']
    };

    // Look for the target resource type in the keywords
    const targetKeywords = resourceType ? resourceKeywords[resourceType] || [] : [];
    const allKeywords = Object.values(resourceKeywords).flat();

    // If no specific resource type, try to detect from description
    let workingKeywords = targetKeywords.length > 0 ? targetKeywords : allKeywords;

    // Look for enumeration patterns that indicate multiple resources
    const enumerationPatterns = [
        // Numbered lists: "1. data element X and 2. data element Y"
        /(\d+\.)\s*(.+?)(?=(\d+\.)\s|$)/gi,

        // Bulleted lists: "• data element X, • data element Y"
        /(•|\*\s*|-\s*)(.+?)(?=(•|\*\s*|-\s*|$))/gi,

        // Conjunction patterns: "data element X and data element Y"
        /\s+(and|&|plus|with)\s+(.+?)(?=\s*as\s+a\s+(?:whole|complete|final)|$)/gi,

        // Comma-separated: "data element X, data element Y"
        /(?:create|make|add)\s*(.*?),\s*(.*?)(?=(?:\s+(?:and|&|plus|with)\s+|$))/gi,

        // Direct multiple mentions with the same resource type
        new RegExp(`(${workingKeywords.join('|')})\\s+(\\w+)[^,]*?(?=\\s+(?:and|with|plus|&|$))`, 'gi')
    ];

    let descriptions: string[] = [];

    // Try enumeration patterns first
    for (const pattern of enumerationPatterns) {
        const matches = [...descLower.matchAll(pattern)];
        if (matches.length > 1) {
            // Found multiple resource mentions
            descriptions = matches.map(match => {
                const matchText = match[match.length - 1] || match[1];
                // Clean up the match and reconstruct the description
                return `${resourceType || 'resource'} ${matchText}`.trim();
            });

            if (descriptions.length > 1) {
                // Validate that we actually found multiple distinct resources
                const uniqueNames = new Set(descriptions.map(desc => extractResourceName(desc)));
                if (uniqueNames.size > 1) {
                    break; // Found valid batch descriptions
                }
            }
            descriptions = []; // Reset if validation failed
        }
    }

    // If no enumeration patterns found, check for multiple occurrences of resource types
    if (descriptions.length === 0) {
        const resourceMentions: Array<{type: string, start: number, end: number, text: string}> = [];

        for (const keyword of workingKeywords) {
            const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
            let match;
            while ((match = regex.exec(descLower)) !== null) {
                resourceMentions.push({
                    type: keyword,
                    start: match.index,
                    end: match.index + keyword.length,
                    text: description.slice(match.index, match.index + keyword.length)
                });
            }
        }

        // If we have multiple mentions of the same resource type, try to split
        if (resourceMentions.length > 1) {
            const groups = groupResourceMentions(resourceMentions, description);
            if (groups.length > 1) {
                descriptions = groups.map(group => group.trim());
            }
        }
    }

    // Fall back to single description if no batch detected
    if (descriptions.length === 0 || descriptions.length === 1) {
        return [description]; // Return original description as single item
    }

    // Clean and validate descriptions
    return descriptions
        .map(desc => desc.trim())
        .filter(desc => desc.length > 0)
        .filter((desc, index, arr) =>
            arr.findIndex(d => extractResourceName(d) === extractResourceName(desc)) === index
        ); // Remove duplicates based on resource name
}

/**
 * Group resource mentions into coherent description segments
 */
function groupResourceMentions(
    mentions: Array<{type: string, start: number, end: number, text: string}>,
    originalDescription: string
): string[] {
    if (mentions.length === 0) return [originalDescription];

    const groups: string[] = [];
    let currentStart = 0;

    // Sort mentions by position
    mentions.sort((a, b) => a.start - b.start);

    for (let i = 0; i < mentions.length; i++) {
        const current = mentions[i];
        const next = mentions[i + 1];

        let endPos = next ? next.start : originalDescription.length;

        // Look for sentence boundaries, conjunctions, or punctuation
        let adjustedEndpos = endPos;
        for (let j = current.end; j < endPos; j++) {
            const char = originalDescription[j];
            if (char === '.' || char === ',' || char === ';' ||
                (j + 3 < originalDescription.length && originalDescription.substr(j, 3).toLowerCase() === 'and')) {
                adjustedEndpos = j + (char === '.' || char === ',' || char === ';' ? 1 : 3);
                break;
            }
        }

        const segment = originalDescription.slice(currentStart, adjustedEndpos).trim();
        if (segment.length > 10 && segment.includes(current.type)) { // Ensure it's meaningful
            groups.push(segment);
        }

        currentStart = adjustedEndpos;
    }

    return groups.filter(group => group.length > 0);
}

/**
 * Extract resource name from a description
 */
function extractResourceName(description: string): string {
    const descLower = description.toLowerCase();

    // Look for quoted names first
    const quotedMatch = description.match(/["']([^"']+)["']/);
    if (quotedMatch) return quotedMatch[1];

    // Look for common name patterns
    const namePatterns = [
        /\b(?:called|named|for)\s+["']?([^"'\s,.;!?]+)["']?/i,
        /\w+\s+\w+/i // First two words as fallback
    ];

    for (const pattern of namePatterns) {
        const match = description.match(pattern);
        if (match && match[1] && !['create', 'make', 'add', 'build', 'generate'].includes(match[1].toLowerCase())) {
            return match[1].trim();
        }
    }

    return description.trim();
}

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
// DHIS2 environment variables</content>
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
// DHIS2 environment variables

// DHIS2 environment variables
const dhis2BaseUrl = import.meta.env.DHIS2_API_BASE_URL;
const username = import.meta.env.DHIS2_USERNAME;
const password = import.meta.env.DHIS2_PASSWORD;

const auth = `${username}:${password}`;

function authHeaders(): HeadersInit {
    return {
        'Authorization': `Basic ${btoa(auth)}`,
        'Content-Type': 'application/json',
    };
}

/**
 * Generate a unique ID from DHIS2 API
 */
export async function generateDhis2Id(): Promise<string> {
    try {
        const response = await fetch(`${dhis2BaseUrl}/system/id?limit=1`, {
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
            `${dhis2BaseUrl}/${metadataType}?filter=name:ilike:${encodeURIComponent(query)}&fields=id,name,code,displayName&paging=false`,
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
 * Get DHIS2 metadata by ID
 */
export async function getDhis2MetadataById(metadataType: string, id: string): Promise<any> {
    try {
        const response = await fetch(`${dhis2BaseUrl}/${metadataType}/${id}`, {
            method: "GET",
            headers: authHeaders(),
        });

        if (!response.ok) {
            throw new Error(`DHIS2 API error: ${response.status} ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error getting DHIS2 metadata by ID:', error);
        throw error;
    }
}

/**
 * Create DHIS2 metadata directly via single API calls (bypasses batch manager)
 * Use for sequential dependency creation where order matters
 */
export async function createDhis2MetadataDirect(
    metadataType: string,
    payload: Record<string, any>
): Promise<{ response: any; httpStatus: number; uid?: string }> {
    if (Array.isArray(payload)) {
        throw new Error('createDhis2MetadataDirect only supports single objects, not arrays');
    }

    const metadataPayload = { [metadataType]: [payload] };

    console.log('Creating metadata directly:', JSON.stringify(metadataPayload, null, 2));

    const response = await fetch(`${dhis2BaseUrl}/metadata?importStrategy=CREATE_UPDATE`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(metadataPayload)
    });

    const data = await response.json();

    if (!response.ok) {
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
        uid: payload.id // Return the ID that was used
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
 * Update DHIS2 metadata using unified batch API
 */
export async function updateDhis2Metadata(
    metadataType: string,
    payload: Record<string, any>[]
): Promise<any> {
    const { batchUpdateMetadata } = await import('./batch-manager');

    const items = payload.map(data => ({
        type: metadataType,
        id: data.id,
        data
    }));

    const result = await batchUpdateMetadata(items, {
        importStrategy: 'CREATE_UPDATE',
        atomic: false // Allow partial success for backward compatibility
    });

    if (!result.success) {
        throw new Error(`Failed to update metadata: ${result.errors?.join(', ')}`);
    }

    return result.apiResponse;
}

/**
 * Delete DHIS2 metadata
 */
export async function deleteDhis2Metadata(
    metadataType: string,
    ids: string[]
): Promise<Array<{ id: string; status: number; message: string }>> {
    const results = await Promise.all(
        ids.map(async (id) => {
            try {
                const response = await fetch(`${dhis2BaseUrl}/${metadataType}/${id}`, {
                    method: "DELETE",
                    headers: authHeaders(),
                });
                return {
                    id,
                    status: response.status,
                    message: response.ok ? "Deleted successfully" : `Failed to delete: ${response.statusText}`
                };
            } catch (error) {
                return {
                    id,
                    status: 500,
                    message: `Error: ${error.message}`
                };
            }
        })
    );

    console.log('Delete results:', results);
    return results;
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
export async function
resolveDependencies<T extends z.ZodSchema>(
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
 * Enhanced natural language description parser for DHIS2 metadata
 * Supports comprehensive parsing for all resource types with context awareness
 */
export function parseNaturalLanguageDescription(description: string, resourceType?: string): {
    name: string;
    valueType?: string;
    aggregationType?: string;
    domainType?: string;
    properties: Record<string, any>;
} {
    const descLower = description.toLowerCase();
    const properties: Record<string, any> = {};

    // Enhanced name extraction with more patterns
    const namePatterns = [
        // Standard patterns
        /(?:create|make|add|build|generate).*?(?:called|named|for|of)\s+["']?([^"'\s,.;!?]+)["']?/i,
        /(?:create|make|add|build|generate)\s+["']?([^"'\s,.;!?]+)["']?.*?(?:data element|indicator|program|dataset|category|organisation unit)/i,
        // Question patterns
        /(?:what|how|can you).*?(?:create|make|add).*?["']?([^"'\s,.;!?]+)["']?/i,
        // Descriptive patterns
        /(?:a|an)\s+([^,\s]+?)\s+(?:data element|indicator|program|dataset|category|organisation unit)/i,
        // Complex patterns with multiple descriptors
        /(?:create|make|add).*?(?:a|an)?\s*(?:numeric|text|boolean|date)?\s*(?:data element|indicator|program|dataset|category|organisation unit).*?["']?([^"'\s,.;!?]+)["']?/i,
    ];

    let name = '';
    for (const pattern of namePatterns) {
        const match = descLower.match(pattern);
        if (match && match[1]) {
            name = match[1].trim();
            // Clean up common artifacts
            name = name.replace(/^(a|an|the)\s+/i, '').replace(/\s+(data element|indicator|program|dataset|category|organisation unit)$/i, '');
            break;
        }
    }

    if (!name) {
        // Enhanced fallback: extract meaningful words
        const words = description.split(/\s+/).filter(word =>
            word.length > 2 &&
            !['create', 'make', 'add', 'build', 'generate', 'a', 'an', 'the', 'for', 'of', 'and', 'or', 'but', 'with', 'that', 'this', 'these', 'those'].includes(word.toLowerCase())
        );
        name = words.slice(0, 4).join(' ');
    }

    // Capitalize name properly
    name = name.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');

    // Context-aware parsing based on resource type
    if (resourceType) {
        parseResourceSpecificProperties(descLower, properties, resourceType);
    } else {
        // Generic parsing for unknown resource types
        parseGenericProperties(descLower, properties);
    }

    // Parse description from the original text
    if (description.length > name.length + 10) {
        properties.description = description.trim();
    }

    return {
        name,
        properties,
    };
}

/**
 * Parse properties specific to different resource types
 */
function parseResourceSpecificProperties(descLower: string, properties: Record<string, any>, resourceType: string): void {
    switch (resourceType.toLowerCase()) {
        case 'dataelements':
        case 'dataelement':
            parseDataElementProperties(descLower, properties);
            break;
        case 'organisationunits':
        case 'organisationunit':
            parseOrganisationUnitProperties(descLower, properties);
            break;
        case 'categories':
        case 'category':
            parseCategoryProperties(descLower, properties);
            break;
        case 'categorycombos':
        case 'categorycombo':
            parseCategoryComboProperties(descLower, properties);
            break;
        case 'datasets':
        case 'dataset':
            parseDataSetProperties(descLower, properties);
            break;
        case 'programs':
        case 'program':
            parseProgramProperties(descLower, properties);
            break;
        case 'indicators':
        case 'indicator':
            parseIndicatorProperties(descLower, properties);
            break;
        case 'validationrules':
        case 'validationrule':
            parseValidationRuleProperties(descLower, properties);
            break;
        case 'optionsets':
        case 'optionset':
            parseOptionSetProperties(descLower, properties);
            break;
        default:
            parseGenericProperties(descLower, properties);
    }
}

/**
 * Parse data element specific properties
 */
function parseDataElementProperties(descLower: string, properties: Record<string, any>): void {
    // Enhanced value type parsing
    if (descLower.includes('percentage') || descLower.includes('percent') || descLower.includes('rate')) {
        properties.valueType = 'NUMBER';
        properties.aggregationType = 'AVERAGE';
    } else if (descLower.includes('count') || descLower.includes('number of') || descLower.includes('frequency')) {
        properties.valueType = 'INTEGER';
        properties.aggregationType = 'COUNT';
    } else if (descLower.includes('age') || descLower.includes('duration') || descLower.includes('time period')) {
        properties.valueType = 'AGE';
        properties.aggregationType = 'AVERAGE';
    } else if (descLower.includes('coordinate') || descLower.includes('location') || descLower.includes('gps')) {
        properties.valueType = 'COORDINATE';
        properties.aggregationType = 'NONE';
    } else if (descLower.includes('yes/no') || descLower.includes('yes or no') || descLower.includes('binary')) {
        properties.valueType = 'BOOLEAN';
        properties.aggregationType = 'COUNT';
    } else if (descLower.includes('file') || descLower.includes('document') || descLower.includes('attachment')) {
        properties.valueType = 'FILE_RESOURCE';
        properties.aggregationType = 'NONE';
    } else if (descLower.includes('url') || descLower.includes('link') || descLower.includes('website')) {
        properties.valueType = 'URL';
        properties.aggregationType = 'NONE';
    } else if (descLower.includes('email') || descLower.includes('e-mail')) {
        properties.valueType = 'EMAIL';
        properties.aggregationType = 'NONE';
    } else if (descLower.includes('phone') || descLower.includes('telephone') || descLower.includes('mobile')) {
        properties.valueType = 'PHONE_NUMBER';
        properties.aggregationType = 'NONE';
    } else if (descLower.includes('text') || descLower.includes('string') || descLower.includes('description')) {
        properties.valueType = 'TEXT';
        properties.aggregationType = 'NONE';
    } else if (descLower.includes('long text') || descLower.includes('paragraph') || descLower.includes('notes')) {
        properties.valueType = 'LONG_TEXT';
        properties.aggregationType = 'NONE';
    } else if (descLower.includes('date') && !descLower.includes('date time')) {
        properties.valueType = 'DATE';
        properties.aggregationType = 'COUNT';
    } else if (descLower.includes('date time') || descLower.includes('datetime') || descLower.includes('timestamp')) {
        properties.valueType = 'DATETIME';
        properties.aggregationType = 'COUNT';
    } else if (descLower.includes('time') && !descLower.includes('date')) {
        properties.valueType = 'TIME';
        properties.aggregationType = 'NONE';
    } else if (descLower.includes('number') || descLower.includes('numeric') || descLower.includes('quantity')) {
        properties.valueType = 'NUMBER';
    } else if (descLower.includes('integer') || descLower.includes('whole number') || descLower.includes('int')) {
        properties.valueType = 'INTEGER';
    } else if (descLower.includes('positive') && descLower.includes('integer')) {
        properties.valueType = 'POSITIVE_INTEGER';
    } else if (descLower.includes('negative') && descLower.includes('integer')) {
        properties.valueType = 'NEGATIVE_INTEGER';
    } else if (descLower.includes('zero or positive')) {
        properties.valueType = 'ZERO_OR_POSITIVE_INTEGER';
    }

    // Enhanced aggregation type parsing
    if (descLower.includes('sum') || descLower.includes('total') || descLower.includes('add up')) {
        properties.aggregationType = 'SUM';
    } else if (descLower.includes('average') || descLower.includes('mean') || descLower.includes('typical')) {
        properties.aggregationType = 'AVERAGE';
    } else if (descLower.includes('count') || descLower.includes('how many')) {
        properties.aggregationType = 'COUNT';
    } else if (descLower.includes('minimum') || descLower.includes('min') || descLower.includes('lowest')) {
        properties.aggregationType = 'MIN';
    } else if (descLower.includes('maximum') || descLower.includes('max') || descLower.includes('highest')) {
        properties.aggregationType = 'MAX';
    } else if (descLower.includes('standard deviation') || descLower.includes('stddev')) {
        properties.aggregationType = 'STDDEV';
    } else if (descLower.includes('variance') || descLower.includes('var')) {
        properties.aggregationType = 'VARIANCE';
    }

    // Domain type parsing
    if (descLower.includes('tracker') || descLower.includes('individual') || descLower.includes('patient') || descLower.includes('client')) {
        properties.domainType = 'TRACKER';
    } else if (descLower.includes('aggregate') || descLower.includes('summary') || descLower.includes('facility')) {
        properties.domainType = 'AGGREGATE';
    }

    // Other data element properties
    if (descLower.includes('zero is significant') || descLower.includes('zero significant') || descLower.includes('include zero')) {
        properties.zeroIsSignificant = true;
    }

    if (descLower.includes('url') || descLower.includes('link')) {
        properties.url = 'https://example.com'; // Placeholder
    }
}

/**
 * Parse organisation unit specific properties
 */
function parseOrganisationUnitProperties(descLower: string, properties: Record<string, any>): void {
    // Level parsing
    const levelMatch = descLower.match(/(?:level|tier|stage)\s*(\d+)/i);
    if (levelMatch) {
        properties.level = parseInt(levelMatch[1]);
    } else if (descLower.includes('national') || descLower.includes('country')) {
        properties.level = 1;
    } else if (descLower.includes('regional') || descLower.includes('province') || descLower.includes('state')) {
        properties.level = 2;
    } else if (descLower.includes('district') || descLower.includes('county')) {
        properties.level = 3;
    } else if (descLower.includes('facility') || descLower.includes('hospital') || descLower.includes('clinic')) {
        properties.level = 4;
    } else if (descLower.includes('community') || descLower.includes('village')) {
        properties.level = 5;
    } else {
        properties.level = 1; // Default
    }

    // Generate path based on level
    properties.path = `/${properties.level}`;

    // Code extraction
    const codeMatch = descLower.match(/(?:code|identifier)[=:]\s*([^\s,]+)/i);
    if (codeMatch) {
        properties.code = codeMatch[1].toUpperCase();
    }
}

/**
 * Parse category specific properties
 */
function parseCategoryProperties(descLower: string, properties: Record<string, any>): void {
    properties.dataDimension = descLower.includes('disaggregate') || descLower.includes('break down') || !descLower.includes('attribute');

    if (descLower.includes('disaggregate') || descLower.includes('break down') || descLower.includes('split')) {
        properties.dataDimensionType = 'DISAGGREGATION';
    } else if (descLower.includes('attribute') || descLower.includes('characteristic')) {
        properties.dataDimensionType = 'ATTRIBUTE';
    } else {
        properties.dataDimensionType = 'DISAGGREGATION'; // Default
    }

    // Extract category options if mentioned
    const optionsMatch = descLower.match(/(?:options?|values?):\s*([^.;!?]+)/i);
    if (optionsMatch) {
        const options = optionsMatch[1].split(/[,;]/).map(opt => opt.trim()).filter(opt => opt.length > 0);
        if (options.length > 0) {
            properties.categoryOptions = options.map((option, index) => ({
                name: option,
                displayName: option,
                shortName: option.length > 50 ? option.substring(0, 47) + '...' : option,
                sortOrder: index + 1
            }));
        }
    }
}

/**
 * Parse category combo specific properties
 */
function parseCategoryComboProperties(descLower: string, properties: Record<string, any>): void {
    if (descLower.includes('disaggregate') || descLower.includes('break down')) {
        properties.dataDimensionType = 'DISAGGREGATION';
    } else if (descLower.includes('attribute') || descLower.includes('characteristic')) {
        properties.dataDimensionType = 'ATTRIBUTE';
    } else {
        properties.dataDimensionType = 'DISAGGREGATION'; // Default
    }
}

/**
 * Parse data set specific properties
 */
function parseDataSetProperties(descLower: string, properties: Record<string, any>): void {
    // Period type parsing
    if (descLower.includes('daily') || descLower.includes('day')) {
        properties.periodType = 'Daily';
    } else if (descLower.includes('weekly') || descLower.includes('week')) {
        properties.periodType = 'Weekly';
    } else if (descLower.includes('monthly') || descLower.includes('month')) {
        properties.periodType = 'Monthly';
    } else if (descLower.includes('quarterly') || descLower.includes('quarter')) {
        properties.periodType = 'Quarterly';
    } else if (descLower.includes('yearly') || descLower.includes('annual') || descLower.includes('year')) {
        properties.periodType = 'Yearly';
    } else if (descLower.includes('financial april')) {
        properties.periodType = 'FinancialApril';
    } else if (descLower.includes('financial july')) {
        properties.periodType = 'FinancialJuly';
    } else if (descLower.includes('financial oct')) {
        properties.periodType = 'FinancialOct';
    } else {
        properties.periodType = 'Monthly'; // Default
    }

    // Open future periods
    const futureMatch = descLower.match(/(?:open|allow)\s+(?:future\s+)?(?:periods?\s+)?(\d+)/i);
    if (futureMatch) {
        properties.openFuturePeriods = parseInt(futureMatch[1]);
    }

    // Expiry days
    const expiryMatch = descLower.match(/(?:expire|expiry)\s+(?:after\s+)?(\d+)\s*(?:days?|months?|weeks?)/i);
    if (expiryMatch) {
        const value = parseInt(expiryMatch[1]);
        if (descLower.includes('month')) {
            properties.expiryDays = value * 30;
        } else if (descLower.includes('week')) {
            properties.expiryDays = value * 7;
        } else {
            properties.expiryDays = value;
        }
    }
}

/**
 * Parse program specific properties
 */
function parseProgramProperties(descLower: string, properties: Record<string, any>): void {
    // Program type
    if (descLower.includes('registration') || descLower.includes('track') || descLower.includes('individual') || descLower.includes('patient')) {
        properties.programType = 'WITH_REGISTRATION';
    } else if (descLower.includes('event') || descLower.includes('aggregate') || descLower.includes('facility')) {
        properties.programType = 'WITHOUT_REGISTRATION';
    } else {
        properties.programType = 'WITH_REGISTRATION'; // Default for tracker programs
    }

    // Enrollment settings
    if (descLower.includes('only enroll once') || descLower.includes('one enrollment')) {
        properties.onlyEnrollOnce = true;
    }

    if (descLower.includes('select enrollment dates in future') || descLower.includes('future enrollment')) {
        properties.selectEnrollmentDatesInFuture = true;
    }

    if (descLower.includes('select incident dates in future') || descLower.includes('future incident')) {
        properties.selectIncidentDatesInFuture = true;
    }

    // Display settings
    if (descLower.includes('display front page') || descLower.includes('show on front')) {
        properties.displayFrontPageList = true;
    }

    if (descLower.includes('use first stage during registration') || descLower.includes('first stage registration')) {
        properties.useFirstStageDuringRegistration = true;
    }
}

/**
 * Parse indicator specific properties
 */
function parseIndicatorProperties(descLower: string, properties: Record<string, any>): void {
    // Annualized setting
    if (descLower.includes('annualized') || descLower.includes('annual') || descLower.includes('yearly')) {
        properties.annualized = true;
    } else {
        properties.annualized = false; // Default
    }

    // Decimals
    const decimalMatch = descLower.match(/(\d+)\s*(?:decimal|dp|places)/i);
    if (decimalMatch) {
        properties.decimals = parseInt(decimalMatch[1]);
    }

    // Extract simple numerator/denominator if mentioned
    if (descLower.includes('numerator') || descLower.includes('denominator')) {
        // For now, set basic expressions - these would need more sophisticated parsing
        properties.numerator = '1';
        properties.denominator = '1';
    }
}

/**
 * Parse validation rule specific properties
 */
function parseValidationRuleProperties(descLower: string, properties: Record<string, any>): void {
    // Importance level
    if (descLower.includes('high') && descLower.includes('priority')) {
        properties.importance = 'HIGH';
    } else if (descLower.includes('medium') && descLower.includes('priority')) {
        properties.importance = 'MEDIUM';
    } else if (descLower.includes('low') && descLower.includes('priority')) {
        properties.importance = 'LOW';
    } else {
        properties.importance = 'MEDIUM'; // Default
    }

    // Operator
    if (descLower.includes('equal') || descLower.includes('same') || descLower.includes('=')) {
        properties.operator = 'equal_to';
    } else if (descLower.includes('not equal') || descLower.includes('different') || descLower.includes('!=')) {
        properties.operator = 'not_equal_to';
    } else if (descLower.includes('greater') || descLower.includes('more') || descLower.includes('>')) {
        properties.operator = 'greater_than';
    } else if (descLower.includes('less') || descLower.includes('smaller') || descLower.includes('<')) {
        properties.operator = 'less_than';
    } else if (descLower.includes('compulsory pair') || descLower.includes('both required')) {
        properties.operator = 'compulsory_pair';
    } else if (descLower.includes('exclusive pair') || descLower.includes('either or')) {
        properties.operator = 'exclusive_pair';
    }

    // Period type (try to infer from context)
    if (descLower.includes('daily')) {
        properties.periodType = 'Daily';
    } else if (descLower.includes('weekly')) {
        properties.periodType = 'Weekly';
    } else if (descLower.includes('monthly')) {
        properties.periodType = 'Monthly';
    } else if (descLower.includes('quarterly')) {
        properties.periodType = 'Quarterly';
    } else if (descLower.includes('yearly')) {
        properties.periodType = 'Yearly';
    } else {
        properties.periodType = 'Monthly'; // Default
    }

    // Default expressions (would need more sophisticated parsing)
    properties.leftSide = {
        expression: '1',
        missingValueStrategy: 'NEVER_SKIP'
    };
    properties.rightSide = {
        expression: '1',
        missingValueStrategy: 'NEVER_SKIP'
    };
}

/**
 * Parse option set specific properties
 */
function parseOptionSetProperties(descLower: string, properties: Record<string, any>): void {
    // Value type
    if (descLower.includes('text')) {
        properties.valueType = 'TEXT';
    } else if (descLower.includes('number')) {
        properties.valueType = 'NUMBER';
    } else if (descLower.includes('boolean')) {
        properties.valueType = 'BOOLEAN';
    } else if (descLower.includes('date')) {
        properties.valueType = 'DATE';
    } else {
        properties.valueType = 'TEXT'; // Default
    }

    // Extract options if mentioned
    const optionsMatch = descLower.match(/(?:options?|values?|choices?):\s*([^.;!?]+)/i);
    if (optionsMatch) {
        const options = optionsMatch[1].split(/[,;]/).map(opt => opt.trim()).filter(opt => opt.length > 0);
        if (options.length > 0) {
            properties.options = options.map((option, index) => ({
                name: option,
                displayName: option,
                code: option.toUpperCase().replace(/[^A-Z0-9]/g, '_'),
                sortOrder: index + 1
            }));
        }
    }
}

/**
 * Parse generic properties for unknown resource types
 */
function parseGenericProperties(descLower: string, properties: Record<string, any>): void {
    // Basic value type parsing
    if (descLower.includes('text') || descLower.includes('string')) {
        properties.valueType = 'TEXT';
    } else if (descLower.includes('number') || descLower.includes('numeric')) {
        properties.valueType = 'NUMBER';
    } else if (descLower.includes('integer') || descLower.includes('int')) {
        properties.valueType = 'INTEGER';
    } else if (descLower.includes('boolean') || descLower.includes('true') || descLower.includes('false')) {
        properties.valueType = 'BOOLEAN';
    } else if (descLower.includes('date')) {
        properties.valueType = 'DATE';
    }

    // Basic aggregation type parsing
    if (descLower.includes('sum') || descLower.includes('total')) {
        properties.aggregationType = 'SUM';
    } else if (descLower.includes('average') || descLower.includes('mean')) {
        properties.aggregationType = 'AVERAGE';
    } else if (descLower.includes('count')) {
        properties.aggregationType = 'COUNT';
    }

    // Basic domain type parsing
    if (descLower.includes('tracker') || descLower.includes('event') || descLower.includes('program')) {
        properties.domainType = 'TRACKER';
    } else {
        properties.domainType = 'AGGREGATE';
    }

    // Code extraction
    const codeMatch = descLower.match(/(?:code|identifier)[=:]\s*([^\s,]+)/i);
    if (codeMatch) {
        properties.code = codeMatch[1].toUpperCase();
    }
}

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
 * Generate short name from display name
 */
export function generateShortName(displayName: string, maxLength: number = 50): string {
    if (displayName.length <= maxLength) {
        return displayName;
    }
    return displayName.substring(0, maxLength - 3) + '...';
}

/**
 * Batch process resources with dependency management
 */
export async function batchProcessResources<T extends z.ZodSchema>(
    schema: T,
    descriptions: string[],
    options: {
        generateId?: boolean;
        resolveDependencies?: Array<{
            type: string;
            name: string;
            createIfNotFound?: boolean;
            createParams?: Record<string, any>;
        }>;
    } = {}
): Promise<Array<{ success: boolean; data?: any; error?: string }>> {
    const results = [];

    for (const description of descriptions) {
        try {
            // Parse description
            const { name, properties } = parseNaturalLanguageDescription(description);

            // Generate ID if requested
            let id: string | undefined;
            if (options.generateId !== false) {
                id = await generateDhis2Id();
            }

            // Resolve dependencies if specified
            let resolvedDeps: Record<string, { id: string; name: string }> = {};
            if (options.resolveDependencies) {
                resolvedDeps = await resolveDependencies(schema, options.resolveDependencies);
            }

            // Create resource data
            const resourceData = {
                id,
                name,
                displayName: name,
                shortName: generateShortName(name),
                ...properties,
                ...resolvedDeps,
            };

            // Validate data
            const validation = validateResourceData(schema, resourceData);
            if (!validation.success) {
                results.push({
                    success: false,
                    error: `Validation failed: ${(validation as any).errors?.join(', ') || 'Unknown validation error'}`
                });
                continue;
            }

            // Create in DHIS2
            const createResult = await createDhis2Metadata(
                schema.description || 'unknown',
                validation.data
            );

            results.push({
                success: true,
                data: validation.data
            });

        } catch (error) {
            results.push({
                success: false,
                error: error.message
            });
        }
    }

    return results;
}
