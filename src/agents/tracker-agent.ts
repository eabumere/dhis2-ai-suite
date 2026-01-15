import { Annotation, END, START, StateGraph } from '@langchain/langgraph/web';
import { HumanMessage } from '@langchain/core/messages';
import {
    // Tracker data processing tools
    processScannedRegister,
    uploadDocumentToAzure,
    mapToDhis2TrackerFormat,
    registerTrackerEntities,

    // Tracker program and entity management tools
    createDhis2Program,
    createDhis2TrackedEntityType,
    createDhis2TrackedEntityAttribute,
    createDhis2TrackedEntityInstance,
    createDhis2Enrollment,
    createDhis2ProgramStage,
    createDhis2ProgramRule,
    createDhis2ProgramIndicator,
    createDhis2RelationshipType,
    createDhis2Relationship,
    createDhis2Event,
    createDhis2OrganisationUnit,
    createDhis2OptionSet,
    createDhis2AggregatedMetadata,

    // Update tools for tracker
    updateDhis2Program,
    updateDhis2TrackedEntityType,
    updateDhis2TrackedEntityAttribute,
    updateDhis2TrackedEntityInstance,
    updateDhis2Enrollment,
    updateDhis2ProgramStage,
    updateDhis2ProgramRule,
    updateDhis2ProgramIndicator,
    updateDhis2RelationshipType,
    updateDhis2Relationship,
    updateDhis2Event,
    updateDhis2OrganisationUnit,
    updateDhis2OptionSet,

    // Utility tools
    resolveResourceReference,
} from '../utils/tools/metadata';

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

// State annotation for the tracker data state graph
const TrackerDataAnnotation = Annotation.Root({
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

    programId: Annotation<string>({
        reducer: (left, right) => right || left,
        default: () => ''
    }),

    attributeMappings: Annotation<Record<string, string>>({
        reducer: (left, right) => right || left,
        default: () => ({})
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
            fileBuffer = typeof fileEntry.content === 'string'
                ? new TextEncoder().encode(fileEntry.content)
                : fileEntry.content as Uint8Array;
            filename = fileEntry.name;
            console.log(`📄 Tracker Data Agent: Retrieved current file from orchestrator: ${filename} (${fileBuffer.length} bytes)`);
        } else {
            console.warn('📄 Tracker Data Agent: No current file available in orchestrator');
        }
    } else {
        console.warn('📄 Tracker Data Agent: Orchestrator does not support current file retrieval');
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
                            fileBuffer = typeof fileEntry.content === 'string'
                                ? new TextEncoder().encode(fileEntry.content)
                                : fileEntry.content as Uint8Array;
                            filename = fileEntry.name;
                            console.log(`📄 Tracker Data Agent: Retrieved file from orchestrator (fallback): ${filename} (${fileBuffer.length} bytes)`);
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

// 2. Upload document to Azure Blob Storage
async function upload_to_azure_storage(state: typeof TrackerDataAnnotation.State): Promise<Partial<typeof TrackerDataAnnotation.State>> {
    if (!state.uploadedDocument) {
        return { uiAction: 'handle_document_upload' };
    }

    console.log('📄 Tracker Data Agent: Uploading document to Azure Blob Storage');

    try {
        const uploadResult = await uploadDocumentToAzure.invoke({
            fileBuffer: state.uploadedDocument.buffer,
            filename: state.uploadedDocument.filename
        });

        const parsedResult = JSON.parse(uploadResult);
        if (!parsedResult.success) {
            return {
                finalResult: {
                    success: false,
                    error: `Document upload failed: ${parsedResult.error}`
                }
            };
        }

        console.log('📄 Tracker Data Agent: Document uploaded successfully');

        return {
            uploadedDocument: {
                ...state.uploadedDocument,
                url: parsedResult.blobUrl,
                sasUrl: parsedResult.sasUrl
            },
            uiAction: 'extract_patient_data'
        };

    } catch (error) {
        console.error('📄 Tracker Data Agent: Azure upload failed:', error);
        return {
            finalResult: {
                success: false,
                error: `Failed to upload document to Azure: ${error.message}`
            }
        };
    }
}

// 3. Process document with Azure Document Intelligence
async function extract_patient_data(state: typeof TrackerDataAnnotation.State): Promise<Partial<typeof TrackerDataAnnotation.State>> {
    if (!state.uploadedDocument) {
        return { uiAction: 'handle_document_upload' };
    }

    console.log('📄 Tracker Data Agent: Extracting patient data from document');

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
                    error: `Data extraction failed: ${parsedResult.error}`
                }
            };
        }

        console.log(`📄 Tracker Data Agent: Extracted ${parsedResult.patients.length} patient records`);

        return {
            extractedPatients: parsedResult.patients,
            uiAction: 'map_to_tracker_format'
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

// 4. Map extracted data to DHIS2 tracker format
async function map_to_tracker_format(state: typeof TrackerDataAnnotation.State): Promise<Partial<typeof TrackerDataAnnotation.State>> {
    if (!state.extractedPatients || state.extractedPatients.length === 0) {
        return { uiAction: 'extract_patient_data' };
    }

    console.log(`📄 Tracker Data Agent: Mapping ${state.extractedPatients.length} patients to DHIS2 tracker format`);

    // Use default org unit and program if not specified
    const orgUnit = state.orgUnit || 'cYSowRjnmHE'; // Default facility org unit
    const programId = state.programId || 'o3jXXatOefs'; // Default HIV program

    try {
        const mappingResult = await mapToDhis2TrackerFormat.invoke({
            patients: state.extractedPatients,
            orgUnit,
            programId,
            attributeMappings: state.attributeMappings
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

        return {
            mappedTrackerData: parsedResult.payload.trackedEntities,
            uiAction: 'register_tracker_entities'
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

// 6. Display processing results
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

// Create and compile StateGraph workflow
const trackerDataWorkflow = new StateGraph(TrackerDataAnnotation);

// Add nodes
trackerDataWorkflow.addNode('handle_document_upload', handle_document_upload);
trackerDataWorkflow.addNode('upload_to_azure_storage', upload_to_azure_storage);
trackerDataWorkflow.addNode('extract_patient_data', extract_patient_data);
trackerDataWorkflow.addNode('map_to_tracker_format', map_to_tracker_format);
trackerDataWorkflow.addNode('register_tracker_entities', register_tracker_entities);
trackerDataWorkflow.addNode('display_processing_results', display_processing_results);

// Add edges
// @ts-ignore
trackerDataWorkflow.addEdge(START, 'handle_document_upload');

// Conditional routing based on uiAction
// @ts-ignore
trackerDataWorkflow.addConditionalEdges('handle_document_upload', (state) => {
    if (state.uiAction === 'process_document') return 'upload_to_azure_storage';
    return END;
});

// @ts-ignore
trackerDataWorkflow.addConditionalEdges('upload_to_azure_storage', (state) => {
    if (state.uiAction === 'extract_patient_data') return 'extract_patient_data';
    return END;
});

// @ts-ignore
trackerDataWorkflow.addConditionalEdges('extract_patient_data', (state) => {
    if (state.uiAction === 'map_to_tracker_format') return 'map_to_tracker_format';
    return END;
});

// @ts-ignore
trackerDataWorkflow.addConditionalEdges('map_to_tracker_format', (state) => {
    if (state.uiAction === 'register_tracker_entities') return 'register_tracker_entities';
    return END;
});

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
