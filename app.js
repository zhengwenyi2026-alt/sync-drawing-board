// ========== 状态管理 ==========
let peer = null;
let conn = null;
let roomCode = '';
let myRole = 'send'; // 'send' or 'receive'
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let eraserMode = false;

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
    const dpr = window.devicePixelRatio || 1;
    let x, y;
    if (e.touches) {
        x = (e.touches[0].clientX - rect.left);
        y = (e.touches[0].clientY - rect.top);
    } else {
        x = (e.clientX - rect.left);
        y = (e.clientY - rect.top);
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
    if (myRole !== 'send') return;
    isDrawing = true;
    const pos = getPos(e);
    lastX = pos.x;
    lastY = pos.y;
    // 画一个点
    drawLine(pos.x, pos.y, pos.x, pos.y, colorPicker.value, parseInt(brushSize.value), eraserMode);
}

function draw(e) {
    if (!isDrawing || myRole !== 'send') return;
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
canvas.addEventListener('touchstart', startDraw);
canvas.addEventListener('touchmove', draw);
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
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        // 通知对端清空
        if (conn && conn.open) {
            conn.send({ type: 'clear' });
        }
    }
});

btnDownload.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `drawing-${roomCode}-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
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

function getSelectedRole(container) {
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
    return new Peer('syncdraw-' + id, {
        debug: 0
    });
}

function setupConnection(connection) {
    conn = connection;

    conn.on('open', () => {
        updateStatus('已连接', 'connected');
        // 发送当前画布状态给新加入者
        if (myRole === 'send') {
            const imageData = canvas.toDataURL('image/jpeg', 0.5);
            conn.send({ type: 'sync', imageData: imageData });
        }
    });

    conn.on('data', (data) => {
        if (data.type === 'draw') {
            drawLine(data.x1, data.y1, data.x2, data.y2, data.color, data.size, data.eraser);
        } else if (data.type === 'clear') {
            const width = canvas.clientWidth;
            const height = canvas.clientHeight;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
        } else if (data.type === 'sync') {
            // 接收完整画布同步
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0, canvas.clientWidth, canvas.clientHeight);
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
    const roleContainer = document.querySelector('#create-screen .role-buttons');
    myRole = getSelectedRole(roleContainer);

    showScreen('canvas');
    currentRoomCode.textContent = roomCode;
    roleBadge.textContent = myRole === 'send' ? '📤 发送' : '📥 接收';
    roleBadge.className = 'role-badge ' + myRole;
    initCanvas();
    updateStatus('等待连接...', '');

    // 创建 Peer 并等待连接
    peer = createPeer(roomCode);

    peer.on('open', (id) => {
        console.log('My peer ID:', id);
        updateStatus('等待对方加入...', '');
    });

    peer.on('connection', (connection) => {
        setupConnection(connection);
    });

    peer.on('error', (err) => {
        console.error('Peer error:', err);
        if (err.type === 'unavailable-id') {
            alert('房间号已被占用，请重试');
            roomCode = generateRoomCode();
            document.getElementById('room-code-display').textContent = roomCode;
        } else {
            updateStatus('连接错误: ' + err.type, 'error');
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

    const roleContainer = document.querySelector('#join-screen .role-buttons');
    myRole = getSelectedRole(roleContainer);
    roomCode = inputCode;

    showScreen('canvas');
    currentRoomCode.textContent = roomCode;
    roleBadge.textContent = myRole === 'send' ? '📤 发送' : '📥 接收';
    roleBadge.className = 'role-badge ' + myRole;
    initCanvas();
    updateStatus('正在连接...', '');

    // 创建本地 peer 并连接到房间
    const myId = generateRoomCode();
    peer = createPeer(myId);

    peer.on('open', () => {
        const connection = peer.connect('syncdraw-' + roomCode, {
            reliable: true
        });
        setupConnection(connection);
    });

    peer.on('error', (err) => {
        console.error('Peer error:', err);
        if (err.type === 'peer-unavailable') {
            updateStatus('房间不存在', 'error');
            alert('找不到该房间，请检查房间号是否正确');
        } else {
            updateStatus('连接错误: ' + err.type, 'error');
        }
    });
});

// ========== 窗口大小变化时重新调整画布 ==========
window.addEventListener('resize', () => {
    if (screens.canvas.classList.contains('active')) {
        // 保存当前画面
        const imageData = canvas.toDataURL('image/png');
        const wrapper = document.querySelector('.canvas-wrapper');
        const dpr = window.devicePixelRatio || 1;
        canvas.width = wrapper.clientWidth * dpr;
        canvas.height = wrapper.clientHeight * dpr;
        canvas.style.width = wrapper.clientWidth + 'px';
        canvas.style.height = wrapper.clientHeight + 'px';
        ctx.scale(dpr, dpr);
        // 恢复画面
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.clientWidth, canvas.clientHeight);
        };
        img.src = imageData;
    }
});
