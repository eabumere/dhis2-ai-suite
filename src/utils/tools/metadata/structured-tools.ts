import { createDhis2GetByIdTool, createDhis2SearchTool, createDhis2UpdateTool, createLLMFirstTool } from './base-tool';
import { Dhis2Schemas } from './schemas';
import {
    addResourceToContext,
    createDhis2Metadata,
    createDhis2MetadataAggregated,
    createDhis2MetadataDirect,
    generateDataElementFromExpression,
    generateDhis2Code,
    generateDhis2Id,
    parseExpressionForDataElements,
    parseNaturalLanguageDescription,
    searchDhis2Metadata
} from './helpers';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';


// OrganisationUnit Tool - REMOVED (LLM-first version exists below)

// =============================================================================
// LLM-FIRST TOOLS - NEW ARCHITECTURE
// Pure tool calling: LLM selects tool + extracts parameters from schema
// =============================================================================

export const createDhis2Category = createLLMFirstTool({
    name: "create_dhis2_category",
    description: "Create DHIS2 categories that define disaggregation dimensions for data collection. Categories organize your data by dividing it into subgroups like Age categories ('<5', '5-14', '>14') or Gender categories ('Male', 'Female'). Categories require at least one category option and are created with separate option entities.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the data disaggregation category"),
        categoryOptions: z.array(z.string()).min(1).describe("List of category options like ['Male', 'Female'] or ['Urban', 'Rural']"),
        dataDimension: z.boolean().default(true).describe("Whether this category can be used in data analysis"),
        dataDimensionType: z.enum(['DISAGGREGATION', 'ATTRIBUTE']).default('DISAGGREGATION').describe("Whether this category is for data disaggregation or attribute-based categorization")
    }),
    metadataType: "categories",
    dhis2SchemaName: "Category",
    preparePayload: async (input) => {
        const { name, categoryOptions, dataDimension = true, dataDimensionType = 'DISAGGREGATION' } = input;

        // Generate category ID
        const categoryId = await generateDhis2Id();

        // Generate option IDs and create option entities
        const optionIds = await Promise.all(
            categoryOptions.map(async () => await generateDhis2Id())
        );

        // Build aggregated payload for both categories and category options
        return {
            categories: [{
                id: categoryId,
                name: name,
                displayName: name,
                shortName: name.length > 50 ? name.substring(0, 47) + '...' : name,
                code: generateDhis2Code(name),
                dataDimension: dataDimension,
                dataDimensionType: dataDimensionType,
                categoryOptions: optionIds.map((optionId: string) => ({ id: optionId }))
            }],
            categoryOptions: categoryOptions.map((optionName: string, index: number) => ({
                id: optionIds[index],
                name: optionName,
                displayName: optionName,
                shortName: optionName.length > 50 ? optionName.substring(0, 47) + '...' : optionName,
                code: generateDhis2Code(optionName),
                sortOrder: index + 1
            }))
        };
    }
});

export const createDhis2CategoryCombo = createLLMFirstTool({
    name: "create_dhis2_category_combo",
    description: "Create DHIS2 category combinations that combine multiple categories for complex disaggregation. For example, combine Age and Gender categories to get Age x Gender breakdowns. Requires at least one category.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the category combination"),
        categories: z.array(z.string()).min(1).describe("List of category names to combine")
    }),
    metadataType: "categoryCombos",
    dhis2SchemaName: "CategoryCombo",
    preparePayload: async (input) => {
        const { categories: categoryNames, ...otherInput } = input;

        // Resolve category names to category objects with IDs
        const resolvedCategories: Array<{ id: string }> = [];

        for (const categoryName of categoryNames) {
            try {
                // Search for existing category by name (exact match preferred)
                const searchResults = await searchDhis2Metadata('categories', categoryName, 10);

                let categoryId: string;

                // First check for exact name match
                const exactMatch = searchResults.find((cat: any) => cat.name === categoryName);

                if (exactMatch) {
                    // Found existing category with exact name match
                    categoryId = exactMatch.id;
                    console.log(`Found existing category "${categoryName}" with ID: ${categoryId}`);
                } else {
                    // No exact match found - create a new category with appropriate options
                    console.log(`No exact match for "${categoryName}". Attempting to create new category.`);

                    // Generate default options based on common category types
                    let defaultOptions: string[] = [];
                    if (categoryName.toLowerCase() === 'age' || categoryName.toLowerCase() === 'age groups') {
                        defaultOptions = ['<5 years', '5-14 years', '15-49 years', '50+ years'];
                    } else if (categoryName.toLowerCase() === 'gender' || categoryName.toLowerCase() === 'sex') {
                        defaultOptions = ['Male', 'Female'];
                    } else {
                        // Generic fallback - this shouldn't happen but provides some options
                        defaultOptions = ['Option 1', 'Option 2'];
                    }

                    // Create the category using the existing aggregated category creation approach
                    const newCategoryId = await generateDhis2Id();
                    const optionIds = await Promise.all(
                        defaultOptions.map(async () => await generateDhis2Id())
                    );

                    // Build aggregated payload for the new category and category options
                    const newCategoryPayload = {
                        categories: [{
                            id: newCategoryId,  // UID for ID field
                            name: categoryName,  // User-provided category name for name field
                            displayName: categoryName,
                            shortName: categoryName.length > 50 ? categoryName.substring(0, 47) + '...' : categoryName,
                            code: generateDhis2Code(categoryName),
                            dataDimension: true,
                            dataDimensionType: 'DISAGGREGATION',
                            categoryOptions: optionIds.map((optionId: string) => ({ id: optionId }))
                        }],
                        categoryOptions: defaultOptions.map((optionName: string, index: number) => ({
                            id: optionIds[index],  // UID for ID field
                            name: optionName,       // User-provided option name for name field
                            displayName: optionName,
                            shortName: optionName.length > 50 ? optionName.substring(0, 47) + '...' : optionName,
                            code: generateDhis2Code(optionName),
                            sortOrder: index + 1
                        }))
                    };

                    // Create the category
                    const categoryResult = await createDhis2MetadataAggregated(newCategoryPayload);
                    if (categoryResult.results.some(r => r.type === 'categories' && r.created)) {
                        categoryId = newCategoryId;
                        console.log(`Successfully created new category "${categoryName}" with options: ${defaultOptions.join(', ')}`);
                    } else {
                        throw new Error(`Failed to create category "${categoryName}"`);
                    }
                }

                resolvedCategories.push({ id: categoryId });
            } catch (error) {
                console.error(`Error resolving category "${categoryName}":`, error);
                throw new Error(`Failed to resolve category "${categoryName}": ${error.message}`);
            }
        }

        // Return the transformed payload with categories as objects with IDs
        return {
            ...otherInput,
            categories: resolvedCategories,
            dataDimensionType: 'DISAGGREGATION' // Ensure proper dataDimensionType
        };
    },
    dependencies: [
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
    ]
});

export const createDhis2DataSet = createLLMFirstTool({
    name: "create_dhis2_data_set",
    description: "Create DHIS2 data sets that define reporting forms and data collection templates. Data sets specify what indicators are collected, the reporting frequency, and which organisation units submit the data. Examples: 'Monthly Immunization Report', 'Quarterly Financial Summary', 'Weekly Surveillance Data'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the data set/reporting form"),
        description: z.string().optional().describe("Description of what this data set collects"),
        periodType: z.enum(['Daily', 'Weekly', 'Monthly', 'Quarterly', 'SixMonthly', 'Yearly', 'FinancialApril', 'FinancialJuly', 'FinancialOct']).default('Monthly').describe("How often data is reported"),
        categoryComboName: z.string().optional().describe("Name of category combination to use for disaggregation (e.g., 'Age and Gender'). If not specified, uses a default category combination.")
    }),
    metadataType: "dataSets",
    dhis2SchemaName: "DataSet",
    preparePayload: async (input) => {
        let result = { ...input };

        // If category combo name is specified, resolve it to category combo ID
        if (result.categoryComboName) {
            try {
                const searchResults = await searchDhis2Metadata('categoryCombos', result.categoryComboName, 10);

                const exactMatch = searchResults.find((combo: any) =>
                    combo.name.toLowerCase() === result.categoryComboName!.toLowerCase()
                ) || searchResults[0];

                if (exactMatch) {
                    result.categoryCombo = { id: exactMatch.id };
                    console.log(`Resolved category combo "${result.categoryComboName}" to ID: ${exactMatch.id}`);
                } else {
                    console.warn(`Category combo "${result.categoryComboName}" not found. Dataset will use default category combo.`);
                }
            } catch (error) {
                console.warn(`Failed to resolve category combo "${result.categoryComboName}":`, error);
            }
        }

        return result;
    },
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

export const createDhis2Program = createLLMFirstTool({
    name: "create_dhis2_program",
    description: "Create DHIS2 programs that define tracker or event-based data collection workflows. Programs are the top-level containers for tracker entities and their enrollment/enrollment processes. Examples: 'HIV Care Program', 'Tuberculosis Case Surveillance', 'Malaria Elimination Initiative'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the program/workflow"),
        description: z.string().optional().describe("Description of the program's purpose and scope"),
        programType: z.enum(['WITH_REGISTRATION', 'WITHOUT_REGISTRATION']).default('WITH_REGISTRATION').describe("WITH_REGISTRATION for tracker programs tracking individual entities over time, WITHOUT_REGISTRATION for event-only programs"),
        version: z.number().int().min(1).default(1).describe("Version number of the program")
    }),
    metadataType: "programs",
    dhis2SchemaName: "Program"
});



export const createDhis2IndicatorAdvanced = createLLMFirstTool({
    name: "create_dhis2_indicator_simple",
    description: "Create DHIS2 indicators that calculate performance measures and KPIs from data. Indicators perform mathematical calculations on data values to produce meaningful metrics like coverage rates, completion percentages, or averages. Choose this tool for simple indicators with direct parameter specification. Examples: 'HIV Testing Coverage', 'Vaccination Rate', 'Treatment Success Rate'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the indicator/performance measure"),
        description: z.string().optional().describe("Description of what this indicator measures"),
        numeratorExpression: z.string().min(1).describe("Mathematical expression for the numerator (e.g., '#{HIV_Tests_Completed}')"),
        denominatorExpression: z.string().min(1).describe("Mathematical expression for the denominator (e.g., '#{Target_Population}')"),
        annualized: z.boolean().default(false).describe("Whether this is an annualized indicator"),
        indicatorTypeId: z.string().optional().describe("ID of indicator type to use (specifies calculation method like percentage/count/etc)")
    }),
    metadataType: "indicators",
    dhis2SchemaName: "Indicator"
});

export const createDhis2Indicator = createDhis2IndicatorAdvanced; // Main export uses the simple LLM-first version

// Search Tools
export const searchDhis2DataElements = createDhis2SearchTool("dataElements", "Data Elements");
export const searchDhis2OrganisationUnits = createDhis2SearchTool("organisationUnits", "Organisation Units");
export const searchDhis2Categories = createDhis2SearchTool("categories", "Categories");
export const searchDhis2CategoryCombos = createDhis2SearchTool("categoryCombos", "Category Combinations");
export const searchDhis2CategoryOptions = createDhis2SearchTool("categoryOptions", "Category Options");
export const searchDhis2OrganisationUnitGroups = createDhis2SearchTool("organisationUnitGroups", "Organisation Unit Groups");
export const searchDhis2OrganisationUnitGroupSets = createDhis2SearchTool("organisationUnitGroupSets", "Organisation Unit Group Sets");
export const searchDhis2DataSets = createDhis2SearchTool("dataSets", "Data Sets");
export const searchDhis2Programs = createDhis2SearchTool("programs", "Programs");
export const searchDhis2TrackedEntityTypes = createDhis2SearchTool("trackedEntityTypes", "Tracked Entity Types");
export const searchDhis2TrackedEntityAttributes = createDhis2SearchTool("trackedEntityAttributes", "Tracked Entity Attributes");
export const searchDhis2Validations = createDhis2SearchTool("validationRules", "Validation Rules");
export const searchDhis2OptionSets = createDhis2SearchTool("optionSets", "Option Sets");
export const searchDhis2Indicators = createDhis2SearchTool("indicators", "Indicators");
export const searchDhis2Visualizations = createDhis2SearchTool("visualizations", "Visualizations");
export const searchDhis2Dashboards = createDhis2SearchTool("dashboards", "Dashboards");
export const searchDhis2Users = createDhis2SearchTool("users", "Users");
export const searchDhis2RelationshipTypes = createDhis2SearchTool("relationshipTypes", "Relationship Types");

// Update Relationship Tools
export const updateDhis2RelationshipType = createDhis2UpdateTool({
    name: "update_dhis2_relationship_type",
    description: "Update DHIS2 relationship types using schema-compliant properties",
    schema: Dhis2Schemas.RelationshipType,
    metadataType: "relationshipTypes",
});

export const updateDhis2Relationship = createDhis2UpdateTool({
    name: "update_dhis2_relationship",
    description: "Update DHIS2 relationships using schema-compliant properties",
    schema: Dhis2Schemas.Relationship,
    metadataType: "relationships",
});

// Get by ID Tools
export const getDhis2DataElementById = createDhis2GetByIdTool("dataElements", "Data Element");
export const getDhis2RelationshipTypeById = createDhis2GetByIdTool("relationshipTypes", "Relationship Type");
export const getDhis2OrganisationUnitById = createDhis2GetByIdTool("organisationUnits", "Organisation Unit");
export const getDhis2CategoryById = createDhis2GetByIdTool("categories", "Category");
export const getDhis2CategoryOptionById = createDhis2GetByIdTool("categoryOptions", "Category Option");
export const getDhis2OrganisationUnitGroupById = createDhis2GetByIdTool("organisationUnitGroups", "Organisation Unit Group");
export const getDhis2OrganisationUnitGroupSetById = createDhis2GetByIdTool("organisationUnitGroupSets", "Organisation Unit Group Set");
export const getDhis2DataSetById = createDhis2GetByIdTool("dataSets", "Data Set");
export const getDhis2ProgramById = createDhis2GetByIdTool("programs", "Program");
export const getDhis2TrackedEntityTypeById = createDhis2GetByIdTool("trackedEntityTypes", "Tracked Entity Type");
export const getDhis2TrackedEntityAttributeById = createDhis2GetByIdTool("trackedEntityAttributes", "Tracked Entity Attribute");
export const getDhis2ValidationRuleById = createDhis2GetByIdTool("validationRules", "Validation Rule");
export const getDhis2OptionSetById = createDhis2GetByIdTool("optionSets", "Option Set");
export const getDhis2IndicatorById = createDhis2GetByIdTool("indicators", "Indicator");
export const getDhis2VisualizationById = createDhis2GetByIdTool("visualizations", "Visualization");
export const getDhis2DashboardById = createDhis2GetByIdTool("dashboards", "Dashboard");

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
        'updateDhis2Option',
        'updateDhis2OptionSet',
        'updateDhis2TrackedEntityInstance',
        'updateDhis2Enrollment',
        'updateDhis2Event',
        'updateDhis2User'
    ],
    search: [
        'searchDhis2DataElements',
        'searchDhis2OrganisationUnits',
        'searchDhis2Categories',
        'searchDhis2CategoryCombos',
        'searchDhis2DataSets',
        'searchDhis2Programs',
        'searchDhis2Indicators',
        'searchDhis2Users'
    ],
    getById: [
        'getDhis2DataElementById',
        'getDhis2OrganisationUnitById',
        'getDhis2CategoryById',
        'getDhis2DataSetById',
        'getDhis2ProgramById'
    ]
};

// REMOVED: Direct CRUD Tools for Top-level Entities - replaced with LLM-first versions below

export const updateDhis2Option = createDhis2UpdateTool({
    name: "update_dhis2_option",
    description: "Update DHIS2 option values using schema-compliant properties",
    schema: Dhis2Schemas.Option,
    metadataType: "options",
});

export const updateDhis2TrackedEntityInstance = createDhis2UpdateTool({
    name: "update_dhis2_tracked_entity_instance",
    description: "Update DHIS2 tracked entity instances using schema-compliant properties",
    schema: Dhis2Schemas.TrackedEntityInstance,
    metadataType: "trackedEntityInstances",
});

export const updateDhis2Enrollment = createDhis2UpdateTool({
    name: "update_dhis2_enrollment",
    description: "Update DHIS2 enrollments using schema-compliant properties",
    schema: Dhis2Schemas.Enrollment,
    metadataType: "enrollments",
});

export const updateDhis2Event = createDhis2UpdateTool({
    name: "update_dhis2_event",
    description: "Update DHIS2 events using schema-compliant properties",
    schema: Dhis2Schemas.Event,
    metadataType: "events",
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

export const createDhis2Visualization = createLLMFirstTool({
    name: "create_dhis2_visualization",
    description: "Create DHIS2 visualizations (charts and data visualizations) that display data from DHIS2 for analysis and monitoring. Visualizations can show trends, comparisons, and patterns in health data. Examples: 'Monthly Malaria Cases Trend', 'Immunization Coverage by District', 'HIV Testing Monthly Bar Chart'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the visualization/chart"),
        description: z.string().optional().describe("Description of what this visualization shows"),
        visualizationType: z.enum(['COLUMN', 'BAR', 'LINE', 'PIE', 'AREA', 'SINGLE_VALUE', 'PIVOT_TABLE']).default('COLUMN').describe("The type of chart or visualization"),
        dataElementIds: z.array(z.string()).min(1).describe("Array of data element IDs to include in the visualization")
    }),
    metadataType: "visualizations",
    dhis2SchemaName: "Visualization"
});

export const updateDhis2Visualization = createDhis2UpdateTool({
    name: "update_dhis2_visualization",
    description: "Update DHIS2 visualizations using schema-compliant properties",
    schema: Dhis2Schemas.Visualization,
    metadataType: "visualizations",
});

export const createDhis2Dashboard = createLLMFirstTool({
    name: "create_dhis2_dashboard",
    description: "Create DHIS2 dashboards that organize and display visualizations, charts, reports, and other analytical content for users to monitor health data and KPIs. Dashboards are the main interface for data analysis and decision-making. Examples: 'National Malaria Dashboard', 'Facility Performance Overview', 'COVID-19 Monitoring Board'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the dashboard"),
        description: z.string().optional().describe("Description of what this dashboard is used for")
    }),
    metadataType: "dashboards",
    dhis2SchemaName: "Dashboard",
    dependencies: [
        {
            type: "users",
            name: "default",
            createIfNotFound: true,
            createParams: {
                username: "default",
                firstName: "Default",
                surname: "User",
                userCredentials: {
                    username: "default",
                    disabled: false
                }
            }
        }
    ]
});

export const updateDhis2ProgramStage = createDhis2UpdateTool({
    name: "update_dhis2_program_stage",
    description: "Update DHIS2 program stages using schema-compliant properties",
    schema: Dhis2Schemas.ProgramStage,
    metadataType: "programStages",
});

export const updateDhis2ProgramRule = createDhis2UpdateTool({
    name: "update_dhis2_program_rule",
    description: "Update DHIS2 program rules using schema-compliant properties",
    schema: Dhis2Schemas.ProgramRule,
    metadataType: "programRules",
});

export const updateDhis2ProgramIndicator = createDhis2UpdateTool({
    name: "update_dhis2_program_indicator",
    description: "Update DHIS2 program indicators using schema-compliant properties",
    schema: Dhis2Schemas.ProgramIndicator,
    metadataType: "programIndicators",
});

export const updateDhis2DashboardItem = createDhis2UpdateTool({
    name: "update_dhis2_dashboard_item",
    description: "Update DHIS2 dashboard items using schema-compliant properties",
    schema: Dhis2Schemas.DashboardItem,
    metadataType: "dashboardItems",
});

export const updateDhis2User = createDhis2UpdateTool({
    name: "update_dhis2_user",
    description: "Update DHIS2 user accounts using schema-compliant properties",
    schema: Dhis2Schemas.User,
    metadataType: "users",
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
                code: generateDhis2Code(option),
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
                code: generateDhis2Code(option),
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

// REMOVED: Migration completed - now using LLM-first version above

    // REMOVED: Migration completed - legacy tools replaced with LLM-first versions above

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

export const createDhis2User = createLLMFirstTool({
    name: "create_dhis2_user",
    description: "Create DHIS2 user accounts with profile information, organisation unit assignments, and role-based access. Users are the primary accounts for accessing and managing DHIS2 systems. Examples: 'Create system administrator user', 'Add data entry clerk', 'Setup regional manager account'.",
    schema: z.object({
        username: z.string().min(1).describe("Unique username for login (must be unique across the system)"),
        firstName: z.string().min(1).describe("User's first name"),
        surname: z.string().min(1).describe("User's surname/family name"),
        email: z.string().email().optional().describe("User's email address for notifications"),
        phoneNumber: z.string().optional().describe("User's phone number (optional)"),
        organisationUnitIds: z.array(z.string()).min(1).describe("Array of organisation unit IDs where user has access"),
        userRoleNames: z.array(z.string()).optional().describe("Names of user roles to assign (leave empty for no roles - user will have limited access)")
    }),
    metadataType: "users",
    dhis2SchemaName: "User",
    dependencies: [
        {
            type: "userCredentials",
            name: "auto_generated",
            createIfNotFound: false, // UserCredentials are always created with User
            createParams: {
                disabled: false,
                twoFA: false,
                externalAuth: false,
                userRoles: []
            }
        }
    ]
});

// Relationship Type Tool - LLM-first versions
export const createDhis2RelationshipType = createLLMFirstTool({
    name: "create_dhis2_relationship_type",
    description: "Create DHIS2 relationship types that define how tracked entities can be linked together. Relationship types specify directional or bidirectional connections between entities like parent-child, referral-supervision, or treatment-partnership relationships. Examples: 'Mother-Child Referral', 'Household Member', 'Health Facility Referral Network'.",
    schema: z.object({
        name: z.string().min(1).describe("Descriptive name for this relationship type"),
        fromToName: z.string().min(1).describe("Name of the relationship when viewed from source to target (e.g., 'Refers to')"),
        toFromName: z.string().min(1).describe("Name of the relationship when viewed from target to source (e.g., 'Referred by')"),
        bidirectional: z.boolean().default(false).describe("Whether this relationship works both directions (true) or only one way (false)")
    }),
    metadataType: "relationshipTypes",
    dhis2SchemaName: "RelationshipType",
});

// Relationship Tool (uses direct CRUD pattern due to relationship complexity)
export const createDhis2Relationship = tool(
    async ({
        relationshipTypeId,
        fromEntityId,
        toEntityId,
        fromEntityType = "trackedEntityInstance",
        toEntityType = "trackedEntityInstance",
        fromEnrollmentId,
        toEnrollmentId,
        fromEventId,
        toEventId
    }: {
        relationshipTypeId: string;
        fromEntityId: string;
        toEntityId: string;
        fromEntityType?: string;
        toEntityType?: string;
        fromEnrollmentId?: string;
        toEnrollmentId?: string;
        fromEventId?: string;
        toEventId?: string;
    }) => {
        try {
            // Build relationship payload based on entity types
            const relationshipPayload = {
                relationshipType: { id: relationshipTypeId },
                from: {
                    [fromEntityType]: { id: fromEntityId },
                    ...(fromEnrollmentId && { enrollment: { id: fromEnrollmentId } }),
                    ...(fromEventId && { event: { id: fromEventId } })
                },
                to: {
                    [toEntityType]: { id: toEntityId },
                    ...(toEnrollmentId && { enrollment: { id: toEnrollmentId } }),
                    ...(toEventId && { event: { id: toEventId } })
                }
            };

            const result = await createDhis2Metadata('relationships', [relationshipPayload]);

            if (result.success && result.created?.[0]) {
                // Add relationship to context
                addResourceToContext(result.created[0].id!, 'relationships', `Relationship ${relationshipTypeId}`, 'created');
            }

            return JSON.stringify({
                success: true,
                message: `Created relationship between ${fromEntityType}:${fromEntityId} -> ${toEntityType}:${toEntityId}`,
                relationshipId: result.created?.[0]?.id,
                relationshipTypeId,
                fromEntityType,
                toEntityType
            });
        } catch (error) {
            console.error('Error creating relationship:', error);
            return JSON.stringify({
                success: false,
                error: `Failed to create relationship: ${error.message}`
            });
        }
    },
    {
        name: "create_dhis2_relationship",
        description: "Create DHIS2 relationships between tracked entities, enrollments, or events using predefined relationship types. Links entities in tracker systems for referral networks, family relationships, supervision hierarchies, or multi-entity workflows. Examples: link patient to primary care facility, connect household members, define supervision relationships.",
        schema: z.object({
            relationshipTypeId: z.string().describe("ID of the relationship type defining this connection"),
            fromEntityId: z.string().describe("ID of the source entity (tracked entity, enrollment, or event)"),
            toEntityId: z.string().describe("ID of the target entity being linked to"),
            fromEntityType: z.enum(["trackedEntityInstance", "enrollment", "event"]).default("trackedEntityInstance").describe("Type of source entity"),
            toEntityType: z.enum(["trackedEntityInstance", "enrollment", "event"]).default("trackedEntityInstance").describe("Type of target entity"),
            fromEnrollmentId: z.string().optional().describe("If fromEntity is enrollment or event, provide enrollment ID"),
            toEnrollmentId: z.string().optional().describe("If toEntity is enrollment or event, provide enrollment ID"),
            fromEventId: z.string().optional().describe("If fromEntity is event, provide specific event ID"),
            toEventId: z.string().optional().describe("If toEntity is event, provide specific event ID")
        })
    }
);

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
        zeroIsSignificant: z.boolean().default(true).describe("Whether zero values are significant"),
        categoryCombo: z.object({
            id: z.string()
        }).optional().describe("Category combination reference for disaggregation. Specify as { id: 'category-combo-uid' }")
    }),
    metadataType: "dataElements",
    dhis2SchemaName: "DataElement" // Validates against actual DHIS2 DataElement schema
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

export const createDhis2CategoryOption = createLLMFirstTool({
    name: "create_dhis2_category_option",
    description: "Create DHIS2 category options that define the individual values within a category. Category options are the actual choices users make when reporting data. Examples: 'Male', 'Female' for Sex category; '0-14', '15-49', '50+' for Age Groups; 'Urban', 'Rural' for Location type.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the category option value"),
        displayName: z.string().optional().describe("Display name (defaults to name)"),
        shortName: z.string().optional().describe("Short name (defaults to name, max 50 chars)")
    }),
    metadataType: "categoryOptions",
    dhis2SchemaName: "CategoryOption"
});

export const createDhis2OrganisationUnit = createLLMFirstTool({
    name: "create_dhis2_organisation_unit",
    description: "Create DHIS2 organisation units for geographic/administrative hierarchy. These represent facilities, regions, and administrative divisions in your health system. Examples: 'Country Hospital', 'Region A', 'District Clinic', 'National Ministry'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the organisation unit"),
        code: z.string().optional().describe("Unique code for the organization unit (e.g., 'SCC_2024', 'HC001')"),
        level: z.number().int().min(1).max(5).default(1).describe("Administrative level in hierarchy (1=country, 2=province/state, 3=district, 4=sub-district, 5=facility)"),
        openingDate: z.string().optional().describe("Date when the facility opened (ISO format, e.g., '2024-06-01')"),
        path: z.string().optional().describe("Full hierarchical path (auto-generated from parent if not provided)"),
        parentId: z.string().optional().describe("ID of the parent organisation unit (used to build hierarchy)"),
        parentName: z.string().optional().describe("Name of the parent organisation unit to search and link to")
    }),
    metadataType: "organisationUnits",
    dhis2SchemaName: "OrganisationUnit", // Validates against actual DHIS2 OrganisationUnit schema
    preparePayload: async (input) => {
        // Start with all original input - comprehensive copy
        let result = { ...input };

        // Auto-generate opening date if not provided
        if (!result.openingDate) {
            result.openingDate = new Date().toISOString().split('T')[0];
        }

        // Try to auto-resolve parent if none specified and level > 1
        if (!result.parentId && !result.parentName && (result.level || 1) > 1) {
            try {
                const level = result.level || 1;
                const parentLevel = level - 1;

                const searchResults = await searchDhis2Metadata('organisationUnits', '', 100) as any[];
                const potentialParents = searchResults.filter((org: any) => org.level === parentLevel);

                if (potentialParents.length > 0) {
                    const selectedParent = potentialParents[0];
                    result.parentId = selectedParent.id;
                    result.path = selectedParent.path ? `${selectedParent.path}/${await generateDhis2Id()}` : `/${selectedParent.id}/${await generateDhis2Id()}`;

                    console.log(`Auto-selected parent organisation: ${selectedParent.name} (${selectedParent.id}) at level ${parentLevel} for child at level ${result.level}`);
                } else {
                    console.warn(`No parent organisations found at level ${parentLevel} for creating child at level ${result.level}`);
                }
            } catch (error) {
                console.warn('Failed to search for parent organisation units:', error);
            }
        }

        // Try to resolve parent by name if specified
        if (!result.parentId && result.parentName) {
            try {
                const searchResults = await searchDhis2Metadata('organisationUnits', result.parentName, 10) as any[];
                const matchingParent = searchResults.find((org: any) => org.name === result.parentName);
                if (matchingParent) {
                    result.parentId = matchingParent.id;
                    result.path = matchingParent.path ? `${matchingParent.path}/${await generateDhis2Id()}` : `/${matchingParent.id}/${await generateDhis2Id()}`;
                }
            } catch (error) {
                console.warn(`Failed to find parent organisation "${result.parentName}":`, error);
            }
        }

        // Generate path if still not set
        if (!result.path) {
            result.path = result.parentId ? `/${result.parentId}/${await generateDhis2Id()}` : `/${await generateDhis2Id()}`;
        }

        return result;
    }
});

export const createDhis2OrganisationUnitGroup = createLLMFirstTool({
    name: "create_dhis2_organisation_unit_group",
    description: "Create DHIS2 organisation unit groups to organize facilities into logical collections. These groups are used for reporting, data access control, and analysis. Examples: 'Public Hospitals', 'Rural Clinics', 'Regional Facilities', 'Private Sector'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the organisation unit group"),
        description: z.string().optional().describe("Description of what this group represents"),
        shortName: z.string().min(1).describe("Short name for the group (defaults to name if not provided)")
    }),
    metadataType: "organisationUnitGroups",
    dhis2SchemaName: "OrganisationUnitGroup"
});

export const createDhis2OrganisationUnitGroupSet = createLLMFirstTool({
    name: "create_dhis2_organisation_unit_group_set",
    description: "Create DHIS2 organisation unit group sets to categorize different types of facility groupings. Group sets contain multiple groups and are used for complex access control and classification. Examples: 'Ownership Type' (containing Public/Private groups), 'Facility Tier' (Primary/Secondary/Tertiary), 'Service Level'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the organisation unit group set"),
        description: z.string().optional().describe("Description of the classification system"),
        compulsory: z.boolean().default(false).describe("Whether every org unit must belong to one of the groups"),
        dataDimension: z.boolean().default(true).describe("Whether this group set can be used in data analysis")
    }),
    metadataType: "organisationUnitGroupSets",
    dhis2SchemaName: "OrganisationUnitGroupSet"
});

export const createDhis2TrackedEntityType = createLLMFirstTool({
    name: "create_dhis2_tracked_entity_type",
    description: "Create DHIS2 tracked entity types that define the entities being tracked in tracker programs. These represent individuals, patients, assets, or other objects that have attributes and follow enrollment/enrollment workflows. Examples: 'Person', 'Patient', 'Contact Person', 'Equipment'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the tracked entity type"),
        description: z.string().optional().describe("Description of what this entity represents")
    }),
    metadataType: "trackedEntityTypes",
    dhis2SchemaName: "TrackedEntityType"
});

export const createDhis2TrackedEntityAttribute = createLLMFirstTool({
    name: "create_dhis2_tracked_entity_attribute",
    description: "Create DHIS2 tracked entity attributes that define the properties/fields of tracked entities. These are the characteristics that describe a tracked entity like name, age, phone number, date of birth, etc. Examples: 'First Name', 'Phone Number', 'Date of Birth', 'National ID', 'Blood Type'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the tracked entity attribute"),
        valueType: z.enum(['TEXT', 'NUMBER', 'INTEGER', 'BOOLEAN', 'DATE', 'DATETIME']).default('TEXT').describe("The data type of the attribute"),
        description: z.string().optional().describe("Description of what this attribute represents"),
        mandatory: z.boolean().default(false).describe("Whether this attribute is required"),
        unique: z.boolean().default(false).describe("Whether values must be unique across all entities")
    }),
    metadataType: "trackedEntityAttributes",
    dhis2SchemaName: "TrackedEntityAttribute"
});

export const createDhis2ProgramStage = createLLMFirstTool({
    name: "create_dhis2_program_stage",
    description: "Create DHIS2 program stages that define the steps/phases within a tracker program. Program stages represent different events or visits in a tracked entity's journey. Examples: 'Initial Assessment', 'Follow-up Visit', 'Treatment Phase', 'Discharge'. Each stage can collect specific data and have its own validation rules.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the program stage/visit type"),
        description: z.string().optional().describe("Description of this stage's purpose"),
        programId: z.string().min(1).describe("The ID of the parent program this stage belongs to"),
        minDaysFromStart: z.number().int().min(0).default(0).describe("Minimum days from program start when this stage can occur"),
        repeatable: z.boolean().default(false).describe("Whether this stage can be repeated multiple times")
    }),
    metadataType: "programStages",
    dhis2SchemaName: "ProgramStage"
});

export const createDhis2ProgramRule = createLLMFirstTool({
    name: "create_dhis2_program_rule",
    description: "Create DHIS2 program rules that define conditional logic and automated actions within tracker programs. Program rules enable dynamic behavior like skipping questions, showing warnings, or automatically calculating values based on user input. Examples: 'Skip delivery questions if pregnancy test is negative', 'Show HIV test warning for high-risk patients'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the program rule"),
        description: z.string().optional().describe("Description of the rule's logic and purpose"),
        programId: z.string().min(1).describe("The ID of the program this rule belongs to"),
        condition: z.string().min(1).describe("The condition that triggers the rule (e.g., '#{var} == 1')"),
        priority: z.number().int().min(0).default(0).describe("Rule priority (higher numbers execute first)")
    }),
    metadataType: "programRules",
    dhis2SchemaName: "ProgramRule"
});

export const createDhis2ProgramIndicator = createLLMFirstTool({
    name: "create_dhis2_program_indicator",
    description: "Create DHIS2 program indicators that calculate aggregations and statistics from tracker program data. These indicators perform calculations across enrolled entities, visits, and time periods. Examples: 'Percentage of patients completing treatment', 'Average hospital stay duration', 'Number of high-risk pregnancies this month'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the program indicator"),
        description: z.string().optional().describe("Description of what this indicator measures"),
        programId: z.string().min(1).describe("The ID of the program this indicator analyzes"),
        expression: z.string().min(1).describe("The calculation expression (mathematical formula)"),
        filter: z.string().optional().describe("Optional filter condition to limit which records are included"),
        analyticsType: z.enum(['EVENT', 'ENROLLMENT']).default('EVENT').describe("Whether to analyze at event or enrollment level")
    }),
    metadataType: "programIndicators",
    dhis2SchemaName: "ProgramIndicator"
});

export const createDhis2ValidationRule = createLLMFirstTool({
    name: "create_dhis2_validation_rule",
    description: "Create DHIS2 validation rules that enforce data quality and consistency checks on submitted data. Validation rules compare data across multiple fields and flag errors or warnings. Examples: 'Total males + females should equal total population', 'If HIV test positive, CD4 count must be provided', 'Birth date cannot be in the future'.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the validation rule"),
        description: z.string().optional().describe("Description of the data validation logic"),
        operator: z.enum(['equal_to', 'not_equal_to', 'greater_than', 'greater_than_or_equal_to', 'less_than', 'less_than_or_equal_to']).default('equal_to').describe("The comparison operator"),
        rightSide: z.object({
            expression: z.string().min(1).describe("The right side expression to compare"),
            description: z.string().optional().describe("Description of the right side"),
            missingValueStrategy: z.enum(['NEVER_SKIP', 'SKIP_IF_ANY_VALUE_MISSING', 'SKIP_IF_ALL_VALUES_MISSING']).default('NEVER_SKIP').describe("How to handle missing values")
        }).describe("The right side of the comparison"),
        leftSide: z.object({
            expression: z.string().min(1).describe("The left side expression to compare"),
            description: z.string().optional().describe("Description of the left side"),
            missingValueStrategy: z.enum(['NEVER_SKIP', 'SKIP_IF_ANY_VALUE_MISSING', 'SKIP_IF_ALL_VALUES_MISSING']).default('NEVER_SKIP').describe("How to handle missing values")
        }).describe("The left side of the comparison"),
        importance: z.enum(['HIGH', 'MEDIUM', 'LOW']).default('MEDIUM').describe("Severity level of validation failures")
    }),
    metadataType: "validationRules",
    dhis2SchemaName: "ValidationRule"
});

export const createDhis2DashboardItem = createLLMFirstTool({
    name: "create_dhis2_dashboard_item",
    description: "Create DHIS2 dashboard items that display visualizations, charts, tables, or indicators on dashboard screens. Dashboard items are the building blocks of dashboards. Examples: chart showing vaccination coverage by month, table of facility performance, indicator showing % target achievement, map of disease outbreaks.",
    schema: z.object({
        name: z.string().min(1).describe("The name of the dashboard item"),
        dashboardId: z.string().min(1).describe("The ID of the dashboard this item belongs to"),
        visualizationId: z.string().optional().describe("ID of visualization/chart to display (if this is a chart item)"),
        indicatorId: z.string().optional().describe("ID of indicator to display (if this is an indicator item)"),
        type: z.enum(['CHART', 'REPORT_TABLE', 'INDICATOR', 'MAP', 'CUSTOM']).default('CHART').describe("The type of dashboard item"),
        shape: z.enum(['NORMAL', 'DOUBLE_WIDTH', 'FULL_WIDTH']).default('NORMAL').describe("The width of the dashboard item")
    }),
    metadataType: "dashboardItems",
    dhis2SchemaName: "DashboardItem"
});

// Export all tools - TEMPORARY: Only including currently migrated LLM-first tools
export const Dhis2StructuredTools = {
    // LLM-First Creation Tools (Migrated)
    createDhis2DataElement,
    createDhis2OrganisationUnit,
    createDhis2Category,
    createDhis2CategoryCombo,
    createDhis2CategoryOption,
    createDhis2DataSet,
    createDhis2OrganisationUnitGroup,
    createDhis2OrganisationUnitGroupSet,
    createDhis2User,
    createDhis2Option,
    createDhis2OptionSet,
    createDhis2IndicatorType,
    createDhis2RelationshipType,
    createDhis2Relationship,

    // Legacy tools (not yet migrated - still available for now)
    // Program tools (now migrated to LLM-first)
    // createDhis2Program, // Now migrated
    // createDhis2TrackedEntityType, // Now migrated
    // createDhis2TrackedEntityAttribute, // Now migrated
    // createDhis2ProgramStage, // Now migrated
    // createDhis2ProgramRule, // Now migrated
    // createDhis2ProgramIndicator, // Now migrated
    createDhis2Indicator, // Complex tool with legacy parsing
    // createDhis2ValidationRule, // Now migrated
    // createDhis2DashboardItem, // Now migrated
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
    updateDhis2Option,
    updateDhis2OptionSet,
    updateDhis2Dashboard,
    updateDhis2TrackedEntityInstance,
    updateDhis2Enrollment,
    updateDhis2Event,
    updateDhis2User,
    updateDhis2RelationshipType,
    updateDhis2Relationship,

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
    searchDhis2Users,
    searchDhis2RelationshipTypes,

    // Get by ID tools - Existing
    getDhis2DataElementById,
    getDhis2OrganisationUnitById,
    getDhis2CategoryById,
    getDhis2DataSetById,
    getDhis2ProgramById,
};
