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
  Palette,
  Upload,
  Image as ImageIcon
} from 'lucide-react';

// --- 定数・設定 ---
const GRID_SIZE = 7;
const INITIAL_HAND_SIZE = 6;

// --- クリエットくんのカスタム表示コンポーネント ---
const CreatteBot = ({ variant, colorClass, size = 48, customImage }) => {
  // カスタム画像がある場合は画像を表示
  if (customImage) {
    return (
      <div 
        style={{ 
          width: size, 
          height: size, 
          backgroundImage: `url(${customImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          borderRadius: variant === 'hero' ? '12px' : '50%',
          border: `3px solid ${colorClass.includes('text-blue') ? '#3b82f6' : colorClass.includes('text-red') ? '#ef4444' : '#10b981'}`
        }}
        className="shadow-sm"
      />
    );
  }

  // それ以外はSVGを表示
  const fill = colorClass.includes('text-blue') ? '#3b82f6' : 
               colorClass.includes('text-red') ? '#ef4444' : 
               colorClass.includes('text-green') ? '#10b981' : '#f59e0b';

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Body */}
      <rect x="20" y="30" width="60" height="50" rx="15" fill={fill} fillOpacity="0.2" stroke={fill} strokeWidth="4" />
      <circle cx="50" cy="30" r="15" fill={fill} fillOpacity="0.1" stroke={fill} strokeWidth="4" />
      
      {/* Eyes */}
      <circle cx="40" cy="30" r="3" fill={fill} />
      <circle cx="60" cy="30" r="3" fill={fill} />
      
      {/* Variant Decorations */}
      {variant === 'glasses' && (
        <g stroke={fill} strokeWidth="2">
          <circle cx="40" cy="30" r="6" />
          <circle cx="60" cy="30" r="6" />
          <line x1="46" y1="30" x2="54" y2="30" />
        </g>
      )}
      {variant === 'crown' && (
        <path d="M35 15L40 22L50 15L60 22L65 15V25H35V15Z" fill="#facc15" stroke="#ca8a04" strokeWidth="2" />
      )}
      {variant === 'hero' && (
        <path d="M20 40L10 60L20 55V40Z" fill="#ef4444" />
      )}
      
      {/* Antennas */}
      <line x1="50" y1="15" x2="50" y2="8" stroke={fill} strokeWidth="4" strokeLinecap="round" />
      <circle cx="50" cy="5" r="3" fill={fill} />
    </svg>
  );
};

// カードタイプ定義
const CARD_TYPES = {
  MOVE: { id: 'MOVE', label: 'すすむ', icon: ArrowUp, color: 'bg-blue-500 shadow-blue-500/30', description: '1歩進む' },
  TURN_L: { id: 'TURN_L', label: '左をむく', icon: RotateCw, color: 'bg-indigo-500 shadow-indigo-500/30', description: '左に90度向く', extraClass: '-scale-x-100' },
  TURN_R: { id: 'TURN_R', label: '右をむく', icon: RotateCw, color: 'bg-purple-500 shadow-purple-500/30', description: '右に90度向く' },
  LASER: { id: 'LASER', label: 'レーザー', icon: Zap, color: 'bg-red-500 shadow-red-500/30', description: '正面の相手を撃つ(1マス後退させる)' },
  HACK: { id: 'HACK', label: 'ハック', icon: Bomb, color: 'bg-orange-500 shadow-orange-500/30', description: '周囲1マスの相手を回転させる' },
  JUMP: { id: 'JUMP', label: 'ジャンプ', icon: Target, color: 'bg-teal-500 shadow-teal-500/30', description: '2歩進む' },
};

const DIRECTIONS = ['UP', 'RIGHT', 'DOWN', 'LEFT'];

const AVATARS = [
  { id: 'creatte_std', name: 'クリエット', variant: 'standard', color: 'text-blue-500', bgColor: 'bg-blue-50' },
  { id: 'creatte_smart', name: 'メガネ', variant: 'glasses', color: 'text-green-500', bgColor: 'bg-green-50' },
  { id: 'creatte_king', name: 'キング', variant: 'crown', color: 'text-yellow-500', bgColor: 'bg-yellow-50' },
  { id: 'creatte_hero', name: 'ヒーロー', variant: 'hero', color: 'text-red-500', bgColor: 'bg-red-50' },
];

const App = () => {
  const [gameState, setGameState] = useState('START');
  const [turn, setTurn] = useState(1);
  const [round, setRound] = useState(1);
  const [players, setPlayers] = useState([
    { id: 1, x: 0, y: 0, dir: 'RIGHT', stun: false, avatar: AVATARS[0], customImage: null },
    { id: 2, x: 6, y: 6, dir: 'LEFT', stun: false, avatar: AVATARS[1], customImage: null }
  ]);
  const [hands, setHands] = useState({ 1: [], 2: [] });
  const [programs, setPrograms] = useState({ 1: Array(5).fill(null), 2: Array(5).fill(null) });
  const [executionStep, setExecutionStep] = useState(-1);
  const [winner, setWinner] = useState(null);
  const [message, setMessage] = useState("");
  const [visualEffect, setVisualEffect] = useState(null);
  const [selectedAvatars, setSelectedAvatars] = useState({ 1: AVATARS[0], 2: AVATARS[1] });
  const [customImages, setCustomImages] = useState({ 1: null, 2: null });

  const fileInputRef1 = useRef(null);
  const fileInputRef2 = useRef(null);

  const initGame = () => {
    setGameState('START');
    setTurn(1);
    setRound(1);
    setWinner(null);
    setMessage("");
    setVisualEffect(null);
    setSelectedAvatars({ 1: AVATARS[0], 2: AVATARS[1] });
    setCustomImages({ 1: null, 2: null });
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

  const startGame = () => {
    setPlayers([
      { id: 1, x: 0, y: 0, dir: 'RIGHT', stun: false, avatar: selectedAvatars[1], customImage: customImages[1] },
      { id: 2, x: 6, y: 6, dir: 'LEFT', stun: false, avatar: selectedAvatars[2], customImage: customImages[2] }
    ]);
    resetHandsAndPrograms();
    setGameState('PLANNING');
    setTurn(1);
    setRound(1);
    setMessage("プレイヤー1のターン：プログラムを組もう！");
  };

  const resetHandsAndPrograms = () => {
    const generateHand = () => Array.from({ length: INITIAL_HAND_SIZE }, () => {
      const keys = Object.keys(CARD_TYPES);
      return CARD_TYPES[keys[Math.floor(Math.random() * keys.length)]];
    });
    setHands({ 1: generateHand(), 2: generateHand() });
    setPrograms({ 1: Array(5).fill(null), 2: Array(5).fill(null) });
  };

  const addToProgram = (card, index) => {
    if (gameState !== 'PLANNING') return;
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

  const submitProgram = () => {
    if (turn === 1) {
      setTurn(2);
      setMessage("プレイヤー2のターン：プログラムを組もう！");
    } else {
      setGameState('EXECUTION');
      runExecution();
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

  const runExecution = async () => {
    let currentPlayers = [...players];
    setMessage("プログラム じっこう中...");

    for (let i = 0; i < 5; i++) {
      setExecutionStep(i);
      await new Promise(r => setTimeout(r, 800));

      let nextStepPlayers = JSON.parse(JSON.stringify(currentPlayers));
      nextStepPlayers[0].avatar = currentPlayers[0].avatar;
      nextStepPlayers[1].avatar = currentPlayers[1].avatar;
      nextStepPlayers[0].customImage = currentPlayers[0].customImage;
      nextStepPlayers[1].customImage = currentPlayers[1].customImage;

      for (let pIdx = 0; pIdx < 2; pIdx++) {
        const pNum = pIdx + 1;
        const opponentIdx = pIdx === 0 ? 1 : 0;
        const card = programs[pNum][i];
        if (!card) continue;

        if (nextStepPlayers[pIdx].stun) {
          nextStepPlayers[pIdx].stun = false;
          continue;
        }

        const p = nextStepPlayers[pIdx];
        const opp = nextStepPlayers[opponentIdx];

        if (card.id === 'MOVE' || card.id === 'JUMP') {
          const steps = card.id === 'JUMP' ? 2 : 1;
          const { nx, ny } = getNextPos(p.x, p.y, p.dir, steps);
          p.x = nx; p.y = ny;
        } else if (card.id === 'TURN_L') {
          p.dir = DIRECTIONS[(DIRECTIONS.indexOf(p.dir) + 3) % 4];
        } else if (card.id === 'TURN_R') {
          p.dir = DIRECTIONS[(DIRECTIONS.indexOf(p.dir) + 1) % 4];
        } else if (card.id === 'LASER') {
          setVisualEffect({ type: 'laser', x: p.x, y: p.y, dir: p.dir, color: p.avatar.color.replace('text-', 'bg-') });
          setTimeout(() => setVisualEffect(null), 400);
          let hit = false;
          if (p.dir === 'UP' && opp.x === p.x && opp.y < p.y) hit = true;
          if (p.dir === 'DOWN' && opp.x === p.x && opp.y > p.y) hit = true;
          if (p.dir === 'LEFT' && opp.y === p.y && opp.x < p.x) hit = true;
          if (p.dir === 'RIGHT' && opp.y === p.y && opp.x > p.x) hit = true;
          if (hit) {
            const { nx, ny } = getNextPos(opp.x, opp.y, p.dir, 1);
            opp.x = nx; opp.y = ny; opp.stun = true;
          }
        } else if (card.id === 'HACK') {
          setVisualEffect({ type: 'hack', x: p.x, y: p.y, color: p.avatar.color.replace('text-', 'bg-') });
          setTimeout(() => setVisualEffect(null), 400);
          if (Math.abs(p.x - opp.x) + Math.abs(p.y - opp.y) <= 1) {
            opp.dir = DIRECTIONS[(DIRECTIONS.indexOf(opp.dir) + 2) % 4];
            opp.stun = true;
          }
        }
      }

      if (nextStepPlayers[0].x === nextStepPlayers[1].x && nextStepPlayers[0].y === nextStepPlayers[1].y) {
        const {nx, ny} = getNextPos(nextStepPlayers[1].x, nextStepPlayers[1].y, 'DOWN', 1);
        nextStepPlayers[1].x = nx; nextStepPlayers[1].y = ny;
      }

      currentPlayers = nextStepPlayers;
      setPlayers(currentPlayers);
      if ((currentPlayers[0].x === 6 && currentPlayers[0].y === 6) || (currentPlayers[1].x === 0 && currentPlayers[1].y === 0)) break;
    }

    setExecutionStep(-1);
    checkWinner(currentPlayers);
  };

  const checkWinner = (cp) => {
    const p1W = cp[0].x === 6 && cp[0].y === 6;
    const p2W = cp[1].x === 0 && cp[1].y === 0;
    if (p1W && p2W) setWinner('DRAW');
    else if (p1W) setWinner(1);
    else if (p2W) setWinner(2);

    if (p1W || p2W) setGameState('RESULT');
    else {
      setRound(r => r + 1); setTurn(1); setGameState('PLANNING');
      resetHandsAndPrograms();
      setMessage(`ラウンド ${round + 1}：プレイヤー1のターン`);
    }
  };

  // スタート画面
  if (gameState === 'START') {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4 font-sans text-slate-800">
        <div className="text-center mb-8">
          <h1 className="text-6xl font-black text-blue-600 tracking-tighter mb-2">LOGIC DUEL</h1>
          <p className="text-slate-500 font-bold uppercase tracking-widest">Creatte Edition</p>
        </div>
        <div className="bg-white p-8 rounded-[3rem] shadow-2xl border-4 border-blue-100 max-w-5xl w-full">
          <h2 className="text-2xl font-bold text-center mb-8 flex items-center justify-center gap-2">
            <Palette className="text-blue-500" /> クリエットくんを選んでね！
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
            {/* P1 Select */}
            <div className="bg-blue-50 p-6 rounded-3xl border-2 border-blue-200">
              <p className="text-blue-600 font-bold text-center mb-4">プレイヤー1</p>
              
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  {AVATARS.map(av => (
                    <button key={av.id} onClick={() => setSelectedAvatars(p => ({...p, 1: av}))} className={`p-4 rounded-2xl border-4 flex flex-col items-center transition-all bg-white ${selectedAvatars[1].id === av.id && !customImages[1] ? 'border-blue-500 scale-105 shadow-md' : 'border-transparent opacity-60'}`} disabled={selectedAvatars[2].id === av.id}>
                      <CreatteBot variant={av.variant} colorClass={av.color} size={48} />
                      <span className="text-[10px] font-bold mt-2 text-slate-600">{av.name}</span>
                    </button>
                  ))}
                </div>
                
                <div className="flex flex-col items-center p-3 bg-white/50 rounded-2xl border-2 border-dashed border-blue-200">
                  <p className="text-[10px] font-bold text-slate-400 mb-2 uppercase">Or Upload Image</p>
                  <input type="file" ref={fileInputRef1} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 1)} />
                  <button onClick={() => fileInputRef1.current.click()} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${customImages[1] ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>
                    {customImages[1] ? <Check size={14}/> : <Upload size={14}/>} {customImages[1] ? '変更する' : '画像をアップ'}
                  </button>
                  {customImages[1] && (
                    <div className="mt-2 flex items-center gap-2">
                      <CreatteBot colorClass="text-blue-500" size={32} customImage={customImages[1]} />
                      <span className="text-[10px] font-bold text-blue-600 italic">カスタム駒を使用中</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* P2 Select */}
            <div className="bg-red-50 p-6 rounded-3xl border-2 border-red-200">
              <p className="text-red-600 font-bold text-center mb-4">プレイヤー2</p>
              
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  {AVATARS.map(av => (
                    <button key={av.id} onClick={() => setSelectedAvatars(p => ({...p, 2: av}))} className={`p-4 rounded-2xl border-4 flex flex-col items-center transition-all bg-white ${selectedAvatars[2].id === av.id && !customImages[2] ? 'border-red-500 scale-105 shadow-md' : 'border-transparent opacity-60'}`} disabled={selectedAvatars[1].id === av.id}>
                      <CreatteBot variant={av.variant} colorClass={av.color} size={48} />
                      <span className="text-[10px] font-bold mt-2 text-slate-600">{av.name}</span>
                    </button>
                  ))}
                </div>

                <div className="flex flex-col items-center p-3 bg-white/50 rounded-2xl border-2 border-dashed border-red-200">
                  <p className="text-[10px] font-bold text-slate-400 mb-2 uppercase">Or Upload Image</p>
                  <input type="file" ref={fileInputRef2} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 2)} />
                  <button onClick={() => fileInputRef2.current.click()} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${customImages[2] ? 'bg-red-500 text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>
                    {customImages[2] ? <Check size={14}/> : <Upload size={14}/>} {customImages[2] ? '変更する' : '画像をアップ'}
                  </button>
                  {customImages[2] && (
                    <div className="mt-2 flex items-center gap-2">
                      <CreatteBot colorClass="text-red-500" size={32} customImage={customImages[2]} />
                      <span className="text-[10px] font-bold text-red-600 italic">カスタム駒を使用中</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <button onClick={startGame} className="w-full py-5 bg-blue-600 text-white font-black text-2xl rounded-full shadow-xl shadow-blue-500/30 hover:bg-blue-700 active:scale-95 transition-all">バトルスタート！</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 lg:p-8 font-sans select-none">
      <header className="max-w-7xl mx-auto flex justify-between items-center mb-8">
        <h1 className="text-3xl font-black text-blue-600 tracking-tighter">LOGIC DUEL</h1>
        <div className="flex gap-4">
          <div className={`px-4 py-2 rounded-2xl border-2 transition-all ${turn === 1 ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white'}`}>
            <p className="text-[10px] font-bold text-blue-500">PLAYER 1</p>
            <p className="font-bold text-sm">Goal: (6, 6)</p>
          </div>
          <div className={`px-4 py-2 rounded-2xl border-2 transition-all ${turn === 2 ? 'border-red-500 bg-red-50 shadow-sm' : 'border-slate-200 bg-white'}`}>
            <p className="text-[10px] font-bold text-red-500">PLAYER 2</p>
            <p className="font-bold text-sm">Goal: (0, 0)</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* プログラムスロット */}
        <div className="lg:col-span-3 space-y-4">
          <div className={`p-6 rounded-[2rem] border-4 shadow-lg bg-white ${turn === 1 ? 'border-blue-100' : 'border-red-100'}`}>
            <h3 className="text-sm font-black mb-4 flex items-center gap-2 uppercase text-slate-400">
              <Play size={16} /> Program Slots
            </h3>
            <div className="space-y-2">
              {programs[turn].map((slot, i) => (
                <div key={i} onClick={() => removeFromProgram(i)} className={`h-14 rounded-2xl border-2 flex items-center px-4 cursor-pointer transition-all ${slot ? `${slot.color} border-transparent text-white` : 'border-slate-100 bg-slate-50 text-slate-300'} ${executionStep === i ? 'ring-4 ring-yellow-400 scale-105' : ''}`}>
                  <span className="w-6 font-mono text-xs opacity-50">{i + 1}</span>
                  {slot ? <div className="flex items-center gap-2 font-bold text-sm"><slot.icon size={18} /> {slot.label}</div> : <span className="text-[10px] font-bold uppercase">Empty</span>}
                </div>
              ))}
            </div>
            <button onClick={submitProgram} disabled={programs[turn].every(s => s === null)} className={`w-full mt-6 py-4 rounded-2xl font-black text-white shadow-lg transition-all ${turn === 1 ? 'bg-blue-600' : 'bg-red-600'} disabled:bg-slate-200 disabled:shadow-none`}>
              {turn === 1 ? '次へ' : '実行！'}
            </button>
          </div>
          {/* 手札 */}
          <div className="p-6 rounded-[2rem] border-4 border-slate-100 bg-white shadow-md">
            <h3 className="text-sm font-black mb-4 uppercase text-slate-400">Hand</h3>
            <div className="grid grid-cols-2 gap-2">
              {hands[turn].map((card, i) => (
                <button key={i} onClick={() => addToProgram(card, i)} className={`p-2 rounded-xl text-left text-white ${card.color} hover:scale-105 active:scale-95 transition-transform shadow-sm`}>
                  <card.icon size={16} className="mb-1" />
                  <div className="text-[10px] font-bold uppercase">{card.label}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ボード */}
        <div className="lg:col-span-6 flex flex-col items-center">
          <div className="mb-6 bg-white px-6 py-2 rounded-full border-4 border-blue-100 font-bold shadow-sm">{message}</div>
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
                        <div className={`p-1 rounded-2xl ${p.avatar.bgColor} relative`}>
                          {p.stun && <div className="absolute -top-1 -right-1 bg-yellow-400 rounded-full p-0.5 animate-bounce z-20"><Zap size={10} /></div>}
                          <CreatteBot variant={p.avatar.variant} colorClass={p.avatar.color} size={40} customImage={p.customImage} />
                          <ArrowUp className={`absolute -top-1 left-1/2 -translate-x-1/2 text-[10px] ${p.avatar.color}`} size={12} strokeWidth={4} />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ルール・リセット */}
        <div className="lg:col-span-3 space-y-4">
          <div className="p-6 rounded-[2rem] border-4 border-slate-100 bg-white shadow-md">
            <h3 className="text-sm font-black mb-4 uppercase text-slate-400 flex items-center gap-2"><Trophy size={16} /> Goals</h3>
            <div className="space-y-3">
              {players.map(p => (
                <div key={p.id} className={`flex items-center gap-3 p-3 rounded-2xl border-2 ${p.id === 1 ? 'border-blue-50 bg-blue-50/50' : 'border-red-50 bg-red-50/50'}`}>
                  <CreatteBot variant={p.avatar.variant} colorClass={p.avatar.color} size={32} customImage={p.customImage} />
                  <div>
                    <p className="text-xs font-black">{p.avatar.name}</p>
                    <p className="text-[10px] opacity-60">Goal: {p.id === 1 ? '(6, 6)' : '(0, 0)'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button onClick={() => confirm("リセットしますか？") && initGame()} className="w-full py-4 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-2xl text-xs font-black transition-all border-2 border-slate-200 uppercase tracking-widest">Restart Game</button>
        </div>
      </main>

      {/* 結果画面 */}
      {gameState === 'RESULT' && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border-[12px] border-blue-100 p-12 rounded-[4rem] max-w-sm w-full text-center shadow-2xl">
            <Trophy size={80} className="mx-auto text-yellow-500 mb-6 animate-bounce" />
            <h2 className="text-4xl font-black mb-2">{winner === 'DRAW' ? 'ひきわけ！' : `PLAYER ${winner} WIN!`}</h2>
            <p className="text-slate-400 font-bold mb-8 italic">ナイス・ロジック！</p>
            <button onClick={initGame} className="w-full py-5 bg-blue-600 text-white rounded-full font-black text-xl shadow-xl shadow-blue-500/30 hover:bg-blue-700 transition-all">もういちど あそぶ</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;