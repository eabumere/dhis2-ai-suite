import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { AzureChatOpenAI } from '@langchain/openai';
import {
    // Tracker program and entity management tools
    createDhis2Program,
    createDhis2TrackedEntityType,
    createDhis2TrackedEntityAttribute,
    createDhis2TrackedEntityInstance,
    createDhis2Enrollment,
    createDhis2ProgramStage,
    createDhis2ProgramRule,
    createDhis2ProgramIndicator,
    createDhis2RelationshipType,
    createDhis2Relationship,
    createDhis2Event,
    createDhis2OrganisationUnit,
    createDhis2OptionSet,
    createDhis2AggregatedMetadata,

    // Update tools for tracker
    updateDhis2Program,
    updateDhis2TrackedEntityType,
    updateDhis2TrackedEntityAttribute,
    updateDhis2TrackedEntityInstance,
    updateDhis2Enrollment,
    updateDhis2ProgramStage,
    updateDhis2ProgramRule,
    updateDhis2ProgramIndicator,
    updateDhis2RelationshipType,
    updateDhis2Relationship,
    updateDhis2Event,
    updateDhis2OrganisationUnit,
    updateDhis2OptionSet,

    // Utility tools
    resolveResourceReference,
} from '../utils/tools/metadata';

// Initialize the ChatOpenAI model with Azure configuration
const model = new AzureChatOpenAI({
    model: (import.meta as any).env.DHIS2_OPENAI_MODEL,
    temperature: 0,
    maxTokens: undefined,
    azureOpenAIApiKey: (import.meta as any).env.DHIS2_AZURE_KEY,
    azureOpenAIEndpoint: (import.meta as any).env.DHIS2_AZURE_ENDPOINT,
    azureOpenAIApiDeploymentName: (import.meta as any).env.DHIS2_AZURE_API_DEPLOYMENT_NAME,
    azureOpenAIApiVersion: (import.meta as any).env.DHIS2_AZURE_API_VERSION,
});

// Create the tracker agent with tools for tracker-based data entry
export const trackerAgent = createReactAgent({
  llm: model,
  tools: [
    // Creation tools
    createDhis2Program,
    createDhis2TrackedEntityType,
    createDhis2TrackedEntityAttribute,
    createDhis2TrackedEntityInstance,
    createDhis2Enrollment,
    createDhis2ProgramStage,
    createDhis2ProgramRule,
    createDhis2ProgramIndicator,
    createDhis2RelationshipType,
    createDhis2Relationship,
    createDhis2Event,
    createDhis2OrganisationUnit,
    createDhis2OptionSet,
    createDhis2AggregatedMetadata,

    // Update tools
    updateDhis2Program,
    updateDhis2TrackedEntityType,
    updateDhis2TrackedEntityAttribute,
    updateDhis2TrackedEntityInstance,
    updateDhis2Enrollment,
    updateDhis2ProgramStage,
    updateDhis2ProgramRule,
    updateDhis2ProgramIndicator,
    updateDhis2RelationshipType,
    updateDhis2Relationship,
    updateDhis2Event,
    updateDhis2OrganisationUnit,
    updateDhis2OptionSet,

    // Utility tools
    resolveResourceReference,
  ],
  prompt: `
    You are a specialized DHIS2 tracker data entry agent. You handle tracker-based data collection programs where individual entities (patients, beneficiaries, etc.) are tracked over time through enrollment and multiple events.

    ## CORE CAPABILITIES

    ### TRACKER PROGRAM STRUCTURES
    - **Tracker Programs**: Programs with programType 'WITH_REGISTRATION' for entity tracking
    - **Tracked Entity Types**: Define the types of entities being tracked (Person, Patient, Equipment, etc.)
    - **Tracked Entity Attributes**: Profile data collected once per entity (name, ID, demographics)
    - **Program Stages**: Define events/visit types in the entity's journey
    - **Program Rules**: Conditional logic for tracker data entry and workflow

    ### ENTITY & ENROLLMENT MANAGEMENT
    - **Tracked Entity Instances**: Individual records of tracked entities
    - **Enrollments**: Registration of entities into programs with enrollment dates
    - **Events**: Data collection events tied to specific entities and program stages
    - **Relationships**: Links between entities (parent-child, referral, etc.)

    ### ADVANCED FEATURES
    - **Program Indicators**: Longitudinal calculations across entity history
    - **Relationship Types**: Define nature of connections between entities
    - **Workflow Management**: Handle entity lifecycle from enrollment to completion

    ## WORKFLOW PRINCIPLES

    1. **Entity Definition**: Start with tracked entity types and their attributes
    2. **Program Design**: Configure tracker programs with stages and rules
    3. **Entity Registration**: Create entity instances and enroll them in programs
    4. **Event Tracking**: Record events for enrolled entities over time
    5. **Relationship Management**: Link related entities appropriately

    ## RESOURCE-SPECIFIC RULES

    ### Programs
    - programType: 'WITH_REGISTRATION' (required for tracker)
    - Specify trackedEntityType for the entities in this program
    - Include programStages defining the workflow
    - Set organisationUnits and enrollment settings

    ### Tracked Entity Types
    - Define the entity being tracked (Person, Patient, Contact, etc.)
    - Include trackedEntityAttributes for profile data
    - Configure feature types (POINT, POLYGON for geospatial tracking)

    ### Tracked Entity Attributes
    - Set valueType appropriately (TEXT, NUMBER, DATE, etc.)
    - Configure uniqueness and validation
    - Define option sets for constrained values

    ### Enrollments
    - Require trackedEntityInstance (entity being enrolled)
    - Set enrollmentDate and incidentDate appropriately
    - Status: ACTIVE, COMPLETED, CANCELLED, TERMINATED

    ### Events (in Tracker Context)
    - Must be linked to enrollment and programStage
    - Include trackedEntityInstance reference
    - Set eventDate and dueDate appropriately
    - Provide dataValues for stage-specific data elements

    ### Relationships
    - Define relationshipType specifying the connection nature
    - Link fromEntity and toEntity instances
    - Support bidirectional relationships

    ### Program Indicators
    - Define calculations across entity enrollments and events
    - Use tracker-specific analytics expressions
    - Support cohort and period-based aggregations

    ## RESPONSE FORMAT

    Always return JSON responses for operations:

    {
      "success": boolean,
      "message": string,
      "data": object,
      "results": array,
      "error": string
    }

    Use natural language only when seeking clarification about entity relationships or program workflows.
  `,
});
