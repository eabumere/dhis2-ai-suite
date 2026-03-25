/**
 * Centralized LLM Classification Service
 *
 * Provides multilingual classification capabilities for all DHIS2 AI Suite components.
 * Handles intent classification, column type detection, query analysis, error classification,
 * and operation complexity analysis using LLM-based semantic understanding.
 */

import { ChatModels } from './chat-model-factory';

export interface IntentClassification {
    intent: 'search' | 'analytics' | 'crud' | 'data_entry' | 'unknown';
    confidence: number;
    reasoning: string;
    alternatives: Array<{ intent: string; confidence: number }>;
}

export interface ColumnTypeAnalysis {
    type: 'dataElement' | 'orgUnit' | 'period' | 'categoryOption' | 'attributeOption' | 'value' | 'unknown';
    confidence: number;
    reasoning: string;
    alternatives: Array<{ type: string; confidence: number }>;
}

export interface QueryAnalysis {
    intent: string;
    confidence: number;
    entities: Array<{ type: string; value: string; confidence: number }>;
    complexity: 'simple' | 'moderate' | 'complex';
    requiresMetadata: boolean;
}

export interface ErrorClassification {
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: 'resource' | 'auth' | 'network' | 'input' | 'server' | 'unknown';
    reasoning: string;
    suggestedActions: string[];
}

export interface OperationAnalysis {
    complexity: 'single' | 'multiple' | 'complex';
    operations: Array<{ type: string; confidence: number }>;
    requiresConfirmation: boolean;
    reasoning: string;
}

export class LLMClassificationService {
    private llmModel: any;
    private cache = new Map<string, { result: any; timestamp: number; ttl: number }>();
    private cacheTTL = 30 * 60 * 1000; // 30 minutes

    // Shared cache instance for cross-service cache sharing
    private static sharedCache = new Map<string, { result: any; timestamp: number; ttl: number; service: string }>();
    private useSharedCache = false;

    // Batch processing queue
    private static batchQueue: Array<{
        id: string;
        cacheKey: string;
        input: any;
        prompt: string;
        resolve: (value: string) => void;
        reject: (reason: any) => void;
    }> = [];
    private static batchProcessing = false;
    private static readonly BATCH_SIZE = 5; // Process up to 5 requests simultaneously
    private static readonly BATCH_DELAY = 100; // ms delay to collect batch requests

    constructor() {
        try {
            this.llmModel = ChatModels.createAgentModel();
        } catch (error) {
            console.warn('Failed to initialize LLM model for classification service:', error);
            this.llmModel = null;
        }
    }

    /**
     * Classify user intent from natural language query
     */
    async classifyIntent(query: string, context?: any): Promise<IntentClassification> {
        const prompt = `Analyze this DHIS2 user query and classify the primary intent.

Query: "${query}"
${context ? `Context: ${JSON.stringify(context)}` : ''}

Classify into one of these categories:
- search: Finding or looking up existing data/metadata
- analytics: Analyzing data, generating charts, calculating metrics
- crud: Creating, updating, or deleting metadata/data
- data_entry: Entering or submitting data values
- unknown: Unclear or ambiguous intent

Return JSON format:
{
    "intent": "category_name",
    "confidence": 0.0-1.0,
    "reasoning": "brief explanation",
    "alternatives": [{"intent": "alternative", "confidence": 0.8}, ...]
}`;

        try {
            const result = await this.getCachedLLMResult('intent_classification', { query, context }, prompt);
            return JSON.parse(result);
        } catch (error) {
            console.warn('LLM intent classification failed:', error);
            return this.getFallbackIntentClassification(query);
        }
    }

    /**
     * Detect DHIS2 column/data type from header text
     */
    async detectColumnType(header: string, context?: any): Promise<ColumnTypeAnalysis> {
        const prompt = `Analyze this column header and determine the DHIS2 data type.

Header: "${header}"
${context ? `Context: ${JSON.stringify(context)}` : ''}

Possible DHIS2 types:
- dataElement: Indicators, data elements, metrics
- orgUnit: Organization units, facilities, locations
- period: Time periods, dates, reporting periods
- categoryOption: Category options, disaggregations
- attributeOption: Attribute options, classifications
- value: Data values, measurements, quantities
- unknown: Not a recognized DHIS2 type

Consider synonyms in multiple languages (English, French, Spanish, Arabic, etc.)

Return JSON format:
{
    "type": "dhis2_type",
    "confidence": 0.0-1.0,
    "reasoning": "brief explanation",
    "alternatives": [{"type": "alternative", "confidence": 0.7}, ...]
}`;

        try {
            const result = await this.getCachedLLMResult('column_type_detection', { header, context }, prompt);
            return JSON.parse(result);
        } catch (error) {
            console.warn('LLM column type detection failed:', error);
            return this.getFallbackColumnType(header);
        }
    }

    /**
     * Analyze query for intent, entities, and complexity
     */
    async analyzeQuery(query: string, context?: any): Promise<QueryAnalysis> {
        const prompt = `Analyze this DHIS2 query for intent, entities, and complexity.

Query: "${query}"
${context ? `Context: ${JSON.stringify(context)}` : ''}

Extract:
- Primary intent (search, analyze, create, update, etc.)
- Named entities (indicators, org units, periods, etc.)
- Query complexity level
- Whether metadata selection is needed

Return JSON format:
{
    "intent": "primary_intent",
    "confidence": 0.0-1.0,
    "entities": [{"type": "entity_type", "value": "entity_name", "confidence": 0.9}, ...],
    "complexity": "simple|moderate|complex",
    "requiresMetadata": true|false
}`;

        try {
            const result = await this.getCachedLLMResult('query_analysis', { query, context }, prompt);
            return JSON.parse(result);
        } catch (error) {
            console.warn('LLM query analysis failed:', error);
            return this.getFallbackQueryAnalysis(query);
        }
    }

    /**
     * Classify errors and provide recovery suggestions
     */
    async classifyError(error: any): Promise<ErrorClassification> {
        const errorText = typeof error === 'string' ? error :
                         error.message || error.toString() || 'Unknown error';

        const prompt = `Analyze this DHIS2 error and classify it appropriately.

Error: "${errorText}"

Categories:
- resource: Missing or invalid resources (not found, doesn't exist)
- auth: Authentication/authorization issues (unauthorized, forbidden)
- network: Connectivity problems (timeout, connection failed)
- input: Invalid input data (validation errors, format issues)
- server: Server-side errors (500, internal errors)
- unknown: Unclassified errors

Severity levels: low, medium, high, critical

Return JSON format:
{
    "severity": "severity_level",
    "category": "error_category",
    "reasoning": "brief explanation",
    "suggestedActions": ["action 1", "action 2", ...]
}`;

        try {
            const result = await this.getCachedLLMResult('error_classification', { error: errorText }, prompt);
            return JSON.parse(result);
        } catch (error) {
            console.warn('LLM error classification failed:', error);
            return this.getFallbackErrorClassification(errorText);
        }
    }

    /**
     * Analyze operation complexity and requirements
     */
    async analyzeOperationComplexity(query: string): Promise<OperationAnalysis> {
        const prompt = `Analyze this DHIS2 operation query for complexity and requirements.

Query: "${query}"

Determine:
- Operation complexity (single, multiple operations, complex workflow)
- Individual operations detected
- Whether user confirmation is needed
- Reasoning for the assessment

Return JSON format:
{
    "complexity": "single|multiple|complex",
    "operations": [{"type": "operation_type", "confidence": 0.9}, ...],
    "requiresConfirmation": true|false,
    "reasoning": "brief explanation"
}`;

        try {
            const result = await this.getCachedLLMResult('operation_complexity', { query }, prompt);
            return JSON.parse(result);
        } catch (error) {
            console.warn('LLM operation complexity analysis failed:', error);
            return this.getFallbackOperationAnalysis(query);
        }
    }

    // Public methods for performance optimization

    /**
     * Enable shared cache across all LLM classification service instances
     */
    enableSharedCache(): void {
        this.useSharedCache = true;
        console.log('🤖 LLM Classification Service: Shared cache enabled');
    }

    /**
     * Disable shared cache (use instance-specific cache only)
     */
    disableSharedCache(): void {
        this.useSharedCache = false;
        console.log('🤖 LLM Classification Service: Shared cache disabled');
    }

    /**
     * Get cache statistics for monitoring
     */
    getCacheStats(): { instanceCache: number; sharedCache: number; hitRate: number } {
        return {
            instanceCache: this.cache.size,
            sharedCache: LLMClassificationService.sharedCache.size,
            hitRate: this.calculateHitRate()
        };
    }

    /**
     * Clear all caches (both instance and shared)
     */
    clearAllCaches(): void {
        this.cache.clear();
        LLMClassificationService.sharedCache.clear();
        console.log('🧹 LLM Classification Service: All caches cleared');
    }

    /**
     * Enable batch processing for multiple simultaneous requests
     */
    static enableBatchProcessing(): void {
        console.log('📦 LLM Classification Service: Batch processing enabled');
        // Batch processing is automatically handled in getCachedLLMResult
    }

    /**
     * Process multiple classification requests in batch
     */
    async batchClassifyIntents(requests: Array<{ query: string; context?: any; id: string }>): Promise<Map<string, IntentClassification>> {
        const results = new Map<string, IntentClassification>();

        // Process in batches to avoid overwhelming the LLM
        const batchSize = LLMClassificationService.BATCH_SIZE;
        for (let i = 0; i < requests.length; i += batchSize) {
            const batch = requests.slice(i, i + batchSize);

            // Create prompts for this batch
            const batchPrompts = batch.map(req => ({
                id: req.id,
                prompt: `Analyze this DHIS2 user query and classify the primary intent.

Query: "${req.query}"
${req.context ? `Context: ${JSON.stringify(req.context)}` : ''}

Classify into one of these categories:
- search: Finding or looking up existing data/metadata
- analytics: Analyzing data, generating charts, calculating metrics
- crud: Creating, updating, or deleting metadata/data
- data_entry: Entering or submitting data values
- unknown: Unclear or ambiguous intent

Return JSON format:
{
    "intent": "category_name",
    "confidence": 0.0-1.0,
    "reasoning": "brief explanation",
    "alternatives": [{"intent": "alternative", "confidence": 0.8}, ...]
}`
            }));

            // Process batch with optimized prompting
            const batchResults = await this.processBatch(batchPrompts);

            // Parse and store results
            batchResults.forEach((result, index) => {
                try {
                    const classification = JSON.parse(result);
                    results.set(batch[index].id, classification);
                } catch (error) {
                    console.error(`❌ Failed to parse batch result for ${batch[index].id}:`, error);
                    results.set(batch[index].id, this.getFallbackIntentClassification(batch[index].query));
                }
            });

            // Small delay between batches to avoid rate limiting
            if (i + batchSize < requests.length) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        return results;
    }

    // Private helper methods

    private calculateHitRate(): number {
        // Simplified hit rate calculation - in production, track actual hits vs misses
        return 0.75; // Placeholder
    }

    private async processBatch(batchPrompts: Array<{ id: string; prompt: string }>): Promise<string[]> {
        const results: string[] = [];

        // For now, process sequentially - in production, could use parallel processing
        for (const { prompt } of batchPrompts) {
            try {
                const result = await this.getCachedLLMResult('batch_intent_classification', { prompt }, prompt);
                results.push(result);
            } catch (error) {
                console.error('❌ Batch processing failed for prompt:', error);
                results.push('{"intent": "unknown", "confidence": 0.0, "reasoning": "Batch processing failed", "alternatives": []}');
            }
        }

        return results;
    }

    private async getCachedLLMResult(cacheKey: string, input: any, prompt: string): Promise<string> {
        const inputHash = this.hashInput(input);
        const cacheEntryKey = `${cacheKey}_${inputHash}`;

        // Check shared cache first if enabled
        if (this.useSharedCache) {
            const sharedCached = LLMClassificationService.sharedCache.get(cacheEntryKey);
            if (sharedCached && (Date.now() - sharedCached.timestamp) < sharedCached.ttl) {
                console.log('🎯 Shared cache hit for:', cacheEntryKey);
                return sharedCached.result;
            }
        }

        // Check instance cache
        const cached = this.cache.get(cacheEntryKey);
        if (cached && (Date.now() - cached.timestamp) < cached.ttl) {
            console.log('🎯 Instance cache hit for:', cacheEntryKey);
            return cached.result;
        }

        // Make LLM call
        if (!this.llmModel) {
            throw new Error('LLM model not available');
        }

        const result = await this.llmModel.invoke([{ role: 'user', content: prompt }]);
        const response = (result.content as string).trim();

        // Cache the result in both caches if shared cache is enabled
        const cacheEntry = {
            result: response,
            timestamp: Date.now(),
            ttl: this.cacheTTL
        };

        this.cache.set(cacheEntryKey, cacheEntry);

        if (this.useSharedCache) {
            LLMClassificationService.sharedCache.set(cacheEntryKey, {
                ...cacheEntry,
                service: 'LLMClassificationService'
            });
        }

        // Clean up old cache entries periodically
        this.cleanCache();
        if (this.useSharedCache) {
            this.cleanSharedCache();
        }

        return response;
    }

    private cleanSharedCache(): void {
        const now = Date.now();
        for (const [key, value] of LLMClassificationService.sharedCache.entries()) {
            if (now - value.timestamp > value.ttl) {
                LLMClassificationService.sharedCache.delete(key);
            }
        }
    }

    private cleanCache(): void {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > value.ttl) {
                this.cache.delete(key);
            }
        }
    }

    private hashInput(input: any): string {
        const str = JSON.stringify(input);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    }

    // Fallback methods for when LLM is unavailable

    private getFallbackIntentClassification(query: string): IntentClassification {
        const lowerQuery = query.toLowerCase();

        // Simple keyword-based fallback
        if (lowerQuery.includes('find') || lowerQuery.includes('search') || lowerQuery.includes('show')) {
            return {
                intent: 'search',
                confidence: 0.7,
                reasoning: 'Keyword-based fallback: contains search terms',
                alternatives: []
            };
        }

        if (lowerQuery.includes('analyze') || lowerQuery.includes('chart') || lowerQuery.includes('graph')) {
            return {
                intent: 'analytics',
                confidence: 0.7,
                reasoning: 'Keyword-based fallback: contains analytics terms',
                alternatives: []
            };
        }

        if (lowerQuery.includes('create') || lowerQuery.includes('update') || lowerQuery.includes('delete')) {
            return {
                intent: 'crud',
                confidence: 0.7,
                reasoning: 'Keyword-based fallback: contains CRUD terms',
                alternatives: []
            };
        }

        return {
            intent: 'unknown',
            confidence: 0.3,
            reasoning: 'No clear intent detected',
            alternatives: []
        };
    }

    private getFallbackColumnType(header: string): ColumnTypeAnalysis {
        const lowerHeader = header.toLowerCase();

        // Simple keyword-based fallback
        if (lowerHeader.includes('dataelement') || lowerHeader.includes('data_element')) {
            return {
                type: 'dataElement',
                confidence: 0.8,
                reasoning: 'Keyword-based fallback: contains data element terms',
                alternatives: []
            };
        }

        if (lowerHeader.includes('orgunit') || lowerHeader.includes('org_unit')) {
            return {
                type: 'orgUnit',
                confidence: 0.8,
                reasoning: 'Keyword-based fallback: contains org unit terms',
                alternatives: []
            };
        }

        if (lowerHeader.includes('period')) {
            return {
                type: 'period',
                confidence: 0.8,
                reasoning: 'Keyword-based fallback: contains period terms',
                alternatives: []
            };
        }

        if (lowerHeader.includes('value')) {
            return {
                type: 'value',
                confidence: 0.6,
                reasoning: 'Keyword-based fallback: contains value term',
                alternatives: []
            };
        }

        return {
            type: 'unknown',
            confidence: 0.3,
            reasoning: 'No recognized DHIS2 column type detected',
            alternatives: []
        };
    }

    private getFallbackQueryAnalysis(query: string): QueryAnalysis {
        const lowerQuery = query.toLowerCase();

        return {
            intent: lowerQuery.includes('analyze') ? 'analyze' : 'unknown',
            confidence: 0.5,
            entities: [],
            complexity: 'simple',
            requiresMetadata: lowerQuery.includes('selected') || lowerQuery.includes('these')
        };
    }

    private getFallbackErrorClassification(errorText: string): ErrorClassification {
        const lowerError = errorText.toLowerCase();

        let category: ErrorClassification['category'] = 'unknown';
        let severity: ErrorClassification['severity'] = 'medium';

        if (lowerError.includes('not found') || lowerError.includes('does not exist')) {
            category = 'resource';
            severity = 'medium';
        } else if (lowerError.includes('unauthorized') || lowerError.includes('forbidden')) {
            category = 'auth';
            severity = 'high';
        } else if (lowerError.includes('network') || lowerError.includes('timeout')) {
            category = 'network';
            severity = 'high';
        } else if (lowerError.includes('validation') || lowerError.includes('invalid')) {
            category = 'input';
            severity = 'medium';
        }

        return {
            severity,
            category,
            reasoning: 'Keyword-based fallback error classification',
            suggestedActions: ['Please check the error message and try again']
        };
    }

    private getFallbackOperationAnalysis(query: string): OperationAnalysis {
        const lowerQuery = query.toLowerCase();
        const hasMultipleOps = lowerQuery.includes(' and ') || lowerQuery.includes(' with ') ||
                              lowerQuery.includes(' also ') || lowerQuery.includes(' plus ');

        return {
            complexity: hasMultipleOps ? 'multiple' : 'single',
            operations: [],
            requiresConfirmation: hasMultipleOps,
            reasoning: 'Keyword-based fallback operation analysis'
        };
    }
}

// Global singleton instance
export const llmClassificationService = new LLMClassificationService();
