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
	searchDhis2DataSets,

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

// Recovery context interface
export interface RecoveryOption {
    id: string;
    label: string;
    description: string;
    action: () => Promise<Partial<typeof AggregateDataAnnotation.State>>;
}

export interface RecoveryContext {
    failedStep: string;
    errorDetails: any;
    recoveryOptions: RecoveryOption[];
    userGuidance: string;
}

// State annotation for the aggregate data state graph
const AggregateDataAnnotation = Annotation.Root({
    // Recovery context for handling failures
    recoveryContext: Annotation<RecoveryContext | null>({
        reducer: (left, right) => right || left,
        default: () => null
    }),

    // Progress tracking state
    workflowProgress: Annotation<{
        currentStep: number;
        totalSteps: number;
        stepName: string;
        message: string;
        isIndeterminate?: boolean;
    }>({
        reducer: (left, right) => right || left,
        default: () => ({
            currentStep: 0,
            totalSteps: 10,
            stepName: 'Initializing',
            message: 'Preparing data entry workflow...',
            isIndeterminate: true
        }),
    }),

    // Orchestrator reference for UI communication
    orchestrator: Annotation<any>({
        reducer: (left, right) => right || left,
        default: () => null,
    }),

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

    // Resolved data set information (required for DHIS2 data values)
    dataSet: Annotation<{
        id: string;
        name: string;
        resolved: boolean;
    } | null>({
        reducer: (left, right) => right || left,
        default: () => null
    }),

    // Submitted data sets for follow-up operations
    submittedDataSets: Annotation<Map<string, {
        dataSetId: string;
        dataSetName: string;
        submittedData: AggregatedDataValue[];
        submissionDate: Date;
        lastModified?: Date;
    }>>({
        reducer: (left, right) => right || left,
        default: () => new Map()
    }),

    // Display headers for human-readable column labels
    displayHeaders: Annotation<string[]>({
        reducer: (left, right) => right || left,
        default: () => []
    }),

    // Final result
    finalResult: Annotation<any>({
        reducer: (left, right) => right || left,
        default: () => null
    }),
});

// Initialize the ChatOpenAI model with Azure configuration
const model = ChatModels.createAgentModel();

// Progress tracking helper
function updateProgress(step: number, stepName: string, message: string, isIndeterminate = false): Partial<typeof AggregateDataAnnotation.State> {
    return {
        workflowProgress: {
            currentStep: step,
            totalSteps: 10,
            stepName,
            message,
            isIndeterminate
        }
    };
}

// StateGraph Workflow Nodes

// 1. Parse CSV upload or initialize empty grid for data entry
async function parse_csv_upload(state: typeof AggregateDataAnnotation.State): Promise<Partial<typeof AggregateDataAnnotation.State>> {
    console.log('📊 Aggregate Data Agent: Processing data entry request');

    // Update progress
    updateProgress(1, 'Parsing Request', 'Processing your data entry request...', false);
    state.orchestrator?.addProgressMessage('Processing your data entry request...');

    // First, check if dataset is already resolved in the workflow state (from programmatic restart)
    if (state.dataSet?.resolved && state.uploadedData && state.uploadedData.length > 0) {
        console.log('📊 Aggregate Data Agent: Dataset already resolved in workflow state, proceeding with header mapping');

        // Check if we have actual data rows (not just headers)
        const hasDataRows = state.uploadedData.length > 1 &&
            state.uploadedData.slice(1).some(row =>
                row && Array.isArray(row) && row.some(cell =>
                    cell && typeof cell === 'string' && cell.trim().length > 0
                )
            );

        if (hasDataRows) {
            console.log('📊 Aggregate Data Agent: Existing data found, continuing to map headers');
            return {
                uiAction: 'map_headers'
            };
        } else {
            console.log('📊 Aggregate Data Agent: Dataset resolved but no data rows, showing empty grid');
            return {
                uiAction: 'show_data_grid'
            };
        }
    }

    const messages = state.messages || [];
    const userMessage = messages.filter(m => m.role === 'user').pop();

    // Check if dataset is already resolved (continuation from selection) via conversation
    const orchestrator = state.orchestrator as any;
    if (orchestrator && orchestrator.currentUIState?.conversation) {
        // Look for the most recent pre-resolved dataset in the conversation context
        const selectionMessage = orchestrator.currentUIState.conversation
            .filter((msg: any) => msg.type === 'data_set_selection' && msg.data?.selectedDataset)
            .pop(); // Gets the most recent (last) dataset selection

        if (selectionMessage?.data?.selectedDataset) {
            // Check if the previous selection has actual data rows with meaningful content
            const hasExistingData = selectionMessage.data.uploadedData &&
                selectionMessage.data.uploadedData.length > 1 &&
                selectionMessage.data.uploadedData.slice(1).some(row =>
                    row && Array.isArray(row) && row.some(cell =>
                        cell && typeof cell === 'string' && cell.trim().length > 0
                    )
                );

            console.log('📊 Aggregate Data Agent: Previous uploadedData check:', {
                length: selectionMessage.data.uploadedData?.length,
                hasHeaders: selectionMessage.data.uploadedData?.length > 0,
                hasExistingData,
                sampleRow: selectionMessage.data.uploadedData?.[1]
            });

        if (hasExistingData) {
            console.log('📊 Aggregate Data Agent: Dataset already resolved with existing data, continuing workflow');
            return {
                uploadedData: selectionMessage.data.uploadedData,
                dataSet: {
                    id: selectionMessage.data.selectedDataset.id,
                    name: selectionMessage.data.selectedDataset.name,
                    resolved: true
                },
                uiAction: 'map_headers'
            };
        } else {
            console.log('📊 Aggregate Data Agent: Dataset resolved but no existing data, setting dataset and showing grid');
            // Set the dataset and show empty grid for manual entry
            return {
                dataSet: {
                    id: selectionMessage.data.selectedDataset.id,
                    name: selectionMessage.data.selectedDataset.name,
                    resolved: true
                },
                uiAction: 'show_data_grid'
            };
        }
        }
    }

    if (!userMessage || !userMessage.content) {
        return {
            finalResult: {
                success: false,
                error: 'No user message provided'
            }
        };
    }

    // Check if this is a follow-up request for existing data set
    const followUpRequest = await detectFollowUpRequest(userMessage.content, state.submittedDataSets);
    if (followUpRequest) {
        console.log('📊 Aggregate Data Agent: Detected follow-up request:', followUpRequest);
        return await handle_follow_up_request(state, followUpRequest);
    }

    // Check if this is a data value update request
    const isDataValueUpdate = await detectDataValueUpdateIntent(userMessage.content);
    console.log(`📊 Aggregate Data Agent: Data value update intent: ${isDataValueUpdate}`);

    if (isDataValueUpdate) {
        console.log('📊 Aggregate Data Agent: Handling data value update request');
        const updateResult = await handleDataValueUpdate(userMessage.content, state.messages, state.orchestrator);

        if (updateResult.success && updateResult.targetIndex !== undefined) {
            // Update the uploadedData with the new value
            const updatedData = [...state.uploadedData];
            if (updatedData.length > updateResult.targetIndex + 1) {
                // Update the value column (assuming it's the last column)
                const headers = updatedData[0];
                const valueColumnIndex = headers.findIndex(h => h.toLowerCase().includes('value'));
                if (valueColumnIndex >= 0) {
                    updatedData[updateResult.targetIndex + 1][valueColumnIndex] = updateResult.updatedValue.value.toString();
                }
            }

            return {
                uploadedData: updatedData,
                uiAction: 'show_data_grid'
            };
        } else {
            return {
                finalResult: updateResult
            };
        }
    }

    // Extract contextual information from all user messages
    const contextualInfo = await extractContextualInfo(messages);
    console.log('📊 Aggregate Data Agent: Extracted contextual info:', contextualInfo);

    // Check for CSV file content in messages or file registry
    let csvData: string[][] | null = null;
    let hasCSVFile = false;

    // First, check the orchestrator's file registry for uploaded CSV files
    if (state.orchestrator && typeof state.orchestrator.getCurrentFile === 'function') {
        const currentFile = state.orchestrator.getCurrentFile();
        if (currentFile && !currentFile.isBinary && currentFile.type === 'text/csv') {
            try {
                console.log(`📊 Aggregate Data Agent: Found CSV file in registry: ${currentFile.name} (${currentFile.content.length} chars)`);
                csvData = parseCSV(currentFile.content as string);
                hasCSVFile = true;
                console.log('📊 Aggregate Data Agent: Successfully parsed CSV from file registry');
            } catch (error) {
                console.warn('📊 Aggregate Data Agent: Failed to parse CSV from file registry:', error);
            }
        }
    }

    // Fallback: Look for file content in user messages (legacy support)
    if (!hasCSVFile) {
        for (const message of messages) {
            if (message.role === 'user' && message.content?.includes('File:') && message.content?.includes('Content:')) {
                // Extract file content from message
                const contentMatch = message.content.match(/Content:\n([\s\S]*)$/);
                if (contentMatch) {
                    try {
                        csvData = parseCSV(contentMatch[1]);
                        hasCSVFile = true;
                        console.log('📊 Aggregate Data Agent: Found CSV file in message (fallback)');
                        break;
                    } catch (error) {
                        console.warn('📊 Aggregate Data Agent: Failed to parse CSV from message:', error);
                    }
                }
            }
        }
    }

    // Prepare data structure (either from CSV, prompt extraction, or empty grid)
    let headers: string[];
    let dataRows: string[][];

    if (!hasCSVFile || !csvData) {
        console.log('📊 Aggregate Data Agent: No CSV file found, attempting to extract data from prompt');

        // Try to extract data values from the prompt
        const extractedData = await extractDataValuesFromPrompt(userMessage.content);
        console.log('📊 Extracted data from prompt:', extractedData);

        if (extractedData && Object.keys(extractedData).length > 0) {
            console.log('📊 Aggregate Data Agent: Successfully extracted data values from prompt');

            // Create headers for DHIS2 fields
            headers = ['dataElement', 'orgUnit', 'period', 'categoryOptionCombos', 'attributeOptionCombos', 'value'];

            // Handle special case of "current org unit"
            let orgUnitValue = extractedData.orgUnit;
            if (orgUnitValue === 'current org unit') {
                // Get current user's org unit
                const contextualInfo = await extractContextualInfo(messages);
                if (contextualInfo.userOrgUnit) {
                    orgUnitValue = contextualInfo.userOrgUnit.id;
                    console.log(`📊 Resolved "current org unit" to: ${orgUnitValue}`);
                }
            }

            // Create data row from extracted values
            const dataRow = [
                extractedData.dataElement || '',
                orgUnitValue || '',
                extractedData.period || '',
                extractedData.categoryOptionCombos || '',
                extractedData.attributeOptionCombos || '',
                extractedData.value || ''
            ];

            dataRows = [dataRow];
            console.log('📊 Created data row from prompt:', dataRow);
        } else {
            console.log('📊 Aggregate Data Agent: No data values found in prompt, preparing empty data entry grid');

            // Create empty grid with expected column structure
            headers = ['dataElement', 'orgUnit', 'period', 'categoryOptionCombos', 'attributeOptionCombos', 'value'];
            dataRows = []; // Start with no data rows
        }
    } else {
        console.log('📊 Aggregate Data Agent: CSV file found, parsing data');
        headers = csvData[0];
        dataRows = csvData.slice(1);
    }

    return {
        uploadedData: [headers, ...dataRows],
        resolutionState: new Map(),
        uiAction: 'resolve_data_set'
    };

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
            uiAction: 'resolve_data_set'
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

// 1.5. Resolve data set (required for DHIS2 data values)
async function resolve_data_set(state: typeof AggregateDataAnnotation.State): Promise<Partial<typeof AggregateDataAnnotation.State>> {
    console.log('📋 Aggregate Data Agent: Resolving required data set');

    const messages = state.messages || [];
    const userMessage = messages.filter(m => m.role === 'user').pop();

    if (!userMessage || !userMessage.content) {
        return {
            finalResult: {
                success: false,
                error: 'No user message provided for data set resolution'
            }
        };
    }

    // Extract data set name using LLM - collect text from all user messages, excluding file content
    const userMessages = messages.filter(m => m.role === 'user');
    let combinedUserText = '';

    for (const msg of userMessages) {
        let messageText = msg.content || '';

        // Remove file content from this message if present
        if (messageText.includes('File:') && messageText.includes('Content:')) {
            const fileStart = messageText.indexOf('File:');
            if (fileStart > 0) {
                // Keep only the text before the file content
                messageText = messageText.substring(0, fileStart).trim();
            } else {
                // File content is the entire message, skip it
                messageText = '';
            }
        }

        // Add this message's text to the combined text
        if (messageText.trim()) {
            combinedUserText += (combinedUserText ? ' ' : '') + messageText.trim();
        }
    }

    const dataSetName = await extractDataSetNameFromPrompt(combinedUserText);
    console.log('📋 Extracted data set name from user prompt:', dataSetName);

    try {
        let dataSets: any[] = [];
        let searchQuery = dataSetName;

        if (dataSetName) {
            // Search for data sets matching the extracted name
            const searchResult = await searchDhis2DataSets.invoke({
                query: dataSetName,
                limit: 10
            });

            const parsedResult = JSON.parse(searchResult);
            dataSets = parsedResult.results || [];
            console.log(`📋 Found ${dataSets.length} data set matches for "${dataSetName}"`);
        } else {
            // No specific name extracted - search for all available datasets
            console.log('📋 No specific data set name extracted, searching for all available datasets');
            const searchResult = await searchDhis2DataSets.invoke({
                query: '', // Empty query to get all datasets
                limit: 50 // Get more datasets for selection
            });

            const parsedResult = JSON.parse(searchResult);
            dataSets = parsedResult.results || [];
            console.log(`📋 Found ${dataSets.length} total available data sets`);
            searchQuery = 'all available datasets';
        }

        if (dataSets.length === 0) {
            // Instead of terminating, set up recovery context for dataset resolution failure
            const recoveryOptions: RecoveryOption[] = [
                {
                    id: 'create_new_dataset',
                    label: 'Create new data set',
                    description: 'Define and create a new data set for data submission',
                    action: async () => ({
                        uiAction: 'create_new_dataset',
                        recoveryAction: 'create_new_dataset'
                    })
                },
                {
                    id: 'search_again',
                    label: 'Search with different terms',
                    description: 'Try different keywords to find existing data sets',
                    action: async () => ({
                        uiAction: 'search_datasets_again',
                        recoveryAction: 'search_again'
                    })
                },
                {
                    id: 'manual_entry',
                    label: 'Enter data set ID manually',
                    description: 'Provide the exact data set ID if you know it',
                    action: async () => ({
                        uiAction: 'manual_dataset_entry',
                        recoveryAction: 'manual_entry'
                    })
                }
            ];

            return {
                recoveryContext: {
                    failedStep: 'dataset_resolution',
                    errorDetails: {
                        reason: 'No matching data sets found',
                        searchQuery: dataSetName || 'all available datasets'
                    },
                    recoveryOptions,
                    userGuidance: 'No data sets were found matching your request. Choose how to proceed:'
                },
                uiAction: 'show_recovery_options'
            };
        } else if (dataSets.length === 1) {
            // Single match - auto-resolve
            const dataSet = dataSets[0];
            console.log(`📋 Auto-resolving to single data set: ${dataSet.name} (ID: ${dataSet.id})`);

            // Check if we have CSV data (more than just header row)
            const hasCsvData = state.uploadedData.length > 1 && state.uploadedData.slice(1).some(row => row.some(cell => cell && cell.trim()));

            return {
                dataSet: {
                    id: dataSet.id,
                    name: dataSet.name || dataSet.displayName,
                    resolved: true
                },
                uiAction: hasCsvData ? 'map_headers' : 'show_data_grid'
            };
        } else {
            // Multiple matches - show selection UI
            console.log(`📋 Multiple data sets found, showing selection from ${dataSets.length} options`);

            const selectionMessage = {
                type: 'data_set_selection',
                message: `Please select the data set you want to submit data to:`,
                data: {
                    searchQuery: searchQuery,
                    options: dataSets.map(ds => ({
                        id: ds.id,
                        name: ds.name || ds.displayName,
                        description: ds.description || `Data set ${ds.id}`
                    })),
                    allowMultiple: false,
                    // Include uploaded data so orchestrator can continue workflow
                    uploadedData: state.uploadedData
                }
            };

            return {
                finalResult: selectionMessage
            };
        }

    } catch (error) {
        console.error('📋 Data set resolution failed:', error);
        return {
            finalResult: {
                success: false,
                error: `Failed to search for data sets: ${error.message}`
            }
        };
    }
}

// 1. Parse CSV upload or initialize empty grid for data entry
async function parse_csv_upload_old(state: typeof AggregateDataAnnotation.State): Promise<Partial<typeof AggregateDataAnnotation.State>> {
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

    // Check if we have any actual data rows - if not, try to extract from prompt
    const hasDataRows = state.uploadedData.length > 1 &&
        state.uploadedData.slice(1).some(row =>
            row && Array.isArray(row) && row.some(cell =>
                cell && typeof cell === 'string' && cell.trim().length > 0
            )
        );

    if (!hasDataRows) {
        console.log('🧠 No data rows found, attempting prompt extraction in map_csv_headers');

        // Try to extract data values from the prompt
        const extractedData = await extractDataValuesFromPrompt(state.messages[state.messages.length - 1]?.content || '');
        console.log('🧠 Extracted data from prompt in map_csv_headers:', extractedData);

        if (extractedData && Object.keys(extractedData).length > 0) {
            console.log('🧠 Successfully extracted data values from prompt');

            // Create headers for DHIS2 fields
            const headers = ['dataElement', 'orgUnit', 'period', 'categoryOptionCombos', 'attributeOptionCombos', 'value'];

            // Handle special case of "current org unit"
            let orgUnitValue = extractedData.orgUnit;
            if (orgUnitValue === 'current org unit') {
                // Get current user's org unit
                const contextualInfo = await extractContextualInfo(state.messages);
                if (contextualInfo.userOrgUnit) {
                    orgUnitValue = contextualInfo.userOrgUnit.id;
                    console.log(`🧠 Resolved "current org unit" to: ${orgUnitValue}`);
                }
            }

            // Create data row from extracted values
            const dataRow = [
                extractedData.dataElement || '',
                orgUnitValue || '',
                extractedData.period || '',
                extractedData.categoryOptionCombos || '',
                extractedData.attributeOptionCombos || '',
                extractedData.value || ''
            ];

            console.log('🧠 Created data row from prompt:', dataRow);

            // Update state with the extracted data
            state.uploadedData = [headers, dataRow];
        } else {
            console.log('🧠 No data values found in prompt, creating empty grid');
            // Create empty grid with expected column structure
            const headers = ['dataElement', 'orgUnit', 'period', 'categoryOptionCombos', 'attributeOptionCombos', 'value'];
            const emptyRows: string[][] = [];
            state.uploadedData = [headers, ...emptyRows];
        }
    }

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
            displayHeaders: mappingResult.displayLabels,
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
    console.log('📊 Headers:', state.uploadedData[0]);
    console.log('📊 Display Headers:', state.displayHeaders);
    console.log('📊 Dataset:', state.dataSet);

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
        message: `Data set "${state.dataSet?.name || 'Unknown'}" selected. Review and manage your uploaded aggregate data. Resolve any names to IDs before submission.`,
        data: {
            headers: state.uploadedData[0] || [],
            displayHeaders: state.displayHeaders, // Human-readable column headers
            rows: state.uploadedData.slice(1) || [],
            resolutionState: Array.from(state.resolutionState.entries()),
            resourceDetails: resourceDetails, // Include batch validation results for enhanced tooltips
            displayNames: displayNames, // Include display names for showing names in cells
            dataSetId: state.dataSet?.id, // Include dataset ID for submission
            dataSetName: state.dataSet?.name, // Include dataset name for display
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
    console.log('📊 Aggregate Data Agent: All items resolved and display names ready, showing data grid for review');
    return {
        uiAction: 'show_data_grid'
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

    // Instead of terminating, set up recovery context
    const recoveryOptions: RecoveryOption[] = [
        {
            id: 'manual_entry',
            label: 'Enter manually',
            description: `Enter the correct ${item.fieldType} ID manually`,
            action: async () => ({
                uiAction: 'continue_resolution',
                recoveryAction: 'manual_entry',
                fieldType: item.fieldType,
                rowIndex: item.rowIndex,
                colIndex: item.colIndex
            })
        },
        {
            id: 'skip_field',
            label: 'Skip this field',
            description: 'Continue without resolving this field (may cause validation errors)',
            action: async () => ({
                uiAction: 'continue_resolution',
                recoveryAction: 'skip_field',
                fieldType: item.fieldType,
                rowIndex: item.rowIndex,
                colIndex: item.colIndex
            })
        },
        {
            id: 'search_again',
            label: 'Search again',
            description: 'Try a different search term',
            action: async () => ({
                uiAction: 'continue_resolution',
                recoveryAction: 'search_again',
                fieldType: item.fieldType,
                rowIndex: item.rowIndex,
                colIndex: item.colIndex
            })
        }
    ];

    return {
        recoveryContext: {
            failedStep: 'name_resolution',
            errorDetails: {
                fieldType: item.fieldType,
                searchQuery: item.originalValue,
                rowIndex: item.rowIndex,
                colIndex: item.colIndex,
                reason: 'No matches found in DHIS2'
            },
            recoveryOptions,
            userGuidance: `No ${item.fieldType} matches found for "${item.originalValue}". Choose how to proceed:`
        },
        uiAction: 'show_recovery_options'
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

// Recovery functions for handling failures gracefully

// Dataset resolution recovery - when no datasets are found
async function handle_dataset_resolution_recovery(state: typeof AggregateDataAnnotation.State): Promise<Partial<typeof AggregateDataAnnotation.State>> {
    console.log('🔄 Handling dataset resolution recovery');

    const recoveryOptions: RecoveryOption[] = [
        {
            id: 'create_new_dataset',
            label: 'Create new data set',
            description: 'Define and create a new data set for data submission',
            action: async () => ({
                uiAction: 'create_new_dataset',
                recoveryAction: 'create_new_dataset'
            })
        },
        {
            id: 'search_again',
            label: 'Search with different terms',
            description: 'Try different keywords to find existing data sets',
            action: async () => ({
                uiAction: 'search_datasets_again',
                recoveryAction: 'search_again'
            })
        },
        {
            id: 'manual_entry',
            label: 'Enter data set ID manually',
            description: 'Provide the exact data set ID if you know it',
            action: async () => ({
                uiAction: 'manual_dataset_entry',
                recoveryAction: 'manual_entry'
            })
        }
    ];

    return {
        recoveryContext: {
            failedStep: 'dataset_resolution',
            errorDetails: {
                reason: 'No matching data sets found',
                searchQuery: state.messages?.[state.messages.length - 1]?.content || 'Unknown'
            },
            recoveryOptions,
            userGuidance: 'No data sets were found matching your request. Choose how to proceed:'
        },
        uiAction: 'show_recovery_options'
    };
}

// Header mapping recovery - when LLM mapping fails
async function handle_header_mapping_recovery(state: typeof AggregateDataAnnotation.State): Promise<Partial<typeof AggregateDataAnnotation.State>> {
    console.log('🔄 Handling header mapping recovery');

    const recoveryOptions: RecoveryOption[] = [
        {
            id: 'manual_mapping',
            label: 'Map columns manually',
            description: 'Select which CSV columns correspond to DHIS2 fields',
            action: async () => ({
                uiAction: 'manual_header_mapping',
                recoveryAction: 'manual_mapping'
            })
        },
        {
            id: 'use_original_headers',
            label: 'Use original column names',
            description: 'Continue with unmapped headers (may cause resolution issues)',
            action: async () => ({
                uiAction: 'proceed_with_original_headers',
                recoveryAction: 'use_original_headers'
            })
        },
        {
            id: 'retry_mapping',
            label: 'Retry mapping',
            description: 'Try the header mapping process again',
            action: async () => ({
                uiAction: 'retry_header_mapping',
                recoveryAction: 'retry_mapping'
            })
        }
    ];

    return {
        recoveryContext: {
            failedStep: 'header_mapping',
            errorDetails: {
                reason: 'Could not automatically map CSV headers to DHIS2 fields',
                headers: state.uploadedData?.[0] || []
            },
            recoveryOptions,
            userGuidance: 'CSV header mapping failed. Choose how to handle column mapping:'
        },
        uiAction: 'show_recovery_options'
    };
}

// CSV parsing recovery - when CSV parsing fails
async function handle_csv_parsing_recovery(state: typeof AggregateDataAnnotation.State): Promise<Partial<typeof AggregateDataAnnotation.State>> {
    console.log('🔄 Handling CSV parsing recovery');

    const recoveryOptions: RecoveryOption[] = [
        {
            id: 'fix_csv_format',
            label: 'Fix CSV format',
            description: 'Correct formatting issues in your CSV file',
            action: async () => ({
                uiAction: 'show_csv_format_help',
                recoveryAction: 'fix_csv_format'
            })
        },
        {
            id: 'upload_again',
            label: 'Upload corrected file',
            description: 'Upload a corrected version of your CSV file',
            action: async () => ({
                uiAction: 'reupload_csv',
                recoveryAction: 'upload_again'
            })
        },
        {
            id: 'manual_entry',
            label: 'Enter data manually',
            description: 'Switch to manual data entry instead of CSV upload',
            action: async () => ({
                uiAction: 'switch_to_manual_entry',
                recoveryAction: 'manual_entry'
            })
        }
    ];

    return {
        recoveryContext: {
            failedStep: 'csv_parsing',
            errorDetails: {
                reason: 'CSV file could not be parsed due to formatting issues',
                supportedFormat: 'Standard CSV with headers'
            },
            recoveryOptions,
            userGuidance: 'CSV parsing failed. Choose how to resolve the file format issue:'
        },
        uiAction: 'show_recovery_options'
    };
}

// Validation recovery - when data validation fails
async function handle_validation_recovery(state: typeof AggregateDataAnnotation.State): Promise<Partial<typeof AggregateDataAnnotation.State>> {
    console.log('🔄 Handling validation recovery');

    const recoveryOptions: RecoveryOption[] = [
        {
            id: 'fix_validation_errors',
            label: 'Fix validation errors',
            description: 'Review and correct the validation issues highlighted',
            action: async () => ({
                uiAction: 'show_validation_errors',
                recoveryAction: 'fix_validation_errors'
            })
        },
        {
            id: 'submit_anyway',
            label: 'Submit valid data only',
            description: 'Submit only the valid data values, skip invalid ones',
            action: async () => ({
                uiAction: 'submit_valid_only',
                recoveryAction: 'submit_anyway'
            })
        },
        {
            id: 'cancel_submission',
            label: 'Cancel and review',
            description: 'Cancel submission to review and fix all issues',
            action: async () => ({
                uiAction: 'cancel_validation',
                recoveryAction: 'cancel_submission'
            })
        }
    ];

    return {
        recoveryContext: {
            failedStep: 'validation',
            errorDetails: {
                reason: 'Data validation failed - some values do not meet DHIS2 requirements'
            },
            recoveryOptions,
            userGuidance: 'Data validation found issues. Choose how to proceed:'
        },
        uiAction: 'show_recovery_options'
    };
}

// 9. Validate and prepare final data for submission
async function validate_and_submit(state: typeof AggregateDataAnnotation.State): Promise<Partial<typeof AggregateDataAnnotation.State>> {
    console.log('📊 Aggregate Data Agent: Validating and preparing submission');

    const headers = state.uploadedData[0];
    const dataRows = state.uploadedData.slice(1);
    const processedData: AggregatedDataValue[] = [];

    // Check if data set is resolved
    if (!state.dataSet || !state.dataSet.resolved) {
        return {
            finalResult: {
                success: false,
                error: 'No data set selected. Please select a data set before submitting data.'
            }
        };
    }

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

// Detect if this is a follow-up request for existing data sets
async function detectFollowUpRequest(content: string, submittedDataSets: Map<string, any>): Promise<{
    isFollowUp: boolean;
    action: 'update' | 'delete' | 'view' | null;
    dataSetName?: string;
    criteria?: any;
    newValues?: any;
} | null> {
    try {
        const llm = ChatModels.createAnalysisModel();

        const prompt = `
You are detecting follow-up requests for previously submitted DHIS2 data sets. Your task is to identify if the user wants to modify existing data that was already submitted.

EXAMPLES:
- "update row 3 to value 50" → {"isFollowUp": true, "action": "update", "criteria": {"row": 3}, "newValues": {"value": 50}}
- "delete rows where orgUnit is X" → {"isFollowUp": true, "action": "delete", "criteria": {"orgUnit": "X"}}
- "change all values for dataElement Y to Z" → {"isFollowUp": true, "action": "update", "criteria": {"dataElement": "Y"}, "newValues": {"value": "Z"}}
- "add new row with dataElement A, orgUnit B, period C, value D" → {"isFollowUp": true, "action": "update", "criteria": {"newRow": true}, "newValues": {"dataElement": "A", "orgUnit": "B", "period": "C", "value": "D"}}
- "show me the HIV data set" → {"isFollowUp": true, "action": "view", "dataSetName": "HIV"}

INSTRUCTIONS:
1. Check if the request mentions existing data sets or refers to previously submitted data
2. Look for actions like "update", "delete", "change", "modify", "add", "show", "view"
3. Extract the target data set name if mentioned
4. Parse the criteria for which data to modify (rows, filters, etc.)
5. Extract new values if this is an update operation
6. Return null if this is not a follow-up request

USER MESSAGE: "${content}"

Return a JSON object or null if not a follow-up request.`;

        const llmResponse = await llm.invoke([
            { role: "system", content: prompt },
            { role: "user", content: `Analyze follow-up request: ${content}` }
        ]);

        const result = (llmResponse.content as string).trim();

        try {
            const parsed = JSON.parse(result);
            if (parsed && parsed.isFollowUp) {
                // If no data set name specified, try to infer from available data sets
                if (!parsed.dataSetName && submittedDataSets.size === 1) {
                    // If only one data set exists, use it
                    const [dataSetId, dataSetInfo] = Array.from(submittedDataSets.entries())[0];
                    parsed.dataSetName = dataSetInfo.dataSetName;
                }
                return parsed;
            }
        } catch (e) {
            // Not valid JSON, not a follow-up request
        }

        return null;

    } catch (error) {
        console.warn('🔄 Follow-up detection failed:', error);
        return null;
    }
}

// Detect data value update intent
async function detectDataValueUpdateIntent(query: string): Promise<boolean> {
	try {
		console.log('🔄 Aggregate Data Agent: Detecting data value update intent for:', query);

		const detectionPrompt = `
Analyze this user query to determine if they want to update/modify a previously submitted data value.

Examples of data value updates:
- "update the first value to 10"
- "change the second entry to 25"
- "modify value 3 to 15"
- "correct the last data point"
- "fix the third value to 8"
- "update first row to 15"

Return ONLY "true" if this is clearly a request to update a specific data value, otherwise return "false".

Query: "${query}"

Response:`;

		const result = await model.invoke([new HumanMessage(detectionPrompt)]);
		const intent = (result.content as string).trim().toLowerCase();

		return intent === 'true';
	} catch (error) {
		console.error('🔄 Aggregate Data Agent: Data value update intent detection failed:', error);
		return false;
	}
}

// Handle data value update requests
async function handleDataValueUpdate(query: string, conversationHistory: any[], orchestrator?: any): Promise<any> {
	console.log('🔄 Aggregate Data Agent: Processing data value update request:', query);

	try {
		let submittedData = [];

		// First try to get submitted data from orchestrator state
		if (orchestrator?.currentUIState?.submittedDataSets) {
			const submittedDataSets = Array.from(orchestrator.currentUIState.submittedDataSets.values());
			if (submittedDataSets.length > 0) {
				// Get the most recent submission
				const recentSubmission = submittedDataSets[submittedDataSets.length - 1];
				if (recentSubmission.submittedData) {
					submittedData = recentSubmission.submittedData;
					console.log('🔄 Aggregate Data Agent: Found submitted data in orchestrator state:', submittedData.length, 'values');
				}
			}
		}

		// If not found in orchestrator state, try conversation history
		if (!submittedData || submittedData.length === 0) {
			console.log('🔄 Aggregate Data Agent: Looking for submitted data in conversation history');

			// Find recent data submission in conversation history
			const recentSubmission = conversationHistory
				.filter(msg => msg.role === 'assistant')
				.reverse() // Start from most recent
				.find(msg => {
					if (typeof msg.content === 'string') {
						return msg.content.includes('submitted successfully') ||
							   msg.content.includes('data submission') ||
							   msg.content.includes('data values imported');
					}
					return msg.content?.message?.includes('submitted successfully') ||
						   msg.content?.type === 'data_submission_success';
				});

				if (recentSubmission) {
					// Extract submitted data from the conversation message
					const content = recentSubmission.content;
					if (content && typeof content === 'object') {
						const contentObj = content as any; // Type assertion for dynamic content
						if ('submittedData' in contentObj && Array.isArray(contentObj.submittedData)) {
							submittedData = contentObj.submittedData;
						} else if ('data' in contentObj && contentObj.data && typeof contentObj.data === 'object') {
							const dataObj = contentObj.data as any;
							if ('submittedData' in dataObj && Array.isArray(dataObj.submittedData)) {
								submittedData = dataObj.submittedData;
							}
						}
					}
					console.log('🔄 Aggregate Data Agent: Found submitted data in conversation:', Array.isArray(submittedData) ? submittedData.length : 0, 'values');
				}
		}

		// If still not found, try current data grid data
		if (!submittedData || submittedData.length === 0) {
			console.log('🔄 Aggregate Data Agent: Looking for data in current data grid');

			// Check if there's current data grid data
			const currentData = orchestrator?.currentUIState?.conversation?.find((msg: any) =>
				msg.type === 'data_grid' && msg.data?.rows
			);

			if (currentData?.data?.rows) {
				// Convert data grid rows to submitted data format
				submittedData = currentData.data.rows.map((row: any[], index: number) => ({
					dataElement: row[0] || '',
					orgUnit: row[1] || '',
					period: row[2] || '',
					categoryOptionCombos: row[3] || '',
					attributeOptionCombos: row[4] || '',
					value: row[5] || '',
					rowIndex: index
				}));
				console.log('🔄 Aggregate Data Agent: Found data in current grid:', submittedData.length, 'values');
			}
		}

		if (!submittedData || submittedData.length === 0) {
			console.log('🔄 Aggregate Data Agent: No submitted data found anywhere');
			return {
				success: false,
				error: 'No recent data submission found. Please submit data first before updating values.',
				message: 'I couldn\'t find any recently submitted data to update. Please submit your data first, then you can update specific values.'
			};
		}

		// Use LLM to parse the update request and identify which value to update
		const updateParsingPrompt = `
Analyze this data value update request and identify which data value the user wants to update.

Submitted data values:
${JSON.stringify(submittedData, null, 2)}

User request: "${query}"

Please identify:
1. Which data value to update (by index, dataElement, or description)
2. What the new value should be
3. Any additional context about the update

Return a JSON object with:
{
  "targetIndex": number (0-based index in the submitted data array),
  "newValue": any (the new value to set),
  "reasoning": "brief explanation of how you identified the target"
}

If you cannot determine which value to update, return:
{
  "error": "Could not identify which value to update",
  "reasoning": "explanation of the ambiguity"
}`;

		const parseResult = await model.invoke([new HumanMessage(updateParsingPrompt)]);
		const updateSpec = JSON.parse(parseResult.content as string);

		if (updateSpec.error) {
			return {
				success: false,
				error: updateSpec.error,
				message: `I couldn't understand which value you want to update. ${updateSpec.reasoning}`
			};
		}

		const { targetIndex, newValue, reasoning } = updateSpec;

		if (targetIndex < 0 || targetIndex >= submittedData.length) {
			return {
				success: false,
				error: 'Invalid data value index',
				message: `The specified data value index (${targetIndex}) is not valid. There are ${submittedData.length} data values in the recent submission.`
			};
		}

		const targetDataValue = submittedData[targetIndex];

		// Prepare the update payload for DHIS2
		const updatePayload = {
			dataElement: targetDataValue.dataElement,
			period: targetDataValue.period,
			orgUnit: targetDataValue.orgUnit,
			value: newValue,
			...(targetDataValue.categoryOptionCombo && { categoryOptionCombo: targetDataValue.categoryOptionCombo }),
			...(targetDataValue.attributeOptionCombo && { attributeOptionCombo: targetDataValue.attributeOptionCombo })
		};

		console.log('🔄 Aggregate Data Agent: Updating data value:', updatePayload);

		// Call DHIS2 API to update the data value
		const { Dhis2Api } = await import('../utils/app-runtime/dhis2-api');
		const mutationConfig = {
			resource: 'dataValues',
			type: 'create', // DHIS2 uses 'create' for data values (upsert behavior)
			data: updatePayload
		};

		const response = await Dhis2Api.mutate(mutationConfig);

		if (response.success) {
			return {
				success: true,
				message: `Successfully updated data value. Changed ${targetDataValue.value} to ${newValue} for data element in period ${targetDataValue.period}.`,
				updatedValue: {
					...targetDataValue,
					value: newValue,
					previousValue: targetDataValue.value
				},
				targetIndex: targetIndex,
				reasoning: reasoning
			};
		} else {
			return {
				success: false,
				error: response.error || 'DHIS2 API update failed',
				message: `Failed to update the data value: ${response.error || 'Unknown error'}`
			};
		}

	} catch (error) {
		console.error('🔄 Aggregate Data Agent: Data value update error:', error);
		return {
			success: false,
			error: `Data value update processing failed: ${error.message}`,
			message: 'An error occurred while processing your data value update request.'
		};
	}
}

// Handle follow-up requests for existing data sets
async function handle_follow_up_request(state: typeof AggregateDataAnnotation.State, followUpRequest: any): Promise<Partial<typeof AggregateDataAnnotation.State>> {
	console.log('🔄 Handling follow-up request:', followUpRequest);

	const { action, dataSetName, criteria, newValues } = followUpRequest;

	// Find the target data set
	let targetDataSet: any = null;
	for (const [dataSetId, dataSetInfo] of state.submittedDataSets) {
		if (dataSetInfo.dataSetName === dataSetName || dataSetId === dataSetName) {
			targetDataSet = { id: dataSetId, ...dataSetInfo };
			break;
		}
	}

	if (!targetDataSet) {
		return {
			finalResult: {
				success: false,
				error: `Could not find data set "${dataSetName}". Available data sets: ${Array.from(state.submittedDataSets.values()).map(ds => ds.dataSetName).join(', ')}`
			}
		};
	}

	switch (action) {
		case 'view':
			// Load and display the data set
			return await load_and_display_data_set(state, targetDataSet);

		case 'update':
			// Update existing data or add new rows
			return await update_data_set(state, targetDataSet, criteria, newValues);

		case 'delete':
			// Delete data matching criteria
			return await delete_from_data_set(state, targetDataSet, criteria);

		default:
			return {
				finalResult: {
					success: false,
					error: `Unsupported action: ${action}`
				}
			};
	}
}

// Load and display an existing data set
async function load_and_display_data_set(state: typeof AggregateDataAnnotation.State, dataSetInfo: any): Promise<Partial<typeof AggregateDataAnnotation.State>> {
    console.log('📊 Loading data set for display:', dataSetInfo.dataSetName);

    // For now, we'll reconstruct the data from the stored information
    // In a real implementation, you'd query DHIS2 to get the current data
    const rows = (dataSetInfo as any).submittedData?.map((dataValue: any, index: number) => [
        dataValue.dataElement || '',
        dataValue.orgUnit || '',
        dataValue.period || '',
        dataValue.categoryOptionCombo || '',
        dataValue.attributeOptionCombo || '',
        dataValue.value?.toString() || ''
    ]) || [];

    // Set up headers
    const headers = ['dataElement', 'orgUnit', 'period', 'categoryOptionCombos', 'attributeOptionCombos', 'value'];

    // Create data grid with existing data
    const dataGridMessage = {
        type: 'data_grid',
        message: `Viewing data set: ${dataSetInfo.dataSetName} (Last modified: ${dataSetInfo.lastModified || dataSetInfo.submissionDate})`,
        data: {
            headers: headers,
            rows: rows,
            resolutionState: [], // No resolution needed for existing data
            resourceDetails: [],
            displayNames: [], // Would need to be populated
            actions: ['update_data_set', 'edit_cell', 'delete_row', 'add_row'],
            dataSetId: dataSetInfo.dataSetId,
            dataSetName: dataSetInfo.dataSetName,
            isExistingData: true
        }
    };

    return {
        finalResult: dataGridMessage
    };
}

// Update data in an existing data set
async function update_data_set(state: typeof AggregateDataAnnotation.State, dataSetInfo: any, criteria: any, newValues: any): Promise<Partial<typeof AggregateDataAnnotation.State>> {
    console.log('📝 Updating data set:', dataSetInfo.dataSetName, criteria, newValues);

    try {
        // Get the current submitted data for this data set
        const currentData = dataSetInfo.submittedData || [];
        if (currentData.length === 0) {
            return {
                finalResult: {
                    success: false,
                    error: `No data found in data set "${dataSetInfo.dataSetName}" to update`
                }
            };
        }

        // Parse criteria to identify which data values to update
        const { matchedDataValues, updateCount } = parseUpdateCriteria(currentData, criteria);

        if (matchedDataValues.length === 0) {
            return {
                finalResult: {
                    success: false,
                    error: `No data values matched the update criteria: ${JSON.stringify(criteria)}`
                }
            };
        }

        console.log(`📝 Found ${matchedDataValues.length} data values to update`);

        // Prepare data values for DHIS2 API update
        const dataValuesToUpdate = matchedDataValues.map(dataValue => ({
            dataElement: dataValue.dataElement,
            period: dataValue.period,
            orgUnit: dataValue.orgUnit,
            value: newValues.value !== undefined ? newValues.value : dataValue.value,
            ...(dataValue.categoryOptionCombos && { categoryOptionCombo: dataValue.categoryOptionCombos }),
            ...(dataValue.attributeOptionCombos && { attributeOptionCombo: dataValue.attributeOptionCombos })
        }));

        // Update data values in DHIS2
        const { Dhis2Api } = await import('../utils/app-runtime/dhis2-api');
        const updatePromises = dataValuesToUpdate.map(async (dataValue) => {
            const mutationConfig = {
                resource: 'dataValues',
                type: 'create', // DHIS2 uses 'create' for data values (upsert behavior)
                data: dataValue
            };

            try {
                const response = await Dhis2Api.mutate(mutationConfig);
                return { dataValue, success: response.success, error: response.error };
            } catch (error) {
                return { dataValue, success: false, error: error.message };
            }
        });

        const updateResults = await Promise.all(updatePromises);
        const successfulUpdates = updateResults.filter(result => result.success);
        const failedUpdates = updateResults.filter(result => !result.success);

        console.log(`📝 Update results: ${successfulUpdates.length} successful, ${failedUpdates.length} failed`);

        // Update local state if updates were successful
        if (successfulUpdates.length > 0) {
            const updatedDataSets = new Map(state.submittedDataSets);

            // Update the submitted data in the data set
            const updatedData = currentData.map(dataValue => {
                const matchingUpdate = successfulUpdates.find(update =>
                    update.dataValue.dataElement === dataValue.dataElement &&
                    update.dataValue.period === dataValue.period &&
                    update.dataValue.orgUnit === dataValue.orgUnit &&
                    update.dataValue.categoryOptionCombo === dataValue.categoryOptionCombo &&
                    update.dataValue.attributeOptionCombo === dataValue.attributeOptionCombo
                );

                if (matchingUpdate) {
                    return {
                        ...dataValue,
                        value: matchingUpdate.dataValue.value,
                        lastModified: new Date()
                    };
                }
                return dataValue;
            });

            updatedDataSets.set(dataSetInfo.dataSetId, {
                ...dataSetInfo,
                submittedData: updatedData,
                lastModified: new Date()
            });

            // Construct updated grid data for visual refresh
            const updatedGridData = constructGridDataFromSubmittedData(updatedDataSets.get(dataSetInfo.dataSetId)!);

            return {
                submittedDataSets: updatedDataSets,
                finalResult: {
                    success: true,
                    message: `Successfully updated ${successfulUpdates.length} data values in "${dataSetInfo.dataSetName}". ${failedUpdates.length > 0 ? `Failed to update ${failedUpdates.length} values.` : ''}`,
                    data: {
                        updatedCount: successfulUpdates.length,
                        failedCount: failedUpdates.length,
                        criteria,
                        newValues,
                        failedUpdates: failedUpdates.map(f => ({ dataValue: f.dataValue, error: f.error })),
                        // Include updated grid data for UI refresh
                        gridRefresh: {
                            type: 'data_grid',
                            message: `Data set "${dataSetInfo.dataSetName}" updated successfully`,
                            data: updatedGridData
                        }
                    }
                }
            };
        } else {
            return {
                finalResult: {
                    success: false,
                    error: `Failed to update any data values. ${failedUpdates.map(f => f.error).join('; ')}`,
                    data: { failedUpdates }
                }
            };
        }

    } catch (error) {
        console.error('📝 Error updating data set:', error);
        return {
            finalResult: {
                success: false,
                error: `Data set update failed: ${error.message}`
            }
        };
    }
}

// Parse update criteria to identify which data values to update
function parseUpdateCriteria(currentData: AggregatedDataValue[], criteria: any): { matchedDataValues: AggregatedDataValue[], updateCount: number } {
    const matchedDataValues: AggregatedDataValue[] = [];

    // Handle different types of criteria
    if (criteria.row !== undefined) {
        // Update specific row by index
        const rowIndex = parseInt(criteria.row);
        if (rowIndex >= 0 && rowIndex < currentData.length) {
            matchedDataValues.push(currentData[rowIndex]);
        }
    } else if (criteria.dataElement) {
        // Update all data values for a specific data element
        currentData.forEach(dataValue => {
            if (dataValue.dataElement === criteria.dataElement) {
                matchedDataValues.push(dataValue);
            }
        });
    } else if (criteria.orgUnit) {
        // Update all data values for a specific org unit
        currentData.forEach(dataValue => {
            if (dataValue.orgUnit === criteria.orgUnit) {
                matchedDataValues.push(dataValue);
            }
        });
    } else if (criteria.period) {
        // Update all data values for a specific period
        currentData.forEach(dataValue => {
            if (dataValue.period === criteria.period) {
                matchedDataValues.push(dataValue);
            }
        });
    } else if (criteria.newRow) {
        // This would be for adding new rows - not applicable for updates
        console.log('⚠️ parseUpdateCriteria: newRow criteria not supported for updates');
    } else {
        // Default: update all data values if no specific criteria
        console.log('⚠️ parseUpdateCriteria: No specific criteria provided, would update all values');
        matchedDataValues.push(...currentData);
    }

    return {
        matchedDataValues,
        updateCount: matchedDataValues.length
    };
}

// Parse delete criteria to identify which data values to delete
function parseDeleteCriteria(currentData: AggregatedDataValue[], criteria: any): { matchedDataValues: AggregatedDataValue[], updateCount: number } {
    const matchedDataValues: AggregatedDataValue[] = [];

    // Handle different types of criteria
    if (criteria.row !== undefined) {
        // Delete specific row by index
        const rowIndex = parseInt(criteria.row);
        if (rowIndex >= 0 && rowIndex < currentData.length) {
            matchedDataValues.push(currentData[rowIndex]);
        }
    } else if (criteria.dataElement) {
        // Delete all data values for a specific data element
        currentData.forEach(dataValue => {
            if (dataValue.dataElement === criteria.dataElement) {
                matchedDataValues.push(dataValue);
            }
        });
    } else if (criteria.orgUnit) {
        // Delete all data values for a specific org unit
        currentData.forEach(dataValue => {
            if (dataValue.orgUnit === criteria.orgUnit) {
                matchedDataValues.push(dataValue);
            }
        });
    } else if (criteria.period) {
        // Delete all data values for a specific period
        currentData.forEach(dataValue => {
            if (dataValue.period === criteria.period) {
                matchedDataValues.push(dataValue);
            }
        });
    } else {
        // Default: delete all data values if no specific criteria
        console.log('⚠️ parseDeleteCriteria: No specific criteria provided, would delete all values');
        matchedDataValues.push(...currentData);
    }

    return {
        matchedDataValues,
        updateCount: matchedDataValues.length
    };
}

// Construct grid data from submitted data for UI refresh
function constructGridDataFromSubmittedData(dataSetInfo: any): any {
    const headers = ['dataElement', 'orgUnit', 'period', 'categoryOptionCombos', 'attributeOptionCombos', 'value'];

    // Convert submitted data back to grid row format
    const rows = (dataSetInfo.submittedData || []).map((dataValue: AggregatedDataValue) => [
        dataValue.dataElement || '',
        dataValue.orgUnit || '',
        dataValue.period || '',
        dataValue.categoryOptionCombos || '',
        dataValue.attributeOptionCombos || '',
        dataValue.value?.toString() || ''
    ]);

    return {
        headers: headers,
        displayHeaders: ['Data Element', 'Organisation Unit', 'Time Period', 'Category Option Combo', 'Attribute Option Combo', 'Value'],
        rows: rows,
        resolutionState: [], // No resolution needed for existing data
        resourceDetails: [],
        displayNames: [], // Would need to be populated if we want to show names
        dataSetId: dataSetInfo.dataSetId,
        dataSetName: dataSetInfo.dataSetName,
        isExistingData: true,
        actions: ['update_data_set', 'edit_cell', 'delete_row', 'add_row']
    };
}





// Delete data from an existing data set
async function delete_from_data_set(state: typeof AggregateDataAnnotation.State, dataSetInfo: any, criteria: any): Promise<Partial<typeof AggregateDataAnnotation.State>> {
    console.log('🗑️ Deleting from data set:', dataSetInfo.dataSetName, criteria);

    try {
        // Get the current submitted data for this data set
        const currentData = dataSetInfo.submittedData || [];
        if (currentData.length === 0) {
            return {
                finalResult: {
                    success: false,
                    error: `No data found in data set "${dataSetInfo.dataSetName}" to delete`
                }
            };
        }

        // Parse criteria to identify which data values to delete
        const { matchedDataValues, updateCount } = parseDeleteCriteria(currentData, criteria);

        if (matchedDataValues.length === 0) {
            return {
                finalResult: {
                    success: false,
                    error: `No data values matched the delete criteria: ${JSON.stringify(criteria)}`
                }
            };
        }

        console.log(`🗑️ Found ${matchedDataValues.length} data values to delete`);

        // Prepare data values for DHIS2 API delete
        const deletePromises = matchedDataValues.map(async (dataValue) => {
            const deleteParams = new URLSearchParams({
                de: dataValue.dataElement,
                pe: dataValue.period,
                ou: dataValue.orgUnit
            });

            // Add optional parameters
            if (dataValue.categoryOptionCombos) {
                deleteParams.append('co', dataValue.categoryOptionCombos);
            }
            if (dataValue.attributeOptionCombos) {
                deleteParams.append('cc', dataValue.attributeOptionCombos);
            }

            const mutationConfig = {
                resource: `dataValues?${deleteParams.toString()}`,
                type: 'delete'
            };

            try {
                const { Dhis2Api } = await import('../utils/app-runtime/dhis2-api');
                const response = await Dhis2Api.mutate(mutationConfig);
                return { dataValue, success: response.success, error: response.error };
            } catch (error) {
                return { dataValue, success: false, error: error.message };
            }
        });

        const deleteResults = await Promise.all(deletePromises);
        const successfulDeletes = deleteResults.filter(result => result.success);
        const failedDeletes = deleteResults.filter(result => !result.success);

        console.log(`🗑️ Delete results: ${successfulDeletes.length} successful, ${failedDeletes.length} failed`);

        // Update local state if deletes were successful
        if (successfulDeletes.length > 0) {
            const updatedDataSets = new Map(state.submittedDataSets);

            // Remove deleted data values from the submitted data
            const remainingData = currentData.filter(dataValue => {
                return !successfulDeletes.some(deleteResult => {
                    const deleted = deleteResult.dataValue;
                    return dataValue.dataElement === deleted.dataElement &&
                           dataValue.period === deleted.period &&
                           dataValue.orgUnit === deleted.orgUnit &&
                           dataValue.categoryOptionCombos === deleted.categoryOptionCombos &&
                           dataValue.attributeOptionCombos === deleted.attributeOptionCombos;
                });
            });

            updatedDataSets.set(dataSetInfo.dataSetId, {
                ...dataSetInfo,
                submittedData: remainingData,
                lastModified: new Date()
            });

            return {
                submittedDataSets: updatedDataSets,
                finalResult: {
                    success: true,
                    message: `Successfully deleted ${successfulDeletes.length} data values from "${dataSetInfo.dataSetName}". ${failedDeletes.length > 0 ? `Failed to delete ${failedDeletes.length} values.` : ''}`,
                    data: {
                        deletedCount: successfulDeletes.length,
                        failedCount: failedDeletes.length,
                        criteria,
                        failedDeletes: failedDeletes.map(f => ({ dataValue: f.dataValue, error: f.error }))
                    }
                }
            };
        } else {
            return {
                finalResult: {
                    success: false,
                    error: `Failed to delete any data values. ${failedDeletes.map(f => f.error).join('; ')}`,
                    data: { failedDeletes }
                }
            };
        }

    } catch (error) {
        console.error('🗑️ Error deleting from data set:', error);
        return {
            finalResult: {
                success: false,
                error: `Data set delete failed: ${error.message}`
            }
        };
    }
}

// Extract data set name from user prompt using LLM
async function extractDataSetNameFromPrompt(content: string): Promise<string | null> {
    try {
        const llm = ChatModels.createAnalysisModel();

        const prompt = `
You are extracting data set names from user messages about DHIS2 data entry. Your task is to identify the specific data set the user wants to submit data to.

EXAMPLES:
- "Submit data to HIV Monthly Report" → "HIV Monthly Report"
- "Upload CSV to Malaria Surveillance dataset" → "Malaria Surveillance"
- "Enter data for TB Quarterly Report" → "TB Quarterly Report"
- "Send to EPI Monthly Data Set" → "EPI Monthly Data Set"
- "Upload to the COVID-19 Weekly Report" → "COVID-19 Weekly Report"

INSTRUCTIONS:
1. Look for explicit data set names in phrases like "to [name]", "for [name]", "dataset [name]", etc.
2. Common patterns: "[Disease/Program] [Frequency] [Type]" (e.g., "HIV Monthly Report")
3. Return only the data set name, not the full sentence
4. If no clear data set name is found, return null

USER MESSAGE: "${content}"

Return only the extracted data set name or null if none found. Do not include any other text or explanation.`;

        const llmResponse = await llm.invoke([
            { role: "system", content: prompt },
            { role: "user", content: `Extract data set name from: ${content}` }
        ]);

        const extractedName = (llmResponse.content as string).trim();

        // Return null if no name was extracted or if it's just whitespace/null
        if (!extractedName || extractedName.toLowerCase() === 'null') {
            return null;
        }

        return extractedName;

    } catch (error) {
        console.warn('📋 LLM data set extraction failed:', error);
        return null;
    }
}

// Extract data values from user prompt using LLM
async function extractDataValuesFromPrompt(content: string): Promise<{
    dataElement?: string;
    orgUnit?: string;
    period?: string;
    categoryOptionCombos?: string;
    attributeOptionCombos?: string;
    value?: string;
} | null> {
    try {
        const llm = ChatModels.createAnalysisModel();

        const prompt = `
You are extracting structured data values from user messages about DHIS2 data entry. Your task is to identify specific data values for aggregate data submission.

EXAMPLES:
- "Upload data values for data set Treatment (EpiC Monthly) with org unit current org unit, data element TLYIar0a2BT, period 202508, category option combo hKuYaCaEngt, attribute option combo wh2f4cUgrD1 and value 6"
  → {"dataElement": "TLYIar0a2BT", "orgUnit": "current org unit", "period": "202508", "categoryOptionCombos": "hKuYaCaEngt", "attributeOptionCombos": "wh2f4cUgrD1", "value": "6"}

- "Submit data for Malaria cases: data element MAL_CASES, period 202401, value 150, category combo MAL_DISAGG"
  → {"dataElement": "MAL_CASES", "period": "202401", "categoryOptionCombos": "MAL_DISAGG", "value": "150"}

- "Enter HIV test results: org unit Central Hospital, data element HIV_TESTS, period 202412, value 25"
  → {"orgUnit": "Central Hospital", "dataElement": "HIV_TESTS", "period": "202412", "value": "25"}

INSTRUCTIONS:
1. Extract specific values for each DHIS2 field: dataElement, orgUnit, period, categoryOptionCombos, attributeOptionCombos, value
2. Look for patterns like "data element [ID/name]", "org unit [ID/name]", "period [value]", "category option combo [ID]", "attribute option combo [ID]", "value [number]"
3. For orgUnit, preserve "current org unit" as-is if mentioned - it will be resolved later
4. Return only the extracted fields that are explicitly mentioned
5. If no structured data values are found, return null
6. Return a JSON object with the extracted fields

USER MESSAGE: "${content}"

Return a JSON object with the extracted data values, or null if none found.`;

        const llmResponse = await llm.invoke([
            { role: "system", content: prompt },
            { role: "user", content: `Extract data values from: ${content}` }
        ]);

        const result = (llmResponse.content as string).trim();

        try {
            const parsed = JSON.parse(result);
            if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
                return parsed;
            }
        } catch (e) {
            // Not valid JSON, not data values found
        }

        return null;

    } catch (error) {
        console.warn('📊 LLM data values extraction failed:', error);
        return null;
    }
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

// Generate human-readable display labels for DHIS2 field names
function generateDisplayLabels(fieldMappings: (string | null)[], originalHeaders: string[]): string[] {
    const fieldLabels: Record<string, string> = {
        'dataElement': 'Data Element',
        'orgUnit': 'Organisation Unit',
        'period': 'Time Period',
        'categoryOptionCombos': 'Category Option Combo',
        'attributeOptionCombos': 'Attribute Option Combo',
        'value': 'Value'
    };

    return fieldMappings.map((field, index) => {
        if (!field) return originalHeaders[index] || 'Unknown'; // Use original header name instead of 'Unknown'
        return fieldLabels[field] || field.charAt(0).toUpperCase() + field.slice(1);
    });
}

// Use LLM to intelligently map CSV headers to DHIS2 required fields
async function mapHeadersWithLLM(headers: string[], requiredFields: Record<string, string>): Promise<{
    mappings: (string | null)[];
    displayLabels: string[];
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

            // Generate display labels from the mappings
            const displayLabels = generateDisplayLabels(result.mappings, headers);

            return {
                mappings: result.mappings,
                displayLabels,
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
    displayLabels: string[];
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

    // Generate display labels from the mappings
    const displayLabels = generateDisplayLabels(mappings, headers);

    // Find unmapped required fields
    const unmappedRequired = Object.keys(requiredFields).filter(field => !mappedFields.has(field));

    return {
        mappings,
        displayLabels,
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
aggregateDataWorkflow.addNode('resolve_data_set', resolve_data_set);
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

// Recovery nodes
aggregateDataWorkflow.addNode('handle_dataset_resolution_recovery', handle_dataset_resolution_recovery);
aggregateDataWorkflow.addNode('handle_header_mapping_recovery', handle_header_mapping_recovery);
aggregateDataWorkflow.addNode('handle_csv_parsing_recovery', handle_csv_parsing_recovery);
aggregateDataWorkflow.addNode('handle_validation_recovery', handle_validation_recovery);

// Add edges
// @ts-ignore
aggregateDataWorkflow.addEdge(START, 'parse_csv_upload');

// Conditional routing based on uiAction
// @ts-ignore
aggregateDataWorkflow.addConditionalEdges('parse_csv_upload', (state) => {
    if (state.uiAction === 'resolve_data_set') return 'resolve_data_set';
    if (state.uiAction === 'map_headers') return 'map_csv_headers';
    if (state.uiAction === 'show_data_grid') return 'display_data_grid';
    return END;
});

// @ts-ignore
aggregateDataWorkflow.addConditionalEdges('resolve_data_set', (state) => {
    if (state.uiAction === 'map_headers') return 'map_csv_headers';
    return END; // For multiple matches or no matches, finalResult is set
});

// @ts-ignore
aggregateDataWorkflow.addConditionalEdges('map_csv_headers', (state) => {
    if (state.uiAction === 'fetch_names') return 'fetch_display_names';
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
    if (state.recoveryContext) {
        return 'handle_dataset_resolution_recovery'; // Route to recovery if context is set
    }
    return END; // Wait for user to handle error
});

// @ts-ignore
aggregateDataWorkflow.addConditionalEdges('apply_resolution_selection', (state) => {
    return 'find_next_resolution';
});

// @ts-ignore
aggregateDataWorkflow.addEdge('validate_and_submit', END);


// Compile the workflow
export const aggregateDataStateGraph = aggregateDataWorkflow.compile();

// Full-featured aggregate data agent using StateGraph workflow
export function createAggregateDataAgent(orchestrator: any) {
    return {
        invoke: async (input: any) => {
            console.log('📊 Aggregate Data Agent: Processing aggregate data request with StateGraph workflow');

            const initialState: Partial<typeof AggregateDataAnnotation.State> = {
                messages: input.messages || [],
                orchestrator: orchestrator,
                uploadedData: [],
                resolutionState: new Map(),
                currentResolution: null,
                processedData: [],
                uiAction: '',
                resourceDetails: new Map(),
                displayNames: new Map(),
                finalResult: null
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
