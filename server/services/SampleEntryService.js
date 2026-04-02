const SampleEntryRepository = require('../repositories/SampleEntryRepository');
const ValidationService = require('./ValidationService');
const AuditService = require('./AuditService');
const SampleEntryOffering = require('../models/SampleEntryOffering');

const OFFER_KEY_PATTERN = /^offer(\d+)$/i;
const isValidOfferKey = (value) => OFFER_KEY_PATTERN.test(String(value || '').trim());
const getOfferIndex = (value) => {
  const match = String(value || '').trim().match(OFFER_KEY_PATTERN);
  const index = match ? Number(match[1]) : NaN;
  return Number.isFinite(index) && index > 0 ? index : 1;
};
const createOfferKey = (index) => `offer${Math.max(1, Number(index) || 1)}`;
const getNextOfferKey = (versions = []) => {
  const maxIndex = versions.reduce((max, offer) => Math.max(max, getOfferIndex(offer?.key)), 0);
  return createOfferKey(maxIndex + 1);
};
const LF_RATE_TYPES = new Set(['PD_LOOSE', 'MD_LOOSE', 'PD_WB']);
const EGB_RATE_TYPES = new Set(['PD_LOOSE', 'MD_LOOSE']);
const hasLfForRateType = (value) => LF_RATE_TYPES.has(String(value || '').trim().toUpperCase());
const hasEgbForRateType = (value) => EGB_RATE_TYPES.has(String(value || '').trim().toUpperCase());

const toNumberOrDefault = (value, fallback = 0) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toNullableNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  return fallback;
};

const normalizeRateUnit = (value, fallback = 'per_bag') => {
  const normalized = String(value || fallback).trim().toLowerCase();
  if (['per_bag', 'per_quintal', 'per_kg'].includes(normalized)) return normalized;
  return fallback;
};

const normalizeSuteUnit = (value, fallback = 'per_ton') => {
  const normalized = String(value || fallback).trim().toLowerCase();
  if (['per_bag', 'per_ton'].includes(normalized)) return normalized;
  return fallback;
};

const normalizeToggleUnit = (value, fallback = 'per_bag') => {
  const normalized = String(value || fallback).trim().toLowerCase();
  if (['per_bag', 'per_quintal', 'lumps', 'percentage'].includes(normalized)) return normalized;
  return fallback;
};

const normalizePaymentUnit = (value, fallback = 'days') => {
  const normalized = String(value || fallback).trim().toLowerCase();
  if (['days', 'month', 'months'].includes(normalized)) {
    return normalized === 'months' ? 'month' : normalized;
  }
  return fallback;
};

const normalizePaymentValue = (value, fallback = 15) => {
  const parsed = toNumberOrDefault(value, fallback);
  return Math.max(0, parsed);
};
const toTitleCaseWords = (value) => String(value || '')
  .toLowerCase()
  .replace(/\b\w/g, (char) => char.toUpperCase())
  .trim();
const toTimeValue = (value) => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};
const hasAlphaOrPositiveValue = (value) => {
  if (value === null || value === undefined || value === '') return false;
  const raw = String(value).trim();
  if (!raw) return false;
  if (/[a-zA-Z]/.test(raw)) return true;
  const num = Number(raw);
  return Number.isFinite(num) && num !== 0;
};
const isProvidedNumericValue = (rawVal, valueVal) => {
  const raw = rawVal !== null && rawVal !== undefined ? String(rawVal).trim() : '';
  if (raw !== '') return true;
  const num = Number(valueVal);
  return Number.isFinite(num) && num > 0;
};
const isProvidedAlphaValue = (rawVal, valueVal) => {
  const raw = rawVal !== null && rawVal !== undefined ? String(rawVal).trim() : '';
  if (raw !== '') return true;
  return hasAlphaOrPositiveValue(valueVal);
};
const hasQualitySnapshot = (attempt = {}) => {
  const hasMoisture = isProvidedNumericValue(attempt.moistureRaw, attempt.moisture);
  const hasGrains = isProvidedNumericValue(attempt.grainsCountRaw, attempt.grainsCount);
  const hasDetailedQuality =
    isProvidedNumericValue(attempt.cutting1Raw, attempt.cutting1) ||
    isProvidedNumericValue(attempt.bend1Raw, attempt.bend1) ||
    isProvidedAlphaValue(attempt.mixRaw, attempt.mix) ||
    isProvidedAlphaValue(attempt.mixSRaw, attempt.mixS) ||
    isProvidedAlphaValue(attempt.mixLRaw, attempt.mixL) ||
    isProvidedAlphaValue(attempt.kanduRaw, attempt.kandu) ||
    isProvidedAlphaValue(attempt.oilRaw, attempt.oil) ||
    isProvidedAlphaValue(attempt.skRaw, attempt.sk);

  return hasMoisture && (hasGrains || hasDetailedQuality);
};
const hasAnyDetailedQuality = (attempt = {}) => (
  isProvidedNumericValue(attempt.cutting1Raw, attempt.cutting1) ||
  isProvidedNumericValue(attempt.cutting2Raw, attempt.cutting2) ||
  isProvidedNumericValue(attempt.bend1Raw, attempt.bend1) ||
  isProvidedNumericValue(attempt.bend2Raw, attempt.bend2) ||
  isProvidedAlphaValue(attempt.mixRaw, attempt.mix) ||
  isProvidedAlphaValue(attempt.mixSRaw, attempt.mixS) ||
  isProvidedAlphaValue(attempt.mixLRaw, attempt.mixL) ||
  isProvidedAlphaValue(attempt.kanduRaw, attempt.kandu) ||
  isProvidedAlphaValue(attempt.oilRaw, attempt.oil) ||
  isProvidedAlphaValue(attempt.skRaw, attempt.sk)
);
const hasFullQualitySnapshot = (attempt = {}) => {
  const hasMoisture = isProvidedNumericValue(attempt.moistureRaw, attempt.moisture);
  const hasGrains = isProvidedNumericValue(attempt.grainsCountRaw, attempt.grainsCount);
  return hasMoisture
    && hasGrains
    && isProvidedNumericValue(attempt.cutting1Raw, attempt.cutting1)
    && isProvidedNumericValue(attempt.cutting2Raw, attempt.cutting2)
    && isProvidedNumericValue(attempt.bend1Raw, attempt.bend1)
    && isProvidedNumericValue(attempt.bend2Raw, attempt.bend2)
    && isProvidedAlphaValue(attempt.mixRaw, attempt.mix)
    && isProvidedAlphaValue(attempt.kanduRaw, attempt.kandu)
    && isProvidedAlphaValue(attempt.oilRaw, attempt.oil)
    && isProvidedAlphaValue(attempt.skRaw, attempt.sk);
};
const hasSampleBookReadySnapshot = (attempt = {}) => {
  const hasMoisture = isProvidedNumericValue(attempt.moistureRaw, attempt.moisture);
  const hasGrains = isProvidedNumericValue(attempt.grainsCountRaw, attempt.grainsCount);
  if (!hasMoisture || !hasGrains) return false;
  if (hasFullQualitySnapshot(attempt)) return true;
  return !hasAnyDetailedQuality(attempt);
};
const normalizeAttemptValue = (value) => String(value ?? '').trim().toLowerCase();
const areQualityAttemptsEquivalent = (left = {}, right = {}) => {
  const fields = [
    'reportedBy',
    'moistureRaw', 'moisture',
    'grainsCountRaw', 'grainsCount',
    'cutting1Raw', 'cutting1',
    'cutting2Raw', 'cutting2',
    'bend1Raw', 'bend1',
    'bend2Raw', 'bend2',
    'mixRaw', 'mix',
    'mixSRaw', 'mixS',
    'mixLRaw', 'mixL',
    'kanduRaw', 'kandu',
    'oilRaw', 'oil',
    'skRaw', 'sk',
    'wbRRaw', 'wbR',
    'wbBkRaw', 'wbBk',
    'wbTRaw', 'wbT',
    'paddyWbRaw', 'paddyWb',
    'smellHas', 'smellType'
  ];
  return fields.every((field) => normalizeAttemptValue(left?.[field]) === normalizeAttemptValue(right?.[field]));
};
const getQualityAttemptsForEntry = (entry = {}) => {
  const attempts = Array.isArray(entry.qualityAttemptDetails)
    ? [...entry.qualityAttemptDetails].filter(Boolean).sort((a, b) => (a.attemptNo || 0) - (b.attemptNo || 0))
    : [];
  const currentQuality = entry.qualityParameters;

  if (!currentQuality || !hasQualitySnapshot(currentQuality)) {
    return attempts;
  }

  const alreadyIncluded = attempts.some((attempt) => (
    (attempt.id && currentQuality.id && String(attempt.id) === String(currentQuality.id))
    || areQualityAttemptsEquivalent(attempt, currentQuality)
  ));

  if (alreadyIncluded) {
    return attempts.map((attempt, index) => ({ ...attempt, attemptNo: index + 1 }));
  }

  const mergedAttempts = [
    ...attempts,
    {
      ...currentQuality,
      attemptNo: attempts.length + 1
    }
  ];

  return mergedAttempts.map((attempt, index) => ({ ...attempt, attemptNo: index + 1 }));
};
const isResampleWorkflowEntry = (entry = {}) => {
  const decision = String(entry.lotSelectionDecision || '').toUpperCase();
  const originDecision = String(entry.resampleOriginDecision || '').toUpperCase();
  const hasResampleCollectorTimeline =
    (Array.isArray(entry.resampleCollectedTimeline) && entry.resampleCollectedTimeline.length > 0)
    || (Array.isArray(entry.resampleCollectedHistory) && entry.resampleCollectedHistory.length > 0);
  return decision === 'FAIL'
    || originDecision === 'PASS_WITH_COOKING'
    || Boolean(entry.resampleTriggerRequired)
    || Boolean(entry.resampleTriggeredAt)
    || Boolean(entry.resampleDecisionAt)
    || Boolean(entry.resampleAfterFinal)
    || Boolean(entry.resampleStartAt)
    || hasResampleCollectorTimeline
    || Number(entry.qualityReportAttempts || 0) > 1;
};
const hasPostResampleAttempt = (entry = {}, predicate = hasQualitySnapshot) => {
  const attempts = getQualityAttemptsForEntry(entry);

  if (!isResampleWorkflowEntry(entry) || attempts.length <= 1) {
    return false;
  }

  const latestAttempt = attempts[attempts.length - 1] || null;
  return !!latestAttempt && predicate(latestAttempt);
};
const hasAssignedResampleCollector = (entry = {}) => {
  const timelineNames = [
    ...(Array.isArray(entry.resampleCollectedTimeline) ? entry.resampleCollectedTimeline : []),
    ...(Array.isArray(entry.resampleCollectedHistory) ? entry.resampleCollectedHistory : [])
  ]
    .map((item) => String(item?.sampleCollectedBy || item?.name || '').trim().toLowerCase())
    .filter(Boolean);

  if (timelineNames.length > 0) {
    return timelineNames.some((name) => name !== 'broker office sample');
  }

  const assignedName = String(entry.sampleCollectedBy || '').trim().toLowerCase();
  return !!assignedName && assignedName !== 'broker office sample';
};
const hasCompletedResampleAttempt = (entry = {}, predicate = hasQualitySnapshot) => {
  if (!hasAssignedResampleCollector(entry)) return false;
  const workflow = String(entry.workflowStatus || '').toUpperCase();
  if (workflow === 'STAFF_ENTRY' || workflow === 'LOT_ALLOTMENT') return false;
  return hasPostResampleAttempt(entry, predicate);
};
const hasResampleCookingSource = (entry = {}) => {
  if (!isResampleWorkflowEntry(entry)) return false;
  const history = Array.isArray(entry.cookingReport?.history) ? entry.cookingReport.history : [];
  const cookingStatus = String(entry.cookingReport?.status || '').trim().toUpperCase();
  const decision = String(entry.lotSelectionDecision || '').toUpperCase();
  if (entry.resampleDecisionAt && decision === 'PASS_WITH_COOKING') {
    return true;
  }
  return Boolean(entry.cookingReport?.id || history.length > 0 || cookingStatus);
};

// Check if a resample entry was originally "Pass with Cooking" (needed cooking from first cycle)
const wasOriginallyPassWithCooking = (entry = {}) => {
  const decision = String(entry.lotSelectionDecision || '').toUpperCase();
  const originDecision = String(entry.resampleOriginDecision || '').toUpperCase();
  // If current decision is still PASS_WITH_COOKING, it was originally pass with cooking
  // Also check for cooking report history which indicates first cycle had cooking
  const history = Array.isArray(entry.cookingReport?.history) ? entry.cookingReport.history : [];
  const hasCookingHistory = history.length > 0 && history.some(item => 
    item.cookingDoneBy || item.status
  );
  return originDecision === 'PASS_WITH_COOKING'
    || Boolean(entry.resampleTriggerRequired)
    || decision === 'PASS_WITH_COOKING'
    || hasCookingHistory;
};

// Check if resample entry has been re-decided as PASS_WITH_COOKING in resample pending
const hasResamplePassWithCookingDecision = (entry = {}) => {
  if (!isResampleWorkflowEntry(entry)) return false;
  if (entry.resampleDecisionAt) {
    return String(entry.lotSelectionDecision || '').toUpperCase() === 'PASS_WITH_COOKING';
  }
  const history = Array.isArray(entry.cookingReport?.history) ? entry.cookingReport.history : [];
  // Check if there's a second-cycle cooking decision (after resample quality was added)
  const qualityAttempts = getQualityAttemptsForEntry(entry);
  if (qualityAttempts.length <= 1) return false;
  
  // Look for cooking history entries that came after the resample started
  const resampleStartAt = entry.resampleStartAt || entry.lotSelectionAt;
  if (!resampleStartAt) return false;
  
  const resampleCookingDecision = history.find(item => {
    if (!item.status) return false;
    const itemDate = item.date || item.createdAt;
    return itemDate && new Date(itemDate) >= new Date(resampleStartAt);
  });
  
  return !!resampleCookingDecision;
};

// For resample entries: determine if cooking report "Add Report" button should be shown
const canAddResampleCookingReport = (entry = {}) => {
  if (!isResampleWorkflowEntry(entry)) return true; // Not resample, no restriction
  
  // If already has second-cycle cooking decision, allow (staff already added, admin decided)
  if (hasResamplePassWithCookingDecision(entry)) return true;
  
  // Original lot was "Pass with Cooking" - show old data, don't allow adding new report
  // until Resample Pending admin makes another "Pass with Cooking" decision
  if (wasOriginallyPassWithCooking(entry)) {
    return hasResamplePassWithCookingDecision(entry);
  }
  
  // Original lot was "Pass without Cooking" - no old cooking data to show
  // Let normal flow handle it
  return true;
};
const hasTriggeredResampleFlow = (entry = {}) => {
  if (!isResampleWorkflowEntry(entry) || !hasAssignedResampleCollector(entry)) return false;

   if (entry.resampleTriggerRequired) {
    return Boolean(entry.resampleTriggeredAt);
  }

  const workflow = String(entry.workflowStatus || '').toUpperCase();
  const decision = String(entry.lotSelectionDecision || '').toUpperCase();

  if (['QUALITY_CHECK', 'LOT_SELECTION', 'COOKING_REPORT'].includes(workflow)) {
    return true;
  }

  if (['FINAL_REPORT', 'LOT_ALLOTMENT'].includes(workflow)) {
    return decision !== 'FAIL';
  }

  return false;
};
const hasFinalizedResampleWorkflow = (entry = {}) => (
  Boolean(entry.resampleAfterFinal)
  || Boolean(
    entry.finalPrice
    || entry.offering?.finalPrice
    || entry.offering?.finalBaseRate
    || entry.offering?.isFinalized
  )
);

const getOfferLabel = (key) => `Offer ${getOfferIndex(key)}`;

const ensureOfferVersions = (source = {}) => {
  if (Array.isArray(source.offerVersions) && source.offerVersions.length > 0) {
    return source.offerVersions
      .filter((offer) => isValidOfferKey(offer?.key))
      .map((offer) => ({
        ...offer,
        key: offer.key,
        label: offer.label || getOfferLabel(offer.key)
      }))
      .sort((left, right) => getOfferIndex(left.key) - getOfferIndex(right.key));
  }

  if (
    source.offerBaseRateValue == null &&
    source.offerRate == null &&
    source.hamali == null &&
    source.brokerage == null &&
    source.lf == null &&
    source.egbValue == null
  ) {
    return [];
  }

  return [{
    key: 'offer1',
    label: 'Offer 1',
    createdAt: source.createdAt || new Date().toISOString(),
    updatedAt: source.updatedAt || new Date().toISOString(),
    offerRate: toNullableNumber(source.offerRate),
    sute: toNumberOrDefault(source.sute, 0),
    suteUnit: normalizeSuteUnit(source.suteUnit, 'per_ton'),
    baseRateType: source.baseRateType || 'PD_WB',
    baseRateUnit: normalizeRateUnit(source.baseRateUnit, 'per_bag'),
    offerBaseRateValue: toNullableNumber(source.offerBaseRateValue),
    hamaliEnabled: toBoolean(source.hamaliEnabled, false),
    hamali: toNumberOrDefault(source.hamali, 0),
    hamaliUnit: normalizeToggleUnit(source.hamaliUnit, 'per_bag'),
    moistureValue: toNumberOrDefault(source.moistureValue, 0),
    brokerageEnabled: toBoolean(source.brokerageEnabled, false),
    brokerage: toNumberOrDefault(source.brokerage, 0),
    brokerageUnit: normalizeToggleUnit(source.brokerageUnit, 'per_bag'),
    lfEnabled: toBoolean(source.lfEnabled, false),
    lf: toNumberOrDefault(source.lf, 0),
    lfUnit: normalizeToggleUnit(source.lfUnit, 'per_bag'),
    egbType: source.egbType || 'mill',
    egbValue: toNumberOrDefault(source.egbValue, 0),
    customDivisor: toNullableNumber(source.customDivisor),
    cdEnabled: toBoolean(source.cdEnabled, false),
    cdValue: toNumberOrDefault(source.cdValue, 0),
    cdUnit: normalizeToggleUnit(source.cdUnit, 'percentage'),
    bankLoanEnabled: toBoolean(source.bankLoanEnabled, false),
    bankLoanValue: toNumberOrDefault(source.bankLoanValue, 0),
    bankLoanUnit: normalizeToggleUnit(source.bankLoanUnit, 'per_bag'),
    paymentConditionValue: normalizePaymentValue(source.paymentConditionValue, 15),
    paymentConditionUnit: normalizePaymentUnit(source.paymentConditionUnit, 'days'),
    remarks: source.remarks || source.offeringRemarks || ''
  }];
};

const getLatestOffer = (versions = []) => {
  if (!versions.length) return null;

  return [...versions].sort((left, right) => {
    const leftDate = new Date(left.updatedAt || left.createdAt || 0).getTime();
    const rightDate = new Date(right.updatedAt || right.createdAt || 0).getTime();
    if (leftDate !== rightDate) return rightDate - leftDate;
    return getOfferIndex(right.key) - getOfferIndex(left.key);
  })[0];
};

const getActiveOffer = (versions = [], activeOfferKey) => {
  if (!versions.length) return null;
  return versions.find((offer) => offer.key === activeOfferKey) || getLatestOffer(versions);
};

const buildOfferPayload = (priceData, existingOffer = {}, slotKey) => {
  const baseRateType = String(priceData.baseRateType || existingOffer.baseRateType || priceData.offerBaseRate || 'PD_WB').trim().toUpperCase();
  const baseRateUnit = normalizeRateUnit(priceData.baseRateUnit || existingOffer.baseRateUnit || priceData.perUnit || 'per_bag');
  const hasLf = hasLfForRateType(baseRateType);
  const hasEgb = hasEgbForRateType(baseRateType);
  const egbType = hasEgb ? String(priceData.egbType || existingOffer.egbType || 'mill').trim().toLowerCase() : 'mill';
  const offerAmount = toNullableNumber(priceData.offerBaseRateValue ?? existingOffer.offerBaseRateValue ?? priceData.offerRate ?? existingOffer.offerRate);
  const hamaliAmount = toNullableNumber(priceData.hamali ?? priceData.hamaliValue ?? existingOffer.hamali);
  const brokerageAmount = toNullableNumber(priceData.brokerage ?? priceData.brokerageValue ?? existingOffer.brokerage);
  const lfAmount = hasLf ? toNullableNumber(priceData.lf ?? priceData.lfValue ?? existingOffer.lf) : 0;
  const customDivisor = (
    baseRateUnit === 'per_kg' ||
    baseRateType === 'MD_LOOSE'
  )
    ? toNullableNumber(priceData.customDivisor ?? existingOffer.customDivisor)
    : null;

  return {
    key: slotKey,
    label: getOfferLabel(slotKey),
    createdAt: existingOffer.createdAt || new Date().toISOString(),
    createdBy: existingOffer.createdBy || null,
    createdByRole: existingOffer.createdByRole || null,
    updatedAt: new Date().toISOString(),
    updatedBy: existingOffer.updatedBy || null,
    updatedByRole: existingOffer.updatedByRole || null,
    offerRate: offerAmount,
    sute: toNumberOrDefault(priceData.sute ?? existingOffer.sute, 0),
    suteUnit: normalizeSuteUnit(priceData.suteUnit || existingOffer.suteUnit || priceData.suit || 'per_ton'),
    baseRateType,
    baseRateUnit,
    offerBaseRateValue: offerAmount,
    hamaliEnabled: toBoolean(priceData.hamaliEnabled, toBoolean(existingOffer.hamaliEnabled, false)),
    hamali: hamaliAmount,
    hamaliUnit: normalizeToggleUnit(priceData.hamaliUnit || existingOffer.hamaliUnit || baseRateUnit || 'per_bag', 'per_bag'),
    moistureValue: toNumberOrDefault(priceData.moistureValue ?? priceData.moisture ?? existingOffer.moistureValue, 0),
    brokerageEnabled: toBoolean(priceData.brokerageEnabled, toBoolean(existingOffer.brokerageEnabled, false)),
    brokerage: brokerageAmount,
    brokerageUnit: normalizeToggleUnit(priceData.brokerageUnit || existingOffer.brokerageUnit || 'per_bag', 'per_bag'),
    lfEnabled: hasLf ? toBoolean(priceData.lfEnabled, toBoolean(existingOffer.lfEnabled, false)) : false,
    lf: lfAmount,
    lfUnit: hasLf ? normalizeToggleUnit(priceData.lfUnit || existingOffer.lfUnit || 'per_bag', 'per_bag') : 'per_bag',
    egbType,
    egbValue: hasEgb && egbType === 'purchase'
      ? toNumberOrDefault(priceData.egbValue ?? priceData.egb ?? existingOffer.egbValue, 0)
      : 0,
    customDivisor,
    cdEnabled: toBoolean(priceData.cdEnabled, toBoolean(existingOffer.cdEnabled, false)),
    cdValue: toNumberOrDefault(priceData.cdValue ?? existingOffer.cdValue, 0),
    cdUnit: normalizeToggleUnit(priceData.cdUnit || existingOffer.cdUnit || 'percentage', 'percentage'),
    bankLoanEnabled: toBoolean(priceData.bankLoanEnabled, toBoolean(existingOffer.bankLoanEnabled, false)),
    bankLoanValue: toNumberOrDefault(priceData.bankLoanValue ?? existingOffer.bankLoanValue, 0),
    bankLoanUnit: normalizeToggleUnit(priceData.bankLoanUnit || existingOffer.bankLoanUnit || 'per_bag', 'per_bag'),
    paymentConditionValue: normalizePaymentValue(priceData.paymentConditionValue ?? existingOffer.paymentConditionValue, 15),
    paymentConditionUnit: normalizePaymentUnit(priceData.paymentConditionUnit || existingOffer.paymentConditionUnit || 'days', 'days'),
    remarks: priceData.remarks ?? existingOffer.remarks ?? ''
  };
};

const mirrorOfferToColumns = (offer) => {
  if (!offer) {
    return {
      offerRate: null,
      sute: 0,
      suteUnit: 'per_ton',
      baseRateType: 'PD_WB',
      baseRateUnit: 'per_bag',
      offerBaseRateValue: null,
      hamaliEnabled: false,
      hamali: 0,
      hamaliPerKg: 0,
      hamaliPerQuintal: 0,
      hamaliUnit: 'per_bag',
      moistureValue: 0,
      brokerage: 0,
      brokerageEnabled: false,
      brokerageUnit: 'per_bag',
      lf: 0,
      lfEnabled: false,
      lfUnit: 'per_bag',
      egbValue: 0,
      egbType: 'mill',
      customDivisor: null,
      cdEnabled: false,
      cdValue: 0,
      cdUnit: 'percentage',
      bankLoanEnabled: false,
      bankLoanValue: 0,
      bankLoanUnit: 'per_bag',
      paymentConditionValue: 15,
      paymentConditionUnit: 'days'
    };
  }

  const hamaliValue = toNumberOrDefault(offer.hamali, 0);
  const hasLf = hasLfForRateType(offer.baseRateType);
  const hasEgb = hasEgbForRateType(offer.baseRateType);

  return {
    offerRate: offer.offerBaseRateValue,
    sute: toNumberOrDefault(offer.sute, 0),
    suteUnit: normalizeSuteUnit(offer.suteUnit, 'per_ton'),
    baseRateType: offer.baseRateType || 'PD_WB',
    baseRateUnit: normalizeRateUnit(offer.baseRateUnit, 'per_bag'),
    offerBaseRateValue: toNullableNumber(offer.offerBaseRateValue),
    hamaliEnabled: toBoolean(offer.hamaliEnabled, false),
    hamali: hamaliValue,
    hamaliPerKg: offer.hamaliUnit === 'per_kg' ? hamaliValue : 0,
    hamaliPerQuintal: offer.hamaliUnit === 'per_quintal' ? hamaliValue : 0,
    hamaliUnit: normalizeToggleUnit(offer.hamaliUnit, 'per_bag'),
    moistureValue: toNumberOrDefault(offer.moistureValue, 0),
    brokerage: toNumberOrDefault(offer.brokerage, 0),
    brokerageEnabled: toBoolean(offer.brokerageEnabled, false),
    brokerageUnit: normalizeToggleUnit(offer.brokerageUnit, 'per_bag'),
    lf: hasLf ? toNumberOrDefault(offer.lf, 0) : 0,
    lfEnabled: hasLf ? toBoolean(offer.lfEnabled, false) : false,
    lfUnit: hasLf ? normalizeToggleUnit(offer.lfUnit, 'per_bag') : 'per_bag',
    egbValue: hasEgb && offer.egbType === 'purchase' ? toNumberOrDefault(offer.egbValue, 0) : 0,
    egbType: hasEgb ? (offer.egbType || 'mill') : 'mill',
    customDivisor: toNullableNumber(offer.customDivisor),
    cdEnabled: toBoolean(offer.cdEnabled, false),
    cdValue: toNumberOrDefault(offer.cdValue, 0),
    cdUnit: normalizeToggleUnit(offer.cdUnit, 'percentage'),
    bankLoanEnabled: toBoolean(offer.bankLoanEnabled, false),
    bankLoanValue: toNumberOrDefault(offer.bankLoanValue, 0),
    bankLoanUnit: normalizeToggleUnit(offer.bankLoanUnit, 'per_bag'),
    paymentConditionValue: normalizePaymentValue(offer.paymentConditionValue, 15),
    paymentConditionUnit: normalizePaymentUnit(offer.paymentConditionUnit, 'days'),
    finalRemarks: offer.finalRemarks || ''
  };
};

class SampleEntryService {
  async assertPricingAccess(id, userId, userRole, mode) {
    const entry = await SampleEntryRepository.findById(id);

    if (!entry) {
      throw new Error('Sample entry not found');
    }

    if (mode === 'offer' && !['admin', 'owner', 'manager'].includes(userRole)) {
      throw new Error('Only admin, owner, or manager can update offering price');
    }

    if (mode === 'final' && !['admin', 'owner'].includes(userRole)) {
      throw new Error('Only admin or owner can update final price');
    }

    return entry;
  }

  formatOfferingPayload(offeringRecord) {
    if (!offeringRecord) return null;

    const plain = typeof offeringRecord.toJSON === 'function' ? offeringRecord.toJSON() : offeringRecord;
    const offerVersions = ensureOfferVersions(plain);
    const latestOffer = getLatestOffer(offerVersions);
    const activeOffer = getActiveOffer(offerVersions, plain.activeOfferKey);

    return {
      ...plain,
      offerVersions,
      offerCount: offerVersions.length,
      hasMultipleOffers: offerVersions.length > 1,
      activeOfferKey: activeOffer?.key || plain.activeOfferKey || null,
      activeOffer,
      latestOffer
    };
  }

  async createSampleEntry(entryData, userId) {
    try {
      if (!entryData.date) {
        entryData.date = new Date();
      }

      const validation = ValidationService.validateSampleEntry(entryData);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Handle auto-fail for Medium, Dark, and Orange smells
      // FIX: smellHas may come as string "true"/"false" from FormData, so parse it properly
      const smellHasBool = entryData.smellHas === true || entryData.smellHas === 'true' || entryData.smellHas === '1';
      if (smellHasBool && ['MEDIUM', 'DARK', 'ORANGE'].includes(String(entryData.smellType).toUpperCase())) {
        entryData.workflowStatus = 'FAILED';
        entryData.lotSelectionDecision = 'FAIL';
        entryData.failRemarks = `Failed: ${toTitleCaseWords(entryData.smellType)} Smell`;
      } else if (entryData.entryType === 'RICE_SAMPLE') {
        entryData.workflowStatus = 'COOKING_REPORT';
      } else {
        entryData.workflowStatus = 'STAFF_ENTRY';
      }

      if (entryData.location !== undefined) {
        entryData.location = toTitleCaseWords(entryData.location);
      }
      if (entryData.partyName !== undefined) {
        entryData.partyName = toTitleCaseWords(entryData.partyName);
      }
      if (entryData.variety !== undefined) {
        entryData.variety = toTitleCaseWords(entryData.variety);
      }
      if (entryData.brokerName !== undefined) {
        entryData.brokerName = toTitleCaseWords(entryData.brokerName);
      }
      entryData.createdByUserId = userId;

      const entry = await SampleEntryRepository.create(entryData);
      await AuditService.logCreate(userId, 'sample_entries', entry.id, entry);

      return entry;
    } catch (error) {
      console.error('Error creating sample entry:', error);
      throw error;
    }
  }

  async getSampleEntryById(id, options = {}) {
    return await SampleEntryRepository.findById(id, options);
  }

  async getSampleEntriesByStatus(status, options = {}) {
    return await SampleEntryRepository.findByStatus(status, options);
  }

  async getSampleEntriesByRole(role, filters = {}, userId) {
    const result = await SampleEntryRepository.findByRoleAndFilters(role, filters, userId);
    if (result && Array.isArray(result.entries) && result.entries.length > 0) {
      const { attachLoadingLotsHistories } = require('../utils/historyUtil');
      result.entries = await attachLoadingLotsHistories(result.entries);
      const requestedStatus = String(filters.status || '').toUpperCase();
      if (requestedStatus === 'MILL_SAMPLE' || requestedStatus === 'LOCATION_SAMPLE') {
        result.entries = result.entries.filter((entry) => {
          if (!isResampleWorkflowEntry(entry)) {
            if (requestedStatus === 'LOCATION_SAMPLE') {
              return String(entry.workflowStatus || '').toUpperCase() === 'STAFF_ENTRY';
            }
            return true;
          }
          const assignedToResampleCollector = hasAssignedResampleCollector(entry);
          if (!assignedToResampleCollector) {
            return requestedStatus !== 'LOCATION_SAMPLE';
          }
          if (
            requestedStatus === 'LOCATION_SAMPLE'
            && hasFinalizedResampleWorkflow(entry)
            && !hasPostResampleAttempt(entry, hasQualitySnapshot)
          ) {
            return true;
          }
          if (hasPostResampleAttempt(entry, hasQualitySnapshot)) return false;
          return requestedStatus === 'LOCATION_SAMPLE';
        });
      }
      if (requestedStatus === 'PENDING_LOT_SELECTION') {
        result.entries = result.entries.filter((entry) => {
          if (!isResampleWorkflowEntry(entry)) return true;
          if (entry.resampleTriggerRequired) {
            return Boolean(entry.resampleTriggeredAt) && !entry.resampleDecisionAt;
          }
          return !entry.resampleDecisionAt && hasTriggeredResampleFlow(entry);
        });
      }
      if (requestedStatus === 'COOKING_BOOK') {
        result.entries = result.entries.filter((entry) => {
          const isResample = isResampleWorkflowEntry(entry);
          return !isResample;
        });
      }
      if (requestedStatus === 'COOKING_BOOK' || requestedStatus === 'RESAMPLE_COOKING_BOOK') {
        result.entries = result.entries.filter((entry) => !(entry.recheckRequested === true && entry.recheckType === 'quality'));
      }
      if (requestedStatus === 'RESAMPLE_COOKING_BOOK') {
        result.entries = result.entries.filter((entry) => {
          if (!isResampleWorkflowEntry(entry)) return false;
          if (!hasResampleCookingSource(entry)) return false;
          const workflow = String(entry.workflowStatus || '').toUpperCase();
          if (['FINAL_REPORT', 'LOT_ALLOTMENT', 'PHYSICAL_INSPECTION', 'INVENTORY_ENTRY', 'OWNER_FINANCIAL', 'MANAGER_FINANCIAL', 'FINAL_REVIEW', 'COMPLETED'].includes(workflow)) {
            return false;
          }
          if (entry.resampleTriggerRequired) {
            if (!entry.resampleTriggeredAt) return false;
            if (!entry.resampleDecisionAt) return true;
            return String(entry.lotSelectionDecision || '').toUpperCase() === 'PASS_WITH_COOKING';
          }
          return hasTriggeredResampleFlow(entry);
        });
      }
      if (['MILL_SAMPLE', 'LOCATION_SAMPLE', 'PENDING_LOT_SELECTION', 'COOKING_BOOK', 'RESAMPLE_COOKING_BOOK'].includes(requestedStatus)) {
        const pageSize = Math.max(1, Number(filters.pageSize || result.entries.length || 1));
        result.total = result.entries.length;
        result.totalPages = Math.max(1, Math.ceil(result.total / pageSize));
      }
    }
    return result;
  }

  async updateSampleEntry(id, updates, userId) {
    try {
      const currentEntry = await SampleEntryRepository.findById(id);
      if (!currentEntry) {
        throw new Error('Sample entry not found');
      }

      // Check user role for staff-specific restrictions
      const User = require('../models/User');
      const currentUser = await User.findByPk(userId, { attributes: ['role'], raw: true });
      const userRole = currentUser?.role || 'staff';

      // One-time edit restriction for staff:
      // Any edit in the entry edit modal consumes the single staff edit allowance.
      const limitedRoles = new Set(['staff', 'physical_supervisor', 'paddy_supervisor']);
      if (limitedRoles.has(userRole)) {
        const normalizeText = (value) => String(value ?? '').trim().toLowerCase();
        const normalizeBool = (value) => {
          if (typeof value === 'boolean') return value;
          const normalized = String(value ?? '').trim().toLowerCase();
          if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
          if (['false', '0', 'no', 'n'].includes(normalized)) return false;
          return false;
        };
        const hasChanged = (field, newVal, oldVal) => {
          if (field === 'bags') return Number(newVal) !== Number(oldVal);
          if (['sampleGivenToOffice', 'smellHas'].includes(field)) return normalizeBool(newVal) !== normalizeBool(oldVal);
          return normalizeText(newVal) !== normalizeText(oldVal);
        };

        const editableFields = [
          'partyName',
          'bags',
          'brokerName',
          'variety',
          'location',
          'packaging',
          'lorryNumber',
          'entryDate',
          'sampleCollectedBy',
          'sampleGivenToOffice',
          'smellHas',
          'smellType',
          'gpsCoordinates'
        ];

        const changedFields = editableFields.filter((field) => {
          if (updates[field] === undefined) return false;
          return hasChanged(field, updates[field], currentEntry[field]);
        });

        if (changedFields.length > 0) {
          const allowedEntryEdits = Math.max(1, Number(currentEntry.staffEntryEditAllowance || 1));
          if (Number(currentEntry.staffPartyNameEdits || 0) >= allowedEntryEdits) {
            throw new Error('This entry can only be edited once by staff. Please contact admin/manager for further changes.');
          }
          updates.staffPartyNameEdits = (currentEntry.staffPartyNameEdits || 0) + 1;
          updates.entryEditApprovalStatus = null;
          updates.entryEditApprovalApprovedBy = null;
          updates.entryEditApprovalApprovedAt = null;
          updates.entryEditApprovalReason = null;
          updates.entryEditApprovalRequestedBy = null;
          updates.entryEditApprovalRequestedAt = null;
        }
      }

      if (updates.location !== undefined) updates.location = toTitleCaseWords(updates.location);
      if (updates.partyName !== undefined) updates.partyName = toTitleCaseWords(updates.partyName);
      if (updates.variety !== undefined) updates.variety = toTitleCaseWords(updates.variety);
      if (updates.brokerName !== undefined) updates.brokerName = toTitleCaseWords(updates.brokerName);

      // Handle auto-fail for smell updates (Medium, Dark, Orange ONLY)
      const updatedSmellType = updates.smellType !== undefined ? updates.smellType : currentEntry.smellType;
      // FIX: smellHas may come as string "true"/"false" from FormData, so parse it properly
      const rawSmellHas = updates.smellHas !== undefined ? updates.smellHas : currentEntry.smellHas;
      const updatedSmellHas = rawSmellHas === true || rawSmellHas === 'true' || rawSmellHas === '1';
      
      if (updatedSmellHas && ['MEDIUM', 'DARK', 'ORANGE'].includes(String(updatedSmellType).toUpperCase())) {
        updates.workflowStatus = 'FAILED';
        updates.lotSelectionDecision = 'FAIL';
        updates.lotSelectionAt = new Date();
        updates.lotSelectionByUserId = userId;
        updates.failRemarks = `Failed: ${toTitleCaseWords(updatedSmellType)} Smell`;
      }

      const updatedEntry = await SampleEntryRepository.update(id, updates);

      await AuditService.logUpdate(
        userId,
        'sample_entries',
        id,
        currentEntry,
        updatedEntry
      );

      return updatedEntry;
    } catch (error) {
      console.error('Error updating sample entry:', error);
      throw error;
    }
  }

  async getSampleEntryLedger(filters = {}) {
    const result = await SampleEntryRepository.getLedger(filters);
    if (result && Array.isArray(result.entries) && result.entries.length > 0) {
      const { attachLoadingLotsHistories } = require('../utils/historyUtil');
      result.entries = await attachLoadingLotsHistories(result.entries);
    }
    return result;
  }

  async updateOfferingPrice(id, priceData, userId, userRole) {
    await this.assertPricingAccess(id, userId, userRole, 'offer');

    let offering = await SampleEntryOffering.findOne({
      where: { sampleEntryId: id }
    });

    const existing = offering ? offering.toJSON() : {};
    const offerVersions = ensureOfferVersions(existing);
    const requestedSlot = isValidOfferKey(priceData.offerSlot) ? String(priceData.offerSlot).trim() : null;
    const slotKey = requestedSlot || getNextOfferKey(offerVersions);
    const existingOffer = offerVersions.find((offerItem) => offerItem.key === slotKey) || {};
    const nextOffer = {
      ...buildOfferPayload(priceData, existingOffer, slotKey),
      createdBy: existingOffer.createdBy || userId,
      createdByRole: existingOffer.createdByRole || userRole,
      updatedBy: userId,
      updatedByRole: userRole
    };
    const nextVersions = offerVersions.filter((offerItem) => offerItem.key !== slotKey);
    nextVersions.push(nextOffer);

    let activeOfferKey = existing.activeOfferKey || null;
    if (priceData.activeOfferKey && nextVersions.some((offerItem) => offerItem.key === priceData.activeOfferKey)) {
      activeOfferKey = priceData.activeOfferKey;
    }
    if (toBoolean(priceData.setAsActive, !activeOfferKey)) {
      activeOfferKey = slotKey;
    }

    const activeOffer = getActiveOffer(nextVersions, activeOfferKey);
    const mirroredOffer = mirrorOfferToColumns(activeOffer);
    const offeringData = {
      sampleEntryId: id,
      offerVersions: nextVersions,
      activeOfferKey: activeOffer?.key || activeOfferKey || null,
      ...mirroredOffer,
      createdBy: existing.createdBy || userId,
      updatedBy: userId
    };

    if (offering) {
      await offering.update(offeringData);
    } else {
      offering = await SampleEntryOffering.create(offeringData);
    }

    await this.updateSampleEntry(id, {
      offeringPrice: mirroredOffer.offerBaseRateValue,
      priceType: priceData.priceType,
      offeringRemarks: activeOffer?.remarks || priceData.remarks || null
    }, userId);

    return this.formatOfferingPayload(offering);
  }

  async setFinalPrice(id, finalData, userId, userRole) {
    await this.assertPricingAccess(id, userId, userRole, 'final');

    let offering = await SampleEntryOffering.findOne({
      where: { sampleEntryId: id }
    });

    if (!offering) {
      offering = await SampleEntryOffering.create({
        sampleEntryId: id,
        offerVersions: [],
        activeOfferKey: null,
        ...mirrorOfferToColumns(null),
        baseRateType: String(finalData.baseRateType || 'PD_WB').trim().toUpperCase(),
        baseRateUnit: normalizeRateUnit(finalData.baseRateUnit || 'per_bag'),
        cdUnit: normalizeToggleUnit(finalData.cdUnit || 'percentage', 'percentage'),
        bankLoanUnit: normalizeToggleUnit(finalData.bankLoanUnit || 'per_bag', 'per_bag'),
        createdBy: userId,
        updatedBy: userId
      });
    }

    const updates = { updatedBy: userId };

    if (userRole === 'admin' || userRole === 'owner') {
      if (finalData.hamaliEnabled !== undefined) updates.hamaliEnabled = finalData.hamaliEnabled;
      if (finalData.brokerageEnabled !== undefined) updates.brokerageEnabled = finalData.brokerageEnabled;
      if (finalData.lfEnabled !== undefined) updates.lfEnabled = finalData.lfEnabled;
      if (finalData.suteEnabled !== undefined) updates.suteEnabled = finalData.suteEnabled;
      if (finalData.moistureEnabled !== undefined) updates.moistureEnabled = finalData.moistureEnabled;
      if (finalData.finalPrice !== undefined) updates.finalPrice = finalData.finalPrice;
      if (finalData.finalBaseRate !== undefined) updates.finalBaseRate = finalData.finalBaseRate;
      if (finalData.baseRateType !== undefined) updates.baseRateType = String(finalData.baseRateType || 'PD_WB').trim().toUpperCase();
      if (finalData.baseRateUnit !== undefined) updates.baseRateUnit = finalData.baseRateUnit;
      if (finalData.finalSute !== undefined) updates.finalSute = finalData.finalSute;
      if (finalData.finalSuteUnit !== undefined) updates.finalSuteUnit = finalData.finalSuteUnit;
      if (finalData.hamali !== undefined) updates.hamali = finalData.hamali;
      if (finalData.hamaliUnit !== undefined) updates.hamaliUnit = finalData.hamaliUnit;
      if (finalData.brokerage !== undefined) updates.brokerage = finalData.brokerage;
      if (finalData.brokerageUnit !== undefined) updates.brokerageUnit = finalData.brokerageUnit;
      if (finalData.lf !== undefined) updates.lf = finalData.lf;
      if (finalData.lfUnit !== undefined) updates.lfUnit = finalData.lfUnit;
      if (finalData.moistureValue !== undefined) updates.moistureValue = finalData.moistureValue;
      if (finalData.egbValue !== undefined) updates.egbValue = finalData.egbValue;
      if (finalData.egbType !== undefined) updates.egbType = finalData.egbType;
      if (finalData.customDivisor !== undefined) updates.customDivisor = finalData.customDivisor;
      if (finalData.bankLoanEnabled !== undefined) updates.bankLoanEnabled = finalData.bankLoanEnabled;
      if (finalData.bankLoanValue !== undefined) updates.bankLoanValue = finalData.bankLoanValue;
      if (finalData.bankLoanUnit !== undefined) updates.bankLoanUnit = finalData.bankLoanUnit;
      if (finalData.cdEnabled !== undefined) updates.cdEnabled = finalData.cdEnabled;
      if (finalData.cdValue !== undefined) updates.cdValue = finalData.cdValue;
      if (finalData.cdUnit !== undefined) updates.cdUnit = finalData.cdUnit;
      if (finalData.paymentConditionValue !== undefined) updates.paymentConditionValue = finalData.paymentConditionValue;
      if (finalData.paymentConditionUnit !== undefined) updates.paymentConditionUnit = finalData.paymentConditionUnit;
      if (finalData.remarks !== undefined) updates.finalRemarks = finalData.remarks || null;
      if (finalData.isFinalized !== undefined) updates.isFinalized = finalData.isFinalized;
    }

    if (userRole === 'manager') {
      if (finalData.hamali !== undefined) updates.hamali = finalData.hamali;
      if (finalData.hamaliUnit !== undefined) updates.hamaliUnit = finalData.hamaliUnit;
      if (finalData.brokerage !== undefined) updates.brokerage = finalData.brokerage;
      if (finalData.brokerageUnit !== undefined) updates.brokerageUnit = finalData.brokerageUnit;
      if (finalData.lf !== undefined) updates.lf = finalData.lf;
      if (finalData.lfUnit !== undefined) updates.lfUnit = finalData.lfUnit;
      if (finalData.finalPrice !== undefined) updates.finalPrice = finalData.finalPrice;
      if (finalData.finalSute !== undefined) updates.finalSute = finalData.finalSute;
      if (finalData.finalSuteUnit !== undefined) updates.finalSuteUnit = finalData.finalSuteUnit;
      if (finalData.moistureValue !== undefined) updates.moistureValue = finalData.moistureValue;
      if (finalData.egbValue !== undefined) updates.egbValue = finalData.egbValue;
      if (finalData.egbType !== undefined) updates.egbType = finalData.egbType;
      if (finalData.finalBaseRate !== undefined) updates.finalBaseRate = finalData.finalBaseRate;
      if (finalData.baseRateType !== undefined) updates.baseRateType = String(finalData.baseRateType || 'PD_WB').trim().toUpperCase();
      if (finalData.baseRateUnit !== undefined) updates.baseRateUnit = finalData.baseRateUnit;
      if (finalData.bankLoanEnabled !== undefined) updates.bankLoanEnabled = finalData.bankLoanEnabled;
      if (finalData.bankLoanValue !== undefined) updates.bankLoanValue = finalData.bankLoanValue;
      if (finalData.bankLoanUnit !== undefined) updates.bankLoanUnit = finalData.bankLoanUnit;
      if (finalData.cdEnabled !== undefined) updates.cdEnabled = finalData.cdEnabled;
      if (finalData.cdValue !== undefined) updates.cdValue = finalData.cdValue;
      if (finalData.cdUnit !== undefined) updates.cdUnit = finalData.cdUnit;
      if (finalData.paymentConditionValue !== undefined) updates.paymentConditionValue = finalData.paymentConditionValue;
      if (finalData.paymentConditionUnit !== undefined) updates.paymentConditionUnit = finalData.paymentConditionUnit;
      if (finalData.remarks !== undefined) updates.finalRemarks = finalData.remarks || null;
      if (finalData.isFinalized !== undefined) updates.isFinalized = finalData.isFinalized;
    }

    await offering.update(updates);

    if (updates.finalPrice !== undefined) {
      await this.updateSampleEntry(id, { finalPrice: updates.finalPrice }, userId);
    }

    return this.formatOfferingPayload(offering);
  }

  async getOfferingData(id) {
    const offering = await SampleEntryOffering.findOne({
      where: { sampleEntryId: id }
    });

    return this.formatOfferingPayload(offering);
  }
}

module.exports = new SampleEntryService();
