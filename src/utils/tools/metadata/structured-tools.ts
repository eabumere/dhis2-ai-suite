import { createDhis2ResourceTool, createDhis2SearchTool, createDhis2GetByIdTool } from './base-tool';
import { Dhis2Schemas } from './schemas';
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { generateDhis2Id, searchDhis2Metadata, createDhis2Metadata, parseNaturalLanguageDescription } from './helpers';

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
        } else if (descLower.includes('yes/no') || descLower.includes('true/false')) {
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
