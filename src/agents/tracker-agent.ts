import {Annotation, END, START, StateGraph} from '@langchain/langgraph/web';
import {mapToDhis2TrackerFormat, processScannedRegister, registerTrackerEntities,} from '../utils/tools/metadata';
import {matchPdfHeadersToMapping} from '../utils/tools/metadata/header-matching';
import {dhis2Config} from '../utils/env-config';

// Types for tracker data processing
export interface ExtractedPatientData {
    [key: string]: {
        value: string;
        confidence: number;
    };
}

export interface TrackerDataValue {
    trackedEntityInstance: string; // TEI ID
    program: string; // Program ID
    orgUnit: string; // Org unit ID
    enrollmentDate: string; // ISO date string
    incidentDate?: string; // ISO date string
    attributes: Array<{
        attribute: string; // Attribute ID
        value: string;
    }>;
    events?: Array<{
        programStage: string; // Stage ID
        orgUnit: string; // Org unit ID
        eventDate: string; // ISO date string
        dataValues: Array<{
            dataElement: string; // Data element ID
            value: string;
        }>;
    }>;
}

// Recovery context interface for tracker agent
export interface TrackerRecoveryContext {
    failedStep: string;
    errorDetails: any;
    recoveryOptions: RecoveryOption[];
    userGuidance: string;
}

export interface RecoveryOption {
    id: string;
    label: string;
    description: string;
    action: () => Promise<Partial<typeof TrackerDataAnnotation.State>>;
}

// State annotation for the tracker data state graph
const TrackerDataAnnotation = Annotation.Root({
    // Recovery context for handling failures
    recoveryContext: Annotation<TrackerRecoveryContext | null>({
        reducer: (left, right) => right || left,
        default: () => null
    }),

    // Document processing state
    uploadedDocument: Annotation<{
        buffer: Uint8Array;
        filename: string;
        url?: string;
        sasUrl?: string;
    } | null>({
        reducer: (left, right) => right || left,
        default: () => null
    }),

    // Processing state
    extractedPatients: Annotation<ExtractedPatientData[]>({
        reducer: (left, right) => right || left,
        default: () => []
    }),

    // Mapping state
    mappedTrackerData: Annotation<TrackerDataValue[]>({
        reducer: (left, right) => right || left,
        default: () => []
    }),

    // Configuration state
    orgUnit: Annotation<string>({
        reducer: (left, right) => right || left,
        default: () => ''
    }),

    // Org unit resolution state
    extractedOrgUnit: Annotation<string>({
        reducer: (left, right) => right || left,
        default: () => ''
    }),

    resolvedOrgUnit: Annotation<{id: string, name: string} | null>({
        reducer: (left, right) => right || left,
        default: () => null
    }),

    // Attribute metadata state for dynamic input rendering
    attributeMetadata: Annotation<Record<string, {
        valueType: string;
        optionSet?: { id: string; name: string; options: Array<{ id: string; name: string }> };
        mandatory?: boolean;
        unique?: boolean;
    }>>({
        reducer: (left, right) => right || left,
        default: () => ({})
    }),

    programId: Annotation<string>({
        reducer: (left, right) => right || left,
        default: () => ''
    }),

    attributeMappings: Annotation<Record<string, string>>({
        reducer: (left, right) => right || left,
        default: () => ({})
    }),

    headerDisplayNames: Annotation<Record<string, string>>({
        reducer: (left, right) => right || left,
        default: () => ({})
    }),

    // UI state and actions
    uiAction: Annotation<string>({
        reducer: (left, right) => right || left,
        default: () => ''
    }),

    // Review state - for showing data grid before saving
    showReviewGrid: Annotation<boolean>({
        reducer: (left, right) => right !== undefined ? right : left,
        default: () => false
    }),

    userConfirmedSave: Annotation<boolean>({
        reducer: (left, right) => right !== undefined ? right : left,
        default: () => false
    }),

    // Editing mode for tracking when user is editing data
    editingMode: Annotation<boolean>({
        reducer: (left, right) => right !== undefined ? right : left,
        default: () => false
    }),

    // Track modified data during editing sessions
    modifiedData: Annotation<Record<string, any>>({
        reducer: (left, right) => right || left,
        default: () => ({})
    }),

    // Track entity operations performed during session
    entityOperations: Annotation<Array<{action: string, entityId: string, data: any, timestamp: number}>>({
        reducer: (left, right) => right ? [...left, ...right] : left,
        default: () => []
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

// StateGraph Workflow Nodes

// 1. Handle document upload and initial validation
async function handle_document_upload(state: typeof TrackerDataAnnotation.State): Promise<Partial<typeof TrackerDataAnnotation.State>> {
    console.log('📄 Tracker Data Agent: Processing document upload request');

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

    // Get the current file from orchestrator (primary method)
    let fileBuffer: Uint8Array | null = null;
    let filename = 'uploaded_document.pdf';

    if (state.orchestrator && typeof state.orchestrator.getCurrentFile === 'function') {
        const fileEntry = state.orchestrator.getCurrentFile();
        if (fileEntry && fileEntry.content) {
            // Handle binary vs text files appropriately
            if (fileEntry.isBinary) {
                // For binary files, content should be Uint8Array
                fileBuffer = fileEntry.content as Uint8Array;
            } else {
                // For text files, content is string - encode to UTF-8 bytes
                fileBuffer = typeof fileEntry.content === 'string'
                    ? new TextEncoder().encode(fileEntry.content)
                    : fileEntry.content as Uint8Array;
            }
            filename = fileEntry.name;
            console.log(`📄 Tracker Data Agent: Retrieved current file from orchestrator: ${filename} (${fileBuffer.length} bytes, ${fileEntry.isBinary ? 'binary' : 'text'})`);
        } else {
            console.warn('📄 Tracker Data Agent: No current file available in orchestrator, trying file registry fallback');
        }
    } else {
        console.warn('📄 Tracker Data Agent: Orchestrator does not support current file retrieval, trying file registry fallback');
    }

    // Fallback: Get file from registry directly if getCurrentFile failed
    if (!fileBuffer && state.orchestrator && typeof state.orchestrator.listFiles === 'function') {
        const allFiles = state.orchestrator.listFiles();
        console.log(`📄 Tracker Data Agent: Found ${allFiles.length} files in registry`);

        // Find the most recent PDF or image file (by uploadedAt timestamp)
        const documentFiles = allFiles
            .filter(file => {
                const mimeType = file.type.toLowerCase();
                return mimeType.includes('pdf') ||
                       mimeType.includes('image/') ||
                       mimeType.includes('jpeg') ||
                       mimeType.includes('png') ||
                       mimeType.includes('jpg') ||
                       mimeType.includes('tiff') ||
                       mimeType.includes('bmp');
            })
            .sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0)); // Most recent first

        if (documentFiles.length > 0) {
            const latestFile = documentFiles[0];
            console.log(`📄 Tracker Data Agent: Using most recent document file from registry: ${latestFile.name} (${latestFile.size} bytes, uploaded at ${new Date(latestFile.uploadedAt || 0).toISOString()})`);

            // Handle binary vs text files appropriately
            if (latestFile.isBinary) {
                // For binary files, content should be Uint8Array
                fileBuffer = latestFile.content as Uint8Array;
            } else {
                // For text files, content is string - encode to UTF-8 bytes
                fileBuffer = typeof latestFile.content === 'string'
                    ? new TextEncoder().encode(latestFile.content)
                    : latestFile.content as Uint8Array;
            }
            filename = latestFile.name;
        } else {
            console.warn('📄 Tracker Data Agent: No PDF or image files found in registry');
        }
    }

    // Fallback: Check for file references in messages (for backward compatibility)
    if (!fileBuffer) {
        // Look for file references in user messages
        for (const message of messages) {
            if (message.role === 'user') {
                let fileId: string | null = null;

                // Check attachments array for file references (secondary method)
                if (message.attachments && message.attachments.length > 0) {
                    for (const attachment of message.attachments) {
                        if (attachment.id && attachment.id.startsWith('file_')) {
                            fileId = attachment.id;
                            console.log(`📄 Tracker Data Agent: Found file reference in attachments (fallback): ${fileId}`);
                            break;
                        }
                    }
                }

                // Fallback: Check for file reference pattern in content (e.g., "file:abc123")
                if (!fileId && message.content) {
                    const fileRefMatch = message.content.match(/file:([a-zA-Z0-9_-]+)/);
                    if (fileRefMatch) {
                        fileId = fileRefMatch[1];
                        console.log(`📄 Tracker Data Agent: Found file reference in content (fallback): ${fileId}`);
                    }
                }

                // If we found a file reference, retrieve the file
                if (fileId) {
                    if (state.orchestrator && typeof state.orchestrator.getFile === 'function') {
                        const fileEntry = state.orchestrator.getFile(fileId);
                        if (fileEntry && fileEntry.content) {
                            // Handle binary vs text files appropriately
                            if (fileEntry.isBinary) {
                                // For binary files, content should be Uint8Array
                                fileBuffer = fileEntry.content as Uint8Array;
                            } else {
                                // For text files, content is string - encode to UTF-8 bytes
                                fileBuffer = typeof fileEntry.content === 'string'
                                    ? new TextEncoder().encode(fileEntry.content)
                                    : fileEntry.content as Uint8Array;
                            }
                            filename = fileEntry.name;
                            console.log(`📄 Tracker Data Agent: Retrieved file from orchestrator (fallback): ${filename} (${fileBuffer.length} bytes, ${fileEntry.isBinary ? 'binary' : 'text'})`);
                            break;
                        } else {
                            console.warn(`📄 Tracker Data Agent: File reference ${fileId} not found in orchestrator`);
                        }
                    } else {
                        console.warn('📄 Tracker Data Agent: Orchestrator does not support file retrieval');
                    }
                }

                // Fallback: Look for legacy file content (for backward compatibility)
                if (!fileBuffer && message.content && message.content.includes('File:') && message.content.includes('Content:')) {
                    const contentMatch = message.content.match(/File:\s*([^\n]+)\nContent:\n([\s\S]*)$/);
                    if (contentMatch) {
                        const [, extractedFilename, fileContent] = contentMatch;
                        try {
                            // Convert content to Uint8Array
                            const binaryString = typeof fileContent === 'string' ? fileContent : String(fileContent);
                            const bytes = new Uint8Array(binaryString.length);
                            for (let i = 0; i < binaryString.length; i++) {
                                bytes[i] = binaryString.charCodeAt(i);
                            }
                            fileBuffer = bytes;
                            filename = extractedFilename;
                            console.log('📄 Tracker Data Agent: Found legacy file content in message');
                        } catch (error) {
                            console.warn('📄 Tracker Data Agent: Failed to parse legacy file content:', error);
                        }
                    }
                }
            }
        }
    }

    if (!fileBuffer) {
        return {
            finalResult: {
                success: false,
                error: 'No document file provided. Please upload a PDF or image file containing tracker data.'
            }
        };
    }

    console.log(`📄 Tracker Data Agent: Document ready for processing: ${filename} (${fileBuffer.length} bytes)`);

    return {
        uploadedDocument: {
            buffer: fileBuffer,
            filename
        },
        uiAction: 'process_document'
    };
}

// 2. Process document directly with Azure Document Intelligence
async function extract_patient_data(state: typeof TrackerDataAnnotation.State): Promise<Partial<typeof TrackerDataAnnotation.State>> {
    if (!state.uploadedDocument) {
        return { uiAction: 'handle_document_upload' };
    }

    console.log('📄 Tracker Data Agent: Extracting patient data from document using Azure Document Intelligence');

    try {
        const extractionResult = await processScannedRegister.invoke({
            fileBuffer: state.uploadedDocument.buffer,
            filename: state.uploadedDocument.filename
        });

        const parsedResult = JSON.parse(extractionResult);
        if (!parsedResult.success) {
            return {
                finalResult: {
                    success: false,
                    error: `Data extraction failed: ${parsedResult.error}`,
                    type: 'tracker_processing_error'
                }
            };
        }

        console.log(`📄 Tracker Data Agent: Extracted ${parsedResult.patients.length} patient records`);

        return {
            extractedPatients: parsedResult.patients,
            extractedOrgUnit: parsedResult.extractedOrgUnit || '',
            uiAction: 'resolve_org_unit'
        };

    } catch (error) {
        console.error('📄 Tracker Data Agent: Data extraction failed:', error);
        return {
            finalResult: {
                success: false,
                error: `Failed to extract patient data: ${error.message}`
            }
        };
    }
}

// 3. Resolve organisation unit from extracted data
async function resolve_org_unit(state: typeof TrackerDataAnnotation.State): Promise<Partial<typeof TrackerDataAnnotation.State>> {
    if (!state.extractedOrgUnit) {
        console.log('📍 Tracker Data Agent: No org unit extracted from document, using default');
        return {
            resolvedOrgUnit: null, // No resolution needed
            uiAction: 'map_to_tracker_format'
        };
    }

    console.log(`📍 Tracker Data Agent: Resolving org unit "${state.extractedOrgUnit}" from extracted data`);

    try {
        // Import the search tool
        const { searchDhis2OrganisationUnits } = await import('../utils/tools/metadata/structured-tools');

        // Search for organisation units by name
        const searchResult = await searchDhis2OrganisationUnits.invoke({
            query: state.extractedOrgUnit,
            limit: 10
        });

        const parsedResult = JSON.parse(searchResult);
        const orgUnits = parsedResult.organisationUnits || [];

        console.log(`📍 Tracker Data Agent: Found ${orgUnits.length} potential org unit matches`);

        if (orgUnits.length === 0) {
            console.log('📍 Tracker Data Agent: No org units found for extracted name');
            return {
                resolvedOrgUnit: null,
                uiAction: 'map_to_tracker_format' // Continue with default
            };
        }

        if (orgUnits.length === 1) {
            // Exact match - auto-resolve
            const orgUnit = orgUnits[0];
            console.log(`📍 Tracker Data Agent: Auto-resolved to org unit: ${orgUnit.name} (${orgUnit.id})`);
            return {
                resolvedOrgUnit: { id: orgUnit.id, name: orgUnit.name },
                uiAction: 'map_to_tracker_format'
            };
        }

        // Multiple matches - need user selection
        console.log('📍 Tracker Data Agent: Multiple org unit matches found, pausing for user selection');

        // Return result indicating user interaction is needed for org unit selection
        // This will trigger the MetadataSelector component with single select mode
        return {
            finalResult: {
                type: 'select_org_unit',
                message: `Found ${orgUnits.length} organisation units matching "${state.extractedOrgUnit}". Please select the correct one:`,
                data: {
                    extractedOrgUnit: state.extractedOrgUnit,
                    selectionOptions: orgUnits.map(ou => ({
                        id: ou.id,
                        name: ou.name,
                        type: 'organisationUnit' as const
                    })),
                    originalQuery: state.extractedOrgUnit,
                    allowMultiple: false,
                    requiresUserAction: true,
                    actions: ['select_org_unit', 'use_default', 'manual_entry']
                },
                requiresUserAction: true
            }
        };

    } catch (error) {
        console.error('📍 Tracker Data Agent: Failed to resolve org unit:', error);
        // Continue with default org unit on search failure
        return {
            resolvedOrgUnit: null,
            uiAction: 'map_to_tracker_format'
        };
    }
}

// 4. Fetch attribute metadata for dynamic input rendering
async function fetch_attribute_metadata(state: typeof TrackerDataAnnotation.State): Promise<Partial<typeof TrackerDataAnnotation.State>> {
    if (!state.programId) {
        console.log('📋 Tracker Data Agent: No program ID available, skipping attribute metadata fetch');
        return {
            attributeMetadata: {},
            uiAction: 'map_to_tracker_format'
        };
    }

    console.log(`📋 Tracker Data Agent: Fetching attribute metadata for program: ${state.programId}`);

    try {
        // Import the attribute fetching tool
        const { getDhis2TrackedEntityAttributeById } = await import('../utils/tools/metadata/structured-tools');

        // Get all attribute IDs from the attribute mappings
        const attributeIds = Object.values(state.attributeMappings || {});
        if (attributeIds.length === 0) {
            console.log('📋 Tracker Data Agent: No attribute mappings found, fetching from program');

            // If no mappings, try to fetch program attributes
            const { fetchProgramAttributes } = await import('../utils/tools/metadata/structured-tools');
            const programData = await fetchProgramAttributes(state.programId);
            Object.keys(programData.attributes).forEach(attrId => attributeIds.push(attrId));
        }

        console.log(`📋 Tracker Data Agent: Fetching metadata for ${attributeIds.length} attributes`);

        // Fetch metadata for each attribute
        const attributeMetadata: Record<string, any> = {};

        for (const attributeId of attributeIds) {
            try {
                console.log(`📋 Fetching metadata for attribute: ${attributeId}`);
                const result = await getDhis2TrackedEntityAttributeById.invoke({ id: attributeId });
                const parsedResult = JSON.parse(result);

                if (parsedResult.success && parsedResult.data) {
                    const attr = parsedResult.data;

                    // Extract relevant metadata for input rendering
                    attributeMetadata[attributeId] = {
                        valueType: attr.valueType,
                        mandatory: attr.mandatory || false,
                        unique: attr.unique || false
                    };

                    // Handle option sets for dropdowns
                    if (attr.optionSet) {
                        // Fetch option set values
                        const { getDhis2OptionSetById } = await import('../utils/tools/metadata/structured-tools');
                        const optionSetResult = await getDhis2OptionSetById.invoke({ id: attr.optionSet.id });
                        const parsedOptionSet = JSON.parse(optionSetResult);

                        if (parsedOptionSet.success && parsedOptionSet.data) {
                            attributeMetadata[attributeId].optionSet = {
                                id: attr.optionSet.id,
                                name: attr.optionSet.name,
                                options: parsedOptionSet.data.options?.map((opt: any) => ({
                                    id: opt.id,
                                    name: opt.name
                                })) || []
                            };
                        }
                    }

                    console.log(`📋 Fetched metadata for ${attr.name} (${attributeId}): ${attr.valueType}`);
                }
            } catch (error) {
                console.warn(`📋 Failed to fetch metadata for attribute ${attributeId}:`, error);
                // Continue with other attributes
            }
        }

        console.log(`📋 Tracker Data Agent: Fetched metadata for ${Object.keys(attributeMetadata).length} attributes`);

        return {
            attributeMetadata,
            uiAction: 'map_to_tracker_format'
        };

    } catch (error) {
        console.error('📋 Tracker Data Agent: Failed to fetch attribute metadata:', error);
        // Continue with empty metadata (will use default input types)
        return {
            attributeMetadata: {},
            uiAction: 'map_to_tracker_format'
        };
    }
}

// 5. Map extracted data to DHIS2 tracker format
async function map_to_tracker_format(state: typeof TrackerDataAnnotation.State): Promise<Partial<typeof TrackerDataAnnotation.State>> {
    if (!state.extractedPatients || state.extractedPatients.length === 0) {
        console.log('📄 Tracker Data Agent: No patient records found in document');
        return {
            finalResult: {
                success: true,
                message: 'No patient records found in the uploaded document',
                type: 'tracker_processing_complete',
                details: {
                    totalPatients: 0,
                    extractedPatients: 0,
                    message: 'Document was successfully processed but contained no extractable patient data'
                }
            }
        };
    }

    console.log(`📄 Tracker Data Agent: Mapping ${state.extractedPatients.length} patients to DHIS2 tracker format`);

    // Use default org unit and program if not specified
    const orgUnit = state.orgUnit || dhis2Config.getDefaultOrgUnit();
    const programId = state.programId || dhis2Config.getDefaultProgramId();

    try {
                // First, try to use LLM header matching if we have extracted headers
        let enhancedMappings: Record<string, string> = {};
        let headerDisplayNames: Record<string, string> = {};

        if (state.extractedPatients.length > 0) {
            // Extract unique header names from the first patient record
            const headers = Object.keys(state.extractedPatients[0]);
            console.log(`📄 Tracker Data Agent: Detected headers: ${headers.join(', ')}`);

            // Use LLM to match headers to DHIS2 attributes
            const llmMatchingResult = await matchPdfHeadersToMapping.invoke({
                pdfHeaders: headers,
                programId: programId, // Required parameter for dynamic attribute fetching
                confidenceThreshold: 0.7,
                context: 'DHIS2 tracker data mapping',
                attributeMappings: state.attributeMappings // Optional custom overrides
            });

            if (llmMatchingResult.matches && llmMatchingResult.matches.length > 0) {
                console.log(`📄 Tracker Data Agent: LLM header matching successful - ${llmMatchingResult.matches.length} matches found`);

                // Convert matches to mapping formats
                const newMappings: Record<string, string> = {};
                const displayNames: Record<string, string> = {};

                for (const match of llmMatchingResult.matches) {
                    newMappings[match.pdfHeader] = match.attributeId;
                    displayNames[match.attributeId] = match.attributeName;
                }

                enhancedMappings = { ...state.attributeMappings, ...newMappings };
                headerDisplayNames = displayNames;

                console.log(`📄 Tracker Data Agent: Created mappings:`, enhancedMappings);
                console.log(`📄 Tracker Data Agent: Created display names:`, headerDisplayNames);
            } else {
                console.warn('📄 Tracker Data Agent: LLM header matching failed, using empty mappings');
                enhancedMappings = {};
                headerDisplayNames = {};
            }
        }

        const mappingResult = await mapToDhis2TrackerFormat.invoke({
            patients: state.extractedPatients,
            orgUnit,
            programId,
            attributeMappings: enhancedMappings
        });

        const parsedResult = JSON.parse(mappingResult);
        if (!parsedResult.success) {
            return {
                finalResult: {
                    success: false,
                    error: `Data mapping failed: ${parsedResult.error}`
                }
            };
        }

        console.log(`📄 Tracker Data Agent: Mapped ${parsedResult.totalPatients} patients with ${parsedResult.totalAttributes} attributes`);

        // Set mapped data but don't go to review step yet - let conditional edge handle it
        return {
            mappedTrackerData: parsedResult.payload.trackedEntities,
            attributeMappings: enhancedMappings, // Update state with enhanced mappings
            headerDisplayNames: headerDisplayNames // Update state with display names
        };

    } catch (error) {
        console.error('📄 Tracker Data Agent: Data mapping failed:', error);
        return {
            finalResult: {
                success: false,
                error: `Failed to map data to tracker format: ${error.message}`
            }
        };
    }
}

// 4.5. Review extracted data before saving
async function review_extracted_data(state: typeof TrackerDataAnnotation.State): Promise<Partial<typeof TrackerDataAnnotation.State>> {
    console.log('📄 Tracker Data Agent: Presenting extracted data for review');

    // Show the review grid and wait for user interaction (don't complete workflow)
    return {
        showReviewGrid: true,
        uiAction: 'wait_for_confirmation'
        // Note: No finalResult - workflow should pause here for user interaction
    };
}

// 5. Register tracker entities in DHIS2
async function register_tracker_entities(state: typeof TrackerDataAnnotation.State): Promise<Partial<typeof TrackerDataAnnotation.State>> {
    if (!state.mappedTrackerData || state.mappedTrackerData.length === 0) {
        return { uiAction: 'map_to_tracker_format' };
    }

    console.log(`📄 Tracker Data Agent: Registering ${state.mappedTrackerData.length} tracker entities in DHIS2`);

    try {
        // Create payload with tracked entities
        const trackerPayload = {
            trackedEntities: state.mappedTrackerData
        };

        const registrationResult = await registerTrackerEntities.invoke({
            trackerPayload,
            importStrategy: 'CREATE_AND_UPDATE'
        });

        const parsedResult = JSON.parse(registrationResult);

        console.log(`📄 Tracker Data Agent: Registration completed - ${parsedResult.successful} successful, ${parsedResult.failed} failed`);

        return {
            finalResult: {
                success: parsedResult.success,
                message: `Successfully processed ${state.mappedTrackerData.length} patient records`,
                details: {
                    totalPatients: state.mappedTrackerData.length,
                    successful: parsedResult.successful,
                    failed: parsedResult.failed,
                    results: parsedResult.results
                },
                data: parsedResult
            }
        };

    } catch (error) {
        console.error('📄 Tracker Data Agent: Entity registration failed:', error);
        return {
            finalResult: {
                success: false,
                error: `Failed to register tracker entities: ${error.message}`
            }
        };
    }
}

// 6. Handle entity operations (CRUD)
async function handle_entity_operations(state: typeof TrackerDataAnnotation.State): Promise<Partial<typeof TrackerDataAnnotation.State>> {
    console.log('🔧 Tracker Data Agent: Handling entity operations');

    // This function handles CRUD operations on tracker entities
    // The actual operations are triggered through UI interactions

    return {
        finalResult: {
            success: true,
            message: 'Entity operations handler initialized',
            type: 'entity_operations_ready'
        }
    };
}

// 7. Display processing results
async function display_processing_results(state: typeof TrackerDataAnnotation.State): Promise<Partial<typeof TrackerDataAnnotation.State>> {
    console.log('📄 Tracker Data Agent: Displaying processing results');

    const resultMessage = {
        type: 'tracker_processing_complete',
        message: 'Tracker data processing completed',
        data: state.finalResult
    };

    return {
        finalResult: resultMessage
    };
}



// Recovery functions for handling failures gracefully

// Document processing recovery - when OCR/document processing fails
async function handle_document_processing_recovery(state: typeof TrackerDataAnnotation.State): Promise<Partial<typeof TrackerDataAnnotation.State>> {
    console.log('🔄 Handling document processing recovery');

    const recoveryOptions: RecoveryOption[] = [
        {
            id: 'manual_entry',
            label: 'Enter data manually',
            description: 'Switch to manual data entry instead of document processing',
            action: async () => ({
                uiAction: 'switch_to_manual_entry',
                recoveryAction: 'manual_entry'
            })
        },
        {
            id: 'upload_again',
            label: 'Upload different file',
            description: 'Upload a clearer or different document for processing',
            action: async () => ({
                uiAction: 'reupload_document',
                recoveryAction: 'upload_again'
            })
        },
        {
            id: 'retry_processing',
            label: 'Retry processing',
            description: 'Try processing the same document again',
            action: async () => ({
                uiAction: 'retry_document_processing',
                recoveryAction: 'retry_processing'
            })
        }
    ];

    return {
        recoveryContext: {
            failedStep: 'document_processing',
            errorDetails: {
                reason: 'OCR/document processing failed',
                filename: state.uploadedDocument?.filename,
                fileSize: state.uploadedDocument?.buffer?.length
            },
            recoveryOptions,
            userGuidance: 'Document processing failed. Choose how to continue:'
        },
        uiAction: 'show_recovery_options'
    };
}

// Header matching recovery - when LLM mapping fails
async function handle_header_matching_recovery(state: typeof TrackerDataAnnotation.State): Promise<Partial<typeof TrackerDataAnnotation.State>> {
    console.log('🔄 Handling header matching recovery');

    const recoveryOptions: RecoveryOption[] = [
        {
            id: 'manual_mapping',
            label: 'Map columns manually',
            description: 'Select which document columns correspond to DHIS2 attributes',
            action: async () => ({
                uiAction: 'manual_header_mapping',
                recoveryAction: 'manual_mapping'
            })
        },
        {
            id: 'use_defaults',
            label: 'Use default mappings',
            description: 'Continue with automatic attribute detection',
            action: async () => ({
                uiAction: 'use_default_mappings',
                recoveryAction: 'use_defaults'
            })
        },
        {
            id: 'skip_mapping',
            label: 'Skip attribute mapping',
            description: 'Continue with basic entity creation (limited attributes)',
            action: async () => ({
                uiAction: 'skip_attribute_mapping',
                recoveryAction: 'skip_mapping'
            })
        }
    ];

    return {
        recoveryContext: {
            failedStep: 'header_matching',
            errorDetails: {
                reason: 'Could not automatically match document headers to DHIS2 attributes',
                headers: state.extractedPatients?.length > 0 ? Object.keys(state.extractedPatients[0]) : []
            },
            recoveryOptions,
            userGuidance: 'Header mapping failed. Choose how to handle attribute mapping:'
        },
        uiAction: 'show_recovery_options'
    };
}

// Validation recovery - when data validation fails
async function handle_validation_recovery(state: typeof TrackerDataAnnotation.State): Promise<Partial<typeof TrackerDataAnnotation.State>> {
    console.log('🔄 Handling validation recovery');

    const recoveryOptions: RecoveryOption[] = [
        {
            id: 'fix_validation_errors',
            label: 'Review and fix errors',
            description: 'Review validation errors and correct them manually',
            action: async () => ({
                uiAction: 'show_validation_errors',
                recoveryAction: 'fix_validation_errors'
            })
        },
        {
            id: 'save_valid_only',
            label: 'Save valid records only',
            description: 'Save only the records that passed validation',
            action: async () => ({
                uiAction: 'save_valid_records_only',
                recoveryAction: 'save_valid_only'
            })
        },
        {
            id: 'force_save',
            label: 'Force save all',
            description: 'Save all records despite validation errors (not recommended)',
            action: async () => ({
                uiAction: 'force_save_all_records',
                recoveryAction: 'force_save'
            })
        }
    ];

    return {
        recoveryContext: {
            failedStep: 'validation',
            errorDetails: {
                reason: 'Some tracker data failed validation checks',
                totalRecords: state.mappedTrackerData?.length || 0
            },
            recoveryOptions,
            userGuidance: 'Data validation found issues. Choose how to proceed:'
        },
        uiAction: 'show_recovery_options'
    };
}

// File upload recovery - when file upload/processing fails
async function handle_file_upload_recovery(state: typeof TrackerDataAnnotation.State): Promise<Partial<typeof TrackerDataAnnotation.State>> {
    console.log('🔄 Handling file upload recovery');

    const recoveryOptions: RecoveryOption[] = [
        {
            id: 'upload_again',
            label: 'Upload file again',
            description: 'Upload the file again (check file format and size)',
            action: async () => ({
                uiAction: 'reupload_file',
                recoveryAction: 'upload_again'
            })
        },
        {
            id: 'convert_format',
            label: 'Convert file format',
            description: 'Convert your file to supported format (PDF, PNG, JPG)',
            action: async () => ({
                uiAction: 'convert_file_format',
                recoveryAction: 'convert_format'
            })
        },
        {
            id: 'manual_entry',
            label: 'Enter data manually',
            description: 'Switch to manual data entry instead of file upload',
            action: async () => ({
                uiAction: 'switch_to_manual_entry',
                recoveryAction: 'manual_entry'
            })
        }
    ];

    return {
        recoveryContext: {
            failedStep: 'file_upload',
            errorDetails: {
                reason: 'File upload or initial processing failed',
                supportedFormats: ['PDF', 'PNG', 'JPG', 'JPEG'],
                maxSize: '10MB'
            },
            recoveryOptions,
            userGuidance: 'File processing failed. Choose how to resolve the file issue:'
        },
        uiAction: 'show_recovery_options'
    };
}

// Create and compile StateGraph workflow
const trackerDataWorkflow = new StateGraph(TrackerDataAnnotation);

// Add nodes
trackerDataWorkflow.addNode('handle_document_upload', handle_document_upload);
trackerDataWorkflow.addNode('extract_patient_data', extract_patient_data);
trackerDataWorkflow.addNode('resolve_org_unit', resolve_org_unit);
trackerDataWorkflow.addNode('fetch_attribute_metadata', fetch_attribute_metadata);
trackerDataWorkflow.addNode('map_to_tracker_format', map_to_tracker_format);
trackerDataWorkflow.addNode('review_extracted_data', review_extracted_data);
trackerDataWorkflow.addNode('register_tracker_entities', register_tracker_entities);
trackerDataWorkflow.addNode('display_processing_results', display_processing_results);

// Recovery nodes
trackerDataWorkflow.addNode('handle_document_processing_recovery', handle_document_processing_recovery);
trackerDataWorkflow.addNode('handle_header_matching_recovery', handle_header_matching_recovery);
trackerDataWorkflow.addNode('handle_validation_recovery', handle_validation_recovery);
trackerDataWorkflow.addNode('handle_file_upload_recovery', handle_file_upload_recovery);

// Add edges
// @ts-ignore
trackerDataWorkflow.addEdge(START, 'handle_document_upload');

// Conditional routing based on uiAction
// @ts-ignore
trackerDataWorkflow.addConditionalEdges('handle_document_upload', (state) => {
    if (state.uiAction === 'process_document') return 'extract_patient_data';
    return END;
});

// @ts-ignore
trackerDataWorkflow.addConditionalEdges('extract_patient_data', (state) => {
    if (state.uiAction === 'resolve_org_unit') return 'resolve_org_unit';
    return END;
});

// @ts-ignore
trackerDataWorkflow.addConditionalEdges('resolve_org_unit', (state) => {
    if (state.uiAction === 'map_to_tracker_format') return 'fetch_attribute_metadata';
    return END;
});

// @ts-ignore
trackerDataWorkflow.addConditionalEdges('fetch_attribute_metadata', (state) => {
    if (state.uiAction === 'map_to_tracker_format') return 'map_to_tracker_format';
    return END;
});

// @ts-ignore
trackerDataWorkflow.addConditionalEdges('map_to_tracker_format', (state) => {
    // If we have mapped data, go to review step
    if (state.mappedTrackerData && state.mappedTrackerData.length > 0) {
        return 'review_extracted_data';
    }
    return END;
});

// Note: review_extracted_data node handles UI interaction and pauses workflow
// The workflow will resume via handleUIInteraction when user confirms/cancels

// @ts-ignore
trackerDataWorkflow.addConditionalEdges('register_tracker_entities', (state) => {
    return 'display_processing_results';
});

// @ts-ignore
trackerDataWorkflow.addEdge('display_processing_results', END);

// Compile the workflow
const trackerDataStateGraph = trackerDataWorkflow.compile();

// StateGraph-based tracker data agent
export function createTrackerDataAgent(orchestrator: any) {
    return {
        invoke: async (input: any) => {
            console.log('📄 Tracker Data Agent: Processing tracker data request');

            const initialState: Partial<typeof TrackerDataAnnotation.State> = {
                messages: input.messages || [],
                orchestrator: orchestrator,
                uploadedDocument: null,
                extractedPatients: [],
                mappedTrackerData: [],
                orgUnit: '',
                programId: '',
                attributeMappings: {},
                uiAction: '',
            };

            try {
                // Execute StateGraph workflow
                const result = await trackerDataStateGraph.invoke(initialState);

                // Check if workflow reached review step (no finalResult but has review data)
                if (!result.finalResult && result.showReviewGrid && result.extractedPatients?.length > 0) {
                    console.log('📄 Tracker Data Agent: Workflow paused at review step for user interaction');

                    // Return result indicating user interaction is needed
                    const reviewResult = {
                        type: 'show_review_grid',
                        message: 'Please review the extracted patient data before saving',
                        data: {
                            extractedPatients: result.extractedPatients,
                            mappedTrackerData: result.mappedTrackerData,
                            headerMappings: result.attributeMappings || {},
                            headerDisplayNames: result.headerDisplayNames || {},
                            reviewMode: true,
                            totalPatients: result.extractedPatients?.length || 0,
                            extractedFrom: result.uploadedDocument?.filename || 'document'
                        },
                        requiresUserAction: true,
                        actions: ['confirm_save', 'cancel_save']
                    };

                    return {
                        messages: [{
                            content: JSON.stringify(reviewResult),
                            name: undefined,
                            additional_kwargs: {},
                            response_metadata: {}
                        }]
                    };
                }

                // Normal workflow completion with finalResult
                if (result.finalResult) {
                    return {
                        messages: [{
                            content: JSON.stringify(result.finalResult),
                            name: undefined,
                            additional_kwargs: {},
                            response_metadata: {}
                        }]
                    };
                }

                // Unexpected case - no finalResult and not in review mode
                console.warn('📄 Tracker Data Agent: Workflow completed without finalResult or review data');
                return {
                    messages: [{
                        content: JSON.stringify({
                            success: false,
                            error: 'Workflow completed unexpectedly without result'
                        }),
                        name: undefined,
                        additional_kwargs: {},
                        response_metadata: {}
                    }]
                };

            } catch (error) {
                console.error('📄 Tracker Data Agent: Workflow execution failed:', error);
                return {
                    messages: [{
                        content: JSON.stringify({
                            success: false,
                            error: `Tracker data processing failed: ${error.message}`
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
            console.log('📄 Tracker Data Agent: Handling UI interaction:', interaction);

            const { type, data } = interaction;

            // Resume the state graph with updated state based on user interaction
            let updatedState: any = {
                uploadedDocument: currentState.uploadedDocument,
                extractedPatients: currentState.extractedPatients,
                mappedTrackerData: currentState.mappedTrackerData,
                orgUnit: currentState.orgUnit,
                programId: currentState.programId,
                attributeMappings: currentState.attributeMappings,
                uiAction: currentState.uiAction,
                messages: currentState.messages,
                orchestrator: currentState.orchestrator,
                finalResult: currentState.finalResult
            };

            switch (type) {
                case 'configure_processing':
                    // User configures org unit, program, and mappings
                    if (data.orgUnit) updatedState.orgUnit = data.orgUnit;
                    if (data.programId) updatedState.programId = data.programId;
                    if (data.attributeMappings) updatedState.attributeMappings = data.attributeMappings;
                    updatedState.uiAction = 'handle_document_upload';
                    break;

                case 'upload_document':
                    // User uploads a document
                    updatedState.uploadedDocument = {
                        buffer: data.fileBuffer,
                        filename: data.filename
                    };
                    updatedState.uiAction = 'process_document';
                    break;

                case 'confirm_save':
                    // User confirmed saving the extracted data - directly register entities
                    console.log('📄 Tracker Data Agent: User confirmed save - directly registering tracker entities');

                    // Directly call the registration function with current state
                    try {
                        const registrationResult = await register_tracker_entities(currentState);
                        console.log('📄 Tracker Data Agent: Registration completed:', registrationResult);

                        // Parse the detailed response to create better user feedback
                        let detailedMessage = '';
                        let resultDetails: any = {};

                        try {
                            // The registrationResult contains finalResult which is the actual result object
                            const finalResult = registrationResult.finalResult;
                            const parsedResult = typeof finalResult === 'string' ? JSON.parse(finalResult) : finalResult;

                            if (parsedResult?.success !== false) {
                                const total = parsedResult?.details?.totalPatients || parsedResult?.totalPatients || 0;
                                const successful = parsedResult?.details?.successful || parsedResult?.successful || 0;
                                const failed = parsedResult?.details?.failed || parsedResult?.failed || 0;

                                // Store details for the enhanced result
                                resultDetails = {
                                    totalEntities: total,
                                    successful: successful,
                                    failed: failed
                                };

                                // Create user-friendly message with details
                                if (successful > 0) {
                                    detailedMessage = `✅ Successfully registered ${successful} tracker ${successful === 1 ? 'entity' : 'entities'} in DHIS2`;
                                    if (total > successful) {
                                        detailedMessage += ` (${failed} failed)`;
                                    }
                                    detailedMessage += '.';
                                } else {
                                    detailedMessage = `❌ Failed to register tracker entities (${failed} failed).`;
                                }

                                // Add program context if available
                                if (currentState.programId) {
                                    detailedMessage += ` Program: ${currentState.programId}.`;
                                }
                            } else {
                                detailedMessage = parsedResult?.message || 'Registration completed with issues.';
                            }
                        } catch (parseError) {
                            // Fallback to original message if parsing fails
                            console.warn('Failed to parse registration result for detailed feedback:', parseError);
                            detailedMessage = typeof registrationResult.finalResult === 'string'
                                ? registrationResult.finalResult
                                : 'Tracker entities registered successfully.';
                        }

                        // Create enhanced final result with detailed message
                        const enhancedResult = {
                            success: registrationResult.finalResult?.success ?? true,
                            message: detailedMessage,
                            details: {
                                ...resultDetails,
                                programId: currentState.programId,
                                timestamp: new Date().toISOString()
                            },
                            type: 'tracker_save_completed'
                        };

                        // Return the enhanced result
                        return {
                            ...currentState,
                            finalResult: enhancedResult,
                            showReviewGrid: false,
                            userConfirmedSave: true
                        };
                    } catch (error) {
                        console.error('📄 Tracker Data Agent: Direct registration failed:', error);
                        return {
                            ...currentState,
                            finalResult: {
                                success: false,
                                error: `Failed to register tracker entities: ${error.message}`
                            }
                        };
                    }

                case 'cancel_save':
                    // User cancelled saving the data
                    console.log('📄 Tracker Data Agent: User cancelled save - ending workflow');
                    updatedState.finalResult = {
                        success: false,
                        cancelled: true,
                        message: 'Data save cancelled by user',
                        type: 'tracker_processing_cancelled'
                    };
                    break;

                case 'select_org_unit':
                    // User selected an org unit from the MetadataSelector
                    console.log('📍 Tracker Data Agent: User selected org unit:', data);
                    if (data.selectedItems && data.selectedItems.length > 0) {
                        const selectedOrgUnit = data.selectedItems[0]; // Single select mode
                        updatedState.resolvedOrgUnit = {
                            id: selectedOrgUnit.id,
                            name: selectedOrgUnit.name
                        };
                        updatedState.uiAction = 'map_to_tracker_format';
                    } else {
                        // No selection made, use default
                        updatedState.resolvedOrgUnit = null;
                        updatedState.uiAction = 'map_to_tracker_format';
                    }
                    break;

                case 'use_default':
                    // User chose to use default org unit instead of selecting
                    console.log('📍 Tracker Data Agent: User chose to use default org unit');
                    updatedState.resolvedOrgUnit = null; // Will use default in mapping
                    updatedState.uiAction = 'map_to_tracker_format';
                    break;

                case 'manual_entry':
                    // User wants to manually enter org unit - this would trigger a different UI
                    console.log('📍 Tracker Data Agent: User chose manual org unit entry');
                    updatedState.finalResult = {
                        type: 'manual_org_unit_entry',
                        message: 'Please specify the organisation unit manually',
                        data: {
                            extractedOrgUnit: currentState.extractedOrgUnit,
                            requiresUserAction: true,
                            actions: ['specify_org_unit', 'use_default']
                        },
                        requiresUserAction: true
                    };
                    break;

                case 'specify_org_unit':
                    // User manually specified an org unit
                    console.log('📍 Tracker Data Agent: User manually specified org unit:', data);
                    if (data.orgUnit) {
                        updatedState.resolvedOrgUnit = {
                            id: data.orgUnit,
                            name: data.orgUnit // Name not available, use ID
                        };
                        updatedState.uiAction = 'map_to_tracker_format';
                    } else {
                        updatedState.resolvedOrgUnit = null;
                        updatedState.uiAction = 'map_to_tracker_format';
                    }
                    break;

                case 'update_entity':
                    // User wants to update an existing entity
                    console.log('🔄 Tracker Data Agent: User requested entity update:', data.entityId);

                    // Import the update tool
                    try {
                        const { updateDhis2TrackedEntityInstance } = await import('../utils/tools/metadata/structured-tools');

                        // For now, show a message that update functionality is available
                        // In a full implementation, this would show an edit form
                        updatedState.finalResult = {
                            success: true,
                            message: `Entity update functionality is available for entity ${data.entityId}. Edit form would be shown here.`,
                            type: 'entity_update_requested',
                            data: {
                                entityId: data.entityId,
                                action: 'update'
                            }
                        };
                    } catch (error) {
                        console.error('Failed to import update tool:', error);
                        updatedState.finalResult = {
                            success: false,
                            error: `Failed to initialize entity update: ${error.message}`
                        };
                    }
                    break;

                case 'delete_entity':
                    // User wants to delete an existing entity
                    console.log('🗑️ Tracker Data Agent: User requested entity deletion:', data.entityId);

                    // Import the delete tool
                    try {
                        const { deleteDhis2TrackedEntityInstance } = await import('../utils/tools/metadata/structured-tools');

                        // Call the delete API
                        const deleteResult = await deleteDhis2TrackedEntityInstance.invoke({
                            id: data.entityId
                        });

                        const parsedResult = JSON.parse(deleteResult);

                        if (parsedResult.success) {
                            updatedState.finalResult = {
                                success: true,
                                message: `Entity ${data.entityId} deleted successfully from DHIS2`,
                                type: 'entity_deleted',
                                data: {
                                    entityId: data.entityId,
                                    action: 'delete'
                                }
                            };
                        } else {
                            updatedState.finalResult = {
                                success: false,
                                error: `Failed to delete entity: ${parsedResult.error || 'Unknown error'}`,
                                type: 'entity_delete_failed'
                            };
                        }
                    } catch (error) {
                        console.error('Failed to delete entity:', error);
                        updatedState.finalResult = {
                            success: false,
                            error: `Failed to delete entity: ${error.message}`
                        };
                    }
                    break;

                case 'view_entity_details':
                    // User wants to view entity details
                    console.log('👁️ Tracker Data Agent: User requested entity details:', data.entityId);

                    // For now, show a message that details view is available
                    updatedState.finalResult = {
                        success: true,
                        message: `Entity details view is available for entity ${data.entityId}. Details panel would be shown here.`,
                        type: 'entity_details_requested',
                        data: {
                            entityId: data.entityId,
                            action: 'view_details'
                        }
                    };
                    break;

                case 'update_entity_attributes':
                    // User wants to update specific attributes of an entity
                    console.log('🔧 Tracker Data Agent: User requested attribute update:', data);

                    try {
                        // Import the update tool
                        const { updateDhis2TrackedEntityInstance } = await import('../utils/tools/metadata/structured-tools');

                        // Prepare the attribute update payload
                        const attributeUpdatePayload = {
                            trackedEntityInstance: data.entityId,
                            attributes: data.attributes.map((attr: any) => ({
                                attribute: attr.attribute,
                                value: attr.value
                            }))
                        };

                        console.log('🔧 Tracker Data Agent: Updating entity attributes:', attributeUpdatePayload);

                        // Call the update API
                        const updateResult = await updateDhis2TrackedEntityInstance.invoke(attributeUpdatePayload);

                        const parsedResult = JSON.parse(updateResult);

                        if (parsedResult.success) {
                            updatedState.finalResult = {
                                success: true,
                                message: `Entity ${data.entityId} attributes updated successfully`,
                                type: 'entity_attributes_updated',
                                data: {
                                    entityId: data.entityId,
                                    updatedAttributes: data.attributes.length,
                                    action: 'update_attributes'
                                }
                            };
                        } else {
                            updatedState.finalResult = {
                                success: false,
                                error: `Failed to update entity attributes: ${parsedResult.error || 'Unknown error'}`,
                                type: 'entity_attributes_update_failed'
                            };
                        }
                    } catch (error) {
                        console.error('Failed to update entity attributes:', error);
                        updatedState.finalResult = {
                            success: false,
                            error: `Failed to update entity attributes: ${error.message}`
                        };
                    }
                    break;

                case 'retry_processing':
                    // User wants to retry failed processing
                    updatedState.uiAction = 'handle_document_upload';
                    break;

                default:
                    console.warn('📄 Tracker Data Agent: Unknown interaction type:', type);
                    return currentState;
            }

            // Continue the workflow with updated state
            try {
                const result = await trackerDataStateGraph.invoke(updatedState);
                return result;
            } catch (error) {
                console.error('📄 Tracker Data Agent: Failed to continue workflow:', error);
                return {
                    uploadedDocument: updatedState.uploadedDocument,
                    extractedPatients: updatedState.extractedPatients,
                    mappedTrackerData: updatedState.mappedTrackerData,
                    orgUnit: updatedState.orgUnit,
                    programId: updatedState.programId,
                    attributeMappings: updatedState.attributeMappings,
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
