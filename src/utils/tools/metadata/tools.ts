import { tool } from "@langchain/core/tools";

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
 * Tool that searches DHIS2 metadata based on a query string
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
 * Tool that creates DHIS2 data elements from natural language descriptions
 * Supports both single and batch creation
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

      // Generate data elements for each description
      const dataElementsPromises = descriptionsToProcess.map((desc, index) =>
        generateDataElementFromDescription(desc, customIdsArray[index])
      );

      const dataElements = await Promise.all(dataElementsPromises);

      // Create metadata payload
      const metadataPayload = {
        dataElements: dataElements
      };

      // Use the existing createDhis2Metadata function
      const result = await createDhis2Metadata({ metadataType: 'dataElements', params: dataElements });

      return JSON.stringify({
        success: true,
        dataElements: dataElements,
        count: dataElements.length,
        apiResponse: JSON.parse(result)
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

// Helper function to generate data element JSON from natural language
async function generateDataElementFromDescription(description: string, customId?: string): Promise<any> {
  // In the real implementation, this function would be called by the LLM agent
  // The agent would use the system prompt to generate the proper JSON structure
  // For now, we'll retain the basic implementation as a fallback

  // Generate ID if not provided
  const id = customId || `de_${description.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}`;

  // Simple keyword-based parsing for demonstration
  // The agent will eventually override this with proper LLM parsing
  const descLower = description.toLowerCase();

  let valueType = 'NUMBER';
  let aggregationType = 'SUM';
  let domainType = 'AGGREGATE';
  let zeroIsSignificant = false;

  // Parse value type
  if (descLower.includes('text') || descLower.includes('string')) {
    valueType = 'TEXT';
    aggregationType = 'NONE';
  } else if (descLower.includes('boolean') || descLower.includes('true') || descLower.includes('false')) {
    valueType = 'BOOLEAN';
    aggregationType = 'COUNT';
  } else if (descLower.includes('integer') || descLower.includes('int')) {
    valueType = 'INTEGER';
  } else if (descLower.includes('positive')) {
    valueType = 'POSITIVE_INT';
  } else if (descLower.includes('date')) {
    valueType = 'DATE';
    aggregationType = 'COUNT';
  } else if (descLower.includes('email')) {
    valueType = 'EMAIL';
    aggregationType = 'NONE';
  } else if (descLower.includes('phone')) {
    valueType = 'PHONE_NUMBER';
    aggregationType = 'NONE';
  }

  // Parse aggregation type
  if (descLower.includes('average') || descLower.includes('mean')) {
    aggregationType = 'AVERAGE';
  } else if (descLower.includes('count')) {
    aggregationType = 'COUNT';
  } else if (descLower.includes('min')) {
    aggregationType = 'MIN';
  } else if (descLower.includes('max')) {
    aggregationType = 'MAX';
  }

  // Parse domain type
  if (descLower.includes('tracker') || descLower.includes('event')) {
    domainType = 'TRACKER';
  }

  // Extract meaningful name from description
  const nameMatch = descLower.match(/(?:create|make).*?(?:data element|de).*?(?:called|named|for)\s+(.+?)(?:\s+that\s+|\s+with\s+|$)/i);
  let name = description;
  if (nameMatch && nameMatch[1]) {
    name = nameMatch[1].trim();
    // Capitalize first letter of each word
    name = name.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  const dataElement: any = {
    name: name,
    displayName: name,
    shortName: name.length > 50 ? name.substring(0, 47) + '...' : name,
    valueType: valueType,
    domainType: domainType,
    aggregationType: aggregationType,
    categoryCombo: { id: 'bjDvmb4bfuf' },
    zeroIsSignificant: zeroIsSignificant
  };

  // Add code if present in description
  const codeMatch = descLower.match(/code[=:]\s*([^\s,]+)/i);
  if (codeMatch && codeMatch[1]) {
    dataElement.code = codeMatch[1].toUpperCase();
  }

  return dataElement;
}

// Note: This function is referenced in the tool but not defined in this file
// It should be imported or moved here
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
