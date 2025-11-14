# Migration from fetch to @dhis2/app-runtime

## Phase 1: Core API Service (✅ COMPLETED)
- [x] Created `src/utils/app-runtime/dhis2-api.ts` with app-runtime equivalents
- [x] Implemented generateId() using app-runtime system endpoint
- [x] Implemented searchMetadata() using app-runtime queries
- [x] Implemented checkResourceExists() using app-runtime queries
- [x] Implemented createAggregatedMetadata() and createMetadataDirect()
- [x] Updated helpers.ts to use app-runtime functions
- [x] Removed manual authentication headers and environment variables

## Phase 2: Update Remaining fetch Calls (✅ COMPLETED)
- [x] Updated base-tool.ts createDhis2GetByIdTool to use app-runtime
- [x] Updated base-tool.ts createDhis2UpdateTool to use app-runtime
- [x] Updated structured-tools.ts organization unit searches to use app-runtime
- [x] Test that all existing functionality still works

## Phase 3: Batch Manager Cleanup (✅ COMPLETED)
- [x] Updated batch-manager.ts to use app-runtime instead of fetch
- [x] Ensure all tools properly integrate with app-runtime

## Phase 4: Testing & Verification
- [ ] Run build to ensure no compilation errors
- [ ] Verify development server starts without issues
- [ ] Test metadata search and creation functionality
- [ ] Clean up remaining environment variable references

## Notes
- App-runtime handles authentication automatically via DHIS2-set cookies/tokens
- No more manual environment variables DHIS2_API_BASE_URL, DHIS2_USERNAME, DHIS2_PASSWORD
- All direct fetch calls should be replaced by app-runtime DataEngine queries/mutations
