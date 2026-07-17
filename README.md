# 迷雾疑云 · 多人联机推理游戏

基于 Node.js + Socket.io 的多人联机悬疑推理文字游戏。

## 本地运行

```bash
npm install
npm start
```

访问 `http://localhost:3000`

## Render 部署步骤

### 方法一：通过 GitHub 仓库部署（推荐）

1. **上传代码到 GitHub**
   - 创建一个新的 GitHub 仓库（Public 或 Private 均可）
   - 将本目录所有文件推送到仓库的 main 分支

2. **在 Render 创建 Web Service**
   - 登录 [Render.com](https://render.com)
   - 点击 **"New +"** → 选择 **"Web Service"**
   - 选择你刚创建的 GitHub 仓库
   - 点击 **"Connect"**

3. **配置服务**
   - **Name**: `murder-mystery-game`（自定义名称）
   - **Runtime**: `Node`
   - **Branch**: `main`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: 选择 `Free`（免费版）

4. **点击 "Create Web Service"**
   - 等待 1-2 分钟部署完成
   - 部署成功后会获得一个 `xxx.onrender.com` 的公开网址

5. **分享游戏**
   - 将 Render 分配的网址发给好友
   - 房主创建房间，分享房间号即可开始游戏

### 方法二：使用 render.yaml 一键部署

1. 将代码推送到 GitHub 仓库（确保包含 render.yaml）
2. 在 Render 点击 "New +" → "Blueprint"
3. 选择仓库，Render 会自动读取 render.yaml 配置

## 注意事项

- **免费版限制**: Render 免费版 15 分钟无流量会自动休眠，首次访问需要等待约 30 秒唤醒
- **房间数据**: 游戏房间数据存储在内存中，服务器重启后所有房间会消失
- **玩家人数**: 至少需要 2 名玩家才能开始游戏

## 自定义剧情

编辑 `gameData.json` 修改场景和线索：

```json
{
  "scenes": [
    { "id": "scene1", "name": "场景名称" }
  ],
  "clues": {
    "scene1": "该场景的线索描述"
  }
}
```

修改后重新部署或重启服务器生效。

## 房主开始游戏

进入房间后，房主在浏览器控制台（F12）输入：
```javascript
startGameAsHost()
```
即可开启游戏。

## 切换游戏阶段

房主可以通过控制台发送阶段切换指令（需自行扩展或在前端添加按钮）：
- 探索阶段 → 讨论阶段
- 讨论阶段 → 投票阶段
