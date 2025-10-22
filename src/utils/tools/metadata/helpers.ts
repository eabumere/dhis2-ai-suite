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
 * Create DHIS2 metadata using unified batch API
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
                    error: `Validation failed: ${validation.errors?.join(', ') || 'Unknown validation error'}`
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
