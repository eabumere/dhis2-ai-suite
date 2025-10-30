import { createDhis2GetByIdTool, createDhis2ResourceTool, createDhis2SearchTool, createDhis2UpdateTool, createLLMFirstTool, LLMToolConfig } from './base-tool';
import { Dhis2Schemas } from './schemas';
import { parseNaturalLanguageDescription, parseExpressionForDataElements, generateDataElementFromExpression } from './helpers';
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

/**
 * Enhanced indicator creation with automatic data element creation
 * Parses expressions and creates required data elements automatically
 */
export const createDhis2Indicator = tool(
    async ({
        description,
        name,
        shortName,
        annualized,
        numerator,
        denominator,
        indicatorType
    }: {
        description: string;
        name?: string;
        shortName?: string;
        annualized?: boolean;
        numerator?: string;
        denominator?: string;
        indicatorType?: string;
    }) => {
        try {
            // Parse the description to extract properties
            const { name: parsedName, properties } = parseNaturalLanguageDescription(description);

            // Override with explicit parameters if provided
            const finalName = name || parsedName;
            const finalShortName = shortName || (finalName.length > 50 ? finalName.substring(0, 47) + '...' : finalName);
            const finalAnnualized = annualized !== undefined ? annualized : properties.annualized || false;

            // Parse expression to identify data elements
            let dataElements: Array<{ code: string; name: string; inferredValueType: string }> = [];

            // Check both provided expressions and those parsed from description
            const expressionsToCheck = [
                numerator || properties.numerator,
                denominator || properties.denominator,
                properties.numerator === "1" ? null : properties.numerator,
                properties.denominator === "1" ? null : properties.denominator
            ].filter(Boolean);

            // Additionally, parse expressions directly from the description text
            const descriptionExpressions = parseExpressionForDataElements(description);
            expressionsToCheck.push(...descriptionExpressions.map(de => `#{${de.code}}`));

            for (const expr of expressionsToCheck) {
                if (typeof expr === 'string') {
                    dataElements = dataElements.concat(parseExpressionForDataElements(expr));
                }
            }

            // Remove duplicates by code
            const uniqueDataElements = dataElements.filter((de, index, arr) =>
                arr.findIndex(d => d.code === de.code) === index
            );

            console.log(`Found ${uniqueDataElements.length} referenced data elements:`, uniqueDataElements.map(de => de.code));

            // Generate indicator properties
            const indicatorProps = {
                name: finalName,
                displayName: finalName,
                shortName: finalShortName,
                description: description,
                annualized: finalAnnualized,
                numerator: numerator || properties.numerator || '#{DE_Default_Num}',
                denominator: denominator || properties.denominator || '#{DE_Default_Den}',
                decimals: 2 // Default
            };

            // Create default indicator type if not specified
            const defaultIndicatorType = await generateDhis2Id();
            const defaultIndicatorTypeData = {
                id: defaultIndicatorType,
                name: "Default Indicator Type",
                displayName: "Default Indicator Type",
                factor: 1,
                number: false
            };

            // Generate data elements (ensure they don't already exist)
            const dataElementPayloads = [];
            for (const de of uniqueDataElements) {
                const id = await generateDhis2Id();
                dataElementPayloads.push({
                    ...generateDataElementFromExpression(de.code, de.name, de.inferredValueType),
                    id
                });
            }

            // Create indicator payload
            const indicatorId = await generateDhis2Id();
            const indicatorPayload = {
                id: indicatorId,
                ...indicatorProps,
                indicatorType: { id: defaultIndicatorType }
            };

            // Build aggregated payload
            const aggregatedPayload: Record<string, any[]> = {};

            // Add indicator type if needed
            aggregatedPayload.indicatorTypes = [defaultIndicatorTypeData];

            // Add data elements
            if (dataElementPayloads.length > 0) {
                aggregatedPayload.dataElements = dataElementPayloads;
            }

            // Add indicator
            aggregatedPayload.indicators = [indicatorPayload];

            // Execute batch creation
            console.log('Creating indicator with referenced data elements:', JSON.stringify(aggregatedPayload, null, 2));

            const result = await createDhis2MetadataAggregated(aggregatedPayload);

            // Add successfully created resources to context
            for (const r of result.results) {
                if (r.created) {
                    const resourceType = r.type;
                    const resource = aggregatedPayload[resourceType]?.find((res: any) => res.id === r.id);
                    if (resource) {
                        addResourceToContext(r.id!, resourceType, resource.name || `Unnamed ${resourceType}`, 'created');
                    }
                }
            }

            const createdItems = result.results.filter(r => r.created);
            const totalItems = result.results.length;

            // Check if creation was successful
            const indicatorCreated = createdItems.some(r => r.type === 'indicators');

            return JSON.stringify({
                success: true,
                message: `Created indicator "${finalName}" with ${dataElementPayloads.length} referenced data elements`,
                indicatorId,
                indicatorName: finalName,
                dataElementsCreated: dataElementPayloads.length,
                dataElementCodes: uniqueDataElements.map(de => de.code),
                created: createdItems.length,
                total: totalItems,
                results: result.results,
                apiResponse: result.response,
            });

        } catch (error) {
            console.error('Error creating indicator with data elements:', error);
            return JSON.stringify({
                success: false,
                error: `Failed to create indicator: ${error.message}`,
                description
            });
        }
    },
    {
        name: "create_dhis2_indicator",
        description: "Create DHIS2 indicators from natural language descriptions. Automatically parses expressions and creates any referenced data elements.",
        schema: z.object({
            description: z.string().describe("Natural language description of the indicator, including the expression with data element references"),
            name: z.string().optional().describe("Override for the indicator name"),
            shortName: z.string().optional().describe("Override for the short name"),
            annualized: z.boolean().optional().default(false).describe("Whether the indicator is annualized"),
            numerator: z.string().optional().describe("Custom numerator expression"),
            denominator: z.string().optional().describe("Custom denominator expression"),
            indicatorType: z.string().optional().describe("Indicator type to use (defaults to auto-created type)"),
        }).describe(`Create DHIS2 indicator with automatic data element creation from expressions like #{DE_Code} / #{DE_Code}`),
    }
);

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

// Track existing tools
export const existingTools = {
    create: [
        'createDhis2DataElement',
        'createDhis2OrganisationUnit',
        'createDhis2Category',
        'createDhis2CategoryCombo',
        'createDhis2DataSet',
        'createDhis2Program',
        'createDhis2Indicator',
        'createDhis2ValidationRule',
        'createDhis2OptionSet',
        'createDhis2AggregatedMetadata',
        'createDhis2ReportingForm'
    ],
    update: [
        'updateDhis2DataElement',
        'updateDhis2OrganisationUnit',
        'updateDhis2Category',
        'updateDhis2CategoryCombo',
        'updateDhis2DataSet',
        'updateDhis2Program',
        'updateDhis2Indicator',
        'updateDhis2ValidationRule',
        'updateDhis2OptionSet'
    ],
    search: [
        'searchDhis2DataElements',
        'searchDhis2OrganisationUnits',
        'searchDhis2Categories',
        'searchDhis2CategoryCombos',
        'searchDhis2DataSets',
        'searchDhis2Programs',
        'searchDhis2Indicators'
    ],
    getById: [
        'getDhis2DataElementById',
        'getDhis2OrganisationUnitById',
        'getDhis2CategoryById',
        'getDhis2DataSetById',
        'getDhis2ProgramById'
    ]
};

// Direct CRUD Tools for Top-level Entities
export const createDhis2CategoryOption = createDhis2ResourceTool({
    name: "create_dhis2_category_option",
    description: "Create DHIS2 category options from schema-compliant objects",
    schema: Dhis2Schemas.CategoryOption,
    metadataType: "categoryOptions",
    parseDescription: (description: string) => {
        const { name, properties } = parseNaturalLanguageDescription(description);
        return { name, properties };
    }
});

export const createDhis2OrganisationUnitGroup = createDhis2ResourceTool({
    name: "create_dhis2_organisation_unit_group",
    description: "Create DHIS2 organisation unit groups from schema-compliant objects",
    schema: Dhis2Schemas.OrganisationUnitGroup,
    metadataType: "organisationUnitGroups",
    parseDescription: (description: string) => {
        const { name, properties } = parseNaturalLanguageDescription(description);
        properties.organisationUnits = [];
        return { name, properties };
    }
});

export const createDhis2OrganisationUnitGroupSet = createDhis2ResourceTool({
    name: "create_dhis2_organisation_unit_group_set",
    description: "Create DHIS2 organisation unit group sets from schema-compliant objects",
    schema: Dhis2Schemas.OrganisationUnitGroupSet,
    metadataType: "organisationUnitGroupSets",
    parseDescription: (description: string) => {
        const { name, properties } = parseNaturalLanguageDescription(description);
        properties.organisationUnitGroups = [];
        return { name, properties };
    }
});

export const createDhis2TrackedEntityAttribute = createDhis2ResourceTool({
    name: "create_dhis2_tracked_entity_attribute",
    description: "Create DHIS2 tracked entity attributes from schema-compliant objects",
    schema: Dhis2Schemas.TrackedEntityAttribute,
    metadataType: "trackedEntityAttributes",
    parseDescription: (description: string) => {
        const { name, properties } = parseNaturalLanguageDescription(description);
        // Default to TEXT valueType if not specified
        properties.valueType = properties.valueType || 'TEXT';
        properties.unique = properties.unique || false;
        properties.inherit = properties.inherit || false;
        return { name, properties };
    }
});

export const createDhis2IndicatorType = createDhis2ResourceTool({
    name: "create_dhis2_indicator_type",
    description: "Create DHIS2 indicator types from schema-compliant objects",
    schema: Dhis2Schemas.IndicatorType,
    metadataType: "indicatorTypes",
    parseDescription: (description: string) => {
        const { name, properties } = parseNaturalLanguageDescription(description);
        properties.factor = properties.factor || 1;
        properties.number = properties.number || false;
        return { name, properties };
    }
});

export const createDhis2Visualization = createDhis2ResourceTool({
    name: "create_dhis2_visualization",
    description: "Create DHIS2 visualizations (charts/tables) from schema-compliant objects",
    schema: Dhis2Schemas.Visualization,
    metadataType: "visualizations",
    parseDescription: (description: string) => {
        const { name, properties } = parseNaturalLanguageDescription(description);
        properties.type = properties.type || 'COLUMN';
        properties.dataDimensionItems = properties.dataDimensionItems || [];
        properties.columns = properties.columns || [];
        properties.rows = properties.rows || [];
        properties.filters = properties.filters || [];
        properties.organisationUnits = [];
        properties.periods = [];
        return { name, properties };
    }
});

export const createDhis2Dashboard = createDhis2ResourceTool({
    name: "create_dhis2_dashboard",
    description: "Create DHIS2 dashboards from schema-compliant objects",
    schema: Dhis2Schemas.Dashboard,
    metadataType: "dashboards",
    parseDescription: (description: string) => {
        const { name, properties } = parseNaturalLanguageDescription(description);
        properties.dashboardItems = [];
        properties.publicAccess = '--------';
        properties.externalAccess = false;
        return { name, properties };
    }
});

// Update Tools - Direct CRUD
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

export const updateDhis2CategoryOption = createDhis2UpdateTool({
    name: "update_dhis2_category_option",
    description: "Update DHIS2 category options using schema-compliant properties",
    schema: Dhis2Schemas.CategoryOption,
    metadataType: "categoryOptions",
});

export const updateDhis2DataSet = createDhis2UpdateTool({
    name: "update_dhis2_data_set",
    description: "Update DHIS2 data sets using schema-compliant properties",
    schema: Dhis2Schemas.DataSet,
    metadataType: "dataSets",
});

export const updateDhis2OrganisationUnitGroup = createDhis2UpdateTool({
    name: "update_dhis2_organisation_unit_group",
    description: "Update DHIS2 organisation unit groups using schema-compliant properties",
    schema: Dhis2Schemas.OrganisationUnitGroup,
    metadataType: "organisationUnitGroups",
});

export const updateDhis2OrganisationUnitGroupSet = createDhis2UpdateTool({
    name: "update_dhis2_organisation_unit_group_set",
    description: "Update DHIS2 organisation unit group sets using schema-compliant properties",
    schema: Dhis2Schemas.OrganisationUnitGroupSet,
    metadataType: "organisationUnitGroupSets",
});

export const updateDhis2Program = createDhis2UpdateTool({
    name: "update_dhis2_program",
    description: "Update DHIS2 programs using schema-compliant properties",
    schema: Dhis2Schemas.Program,
    metadataType: "programs",
});

export const updateDhis2TrackedEntityType = createDhis2UpdateTool({
    name: "update_dhis2_tracked_entity_type",
    description: "Update DHIS2 tracked entity types using schema-compliant properties",
    schema: Dhis2Schemas.TrackedEntityType,
    metadataType: "trackedEntityTypes",
});

export const updateDhis2TrackedEntityAttribute = createDhis2UpdateTool({
    name: "update_dhis2_tracked_entity_attribute",
    description: "Update DHIS2 tracked entity attributes using schema-compliant properties",
    schema: Dhis2Schemas.TrackedEntityAttribute,
    metadataType: "trackedEntityAttributes",
});

export const updateDhis2Indicator = createDhis2UpdateTool({
    name: "update_dhis2_indicator",
    description: "Update DHIS2 indicators using schema-compliant properties",
    schema: Dhis2Schemas.Indicator,
    metadataType: "indicators",
});

export const updateDhis2IndicatorType = createDhis2UpdateTool({
    name: "update_dhis2_indicator_type",
    description: "Update DHIS2 indicator types using schema-compliant properties",
    schema: Dhis2Schemas.IndicatorType,
    metadataType: "indicatorTypes",
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

export const updateDhis2Visualization = createDhis2UpdateTool({
    name: "update_dhis2_visualization",
    description: "Update DHIS2 visualizations using schema-compliant properties",
    schema: Dhis2Schemas.Visualization,
    metadataType: "visualizations",
});

export const updateDhis2Dashboard = createDhis2UpdateTool({
    name: "update_dhis2_dashboard",
    description: "Update DHIS2 dashboards using schema-compliant properties",
    schema: Dhis2Schemas.Dashboard,
    metadataType: "dashboards",
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

export const createDhis2TrackedEntityType = createDhis2ResourceTool({
    name: "create_dhis2_tracked_entity_type",
    description: "Create DHIS2 tracked entity types from schema-compliant objects",
    schema: Dhis2Schemas.TrackedEntityType,
    metadataType: "trackedEntityTypes",
    // Note: trackedEntityTypeAttributes are properties of TrackedEntityType, not separate entities
    // They cannot be created as standalone dependencies
    parseDescription: (description: string) => {
        const { name, properties } = parseNaturalLanguageDescription(description);
        properties.trackedEntityTypeAttributes = []; // Initialize as empty array
        properties.allowAuditLog = false;
        return { name, properties };
    }
});

// Complex Entity Tools with Dependencies
export const createDhis2ProgramStage = createDhis2ResourceTool({
    name: "create_dhis2_program_stage",
    description: "Create DHIS2 program stages from schema-compliant objects. Requires a parent program.",
    schema: Dhis2Schemas.ProgramStage,
    metadataType: "programStages",
    parseDescription: (description: string) => {
        const { name, properties } = parseNaturalLanguageDescription(description);
        properties.repeatable = false;
        properties.minDaysFromStart = 0;
        properties.programStageDataElements = [];
        properties.validationStrategy = 'ON_COMPLETE';
        return { name, properties };
    }
});

export const createDhis2ProgramRule = createDhis2ResourceTool({
    name: "create_dhis2_program_rule",
    description: "Create DHIS2 program rules from schema-compliant objects. Requires a parent program.",
    schema: Dhis2Schemas.ProgramRule,
    metadataType: "programRules",
    parseDescription: (description: string) => {
        const { name, properties } = parseNaturalLanguageDescription(description);
        properties.programRuleActions = [];
        return { name, properties };
    }
});

export const createDhis2ProgramIndicator = createDhis2ResourceTool({
    name: "create_dhis2_program_indicator",
    description: "Create DHIS2 program indicators from schema-compliant objects. Requires a parent program.",
    schema: Dhis2Schemas.ProgramIndicator,
    metadataType: "programIndicators",
    parseDescription: (description: string) => {
        const { name, properties } = parseNaturalLanguageDescription(description);
        properties.displayInForm = false;
        properties.analyticsType = 'EVENT';
        return { name, properties };
    }
});

// Dashboard Items
export const createDhis2DashboardItem = createDhis2ResourceTool({
    name: "create_dhis2_dashboard_item",
    description: "Create DHIS2 dashboard items from schema-compliant objects. Requires a parent dashboard.",
    schema: Dhis2Schemas.DashboardItem,
    metadataType: "dashboardItems",
    parseDescription: (description: string) => {
        const { name, properties } = parseNaturalLanguageDescription(description);
        return { name, properties };
    }
});

// DataValue Tool (special read-only tool)
export const getDhis2DataValues = tool(
    async ({ dataElementIds, period, orgUnits }: {
        dataElementIds: string[];
        period: string;
        orgUnits: string[];
    }) => {
        try {
            // This would fetch data values - special case as it's data, not metadata
            return JSON.stringify({ success: false, message: "DataValue retrieval not implemented - this is raw data, not metadata" });
        } catch (error) {
            return JSON.stringify({ success: false, error: error.message });
        }
    },
    {
        name: "get_dhis2_data_values",
        description: "Retrieve DHIS2 data values for specific data elements, periods, and organisation units",
        schema: z.object({
            dataElementIds: z.array(z.string()).describe("Array of data element IDs"),
            period: z.string().describe("Period identifier"),
            orgUnits: z.array(z.string()).describe("Array of organisation unit IDs"),
        }),
    }
);

// Tracker Event Relationship Tools
export const createDhis2TrackedEntityInstance = tool(
    async ({ resource }: { resource: any }) => {
        try {
            // Special handling for tracker entities with relationships
            const result = await createDhis2Metadata('trackedEntityInstances', [resource]);
            return JSON.stringify({ success: true, result });
        } catch (error) {
            return JSON.stringify({ success: false, error: error.message });
        }
    },
    {
        name: "create_dhis2_tracked_entity_instance",
        description: "Create DHIS2 tracked entity instances with relationships",
        schema: z.object({
            resource: Dhis2Schemas.TrackedEntityInstance.describe("Tracked entity instance object"),
        }),
    }
);

export const createDhis2Enrollment = tool(
    async ({ resource }: { resource: any }) => {
        try {
            const result = await createDhis2Metadata('enrollments', [resource]);
            return JSON.stringify({ success: true, result });
        } catch (error) {
            return JSON.stringify({ success: false, error: error.message });
        }
    },
    {
        name: "create_dhis2_enrollment",
        description: "Create DHIS2 enrollments",
        schema: z.object({
            resource: Dhis2Schemas.Enrollment.describe("Enrollment object"),
        }),
    }
);

export const createDhis2Event = tool(
    async ({ resource }: { resource: any }) => {
        try {
            const result = await createDhis2Metadata('events', [resource]);
            return JSON.stringify({ success: true, result });
        } catch (error) {
            return JSON.stringify({ success: false, error: error.message });
        }
    },
    {
        name: "create_dhis2_event",
        description: "Create DHIS2 events",
        schema: z.object({
            resource: Dhis2Schemas.Event.describe("Event object"),
        }),
    }
);



// =============================================================================
// LLM-FIRST TOOLS - NEW ARCHITECTURE
// Pure tool calling: LLM handles all NL processing and parameter extraction
// =============================================================================

// TODO: Migrate ALL tools to LLM-first architecture (replace all existing tools below)

// LLM-First Creation Tools (new standard - LLM handles all NL processing)
export const createDhis2Option = createLLMFirstTool({
    name: "create_dhis2_option",
    description: "Create individual DHIS2 option values like 'Yes', 'No', 'Male', 'Female', 'High', 'Low', 'Positive', 'Negative'. Use for option values that appear in dropdown lists, not for creating data collection fields. Examples: create option 'Agreed', create option 'Critical Priority'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the option value"),
        displayName: z.string().optional().describe("Display name (defaults to name)"),
        shortName: z.string().optional().describe("Short name (defaults to name)"),
        code: z.string().optional().describe("Optional unique code - if not provided, automatically generated from the name (e.g. 'Agreed' becomes 'AGREED')"),
        sortOrder: z.number().int().min(1).describe("Sort order for the option (must be >= 1)")
    }),
    metadataType: "options",
    dhis2SchemaName: "Option", // Validates against actual DHIS2 Option schema
});

export const createDhis2DataElement = createLLMFirstTool({
    name: "create_dhis2_data_element",
    description: "Create DHIS2 data elements that collect data values. Data elements are fields in forms that store measurable data like numbers, text, dates, or selections from option sets. Examples: 'HIV test result (Yes/No)', 'Number of patients', 'Age in years', 'Registration date'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the data element"),
        valueType: z.enum(['TEXT', 'NUMBER', 'INTEGER', 'BOOLEAN', 'DATE', 'DATETIME']).default('TEXT').describe("The data type"),
        domainType: z.enum(['AGGREGATE', 'TRACKER']).default('AGGREGATE').describe("Domain type"),
        aggregationType: z.enum(['SUM', 'AVERAGE', 'COUNT', 'NONE']).optional().describe("How values are aggregated"),
        description: z.string().optional().describe("Description of the data element"),
        zeroIsSignificant: z.boolean().default(true).describe("Whether zero values are significant")
    }),
    metadataType: "dataElements",
    dhis2SchemaName: "DataElement", // Validates against actual DHIS2 DataElement schema
    dependencies: [
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
    ]
});

export const createDhis2OptionSet = createLLMFirstTool({
    name: "create_dhis2_option_set",
    description: "Create DHIS2 option sets that define dropdown lists for data elements. Option sets contain multiple mutually exclusive options. Examples: 'Sex (Male/Female)', 'Vaccine Types', 'Blood Groups (A/B/AB/O)', 'Yes/No/Maybe'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the option set"),
        description: z.string().optional().describe("Description of what this option set represents"),
        valueType: z.enum(['TEXT', 'NUMBER']).default('TEXT').describe("The data type - TEXT for text options, NUMBER for numeric codes")
    }),
    metadataType: "optionSets",
    dhis2SchemaName: "OptionSet" // Validates against actual DHIS2 OptionSet schema
});

export const createDhis2IndicatorType = createLLMFirstTool({
    name: "create_dhis2_indicator_type",
    description: "Create DHIS2 indicator types that define how indicator calculations are performed (counting vs percentage vs average). These specify the mathematical operations for indicators. Examples: 'Percentage', 'Count', 'Average', 'Ratio'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the indicator type"),
        description: z.string().optional().describe("Description of the indicator calculation method"),
        factor: z.number().int().default(1).describe("Number of decimal places to display (typically 1 for percentages)"),
        number: z.boolean().default(false).describe("Whether the result is treated as a number (false for percentages)")
    }),
    metadataType: "indicatorTypes",
    dhis2SchemaName: "IndicatorType" // Validates against actual DHIS2 IndicatorType schema
});

// Export all tools
export const Dhis2StructuredTools = {
    // Creation tools - Core
    createDhis2DataElement,
    createDhis2OrganisationUnit,
    createDhis2Category,
    createDhis2CategoryCombo,
    createDhis2CategoryOption,
    createDhis2DataSet,
    createDhis2OrganisationUnitGroup,
    createDhis2OrganisationUnitGroupSet,
    createDhis2Program,
    createDhis2TrackedEntityType,
    createDhis2TrackedEntityAttribute,
    createDhis2ProgramStage,
    createDhis2ProgramRule,
    createDhis2ProgramIndicator,
    createDhis2Indicator,
    createDhis2IndicatorType,
    createDhis2ValidationRule,
    createDhis2Option,
    createDhis2OptionSet,
    createDhis2Visualization,
    createDhis2Dashboard,
    createDhis2DashboardItem,
    createDhis2TrackedEntityInstance,
    createDhis2Enrollment,
    createDhis2Event,

    // Update tools - Core
    updateDhis2DataElement,
    updateDhis2OrganisationUnit,
    updateDhis2Category,
    updateDhis2CategoryCombo,
    updateDhis2CategoryOption,
    updateDhis2DataSet,
    updateDhis2OrganisationUnitGroup,
    updateDhis2OrganisationUnitGroupSet,
    updateDhis2Program,
    updateDhis2TrackedEntityType,
    updateDhis2TrackedEntityAttribute,
    updateDhis2Indicator,
    updateDhis2IndicatorType,
    updateDhis2ValidationRule,
    updateDhis2OptionSet,
    updateDhis2Visualization,
    updateDhis2Dashboard,

    // Aggregated metadata creation tool
    createDhis2AggregatedMetadata,

    // Complex form creation tool
    createDhis2ReportingForm,

    // Data retrieval tools
    getDhis2DataValues,

    // Search tools - Existing
    searchDhis2DataElements,
    searchDhis2OrganisationUnits,
    searchDhis2Categories,
    searchDhis2CategoryCombos,
    searchDhis2DataSets,
    searchDhis2Programs,
    searchDhis2Indicators,

    // Get by ID tools - Existing
    getDhis2DataElementById,
    getDhis2OrganisationUnitById,
    getDhis2CategoryById,
    getDhis2DataSetById,
    getDhis2ProgramById,
};
