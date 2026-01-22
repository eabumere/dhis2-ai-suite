# 🏗️ DHIS2 AI Suite - System Architecture

## Overview

The DHIS2 AI Suite is a sophisticated conversational AI platform designed for health data management and analytics. This document provides a comprehensive architectural overview of the system's components, data flows, and integration patterns.

**Architecture Type**: Event-driven conversational AI platform with modular agent-based design

**Core Components**: Router Agent, Specialized Agents, Workflow Orchestrator, State Management, UI Components

---

## 🏛️ **High-Level System Architecture**

```mermaid
graph TB
    %% User Interface Layer
    subgraph "User Interface Layer"
        UI[🖥️ React UI Components]
        MR[💬 MessageRenderer]
        DG[📊 DataGrid Components]
    end

    %% Orchestration Layer
    subgraph "Orchestration Layer"
        WO[🎭 Workflow Orchestrator]
        CC[💬 Conversation Context]
        SM[📊 State Management]
        PT[📈 Progress Tracking]
    end

    %% Agent Layer
    subgraph "Agent Layer"
        RA[🤖 Router Agent]
        subgraph "Specialized Agents"
            MA[🔧 Metadata Agent]
            SA[🔍 Search Agent]
            AA[📊 Analytics Agent]
            TA[🏥 Tracker Agent]
            ADA[📈 Aggregate Data Agent]
            DEA[📝 Data Entry Router]
        end
    end

    %% AI & LLM Layer
    subgraph "AI & LLM Layer"
        CM[🧠 Chat Model Factory]
        LLMS[🌐 LLM Classification Service]
        CS[🤔 Clarification Service]
    end

    %% External Services
    subgraph "External Services"
        D2[🗄️ DHIS2 Platform]
        AZ[☁️ Azure OpenAI]
        SW[⚡ Service Worker]
    end

    %% Data Flow
    User[👤 User] --> UI
    UI --> WO
    WO --> RA
    RA --> MA
    RA --> SA
    RA --> AA
    RA --> TA
    RA --> ADA
    RA --> DEA

    MA --> D2
    SA --> D2
    AA --> D2
    TA --> D2
    ADA --> D2
    DEA --> WO

    RA --> CM
    CM --> AZ
    LLMS --> AZ
    CS --> AZ

    WO --> SM
    WO --> PT
    WO --> CC

    WO --> UI
    CC --> UI
    SM --> UI

    SW --> UI
    UI --> SW

    %% Styling
    classDef userInterface fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef orchestration fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef agents fill:#e8f5e8,stroke:#1b5e20,stroke-width:2px
    classDef ai fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef external fill:#fce4ec,stroke:#880e4f,stroke-width:2px
    classDef user fill:#e3f2fd,stroke:#0d47a1,stroke-width:3px

    class User user
    class UI,MR,DG userInterface
    class WO,CC,SM,PT orchestration
    class RA,MA,SA,AA,TA,ADA,DEA agents
    class CM,LLMS,CS ai
    class D2,AZ,SW external
```

---

## 🔄 **Detailed Component Interaction Flow**

### User Query Processing Pipeline

```mermaid
sequenceDiagram
    participant U as 👤 User
    participant UI as 🖥️ React UI
    participant WO as 🎭 Workflow Orchestrator
    participant RA as 🤖 Router Agent
    participant SA as 🔍 Specialized Agent
    participant CM as 🧠 Chat Models
    participant D2 as 🗄️ DHIS2 API
    participant CC as 💬 Conversation Context

    U->>UI: Types query
    UI->>WO: submitQuery(query)
    WO->>CC: storeUserMessage(query)

    WO->>RA: invoke({messages, orchestrator})
    RA->>CM: classifyIntent(query)
    CM-->>RA: intentClassification

    RA->>SA: invoke(specializedTask)
    SA->>D2: API operations
    D2-->>SA: data/results

    SA-->>WO: finalResult
    WO->>CC: storeAssistantMessage(result)
    WO->>UI: updateUI(result)

    UI-->>U: Display response
```

### Agent Routing Decision Tree

```mermaid
graph TD
    A[👤 User Query] --> B[🤖 Router Agent]
    B --> C{Intent Classification}

    C -->|CRUD Operations| D[🔧 Metadata Agent]
    C -->|Search/Browse| E[🔍 Search Agent]
    C -->|Analytics/Charts| F[📊 Analytics Agent]
    C -->|Patient Data| G[🏥 Tracker Agent]
    C -->|CSV Upload| H[📈 Aggregate Data Agent]
    C -->|Data Entry| I[📝 Data Entry Router]

    D --> J[🗄️ DHIS2 Metadata API]
    E --> J
    F --> K[🗄️ DHIS2 Analytics API]
    G --> L[🗄️ DHIS2 Tracker API]
    H --> M[🗄️ DHIS2 Data Values API]
    I --> N{Data Type?}

    N -->|Tracker| G
    N -->|Aggregate| H

    J --> O[📋 Unified Result Format]
    K --> O
    L --> O
    M --> O

    O --> P[🎭 Workflow Orchestrator]
    P --> Q[💬 Conversation Context]
    Q --> R[🖥️ UI Response]
```

---

## 🧩 **Component Architecture Details**

### Workflow Orchestrator - Central Coordination Hub

```mermaid
graph TD
    subgraph "Workflow Orchestrator Core"
        WOC[Workflow Controller]
        UIM[UI State Manager]
        WEM[Workflow Execution Manager]
        EHM[Error Handler Manager]
        PTM[Progress Tracking Manager]
    end

    subgraph "State Management"
        CCS[Conversation Store]
        WSS[Workflow State Store]
        PSS[Progress State Store]
        FSS[File Registry Store]
    end

    subgraph "Integration Points"
        AIP[Agent Invocation Proxy]
        UIIP[UI Integration Proxy]
        DSIP[Data Service Proxy]
        FSIP[File System Proxy]
    end

    WOC --> UIM
    WOC --> WEM
    WOC --> EHM
    WOC --> PTM

    UIM --> CCS
    WEM --> WSS
    PTM --> PSS
    WEM --> FSS

    AIP --> WEM
    UIIP --> UIM
    DSIP --> WEM
    FSIP --> WEM
```

### Agent Architecture Patterns

#### Router Agent - Intelligent Traffic Director

```mermaid
graph TD
    subgraph "Router Agent"
        IC[Intention Classifier]
        FD[Follow-up Detector]
        AR[Agent Router]
        CS[Clarification Service]
    end

    subgraph "Classification Pipeline"
        LLM[LLM Intent Analysis]
        KW[Keyword Matching]
        CTX[Context Analysis]
        ML[Machine Learning]
    end

    subgraph "Routing Logic"
        WF[Workflow Type Detection]
        AG[Agent Selection]
        PR[Priority Ranking]
        FB[Fallback Handling]
    end

    IC --> LLM
    IC --> KW
    IC --> CTX
    IC --> ML

    AR --> WF
    AR --> AG
    AR --> PR
    AR --> FB

    IC --> CS
    CS --> AR
```

#### Specialized Agent Architecture

```mermaid
graph TD
    subgraph "Agent Core"
        AC[Agent Controller]
        TM[Tool Manager]
        SM[State Manager]
        EM[Error Manager]
    end

    subgraph "Tool Ecosystem"
        DHIS2[DHIS2 API Tools]
        LLM[LLM Processing Tools]
        DATA[Data Processing Tools]
        UTIL[Utility Tools]
    end

    subgraph "State Management"
        GS[Graph State]
        PS[Progress State]
        RS[Recovery State]
        IS[Intermediate State]
    end

    AC --> TM
    AC --> SM
    AC --> EM

    TM --> DHIS2
    TM --> LLM
    TM --> DATA
    TM --> UTIL

    SM --> GS
    SM --> PS
    SM --> RS
    SM --> IS
```

---

## 🌊 **Data Flow Architecture**

### Complete System Data Flow

```mermaid
graph TD
    subgraph "Input Processing"
        UQ[👤 User Query]
        FU[📎 File Upload]
        UI[🖱️ UI Interactions]
    end

    subgraph "Data Processing Pipeline"
        DP[📝 Data Parsing]
        DV[✅ Data Validation]
        DT[🔄 Data Transformation]
        DS[💾 Data Storage]
    end

    subgraph "AI Processing Layer"
        IC[🎯 Intent Classification]
        EC[🧠 Entity Extraction]
        RC[🔍 Resolution Logic]
        GC[📊 Generation Logic]
    end

    subgraph "DHIS2 Integration"
        MA[🏗️ Metadata Operations]
        DA[📊 Analytics Queries]
        TD[🏥 Tracker Data]
        AD[📈 Aggregate Data]
        DE[🔄 Data Entry]
    end

    subgraph "Output Processing"
        RF[📋 Result Formatting]
        UIU[🖥️ UI Updates]
        CD[💾 Conversation Storage]
        PE[📊 Progress Events]
    end

    UQ --> DP
    FU --> DP
    UI --> DP

    DP --> DV
    DV --> DT
    DT --> DS

    DS --> IC
    IC --> EC
    EC --> RC
    RC --> GC

    GC --> MA
    GC --> DA
    GC --> TD
    GC --> AD
    GC --> DE

    MA --> RF
    DA --> RF
    TD --> RF
    AD --> RF
    DE --> RF

    RF --> UIU
    RF --> CD
    RF --> PE
```

### State Management Data Flow

```mermaid
graph TD
    subgraph "State Producers"
        WA[🤖 Agent Actions]
        UI[🖱️ User Interactions]
        WE[⚡ Workflow Events]
        SE[🚨 System Events]
    end

    subgraph "State Processing"
        SR[📥 State Reducers]
        SV[✅ State Validation]
        SM[🔄 State Merging]
        SN[📤 State Notification]
    end

    subgraph "State Consumers"
        UI[🖥️ UI Components]
        WO[🎭 Workflow Orchestrator]
        CC[💬 Conversation Context]
        PT[📈 Progress Tracking]
    end

    subgraph "Persistence Layer"
        LS[💾 Local Storage]
        SS[💾 Session Storage]
        DB[🗄️ Database]
        CH[☁️ Cloud Storage]
    end

    WA --> SR
    UI --> SR
    WE --> SR
    SE --> SR

    SR --> SV
    SV --> SM
    SM --> SN

    SN --> UI
    SN --> WO
    SN --> CC
    SN --> PT

    SM --> LS
    SM --> SS
    SM --> DB
    SM --> CH
```

---

## 🔧 **Technology Stack Integration**

### Frontend Architecture

```mermaid
graph TD
    subgraph "React Ecosystem"
        RA[⚛️ React 18+]
        RT[🎣 React Hooks]
        RC[📦 React Context]
        RU[🔄 React Router]
    end

    subgraph "UI Framework"
        AN[🎨 Ant Design]
        MD[📱 Material Design]
        CU[🎨 Custom Components]
        TH[🎭 Theme System]
    end

    subgraph "State Management"
        SM[📊 State Machines]
        GS[🔄 Graph State]
        CC[💬 Conversation Context]
        LS[💾 Local Storage]
    end

    subgraph "Build & Development"
        WB[📦 Webpack/Vite]
        TS[📘 TypeScript]
        ESL[🔧 ESLint]
        TST[🧪 Jest/Testing Library]
    end

    RA --> AN
    RA --> CU
    RA --> TH

    RT --> SM
    RC --> SM
    RU --> SM

    SM --> GS
    SM --> CC
    SM --> LS

    WB --> TS
    WB --> ESL
    WB --> TST
```

### Backend Integration Architecture

```mermaid
graph TD
    subgraph "AI Services"
        AO[☁️ Azure OpenAI]
        OP[🤖 OpenAI API]
        AC[🧠 Anthropic Claude]
        LC[🔗 LangChain]
    end

    subgraph "DHIS2 Platform"
        D2A[🔌 DHIS2 Web API]
        D2M[📱 DHIS2 Mobile]
        D2D[🖥️ DHIS2 Desktop]
        D2I[🔧 DHIS2 Integration]
    end

    subgraph "External Services"
        AZS[☁️ Azure Storage]
        AZF[⚡ Azure Functions]
        DBS[🗄️ Database Services]
        CDS[☁️ Cloud Services]
    end

    subgraph "Security & Auth"
        OAU[🔐 OAuth 2.0]
        JWT[🎫 JWT Tokens]
        APIK[🔑 API Keys]
        CERT[📜 SSL/TLS]
    end

    AO --> LC
    OP --> LC
    AC --> LC

    D2A --> D2I
    D2M --> D2I
    D2D --> D2I

    AZS --> D2I
    AZF --> D2I
    DBS --> D2I
    CDS --> D2I

    OAU --> D2I
    JWT --> D2I
    APIK --> D2I
    CERT --> D2I
```

---

## 📊 **Performance & Scalability Architecture**

### Caching Strategy Architecture

```mermaid
graph TD
    subgraph "Cache Layers"
        BC[🚀 Browser Cache]
        SW[⚡ Service Worker Cache]
        MC[💾 Memory Cache]
        LC[💿 Local Storage]
        SC[☁️ Server Cache]
    end

    subgraph "Cache Types"
        STC[📄 Static Content]
        DYC[🔄 Dynamic Data]
        UDC[👤 User Data]
        MDC[📊 Metadata Cache]
        REC[🔄 Result Cache]
    end

    subgraph "Cache Management"
        CI[📥 Cache Invalidation]
        CU[🔄 Cache Updates]
        CP[📊 Cache Performance]
        CM[🧹 Cache Maintenance]
    end

    BC --> STC
    SW --> STC
    MC --> DYC
    LC --> UDC
    SC --> MDC

    STC --> CI
    DYC --> CU
    UDC --> CP
    MDC --> CM
    REC --> CM
```

### Error Handling & Recovery Architecture

```mermaid
graph TD
    subgraph "Error Detection"
        CE[🚨 Client Errors]
        SE[⚠️ Server Errors]
        NE[🌐 Network Errors]
        VE[❌ Validation Errors]
        AE[🤖 AI Errors]
    end

    subgraph "Error Classification"
        EC[🏷️ Error Classifier]
        ES[📊 Severity Assessment]
        ET[🔍 Error Type Analysis]
        EI[📋 Impact Analysis]
    end

    subgraph "Recovery Strategies"
        RS[🔄 Retry Strategies]
        FB[🔀 Fallback Methods]
        US[👤 User Intervention]
        AS[🤖 Automated Recovery]
        MS[📞 Manual Support]
    end

    subgraph "Error Prevention"
        IP[🛡️ Input Validation]
        TM[⏱️ Timeout Management]
        LM[📊 Load Management]
        CM[🔄 Circuit Breakers]
    end

    CE --> EC
    SE --> EC
    NE --> EC
    VE --> EC
    AE --> EC

    EC --> ES
    EC --> ET
    EC --> EI

    ES --> RS
    ET --> FB
    EI --> US

    RS --> AS
    FB --> MS

    AS --> IP
    MS --> TM
    US --> LM
    FB --> CM
```

---

## 🔐 **Security Architecture**

### Authentication & Authorization

```mermaid
graph TD
    subgraph "Authentication"
        OA[🔐 OAuth 2.0 Flow]
        JWT[🎫 JWT Token Management]
        SS[💾 Session Management]
        RT[🔄 Token Refresh]
    end

    subgraph "Authorization"
        RB[🎭 Role-Based Access]
        PB[📋 Permission-Based Access]
        OB[🏢 Organization-Based Access]
        AB[🎯 Attribute-Based Access]
    end

    subgraph "Security Controls"
        IE[🛡️ Input Validation]
        OE[📤 Output Sanitization]
        CS[🔒 Content Security Policy]
        CORS[🌐 CORS Configuration]
        RL[⏱️ Rate Limiting]
    end

    OA --> JWT
    JWT --> SS
    SS --> RT

    RB --> AB
    PB --> AB
    OB --> AB

    IE --> CS
    OE --> CORS
    CS --> RL
```

### Data Protection

```mermaid
graph TD
    subgraph "Data Encryption"
        TE[🔐 Transport Encryption]
        SE[💾 Storage Encryption]
        FE[📎 File Encryption]
        KE[🔑 Key Management]
    end

    subgraph "Privacy Protection"
        DP[📋 Data Minimization]
        AP[🎯 Purpose Limitation]
        RP[⏰ Retention Policies]
        CP[🔄 Consent Management]
    end

    subgraph "Compliance"
        GDPR[🇪🇺 GDPR Compliance]
        HIPAA[🏥 HIPAA Compliance]
        SOX[📊 SOX Compliance]
        AUD[📋 Audit Logging]
    end

    TE --> KE
    SE --> KE
    FE --> KE

    DP --> CP
    AP --> CP
    RP --> CP

    GDPR --> AUD
    HIPAA --> AUD
    SOX --> AUD
```

---

## 🚀 **Deployment Architecture**

### Development Environment

```mermaid
graph TD
    subgraph "Local Development"
        LD[💻 Local Machine]
        NPM[📦 NPM/Yarn]
        DB[🗄️ Local Database]
        API[🔌 Mock APIs]
    end

    subgraph "Development Tools"
        WB[📦 Webpack Dev Server]
        HT[🔥 Hot Reload]
        DT[🐛 Debug Tools]
        LT[🧪 Testing Framework]
    end

    subgraph "Version Control"
        GIT[📚 Git Repository]
        CI[🔄 CI Pipeline]
        CD[🚀 CD Pipeline]
        REG[📦 Package Registry]
    end

    LD --> NPM
    NPM --> DB
    NPM --> API

    WB --> HT
    HT --> DT
    DT --> LT

    GIT --> CI
    CI --> CD
    CD --> REG
```

### Production Environment

```mermaid
graph TD
    subgraph "Infrastructure"
        CDN[🌐 Content Delivery Network]
        LB[⚖️ Load Balancer]
        WS[🖥️ Web Servers]
        AS[🖥️ Application Servers]
        DB[🗄️ Database Cluster]
        CS[☁️ Cloud Storage]
    end

    subgraph "Monitoring & Logging"
        APM[📊 Application Monitoring]
        EL[📝 Error Logging]
        PL[📈 Performance Logging]
        AL[📋 Access Logging]
        MT[📊 Metrics Collection]
    end

    subgraph "Security"
        WAF[🛡️ Web Application Firewall]
        IDS[🚨 Intrusion Detection]
        SSL[🔒 SSL Termination]
        BK[💾 Backup Systems]
    end

    subgraph "Scaling"
        AC[⚡ Auto Scaling]
        CC[☁️ Cloud Resources]
        CD[📦 Container Orchestration]
        LB[⚖️ Load Distribution]
    end

    CDN --> LB
    LB --> WS
    WS --> AS
    AS --> DB
    AS --> CS

    WS --> APM
    AS --> EL
    DB --> PL
    CS --> AL
    CDN --> MT

    WAF --> CDN
    IDS --> WS
    SSL --> LB
    BK --> DB

    AC --> CC
    CC --> CD
    CD --> LB
```

---

## 📈 **Monitoring & Observability**

### System Health Monitoring

```mermaid
graph TD
    subgraph "Application Metrics"
        APM[📊 Application Performance]
        UPM[👥 User Experience Metrics]
        BPM[🔄 Business Process Metrics]
        SPM[💾 System Performance Metrics]
    end

    subgraph "Infrastructure Monitoring"
        SIM[🖥️ Server Infrastructure]
        NIM[🌐 Network Infrastructure]
        DIM[🗄️ Database Infrastructure]
        CIM[☁️ Cloud Infrastructure]
    end

    subgraph "Logging & Alerting"
        ALE[📝 Application Logs]
        SLE[📝 System Logs]
        EAE[🚨 Error Alerts]
        PAE[⚠️ Performance Alerts]
    end

    subgraph "Analytics & Reporting"
        UAA[📊 Usage Analytics]
        PEA[📊 Performance Analytics]
        BEA[📊 Business Analytics]
        SEA[📊 Security Analytics]
    end

    APM --> ALE
    UPM --> ALE
    BPM --> ALE
    SPM --> ALE

    SIM --> SLE
    NIM --> SLE
    DIM --> SLE
    CIM --> SLE

    ALE --> EAE
    SLE --> PAE
    EAE --> UAA
    PAE --> PEA

    UAA --> BEA
    PEA --> BEA
    BEA --> SEA
```

### Incident Response Architecture

```mermaid
graph TD
    subgraph "Detection"
        MA[📊 Monitoring Alerts]
        LA[📝 Log Analysis]
        UA[👤 User Reports]
        SA[🤖 Automated Scanning]
    end

    subgraph "Assessment"
        IA[🔍 Incident Analysis]
        IP[📋 Impact Assessment]
        IR[🏷️ Incident Classification]
        UP[⏰ Urgency Priority]
    end

    subgraph "Response"
        IRP[📋 Incident Response Plan]
        TE[👥 Team Escalation]
        CA[🔧 Containment Actions]
        RA[🔄 Recovery Actions]
    end

    subgraph "Post-Incident"
        RCA[🔍 Root Cause Analysis]
        LUP[📚 Lessons Learned]
        IPU[🔧 Process Updates]
        REP[📊 Incident Report]
    end

    MA --> IA
    LA --> IA
    UA --> IA
    SA --> IA

    IA --> IP
    IP --> IR
    IR --> UP

    UP --> IRP
    IRP --> TE
    TE --> CA
    CA --> RA

    RA --> RCA
    RCA --> LUP
    LUP --> IPU
    IPU --> REP
```

---

## 🎯 **Architecture Principles**

### Design Principles
1. **Modular Architecture**: Independent, swappable components
2. **Event-Driven Design**: Asynchronous communication patterns
3. **Progressive Enhancement**: Core functionality without JavaScript
4. **Mobile-First Design**: Responsive across all device types
5. **Accessibility First**: WCAG 2.1 AA compliance

### Performance Principles
1. **Lazy Loading**: Components and data loaded on demand
2. **Caching Strategy**: Multi-layer caching for optimal performance
3. **Progressive Rendering**: Content appears incrementally
4. **Resource Optimization**: Minimize bundle sizes and network requests
5. **Background Processing**: Non-blocking operations

### Security Principles
1. **Defense in Depth**: Multiple security layers
2. **Zero Trust Architecture**: Verify all access requests
3. **Data Minimization**: Collect only necessary data
4. **Privacy by Design**: Privacy considerations in all features
5. **Secure by Default**: Secure configurations enabled by default

### Scalability Principles
1. **Horizontal Scaling**: Add more instances as needed
2. **Stateless Design**: No server-side session state
3. **Microservices Ready**: Components can be independently scaled
4. **Cloud-Native**: Designed for cloud deployment
5. **Resource Efficiency**: Optimal resource utilization

---

This architecture provides a robust, scalable, and maintainable foundation for the DHIS2 AI Suite, enabling sophisticated conversational AI interactions with health data systems while maintaining high performance, security, and user experience standards.
