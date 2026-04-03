import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';

import { useNotification } from '../contexts/NotificationContext';
import { SampleEntryDetailModal } from '../components/SampleEntryDetailModal';
import { getConvertedEntryTypeCode, getDisplayedEntryTypeCode, getEntryTypeTextColor, getOriginalEntryTypeCode, isConvertedResampleType } from '../utils/sampleTypeDisplay';

import { API_URL } from '../config/api';

interface SampleEntry {
  id: string;
  serialNo?: number;
  entryDate: string;
  createdAt: string;
  brokerName: string;
  variety: string;
  partyName: string;
  location: string;
  bags: number;
  packaging?: string;
  lorryNumber?: string;
  entryType?: string;
  sampleCollectedBy?: string;
  workflowStatus: string;
  lotSelectionDecision?: string;
  qualityParameters?: {
    moisture: number;
    moistureRaw?: number;
    cutting1: number;
    cutting1Raw?: number;
    cutting2: number;
    cutting2Raw?: number;
    bend: number;
    bend1: number;
    bend1Raw?: number;
    bend2: number;
    bend2Raw?: number;
    mixS: number;
    mixSRaw?: number;
    smixEnabled?: boolean;
    mixL: number;
    mixLRaw?: number;
    lmixEnabled?: boolean;
    mix: number;
    mixRaw?: number;
    kandu: number;
    kanduRaw?: number;
    oil: number;
    oilRaw?: number;
    sk: number;
    skRaw?: number;
    grainsCount: number;
    grainsCountRaw?: number;
    wbR: number;
    wbRRaw?: number;
    wbBk: number;
    wbBkRaw?: number;
    wbT: number;
    wbTRaw?: number;
    paddyWb: number;
    paddyWbRaw?: number;
    smellHas?: boolean;
    smellType?: string | null;
    gramsReport?: string;
    uploadFileUrl?: string;
    reportedBy: string;
  };
}

interface SupervisorUser {
  id: number;
  username: string;
  fullName?: string | null;
}

const formatDateInputValue = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toTitleCase = (str: string) => str ? str.replace(/\b\w/g, c => c.toUpperCase()) : '';
const toSentenceCase = (value: string) => {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (!normalized) return '';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};
const getTimeValue = (value?: string | null) => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};
const isProvidedNumericValue = (rawVal: any, valueVal: any) => {
  const raw = rawVal !== null && rawVal !== undefined ? String(rawVal).trim() : '';
  if (raw !== '') return true;
  const num = Number(valueVal);
  return Number.isFinite(num) && num > 0;
};
const hasAlphaOrPositiveValue = (val: any) => {
  if (val === null || val === undefined || val === '') return false;
  const raw = String(val).trim();
  if (!raw) return false;
  if (/[a-zA-Z]/.test(raw)) return true;
  const num = parseFloat(raw);
  return Number.isFinite(num);
};
const isProvidedAlphaValue = (rawVal: any, valueVal: any) => {
  const raw = rawVal !== null && rawVal !== undefined ? String(rawVal).trim() : '';
  if (raw !== '') return true;
  return hasAlphaOrPositiveValue(valueVal);
};
const hasQualitySnapshot = (attempt: any) => {
  const hasMoisture = isProvidedNumericValue(attempt?.moistureRaw, attempt?.moisture);
  const hasGrains = isProvidedNumericValue(attempt?.grainsCountRaw, attempt?.grainsCount);
  const hasDetailedQuality =
    isProvidedNumericValue(attempt?.cutting1Raw, attempt?.cutting1) ||
    isProvidedNumericValue(attempt?.bend1Raw, attempt?.bend1) ||
    isProvidedAlphaValue(attempt?.mixRaw, attempt?.mix) ||
    isProvidedAlphaValue(attempt?.mixSRaw, attempt?.mixS) ||
    isProvidedAlphaValue(attempt?.mixLRaw, attempt?.mixL) ||
    isProvidedAlphaValue(attempt?.kanduRaw, attempt?.kandu) ||
    isProvidedAlphaValue(attempt?.oilRaw, attempt?.oil) ||
    isProvidedAlphaValue(attempt?.skRaw, attempt?.sk);

  return hasMoisture && (hasGrains || hasDetailedQuality);
};
const normalizeAttemptValue = (value: any) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  return String(value);
};
const areQualityAttemptsEquivalent = (left: any, right: any) => {
  const keys = [
    'reportedBy',
    'moistureRaw', 'moisture',
    'dryMoistureRaw', 'dryMoisture',
    'cutting1Raw', 'cutting1', 'cutting2Raw', 'cutting2',
    'bend1Raw', 'bend1', 'bend2Raw', 'bend2',
    'grainsCountRaw', 'grainsCount',
    'mixRaw', 'mix', 'mixSRaw', 'mixS', 'mixLRaw', 'mixL',
    'kanduRaw', 'kandu', 'oilRaw', 'oil', 'skRaw', 'sk',
    'wbRRaw', 'wbR', 'wbBkRaw', 'wbBk', 'wbTRaw', 'wbT',
    'paddyWbRaw', 'paddyWb',
    'gramsReport', 'smellHas', 'smellType'
  ];
  return keys.every((key) => normalizeAttemptValue(left?.[key]) === normalizeAttemptValue(right?.[key]));
};
const isResampleWorkflowEntry = (entry: any) => {
  const baseAttempts = Array.isArray(entry?.qualityAttemptDetails)
    ? entry.qualityAttemptDetails.filter(Boolean)
    : [];
  const decision = String(entry?.lotSelectionDecision || '').toUpperCase();
  return decision === 'FAIL'
    || decision === 'PASS_WITH_COOKING'
    || Boolean(entry?.resampleStartAt)
    || baseAttempts.length > 1
    || Number(entry?.qualityReportAttempts || 0) > 1;
};
const getQualityAttemptsForEntry = (entry: any) => {
  const baseAttempts = Array.isArray(entry?.qualityAttemptDetails)
    ? [...entry.qualityAttemptDetails].filter(Boolean).sort((a: any, b: any) => (a.attemptNo || 0) - (b.attemptNo || 0))
    : [];
  const currentQuality = entry?.qualityParameters;

  if (baseAttempts.length > 0) {
    return baseAttempts.map((attempt: any, index: number) => ({
      ...attempt,
      attemptNo: Number(attempt?.attemptNo) || index + 1
    }));
  }

  if (!currentQuality || !hasQualitySnapshot(currentQuality)) return [];
  return [{ ...currentQuality, attemptNo: 1 }];
};

const getEntrySmellLabel = (entry: any) => {
  const attempts = getQualityAttemptsForEntry(entry);
  for (let idx = attempts.length - 1; idx >= 0; idx -= 1) {
    const attempt = attempts[idx];
    if (attempt?.smellHas || (attempt?.smellType && String(attempt.smellType).trim())) {
      return toTitleCase(attempt.smellType || 'Yes');
    }
  }
  const quality = entry?.qualityParameters;
  if (quality?.smellHas || (quality?.smellType && String(quality.smellType).trim())) {
    return toTitleCase(quality.smellType || 'Yes');
  }
  if (entry?.smellHas || (entry?.smellType && String(entry.smellType).trim())) {
    return toTitleCase(entry.smellType || 'Yes');
  }
  return null;
};

const getEntrySmellColor = (entry: any) => {
  const attempts = getQualityAttemptsForEntry(entry);
  for (let idx = attempts.length - 1; idx >= 0; idx -= 1) {
    const attempt = attempts[idx];
    if (attempt?.smellHas && attempt?.smellType) {
      const smellType = String(attempt.smellType).toUpperCase();
      if (smellType === 'DARK') return '#dc2626';
      if (smellType === 'MEDIUM') return '#ea580c';
      if (smellType === 'LIGHT') return '#ca8a04';
    }
  }
  const quality = entry?.qualityParameters;
  if (quality?.smellHas && quality?.smellType) {
    const smellType = String(quality.smellType).toUpperCase();
    if (smellType === 'DARK') return '#dc2626';
    if (smellType === 'MEDIUM') return '#ea580c';
    if (smellType === 'LIGHT') return '#ca8a04';
  }
  if (entry?.smellHas && entry?.smellType) {
    const smellType = String(entry.smellType).toUpperCase();
    if (smellType === 'DARK') return '#dc2626';
    if (smellType === 'MEDIUM') return '#ea580c';
    if (smellType === 'LIGHT') return '#ca8a04';
  }
  return '#2e7d32'; // default green for no smell
};
const formatGramsReport = (value?: string): string => {
  if (value === '5gms') return '5 gms';
  if (value === '10gms') return '10 gms';
  return '--';
};
const getSelectionDisplayDate = (entry: SampleEntry, selectionView: 'ALL' | 'RESAMPLE_PENDING') => {
  const e = entry as any;
  const hasResampleFlow = String(e.lotSelectionDecision || '').trim().toUpperCase() === 'FAIL'
    || (Array.isArray(e.resampleCollectedTimeline) && e.resampleCollectedTimeline.length > 0)
    || (Array.isArray(e.resampleCollectedHistory) && e.resampleCollectedHistory.length > 0)
    || Number(e.qualityReportAttempts || 0) > 1;

  if (hasResampleFlow && Array.isArray(e.resampleCollectedTimeline) && e.resampleCollectedTimeline.length > 0) {
    const lastAssigned = e.resampleCollectedTimeline[e.resampleCollectedTimeline.length - 1];
    if (lastAssigned && lastAssigned.date) {
      return lastAssigned.date;
    }
  }

  // Fallback for resample entries: use resampleStartAt, lotSelectionAt, or updatedAt
  if (hasResampleFlow) {
    return e.resampleStartAt || e.lotSelectionAt || e.updatedAt || entry.entryDate;
  }
  return entry.entryDate;
};

interface LotSelectionProps {
  entryType?: string;
  excludeEntryType?: string;
}

const LotSelection: React.FC<LotSelectionProps> = ({ entryType, excludeEntryType }) => {
  const { showNotification } = useNotification();
  const [entries, setEntries] = useState<SampleEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const decisionLocksRef = useRef<Set<string>>(new Set());
  const [detailEntry, setDetailEntry] = useState<SampleEntry | null>(null);
  const [failModal, setFailModal] = useState<{ isOpen: boolean, entryId: string, remarks: string }>({ isOpen: false, entryId: '', remarks: '' });
  const [remarksModalData, setRemarksModalData] = useState<{ isOpen: boolean, text: string }>({ isOpen: false, text: '' });
  const [supervisors, setSupervisors] = useState<SupervisorUser[]>([]);
  const getCollectorLabel = (value?: string | null) => {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return '-';
    if (raw.toLowerCase() === 'broker office sample') return 'Broker Office Sample';
    const match = supervisors.find((sup) => String(sup.username || '').trim().toLowerCase() === raw.toLowerCase());
    if (match?.fullName) return toTitleCase(match.fullName);
    return toTitleCase(raw);
  };
  const getCreatorLabel = (entry: SampleEntry) => {
    const creator = (entry as any)?.creator;
    const raw = creator?.fullName || creator?.username || '';
    return raw ? toTitleCase(raw) : '-';
  };
  const getOriginalCollector = (e: any) => {
    if (Array.isArray(e?.sampleCollectedHistory) && e.sampleCollectedHistory.length > 0) {
      return String(e.sampleCollectedHistory[0] || '').trim();
    }
    return String(e?.sampleCollectedBy || '').trim();
  };
  const renderCollectedBy = (entry: SampleEntry) => {
    const originalCollectorValue = getOriginalCollector(entry);
    const label = originalCollectorValue ? getCollectorLabel(originalCollectorValue) : '-';
    return <span style={{ fontWeight: '600' }}>{label}</span>;
  };

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 100;

  // Filters
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterBroker, setFilterBroker] = useState('');
  const [filterVariety, setFilterVariety] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterCollectedBy, setFilterCollectedBy] = useState('');
  const [filterType, setFilterType] = useState('');
  const [selectionView, setSelectionView] = useState<'ALL' | 'RESAMPLE_PENDING'>('ALL');



  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    loadEntries();
  }, [page]);

  useEffect(() => {
    const loadSupervisors = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.get(`${API_URL}/sample-entries/paddy-supervisors`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = response.data as any;
        const users = Array.isArray(data) ? data : (data.users || []);
        setSupervisors(users.filter((u: any) => u && u.username));
      } catch (error) {
        console.error('Error loading supervisors:', error);
      }
    };
    loadSupervisors();
  }, []);

  const normalizeCollectedByFilter = (value: string) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.toLowerCase() === 'broker office sample') return 'Broker Office Sample';
    const match = supervisors.find((sup) => {
      const username = String(sup.username || '').trim().toLowerCase();
      const fullName = String(sup.fullName || '').trim().toLowerCase();
      return raw.toLowerCase() === username || (fullName && raw.toLowerCase() === fullName);
    });
    return match?.username || raw;
  };

  const loadEntries = async (
    fFrom?: string,
    fTo?: string,
    fBroker?: string,
    fVariety?: string,
    fLocation?: string,
    fCollectedBy?: string,
    fType?: string
  ) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const params: any = { status: 'PENDING_LOT_SELECTION', page, pageSize: PAGE_SIZE };

      const dFrom = fFrom !== undefined ? fFrom : filterDateFrom;
      const dTo = fTo !== undefined ? fTo : filterDateTo;
      const b = fBroker !== undefined ? fBroker : filterBroker;
      const v = fVariety !== undefined ? fVariety : filterVariety;
      const l = fLocation !== undefined ? fLocation : filterLocation;
      const cb = fCollectedBy !== undefined ? fCollectedBy : filterCollectedBy;
      const t = fType !== undefined ? fType : filterType;

      if (dFrom) params.startDate = dFrom;
      if (dTo) params.endDate = dTo;
      if (b) params.broker = b;
      if (v) params.variety = v;
      if (l) params.location = l;
      if (cb) params.collectedBy = normalizeCollectedByFilter(cb);
      if (t) params.sampleType = t;
      if (entryType) params.entryType = entryType;
      if (excludeEntryType) params.excludeEntryType = excludeEntryType;

      const response = await axios.get(`${API_URL}/sample-entries/by-role`, {
        params,
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = response.data as any;
      setEntries(data.entries || []);
      if (data.total != null) {
        setTotal(data.total);
        setTotalPages(data.totalPages || Math.ceil(data.total / PAGE_SIZE));
      }
    } catch (error: any) {
      showNotification(error.response?.data?.error || 'Failed to load entries', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilters = () => {
    setPage(1);
    setTimeout(() => {
      loadEntries();
    }, 0);
  };

  const handleClearFilters = () => {
    setFilterDateFrom('');
    setFilterDateTo('');
    setFilterBroker('');
    setFilterVariety('');
    setFilterLocation('');
    setFilterCollectedBy('');
    setFilterType('');
    setPage(1);
    setTimeout(() => {
      loadEntries('', '', '', '', '', '', '');
    }, 0);
  };

  const applyQuickDateFilter = (preset: 'today' | 'yesterday' | 'last7') => {
    const startDate = new Date();
    const endDate = new Date();

    if (preset === 'yesterday') {
      startDate.setDate(startDate.getDate() - 1);
      endDate.setDate(endDate.getDate() - 1);
    } else if (preset === 'last7') {
      startDate.setDate(startDate.getDate() - 6);
    }

    const startValue = formatDateInputValue(startDate);
    const endValue = formatDateInputValue(endDate);
    setFilterDateFrom(startValue);
    setFilterDateTo(endValue);
    setPage(1);
    setTimeout(() => {
      loadEntries(startValue, endValue);
    }, 0);
  };

  const handleDecision = async (entryId: string, decision: string, remarks?: string) => {
    if (isSubmitting) return;
    const lockKey = `${entryId}:${decision}`;
    if (decisionLocksRef.current.has(lockKey)) return;
    try {
      decisionLocksRef.current.add(lockKey);
      setIsSubmitting(true);
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/sample-entries/${entryId}/lot-selection`,
        { decision, remarks },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      let message = '';
      if (decision === 'PASS_WITHOUT_COOKING') {
        message = 'Entry passed and moved to Final Pass Lots';
      } else if (decision === 'PASS_WITH_COOKING') {
        message = 'Entry passed and moved to Cooking Report';
      } else if (decision === 'FAIL') {
        message = 'Entry marked as failed';
      } else if (decision === 'SOLDOUT') {
        message = 'Entry marked as sold out';
      }

      showNotification(message, 'success');
      loadEntries();
    } catch (error: any) {
      showNotification(error.response?.data?.error || 'Failed to process decision', 'error');
    } finally {
      setIsSubmitting(false);
      decisionLocksRef.current.delete(lockKey);
    }
  };

  const openEntryDetail = async (entry: SampleEntry) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/sample-entries/${entry.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDetailEntry(response.data as SampleEntry);
    } catch (error: any) {
      showNotification(error.response?.data?.error || 'Failed to load entry details', 'error');
      setDetailEntry(entry);
    }
  };

  // Get unique brokers for filter dropdown
  const brokersList = useMemo(() => {
    return Array.from(new Set(entries.map(e => e.brokerName))).sort();
  }, [entries]);
  const varietiesList = useMemo(() => {
    return Array.from(new Set(entries.map(e => e.variety).filter(Boolean))).sort();
  }, [entries]);

  const resamplePendingCount = useMemo(
    () => entries.filter((entry) => isResampleWorkflowEntry(entry as any)).length,
    [entries]
  );
  const normalPendingCount = useMemo(
    () => entries.filter((entry) => !isResampleWorkflowEntry(entry as any)).length,
    [entries]
  );
  const renderTabBadge = (count: number, background: string) => (
    count > 0 ? (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '18px',
          height: '18px',
          marginLeft: '6px',
          padding: '0 6px',
          borderRadius: '999px',
          background,
          color: '#fff',
          fontSize: '11px',
          fontWeight: 800,
          lineHeight: 1
        }}
      >
        {count}
      </span>
    ) : null
  );

  // Group entries by date then broker (no client-side filtering — filters are server-side now)
  const groupedEntries = useMemo(() => {
    const filtered = selectionView === 'RESAMPLE_PENDING'
      ? entries.filter((entry) => isResampleWorkflowEntry(entry as any))
      : entries.filter((entry) => !isResampleWorkflowEntry(entry as any));
    const sorted = [...filtered].sort((a, b) => {
      const dateA = new Date(getSelectionDisplayDate(a, selectionView)).getTime();
      const dateB = new Date(getSelectionDisplayDate(b, selectionView)).getTime();
      if (dateA !== dateB) return dateB - dateA; // Primary sort: Date DESC
      const serialA = Number.isFinite(Number(a.serialNo)) ? Number(a.serialNo) : null;
      const serialB = Number.isFinite(Number(b.serialNo)) ? Number(b.serialNo) : null;
      if (serialA !== null && serialB !== null && serialA !== serialB) return serialA - serialB;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); // Secondary sort: CreatedAt ASC for stable Sl No
    });

    const grouped: Record<string, Record<string, typeof sorted>> = {};
    sorted.forEach(entry => {
      const dateKey = new Date(getSelectionDisplayDate(entry, selectionView)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const brokerKey = entry.brokerName || 'Unknown';
      if (!grouped[dateKey]) grouped[dateKey] = {};
      if (!grouped[dateKey][brokerKey]) grouped[dateKey][brokerKey] = [];
      grouped[dateKey][brokerKey].push(entry);
    });
    return grouped;
  }, [entries, selectionView]);



  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
        <button
          type="button"
          onClick={() => setSelectionView('ALL')}
          style={{ padding: '8px 14px', fontSize: '13px', fontWeight: 700, border: 'none', borderRadius: '4px', background: selectionView === 'ALL' ? '#1565c0' : '#90a4ae', color: 'white', cursor: 'pointer' }}
        >
          Pending Sample Selection
        </button>
        <button
          type="button"
          onClick={() => setSelectionView('RESAMPLE_PENDING')}
          style={{ padding: '8px 14px', fontSize: '13px', fontWeight: 700, border: 'none', borderRadius: '4px', background: selectionView === 'RESAMPLE_PENDING' ? '#ef6c00' : '#90a4ae', color: 'white', cursor: 'pointer' }}
        >
          Resample Pending
          {renderTabBadge(resamplePendingCount, '#c2410c')}
        </button>
      </div>
      {/* Collapsible Filter Bar */}
      <div style={{ marginBottom: '0px' }}>
        <button
          onClick={() => setFiltersVisible(!filtersVisible)}
          style={{
            padding: '7px 16px',
            backgroundColor: filtersVisible ? '#e74c3c' : '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          {filtersVisible ? '✕ Hide Filters' : '🔍 Filters'}
        </button>
        {filtersVisible && (
          <div style={{
            display: 'flex',
            gap: '12px',
            marginTop: '8px',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            backgroundColor: '#fff',
            padding: '10px 14px',
            borderRadius: '6px',
            border: '1px solid #e0e0e0'
          }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginRight: '4px' }}>
              {[
                { label: 'Today', value: 'today' as const },
                { label: 'Yesterday', value: 'yesterday' as const },
                { label: 'Last 7 Days', value: 'last7' as const }
              ].map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => applyQuickDateFilter(preset.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '16px',
                    border: '1px solid #90caf9',
                    background: '#e3f2fd',
                    color: '#1565c0',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#555', marginBottom: '3px' }}>From Date</label>
              <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
                style={{ padding: '5px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#555', marginBottom: '3px' }}>To Date</label>
              <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
                style={{ padding: '5px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#555', marginBottom: '3px' }}>Broker</label>
              <select value={filterBroker} onChange={e => setFilterBroker(e.target.value)}
                style={{ padding: '5px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', minWidth: '140px', backgroundColor: 'white' }}>
                <option value="">All Brokers</option>
                {brokersList.map((b, i) => <option key={i} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#555', marginBottom: '3px' }}>Variety</label>
              <select value={filterVariety} onChange={e => setFilterVariety(e.target.value)}
                style={{ padding: '5px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', minWidth: '140px', backgroundColor: 'white' }}>
                <option value="">All Varieties</option>
                {varietiesList.map((v, i) => <option key={i} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#555', marginBottom: '3px' }}>Type</label>
              <select value={filterType} onChange={e => setFilterType(e.target.value)}
                style={{ padding: '5px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', minWidth: '120px', backgroundColor: 'white' }}>
                <option value="">All Types</option>
                <option value="MS">MS</option>
                <option value="LS">LS</option>
                <option value="RL">RL</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#555', marginBottom: '3px' }}>Collected By</label>
              <input
                type="text"
                value={filterCollectedBy}
                onChange={e => setFilterCollectedBy(e.target.value)}
                placeholder="Search collector..."
                list="lot-selection-collected-by"
                style={{ padding: '5px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', minWidth: '150px' }}
              />
              <datalist id="lot-selection-collected-by">
                <option value="Broker Office Sample" />
                {supervisors.map((sup) => (
                  <option key={sup.id} value={sup.fullName || sup.username} />
                ))}
              </datalist>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#555', marginBottom: '3px' }}>Location</label>
              <input
                type="text"
                value={filterLocation}
                onChange={e => setFilterLocation(e.target.value)}
                placeholder="Search location..."
                style={{ padding: '5px 8px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px', minWidth: '150px' }}
              />
            </div>
            {(filterDateFrom || filterDateTo || filterBroker || filterVariety || filterLocation || filterCollectedBy || filterType) && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleApplyFilters}
                  style={{ padding: '5px 12px', border: 'none', borderRadius: '4px', backgroundColor: '#3498db', color: 'white', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
                  Apply Filters
                </button>
                <button onClick={handleClearFilters}
                  style={{ padding: '5px 12px', border: '1px solid #e74c3c', borderRadius: '4px', backgroundColor: '#fff', color: '#e74c3c', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
                  Clear Filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ overflowX: 'auto', backgroundColor: 'white' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>Loading...</div>
        ) : Object.keys(groupedEntries).length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>No entries pending review</div>
        ) : (
          Object.entries(groupedEntries).map(([dateKey, brokerGroups]) => {
            let brokerSeq = 0;
            return (
              <div key={dateKey} style={{ marginBottom: '20px' }}>
                {Object.entries(brokerGroups).sort(([a], [b]) => a.localeCompare(b)).map(([brokerName, brokerEntries], brokerIdx) => {
                  const orderedEntries = [...brokerEntries].sort((a, b) => {
                    const serialA = Number.isFinite(Number(a.serialNo)) ? Number(a.serialNo) : null;
                    const serialB = Number.isFinite(Number(b.serialNo)) ? Number(b.serialNo) : null;
                    if (serialA !== null && serialB !== null && serialA !== serialB) return serialA - serialB;
                    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
                  });
                  brokerSeq++;
                  let slNo = 0;
                  return (
                    <div key={brokerName} style={{ marginBottom: '0px' }}>
                      {/* Date bar — only first broker */}
                      {brokerIdx === 0 && <div style={{
                        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                        color: 'white', padding: '6px 10px', fontWeight: '700', fontSize: '14px',
                        textAlign: 'center', letterSpacing: '0.5px'
                      }}>
                        {(() => {
                          const d = new Date(getSelectionDisplayDate(brokerEntries[0], selectionView));
                          return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
                        })()}
                        &nbsp;&nbsp;{entryType === 'RICE_SAMPLE' ? 'Rice Sample' : 'Paddy Sample'}
                      </div>}
                      {/* Broker name bar */}
                      <div style={{
                        background: '#e8eaf6',
                        color: '#000', padding: '4px 10px', fontWeight: '700', fontSize: '13.5px',
                        display: 'flex', alignItems: 'center', gap: '4px'
                      }}>
                        <span style={{ fontSize: '13.5px', fontWeight: '800' }}>{brokerSeq}.</span> {brokerName}
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', tableLayout: 'fixed', border: '1px solid #000' }}>
                        <thead>
                          {entryType !== 'RICE_SAMPLE' ? (
                            <tr style={{ backgroundColor: '#1a237e', color: 'white' }}>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap', width: '2%' }}>SL No</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap', width: '2.5%' }}>Type</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap', width: '3%' }}>Bags</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap', width: '2.5%' }}>Pkg</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'left', whiteSpace: 'nowrap', width: '9%' }}>Party Name</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'left', whiteSpace: 'nowrap', width: '7%' }}>Paddy Location</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'left', whiteSpace: 'nowrap', width: '6%' }}>Variety</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'left', whiteSpace: 'nowrap', width: '7%' }}>Sample Collected By</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap', width: '4%' }}>Grain</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap', width: '3%' }}>Moist</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap', width: '4%' }}>Cutting</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap', width: '4%' }}>Bend</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap', width: '3.5%' }}>Mix</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap', width: '4%' }}>Oil/Kandu</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap', width: '2.5%' }}>SK</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap', width: '4%' }}>100 Gms</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap', width: '3.5%' }}>Paddy WB</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'left', whiteSpace: 'nowrap', width: '6%' }}>Sample Report By</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap', width: '8%' }}>Action</th>
                            </tr>
                          ) : (
                            <tr style={{ backgroundColor: '#4a148c', color: 'white' }}>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap', width: '2%' }}>SL No</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap', width: '3%' }}>Bags</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap', width: '2.5%' }}>Pkg</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'left', whiteSpace: 'nowrap', width: '9%' }}>Party Name</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'left', whiteSpace: 'nowrap', width: '7%' }}>Rice Location</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'left', whiteSpace: 'nowrap', width: '6%' }}>Variety</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'left', whiteSpace: 'nowrap', width: '7%' }}>Sample Collected By</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap', width: '4%' }}>Grain</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap', width: '3%' }}>Moist</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap', width: '4%' }}>Rice</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap', width: '4%' }}>Bend</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap', width: '3.5%' }}>Mix</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap', width: '3%' }}>Oil</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap', width: '3%' }}>Kandu</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap', width: '3%' }}>Broken</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap', width: '4%' }}>Gram Report</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'left', whiteSpace: 'nowrap', width: '6%' }}>Sample Report By</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap', width: '5%' }}>Cooking Status</th>
                              <th style={{ border: '1px solid #000', padding: '3px 4px', fontWeight: '600', fontSize: '11px', textAlign: 'center', whiteSpace: 'nowrap', width: '6%' }}>Action</th>
                            </tr>
                          )}
                        </thead>
                        <tbody>
                          {orderedEntries.map((entry, index) => {
                            const displaySlNo = index + 1;
                            const qp = entry.qualityParameters;
                            const isResampleEntry = isResampleWorkflowEntry(entry as any);
                            const smellHas = (entry as any).smellHas || (qp as any)?.smellHas;
                            const smellType = (entry as any).smellType || (qp as any)?.smellType;
                            const fallback = entryType === 'RICE_SAMPLE' ? '--' : '-';
                            const fmtVal = (rawVal: any, numericVal: any, forceDecimal = false, precision = 2) => {
                              const raw = rawVal != null ? String(rawVal).trim() : '';
                              if (raw !== '') return raw;
                              if (numericVal == null || numericVal === '') return fallback;
                              const rawNumeric = String(numericVal).trim();
                              if (!rawNumeric) return fallback;
                              const num = Number(rawNumeric);
                              if (!Number.isFinite(num) || num === 0) return fallback;
                              if (forceDecimal) return num.toFixed(precision);
                              if (entryType === 'RICE_SAMPLE') return num.toFixed(precision);
                              return rawNumeric;
                            };
                            const fmtRiceDecimal = (rawVal: any, numericVal: any) => fmtVal(rawVal, numericVal, true, 2);
                            const fmtWhole = (rawVal: any, numericVal: any) => fmtVal(rawVal, numericVal, false, 0);
                            const isProvided = (rawVal: any, numericVal: any) => {
                              const raw = rawVal != null ? String(rawVal).trim() : '';
                              if (raw !== '') return true;
                              if (numericVal == null || numericVal === '') return false;
                              const rawNumeric = String(numericVal).trim();
                              if (!rawNumeric) return false;
                              const num = Number(rawNumeric);
                              return Number.isFinite(num) && num !== 0;
                            };
                            const smixOn = qp ? (qp.smixEnabled === true || (qp.smixEnabled == null && isProvided(qp.mixSRaw, qp.mixS))) : false;
                            const lmixOn = qp ? (qp.lmixEnabled === true || (qp.lmixEnabled == null && isProvided(qp.mixLRaw, qp.mixL))) : false;
                            const wbOn = qp ? (isProvided(qp.wbRRaw, qp.wbR) || isProvided(qp.wbBkRaw, qp.wbBk)) : false;
                            const hasFullQuality = qp && ((qp.cutting1 && Number(qp.cutting1) !== 0) || (qp.bend1 && Number(qp.bend1) !== 0) || (qp.mix && Number(qp.mix) !== 0));
                            const has100Grams = qp && (qp.moisture != null || (qp as any).dryMoisture != null) && !hasFullQuality;
                            const isResampleRow = isResampleEntry;
                            return (
                              <tr key={entry.id} style={{ backgroundColor: (() => { const smellLabel = getEntrySmellLabel(entry); const smellColor = getEntrySmellColor(entry); const isLightSmell = smellLabel === 'Light'; const isDarkMediumSmell = smellLabel === 'Dark' || smellLabel === 'Medium'; if (isDarkMediumSmell) return '#ffebee'; if (isLightSmell) return '#fffde7'; if (isResampleRow) return '#fff3e0'; return entry.entryType === 'DIRECT_LOADED_VEHICLE' ? '#e3f2fd' : entry.entryType === 'LOCATION_SAMPLE' ? '#ffe0b2' : '#ffffff'; })() }}>
                                <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center', verticalAlign: 'middle', fontWeight: '600', fontSize: '12px' }}>{displaySlNo}</td>
                                {entryType !== 'RICE_SAMPLE' ? (
                                  <>
                                    <td style={{ border: '1px solid #000', padding: '1px 2px', textAlign: 'center', verticalAlign: 'middle' }}>
                                      {(() => {
                                        const typeCode = getDisplayedEntryTypeCode(entry);
                                        if (isConvertedResampleType(entry)) {
                                          const originalTypeCode = getOriginalEntryTypeCode(entry);
                                          const convertedTypeCode = getConvertedEntryTypeCode(entry);
                                          return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0px' }}><span style={{ fontSize: '8px', color: '#888' }}>{originalTypeCode}</span><span style={{ fontSize: '10px', fontWeight: 800, color: getEntryTypeTextColor(originalTypeCode) }}>{convertedTypeCode}</span></div>;
                                        }
                                        return entry.entryType === 'DIRECT_LOADED_VEHICLE'
                                          ? <span style={{ color: 'white', backgroundColor: '#1565c0', padding: '1px 3px', borderRadius: '3px', fontSize: '10px', fontWeight: 800 }}>RL</span>
                                          : entry.entryType === 'LOCATION_SAMPLE'
                                            ? <span style={{ color: 'white', backgroundColor: '#e67e22', padding: '1px 3px', borderRadius: '3px', fontSize: '10px', fontWeight: 800 }}>LS</span>
                                            : <span style={{ color: '#2e7d32', backgroundColor: '#fff', padding: '1px 3px', borderRadius: '3px', fontSize: '10px', fontWeight: 800, border: '1px solid #ccc' }}>MS</span>;
                                      })()}
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center', verticalAlign: 'middle', fontWeight: '600', fontSize: '12px' }}>{entry.bags?.toLocaleString('en-IN') || '0'}</td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', verticalAlign: 'middle', fontSize: '11px', textAlign: 'center' }}>
                                      {/^\d+$/.test(String(entry.packaging || '75')) ? `${entry.packaging || '75'} Kg` : entry.packaging || '75'}
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'left', verticalAlign: 'middle', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        <button
                                          type="button"
                                          onClick={() => openEntryDetail(entry)}
                                          style={{ background: 'transparent', border: 'none', color: '#1565c0', textDecoration: 'underline', cursor: 'pointer', fontWeight: 800, fontSize: '11px', padding: 0, textAlign: 'left' }}
                                        >
                                          {entry.entryType === 'DIRECT_LOADED_VEHICLE' && !entry.partyName?.trim() && entry.lorryNumber
                                            ? entry.lorryNumber.toUpperCase()
                                            : (toTitleCase(entry.partyName) || (entry.lorryNumber?.toUpperCase() || ''))}
                                        </button>
                                        {entry.entryType === 'DIRECT_LOADED_VEHICLE' && entry.partyName?.trim() && entry.lorryNumber ? (
                                          <div style={{ fontSize: '10px', color: '#555', fontWeight: '600' }}>{entry.lorryNumber.toUpperCase()}</div>
                                        ) : null}
                                      </div>
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'left', verticalAlign: 'middle', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{toTitleCase(entry.location) || '-'}</td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'left', verticalAlign: 'middle', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{toTitleCase(entry.variety)}</td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'left', verticalAlign: 'middle', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {renderCollectedBy(entry)}
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center', verticalAlign: 'middle', fontSize: '12px', color: '#000' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                        <div>{qp?.grainsCountRaw != null && String(qp?.grainsCountRaw).trim() !== '' ? `(${fmtWhole(qp.grainsCountRaw, qp.grainsCount)})` : (qp?.grainsCount != null && String(qp?.grainsCount).trim() !== '' ? `(${fmtWhole(null, qp.grainsCount)})` : '-')}</div>
                                        {(() => {
                                          const smellLabel = getEntrySmellLabel(entry);
                                          const smellColor = getEntrySmellColor(entry);
                                          if (smellLabel) {
                                            return (
                                              <div style={{ fontSize: '10px', fontWeight: '800', color: smellColor }}>
                                                {smellLabel} Smell
                                              </div>
                                            );
                                          }
                                          return null;
                                        })()}
                                      </div>
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center', verticalAlign: 'middle', fontSize: '11px', fontWeight: '600' }}>
                                      {qp && (fmtVal(qp.moistureRaw, qp.moisture) !== '-' || (qp as any).dryMoistureRaw != null || (qp as any).dryMoisture != null) ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                          {fmtVal((qp as any).dryMoistureRaw, (qp as any).dryMoisture) !== '-' && <div style={{ fontSize: '10px', color: '#e67e22', fontWeight: '800' }}>{fmtVal((qp as any).dryMoistureRaw, (qp as any).dryMoisture, false, 2)}%</div>}
                                          <div>{fmtVal(qp.moistureRaw, qp.moisture, false, 2)}%</div>
                                        </div>
                                      ) : '-'}
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center', verticalAlign: 'middle', fontSize: '11px', fontWeight: '600' }}>
                                      {qp && (fmtVal(qp.cutting1Raw, qp.cutting1) !== '-' || fmtVal(qp.cutting2Raw, qp.cutting2) !== '-') ? `1×${fmtVal(qp.cutting2Raw, qp.cutting2)}` : '-'}
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center', verticalAlign: 'middle', fontSize: '11px', fontWeight: '600' }}>
                                      {qp && (fmtVal(qp.bend1Raw, qp.bend1) !== '-' || fmtVal(qp.bend2Raw, qp.bend2) !== '-') ? `1×${fmtVal(qp.bend2Raw, qp.bend2)}` : '-'}
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center', verticalAlign: 'middle', fontSize: '10px' }}>
                                      {qp && fmtVal(qp.mixRaw, qp.mix) !== '-' ? (
                                        ((smixOn && fmtVal(qp.mixSRaw, qp.mixS) !== '-') || (lmixOn && fmtVal(qp.mixLRaw, qp.mixL) !== '-')) ? (
                                          <div style={{ display: 'inline-grid', gridTemplateColumns: '20px auto', alignItems: 'center', columnGap: '0px' }}>
                                            <div style={{ gridColumn: '2', fontSize: '11px', fontWeight: '600', color: '#555', textAlign: 'left' }}>{fmtVal(qp.mixRaw, qp.mix)}</div>
                                            {smixOn && fmtVal(qp.mixSRaw, qp.mixS) !== '-' && (
                                              <><div style={{ fontSize: '11px', color: '#000', textAlign: 'right', paddingRight: '2px' }}>S-</div><div style={{ fontSize: '11px', color: '#000', textAlign: 'left' }}>{fmtVal(qp.mixSRaw, qp.mixS)}</div></>
                                            )}
                                            {lmixOn && fmtVal(qp.mixLRaw, qp.mixL) !== '-' && (
                                              <><div style={{ fontSize: '11px', color: '#000', textAlign: 'right', paddingRight: '2px' }}>L-</div><div style={{ fontSize: '11px', color: '#000', textAlign: 'left' }}>{fmtVal(qp.mixLRaw, qp.mixL)}</div></>
                                            )}
                                          </div>
                                        ) : <span style={{ fontWeight: '600', color: '#555' }}>{fmtVal(qp.mixRaw, qp.mix)}</span>
                                      ) : '-'}
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center', verticalAlign: 'middle', fontSize: '11px', fontWeight: '600' }}>
                                      {qp && (fmtVal(qp.oilRaw, qp.oil) !== '-' || fmtVal(qp.kanduRaw, qp.kandu) !== '-') ? <div>{[fmtVal(qp.oilRaw, qp.oil), fmtVal(qp.kanduRaw, qp.kandu)].filter(v => v !== '-').join(' | ')}</div> : '-'}
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center', verticalAlign: 'middle', fontSize: '12px', fontWeight: '600' }}>{qp && fmtVal(qp.skRaw, qp.sk) !== '-' ? fmtVal(qp.skRaw, qp.sk) : '-'}</td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center', verticalAlign: 'middle', fontSize: '10px', fontWeight: '600', color: '#555' }}>
                                      {qp && wbOn && (fmtVal(qp.wbRRaw, qp.wbR) !== '-' || fmtVal(qp.wbBkRaw, qp.wbBk) !== '-' || fmtVal(qp.wbTRaw, qp.wbT) !== '-') ? (
                                        <div style={{ display: 'inline-grid', gridTemplateColumns: '22px auto', alignItems: 'center', columnGap: '0px' }}>
                                          {fmtVal(qp.wbRRaw, qp.wbR) !== '-' && <><div style={{ textAlign: 'right', paddingRight: '2px' }}>R-</div><div style={{ textAlign: 'left' }}>{fmtVal(qp.wbRRaw, qp.wbR)}</div></>}
                                          {fmtVal(qp.wbBkRaw, qp.wbBk) !== '-' && <><div style={{ textAlign: 'right', paddingRight: '2px' }}>BK-</div><div style={{ textAlign: 'left' }}>{fmtVal(qp.wbBkRaw, qp.wbBk)}</div></>}
                                          {fmtVal(qp.wbTRaw, qp.wbT) !== '-' && <><div style={{ textAlign: 'right', paddingRight: '2px' }}>T-</div><div style={{ textAlign: 'left' }}>{fmtVal(qp.wbTRaw, qp.wbT)}</div></>}
                                        </div>
                                      ) : '-'}
                                    </td>
                                    <td style={{
                                      border: '1px solid #000', padding: '2px 3px', textAlign: 'center', verticalAlign: 'middle', fontSize: '12px', fontWeight: '800',
                                      color: qp && fmtVal(qp.paddyWbRaw, qp.paddyWb) !== '-' ? (Number(qp.paddyWb) < 50 ? '#d32f2f' : (Number(qp.paddyWb) <= 50.5 ? '#f39c12' : '#2e7d32')) : '#000'
                                    }}>
                                      {qp && fmtVal(qp.paddyWbRaw, qp.paddyWb) !== '-' ? `${fmtVal(qp.paddyWbRaw, qp.paddyWb)} gms` : '-'}
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'left', verticalAlign: 'middle', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {qp?.reportedBy ? toSentenceCase(qp.reportedBy) : '-'}
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '2px 2px', textAlign: 'center', verticalAlign: 'middle' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'stretch' }}>
                                        <button onClick={() => handleDecision(entry.id, 'PASS_WITH_COOKING')} disabled={isSubmitting} style={{ fontSize: '10px', padding: '4px 6px', backgroundColor: isSubmitting ? '#e0e0e0' : '#28a745', color: isSubmitting ? '#999' : 'white', border: 'none', borderRadius: '4px', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: '800', boxShadow: '0 1px 2px rgba(0,0,0,0.2)', whiteSpace: 'nowrap' }}>
                                          {isSubmitting ? '...' : <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}><span style={{ fontSize: '12px' }}>🍲</span> Pass for Cook</span>}
                                        </button>
                                        <button onClick={() => handleDecision(entry.id, 'PASS_WITHOUT_COOKING')} disabled={isSubmitting} style={{ fontSize: '10px', padding: '3px 6px', backgroundColor: isSubmitting ? '#e0e0e0' : '#f39c12', color: isSubmitting ? '#999' : 'white', border: 'none', borderRadius: '4px', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: '800', boxShadow: '0 1px 2px rgba(0,0,0,0.1)', whiteSpace: 'nowrap' }}>
                                          {isSubmitting ? '...' : '✅ Pass'}
                                        </button>
                                        <button onClick={() => setFailModal({ isOpen: true, entryId: entry.id, remarks: '' })} disabled={isSubmitting} style={{ fontSize: '10px', padding: '3px 6px', backgroundColor: isSubmitting ? '#e0e0e0' : '#d9534f', color: isSubmitting ? '#999' : 'white', border: 'none', borderRadius: '4px', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: '800', boxShadow: '0 1px 2px rgba(0,0,0,0.1)', whiteSpace: 'nowrap' }}>
                                          {isSubmitting ? '...' : '❌ Fail'}
                                        </button>
                                      </div>
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center', verticalAlign: 'middle', fontWeight: '600', fontSize: '12px' }}>{entry.bags?.toLocaleString('en-IN') || '0'}</td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', verticalAlign: 'middle', fontSize: '11px', textAlign: 'center' }}>
                                      {/^\d+$/.test(String(entry.packaging || '26')) ? `${entry.packaging || '26'} Kg` : entry.packaging || '26'}
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '3px 4px', textAlign: 'left', fontSize: '13px', whiteSpace: 'nowrap' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        <button
                                          type="button"
                                          onClick={() => openEntryDetail(entry)}
                                          style={{ background: 'transparent', border: 'none', color: '#1565c0', textDecoration: 'underline', cursor: 'pointer', fontWeight: 800, fontSize: '13px', padding: 0, textAlign: 'left' }}
                                        >
                                          {entry.entryType === 'DIRECT_LOADED_VEHICLE' && !entry.partyName?.trim() && entry.lorryNumber
                                            ? entry.lorryNumber.toUpperCase()
                                            : (toTitleCase(entry.partyName) || (entry.lorryNumber?.toUpperCase() || '-'))}
                                        </button>
                                        {entry.entryType === 'DIRECT_LOADED_VEHICLE' && entry.partyName?.trim() && entry.lorryNumber ? (
                                          <div style={{ fontSize: '10px', color: '#555', fontWeight: '600' }}>{entry.lorryNumber.toUpperCase()}</div>
                                        ) : null}
                                      </div>
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'left', verticalAlign: 'middle', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{toTitleCase(entry.location) || '-'}</td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'left', verticalAlign: 'middle', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{toTitleCase(entry.variety)}</td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'left', verticalAlign: 'middle', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {renderCollectedBy(entry)}
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center', verticalAlign: 'middle', fontSize: '12px', color: '#000' }}>
                                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                        <div>{qp?.grainsCountRaw != null && String(qp?.grainsCountRaw).trim() !== '' ? `(${fmtWhole(qp.grainsCountRaw, qp.grainsCount)})` : (qp?.grainsCount != null && String(qp?.grainsCount).trim() !== '' ? `(${fmtWhole(null, qp.grainsCount)})` : fallback)}</div>
                                        {(() => {
                                          const smellLabel = getEntrySmellLabel(entry);
                                          const smellColor = getEntrySmellColor(entry);
                                          if (smellLabel) {
                                            return (
                                              <div style={{ fontSize: '10px', fontWeight: '800', color: smellColor }}>
                                                {smellLabel} Smell
                                              </div>
                                            );
                                          }
                                          return null;
                                        })()}
                                      </div>
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center', verticalAlign: 'middle', fontSize: '11px', fontWeight: '600' }}>
                                      {qp && (fmtVal(qp.moistureRaw, qp.moisture) !== fallback || (qp as any).dryMoistureRaw != null || (qp as any).dryMoisture != null) ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                          {fmtVal((qp as any).dryMoistureRaw, (qp as any).dryMoisture) !== fallback && <div style={{ fontSize: '10px', color: '#e67e22', fontWeight: '800' }}>{fmtVal((qp as any).dryMoistureRaw, (qp as any).dryMoisture, false, 2)}%</div>}
                                          <div>{fmtVal(qp.moistureRaw, qp.moisture, false, 2)}%</div>
                                        </div>
                                      ) : fallback}
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center', verticalAlign: 'middle', fontSize: '11px', fontWeight: '600' }}>
                                      {qp && fmtRiceDecimal(qp.cutting1Raw, qp.cutting1) !== fallback ? fmtRiceDecimal(qp.cutting1Raw, qp.cutting1) : fallback}
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center', verticalAlign: 'middle', fontSize: '11px', fontWeight: '600' }}>
                                      {qp && fmtRiceDecimal(qp.bend1Raw, qp.bend1) !== fallback ? fmtRiceDecimal(qp.bend1Raw, qp.bend1) : fallback}
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center', verticalAlign: 'middle', fontSize: '10px' }}>
                                      {qp && fmtRiceDecimal(qp.mixRaw, qp.mix) !== fallback ? (
                                        (fmtRiceDecimal(qp.mixSRaw, qp.mixS) !== fallback || fmtRiceDecimal(qp.mixLRaw, qp.mixL) !== fallback) ? (
                                          <div style={{ display: 'inline-grid', gridTemplateColumns: '20px auto', alignItems: 'center', columnGap: '0px' }}>
                                            <div style={{ gridColumn: '2', fontSize: '11px', fontWeight: '600', color: '#555', textAlign: 'left' }}>{fmtRiceDecimal(qp.mixRaw, qp.mix)}</div>
                                            {fmtRiceDecimal(qp.mixSRaw, qp.mixS) !== fallback && (
                                              <><div style={{ fontSize: '11px', color: '#000', textAlign: 'right', paddingRight: '2px' }}>S-</div><div style={{ fontSize: '11px', color: '#000', textAlign: 'left' }}>{fmtRiceDecimal(qp.mixSRaw, qp.mixS)}</div></>
                                            )}
                                            {fmtRiceDecimal(qp.mixLRaw, qp.mixL) !== fallback && (
                                              <><div style={{ fontSize: '11px', color: '#000', textAlign: 'right', paddingRight: '2px' }}>L-</div><div style={{ fontSize: '11px', color: '#000', textAlign: 'left' }}>{fmtRiceDecimal(qp.mixLRaw, qp.mixL)}</div></>
                                            )}
                                          </div>
                                        ) : <span style={{ fontWeight: '600', color: '#555' }}>{fmtRiceDecimal(qp.mixRaw, qp.mix)}</span>
                                      ) : fallback}
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center', verticalAlign: 'middle', fontSize: '11px', fontWeight: '600' }}>
                                      {qp && fmtRiceDecimal(qp.oilRaw, qp.oil) !== fallback ? fmtRiceDecimal(qp.oilRaw, qp.oil) : fallback}
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center', verticalAlign: 'middle', fontSize: '11px', fontWeight: '600' }}>
                                      {qp && fmtRiceDecimal(qp.kanduRaw, qp.kandu) !== fallback ? fmtRiceDecimal(qp.kanduRaw, qp.kandu) : fallback}
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center', verticalAlign: 'middle', fontSize: '12px', fontWeight: '600' }}>{qp && fmtRiceDecimal(qp.skRaw, qp.sk) !== fallback ? fmtRiceDecimal(qp.skRaw, qp.sk) : fallback}</td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center', verticalAlign: 'middle', fontSize: '11px', fontWeight: '600' }}>
                                      {formatGramsReport(qp?.gramsReport)}
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'left', verticalAlign: 'middle', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {qp?.reportedBy ? toSentenceCase(qp.reportedBy) : fallback}
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '2px 3px', textAlign: 'center', verticalAlign: 'middle', fontSize: '11px', fontWeight: '600' }}>
                                      {(() => {
                                        const cookingStatusData = (entry as any).cookingReport;
                                        const decision = (entry as any).lotSelectionDecision;

                                        if (decision === 'SOLDOUT') {
                                          return <span style={{ color: '#800000', fontWeight: '800' }}>SOLD OUT</span>;
                                        }

                                        if (!cookingStatusData) return <span style={{ color: '#f39c12' }}>Pending</span>;

                                        const status = (cookingStatusData.status || '').toUpperCase();
                                        if (!status) return <span style={{ color: '#f39c12' }}>Pending</span>;

                                        const badgeConfig = {
                                          'PASS': { color: '#27ae60', label: 'Passed', icon: '✅' },
                                          'FAIL': { color: '#dc2626', label: 'Resample', icon: '🔁' },
                                          'RECHECK': { color: '#e67e22', label: 'Recheck', icon: '📝' },
                                          'MEDIUM': { color: '#27ae60', label: 'Passed', icon: '✅' },
                                        };
                                        const config = (badgeConfig as any)[status] || { color: '#7f8c8d', label: cookingStatusData.status || status, icon: '❔' };

                                        return (
                                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                            <span style={{ color: config.color }}>{config.icon} {config.label}</span>
                                            {cookingStatusData.remarks && (
                                              <button
                                                type="button"
                                                onClick={() => setRemarksModalData({ isOpen: true, text: cookingStatusData.remarks })}
                                                style={{
                                                  marginTop: '2px',
                                                  fontSize: '9px',
                                                  padding: '2px 6px',
                                                  backgroundColor: '#f3e5f5',
                                                  color: '#4a148c',
                                                  border: '1px solid #ce93d8',
                                                  borderRadius: '10px',
                                                  cursor: 'pointer',
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  gap: '2px',
                                                  fontWeight: '700'
                                                }}
                                                title="View Remarks"
                                              >
                                                🔍 Remarks
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </td>
                                    <td style={{ border: '1px solid #000', padding: '2px 2px', textAlign: 'center', verticalAlign: 'middle' }}>
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', justifyContent: 'center' }}>
                                        {isResampleRow ? (
                                          (() => {
                                            const hasExistingCooking = (entry as any).cookingReport && ((entry as any).cookingReport.status || (entry as any).cookingReport.cookingDoneBy);
                                            return <>
                                              {!hasExistingCooking && (
                                                <button onClick={() => handleDecision(entry.id, 'PASS_WITH_COOKING')} disabled={isSubmitting} style={{ fontSize: '10px', padding: '4px 6px', backgroundColor: isSubmitting ? '#e0e0e0' : '#28a745', color: isSubmitting ? '#999' : 'white', border: 'none', borderRadius: '4px', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: '800', width: '31%', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
                                                  {isSubmitting ? '...' : '🍲 Pass'}
                                                </button>
                                              )}
                                              <button onClick={() => handleDecision(entry.id, 'PASS_WITHOUT_COOKING')} disabled={isSubmitting} style={{ fontSize: '10px', padding: '4px 6px', backgroundColor: isSubmitting ? '#e0e0e0' : hasExistingCooking ? '#28a745' : '#f39c12', color: isSubmitting ? '#999' : 'white', border: 'none', borderRadius: '4px', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: '800', width: hasExistingCooking ? '48%' : '31%', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
                                                {isSubmitting ? '...' : 'Pass'}
                                              </button>
                                            </>;
                                          })()
                                        ) : (
                                          <button onClick={() => handleDecision(entry.id, 'PASS_WITHOUT_COOKING')} disabled={isSubmitting} style={{ fontSize: '10px', padding: '4px 6px', backgroundColor: isSubmitting ? '#e0e0e0' : '#28a745', color: isSubmitting ? '#999' : 'white', border: 'none', borderRadius: '4px', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: '800', width: '48%', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
                                            {isSubmitting ? '...' : 'Pass'}
                                          </button>
                                        )}
                                        <button onClick={() => handleDecision(entry.id, 'FAIL')} disabled={isSubmitting} style={{ fontSize: '10px', padding: '4px 6px', backgroundColor: isSubmitting ? '#e0e0e0' : '#d9534f', color: isSubmitting ? '#999' : 'white', border: 'none', borderRadius: '4px', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: '800', width: '48%', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                                          {isSubmitting ? '...' : 'Fail'}
                                        </button>
                                        <button onClick={() => handleDecision(entry.id, 'SOLDOUT')} disabled={isSubmitting} style={{ fontSize: '10px', padding: '4px 6px', backgroundColor: isSubmitting ? '#e0e0e0' : '#800000', color: isSubmitting ? '#999' : 'white', border: 'none', borderRadius: '4px', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: '800', width: '100%', marginTop: '2px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                                          {isSubmitting ? '...' : 'Sold Out'}
                                        </button>
                                      </div>
                                    </td>
                                  </>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>

      {detailEntry && (
        <SampleEntryDetailModal
          detailEntry={detailEntry as any}
          detailMode="history"
          onClose={() => setDetailEntry(null)}
        />
      )}

      {/* Remarks Modal */}
      {remarksModalData.isOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 99999
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: '8px', padding: '24px', width: '380px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#333', fontSize: '16px', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>
              📝 Cooking Remarks
            </h3>
            <div style={{
              marginBottom: '20px',
              color: '#444',
              fontSize: '14px',
              lineHeight: '1.5',
              maxHeight: '200px',
              overflowY: 'auto',
              padding: '10px',
              backgroundColor: '#f9f9f9',
              borderRadius: '4px',
              border: '1px solid #e0e0e0'
            }}>
              {remarksModalData.text}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setRemarksModalData({ isOpen: false, text: '' })}
                style={{ padding: '8px 20px', backgroundColor: '#e74c3c', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pagination Controls */}
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '16px 0', marginTop: '12px' }}>
        <button
          disabled={page <= 1}
          onClick={() => setPage(p => Math.max(1, p - 1))}
          style={{ padding: '6px 16px', borderRadius: '4px', border: '1px solid #ccc', background: page <= 1 ? '#eee' : '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer', fontWeight: '600' }}
        >
          ← Prev
        </button>
        <span style={{ fontSize: '13px', color: '#666' }}>
          Page {page} of {totalPages} &nbsp;({total} total)
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          style={{ padding: '6px 16px', borderRadius: '4px', border: '1px solid #ccc', background: page >= totalPages ? '#eee' : '#fff', cursor: page >= totalPages ? 'not-allowed' : 'pointer', fontWeight: '600' }}
        >
          Next →
        </button>
      </div>

      {/* Fail Modal */}
      {failModal.isOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '8px', width: '400px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px', color: '#1f2937' }}>Fail Lot</h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '14px' }}>Reason / Remarks</label>
              <textarea
                value={failModal.remarks}
                onChange={(e) => setFailModal(prev => ({ ...prev, remarks: e.target.value }))}
                style={{ width: '100%', height: '100px', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px', resize: 'vertical' }}
                placeholder="Enter the reason for failing this lot..."
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={() => setFailModal({ isOpen: false, entryId: '', remarks: '' })}
                style={{ padding: '8px 16px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}
              >
                No (Cancel)
              </button>
              <button
                onClick={() => {
                  handleDecision(failModal.entryId, 'FAIL', failModal.remarks);
                  setFailModal({ isOpen: false, entryId: '', remarks: '' });
                }}
                disabled={!failModal.remarks.trim() || isSubmitting}
                style={{ padding: '8px 16px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: (!failModal.remarks.trim() || isSubmitting) ? 'not-allowed' : 'pointer', fontWeight: '600' }}
              >
                Yes (Fail Lot)
              </button>
            </div>
          </div>
        </div>
      )}
    </div >
  );
};

export default LotSelection;
