import { DocumentAnalysisClient, AzureKeyCredential } from '@azure/ai-form-recognizer';
import { BlobServiceClient, BlobSASPermissions, generateBlobSASQueryParameters, BlobSASSignatureValues } from '@azure/storage-blob';
import * as path from 'path';

// Environment variables
const DOC_INTELLIGENCE_ENDPOINT = process.env.DOC_INTELLIGENCE_ENDPOINT;
const DOC_INTELLIGENCE_KEY = process.env.DOC_INTELLIGENCE_KEY;
const MODEL_ID = process.env.MODEL_ID || 'prebuilt-layout';
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const AZURE_STORAGE_CONTAINER = process.env.AZURE_STORAGE_CONTAINER || 'documents';

// Initialize clients
let documentAnalysisClient: DocumentAnalysisClient | null = null;
let blobServiceClient: BlobServiceClient | null = null;

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

function getBlobServiceClient(): BlobServiceClient {
    if (!blobServiceClient) {
        if (!AZURE_STORAGE_CONNECTION_STRING) {
            throw new Error('Azure Storage configuration missing. Please check AZURE_STORAGE_CONNECTION_STRING environment variable.');
        }
        blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
    }
    return blobServiceClient;
}

export interface ProcessedDocumentData {
    tables: Array<{
        rows: Array<{
            [key: string]: {
                value: string;
                confidence: number;
            };
        }>;
    }>;
    keyValuePairs: Array<{
        key: string;
        value: string;
        confidence: number;
    }>;
    entities: Array<{
        category: string;
        subCategory?: string;
        content: string;
        confidence: number;
    }>;
}

/**
 * Upload a file to Azure Blob Storage and return a SAS URL
 */
export async function uploadToBlobStorage(
    fileBuffer: Uint8Array,
    filename: string,
    containerName: string = AZURE_STORAGE_CONTAINER
): Promise<{ blobUrl: string; sasUrl: string; blobName: string }> {
    try {
        const blobServiceClient = getBlobServiceClient();
        const containerClient = blobServiceClient.getContainerClient(containerName);

        // Ensure container exists
        await containerClient.createIfNotExists({ access: 'blob' });

        // Generate unique blob name
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
        const blobName = `documents/${timestamp}_${safeFilename}`;

        const blobClient = containerClient.getBlockBlobClient(blobName);

        // Upload the file
        await blobClient.upload(fileBuffer, fileBuffer.length, {
            blobHTTPHeaders: {
                blobContentType: getContentType(filename)
            }
        });

        // Generate SAS token for read access (15 minutes expiry)
        const expiryTime = new Date();
        expiryTime.setMinutes(expiryTime.getMinutes() + 15);

        const sasOptions: BlobSASSignatureValues = {
            containerName: containerName,
            blobName: blobName,
            permissions: BlobSASPermissions.parse("r"), // read permission
            expiresOn: expiryTime,
            startsOn: new Date(),
            contentType: getContentType(filename)
        };

        const sasToken = generateBlobSASQueryParameters(sasOptions, blobServiceClient.credential as any).toString();

        const sasUrl = `${blobClient.url}?${sasToken}`;

        return {
            blobUrl: blobClient.url,
            sasUrl,
            blobName
        };
    } catch (error) {
        console.error('Error uploading to blob storage:', error);
        throw new Error(`Failed to upload file to Azure Blob Storage: ${error.message}`);
    }
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

        console.log(`Document analysis completed. Found ${result.documents?.length || 0} documents, ${result.pages?.length || 0} pages`);

        // Extract structured data
        const processedData: ProcessedDocumentData = {
            tables: [],
            keyValuePairs: [],
            entities: []
        };

        // Process tables from documents (Azure Form Recognizer v5 structure)
        if (result.documents) {
            for (const document of result.documents) {
                if (document.fields) {
                    for (const [fieldName, field] of Object.entries(document.fields)) {
                        if (fieldName.toLowerCase().includes('table')) {
                            const tableData = processTableField(field as any);
                            if (tableData.rows.length > 0) {
                                processedData.tables.push(tableData);
                            }
                        }
                    }
                }
            }
        }

        // Process key-value pairs
        if (result.keyValuePairs) {
            for (const kvp of result.keyValuePairs) {
                if (kvp.key && kvp.value) {
                    processedData.keyValuePairs.push({
                        key: kvp.key.content || '',
                        value: kvp.value.content || '',
                        confidence: kvp.confidence || 0
                    });
                }
            }
        }

        // Note: Entities processing removed as it's not in the current API structure
        // Entities are typically handled through custom models or different analysis types

        console.log(`Extracted ${processedData.tables.length} tables, ${processedData.keyValuePairs.length} key-value pairs, ${processedData.entities.length} entities`);

        return processedData;

    } catch (error) {
        console.error('Error processing document with AI:', error);
        throw new Error(`Document processing failed: ${error.message}`);
    }
}

/**
 * Process table from Azure Form Recognizer page result
 */
function processTableFromPage(table: any, result: any): { rows: Array<{ [key: string]: { value: string; confidence: number } }> } {
    const rows: Array<{ [key: string]: { value: string; confidence: number } }> = [];

    if (table.cells && table.cells.length > 0) {
        // Group cells by row index
        const cellsByRow: { [rowIndex: number]: any[] } = {};
        for (const cell of table.cells) {
            const rowIndex = cell.rowIndex;
            if (!cellsByRow[rowIndex]) {
                cellsByRow[rowIndex] = [];
            }
            cellsByRow[rowIndex].push(cell);
        }

        // Process each row
        const sortedRowIndices = Object.keys(cellsByRow).map(Number).sort((a, b) => a - b);

        for (const rowIndex of sortedRowIndices) {
            const rowCells = cellsByRow[rowIndex];
            const processedRow: { [key: string]: { value: string; confidence: number } } = {};

            // Sort cells by column index
            rowCells.sort((a, b) => a.columnIndex - b.columnIndex);

            // Process each cell in the row
            for (const cell of rowCells) {
                // Use column header or generate column name
                let columnName = `Column_${cell.columnIndex}`;
                if (cell.columnHeader) {
                    columnName = cell.columnHeader.content || columnName;
                }

                processedRow[columnName] = {
                    value: cell.content || '',
                    confidence: cell.confidence || 0
                };
            }

            if (Object.keys(processedRow).length > 0) {
                rows.push(processedRow);
            }
        }
    }

    return { rows };
}

/**
 * Process table field from Azure Form Recognizer result
 */
function processTableField(field: any): { rows: Array<{ [key: string]: { value: string; confidence: number } }>; } {
    const rows: Array<{ [key: string]: { value: string; confidence: number } }> = [];

    try {
        // Handle different possible structures in Azure Form Recognizer API
        const fieldValue = (field as any).value || (field as any).content || field;

        // If it's an array of objects (table rows)
        if (Array.isArray(fieldValue)) {
            for (const row of fieldValue) {
                const processedRow: { [key: string]: { value: string; confidence: number } } = {};

                // Process each property in the row as a column
                if (typeof row === 'object' && row !== null) {
                    for (const [key, cell] of Object.entries(row)) {
                        const cellValue = cell as any;
                        if (typeof cellValue === 'object' && cellValue !== null) {
                            processedRow[key] = {
                                value: cellValue.content || cellValue.value || String(cellValue) || '',
                                confidence: cellValue.confidence || 0
                            };
                        } else {
                            processedRow[key] = {
                                value: String(cellValue) || '',
                                confidence: 0
                            };
                        }
                    }
                }

                if (Object.keys(processedRow).length > 0) {
                    rows.push(processedRow);
                }
            }
        }
        // If it's a single object with array property
        else if (fieldValue && typeof fieldValue === 'object' && fieldValue.values) {
            // Handle nested array structure
            const values = fieldValue.values;
            if (Array.isArray(values)) {
                for (const row of values) {
                    const processedRow: { [key: string]: { value: string; confidence: number } } = {};

                    if (row && typeof row === 'object') {
                        for (const [key, cell] of Object.entries(row)) {
                            const cellValue = cell as any;
                            processedRow[key] = {
                                value: cellValue.content || cellValue.value || String(cellValue) || '',
                                confidence: cellValue.confidence || 0
                            };
                        }
                    }

                    if (Object.keys(processedRow).length > 0) {
                        rows.push(processedRow);
                    }
                }
            }
        }
    } catch (error) {
        console.warn('Error processing table field:', error);
    }

    return { rows };
}

/**
 * Split PDF into individual pages for processing
 */
export async function splitPdfIntoPages(pdfBuffer: Uint8Array): Promise<Uint8Array[]> {
    // For now, return the original PDF as a single "page"
    // In a production implementation, you would use a PDF library like pdf-lib
    // to split the PDF into individual pages
    console.warn('PDF splitting not implemented. Processing entire PDF as one document.');
    return [pdfBuffer];
}

/**
 * Get content type based on file extension
 */
function getContentType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    switch (ext) {
        case '.pdf':
            return 'application/pdf';
        case '.png':
            return 'image/png';
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.tiff':
        case '.tif':
            return 'image/tiff';
        default:
            return 'application/octet-stream';
    }
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
