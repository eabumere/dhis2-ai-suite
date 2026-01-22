import {AzureKeyCredential, DocumentAnalysisClient} from '@azure/ai-form-recognizer';
import {PDFDocument} from 'pdf-lib';
import * as path from 'path';

// Environment variables
const env = (import.meta as any).env;
const DOC_INTELLIGENCE_ENDPOINT = env.DHIS2_DOC_INTELLIGENCE_ENDPOINT;
const DOC_INTELLIGENCE_KEY = env.DHIS2_DOC_INTELLIGENCE_KEY;
const MODEL_ID = env.DHIS2_MODEL_ID || 'prebuilt-layout';

// Initialize clients
let documentAnalysisClient: DocumentAnalysisClient | null = null;

function getDocumentAnalysisClient(): DocumentAnalysisClient {
    if (!documentAnalysisClient) {
        if (!DOC_INTELLIGENCE_ENDPOINT || !DOC_INTELLIGENCE_KEY) {
            throw new Error('Azure Form Recognizer configuration missing. Please check DOC_INTELLIGENCE_ENDPOINT and DOC_INTELLIGENCE_KEY environment variables.');
        }
        documentAnalysisClient = new DocumentAnalysisClient(
            DOC_INTELLIGENCE_ENDPOINT,
            new AzureKeyCredential(DOC_INTELLIGENCE_KEY)
        );
    }
    return documentAnalysisClient;
}

export interface ProcessedDocumentData {
    tables: Array<{
        headers: string[];
        rows: string[][];
    }>;
    extractedOrgUnit?: string;
    documentFields?: Record<string, any>; // Raw document fields for debugging
}



/**
 * Process a document using Azure Form Recognizer
 */
export async function processDocumentWithAI(
    fileBuffer: Uint8Array,
    filename: string,
    modelId: string = MODEL_ID
): Promise<ProcessedDocumentData> {
    try {
        const client = getDocumentAnalysisClient();

        console.log(`Processing document: ${filename} with model: ${modelId}`);

        // Start document analysis
        const poller = await client.beginAnalyzeDocument(modelId, fileBuffer);

        // Wait for completion
        const result = await poller.pollUntilDone();

        if (!result) {
            throw new Error('Document analysis failed - no result returned');
        }

        console.log(`Document analysis completed. Found ${result.documents?.length || 0} documents`);

        // Extract structured data
        const processedData: ProcessedDocumentData = {
            tables: []
        };

        // Store raw document fields for debugging/analysis
        if (result.documents && result.documents[0]?.fields) {
            processedData.documentFields = result.documents[0].fields;
        }

        // Extract organization unit information from document fields
        const extractedOrgUnit = extractOrgUnitFromDocumentFields(result.documents?.[0]?.fields);
        if (extractedOrgUnit) {
            processedData.extractedOrgUnit = extractedOrgUnit;
            console.log(`📍 Extracted organization unit from document fields: "${extractedOrgUnit}"`);
        }

        // Process structured table fields from custom model (e.g., TableDataHandVersionPG3)
        if (result.documents && result.documents[0]?.fields) {
            for (const [fieldName, field] of Object.entries(result.documents[0].fields)) {
                if (fieldName.startsWith('TableData') && Array.isArray(field['values'])) {
                    const tableData = processStructuredTableField(field['values']);
                    if (tableData && tableData.rows.length > 0) {
                        processedData.tables.push(tableData);
                    }
                }
            }
        }

        return processedData;

    } catch (error) {
        console.error('Error processing document with AI:', error);
        throw new Error(`Document processing failed: ${error.message}`);
    }
}



/**
 * Process structured table field from custom model (e.g., TableDataHandVersionPG3)
 */
function processStructuredTableField(field: any): { headers: string[]; rows: string[][] } | null {
    try {
        // The field is an array of row objects
        if (!Array.isArray(field) || field.length === 0) {
            return null;
        }

        // Extract headers from the first row's properties keys
        const firstRow = field[0].properties;
        if (!firstRow ) {
            return null;
        }

        const headers = Object.keys(firstRow);
        const rows: string[][] = [];

        // Process each row
        for (const row of field) {
            if (row && row.properties) {
                const rowData: string[] = [];
                for (const header of headers) {
                    const cell = row.properties[header];
                    // Handle missing values gracefully
                    const value = cell?.value || cell?.content || '';
                    rowData.push(value);
                }
                rows.push(rowData);
            }
        }

        return { headers, rows };
    } catch (error) {
        console.warn('Error processing structured table field:', error);
        return null;
    }
}



/**
 * Split PDF into individual pages for processing
 */
export async function splitPdfIntoPages(pdfBuffer: Uint8Array): Promise<Uint8Array[]> {
    try {
        const pdfDoc = await PDFDocument.load(pdfBuffer);
        const pageCount = pdfDoc.getPageCount();

        console.log(`Splitting PDF into ${pageCount} pages`);

        const pageBuffers: Uint8Array[] = [];

        for (let i = 0; i < pageCount; i++) {
            // Create a new PDF document for each page
            const newPdf = await PDFDocument.create();

            // Copy the specific page from the original document
            const [page] = await newPdf.copyPages(pdfDoc, [i]);
            newPdf.addPage(page);

            // Save the new PDF as a buffer
            const pageBuffer = await newPdf.save();
            pageBuffers.push(new Uint8Array(pageBuffer));
        }

        return pageBuffers;
    } catch (error) {
        console.error('Error splitting PDF into pages:', error);
        throw new Error(`Failed to split PDF: ${error.message}`);
    }
}

/**
 * Extract organization unit information from Azure Document Intelligence document fields
 * Scans all document fields for facility/organization information
 */
function extractOrgUnitFromDocumentFields(fields: Record<string, any> | undefined): string | null {
    if (!fields) {
        return null;
    }

    // Common field names that might contain organization/facility information
    const orgUnitFieldPatterns = [
        /facility/i,
        /hospital/i,
        /clinic/i,
        /center/i,
        /organisation/i,
        /organization/i,
        /org.?unit/i,
        /site/i,
        /location/i,
        /district/i,
        /province/i,
        /department/i,
        /ward/i,
        /health.?facility/i,
        /medical.?center/i,
        /health.?post/i,
        /health.?centre/i,
        /clinic.?name/i,
        /hospital.?name/i,
        /facility.?name/i,
        /org.?name/i,
        /institution/i,
        /establishment/i
    ];

    const candidates: Array<{ name: string; confidence: number; source: string }> = [];

    // Scan all document fields
    for (const [fieldName, field] of Object.entries(fields)) {
        const normalizedFieldName = fieldName.toLowerCase().trim();

        // Check if field name suggests it's an org unit field
        let isOrgUnitField = false;
        for (const pattern of orgUnitFieldPatterns) {
            if (pattern.test(normalizedFieldName)) {
                isOrgUnitField = true;
                break;
            }
        }

        // Extract content from different field types
        let fieldContent = '';
        let confidence = 0.5; // Default confidence

        if (field.kind === 'string' && field.content) {
            fieldContent = field.content.trim();
            confidence = field.confidence || 0.8;
        } else if (field.value && typeof field.value === 'string') {
            fieldContent = field.value.trim();
            confidence = field.confidence || 0.8;
        } else if (typeof field === 'string') {
            fieldContent = field.trim();
            confidence = 0.6; // Lower confidence for raw strings
        }

        if (!fieldContent || fieldContent.length < 3) {
            continue;
        }

        // If field name suggests org unit OR content looks like facility name
        if (isOrgUnitField) {
            // High confidence for matching field names
            candidates.push({
                name: fieldContent,
                confidence: confidence,
                source: `field:${fieldName}`
            });
        } else {
            // Check if content looks like a facility name even in generic fields
            const normalizedContent = fieldContent.toLowerCase().trim();

            // Look for facility-like patterns in content
            const facilityPatterns = [
                /\b(?:st\.?\s*|dr\.?\s*|mother\s*|father\s*|holy\s*|sacred\s*|divine\s*|saint\s*)/i,
                /\b(?:regional|district|provincial|national|central|general|teaching|university|specialist|referral|community|rural|urban)\b/i,
                /\b(?:hospital|clinic|center|centre|health.?post|medical.?center)\b/i,
                /\bhospital\b/i,
                /\bclinic\b/i,
                /\bcenter\b/i,
                /\bcentre\b/i
            ];

            let looksLikeFacility = false;
            for (const pattern of facilityPatterns) {
                if (pattern.test(normalizedContent)) {
                    looksLikeFacility = true;
                    break;
                }
            }

            // Also check for proper noun patterns (capitalized words)
            if (!looksLikeFacility && /[A-Z][a-z]+/.test(fieldContent)) {
                // Has proper nouns, might be a facility name
                looksLikeFacility = true;
            }

            if (looksLikeFacility) {
                candidates.push({
                    name: fieldContent,
                    confidence: confidence * 0.7, // Lower confidence for content-based detection
                    source: `content:${fieldName}`
                });
            }
        }
    }

    if (candidates.length === 0) {
        return null;
    }

    // Sort by confidence and select best candidate
    candidates.sort((a, b) => b.confidence - a.confidence);

    const bestCandidate = candidates[0];
    console.log(`📍 Selected org unit from document fields: "${bestCandidate.name}" (confidence: ${bestCandidate.confidence.toFixed(2)}, source: ${bestCandidate.source})`);

    return bestCandidate.name;
}

/**
 * Validate file type and size for document processing
 */
export function validateDocumentFile(filename: string, fileSize: number): { valid: boolean; error?: string } {
    const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.tif'];
    const maxFileSize = 50 * 1024 * 1024; // 50MB

    const ext = path.extname(filename).toLowerCase();

    if (!allowedExtensions.includes(ext)) {
        return {
            valid: false,
            error: `Unsupported file type: ${ext}. Supported types: ${allowedExtensions.join(', ')}`
        };
    }

    if (fileSize > maxFileSize) {
        return {
            valid: false,
            error: `File too large: ${(fileSize / 1024 / 1024).toFixed(2)}MB. Maximum size: 50MB`
        };
    }

    return { valid: true };
}
