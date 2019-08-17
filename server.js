const express = require('express');
const app = express();
const port = process.env.PORT || 8082;
const bodyParser = require('body-parser');
const session = require('express-session');
const cors = require('cors');
const path = require('path');

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(session({
  secret: 'deduplicate_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: false }
}));

app.use(cors({
  credentials: true,
  origin: 'https://secure-peak-72116.herokuapp.com'
}));

app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, 'dist', 'deduplication-client', 'index.html'));
});

app.use('/', express.static(path.join(__dirname, 'dist', 'deduplication-client')));

var routes = require('./api/routes/deduplicateRoutes');
routes(app);

app.use((req, res) => {
  res.status(404).send({ url: req.originalUrl + ' not found' })
});

app.listen(port);

console.log('API server started on: ' + port);