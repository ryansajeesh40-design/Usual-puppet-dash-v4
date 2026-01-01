
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

const NeuralWeb: React.FC<{ color: string }> = ({ color }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const particles: { x: number; y: number; vx: number; vy: number }[] = [];
    const particleCount = 40;

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 1,
        vy: (Math.random() - 0.5) * 1
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.2;

      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dist = Math.sqrt((p.x - p2.x) ** 2 + (p.y - p2.y) ** 2);
          if (dist < 80) {
            ctx.globalAlpha = (1 - dist / 80) * 0.3;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(animationFrameId);
  }, [color]);

  return <canvas ref={canvasRef} width={400} height={400} className="absolute inset-0 w-full h-full" />;
};

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

  // Performance Optimization: Spatial Partitioning with Pre-Sorted Chunks
  const spatialIndex = useMemo(() => {
    const index = new Map<number, GameObject[]>();
    // Sort entire object list once by Z to maintain consistency during partitioning
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
      } else if (type === ObjectType.COIN) {
        ctx.fillStyle = '#ffd700';
        ctx.beginPath(); ctx.arc(BLOCK_SIZE / 2, BLOCK_SIZE / 2, 8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.stroke();
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
      { p: 10, t: 'Connecting to Puppet Core...' },
      { p: 30, t: 'Mapping Rhythmic Vectors...' },
      { p: 50, t: 'Synthesizing Entitites...' },
      { p: 75, t: 'Inverting Gravity Nodes...' },
      { p: 90, t: 'Finalizing Layout...' }
    ];

    let phaseIdx = 0;
    const interval = setInterval(() => {
      if (phaseIdx < phases.length) {
        setAiProgress(phases[phaseIdx].p);
        setAiPhase(phases[phaseIdx].t);
        phaseIdx++;
      }
    }, 1500);

    try {
      const result = await generateLevelIdea(aiPrompt);
      pushUndo();
      setLevel(prev => ({ ...prev, objects: result.objects }));
      setAiProgress(100);
      setAiPhase('Neural Layout Complete');
      setTimeout(() => {
        setConfirmingAction(null);
        setIsAiGenerating(false);
        setAiPrompt('');
      }, 800);
    } catch (err) {
      console.error(err);
      setAiPhase('Connection Severed');
      setIsAiGenerating(false);
    } finally {
      clearInterval(interval);
    }
  };

  const startPreview = () => {
    setPreviewSessionId(Date.now());
    setPreviewStatus('PLAYING');
    setIsPreviewing(true);
  };

  // Z-Layering logic
  const moveLayer = (direction: 'front' | 'back' | 'up' | 'down') => {
    if (!selectedId) return;
    pushUndo();
    const updated = [...level.objects];
    const idx = updated.findIndex(o => o.id === selectedId);
    if (idx === -1) return;

    const currentZ = updated[idx].z || 0;
    const allZs = updated.map(o => o.z || 0);
    const minZ = Math.min(...allZs);
    const maxZ = Math.max(...allZs);

    if (direction === 'front') updated[idx].z = maxZ + 1;
    else if (direction === 'back') updated[idx].z = minZ - 1;
    else if (direction === 'up') updated[idx].z = currentZ + 1;
    else if (direction === 'down') updated[idx].z = currentZ - 1;

    setLevel({ ...level, objects: updated });
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (confirmingAction || isPreviewing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const worldX = (e.clientX - rect.left) * scaleX + scrollX;
    const worldY = (e.clientY - rect.top) * scaleY;

    let x: number, y: number;
    if (snapToGrid) {
      x = Math.round(worldX / BLOCK_SIZE) * BLOCK_SIZE - (BLOCK_SIZE / 2);
      y = Math.round(worldY / BLOCK_SIZE) * BLOCK_SIZE - (BLOCK_SIZE / 2);
    } else {
      x = worldX - (BLOCK_SIZE / 2);
      y = worldY - (BLOCK_SIZE / 2);
    }
    
    // Find clicked object (respecting Z-order: check top-most first)
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

  // Optimized Rendering Loop
  useEffect(() => {
    if (isPreviewing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      
      // Draw cached grid chunks
      if (gridCacheRef.current) {
        const xOffset = -scrollX % CHUNK_SIZE;
        for (let x = xOffset - CHUNK_SIZE; x < GAME_WIDTH + CHUNK_SIZE; x += CHUNK_SIZE) {
          ctx.drawImage(gridCacheRef.current, x, 0);
        }
      }

      ctx.strokeStyle = settings.primaryColor;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 400); ctx.lineTo(GAME_WIDTH, 400); ctx.stroke();

      ctx.save();
      ctx.translate(-scrollX, 0);
      
      const startChunk = Math.floor(scrollX / CHUNK_SIZE);
      const endChunk = Math.floor((scrollX + GAME_WIDTH) / CHUNK_SIZE);
      
      // Collect unique objects across visible chunks
      // Using a Map ensures we only draw each object once (for large objects spanning chunks)
      const drawBatch = new Map<string, GameObject>();
      for (let i = startChunk; i <= endChunk; i++) {
        const chunkObjects = spatialIndex.get(i);
        if (chunkObjects) {
          for (const obj of chunkObjects) drawBatch.set(obj.id, obj);
        }
      }

      // Sort batch by Z for final draw (chunks are already partially sorted, but map order is not guaranteed)
      const sortedBatch = Array.from(drawBatch.values()).sort((a, b) => (a.z || 0) - (b.z || 0));

      sortedBatch.forEach(obj => {
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
      });
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

        <button onClick={() => setConfirmingAction('SYNTHESIZE')} className="w-full py-4 bg-cyan-600/20 text-cyan-400 font-black text-[10px] rounded-xl flex items-center justify-center gap-2 border border-cyan-500/20 hover:bg-cyan-500/30 transition-all uppercase tracking-widest">
          <span>✨</span> AI SYNTHESIS
        </button>

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
             <div className="flex justify-between items-center">
                <span className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">Layering</span>
                <span className="text-[10px] font-mono text-zinc-600">ID: {selectedId.slice(-4)}</span>
             </div>
             <div className="grid grid-cols-2 gap-2">
                <button onClick={() => moveLayer('front')} className="p-2 bg-neutral-700 rounded text-[9px] font-bold uppercase hover:bg-neutral-600">To Front</button>
                <button onClick={() => moveLayer('back')} className="p-2 bg-neutral-700 rounded text-[9px] font-bold uppercase hover:bg-neutral-600">To Back</button>
                <button onClick={() => moveLayer('up')} className="p-2 bg-neutral-700 rounded text-[9px] font-bold uppercase hover:bg-neutral-600">Move Up</button>
                <button onClick={() => moveLayer('down')} className="p-2 bg-neutral-700 rounded text-[9px] font-bold uppercase hover:bg-neutral-600">Move Down</button>
             </div>
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

      {confirmingAction === 'SYNTHESIZE' && (
        <div className="absolute inset-0 z-[110] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-8 animate-in fade-in duration-500">
          <div className="max-w-xl w-full glass p-12 rounded-[56px] shadow-2xl relative overflow-hidden flex flex-col animate-in zoom-in duration-300 min-h-[500px]">
             {isAiGenerating ? (
               <div className="flex-1 flex flex-col items-center justify-center text-center py-10">
                  <div className="relative w-48 h-48 mb-10 overflow-hidden rounded-full border border-white/10 shadow-[0_0_50px_rgba(255,255,255,0.05)]">
                      <NeuralWeb color={settings.primaryColor} />
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-40" />
                      <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-6xl animate-pulse drop-shadow-[0_0_20px_rgba(255,255,255,0.5)]">✨</div>
                      </div>
                  </div>
                  
                  <div className="w-full max-w-sm px-8">
                      <h3 className="text-3xl font-orbitron font-black text-white mb-2 uppercase tracking-tighter">{aiPhase}</h3>
                      <div className="w-full h-2 bg-white/5 rounded-full mt-8 overflow-hidden">
                          <div className="h-full bg-white transition-all duration-700 shadow-[0_0_15px_white]" style={{ width: `${aiProgress}%` }} />
                      </div>
                      <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em] mt-4">Synthesis Buffer: {aiProgress}%</p>
                  </div>
               </div>
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
