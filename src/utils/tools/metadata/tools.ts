import { tool } from "@langchain/core/tools";

// DHIS2 environment variables
const dhis2BaseUrl = import.meta.env.DHIS2_BASE_URL;
const username = import.meta.env.DHIS2_USERNAME;
const password = import.meta.env.DHIS2_PASSWORD;

const auth = `${username}:${password}`;

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
    console.log('searchDhis2Metadata: Query:', query, 'Limit:', limit);

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

      console.log('searchDhis2Metadata: Results:', results);
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
