import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all for simplicity during dev, or specify vite port
    methods: ["GET", "POST"]
  }
});

// Room storage: { roomId: { roomId, status, gameState, players: [], programs, hands, message, round, ... } }
const rooms = {};

const INITIAL_HAND_SIZE = 6;
const CARD_TYPES = ['MOVE', 'TURN_L', 'TURN_R', 'LASER', 'HACK', 'JUMP'];

function generateHand() {
  return Array.from({ length: INITIAL_HAND_SIZE }, () => {
    return { id: CARD_TYPES[Math.floor(Math.random() * CARD_TYPES.length)] };
  });
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_room', ({ roomId, playerInfo, tempName }) => {
    let room = rooms[roomId];

    // Cleanup old rooms (older than 1 hour)
    if (room && (room.status === 'closed' || (Date.now() - room.createdAt > 3600000))) {
      delete rooms[roomId];
      room = null;
    }

    if (!room) {
      // Create Host (Player 1)
      rooms[roomId] = {
        roomId,
        status: 'waiting',
        gameState: 'LOBBY',
        round: 1,
        players: [{
          ...playerInfo,
          id: 1,
          socketId: socket.id,
          name: tempName || "Player 1",
          colorClass: "text-blue-500",
          bgColor: "bg-blue-50",
          x: 0, y: 0, dir: 'RIGHT', stun: false
        }],
        programs: { 1: Array(5).fill(null), 2: Array(5).fill(null) },
        hands: { 1: [], 2: [] },
        winner: null,
        message: "対戦相手をまっています...",
        createdAt: Date.now()
      };
      socket.join(roomId);
      socket.emit('room_joined', { role: 1, room: rooms[roomId] });
      io.to(roomId).emit('room_updated', rooms[roomId]); // Broadcast to ensure sync

    } else if (room.status === 'waiting') {
      // Player 2 Joining
      const p2 = {
        ...playerInfo,
        id: 2,
        socketId: socket.id,
        name: tempName || "Player 2",
        colorClass: "text-red-500",
        bgColor: "bg-red-50",
        x: 6, y: 6, dir: 'LEFT', stun: false
      };

      room.players.push(p2);
      room.status = 'playing';
      room.gameState = 'PLANNING';
      room.message = `${room.players[0].name} の入力を待っています`;

      // Generate initial hands for both players
      room.hands = {
        1: generateHand(),
        2: generateHand()
      };

      socket.join(roomId);
      socket.emit('room_joined', { role: 2, room }); // specific event for p2 to set role
      io.to(roomId).emit('room_updated', room); // broadcast everything including new hands

    } else {
      socket.emit('error', { message: 'Room is full or playing' });
    }
  });

  socket.on('update_state', ({ roomId, updates }) => {
    if (!rooms[roomId]) return;

    // Deep merge for 'programs' to prevent overwriting other player's data
    if (updates.programs) {
      rooms[roomId].programs = {
        ...rooms[roomId].programs,
        ...updates.programs
      };
      delete updates.programs; // handled
    }

    // Merge updates
    // Be careful with deep merge manually if needed, but spread is usually ok for top-level keys
    rooms[roomId] = { ...rooms[roomId], ...updates };
    const room = rooms[roomId];

    // Basic Round/Game over logic check could go here if we wanted authoritative server
    // For now we trust the client logic (Host P1 usually orchestrates)

    io.to(roomId).emit('room_updated', room);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Optional: Auto-close room or notify other player
    // const room = Object.values(rooms).find(r => r.players.some(p => p.socketId === socket.id));
    // if (room) {
    //   io.to(room.roomId).emit('error', { message: "相手が切断しました" });
    // }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Socket.io Server running on port ${PORT}`);
});
