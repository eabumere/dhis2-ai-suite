import { ChatModels } from './chat-model-factory';

// =============================================================================
// CLARIFICATION SERVICE - Global clarification system for all agents
// Prevents clarification loops while providing intelligent help when needed
// =============================================================================

export interface Interpretation {
    intent: string;
    confidence: number;
    parameters?: Record<string, any>;
    reasoning?: string;
    domain?: string;
    requiredParams?: string[];
    optionalParams?: string[];
}

export interface ClarificationContext {
    domain: 'analytics' | 'data_entry' | 'search' | 'crud' | 'general';
    locale?: string;
    userId?: string;
    conversationHistory?: Array<{role: string, content: string}>;
    previousClarifications?: ClarificationAttempt[];
    maxAttempts?: number;
    attemptCount?: number;
}

export interface ClarificationAttempt {
    originalQuery: string;
    interpretations: Interpretation[];
    clarificationType: ClarificationType;
    userResponse?: any;
    resolvedIntent?: string;
    timestamp: number;
    success: boolean;
}

export type ClarificationType = 'options' | 'confirm' | 'examples' | 'parameters' | 'help';

export interface ClarificationDecision {
    seek: boolean;
    reason: 'high_confidence' | 'best_guess' | 'conflicting_interpretations' |
            'domain_mismatch' | 'missing_parameters' | 'genuine_confusion';
    confidence?: number;
}

export interface ClarificationRequest {
    type: ClarificationType;
    message: string;
    originalQuery: string;
    options?: ClarificationOption[];
    confirmation?: ConfirmationRequest;
    examples?: string[];
    helpTopics?: HelpTopic[];
    attemptCount: number;
    context: ClarificationContext;
}

export interface ClarificationOption {
    id: string;
    label: string;
    description?: string;
    intent: string;
    confidence: number;
}

export interface ConfirmationRequest {
    interpretation: string;
    confidence: number;
    alternatives?: string[];
}

export interface HelpTopic {
    title: string;
    description: string;
    examples: string[];
}

export interface ClarificationStrategy {
    domain: string;
    confidenceThreshold: number;
    requireClarificationThreshold: number;
    maxClarificationAttempts: number;
    preferredClarificationTypes: ClarificationType[];
    fallbackBehavior: 'best_guess' | 'reject' | 'help';
    domainKeywords?: string[];
    commonPatterns?: RegExp[];
}

export interface ResolvedInterpretation {
    intent: string;
    confidence: number;
    parameters: Record<string, any>;
    clarificationUsed: boolean;
    finalReasoning: string;
}

// =============================================================================
// CLARIFICATION SERVICE IMPLEMENTATION
// =============================================================================

class ClarificationService {
    private strategies: Map<string, ClarificationStrategy> = new Map();
    private attemptHistory: ClarificationAttempt[] = [];

    constructor() {
        this.initializeDefaultStrategies();
    }

    // Initialize domain-specific strategies
    private initializeDefaultStrategies() {
        this.strategies.set('analytics', {
            domain: 'analytics',
            confidenceThreshold: 0.7, // Proceed if > 70% confident
            requireClarificationThreshold: 0.4, // Seek clarification if < 40%
            maxClarificationAttempts: 2,
            preferredClarificationTypes: ['options', 'examples', 'confirm'],
            fallbackBehavior: 'best_guess',
            domainKeywords: ['show', 'chart', 'graph', 'analyze', 'trend', 'compare', 'visualize'],
            commonPatterns: [
                /show\s+(.+?)\s+(?:by|for|in)/i,
                /(?:chart|graph|visualize)\s+(.+)/i,
                /analyze\s+(.+)/i
            ]
        });

        this.strategies.set('data_entry', {
            domain: 'data_entry',
            confidenceThreshold: 0.8, // Higher threshold for data entry precision
            requireClarificationThreshold: 0.5,
            maxClarificationAttempts: 3,
            preferredClarificationTypes: ['options', 'confirm', 'parameters'],
            fallbackBehavior: 'reject', // Data entry needs accuracy
            domainKeywords: ['enter', 'input', 'submit', 'record', 'add', 'create'],
            commonPatterns: [
                /(?:enter|input|submit|record|add)\s+(.+)/i,
                /(?:data|values?)\s+(?:for|of)\s+(.+)/i
            ]
        });

        this.strategies.set('search', {
            domain: 'search',
            confidenceThreshold: 0.6,
            requireClarificationThreshold: 0.3,
            maxClarificationAttempts: 2,
            preferredClarificationTypes: ['examples', 'options'],
            fallbackBehavior: 'best_guess',
            domainKeywords: ['find', 'search', 'lookup', 'get', 'show'],
            commonPatterns: [
                /(?:find|search|lookup|get)\s+(.+)/i,
                /(?:show|display)\s+(.+)/i
            ]
        });

        this.strategies.set('crud', {
            domain: 'crud',
            confidenceThreshold: 0.8,
            requireClarificationThreshold: 0.6,
            maxClarificationAttempts: 2,
            preferredClarificationTypes: ['confirm', 'options'],
            fallbackBehavior: 'reject',
            domainKeywords: ['create', 'update', 'delete', 'modify', 'change'],
            commonPatterns: [
                /(?:create|update|delete|modify|change)\s+(.+)/i
            ]
        });

        this.strategies.set('general', {
            domain: 'general',
            confidenceThreshold: 0.5,
            requireClarificationThreshold: 0.2,
            maxClarificationAttempts: 1,
            preferredClarificationTypes: ['options', 'help'],
            fallbackBehavior: 'help',
            domainKeywords: [],
            commonPatterns: []
        });
    }

    // Main decision function: should we seek clarification?
    async shouldSeekClarification(
        query: string,
        interpretations: Interpretation[],
        context: ClarificationContext
    ): Promise<ClarificationDecision> {

        const strategy = this.strategies.get(context.domain) || this.strategies.get('general')!;
        const attemptCount = context.attemptCount || 0;

        // Never seek clarification beyond max attempts
        if (attemptCount >= strategy.maxClarificationAttempts) {
            return { seek: false, reason: 'best_guess' };
        }

        // No interpretations available
        if (!interpretations || interpretations.length === 0) {
            return { seek: true, reason: 'genuine_confusion' };
        }

        const topInterpretation = interpretations[0];
        const confidence = topInterpretation.confidence;

        // High confidence → Don't seek clarification
        if (confidence >= strategy.confidenceThreshold) {
            return { seek: false, reason: 'high_confidence', confidence };
        }

        // Check for conflicting interpretations (similar confidence between top 2)
        if (interpretations.length >= 2) {
            const [first, second] = interpretations;
            const confidenceDiff = Math.abs(first.confidence - second.confidence);

            if (confidenceDiff < 0.15 && first.confidence > strategy.requireClarificationThreshold) {
                // Close confidence scores → user might mean either
                return { seek: true, reason: 'conflicting_interpretations', confidence: first.confidence };
            }
        }

        // Check for domain capability mismatch
        const hasValidInterpretation = interpretations.some(interpretation =>
            this.isValidForDomain(interpretation, context.domain)
        );

        if (!hasValidInterpretation && confidence > strategy.requireClarificationThreshold) {
            return { seek: true, reason: 'domain_mismatch', confidence };
        }

        // Check for missing required parameters
        const hasRequiredParams = this.hasRequiredParameters(query, topInterpretation);
        if (!hasRequiredParams && confidence > strategy.requireClarificationThreshold) {
            return { seek: true, reason: 'missing_parameters', confidence };
        }

        // Very low confidence indicates genuine confusion
        if (confidence < strategy.requireClarificationThreshold) {
            return { seek: true, reason: 'genuine_confusion', confidence };
        }

        // Default: proceed with best guess
        return { seek: false, reason: 'best_guess', confidence };
    }

    // Generate appropriate clarification request
    async generateClarificationRequest(
        query: string,
        interpretations: Interpretation[],
        context: ClarificationContext
    ): Promise<ClarificationRequest> {

        const strategy = this.strategies.get(context.domain) || this.strategies.get('general')!;
        const attemptCount = context.attemptCount || 0;

        // Choose clarification type based on strategy and attempt count
        const clarificationType = this.selectClarificationType(strategy, attemptCount, interpretations);

        const baseRequest: Omit<ClarificationRequest, 'options' | 'confirmation' | 'examples' | 'helpTopics'> = {
            type: clarificationType,
            message: this.generateClarificationMessage(query, clarificationType, context),
            originalQuery: query,
            attemptCount,
            context
        };

        // Generate type-specific content
        switch (clarificationType) {
            case 'options':
                return {
                    ...baseRequest,
                    options: this.generateClarificationOptions(interpretations, context)
                };

            case 'confirm':
                return {
                    ...baseRequest,
                    confirmation: this.generateConfirmationRequest(query, interpretations[0], context)
                };

            case 'examples':
                return {
                    ...baseRequest,
                    examples: this.generateHelpfulExamples(context.domain, context.locale)
                };

            case 'parameters':
                return {
                    ...baseRequest,
                    options: this.generateParameterOptions(query, interpretations[0], context)
                };

            case 'help':
                return {
                    ...baseRequest,
                    helpTopics: this.generateHelpTopics(context.domain, context.locale)
                };

            default:
                return {
                    ...baseRequest,
                    options: this.generateClarificationOptions(interpretations, context)
                };
        }
    }

    // Process user response to clarification
    async processClarificationResponse(
        originalQuery: string,
        clarificationResponse: any,
        context: ClarificationContext
    ): Promise<ResolvedInterpretation> {

        // Record the clarification attempt
        const attempt: ClarificationAttempt = {
            originalQuery,
            interpretations: [], // Would be passed in from caller
            clarificationType: clarificationResponse.type || 'options',
            userResponse: clarificationResponse,
            timestamp: Date.now(),
            success: true
        };

        this.attemptHistory.push(attempt);

        // Process based on response type
        if (clarificationResponse.selectedOption) {
            // User selected from options
            return {
                intent: clarificationResponse.selectedOption.intent,
                confidence: clarificationResponse.selectedOption.confidence || 0.9,
                parameters: clarificationResponse.parameters || {},
                clarificationUsed: true,
                finalReasoning: `User selected: ${clarificationResponse.selectedOption.label}`
            };
        }

        if (clarificationResponse.confirmed) {
            // User confirmed interpretation
            return {
                intent: clarificationResponse.confirmedIntent,
                confidence: 0.9,
                parameters: clarificationResponse.parameters || {},
                clarificationUsed: true,
                finalReasoning: `User confirmed interpretation: ${clarificationResponse.confirmedIntent}`
            };
        }

        if (clarificationResponse.rephrasedQuery) {
            // User provided new query - this would trigger re-interpretation
            return {
                intent: 'rephrase',
                confidence: 0.5,
                parameters: { newQuery: clarificationResponse.rephrasedQuery },
                clarificationUsed: true,
                finalReasoning: `User rephrased query: ${clarificationResponse.rephrasedQuery}`
            };
        }

        // Fallback
        return {
            intent: 'unknown',
            confidence: 0.1,
            parameters: {},
            clarificationUsed: true,
            finalReasoning: 'Unable to process clarification response'
        };
    }

    // Register custom strategy for specific domain
    registerStrategy(domain: string, strategy: ClarificationStrategy) {
        this.strategies.set(domain, strategy);
    }

    // Get clarification history for learning
    getClarificationHistory(userId?: string): ClarificationAttempt[] {
        return this.attemptHistory.filter(attempt =>
            !userId || attempt.originalQuery.includes(userId)
        );
    }

    // Private helper methods
    private selectClarificationType(
        strategy: ClarificationStrategy,
        attemptCount: number,
        interpretations: Interpretation[]
    ): ClarificationType {

        // First attempt: prefer options for multiple interpretations
        if (attemptCount === 0 && interpretations.length > 1) {
            return 'options';
        }

        // Later attempts: provide examples or help
        if (attemptCount >= strategy.maxClarificationAttempts - 1) {
            return 'help';
        }

        // Use strategy preferences
        return strategy.preferredClarificationTypes[attemptCount] ||
               strategy.preferredClarificationTypes[0] ||
               'options';
    }

    private generateClarificationMessage(
        query: string,
        type: ClarificationType,
        context: ClarificationContext
    ): string {

        const messages = {
            options: `I found multiple possible interpretations for "${query}". Which one matches what you meant?`,
            confirm: `I think you meant to ${query}. Is that correct?`,
            examples: `I'm not sure what you mean by "${query}". Here are some examples of what I can help with:`,
            parameters: `I need more information to complete "${query}". What specific details can you provide?`,
            help: `I'd be happy to help with "${query}", but I need more context. Here are some topics I can assist with:`
        };

        return messages[type] || messages.options;
    }

    private generateClarificationOptions(
        interpretations: Interpretation[],
        context: ClarificationContext
    ): ClarificationOption[] {

        return interpretations.slice(0, 4).map((interpretation, index) => ({
            id: `option_${index}`,
            label: this.interpretationToLabel(interpretation, context.domain),
            description: interpretation.reasoning,
            intent: interpretation.intent,
            confidence: interpretation.confidence
        }));
    }

    private generateConfirmationRequest(
        query: string,
        interpretation: Interpretation,
        context: ClarificationContext
    ): ConfirmationRequest {

        return {
            interpretation: this.interpretationToLabel(interpretation, context.domain),
            confidence: interpretation.confidence,
            alternatives: interpretation.intent === 'analytics' ? ['Search instead', 'Enter data instead'] : undefined
        };
    }

    private generateHelpfulExamples(domain: string, locale?: string): string[] {
        const examples = {
            analytics: [
                'Show malaria cases by district for 2024',
                'Compare vaccination rates between regions',
                'Display HIV testing trends over time',
                'Create a chart of facility performance'
            ],
            data_entry: [
                'Enter vaccination data for Central Hospital',
                'Submit malaria case numbers for this month',
                'Record patient visits for District Clinic',
                'Input laboratory test results'
            ],
            search: [
                'Find all indicators about HIV',
                'Show me data elements for malaria',
                'Search for facilities in Nairobi',
                'Find user groups with admin access'
            ]
        };

        return examples[domain as keyof typeof examples] || examples.analytics;
    }

    private generateParameterOptions(
        query: string,
        interpretation: Interpretation,
        context: ClarificationContext
    ): ClarificationOption[] {

        const missingParams = this.identifyMissingParameters(query, interpretation);

        return missingParams.map((param, index) => ({
            id: `param_${index}`,
            label: `Specify ${param}`,
            description: `Please provide the ${param} for this request`,
            intent: interpretation.intent,
            confidence: interpretation.confidence * 0.8
        }));
    }

    private generateHelpTopics(domain: string, locale?: string): HelpTopic[] {
        const topics = {
            analytics: [
                {
                    title: 'Creating Charts and Graphs',
                    description: 'Learn how to visualize your health data',
                    examples: ['Show malaria cases by district', 'Compare vaccination rates']
                },
                {
                    title: 'Data Analysis Queries',
                    description: 'Analyze trends and patterns in your data',
                    examples: ['Trends over time', 'Compare regions', 'Performance analysis']
                }
            ],
            data_entry: [
                {
                    title: 'Entering Health Data',
                    description: 'How to submit data values for reporting',
                    examples: ['Enter monthly facility data', 'Submit vaccination numbers']
                }
            ]
        };

        return topics[domain as keyof typeof topics] || topics.analytics;
    }

    private interpretationToLabel(interpretation: Interpretation, domain?: string): string {
        // Convert technical intent to user-friendly label
        const labels = {
            analytics: '📊 Create analytics and charts',
            data_entry: '📝 Enter or submit data',
            search: '🔍 Search for information',
            crud: '⚙️ Manage data structures',
            aggregate_data: '📊 Enter aggregate data'
        };

        return labels[interpretation.intent as keyof typeof labels] ||
               `${interpretation.intent} (${Math.round(interpretation.confidence * 100)}% confidence)`;
    }

    private isValidForDomain(interpretation: Interpretation, domain: string): boolean {
        // Domain validation logic
        const domainMappings = {
            analytics: ['analytics', 'charts', 'visualization'],
            data_entry: ['data_entry', 'aggregate_data', 'submit', 'enter'],
            search: ['search', 'find', 'lookup'],
            crud: ['create', 'update', 'delete', 'crud']
        };

        const validIntents = domainMappings[domain as keyof typeof domainMappings] || [];
        return validIntents.includes(interpretation.intent);
    }

    private hasRequiredParameters(query: string, interpretation: Interpretation): boolean {
        // Check if required parameters are present
        const requiredParams = interpretation.requiredParams || [];

        return requiredParams.every(param => {
            // Simple check - could be enhanced with NLP
            return query.toLowerCase().includes(param.toLowerCase());
        });
    }

    private identifyMissingParameters(query: string, interpretation: Interpretation): string[] {
        const requiredParams = interpretation.requiredParams || [];
        const missingParams: string[] = [];

        for (const param of requiredParams) {
            if (!query.toLowerCase().includes(param.toLowerCase())) {
                missingParams.push(param);
            }
        }

        return missingParams;
    }
}

// Export singleton instance
export const clarificationService = new ClarificationService();

// All interfaces are exported individually above
