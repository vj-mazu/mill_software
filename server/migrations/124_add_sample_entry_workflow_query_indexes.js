/**
 * Migration 124: Add composite indexes for high-traffic sample workflow queries
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_sample_entries_workflow_entry_created
      ON sample_entries (workflow_status, entry_type, created_at)
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_sample_entries_workflow_decision_entry
      ON sample_entries (workflow_status, lot_selection_decision, entry_type)
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_sample_entries_collector_workflow_entry
      ON sample_entries (sample_collected_by, workflow_status, entry_type)
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_sample_entries_workflow_office_handover
      ON sample_entries (workflow_status, entry_type, sample_given_to_office)
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_sample_entries_workflow_broker_date
      ON sample_entries (workflow_status, broker_name, entry_date)
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_sample_entries_workflow_broker_date');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_sample_entries_workflow_office_handover');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_sample_entries_collector_workflow_entry');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_sample_entries_workflow_decision_entry');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_sample_entries_workflow_entry_created');
  }
};
