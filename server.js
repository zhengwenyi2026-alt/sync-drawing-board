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

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`PeerJS server running on port ${PORT}`);
});

peerServer.on('connection', (client) => {
  console.log('Client connected:', client.getId());
});

peerServer.on('disconnect', (client) => {
  console.log('Client disconnected:', client.getId());
});

module.exports = server;
