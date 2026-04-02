export const getEntryTypeCode = (entryType?: string | null) => {
  const normalized = String(entryType || '').toUpperCase();
  if (normalized === 'DIRECT_LOADED_VEHICLE') return 'RL';
  if (normalized === 'LOCATION_SAMPLE') return 'LS';
  if (normalized === 'RICE_SAMPLE') return 'RS';
  return 'MS';
};

export const getEntryTypeTextColor = (typeCode?: string | null) => {
  const normalized = String(typeCode || '').toUpperCase();
  if (normalized === 'RL') return '#1565c0';
  if (normalized === 'MS' || normalized === 'RS') return '#2e7d32';
  return '#e67e22';
};

export const isConvertedResampleType = (entry: any) => {
  const originalEntryType = String(entry?.originalEntryType || '').trim();
  const currentEntryType = String(entry?.entryType || '').toUpperCase();
  if (!originalEntryType || currentEntryType !== 'LOCATION_SAMPLE' || originalEntryType.toUpperCase() === 'LOCATION_SAMPLE') {
    return false;
  }

  return (
    String(entry?.lotSelectionDecision || '').toUpperCase() === 'FAIL'
    || Number(entry?.qualityReportAttempts || 0) > 1
    || (Array.isArray(entry?.qualityAttemptDetails) && entry.qualityAttemptDetails.length > 1)
    || (Array.isArray(entry?.resampleCollectedTimeline) && entry.resampleCollectedTimeline.length > 0)
    || (Array.isArray(entry?.resampleCollectedHistory) && entry.resampleCollectedHistory.length > 0)
    || Boolean(entry?.resampleStartAt)
    || Boolean(entry?.resampleTriggerRequired)
    || Boolean(entry?.resampleTriggeredAt)
    || Boolean(entry?.resampleDecisionAt)
  );
};

export const getDisplayedEntryTypeCode = (entry: any) => {
  if (isConvertedResampleType(entry)) {
    return getEntryTypeCode(entry?.originalEntryType);
  }
  return getEntryTypeCode(entry?.entryType);
};

export const getOriginalEntryTypeCode = (entry: any) => {
  return getEntryTypeCode(entry?.originalEntryType || entry?.entryType);
};

export const getConvertedEntryTypeCode = (entry: any) => {
  return getEntryTypeCode(entry?.entryType);
};
