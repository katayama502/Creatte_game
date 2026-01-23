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
  Loader2
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
  MOVE: { id: 'MOVE', label: 'すすむ', icon: ArrowUp, color: 'bg-blue-500 shadow-blue-500/30', description: '1歩進む' },
  TURN_L: { id: 'TURN_L', label: '左をむく', icon: RotateCw, color: 'bg-indigo-500 shadow-indigo-500/30', description: '左に90度向く', extraClass: '-scale-x-100' },
  TURN_R: { id: 'TURN_R', label: '右をむく', icon: RotateCw, color: 'bg-purple-500 shadow-purple-500/30', description: '右に90度向く' },
  LASER: { id: 'LASER', label: 'レーザー', icon: Zap, color: 'bg-red-500 shadow-red-500/30', description: '正面の相手を撃つ(1マス後退させる)' },
  HACK: { id: 'HACK', label: 'ハック', icon: Bomb, color: 'bg-orange-500 shadow-orange-500/30', description: '周囲1マスの相手を回転させる' },
  JUMP: { id: 'JUMP', label: 'ジャンプ', icon: Target, color: 'bg-teal-500 shadow-teal-500/30', description: '2歩進む' },
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
  const borderColor = colorClass?.includes('text-blue') ? '#3b82f6' : colorClass?.includes('text-red') ? '#ef4444' : '#64748b';
  if (customImage) {
    return (
      <div 
        style={{ width: size, height: size, backgroundImage: `url(${customImage})`, backgroundSize: 'cover', backgroundPosition: 'center', borderRadius: '12px', border: `3px solid ${borderColor}` }}
        className="shadow-md transition-all duration-500"
      />
    );
  }
  return (
    <div style={{ width: size, height: size, border: `3px dashed ${isMissing ? '#ef4444' : '#cbd5e1'}` }} className={`rounded-xl flex items-center justify-center ${isMissing ? 'bg-red-50' : 'bg-slate-50'} transition-colors`}>
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

  const [tempNames, setTempNames] = useState({ 1: "Player 1", 2: "Player 2" });
  const [customImages, setCustomImages] = useState({ 1: null, 2: null });
  const fileInputRef1 = useRef(null);
  const fileInputRef2 = useRef(null);

  // --- Auth Initialize Effect ---
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

  // --- Online Sync Effect ---
  useEffect(() => {
    if (!user || mode !== 'ONLINE' || !roomId) return;
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
    const unsubscribe = onSnapshot(roomRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      
      // データ更新を一度に行う
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
      setMessage("通信エラーが発生しました。設定を確認してください。");
      console.error("Firestore sync error:", err);
    });
    return () => unsubscribe();
  }, [user, mode, roomId, executionStep]);

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
    setPrograms({ 1: Array(5).fill(null), 2: Array(5).fill(null) });
  }

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
    if (!user || !customImages[1]) return;
    setGameState('LOBBY');
    setMessage("通信を準備中...");
    setMode('ONLINE');
    
    const rid = onlineTargetId || "room-1";
    const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', rid);
    
    try {
      const snap = await getDoc(roomRef);
      // 修正ポイント: ホスト(P1)になる条件をより厳密に
      const data = snap.exists() ? snap.data() : null;
      
      if (!data || data.status === 'playing' || data.gameState === 'RESULT') {
        // P1として部屋を作成またはリセット
        const initialData = {
          roomId: rid, 
          status: 'waiting', 
          gameState: 'LOBBY', 
          round: 1, 
          winner: null,
          players: [{ 
            id: 1, x: 0, y: 0, dir: 'RIGHT', stun: false, 
            name: tempNames[1], customImage: customImages[1], 
            uid: user.uid, colorClass: "text-blue-500", bgColor: "bg-blue-50" 
          }],
          programs: { 1: Array(5).fill(null), 2: Array(5).fill(null) },
          message: "対戦相手を待っています..."
        };
        await setDoc(roomRef, initialData);
        setOnlineRole(1); setTurn(1);
      } else if (data.status === 'waiting') {
        // 修正ポイント: 自分がすでにP1なら参加処理をスキップ
        if (data.players?.[0]?.uid === user.uid) { 
          setOnlineRole(1); setTurn(1); setRoomId(rid); setGameState('LOBBY');
          return; 
        }
        
        // P2として参加
        const updatedPlayers = [
          data.players[0], 
          { 
            id: 2, x: 6, y: 6, dir: 'LEFT', stun: false, 
            name: tempNames[1], customImage: customImages[1], 
            uid: user.uid, colorClass: "text-red-500", bgColor: "bg-red-50" 
          }
        ];
        
        // 参加と同時に PLANNING へ移行
        await updateDoc(roomRef, {
          players: updatedPlayers, 
          status: 'playing', 
          gameState: 'PLANNING', 
          hands: generateHands(),
          message: "バトルスタート！P1の入力を待っています"
        });
        setOnlineRole(2); setTurn(2);
      }
      setRoomId(rid);
    } catch (err) {
      setMessage("エラー: Firebaseの匿名認証またはルールを確認してください");
      console.error("Firestore join error:", err);
      setGameState('START');
    }
  }

  function addToProgram(card, index) {
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
  }

  function removeFromProgram(slotIndex) {
    if (gameState !== 'PLANNING') return;
    const card = programs[turn][slotIndex];
    if (!card) return;
    const newPrograms = { ...programs };
    newPrograms[turn][slotIndex] = null;
    setPrograms(newPrograms);
    const newHands = { ...hands };
    newHands[turn].push(card);
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
      const roomRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', roomId);
      try {
        if (localWinner) { await updateDoc(roomRef, { players: finalPlayers, winner: localWinner, gameState: 'RESULT', message: "試合終了！" }); }
        else { await updateDoc(roomRef, { players: finalPlayers, round: round + 1, gameState: 'PLANNING', hands: generateHands(), "programs.1": Array(5).fill(null), "programs.2": Array(5).fill(null), message: "次のラウンド開始！P1のターン" }); }
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
          setVisualEffect({ type: 'laser', x: p.x, y: p.y, dir: p.dir, color: p.colorClass?.replace('text-', 'bg-') || 'bg-red-500' });
          setTimeout(() => setVisualEffect(null), 400);
          let hit = (p.dir === 'UP' && opp.x === p.x && opp.y < p.y) || (p.dir === 'DOWN' && opp.x === p.x && opp.y > p.y) || (p.dir === 'LEFT' && opp.y === p.y && opp.x < p.x) || (p.dir === 'RIGHT' && opp.y === p.y && opp.x > p.x);
          if (hit) { const { nx, ny } = getNextPos(opp.x, opp.y, p.dir, 1); opp.x = nx; opp.y = ny; opp.stun = true; }
        } else if (card.id === 'HACK') {
          setVisualEffect({ type: 'hack', x: p.x, y: p.y, color: p.colorClass?.replace('text-', 'bg-') || 'bg-orange-500' });
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
          await updateDoc(roomRef, { "programs.2": programs[2], gameState: 'EXECUTION', message: "プログラム実行中..." });
        }
      } catch (err) { 
        console.error("Online submit error:", err); 
        setMessage("データの送信に失敗しました。画像が大きすぎる可能性があります。"); 
      }
    }
  }

  // --- Rendering Helper ---
  const renderMainUI = () => {
    if (gameState === 'START') {
      const isP1Ready = !!customImages[1]; const isP2Ready = !!customImages[2];
      return (
        <div className="bg-white p-10 rounded-[3rem] shadow-2xl border-4 border-blue-100 max-w-5xl w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div className={`p-6 rounded-[2rem] border-2 transition-all ${isP1Ready ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-red-100'}`}>
              <label className="text-[10px] font-black text-blue-400 uppercase">Player 1 (You)</label>
              <input type="text" value={tempNames[1]} onChange={(e) => setTempNames({...tempNames, 1: e.target.value})} className="w-full px-4 py-3 rounded-xl border-2 mb-4 font-bold outline-none focus:border-blue-400" />
              <div className="flex flex-col items-center p-4 bg-white rounded-2xl border-2 border-dashed border-blue-200">
                <CustomPawn size={60} customImage={customImages[1]} colorClass="text-blue-500" isMissing={!isP1Ready} />
                <input type="file" ref={fileInputRef1} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 1)} />
                <button onClick={() => fileInputRef1.current.click()} className={`mt-3 px-4 py-2 text-white rounded-xl text-xs font-bold transition-all shadow-md ${isP1Ready ? 'bg-blue-500' : 'bg-red-500 animate-pulse'}`}>
                  画像を選択 (必須)
                </button>
              </div>
            </div>
            <div className={`p-6 rounded-[2rem] border-2 transition-all ${isP2Ready ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
              <label className="text-[10px] font-black text-red-400 uppercase">Player 2 (Local Only)</label>
              <input type="text" value={tempNames[2]} onChange={(e) => setTempNames({...tempNames, 2: e.target.value})} className="w-full px-4 py-3 rounded-xl border-2 mb-4 font-bold outline-none focus:border-red-400" />
              <div className="flex flex-col items-center p-4 bg-white rounded-2xl border-2 border-dashed border-slate-200">
                <CustomPawn size={60} customImage={customImages[2]} colorClass="text-red-500" isMissing={!isP2Ready} />
                <input type="file" ref={fileInputRef2} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 2)} />
                <button onClick={() => fileInputRef2.current.click()} className="mt-3 px-4 py-2 bg-slate-400 text-white rounded-xl text-xs font-bold">画像を選択</button>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <button disabled={!isP1Ready || !isP2Ready} onClick={startLocalGame} className="flex-1 p-6 bg-blue-600 text-white rounded-[2rem] font-black text-xl hover:bg-blue-700 disabled:bg-slate-200 flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95">
                <Users /> ローカル対戦
              </button>
              <div className="flex-1 flex flex-col gap-2">
                <div className="flex gap-2">
                  <input type="text" value={onlineTargetId} onChange={(e) => setOnlineTargetId(e.target.value)} placeholder="部屋ID" className="flex-1 px-4 py-2 rounded-xl border-2 text-sm font-bold outline-none focus:border-indigo-400" />
                  <button disabled={!isP1Ready || isAuthLoading} onClick={startOnlineLobby} className="p-4 bg-indigo-600 text-white rounded-xl font-black hover:bg-indigo-700 disabled:bg-slate-200 flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95">
                    {isAuthLoading ? <Loader2 className="animate-spin" /> : <Globe />} オンライン
                  </button>
                </div>
                {!isP1Ready && <p className="text-[10px] text-red-500 font-bold text-center">オンラインにはP1の画像が必要です</p>}
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (gameState === 'LOBBY') {
      return (
        <div className="bg-white p-12 rounded-[3rem] shadow-2xl text-center max-w-sm w-full border-4 border-indigo-100">
          <RefreshCw size={40} className="text-indigo-500 animate-spin mx-auto mb-6" />
          <h2 className="text-2xl font-black mb-2 uppercase text-indigo-600 tracking-tighter">Matching...</h2>
          <p className="text-slate-400 text-sm font-bold mb-8">{message}</p>
          <button onClick={initGame} className="px-6 py-2 rounded-full border-2 border-slate-200 text-slate-400 text-xs font-bold hover:bg-slate-50 transition-all">キャンセル</button>
        </div>
      );
    }

    return (
      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-3 space-y-4">
          <div className={`p-6 rounded-[2rem] border-4 shadow-lg bg-white ${turn === 1 ? 'border-blue-100' : 'border-red-100'}`}>
            <h3 className="text-sm font-black mb-4 flex items-center gap-2 uppercase text-slate-400"><Play size={16} /> Program Slots</h3>
            <div className="space-y-2">
              {programs[turn]?.map((slot, i) => (
                <div key={i} onClick={() => removeFromProgram(i)} className={`h-14 rounded-2xl border-2 flex items-center px-4 cursor-pointer transition-all ${slot ? `${slot.color} border-transparent text-white` : 'border-slate-100 bg-slate-50 text-slate-300'} ${executionStep === i ? 'ring-4 ring-yellow-400 scale-105 shadow-lg' : ''}`}>
                  <span className="w-6 font-mono text-xs opacity-50">{i + 1}</span>
                  {slot ? <div className="flex items-center gap-2 font-bold text-sm"><slot.icon size={18} /> {slot.label}</div> : <span className="text-[10px] font-bold uppercase">Empty</span>}
                </div>
              ))}
            </div>
            <button onClick={submitProgram} disabled={gameState !== 'PLANNING' || (mode === 'ONLINE' && onlineRole !== (message?.includes("P1") ? 1 : 2)) || (programs[turn] && programs[turn].every(s => s === null))} className={`w-full mt-6 py-4 rounded-2xl font-black text-white shadow-lg transition-all ${turn === 1 ? 'bg-blue-600' : 'bg-red-600'} disabled:bg-slate-200 active:scale-95`}>
              {turn === 1 && mode === 'LOCAL' ? '交代する' : 'じっこう！'}
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
          <div className="mb-6 bg-white px-8 py-3 rounded-full border-4 border-slate-100 font-black shadow-sm text-lg text-slate-700">{message}</div>
          <div className="bg-white p-3 rounded-[3rem] shadow-2xl border-[6px] border-slate-100">
            <div className="grid gap-1.5 bg-slate-100 p-1.5 rounded-[2.5rem]" style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))`, width: 'min(90vw, 500px)', height: 'min(90vw, 500px)' }}>
              {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => {
                const x = i % GRID_SIZE; const y = Math.floor(i / GRID_SIZE);
                return (
                  <div key={i} className="relative rounded-2xl bg-white border-2 border-slate-200 overflow-hidden flex items-center justify-center">
                    {visualEffect && visualEffect.type === 'laser' && ((visualEffect.dir === 'UP' && x === visualEffect.x && y < visualEffect.y) || (visualEffect.dir === 'DOWN' && x === visualEffect.x && y > visualEffect.y) || (visualEffect.dir === 'LEFT' && y === visualEffect.y && x < visualEffect.x) || (visualEffect.dir === 'RIGHT' && y === visualEffect.y && x > visualEffect.x)) && <div className={`absolute inset-0 ${visualEffect.color} opacity-60 animate-pulse`}></div>}
                    {visualEffect && visualEffect.type === 'hack' && Math.abs(x - visualEffect.x) <= 1 && Math.abs(y - visualEffect.y) <= 1 && <div className={`absolute inset-0 ${visualEffect.color} opacity-40 animate-ping`}></div>}
                    {players.map(p => p.x === x && p.y === y && (
                      <div key={p.id} className={`transition-all duration-500 ${p.dir === 'UP' ? 'rotate-0' : p.dir === 'RIGHT' ? 'rotate-90' : p.dir === 'DOWN' ? 'rotate-180' : '-rotate-90'}`}>
                        <div className={`p-1 rounded-2xl ${p.bgColor} relative`}>
                          {p.stun && <div className="absolute -top-1 -right-1 bg-yellow-400 rounded-full p-1 animate-bounce z-20 shadow-sm"><Zap size={12} fill="currentColor" /></div>}
                          <CustomPawn size={40} customImage={p.customImage} colorClass={p.colorClass} />
                          <div className={`absolute -top-2 left-1/2 -translate-x-1/2 ${p.colorClass}`}><ArrowUp size={14} strokeWidth={4} /></div>
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
            <div className="space-y-4">{players.map(p => (<div key={p?.id} className={`flex items-center gap-3 p-3 rounded-2xl border-2 ${p?.id === 1 ? 'border-blue-50 bg-blue-50/50' : 'border-red-50 bg-red-50/50'}`}><CustomPawn size={36} customImage={p?.customImage} colorClass={p?.colorClass} /><div className="overflow-hidden"><p className="text-xs font-black truncate">{p?.name || "???"}</p><p className="text-[10px] opacity-60 font-bold uppercase">Target: {p?.id === 1 ? '(6, 6)' : '(0, 0)'}</p></div></div>))}</div>
          </div>
          <button onClick={() => confirm("終了しますか？") && initGame()} className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-2xl text-[10px] font-black transition-all border-2 border-slate-200 uppercase tracking-widest">Exit Game</button>
        </div>
      </main>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 lg:p-8 font-sans select-none">
      <header className="max-w-7xl mx-auto flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-black text-blue-600 tracking-tighter">LOGIC DUEL</h1>
          {mode === 'ONLINE' && roomId && <span className="bg-indigo-100 text-indigo-600 text-[10px] font-black px-3 py-1 rounded-full uppercase">Room: {roomId} / P{onlineRole}</span>}
        </div>
        <div className="flex gap-4">
          <div className={`px-4 py-2 rounded-2xl border-2 transition-all ${turn === 1 ? 'border-blue-50 shadow-sm' : 'border-slate-200 bg-white'}`}>
            <p className="text-[10px] font-bold text-blue-500 uppercase">Player 1</p>
            <p className="font-black text-sm">{players[0]?.name || "Player 1"}</p>
          </div>
          <div className={`px-4 py-2 rounded-2xl border-2 transition-all ${turn === 2 ? 'border-red-500 bg-red-50 shadow-sm' : 'border-slate-200 bg-white'}`}>
            <p className="text-[10px] font-bold text-red-500 uppercase">Player 2</p>
            <p className="font-black text-sm">{players[1]?.name || "Player 2"}</p>
          </div>
        </div>
      </header>
      
      {renderMainUI()}

      {gameState === 'RESULT' && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border-[12px] border-blue-100 p-12 rounded-[4rem] max-w-sm w-full text-center shadow-2xl relative overflow-hidden">
            <Trophy size={80} className="mx-auto text-yellow-500 mb-6 animate-bounce" />
            <h2 className="text-4xl font-black mb-2 leading-tight">{winner === 'DRAW' ? 'ひきわけ！' : `${players[winner-1]?.name || "???"} のしょうり！`}</h2>
            {winner !== 'DRAW' && winner && players[winner-1] && <div className="flex justify-center mb-8"><CustomPawn size={100} customImage={players[winner-1].customImage} colorClass={players[winner-1].colorClass} /></div>}
            <button onClick={initGame} className="w-full py-5 bg-blue-600 text-white rounded-full font-black text-xl shadow-xl shadow-blue-500/30 active:scale-95 transition-all">もういちど</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;