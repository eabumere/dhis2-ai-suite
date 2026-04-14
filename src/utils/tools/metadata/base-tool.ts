import { DynamicStructuredTool, tool } from '@langchain/core/tools';
import { z } from 'zod';
import {
	addResourceToContext,
	createDhis2Metadata,
	deleteDhis2Metadata,
	generateDhis2Id,
	generateShortName,
	resolveDependencies,
	searchDhis2Metadata,
	updateDhis2Metadata,
	validateResourceData,
} from './helpers';
import { dhis2Api } from '../../app-runtime/dhis2-api';

// Global Workflow Orchestrator Singleton
// Set once by orchestrator during initialization, available to all tools
let globalOrchestratorInstance: any = null;

// Cache for humanized resource names
const resourceNameCache = new Map<string, string>();

/**
 * Complete DHIS2 resource type mappings
 * Contains both singular and plural forms for all known metadata types
 */
const resourceMappings: Record<string, { singular: string; plural: string }> = {
	'dataElement': {singular: 'Data Element', plural: 'Data Elements'},
	'dataElements': {singular: 'Data Element', plural: 'Data Elements'},
	'indicator': {singular: 'Indicator', plural: 'Indicators'},
	'indicators': {singular: 'Indicator', plural: 'Indicators'},
	'organisationUnit': {singular: 'Organisation Unit', plural: 'Organisation Units'},
	'organisationUnits': {singular: 'Organisation Unit', plural: 'Organisation Units'},
	'dataSet': {singular: 'Data Set', plural: 'Data Sets'},
	'dataSets': {singular: 'Data Set', plural: 'Data Sets'},
	'program': {singular: 'Program', plural: 'Programs'},
	'programs': {singular: 'Program', plural: 'Programs'},
	'category': {singular: 'Category', plural: 'Categories'},
	'categories': {singular: 'Category', plural: 'Categories'},
	'categoryCombo': {singular: 'Category Combo', plural: 'Category Combos'},
	'categoryCombos': {singular: 'Category Combo', plural: 'Category Combos'},
	'optionSet': {singular: 'Option Set', plural: 'Option Sets'},
	'optionSets': {singular: 'Option Set', plural: 'Option Sets'},
	'validationRule': {singular: 'Validation Rule', plural: 'Validation Rules'},
	'validationRules': {singular: 'Validation Rule', plural: 'Validation Rules'},
	'visualization': {singular: 'Visualization', plural: 'Visualizations'},
	'visualizations': {singular: 'Visualization', plural: 'Visualizations'},
	'dashboard': {singular: 'Dashboard', plural: 'Dashboards'},
	'dashboards': {singular: 'Dashboard', plural: 'Dashboards'},
	'user': {singular: 'User', plural: 'Users'},
	'users': {singular: 'User', plural: 'Users'},
	'categoryOption': {singular: 'Category Option', plural: 'Category Options'},
	'categoryOptions': {singular: 'Category Option', plural: 'Category Options'},
	'organisationUnitGroup': {singular: 'Organisation Unit Group', plural: 'Organisation Unit Groups'},
	'organisationUnitGroups': {singular: 'Organisation Unit Group', plural: 'Organisation Unit Groups'},
	'trackedEntityType': {singular: 'Tracked Entity Type', plural: 'Tracked Entity Types'},
	'trackedEntityTypes': {singular: 'Tracked Entity Type', plural: 'Tracked Entity Types'},
	'option': {singular: 'Option', plural: 'Options'},
	'options': {singular: 'Option', plural: 'Options'},
	'userRole': {singular: 'User Role', plural: 'User Roles'},
	'userRoles': {singular: 'User Role', plural: 'User Roles'},
	'userGroup': {singular: 'User Group', plural: 'User Groups'},
	'userGroups': {singular: 'User Group', plural: 'User Groups'}
};

/**
 * Get properly humanized singular form for any resource type
 * ✅ Automatically works for both singular and plural inputs
 * ✅ Never uses slice(0, -1) hacks
 * ✅ Categories → Category
 * ✅ CategoryCombos → Category Combo
 */
function getSingularResourceName(resource: string): string {
	if (resourceMappings[resource]) {
		return resourceMappings[resource].singular;
	}

	const cacheKey = `singular:${resource}`;
	if (resourceNameCache.has(cacheKey)) {
		return resourceNameCache.get(cacheKey)!;
	}

	// Fallback formatting
	const name = resource.charAt(0).toUpperCase() + resource.slice(1).replace(/([A-Z])/g, ' $1');
	resourceNameCache.set(cacheKey, name);
	return name;
}

/**
 * Get properly humanized plural form for any resource type
 * ✅ Automatically works for both singular and plural inputs
 */
function getPluralResourceName(resource: string): string {
	if (resourceMappings[resource]) {
		return resourceMappings[resource].plural;
	}

	const cacheKey = `plural:${resource}`;
	if (resourceNameCache.has(cacheKey)) {
		return resourceNameCache.get(cacheKey)!;
	}

	// Fallback formatting
	const name = resource.charAt(0).toUpperCase() + resource.slice(1).replace(/([A-Z])/g, ' $1');
	resourceNameCache.set(cacheKey, name);
	return name;
}

/**
 * @deprecated Use getSingularResourceName() or getPluralResourceName() instead
 * Kept for backwards compatibility
 */
function humanizeResourceName(resource: string): string {
	return getSingularResourceName(resource);
}

/**
 * Set the global orchestrator instance - called once during application initialization
 */
export function setOrchestratorInstance(orchestrator: any) {
	globalOrchestratorInstance = orchestrator;
}

/**
 * Get the global orchestrator instance - can be called from any tool
 */
export function getOrchestratorInstance(): any | null {
	return globalOrchestratorInstance;
}

/**
 * Extract required field names from a Zod schema for LLM prompting
 */
function getRequiredFieldsFromSchema(schema: z.ZodSchema): string[] {
	// For known schemas that were failing, return hardcoded required fields
	// This ensures the LLM gets explicit instructions about required fields
	try {
		// Try to detect which schema this is by checking for known field patterns
		const schemaDef = (schema as any)._def;

		if (schemaDef.typeName === 'ZodObject' && schemaDef.shape) {
			// Check for DataElement schema (has valueType, domainType, aggregationType)
			if (schemaDef.shape.valueType && schemaDef.shape.domainType && schemaDef.shape.aggregationType) {
				return ['name', 'valueType', 'domainType', 'aggregationType', 'shortName'];
			}

			// Check for Category schema (has dataDimension, categoryOptions array)
			if (schemaDef.shape.dataDimension && schemaDef.shape.categoryOptions && Array.isArray(schemaDef.shape.categoryOptions._def.type._def.shape)) {
				return ['name', 'shortName', 'dataDimensionType', 'categoryOptions'];
			}

			// Check for CategoryCombo schema (has categories array, dataDimensionType)
			if (schemaDef.shape.categories && schemaDef.shape.dataDimensionType && Array.isArray(schemaDef.shape.categories._def.type._def.shape)) {
				return ['name', 'shortName', 'dataDimensionType', 'categories'];
			}

			// Check for DataSet schema (has periodType, dataSetElements)
			if (schemaDef.shape.periodType && schemaDef.shape.dataSetElements) {
				return ['name', 'shortName', 'periodType', 'dataSetElements'];
			}

			// Fallback: try to extract dynamically
			const requiredFields: string[] = [];

			for (const [fieldName, fieldSchema] of Object.entries(schemaDef.shape)) {
				const fieldDef = (fieldSchema as any)._def;

				// Check if field is required (not optional or nullable by default)
				const isOptional = fieldDef.typeName === 'ZodOptional' ||
					fieldDef.typeName === 'ZodNullable' ||
					fieldDef.typeName === 'ZodDefault';

				if (!isOptional) {
					requiredFields.push(fieldName);
				}
			}

			return requiredFields;
		}

		return [];
	} catch (error) {
		console.warn('Failed to extract required fields from schema:', error);
		// Return common required fields as fallback
		return ['name', 'shortName'];
	}
}

/**
 * New LLM-First Tool Configuration
 * Pure tool calling: LLM selects tool + extracts parameters from schema
 * No custom NL processing in tools - let LLM handle everything
 */
export interface LLMToolConfig<T extends z.ZodSchema> {
	name: string;
	description: string;           // Clear, specific description for LLM tool selection
	schema: T;                   // Pure Zod schema for LLM parameter extraction
	metadataType: string;        // DHIS2 API endpoint
	dependencies?: Array<{       // Optional default dependencies
		type: string;
		name: string;
		createIfNotFound?: boolean;
		createParams?: Record<string, any>;
	}>;
	preparePayload?: (input: any) => any; // Tool-specific payload transformation
	checkExistence?: boolean;    // Enable automatic existence verification before creation
	searchLimit?: number;        // Max results to show in selection dialog
}

/**
 * LLM-First Tool Factory
 * Pure tool calling architecture: LLM handles everything, we handle validation & DHIS2 format
 */
export function createLLMFirstTool<T extends z.ZodSchema>(
	config: LLMToolConfig<T> & { dhis2SchemaName?: keyof typeof import('./schemas').Dhis2Schemas }
): DynamicStructuredTool {
	return tool(
		async ({resource}: { resource: z.infer<T> }) => {
			try {
				// LLM provides structured parameters directly
				const llmInput = resource as any;

				// ✅ FIRST: Run tool-specific payload transformation if provided
				// This may resolve references, fetch dependencies, apply defaults
				const transformedInput = config.preparePayload ?
					await config.preparePayload(llmInput) : {...llmInput};


				// ✅ PRE-VALIDATION: Check for sufficient information AFTER payload transformation
				// First get all required fields from schema
				const requiredFields = getRequiredFieldsFromSchema(config.schema);

				// Fields that can be safely auto-generated with defaults
				const autoGeneratableFields = ['id', 'shortName', 'code', 'displayName'];

				// Find required fields that are NOT present AFTER preparePayload AND cannot be auto-generated
				const missingUserFields = requiredFields.filter(field =>
					// Field is required
					// Field IS STILL MISSING after preparePayload ran
					transformedInput[field] === undefined &&
					// Field CANNOT be auto-generated
					!autoGeneratableFields.includes(field)
				);

				// ✅ Also validate dependencies if configured
				const missingDependencyInfo: Record<string, string[]> = {};

				if (config.dependencies && config.dependencies.length > 0) {
					for (const dep of config.dependencies) {
						// Check if dependency has sufficient information to be created
						if (dep.createIfNotFound && dep.createParams) {
							const depSchemaName = Object.keys((await import('./schemas')).Dhis2Schemas)
								.find(s => s.toLowerCase() === dep.type.slice(0, -1).toLowerCase());

							if (depSchemaName) {
								const depSchema = (await import('./schemas')).Dhis2Schemas[depSchemaName as keyof typeof import('./schemas').Dhis2Schemas];
								const depRequiredFields = getRequiredFieldsFromSchema(depSchema);

								const depMissingFields = depRequiredFields.filter(field =>
									dep.createParams![field] === undefined &&
									!autoGeneratableFields.includes(field)
								);

								if (depMissingFields.length > 0) {
									missingDependencyInfo[dep.type] = depMissingFields;
								}
							}
						}
					}
				}

				// If ANY required information is missing - STOP HERE and inform user
				if (missingUserFields.length > 0 || Object.keys(missingDependencyInfo).length > 0) {
					const errorResponse: any = {
						success: false,
						error: "Insufficient information provided to create metadata",
						message: "Please provide the following missing information before proceeding:",
						missingFields: {}
					};

					if (missingUserFields.length > 0) {
						errorResponse.missingFields.mainResource = missingUserFields;
					}

					if (Object.keys(missingDependencyInfo).length > 0) {
						errorResponse.missingFields.dependencies = missingDependencyInfo;
					}

					console.log('⚠️ Cannot create metadata: Missing required information', errorResponse.missingFields);

					return JSON.stringify(errorResponse);
				}

				// ✅ All required information is present - proceed with creation

				// ✅ GLOBAL EXISTENCE VERIFICATION (APPLIES TO ALL TOOLS)
				// Enable by default for all tools unless explicitly disabled
				const shouldCheckExistence = config.checkExistence !== false;

				// Recursively check existence for ALL nested resources in payload
				// This prevents 409 conflicts when dependent resources already exist
				async function checkNestedExistence(obj: any, resourcePath: string = ''): Promise<any> {
					if (!obj || typeof obj !== 'object') return obj;

					// Handle arrays
					if (Array.isArray(obj)) {
						// ✅ Process array items SEQUENTIALLY one after another
						// This ensures selection dialogs open one at a time, not all in parallel
						const results = [];
						for (let index = 0; index < obj.length; index++) {
							const resolvedItem = await checkNestedExistence(obj[index], `${resourcePath}[${index}]`);
							results.push(resolvedItem);
						}
						return results;
					}

					// Detect resources with name and id fields (potential metadata objects)
					if (obj.name) {
						// Try to detect resource type from context
						let resourceType: string | null = null;

						// Guess type from property name patterns
						if (resourcePath.includes('categoryOption')) resourceType = 'categoryOptions';
						else if (resourcePath.includes('category')) resourceType = 'categories';
						else if (resourcePath.includes('option')) resourceType = 'options';
						else if (resourcePath.includes('indicator')) resourceType = 'indicators';
						else if (resourcePath.includes('dataElement')) resourceType = 'dataElements';
						else if (resourcePath.includes('dataSet')) resourceType = 'dataSets';
						else if (resourcePath.includes('orgUnit')) resourceType = 'organisationUnits';
						else if (resourcePath.includes('program')) resourceType = 'programs';
						else if (resourcePath.includes('user')) resourceType = 'users';
						else if (resourcePath.includes('optionSet')) resourceType = 'optionSets';

						if (resourceType) {
							try {
								const matches = await searchDhis2Metadata(resourceType, obj.name, 10);
								const exact = matches.find((m: any) => m.name === obj.name);

								if (exact) {
									console.log(`✅ Found existing nested resource ${resourcePath}: "${obj.name}" (${exact.id}) - using existing ID`);
									// Keep all original fields, only replace ID with existing one
									return {
										...obj,
										id: exact.id
									};
								}
							} catch (e) {
								console.warn(`⚠️ Failed to check existence for ${resourcePath}:`, e);
							}
						}
					}

					// Recursively check all properties
					const result: any = {};
					for (const [key, value] of Object.entries(obj)) {
						result[key] = await checkNestedExistence(value, `${resourcePath}.${key}`);
					}
					return result;
				}

				// Run nested existence check before proceeding
				if (shouldCheckExistence) {
					console.log(`🔍 Checking existence for all nested resources in payload...`);
					const resolvedPayload = await checkNestedExistence(transformedInput, config.metadataType);

					// Replace transformed input with resolved payload where existing IDs were found
					Object.assign(transformedInput, resolvedPayload);
					console.log(`✅ Nested existence check complete`);
				}

				// Check existence for main resource after resolving nested ones
				if (shouldCheckExistence && transformedInput.name) {
					const searchLimit = config.searchLimit || 20;
					const searchResults = await searchDhis2Metadata(config.metadataType, transformedInput.name, searchLimit);

					if (searchResults.length > 0) {
						console.log(`⚠️ Found ${searchResults.length} existing ${config.metadataType} matching "${transformedInput.name}"`);

						const orchestrator = getOrchestratorInstance();

						if (orchestrator && orchestrator.requestSelection) {

							const humanizedSingular = getSingularResourceName(config.metadataType);
							const humanizedPlural = getPluralResourceName(config.metadataType);

							const selections = await orchestrator.requestSelection({
								title: `Existing ${humanizedSingular} found`,
								description: `${searchResults.length} existing ${humanizedPlural} match "${transformedInput.name}". Select one to use it, or create new:`,
								items: searchResults.map(r => ({
									id: r.id,
									name: r.name,
									code: r.code || '',
									displayName: r.displayName
								})),
								allowCreateNew: true,
								createNewLabel: "Create New Anyway",
								confirmButtonText: "Use Existing",
								parentResource: humanizedSingular,
								parentName: transformedInput.name
							});

							const selection = selections.length && selections[0]

							if (selection && selection.id !== '__create_new__') {
								// User selected existing resource
								console.log(`✅ User selected existing ${config.metadataType.slice(0, -1)}: ${selection.name} (${selection.id})`);
								return JSON.stringify({
									success: true,
									message: `✅ ${config.metadataType.slice(0, -1)} "${selection.name}" already exists`,
									id: selection.id,
									name: selection.name,
									exists: true,
									action: 'use_existing',
									llm_input: llmInput
								});
							}

							// User selected create new or dismissed - proceed with creation
							console.log(`✅ User chose to create new ${config.metadataType.slice(0, -1)}`);
						} else {
							// No UI available - log warning and proceed
							console.log(`⚠️ ${searchResults.length} existing matches found, but no selection UI available. Proceeding with creation.`);
						}
					}
				}

				// 1.5. Check if resource already exists (set by preparePayload)
				if ((transformedInput as any)._exists) {
					console.log(`Resource "${llmInput.name}" already exists (ID: ${(transformedInput as any)._existingId}) - skipping creation`);
					return JSON.stringify({
						success: false,
						warning: true,
						message: `⚠️ ${config.metadataType.slice(0, -1)} "${llmInput.name}" already exists. Creation skipped.`,
						id: (transformedInput as any)._existingId,
						name: llmInput.name,
						exists: true,
						action: 'skipped_creation',
						llm_input: llmInput
					});
				}

				// 2. Transform LLM input to full DHIS2 object
				let dhis2Object = {
					// LLM-provided fields
					...transformedInput,

					// Auto-generate required fields if missing
					id: transformedInput.id || await generateDhis2Id(),
					name: transformedInput.name,
					displayName: transformedInput.displayName || transformedInput.name,
					shortName: transformedInput.shortName || generateShortName(transformedInput.name || 'Unknown'),

					// Explicitly generate code if not provided
					code: transformedInput.code || (transformedInput.name ?
						transformedInput.name.toUpperCase().replace(/[^A-Z0-9]/g, '_') :
						`CODE_${Date.now()}`)
				};

				// Always populate DHIS2-required fields with defaults based on schema type
				if (config.dhis2SchemaName) {
					switch (config.dhis2SchemaName) {
						case 'DataElement':
							dhis2Object = {
								...dhis2Object,
								domainType: dhis2Object.domainType || 'AGGREGATE',
								aggregationType: dhis2Object.aggregationType || 'SUM'
							};
							break;
						case 'Category':
							dhis2Object = {
								...dhis2Object,
								dataDimensionType: dhis2Object.dataDimensionType || 'DISAGGREGATION'
							};
							break;
						case 'CategoryCombo':
							dhis2Object = {
								...dhis2Object,
								dataDimensionType: dhis2Object.dataDimensionType || 'DISAGGREGATION'
							};
							break;
					}
				}

				// 2. Use DLHIS2 schema for validation if provided
				const schemaToUse = config.dhis2SchemaName ?
					(await import('./schemas')).Dhis2Schemas[config.dhis2SchemaName] :
					config.schema;

				// Defensive check: ensure schema exists
				if (!schemaToUse) {
					return JSON.stringify({
						success: false,
						error: `Schema validation failed: No schema found for ${config.dhis2SchemaName || 'config.schema'}. This may be a configuration issue.`,
						provided: llmInput,
						tool: config.name,
						schemaName: config.dhis2SchemaName
					});
				}

				// Validate against DHIS2 schema
				const validation = validateResourceData(schemaToUse, dhis2Object);
				if (!validation.success) {
					return JSON.stringify({
						success: false,
						error: `Validation failed: ${(validation as any).errors?.join(', ') || 'Unknown validation error'}`,
						provided: llmInput,
						required: 'Depends on DHIS2 schema requirements'
					});
				}

				// 3. Resolve dependencies (default category combos for data elements, etc.)
				if (config.dependencies && config.dependencies.length > 0) {
					const resolvedDeps = await resolveDependencies(
						schemaToUse,
						config.dependencies
					);
					validation.data = {
						...validation.data,
						...resolvedDeps,
					};
				}

				// 4. Create in DHIS2
				const createResult = await createDhis2Metadata(
					config.metadataType,
					[validation.data]
				);

				// 5. Track in conversation context
				try {
					addResourceToContext((validation.data as any).id, config.metadataType, (validation.data as any).name, 'created');
				} catch (contextError) {
					console.warn('Failed to add resource to context:', contextError);
				}

				// 6. Return success response


				// 6. Return success response
				return JSON.stringify({
					success: true,
					message: `Successfully created ${config.metadataType.slice(0, -1)}: ${validation.data.name}`,
					id: validation.data.id,
					name: validation.data.name,
					code: validation.data.code,
					sortOrder: validation.data.sortOrder,
					llm_input: llmInput,
					dhis2_object: validation.data
				});

			} catch (error) {
				console.error(`Error in ${config.name}:`, error);
				return JSON.stringify({
					success: false,
					error: `Failed to create resource: ${error.message}`,
					tool: config.name,
					llm_params: {resource}
				});
			}
		},
		{
			name: config.name,
			description: `${config.description}\n\nIMPORTANT: You MUST provide ALL required fields from the schema. The following fields are REQUIRED and cannot be omitted: ${getRequiredFieldsFromSchema(config.schema).join(', ')}. Do not omit any required fields - this will cause API errors.`,
			schema: z.object({
				resource: config.schema
			}).describe(`Create a DHIS2 ${config.metadataType.slice(0, -1)} with ALL required properties specified. Required fields: ${getRequiredFieldsFromSchema(config.schema).join(', ')}`),
		}
	);
}

/**
 * Create a search tool for DHIS2 resources
 */
export function createDhis2SearchTool(metadataType: string, displayName: string) {
	return tool(
		async ({query, limit}: { query: string; limit: number }) => {
			try {
				const results = await searchDhis2Metadata(metadataType, query, limit);

				return JSON.stringify({
					success: true,
					query,
					limit,
					count: results.length,
					results: results
				});
			} catch (error) {
				console.error(`Error searching ${metadataType}:`, error);
				return JSON.stringify({
					success: false,
					error: `Failed to search ${metadataType}: ${error.message}`,
					query,
					limit
				});
			}
		},
		{
			name: `search_dhis2_${metadataType.toLowerCase()}`,
			description: `Search DHIS2 ${displayName} by name`,
			schema: z.object({
				query: z.string().describe("The search query to match against resource names"),
				limit: z.number().int().min(1).max(100).default(10).describe(
					"Maximum number of results to return"
				),
			}),
		}
	);
}

/**
 * Create an update tool for DHIS2 resources
 * Allows modifying existing resources using schema-compliant objects
 */
export function createDhis2UpdateTool<T extends z.ZodSchema>(
	config: LLMToolConfig<T>
) {
	return tool(
		async ({
			       id,
			       resource,
			       originalIdentifier,
			       customId,
			       dependencies = [],
			       removeReferences = [],
			       clearReferences = []
		       }: {
			id?: string;
			resource?: Record<string, any>;
			originalIdentifier?: string | { name?: string; code?: string };
			customId?: string;
			dependencies?: Array<{
				type: string;
				name: string;
				createIfNotFound?: boolean;
				createParams?: Record<string, any>;
			}>;
			removeReferences?: Array<{ property: string; name: string }>;
			clearReferences?: string[];
		}) => {
			try {
				console.log('Updating resource:', resource);
				let resourceId = id || resource?.id;
				let updatedResource: Record<string, any> = resource || {};

				// ✅ FIRST: AUTOMATICALLY RESOLVE ROOT RESOURCE BY ORIGINAL IDENTIFIER
				// Always use originalIdentifier first - this is the name the user referred to in their query
				// This preserves the original reference even when renaming the resource
				const searchName = typeof originalIdentifier === 'string'
					? originalIdentifier
					: originalIdentifier?.name || updatedResource.name;

				// ✅ FIRST: AUTOMATICALLY RESOLVE ROOT RESOURCE BY NAME IF NO ID PROVIDED
				// If only name is provided, search and let user select the correct resource
				if (!resourceId && searchName) {
					console.log(`🔍 No ID provided, searching for ${config.metadataType} with name: ${searchName}`);

					const searchResults = await searchDhis2Metadata(config.metadataType, searchName, 20);

					if (searchResults.length === 0) {
						return JSON.stringify({
							success: false,
							error: "Resource not found",
							message: `Could not find any ${config.metadataType} matching "${searchName}". Please verify the name or provide an ID.`
						});
					}

					const orchestrator = getOrchestratorInstance();

					if (orchestrator && orchestrator.requestSelection) {
						const selections = await orchestrator.requestSelection({
							title: `Select ${getSingularResourceName(config.metadataType)} to update`,
							description: `Found ${searchResults.length} ${getPluralResourceName(config.metadataType)} matching "${searchName}". Select which one you want to update:`,
							items: searchResults.map(r => ({
								id: r.id,
								name: r.name,
								code: r.code || '',
								displayName: r.displayName
							})),
							confirmButtonText: "Update this resource"
						});

						const selection = selections.length && selections[0];

						if (selection && selection.id) {
							resourceId = selection.id;
							console.log(`✅ User selected resource to update: ${selection.name} (${resourceId})`);
						} else {
							return JSON.stringify({
								success: false,
								error: "No resource selected",
								message: "No resource was selected for update. Operation cancelled."
							});
						}
					} else {
						// No UI available - use first match
						resourceId = searchResults[0].id;
						console.log(`⚠️ No selection UI available, using first match: ${searchResults[0].name} (${resourceId})`);
					}
				}

				if (!resourceId) {
					throw new Error('Must provide either id parameter, include id in resource object, or provide a valid resource name that can be resolved');
				}

				// ✅ NAME → ID RESOLUTION FOR UPDATE PAYLOAD
				// ✅ SCHEMA-INDEPENDENT IMPLEMENTATION!
				// ✅ Works automatically for ALL nested objects and arrays
				async function resolveNamesToIds(obj: any, path: string = ''): Promise<any> {
					if (!obj || typeof obj !== 'object') return obj;

					// Handle arrays
					if (Array.isArray(obj)) {
						// ✅ Process array items SEQUENTIALLY one after another
						// This ensures selection dialogs open one at a time, not all in parallel
						const results = [];
						for (let index = 0; index < obj.length; index++) {
							const resolvedItem = await resolveNamesToIds(obj[index], `${path}[${index}]`);
							results.push(resolvedItem);
						}
						return results;
					}

					// ✅ FIRST PROCESS ALL CHILDREN RECURSIVELY!
					// Always process nested properties first, no matter what
					const result: any = {};
					for (const [key, value] of Object.entries(obj)) {
						result[key] = await resolveNamesToIds(value, `${path}.${key}`);
					}

					// ✅ NOW resolve current object after children are processed
					if (result.name && !result.id) {
						// Complete DHIS2 resource type mapping
						// ✅ BOTH singular AND plural patterns match the correct plural resource type
						const fieldToResourceMap: Record<string, string> = {
							// Data Elements
							'dataelement': 'dataElements',
							'dataelements': 'dataElements',
							// Organisation Units
							'organisationunit': 'organisationUnits',
							'organisationunits': 'organisationUnits',
							// Categories
							'category': 'categories',
							'categories': 'categories',
							// Category Combos
							'categorycombo': 'categoryCombos',
							'categorycombos': 'categoryCombos',
							// Category Options
							'categoryoption': 'categoryOptions',
							'categoryoptions': 'categoryOptions',
							// Data Sets
							'dataset': 'dataSets',
							'datasets': 'dataSets',
							// Indicators
							'indicator': 'indicators',
							'indicators': 'indicators',
							// Option Sets
							'optionset': 'optionSets',
							'optionsets': 'optionSets',
							// Validation Rules
							'validationrule': 'validationRules',
							'validationrules': 'validationRules',
							// Visualizations
							'visualization': 'visualizations',
							'visualizations': 'visualizations',
							// Dashboards
							'dashboard': 'dashboards',
							'dashboards': 'dashboards',
							'dashboarditem': 'dashboardItems',
							'dashboarditems': 'dashboardItems',
							// Users
							'user': 'users',
							'users': 'users',
							// User Roles
							'userrole': 'userRoles',
							'userroles': 'userRoles',
							// User Groups
							'usergroup': 'userGroups',
							'usergroups': 'userGroups',
							// Programs
							'program': 'programs',
							'programs': 'programs',
							// Program Stages
							'programstage': 'programStages',
							'programstages': 'programStages',
							// Program Rules
							'programrule': 'programRules',
							'programrules': 'programRules',
							// Program Indicators
							'programindicator': 'programIndicators',
							'programindicators': 'programIndicators',
							// Tracked Entity Types
							'trackedentitytype': 'trackedEntityTypes',
							'trackedentitytypes': 'trackedEntityTypes',
							// Tracked Entity Attributes
							'trackedentityattribute': 'trackedEntityAttributes',
							'trackedentityattributes': 'trackedEntityAttributes',
							// Options
							'option': 'options',
							'options': 'options',
							// Reporting Forms
							'reportingform': 'reportingForms',
							'reportingforms': 'reportingForms',
							// Organisation Unit Groups
							'organisationunitgroup': 'organisationUnitGroups',
							'organisationunitgroups': 'organisationUnitGroups',
							// Organisation Unit Group Sets
							'organisationunitgroupset': 'organisationUnitGroupSets',
							'organisationunitgroupsets': 'organisationUnitGroupSets',
							// Indicator Types
							'indicatortype': 'indicatorTypes',
							'indicatortypes': 'indicatorTypes',
							// Relationship Types
							'relationshiptype': 'relationshipTypes',
							'relationshiptypes': 'relationshipTypes',
						};

						// Match path against resource mapping
						const lowerPath = path.toLowerCase();
						let resourceType: string | null = null;

						for (const [pattern, type] of Object.entries(fieldToResourceMap)) {
							if (lowerPath.includes(pattern)) {
								resourceType = type;
								break;
							}
						}

						if (resourceType) {
							console.log(`🔍 Resolving ${resourceType} "${result.name}" from name to ID at ${path}`);

							const matches = await searchDhis2Metadata(resourceType, result.name, 10);

							if (matches.length === 1) {
								// Exactly one match - use automatically
								console.log(`✅ Auto-resolved ${resourceType} "${result.name}" to ID: ${matches[0].id}`);
								return {id: matches[0].id};
							} else if (matches.length > 1) {
								// Multiple matches - show selection dialog
								const orchestrator = getOrchestratorInstance();
								if (orchestrator && orchestrator.requestSelection) {
									const selections = await orchestrator.requestSelection({
										title: `Select ${getSingularResourceName(resourceType as string)}`,
										description: `Multiple ${getPluralResourceName(resourceType as string)} found matching "${result.name}". Select one:`,
										items: matches.map(r => ({
											id: r.id,
											name: r.name,
											code: r.code || '',
											displayName: r.displayName
										})),
										allowCreateNew: true,
										createNewLabel: "Create New",
										confirmButtonText: "Select",
										selectionMode: 'single'
									});

									const selection = selections.length && selections[0];
									if (selection && selection.id !== '__create_new__') {
										console.log(`✅ User selected ${resourceType}: ${selection.name} (${selection.id})`);
										// ✅ USE SELECTED ID! No extra fields, do not create new resource
										return {id: selection.id};
									} else {
										// User chose to create new
										console.log(`✅ Creating new ${resourceType} "${result.name}"`);
										const newId = await generateDhis2Id();
										return {id: newId};
									}
								} else {
									// No UI, use first match
									return {id: matches[0].id};
								}
							} else {
								// No matches - create new object with generated ID
								console.log(`✅ No matches for ${resourceType} "${result.name}", creating new with ID`);
								const newId = await generateDhis2Id();
								return {id: newId};
							}
						}
					}

					return result;
				}

				console.log(`🔍 Resolving names to IDs in update payload...`);
				// ✅ ONLY resolve NESTED properties, NEVER resolve the ROOT OBJECT itself
				// Skip processing the root object, start directly with its properties
				const resolvedResult: any = {};
				for (const [key, value] of Object.entries(updatedResource)) {
					resolvedResult[key] = await resolveNamesToIds(value, `${config.metadataType}.${key}`);
				}
				updatedResource = resolvedResult;
				console.log(`✅ Name → ID resolution complete`);

				// ✅ SMART MERGING WITH EXISTING RESOURCE
				// Fetch full existing object first, then merge intelligently
				if (resource && Object.keys(resource).length > 0) {
					try {
						console.log(`🔍 Fetching existing ${config.metadataType} ${resourceId} for smart merge`);
						const existingResult = await dhis2Api.query({
							existing: {
								resource: `${config.metadataType}/${resourceId}`,
								params: {
									fields: '*' // Fetch ALL fields
								}
							}
						});

						if (existingResult.success && existingResult.data?.existing) {
							const existingData = existingResult.data.existing;
							console.log(`✅ Fetched existing resource, performing smart merge`);

							// ✅ SCHEMA INDEPENDENT SMART MERGE
							async function smartMerge(existing: any, updates: any, path: string = ''): Promise<any> {
								if (!updates || typeof updates !== 'object') {
									return updates;
								}

								if (Array.isArray(updates)) {
									return updates;
								}

								const result: any = {...existing};

								// Merge each field by inspecting values directly
								for (const [key, updateValue] of Object.entries(updates)) {
									if (Array.isArray(updateValue)) {
										// ✅ ARRAY FIELD: APPEND instead of replace
										console.log(`✅ Appending to array field ${path}.${key}`);

										const existingArray = existing[key] || [];

										// Append new items to existing array
										result[key] = [...existingArray, ...updateValue];

										// Remove duplicates if they have id
										result[key] = result[key].filter((item: any, index: number, self: any[]) =>
											index === self.findIndex((i: any) => i.id === item.id)
										);
									} else if (updateValue && typeof updateValue === 'object' && (updateValue as any).id) {
										// ✅ NESTED OBJECT REFERENCE: Replace directly
										console.log(`✅ Replacing reference object field ${path}.${key}`);
										result[key] = updateValue;
									} else {
										// ✅ PRIMITIVE FIELD: Replace value
										console.log(`✅ Replacing primitive field ${path}.${key}`);
										result[key] = updateValue;
									}
								}

								return result;
							}

							// Perform smart merge
							updatedResource = await smartMerge(existingData, updatedResource, config.metadataType);
							updatedResource.id = resourceId;

							console.log(`✅ Smart merge completed successfully`);
						} else {
							// If can't fetch existing, use provided data
							console.warn(`⚠️ Could not fetch existing resource, falling back to simple update`);
							updatedResource = {
								...resource,
								id: resourceId
							};
						}
					} catch (fetchError) {
						// Fallback to provided data only
						console.error(`❌ Error fetching existing resource:`, fetchError);
						updatedResource = {
							...resource,
							id: resourceId
						};
					}
				}

				// Generate derived fields if not provided
				const finalData = {
					...updatedResource,
					id: resourceId
				};

				// ✅ REFERENCE REMOVAL PROCESSING
				// Process removeReferences entries - remove items from arrays
				if (removeReferences && removeReferences.length > 0) {
					console.log(`🔍 Processing reference removal requests:`, removeReferences);

					for (const removal of removeReferences) {
						const {property, name} = removal;

						if (Array.isArray(finalData[property])) {
							console.log(`✅ Removing reference "${name}" from array property: ${property}`);

							try {
								// Auto-detect resource type from property name
								// Use the EXACT SAME mapping as resolveNamesToIds for consistency
								let resourceType: string | null = null;

								// Complete DHIS2 resource type mapping (both singular and plural patterns)
								const fieldToResourceMap: Record<string, string> = {
									// Data Elements
									'dataelement': 'dataElements',
									'dataelements': 'dataElements',
									'datasetelement': 'dataSetElements',
									'datasetelements': 'dataSetElements',
									// Organisation Units
									'organisationunit': 'organisationUnits',
									'organisationunits': 'organisationUnits',
									'organisationunitgroup': 'organisationUnitGroups',
									'organisationunitgroups': 'organisationUnitGroups',
									'organisationunitgroupset': 'organisationUnitGroupSets',
									'organisationunitgroupsets': 'organisationUnitGroupSets',
									// Categories
									'category': 'categories',
									'categories': 'categories',
									'categorycombo': 'categoryCombos',
									'categorycombos': 'categoryCombos',
									'categoryoption': 'categoryOptions',
									'categoryoptions': 'categoryOptions',
									// Options
									'option': 'options',
									'options': 'options',
									'optionset': 'optionSets',
									'optionsets': 'optionSets',
									// Indicators
									'indicator': 'indicators',
									'indicators': 'indicators',
									'indicatortype': 'indicatorTypes',
									'indicatortypes': 'indicatorTypes',
									// Data Sets
									'dataset': 'dataSets',
									'datasets': 'dataSets',
									// Programs
									'program': 'programs',
									'programs': 'programs',
									'programstage': 'programStages',
									'programstages': 'programStages',
									'programrule': 'programRules',
									'programrules': 'programRules',
									'programindicator': 'programIndicators',
									'programindicators': 'programIndicators',
									// Tracker
									'trackedentitytype': 'trackedEntityTypes',
									'trackedentitytypes': 'trackedEntityTypes',
									'trackedentityattribute': 'trackedEntityAttributes',
									'trackedentityattributes': 'trackedEntityAttributes',
									// Visualizations
									'visualization': 'visualizations',
									'visualizations': 'visualizations',
									'dashboard': 'dashboards',
									'dashboards': 'dashboards',
									'dashboarditem': 'dashboardItems',
									'dashboarditems': 'dashboardItems',
									// Validation
									'validationrule': 'validationRules',
									'validationrules': 'validationRules',
									// Users
									'user': 'users',
									'users': 'users',
									'usergroup': 'userGroups',
									'usergroups': 'userGroups',
									'userrole': 'userRoles',
									'userroles': 'userRoles',
									// Relationships
									'relationshiptype': 'relationshipTypes',
									'relationshiptypes': 'relationshipTypes',
								};

								const lowerProperty = property.toLowerCase();
								for (const [pattern, type] of Object.entries(fieldToResourceMap)) {
									if (lowerProperty.includes(pattern)) {
										resourceType = type;
										break;
									}
								}

								if (resourceType) {
									const matches = await searchDhis2Metadata(resourceType, name, 10);

									if (matches.length === 1) {
										// Exactly one match - remove automatically
										const exactMatch = matches[0];
										finalData[property] = finalData[property].filter(
											(item: any) => !(item && item.id === exactMatch.id)
										);
										console.log(`✅ Auto-removed reference "${name}" (${exactMatch.id}) from ${property}`);
									} else if (matches.length > 1) {
										// Multiple matches - show selection dialog
										const orchestrator = getOrchestratorInstance();
										if (orchestrator && orchestrator.requestSelection) {
											const selections = await orchestrator.requestSelection({
												title: `Select ${getSingularResourceName(resourceType)} to remove`,
												description: `Multiple ${getPluralResourceName(resourceType)} found matching "${name}". Select which one you want to remove:`,
												items: matches.map(r => ({
													id: r.id,
													name: r.name,
													code: r.code || '',
													displayName: r.displayName
												})),
												confirmButtonText: "Remove this reference",
												selectionMode: 'single'
											});

											const selection = selections.length && selections[0];
											if (selection && selection.id) {
												finalData[property] = finalData[property].filter(
													(item: any) => !(item && item.id === selection.id)
												);
												console.log(`✅ User selected to remove reference: ${selection.name} (${selection.id}) from ${property}`);
											}
										} else {
											// No UI available - remove first match
											finalData[property] = finalData[property].filter(
												(item: any) => !(item && item.id === matches[0].id)
											);
											console.log(`⚠️ No selection UI available, removing first match: ${matches[0].name} (${matches[0].id})`);
										}
									} else {
										console.warn(`⚠️ Could not find reference "${name}" in ${resourceType} to remove`);
									}
								}
							} catch (e) {
								console.error(`❌ Failed to remove reference "${name}" from ${property}:`, e);
							}
						}
					}
				}

				// Process clearReferences entries - set single references to null
				if (clearReferences && clearReferences.length > 0) {
					console.log(`🔍 Processing reference clearing requests:`, clearReferences);

					for (const property of clearReferences) {
						finalData[property] = null;
						console.log(`✅ Cleared reference property: ${property}`);
					}
				}

				// Combine default and custom dependencies
				const allDependencies = [
					...(config.dependencies || []),
					...dependencies
				];

				// Resolve dependencies
				const resolvedDeps = await resolveDependencies(
					config.schema,
					allDependencies
				);

				// Merge resolved dependencies
				const finalResourceData = {
					...finalData,
					...resolvedDeps,
				};

				const cleanedResourceData = {...finalResourceData};
				delete (cleanedResourceData as any)['createdBy'];
				delete (cleanedResourceData as any)['lastUpdatedBy'];
				delete (cleanedResourceData as any)['user'];
				delete (cleanedResourceData as any)['href'];
				delete (cleanedResourceData as any)['categoryOptionCombos'];

				const updateResult = await updateDhis2Metadata(
					config.metadataType,
					[cleanedResourceData]
				);

				return JSON.stringify({
					success: true,
					message: `${config.metadataType} updated successfully`,
					data: finalResourceData,
					resource: finalData,
					apiResponse: updateResult
				});

			} catch (error) {
				console.error(`Error updating ${config.name}:`, error);
				return JSON.stringify({
					success: false,
					error: `Failed to update resource: ${error.message}`,
					id,
					resource
				});
			}
		},
		{
			name: `update_dhis2_${config.metadataType.toLowerCase()}`,
			description: `Update an existing DHIS2 ${config.metadataType.slice(0, -1)} resource. Use this tool when specifically modifying a ${config.metadataType.slice(0, -1)}.`,
			schema: z.object({
				id: z.string().optional().describe("The ID of the resource to update"),
				originalIdentifier: z.union([z.string(), z.object({
					name: z.string().optional(),
					code: z.string().optional()
				})]).optional().describe(
					"Original name/identifier the user referred to in their query. Use this when renaming resources - this preserves the original reference for lookup"
				),
				resource: config.schema.describe(
					"Schema-compliant resource object with updated properties"
				),
				customId: z.string().optional().describe(
					"Custom ID for the resource (if not provided, will be generated)"
				),
				dependencies: z.array(z.object({
					type: z.string().describe("Type of dependency (e.g., 'categoryCombos')"),
					name: z.string().describe("Name of the dependency to search for"),
					createIfNotFound: z.boolean().optional().describe(
						"Whether to create the dependency if not found"
					),
					createParams: z.record(z.string(), z.any()).optional().describe(
						"Parameters for creating the dependency if it doesn't exist"
					),
				})).optional().describe(
					"Dependencies that need to be resolved before updating"
				),
				removeReferences: z.array(z.object({
					property: z.string().describe("Root resource property name (array field) to remove reference from"),
					name: z.string().describe("Name of the reference to remove")
				})).optional().describe(
					"References to remove from array properties. Each entry will resolve the name to ID and remove it from the specified array."
				),
				clearReferences: z.array(z.string()).optional().describe(
					"Single reference properties to nullify (e.g. 'categoryCombo', 'parent'). Use this to clear optional object references."
				)
			}).describe(`Update DHIS2 ${config.metadataType} resource with schema objects`),
		}
	);
}

/**
 * Create a delete tool for DHIS2 resources
 * Allows deleting existing resources by ID
 */
export function createDhis2DeleteTool<T extends z.ZodSchema>(
	config: LLMToolConfig<T>
) {
	return tool(
		async ({
			       id,
			       resource
		       }: {
			id?: string;
			resource?: Record<string, any>;
		}) => {
			try {
				if (!id && !resource?.id) {
					throw new Error('Must provide either id parameter or include id in resource object');
				}

				const resourceId = id || resource!.id;

				// Prepare the resource data for deletion
				const deleteData = {
					id: resourceId,
					...resource
				};

				// Delete from DHIS2 using the new delete function
				const deleteResult = await deleteDhis2Metadata(
					config.metadataType,
					[deleteData]
				);

				return JSON.stringify({
					success: true,
					message: `${config.metadataType.slice(0, -1)} deleted successfully`,
					id: resourceId,
					apiResponse: deleteResult
				});

			} catch (error) {
				console.error(`Error deleting ${config.name}:`, error);
				return JSON.stringify({
					success: false,
					error: `Failed to delete resource: ${error.message}`,
					id
				});
			}
		},
		{
			name: `delete_dhis2_${config.metadataType.toLowerCase()}`,
			description: `Delete an existing DHIS2 ${config.description.split(' ')[0]} resource`,
			schema: z.object({
				id: z.string().optional().describe("The ID of the resource to delete"),
				resource: config.schema.optional().describe(
					"Resource object containing the ID to delete"
				),
			}).describe(`Delete DHIS2 ${config.metadataType.slice(0, -1)} resource`),
		}
	);
}

/**
 * Create a get by ID tool for DHIS2 resources
 */
export function createDhis2GetByIdTool(metadataType: string, displayName: string) {
	return tool(
		async ({id}: { id: string }) => {
			try {
				const result = await dhis2Api.query({
					resource: metadataType,
					id: id,
					type: 'read'
				});

				if (!result.success) {
					throw new Error(`DHIS2 API error: ${result.error}`);
				}

				return JSON.stringify({
					success: true,
					[metadataType]: result.data
				});
			} catch (error) {
				console.error(`Error getting ${metadataType} by ID:`, error);
				return JSON.stringify({
					success: false,
					error: `Failed to get ${metadataType}: ${error.message}`,
					id
				});
			}
		},
		{
			name: `get_dhis2_${metadataType.toLowerCase()}_by_id`,
			description: `Get DHIS2 ${displayName} by ID`,
			schema: z.object({
				id: z.string().describe("The ID of the resource to retrieve"),
			}),
		}
	);
}
