/**
 * Test file demonstrating the unified batch metadata API functionality
 * This file shows how to create multiple different resource types in a single API call
 */

import { batchCreateMetadata, getUnifiedMetadataManager, Dhis2Schemas } from './index';

/**
 * Example 1: Basic batch creation of different resource types
 */
export async function testBasicBatchCreation() {
    console.log('=== Testing Basic Batch Creation ===');

    try {
        const result = await batchCreateMetadata([
            {
                type: 'dataElements',
                data: {
                    name: 'Test Patient Age',
                    displayName: 'Test Patient Age',
                    shortName: 'Test Age',
                    valueType: 'NUMBER',
                    aggregationType: 'AVERAGE',
                    domainType: 'AGGREGATE',
                    description: 'Test data element for patient age'
                },
                schema: Dhis2Schemas.DataElement
            },
            {
                type: 'organisationUnits',
                data: {
                    name: 'Test Hospital',
                    displayName: 'Test Hospital',
                    shortName: 'Test Hospital',
                    level: 2,
                    path: '/2'
                },
                schema: Dhis2Schemas.OrganisationUnit
            },
            {
                type: 'categories',
                data: {
                    name: 'Test Gender',
                    displayName: 'Test Gender',
                    shortName: 'Test Gender',
                    dataDimension: true,
                    dataDimensionType: 'DISAGGREGATION',
                    categoryOptions: []
                },
                schema: Dhis2Schemas.Category
            }
        ], {
            importStrategy: 'CREATE_UPDATE',
            atomic: true,
            dryRun: false
        });

        console.log('Batch creation result:', JSON.stringify(result, null, 2));
        return result;

    } catch (error) {
        console.error('Batch creation failed:', error);
        throw error;
    }
}

/**
 * Example 2: Using the UnifiedMetadataManager for complex operations
 */
export async function testUnifiedMetadataManager() {
    console.log('=== Testing UnifiedMetadataManager ===');

    try {
        const manager = getUnifiedMetadataManager();

        // Clear any existing operations
        manager.clear();

        // Add multiple operations
        await manager.addOperation('dataElements', 'CREATE', {
            name: 'Systolic BP',
            displayName: 'Systolic Blood Pressure',
            shortName: 'Systolic BP',
            valueType: 'NUMBER',
            aggregationType: 'AVERAGE',
            domainType: 'AGGREGATE'
        }, {
            schema: Dhis2Schemas.DataElement
        });

        await manager.addOperation('dataElements', 'CREATE', {
            name: 'Diastolic BP',
            displayName: 'Diastolic Blood Pressure',
            shortName: 'Diastolic BP',
            valueType: 'NUMBER',
            aggregationType: 'AVERAGE',
            domainType: 'AGGREGATE'
        }, {
            schema: Dhis2Schemas.DataElement
        });

        await manager.addOperation('indicators', 'CREATE', {
            name: 'BP Coverage',
            displayName: 'Blood Pressure Coverage',
            shortName: 'BP Coverage',
            numerator: '1',
            denominator: '1',
            annualized: false
        }, {
            schema: Dhis2Schemas.Indicator,
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
            ]
        });

        // Execute all operations in a single API call
        const result = await manager.executeBatch({
            importStrategy: 'CREATE_UPDATE',
            atomic: true
        });

        console.log('Manager result:', JSON.stringify(result, null, 2));
        return result;

    } catch (error) {
        console.error('Manager test failed:', error);
        throw error;
    }
}

/**
 * Example 3: Testing dependency resolution in batch operations
 */
export async function testBatchDependencies() {
    console.log('=== Testing Batch Dependencies ===');

    try {
        const result = await batchCreateMetadata([
            {
                type: 'categoryCombos',
                data: {
                    name: 'Age and Gender Combo',
                    displayName: 'Age and Gender Combo',
                    shortName: 'Age Gender Combo',
                    dataDimensionType: 'DISAGGREGATION',
                    categories: []
                },
                schema: Dhis2Schemas.CategoryCombo
            },
            {
                type: 'dataElements',
                data: {
                    name: 'Age and Gender Data',
                    displayName: 'Age and Gender Data',
                    shortName: 'Age Gender Data',
                    valueType: 'NUMBER',
                    aggregationType: 'SUM',
                    domainType: 'AGGREGATE'
                },
                dependencies: [
                    {
                        type: 'categoryCombos',
                        name: 'Age and Gender Combo',
                        createIfNotFound: false // Should find the one created above
                    }
                ],
                schema: Dhis2Schemas.DataElement
            }
        ], {
            importStrategy: 'CREATE_UPDATE',
            atomic: true
        });

        console.log('Dependency test result:', JSON.stringify(result, null, 2));
        return result;

    } catch (error) {
        console.error('Dependency test failed:', error);
        throw error;
    }
}

/**
 * Example 4: Testing dry run functionality
 */
export async function testDryRun() {
    console.log('=== Testing Dry Run ===');

    try {
        const result = await batchCreateMetadata([
            {
                type: 'dataElements',
                data: {
                    name: 'Dry Run Test',
                    displayName: 'Dry Run Test',
                    shortName: 'Dry Run',
                    valueType: 'TEXT',
                    aggregationType: 'NONE',
                    domainType: 'AGGREGATE'
                },
                schema: Dhis2Schemas.DataElement
            }
        ], {
            importStrategy: 'CREATE_UPDATE',
            atomic: true,
            dryRun: true // This will validate but not execute
        });

        console.log('Dry run result:', JSON.stringify(result, null, 2));
        return result;

    } catch (error) {
        console.error('Dry run test failed:', error);
        throw error;
    }
}

/**
 * Example 5: Testing error handling and rollback
 */
export async function testErrorHandling() {
    console.log('=== Testing Error Handling and Rollback ===');

    try {
        const manager = getUnifiedMetadataManager();
        manager.clear();

        // Add a valid operation
        await manager.addOperation('dataElements', 'CREATE', {
            name: 'Valid Data Element',
            displayName: 'Valid Data Element',
            shortName: 'Valid DE',
            valueType: 'NUMBER',
            aggregationType: 'SUM',
            domainType: 'AGGREGATE'
        }, {
            schema: Dhis2Schemas.DataElement
        });

        // Add an invalid operation (missing required fields)
        await manager.addOperation('dataElements', 'CREATE', {
            name: 'Invalid Data Element'
            // Missing required fields like valueType, domainType, etc.
        }, {
            schema: Dhis2Schemas.DataElement
        });

        // Execute with atomic=true (should fail and rollback)
        const result = await manager.executeBatch({
            importStrategy: 'CREATE_UPDATE',
            atomic: true
        });

        console.log('Error handling result:', JSON.stringify(result, null, 2));

        // If there were failures, attempt rollback
        if (!result.success && result.failed > 0) {
            console.log('Attempting rollback...');
            const rollbackResult = await manager.rollback(
                result.results.filter(r => !r.success)
            );
            console.log('Rollback result:', JSON.stringify(rollbackResult, null, 2));
        }

        return result;

    } catch (error) {
        console.error('Error handling test failed:', error);
        throw error;
    }
}

/**
 * Run all batch API tests
 */
export async function runAllBatchTests() {
    console.log('Starting unified batch metadata API tests...\n');

    try {
        await testDryRun();
        console.log('\n');

        await testBasicBatchCreation();
        console.log('\n');

        await testUnifiedMetadataManager();
        console.log('\n');

        await testBatchDependencies();
        console.log('\n');

        await testErrorHandling();
        console.log('\n');

        console.log('All batch API tests completed successfully!');

    } catch (error) {
        console.error('Batch API tests failed:', error);
        throw error;
    }
}

// Export individual tests for selective execution
export {
    testBasicBatchCreation,
    testUnifiedMetadataManager,
    testBatchDependencies,
    testDryRun,
    testErrorHandling
};
