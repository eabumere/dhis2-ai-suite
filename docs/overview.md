# 📋 System Overview - DHIS2 AI Suite

## What is the DHIS2 AI Suite?

The DHIS2 AI Suite is an intelligent conversational interface for DHIS2 (District Health Information Software 2) that enables users to interact with health data systems using natural language. Built as a DHIS2 application, it provides AI-powered assistance for:

- **Metadata Management**: Creating, updating, and searching DHIS2 metadata objects
- **Data Analysis**: Generating charts and insights from health data
- **Data Entry**: Processing CSV files and tracker data with intelligent validation
- **System Navigation**: Finding and understanding DHIS2 configuration

## 🏗️ Architecture Overview

### Core Architecture Pattern

The system follows an **agent-based architecture** using LangChain/LangGraph for complex workflow orchestration:

```
User Query → Router Agent → Specialized Agent → Workflow Orchestrator → UI Response
```

### Key Components

#### 🤖 **AI Agents**
- **Router Agent**: Classifies user intent and routes to appropriate specialized agents
- **Metadata Agent**: Handles all DHIS2 metadata CRUD operations (30+ tools)
- **Analytics Agent**: Processes data analysis requests with LLM-driven metadata extraction
- **Search Agent**: Intelligent metadata search with LLM-powered tool selection
- **Tracker Agent**: Processes patient-level data and tracker entity management
- **Aggregate Data Agent**: CSV processing and aggregate data value entry
- **Data Entry Router**: Coordinates tracker vs aggregate data entry workflows

#### 🎭 **Workflow Orchestrator**
Central coordination system that:
- Manages UI state across the entire application
- Handles conversation threading and context persistence
- Implements error classification and recovery strategies
- Provides progress tracking with checkpointing
- Manages file uploads and processing

#### 🔄 **State Management**
- **Graph State**: LangGraph StateAnnotation system for workflow state
- **Conversation Context**: Persistent context across user interactions
- **Session Management**: Maintains conversation history and references

## 🔄 Data Flow Patterns

### 1. Metadata Operations
```
User: "Create a new data element for HIV testing"
      ↓
Router → Metadata Agent → DHIS2 API → Success Response
```

### 2. Analytics Workflow
```
User: "Show me HIV testing trends for 2024"
      ↓
Router → Analytics Agent → LLM Metadata Extraction → DHIS2 Analytics API → Chart Generation
```

### 3. Data Entry Process
```
User: Uploads CSV + "Enter this data"
      ↓
Router → Data Entry Agent → Header Mapping → Validation → DHIS2 Data Values API
```

## 🛠️ Technology Stack

### Frontend
- **React 18**: Component-based UI with hooks
- **TypeScript**: Type-safe development
- **DHIS2 UI Library**: Consistent design system

### AI/ML Layer
- **LangChain**: LLM application framework
- **LangGraph**: Workflow orchestration (@langchain/langgraph/web for browser compatibility)
- **Azure OpenAI**: LLM provider with multilingual support
- **Custom LLM Services**: Intent classification, entity extraction

### DHIS2 Integration
- **DHIS2 App Platform**: Official DHIS2 application framework
- **DHIS2 API**: RESTful API for metadata and data operations
- **Batch Operations**: Efficient bulk data processing

### State & Data Management
- **Conversation Context**: Custom persistence layer
- **File Registry**: Upload handling and processing
- **Error Recovery**: Intelligent error classification and recovery

## 🎯 Key Features

### Intelligent Query Processing
- **Multilingual Support**: English, French, Spanish, Arabic, Portuguese
- **Context Awareness**: Follow-up queries reference previous operations
- **Intent Classification**: Automatic routing to appropriate workflows

### Robust Error Handling
- **Error Classification**: recoverable/non-recoverable/partial-success
- **Recovery Strategies**: User-guided error resolution
- **Workflow Resumption**: Continue interrupted operations

### Advanced Data Processing
- **LLM-Powered Extraction**: Automatic metadata discovery from queries
- **Batch Operations**: Efficient bulk data processing
- **Validation**: Real-time data validation with correction suggestions

## 📁 Project Structure

```
src/
├── agents/                 # AI agent implementations
│   ├── router-agent.ts    # Intent classification and routing
│   ├── metadata-agent.ts  # CRUD operations (entry point)
│   ├── analytics-graph-agent.ts  # Analytics workflows
│   ├── search-agent.ts     # Intelligent search
│   ├── tracker-agent.ts    # Patient data processing
│   ├── aggregate-data-agent.ts  # CSV data entry
│   └── routed-data-entry-agent.ts  # Data entry coordination
├── components/             # React UI components
├── utils/
│   ├── workflow-orchestrator.ts  # Central coordination
│   ├── conversation-context.ts   # Context persistence
│   ├── llm-classification-service.ts  # AI services
│   └── tools/             # DHIS2 integration tools
│       └── metadata/       # 30+ DHIS2 API tools
└── types/                  # TypeScript definitions
```

## 🔐 Security & Performance

### Security Considerations
- **Browser-Only LLM**: No sensitive data sent to external AI services
- **DHIS2 Authentication**: Uses DHIS2's built-in auth system
- **File Handling**: Secure upload processing with validation

### Performance Optimizations
- **Lazy Loading**: Charts and heavy components load on demand
- **Batch Operations**: Minimize API calls through bulk operations
- **Caching**: Conversation context and metadata caching
- **Progress Tracking**: Real-time feedback for long-running operations

## 🚀 Getting Started

### Prerequisites
- DHIS2 instance access
- Azure OpenAI API key
- Node.js 18+
- Yarn package manager

### Quick Setup
1. Clone the repository
2. Configure environment variables
3. Install dependencies: `yarn install`
4. Build and deploy: `yarn build && yarn deploy`

See [Setup Guide](./development/setup.md) for detailed instructions.

## 🎯 Usage Examples

### Metadata Management
```
User: "Create a data element called 'HIV Tests Performed' with positive integer values"
Result: New data element created with proper validation rules
```

### Data Analysis
```
User: "Show malaria cases by district for the last 6 months"
Result: Interactive chart with district-level breakdown
```

### Data Entry
```
User: Upload CSV + "Enter this monthly reporting data for Q1 2024"
Result: Validated data entry with error correction suggestions
```

## 🤝 Contributing

The system is designed for extensibility:
- **Add New Agents**: Implement new workflow types
- **Extend Tools**: Add new DHIS2 API integrations
- **Enhance UI**: Add new interaction patterns
- **Improve AI**: Enhance classification and extraction

See [Extensions Guide](./development/extensions.md) for development patterns.

## 📊 Monitoring & Maintenance

### Key Metrics
- Query success rates by agent type
- Average response times
- Error recovery effectiveness
- User interaction patterns

### Maintenance Tasks
- LLM prompt optimization
- DHIS2 API compatibility updates
- Performance monitoring and optimization
- Documentation updates

---

This overview provides the foundation for understanding the DHIS2 AI Suite. For detailed implementation information, see the [Architecture Deep Dive](./architecture.md) or dive into specific component documentation.
