import { z } from 'zod';

// Base schemas for common fields
export const BaseMetadataSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name is required"),
  displayName: z.string().min(1, "Display name is required"),
  shortName: z.string().min(1, "Short name is required"),
  code: z.string().optional(),
  description: z.string().optional(),
});

export const BaseIdentifiableSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  shortName: z.string(),
  code: z.string().optional(),
});

// DataElement Schema
export const DataElementSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  shortName: z.string().min(1),
  code: z.string().optional(),
  valueType: z.enum([
    'NUMBER', 'INTEGER', 'POSITIVE_INT', 'NEGATIVE_INT', 'ZERO_OR_POSITIVE_INT',
    'TEXT', 'LONG_TEXT', 'LETTER', 'PHONE_NUMBER', 'EMAIL', 'BOOLEAN', 'TRUE_ONLY',
    'DATE', 'DATETIME', 'TIME', 'URL', 'FILE_RESOURCE', 'IMAGE', 'COORDINATE',
    'ORGANISATION_UNIT', 'REFERENCE', 'AGE', 'USERNAME', 'TRACKER_ASSOCIATE'
  ]),
  domainType: z.enum(['AGGREGATE', 'TRACKER']),
  aggregationType: z.enum([
    'SUM', 'AVERAGE', 'AVERAGE_SUM_ORG_UNIT', 'COUNT', 'STDDEV', 'VARIANCE',
    'MIN', 'MAX', 'NONE', 'CUSTOM', 'DEFAULT'
  ]),
  categoryCombo: z.object({ id: z.string() }).optional(),
  zeroIsSignificant: z.boolean().optional(),
  url: z.url().optional(),
  description: z.string().optional(),
});

// OrganisationUnit Schema
export const OrganisationUnitSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  shortName: z.string().min(1),
  code: z.string().optional(),
  level: z.number().int().min(1),
  path: z.string().min(1),
});

// Category Schema
export const CategoryOptionSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  shortName: z.string().min(1),
  code: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const CategorySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  shortName: z.string().min(1),
  code: z.string().optional(),
  dataDimension: z.boolean(),
  dataDimensionType: z.enum(['DISAGGREGATION', 'ATTRIBUTE']),
  categoryOptions: z.array(CategoryOptionSchema),
});

// CategoryCombo Schema
export const CategoryOptionComboSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  code: z.string().optional(),
  categoryOptions: z.array(z.object({ id: z.string() })),
  categoryCombo: z.object({ id: z.string() }),
});

export const CategoryComboSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  shortName: z.string().min(1),
  code: z.string().optional(),
  dataDimensionType: z.enum(['DISAGGREGATION', 'ATTRIBUTE']),
  categories: z.array(z.object({ id: z.string() })),
  categoryOptionCombos: z.array(CategoryOptionComboSchema).optional(),
});

// DataSet Schema
export const DataSetElementSchema = z.object({
  dataElement: z.object({ id: z.string() }),
  categoryCombo: z.object({ id: z.string() }).optional(),
});

export const SectionSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  sortOrder: z.number().int().min(1),
  dataElements: z.array(z.object({ id: z.string() })),
  categoryCombo: z.object({ id: z.string() }).optional(),
  greyedFields: z.array(z.object({
    dataElement: z.object({ id: z.string() }),
    categoryOptionCombo: z.object({ id: z.string() }).optional(),
  })).optional(),
});

export const DataElementOperandSchema = z.object({
  dataElement: z.object({ id: z.string() }),
  categoryOptionCombo: z.object({ id: z.string() }).optional(),
});

export const DataValueSchema = z.object({
  dataElement: z.string(),
  period: z.string(),
  orgUnit: z.string(),
  categoryOptionCombo: z.string().optional(),
  attributeOptionCombo: z.string().optional(),
  value: z.string(),
  storedBy: z.string().optional(),
  created: z.string().optional(),
  lastUpdated: z.string().optional(),
  comment: z.string().optional(),
  followup: z.boolean().optional(),
});

export const DataEntryFormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  htmlCode: z.string().min(1),
  format: z.number().int().min(1),
  style: z.enum(['COMFORTABLE', 'NORMAL', 'COMPACT', 'NONE']),
});

export const DataSetSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  shortName: z.string().min(1),
  code: z.string().optional(),
  description: z.string().optional(),
  periodType: z.enum([
    'Daily', 'Weekly', 'Monthly', 'Quarterly', 'SixMonthly', 'Yearly',
    'FinancialApril', 'FinancialJuly', 'FinancialOct'
  ]),
  categoryCombo: z.object({ id: z.string() }).optional(),
  dataSetElements: z.array(DataSetElementSchema),
  organisationUnits: z.array(z.object({ id: z.string() })),
  sections: z.array(SectionSchema).optional(),
  compulsoryDataElementOperands: z.array(DataElementOperandSchema).optional(),
  expiryDays: z.number().int().min(1).optional(),
  timelyDays: z.number().int().min(1).optional(),
  openFuturePeriods: z.number().int().min(0).optional(),
  dataEntryForm: DataEntryFormSchema.optional(),
});

// Organisation Unit Group Schemas
export const OrganisationUnitGroupSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  shortName: z.string().min(1),
  code: z.string().optional(),
  organisationUnits: z.array(z.object({ id: z.string() })),
  symbol: z.string().optional(),
});

export const OrganisationUnitGroupSetSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  shortName: z.string().min(1),
  code: z.string().optional(),
  description: z.string().optional(),
  compulsory: z.boolean(),
  dataDimension: z.boolean(),
  organisationUnitGroups: z.array(z.object({ id: z.string() })),
});

// Validation Rule Schema
export const ExpressionSchema = z.object({
  expression: z.string().min(1),
  description: z.string().optional(),
  missingValueStrategy: z.enum(['SKIP_IF_ANY_VALUE_MISSING', 'SKIP_IF_ALL_VALUES_MISSING', 'NEVER_SKIP']),
});

export const ValidationRuleSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().optional(),
  instruction: z.string().optional(),
  importance: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  operator: z.enum([
    'equal_to', 'not_equal_to', 'greater_than', 'greater_than_or_equal_to',
    'less_than', 'less_than_or_equal_to', 'compulsory_pair', 'exclusive_pair'
  ]),
  leftSide: ExpressionSchema,
  rightSide: ExpressionSchema,
  periodType: z.string().min(1),
  organisationUnitLevels: z.array(z.number().int().min(1)),
});

export const ValidationResultSchema = z.object({
  validationRule: z.object({ id: z.string() }),
  period: z.string(),
  organisationUnit: z.object({ id: z.string() }),
  dayInPeriod: z.number().int(),
  leftSideValue: z.number(),
  rightSideValue: z.number(),
});

export const TrackedEntityAttributeSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  shortName: z.string().min(1),
  code: z.string().optional(),
  description: z.string().optional(),
  valueType: z.string().min(1),
  unique: z.boolean(),
  inherit: z.boolean(),
  optionSet: z.object({ id: z.string() }).optional(),
  pattern: z.string().optional(),
  confidential: z.boolean().optional(),
});

export const TrackedEntityTypeAttributeSchema = z.object({
  id: z.string().optional(),
  trackedEntityAttribute: z.object({ id: z.string() }),
  displayInList: z.boolean(),
  mandatory: z.boolean(),
  searchable: z.boolean(),
  sortOrder: z.number().int().min(0),
});

// Program Schema
export const TrackedEntityTypeSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  shortName: z.string().min(1),
  code: z.string().optional(),
  description: z.string().optional(),
  trackedEntityTypeAttributes: z.array(TrackedEntityTypeAttributeSchema),
  allowAuditLog: z.boolean().optional(),
  minAttributesRequiredToSearch: z.number().int().min(0).optional(),
  maxTeiCountToReturn: z.number().int().min(1).optional(),
});

export const OptionSetSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  code: z.string().optional(),
  options: z.array(z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    displayName: z.string().min(1),
    code: z.string().min(1),
    sortOrder: z.number().int().min(1),
  })),
  valueType: z.string().min(1),
});

export const OptionSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  code: z.string().min(1),
  sortOrder: z.number().int().min(1),
});

// Program Stage Schema
export const ProgramStageDataElementSchema = z.object({
  id: z.string().optional(),
  dataElement: z.object({ id: z.string() }),
  programStage: z.object({ id: z.string() }),
  compulsory: z.boolean(),
  allowProvidedElsewhere: z.boolean(),
  sortOrder: z.number().int().min(1),
  displayInReports: z.boolean(),
  allowFutureDate: z.boolean(),
  skipSynchronization: z.boolean(),
});

export const ProgramStageSectionSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  sortOrder: z.number().int().min(1),
  programStage: z.object({ id: z.string() }),
  dataElements: z.array(z.object({ id: z.string() })),
  programIndicators: z.array(z.object({ id: z.string() })).optional(),
});

export const ProgramStageSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  shortName: z.string().min(1),
  code: z.string().optional(),
  description: z.string().optional(),
  program: z.object({ id: z.string() }),
  sortOrder: z.number().int().min(1),
  repeatable: z.boolean(),
  minDaysFromStart: z.number().int().min(0),
  generatedByEnrollmentDate: z.boolean(),
  blockEntryForm: z.boolean(),
  reportDateToUse: z.string().min(1),
  programStageDataElements: z.array(ProgramStageDataElementSchema),
  programStageSections: z.array(ProgramStageSectionSchema).optional(),
  validationStrategy: z.enum(['ON_COMPLETE', 'ON_UPDATE_AND_INSERT']),
  executionDateLabel: z.string().optional(),
  dueDateLabel: z.string().optional(),
  allowGenerateNextVisit: z.boolean(),
  openAfterEnrollment: z.boolean(),
  remindCompleted: z.boolean(),
});

// Program Rule Schema
export const ProgramRuleActionSchema = z.object({
  id: z.string().optional(),
  programRuleActionType: z.enum([
    'DISPLAYTEXT', 'DISPLAYKEYVALUEPAIR', 'HIDEFIELD', 'HIDESECTION',
    'HIDEPROGRAM', 'ASSIGN', 'SHOWWARNING', 'SHOWERROR',
    'WARNINGONFIELDINTERACTION', 'ERRORONFIELDINTERACTION',
    'CREATEEVENT', 'SETMANDATORYFIELD', 'SENDMESSAGE', 'SCHEDULEMESSAGE'
  ]),
  dataElement: z.object({ id: z.string() }).optional(),
  trackedEntityAttribute: z.object({ id: z.string() }).optional(),
  programStageSection: z.object({ id: z.string() }).optional(),
  programStage: z.object({ id: z.string() }).optional(),
  data: z.string().optional(),
  content: z.string().optional(),
  location: z.string().optional(),
});

export const ProgramRuleSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().optional(),
  program: z.object({ id: z.string() }),
  programStage: z.object({ id: z.string() }).optional(),
  condition: z.string().min(1),
  priority: z.number().int().min(1).optional(),
  programRuleActions: z.array(ProgramRuleActionSchema),
});

export const ProgramRuleVariableSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  program: z.object({ id: z.string() }),
  programStage: z.object({ id: z.string() }).optional(),
  dataElement: z.object({ id: z.string() }).optional(),
  trackedEntityAttribute: z.object({ id: z.string() }).optional(),
  sourceType: z.enum(['DATAELEMENT_NEWEST_EVENT_PROGRAM_STAGE', 'DATAELEMENT_NEWEST_EVENT_PROGRAM', 'DATAELEMENT_CURRENT_EVENT', 'DATAELEMENT_PREVIOUS_EVENT', 'CALCULATED_VALUE', 'TEI_ATTRIBUTE']),
});

// Program Indicator Schema
export const ProgramIndicatorSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  shortName: z.string().min(1),
  code: z.string().optional(),
  description: z.string().optional(),
  program: z.object({ id: z.string() }),
  expression: z.string().min(1),
  filter: z.string().optional(),
  aggregationType: z.string().min(1),
  analyticsType: z.enum(['EVENT', 'ENROLLMENT']),
  displayInForm: z.boolean(),
});

export const ProgramDataElementSchema = z.object({
  id: z.string().optional(),
  dataElement: z.object({ id: z.string() }),
  program: z.object({ id: z.string() }),
});

export const ProgramAttributeSchema = z.object({
  id: z.string().optional(),
  trackedEntityAttribute: z.object({ id: z.string() }),
  program: z.object({ id: z.string() }),
});

export const AnalyticsQuerySchema = z.object({
  dimension: z.string().optional(),
  filter: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  aggregationType: z.string().optional(),
  measureCriteria: z.string().optional(),
  preAggregationMeasureCriteria: z.string().optional(),
  skipMeta: z.boolean().optional(),
  skipData: z.boolean().optional(),
  skipRounding: z.boolean().optional(),
  hierarchyMeta: z.boolean().optional(),
  ignoreLimit: z.boolean().optional(),
  tableLayout: z.boolean().optional(),
  columns: z.string().optional(),
  rows: z.string().optional(),
  includeNumDen: z.boolean().optional(),
});

// Indicator Schema
export const IndicatorTypeSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  factor: z.number(),
  number: z.boolean(),
});

export const IndicatorSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  shortName: z.string().min(1),
  code: z.string().optional(),
  description: z.string().optional(),
  numerator: z.string().min(1),
  denominator: z.string().min(1),
  indicatorType: z.object({ id: z.string() }),
  decimals: z.number().int().min(0).optional(),
  annualized: z.boolean(),
});

// Visualization Schema
export const DataDimensionItemSchema = z.object({
  id: z.string().optional(),
  dataDimensionItemType: z.enum([
    'DATA_ELEMENT', 'DATA_ELEMENT_OPERAND', 'INDICATOR', 'REPORTING_RATE',
    'PROGRAM_DATA_ELEMENT', 'PROGRAM_ATTRIBUTE', 'PROGRAM_INDICATOR'
  ]),
  dataElement: z.object({ id: z.string() }).optional(),
  indicator: z.object({ id: z.string() }).optional(),
  programDataElement: z.object({ id: z.string() }).optional(),
  programAttribute: z.object({ id: z.string() }).optional(),
  programIndicator: z.object({ id: z.string() }).optional(),
});

export const DimensionItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  dimensionType: z.string().min(1),
  items: z.array(z.any()).optional(), // Self-referential, using z.any to avoid circular reference issues
});

export const PeriodSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  periodType: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});

// Tracker Schemas
export const CoordinateSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
});

export const NoteSchema = z.object({
  id: z.string(),
  noteText: z.string(),
  storedDate: z.string(),
  storedBy: z.string(),
});

export const RelationshipTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  fromToName: z.string(),
  toFromName: z.string(),
  bidirectional: z.boolean(),
});

export const RelationshipItemSchema = z.lazy(() => z.object({
  trackedEntityInstance: z.lazy(() => TrackedEntityInstanceSchema).optional(),
  enrollment: z.lazy(() => EnrollmentSchema).optional(),
  event: z.lazy(() => EventSchema).optional(),
}));

export const RelationshipSchema = z.object({
  id: z.string(),
  relationshipType: z.object({ id: z.string() }),
  from: RelationshipItemSchema,
  to: RelationshipItemSchema,
  created: z.string(),
  lastUpdated: z.string(),
});

export const TrackedEntityInstanceSchema = z.object({
  id: z.string(),
  trackedEntityType: z.string(),
  orgUnit: z.string(),
  attributes: z.array(z.object({
    attribute: z.string(),
    value: z.string(),
    displayValue: z.string().optional(),
    created: z.string().optional(),
    lastUpdated: z.string().optional(),
    storedBy: z.string().optional(),
  })),
  enrollments: z.array(z.lazy(() => EnrollmentSchema)).optional(),
  relationships: z.array(z.lazy(() => RelationshipSchema)).optional(),
  inactive: z.boolean(),
  deleted: z.boolean(),
  potentialDuplicate: z.boolean(),
  created: z.string(),
  lastUpdated: z.string(),
});

export const EnrollmentSchema = z.object({
  id: z.string(),
  trackedEntityInstance: z.string(),
  program: z.string(),
  orgUnit: z.string(),
  enrollmentDate: z.string(),
  incidentDate: z.string(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']),
  events: z.array(z.lazy(() => EventSchema)).optional(),
  attributes: z.array(z.object({
    attribute: z.string(),
    value: z.string(),
    displayValue: z.string().optional(),
    created: z.string().optional(),
    lastUpdated: z.string().optional(),
    storedBy: z.string().optional(),
  })).optional(),
  notes: z.array(z.object({
    id: z.string(),
    noteText: z.string(),
    storedDate: z.string(),
    storedBy: z.string(),
  })).optional(),
  followup: z.boolean(),
  deleted: z.boolean(),
  created: z.string(),
  lastUpdated: z.string(),
});

export const EventSchema = z.object({
  id: z.string(),
  enrollment: z.string().optional(),
  program: z.string(),
  programStage: z.string(),
  orgUnit: z.string(),
  trackedEntityInstance: z.string().optional(),
  status: z.enum(['ACTIVE', 'COMPLETED', 'VISITED', 'SCHEDULE', 'OVERDUE', 'SKIPPED']),
  eventDate: z.string().optional(),
  dueDate: z.string().optional(),
  coordinate: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }).optional(),
  dataValues: z.array(DataValueSchema),
  notes: z.array(z.object({
    id: z.string(),
    noteText: z.string(),
    storedDate: z.string(),
    storedBy: z.string(),
  })).optional(),
  followup: z.boolean(),
  deleted: z.boolean(),
  created: z.string(),
  lastUpdated: z.string(),
});

export const VisualizationSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  type: z.enum([
    'COLUMN', 'STACKED_COLUMN', 'BAR', 'STACKED_BAR', 'LINE', 'AREA',
    'STACKED_AREA', 'PIE', 'RADAR', 'GAUGE', 'YEAR_OVER_YEAR_LINE',
    'YEAR_OVER_YEAR_COLUMN', 'SINGLE_VALUE', 'PIVOT_TABLE', 'SCATTER', 'BUBBLE'
  ]),
  dataDimensionItems: z.array(DataDimensionItemSchema),
  columns: z.array(DimensionItemSchema),
  rows: z.array(DimensionItemSchema),
  filters: z.array(DimensionItemSchema),
  organisationUnits: z.array(z.object({ id: z.string() })),
  periods: z.array(PeriodSchema),
  created: z.string().optional(),
  lastUpdated: z.string().optional(),
});

// Dashboard Schema
export const MapViewSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  layer: z.string().min(1),
  organisationUnitGroupSet: z.object({ id: z.string() }).optional(),
  organisationUnits: z.array(z.object({ id: z.string() })),
  periods: z.array(z.object({ id: z.string() })),
});

export const MapSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  mapViews: z.array(MapViewSchema),
});

export const ReportTableSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  columns: z.array(DimensionItemSchema),
  rows: z.array(DimensionItemSchema),
  filters: z.array(DimensionItemSchema),
});

export const ChartSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  type: z.string().min(1),
  series: z.array(DimensionItemSchema),
  category: z.array(DimensionItemSchema),
  filter: z.array(DimensionItemSchema),
});

export const ReportSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  type: z.enum(['JASPER_REPORT_TABLE', 'JASPER_JDBC']),
  designContent: z.string().min(1),
  cacheStrategy: z.enum(['NO_CACHE', 'CACHE_1_HOUR', 'CACHE_TWO_WEEKS', 'CACHE_6AM_TOMORROW']),
});

export const DashboardItemSchema = z.object({
  id: z.string().optional(),
  type: z.enum([
    'VISUALIZATION', 'MAP', 'CHART', 'REPORT_TABLE', 'EVENT_CHART',
    'EVENT_REPORT', 'TEXT', 'MESSAGES', 'RESOURCES', 'REPORTS',
    'USERS', 'REPORT_TABLES', 'CHARTS', 'MAPS'
  ]),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  visualization: z.object({ id: z.string() }).optional(),
  map: z.object({ id: z.string() }).optional(),
  reportTable: z.object({ id: z.string() }).optional(),
  chart: z.object({ id: z.string() }).optional(),
  text: z.string().optional(),
});

export const UserSchema = z.object({
  id: z.string().optional(),
  username: z.string().min(1),
  firstName: z.string().min(1),
  surname: z.string().min(1),
  email: z.string().email().optional(),
  phoneNumber: z.string().optional(),
  organisationUnits: z.array(z.object({ id: z.string() })),
  userCredentials: z.object({ id: z.string() }),
});

export const UserCredentialsSchema = z.object({
  id: z.string().optional(),
  username: z.string().min(1),
  disabled: z.boolean(),
  twoFA: z.boolean(),
  externalAuth: z.boolean(),
  userRoles: z.array(z.object({ id: z.string() })),
});

export const UserRoleSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().optional(),
  authorities: z.array(z.string()),
});

export const UserAccessSchema = z.object({
  id: z.string().optional(),
  displayName: z.string().min(1),
  access: z.string().min(1),
});

export const UserGroupAccessSchema = z.object({
  id: z.string().optional(),
  displayName: z.string().min(1),
  access: z.string().min(1),
});

export const DashboardSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().optional(),
  dashboardItems: z.array(DashboardItemSchema),
  created: z.string().optional(),
  lastUpdated: z.string().optional(),
  user: z.object({ id: z.string() }),
  publicAccess: z.string().min(1),
  externalAccess: z.boolean(),
  userAccesses: z.array(z.object({ id: z.string(), displayName: z.string(), access: z.string() })),
  userGroupAccesses: z.array(z.object({ id: z.string(), displayName: z.string(), access: z.string() })),
});

// Program Schema (main)
export const ProgramSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  displayName: z.string().min(1),
  shortName: z.string().min(1),
  code: z.string().optional(),
  description: z.string().optional(),
  version: z.number().int().min(1).optional(),
  programType: z.enum(['WITH_REGISTRATION', 'WITHOUT_REGISTRATION']),
  trackedEntityType: z.object({ id: z.string() }).optional(),
  programStages: z.array(z.object({ id: z.string() })),
  programRules: z.array(z.object({ id: z.string() })).optional(),
  programIndicators: z.array(z.object({ id: z.string() })).optional(),
  organisationUnits: z.array(z.object({ id: z.string() })),
  categoryCombo: z.object({ id: z.string() }).optional(),
  useFirstStageDuringRegistration: z.boolean().optional(),
  displayFrontPageList: z.boolean().optional(),
  onlyEnrollOnce: z.boolean().optional(),
  selectEnrollmentDatesInFuture: z.boolean().optional(),
  selectIncidentDatesInFuture: z.boolean().optional(),
  incidentDateLabel: z.string().optional(),
  enrollmentDateLabel: z.string().optional(),
});

// Export all schemas for use in tools
export const Dhis2Schemas = {
  DataElement: DataElementSchema,
  OrganisationUnit: OrganisationUnitSchema,
  Category: CategorySchema,
  CategoryCombo: CategoryComboSchema,
  CategoryOption: CategoryOptionSchema,
  CategoryOptionCombo: CategoryOptionComboSchema,
  DataSet: DataSetSchema,
  DataSetElement: DataSetElementSchema,
  Section: SectionSchema,
  DataElementOperand: DataElementOperandSchema,
  DataEntryForm: DataEntryFormSchema,
  OrganisationUnitGroup: OrganisationUnitGroupSchema,
  OrganisationUnitGroupSet: OrganisationUnitGroupSetSchema,
  ValidationRule: ValidationRuleSchema,
  Expression: ExpressionSchema,
  ValidationResult: ValidationResultSchema,
  Program: ProgramSchema,
  TrackedEntityType: TrackedEntityTypeSchema,
  TrackedEntityTypeAttribute: TrackedEntityTypeAttributeSchema,
  TrackedEntityAttribute: TrackedEntityAttributeSchema,
  OptionSet: OptionSetSchema,
  Option: OptionSchema,
  ProgramStage: ProgramStageSchema,
  ProgramStageDataElement: ProgramStageDataElementSchema,
  ProgramStageSection: ProgramStageSectionSchema,
  ProgramRule: ProgramRuleSchema,
  ProgramRuleAction: ProgramRuleActionSchema,
  ProgramRuleVariable: ProgramRuleVariableSchema,
  ProgramIndicator: ProgramIndicatorSchema,
  ProgramDataElement: ProgramDataElementSchema,
  ProgramAttribute: ProgramAttributeSchema,
  Indicator: IndicatorSchema,
  IndicatorType: IndicatorTypeSchema,
  Visualization: VisualizationSchema,
  DataDimensionItem: DataDimensionItemSchema,
  DimensionItem: DimensionItemSchema,
  Period: PeriodSchema,
  Dashboard: DashboardSchema,
  DashboardItem: DashboardItemSchema,
  Map: MapSchema,
  MapView: MapViewSchema,
  ReportTable: ReportTableSchema,
  Chart: ChartSchema,
  Report: ReportSchema,
  User: UserSchema,
  UserCredentials: UserCredentialsSchema,
  UserRole: UserRoleSchema,
  UserAccess: UserAccessSchema,
  UserGroupAccess: UserGroupAccessSchema,
  DataValue: DataValueSchema,
  Coordinate: CoordinateSchema,
  Note: NoteSchema,
  Relationship: RelationshipSchema,
  RelationshipType: RelationshipTypeSchema,
  RelationshipItem: RelationshipItemSchema,
  TrackedEntityInstance: TrackedEntityInstanceSchema,
  Enrollment: EnrollmentSchema,
  Event: EventSchema,
  AnalyticsQuery: AnalyticsQuerySchema,
};
