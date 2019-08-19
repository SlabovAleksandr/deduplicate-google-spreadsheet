const { google } = require('googleapis');
const { credentials } = require('./../../config/google-credentials');

exports.getAuthUrl = (req, res) => {
  const SCOPES = [
    'https://www.googleapis.com/auth/drive.metadata.readonly',
    'https://www.googleapis.com/auth/spreadsheets'
  ];

  const oAuth2Client = new google.auth.OAuth2(
    credentials.client_id, credentials.client_secret, credentials.redirect_uris[0]
  );

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  return res.send({ authUrl });
}

exports.spreadsheetList = (req, res) => {
  const oAuth2Client = new google.auth.OAuth2(
    credentials.client_id, credentials.client_secret, credentials.redirect_uris[0]
  );

  if (req.session.authToken) {
    oAuth2Client.setCredentials(req.session.authToken);
    getSheetsList(oAuth2Client, res);
    return;
  }

  const { code } = req.query;
  if (!code) {
    return res.status(400).send('Auth code is not provided');
  }

  oAuth2Client.getToken(code, (err, token) => {
    if (err) {
      return res.status(500).send(`Error while trying to retrieve access token: ${err}`);
    }

    oAuth2Client.setCredentials(token);
    req.session.authToken = token;

    getSheetsList(oAuth2Client, res);
  });
};

exports.deduplicate = (req, res) => {
  const { id } = req.body;

  if (!id) {
    return res.status(403).send('Spreadsheet id is not provided');
  }

  if (!req.session.authToken) {
    return res.status(400).send('Token is not defined');    
  }

  const oAuth2Client = new google.auth.OAuth2(
    credentials.client_id, credentials.client_secret, credentials.redirect_uris[0]
  );

  oAuth2Client.setCredentials(req.session.authToken);

  const sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
  sheets.spreadsheets.values.batchGet({
    spreadsheetId: id,
    ranges: ["'A'!A1:Z", "'B'!A1:Z"],
  }, (err, result) => {
    if (err) return res.status(500).send(`The API returned an error: ${err}`);
    const tabA = result.data.valueRanges[0].values;
    const tabB = result.data.valueRanges[1].values;
    const rowKeysA = {};
    const rowKeysB = {};

    for (const [key, rowName] of tabA.shift().entries()) {
      rowKeysA[rowName] = key;
    }
    for (const [key, rowName] of tabB.shift().entries()) {
      rowKeysB[rowName] = key;
    }

    const deduplicated = [];
    tabA.forEach(entryA => {
      let includedEntryA = false;

      for (const [key, entryC] of deduplicated.entries()) {
        if (
          entryC.firstName === entryA[rowKeysA.firstName]
          && entryC.lastName === entryA[rowKeysA.lastName]
          && entryC.email === entryA[rowKeysA.email]
        ) {
          includedEntryA = true;
          for (const rowName in rowKeysA) {
            deduplicated[key][rowName] = entryC[rowName] || entryA[rowKeysA[rowName]];
          }
          break;
        }
      }

      if (!includedEntryA) {
        const entryAobj = {};
        for (const rowName in rowKeysA) { 
          entryAobj[rowName] = entryA[rowKeysA[rowName]];
        }
        deduplicated.push(entryAobj);
      }
    });

    tabB.forEach(entryB => {
      let includedEntryB = false;

      for (const [key, entryC] of Object.entries(deduplicated)) {
        if (
          entryB[rowKeysB.firstName] === entryC.firstName
          && entryB[rowKeysB.lastName] === entryC.lastName
          && entryB[rowKeysB.email] === entryC.email
        ) {
          includedEntryB = true;
          for (const rowName in rowKeysB) { 
            deduplicated[key][rowName] = entryC[rowName] || entryB[rowKeysB[rowName]];
          }
          break;
        }
      }

      if (!includedEntryB) {
        const entryBobj = {};
        for (const rowName in rowKeysA) { 
          entryBobj[rowName] = entryB[rowKeysB[rowName]];
        }
        deduplicated.push(entryBobj);
      }
    })

    deduplicated.unshift(Object.keys(rowKeysA));

    sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: "'C'!A1",
      resource: { values: deduplicated.map( Object.values ) },
      valueInputOption: 'RAW'
    }, (err, result) => {
      if (err) return res.status(500).send(`The API returned an error: ${err}`);
      res.send();
    });
  });
};

function getSheetsList(auth, res) {
  const drive = google.drive({ version: 'v3', auth });
  drive.files.list({
    fields: 'nextPageToken, files(id, name)',
    q: "mimeType='application/vnd.google-apps.spreadsheet'"
  }, (err, result) => {
    if (err) res.status(500).send(`The API returned an error: ${err}`);

    return res.send({ spreadsheetList: result.data.files });
  });
}