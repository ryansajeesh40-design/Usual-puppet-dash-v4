
import React, { useRef, useEffect, useCallback, useState } from 'react';
import { GameState, LevelData, ObjectType, UserSettings, GameObject, PlayerMode } from '../types';
import { 
    GAME_WIDTH, 
    GAME_HEIGHT, 
    PLAYER_SIZE, 
    BLOCK_SIZE, 
    GRAVITY, 
    JUMP_FORCE 
} from '../constants';

interface GameCanvasProps {
  level: LevelData;
  settings: UserSettings;
  onGameOver: () => void;
  onWin: () => void;
  isPausedExternal: boolean;
  onQuit: () => void;
  onRestart: () => void;
}

const SHIP_THRUST = -0.65;
const SHIP_GRAVITY = 0.40;
const JETPACK_THRUST = -0.75; 
const JETPACK_GRAVITY = 0.45;
const BALL_GRAVITY = 0.7;
const UFO_GRAVITY = 0.6;
const UFO_JUMP = -9;
const WAVE_SPEED_Y = 6;
const ROBOT_JUMP_INITIAL = -7;
const ROBOT_JUMP_SUSTAIN = -0.8;
const ROBOT_MAX_JUMP_FRAMES = 12;
const SWING_GRAVITY = 0.5;
const MAX_VY = 12;
const MIN_WIN_DISTANCE = 3000;
const TRAIL_LENGTH = 250;
const CHUNK_SIZE = 600;

function pointInTriangle(px: number, py: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) {
  const area = 0.5 * (-y2 * x3 + y1 * (-x2 + x3) + x1 * (y2 - y3) + x2 * y3);
  const s = 1 / (2 * area) * (y1 * x3 - x1 * y3 + (y3 - y1) * px + (x1 - x3) * py);
  const t = 1 / (2 * area) * (x1 * y2 - y1 * x2 + (y1 - y2) * px + (x2 - x1) * py);
  return s >= 0 && t >= 0 && (1 - s - t) >= 0;
}

const getPortalHue = (type: string): number => {
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

const GameCanvas: React.FC<GameCanvasProps> = ({ 
  level, 
  settings, 
  onGameOver, 
  onWin, 
  isPausedExternal,
  onQuit, 
  onRestart 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const trailRef = useRef<{x: number, y: number, rotation: number, mode: PlayerMode}[]>([]);
  const isJumpButtonPressed = useRef(false);
  const robotJumpFrames = useRef(0);
  const spiderTeleportLine = useRef<{x: number, y1: number, y2: number, alpha: number} | null>(null);
  const portalAnimsRef = useRef<{x: number, y: number, hue: number, life: number}[]>([]);
  const portalFlashRef = useRef<{hue: number, life: number} | null>(null);
  const jumpParticlesRef = useRef<{x: number, y: number, vx: number, vy: number, life: number}[]>([]);
  
  // Spatial Partitioning
  const chunksRef = useRef<Map<number, GameObject[]>>(new Map());
  const drawBufferRef = useRef<GameObject[]>([]);
  const collisionBufferRef = useRef<GameObject[]>([]);

  // Build Spatial Index
  useEffect(() => {
    const chunks = new Map<number, GameObject[]>();
    level.objects.forEach(obj => {
      const chunkId = Math.floor(obj.x / CHUNK_SIZE);
      if (!chunks.has(chunkId)) chunks.set(chunkId, []);
      chunks.get(chunkId)!.push(obj);
    });
    chunksRef.current = chunks;
  }, [level]);
  
  // Screen shake ref
  const screenShake = useRef(0);
  const triggerShake = useCallback((intensity: number, scaleWithSpeed: boolean = true) => {
    const speedFactor = scaleWithSpeed ? (settings.speed / 5) : 1;
    screenShake.current = intensity * speedFactor;
  }, [settings.speed]);
  
  const [isLocalPaused, setIsLocalPaused] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [elapsedTime, setElapsedTime] = useState(0);
  const [completion, setCompletion] = useState(0);

  const onSurfaceRef = useRef(false);
  const actionBufferActive = useRef(false); 
  const startTimeRef = useRef(Date.now());
  const pauseStartTimeRef = useRef<number | null>(null);
  const totalPauseDurationRef = useRef(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const bgmGainRef = useRef<GainNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const bgmLoopRef = useRef<number | undefined>(undefined);

  const initAudio = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      masterGainRef.current = audioCtxRef.current.createGain();
      masterGainRef.current.connect(audioCtxRef.current.destination);
      bgmGainRef.current = audioCtxRef.current.createGain();
      bgmGainRef.current.connect(masterGainRef.current);
      startBgm();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  const startBgm = () => {
    if (!audioCtxRef.current || !bgmGainRef.current) return;
    const ctx = audioCtxRef.current;
    const playNote = (freq: number, time: number, duration: number, vol = 0.1) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, time);
      g.gain.setValueAtTime(vol, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + duration);
      osc.connect(g);
      g.connect(bgmGainRef.current!);
      osc.start(time);
      osc.stop(time + duration);
    };

    const step = 0.15;
    let nextTime = ctx.currentTime;
    const scheduler = () => {
      while (nextTime < ctx.currentTime + 0.1) {
        const pattern = [55, 55, 82, 55, 110, 55, 82, 55];
        const index = Math.floor(nextTime / step) % pattern.length;
        playNote(pattern[index], nextTime, step * 0.8, 0.05);
        nextTime += step;
      }
      bgmLoopRef.current = requestAnimationFrame(scheduler);
    };
    scheduler();
  };

  const playSound = (type: 'jump' | 'death' | 'portal') => {
    if (!audioCtxRef.current || !masterGainRef.current) return;
    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(masterGainRef.current);
    const now = ctx.currentTime;
    if (type === 'jump') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.1);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (type === 'death') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.linearRampToValueAtTime(40, now + 0.5);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    } else if (type === 'portal') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.linearRampToValueAtTime(600, now + 0.2);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    }
  };

  const stateRef = useRef<GameState & { frame: number }>({
    player: { x: 50, y: 360, vy: 0, rotation: 0, isDead: false, isJumping: false, mode: 'CUBE', gravityDir: 1 },
    cameraX: 0,
    activeLevel: level,
    status: 'PLAYING',
    frame: 0
  });

  const frameId = useRef<number | undefined>(undefined);

  const togglePause = useCallback(() => {
    initAudio();
    
    setIsLocalPaused(prevIsPaused => {
      const willPause = !prevIsPaused;

      if (willPause) {
        if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
            setCountdown(null);
        } else {
            pauseStartTimeRef.current = Date.now();
        }
      } else {
        setCountdown(3);
        countdownTimerRef.current = setInterval(() => {
            setCountdown(c => {
                if (c !== null && c > 1) return c - 1;
                
                if (countdownTimerRef.current) {
                    clearInterval(countdownTimerRef.current);
                    countdownTimerRef.current = null;
                }
                
                if (pauseStartTimeRef.current) {
                    const duration = Date.now() - pauseStartTimeRef.current;
                    totalPauseDurationRef.current += duration;
                    pauseStartTimeRef.current = null;
                }
                return null;
            });
        }, 800);
      }
      return willPause;
    });
  }, []);

  const triggerInteraction = useCallback((isAutoJump = false) => {
    initAudio();
    const s = stateRef.current;
    if (s.player.isDead || isPausedExternal || isLocalPaused || countdown !== null) return;
    
    const addJumpParticles = () => {
      for (let i = 0; i < 6; i++) {
        jumpParticlesRef.current.push({
          x: s.player.x + PLAYER_SIZE / 2,
          y: s.player.y + (s.player.gravityDir === 1 ? PLAYER_SIZE : 0),
          vx: (Math.random() - 0.5) * 4,
          vy: -Math.random() * 3 * s.player.gravityDir,
          life: 1.0
        });
      }
    };

    if (s.player.mode === 'CUBE' && onSurfaceRef.current) {
      s.player.vy = JUMP_FORCE * s.player.gravityDir;
      s.player.isJumping = true;
      onSurfaceRef.current = false;
      playSound('jump');
      addJumpParticles();
    } else if (s.player.mode === 'BALL' && onSurfaceRef.current) {
      s.player.gravityDir = s.player.gravityDir === 1 ? -1 : 1;
      s.player.vy = 0;
      onSurfaceRef.current = false;
      playSound('jump');
    } else if (s.player.mode === 'UFO' && (!isAutoJump || onSurfaceRef.current)) {
      s.player.vy = UFO_JUMP;
      onSurfaceRef.current = false;
      playSound('jump');
      addJumpParticles();
    } else if (s.player.mode === 'ROBOT' && onSurfaceRef.current) {
      s.player.vy = ROBOT_JUMP_INITIAL * s.player.gravityDir;
      s.player.isJumping = true;
      onSurfaceRef.current = false;
      robotJumpFrames.current = 1;
      playSound('jump');
      addJumpParticles();
    } else if (s.player.mode === 'SWING' && (!isAutoJump || onSurfaceRef.current)) {
      s.player.gravityDir = s.player.gravityDir === 1 ? -1 : 1;
      onSurfaceRef.current = false;
      playSound('jump');
    } else if (s.player.mode === 'SPIDER' && onSurfaceRef.current) {
      const oldY = s.player.y;
      s.player.gravityDir = s.player.gravityDir === 1 ? -1 : 1;
      s.player.vy = 0;
      onSurfaceRef.current = false;
      playSound('jump');
      
      let currentY = s.player.y;
      const step = s.player.gravityDir * 5;
      let found = false;

      // Spatial collision check for Spider teleport
      const pChunk = Math.floor(s.player.x / CHUNK_SIZE);
      const candidates: GameObject[] = [];
      for(let c = pChunk - 1; c <= pChunk + 2; c++) {
          const chunk = chunksRef.current.get(c);
          if(chunk) for(let k=0; k<chunk.length; k++) candidates.push(chunk[k]);
      }

      for (let y = currentY + step; (s.player.gravityDir === 1 ? y < 360 : y > 0); y += step) {
        for (const obj of candidates) {
          if (obj.type === ObjectType.BLOCK && s.player.x < obj.x + BLOCK_SIZE && s.player.x + PLAYER_SIZE > obj.x) {
            if (s.player.gravityDir === 1 && y + PLAYER_SIZE >= obj.y && y < obj.y) {
               currentY = obj.y - PLAYER_SIZE;
               found = true; break;
            } else if (s.player.gravityDir === -1 && y <= obj.y + BLOCK_SIZE && y > obj.y) {
               currentY = obj.y + BLOCK_SIZE;
               found = true; break;
            }
          }
        }
        if (found) break;
      }
      if (!found) currentY = s.player.gravityDir === 1 ? 360 : 0;
      s.player.y = currentY;
      onSurfaceRef.current = true;
      spiderTeleportLine.current = { x: s.player.x + PLAYER_SIZE / 2, y1: oldY + PLAYER_SIZE / 2, y2: currentY + PLAYER_SIZE / 2, alpha: 1.0 };
      triggerShake(6);
    }
  }, [isPausedExternal, isLocalPaused, level, countdown, triggerShake]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') togglePause();
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        if (!isJumpButtonPressed.current) triggerInteraction();
        isJumpButtonPressed.current = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') isJumpButtonPressed.current = false;
    };
    const handleMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      if (!isJumpButtonPressed.current) triggerInteraction();
      isJumpButtonPressed.current = true;
    };
    const handleMouseUp = () => isJumpButtonPressed.current = false;

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      if (bgmLoopRef.current) cancelAnimationFrame(bgmLoopRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [triggerInteraction, togglePause]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // We calculate this once, assuming static level length.
    const lastObjX = level.objects.reduce((max, obj) => Math.max(max, obj.x), 0);
    const winX = Math.max(MIN_WIN_DISTANCE, lastObjX + 1000);

    const update = () => {
      if (isPausedExternal || isLocalPaused || countdown !== null) return;
      const s = stateRef.current;
      s.frame++;
      
      // Screen shake decay
      if (screenShake.current > 0) screenShake.current *= 0.9;
      
      if (spiderTeleportLine.current) {
        spiderTeleportLine.current.alpha -= 0.1;
        if (spiderTeleportLine.current.alpha <= 0) spiderTeleportLine.current = null;
      }

      jumpParticlesRef.current = jumpParticlesRef.current
          .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, life: p.life - 0.05 }))
          .filter(p => p.life > 0);

      const decayBase = 0.04 * (settings.speed / 5);
      portalAnimsRef.current = portalAnimsRef.current
          .map(a => ({ ...a, life: a.life - decayBase }))
          .filter(a => a.life > 0);

      if (portalFlashRef.current) {
        portalFlashRef.current.life -= 0.1;
        if (portalFlashRef.current.life <= 0) portalFlashRef.current = null;
      }

      const now = Date.now();
      const elapsed = (now - startTimeRef.current - totalPauseDurationRef.current) / 1000;
      setElapsedTime(elapsed);

      if (s.player.isDead) return;

      const prevX = s.player.x;
      const prevY = s.player.y;

      const steps = Math.max(1, Math.ceil(settings.speed / 4));
      const stepX = settings.speed / steps;
      
      let frameVy = s.player.vy;
      if (s.player.mode === 'CUBE' || s.player.mode === 'ROBOT' || s.player.mode === 'SPIDER') {
        if (s.player.mode === 'ROBOT' && isJumpButtonPressed.current && robotJumpFrames.current > 0 && robotJumpFrames.current < ROBOT_MAX_JUMP_FRAMES) {
          frameVy += ROBOT_JUMP_SUSTAIN * s.player.gravityDir;
          robotJumpFrames.current++;
        } else {
          robotJumpFrames.current = 0;
        }
        frameVy += GRAVITY * s.player.gravityDir;
      } else if (s.player.mode === 'SHIP' || s.player.mode === 'SWING' || s.player.mode === 'JETPACK') {
        if (s.player.mode === 'SHIP') frameVy += SHIP_GRAVITY + (isJumpButtonPressed.current ? SHIP_THRUST : 0);
        else if (s.player.mode === 'JETPACK') frameVy += JETPACK_GRAVITY + (isJumpButtonPressed.current ? JETPACK_THRUST : 0);
        else frameVy += SWING_GRAVITY * s.player.gravityDir;
      } else if (s.player.mode === 'BALL') {
        frameVy += BALL_GRAVITY * s.player.gravityDir;
      } else if (s.player.mode === 'UFO') {
        frameVy += UFO_GRAVITY;
      } else if (s.player.mode === 'WAVE') {
        frameVy = isJumpButtonPressed.current ? -WAVE_SPEED_Y : WAVE_SPEED_Y;
      }

      if (frameVy > MAX_VY) frameVy = MAX_VY;
      if (frameVy < -MAX_VY) frameVy = -MAX_VY;

      s.player.vy = frameVy;
      const stepY = (s.player.vy) / steps;

      for (let st = 0; st < steps; st++) {
        if (s.player.isDead) break;
        
        const internalPrevY = s.player.y;
        
        s.player.x += stepX;
        s.player.y += stepY;

        if (s.player.mode === 'CUBE') {
          if (s.player.isJumping) s.player.rotation += (0.15 / steps) * s.player.gravityDir;
          else {
            const targetRotation = Math.round(s.player.rotation / (Math.PI/2)) * (Math.PI/2);
            s.player.rotation += (targetRotation - s.player.rotation) * 0.2;
          }
        } else if (s.player.mode === 'SHIP' || s.player.mode === 'SWING' || s.player.mode === 'JETPACK' || s.player.mode === 'UFO') {
          const targetRot = Math.atan2(s.player.vy, settings.speed * (s.player.mode === 'UFO' ? 2 : 1.8));
          s.player.rotation += (targetRot - s.player.rotation) * 0.2;
        } else if (s.player.mode === 'BALL') {
          s.player.rotation += (0.2 / steps) * s.player.gravityDir;
        } else if (s.player.mode === 'WAVE') {
          s.player.rotation = isJumpButtonPressed.current ? -Math.PI / 4 : Math.PI / 4;
        }

        if (s.player.y >= 360) { s.player.y = 360; s.player.vy = 0; s.player.isJumping = false; onSurfaceRef.current = true; }
        else if (s.player.y <= 0) { s.player.y = 0; s.player.vy = 0; s.player.isJumping = false; onSurfaceRef.current = true; }

        const phX = s.player.x + 4, phY = s.player.y + 4, phW = PLAYER_SIZE - 8, phH = PLAYER_SIZE - 8;
        
        // Optimised Collision Detection using Spatial Index
        collisionBufferRef.current = [];
        const pChunk = Math.floor(s.player.x / CHUNK_SIZE);
        // We gather objects from player's chunk and adjacent ones
        for(let c = pChunk - 1; c <= pChunk + 2; c++) {
            const chunk = chunksRef.current.get(c);
            if(chunk) {
                // Manually pushing is faster than spread for very large arrays, 
                // but for chunk sizes it's negligible. Spread is cleaner.
                for (let k = 0; k < chunk.length; k++) collisionBufferRef.current.push(chunk[k]);
            }
        }
        
        for (const obj of collisionBufferRef.current) {
          // Additional bounds check still useful for diagonal objects or edges
          // but spatial partition does heavy lifting.

          if (obj.type === ObjectType.SPIKE) {
            const shrink = 8;
            const x1 = obj.x + shrink, y1 = obj.y + BLOCK_SIZE - 2;
            const x2 = obj.x + BLOCK_SIZE / 2, y2 = obj.y + shrink;
            const x3 = obj.x + BLOCK_SIZE - shrink, y3 = obj.y + BLOCK_SIZE - 2;
            const corners = [[phX, phY], [phX + phW, phY], [phX, phY + phH], [phX + phW, phY + phH]];
            if (corners.some(([cx, cy]) => pointInTriangle(cx, cy, x1, y1, x2, y2, x3, y3))) {
              s.player.isDead = true; 
              triggerShake(22, false); 
              playSound('death'); 
              setTimeout(() => onGameOver(), 800); 
              break;
            }
          } else if (obj.type === ObjectType.BLOCK) {
            if (s.player.x < obj.x + BLOCK_SIZE && s.player.x + PLAYER_SIZE > obj.x && s.player.y < obj.y + BLOCK_SIZE && s.player.y + PLAYER_SIZE > obj.y) {
              if (s.player.mode === 'WAVE') { 
                s.player.isDead = true; 
                triggerShake(22, false); 
                playSound('death'); 
                setTimeout(() => onGameOver(), 800); 
                break; 
              }
              const tolerance = 12;
              const wasAbove = (internalPrevY + PLAYER_SIZE) <= obj.y + tolerance; 
              const wasBelow = internalPrevY >= obj.y + BLOCK_SIZE - tolerance;
              if (wasAbove && s.player.vy * s.player.gravityDir >= 0 && s.player.gravityDir === 1) {
                s.player.y = obj.y - PLAYER_SIZE; s.player.vy = 0; s.player.isJumping = false; onSurfaceRef.current = true;
              } else if (wasBelow && s.player.vy * s.player.gravityDir >= 0 && s.player.gravityDir === -1) {
                s.player.y = obj.y + BLOCK_SIZE; s.player.vy = 0; s.player.isJumping = false; onSurfaceRef.current = true;
              } else {
                s.player.isDead = true; 
                triggerShake(22, false); 
                playSound('death'); 
                setTimeout(() => onGameOver(), 800); 
                break;
              }
            }
          } else if (obj.type.startsWith('PORTAL_')) {
              const portalCollisionHeight = 150;
              const portalY = obj.y + BLOCK_SIZE/2 - portalCollisionHeight/2;
              if (s.player.x < obj.x + BLOCK_SIZE && s.player.x + PLAYER_SIZE > obj.x && s.player.y < portalY + portalCollisionHeight && s.player.y + PLAYER_SIZE > portalY) {
                  if (prevX + PLAYER_SIZE <= obj.x + 15) {
                     const prevMode = s.player.mode;
                     if (obj.type === ObjectType.PORTAL_SHIP) s.player.mode = 'SHIP';
                     else if (obj.type === ObjectType.PORTAL_BALL) s.player.mode = 'BALL';
                     else if (obj.type === ObjectType.PORTAL_UFO) s.player.mode = 'UFO';
                     else if (obj.type === ObjectType.PORTAL_WAVE) s.player.mode = 'WAVE';
                     else if (obj.type === ObjectType.PORTAL_ROBOT) s.player.mode = 'ROBOT';
                     else if (obj.type === ObjectType.PORTAL_SPIDER) s.player.mode = 'SPIDER';
                     else if (obj.type === ObjectType.PORTAL_SWING) s.player.mode = 'SWING';
                     else if (obj.type === ObjectType.PORTAL_JETPACK) s.player.mode = 'JETPACK';
                     else if (obj.type === ObjectType.PORTAL_CUBE) s.player.mode = 'CUBE';
                     
                     if (prevMode !== s.player.mode) { 
                         s.player.gravityDir = 1; 
                         playSound('portal');
                         triggerShake(12, true); 
                         portalFlashRef.current = { hue: getPortalHue(obj.type), life: 1.0 };
                         portalAnimsRef.current.push({
                             x: obj.x + BLOCK_SIZE / 2,
                             y: obj.y + BLOCK_SIZE / 2,
                             hue: getPortalHue(obj.type),
                             life: 1.0
                         });
                     }
                  }
              }
          }
        }
      }

      s.cameraX = s.player.x - 150;
      setCompletion(Math.min(100, (s.player.x / winX) * 100));

      if (isJumpButtonPressed.current && onSurfaceRef.current && !actionBufferActive.current) {
        triggerInteraction(true);
        actionBufferActive.current = true;
      } else if (!onSurfaceRef.current) {
        actionBufferActive.current = false;
      }

      trailRef.current.unshift({ x: s.player.x, y: s.player.y, rotation: s.player.rotation, mode: s.player.mode });
      if (trailRef.current.length > TRAIL_LENGTH) trailRef.current.pop();

      if (s.player.x > winX) onWin();
    };

    const drawPlayer = (ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, mode: PlayerMode, alpha: number, color: string) => {
        ctx.save();
        ctx.translate(x + PLAYER_SIZE / 2, y + PLAYER_SIZE / 2);
        ctx.rotate(rot);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        
        if (mode === 'CUBE') {
            ctx.fillRect(-PLAYER_SIZE/2, -PLAYER_SIZE/2, PLAYER_SIZE, PLAYER_SIZE);
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(-PLAYER_SIZE/2 + 4, -PLAYER_SIZE/2 + 4, PLAYER_SIZE-8, PLAYER_SIZE-8);
        } else if (mode === 'SHIP') {
            ctx.beginPath(); ctx.moveTo(PLAYER_SIZE/2 + 10, 0); ctx.lineTo(-PLAYER_SIZE/2, -PLAYER_SIZE/2); ctx.lineTo(-PLAYER_SIZE/4, 0); ctx.lineTo(-PLAYER_SIZE/2, PLAYER_SIZE/2); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(4, -2, 4, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        } else if (mode === 'BALL') {
            ctx.beginPath(); ctx.arc(0, 0, PLAYER_SIZE/2, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
            ctx.beginPath(); for(let i=0; i<4; i++) { ctx.rotate(Math.PI/2); ctx.moveTo(0,0); ctx.lineTo(PLAYER_SIZE/2, 0); } ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI*2); ctx.fill();
        } else if (mode === 'UFO') {
            ctx.beginPath(); ctx.arc(0, -5, 12, Math.PI, 0); ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.stroke();
            ctx.beginPath(); ctx.ellipse(0, 5, 20, 8, 0, 0, Math.PI*2); ctx.fillStyle = color; ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.ellipse(0, 10, 8, 3, 0, 0, Math.PI*2); ctx.fillStyle = '#fff'; ctx.fill();
        } else if (mode === 'WAVE') {
            ctx.beginPath(); ctx.moveTo(PLAYER_SIZE/2 + 5, 0); ctx.lineTo(-PLAYER_SIZE/2, -PLAYER_SIZE/2); ctx.lineTo(-PLAYER_SIZE/4, 0); ctx.lineTo(-PLAYER_SIZE/2, PLAYER_SIZE/2); ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-2,-5); ctx.lineTo(8,0); ctx.lineTo(-2,5); ctx.closePath(); ctx.fill();
        } else if (mode === 'ROBOT') {
            const walkCycle = onSurfaceRef.current ? Math.sin(stateRef.current.frame * 0.2) * 8 : 0;
            ctx.fillStyle = color; ctx.fillRect(-12, -18, 24, 20); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(-12, -18, 24, 20);
            ctx.fillStyle = '#fff'; ctx.fillRect(4, -14, 6, 4);
            ctx.strokeStyle = color; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(-6, 2); ctx.lineTo(-8 + walkCycle, 16); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(6, 2); ctx.lineTo(8 - walkCycle, 16); ctx.stroke();
        } else if (mode === 'SPIDER') {
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.ellipse(0, 0, 14, 10, 0, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
            ctx.beginPath(); ctx.arc(12, 0, 6, 0, Math.PI*2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(14, -2, 2, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = color; ctx.lineWidth = 4;
            for(let i=0; i<4; i++) {
                const angle = (i/4) * Math.PI * 2 + (stateRef.current.frame * 0.1);
                ctx.beginPath(); ctx.moveTo(Math.cos(angle)*5, Math.sin(angle)*5); ctx.lineTo(Math.cos(angle)*20, Math.sin(angle)*20); ctx.stroke();
            }
        } else if (mode === 'SWING') {
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
            ctx.beginPath(); ctx.arc(0, -18, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.arc(0, 18, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, -18); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, 18); ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
        } else if (mode === 'JETPACK') {
            ctx.fillRect(-10, -10, 20, 20);
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(-10, -10, 20, 20);
            ctx.fillStyle = '#555'; ctx.fillRect(-18, -12, 12, 24); ctx.strokeStyle = '#000'; ctx.strokeRect(-18, -12, 12, 24);
            if (isJumpButtonPressed.current) {
                ctx.fillStyle = '#ff5500'; ctx.beginPath(); ctx.moveTo(-15, 12); ctx.lineTo(-12, 22 + Math.sin(stateRef.current.frame) * 4); ctx.lineTo(-9, 12); ctx.fill();
            }
        }
        ctx.restore();
    };

    const draw = () => {
      ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      const s = stateRef.current;
      const pulse = Math.sin(s.frame * 0.1);
      
      ctx.save();
      if (screenShake.current > 0.1) {
        ctx.translate((Math.random() - 0.5) * screenShake.current, (Math.random() - 0.5) * screenShake.current);
      }

      ctx.fillStyle = '#030303'; 
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      
      if (settings.speed > 7 && !s.player.isDead) {
        ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
          const x = (s.frame * 15 + i * 200) % (GAME_WIDTH + 100) - 50;
          const y = (i * 100 + s.frame) % GAME_HEIGHT;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 100, y); ctx.stroke();
        }
      }

      ctx.save(); 
      ctx.translate(-s.cameraX * 0.5 % 80, 0); 
      ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
      for (let x = 0; x <= GAME_WIDTH + 160; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 400); ctx.stroke(); }
      for (let y = 0; y <= 400; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(GAME_WIDTH + 160, y); ctx.stroke(); }
      ctx.restore();

      ctx.fillStyle = '#010101'; ctx.fillRect(0, 400, GAME_WIDTH, 50);
      ctx.strokeStyle = settings.primaryColor; ctx.lineWidth = 3; ctx.shadowBlur = 15 + pulse * 8; ctx.shadowColor = settings.primaryColor;
      ctx.beginPath(); ctx.moveTo(0, 400); ctx.lineTo(GAME_WIDTH, 400); ctx.stroke(); 
      ctx.shadowBlur = 0;

      ctx.save(); ctx.translate(-s.cameraX, 0);
      
      jumpParticlesRef.current.forEach(p => {
        ctx.save(); ctx.globalAlpha = p.life; ctx.fillStyle = '#fff'; ctx.fillRect(p.x, p.y, 3, 3); ctx.restore();
      });

      if (spiderTeleportLine.current) {
        ctx.save(); ctx.strokeStyle = `hsla(330, 100%, 70%, ${spiderTeleportLine.current.alpha})`; ctx.lineWidth = 4; ctx.shadowBlur = 10; ctx.shadowColor = '#ff69b4'; ctx.beginPath(); ctx.moveTo(spiderTeleportLine.current.x, spiderTeleportLine.current.y1); ctx.lineTo(spiderTeleportLine.current.x, spiderTeleportLine.current.y2); ctx.stroke(); ctx.restore();
      }

      portalAnimsRef.current.forEach(anim => {
          const progress = 1 - anim.life;
          const speedFactor = settings.speed / 5;
          const radius = progress * (160 * speedFactor);
          ctx.save();
          ctx.beginPath();
          ctx.strokeStyle = `hsla(${anim.hue}, 100%, 70%, ${anim.life})`;
          ctx.lineWidth = (2 + anim.life * 6) * speedFactor;
          ctx.shadowBlur = 20 * anim.life;
          ctx.shadowColor = `hsl(${anim.hue}, 100%, 50%)`;
          ctx.arc(anim.x, anim.y, radius, 0, Math.PI * 2);
          ctx.stroke();
          
          if (progress > 0.2) {
              ctx.beginPath();
              ctx.strokeStyle = `hsla(${anim.hue}, 100%, 70%, ${anim.life * 0.5})`;
              ctx.arc(anim.x, anim.y, radius * 0.7, 0, Math.PI * 2);
              ctx.stroke();
          }
          ctx.restore();
      });

      // Render Optimisation using Spatial Index
      drawBufferRef.current = [];
      const startC = Math.floor((s.cameraX - 100) / CHUNK_SIZE);
      const endC = Math.floor((s.cameraX + GAME_WIDTH + 100) / CHUNK_SIZE);

      for(let c = startC; c <= endC; c++) {
          const objs = chunksRef.current.get(c);
          if(objs) for(let k=0; k<objs.length; k++) drawBufferRef.current.push(objs[k]);
      }
      // Sort visible objects by z-index for correct layering
      drawBufferRef.current.sort((a, b) => (a.z || 0) - (b.z || 0));

      drawBufferRef.current.forEach(obj => {
        // Redundant X check removed as partitioning handles visibility
        if (obj.type === ObjectType.BLOCK) {
          ctx.fillStyle = 'rgba(26, 26, 26, 0.8)'; ctx.strokeStyle = settings.primaryColor; ctx.lineWidth = 1; ctx.fillRect(obj.x, obj.y, BLOCK_SIZE, BLOCK_SIZE); ctx.strokeRect(obj.x, obj.y, BLOCK_SIZE, BLOCK_SIZE);
        } else if (obj.type === ObjectType.SPIKE) {
          ctx.fillStyle = '#ff3333'; ctx.beginPath(); ctx.moveTo(obj.x+6, obj.y+BLOCK_SIZE-2); ctx.lineTo(obj.x+BLOCK_SIZE/2, obj.y+6); ctx.lineTo(obj.x+BLOCK_SIZE-6, obj.y+BLOCK_SIZE-2); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1; ctx.stroke();
        } else if (obj.type.startsWith('PORTAL_')) {
            ctx.save();
            let hue = getPortalHue(obj.type);
            const speedPulse = (settings.speed / 5);
            const animFactor = s.frame * 0.08 * speedPulse;
            const p = Math.sin(animFactor);
            
            ctx.translate(obj.x + BLOCK_SIZE/2, obj.y + BLOCK_SIZE/2);
            
            ctx.shadowBlur = (20 + p * 12) * speedPulse;
            ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;
            
            for (let i = 0; i < 3; i++) {
                ctx.save();
                ctx.rotate(animFactor * (i + 1) * 0.2);
                const ringScale = 1 + (i * 0.1);
                ctx.lineWidth = (2 + i + p * 2) * speedPulse;
                ctx.strokeStyle = `hsla(${hue}, 100%, ${50 + i * 15}%, ${0.6 - i * 0.15})`;
                ctx.beginPath();
                ctx.ellipse(0, 0, (14 + p * 3) * ringScale, (44 + p * 2) * ringScale, 0, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }

            ctx.lineWidth = (4 + p * 2) * speedPulse;
            ctx.strokeStyle = `hsl(${hue}, 100%, 50%)`;
            ctx.beginPath();
            ctx.ellipse(0, 0, 15 + p * 4, 45 + p * 2, 0, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = `hsla(${hue}, 100%, 70%, 0.4)`;
            for (let i = 0; i < 4; i++) {
                const particleY = ((s.frame * 2 + i * 30) % 80) - 40;
                const particleX = Math.sin(s.frame * 0.2 + i) * 8;
                const size = Math.max(0, 1 + Math.sin(s.frame * 0.1 + i) * 1.5);
                ctx.beginPath();
                ctx.arc(particleX, particleY, size * speedPulse, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
      });
      if (!s.player.isDead) {
        trailRef.current.forEach((t, i) => {
          const alphaScale = Math.pow(1 - i / TRAIL_LENGTH, 1.5) * 0.4;
          drawPlayer(ctx, t.x, t.y, t.rotation, t.mode, alphaScale, settings.secondaryColor);
        });
        ctx.shadowBlur = 25; ctx.shadowColor = settings.secondaryColor; drawPlayer(ctx, s.player.x, s.player.y, s.player.rotation, s.player.mode, 1, settings.secondaryColor); ctx.shadowBlur = 0;
      }
      ctx.restore();

      if (portalFlashRef.current) {
        ctx.save();
        ctx.globalAlpha = portalFlashRef.current.life * 0.15;
        ctx.fillStyle = `hsl(${portalFlashRef.current.hue}, 100%, 60%)`;
        ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
        ctx.restore();
      }
      
      ctx.restore(); 
    };
    const loop = () => { update(); draw(); frameId.current = requestAnimationFrame(loop); };
    loop();
    return () => { if (frameId.current) cancelAnimationFrame(frameId.current); };
  }, [level, onGameOver, onWin, isPausedExternal, isLocalPaused, triggerInteraction, settings, countdown, triggerShake]);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-black overflow-hidden select-none">
      <div className="absolute top-0 left-0 w-full h-1 bg-white/5 z-[60]">
         <div className="h-full transition-all duration-300 shadow-[0_0_15px_rgba(255,255,255,0.4)]" style={{ width: `${completion}%`, backgroundColor: settings.primaryColor }} />
      </div>
      <div className="absolute top-6 left-6 right-6 flex justify-between items-start z-[50] pointer-events-none">
        <div className="flex flex-col gap-3">
            <div className="glass px-4 py-2 rounded-2xl flex items-center gap-3">
                <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: settings.primaryColor }} />
                <span className="text-white font-orbitron text-xs font-bold tracking-[0.2em]">{level.name.toUpperCase()}</span>
            </div>
        </div>
        <div className="flex flex-col items-end gap-1">
            <span className="text-white font-orbitron text-2xl font-black drop-shadow-md animate-pulse">{completion.toFixed(1)}%</span>
            <span className="text-white/40 font-mono text-[10px] tracking-widest">{elapsedTime.toFixed(2)}s</span>
        </div>
      </div>
      <canvas ref={canvasRef} width={GAME_WIDTH} height={GAME_HEIGHT} className="rounded-sm border border-white/5" />
      {countdown !== null && (
        <div className="absolute inset-0 flex items-center justify-center z-[150] bg-black/40 backdrop-blur-sm pointer-events-none">
          <span className="text-9xl font-orbitron font-black text-white animate-in zoom-in duration-300 drop-shadow-[0_0_30px_rgba(255,255,255,0.5)]">{countdown}</span>
        </div>
      )}
      {isLocalPaused && countdown === null && (
        <div className="absolute inset-0 z-[120] bg-black/70 backdrop-blur-md flex flex-col items-center justify-center p-12">
           <h2 className="text-7xl font-orbitron font-black mb-12 tracking-tighter">PAUSED</h2>
           <div className="flex flex-col gap-6 w-full max-w-xs">
              <button onClick={togglePause} className="py-6 bg-white text-black font-black rounded-full text-xl shadow-[0_0_40px_rgba(255,255,255,0.2)] hover:scale-105 active:scale-95 transition-all">RESUME</button>
              <button onClick={onRestart} className="py-4 glass text-white/60 font-bold rounded-full hover:text-white transition-all active:scale-95">RESTART SEQUENCE</button>
              <button onClick={onQuit} className="py-4 text-white/20 hover:text-red-400 font-bold transition-all active:scale-95 text-xs tracking-widest uppercase">ABORT MISSION</button>
           </div>
        </div>
      )}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none opacity-40">
        <span className="text-white/30 font-orbitron text-[10px] uppercase tracking-[0.5em]">{level.difficulty} THREAT DETECTED</span>
      </div>
    </div>
  );
};

export default GameCanvas;
