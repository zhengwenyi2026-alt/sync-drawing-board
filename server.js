const { ExpressPeerServer } = require('peer');
const express = require('express');

const app = express();

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Sync Drawing PeerJS Server' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const peerServer = ExpressPeerServer(app, {
  debug: false,
  allow_discovery: false,
  path: '/',
});

app.use('/peerjs', peerServer);

// Vercel serverless export
module.exports = app;
