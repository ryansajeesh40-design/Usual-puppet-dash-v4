
import React, { useState, useEffect, useRef } from 'react';
import { AppView, LevelData, UserSettings } from './types';
import { INITIAL_LEVELS, THEME, FORWARD_SPEED } from './constants';
import GameCanvas from './components/GameCanvas';
import Editor from './components/Editor';
import { generateLevelIdea } from './services/gemini';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('MENU');
  const [activeLevel, setActiveLevel] = useState<LevelData | null>(null);
  const [customLevels, setCustomLevels] = useState<LevelData[]>([]);
  const [showGameOver, setShowGameOver] = useState(false);
  const [showWin, setShowWin] = useState(false);
  const [lastCoins, setLastCoins] = useState(0);
  const [gameSessionId, setGameSessionId] = useState<number>(0);
  
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);

  const [settings, setSettings] = useState<UserSettings>(() => {
    const saved = localStorage.getItem('puppet_dash_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.volume === undefined) parsed.volume = 0.5;
        return parsed;
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }
    return {
      speed: FORWARD_SPEED,
      primaryColor: THEME.primary,
      secondaryColor: THEME.secondary,
      volume: 0.5,
    };
  });

  const logsInterval = useRef<number | undefined>(undefined);

  useEffect(() => {
    const savedLevels = localStorage.getItem('puppet_dash_levels');
    if (savedLevels) {
      try {
        setCustomLevels(JSON.parse(savedLevels));
      } catch (e) {
        console.error("Failed to parse custom levels", e);
      }
    }
  }, []);

  const saveSettings = (newSettings: UserSettings) => {
    setSettings(newSettings);
    localStorage.setItem('puppet_dash_settings', JSON.stringify(newSettings));
  };

  const resetSettings = () => {
    const defaultSettings = {
      speed: FORWARD_SPEED,
      primaryColor: THEME.primary,
      secondaryColor: THEME.secondary,
      volume: 0.5,
    };
    saveSettings(defaultSettings);
  };

  const saveCustomLevel = (lvl: LevelData) => {
    const updated = [...customLevels];
    const idx = updated.findIndex(l => l.id === lvl.id);
    if (idx > -1) updated[idx] = lvl;
    else updated.push(lvl);
    
    setCustomLevels(updated);
    localStorage.setItem('puppet_dash_levels', JSON.stringify(updated));
    setView('LEVEL_SELECT');
  };

  const startGame = (level: LevelData) => {
    setActiveLevel(level);
    setGameSessionId(Date.now());
    setView('PLAY');
    setShowGameOver(false);
    setShowWin(false);
    setLastCoins(0);
  };

  const startFakeLogs = () => {
    const messages = [
      "INITIALIZING NEURAL CLUSTERS...",
      "SYNCING RHYTHM NODES...",
      "FOLDING SPACETIME GAPS...",
      "MAPPING PUPPET STRINGS...",
      "SYNTHESIZING GEOMETRIC DECAY...",
      "OPTIMIZING NEON FREQUENCIES...",
      "AWAKENING THE PUPPET CORE...",
      "INJECTING CHAOS VECTORS...",
      "VALIDATING PHYSICS CLUSTERS..."
    ];
    setTerminalLogs([]);
    let i = 0;
    logsInterval.current = window.setInterval(() => {
      setTerminalLogs(prev => [...prev.slice(-4), messages[i % messages.length]]);
      i++;
    }, 800);
  };

  const stopFakeLogs = () => {
    if (logsInterval.current) clearInterval(logsInterval.current);
  };

  const handleMagicGenerate = async () => {
    if (!aiPrompt || isAiGenerating) return;
    setIsAiGenerating(true);
    setAiError(null);
    startFakeLogs();
    try {
      const result = await generateLevelIdea(aiPrompt);
      const newLevel: LevelData = {
        id: `custom-ai-${Date.now()}`,
        name: result.name || `Puppet: ${aiPrompt}`,
        difficulty: 'Medium',
        objects: result.objects
      };

      // Store in AI History for the Editor
      const historyJson = localStorage.getItem('puppet_dash_ai_history');
      let history = historyJson ? JSON.parse(historyJson) : [];
      history.unshift({
        id: newLevel.id,
        name: newLevel.name,
        prompt: aiPrompt,
        objects: newLevel.objects,
        timestamp: Date.now()
      });
      // Keep only last 20 entries
      localStorage.setItem('puppet_dash_ai_history', JSON.stringify(history.slice(0, 20)));

      saveCustomLevel(newLevel);
      setShowAIModal(false);
      setAiPrompt('');
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "The Puppet AI link was interrupted. This usually happens if the prompt is too complex or violates safety protocols.");
    } finally {
      setIsAiGenerating(false);
      stopFakeLogs();
    }
  };

  if (view === 'MENU') {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#020202] text-white p-10 overflow-hidden relative transition-all duration-700">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] blur-[160px] rounded-full opacity-20 animate-pulse" style={{ backgroundColor: settings.primaryColor }}></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] blur-[160px] rounded-full opacity-20 animate-pulse" style={{ backgroundColor: settings.secondaryColor }}></div>
        
        <div className="z-10 text-center animate-in zoom-in fade-in duration-1000">
          <div className="mb-4 inline-block px-4 py-1 border border-white/10 rounded-full glass animate-float">
             <span className="text-[10px] tracking-[0.4em] text-white/50 font-bold uppercase">System Active // Neural Link 100%</span>
          </div>
          <h1 className="text-8xl lg:text-[10rem] font-orbitron font-black tracking-tighter mb-2 leading-none drop-shadow-glow" style={{ color: '#fff' }}>
            USUAL<br/>PUPPET<br/>DASH
          </h1>
          <p className="text-white/30 font-inter tracking-[0.6em] uppercase text-xs mb-16 animate-pulse">
            High Fidelity Rhythm Platforming
          </p>
          
          <div className="flex flex-col gap-5 max-w-sm mx-auto">
            <button 
              onClick={() => setView('LEVEL_SELECT')}
              className="group relative px-10 py-5 bg-white text-black font-black rounded-full transition-all hover:scale-105 active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.2)]"
            >
              INITIALIZE VOID
            </button>
            <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setView('EDITOR')}
                  className="px-4 py-5 glass text-white/70 font-bold rounded-full transition hover:text-white hover:border-white/20 active:scale-95"
                >
                  WORKSHOP
                </button>
                <button 
                  onClick={() => setView('SETTINGS')}
                  className="px-4 py-5 glass text-white/70 font-bold rounded-full transition hover:text-white hover:border-white/20 active:scale-95"
                >
                  CALIBRATE
                </button>
            </div>
          </div>
        </div>

        <div className="absolute bottom-10 flex gap-12 text-white/10 text-[9px] font-mono tracking-widest uppercase">
          <span>Build v0.8.2 // Stable</span>
          <span>Neuro-Sync // Enabled</span>
        </div>
      </div>
    );
  }

  if (view === 'SETTINGS') {
    return (
      <div className="h-screen w-screen bg-[#050505] text-white p-10 overflow-y-auto font-inter animate-in fade-in duration-500">
        <div className="max-w-3xl mx-auto pb-20">
          <button 
            onClick={() => setView('MENU')}
            className="mb-12 group flex items-center gap-4 text-white/40 hover:text-white transition-all"
          >
            <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-white/5">←</div>
            <span className="font-bold tracking-widest text-xs uppercase">Main Interface</span>
          </button>

          <div className="flex justify-between items-end mb-16">
            <h2 className="text-6xl font-orbitron font-black">SYSTEM<br/><span className="text-white/20">CONFIG</span></h2>
            <button 
              onClick={resetSettings}
              className="px-6 py-2 glass rounded-full text-[10px] font-bold text-red-400 hover:bg-red-500/10 transition uppercase tracking-widest border border-red-500/20"
            >
              Factory Reset
            </button>
          </div>
          
          <div className="space-y-10">
            {/* Aesthetics */}
            <div className="p-8 glass rounded-[40px] space-y-8">
              <label className="text-xs font-black text-white/30 uppercase tracking-[0.3em] block">Neural Tones</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="flex items-center justify-between p-6 bg-black/40 rounded-3xl border border-white/5">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-white/80">Primary</span>
                    <span className="text-[10px] text-white/20 font-mono">{settings.primaryColor}</span>
                  </div>
                  <input 
                    type="color" 
                    value={settings.primaryColor} 
                    onChange={(e) => saveSettings({...settings, primaryColor: e.target.value})}
                    className="w-14 h-14 bg-transparent border-none cursor-pointer rounded-2xl overflow-hidden shadow-xl"
                  />
                </div>
                <div className="flex items-center justify-between p-6 bg-black/40 rounded-3xl border border-white/5">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-white/80">Secondary</span>
                    <span className="text-[10px] text-white/20 font-mono">{settings.secondaryColor}</span>
                  </div>
                  <input 
                    type="color" 
                    value={settings.secondaryColor} 
                    onChange={(e) => saveSettings({...settings, secondaryColor: e.target.value})}
                    className="w-14 h-14 bg-transparent border-none cursor-pointer rounded-2xl overflow-hidden shadow-xl"
                  />
                </div>
              </div>
            </div>

            {/* Performance */}
            <div className="p-8 glass rounded-[40px] space-y-10">
              <div>
                <div className="flex justify-between items-center mb-6">
                  <label className="text-xs font-black text-white/30 uppercase tracking-[0.3em]">Temporal Speed</label>
                  <span className="font-orbitron font-black text-3xl" style={{ color: settings.primaryColor }}>{settings.speed.toFixed(1)}<span className="text-sm">x</span></span>
                </div>
                <input 
                  type="range" min="3" max="12" step="0.5" value={settings.speed} 
                  onChange={(e) => saveSettings({...settings, speed: parseFloat(e.target.value)})}
                  className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer hover:bg-white/20 transition-all"
                  style={{ accentColor: settings.primaryColor }}
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-6">
                  <label className="text-xs font-black text-white/30 uppercase tracking-[0.3em]">Sync Gain</label>
                  <span className="font-orbitron font-black text-3xl text-white">{Math.round(settings.volume * 100)}<span className="text-sm">%</span></span>
                </div>
                <input 
                  type="range" min="0" max="1" step="0.01" value={settings.volume} 
                  onChange={(e) => saveSettings({...settings, volume: parseFloat(e.target.value)})}
                  className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer hover:bg-white/20 transition-all"
                  style={{ accentColor: settings.secondaryColor }}
                />
              </div>
            </div>

            <div className="pt-10 flex justify-end">
                 <button 
                  onClick={() => setView('MENU')}
                  className="px-14 py-5 bg-white text-black font-black text-lg rounded-full transition-all hover:scale-105 shadow-[0_0_30px_rgba(255,255,255,0.1)] active:scale-95"
                >
                  SAVE SEQUENCE
                </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (view === 'LEVEL_SELECT') {
    return (
      <div className="h-screen w-screen bg-[#050505] text-white p-10 overflow-y-auto relative animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="max-w-6xl mx-auto">
          <button 
            onClick={() => setView('MENU')}
            className="mb-12 group flex items-center gap-4 text-white/40 hover:text-white transition-all"
          >
            <div className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center group-hover:bg-white/5">←</div>
            <span className="font-bold tracking-widest text-xs uppercase">Interface</span>
          </button>

          <div className="flex flex-col md:flex-row items-start md:items-end justify-between mb-16 gap-6">
              <h2 className="text-7xl font-orbitron font-black leading-none">LEVEL<br/><span className="text-white/20 uppercase">Clusters</span></h2>
              <button 
                  onClick={() => { setShowAIModal(true); setAiError(null); }}
                  className="group flex items-center gap-4 px-8 py-4 bg-white text-black font-black rounded-full hover:scale-105 active:scale-95 transition-all shadow-[0_0_40px_rgba(255,255,255,0.2)]"
              >
                  <span className="text-xl">✨</span>
                  PUPPET AI
              </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pb-32">
            {[...INITIAL_LEVELS, ...customLevels].map((lvl, idx) => (
              <div 
                key={lvl.id}
                className="group relative glass p-8 rounded-[48px] hover:border-white/20 transition-all hover:translate-y-[-8px] animate-in fade-in duration-500"
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                <div className="absolute top-8 right-8 w-12 h-12 rounded-full border border-white/5 flex items-center justify-center text-xs font-black text-white/20 group-hover:text-white/60 transition-colors">
                  {lvl.difficulty[0]}
                </div>
                
                <h3 className="text-3xl font-orbitron font-black mb-1 truncate pr-12">{lvl.name}</h3>
                <p className="text-white/20 text-[10px] font-bold tracking-[0.3em] uppercase mb-10">Threat Cluster: {lvl.difficulty}</p>
                
                <div className="flex gap-4">
                  <button 
                    onClick={() => startGame(lvl)}
                    className="flex-1 py-4 bg-white/5 group-hover:bg-white group-hover:text-black rounded-3xl font-black transition-all border border-white/5"
                  >
                    DEPLOY
                  </button>
                  {lvl.id.toString().startsWith('custom') && (
                    <button 
                      onClick={() => { setActiveLevel(lvl); setView('EDITOR'); }}
                      className="px-6 py-4 glass hover:bg-white/10 rounded-3xl transition-all"
                    >
                      <span className="text-lg">⚙️</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
            
            <button 
              onClick={() => setView('EDITOR')}
              className="group border-2 border-dashed border-white/5 rounded-[48px] p-8 flex flex-col items-center justify-center cursor-pointer hover:border-white/20 hover:bg-white/5 transition-all h-[240px]"
            >
              <div className="w-16 h-16 rounded-full glass flex items-center justify-center mb-4 text-3xl group-hover:scale-110 transition-transform">+</div>
              <p className="font-black text-white/20 text-xs tracking-widest uppercase">Manual Synthesis</p>
            </button>
          </div>
        </div>

        {/* PUPPET AI MODAL */}
        {showAIModal && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/95 backdrop-blur-3xl animate-in fade-in duration-500">
                <div className="max-w-xl w-full glass p-12 rounded-[56px] shadow-2xl relative overflow-hidden min-h-[600px] flex flex-col animate-in zoom-in duration-500">
                    
                    {isAiGenerating ? (
                        <div className="flex-1 flex flex-col relative py-8">
                            {/* Neural Stream Particles */}
                            <div className="absolute inset-0 pointer-events-none opacity-20 overflow-hidden">
                                {[...Array(10)].map((_, i) => (
                                    <div 
                                        key={i}
                                        className="absolute text-[8px] font-mono text-white whitespace-nowrap animate-data-stream"
                                        style={{ 
                                            left: `${Math.random() * 100}%`, 
                                            animationDuration: `${1 + Math.random() * 2}s`,
                                            animationDelay: `${Math.random() * 2}s`
                                        }}
                                    >
                                        {Array(20).fill(0).map(() => (Math.random() > 0.5 ? "0" : "1")).join("")}
                                        <br/>
                                        0x{Math.floor(Math.random()*16777215).toString(16).toUpperCase()}
                                    </div>
                                ))}
                            </div>

                            <div className="relative z-10 flex-1 flex flex-col items-center justify-center">
                                <div className="relative w-48 h-48 mb-12">
                                    {/* Rotating Geometric Rings */}
                                    <div className="absolute inset-0 border-4 border-dashed border-white/10 rounded-full animate-rotate-slow" />
                                    <div className="absolute inset-4 border-2 border-dashed border-white/20 rounded-full animate-rotate-fast" />
                                    <div className="absolute inset-10 border border-white/30 rounded-full animate-pulse" />
                                    
                                    {/* The Core */}
                                    <div className="absolute inset-16 rounded-full overflow-hidden flex items-center justify-center">
                                        <div className="absolute inset-0 blur-3xl opacity-50" style={{ backgroundColor: settings.primaryColor }} />
                                        <div className="relative z-10 w-full h-full flex items-center justify-center bg-black/40 rounded-full border border-white/20">
                                            <span className="text-4xl animate-bounce">✨</span>
                                        </div>
                                    </div>
                                    
                                    {/* Orbiting Points */}
                                    {[...Array(6)].map((_, i) => (
                                        <div 
                                            key={i}
                                            className="absolute w-2 h-2 rounded-full bg-white shadow-lg"
                                            style={{ 
                                                top: '50%', 
                                                left: '50%',
                                                transform: `rotate(${i * 60}deg) translateX(90px) rotate(-${i * 60}deg)`,
                                                animation: 'pulse 1s ease-in-out infinite',
                                                animationDelay: `${i * 0.1}s`
                                            }}
                                        />
                                    ))}
                                </div>

                                <div className="text-center space-y-4">
                                    <h3 className="text-4xl font-orbitron font-black text-white tracking-tighter">NEURAL SYNTHESIS</h3>
                                    <p className="text-white/20 text-[10px] font-bold tracking-[0.6em] uppercase">Status: Architecting Reality</p>
                                    
                                    {/* Fake Terminal Logs */}
                                    <div className="mt-8 bg-black/60 border border-white/5 p-4 rounded-2xl w-64 h-32 overflow-hidden text-left font-mono text-[9px] text-white/40 leading-relaxed shadow-inner">
                                        {terminalLogs.map((log, i) => (
                                            <div key={i} className="animate-in slide-in-from-bottom-1 duration-300">
                                                <span className="text-white/20 mr-2">&gt;</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="mt-8 px-12 pb-4">
                                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-transparent via-white to-transparent animate-progress" style={{ width: '100%' }} />
                                </div>
                                <button 
                                    onClick={() => { setIsAiGenerating(false); stopFakeLogs(); setShowAIModal(false); setView('MENU'); }}
                                    className="w-full mt-10 py-2 text-white/10 hover:text-white/40 transition-colors font-black text-[9px] uppercase tracking-[0.5em] border-t border-white/5 pt-6"
                                >
                                    ABORT NEURAL SEQUENCE // RETURN TO MENU
                                </button>
                            </div>
                        </div>
                    ) : aiError ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center animate-in zoom-in duration-500">
                            <div className="w-24 h-24 rounded-full bg-red-500/10 flex items-center justify-center mb-8 border border-red-500/20 shadow-lg">
                                <span className="text-4xl">⚠️</span>
                            </div>
                            <h4 className="text-3xl font-orbitron font-black text-red-500 mb-6 uppercase tracking-tighter">Link Failure</h4>
                            <div className="p-6 bg-red-950/20 border border-red-500/20 rounded-[32px] mb-12 max-w-sm">
                                <p className="text-red-200/60 text-xs font-bold leading-relaxed uppercase tracking-widest">{aiError}</p>
                            </div>
                            <div className="flex flex-col gap-4 w-full px-12">
                                <button 
                                    onClick={() => { setAiError(null); setAiPrompt(''); }}
                                    className="w-full py-5 bg-white text-black font-black text-lg rounded-full hover:scale-105 transition-all shadow-xl active:scale-95"
                                >
                                    RETRY LINK
                                </button>
                                <button 
                                    onClick={() => { setAiError(null); setAiPrompt(''); setShowAIModal(false); setView('MENU'); }}
                                    className="w-full py-2 text-white/20 hover:text-white/50 transition-colors font-black text-[9px] uppercase tracking-[0.4em]"
                                >
                                    RETURN TO BASE
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col animate-in fade-in duration-500">
                            <div className="text-center mb-10">
                                <h3 className="text-4xl font-orbitron font-black mb-1 tracking-tighter">PUPPET AI</h3>
                                <p className="text-white/20 text-[9px] font-bold uppercase tracking-[0.5em]">Neural Manifestation v4.0</p>
                            </div>
                            <div className="mb-10">
                                <label className="text-[10px] font-black text-white/20 uppercase tracking-[0.4em] block mb-4 pl-2">Creative Directive</label>
                                <textarea 
                                    value={aiPrompt}
                                    onChange={(e) => setAiPrompt(e.target.value)}
                                    placeholder="Manifest a level of digital decay, neon storms, or rhythmic infinity..."
                                    className="w-full h-44 bg-black/40 border border-white/5 rounded-[40px] p-8 text-base text-white placeholder:text-white/10 focus:outline-none focus:border-white/20 transition-all resize-none shadow-inner font-medium leading-relaxed"
                                />
                            </div>

                            <div className="mt-auto flex flex-col gap-4">
                                <button 
                                    onClick={handleMagicGenerate}
                                    disabled={!aiPrompt}
                                    className={`w-full py-6 rounded-full font-black text-xl flex items-center justify-center gap-4 transition-all ${(!aiPrompt) ? 'bg-white/5 text-white/10 cursor-not-allowed' : 'bg-white text-black hover:scale-[1.02] shadow-[0_0_40px_rgba(255,255,255,0.1)] active:scale-95'}`}
                                >
                                    <span>✨</span> AWAKEN PUPPET
                                </button>
                                <button 
                                    onClick={() => setShowAIModal(false)}
                                    className="w-full py-3 text-white/20 hover:text-white/60 transition-colors font-black text-[10px] uppercase tracking-[0.6em]"
                                >
                                    TERMINATE LINK
                                </button>
                                <button 
                                    onClick={() => { setShowAIModal(false); setView('MENU'); }}
                                    className="w-full py-2 text-white/10 hover:text-white/40 transition-colors font-black text-[9px] uppercase tracking-[0.5em] border-t border-white/5 pt-4"
                                >
                                    EXIT TO MAIN INTERFACE
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )}
      </div>
    );
  }

  if (view === 'PLAY' && activeLevel) {
    return (
      <div className="h-screen w-screen bg-black flex flex-col items-center justify-center relative">
        <GameCanvas 
          key={gameSessionId}
          level={activeLevel} 
          settings={settings}
          onGameOver={(coins) => { setLastCoins(coins); setShowGameOver(true); }}
          onWin={(coins) => { setLastCoins(coins); setShowWin(true); }}
          isPausedExternal={showGameOver || showWin}
          onQuit={() => setView('LEVEL_SELECT')}
          onRestart={() => startGame(activeLevel)}
        />

        {showGameOver && (
          <div className="absolute inset-0 flex items-center justify-center z-[100] bg-black/80 backdrop-blur-xl animate-in fade-in duration-500">
            <div className="text-center p-16 glass rounded-[64px] max-w-md w-full animate-in zoom-in duration-500">
              <h2 className="text-6xl font-orbitron font-black text-red-500 mb-2 leading-none">STRINGS<br/>CUT</h2>
              <p className="text-white/20 text-[10px] font-bold tracking-[0.4em] uppercase mb-6">Neural Feedback Terminated</p>
              
              <div className="flex items-center justify-center gap-3 mb-10 bg-white/5 py-3 rounded-3xl">
                <div className="w-5 h-5 rounded-full bg-[#ffd700]" />
                <span className="text-white font-orbitron text-xl font-black">{lastCoins} COINS</span>
              </div>

              <div className="flex flex-col gap-5">
                <button onClick={() => startGame(activeLevel)} className="py-6 bg-white text-black font-black text-2xl rounded-full hover:scale-105 transition-all shadow-xl active:scale-95">REATTEMPT</button>
                <button onClick={() => setView('LEVEL_SELECT')} className="py-4 text-white/30 hover:text-white transition-colors font-black text-sm uppercase tracking-widest">ABORT MISSION</button>
              </div>
            </div>
          </div>
        )}

        {showWin && (
          <div className="absolute inset-0 flex items-center justify-center z-[100] bg-black/80 backdrop-blur-xl animate-in fade-in duration-500">
            <div className="text-center p-16 glass rounded-[64px] max-w-md w-full border-emerald-500/20 animate-in zoom-in duration-500">
              <h2 className="text-6xl font-orbitron font-black text-emerald-400 mb-2 leading-none">PUPPET<br/>MASTER</h2>
              <p className="text-white/20 text-[10px] font-bold tracking-[0.4em] uppercase mb-6">Neural Synthesis Optimized</p>
              
              <div className="flex items-center justify-center gap-3 mb-10 bg-emerald-500/10 py-3 rounded-3xl border border-emerald-500/20">
                <div className="w-5 h-5 rounded-full bg-[#ffd700] shadow-[0_0_15px_#ffd700]" />
                <span className="text-white font-orbitron text-xl font-black">{lastCoins} COINS RETRIEVED</span>
              </div>

              <div className="flex flex-col gap-5">
                <button onClick={() => setView('LEVEL_SELECT')} className="py-6 bg-emerald-500 text-black font-black text-2xl rounded-full hover:scale-105 transition-all shadow-[0_0_40px_rgba(16,185,129,0.3)] active:scale-95">CONTINUE</button>
                <button onClick={() => startGame(activeLevel)} className="py-4 text-white/30 hover:text-white transition-colors font-black text-sm uppercase tracking-widest">REPLAY SEQUENCE</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (view === 'EDITOR') {
    return (
      <Editor 
        onSave={saveCustomLevel} 
        onExit={() => setView('MENU')} 
        settings={settings}
        initialLevel={activeLevel && activeLevel.id.toString().startsWith('custom') ? activeLevel : undefined}
      />
    );
  }

  return null;
};

export default App;
