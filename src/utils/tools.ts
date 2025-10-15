import { tool } from "@langchain/core/tools";

/**
 * Tool that returns today's date in a formatted string
 */
export const getTodaysDate = tool(
  async () => {
    const today = new Date();
    return today.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  },
  {
    name: "get_todays_date",
    description: "Get today's date in a formatted string (e.g., 'Tuesday, October 15, 2025')",
  }
);
