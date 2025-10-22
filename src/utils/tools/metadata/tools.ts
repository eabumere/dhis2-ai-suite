import { tool } from "@langchain/core/tools";
import { Dhis2StructuredTools } from "./structured-tools";
import { generateDhis2Id, searchDhis2Metadata, createDhis2Metadata } from "./helpers";

// DHIS2 environment variables
const dhis2BaseUrl = import.meta.env.DHIS2_API_BASE_URL;
const username = import.meta.env.DHIS2_USERNAME;
const password = import.meta.env.DHIS2_PASSWORD;

const auth = `${username}:${password}`;

console.log('Env', dhis2BaseUrl, auth)

function authHeaders(): HeadersInit {
    return {
        'Authorization': `Basic ${btoa(auth)}`,
        'Content-Type': 'application/json',
    };
}

/**
 * Legacy tool that searches DHIS2 metadata based on a query string
 * @deprecated Use the structured search tools instead
 */
export const searchDhis2Metadata = tool(
  async ({ query, limit }: { query: string; limit: number }) => {

    try {
      const response = await fetch(`${dhis2BaseUrl}/metadata.json?filter=name:ilike:${encodeURIComponent(query)}`, {
        method: "GET",
        headers: authHeaders(),
      });

      if (!response.ok) {
        throw new Error(`DHIS2 API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const results = Object.entries(data)
        .flatMap(([type, items]) =>
          Array.isArray(items)
            ? items.map(item => ({
                content: JSON.stringify(item),
                metadata: { type, item_id: item.id }
              }))
            : []
        )
        .slice(0, limit);

      return JSON.stringify(results);
    } catch (error) {
      console.error('Error searching DHIS2 metadata:', error);
      throw new Error(`Failed to search DHIS2 metadata: ${error.message}`);
    }
  },
  {
    name: "search_dhis2_metadata",
    description: "Search DHIS2 metadata by name using a query string. Returns matching metadata items with their type and ID.",
    schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to match against metadata names (case-insensitive)",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return",
          default: 10,
        },
      },
      required: ["query", "limit"],
    },
  }
);

/**
 * Legacy tool that creates DHIS2 data elements from natural language descriptions
 * @deprecated Use Dhis2StructuredTools.createDhis2DataElement instead
 */
export const createDhis2DataElement = tool(
  async ({ description, descriptions, customIds }: {
    description?: string;
    descriptions?: string[];
    customIds?: string[];
  }) => {
    try {
      let descriptionsToProcess: string[] = [];
      let customIdsArray: (string | undefined)[] = [];

      // Handle both single and batch input
      if (description) {
        descriptionsToProcess = [description];
        customIdsArray = [customIds ? customIds[0] : undefined];
      } else if (descriptions) {
        descriptionsToProcess = descriptions;
        customIdsArray = customIds || descriptions.map(() => undefined);
      } else {
        throw new Error('Must provide either description or descriptions parameter');
      }

      // Use the new structured tool for each description
      const results = [];
      for (let i = 0; i < descriptionsToProcess.length; i++) {
        const desc = descriptionsToProcess[i];
        const customId = customIdsArray[i];

        // Call the structured tool
        const result = await Dhis2StructuredTools.createDhis2DataElement.call({
          description: desc,
          customId: customId
        });

        results.push(JSON.parse(result));
      }

      return JSON.stringify({
        success: true,
        count: results.length,
        results: results
      });

    } catch (error) {
      console.error('Error creating DHIS2 data elements:', error);
      return JSON.stringify({
        success: false,
        error: `Failed to create data elements: ${error.message}`,
        request: { description, descriptions, customIds }
      });
    }
  },
  {
    name: "create_dhis2_data_element",
    description: "Create DHIS2 data elements from natural language descriptions. Supports both single and batch creation. Returns the created data elements and API response.",
    schema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "Single natural language description of the data element to create (e.g., 'Create a numeric data element called Patient Age that aggregates by sum'). Use this OR descriptions parameter.",
        },
        descriptions: {
          type: "array",
          items: { type: "string" },
          description: "Array of natural language descriptions for batch creation. Use this OR description parameter.",
        },
        customIds: {
          type: "array",
          items: { type: "string" },
          description: "Optional array of custom IDs for the data elements (should match the length of descriptions)",
        },
      },
      required: [],
    },
  }
);

/**
 * Legacy createDhis2Metadata function
 * @deprecated Use the structured tools instead
 */
export async function createDhis2Metadata({ metadataType, params }: { metadataType: string; params: Record<string, any> }): Promise<string> {
  const body: any = {};
  if (metadataType === "metadata") {
    // Mixed-type payload
    Object.entries(params).forEach(([type, items]) => {
      body[type] = Array.isArray(items) ? items : [items];
    });
  } else {
    // Single-type payload
    body[metadataType] = Array.isArray(params) ? params : [params];
  }

  const response = await fetch(`${dhis2BaseUrl}/metadata?importStrategy=CREATE_UPDATE`, {
    method: "POST",
    credentials: 'include',
    headers: authHeaders(),
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const responseText = await response.text();
    console.error('createDhis2Metadata: API Error:', response.status, responseText);
    throw new Error(`HTTP error! status: ${response.status}, response: ${responseText}`);
  }
  const data = await response.json();
  console.log('createDhis2Metadata: Response:', data);
  return JSON.stringify({ response: data });
}

// Re-export structured tools for backward compatibility
export {
    createDhis2DataElement,
    createDhis2OrganisationUnit,
    createDhis2Category,
    createDhis2CategoryCombo,
    createDhis2DataSet,
    createDhis2Program,
    createDhis2Indicator,
    createDhis2ValidationRule,
    createDhis2OptionSet,
    searchDhis2DataElements,
    searchDhis2OrganisationUnits,
    searchDhis2Categories,
    searchDhis2CategoryCombos,
    searchDhis2DataSets,
    searchDhis2Programs,
    searchDhis2Indicators,
    getDhis2DataElementById,
    getDhis2OrganisationUnitById,
    getDhis2CategoryById,
    getDhis2DataSetById,
    getDhis2ProgramById,
} from './structured-tools';
