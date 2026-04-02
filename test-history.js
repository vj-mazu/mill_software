require('dotenv').config();
const { attachLoadingLotsHistories } = require('./server/utils/historyUtil');
const db = require('./server/models');
const { SampleEntry } = db;

async function check() {
  await db.sequelize.authenticate();
  const entries = await SampleEntry.findAll({
    limit: 5,
    order: [['createdAt', 'DESC']],
    raw: true
  });
  const attached = await attachLoadingLotsHistories(entries);
  for (const e of attached) {
    if (e.sampleCollectedHistory && e.sampleCollectedHistory.length > 0) {
      console.log(`Entry ID: ${e.id}, original collected by: ${e.sampleCollectedBy}, decision: ${e.lotSelectionDecision}`);
      console.log(`History:`, e.sampleCollectedHistory);
      console.log('---');
    }
  }
}

check().catch(console.error).finally(() => process.exit(0));
