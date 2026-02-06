import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  RotateCw,
  ArrowUp,
  Trophy,
  RefreshCw,
  Info,
  Shield,
  Zap,
  Bomb,
  Target,
  Check,
  Upload,
  User,
  Edit2,
  Globe,
  Users,
  AlertCircle,
  Loader2,
  Timer,
  ChevronRight
} from 'lucide-react';

// --- Socket.io Imports ---
import { io } from 'socket.io-client';

// Use the provided Render URL for production, fallback to environment variable or localhost
const socket = io('https://creatte-game.onrender.com');
// OR: const socket = io(import.meta.env.VITE_SERVER_URL || 'https://creatte-game.onrender.com');

const appId = typeof __app_id !== 'undefined' ? __app_id : 'logic-duel-multi';

// --- 定数 ---
const GRID_SIZE = 7;
const INITIAL_HAND_SIZE = 6;
const DIRECTIONS = ['UP', 'RIGHT', 'DOWN', 'LEFT'];

const CARD_TYPES = {
  MOVE: { id: 'MOVE', label: 'すすむ', icon: ArrowUp, color: 'bg-blue-400 shadow-blue-200', description: '1歩進む' },
  TURN_L: { id: 'TURN_L', label: '左をむく', icon: RotateCw, color: 'bg-indigo-400 shadow-indigo-200', description: '左に90度向く', extraClass: '-scale-x-100' },
  TURN_R: { id: 'TURN_R', label: '右をむく', icon: RotateCw, color: 'bg-purple-400 shadow-purple-200', description: '右に90度向く' },
  LASER: { id: 'LASER', label: 'レーザー', icon: Zap, color: 'bg-rose-400 shadow-rose-200', description: '正面の相手を撃つ' },
  HACK: { id: 'HACK', label: 'ハック', icon: Bomb, color: 'bg-orange-400 shadow-orange-200', description: '周囲を回転させる' },
  JUMP: { id: 'JUMP', label: 'ジャンプ', icon: Target, color: 'bg-teal-400 shadow-teal-200', description: '2歩進む' },
};

// --- ヘルパー: 画像のリサイズ ---
async function resizeImage(base64Str, maxWidth = 300, maxHeight = 300) {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      if (width > height) {
        if (width > maxWidth) {
          height *= maxWidth / width;
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width *= maxHeight / height;
          height = maxHeight;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.5));
    };
    img.onerror = () => resolve(base64Str);
  });
}

// --- ヘルパー: カードデータの復元 (Hydration) ---
// サーバーからは { id: 'MOVE' } のようにIDだけ来るので、完全なオブジェクトに戻す
const hydrateCards = (cardList) => {
  if (!cardList) return [];
  return cardList.map(c => {
    if (!c || !c.id) return null;
    return CARD_TYPES[c.id] || c;
  });
};

const hydratePrograms = (progMap) => {
  const newProgs = { 1: [], 2: [] };
  if (progMap[1]) newProgs[1] = progMap[1].map(c => c ? (CARD_TYPES[c.id] || c) : null);
  if (progMap[2]) newProgs[2] = progMap[2].map(c => c ? (CARD_TYPES[c.id] || c) : null);
  return newProgs;
};

// --- カスタム駒コンポーネント ---
const CustomPawn = ({ size = 48, customImage, colorClass, isMissing }) => {
  const borderColor = colorClass?.includes('text-blue') ? '#60a5fa' : colorClass?.includes('text-red') ? '#f87171' : '#94a3b8';
  if (customImage) {
    return (
      <div
        style={{ width: size, height: size, backgroundImage: `url(${customImage})`, backgroundSize: 'cover', backgroundPosition: 'center', borderRadius: '16px', border: `4px solid ${borderColor}` }}
        className="shadow-lg transition-all duration-500 transform hover:scale-110 active:scale-95"
      />
    );
  }
  return (
    <div style={{ width: size, height: size, border: `3px dashed ${isMissing ? '#f87171' : '#e2e8f0'}` }} className={`rounded-2xl flex items-center justify-center ${isMissing ? 'bg-red-50' : 'bg-slate-50'} transition-colors`}>
      <User size={size * 0.5} className={isMissing ? 'text-red-300' : 'text-slate-300'} />
    </div>
  );
};

const App = () => {
  // --- States ---
  const [mode, setMode] = useState(null);
  const [gameState, setGameState] = useState('START');
  // const [user, setUser] = useState(null); // Auth removed
  const [isAuthLoading, setIsAuthLoading] = useState(false); // No Auth loading
  const [roomId, setRoomId] = useState(null);
  const [onlineRole, setOnlineRole] = useState(null);
  const [turn, setTurn] = useState(1);
  const [round, setRound] = useState(1);
  const [players, setPlayers] = useState([]);
  const [hands, setHands] = useState({ 1: [], 2: [] });
  const [programs, setPrograms] = useState({ 1: Array(5).fill(null), 2: Array(5).fill(null) });
  const [executionStep, setExecutionStep] = useState(-1);
  const [winner, setWinner] = useState(null);
  const [message, setMessage] = useState("");
  const [visualEffect, setVisualEffect] = useState(null);
  const [onlineTargetId, setOnlineTargetId] = useState("room-1");
  const [lobbyTimeLeft, setLobbyTimeLeft] = useState(180);

  const [tempNames, setTempNames] = useState({ 1: "Player 1", 2: "Player 2" });
  const [customImages, setCustomImages] = useState({ 1: null, 2: null });
  const fileInputRef1 = useRef(null);
  const fileInputRef2 = useRef(null);

  // --- Functions ---
  function initGame() {
    setGameState('START');
    setMode(null);
    setRoomId(null);
    setOnlineRole(null);
    setTurn(1);
    setRound(1);
    setWinner(null);
    setMessage("");
    setVisualEffect(null);
    setExecutionStep(-1);
    setLobbyTimeLeft(180);
    setPrograms({ 1: Array(5).fill(null), 2: Array(5).fill(null) });
    setPlayers([
      { id: 1, x: 0, y: 0, dir: 'RIGHT', stun: false, name: "Player 1", customImage: null, colorClass: "text-blue-500", bgColor: "bg-blue-50" },
      { id: 2, x: 6, y: 6, dir: 'LEFT', stun: false, name: "Player 2", customImage: null, colorClass: "text-red-500", bgColor: "bg-red-50" }
    ]);
  }

  useEffect(() => {
    initGame();
  }, []);

  async function handleImageUpload(e, playerNum) {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const compressed = await resizeImage(reader.result);
        setCustomImages(prev => ({ ...prev, [playerNum]: compressed }));
      };
      reader.readAsDataURL(file);
    }
  }

  function generateHands() {
    const pick = () => Array.from({ length: INITIAL_HAND_SIZE }, () => {
      const keys = Object.keys(CARD_TYPES);
      return CARD_TYPES[keys[Math.floor(Math.random() * keys.length)]];
    });
    return { 1: pick(), 2: pick() };
  }

  function startLocalGame() {
    if (!customImages[1] || !customImages[2]) return;
    const updatedPlayers = [
      { ...players[0], name: tempNames[1], customImage: customImages[1] },
      { ...players[1], name: tempNames[2], customImage: customImages[2] }
    ];
    setPlayers(updatedPlayers);
    setHands(generateHands());
    setGameState('PLANNING');
    setTurn(1); setRound(1); setMode('LOCAL');
    setMessage(`${updatedPlayers[0]?.name || "Player 1"}のターン！`);
  }

  async function startOnlineLobby() {
    if (!customImages[1]) return;
    setGameState('LOBBY');
    setLobbyTimeLeft(180);
    setMessage("通信をじゅんびしています...");
    setMode('ONLINE');

    const rid = onlineTargetId || "room-1";
    setRoomId(rid);

    // Socket Join
    socket.emit('join_room', {
      roomId: rid,
      playerInfo: {
        customImage: customImages[1]
      },
      tempName: tempNames[1]
    });
  }

  function addToProgram(card, index) {
    if (gameState !== 'PLANNING') return;
    if (mode === 'ONLINE') {
      // Use efficient turn state synced from server
      if (onlineRole !== turn) return;
    }
    const newPrograms = { ...programs };
    const pKey = mode === 'ONLINE' ? onlineRole : turn;
    const emptyIndex = newPrograms[pKey].findIndex(slot => slot === null);
    if (emptyIndex !== -1) {
      newPrograms[pKey][emptyIndex] = { ...card };
      setPrograms(newPrograms);
      const newHands = { ...hands };
      newHands[pKey] = newHands[pKey].filter((_, i) => i !== index);
      setHands(newHands);
    }
  }

  function removeFromProgram(slotIndex) {
    if (gameState !== 'PLANNING') return;
    const pKey = mode === 'ONLINE' ? onlineRole : turn;
    const card = programs[pKey][slotIndex];
    if (!card) return;
    const newPrograms = { ...programs };
    newPrograms[pKey][slotIndex] = null;
    setPrograms(newPrograms);
    const newHands = { ...hands };
    newHands[pKey].push(card);
    setHands(newHands);
  }

  function getNextPos(x, y, dir, steps = 1) {
    let nx = x, ny = y;
    if (dir === 'UP') ny -= steps; if (dir === 'DOWN') ny += steps; if (dir === 'LEFT') nx -= steps; if (dir === 'RIGHT') nx += steps;
    return { nx: Math.max(0, Math.min(GRID_SIZE - 1, nx)), ny: Math.max(0, Math.min(GRID_SIZE - 1, ny)) };
  }

  async function handleRoundEnd(finalPlayers) {
    const p1W = finalPlayers[0]?.x === 6 && finalPlayers[0]?.y === 6;
    const p2W = finalPlayers[1]?.x === 0 && finalPlayers[1]?.y === 0;
    let localWinner = p1W && p2W ? 'DRAW' : p1W ? 1 : p2W ? 2 : null;

    if (mode === 'LOCAL') {
      if (localWinner) { setWinner(localWinner); setGameState('RESULT'); }
      else { setRound(r => r + 1); setTurn(1); setGameState('PLANNING'); setHands(generateHands()); setPrograms({ 1: Array(5).fill(null), 2: Array(5).fill(null) }); setMessage(`${players[0]?.name || "Player 1"}のターン！`); }
    } else if (onlineRole === 1) {
      // Host logic to update round
      try {
        if (localWinner) {
          socket.emit('update_state', { roomId, updates: { players: finalPlayers, winner: localWinner, gameState: 'RESULT', message: "試合終了！" } });
        }
        else {
          // Generate new hands for next round (Host Logic)
          // We map generated cards to IDs immediately for sending
          const nextHands = generateHands();
          const serializedHands = {
            1: nextHands[1].map(c => ({ id: c.id })),
            2: nextHands[2].map(c => ({ id: c.id }))
          };

          socket.emit('update_state', {
            roomId, updates: {
              players: finalPlayers,
              round: round + 1,
              gameState: 'PLANNING',
              activePlayer: 1, // Reset turn to P1
              hands: serializedHands,
              "programs.1": Array(5).fill(null), // Note: server must handle dot notation or we send full object
              "programs.2": Array(5).fill(null),
              programs: { 1: Array(5).fill(null), 2: Array(5).fill(null) }, // Sending full object is safer for simple server
              message: `ラウンド ${round + 1}：${finalPlayers[0].name} のターン`
            }
          });
        }
      } catch (err) { console.error("Online round sync error:", err); }
    }
  }

  async function runExecutionLocal(currentPlayers, currentPrograms) {
    let cp = JSON.parse(JSON.stringify(currentPlayers));
    try {
      for (let i = 0; i < 5; i++) {
        setExecutionStep(i);
        await new Promise(r => setTimeout(r, 800));
        let nextStep = JSON.parse(JSON.stringify(cp));
        for (let pIdx = 0; pIdx < 2; pIdx++) {
          const pNum = pIdx + 1; const opponentIdx = pIdx === 0 ? 1 : 0;
          const card = currentPrograms[pNum]?.[i]; if (!card) continue;
          if (nextStep[pIdx].stun) { nextStep[pIdx].stun = false; continue; }
          const p = nextStep[pIdx]; const opp = nextStep[opponentIdx];
          if (card.id === 'MOVE' || card.id === 'JUMP') {
            const { nx, ny } = getNextPos(p.x, p.y, p.dir, card.id === 'JUMP' ? 2 : 1);
            p.x = nx; p.y = ny;
          } else if (card.id === 'TURN_L') { p.dir = DIRECTIONS[(DIRECTIONS.indexOf(p.dir) + 3) % 4]; }
          else if (card.id === 'TURN_R') { p.dir = DIRECTIONS[(DIRECTIONS.indexOf(p.dir) + 1) % 4]; }
          else if (card.id === 'LASER') {
            setVisualEffect({ type: 'laser', x: p.x, y: p.y, dir: p.dir, color: p.colorClass?.replace('text-', 'bg-') || 'bg-rose-400' });
            setTimeout(() => setVisualEffect(null), 400);
            let hit = (p.dir === 'UP' && opp.x === p.x && opp.y < p.y) || (p.dir === 'DOWN' && opp.x === p.x && opp.y > p.y) || (p.dir === 'LEFT' && opp.y === p.y && opp.x < p.x) || (p.dir === 'RIGHT' && opp.y === p.y && opp.x > p.x);
            if (hit) { const { nx, ny } = getNextPos(opp.x, opp.y, p.dir, 1); opp.x = nx; opp.y = ny; opp.stun = true; }
          } else if (card.id === 'HACK') {
            setVisualEffect({ type: 'hack', x: p.x, y: p.y, color: p.colorClass?.replace('text-', 'bg-') || 'bg-orange-400' });
            setTimeout(() => setVisualEffect(null), 400);
            if (Math.abs(p.x - opp.x) + Math.abs(p.y - opp.y) <= 1) { opp.dir = DIRECTIONS[(DIRECTIONS.indexOf(opp.dir) + 2) % 4]; opp.stun = true; }
          }
        }
        if (nextStep[0].x === nextStep[1].x && nextStep[0].y === nextStep[1].y) {
          const { nx, ny } = getNextPos(nextStep[1].x, nextStep[1].y, 'DOWN', 1);
          nextStep[1].x = nx; nextStep[1].y = ny;
        }
        cp = nextStep; setPlayers(cp);
        if ((cp[0]?.x === 6 && cp[0]?.y === 6) || (cp[1]?.x === 0 && cp[1]?.y === 0)) break;
      }
    } catch (e) {
      console.error("Execution error", e);
    } finally {
      setExecutionStep(-1);
      // Ensure we use the latest calculated state 'cp' or fallback to a safe state if error
      handleRoundEnd(cp);
    }
  }

  async function submitProgram() {
    if (mode === 'LOCAL') {
      if (turn === 1) { setTurn(2); setMessage(`${players[1]?.name || "Player 2"}のターン！`); }
      else { setGameState('EXECUTION'); runExecutionLocal(players, programs); }
    } else {

      try {
        const updates = {};
        if (onlineRole === 1) {
          // Serialize programs just in case (though we store objects, let's send IDs)
          const p1 = programs[1].map(c => c ? { id: c.id } : null);
          // We need to merge with existing programs on server? 
          // Server simple merge might overwrite entire programs object if we are not careful.
          // Let's rely on server merging top level keys. We need to send `programs` object with preserved other player's data?
          // No, `programs` is shared state. If I send `programs: { ...programs, 1: p1 }` it might overwrite P2's update if concurrent.
          // Ideally server supports partial update or we just send what we have.
          // Since `submitProgram` happens sequentially usually or we hope so.
          // Let's try sending full programs state but ONLY modifying our part.
          // But we don't have P2's latest program if we are not careful? 
          // We do have it from `rooms` sync.
          // So:
          const newProgs = { ...programs, 1: p1 };
          updates.programs = newProgs;
          updates.activePlayer = 2; // Pass turn to P2
          updates.message = `${players[1].name} の入力を待っています`;
        } else {
          const p2 = programs[2].map(c => c ? { id: c.id } : null);
          const newProgs = { ...programs, 2: p2 };
          updates.programs = newProgs;
          updates.activePlayer = null; // Execution phase, no active player
          updates.gameState = 'EXECUTION';
          updates.message = "プログラムを実行中...";
        }
        socket.emit('update_state', { roomId, updates });
      } catch (err) {
        console.error("Online submit error:", err);
        setMessage("保存に失敗しました。画像サイズを小さくしてください。");
      }
    }
  }

  // --- Effects ---
  // Auth Effect Removed

  useEffect(() => {
    if (mode !== 'ONLINE') return;

    function onRoomJoined({ role, room }) {
      setOnlineRole(role);
      setTurn(room.activePlayer || 1); // logic
      updateLocalState(room);
    }

    function onRoomUpdated(room) {
      updateLocalState(room);
    }

    function onError({ message }) {
      setMessage("エラー: " + message);
      setTimeout(initGame, 3000);
    }

    function updateLocalState(data) {
      if (data.players) setPlayers(data.players);
      if (data.gameState) setGameState(data.gameState);
      if (data.round) setRound(data.round);
      if (data.winner !== undefined) setWinner(data.winner);
      if (data.hands) {
        // Hydrate hands
        setHands({
          1: hydrateCards(data.hands[1]),
          2: hydrateCards(data.hands[2])
        });
      }
      if (data.programs) {
        setPrograms(hydratePrograms(data.programs));
      }
      if (data.message) setMessage(data.message);
      if (data.activePlayer) setTurn(data.activePlayer);

      // Check execution start
      if (data.gameState === 'EXECUTION' && executionStep === -1) {
        // Need to wait slightly to ensure state is settled?
        // render MainUI will use `players` and `programs`.
        // Trigger execution
        // Note: `data.players` might be the start position, `data.programs` has cards.
        // `runExecutionLocal` uses `players` and `programs` args from state if not passed, 
        // OR we pass `data.players`, `data.programs` (hydrated).
        // Let's pass the fresh data to be safe.
        runExecutionLocal(data.players, hydratePrograms(data.programs));
      }
    }

    socket.on('room_joined', onRoomJoined);
    socket.on('room_updated', onRoomUpdated);
    socket.on('error', onError);

    return () => {
      socket.off('room_joined', onRoomJoined);
      socket.off('room_updated', onRoomUpdated);
      socket.off('error', onError);
    };
  }, [mode, executionStep]); // removed user, roomId from deps as they are stable-ish or checked inside

  useEffect(() => {
    let interval;
    if (gameState === 'LOBBY' && lobbyTimeLeft > 0) {
      interval = setInterval(() => {
        setLobbyTimeLeft(t => t - 1);
      }, 1000);
    } else if (lobbyTimeLeft === 0 && gameState === 'LOBBY') {
      initGame();
      setMessage("相手が見つかりませんでした。");
    }
    return () => clearInterval(interval);
  }, [gameState, lobbyTimeLeft]);

  // --- Rendering Helpers ---
  const renderMainUI = () => {
    if (gameState === 'START') {
      const isP1Ready = !!customImages[1]; const isP2Ready = !!customImages[2];
      return (
        <div className="flex-1 flex items-center justify-center p-4 animate-in fade-in zoom-in duration-500">
          <div className="bg-white p-8 md:p-12 rounded-[4rem] shadow-2xl border-b-[16px] border-slate-200 max-w-4xl w-full">
            <div className="text-center mb-10">
              <div className="inline-block bg-blue-500 text-white text-[10px] font-black tracking-[0.2em] uppercase px-4 py-1.5 rounded-full mb-4 shadow-lg shadow-blue-200">Logic Puzzle Battle</div>
              <h2 className="text-3xl md:text-4xl font-black text-slate-800 tracking-tighter">ヒーローをカスタマイズ！</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-12">
              <div className={`p-8 rounded-[3.5rem] border-4 transition-all transform hover:scale-[1.02] ${isP1Ready ? 'bg-blue-50 border-blue-300' : 'bg-slate-50 border-slate-100 shadow-inner'}`}>
                <div className="flex justify-between items-center mb-6">
                  <span className="bg-blue-500 text-white text-[10px] font-black px-4 py-1.5 rounded-full shadow-md">Player 1</span>
                  {!isP1Ready && <span className="text-[10px] font-bold text-rose-500 flex items-center gap-1 animate-pulse"><AlertCircle size={14} /> 画像が必要です</span>}
                </div>
                <input type="text" value={tempNames[1]} onChange={(e) => setTempNames({ ...tempNames, 1: e.target.value })} className="w-full px-6 py-4 rounded-[2rem] border-4 border-white bg-white shadow-md font-black text-slate-700 outline-none focus:border-blue-400 mb-8 text-center transition-all" placeholder="なまえをいれてね" />
                <div className="flex flex-col items-center">
                  <CustomPawn size={110} customImage={customImages[1]} colorClass="text-blue-500" isMissing={!isP1Ready} />
                  <input type="file" ref={fileInputRef1} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 1)} />
                  <button onClick={() => fileInputRef1.current.click()} className={`mt-8 px-8 py-4 text-white rounded-[2rem] font-black text-sm transition-all shadow-xl active:scale-95 flex items-center gap-3 ${isP1Ready ? 'bg-blue-500 shadow-blue-200 hover:bg-blue-600' : 'bg-rose-500 shadow-rose-200 animate-bounce'}`}>
                    {isP1Ready ? <Check size={20} /> : <Upload size={20} />} {isP1Ready ? '変更する' : '画像をアップ'}
                  </button>
                </div>
              </div>

              <div className={`p-8 rounded-[3.5rem] border-4 transition-all transform hover:scale-[1.02] ${isP2Ready ? 'bg-rose-50 border-rose-300' : 'bg-slate-50 border-slate-100 shadow-inner'}`}>
                <div className="flex justify-between items-center mb-6">
                  <span className="bg-rose-500 text-white text-[10px] font-black px-4 py-1.5 rounded-full shadow-md">Player 2</span>
                </div>
                <input type="text" value={tempNames[2]} onChange={(e) => setTempNames({ ...tempNames, 2: e.target.value })} className="w-full px-6 py-4 rounded-[2rem] border-4 border-white bg-white shadow-md font-black text-slate-700 outline-none focus:border-rose-400 mb-8 text-center transition-all" placeholder="なまえをいれてね" />
                <div className="flex flex-col items-center">
                  <CustomPawn size={110} customImage={customImages[2]} colorClass="text-red-500" isMissing={!isP2Ready} />
                  <input type="file" ref={fileInputRef2} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 2)} />
                  <button onClick={() => fileInputRef2.current.click()} className="mt-8 px-8 py-4 bg-slate-200 text-slate-500 rounded-[2rem] font-black text-sm hover:bg-slate-300 transition-all shadow-xl active:scale-95 flex items-center gap-3">
                    <Upload size={20} /> 画像をアップ
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-6">
              <button disabled={!isP1Ready || !isP2Ready} onClick={startLocalGame} className="flex-1 p-8 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-[3rem] font-black text-xl hover:from-blue-600 hover:to-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-4 transition-all shadow-2xl shadow-blue-200 hover:-translate-y-1 active:translate-y-0">
                <Users size={32} strokeWidth={3} /> ローカル対戦
              </button>
              <div className="flex-1 space-y-3">
                <div className="flex gap-3 h-full">
                  <input type="text" value={onlineTargetId} onChange={(e) => setOnlineTargetId(e.target.value)} placeholder="部屋ID" className="flex-1 px-8 rounded-[3rem] border-4 border-indigo-100 font-black text-slate-700 outline-none focus:border-indigo-400 text-center text-xl transition-all shadow-inner bg-slate-50" />
                  <button disabled={!isP1Ready || isAuthLoading} onClick={startOnlineLobby} className="p-8 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-[3rem] font-black hover:from-indigo-600 hover:to-purple-700 disabled:opacity-30 flex items-center justify-center gap-3 transition-all shadow-2xl shadow-indigo-200 hover:-translate-y-1 active:translate-y-0 min-w-[120px]">
                    {isAuthLoading ? <Loader2 className="animate-spin" /> : <Globe size={32} strokeWidth={3} />}
                  </button>
                </div>
              </div>
            </div>
            {!isP1Ready && <p className="mt-6 text-center text-rose-500 font-black text-[10px] uppercase tracking-widest animate-pulse">※ オンラインであそぶには Player 1 の画像がひつようです</p>}
          </div>
        </div>
      );
    }

    if (gameState === 'LOBBY') {
      const minutes = Math.floor(lobbyTimeLeft / 60);
      const seconds = lobbyTimeLeft % 60;
      return (
        <div className="flex-1 flex items-center justify-center p-4 animate-in fade-in duration-500">
          <div className="bg-white p-16 rounded-[5rem] shadow-2xl text-center max-w-md w-full border-b-[16px] border-indigo-100">
            <div className="relative w-40 h-40 mx-auto mb-12">
              <div className="absolute inset-0 bg-indigo-500/10 rounded-full animate-ping"></div>
              <RefreshCw size={160} className="text-indigo-500 animate-spin opacity-5" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Timer size={64} className="text-indigo-500 drop-shadow-md" />
              </div>
            </div>
            <h2 className="text-4xl font-black mb-4 text-indigo-600 tracking-tighter">マッチング中</h2>
            <div className="bg-indigo-600 text-white px-8 py-3 rounded-full inline-block font-mono text-3xl font-black mb-8 shadow-xl shadow-indigo-200">
              {minutes}:{seconds.toString().padStart(2, '0')}
            </div>
            <div className="p-6 bg-slate-50 rounded-[2.5rem] border-4 border-slate-100 mb-10">
              <p className="text-slate-400 text-sm font-black mb-1 uppercase tracking-widest">Room ID</p>
              <p className="text-2xl font-black text-slate-800">{onlineTargetId}</p>
            </div>
            <button onClick={initGame} className="w-full py-5 rounded-[2.5rem] border-4 border-slate-100 text-slate-400 text-sm font-black hover:bg-slate-50 transition-all uppercase tracking-[0.2em] shadow-sm">Cancel</button>
          </div>
        </div>
      );
    }

    const pKey = mode === 'ONLINE' ? onlineRole : turn;
    const isP1 = pKey === 1;

    return (
      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 items-start pb-20 px-4 animate-in fade-in duration-700">
        {/* 左側：プログラムスロット */}
        <div className="lg:col-span-3 space-y-8">
          <div className={`p-8 rounded-[4rem] border-8 shadow-2xl bg-white transition-all transform hover:-rotate-1 ${isP1 ? 'border-blue-100 shadow-blue-50' : 'border-rose-100 shadow-rose-50'}`}>
            <h3 className="text-[11px] font-black mb-8 flex items-center gap-3 uppercase tracking-[0.3em] text-slate-400"><Play size={20} className="text-slate-300" /> PROGRAM SLOTS</h3>
            <div className="space-y-4">
              {programs[pKey]?.map((slot, i) => (
                <div key={i} onClick={() => removeFromProgram(i)} className={`h-20 rounded-[2rem] border-4 flex items-center px-6 cursor-pointer transition-all ${slot ? `${slot.color} border-transparent text-white shadow-lg` : 'border-slate-100 bg-slate-50 text-slate-300 hover:border-slate-200'} ${executionStep === i ? 'ring-8 ring-yellow-300 scale-105 shadow-2xl z-20' : ''}`}>
                  <span className="w-10 font-mono text-lg font-black opacity-30">{i + 1}</span>
                  {slot ? <div className="flex items-center gap-4 font-black text-base"><slot.icon size={26} strokeWidth={3} /> {slot.label}</div> : <span className="text-[11px] font-black uppercase tracking-widest opacity-30 italic">Empty</span>}
                </div>
              ))}
            </div>
            <button onClick={submitProgram} disabled={gameState !== 'PLANNING' || (mode === 'ONLINE' && onlineRole !== (message?.includes(players[0]?.name) ? 1 : 2)) || (programs[pKey] && programs[pKey].every(s => s === null))} className={`w-full mt-12 py-6 rounded-[3rem] font-black text-white text-xl shadow-2xl transition-all ${isP1 ? 'bg-gradient-to-r from-blue-500 to-blue-600 shadow-blue-200 hover:scale-105' : 'bg-gradient-to-r from-rose-500 to-rose-600 shadow-rose-200 hover:scale-105'} disabled:opacity-20 disabled:scale-100 disabled:shadow-none active:scale-95 flex items-center justify-center gap-3`}>
              {turn === 1 && mode === 'LOCAL' ? '交代する' : '実行！'} <ChevronRight strokeWidth={4} />
            </button>
          </div>
          {/* 手札 */}
          <div className="p-8 rounded-[4rem] border-8 border-slate-100 bg-white shadow-2xl">
            <h3 className="text-[11px] font-black mb-8 uppercase tracking-[0.3em] text-slate-400">YOUR HAND</h3>
            <div className="grid grid-cols-2 gap-4">
              {(hands[pKey] || []).map((card, i) => (
                <button key={i} onClick={() => addToProgram(card, i)} className={`p-5 rounded-[2.5rem] text-left text-white ${card.color} hover:scale-110 active:scale-90 transition-all shadow-xl group relative overflow-hidden h-28`}>
                  <card.icon size={28} strokeWidth={3} className="mb-3 relative z-10" />
                  <div className="text-[11px] font-black uppercase relative z-10 leading-tight">{card.label}</div>
                  <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-150 group-hover:rotate-12 transition-all duration-700 transform rotate-12"><card.icon size={80} /></div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 中央：ボード */}
        <div className="lg:col-span-6 flex flex-col items-center">
          <div className="mb-10 bg-white px-12 py-5 rounded-[3rem] border-b-[10px] border-slate-200 font-black shadow-2xl text-xl text-slate-700 animate-bounce-slow flex items-center gap-4">
            <div className={`w-4 h-4 rounded-full ${gameState === 'PLANNING' ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></div>
            {message}
          </div>
          <div className="bg-white p-6 rounded-[5rem] shadow-2xl border-b-[20px] border-slate-200 relative">
            <div className="grid gap-3 bg-slate-100 p-3 rounded-[4rem]" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`, width: 'min(90vw, 600px)', height: 'min(90vw, 600px)' }}>
              {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => {
                const x = i % GRID_SIZE; const y = Math.floor(i / GRID_SIZE);
                const isCheckered = (x + y) % 2 === 0;
                return (
                  <div key={i} className={`relative rounded-3xl overflow-hidden flex items-center justify-center transition-all aspect-square ${isCheckered ? 'bg-white' : 'bg-white/40'}`}>
                    {visualEffect && visualEffect.type === 'laser' && ((visualEffect.dir === 'UP' && x === visualEffect.x && y < visualEffect.y) || (visualEffect.dir === 'DOWN' && x === visualEffect.x && y > visualEffect.y) || (visualEffect.dir === 'LEFT' && y === visualEffect.y && x < visualEffect.x) || (visualEffect.dir === 'RIGHT' && y === visualEffect.y && x > visualEffect.x)) && <div className={`absolute inset-0 ${visualEffect.color} opacity-70 animate-pulse shadow-[inset_0_0_30px_white]`}></div>}
                    {visualEffect && visualEffect.type === 'hack' && Math.abs(x - visualEffect.x) <= 1 && Math.abs(y - visualEffect.y) <= 1 && <div className={`absolute inset-0 ${visualEffect.color} opacity-50 animate-ping`}></div>}
                    {players.map(p => p.x === x && p.y === y && (
                      <div key={p.id} className={`transition-all duration-500 ${p.dir === 'UP' ? 'rotate-0' : p.dir === 'RIGHT' ? 'rotate-90' : p.dir === 'DOWN' ? 'rotate-180' : '-rotate-90'}`}>
                        <div className={`p-2 rounded-[1.5rem] ${p.bgColor} relative shadow-xl border-4 border-white`}>
                          {p.stun && <div className="absolute -top-3 -right-3 bg-yellow-400 rounded-full p-2 animate-bounce z-20 shadow-2xl border-4 border-white"><Zap size={20} fill="currentColor" /></div>}
                          <CustomPawn size={64} customImage={p.customImage} colorClass={p.colorClass} />
                          <div className={`absolute -top-4 left-1/2 -translate-x-1/2 ${p.colorClass} drop-shadow-lg scale-125`}><ArrowUp size={24} strokeWidth={5} /></div>
                        </div>
                      </div>
                    ))}
                    {/* Goal markers */}
                    {x === 6 && y === 6 && <div className="absolute bottom-3 right-3 opacity-30 scale-150"><Trophy size={20} className="text-blue-500" /></div>}
                    {x === 0 && y === 0 && <div className="absolute top-3 left-3 opacity-30 scale-150"><Trophy size={20} className="text-rose-500" /></div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 右側：ミッション情報 */}
        <div className="lg:col-span-3 space-y-8">
          <div className="p-8 rounded-[4rem] border-8 border-slate-100 bg-white shadow-2xl transform hover:rotate-1 transition-all">
            <h3 className="text-[11px] font-black mb-8 uppercase tracking-[0.3em] text-slate-400 flex items-center gap-3"><Target size={22} className="text-slate-300" /> MISSION</h3>
            <div className="space-y-6">
              {players.map(p => (
                <div key={p?.id} className={`flex items-center gap-5 p-5 rounded-[2.5rem] border-4 ${p?.id === 1 ? 'border-blue-50 bg-blue-50/30' : 'border-rose-50 bg-rose-50/30'} shadow-sm`}>
                  <CustomPawn size={50} customImage={p?.customImage} colorClass={p?.colorClass} />
                  <div className="overflow-hidden">
                    <p className="text-base font-black truncate text-slate-700">{p?.name || "???"}</p>
                    <p className="text-[10px] opacity-60 font-black uppercase tracking-tighter mt-1 bg-white px-2 py-0.5 rounded-full inline-block">Goal: {p?.id === 1 ? '6, 6' : '0, 0'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button onClick={() => confirm("はじめにもどりますか？") && initGame()} className="w-full py-6 bg-slate-50 text-slate-400 rounded-[3rem] text-xs font-black transition-all border-4 border-slate-100 uppercase tracking-[0.3em] hover:bg-white hover:text-slate-600 shadow-lg active:scale-95">Reset Game</button>
        </div>
      </main>
    );
  };

  return (
    <div className="min-h-screen bg-[#fcfdfe] text-slate-800 p-4 lg:p-12 font-sans select-none flex flex-col items-center">
      <header className="w-full max-w-7xl flex justify-between items-center mb-12 px-6">
        <div className="flex flex-col">
          <h1 className="text-5xl md:text-6xl font-black text-blue-500 tracking-tighter drop-shadow-xl transform -rotate-2">LOGIC DUEL</h1>
          {mode === 'ONLINE' && roomId && <div className="mt-4 inline-flex items-center gap-3 px-6 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-[11px] font-black rounded-full shadow-2xl shadow-indigo-100 uppercase tracking-widest border-2 border-white/20">ROOM: {roomId} <span className="opacity-40">|</span> P{onlineRole}</div>}
        </div>
        <div className="flex gap-6">
          <div className={`px-8 py-4 rounded-[2.5rem] border-4 transition-all transform ${turn === 1 ? 'border-blue-400 bg-white -rotate-3 scale-110 shadow-2xl' : 'border-slate-100 bg-slate-50 opacity-30 shadow-inner rotate-0'}`}>
            <p className="text-[11px] font-black text-blue-500 uppercase tracking-[0.2em] mb-1">Hero 1</p>
            <p className="font-black text-lg text-slate-700">{players[0]?.name || "P1"}</p>
          </div>
          <div className={`px-8 py-4 rounded-[2.5rem] border-4 transition-all transform ${turn === 2 ? 'border-rose-400 bg-white rotate-3 scale-110 shadow-2xl' : 'border-slate-100 bg-slate-50 opacity-30 shadow-inner rotate-0'}`}>
            <p className="text-[11px] font-black text-rose-500 uppercase tracking-[0.2em] mb-1">Hero 2</p>
            <p className="font-black text-lg text-slate-700">{players[1]?.name || "P2"}</p>
          </div>
        </div>
      </header>

      {renderMainUI()}

      {gameState === 'RESULT' && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-2xl flex items-center justify-center z-50 p-6 animate-in fade-in duration-500">
          <div className="bg-white border-b-[24px] border-slate-200 p-12 md:p-20 rounded-[6rem] max-w-xl w-full text-center shadow-[0_0_120px_rgba(255,255,255,0.3)] relative overflow-hidden animate-in zoom-in duration-500">
            <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-r from-blue-500 via-purple-500 to-rose-500"></div>
            <Trophy size={140} className="mx-auto text-yellow-400 mb-10 animate-bounce drop-shadow-2xl" />
            <h2 className="text-5xl md:text-6xl font-black mb-6 leading-tight text-slate-900 tracking-tighter">
              {winner === 'DRAW' ? 'ひきわけ！' : `${players[winner - 1]?.name || "???"} のしょうり！`}
            </h2>
            <p className="text-slate-400 font-black tracking-widest uppercase mb-12">Congratulations on your logic!</p>
            {winner !== 'DRAW' && winner && players[winner - 1] && (
              <div className="flex justify-center mb-16 transform scale-150">
                <CustomPawn size={110} customImage={players[winner - 1].customImage} colorClass={players[winner - 1].colorClass} />
              </div>
            )}
            <button onClick={initGame} className="w-full py-8 bg-gradient-to-r from-blue-500 via-indigo-600 to-purple-600 text-white rounded-[3rem] font-black text-3xl shadow-2xl shadow-blue-300 transform hover:scale-105 active:scale-95 transition-all uppercase tracking-tighter">もういちど あそぶ</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-bounce-slow {
          animation: bounce-slow 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default App;