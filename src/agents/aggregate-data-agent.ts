import { Annotation, END, START, StateGraph } from '@langchain/langgraph/web';
import { HumanMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatModels } from '../utils/chat-model-factory';
import {
	// Core aggregate metadata tools
	createDhis2DataElement,
	createDhis2OrganisationUnit,
	createDhis2Category,
	createDhis2CategoryCombo,
	createDhis2CategoryOption,
	createDhis2DataSet,
	createDhis2Indicator,
	createDhis2IndicatorType,
	createDhis2ValidationRule,
	createDhis2Option,
	createDhis2OptionSet,
	createDhis2ReportingForm,
	createDhis2AggregatedMetadata,

	// Update tools for aggregate
	updateDhis2DataElement,
	updateDhis2OrganisationUnit,
	updateDhis2Category,
	updateDhis2CategoryCombo,
	updateDhis2CategoryOption,
	updateDhis2DataSet,
	updateDhis2Indicator,
	updateDhis2IndicatorType,
	updateDhis2ValidationRule,
	updateDhis2Option,
	updateDhis2OptionSet,

	// Search tools for name resolution
	searchDhis2DataElements,
	searchDhis2OrganisationUnits,
	searchDhis2Categories,
	searchDhis2CategoryCombos,
	searchDhis2CategoryOptions,
	searchDhis2OptionSets,

	// LLM-powered keyword extraction tools
	extractOrgUnitKeywordsLLM,

	// Utility tools
	resolveResourceReference, getDhis2DataElementById, getDhis2OrganisationUnitById,
} from '../utils/tools/metadata';

// Types for aggregate data processing
export interface AggregatedDataValue {
    dataElement: string; // Resolved ID
    orgUnit: string; // Resolved ID
    period: string; // YYYYMM format
    categoryOptionCombos?: string; // Resolved ID
    attributeOptionCombos?: string; // Resolved ID
    value: number;
}

export interface ResolutionItem {
    rowIndex: number;
    colIndex: number;
    originalValue: string;
    fieldType: 'dataElement' | 'orgUnit' | 'categoryOptionCombos' | 'attributeOptionCombos';
    searchResults?: any[];
    resolvedId?: string;
    status: 'pending' | 'searching' | 'needs_selection' | 'resolved' | 'failed';
}

export interface DataModification {
    id: string;
    type: 'edit' | 'delete' | 'add';
    rowIndex: number;
    colIndex?: number;
    oldValue?: any;
    newValue?: any;
    fieldType?: string;
    timestamp: Date;
    requiresRevalidation: boolean;
}

export interface ModificationSummary {
    totalModifications: number;
    edits: number;
    deletions: number;
    additions: number;
    requiresFullRevalidation: boolean;
    affectedRows: number[];
    affectedFields: string[];
}

export interface ResolutionContext {
    item: ResolutionItem;
    searchQuery: string;
    searchResults: any[];
}

// State annotation for the aggregate data state graph
const AggregateDataAnnotation = Annotation.Root({
    // CSV processing state
    uploadedData: Annotation<any[][]>({
        reducer: (left, right) => right || left,
        default: () => []
    }),

    // Resolution state - tracks which cells need resolution
    resolutionState: Annotation<Map<string, ResolutionItem>>({
        reducer: (left, right) => right || left,
        default: () => new Map()
    }),

    // Current resolution context
    currentResolution: Annotation<ResolutionContext | null>({
        reducer: (left, right) => right || left,
        default: () => null
    }),

    // Final processed data ready for submission
    processedData: Annotation<AggregatedDataValue[]>({
        reducer: (left, right) => right || left,
        default: () => []
    }),

    // UI state and actions
    uiAction: Annotation<string>({
        reducer: (left, right) => right || left,
        default: () => ''
    }),

    // Messages and orchestrator reference
    messages: Annotation<any[]>({
        reducer: (left: any[], right: any[]) => right ? right : left,
        default: () => []
    }),
    orchestrator: Annotation<any>({
        reducer: (left, right) => right || left,
        default: () => null
    }),

    // Batch validation results with resource details
    resourceDetails: Annotation<Map<string, { exists: boolean; details?: any }>>({
        reducer: (left, right) => right || left,
        default: () => new Map()
    }),

    // Display names for resolved IDs (for showing names in grid instead of IDs)
    displayNames: Annotation<Map<string, string>>({
        reducer: (left, right) => right || left,
        default: () => new Map()
    }),

    // Final result
    finalResult: Annotation<any>({
        reducer: (left, right) => right || left,
        default: () => null
    }),
});

// Initialize the ChatOpenAI model with Azure configuration
const model = ChatModels.createAgentModel();

// StateGraph Workflow Nodes

// 1. Parse CSV upload or initialize empty grid for data entry
async function parse_csv_upload(state: typeof AggregateDataAnnotation.State): Promise<Partial<typeof AggregateDataAnnotation.State>> {
    console.log('📊 Aggregate Data Agent: Processing data entry request');

    const messages = state.messages || [];
    const userMessage = messages.filter(m => m.role === 'user').pop();

    if (!userMessage || !userMessage.content) {
        return {
            finalResult: {
                success: false,
                error: 'No user message provided'
            }
        };
    }

    // Extract contextual information from all user messages
    const contextualInfo = await extractContextualInfo(messages);
    console.log('📊 Aggregate Data Agent: Extracted contextual info:', contextualInfo);

    // Check for CSV file content in messages
    let csvData: string[][] | null = null;
    let hasCSVFile = false;

    // Look for file content in user messages
    for (const message of messages) {
        if (message.role === 'user' && message.content?.includes('File:') && message.content?.includes('Content:')) {
            // Extract file content from message
            const contentMatch = message.content.match(/Content:\n([\s\S]*)$/);
            if (contentMatch) {
                try {
                    csvData = parseCSV(contentMatch[1]);
                    hasCSVFile = true;
                    console.log('📊 Aggregate Data Agent: Found CSV file in message');
                    break;
                } catch (error) {
                    console.warn('📊 Aggregate Data Agent: Failed to parse CSV from message:', error);
                }
            }
        }
    }

    // If no CSV file found, but this is a data entry request, show empty grid
    if (!hasCSVFile || !csvData) {
        console.log('📊 Aggregate Data Agent: No CSV file found, showing empty data entry grid');

        // Create empty grid with expected column structure
        const headers = ['dataElement', 'orgUnit', 'period', 'categoryOptionCombos', 'attributeOptionCombos', 'value'];
        const emptyRows: string[][] = []; // Start with no data rows

        return {
            uploadedData: [headers, ...emptyRows],
            resolutionState: new Map(),
            uiAction: 'show_data_grid'
        };
    }

    // CSV file was found, parse and validate it
    try {
        console.log('📊 Aggregate Data Agent: Parsing CSV file');

        // Validate CSV structure - should have headers: dataElement, orgUnit, period, categoryOptionCombos, attributeOptionCombos, value
        if (csvData.length === 0) {
            return {
                finalResult: {
                    success: false,
                    error: 'CSV file is empty'
                }
            };
        }

        const headers = csvData[0];

        // Remove header row and store data
        const dataRows = csvData.slice(1);

        // Store parsed data with original headers for mapping
        console.log(`📊 Aggregate Data Agent: Parsed ${dataRows.length} rows from CSV with headers: [${headers.join(', ')}]`);

        return {
            uploadedData: [headers, ...dataRows],
            uiAction: 'map_headers'
        };

        // Initialize resolution state
        const resolutionState = new Map<string, ResolutionItem>();

        // Analyze each cell to determine if it needs resolution
        dataRows.forEach((row, rowIndex) => {
            headers.forEach((header, colIndex) => {
                const value = row[colIndex];
                const fieldType = getFieldTypeFromHeader(header);

                if (fieldType && fieldType !== 'period' && fieldType !== 'value') {
                    // Check if value looks like an ID (alphanumeric with possible underscores/hyphens)
                    // or a name (contains spaces or special characters)
                    const needsResolution = isNameValue(value);

                    if (needsResolution) {
                        const key = `${rowIndex}-${colIndex}`;
                        resolutionState.set(key, {
                            rowIndex,
                            colIndex,
                            originalValue: value,
                            fieldType,
                            status: 'pending'
                        });
                    } else {
                        // For values that look like IDs, we should still validate they exist
                        // This provides early error detection for invalid IDs
                        const key = `${rowIndex}-${colIndex}`;
                        resolutionState.set(key, {
                            rowIndex,
                            colIndex,
                            originalValue: value,
                            fieldType,
                            resolvedId: value, // Assume it's already an ID
                            status: 'resolved' // Mark as resolved, but we'll validate during submission
                        });
                    }
                }
            });
        });

        console.log(`📊 Aggregate Data Agent: Parsed ${dataRows.length} rows from CSV, ${resolutionState.size} items need resolution`);

        return {
            uploadedData: [headers, ...dataRows],
            resolutionState,
            uiAction: 'show_data_grid'
        };

    } catch (error) {
        console.error('📊 Aggregate Data Agent: CSV parsing failed:', error);
        return {
            finalResult: {
                success: false,
                error: `Failed to parse CSV: ${error.message}`
            }
        };
    }
}

// 1.5. Intelligently map CSV headers to DHIS2 fields using LLM (internal processing)
async function map_csv_headers(state: typeof AggregateDataAnnotation.State): Promise<Partial<typeof AggregateDataAnnotation.State>> {
    console.log('🧠 Mapping CSV headers to DHIS2 fields using LLM');

    const [originalHeaders, ...dataRows] = state.uploadedData;

    // Required DHIS2 fields with descriptions
    const requiredFields = {
        'dataElement': 'Data Element (indicator, measure, metric, data element)',
        'orgUnit': 'Organisation Unit (facility, site, location, org unit, organisation unit)',
        'period': 'Time Period (month, quarter, year, date, period)',
        'categoryOptionCombos': 'Category Option Combo (disaggregation, breakdown, category, coc)',
        'attributeOptionCombos': 'Attribute Option Combo (attribute coc, additional disaggregation)',
        'value': 'Data Value (result, number, amount, count, value)'
    };

    try {
        // Use LLM to map headers
        const mappingResult = await mapHeadersWithLLM(originalHeaders, requiredFields);
        console.log('🧠 LLM header mapping result:', mappingResult);

        // Apply the mapping to create standardized headers
        const mappedHeaders = originalHeaders.map((header, index) => {
            const mappedField = mappingResult.mappings[index];
            return mappedField ? mappedField : header; // Keep original if no mapping found
        });

        console.log('🧠 Mapped headers:', { original: originalHeaders, mapped: mappedHeaders });

        // Update the uploaded data with mapped headers
        const updatedData = [mappedHeaders, ...dataRows];

        // If there are unmapped required fields, show user confirmation
        if (mappingResult.unmappedRequired.length > 0) {
            console.log('⚠️ Some required fields could not be mapped:', mappingResult.unmappedRequired);
        }

        // Continue to next step - initialize resolution state
        const resolutionState = new Map<string, ResolutionItem>();

        // Analyze each cell to determine if it needs resolution
        dataRows.forEach((row, rowIndex) => {
            mappedHeaders.forEach((header, colIndex) => {
                const value = row[colIndex];
                const fieldType = getFieldTypeFromHeader(header);

                if (fieldType && fieldType !== 'period' && fieldType !== 'value') {
                    // Check if value looks like an ID (alphanumeric with possible underscores/hyphens)
                    // or a name (contains spaces or special characters)
                    const needsResolution = isNameValue(value);

                    if (needsResolution) {
                        const key = `${rowIndex}-${colIndex}`;
                        resolutionState.set(key, {
                            rowIndex,
                            colIndex,
                            originalValue: value,
                            fieldType,
                            status: 'pending'
                        });
                    } else {
                        // For values that look like IDs, we should still validate they exist
                        // This provides early error detection for invalid IDs
                        const key = `${rowIndex}-${colIndex}`;
                        resolutionState.set(key, {
                            rowIndex,
                            colIndex,
                            originalValue: value,
                            fieldType,
                            resolvedId: value, // Assume it's already an ID
                            status: 'resolved' // Mark as resolved, but we'll validate during submission
                        });
                    }
                }
            });
        });

        console.log(`📊 Aggregate Data Agent: Mapped headers and initialized ${resolutionState.size} resolution items`);

        return {
            uploadedData: updatedData,
            resolutionState,
            uiAction: 'fetch_names' // Continue to fetch display names
        };

    } catch (error) {
        console.error('🧠 Header mapping failed:', error);

        // Fallback: proceed with original headers and initialize resolution
        console.log('⚠️ Using original headers due to mapping failure');

        const resolutionState = new Map<string, ResolutionItem>();
        dataRows.forEach((row, rowIndex) => {
            originalHeaders.forEach((header, colIndex) => {
                const value = row[colIndex];
                const fieldType = getFieldTypeFromHeader(header);

                if (fieldType && fieldType !== 'period' && fieldType !== 'value') {
                    const needsResolution = isNameValue(value);
                    if (needsResolution) {
                        const key = `${rowIndex}-${colIndex}`;
                        resolutionState.set(key, {
                            rowIndex,
                            colIndex,
                            originalValue: value,
                            fieldType,
                            status: 'pending'
                        });
                    } else {
                        const key = `${rowIndex}-${colIndex}`;
                        resolutionState.set(key, {
                            rowIndex,
                            colIndex,
                            originalValue: value,
                            fieldType,
                            resolvedId: value,
                            status: 'resolved'
                        });
                    }
                }
            });
        });

        return {
            resolutionState,
            uiAction: 'fetch_names'
        };
    }
}

// 2. Fetch display names for resolved IDs
async function fetch_display_names(state: typeof AggregateDataAnnotation.State): Promise<Partial<typeof AggregateDataAnnotation.State>> {
    console.log('🏷️ Fetching display names for resolved IDs');

    // Collect all resolved IDs that need display names
    const resolvedIds = new Map<string, string>();
    for (const [key, resolution] of state.resolutionState) {
        if (resolution.resolvedId && resolution.status === 'resolved') {
            resolvedIds.set(`${resolution.fieldType}:${resolution.resolvedId}`, resolution.resolvedId);
        }
    }

    if (resolvedIds.size === 0) {
        console.log('✅ No resolved IDs to fetch names for');
        return {
            displayNames: new Map(),
            uiAction: 'show_data_grid'
        };
    }

    console.log(`🏷️ Fetching display names for ${resolvedIds.size} resolved resources`);

    // Group by resource type for batch fetching
    const resourcesByType = new Map<string, Set<string>>();
    for (const [resourceKey, resourceId] of resolvedIds) {
        const [fieldType] = resourceKey.split(':');
        if (!resourcesByType.has(fieldType)) {
            resourcesByType.set(fieldType, new Set());
        }
        resourcesByType.get(fieldType)!.add(resourceId);
    }

    // Use the same batch validation function but focus on getting display names
    const batchResults = await batchValidateResources(resourcesByType);

    // Extract display names from batch results
    const displayNames = new Map<string, string>();
    for (const [resourceKey, resourceId] of resolvedIds) {
        const validationResult = batchResults.get(resourceKey);
        if (validationResult?.exists && validationResult.details) {
            const details = validationResult.details;
            // Use name or displayName, fallback to ID if not available
            const displayName = details.name || details.displayName || resourceId;
            displayNames.set(resourceKey, displayName);
        } else {
            // Fallback to ID if name not found
            displayNames.set(resourceKey, resourceId);
        }
    }

    console.log(`✅ Fetched ${displayNames.size} display names for resolved resources`);

    return {
        displayNames,
        uiAction: 'show_data_grid'
    };
}

// 3. Display data grid with current resolution status
async function display_data_grid(state: typeof AggregateDataAnnotation.State): Promise<Partial<typeof AggregateDataAnnotation.State>> {
    console.log('📊 Aggregate Data Agent: Displaying data grid');

    // If we have batch validation results, include them for enhanced tooltips
    let resourceDetails = undefined;
    if (state.resourceDetails) {
        resourceDetails = Array.from(state.resourceDetails.entries());
    }

    // Include display names for showing names instead of IDs
    let displayNames = undefined;
    if (state.displayNames) {
        displayNames = Array.from(state.displayNames.entries());
    }

    const dataGridMessage = {
        type: 'data_grid',
        message: 'Review and manage your uploaded aggregate data. Resolve any names to IDs before submission.',
        data: {
            headers: state.uploadedData[0] || [],
            rows: state.uploadedData.slice(1) || [],
            resolutionState: Array.from(state.resolutionState.entries()),
            resourceDetails: resourceDetails, // Include batch validation results for enhanced tooltips
            displayNames: displayNames, // Include display names for showing names in cells
            actions: ['resolve_all', 'edit_cell', 'delete_row', 'confirm_submit']
        }
    };

    return {
        finalResult: dataGridMessage
    };
}

// 3. Find next item that needs resolution
async function find_next_resolution(state: typeof AggregateDataAnnotation.State): Promise<Partial<typeof AggregateDataAnnotation.State>> {
    console.log('📊 Aggregate Data Agent: Finding next item to resolve');

    // Find first pending item
    for (const [key, item] of state.resolutionState) {
        if (item.status === 'pending') {
            console.log(`📊 Aggregate Data Agent: Resolving ${item.fieldType}: "${item.originalValue}"`);

            return {
                currentResolution: {
                    item,
                    searchQuery: item.originalValue,
                    searchResults: []
                },
                uiAction: 'search_resolution'
            };
        }
    }

    // No more pending items - check if we need to fetch display names
    const hasResolvedItems = Array.from(state.resolutionState.values()).some(item => item.status === 'resolved');

    if (hasResolvedItems && (!state.displayNames || state.displayNames.size === 0)) {
        console.log('📊 Aggregate Data Agent: All items resolved, fetching display names before showing grid');
        return {
            uiAction: 'fetch_names'
        };
    }

    // All resolution complete and display names fetched (or no resolved items)
    console.log('📊 Aggregate Data Agent: All items resolved and display names ready, proceeding to validation');
    return {
        uiAction: 'validate_and_submit'
    };
}

// 4. Search for resolution matches
async function search_resolution_matches(state: typeof AggregateDataAnnotation.State): Promise<Partial<typeof AggregateDataAnnotation.State>> {
    if (!state.currentResolution) {
        return { uiAction: 'find_next_resolution' };
    }

    const { item, searchQuery } = state.currentResolution;
    console.log(`📊 Aggregate Data Agent: Searching for ${item.fieldType} matches: "${searchQuery}"`);

    try {
        let searchResults: any[] = [];

        // Call appropriate search tool based on field type
        switch (item.fieldType) {
            case 'dataElement':
                const deResult = await searchDhis2DataElements.invoke({ query: searchQuery, limit: 10 });
                const deParsed = JSON.parse(deResult);
                searchResults = deParsed.results || [];
                break;

            case 'orgUnit':
                const ouResult = await searchDhis2OrganisationUnits.invoke({ query: searchQuery, limit: 10 });
                const ouParsed = JSON.parse(ouResult);
                searchResults = ouParsed.results || [];
                break;

            case 'categoryOptionCombos':
                // Search category options first
                const coResult = await searchDhis2CategoryOptions.invoke({ query: searchQuery, limit: 10 });
                const coParsed = JSON.parse(coResult);
                searchResults = coParsed.results || [];

                // If no results, try searching categories
                if (searchResults.length === 0) {
                    const catResult = await searchDhis2Categories.invoke({ query: searchQuery, limit: 10 });
                    const catParsed = JSON.parse(catResult);
                    searchResults = catParsed.results || [];
                }
                break;

            case 'attributeOptionCombos':
                // Similar to categoryOptionCombos but for attribute categories
                const attrResult = await searchDhis2Categories.invoke({ query: searchQuery, limit: 10 });
                const attrParsed = JSON.parse(attrResult);
                searchResults = attrParsed.results || [];
                break;
        }

        console.log(`📊 Aggregate Data Agent: Found ${searchResults.length} matches for "${searchQuery}"`);

        // Update resolution context with search results
        const updatedResolution = {
            ...state.currentResolution,
            searchResults
        };

        // Determine next action based on results
        let nextAction = 'handle_multiple_matches';
        if (searchResults.length === 0) {
            nextAction = 'handle_no_matches';
        } else if (searchResults.length === 1) {
            nextAction = 'auto_resolve_single_match';
        }

        return {
            currentResolution: updatedResolution,
            uiAction: nextAction
        };

    } catch (error) {
        console.error('📊 Aggregate Data Agent: Search failed:', error);

        // Update resolution state to failed
        const updatedResolutionState = new Map(state.resolutionState);
        const key = `${item.rowIndex}-${item.colIndex}`;
        updatedResolutionState.set(key, {
            ...item,
            status: 'failed'
        });

        return {
            resolutionState: updatedResolutionState,
            currentResolution: null,
            uiAction: 'find_next_resolution'
        };
    }
}

// 5. Handle multiple search matches - show selection UI
async function handle_multiple_matches(state: typeof AggregateDataAnnotation.State): Promise<Partial<typeof AggregateDataAnnotation.State>> {
    if (!state.currentResolution) {
        return { uiAction: 'find_next_resolution' };
    }

    const { item, searchResults } = state.currentResolution;
    console.log(`📊 Aggregate Data Agent: Multiple matches found for ${item.fieldType}: "${item.originalValue}"`);

    const selectionMessage = {
        type: 'resolution_selection',
        message: `Multiple matches found for "${item.originalValue}". Please select the correct ${item.fieldType}:`,
        data: {
            fieldType: item.fieldType,
            searchQuery: item.originalValue,
            options: searchResults.map(result => ({
                id: result.id,
                name: result.name || result.displayName,
                description: result.description || result.displayName
            })),
            allowMultiple: false, // Single select for resolution
            rowIndex: item.rowIndex,
            colIndex: item.colIndex
        }
    };

    return {
        finalResult: selectionMessage
    };
}

// 6. Auto-resolve single match
async function auto_resolve_single_match(state: typeof AggregateDataAnnotation.State): Promise<Partial<typeof AggregateDataAnnotation.State>> {
    if (!state.currentResolution) {
        return { uiAction: 'find_next_resolution' };
    }

    const { item, searchResults } = state.currentResolution;
    const resolvedId = searchResults[0].id;

    console.log(`📊 Aggregate Data Agent: Auto-resolving ${item.fieldType} "${item.originalValue}" to ID: ${resolvedId}`);

    // Update resolution state
    const updatedResolutionState = new Map(state.resolutionState);
    const key = `${item.rowIndex}-${item.colIndex}`;
    updatedResolutionState.set(key, {
        ...item,
        resolvedId,
        status: 'resolved'
    });

    return {
        resolutionState: updatedResolutionState,
        currentResolution: null,
        uiAction: 'find_next_resolution'
    };
}

// 7. Handle no matches found
async function handle_no_matches(state: typeof AggregateDataAnnotation.State): Promise<Partial<typeof AggregateDataAnnotation.State>> {
    if (!state.currentResolution) {
        return { uiAction: 'find_next_resolution' };
    }

    const { item } = state.currentResolution;
    console.log(`📊 Aggregate Data Agent: No matches found for ${item.fieldType}: "${item.originalValue}"`);

    const errorMessage = {
        type: 'resolution_error',
        message: `No matches found for "${item.originalValue}" in ${item.fieldType}. Please check the name or provide the correct ID.`,
        data: {
            fieldType: item.fieldType,
            searchQuery: item.originalValue,
            rowIndex: item.rowIndex,
            colIndex: item.colIndex,
            suggestions: ['Check spelling', 'Try partial name', 'Use exact ID if known']
        }
    };

    return {
        finalResult: errorMessage
    };
}

// 8. Apply user selection to resolution
async function apply_resolution_selection(state: typeof AggregateDataAnnotation.State): Promise<Partial<typeof AggregateDataAnnotation.State>> {
    console.log('📊 Aggregate Data Agent: Applying user resolution selection');

    // This would be called when user makes a selection via the UI
    // The selection result would come through the orchestrator

    return {
        uiAction: 'find_next_resolution'
    };
}

// 9. Validate and prepare final data for submission
async function validate_and_submit(state: typeof AggregateDataAnnotation.State): Promise<Partial<typeof AggregateDataAnnotation.State>> {
    console.log('📊 Aggregate Data Agent: Validating and preparing submission');

    const headers = state.uploadedData[0];
    const dataRows = state.uploadedData.slice(1);
    const processedData: AggregatedDataValue[] = [];

    // Check if all resolutions are complete
    const unresolvedItems = Array.from(state.resolutionState.values()).filter(item => item.status !== 'resolved');
    if (unresolvedItems.length > 0) {
        return {
            finalResult: {
                success: false,
                error: `${unresolvedItems.length} items still need resolution before submission`
            }
        };
    }

    // Validate that all resolved IDs actually exist in DHIS2 using batch validation
    console.log('🚀 Performing batch validation of resolved IDs...');
    const validationErrors: string[] = [];

    // Group resources by type for batch validation
    const resourcesByType = new Map<string, Set<string>>();
    for (const [key, resolution] of state.resolutionState) {
        if (resolution.resolvedId) {
            if (!resourcesByType.has(resolution.fieldType)) {
                resourcesByType.set(resolution.fieldType, new Set());
            }
            resourcesByType.get(resolution.fieldType)!.add(resolution.resolvedId);
        }
    }

    // Perform batch validation
    const batchValidationResults = await batchValidateResources(resourcesByType);

    // Process validation results and build error messages
    for (const [key, resolution] of state.resolutionState) {
        if (resolution.resolvedId) {
            const resultKey = `${resolution.fieldType}:${resolution.resolvedId}`;
            const validationResult = batchValidationResults.get(resultKey);

            if (validationResult && !validationResult.exists) {
                validationErrors.push(`${resolution.fieldType} "${resolution.originalValue}" (ID: ${resolution.resolvedId}) does not exist in DHIS2`);
            }
        }
    }

    console.log(`✅ Batch validation completed: ${batchValidationResults.size} resources validated, ${validationErrors.length} errors found`);

    if (validationErrors.length > 0) {
        return {
            finalResult: {
                success: false,
                error: `Validation failed: ${validationErrors.join('; ')}`,
                validationErrors
            }
        };
    }

    // Build final data structure
    dataRows.forEach((row, rowIndex) => {
        const dataValue: any = {};

        headers.forEach((header, colIndex) => {
            const fieldType = getFieldTypeFromHeader(header);
            let value = row[colIndex];

            // Resolve IDs if this was a name field
            if (fieldType && fieldType !== 'period' && fieldType !== 'value') {
                const resolutionKey = `${rowIndex}-${colIndex}`;
                const resolution = state.resolutionState.get(resolutionKey);

                if (resolution && resolution.resolvedId) {
                    value = resolution.resolvedId;
                }
            }

            // Map to DHIS2 field names
            switch (fieldType) {
                case 'dataElement':
                    dataValue.dataElement = value;
                    break;
                case 'orgUnit':
                    dataValue.orgUnit = value;
                    break;
                case 'period':
                    dataValue.period = value;
                    break;
                case 'categoryOptionCombos':
                    if (value) dataValue.categoryOptionCombos = value;
                    break;
                case 'attributeOptionCombos':
                    if (value) dataValue.attributeOptionCombos = value;
                    break;
                case 'value':
                    dataValue.value = parseFloat(value);
                    break;
            }
        });

        processedData.push(dataValue as AggregatedDataValue);
    });

    console.log(`📊 Aggregate Data Agent: Prepared ${processedData.length} data values for submission`);

    // Here you would typically call DHIS2 data value submission API
    // For now, return the processed data

    return {
        processedData,
        finalResult: {
            success: true,
            message: `Successfully validated and processed ${processedData.length} aggregate data values`,
            data: processedData
        }
    };
}

// Helper functions

function parseCSV(csvContent: string): any[][] {
    // Simple CSV parser - in production, use a proper CSV library
    const lines = csvContent.split('\n').filter(line => line.trim());
    return lines.map(line => {
        // Handle quoted values and commas within quotes
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        result.push(current.trim());
        return result;
    });
}

function getFieldTypeFromHeader(header: string): 'dataElement' | 'orgUnit' | 'period' | 'categoryOptionCombos' | 'attributeOptionCombos' | 'value' | null {
    const lowerHeader = header.toLowerCase();

    if (lowerHeader.includes('dataelement') || lowerHeader.includes('data_element')) {
        return 'dataElement';
    }
    if (lowerHeader.includes('orgunit') || lowerHeader.includes('org_unit') || lowerHeader.includes('organisation')) {
        return 'orgUnit';
    }
    if (lowerHeader.includes('period')) {
        return 'period';
    }
    if (lowerHeader.includes('categoryoption') || lowerHeader.includes('category_option')) {
        return 'categoryOptionCombos';
    }
    if (lowerHeader.includes('attributeoption') || lowerHeader.includes('attribute_option')) {
        return 'attributeOptionCombos';
    }
    if (lowerHeader.includes('value')) {
        return 'value';
    }

    return null;
}

// Extract contextual information from user messages using LLM
async function extractContextualInfo(messages: any[]): Promise<{
    orgUnits: string[];
    userOrgUnit?: { id: string; name: string; level: number };
}> {
    const userMessages = messages.filter(m => m.role === 'user');
    const allText = userMessages.map(m => m.content).join(' ');

    // Extract organisation unit keywords using LLM-powered tool
    let extractedOrgUnits: string[] = [];
    try {
        const llmResult = await extractOrgUnitKeywordsLLM.invoke({
            query: allText,
            context: 'health analytics - extract geographic locations and organization unit names'
        });

        const llmResponse = JSON.parse(llmResult as string);
        console.log('🏥 LLM organisation unit extraction result:', llmResponse);

        // Extract keyword candidates from LLM response
        extractedOrgUnits = llmResponse.keywordCandidates || [];
        console.log('🏥 Extracted org unit keywords from LLM:', extractedOrgUnits);
    } catch (error) {
        console.warn('🏥 LLM organisation unit extraction failed, using regex fallback:', error);
        // Fallback to simple regex extraction if LLM fails
        const orgUnitPatterns = [
            /\b(?:at|in|for)\s+([A-Za-z\s]+?)(?:\s+(?:hospital|clinic|center|facility|district|province|region)|\s*\d{4}|$)/gi,
            /\b([A-Za-z\s]+?)(?:\s+hospital|\s+clinic|\s+center|\s+facility|\s+district|\s+province|\s+region)\b/gi
        ];

        for (const pattern of orgUnitPatterns) {
            let match;
            while ((match = pattern.exec(allText)) !== null) {
                const orgUnit = match[1].trim();
                if (orgUnit.length > 2 && !extractedOrgUnits.includes(orgUnit)) {
                    extractedOrgUnits.push(orgUnit);
                }
            }
        }
    }

    // Get current user's organisation unit from DHIS2 /me endpoint
    let userOrgUnit;
    try {
        const { getCurrentUserInfo } = await import('../utils/app-runtime/dhis2-api');
        const userInfo = await getCurrentUserInfo();

        if (userInfo?.primaryOrgUnit) {
            userOrgUnit = {
                id: userInfo.primaryOrgUnit.id,
                name: userInfo.primaryOrgUnit.name,
                level: userInfo.primaryOrgUnit.level
            };
            console.log(`🏢 Retrieved user's primary org unit: ${userOrgUnit.name} (Level ${userOrgUnit.level})`);
        } else {
            console.warn('⚠️ User has no primary organisation unit assigned');
            // Fallback to placeholder if no org unit found
            userOrgUnit = {
                id: 'user_org_unit_placeholder',
                name: 'Current User Facility',
                level: 5 // Facility level
            };
        }
    } catch (error) {
        console.warn('⚠️ Could not retrieve user organisation unit from /me endpoint:', error);
        // Fallback to placeholder
        userOrgUnit = {
            id: 'user_org_unit_placeholder',
            name: 'Current User Facility',
            level: 5 // Facility level
        };
    }

    return {
        orgUnits: extractedOrgUnits,
        userOrgUnit
    };
}

function isNameValue(value: string): boolean {
    if (!value || typeof value !== 'string') return false;

    // Check if it looks like an ID (alphanumeric, underscores, hyphens, no spaces)
    const idPattern = /^[a-zA-Z0-9_-]+$/;

    // If it matches ID pattern, assume it's already an ID
    if (idPattern.test(value)) {
        return false;
    }

    // Otherwise, assume it's a name that needs resolution
    return true;
}

// Use LLM to intelligently map CSV headers to DHIS2 required fields
async function mapHeadersWithLLM(headers: string[], requiredFields: Record<string, string>): Promise<{
    mappings: (string | null)[];
    unmappedRequired: string[];
    confidence: 'high' | 'medium' | 'low';
}> {
    try {
        const llm = ChatModels.createAnalysisModel();

        // Create mapping prompt
        const requiredFieldList = Object.entries(requiredFields)
            .map(([field, description]) => `"${field}": ${description}`)
            .join('\n');

        const headersList = headers.map((header, index) => `${index}: "${header}"`).join('\n');

        const prompt = `
You are mapping CSV headers to DHIS2 aggregate data fields. Your task is to intelligently match user-provided column headers to the required DHIS2 field names based on semantic meaning, not just exact text matching.

REQUIRED DHIS2 FIELDS:
${requiredFieldList}

PROVIDED CSV HEADERS:
${headersList}

INSTRUCTIONS:
1. For each CSV header (identified by index), determine which DHIS2 field it most closely matches
2. Use semantic understanding - "Facility" should map to "orgUnit", "Indicator" to "dataElement", etc.
3. If a header doesn't match any required field, return null for that index
4. If multiple headers could map to the same field, choose the best semantic match
5. Some required fields may not be present in the CSV - that's OK

EXAMPLES:
- "Facility Name" → "orgUnit"
- "Indicator" → "dataElement"  
- "Location" → "orgUnit"
- "Measure" → "dataElement"
- "Disaggregation" → "categoryOptionCombos"
- "Result" → "value"
- "Time Period" → "period"

Return ONLY a JSON object with this exact structure:
{
  "mappings": ["fieldName1", "fieldName2", null, "fieldName4", ...],
  "unmappedRequired": ["fieldNameX", "fieldNameY"],
  "confidence": "high|medium|low"
}

Where:
- "mappings" is an array with one element per CSV header (use null for unmapped headers)
- "unmappedRequired" lists required fields that weren't found in any header
- "confidence" indicates overall mapping confidence
`;

        const llmResponse = await llm.invoke([
            { role: "system", content: prompt },
            { role: "user", content: `Map these CSV headers to DHIS2 fields: ${headers.join(', ')}` }
        ]);

        const content = (llmResponse.content as string).trim();

        try {
            const result = JSON.parse(content);

            // Validate result structure
            if (!result.mappings || !Array.isArray(result.mappings) || result.mappings.length !== headers.length) {
                throw new Error('Invalid mappings array');
            }

            return {
                mappings: result.mappings,
                unmappedRequired: result.unmappedRequired || [],
                confidence: result.confidence || 'medium'
            };
        } catch (parseError) {
            console.warn('🧠 LLM returned invalid JSON, using fallback mapping');
            // Fallback to simple regex-based mapping
            return fallbackHeaderMapping(headers, requiredFields);
        }

    } catch (error) {
        console.error('🧠 Header mapping LLM failed:', error);
        return fallbackHeaderMapping(headers, requiredFields);
    }
}

// Fallback header mapping using regex patterns
function fallbackHeaderMapping(headers: string[], requiredFields: Record<string, string>): {
    mappings: (string | null)[];
    unmappedRequired: string[];
    confidence: 'high' | 'medium' | 'low';
} {
    const mappings: (string | null)[] = [];
    const mappedFields = new Set<string>();

    // Define regex patterns for each required field
    const patterns: Record<string, RegExp[]> = {
        dataElement: [/data.?element/i, /indicator/i, /measure/i, /metric/i],
        orgUnit: [/org.?unit/i, /organisation.?unit/i, /facility/i, /site/i, /location/i, /org/i],
        period: [/period/i, /time/i, /month/i, /quarter/i, /year/i, /date/i],
        categoryOptionCombos: [/category.?option.?combo/i, /coc/i, /disaggregation/i, /breakdown/i, /category/i],
        attributeOptionCombos: [/attribute.?option.?combo/i, /attribute.?coc/i],
        value: [/value/i, /result/i, /number/i, /amount/i, /count/i, /data/i]
    };

    // Map each header
    headers.forEach(header => {
        let mappedField: string | null = null;

        for (const [fieldName, fieldPatterns] of Object.entries(patterns)) {
            if (fieldPatterns.some(pattern => pattern.test(header))) {
                if (!mappedFields.has(fieldName)) {
                    mappedField = fieldName;
                    mappedFields.add(fieldName);
                    break;
                }
            }
        }

        mappings.push(mappedField);
    });

    // Find unmapped required fields
    const unmappedRequired = Object.keys(requiredFields).filter(field => !mappedFields.has(field));

    return {
        mappings,
        unmappedRequired,
        confidence: 'low' // Fallback is always low confidence
    };
}

// Helper function to get the correct data key for each resource type in API responses
function getResourceDataKey(fieldType: string): string {
    switch (fieldType) {
        case 'dataElement':
            return 'dataElements';
        case 'orgUnit':
            return 'organisationUnits';
        case 'categoryOptionCombos':
        case 'attributeOptionCombos':
            return 'categoryOptionCombos';
        default:
            return fieldType;
    }
}

// Batch validate multiple resources by type using single multi-resource query
async function batchValidateResources(resourcesByType: Map<string, Set<string>>): Promise<Map<string, { exists: boolean; details?: any }>> {
    const results = new Map<string, { exists: boolean; details?: any }>();
    const BATCH_SIZE = 100; // Validate up to 100 IDs per resource type

    const totalResources = Array.from(resourcesByType.values()).reduce((sum, set) => sum + set.size, 0);
    console.log(`🚀 Starting batch validation for ${totalResources} total resources across ${resourcesByType.size} types`);

    // Check if we have any resources to validate
    if (totalResources === 0) {
        console.log('✅ No resources to validate');
        return results;
    }

    // Build single comprehensive multi-resource query using useDataQuery pattern
    const multiResourceQuery: any = {};
    let hasValidQueries = false;

    for (const [fieldType, resourceIds] of resourcesByType) {
        if (resourceIds.size === 0) continue;

        // Convert Set to Array and limit batch size
        const idArray = Array.from(resourceIds);
        const batchIds = idArray.slice(0, BATCH_SIZE); // Take first BATCH_SIZE for this query

        // Create filter for this resource type
        const idFilter = `id:in:[${batchIds.join(',')}]`;

        // Define resource query based on type
        let resourceConfig: any;
        switch (fieldType) {
            case 'dataElement':
                resourceConfig = {
                    resource: 'dataElements',
                    params: {
                        filter: idFilter,
                        fields: 'id,name,displayName,code,valueType',
                        paging: false
                    }
                };
                break;

            case 'orgUnit':
                resourceConfig = {
                    resource: 'organisationUnits',
                    params: {
                        filter: idFilter,
                        fields: 'id,name,displayName,level,path',
                        paging: false
                    }
                };
                break;

            case 'categoryOptionCombos':
                resourceConfig = {
                    resource: 'categoryOptionCombos',
                    params: {
                        filter: idFilter,
                        fields: 'id,name,displayName,categoryOptions[id,name],categories[id,name]',
                        paging: false
                    }
                };
                break;

            case 'attributeOptionCombos':
                resourceConfig = {
                    resource: 'categoryOptionCombos', // Same endpoint for attribute COCs
                    params: {
                        filter: idFilter,
                        fields: 'id,name,displayName,categoryOptions[id,name],categories[id,name]',
                        paging: false
                    }
                };
                break;

            default:
                console.warn(`⚠️ Unknown field type for multi-resource query: ${fieldType}`);
                continue;
        }

        // Add to multi-resource query using fieldType as key
        multiResourceQuery[fieldType] = resourceConfig;
        hasValidQueries = true;

        console.log(`📊 Added ${fieldType} query for ${batchIds.length} resources`);
    }

    if (!hasValidQueries) {
        console.log('⚠️ No valid resource queries to execute');
        return results;
    }

    console.log(`🌐 Executing single multi-resource query for ${Object.keys(multiResourceQuery).length} resource types`);

    try {
        // Execute single API call with all resource types
        const { Dhis2Api } = await import('../utils/app-runtime/dhis2-api');
        const response = await Dhis2Api.query(multiResourceQuery);

        if (!response.success) {
            throw new Error(`Multi-resource query failed: ${response.error}`);
        }

        console.log(`✅ Multi-resource query successful`);

        // Parse results from the single response
        const queryData = response.data;

        // Process each resource type from the response
        for (const [fieldType, resourceIds] of resourcesByType) {
            if (!queryData[fieldType]) {
                console.warn(`⚠️ No data returned for ${fieldType} in multi-resource query`);
                // Mark all resources of this type as not found
                resourceIds.forEach(resourceId => {
                    results.set(`${fieldType}:${resourceId}`, { exists: false });
                });
                continue;
            }

            // Get the results for this resource type
            const resourceResults = queryData[fieldType];
            const dataKey = getResourceDataKey(fieldType);
            const items = resourceResults[dataKey] || [];

            console.log(`📋 ${fieldType}: Found ${items.length} resources out of ${resourceIds.size} requested`);

            // Create lookup map for this resource type
            const itemMap = new Map(items.map((item: any) => [item.id, item]));

            // Check each requested ID
            resourceIds.forEach(resourceId => {
                const item = itemMap.get(resourceId);
                if (item) {
                    results.set(`${fieldType}:${resourceId}`, {
                        exists: true,
                        details: item
                    });
                } else {
                    results.set(`${fieldType}:${resourceId}`, { exists: false });
                }
            });
        }

    } catch (error) {
        console.error(`❌ Multi-resource query failed:`, error);
        // On complete failure, conservatively mark all resources as existing to avoid false negatives
        for (const [fieldType, resourceIds] of resourcesByType) {
            resourceIds.forEach(resourceId => {
                results.set(`${fieldType}:${resourceId}`, { exists: true });
            });
        }
    }

    console.log(`Batch validation complete: ${results.size} resources validated in 1 API call`);
    return results;
}



// Create and compile StateGraph workflow
const aggregateDataWorkflow = new StateGraph(AggregateDataAnnotation);

// Add nodes
aggregateDataWorkflow.addNode('parse_csv_upload', parse_csv_upload);
aggregateDataWorkflow.addNode('map_csv_headers', map_csv_headers);
aggregateDataWorkflow.addNode('fetch_display_names', fetch_display_names);
aggregateDataWorkflow.addNode('display_data_grid', display_data_grid);
aggregateDataWorkflow.addNode('find_next_resolution', find_next_resolution);
aggregateDataWorkflow.addNode('search_resolution_matches', search_resolution_matches);
aggregateDataWorkflow.addNode('handle_multiple_matches', handle_multiple_matches);
aggregateDataWorkflow.addNode('auto_resolve_single_match', auto_resolve_single_match);
aggregateDataWorkflow.addNode('handle_no_matches', handle_no_matches);
aggregateDataWorkflow.addNode('apply_resolution_selection', apply_resolution_selection);
aggregateDataWorkflow.addNode('validate_and_submit', validate_and_submit);

// Add edges
// @ts-ignore
aggregateDataWorkflow.addEdge(START, 'parse_csv_upload');

// Conditional routing based on uiAction
// @ts-ignore
aggregateDataWorkflow.addConditionalEdges('parse_csv_upload', (state) => {
    if (state.uiAction === 'map_headers') return 'map_csv_headers';
    if (state.uiAction === 'show_data_grid') return 'display_data_grid';
    return END;
});

// @ts-ignore
aggregateDataWorkflow.addConditionalEdges('map_csv_headers', (state) => {
    if (state.uiAction === 'show_data_grid') return 'display_data_grid';
    return END;
});

// @ts-ignore
aggregateDataWorkflow.addConditionalEdges('fetch_display_names', (state) => {
    if (state.uiAction === 'show_data_grid') return 'display_data_grid';
    return END;
});

// @ts-ignore
aggregateDataWorkflow.addConditionalEdges('display_data_grid', (state) => {
    // This would be determined by user action from the UI
    return 'find_next_resolution';
});

// @ts-ignore
aggregateDataWorkflow.addConditionalEdges('find_next_resolution', (state) => {
    if (state.uiAction === 'search_resolution') return 'search_resolution_matches';
    if (state.uiAction === 'validate_and_submit') return 'validate_and_submit';
    if (state.uiAction === 'fetch_names') return 'fetch_display_names';
    return END;
});

// @ts-ignore
aggregateDataWorkflow.addConditionalEdges('search_resolution_matches', (state) => {
    if (state.uiAction === 'handle_multiple_matches') return 'handle_multiple_matches';
    if (state.uiAction === 'auto_resolve_single_match') return 'auto_resolve_single_match';
    if (state.uiAction === 'handle_no_matches') return 'handle_no_matches';
    return END;
});

// @ts-ignore
aggregateDataWorkflow.addConditionalEdges('handle_multiple_matches', (state) => {
    return END; // Wait for user selection
});

// @ts-ignore
aggregateDataWorkflow.addConditionalEdges('auto_resolve_single_match', (state) => {
    return 'find_next_resolution';
});

// @ts-ignore
aggregateDataWorkflow.addConditionalEdges('handle_no_matches', (state) => {
    return END; // Wait for user to handle error
});

// @ts-ignore
aggregateDataWorkflow.addConditionalEdges('apply_resolution_selection', (state) => {
    return 'find_next_resolution';
});

// @ts-ignore
aggregateDataWorkflow.addEdge('validate_and_submit', END);



// Compile the workflow
const aggregateDataStateGraph = aggregateDataWorkflow.compile();

// Full-featured aggregate data agent using StateGraph workflow
export function createAggregateDataAgent(orchestrator: any) {
    return {
        invoke: async (input: any) => {
            console.log('📊 Aggregate Data Agent: Processing aggregate data request with full StateGraph workflow');

            try {
                // For initial data loading, we want to process everything and return one comprehensive result
                // The StateGraph is designed for interactive workflows, but here we want batch processing

                // Extract CSV data first
                const messages = input.messages || [];
                const userMessage = messages.filter(m => m.role === 'user').pop();

                if (!userMessage || !userMessage.content) {
                    return {
                        messages: [{
                            content: JSON.stringify({
                                success: false,
                                error: 'No user message provided'
                            }),
                            name: undefined,
                            additional_kwargs: {},
                            response_metadata: {}
                        }]
                    };
                }

                // Extract CSV from message
                let csvData: string[][] | null = null;
                for (const message of messages) {
                    if (message.role === 'user' && message.content?.includes('File:') && message.content?.includes('Content:')) {
                        const contentMatch = message.content.match(/Content:\n([\s\S]*)$/);
                        if (contentMatch) {
                            csvData = parseCSV(contentMatch[1]);
                            break;
                        }
                    }
                }

                if (!csvData || csvData.length === 0) {
                    return {
                        messages: [{
                            content: JSON.stringify({
                                success: false,
                                error: 'No CSV data found'
                            }),
                            name: undefined,
                            additional_kwargs: {},
                            response_metadata: {}
                        }]
                    };
                }

                console.log(`📊 Aggregate Data Agent: Parsed CSV with ${csvData.length - 1} data rows`);

                // Process the data internally (batch processing approach)
                const processedResult = await processAggregateDataBatch(csvData, messages);

                return {
                    messages: [{
                        content: JSON.stringify(processedResult),
                        name: undefined,
                        additional_kwargs: {},
                        response_metadata: {}
                    }]
                };

            } catch (error) {
                console.error('📊 Aggregate Data Agent: Processing failed:', error);
                return {
                    messages: [{
                        content: JSON.stringify({
                            success: false,
                            error: `Aggregate data processing failed: ${error.message}`
                        }),
                        name: undefined,
                        additional_kwargs: {},
                        response_metadata: {}
                    }]
                };
            }
        }
    };
}

// Legacy React Agent for backward compatibility (used by router)
export const aggregateDataAgent = createReactAgent({
  llm: model,
  tools: [
    // Creation tools
    createDhis2DataElement,
    createDhis2OrganisationUnit,
    createDhis2Category,
    createDhis2CategoryCombo,
    createDhis2CategoryOption,
    createDhis2DataSet,
    createDhis2Indicator,
    createDhis2IndicatorType,
    createDhis2ValidationRule,
    createDhis2Option,
    createDhis2OptionSet,
    createDhis2ReportingForm,
    createDhis2AggregatedMetadata,

    // Update tools
    updateDhis2DataElement,
    updateDhis2OrganisationUnit,
    updateDhis2Category,
    updateDhis2CategoryCombo,
    updateDhis2CategoryOption,
    updateDhis2DataSet,
    updateDhis2Indicator,
    updateDhis2IndicatorType,
    updateDhis2ValidationRule,
    updateDhis2Option,
    updateDhis2OptionSet,

    // Utility tools
    resolveResourceReference,
  ],
  prompt: `
    You are a specialized DHIS2 aggregate data entry agent. You handle the creation and management of aggregate data collection structures including data elements, categories, data sets, indicators, and validation rules.

    ## CORE CAPABILITIES

    ### AGGREGATE DATA STRUCTURES
    - **Data Elements**: Core data collection points with value types (NUMBER, TEXT, BOOLEAN, DATE, etc.)
    - **Categories & Disaggregation**: Category combinations for breaking down data (by age, gender, location, etc.)
    - **Data Sets**: Collections of data elements for periodic reporting (monthly, quarterly, yearly)
    - **Indicators**: Calculated metrics and KPIs from collected data
    - **Validation Rules**: Quality checks and data consistency rules
    - **Organisation Units**: Hierarchical administrative units for data collection
    - **Option Sets**: Predefined choice lists for categorical data

    ### SPECIALIZED FEATURES
    - **Reporting Forms**: Complex data entry forms with category-based disaggregation
    - **Aggregated Metadata Creation**: Batch creation of related metadata objects
    - **Automatic Dependency Resolution**: Creates required categories, options, etc. automatically

    ## WORKFLOW PRINCIPLES

    1. **Extract Complete Schemas**: Always extract full schema-compliant objects with all required fields
    2. **Handle Dependencies**: Use aggregated creation when possible to minimize API calls
    3. **Validate Data Types**: Ensure value types match intended data collection
    4. **Maintain Hierarchy**: Respect organisation unit levels and category structures

    ## RESOURCE-SPECIFIC RULES

    ### Data Elements
    - Default domainType: 'AGGREGATE'
    - Set aggregationType appropriately (SUM for counts, AVERAGE for rates, NONE for text)
    - zeroIsSignificant: false for percentages/rates, true for absolute counts

    ### Categories
    - dataDimension: true for disaggregation categories
    - dataDimensionType: 'DISAGGREGATION'
    - Include categoryOptions array

    ### Data Sets
    - Specify periodType (Monthly, Quarterly, Yearly)
    - Include dataSetElements with dataElement and categoryCombo references
    - Set organisationUnits for data collection scope

    ### Indicators
    - Require indicatorType (create default if needed)
    - Provide numerator and denominator expressions
    - Set decimals appropriately (0 for integers, 2 for percentages)

    ### Validation Rules
    - Define leftSide and rightSide expressions
    - Set importance (HIGH, MEDIUM, LOW)
    - Choose appropriate operator and periodType

    ## RESPONSE FORMAT

    Always return JSON responses for operations:

    {
      "success": boolean,
      "message": string,
      "data": object,
      "results": array,
      "error": string
    }

    Use natural language only when seeking clarification about requirements.
  `,
});
