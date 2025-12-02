import { MessagesAnnotation } from "@langchain/langgraph/web";

/**
 * State annotation for the LangGraph agents
 * Conversation state is managed by ConversationContextManager, so we keep minimal state
 */
export const StateAnnotation = MessagesAnnotation
