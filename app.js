// ========== 状态管理 ==========
let peer = null, conn = null, roomCode = '';
let isDrawing = false, lastX = 0, lastY = 0;
let currentTool = 'brush';
let currentColor = '#000000';
let currentSize = 3;
let shapeStart = null; // 图形起始点
let undoStack = [], redoStack = [];
const MAX_UNDO = 30;

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
                { urls: 'stun:stun3.l.google.com:19302' }
            ]
        }
    };
    if (serverUrl) {
        try {
            const url = new URL(serverUrl);
            config.host = url.hostname;
            config.port = url.port || (url.protocol === 'https:' ? 443 : 80);
            config.path = url.pathname.replace(/\/$/, '') || '/';
            config.secure = url.protocol === 'https:';
        } catch (e) { console.warn('Invalid server URL', e); }
    }
    return config;
}

// ========== DOM ==========
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
    conn = null; undoStack = []; redoStack = [];
    showScreen('lobby');
}

// ========== 画布 ==========
function initCanvas() {
    const area = document.querySelector('.canvas-area');
    const dpr = window.devicePixelRatio || 1;
    const w = area.clientWidth, h = area.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    undoStack = []; redoStack = [];
    saveState();
}

function saveState() {
    undoStack.push(canvas.toDataURL('image/png'));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = [];
}

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

// ========== 绘制工具 ==========
function getBrushStyle(tool, color, size) {
    switch (tool) {
        case 'brush': return { color, size, alpha: 1, lineCap: 'round' };
        case 'pencil': return { color, size: Math.max(1, size * 0.5), alpha: 0.8, lineCap: 'round' };
        case 'marker': return { color, size: size * 2.5, alpha: 0.4, lineCap: 'round' };
        case 'fine': return { color, size: Math.max(1, size * 0.3), alpha: 1, lineCap: 'round' };
        case 'eraser': return { color: '#ffffff', size: size * 3, alpha: 1, lineCap: 'round' };
        default: return { color, size, alpha: 1, lineCap: 'round' };
    }
}

function drawLine(x1, y1, x2, y2, tool, color, size) {
    const style = getBrushStyle(tool, color, size);
    ctx.save();
    ctx.globalAlpha = style.alpha;
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.size;
    ctx.lineCap = style.lineCap;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
}

function drawShape(type, x1, y1, x2, y2, color, size) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fillStyle = color;

    switch (type) {
        case 'line':
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            break;
        case 'rect':
            ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
            break;
        case 'circle':
            const rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
            const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
            ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
            break;
        case 'triangle':
            const midX = (x1 + x2) / 2;
            ctx.beginPath();
            ctx.moveTo(midX, y1); ctx.lineTo(x2, y2); ctx.lineTo(x1, y2); ctx.closePath();
            ctx.stroke();
            break;
        case 'arrow':
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const headLen = Math.max(15, size * 4);
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
            ctx.stroke();
            break;
    }
    ctx.restore();
}

// ========== 画布事件 ==========
function startDraw(e) {
    e.preventDefault();
    const pos = getPos(e);
    const isShape = ['line', 'rect', 'circle', 'triangle', 'arrow'].includes(currentTool);

    if (isShape) {
        shapeStart = pos;
        // 保存当前画布状态用于预览
        shapeStart.snapshot = canvas.toDataURL('image/png');
    } else {
        isDrawing = true;
        lastX = pos.x; lastY = pos.y;
        drawLine(pos.x, pos.y, pos.x, pos.y, currentTool, currentColor, currentSize);
    }
}

function draw(e) {
    if (!isDrawing && !shapeStart) return;
    e.preventDefault();
    const pos = getPos(e);

    if (shapeStart) {
        // 恢复快照，绘制预览图形
        const img = new Image();
        img.onload = () => {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            ctx.restore();
            drawShape(currentTool, shapeStart.x, shapeStart.y, pos.x, pos.y, currentColor, currentSize);
        };
        img.src = shapeStart.snapshot;
    } else if (isDrawing) {
        drawLine(lastX, lastY, pos.x, pos.y, currentTool, currentColor, currentSize);
        // 发送到对端
        if (conn && conn.open) {
            conn.send({ type: 'draw', x1: lastX, y1: lastY, x2: pos.x, y2: pos.y, tool: currentTool, color: currentColor, size: currentSize });
        }
        lastX = pos.x; lastY = pos.y;
    }
}

function stopDraw(e) {
    if (shapeStart) {
        // 图形完成，发送整个图形
        const pos = e.changedTouches ? 
            { x: e.changedTouches[0].clientX - canvas.getBoundingClientRect().left, y: e.changedTouches[0].clientY - canvas.getBoundingClientRect().top } :
            { x: e.clientX - canvas.getBoundingClientRect().left, y: e.clientY - canvas.getBoundingClientRect().top };
        
        if (conn && conn.open) {
            conn.send({ type: 'shape', tool: currentTool, x1: shapeStart.x, y1: shapeStart.y, x2: pos.x, y2: pos.y, color: currentColor, size: currentSize });
        }
        shapeStart = null;
        saveState();
    } else if (isDrawing) {
        isDrawing = false;
        saveState();
    }
}

canvas.addEventListener('mousedown', startDraw);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDraw);
canvas.addEventListener('mouseleave', stopDraw);
canvas.addEventListener('touchstart', startDraw, { passive: false });
canvas.addEventListener('touchmove', draw, { passive: false });
canvas.addEventListener('touchend', stopDraw);

// ========== 工具选择 ==========
document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTool = btn.dataset.tool;
        canvas.style.cursor = currentTool === 'eraser' ? 'cell' : 'crosshair';
    });
});

// ========== 颜色选择 ==========
document.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
        document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        currentColor = dot.dataset.color;
        colorPicker.value = currentColor;
    });
});

colorPicker.addEventListener('input', () => {
    currentColor = colorPicker.value;
    document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
});

brushSize.addEventListener('input', () => {
    currentSize = parseInt(brushSize.value);
    brushSizeLabel.textContent = currentSize + 'px';
});

// ========== 撤销/重做/清空/下载 ==========
document.getElementById('btn-undo').addEventListener('click', () => {
    if (undoStack.length <= 1) return;
    redoStack.push(undoStack.pop());
    restoreState(undoStack[undoStack.length - 1]);
    if (conn && conn.open) conn.send({ type: 'undo' });
});

document.getElementById('btn-redo').addEventListener('click', () => {
    if (redoStack.length === 0) return;
    const state = redoStack.pop();
    undoStack.push(state);
    restoreState(state);
    if (conn && conn.open) conn.send({ type: 'redo', imageData: state });
});

document.getElementById('btn-clear').addEventListener('click', () => {
    if (confirm('确定清空画布吗？')) {
        clearCanvas();
        saveState();
        if (conn && conn.open) conn.send({ type: 'clear' });
    }
});

document.getElementById('btn-download').addEventListener('click', () => {
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.clientWidth;
    exportCanvas.height = canvas.clientHeight;
    exportCanvas.getContext('2d').drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);
    const link = document.createElement('a');
    link.download = `drawing-${roomCode || 'local'}-${Date.now()}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
});

document.getElementById('btn-leave').addEventListener('click', () => {
    if (confirm('确定离开房间吗？')) {
        if (conn) conn.close();
        if (peer) peer.destroy();
        peer = null; conn = null;
        showScreen('lobby');
    }
});

function clearCanvas() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    ctx.save(); ctx.setTransform(1,0,0,1,0,0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
}

function restoreState(dataURL) {
    const img = new Image();
    img.onload = () => {
        ctx.save(); ctx.setTransform(1,0,0,1,0,0);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        ctx.restore();
    };
    img.src = dataURL;
}

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

// ========== 连接 ==========
function updateStatus(text, type) {
    connectionStatus.textContent = text;
    connectionStatus.className = 'status-badge';
    if (type) connectionStatus.classList.add(type);
}

function setupConnection(connection) {
    conn = connection;
    conn.on('open', () => {
        updateStatus('已连接', 'connected');
        conn.send({ type: 'sync', imageData: canvas.toDataURL('image/jpeg', 0.5) });
    });
    conn.on('data', (data) => {
        if (data.type === 'draw') {
            drawLine(data.x1, data.y1, data.x2, data.y2, data.tool || 'brush', data.color, data.size);
        } else if (data.type === 'shape') {
            drawShape(data.tool, data.x1, data.y1, data.x2, data.y2, data.color, data.size);
            saveState();
        } else if (data.type === 'clear') {
            clearCanvas(); saveState();
        } else if (data.type === 'undo') {
            if (undoStack.length > 1) { redoStack.push(undoStack.pop()); restoreState(undoStack[undoStack.length - 1]); }
        } else if (data.type === 'redo') {
            undoStack.push(data.imageData); restoreState(data.imageData);
        } else if (data.type === 'sync') {
            const img = new Image();
            img.onload = () => {
                ctx.save(); ctx.setTransform(1,0,0,1,0,0);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                ctx.restore();
                saveState();
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

    peer = new Peer('syncdraw-' + roomCode, getPeerConfig());
    peer.on('open', () => {
        updateStatus('等待对方加入...', '');
        setTimeout(() => updateStatus('等待对方加入...', 'connected'), 3000);
    });
    peer.on('connection', (c) => setupConnection(c));
    peer.on('error', (err) => {
        if (err.type === 'unavailable-id') alert('该房间号已被占用，请换一个');
        else if (err.type === 'network' || err.type === 'server-error') updateStatus('网络错误', 'error');
        else updateStatus('错误: ' + err.type, 'error');
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
    roleBadge.textContent = role === 'send' ? ' 发送' : '📥 接收';
    roleBadge.className = 'role-badge ' + (role === 'send' ? 'send' : 'receive');
    initCanvas();
    updateStatus('正在初始化...', '');

    peer = new Peer('syncdraw-' + roomCode + '-' + Math.random().toString(36).substr(2, 6), getPeerConfig());
    let connected = false, retryCount = 0;
    const maxRetries = 10;
    let overallTimer = null;

    function tryConnect() {
        if (connected) return;
        retryCount++;
        updateStatus(`连接中... (${retryCount}/${maxRetries})`, '');
        const c = peer.connect('syncdraw-' + roomCode, { reliable: true, serialization: 'json' });

        c.on('open', () => {
            connected = true;
            if (overallTimer) clearTimeout(overallTimer);
            setupConnection(c);
        });
        c.on('error', (err) => {
            console.log('Connection error, retrying...', err);
            if (!connected && retryCount < maxRetries) {
                setTimeout(tryConnect, 2000);
            } else if (!connected) {
                updateStatus('连接失败', 'error');
                alert('无法连接到房间，请确认房主是否在线，然后刷新重试');
            }
        });
        // 单次连接 10 秒超时
        setTimeout(() => {
            if (!connected && retryCount < maxRetries) { try { c.close(); } catch(e){} tryConnect(); }
        }, 10000);
    }

    peer.on('open', () => {
        updateStatus('查找房间中...', '');
        tryConnect();
        // 从 peer 准备好之后才开始计总超时
        overallTimer = setTimeout(() => {
            if (!connected) {
                updateStatus('连接超时', 'error');
                alert('连接超时，请确认：\n1. 房间号是否正确\n2. 房主是否已点击「进入画板」在等待\n3. 两台设备都能上网\n\n提示：刷新页面重试');
            }
        }, 50000);
    });

    peer.on('error', (err) => {
        console.error('Peer error:', err.type);
        if (err.type === 'peer-unavailable') {
            // peer-unavailable 也触发重试
            if (!connected && retryCount < maxRetries) {
                updateStatus('房间未就绪，重试中...', '');
                setTimeout(tryConnect, 2000);
            } else if (!connected) {
                updateStatus('房间不存在', 'error');
                alert('找不到该房间，请检查：\n1. 房间号是否正确\n2. 房主是否已点击「进入画板」并在等待');
            }
        } else if (err.type === 'network' || err.type === 'server-error') {
            if (!connected && retryCount < maxRetries) {
                updateStatus('网络错误，重试中...', '');
                setTimeout(tryConnect, 2000);
            } else {
                updateStatus('网络错误', 'error');
            }
        } else if (err.type !== 'peer-unavailable') {
            updateStatus('错误: ' + err.type, 'error');
        }
    });
});

// ========== 窗口大小变化 ==========
window.addEventListener('resize', () => {
    if (!screens.canvas.classList.contains('active')) return;
    const imageData = canvas.toDataURL('image/png');
    const area = document.querySelector('.canvas-area');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = area.clientWidth * dpr; canvas.height = area.clientHeight * dpr;
    canvas.style.width = area.clientWidth + 'px'; canvas.style.height = area.clientHeight + 'px';
    ctx.scale(dpr, dpr);
    const img = new Image();
    img.onload = () => { ctx.drawImage(img, 0, 0, canvas.clientWidth, canvas.clientHeight); };
    img.src = imageData;
});
