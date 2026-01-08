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
    resolveResourceReference,
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
        const expectedHeaders = ['dataElement', 'orgUnit', 'period', 'categoryOptionCombos', 'attributeOptionCombos', 'value'];

        // Check if headers match expected structure (flexible ordering)
        const hasRequiredHeaders = expectedHeaders.every(header =>
            headers.some(h => h.toLowerCase().includes(header.toLowerCase()))
        );

        if (!hasRequiredHeaders) {
            return {
                finalResult: {
                    success: false,
                    error: `CSV must contain columns for: ${expectedHeaders.join(', ')}`
                }
            };
        }

        // Remove header row and store data
        const dataRows = csvData.slice(1);

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

// 2. Display data grid with current resolution status
async function display_data_grid(state: typeof AggregateDataAnnotation.State): Promise<Partial<typeof AggregateDataAnnotation.State>> {
    console.log('📊 Aggregate Data Agent: Displaying data grid');

    const dataGridMessage = {
        type: 'data_grid',
        message: 'Review and manage your uploaded aggregate data. Resolve any names to IDs before submission.',
        data: {
            headers: state.uploadedData[0] || [],
            rows: state.uploadedData.slice(1) || [],
            resolutionState: Array.from(state.resolutionState.entries()),
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

    // No more items to resolve
    console.log('📊 Aggregate Data Agent: All items resolved, proceeding to validation');
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
            message: `Successfully processed ${processedData.length} aggregate data values`,
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

    // Get current user's organisation unit
    let userOrgUnit;
    try {
        // This would typically call DHIS2 API to get current user info
        // For now, we'll use a placeholder
        userOrgUnit = {
            id: 'user_org_unit_placeholder',
            name: 'Current User Facility',
            level: 5 // Facility level
        };
    } catch (error) {
        console.warn('Could not retrieve user organisation unit:', error);
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

// Create and compile StateGraph workflow
const aggregateDataWorkflow = new StateGraph(AggregateDataAnnotation);

// Add nodes
aggregateDataWorkflow.addNode('parse_csv_upload', parse_csv_upload);
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

// StateGraph-based aggregate data agent
export function createAggregateDataAgent(orchestrator: any) {
    return {
        invoke: async (input: any) => {
            console.log('📊 Aggregate Data Agent: Processing aggregate data request');

            const initialState: Partial<typeof AggregateDataAnnotation.State> = {
                messages: input.messages || [],
                orchestrator: orchestrator,
                uploadedData: [],
                resolutionState: new Map(),
                currentResolution: null,
                processedData: [],
                uiAction: '',
            };

            try {
                // Execute StateGraph workflow
                const result = await aggregateDataStateGraph.invoke(initialState);

                // Format for compatibility with existing interface
                return {
                    messages: [{
                        content: JSON.stringify(result.finalResult),
                        name: undefined,
                        additional_kwargs: {},
                        response_metadata: {}
                    }]
                };
            } catch (error) {
                console.error('📊 Aggregate Data Agent: Workflow execution failed:', error);
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
        },

        // Handle UI interactions from the orchestrator
        handleUIInteraction: async (interaction: any, currentState: any) => {
            console.log('📊 Aggregate Data Agent: Handling UI interaction:', interaction);

            const { type, data } = interaction;

            // Resume the state graph with updated state based on user interaction
            let updatedState: any = {
                uploadedData: currentState.uploadedData,
                resolutionState: currentState.resolutionState,
                currentResolution: currentState.currentResolution,
                processedData: currentState.processedData,
                uiAction: currentState.uiAction,
                messages: currentState.messages,
                orchestrator: currentState.orchestrator,
                finalResult: currentState.finalResult
            };

            switch (type) {
                case 'resolve_item':
                    // User clicked resolve on a specific cell
                    updatedState.currentResolution = {
                        item: {
                            rowIndex: data.rowIndex,
                            colIndex: data.colIndex,
                            originalValue: data.originalValue,
                            fieldType: data.fieldType,
                            status: 'pending'
                        },
                        searchQuery: data.originalValue,
                        searchResults: []
                    };
                    updatedState.uiAction = 'search_resolution';
                    break;

                case 'resolution_selection':
                    // User selected a resolution option
                    const resolutionMap = new Map(updatedState.resolutionState || []);
                    const key = `${data.rowIndex}-${data.colIndex}`;
                    const existingResolutionItem = resolutionMap.get(key);
                    if (!existingResolutionItem) {
                        console.warn('📊 Aggregate Data Agent: Resolution item not found for selection, ignoring');
                        return currentState;
                    }
                    resolutionMap.set(key, {
                        ...existingResolutionItem,
                        resolvedId: data.selectedId,
                        status: 'resolved'
                    });
                    updatedState.resolutionState = resolutionMap;
                    updatedState.currentResolution = null;
                    updatedState.uiAction = 'find_next_resolution';
                    break;

                case 'skip_resolution':
                    // User skipped resolution for an item
                    const skipMap = new Map(updatedState.resolutionState || []);
                    const skipKey = `${data.rowIndex}-${data.colIndex}`;
                    const existingSkipItem = skipMap.get(skipKey);
                    if (!existingSkipItem) {
                        console.warn('📊 Aggregate Data Agent: Resolution item not found for skip, ignoring');
                        return currentState;
                    }
                    skipMap.set(skipKey, {
                        ...existingSkipItem,
                        status: 'failed' // Mark as failed so it's not blocking
                    });
                    updatedState.resolutionState = skipMap;
                    updatedState.currentResolution = null;
                    updatedState.uiAction = 'find_next_resolution';
                    break;

                case 'edit_cell':
                    // User edited a cell value
                    if (updatedState.uploadedData && updatedState.uploadedData.length > data.rowIndex + 1) {
                        const newData = [...updatedState.uploadedData];
                        newData[data.rowIndex + 1] = [...newData[data.rowIndex + 1]]; // Copy row
                        newData[data.rowIndex + 1][data.colIndex] = data.newValue;
                        updatedState.uploadedData = newData;

                        // Re-analyze if this affects resolution
                        // (This is simplified - in production you'd re-run the analysis)
                    }
                    updatedState.uiAction = 'display_data_grid';
                    break;

                case 'delete_row':
                    // User deleted a row
                    if (updatedState.uploadedData && updatedState.uploadedData.length > data.rowIndex + 1) {
                        const newData = [...updatedState.uploadedData];
                        newData.splice(data.rowIndex + 1, 1); // Remove the row
                        updatedState.uploadedData = newData;

                        // Update resolution state keys (simplified)
                        const newResolutionState = new Map();
                        const resolutionState = updatedState.resolutionState || new Map();
                        for (const [key, item] of resolutionState) {
                            const [rowStr, colStr] = key.split('-');
                            const rowIndex = parseInt(rowStr);
                            if (rowIndex < data.rowIndex) {
                                newResolutionState.set(key, item);
                            } else if (rowIndex > data.rowIndex) {
                                newResolutionState.set(`${rowIndex - 1}-${colStr}`, item);
                            }
                            // Skip items from the deleted row
                        }
                        updatedState.resolutionState = newResolutionState;
                    }
                    updatedState.uiAction = 'display_data_grid';
                    break;

                case 'confirm_submit':
                    // User confirmed submission
                    updatedState.uiAction = 'validate_and_submit';
                    break;

                case 'resolve_all':
                    // User wants to resolve all pending items
                    updatedState.uiAction = 'find_next_resolution';
                    break;

                default:
                    console.warn('📊 Aggregate Data Agent: Unknown interaction type:', type);
                    return currentState;
            }

            // Continue the workflow with updated state
            try {
                const result = await aggregateDataStateGraph.invoke(updatedState);
                return result;
            } catch (error) {
                console.error('📊 Aggregate Data Agent: Failed to continue workflow:', error);
                return {
                    uploadedData: updatedState.uploadedData,
                    resolutionState: updatedState.resolutionState,
                    currentResolution: updatedState.currentResolution,
                    processedData: updatedState.processedData,
                    uiAction: updatedState.uiAction,
                    messages: updatedState.messages,
                    orchestrator: updatedState.orchestrator,
                    finalResult: {
                        success: false,
                        error: `Failed to process interaction: ${error.message}`
                    }
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
