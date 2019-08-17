module.exports = app => {
  const deduplicateCtrl = require('../controllers/deduplicateController');

  app.route('/api/getAuthUrl')
    .get(deduplicateCtrl.getAuthUrl);

  app.route('/api/spreadsheetList')
    .get(deduplicateCtrl.spreadsheetList);

  app.route('/api/deduplicate')
    .post(deduplicateCtrl.deduplicate);
};
