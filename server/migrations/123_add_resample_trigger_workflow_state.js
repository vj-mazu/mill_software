/**
 * Migration 123: Persist special resample trigger workflow state
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('sample_entries');

    if (!table.resample_origin_decision) {
      await queryInterface.addColumn('sample_entries', 'resample_origin_decision', {
        type: Sequelize.STRING(30),
        allowNull: true
      });
    }

    if (!table.resample_trigger_required) {
      await queryInterface.addColumn('sample_entries', 'resample_trigger_required', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }

    if (!table.resample_triggered_at) {
      await queryInterface.addColumn('sample_entries', 'resample_triggered_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    if (!table.resample_decision_at) {
      await queryInterface.addColumn('sample_entries', 'resample_decision_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    if (!table.resample_after_final) {
      await queryInterface.addColumn('sample_entries', 'resample_after_final', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_sample_entries_resample_trigger
      ON sample_entries (resample_trigger_required, resample_triggered_at, resample_decision_at, workflow_status)
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_sample_entries_resample_assignment
      ON sample_entries (sample_collected_by, resample_trigger_required, workflow_status)
    `);

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_sample_entries_resample_after_final
      ON sample_entries (resample_after_final, workflow_status, lot_selection_decision)
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_sample_entries_resample_after_final');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_sample_entries_resample_assignment');
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS idx_sample_entries_resample_trigger');
    await queryInterface.removeColumn('sample_entries', 'resample_after_final').catch(() => {});
    await queryInterface.removeColumn('sample_entries', 'resample_decision_at').catch(() => {});
    await queryInterface.removeColumn('sample_entries', 'resample_triggered_at').catch(() => {});
    await queryInterface.removeColumn('sample_entries', 'resample_trigger_required').catch(() => {});
    await queryInterface.removeColumn('sample_entries', 'resample_origin_decision').catch(() => {});
  }
};
