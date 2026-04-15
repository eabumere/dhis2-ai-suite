import { searchDhis2Metadata } from './helpers';
import { getOrchestratorInstance, getSingularResourceName, getPluralResourceName } from './base-tool';

/**
 * Single reusable name to ID resolution function
 * ✅ Used EVERYWHERE for consistent behaviour
 * ✅ All logic in one place - fix once, works everywhere
 * ✅ Exact same selection flow for all use cases
 * ✅ Proper exact match verification
 * ✅ Graceful fallbacks
 */
export async function resolveNameToId(
    resourceType: string,
    name: string,
    options: {
        allowCreateNew?: boolean;
        createNewLabel?: string;
        confirmButtonText?: string;
        title?: string;
        description?: string;
        selectionMode?: 'single' | 'multiple';
    } = {}
): Promise<{ id: string; name: string; selected: boolean; created: boolean }> {

    const matches = await searchDhis2Metadata(resourceType, name, 10);

    if (matches.length === 0) {
        // No matches found at all - AUTOMATICALLY CREATE NEW WITHOUT ASKING USER
        console.log(`✅ No matches for ${resourceType} "${name}", creating new automatically`);
        const newId = await (await import('./helpers')).generateDhis2Id();
        return {
            id: newId,
            name,
            selected: false,
            created: true
        };
    }

    if (matches.length === 1) {
        // Exactly one match - verify it's an exact name match first
        const exactMatch = matches.find((m: any) => m.name.toLowerCase().trim() === name.toLowerCase().trim());

        if (exactMatch) {
            console.log(`✅ Auto-resolved ${resourceType} "${name}" to ID: ${exactMatch.id}`);
            return {
                id: exactMatch.id,
                name: exactMatch.name,
                selected: false,
                created: false
            };
        }

        // No exact match even though there is 1 result - show selection anyway
        console.log(`⚠ Found 1 ${resourceType} but name doesn't exactly match "${name}" - showing selection dialog`);
    }

    // Multiple matches OR no exact match - show selection dialog ALWAYS
    const orchestrator = getOrchestratorInstance();
    if (orchestrator && orchestrator.requestSelection) {
        const selections = await orchestrator.requestSelection({
            title: options.title || `Select ${getSingularResourceName(resourceType)}`,
            description: options.description || `${matches.length} ${getPluralResourceName(resourceType)} found matching "${name}". Select which one you want to use:`,
            items: matches.map(r => ({
                id: r.id,
                name: r.name,
                code: r.code || '',
                displayName: r.displayName
            })),
            allowCreateNew: options.allowCreateNew !== false,
            createNewLabel: options.createNewLabel || "Create New",
            confirmButtonText: options.confirmButtonText || "Select",
            selectionMode: options.selectionMode || 'single'
        });

        const selection = selections.length && selections[0];
        if (selection && selection.id !== '__create_new__') {
            console.log(`✅ User selected ${resourceType}: ${selection.name} (${selection.id})`);
            return {
                id: selection.id,
                name: selection.name,
                selected: true,
                created: false
            };
        } else if (selection && selection.id === '__create_new__') {
            // User chose to create new
            console.log(`✅ Creating new ${resourceType} "${name}"`);
            const newId = await (await import('./helpers')).generateDhis2Id();
            return {
                id: newId,
                name,
                selected: true,
                created: true
            };
        } else {
            // User cancelled - use first match as fallback
            console.log(`⚠ No selection made, using first match: ${matches[0].name} (${matches[0].id})`);
            return {
                id: matches[0].id,
                name: matches[0].name,
                selected: false,
                created: false
            };
        }
    } else {
        // No UI available - use first match
        console.log(`⚠ No selection UI available, using first match: ${matches[0].name} (${matches[0].id})`);
        return {
            id: matches[0].id,
            name: matches[0].name,
            selected: false,
            created: false
        };
    }
}

/**
 * Resource type mapping for auto-detection from field paths
 */
export const NAME_RESOLUTION_TYPE_MAPPING: Record<string, string> = {
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

/**
 * Auto-detect resource type from field path
 */
export function detectResourceTypeFromPath(path: string): string | null {
    const lowerPath = path.toLowerCase();
    for (const [pattern, type] of Object.entries(NAME_RESOLUTION_TYPE_MAPPING)) {
        if (lowerPath.includes(pattern)) {
            return type;
        }
    }
    return null;
}