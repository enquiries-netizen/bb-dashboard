/**
 * Marketing_Sources daily sync triggers.
 *
 * Paste into the master spreadsheet Apps Script project (same project as
 * syncPipelineToMarketingSources and syncMarketingPaidToSources).
 * Spreadsheet: 17gNgYCC2rwAKGHtuhaApxeCa-6qxyI0gBB71ifciNv8
 *
 * Run setupTriggers() once after pasting to install the daily 6am builders.
 *
 * Schedule: every day at 6:00 AM (adjust the .atHour(6) value if needed).
 * To remove owned triggers only: run deleteTriggers().
 */

var MARKETING_SOURCES_TRIGGER_HANDLERS = [
  'syncPipelineToMarketingSources',
  'syncMarketingPaidToSources'
];

function deleteTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (MARKETING_SOURCES_TRIGGER_HANDLERS.indexOf(triggers[i].getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }
  Logger.log('Removed ' + removed + ' Marketing_Sources trigger(s)');
}

function setupTriggers() {
  // Remove only this file's triggers first to avoid duplicates
  deleteTriggers();

  // Trigger 1: rebuild Marketing_Sources rows from GHL_Pipeline + GHL_Leads
  ScriptApp.newTrigger('syncPipelineToMarketingSources')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();

  // Trigger 2: fill Conversion %, Cost ($), CPL ($) from Marketing_Paid
  ScriptApp.newTrigger('syncMarketingPaidToSources')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();

  SpreadsheetApp.getUi().alert(
    'Daily triggers set!\n\n' +
    'Both scripts will now run automatically every day around 6:00 AM.\n\n' +
    'You can verify them under:\n' +
    'Extensions -> Apps Script -> Triggers (clock icon on left sidebar)'
  );
}
