import { AzureChatOpenAI } from '@langchain/openai';

// =============================================================================
// CHAT MODEL FACTORY - CLEAN MODEL CREATION WITH SWAPPABILITY
// =============================================================================

/**
 * Base configuration for all chat models
 */
export interface BaseChatModelConfig {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
}

/**
 * Provider-agnostic overrides that work across all model providers
 */
export interface ChatModelOverrides extends BaseChatModelConfig {
  // Only includes common properties that all providers support
}

/**
 * Azure OpenAI specific configuration
 */
export interface AzureChatModelConfig extends BaseChatModelConfig {
  model?: string;
  azureOpenAIApiKey?: string;
  azureOpenAIEndpoint?: string;
  azureOpenAIApiDeploymentName?: string;
  azureOpenAIApiVersion?: string;
}

/**
 * Model type enumeration for swappability (internal use only)
 */
enum ChatModelType {
  AZURE_OPENAI = 'azure-openai',
  OPENAI = 'openai',
  // Future: ANTHROPIC = 'anthropic', etc.
}

/**
 * Preset configurations for different use cases
 */
export const MODEL_PRESETS = {
  // For agent workflows - deterministic, focused responses
  AGENT: {
    temperature: 0,
    maxTokens: undefined,
  } as BaseChatModelConfig,

  // For data extraction and parsing - low creativity, controlled output
  EXTRACTION: {
    temperature: 0.1,
    maxTokens: 150,
  } as BaseChatModelConfig,

  // For analysis and categorization - slightly creative but focused
  ANALYSIS: {
    temperature: 0.1,
    maxTokens: 200,
  } as BaseChatModelConfig,

  // For creative tasks - higher temperature if needed
  CREATIVE: {
    temperature: 0.3,
    maxTokens: 500,
  } as BaseChatModelConfig,
} as const;

/**
 * Get common Azure configuration from environment
 */
function getAzureConfig(): Omit<AzureChatModelConfig, keyof BaseChatModelConfig> {
  const env = (import.meta as any).env;

  return {
    model: env.DHIS2_OPENAI_MODEL,
    azureOpenAIApiKey: env.DHIS2_AZURE_KEY,
    azureOpenAIEndpoint: env.DHIS2_AZURE_ENDPOINT,
    azureOpenAIApiDeploymentName: env.DHIS2_AZURE_API_DEPLOYMENT_NAME,
    azureOpenAIApiVersion: env.DHIS2_AZURE_API_VERSION,
  };
}

/**
 * Automatically determine the best available model type based on configuration
 * Priority: Azure OpenAI > OpenAI > Future providers
 */
function detectModelType(): ChatModelType {
  const env = (import.meta as any).env;

  // Check for Azure OpenAI configuration (highest priority)
  if (env.DHIS2_AZURE_KEY && env.DHIS2_AZURE_ENDPOINT && env.DHIS2_AZURE_API_DEPLOYMENT_NAME) {
    return ChatModelType.AZURE_OPENAI;
  }

  // Check for OpenAI configuration (fallback)
  if (env.OPENAI_API_KEY) {
    return ChatModelType.OPENAI;
  }

  // Default to Azure OpenAI (current implementation)
  return ChatModelType.AZURE_OPENAI;
}

/**
 * Create AzureChatOpenAI model with preset + overrides
 */
function createAzureChatModel(
  preset: keyof typeof MODEL_PRESETS = 'AGENT',
  overrides: Partial<AzureChatModelConfig> = {}
): AzureChatOpenAI {
  const baseConfig = getAzureConfig();
  const presetConfig = MODEL_PRESETS[preset];

  // Merge configurations: base Azure config + preset + overrides
  const finalConfig: AzureChatModelConfig = {
    ...baseConfig,
    ...presetConfig,
    ...overrides,
  };

  return new AzureChatOpenAI(finalConfig);
}

/**
 * Main factory function for creating chat models
 * Automatically selects the best available model provider
 */
export function createChatModel(
  preset: keyof typeof MODEL_PRESETS = 'AGENT',
  overrides: Partial<ChatModelOverrides> = {}
): AzureChatOpenAI {
  const modelType = detectModelType();

  switch (modelType) {
    case ChatModelType.AZURE_OPENAI:
      return createAzureChatModel(preset, overrides);

    case ChatModelType.OPENAI:
      // Future: return createOpenAIChatModel(preset, overrides);
      throw new Error('OpenAI model type not yet implemented.');

    default:
      throw new Error(`Unsupported model type: ${modelType}`);
  }
}

/**
 * Retry configuration for LLM calls
 */
export interface RetryConfig {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
}

/**
 * Default retry configuration for rate limiting
 */
const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
};

/**
 * Execute a function with exponential backoff retry logic for rate limiting
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const {
    maxRetries,
    baseDelay,
    maxDelay,
    backoffMultiplier
  } = { ...DEFAULT_RETRY_CONFIG, ...config };

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if this is a rate limit error (429)
      const isRateLimit = error?.status === 429 ||
                         error?.code === 429 ||
                         error?.message?.includes('429') ||
                         error?.message?.includes('rate limit');

      // Check if this is the last attempt or not a rate limit error
      if (attempt === maxRetries || !isRateLimit) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(baseDelay * Math.pow(backoffMultiplier, attempt), maxDelay);

      console.log(`🔄 Rate limited (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * Create a chat model with built-in retry logic for rate limiting
 * Returns a properly typed AzureChatOpenAI model with retry functionality
 */
export function createChatModelWithRetry(
  preset: keyof typeof MODEL_PRESETS = 'AGENT',
  overrides: Partial<ChatModelOverrides> = {},
  retryConfig: RetryConfig = {}
): AzureChatOpenAI {
  const model = createChatModel(preset, overrides);
  const config = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };

  // Monkey patch the invoke method to add retry logic while maintaining type compatibility
  const originalInvoke = model.invoke.bind(model);
  model.invoke = async (messages: any[], options?: any) => {
    return executeWithRetry(() => originalInvoke(messages, options), config);
  };

  // Also patch stream method if it exists
  if (model.stream) {
    const originalStream = model.stream.bind(model);
    model.stream = async (messages: any[], options?: any) => {
      return executeWithRetry(() => originalStream(messages, options), config);
    };
  }

  return model; // Returns properly typed AzureChatOpenAI
}

/**
 * Convenience functions for common use cases
 */
export const ChatModels = {
  // Agent models - deterministic responses for workflows
  createAgentModel: (overrides?: Partial<ChatModelOverrides>) =>
    createChatModel('AGENT', overrides),

  // Extraction models - for parsing and data extraction
  createExtractionModel: (overrides?: Partial<ChatModelOverrides>) =>
    createChatModel('EXTRACTION', overrides),

  // Analysis models - for categorization and analysis tasks
  createAnalysisModel: (overrides?: Partial<ChatModelOverrides>) =>
    createChatModel('ANALYSIS', overrides),

  // Creative models - for more flexible generation
  createCreativeModel: (overrides?: Partial<ChatModelOverrides>) =>
    createChatModel('CREATIVE', overrides),

  // Retry-enabled models for rate limit resilience
  createAgentModelWithRetry: (overrides?: Partial<ChatModelOverrides>, retryConfig?: RetryConfig) =>
    createChatModelWithRetry('AGENT', overrides, retryConfig),

  createExtractionModelWithRetry: (overrides?: Partial<ChatModelOverrides>, retryConfig?: RetryConfig) =>
    createChatModelWithRetry('EXTRACTION', overrides, retryConfig),

  createAnalysisModelWithRetry: (overrides?: Partial<ChatModelOverrides>, retryConfig?: RetryConfig) =>
    createChatModelWithRetry('ANALYSIS', overrides, retryConfig),
};
