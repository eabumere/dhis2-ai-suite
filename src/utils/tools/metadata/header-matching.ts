import {tool} from '@langchain/core/tools';
import {z} from 'zod';
import {ChatModels} from '../../chat-model-factory';
import { fetchProgramAttributes } from './structured-tools';

// Types for header matching
export interface HeaderMatch {
    pdfHeader: string;
    attributeName: string;  // Actual DHIS2 attribute name
    attributeId: string;    // Actual DHIS2 attribute ID
    confidence: number;
    isMatch: boolean;
    reason?: string;
}

export interface HeaderMatchingResult {
    matches: HeaderMatch[];
    unmatchedPdfHeaders: string[];
    unmatchedAttributeNames: string[];
    totalPdfHeaders: number;
    totalAttributeNames: number;
    matchedCount: number;
    confidenceThreshold: number;
    error?: string;
    gridDisplay?: Array<{
        pdfHeader: string;
        attributeName: string;
        attributeId: string;
        confidence: number;
        isMatch: boolean;
    }>;
    processingMapping?: Record<string, string>; // PDF header -> DHIS2 attribute ID
}

export interface LLMHeaderMatchingInput {
    pdfHeaders: string[];
    programId: string;  // Required for fetching real program attributes
    confidenceThreshold?: number;
    context?: string;
    attributeMappings?: Record<string, string>; // Optional custom overrides
}

/**
 * LLM Header Matching Tool
 * Uses AI to match PDF headers to mapping headers with semantic understanding
 */
export const matchPdfHeadersToMapping = tool(
    async (input: LLMHeaderMatchingInput): Promise<HeaderMatchingResult> => {
        try {
            const {
                pdfHeaders,
                programId,
                confidenceThreshold = 0.7,
                context = 'DHIS2 tracker data mapping',
                attributeMappings = {}
            } = input;

            // Fetch actual program attributes from DHIS2
            const programAttributes = await fetchProgramAttributes(programId);
            const attributeNames = Object.keys(programAttributes.attributes);

            console.log(`🧠 Starting LLM header matching for ${pdfHeaders.length} PDF headers against ${attributeNames.length} DHIS2 attributes`);

            if (!pdfHeaders || pdfHeaders.length === 0) {
                return {
                    matches: [],
                    unmatchedPdfHeaders: [],
                    unmatchedAttributeNames: attributeNames,
                    totalPdfHeaders: 0,
                    totalAttributeNames: attributeNames.length,
                    matchedCount: 0,
                    confidenceThreshold
                };
            }

            if (!attributeNames || attributeNames.length === 0) {
                return {
                    matches: [],
                    unmatchedPdfHeaders: pdfHeaders,
                    unmatchedAttributeNames: [],
                    totalPdfHeaders: pdfHeaders.length,
                    totalAttributeNames: 0,
                    matchedCount: 0,
                    confidenceThreshold,
                    error: `No tracked entity attributes found for program ${programId}`
                };
            }

            // Initialize Azure OpenAI LLM
            const llm = ChatModels.createAnalysisModel({
                maxTokens: 3000,   // Increased from 500 - Allow for extensive header matching with many fields
                temperature: 0.1  // Low temperature for consistent, deterministic results
            });

            // Create comprehensive prompt for header matching
            const prompt = `
Analyze and match PDF headers to DHIS2 attribute names using semantic understanding and context awareness.

CONTEXT: ${context}

PDF HEADERS (from document extraction):
${pdfHeaders.map((header, index) => `${index + 1}. "${header}"`).join('\n')}

AVAILABLE DHIS2 ATTRIBUTE NAMES (from program configuration - you MUST choose from this exact list):
${attributeNames.map((header, index) => `${index + 1}. "${header}"`).join('\n')}

CRITICAL INSTRUCTION: You MUST select attributeName values ONLY from the "AVAILABLE DHIS2 ATTRIBUTE NAMES" list above. Do NOT create or invent new attribute names. Do NOT use generic terms like "attributes", "field", or "value".

TASK: Match each PDF header to the most appropriate DHIS2 attribute name from the provided list based on:
1. Semantic similarity and meaning
2. Common variations and abbreviations
3. Contextual understanding of DHIS2 tracker fields
4. Medical/health data terminology

MATCHING RULES:
- Consider common variations: "Patient ID" vs "National ID"
- Handle abbreviations: "DoB" vs "Date of Birth"
- Account for formatting differences: "Sex (m/f)" vs "Gender"
- Consider medical terminology: "ART Start Date" vs "Antiretroviral Therapy Start Date"
- Allow for partial matches when meaning is clear
- Return confidence scores (0.0 to 1.0) based on match quality
- If no good match exists, leave the header unmatched

OUTPUT FORMAT: Return ONLY a JSON object with this exact structure:

{
  "matches": [
    {
      "pdfHeader": "exact PDF header text",
      "attributeName": "exact DHIS2 attribute name from the provided list",
      "confidence": 0.85,
      "isMatch": true
    }
  ],
  "unmatchedPdfHeaders": ["list of PDF headers with no good match"],
  "unmatchedAttributeNames": ["list of DHIS2 attribute names with no PDF header match"]
}

IMPORTANT:
- attributeName MUST be one of the exact names from the "AVAILABLE DHIS2 ATTRIBUTE NAMES" list
- Only match headers that have clear semantic correspondence to an available attribute
- Use confidenceThreshold (${confidenceThreshold}) to filter matches
- Return unmatched headers in their respective arrays
- Be conservative with matches - better to leave unmatched than force incorrect matches
- Consider that some PDF headers might be irrelevant or not have corresponding DHIS2 attributes
- Response must be a parsable JSON
`;

            // Make LLM call
            const llmResponse = await llm.invoke([
                { role: "system", content: prompt },
                { role: "user", content: "Please analyze and match the headers according to the instructions above." }
            ]);

            console.log('🧠 LLM header matching response:', llmResponse.content);

            // Parse LLM response
            let content = (llmResponse.content as string).trim();

            // Strip markdown code blocks if present
            if (content.startsWith('```json')) {
                content = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
                console.log('🧠 Stripped markdown code blocks from LLM response');
            } else if (content.startsWith('```')) {
                content = content.replace(/^```\w*\s*/, '').replace(/\s*```$/, '');
                console.log('🧠 Stripped generic markdown code blocks from LLM response');
            }

            let matchingResult: any;

            console.log('🧠 Cleaned LLM response content:', content);

            try {
                // Try to parse as JSON first
                matchingResult = JSON.parse(content);
                console.log('✅ Successfully parsed LLM response as JSON');
            } catch (parseError) {
                console.warn('⚠️ LLM returned non-JSON response, attempting robust parsing');

                // More robust JSON extraction - look for JSON-like structures
                const jsonPatterns = [
                    // Look for complete JSON objects
                    /\{[\s\S]*?\}(?=\s*$|\s*```|\s*\n\s*\n)/,
                    // Look for JSON starting with { and ending with }
                    /\{[\s\S]*\}/,
                    // Look for matches array specifically
                    /"matches"\s*:\s*\[[\s\S]*?\](?=\s*,\s*"unmatched|\s*})/,
                ];

                let extractedJson = null;
                for (const pattern of jsonPatterns) {
                    const match = content.match(pattern);
                    if (match) {
                        try {
                            extractedJson = JSON.parse(match[0]);
                            console.log('✅ Successfully extracted JSON using pattern:', pattern);
                            break;
                        } catch (e) {
                            console.warn('❌ Pattern match failed to parse:', pattern, e);
                            continue;
                        }
                    }
                }

                if (extractedJson) {
                    matchingResult = extractedJson;
                } else {
                    // Last resort: try to construct a basic response structure
                    console.warn('❌ All JSON parsing attempts failed, using fallback structure');
                    matchingResult = {
                        matches: [],
                        unmatchedPdfHeaders: input.pdfHeaders || [],
                        unmatchedAttributeNames: attributeNames || []
                    };
                }
            }

            // Validate and process the result
            const processedResult = processHeaderMatchingResult(
                matchingResult,
                pdfHeaders,
                attributeNames, // Pass attribute names for unmatched calculation
                programAttributes.attributes, // Pass actual attribute mapping
                confidenceThreshold
            );

            console.log(`🧠 Header matching completed: ${processedResult.matchedCount}/${processedResult.totalPdfHeaders} PDF headers matched`);

            // If we have unmatched headers, do a second targeted pass
            if (processedResult.unmatchedPdfHeaders.length > 0 && processedResult.unmatchedAttributeNames.length > 0) {
                console.log(`🔄 Attempting second pass matching for ${processedResult.unmatchedPdfHeaders.length} unmatched PDF headers against ${processedResult.unmatchedAttributeNames.length} unmatched attributes`);

                const secondPassResult = await performSecondPassMatching(
                    processedResult.unmatchedPdfHeaders,
                    processedResult.unmatchedAttributeNames,
                    programAttributes.attributes,
                    confidenceThreshold,
                    context
                );

                if (secondPassResult.matches.length > 0) {
                    // Combine results from both passes
                    const combinedResult: HeaderMatchingResult = {
                        matches: [...processedResult.matches, ...secondPassResult.matches],
                        unmatchedPdfHeaders: secondPassResult.unmatchedPdfHeaders,
                        unmatchedAttributeNames: secondPassResult.unmatchedAttributeNames,
                        totalPdfHeaders: processedResult.totalPdfHeaders,
                        totalAttributeNames: processedResult.totalAttributeNames,
                        matchedCount: processedResult.matches.length + secondPassResult.matches.length,
                        confidenceThreshold
                    };

                    console.log(`✅ Second pass found ${secondPassResult.matches.length} additional matches. Total: ${combinedResult.matchedCount}/${combinedResult.totalPdfHeaders}`);
                    return combinedResult;
                }
            }

            return processedResult;

        } catch (error) {
            console.error('❌ Error in LLM header matching:', error);
            return {
                matches: [],
                unmatchedPdfHeaders: input.pdfHeaders || [],
                unmatchedAttributeNames: [],
                totalPdfHeaders: input.pdfHeaders?.length || 0,
                totalAttributeNames: 0,
                matchedCount: 0,
                confidenceThreshold: input.confidenceThreshold || 0.7,
                error: error.message
            };
        }
    },
    {
        name: "match_pdf_headers_to_mapping",
        description: "Match PDF headers extracted from documents to DHIS2 program attributes using LLM semantic analysis. Fetches real program attributes dynamically and handles variations, abbreviations, and medical terminology to create accurate header mappings with confidence scores.",
        schema: z.object({
            pdfHeaders: z.array(z.string()).describe("Array of header names extracted from PDF documents"),
            programId: z.string().describe("DHIS2 program ID for fetching real program attributes"),
            confidenceThreshold: z.number().min(0).max(1).default(0.7).describe("Minimum confidence score for accepting a match (0.0 to 1.0)"),
            context: z.string().optional().describe("Context for better matching (e.g., 'DHIS2 tracker data mapping')")
        })
    }
);

/**
 * Process and validate the LLM matching result
 */
function processHeaderMatchingResult(
    result: any,
    pdfHeaders: string[],
    attributeNames: string[],
    programAttributes: Record<string, string>,
    confidenceThreshold: number
): HeaderMatchingResult {
    const matches: HeaderMatch[] = [];
    const matchedPdfHeaders = new Set<string>();
    const matchedAttributeNames = new Set<string>();

    // Process matches from LLM result
    if (result.matches && Array.isArray(result.matches)) {
        for (const match of result.matches) {
            if (match.isMatch && match.confidence >= confidenceThreshold) {
                matches.push({
                    pdfHeader: match.pdfHeader,
                    attributeName: match.attributeName,
                    attributeId: getAttributeId(match.attributeName, programAttributes),
                    confidence: match.confidence,
                    isMatch: true,
                    reason: match.reason
                });
                matchedPdfHeaders.add(match.pdfHeader);
                matchedAttributeNames.add(match.attributeName);
            }
        }
    }

    // Find unmatched headers
    const unmatchedPdfHeaders = pdfHeaders.filter(header => !matchedPdfHeaders.has(header));
    const unmatchedAttributeNames = attributeNames.filter(header => !matchedAttributeNames.has(header));

    return {
        matches,
        unmatchedPdfHeaders,
        unmatchedAttributeNames,
        totalPdfHeaders: pdfHeaders.length,
        totalAttributeNames: attributeNames.length,
        matchedCount: matches.length,
        confidenceThreshold
    };
}

/**
 * Enhanced header matching with fallback strategies
 */
export const enhancedHeaderMatching = tool(
    async (input: LLMHeaderMatchingInput): Promise<HeaderMatchingResult> => {
        try {
            const {
                pdfHeaders,
                programId,
                confidenceThreshold = 0.7,
                context = 'DHIS2 tracker data mapping'
            } = input;

            console.log(`🔄 Starting enhanced header matching with fallback strategies`);

            // Fetch actual program attributes from DHIS2
            const programAttributes = await fetchProgramAttributes(programId);
            const attributeNames = Object.keys(programAttributes);

            // Strategy 1: Direct LLM matching
            const directResult = await matchPdfHeadersToMapping.invoke({
                pdfHeaders,
                programId,
                confidenceThreshold,
                context
            });

            // If we have good matches, return them
            if (directResult.matchedCount > 0) {
                console.log(`✅ Direct LLM matching successful: ${directResult.matchedCount} matches`);
                return directResult;
            }

            // Strategy 2: Fallback to similarity-based matching for unmatched headers
            const fallbackResult = performSimilarityMatching(
                directResult.unmatchedPdfHeaders,
                attributeNames,
                programAttributes.attributes,
                confidenceThreshold
            );

            // Combine results
            const combinedResult: HeaderMatchingResult = {
                matches: [...directResult.matches, ...fallbackResult.matches],
                unmatchedPdfHeaders: fallbackResult.unmatchedPdfHeaders,
                unmatchedAttributeNames: fallbackResult.unmatchedAttributeNames,
                totalPdfHeaders: pdfHeaders.length,
                totalAttributeNames: attributeNames.length,
                matchedCount: directResult.matches.length + fallbackResult.matches.length,
                confidenceThreshold
            };

            console.log(`🔄 Fallback matching completed: ${combinedResult.matchedCount} total matches`);

            return combinedResult;

        } catch (error) {
            console.error('❌ Error in enhanced header matching:', error);
            return {
                matches: [],
                unmatchedPdfHeaders: input.pdfHeaders || [],
                unmatchedAttributeNames: [],
                totalPdfHeaders: input.pdfHeaders?.length || 0,
                totalAttributeNames: 0,
                matchedCount: 0,
                confidenceThreshold: input.confidenceThreshold || 0.7,
                error: error.message
            };
        }
    },
    {
        name: "enhanced_header_matching",
        description: "Enhanced header matching with multiple strategies including LLM analysis and similarity-based fallbacks for better coverage and accuracy.",
        schema: z.object({
            pdfHeaders: z.array(z.string()).describe("Array of header names extracted from PDF documents"),
            programId: z.string().describe("DHIS2 program ID for fetching real program attributes"),
            confidenceThreshold: z.number().min(0).max(1).default(0.7).describe("Minimum confidence score for accepting a match (0.0 to 1.0)"),
            context: z.string().optional().describe("Context for better matching (e.g., 'DHIS2 tracker data mapping')")
        })
    }
);

/**
 * Perform similarity-based matching as fallback
 */
function performSimilarityMatching(
    pdfHeaders: string[],
    attributeNames: string[],
    programAttributes: Record<string, string>,
    confidenceThreshold: number
): HeaderMatchingResult {
    const matches: HeaderMatch[] = [];
    const matchedPdfHeaders = new Set<string>();
    const matchedAttributeNames = new Set<string>();

    // Simple string similarity matching
    for (const pdfHeader of pdfHeaders) {
        let bestMatch: { header: string; score: number } | null = null;

        for (const attributeName of attributeNames) {
            const score = calculateSimilarityScore(pdfHeader, attributeName);
            if (score >= confidenceThreshold && (!bestMatch || score > bestMatch.score)) {
                bestMatch = { header: attributeName, score };
            }
        }

        if (bestMatch) {
            matches.push({
                pdfHeader,
                attributeName: bestMatch.header,
                attributeId: getAttributeId(bestMatch.header, programAttributes),
                confidence: bestMatch.score,
                isMatch: true,
                reason: `String similarity match (${bestMatch.score.toFixed(2)})`
            });
            matchedPdfHeaders.add(pdfHeader);
            matchedAttributeNames.add(bestMatch.header);
        }
    }

    const unmatchedPdfHeaders = pdfHeaders.filter(header => !matchedPdfHeaders.has(header));
    const unmatchedAttributeNames = attributeNames.filter(header => !matchedAttributeNames.has(header));

    return {
        matches,
        unmatchedPdfHeaders,
        unmatchedAttributeNames,
        totalPdfHeaders: pdfHeaders.length,
        totalAttributeNames: attributeNames.length,
        matchedCount: matches.length,
        confidenceThreshold
    };
}

/**
 * Calculate string similarity score (simple implementation)
 */
function calculateSimilarityScore(str1: string, str2: string): number {
    const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Exact match
    if (s1 === s2) return 1.0;

    // Contains match
    if (s1.includes(s2) || s2.includes(s1)) return 0.8;

    // Partial match based on common words
    const words1 = s1.split(/[^a-z0-9]+/).filter(w => w.length > 2);
    const words2 = s2.split(/[^a-z0-9]+/).filter(w => w.length > 2);

    if (words1.length === 0 || words2.length === 0) return 0.0;

    const commonWords = words1.filter(word => words2.includes(word));
    const similarity = commonWords.length / Math.max(words1.length, words2.length);

    return similarity >= 0.5 ? similarity : 0.0;
}

/**
 * Validate header matching result
 */
export function validateHeaderMatchingResult(result: HeaderMatchingResult): boolean {
    // Check for duplicate matches
    const pdfHeaderCounts = new Map<string, number>();
    const attributeNameCounts = new Map<string, number>();

    for (const match of result.matches) {
        pdfHeaderCounts.set(match.pdfHeader, (pdfHeaderCounts.get(match.pdfHeader) || 0) + 1);
        attributeNameCounts.set(match.attributeName, (attributeNameCounts.get(match.attributeName) || 0) + 1);
    }

    // Check for one-to-one mapping violations
    const hasDuplicates = Array.from(pdfHeaderCounts.values()).some(count => count > 1) ||
                         Array.from(attributeNameCounts.values()).some(count => count > 1);

    if (hasDuplicates) {
        console.warn('⚠️ Header matching contains duplicate mappings');
        return false;
    }

    // Check confidence thresholds
    const hasLowConfidence = result.matches.some(match => match.confidence < result.confidenceThreshold);
    if (hasLowConfidence) {
        console.warn('⚠️ Header matching contains matches below confidence threshold');
        return false;
    }

    return true;
}

/**
 * Generate mapping configuration from header matches
 */
export function generateMappingConfiguration(matches: HeaderMatch[]): Record<string, string> {
    const mapping: Record<string, string> = {};

    for (const match of matches) {
        // Use the attribute name as key and the actual attribute ID as value
        mapping[match.attributeName] = match.attributeId;
    }

    return mapping;
}

/**
 * Perform second pass targeted matching for unmatched headers
 */
async function performSecondPassMatching(
    unmatchedPdfHeaders: string[],
    unmatchedAttributeNames: string[],
    programAttributes: Record<string, string>,
    confidenceThreshold: number,
    context: string
): Promise<HeaderMatchingResult> {
    console.log(`🎯 Starting second pass matching: ${unmatchedPdfHeaders.length} PDF headers vs ${unmatchedAttributeNames.length} attributes`);

    // Initialize Azure OpenAI LLM for second pass
    const llm = ChatModels.createAnalysisModel({
        maxTokens: 2000,   // Smaller limit for focused matching
        temperature: 0.1
    });

    // Create focused prompt for second pass
    const prompt = `
You are doing a SECOND PASS matching for header mapping. Focus only on these remaining unmatched items.

CONTEXT: ${context}

REMAINING UNMATCHED PDF HEADERS (need to find matches for these):
${unmatchedPdfHeaders.map((header, index) => `${index + 1}. "${header}"`).join('\n')}

REMAINING UNMATCHED DHIS2 ATTRIBUTE NAMES (available options):
${unmatchedAttributeNames.map((header, index) => `${index + 1}. "${header}"`).join('\n')}

CRITICAL: You MUST select attributeName values ONLY from the "REMAINING UNMATCHED DHIS2 ATTRIBUTE NAMES" list above.

TASK: Find the best remaining matches that were missed in the first pass. Look for:
1. Semantic similarities that might have been overlooked
2. Abbreviations or variations
3. Medical terminology connections
4. Contextual relationships

Be more flexible in this second pass - some matches might be reasonable even if not perfect.

OUTPUT FORMAT: Return ONLY a JSON object:
{
  "matches": [
    {
      "pdfHeader": "exact PDF header text",
      "attributeName": "exact unmatched DHIS2 attribute name",
      "confidence": 0.75,
      "isMatch": true,
      "reason": "why this second-pass match works"
    }
  ],
  "unmatchedPdfHeaders": ["still unmatched PDF headers"],
  "unmatchedAttributeNames": ["still unmatched attribute names"]
}
`;

    try {
        // Make LLM call for second pass
        const llmResponse = await llm.invoke([
            { role: "system", content: prompt },
            { role: "user", content: "Find additional matches for the remaining unmatched headers and attributes." }
        ]);

        console.log('🎯 Second pass LLM response:', llmResponse.content);

        // Parse response (reuse the same parsing logic)
        let content = (llmResponse.content as string).trim();

        // Strip markdown code blocks
        if (content.startsWith('```json')) {
            content = content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (content.startsWith('```')) {
            content = content.replace(/^```\w*\s*/, '').replace(/\s*```$/, '');
        }

        let matchingResult: any;

        try {
            matchingResult = JSON.parse(content);
            console.log('✅ Second pass JSON parsed successfully');
        } catch (parseError) {
            console.warn('⚠️ Second pass JSON parsing failed, using empty result');
            matchingResult = {
                matches: [],
                unmatchedPdfHeaders,
                unmatchedAttributeNames
            };
        }

        // Process second pass results
        const matches: HeaderMatch[] = [];
        const matchedPdfHeaders = new Set<string>();
        const matchedAttributeNamesSet = new Set<string>();

        if (matchingResult.matches && Array.isArray(matchingResult.matches)) {
            for (const match of matchingResult.matches) {
                if (match.isMatch && match.confidence >= confidenceThreshold) {
                    matches.push({
                        pdfHeader: match.pdfHeader,
                        attributeName: match.attributeName,
                        attributeId: getAttributeId(match.attributeName, programAttributes),
                        confidence: match.confidence,
                        isMatch: true,
                        reason: match.reason || 'Second pass match'
                    });
                    matchedPdfHeaders.add(match.pdfHeader);
                    matchedAttributeNamesSet.add(match.attributeName);
                }
            }
        }

        // Calculate final unmatched lists
        const finalUnmatchedPdfHeaders = unmatchedPdfHeaders.filter(header => !matchedPdfHeaders.has(header));
        const finalUnmatchedAttributeNames = unmatchedAttributeNames.filter(name => !matchedAttributeNamesSet.has(name));

        const result: HeaderMatchingResult = {
            matches,
            unmatchedPdfHeaders: finalUnmatchedPdfHeaders,
            unmatchedAttributeNames: finalUnmatchedAttributeNames,
            totalPdfHeaders: unmatchedPdfHeaders.length,
            totalAttributeNames: unmatchedAttributeNames.length,
            matchedCount: matches.length,
            confidenceThreshold
        };

        console.log(`🎯 Second pass completed: ${matches.length} additional matches found`);
        return result;

    } catch (error) {
        console.error('❌ Error in second pass matching:', error);
        return {
            matches: [],
            unmatchedPdfHeaders,
            unmatchedAttributeNames,
            totalPdfHeaders: unmatchedPdfHeaders.length,
            totalAttributeNames: unmatchedAttributeNames.length,
            matchedCount: 0,
            confidenceThreshold
        };
    }
}

/**
 * Get real DHIS2 attribute ID from attribute name
 */
function getAttributeId(attributeName: string, programAttributes: Record<string, string>): string {
    // Return the actual DHIS2 attribute ID from the program attributes
    return programAttributes[attributeName] || '';
}
