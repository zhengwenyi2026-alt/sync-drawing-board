# 🎨 同步画板 - Sync Drawing

实时同步画板应用，基于 WebRTC (PeerJS) 实现跨设备实时绘画同步。

## ✨ 功能特性

- 🏠 **房间系统**：发起房间或加入房间，通过6位房间号连接设备
- 📤 **发送/接收模式**：选择作为画板主机或观看端
- 🎨 **实时同步**：每一笔都实时同步到对方设备
- 🖌️ **绘画工具**：颜色选择、画笔大小调节、橡皮擦、清空画布
- 💾 **下载画作**：一键保存为 PNG 图片
- 📱 **响应式设计**：支持手机、平板、电脑等设备
- 🔒 **P2P 连接**：使用 WebRTC 点对点连接，无需服务器中转绘画数据

## 🚀 部署到 GitHub Pages

### 方法一：直接推送

1. 在 GitHub 创建新仓库（如 `sync-drawing`）
2. 执行以下命令：

```bash
cd sync-drawing
git init
git add .
git commit -m "Initial commit - sync drawing app"
git branch -M main
git remote add origin https://github.com/你的用户名/仓库名.git
git push -u origin main
```

3. 进入仓库 Settings → Pages
4. Source 选择 `main` 分支，文件夹选 `/ (root)`
5. 保存后等待部署完成
6. 访问 `https://你的用户名.github.io/仓库名/`

### 方法二：使用 GitHub 网页上传

1. 在 GitHub 创建新仓库
2. 点击 "uploading an existing file"
3. 将 `index.html`、`style.css`、`app.js` 三个文件上传
4. 进入 Settings → Pages，启用 GitHub Pages

## 📖 使用方法

1. **设备 A**（发送端）：打开网站 → 点击「发起房间」→ 获得6位房间号 → 选择「发送」→ 进入画板
2. **设备 B**（接收端）：打开网站 → 点击「加入房间」→ 输入房间号 → 选择「接收」→ 进入画板
3. 连接成功后，设备 A 上画的每一笔都会实时显示在设备 B 上
4. 双方都可以下载画作

## 🛠️ 技术栈

- **纯前端**：HTML + CSS + JavaScript
- **PeerJS**：WebRTC 简化库，用于 P2P 实时通信
- **Canvas API**：HTML5 画板绑定
- **GitHub Pages**：静态网站托管

## 📝 注意事项

- 需要两台设备都能访问互联网
- PeerJS 使用免费的信令服务器进行连接建立
- 绘画数据通过 WebRTC 直接传输，延迟极低
- 如果连接失败，可能是网络 NAT 类型限制
