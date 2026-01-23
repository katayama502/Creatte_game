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
  Timer
} from 'lucide-react';

// --- Firebase Imports ---
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  onSnapshot, 
  updateDoc
} from 'firebase/firestore';

// --- Firebase Config ---
const firebaseConfig = {
  apiKey: "AIzaSyDfRVH-33nzntVjM6KkeNRrc8UCjhwgkts",
  authDomain: "prototype-5742a.firebaseapp.com",
  projectId: "prototype-5742a",
  storageBucket: "prototype-5742a.firebasestorage.app",
  messagingSenderId: "627082782302",
  appId: "1:627082782302:web:2781dd2fb141b0bff3f6cf",
  measurementId: "G-4SW7CH20KK"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'logic-duel-multi';

// --- 定数 ---
const GRID_SIZE = 7;
const INITIAL_HAND_SIZE = 6;
const DIRECTIONS = ['UP', 'RIGHT', 'DOWN', 'LEFT'];

const CARD_TYPES = {
  MOVE: { id: 'MOVE', label: 'すすむ', icon: ArrowUp, color: 'bg-blue-400 shadow-blue-200', description: '1歩進む' },
  TURN_L: { id: 'TURN_L', label: '左をむく', icon: RotateCw, color: 'bg-indigo-400 shadow-indigo-200', description: '左に90度向く', extraClass: '-scale-x-100' },
  TURN_R: { id: 'TURN_R', label: '右をむく', icon: RotateCw, color: 'bg-purple-400 shadow-purple-200', description: '右に90度向く' },
  LASER: { id: 'LASER', label: 'レーザー', icon: Zap, color: 'bg-rose-400 shadow-rose-200', description: '正面の相手を撃つ(1マス後退させる)' },
  HACK: { id: 'HACK', label: 'ハック', icon: Bomb, color: 'bg-orange-400 shadow-orange-200', description: '周囲1マスの相手を回転させる' },
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

// --- カスタム駒コンポーネント ---
const CustomPawn = ({ size = 48, customImage, colorClass, isMissing }) => {
  const borderColor = colorClass?.includes('text-blue') ? '#60a5fa' : colorClass?.includes('text-red') ? '#f87171' : '#94a3b8';
  if (customImage) {
    return (
      <div 
        style={{ width: size, height: size, backgroundImage: `url(${customImage})`, backgroundSize: 'cover', backgroundPosition: 'center', borderRadius: '16px', border: `4px solid ${borderColor}` }}
        className="shadow-lg transition-all duration-500 transform hover:scale-105"
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
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [roomId, setRoomId] = useState(null);
  const [onlineRole, setOnlineRole] = useState(null); 
  const [turn, setTurn] = useState(1);
  const [round, setRound] = useState(1);
  const [players, setPlayers] = useState([
    { id: 1, x: 0, y: 0, dir: 'RIGHT', stun: false, name: "Player 1", customImage: null, colorClass: "text-blue-500", bgColor: "bg-blue-50" },
    { id: 2, x: 6, y: 6, dir: 'LEFT', stun: false, name: "Player 2", customImage: null, colorClass: "text-red-500", bgColor: "bg-red-50" }
  ]);
  const [hands, setHands] = useState({ 1: [], 2: [] });
  const [programs, setPrograms] = useState({ 1: Array(5).fill(null), 2: Array(5).fill(null) });
  const [executionStep, setExecutionStep] = useState(-1);
  const [winner, setWinner] = useState(null);
  const [message, setMessage] = useState("");
  const [visualEffect, setVisualEffect] = useState(null);
  const [onlineTargetId, setOnlineTargetId] = useState("room-1");
  const [lobbyTimeLeft, setLobbyTimeLeft] = useState(180); // 3分

  const [tempNames, setTempNames] = useState({ 1: "Player 1", 2: "Player 2" });
  const [customImages, setCustomImages] = useState({ 1: null, 2: null });
  const fileInputRef1 = useRef(null);
  const fileInputRef2 = useRef(null);

  // --- Functions ---
  const initGame = () => {
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
  };

  const handleImageUpload = async (e, playerNum) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const compressed = await resizeImage(reader.result);
        setCustomImages(prev => ({ ...prev, [playerNum]: compressed }));
      };
      reader.readAsDataURL(file);
    }
  };

  const generateHands = () => {
    const pick = () => Array.from({ length: INITIAL_HAND_SIZE }, () => {
      const keys = Object.keys(CARD_TYPES);
      return CARD_TYPES[keys[Math.floor(Math.random() * keys.length)]];
    });
    return { 1: pick(), 2: pick() };
  };

  const startLocalGame = () => {
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
  };

  const startOnlineLobby = async () => {
    if (!user || !customImages[1]) return;
    setGameState('LOBBY');
    setLobbyTimeLeft(180);
    setMessage("通信のじゅんび中...");
    setMode('ONLINE');
    
    const rid = onlineTargetId || "room-1";
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', rid);
    
    try {
      const snap = await getDoc(roomRef);
      const data = snap.exists() ? snap.data() : null;
      
      if (!data || data.status === 'waiting' || data.gameState === 'RESULT') {
        if (data?.players?.[0]?.uid === user.uid) {
           setOnlineRole(1); setTurn(1); setRoomId(rid);
           return;
        }
        const initialData = {
          roomId: rid, status: 'waiting', gameState: 'LOBBY', round: 1, winner: null,
          players: [{ id: 1, x: 0, y: 0, dir: 'RIGHT', stun: false, name: tempNames[1], customImage: customImages[1], uid: user.uid, colorClass: "text-blue-500", bgColor: "bg-blue-50" }],
          programs: { 1: Array(5).fill(null), 2: Array(5).fill(null) },
          message: "対戦相手をまっています..."
        };
        await setDoc(roomRef, initialData);
        setOnlineRole(1); setTurn(1);
      } else if (data.status === 'waiting') {
        if (data.players?.[0]?.uid === user.uid) { 
          setOnlineRole(1); setTurn(1); setRoomId(rid); setGameState('LOBBY');
          return; 
        }
        const updatedPlayers = [
          data.players[0], 
          { id: 2, x: 6, y: 6, dir: 'LEFT', stun: false, name: tempNames[1], customImage: customImages[1], uid: user.uid, colorClass: "text-red-500", bgColor: "bg-red-50" }
        ];
        await updateDoc(roomRef, {
          players: updatedPlayers, status: 'playing', gameState: 'PLANNING', hands: generateHands(),
          message: "バトルスタート！P1の入力を待っています"
        });
        setOnlineRole(2); setTurn(2);
      }
      setRoomId(rid);
    } catch (err) {
      setMessage("エラー：もう一度ためしてください");
      console.error("Firestore join error:", err);
      setTimeout(() => initGame(), 2000);
    }
  };

  const addToProgram = (card, index) => {
    if (gameState !== 'PLANNING') return;
    if (mode === 'ONLINE') {
      const currentWaitingId = message?.includes("P1") ? 1 : 2;
      if (onlineRole !== currentWaitingId) return;
    }
    const newPrograms = { ...programs };
    const emptyIndex = newPrograms[turn].findIndex(slot => slot === null);
    if (emptyIndex !== -1) {
      newPrograms[turn][emptyIndex] = { ...card };
      setPrograms(newPrograms);
      const newHands = { ...hands };
      newHands[turn] = newHands[turn].filter((_, i) => i !== index);
      setHands(newHands);
    }
  };

  const removeFromProgram = (slotIndex) => {
    if (gameState !== 'PLANNING') return;
    const card = programs[turn][slotIndex];
    if (!card) return;
    const newPrograms = { ...programs };
    newPrograms[turn][slotIndex] = null;
    setPrograms(newPrograms);
    const newHands = { ...hands };
    newHands[turn].push(card);
    setHands(newHands);
  };

  const getNextPos = (x, y, dir, steps = 1) => {
    let nx = x, ny = y;
    if (dir === 'UP') ny -= steps; if (dir === 'DOWN') ny += steps; if (dir === 'LEFT') nx -= steps; if (dir === 'RIGHT') nx += steps;
    return { nx: Math.max(0, Math.min(GRID_SIZE - 1, nx)), ny: Math.max(0, Math.min(GRID_SIZE - 1, ny)) };
  };

  async function handleRoundEnd(finalPlayers) {
    const p1W = finalPlayers[0]?.x === 6 && finalPlayers[0]?.y === 6;
    const p2W = finalPlayers[1]?.x === 0 && finalPlayers[1]?.y === 0;
    let localWinner = p1W && p2W ? 'DRAW' : p1W ? 1 : p2W ? 2 : null;
    
    if (mode === 'LOCAL') {
      if (localWinner) { setWinner(localWinner); setGameState('RESULT'); }
      else { setRound(r => r + 1); setTurn(1); setGameState('PLANNING'); setHands(generateHands()); setPrograms({ 1: Array(5).fill(null), 2: Array(5).fill(null) }); setMessage(`${players[0]?.name || "Player 1"}のターン！`); }
    } else if (onlineRole === 1) {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
      try {
        if (localWinner) { await updateDoc(roomRef, { players: finalPlayers, winner: localWinner, gameState: 'RESULT', message: "試合終了！" }); }
        else { await updateDoc(roomRef, { players: finalPlayers, round: round + 1, gameState: 'PLANNING', hands: generateHands(), "programs.1": Array(5).fill(null), "programs.2": Array(5).fill(null), message: "次のラウンド！P1のターン" }); }
      } catch (err) { console.error("Online round sync error:", err); }
    }
  }

  async function runExecutionLocal(currentPlayers, currentPrograms) {
    let cp = JSON.parse(JSON.stringify(currentPlayers));
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
        const {nx, ny} = getNextPos(nextStep[1].x, nextStep[1].y, 'DOWN', 1);
        nextStep[1].x = nx; nextStep[1].y = ny;
      }
      cp = nextStep; setPlayers(cp);
      if ((cp[0]?.x === 6 && cp[0]?.y === 6) || (cp[1]?.x === 0 && cp[1]?.y === 0)) break;
    }
    setExecutionStep(-1);
    handleRoundEnd(cp);
  }

  async function submitProgram() {
    if (mode === 'LOCAL') {
      if (turn === 1) { setTurn(2); setMessage(`${players[1]?.name || "Player 2"}のターン！`); }
      else { setGameState('EXECUTION'); runExecutionLocal(players, programs); }
    } else {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
      try {
        if (onlineRole === 1) {
          await updateDoc(roomRef, { "programs.1": programs[1], message: "P2の入力を待っています" });
        } else {
          await updateDoc(roomRef, { "programs.2": programs[2], gameState: 'EXECUTION', message: "実行中..." });
        }
      } catch (err) { 
        console.error("Online submit error:", err); 
        setMessage("エラー：送信に失敗しました"); 
      }
    }
  }

  // --- Effects ---
  useEffect(() => {
    async function performAuth() {
      try {
        let signedInUser = null;
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          try {
            const credential = await signInWithCustomToken(auth, __initial_auth_token);
            signedInUser = credential.user;
          } catch (e) {}
        }
        if (!signedInUser) {
          const credential = await signInAnonymously(auth);
          signedInUser = credential.user;
        }
        setUser(signedInUser);
      } catch (err) {
        console.error("Auth failed:", err);
      } finally {
        setIsAuthLoading(false);
      }
    }
    performAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || mode !== 'ONLINE' || !roomId) return;
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    const unsubscribe = onSnapshot(roomRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      if (data.players) setPlayers(data.players);
      if (data.gameState) setGameState(data.gameState);
      if (data.round) setRound(data.round);
      if (data.winner !== undefined) setWinner(data.winner);
      if (data.hands) setHands(data.hands);
      if (data.programs) setPrograms(data.programs);
      if (data.message) setMessage(data.message);

      if (data.gameState === 'EXECUTION' && executionStep === -1) {
        runExecutionLocal(data.players, data.programs);
      }
    }, (err) => {
      setMessage("通信エラー");
      console.error(err);
    });
    return () => unsubscribe();
  }, [user, mode, roomId, executionStep]);

  // ロビー待機タイマーのエフェクト
  useEffect(() => {
    let interval;
    if (gameState === 'LOBBY' && lobbyTimeLeft > 0) {
      interval = setInterval(() => {
        setLobbyTimeLeft(t => t - 1);
      }, 1000);
    } else if (lobbyTimeLeft === 0 && gameState === 'LOBBY') {
      initGame();
      setMessage("対戦相手が見つかりませんでした");
    }
    return () => clearInterval(interval);
  }, [gameState, lobbyTimeLeft]);

  // --- Rendering Helpers ---
  const renderMainUI = () => {
    if (gameState === 'START') {
      const isP1Ready = !!customImages[1]; const isP2Ready = !!customImages[2];
      return (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white p-8 md:p-12 rounded-[3.5rem] shadow-2xl border-b-[12px] border-slate-200 max-w-4xl w-full">
            <div className="text-center mb-10">
              <p className="text-blue-500 font-black tracking-[0.3em] uppercase text-xs mb-2">Algorithm Battle Game</p>
              <h2 className="text-2xl md:text-3xl font-black text-slate-700">ヒーローをつくろう！</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-12">
              <div className={`p-8 rounded-[3rem] border-4 transition-all transform hover:rotate-1 ${isP1Ready ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-100 shadow-inner'}`}>
                <div className="flex justify-between items-center mb-4">
                  <span className="bg-blue-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase">P1</span>
                  {!isP1Ready && <span className="text-[9px] font-bold text-rose-500 flex items-center gap-1 animate-bounce"><AlertCircle size={12}/> 画像が必要です</span>}
                </div>
                <input type="text" value={tempNames[1]} onChange={(e) => setTempNames({...tempNames, 1: e.target.value})} className="w-full px-5 py-4 rounded-2xl border-3 border-transparent bg-white shadow-sm font-black text-slate-600 outline-none focus:border-blue-400 mb-6 text-center" placeholder="なまえ" />
                <div className="flex flex-col items-center">
                  <CustomPawn size={90} customImage={customImages[1]} colorClass="text-blue-500" isMissing={!isP1Ready} />
                  <input type="file" ref={fileInputRef1} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 1)} />
                  <button onClick={() => fileInputRef1.current.click()} className={`mt-6 px-6 py-3 text-white rounded-2xl font-black text-sm transition-all shadow-lg active:scale-95 flex items-center gap-2 ${isP1Ready ? 'bg-blue-500' : 'bg-rose-500 animate-pulse'}`}>
                    {isP1Ready ? <Check size={18}/> : <Upload size={18}/>} 画像をアップ
                  </button>
                </div>
              </div>

              <div className={`p-8 rounded-[3rem] border-4 transition-all transform hover:-rotate-1 ${isP2Ready ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-100 shadow-inner'}`}>
                <div className="flex justify-between items-center mb-4">
                  <span className="bg-rose-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase">P2</span>
                </div>
                <input type="text" value={tempNames[2]} onChange={(e) => setTempNames({...tempNames, 2: e.target.value})} className="w-full px-5 py-4 rounded-2xl border-3 border-transparent bg-white shadow-sm font-black text-slate-600 outline-none focus:border-rose-400 mb-6 text-center" placeholder="なまえ" />
                <div className="flex flex-col items-center">
                  <CustomPawn size={90} customImage={customImages[2]} colorClass="text-red-500" isMissing={!isP2Ready} />
                  <input type="file" ref={fileInputRef2} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 2)} />
                  <button onClick={() => fileInputRef2.current.click()} className="mt-6 px-6 py-3 bg-slate-200 text-slate-400 rounded-2xl font-black text-sm hover:bg-slate-300 transition-all shadow-md active:scale-95 flex items-center gap-2">
                    <Upload size={18}/> 画像をアップ
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-6">
              <button disabled={!isP1Ready || !isP2Ready} onClick={startLocalGame} className="flex-1 p-8 bg-blue-500 text-white rounded-[2.5rem] font-black text-xl hover:bg-blue-600 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-4 transition-all shadow-xl shadow-blue-200 hover:-translate-y-1 active:translate-y-0">
                <Users size={32} /> ローカル対戦
              </button>
              <div className="flex-1 space-y-3">
                <div className="flex gap-2 h-full">
                  <input type="text" value={onlineTargetId} onChange={(e) => setOnlineTargetId(e.target.value)} placeholder="部屋ID" className="flex-1 px-6 rounded-[2.5rem] border-4 border-indigo-100 font-black text-slate-600 outline-none focus:border-indigo-400 text-center" />
                  <button disabled={!isP1Ready || isAuthLoading} onClick={startOnlineLobby} className="p-6 bg-indigo-500 text-white rounded-[2.5rem] font-black hover:bg-indigo-600 disabled:opacity-30 flex items-center justify-center gap-2 transition-all shadow-xl shadow-indigo-200 hover:-translate-y-1 active:translate-y-0">
                    {isAuthLoading ? <Loader2 className="animate-spin" /> : <Globe size={28} />} オンライン
                  </button>
                </div>
                {!isP1Ready && <p className="text-[10px] text-rose-500 font-black text-center uppercase tracking-widest animate-pulse">P1 Image Required for Online</p>}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (gameState === 'LOBBY') {
      const minutes = Math.floor(lobbyTimeLeft / 60);
      const seconds = lobbyTimeLeft % 60;
      return (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="bg-white p-16 rounded-[4rem] shadow-2xl text-center max-w-sm w-full border-b-[12px] border-indigo-100">
            <div className="relative w-32 h-32 mx-auto mb-10">
              <RefreshCw size={128} className="text-indigo-500 animate-spin opacity-10" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Timer size={48} className="text-indigo-500" />
              </div>
            </div>
            <h2 className="text-3xl font-black mb-3 text-indigo-600 tracking-tighter">探しています...</h2>
            <div className="bg-indigo-50 px-6 py-2 rounded-full inline-block font-mono text-xl font-bold text-indigo-500 mb-6 border-2 border-indigo-100">
              {minutes}:{seconds.toString().padStart(2, '0')}
            </div>
            <p className="text-slate-400 text-sm font-black mb-10 leading-relaxed">部屋ID: <span className="text-indigo-400">{onlineTargetId}</span><br/>対戦相手をまっています</p>
            <button onClick={initGame} className="px-8 py-3 rounded-2xl border-4 border-slate-100 text-slate-400 text-xs font-black hover:bg-slate-50 transition-all uppercase tracking-[0.2em]">Cancel</button>
          </div>
        </div>
      );
    }

    return (
      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pb-10">
        {/* 左側：プログラムスロット */}
        <div className="lg:col-span-3 space-y-6">
          <div className={`p-8 rounded-[3rem] border-4 shadow-xl bg-white transition-all ${turn === 1 ? 'border-blue-100 shadow-blue-50' : 'border-rose-100 shadow-rose-50'}`}>
            <h3 className="text-[10px] font-black mb-6 flex items-center gap-2 uppercase tracking-[0.2em] text-slate-400"><Play size={16} /> Program Slots</h3>
            <div className="space-y-3">
              {programs[turn]?.map((slot, i) => (
                <div key={i} onClick={() => removeFromProgram(i)} className={`h-16 rounded-2xl border-3 flex items-center px-5 cursor-pointer transition-all ${slot ? `${slot.color} border-transparent text-white shadow-md` : 'border-slate-100 bg-slate-50 text-slate-300'} ${executionStep === i ? 'ring-4 ring-yellow-300 scale-105 shadow-2xl z-20' : ''}`}>
                  <span className="w-8 font-mono text-sm font-black opacity-40">{i + 1}</span>
                  {slot ? <div className="flex items-center gap-3 font-black text-sm"><slot.icon size={22} /> {slot.label}</div> : <span className="text-[10px] font-bold uppercase tracking-widest opacity-40">Empty</span>}
                </div>
              ))}
            </div>
            <button onClick={submitProgram} disabled={gameState !== 'PLANNING' || (mode === 'ONLINE' && onlineRole !== (message?.includes("P1") ? 1 : 2)) || (programs[turn] && programs[turn].every(s => s === null))} className={`w-full mt-10 py-5 rounded-[2rem] font-black text-white text-lg shadow-xl transition-all ${turn === 1 ? 'bg-blue-500 shadow-blue-200 hover:bg-blue-600' : 'bg-rose-500 shadow-rose-200 hover:bg-rose-600'} disabled:bg-slate-100 disabled:text-slate-300 disabled:shadow-none active:scale-95`}>
              {turn === 1 && mode === 'LOCAL' ? '交代する' : 'GO !'}
            </button>
          </div>
          {/* 手札 */}
          <div className="p-8 rounded-[3rem] border-4 border-slate-100 bg-white shadow-xl">
            <h3 className="text-[10px] font-black mb-6 uppercase tracking-[0.2em] text-slate-400">Hand</h3>
            <div className="grid grid-cols-2 gap-3">
              {(hands[turn] || []).map((card, i) => (
                <button key={i} onClick={() => addToProgram(card, i)} className={`p-4 rounded-2xl text-left text-white ${card.color} hover:scale-105 active:scale-95 transition-all shadow-md group relative overflow-hidden`}>
                  <card.icon size={20} className="mb-2 relative z-10" />
                  <div className="text-[10px] font-black uppercase relative z-10">{card.label}</div>
                  <div className="absolute -right-2 -bottom-2 opacity-10 group-hover:scale-150 transition-all duration-500"><card.icon size={48}/></div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 中央：ボード */}
        <div className="lg:col-span-6 flex flex-col items-center">
          <div className="mb-8 bg-white px-10 py-4 rounded-[2rem] border-b-[6px] border-slate-200 font-black shadow-lg text-lg text-slate-700 animate-in fade-in zoom-in">
             {message}
          </div>
          <div className="bg-white p-4 rounded-[4rem] shadow-2xl border-b-[16px] border-slate-200">
            <div className="grid gap-2 bg-slate-50 p-2 rounded-[3.5rem]" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`, width: 'min(90vw, 550px)', height: 'min(90vw, 550px)' }}>
              {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => {
                const x = i % GRID_SIZE; const y = Math.floor(i / GRID_SIZE);
                const isCheckered = (x + y) % 2 === 0;
                return (
                  <div key={i} className={`relative rounded-2xl overflow-hidden flex items-center justify-center transition-all ${isCheckered ? 'bg-white' : 'bg-slate-100/50'}`}>
                    {visualEffect && visualEffect.type === 'laser' && ((visualEffect.dir === 'UP' && x === visualEffect.x && y < visualEffect.y) || (visualEffect.dir === 'DOWN' && x === visualEffect.x && y > visualEffect.y) || (visualEffect.dir === 'LEFT' && y === visualEffect.y && x < visualEffect.x) || (visualEffect.dir === 'RIGHT' && y === visualEffect.y && x > visualEffect.x)) && <div className={`absolute inset-0 ${visualEffect.color} opacity-60 animate-pulse shadow-[inset_0_0_20px_white]`}></div>}
                    {visualEffect && visualEffect.type === 'hack' && Math.abs(x - visualEffect.x) <= 1 && Math.abs(y - visualEffect.y) <= 1 && <div className={`absolute inset-0 ${visualEffect.color} opacity-40 animate-ping`}></div>}
                    {players.map(p => p.x === x && p.y === y && (
                      <div key={p.id} className={`transition-all duration-500 ${p.dir === 'UP' ? 'rotate-0' : p.dir === 'RIGHT' ? 'rotate-90' : p.dir === 'DOWN' ? 'rotate-180' : '-rotate-90'}`}>
                        <div className={`p-1.5 rounded-[1.2rem] ${p.bgColor} relative shadow-md`}>
                          {p.stun && <div className="absolute -top-2 -right-2 bg-yellow-400 rounded-full p-1.5 animate-bounce z-20 shadow-lg border-2 border-white"><Zap size={14} fill="currentColor" /></div>}
                          <CustomPawn size={50} customImage={p.customImage} colorClass={p.colorClass} />
                          <div className={`absolute -top-3 left-1/2 -translate-x-1/2 ${p.colorClass} drop-shadow-sm`}><ArrowUp size={20} strokeWidth={4} /></div>
                        </div>
                      </div>
                    ))}
                    {/* Goal markers */}
                    {x === 6 && y === 6 && <div className="absolute bottom-1 right-1 opacity-20"><Trophy size={16} className="text-blue-500" /></div>}
                    {x === 0 && y === 0 && <div className="absolute top-1 left-1 opacity-20"><Trophy size={16} className="text-rose-500" /></div>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 右側：情報 */}
        <div className="lg:col-span-3 space-y-6">
          <div className="p-8 rounded-[3rem] border-4 border-slate-100 bg-white shadow-xl">
            <h3 className="text-[10px] font-black mb-6 uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2"><Trophy size={16} /> Mission</h3>
            <div className="space-y-4">
              {players.map(p => (
                <div key={p?.id} className={`flex items-center gap-4 p-4 rounded-3xl border-3 ${p?.id === 1 ? 'border-blue-50 bg-blue-50/50' : 'border-rose-50 bg-rose-50/50'}`}>
                  <CustomPawn size={40} customImage={p?.customImage} colorClass={p?.colorClass} />
                  <div className="overflow-hidden">
                    <p className="text-sm font-black truncate text-slate-700">{p?.name || "???"}</p>
                    <p className="text-[10px] opacity-60 font-black uppercase tracking-tighter">Goal: {p?.id === 1 ? '6,6' : '0,0'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button onClick={() => confirm("終了しますか？") && initGame()} className="w-full py-5 bg-slate-50 text-slate-400 rounded-[2rem] text-[10px] font-black transition-all border-4 border-slate-100 uppercase tracking-[0.3em] hover:bg-white hover:text-slate-500">Exit Game</button>
        </div>
      </main>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 lg:p-10 font-sans select-none flex flex-col items-center">
      <header className="w-full max-w-6xl flex justify-between items-center mb-10 px-4">
        <div className="flex flex-col">
          <h1 className="text-4xl md:text-5xl font-black text-blue-500 tracking-tighter drop-shadow-sm transform -rotate-1">LOGIC DUEL</h1>
          {mode === 'ONLINE' && roomId && <div className="mt-2 inline-flex items-center gap-2 px-4 py-1 bg-indigo-500 text-white text-[10px] font-black rounded-full shadow-lg shadow-indigo-100">ROOM: {roomId} / P{onlineRole}</div>}
        </div>
        <div className="flex gap-4">
          <div className={`px-6 py-3 rounded-3xl border-4 transition-all transform ${turn === 1 ? 'border-blue-300 bg-white -rotate-2 scale-110 shadow-xl' : 'border-slate-100 bg-slate-50 opacity-40 shadow-inner'}`}>
            <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Player 1</p>
            <p className="font-black text-sm">{players[0]?.name || "P1"}</p>
          </div>
          <div className={`px-6 py-3 rounded-3xl border-4 transition-all transform ${turn === 2 ? 'border-rose-300 bg-white rotate-2 scale-110 shadow-xl' : 'border-slate-100 bg-slate-50 opacity-40 shadow-inner'}`}>
            <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Player 2</p>
            <p className="font-black text-sm">{players[1]?.name || "P2"}</p>
          </div>
        </div>
      </header>
      
      {renderMainUI()}

      {gameState === 'RESULT' && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl flex items-center justify-center z-50 p-6 animate-in fade-in duration-500">
          <div className="bg-white border-b-[16px] border-slate-200 p-12 md:p-16 rounded-[5rem] max-w-lg w-full text-center shadow-[0_0_100px_rgba(255,255,255,0.2)] relative overflow-hidden">
            <Trophy size={100} className="mx-auto text-yellow-400 mb-8 animate-bounce drop-shadow-xl" />
            <h2 className="text-4xl md:text-5xl font-black mb-4 leading-tight text-slate-800 tracking-tighter">
              {winner === 'DRAW' ? 'ひきわけ！' : `${players[winner-1]?.name || "???"} のしょうり！`}
            </h2>
            {winner !== 'DRAW' && winner && players[winner-1] && (
               <div className="flex justify-center my-10 transform scale-125">
                 <CustomPawn size={120} customImage={players[winner-1].customImage} colorClass={players[winner-1].colorClass} />
               </div>
            )}
            <button onClick={initGame} className="w-full py-6 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-[2.5rem] font-black text-2xl shadow-2xl shadow-blue-200 transform hover:scale-105 active:scale-95 transition-all">もういちど あそぶ</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;