// server.js - Node.js + Express + Socket.io 后端
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 加载游戏剧情数据
const gameDataPath = path.join(__dirname, 'gameData.json');
let gameData = {
  scenes: [],
  clues: {},
  story: {}
};
if (fs.existsSync(gameDataPath)) {
  gameData = JSON.parse(fs.readFileSync(gameDataPath, 'utf8'));
} else {
  // 默认数据
  gameData = {
    scenes: [
      { id: "livingroom", name: "🏠 客厅" },
      { id: "kitchen", name: "🍳 厨房" },
      { id: "study", name: "📚 书房" }
    ],
    clues: {
      livingroom: "破碎的花瓶，地上有陌生脚印",
      kitchen: "一把沾有红酒的刀",
      study: "桌上遗书，字迹颤抖"
    },
    story: {
      title: "迷雾疑云",
      description: "庄园主人离奇死亡，凶手就在你们之中..."
    }
  };
}

app.use(express.static(path.join(__dirname, 'public')));

// 将HTML放在public/index.html，此处代码假设HTML放在public目录下
// 为完整，创建public目录并移动HTML。但按照要求提供单一HTML，所以把HTML也作为根路由返回。
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 房间管理
const rooms = new Map(); // roomId -> { players: Map(socketId->playerInfo), host: socketId, phase, votes, scenes, clues }

function getRoomState(roomId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  const players = [];
  room.players.forEach((info, id) => {
    players.push({ id, nickname: info.nickname, isHost: id === room.host });
  });
  return {
    roomId,
    players,
    phase: room.phase,
    scenes: gameData.scenes,
    hostId: room.host
  };
}

io.on('connection', (socket) => {
  console.log('新连接:', socket.id);

  socket.on('joinRoom', ({ nickname, roomId }) => {
    if (!nickname) return;
    let targetRoomId = roomId && roomId.trim() !== '' ? roomId.trim() : generateRoomId();
    
    if (!rooms.has(targetRoomId)) {
      // 创建房间
      rooms.set(targetRoomId, {
        players: new Map(),
        host: socket.id,
        phase: 'lobby',
        votes: [],
        scenes: gameData.scenes,
        clues: gameData.clues
      });
    }

    const room = rooms.get(targetRoomId);
    if (room.players.has(socket.id)) {
      socket.emit('errorMessage', '你已经在该房间中');
      return;
    }

    // 加入房间
    room.players.set(socket.id, { nickname });
    socket.join(targetRoomId);
    
    const isHost = (room.host === socket.id);
    socket.emit('roomJoined', {
      roomId: targetRoomId,
      players: Array.from(room.players.entries()).map(([id, info]) => ({ id, nickname: info.nickname, isHost: id === room.host })),
      gameState: room.phase !== 'lobby' ? { phase: room.phase, scenes: room.scenes } : null,
      isHost
    });

    // 广播玩家列表
    io.to(targetRoomId).emit('playerListUpdate', Array.from(room.players.entries()).map(([id, info]) => ({ id, nickname: info.nickname, isHost: id === room.host })));
  });

  socket.on('startGame', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room || room.host !== socket.id) return;
    if (room.players.size < 2) {
      socket.emit('errorMessage', '至少需要2名玩家');
      return;
    }
    room.phase = 'explore';
    room.votes = [];
    io.to(roomId).emit('gameStarted', {
      phase: 'explore',
      scenes: room.scenes
    });
  });

  socket.on('explore', ({ roomId, sceneId }) => {
    const room = rooms.get(roomId);
    if (!room || room.phase !== 'explore') return;
    const clue = room.clues[sceneId] || '未发现明显线索';
    const player = room.players.get(socket.id);
    io.to(roomId).emit('clueResult', {
      clue,
      playerName: player?.nickname || '未知'
    });
    // 可选：记录已发现，这里简单处理
  });

  socket.on('chatMessage', ({ roomId, message }) => {
    const room = rooms.get(roomId);
    if (!room || (room.phase !== 'discuss' && room.phase !== 'explore')) return; // 讨论阶段或探索时可聊天
    const player = room.players.get(socket.id);
    if (player) {
      io.to(roomId).emit('chatMessage', {
        from: player.nickname,
        message
      });
    }
  });

  socket.on('vote', ({ roomId, targetId }) => {
    const room = rooms.get(roomId);
    if (!room || room.phase !== 'vote') return;
    if (!room.players.has(targetId) || targetId === socket.id) return;
    
    // 移除旧投票
    room.votes = room.votes.filter(v => v.voter !== socket.id);
    room.votes.push({ voter: socket.id, target: targetId });
    
    io.to(roomId).emit('voteUpdate', { votes: room.votes });
    
    // 检查是否所有人都投票
    if (room.votes.length === room.players.size) {
      // 统计
      const tally = {};
      room.votes.forEach(v => {
        tally[v.target] = (tally[v.target] || 0) + 1;
      });
      let maxVotes = 0;
      let suspect = null;
      Object.entries(tally).forEach(([id, count]) => {
        if (count > maxVotes) {
          maxVotes = count;
          suspect = id;
        }
      });
      const suspectPlayer = room.players.get(suspect);
      const resultMsg = suspectPlayer ? `最多票数指向: ${suspectPlayer.nickname}` : '无人得票';
      io.to(roomId).emit('gameResult', { result: resultMsg, votes: room.votes });
      room.phase = 'result';
    }
  });

  socket.on('leaveRoom', ({ roomId }) => {
    handleLeave(socket, roomId);
  });

  socket.on('disconnect', () => {
    // 查找所在房间并离开
    for (let [roomId, room] of rooms.entries()) {
      if (room.players.has(socket.id)) {
        handleLeave(socket, roomId);
        break;
      }
    }
  });

  function handleLeave(socket, roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    room.players.delete(socket.id);
    socket.leave(roomId);
    
    if (room.players.size === 0) {
      rooms.delete(roomId);
      return;
    }
    
    // 如果房主离开，转移房主
    if (room.host === socket.id) {
      const nextHost = room.players.keys().next().value;
      room.host = nextHost;
    }
    
    io.to(roomId).emit('playerListUpdate', Array.from(room.players.entries()).map(([id, info]) => ({ id, nickname: info.nickname, isHost: id === room.host })));
  }

  function generateRoomId() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  // 确保public目录存在
  if (!fs.existsSync(path.join(__dirname, 'public'))) {
    fs.mkdirSync(path.join(__dirname, 'public'));
  }
});