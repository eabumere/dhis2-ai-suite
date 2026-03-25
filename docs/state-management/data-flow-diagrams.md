# 🌊 Data Flow Diagrams - System Interaction Patterns

## Overview

The Data Flow Diagrams document the complete journey of data through the DHIS2 AI Suite, from user input to system response. These diagrams illustrate the complex interactions between agents, orchestrators, and external services, providing a visual understanding of system behavior and data transformation patterns.

**File Location**: `docs/state-management/data-flow-diagrams.md`

**Key Diagrams**:
- User Query to Agent Routing Flow
- Metadata Search to Chart Generation Flow
- Error Recovery Data Flows
- File Upload and Processing Flows

---

## 🔀 **User Query → Agent Routing Flow**

### High-Level System Flow

```mermaid
graph TD
    A[👤 User Input] --> B[💬 Message Processing]
    B --> C[🤖 Router Agent]
    C --> D{Intent Classification}
    D -->|Search| E[🔍 Search Agent]
    D -->|Analytics| F[📊 Analytics Agent]
    D -->|CRUD| G[🔧 CRUD Agent]
    D -->|Data Entry| H[📝 Data Entry Router]
    D -->|Clarification| I[❓ User Selection]

    E --> J[🎭 Orchestrator]
    F --> J
    G --> J
    H --> J
    I --> C

    J --> K[💬 Conversation Context]
    K --> L[🖥️ UI Response]
```

### Detailed Agent Routing Logic

```mermaid
graph TD
    A[User Message] --> B[Strip File Content]
    B --> C[Generate Intent Interpretations]
    C --> D{Clarification Needed?}

    D -->|Yes| E[Generate Selection Options]
    E --> F[Return Clarification Request]

    D -->|No| G[Classify Intent Type]
    G --> H{Intent Type}

    H -->|new_task| I[Detect Workflow Type]
    H -->|follow_up| J[Determine Follow-up Agent]
    H -->|ambiguous| K[Generate LLM Selection]

    I --> L{Workflow Type}
    J --> M{Target Agent}
    K --> N[User Selection]

    L -->|direct_search| O[Invoke Search Agent]
    L -->|analytics_routing| P[Invoke Analytics Agent]
    L -->|crud| Q[Invoke CRUD Agent]
    L -->|data_entry| R[Invoke Data Entry Router]

    M --> O
    M --> P
    M --> Q
    M --> R
    N --> O
    N --> P
    N --> Q
    N --> R

    O --> S[Agent Processing]
    P --> S
    Q --> S
    R --> S

    S --> T[Result Formatting]
    T --> U[Orchestrator Integration]
    U --> V[Conversation Storage]
    V --> W[UI Update]
```

### Message Processing Flow

```mermaid
graph TD
    A[Raw User Input] --> B{Contains Files?}
    B -->|Yes| C[Extract File Content]
    B -->|No| D[Text Message]

    C --> E[Register Files]
    E --> F[Replace with References]
    F --> G[Strip from LLM Queries]

    D --> H[User Message Object]
    G --> H

    H --> I[Conversation Threading]
    I --> J[Timestamp & ID Assignment]
    J --> K[Orchestrator Queue]
```

---

## 🔍 **Metadata Search → Data Query → Chart Generation Flow**

### Complete Analytics Pipeline

```mermaid
graph TD
    A[📝 User Query] --> B[🤖 Router Agent]
    B --> C[📊 Analytics Agent]
    C --> D[🎯 Intent Classification]
    D --> E[🧠 LLM Metadata Extraction]

    E --> F{Entities Found?}
    F -->|Yes| G[🎯 Entity Selection UI]
    F -->|No| H[📊 Direct Chart Generation]

    G --> I[👤 User Selection]
    I --> H

    H --> J[📈 Chart Generation]
    J --> K[📊 ECharts Rendering]
    K --> L[🎭 Orchestrator]
    L --> M[💬 Conversation Update]
    M --> N[🖥️ UI Display]

    E --> O[Entity Storage]
    O --> P[🔄 Follow-up Context]
```

### Metadata Extraction Process

```mermaid
graph TD
    A[User Query] --> B[LLM Analysis]
    B --> C[Entity Recognition]
    C --> D{Confidence Check}

    D -->|High| E[Direct Mapping]
    D -->|Low| F[User Selection Required]

    E --> G[DHIS2 API Queries]
    F --> H[Selection Interface]
    H --> I[User Choice]
    I --> G

    G --> J[Data Retrieval]
    J --> K[Validation]
    K --> L{Valid Data?}

    L -->|Yes| M[Chart Data Preparation]
    L -->|No| N[Error Handling]
    N --> O[Recovery Options]

    M --> P[ECharts Configuration]
    P --> Q[Visualization Rendering]
```

### Chart Generation Workflow

```mermaid
graph TD
    A[Validated Data] --> B{Chart Type Detection}
    B -->|Time Series| C[📈 Line/Bar Chart]
    B -->|Geographic| D[🗺️ Map Visualization]
    B -->|Categorical| E[🥧 Pie/Donut Chart]
    B -->|Comparison| F[📊 Comparative Charts]

    C --> G[Data Transformation]
    D --> G
    E --> G
    F --> G

    G --> H[ECharts Options]
    H --> I[Theme Application]
    I --> J[Responsive Scaling]
    J --> K[Interactive Features]
    K --> L[Lazy Loading]
    L --> M[Orchestrator Integration]
    M --> N[UI Rendering]
```

---

## 🚨 **Error Recovery Data Flows**

### Error Classification Pipeline

```mermaid
graph TD
    A[⚠️ Error Occurs] --> B[Error Capture]
    B --> C{Error Type}

    C -->|Agent Error| D[Agent Error Handler]
    C -->|Network Error| E[Network Recovery]
    C -->|Validation Error| F[Input Correction]
    C -->|System Error| G[System Recovery]

    D --> H[LLM Classification]
    E --> H
    F --> H
    G --> H

    H --> I{Classification Result}
    I -->|Recoverable| J[Recovery Strategy Selection]
    I -->|Non-recoverable| K[Fatal Error Handling]

    J --> L[Automated Recovery]
    L --> M{Success?}
    M -->|Yes| N[Resume Workflow]
    M -->|No| O[User Intervention]

    K --> P[Error Logging]
    P --> Q[User Notification]
    Q --> R[Workflow Termination]

    O --> S[Manual Recovery]
    S --> N
```

### Workflow Recovery Patterns

```mermaid
graph TD
    A[Workflow Error] --> B[State Preservation]
    B --> C[Error Classification]
    C --> D{Recovery Type}

    D -->|Retry| E[Parameter Adjustment]
    D -->|Alternative| F[Strategy Selection]
    D -->|Manual| G[User Guidance]
    D -->|Checkpoint| H[State Restoration]

    E --> I[Retry Logic]
    I --> J{Success?}
    J -->|Yes| K[Continue Workflow]
    J -->|No| L[Escalation]

    F --> M[Alternative Execution]
    M --> N{Success?}
    N -->|Yes| K
    N -->|No| L

    G --> O[User Interaction]
    O --> P[Manual Resolution]
    P --> K

    H --> Q[Checkpoint Loading]
    Q --> R[State Validation]
    R --> K

    L --> S[Error Propagation]
    S --> T[Final Failure]
```

### Multi-Level Error Recovery

```mermaid
graph TD
    A[Operation Failure] --> B[Local Recovery]
    B --> C{Successful?}

    C -->|Yes| D[Continue Processing]
    C -->|No| E[Agent-Level Recovery]
    E --> F{Successful?}

    F -->|Yes| D
    F -->|No| G[Orchestrator Recovery]
    G --> H{Successful?}

    H -->|Yes| D
    H -->|No| I[System-Level Recovery]
    I --> J{Successful?}

    J -->|Yes| D
    J -->|No| K[User Intervention Required]
    K --> L[Manual Resolution]
    L --> M[Workflow Restart]
```

---

## 📁 **File Upload and Processing Flows**

### File Upload Pipeline

```mermaid
graph TD
    A[📎 File Upload] --> B[Client Validation]
    B --> C{Valid File?}

    C -->|No| D[❌ Validation Error]
    C -->|Yes| E[File Registration]

    E --> F[Content Analysis]
    F --> G{File Type}

    G -->|Text| H[Direct Processing]
    G -->|Binary| I[Secure Storage]
    G -->|Image| J[OCR Processing]
    G -->|Document| K[Document Parsing]

    H --> L[Content Extraction]
    I --> L
    J --> L
    K --> L

    L --> M[Message Integration]
    M --> N[Agent Processing]
    N --> O[Result Generation]
    O --> P[Conversation Update]
```

### Document Processing Workflow

```mermaid
graph TD
    A[📄 Document Upload] --> B[Format Detection]
    B --> C{Document Type}

    C -->|PDF| D[PDF Processing]
    C -->|Image| E[OCR Processing]
    C -->|CSV/Excel| F[Data Parsing]
    C -->|Text| G[Text Extraction]

    D --> H[Page Analysis]
    E --> H
    F --> H
    G --> H

    H --> I[Content Structuring]
    I --> J[Entity Recognition]
    J --> K[Validation]
    K --> L{Valid Content?}

    L -->|Yes| M[DHIS2 Mapping]
    L -->|No| N[Error Reporting]

    M --> O[Tracker Data Creation]
    O --> P[Review Interface]
    P --> Q[User Validation]
    Q --> R[Data Submission]
```

### CSV Processing Flow

```mermaid
graph TD
    A[📊 CSV File] --> B[Header Detection]
    B --> C[Column Type Analysis]

    C --> D{All Columns Mapped?}
    D -->|Yes| E[Data Validation]
    D -->|No| F[LLM Column Mapping]

    F --> G[User Confirmation]
    G --> E

    E --> H{Data Valid?}
    H -->|Yes| I[Dataset Resolution]
    H -->|No| J[Error Reporting]

    I --> K{Dataset Found?}
    K -->|Yes| L[Data Submission]
    K -->|No| M[Dataset Creation]

    M --> N[User Approval]
    N --> L

    L --> O[DHIS2 API Submission]
    O --> P[Result Processing]
    P --> Q[Grid Display]
    Q --> R[User Review]
    R --> S[Final Submission]
```

### Secure File Handling

```mermaid
graph TD
    A[File Reception] --> B[Security Scan]
    B --> C{Threat Detected?}

    C -->|Yes| D[🚫 File Rejection]
    C -->|No| E[Content Analysis]

    E --> F[Type Verification]
    F --> G{Supported Type?}

    G -->|No| H[❌ Unsupported Format]
    G -->|Yes| I[Size Validation]

    I --> J{Within Limits?}
    J -->|No| K[❌ File Too Large]
    J -->|Yes| L[Secure Storage]

    L --> M[Reference Generation]
    M --> N[Memory Cleanup]
    N --> O[Processing Ready]
```

---

## 🔄 **System Integration Flows**

### Cross-Agent Communication

```mermaid
graph TD
    A[Router Agent] --> B{Workflow Type}
    B -->|Search| C[Search Agent]
    B -->|Analytics| D[Analytics Agent]
    B -->|CRUD| E[CRUD Agent]
    B -->|Data Entry| F[Data Entry Router]

    C --> G[Orchestrator]
    D --> G
    E --> G
    F --> G

    G --> H[Conversation Context]
    H --> I[UI Updates]
    I --> J[User Feedback]

    F --> K{Aggregate vs Tracker}
    K -->|Aggregate| L[Aggregate Agent]
    K -->|Tracker| M[Tracker Agent]

    L --> G
    M --> G
```

### State Persistence Flow

```mermaid
graph TD
    A[Workflow Execution] --> B[State Changes]
    B --> C[Automatic Checkpoint]

    C --> D[State Serialization]
    D --> E[Storage Selection]

    E --> F{Storage Type}
    F -->|LocalStorage| G[Browser Storage]
    F -->|SessionStorage| H[Session Storage]
    F -->|Database| I[Persistent Storage]

    G --> J[Data Compression]
    H --> J
    I --> J

    J --> K[Metadata Attachment]
    K --> L[Storage Operation]
    L --> M[Confirmation]
    M --> N[Workflow Continuation]
```

### Performance Monitoring Flow

```mermaid
graph TD
    A[Operation Start] --> B[Performance Tracking]
    B --> C[Timer Initialization]

    C --> D[Operation Execution]
    D --> E[Metric Collection]

    E --> F{Performance Issue?}
    F -->|Yes| G[Optimization Trigger]
    F -->|No| H[Normal Completion]

    G --> I[Optimization Strategies]
    I --> J[Cache Warming]
    I --> K[Batch Processing]
    I --> L[Lazy Loading]

    J --> M[Performance Improvement]
    K --> M
    L --> M

    H --> N[Metrics Storage]
    M --> N
    N --> O[Analytics Dashboard]
    O --> P[Continuous Improvement]
```

---

## 🎯 **Data Flow Patterns Summary**

### **Primary Flow Categories**

1. **Query Processing Flow**: User input → Intent classification → Agent routing → Result generation
2. **Analytics Flow**: Query analysis → Metadata extraction → Data retrieval → Visualization
3. **CRUD Operations Flow**: Planning → Resource preparation → Execution → Confirmation
4. **Error Recovery Flow**: Error detection → Classification → Recovery strategy → Resolution
5. **File Processing Flow**: Upload → Validation → Processing → Integration

### **Key Integration Points**

- **Orchestrator** as central coordination hub
- **Conversation Context** for state persistence
- **LLM Services** for intelligent processing
- **DHIS2 API** for data operations
- **UI Components** for user interaction

### **Performance Characteristics**

- **Asynchronous Processing**: Non-blocking operations
- **Caching Layers**: Multiple levels of optimization
- **Progressive Loading**: Lazy loading for heavy components
- **Error Resilience**: Graceful degradation and recovery
- **Scalable Architecture**: Modular design for extension

These data flow diagrams provide a comprehensive view of how data moves through the DHIS2 AI Suite, enabling developers to understand system interactions, debug issues, and optimize performance.
