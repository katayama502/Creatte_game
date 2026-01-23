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
  AlertCircle
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
  collection, 
  onSnapshot, 
  updateDoc,
  deleteDoc
} from 'firebase/firestore';

// --- Firebase Config & Globals ---
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

// --- 定数・設定 ---
const GRID_SIZE = 7;
const INITIAL_HAND_SIZE = 6;
const DIRECTIONS = ['UP', 'RIGHT', 'DOWN', 'LEFT'];

const CARD_TYPES = {
  MOVE: { id: 'MOVE', label: 'すすむ', icon: ArrowUp, color: 'bg-blue-500 shadow-blue-500/30', description: '1歩進む' },
  TURN_L: { id: 'TURN_L', label: '左をむく', icon: RotateCw, color: 'bg-indigo-500 shadow-indigo-500/30', description: '左に90度向く', extraClass: '-scale-x-100' },
  TURN_R: { id: 'TURN_R', label: '右をむく', icon: RotateCw, color: 'bg-purple-500 shadow-purple-500/30', description: '右に90度向く' },
  LASER: { id: 'LASER', label: 'レーザー', icon: Zap, color: 'bg-red-500 shadow-red-500/30', description: '正面の相手を撃つ(1マス後退させる)' },
  HACK: { id: 'HACK', label: 'ハック', icon: Bomb, color: 'bg-orange-500 shadow-orange-500/30', description: '周囲1マスの相手を回転させる' },
  JUMP: { id: 'JUMP', label: 'ジャンプ', icon: Target, color: 'bg-teal-500 shadow-teal-500/30', description: '2歩進む' },
};

// --- カスタム駒表示コンポーネント ---
const CustomPawn = ({ size = 48, customImage, colorClass, isMissing }) => {
  const borderColor = colorClass.includes('text-blue') ? '#3b82f6' : colorClass.includes('text-red') ? '#ef4444' : '#64748b';
  
  if (customImage) {
    return (
      <div 
        style={{ 
          width: size, 
          height: size, 
          backgroundImage: `url(${customImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          borderRadius: '12px',
          border: `3px solid ${borderColor}`
        }}
        className="shadow-md"
      />
    );
  }

  return (
    <div 
      style={{ 
        width: size, 
        height: size, 
        border: `3px dashed ${isMissing ? '#ef4444' : '#cbd5e1'}` 
      }}
      className={`rounded-xl flex items-center justify-center ${isMissing ? 'bg-red-50' : 'bg-slate-50'} transition-colors`}
    >
      <User size={size * 0.5} className={isMissing ? 'text-red-300' : 'text-slate-300'} />
    </div>
  );
};

const App = () => {
  // --- Game States ---
  const [mode, setMode] = useState(null); // 'LOCAL' or 'ONLINE'
  const [gameState, setGameState] = useState('START'); // START, LOBBY, PLANNING, EXECUTION, RESULT
  const [user, setUser] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [turn, setTurn] = useState(1); // Local turn: 1 or 2
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

  // Setup refs & temp states
  const [tempNames, setTempNames] = useState({ 1: "Player 1", 2: "Player 2" });
  const [customImages, setCustomImages] = useState({ 1: null, 2: null });
  const fileInputRef1 = useRef(null);
  const fileInputRef2 = useRef(null);

  // --- Auth Initialization ---
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // --- Online Sync Effect ---
  useEffect(() => {
    if (!user || mode !== 'ONLINE' || !roomId) return;

    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    const unsubscribe = onSnapshot(roomRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      
      setPlayers(data.players);
      setGameState(data.gameState);
      setRound(data.round);
      setWinner(data.winner);
      setHands(data.hands || { 1: [], 2: [] });
      setPrograms(data.programs || { 1: Array(5).fill(null), 2: Array(5).fill(null) });
      setMessage(data.message);

      if (data.gameState === 'EXECUTION' && executionStep === -1) {
        runExecutionLocal(data.players, data.programs);
      }
    }, (error) => console.error("Sync error:", error));

    return () => unsubscribe();
  }, [user, mode, roomId]);

  // --- Game Logic ---
  const initGame = () => {
    setGameState('START');
    setMode(null);
    setRoomId(null);
    setTurn(1);
    setRound(1);
    setWinner(null);
    setMessage("");
    setVisualEffect(null);
    setExecutionStep(-1);
    setPrograms({ 1: Array(5).fill(null), 2: Array(5).fill(null) });
  };

  const handleImageUpload = (e, playerNum) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCustomImages(prev => ({ ...prev, [playerNum]: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const startLocalGame = () => {
    if (!customImages[1] || !customImages[2]) return;
    const updatedPlayers = [
      { ...players[0], name: tempNames[1] || "Player 1", customImage: customImages[1] },
      { ...players[1], name: tempNames[2] || "Player 2", customImage: customImages[2] }
    ];
    setPlayers(updatedPlayers);
    const newHands = generateHands();
    setHands(newHands);
    setGameState('PLANNING');
    setTurn(1);
    setRound(1);
    setMessage(`${updatedPlayers[0].name}のターン！`);
  };

  const startOnlineLobby = async () => {
    if (!user || !customImages[1]) return;
    setGameState('LOBBY');
    setMessage("対戦相手を探しています...");

    const lobbyId = "main-lobby";
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', lobbyId);
    
    const snap = await getDoc(roomRef);
    if (!snap.exists() || snap.data().status === 'playing') {
      const initialData = {
        roomId: lobbyId,
        status: 'waiting',
        gameState: 'LOBBY',
        players: [
          { 
            id: 1, x: 0, y: 0, dir: 'RIGHT', stun: false, 
            name: tempNames[1], customImage: customImages[1], 
            uid: user.uid, colorClass: "text-blue-500", bgColor: "bg-blue-50" 
          }
        ],
        round: 1,
        winner: null,
        message: "対戦相手を待っています..."
      };
      await setDoc(roomRef, initialData);
      setRoomId(lobbyId);
      setTurn(1); 
    } else {
      const data = snap.data();
      const updatedPlayers = [
        ...data.players,
        { 
          id: 2, x: 6, y: 6, dir: 'LEFT', stun: false, 
          name: tempNames[1], customImage: customImages[1], 
          uid: user.uid, colorClass: "text-red-500", bgColor: "bg-red-50" 
        }
      ];
      const initialHands = generateHands();
      await updateDoc(roomRef, {
        players: updatedPlayers,
        status: 'playing',
        gameState: 'PLANNING',
        hands: initialHands,
        programs: { 1: Array(5).fill(null), 2: Array(5).fill(null) },
        message: "バトルスタート！P1のプログラムを待機中..."
      });
      setRoomId(lobbyId);
      setTurn(2); 
    }
  };

  const generateHands = () => {
    const pick = () => Array.from({ length: INITIAL_HAND_SIZE }, () => {
      const keys = Object.keys(CARD_TYPES);
      return CARD_TYPES[keys[Math.floor(Math.random() * keys.length)]];
    });
    return { 1: pick(), 2: pick() };
  };

  const addToProgram = (card, index) => {
    if (gameState !== 'PLANNING') return;
    if (mode === 'ONLINE') {
      const myPlayer = players.find(p => p.uid === user.uid);
      if (!myPlayer) return;
      const currentWaitingId = message.includes("P1") ? 1 : 2;
      if (myPlayer.id !== currentWaitingId) return;
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

  const submitProgram = async () => {
    if (mode === 'LOCAL') {
      if (turn === 1) {
        setTurn(2);
        setMessage(`${players[1].name}のターン！`);
      } else {
        setGameState('EXECUTION');
        runExecutionLocal(players, programs);
      }
    } else {
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
      if (turn === 1) {
        await updateDoc(roomRef, {
          programs: { ...programs, 1: programs[1] },
          message: "P2のプログラムを待機中..."
        });
      } else {
        await updateDoc(roomRef, {
          programs: { ...programs, 2: programs[2] },
          gameState: 'EXECUTION',
          message: "プログラム実行中..."
        });
      }
    }
  };

  const getNextPos = (x, y, dir, steps = 1) => {
    let nx = x, ny = y;
    if (dir === 'UP') ny -= steps;
    if (dir === 'DOWN') ny += steps;
    if (dir === 'LEFT') nx -= steps;
    if (dir === 'RIGHT') nx += steps;
    nx = Math.max(0, Math.min(GRID_SIZE - 1, nx));
    ny = Math.max(0, Math.min(GRID_SIZE - 1, ny));
    return { nx, ny };
  };

  const runExecutionLocal = async (currentPlayers, currentPrograms) => {
    let cp = JSON.parse(JSON.stringify(currentPlayers));
    
    for (let i = 0; i < 5; i++) {
      setExecutionStep(i);
      await new Promise(r => setTimeout(r, 800));

      let nextStep = JSON.parse(JSON.stringify(cp));
      
      for (let pIdx = 0; pIdx < 2; pIdx++) {
        const pNum = pIdx + 1;
        const opponentIdx = pIdx === 0 ? 1 : 0;
        const card = currentPrograms[pNum][i];
        if (!card) continue;
        if (nextStep[pIdx].stun) { nextStep[pIdx].stun = false; continue; }

        const p = nextStep[pIdx];
        const opp = nextStep[opponentIdx];

        if (card.id === 'MOVE' || card.id === 'JUMP') {
          const { nx, ny } = getNextPos(p.x, p.y, p.dir, card.id === 'JUMP' ? 2 : 1);
          p.x = nx; p.y = ny;
        } else if (card.id === 'TURN_L') {
          p.dir = DIRECTIONS[(DIRECTIONS.indexOf(p.dir) + 3) % 4];
        } else if (card.id === 'TURN_R') {
          p.dir = DIRECTIONS[(DIRECTIONS.indexOf(p.dir) + 1) % 4];
        } else if (card.id === 'LASER') {
          setVisualEffect({ type: 'laser', x: p.x, y: p.y, dir: p.dir, color: p.colorClass.replace('text-', 'bg-') });
          setTimeout(() => setVisualEffect(null), 400);
          let hit = (p.dir === 'UP' && opp.x === p.x && opp.y < p.y) || 
                    (p.dir === 'DOWN' && opp.x === p.x && opp.y > p.y) ||
                    (p.dir === 'LEFT' && opp.y === p.y && opp.x < p.x) ||
                    (p.dir === 'RIGHT' && opp.y === p.y && opp.x > p.x);
          if (hit) {
            const { nx, ny } = getNextPos(opp.x, opp.y, p.dir, 1);
            opp.x = nx; opp.y = ny; opp.stun = true;
          }
        } else if (card.id === 'HACK') {
          setVisualEffect({ type: 'hack', x: p.x, y: p.y, color: p.colorClass.replace('text-', 'bg-') });
          setTimeout(() => setVisualEffect(null), 400);
          if (Math.abs(p.x - opp.x) + Math.abs(p.y - opp.y) <= 1) {
            opp.dir = DIRECTIONS[(DIRECTIONS.indexOf(opp.dir) + 2) % 4];
            opp.stun = true;
          }
        }
      }

      if (nextStep[0].x === nextStep[1].x && nextStep[0].y === nextStep[1].y) {
        const {nx, ny} = getNextPos(nextStep[1].x, nextStep[1].y, 'DOWN', 1);
        nextStep[1].x = nx; nextStep[1].y = ny;
      }

      cp = nextStep;
      setPlayers(cp);
      if ((cp[0].x === 6 && cp[0].y === 6) || (cp[1].x === 0 && cp[1].y === 0)) break;
    }

    setExecutionStep(-1);
    handleRoundEnd(cp);
  };

  const handleRoundEnd = async (finalPlayers) => {
    const p1W = finalPlayers[0].x === 6 && finalPlayers[0].y === 6;
    const p2W = finalPlayers[1].x === 0 && finalPlayers[1].y === 0;
    let localWinner = null;
    if (p1W && p2W) localWinner = 'DRAW';
    else if (p1W) localWinner = 1;
    else if (p2W) localWinner = 2;

    if (mode === 'LOCAL') {
      if (localWinner) {
        setWinner(localWinner);
        setGameState('RESULT');
      } else {
        setRound(r => r + 1);
        setTurn(1);
        setGameState('PLANNING');
        setHands(generateHands());
        setPrograms({ 1: Array(5).fill(null), 2: Array(5).fill(null) });
        setMessage(`${players[0].name}のターン！`);
      }
    } else {
      if (turn === 1) {
        const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
        if (localWinner) {
          await updateDoc(roomRef, {
            players: finalPlayers,
            winner: localWinner,
            gameState: 'RESULT',
            message: "試合終了！"
          });
        } else {
          await updateDoc(roomRef, {
            players: finalPlayers,
            round: round + 1,
            gameState: 'PLANNING',
            hands: generateHands(),
            programs: { 1: Array(5).fill(null), 2: Array(5).fill(null) },
            message: "次のラウンド！P1のターンを待っています..."
          });
        }
      }
    }
  };

  // --- UI Components ---
  if (gameState === 'START') {
    const isP1Ready = !!customImages[1];
    const isP2Ready = !!customImages[2];
    const isLocalMatchReady = isP1Ready && isP2Ready;
    const isOnlineMatchReady = isP1Ready;

    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4 font-sans text-slate-800">
        <div className="text-center mb-8">
          <h1 className="text-6xl font-black text-blue-600 tracking-tighter mb-2">LOGIC DUEL</h1>
          <p className="text-slate-500 font-bold uppercase tracking-widest italic">Creatte Edition</p>
        </div>
        <div className="bg-white p-10 rounded-[3rem] shadow-2xl border-4 border-blue-100 max-w-5xl w-full">
          <h2 className="text-2xl font-bold text-center mb-10">自分だけのヒーローで戦おう！</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            {/* Player 1 Setup */}
            <div className={`p-6 rounded-[2rem] border-2 transition-all ${isP1Ready ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-red-100'}`}>
              <div className="flex justify-between items-center mb-2">
                <label className="text-[10px] font-black text-blue-400 uppercase">Player 1 Name</label>
                {!isP1Ready && <span className="text-[9px] font-bold text-red-500 flex items-center gap-1"><AlertCircle size={10}/> 画像必須</span>}
              </div>
              <input 
                type="text" 
                value={tempNames[1]} 
                onChange={(e) => setTempNames({...tempNames, 1: e.target.value})}
                className="w-full px-4 py-3 rounded-xl border-2 border-white focus:border-blue-400 outline-none font-bold mb-4"
              />
              <div className="flex flex-col items-center p-4 bg-white rounded-2xl border-2 border-dashed border-blue-200">
                <CustomPawn size={60} customImage={customImages[1]} colorClass="text-blue-500" isMissing={!isP1Ready} />
                <input type="file" ref={fileInputRef1} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 1)} />
                <button onClick={() => fileInputRef1.current.click()} className={`mt-3 px-4 py-2 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 ${isP1Ready ? 'bg-blue-500 hover:bg-blue-600' : 'bg-red-500 hover:bg-red-600 animate-pulse'}`}>
                  {isP1Ready ? <Check size={14}/> : <Upload size={14}/>} 画像を選択
                </button>
              </div>
            </div>

            {/* Player 2 Setup (For Local) */}
            <div className={`p-6 rounded-[2rem] border-2 transition-all ${isP2Ready ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-red-100'}`}>
              <div className="flex justify-between items-center mb-2">
                <label className="text-[10px] font-black text-red-400 uppercase">Player 2 Name (Local)</label>
                {!isP2Ready && <span className="text-[9px] font-bold text-red-500 flex items-center gap-1"><AlertCircle size={10}/> 画像必須</span>}
              </div>
              <input 
                type="text" 
                value={tempNames[2]} 
                onChange={(e) => setTempNames({...tempNames, 2: e.target.value})}
                className="w-full px-4 py-3 rounded-xl border-2 border-white focus:border-red-400 outline-none font-bold mb-4"
              />
              <div className="flex flex-col items-center p-4 bg-white rounded-2xl border-2 border-dashed border-red-200">
                <CustomPawn size={60} customImage={customImages[2]} colorClass="text-red-500" isMissing={!isP2Ready} />
                <input type="file" ref={fileInputRef2} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 2)} />
                <button onClick={() => fileInputRef2.current.click()} className={`mt-3 px-4 py-2 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 ${isP2Ready ? 'bg-red-500 hover:bg-red-600' : 'bg-red-400 hover:bg-red-500 animate-pulse'}`}>
                  {isP2Ready ? <Check size={14}/> : <Upload size={14}/>} 画像を選択
                </button>
              </div>
            </div>
          </div>

          {/* Mode Selection Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button 
              disabled={!isLocalMatchReady}
              onClick={() => { setMode('LOCAL'); startLocalGame(); }}
              className={`p-6 rounded-[2rem] transition-all flex items-center justify-center gap-4 group shadow-lg ${isLocalMatchReady ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
            >
              <Users size={28} />
              <div className="text-left">
                <div className="font-black text-xl">ローカル対戦</div>
                <div className="text-[10px] opacity-80 uppercase font-bold tracking-widest">{isLocalMatchReady ? 'Two players, one screen' : '画像が足りません'}</div>
              </div>
            </button>

            <button 
              disabled={!isOnlineMatchReady}
              onClick={() => { setMode('ONLINE'); startOnlineLobby(); }}
              className={`p-6 rounded-[2rem] transition-all flex items-center justify-center gap-4 group shadow-lg ${isOnlineMatchReady ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
            >
              <Globe size={28} />
              <div className="text-left">
                <div className="font-black text-xl">オンライン対戦</div>
                <div className="text-[10px] opacity-80 uppercase font-bold tracking-widest">{isOnlineMatchReady ? 'Join global lobby' : 'P1の画像が必須です'}</div>
              </div>
            </button>
          </div>
          <p className="mt-6 text-center text-slate-400 text-[10px] font-bold uppercase tracking-widest">
            *オンライン時は「Player 1」の設定があなたの情報として使われます
          </p>
        </div>
      </div>
    );
  }

  if (gameState === 'LOBBY') {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white p-12 rounded-[3rem] shadow-2xl text-center max-w-sm w-full border-4 border-indigo-100">
           <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <RefreshCw size={40} className="text-indigo-500 animate-spin" />
           </div>
           <h2 className="text-2xl font-black mb-2 uppercase tracking-tighter text-indigo-600">Matching...</h2>
           <p className="text-slate-400 text-sm font-bold mb-8 leading-relaxed">{message}</p>
           <button onClick={initGame} className="px-6 py-2 rounded-full border-2 border-slate-200 text-slate-400 text-xs font-bold hover:bg-slate-50 transition-all">キャンセル</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 lg:p-8 font-sans select-none">
      <header className="max-w-7xl mx-auto flex justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-black text-blue-600 tracking-tighter">LOGIC DUEL</h1>
          <span className="px-3 py-1 bg-slate-200 text-[10px] font-black rounded-full uppercase tracking-widest">{mode} MODE</span>
        </div>
        <div className="flex gap-4">
          <div className={`px-4 py-2 rounded-2xl border-2 transition-all ${turn === 1 ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white'}`}>
            <p className="text-[10px] font-bold text-blue-500 uppercase">Player 1</p>
            <p className="font-black text-sm">{players[0].name}</p>
          </div>
          <div className={`px-4 py-2 rounded-2xl border-2 transition-all ${turn === 2 ? 'border-red-500 bg-red-50 shadow-sm' : 'border-slate-200 bg-white'}`}>
            <p className="text-[10px] font-bold text-red-500 uppercase">Player 2</p>
            <p className="font-black text-sm">{players[1].name}</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-3 space-y-4">
          <div className={`p-6 rounded-[2rem] border-4 shadow-lg bg-white ${turn === 1 ? 'border-blue-100' : 'border-red-100'}`}>
            <h3 className="text-sm font-black mb-4 flex items-center gap-2 uppercase text-slate-400">
              <Play size={16} /> Program Slots
            </h3>
            <div className="space-y-2">
              {programs[turn].map((slot, i) => (
                <div key={i} onClick={() => removeFromProgram(i)} className={`h-14 rounded-2xl border-2 flex items-center px-4 cursor-pointer transition-all ${slot ? `${slot.color} border-transparent text-white` : 'border-slate-100 bg-slate-50 text-slate-300'} ${executionStep === i ? 'ring-4 ring-yellow-400 scale-105 shadow-lg' : ''}`}>
                  <span className="w-6 font-mono text-xs opacity-50">{i + 1}</span>
                  {slot ? <div className="flex items-center gap-2 font-bold text-sm"><slot.icon size={18} /> {slot.label}</div> : <span className="text-[10px] font-bold uppercase">Empty</span>}
                </div>
              ))}
            </div>
            <button 
              onClick={submitProgram} 
              disabled={gameState !== 'PLANNING' || programs[turn].every(s => s === null)} 
              className={`w-full mt-6 py-4 rounded-2xl font-black text-white shadow-lg transition-all ${turn === 1 ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'} disabled:bg-slate-200 disabled:shadow-none`}
            >
              {turn === 1 && mode === 'LOCAL' ? '次のプレイヤーへ' : 'じっこう！'}
            </button>
          </div>
          <div className="p-6 rounded-[2rem] border-4 border-slate-100 bg-white shadow-md">
            <h3 className="text-sm font-black mb-4 uppercase text-slate-400">Hand</h3>
            <div className="grid grid-cols-2 gap-2">
              {(hands[turn] || []).map((card, i) => (
                <button key={i} onClick={() => addToProgram(card, i)} className={`p-2 rounded-xl text-left text-white ${card.color} hover:scale-105 active:scale-95 transition-transform shadow-sm`}>
                  <card.icon size={16} className="mb-1" />
                  <div className="text-[10px] font-bold uppercase">{card.label}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-6 flex flex-col items-center">
          <div className="mb-6 bg-white px-8 py-3 rounded-full border-4 border-slate-100 font-black shadow-sm text-lg text-slate-700">
             {message}
          </div>
          <div className="bg-white p-3 rounded-[3rem] shadow-2xl border-[6px] border-slate-100">
            <div className="grid gap-1.5 bg-slate-100 p-1.5 rounded-[2.5rem]" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`, width: 'min(90vw, 500px)', height: 'min(90vw, 500px)' }}>
              {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => {
                const x = i % GRID_SIZE; const y = Math.floor(i / GRID_SIZE);
                return (
                  <div key={i} className={`relative rounded-2xl bg-white border-2 border-slate-200 overflow-hidden flex items-center justify-center`}>
                    {visualEffect && visualEffect.type === 'laser' && (
                      (visualEffect.dir === 'UP' && x === visualEffect.x && y < visualEffect.y) || (visualEffect.dir === 'DOWN' && x === visualEffect.x && y > visualEffect.y) || (visualEffect.dir === 'LEFT' && y === visualEffect.y && x < visualEffect.x) || (visualEffect.dir === 'RIGHT' && y === visualEffect.y && x > visualEffect.x)
                    ) && <div className={`absolute inset-0 ${visualEffect.color} opacity-60 animate-pulse`}></div>}
                    {visualEffect && visualEffect.type === 'hack' && Math.abs(x - visualEffect.x) <= 1 && Math.abs(y - visualEffect.y) <= 1 && <div className={`absolute inset-0 ${visualEffect.color} opacity-40 animate-ping`}></div>}
                    
                    {players.map(p => p.x === x && p.y === y && (
                      <div key={p.id} className={`transition-all duration-500 ${p.dir === 'UP' ? 'rotate-0' : p.dir === 'RIGHT' ? 'rotate-90' : p.dir === 'DOWN' ? 'rotate-180' : '-rotate-90'}`}>
                        <div className={`p-1 rounded-2xl ${p.bgColor} relative`}>
                          {p.stun && <div className="absolute -top-1 -right-1 bg-yellow-400 rounded-full p-1 animate-bounce z-20 shadow-sm"><Zap size={12} fill="currentColor" /></div>}
                          <CustomPawn size={40} customImage={p.customImage} colorClass={p.colorClass} />
                          <div className={`absolute -top-2 left-1/2 -translate-x-1/2 ${p.colorClass}`}>
                            <ArrowUp size={14} strokeWidth={4} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="lg:col-span-3 space-y-4">
          <div className="p-6 rounded-[2rem] border-4 border-slate-100 bg-white shadow-md">
            <h3 className="text-sm font-black mb-4 uppercase text-slate-400 flex items-center gap-2"><Trophy size={16} /> Mission</h3>
            <div className="space-y-4">
              {players.map(p => (
                <div key={p.id} className={`flex items-center gap-3 p-3 rounded-2xl border-2 ${p.id === 1 ? 'border-blue-50 bg-blue-50/50' : 'border-red-50 bg-red-50/50'}`}>
                  <CustomPawn size={36} customImage={p.customImage} colorClass={p.colorClass} />
                  <div className="overflow-hidden">
                    <p className="text-xs font-black truncate">{p.name}</p>
                    <p className="text-[10px] opacity-60 font-bold uppercase">Target: {p.id === 1 ? '(6, 6)' : '(0, 0)'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button onClick={() => confirm("ゲームを終了して最初に戻りますか？") && initGame()} className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-2xl text-[10px] font-black transition-all border-2 border-slate-200 uppercase tracking-[0.2em]">Exit Game</button>
        </div>
      </main>

      {gameState === 'RESULT' && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border-[12px] border-blue-100 p-12 rounded-[4rem] max-w-sm w-full text-center shadow-2xl relative overflow-hidden">
            <Trophy size={80} className="mx-auto text-yellow-500 mb-6 animate-bounce" />
            <h2 className="text-4xl font-black mb-2 leading-tight">
              {winner === 'DRAW' ? 'ひきわけ！' : `${players[winner-1].name} のしょうり！`}
            </h2>
            <p className="text-slate-400 font-bold mb-8 italic text-lg uppercase tracking-widest">Victory!</p>
            
            {winner !== 'DRAW' && (
              <div className="flex justify-center mb-8">
                <CustomPawn size={100} customImage={players[winner-1].customImage} colorClass={players[winner-1].colorClass} />
              </div>
            )}

            <button onClick={initGame} className="w-full py-5 bg-blue-600 text-white rounded-full font-black text-xl shadow-xl shadow-blue-500/30 hover:bg-blue-700 transition-all">もういちど あそぶ</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;