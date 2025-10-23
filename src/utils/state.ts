import { MessagesAnnotation } from "@langchain/langgraph/web";

/**
 * State annotation for the LangGraph agent
 * Uses basic messages annotation - conversation context is managed at tool level
 */
export const StateAnnotation = {
  ...MessagesAnnotation,
};
