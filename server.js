const { ExpressPeerServer } = require('peer');
const express = require('express');

const app = express();
app.use(express.json());

// 健康检查
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'PeerJS Server' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// PeerJS 信令服务
const peerServer = ExpressPeerServer(app, {
  debug: false,
  allow_discovery: false,
  path: '/',
  ssl: {},
  generateClientId: () => {
    // 允许客户端自定义 ID（房间号）
    return undefined;
  }
});

app.use('/peerjs', peerServer);

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`PeerJS server running on port ${PORT}`);
});

// 保持连接活跃
peerServer.on('connection', (client) => {
  console.log('Client connected:', client.getId());
});

peerServer.on('disconnect', (client) => {
  console.log('Client disconnected:', client.getId());
});

module.exports = server;
