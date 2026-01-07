
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { LevelData, ObjectType, GameObject, UserSettings } from '../types';
import { BLOCK_SIZE, GAME_WIDTH, GAME_HEIGHT } from '../constants';
import GameCanvas from './GameCanvas';
import { generateLevelIdea } from '../services/gemini';

interface AIHistoryItem {
  id: string;
  name: string;
  prompt: string;
  objects: GameObject[];
  timestamp: number;
}

interface EditorProps {
  onSave: (level: LevelData) => void;
  onExit: () => void;
  settings: UserSettings;
  initialLevel?: LevelData;
}

type Tool = ObjectType | 'ERASER' | 'SELECT';

const SESSION_STORAGE_DRAFT_KEY = 'usual_puppet_editor_session_draft';
const CHUNK_SIZE = 400;

const getPortalHue = (type: ObjectType): number => {
  if (type === ObjectType.PORTAL_SHIP) return 0;
  if (type === ObjectType.PORTAL_BALL) return 30;
  if (type === ObjectType.PORTAL_UFO) return 120;
  if (type === ObjectType.PORTAL_WAVE) return 190;
  if (type === ObjectType.PORTAL_ROBOT) return 60;
  if (type === ObjectType.PORTAL_SPIDER) return 330;
  if (type === ObjectType.PORTAL_SWING) return 240;
  if (type === ObjectType.PORTAL_JETPACK) return 270;
  return 300;
};

// --- Scramble Text Component ---
const ScrambleText: React.FC<{ text: string, className?: string, trigger?: any }> = ({ text, className, trigger }) => {
  const [display, setDisplay] = useState(text);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#@&%[]";
  
  useEffect(() => {
    let iter = 0;
    const interval = setInterval(() => {
      setDisplay(text.split("").map((letter, index) => {
        if (index < iter) return text[index];
        return chars[Math.floor(Math.random() * chars.length)];
      }).join(""));
      
      if (iter >= text.length) clearInterval(interval);
      iter += 1/2; 
    }, 30);
    return () => clearInterval(interval);
  }, [text, trigger]);

  return <span className={className}>{display}</span>;
}

// --- AI Visualization Components ---

const NeuralNode: React.FC<{ x: number, y: number, delay: number, color: string }> = ({ x, y, delay, color }) => (
    <circle cx={x} cy={y} r="2" fill={color} className="animate-pulse">
        <animate attributeName="opacity" values="0;1;0" dur="2s" begin={`${delay}s`} repeatCount="indefinite" />
        <animate attributeName="r" values="2;4;2" dur="2s" begin={`${delay}s`} repeatCount="indefinite" />
    </circle>
);

const ConnectionLine: React.FC<{ x1: number, y1: number, x2: number, y2: number, delay: number, color: string }> = ({ x1, y1, x2, y2, delay, color }) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="0.5" strokeOpacity="0.4">
        <animate attributeName="stroke-dasharray" values="0,100;100,0" dur="1.5s" begin={`${delay}s`} repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;0.5;0" dur="1.5s" begin={`${delay}s`} repeatCount="indefinite" />
    </line>
);

const AIProcessingHub: React.FC<{ phase: string, progress: number, color: string }> = ({ phase, progress, color }) => {
    // Generate static nodes for the visualization
    const nodes = useMemo(() => {
        return Array.from({ length: 12 }).map((_, i) => ({
            x: 50 + Math.cos(i * (Math.PI / 6)) * 40,
            y: 50 + Math.sin(i * (Math.PI / 6)) * 40,
            delay: Math.random() * 2
        }));
    }, []);

    return (
        <div className="flex flex-col items-center justify-center w-full h-full">
            <div className="relative w-64 h-64 mb-8">
                <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                    <defs>
                        <linearGradient id="scanGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor={color} stopOpacity="0" />
                            <stop offset="50%" stopColor={color} stopOpacity="0.5" />
                            <stop offset="100%" stopColor={color} stopOpacity="0" />
                        </linearGradient>
                    </defs>

                    {/* Rotating Rings */}
                    <g className="animate-rotate-slow origin-center">
                        <circle cx="50" cy="50" r="48" fill="none" stroke={color} strokeWidth="0.2" strokeOpacity="0.3" strokeDasharray="4 4" />
                        <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="0.5" strokeOpacity="0.5" strokeDasharray="10 10" />
                    </g>
                    <g className="animate-rotate-fast origin-center" style={{ animationDirection: 'reverse' }}>
                         <circle cx="50" cy="50" r="30" fill="none" stroke={color} strokeWidth="0.3" strokeOpacity="0.6" strokeDasharray="2 8" />
                    </g>

                    {/* Neural Network Visualization */}
                    {nodes.map((n, i) => (
                        <NeuralNode key={i} x={n.x} y={n.y} delay={n.delay} color="#fff" />
                    ))}
                    {nodes.map((n, i) => (
                        <ConnectionLine 
                            key={`l-${i}`} 
                            x1={n.x} y1={n.y} 
                            x2={nodes[(i + 5) % nodes.length].x} 
                            y2={nodes[(i + 5) % nodes.length].y} 
                            delay={n.delay} 
                            color={color} 
                        />
                    ))}

                    {/* Central Core */}
                    <circle cx="50" cy="50" r="10" fill={color} fillOpacity="0.2" className="animate-pulse" />
                    <circle cx="50" cy="50" r="5" fill="#fff" className="animate-ping" />
                    
                    {/* Scanning Line */}
                    <rect x="0" y="0" width="100" height="100" fill="url(#scanGrad)" opacity="0.3">
                         <animate attributeName="y" values="-100;100" dur="2s" repeatCount="indefinite" />
                    </rect>
                </svg>
                
                {/* Progress Ring Overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                     <span className="text-3xl font-black font-mono text-white mix-blend-overlay">{Math.round(progress)}%</span>
                </div>
            </div>

            <div className="w-full max-w-sm text-center">
                <ScrambleText text={phase} trigger={phase} className="text-2xl font-orbitron font-black text-white mb-2 uppercase tracking-widest block h-8" />
                <div className="w-full h-1 bg-white/10 rounded-full mt-4 overflow-hidden relative">
                     <div 
                        className="h-full bg-white shadow-[0_0_10px_white] transition-all duration-300 ease-out relative" 
                        style={{ width: `${progress}%` }} 
                     >
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full shadow-[0_0_10px_#fff] animate-ping" />
                     </div>
                </div>
                <div className="flex justify-between mt-2 text-[9px] font-mono text-white/30 uppercase tracking-widest">
                    <span>Initiated</span>
                    <span>Processing</span>
                    <span>Completing</span>
                </div>
            </div>
        </div>
    );
};

// --- Editor Component ---

const Editor: React.FC<EditorProps> = ({ onSave, onExit, settings, initialLevel }) => {
  const [level, setLevel] = useState<LevelData>(() => {
    const saved = sessionStorage.getItem(SESSION_STORAGE_DRAFT_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (initialLevel) {
          if (parsed.level && parsed.level.id === initialLevel.id) return parsed.level;
        } else if (parsed.level && parsed.level.id.toString().startsWith('custom')) {
          return parsed.level;
        }
      } catch (e) { console.error(e); }
    }
    return initialLevel || {
      id: `custom-${Date.now()}`,
      name: 'New Puppet Level',
      difficulty: 'Easy',
      objects: []
    };
  });

  const [activeTool, setActiveTool] = useState<Tool>(ObjectType.BLOCK);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scrollX, setScrollX] = useState<number>(0);
  const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
  const [confirmingAction, setConfirmingAction] = useState<'SAVE' | 'EXIT' | 'CLEAR' | 'ARCHIVE' | 'SYNTHESIZE' | null>(null);
  const [viewingHistory, setViewingHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<AIHistoryItem[]>([]);
  
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);
  const [aiPhase, setAiPhase] = useState('Initializing');

  const [undoStack, setUndoStack] = useState<GameObject[][]>([]);
  const [redoStack, setRedoStack] = useState<GameObject[][]>([]);
  
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewSessionId, setPreviewSessionId] = useState(0);
  const [previewStatus, setPreviewStatus] = useState<'PLAYING' | 'GAMEOVER' | 'WIN'>('PLAYING');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spriteCacheRef = useRef<Map<ObjectType, HTMLCanvasElement>>(new Map());
  const gridCacheRef = useRef<HTMLCanvasElement | null>(null);
  
  const renderBufferRef = useRef<GameObject[]>([]);
  const processedSetRef = useRef<Set<string>>(new Set());

  const spatialIndex = useMemo(() => {
    const index = new Map<number, GameObject[]>();
    const sortedObjects = [...level.objects].sort((a, b) => (a.z || 0) - (b.z || 0));
    
    sortedObjects.forEach(obj => {
      const chunkX = Math.floor(obj.x / CHUNK_SIZE);
      const chunkXEnd = Math.floor((obj.x + BLOCK_SIZE) / CHUNK_SIZE);
      for (let i = chunkX; i <= chunkXEnd; i++) {
        if (!index.has(i)) index.set(i, []);
        index.get(i)!.push(obj);
      }
    });
    return index;
  }, [level.objects]);

  useEffect(() => {
    if (viewingHistory) {
      try {
        const raw = localStorage.getItem('puppet_dash_ai_history');
        if (raw) setHistoryItems(JSON.parse(raw));
      } catch (e) { console.error(e); }
    }
  }, [viewingHistory]);

  useEffect(() => {
    spriteCacheRef.current.clear();
    Object.values(ObjectType).forEach(type => {
      const offscreen = document.createElement('canvas');
      offscreen.width = BLOCK_SIZE;
      offscreen.height = BLOCK_SIZE;
      if (type.startsWith('PORTAL_')) offscreen.height = 80;
      const ctx = offscreen.getContext('2d');
      if (!ctx) return;

      if (type === ObjectType.BLOCK) {
        ctx.fillStyle = settings.primaryColor;
        ctx.fillRect(0, 0, BLOCK_SIZE, BLOCK_SIZE);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.strokeRect(2, 2, BLOCK_SIZE - 4, BLOCK_SIZE - 4);
      } else if (type === ObjectType.SPIKE) {
        ctx.fillStyle = '#ff3333';
        ctx.beginPath();
        ctx.moveTo(4, BLOCK_SIZE);
        ctx.lineTo(BLOCK_SIZE / 2, 4);
        ctx.lineTo(BLOCK_SIZE - 4, BLOCK_SIZE);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.stroke();
      } else if (type.startsWith('PORTAL_')) {
        const hue = getPortalHue(type);
        ctx.strokeStyle = `hsl(${hue}, 100%, 50%)`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(BLOCK_SIZE/2, 40, 12, 35, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = `hsla(${hue}, 100%, 50%, 0.1)`; ctx.fill();
      }
      spriteCacheRef.current.set(type, offscreen);
    });
  }, [settings.primaryColor]);

  useEffect(() => {
    const offscreen = document.createElement('canvas');
    offscreen.width = CHUNK_SIZE;
    offscreen.height = GAME_HEIGHT;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = snapToGrid ? '#222' : '#141414';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= CHUNK_SIZE; x += BLOCK_SIZE) { ctx.moveTo(x, 0); ctx.lineTo(x, GAME_HEIGHT); }
    for (let y = 0; y < GAME_HEIGHT; y += BLOCK_SIZE) { ctx.moveTo(0, y); ctx.lineTo(CHUNK_SIZE, y); }
    ctx.stroke();
    gridCacheRef.current = offscreen;
  }, [snapToGrid]);

  const pushUndo = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-49), [...level.objects]]);
    setRedoStack([]);
  }, [level.objects]);

  const handleAiSynthesis = async () => {
    if (!aiPrompt || isAiGenerating) return;
    setIsAiGenerating(true);
    setAiProgress(0);
    
    const phases = [
      { p: 5, t: 'ESTABLISHING LINK' },
      { p: 20, t: 'PARSING VECTORS' },
      { p: 40, t: 'MAPPING GEOMETRY' },
      { p: 60, t: 'OPTIMIZING FLOW' },
      { p: 80, t: 'FINALIZING ENTITIES' },
      { p: 95, t: 'SYNCING CORE...' }
    ];

    let phaseIdx = 0;
    const interval = setInterval(() => {
      if (phaseIdx < phases.length) {
        setAiProgress(phases[phaseIdx].p);
        setAiPhase(phases[phaseIdx].t);
        phaseIdx++;
      }
    }, 800);

    try {
      const result = await generateLevelIdea(aiPrompt);
      const historyJson = localStorage.getItem('puppet_dash_ai_history');
      let history: AIHistoryItem[] = historyJson ? JSON.parse(historyJson) : [];
      history.unshift({
        id: `ai-${Date.now()}`,
        name: result.name || `Neural-${Date.now().toString().slice(-4)}`,
        prompt: aiPrompt,
        objects: result.objects,
        timestamp: Date.now()
      });
      localStorage.setItem('puppet_dash_ai_history', JSON.stringify(history.slice(0, 20)));

      pushUndo();
      setLevel(prev => ({ ...prev, objects: result.objects }));
      setAiProgress(100);
      setAiPhase('COMPLETE');
      setTimeout(() => {
        setConfirmingAction(null);
        setIsAiGenerating(false);
        setAiPrompt('');
      }, 1000);
    } catch (err) {
      console.error(err);
      setAiPhase('CONNECTION FAILURE');
      setTimeout(() => setIsAiGenerating(false), 2000);
    } finally {
      clearInterval(interval);
    }
  };

  const loadFromHistory = (item: AIHistoryItem) => {
    pushUndo();
    setLevel(prev => ({ ...prev, objects: item.objects }));
    setViewingHistory(false);
  };

  const startPreview = () => {
    setPreviewSessionId(Date.now());
    setPreviewStatus('PLAYING');
    setIsPreviewing(true);
  };

  const moveLayer = useCallback((direction: 'front' | 'back' | 'up' | 'down') => {
    if (!selectedId) return;
    setLevel(prevLevel => {
      const updated = [...prevLevel.objects];
      const idx = updated.findIndex(o => o.id === selectedId);
      if (idx === -1) return prevLevel;
      const currentZ = updated[idx].z || 0;
      const allZs = updated.map(o => o.z || 0);
      const minZ = Math.min(...allZs);
      const maxZ = Math.max(...allZs);
      if (direction === 'front') updated[idx].z = maxZ + 1;
      else if (direction === 'back') updated[idx].z = minZ - 1;
      else if (direction === 'up') updated[idx].z = currentZ + 1;
      else if (direction === 'down') updated[idx].z = currentZ - 1;
      return { ...prevLevel, objects: updated };
    });
  }, [selectedId]);

  const autoRoof = () => {
    pushUndo();
    const maxX = level.objects.reduce((max, obj) => Math.max(max, obj.x), 0) + 1000;
    const newObjects = [...level.objects];
    for (let x = 0; x <= maxX; x += BLOCK_SIZE) {
        // Prevent duplicates at y=0
        if (!newObjects.some(o => o.x === x && o.y === 0 && o.type === ObjectType.BLOCK)) {
            newObjects.push({
                id: `roof-${Date.now()}-${x}`,
                type: ObjectType.BLOCK,
                x: x,
                y: 0,
                z: 0
            });
        }
    }
    setLevel(prev => ({ ...prev, objects: newObjects }));
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'INPUT') return;
        if (selectedId) {
             if (e.key === '[') { e.shiftKey ? moveLayer('back') : moveLayer('down'); } 
             else if (e.key === ']') { e.shiftKey ? moveLayer('front') : moveLayer('up'); }
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, moveLayer]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (confirmingAction || isPreviewing || viewingHistory) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const worldX = (e.clientX - rect.left) * scaleX + scrollX;
    const worldY = (e.clientY - rect.top) * scaleY;

    let x: number, y: number;
    if (snapToGrid) {
      x = Math.floor(worldX / BLOCK_SIZE) * BLOCK_SIZE;
      y = Math.floor(worldY / BLOCK_SIZE) * BLOCK_SIZE;
    } else {
      x = worldX - (BLOCK_SIZE / 2);
      y = worldY - (BLOCK_SIZE / 2);
    }
    
    const candidates = level.objects.filter(o => 
      worldX >= o.x && worldX <= o.x + BLOCK_SIZE && worldY >= o.y && worldY <= o.y + BLOCK_SIZE
    ).sort((a, b) => (b.z || 0) - (a.z || 0));

    const clickedObj = candidates[0];

    if (activeTool === 'SELECT') {
      setSelectedId(clickedObj?.id || null);
      return;
    }

    pushUndo();

    if (activeTool === 'ERASER') {
      if (clickedObj) {
        setLevel({ ...level, objects: level.objects.filter(o => o.id !== clickedObj.id) });
        if (selectedId === clickedObj.id) setSelectedId(null);
      }
    } else {
      const newObj: GameObject = { id: `obj-${Date.now()}`, type: activeTool as ObjectType, x, y, z: 0 };
      if (clickedObj) {
        const newObjects = [...level.objects];
        const idx = newObjects.findIndex(o => o.id === clickedObj.id);
        newObjects[idx] = { ...newObj, z: clickedObj.z };
        setLevel({ ...level, objects: newObjects });
      } else {
        setLevel({ ...level, objects: [...level.objects, newObj] });
      }
    }
  };

  useEffect(() => {
    if (isPreviewing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      
      if (gridCacheRef.current) {
        const xOffset = -scrollX % CHUNK_SIZE;
        for (let x = xOffset - CHUNK_SIZE; x < GAME_WIDTH + CHUNK_SIZE; x += CHUNK_SIZE) {
          ctx.drawImage(gridCacheRef.current, x, 0);
        }
      }

      ctx.strokeStyle = settings.primaryColor;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 400); ctx.lineTo(GAME_WIDTH, 400); ctx.stroke();
      
      // Draw visible ceiling line guide
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.moveTo(0, 40); ctx.lineTo(GAME_WIDTH, 40); ctx.stroke();
      ctx.setLineDash([]);

      ctx.save();
      ctx.translate(-scrollX, 0);
      
      const startChunk = Math.floor(scrollX / CHUNK_SIZE);
      const endChunk = Math.floor((scrollX + GAME_WIDTH) / CHUNK_SIZE);
      
      const visibleObjects = renderBufferRef.current;
      visibleObjects.length = 0;
      const processedIds = processedSetRef.current;
      processedIds.clear();

      const viewLeft = scrollX;
      const viewRight = scrollX + GAME_WIDTH;

      for (let i = startChunk; i <= endChunk; i++) {
        const chunkObjects = spatialIndex.get(i);
        if (chunkObjects) {
          for (let j = 0; j < chunkObjects.length; j++) {
             const obj = chunkObjects[j];
             if (!processedIds.has(obj.id)) {
                 if (obj.x + BLOCK_SIZE >= viewLeft && obj.x <= viewRight) {
                     visibleObjects.push(obj);
                     processedIds.add(obj.id);
                 }
             }
          }
        }
      }

      visibleObjects.sort((a, b) => (a.z || 0) - (b.z || 0));

      for (let i = 0; i < visibleObjects.length; i++) {
        const obj = visibleObjects[i];
        const sprite = spriteCacheRef.current.get(obj.type);
        if (sprite) {
          const drawY = obj.type.startsWith('PORTAL_') ? obj.y + (BLOCK_SIZE / 2) - 40 : obj.y;
          ctx.drawImage(sprite, obj.x, drawY);
          
          if (obj.id === selectedId) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.strokeRect(obj.x - 2, drawY - 2, BLOCK_SIZE + 4, (obj.type.startsWith('PORTAL_') ? 80 : BLOCK_SIZE) + 4);
          }
        }
      }
      ctx.restore();
    };
    const id = requestAnimationFrame(render);
    return () => cancelAnimationFrame(id);
  }, [level, scrollX, settings.primaryColor, snapToGrid, spatialIndex, isPreviewing, selectedId]);

  if (isPreviewing) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center relative">
        <GameCanvas 
          key={previewSessionId}
          level={level}
          settings={settings}
          onGameOver={() => setPreviewStatus('GAMEOVER')}
          onWin={() => setPreviewStatus('WIN')}
          onQuit={() => setIsPreviewing(false)}
          onRestart={() => { setPreviewSessionId(Date.now()); setPreviewStatus('PLAYING'); }}
          isPausedExternal={previewStatus !== 'PLAYING'}
        />
        {previewStatus !== 'PLAYING' && (
          <div className="absolute inset-0 z-[200] bg-black/80 backdrop-blur-xl flex flex-col items-center justify-center">
             <div className="text-center p-12 glass rounded-[64px] max-w-sm w-full">
                <h3 className={`text-5xl font-orbitron font-black mb-8 ${previewStatus === 'WIN' ? 'text-emerald-400' : 'text-red-500'}`}>
                  {previewStatus === 'WIN' ? 'OPTIMIZED' : 'SEVERED'}
                </h3>
                <div className="flex flex-col gap-4">
                   <button onClick={() => { setPreviewSessionId(Date.now()); setPreviewStatus('PLAYING'); }} className="py-5 bg-white text-black font-black text-xl rounded-full">REBOOT</button>
                   <button onClick={() => setIsPreviewing(false)} className="py-4 glass text-white/50 font-bold text-sm rounded-full">BACK TO WORKSHOP</button>
                </div>
             </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-neutral-900 text-white p-6 font-inter overflow-hidden relative">
      <div className="w-80 flex flex-col gap-4 bg-neutral-800 p-4 rounded-xl z-10 shadow-2xl overflow-y-auto">
        <h1 className="text-xl font-orbitron mb-4 text-center tracking-widest text-white/90">EDITOR</h1>
        
        <button onClick={startPreview} className="w-full py-5 bg-white text-black font-black text-xs rounded-xl flex items-center justify-center gap-3">
          <span>▶</span> NEURAL PLAYTEST
        </button>

        <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setConfirmingAction('SYNTHESIZE')} className="py-4 bg-cyan-600/20 text-cyan-400 font-black text-[10px] rounded-xl flex flex-col items-center justify-center gap-1 border border-cyan-500/20 hover:bg-cyan-500/30 transition-all uppercase tracking-widest">
              <span className="text-lg">✨</span> SYNTHESIS
            </button>
            <button onClick={() => setViewingHistory(true)} className="py-4 bg-purple-600/20 text-purple-400 font-black text-[10px] rounded-xl flex flex-col items-center justify-center gap-1 border border-purple-500/20 hover:bg-purple-500/30 transition-all uppercase tracking-widest">
              <span className="text-lg">📜</span> HISTORY
            </button>
        </div>

        <div className="space-y-4">
          <label className="text-[10px] uppercase font-black text-zinc-500 tracking-widest block">Tools</label>
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={() => setActiveTool('SELECT')} 
              className={`p-3 text-[10px] uppercase font-bold rounded border transition ${activeTool === 'SELECT' ? 'bg-indigo-600 border-indigo-400' : 'bg-neutral-700 border-transparent text-zinc-400'}`}
            >
              SELECT
            </button>
            <button 
              onClick={() => { setActiveTool('ERASER'); setSelectedId(null); }} 
              className={`p-3 text-[10px] uppercase font-bold rounded border transition ${activeTool === 'ERASER' ? 'bg-red-600 border-red-400' : 'bg-neutral-700 border-transparent text-zinc-400'}`}
            >
              ERASER
            </button>
            <button 
              onClick={autoRoof}
              className="col-span-2 p-3 text-[10px] uppercase font-bold rounded border bg-neutral-700 border-transparent text-zinc-400 hover:text-white transition"
              title="Adds blocks to the top row (y=0)"
            >
              AUTO-ROOF
            </button>
          </div>

          <label className="text-[10px] uppercase font-black text-zinc-500 tracking-widest block">Palette</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.values(ObjectType).map(type => (
              <button 
                key={type} 
                onClick={() => { setActiveTool(type); setSelectedId(null); }} 
                className={`p-2 text-[9px] uppercase font-bold rounded border transition ${activeTool === type ? 'bg-white text-black border-white' : 'bg-neutral-700 border-transparent text-zinc-400 hover:text-white'}`}
              >
                {type.replace('PORTAL_', '')}
              </button>
            ))}
          </div>
        </div>

        {selectedId && (
          <div className="mt-4 p-4 bg-black/40 rounded-xl border border-white/5 space-y-4 animate-in slide-in-from-left-4">
             <div className="flex justify-between items-center border-b border-white/10 pb-2">
                <span className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">Layer Control</span>
                <span className="text-[9px] font-mono text-zinc-500">#{selectedId.slice(-4)}</span>
             </div>
             
             <div className="grid grid-cols-4 gap-2">
                <button onClick={() => { pushUndo(); moveLayer('front'); }} className="aspect-square bg-neutral-700 rounded-lg hover:bg-white/20 flex items-center justify-center text-white/80 transition-colors group relative" title="Bring to Front (Shift + ])">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5M5 12l7-7 7 7" /><path d="M19 19H5" strokeWidth="3" /></svg>
                </button>
                <button onClick={() => { pushUndo(); moveLayer('up'); }} className="aspect-square bg-neutral-700 rounded-lg hover:bg-white/20 flex items-center justify-center text-white/80 transition-colors group relative" title="Move Up (])">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                </button>
                <button onClick={() => { pushUndo(); moveLayer('down'); }} className="aspect-square bg-neutral-700 rounded-lg hover:bg-white/20 flex items-center justify-center text-white/80 transition-colors group relative" title="Move Down ([)">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>
                </button>
                <button onClick={() => { pushUndo(); moveLayer('back'); }} className="aspect-square bg-neutral-700 rounded-lg hover:bg-white/20 flex items-center justify-center text-white/80 transition-colors group relative" title="Send to Back (Shift + [)">
                     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M19 12l-7 7-7-7" /><path d="M19 5H5" strokeWidth="3" /></svg>
                </button>
             </div>
             <div className="text-[9px] text-center text-zinc-600 uppercase tracking-widest font-bold">Z-Index Adjust</div>
          </div>
        )}
        
        <div className="mt-auto space-y-2 pt-4 border-t border-neutral-700">
            <button onClick={() => onSave(level)} className="w-full py-3 bg-emerald-600 rounded font-black hover:bg-emerald-500 transition shadow-lg shadow-emerald-900/20 active:scale-95 uppercase tracking-widest">SAVE LEVEL</button>
            <button onClick={onExit} className="w-full py-2 bg-zinc-700 rounded font-black hover:bg-zinc-600 transition active:scale-95 uppercase tracking-widest">EXIT</button>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-4 px-6 overflow-hidden z-10">
        <div className="bg-black rounded-xl border-2 border-neutral-700 relative overflow-hidden flex-1 shadow-inner group">
          <canvas ref={canvasRef} width={GAME_WIDTH} height={GAME_HEIGHT} onMouseDown={handleCanvasClick} className="cursor-crosshair w-full h-full object-contain" />
          <div className="absolute top-4 right-4 bg-white/5 border border-white/10 px-3 py-1 rounded-full pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity">
            <span className="text-[9px] text-white/30 uppercase font-black tracking-widest">{snapToGrid ? 'Grid Snapping Active' : 'Pixel-Perfect Active'}</span>
          </div>
          <div className="absolute bottom-4 right-4 text-[9px] font-mono text-white/20">
            Entities: {level.objects.length} | Chunks: {spatialIndex.size}
          </div>
        </div>
        <div className="flex items-center gap-6 bg-neutral-800/50 p-4 rounded-xl border border-white/5">
            <div className="flex flex-col min-w-[100px]">
                <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">Temporal Position</span>
                <span className="text-lg font-mono text-white/80">{Math.round(scrollX)}px</span>
            </div>
            <input type="range" min="0" max="20000" value={scrollX} onChange={(e) => setScrollX(parseInt(e.target.value))} className="flex-1 h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer" style={{ accentColor: settings.primaryColor }} />
        </div>
      </div>

      {viewingHistory && (
         <div className="absolute inset-0 z-[110] bg-black/95 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-300">
             <div className="max-w-2xl w-full glass p-8 rounded-[40px] shadow-2xl flex flex-col h-[600px] animate-in slide-in-from-bottom-8 duration-300">
                <div className="flex justify-between items-end mb-8 pb-4 border-b border-white/5">
                    <div>
                        <h3 className="text-3xl font-orbitron font-black text-white">MEMORY BANK</h3>
                        <p className="text-purple-400 text-[10px] uppercase font-black tracking-[0.3em]">Recovered Neural Patterns</p>
                    </div>
                    <button onClick={() => setViewingHistory(false)} className="text-white/20 hover:text-white font-bold text-xs uppercase tracking-widest">Close</button>
                </div>
                
                <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                    {historyItems.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-white/20 font-mono text-xs uppercase tracking-widest">No Patterns Archived</div>
                    ) : (
                        historyItems.map(item => (
                            <div key={item.id} className="bg-white/5 border border-white/5 p-6 rounded-3xl hover:bg-white/10 transition-colors group">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-white font-bold text-lg font-orbitron">{item.name}</span>
                                    <span className="text-white/20 font-mono text-[9px]">{new Date(item.timestamp).toLocaleDateString()}</span>
                                </div>
                                <p className="text-white/40 text-xs italic mb-4 line-clamp-2">"{item.prompt}"</p>
                                <div className="flex justify-between items-center">
                                    <span className="text-white/20 text-[9px] font-black uppercase tracking-widest">{item.objects.length} ENTITIES</span>
                                    <button onClick={() => loadFromHistory(item)} className="px-4 py-2 bg-purple-600 text-white text-[9px] font-black uppercase tracking-widest rounded-full hover:bg-purple-500 transition-all shadow-lg shadow-purple-900/20 active:scale-95">LOAD PATTERN</button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
             </div>
         </div>
      )}

      {confirmingAction === 'SYNTHESIZE' && (
        <div className="absolute inset-0 z-[110] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-8 animate-in fade-in duration-500">
          <div className="max-w-xl w-full glass p-12 rounded-[56px] shadow-2xl relative overflow-hidden flex flex-col animate-in zoom-in duration-300 min-h-[500px]">
             {isAiGenerating ? (
               <AIProcessingHub phase={aiPhase} progress={aiProgress} color={settings.primaryColor} />
             ) : (
               <div className="flex-1 flex flex-col">
                  <div className="mb-8">
                    <h2 className="text-4xl font-orbitron font-black tracking-tighter uppercase">AI SYNTHESIS</h2>
                    <p className="text-cyan-500 text-[10px] uppercase font-black tracking-[0.4em] mt-2">Neural Layout Generator</p>
                  </div>
                  <div className="mb-10">
                    <label className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em] block mb-4">Prompt Directive</label>
                    <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="Define your rhythmic challenge... (e.g. 'intense spider jumps with spikes')" className="w-full h-40 bg-black/40 border border-white/5 rounded-3xl p-6 text-base text-white focus:outline-none focus:border-cyan-500/30 transition-all resize-none font-medium leading-relaxed" />
                  </div>
                  <div className="mt-auto flex flex-col gap-4">
                    <button onClick={handleAiSynthesis} disabled={!aiPrompt} className={`w-full py-6 rounded-full font-black text-xl transition-all flex items-center justify-center gap-3 ${!aiPrompt ? 'bg-white/5 text-white/10 cursor-not-allowed border border-white/5' : 'bg-white text-black hover:scale-[1.02] shadow-[0_0_40px_rgba(255,255,255,0.1)] active:scale-95'}`}>
                      {aiPrompt ? 'SYNTHESIZE LEVEL' : 'AWAITING DIRECTIVE'}
                    </button>
                    <button onClick={() => setConfirmingAction(null)} className="w-full py-3 text-white/20 hover:text-white/60 transition-colors font-black text-[10px] uppercase tracking-[0.6em]">CANCEL</button>
                  </div>
               </div>
             )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Editor;
