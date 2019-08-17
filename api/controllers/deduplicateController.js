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
    ranges: ["'A'!A2:E", "'B'!A2:E"],
  }, (err, result) => {
    if (err) return res.status(500).send(`The API returned an error: ${err}`);
    const tabA = result.data.valueRanges[0].values;
    const tabB = result.data.valueRanges[1].values;

    const deduplicated = [];
    tabA.forEach(entryA => {
      let includedEntryA = false;
      deduplicated.forEach((entryC, i, srcArr) => {
        if (entryC[0] === entryA[0] && entryC[1] === entryA[1] && entryC[2] === entryA[2]) {
          includedEntryA = true;
          srcArr[i] = [
            entryC[0],
            entryC[1],
            entryC[2],
            entryA[3] || entryC[3],
            entryA[4] || entryC[4]
          ];
        }
      });

      if (!includedEntryA) deduplicated.push(entryA);
    });

    tabB.forEach(entryB => {
      let includedEntryB = false;
      deduplicated.forEach((entryC, i, srcArr) => {
        if (entryB[0] === entryC[0] && entryB[1] === entryC[1] && entryB[2] === entryC[2]) {
          includedEntryB = true;
          srcArr[i] = [
            entryC[0],
            entryC[1],
            entryC[2],
            entryC[3] || entryB[3],
            entryC[4] || entryB[4]
          ];
        }
      });

      if (!includedEntryB) deduplicated.push(entryB);
    })

    sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: "'C'!A2",
      resource: { values: deduplicated },
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