import { MessagesAnnotation } from "@langchain/langgraph/web";
import { ConversationEntry, DataContext } from "./conversation-context";

/**
 * Enhanced State annotation for the LangGraph agent with conversation context
 */
export const StateAnnotation = {
  ...MessagesAnnotation,
  // Add conversation context for unified follow-up questions
  reducer: conversations: ConversationEntry[],
  dataContexts: DataContext[],
  activeTopics: string[],
  currentDiscussionTopic?: string,
  lastAnalyticsMemory?: DataContext,
};
