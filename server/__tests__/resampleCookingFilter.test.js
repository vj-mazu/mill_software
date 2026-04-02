jest.mock('../repositories/SampleEntryRepository', () => ({
  findByRoleAndFilters: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  findByStatus: jest.fn()
}));

jest.mock('../utils/historyUtil', () => ({
  attachLoadingLotsHistories: jest.fn(async (entries) => entries)
}));

jest.mock('../services/ValidationService', () => ({
  validateSampleEntry: jest.fn(() => ({ valid: true, errors: [] }))
}));

jest.mock('../services/AuditService', () => ({
  logCreate: jest.fn(),
  logUpdate: jest.fn()
}));

jest.mock('../models/SampleEntryOffering', () => ({}));

const SampleEntryRepository = require('../repositories/SampleEntryRepository');
const SampleEntryService = require('../services/SampleEntryService');

describe('Resample Cooking Filter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('includes resample lot in cooking tab after resample pending decision PASS_WITH_COOKING', async () => {
    const resampleEntry = {
      id: 'entry-1',
      entryType: 'LOCATION_SAMPLE',
      workflowStatus: 'COOKING_REPORT',
      lotSelectionDecision: 'PASS_WITH_COOKING',
      sampleCollectedBy: 'location-user',
      resampleDecisionAt: '2026-04-01T10:00:00.000Z',
      resampleTriggerRequired: false,
      resampleTriggeredAt: null,
      resampleOriginDecision: 'PASS_WITHOUT_COOKING',
      resampleAfterFinal: false,
      resampleCollectedTimeline: [{ username: 'location-user', date: '2026-04-01T09:00:00.000Z' }],
      cookingReport: null,
      qualityAttemptDetails: [{ attemptNo: 1, moistureRaw: '10.0', grainsCountRaw: '100' }]
    };

    SampleEntryRepository.findByRoleAndFilters.mockResolvedValue({
      entries: [resampleEntry],
      total: 1,
      totalPages: 1
    });

    const result = await SampleEntryService.getSampleEntriesByRole('staff', { status: 'RESAMPLE_COOKING_BOOK' }, 10);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].id).toBe('entry-1');
  });

  test('excludes resample lot from cooking tab after resample pending decision PASS_WITHOUT_COOKING', async () => {
    const resampleEntry = {
      id: 'entry-2',
      entryType: 'LOCATION_SAMPLE',
      workflowStatus: 'FINAL_REPORT',
      lotSelectionDecision: 'PASS_WITHOUT_COOKING',
      sampleCollectedBy: 'location-user',
      resampleDecisionAt: '2026-04-01T10:00:00.000Z',
      resampleTriggerRequired: false,
      resampleTriggeredAt: null,
      resampleOriginDecision: 'PASS_WITHOUT_COOKING',
      resampleAfterFinal: false,
      resampleCollectedTimeline: [{ username: 'location-user', date: '2026-04-01T09:00:00.000Z' }],
      cookingReport: null,
      qualityAttemptDetails: [{ attemptNo: 1, moistureRaw: '10.0', grainsCountRaw: '100' }]
    };

    SampleEntryRepository.findByRoleAndFilters.mockResolvedValue({
      entries: [resampleEntry],
      total: 1,
      totalPages: 1
    });

    const result = await SampleEntryService.getSampleEntriesByRole('staff', { status: 'RESAMPLE_COOKING_BOOK' }, 10);

    expect(result.entries).toHaveLength(0);
  });
});
