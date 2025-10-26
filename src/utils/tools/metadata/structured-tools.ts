import { createDhis2GetByIdTool, createDhis2ResourceTool, createDhis2SearchTool, createDhis2UpdateTool } from './base-tool';
import { Dhis2Schemas } from './schemas';
import { parseNaturalLanguageDescription } from './helpers';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
    addResourceToContext,
    createDhis2Metadata,
    createDhis2MetadataDirect,
    createDhis2MetadataAggregated,
    generateDhis2Id,
    searchDhis2Metadata,
} from './helpers';


// DataElement Tool
export const createDhis2DataElement = createDhis2ResourceTool({
    name: "create_dhis2_data_element",
    description: "Create DHIS2 data elements from natural language descriptions. Supports both single and batch creation with automatic dependency resolution.",
    schema: Dhis2Schemas.DataElement,
    metadataType: "dataElements",
    defaultDependencies: [
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
    parseDescription: (description: string) => {
        const { name, properties } = parseNaturalLanguageDescription(description);

        // Enhanced parsing for data elements
        const descLower = description.toLowerCase();

        // Parse value type with more specific patterns
        if (descLower.includes('percentage') || descLower.includes('percent')) {
            properties.valueType = 'NUMBER';
            properties.aggregationType = 'AVERAGE';
        } else if (descLower.includes('count') || descLower.includes('number of')) {
            properties.valueType = 'INTEGER';
            properties.aggregationType = 'COUNT';
        } else if (descLower.includes('age')) {
            properties.valueType = 'AGE';
            properties.aggregationType = 'AVERAGE';
        } else if (descLower.includes('coordinate') || descLower.includes('location')) {
            properties.valueType = 'COORDINATE';
            properties.aggregationType = 'NONE';
        } else if (descLower.includes('yes/no') || descLower.includes('true/false') || descLower.includes('boolean')) {
            properties.valueType = 'BOOLEAN';
            properties.aggregationType = 'COUNT';
        } else if (descLower.includes('file') || descLower.includes('document')) {
            properties.valueType = 'FILE_RESOURCE';
            properties.aggregationType = 'NONE';
        } else if (descLower.includes('url') || descLower.includes('link')) {
            properties.valueType = 'URL';
            properties.aggregationType = 'NONE';
        }

        // Parse zero significance
        if (descLower.includes('zero is significant') || descLower.includes('include zero')) {
            properties.zeroIsSignificant = true;
        }

        // Parse description from the original description
        if (description.length > name.length) {
            properties.description = description;
        }

        return { name, properties };
    }
});

// OrganisationUnit Tool
export const createDhis2OrganisationUnit = createDhis2ResourceTool({
    name: "create_dhis2_organisation_unit",
    description: "Create DHIS2 organisation units from natural language descriptions.",
    schema: Dhis2Schemas.OrganisationUnit,
    metadataType: "organisationUnits",
    parseDescription: (description: string) => {
        const { name, properties } = parseNaturalLanguageDescription(description);

        // Enhanced parsing for organisation units
        const descLower = description.toLowerCase();

        // Parse level (try to extract from description)
        const levelMatch = descLower.match(/level\s*(\d+)/i);
        if (levelMatch) {
            properties.level = parseInt(levelMatch[1]);
        } else {
            properties.level = 1; // Default to level 1
        }

        // Generate a simple path (this would need to be enhanced based on parent units)
        properties.path = `/${properties.level}`;

        return { name, properties };
    }
});

// Category and CategoryCombo Tools
export const createDhis2Category = createDhis2ResourceTool({
    name: "create_dhis2_category",
    description: "Create DHIS2 categories from natural language descriptions.",
    schema: Dhis2Schemas.Category,
    metadataType: "categories",
    defaultDependencies: [
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
    parseDescription: (description: string) => {
        const { name, properties } = parseNaturalLanguageDescription(description);

        // Set defaults for category
        properties.dataDimension = true;
        properties.dataDimensionType = 'DISAGGREGATION';
        properties.categoryOptions = [];

        return { name, properties };
    }
});

export const createDhis2CategoryCombo = createDhis2ResourceTool({
    name: "create_dhis2_category_combo",
    description: "Create DHIS2 category combinations from natural language descriptions.",
    schema: Dhis2Schemas.CategoryCombo,
    metadataType: "categoryCombos",
    defaultDependencies: [
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
    parseDescription: (description: string) => {
        const { name, properties } = parseNaturalLanguageDescription(description);

        // Set defaults for category combo
        properties.dataDimensionType = 'DISAGGREGATION';
        properties.categories = [];

        return { name, properties };
    }
});

// DataSet Tool
export const createDhis2DataSet = createDhis2ResourceTool({
    name: "create_dhis2_data_set",
    description: "Create DHIS2 data sets from natural language descriptions.",
    schema: Dhis2Schemas.DataSet,
    metadataType: "dataSets",
    defaultDependencies: [
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
    parseDescription: (description: string) => {
        const { name, properties } = parseNaturalLanguageDescription(description);

        // Enhanced parsing for data sets
        const descLower = description.toLowerCase();

        // Parse period type
        if (descLower.includes('daily')) {
            properties.periodType = 'Daily';
        } else if (descLower.includes('weekly')) {
            properties.periodType = 'Weekly';
        } else if (descLower.includes('monthly')) {
            properties.periodType = 'Monthly';
        } else if (descLower.includes('quarterly')) {
            properties.periodType = 'Quarterly';
        } else if (descLower.includes('yearly') || descLower.includes('annual')) {
            properties.periodType = 'Yearly';
        } else {
            properties.periodType = 'Monthly'; // Default
        }

        // Set default values
        properties.dataSetElements = [];
        properties.organisationUnits = [];

        return { name, properties };
    }
});

// Program Tool
export const createDhis2Program = createDhis2ResourceTool({
    name: "create_dhis2_program",
    description: "Create DHIS2 programs from natural language descriptions.",
    schema: Dhis2Schemas.Program,
    metadataType: "programs",
    parseDescription: (description: string) => {
        const { name, properties } = parseNaturalLanguageDescription(description);

        // Enhanced parsing for programs
        const descLower = description.toLowerCase();

        // Parse program type
        if (descLower.includes('registration') || descLower.includes('track')) {
            properties.programType = 'WITH_REGISTRATION';
        } else {
            properties.programType = 'WITHOUT_REGISTRATION';
        }

        // Set defaults
        properties.programStages = [];
        properties.organisationUnits = [];

        return { name, properties };
    }
});

// Indicator Tool
export const createDhis2Indicator = createDhis2ResourceTool({
    name: "create_dhis2_indicator",
    description: "Create DHIS2 indicators from natural language descriptions.",
    schema: Dhis2Schemas.Indicator,
    metadataType: "indicators",
    defaultDependencies: [
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
    parseDescription: (description: string) => {
        const { name, properties } = parseNaturalLanguageDescription(description);

        // Set defaults for indicators
        properties.numerator = "1"; // Default numerator
        properties.denominator = "1"; // Default denominator
        properties.annualized = false;

        return { name, properties };
    }
});

// Validation Rule Tool
export const createDhis2ValidationRule = createDhis2ResourceTool({
    name: "create_dhis2_validation_rule",
    description: "Create DHIS2 validation rules from natural language descriptions.",
    schema: Dhis2Schemas.ValidationRule,
    metadataType: "validationRules",
    parseDescription: (description: string) => {
        const { name, properties } = parseNaturalLanguageDescription(description);

        // Set defaults for validation rules
        properties.importance = 'MEDIUM';
        properties.operator = 'equal_to';
        properties.organisationUnitLevels = [1];

        // Default expressions (these would need to be enhanced)
        properties.leftSide = {
            expression: "1",
            missingValueStrategy: "NEVER_SKIP"
        };
        properties.rightSide = {
            expression: "1",
            missingValueStrategy: "NEVER_SKIP"
        };

        return { name, properties };
    }
});

// Option Set Tool
export const createDhis2OptionSet = createDhis2ResourceTool({
    name: "create_dhis2_option_set",
    description: "Create DHIS2 option sets from natural language descriptions.",
    schema: Dhis2Schemas.OptionSet,
    metadataType: "optionSets",
    parseDescription: (description: string) => {
        const { name, properties } = parseNaturalLanguageDescription(description);

        // Set defaults
        properties.options = [];
        properties.valueType = 'TEXT';

        return { name, properties };
    }
});

// Search Tools
export const searchDhis2DataElements = createDhis2SearchTool("dataElements", "Data Elements");
export const searchDhis2OrganisationUnits = createDhis2SearchTool("organisationUnits", "Organisation Units");
export const searchDhis2Categories = createDhis2SearchTool("categories", "Categories");
export const searchDhis2CategoryCombos = createDhis2SearchTool("categoryCombos", "Category Combinations");
export const searchDhis2DataSets = createDhis2SearchTool("dataSets", "Data Sets");
export const searchDhis2Programs = createDhis2SearchTool("programs", "Programs");
export const searchDhis2Indicators = createDhis2SearchTool("indicators", "Indicators");

// Get by ID Tools
export const getDhis2DataElementById = createDhis2GetByIdTool("dataElements", "Data Element");
export const getDhis2OrganisationUnitById = createDhis2GetByIdTool("organisationUnits", "Organisation Unit");
export const getDhis2CategoryById = createDhis2GetByIdTool("categories", "Category");
export const getDhis2DataSetById = createDhis2GetByIdTool("dataSets", "Data Set");
export const getDhis2ProgramById = createDhis2GetByIdTool("programs", "Program");

// Update Tools
export const updateDhis2DataElement = createDhis2UpdateTool({
    name: "update_dhis2_data_element",
    description: "Update DHIS2 data elements using schema-compliant properties",
    schema: Dhis2Schemas.DataElement,
    metadataType: "dataElements",
});

export const updateDhis2OrganisationUnit = createDhis2UpdateTool({
    name: "update_dhis2_organisation_unit",
    description: "Update DHIS2 organisation units using schema-compliant properties",
    schema: Dhis2Schemas.OrganisationUnit,
    metadataType: "organisationUnits",
});

export const updateDhis2Category = createDhis2UpdateTool({
    name: "update_dhis2_category",
    description: "Update DHIS2 categories using schema-compliant properties",
    schema: Dhis2Schemas.Category,
    metadataType: "categories",
});

export const updateDhis2CategoryCombo = createDhis2UpdateTool({
    name: "update_dhis2_category_combo",
    description: "Update DHIS2 category combinations using schema-compliant properties",
    schema: Dhis2Schemas.CategoryCombo,
    metadataType: "categoryCombos",
});

export const updateDhis2DataSet = createDhis2UpdateTool({
    name: "update_dhis2_data_set",
    description: "Update DHIS2 data sets using schema-compliant properties",
    schema: Dhis2Schemas.DataSet,
    metadataType: "dataSets",
});

export const updateDhis2Program = createDhis2UpdateTool({
    name: "update_dhis2_program",
    description: "Update DHIS2 programs using schema-compliant properties",
    schema: Dhis2Schemas.Program,
    metadataType: "programs",
});

export const updateDhis2Indicator = createDhis2UpdateTool({
    name: "update_dhis2_indicator",
    description: "Update DHIS2 indicators using schema-compliant properties",
    schema: Dhis2Schemas.Indicator,
    metadataType: "indicators",
});

export const updateDhis2ValidationRule = createDhis2UpdateTool({
    name: "update_dhis2_validation_rule",
    description: "Update DHIS2 validation rules using schema-compliant properties",
    schema: Dhis2Schemas.ValidationRule,
    metadataType: "validationRules",
});

export const updateDhis2OptionSet = createDhis2UpdateTool({
    name: "update_dhis2_option_set",
    description: "Update DHIS2 option sets using schema-compliant properties",
    schema: Dhis2Schemas.OptionSet,
    metadataType: "optionSets",
});


/**
 * Create DHIS2 metadata using aggregated single payload for related resources
 * Reduces API calls by creating multiple related metadata types in one request
 * Automatically checks for existence to avoid duplicates
 */
export const createDhis2AggregatedMetadata = tool(
    async ({
        metadata,
    }: {
        metadata: Record<string, Record<string, any>[]>;
    }) => {
        try {
            console.log('Creating aggregated metadata:', JSON.stringify(metadata, null, 2));

            // Pre-process: Generate IDs for resources that don't have them
            for (const [metadataType, resources] of Object.entries(metadata)) {
                for (const resource of resources) {
                    if (!resource.id) {
                        resource.id = await generateDhis2Id();
                    }
                }
            }

            const result = await createDhis2MetadataAggregated(metadata);

            // Add successfully created resources to context
            for (const r of result.results) {
                if (r.created) {
                    const resource = metadata[r.type]?.find(res => res.id === r.id);
                    if (resource) {
                        addResourceToContext(r.id!, r.type, resource.name || `Unnamed ${r.type}`, 'created');
                    }
                }
            }

            const createdCount = result.results.filter(r => r.created).length;
            const existingCount = result.results.filter(r => !r.created).length;

            return JSON.stringify({
                success: true,
                message: `Processed ${result.results.length} resources: ${createdCount} created, ${existingCount} already existed`,
                total: result.results.length,
                created: createdCount,
                existing: existingCount,
                results: result.results,
                apiResponse: result.response,
            });

        } catch (error) {
            console.error('Error creating aggregated metadata:', error);
            return JSON.stringify({
                success: false,
                error: `Failed to create aggregated metadata: ${error.message}`,
            });
        }
    },
    {
        name: "create_dhis2_aggregated_metadata",
        description: "Create multiple related DHIS2 metadata objects in a single API call when all IDs are resolvable in the payload. Automatically checks for existence to avoid duplicates.",
        schema: z.object({
            metadata: z.record(
                z.string(), // metadata type (e.g., "categoryOptions", "categories", "categoryCombos", "dataElements")
                z.array(z.record(z.string(), z.any())) // array of resource objects
            ).describe("Aggregated metadata payload with multiple resource types. IDs must be resolvable within the payload. Example: { categoryOptions: [...], categories: [...], categoryCombos: [...], dataElements: [...] }"),
        }),
    }
);

/**
 * Create a complex DHIS2 reporting form with dependencies
 * Can use sequential creation (default - safe) or aggregated creation (fast)
 */
export const createDhis2ReportingForm = tool(
    async ({
        formName,
        dataElementName,
        categoryName,
        categoryOptions = [],
        dataElementDescription,
        periodType = 'Monthly',
        aggregated = false
    }: {
        formName: string;
        dataElementName: string;
        categoryName: string;
        categoryOptions?: string[];
        dataElementDescription?: string;
        periodType?: 'Monthly' | 'Weekly' | 'Daily' | 'Quarterly' | 'Yearly';
        aggregated?: boolean;
    }) => {

        // AGGREGATED MODE: Build complete payload and let DHIS2 handle dependencies
        if (aggregated) {
            console.log('Using aggregated creation mode for reporting form');
            return await createDhis2ReportingFormAggregated({
                formName,
                dataElementName,
                categoryName,
                categoryOptions,
                dataElementDescription,
                periodType
            });
        }

        // SEQUENTIAL MODE: Create components step by step (legacy approach)
        console.log('Using sequential creation mode for reporting form');
        return await createDhis2ReportingFormSequential({
            formName,
            dataElementName,
            categoryName,
            categoryOptions,
            dataElementDescription,
            periodType
        });
    },
    {
        name: "create_dhis2_reporting_form",
        description: "Create a complex DHIS2 reporting form with category-based disaggregation. Use aggregated=true for fast one-API-call creation when all references are resolvable.",
        schema: z.object({
            formName: z.string().describe("Name of the reporting form (DataSet)"),
            dataElementName: z.string().describe("Name of the main indicator/data element"),
            categoryName: z.string().describe("Name of the disaggregation category"),
            categoryOptions: z.array(z.string()).describe("List of category options for disaggregation (e.g., ['First Visit', 'Follow-up Visit'])"),
            dataElementDescription: z.string().optional().describe("Optional description for the data element"),
            periodType: z.enum(['Monthly', 'Weekly', 'Daily', 'Quarterly', 'Yearly']).default('Monthly').describe("Reporting frequency"),
            aggregated: z.boolean().optional().default(false).describe("If true, uses aggregated creation (one API call, DHIS2 resolves dependencies internally). If false, uses sequential creation (safe, multiple API calls)."),
        }),
    }
);

/**
 * Create reporting form using sequential mode (original approach - safe but slower)
 */
async function createDhis2ReportingFormSequential({
    formName,
    dataElementName,
    categoryName,
    categoryOptions = [],
    dataElementDescription,
    periodType = 'Monthly'
}: {
    formName: string;
    dataElementName: string;
    categoryName: string;
    categoryOptions?: string[];
    dataElementDescription?: string;
    periodType?: 'Monthly' | 'Weekly' | 'Daily' | 'Quarterly' | 'Yearly';
}) {
    try {
        // Step 1: Create CategoryOptions FIRST (sequentially)
        const categoryOptionIds: string[] = [];
        for (const option of categoryOptions) {
            const id = await generateDhis2Id();
            const optionData = {
                id,
                name: option,
                displayName: option,
                shortName: option.length > 50 ? option.substring(0, 47) + '...' : option,
                code: option.toUpperCase().replace(/[^A-Z0-9]/g, '_'),
                sortOrder: categoryOptionIds.length + 1,
            };

            try {
                await createDhis2MetadataDirect('categoryOptions', optionData);
                categoryOptionIds.push(id);
                addResourceToContext(id, 'categoryOptions', option, 'created');
            } catch (error) {
                console.error(`Failed to create CategoryOption "${option}":`, error);
                throw error;
            }
        }

        // Step 2: Create Category with references to CategoryOptions
        const categoryId = await generateDhis2Id();
        const categoryData = {
            id: categoryId,
            name: categoryName,
            displayName: categoryName,
            shortName: categoryName.length > 50 ? categoryName.substring(0, 47) + '...' : categoryName,
            dataDimension: true,
            dataDimensionType: 'DISAGGREGATION',
            categoryOptions: categoryOptionIds.map(id => ({ id })),
        };

        await createDhis2MetadataDirect('categories', categoryData);
        addResourceToContext(categoryId, 'categories', categoryName, 'created');

        // Step 3: Create CategoryCombo
        const categoryComboId = await generateDhis2Id();
        const comboData = {
            id: categoryComboId,
            name: `${categoryName} Combo`,
            displayName: `${categoryName} Combo`,
            shortName: `${categoryName} Combo`.substring(0, 50),
            dataDimensionType: 'DISAGGREGATION',
            categories: [{ id: categoryId }],
        };

        await createDhis2MetadataDirect('categoryCombos', comboData);
        addResourceToContext(categoryComboId, 'categoryCombos', `${categoryName} Combo`, 'created');

        // Step 4: Create Data Element
        const dataElementId = await generateDhis2Id();
        const dataElementData = {
            id: dataElementId,
            name: dataElementName,
            displayName: dataElementName,
            shortName: dataElementName.length > 50 ? dataElementName.substring(0, 47) + '...' : dataElementName,
            valueType: 'INTEGER',
            domainType: 'AGGREGATE',
            aggregationType: 'COUNT',
            zeroIsSignificant: true,
            categoryCombo: { id: categoryComboId },
            description: dataElementDescription || `${dataElementName} tracked by ${categoryName}`,
        };

        await createDhis2MetadataDirect('dataElements', dataElementData);
        addResourceToContext(dataElementId, 'dataElements', dataElementName, 'created');

        // Step 5: Create DataSet with data elements
        const dataSetId = await generateDhis2Id();
        const dataSetData = {
            id: dataSetId,
            name: formName,
            displayName: formName,
            shortName: formName.length > 50 ? formName.substring(0, 47) + '...' : formName,
            periodType,
            openFuturePeriods: 1,
            dataSetElements: [{
                dataElement: { id: dataElementId },
                categoryCombo: { id: categoryComboId },
                sortOrder: 1,
            }],
            organisationUnits: [], // Will need to be set based on context
            description: `Monthly reporting form for ${formName}`,
        };

        await createDhis2MetadataDirect('dataSets', dataSetData);
        addResourceToContext(dataSetId, 'dataSets', formName, 'created');

        return JSON.stringify({
            success: true,
            message: `Successfully created ${formName} reporting form with disaggregation by ${categoryName}`,
            formId: dataSetId,
            dataElementId,
            categoryId,
            categoryOptionIds,
            categoryComboId,
            created: categoryOptions.length + 4, // categoryOptions + category + combo + dataElement + dataSet
            failed: 0,
            total: categoryOptions.length + 4,
            results: [{
                message: 'All components created successfully',
                status: 'SUCCESS'
            }],
        });

    } catch (error) {
        console.error('Error creating reporting form:', error);
        return JSON.stringify({
            success: false,
            error: `Failed to create reporting form: ${error.message}`,
        });
    }
}

/**
 * Create reporting form using aggregated mode (fast - one API call, DHIS2 handles dependencies)
 */
async function createDhis2ReportingFormAggregated({
    formName,
    dataElementName,
    categoryName,
    categoryOptions = [],
    dataElementDescription,
    periodType = 'Monthly'
}: {
    formName: string;
    dataElementName: string;
    categoryName: string;
    categoryOptions?: string[];
    dataElementDescription?: string;
    periodType?: 'Monthly' | 'Weekly' | 'Daily' | 'Quarterly' | 'Yearly';
}) {
    try {
        // Generate all IDs upfront
        const categoryOptionIds = await Promise.all(
            categoryOptions.map(async (_, index) => ({
                id: await generateDhis2Id(),
                index
            }))
        );

        const categoryId = await generateDhis2Id();
        const categoryComboId = await generateDhis2Id();
        const dataElementId = await generateDhis2Id();
        const dataSetId = await generateDhis2Id();

        // Build complete payload for DHIS2 aggregation
        const aggregatedPayload = {
            categoryOptions: categoryOptions.map((option, index) => ({
                id: categoryOptionIds[index].id,
                name: option,
                displayName: option,
                shortName: option.length > 50 ? option.substring(0, 47) + '...' : option,
                code: option.toUpperCase().replace(/[^A-Z0-9]/g, '_'),
                sortOrder: index + 1,
            })),
            categories: [{
                id: categoryId,
                name: categoryName,
                displayName: categoryName,
                shortName: categoryName.length > 50 ? categoryName.substring(0, 47) + '...' : categoryName,
                dataDimension: true,
                dataDimensionType: 'DISAGGREGATION',
                categoryOptions: categoryOptionIds.map(item => ({ id: item.id })),
            }],
            categoryCombos: [{
                id: categoryComboId,
                name: `${categoryName} Combo`,
                displayName: `${categoryName} Combo`,
                shortName: `${categoryName} Combo`.substring(0, 50),
                dataDimensionType: 'DISAGGREGATION',
                categories: [{ id: categoryId }],
            }],
            dataElements: [{
                id: dataElementId,
                name: dataElementName,
                displayName: dataElementName,
                shortName: dataElementName.length > 50 ? dataElementName.substring(0, 47) + '...' : dataElementName,
                valueType: 'INTEGER',
                domainType: 'AGGREGATE',
                aggregationType: 'COUNT',
                zeroIsSignificant: true,
                categoryCombo: { id: categoryComboId },
                description: dataElementDescription || `${dataElementName} tracked by ${categoryName}`,
            }],
            dataSets: [{
                id: dataSetId,
                name: formName,
                displayName: formName,
                shortName: formName.length > 50 ? formName.substring(0, 47) + '...' : formName,
                periodType,
                openFuturePeriods: 1,
                dataSetElements: [{
                    dataElement: { id: dataElementId },
                    categoryCombo: { id: categoryComboId },
                    sortOrder: 1,
                }],
                organisationUnits: [], // Will need to be set based on context
                description: `Monthly reporting form for ${formName}`,
            }],
        };

        // Use the aggregated creation function
        const result = await createDhis2MetadataAggregated(aggregatedPayload);

        // Add successfully created resources to context
        for (const r of result.results) {
            if (r.created) {
                const resourceType = r.type;
                const resource = aggregatedPayload[resourceType]?.find(res => res.id === r.id);
                if (resource) {
                    addResourceToContext(r.id!, resourceType, resource.name || `Unnamed ${resourceType}`, 'created');
                }
            }
        }

        return JSON.stringify({
            success: true,
            message: `Successfully created ${formName} reporting form using aggregated approach (1 API call)`,
            formId: dataSetId,
            dataElementId,
            categoryId,
            categoryOptionIds: categoryOptionIds.map(item => item.id),
            categoryComboId,
            created: result.results.filter(r => r.created).length, // Actually created count from existence check
            existing: result.results.filter(r => !r.created).length, // Already existed count
            total: result.results.length,
            apiCalls: 1, // Always 1 for aggregated mode
            results: result.results,
            apiResponse: result.response,
        });

    } catch (error) {
        console.error('Error creating reporting form (aggregated):', error);
        return JSON.stringify({
            success: false,
            error: `Failed to create aggregated reporting form: ${error.message}`,
        });
    }
}

// Export all tools
export const Dhis2StructuredTools = {
    // Creation tools
    createDhis2DataElement,
    createDhis2OrganisationUnit,
    createDhis2Category,
    createDhis2CategoryCombo,
    createDhis2DataSet,
    createDhis2Program,
    createDhis2Indicator,
    createDhis2ValidationRule,
    createDhis2OptionSet,

    // Aggregated metadata creation tool
    createDhis2AggregatedMetadata,

    // Complex form creation tool
    createDhis2ReportingForm,

    // Search tools
    searchDhis2DataElements,
    searchDhis2OrganisationUnits,
    searchDhis2Categories,
    searchDhis2CategoryCombos,
    searchDhis2DataSets,
    searchDhis2Programs,
    searchDhis2Indicators,

    // Get by ID tools
    getDhis2DataElementById,
    getDhis2OrganisationUnitById,
    getDhis2CategoryById,
    getDhis2DataSetById,
    getDhis2ProgramById,
};
