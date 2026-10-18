// ========== 状态管理 ==========
let peer = null;
let conn = null;
let roomCode = '';
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let eraserMode = false;

// ========== PeerJS 配置 ==========
function getPeerConfig() {
    const serverUrl = document.getElementById('server-url').value.trim();
    const config = {
        debug: 0,
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun.services.mozilla.com:3478' }
            ]
        }
    };
    // 如果用户填了自定义服务器
    if (serverUrl) {
        try {
            const url = new URL(serverUrl);
            config.host = url.hostname;
            config.port = url.port || (url.protocol === 'https:' ? 443 : 80);
            config.path = url.pathname.replace(/\/$/, '') || '/';
            config.secure = url.protocol === 'https:';
        } catch (e) {
            console.warn('Invalid server URL, using default', e);
        }
    }
    return config;
}

// ========== DOM 元素 ==========
const screens = {
    lobby: document.getElementById('lobby'),
    create: document.getElementById('create-screen'),
    join: document.getElementById('join-screen'),
    canvas: document.getElementById('canvas-screen')
};

const canvas = document.getElementById('drawing-canvas');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('color-picker');
const brushSize = document.getElementById('brush-size');
const brushSizeLabel = document.getElementById('brush-size-label');
const btnEraser = document.getElementById('btn-eraser');
const btnClear = document.getElementById('btn-clear');
const btnDownload = document.getElementById('btn-download');
const btnLeave = document.getElementById('btn-leave');
const roleBadge = document.getElementById('role-badge');
const connectionStatus = document.getElementById('connection-status');
const currentRoomCode = document.getElementById('current-room-code');

// ========== 屏幕切换 ==========
function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
}

function goBack() {
    if (peer) { peer.destroy(); peer = null; }
    conn = null;
    showScreen('lobby');
}

// ========== 初始化画布 ==========
function initCanvas() {
    const wrapper = document.querySelector('.canvas-wrapper');
    const dpr = window.devicePixelRatio || 1;
    const width = wrapper.clientWidth;
    const height = wrapper.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
}

// ========== 画板绘制 ==========
function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    let x, y;
    if (e.touches && e.touches.length > 0) {
        x = e.touches[0].clientX - rect.left;
        y = e.touches[0].clientY - rect.top;
    } else {
        x = e.clientX - rect.left;
        y = e.clientY - rect.top;
    }
    return { x, y };
}

function drawLine(x1, y1, x2, y2, color, size, eraser) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = eraser ? '#ffffff' : color;
    ctx.lineWidth = eraser ? size * 3 : size;
    ctx.stroke();
}

function startDraw(e) {
    e.preventDefault();
    isDrawing = true;
    const pos = getPos(e);
    lastX = pos.x;
    lastY = pos.y;
    drawLine(pos.x, pos.y, pos.x, pos.y, colorPicker.value, parseInt(brushSize.value), eraserMode);
}

function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getPos(e);
    drawLine(lastX, lastY, pos.x, pos.y, colorPicker.value, parseInt(brushSize.value), eraserMode);
    if (conn && conn.open) {
        conn.send({ type: 'draw', x1: lastX, y1: lastY, x2: pos.x, y2: pos.y, color: colorPicker.value, size: parseInt(brushSize.value), eraser: eraserMode });
    }
    lastX = pos.x;
    lastY = pos.y;
}

function stopDraw() { isDrawing = false; }

canvas.addEventListener('mousedown', startDraw);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDraw);
canvas.addEventListener('mouseleave', stopDraw);
canvas.addEventListener('touchstart', startDraw, { passive: false });
canvas.addEventListener('touchmove', draw, { passive: false });
canvas.addEventListener('touchend', stopDraw);

// ========== 工具栏 ==========
brushSize.addEventListener('input', () => { brushSizeLabel.textContent = brushSize.value + 'px'; });

btnEraser.addEventListener('click', () => {
    eraserMode = !eraserMode;
    btnEraser.classList.toggle('eraser-active', eraserMode);
});

function clearCanvas() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
}

btnClear.addEventListener('click', () => {
    if (confirm('确定清空画布吗？')) {
        clearCanvas();
        if (conn && conn.open) conn.send({ type: 'clear' });
    }
});

btnDownload.addEventListener('click', () => {
    try {
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = canvas.clientWidth;
        exportCanvas.height = canvas.clientHeight;
        exportCanvas.getContext('2d').drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);
        const link = document.createElement('a');
        link.download = `drawing-${roomCode || 'local'}-${Date.now()}.png`;
        link.href = exportCanvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (err) {
        alert('下载失败: ' + err.message);
    }
});

btnLeave.addEventListener('click', () => {
    if (confirm('确定离开房间吗？')) {
        if (conn) conn.close();
        if (peer) peer.destroy();
        peer = null; conn = null;
        showScreen('lobby');
    }
});

// ========== 角色选择 ==========
document.querySelectorAll('.role-buttons').forEach(container => {
    container.querySelectorAll('.btn').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
});

function getSelectedRole(screenId) {
    const active = document.querySelector(`#${screenId} .role-buttons .btn.active`);
    return active ? active.dataset.role : 'send';
}

// ========== 连接管理 ==========
function updateStatus(text, type) {
    connectionStatus.textContent = text;
    connectionStatus.className = 'status-badge';
    if (type) connectionStatus.classList.add(type);
}

function setupConnection(connection) {
    conn = connection;
    conn.on('open', () => {
        updateStatus('已连接', 'connected');
        const imageData = canvas.toDataURL('image/jpeg', 0.5);
        conn.send({ type: 'sync', imageData });
    });
    conn.on('data', (data) => {
        if (data.type === 'draw') {
            drawLine(data.x1, data.y1, data.x2, data.y2, data.color, data.size, data.eraser);
        } else if (data.type === 'clear') {
            clearCanvas();
        } else if (data.type === 'sync') {
            const img = new Image();
            img.onload = () => {
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                ctx.restore();
            };
            img.src = data.imageData;
        }
    });
    conn.on('close', () => { updateStatus('已断开', 'error'); alert('对方已断开连接'); });
    conn.on('error', () => { updateStatus('连接错误', 'error'); });
}

// ========== 创建房间 ==========
document.getElementById('btn-create').addEventListener('click', () => {
    showScreen('create');
    document.getElementById('create-room-code').value = '';
    document.getElementById('create-room-code').focus();
});

document.getElementById('btn-start-create').addEventListener('click', () => {
    const code = document.getElementById('create-room-code').value.trim().toUpperCase();
    if (!code) { alert('请输入房间号'); return; }
    roomCode = code;
    const role = getSelectedRole('create-screen');

    showScreen('canvas');
    currentRoomCode.textContent = roomCode;
    roleBadge.textContent = role === 'send' ? '📤 发送' : '📥 接收';
    roleBadge.className = 'role-badge ' + (role === 'send' ? 'send' : 'receive');
    initCanvas();
    updateStatus('正在初始化...', '');

    const peerConfig = getPeerConfig();
    peer = new Peer('syncdraw-' + roomCode, peerConfig);

    peer.on('open', () => {
        updateStatus('等待对方加入...', '');
    });
    peer.on('connection', (connection) => { setupConnection(connection); });
    peer.on('error', (err) => {
        console.error('Peer error:', err);
        if (err.type === 'unavailable-id') {
            alert('该房间号已被占用，请换一个');
        } else if (err.type === 'network' || err.type === 'server-error') {
            updateStatus('网络错误，请检查服务器地址', 'error');
        } else {
            updateStatus('错误: ' + err.type, 'error');
        }
    });
});

// ========== 加入房间 ==========
document.getElementById('btn-join').addEventListener('click', () => {
    showScreen('join');
    document.getElementById('join-room-code').value = '';
    document.getElementById('join-room-code').focus();
});

document.getElementById('btn-start-join').addEventListener('click', () => {
    const code = document.getElementById('join-room-code').value.trim().toUpperCase();
    if (!code) { alert('请输入房间号'); return; }
    roomCode = code;
    const role = getSelectedRole('join-screen');

    showScreen('canvas');
    currentRoomCode.textContent = roomCode;
    roleBadge.textContent = role === 'send' ? '📤 发送' : '📥 接收';
    roleBadge.className = 'role-badge ' + (role === 'send' ? 'send' : 'receive');
    initCanvas();
    updateStatus('正在初始化...', '');

    const peerConfig = getPeerConfig();
    const myId = 'syncdraw-' + roomCode + '-' + Math.random().toString(36).substr(2, 6);
    peer = new Peer(myId, peerConfig);
    let connected = false;
    let retryCount = 0;
    const maxRetries = 8;

    function tryConnect() {
        if (connected) return;
        retryCount++;
        updateStatus(`连接中... (${retryCount}/${maxRetries})`, '');
        const connection = peer.connect('syncdraw-' + roomCode, { reliable: true, serialization: 'json' });
        connection.on('open', () => { connected = true; setupConnection(connection); });
        connection.on('error', () => {
            if (!connected && retryCount < maxRetries) setTimeout(tryConnect, 2000);
        });
        setTimeout(() => {
            if (!connected && retryCount < maxRetries) { connection.close(); tryConnect(); }
        }, 8000);
    }

    peer.on('open', () => { updateStatus('查找房间中...', ''); tryConnect(); });

    setTimeout(() => {
        if (!connected) {
            updateStatus('连接超时', 'error');
            alert('无法连接，请确认：\n1. 房间号是否正确\n2. 房主是否已点击「进入画板」在等待\n3. 两台设备都能上网\n\n提示：刷新页面重试');
        }
    }, 60000);

    peer.on('error', (err) => {
        console.error('Peer error:', err);
        if (err.type === 'peer-unavailable') {
            if (retryCount < maxRetries) {
                updateStatus('未找到房间，重试中...', '');
                setTimeout(tryConnect, 2000);
            } else {
                updateStatus('房间不存在', 'error');
                alert('找不到该房间，请检查房间号是否正确，以及房主是否已在等待');
            }
        } else if (err.type === 'network' || err.type === 'server-error') {
            updateStatus('网络错误，重试中...', '');
            if (retryCount < maxRetries) setTimeout(tryConnect, 2000);
        } else {
            updateStatus('错误: ' + err.type, 'error');
        }
    });
});

// ========== 窗口大小变化 ==========
window.addEventListener('resize', () => {
    if (!screens.canvas.classList.contains('active')) return;
    const imageData = canvas.toDataURL('image/png');
    const wrapper = document.querySelector('.canvas-wrapper');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = wrapper.clientWidth * dpr;
    canvas.height = wrapper.clientHeight * dpr;
    canvas.style.width = wrapper.clientWidth + 'px';
    canvas.style.height = wrapper.clientHeight + 'px';
    ctx.scale(dpr, dpr);
    const img = new Image();
    img.onload = () => { ctx.drawImage(img, 0, 0, canvas.clientWidth, canvas.clientHeight); };
    img.src = imageData;
});
