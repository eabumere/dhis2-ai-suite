# DHIS2 Structured Metadata Tools

This module provides a comprehensive set of Langchain tools for creating, searching, and managing DHIS2 metadata using natural language descriptions and structured output validation with Zod schemas.

## Features

- **Structured Output**: All tools use Zod schemas to ensure proper JSON format and validation
- **Natural Language Processing**: Parse natural language descriptions to extract resource properties
- **Dependency Management**: Automatic resolution of resource dependencies with search and creation
- **ID Generation**: Automatic ID generation from DHIS2 API
- **Unified Batch API**: Create multiple different resource types in a single API call for maximum efficiency
- **Atomic Operations**: Transaction-like behavior with rollback capabilities
- **Error Handling**: Comprehensive error handling and validation
- **Backward Compatibility**: Legacy tools still available for existing code

## Architecture

The module consists of several key components:

- **Schemas** (`schemas.ts`): Zod validation schemas for all DHIS2 resource types
- **Helpers** (`helpers.ts`): Utility functions for API calls, ID generation, and dependency resolution
- **Base Tool** (`base-tool.ts`): Factory function for creating structured tools
- **Structured Tools** (`structured-tools.ts`): Specific tool implementations for each resource type
- **Batch Manager** (`batch-manager.ts`): Unified API for batch operations across resource types
- **Test Suite** (`test-batch.ts`): Comprehensive testing examples and utilities

## Available Tools

### Creation Tools

#### Data Elements
```typescript
import { createDhis2DataElement } from './metadata';

// Single creation
const result = await createDhis2DataElement.call({
    description: "Create a numeric data element called Patient Age that aggregates by average"
});

// Batch creation
const results = await createDhis2DataElement.call({
    descriptions: [
        "Create a text data element called Patient Name",
        "Create an integer data element called Number of Visits that counts"
    ]
});
```

#### Organisation Units
```typescript
import { createDhis2OrganisationUnit } from './metadata';

const result = await createDhis2OrganisationUnit.call({
    description: "Create a level 2 organisation unit called Central Hospital"
});
```

#### Categories and Category Combinations
```typescript
import { createDhis2Category, createDhis2CategoryCombo } from './metadata';

const categoryResult = await createDhis2Category.call({
    description: "Create a category called Gender for disaggregation"
});

const comboResult = await createDhis2CategoryCombo.call({
    description: "Create a category combination called Age and Gender"
});
```

#### Data Sets
```typescript
import { createDhis2DataSet } from './metadata';

const result = await createDhis2DataSet.call({
    description: "Create a monthly data set called Monthly Report",
    dependencies: [
        {
            type: "categoryCombos",
            name: "default",
            createIfNotFound: true
        }
    ]
});
```

#### Programs
```typescript
import { createDhis2Program } from './metadata';

const result = await createDhis2Program.call({
    description: "Create a tracker program called HIV Care and Treatment"
});
```

#### Indicators
```typescript
import { createDhis2Indicator } from './metadata';

const indicatorResult = await createDhis2Indicator.call({
    description: "Create an indicator called Coverage Rate that calculates percentage"
});
```

### Search Tools

#### Search Data Elements
```typescript
import { searchDhis2DataElements } from './metadata';

const results = await searchDhis2DataElements.call({
    query: "patient",
    limit: 10
});
```

#### Search Organisation Units
```typescript
import { searchDhis2OrganisationUnits } from './metadata';

const results = await searchDhis2OrganisationUnits.call({
    query: "hospital",
    limit: 5
});
```

### Get by ID Tools

#### Get Data Element by ID
```typescript
import { getDhis2DataElementById } from './metadata';

const dataElement = await getDhis2DataElementById.call({
    id: "abc123"
});
```

## Dependency Management

The tools automatically handle dependencies between resources:

```typescript
const result = await createDhis2DataElement.call({
    description: "Create a data element called Test Result",
    dependencies: [
        {
            type: "categoryCombos",
            name: "Test Categories",
            createIfNotFound: true,
            createParams: {
                name: "Test Categories",
                displayName: "Test Categories",
                dataDimensionType: "DISAGGREGATION",
                categories: []
            }
        }
    ]
});
```

## Natural Language Processing

The tools parse natural language descriptions to extract:

- **Resource names**: "Create a data element called Patient Age"
- **Value types**: "text", "number", "integer", "boolean", "date", etc.
- **Aggregation types**: "sum", "average", "count", "min", "max"
- **Domain types**: "aggregate" vs "tracker"
- **Other properties**: "zero is significant", etc.

## Error Handling

All tools provide comprehensive error handling:

```typescript
try {
    const result = await createDhis2DataElement.call({
        description: "Create a data element called Test"
    });

    const parsed = JSON.parse(result);
    if (parsed.success) {
        console.log("Created successfully:", parsed.results);
    } else {
        console.error("Failed:", parsed.error);
    }
} catch (error) {
    console.error("Tool error:", error.message);
}
```

## Validation

All resources are validated against Zod schemas before creation:

- **Type checking**: Ensures correct data types
- **Required fields**: Validates mandatory properties
- **Format validation**: Checks value formats (URLs, emails, etc.)
- **Business rules**: Enforces DHIS2-specific constraints

## Batch Operations

Support for creating multiple resources:

```typescript
const results = await createDhis2DataElement.call({
    descriptions: [
        "Create a text data element called Patient Name",
        "Create a number data element called Patient Age",
        "Create a boolean data element called Consent Given"
    ]
});
```

## Best Practices

1. **Use Structured Tools**: All tools are now structured with comprehensive validation and error handling
2. **Handle Dependencies**: Explicitly specify dependencies when needed - the system will auto-resolve them
3. **Validate Results**: Always check the success property in results
4. **Error Handling**: Implement proper error handling for production use
5. **Batch Operations**: Use the unified batch API for maximum efficiency when creating multiple resources
6. **Atomic Transactions**: Use atomic=true for critical operations that must succeed or fail together

## Migration from Legacy Tools

**Note:** All legacy tools have been removed in favor of the comprehensive structured tools system. The current implementation provides:

- Better validation and error handling
- Automatic dependency management
- Batch operations for maximum efficiency
- Complete coverage of all DHIS2 resource types
- Natural language processing for complex requests

If you were using legacy tools, simply update your imports to use the structured tools from this module.

## Supported Resource Types

- **DataElement**: Core data collection elements
- **OrganisationUnit**: Administrative units
- **Category**: Disaggregation categories
- **CategoryCombo**: Combinations of categories
- **DataSet**: Collections of data elements
- **Program**: Tracker programs
- **Indicator**: Calculated indicators
- **ValidationRule**: Data validation rules
- **OptionSet**: Sets of options for data elements

## Environment Variables

Make sure these environment variables are set:

- `DHIS2_API_BASE_URL`: Your DHIS2 instance URL
- `DHIS2_USERNAME`: DHIS2 username
- `DHIS2_PASSWORD`: DHIS2 password

## Unified Batch API

The unified batch API allows you to create multiple different resource types in a single API call, dramatically reducing network overhead and improving performance.

### Batch Creation Example

```typescript
import { batchCreateMetadata } from './metadata';

// Create multiple different resource types in one API call
const batchResult = await batchCreateMetadata([
    {
        type: 'dataElements',
        data: {
            name: 'Patient Age',
            displayName: 'Patient Age',
            valueType: 'NUMBER',
            aggregationType: 'AVERAGE',
            domainType: 'AGGREGATE'
        },
        schema: Dhis2Schemas.DataElement
    },
    {
        type: 'organisationUnits',
        data: {
            name: 'Central Hospital',
            displayName: 'Central Hospital',
            level: 2,
            path: '/2'
        },
        schema: Dhis2Schemas.OrganisationUnit
    },
    {
        type: 'indicators',
        data: {
            name: 'Coverage Rate',
            displayName: 'Coverage Rate',
            numerator: '1',
            denominator: '1',
            annualized: false
        },
        dependencies: [
            {
                type: 'indicatorTypes',
                name: 'default',
                createIfNotFound: true,
                createParams: {
                    name: 'Default',
                    displayName: 'Default',
                    factor: 1,
                    number: false
                }
            }
        ],
        schema: Dhis2Schemas.Indicator
    }
], {
    importStrategy: 'CREATE_UPDATE',
    atomic: true, // All operations succeed or all fail
    dryRun: false
});

console.log('Batch result:', batchResult);
// Output:
// {
//   success: true,
//   total: 3,
//   successful: 3,
//   failed: 0,
//   results: [...],
//   apiResponse: {...}
// }
```

### Batch Manager for Complex Operations

For more complex scenarios, use the UnifiedMetadataManager directly:

```typescript
import { getUnifiedMetadataManager } from './metadata';

const manager = getUnifiedMetadataManager();

// Add operations to the batch
await manager.addOperation('dataElements', 'CREATE', {
    name: 'Systolic Blood Pressure',
    valueType: 'NUMBER',
    aggregationType: 'AVERAGE'
}, {
    schema: Dhis2Schemas.DataElement
});

await manager.addOperation('dataElements', 'CREATE', {
    name: 'Diastolic Blood Pressure',
    valueType: 'NUMBER',
    aggregationType: 'AVERAGE'
}, {
    schema: Dhis2Schemas.DataElement
});

// Execute all operations in a single API call
const result = await manager.executeBatch({
    importStrategy: 'CREATE_UPDATE',
    atomic: true
});

console.log(`Created ${result.successful} resources, ${result.failed} failed`);
```

### Atomic Operations with Rollback

```typescript
const result = await manager.executeBatch({
    importStrategy: 'CREATE_UPDATE',
    atomic: true // If any operation fails, all are rolled back
});

// If operations failed, rollback any that were created
if (!result.success && result.failed > 0) {
    await manager.rollback(result.results.filter(r => !r.success));
}
```

### Performance Benefits

- **Single API Call**: Instead of 3 separate calls for data elements, org units, and indicators
- **Reduced Latency**: One network round-trip instead of multiple
- **Better Throughput**: DHIS2 processes batch operations more efficiently
- **Atomic Transactions**: All operations succeed together or fail together

## Examples

See the test files for comprehensive examples of using each tool type.
