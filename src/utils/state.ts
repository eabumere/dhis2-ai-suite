import { MessagesAnnotation } from "@langchain/langgraph/web";

/**
 * State annotation for the LangGraph agent
 * Uses the built-in MessagesAnnotation for simple message-based state
 */
export const StateAnnotation = MessagesAnnotation;
