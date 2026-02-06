const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // allow all for now, or specify vite port
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
        // Note: In client complete objects with colors/icons are used. 
        // We can just send IDs and have client re-hydrate, or client sends full objects.
        // For simplicity, let's assume the server generates simple objects and client hydrates or we fully mock it here if needed.
        // Actually, looking at App.jsx, the client generates hands. 
        // We can let the server generate it to prevent cheating, or keep it simple and just sync what clients send.
        // Let's stick to Server logic for critical state like hands to be safe, but reuse client structure if possible.
        // For now, I'll let the "Host" (Player 1) or the Server generate hands. 
        // Let's implement server-side generation for fairness.
        // We need the full card structure or just IDs? Client uses full structure.
        // Let's just return IDs for now and let Client map them to UI config, OR sync full objects if we want to be lazy.
        // To avoid code duplication, I'll just send { id: '...' } and hope client handles it, or I'll copy the CARD_TYPES structure if really needed.
        // Wait, App.jsx `generateHands` uses `CARD_TYPES` keys.
    });
}

// Helper to get full card data helper - wait, client has the UI data. Server just needs logical ID.
// But the client expects full objects in `hands`.
// Let's try to pass the responsibility of initial state generation to the server for 'PLANNING' phase transition.

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join_room', ({ roomId, playerInfo, tempName }) => {
    // playerInfo contains { customImage, ... } but we might not want to send huge base64 constantly if not needed.
    // store it in room.
    
    let room = rooms[roomId];

    // Cleanup old rooms
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
      io.to(roomId).emit('room_updated', rooms[roomId]);
    
    } else if (room.status === 'waiting') {
      // Check if same player is reconnecting (simple check by socket id? no usually new socket)
      // For now assume new player = Player 2
      
      const p2 = {
          ...playerInfo,
          id: 2,
          socketId: socket.id,
          name: tempName || "Player 2",
          colorClass: "text-red-500", 
          bgColor: "bg-red-50",
          x: 6, y: 6, dir: 'LEFT', stun: false // default p2 pos
      };

      room.players.push(p2);
      room.status = 'playing';
      room.gameState = 'PLANNING';
      room.message = `${room.players[0].name} の入力を待っています`;
      
      // Generate initial hands
      // We need to match what App.jsx expects. 
      // App.jsx expects full objects like { id: 'MOVE', label: '...', icon: ... }
      // Since I don't want to duplicate all React icons and logic here, 
      // I will ask the Client (P2 joining) to generate hands? No that's messy.
      // I will send simple objects { id: 'MOVE' } and update Client to hydrate them, 
      // OR I will trust the client updates. 
      // actually the previous firebase logic:
      // P2 joins -> `await updateDoc(..., { hands: generateHands() })`
      // So P2 client generated the hands.
      // I can emulate that: P2 joins, I tell P2 "you joined as P2". 
      // P2 client sees "I am P2", triggers "start game" logic, generates hands, and emits "update_state".
      // BUT, that introduces a race condition or delay.
      // Better: Server simply emits "room_joined" to P2. P2 client sends "start_game_setup" with hands?
      // Simplest for migration: let Server manage state, but assume Clients can handle { id: 'TYPE' } objects if I change App.jsx,
      // OR just blindly store what they send.
      
      // Let's try: Server sets state to PLANNING, valid players.
      // Server emits room_updated.
      // Clients receive room_updated.
      // Problem: `hands` are empty.
      // Solution: I will emit a special event `request_setup` to Player 1 (Host) or just let Player 2 generate it and send it via `update_state` immediately after joining?
      // Let's do: Server generates "skeleton" hands (just IDs). App.jsx needs to be robust enough to render them or hydrate them.
      // Checking App.jsx... `hands` is array of `card` objects. `card.icon` is used. Icon is a React component. 
      // DATA CANNOT TRAVEL OVER SOCKET/JSON if it has functions/components.
      // Firebase also serializes to JSON. So `App.jsx` MUST ALREADY be hydrating them or storing only data?
      // checking `generateHands` in App.jsx...
      // `CARD_TYPES[key]` includes `icon: ArrowUp`. `ArrowUp` is imported from `lucide-react`.
      // Firestore does NOT store functions/components. It strips them or fails?
      // Actually `setDoc` with non-serializable data (like functions/components) usually fails or warns in Firebase unless they are just ignored.
      // Wait, `ArrowUp` is a function (React component).
      // If the current code successfully saves to Firestore, it means either:
      // 1. destructured icons are lost/ignored?
      // 2. Client re-hydrates?
      // Let's check App.jsx `renderMainUI`. 
      // `<card.icon size={28} ... />`.
      // If `card` comes from `hands` state, which comes from `snapshot.data()`, 
      // JSON from Firestore won't have `icon` component function.
      // So `card.icon` would be undefined.
      // User says "Logic Duel" (from existing code). 
      // IF the current code works on Firebase, maybe I missed something.
      // Takes closer look at `generateHands` in App.jsx.
      // `const CARD_TYPES = { MOVE: { ..., icon: ArrowUp ... } }`
      // `return { ... CARD_TYPES[keys[...]] }`
      // When saving to Firestore: `hands: generateHands()`
      // Firestore will reject custom objects/functions.
      // Maybe the user hasn't successfully run it online yet? Or using a converter?
      // Or maybe it DOES fail and that's why they want "Socket.io" fix? :D
      // User request: "support communication... fix with Socket.io".
      // Chances are the current code is BROKEN for online because of the icon serialization.
      // I MUST fix this serialization issue.
      // Plan: Server only manages IDs. Client hydrates.
      
      room.hands = { 1: [], 2: [] }; // start empty. 
      // actually, let's generate IDs.
      const p1Hand = Array.from({length:6}, () => ({ id: CARD_TYPES[Math.floor(Math.random()*CARD_TYPES.length)] }));
      const p2Hand = Array.from({length:6}, () => ({ id: CARD_TYPES[Math.floor(Math.random()*CARD_TYPES.length)] }));
      room.hands = { 1: p1Hand, 2: p2Hand };
      
      socket.join(roomId);
      socket.emit('room_joined', { role: 2, room });
      io.to(roomId).emit('room_updated', room);
    
    } else {
        socket.emit('error', { message: 'Room is full or playing' });
    }
  });

  socket.on('update_state', ({ roomId, updates }) => {
      if (!rooms[roomId]) return;
      // Merge updates
      rooms[roomId] = { ...rooms[roomId], ...updates };
      
      // If game over or round logic needed, can do here or trust client 'updates' for now.
      // Ideally server validates moves, but for "modification" we keep it loose.
      
      io.to(roomId).emit('room_updated', rooms[roomId]);
  });
  
  // Specific event for submitting program to handle 'EXECUTION' transition safely?
  // Client `submitProgram` just updates `programs.x` and messages.
  // If both submitted, client triggers execution? 
  // App.jsx `submitProgram`:
  // P1 submits -> updates "programs.1"
  // P2 submits -> updates "programs.2", sets gameState 'EXECUTION'.
  // We can keep this logic in `update_state` payload.

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Find room and maybe pause or notify?
    // For now, minimal handling.
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Socket.io Server running on port ${PORT}`);
});
