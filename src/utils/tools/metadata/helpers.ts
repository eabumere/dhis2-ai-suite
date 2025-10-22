import { z } from 'zod';
import { Dhis2Schemas } from './schemas';

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
 * Create DHIS2 metadata
 */
export async function createDhis2Metadata(
    metadataType: string,
    payload: Record<string, any> | Record<string, any>[]
): Promise<any> {
    const body: any = {};
    body[metadataType] = Array.isArray(payload) ? payload : [payload];

    console.log('Creating DHIS2 metadata:', JSON.stringify(body, null, 2));

    const response = await fetch(`${dhis2BaseUrl}/metadata?importStrategy=CREATE_UPDATE`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const responseText = await response.text();
        console.error('DHIS2 API Error:', response.status, responseText);
        throw new Error(`HTTP error! status: ${response.status}, response: ${responseText}`);
    }

    const data = await response.json();
    console.log('DHIS2 metadata created:', data);
    return data;
}

/**
 * Update DHIS2 metadata
 */
export async function updateDhis2Metadata(
    metadataType: string,
    payload: Record<string, any>[]
): Promise<any> {
    const body: any = {};
    body[metadataType] = payload;

    console.log('Updating DHIS2 metadata:', JSON.stringify(body, null, 2));

    const response = await fetch(`${dhis2BaseUrl}/metadata?importStrategy=CREATE_UPDATE`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const responseText = await response.text();
        console.error('DHIS2 API Error:', response.status, responseText);
        throw new Error(`HTTP error! status: ${response.status}, response: ${responseText}`);
    }

    const data = await response.json();
    console.log('DHIS2 metadata updated:', data);
    return data;
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
 * Resolve dependencies for a resource
 * Searches for existing resources or creates them if they don't exist
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

    for (const dep of dependencies) {
        // Search for existing resource
        const existing = await searchDhis2Metadata(dep.type, dep.name, 1);

        if (existing.length > 0) {
            resolved[dep.name] = { id: existing[0].id, name: existing[0].name };
        } else if (dep.createIfNotFound && dep.createParams) {
            // Create the dependency if it doesn't exist
            const id = await generateDhis2Id();
            const newResource = {
                id,
                ...dep.createParams,
            };

            // Validate against schema
            const validated = schema.parse(newResource);

            try {
                await createDhis2Metadata(dep.type, validated);
                resolved[dep.name] = { id, name: dep.createParams.name };
            } catch (error) {
                throw new Error(`Failed to create dependency ${dep.name}: ${error.message}`);
            }
        } else {
            throw new Error(`Dependency not found: ${dep.name} (${dep.type})`);
        }
    }

    return resolved;
}

/**
 * Parse natural language description to extract resource properties
 */
export function parseNaturalLanguageDescription(description: string): {
    name: string;
    valueType?: string;
    aggregationType?: string;
    domainType?: string;
    properties: Record<string, any>;
} {
    const descLower = description.toLowerCase();
    const properties: Record<string, any> = {};

    // Extract name (look for patterns like "called X", "named Y", etc.)
    const namePatterns = [
        /(?:create|make|add).*?(?:called|named|for)\s+["']?([^"'\s]+)["']?/i,
        /(?:create|make|add)\s+["']?([^"'\s]+)["']?.*?(?:data element|indicator|program)/i,
    ];

    let name = '';
    for (const pattern of namePatterns) {
        const match = descLower.match(pattern);
        if (match && match[1]) {
            name = match[1].trim();
            break;
        }
    }

    if (!name) {
        // Fallback: use the whole description as name
        name = description.split(/\s+/).slice(0, 3).join(' ');
    }

    // Capitalize name
    name = name.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');

    // Parse value type
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
    } else if (descLower.includes('email')) {
        properties.valueType = 'EMAIL';
    } else if (descLower.includes('phone')) {
        properties.valueType = 'PHONE_NUMBER';
    }

    // Parse aggregation type
    if (descLower.includes('sum') || descLower.includes('total')) {
        properties.aggregationType = 'SUM';
    } else if (descLower.includes('average') || descLower.includes('mean')) {
        properties.aggregationType = 'AVERAGE';
    } else if (descLower.includes('count')) {
        properties.aggregationType = 'COUNT';
    } else if (descLower.includes('min')) {
        properties.aggregationType = 'MIN';
    } else if (descLower.includes('max')) {
        properties.aggregationType = 'MAX';
    }

    // Parse domain type
    if (descLower.includes('tracker') || descLower.includes('event') || descLower.includes('program')) {
        properties.domainType = 'TRACKER';
    } else {
        properties.domainType = 'AGGREGATE';
    }

    // Parse other properties
    if (descLower.includes('zero is significant') || descLower.includes('zero significant')) {
        properties.zeroIsSignificant = true;
    }

    return {
        name,
        properties,
    };
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
                errors: error.errors.map(err => `${err.path.join('.')}: ${err.message}`)
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
                    error: `Validation failed: ${validation.errors.join(', ')}`
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
