import { MessagesAnnotation } from "@langchain/langgraph/web";
import { z } from "zod";

/**
 * Extended state management for conversational context
 */
export interface ConversationContext {
  /** Recently created resources with metadata */
  createdResources: ResourceReference[];
  /** Recently accessed/referenced resources */
  accessedResources: ResourceReference[];
  /** Resource type-specific context (last created by type) */
  lastByType: Record<string, ResourceReference>;
  /** User-specified custom references */
  namedReferences: Record<string, ResourceReference>;
}

/**
 * Reference to a resource in conversation context
 */
export interface ResourceReference {
  /** Resource ID */
  id: string;
  /** Resource type (dataElements, organisationUnits, etc.) */
  type: string;
  /** Resource name */
  name: string;
  /** When this resource was last referenced in conversation */
  lastReferenced: Date;
  /** Operation that was performed */
  lastOperation: 'created' | 'updated' | 'accessed' | 'searched';
}

/**
 * Custom state schema for DHIS2 agent
 */
export const CustomStateSchema = z.object({
  messages: z.array(z.any()),
  context: z.object({
    createdResources: z.array(z.object({
      id: z.string(),
      type: z.string(),
      name: z.string(),
      lastReferenced: z.date(),
      lastOperation: z.enum(['created', 'updated', 'accessed', 'searched'])
    })),
    accessedResources: z.array(z.object({
      id: z.string(),
      type: z.string(),
      name: z.string(),
      lastReferenced: z.date(),
      lastOperation: z.enum(['created', 'updated', 'accessed', 'searched'])
    })),
    lastByType: z.record(z.string(), z.object({
      id: z.string(),
      type: z.string(),
      name: z.string(),
      lastReferenced: z.date(),
      lastOperation: z.enum(['created', 'updated', 'accessed', 'searched'])
    })),
    namedReferences: z.record(z.string(), z.object({
      id: z.string(),
      type: z.string(),
      name: z.string(),
      lastReferenced: z.date(),
      lastOperation: z.enum(['created', 'updated', 'accessed', 'searched'])
    }))
  }).default({
    createdResources: [],
    accessedResources: [],
    lastByType: {},
    namedReferences: {}
  })
});

/**
 * State annotation for the LangGraph agent
 * Enhanced with conversational context management
 */
export const StateAnnotation = {
  ...MessagesAnnotation,
  // Add custom state fields for conversation context
  store: z.any().optional(), // Additional state store if needed
};
