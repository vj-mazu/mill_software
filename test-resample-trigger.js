/**
 * Test file for Resample Trigger Button Logic
 * 
 * This tests the conditions for showing the "Trigger" button
 * in the Location Sample tab for PASS_WITH_COOKING resample entries.
 * 
 * The Trigger button should show when:
 * 1. Active tab is 'LOCATION_SAMPLE'
 * 2. Entry is a LOCATION_SAMPLE type
 * 3. User is admin/manager OR (staff user AND assigned collector)
 * 4. Entry has lotSelectionDecision = 'PASS_WITH_COOKING'
 * 5. Resample quality is NOT yet saved
 * 6. Workflow status is one of: STAFF_ENTRY, QUALITY_CHECK, FINAL_REPORT, LOT_ALLOTMENT
 */

// Mock entry data for testing
const mockEntries = {
  // Should show trigger button
  passWithCookingResample: {
    id: 1,
    entryType: 'LOCATION_SAMPLE',
    lotSelectionDecision: 'PASS_WITH_COOKING',
    workflowStatus: 'STAFF_ENTRY',
    sampleCollectedBy: 'supervisor1',
    qualityParameters: null,
    qualityAttemptDetails: [],
    qualityReportAttempts: 0,
    resampleCollectedTimeline: [{ name: 'supervisor1', date: '2026-03-20' }],
    resampleCollectedHistory: []
  },
  
  // Should NOT show trigger - FAIL entry (uses "Next >" instead)
  failResample: {
    id: 2,
    entryType: 'LOCATION_SAMPLE',
    lotSelectionDecision: 'FAIL',
    workflowStatus: 'STAFF_ENTRY',
    sampleCollectedBy: 'supervisor1',
    qualityParameters: null,
    qualityAttemptDetails: [],
    qualityReportAttempts: 0,
    resampleCollectedTimeline: [{ name: 'supervisor1', date: '2026-03-20' }],
    resampleCollectedHistory: []
  },
  
  // Should NOT show trigger - quality already saved
  passWithCookingQualitySaved: {
    id: 3,
    entryType: 'LOCATION_SAMPLE',
    lotSelectionDecision: 'PASS_WITH_COOKING',
    workflowStatus: 'LOT_SELECTION',
    sampleCollectedBy: 'supervisor1',
    qualityParameters: { moisture: 14, grainsCount: 144, cutting1: 1, cutting2: 4 },
    qualityAttemptDetails: [
      { attemptNo: 1, moisture: 14, grainsCount: 144 },
      { attemptNo: 2, moisture: 15, grainsCount: 150 }
    ],
    qualityReportAttempts: 2,
    resampleCollectedTimeline: [{ name: 'supervisor1', date: '2026-03-20' }],
    resampleCollectedHistory: []
  },
  
  // Should NOT show trigger - wrong workflow status
  passWithCookingWrongStatus: {
    id: 4,
    entryType: 'LOCATION_SAMPLE',
    lotSelectionDecision: 'PASS_WITH_COOKING',
    workflowStatus: 'COOKING_REPORT',
    sampleCollectedBy: 'supervisor1',
    qualityParameters: null,
    qualityAttemptDetails: [],
    qualityReportAttempts: 0,
    resampleCollectedTimeline: [{ name: 'supervisor1', date: '2026-03-20' }],
    resampleCollectedHistory: []
  },
  
  // Should NOT show trigger - not a location sample
  passWithCookingNotLocation: {
    id: 5,
    entryType: 'MILL_SAMPLE',
    lotSelectionDecision: 'PASS_WITH_COOKING',
    workflowStatus: 'STAFF_ENTRY',
    sampleCollectedBy: 'supervisor1',
    qualityParameters: null,
    qualityAttemptDetails: [],
    qualityReportAttempts: 0,
    resampleCollectedTimeline: [],
    resampleCollectedHistory: []
  }
};

// Helper functions (copied from SampleEntry.tsx logic)
const hasSampleBookReadySnapshot = (attempt) => {
  const isProvidedNumericValue = (rawVal, valueVal) => {
    const raw = rawVal !== null && rawVal !== undefined ? String(rawVal).trim() : '';
    if (raw !== '') return true;
    const num = Number(valueVal);
    return Number.isFinite(num) && num > 0;
  };
  const hasFullQualitySnapshot = (att) => (
    isProvidedNumericValue(att?.moistureRaw, att?.moisture)
    && isProvidedNumericValue(att?.grainsCountRaw, att?.grainsCount)
    && isProvidedNumericValue(att?.cutting1Raw, att?.cutting1)
    && isProvidedNumericValue(att?.cutting2Raw, att?.cutting2)
    && isProvidedNumericValue(att?.bend1Raw, att?.bend1)
    && isProvidedNumericValue(att?.bend2Raw, att?.bend2)
  );
  const hasAnyDetailedQuality = (att) => (
    isProvidedNumericValue(att?.cutting1Raw, att?.cutting1)
    || isProvidedNumericValue(att?.bend1Raw, att?.bend1)
  );
  
  return isProvidedNumericValue(attempt?.moistureRaw, attempt?.moisture)
    && isProvidedNumericValue(attempt?.grainsCountRaw, attempt?.grainsCount)
    && (hasFullQualitySnapshot(attempt) || !hasAnyDetailedQuality(attempt));
};

const getQualityAttemptsForEntry = (entry) => {
  const baseAttempts = Array.isArray(entry?.qualityAttemptDetails)
    ? [...entry.qualityAttemptDetails].filter(Boolean).sort((a, b) => (a.attemptNo || 0) - (b.attemptNo || 0))
    : [];
  if (baseAttempts.length > 0) {
    return baseAttempts.map((attempt, index) => ({
      ...attempt,
      attemptNo: Number(attempt?.attemptNo) || index + 1
    }));
  }
  const currentQuality = entry?.qualityParameters;
  if (!currentQuality) return [];
  return [{ ...currentQuality, attemptNo: 1 }];
};

const getResampleCollectorNames = (entry) => {
  const collectNames = (items) => items
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') return item.sampleCollectedBy || item.name || '';
      return '';
    })
    .map((value) => String(value || '').trim())
    .filter((value) => value && value.toLowerCase() !== 'broker office sample');

  const resampleTimeline = Array.isArray(entry?.resampleCollectedTimeline) ? entry.resampleCollectedTimeline : [];
  const resampleHistory = Array.isArray(entry?.resampleCollectedHistory) ? entry.resampleCollectedHistory : [];
  const names = [...collectNames(resampleTimeline), ...collectNames(resampleHistory)];
  return Array.from(new Set(names));
};

// Main logic to check if trigger button should show
const shouldShowTriggerButton = (entry, user, activeTab) => {
  const normalizedWorkflowStatus = String(entry.workflowStatus || '').toUpperCase();
  const qualityAttempts = getQualityAttemptsForEntry(entry);
  const latestQualityAttempt = qualityAttempts[qualityAttempts.length - 1] || null;
  const resampleAttempts = Math.max(0, qualityAttempts.length - 1);
  const hasResampleCollectorTimeline = getResampleCollectorNames(entry).length > 0;
  
  // Check if this is a paddy resample workflow
  const isPaddyResampleWorkflow =
    true // Not rice sample
    && (
      entry.lotSelectionDecision === 'FAIL'
      || entry.lotSelectionDecision === 'PASS_WITH_COOKING'
      || resampleAttempts > 0
      || hasResampleCollectorTimeline
    )
    && entry.workflowStatus !== 'FAILED';
  
  const resampleWorkflowMovedForward = !['STAFF_ENTRY', 'LOT_ALLOTMENT'].includes(normalizedWorkflowStatus);
  const resampleQualitySaved = isPaddyResampleWorkflow
    && resampleWorkflowMovedForward
    && qualityAttempts.length > 1
    && hasSampleBookReadySnapshot(latestQualityAttempt);
  
  const assignedResampleCollector = getResampleCollectorNames(entry).some((name) => {
    return String(name || '').trim().toLowerCase() === String(user?.username || '').trim().toLowerCase();
  });
  
  const isLocationSample = entry.entryType === 'LOCATION_SAMPLE';
  const isAssignedCollector = !!(entry.sampleCollectedBy && user?.username)
    && entry.sampleCollectedBy.trim().toLowerCase() === user.username.trim().toLowerCase();
  const canManageResampleTrigger = ['admin', 'manager', 'owner'].includes(String(user?.role || '').toLowerCase());
  const isStaffUser = ['staff', 'physical_supervisor', 'paddy_supervisor'].includes(String(user?.role || '').toLowerCase());
  
  // Trigger button ONLY for PASS_WITH_COOKING resample entries
  const isPassWithCookingResample = String(entry.lotSelectionDecision || '').toUpperCase() === 'PASS_WITH_COOKING'
    && isPaddyResampleWorkflow;
  
  const showLocationResampleTrigger = activeTab === 'LOCATION_SAMPLE'
    && isLocationSample
    && (canManageResampleTrigger || (isStaffUser && isAssignedCollector))
    && isPassWithCookingResample
    && !resampleQualitySaved
    && ['STAFF_ENTRY', 'QUALITY_CHECK', 'FINAL_REPORT', 'LOT_ALLOTMENT'].includes(normalizedWorkflowStatus);
  
  return {
    showTrigger: showLocationResampleTrigger,
    debug: {
      isPaddyResampleWorkflow,
      isPassWithCookingResample,
      resampleQualitySaved,
      isAssignedCollector,
      normalizedWorkflowStatus,
      qualityAttemptsCount: qualityAttempts.length,
      hasResampleCollectorTimeline,
      assignedResampleCollector
    }
  };
};

// Test cases
const runTests = () => {
  console.log('=== RESAMPLE TRIGGER BUTTON TESTS ===\n');
  
  const adminUser = { role: 'admin', username: 'admin' };
  const supervisorUser = { role: 'staff', username: 'supervisor1' };
  const otherUser = { role: 'staff', username: 'otheruser' };
  
  const testCases = [
    {
      name: 'PASS_WITH_COOKING resample - Admin user',
      entry: mockEntries.passWithCookingResample,
      user: adminUser,
      activeTab: 'LOCATION_SAMPLE',
      expected: true
    },
    {
      name: 'PASS_WITH_COOKING resample - Assigned supervisor',
      entry: mockEntries.passWithCookingResample,
      user: supervisorUser,
      activeTab: 'LOCATION_SAMPLE',
      expected: true
    },
    {
      name: 'PASS_WITH_COOKING resample - Other user (not assigned)',
      entry: mockEntries.passWithCookingResample,
      user: otherUser,
      activeTab: 'LOCATION_SAMPLE',
      expected: false
    },
    {
      name: 'FAIL resample - Should NOT show trigger',
      entry: mockEntries.failResample,
      user: adminUser,
      activeTab: 'LOCATION_SAMPLE',
      expected: false
    },
    {
      name: 'PASS_WITH_COOKING - Quality already saved',
      entry: mockEntries.passWithCookingQualitySaved,
      user: adminUser,
      activeTab: 'LOCATION_SAMPLE',
      expected: false
    },
    {
      name: 'PASS_WITH_COOKING - Wrong workflow status',
      entry: mockEntries.passWithCookingWrongStatus,
      user: adminUser,
      activeTab: 'LOCATION_SAMPLE',
      expected: false
    },
    {
      name: 'PASS_WITH_COOKING - Not location sample',
      entry: mockEntries.passWithCookingNotLocation,
      user: adminUser,
      activeTab: 'LOCATION_SAMPLE',
      expected: false
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach((testCase, index) => {
    const result = shouldShowTriggerButton(testCase.entry, testCase.user, testCase.activeTab);
    const success = result.showTrigger === testCase.expected;
    
    if (success) {
      passed++;
      console.log(`✅ TEST ${index + 1} PASSED: ${testCase.name}`);
    } else {
      failed++;
      console.log(`❌ TEST ${index + 1} FAILED: ${testCase.name}`);
      console.log(`   Expected: ${testCase.expected}, Got: ${result.showTrigger}`);
      console.log(`   Debug:`, result.debug);
    }
  });
  
  console.log(`\n=== TEST RESULTS ===`);
  console.log(`Passed: ${passed}/${testCases.length}`);
  console.log(`Failed: ${failed}/${testCases.length}`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed!');
  } else {
    console.log('\n⚠️  Some tests failed. Check the debug output above.');
  }
  
  return { passed, failed, total: testCases.length };
};

// Run tests
runTests();