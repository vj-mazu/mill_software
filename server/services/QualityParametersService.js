const QualityParametersRepository = require('../repositories/QualityParametersRepository');
const ValidationService = require('../services/ValidationService');
const AuditService = require('../services/AuditService');
const SampleEntryRepository = require('../repositories/SampleEntryRepository');
const WorkflowEngine = require('../services/WorkflowEngine');
const { attachLoadingLotsHistories } = require('../utils/historyUtil');

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

const shouldMoveResampleToLotSelection = (entry = {}) => {
  if (!isResampleWorkflowEntry(entry)) return false;
  if (entry.resampleDecisionAt) return false;
  if (entry.resampleTriggerRequired) {
    return Boolean(entry.resampleTriggeredAt);
  }
  return true;
};

const buildQualityAttemptSnapshot = (quality = {}) => ({
  id: quality.id,
  reportedBy: quality.reportedBy || '',
  reportedByUserId: quality.reportedByUserId || null,
  moisture: quality.moisture,
  moistureRaw: quality.moistureRaw || '',
  dryMoisture: quality.dryMoisture,
  dryMoistureRaw: quality.dryMoistureRaw || '',
  cutting1: quality.cutting1,
  cutting1Raw: quality.cutting1Raw || '',
  cutting2: quality.cutting2,
  cutting2Raw: quality.cutting2Raw || '',
  bend1: quality.bend1,
  bend1Raw: quality.bend1Raw || '',
  bend2: quality.bend2,
  bend2Raw: quality.bend2Raw || '',
  mix: quality.mix,
  mixRaw: quality.mixRaw || '',
  mixS: quality.mixS,
  mixSRaw: quality.mixSRaw || '',
  mixL: quality.mixL,
  mixLRaw: quality.mixLRaw || '',
  kandu: quality.kandu,
  kanduRaw: quality.kanduRaw || '',
  oil: quality.oil,
  oilRaw: quality.oilRaw || '',
  sk: quality.sk,
  skRaw: quality.skRaw || '',
  grainsCount: quality.grainsCount,
  grainsCountRaw: quality.grainsCountRaw || '',
  wbR: quality.wbR,
  wbRRaw: quality.wbRRaw || '',
  wbBk: quality.wbBk,
  wbBkRaw: quality.wbBkRaw || '',
  wbT: quality.wbT,
  wbTRaw: quality.wbTRaw || '',
  paddyWb: quality.paddyWb,
  paddyWbRaw: quality.paddyWbRaw || '',
  smellHas: !!quality.smellHas,
  smellType: quality.smellType || '',
  gramsReport: quality.gramsReport || '',
  uploadFileUrl: quality.uploadFileUrl || null,
  gpsCoordinates: quality.gpsCoordinates || '',
  createdAt: quality.createdAt || null,
  updatedAt: quality.updatedAt || null
});

const appendQualityAttemptSnapshot = async (sampleEntryId, currentQuality) => {
  const sampleEntry = await SampleEntryRepository.findById(sampleEntryId);
  if (!sampleEntry || !currentQuality) return;

  const existingAttempts = Array.isArray(sampleEntry.qualityAttemptDetails)
    ? [...sampleEntry.qualityAttemptDetails].filter(Boolean)
    : [];

  const snapshot = buildQualityAttemptSnapshot(currentQuality);
  const alreadyIncluded = existingAttempts.some((attempt) => (
    (attempt?.id && snapshot.id && String(attempt.id) === String(snapshot.id))
    || (
      String(attempt?.updatedAt || attempt?.createdAt || '') === String(snapshot.updatedAt || snapshot.createdAt || '')
      && String(attempt?.reportedBy || '') === String(snapshot.reportedBy || '')
      && String(attempt?.smellType || '') === String(snapshot.smellType || '')
      && String(attempt?.moistureRaw || attempt?.moisture || '') === String(snapshot.moistureRaw || snapshot.moisture || '')
    )
  ));

  if (alreadyIncluded) return;

  existingAttempts.push({
    ...snapshot,
    attemptNo: existingAttempts.length + 1
  });

  await SampleEntryRepository.update(sampleEntryId, {
    qualityAttemptDetails: existingAttempts
  });
};

const hydrateSampleEntryWorkflowState = async (entry) => {
  if (!entry) return entry;
  await attachLoadingLotsHistories([entry]);
  return entry;
};

class QualityParametersService {
  /**
   * Reset all quality parameter fields (for recheck)
   * @param {number} sampleEntryId - Sample entry ID
   * @param {number} userId - User ID performing the reset
   * @returns {Promise<boolean>} Success status
   */
  async resetQualityParameters(sampleEntryId, userId) {
    try {
      const current = await QualityParametersRepository.findBySampleEntryId(sampleEntryId);
      if (!current) return false;

      const emptyFields = {
        moisture: 0,
        tempMoisture: 0,
        dryMoisture: 0,
        cutting1: 0,
        cutting2: 0,
        bend1: 0,
        bend2: 0,
        mix: '',
        mixS: '',
        mixL: '',
        kandu: '',
        oil: '',
        sk: '',
        grainsCount: 0,
        wbR: 0,
        wbBk: 0,
        wbT: 0,
        paddyWb: 0,
        reportedBy: '', // non-null constraint
        smellHas: false,
        smellType: '',
        smixEnabled: false,
        lmixEnabled: false,
        paddyWbEnabled: false,
        wbEnabled: false,
        dryMoistureEnabled: false,
        is100Grams: false,
        uploadFileUrl: null,
        // Raw fields
        moistureRaw: '',
        dryMoistureRaw: '',
        cutting1Raw: '',
        cutting2Raw: '',
        bend1Raw: '',
        bend2Raw: '',
        mixRaw: '',
        mixSRaw: '',
        mixLRaw: '',
        kanduRaw: '',
        oilRaw: '',
        skRaw: '',
        grainsCountRaw: '',
        wbRRaw: '',
        wbBkRaw: '',
        wbTRaw: '',
        paddyWbRaw: ''
      };

      const updated = await QualityParametersRepository.update(current.id, emptyFields);
      if (updated) {
        await AuditService.logUpdate(userId, 'quality_parameters', current.id, current, updated);
      }
      return !!updated;
    } catch (error) {
      console.error('Error resetting quality parameters:', error);
      throw error;
    }
  }

  /**
   * Add quality parameters to a sample entry
   * @param {Object} qualityData - Quality parameters data
   * @param {number} userId - User ID adding the parameters
   * @param {string} userRole - User role
   * @returns {Promise<Object>} Created quality parameters
   */
  async addQualityParameters(qualityData, userId, userRole) {
    try {
      // Validate input data
      const validation = ValidationService.validateQualityParameters(qualityData);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Auto-fill reportedBy with current user
      qualityData.reportedByUserId = userId;

      // Create quality parameters
      const quality = await QualityParametersRepository.create(qualityData);

      // Log audit trail
      await AuditService.logCreate(userId, 'quality_parameters', quality.id, quality);

      const sampleEntry = await SampleEntryRepository.findById(qualityData.sampleEntryId);
      await hydrateSampleEntryWorkflowState(sampleEntry);
      const workflowStatus = String(sampleEntry?.workflowStatus || '').toUpperCase();
      const lotSelectionDecision = String(sampleEntry?.lotSelectionDecision || '').toUpperCase();

      // Auto-fail logic for smell (Medium, Dark, Orange ONLY)
      const shouldAutoFail = qualityData.smellHas && ['MEDIUM', 'DARK', 'ORANGE'].includes(String(qualityData.smellType).toUpperCase());
      if (shouldAutoFail && sampleEntry && lotSelectionDecision !== 'FAIL') {
        console.log(`[QUALITY] Auto-failing entry ${qualityData.sampleEntryId} due to smell: ${qualityData.smellType}`);
        await SampleEntryRepository.update(qualityData.sampleEntryId, {
          workflowStatus: 'FAILED',
          lotSelectionDecision: 'FAIL',
          lotSelectionAt: new Date(),
          lotSelectionByUserId: userId,
          failRemarks: `Auto-failed due to smell: ${qualityData.smellType || 'Yes'}`,
          smellHas: true,
          smellType: qualityData.smellType
        });
      } else if (sampleEntry) {
        // Sync smell data regardless of type (but don't auto-fail if it's Light)
        await SampleEntryRepository.update(qualityData.sampleEntryId, {
          smellHas: !!qualityData.smellHas,
          smellType: qualityData.smellType || null
        });
      }

      // Transition workflow to LOT_SELECTION (from STAFF_ENTRY) once quality is added
      if (sampleEntry) {
        let transitioned = false;
        if (workflowStatus === 'STAFF_ENTRY') {
          const nextStatus = 'LOT_SELECTION';
          console.log(`[QUALITY] Transitioning fresh entry ${qualityData.sampleEntryId} from STAFF_ENTRY to ${nextStatus}`);
          await WorkflowEngine.transitionTo(
            qualityData.sampleEntryId,
            nextStatus,
            userId,
            userRole
          );
          transitioned = true;
        } else if (workflowStatus === 'QUALITY_CHECK') {
          // Auto-transition logic for rechecks
          try {
            const SampleEntryAuditLog = require('../models/SampleEntryAuditLog');
            const transitions = await SampleEntryAuditLog.findAll({
              where: {
                tableName: 'sample_entries',
                actionType: 'WORKFLOW_TRANSITION',
                recordId: qualityData.sampleEntryId
              },
              order: [['createdAt', 'DESC']],
              limit: 50,
              raw: true
            });

            const latestRecheck = transitions.find(log => log?.metadata?.recheckRequested === true);
             
            if (latestRecheck?.metadata?.recheckType === 'both') {
              console.log(`[QUALITY] Auto-transitioning 'BOTH' recheck lot ${sampleEntry.id} to COOKING_REPORT`);
              await WorkflowEngine.transitionTo(
                qualityData.sampleEntryId,
                'COOKING_REPORT',
                userId,
                userRole,
                { recheckType: 'both', qualityParametersId: quality.id, autoTransitionFromBoth: true }
              );
              transitioned = true;
            } else if (latestRecheck?.metadata?.recheckType === 'quality' || latestRecheck?.metadata?.recheckType === 'standard_recheck') {
              console.log(`[QUALITY] Auto-transitioning 'QUALITY' recheck lot ${qualityData.sampleEntryId} from QUALITY_CHECK to LOT_SELECTION`);
              await WorkflowEngine.transitionTo(
                qualityData.sampleEntryId,
                'LOT_SELECTION',
                userId,
                userRole
              );
              transitioned = true;
            }
          } catch (auditErr) {
            console.log(`[QUALITY] Skipping auto-transition: ${auditErr.message}`);
          }
        }

        if (!transitioned && shouldMoveResampleToLotSelection(sampleEntry) && ['QUALITY_CHECK', 'FINAL_REPORT', 'LOT_ALLOTMENT', 'STAFF_ENTRY'].includes(workflowStatus)) {
          // Only transition if we haven't logged this resample completion yet (prevents 3rd sample duplication)
          const history = await AuditService.getRecordHistory('sample_entries', qualityData.sampleEntryId);
          const alreadyLogged = (history || []).some(log => 
            log.actionType === 'WORKFLOW_TRANSITION' && 
            log.newValues?.workflowStatus === 'LOT_SELECTION' && 
            log.metadata?.resampleQualitySaved === true
          );

          if (!alreadyLogged) {
            console.log(`[QUALITY] Transitioning resample entry ${qualityData.sampleEntryId} from ${workflowStatus} to LOT_SELECTION`);
            await WorkflowEngine.transitionTo(
              qualityData.sampleEntryId,
              'LOT_SELECTION',
              userId,
              userRole,
              { resampleQualitySaved: true }
            );
          } else {
            console.log(`[QUALITY] Resample quality already logged for ${qualityData.sampleEntryId}, skipping transition`);
          }
          transitioned = true;
        }

        if (!transitioned) {
          console.log(`[QUALITY] Skipping transition for ${qualityData.sampleEntryId}: current status is ${sampleEntry?.workflowStatus}`);
        }
      }

      return quality;
    } catch (error) {
      console.error('Error adding quality parameters:', error);
      throw error;
    }
  }

  /**
   * Get quality parameters by sample entry ID
   * @param {number} sampleEntryId - Sample entry ID
   * @returns {Promise<Object|null>} Quality parameters or null
   */
  async getQualityParametersBySampleEntry(sampleEntryId) {
    return await QualityParametersRepository.findBySampleEntryId(sampleEntryId);
  }

  /**
   * Update quality parameters
   * @param {number} id - Quality parameters ID
   * @param {Object} updates - Fields to update
   * @param {number} userId - User ID performing the update
   * @returns {Promise<Object|null>} Updated quality parameters or null
   */
  async updateQualityParameters(id, updates, userId, userRole, options = {}) {
    try {
      // Get current quality parameters
      const current = await QualityParametersRepository.findBySampleEntryId(updates.sampleEntryId);
      if (!current) {
        throw new Error('Quality parameters not found');
      }

      // Validate updates
      const validation = ValidationService.validateQualityParameters(updates);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      if (options.createNewAttempt === true) {
        await appendQualityAttemptSnapshot(updates.sampleEntryId, current);
      }

      // Update quality parameters
      const updated = await QualityParametersRepository.update(id, updates);

      // Auto-fail logic for smell (Medium, Dark, Orange ONLY) - sync to SampleEntry
      const shouldAutoFailPostUpdate = updates.smellHas && ['MEDIUM', 'DARK', 'ORANGE'].includes(String(updates.smellType).toUpperCase());
      if (shouldAutoFailPostUpdate) {
        await SampleEntryRepository.update(updates.sampleEntryId, {
          workflowStatus: 'FAILED',
          lotSelectionDecision: 'FAIL',
          lotSelectionAt: new Date(),
          lotSelectionByUserId: userId,
          failRemarks: `Auto-failed due to smell: ${updates.smellType || 'Yes'}`,
          smellHas: true,
          smellType: updates.smellType
        });
      } else if (updates.smellHas !== undefined) {
        // Sync smell even if not auto-failing
        await SampleEntryRepository.update(updates.sampleEntryId, {
          smellHas: !!updates.smellHas,
          smellType: updates.smellType || null
        });
      }

      // Log audit trail
      await AuditService.logUpdate(userId, 'quality_parameters', id, current, updated);

      // If upgrading from 100g to full quality (is100Grams=false), transition workflow
      if (userRole) {
        try {
          const sampleEntry = await SampleEntryRepository.findById(updates.sampleEntryId);
          await hydrateSampleEntryWorkflowState(sampleEntry);
          const workflowStatus = String(sampleEntry?.workflowStatus || '').toUpperCase();
          const lotSelectionDecision = String(sampleEntry?.lotSelectionDecision || '').toUpperCase();
          if (
            sampleEntry
            && (
              workflowStatus === 'STAFF_ENTRY'
              || (shouldMoveResampleToLotSelection(sampleEntry) && ['QUALITY_CHECK', 'FINAL_REPORT', 'LOT_ALLOTMENT'].includes(workflowStatus))
            )
          ) {
            // Only transition if we haven't logged this resample completion yet
            const history = await AuditService.getRecordHistory('sample_entries', updates.sampleEntryId);
            const alreadyLogged = (history || []).some(log => 
              log.actionType === 'WORKFLOW_TRANSITION' && 
              log.newValues?.workflowStatus === 'LOT_SELECTION' && 
              log.metadata?.resampleQualitySaved === true
            );

            if (!alreadyLogged) {
              let targetStatus = 'LOT_SELECTION';
              await WorkflowEngine.transitionTo(
                updates.sampleEntryId,
                targetStatus,
                userId,
                userRole,
                isResampleWorkflowEntry(sampleEntry) ? { resampleQualitySaved: true } : {}
              );
            } else {
              console.log(`[QUALITY] Resample quality already logged for ${updates.sampleEntryId}, skipping redundant transition`);
            }
          }
        } catch (weErr) {
          console.log(`[QUALITY] WE transition failed: ${weErr.message}`);
        }
      }

      return updated;
    } catch (error) {
      console.error('Error updating quality parameters:', error);
      throw error;
    }
  }
}

module.exports = new QualityParametersService();
