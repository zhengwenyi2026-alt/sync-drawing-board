// ========== 状态管理 ==========
let peer = null;
let conn = null;
let roomCode = '';
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let eraserMode = false;

// ========== PeerJS 配置（加速连接） ==========
const peerConfig = {
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
    if (peer) {
        peer.destroy();
        peer = null;
    }
    conn = null;
    showScreen('lobby');
}

// ========== 生成房间号 ==========
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
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

// ========== 画板绘制逻辑 ==========
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
    e.preventDefault(); // 阻止触摸默认行为（滚动等）
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

    // 发送绘制数据到对端
    if (conn && conn.open) {
        conn.send({
            type: 'draw',
            x1: lastX,
            y1: lastY,
            x2: pos.x,
            y2: pos.y,
            color: colorPicker.value,
            size: parseInt(brushSize.value),
            eraser: eraserMode
        });
    }

    lastX = pos.x;
    lastY = pos.y;
}

function stopDraw() {
    isDrawing = false;
}

// 画布事件
canvas.addEventListener('mousedown', startDraw);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDraw);
canvas.addEventListener('mouseleave', stopDraw);
canvas.addEventListener('touchstart', startDraw, { passive: false });
canvas.addEventListener('touchmove', draw, { passive: false });
canvas.addEventListener('touchend', stopDraw);

// ========== 工具栏事件 ==========
brushSize.addEventListener('input', () => {
    brushSizeLabel.textContent = brushSize.value + 'px';
});

btnEraser.addEventListener('click', () => {
    eraserMode = !eraserMode;
    btnEraser.classList.toggle('eraser-active', eraserMode);
});

btnClear.addEventListener('click', () => {
    if (confirm('确定清空画布吗？')) {
        clearCanvas();
        if (conn && conn.open) {
            conn.send({ type: 'clear' });
        }
    }
});

function clearCanvas() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
}

// 下载功能
btnDownload.addEventListener('click', () => {
    try {
        // 创建一个临时 canvas 来导出（避免 DPR 问题）
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = canvas.clientWidth;
        exportCanvas.height = canvas.clientHeight;
        const exportCtx = exportCanvas.getContext('2d');
        exportCtx.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);

        const dataURL = exportCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `drawing-${roomCode || 'local'}-${Date.now()}.png`;
        link.href = dataURL;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (err) {
        console.error('Download error:', err);
        alert('下载失败: ' + err.message);
    }
});

btnLeave.addEventListener('click', () => {
    if (confirm('确定离开房间吗？')) {
        if (conn) conn.close();
        if (peer) peer.destroy();
        peer = null;
        conn = null;
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
    const container = document.querySelector(`#${screenId} .role-buttons`);
    const active = container.querySelector('.btn.active');
    return active ? active.dataset.role : 'send';
}

// ========== PeerJS 连接 ==========
function updateStatus(text, type) {
    connectionStatus.textContent = text;
    connectionStatus.className = 'status-badge';
    if (type) connectionStatus.classList.add(type);
}

function createPeer(id) {
    return new Peer('syncdraw-' + id, peerConfig);
}

function setupConnection(connection) {
    conn = connection;

    conn.on('open', () => {
        updateStatus('已连接 ✓', 'connected');
        // 双方都发送当前画布状态进行同步
        const imageData = canvas.toDataURL('image/jpeg', 0.5);
        conn.send({ type: 'sync', imageData: imageData });
    });

    conn.on('data', (data) => {
        if (data.type === 'draw') {
            // 接收远程绘制
            drawLine(data.x1, data.y1, data.x2, data.y2, data.color, data.size, data.eraser);
        } else if (data.type === 'clear') {
            clearCanvas();
        } else if (data.type === 'sync') {
            // 接收完整画布同步
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

    conn.on('close', () => {
        updateStatus('已断开', 'error');
        alert('对方已断开连接');
    });

    conn.on('error', (err) => {
        console.error('Connection error:', err);
        updateStatus('连接错误', 'error');
    });
}

// ========== 发起房间 ==========
document.getElementById('btn-create').addEventListener('click', () => {
    roomCode = generateRoomCode();
    document.getElementById('room-code-display').textContent = roomCode;
    showScreen('create');
});

document.getElementById('btn-start-create').addEventListener('click', () => {
    const role = getSelectedRole('create-screen');
    showScreen('canvas');
    currentRoomCode.textContent = roomCode;
    roleBadge.textContent = role === 'send' ? '📤 发送' : '📥 接收';
    roleBadge.className = 'role-badge ' + (role === 'send' ? 'send' : 'receive');
    initCanvas();
    updateStatus('正在初始化...', '');

    peer = createPeer(roomCode);

    peer.on('open', () => {
        updateStatus('等待对方加入...', '');
    });

    peer.on('connection', (connection) => {
        setupConnection(connection);
    });

    peer.on('error', (err) => {
        console.error('Peer error:', err);
        if (err.type === 'unavailable-id') {
            alert('房间号已被占用，请返回重新发起');
        } else if (err.type === 'network' || err.type === 'server-error') {
            updateStatus('网络错误，请刷新重试', 'error');
        } else {
            updateStatus('错误: ' + err.type, 'error');
        }
    });
});

// ========== 加入房间 ==========
document.getElementById('btn-join').addEventListener('click', () => {
    showScreen('join');
    document.getElementById('room-code-input').value = '';
    document.getElementById('room-code-input').focus();
});

document.getElementById('btn-start-join').addEventListener('click', () => {
    const inputCode = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (!inputCode || inputCode.length < 4) {
        alert('请输入有效的房间号');
        return;
    }

    roomCode = inputCode;
    const role = getSelectedRole('join-screen');

    showScreen('canvas');
    currentRoomCode.textContent = roomCode;
    roleBadge.textContent = role === 'send' ? '📤 发送' : '📥 接收';
    roleBadge.className = 'role-badge ' + (role === 'send' ? 'send' : 'receive');
    initCanvas();
    updateStatus('正在连接...', '');

    const myId = generateRoomCode();
    peer = createPeer(myId);

    peer.on('open', () => {
        updateStatus('正在连接到房间...', '');
        const connection = peer.connect('syncdraw-' + roomCode, {
            reliable: true,
            serialization: 'json'
        });
        setupConnection(connection);

        // 连接超时检测
        setTimeout(() => {
            if (!conn || !conn.open) {
                updateStatus('连接超时，请检查房间号', 'error');
            }
        }, 15000);
    });

    peer.on('error', (err) => {
        console.error('Peer error:', err);
        if (err.type === 'peer-unavailable') {
            updateStatus('房间不存在', 'error');
            alert('找不到该房间，请检查房间号是否正确，以及房主是否已在线等待');
        } else {
            updateStatus('连接错误: ' + err.type, 'error');
        }
    });
});

// ========== 窗口大小变化 ==========
window.addEventListener('resize', () => {
    if (screens.canvas.classList.contains('active')) {
        const imageData = canvas.toDataURL('image/png');
        const wrapper = document.querySelector('.canvas-wrapper');
        const dpr = window.devicePixelRatio || 1;
        canvas.width = wrapper.clientWidth * dpr;
        canvas.height = wrapper.clientHeight * dpr;
        canvas.style.width = wrapper.clientWidth + 'px';
        canvas.style.height = wrapper.clientHeight + 'px';
        ctx.scale(dpr, dpr);
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.clientWidth, canvas.clientHeight);
        };
        img.src = imageData;
    }
});
