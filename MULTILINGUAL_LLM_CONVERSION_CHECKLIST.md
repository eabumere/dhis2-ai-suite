# Multilingual LLM-Based Classification System Conversion

## Overview
This checklist tracks the conversion of hardcoded English keyword-based classification systems to LLM-based multilingual classification throughout the DHIS2 AI Suite codebase.

## Completed ✅
- [x] Audit codebase for keyword-based classifications (7 major areas identified)
- [x] Implement LLM caching system with ChatModels integration
- [x] Convert conversation context summary methods to structured format
- [x] Remove keyword fallbacks from conversation context

## Phase 1: Core Infrastructure ✅
- [x] LLM Model Integration (ChatModels import and initialization)
- [x] Intelligent Caching System (30-minute TTL, input-based hashing)
- [x] Structured Summaries (language-agnostic key=value format)
- [x] Fallback Management (proper error handling for LLM unavailability)

## Phase 2: Agent-Level Conversions 🔄

### 2.1 Router Agent Intent Classification
- [x] Create centralized LLM classification service
- [x] Implement LLM-based intent classification in router agent
- [x] Replace keyword-based user selection options with LLM suggestions
- [x] Update clarification service integration for multilingual support
- [ ] Test intent classification accuracy across languages
- [ ] Performance benchmark vs keyword approach

### 2.2 Analytics Graph Agent Query Understanding
- [x] Implement LLM-based query analysis method
- [x] Replace hardcoded 'selected metadata' pattern matching
- [x] Add semantic understanding of analytics requests
- [x] Support for complex multi-language analytics queries
- [ ] Validate against existing test cases

### 2.3 CRUD Agent Operation Detection
- [x] Create LLM-based operation complexity analysis
- [x] Replace English conjunction pattern matching ('and', 'with', 'including')
- [x] Add semantic understanding of CRUD operations in multiple languages
- [x] Support for complex multi-operation requests
- [ ] Test with various language patterns

### 2.4 Routed Data Entry Agent Intent Classification
- [x] Implement LLM-based data entry intent detection
- [x] Replace hardcoded intent arrays with dynamic LLM classification
- [x] Add support for multilingual data entry requests
- [ ] Validate intent routing accuracy

## Phase 3: Component-Level Conversions ⏳

### 3.1 MessageRenderer Column Type Detection
- [x] Create LLM-based column type inference service
- [x] Replace hardcoded English column patterns:
  - 'dataelement'/'data_element' → DataElement
  - 'orgunit'/'org_unit' → OrgUnit
  - 'period' → Period
  - 'categoryoption' → CategoryOption
  - 'attributeoption' → AttributeOption
  - 'value' → Value
- [x] Add confidence scoring for column type detection
- [ ] Support for custom/unknown column types

### 3.2 Aggregate Data Agent CSV Processing
- [x] Implement LLM-based CSV header analysis
- [x] Replace hardcoded 'value' column detection
- [x] Add semantic understanding of DHIS2 data structures
- [x] Support for multilingual CSV headers
- [x] Improve column mapping accuracy

## Phase 4: Utility-Level Conversions ⏳

### 4.1 Workflow Orchestrator Error Classification
- [x] Create LLM-based error analysis service
- [x] Replace hardcoded English error patterns:
  - 'not found'/'does not exist' → Resource errors
  - 'unauthorized'/'authentication' → Auth errors
  - 'network'/'connection' → Connectivity errors
  - 'invalid format'/'validation' → Input errors
- [x] Add error severity and category classification
- [x] Support for multilingual error messages

### 4.2 Clarification Service Parameter Detection
- [x] Implement LLM-based required parameter detection
- [x] Replace hardcoded English parameter checking
- [x] Add semantic understanding of missing requirements
- [x] Support for multilingual parameter names

## Phase 5: Performance & Quality Assurance 🔧

### 5.1 Performance Optimization
- [x] Implement shared LLM cache across all classification services
- [x] Add batch processing for multiple similar requests
- [x] Optimize LLM prompt sizes and response parsing
- [x] Monitor and tune cache hit rates

### 5.2 Multilingual Testing
- [ ] Create test suites for supported languages:
  - English (baseline)
  - French
  - Spanish
  - Arabic
  - Portuguese
- [ ] Validate classification accuracy across languages
- [ ] Test edge cases and ambiguous inputs
- [ ] Performance comparison vs keyword approach

### 5.3 Fallback Reliability
- [ ] Implement graceful degradation when LLM unavailable
- [ ] Test offline/fallback scenarios
- [ ] Ensure backward compatibility during transition
- [ ] Monitor fallback usage rates

## Implementation Notes

### LLM Service Architecture
```typescript
// Centralized service - now implemented
export class LLMClassificationService {
    // Intent classification
    async classifyIntent(query: string, context?: any): Promise<IntentClassification>;

    // Column type detection
    async detectColumnType(header: string, context?: any): Promise<ColumnTypeAnalysis>;

    // Query analysis
    async analyzeQuery(query: string, context?: any): Promise<QueryAnalysis>;

    // Error classification
    async classifyError(error: any): Promise<ErrorClassification>;

    // Operation complexity
    async analyzeOperationComplexity(query: string): Promise<OperationAnalysis>;
}
```

### Migration Strategy
1. **Feature Flags**: Enable LLM classification alongside keyword fallback
2. **A/B Testing**: Compare accuracy and performance
3. **Gradual Rollout**: Start with high-confidence classifications
4. **Rollback Plan**: Ability to disable LLM features if issues arise

### Success Metrics
- **Accuracy**: >95% classification accuracy across languages
- **Performance**: <500ms average response time
- **Reliability**: <1% error rate with proper fallbacks
- **Coverage**: Support for 5+ major languages

## Dependencies
- [x] ChatModels integration ✅
- [x] LLM caching system ✅
- [ ] Centralized LLM service (Phase 2)
- [ ] Performance monitoring (Phase 5)
- [ ] Multilingual test data (Phase 5)

## Risk Mitigation
- **Fallback Strategy**: Keyword-based classification as safety net
- **Error Handling**: Comprehensive error catching and logging
- **Performance Monitoring**: Track LLM response times and cache hit rates
- **Gradual Deployment**: Feature flags for controlled rollout

## Timeline Estimate
- **Phase 1 (Infrastructure)**: ✅ Complete
- **Phase 2 (Agent Conversions)**: 2-3 weeks
- **Phase 3 (Component Conversions)**: 1-2 weeks
- **Phase 4 (Utility Conversions)**: 1 week
- **Phase 5 (Testing & Optimization)**: 1-2 weeks

---

*Last Updated: January 22, 2026*
*Status: Phase 1 Complete, Phase 2 In Progress*
