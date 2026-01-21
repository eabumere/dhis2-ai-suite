/**
 * Environment Configuration Utility
 * 
 * Provides safe access to environment variables with fallbacks and validation.
 * Centralizes configuration management for better maintainability.
 */

/**
 * Get a string environment variable with optional fallback
 */
export function getEnvVar(key: string, fallback?: string): string {
    const value = process.env[key];
    if (value !== undefined) {
        return value;
    }
    if (fallback !== undefined) {
        return fallback;
    }
    throw new Error(`Environment variable ${key} is required but not set`);
}

/**
 * Get a number environment variable with optional fallback
 */
export function getEnvVarNumber(key: string, fallback?: number): number {
    const value = process.env[key];
    if (value !== undefined) {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed)) {
            throw new Error(`Environment variable ${key} must be a valid number, got: ${value}`);
        }
        return parsed;
    }
    if (fallback !== undefined) {
        return fallback;
    }
    throw new Error(`Environment variable ${key} is required but not set`);
}

/**
 * Get a boolean environment variable with optional fallback
 */
export function getEnvVarBoolean(key: string, fallback?: boolean): boolean {
    const value = process.env[key];
    if (value !== undefined) {
        const lowerValue = value.toLowerCase();
        if (lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes') {
            return true;
        } else if (lowerValue === 'false' || lowerValue === '0' || lowerValue === 'no') {
            return false;
        } else {
            throw new Error(`Environment variable ${key} must be a valid boolean (true/false/1/0/yes/no), got: ${value}`);
        }
    }
    if (fallback !== undefined) {
        return fallback;
    }
    throw new Error(`Environment variable ${key} is required but not set`);
}

/**
 * DHIS2 Configuration
 */
export const dhis2Config = {
    /**
     * Default program ID for tracker workflows
     */
    getDefaultProgramId(): string {
        return getEnvVar('DHIS2_DEFAULT_PROGRAM_ID', 'o3jXXatOefs');
    },

    /**
     * Default org unit for tracker workflows
     */
    getDefaultOrgUnit(): string {
        return getEnvVar('DHIS2_DEFAULT_ORG_UNIT', 'cYSowRjnmHE');
    },

    /**
     * Azure Document Intelligence endpoint
     */
    getDocIntelligenceEndpoint(): string {
        return getEnvVar('DHIS2_DOC_INTELLIGENCE_ENDPOINT');
    },

    /**
     * Azure Document Intelligence key
     */
    getDocIntelligenceKey(): string {
        return getEnvVar('DHIS2_DOC_INTELLIGENCE_KEY');
    },

    /**
     * Azure Document Intelligence model ID
     */
    getModelId(): string {
        return getEnvVar('DHIS2_MODEL_ID');
    },

    /**
     * Azure Storage connection string
     */
    getStorageConnectionString(): string {
        return getEnvVar('DHIS2_AZURE_STORAGE_CONNECTION_STRING');
    },

    /**
     * Azure Storage container name
     */
    getStorageContainer(): string {
        return getEnvVar('DHIS2_AZURE_STORAGE_CONTAINER');
    },

    /**
     * Azure OpenAI endpoint
     */
    getAzureEndpoint(): string {
        return getEnvVar('DHIS2_AZURE_ENDPOINT');
    },

    /**
     * Azure OpenAI key
     */
    getAzureKey(): string {
        return getEnvVar('DHIS2_AZURE_KEY');
    },

    /**
     * Azure OpenAI model name
     */
    getModelName(): string {
        return getEnvVar('DHIS2_OPENAI_MODEL');
    },

    /**
     * Azure OpenAI deployment name
     */
    getDeploymentName(): string {
        return getEnvVar('DHIS2_AZURE_API_DEPLOYMENT_NAME');
    },

    /**
     * Azure OpenAI API version
     */
    getApiVersion(): string {
        return getEnvVar('DHIS2_AZURE_API_VERSION');
    },

    /**
     * External search URL
     */
    getExternalSearchUrl(): string {
        return getEnvVar('DHIS2_EXTERNAL_SEARCH_URL');
    },

    /**
     * Temperature setting for AI models
     */
    getTemperature(): number {
        return getEnvVarNumber('TEMPERATURE', 0);
    },

    /**
     * Whether delete tool is enabled
     */
    isDeleteToolEnabled(): boolean {
        return getEnvVarBoolean('DHIS2_ENABLE_DELETE_TOOL', false);
    }
};

/**
 * Validate that all required environment variables are present
 */
export function validateEnvironment(): void {
    const requiredVars = [
        'DHIS2_DOC_INTELLIGENCE_ENDPOINT',
        'DHIS2_DOC_INTELLIGENCE_KEY',
        'DHIS2_MODEL_ID',
        'DHIS2_AZURE_STORAGE_CONNECTION_STRING',
        'DHIS2_AZURE_STORAGE_CONTAINER',
        'DHIS2_AZURE_ENDPOINT',
        'DHIS2_AZURE_KEY',
        'DHIS2_OPENAI_MODEL',
        'DHIS2_AZURE_API_DEPLOYMENT_NAME',
        'DHIS2_AZURE_API_VERSION',
        'DHIS2_EXTERNAL_SEARCH_URL'
    ];

    const missing: string[] = [];
    
    for (const varName of requiredVars) {
        if (!process.env[varName]) {
            missing.push(varName);
        }
    }

    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}

/**
 * Initialize environment validation on module load
 */
try {
    validateEnvironment();
} catch (error) {
    console.error('Environment validation failed:', error.message);
    // Don't throw here to avoid breaking the application during development
    // The individual config methods will throw if specific variables are missing
}
