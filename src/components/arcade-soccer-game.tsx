"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import * as THREE from "three";
import { Play, Settings } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase";

type MatchState = "menu" | "playing" | "ended";
type TeamId = "home" | "away";
type PlayerRole = "field" | "keeper";
type PlayerLine = "keeper" | "defender" | "midfielder" | "forward";
type PlayPhase = "open" | "goal" | "halftime" | "kickoff" | "throw-in" | "goal-kick" | "corner";
type BoundaryRestartPhase = Extract<PlayPhase, "throw-in" | "goal-kick" | "corner">;
type AiSkillMove = "shot-fake" | "body-feint" | "quick-turn" | "dribble-burst" | "fake-pass" | null;
type DefensivePressureRole = "press" | "cover" | "shape";
type DefensiveTacticalRole = DefensivePressureRole
  | "mark-striker"
  | "mark-runner"
  | "block-lane"
  | "midfield-screen"
  | "wide-cover"
  | "far-post-cover"
  | "depth-cover";
type DefensiveDangerPhase = "NORMAL_BLOCK" | "DEEP_BLOCK" | "EMERGENCY_GOAL_DEFENSE";
type FirstTouchType = "foot" | "thigh" | "chest";

type DefensiveTeamPlan = {
  defendingTeam: TeamId;
  carrierId: string;
  dangerPhase: DefensiveDangerPhase;
  primaryPresserId: string | null;
  secondaryCoverId: string | null;
  deepestThreatId: string | null;
  deepestMarkerId: string | null;
  roles: Map<string, DefensiveTacticalRole>;
  targets: Map<string, THREE.Vector3>;
  markedOpponentIds: Map<string, string>;
};

type PlayerBody = {
  id: string;
  team: TeamId;
  role: PlayerRole;
  line: PlayerLine;
  number: number;
  formationSlot: string;
  home: THREE.Vector3;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  mesh: THREE.Group;
  controlMarker: THREE.Object3D | null;
  aimArrow: THREE.Object3D | null;
  parts: PlayerAnimationParts;
  heading: number;
  turnRate: number;
  stamina: number;
  runPhase: number;
  animationSpeed: number;
  kickTimer: number;
  actionCooldown: number;
  tackleTimer: number;
  tackleCooldown: number;
  recoveryTimer: number;
  catchTimer: number;
  diveTimer: number;
  diveSide: number;
  headerTimer: number;
  firstTouchTimer: number;
  firstTouchType: FirstTouchType | null;
  blockTimer: number;
  passRequestTimer: number;
  celebrateTimer: number;
  yellowCards: number;
  sentOff: boolean;
  decisionCooldown: number;
  carryTimer: number;
  stuckTimer: number;
  contactLockTimer: number;
  fallbackTimer: number;
  fallbackTarget: THREE.Vector3;
  lastPos: THREE.Vector3;
  supportRunTimer: number;
  supportRunTarget: THREE.Vector3;
  skillTimer: number;
  skillCooldown: number;
  skillSide: number;
  skillMove: AiSkillMove;
  aiInputCache: PlayerInputState;
  aiInputTimer: number;
  forcedMoveTarget: THREE.Vector3;
  forcedMoveTimer: number;
  forcedMoveSprint: boolean;
  ballContactCooldown: number;
  challengeCommitTimer: number;
  controlledBy?: "p1";
};

type PlayerAnimationParts = {
  bodyRoot: THREE.Object3D | null;
  leftLeg: THREE.Object3D | null;
  rightLeg: THREE.Object3D | null;
  leftKnee: THREE.Object3D | null;
  rightKnee: THREE.Object3D | null;
  leftArm: THREE.Object3D | null;
  rightArm: THREE.Object3D | null;
  leftElbow: THREE.Object3D | null;
  rightElbow: THREE.Object3D | null;
};

type BallState = "loose" | "possessed" | "kicked";
type KickStyle = "short" | "long" | "through" | "low-through" | "shot" | "driven" | "finesse" | "chip";

type PlayerInputState = {
  dir: THREE.Vector3;
  sprint: boolean;
  speedScale?: number;
};

type VirtualControls = {
  dir: THREE.Vector3;
  strength: number;
  sprint: boolean;
};

type MinimapSnapshot = {
  ball: { x: number; z: number };
  players: Array<{ id: string; team: TeamId; x: number; z: number; controlled: boolean }>;
};

type ReplayPlayerSnapshot = {
  id: string;
  x: number;
  z: number;
  heading: number;
  runPhase: number;
  kickTimer: number;
  catchTimer: number;
  diveTimer: number;
  diveSide: number;
};

type ReplayFrame = {
  ball: { x: number; y: number; z: number };
  players: ReplayPlayerSnapshot[];
};

type GameSessionAnalytics = {
  id: string | null;
  startedAt: number;
  startedScore: { home: number; away: number };
};

type FormationKey = "4-2-3-1" | "4-3-3" | "4-4-2" | "3-5-2";

type OfflineSettings = {
  formation: Extract<FormationKey, "4-3-3" | "4-4-2">;
  homeColor: string;
};

type FormationSlot = {
  slot: string;
  label: string;
  line: PlayerLine;
  x: number;
  z: number;
  defaultNumber: number;
};

type MatchRuntime = {
  engineId: number;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  cameraLookAt: THREE.Vector3;
  ball: THREE.Group;
  ballShadow: THREE.Mesh;
  players: PlayerBody[];
  frame: number;
  frameRunning: boolean;
  matchTick: number | null;
  frameCount: number;
  lastTime: number;
  lastRenderTime: number;
  lastMatchUpdate: number;
  lastClockAdvanceTime: number;
  lastHudUpdate: number;
  state: MatchState;
  phase: PlayPhase;
  phaseTimer: number;
  restartTeam: TeamId;
  restartSpot: THREE.Vector3;
  restartDirection: THREE.Vector3;
  restartActorId: string | null;
  half: 1 | 2;
  gameClock: number;
  halftimeDone: boolean;
  eventText: string;
  eventTimer: number;
  ballPos: THREE.Vector3;
  ballVel: THREE.Vector3;
  ballCurve: THREE.Vector3;
  score: { home: number; away: number };
  possessionTime: { home: number; away: number };
  cooldown: number;
  possession: TeamId | null;
  ballState: BallState;
  ballOwnerId: string | null;
  intendedReceiverId: string | null;
  manualPassReceiverId: string | null;
  ballIgnorePlayerId: string | null;
  ballIgnoreTimer: number;
  looseContactPlayerId: string | null;
  looseContactCooldownTimer: number;
  receptionLockPlayerId: string | null;
  receptionLockTimer: number;
  possessionStableOwnerId: string | null;
  possessionStabilityTimer: number;
  defensivePlan: DefensiveTeamPlan | null;
  defensivePlanTimer: number;
  defensivePlanGraceTimer: number;
  antiSwarmCorrections: number;
  collisionResolutionsThisFrame: number;
  maxCollisionCorrection: number;
  maxDefenderFrameDisplacement: number;
  abnormalMovementClamps: number;
  pendingKickTarget: THREE.Vector3 | null;
  lastShotTap: number;
  shotCharge: number;
  shotChargingPlayerId: string | null;
  passCharge: number;
  passChargingPlayerId: string | null;
  shotConsumed: boolean;
  tackleLockTimer: number;
  audio: AudioContext | null;
  activeAudioSources: Set<AudioScheduledSourceNode>;
  scheduledTimeouts: Set<number>;
  lastKickSound: number;
  lastCheerSound: number;
  lastTouchTeam: TeamId;
  lastTouchPlayerId: string | null;
  restartProtectionTeam: TeamId | null;
  restartProtectionTimer: number;
  goalKickLockPlayerId: string | null;
  goalKickLockTimer: number;
  goalKickReleaseTimer: number;
  goalKickPendingVelocity: THREE.Vector3;
  goalKickPendingReceiverId: string | null;
  restartBoundaryGuardTimer: number;
  pendingRestartPhase: BoundaryRestartPhase | null;
  pendingRestartTeam: TeamId;
  pendingRestartSpot: THREE.Vector3;
  pendingRestartLabel: string;
  pendingRestartTimer: number;
  p1IdleTimer: number;
  p1Autopilot: boolean;
  lastManualAim: THREE.Vector3;
  lastManualAimTimer: number;
  perfElement: HTMLDivElement | null;
  perfFrames: number;
  perfFrameTotal: number;
  perfLastReport: number;
  replayTimer: number;
  replayBallStart: THREE.Vector3;
  replayBallEnd: THREE.Vector3;
  replayCameraPosition: THREE.Vector3;
  replayCameraLookAt: THREE.Vector3;
  replayTrail: THREE.Vector3[];
  replayFrames: ReplayFrame[];
  restartCount: number;
  visibilityPauseCount: number;
};

const FIELD_SCALE = 1.5;
const FIELD_W = 64 * FIELD_SCALE;
const FIELD_L = 96 * FIELD_SCALE;
const FORMATION_SCALE = 1.42;
const GOAL_W = 16;
const PLAYER_RADIUS = 1.08;
const BALL_RADIUS = 0.36;
const CLOCK_SPEED = 18;
const HALF_TIME_SECONDS = 45 * 60;
const FULL_TIME_SECONDS = 90 * 60;
const BALL_MAX_SPEED = 68;
const BALL_ROLLING_FRICTION = 0.78;
const BALL_STOP_SPEED = 0.035;
const BALL_GRAVITY = 18;
const BALL_BOUNCE = 0.42;
const PERSONAL_SPACE = 1.75;
const DRIBBLE_DISTANCE = PLAYER_RADIUS + BALL_RADIUS + 0.06;
const CONTROL_TOUCH_DISTANCE = PLAYER_RADIUS + BALL_RADIUS + 0.26;
const ACTION_COOLDOWN = 0.22;
const TOUCHLINE_MARGIN = 4.6;
const OUT_OF_PLAY_DELAY = 1.75;
const FIELD_PLAYER_BALL_RADIUS = 0.7;
const GOAL_DEPTH = 4.8;
const GOAL_POST_THICKNESS = 0.34;
const GOAL_POST_CENTER_X = GOAL_W / 2 + GOAL_POST_THICKNESS / 2;
const GOAL_FRAME_OUTER_W = GOAL_W + GOAL_POST_THICKNESS * 2;
const GOAL_FRONT_Z = FIELD_L / 2;
const GOAL_SCORE_Z = GOAL_FRONT_Z + BALL_RADIUS * 0.7;
const GOAL_BACK_Z = GOAL_FRONT_Z + GOAL_DEPTH;
const GOAL_SIDE_POST_INSET = 0.26;
const BROADCAST_CAMERA_X = -FIELD_W / 2 - 34;
const BROADCAST_CAMERA_Y = 52;
const BROADCAST_CAMERA_Z = 8;
const BROADCAST_CAMERA_Z_OFFSET = 10;
const BROADCAST_LOOK_AT_X = 0;
const BROADCAST_LOOK_AT_Y = 1.05;
const BROADCAST_LOOK_AT_Z = 0;
const VISITOR_STORAGE_KEY = "futbol_visitor_id";
const SETTINGS_STORAGE_KEY = "futbol_offline_settings";

const AWAY_COLOR = "#dc2626";
const AWAY_TRIM = "#f8fafc";
const AWAY_SHORTS = "#f8fafc";
const AWAY_KEEPER_COLOR = "#16a34a";

const HOME_KIT = {
  name: "City FC",
  primary: "#38bdf8",
  secondary: "#eff6ff",
  accent: "#0f172a",
  shorts: "#f8fafc",
  socks: "#e0f2fe",
  keeper: "#facc15",
};
const DEFAULT_OFFLINE_SETTINGS: OfflineSettings = {
  formation: "4-3-3",
  homeColor: HOME_KIT.primary,
};
let activeOfflineSettings: OfflineSettings = { ...DEFAULT_OFFLINE_SETTINGS };

const FORMATION_OPTIONS: Record<FormationKey, FormationSlot[]> = {
  "4-3-3": [
    { slot: "GK", label: "GK", line: "keeper", x: 0, z: 44, defaultNumber: 1 },
    { slot: "LB", label: "LB", line: "defender", x: -22, z: 34, defaultNumber: 3 },
    { slot: "LCB", label: "LCB", line: "defender", x: -8, z: 34, defaultNumber: 4 },
    { slot: "RCB", label: "RCB", line: "defender", x: 8, z: 34, defaultNumber: 5 },
    { slot: "RB", label: "RB", line: "defender", x: 22, z: 34, defaultNumber: 2 },
    { slot: "LCM", label: "LCM", line: "midfielder", x: -15, z: 10, defaultNumber: 6 },
    { slot: "CM", label: "CM", line: "midfielder", x: 0, z: 10, defaultNumber: 8 },
    { slot: "RCM", label: "RCM", line: "midfielder", x: 15, z: 10, defaultNumber: 10 },
    { slot: "LW", label: "LW", line: "forward", x: -17, z: -24, defaultNumber: 7 },
    { slot: "ST", label: "ST", line: "forward", x: 0, z: -24, defaultNumber: 9 },
    { slot: "RW", label: "RW", line: "forward", x: 17, z: -24, defaultNumber: 11 },
  ],
  "4-2-3-1": [
    { slot: "GK", label: "GK", line: "keeper", x: 0, z: 44, defaultNumber: 1 },
    { slot: "LB", label: "LB", line: "defender", x: -22, z: 34, defaultNumber: 3 },
    { slot: "LCB", label: "LCB", line: "defender", x: -8, z: 34, defaultNumber: 4 },
    { slot: "RCB", label: "RCB", line: "defender", x: 8, z: 34, defaultNumber: 5 },
    { slot: "RB", label: "RB", line: "defender", x: 22, z: 34, defaultNumber: 2 },
    { slot: "LDM", label: "LDM", line: "midfielder", x: -9, z: 15, defaultNumber: 6 },
    { slot: "RDM", label: "RDM", line: "midfielder", x: 9, z: 15, defaultNumber: 8 },
    { slot: "LAM", label: "LAM", line: "midfielder", x: -18, z: -6, defaultNumber: 7 },
    { slot: "CAM", label: "CAM", line: "midfielder", x: 0, z: -8, defaultNumber: 10 },
    { slot: "RAM", label: "RAM", line: "midfielder", x: 18, z: -6, defaultNumber: 11 },
    { slot: "ST", label: "ST", line: "forward", x: 0, z: -27, defaultNumber: 9 },
  ],
  "4-4-2": [
    { slot: "GK", label: "GK", line: "keeper", x: 0, z: 44, defaultNumber: 1 },
    { slot: "LB", label: "LB", line: "defender", x: -22, z: 34, defaultNumber: 3 },
    { slot: "LCB", label: "LCB", line: "defender", x: -8, z: 34, defaultNumber: 4 },
    { slot: "RCB", label: "RCB", line: "defender", x: 8, z: 34, defaultNumber: 5 },
    { slot: "RB", label: "RB", line: "defender", x: 22, z: 34, defaultNumber: 2 },
    { slot: "LM", label: "LM", line: "midfielder", x: -22, z: 8, defaultNumber: 7 },
    { slot: "LCM", label: "LCM", line: "midfielder", x: -7, z: 10, defaultNumber: 6 },
    { slot: "RCM", label: "RCM", line: "midfielder", x: 7, z: 10, defaultNumber: 8 },
    { slot: "RM", label: "RM", line: "midfielder", x: 22, z: 8, defaultNumber: 11 },
    { slot: "LST", label: "LST", line: "forward", x: -8, z: -24, defaultNumber: 9 },
    { slot: "RST", label: "RST", line: "forward", x: 8, z: -24, defaultNumber: 10 },
  ],
  "3-5-2": [
    { slot: "GK", label: "GK", line: "keeper", x: 0, z: 44, defaultNumber: 1 },
    { slot: "LCB", label: "LCB", line: "defender", x: -14, z: 34, defaultNumber: 4 },
    { slot: "CB", label: "CB", line: "defender", x: 0, z: 36, defaultNumber: 5 },
    { slot: "RCB", label: "RCB", line: "defender", x: 14, z: 34, defaultNumber: 2 },
    { slot: "LWB", label: "LWB", line: "midfielder", x: -25, z: 12, defaultNumber: 3 },
    { slot: "LCM", label: "LCM", line: "midfielder", x: -10, z: 10, defaultNumber: 6 },
    { slot: "CM", label: "CM", line: "midfielder", x: 0, z: 5, defaultNumber: 8 },
    { slot: "RCM", label: "RCM", line: "midfielder", x: 10, z: 10, defaultNumber: 10 },
    { slot: "RWB", label: "RWB", line: "midfielder", x: 25, z: 12, defaultNumber: 11 },
    { slot: "LST", label: "LST", line: "forward", x: -8, z: -24, defaultNumber: 7 },
    { slot: "RST", label: "RST", line: "forward", x: 8, z: -24, defaultNumber: 9 },
  ],
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function sanitizeHomeColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_OFFLINE_SETTINGS.homeColor;
}

function normalizeOfflineSettings(value: Partial<OfflineSettings> | null | undefined): OfflineSettings {
  const formation = value?.formation === "4-4-2" ? "4-4-2" : "4-3-3";
  return {
    formation,
    homeColor: sanitizeHomeColor(value?.homeColor ?? DEFAULT_OFFLINE_SETTINGS.homeColor),
  };
}

function loadOfflineSettings() {
  if (typeof window === "undefined") return { ...DEFAULT_OFFLINE_SETTINGS };
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    return normalizeOfflineSettings(raw ? JSON.parse(raw) as Partial<OfflineSettings> : null);
  } catch {
    return { ...DEFAULT_OFFLINE_SETTINGS };
  }
}

function saveOfflineSettings(settings: OfflineSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function minimapPoint(x: number, z: number) {
  return {
    left: clamp(((z + FIELD_L / 2) / FIELD_L) * 100, 3, 97),
    top: clamp(((FIELD_W / 2 - x) / FIELD_W) * 100, 3, 97),
  };
}

function angleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function replayFrame(active: MatchRuntime): ReplayFrame {
  return {
    ball: { x: active.ballPos.x, y: active.ballPos.y, z: active.ballPos.z },
    players: active.players.map((player) => ({
      id: player.id,
      x: player.pos.x,
      z: player.pos.z,
      heading: player.heading,
      runPhase: player.runPhase,
      kickTimer: player.kickTimer,
      catchTimer: player.catchTimer,
      diveTimer: player.diveTimer,
      diveSide: player.diveSide,
    })),
  };
}

function recordReplayFrame(active: MatchRuntime) {
  active.replayFrames.push(replayFrame(active));
  if (active.replayFrames.length > 120) active.replayFrames.shift();
}

function applyReplayFrame(active: MatchRuntime, a: ReplayFrame, b: ReplayFrame, mix: number) {
  active.ballPos.set(
    a.ball.x + (b.ball.x - a.ball.x) * mix,
    a.ball.y + (b.ball.y - a.ball.y) * mix,
    a.ball.z + (b.ball.z - a.ball.z) * mix,
  );
  const nextPlayers = new Map(b.players.map((player) => [player.id, player]));
  a.players.forEach((from) => {
    const player = active.players.find((item) => item.id === from.id);
    const to = nextPlayers.get(from.id);
    if (!player || !to) return;
    player.pos.set(
      from.x + (to.x - from.x) * mix,
      0,
      from.z + (to.z - from.z) * mix,
    );
    player.heading = from.heading + angleDelta(from.heading, to.heading) * mix;
    player.runPhase = from.runPhase + (to.runPhase - from.runPhase) * mix;
    player.kickTimer = Math.max(from.kickTimer, to.kickTimer);
    player.catchTimer = Math.max(from.catchTimer, to.catchTimer);
    player.diveTimer = Math.max(from.diveTimer, to.diveTimer);
    player.diveSide = Math.abs(to.diveSide) > Math.abs(from.diveSide) ? to.diveSide : from.diveSide;
    player.vel.set(0, 0, 0);
    player.mesh.position.copy(player.pos);
    player.mesh.rotation.y = player.heading;
    animatePlayer(player, 1 / 60);
  });
  syncBallVisual(active);
}

function syncBallVisual(active: MatchRuntime) {
  active.ball.position.copy(active.ballPos);
  active.ballShadow.position.set(active.ballPos.x, 0.045, active.ballPos.z);
  const height = Math.max(0, active.ballPos.y - BALL_RADIUS);
  const scale = clamp(1 - height * 0.09, 0.42, 1.18);
  active.ballShadow.scale.setScalar(scale);
}

function headingForHome(z: number) {
  return z >= 0 ? Math.PI : 0;
}

function forwardFromHeading(heading: number) {
  return new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
}

function headingFromDirection(direction: THREE.Vector3) {
  return Math.atan2(direction.x, direction.z);
}

function getAnonymousVisitorId() {
  if (typeof window === "undefined") return null;
  const existing = window.localStorage.getItem(VISITOR_STORAGE_KEY);
  if (existing) return existing;
  const fallback = `visitor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const visitorId = globalThis.crypto?.randomUUID?.() ?? fallback;
  window.localStorage.setItem(VISITOR_STORAGE_KEY, visitorId);
  return visitorId;
}

async function trackVisitorPageView(visitorId: string, path: string) {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  await ensureVisitorRecord(visitorId);
  await supabase.from("page_views").insert({ visitor_id: visitorId, path });
}

async function ensureVisitorRecord(visitorId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("visitors")
    .upsert({ visitor_id: visitorId, last_seen: now }, { onConflict: "visitor_id" });
  if (error) {
    console.warn("Futbol visitor upsert failed", error.message);
    return false;
  }
  const { data, error: verifyError } = await supabase
    .from("visitors")
    .select("visitor_id")
    .eq("visitor_id", visitorId)
    .maybeSingle();
  if (verifyError || !data) {
    console.warn("Futbol visitor verify failed", verifyError?.message ?? "visitor row missing");
    return false;
  }
  return true;
}

async function startAnalyticsSession(visitorId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("game_sessions")
    .insert({ visitor_id: visitorId, started_at: new Date().toISOString(), goals_scored: 0, goals_conceded: 0, duration_seconds: 0 })
    .select("id")
    .single();
  if (error) return null;
  return (data as { id: string }).id;
}

async function finishAnalyticsSession(session: GameSessionAnalytics | null, visitorId: string | null, score: { home: number; away: number }) {
  if (!session?.id || !visitorId) return;
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const durationSeconds = Math.max(1, Math.round((performance.now() - session.startedAt) / 1000));
  await supabase
    .from("game_sessions")
    .update({
      ended_at: new Date().toISOString(),
      goals_scored: Math.max(0, score.home - session.startedScore.home),
      goals_conceded: Math.max(0, score.away - session.startedScore.away),
      duration_seconds: durationSeconds,
    })
    .eq("id", session.id)
    .eq("visitor_id", visitorId);
}

function teamGoalZ(team: TeamId, half: 1 | 2) {
  const firstHalfGoal = team === "home" ? FIELD_L / 2 : -FIELD_L / 2;
  return half === 1 ? firstHalfGoal : -firstHalfGoal;
}

function attackingGoalZ(team: TeamId, half: 1 | 2) {
  return -teamGoalZ(team, half);
}

function upfieldKickDirection(team: TeamId, half: 1 | 2) {
  const z = Math.sign(attackingGoalZ(team, half)) || 1;
  return new THREE.Vector3(0, 0, z);
}

function cornerKickDirection(team: TeamId, half: 1 | 2, spot: THREE.Vector3) {
  const goalZ = attackingGoalZ(team, half);
  return new THREE.Vector3(0, BALL_RADIUS, goalZ - Math.sign(goalZ) * 15)
    .sub(spot)
    .setY(0)
    .normalize();
}

function goalKickKeeperSpot(team: TeamId, half: 1 | 2) {
  const goalZ = teamGoalZ(team, half);
  return new THREE.Vector3(0, 0, goalZ - Math.sign(goalZ) * 5.2);
}

function goalKickRunupSpot(team: TeamId, half: 1 | 2) {
  const direction = upfieldKickDirection(team, half);
  return goalKickKeeperSpot(team, half).sub(direction.multiplyScalar(4.4));
}

function goalKickBallSpotForTeam(team: TeamId, half: 1 | 2) {
  return goalKickKeeperSpot(team, half)
    .add(upfieldKickDirection(team, half).multiplyScalar(1.65))
    .setY(BALL_RADIUS);
}

function goalKickBallSpot(keeper: PlayerBody, direction: THREE.Vector3) {
  return keeper.pos.clone().add(direction.clone().multiplyScalar(1.65)).setY(BALL_RADIUS);
}

function throwInTakerSpot(spot: THREE.Vector3) {
  const side = Math.sign(spot.x || 1);
  return new THREE.Vector3(
    side * (FIELD_W / 2 + PLAYER_RADIUS + 0.32),
    0,
    clamp(spot.z, -FIELD_L / 2 + 2.4, FIELD_L / 2 - 2.4),
  );
}

function lockGoalKickBallOnGround(active: MatchRuntime) {
  active.restartSpot.copy(goalKickBallSpotForTeam(active.restartTeam, active.half));
  active.ballOwnerId = null;
  active.possession = null;
  active.ballState = "loose";
  active.ballPos.copy(active.restartSpot);
  active.ballVel.set(0, 0, 0);
  active.ballCurve.set(0, 0, 0);
  active.renderer.domElement.dataset.goalKickState = "setup-ground";
  active.renderer.domElement.dataset.goalKickBallY = active.ballPos.y.toFixed(3);
  active.renderer.domElement.dataset.goalKickOwner = "";
}

function syncGoalKickBallToKeeper(active: MatchRuntime, keeper: PlayerBody) {
  const direction = upfieldKickDirection(keeper.team, active.half);
  const readySpot = goalKickKeeperSpot(keeper.team, active.half);
  keeper.pos.copy(readySpot);
  keeper.vel.set(0, 0, 0);
  keeper.turnRate = 0;
  keeper.heading = headingFromDirection(direction);
  keeper.mesh.rotation.y = keeper.heading;
  keeper.mesh.position.copy(keeper.pos);
  active.restartDirection.copy(direction);
  lockGoalKickBallOnGround(active);
}

function goalKickContactReady(active: MatchRuntime, keeper: PlayerBody) {
  const direction = upfieldKickDirection(keeper.team, active.half);
  const readySpot = goalKickKeeperSpot(keeper.team, active.half);
  const footSpot = goalKickBallSpot(keeper, direction);
  return keeper.pos.distanceTo(readySpot) < 0.24
    && active.ballPos.distanceTo(footSpot) < 0.24
    && active.restartSpot.distanceTo(footSpot) < 0.24;
}

function prepareGoalKickSetup(active: MatchRuntime, team: TeamId) {
  const direction = upfieldKickDirection(team, active.half);
  const keeper = active.players.find((player) => player.team === team && player.role === "keeper") ?? null;
  active.restartTeam = team;
  active.restartDirection.copy(direction);
  active.restartActorId = keeper?.id ?? null;
  if (keeper) {
    keeper.pos.copy(goalKickRunupSpot(team, active.half));
    keeper.vel.set(0, 0, 0);
    keeper.turnRate = 0;
    keeper.heading = headingFromDirection(direction);
    keeper.mesh.rotation.y = keeper.heading;
    keeper.mesh.position.copy(keeper.pos);
    keeper.diveTimer = 0;
    keeper.diveSide = 0;
    keeper.tackleTimer = 0;
    keeper.recoveryTimer = 0;
    keeper.catchTimer = 0;
    keeper.actionCooldown = 0.25;
    active.restartSpot.copy(goalKickBallSpotForTeam(team, active.half));
    active.goalKickLockPlayerId = null;
  } else {
    active.restartSpot.copy(goalKickBallSpotForTeam(team, active.half));
    active.goalKickLockPlayerId = null;
  }
  active.ballPos.copy(active.restartSpot);
  active.ballVel.set(0, 0, 0);
  active.ballCurve.set(0, 0, 0);
  active.ballIgnorePlayerId = keeper?.id ?? null;
  active.ballIgnoreTimer = keeper ? 0.1 : 0;
  active.goalKickLockTimer = 0;
  active.goalKickReleaseTimer = 0;
  active.goalKickPendingVelocity.set(0, 0, 0);
  active.goalKickPendingReceiverId = null;
  return keeper;
}

function goalKickSlotTarget(player: PlayerBody, kickingTeam: TeamId, half: 1 | 2) {
  const direction = upfieldKickDirection(kickingTeam, half);
  const ownGoalZ = teamGoalZ(kickingTeam, half);
  const dz = direction.z || 1;
  const slot = player.formationSlot;
  const target = new THREE.Vector3(player.home.x, 0, player.home.z);

  if (player.team === kickingTeam) {
    if (player.role === "keeper") return goalKickRunupSpot(kickingTeam, half);

    if (slot === "LCB") target.set(-12, 0, ownGoalZ + dz * 20);
    else if (slot === "RCB") target.set(12, 0, ownGoalZ + dz * 20);
    else if (slot === "CB") target.set(0, 0, ownGoalZ + dz * 23);
    else if (slot === "LB" || slot === "LWB") target.set(-34, 0, ownGoalZ + dz * 31);
    else if (slot === "RB" || slot === "RWB") target.set(34, 0, ownGoalZ + dz * 31);
    else if (slot === "LDM") target.set(-8, 0, ownGoalZ + dz * 34);
    else if (slot === "RDM") target.set(8, 0, ownGoalZ + dz * 34);
    else if (slot === "CM") target.set(0, 0, ownGoalZ + dz * 37);
    else if (slot === "LCM") target.set(-15, 0, ownGoalZ + dz * 43);
    else if (slot === "RCM") target.set(15, 0, ownGoalZ + dz * 43);
    else if (slot === "LM" || slot === "LAM") target.set(-27, 0, ownGoalZ + dz * 50);
    else if (slot === "RM" || slot === "RAM") target.set(27, 0, ownGoalZ + dz * 50);
    else if (slot === "CAM") target.set(0, 0, ownGoalZ + dz * 52);
    else if (slot === "LW") target.set(-38, 0, ownGoalZ + dz * 61);
    else if (slot === "RW") target.set(38, 0, ownGoalZ + dz * 61);
    else if (slot === "LST") target.set(-10, 0, ownGoalZ + dz * 65);
    else if (slot === "RST") target.set(10, 0, ownGoalZ + dz * 65);
    else if (slot === "ST") target.set(0, 0, ownGoalZ + dz * 68);
  } else {
    if (player.role === "keeper") return player.home.clone();
    if (player.line === "forward") {
      const x = slot.startsWith("L") ? -18 : slot.startsWith("R") ? 18 : 0;
      target.set(x, 0, ownGoalZ + dz * 48);
    } else if (player.line === "midfielder") {
      const homeSide = clamp(player.home.x * 0.72, -28, 28);
      target.set(homeSide, 0, ownGoalZ + dz * 60);
    } else {
      const homeSide = clamp(player.home.x * 0.62, -31, 31);
      target.set(homeSide, 0, ownGoalZ + dz * 74);
    }
  }

  target.x = clamp(target.x, -FIELD_W / 2 + 6, FIELD_W / 2 - 6);
  target.z = clamp(target.z, -FIELD_L / 2 + 7, FIELD_L / 2 - 7);
  return target;
}

function createGoalKickSeparation(active: MatchRuntime, kickingTeam: TeamId) {
  const teammates = active.players.filter((player) => player.team === kickingTeam && player.role !== "keeper" && !player.sentOff);
  const opponents = active.players.filter((player) => player.team !== kickingTeam && !player.sentOff);
  teammates.forEach((receiver) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const nearest = opponents
        .map((opponentPlayer) => ({
          opponentPlayer,
          distance: receiver.pos.distanceTo(opponentPlayer.pos),
        }))
        .sort((a, b) => a.distance - b.distance)[0];
      if (!nearest || nearest.distance >= 7.8) break;

      const away = receiver.pos.clone().sub(nearest.opponentPlayer.pos).setY(0);
      if (away.lengthSq() < 0.1) {
        away.set(receiver.pos.x >= 0 ? 1 : -1, 0, 0.35).normalize();
      } else {
        away.normalize();
      }
      const need = 8.4 - nearest.distance;
      receiver.pos.addScaledVector(away, need);
      receiver.pos.x = clamp(receiver.pos.x, -FIELD_W / 2 + 7, FIELD_W / 2 - 7);
      receiver.pos.z = clamp(receiver.pos.z, -FIELD_L / 2 + 8, FIELD_L / 2 - 8);
    }
  });
}

function updateGoalKickShapeDebug(active: MatchRuntime, kickingTeam: TeamId) {
  const keeper = active.players.find((player) => player.team === kickingTeam && player.role === "keeper") ?? null;
  const clearOptions = active.players
    .filter((player) => player.team === kickingTeam && player.role !== "keeper" && !player.sentOff)
    .map((player) => {
      const target = player.pos.clone().setY(BALL_RADIUS);
      return {
        player,
        laneBlockers: keeper ? opponentsBetween(keeper, target, active.players, 4.4) : 0,
        pressure: opponentPressureAtPoint(kickingTeam, target, active.players, 8.2),
        distance: keeper ? keeper.pos.distanceTo(player.pos) : active.restartSpot.distanceTo(player.pos),
      };
    })
    .filter(({ laneBlockers, pressure, distance }) => laneBlockers === 0 && pressure === 0 && distance > 8 && distance < 62);
  const left = clearOptions.filter(({ player }) => player.pos.x < -6).length;
  const center = clearOptions.filter(({ player }) => Math.abs(player.pos.x) <= 10).length;
  const right = clearOptions.filter(({ player }) => player.pos.x > 6).length;
  active.renderer.domElement.dataset.goalKickShapeOptions = String(clearOptions.length);
  active.renderer.domElement.dataset.goalKickShapeLeft = String(left);
  active.renderer.domElement.dataset.goalKickShapeCenter = String(center);
  active.renderer.domElement.dataset.goalKickShapeRight = String(right);
}

function arrangeGoalKickBuildUpShape(active: MatchRuntime, team: TeamId) {
  active.players.forEach((player) => {
    if (player.sentOff) return;
    const target = goalKickSlotTarget(player, team, active.half);
    player.pos.copy(target);
    player.vel.set(0, 0, 0);
    player.turnRate = 0;
    player.heading = player.team === team
      ? headingFromDirection(upfieldKickDirection(team, active.half))
      : headingFromDirection(upfieldKickDirection(opponent(team), active.half));
    player.mesh.rotation.y = player.heading;
    player.mesh.position.copy(player.pos);
    player.lastPos.copy(player.pos);
  });
  createGoalKickSeparation(active, team);
  active.players.forEach((player) => {
    player.mesh.position.copy(player.pos);
    player.lastPos.copy(player.pos);
  });
  updateGoalKickShapeDebug(active, team);
}

function teamSide(team: TeamId, half: 1 | 2) {
  return teamGoalZ(team, half) > 0 ? 1 : -1;
}

function opponent(team: TeamId): TeamId {
  return team === "home" ? "away" : "home";
}

const P1_ACTIVITY_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ShiftLeft",
  "KeyD",
  "KeyE",
  "KeyS",
  "KeyU",
]);

function noteP1Activity(active: MatchRuntime) {
  active.p1IdleTimer = 0;
}

const sharedGeometryCache = new Map<string, THREE.BufferGeometry>();
const sharedMaterialCache = new Map<string, THREE.Material>();
let nextEngineId = 1;

function sharedGeometry(key: string, create: () => THREE.BufferGeometry) {
  const existing = sharedGeometryCache.get(key);
  if (existing) return existing;
  const geometry = create();
  geometry.userData.shared = true;
  sharedGeometryCache.set(key, geometry);
  return geometry;
}

function sharedLambertMaterial(color: string) {
  const key = `lambert:${color}`;
  const existing = sharedMaterialCache.get(key);
  if (existing instanceof THREE.MeshLambertMaterial) return existing;
  const material = new THREE.MeshLambertMaterial({ color });
  material.userData.shared = true;
  sharedMaterialCache.set(key, material);
  return material;
}

function sharedBasicMaterial(color: string) {
  const key = `basic:${color}`;
  const existing = sharedMaterialCache.get(key);
  if (existing instanceof THREE.MeshBasicMaterial) return existing;
  const material = new THREE.MeshBasicMaterial({ color });
  material.userData.shared = true;
  sharedMaterialCache.set(key, material);
  return material;
}

function disposeObjectTree(object: THREE.Object3D) {
  object.traverse((child) => {
    const maybeMesh = child as THREE.Mesh | THREE.Sprite;
    const maybeGeometry = (maybeMesh as THREE.Mesh).geometry;
    if (maybeGeometry && !maybeGeometry.userData.shared) maybeGeometry.dispose();
    const material = maybeMesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) {
      material.forEach((item) => {
        if (!item.userData.shared) item.dispose();
      });
    } else if (material && !material.userData.shared) {
      material.dispose();
    }
  });
}

function disposeSharedResources() {
  sharedGeometryCache.forEach((geometry) => geometry.dispose());
  sharedGeometryCache.clear();
  sharedMaterialCache.forEach((material) => material.dispose());
  sharedMaterialCache.clear();
}

function scheduleRuntimeTimeout(active: MatchRuntime, callback: () => void, delay: number) {
  const timeoutId = window.setTimeout(() => {
    active.scheduledTimeouts.delete(timeoutId);
    callback();
  }, delay);
  active.scheduledTimeouts.add(timeoutId);
  return timeoutId;
}

function clearRuntimeTimeouts(active: MatchRuntime) {
  active.scheduledTimeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
  active.scheduledTimeouts.clear();
}

function trackRuntimeAudioSource(active: MatchRuntime, source: AudioScheduledSourceNode) {
  active.activeAudioSources.add(source);
  source.addEventListener("ended", () => {
    active.activeAudioSources.delete(source);
    source.disconnect();
  }, { once: true });
}

function clearRuntimeAudioSources(active: MatchRuntime) {
  active.activeAudioSources.forEach((source) => {
    try {
      source.stop();
    } catch {
      // The source may already have naturally ended.
    }
    source.disconnect();
  });
  active.activeAudioSources.clear();
}

function syncRuntimeDiagnostics(active: MatchRuntime) {
  let sceneNodeCount = 0;
  active.scene.traverse(() => {
    sceneNodeCount += 1;
  });
  const canvas = active.renderer.domElement;
  canvas.dataset.phase = active.phase;
  canvas.dataset.ballState = active.ballState;
  canvas.dataset.ballSpeed = active.ballVel.length().toFixed(2);
  canvas.dataset.ballX = active.ballPos.x.toFixed(3);
  canvas.dataset.ballY = active.ballPos.y.toFixed(3);
  canvas.dataset.ballZ = active.ballPos.z.toFixed(3);
  canvas.dataset.engineId = String(active.engineId);
  canvas.dataset.restartCount = String(active.restartCount);
  canvas.dataset.rafLoops = active.frameRunning ? "1" : "0";
  canvas.dataset.sceneNodes = String(sceneNodeCount);
  canvas.dataset.playerCount = String(active.players.length);
  canvas.dataset.colliderCount = String(active.players.length + 1);
  canvas.dataset.timerCount = String(active.scheduledTimeouts.size);
  canvas.dataset.audioSourceCount = String(active.activeAudioSources.size);
  canvas.dataset.receptionLockPlayer = active.receptionLockPlayerId ?? "";
  canvas.dataset.receptionLockTimer = active.receptionLockTimer.toFixed(3);
  canvas.dataset.visibilityPauses = String(active.visibilityPauseCount);
  canvas.dataset.goalClearWidth = GOAL_W.toFixed(2);
  canvas.dataset.goalFrameOuterWidth = GOAL_FRAME_OUTER_W.toFixed(2);
  canvas.dataset.goalLineOpeningWidth = GOAL_FRAME_OUTER_W.toFixed(2);
  canvas.dataset.goalLeftOuterX = (-GOAL_POST_CENTER_X - GOAL_POST_THICKNESS / 2).toFixed(2);
  canvas.dataset.goalRightOuterX = (GOAL_POST_CENTER_X + GOAL_POST_THICKNESS / 2).toFixed(2);
  canvas.dataset.goalScoreHalfWidth = (GOAL_W / 2 - BALL_RADIUS).toFixed(2);
  const owner = ballOwner(active);
  const diagnosticCarrier = owner ?? (active.defensivePlanGraceTimer > 0 && active.defensivePlan?.carrierId
    ? active.players.find((player) => player.id === active.defensivePlan?.carrierId) ?? null
    : null);
  canvas.dataset.defensivePlanGrace = active.defensivePlanGraceTimer.toFixed(2);
  if (diagnosticCarrier) {
    const defendingTeam = opponent(diagnosticCarrier.team);
    const defenders = active.players.filter((player) => player.team === defendingTeam && player.role !== "keeper" && !player.sentOff);
    const roles = defenders.map((player) => defensivePressureRoleForPlayer(
      player,
      active,
      diagnosticCarrier,
    ));
    const aggressiveClosers = defenders.filter((player) => {
      const role = active.defensivePlan?.roles.get(player.id);
      const towardCarrier = diagnosticCarrier.pos.clone().sub(player.pos).setY(0);
      const distance = towardCarrier.length();
      if (role === "press") return true;
      if (towardCarrier.lengthSq() < 0.05 || distance >= 15.5) return false;
      towardCarrier.normalize();
      const activelyClosing = player.vel.dot(towardCarrier) > 0.18 || player.aiInputCache.dir.dot(towardCarrier) > 0.16;
      if (role === "cover") return distance < 10.5 && activelyClosing;
      return activelyClosing;
    });
    canvas.dataset.nearCarrierDefenders = String(defenders.filter((player) => player.pos.distanceTo(diagnosticCarrier.pos) < 6.5).length);
    canvas.dataset.closeCarrierDefenders = String(defenders.filter((player) => player.pos.distanceTo(diagnosticCarrier.pos) < 10.5).length);
    canvas.dataset.aggressiveCloserCount = String(aggressiveClosers.length);
    canvas.dataset.pressRoleCount = String(roles.filter((role) => role.role === "press").length);
    canvas.dataset.coverRoleCount = String(roles.filter((role) => role.role === "cover").length);
    canvas.dataset.ballCarrierTeam = diagnosticCarrier.team;
    canvas.dataset.ballCarrierLine = diagnosticCarrier.line;
    canvas.dataset.primaryPresserId = active.defensivePlan?.primaryPresserId ?? "";
    canvas.dataset.secondaryCoverId = active.defensivePlan?.secondaryCoverId ?? "";
    canvas.dataset.defensiveDangerPhase = active.defensivePlan?.dangerPhase ?? "NORMAL_BLOCK";
    const primaryPresser = active.defensivePlan?.primaryPresserId
      ? defenders.find((player) => player.id === active.defensivePlan?.primaryPresserId) ?? null
      : null;
    const primaryTarget = primaryPresser ? active.defensivePlan?.targets.get(primaryPresser.id) ?? null : null;
    if (primaryTarget) {
      const toGoal = new THREE.Vector3(0, 0, teamGoalZ(defendingTeam, active.half)).sub(diagnosticCarrier.pos).setY(0).normalize();
      const sideAxis = new THREE.Vector3(-toGoal.z, 0, toGoal.x);
      const relativeTarget = primaryTarget.clone().sub(diagnosticCarrier.pos).setY(0);
      const relativePosition = primaryPresser?.pos.clone().sub(diagnosticCarrier.pos).setY(0) ?? new THREE.Vector3();
      canvas.dataset.primaryGoalSideProgress = relativeTarget.dot(toGoal).toFixed(3);
      canvas.dataset.primaryLaneOffset = Math.abs(relativeTarget.dot(sideAxis)).toFixed(3);
      canvas.dataset.primaryPositionGoalSideProgress = relativePosition.dot(toGoal).toFixed(3);
      canvas.dataset.primaryPositionLaneOffset = Math.abs(relativePosition.dot(sideAxis)).toFixed(3);
    } else {
      canvas.dataset.primaryGoalSideProgress = "0";
      canvas.dataset.primaryLaneOffset = "0";
      canvas.dataset.primaryPositionGoalSideProgress = "0";
      canvas.dataset.primaryPositionLaneOffset = "0";
    }
    const markingAssignments = [...(active.defensivePlan?.markedOpponentIds.entries() ?? [])].map(([markerId, targetId]) => ({ markerId, targetId }));
    const markedTargets = new Set(markingAssignments.map((assignment) => assignment.targetId));
    const dangerousOpponents = active.players.filter((player) => (
      player.team === diagnosticCarrier.team
      && player.role !== "keeper"
      && !player.sentOff
      && (player.line === "forward" || player.line === "midfielder")
      && Math.abs(player.pos.z - teamGoalZ(defendingTeam, active.half)) < 74
    )).sort((a, b) => (
      defensiveThreatScore(b, diagnosticCarrier, active, defendingTeam)
      - defensiveThreatScore(a, diagnosticCarrier, active, defendingTeam)
    )).slice(0, 5);
    const carrierAccountedFor = Boolean(active.defensivePlan?.primaryPresserId);
    canvas.dataset.defensiveMarkAssignments = JSON.stringify(markingAssignments);
    canvas.dataset.dangerousUnmarkedCount = String(dangerousOpponents.filter((player) => (
      !markedTargets.has(player.id) && !(player.id === diagnosticCarrier.id && carrierAccountedFor)
    )).length);
    canvas.dataset.duplicateMarkCount = String(markingAssignments.length - markedTargets.size);
    canvas.dataset.deepestThreatId = active.defensivePlan?.deepestThreatId ?? "";
    canvas.dataset.deepestMarkerId = active.defensivePlan?.deepestMarkerId ?? "";
    const deepestThreat = active.defensivePlan?.deepestThreatId
      ? active.players.find((player) => player.id === active.defensivePlan?.deepestThreatId) ?? null
      : null;
    const deepestMarker = active.defensivePlan?.deepestMarkerId
      ? active.players.find((player) => player.id === active.defensivePlan?.deepestMarkerId) ?? null
      : null;
    if (deepestThreat && deepestMarker) {
      const markerFromThreat = deepestMarker.pos.clone().sub(deepestThreat.pos).setY(0);
      const threatToGoal = new THREE.Vector3(0, 0, teamGoalZ(defendingTeam, active.half)).sub(deepestThreat.pos).setY(0);
      canvas.dataset.deepestMarkerDistance = markerFromThreat.length().toFixed(3);
      canvas.dataset.deepestMarkerGoalSide = String(
        markerFromThreat.lengthSq() > 0.05
        && threatToGoal.lengthSq() > 0.05
        && markerFromThreat.normalize().dot(threatToGoal.normalize()) > 0.2
      );
    } else {
      canvas.dataset.deepestMarkerDistance = "0";
      canvas.dataset.deepestMarkerGoalSide = "false";
    }
    canvas.dataset.unassignedDefenderCount = String(defenders.filter((player) => (
      !isManualControlledPlayer(player, active)
      && (!active.defensivePlan?.roles.has(player.id) || !active.defensivePlan?.targets.has(player.id))
    )).length);
    canvas.dataset.laneBlockerCount = String(defenders.filter((player) => {
      const role = active.defensivePlan?.roles.get(player.id);
      return role === "block-lane" || role === "midfield-screen";
    }).length);
    canvas.dataset.forwardPressActive = String(
      defenders.some((player) => player.id === active.defensivePlan?.primaryPresserId && player.line === "forward"),
    );
    const retreatFacing = defenders
      .filter((player) => player.line === "defender")
      .map((player) => {
        const targetId = active.defensivePlan?.markedOpponentIds.get(player.id);
        const target = targetId
          ? active.players.find((candidate) => candidate.id === targetId) ?? diagnosticCarrier
          : diagnosticCarrier;
        const toTarget = target.pos.clone().sub(player.pos).setY(0);
        return toTarget.lengthSq() > 0.05 ? facingDirection(player).dot(toTarget.normalize()) : 1;
      });
    canvas.dataset.defenderFacingDot = (retreatFacing.reduce((sum, value) => sum + value, 0) / Math.max(1, retreatFacing.length)).toFixed(3);
    canvas.dataset.defensiveRoles = JSON.stringify(defenders.map((player) => ({
      id: player.id,
      role: active.defensivePlan?.roles.get(player.id) ?? "shape",
      markedOpponentId: active.defensivePlan?.markedOpponentIds.get(player.id) ?? null,
      position: { x: Number(player.pos.x.toFixed(1)), z: Number(player.pos.z.toFixed(1)) },
      target: active.defensivePlan?.targets.get(player.id)
        ? {
            x: Number(active.defensivePlan.targets.get(player.id)?.x.toFixed(1)),
            z: Number(active.defensivePlan.targets.get(player.id)?.z.toFixed(1)),
          }
        : null,
    })));
    canvas.dataset.antiSwarmCorrections = String(active.antiSwarmCorrections);
    const ownZ = teamGoalZ(defendingTeam, active.half);
    const backLine = defenders.filter((player) => player.line === "defender");
    const outfieldDepths = defenders.map((player) => Math.abs(player.pos.z - ownZ));
    canvas.dataset.defendersInsideTwelve = String(outfieldDepths.filter((depth) => depth <= 12).length);
    canvas.dataset.outfieldInsideTwentyEight = String(outfieldDepths.filter((depth) => depth <= 28).length);
    canvas.dataset.manualControlledHasAiRole = String(
      defenders.some((player) => isManualControlledPlayer(player, active) && active.defensivePlan?.roles.has(player.id)),
    );
    canvas.dataset.defensiveLineDepth = (
      backLine.reduce((sum, player) => sum + Math.abs(player.pos.z - ownZ), 0) / Math.max(1, backLine.length)
    ).toFixed(2);
    canvas.dataset.deepestDefenderDepth = Math.max(...backLine.map((player) => Math.abs(player.pos.z - ownZ)), 0).toFixed(2);
    canvas.dataset.deepestThreatDepth = Math.min(
      ...active.players
        .filter((player) => player.team === diagnosticCarrier.team && player.role !== "keeper" && !player.sentOff)
        .map((player) => Math.abs(player.pos.z - ownZ)),
      Math.abs(diagnosticCarrier.pos.z - ownZ),
    ).toFixed(2);
    canvas.dataset.maxDefenderSpeed = Math.max(...backLine.map((player) => player.vel.length()), 0).toFixed(2);
  } else {
    canvas.dataset.nearCarrierDefenders = "0";
    canvas.dataset.closeCarrierDefenders = "0";
    canvas.dataset.aggressiveCloserCount = "0";
    canvas.dataset.pressRoleCount = "0";
    canvas.dataset.coverRoleCount = "0";
    canvas.dataset.ballCarrierTeam = "";
    canvas.dataset.ballCarrierLine = "";
    canvas.dataset.primaryPresserId = "";
    canvas.dataset.secondaryCoverId = "";
    canvas.dataset.defensiveDangerPhase = "NORMAL_BLOCK";
    canvas.dataset.primaryGoalSideProgress = "0";
    canvas.dataset.primaryLaneOffset = "0";
    canvas.dataset.primaryPositionGoalSideProgress = "0";
    canvas.dataset.primaryPositionLaneOffset = "0";
    canvas.dataset.defensiveMarkAssignments = "[]";
    canvas.dataset.dangerousUnmarkedCount = "0";
    canvas.dataset.duplicateMarkCount = "0";
    canvas.dataset.deepestThreatId = "";
    canvas.dataset.deepestMarkerId = "";
    canvas.dataset.deepestMarkerDistance = "0";
    canvas.dataset.deepestMarkerGoalSide = "false";
    canvas.dataset.unassignedDefenderCount = "0";
    canvas.dataset.laneBlockerCount = "0";
    canvas.dataset.forwardPressActive = "false";
    canvas.dataset.defenderFacingDot = "1.000";
    canvas.dataset.defensiveRoles = "[]";
    canvas.dataset.antiSwarmCorrections = String(active.antiSwarmCorrections);
    canvas.dataset.defensiveLineDepth = "0";
    canvas.dataset.deepestDefenderDepth = "0";
    canvas.dataset.deepestThreatDepth = "0";
    canvas.dataset.maxDefenderSpeed = "0";
    canvas.dataset.defendersInsideTwelve = "0";
    canvas.dataset.outfieldInsideTwentyEight = "0";
    canvas.dataset.manualControlledHasAiRole = "false";
  }
  canvas.dataset.collisionResolutionsThisFrame = String(active.collisionResolutionsThisFrame);
  canvas.dataset.maxCollisionCorrection = active.maxCollisionCorrection.toFixed(3);
  canvas.dataset.maxDefenderFrameDisplacement = active.maxDefenderFrameDisplacement.toFixed(3);
  canvas.dataset.abnormalMovementClamps = String(active.abnormalMovementClamps);
  if (owner) {
    const supportingMidfielders = active.players.filter((player) => (
      player.team === owner.team
      && player.line === "midfielder"
      && player.pos.distanceTo(owner.pos) > 7
      && player.pos.distanceTo(owner.pos) < 38
    ));
    const supportingDefenders = active.players.filter((player) => (
      player.team === owner.team
      && player.line === "defender"
      && player.pos.distanceTo(owner.pos) > 8
      && player.pos.distanceTo(owner.pos) < 46
    ));
    canvas.dataset.buildupMidfieldOptions = String(supportingMidfielders.length);
    canvas.dataset.buildupDefenderOptions = String(supportingDefenders.length);
  } else {
    canvas.dataset.buildupMidfieldOptions = "0";
    canvas.dataset.buildupDefenderOptions = "0";
  }
  canvas.dataset.keeperTracking = JSON.stringify(active.players
    .filter((player) => player.role === "keeper")
    .map((keeper) => {
      const toBall = active.ballPos.clone().setY(0).sub(keeper.pos);
      const trackingDot = toBall.lengthSq() > 0.05 ? facingDirection(keeper).dot(toBall.normalize()) : 1;
      const timeToGoal = Math.abs(active.ballVel.z) > 0.12 ? (keeper.pos.z - active.ballPos.z) / active.ballVel.z : 0;
      const predictedX = timeToGoal > 0
        ? active.ballPos.x + active.ballVel.x * clamp(timeToGoal, 0, 1.18)
        : active.ballPos.x;
      const trackingShot = active.ballState === "kicked"
        && active.ballVel.length() > 6.5
        && timeToGoal > 0
        && Math.abs(predictedX) < GOAL_W / 2 + 5;
      return {
        id: keeper.id,
        trackingDot: Number(trackingDot.toFixed(3)),
        diveSide: keeper.diveSide,
        diveTimer: Number(keeper.diveTimer.toFixed(3)),
        expectedSide: Math.sign(predictedX - keeper.pos.x || active.ballVel.x || 0),
        predictedX: Number(predictedX.toFixed(2)),
        trackingShot,
        headYaw: Number((keeper.mesh.getObjectByName("head-root")?.rotation.y ?? 0).toFixed(3)),
        diveTowardTrajectory: keeper.diveSide === 0 || Math.sign(keeper.diveSide) === Math.sign(predictedX - keeper.pos.x || active.ballVel.x || 0),
      };
    }));
}

function createTorsoGeometry() {
  const geometry = new THREE.BufferGeometry();
  const vertices = new Float32Array([
    -0.58, 0.64, -0.25, 0.58, 0.64, -0.25, 0.58, 0.64, 0.25, -0.58, 0.64, 0.25,
    -0.29, -0.62, -0.19, 0.29, -0.62, -0.19, 0.29, -0.62, 0.19, -0.29, -0.62, 0.19,
  ]);
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex([
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1,
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0,
  ]);
  geometry.computeVertexNormals();
  return geometry;
}

function makeHumanFigure({
  shirt,
  trim,
  shorts,
  socks = "#f8fafc",
  boot = "#d1d5db",
  skin = "#e8b88f",
  hair = "#3f2b1d",
  accent,
  numberPanel,
}: {
  shirt: string;
  trim: string;
  shorts: string;
  socks?: string;
  boot?: string;
  skin?: string;
  hair?: string;
  accent?: string;
  numberPanel?: THREE.Object3D;
  sponsor?: string;
}) {
  const group = new THREE.Group();
  const bodyRoot = new THREE.Group();
  bodyRoot.name = "body-root";

  const shirtMaterial = sharedLambertMaterial(shirt);
  const trimMaterial = sharedLambertMaterial(trim);
  const shortsMaterial = sharedLambertMaterial(shorts);
  const skinMaterial = sharedLambertMaterial(skin);
  const hairMaterial = sharedLambertMaterial(hair);
  const sockMaterial = sharedLambertMaterial(socks);
  const bootMaterial = sharedLambertMaterial(boot);
  const featureMaterial = sharedBasicMaterial("#1b120d");

  const hip = new THREE.Mesh(sharedGeometry("player-hip", () => new THREE.BoxGeometry(0.64, 0.22, 0.38)), shortsMaterial);
  hip.position.y = 1.0;
  const torso = new THREE.Mesh(sharedGeometry("player-torso", createTorsoGeometry), shirtMaterial);
  torso.name = "torso";
  torso.position.y = 1.62;
  torso.scale.set(1.08, 1.25, 0.82);
  const shoulderBand = new THREE.Mesh(sharedGeometry("player-shoulder-band", () => new THREE.BoxGeometry(1.18, 0.1, 0.42)), trimMaterial);
  shoulderBand.position.y = 2.15;
  const collar = new THREE.Mesh(sharedGeometry("player-collar", () => new THREE.BoxGeometry(0.34, 0.06, 0.08)), trimMaterial);
  collar.position.set(0, 2.27, 0.21);
  const shortsMesh = new THREE.Mesh(sharedGeometry("player-shorts", () => new THREE.BoxGeometry(0.8, 0.36, 0.38)), shortsMaterial);
  shortsMesh.position.y = 0.86;
  const headRoot = new THREE.Group();
  headRoot.name = "head-root";
  headRoot.position.y = 2.32;
  const neck = new THREE.Mesh(sharedGeometry("player-neck", () => new THREE.CylinderGeometry(0.105, 0.13, 0.2, 6)), skinMaterial);
  neck.position.y = 0;
  const head = new THREE.Mesh(sharedGeometry("player-head", () => new THREE.SphereGeometry(0.25, 8, 6)), skinMaterial);
  head.name = "head";
  head.scale.set(0.86, 1.12, 0.9);
  head.position.y = 0.26;
  const hairCap = new THREE.Mesh(sharedGeometry("player-hair-cap", () => new THREE.SphereGeometry(0.26, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2)), hairMaterial);
  hairCap.scale.set(0.88, 0.5, 0.94);
  hairCap.position.y = 0.48;

  [-1, 1].forEach((side) => {
    const shoulder = new THREE.Group();
    shoulder.name = side < 0 ? "left-arm" : "right-arm";
    shoulder.position.set(side * 0.58, 2.02, 0.02);
    shoulder.rotation.z = side * 0.16;
    const upperArm = new THREE.Mesh(sharedGeometry("player-upper-arm", () => new THREE.CapsuleGeometry(0.092, 0.52, 2, 5)), shirtMaterial);
    upperArm.position.y = -0.25;
    const elbow = new THREE.Group();
    elbow.name = side < 0 ? "left-elbow" : "right-elbow";
    elbow.position.y = -0.5;
    const forearm = new THREE.Mesh(sharedGeometry("player-forearm", () => new THREE.CapsuleGeometry(0.074, 0.42, 2, 5)), skinMaterial);
    forearm.position.y = -0.2;
    const hand = new THREE.Mesh(sharedGeometry("player-hand", () => new THREE.SphereGeometry(0.09, 5, 4)), skinMaterial);
    hand.position.y = -0.43;
    elbow.add(forearm, hand);
    shoulder.add(upperArm, elbow);
    bodyRoot.add(shoulder);
  });

  [-1, 1].forEach((side) => {
    const leg = new THREE.Group();
    leg.name = side < 0 ? "left-leg" : "right-leg";
    leg.position.set(side * 0.22, 0.82, 0);
    const thigh = new THREE.Mesh(sharedGeometry("player-thigh", () => new THREE.CapsuleGeometry(0.12, 0.66, 2, 6)), skinMaterial);
    thigh.name = side < 0 ? "left-thigh" : "right-thigh";
    thigh.position.y = -0.34;
    const knee = new THREE.Group();
    knee.name = side < 0 ? "left-knee" : "right-knee";
    knee.position.y = -0.68;
    const calf = new THREE.Mesh(sharedGeometry("player-calf", () => new THREE.CapsuleGeometry(0.092, 0.62, 2, 6)), sockMaterial);
    calf.position.y = -0.32;
    const bootMesh = new THREE.Mesh(sharedGeometry("player-boot", () => new THREE.BoxGeometry(0.24, 0.12, 0.5)), bootMaterial);
    bootMesh.name = side < 0 ? "left-boot" : "right-boot";
    bootMesh.position.set(0, -0.67, 0.16);
    knee.add(calf, bootMesh);
    leg.add(thigh, knee);
    bodyRoot.add(leg);
  });

  [-1, 1].forEach((side) => {
    const eye = new THREE.Mesh(sharedGeometry("player-eye", () => new THREE.SphereGeometry(0.025, 4, 3)), featureMaterial);
    eye.position.set(side * 0.072, 0.32, 0.36);
    headRoot.add(eye);
  });
  const mouth = new THREE.Mesh(sharedGeometry("player-mouth", () => new THREE.BoxGeometry(0.1, 0.012, 0.01)), featureMaterial);
  mouth.position.set(0, 0.17, 0.37);

  headRoot.add(neck, head, hairCap, mouth);
  bodyRoot.add(hip, torso, shoulderBand, collar, shortsMesh, headRoot);
  if (numberPanel) bodyRoot.add(numberPanel);
  group.add(bodyRoot);
  group.scale.set(0.9, 1.1, 0.9);

  if (accent) {
    const marker = new THREE.Mesh(
      new THREE.TorusGeometry(1.08, 0.045, 6, 24),
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9 }),
    );
    marker.rotation.x = Math.PI / 2;
    marker.position.y = 0.08;
    marker.name = "control-marker";
    marker.visible = false;
    group.add(marker);
    const aimArrow = new THREE.Group();
    aimArrow.name = "aim-arrow";
    aimArrow.visible = false;
    const arrowMaterial = new THREE.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.96,
      depthTest: false,
      depthWrite: false,
    });
    const arrowShaft = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.055, 1.72),
      arrowMaterial,
    );
    arrowShaft.position.z = 1.72;
    arrowShaft.renderOrder = 20;
    const arrowHead = new THREE.Mesh(
      new THREE.ConeGeometry(0.38, 0.76, 4),
      arrowMaterial,
    );
    arrowHead.position.z = 2.92;
    arrowHead.rotation.x = Math.PI / 2;
    arrowHead.renderOrder = 20;
    aimArrow.position.y = 0.24;
    aimArrow.add(arrowShaft, arrowHead);
    group.add(aimArrow);
  }
  return group;
}

function makeKit(team: TeamId, role: PlayerRole, accent: string, number: number) {
  const isKeeper = role === "keeper";
  const home = HOME_KIT;
  const homeColor = activeOfflineSettings.homeColor || home.primary;
  const shirt = isKeeper ? (team === "home" ? home.keeper : AWAY_KEEPER_COLOR) : (team === "home" ? homeColor : AWAY_COLOR);
  const trim = isKeeper ? "#111827" : team === "home" ? home.secondary : AWAY_TRIM;
  const shorts = isKeeper ? "#111827" : team === "home" ? home.shorts : AWAY_SHORTS;
  const socks = isKeeper ? "#111827" : team === "home" ? home.socks : "#f8fafc";
  const boot = team === "home" ? "#d1d5db" : "#111827";
  const figure = makeHumanFigure({
    shirt,
    trim,
    shorts,
    socks,
    boot,
    hair: number % 3 === 0 ? "#111827" : number % 2 === 0 ? "#6b3f1f" : "#24160f",
    accent: isKeeper ? "#f8fafc" : team === "home" ? home.accent : accent,
    numberPanel: undefined,
    sponsor: team === "home" ? home.name.split(" ")[0].slice(0, 2).toUpperCase() : "AW",
  });
  return figure;
}

function createSoccerBall() {
  const ball = new THREE.Group();
  const white = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 12, 8),
    new THREE.MeshLambertMaterial({ color: "#f8fafc" }),
  );
  ball.add(white);

  const patchMaterial = new THREE.MeshBasicMaterial({ color: "#111827", side: THREE.DoubleSide });
  const points = [
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(1, 0.15, 0),
    new THREE.Vector3(-1, 0.15, 0),
    new THREE.Vector3(0, 0.15, 1),
    new THREE.Vector3(0, 0.15, -1),
    new THREE.Vector3(0.72, -0.45, 0.72),
    new THREE.Vector3(-0.72, -0.45, 0.72),
    new THREE.Vector3(0.72, -0.45, -0.72),
    new THREE.Vector3(-0.72, -0.45, -0.72),
  ];
  points.forEach((point) => {
    const normal = point.normalize();
    const patch = new THREE.Mesh(new THREE.CircleGeometry(BALL_RADIUS * 0.24, 5), patchMaterial);
    patch.position.copy(normal.multiplyScalar(BALL_RADIUS + 0.006));
    patch.lookAt(normal.clone().multiplyScalar(2));
    ball.add(patch);
  });
  return ball;
}

function createBlobShadow(radius: number, opacity: number) {
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 18),
    new THREE.MeshBasicMaterial({
      color: "#03130a",
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: true,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.045;
  return shadow;
}

function addFieldMarking(scene: THREE.Scene, x: number, z: number, w: number, h: number) {
  const material = new THREE.MeshBasicMaterial({ color: "#dffcff", transparent: true, opacity: 0.62 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.035, 0.15), material);
  const bottom = top.clone();
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.035, h), material);
  const right = left.clone();
  top.position.set(x, 0.035, z - h / 2);
  bottom.position.set(x, 0.035, z + h / 2);
  left.position.set(x - w / 2, 0.035, z);
  right.position.set(x + w / 2, 0.035, z);
  scene.add(top, bottom, left, right);
}

function addPitchBoundaryMarking(scene: THREE.Scene) {
  const material = new THREE.MeshBasicMaterial({ color: "#dffcff", transparent: true, opacity: 0.62 });
  const touchline = new THREE.BoxGeometry(0.15, 0.035, FIELD_L);
  [-1, 1].forEach((side) => {
    const line = new THREE.Mesh(touchline, material);
    line.position.set(side * FIELD_W / 2, 0.035, 0);
    scene.add(line);
  });
  const endSegmentWidth = (FIELD_W - GOAL_FRAME_OUTER_W) / 2;
  const endSegmentX = (FIELD_W + GOAL_FRAME_OUTER_W) / 4;
  const endSegment = new THREE.BoxGeometry(endSegmentWidth, 0.035, 0.15);
  [-1, 1].forEach((goalSide) => {
    [-1, 1].forEach((xSide) => {
      const line = new THREE.Mesh(endSegment, material);
      line.position.set(xSide * endSegmentX, 0.035, goalSide * FIELD_L / 2);
      scene.add(line);
    });
  });
}

function addPitch(scene: THREE.Scene) {
  const runoff = new THREE.Mesh(
    new THREE.BoxGeometry(FIELD_W + TOUCHLINE_MARGIN * 2, 0.16, FIELD_L + TOUCHLINE_MARGIN * 2),
    new THREE.MeshLambertMaterial({ color: "#116b38" }),
  );
  runoff.position.y = -0.14;
  scene.add(runoff);

  const stripeDepth = FIELD_L / 10;
  const positions: number[] = [];
  const colors: number[] = [];
  const grassColors = ["#2f8f4e", "#237743"].map((color) => new THREE.Color(color));
  for (let stripe = 0; stripe < 10; stripe += 1) {
    const z0 = -FIELD_L / 2 + stripe * stripeDepth;
    const z1 = stripe === 9 ? FIELD_L / 2 : z0 + stripeDepth;
    const vertices = [
      -FIELD_W / 2, 0.018, z0,
      FIELD_W / 2, 0.018, z0,
      FIELD_W / 2, 0.018, z1,
      -FIELD_W / 2, 0.018, z0,
      FIELD_W / 2, 0.018, z1,
      -FIELD_W / 2, 0.018, z1,
    ];
    positions.push(...vertices);
    const color = grassColors[stripe % grassColors.length];
    for (let i = 0; i < 6; i += 1) colors.push(color.r, color.g, color.b);
  }
  const pitchGeometry = new THREE.BufferGeometry();
  pitchGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  pitchGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  pitchGeometry.computeVertexNormals();
  const pitch = new THREE.Mesh(
    pitchGeometry,
    new THREE.MeshLambertMaterial({ vertexColors: true }),
  );
  scene.add(pitch);

  addPitchBoundaryMarking(scene);
  addFieldMarking(scene, 0, FIELD_L / 2 - 3.5, 20, 7);
  addFieldMarking(scene, 0, -FIELD_L / 2 + 3.5, 20, 7);
  addFieldMarking(scene, 0, FIELD_L / 2 - 9, 44, 18);
  addFieldMarking(scene, 0, -FIELD_L / 2 + 9, 44, 18);
}

function addNetLines(scene: THREE.Scene, side: -1 | 1) {
  const frontZ = side * GOAL_FRONT_Z;
  const backZ = frontZ + side * GOAL_DEPTH;
  const material = new THREE.LineBasicMaterial({ color: "#f8fafc", transparent: true, opacity: 0.72, depthWrite: false });
  const points: THREE.Vector3[] = [];
  const bottom = 0.14;
  const topFront = 3.12;
  const topBack = 2.55;
  const widthSteps = 10;
  const heightSteps = 7;
  const depthSteps = 5;
  for (let i = 0; i <= widthSteps; i += 1) {
    const x = -GOAL_W / 2 + (GOAL_W * i) / widthSteps;
    const sag = 0.12 * (1 - Math.abs(x) / (GOAL_W / 2));
    points.push(new THREE.Vector3(x, bottom, backZ), new THREE.Vector3(x, topBack - sag, backZ));
    points.push(new THREE.Vector3(x, topFront, frontZ), new THREE.Vector3(x, topBack - sag, backZ));
    points.push(new THREE.Vector3(x, bottom, frontZ), new THREE.Vector3(x, bottom, backZ));
  }
  for (let j = 0; j <= heightSteps; j += 1) {
    const mix = j / heightSteps;
    const yBack = bottom + (topBack - bottom) * mix;
    const yFront = bottom + (topFront - bottom) * mix;
    points.push(new THREE.Vector3(-GOAL_W / 2, yBack, backZ), new THREE.Vector3(GOAL_W / 2, yBack, backZ));
    points.push(new THREE.Vector3(-GOAL_W / 2, yFront, frontZ), new THREE.Vector3(-GOAL_W / 2, yBack, backZ));
    points.push(new THREE.Vector3(GOAL_W / 2, yFront, frontZ), new THREE.Vector3(GOAL_W / 2, yBack, backZ));
  }
  for (let k = 0; k <= depthSteps; k += 1) {
    const z = frontZ + side * ((GOAL_DEPTH * k) / depthSteps);
    const roofMix = k / depthSteps;
    const roofY = topFront + (topBack - topFront) * roofMix;
    points.push(new THREE.Vector3(-GOAL_W / 2, roofY, z), new THREE.Vector3(GOAL_W / 2, roofY, z));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  scene.add(new THREE.LineSegments(geometry, material));
}

function addGoal(scene: THREE.Scene, side: -1 | 1) {
  const goalMat = new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.35 });
  const z = side * GOAL_FRONT_Z;
  const crossbar = new THREE.Mesh(
    new THREE.BoxGeometry(GOAL_FRAME_OUTER_W, GOAL_POST_THICKNESS, GOAL_POST_THICKNESS),
    goalMat,
  );
  crossbar.position.set(0, 3.2, z);
  const postA = new THREE.Mesh(new THREE.BoxGeometry(GOAL_POST_THICKNESS, 3.2, GOAL_POST_THICKNESS), goalMat);
  postA.position.set(-GOAL_POST_CENTER_X, 1.6, z);
  const postB = postA.clone();
  postB.position.x = GOAL_POST_CENTER_X;
  scene.add(crossbar, postA, postB);
  addNetLines(scene, side);
}

function resolveGoalFrameCollision(ball: THREE.Vector3, velocity: THREE.Vector3) {
  const collisionRadius = BALL_RADIUS + GOAL_POST_THICKNESS / 2;
  [-1, 1].forEach((goalSide) => {
    const goalLineZ = goalSide * GOAL_FRONT_Z;
    [-1, 1].forEach((postSide) => {
      if (ball.y > 3.2 + BALL_RADIUS) return;
      const postCenter = new THREE.Vector2(postSide * GOAL_POST_CENTER_X, goalLineZ);
      const offset = new THREE.Vector2(ball.x - postCenter.x, ball.z - postCenter.y);
      const distance = offset.length();
      if (distance >= collisionRadius || distance < 0.0001) return;
      const normal = offset.multiplyScalar(1 / distance);
      ball.x = postCenter.x + normal.x * collisionRadius;
      ball.z = postCenter.y + normal.y * collisionRadius;
      const horizontalVelocity = new THREE.Vector2(velocity.x, velocity.z);
      const towardFrame = horizontalVelocity.dot(normal);
      if (towardFrame < 0) {
        horizontalVelocity.addScaledVector(normal, -1.62 * towardFrame);
        velocity.x = horizontalVelocity.x * 0.72;
        velocity.z = horizontalVelocity.y * 0.72;
      }
    });

    if (Math.abs(ball.x) > GOAL_FRAME_OUTER_W / 2 + BALL_RADIUS) return;
    const crossbarOffset = new THREE.Vector2(ball.y - 3.2, ball.z - goalLineZ);
    const crossbarDistance = crossbarOffset.length();
    if (crossbarDistance >= collisionRadius || crossbarDistance < 0.0001) return;
    const normal = crossbarOffset.multiplyScalar(1 / crossbarDistance);
    ball.y = 3.2 + normal.x * collisionRadius;
    ball.z = goalLineZ + normal.y * collisionRadius;
    const verticalVelocity = new THREE.Vector2(velocity.y, velocity.z);
    const towardFrame = verticalVelocity.dot(normal);
    if (towardFrame < 0) {
      verticalVelocity.addScaledVector(normal, -1.58 * towardFrame);
      velocity.y = verticalVelocity.x * 0.68;
      velocity.z = verticalVelocity.y * 0.68;
    }
  });
}

function addRoundedRectContour(path: THREE.Shape | THREE.Path, width: number, length: number, radius: number) {
  const halfW = width / 2;
  const halfL = length / 2;
  const r = Math.min(radius, halfW - 0.1, halfL - 0.1);
  path.moveTo(-halfW + r, -halfL);
  path.lineTo(halfW - r, -halfL);
  path.quadraticCurveTo(halfW, -halfL, halfW, -halfL + r);
  path.lineTo(halfW, halfL - r);
  path.quadraticCurveTo(halfW, halfL, halfW - r, halfL);
  path.lineTo(-halfW + r, halfL);
  path.quadraticCurveTo(-halfW, halfL, -halfW, halfL - r);
  path.lineTo(-halfW, -halfL + r);
  path.quadraticCurveTo(-halfW, -halfL, -halfW + r, -halfL);
  path.closePath();
}

function stadiumRingGeometry(
  innerWidth: number,
  innerLength: number,
  outerWidth: number,
  outerLength: number,
  innerRadius: number,
  outerRadius: number,
  height: number,
) {
  const shape = new THREE.Shape();
  addRoundedRectContour(shape, outerWidth, outerLength, outerRadius);
  const hole = new THREE.Path();
  addRoundedRectContour(hole, innerWidth, innerLength, innerRadius);
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 8,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, height, 0);
  geometry.computeVertexNormals();
  return geometry;
}

function addLightweightStadium(scene: THREE.Scene) {
  const stadium = new THREE.Group();
  stadium.name = "lightweight-stadium";
  const adMaterial = new THREE.MeshBasicMaterial({ color: "#159487" });
  const runoffWidth = FIELD_W + TOUCHLINE_MARGIN * 2;
  const runoffLength = FIELD_L + TOUCHLINE_MARGIN * 2;
  [-1, 1].forEach((side) => {
    const longBoard = new THREE.Mesh(new THREE.BoxGeometry(runoffWidth + 0.4, 1.0, 0.16), adMaterial);
    longBoard.position.set(0, 0.75, side * (runoffLength / 2 + 0.08));
    stadium.add(longBoard);
    const sideBoard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.0, runoffLength + 0.4), adMaterial);
    sideBoard.position.set(side * (runoffWidth / 2 + 0.08), 0.75, 0);
    stadium.add(sideBoard);
  });

  const concrete = new THREE.MeshLambertMaterial({ color: "#344553" });
  const upperConcrete = new THREE.MeshLambertMaterial({ color: "#263641" });
  const seats = new THREE.MeshLambertMaterial({ color: "#1b8090" });
  const darkSeats = new THREE.MeshLambertMaterial({ color: "#155f70" });
  const innerWidth = runoffWidth + 0.5;
  const innerLength = runoffLength + 0.5;
  const tiers = [
    { inset: 0, out: 11.8, height: 2.9, innerRadius: 4.2, outerRadius: 10.5, material: concrete },
    { inset: 11.6, out: 23.6, height: 5.0, innerRadius: 10.3, outerRadius: 16.5, material: seats },
    { inset: 23.4, out: 37.2, height: 7.4, innerRadius: 16.3, outerRadius: 23.5, material: darkSeats },
    { inset: 37.0, out: 43.5, height: 8.8, innerRadius: 23.3, outerRadius: 27.2, material: upperConcrete },
  ];
  tiers.forEach((tier) => {
    const ring = new THREE.Mesh(
      stadiumRingGeometry(
        innerWidth + tier.inset,
        innerLength + tier.inset,
        innerWidth + tier.out,
        innerLength + tier.out,
        tier.innerRadius,
        tier.outerRadius,
        tier.height,
      ),
      tier.material,
    );
    ring.receiveShadow = false;
    stadium.add(ring);
  });

  scene.add(stadium);
}

function animationParts(mesh: THREE.Group): PlayerAnimationParts {
  return {
    bodyRoot: mesh.getObjectByName("body-root") ?? null,
    leftLeg: mesh.getObjectByName("left-leg") ?? null,
    rightLeg: mesh.getObjectByName("right-leg") ?? null,
    leftKnee: mesh.getObjectByName("left-knee") ?? null,
    rightKnee: mesh.getObjectByName("right-knee") ?? null,
    leftArm: mesh.getObjectByName("left-arm") ?? null,
    rightArm: mesh.getObjectByName("right-arm") ?? null,
    leftElbow: mesh.getObjectByName("left-elbow") ?? null,
    rightElbow: mesh.getObjectByName("right-elbow") ?? null,
  };
}

function createPlayer(id: string, team: TeamId, role: PlayerRole, line: PlayerLine, x: number, z: number, number: number, formationSlot: string, controlledBy?: "p1") {
  const mesh = makeKit(team, role, "#ffffff", number);
  const shadow = createBlobShadow(role === "keeper" ? 1.45 : 1.08, role === "keeper" ? 0.22 : 0.18);
  shadow.name = "blob-shadow";
  mesh.add(shadow);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = headingForHome(z);
  const marker = mesh.getObjectByName("control-marker") ?? null;
  if (marker) marker.visible = Boolean(controlledBy);
  const aimArrow = mesh.getObjectByName("aim-arrow") ?? null;
  return {
    id,
    team,
    role,
    line,
    number,
    formationSlot,
    home: new THREE.Vector3(x, 0, z),
    pos: new THREE.Vector3(x, 0, z),
    vel: new THREE.Vector3(),
    mesh,
    controlMarker: marker,
    aimArrow,
    parts: animationParts(mesh),
    heading: headingForHome(z),
    turnRate: 0,
    stamina: 1,
    runPhase: 0,
    animationSpeed: 0,
    kickTimer: 0,
    actionCooldown: 0,
    tackleTimer: 0,
    tackleCooldown: 0,
    recoveryTimer: 0,
    catchTimer: 0,
    diveTimer: 0,
    diveSide: 0,
    headerTimer: 0,
    firstTouchTimer: 0,
    firstTouchType: null,
    blockTimer: 0,
    passRequestTimer: 0,
    celebrateTimer: 0,
    yellowCards: 0,
    sentOff: false,
    decisionCooldown: number * 0.035,
    carryTimer: 0,
    stuckTimer: 0,
    contactLockTimer: 0,
    fallbackTimer: 0,
    fallbackTarget: new THREE.Vector3(x, 0, z),
    lastPos: new THREE.Vector3(x, 0, z),
    supportRunTimer: 0,
    supportRunTarget: new THREE.Vector3(x, 0, z),
    skillTimer: 0,
    skillCooldown: number * 0.04,
    skillSide: number % 2 === 0 ? 1 : -1,
    skillMove: null,
    aiInputCache: { dir: new THREE.Vector3(), sprint: false, speedScale: 1 },
    aiInputTimer: 0,
    forcedMoveTarget: new THREE.Vector3(x, 0, z),
    forcedMoveTimer: 0,
    forcedMoveSprint: false,
    ballContactCooldown: 0,
    challengeCommitTimer: 0,
    controlledBy,
  } satisfies PlayerBody;
}

function formationPlayers(half: 1 | 2) {
  const players: PlayerBody[] = [];
  (["home", "away"] as TeamId[]).forEach((team) => {
    const side = teamSide(team, half);
    const template = team === "home" ? FORMATION_OPTIONS[activeOfflineSettings.formation] : FORMATION_OPTIONS["4-3-3"];
    let fieldIndex = 1;
    template.forEach((slot) => {
      const number = slot.defaultNumber;
      if (slot.line === "keeper") {
        players.push(createPlayer(`${team}-gk`, team, "keeper", "keeper", slot.x, side * (FIELD_L / 2 - 4), number, slot.slot));
      } else {
        const controlledBy = team === "home" && slot.line === "midfielder" && !players.some((player) => player.controlledBy === "p1")
          ? "p1"
          : undefined;
        players.push(createPlayer(`${team}-${fieldIndex}`, team, "field", slot.line, slot.x * FORMATION_SCALE, side * slot.z * FORMATION_SCALE, number, slot.slot, controlledBy));
        fieldIndex += 1;
      }
    });
  });
  return players;
}

function formationHomeMap(half: 1 | 2) {
  const homes = new Map<string, THREE.Vector3>();
  (["home", "away"] as TeamId[]).forEach((team) => {
    const side = teamSide(team, half);
    const template = team === "home" ? FORMATION_OPTIONS[activeOfflineSettings.formation] : FORMATION_OPTIONS["4-3-3"];
    let fieldIndex = 1;
    template.forEach((slot) => {
      if (slot.line === "keeper") {
        homes.set(`${team}-gk`, new THREE.Vector3(slot.x, 0, side * (FIELD_L / 2 - 4)));
      } else {
        homes.set(
          `${team}-${fieldIndex}`,
          new THREE.Vector3(slot.x * FORMATION_SCALE, 0, side * slot.z * FORMATION_SCALE),
        );
        fieldIndex += 1;
      }
    });
  });
  return homes;
}

function setFormationHomes(players: PlayerBody[], half: 1 | 2) {
  const homes = formationHomeMap(half);
  players.forEach((player) => {
    const home = homes.get(player.id);
    if (home) player.home.copy(home);
  });
}

function replaceRuntimePlayers(active: MatchRuntime) {
  active.players.forEach((player) => {
    active.scene.remove(player.mesh);
    disposeObjectTree(player.mesh);
  });
  active.players = formationPlayers(active.half);
  active.players.forEach((player) => active.scene.add(player.mesh));
}

function applyOfflineSettingsToRuntime(active: MatchRuntime) {
  const previousState = active.state;
  const previousPhase = active.phase;
  replaceRuntimePlayers(active);
  setFormationHomes(active.players, active.half);
  active.players.forEach((player) => {
    player.pos.copy(player.home);
    player.vel.set(0, 0, 0);
    player.heading = headingForHome(player.home.z);
    player.mesh.rotation.y = player.heading;
    player.mesh.position.copy(player.pos);
  });
  active.state = previousState;
  active.phase = previousState === "playing" ? "kickoff" : previousPhase;
  active.restartTeam = "home";
  active.restartSpot.set(0, BALL_RADIUS, 0);
  active.restartDirection.copy(upfieldKickDirection("home", active.half));
  active.restartActorId = kickoffTaker(active.players, "home", active.restartSpot)?.id ?? null;
  active.ballPos.copy(active.restartSpot);
  active.ballVel.set(0, 0, 0);
  active.ballCurve.set(0, 0, 0);
  syncBallVisual(active);
  releasePossession(active, "loose");
  active.intendedReceiverId = null;
  active.manualPassReceiverId = null;
  active.phaseTimer = previousState === "playing" ? 1.4 : active.phaseTimer;
}

export function ArcadeSoccerGame() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const keysRef = useRef(new Set<string>());
  const sceneRef = useRef<MatchRuntime | null>(null);
  const frameErrorRef = useRef("");
  const virtualControlsRef = useRef<VirtualControls>({ dir: new THREE.Vector3(), strength: 0, sprint: false });
  const joystickPointerRef = useRef<number | null>(null);
  const runtimeVersionRef = useRef(0);
  const visitorIdRef = useRef<string | null>(null);
  const gameSessionRef = useRef<GameSessionAnalytics | null>(null);
  const analyticsGenerationRef = useRef(0);
  const settingsOpenRef = useRef(false);

  const [offlineSettings, setOfflineSettings] = useState<OfflineSettings>(() => {
    const settings = loadOfflineSettings();
    activeOfflineSettings = settings;
    return settings;
  });
  const [draftSettings, setDraftSettings] = useState<OfflineSettings>(() => activeOfflineSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [matchState, setMatchState] = useState<MatchState>("menu");
  const [score, setScore] = useState({ home: 0, away: 0 });
  const [gameClock, setGameClock] = useState(0);
  const [possessionPercent, setPossessionPercent] = useState({ home: 50, away: 50 });
  const [showTouchControls, setShowTouchControls] = useState(false);
  const [shotChargeUi, setShotChargeUi] = useState(0);
  const [shotChargePosition, setShotChargePosition] = useState({ x: 0, y: 0 });
  const [phaseUi, setPhaseUi] = useState<PlayPhase>("kickoff");
  const [p1AiUi, setP1AiUi] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [joystickKnob, setJoystickKnob] = useState({ x: 0, y: 0 });
  const [minimapSnapshot, setMinimapSnapshot] = useState<MinimapSnapshot | null>(null);
  const scoreUiRef = useRef({ home: 0, away: 0 });
  const gameClockUiRef = useRef(0);
  const possessionUiRef = useRef({ home: 50, away: 50 });
  const phaseUiRef = useRef<PlayPhase>("kickoff");
  const shotChargeUiRef = useRef(0);
  const p1AiUiRef = useRef(false);

  const resultText = score.home > score.away ? "Win" : score.home < score.away ? "Lose" : "Draw";

  const syncP1AiUi = useCallback((enabled: boolean) => {
    if (p1AiUiRef.current === enabled) return;
    p1AiUiRef.current = enabled;
    setP1AiUi(enabled);
  }, []);

  useEffect(() => {
    activeOfflineSettings = offlineSettings;
  }, [offlineSettings]);

  useEffect(() => {
    settingsOpenRef.current = settingsOpen;
  }, [settingsOpen]);

  const openSettings = useCallback(() => {
    setDraftSettings(offlineSettings);
    settingsOpenRef.current = true;
    setSettingsOpen(true);
  }, [offlineSettings]);

  const closeSettings = useCallback(() => {
    settingsOpenRef.current = false;
    setSettingsOpen(false);
  }, []);

  const commitSettings = useCallback(() => {
    const next = normalizeOfflineSettings(draftSettings);
    activeOfflineSettings = next;
    saveOfflineSettings(next);
    setOfflineSettings(next);
    const active = sceneRef.current;
    if (active && active.state !== "playing") {
      applyOfflineSettingsToRuntime(active);
      scoreUiRef.current = { ...active.score };
      setScore({ ...active.score });
      setPhaseUi(active.phase);
      setMinimapSnapshot({
        ball: { x: active.ballPos.x, z: active.ballPos.z },
        players: active.players.map((player) => ({
          id: player.id,
          team: player.team,
          x: player.pos.x,
          z: player.pos.z,
          controlled: player.controlledBy === "p1",
        })),
      });
    } else if (active) {
      scoreUiRef.current = { ...active.score };
      setScore({ ...active.score });
    }
    settingsOpenRef.current = false;
    setSettingsOpen(false);
  }, [draftSettings]);

  useEffect(() => {
    const visitorId = getAnonymousVisitorId();
    visitorIdRef.current = visitorId;
    if (visitorId && typeof window !== "undefined") {
      void trackVisitorPageView(visitorId, window.location.pathname);
    }
  }, []);

  const requestGameFullscreen = useCallback(async () => {
    if (typeof document === "undefined") return;
    const root = mountRef.current?.parentElement ?? document.documentElement;
    type FullscreenElement = HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
      msRequestFullscreen?: () => Promise<void> | void;
    };
    const target = root as FullscreenElement;
    try {
      if (!document.fullscreenElement) {
        const request = target.requestFullscreen ?? target.webkitRequestFullscreen ?? target.msRequestFullscreen;
        await request?.call(target);
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Mobile browsers may reject fullscreen unless this is triggered by a direct tap.
    }
  }, []);

  const performMobileAction = useCallback((action: "kickDown" | "kickUp" | "passDown" | "passUp" | "switch" | "fullscreen" | "ai") => {
    if (settingsOpenRef.current) return;
    const active = sceneRef.current;
    if (action === "fullscreen") {
      void requestGameFullscreen();
      return;
    }
    if (action === "ai") {
      if (!active || active.state !== "playing") return;
      setP1AutopilotMode(active, !active.p1Autopilot);
      syncP1AiUi(active.p1Autopilot);
      return;
    }
    const p1 = active?.players.find((player) => player.controlledBy === "p1");
    if (!active || !p1 || active.state !== "playing" || active.phase !== "open") return;
    if (active.p1Autopilot) return;
    if (action === "switch") {
      switchToClosestTeammateToBall(active, "home", "p1");
    }
    if (action === "passDown") {
      keysRef.current.add("KeyS");
      if (active.ballOwnerId === p1.id && active.possession === "home") {
        beginPassCharge(p1, active);
      }
    }
    if (action === "passUp") {
      releasePassCharge(active, keysRef.current);
      keysRef.current.delete("KeyS");
    }
    if (action === "kickDown") {
      keysRef.current.add("KeyD");
      beginShotCharge(p1, active);
    }
    if (action === "kickUp") {
      releaseShotCharge(active, keysRef.current);
      keysRef.current.delete("KeyD");
    }
  }, [requestGameFullscreen, syncP1AiUi]);

  const resetPositions = useCallback((servingTeam: TeamId = "home") => {
    const active = sceneRef.current;
    if (!active) return;
    clearRuntimeTimeouts(active);
    clearRuntimeAudioSources(active);
    const defaultControlledPlayer = active.players.find(
      (player) => player.team === "home" && player.role !== "keeper" && player.line === "midfielder",
    );
    active.players.forEach((player) => {
      player.controlledBy = player.id === defaultControlledPlayer?.id ? "p1" : undefined;
      player.pos.copy(player.home);
      player.vel.set(0, 0, 0);
      player.heading = headingForHome(player.home.z);
      player.turnRate = 0;
      player.stamina = 1;
      player.mesh.rotation.y = player.heading;
      player.mesh.position.copy(player.pos);
      player.runPhase = 0;
      player.animationSpeed = 0;
      player.kickTimer = 0;
      player.actionCooldown = 0;
      player.tackleTimer = 0;
      player.tackleCooldown = 0;
      player.recoveryTimer = 0;
      player.catchTimer = 0;
      player.diveTimer = 0;
      player.diveSide = 0;
      player.headerTimer = 0;
      player.firstTouchTimer = 0;
      player.firstTouchType = null;
      player.blockTimer = 0;
      player.passRequestTimer = 0;
      player.celebrateTimer = 0;
      player.yellowCards = 0;
      player.sentOff = false;
      player.decisionCooldown = player.number * 0.035;
      player.carryTimer = 0;
      player.stuckTimer = 0;
      player.fallbackTimer = 0;
      player.fallbackTarget.copy(player.home);
      player.lastPos.copy(player.home);
      player.supportRunTimer = 0;
      player.supportRunTarget.copy(player.home);
      player.skillTimer = 0;
      player.skillCooldown = player.number * 0.04;
      player.skillSide = player.number % 2 === 0 ? 1 : -1;
      player.skillMove = null;
      player.aiInputCache.dir.set(0, 0, 0);
      player.aiInputCache.sprint = false;
      player.aiInputCache.speedScale = 1;
      player.aiInputTimer = 0;
      player.forcedMoveTarget.copy(player.home);
      player.forcedMoveTimer = 0;
      player.forcedMoveSprint = false;
      player.ballContactCooldown = 0;
      player.challengeCommitTimer = 0;
      animatePlayer(player, 0);
    });
    active.ballPos.set(0, BALL_RADIUS, 0);
    active.ballVel.set(0, 0, 0);
    active.ballCurve.set(0, 0, 0);
    active.cooldown = 1.2;
    active.possession = null;
    active.ballState = "loose";
    active.ballOwnerId = null;
    active.intendedReceiverId = null;
    active.manualPassReceiverId = null;
    active.defensivePlan = null;
    active.defensivePlanTimer = 0;
    active.defensivePlanGraceTimer = 0;
    active.antiSwarmCorrections = 0;
    active.ballIgnorePlayerId = null;
    active.ballIgnoreTimer = 0;
    active.looseContactPlayerId = null;
    active.looseContactCooldownTimer = 0;
    active.receptionLockPlayerId = null;
    active.receptionLockTimer = 0;
    active.restartProtectionTeam = null;
    active.restartProtectionTimer = 0;
    active.goalKickLockPlayerId = null;
    active.goalKickLockTimer = 0;
    active.goalKickReleaseTimer = 0;
    active.goalKickPendingVelocity.set(0, 0, 0);
    active.goalKickPendingReceiverId = null;
    active.restartBoundaryGuardTimer = 0;
    active.pendingRestartPhase = null;
    active.pendingRestartTeam = servingTeam;
    active.pendingRestartSpot.set(0, BALL_RADIUS, 0);
    active.pendingRestartLabel = "";
    active.pendingRestartTimer = 0;
    active.restartActorId = null;
    active.restartTeam = servingTeam;
    active.restartSpot.set(0, BALL_RADIUS, 0);
    active.restartDirection.copy(upfieldKickDirection(servingTeam, active.half));
    active.p1IdleTimer = 0;
    active.p1Autopilot = false;
    active.lastManualAim.set(0, 0, 0);
    active.lastManualAimTimer = 0;
    active.pendingKickTarget = null;
    active.lastShotTap = 0;
    active.lastClockAdvanceTime = performance.now();
    active.shotCharge = 0;
    active.shotChargingPlayerId = null;
    active.passCharge = 0;
    active.passChargingPlayerId = null;
    active.shotConsumed = false;
    active.tackleLockTimer = 0;
    active.replayTimer = 0;
    active.replayBallStart.set(0, BALL_RADIUS, 0);
    active.replayBallEnd.set(0, BALL_RADIUS, 0);
    active.replayCameraPosition.set(BROADCAST_CAMERA_X, BROADCAST_CAMERA_Y, BROADCAST_CAMERA_Z);
    active.replayCameraLookAt.set(0, 1.4, 0);
    active.replayTrail = [];
    active.replayFrames = [];
    active.lastTouchTeam = servingTeam;
    active.lastTouchPlayerId = null;
    syncBallVisual(active);
    active.ball.rotation.set(0, 0, 0);
    active.lastHudUpdate = 0;
    active.lastRenderTime = 0;
    active.perfFrames = 0;
    active.perfFrameTotal = 0;
    active.perfLastReport = performance.now();
    syncP1AiUi(false);
    setMinimapSnapshot(null);
    syncRuntimeDiagnostics(active);
  }, [syncP1AiUi]);

  const updateJoystickFromPointer = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const radius = rect.width / 2;
    const rawX = event.clientX - centerX;
    const rawY = event.clientY - centerY;
    const distance = Math.min(Math.hypot(rawX, rawY), radius);
    const angle = Math.atan2(rawY, rawX);
    const knobX = Math.cos(angle) * distance;
    const knobY = Math.sin(angle) * distance;
    const strength = clamp(distance / radius, 0, 1);
    const dir = new THREE.Vector3(knobX / radius, 0, knobY / radius);
    if (dir.lengthSq() > 0.01) dir.normalize();
    else dir.set(0, 0, 0);
    virtualControlsRef.current.dir.copy(dir);
    virtualControlsRef.current.strength = strength;
    const active = sceneRef.current;
    if (active && strength > 0.04) noteP1Activity(active);
    setJoystickKnob({ x: knobX, y: knobY });
  }, []);

  const releaseJoystick = useCallback(() => {
    joystickPointerRef.current = null;
    virtualControlsRef.current.dir.set(0, 0, 0);
    virtualControlsRef.current.strength = 0;
    virtualControlsRef.current.sprint = false;
    setJoystickKnob({ x: 0, y: 0 });
  }, []);

  const endMatch = useCallback(() => {
    const active = sceneRef.current;
    analyticsGenerationRef.current += 1;
    if (active) {
      void finishAnalyticsSession(gameSessionRef.current, visitorIdRef.current, active.score);
      gameSessionRef.current = null;
    }
    if (active) {
      active.state = "menu";
      active.phase = "kickoff";
      active.phaseTimer = 0;
      active.eventText = "Kickoff";
      active.eventTimer = 0;
      active.ballOwnerId = null;
      active.ballState = "loose";
      active.possession = null;
      active.shotCharge = 0;
      active.shotChargingPlayerId = null;
      active.passCharge = 0;
      active.passChargingPlayerId = null;
      active.pendingKickTarget = null;
      active.intendedReceiverId = null;
      active.manualPassReceiverId = null;
      active.ballIgnorePlayerId = null;
      active.ballIgnoreTimer = 0;
      active.looseContactPlayerId = null;
      active.looseContactCooldownTimer = 0;
      active.receptionLockPlayerId = null;
      active.receptionLockTimer = 0;
      active.restartProtectionTeam = null;
      active.restartProtectionTimer = 0;
      active.goalKickLockPlayerId = null;
      active.goalKickLockTimer = 0;
      active.goalKickReleaseTimer = 0;
      active.goalKickPendingVelocity.set(0, 0, 0);
      active.goalKickPendingReceiverId = null;
      active.restartBoundaryGuardTimer = 0;
      active.replayTrail = [];
      active.replayFrames = [];
      active.replayTimer = 0;
      resetPositions("home");
    }
    keysRef.current.clear();
    releaseJoystick();
    setMatchState("menu");
    scoreUiRef.current = { home: 0, away: 0 };
    gameClockUiRef.current = 0;
    possessionUiRef.current = { home: 50, away: 50 };
    phaseUiRef.current = "kickoff";
    shotChargeUiRef.current = 0;
    setPhaseUi("kickoff");
    setScore({ home: 0, away: 0 });
    setGameClock(0);
    setPossessionPercent({ home: 50, away: 50 });
    setShotChargeUi(0);
    setMinimapSnapshot(null);
    syncP1AiUi(false);
  }, [releaseJoystick, resetPositions, syncP1AiUi]);

  const startMatch = useCallback(() => {
    const active = sceneRef.current;
    if (!active) return;
    if (showTouchControls) void requestGameFullscreen();
    ensureAudio(active);
    const visitorId = visitorIdRef.current ?? getAnonymousVisitorId();
    visitorIdRef.current = visitorId;
    const analyticsGeneration = analyticsGenerationRef.current + 1;
    analyticsGenerationRef.current = analyticsGeneration;
    if (visitorId) {
      gameSessionRef.current = { id: null, startedAt: performance.now(), startedScore: { home: 0, away: 0 } };
      void startAnalyticsSession(visitorId).then((id) => {
        if (analyticsGenerationRef.current === analyticsGeneration && gameSessionRef.current) {
          gameSessionRef.current.id = id;
        }
      });
    }
    active.state = "playing";
    active.phase = "kickoff";
    active.phaseTimer = 1.4;
    active.restartTeam = "home";
    active.restartSpot.set(0, BALL_RADIUS, 0);
    active.restartDirection.set(0, 0, Math.sign(attackingGoalZ("home", 1)));
    active.restartActorId = null;
    active.half = 1;
    active.gameClock = 0;
    active.frameCount = 0;
    active.lastMatchUpdate = performance.now();
    active.lastClockAdvanceTime = active.lastMatchUpdate;
    active.halftimeDone = false;
    active.eventText = "KICKOFF";
    active.eventTimer = 0;
    active.score = { home: 0, away: 0 };
    active.possessionTime = { home: 0, away: 0 };
    active.lastTime = performance.now();
    active.lastMatchUpdate = active.lastTime;
    active.lastClockAdvanceTime = active.lastTime;
    active.restartCount += 1;
    setFormationHomes(active.players, 1);
    keysRef.current.clear();
    releaseJoystick();
    scoreUiRef.current = { home: 0, away: 0 };
    gameClockUiRef.current = 0;
    possessionUiRef.current = { home: 50, away: 50 };
    phaseUiRef.current = "kickoff";
    shotChargeUiRef.current = 0;
    setScore({ home: 0, away: 0 });
    setGameClock(0);
    setPossessionPercent({ home: 50, away: 50 });
    setShotChargeUi(0);
    setShotChargePosition({ x: 0, y: 0 });
    resetPositions("home");
    startDirectKickoff(active, "home");
    setMinimapSnapshot({
      ball: { x: active.ballPos.x, z: active.ballPos.z },
      players: active.players.map((player) => ({
        id: player.id,
        team: player.team,
        x: player.pos.x,
        z: player.pos.z,
        controlled: player.controlledBy === "p1",
      })),
    });
    setPhaseUi(active.phase);
    setMatchState("playing");
    syncRuntimeDiagnostics(active);
  }, [releaseJoystick, requestGameFullscreen, resetPositions, showTouchControls]);

  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)");
    const compact = window.matchMedia("(max-width: 1180px)");
    const forcedTouch = new URLSearchParams(window.location.search).has("touch");
    const update = () => setShowTouchControls(forcedTouch || coarse.matches || compact.matches);
    update();
    coarse.addEventListener("change", update);
    compact.addEventListener("change", update);
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      coarse.removeEventListener("change", update);
      compact.removeEventListener("change", update);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    while (mount.firstChild) mount.removeChild(mount.firstChild);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#86cfff");
    scene.fog = null;

    const camera = new THREE.PerspectiveCamera(48, mount.clientWidth / mount.clientHeight, 0.1, 260);
    camera.position.set(BROADCAST_CAMERA_X, BROADCAST_CAMERA_Y, BROADCAST_CAMERA_Z);
    camera.up.set(0, 1, 0);

    const runtimeVersion = runtimeVersionRef.current + 1;
    runtimeVersionRef.current = runtimeVersion;

    const perfElement = new URLSearchParams(window.location.search).has("perf")
      ? document.createElement("div")
      : null;
    if (perfElement) {
      perfElement.style.position = "absolute";
      perfElement.style.left = "8px";
      perfElement.style.bottom = "8px";
      perfElement.style.zIndex = "80";
      perfElement.style.padding = "6px 8px";
      perfElement.style.borderRadius = "6px";
      perfElement.style.background = "rgba(0,0,0,0.72)";
      perfElement.style.color = "#bbf7d0";
      perfElement.style.font = "700 12px monospace";
      perfElement.style.pointerEvents = "none";
      perfElement.textContent = "profiling...";
      mount.appendChild(perfElement);
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    let rendererCssWidth = 0;
    let rendererCssHeight = 0;
    let rendererDpr = 0;
    const resolveRendererDpr = (width: number, height: number) => {
      const nativeDpr = window.devicePixelRatio || 1;
      const pixelBudget = 2_750_000;
      const areaDpr = Math.sqrt(pixelBudget / Math.max(1, width * height));
      return clamp(Math.min(nativeDpr, 1.65, areaDpr), 1, 1.65);
    };
    renderer.setPixelRatio(resolveRendererDpr(Math.max(1, mount.clientWidth), Math.max(1, mount.clientHeight)));
    renderer.setClearColor("#86cfff", 1);
    renderer.shadowMap.enabled = false;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.tabIndex = 0;
    let resetRuntimeTimingForResize: (() => void) | null = null;
    const applyRendererSize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      const dpr = resolveRendererDpr(width, height);
      if (Math.abs(width - rendererCssWidth) < 1 && Math.abs(height - rendererCssHeight) < 1 && Math.abs(dpr - rendererDpr) < 0.03) return;
      rendererCssWidth = width;
      rendererCssHeight = height;
      rendererDpr = dpr;
      renderer.setPixelRatio(dpr);
      renderer.domElement.dataset.rendererDpr = dpr.toFixed(2);
      renderer.domElement.dataset.rendererPixels = String(Math.round(width * height * dpr * dpr));
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      resetRuntimeTimingForResize?.();
    };
    applyRendererSize();
    mount.appendChild(renderer.domElement);
    const pointer = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    const fieldPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const kickPoint = new THREE.Vector3();
    const onFieldPointerDown = (event: PointerEvent) => {
      const active = sceneRef.current;
      if (!active || active.state !== "playing" || active.phase !== "open" || event.button !== 0) return;
      if (active.p1Autopilot) return;
      noteP1Activity(active);
      const p1 = active.players.find((player) => player.controlledBy === "p1");
      if (!p1) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, active.camera);
      if (!raycaster.ray.intersectPlane(fieldPlane, kickPoint)) return;
      active.pendingKickTarget = kickPoint.clone().setY(BALL_RADIUS);
    };
    renderer.domElement.addEventListener("pointerdown", onFieldPointerDown);

    scene.add(new THREE.HemisphereLight("#dff7ff", "#88c98f", 2.6));
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(180, 12, 8),
      new THREE.MeshBasicMaterial({ color: "#7cc7ff", side: THREE.BackSide, fog: false }),
    );
    sky.position.y = 30;
    scene.add(sky);
    const sun = new THREE.DirectionalLight("#ffffff", 2.2);
    sun.position.set(16, 42, 28);
    scene.add(sun);

    addPitch(scene);

    const lineMat = new THREE.MeshBasicMaterial({ color: "#eaffff", transparent: true, opacity: 0.68 });
    const centerLine = new THREE.Mesh(new THREE.BoxGeometry(FIELD_W, 0.04, 0.18), lineMat);
    centerLine.position.y = 0.08;
    scene.add(centerLine);
    const centerCircle = new THREE.Mesh(new THREE.TorusGeometry(8, 0.08, 8, 72), lineMat);
    centerCircle.rotation.x = Math.PI / 2;
    centerCircle.position.y = 0.1;
    scene.add(centerCircle);
    addLightweightStadium(scene);

    addGoal(scene, -1);
    addGoal(scene, 1);

    const ball = createSoccerBall();
    scene.add(ball);
    const ballShadow = createBlobShadow(0.62, 0.24);
    scene.add(ballShadow);

    const players = formationPlayers(1);
    players.forEach((player) => scene.add(player.mesh));

    const runtime: MatchRuntime = {
      engineId: nextEngineId,
      renderer,
      scene,
      camera,
      cameraLookAt: new THREE.Vector3(0, 0.9, 0),
      ball,
      ballShadow,
      players,
      frame: 0,
      frameRunning: false,
      matchTick: null,
      frameCount: 0,
      lastTime: performance.now(),
      lastRenderTime: 0,
      lastMatchUpdate: performance.now(),
      lastClockAdvanceTime: performance.now(),
      lastHudUpdate: 0,
      state: "menu",
      phase: "kickoff",
      phaseTimer: 0,
      restartTeam: "home",
      restartSpot: new THREE.Vector3(0, BALL_RADIUS, 0),
      restartDirection: new THREE.Vector3(0, 0, -1),
      restartActorId: null,
      half: 1,
      gameClock: 0,
      halftimeDone: false,
      eventText: "Kickoff",
      eventTimer: 0,
      ballPos: new THREE.Vector3(0, BALL_RADIUS, 0),
      ballVel: new THREE.Vector3(),
      ballCurve: new THREE.Vector3(),
      score: { home: 0, away: 0 },
      possessionTime: { home: 0, away: 0 },
      cooldown: 0,
      possession: null,
      ballState: "loose",
      ballOwnerId: null,
      intendedReceiverId: null,
      manualPassReceiverId: null,
      ballIgnorePlayerId: null,
      ballIgnoreTimer: 0,
      looseContactPlayerId: null,
      looseContactCooldownTimer: 0,
      receptionLockPlayerId: null,
      receptionLockTimer: 0,
      possessionStableOwnerId: null,
      possessionStabilityTimer: 0,
      defensivePlan: null,
      defensivePlanTimer: 0,
      defensivePlanGraceTimer: 0,
      antiSwarmCorrections: 0,
      collisionResolutionsThisFrame: 0,
      maxCollisionCorrection: 0,
      maxDefenderFrameDisplacement: 0,
      abnormalMovementClamps: 0,
      pendingKickTarget: null,
      lastShotTap: 0,
      shotCharge: 0,
      shotChargingPlayerId: null,
      passCharge: 0,
      passChargingPlayerId: null,
      shotConsumed: false,
      tackleLockTimer: 0,
      audio: null,
      activeAudioSources: new Set<AudioScheduledSourceNode>(),
      scheduledTimeouts: new Set<number>(),
      lastKickSound: 0,
      lastCheerSound: 0,
      lastTouchTeam: "home",
      lastTouchPlayerId: null,
      restartProtectionTeam: null,
      restartProtectionTimer: 0,
      goalKickLockPlayerId: null,
      goalKickLockTimer: 0,
      goalKickReleaseTimer: 0,
      goalKickPendingVelocity: new THREE.Vector3(),
      goalKickPendingReceiverId: null,
      restartBoundaryGuardTimer: 0,
      pendingRestartPhase: null,
      pendingRestartTeam: "home",
      pendingRestartSpot: new THREE.Vector3(),
      pendingRestartLabel: "",
      pendingRestartTimer: 0,
      p1IdleTimer: 0,
      p1Autopilot: false,
      lastManualAim: new THREE.Vector3(),
      lastManualAimTimer: 0,
      perfElement,
      perfFrames: 0,
      perfFrameTotal: 0,
      perfLastReport: performance.now(),
      replayTimer: 0,
      replayBallStart: new THREE.Vector3(0, BALL_RADIUS, 0),
      replayBallEnd: new THREE.Vector3(0, BALL_RADIUS, 0),
      replayCameraPosition: new THREE.Vector3(BROADCAST_CAMERA_X, BROADCAST_CAMERA_Y, BROADCAST_CAMERA_Z),
      replayCameraLookAt: new THREE.Vector3(0, 1.4, 0),
      replayTrail: [],
      replayFrames: [],
      restartCount: 0,
      visibilityPauseCount: 0,
    };
    nextEngineId += 1;
    sceneRef.current = runtime;
    syncRuntimeDiagnostics(runtime);
    const requestedGoalKickTests = clamp(
      Number(new URLSearchParams(window.location.search).get("goalKickTest") ?? "0"),
      0,
      10,
    );
    let remainingGoalKickTests = requestedGoalKickTests;
    let nextGoalKickTestAt = performance.now() + 900;
    runtime.renderer.domElement.dataset.goalKickTestsRequested = String(requestedGoalKickTests);
    const requestedKeeperParryTests = clamp(
      Number(new URLSearchParams(window.location.search).get("keeperParryTest") ?? "0"),
      0,
      8,
    );
    let remainingKeeperParryTests = requestedKeeperParryTests;
    let nextKeeperParryTestAt = performance.now() + 1200;
    runtime.renderer.domElement.dataset.keeperParryTestsRequested = String(requestedKeeperParryTests);
    const tacticalTest = new URLSearchParams(window.location.search).get("tacticalTest") ?? "";
    const manualDefenseTest = tacticalTest.includes("manual-defense");
    const aimChargeTest = new URLSearchParams(window.location.search).has("aimChargeTest");
    let tacticalTestApplied = false;
    const requestedHeaderTests = clamp(Number(new URLSearchParams(window.location.search).get("headerTest") ?? "0"), 0, 15);
    let remainingHeaderTests = requestedHeaderTests;
    let nextHeaderTestAt = performance.now() + 1200;
    runtime.renderer.domElement.dataset.headerTestsRequested = String(requestedHeaderTests);
    runtime.renderer.domElement.dataset.headerExpectedContacts = "0";
    const requestedAerialReceptionTests = clamp(
      Number(new URLSearchParams(window.location.search).get("aerialReceptionTest") ?? "0"),
      0,
      20,
    );
    let remainingAerialReceptionTests = requestedAerialReceptionTests;
    let nextAerialReceptionTestAt = performance.now() + 1200;
    let pendingAerialReceptionCheck: { receiverId: string; at: number; baselineTouches: number } | null = null;
    runtime.renderer.domElement.dataset.aerialReceptionTestsRequested = String(requestedAerialReceptionTests);
    runtime.renderer.domElement.dataset.aerialReceptionTestsPassed = "0";
    runtime.renderer.domElement.dataset.aerialReceptionTestsFailed = "0";
    const requestedTackleTests = clamp(Number(new URLSearchParams(window.location.search).get("tackleTest") ?? "0"), 0, 20);
    let remainingTackleTests = requestedTackleTests;
    let nextTackleTestAt = performance.now() + 1200;
    let pendingTackleCheck: { attackerId: string; at: number } | null = null;
    runtime.renderer.domElement.dataset.tackleTestsRequested = String(requestedTackleTests);
    runtime.renderer.domElement.dataset.tackleTestsPassed = "0";
    runtime.renderer.domElement.dataset.tackleTestsFailed = "0";
    const requestedContactTests = clamp(Number(new URLSearchParams(window.location.search).get("contactTest") ?? "0"), 0, 15);
    let remainingContactTests = requestedContactTests;
    let nextContactTestAt = performance.now() + 1200;
    let pendingContactCheck: { aId: string; bId: string; at: number } | null = null;
    runtime.renderer.domElement.dataset.contactTestsRequested = String(requestedContactTests);
    runtime.renderer.domElement.dataset.contactTestsPassed = "0";

    let resizeFrame: number | null = null;
    const onResize = () => {
      if (runtimeVersionRef.current !== runtimeVersion || sceneRef.current !== runtime || !mount) return;
      if (resizeFrame !== null) return;
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        if (runtimeVersionRef.current !== runtimeVersion || sceneRef.current !== runtime) return;
        applyRendererSize();
      });
    };
    window.addEventListener("resize", onResize);

    let tabHidden = document.hidden;
    let scheduleFrame: () => void = () => undefined;
    const resetRuntimeTiming = (now = performance.now()) => {
      runtime.lastTime = now;
      runtime.lastMatchUpdate = now;
      runtime.lastClockAdvanceTime = now;
      runtime.lastRenderTime = now;
      runtime.perfFrames = 0;
      runtime.perfFrameTotal = 0;
      runtime.perfLastReport = now;
    };
    resetRuntimeTimingForResize = () => resetRuntimeTiming();
    const pauseRuntimeLoop = (now = performance.now()) => {
      if (runtimeVersionRef.current !== runtimeVersion || sceneRef.current !== runtime) return;
      if (!tabHidden) runtime.visibilityPauseCount += 1;
      tabHidden = true;
      resetRuntimeTiming(now);
      keysRef.current.clear();
      virtualControlsRef.current.dir.set(0, 0, 0);
      virtualControlsRef.current.strength = 0;
      virtualControlsRef.current.sprint = false;
      runtime.players.forEach((player) => {
        player.aiInputTimer = 0;
        player.aiInputCache.dir.set(0, 0, 0);
        player.aiInputCache.sprint = false;
      });
      if (runtime.frameRunning) window.cancelAnimationFrame(runtime.frame);
      runtime.frameRunning = false;
      if (runtime.audio?.state === "running") void runtime.audio.suspend().catch(() => undefined);
      syncRuntimeDiagnostics(runtime);
    };
    const resumeRuntimeLoop = (now = performance.now()) => {
      if (runtimeVersionRef.current !== runtimeVersion || sceneRef.current !== runtime || document.hidden) return;
      tabHidden = false;
      resetRuntimeTiming(now);
      runtime.players.forEach((player) => {
        player.aiInputTimer = 0;
      });
      if (runtime.audio?.state === "suspended") void runtime.audio.resume().catch(() => undefined);
      scheduleFrame();
      syncRuntimeDiagnostics(runtime);
    };
    const onVisibilityChange = () => {
      if (document.hidden) pauseRuntimeLoop();
      else resumeRuntimeLoop();
    };
    const onWindowBlur = () => pauseRuntimeLoop();
    const onWindowFocus = () => resumeRuntimeLoop();
    const onPageHide = () => pauseRuntimeLoop();
    const onPageShow = () => resumeRuntimeLoop();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("focus", onWindowFocus);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);

    const runMatchTick = (now = performance.now()) => {
      if (runtimeVersionRef.current !== runtimeVersion || sceneRef.current !== runtime) return;
      const active = runtime;
      if (active.state !== "playing") return;
      const dt = Math.min(Math.max((now - active.lastMatchUpdate) / 1000, 0), 0.033);
      active.lastMatchUpdate = now;
      if (dt <= 0) return;
      const clockBeforeUpdate = active.gameClock;
      try {
        active.cooldown = Math.max(0, active.cooldown - dt);
        if (aimChargeTest && active.phase === "open") {
          const controlledOwner = active.players.find((player) => player.controlledBy === "p1" && active.ballOwnerId === player.id) ?? null;
          if (controlledOwner) {
            keysRef.current.add("KeyS");
            active.passChargingPlayerId = controlledOwner.id;
            active.passCharge = 1;
          }
        }
        updateMatch(active, keysRef.current, dt, virtualControlsRef.current);
        active.frameCount += 1;
        if (!tacticalTestApplied && tacticalTest && active.phase === "open" && active.gameClock > (manualDefenseTest ? 0.5 : 8)) {
          const scenarioTeam: TeamId = manualDefenseTest ? "away" : "home";
          const scenarioLine: PlayerLine = tacticalTest.includes("buildup") ? "defender" : "forward";
          const attacker = active.players.find((player) => player.team === scenarioTeam && player.line === scenarioLine && !player.sentOff) ?? null;
          if (attacker) {
            const scenarioX = tacticalTest.includes("left") ? -25 : tacticalTest.includes("right") ? 25 : 0;
            const scenarioZ = manualDefenseTest ? 43 : tacticalTest.includes("buildup") ? 42 : tacticalTest.includes("six") ? -63 : tacticalTest.includes("wide") ? -54 : -43;
            attacker.pos.set(scenarioX, 0, scenarioZ);
            attacker.vel.set(0, 0, 0);
            attacker.heading = headingFromDirection(upfieldKickDirection(scenarioTeam, active.half));
            attacker.mesh.rotation.y = attacker.heading;
            attacker.mesh.position.copy(attacker.pos);
            if (tacticalTest.includes("multi") && scenarioTeam === "home") {
              const supportAttackers = active.players.filter((player) => (
                player.team === scenarioTeam
                && player.id !== attacker.id
                && player.role !== "keeper"
                && !player.sentOff
              )).sort((a, b) => {
                const order = (line: PlayerLine) => line === "forward" ? 0 : line === "midfielder" ? 1 : 2;
                return order(a.line) - order(b.line);
              });
              const attackPositions = [
                new THREE.Vector3(2, 0, -64),
                new THREE.Vector3(-19, 0, -54),
                new THREE.Vector3(15, 0, -49),
                new THREE.Vector3(-8, 0, -44),
                new THREE.Vector3(24, 0, -38),
              ];
              supportAttackers.slice(0, attackPositions.length).forEach((player, index) => {
                player.pos.copy(attackPositions[index]);
                player.vel.set(0, 0, 0);
                player.mesh.position.copy(player.pos);
              });
            }
            if (manualDefenseTest) {
              const defender = active.players
                .filter((player) => player.team === "home" && player.line === "defender" && !player.sentOff)
                .sort((a, b) => a.pos.distanceTo(attacker.pos) - b.pos.distanceTo(attacker.pos))[0] ?? null;
              if (defender) {
                const goalSide = new THREE.Vector3(0, 0, teamGoalZ("home", active.half)).sub(attacker.pos).setY(0).normalize();
                defender.pos.copy(attacker.pos).add(goalSide.multiplyScalar(5.2));
                defender.vel.set(0, 0, 0);
                defender.mesh.position.copy(defender.pos);
                setControlledPlayer(active, defender, "p1");
              }
            } else {
              setControlledPlayer(active, attacker, "p1");
            }
            releasePossession(active, "loose");
            active.ballPos.copy(attacker.pos).add(facingDirection(attacker).multiplyScalar(0.72)).setY(BALL_RADIUS);
            active.ballVel.set(0, 0, 0);
            takePossession(attacker, active);
            const holdTacticalScenario = manualDefenseTest || tacticalTest.includes("hold");
            attacker.decisionCooldown = holdTacticalScenario ? 30 : tacticalTest.includes("wide") ? 0.35 : 4.5;
            if (!tacticalTest.includes("wide")) {
              active.restartProtectionTeam = scenarioTeam;
              active.restartProtectionTimer = holdTacticalScenario ? 30 : 7;
              active.tackleLockTimer = holdTacticalScenario ? 30 : 7;
            }
            active.renderer.domElement.dataset.tacticalTest = tacticalTest;
            tacticalTestApplied = true;
          }
        }
        if (pendingContactCheck && now >= pendingContactCheck.at) {
          const a = active.players.find((player) => player.id === pendingContactCheck?.aId) ?? null;
          const b = active.players.find((player) => player.id === pendingContactCheck?.bId) ?? null;
          if (a && b && a.pos.distanceTo(b.pos) > PERSONAL_SPACE * 0.72 && Number.isFinite(a.pos.x + a.pos.z + b.pos.x + b.pos.z)) {
            active.renderer.domElement.dataset.contactTestsPassed = String(Number(active.renderer.domElement.dataset.contactTestsPassed ?? "0") + 1);
          }
          pendingContactCheck = null;
        }
        if (remainingContactTests > 0 && !pendingContactCheck && active.phase === "open" && now >= nextContactTestAt) {
          const a = active.players.find((player) => player.team === "home" && player.role !== "keeper" && !player.sentOff) ?? null;
          const b = active.players.find((player) => player.team === "away" && player.role !== "keeper" && !player.sentOff) ?? null;
          if (a && b) {
            const testIndex = requestedContactTests - remainingContactTests;
            const origin = new THREE.Vector3((testIndex % 3 - 1) * 8, 0, (testIndex % 5 - 2) * 5);
            a.pos.copy(origin);
            b.pos.copy(origin).add(new THREE.Vector3(testIndex % 2 === 0 ? 0 : 0.05, 0, 0));
            a.vel.set(0, 0, 0);
            b.vel.set(0, 0, 0);
            a.contactLockTimer = 0;
            b.contactLockTimer = 0;
            a.mesh.position.copy(a.pos);
            b.mesh.position.copy(b.pos);
            pendingContactCheck = { aId: a.id, bId: b.id, at: now + 520 };
            remainingContactTests -= 1;
            nextContactTestAt = now + 660;
            active.renderer.domElement.dataset.contactTestsRemaining = String(remainingContactTests);
          }
        }
        if (remainingHeaderTests > 0 && active.phase === "open" && now >= nextHeaderTestAt) {
          const headerPlayer = active.players.find((player) => player.team === "home" && player.line === "forward" && !player.sentOff) ?? null;
          if (headerPlayer) {
            const testIndex = requestedHeaderTests - remainingHeaderTests;
            const shouldContact = testIndex % 3 !== 2;
            headerPlayer.pos.set((testIndex % 5 - 2) * 5, 0, -20 + (testIndex % 3) * 4);
            headerPlayer.vel.set(testIndex % 2 === 0 ? 1.8 : 0, 0, -2.2);
            headerPlayer.heading = headingFromDirection(new THREE.Vector3(0, 0, -1));
            headerPlayer.mesh.rotation.y = headerPlayer.heading;
            headerPlayer.mesh.position.copy(headerPlayer.pos);
            headerPlayer.mesh.updateMatrixWorld(true);
            const head = headerPlayer.mesh.getObjectByName("head");
            const headPoint = head?.getWorldPosition(new THREE.Vector3()) ?? headerPlayer.pos.clone().setY(2.3);
            const lateralMiss = new THREE.Vector3(1.15, testIndex % 2 === 0 ? 0 : 0.85, -0.42);
            const velocity = new THREE.Vector3(0, -1.8, 15.5);
            releasePossession(active, "kicked");
            active.ballPos.copy(headPoint).add(shouldContact ? new THREE.Vector3(0, 0.02, -0.42) : lateralMiss);
            active.ballVel.copy(velocity);
            active.ballCurve.set(0, 0, 0);
            active.intendedReceiverId = shouldContact ? headerPlayer.id : null;
            active.ballIgnorePlayerId = null;
            active.ballIgnoreTimer = 0;
            headerPlayer.headerTimer = 0;
            headerPlayer.ballContactCooldown = 0;
            if (shouldContact) {
              active.renderer.domElement.dataset.headerExpectedContacts = String(Number(active.renderer.domElement.dataset.headerExpectedContacts ?? "0") + 1);
            }
            remainingHeaderTests -= 1;
            nextHeaderTestAt = now + 720;
            active.renderer.domElement.dataset.headerTestsRemaining = String(remainingHeaderTests);
          }
        }
        if (pendingAerialReceptionCheck && now >= pendingAerialReceptionCheck.at) {
          const received = (
            Number(active.renderer.domElement.dataset.aerialFirstTouches ?? "0") > pendingAerialReceptionCheck.baselineTouches
            && active.renderer.domElement.dataset.lastReceived === pendingAerialReceptionCheck.receiverId
          );
          const resultKey = received ? "aerialReceptionTestsPassed" : "aerialReceptionTestsFailed";
          active.renderer.domElement.dataset[resultKey] = String(Number(active.renderer.domElement.dataset[resultKey] ?? "0") + 1);
          pendingAerialReceptionCheck = null;
          nextAerialReceptionTestAt = now + 280;
        }
        if (
          remainingAerialReceptionTests > 0
          && !pendingAerialReceptionCheck
          && remainingHeaderTests === 0
          && active.phase === "open"
          && now >= nextAerialReceptionTestAt
        ) {
          const testIndex = requestedAerialReceptionTests - remainingAerialReceptionTests;
          const receiver = active.players.find((player) => player.team === "home" && player.line === "forward" && !player.sentOff) ?? null;
          if (receiver) {
            const testController = active.players.find((player) => player.team === "home" && player.line === "midfielder" && !player.sentOff) ?? null;
            if (testController) setControlledPlayer(active, testController, "p1");
            const diagonalSide = testIndex % 2 === 0 ? -1 : 1;
            const target = new THREE.Vector3(diagonalSide * (4 + testIndex % 4), 0, -18 - (testIndex % 3) * 5);
            active.players.forEach((player) => {
              if (player.id === receiver.id || player.role === "keeper") return;
              const testSide = player.team === "home" ? -1 : 1;
              player.pos.set(testSide * (FIELD_W / 2 - 6 - (player.number % 3) * 2.2), 0, 24 + (player.number % 5) * 6);
              player.vel.set(0, 0, 0);
              player.mesh.position.copy(player.pos);
            });
            if (testIndex >= 15) {
              const pressureDefender = active.players.find((player) => player.team === "away" && player.line === "defender" && !player.sentOff) ?? null;
              if (pressureDefender) {
                pressureDefender.pos.copy(target).add(new THREE.Vector3(-diagonalSide * 4.8, 0, 3.2));
                pressureDefender.mesh.position.copy(pressureDefender.pos);
              }
            }
            const horizontalDirection = new THREE.Vector3(diagonalSide * 0.26, 0, -0.97).normalize();
            const horizontalSpeed = 14 + (testIndex % 4) * 1.4;
            const verticalSpeed = [7.4, 9.2, 10.8, 6.4, 8.5][testIndex % 5];
            const flightTime = (verticalSpeed + Math.sqrt(verticalSpeed * verticalSpeed + 2 * BALL_GRAVITY * 0.02)) / BALL_GRAVITY;
            const source = target.clone().addScaledVector(horizontalDirection, -horizontalSpeed * flightTime);
            receiver.pos.copy(target).add(new THREE.Vector3(-diagonalSide * (3.8 + (testIndex % 3) * 0.55), 0, 2.5 + (testIndex % 2) * 0.55));
            receiver.vel.set(0, 0, 0);
            receiver.heading = headingFromDirection(source.clone().sub(receiver.pos).setY(0));
            receiver.mesh.rotation.y = receiver.heading;
            receiver.mesh.position.copy(receiver.pos);
            receiver.firstTouchTimer = 0;
            receiver.firstTouchType = null;
            receiver.headerTimer = 0;
            receiver.ballContactCooldown = 0;
            receiver.actionCooldown = 0;
            receiver.recoveryTimer = 0;
            receiver.decisionCooldown = 0;
            releasePossession(active, "kicked");
            active.ballPos.copy(source).setY(testIndex % 6 === 4 ? 1.3 : BALL_RADIUS + 0.02);
            active.ballVel.copy(horizontalDirection.multiplyScalar(horizontalSpeed));
            active.ballVel.y = testIndex % 6 === 4 ? 2.2 : verticalSpeed;
            active.ballCurve.set(0, 0, 0);
            active.intendedReceiverId = receiver.id;
            active.ballIgnorePlayerId = null;
            active.ballIgnoreTimer = 0;
            active.receptionLockPlayerId = null;
            active.receptionLockTimer = 0;
            pendingAerialReceptionCheck = {
              receiverId: receiver.id,
              at: now + 2600,
              baselineTouches: Number(active.renderer.domElement.dataset.aerialFirstTouches ?? "0"),
            };
            remainingAerialReceptionTests -= 1;
            active.renderer.domElement.dataset.aerialReceptionTestsRemaining = String(remainingAerialReceptionTests);
          }
        }
        if (pendingTackleCheck && now >= pendingTackleCheck.at) {
          const wonOrContested = active.ballOwnerId !== pendingTackleCheck.attackerId;
          const resultKey = wonOrContested ? "tackleTestsPassed" : "tackleTestsFailed";
          active.renderer.domElement.dataset[resultKey] = String(Number(active.renderer.domElement.dataset[resultKey] ?? "0") + 1);
          pendingTackleCheck = null;
          nextTackleTestAt = now + 260;
        }
        if (
          remainingTackleTests > 0
          && !pendingTackleCheck
          && remainingAerialReceptionTests === 0
          && active.phase === "open"
          && now >= nextTackleTestAt
        ) {
          const testIndex = requestedTackleTests - remainingTackleTests;
          const attacker = active.players.find((player) => player.team === "home" && player.line === "forward" && !player.sentOff) ?? null;
          const defender = active.players.find((player) => player.team === "away" && player.line === "defender" && !player.sentOff) ?? null;
          if (attacker && defender) {
            const attackDirection = upfieldKickDirection("home", active.half);
            attacker.pos.set((testIndex % 5 - 2) * 3.2, 0, -15 - (testIndex % 3) * 3);
            attacker.vel.set(0, 0, 0);
            attacker.heading = headingFromDirection(attackDirection);
            attacker.mesh.rotation.y = attacker.heading;
            attacker.mesh.position.copy(attacker.pos);
            defender.pos.copy(attacker.pos).add(attackDirection.clone().multiplyScalar(2.3 + (testIndex % 3) * 0.18));
            defender.pos.x += (testIndex % 2 === 0 ? -1 : 1) * 0.38;
            defender.vel.set(0, 0, 0);
            defender.heading = headingFromDirection(attacker.pos.clone().sub(defender.pos).setY(0));
            defender.mesh.rotation.y = defender.heading;
            defender.mesh.position.copy(defender.pos);
            defender.tackleCooldown = 0;
            defender.recoveryTimer = 0;
            defender.decisionCooldown = 0;
            defender.challengeCommitTimer = 0;
            releasePossession(active, "loose");
            active.ballPos.copy(attacker.pos).add(attackDirection.clone().multiplyScalar(DRIBBLE_DISTANCE)).setY(BALL_RADIUS);
            active.ballVel.set(0, 0, 0);
            active.ballCurve.set(0, 0, 0);
            active.tackleLockTimer = 0;
            active.restartProtectionTeam = null;
            active.restartProtectionTimer = 0;
            takePossession(attacker, active);
            attacker.carryTimer = 0.75;
            pendingTackleCheck = { attackerId: attacker.id, at: now + 1250 };
            remainingTackleTests -= 1;
            active.renderer.domElement.dataset.tackleTestsRemaining = String(remainingTackleTests);
          }
        }
        if (
          remainingGoalKickTests > 0
          && active.phase === "open"
          && active.pendingRestartPhase === null
          && now >= nextGoalKickTestAt
        ) {
          const testIndex = requestedGoalKickTests - remainingGoalKickTests;
          const testTeam: TeamId = testIndex % 2 === 0 ? "home" : "away";
          stopForRestart(
            active,
            "goal-kick",
            testTeam,
            goalKickBallSpotForTeam(testTeam, active.half),
            `${testTeam.toUpperCase()} GOAL KICK`,
          );
          remainingGoalKickTests -= 1;
          nextGoalKickTestAt = now + 3400;
          active.renderer.domElement.dataset.goalKickTestsRemaining = String(remainingGoalKickTests);
        }
        if (
          remainingKeeperParryTests > 0
          && remainingGoalKickTests === 0
          && active.phase === "open"
          && active.pendingRestartPhase === null
          && now >= nextKeeperParryTestAt
        ) {
          const testIndex = requestedKeeperParryTests - remainingKeeperParryTests;
          const keeperTeam: TeamId = testIndex % 2 === 0 ? "home" : "away";
          const ownZ = teamGoalZ(keeperTeam, active.half);
          const intoField = -Math.sign(ownZ) || 1;
          const testX = [-11, -5.5, 5.5, 11][testIndex % 4];
          const targetX = [-4.8, -2.2, 2.2, 4.8][testIndex % 4];
          const testKeeper = active.players.find((player) => player.team === keeperTeam && player.role === "keeper") ?? null;
          if (testKeeper) {
            testKeeper.pos.set(targetX, 0, ownZ + intoField * 6.2);
            testKeeper.vel.set(0, 0, 0);
            testKeeper.mesh.position.copy(testKeeper.pos);
            testKeeper.diveTimer = 0;
            testKeeper.recoveryTimer = 0;
          }
          releasePossession(active, "kicked");
          active.intendedReceiverId = null;
          active.manualPassReceiverId = null;
          active.ballIgnorePlayerId = null;
          active.ballIgnoreTimer = 0;
          active.ballPos.set(testX, 1.72 + (testIndex % 2) * 0.32, ownZ + intoField * 13.5);
          const shotDirection = new THREE.Vector3(targetX, 1.7, ownZ + Math.sign(ownZ) * 1.8)
            .sub(active.ballPos)
            .normalize();
          active.ballVel.copy(shotDirection.multiplyScalar(38));
          active.ballCurve.set(0, 0, 0);
          active.lastTouchTeam = opponent(keeperTeam);
          active.lastTouchPlayerId = null;
          active.cooldown = 0;
          remainingKeeperParryTests -= 1;
          nextKeeperParryTestAt = now + 2800;
          active.renderer.domElement.dataset.keeperParryTestsRemaining = String(remainingKeeperParryTests);
        }
        if (frameErrorRef.current) frameErrorRef.current = "";
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (active.phase === "open" && active.gameClock === clockBeforeUpdate) advanceGameClock(active, dt);
        if (frameErrorRef.current !== message) {
          frameErrorRef.current = message;
          console.error("Futbol match update error", error);
        }
      }

      const chargingPlayer = active.shotChargingPlayerId
        ? active.players.find((player) => player.id === active.shotChargingPlayerId)
        : null;
      const passChargingPlayer = active.passChargingPlayerId
        ? active.players.find((player) => player.id === active.passChargingPlayerId)
        : null;
      const gaugePlayer = chargingPlayer ?? passChargingPlayer;
      const shouldUpdateHud = performance.now() - active.lastHudUpdate > (gaugePlayer ? 90 : 180);
      if (shouldUpdateHud) {
        active.lastHudUpdate = performance.now();
        if (scoreUiRef.current.home !== active.score.home || scoreUiRef.current.away !== active.score.away) {
          scoreUiRef.current = { ...active.score };
          setScore({ ...active.score });
        }
        if (Math.floor(gameClockUiRef.current) !== Math.floor(active.gameClock)) {
          gameClockUiRef.current = active.gameClock;
          setGameClock(active.gameClock);
        }
        const totalPossession = active.possessionTime.home + active.possessionTime.away;
        const homePossession = totalPossession > 0.25
          ? Math.round((active.possessionTime.home / totalPossession) * 100)
          : 50;
        const nextPossession = { home: homePossession, away: 100 - homePossession };
        if (possessionUiRef.current.home !== nextPossession.home || possessionUiRef.current.away !== nextPossession.away) {
          possessionUiRef.current = nextPossession;
          setPossessionPercent(nextPossession);
        }
        if (phaseUiRef.current !== active.phase) {
          phaseUiRef.current = active.phase;
          setPhaseUi(active.phase);
        }
        const nextShotCharge = chargingPlayer ? active.shotCharge : passChargingPlayer ? active.passCharge : 0;
        if (Math.abs(shotChargeUiRef.current - nextShotCharge) > 0.025 || (!gaugePlayer && shotChargeUiRef.current !== 0)) {
          shotChargeUiRef.current = nextShotCharge;
          setShotChargeUi(nextShotCharge);
          if (gaugePlayer) setShotChargePosition(playerScreenGaugePosition(active, gaugePlayer));
        }
        syncP1AiUi(active.p1Autopilot);
        setMinimapSnapshot({
          ball: { x: active.ballPos.x, z: active.ballPos.z },
          players: active.players
            .filter((player) => !player.sentOff)
            .map((player) => ({
              id: player.id,
              team: player.team,
              x: player.pos.x,
              z: player.pos.z,
              controlled: player.controlledBy === "p1",
            })),
        });
      }
      if (active.gameClock >= FULL_TIME_SECONDS) {
        playWhistleSequence(active, 3);
        active.state = "ended";
        void finishAnalyticsSession(gameSessionRef.current, visitorIdRef.current, active.score);
        gameSessionRef.current = null;
        setMatchState("ended");
      }
    };

    const frame = (time: number) => {
      runtime.frameRunning = false;
      if (runtimeVersionRef.current !== runtimeVersion || sceneRef.current !== runtime) return;
      const active = runtime;
      if (tabHidden || document.hidden) {
        resetRuntimeTiming(time);
        return;
      }
      const rawFrameMsUnclamped = Math.max(0, time - active.lastTime);
      if (rawFrameMsUnclamped > 250) {
        resetRuntimeTiming(time);
        active.players.forEach((player) => {
          player.aiInputTimer = 0;
        });
      }
      const rawFrameMs = rawFrameMsUnclamped > 250 ? 1000 / 60 : rawFrameMsUnclamped;
      const dt = Math.min(rawFrameMs / 1000, 0.033);
      active.lastTime = time;
      if (active.state === "playing" && !settingsOpenRef.current) runMatchTick(time);
      if (active.perfElement) {
        active.perfFrames += 1;
        active.perfFrameTotal += rawFrameMs;
        if (time - active.perfLastReport >= 1000) {
          const elapsed = time - active.perfLastReport;
          const fps = active.perfFrames * 1000 / elapsed;
          const avgMs = active.perfFrameTotal / Math.max(1, active.perfFrames);
          active.perfElement.textContent = `${fps.toFixed(0)} fps · ${avgMs.toFixed(1)} ms`;
          active.perfFrames = 0;
          active.perfFrameTotal = 0;
          active.perfLastReport = time;
        }
      }
      if (active.state !== "playing") active.ball.rotation.y += dt * 0.35;
      if (active.state !== "playing" && time - active.lastRenderTime < 1000 / 12) {
        scheduleFrame();
        return;
      }
      active.lastRenderTime = time;

      try {
        const controlledFocus = active.players.find((player) => player.controlledBy === "p1");
        const playerFocus = controlledFocus?.pos ?? active.ballPos;
        const blendedFocus = active.ballPos.clone().lerp(playerFocus, 0.22);
        const focusZ = clamp(blendedFocus.z, -FIELD_L / 2 - 10, FIELD_L / 2 + 10);
        const shouldFollowPlay = active.state === "playing" && active.phase !== "halftime";
        const desired = active.phase === "goal"
          ? active.replayCameraPosition
          : shouldFollowPlay
          ? new THREE.Vector3(BROADCAST_CAMERA_X, BROADCAST_CAMERA_Y, focusZ + BROADCAST_CAMERA_Z_OFFSET)
          : new THREE.Vector3(
            BROADCAST_CAMERA_X,
            BROADCAST_CAMERA_Y,
            BROADCAST_CAMERA_Z,
          );
        if (active.phase !== "goal") desired.z = clamp(desired.z, -FIELD_L / 2 - 10, FIELD_L / 2 + 10);
        active.camera.position.lerp(desired, active.phase === "goal" ? 1 - Math.pow(0.00002, dt) : shouldFollowPlay ? 1 - Math.pow(0.0008, dt) : 1);
        const desiredLookAt = active.phase === "goal"
          ? active.replayCameraLookAt
          : shouldFollowPlay
          ? new THREE.Vector3(BROADCAST_LOOK_AT_X, BROADCAST_LOOK_AT_Y, focusZ)
          : new THREE.Vector3(
            BROADCAST_LOOK_AT_X,
            BROADCAST_LOOK_AT_Y,
            BROADCAST_LOOK_AT_Z,
          );
        active.cameraLookAt.lerp(desiredLookAt, active.phase === "goal" ? 1 - Math.pow(0.00003, dt) : shouldFollowPlay ? 1 - Math.pow(0.0016, dt) : 1);
        active.camera.up.set(0, 1, 0);
        active.camera.lookAt(active.cameraLookAt);
        active.renderer.render(active.scene, active.camera);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (frameErrorRef.current !== message) {
          frameErrorRef.current = message;
          console.error("Futbol render error", error);
        }
      }
      scheduleFrame();
    };
    scheduleFrame = () => {
      if (
        runtime.frameRunning
        || tabHidden
        || document.hidden
        || runtimeVersionRef.current !== runtimeVersion
        || sceneRef.current !== runtime
      ) return;
      runtime.frameRunning = true;
      runtime.frame = requestAnimationFrame(frame);
    };
    scheduleFrame();
    syncRuntimeDiagnostics(runtime);

    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      if (runtimeVersionRef.current === runtimeVersion) runtimeVersionRef.current += 1;
      if (runtime.frameRunning) cancelAnimationFrame(runtime.frame);
      runtime.frameRunning = false;
      if (runtime.matchTick !== null) window.clearInterval(runtime.matchTick);
      clearRuntimeTimeouts(runtime);
      clearRuntimeAudioSources(runtime);
      disposeObjectTree(runtime.scene);
      runtime.scene.clear();
      runtime.renderer.renderLists.dispose();
      runtime.renderer.dispose();
      runtime.renderer.forceContextLoss();
      disposeSharedResources();
      runtime.renderer.domElement.removeEventListener("pointerdown", onFieldPointerDown);
      runtime.perfElement?.remove();
      if (runtime.renderer.domElement.parentElement === mount) {
        mount.removeChild(runtime.renderer.domElement);
      }
      if (sceneRef.current === runtime) sceneRef.current = null;
    };
  }, [syncP1AiUi]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (settingsOpenRef.current) return;
      keysRef.current.add(event.code);
      const active = sceneRef.current;
      if (active && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
        const manualAim = keyboardAimDirection(active, keysRef.current);
        if (manualAim.lengthSq() > 0.02) {
          active.lastManualAim.copy(manualAim);
          active.lastManualAimTimer = 0.24;
        }
      }
      if (active?.state === "playing" && event.code === "KeyU") {
        setP1AutopilotMode(active, !active.p1Autopilot);
        syncP1AiUi(active.p1Autopilot);
        event.preventDefault();
        return;
      }
      if (active?.state === "playing" && P1_ACTIVITY_KEYS.has(event.code)) noteP1Activity(active);
      if (!event.repeat && active?.state === "playing" && active.phase === "open") {
        if (active.p1Autopilot) {
          event.preventDefault();
          return;
        }
        if (event.code === "KeyE") {
          switchToBestManualPlayer(active, "p1");
          event.preventDefault();
          return;
        }
        const p1 = active.players.find((player) => player.controlledBy === "p1");
        if (event.code === "KeyS") {
          if (p1 && active.ballOwnerId === p1.id && active.possession === "home") {
            beginPassCharge(p1, active);
          }
          event.preventDefault();
          return;
        }
        if (event.code === "KeyD" && p1) {
          beginShotCharge(p1, active);
          event.preventDefault();
          return;
        }
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyD", "KeyE", "KeyS", "KeyU"].includes(event.code)) event.preventDefault();
    };
    const up = (event: KeyboardEvent) => {
      if (settingsOpenRef.current) {
        keysRef.current.delete(event.code);
        return;
      }
      const active = sceneRef.current;
      if (event.code === "KeyD" && active?.state === "playing") {
        releaseShotCharge(active, keysRef.current);
        event.preventDefault();
      }
      if (event.code === "KeyS" && active?.state === "playing") {
        releasePassCharge(active, keysRef.current);
        event.preventDefault();
      }
      keysRef.current.delete(event.code);
    };
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [syncP1AiUi]);

  return (
    <main
      className="relative min-h-screen overflow-hidden bg-[#07110c] text-white"
      data-match-state={matchState}
      data-play-phase={phaseUi}
    >
      <div ref={mountRef} className="absolute inset-0" aria-label="3D arcade soccer match" />
      {matchState === "playing" && (
      <section className="pointer-events-none relative z-10 flex min-h-screen flex-col justify-between p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-normal sm:text-4xl">Futbol</h1>
            <p className="mt-1 text-sm text-emerald-100/70">11v11 arcade soccer · one active player · AI teammates</p>
            <div className="mt-3 inline-flex items-center rounded-md border border-white/15 bg-black/70 px-3 py-2 text-sm font-black text-white">
              <span className="text-cyan-100">Home</span>
              <span className="mx-2 font-mono text-lg">{score.home} - {score.away}</span>
              <span className="text-rose-100">Away</span>
              <span className="mx-2 text-white/35">|</span>
              <span className="font-mono text-emerald-100">{formatSoccerClock(gameClock)}</span>
            </div>
            <div className="mt-2 inline-flex items-center gap-2 rounded-md border border-white/10 bg-black/55 px-3 py-1.5 text-xs font-black text-white/85">
              <span className="text-cyan-100">Home {possessionPercent.home}%</span>
              <span className="text-white/30">Possession</span>
              <span className="text-rose-100">Away {possessionPercent.away}%</span>
            </div>
          </div>
        </div>
        <div />
      </section>
      )}
      {matchState === "playing" && (
        <button
          type="button"
          className="pointer-events-auto fixed right-4 top-28 z-[70] inline-flex items-center gap-2 rounded-md border border-white/20 bg-black/60 px-4 py-2 text-xs font-black uppercase tracking-wide text-white shadow-lg backdrop-blur-sm active:bg-white/15 sm:right-6"
          onClick={openSettings}
        >
          <Settings size={15} />
          Settings
        </button>
      )}
      {matchState === "playing" && (
        <button
          type="button"
          className={`pointer-events-auto fixed right-4 top-40 z-[70] flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black uppercase shadow-lg backdrop-blur-sm sm:right-6 ${
            p1AiUi ? "border-lime-200/55 bg-lime-400/25 text-lime-50" : "border-white/20 bg-black/55 text-white/85"
          }`}
          onClick={() => {
            const active = sceneRef.current;
            if (!active || active.state !== "playing") return;
            setP1AutopilotMode(active, !active.p1Autopilot);
            syncP1AiUi(active.p1Autopilot);
          }}
          aria-pressed={p1AiUi}
        >
          <span>AI</span>
          <span className={`relative inline-flex h-5 w-9 rounded-full border ${p1AiUi ? "border-lime-100/60 bg-lime-300/35" : "border-white/25 bg-white/10"}`}>
            <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white transition-transform ${p1AiUi ? "translate-x-4" : "translate-x-0.5"}`} />
          </span>
          <span>{p1AiUi ? "ON" : "OFF"}</span>
        </button>
      )}
      {matchState === "playing" && shotChargeUi > 0 && (
        <div
          className="pointer-events-none fixed z-20 w-24 -translate-x-1/2 rounded-full border border-white/35 bg-black/65 p-1"
          style={{ left: shotChargePosition.x, top: shotChargePosition.y }}
        >
          <div className="h-2.5 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.round(clamp(shotChargeUi, 0, 1) * 100)}%`,
                background: "linear-gradient(90deg, #22c55e 0%, #eab308 56%, #ef4444 100%)",
              }}
            />
          </div>
        </div>
      )}
      {matchState === "playing" && minimapSnapshot && (
        <div
          className="pointer-events-none fixed right-3 top-[calc(env(safe-area-inset-top)+13rem)] z-20 h-16 w-28 rounded-md border border-white/25 bg-black/45 shadow-lg backdrop-blur-sm sm:left-1/2 sm:right-auto sm:top-5 sm:h-20 sm:w-36 sm:-translate-x-1/2 lg:top-6 lg:h-24 lg:w-44"
          aria-label="Match minimap"
        >
          <div className="absolute inset-2 rounded-sm border border-emerald-100/45">
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-emerald-100/25" />
            <div className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emerald-100/25 sm:h-9 sm:w-9" />
            {minimapSnapshot.players.map((player) => {
              const point = minimapPoint(player.x, player.z);
              return (
                <span
                  key={player.id}
                  className={`absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${player.team === "home" ? "bg-cyan-300" : "bg-rose-300"} ${player.controlled ? "ring-2 ring-white" : ""}`}
                  style={{ left: `${point.left}%`, top: `${point.top}%` }}
                />
              );
            })}
            <span
              className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow"
              style={{
                left: `${minimapPoint(minimapSnapshot.ball.x, minimapSnapshot.ball.z).left}%`,
                top: `${minimapPoint(minimapSnapshot.ball.x, minimapSnapshot.ball.z).top}%`,
              }}
            />
          </div>
        </div>
      )}
      {matchState === "playing" && !showTouchControls && (
        <div className="pointer-events-none fixed bottom-4 left-4 z-20 hidden max-w-xl flex-wrap items-center gap-2 rounded-md border border-white/15 bg-black/45 px-3 py-2 text-xs font-bold text-white/80 shadow-lg backdrop-blur-sm md:flex">
          {[
            ["Arrow Keys", "Move"],
            ["S", "Pass"],
            ["E", "Switch"],
            ["D", "Shoot / Kick"],
            ["U", "AI Mode"],
          ].map(([key, label]) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              <kbd className="rounded border border-white/25 bg-white/10 px-2 py-1 font-mono text-[11px] font-black text-white">{key}</kbd>
              <span className="text-white/65">{label}</span>
            </span>
          ))}
        </div>
      )}
      {matchState === "playing" && phaseUi === "halftime" && (
        <div className="pointer-events-none fixed inset-0 z-[75] grid place-items-center">
          <div className="rounded-md border border-white/25 bg-black/35 px-10 py-5 text-center shadow-2xl backdrop-blur-[2px]">
            <div className="text-5xl font-black tracking-normal text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.85)] sm:text-7xl">HALFTIME</div>
          </div>
        </div>
      )}
      {settingsOpen && (
        <div className="fixed inset-0 z-[90] overflow-y-auto bg-black/65 p-4 text-white backdrop-blur-sm">
          <div className="mx-auto my-4 w-full max-w-5xl rounded-md border border-white/15 bg-[#08130d]/95 p-4 shadow-2xl sm:p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-black">Offline Settings</h2>
                <p className="mt-1 text-sm text-white/60">Settings are saved locally on this device. Opening this menu pauses the match.</p>
              </div>
              <div className="flex gap-2">
                <button
                  className="rounded-md border border-white/15 px-4 py-2 text-sm font-bold text-white hover:bg-white/10"
                  onClick={closeSettings}
                >
                  Close
                </button>
                <button
                  className="rounded-md bg-emerald-300 px-4 py-2 text-sm font-black text-slate-950 hover:bg-emerald-200"
                  onClick={commitSettings}
                >
                  Save
                </button>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
              <div className="space-y-4">
                <div className="rounded-md border border-white/10 bg-white/5 p-3">
                  <div className="mb-2 text-sm font-black uppercase text-cyan-100/80">Formation</div>
                  <div className="grid grid-cols-2 gap-2">
                    {(["4-3-3", "4-4-2"] as const).map((formation) => (
                      <button
                        key={formation}
                        className={`rounded-md border px-3 py-2 text-sm font-black ${
                          draftSettings.formation === formation
                            ? "border-emerald-200 bg-emerald-300/20 text-emerald-50"
                            : "border-white/15 bg-black/25 text-white/75 hover:bg-white/10"
                        }`}
                        onClick={() => setDraftSettings((current) => normalizeOfflineSettings({ ...current, formation }))}
                      >
                        {formation}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-md border border-white/10 bg-white/5 p-3">
                  <label className="mb-2 block text-sm font-black uppercase text-cyan-100/80" htmlFor="home-kit-color">Home Kit Color</label>
                  <div className="flex items-center gap-3">
                    <input
                      id="home-kit-color"
                      type="color"
                      value={draftSettings.homeColor}
                      className="h-11 w-16 rounded border border-white/15 bg-black/30 p-1"
                      onChange={(event) => setDraftSettings((current) => ({ ...current, homeColor: sanitizeHomeColor(event.target.value) }))}
                    />
                    <span className="font-mono text-sm text-white/75">{draftSettings.homeColor.toUpperCase()}</span>
                  </div>
                </div>

                <div className="rounded-md border border-white/10 bg-white/5 p-3">
                  <div className="mb-2 text-sm font-black uppercase text-cyan-100/80">Formation Shape</div>
                  <div className="relative h-72 overflow-hidden rounded-md border border-emerald-100/20 bg-emerald-900/50">
                    <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/10" />
                    <div className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15" />
                    {FORMATION_OPTIONS[draftSettings.formation].map((slot) => {
                      const left = clamp(50 + (slot.x / 28) * 42, 8, 92);
                      const top = clamp(50 + (slot.z / 52) * 42, 8, 92);
                      return (
                        <div
                          key={slot.slot}
                          className="absolute grid h-9 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/30 bg-black/45 text-[11px] font-black text-white"
                          style={{ left: `${left}%`, top: `${top}%`, backgroundColor: slot.line === "keeper" ? "#facc15aa" : `${draftSettings.homeColor}cc` }}
                        >
                          {slot.label}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {matchState === "playing" && (
              <div className="mt-4 flex justify-end border-t border-white/10 pt-4">
                <button
                  className="rounded-md border border-rose-200/35 bg-rose-500/85 px-4 py-2 text-sm font-black uppercase text-white hover:bg-rose-400/85"
                  onClick={() => {
                    closeSettings();
                    endMatch();
                  }}
                >
                  Exit Game
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {matchState === "playing" && showTouchControls && (
        <div
          className="pointer-events-none fixed inset-0 z-30 select-none touch-none"
          style={{
            paddingLeft: "env(safe-area-inset-left)",
            paddingRight: "env(safe-area-inset-right)",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          <div
            className="pointer-events-auto absolute h-32 w-32 rounded-full border border-cyan-100/25 bg-black/45 sm:h-40 sm:w-40"
            style={{ left: "calc(env(safe-area-inset-left) + 2.25rem)", bottom: "calc(env(safe-area-inset-bottom) + 2rem)" }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              joystickPointerRef.current = event.pointerId;
              event.currentTarget.setPointerCapture(event.pointerId);
              updateJoystickFromPointer(event);
              if (showTouchControls && !document.fullscreenElement) void requestGameFullscreen();
            }}
            onPointerMove={(event) => {
              if (joystickPointerRef.current !== event.pointerId) return;
              event.preventDefault();
              event.stopPropagation();
              updateJoystickFromPointer(event);
            }}
            onPointerUp={(event) => {
              if (joystickPointerRef.current !== event.pointerId) return;
              event.preventDefault();
              event.stopPropagation();
              releaseJoystick();
            }}
            onPointerCancel={(event) => {
              if (joystickPointerRef.current !== event.pointerId) return;
              releaseJoystick();
            }}
          >
            <div className="absolute inset-4 rounded-full border border-white/10 bg-cyan-200/5" />
            <div className="absolute inset-0 grid place-items-center text-xs font-black uppercase text-white/50">Move</div>
            <div
              className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-100/45 bg-cyan-200/35 sm:h-16 sm:w-16"
              style={{ transform: `translate(calc(-50% + ${joystickKnob.x}px), calc(-50% + ${joystickKnob.y}px))` }}
            />
          </div>

          <div
            className="pointer-events-auto absolute h-48 w-48 sm:h-56 sm:w-56"
            style={{ right: "calc(env(safe-area-inset-right) + 1.25rem)", bottom: "calc(env(safe-area-inset-bottom) + 1.75rem)" }}
          >
            <div className="absolute left-0 bottom-2 sm:bottom-4">
              <TouchButton label="Pass" tone="yellow" onDown={() => performMobileAction("passDown")} onUp={() => performMobileAction("passUp")} />
            </div>
            <div className="absolute left-4 top-4 sm:left-6 sm:top-6">
              <TouchButton label="Switch" tone="cyan" onPress={() => performMobileAction("switch")} />
            </div>
            <div className="absolute right-0 top-0 sm:right-1">
              <TouchButton label="Shoot" tone="red" strong large onDown={() => performMobileAction("kickDown")} onUp={() => performMobileAction("kickUp")} />
            </div>
          </div>

          <button
            className="pointer-events-auto absolute rounded-full border border-white/15 bg-black/55 px-4 py-2 text-xs font-black text-white active:bg-white/15"
            style={{ left: "calc(env(safe-area-inset-left) + 2.25rem)", bottom: "calc(env(safe-area-inset-bottom) + 11.1rem)" }}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              performMobileAction("fullscreen");
            }}
          >
            {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </button>
        </div>
      )}
      {matchState !== "playing" && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/55 p-4">
          <div className="flex w-full max-w-sm flex-col items-center rounded-md border border-white/15 bg-[#08130d]/92 px-6 py-8 text-center shadow-2xl">
            <SoccerBallLogo />
            <h1 className="mt-5 text-4xl font-black tracking-normal">Futbol</h1>
            {matchState === "ended" && <p className="mt-2 text-lg font-black text-white/85">{resultText} {score.home}-{score.away}</p>}
            <button
              className="mt-8 inline-flex w-full items-center justify-center gap-3 rounded-md bg-emerald-300 px-6 py-4 text-xl font-black text-slate-950 transition hover:bg-emerald-200 active:scale-[0.98]"
              onClick={() => startMatch()}
            >
              <Play size={24} />
              Kickoff
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function advanceGameClock(active: MatchRuntime, dt: number) {
  const now = performance.now();
  const realDt = Math.min(Math.max((now - active.lastClockAdvanceTime) / 1000, 0), dt);
  active.lastClockAdvanceTime = now;
  if (realDt > 0) active.gameClock = Math.min(FULL_TIME_SECONDS, active.gameClock + realDt * CLOCK_SPEED);
}

function updateMatch(
  active: MatchRuntime,
  keys: Set<string>,
  dt: number,
  virtualControls?: VirtualControls,
) {
  const playerFrameStart = active.phase === "open"
    ? new Map(active.players.map((player) => [player.id, player.pos.clone()]))
    : null;
  active.collisionResolutionsThisFrame = 0;
  active.maxCollisionCorrection = 0;
  active.maxDefenderFrameDisplacement = 0;
  const ball = active.ballPos;
  const ballVel = active.ballVel;
  active.ballIgnoreTimer = Math.max(0, active.ballIgnoreTimer - dt);
  active.looseContactCooldownTimer = Math.max(0, active.looseContactCooldownTimer - dt);
  if (active.looseContactCooldownTimer === 0 && active.looseContactPlayerId) {
    const latchedPlayer = active.players.find((player) => player.id === active.looseContactPlayerId) ?? null;
    const flatBallForLatch = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
    if (
      !latchedPlayer
      || latchedPlayer.pos.distanceTo(flatBallForLatch) > playerBallContactRadius(latchedPlayer, active.ballPos.y) + 0.55
    ) {
      active.looseContactPlayerId = null;
    }
  }
  active.receptionLockTimer = Math.max(0, active.receptionLockTimer - dt);
  if (active.receptionLockTimer === 0) active.receptionLockPlayerId = null;
  active.possessionStabilityTimer = Math.max(0, active.possessionStabilityTimer - dt);
  if (active.possessionStabilityTimer === 0) active.possessionStableOwnerId = null;
  active.tackleLockTimer = Math.max(0, active.tackleLockTimer - dt);
  active.restartProtectionTimer = Math.max(0, active.restartProtectionTimer - dt);
  active.goalKickLockTimer = Math.max(0, active.goalKickLockTimer - dt);
  active.lastManualAimTimer = Math.max(0, active.lastManualAimTimer - dt);
  active.restartBoundaryGuardTimer = Math.max(0, active.restartBoundaryGuardTimer - dt);
  if (active.pendingRestartPhase) {
    active.pendingRestartTimer = Math.max(0, active.pendingRestartTimer - dt);
  }
  if (active.goalKickLockTimer === 0) active.goalKickLockPlayerId = null;
  if (active.shotChargingPlayerId) {
    const chargingPlayer = active.players.find((player) => player.id === active.shotChargingPlayerId);
    if (!chargingPlayer || active.phase !== "open" || active.ballOwnerId !== chargingPlayer.id || !keys.has("KeyD")) {
      active.shotCharge = 0;
      active.shotChargingPlayerId = null;
      active.shotConsumed = false;
    } else {
      active.shotCharge = clamp(active.shotCharge + dt * 0.88, 0, 1);
    }
  }
  if (active.passChargingPlayerId) {
    const chargingPlayer = active.players.find((player) => player.id === active.passChargingPlayerId);
    if (!chargingPlayer || active.phase !== "open" || active.ballOwnerId !== chargingPlayer.id || !keys.has("KeyS")) {
      active.passCharge = 0;
      active.passChargingPlayerId = null;
    } else {
      active.passCharge = clamp(active.passCharge + dt * 0.92, 0, 1);
    }
  }
  if (active.restartProtectionTimer === 0) active.restartProtectionTeam = null;
  if (active.phase === "open" && active.eventTimer > 0) {
    active.eventTimer = Math.max(0, active.eventTimer - dt);
    if (active.eventTimer === 0) active.eventText = "PLAY";
  }
  const owner = ballOwner(active);
  if (!owner && active.ballState === "possessed") releasePossession(active, "loose");
  active.possession = owner?.team ?? null;
  updateDefensiveTeamPlan(active, dt);
  if (active.phase === "open" && active.possession) {
    active.possessionTime[active.possession] += dt;
  }
  updatePassRequestArms(active);

  const outOfPlayPending = active.pendingRestartPhase !== null;
  if (active.phase === "open") {
    if (!outOfPlayPending) {
      advanceGameClock(active, dt);
      if (!active.halftimeDone && active.gameClock >= HALF_TIME_SECONDS) {
        beginHalftime(active);
        return;
      }
    } else {
      active.lastClockAdvanceTime = performance.now();
    }
  } else {
    active.lastClockAdvanceTime = performance.now();
    if (active.phase === "goal-kick" && active.goalKickReleaseTimer > 0) {
      active.goalKickReleaseTimer = Math.max(0, active.goalKickReleaseTimer - dt);
      const keeper = active.goalKickLockPlayerId
        ? active.players.find((player) => player.id === active.goalKickLockPlayerId)
        : null;
      lockGoalKickBallOnGround(active);
      if (active.goalKickReleaseTimer === 0) {
        if (keeper && (!goalKickContactReady(active, keeper) || keeper.kickTimer > 0.22)) {
          active.goalKickReleaseTimer = 0.04;
        } else {
          releasePreparedGoalKick(active);
        }
      }
    } else {
      const actor = active.restartActorId ? active.players.find((player) => player.id === active.restartActorId) : null;
      const actorNeedsSpot = active.phase === "throw-in" || active.phase === "kickoff" || active.phase === "goal-kick";
      const readyDistance = active.phase === "throw-in" ? 3.2 : active.phase === "goal-kick" ? 2.1 : 1.95;
      const readySpot = active.phase === "goal-kick"
        ? goalKickKeeperSpot(active.restartTeam, active.half)
        : active.phase === "throw-in"
          ? throwInTakerSpot(active.restartSpot)
        : active.restartSpot;
      const actorReady = !actorNeedsSpot || Boolean(actor && actor.pos.distanceTo(readySpot) < readyDistance);
      active.phaseTimer = Math.max(0, active.phaseTimer - dt * (actorReady ? 1 : 0.42));
      if (active.phaseTimer <= 0) resumeRestart(active);
    }
  }

  active.players.forEach((player) => {
    if (player.sentOff) {
      player.vel.set(0, 0, 0);
      player.pos.set(FIELD_W / 2 + 12, 0, FIELD_L / 2 + 12 + player.number * 0.4);
      player.mesh.position.copy(player.pos);
      return;
    }
    const goalKickLocked = player.id === active.goalKickLockPlayerId;
    if (goalKickLocked) {
      const fixedDirection = upfieldKickDirection(player.team, active.half);
      const fixedSpot = goalKickKeeperSpot(player.team, active.half);
      player.pos.copy(fixedSpot);
      player.vel.set(0, 0, 0);
      player.turnRate = 0;
      player.heading = headingFromDirection(fixedDirection);
      player.mesh.rotation.y = player.heading;
      player.mesh.position.copy(player.pos);
      player.kickTimer = Math.max(0, player.kickTimer - dt);
      player.actionCooldown = Math.max(0, player.actionCooldown - dt);
      player.tackleTimer = 0;
      player.tackleCooldown = Math.max(0, player.tackleCooldown - dt);
      player.recoveryTimer = 0;
      player.catchTimer = 0;
      player.diveTimer = 0;
      player.diveSide = 0;
      player.decisionCooldown = Math.max(player.decisionCooldown, 0.3);
      animatePlayer(player, dt);
      return;
    }
    const input: PlayerInputState = active.phase === "open" && !outOfPlayPending
      ? player.controlledBy === "p1"
        ? active.p1Autopilot
          ? cachedAiInput(player, active, dt)
          : playerInput(keys, "p1", virtualControls, active.camera)
        : cachedAiInput(player, active, dt)
      : active.phase === "goal" || active.phase === "halftime" || outOfPlayPending
        ? { dir: new THREE.Vector3(), sprint: false, speedScale: 1 }
        : restartShapeInput(player, active);
    const manualControlled = player.controlledBy === "p1" && !active.p1Autopilot;
    if (manualControlled) {
      active.renderer.domElement.dataset.manualInputSource = active.phase === "open" && !outOfPlayPending ? "keyboard" : "restart";
      active.renderer.domElement.dataset.manualInputX = input.dir.x.toFixed(4);
      active.renderer.domElement.dataset.manualInputZ = input.dir.z.toFixed(4);
    }
    const defensivePlanRole = active.defensivePlan?.roles.get(player.id);
    const defendingUnderTeamPlan = Boolean(defensivePlanRole && active.defensivePlan?.defendingTeam === player.team);
    if (manualControlled) {
      player.supportRunTimer = 0;
      player.forcedMoveTimer = 0;
      player.forcedMoveSprint = false;
    } else if (defendingUnderTeamPlan && player.supportRunTimer > 0) {
      player.supportRunTimer = 0;
      player.supportRunTarget.copy(player.pos);
    }
    if (!manualControlled && player.supportRunTimer > 0 && active.ballOwnerId !== player.id && !defendingUnderTeamPlan) {
      const supportDir = player.supportRunTarget.clone().sub(player.pos);
      if (supportDir.lengthSq() > 1) input.dir.lerp(supportDir.normalize(), 0.82).normalize();
    }
    const forcedMoveAuthorized = !owner
      || owner.team === player.team
      || defensivePlanRole === "press"
      || defensivePlanRole === "cover";
    const forcedMoveActive = !manualControlled && player.forcedMoveTimer > 0 && active.ballOwnerId !== player.id && forcedMoveAuthorized;
    if (!forcedMoveAuthorized && player.forcedMoveTimer > 0) {
      player.forcedMoveTimer = 0;
      player.forcedMoveSprint = false;
    }
    if (forcedMoveActive) {
      const forcedDir = player.forcedMoveTarget.clone().sub(player.pos).setY(0);
      if (forcedDir.lengthSq() > 0.08) {
        input.dir.lerp(forcedDir.normalize(), 0.94).normalize();
        input.sprint = input.sprint || player.forcedMoveSprint;
        input.speedScale = Math.max(input.speedScale ?? 1, player.forcedMoveSprint ? 1 : 0.92);
      }
    }
    const sprint = (input.sprint || player.supportRunTimer > 0) && player.stamina > 0.12;
    const speedScale = clamp(input.speedScale ?? 1, 0.35, 1);
    const maxSpeed = (player.role === "keeper" ? 4.7 : 12.1) * (sprint ? 1.25 : 1);
    player.stamina = clamp(player.stamina + (sprint ? -0.42 : 0.24) * dt, 0, 1);
    player.kickTimer = Math.max(0, player.kickTimer - dt);
    player.actionCooldown = Math.max(0, player.actionCooldown - dt);
    player.tackleTimer = Math.max(0, player.tackleTimer - dt);
    player.tackleCooldown = Math.max(0, player.tackleCooldown - dt);
    player.recoveryTimer = Math.max(0, player.recoveryTimer - dt);
    player.catchTimer = Math.max(0, player.catchTimer - dt);
    player.diveTimer = Math.max(0, player.diveTimer - dt);
    if (player.diveTimer === 0) player.diveSide = 0;
    player.headerTimer = Math.max(0, player.headerTimer - dt);
    player.firstTouchTimer = Math.max(0, player.firstTouchTimer - dt);
    if (player.firstTouchTimer === 0) player.firstTouchType = null;
    player.blockTimer = Math.max(0, player.blockTimer - dt);
    player.ballContactCooldown = Math.max(0, player.ballContactCooldown - dt);
    player.challengeCommitTimer = Math.max(0, player.challengeCommitTimer - dt);
    player.passRequestTimer = Math.max(0, player.passRequestTimer - dt);
    player.celebrateTimer = Math.max(0, player.celebrateTimer - dt);
    player.decisionCooldown = Math.max(0, player.decisionCooldown - dt);
    player.fallbackTimer = Math.max(0, player.fallbackTimer - dt);
    player.skillTimer = Math.max(0, player.skillTimer - dt);
    player.skillCooldown = Math.max(0, player.skillCooldown - dt);
    player.forcedMoveTimer = Math.max(0, player.forcedMoveTimer - dt);
    if (player.forcedMoveTimer === 0) player.forcedMoveSprint = false;
    if (player.skillTimer === 0) player.skillMove = null;
    player.carryTimer = active.ballOwnerId === player.id ? player.carryTimer + dt : 0;
    player.supportRunTimer = Math.max(0, player.supportRunTimer - dt);
    const recoveryScale = player.recoveryTimer > 0 ? 0.48 : 1;
    const moveSpeed = maxSpeed * recoveryScale * speedScale;
    const positionBeforeMove = player.pos.clone();
    const hasMoveIntent = input.dir.lengthSq() > 0.05;
    movePlayer(player, input.dir, moveSpeed, dt, active);
    if (active.phase === "throw-in" && player.id === active.restartActorId) {
      player.pos.copy(throwInTakerSpot(active.restartSpot));
      player.vel.set(0, 0, 0);
    } else {
      clampPlayer(player);
    }
    const displacementSpeed = dt > 0 ? player.pos.distanceTo(positionBeforeMove) / dt : 0;
    const intentAnimationSpeed = hasMoveIntent
      ? Math.min(moveSpeed, forcedMoveActive ? (sprint ? 7.8 : 5.2) : 3.2)
      : 0;
    player.animationSpeed = Math.max(player.vel.length(), displacementSpeed, intentAnimationSpeed);
    if (!manualControlled && defendingUnderTeamPlan && active.defensivePlan) {
      const carrier = active.players.find((candidate) => candidate.id === active.defensivePlan?.carrierId) ?? null;
      const markedId = active.defensivePlan.markedOpponentIds.get(player.id);
      const markedOpponent = markedId ? active.players.find((candidate) => candidate.id === markedId) ?? null : null;
      const facingTarget = defensivePlanRole === "press" || defensivePlanRole === "cover" ? carrier : markedOpponent ?? carrier;
      if (facingTarget && (player.line === "defender" || player.pos.distanceTo(facingTarget.pos) < 20)) {
        const faceDirection = facingTarget.pos.clone().sub(player.pos).setY(0);
        if (faceDirection.lengthSq() > 0.05) {
          setPlayerHeading(player, headingFromDirection(faceDirection), dt, player.line === "defender" ? 13.5 : 8.5);
        }
      }
    }
    if (!manualControlled && active.ballState === "kicked" && active.intendedReceiverId === player.id) {
      const reception = predictAerialReception(player, active);
      if (reception && reception.arrivalTime < 0.58 && player.pos.distanceTo(reception.point) < 2.4) {
        const finalAdjustment = reception.point.clone().sub(player.pos).setY(0);
        const adjustmentDistance = finalAdjustment.length();
        if (reception.arrivalTime < 0.16 && adjustmentDistance > 0.42 && adjustmentDistance < 1.5) {
          player.pos.add(finalAdjustment.normalize().multiplyScalar(Math.min(0.16, adjustmentDistance - 0.42)));
          clampPlayer(player);
        }
        const faceIncoming = active.ballPos.clone().setY(0).sub(player.pos);
        if (faceIncoming.lengthSq() > 0.04) setPlayerHeading(player, headingFromDirection(faceIncoming), dt, 11.5);
      }
    }
    player.mesh.position.copy(player.pos);
    animatePlayer(player, dt);
    if (player.role === "keeper") updateKeeperHeadTracking(player, active, dt);
    player.animationSpeed = Math.max(0, player.animationSpeed - dt * 18);
    updateStuckState(player, input.dir, active, dt);
  });
  if (active.frameCount % 3 === 0) separatePlayers(active, dt);
  if (!outOfPlayPending) {
    handleGoalkeeperActions(active);
    handleFieldShotBlocks(active);
    tryAerialHeaderDuel(active, dt);
  }
  updateAimIndicators(active, keys);

  if (active.phase === "open" && !outOfPlayPending) {
    if (active.p1Autopilot) updateUserAutoSwitch(active);
    punishStationaryCarrier(active);
    blockStraightLineDribble(active);
    encourageAiFinishing(active);
    handleAutomaticSteals(active);
    enforceDefensiveRuntimeGuard(active, dt);
    clampAbnormalDefenderDisplacement(active, playerFrameStart, dt);
  }
  if (active.frameCount % 30 === 0) syncRuntimeDiagnostics(active);

  if (active.phase !== "open") {
    const actor = active.restartActorId ? active.players.find((player) => player.id === active.restartActorId) : null;
    if (active.phase === "goal") {
      active.replayTimer = Math.min(3, active.replayTimer + dt);
      const t = clamp(active.replayTimer / 3, 0, 1);
      if (active.replayFrames.length > 1) {
        const frameIndex = t * (active.replayFrames.length - 1);
        const low = Math.floor(frameIndex);
        const high = Math.min(active.replayFrames.length - 1, low + 1);
        applyReplayFrame(active, active.replayFrames[low], active.replayFrames[high], frameIndex - low);
      } else {
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        ball.copy(active.replayBallStart).lerp(active.replayBallEnd, eased);
        ball.y = Math.max(BALL_RADIUS, ball.y + Math.sin(t * Math.PI) * 0.28);
      }
    } else if (active.phase === "throw-in" && actor) {
      const hands = throwInHandPoint(actor, active.restartDirection);
      ball.copy(hands);
      setPlayerHeading(actor, Math.atan2(active.restartDirection.x, active.restartDirection.z), dt, 7.5);
      poseThrower(actor, actor.pos.distanceTo(throwInTakerSpot(active.restartSpot)) < 0.4);
    } else if (active.phase === "goal-kick" && actor) {
      const fixedDirection = upfieldKickDirection(active.restartTeam, active.half);
      if (actor.pos.distanceTo(goalKickKeeperSpot(active.restartTeam, active.half)) < 2.6) {
        setPlayerHeading(actor, headingFromDirection(fixedDirection), dt, 8.8);
        actor.kickTimer = Math.max(actor.kickTimer, 0.08);
      }
      lockGoalKickBallOnGround(active);
      ball.copy(active.ballPos);
    } else {
      ball.copy(active.restartSpot);
    }
    ballVel.set(0, 0, 0);
    active.ballCurve.set(0, 0, 0);
  }

  const dribbler = ballOwner(active);
  if (active.phase === "open" && dribbler) {
    const dribblePoint = dribbler.role === "keeper" && dribbler.catchTimer > 0 ? keeperHandPoint(dribbler) : controlledBallPoint(dribbler);
    const controlGap = ball.distanceTo(dribblePoint);
    const maximumControlGap = dribbler.role === "keeper" ? 3.1 : CONTROL_TOUCH_DISTANCE + DRIBBLE_DISTANCE + 0.48;
    if (controlGap > maximumControlGap) {
      const canStabilize = active.possessionStableOwnerId === dribbler.id
        && active.possessionStabilityTimer > 0
        && controlGap < maximumControlGap + 1.25;
      if (canStabilize) {
        const recovery = dribblePoint.clone().sub(ball);
        const attachStep = Math.min(recovery.length(), 28 * dt);
        if (attachStep > 0.0001) ball.add(recovery.normalize().multiplyScalar(attachStep));
        ballVel.copy(dribbler.vel).multiplyScalar(0.72);
      } else {
        releasePossession(active, "loose");
        active.renderer.domElement.dataset.rejectedDistantAttachments = String(
          Number(active.renderer.domElement.dataset.rejectedDistantAttachments ?? "0") + 1,
        );
      }
    } else {
      const toControlPoint = dribblePoint.clone().sub(ball);
      const attachSpeed = dribbler.role === "keeper" ? 18 : dribbler.controlledBy ? 24 : 22;
      const attachStep = Math.min(toControlPoint.length(), attachSpeed * dt);
      if (attachStep > 0.0001) ball.add(toControlPoint.normalize().multiplyScalar(attachStep));
      active.renderer.domElement.dataset.maxPossessionAttachStep = Math.max(
        Number(active.renderer.domElement.dataset.maxPossessionAttachStep ?? "0"),
        attachStep,
      ).toFixed(4);
      if (dribbler.role !== "keeper" || dribbler.catchTimer <= 0) {
        ball.y += clamp(BALL_RADIUS - ball.y, -attachSpeed * dt, attachSpeed * dt);
      }
      ballVel.copy(dribbler.vel).multiplyScalar(dribbler.controlledBy ? 0.96 : 0.82);
      active.ballCurve.set(0, 0, 0);
    }
  }

  if (!active.ballOwnerId && active.phase === "open" && !outOfPlayPending) {
    const flatBall = new THREE.Vector3(ball.x, 0, ball.z);
    const flatBallSpeed = new THREE.Vector3(ballVel.x, 0, ballVel.z).length();
    const keeperClaimTeam = keeperClaimTeamForLooseBall(active);
    const contacts = active.players
      .filter((player) => !player.sentOff)
      .map((player) => {
        const distance = player.pos.distanceTo(flatBall);
        const minDistance = playerBallContactRadius(player, ball.y);
        return { player, distance, minDistance };
      })
      .filter(({ player, distance, minDistance }) => {
        if (player.id !== active.ballIgnorePlayerId) return distance < minDistance && distance > 0.001;
        const safelyClear = distance > minDistance + 1.25;
        if (active.ballIgnoreTimer > 0 || !safelyClear) return false;
        active.ballIgnorePlayerId = null;
        return distance < minDistance && distance > 0.001;
      })
      .sort((a, b) => {
        const intendedA = active.intendedReceiverId === a.player.id ? -1 : 0;
        const intendedB = active.intendedReceiverId === b.player.id ? -1 : 0;
        const keeperA = keeperClaimTeam === a.player.team && a.player.role === "keeper" ? -1 : 0;
        const keeperB = keeperClaimTeam === b.player.team && b.player.role === "keeper" ? -1 : 0;
        return intendedA - intendedB || keeperA - keeperB || a.distance - b.distance;
      });

    const controller = contacts.find(({ player, distance, minDistance }) => {
      if (active.receptionLockPlayerId && player.id !== active.receptionLockPlayerId) return false;
      const restartProtectedOpponent = active.restartProtectionTimer > 0
        && active.restartProtectionTeam !== null
        && player.team !== active.restartProtectionTeam;
      const clearLooseWinAllowed = (!keeperClaimTeam || player.role === "keeper") && !restartProtectedOpponent;
      const clearLooseWin = active.ballPos.y <= 1.25
        && flatBallSpeed < (active.ballState === "kicked" ? 14.2 : 11.8)
        && distance < minDistance + 0.08
        && (player.vel.length() > 0.45 || active.ballState !== "kicked");
      return canControlBall(player, active) || (clearLooseWinAllowed && clearLooseWin);
    });

    const intendedAerialReceiver = active.intendedReceiverId
      ? active.players.find((player) => player.id === active.intendedReceiverId && !player.sentOff) ?? null
      : null;
    let controlResolved = intendedAerialReceiver
      ? tryAerialFirstTouch(intendedAerialReceiver, active, dt)
      : false;
    if (controller) {
      controlResolved = controlResolved || tryHeader(controller.player, active, dt) || takePossession(controller.player, active);
    }

    if (
      !controlResolved
      && active.receptionLockPlayerId
      && contacts.some(({ player }) => player.id === active.receptionLockPlayerId)
    ) {
      controlResolved = true;
    }

    if (!controlResolved && !active.ballOwnerId && contacts.length > 0) {
      const { player } = contacts[0];
      const intendedReception = active.intendedReceiverId === player.id;
      const receptionSpeed = active.ballVel.length();
      if (
        intendedReception
        && active.ballPos.y <= 1.52
        && receptionSpeed <= 42
        && !active.receptionLockPlayerId
      ) {
        const maximumTrapSpeed = 8.4;
        if (receptionSpeed > maximumTrapSpeed) active.ballVel.multiplyScalar(maximumTrapSpeed / receptionSpeed);
        active.ballVel.lerp(player.vel.clone().multiplyScalar(0.48), 0.34);
        active.ballVel.y = clamp(active.ballVel.y, -0.35, 0.42);
        active.ballCurve.multiplyScalar(0.18);
        active.receptionLockPlayerId = player.id;
        active.receptionLockTimer = 0.42;
        active.looseContactPlayerId = player.id;
        active.looseContactCooldownTimer = 0.42;
        player.ballContactCooldown = 0.42;
        if (active.ballPos.y <= 0.98 && player.pos.distanceTo(flatBall) <= FIELD_PLAYER_BALL_RADIUS + BALL_RADIUS + 0.04) {
          player.firstTouchType = "foot";
          player.firstTouchTimer = 0.38;
          active.renderer.domElement.dataset.aerialFirstTouches = String(Number(active.renderer.domElement.dataset.aerialFirstTouches ?? "0") + 1);
          active.renderer.domElement.dataset.lastAerialFirstTouchType = "foot";
          active.renderer.domElement.dataset.lastAerialFirstTouchDistance = player.pos.distanceTo(flatBall).toFixed(3);
        }
        active.renderer.domElement.dataset.receptionCushions = String(
          Number(active.renderer.domElement.dataset.receptionCushions ?? "0") + 1,
        );
        active.renderer.domElement.dataset.lastReceptionCushionPlayer = player.id;
        playKickSound(active, 0.42);
        controlResolved = takePossession(player, active);
        if (!controlResolved) {
          active.ballState = "loose";
          controlResolved = true;
        }
      }
    }

    if (!controlResolved && !active.ballOwnerId && contacts.length > 0) {
      const { player, distance, minDistance } = contacts[0];
      const normal = flatBall.clone().sub(player.pos).normalize();
      ball.x = player.pos.x + normal.x * minDistance;
      ball.z = player.pos.z + normal.z * minDistance;
      const latchedContactStillPresent = Boolean(
        active.looseContactPlayerId
        && contacts.some((contact) => contact.player.id === active.looseContactPlayerId),
      );
      const globalContactCooldown = active.looseContactCooldownTimer > 0 || latchedContactStillPresent;
      if (!globalContactCooldown) {
        const approachSpeed = Math.max(0, player.vel.dot(normal) - ballVel.dot(normal) * 0.25);
        const push = clamp(approachSpeed * 0.28, 0.35, 3.8);
        ballVel.x += normal.x * push;
        ballVel.z += normal.z * push;
        player.ballContactCooldown = 0.2;
        active.looseContactPlayerId = player.id;
        active.looseContactCooldownTimer = 0.2;
        active.renderer.domElement.dataset.looseContactImpulses = String(
          Number(active.renderer.domElement.dataset.looseContactImpulses ?? "0") + 1,
        );
        if (approachSpeed > 2.8 && push > 1.2) playKickSound(active, 0.35 + push * 0.08);
        active.lastTouchTeam = player.team;
        active.lastTouchPlayerId = player.id;
        if (active.intendedReceiverId === player.id && active.ballVel.length() > 34) {
          active.intendedReceiverId = null;
          active.manualPassReceiverId = null;
          active.ballIgnorePlayerId = player.id;
          active.ballIgnoreTimer = 0.14;
        }
      } else if (distance < minDistance * 0.72) {
        ballVel.multiplyScalar(0.9);
      }
    }
  }

  capBallVelocity(ballVel);
  if (!active.ballOwnerId) {
    ballVel.y -= BALL_GRAVITY * dt;
    if (active.ballCurve.lengthSq() > 0.0001) {
      const curveScale = ball.y > BALL_RADIUS + 0.18 ? 1 : 0.38;
      ballVel.addScaledVector(active.ballCurve, dt * curveScale);
      active.ballCurve.multiplyScalar(Math.pow(ball.y > BALL_RADIUS + 0.18 ? 0.36 : 0.18, dt));
    }
    ball.addScaledVector(ballVel, dt);
    if (ball.y < BALL_RADIUS) {
      ball.y = BALL_RADIUS;
      if (ballVel.y < -1.2) ballVel.y = -ballVel.y * BALL_BOUNCE;
      else ballVel.y = 0;
      ballVel.x *= 0.97;
      ballVel.z *= 0.97;
    }
    resolveGoalFrameCollision(ball, ballVel);
  }
  const crossedSideline = Math.abs(ball.x) > FIELD_W / 2;
  const groundFriction = ball.y <= BALL_RADIUS + 0.05 ? BALL_ROLLING_FRICTION : 0.94;
  ballVel.x *= Math.pow(groundFriction, dt);
  ballVel.z *= Math.pow(groundFriction, dt);
  if (new THREE.Vector3(ballVel.x, 0, ballVel.z).length() < BALL_STOP_SPEED && ball.y <= BALL_RADIUS + 0.05) {
    ballVel.multiplyScalar(Math.pow(0.82, dt));
    if (active.ballState === "kicked") {
      active.ballState = "loose";
      active.intendedReceiverId = null;
      active.manualPassReceiverId = null;
    }
  }
  syncBallVisual(active);
  active.ball.rotation.x += ballVel.z * dt / BALL_RADIUS;
  active.ball.rotation.z -= ballVel.x * dt / BALL_RADIUS;
  if (active.phase === "open" && active.frameCount % 2 === 0) {
    active.replayTrail.push(ball.clone());
    if (active.replayTrail.length > 96) active.replayTrail.shift();
    recordReplayFrame(active);
  }

  if (active.phase !== "open") return;

  if (active.pendingRestartPhase) {
    if (active.pendingRestartTimer <= 0) {
      const phase = active.pendingRestartPhase;
      const team = active.pendingRestartTeam;
      const spot = active.pendingRestartSpot.clone();
      const label = active.pendingRestartLabel;
      active.pendingRestartPhase = null;
      stopForRestart(active, phase, team, spot, label);
    }
    return;
  }

  const carryingPlayer = ballOwner(active);
  const carryDirection = carryingPlayer ? dribbleDirection(carryingPlayer) : null;
  const carriedPastSideline = Boolean(carryingPlayer
    && Math.abs(carryingPlayer.pos.x) >= FIELD_W / 2 - 1.75
    && Math.sign(carryingPlayer.pos.x || 1) * (carryDirection?.x ?? 0) > 0.18);
  const carriedPastGoalLine = Boolean(carryingPlayer
    && Math.abs(carryingPlayer.pos.z) >= FIELD_L / 2 - 1.75
    && Math.sign(carryingPlayer.pos.z || 1) * (carryDirection?.z ?? 0) > 0.18);
  const boundaryX = carryingPlayer && carriedPastSideline ? carryingPlayer.pos.x : ball.x;
  const boundaryZ = carryingPlayer && carriedPastGoalLine ? carryingPlayer.pos.z : ball.z;
  const crossedTouchline = crossedSideline || carriedPastSideline;

  if (active.restartBoundaryGuardTimer <= 0 && crossedTouchline) {
    if (carryingPlayer) {
      active.lastTouchTeam = carryingPlayer.team;
      active.lastTouchPlayerId = carryingPlayer.id;
    }
    const spot = new THREE.Vector3(
      clamp(boundaryX, -FIELD_W / 2, FIELD_W / 2),
      BALL_RADIUS,
      clamp(boundaryZ, -FIELD_L / 2 + 5, FIELD_L / 2 - 5),
    );
    scheduleBoundaryRestart(active, "throw-in", opponent(active.lastTouchTeam), spot, `${opponent(active.lastTouchTeam).toUpperCase()} THROW-IN`);
    return;
  }

  const insideGoalMouth = Math.abs(carryingPlayer && carriedPastGoalLine ? carryingPlayer.pos.x : ball.x) < GOAL_W / 2 - BALL_RADIUS;
  const deepInNet = Math.abs(ball.z) > GOAL_SCORE_Z;
  if (deepInNet && insideGoalMouth) {
    const goalOwner: TeamId = ball.z > 0 === teamGoalZ("home", active.half) > 0 ? "home" : "away";
    const scoredBy = opponent(goalOwner);
    active.score[scoredBy] += 1;
    playGoalSound(active);
    celebrateGoal(active, goalOwner, scoredBy);
  } else if (active.restartBoundaryGuardTimer <= 0 && (Math.abs(ball.z) > FIELD_L / 2 || carriedPastGoalLine) && !insideGoalMouth) {
    if (carryingPlayer) {
      active.lastTouchTeam = carryingPlayer.team;
      active.lastTouchPlayerId = carryingPlayer.id;
    }
    const goalOwner: TeamId = boundaryZ > 0 === teamGoalZ("home", active.half) > 0 ? "home" : "away";
    const attackingTeam = opponent(goalOwner);
    const lastByAttacker = active.lastTouchTeam === attackingTeam;
    if (lastByAttacker) {
      const spotZ = teamGoalZ(goalOwner, active.half) - Math.sign(teamGoalZ(goalOwner, active.half)) * 8;
      scheduleBoundaryRestart(active, "goal-kick", goalOwner, new THREE.Vector3(0, BALL_RADIUS, spotZ), `${goalOwner.toUpperCase()} GOAL KICK`);
    } else {
      const cornerX = boundaryX < 0 ? -FIELD_W / 2 + 2 : FIELD_W / 2 - 2;
      const cornerZ = teamGoalZ(goalOwner, active.half);
      scheduleBoundaryRestart(active, "corner", attackingTeam, new THREE.Vector3(cornerX, BALL_RADIUS, cornerZ - Math.sign(cornerZ) * 2), `${attackingTeam.toUpperCase()} CORNER`);
    }
  }
}

function scheduleBoundaryRestart(
  active: MatchRuntime,
  phase: BoundaryRestartPhase,
  team: TeamId,
  spot: THREE.Vector3,
  label: string,
) {
  active.pendingRestartPhase = phase;
  active.pendingRestartTeam = team;
  active.pendingRestartSpot.copy(spot);
  active.pendingRestartLabel = label;
  active.pendingRestartTimer = OUT_OF_PLAY_DELAY;
  active.eventText = "BALL OUT";
  active.eventTimer = 0;
  active.cooldown = Math.max(active.cooldown, OUT_OF_PLAY_DELAY);
  releasePossession(active, "loose");
}

function encourageAiFinishing(active: MatchRuntime) {
  const owner = ballOwner(active);
  if (!owner || owner.controlledBy || owner.role === "keeper" || owner.sentOff || active.cooldown > 0.05 || owner.actionCooldown > 0) return;
  const goalDistance = Math.abs(attackingGoalZ(owner.team, active.half) - owner.pos.z);
  const teamAttackSign = Math.sign(attackingGoalZ(owner.team, active.half));
  const furthestForward = active.players
    .filter((player) => player.team === owner.team && player.role !== "keeper" && !player.sentOff)
    .every((player) => player.id === owner.id || (player.pos.z - owner.pos.z) * teamAttackSign <= 1.2);
  const inScoringArea = goalDistance < 28 && Math.abs(owner.pos.x) < GOAL_W * 2.35;
  const mustShoot = furthestForward && goalDistance < 25 && Math.abs(owner.pos.x) < GOAL_W * 2.45;
  const lateMatchRisk = active.gameClock > 15 * 60 && goalDistance < 30 && Math.abs(owner.pos.x) < GOAL_W * 2.2;
  if (owner.carryTimer < (inScoringArea ? 0.12 : 0.34)) return;
  const pressure = opponentPressure(owner, active.players, 5.6);
  const safePassTarget = choosePassTarget(owner, active, "short");
  const blockers = opponentsBetween(owner, new THREE.Vector3(0, 0, attackingGoalZ(owner.team, active.half)), active.players, inScoringArea ? 7.5 : 5.2);
  if (mustShoot && blockers <= 5) {
    shoot(owner, active, chooseAiShotStyle(owner, active, goalDistance, blockers), goalDistance < 18 ? 2.55 : 2.18);
  } else if (inScoringArea && blockers <= 4) {
    shoot(owner, active, chooseAiShotStyle(owner, active, goalDistance, blockers), goalDistance < 22 ? 2.18 : 1.82);
  } else if (lateMatchRisk && blockers <= 1) {
    const goalZ = attackingGoalZ(owner.team, active.half);
    const targetX = clamp(-owner.pos.x * 0.24, -GOAL_W / 2 + 1.6, GOAL_W / 2 - 1.6);
    kickTowardPoint(owner, new THREE.Vector3(targetX, BALL_RADIUS, goalZ + Math.sign(goalZ) * (GOAL_DEPTH + 2.2)), active, "shot", undefined, 1.86);
  } else if (goalDistance >= 30 && pressure >= 2 && safePassTarget && passIsUseful(owner, safePassTarget, active, "short")) {
    performPass(owner, active, "short");
  }
}

function capBallVelocity(ballVel: THREE.Vector3) {
  const horizontal = new THREE.Vector3(ballVel.x, 0, ballVel.z);
  const speed = horizontal.length();
  if (speed > BALL_MAX_SPEED) {
    horizontal.multiplyScalar(BALL_MAX_SPEED / speed);
    ballVel.x = horizontal.x;
    ballVel.z = horizontal.z;
  }
  ballVel.y = clamp(ballVel.y, -18, 14);
}

function limitHorizontalBallSpeed(ballVel: THREE.Vector3, maxSpeed: number) {
  const horizontal = new THREE.Vector3(ballVel.x, 0, ballVel.z);
  const speed = horizontal.length();
  if (speed <= maxSpeed || speed < 0.001) return;
  horizontal.multiplyScalar(maxSpeed / speed);
  ballVel.x = horizontal.x;
  ballVel.z = horizontal.z;
}

function beginHalftime(active: MatchRuntime) {
  active.phase = "halftime";
  active.lastClockAdvanceTime = performance.now();
  active.phaseTimer = 3.2;
  active.halftimeDone = true;
  active.eventText = "HALFTIME";
  active.eventTimer = 0;
  active.cooldown = 1.2;
  active.ballOwnerId = null;
  active.possession = null;
  active.ballState = "loose";
  active.intendedReceiverId = null;
  active.manualPassReceiverId = null;
  active.ballIgnorePlayerId = null;
  active.ballIgnoreTimer = 0;
  active.goalKickReleaseTimer = 0;
  active.goalKickPendingVelocity.set(0, 0, 0);
  active.goalKickPendingReceiverId = null;
  active.goalKickLockPlayerId = null;
  active.goalKickLockTimer = 0;
  active.pendingKickTarget = null;
  active.shotCharge = 0;
  active.shotChargingPlayerId = null;
  active.passCharge = 0;
  active.passChargingPlayerId = null;
  active.shotConsumed = false;
  active.ballVel.set(0, 0, 0);
  active.ballCurve.set(0, 0, 0);
  active.players.forEach((player) => {
    player.vel.set(0, 0, 0);
    player.kickTimer = 0;
    player.tackleTimer = 0;
    player.recoveryTimer = 0;
    player.diveTimer = 0;
    player.headerTimer = 0;
    player.firstTouchTimer = 0;
    player.firstTouchType = null;
    player.challengeCommitTimer = 0;
  });
  playWhistleSequence(active, 2);
}

function celebrateGoal(active: MatchRuntime, concedingTeam: TeamId, scoredBy: TeamId) {
  recordReplayFrame(active);
  const goalSide = Math.sign(active.ballPos.z || teamGoalZ(concedingTeam, active.half));
  const incoming = active.ballVel.clone().setY(0);
  if (incoming.lengthSq() < 0.2) incoming.set(0, 0, goalSide);
  incoming.normalize();
  const replayEnd = new THREE.Vector3(
    clamp(active.ballPos.x, -GOAL_W / 2 + BALL_RADIUS, GOAL_W / 2 - BALL_RADIUS),
    BALL_RADIUS * 1.1,
    goalSide * (GOAL_FRONT_Z + GOAL_DEPTH - BALL_RADIUS * 1.25),
  );
  const trailStart = active.replayTrail[Math.max(0, active.replayTrail.length - 74)]?.clone() ?? null;
  const replayStart = trailStart && trailStart.distanceTo(replayEnd) > 8
    ? trailStart.setY(Math.max(BALL_RADIUS, trailStart.y))
    : replayEnd.clone().sub(incoming.multiplyScalar(18)).setY(Math.max(BALL_RADIUS, active.ballPos.y));
  const replayFrames = active.replayFrames.slice(-90);
  if (replayFrames.length < 2) {
    replayFrames.push(replayFrame(active));
  }
  const netContactFrame = replayFrame(active);
  netContactFrame.ball = {
    x: replayEnd.x,
    y: Math.max(BALL_RADIUS * 2.6, Math.min(2.2, active.ballPos.y + 0.4)),
    z: goalSide * (GOAL_FRONT_Z + GOAL_DEPTH * 0.82),
  };
  const netDropFrame = replayFrame(active);
  netDropFrame.ball = { x: replayEnd.x, y: replayEnd.y, z: replayEnd.z };
  replayFrames.push(netContactFrame);
  replayFrames.push(netDropFrame);
  active.phase = "goal";
  active.phaseTimer = 3;
  active.replayTimer = 0;
  active.replayFrames = replayFrames;
  active.replayBallStart.copy(replayStart);
  active.replayBallEnd.copy(replayEnd);
  const cameraSide = active.ballPos.x >= 0 ? 1 : -1;
  active.replayCameraPosition.set(cameraSide * (GOAL_W / 2 + 27), 10.8, goalSide * (GOAL_FRONT_Z - 43));
  active.replayCameraLookAt.set(0, 1.25, goalSide * (GOAL_FRONT_Z + GOAL_DEPTH * 0.28));
  active.restartTeam = concedingTeam;
  active.restartSpot.set(0, BALL_RADIUS, 0);
  active.restartDirection.set(0, 0, Math.sign(attackingGoalZ(concedingTeam, active.half)));
  active.restartActorId = null;
  active.eventText = `${scoredBy.toUpperCase()} GOAL`;
  active.eventTimer = 0;
  active.ballPos.copy(replayStart);
  active.ballVel.set(0, 0, 0);
  active.ballCurve.set(0, 0, 0);
  releasePossession(active, "loose");
  active.cooldown = Math.max(active.cooldown, 0.45);
  active.players.forEach((player) => {
    player.celebrateTimer = 0;
    player.supportRunTimer = 0;
  });
}

function stopForRestart(active: MatchRuntime, phase: PlayPhase, team: TeamId, spot: THREE.Vector3, label: string) {
  active.pendingRestartPhase = null;
  active.pendingRestartTimer = 0;
  active.phase = phase;
  active.phaseTimer = phase === "kickoff" ? 1.8 : phase === "goal-kick" ? 2.25 : 1.15;
  active.restartTeam = team;
  active.restartSpot.copy(spot);
  active.intendedReceiverId = null;
  active.manualPassReceiverId = null;
  active.goalKickReleaseTimer = 0;
  active.goalKickPendingVelocity.set(0, 0, 0);
  active.goalKickPendingReceiverId = null;
  active.restartBoundaryGuardTimer = 0;
  if (phase === "kickoff") {
    resetKickoffShape(active);
    active.restartActorId = kickoffTaker(active.players, team, spot)?.id ?? null;
    active.restartDirection.copy(upfieldKickDirection(team, active.half));
    stageKickoffShape(active);
  } else if (phase === "throw-in") {
    active.restartDirection.set(spot.x > 0 ? -1 : 1, 0, Math.sign(attackingGoalZ(team, active.half)) * 0.35).normalize();
    active.restartActorId = nearestTeamPlayer(active.players.filter((player) => !player.controlledBy), team, spot)?.id
      ?? nearestTeamPlayer(active.players, team, spot)?.id
      ?? null;
  } else {
    active.restartDirection.copy(phase === "corner" ? cornerKickDirection(team, active.half, spot) : upfieldKickDirection(team, active.half));
    active.restartActorId = phase === "goal-kick"
      ? active.players.find((player) => player.team === team && player.role === "keeper")?.id ?? null
      : phase === "corner"
        ? nearestTeamPlayer(active.players.filter((player) => !player.controlledBy), team, spot)?.id
          ?? nearestTeamPlayer(active.players, team, spot)?.id
          ?? null
      : null;
  }
  arrangeSetPieceShape(active, phase, team, active.restartSpot);
  if (phase === "throw-in") {
    const actor = active.restartActorId ? active.players.find((player) => player.id === active.restartActorId) : null;
    const lineX = Math.sign(active.restartSpot.x || 1) * FIELD_W / 2;
    active.renderer.domElement.dataset.throwInSide = lineX < 0 ? "left" : "right";
    active.renderer.domElement.dataset.throwInLineX = lineX.toFixed(3);
    active.renderer.domElement.dataset.throwInTakerX = actor?.pos.x.toFixed(3) ?? "";
    active.renderer.domElement.dataset.throwInOutside = actor && Math.abs(actor.pos.x) > FIELD_W / 2 ? "true" : "false";
    const countKey = lineX < 0 ? "throwInLeftCount" : "throwInRightCount";
    active.renderer.domElement.dataset[countKey] = String(
      Number(active.renderer.domElement.dataset[countKey] ?? "0") + 1,
    );
  }
  if (phase === "goal-kick") {
    prepareGoalKickSetup(active, team);
    active.phaseTimer = Math.max(active.phaseTimer, 2.25);
  }
  active.eventText = `${label} · WAITING FOR KICK`;
  active.eventTimer = 0;
  if (phase !== "goal-kick") active.ballPos.copy(active.restartSpot);
  active.ballVel.set(0, 0, 0);
  active.ballCurve.set(0, 0, 0);
  releasePossession(active, "loose");
  active.cooldown = Math.max(active.cooldown, 0.45);
}

function arrangeSetPieceShape(active: MatchRuntime, phase: PlayPhase, team: TeamId, spot: THREE.Vector3) {
  if (phase === "halftime" || phase === "goal" || phase === "kickoff") return;
  if (phase === "goal-kick") {
    arrangeGoalKickBuildUpShape(active, team);
    return;
  }
  const attackSign = Math.sign(attackingGoalZ(team, active.half));
  const attackingGoal = attackingGoalZ(team, active.half);
  const opponentGoalSide = Math.sign(attackingGoal);
  const setPieceNearBox = Math.abs(attackingGoal - spot.z) < 38;
  const attackingSlots = [
    new THREE.Vector3(-10.5, 0, attackingGoal - opponentGoalSide * 13),
    new THREE.Vector3(-4.2, 0, attackingGoal - opponentGoalSide * 10.5),
    new THREE.Vector3(3.2, 0, attackingGoal - opponentGoalSide * 11.8),
    new THREE.Vector3(9.4, 0, attackingGoal - opponentGoalSide * 15.4),
    new THREE.Vector3(-15.5, 0, attackingGoal - opponentGoalSide * 20.5),
    new THREE.Vector3(15.5, 0, attackingGoal - opponentGoalSide * 20.5),
    new THREE.Vector3(0, 0, attackingGoal - opponentGoalSide * 24),
  ];
  const supportSlots = [
    new THREE.Vector3(spot.x + Math.sign(-spot.x || 1) * 7, 0, spot.z - attackSign * 6),
    new THREE.Vector3(spot.x + Math.sign(-spot.x || 1) * 13, 0, spot.z + attackSign * 2),
    new THREE.Vector3(spot.x * 0.45, 0, spot.z - attackSign * 12),
    new THREE.Vector3(spot.x * 0.2, 0, spot.z - attackSign * 20),
  ];
  active.players.forEach((player) => {
    if (player.sentOff) return;
    if (player.id === active.restartActorId) {
      player.pos.copy(phase === "throw-in" ? throwInTakerSpot(spot) : spot).setY(0);
      player.vel.set(0, 0, 0);
      player.mesh.position.copy(player.pos);
      return;
    }
    const base = player.home.clone();
    if (phase === "corner" || (phase === "throw-in" && setPieceNearBox)) {
      const fieldPlayers = active.players
        .filter((item) => item.team === player.team && item.role !== "keeper" && item.id !== active.restartActorId && !item.sentOff)
        .sort((a, b) => a.number - b.number);
      const slotIndex = Math.max(0, fieldPlayers.findIndex((item) => item.id === player.id));
      if (player.team === team) {
        const slot = player.line === "defender" && phase !== "corner"
          ? supportSlots[slotIndex % supportSlots.length]
          : attackingSlots[slotIndex % attackingSlots.length];
        base.copy(slot);
        base.x = clamp(base.x + spot.x * 0.08, -FIELD_W / 2 + 4, FIELD_W / 2 - 4);
      } else {
        const markedSlot = attackingSlots[slotIndex % attackingSlots.length];
        base.copy(markedSlot);
        base.x = clamp(markedSlot.x + Math.sign(markedSlot.x || 1) * 0.9, -FIELD_W / 2 + 4, FIELD_W / 2 - 4);
        base.z = clamp(markedSlot.z + opponentGoalSide * 2.2, -FIELD_L / 2 + 4, FIELD_L / 2 - 4);
      }
    } else if (phase === "throw-in") {
      const side = Math.sign(spot.x || 1);
      if (player.team === team) {
        const slot = supportSlots[(player.number + (player.line === "forward" ? 1 : 0)) % supportSlots.length];
        base.x = clamp(slot.x, -FIELD_W / 2 + 5, FIELD_W / 2 - 5);
        base.z = clamp(slot.z + (player.line === "forward" ? attackSign * 8 : 0), -FIELD_L / 2 + 4, FIELD_L / 2 - 4);
      } else {
        base.x = clamp(spot.x - side * (7 + (player.number % 3) * 3), -FIELD_W / 2 + 4, FIELD_W / 2 - 4);
        base.z = clamp(spot.z + attackSign * ((player.number % 5) - 2) * 4, -FIELD_L / 2 + 4, FIELD_L / 2 - 4);
      }
    }
    player.pos.copy(base);
    player.vel.set(0, 0, 0);
    clampPlayer(player);
    player.mesh.position.copy(player.pos);
    player.lastPos.copy(player.pos);
  });
}

function chooseGoalKickPlan(active: MatchRuntime, keeper: PlayerBody | null, direction: THREE.Vector3) {
  const origin = keeper?.pos ?? active.restartSpot;
  const team = keeper?.team ?? active.restartTeam;
  const opponents = active.players.filter((player) => player.team !== team && !player.sentOff);
  const pressure = opponents.some((player) => player.pos.distanceTo(origin) < 18);
  const sameTeamOutfieldPlayers = active.players
    .filter((player) => player.team === team && player.role !== "keeper" && !player.sentOff)
    .filter((player) => player.id !== keeper?.id);
  const teammates = sameTeamOutfieldPlayers
    .map((player) => {
      const distance = player.pos.distanceTo(origin);
      const forward = player.pos.clone().sub(origin).dot(direction);
      const open = nearestOpponentDistance(player, active.players);
      const target = player.pos.clone().add(player.vel.clone().setY(0).multiplyScalar(0.24)).setY(BALL_RADIUS);
      const laneBlockers = keeper ? opponentsBetween(keeper, target, active.players, 4.4) : 0;
      const receiverPressure = opponentPressureAtPoint(team, target, active.players, 8.8);
      const landingPressure = opponentPressureAtPoint(team, target, active.players, 6.2);
      const safetyScore = (
        open * 2.15
        + forward * 0.34
        - laneBlockers * 36
        - receiverPressure * 24
        - landingPressure * 20
        - Math.max(0, distance - 78) * 0.12
      );
      return { player, target, distance, forward, open, laneBlockers, receiverPressure, landingPressure, safetyScore };
    })
    .filter(({ distance }) => Number.isFinite(distance) && distance < FIELD_L + 28);

  const buildUpOptions = teammates
    .filter(({ player, distance, forward, open, laneBlockers, receiverPressure, landingPressure }) => (
      (player.line === "defender" || player.line === "midfielder")
      && distance > 9
      && distance < 58
      && forward > 7
      && open > 8.2
      && laneBlockers === 0
      && receiverPressure === 0
      && landingPressure === 0
    ))
    .sort((a, b) => (
      b.safetyScore - a.safetyScore
      || Math.abs(a.player.pos.x) - Math.abs(b.player.pos.x)
      || b.forward - a.forward
    ));
  const safeOptions = teammates
    .filter(({ forward, open, laneBlockers, receiverPressure, landingPressure }) => (
      forward > 10
      && open > 8.8
      && laneBlockers === 0
      && receiverPressure === 0
      && landingPressure === 0
    ))
    .sort((a, b) => b.forward - a.forward || b.open - a.open || a.distance - b.distance);
  const conservativeOptions = teammates
    .filter(({ forward, open, laneBlockers, receiverPressure, landingPressure }) => (
      forward > -12
      && open > 6.6
      && laneBlockers === 0
      && receiverPressure <= 1
      && landingPressure <= 1
    ))
    .sort((a, b) => b.forward * 1.15 + b.open - (a.forward * 1.15 + a.open));
  const advancedSameTeamOptions = teammates
    .filter(({ forward, laneBlockers, receiverPressure, landingPressure }) => (
      forward > 0
      && laneBlockers <= 1
      && receiverPressure <= 1
      && landingPressure <= 1
    ))
    .sort((a, b) => b.safetyScore - a.safetyScore || b.forward - a.forward || a.distance - b.distance);
  const reachableOptions = [...teammates].sort((a, b) => (
    b.safetyScore - a.safetyScore
    || b.forward - a.forward
    || a.distance - b.distance
  ));
  const choice = (!pressure ? buildUpOptions[0] : null)
    ?? safeOptions[0]
    ?? conservativeOptions[0]
    ?? advancedSameTeamOptions[0]
    ?? reachableOptions[0]
    ?? null;
  const receiver = choice?.player ?? null;
  const target = choice
    ? choice.target.clone()
    : origin.clone().add(direction.clone().multiplyScalar(18));
  target.x = clamp(target.x, -FIELD_W / 2 + 7, FIELD_W / 2 - 7);
  target.z = clamp(target.z, -FIELD_L / 2 + 7, FIELD_L / 2 - 7);
  target.y = BALL_RADIUS;
  const distance = clamp(target.distanceTo(origin), 12, 88);
  const longClearance = pressure || distance > 62;
  return {
    target,
    power: longClearance ? clamp(distance * 0.58 + 9, 34, 54) : clamp(distance * 0.6 + 8, 30, 48),
    lift: longClearance ? clamp(distance * 0.085, 4.2, 7.2) : distance > 42 ? clamp(distance * 0.055, 2.2, 4.2) : 0.55,
    receiver,
    safetyScore: choice?.safetyScore ?? -999,
    targetDistance: distance,
    laneBlockers: choice?.laneBlockers ?? 0,
    receiverPressure: choice?.receiverPressure ?? 0,
    landingPressure: choice?.landingPressure ?? 0,
  };
}

function executeSimpleGoalKick(active: MatchRuntime, actor: PlayerBody | null) {
  const direction = upfieldKickDirection(active.restartTeam, active.half);
  const keeper = active.players.find((player) => player.team === active.restartTeam && player.role === "keeper")
    ?? (actor?.role === "keeper" ? actor : null);
  if (keeper) {
    const readySpot = goalKickKeeperSpot(active.restartTeam, active.half);
    keeper.pos.copy(readySpot);
    keeper.vel.set(0, 0, 0);
    keeper.turnRate = 0;
    keeper.heading = headingFromDirection(direction);
    keeper.mesh.rotation.y = keeper.heading;
    keeper.mesh.position.copy(keeper.pos);
    keeper.recoveryTimer = 0;
    keeper.diveTimer = 0;
    keeper.diveSide = 0;
    syncGoalKickBallToKeeper(active, keeper);
  }
  active.restartDirection.copy(direction);
  active.ballOwnerId = null;
  active.intendedReceiverId = null;
  active.receptionLockPlayerId = null;
  active.receptionLockTimer = 0;
  active.looseContactPlayerId = null;
  active.looseContactCooldownTimer = 0;
  active.possession = null;
  active.ballState = "loose";
  active.phase = "goal-kick";
  active.lastClockAdvanceTime = performance.now();
  active.phaseTimer = 0.42;
  active.restartBoundaryGuardTimer = 0.85;
  active.eventText = "GOAL KICK";
  active.eventTimer = 0;
  active.cooldown = 0.18;
  active.restartProtectionTeam = active.restartTeam;
  active.restartProtectionTimer = 4.15;
  active.tackleLockTimer = Math.max(active.tackleLockTimer, 1.15);
  active.lastTouchTeam = active.restartTeam;
  active.lastTouchPlayerId = keeper?.id ?? null;
  lockGoalKickBallOnGround(active);
  const plan = chooseGoalKickPlan(active, keeper, direction);
  const goalKickDebug = typeof window !== "undefined"
    && new URLSearchParams(window.location.search).has("goalKickDebug");
  active.renderer.domElement.dataset.goalKickReceiver = plan.receiver?.id ?? "";
  active.renderer.domElement.dataset.goalKickTargetTeam = plan.receiver?.team ?? "";
  active.renderer.domElement.dataset.goalKickTargetSlot = plan.receiver?.formationSlot ?? "";
  active.renderer.domElement.dataset.goalKickTargetLine = plan.receiver?.line ?? "";
  active.renderer.domElement.dataset.goalKickKeeperTeam = active.restartTeam;
  active.renderer.domElement.dataset.goalKickTargetX = plan.target.x.toFixed(2);
  active.renderer.domElement.dataset.goalKickTargetZ = plan.target.z.toFixed(2);
  active.renderer.domElement.dataset.goalKickSafetyScore = plan.safetyScore.toFixed(2);
  active.renderer.domElement.dataset.goalKickTargetDistance = plan.targetDistance.toFixed(2);
  active.renderer.domElement.dataset.goalKickLaneBlockers = String(plan.laneBlockers);
  active.renderer.domElement.dataset.goalKickReceiverPressure = String(plan.receiverPressure);
  active.renderer.domElement.dataset.goalKickLandingPressure = String(plan.landingPressure);
  if (goalKickDebug) {
    console.info("[goal-kick-target]", JSON.stringify({
      goalkeeperTeamId: active.restartTeam,
      selectedTargetPlayerId: plan.receiver?.id ?? null,
      selectedTargetTeamId: plan.receiver?.team ?? null,
      selectedTargetSlot: plan.receiver?.formationSlot ?? null,
      selectedTargetLine: plan.receiver?.line ?? null,
      targetPosition: {
        x: Number(plan.target.x.toFixed(2)),
        z: Number(plan.target.z.toFixed(2)),
      },
      safetyScore: Number(plan.safetyScore.toFixed(2)),
      laneBlockers: plan.laneBlockers,
      receiverPressure: plan.receiverPressure,
      landingPressure: plan.landingPressure,
      shapeOptions: Number(active.renderer.domElement.dataset.goalKickShapeOptions ?? "0"),
      leftOptions: Number(active.renderer.domElement.dataset.goalKickShapeLeft ?? "0"),
      centerOptions: Number(active.renderer.domElement.dataset.goalKickShapeCenter ?? "0"),
      rightOptions: Number(active.renderer.domElement.dataset.goalKickShapeRight ?? "0"),
    }));
  }
  if (plan.receiver?.team === active.restartTeam) {
    active.renderer.domElement.dataset.goalKickSameTeamTargets = String(
      Number(active.renderer.domElement.dataset.goalKickSameTeamTargets ?? "0") + 1,
    );
  } else if (plan.receiver) {
    active.renderer.domElement.dataset.goalKickTeamMismatches = String(
      Number(active.renderer.domElement.dataset.goalKickTeamMismatches ?? "0") + 1,
    );
  } else {
    active.renderer.domElement.dataset.goalKickEmptyTargets = String(
      Number(active.renderer.domElement.dataset.goalKickEmptyTargets ?? "0") + 1,
    );
  }
  active.renderer.domElement.dataset.goalKickCount = String(
    Number(active.renderer.domElement.dataset.goalKickCount ?? "0") + 1,
  );
  if (keeper) {
    syncGoalKickBallToKeeper(active, keeper);
    keeper.kickTimer = 0.5;
    keeper.actionCooldown = 0.42;
    active.ballIgnorePlayerId = keeper.id;
    active.goalKickLockPlayerId = keeper.id;
    active.goalKickLockTimer = 0.64;
    active.goalKickReleaseTimer = 0.34;
    active.renderer.domElement.dataset.goalKickState = "kick-animation";
  } else {
    active.ballPos.copy(active.restartSpot).add(direction.clone().multiplyScalar(4.35)).setY(BALL_RADIUS);
    active.restartSpot.copy(active.ballPos);
    active.ballIgnorePlayerId = null;
    active.goalKickLockPlayerId = null;
    active.goalKickLockTimer = 0;
    active.goalKickReleaseTimer = 0.12;
  }
  const kickDirection = plan.target.clone().sub(active.ballPos).setY(0);
  if (kickDirection.lengthSq() < 0.1) kickDirection.copy(direction);
  const normalizedKick = kickDirection.normalize();
  if (!plan.receiver && normalizedKick.dot(direction) < 0.74) {
    normalizedKick.copy(direction);
  } else if (!plan.receiver) {
    normalizedKick.lerp(direction, 0.28).normalize();
  }
  active.ballVel.set(0, 0, 0);
  active.goalKickPendingVelocity.copy(normalizedKick.multiplyScalar(clamp(plan.power, 28, 54)));
  active.goalKickPendingVelocity.y = clamp(plan.lift, 0.8, 8.6);
  active.goalKickPendingReceiverId = plan.receiver?.id ?? null;
  active.ballCurve.set(0, 0, 0);
  active.intendedReceiverId = null;
  active.ballIgnoreTimer = 1.45;
  if (plan.receiver) {
    plan.receiver.recoveryTimer = Math.max(plan.receiver.recoveryTimer, 0.08);
    plan.receiver.decisionCooldown = Math.max(plan.receiver.decisionCooldown, 0.28);
  }
}

function releasePreparedGoalKick(active: MatchRuntime) {
  const keeper = active.goalKickLockPlayerId
    ? active.players.find((player) => player.id === active.goalKickLockPlayerId) ?? null
    : active.players.find((player) => player.team === active.restartTeam && player.role === "keeper") ?? null;
  const direction = upfieldKickDirection(active.restartTeam, active.half);
  if (keeper) {
    if (!goalKickContactReady(active, keeper)) {
      syncGoalKickBallToKeeper(active, keeper);
      active.goalKickReleaseTimer = 0.06;
      return;
    }
    keeper.vel.set(0, 0, 0);
    keeper.turnRate = 0;
    keeper.heading = headingFromDirection(direction);
    keeper.mesh.rotation.y = keeper.heading;
    keeper.kickTimer = Math.max(keeper.kickTimer, 0.24);
  }
  active.ballPos.copy(goalKickBallSpotForTeam(active.restartTeam, active.half));
  active.restartSpot.copy(active.ballPos);
  active.ballVel.copy(active.goalKickPendingVelocity);
  if (active.ballVel.lengthSq() < 4) {
    active.ballVel.copy(direction).multiplyScalar(30);
    active.ballVel.y = 4.2;
  }
  active.ballCurve.set(0, 0, 0);
  active.ballState = "kicked";
  active.ballOwnerId = null;
  active.intendedReceiverId = active.goalKickPendingReceiverId;
  active.goalKickPendingReceiverId = null;
  active.goalKickPendingVelocity.set(0, 0, 0);
  active.goalKickReleaseTimer = 0;
  active.renderer.domElement.dataset.goalKickState = "released";
  active.renderer.domElement.dataset.goalKickReleaseY = active.ballPos.y.toFixed(3);
  active.restartActorId = null;
  active.phase = "open";
  active.lastClockAdvanceTime = performance.now();
  active.phaseTimer = 0;
  active.eventText = "PLAY";
  active.eventTimer = 0;
  active.cooldown = 0.22;
  active.restartBoundaryGuardTimer = 0.85;
  active.restartProtectionTeam = active.restartTeam;
  active.restartProtectionTimer = Math.max(active.restartProtectionTimer, 3.2);
  active.ballIgnorePlayerId = keeper?.id ?? null;
  active.ballIgnoreTimer = 1.25;
  active.lastTouchTeam = active.restartTeam;
  active.lastTouchPlayerId = keeper?.id ?? null;
  playKickSound(active, 1.25);
}

function resumeRestart(active: MatchRuntime) {
  if (active.phase === "goal") {
    stopForRestart(active, "kickoff", active.restartTeam, new THREE.Vector3(0, BALL_RADIUS, 0), active.eventText);
    return;
  }
  if (active.phase === "halftime") {
    active.half = 2;
    setFormationHomes(active.players, 2);
    active.players.forEach((player) => {
      player.pos.copy(player.home);
      player.vel.set(0, 0, 0);
      player.heading = headingForHome(player.home.z);
      player.mesh.rotation.y = player.heading;
      player.mesh.position.copy(player.pos);
    });
    startDirectKickoff(active, "away");
    active.eventText = "SECOND HALF";
    active.eventTimer = 1.4;
    return;
  }
  const restartingPhase = active.phase;
  const showSecondHalfBanner = active.eventText === "SECOND HALF";
  if (restartingPhase === "goal-kick") {
    active.restartDirection.copy(upfieldKickDirection(active.restartTeam, active.half));
  }
  const kickoffActor = restartingPhase === "kickoff" ? kickoffTaker(active.players, active.restartTeam, active.restartSpot) : null;
  const actor = active.restartActorId ? active.players.find((player) => player.id === active.restartActorId) ?? null : kickoffActor;
  if (restartingPhase === "goal-kick") {
    const readySpot = goalKickKeeperSpot(active.restartTeam, active.half);
    if (actor && actor.pos.distanceTo(readySpot) > 2.35) {
      active.phaseTimer = 0.22;
      active.ballPos.copy(active.restartSpot);
      active.ballVel.set(0, 0, 0);
      return;
    }
    executeSimpleGoalKick(active, actor);
    return;
  }
  if (restartingPhase === "throw-in" && actor) {
    const receiver = chooseThrowInTarget(actor, active);
    if (receiver) active.restartDirection.copy(receiver.pos.clone().sub(actor.pos).setY(0).normalize());
  }
  const setPieceCross = actor && (restartingPhase === "corner" || (restartingPhase === "throw-in" && Math.abs(attackingGoalZ(active.restartTeam, active.half) - active.restartSpot.z) < 34))
    ? chooseSetPieceCrossTarget(actor, active, restartingPhase)
    : null;
  const releasePoint = restartingPhase === "throw-in" && actor
    ? throwInHandPoint(actor, active.restartDirection)
    : active.restartSpot.clone();
  if (setPieceCross) {
    const crossDirection = setPieceCross.target.clone().sub(releasePoint).setY(0);
    if (crossDirection.lengthSq() > 0.1) active.restartDirection.copy(crossDirection.normalize());
  }
  const crossDistance = setPieceCross ? setPieceCross.target.distanceTo(releasePoint) : 0;
  const power = setPieceCross
    ? clamp(crossDistance * (restartingPhase === "throw-in" ? 0.66 : 0.72), 34, restartingPhase === "throw-in" ? 50 : 56)
    : restartingPhase === "corner" ? 28 : restartingPhase === "throw-in" ? 22 : 4.2;
  active.ballPos.copy(releasePoint);
  active.ballVel.copy(active.restartDirection).multiplyScalar(power);
  active.ballVel.y = setPieceCross
    ? clamp(crossDistance * 0.19, 8.2, restartingPhase === "throw-in" ? 12.2 : 15.2)
    : restartingPhase === "corner" ? 8.2 : restartingPhase === "throw-in" ? 4.4 : 0;
  if (setPieceCross) {
    const sideAxis = new THREE.Vector3(-active.restartDirection.z, 0, active.restartDirection.x);
    const curlSide = Math.sign(setPieceCross.target.x - releasePoint.x || -releasePoint.x || 1);
    active.ballCurve.copy(sideAxis.multiplyScalar(curlSide * clamp(power * 0.052, 1.4, 2.7)));
    active.intendedReceiverId = setPieceCross.receiver?.id ?? null;
  } else {
    active.ballCurve.set(0, 0, 0);
  }
  active.lastTouchTeam = active.restartTeam;
  active.lastTouchPlayerId = active.restartActorId;
  active.restartActorId = null;
  active.ballState = "kicked";
  active.ballOwnerId = null;
  active.ballIgnorePlayerId = actor?.id ?? null;
  active.ballIgnoreTimer = restartingPhase === "throw-in" ? 0.46 : 0.34;
  if (restartingPhase === "throw-in") {
    active.renderer.domElement.dataset.lastThrowReleaseX = releasePoint.x.toFixed(3);
    active.renderer.domElement.dataset.lastThrowReleaseY = releasePoint.y.toFixed(3);
    active.renderer.domElement.dataset.lastThrowOutside = Math.abs(releasePoint.x) > FIELD_W / 2 ? "true" : "false";
  }
  active.phase = "open";
  active.lastClockAdvanceTime = performance.now();
  active.phaseTimer = 0;
  active.restartBoundaryGuardTimer = restartingPhase === "corner" ? 0.75 : restartingPhase === "throw-in" ? 0.55 : 0.35;
  active.eventText = showSecondHalfBanner ? "SECOND HALF" : "PLAY";
  active.eventTimer = showSecondHalfBanner ? 1.4 : 0;
  active.cooldown = 0.35;
  if (actor) {
    actor.kickTimer = 0.5;
  }
  if (restartingPhase === "kickoff" && actor) {
    active.ballIgnorePlayerId = null;
    active.ballIgnoreTimer = 0;
    forceKickoffPass(actor, active);
  }
}

function restartShapeInput(player: PlayerBody, active: MatchRuntime) {
  if (active.phase === "goal-kick") {
    const target = player.id === active.restartActorId
      ? goalKickKeeperSpot(active.restartTeam, active.half)
      : goalKickSlotTarget(player, active.restartTeam, active.half);
    const dir = target.sub(player.pos);
    return { dir: dir.lengthSq() > 0.5 ? dir.normalize() : dir.set(0, 0, 0), sprint: false };
  }
  const offset = player.team === active.restartTeam ? -Math.sign(attackingGoalZ(player.team, active.half)) * 5 : Math.sign(attackingGoalZ(player.team, active.half)) * 8;
  const target = player.home.clone();
  if (player.id === active.restartActorId) {
    target.copy(active.phase === "throw-in" ? throwInTakerSpot(active.restartSpot) : active.restartSpot);
    target.z = clamp(target.z, -GOAL_BACK_Z + 2, GOAL_BACK_Z - 2);
  } else if (active.phase !== "halftime" && player.line !== "keeper") {
    target.x = clamp(player.home.x * 0.72 + active.restartSpot.x * 0.18, -FIELD_W / 2 + 3, FIELD_W / 2 - 3);
    target.z = clamp(player.home.z + offset * 0.42, -FIELD_L / 2 + 4, FIELD_L / 2 - 4);
  }
  if (active.phase === "kickoff" && player.id !== active.restartActorId && player.role !== "keeper") {
    const ownSide = teamSide(player.team, active.half);
    target.z = ownSide > 0 ? Math.max(target.z, 5.4) : Math.min(target.z, -5.4);
  }
  const dir = target.sub(player.pos);
  return { dir: dir.lengthSq() > 0.5 ? dir.normalize() : dir.set(0, 0, 0), sprint: false };
}

function startDirectKickoff(active: MatchRuntime, team: TeamId) {
  resetKickoffShape(active);
  active.phase = "open";
  active.lastClockAdvanceTime = performance.now();
  active.phaseTimer = 0;
  active.restartTeam = team;
  active.restartSpot.set(0, BALL_RADIUS, 0);
  active.restartDirection.copy(upfieldKickDirection(team, active.half));
  active.restartActorId = kickoffTaker(active.players, team, active.restartSpot)?.id ?? null;
  active.eventText = "PLAY";
  active.eventTimer = 0;
  active.cooldown = 0.18;
  active.ballPos.copy(active.restartSpot);
  active.ballVel.set(0, 0, 0);
  active.ballCurve.set(0, 0, 0);
  active.ballState = "loose";
  active.ballOwnerId = null;
  active.possession = null;
  active.intendedReceiverId = null;
  active.ballIgnorePlayerId = null;
  active.ballIgnoreTimer = 0;
  active.restartProtectionTeam = null;
  active.restartProtectionTimer = 0;
  active.goalKickLockPlayerId = null;
  active.goalKickLockTimer = 0;
  active.goalKickReleaseTimer = 0;
  active.goalKickPendingVelocity.set(0, 0, 0);
  active.goalKickPendingReceiverId = null;
  active.manualPassReceiverId = null;
  active.restartBoundaryGuardTimer = 0;
  active.replayTrail = [];
  active.replayFrames = [];
  stageKickoffShape(active);
  const actor = active.restartActorId ? active.players.find((player) => player.id === active.restartActorId) : null;
  if (actor) {
    actor.heading = headingFromDirection(active.restartDirection);
    actor.mesh.rotation.y = actor.heading;
    forceKickoffPass(actor, active);
  }
  active.restartActorId = null;
}

function resetKickoffShape(active: MatchRuntime) {
  active.players.forEach((player) => {
    player.pos.copy(player.home);
    player.vel.set(0, 0, 0);
    player.heading = headingForHome(player.home.z);
    player.turnRate = 0;
    player.mesh.position.copy(player.pos);
    player.mesh.rotation.y = player.heading;
    player.carryTimer = 0;
    player.headerTimer = 0;
    player.firstTouchTimer = 0;
    player.firstTouchType = null;
    player.challengeCommitTimer = 0;
    player.stuckTimer = 0;
    player.fallbackTimer = 0;
    player.lastPos.copy(player.pos);
  });
}

function stageKickoffShape(active: MatchRuntime) {
  active.players.forEach((player) => {
    if (player.id === active.restartActorId) {
      player.pos.copy(active.restartSpot).setY(0);
    } else if (player.role !== "keeper") {
      const ownSide = teamSide(player.team, active.half);
      const behindLine = ownSide > 0 ? Math.max(player.pos.z, 5.4) : Math.min(player.pos.z, -5.4);
      const deepLimit = ownSide > 0 ? FIELD_L / 2 - 5 : -FIELD_L / 2 + 5;
      player.pos.z = ownSide > 0 ? Math.min(behindLine, deepLimit) : Math.max(behindLine, deepLimit);
      if (player.team === active.restartTeam) {
        const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
        const supportDepth = player.line === "forward" ? 11 : player.line === "midfielder" ? 8 : 4;
        player.pos.z += -attackSign * supportDepth;
        player.pos.x = clamp(player.pos.x * (player.line === "forward" ? 1.32 : player.line === "midfielder" ? 1.2 : 1.08), -FIELD_W / 2 + 7, FIELD_W / 2 - 7);
        const safeHalf = teamSide(player.team, active.half);
        player.pos.z = safeHalf > 0 ? Math.max(player.pos.z, 5.4) : Math.min(player.pos.z, -5.4);
      }
    }
    player.vel.set(0, 0, 0);
    player.mesh.position.copy(player.pos);
    player.lastPos.copy(player.pos);
  });
}

function nearestTeamPlayer(players: PlayerBody[], team: TeamId, spot: THREE.Vector3) {
  return players
    .filter((player) => player.team === team && player.role !== "keeper")
    .reduce<PlayerBody | null>((best, player) => {
      if (!best) return player;
      return player.pos.distanceTo(spot) < best.pos.distanceTo(spot) ? player : best;
    }, null);
}

function kickoffTaker(players: PlayerBody[], team: TeamId, spot: THREE.Vector3) {
  return nearestTeamPlayer(players.filter((player) => !player.controlledBy), team, spot)
    ?? nearestTeamPlayer(players, team, spot);
}

function chooseKickoffSupportTarget(actor: PlayerBody, active: MatchRuntime) {
  const attackSign = Math.sign(attackingGoalZ(actor.team, active.half));
  return active.players
    .filter((player) => player.team === actor.team && player.id !== actor.id && player.role !== "keeper" && !player.sentOff)
    .map((player) => {
      const distance = player.pos.distanceTo(actor.pos);
      const backward = (actor.pos.z - player.pos.z) * attackSign;
      const lateral = Math.abs(player.pos.x - actor.pos.x);
      const open = nearestOpponentDistance(player, active.players);
      const laneBlockers = opponentsBetween(actor, player.pos, active.players, 2.7);
      const teammateBlockers = teammatesBetween(actor, player, active.players, 2.25);
      const roleScore = player.line === "midfielder" ? 8 : player.line === "defender" ? 5 : 1;
      return {
        player,
        distance,
        backward,
        lateral,
        open,
        laneBlockers,
        teammateBlockers,
        score: backward * 1.45 + lateral * 0.42 + clamp(open, 0, 12) * 1.2 + roleScore - Math.abs(distance - 22) * 0.72,
      };
    })
    .filter(({ distance, backward, lateral, open, laneBlockers, teammateBlockers, score }) => (
      distance > 9
      && distance < 38
      && backward > 4.5
      && lateral > 4.2
      && open > 5.2
      && laneBlockers === 0
      && teammateBlockers === 0
      && score > 8
    ))
    .sort((a, b) => b.score - a.score)[0]?.player ?? null;
}

function forceKickoffPass(actor: PlayerBody, active: MatchRuntime) {
  const attackSign = Math.sign(attackingGoalZ(actor.team, active.half));
  let supportTarget = chooseKickoffSupportTarget(actor, active);
  const fallbackSide = Math.sign(actor.home.x || actor.pos.x || (actor.number % 2 === 0 ? 1 : -1));
  if (!supportTarget) {
    supportTarget = active.players
      .filter((player) => player.team === actor.team && player.id !== actor.id && player.role !== "keeper" && !player.sentOff)
      .sort((a, b) => {
        const aRole = a.line === "midfielder" ? 0 : a.line === "defender" ? 1 : 2;
        const bRole = b.line === "midfielder" ? 0 : b.line === "defender" ? 1 : 2;
        return aRole - bRole || a.pos.distanceTo(actor.pos) - b.pos.distanceTo(actor.pos);
      })[0] ?? null;
    if (supportTarget) {
      supportTarget.pos.set(fallbackSide * 11, 0, actor.pos.z - attackSign * 15);
      supportTarget.vel.set(0, 0, 0);
      supportTarget.mesh.position.copy(supportTarget.pos);
      supportTarget.lastPos.copy(supportTarget.pos);
    }
  }
  if (!supportTarget) return;
  const target = supportTarget.pos.clone().setY(BALL_RADIUS);
  target.x = clamp(target.x, -FIELD_W / 2 + 5, FIELD_W / 2 - 5);
  target.z = clamp(target.z, -FIELD_L / 2 + 5, FIELD_L / 2 - 5);
  if (!takePossession(actor, active)) return;
  active.ballVel.set(0, 0, 0);
  const passDirection = target.clone().sub(actor.pos).setY(0);
  if (passDirection.lengthSq() > 0.05) {
    actor.heading = headingFromDirection(passDirection);
    actor.mesh.rotation.y = actor.heading;
  }
  active.cooldown = 0;
  actor.actionCooldown = 0;
  actor.kickTimer = 0;
  actor.recoveryTimer = 0;
  supportTarget.recoveryTimer = 0;
  supportTarget.decisionCooldown = Math.max(supportTarget.decisionCooldown, 0.24);
  const kicked = kickTowardPoint(actor, target, active, "short", supportTarget, 0.62);
  if (!kicked && passDirection.lengthSq() > 0.05) {
    const distance = clamp(target.distanceTo(active.ballPos), 6, 88);
    const force = sharedKickForce("short", distance, 0.74, true);
    releasePossession(active, "kicked");
    active.ballVel.copy(passDirection.normalize().multiplyScalar(force.power));
    active.ballVel.y = force.lift;
    active.ballCurve.set(0, 0, 0);
    active.intendedReceiverId = supportTarget?.id ?? null;
    active.ballIgnorePlayerId = actor.id;
    active.ballIgnoreTimer = 0.3;
    active.lastTouchTeam = actor.team;
    active.lastTouchPlayerId = actor.id;
    actor.kickTimer = 0.42;
    actor.actionCooldown = ACTION_COOLDOWN;
    playKickSound(active, 1.32);
  }
  actor.decisionCooldown = Math.max(actor.decisionCooldown, 0.95);
  active.restartBoundaryGuardTimer = 0.65;
}

function poseThrower(player: PlayerBody, ready: boolean) {
  if (!ready) return;
  const { leftArm, rightArm, leftElbow, rightElbow } = player.parts;
  if (leftArm) leftArm.rotation.x = -2.6;
  if (rightArm) rightArm.rotation.x = -2.6;
  if (leftElbow) leftElbow.rotation.x = -0.48;
  if (rightElbow) rightElbow.rotation.x = -0.48;
}

function throwInHandPoint(player: PlayerBody, direction: THREE.Vector3) {
  return player.pos.clone()
    .add(direction.clone().multiplyScalar(0.28))
    .setY(3.05);
}

function chooseThrowInTarget(actor: PlayerBody, active: MatchRuntime) {
  const attackSign = Math.sign(attackingGoalZ(actor.team, active.half));
  return active.players
    .filter((player) => player.team === actor.team && player.id !== actor.id && player.role !== "keeper" && !player.sentOff)
    .map((player) => {
      const distance = player.pos.distanceTo(actor.pos);
      const forward = (player.pos.z - actor.pos.z) * attackSign;
      const open = nearestOpponentDistance(player, active.players);
      const laneBlockers = opponentsBetween(actor, player.pos, active.players, 2.8);
      return { player, score: 28 - Math.abs(distance - 18) * 0.75 + clamp(forward, -4, 16) + clamp(open, 0, 10) * 1.5 - laneBlockers * 4.5 };
    })
    .filter(({ player }) => player.pos.distanceTo(actor.pos) < 36)
    .sort((a, b) => b.score - a.score)[0]?.player ?? null;
}

function chooseSetPieceCrossTarget(actor: PlayerBody, active: MatchRuntime, phase: PlayPhase) {
  const team = actor.team;
  const goalZ = attackingGoalZ(team, active.half);
  const goalSide = Math.sign(goalZ) || 1;
  const isThrow = phase === "throw-in";
  const candidates = active.players
    .filter((player) => player.team === team && player.id !== actor.id && player.role !== "keeper" && !player.sentOff)
    .map((player) => {
      const goalDistance = Math.abs(goalZ - player.pos.z);
      const inBoxLane = goalDistance < 28 && Math.abs(player.pos.x) < GOAL_W * 2.2;
      const open = nearestOpponentDistance(player, active.players);
      const runScore = player.line === "forward" ? 12 : player.line === "midfielder" ? 7 : 2;
      const nearPenaltySpot = 18 - Math.abs(goalDistance - 13) - Math.abs(player.pos.x) * 0.22;
      return { player, score: runScore + nearPenaltySpot + clamp(open, 0, 11) * 1.05 + (inBoxLane ? 6 : 0) };
    })
    .sort((a, b) => b.score - a.score);
  const receiver = candidates[0]?.player ?? null;
  const fallbackX = clamp(-actor.pos.x * 0.24, -GOAL_W * 0.85, GOAL_W * 0.85);
  const target = receiver
    ? receiver.pos.clone().add(new THREE.Vector3(Math.sign(receiver.pos.x || fallbackX || 1) * 0.8, BALL_RADIUS, -goalSide * (isThrow ? 1.6 : 2.4)))
    : new THREE.Vector3(fallbackX, BALL_RADIUS, goalZ - goalSide * 12);
  target.x = clamp(target.x, -GOAL_W * 1.85, GOAL_W * 1.85);
  target.z = clamp(target.z, -FIELD_L / 2 + 5, FIELD_L / 2 - 5);
  target.y = BALL_RADIUS;
  return { receiver, target };
}

type HeaderContact = {
  distance: number;
  headPoint: THREE.Vector3;
};

type AerialReceptionPrediction = {
  point: THREE.Vector3;
  arrivalTime: number;
  touchType: FirstTouchType | "header";
};

type FirstTouchContact = {
  distance: number;
  point: THREE.Vector3;
  type: FirstTouchType;
};

function firstTouchContactRadius(type: FirstTouchType) {
  return BALL_RADIUS + (type === "foot" ? 0.64 : type === "thigh" ? 0.72 : 0.76);
}

function firstTouchTypeAtHeight(height: number): FirstTouchType | "header" {
  if (height <= 0.94) return "foot";
  if (height <= 1.46) return "thigh";
  if (height <= 2.16) return "chest";
  return "header";
}

function predictAerialReception(player: PlayerBody, active: MatchRuntime): AerialReceptionPrediction | null {
  if (active.ballOwnerId || active.ballState !== "kicked") return null;
  const position = active.ballPos.clone();
  const velocity = active.ballVel.clone();
  const curve = active.ballCurve.clone();
  const attackingGoalDistance = Math.abs(attackingGoalZ(player.team, active.half) - player.pos.z);
  const step = 0.04;
  let bodyControl: AerialReceptionPrediction | null = null;
  let fallback: AerialReceptionPrediction | null = null;

  for (let elapsed = step; elapsed <= 3.8; elapsed += step) {
    velocity.y -= BALL_GRAVITY * step;
    if (curve.lengthSq() > 0.0001) {
      velocity.addScaledVector(curve, step * (position.y > BALL_RADIUS + 0.18 ? 1 : 0.38));
      curve.multiplyScalar(Math.pow(position.y > BALL_RADIUS + 0.18 ? 0.36 : 0.18, step));
    }
    position.addScaledVector(velocity, step);
    if (position.y <= BALL_RADIUS && velocity.y < 0) {
      position.y = BALL_RADIUS;
      const landingPoint = position.clone().setY(0);
      const landingDistance = player.pos.distanceTo(landingPoint);
      const currentAlong = player.vel.length() * Math.min(elapsed, 0.32);
      const acceleratedTravel = currentAlong + 0.5 * 24 * elapsed * elapsed;
      const landingReach = 0.95 + Math.min(12.1 * elapsed, acceleratedTravel);
      const landing = { point: landingPoint, arrivalTime: elapsed, touchType: "foot" as const };
      if (bodyControl) return bodyControl;
      return landingDistance <= landingReach + 0.55 ? landing : fallback ?? landing;
    }

    const touchType = firstTouchTypeAtHeight(position.y);
    const highAttackingHeader = touchType === "header" && attackingGoalDistance < 35 && position.y <= 3.15;
    if (touchType === "header" && !highAttackingHeader) continue;
    const horizontalPoint = position.clone().setY(0);
    const reachDistance = player.pos.distanceTo(horizontalPoint);
    const currentAlong = player.vel.length() * Math.min(elapsed, 0.32);
    const acceleratedTravel = currentAlong + 0.5 * 24 * elapsed * elapsed;
    const reachBudget = 0.9 + Math.min(12.1 * elapsed, acceleratedTravel);
    if (reachDistance > reachBudget) continue;

    const prediction = { point: horizontalPoint, arrivalTime: elapsed, touchType } satisfies AerialReceptionPrediction;
    fallback = prediction;
    const descending = velocity.y <= 1.2;
    if (descending && (touchType === "thigh" || touchType === "chest" || touchType === "header")) {
      bodyControl = prediction;
    }
  }
  return bodyControl ?? fallback;
}

function firstTouchBodyPoints(player: PlayerBody, type: FirstTouchType, ballHeight: number) {
  const names = type === "foot"
    ? ["left-boot", "right-boot"]
    : type === "thigh"
      ? ["left-thigh", "right-thigh"]
      : ["torso"];
  player.mesh.updateMatrixWorld(true);
  return names
    .map((name) => player.mesh.getObjectByName(name))
    .filter((part): part is THREE.Object3D => Boolean(part))
    .map((part) => {
      const point = part.getWorldPosition(new THREE.Vector3());
      if (type === "foot") point.y = clamp(ballHeight, BALL_RADIUS, 0.62);
      if (type === "thigh") point.y = clamp(ballHeight, Math.max(0.42, point.y - 0.42), point.y + 0.56);
      if (type === "chest") point.y = clamp(ballHeight, point.y - 0.56, point.y + 0.56);
      return point;
    });
}

function realFirstTouchContact(player: PlayerBody, active: MatchRuntime, dt: number): FirstTouchContact | null {
  if (player.ballContactCooldown > 0 || active.ballIgnorePlayerId === player.id) return null;
  const type = firstTouchTypeAtHeight(active.ballPos.y);
  if (type === "header") return null;
  const travelDt = clamp(dt, 1 / 240, 0.05);
  const previousBall = active.ballPos.clone().addScaledVector(active.ballVel, -travelDt);
  const contactRadius = firstTouchContactRadius(type);
  const closest = firstTouchBodyPoints(player, type, active.ballPos.y)
    .map((point) => ({ point, ...sweptPointDistance(point, previousBall, active.ballPos) }))
    .sort((a, b) => a.distance - b.distance)[0];
  active.renderer.domElement.dataset.lastFirstTouchProbeType = type;
  active.renderer.domElement.dataset.lastFirstTouchProbeDistance = closest?.distance.toFixed(3) ?? "";
  active.renderer.domElement.dataset.lastFirstTouchProbeRadius = contactRadius.toFixed(3);
  if (!closest || closest.distance > contactRadius) return null;
  const incoming = active.ballVel.clone().setY(0);
  const towardPlayer = player.pos.clone().sub(previousBall).setY(0);
  if (incoming.lengthSq() > 0.05 && towardPlayer.lengthSq() > 0.05 && incoming.normalize().dot(towardPlayer.normalize()) < -0.12) return null;
  return { distance: closest.distance, point: closest.point, type };
}

function tryAerialFirstTouch(player: PlayerBody, active: MatchRuntime, dt: number) {
  if (
    active.phase !== "open"
    || active.ballOwnerId
    || active.ballState !== "kicked"
    || active.intendedReceiverId !== player.id
    || player.role === "keeper"
  ) return false;
  const contact = realFirstTouchContact(player, active, dt);
  if (!contact) return false;

  const incomingSpeed = active.ballVel.length();
  const imperfectTouch = incomingSpeed > 34;
  active.ballVel.lerp(player.vel.clone().multiplyScalar(imperfectTouch ? 0.54 : 0.36), imperfectTouch ? 0.62 : 0.76);
  active.ballVel.y = contact.type === "foot" ? clamp(active.ballVel.y, -0.26, 0.24) : clamp(active.ballVel.y * 0.16, -0.45, 0.38);
  active.ballCurve.multiplyScalar(0.12);
  player.firstTouchType = contact.type;
  player.firstTouchTimer = 0.38;
  player.ballContactCooldown = 0.36;
  active.renderer.domElement.dataset.aerialFirstTouches = String(Number(active.renderer.domElement.dataset.aerialFirstTouches ?? "0") + 1);
  active.renderer.domElement.dataset.lastAerialFirstTouchType = contact.type;
  active.renderer.domElement.dataset.lastAerialFirstTouchDistance = contact.distance.toFixed(3);
  return takePossession(player, active, contact);
}

function sweptPointDistance(point: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3) {
  const segment = to.clone().sub(from);
  const lengthSq = segment.lengthSq();
  if (lengthSq < 0.000001) return { distance: point.distanceTo(to), t: 1 };
  const t = clamp(point.clone().sub(from).dot(segment) / lengthSq, 0, 1);
  const closest = from.clone().addScaledVector(segment, t);
  return { distance: point.distanceTo(closest), t };
}

function realHeaderContact(player: PlayerBody, active: MatchRuntime, dt: number): HeaderContact | null {
  if (player.headerTimer > 0 || player.ballContactCooldown > 0 || active.ballIgnorePlayerId === player.id) return null;
  const head = player.mesh.getObjectByName("head");
  if (!head) return null;
  player.mesh.updateMatrixWorld(true);
  const headPoint = head.getWorldPosition(new THREE.Vector3())
    .addScaledVector(facingDirection(player), 0.19);
  const travelDt = clamp(dt, 1 / 240, 0.05);
  const previousBall = active.ballPos.clone().addScaledVector(active.ballVel, -travelDt);
  const contact = sweptPointDistance(headPoint, previousBall, active.ballPos);
  const contactRadius = BALL_RADIUS + 0.29;
  if (contact.distance > contactRadius) return null;
  const ballToHead = headPoint.clone().sub(previousBall);
  const towardHead = ballToHead.lengthSq() < 0.0001
    || active.ballVel.clone().normalize().dot(ballToHead.normalize()) > 0.1
    || active.ballPos.distanceTo(headPoint) < contactRadius * 0.82;
  if (!towardHead) return null;
  const horizontalBall = active.ballPos.clone().setY(player.pos.y);
  const lookToBall = horizontalBall.sub(player.pos);
  if (lookToBall.lengthSq() > 0.04 && facingDirection(player).dot(lookToBall.normalize()) < -0.18) return null;
  return { distance: contact.distance, headPoint };
}

function recordHeaderContact(active: MatchRuntime, contact: HeaderContact) {
  const element = active.renderer.domElement;
  element.dataset.headerContacts = String(Number(element.dataset.headerContacts ?? "0") + 1);
  element.dataset.lastHeaderDistance = contact.distance.toFixed(3);
}

function tryHeader(player: PlayerBody, active: MatchRuntime, dt = 1 / 60) {
  if (active.phase !== "open" || active.ballOwnerId || active.intendedReceiverId !== player.id) return false;
  if (player.role === "keeper" || player.actionCooldown > 0 || player.recoveryTimer > 0) return false;
  const contact = realHeaderContact(player, active, dt);
  if (!contact) return false;
  const goalZ = attackingGoalZ(player.team, active.half);
  if (Math.abs(goalZ - player.pos.z) > 33) return false;
  const target = quickKickPoint(player, active);
  const direction = target.clone().sub(active.ballPos).setY(0);
  if (direction.lengthSq() < 0.12) return false;
  const distance = clamp(target.distanceTo(active.ballPos), 8, 42);
  releasePossession(active, "kicked");
  active.ballVel.copy(direction.normalize().multiplyScalar(clamp(20 + distance * 0.28, 22, 34)));
  active.ballVel.y = clamp(2.2 + distance * 0.075, 2.6, 5.7);
  active.ballCurve.set(0, 0, 0);
  active.intendedReceiverId = null;
  active.ballIgnorePlayerId = player.id;
  active.ballIgnoreTimer = 0.22;
  active.lastTouchTeam = player.team;
  active.lastTouchPlayerId = player.id;
  player.kickTimer = 0.24;
  player.actionCooldown = 0.32;
  player.recoveryTimer = Math.max(player.recoveryTimer, 0.12);
  player.headerTimer = 0.42;
  player.ballContactCooldown = 0.3;
  recordHeaderContact(active, contact);
  playKickSound(active, 1.1);
  return true;
}

function tryAerialHeaderDuel(active: MatchRuntime, dt: number) {
  if (active.phase !== "open" || active.ballOwnerId || active.ballState !== "kicked") return false;
  if (active.ballPos.y < 1.45 || active.ballPos.y > 3.35 || Math.abs(active.ballVel.y) > 13.5) return false;
  const candidates = active.players
    .filter((player) => (
      player.role !== "keeper"
      && !player.sentOff
      && player.actionCooldown <= 0
      && player.recoveryTimer <= 0.08
      && player.headerTimer <= 0
    ))
    .map((player) => ({ player, contact: realHeaderContact(player, active, dt) }))
    .filter((candidate): candidate is { player: PlayerBody; contact: HeaderContact } => Boolean(candidate.contact))
    .map(({ player, contact }) => {
      const intendedBonus = active.intendedReceiverId === player.id ? 4.8 : 0;
      const timing = active.ballVel.y <= 0 ? 2.2 : 0.7;
      const facing = facingDirection(player).dot(active.ballPos.clone().setY(0).sub(player.pos).normalize());
      const lineBonus = player.line === "forward" ? 1.4 : player.line === "defender" ? 1.0 : 0.7;
      return { player, contact, score: (0.72 - contact.distance) * 8 + intendedBonus + timing + facing * 1.2 + lineBonus };
    })
    .sort((a, b) => b.score - a.score);
  const winnerEntry = candidates[0];
  const winner = winnerEntry?.player;
  if (!winner || !winnerEntry || winnerEntry.score < 2.4) return false;

  const ownGoalDistance = Math.abs(teamGoalZ(winner.team, active.half) - winner.pos.z);
  const attackingGoalDistance = Math.abs(attackingGoalZ(winner.team, active.half) - winner.pos.z);
  let target: THREE.Vector3;
  if (winner.line === "defender" && ownGoalDistance < 38) {
    const clearDirection = upfieldKickDirection(winner.team, active.half);
    target = winner.pos.clone().add(clearDirection.multiplyScalar(38)).add(new THREE.Vector3(Math.sign(winner.pos.x || winner.home.x || 1) * 10, BALL_RADIUS, 0));
  } else if (attackingGoalDistance < 34 && Math.abs(winner.pos.x) < GOAL_W * 2.2) {
    target = quickKickPoint(winner, active);
  } else {
    const teammate = choosePassTarget(winner, active, "short");
    target = teammate
      ? kickTargetForStyle(winner, active, teammate, "short")
      : winner.pos.clone().add(upfieldKickDirection(winner.team, active.half).multiplyScalar(22)).setY(BALL_RADIUS);
    if (teammate) active.intendedReceiverId = teammate.id;
  }

  const direction = target.clone().sub(active.ballPos).setY(0);
  if (direction.lengthSq() < 0.1) return false;
  const distance = clamp(target.distanceTo(active.ballPos), 8, 48);
  releasePossession(active, "kicked");
  active.ballVel.copy(direction.normalize().multiplyScalar(clamp(18 + distance * 0.32, 22, 37)));
  active.ballVel.y = winner.line === "defender"
    ? clamp(3.2 + distance * 0.08, 4.4, 7.4)
    : clamp(1.8 + distance * 0.06, 2.4, 5.6);
  active.ballCurve.set(0, 0, 0);
  active.ballIgnorePlayerId = winner.id;
  active.ballIgnoreTimer = 0.24;
  active.lastTouchTeam = winner.team;
  active.lastTouchPlayerId = winner.id;
  winner.headerTimer = 0.42;
  winner.actionCooldown = 0.34;
  winner.recoveryTimer = Math.max(winner.recoveryTimer, 0.1);
  winner.ballContactCooldown = 0.32;
  recordHeaderContact(active, winnerEntry.contact);
  setPlayerHeading(winner, headingFromDirection(direction), 1 / 60, 12);
  playKickSound(active, 0.92);
  return true;
}

function clampAbnormalDefenderDisplacement(
  active: MatchRuntime,
  frameStart: Map<string, THREE.Vector3> | null,
  dt: number,
) {
  if (!frameStart || !active.defensivePlan) return;
  const maximumFrameDisplacement = Math.max(0.52, 17 * dt + 0.14);
  active.players.forEach((player) => {
    if (player.team !== active.defensivePlan?.defendingTeam || player.role === "keeper" || player.sentOff) return;
    const start = frameStart.get(player.id);
    if (!start) return;
    const displacement = player.pos.clone().sub(start).setY(0);
    const distance = displacement.length();
    active.maxDefenderFrameDisplacement = Math.max(active.maxDefenderFrameDisplacement, distance);
    if (!Number.isFinite(distance) || !Number.isFinite(player.vel.x) || !Number.isFinite(player.vel.z)) {
      player.pos.copy(start);
      player.vel.set(0, 0, 0);
      active.abnormalMovementClamps += 1;
    } else if (distance > maximumFrameDisplacement) {
      player.pos.copy(start).add(displacement.multiplyScalar(maximumFrameDisplacement / distance));
      if (player.vel.length() > 14.8) player.vel.setLength(14.8);
      active.abnormalMovementClamps += 1;
    }
    clampPlayer(player);
    player.mesh.position.copy(player.pos);
  });
}

function separatePlayers(active: MatchRuntime, dt: number) {
  const players = active.players;
  const elapsed = dt * 3;
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      const a = players[i];
      const b = players[j];
      if (Math.abs(a.pos.x - b.pos.x) > PERSONAL_SPACE || Math.abs(a.pos.z - b.pos.z) > PERSONAL_SPACE) continue;
      const delta = new THREE.Vector3(a.pos.x - b.pos.x, 0, a.pos.z - b.pos.z);
      const distance = delta.length();
      if (distance >= PERSONAL_SPACE) continue;
      const normal = distance > 0.001
        ? delta.multiplyScalar(1 / distance)
        : (() => {
            const relativeVelocity = a.vel.clone().sub(b.vel).setY(0);
            if (relativeVelocity.lengthSq() > 0.02) return relativeVelocity.normalize();
            const deterministicSide = a.id < b.id ? 1 : -1;
            return new THREE.Vector3(deterministicSide, 0, deterministicSide * 0.23).normalize();
          })();
      const relativeVelocity = a.vel.clone().sub(b.vel).setY(0);
      const closingSpeed = relativeVelocity.dot(normal);
      if (closingSpeed < 0) {
        const impulse = Math.min(-closingSpeed * 0.5, 2.15);
        a.vel.addScaledVector(normal, impulse);
        b.vel.addScaledVector(normal, -impulse);
      }
      const deepOverlap = distance < PERSONAL_SPACE * 0.58;
      const nearLocked = deepOverlap && relativeVelocity.length() < 0.75;
      a.contactLockTimer = nearLocked ? a.contactLockTimer + elapsed : Math.max(0, a.contactLockTimer - elapsed * 1.8);
      b.contactLockTimer = nearLocked ? b.contactLockTimer + elapsed : Math.max(0, b.contactLockTimer - elapsed * 1.8);
      const failsafe = a.contactLockTimer > 0.42 || b.contactLockTimer > 0.42;
      const correction = Math.min(failsafe ? 0.24 : 0.16, Math.max(0.025, (PERSONAL_SPACE - distance) * 0.42));
      const tangentAmount = failsafe ? 0.045 : 0;
      const tangent = new THREE.Vector3(-normal.z, 0, normal.x).multiplyScalar((a.id < b.id ? 1 : -1) * tangentAmount);
      const aMobility = a.role === "keeper" ? 0.28 : 1;
      const bMobility = b.role === "keeper" ? 0.28 : 1;
      const totalMobility = Math.max(0.01, aMobility + bMobility);
      const aShare = aMobility / totalMobility;
      const bShare = bMobility / totalMobility;
      a.pos.addScaledVector(normal, correction * aShare).addScaledVector(tangent, aShare);
      b.pos.addScaledVector(normal, -correction * bShare).addScaledVector(tangent, -bShare);
      active.collisionResolutionsThisFrame += 1;
      active.maxCollisionCorrection = Math.max(active.maxCollisionCorrection, correction);
      if (failsafe) {
        a.tackleTimer = 0;
        b.tackleTimer = 0;
        a.recoveryTimer = Math.min(a.recoveryTimer, 0.08);
        b.recoveryTimer = Math.min(b.recoveryTimer, 0.08);
        a.decisionCooldown = 0;
        b.decisionCooldown = 0;
        a.contactLockTimer = 0;
        b.contactLockTimer = 0;
      }
      const pushSpeed = dt > 0 ? Math.min(correction / dt, 5.8) : 0;
      a.animationSpeed = Math.max(a.animationSpeed, pushSpeed);
      b.animationSpeed = Math.max(b.animationSpeed, pushSpeed);
      clampPlayer(a);
      clampPlayer(b);
      a.mesh.position.copy(a.pos);
      b.mesh.position.copy(b.pos);
    }
  }
}

function handleGoalkeeperActions(active: MatchRuntime) {
  if (
    active.phase !== "open"
    || active.pendingRestartPhase === "goal-kick"
    || active.goalKickReleaseTimer > 0
    || active.ballOwnerId
  ) return;
  if (active.ballPos.y > 4.6) return;
  const flatBall = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
  active.players
    .filter((player) => player.role === "keeper")
    .forEach((keeper) => {
      if (keeper.id === active.goalKickLockPlayerId && active.goalKickLockTimer > 0) return;
      if (keeper.id === active.ballIgnorePlayerId) {
        if (active.ballIgnoreTimer > 0) return;
        active.ballIgnorePlayerId = null;
      }
      const ownZ = teamGoalZ(keeper.team, active.half);
      const intoField = -Math.sign(ownZ) || 1;
      const shotSpeed = active.ballVel.length();
      const distanceFromGoal = Math.abs(active.ballPos.z - ownZ);
      const keeperToBall = flatBall.clone().sub(keeper.pos);
      const distanceToBall = keeperToBall.length();
      const inKeeperZone = distanceFromGoal < (shotSpeed > 8 ? 66 : 45) && Math.abs(active.ballPos.x) < GOAL_W / 2 + (shotSpeed > 8 ? 23 : 18.4);
      const inClaimZone = distanceFromGoal < 48 && Math.abs(active.ballPos.x) < GOAL_W / 2 + 18.4 && active.ballPos.y < 3.2;
      const groundedKeeperAreaBall = distanceFromGoal < 27
        && Math.abs(active.ballPos.x) < GOAL_W / 2 + 14.5
        && active.ballPos.y < 1.28
        && shotSpeed < 17.5;
      const movingTowardGoal = Math.sign(active.ballVel.z || ownZ - active.ballPos.z) === Math.sign(ownZ - active.ballPos.z);
      const closeEnough = keeper.pos.distanceTo(flatBall) < (movingTowardGoal ? 4.75 : 3.35);
      const closestToBall = active.players
        .filter((player) => player.id !== keeper.id && !player.sentOff)
        .every((player) => player.pos.distanceTo(flatBall) > distanceToBall + (player.team === keeper.team ? -0.6 : 0.35));
      const parriedLooseBall = active.lastTouchPlayerId === keeper.id
        && active.ballState === "loose"
        && inClaimZone
        && shotSpeed < 21.5
        && distanceToBall < 15.5;
      const looseClaimPriority = (active.ballState !== "kicked" || groundedKeeperAreaBall)
        && inClaimZone
        && shotSpeed < (groundedKeeperAreaBall ? 18.5 : 22)
        && (closestToBall || groundedKeeperAreaBall || distanceToBall < 15.4 || parriedLooseBall);
      const closeCrossClaim = active.ballState === "kicked"
        && inClaimZone
        && shotSpeed < 25
        && active.ballPos.y < 3.05
        && (closestToBall || distanceToBall < 10.8);
      if (!inKeeperZone && !looseClaimPriority && !closeCrossClaim && !parriedLooseBall && !(closestToBall && distanceToBall < 15 && distanceFromGoal < 38)) return;

      const baseDepth = clamp(5.4 + clamp(38 - distanceFromGoal, 0, 38) * 0.2, 4.4, 12.2);
      const sideThreat = Math.abs(active.ballPos.x) > GOAL_W / 2 - 1.5 && distanceFromGoal < 28;
      const desiredX = clamp(
        active.ballPos.x * (sideThreat ? 0.78 : distanceFromGoal < 34 ? 0.54 : 0.34),
        -GOAL_W / 2 + 0.62,
        GOAL_W / 2 - 0.62,
      );
      const desiredZ = ownZ + intoField * baseDepth;
      const baseTarget = new THREE.Vector3(desiredX, 0, desiredZ);
      if (!closestToBall || !inClaimZone || shotSpeed > 9.5) {
        const keeperAdjust = baseTarget.sub(keeper.pos);
        keeper.vel.x += clamp(keeperAdjust.x * 0.085, -0.24, 0.24);
        keeper.vel.z += clamp(keeperAdjust.z * 0.064, -0.2, 0.2);
        capKeeperMotion(keeper);
      }

      if (keeperToBall.lengthSq() > 0.04) setPlayerHeading(keeper, keeperSquareHeading(keeper, active), 1 / 60, 4.2);

      if ((closestToBall || looseClaimPriority || closeCrossClaim || parriedLooseBall || groundedKeeperAreaBall) && inClaimZone && shotSpeed < (groundedKeeperAreaBall ? 18.5 : 20.5)) {
        const claimTarget = flatBall.clone().sub(keeper.pos);
        if (claimTarget.lengthSq() > 0.08) {
          const urgency = groundedKeeperAreaBall ? distanceToBall > 4 ? 0.82 : 0.54 : distanceToBall > 4 ? 0.66 : 0.42;
          keeper.vel.add(claimTarget.normalize().multiplyScalar(urgency));
          capKeeperMotion(keeper);
        }
        if (distanceToBall < (groundedKeeperAreaBall ? 4.25 : parriedLooseBall ? 3.75 : looseClaimPriority ? 3.36 : closeCrossClaim ? 2.96 : 2.48)) {
          if (!takePossession(keeper, active)) return;
          if (distanceFromGoal < 22 && active.ballPos.y < 2.3) {
            keeper.catchTimer = 0.66;
          }
          active.ballVel.set(0, 0, 0);
          active.ballCurve.set(0, 0, 0);
          active.cooldown = Math.max(active.cooldown, 0.24);
          return;
        }
      }

      if (!movingTowardGoal && !closeEnough) return;
      if (shotSpeed > 8) {
        const signedTimeToGoal = Math.abs(active.ballVel.z) > 0.12 ? (keeper.pos.z - active.ballPos.z) / active.ballVel.z : 0.28;
        const pathTime = clamp(signedTimeToGoal > 0 ? signedTimeToGoal : 0.28, 0, 1.18);
        const predictedX = clamp(active.ballPos.x + active.ballVel.x * pathTime, -GOAL_W / 2 + 0.52, GOAL_W / 2 - 0.52);
        const sideBall = Math.abs(active.ballPos.x) > GOAL_W / 2 - 1.4 && Math.abs(active.ballPos.z - ownZ) < 26;
        const nearPostX = clamp(active.ballPos.x, -GOAL_W / 2 + 0.65, GOAL_W / 2 - 0.65);
        const desiredX = sideBall ? nearPostX * 0.84 + predictedX * 0.16 : predictedX;
        const lateralGap = desiredX - keeper.pos.x;
        const saveSide = Math.sign(predictedX - keeper.pos.x || active.ballVel.x || active.ballPos.x - keeper.pos.x || 1);
        const stepZ = ownZ + intoField * clamp(5.8 + clamp(20 - distanceFromGoal, 0, 20) * 0.14, 5.4, 8.2);
        keeper.vel.x += clamp(lateralGap * (sideBall ? 0.13 : 0.15), -0.34, 0.34);
        keeper.vel.z += clamp((stepZ - keeper.pos.z) * 0.09, -0.22, 0.22);
        capKeeperMotion(keeper);
        const canDive = Math.abs(lateralGap) < 4.2 && Math.abs(active.ballPos.z - ownZ) < 16.8 && shotSpeed > 8.4;
        const wellPositioned = Math.abs(lateralGap) < 2.08 && Math.abs(active.ballPos.z - ownZ) < 14.8;
        if (canDive && keeper.diveTimer <= 0.05) {
          keeper.diveSide = saveSide;
          keeper.diveTimer = 0.62;
          keeper.recoveryTimer = Math.max(keeper.recoveryTimer, 0.3);
          keeper.vel.x += keeper.diveSide * clamp(Math.abs(lateralGap) * 0.075, 0.08, 0.24);
          capKeeperMotion(keeper);
        }
        const handReach = keeperHandPoint(keeper).setY(clamp(active.ballPos.y, 1.48, 2.54));
        const handContact = active.ballPos.distanceTo(handReach) < (active.ballPos.y > 1.45 ? 2.25 : 1.7);
        const bodyContact = keeper.pos.distanceTo(flatBall) < 2.08 && active.ballPos.y < 2.42;
        const divingContact = keeper.diveTimer > 0 && Math.abs(active.ballPos.x - keeper.pos.x) < 2.08 && Math.abs(active.ballPos.z - keeper.pos.z) < 1.62 && active.ballPos.y < 3.04;
        if (!handContact && !bodyContact && !divingContact) return;
        keeper.diveSide = saveSide;
        keeper.catchTimer = 0.46;
        keeper.recoveryTimer = Math.max(keeper.recoveryTimer, 0.36);
        if ((wellPositioned || handContact) && shotSpeed < (active.ballPos.y > 1.45 ? 22 : 25)) {
          if (!takePossession(keeper, active)) return;
          active.ballVel.set(0, 0, 0);
          active.eventText = "PLAY";
          active.eventTimer = 0;
          active.cooldown = Math.max(active.cooldown, 0.26);
          return;
        }
        const parrySpeed = clamp(shotSpeed * (wellPositioned || handContact ? 0.14 : 0.21), 1.6, 7.4);
        const parrySide = Math.sign(active.ballVel.x || active.ballPos.x - keeper.pos.x || keeper.diveSide || 1);
        const parryDirection = new THREE.Vector3(parrySide * 0.58, 0, -Math.sign(ownZ) * 0.92).normalize();
        active.ballVel.copy(parryDirection.multiplyScalar(parrySpeed));
        active.ballVel.y = clamp(active.ballPos.y > 1.4 ? 0.95 : 0.42, 0.35, 1.15);
        active.ballCurve.set(0, 0, 0);
        active.ballOwnerId = null;
        active.possession = null;
        active.possessionStableOwnerId = null;
        active.possessionStabilityTimer = 0;
        active.intendedReceiverId = null;
        active.manualPassReceiverId = null;
        active.receptionLockPlayerId = null;
        active.receptionLockTimer = 0;
        active.ballState = "loose";
        active.ballIgnorePlayerId = keeper.id;
        active.ballIgnoreTimer = 0.3;
        active.looseContactPlayerId = keeper.id;
        active.looseContactCooldownTimer = 0.22;
        active.lastTouchTeam = keeper.team;
        active.lastTouchPlayerId = keeper.id;
        active.renderer.domElement.dataset.keeperParries = String(
          Number(active.renderer.domElement.dataset.keeperParries ?? "0") + 1,
        );
        active.eventText = "PLAY";
        active.eventTimer = 0;
        keeper.recoveryTimer = Math.min(keeper.recoveryTimer, 0.12);
        keeper.decisionCooldown = 0;
        return;
      }
      const sideCatch = Math.abs(active.ballPos.x) > GOAL_W / 2 - 2.4
        && Math.abs(active.ballPos.z - ownZ) < 18
        && keeper.pos.distanceTo(flatBall) < 3.2;
      if (sideCatch) {
        keeper.vel.x += clamp((active.ballPos.x - keeper.pos.x) * 0.075, -0.2, 0.2);
        keeper.vel.z += clamp((active.ballPos.z - keeper.pos.z) * 0.064, -0.16, 0.16);
        capKeeperMotion(keeper);
        if (keeper.pos.distanceTo(flatBall) > 1.75) return;
        keeper.catchTimer = 0.58;
        keeper.recoveryTimer = Math.max(keeper.recoveryTimer, 0.24);
        if (!takePossession(keeper, active)) return;
        active.ballVel.set(0, 0, 0);
        return;
      }
      if (!closeEnough) return;
      keeper.catchTimer = 0.62;
      keeper.recoveryTimer = Math.max(keeper.recoveryTimer, 0.28);
      if (!takePossession(keeper, active)) return;
      active.ballVel.set(0, 0, 0);
      active.eventText = "PLAY";
      active.eventTimer = 0;
      active.cooldown = Math.max(active.cooldown, 0.24);
    });
}

function keeperHandPoint(keeper: PlayerBody) {
  return keeper.pos.clone()
    .add(facingDirection(keeper).multiplyScalar(0.44))
    .setY(1.62);
}

function keeperSquareHeading(keeper: PlayerBody, active: MatchRuntime) {
  const ownZ = teamGoalZ(keeper.team, active.half);
  const intoField = -Math.sign(ownZ) || 1;
  const toBall = active.ballPos.clone().setY(0).sub(keeper.pos);
  if (toBall.lengthSq() < 0.2) return intoField > 0 ? 0 : Math.PI;
  const shotMovingTowardGoal = active.ballState === "kicked"
    && active.ballVel.length() > 6.5
    && Math.sign(active.ballVel.z || ownZ - active.ballPos.z) === Math.sign(ownZ - active.ballPos.z);
  if (shotMovingTowardGoal) {
    const timeToKeeper = Math.abs(active.ballVel.z) > 0.12
      ? (keeper.pos.z - active.ballPos.z) / active.ballVel.z
      : -1;
    const projectedX = timeToKeeper >= 0
      ? active.ballPos.x + active.ballVel.x * clamp(timeToKeeper, 0, 1.2)
      : active.ballPos.x;
    const trajectoryFacing = new THREE.Vector3(
      clamp(projectedX - keeper.pos.x, -7.5, 7.5),
      0,
      intoField * Math.max(3.4, Math.abs(active.ballPos.z - keeper.pos.z) * 0.42),
    );
    return headingFromDirection(trajectoryFacing.normalize());
  }
  const ballBehindKeeper = Math.sign(toBall.z) !== Math.sign(intoField) && Math.abs(toBall.z) > 2.2;
  if (ballBehindKeeper) {
    toBall.x *= 0.24;
    toBall.z = intoField;
  } else {
    toBall.x *= 0.74;
  }
  return headingFromDirection(toBall.normalize());
}

function updateKeeperHeadTracking(keeper: PlayerBody, active: MatchRuntime, dt: number) {
  const headRoot = keeper.mesh.getObjectByName("head-root");
  if (!headRoot) return;
  const toBall = active.ballPos.clone().sub(keeper.pos).setY(active.ballPos.y - 2.32);
  if (toBall.lengthSq() < 0.05) return;
  const desiredWorldHeading = headingFromDirection(toBall.clone().setY(0));
  const desiredLocalYaw = clamp(angleDelta(keeper.heading, desiredWorldHeading), -0.82, 0.82);
  const yawStep = clamp(desiredLocalYaw - headRoot.rotation.y, -9.5 * dt, 9.5 * dt);
  headRoot.rotation.y += yawStep;
  const flatDistance = Math.max(1.2, Math.hypot(toBall.x, toBall.z));
  const desiredPitch = clamp(-Math.atan2(toBall.y, flatDistance), -0.42, 0.32);
  headRoot.rotation.x += clamp(desiredPitch - headRoot.rotation.x, -7.5 * dt, 7.5 * dt);
}

function capKeeperMotion(keeper: PlayerBody) {
  const maxSpeed = keeper.diveTimer > 0 ? 6.4 : keeper.catchTimer > 0 ? 5.2 : 5.6;
  const flat = new THREE.Vector3(keeper.vel.x, 0, keeper.vel.z);
  if (flat.length() > maxSpeed) {
    flat.setLength(maxSpeed);
    keeper.vel.x = flat.x;
    keeper.vel.z = flat.z;
  }
}

function setPlayerHeading(player: PlayerBody, desiredHeading: number, dt: number, turnSpeed: number) {
  const difference = angleDelta(player.heading, desiredHeading);
  const step = clamp(difference, -turnSpeed * dt, turnSpeed * dt);
  player.heading += step;
  player.turnRate = dt > 0 ? step / dt : 0;
  player.mesh.rotation.y = player.heading;
  return difference;
}

function movePlayer(player: PlayerBody, moveDir: THREE.Vector3, maxSpeed: number, dt: number, active: MatchRuntime) {
  const dir = moveDir.clone().setY(0);
  const hasIntent = dir.lengthSq() > 0.001;
  if (hasIntent) dir.normalize();
  let desiredHeading = player.heading;
  const owner = ballOwner(active);
  const defensiveJockey = Boolean(
    owner
    && owner.team !== player.team
    && !player.controlledBy
    && player.role !== "keeper"
    && active.phase === "open"
    && player.pos.distanceTo(owner.pos) < (player.line === "defender" ? 18 : 13),
  );
  if (player.role === "keeper") {
    desiredHeading = keeperSquareHeading(player, active);
  } else if (defensiveJockey && owner) {
    const toCarrier = owner.pos.clone().sub(player.pos).setY(0);
    if (toCarrier.lengthSq() > 0.05) desiredHeading = headingFromDirection(toCarrier);
  } else if (hasIntent) {
    desiredHeading = Math.atan2(dir.x, dir.z);
  } else if (player.vel.lengthSq() < 0.04) {
    const lookAtBall = active.ballPos.clone().setY(0).sub(player.pos);
    if (lookAtBall.lengthSq() > 6) desiredHeading = Math.atan2(lookAtBall.x, lookAtBall.z);
  }
  const turnSpeed = player.role === "keeper" ? 3.9 : player.controlledBy ? 6.2 : 5.15;
  const turnGap = Math.abs(setPlayerHeading(player, desiredHeading, dt, turnSpeed));
  const acceleration = player.role === "keeper" ? 12.5 : player.controlledBy ? 32 : 27;
  const braking = player.role === "keeper" ? 28 : player.controlledBy ? 42 : 36;
  const flatBall = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
  const automatedControlled = player.controlledBy === "p1" && active.p1Autopilot;
  const urgentBallCommit = (!player.controlledBy || automatedControlled)
    && player.role !== "keeper"
    && active.phase === "open"
    && (active.intendedReceiverId === player.id || !active.ballOwnerId && flatBall.distanceTo(player.pos) < 8);
  let targetVel = new THREE.Vector3();
  if (hasIntent) {
    const turnScale = urgentBallCommit ? 1 : clamp(1 - turnGap / Math.PI, player.role === "keeper" ? 0.32 : 0.18, 1);
    const travelDir = player.role === "keeper" || urgentBallCommit || defensiveJockey
      ? dir
      : forwardFromHeading(player.heading);
    targetVel = travelDir.multiplyScalar(maxSpeed * turnScale);
  }
  const delta = targetVel.sub(player.vel);
  const maxChange = (hasIntent ? acceleration : braking) * dt;
  if (delta.length() > maxChange) delta.setLength(maxChange);
  player.vel.add(delta);
  const traction = hasIntent ? 0.18 : 0.008;
  player.vel.multiplyScalar(Math.pow(traction, dt));
  if (player.role === "keeper") capKeeperMotion(player);
  player.pos.addScaledVector(player.vel, dt);
}

function updateStuckState(player: PlayerBody, intent: THREE.Vector3, active: MatchRuntime, dt: number) {
  if (player.controlledBy || active.phase !== "open") {
    player.lastPos.copy(player.pos);
    return;
  }
  const moved = player.pos.distanceTo(player.lastPos);
  const expectsMotion = intent.lengthSq() > 0.05 && player.vel.length() > 0.12;
  const spinningWithoutProgress = Math.abs(player.turnRate) > 2.35 && moved < 0.05;
  player.stuckTimer = (expectsMotion && moved < 0.06) || spinningWithoutProgress ? player.stuckTimer + dt : Math.max(0, player.stuckTimer - dt * 1.9);
  if (spinningWithoutProgress && player.stuckTimer > 0.36) {
    player.vel.multiplyScalar(0.25);
    player.decisionCooldown = 0;
  }
  if (player.stuckTimer > 0.62 && player.role !== "keeper") {
    const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
    const side = player.number % 2 === 0 ? 1 : -1;
    const owner = ballOwner(active);
    const flatBall = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
    if (active.intendedReceiverId === player.id || (!owner && flatBall.distanceTo(player.pos) < 14)) {
      player.fallbackTarget.copy(flatBall);
    } else if (player.line === "defender" && (owner?.team === opponent(player.team) || (!owner && flatBall.distanceTo(player.pos) < 18))) {
      player.fallbackTarget.copy(owner?.pos ?? flatBall);
    } else {
      player.fallbackTarget.copy(player.home).add(new THREE.Vector3(side * (4 + player.number % 3), 0, attackSign * (player.line === "forward" ? 5 : 2.5)));
    }
    player.fallbackTarget.x = clamp(player.fallbackTarget.x, -FIELD_W / 2 + 3, FIELD_W / 2 - 3);
    player.fallbackTarget.z = clamp(player.fallbackTarget.z, -FIELD_L / 2 + 3, FIELD_L / 2 - 3);
    player.fallbackTimer = 1.1;
    player.stuckTimer = 0;
  }
  player.lastPos.copy(player.pos);
}

function animatePlayer(player: PlayerBody, dt: number) {
  const speed = Math.max(player.vel.length(), player.animationSpeed);
  player.runPhase += speed * dt * (player.role === "keeper" ? 1.35 : 2.05);
  const strideScale = player.role === "keeper" ? 0.32 : 0.82;
  const stride = speed > 0.35 ? Math.sin(player.runPhase) * strideScale : 0;
  const lift = speed > 0.35 ? 0.16 + Math.max(0, Math.sin(player.runPhase)) * 0.44 : 0.08;
  const otherLift = speed > 0.35 ? 0.16 + Math.max(0, -Math.sin(player.runPhase)) * 0.44 : 0.08;
  const armSwing = -stride * 0.78;
  const { bodyRoot, leftLeg, rightLeg, leftKnee, rightKnee, leftArm, rightArm, leftElbow, rightElbow } = player.parts;
  if (bodyRoot) {
    const cadence = Math.sin(player.runPhase);
    const balance = Math.cos(player.runPhase);
    const turnLean = clamp(player.turnRate * -0.018, -0.11, 0.11);
    bodyRoot.position.x = speed > 0.35 ? balance * (player.role === "keeper" ? 0.012 : 0.035) : 0;
    bodyRoot.position.y = speed > 0.35 ? Math.abs(Math.sin(player.runPhase * 2)) * 0.055 : 0;
    bodyRoot.position.z = 0;
    bodyRoot.rotation.x = speed > 0.35 && player.role !== "keeper" ? -0.09 - Math.min(speed / 180, 0.04) : 0;
    bodyRoot.rotation.y = speed > 0.35 ? cadence * 0.082 : 0;
    bodyRoot.rotation.z = speed > 0.35 ? balance * 0.036 + turnLean : 0;
    if (player.celebrateTimer > 0) {
      bodyRoot.position.y += Math.max(0, Math.sin(player.celebrateTimer * 14)) * 0.16;
      bodyRoot.rotation.z += Math.sin(player.celebrateTimer * 10) * 0.18;
    }
    if (player.skillTimer > 0 && player.skillMove) {
      const flair = Math.sin(player.skillTimer * 22);
      const side = player.skillSide || 1;
      bodyRoot.rotation.z += side * 0.16 * flair;
      bodyRoot.rotation.y += side * 0.18 * Math.abs(flair);
      bodyRoot.rotation.x -= player.skillMove === "dribble-burst" ? 0.08 : 0.03;
    }
  }
  if (leftLeg) leftLeg.rotation.x = stride;
  if (rightLeg) rightLeg.rotation.x = -stride;
  if (leftKnee) leftKnee.rotation.x = lift;
  if (rightKnee) rightKnee.rotation.x = otherLift;
  if (leftArm) {
    leftArm.rotation.x = armSwing;
    leftArm.rotation.z = -0.08 + (speed > 0.35 ? Math.sin(player.runPhase) * 0.02 : 0);
  }
  if (rightArm) {
    rightArm.rotation.x = -armSwing;
    rightArm.rotation.z = 0.08 - (speed > 0.35 ? Math.sin(player.runPhase) * 0.02 : 0);
  }
  if (leftElbow) leftElbow.rotation.x = 0.38 + Math.max(0, -armSwing) * 0.62;
  if (rightElbow) rightElbow.rotation.x = 0.38 + Math.max(0, armSwing) * 0.62;

  if (player.passRequestTimer > 0 && player.kickTimer <= 0 && player.tackleTimer <= 0 && player.catchTimer <= 0) {
    const requestPose = Math.sin(clamp(player.passRequestTimer / 0.34, 0, 1) * Math.PI);
    if (rightArm) {
      rightArm.rotation.x = -1.94 - requestPose * 0.34;
      rightArm.rotation.z = 0.46;
    }
    if (rightElbow) rightElbow.rotation.x = -0.28;
  }

  if (player.celebrateTimer > 0) {
    if (leftArm) leftArm.rotation.x = -2.45 + Math.sin(player.celebrateTimer * 9) * 0.18;
    if (rightArm) rightArm.rotation.x = -2.45 - Math.sin(player.celebrateTimer * 9) * 0.18;
    if (leftElbow) leftElbow.rotation.x = -0.2;
    if (rightElbow) rightElbow.rotation.x = -0.2;
  }

  if (player.kickTimer > 0) {
    const progress = clamp(1 - player.kickTimer / 0.46, 0, 1);
    const backswing = progress < 0.35 ? -progress * 1.9 : 0;
    const followThrough = progress >= 0.35 ? Math.sin((progress - 0.35) / 0.65 * Math.PI) * 1.35 : 0;
    const kickArc = backswing + followThrough;
    if (rightLeg) rightLeg.rotation.x = kickArc;
    if (rightKnee) rightKnee.rotation.x = Math.max(0.08, -kickArc * 0.45);
    if (leftLeg) leftLeg.rotation.x = -0.22;
    if (leftKnee) leftKnee.rotation.x = 0.34;
    if (bodyRoot) {
      bodyRoot.rotation.z += 0.06;
      bodyRoot.rotation.x -= 0.08 + followThrough * 0.05;
    }
  }
  if (player.headerTimer > 0) {
    const headerPose = Math.sin((1 - player.headerTimer / 0.42) * Math.PI);
    if (bodyRoot) {
      bodyRoot.position.y += 0.34 * headerPose;
      bodyRoot.rotation.x = -0.42 * headerPose;
      bodyRoot.rotation.z += (player.number % 2 === 0 ? 0.08 : -0.08) * headerPose;
    }
    if (leftArm) {
      leftArm.rotation.x = -0.7 * headerPose;
      leftArm.rotation.z = -0.42;
    }
    if (rightArm) {
      rightArm.rotation.x = -0.7 * headerPose;
      rightArm.rotation.z = 0.42;
    }
    if (leftKnee) leftKnee.rotation.x = 0.5 * headerPose;
    if (rightKnee) rightKnee.rotation.x = 0.5 * headerPose;
  }
  if (player.firstTouchTimer > 0 && player.firstTouchType) {
    const controlPose = Math.sin((1 - player.firstTouchTimer / 0.38) * Math.PI);
    if (player.firstTouchType === "foot") {
      if (rightLeg) rightLeg.rotation.x = 0.46 * controlPose;
      if (rightKnee) rightKnee.rotation.x = 0.34 * controlPose;
      if (bodyRoot) bodyRoot.rotation.x -= 0.08 * controlPose;
    } else if (player.firstTouchType === "thigh") {
      if (rightLeg) rightLeg.rotation.x = 0.78 * controlPose;
      if (rightKnee) rightKnee.rotation.x = 0.92 * controlPose;
      if (bodyRoot) bodyRoot.rotation.x -= 0.14 * controlPose;
    } else {
      if (bodyRoot) {
        bodyRoot.rotation.x += 0.2 * controlPose;
        bodyRoot.position.z -= 0.08 * controlPose;
      }
      if (leftArm) leftArm.rotation.z = -0.34 * controlPose;
      if (rightArm) rightArm.rotation.z = 0.34 * controlPose;
    }
  }
  if (player.skillTimer > 0 && player.skillMove) {
    const movePose = Math.sin(player.skillTimer * 20);
    const side = player.skillSide || 1;
    if (player.skillMove === "shot-fake" || player.skillMove === "fake-pass") {
      if (rightLeg) rightLeg.rotation.x = Math.max(rightLeg.rotation.x, 0.62 + movePose * 0.28);
      if (leftLeg) leftLeg.rotation.x = -0.18;
      if (rightArm) rightArm.rotation.z = 0.28;
      if (leftArm) leftArm.rotation.z = -0.28;
    } else {
      if (leftLeg) leftLeg.rotation.z = side * 0.12 * Math.abs(movePose);
      if (rightLeg) rightLeg.rotation.z = -side * 0.12 * Math.abs(movePose);
      if (leftArm) leftArm.rotation.z = -0.16 - side * 0.08;
      if (rightArm) rightArm.rotation.z = 0.16 - side * 0.08;
    }
  }
  if (player.catchTimer > 0) {
    const catchPose = Math.sin((1 - player.catchTimer / 0.62) * Math.PI);
    if (leftArm) {
      leftArm.rotation.x = -1.12 - catchPose * 0.3;
      leftArm.rotation.z = -0.42;
    }
    if (rightArm) {
      rightArm.rotation.x = -1.12 - catchPose * 0.3;
      rightArm.rotation.z = 0.42;
    }
    if (leftElbow) leftElbow.rotation.x = -0.2;
    if (rightElbow) rightElbow.rotation.x = -0.2;
    if (bodyRoot) bodyRoot.rotation.x = -0.08;
  }
  if (player.diveTimer > 0) {
    const divePose = Math.sin((1 - player.diveTimer / 0.62) * Math.PI);
    const visualDiveSide = player.diveSide * (Math.sign(Math.cos(player.heading)) || 1);
    if (bodyRoot) {
      bodyRoot.position.x = visualDiveSide * 0.24 * divePose;
      bodyRoot.position.y = -0.11 * divePose;
      bodyRoot.rotation.z = -visualDiveSide * 0.7 * divePose;
      bodyRoot.rotation.x = -0.12 * divePose;
    }
    if (leftArm) {
      leftArm.rotation.x = -1.62;
      leftArm.rotation.z = -0.54 - visualDiveSide * 0.32;
    }
    if (rightArm) {
      rightArm.rotation.x = -1.62;
      rightArm.rotation.z = 0.54 - visualDiveSide * 0.32;
    }
    if (leftLeg) leftLeg.rotation.x = -0.42 * divePose;
    if (rightLeg) rightLeg.rotation.x = 0.3 * divePose;
  }
  if (player.blockTimer > 0) {
    const blockPose = Math.sin((1 - player.blockTimer / 0.48) * Math.PI);
    const keepRunLegs = player.forcedMoveTimer > 0 && speed > 0.85;
    if (bodyRoot) {
      bodyRoot.rotation.x -= 0.12 * blockPose;
      bodyRoot.rotation.z += (player.number % 2 === 0 ? 0.16 : -0.16) * blockPose;
    }
    if (!keepRunLegs) {
      if (rightLeg) rightLeg.rotation.x = 0.74 * blockPose;
      if (rightKnee) rightKnee.rotation.x = 0.42 * blockPose;
      if (leftLeg) leftLeg.rotation.x = -0.24 * blockPose;
    }
    if (leftArm) leftArm.rotation.x = -1.18 * blockPose;
    if (rightArm) rightArm.rotation.x = -1.24 * blockPose;
  }
  if (player.tackleTimer > 0) {
    const lunge = Math.sin((1 - player.tackleTimer / 0.58) * Math.PI);
    if (bodyRoot) {
      bodyRoot.position.y = -0.42 * lunge;
      bodyRoot.position.z = 0.22 * lunge;
      bodyRoot.rotation.x = -1.02 * lunge;
      bodyRoot.rotation.z += player.number % 2 === 0 ? 0.14 * lunge : -0.14 * lunge;
    }
    if (rightLeg) rightLeg.rotation.x = 1.28 * lunge;
    if (leftLeg) leftLeg.rotation.x = -0.35 * lunge;
    if (rightKnee) rightKnee.rotation.x = 0.08;
    if (leftKnee) leftKnee.rotation.x = 0.72 * lunge;
    if (leftArm) leftArm.rotation.x = -0.82 * lunge;
    if (rightArm) rightArm.rotation.x = 0.46 * lunge;
  }
}

function ensureAudio(active: MatchRuntime) {
  if (active.audio || typeof window === "undefined") return;
  const audioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  const AudioContextClass = audioWindow.AudioContext || audioWindow.webkitAudioContext;
  if (!AudioContextClass) return;
  active.audio = new AudioContextClass();
}

function playTone(active: MatchRuntime, frequency: number, duration: number, volume: number, type: OscillatorType = "sine") {
  if (!active.audio) return;
  const now = active.audio.currentTime;
  const oscillator = active.audio.createOscillator();
  const gain = active.audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain);
  gain.connect(active.audio.destination);
  trackRuntimeAudioSource(active, oscillator);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function playKickSound(active: MatchRuntime, volume = 0.35) {
  const now = performance.now();
  if (!active.audio || now - active.lastKickSound < 95) return;
  active.lastKickSound = now;
  const audio = active.audio;
  const start = audio.currentTime;
  const variation = 0.9 + Math.random() * 0.18;
  const gain = audio.createGain();
  const filter = audio.createBiquadFilter();
  const thump = audio.createOscillator();
  const noise = audio.createBufferSource();
  const samples = Math.floor(audio.sampleRate * 0.055);
  const buffer = audio.createBuffer(1, samples, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < samples; i += 1) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / samples, 2.4);
  }
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(165 * variation, start);
  filter.Q.setValueAtTime(0.95, start);
  thump.type = "triangle";
  thump.frequency.setValueAtTime(74 * variation, start);
  thump.frequency.exponentialRampToValueAtTime(42 * variation, start + 0.095);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(clamp(volume, 0.45, 1.75) * 0.68, start + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
  noise.buffer = buffer;
  noise.connect(filter);
  filter.connect(gain);
  thump.connect(gain);
  gain.connect(audio.destination);
  trackRuntimeAudioSource(active, noise);
  trackRuntimeAudioSource(active, thump);
  noise.start(start);
  thump.start(start);
  noise.stop(start + 0.09);
  thump.stop(start + 0.17);
}

function playGoalSound(active: MatchRuntime) {
  const now = performance.now();
  if (now - active.lastCheerSound < 900) return;
  active.lastCheerSound = now;
  playBallNetSound(active);
  scheduleRuntimeTimeout(active, () => playCrowdCheer(active), 180);
}

function playBallNetSound(active: MatchRuntime) {
  if (!active.audio) return;
  const audio = active.audio;
  const start = audio.currentTime;
  const snap = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();
  const samples = Math.floor(audio.sampleRate * 0.28);
  const buffer = audio.createBuffer(1, samples, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < samples; i += 1) {
    const t = i / samples;
    const twang = Math.sin(t * Math.PI * 42) * Math.pow(1 - t, 2.1);
    data[i] = ((Math.random() * 2 - 1) * 0.55 + twang * 0.45) * Math.pow(1 - t, 1.7);
  }
  filter.type = "highpass";
  filter.frequency.setValueAtTime(360, start);
  filter.Q.setValueAtTime(0.55, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.34, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
  snap.buffer = buffer;
  snap.connect(filter);
  filter.connect(gain);
  gain.connect(audio.destination);
  trackRuntimeAudioSource(active, snap);
  snap.start(start);
  snap.stop(start + 0.3);
}

function playCrowdCheer(active: MatchRuntime) {
  if (!active.audio) return;
  const audio = active.audio;
  const start = audio.currentTime;
  const cheer = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();
  const samples = Math.floor(audio.sampleRate * 2.4);
  const buffer = audio.createBuffer(1, samples, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < samples; i += 1) {
    const t = i / samples;
    const swell = Math.sin(Math.min(1, t * 2.4) * Math.PI * 0.5) * Math.pow(1 - t * 0.18, 1.25);
    const roar = (Math.random() * 2 - 1) * swell;
    const chant = Math.sin(t * Math.PI * 36) * 0.08 * swell;
    data[i] = roar * 0.58 + chant;
  }
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(760, start);
  filter.Q.setValueAtTime(0.72, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.22, start + 0.18);
  gain.gain.exponentialRampToValueAtTime(0.04, start + 2.4);
  cheer.buffer = buffer;
  cheer.connect(filter);
  filter.connect(gain);
  gain.connect(audio.destination);
  trackRuntimeAudioSource(active, cheer);
  cheer.start(start);
  cheer.stop(start + 2.45);
}

function playWhistleSequence(active: MatchRuntime, count: 2 | 3) {
  for (let i = 0; i < count; i += 1) {
    scheduleRuntimeTimeout(active, () => {
      playTone(active, 1760, 0.18, 0.09, "sine");
      scheduleRuntimeTimeout(active, () => playTone(active, 1320, 0.08, 0.035, "sine"), 32);
    }, i * 360);
  }
}

function cameraRelativeAxis(camera?: THREE.PerspectiveCamera) {
  if (!camera) {
    return {
      up: new THREE.Vector3(0, 0, -1),
      right: new THREE.Vector3(1, 0, 0),
    };
  }
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).setY(0);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0);
  if (up.lengthSq() < 0.01) up.set(0, 0, -1);
  if (right.lengthSq() < 0.01) right.set(1, 0, 0);
  return { up: up.normalize(), right: right.normalize() };
}

function playerInput(keys: Set<string>, _player: "p1", virtualControls?: VirtualControls, camera?: THREE.PerspectiveCamera): PlayerInputState {
  const dir = new THREE.Vector3();
  if (virtualControls && virtualControls.strength > 0.04) {
    const axis = cameraRelativeAxis(camera);
    const virtualDir = axis.right.multiplyScalar(virtualControls.dir.x).add(axis.up.multiplyScalar(-virtualControls.dir.z));
    return {
      dir: virtualDir.lengthSq() > 0 ? virtualDir.normalize() : virtualDir,
      sprint: virtualControls.sprint || keys.has("ShiftLeft"),
      speedScale: clamp(0.42 + virtualControls.strength * 0.58, 0.35, 1),
    };
  }
  const axis = cameraRelativeAxis(camera);
  if (keys.has("ArrowUp")) dir.add(axis.up);
  if (keys.has("ArrowDown")) dir.sub(axis.up);
  if (keys.has("ArrowLeft")) dir.sub(axis.right);
  if (keys.has("ArrowRight")) dir.add(axis.right);
  return { dir: dir.lengthSq() > 0 ? dir.normalize() : dir, sprint: keys.has("ShiftLeft"), speedScale: 1 };
}

function cloneInput(input: PlayerInputState): PlayerInputState {
  return {
    dir: input.dir.clone(),
    sprint: input.sprint,
    speedScale: input.speedScale,
  };
}

function cachedAiInput(player: PlayerBody, active: MatchRuntime, dt: number) {
  const owner = ballOwner(active);
  const distanceToBall = player.pos.distanceTo(active.ballPos);
  const urgent = active.phase !== "open"
    || active.intendedReceiverId === player.id
    || active.ballOwnerId === player.id
    || player.role === "keeper"
    || (owner?.team !== player.team && player.pos.distanceTo(owner?.pos ?? active.ballPos) < 7);
  player.aiInputTimer -= dt;
  if (urgent || player.aiInputTimer <= 0) {
    const next = aiInput(player, active);
    player.aiInputCache = cloneInput(next);
    const offBallInterval = distanceToBall > 42
      ? 0.42
      : distanceToBall > 26
        ? 0.3
        : 0.2;
    player.aiInputTimer = urgent ? 0.07 : offBallInterval + (player.number % 5) * 0.018;
  }
  return cloneInput(player.aiInputCache);
}

function aiInput(player: PlayerBody, active: MatchRuntime) {
  const attackingZ = attackingGoalZ(player.team, active.half);
  const ownZ = teamGoalZ(player.team, active.half);
  const target = player.home.clone();
  const attackSign = Math.sign(attackingZ);
  const owner = ballOwner(active);
  const teamHasBall = owner?.team === player.team;
  const opponentHasBall = owner?.team === opponent(player.team);
  const plannedCarrier = active.defensivePlan?.defendingTeam === player.team
    ? active.players.find((candidate) => candidate.id === active.defensivePlan?.carrierId) ?? null
    : null;
  const defensiveCarrier = opponentHasBall && owner
    ? owner
    : !owner && active.defensivePlanGraceTimer > 0
      ? plannedCarrier
      : null;
  const flatBall = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
  const distanceToBall = flatBall.distanceTo(player.pos);
  const userDribbleThreat = Boolean(defensiveCarrier?.controlledBy === "p1" && defensiveCarrier.team !== player.team);
  const midfieldPossessionThreat = Boolean(defensiveCarrier?.line === "midfielder");
  const stationaryCarrierThreat = Boolean(userDribbleThreat && defensiveCarrier && defensiveCarrier.vel.length() < 0.85 && defensiveCarrier.carryTimer > 0.42);
  const pressureRole = defensiveCarrier && player.role !== "keeper"
    ? defensivePressureRoleForPlayer(player, active, defensiveCarrier)
    : null;
  const loosePressureIds = !owner && !teamHasBall && !defensiveCarrier
    ? pressureFieldPlayers(active.players, player.team, active.ballPos, 1)
    : [];
  const loosePressureIndex = loosePressureIds.indexOf(player.id);
  const isPressing = pressureRole?.role === "press" || loosePressureIndex >= 0;
  const isCovering = pressureRole?.role === "cover";
  const pressureIndex = pressureRole ? Math.max(0, pressureRole.rank) : loosePressureIndex;
  const closestOpponent = nearestOpponentTo(player, active.players);
  const assignmentTarget = opponentHasBall && owner && player.role !== "keeper"
    ? defensiveAssignmentTarget(player, active)
    : null;
  const laneBlockTarget = opponentHasBall && owner && player.role !== "keeper"
    ? passLaneBlockTarget(player, active)
    : null;
  const wallTarget = opponentHasBall && owner && player.line === "defender"
    ? defensiveWallTarget(player, active, owner)
    : null;
  const committedReceiver = active.intendedReceiverId === player.id && active.ballState === "kicked";
  const committedCollector = !owner && active.ballState !== "possessed" && (committedReceiver || (isPressing && distanceToBall < 22));
  if (player.role !== "keeper" && committedCollector) {
    const reception = committedReceiver ? predictAerialReception(player, active) : null;
    const ballLead = new THREE.Vector3(active.ballVel.x, 0, active.ballVel.z).multiplyScalar(committedReceiver ? 0.14 : 0.1);
    const collectTarget = reception?.point.clone() ?? flatBall.clone().add(ballLead);
    collectTarget.x = clamp(collectTarget.x, -FIELD_W / 2 + 2.5, FIELD_W / 2 - 2.5);
    collectTarget.z = clamp(collectTarget.z, -FIELD_L / 2 + 2.5, FIELD_L / 2 - 2.5);
    const direct = collectTarget.sub(player.pos);
    const receptionDistance = direct.length();
    active.renderer.domElement.dataset.aerialReceiverId = committedReceiver ? player.id : "";
    active.renderer.domElement.dataset.aerialArrivalTime = reception?.arrivalTime.toFixed(3) ?? "";
    active.renderer.domElement.dataset.aerialTouchPlan = reception?.touchType ?? "ground";
    active.renderer.domElement.dataset.aerialLandingX = reception?.point.x.toFixed(3) ?? "";
    active.renderer.domElement.dataset.aerialLandingZ = reception?.point.z.toFixed(3) ?? "";
    active.renderer.domElement.dataset.aerialReceiverX = player.pos.x.toFixed(3);
    active.renderer.domElement.dataset.aerialReceiverZ = player.pos.z.toFixed(3);
    return {
      dir: direct.lengthSq() > 0.05 ? direct.normalize() : direct.set(0, 0, 0),
      sprint: receptionDistance > 3.2 || Boolean(reception && reception.arrivalTime < 1.1),
      speedScale: reception && reception.arrivalTime < 0.55 ? 0.78 : 1,
    };
  }
  if (player.role !== "keeper" && defensiveCarrier) {
    return defensiveTeamInput(player, active, defensiveCarrier);
  }
  if (player.role !== "keeper" && player.line === "defender") {
    const ballNearOwnBox = Math.abs(active.ballPos.z - ownZ) < 30;
    if (!owner && ballNearOwnBox && isPressing && distanceToBall < 10) {
      const directBall = flatBall.sub(player.pos);
      return { dir: directBall.lengthSq() > 0.05 ? directBall.normalize() : directBall.set(0, 0, 0), sprint: distanceToBall > 3.4, speedScale: 1 };
    }
    if (wallTarget && userDribbleThreat && owner) {
      const roleTarget = (isPressing || isCovering)
        ? defensiveJockeyTarget(player, active, owner, Math.max(0, pressureIndex))
        : wallTarget.clone();
      roleTarget.lerp(wallTarget, isPressing ? 0.42 : isCovering ? 0.72 : 0.92);
      const toWall = roleTarget.clone().sub(player.pos).setY(0);
      const carrierDistance = player.pos.distanceTo(owner.pos);
      const ballDistance = player.pos.distanceTo(controlledBallPoint(owner));
      if (isPressing && ballDistance < (stationaryCarrierThreat ? 4.35 : 3.35) && player.decisionCooldown <= 0 && shouldStepInToTackle(player, owner, active)) {
        setPlayerHeading(player, headingFromDirection(controlledBallPoint(owner).sub(player.pos).setY(0)), 1 / 60, 24);
        attemptTackle(player, active);
        player.decisionCooldown = stationaryCarrierThreat ? 0.18 : 0.32;
      }
      return {
        dir: toWall.lengthSq() > 0.05 ? toWall.normalize() : toWall.set(0, 0, 0),
        sprint: carrierDistance > 7.2,
        speedScale: carrierDistance < 5.5 ? 0.58 : stationaryCarrierThreat ? 0.86 : 0.78,
      };
    }
    if (opponentHasBall && owner && (isPressing || isCovering) && player.pos.distanceTo(owner.pos) < 8.5) {
      if (userDribbleThreat) {
        const blockTarget = defensiveJockeyTarget(player, active, owner, Math.max(0, pressureIndex));
        if (blockTarget.lengthSq() > 0.05) {
          const toBlock = blockTarget.sub(player.pos).setY(0);
          const carrierDistance = player.pos.distanceTo(owner.pos);
          if (isPressing && carrierDistance < (stationaryCarrierThreat ? 4.2 : 3.35) && player.decisionCooldown <= 0 && shouldStepInToTackle(player, owner, active)) {
            setPlayerHeading(player, headingFromDirection(controlledBallPoint(owner).sub(player.pos).setY(0)), 1 / 60, 24);
            attemptTackle(player, active);
            player.decisionCooldown = stationaryCarrierThreat ? 0.18 : 0.32;
          }
          return { dir: toBlock.lengthSq() > 0.05 ? toBlock.normalize() : toBlock.set(0, 0, 0), sprint: carrierDistance > 7.2, speedScale: carrierDistance < 5.5 ? 0.58 : stationaryCarrierThreat ? 0.86 : 0.78 };
        }
      }
      const toCarrier = owner.pos.clone().sub(player.pos).setY(0);
      if (toCarrier.lengthSq() > 0.25) {
        const carrierDistance = toCarrier.length();
        const tackleRange = stationaryCarrierThreat ? 4.2 : userDribbleThreat ? 3.28 : 3.05;
        if (isPressing && carrierDistance < tackleRange && player.decisionCooldown <= 0 && shouldStepInToTackle(player, owner, active)) {
          setPlayerHeading(player, headingFromDirection(toCarrier), 1 / 60, 24);
          attemptTackle(player, active);
          player.decisionCooldown = 0.34;
        }
        const jockeyTarget = defensiveJockeyTarget(player, active, owner, Math.max(0, pressureIndex));
        const toJockey = jockeyTarget.sub(player.pos).setY(0);
        return { dir: toJockey.lengthSq() > 0.05 ? toJockey.normalize() : toCarrier.normalize(), sprint: carrierDistance > 8, speedScale: carrierDistance < 5.5 ? 0.62 : 0.82 };
      }
    }
    const markTarget = opponentHasBall ? dangerousMarkTarget(player, active) : null;
    if (markTarget && !isPressing) {
      target.lerp(markTarget, 0.72);
    }
    if (assignmentTarget && !isPressing) {
      target.lerp(assignmentTarget, 0.58);
    }
    if (laneBlockTarget && !isPressing) {
      target.lerp(laneBlockTarget, 0.5);
    }
    if (wallTarget) {
      target.lerp(wallTarget, userDribbleThreat ? 0.9 : 0.68);
    }
  }

  if (player.role === "keeper") {
    const distanceFromGoal = Math.abs(active.ballPos.z - ownZ);
    const intoField = -Math.sign(ownZ) || 1;
    const ballProgressFromGoal = clamp((active.ballPos.z - ownZ) * intoField, 0, FIELD_L);
    const opponentShooter = owner?.team !== player.team ? owner : null;
    const ballThreat = distanceFromGoal < 54 && Math.abs(active.ballPos.x) < GOAL_W / 2 + 23;
    const dangerZone = distanceFromGoal < 28 && Math.abs(active.ballPos.x) < GOAL_W / 2 + 17;
    const wideAngleThreat = Boolean(
      opponentShooter
      && distanceFromGoal < 32
      && Math.abs(opponentShooter.pos.x) > GOAL_W * 0.9,
    );
    const baseDepth = dangerZone
      ? clamp(4.7 + clamp(24 - distanceFromGoal, 0, 24) * 0.12, 4.4, 7.6)
      : ballThreat
        ? clamp(6.3 + clamp(42 - distanceFromGoal, 0, 42) * 0.075, 5.8, 9.8)
        : clamp(8.2 + ballProgressFromGoal * 0.045, 8.2, 13.5);
    let predictedThreatX = active.ballPos.x;
    if (opponentShooter && distanceFromGoal < 43) {
      const shotFacing = facingDirection(opponentShooter);
      const goalLineZ = ownZ + Math.sign(ownZ) * GOAL_DEPTH;
      const timeToGoalLine = Math.abs((goalLineZ - opponentShooter.pos.z) / (shotFacing.z || Math.sign(ownZ - opponentShooter.pos.z) * 0.12));
      const facingProjectedX = opponentShooter.pos.x + shotFacing.x * clamp(timeToGoalLine, 0, 34);
      const angleCoverX = opponentShooter.pos.x * 0.34;
      predictedThreatX = clamp(facingProjectedX * 0.55 + angleCoverX * 0.45, -GOAL_W / 2 + 0.68, GOAL_W / 2 - 0.68);
    }
    if (wideAngleThreat) {
      const nearPostX = clamp(active.ballPos.x, -GOAL_W / 2 + 0.7, GOAL_W / 2 - 0.7);
      predictedThreatX = THREE.MathUtils.lerp(predictedThreatX, nearPostX, 0.76);
    }
    target.set(
      clamp(predictedThreatX * (wideAngleThreat ? 0.94 : dangerZone ? 0.86 : ballThreat ? 0.68 : 0.28), -GOAL_W / 2 + 0.8, GOAL_W / 2 - 0.8),
      0,
      ownZ + intoField * (opponentShooter && distanceFromGoal < 36 ? clamp(baseDepth + 0.9, 5.2, 9.8) : baseDepth),
    );
    const flatBallForKeeper = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
    const keeperDistance = player.pos.distanceTo(flatBallForKeeper);
    const keeperIsClosest = active.players
      .filter((item) => item.id !== player.id && !item.sentOff)
      .every((item) => item.pos.distanceTo(flatBallForKeeper) > keeperDistance + (item.team === player.team ? -0.5 : 0.25));
    const canIntercept = !active.ballOwnerId
      && active.ballPos.y < 2.95
      && distanceFromGoal < 52
      && Math.abs(active.ballPos.x) < GOAL_W / 2 + 20.5
      && (keeperIsClosest || keeperDistance < 17.4);
    if (canIntercept) {
      target.x = clamp(active.ballPos.x, -GOAL_W / 2 + 0.7, GOAL_W / 2 - 0.7);
      const nearClaimZ = ownZ + intoField * 3.2;
      const deepClaimZ = ownZ + intoField * 24;
      target.z = clamp(active.ballPos.z, Math.min(nearClaimZ, deepClaimZ), Math.max(nearClaimZ, deepClaimZ));
    }
  } else if (teamHasBall) {
    const influence = formationBallInfluence(player, "attack");
    const ballLane = clamp(active.ballPos.x, -FIELD_W / 2 + 6, FIELD_W / 2 - 6);
    const weakSide = Math.sign(player.home.x || (player.number % 2 === 0 ? 1 : -1));
    target.lerp(flatBall, owner?.id !== player.id ? influence * 0.24 : influence * 0.72);
    const buildupProgress = clamp((active.ballPos.z - ownZ) * attackSign, 0, FIELD_L);
    const wholeTeamStep = clamp(6 + buildupProgress * 0.28, 6, 30);
    target.z += attackSign * (player.line === "forward" ? 18 : player.line === "midfielder" ? 12 : wholeTeamStep * 0.42);
    target.x += weakSide * (player.line === "forward" ? 7.6 : player.line === "midfielder" ? 4.5 : 2.2);
    if (owner?.id !== player.id) {
      const passAngle = player.number % 3 - 1;
      const supportDistance = player.line === "forward" ? 22 : player.line === "midfielder" ? 14 : 9;
      const minSeparation = player.line === "forward" ? 11 : player.line === "midfielder" ? 8 : 6;
      target.x = target.x * 0.4 + (ballLane + weakSide * (minSeparation + Math.abs(passAngle) * 3.6)) * 0.6;
      target.z = target.z * 0.35 + (active.ballPos.z + attackSign * supportDistance) * 0.65;
      if (player.line === "forward") {
        const runBehind = clamp(active.ballPos.z + attackSign * (24 + (player.number % 3) * 5), -FIELD_L / 2 + 8, FIELD_L / 2 - 8);
        target.z = Math.abs(runBehind - attackingZ) < Math.abs(target.z - attackingZ) ? runBehind : target.z;
        target.x += weakSide * 5.4;
      }
      if (player.line === "midfielder") {
        const wideMidfielder = ["LM", "RM", "LWB", "RWB", "LAM", "RAM"].includes(player.formationSlot);
        const holdingMidfielder = ["LDM", "RDM"].includes(player.formationSlot);
        const slotSide = player.formationSlot.startsWith("L") ? -1 : player.formationSlot.startsWith("R") ? 1 : weakSide;
        if (wideMidfielder) {
          target.x = clamp(slotSide * (FIELD_W / 2 - 13), -FIELD_W / 2 + 7, FIELD_W / 2 - 7);
          target.z = clamp((owner?.pos.z ?? active.ballPos.z) + attackSign * 4.5, -FIELD_L / 2 + 8, FIELD_L / 2 - 8);
        } else if (holdingMidfielder) {
          target.x = slotSide * 9;
          target.z = clamp((owner?.pos.z ?? active.ballPos.z) - attackSign * 10, -FIELD_L / 2 + 8, FIELD_L / 2 - 8);
        } else {
          const stagger = player.number % 2 === 0 ? 7.5 : -5.5;
          target.x = clamp((owner?.pos.x ?? active.ballPos.x) + slotSide * 14, -FIELD_W / 2 + 7, FIELD_W / 2 - 7);
          target.z = clamp((owner?.pos.z ?? active.ballPos.z) + attackSign * stagger, -FIELD_L / 2 + 8, FIELD_L / 2 - 8);
        }
      }
      const ownerDistance = target.distanceTo(owner?.pos ?? flatBall);
      if (ownerDistance < minSeparation) {
        const away = target.clone().sub(owner?.pos ?? flatBall).setY(0);
        if (away.lengthSq() < 0.1) away.set(weakSide, 0, attackSign * 0.35);
        target.add(away.normalize().multiplyScalar(minSeparation - ownerDistance + 2.5));
      }
    }
    if (player.line === "defender") {
      const ballCarrier = owner ?? player;
      const fullback = ["LB", "RB", "LWB", "RWB"].includes(player.formationSlot);
      const leftSlot = player.formationSlot.startsWith("L");
      const slotSide = leftSlot ? -1 : 1;
      if (fullback) {
        const supportDepth = ballCarrier.line === "defender" ? 9 : ballCarrier.line === "midfielder" ? -5 : -16;
        target.x = slotSide * (FIELD_W / 2 - 13);
        target.z = clamp(ballCarrier.pos.z + attackSign * supportDepth, -FIELD_L / 2 + 10, FIELD_L / 2 - 10);
      } else {
        const steppingCenterBack = player.number % 2 === 0 && ballCarrier.line !== "defender";
        const restDepth = steppingCenterBack ? 14 : 21;
        target.x = slotSide * (steppingCenterBack ? 10 : 15);
        target.z = clamp(ballCarrier.pos.z - attackSign * restDepth, -FIELD_L / 2 + 9, FIELD_L / 2 - 9);
      }
    }
  } else if (isPressing && (opponentHasBall || distanceToBall < 18)) {
    target.copy(owner && owner.team !== player.team ? defensiveJockeyTarget(player, active, owner, pressureIndex) : pressingTarget(player, active));
    if (owner && owner.team !== player.team) {
      if (userDribbleThreat) {
        target.copy(defensiveJockeyTarget(player, active, owner, pressureIndex));
      } else {
        target.lerp(pressingTarget(player, active), 0.34);
      }
      const tackleRange = stationaryCarrierThreat ? 4.2 : userDribbleThreat ? 3.28 : 3.05;
      if (player.pos.distanceTo(owner.pos) < tackleRange && player.decisionCooldown <= 0 && shouldStepInToTackle(player, owner, active)) {
        setPlayerHeading(player, headingFromDirection(owner.pos.clone().sub(player.pos).setY(0)), 1 / 60, 20);
        attemptTackle(player, active);
        player.decisionCooldown = stationaryCarrierThreat ? 0.22 : 0.42;
      }
    }
  } else if (player.line === "defender" && opponentHasBall && Math.abs(active.ballPos.z - ownZ) < 34) {
    const blockPoint = defensiveCoverTarget(player, active);
    target.lerp(blockPoint, formationBallInfluence(player, "defense") + 0.24);
    const markTarget = dangerousMarkTarget(player, active);
    if (markTarget) target.lerp(markTarget, 0.56);
    if (closestOpponent && Math.abs(closestOpponent.pos.z - ownZ) < 38) {
      const frontMark = closestOpponent.pos.clone();
      const goalSide = new THREE.Vector3(0, 0, ownZ).sub(frontMark).setY(0);
      if (goalSide.lengthSq() > 0.05) frontMark.add(goalSide.normalize().multiplyScalar(2.6));
      target.lerp(frontMark, 0.42);
    }
    if (owner && owner.team !== player.team && Math.abs(attackingGoalZ(owner.team, active.half) - owner.pos.z) < 52) {
      const shootingLane = owner.pos.clone().lerp(new THREE.Vector3(0, 0, teamGoalZ(player.team, active.half)), 0.32);
      target.lerp(shootingLane, 0.36);
    }
  } else {
    const phase = opponentHasBall ? "defense" : "neutral";
    const influence = formationBallInfluence(player, phase);
    const coverTarget = opponentHasBall
      ? defensiveCoverTarget(player, active)
      : isPressing
        ? flatBall
        : player.home;
    target.lerp(coverTarget, opponentHasBall ? influence : isPressing ? 0.64 : 0.06);
    if (player.line === "defender" && opponentHasBall) {
      const carrier = owner ?? null;
      const reference = carrier?.pos ?? active.ballPos;
      const distanceFromOwnGoal = Math.abs(reference.z - ownZ);
      const carrierTowardGoal = carrier
        ? carrier.vel.clone().setY(0).dot(new THREE.Vector3(0, 0, ownZ).sub(carrier.pos).setY(0).normalize()) > 0.18
        : false;
      const safeDepth = clamp(
        distanceFromOwnGoal < 58
          ? 8.5 + distanceFromOwnGoal * 0.24
          : 22 + (distanceFromOwnGoal - 58) * 0.13,
        7.5,
        carrierTowardGoal ? 29 : 36,
      );
      const protectedLine = ownZ + attackSign * safeDepth;
      target.z = target.z * 0.52 + protectedLine * 0.48;
      const markTarget = dangerousMarkTarget(player, active);
      if (markTarget) target.lerp(markTarget, 0.5);
    }
    if (!opponentHasBall && !active.ballOwnerId && isPressing && distanceToBall < (player.line === "forward" ? 20 : 16)) {
      target.lerp(flatBall, 0.34);
    }
    if (opponentHasBall && closestOpponent && player.line !== "forward") {
      const frontMark = closestOpponent.pos.clone();
      const goalSide = new THREE.Vector3(0, 0, ownZ).sub(frontMark).setY(0);
      if (goalSide.lengthSq() > 0.05) frontMark.add(goalSide.normalize().multiplyScalar(player.line === "defender" ? 2.8 : 2.1));
      frontMark.x += Math.sign(player.home.x || 1) * (player.line === "midfielder" ? 1.2 : 0.5);
      target.lerp(frontMark, player.line === "midfielder" ? 0.28 : 0.18);
    }
    if (assignmentTarget && !isPressing) {
      target.lerp(assignmentTarget, player.line === "midfielder" ? 0.72 : player.line === "forward" ? 0.62 : 0.5);
    }
    if (laneBlockTarget && !isPressing) {
      target.lerp(laneBlockTarget, player.line === "midfielder" ? 0.72 : player.line === "forward" ? 0.6 : 0.5);
    }
    if (opponentHasBall && player.line === "forward") {
      const ownerNow = ballOwner(active);
      const laneSide = Math.sign(player.home.x || player.pos.x || 1);
      const midfieldControl = ownerNow?.line === "midfielder" || Math.abs(active.ballPos.z) < FIELD_L * 0.22;
      const passingLane = (ownerNow?.pos ?? flatBall).clone().add(new THREE.Vector3(laneSide * (midfieldControl ? 5.2 : 7.5), 0, -attackSign * (midfieldControl ? 15 : 9)));
      const laneBlock = passingLane.lerp(defensiveCoverTarget(player, active), midfieldControl ? 0.42 : 0.22);
      target.lerp(laneBlock, midfieldControl ? 0.72 : distanceToBall < 34 ? 0.5 : 0.3);
    }
  }
  if (opponentHasBall && owner && player.role !== "keeper") {
    const ownGoal = new THREE.Vector3(0, 0, ownZ);
    const laneSide = Math.sign(player.home.x || player.pos.x || (player.number % 2 === 0 ? 1 : -1));
    const carrierLane = owner.pos.clone().lerp(ownGoal, userDribbleThreat ? player.line === "defender" ? 0.54 : player.line === "midfielder" ? 0.42 : 0.24 : player.line === "defender" ? 0.46 : player.line === "midfielder" ? 0.34 : 0.2);
    carrierLane.x += laneSide * (player.line === "forward" ? 8.5 : player.line === "midfielder" ? 5.2 : userDribbleThreat ? 1.4 : 2.8);
    if (!isPressing) {
      target.lerp(carrierLane, userDribbleThreat ? player.line === "defender" ? 0.68 : player.line === "midfielder" ? 0.62 : 0.46 : player.line === "defender" ? 0.48 : player.line === "midfielder" ? 0.56 : 0.42);
    }
    if (player.line === "midfielder") {
      target.lerp(defensiveCoverTarget(player, active), midfieldPossessionThreat ? 0.58 : 0.44);
      if (Math.abs(owner.pos.z - ownZ) < 58) target.z = clamp(target.z - attackSign * (midfieldPossessionThreat ? 7.2 : 4.5), -FIELD_L / 2 + 6, FIELD_L / 2 - 6);
      if (Math.abs(owner.pos.z - ownZ) < 46) target.z = clamp(target.z - attackSign * 5.2, -FIELD_L / 2 + 6, FIELD_L / 2 - 6);
      if (assignmentTarget) target.lerp(assignmentTarget, midfieldPossessionThreat ? 0.82 : 0.7);
    }
    if (player.line === "forward") {
      const screenLane = owner.pos.clone().add(new THREE.Vector3(laneSide * (midfieldPossessionThreat ? 6.2 : 9.5), 0, -attackSign * (midfieldPossessionThreat ? 15 : 11)));
      target.lerp(screenLane, midfieldPossessionThreat ? 0.52 : 0.34);
      if (assignmentTarget) target.lerp(assignmentTarget, midfieldPossessionThreat ? 0.74 : 0.58);
    }
    if (player.line === "defender") {
      const danger = dangerousMarkTarget(player, active);
      if (danger) {
        const goalSideOfRunner = danger.clone().lerp(ownGoal, 0.22);
        target.lerp(goalSideOfRunner, 0.5);
      }
      if (userDribbleThreat) {
        const blockPath = owner.pos.clone().lerp(ownGoal, 0.34);
        blockPath.x = clamp(blockPath.x + laneSide * 1.2, -FIELD_W / 2 + 3, FIELD_W / 2 - 3);
        target.lerp(blockPath, 0.56);
      }
      if (wallTarget) target.lerp(wallTarget, userDribbleThreat ? 0.96 : 0.74);
      if (assignmentTarget && !isPressing) target.lerp(assignmentTarget, 0.54);
    }
  }
  if (distanceToBall < 10 && !teamHasBall && !player.controlledBy && player.role !== "keeper" && (isPressing || committedCollector)) {
    target.lerp(flatBall, isPressing ? 0.56 : 0.28);
  }
  keepNonPressurePlayersOutOfDogpile(player, target, owner, isPressing ? "press" : isCovering ? "cover" : "shape", active);
  const manualCarrier = teamHasBall && owner?.controlledBy === "p1" && !active.p1Autopilot && owner.id !== player.id && player.role !== "keeper";
  if (manualCarrier && owner) {
    const laneSide = Math.sign(player.home.x || player.pos.x || (player.number % 2 === 0 ? 1 : -1));
    const ownerFlat = owner.pos.clone().setY(0);
    const wideLane = clamp(ownerFlat.x + laneSide * (player.line === "forward" ? 19 : player.line === "midfielder" ? 14 : 10), -FIELD_W / 2 + 6, FIELD_W / 2 - 6);
    const supportTarget = new THREE.Vector3();
    if (player.line === "defender") {
      supportTarget.set(
        clamp(player.home.x * 0.86 + laneSide * 2.5, -FIELD_W / 2 + 7, FIELD_W / 2 - 7),
        0,
        clamp(ownerFlat.z - attackSign * 18, -FIELD_L / 2 + 8, FIELD_L / 2 - 8),
      );
    } else if (player.line === "midfielder") {
      supportTarget.set(
        wideLane,
        0,
        clamp(ownerFlat.z + attackSign * ((player.number % 2 === 0) ? 6 : -7), -FIELD_L / 2 + 8, FIELD_L / 2 - 8),
      );
    } else {
      supportTarget.set(
        wideLane,
        0,
        clamp(ownerFlat.z + attackSign * (16 + (player.number % 3) * 3.5), -FIELD_L / 2 + 8, FIELD_L / 2 - 8),
      );
    }
    if (supportTarget.distanceTo(ownerFlat) < 10) {
      const away = supportTarget.clone().sub(ownerFlat).setY(0);
      if (away.lengthSq() < 0.05) away.set(laneSide, 0, attackSign * 0.4);
      supportTarget.add(away.normalize().multiplyScalar(10 - supportTarget.distanceTo(ownerFlat)));
    }
    const dribblePath = ownerFlat.clone().add(facingDirection(owner).multiplyScalar(9.5));
    if (supportTarget.distanceTo(dribblePath) < 8.5 && active.intendedReceiverId !== player.id) {
      const pathAway = supportTarget.clone().sub(dribblePath).setY(0);
      if (pathAway.lengthSq() < 0.05) pathAway.set(laneSide, 0, player.line === "forward" ? attackSign * 0.25 : -attackSign * 0.35);
      supportTarget.add(pathAway.normalize().multiplyScalar(8.5 - supportTarget.distanceTo(dribblePath) + 2.5));
    }
    target.lerp(supportTarget, 0.86);
  }
  addOrganicVariation(player, target, active);
  addFormationMotion(player, target, active, teamHasBall, opponentHasBall, isPressing);
  addPossessionSpacing(player, target, active, teamHasBall);
  if (player.fallbackTimer > 0 && player.role !== "keeper" && owner?.id !== player.id) target.lerp(player.fallbackTarget, 0.82);
  keepFormationRoam(player, target, isPressing, teamHasBall, opponentHasBall);
  steerAroundPlayers(player, active.players, target);

  if (owner?.id === player.id) {
    if (active.cooldown > 0.05) {
      const dir = target.sub(player.pos);
      return { dir: dir.lengthSq() > 0.1 ? dir.normalize() : dir.set(0, 0, 0), sprint: false };
    }
    if (player.skillTimer > 0 && player.skillMove) {
      return { dir: aiSkillDirection(player, active), sprint: player.skillMove === "dribble-burst", speedScale: player.skillMove === "quick-turn" ? 0.72 : 1 };
    }
    const goalDistance = Math.abs(attackingZ - player.pos.z);
    const pressureCount = opponentPressure(player, active.players, player.role === "keeper" ? 7 : 5.4);
    const pressured = pressureCount > 0;
    const keeperHoldTime = pressureCount > 0 ? 0.86 : 1.25;
    if (player.role === "keeper" && player.carryTimer > keeperHoldTime && player.decisionCooldown <= 0) {
      const acted = clearBall(player, active);
      player.decisionCooldown = acted ? 0.95 : 0.25;
      if (acted) return { dir: new THREE.Vector3(), sprint: false };
    }
    const blockers = opponentsBetween(player, new THREE.Vector3(0, 0, attackingZ), active.players, 7.5);
    const shortTarget = player.role === "keeper" ? null : choosePassTarget(player, active, "short");
    const forwardTarget = player.role === "keeper" || player.line === "defender" || pressured || goalDistance > 38
      ? null
      : choosePassTarget(player, active, "through");
    const forwardIsSafe = Boolean(forwardTarget
      && passIsUseful(player, forwardTarget, active, "through")
      && nearestOpponentDistance(forwardTarget, active.players) > 6.2
      && blockers <= 1
      && (forwardTarget.pos.z - player.pos.z) * attackSign > 5);
    const passStyle = player.role === "keeper"
      ? (pressureCount > 1 ? "long" : "short")
      : forwardIsSafe ? "through" : "short";
    const passTarget = player.role === "keeper"
      ? choosePassTarget(player, active, passStyle)
      : forwardIsSafe ? forwardTarget : shortTarget ?? forwardTarget;
    const openReceiver = passTarget ? nearestOpponentDistance(passTarget, active.players) : 0;
    const usefulPass = Boolean(passTarget && passIsUseful(player, passTarget, active, passStyle));
    const hasControlledTouch = player.carryTimer > (player.role === "keeper" ? 0.85 : pressured ? 0.5 : 0.72);
    const passOpportunity = Boolean(passTarget && usefulPass && hasControlledTouch && (pressured || openReceiver > 4.6 || player.carryTimer > 1.05));
    const rearPressure = player.role === "keeper" ? 0 : rearPressureCount(player, active.players, 4.8);
    const furthestForward = active.players
      .filter((item) => item.team === player.team && item.role !== "keeper" && !item.sentOff)
      .every((item) => item.id === player.id || (item.pos.z - player.pos.z) * attackSign <= 1.2);
    const fullPowerShootingChance = player.role !== "keeper"
      && furthestForward
      && goalDistance < 25
      && Math.abs(player.pos.x) < GOAL_W * 2.8
      && blockers <= (goalDistance < 17 ? 5 : 2);
    const closeShootingChance = player.role !== "keeper"
      && goalDistance < 29
      && Math.abs(player.pos.x) < GOAL_W * 2.6
      && opponentPressure(player, active.players, 4.8) < 6;
    const shootingLane = player.role !== "keeper"
      && goalDistance < 34
      && Math.abs(player.pos.x) < GOAL_W * 2.35
      && blockers <= (goalDistance < 24 ? 3 : 2)
      && opponentPressure(player, active.players, 4.4) < 5;
    const opponentKeeper = active.players.find((item) => item.team === opponent(player.team) && item.role === "keeper");
    const keeperPoorPosition = Boolean(opponentKeeper && Math.abs(opponentKeeper.pos.x - player.pos.x * 0.18) > 2.7);
    const midRangeShot = player.role !== "keeper"
      && goalDistance >= 24
      && goalDistance < 34
      && Math.abs(player.pos.x) < GOAL_W * 2.45
      && blockers <= 1
      && opponentPressure(player, active.players, 5.4) < 3
      && (keeperPoorPosition || nearestOpponentDistance(player, active.players) > 8.6 || (player.line === "forward" && goalDistance < 29));
    const closeForwardThreat = player.role !== "keeper"
      && (player.line === "forward" || furthestForward)
      && goalDistance < 28
      && Math.abs(player.pos.x) < GOAL_W * 3.05;
    const closeShotLane = closeForwardThreat
      && blockers <= (goalDistance < 17 ? 3 : 2)
      && opponentPressure(player, active.players, 3.8) < 4;
    const strikerCarryLane = player.role !== "keeper"
      && player.line === "forward"
      && goalDistance < 44
      && goalDistance > 10
      && blockers <= 2
      && opponentPressure(player, active.players, 5.2) < 4
      && canDribbleIntoSpace(player, active);
    const strikerOneVsOne = strikerCarryLane
      && nearestOpponentDistance(player, active.players) > 3.2
      && nearestOpponentDistance(player, active.players) < 8.4;
    const poorWideShot = player.role !== "keeper" && poorWideShotAngle(player, goalDistance, blockers);
    const wideCrossTarget = poorWideShot ? chooseWideCrossTarget(player, active) : null;
    const cutbackTarget = poorWideShot ? chooseCutbackTarget(player, active) : null;
    if (player.decisionCooldown <= 0) {
      let acted = false;
      const ownGoalDistance = Math.abs(teamGoalZ(player.team, active.half) - player.pos.z);
      if (player.line === "defender" && pressured && ownGoalDistance < 24) {
        const safeOutlet = choosePassTarget(player, active, "short");
        const hasSafeOutlet = Boolean(safeOutlet && passIsUseful(player, safeOutlet, active, "short") && nearestOpponentDistance(safeOutlet, active.players) > 3.2);
        acted = hasSafeOutlet && pressureCount < 3
          ? performPass(player, active, "short")
          : pressureCount >= 2 && ownGoalDistance < 18
            ? clearBall(player, active)
            : false;
      }
      if (!acted && rearPressure > 0 && player.carryTimer > 0.24 && goalDistance > 14 && !closeShotLane && !fullPowerShootingChance) {
        active.tackleLockTimer = Math.max(active.tackleLockTimer, 0.34);
        player.decisionCooldown = 0.2;
        return { dir: shieldPressureDirection(player, active), sprint: false, speedScale: 0.72 };
      }
      if (!acted && player.role !== "keeper" && goalDistance > 42 && player.carryTimer > 0.44) {
        acted = passOpportunity && (pressured || openReceiver > 6.4 || !canDribbleIntoSpace(player, active))
          ? performPassTo(player, active, passTarget!, passStyle === "through" ? "through" : "short")
          : pressured
            ? performBackPass(player, active)
            : false;
        if (!acted && canDribbleIntoSpace(player, active)) {
          player.decisionCooldown = 0.34;
          return { dir: dribbleSpaceDirection(player, active), sprint: true, speedScale: 0.96 };
        }
      }
      if (!acted && goalDistance > 34 && player.carryTimer > 0.44) {
        acted = passOpportunity && (pressured || openReceiver > 5.8 || blockers >= 2)
          ? performPassTo(player, active, passTarget!, passStyle === "through" ? "through" : "short")
          : pressured && blockers >= 2
            ? performBackPass(player, active)
            : false;
      }
      if (!acted && poorWideShot && player.carryTimer > 0.28) {
        if (wideCrossTarget) {
          acted = performWideCross(player, wideCrossTarget, active);
          if (acted) {
            active.renderer.domElement.dataset.wideCrosses = String(Number(active.renderer.domElement.dataset.wideCrosses ?? "0") + 1);
          }
        }
        if (!acted && cutbackTarget) {
          acted = performPassTo(player, active, cutbackTarget, "short");
          if (acted) {
            active.renderer.domElement.dataset.wideCutbacks = String(Number(active.renderer.domElement.dataset.wideCutbacks ?? "0") + 1);
          }
        }
        if (!acted && shortTarget && shortTarget.pos.distanceTo(player.pos) < 38) {
          acted = performPassTo(player, active, shortTarget, "short");
          if (acted) {
            active.renderer.domElement.dataset.wideRecycles = String(Number(active.renderer.domElement.dataset.wideRecycles ?? "0") + 1);
          }
        }
        if (!acted && canDribbleIntoSpace(player, active)) {
          player.decisionCooldown = 0.26;
          return { dir: cutInsideDirection(player, active), sprint: true, speedScale: 0.98 };
        }
        if (!acted) {
          player.decisionCooldown = 0.24;
          return { dir: new THREE.Vector3(0, 0, 0), sprint: false, speedScale: 0.72 };
        }
      }
      if (!acted && !poorWideShot && closeShotLane && player.carryTimer > 0.22) {
        acted = shoot(player, active, chooseAiShotStyle(player, active, goalDistance, blockers), goalDistance < 18 ? 2.5 : 2.18);
      }
      if (!acted && !poorWideShot && fullPowerShootingChance && player.carryTimer > 0.22) {
        acted = shoot(player, active, "shot", goalDistance < 22 ? 2.38 : 2.05);
      }
      if (!acted && (strikerCarryLane || strikerOneVsOne) && player.carryTimer > 0.3) {
        if (strikerOneVsOne && nearestOpponentDistance(player, active.players) < 7.6) {
          acted = beginAiSkillMove(player, active, goalDistance, true, Math.max(blockers, 1));
          if (acted) return { dir: aiSkillDirection(player, active), sprint: true, speedScale: 1.06 };
        }
        player.decisionCooldown = 0.22;
        const goalCarry = new THREE.Vector3(clamp(-player.pos.x * 0.03, -0.45, 0.45), 0, attackSign).normalize();
        return { dir: goalCarry, sprint: true, speedScale: 1.04 };
      }
      if (!acted && closeForwardThreat && blockers >= 3 && player.carryTimer > 0.36) {
        acted = beginAiSkillMove(player, active, goalDistance, pressured || blockers >= 3, blockers);
        if (acted) return { dir: aiSkillDirection(player, active), sprint: true, speedScale: 0.96 };
        acted = performBackPass(player, active);
        if (!acted) {
          player.decisionCooldown = 0.28;
          return { dir: escapePressureDirection(player, active), sprint: true, speedScale: 0.94 };
        }
      }
      if (!acted && passOpportunity && blockers > 3) {
        acted = performPass(player, active, passStyle);
      }
      if (!acted && player.line === "forward" && blockers >= 3 && goalDistance < 42 && player.carryTimer > 0.46) {
        acted = performBackPass(player, active) || performPass(player, active, "short");
        if (!acted) {
          player.decisionCooldown = 0.3;
          return { dir: escapePressureDirection(player, active), sprint: true, speedScale: 0.92 };
        }
      }
      if (!acted && (pressured || blockers >= 2) && goalDistance < 34 && player.carryTimer > 0.36) {
        acted = beginAiSkillMove(player, active, goalDistance, pressured, blockers);
        if (acted) return { dir: aiSkillDirection(player, active), sprint: true, speedScale: 0.92 };
      }
      if (!acted && player.line === "forward" && goalDistance < 38 && player.carryTimer > 0.4 && nearestOpponentDistance(player, active.players) < 7.4 && canDribbleIntoSpace(player, active)) {
        acted = beginAiSkillMove(player, active, goalDistance, true, Math.max(blockers, 1));
        if (acted) return { dir: aiSkillDirection(player, active), sprint: true, speedScale: 1.04 };
      }
      if (!acted && !poorWideShot && midRangeShot && player.carryTimer > 0.52) {
        acted = shoot(player, active, "shot", keeperPoorPosition ? 2.08 : 1.86);
      }
      if (!acted && !poorWideShot && (shootingLane || closeShootingChance) && player.carryTimer > (goalDistance < 22 ? 0.38 : 0.58)) {
        acted = shoot(player, active, chooseAiShotStyle(player, active, goalDistance, blockers), goalDistance > 30 ? 1.72 : 1.42);
      }
      const safeToCarry = canDribbleIntoSpace(player, active);
      if (!acted && passOpportunity && (pressured || blockers >= 2 || openReceiver > 5.6 || !safeToCarry)) {
        acted = performPass(player, active, passStyle);
      }
      if (!acted && player.carryTimer > 0.48 && safeToCarry) {
        player.decisionCooldown = 0.32;
        return { dir: dribbleSpaceDirection(player, active), sprint: goalDistance > 18 };
      }
      if (!acted && passOpportunity && player.carryTimer > 1.6 && !safeToCarry) {
        acted = performPass(player, active, passStyle);
      }
      player.decisionCooldown = acted ? 0.72 + (player.number % 4) * 0.08 : 0.28;
    }
  } else if (opponentHasBall && owner && isPressing && distanceToBall < (stationaryCarrierThreat ? 3.8 : userDribbleThreat ? 3.45 : 3.25) && player.decisionCooldown <= 0 && active.gameClock > 5 && shouldStepInToTackle(player, owner, active)) {
    const ownerNow = ballOwner(active);
    if (ownerNow) setPlayerHeading(player, headingFromDirection(ownerNow.pos.clone().sub(player.pos).setY(0)), 1 / 60, 24);
    attemptTackle(player, active);
    player.decisionCooldown = (stationaryCarrierThreat ? 0.2 : 0.32) + (player.number % 3) * 0.06;
  }

  const dir = target.sub(player.pos);
  return { dir: dir.lengthSq() > 0.06 ? dir.normalize() : activeShapeNudge(), sprint: isPressing || player.supportRunTimer > 0 };
}

function canDribbleIntoSpace(player: PlayerBody, active: MatchRuntime) {
  const ahead = dribbleSpaceDirection(player, active);
  const probe = player.pos.clone().add(ahead.multiplyScalar(6));
  const pressure = active.players.filter((item) => item.team !== player.team && item.pos.distanceTo(probe) < 5).length;
  return pressure === 0 && Math.abs(probe.x) < FIELD_W / 2 - 4 && Math.abs(probe.z) < FIELD_L / 2 - 3;
}

function dribbleSpaceDirection(player: PlayerBody, active: MatchRuntime) {
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const closest = nearestOpponentTo(player, active.players);
  const naturalSide = Math.sign(player.pos.x || player.home.x || (player.number % 2 ? -1 : 1));
  const cutAway = closest ? Math.sign(player.pos.x - closest.pos.x || naturalSide) : naturalSide;
  const wide = cutAway * (player.line === "forward" ? 0.48 : 0.28);
  return new THREE.Vector3(wide, 0, attackSign).normalize();
}

function escapePressureDirection(player: PlayerBody, active: MatchRuntime) {
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const closest = nearestOpponentTo(player, active.players);
  const away = closest ? player.pos.clone().sub(closest.pos).setY(0) : new THREE.Vector3(Math.sign(player.pos.x || 1), 0, -attackSign);
  if (away.lengthSq() < 0.1) away.set(Math.sign(player.pos.x || 1), 0, -attackSign);
  away.normalize();
  away.z = away.z * 0.55 - attackSign * 0.45;
  return away.normalize();
}

function rearPressureCount(player: PlayerBody, players: PlayerBody[], radius: number) {
  const facing = facingDirection(player);
  return players.filter((item) => {
    if (item.team === player.team || item.sentOff) return false;
    const offset = item.pos.clone().sub(player.pos).setY(0);
    if (offset.length() > radius) return false;
    return facing.dot(offset.normalize()) < -0.22;
  }).length;
}

function shieldPressureDirection(player: PlayerBody, active: MatchRuntime) {
  const facing = facingDirection(player);
  const sideAxis = new THREE.Vector3(-facing.z, 0, facing.x);
  const rearOpponent = active.players
    .filter((item) => item.team !== player.team && !item.sentOff)
    .map((item) => {
      const offset = item.pos.clone().sub(player.pos).setY(0);
      const behind = offset.lengthSq() > 0.05 ? facing.dot(offset.clone().normalize()) : 0;
      return { item, distance: offset.length(), behind };
    })
    .filter(({ distance, behind }) => distance < 5 && behind < -0.18)
    .sort((a, b) => a.distance - b.distance)[0]?.item;
  const away = rearOpponent ? player.pos.clone().sub(rearOpponent.pos).setY(0) : sideAxis.clone();
  const sideSign = Math.sign(sideAxis.dot(away) || player.skillSide || 1);
  return facing.multiplyScalar(0.42).add(sideAxis.multiplyScalar(sideSign * 0.74)).normalize();
}

function beginAiSkillMove(player: PlayerBody, active: MatchRuntime, goalDistance: number, pressured: boolean, blockers: number) {
  if (player.controlledBy || player.role === "keeper" || player.skillCooldown > 0 || player.skillTimer > 0 || player.carryTimer < 0.32) return false;
  const nearBox = goalDistance < 34 && Math.abs(player.pos.x) < GOAL_W * 2.9;
  const oneVsOneBurst = player.line === "forward" && goalDistance < 38 && pressured && blockers <= 2 && canDribbleIntoSpace(player, active);
  if (!nearBox && !oneVsOneBurst) return false;
  if (!oneVsOneBurst && !pressured && blockers < 2) return false;
  const closest = nearestOpponentTo(player, active.players);
  player.skillSide = closest
    ? Math.sign(player.pos.x - closest.pos.x || (player.number % 2 === 0 ? 1 : -1))
    : player.number % 2 === 0 ? 1 : -1;
  if (oneVsOneBurst) player.skillMove = "dribble-burst";
  else if (goalDistance < 20 && blockers >= 2) player.skillMove = "shot-fake";
  else if (pressured && blockers <= 2) player.skillMove = "body-feint";
  else if (goalDistance < 28 && player.line === "forward") player.skillMove = "quick-turn";
  else if (blockers >= 3) player.skillMove = "fake-pass";
  else player.skillMove = "dribble-burst";
  player.skillTimer = player.skillMove === "dribble-burst" ? 0.42 : 0.46;
  player.skillCooldown = oneVsOneBurst ? 1.55 + (player.number % 3) * 0.22 : 2.1 + (player.number % 4) * 0.35;
  player.decisionCooldown = 0.24;
  if (player.skillMove === "shot-fake" || player.skillMove === "fake-pass") player.kickTimer = Math.max(player.kickTimer, 0.22);
  return true;
}

function aiSkillDirection(player: PlayerBody, active: MatchRuntime) {
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const side = player.skillSide || 1;
  if (player.skillMove === "quick-turn") return new THREE.Vector3(side * 0.68, 0, -attackSign * 0.32).normalize();
  if (player.skillMove === "body-feint") return new THREE.Vector3(side * 0.76, 0, attackSign * 0.52).normalize();
  if (player.skillMove === "fake-pass") return new THREE.Vector3(side * 0.58, 0, attackSign * 0.64).normalize();
  return new THREE.Vector3(side * 0.62, 0, attackSign * 0.92).normalize();
}

function chooseAiShotStyle(player: PlayerBody, active: MatchRuntime, goalDistance: number, blockers: number): "shot" | "driven" | "finesse" | "chip" {
  const keeper = active.players.find((item) => item.team === opponent(player.team) && item.role === "keeper");
  const keeperGoalLine = keeper ? teamGoalZ(keeper.team, active.half) : 0;
  const keeperOut = Boolean(keeper && Math.abs(keeper.pos.z - keeperGoalLine) > 7.2);
  const edgeOfBox = goalDistance >= 18 && goalDistance < 36;
  const angledBody = Math.abs(player.pos.x) > GOAL_W * 0.55;
  const wideAngleRisk = Math.abs(player.pos.x) > GOAL_W * 1.05 && goalDistance < 38;
  const farPostWindow = keeper
    ? Math.sign(player.pos.x || 1) !== Math.sign(keeper.pos.x || player.pos.x || 1) || Math.abs(keeper.pos.x - player.pos.x * 0.18) > 1.8
    : angledBody;
  if (keeperOut && goalDistance < 34 && blockers <= 2) return "chip";
  if (wideAngleRisk && blockers <= 3) return "finesse";
  if (edgeOfBox && angledBody && blockers <= 3 && farPostWindow) return "finesse";
  if (goalDistance < 28 && blockers > 0 && blockers <= 3 && Math.abs(player.pos.x) > GOAL_W * 0.38) return "finesse";
  if (goalDistance < 20 && blockers <= 3) return "driven";
  if (Math.abs(player.pos.x) > GOAL_W * 0.9 && goalDistance < 32 && blockers <= 2) return "finesse";
  return "shot";
}

function poorWideShotAngle(player: PlayerBody, goalDistance: number, blockers: number) {
  const lateralOutsideGoal = Math.max(0, Math.abs(player.pos.x) - GOAL_W / 2);
  const visibleGoalAngle = Math.atan2(GOAL_W, Math.max(4, Math.hypot(lateralOutsideGoal, goalDistance)));
  const nearByline = goalDistance < 18 && lateralOutsideGoal > 5.5;
  const narrowMouth = visibleGoalAngle < 0.5 && lateralOutsideGoal > 7;
  return Math.abs(player.pos.x) > GOAL_W * 0.94
    && goalDistance < 42
    && (nearByline || narrowMouth || blockers > 1);
}

function cutInsideDirection(player: PlayerBody, active: MatchRuntime) {
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const inside = -Math.sign(player.pos.x || player.home.x || 1);
  return new THREE.Vector3(inside * 0.82, 0, attackSign * 0.48).normalize();
}

function chooseCutbackTarget(player: PlayerBody, active: MatchRuntime) {
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  return active.players
    .filter((teammate) => teammate.team === player.team && teammate.id !== player.id && teammate.role !== "keeper" && !teammate.sentOff)
    .map((teammate) => {
      const target = kickTargetForStyle(player, active, teammate, "short");
      const distance = teammate.pos.distanceTo(player.pos);
      const forward = (teammate.pos.z - player.pos.z) * attackSign;
      const central = GOAL_W * 2.8 - Math.abs(teammate.pos.x);
      const open = nearestOpponentDistance(teammate, active.players);
      const laneBlockers = opponentsBetween(player, target, active.players, 3.4);
      const receiverPressure = opponentPressureAtPoint(player.team, target, active.players, 6.6);
      const backOrSide = forward < 6 && forward > -28;
      return {
        teammate,
        target,
        distance,
        forward,
        open,
        laneBlockers,
        receiverPressure,
        score: clamp(central, -8, 18) * 1.4 + open * 1.8 - Math.abs(forward + 6) * 0.7 - distance * 0.18 - laneBlockers * 16 - receiverPressure * 12,
        backOrSide,
      };
    })
    .filter(({ teammate, target, distance, open, laneBlockers, receiverPressure, backOrSide }) => (
      backOrSide
      && distance > 8
      && distance < 36
      && open > 5.8
      && laneBlockers === 0
      && receiverPressure <= 1
      && !isRiskyBackPass(player, teammate, active, laneBlockers, open)
      && target.distanceTo(teammate.pos) < 4.2
    ))
    .sort((a, b) => b.score - a.score)[0]?.teammate ?? null;
}

function chooseWideCrossTarget(player: PlayerBody, active: MatchRuntime) {
  const goalZ = attackingGoalZ(player.team, active.half);
  return active.players
    .filter((teammate) => teammate.team === player.team && teammate.id !== player.id && teammate.role !== "keeper" && !teammate.sentOff)
    .map((teammate) => {
      const target = teammate.pos.clone().add(teammate.vel.clone().setY(0).multiplyScalar(0.52)).setY(BALL_RADIUS);
      const goalDistance = Math.abs(goalZ - teammate.pos.z);
      const centrality = Math.abs(teammate.pos.x);
      const distance = player.pos.distanceTo(teammate.pos);
      const landingPressure = opponentPressureAtPoint(player.team, target, active.players, 6.4);
      const open = nearestOpponentDistance(teammate, active.players);
      const arriving = teammate.vel.clone().setY(0).dot(new THREE.Vector3(0, 0, Math.sign(goalZ))) > 0.2;
      return {
        teammate,
        goalDistance,
        distance,
        landingPressure,
        score: (34 - goalDistance) * 1.2 + (22 - centrality) * 0.85 + open * 1.35 + (arriving ? 5 : 0) - landingPressure * 10,
      };
    })
    .filter(({ goalDistance, distance, landingPressure }) => goalDistance < 34 && distance > 12 && distance < 54 && landingPressure <= 1)
    .sort((a, b) => b.score - a.score)[0]?.teammate ?? null;
}

function performWideCross(player: PlayerBody, receiver: PlayerBody, active: MatchRuntime) {
  const target = receiver.pos.clone()
    .add(receiver.vel.clone().setY(0).multiplyScalar(0.52))
    .setY(BALL_RADIUS);
  target.x = clamp(target.x, -GOAL_W * 1.8, GOAL_W * 1.8);
  target.z = clamp(target.z, -FIELD_L / 2 + 4, FIELD_L / 2 - 4);
  const distance = player.pos.distanceTo(target);
  return kickTowardPoint(player, target, active, "long", receiver, tacticalChargeForKick("long", distance));
}

function clearBall(player: PlayerBody, active: MatchRuntime) {
  if (player.role === "keeper") {
    const direction = upfieldKickDirection(player.team, active.half);
    const plan = chooseGoalKickPlan(active, player, direction);
    const distance = plan.target.distanceTo(player.pos);
    const style: "short" | "long" = distance < 34 ? "short" : "long";
    const kicked = kickTowardPoint(player, plan.target, active, style, plan.receiver ?? undefined, tacticalChargeForKick(style, distance));
    if (kicked) {
      active.intendedReceiverId = plan.receiver?.id ?? null;
      active.ballIgnorePlayerId = player.id;
      active.ballIgnoreTimer = 0.72;
      active.restartProtectionTeam = player.team;
      active.restartProtectionTimer = 1.25;
      player.kickTimer = Math.max(player.kickTimer, 0.48);
    }
    return kicked;
  }
  const safeOutlet = choosePassTarget(player, active, "short");
  const ownGoalDistance = Math.abs(teamGoalZ(player.team, active.half) - player.pos.z);
  const pressure = opponentPressure(player, active.players, 6);
  if (safeOutlet && passIsUseful(player, safeOutlet, active, "short") && (pressure < 3 || ownGoalDistance > 15)) {
    return performPass(player, active, "short");
  }
  if (pressure < 2 && ownGoalDistance > 18) return false;
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const distance = 42;
  const lateral = (player.number % 2 === 0 ? 1 : -1) * 12;
  const target = player.pos.clone().add(new THREE.Vector3(lateral, BALL_RADIUS, attackSign * distance));
  const kicked = kickTowardPoint(player, target, active, "long");
  return kicked;
}

function formationBallInfluence(player: PlayerBody, phase: "attack" | "defense" | "neutral") {
  if (player.line === "defender") return phase === "attack" ? 0.24 : phase === "defense" ? 0.48 : 0.22;
  if (player.line === "midfielder") return phase === "attack" ? 0.48 : phase === "defense" ? 0.74 : 0.34;
  if (player.line === "forward") return phase === "attack" ? 0.62 : phase === "defense" ? 0.68 : 0.42;
  return 0.18;
}

function pointBetweenBallAndGoal(ball: THREE.Vector3, goalZ: number, player: PlayerBody) {
  const goal = new THREE.Vector3(clamp(ball.x * 0.35, -GOAL_W / 2, GOAL_W / 2), 0, goalZ);
  const laneSide = Math.sign(player.home.x || (player.number % 2 === 0 ? 1 : -1));
  return goal.lerp(new THREE.Vector3(ball.x, 0, ball.z), player.line === "defender" ? 0.42 : 0.56)
    .add(new THREE.Vector3(laneSide * (player.line === "midfielder" ? 3.2 : 1.7), 0, 0));
}

function pressingTarget(player: PlayerBody, active: MatchRuntime) {
  const ownZ = teamGoalZ(player.team, active.half);
  const ball = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
  const goalSide = new THREE.Vector3(clamp(active.ballPos.x * 0.2, -GOAL_W / 2, GOAL_W / 2), 0, ownZ);
  const pressFromGoalSide = ball.clone().lerp(goalSide, 0.18);
  pressFromGoalSide.x += Math.sign(player.home.x || player.pos.x || 1) * 0.9;
  return pressFromGoalSide;
}

function defensiveJockeyTarget(player: PlayerBody, active: MatchRuntime, carrier: PlayerBody, pressureIndex = 0) {
  const ownZ = teamGoalZ(player.team, active.half);
  const ownGoal = new THREE.Vector3(0, 0, ownZ);
  const toGoal = ownGoal.clone().sub(carrier.pos).setY(0);
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  if (toGoal.lengthSq() < 0.05) toGoal.set(0, 0, -attackSign);
  toGoal.normalize();
  const sideAxis = new THREE.Vector3(-toGoal.z, 0, toGoal.x);
  const carrierSpeed = carrier.vel.length();
  const distanceFromGoal = Math.abs(carrier.pos.z - ownZ);
  const stationary = carrierSpeed < 0.9 && carrier.carryTimer > 0.45;
  const wideThreat = distanceFromGoal < 46 && Math.abs(carrier.pos.x) > GOAL_W * 1.02;
  const rank = Math.max(0, pressureIndex);
  const gap = stationary
    ? rank === 0 ? 1.8 : 4.8
    : distanceFromGoal < 22
      ? rank === 0 ? 3.1 : 5.6
      : rank === 0 ? 4.25 : 6.8;
  const carrierMove = carrier.vel.clone().setY(0);
  const laneSide = Math.sign(
    carrierMove.lengthSq() > 0.1
      ? carrierMove.dot(sideAxis)
      : carrier.pos.x || player.home.x || player.pos.x || 1,
  );
  const sideOffset = rank === 0
    ? 0
    : rank === 1
      ? laneSide * (wideThreat ? 3.2 : 4.6)
      : -laneSide * (wideThreat ? 4.4 : 5.8);
  const target = carrier.pos
    .clone()
    .add(toGoal.multiplyScalar(gap))
    .add(sideAxis.multiplyScalar(sideOffset))
    .setY(0);
  if (wideThreat) {
    const wideSide = Math.sign(carrier.pos.x || 1);
    const nearPost = new THREE.Vector3(wideSide * (GOAL_W / 2 - 0.95), 0, ownZ);
    if (rank === 0) {
      target.copy(carrier.pos.clone().lerp(nearPost, 0.25));
      target.x -= wideSide * 2.65;
    } else if (rank === 1) {
      target.copy(carrier.pos.clone().lerp(ownGoal, 0.4));
      target.x = clamp(carrier.pos.x * 0.22, -GOAL_W / 2 + 1.1, GOAL_W / 2 - 1.1);
    }
  }
  target.x = clamp(target.x, -FIELD_W / 2 + 3, FIELD_W / 2 - 3);
  target.z = clamp(target.z, -FIELD_L / 2 + 4, FIELD_L / 2 - 4);
  return target;
}

function enforcePrimaryGoalSideContainment(target: THREE.Vector3, carrier: PlayerBody, ownZ: number) {
  const toGoal = new THREE.Vector3(0, 0, ownZ).sub(carrier.pos).setY(0);
  const goalDistance = toGoal.length();
  if (goalDistance < 0.8) return target.copy(carrier.pos).setY(0);
  toGoal.normalize();
  const sideAxis = new THREE.Vector3(-toGoal.z, 0, toGoal.x);
  const relativeTarget = target.clone().sub(carrier.pos).setY(0);
  const maxGoalSideGap = Math.max(1.35, Math.min(7.5, goalDistance - 0.35));
  const goalSideGap = clamp(relativeTarget.dot(toGoal), 1.35, maxGoalSideGap);
  const wideCarrier = Math.abs(carrier.pos.x) > GOAL_W * 1.02;
  const maximumShade = wideCarrier ? 1.75 : 0.9;
  const lateralShade = clamp(relativeTarget.dot(sideAxis), -maximumShade, maximumShade);
  return target.copy(carrier.pos)
    .add(toGoal.multiplyScalar(goalSideGap))
    .add(sideAxis.multiplyScalar(lateralShade))
    .setY(0);
}

function shouldStepInToTackle(player: PlayerBody, carrier: PlayerBody, active: MatchRuntime) {
  const ballPoint = controlledBallPoint(carrier);
  const toBall = ballPoint.clone().sub(player.pos).setY(0);
  const ballDistance = toBall.length();
  if (ballDistance <= 0.05 || ballDistance > 2.72) return false;
  const facingBall = facingDirection(player).dot(toBall.clone().normalize());
  if (facingBall < 0.34) return false;
  const carrierToDefender = player.pos.clone().sub(carrier.pos).setY(0);
  const fromBehind = carrierToDefender.lengthSq() > 0.05 && facingDirection(carrier).dot(carrierToDefender.normalize()) < -0.42;
  if (fromBehind) return false;
  const controlGap = active.ballPos.distanceTo(ballPoint);
  const carrierSpeed = carrier.vel.length();
  const carrierTowardDefender = carrier.vel.clone().setY(0).dot(player.pos.clone().sub(carrier.pos).setY(0).normalize());
  const heavyTouch = controlGap > 0.58 || active.ballVel.length() > 2.6;
  const slowOrStationary = carrierSpeed < 1.15 && carrier.carryTimer > 0.42;
  const intoReach = carrierTowardDefender > 1.0 && ballDistance < 2.35;
  const exposedAction = carrier.kickTimer > 0 || carrier.actionCooldown > 0.12;
  const relativeVelocity = carrier.vel.clone().sub(player.vel).setY(0);
  const closingSpeed = Math.max(2.4, -relativeVelocity.dot(toBall.clone().normalize()) + 5.8);
  const defenderReachTime = Math.max(0, ballDistance - playerBallContactRadius(player, active.ballPos.y)) / closingSpeed;
  const carrierRecoveryTime = controlGap > 0.28 ? clamp(controlGap / Math.max(2.8, carrierSpeed + 2.2), 0.08, 0.65) : 0.16;
  const coverAvailable = Boolean(
    active.defensivePlan?.secondaryCoverId
    && active.defensivePlan.secondaryCoverId !== player.id
    && active.players.some((candidate) => candidate.id === active.defensivePlan?.secondaryCoverId && candidate.pos.distanceTo(carrier.pos) < 12),
  );
  const canArriveFirst = defenderReachTime <= carrierRecoveryTime + (coverAvailable ? 0.18 : 0.08);
  return (heavyTouch || slowOrStationary || intoReach || exposedAction) && canArriveFirst;
}

function passLaneBlockTarget(player: PlayerBody, active: MatchRuntime) {
  const owner = ballOwner(active);
  if (!owner || owner.team === player.team || player.role === "keeper") return null;
  const ownZ = teamGoalZ(player.team, active.half);
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const receivers = active.players
    .filter((item) => item.team === owner.team && item.id !== owner.id && item.role !== "keeper" && !item.sentOff)
    .map((receiver) => {
      const lanePoint = owner.pos.clone().lerp(receiver.pos, receiver.line === "forward" ? 0.58 : 0.5).setY(0);
      const laneDistance = distanceToSegment2D(player.pos, owner.pos, receiver.pos);
      const receiverDanger = receiver.line === "forward"
        ? 16
        : receiver.line === "midfielder"
          ? player.line === "forward" || player.line === "midfielder" ? 14 : 7
          : 3;
      const centralDanger = clamp(GOAL_W * 2.7 - Math.abs(receiver.pos.x), -4, 18);
      const goalSideDanger = clamp(FIELD_L * 0.54 - Math.abs(receiver.pos.z - ownZ), -8, 20);
      return {
        lanePoint,
        score: receiverDanger + centralDanger * 0.32 + goalSideDanger * 0.28 - laneDistance * 0.72,
      };
    })
    .filter(({ score }) => score > 5)
    .sort((a, b) => b.score - a.score);
  const best = receivers[0];
  if (!best) return null;
  const target = best.lanePoint.clone();
  target.z -= attackSign * (player.line === "forward" ? 1.8 : 0.7);
  target.x = clamp(target.x, -FIELD_W / 2 + 4, FIELD_W / 2 - 4);
  target.z = clamp(target.z, -FIELD_L / 2 + 5, FIELD_L / 2 - 5);
  return target;
}

function defensiveCoverTarget(player: PlayerBody, active: MatchRuntime) {
  const ownZ = teamGoalZ(player.team, active.half);
  const ball = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
  const baseBlock = pointBetweenBallAndGoal(active.ballPos, ownZ, player);
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const laneSide = Math.sign(player.home.x || (player.number % 2 === 0 ? 1 : -1));
  if (player.line === "defender") {
    const owner = ballOwner(active);
    const opponentHasBall = owner?.team === opponent(player.team);
    const ballProgress = clamp((ball.z - ownZ) * attackSign, 0, FIELD_L);
    const ownerDistanceFromGoal = owner ? Math.abs(owner.pos.z - ownZ) : Math.abs(ball.z - ownZ);
    const carrierTowardGoal = owner
      ? owner.vel.clone().setY(0).dot(new THREE.Vector3(0, 0, ownZ).sub(owner.pos).setY(0).normalize()) > 0.18
      : false;
    const dangerDrop = opponentHasBall
      ? clamp(50 - ownerDistanceFromGoal, 0, 32) * 0.62 + (carrierTowardGoal ? 7.5 : 0)
      : 0;
    const stepUpDepth = opponentHasBall
      ? clamp(11 + ballProgress * 0.18 - dangerDrop, 7.2, 28)
      : clamp(12 + ballProgress * 0.48, 12, 46);
    const lineZ = ownZ + attackSign * stepUpDepth;
    return new THREE.Vector3(
      clamp(ball.x * 0.38 + player.home.x * 0.5 + laneSide * 2.2, -FIELD_W / 2 + 4, FIELD_W / 2 - 4),
      0,
      clamp(lineZ, -FIELD_L / 2 + 6, FIELD_L / 2 - 6),
    ).lerp(baseBlock, 0.45);
  }
  if (player.line === "midfielder") {
    const owner = ballOwner(active);
    const dangerDrop = owner?.team === opponent(player.team)
      ? clamp(46 - Math.abs(owner.pos.z - ownZ), 0, 24) * 0.18
      : 0;
    return baseBlock.add(new THREE.Vector3(laneSide * 2.4, 0, -attackSign * (4.8 + dangerDrop)));
  }
  const passingLane = ball.clone().add(new THREE.Vector3(laneSide * 6.2, 0, -attackSign * 7.5));
  return player.home.clone().lerp(passingLane.lerp(baseBlock, 0.45), 0.5);
}

function defensiveWallTarget(player: PlayerBody, active: MatchRuntime, carrier: PlayerBody) {
  if (player.role === "keeper" || player.line !== "defender" || carrier.team === player.team) return null;
  const ownZ = teamGoalZ(player.team, active.half);
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const distanceFromGoal = Math.abs(carrier.pos.z - ownZ);
  const carrierFacingGoal = facingDirection(carrier).dot(new THREE.Vector3(0, 0, ownZ).sub(carrier.pos).setY(0).normalize()) > 0.18;
  const centralThreat = Math.abs(carrier.pos.x) < GOAL_W * 2.65;
  const wideThreat = distanceFromGoal < 44
    && Math.abs(carrier.pos.x) >= GOAL_W * 1.05
    && Math.abs(carrier.pos.x) < FIELD_W / 2 - 3
    && (carrier.controlledBy === "p1" || carrierFacingGoal || distanceFromGoal < 30);
  const dangerZone = distanceFromGoal < 54
    && (centralThreat || wideThreat)
    && (carrier.controlledBy === "p1" || carrierFacingGoal || distanceFromGoal < 36);
  if (!dangerZone) return null;

  const defenders = active.players
    .filter((item) => item.team === player.team && item.line === "defender" && item.role !== "keeper" && !item.sentOff)
    .sort((a, b) => {
      const aScore = a.pos.distanceTo(carrier.pos) + Math.abs(a.home.x) * 0.04;
      const bScore = b.pos.distanceTo(carrier.pos) + Math.abs(b.home.x) * 0.04;
      return aScore - bScore;
    });
  const rank = Math.max(0, defenders.findIndex((item) => item.id === player.id));
  const ownGoal = new THREE.Vector3(0, 0, ownZ);
  const toGoal = ownGoal.clone().sub(carrier.pos).setY(0);
  if (toGoal.lengthSq() < 0.05) toGoal.set(0, 0, -attackSign);
  toGoal.normalize();
  const sideAxis = new THREE.Vector3(-toGoal.z, 0, toGoal.x);
  const carrierForward = facingDirection(carrier).setY(0);
  const escapeSide = Math.sign(carrierForward.dot(sideAxis) || carrier.pos.x || player.home.x || 1);
  const wallDepth = distanceFromGoal < 28 ? 2.65 : 3.25;
  const centralX = clamp(carrier.pos.x * 0.34, -GOAL_W / 2 + 1.2, GOAL_W / 2 - 1.2);
  const target = new THREE.Vector3(centralX, 0, carrier.pos.z).add(toGoal.clone().multiplyScalar(wallDepth));

  if (wideThreat) {
    const wideSide = Math.sign(carrier.pos.x || 1);
    const nearPost = new THREE.Vector3(wideSide * (GOAL_W / 2 - 0.85), 0, ownZ);
    if (rank === 0) {
      target.copy(carrier.pos.clone().lerp(nearPost, distanceFromGoal < 24 ? 0.32 : 0.25));
      target.x -= wideSide * 2.25;
    } else if (rank === 1) {
      target.copy(carrier.pos.clone().lerp(ownGoal, 0.42));
      target.x = clamp(carrier.pos.x * 0.34, -GOAL_W / 2 + 1.1, GOAL_W / 2 - 1.1);
    } else {
      target.copy(carrier.pos.clone().lerp(ownGoal, rank === 2 ? 0.54 : 0.66));
      target.x = rank === 2
        ? clamp(-wideSide * 1.8, -GOAL_W / 2 + 1.2, GOAL_W / 2 - 1.2)
        : clamp(-wideSide * (GOAL_W / 2 - 1.25), -GOAL_W / 2 + 1.1, GOAL_W / 2 - 1.1);
    }
  } else if (rank === 0) {
    target.x = clamp(carrier.pos.x * 0.22, -GOAL_W / 2 + 1, GOAL_W / 2 - 1);
    target.add(toGoal.clone().multiplyScalar(distanceFromGoal < 24 ? 0.55 : 0.25));
  } else if (rank === 1) {
    target.copy(carrier.pos)
      .add(toGoal.clone().multiplyScalar(distanceFromGoal < 30 ? 3.35 : 4.3))
      .add(sideAxis.clone().multiplyScalar(escapeSide * 4.1));
  } else if (rank === 2) {
    target.copy(carrier.pos.clone().lerp(ownGoal, 0.38))
      .add(sideAxis.clone().multiplyScalar(-escapeSide * 4.6));
    target.x = clamp(target.x * 0.7, -GOAL_W / 2 + 1.8, GOAL_W / 2 - 1.8);
  } else {
    target.copy(carrier.pos.clone().lerp(ownGoal, 0.48))
      .add(sideAxis.clone().multiplyScalar(escapeSide * 5.6));
    target.x = clamp(target.x * 0.55, -GOAL_W / 2 + 2.2, GOAL_W / 2 - 2.2);
  }

  if (distanceFromGoal < 26 && !wideThreat) {
    target.x = clamp(target.x * 0.72, -GOAL_W / 2 + 0.8, GOAL_W / 2 - 0.8);
    target.z = clamp(target.z, Math.min(ownZ + attackSign * 4.8, carrier.pos.z + toGoal.z * 4), Math.max(ownZ + attackSign * 4.8, carrier.pos.z + toGoal.z * 4));
  }
  target.x = clamp(target.x, -FIELD_W / 2 + 3, FIELD_W / 2 - 3);
  target.z = clamp(target.z, -FIELD_L / 2 + 4, FIELD_L / 2 - 4);
  return target;
}

function defensiveAssignmentTarget(player: PlayerBody, active: MatchRuntime) {
  const owner = ballOwner(active);
  if (!owner || owner.team === player.team || player.role === "keeper") return null;
  const ownZ = teamGoalZ(player.team, active.half);
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const sameTeamMarkers = active.players.filter((item) => item.team === player.team && item.role !== "keeper" && !item.sentOff);
  const candidates = active.players
    .filter((opponentPlayer) => opponentPlayer.team !== player.team && opponentPlayer.id !== owner.id && opponentPlayer.role !== "keeper" && !opponentPlayer.sentOff)
    .map((opponentPlayer) => {
      const distanceToOwner = opponentPlayer.pos.distanceTo(owner.pos);
      const distanceToBall = opponentPlayer.pos.distanceTo(active.ballPos);
      const nearestMarkerDistance = sameTeamMarkers
        .filter((marker) => marker.id !== player.id)
        .reduce((distance, marker) => Math.min(distance, marker.pos.distanceTo(opponentPlayer.pos)), Infinity);
      const markerRank = sameTeamMarkers
        .map((marker) => {
          const lineFit = marker.line === "midfielder" && opponentPlayer.line === "midfielder"
            ? -3.2
            : marker.line === "forward" && opponentPlayer.line === "midfielder"
              ? -2.1
              : marker.line === "defender" && opponentPlayer.line === "forward"
                ? -2.8
                : 0;
          return { id: marker.id, score: marker.pos.distanceTo(opponentPlayer.pos) + lineFit };
        })
        .sort((a, b) => a.score - b.score)
        .findIndex((item) => item.id === player.id);
      const forwardDanger = (opponentPlayer.pos.z - owner.pos.z) * Math.sign(attackingGoalZ(owner.team, active.half));
      const rolePriority = opponentPlayer.line === "midfielder"
        ? player.line === "midfielder" || player.line === "forward" ? 30 : 12
        : opponentPlayer.line === "forward"
          ? player.line === "defender" ? 26 : 15
          : 6;
      const laneBlockValue = distanceToOwner < 46 ? 22 - distanceToOwner * 0.28 : 3;
      const unmarkedBonus = nearestMarkerDistance > 9 ? 18 : nearestMarkerDistance > 6 ? 8 : -2;
      const rankBonus = markerRank === 0 ? 18 : markerRank === 1 ? 10 : markerRank === 2 ? 4 : -markerRank * 2.2;
      const dangerousHalf = Math.abs(opponentPlayer.pos.z - ownZ) < FIELD_L * 0.56 ? 9 : 0;
      const centralValue = clamp(GOAL_W * 2.8 - Math.abs(opponentPlayer.pos.x), -6, 18);
      return {
        opponentPlayer,
        distanceToOwner,
        score: rolePriority
          + laneBlockValue
          + unmarkedBonus
          + rankBonus
          + dangerousHalf
          + centralValue * 0.45
          + clamp(forwardDanger, -4, 14) * 0.55
          - distanceToBall * 0.05,
      };
    })
    .filter(({ score }) => score > 18)
    .sort((a, b) => b.score - a.score);
  const assigned = candidates[0]?.opponentPlayer;
  if (!assigned) return null;
  const goalSide = new THREE.Vector3(0, 0, ownZ).sub(assigned.pos).setY(0);
  if (goalSide.lengthSq() < 0.05) goalSide.set(0, 0, -attackSign);
  goalSide.normalize();
  const passLaneTarget = owner.pos.clone().lerp(assigned.pos, assigned.line === "midfielder" ? 0.58 : 0.7);
  const target = assigned.line === "midfielder"
    ? passLaneTarget.add(goalSide.clone().multiplyScalar(1.2))
    : assigned.pos.clone().add(goalSide.multiplyScalar(player.line === "defender" ? 2.9 : 2.1));
  target.x = clamp(target.x, -FIELD_W / 2 + 3.5, FIELD_W / 2 - 3.5);
  target.z = clamp(target.z, -FIELD_L / 2 + 3.5, FIELD_L / 2 - 3.5);
  target.y = 0;
  return target;
}

function dangerousMarkTarget(player: PlayerBody, active: MatchRuntime) {
  if (player.role === "keeper" || player.line !== "defender") return null;
  const ownZ = teamGoalZ(player.team, active.half);
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const candidates = active.players
    .filter((item) => item.team !== player.team && item.role !== "keeper" && !item.sentOff)
    .map((attacker) => {
      const dangerToGoal = FIELD_L - Math.abs(attacker.pos.z - ownZ);
      const highBehindLine = (attacker.pos.z - player.pos.z) * attackSign > -2 ? 8 : 0;
      const central = GOAL_W * 2.5 - Math.abs(attacker.pos.x);
      const laneFit = 18 - Math.abs(attacker.pos.x - player.home.x);
      const ballSide = 8 - Math.abs(attacker.pos.z - active.ballPos.z) * 0.08;
      const roleBonus = attacker.line === "forward" ? 12 : attacker.line === "midfielder" ? 5 : 0;
      return { attacker, score: dangerToGoal * 0.34 + central * 0.45 + laneFit + ballSide + highBehindLine + roleBonus };
    })
    .sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.score < 18) return null;
  const marked = best.attacker;
  const goalSide = new THREE.Vector3(0, 0, ownZ).sub(marked.pos).setY(0);
  if (goalSide.lengthSq() < 0.05) goalSide.set(0, 0, -attackSign);
  const cover = marked.pos.clone().add(goalSide.normalize().multiplyScalar(2.8));
  cover.x = clamp(cover.x, -FIELD_W / 2 + 3.5, FIELD_W / 2 - 3.5);
  cover.z = clamp(cover.z, -FIELD_L / 2 + 3.5, FIELD_L / 2 - 3.5);
  return cover;
}

function aiBackPassIsSafe(
  player: PlayerBody,
  receiver: PlayerBody,
  active: MatchRuntime,
  target = kickTargetForStyle(player, active, receiver, "short"),
) {
  if (receiver.team !== player.team || receiver.id === player.id || receiver.sentOff || receiver.role === "keeper") return false;
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const backwardDepth = (player.pos.z - receiver.pos.z) * attackSign;
  const distance = target.distanceTo(player.pos);
  const targetReceiverGap = target.distanceTo(receiver.pos);
  if (backwardDepth < 3.8 || distance < 9.5 || distance > 46) return false;
  if (targetReceiverGap > 4.2) return false;
  const receiverOpen = nearestOpponentDistance(receiver, active.players);
  if (receiverOpen < 8.4) return false;
  if (opponentsBetween(player, target, active.players, 3.7) > 0) return false;
  if (opponentPressureAtPoint(player.team, target, active.players, 7.4) > 0) return false;
  const laneSamples = [0.25, 0.5, 0.75];
  if (laneSamples.some((mix) => opponentPressureAtPoint(player.team, player.pos.clone().lerp(target, mix), active.players, 4.5) > 0)) {
    return false;
  }
  const charge = clamp(tacticalChargeForKick("short", distance) + 0.22, 0.82, 1);
  const availablePower = sharedKickForce("short", distance, charge, true).power;
  const minimumReachPower = clamp(27 + distance * 0.5, 32, 48);
  return availablePower >= minimumReachPower;
}

function performBackPass(player: PlayerBody, active: MatchRuntime) {
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const candidates = active.players
    .filter((item) => item.team === player.team && item.id !== player.id && item.role !== "keeper" && !item.sentOff)
    .map((teammate) => {
      const target = kickTargetForStyle(player, active, teammate, "short");
      const distance = target.distanceTo(player.pos);
      const backward = (player.pos.z - teammate.pos.z) * attackSign;
      const open = nearestOpponentDistance(teammate, active.players);
      const laneBlockers = opponentsBetween(player, target, active.players, 3.7);
      const targetPressure = opponentPressureAtPoint(player.team, target, active.players, 6.8);
      const laneSafety = laneBlockers === 0 ? 7 : -laneBlockers * 10;
      return {
        teammate,
        target,
        score: backward * 1.35 + clamp(open, 0, 13) * 1.8 + laneSafety - targetPressure * 8 - Math.abs(distance - 20) * 0.56,
        distance,
        backward,
        open,
        laneBlockers,
        targetPressure,
      };
    })
    .filter(({ teammate, target, distance, backward, open, laneBlockers, targetPressure }) => (
      distance > 10
      && distance < 48
      && backward > 4.6
      && open > 8.2
      && laneBlockers === 0
      && targetPressure === 0
      && aiBackPassIsSafe(player, teammate, active, target)
    ))
    .sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const receiver = best?.teammate;
  if (!receiver || !best || best.score < 16) {
    active.renderer.domElement.dataset.rejectedBackPasses = String(
      Number(active.renderer.domElement.dataset.rejectedBackPasses ?? "0") + 1,
    );
    return false;
  }
  active.pendingKickTarget = receiver.pos.clone();
  const distance = best.distance;
  const passed = performPassTo(player, active, receiver, "short");
  if (passed) {
    active.renderer.domElement.dataset.completedBackPasses = String(
      Number(active.renderer.domElement.dataset.completedBackPasses ?? "0") + 1,
    );
    active.renderer.domElement.dataset.lastBackPassReceiver = receiver.id;
    limitHorizontalBallSpeed(active.ballVel, clamp(32 + distance * 0.52, 34, 46));
    active.ballVel.y = Math.min(active.ballVel.y, 0.38);
  }
  return passed;
}

function addOrganicVariation(player: PlayerBody, target: THREE.Vector3, active: MatchRuntime) {
  if (player.role === "keeper") return;
  const seed = player.number * 1.731 + (player.team === "home" ? 0 : 2.4);
  const slow = active.gameClock * 0.026 + seed;
  const quick = active.gameClock * 0.071 + seed * 0.7;
  const width = player.line === "forward" ? 2.8 : player.line === "midfielder" ? 2.2 : 1.25;
  const depth = player.line === "forward" ? 2.6 : player.line === "midfielder" ? 1.8 : 1.1;
  target.x += Math.sin(slow) * width + Math.sin(quick) * 0.55;
  target.z += Math.cos(slow * 0.83) * depth;
}

function addFormationMotion(player: PlayerBody, target: THREE.Vector3, active: MatchRuntime, teamHasBall: boolean, opponentHasBall: boolean, pressing: boolean) {
  if (player.role === "keeper" || pressing) return;
  const beat = active.gameClock * 0.05 + player.number * 1.37;
  const width = player.line === "defender" ? 1.2 : player.line === "midfielder" ? 2.1 : 2.8;
  const depth = player.line === "defender" ? 1.2 : player.line === "midfielder" ? 2.4 : 3;
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const phaseDepth = teamHasBall ? attackSign * depth : opponentHasBall ? -attackSign * depth * 0.72 : Math.sin(beat * 0.6) * 0.8;
  target.x += Math.sin(beat) * width;
  target.z += Math.cos(beat * 0.72) * depth * 0.35 + phaseDepth;
}

function finalThirdSupportTarget(player: PlayerBody, owner: PlayerBody, active: MatchRuntime) {
  if (player.id === owner.id || player.role === "keeper") return null;
  const goalZ = attackingGoalZ(player.team, active.half);
  const attackSign = Math.sign(goalZ) || 1;
  const goalDistance = Math.abs(goalZ - owner.pos.z);
  if (goalDistance > 58) return null;
  const target = player.pos.clone().setY(0);
  const slotSide = player.formationSlot.startsWith("L")
    ? -1
    : player.formationSlot.startsWith("R")
      ? 1
      : Math.sign(player.home.x || (player.number % 2 === 0 ? 1 : -1));
  if (player.line === "midfielder") {
    const wide = ["LM", "RM", "LWB", "RWB", "LAM", "RAM"].includes(player.formationSlot);
    if (wide) {
      target.x = slotSide * (FIELD_W / 2 - 13);
      target.z = goalZ - attackSign * (Math.abs(owner.pos.x) > FIELD_W * 0.2 ? 25 : 30);
      return target;
    }
    const centralMidfielders = active.players
      .filter((candidate) => candidate.team === player.team && candidate.line === "midfielder" && !candidate.sentOff
        && !["LM", "RM", "LWB", "RWB", "LAM", "RAM"].includes(candidate.formationSlot))
      .sort((a, b) => a.number - b.number);
    const index = Math.max(0, centralMidfielders.findIndex((candidate) => candidate.id === player.id));
    if (index % 3 === 0) {
      target.x = clamp(owner.pos.x * 0.42 + slotSide * 8, -GOAL_W * 1.45, GOAL_W * 1.45);
      target.z = goalZ - attackSign * 23;
    } else if (index % 3 === 1) {
      target.x = clamp(owner.pos.x * 0.22 + slotSide * 5, -GOAL_W * 1.8, GOAL_W * 1.8);
      target.z = goalZ - attackSign * 39;
    } else {
      target.x = clamp(-Math.sign(owner.pos.x || slotSide) * 18, -FIELD_W / 2 + 11, FIELD_W / 2 - 11);
      target.z = goalZ - attackSign * 30;
    }
    return target;
  }
  if (player.line === "defender") {
    const fullback = ["LB", "RB", "LWB", "RWB"].includes(player.formationSlot);
    if (fullback) {
      target.x = slotSide * (FIELD_W / 2 - 12);
      target.z = goalZ - attackSign * 37;
    } else {
      target.x = slotSide * (player.number % 2 === 0 ? 10 : 15);
      target.z = clamp(owner.pos.z - attackSign * (player.number % 2 === 0 ? 25 : 32), -FIELD_L / 2 + 10, FIELD_L / 2 - 10);
    }
    return target;
  }
  return null;
}

function addPossessionSpacing(player: PlayerBody, target: THREE.Vector3, active: MatchRuntime, teamHasBall: boolean) {
  const owner = ballOwner(active);
  if (!teamHasBall || !owner || owner.id === player.id || player.role === "keeper") return;
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const minGap = player.line === "forward" ? 15 : player.line === "midfielder" ? 12 : 9.5;
  const ownerFlat = owner.pos.clone().setY(0);
  const laneSide = Math.sign(player.home.x || player.pos.x || (player.number % 2 === 0 ? 1 : -1));
  const passAngle = (player.number % 3) - 1;
  const supportTarget = player.home.clone();
  if (player.line === "forward") {
    supportTarget.x = clamp(ownerFlat.x + laneSide * 20, -FIELD_W / 2 + 7, FIELD_W / 2 - 7);
    supportTarget.z = clamp(ownerFlat.z + attackSign * (20 + (player.number % 3) * 3.8), -FIELD_L / 2 + 8, FIELD_L / 2 - 8);
  } else if (player.line === "midfielder") {
    supportTarget.x = clamp(ownerFlat.x + laneSide * (12 + Math.abs(passAngle) * 4), -FIELD_W / 2 + 7, FIELD_W / 2 - 7);
    supportTarget.z = clamp(ownerFlat.z + attackSign * (passAngle === 0 ? -7.5 : 5.5), -FIELD_L / 2 + 8, FIELD_L / 2 - 8);
  } else {
    const fullback = ["LB", "RB", "LWB", "RWB"].includes(player.formationSlot);
    const slotSide = player.formationSlot.startsWith("L") ? -1 : player.formationSlot.startsWith("R") ? 1 : laneSide;
    supportTarget.x = fullback
      ? slotSide * (FIELD_W / 2 - 13)
      : slotSide * (player.number % 2 === 0 ? 10 : 15);
    const supportDepth = fullback && owner.line === "defender" ? 7 : fullback ? -8 : player.number % 2 === 0 ? -14 : -21;
    supportTarget.z = clamp(ownerFlat.z + attackSign * supportDepth, -FIELD_L / 2 + 9, FIELD_L / 2 - 9);
  }
  if (active.intendedReceiverId !== player.id) {
    target.lerp(supportTarget, player.line === "forward" ? 0.48 : player.line === "midfielder" ? 0.6 : 0.56);
    const finalThirdTarget = finalThirdSupportTarget(player, owner, active);
    if (finalThirdTarget) {
      target.lerp(finalThirdTarget, player.line === "midfielder" ? 0.76 : player.line === "defender" ? 0.68 : 0.48);
    }
  }
  const ownerGap = target.distanceTo(owner.pos);
  if (ownerGap < minGap) {
    const lane = target.clone().sub(owner.pos).setY(0);
    if (lane.lengthSq() < 0.1) {
      lane.set(Math.sign(player.home.x || player.number % 2 || 1), 0, player.line === "defender" ? -attackSign * 0.35 : attackSign * 0.55);
    }
    target.add(lane.normalize().multiplyScalar(minGap - ownerGap + 2.2));
  }
  const currentGap = player.pos.distanceTo(ownerFlat);
  if (active.intendedReceiverId !== player.id && currentGap < minGap) {
    const escape = player.pos.clone().sub(ownerFlat).setY(0);
    if (escape.lengthSq() < 0.1) escape.set(laneSide, 0, player.line === "defender" ? -attackSign * 0.4 : attackSign * 0.45);
    target.add(escape.normalize().multiplyScalar(minGap - currentGap + 3.2));
  }
  const sameTeamCrowd = active.players.filter((item) => (
    item.team === player.team
    && item.id !== player.id
    && item.id !== owner.id
    && item.role !== "keeper"
    && item.pos.distanceTo(target) < 6.2
  ));
  sameTeamCrowd.forEach((teammate) => {
    const away = target.clone().sub(teammate.pos).setY(0);
    if (away.lengthSq() < 0.1) away.set(Math.sign(player.home.x || 1), 0, attackSign * 0.3);
    target.add(away.normalize().multiplyScalar(1.4));
  });
}

function activeShapeNudge() {
  return new THREE.Vector3();
}

function pressureFieldPlayers(players: PlayerBody[], team: TeamId, ball: THREE.Vector3, count: number) {
  return players
    .filter((player) => player.team === team && player.role !== "keeper" && !player.sentOff)
    .sort((a, b) => a.pos.distanceTo(ball) - b.pos.distanceTo(ball))
    .slice(0, count)
    .map((player) => player.id);
}

function defensivePressureScore(player: PlayerBody, carrier: PlayerBody, active: MatchRuntime) {
  const ownZ = teamGoalZ(player.team, active.half);
  const distanceFromOwnGoal = Math.abs(carrier.pos.z - ownZ);
  let roleFit = 0;
  if (carrier.line === "midfielder") {
    roleFit = player.line === "midfielder" ? -5.8 : player.line === "forward" ? -3.8 : 5.6;
  } else if (carrier.line === "forward") {
    roleFit = player.line === "defender" ? -5.4 : player.line === "midfielder" ? -1.5 : 6.2;
  } else {
    roleFit = player.line === "midfielder" ? -2.8 : player.line === "forward" ? -1.2 : 2.4;
  }
  if (distanceFromOwnGoal > 58 && player.line === "defender") roleFit += 9.5;
  return player.pos.distanceTo(carrier.pos)
    + roleFit
    + Math.abs(player.home.x - carrier.pos.x) * 0.045
    + (player.recoveryTimer > 0 ? 6 : 0);
}

function isManualControlledPlayer(player: PlayerBody, active: MatchRuntime) {
  return player.controlledBy === "p1" && !active.p1Autopilot;
}

function defensiveDangerPhase(active: MatchRuntime, defendingTeam: TeamId, carrier: PlayerBody): DefensiveDangerPhase {
  const ownZ = teamGoalZ(defendingTeam, active.half);
  const attackingPlayers = active.players.filter((player) => player.team === carrier.team && player.role !== "keeper" && !player.sentOff);
  const deepestThreat = attackingPlayers.reduce(
    (depth, player) => Math.min(depth, Math.abs(player.pos.z - ownZ)),
    Math.abs(carrier.pos.z - ownZ),
  );
  const centralEmergency = Math.abs(carrier.pos.x) < GOAL_W * 1.8 && Math.abs(carrier.pos.z - ownZ) < 23;
  const bylineEmergency = Math.abs(carrier.pos.z - ownZ) < 14 && Math.abs(carrier.pos.x) < FIELD_W / 2 - 3;
  const sixYardThreat = attackingPlayers.some((player) => Math.abs(player.pos.z - ownZ) < 12 && Math.abs(player.pos.x) < GOAL_W * 1.45);
  if (deepestThreat < 18 || centralEmergency || bylineEmergency || sixYardThreat) return "EMERGENCY_GOAL_DEFENSE";
  if (deepestThreat < 38 || Math.abs(carrier.pos.z - ownZ) < 40) return "DEEP_BLOCK";
  return "NORMAL_BLOCK";
}

function baseDefensiveShapeTarget(
  player: PlayerBody,
  active: MatchRuntime,
  carrier: PlayerBody,
  phase = defensiveDangerPhase(active, player.team, carrier),
) {
  const ownZ = teamGoalZ(player.team, active.half);
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const carrierDepth = clamp(Math.abs(carrier.pos.z - ownZ), 0, FIELD_L);
  const defenderDepth = phase === "EMERGENCY_GOAL_DEFENSE"
    ? clamp(carrierDepth * 0.52, 2.8, 11.5)
    : phase === "DEEP_BLOCK"
      ? clamp(carrierDepth * 0.42, 5.2, 23)
      : clamp(carrierDepth * 0.3, 9.5, 31);
  const lineDepth = player.line === "defender"
    ? defenderDepth
    : player.line === "midfielder"
      ? phase === "EMERGENCY_GOAL_DEFENSE"
        ? clamp(defenderDepth + 5.5, 8, 18)
        : phase === "DEEP_BLOCK"
          ? clamp(defenderDepth + 10, 15, 34)
          : clamp(defenderDepth + 16, 24, 52)
      : phase === "EMERGENCY_GOAL_DEFENSE"
        ? clamp(defenderDepth + 12, 14, 27)
        : phase === "DEEP_BLOCK"
          ? clamp(defenderDepth + 20, 24, 45)
          : clamp(defenderDepth + 31, 39, 69);
  const ballSideInfluence = phase === "EMERGENCY_GOAL_DEFENSE"
    ? player.line === "defender" ? 0.12 : 0.2
    : player.line === "defender" ? 0.18 : player.line === "midfielder" ? 0.28 : 0.32;
  return new THREE.Vector3(
    clamp(player.home.x * (1 - ballSideInfluence) + carrier.pos.x * ballSideInfluence, -FIELD_W / 2 + 5, FIELD_W / 2 - 5),
    0,
    clamp(ownZ + attackSign * lineDepth, -FIELD_L / 2 + 6, FIELD_L / 2 - 6),
  );
}

function clampDefensiveTargetDepth(target: THREE.Vector3, ownZ: number, attackSign: number, maxDepth: number) {
  if (Math.abs(target.z - ownZ) <= maxDepth) return target;
  target.z = ownZ + attackSign * maxDepth;
  return target;
}

function defensiveThreatScore(
  attacker: PlayerBody,
  carrier: PlayerBody,
  active: MatchRuntime,
  defendingTeam: TeamId,
) {
  const ownGoal = new THREE.Vector3(0, 0, teamGoalZ(defendingTeam, active.half));
  const goalDistance = attacker.pos.distanceTo(ownGoal);
  const centrality = Math.abs(attacker.pos.x) / Math.max(1, FIELD_W / 2);
  const defenders = active.players.filter((player) => (
    player.team === defendingTeam && player.role !== "keeper" && !player.sentOff
  ));
  const nearestDefender = Math.min(...defenders.map((player) => player.pos.distanceTo(attacker.pos)), FIELD_L);
  const runToGoal = attacker.vel.clone().setY(0);
  const goalDirection = ownGoal.clone().sub(attacker.pos).setY(0);
  const runDanger = runToGoal.lengthSq() > 0.05 && goalDirection.lengthSq() > 0.05
    ? Math.max(0, runToGoal.normalize().dot(goalDirection.normalize()))
    : 0;
  const laneBlocked = opponentsBetween(carrier, attacker.pos, active.players, 1.9) > 0;
  const roleThreat = attacker.line === "forward" ? 20 : attacker.line === "midfielder" ? 10 : 2;
  const behindLine = defenders
    .filter((player) => player.line === "defender")
    .filter((player) => player.pos.distanceTo(ownGoal) > goalDistance + 1.5)
    .length;
  return 120
    - goalDistance * 1.42
    - centrality * 13
    + roleThreat
    + runDanger * 13
    + Math.min(nearestDefender, 16) * 1.25
    + behindLine * 3.2
    + (laneBlocked ? 0 : 8);
}

function goalSideMarkTarget(
  attacker: PlayerBody,
  carrier: PlayerBody,
  ownGoal: THREE.Vector3,
  phase: DefensiveDangerPhase,
) {
  const goalSide = ownGoal.clone().sub(attacker.pos).setY(0);
  if (goalSide.lengthSq() < 0.05) goalSide.set(0, 0, Math.sign(ownGoal.z || 1));
  goalSide.normalize();
  const passLane = attacker.pos.clone().sub(carrier.pos).setY(0);
  const laneSide = passLane.lengthSq() > 0.05
    ? new THREE.Vector3(-passLane.z, 0, passLane.x).normalize()
    : new THREE.Vector3(-goalSide.z, 0, goalSide.x);
  const markerSide = Math.sign(attacker.pos.x - carrier.pos.x || attacker.pos.x || 1);
  const cushion = phase === "EMERGENCY_GOAL_DEFENSE" ? 1.75 : phase === "DEEP_BLOCK" ? 2.35 : 3.1;
  const laneOffset = phase === "EMERGENCY_GOAL_DEFENSE" ? 0.48 : 0.82;
  return attacker.pos
    .clone()
    .add(goalSide.multiplyScalar(cushion))
    .add(laneSide.multiplyScalar(markerSide * laneOffset))
    .setY(0);
}

function markerAssignmentCost(
  defender: PlayerBody,
  threat: PlayerBody,
  target: THREE.Vector3,
  previousMarkerId: string | null,
) {
  const centerBack = defender.formationSlot.includes("CB");
  const rolePenalty = centerBack ? -10 : defender.line === "defender" ? -3 : defender.line === "midfielder" ? 9 : 22;
  const continuityBonus = previousMarkerId === defender.id ? -13 : 0;
  const sidePenalty = Math.abs(defender.home.x - threat.pos.x) * 0.08;
  return defender.pos.distanceTo(target) + rolePenalty + continuityBonus + sidePenalty;
}

function updateDefensiveTeamPlan(active: MatchRuntime, dt: number) {
  active.defensivePlanTimer = Math.max(0, active.defensivePlanTimer - dt);
  active.defensivePlanGraceTimer = Math.max(0, active.defensivePlanGraceTimer - dt);
  const owner = ballOwner(active);
  let carrier = owner;
  if (owner && owner.role !== "keeper") {
    active.defensivePlanGraceTimer = 1.08;
  } else if (active.phase === "open") {
    const intendedReceiver = active.ballState === "kicked" && active.intendedReceiverId
      ? active.players.find((player) => player.id === active.intendedReceiverId && player.role !== "keeper" && !player.sentOff) ?? null
      : null;
    const previousCarrier = active.defensivePlan?.carrierId
      ? active.players.find((player) => player.id === active.defensivePlan?.carrierId && player.role !== "keeper" && !player.sentOff) ?? null
      : null;
    if (intendedReceiver) {
      carrier = intendedReceiver;
      active.defensivePlanGraceTimer = Math.max(active.defensivePlanGraceTimer, 0.92);
    } else if (
      active.defensivePlanGraceTimer > 0
      && previousCarrier
      && previousCarrier.pos.distanceTo(active.ballPos) < 9.5
    ) {
      carrier = previousCarrier;
    }
  }
  if (active.phase !== "open" || !carrier || carrier.role === "keeper") {
    active.defensivePlan = null;
    active.defensivePlanTimer = 0;
    active.defensivePlanGraceTimer = 0;
    return;
  }

  const defendingTeam = opponent(carrier.team);
  const defenders = active.players
    .filter((player) => (
      player.team === defendingTeam
      && player.role !== "keeper"
      && !player.sentOff
      && !isManualControlledPlayer(player, active)
    ));
  if (defenders.length === 0) {
    active.defensivePlan = null;
    return;
  }

  const pressureCandidates = defenders
    .map((player) => ({ player, score: defensivePressureScore(player, carrier, active) }))
    .sort((a, b) => a.score - b.score);
  const ownZ = teamGoalZ(defendingTeam, active.half);
  const defendingAttackSign = Math.sign(attackingGoalZ(defendingTeam, active.half));
  const distanceFromOwnGoal = Math.abs(carrier.pos.z - ownZ);
  const deepestThreatDepth = active.players
    .filter((player) => player.team === carrier.team && player.role !== "keeper" && !player.sentOff)
    .reduce((depth, player) => Math.min(depth, Math.abs(player.pos.z - ownZ)), distanceFromOwnGoal);
  const dangerDepth = Math.min(distanceFromOwnGoal, deepestThreatDepth);
  const dangerPhase = defensiveDangerPhase(active, defendingTeam, carrier);
  const defenderDepthCeiling = dangerPhase === "EMERGENCY_GOAL_DEFENSE"
    ? clamp(dangerDepth + 1.8, 4.2, 12.5)
    : dangerPhase === "DEEP_BLOCK"
      ? clamp(dangerDepth + 2.8, 8, 25)
      : clamp(dangerDepth - 2.4, 5.8, 34);
  const midfieldDepthCeiling = dangerPhase === "EMERGENCY_GOAL_DEFENSE"
    ? clamp(defenderDepthCeiling + 6.5, 10, 20)
    : dangerPhase === "DEEP_BLOCK"
      ? clamp(defenderDepthCeiling + 10, 17, 36)
      : clamp(defenderDepthCeiling + (dangerDepth < 28 ? 9.5 : 13.5), 14, 50);
  const forwardDepthCeiling = dangerPhase === "EMERGENCY_GOAL_DEFENSE"
    ? clamp(midfieldDepthCeiling + 8, 18, 29)
    : dangerPhase === "DEEP_BLOCK"
      ? clamp(midfieldDepthCeiling + 13, 28, 49)
      : FIELD_L;
  const depthCeilingFor = (player: PlayerBody) => player.line === "defender"
    ? defenderDepthCeiling
    : player.line === "midfielder"
      ? midfieldDepthCeiling
      : forwardDepthCeiling;
  const previousPlan = active.defensivePlan?.defendingTeam === defendingTeam
    ? active.defensivePlan
    : null;
  const previousPressurePlan = previousPlan?.carrierId === carrier.id ? previousPlan : null;
  const reservedDeepestMarkerId = previousPlan?.deepestMarkerId ?? null;
  const availablePressureCandidates = pressureCandidates.filter(({ player }) => player.id !== reservedDeepestMarkerId);
  const pressurePool = availablePressureCandidates.length > 0 ? availablePressureCandidates : pressureCandidates;
  const previousPrimary = previousPressurePlan?.primaryPresserId
    ? pressurePool.find(({ player }) => player.id === previousPressurePlan.primaryPresserId)
    : null;
  const forwardPressCandidate = distanceFromOwnGoal > 42
    ? pressurePool
        .filter(({ player }) => player.line === "forward" && player.pos.distanceTo(carrier.pos) < 48)
        .sort((a, b) => a.player.pos.distanceTo(carrier.pos) - b.player.pos.distanceTo(carrier.pos))[0]
    : null;
  const bestPrimary = forwardPressCandidate ?? pressurePool[0];
  const keepPreviousPrimary = Boolean(
    previousPrimary
    && active.defensivePlanTimer > 0
    && previousPrimary.score <= bestPrimary.score + 5.2,
  );
  const primaryPresserId = (keepPreviousPrimary ? previousPrimary : bestPrimary)?.player.id ?? null;

  const towardGoal = carrier.vel.clone().setY(0).dot(new THREE.Vector3(0, 0, ownZ).sub(carrier.pos).setY(0).normalize()) > 0.2;
  const emergencyCover = distanceFromOwnGoal < 50
    || Boolean(forwardPressCandidate && distanceFromOwnGoal > 42)
    || (carrier.controlledBy === "p1" && carrier.carryTimer > 0.45 && (carrier.vel.length() < 1 || towardGoal));
  const coverCandidates = pressureCandidates.filter(({ player }) => (
    player.id !== primaryPresserId && player.id !== reservedDeepestMarkerId
  ));
  const previousCover = previousPressurePlan?.secondaryCoverId
    ? coverCandidates.find(({ player }) => player.id === previousPressurePlan.secondaryCoverId)
    : null;
  const bestCover = [...coverCandidates].sort((a, b) => {
    const supportBias = distanceFromOwnGoal > 40
      ? (a.player.line === "midfielder" ? -5.5 : a.player.line === "defender" ? 5.5 : 0)
        - (b.player.line === "midfielder" ? -5.5 : b.player.line === "defender" ? 5.5 : 0)
      : 0;
    return supportBias || a.score - b.score;
  })[0];
  const keepPreviousCover = Boolean(
    emergencyCover
    && previousCover
    && active.defensivePlanTimer > 0
    && (!bestCover || previousCover.score <= bestCover.score + 5.8),
  );
  const secondaryCoverId = emergencyCover
    ? (keepPreviousCover ? previousCover : bestCover)?.player.id ?? null
    : null;
  if (!previousPressurePlan || !keepPreviousPrimary || (emergencyCover && !keepPreviousCover)) {
    active.defensivePlanTimer = 0.48;
  }

  const roles = new Map<string, DefensiveTacticalRole>();
  const targets = new Map<string, THREE.Vector3>();
  const markedOpponentIds = new Map<string, string>();
  const assignedDefenderIds = new Set<string>();
  if (primaryPresserId) {
    roles.set(primaryPresserId, "press");
    assignedDefenderIds.add(primaryPresserId);
  }
  if (secondaryCoverId) {
    roles.set(secondaryCoverId, "cover");
    assignedDefenderIds.add(secondaryCoverId);
  }

  const ownGoal = new THREE.Vector3(0, 0, ownZ);
  const toGoal = ownGoal.clone().sub(carrier.pos).setY(0);
  if (toGoal.lengthSq() < 0.05) toGoal.set(0, 0, -Math.sign(attackingGoalZ(defendingTeam, active.half)));
  toGoal.normalize();
  const sideAxis = new THREE.Vector3(-toGoal.z, 0, toGoal.x);
  const primary = defenders.find((player) => player.id === primaryPresserId);
  if (primary) {
    const primaryTarget = defensiveJockeyTarget(primary, active, carrier, 0);
    const maxDepth = depthCeilingFor(primary);
    targets.set(primary.id, clampDefensiveTargetDepth(primaryTarget, ownZ, defendingAttackSign, maxDepth));
  }
  const cover = defenders.find((player) => player.id === secondaryCoverId);
  if (cover) {
    const side = Math.sign(cover.home.x - carrier.pos.x || cover.home.x || cover.number % 2 === 0 ? 1 : -1);
    const coverTarget = carrier.pos.clone().add(toGoal.clone().multiplyScalar(8.4)).add(sideAxis.clone().multiplyScalar(side * 5.8)).setY(0);
    const maxDepth = depthCeilingFor(cover);
    targets.set(
      cover.id,
      clampDefensiveTargetDepth(coverTarget, ownZ, defendingAttackSign, maxDepth),
    );
  }

  const attackers = active.players.filter((player) => (
    player.team === carrier.team && player.role !== "keeper" && !player.sentOff
  ));
  const threats = [...attackers].sort((a, b) => (
    defensiveThreatScore(b, carrier, active, defendingTeam)
    - defensiveThreatScore(a, carrier, active, defendingTeam)
  ));
  const centralForwards = attackers.filter((player) => (
    player.line === "forward" && Math.abs(player.pos.x) < GOAL_W * 2.4
  ));
  const rawDeepestThreat = [...(centralForwards.length > 0 ? centralForwards : attackers)]
    .sort((a, b) => (
      a.pos.distanceTo(ownGoal) + Math.abs(a.pos.x) * 0.16
      - (b.pos.distanceTo(ownGoal) + Math.abs(b.pos.x) * 0.16)
    ))[0] ?? carrier;
  const previousDeepestThreat = previousPlan?.deepestThreatId
    ? attackers.find((player) => player.id === previousPlan.deepestThreatId) ?? null
    : null;
  const retainPreviousDeepest = Boolean(
    previousDeepestThreat
    && previousPlan?.deepestMarkerId
    && previousDeepestThreat.pos.distanceTo(ownGoal) <= rawDeepestThreat.pos.distanceTo(ownGoal) + 4.8
    && defensiveThreatScore(previousDeepestThreat, carrier, active, defendingTeam)
      >= defensiveThreatScore(rawDeepestThreat, carrier, active, defendingTeam) - 10,
  );
  const deepestThreat = retainPreviousDeepest ? previousDeepestThreat! : rawDeepestThreat;

  const availableMarkers = () => defenders.filter((player) => !assignedDefenderIds.has(player.id));
  const assignMarker = (threat: PlayerBody, deepest = false) => {
    const markTarget = goalSideMarkTarget(threat, carrier, ownGoal, dangerPhase);
    const previousMarkerId = previousPlan?.deepestThreatId === threat.id
      ? previousPlan.deepestMarkerId
      : [...(previousPlan?.markedOpponentIds.entries() ?? [])]
          .find(([, targetId]) => targetId === threat.id)?.[0] ?? null;
    const candidates = availableMarkers();
    const marker = candidates
      .map((player) => ({
        player,
        cost: markerAssignmentCost(player, threat, markTarget, previousMarkerId),
      }))
      .sort((a, b) => a.cost - b.cost)[0]?.player ?? null;
    if (!marker) return null;
    assignedDefenderIds.add(marker.id);
    markedOpponentIds.set(marker.id, threat.id);
    roles.set(marker.id, deepest ? "mark-striker" : "mark-runner");
    const maxDepth = depthCeilingFor(marker);
    targets.set(marker.id, clampDefensiveTargetDepth(markTarget, ownZ, defendingAttackSign, maxDepth));
    return marker;
  };

  const deepestMarker = assignMarker(deepestThreat, true);
  const additionalThreatLimit = dangerPhase === "EMERGENCY_GOAL_DEFENSE" ? 4 : dangerPhase === "DEEP_BLOCK" ? 3 : 2;
  threats
    .filter((threat) => threat.id !== deepestThreat.id && threat.id !== carrier.id)
    .filter((threat) => (
      threat.line === "forward"
      || (threat.line === "midfielder" && threat.pos.distanceTo(ownGoal) < (dangerPhase === "NORMAL_BLOCK" ? 66 : 52))
    ))
    .slice(0, additionalThreatLimit)
    .forEach((threat) => assignMarker(threat));

  const laneThreats = threats.filter((threat) => threat.id !== carrier.id);
  const alreadyCoveredThreats = new Set(markedOpponentIds.values());
  const unclaimedZoneThreats = laneThreats.filter((threat) => !alreadyCoveredThreats.has(threat.id));
  const occupiedTargets = [...targets.values()].map((target) => target.clone());
  const remainingPlayers = defenders
    .filter((player) => !assignedDefenderIds.has(player.id))
    .sort((a, b) => {
      const lineOrder = (line: PlayerLine) => line === "midfielder" ? 0 : line === "defender" ? 1 : 2;
      return lineOrder(a.line) - lineOrder(b.line) || Math.abs(a.home.x) - Math.abs(b.home.x);
    });

  remainingPlayers.forEach((player, index) => {
    const base = baseDefensiveShapeTarget(player, active, carrier, dangerPhase);
    const claimedZoneThreat = unclaimedZoneThreats.shift() ?? null;
    const responsibleThreat = claimedZoneThreat ?? laneThreats[index % Math.max(1, laneThreats.length)] ?? deepestThreat;
    if (claimedZoneThreat) markedOpponentIds.set(player.id, claimedZoneThreat.id);
    let role: DefensiveTacticalRole;
    let target = base.clone();
    if (player.line === "midfielder") {
      const lanePoint = carrier.pos.clone().lerp(responsibleThreat.pos, 0.58).setY(0);
      const laneGoalSide = ownGoal.clone().sub(responsibleThreat.pos).setY(0);
      if (laneGoalSide.lengthSq() > 0.05) lanePoint.add(laneGoalSide.normalize().multiplyScalar(1.6));
      target = lanePoint.lerp(base, dangerPhase === "NORMAL_BLOCK" ? 0.28 : 0.16);
      role = index === 0 ? "midfield-screen" : "block-lane";
    } else if (player.line === "defender") {
      const fullback = ["LB", "RB", "LWB", "RWB"].includes(player.formationSlot);
      const farSide = Math.sign(player.home.x || player.pos.x || 1) !== Math.sign(carrier.pos.x || 1);
      if (fullback && farSide) {
        role = "far-post-cover";
        target.x = clamp(-Math.sign(carrier.pos.x || 1) * GOAL_W * 0.62, -GOAL_W, GOAL_W);
      } else if (fullback) {
        role = "wide-cover";
        target.x = clamp(carrier.pos.x * 0.54 + player.home.x * 0.28, -GOAL_W * 1.5, GOAL_W * 1.5);
      } else {
        role = "depth-cover";
        target.x = clamp(player.home.x * 0.42 + carrier.pos.x * 0.14, -GOAL_W * 0.78, GOAL_W * 0.78);
      }
    } else {
      role = "block-lane";
      target = carrier.pos.clone().lerp(responsibleThreat.pos, 0.42).lerp(base, 0.34).setY(0);
    }

    const minimumCarrierGap = dangerPhase === "EMERGENCY_GOAL_DEFENSE"
      ? player.line === "defender" ? 6.2 : player.line === "midfielder" ? 8 : 11
      : dangerPhase === "DEEP_BLOCK"
        ? player.line === "defender" ? 9 : player.line === "midfielder" ? 11 : 14
        : player.line === "defender" ? 13 : player.line === "midfielder" ? 15 : 18;
    if (target.distanceTo(carrier.pos) < minimumCarrierGap) {
      const laneSide = Math.sign(player.home.x || player.pos.x || (player.number % 2 === 0 ? 1 : -1));
      target = carrier.pos
        .clone()
        .add(toGoal.clone().multiplyScalar(minimumCarrierGap))
        .add(sideAxis.clone().multiplyScalar(laneSide * (player.line === "defender" ? 4.8 : 7)));
    }
    clampDefensiveTargetDepth(target, ownZ, defendingAttackSign, depthCeilingFor(player));
    occupiedTargets.forEach((occupied, occupiedIndex) => {
      const gap = target.distanceTo(occupied);
      if (gap >= 5.8) return;
      const direction = Math.sign(player.home.x || player.number % 2 === 0 ? 1 : -1) * (occupiedIndex % 2 === 0 ? 1 : -1);
      target.add(sideAxis.clone().multiplyScalar(direction * Math.min(3.2, 5.8 - gap + 0.7)));
    });
    target.x = clamp(target.x, -FIELD_W / 2 + 4, FIELD_W / 2 - 4);
    target.z = clamp(target.z, -FIELD_L / 2 + 5, FIELD_L / 2 - 5);
    target.y = 0;
    roles.set(player.id, role);
    targets.set(player.id, target);
    assignedDefenderIds.add(player.id);
    occupiedTargets.push(target.clone());
  });

  const plan: DefensiveTeamPlan = {
    defendingTeam,
    carrierId: carrier.id,
    dangerPhase,
    primaryPresserId,
    secondaryCoverId,
    deepestThreatId: deepestThreat.id,
    deepestMarkerId: deepestMarker?.id ?? null,
    roles,
    targets,
    markedOpponentIds,
  };
  active.defensivePlan = plan;
  enforceAntiSwarmInvariant(active, carrier, plan);
}

function enforceAntiSwarmInvariant(active: MatchRuntime, carrier: PlayerBody, plan: DefensiveTeamPlan) {
  const allowed = new Set([
    plan.primaryPresserId,
    plan.deepestMarkerId ?? plan.secondaryCoverId,
  ].filter((id): id is string => Boolean(id)));
  const nearby = active.players
    .filter((player) => (
      player.team === plan.defendingTeam
      && player.role !== "keeper"
      && !player.sentOff
      && !isManualControlledPlayer(player, active)
      && player.pos.distanceTo(carrier.pos) < 10.5
    ))
    .sort((a, b) => a.pos.distanceTo(carrier.pos) - b.pos.distanceTo(carrier.pos));
  const extras = nearby.filter((player) => !allowed.has(player.id));
  if (extras.length === 0) return;

  const ownGoal = new THREE.Vector3(0, 0, teamGoalZ(plan.defendingTeam, active.half));
  const goalSide = ownGoal.clone().sub(carrier.pos).setY(0);
  if (goalSide.lengthSq() < 0.05) goalSide.set(0, 0, -Math.sign(attackingGoalZ(plan.defendingTeam, active.half)));
  goalSide.normalize();
  const sideAxis = new THREE.Vector3(-goalSide.z, 0, goalSide.x);
  extras.forEach((player) => {
    const side = Math.sign(player.home.x || player.pos.x || (player.number % 2 === 0 ? 1 : -1));
    const retreat = plan.dangerPhase === "EMERGENCY_GOAL_DEFENSE"
      ? player.line === "defender" ? 6 : player.line === "midfielder" ? 8.5 : 11
      : player.line === "defender" ? 12 : player.line === "midfielder" ? 15 : 18;
    const spread = player.line === "defender" ? 6 : player.line === "midfielder" ? 9 : 12;
    const escape = carrier.pos
      .clone()
      .add(goalSide.clone().multiplyScalar(retreat))
      .add(sideAxis.clone().multiplyScalar(side * spread * (1 + (player.number % 3) * 0.28)))
      .setY(0);
    escape.x = clamp(escape.x, -FIELD_W / 2 + 4, FIELD_W / 2 - 4);
    escape.z = clamp(escape.z, -FIELD_L / 2 + 5, FIELD_L / 2 - 5);
    plan.roles.set(player.id, player.line === "defender" ? "depth-cover" : "block-lane");
    plan.targets.set(player.id, escape);
    player.forcedMoveTimer = 0;
    player.forcedMoveSprint = false;
    const towardCarrier = carrier.pos.clone().sub(player.pos).setY(0);
    if (towardCarrier.lengthSq() > 0.05) {
      towardCarrier.normalize();
      const inwardVelocity = player.vel.dot(towardCarrier);
      const cachedClosing = player.aiInputCache.dir.dot(towardCarrier) > 0.1;
      if (inwardVelocity > 0) player.vel.addScaledVector(towardCarrier, -inwardVelocity);
      const escapeDirection = escape.clone().sub(player.pos).setY(0);
      const escapeDistance = escapeDirection.length();
      player.aiInputCache.dir.copy(escapeDirection.lengthSq() > 0.05 ? escapeDirection.normalize() : new THREE.Vector3());
      player.aiInputCache.sprint = escapeDistance > 8;
      player.aiInputCache.speedScale = 0.9;
      if (inwardVelocity > 0.05 || cachedClosing) active.antiSwarmCorrections += 1;
    }
    player.aiInputTimer = 0;
  });
}

function enforceDefensiveRuntimeGuard(active: MatchRuntime, dt: number) {
  const plan = active.defensivePlan;
  if (!plan || active.phase !== "open") return;
  const owner = ballOwner(active);
  const carrier = owner?.id === plan.carrierId
    ? owner
    : active.defensivePlanGraceTimer > 0
      ? active.players.find((player) => player.id === plan.carrierId) ?? null
      : null;
  if (!carrier) return;

  const allowed = new Set([
    plan.primaryPresserId,
    plan.deepestMarkerId ?? plan.secondaryCoverId,
  ].filter((id): id is string => Boolean(id)));
  const extras = active.players.filter((player) => {
    if (
      player.team !== plan.defendingTeam
      || player.role === "keeper"
      || player.sentOff
      || allowed.has(player.id)
      || isManualControlledPlayer(player, active)
    ) return false;
    const towardCarrier = carrier.pos.clone().sub(player.pos).setY(0);
    const distance = towardCarrier.length();
    if (distance <= 0.05) return true;
    towardCarrier.normalize();
    const movingInward = player.vel.dot(towardCarrier) > 0.18;
    const cachedChase = player.aiInputCache.dir.dot(towardCarrier) > 0.16;
    return distance < 10.5 || (distance < 15.5 && (movingInward || cachedChase));
  });
  if (extras.length === 0) return;

  const ownGoal = new THREE.Vector3(0, 0, teamGoalZ(plan.defendingTeam, active.half));
  const goalSide = ownGoal.clone().sub(carrier.pos).setY(0);
  if (goalSide.lengthSq() < 0.05) goalSide.set(0, 0, -Math.sign(attackingGoalZ(plan.defendingTeam, active.half)));
  goalSide.normalize();
  const sideAxis = new THREE.Vector3(-goalSide.z, 0, goalSide.x);

  extras.forEach((player) => {
    const towardCarrier = carrier.pos.clone().sub(player.pos).setY(0);
    const distance = towardCarrier.length();
    if (towardCarrier.lengthSq() > 0.05) {
      towardCarrier.normalize();
      const inwardVelocity = player.vel.dot(towardCarrier);
      if (inwardVelocity > 0) player.vel.addScaledVector(towardCarrier, -inwardVelocity);
    }

    let escape = plan.targets.get(player.id)?.clone();
    const minimumPlanGap = plan.dangerPhase === "EMERGENCY_GOAL_DEFENSE" ? 5.2 : plan.dangerPhase === "DEEP_BLOCK" ? 8.2 : 12.5;
    if (!escape || escape.distanceTo(carrier.pos) < minimumPlanGap) {
      const side = Math.sign(player.home.x || player.pos.x || (player.number % 2 === 0 ? 1 : -1));
      const depth = plan.dangerPhase === "EMERGENCY_GOAL_DEFENSE"
        ? player.line === "defender" ? 6 : player.line === "midfielder" ? 8.5 : 11
        : player.line === "defender" ? 13 : player.line === "midfielder" ? 16 : 19;
      const width = player.line === "defender" ? 6 : player.line === "midfielder" ? 9 : 12;
      escape = carrier.pos
        .clone()
        .add(goalSide.clone().multiplyScalar(depth))
        .add(sideAxis.clone().multiplyScalar(side * width * (1 + (player.number % 3) * 0.22)))
        .setY(0);
      escape.x = clamp(escape.x, -FIELD_W / 2 + 4, FIELD_W / 2 - 4);
      escape.z = clamp(escape.z, -FIELD_L / 2 + 5, FIELD_L / 2 - 5);
      plan.targets.set(player.id, escape.clone());
    }

    const escapeDirection = escape.sub(player.pos).setY(0);
    if (escapeDirection.lengthSq() > 0.05) {
      escapeDirection.normalize();
      const towardCarrier = carrier.pos.clone().sub(player.pos).setY(0);
      if (towardCarrier.lengthSq() > 0.05) {
        towardCarrier.normalize();
        const inwardIntent = escapeDirection.dot(towardCarrier);
        if (inwardIntent > 0) {
          escapeDirection.addScaledVector(towardCarrier, -inwardIntent);
          if (escapeDirection.lengthSq() < 0.05) escapeDirection.copy(towardCarrier).multiplyScalar(-1);
          escapeDirection.normalize();
        }
      }
      player.vel.addScaledVector(escapeDirection, Math.min(5.5, 18 * dt));
      player.aiInputCache.dir.copy(escapeDirection);
      player.aiInputCache.sprint = distance < 10.5;
      player.aiInputCache.speedScale = 0.92;
      player.aiInputTimer = Math.max(player.aiInputTimer, 0.08);
      const faceCarrier = carrier.pos.clone().sub(player.pos).setY(0);
      if (faceCarrier.lengthSq() > 0.05) setPlayerHeading(player, headingFromDirection(faceCarrier), dt, 13.5);
    }
    active.antiSwarmCorrections += 1;
  });
}

function defensivePressureRoleForPlayer(
  player: PlayerBody,
  active: MatchRuntime,
  carrier: PlayerBody,
): { role: DefensivePressureRole; rank: number } {
  const plan = active.defensivePlan;
  if (!plan || plan.carrierId !== carrier.id || plan.defendingTeam !== player.team) return { role: "shape", rank: -1 };
  if (plan.primaryPresserId === player.id) return { role: "press", rank: 0 };
  if (plan.secondaryCoverId === player.id) return { role: "cover", rank: 1 };
  return { role: "shape", rank: 2 };
}

function defensiveTeamInput(player: PlayerBody, active: MatchRuntime, carrier: PlayerBody) {
  const plan = active.defensivePlan;
  const role = plan?.roles.get(player.id) ?? "shape";
  const target = plan?.targets.get(player.id)?.clone() ?? baseDefensiveShapeTarget(player, active, carrier, plan?.dangerPhase);
  const stableMarker = role === "mark-striker" || role === "mark-runner";
  const carrierDistance = player.pos.distanceTo(carrier.pos);
  if (role === "press") {
    const ballPoint = controlledBallPoint(carrier);
    const toBall = ballPoint.clone().sub(player.pos).setY(0);
    const ballDistance = toBall.length();
    const validOpportunity = player.decisionCooldown <= 0 && shouldStepInToTackle(player, carrier, active);
    if (validOpportunity && player.challengeCommitTimer <= 0) {
      player.challengeCommitTimer = carrier.vel.length() < 0.85 ? 0.46 : 0.34;
    }
    if (player.challengeCommitTimer > 0) {
      const ownerToDefender = player.pos.clone().sub(carrier.pos).setY(0);
      const fromBehind = ownerToDefender.lengthSq() > 0.05 && facingDirection(carrier).dot(ownerToDefender.normalize()) < -0.5;
      const losingAngle = toBall.lengthSq() > 0.05 && facingDirection(player).dot(toBall.clone().normalize()) < -0.15;
      if (fromBehind || losingAngle || ballDistance > 4.2) {
        player.challengeCommitTimer = 0;
      } else {
        target.copy(ballPoint);
        if (ballDistance <= playerBallContactRadius(player, active.ballPos.y) + 0.28) {
          setPlayerHeading(player, headingFromDirection(toBall), 1 / 60, 20);
          attemptTackle(player, active);
          player.challengeCommitTimer = 0;
          player.decisionCooldown = 0.34;
        }
      }
    }
    if (player.challengeCommitTimer <= 0) {
      target.copy(defensiveJockeyTarget(player, active, carrier, 0));
    }
  } else {
    player.challengeCommitTimer = 0;
    if (!stableMarker) addOrganicVariation(player, target, active);
  }
  if (player.challengeCommitTimer <= 0 && !stableMarker) steerAroundPlayers(player, active.players, target);
  if (role === "press" && player.challengeCommitTimer <= 0) {
    enforcePrimaryGoalSideContainment(target, carrier, teamGoalZ(player.team, active.half));
  }
  const direction = target.sub(player.pos).setY(0);
  const ownGoalDistance = Math.abs(carrier.pos.z - teamGoalZ(player.team, active.half));
  const emergencyRecovery = plan?.dangerPhase === "EMERGENCY_GOAL_DEFENSE" && direction.length() > 2.8;
  const recoveryRun = (player.line === "defender" && ownGoalDistance < 48 && direction.length() > 4.5) || emergencyRecovery;
  const sprint = role === "press"
    ? carrierDistance > 5.2
    : role === "cover"
      ? direction.length() > 5.5
      : recoveryRun || direction.length() > (player.line === "midfielder" ? 7 : 9);
  const speedScale = role === "press" && player.challengeCommitTimer > 0
    ? 1
    : role === "press" && carrierDistance < 5.4
      ? 0.72
    : role === "cover"
      ? 0.96
      : recoveryRun
        ? 1
        : player.line === "defender" ? 0.94 : 0.9;
  return {
    dir: direction.lengthSq() > 0.08 ? direction.normalize() : direction.set(0, 0, 0),
    sprint,
    speedScale,
  };
}

function keepNonPressurePlayersOutOfDogpile(
  player: PlayerBody,
  target: THREE.Vector3,
  carrier: PlayerBody | null,
  role: DefensivePressureRole,
  active: MatchRuntime,
) {
  if (!carrier || player.team === carrier.team || player.role === "keeper" || role !== "shape") return;
  const ownZ = teamGoalZ(player.team, active.half);
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const carrierToTarget = target.clone().sub(carrier.pos).setY(0);
  const minTargetGap = player.line === "defender" ? 8.5 : player.line === "midfielder" ? 10.5 : 12.5;
  if (carrierToTarget.length() < minTargetGap) {
    const laneSide = Math.sign(player.home.x || player.pos.x || (player.number % 2 === 0 ? 1 : -1));
    const goalSide = new THREE.Vector3(0, 0, ownZ).sub(carrier.pos).setY(0);
    if (goalSide.lengthSq() < 0.05) goalSide.set(0, 0, -attackSign);
    goalSide.normalize();
    const sideAxis = new THREE.Vector3(-goalSide.z, 0, goalSide.x);
    const spacingTarget = carrier.pos
      .clone()
      .add(goalSide.multiplyScalar(player.line === "forward" ? 14 : player.line === "midfielder" ? 11 : 8.5))
      .add(sideAxis.multiplyScalar(laneSide * (player.line === "forward" ? 12 : player.line === "midfielder" ? 8 : 5.5)))
      .setY(0);
    target.lerp(spacingTarget, player.line === "forward" ? 0.82 : player.line === "midfielder" ? 0.72 : 0.58);
  }
  const currentGap = player.pos.distanceTo(carrier.pos);
  if (currentGap < minTargetGap * 0.72) {
    const away = player.pos.clone().sub(carrier.pos).setY(0);
    if (away.lengthSq() < 0.05) away.set(Math.sign(player.home.x || 1), 0, -attackSign * 0.4);
    target.add(away.normalize().multiplyScalar(minTargetGap * 0.72 - currentGap + 1.8));
  }
  target.x = clamp(target.x, -FIELD_W / 2 + 3, FIELD_W / 2 - 3);
  target.z = clamp(target.z, -FIELD_L / 2 + 4, FIELD_L / 2 - 4);
}

function keepFormationRoam(player: PlayerBody, target: THREE.Vector3, pressing: boolean, teamHasBall = false, opponentHasBall = false) {
  if (player.role === "keeper") return;
  const roam = pressing
    ? 32
    : player.line === "defender"
      ? teamHasBall
        ? 43
        : opponentHasBall
          ? 68
          : 31
      : player.line === "midfielder"
        ? opponentHasBall ? 54 : teamHasBall ? 46 : 31
        : 36;
  const offset = target.clone().sub(player.home);
  if (offset.length() > roam) target.copy(player.home).add(offset.normalize().multiplyScalar(roam));
}

function steerAroundPlayers(player: PlayerBody, players: PlayerBody[], target: THREE.Vector3) {
  players.forEach((other) => {
    if (other.id === player.id) return;
    const delta = new THREE.Vector3(player.pos.x - other.pos.x, 0, player.pos.z - other.pos.z);
    const distance = delta.length();
    if (distance > 0.001 && distance < PERSONAL_SPACE * 2.2) {
      target.add(delta.multiplyScalar((PERSONAL_SPACE * 2.2 - distance) / distance * 0.9));
    }
  });
  target.x = clamp(target.x, -FIELD_W / 2 + 2, FIELD_W / 2 - 2);
  target.z = clamp(target.z, -FIELD_L / 2 + 2, FIELD_L / 2 - 2);
}

function ballOwner(active: MatchRuntime) {
  return active.ballOwnerId ? active.players.find((player) => player.id === active.ballOwnerId) ?? null : null;
}

function facingDirection(player: PlayerBody) {
  return new THREE.Vector3(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y)).normalize();
}

function dribbleDirection(player: PlayerBody) {
  const movement = player.vel.clone().setY(0);
  if (movement.lengthSq() > 0.18) return movement.normalize();
  return facingDirection(player);
}

function controlledBallPoint(player: PlayerBody) {
  const forward = dribbleDirection(player);
  if (forward.lengthSq() < 0.1) forward.set(0, 0, Math.sign(player.team === "home" ? -1 : 1));
  return player.pos.clone()
    .add(forward.multiplyScalar(DRIBBLE_DISTANCE))
    .add(new THREE.Vector3(player.number % 2 === 0 ? 0.08 : -0.08, BALL_RADIUS, 0));
}

function releasePossession(active: MatchRuntime, ballState: BallState) {
  const previousOwner = active.ballOwnerId ? active.players.find((player) => player.id === active.ballOwnerId) : null;
  active.ballState = ballState;
  active.ballOwnerId = null;
  active.renderer.domElement.dataset.ballOwner = "";
  active.possession = null;
  active.possessionStableOwnerId = null;
  active.possessionStabilityTimer = 0;
  active.receptionLockPlayerId = null;
  active.receptionLockTimer = 0;
  if (ballState !== "kicked") {
    active.intendedReceiverId = null;
    active.manualPassReceiverId = null;
  }
  if (active.p1Autopilot && ballState === "loose" && previousOwner?.team === "home") {
    switchToClosestTeammateToBall(active, "home", "p1");
  }
}

function setControlledPlayer(active: MatchRuntime, player: PlayerBody, controller: "p1") {
  if (player.sentOff || player.role === "keeper") return false;
  active.players.forEach((candidate) => {
    const selected = candidate.id === player.id;
    if (selected) {
      candidate.controlledBy = controller;
    } else if (candidate.controlledBy === controller) {
      candidate.controlledBy = undefined;
    }
    if (candidate.controlMarker) candidate.controlMarker.visible = selected && active.state === "playing";
    if (!selected && candidate.aimArrow) candidate.aimArrow.visible = false;
  });
  player.recoveryTimer = 0;
  player.actionCooldown = Math.min(player.actionCooldown, 0.06);
  return true;
}

function switchToBestManualPlayer(active: MatchRuntime, controller: "p1") {
  const current = active.players.find((player) => player.controlledBy === controller);
  const team: TeamId = "home";
  const flatBall = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
  const next = active.players
    .filter((player) => player.team === team && player.role !== "keeper" && !player.sentOff && player.id !== current?.id)
    .map((player) => {
      const distance = player.pos.distanceTo(flatBall);
      const forwardBonus = Math.abs(attackingGoalZ(team, active.half) - player.pos.z) < Math.abs(attackingGoalZ(team, active.half) - flatBall.z) ? -1.4 : 0;
      return { player, score: distance + forwardBonus };
    })
    .sort((a, b) => a.score - b.score)[0]?.player;
  if (next) setControlledPlayer(active, next, controller);
}

function switchToClosestTeammateToBall(active: MatchRuntime, team: TeamId, controller: "p1") {
  const flatBall = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
  const next = active.players
    .filter((player) => player.team === team && player.role !== "keeper" && !player.sentOff)
    .sort((a, b) => a.pos.distanceTo(flatBall) - b.pos.distanceTo(flatBall))[0];
  if (next) setControlledPlayer(active, next, controller);
}

function autoSwitchToPossessor(active: MatchRuntime, player: PlayerBody) {
  if (player.sentOff) return;
  if (player.team === "home") {
    setControlledPlayer(active, player, "p1");
    return;
  }
  if (active.p1Autopilot) switchToClosestTeammateToBall(active, "home", "p1");
}

function updateUserAutoSwitch(active: MatchRuntime) {
  if (!active.p1Autopilot) return;
  if (active.phase !== "open") return;
  const owner = ballOwner(active);
  if (owner?.team === "home" && owner.role !== "keeper") {
    setControlledPlayer(active, owner, "p1");
    return;
  }
  if (owner?.team === "home") return;
  const current = active.players.find((player) => player.controlledBy === "p1");
  const flatBall = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
  const closest = active.players
    .filter((player) => player.team === "home" && player.role !== "keeper" && !player.sentOff)
    .sort((a, b) => a.pos.distanceTo(flatBall) - b.pos.distanceTo(flatBall))[0];
  if (!closest) return;
  const currentDistance = current ? current.pos.distanceTo(flatBall) : Infinity;
  const closestDistance = closest.pos.distanceTo(flatBall);
  if (!current || current.id !== closest.id && currentDistance > closestDistance + 1.4) {
    setControlledPlayer(active, closest, "p1");
  }
}

function setP1AutopilotMode(active: MatchRuntime, enabled: boolean) {
  active.p1Autopilot = enabled;
  active.p1IdleTimer = 0;
  active.shotCharge = 0;
  active.shotChargingPlayerId = null;
  active.passCharge = 0;
  active.passChargingPlayerId = null;
  active.shotConsumed = false;
  if (enabled) switchToClosestTeammateToBall(active, "home", "p1");
}

function keyboardAimDirection(active: MatchRuntime, keys?: Set<string>) {
  const keyboardDir = new THREE.Vector3();
  if (keys) {
    const axis = cameraRelativeAxis(active.camera);
    if (keys.has("ArrowUp")) keyboardDir.add(axis.up);
    if (keys.has("ArrowDown")) keyboardDir.sub(axis.up);
    if (keys.has("ArrowLeft")) keyboardDir.sub(axis.right);
    if (keys.has("ArrowRight")) keyboardDir.add(axis.right);
  }
  return keyboardDir.lengthSq() > 0.02 ? keyboardDir.normalize() : keyboardDir;
}

function currentAimDirection(player: PlayerBody, active: MatchRuntime, keys?: Set<string>) {
  const keyboardDir = keyboardAimDirection(active, keys);
  if (keyboardDir.lengthSq() > 0.02) {
    active.lastManualAim.copy(keyboardDir);
    active.lastManualAimTimer = 0.24;
    return keyboardDir;
  }
  if (player.controlledBy === "p1" && !active.p1Autopilot && active.lastManualAimTimer > 0 && active.lastManualAim.lengthSq() > 0.02) {
    return active.lastManualAim.clone().normalize();
  }
  if (player.controlledBy === "p1" && !active.p1Autopilot) return facingDirection(player);
  if (active.pendingKickTarget && player.pos.distanceTo(active.pendingKickTarget) > 0.4) {
    return active.pendingKickTarget.clone().sub(player.pos).setY(0).normalize();
  }
  return facingDirection(player);
}

function effectivePassCharge(rawCharge: number) {
  return clamp(0.5 + clamp(rawCharge, 0.08, 1) * 0.62, 0.5, 1.12);
}

function resolveManualPassAim(player: PlayerBody, active: MatchRuntime, keys: Set<string> | undefined, charge: number) {
  const rawAim = currentAimDirection(player, active, keys);
  const passDistance = clamp(18 + charge * 34, 20, 56);
  const receiver = manualAimReceiver(player, active, rawAim, passDistance);
  const target = player.pos.clone().add(rawAim.clone().multiplyScalar(passDistance)).setY(BALL_RADIUS);
  if (receiver) {
    target.lerp(kickTargetForStyle(player, active, receiver, "short"), 0.08);
  }
  target.x = clamp(target.x, -FIELD_W / 2 + 2, FIELD_W / 2 - 2);
  target.z = clamp(target.z, -FIELD_L / 2 + 2, FIELD_L / 2 - 2);
  const finalDirection = target.clone().sub(active.ballPos).setY(0);
  if (finalDirection.lengthSq() < 0.02) finalDirection.copy(rawAim);
  finalDirection.normalize();
  return { finalDirection, passDistance, rawAim, receiver, target };
}

function updateAimIndicators(active: MatchRuntime, keys: Set<string>) {
  let controlledCount = 0;
  let controlledPlayerId = "";
  let visibleMarkerCount = 0;
  const shownArrow = { x: Number.NaN, z: Number.NaN, length: 0 };
  const controlledMotion = { x: Number.NaN, z: Number.NaN, vx: 0, vz: 0 };
  active.players.forEach((player) => {
    const marker = player.controlMarker;
    const selected = player.controlledBy === "p1";
    if (selected) {
      controlledCount += 1;
      controlledPlayerId = player.id;
      controlledMotion.x = player.pos.x;
      controlledMotion.z = player.pos.z;
      controlledMotion.vx = player.vel.x;
      controlledMotion.vz = player.vel.z;
    }
    if (marker instanceof THREE.Mesh) {
      marker.visible = selected && active.state === "playing" && !player.sentOff;
      if (marker.visible) visibleMarkerCount += 1;
      const material = marker.material;
      if (selected && material instanceof THREE.MeshBasicMaterial) {
        material.color.set(active.p1Autopilot ? "#facc15" : "#ffffff");
        material.opacity = active.p1Autopilot ? 0.98 : 0.95;
      }
    }
    const arrow = player.aimArrow;
    if (!arrow) return;
    const visible = player.controlledBy === "p1" && active.ballOwnerId === player.id && active.state === "playing" && active.phase === "open" && !player.sentOff;
    arrow.visible = visible;
    if (!visible) return;
    const rawCharge = active.passChargingPlayerId === player.id ? active.passCharge : 0;
    const chargeProgress = active.passChargingPlayerId === player.id ? clamp(active.passCharge, 0, 1) : 0;
    const resolvedAim = resolveManualPassAim(player, active, keys, effectivePassCharge(rawCharge));
    arrow.rotation.y = headingFromDirection(resolvedAim.finalDirection) - player.heading;
    arrow.position.y = 0.24;
    arrow.scale.set(1 + chargeProgress * 0.16, 1, 1 + chargeProgress * 0.58);
    shownArrow.x = resolvedAim.finalDirection.x;
    shownArrow.z = resolvedAim.finalDirection.z;
    shownArrow.length = 2.92 * arrow.scale.z;
  });
  active.renderer.domElement.dataset.controlledPlayerCount = String(controlledCount);
  active.renderer.domElement.dataset.controlledPlayerId = controlledPlayerId;
  active.renderer.domElement.dataset.visibleControlMarkerCount = String(visibleMarkerCount);
  active.renderer.domElement.dataset.aimArrowX = Number.isFinite(shownArrow.x) ? shownArrow.x.toFixed(4) : "";
  active.renderer.domElement.dataset.aimArrowZ = Number.isFinite(shownArrow.z) ? shownArrow.z.toFixed(4) : "";
  active.renderer.domElement.dataset.aimArrowLength = shownArrow.length.toFixed(2);
  active.renderer.domElement.dataset.controlledPlayerX = Number.isFinite(controlledMotion.x) ? controlledMotion.x.toFixed(3) : "";
  active.renderer.domElement.dataset.controlledPlayerZ = Number.isFinite(controlledMotion.z) ? controlledMotion.z.toFixed(3) : "";
  active.renderer.domElement.dataset.controlledVelocityX = controlledMotion.vx.toFixed(3);
  active.renderer.domElement.dataset.controlledVelocityZ = controlledMotion.vz.toFixed(3);
}

function playerBallContactRadius(player: PlayerBody, ballHeight: number) {
  if (player.role === "keeper") return 0.9 + BALL_RADIUS;
  const bodyRadius = ballHeight > 1.72 ? 0.54 : FIELD_PLAYER_BALL_RADIUS;
  return bodyRadius + BALL_RADIUS;
}

function handleAutomaticSteals(active: MatchRuntime) {
  const owner = ballOwner(active);
  if (!owner || active.tackleLockTimer > 0 || active.restartProtectionTimer > 0 && active.restartProtectionTeam === owner.team) return;
  const plan = active.defensivePlan;
  const authorizedIds = plan && plan.carrierId === owner.id
    ? new Set([plan.primaryPresserId, plan.secondaryCoverId].filter((id): id is string => Boolean(id)))
    : null;
  const ownedBallPoint = controlledBallPoint(owner);
  const slowCarrier = owner.vel.length() < 0.85 && owner.carryTimer > 0.42;
  const challengers = active.players
    .filter((player) => (
      player.team !== owner.team
      && player.role !== "keeper"
      && !player.sentOff
      && player.tackleCooldown <= 0
      && player.recoveryTimer <= 0
      && (!authorizedIds || authorizedIds.has(player.id))
    ))
    .map((player) => ({ player, distance: player.pos.distanceTo(ownedBallPoint) }))
    .filter(({ distance }) => distance < (slowCarrier ? 3.05 : 1.95))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 2);
  challengers.forEach(({ player }) => {
    const toBall = ownedBallPoint.clone().sub(player.pos).setY(0);
    if (toBall.lengthSq() < 0.05) return;
    const ownerToTackler = player.pos.clone().sub(owner.pos).setY(0);
    const frontOrSide = ownerToTackler.lengthSq() > 0.05 && facingDirection(owner).dot(ownerToTackler.normalize()) >= (slowCarrier ? -0.7 : -0.35);
    const facingBall = facingDirection(player).dot(toBall.normalize()) > (slowCarrier ? 0.28 : 0.56);
    if (frontOrSide && facingBall) attemptTackle(player, active);
  });
}

function punishStationaryCarrier(active: MatchRuntime) {
  const owner = ballOwner(active);
  if (!owner || owner.team !== "home" || owner.controlledBy !== "p1" || active.p1Autopilot) return;
  if (owner.vel.length() > 0.62 || owner.carryTimer < 0.62 || active.tackleLockTimer > 0) return;
  if (active.restartProtectionTimer > 0 && active.restartProtectionTeam === owner.team) return;
  const plan = active.defensivePlan;
  if (!plan || plan.carrierId !== owner.id || plan.defendingTeam === owner.team) return;
  const ballPoint = controlledBallPoint(owner);
  const defensiveGoal = new THREE.Vector3(0, 0, teamGoalZ(opponent(owner.team), active.half));
  const challengerIds = [plan.primaryPresserId, plan.secondaryCoverId].filter((id): id is string => Boolean(id));
  const challengers = challengerIds
    .map((id) => active.players.find((player) => player.id === id))
    .filter((player): player is PlayerBody => Boolean(player && !player.sentOff && player.recoveryTimer <= 0.05))
    .map((player) => ({ player, distance: player.pos.distanceTo(ballPoint) }));
  challengers.forEach(({ player, distance }, index) => {
    if (active.ballOwnerId !== owner.id) return;
    const toBall = ballPoint.clone().sub(player.pos).setY(0);
    if (toBall.lengthSq() < 0.05) return;
    const ballDir = toBall.clone().normalize();
    const ownerToTackler = player.pos.clone().sub(owner.pos).setY(0);
    const frontOrSide = ownerToTackler.lengthSq() <= 0.05
      || facingDirection(owner).dot(ownerToTackler.normalize()) > -0.72;
    if (index === 0) {
      player.forcedMoveTarget.copy(defensiveJockeyTarget(player, active, owner, 0));
      player.forcedMoveTimer = Math.max(player.forcedMoveTimer, 0.24);
      player.forcedMoveSprint = distance > 6.2;
      if (distance < 2.95 && player.tackleCooldown <= 0 && frontOrSide && shouldStepInToTackle(player, owner, active)) {
        setPlayerHeading(player, headingFromDirection(ballDir), 1 / 60, 18);
        attemptTackle(player, active);
      }
    } else {
      const cutLane = owner.pos.clone().lerp(defensiveGoal, 0.32 + index * 0.08);
      cutLane.x += (index === 1 ? 1 : -1) * 4.2;
      player.forcedMoveTarget.copy(cutLane);
      player.forcedMoveTimer = Math.max(player.forcedMoveTimer, 0.2);
      player.forcedMoveSprint = distance > 7;
    }
  });
}

function blockStraightLineDribble(active: MatchRuntime) {
  const owner = ballOwner(active);
  if (!owner || owner.team !== "home" || owner.controlledBy !== "p1" || active.p1Autopilot || active.tackleLockTimer > 0) return;
  if (active.restartProtectionTimer > 0 && active.restartProtectionTeam === owner.team) return;
  const defendingTeam = opponent(owner.team);
  const plan = active.defensivePlan;
  if (!plan || plan.carrierId !== owner.id || plan.defendingTeam !== defendingTeam) return;
  const goalZ = teamGoalZ(defendingTeam, active.half);
  const toGoal = new THREE.Vector3(0, 0, goalZ).sub(owner.pos).setY(0);
  if (toGoal.lengthSq() < 0.1) return;
  const goalDir = toGoal.normalize();
  const ownerMove = owner.vel.clone().setY(0);
  const movingAtGoal = ownerMove.length() > 2.15 && ownerMove.normalize().dot(goalDir) > 0.58;
  const dangerRange = Math.abs(owner.pos.z - goalZ) < 54 && Math.abs(owner.pos.x) < GOAL_W * 2.8;
  if (!movingAtGoal || !dangerRange) return;

  const ballPoint = controlledBallPoint(owner);
  const sideAxis = new THREE.Vector3(-goalDir.z, 0, goalDir.x);
  const signedLane = Math.sign(owner.vel.clone().setY(0).dot(sideAxis) || owner.pos.x || 1);
  const defensiveWall = [plan.primaryPresserId, plan.secondaryCoverId]
    .filter((id): id is string => Boolean(id))
    .map((id) => active.players.find((player) => player.id === id))
    .filter((player): player is PlayerBody => Boolean(player && !player.sentOff && player.recoveryTimer <= 0.08))
    .map((player) => ({ player, distance: player.pos.distanceTo(owner.pos) }));

  defensiveWall.forEach(({ player, distance }, index) => {
    const aheadDistance = index === 0 ? 3.1 : index === 1 ? 5.4 : 7.2;
    const sideOffset = index === 0 ? 0 : index === 1 ? signedLane * 4.2 : index === 2 ? -signedLane * 4.2 : 0;
    const target = ballPoint
      .clone()
      .add(goalDir.clone().multiplyScalar(aheadDistance))
      .add(sideAxis.clone().multiplyScalar(sideOffset))
      .setY(0);
    target.x = clamp(target.x, -FIELD_W / 2 + 5, FIELD_W / 2 - 5);
    target.z = clamp(target.z, -FIELD_L / 2 + 5, FIELD_L / 2 - 5);

    player.forcedMoveTarget.copy(target);
    player.forcedMoveTimer = Math.max(player.forcedMoveTimer, 0.2);
    player.forcedMoveSprint = distance > 8.5;
    const toBall = ballPoint.clone().sub(player.pos).setY(0);
    if (distance < (index === 0 ? 4.0 : 3.0) && player.tackleCooldown <= 0 && shouldStepInToTackle(player, owner, active)) {
      const laneContact = distanceToSegment2D(player.pos, owner.pos, owner.pos.clone().add(goalDir.clone().multiplyScalar(7))) < (index === 0 ? 2.25 : 1.65);
      if (laneContact && toBall.lengthSq() > 0.06) {
        setPlayerHeading(player, headingFromDirection(toBall), 1 / 60, 18);
        attemptTackle(player, active);
      }
    }
  });
}

function updatePassRequestArms(active: MatchRuntime) {
  if (active.phase !== "open") return;
  const owner = ballOwner(active);
  if (!owner || owner.role === "keeper") return;
  active.players
    .filter((player) => player.team === owner.team && player.id !== owner.id && player.role !== "keeper" && !player.sentOff)
    .map((player) => {
      const distance = player.pos.distanceTo(owner.pos);
      const open = nearestOpponentDistance(player, active.players);
      const laneBlockers = opponentsBetween(owner, player.pos, active.players, 3.15);
      const forward = (player.pos.z - owner.pos.z) * Math.sign(attackingGoalZ(owner.team, active.half));
      const useful = distance > 8 && distance < 43 && open > 7.4 && laneBlockers === 0 && forward > -16;
      return { player, useful, score: open * 2.1 + clamp(forward, -8, 14) - Math.abs(distance - 22) * 0.35 };
    })
    .filter(({ useful }) => useful)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .forEach(({ player }) => {
      player.passRequestTimer = Math.max(player.passRequestTimer, 0.34);
    });
}

function distanceToSegment2D(point: THREE.Vector3, start: THREE.Vector3, end: THREE.Vector3) {
  const segment = end.clone().sub(start).setY(0);
  const lengthSq = segment.lengthSq();
  if (lengthSq < 0.001) return point.distanceTo(start);
  const t = clamp(point.clone().sub(start).setY(0).dot(segment) / lengthSq, 0, 1);
  return point.distanceTo(start.clone().add(segment.multiplyScalar(t)));
}

function handleFieldShotBlocks(active: MatchRuntime) {
  if (active.phase !== "open" || active.ballOwnerId || active.ballState !== "kicked") return;
  const ballSpeed = new THREE.Vector3(active.ballVel.x, 0, active.ballVel.z).length();
  if (ballSpeed < 12 || active.ballPos.y > 3.35) return;
  const defendingTeam = opponent(active.lastTouchTeam);
  const defendingGoalZ = teamGoalZ(defendingTeam, active.half);
  const movingAtDefendingGoal = Math.sign(active.ballVel.z || defendingGoalZ - active.ballPos.z) === Math.sign(defendingGoalZ - active.ballPos.z);
  if (!movingAtDefendingGoal) return;
  const ballNow = active.ballPos.clone().setY(0);
  const ballSoon = active.ballPos.clone().add(active.ballVel.clone().setY(0).multiplyScalar(0.18 + clamp(ballSpeed / 80, 0, 0.18))).setY(0);
  const blocker = active.players
    .filter((player) => player.team === defendingTeam && player.role !== "keeper" && !player.sentOff && player.recoveryTimer <= 0.12)
    .map((player) => {
      const laneDistance = distanceToSegment2D(player.pos, ballNow, ballSoon);
      const forwardContact = active.ballVel.clone().setY(0).normalize().dot(player.pos.clone().sub(ballNow).setY(0));
      const currentDistance = player.pos.distanceTo(ballNow);
      return { player, laneDistance, forwardContact, currentDistance };
    })
    .filter(({ laneDistance, forwardContact }) => laneDistance < (active.ballPos.y > 1.25 ? 1.48 : 1.16) && forwardContact > -0.2)
    .sort((a, b) => a.laneDistance - b.laneDistance)[0];
  if (!blocker) return;
  blocker.player.blockTimer = Math.max(blocker.player.blockTimer, 0.22);
  const visibleContactRadius = playerBallContactRadius(blocker.player, active.ballPos.y) + 0.08;
  if (blocker.currentDistance > visibleContactRadius) return;
  const blockingPlayer = blocker.player;
  const incomingDirection = active.ballVel.clone().setY(0).normalize();
  const lateralInterception = active.ballPos.y < 0.95
    && blockingPlayer.vel.length() > 2.2
    && Math.abs(facingDirection(blockingPlayer).dot(incomingDirection)) < 0.48;
  const awayFromGoal = new THREE.Vector3(
    Math.sign(active.ballPos.x - blockingPlayer.pos.x || blockingPlayer.home.x || 1) * 0.36,
    0,
    -Math.sign(defendingGoalZ) * 0.94,
  ).normalize();
  if (lateralInterception) blockingPlayer.tackleTimer = 0.48;
  else blockingPlayer.blockTimer = 0.48;
  blockingPlayer.recoveryTimer = Math.max(blockingPlayer.recoveryTimer, 0.2);
  blockingPlayer.decisionCooldown = Math.max(blockingPlayer.decisionCooldown, 0.24);
  setPlayerHeading(blockingPlayer, headingFromDirection(active.ballPos.clone().sub(blockingPlayer.pos).setY(0)), 1 / 60, 16);
  active.ballVel.copy(awayFromGoal.multiplyScalar(clamp(ballSpeed * 0.34, 4.5, 14)));
  active.ballVel.y = active.ballPos.y > 1.25 ? clamp(active.ballPos.y * 0.32, 0.7, 1.55) : 0.42;
  active.ballCurve.set(0, 0, 0);
  active.ballState = "loose";
  active.lastTouchTeam = blockingPlayer.team;
  active.lastTouchPlayerId = blockingPlayer.id;
  active.ballIgnorePlayerId = blockingPlayer.id;
  active.ballIgnoreTimer = 0.08;
  playKickSound(active, 0.72);
}

function playerScreenGaugePosition(active: MatchRuntime, player: PlayerBody) {
  const rect = active.renderer.domElement.getBoundingClientRect();
  const projected = player.pos.clone().add(new THREE.Vector3(0, 0.08, 0)).project(active.camera);
  return {
    x: rect.left + (projected.x * 0.5 + 0.5) * rect.width,
    y: rect.top + (-projected.y * 0.5 + 0.5) * rect.height + 22,
  };
}

function beginShotCharge(player: PlayerBody, active: MatchRuntime) {
  if (active.phase !== "open") return false;
  if (player.actionCooldown > 0 || player.kickTimer > 0.05) return false;
  if (active.ballOwnerId !== player.id) return false;
  active.lastShotTap = performance.now();
  active.passCharge = 0;
  active.passChargingPlayerId = null;
  active.shotCharge = 0;
  active.shotChargingPlayerId = player.id;
  active.shotConsumed = false;
  return true;
}

function releaseShotCharge(active: MatchRuntime, keys: Set<string>) {
  const player = active.shotChargingPlayerId
    ? active.players.find((item) => item.id === active.shotChargingPlayerId)
    : null;
  if (!player || active.shotConsumed || active.ballOwnerId !== player.id) {
    active.shotCharge = 0;
    active.shotChargingPlayerId = null;
    active.shotConsumed = false;
    return false;
  }
  const charge = clamp(active.shotCharge, 0.08, 1);
  const kicked = performChargedKick(player, active, charge, keys);
  active.shotCharge = 0;
  active.shotChargingPlayerId = null;
  active.shotConsumed = false;
  return kicked;
}

function beginPassCharge(player: PlayerBody, active: MatchRuntime) {
  if (active.phase !== "open") return false;
  if (player.actionCooldown > 0 || player.kickTimer > 0.05) return false;
  if (active.ballOwnerId !== player.id || player.team !== "home") return false;
  active.shotCharge = 0;
  active.shotChargingPlayerId = null;
  active.shotConsumed = false;
  active.passCharge = 0;
  active.passChargingPlayerId = player.id;
  return true;
}

function releasePassCharge(active: MatchRuntime, keys?: Set<string>) {
  const player = active.passChargingPlayerId
    ? active.players.find((item) => item.id === active.passChargingPlayerId)
    : null;
  if (!player || active.ballOwnerId !== player.id) {
    active.passCharge = 0;
    active.passChargingPlayerId = null;
    return false;
  }
  const charge = effectivePassCharge(active.passCharge);
  const resolvedAim = resolveManualPassAim(player, active, keys, charge);
  const hasDirectionalInput = Boolean(keys && (keys.has("ArrowUp") || keys.has("ArrowDown") || keys.has("ArrowLeft") || keys.has("ArrowRight")));
  const usedRecentArrow = !hasDirectionalInput && active.lastManualAimTimer > 0 && active.lastManualAim.lengthSq() > 0.02;
  active.renderer.domElement.dataset.lastInputAimX = resolvedAim.finalDirection.x.toFixed(4);
  active.renderer.domElement.dataset.lastInputAimZ = resolvedAim.finalDirection.z.toFixed(4);
  active.renderer.domElement.dataset.lastInputAimSource = hasDirectionalInput ? "arrows" : usedRecentArrow ? "recent-arrow" : "facing";
  active.pendingKickTarget = resolvedAim.target.clone();
  const kicked = kickTowardPoint(player, resolvedAim.target, active, "short", resolvedAim.receiver ?? undefined, charge);
  if (kicked) {
    active.ballPos.y = BALL_RADIUS;
    active.ballVel.y = 0;
    active.ballCurve.set(0, 0, 0);
  }
  active.passCharge = 0;
  active.passChargingPlayerId = null;
  return kicked;
}

function manualAimReceiver(player: PlayerBody, active: MatchRuntime, aim: THREE.Vector3, passDistance: number) {
  return active.players
    .filter((teammate) => teammate.team === player.team && teammate.id !== player.id && !teammate.sentOff)
    .map((teammate) => {
      const toTeammate = teammate.pos.clone().sub(player.pos).setY(0);
      const distance = toTeammate.length();
      const alignment = distance > 0.1 ? aim.dot(toTeammate.normalize()) : -1;
      const lateralMiss = distanceToSegment2D(teammate.pos, player.pos, player.pos.clone().add(aim.clone().multiplyScalar(passDistance)));
      return { teammate, distance, alignment, lateralMiss };
    })
    .filter(({ teammate, distance, alignment, lateralMiss }) => (
      distance > 4
      && distance < passDistance + 8
      && alignment > 0.88
      && lateralMiss < 5.8
      && opponentsBetween(player, teammate.pos, active.players, 2.8) === 0
    ))
    .sort((a, b) => b.alignment - a.alignment || a.lateralMiss - b.lateralMiss || a.distance - b.distance)[0]?.teammate ?? null;
}

function tacticalChargeForKick(style: KickStyle, distance: number) {
  const distanceBoost = clamp((distance - 12) / 52, 0, 0.22);
  if (style === "short") return clamp(0.62 + distanceBoost, 0.62, 0.88);
  if (style === "low-through") return clamp(0.62 + distanceBoost, 0.62, 0.82);
  if (style === "through") return clamp(0.68 + distanceBoost, 0.68, 0.9);
  if (style === "long") return clamp(0.68 + distanceBoost, 0.68, 0.88);
  if (style === "chip") return clamp(0.66 + distanceBoost, 0.66, 0.86);
  return clamp(0.78 + distanceBoost, 0.78, 1);
}

function sharedKickForce(style: KickStyle, distance: number, charge: number, ownsBall: boolean) {
  const normalized = clamp(charge, 0.08, 1.2);
  const possessionFactor = ownsBall ? 1 : 0.96;
  const basePower = clamp(14.5 + distance * 0.34, 18.5, 38.5);
  let power = style === "short"
    ? clamp(26.5 + distance * 0.58, 29, 49)
    : style === "low-through"
      ? clamp(21 + distance * 0.38, 23, 37)
      : style === "through"
        ? clamp(23.5 + distance * 0.43, 26, 42)
        : style === "long"
          ? clamp(24 + distance * 0.36, 28, 47)
          : style === "chip"
            ? clamp(22 + distance * 0.34, 26, 43)
          : style === "driven"
            ? clamp(basePower * 1.28, 26, 49)
            : style === "finesse"
              ? clamp(basePower * 1.08, 23, 39)
              : clamp(basePower * 1.18, 27, 60);
  const chargeFactor = style === "short"
    ? 0.96 + normalized * 0.34
    : style === "low-through"
      ? 0.95 + normalized * 0.28
      : style === "through"
        ? 0.96 + normalized * 0.34
        : style === "long"
          ? 0.92 + normalized * 0.3
          : style === "chip"
            ? 0.9 + normalized * 0.28
          : 0.9 + normalized * 0.55;
  const minPower = style === "short"
    ? 28
    : style === "low-through"
      ? 24
      : style === "through"
        ? 27
        : style === "long"
          ? 29
          : style === "chip"
            ? 27
          : style === "finesse"
            ? 24
            : 28;
  const maxPower = style === "short"
    ? 62
    : style === "low-through"
      ? 45
      : style === "through"
        ? 54
        : style === "long"
          ? 58
          : style === "chip"
            ? 46
          : style === "driven"
            ? 52
            : 62;
  power = clamp(power * chargeFactor * possessionFactor, minPower, maxPower);
  let lift = ballLiftForKick(style, distance);
  if (style === "short") lift = Math.max(lift, distance > 24 ? 0.65 : 0.25);
  if (style === "shot") lift = clamp(lift + normalized * 4.7, 3.1, 10.8);
  if (style === "finesse") lift = clamp(lift + normalized * 2.1, 2.6, 6.8);
  if (style === "driven") lift = Math.min(lift, 0.65);
  return { power, lift };
}

function safeGroundPassSpeed(player: PlayerBody, target: THREE.Vector3, active: MatchRuntime, distance: number) {
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const backward = (target.z - player.pos.z) * attackSign < -1.8;
  const distanceFloor = clamp(25 + distance * 0.38, 28, 45);
  return backward ? Math.max(31, distanceFloor) : distanceFloor;
}

function performChargedKick(player: PlayerBody, active: MatchRuntime, charge: number, keys?: Set<string>, preferredTarget?: PlayerBody | null) {
  const normalized = clamp(charge, 0.08, 1);
  const goalDistance = Math.abs(attackingGoalZ(player.team, active.half) - player.pos.z);
  const aim = currentAimDirection(player, active, keys);
  const hasDirectionalInput = Boolean(keys && (keys.has("ArrowUp") || keys.has("ArrowDown") || keys.has("ArrowLeft") || keys.has("ArrowRight")));
  const usedRecentArrow = !hasDirectionalInput && active.lastManualAimTimer > 0 && active.lastManualAim.lengthSq() > 0.02;
  active.renderer.domElement.dataset.lastInputAimX = aim.x.toFixed(4);
  active.renderer.domElement.dataset.lastInputAimZ = aim.z.toFixed(4);
  active.renderer.domElement.dataset.lastInputAimSource = hasDirectionalInput ? "arrows" : usedRecentArrow ? "recent-arrow" : "facing";
  const manualControlled = player.controlledBy === "p1" && !active.p1Autopilot;
  const goalDir = new THREE.Vector3(0, 0, attackingGoalZ(player.team, active.half)).sub(player.pos).setY(0).normalize();
  const aimedAtGoal = aim.dot(goalDir) > 0.34;
  const clearlyAimedAtGoal = aim.dot(goalDir) > 0.62;
  const passCandidate = preferredTarget ?? null;
  if (passCandidate) {
    const target = kickTargetForStyle(player, active, passCandidate, "short");
    active.pendingKickTarget = target.clone();
    return kickTowardPoint(player, target, active, "short", passCandidate, normalized);
  }
  const target = !manualControlled && active.pendingKickTarget
    ? active.pendingKickTarget.clone()
    : !manualControlled && normalized >= 0.62 && goalDistance < 42 && aimedAtGoal
      ? quickKickPoint(player, active)
      : player.pos.clone().add(aim.multiplyScalar(normalized < 0.58 ? 28 : hasDirectionalInput ? 68 : 56)).setY(BALL_RADIUS);
  const nearGoalFinish = goalDistance < 24 && aimedAtGoal;
  const style: KickStyle = normalized < 0.5
    ? nearGoalFinish ? "driven" : "short"
    : nearGoalFinish && clearlyAimedAtGoal && Math.abs(player.pos.x) > GOAL_W * 0.55 && normalized >= 0.58
      ? "finesse"
      : nearGoalFinish && normalized < 0.86
      ? "driven"
      : normalized < 0.72 ? "long" : normalized > 0.82 && aimedAtGoal && Math.abs(player.pos.x) > GOAL_W * 0.7 ? "finesse" : "shot";
  return kickTowardPoint(player, target, active, style, undefined, normalized, manualControlled);
}

function takePossession(player: PlayerBody, active: MatchRuntime, verifiedFirstTouch?: FirstTouchContact) {
  if (active.phase === "goal-kick") {
    active.renderer.domElement.dataset.goalKickClaimViolations = String(
      Number(active.renderer.domElement.dataset.goalKickClaimViolations ?? "0") + 1,
    );
    lockGoalKickBallOnGround(active);
    return false;
  }
  const flatBall = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
  const contactDistance = player.pos.distanceTo(flatBall);
  const maximumContactDistance = player.role === "keeper"
    ? active.ballPos.y > 1.35 ? 2.45 : 2.15
    : verifiedFirstTouch
      ? 1.36
      : playerBallContactRadius(player, active.ballPos.y) + 0.18;
  const intendedContact = active.intendedReceiverId === player.id || active.receptionLockPlayerId === player.id;
  const playableContactHeight = player.role === "keeper" ? 3.05 : verifiedFirstTouch ? 2.18 : intendedContact ? 1.58 : 1.42;
  const verifiedBodyContact = !verifiedFirstTouch
    || verifiedFirstTouch.point.distanceTo(active.ballPos) <= firstTouchContactRadius(verifiedFirstTouch.type) + 0.001;
  if (contactDistance > maximumContactDistance || active.ballPos.y > playableContactHeight || !verifiedBodyContact) {
    active.renderer.domElement.dataset.rejectedControlClaims = String(
      Number(active.renderer.domElement.dataset.rejectedControlClaims ?? "0") + 1,
    );
    return false;
  }
  const intendedAerialTrap = active.ballState === "kicked"
    && active.intendedReceiverId === player.id
    && (Boolean(verifiedFirstTouch) || active.ballPos.y > 0.92 || Math.abs(active.ballVel.y) > 2.2);
  active.ballState = "possessed";
  const pendingManualReceiverId = active.manualPassReceiverId;
  active.ballOwnerId = player.id;
  active.receptionLockPlayerId = null;
  active.receptionLockTimer = 0;
  active.looseContactPlayerId = null;
  active.looseContactCooldownTimer = 0.2;
  active.possessionStableOwnerId = player.id;
  active.possessionStabilityTimer = intendedAerialTrap ? 0.46 : player.role === "keeper" ? 0.62 : 0.58;
  active.renderer.domElement.dataset.possessionClaims = String(
    Number(active.renderer.domElement.dataset.possessionClaims ?? "0") + 1,
  );
  active.renderer.domElement.dataset.ballOwner = player.id;
  active.renderer.domElement.dataset.lastReceived = player.id;
  active.renderer.domElement.dataset.lastControlDistance = contactDistance.toFixed(4);
  active.renderer.domElement.dataset.lastControlRole = player.role;
  active.renderer.domElement.dataset.lastControlTeam = player.team;
  active.renderer.domElement.dataset.lastControlTouchType = verifiedFirstTouch?.type ?? "ground";
  const roleDistanceKey = player.role === "keeper" ? "maxKeeperControlDistance" : "maxFieldControlDistance";
  active.renderer.domElement.dataset[roleDistanceKey] = Math.max(
    Number(active.renderer.domElement.dataset[roleDistanceKey] ?? "0"),
    contactDistance,
  ).toFixed(4);
  active.renderer.domElement.dataset.maxControlDistance = Math.max(
    Number(active.renderer.domElement.dataset.maxControlDistance ?? "0"),
    contactDistance,
  ).toFixed(4);
  active.intendedReceiverId = null;
  active.possession = player.team;
  active.lastTouchTeam = player.team;
  active.lastTouchPlayerId = player.id;
  active.ballVel.copy(player.vel).multiplyScalar(intendedAerialTrap ? 0.34 : 0.78);
  active.tackleLockTimer = Math.max(active.tackleLockTimer, intendedAerialTrap ? 0.7 : player.role === "keeper" ? 0.64 : 0.58);
  active.pendingKickTarget = null;
  if (player.role === "keeper") {
    active.restartProtectionTeam = player.team;
    active.restartProtectionTimer = 1.6;
  } else if (active.restartProtectionTeam === player.team && active.restartProtectionTimer > 0) {
    active.restartProtectionTimer = Math.min(active.restartProtectionTimer, 0.85);
  }
  active.ballCurve.set(0, 0, 0);
  if (intendedAerialTrap && player.role !== "keeper") {
    player.recoveryTimer = Math.max(player.recoveryTimer, 0.08);
    player.decisionCooldown = Math.max(player.decisionCooldown, 0.2);
  }
  if (!player.controlledBy && player.role !== "keeper") {
    player.decisionCooldown = Math.max(player.decisionCooldown, 0.34);
    player.carryTimer = Math.max(player.carryTimer, 0.08);
  }
  if (pendingManualReceiverId) {
    if (!active.p1Autopilot && player.id === pendingManualReceiverId && player.team === "home" && player.role !== "keeper") {
      setControlledPlayer(active, player, "p1");
    }
    if (player.id === pendingManualReceiverId || player.team !== "home") {
      active.manualPassReceiverId = null;
    }
  }
  autoSwitchToPossessor(active, player);
  return true;
}

function curveForKick(style: KickStyle, player: PlayerBody, direction: THREE.Vector3, target: THREE.Vector3, force: { power: number; lift: number }) {
  const flatDirection = direction.clone().setY(0);
  if (flatDirection.lengthSq() < 0.1) return new THREE.Vector3();
  flatDirection.normalize();
  const sideAxis = new THREE.Vector3(-flatDirection.z, 0, flatDirection.x);
  const targetSide = Math.sign(target.x - player.pos.x || -player.pos.x || (player.number % 2 === 0 ? 1 : -1));
  if (style === "finesse") {
    const wideAngleScale = Math.abs(player.pos.x) > GOAL_W * 1.05 ? 1.28 : 1;
    return sideAxis.multiplyScalar(targetSide * clamp(force.power * 0.2, 5.2, 9.2) * wideAngleScale);
  }
  if (style === "chip") return sideAxis.multiplyScalar(targetSide * clamp(force.power * 0.055, 1.4, 3.4));
  if (style === "long" || style === "through") return sideAxis.multiplyScalar(targetSide * clamp(force.power * 0.045, 1.1, 2.9));
  if (style === "low-through") return sideAxis.multiplyScalar(targetSide * 0.75);
  if (style === "shot" && force.power > 36 && Math.abs(target.x - player.pos.x) > 2.2) {
    return sideAxis.multiplyScalar(targetSide * clamp(force.power * 0.045, 1.2, 3.2));
  }
  return new THREE.Vector3();
}

function canControlBall(player: PlayerBody, active: MatchRuntime) {
  if (active.ballOwnerId || active.phase !== "open" || active.pendingRestartPhase) return false;
  if (active.receptionLockPlayerId && player.id !== active.receptionLockPlayerId) return false;
  if (player.id === active.goalKickLockPlayerId) return false;
  const flatBall = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
  const keeperClaimTeam = keeperClaimTeamForLooseBall(active);
  if (keeperClaimTeam && player.role !== "keeper") return false;
  const intendedReceiver = active.intendedReceiverId === player.id;
  if (player.id === active.ballIgnorePlayerId) {
    const ignoreDistance = player.pos.distanceTo(flatBall);
    if (active.ballIgnoreTimer > 0 || (active.ballState === "kicked" && ignoreDistance < PLAYER_RADIUS + BALL_RADIUS + 1.25)) return false;
    active.ballIgnorePlayerId = null;
  }
  if (active.restartProtectionTimer > 0 && active.restartProtectionTeam && player.team !== active.restartProtectionTeam) return false;
  const aerialReceiver = intendedReceiver && active.ballPos.y > 1.05;
  const controlRange = playerBallContactRadius(player, active.ballPos.y) + (intendedReceiver ? 0.18 : 0.1);
  const speedLimit = active.ballState === "kicked"
    ? intendedReceiver
      ? aerialReceiver ? 22.5 : 34
      : player.role === "keeper" ? 12.2 : 17.4
    : intendedReceiver || active.receptionLockPlayerId === player.id ? 12.8 : 10.2;
  const playableHeight = player.role === "keeper" ? 2.55 : intendedReceiver ? 1.42 : 1.22;
  const flatDistance = player.pos.distanceTo(flatBall);
  if (!intendedReceiver && active.ballState === "kicked" && active.ballVel.length() > 8 && flatDistance > CONTROL_TOUCH_DISTANCE + 0.02) return false;
  return active.ballPos.y <= playableHeight && flatDistance <= controlRange && active.ballVel.length() < speedLimit;
}

function keeperClaimTeamForLooseBall(active: MatchRuntime) {
  if (active.ballOwnerId || active.ballPos.y > 1.35 || active.ballVel.length() > 18.5) return null;
  const flatX = Math.abs(active.ballPos.x);
  const teams: TeamId[] = ["home", "away"];
  for (const team of teams) {
    const goalZ = teamGoalZ(team, active.half);
    const inArea = Math.abs(active.ballPos.z - goalZ) < 30
      && flatX < GOAL_W / 2 + 15.5
      && (active.ballState !== "kicked" || active.ballVel.length() < 9.5);
    if (inArea) return team;
  }
  return null;
}

function kickTowardPoint(
  player: PlayerBody,
  target: THREE.Vector3,
  active: MatchRuntime,
  style: KickStyle = "shot",
  intendedReceiver?: PlayerBody,
  kickCharge = 0.68,
  manualAim = false,
) {
  if (active.cooldown > 0.05) return false;
  if (player.actionCooldown > 0 || player.kickTimer > 0.05 || player.tackleTimer > 0 || player.recoveryTimer > 0) return false;
  const flatBall = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
  const ownsBall = active.ballOwnerId === player.id;
  const kickContactRange = playerBallContactRadius(player, active.ballPos.y) + 0.22;
  if (!ownsBall && player.pos.distanceTo(flatBall) > kickContactRange) return false;
  const resolvedTarget = style === "shot" || style === "driven" || style === "finesse" || style === "chip"
    ? manualAim
      ? correctedManualShotTarget(player, active, target)
      : correctedShotTarget(player, active, target)
    : target.clone();
  const direction = resolvedTarget.clone().setY(BALL_RADIUS).sub(active.ballPos).setY(0);
  if (direction.lengthSq() < 0.5) return false;
  const distance = clamp(direction.length(), 6, 88);
  const force = sharedKickForce(style, distance, kickCharge, ownsBall);
  if (style === "finesse") direction.x += clamp(-player.pos.x * 0.18, -4.8, 4.8);
  releasePossession(active, "kicked");
  active.intendedReceiverId = intendedReceiver?.id ?? null;
  active.manualPassReceiverId = !active.p1Autopilot && player.controlledBy === "p1" && intendedReceiver?.team === "home"
    ? intendedReceiver.id
    : null;
  active.ballPos.y = Math.max(BALL_RADIUS, active.ballPos.y);
  const kickDirection = direction.normalize();
  const minimumGroundPassSpeed = style === "short" || style === "low-through"
    ? safeGroundPassSpeed(player, resolvedTarget, active, distance)
    : 0;
  const kickPower = Math.max(force.power, minimumGroundPassSpeed);
  active.renderer.domElement.dataset.lastKickX = kickDirection.x.toFixed(4);
  active.renderer.domElement.dataset.lastKickZ = kickDirection.z.toFixed(4);
  active.renderer.domElement.dataset.lastKickStyle = style;
  active.renderer.domElement.dataset.lastKickReceiver = intendedReceiver?.id ?? "";
  active.ballVel.copy(kickDirection.multiplyScalar(kickPower)).add(player.vel.clone().multiplyScalar(style === "driven" ? 0.06 : 0.12));
  active.ballVel.y = force.lift;
  active.ballCurve.copy(curveForKick(style, player, kickDirection, resolvedTarget, { ...force, power: kickPower }));
  if (manualAim && style === "finesse" && Math.abs(player.pos.x) > GOAL_W * 0.95) {
    active.ballCurve.multiplyScalar(1.18);
  }
  capBallVelocity(active.ballVel);
  active.cooldown = style === "short" || style === "low-through" ? 0.2 : 0.28;
  active.ballIgnorePlayerId = player.id;
  active.ballIgnoreTimer = style === "shot" || style === "driven" || style === "finesse" || style === "chip" ? 0.18 : style === "short" ? 0.24 : 0.16;
  active.lastTouchTeam = player.team;
  active.lastTouchPlayerId = player.id;
  player.kickTimer = style === "long" || style === "chip" ? 0.5 : 0.42;
  player.actionCooldown = style === "short" || style === "low-through" ? ACTION_COOLDOWN : 0.34;
  playKickSound(active, force.power > 26 ? 1.55 : 1.2);
  return true;
}

function kickTargetForStyle(player: PlayerBody, active: MatchRuntime, teammate: PlayerBody, style: "short" | "long" | "through" | "low-through") {
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const receiverRun = teammate.vel.clone().setY(0);
  const receiverLead = receiverRun.clone().multiplyScalar(style === "short" ? 0.32 : style === "long" ? 0.72 : style === "through" ? 0.5 : 0.38);
  const forwardLead = style === "through"
    ? 14.2
    : style === "low-through"
      ? 8.6
      : style === "long"
        ? 8.8
        : 0;
  const target = teammate.pos.clone()
    .add(receiverLead)
    .add(new THREE.Vector3(0, BALL_RADIUS, attackSign * forwardLead));
  if (style === "long" && (teammate.line === "forward" || Math.abs(teammate.pos.x) > FIELD_W * 0.26)) {
    const runDirection = receiverRun.lengthSq() > 0.3
      ? receiverRun.normalize()
      : new THREE.Vector3(Math.sign(teammate.pos.x || player.pos.x || 1) * 0.28, 0, attackSign).normalize();
    const leadDistance = clamp(player.pos.distanceTo(teammate.pos) * 0.1, 3.5, 7.8);
    target.add(runDirection.multiplyScalar(leadDistance));
    target.x = clamp(target.x + Math.sign(teammate.pos.x || player.pos.x || 1) * 1.1, -FIELD_W / 2 + 4, FIELD_W / 2 - 4);
    target.z = clamp(target.z + attackSign * 2.4, -FIELD_L / 2 + 4, FIELD_L / 2 - 4);
  }
  if (style === "through" || style === "low-through") {
    target.z = clamp(Math.max((target.z - player.pos.z) * attackSign, 9.5) * attackSign + player.pos.z, -FIELD_L / 2 + 4, FIELD_L / 2 - 4);
  }
  target.x = clamp(target.x, -FIELD_W / 2 + 3, FIELD_W / 2 - 3);
  target.z = clamp(target.z, -FIELD_L / 2 + 3, FIELD_L / 2 - 3);
  return target;
}

function ballLiftForKick(style: KickStyle, distance: number) {
  if (style === "short" || style === "low-through" || style === "driven") return style === "driven" ? 0.5 : 0.28;
  if (style === "through") return clamp(distance * 0.095, 1.8, 4.2);
  if (style === "long") return clamp(distance * 0.17, 5.4, 10.6);
  if (style === "chip") return clamp(distance * 0.19, 6.4, 11.8);
  if (style === "finesse") return 3.2;
  return clamp(distance * 0.085, 3.4, 6.8);
}

function quickKickPoint(player: PlayerBody, active: MatchRuntime) {
  const goalZ = attackingGoalZ(player.team, active.half);
  const keeper = active.players.find((item) => item.team === opponent(player.team) && item.role === "keeper");
  const shotAngle = clamp(player.pos.x / (FIELD_W / 2), -1, 1);
  const wideAngle = Math.abs(player.pos.x) > GOAL_W * 0.95;
  const keeperBias = keeper ? -Math.sign(keeper.pos.x - player.pos.x * 0.18 || player.pos.x || 1) : Math.sign(-player.pos.x || 1);
  const farPostBias = Math.sign(-shotAngle || keeperBias) * 1.35;
  const rawCornerAim = clamp(
    keeperBias * (GOAL_W / 2 - 1.25) + farPostBias - player.pos.x * 0.06,
    -GOAL_W / 2 + 1.75,
    GOAL_W / 2 - 1.75,
  );
  const farInside = -Math.sign(player.pos.x || 1) * (GOAL_W / 2 - 2.15);
  const cornerAim = wideAngle ? THREE.MathUtils.lerp(rawCornerAim, farInside, 0.72) : rawCornerAim;
  return new THREE.Vector3(
    cornerAim,
    BALL_RADIUS,
    goalZ + Math.sign(goalZ) * (GOAL_DEPTH + 1.8),
  );
}

function performPassTo(player: PlayerBody, active: MatchRuntime, teammate: PlayerBody, style: "short" | "long" | "through" | "low-through", oneTwo = false) {
  if (teammate.team !== player.team || teammate.sentOff || teammate.id === player.id) return false;
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const target = kickTargetForStyle(player, active, teammate, style);
  const backward = (teammate.pos.z - player.pos.z) * attackSign < -1.8;
  const manuallyControlled = player.controlledBy === "p1" && !active.p1Autopilot;
  if (!manuallyControlled) {
    if (backward && !aiBackPassIsSafe(player, teammate, active, target)) {
      active.renderer.domElement.dataset.rejectedBackPasses = String(
        Number(active.renderer.domElement.dataset.rejectedBackPasses ?? "0") + 1,
      );
      return false;
    }
    const laneWidth = backward ? 3.65 : style === "short" ? 3.15 : style === "long" ? 4.5 : 3.8;
    const laneBlockers = opponentsBetween(player, target, active.players, laneWidth);
    if (style === "short" && !backward) {
      const open = nearestOpponentDistance(teammate, active.players);
      if (!shortPassLaneIsUsable(player, teammate, active, target, laneBlockers, open)) return false;
    } else if (laneBlockers > 0) {
      return false;
    }
    if (backward && (
      opponentPressure(player, active.players, 5.8) > 0
      || opponentPressureAtPoint(player.team, teammate.pos, active.players, 7.2) > 0
    )) return false;
  }
  active.pendingKickTarget = target.clone();
  const passCharge = tacticalChargeForKick(style, target.distanceTo(player.pos));
  const passed = kickTowardPoint(player, target, active, style, teammate, passCharge);
  if (passed && !manuallyControlled) {
    const counter = player.team === "home" ? "aiPassesHome" : "aiPassesAway";
    active.renderer.domElement.dataset[counter] = String(Number(active.renderer.domElement.dataset[counter] ?? "0") + 1);
  }
  if (passed && oneTwo) {
    player.supportRunTimer = 1.9;
    player.supportRunTarget.copy(player.pos).add(new THREE.Vector3(clamp(-player.pos.x * 0.16, -4, 4), 0, attackSign * 18));
  }
  return passed;
}

function performPass(player: PlayerBody, active: MatchRuntime, style: "short" | "long" | "through" | "low-through", oneTwo = false) {
  const teammate = choosePassTarget(player, active, style);
  return teammate ? performPassTo(player, active, teammate, style, oneTwo) : false;
}

function isRiskyBackPass(
  player: PlayerBody,
  receiver: PlayerBody,
  active: MatchRuntime,
  laneBlockers = opponentsBetween(player, receiver.pos, active.players, 3.2),
  open = nearestOpponentDistance(receiver, active.players),
) {
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const backward = (receiver.pos.z - player.pos.z) * attackSign < -1.8;
  if (!backward) return false;
  return laneBlockers > 0 || open < 7.4 || !aiBackPassIsSafe(player, receiver, active);
}

function shortPassLaneIsUsable(
  player: PlayerBody,
  receiver: PlayerBody,
  active: MatchRuntime,
  target: THREE.Vector3,
  laneBlockers: number,
  open: number,
) {
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const forward = (receiver.pos.z - player.pos.z) * attackSign;
  const distance = target.distanceTo(player.pos);
  const backward = forward < -1.8;
  if (laneBlockers === 0) return true;
  if (backward || laneBlockers > 1) return false;
  const targetPressure = opponentPressureAtPoint(player.team, target, active.players, 5.8);
  const passVector = target.clone().sub(player.pos).setY(0);
  const receiverMovingAvailable = passVector.lengthSq() > 0.1
    && receiver.vel.lengthSq() > 0.35
    && receiver.vel.clone().setY(0).dot(passVector.normalize()) > -0.2;
  return distance < 34
    && open > 5.2
    && targetPressure < 2
    && (forward > -0.5 || receiverMovingAvailable);
}

function choosePassTarget(player: PlayerBody, active: MatchRuntime, style: "short" | "long" | "through" | "low-through") {
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const candidates = active.players.filter((item) => item.team === player.team && item.id !== player.id && item.role !== "keeper");
  if (style === "short") {
    return candidates
      .filter((teammate) => !teammate.sentOff)
      .map((teammate) => {
        const distance = teammate.pos.distanceTo(player.pos);
        const forward = (teammate.pos.z - player.pos.z) * attackSign;
        const open = nearestOpponentDistance(teammate, active.players);
        const target = kickTargetForStyle(player, active, teammate, "short");
        const laneBlockers = opponentsBetween(player, target, active.players, 2.9);
        const riskyBackPass = isRiskyBackPass(player, teammate, active, laneBlockers, open);
        const laneUsable = shortPassLaneIsUsable(player, teammate, active, target, laneBlockers, open);
        const directionScore = clamp(forward, -7, 7);
        const passDir = teammate.pos.clone().sub(player.pos).setY(0);
        const facingScore = passDir.lengthSq() > 0.1 ? facingDirection(player).dot(passDir.normalize()) * 4.2 : 0;
        const distanceScore = 48 - Math.abs(distance - 22) * 1.05;
        const receiverRunScore = teammate.vel.lengthSq() > 0.3 ? teammate.vel.clone().setY(0).normalize().dot(new THREE.Vector3(0, 0, attackSign)) * 2.4 : 0;
        return {
          teammate,
          score: distanceScore + directionScore + facingScore + receiverRunScore + clamp(open, 0, 12) * 2.05 - laneBlockers * 6.2 - (riskyBackPass ? 48 : 0),
          distance,
          laneBlockers,
          open,
          riskyBackPass,
          laneUsable,
        };
      })
      .filter(({ distance, open, riskyBackPass, laneUsable }) => distance > 4.2 && distance < 50 && laneUsable && open > 1.2 && !riskyBackPass)
      .sort((a, b) => b.score - a.score)[0]?.teammate
      ?? candidates
        .filter((teammate) => !teammate.sentOff)
        .filter((teammate) => {
          const target = kickTargetForStyle(player, active, teammate, "short");
          const blockers = opponentsBetween(player, target, active.players, 3.2);
          const open = nearestOpponentDistance(teammate, active.players);
          return shortPassLaneIsUsable(player, teammate, active, target, blockers, open) && !isRiskyBackPass(player, teammate, active, blockers, open);
        })
        .sort((a, b) => {
          const aOpen = nearestOpponentDistance(a, active.players);
          const bOpen = nearestOpponentDistance(b, active.players);
          return (bOpen - b.pos.distanceTo(player.pos) * 0.08) - (aOpen - a.pos.distanceTo(player.pos) * 0.08);
        })[0]
      ?? null;
  }
  return candidates
    .map((teammate) => {
      const distance = teammate.pos.distanceTo(player.pos);
      const forward = (teammate.pos.z - player.pos.z) * attackSign;
      const open = nearestOpponentDistance(teammate, active.players);
      const laneGap = Math.abs(teammate.pos.x - player.pos.x);
      const projectedTarget = kickTargetForStyle(player, active, teammate, style);
      const laneBlockers = opponentsBetween(player, projectedTarget, active.players, style === "long" ? 5.4 : 4.2);
      const landingPressure = opponentPressureAtPoint(player.team, projectedTarget, active.players, style === "long" ? 7.2 : 5.4);
      const targetDistance = style === "long" ? 52 : 32;
      const distanceScore = 44 - Math.abs(distance - targetDistance) * 0.82;
      const forwardScore = style === "long"
          ? clamp(forward * 0.68 + laneGap * 0.26, -8, 20)
          : clamp(forward * 1.35, -10, 28);
      const openScore = clamp(open, 0, 14) * 1.5;
      const runVector = teammate.vel.clone().setY(0);
      const runScore = runVector.lengthSq() > 0.25
        ? runVector.normalize().dot(new THREE.Vector3(0, 0, attackSign)) * (style === "long" ? 5.8 : 3.4)
        : 0;
      const throughRunBonus = (style === "through" || style === "low-through") && teammate.line === "forward" && forward > 3 ? 8 : 0;
      const longTargetBonus = style === "long" && (teammate.line === "forward" || Math.abs(teammate.pos.x) > FIELD_W * 0.24) ? 5.2 : 0;
      const sameLanePenalty = laneGap < 2.4 ? 3 : 0;
      return { teammate, score: distanceScore + forwardScore + openScore + runScore + throughRunBonus + longTargetBonus - sameLanePenalty - laneBlockers * 7.4 - landingPressure * 13.5 };
    })
    .filter(({ teammate }) => passIsUseful(player, teammate, active, style))
    .sort((a, b) => b.score - a.score)[0]?.teammate ?? null;
}

function passIsUseful(player: PlayerBody, receiver: PlayerBody, active: MatchRuntime, style: "short" | "long" | "through" | "low-through") {
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const forward = (receiver.pos.z - player.pos.z) * attackSign;
  const distance = receiver.pos.distanceTo(player.pos);
  const open = nearestOpponentDistance(receiver, active.players);
  if (style === "short") {
    const target = kickTargetForStyle(player, active, receiver, style);
    const laneBlockers = opponentsBetween(player, target, active.players, 3.2);
    return distance < 45
      && open > 1.1
      && shortPassLaneIsUsable(player, receiver, active, target, laneBlockers, open)
      && !isRiskyBackPass(player, receiver, active, laneBlockers, open);
  }
  if (style === "long") {
    const target = kickTargetForStyle(player, active, receiver, style);
    return distance > 11
      && distance < 82
      && open > 2.2
      && forward > -16
      && opponentsBetween(player, target, active.players, 5.8) === 0
      && opponentPressureAtPoint(player.team, target, active.players, 7.4) === 0;
  }
  if (style === "through" || style === "low-through") {
    const target = kickTargetForStyle(player, active, receiver, style);
    return distance > 7
      && distance < 64
      && open > 2.1
      && forward > -2
      && opponentsBetween(player, target, active.players, 4.4) === 0
      && opponentPressureAtPoint(player.team, target, active.players, 5.8) < 2;
  }
  return true;
}

function nearestOpponentDistance(player: PlayerBody, players: PlayerBody[]) {
  return players
    .filter((item) => item.team !== player.team)
    .reduce((distance, item) => Math.min(distance, item.pos.distanceTo(player.pos)), Infinity);
}

function nearestOpponentTo(player: PlayerBody, players: PlayerBody[]) {
  return players
    .filter((item) => item.team !== player.team && !item.sentOff)
    .reduce<PlayerBody | null>((best, item) => {
      if (!best) return item;
      return item.pos.distanceTo(player.pos) < best.pos.distanceTo(player.pos) ? item : best;
    }, null);
}

function opponentPressure(player: PlayerBody, players: PlayerBody[], radius: number) {
  return players.filter((item) => item.team !== player.team && item.pos.distanceTo(player.pos) < radius).length;
}

function opponentPressureAtPoint(team: TeamId, point: THREE.Vector3, players: PlayerBody[], radius: number) {
  return players.filter((item) => item.team !== team && !item.sentOff && item.pos.distanceTo(point) < radius).length;
}

function opponentsBetween(player: PlayerBody, target: THREE.Vector3, players: PlayerBody[], laneWidth: number) {
  const toTarget = target.clone().sub(player.pos).setY(0);
  const length = toTarget.length();
  if (length < 0.1) return 0;
  const forward = toTarget.normalize();
  const predictionTime = clamp(length / 72, 0.12, 0.62);
  const blocksLaneAt = (point: THREE.Vector3) => {
    const relative = point.clone().sub(player.pos).setY(0);
    const along = relative.dot(forward);
    if (along < 0.45 || along > length + 0.35) return false;
    const lateral = relative.sub(forward.clone().multiplyScalar(along)).length();
    return lateral < laneWidth;
  };
  return players.filter((item) => {
    if (item.team === player.team || item.sentOff) return false;
    const predicted = item.pos.clone().addScaledVector(item.vel, predictionTime).setY(0);
    return blocksLaneAt(item.pos) || blocksLaneAt(predicted);
  }).length;
}

function teammatesBetween(player: PlayerBody, receiver: PlayerBody, players: PlayerBody[], laneWidth: number) {
  const toTarget = receiver.pos.clone().sub(player.pos).setY(0);
  const length = toTarget.length();
  if (length < 0.1) return 0;
  const forward = toTarget.normalize();
  return players.filter((item) => {
    if (item.team !== player.team || item.id === player.id || item.id === receiver.id || item.sentOff) return false;
    const relative = item.pos.clone().sub(player.pos).setY(0);
    const along = relative.dot(forward);
    if (along < 1.2 || along > length - 1.2) return false;
    const lateral = relative.sub(forward.clone().multiplyScalar(along)).length();
    return lateral < laneWidth;
  }).length;
}

function aiShotCrossesGoalFrame(player: PlayerBody, active: MatchRuntime, target: THREE.Vector3, style: "shot" | "driven" | "finesse" | "chip") {
  const goalZ = attackingGoalZ(player.team, active.half);
  const from = active.ballPos.clone().setY(0);
  const resolvedTarget = correctedShotTarget(player, active, target).setY(0);
  const trajectory = resolvedTarget.clone().sub(from);
  if (Math.abs(trajectory.z) < 0.01 || trajectory.z * (goalZ - from.z) <= 0) return false;
  const planeTime = (goalZ - from.z) / trajectory.z;
  if (planeTime <= 0) return false;
  const xAtGoal = from.x + trajectory.x * planeTime;
  const insideFrame = Math.abs(xAtGoal) <= GOAL_W / 2 - BALL_RADIUS - 0.45;
  if (!insideFrame) return false;
  const goalDistance = Math.abs(goalZ - player.pos.z);
  const wideAngle = Math.abs(player.pos.x) > GOAL_W * 1.05;
  const blockers = opponentsBetween(player, resolvedTarget, active.players, goalDistance < 16 ? 2.05 : 2.6);
  const maximumBlockers = goalDistance < 13 ? 2 : goalDistance < 23 ? 1 : 0;
  if (blockers > maximumBlockers) return false;
  if (wideAngle && (goalDistance > 25 || blockers > 0) && style !== "finesse") return false;
  const keeper = active.players.find((candidate) => candidate.team !== player.team && candidate.role === "keeper" && !candidate.sentOff);
  const keeperCoversTarget = Boolean(keeper && Math.abs(keeper.pos.x - xAtGoal) < (style === "driven" ? 1.25 : 0.85) && goalDistance > 11);
  if (keeperCoversTarget && style !== "finesse" && style !== "chip") return false;
  return true;
}

function shoot(player: PlayerBody, active: MatchRuntime, style: "shot" | "driven" | "finesse" | "chip", kickCharge = 1) {
  const target = quickKickPoint(player, active);
  if (style === "finesse") {
    target.x = clamp(
      player.pos.x > 0 ? -GOAL_W / 2 + 2.4 : GOAL_W / 2 - 2.4,
      -GOAL_W / 2 + 1.8,
      GOAL_W / 2 - 1.8,
    );
  }
  if (style === "driven") target.z += Math.sign(target.z) * 1.2;
  const correctedTarget = correctedShotTarget(player, active, target);
  const aiControlled = !player.controlledBy || active.p1Autopilot;
  if (aiControlled && !aiShotCrossesGoalFrame(player, active, correctedTarget, style)) {
    active.renderer.domElement.dataset.rejectedAiShots = String(Number(active.renderer.domElement.dataset.rejectedAiShots ?? "0") + 1);
    player.decisionCooldown = Math.max(player.decisionCooldown, 0.18);
    return false;
  }
  const kicked = kickTowardPoint(player, correctedTarget, active, style, undefined, kickCharge);
  if (kicked && aiControlled) {
    active.renderer.domElement.dataset.acceptedAiShots = String(Number(active.renderer.domElement.dataset.acceptedAiShots ?? "0") + 1);
  }
  return kicked;
}

function correctedShotTarget(player: PlayerBody, active: MatchRuntime, target: THREE.Vector3) {
  const goalZ = attackingGoalZ(player.team, active.half);
  const from = active.ballPos.clone().setY(0);
  const direction = target.clone().setY(0).sub(from);
  if (Math.abs(direction.z) < 0.01 || direction.z * (goalZ - from.z) <= 0) return target.clone();
  const goalPlaneT = (goalZ - from.z) / direction.z;
  if (goalPlaneT <= 0) return target.clone();
  const xAtGoal = from.x + direction.x * goalPlaneT;
  const safePostX = GOAL_W / 2 - 1.75;
  const wideAngle = Math.abs(player.pos.x) > GOAL_W * 0.95;
  let correctedX = clamp(xAtGoal, -safePostX, safePostX);
  if (wideAngle) {
    const farInside = -Math.sign(player.pos.x || 1) * (GOAL_W / 2 - 2.35);
    correctedX = THREE.MathUtils.lerp(correctedX, farInside, 0.48);
  } else if (Math.abs(xAtGoal) > safePostX) {
    correctedX *= 0.92;
  }
  return new THREE.Vector3(
    correctedX,
    BALL_RADIUS,
    goalZ + Math.sign(goalZ) * (GOAL_DEPTH + 1.8),
  );
}

function correctedManualShotTarget(player: PlayerBody, active: MatchRuntime, target: THREE.Vector3) {
  const goalZ = attackingGoalZ(player.team, active.half);
  const from = active.ballPos.clone().setY(0);
  const direction = target.clone().setY(0).sub(from);
  if (Math.abs(direction.z) < 0.01 || direction.z * (goalZ - from.z) <= 0) return target.clone();
  const goalPlaneT = (goalZ - from.z) / direction.z;
  if (goalPlaneT <= 0) return target.clone();
  const xAtGoal = from.x + direction.x * goalPlaneT;
  const wideAngle = Math.abs(player.pos.x) > GOAL_W * 0.95;
  const clearlyTowardGoal = Math.abs(xAtGoal) < GOAL_W / 2 + 3.4;
  if (!wideAngle || !clearlyTowardGoal) return target.clone();
  const insidePost = clamp(xAtGoal, -GOAL_W / 2 + 0.85, GOAL_W / 2 - 0.85);
  const farInside = -Math.sign(player.pos.x || 1) * (GOAL_W / 2 - 2.1);
  const assistedX = THREE.MathUtils.lerp(insidePost, farInside, 0.32);
  const correction = clamp((assistedX - xAtGoal) * 0.36, -1.8, 1.8);
  return new THREE.Vector3(
    xAtGoal + correction,
    BALL_RADIUS,
    goalZ + Math.sign(goalZ) * (GOAL_DEPTH + 1.8),
  );
}

function createLooseBallContest(player: PlayerBody, owner: PlayerBody, active: MatchRuntime, ballPoint: THREE.Vector3, direction: THREE.Vector3) {
  releasePossession(active, "loose");
  active.ballPos.copy(ballPoint).setY(BALL_RADIUS);
  const contestDirection = direction.lengthSq() > 0.05 ? direction.clone().normalize() : facingDirection(player);
  active.ballVel.copy(contestDirection.multiplyScalar(5.2)).add(owner.vel.clone().multiplyScalar(0.18));
  active.ballVel.y = 0.45;
  active.ballCurve.set(0, 0, 0);
  active.intendedReceiverId = null;
  active.manualPassReceiverId = null;
  active.ballIgnorePlayerId = null;
  active.ballIgnoreTimer = 0.12;
  active.tackleLockTimer = 0.28;
  player.tackleCooldown = player.controlledBy ? 0.82 : 1.08;
  player.recoveryTimer = Math.max(player.recoveryTimer, 0.36);
  owner.recoveryTimer = Math.max(owner.recoveryTimer, 0.28);
}

function attemptTackle(player: PlayerBody, active: MatchRuntime) {
  if (player.sentOff || player.actionCooldown > 0 || player.tackleCooldown > 0 || player.recoveryTimer > 0 || active.tackleLockTimer > 0 || active.phase !== "open") return false;
  const owner = ballOwner(active);
  if (!owner || owner.team === player.team || owner.recoveryTimer > 0) return false;
  if (owner.role === "keeper" && active.restartProtectionTimer > 0 && active.restartProtectionTeam === owner.team) return false;
  const ballPoint = controlledBallPoint(owner);
  const towardBall = ballPoint.clone().sub(player.pos).setY(0);
  const ballDistance = towardBall.length();
  const towardOwner = owner.pos.clone().sub(player.pos).setY(0);
  const carrierDistance = towardOwner.length();
  const facing = facingDirection(player);
  const ownerSlow = owner.vel.length() < 0.85 && owner.carryTimer > 0.42;
  if (ballDistance > (ownerSlow ? 2.95 : 2.02) || ballDistance <= 0.05) return false;
  const tackleDir = towardBall.normalize();
  const ownerToTackler = player.pos.clone().sub(owner.pos).setY(0);
  const fromBehind = ownerToTackler.lengthSq() > 0.05 && facingDirection(owner).dot(ownerToTackler.normalize()) < (ownerSlow ? -0.76 : -0.35);
  const facingBall = facing.dot(tackleDir);
  if (fromBehind || facingBall < (ownerSlow ? 0.28 : 0.56)) {
    player.tackleCooldown = player.controlledBy ? 1.0 : 1.35;
    player.recoveryTimer = Math.max(player.recoveryTimer, 0.34);
    return false;
  }
  const cleanContactDistance = playerBallContactRadius(player, active.ballPos.y) + (ownerSlow ? 0.2 : 0.12);
  if (ballDistance > cleanContactDistance) {
    if (carrierDistance < (ownerSlow ? 2.85 : 2.35) && facingBall > (ownerSlow ? 0.5 : 0.66)) createLooseBallContest(player, owner, active, ballPoint, tackleDir);
    return false;
  }
  player.tackleCooldown = player.controlledBy ? 1.55 : 2.05;
  player.actionCooldown = 0.42;
  player.tackleTimer = 0;
  player.blockTimer = Math.max(player.blockTimer, 0.38);
  player.recoveryTimer = 0.48;
  player.vel.add(facing.clone().multiplyScalar(player.controlledBy ? 2.2 : 1.8));
  if (!takePossession(player, active)) return false;
  active.ballIgnorePlayerId = owner.id;
  active.ballIgnoreTimer = 0.42;
  active.tackleLockTimer = 0.92;
  owner.tackleCooldown = Math.max(owner.tackleCooldown, 1.2);
  owner.recoveryTimer = Math.max(owner.recoveryTimer, 0.62);
  const separation = player.pos.clone().sub(owner.pos).setY(0);
  if (separation.lengthSq() > 0.01) {
    separation.normalize().multiplyScalar(0.18);
    player.pos.add(separation);
    owner.pos.sub(separation);
  }
  if (player.vel.length() > 13.5) player.vel.setLength(13.5);
  if (owner.vel.length() > 13.5) owner.vel.setLength(13.5);
  active.cooldown = Math.max(active.cooldown, 0.24);
  return true;
}

function clampPlayer(player: PlayerBody) {
  const margin = player.role === "keeper" ? 2 : 1.6;
  player.pos.x = clamp(player.pos.x, -FIELD_W / 2 + margin, FIELD_W / 2 - margin);
  if (player.role === "keeper") {
    const goalZ = player.home.z;
    const sign = Math.sign(goalZ);
    const canStepIntoGoal = Math.abs(player.pos.x) < GOAL_W / 2 - GOAL_SIDE_POST_INSET;
    const minZ = sign > 0 ? goalZ - 9 : -GOAL_BACK_Z + 1.1;
    const maxZ = sign > 0 ? GOAL_BACK_Z - 1.1 : goalZ + 9;
    player.pos.z = clamp(player.pos.z, minZ, maxZ);
    if (!canStepIntoGoal && Math.abs(player.pos.z) > GOAL_FRONT_Z - 0.8) {
      player.pos.z = Math.sign(player.pos.z) * (GOAL_FRONT_Z - 0.8);
    }
  } else {
    const inGoalMouth = Math.abs(player.pos.x) < GOAL_W / 2 - GOAL_SIDE_POST_INSET;
    const minZ = inGoalMouth ? -GOAL_BACK_Z + margin : -FIELD_L / 2 + margin;
    const maxZ = inGoalMouth ? GOAL_BACK_Z - margin : FIELD_L / 2 - margin;
    player.pos.z = clamp(player.pos.z, minZ, maxZ);
  }
}

function formatSoccerClock(value: number) {
  const capped = Math.min(FULL_TIME_SECONDS, Math.max(0, Math.floor(value)));
  const minutes = String(Math.floor(capped / 60)).padStart(2, "0");
  const seconds = String(capped % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function SoccerBallLogo() {
  return (
    <div className="grid h-28 w-28 place-items-center rounded-full border border-white/20 bg-white/95 shadow-2xl">
      <svg viewBox="0 0 120 120" className="h-24 w-24" role="img" aria-label="Soccer ball">
        <circle cx="60" cy="60" r="48" fill="#f8fafc" stroke="#0f172a" strokeWidth="4" />
        <polygon points="60,30 78,43 71,65 49,65 42,43" fill="#111827" />
        <path d="M42 43 25 41M78 43 95 41M49 65 38 86M71 65 82 86M60 30 60 13" stroke="#111827" strokeWidth="5" strokeLinecap="round" />
        <path d="M25 41a48 48 0 0 0-10 28M95 41a48 48 0 0 1 10 28M38 86a48 48 0 0 0 44 0" fill="none" stroke="#111827" strokeWidth="5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function TouchButton({
  label,
  active = false,
  strong = false,
  large = false,
  tone = "neutral",
  onPress,
  onDown,
  onUp,
}: {
  label: string;
  active?: boolean;
  strong?: boolean;
  large?: boolean;
  tone?: "neutral" | "cyan" | "green" | "red" | "yellow";
  onPress?: () => void;
  onDown?: () => void;
  onUp?: () => void;
}) {
  const toneClass = active
    ? "border-cyan-100 bg-cyan-300/35 text-cyan-50"
    : tone === "cyan"
      ? "border-cyan-100/40 bg-cyan-300/22 text-cyan-50"
      : tone === "green"
        ? "border-lime-100/45 bg-lime-300/22 text-lime-50"
        : tone === "red" || strong
          ? "border-rose-100/45 bg-rose-300/24 text-rose-50"
          : tone === "yellow"
            ? "border-yellow-100/45 bg-yellow-300/22 text-yellow-50"
            : "border-white/15 bg-black/35 text-white";
  return (
    <button
      className={`grid place-items-center whitespace-pre-line rounded-full border text-center font-black uppercase leading-tight tracking-normal active:scale-95 ${
        large ? "h-24 w-24 text-[13px] sm:h-28 sm:w-28 sm:text-sm" : "h-16 w-16 text-[11px] sm:h-20 sm:w-20 sm:text-xs"
      } ${toneClass}`}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        onDown?.();
      }}
      onPointerUp={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onUp?.();
        onPress?.();
      }}
      onPointerCancel={() => {
        onUp?.();
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {label}
    </button>
  );
}
