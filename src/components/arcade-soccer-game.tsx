"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import * as THREE from "three";
import type { User } from "@supabase/supabase-js";
import { LogOut, Play, RotateCcw, Trophy, UserCircle, Users } from "lucide-react";
import { getSupabaseClient, hasSupabaseConfig } from "@/lib/supabase";

type GameMode = "ai" | "online";
type MatchState = "menu" | "playing" | "ended";
type TeamId = "home" | "away";
type PlayerRole = "field" | "keeper";
type PlayerLine = "keeper" | "defender" | "midfielder" | "forward";
type PlayPhase = "walkout" | "open" | "goal" | "halftime" | "kickoff" | "throw-in" | "goal-kick" | "corner";
type AiSkillMove = "shot-fake" | "body-feint" | "quick-turn" | "dribble-burst" | "fake-pass" | null;

type PlayerBody = {
  id: string;
  team: TeamId;
  role: PlayerRole;
  line: PlayerLine;
  number: number;
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
  kickTimer: number;
  actionCooldown: number;
  tackleTimer: number;
  tackleCooldown: number;
  recoveryTimer: number;
  catchTimer: number;
  diveTimer: number;
  diveSide: number;
  celebrateTimer: number;
  yellowCards: number;
  sentOff: boolean;
  decisionCooldown: number;
  carryTimer: number;
  stuckTimer: number;
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
  controlledBy?: "p1" | "p2";
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

type OnlineProfile = {
  id: string;
  username: string;
  game_id: string;
};

type MatchRequestRow = {
  id: string;
  from_user: string;
  to_user: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
  profiles?: { username: string; game_id: string } | null;
};

type OnlineMatchRow = {
  id: string;
  home_user: string;
  away_user: string;
  status: string;
  state?: Record<string, unknown> | null;
  created_at: string;
};

type FictionalTeamKey = "city" | "united" | "humble" | "blue" | "spurs" | "scouse";
type SetupTab = "team" | "squad" | "formation" | "match" | "online";

type TeamOption = {
  key: FictionalTeamKey;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  shorts: string;
  socks: string;
  keeper: string;
};

type SquadPlayer = {
  player_key: string;
  name: string;
  jersey_number: number;
  position: string;
};

type FormationKey = "4-2-3-1" | "4-3-3" | "4-4-2" | "3-5-2";

type FormationSlot = {
  slot: string;
  label: string;
  line: PlayerLine;
  x: number;
  z: number;
  defaultNumber: number;
};

type MatchRuntime = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  cameraLookAt: THREE.Vector3;
  ball: THREE.Group;
  players: PlayerBody[];
  frame: number;
  matchTick: number | null;
  frameCount: number;
  lastTime: number;
  lastRenderTime: number;
  lastMatchUpdate: number;
  lastHudUpdate: number;
  mode: GameMode;
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
  score: { home: number; away: number };
  cooldown: number;
  possession: TeamId | null;
  ballState: BallState;
  ballOwnerId: string | null;
  intendedReceiverId: string | null;
  ballIgnorePlayerId: string | null;
  ballIgnoreTimer: number;
  pendingKickTarget: THREE.Vector3 | null;
  lastShotTap: number;
  shotCharge: number;
  shotChargingPlayerId: string | null;
  shotConsumed: boolean;
  tackleLockTimer: number;
  audio: AudioContext | null;
  lastKickSound: number;
  lastCheerSound: number;
  lastTouchTeam: TeamId;
  lastTouchPlayerId: string | null;
  aiChanceCooldown: number;
  restartProtectionTeam: TeamId | null;
  restartProtectionTimer: number;
  goalKickLockPlayerId: string | null;
  goalKickLockTimer: number;
  restartBoundaryGuardTimer: number;
  p1IdleTimer: number;
  p1Autopilot: boolean;
  perfElement: HTMLDivElement | null;
  perfFrames: number;
  perfFrameTotal: number;
  perfLastReport: number;
};

const FIELD_W = 64;
const FIELD_L = 96;
const GOAL_W = 16;
const PLAYER_RADIUS = 1.08;
const BALL_RADIUS = 0.36;
const CLOCK_SPEED = 18;
const HALF_TIME_SECONDS = 45 * 60;
const FULL_TIME_SECONDS = 90 * 60;
const BALL_MAX_SPEED = 54;
const BALL_ROLLING_FRICTION = 0.78;
const BALL_STOP_SPEED = 0.035;
const BALL_GRAVITY = 18;
const BALL_BOUNCE = 0.42;
const PERSONAL_SPACE = 1.75;
const DRIBBLE_DISTANCE = PLAYER_RADIUS + BALL_RADIUS + 0.06;
const CONTROL_TOUCH_DISTANCE = PLAYER_RADIUS + BALL_RADIUS + 0.62;
const SHOT_DOUBLE_TAP_MS = 260;
const ACTION_COOLDOWN = 0.22;
const TOUCHLINE_MARGIN = 4.6;
const GOAL_DEPTH = 4.8;
const GOAL_FRONT_Z = FIELD_L / 2 + 1.2;
const GOAL_SCORE_Z = GOAL_FRONT_Z + BALL_RADIUS * 0.7;
const GOAL_BACK_Z = GOAL_FRONT_Z + GOAL_DEPTH;
const GOAL_SIDE_POST_INSET = 0.26;
const BROADCAST_CAMERA_X = -FIELD_W / 2 - 28;
const BROADCAST_CAMERA_Y = 38;
const BROADCAST_CAMERA_Z = 7.5;
const BROADCAST_CAMERA_Z_OFFSET = 7.5;
const BROADCAST_LOOK_AT_X = 0;
const BROADCAST_LOOK_AT_Y = 1.05;
const BROADCAST_LOOK_AT_Z = 0;
const ENABLE_BLOCKING_WALKOUT = false;

const AWAY_COLOR = "#dc2626";
const AWAY_TRIM = "#f8fafc";
const AWAY_SHORTS = "#f8fafc";
const AWAY_KEEPER_COLOR = "#16a34a";

const TEAM_OPTIONS: TeamOption[] = [
  { key: "city", name: "City FC", primary: "#38bdf8", secondary: "#eff6ff", accent: "#0f172a", shorts: "#f8fafc", socks: "#e0f2fe", keeper: "#facc15" },
  { key: "united", name: "United FC", primary: "#dc2626", secondary: "#f8fafc", accent: "#111827", shorts: "#111827", socks: "#f8fafc", keeper: "#22c55e" },
  { key: "humble", name: "Humble FC", primary: "#facc15", secondary: "#14532d", accent: "#166534", shorts: "#14532d", socks: "#fef9c3", keeper: "#0ea5e9" },
  { key: "blue", name: "Blue FC", primary: "#2563eb", secondary: "#eff6ff", accent: "#93c5fd", shorts: "#1e3a8a", socks: "#dbeafe", keeper: "#fb923c" },
  { key: "spurs", name: "Spurs FC", primary: "#f8fafc", secondary: "#1d4ed8", accent: "#2563eb", shorts: "#1d4ed8", socks: "#f8fafc", keeper: "#bef264" },
  { key: "scouse", name: "Scouse FC", primary: "#b91c1c", secondary: "#fef2f2", accent: "#fbbf24", shorts: "#b91c1c", socks: "#fef2f2", keeper: "#14b8a6" },
];

const DEFAULT_TEAM_KEY: FictionalTeamKey = "city";

function selectedTeamOption(key: FictionalTeamKey) {
  return TEAM_OPTIONS.find((team) => team.key === key) ?? TEAM_OPTIONS[0];
}

function defaultSquadPlayers(): SquadPlayer[] {
  return [
    { player_key: "p-gk", name: "Noah Park", jersey_number: 1, position: "GK" },
    { player_key: "p-lb", name: "Leo Kim", jersey_number: 3, position: "LB" },
    { player_key: "p-cb1", name: "Mason Han", jersey_number: 4, position: "CB" },
    { player_key: "p-cb2", name: "Jun Seo", jersey_number: 5, position: "CB" },
    { player_key: "p-rb", name: "Eden Lee", jersey_number: 2, position: "RB" },
    { player_key: "p-cm1", name: "Rio Choi", jersey_number: 6, position: "CM" },
    { player_key: "p-cm2", name: "Kai Moon", jersey_number: 8, position: "CM" },
    { player_key: "p-cam", name: "Milo Shin", jersey_number: 10, position: "CAM" },
    { player_key: "p-lw", name: "Jay Lim", jersey_number: 7, position: "LW" },
    { player_key: "p-st", name: "Ace Kang", jersey_number: 9, position: "ST" },
    { player_key: "p-rw", name: "Tae Yun", jersey_number: 11, position: "RW" },
    { player_key: "p-sub1", name: "Ben Jang", jersey_number: 12, position: "CM" },
    { player_key: "p-sub2", name: "Ian Baek", jersey_number: 14, position: "CB" },
    { player_key: "p-sub3", name: "Sean Oh", jersey_number: 17, position: "FW" },
  ];
}

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

let activeHomeTeam = selectedTeamOption(DEFAULT_TEAM_KEY);
let activeHomeFormation: FormationKey = "4-3-3";
let activeHomeSquad = defaultSquadPlayers();
let activeHomeAssignments: Record<string, string> = {};

function defaultFormationAssignments(formation: FormationKey, squad = defaultSquadPlayers()) {
  const assignments: Record<string, string> = {};
  FORMATION_OPTIONS[formation].forEach((slot, index) => {
    assignments[slot.slot] = squad[index]?.player_key ?? squad[0]?.player_key ?? "";
  });
  return assignments;
}

activeHomeAssignments = defaultFormationAssignments(activeHomeFormation, activeHomeSquad);

function applyActiveHomeSetup(teamKey: FictionalTeamKey, formation: FormationKey, squad: SquadPlayer[], assignments: Record<string, string>) {
  activeHomeTeam = selectedTeamOption(teamKey);
  activeHomeFormation = formation;
  activeHomeSquad = squad;
  activeHomeAssignments = assignments;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function angleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
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

function nicknameIsValid(value: string) {
  return /^[a-zA-Z0-9 _-]{2,16}$/.test(value.trim());
}

function scoreMatch(goalsFor: number, goalsAgainst: number) {
  return Math.max(1, goalsFor * 1000 + Math.max(0, goalsFor - goalsAgainst) * 500 + (goalsFor > goalsAgainst ? 2000 : goalsFor === goalsAgainst ? 750 : 100));
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

function goalKickBallSpot(keeper: PlayerBody, direction: THREE.Vector3) {
  return keeper.pos.clone().add(direction.clone().multiplyScalar(4.35)).setY(BALL_RADIUS);
}

function resetKeeperForSimpleGoalKick(keeper: PlayerBody, direction: THREE.Vector3, half: 1 | 2) {
  keeper.pos.copy(goalKickKeeperSpot(keeper.team, half));
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
  keeper.actionCooldown = 0.72;
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
  "Space",
  "ShiftLeft",
  "KeyA",
  "KeyC",
  "KeyD",
  "KeyE",
  "KeyQ",
  "KeyS",
  "KeyW",
  "KeyZ",
]);

function hasP1HumanInput(keys: Set<string>, virtualControls?: VirtualControls) {
  if (virtualControls && (virtualControls.strength > 0.04 || virtualControls.sprint)) return true;
  for (const code of P1_ACTIVITY_KEYS) {
    if (keys.has(code)) return true;
  }
  return false;
}

function noteP1Activity(active: MatchRuntime) {
  active.p1IdleTimer = 0;
  active.p1Autopilot = false;
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

  const shirtMaterial = new THREE.MeshLambertMaterial({ color: shirt });
  const trimMaterial = new THREE.MeshLambertMaterial({ color: trim });
  const shortsMaterial = new THREE.MeshLambertMaterial({ color: shorts });
  const skinMaterial = new THREE.MeshLambertMaterial({ color: skin });
  const hairMaterial = new THREE.MeshLambertMaterial({ color: hair });
  const sockMaterial = new THREE.MeshLambertMaterial({ color: socks });
  const bootMaterial = new THREE.MeshLambertMaterial({ color: boot });
  const featureMaterial = new THREE.MeshBasicMaterial({ color: "#1b120d" });

  const hip = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.22, 0.38), shortsMaterial);
  hip.position.y = 1.0;
  const torso = new THREE.Mesh(createTorsoGeometry(), shirtMaterial);
  torso.position.y = 1.62;
  torso.scale.set(1.08, 1.25, 0.82);
  const shoulderBand = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.1, 0.42), trimMaterial);
  shoulderBand.position.y = 2.15;
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.08), trimMaterial);
  collar.position.set(0, 2.27, 0.21);
  const shortsMesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.36, 0.38), shortsMaterial);
  shortsMesh.position.y = 0.86;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.13, 0.2, 6), skinMaterial);
  neck.position.y = 2.32;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 9, 7), skinMaterial);
  head.name = "head";
  head.scale.set(0.86, 1.12, 0.9);
  head.position.y = 2.58;
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), hairMaterial);
  hairCap.scale.set(0.88, 0.5, 0.94);
  hairCap.position.y = 2.8;

  [-1, 1].forEach((side) => {
    const shoulder = new THREE.Group();
    shoulder.name = side < 0 ? "left-arm" : "right-arm";
    shoulder.position.set(side * 0.58, 2.02, 0.02);
    shoulder.rotation.z = side * 0.16;
    const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.48, 3, 6), shirtMaterial);
    upperArm.position.y = -0.25;
    const elbow = new THREE.Group();
    elbow.name = side < 0 ? "left-elbow" : "right-elbow";
    elbow.position.y = -0.5;
    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.058, 0.38, 3, 6), skinMaterial);
    forearm.position.y = -0.2;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), skinMaterial);
    hand.position.y = -0.43;
    elbow.add(forearm, hand);
    shoulder.add(upperArm, elbow);
    bodyRoot.add(shoulder);
  });

  [-1, 1].forEach((side) => {
    const leg = new THREE.Group();
    leg.name = side < 0 ? "left-leg" : "right-leg";
    leg.position.set(side * 0.22, 0.82, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.66, 3, 7), skinMaterial);
    thigh.position.y = -0.34;
    const knee = new THREE.Group();
    knee.name = side < 0 ? "left-knee" : "right-knee";
    knee.position.y = -0.68;
    const calf = new THREE.Mesh(new THREE.CapsuleGeometry(0.092, 0.62, 3, 7), sockMaterial);
    calf.position.y = -0.32;
    const bootMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.5), bootMaterial);
    bootMesh.name = side < 0 ? "left-boot" : "right-boot";
    bootMesh.position.set(0, -0.67, 0.16);
    knee.add(calf, bootMesh);
    leg.add(thigh, knee);
    bodyRoot.add(leg);
  });

  [-1, 1].forEach((side) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 5, 4), featureMaterial);
    eye.position.set(side * 0.072, 2.64, 0.36);
    bodyRoot.add(eye);
  });
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.01), featureMaterial);
  mouth.position.set(0, 2.49, 0.37);

  bodyRoot.add(hip, torso, shoulderBand, collar, shortsMesh, neck, head, hairCap, mouth);
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
    const arrowHead = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.38, 3),
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.92 }),
    );
    arrowHead.position.z = 1.08;
    arrowHead.rotation.x = Math.PI / 2;
    aimArrow.position.y = 0.13;
    aimArrow.add(arrowHead);
    group.add(aimArrow);
  }
  return group;
}

function makeKit(team: TeamId, role: PlayerRole, accent: string, number: number) {
  const isKeeper = role === "keeper";
  const home = activeHomeTeam;
  const shirt = isKeeper ? (team === "home" ? home.keeper : AWAY_KEEPER_COLOR) : (team === "home" ? home.primary : AWAY_COLOR);
  const trim = isKeeper ? "#111827" : team === "home" ? home.secondary : AWAY_TRIM;
  const shorts = isKeeper ? "#111827" : team === "home" ? home.shorts : AWAY_SHORTS;
  const socks = isKeeper ? "#111827" : team === "home" ? home.socks : "#f8fafc";
  const boot = team === "home" ? "#d1d5db" : "#111827";
  return makeHumanFigure({
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
  const seam = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS * 1.006, 8, 6),
    new THREE.MeshBasicMaterial({ color: "#64748b", wireframe: true, transparent: true, opacity: 0.3 }),
  );
  ball.add(seam);
  for (let i = 0; i < 3; i += 1) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(BALL_RADIUS * 0.74, 0.008, 4, 20),
      new THREE.MeshBasicMaterial({ color: "#cbd5e1", transparent: true, opacity: 0.5 }),
    );
    ring.rotation.set(i === 0 ? Math.PI / 2 : 0, i === 1 ? Math.PI / 2 : 0, i === 2 ? Math.PI / 2 : 0);
    ball.add(ring);
  }
  return ball;
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

function addPitch(scene: THREE.Scene) {
  const runoff = new THREE.Mesh(
    new THREE.BoxGeometry(FIELD_W + TOUCHLINE_MARGIN * 2, 0.16, FIELD_L + TOUCHLINE_MARGIN * 2),
    new THREE.MeshLambertMaterial({ color: "#116b38" }),
  );
  runoff.position.y = -0.08;
  scene.add(runoff);

  const stripeDepth = FIELD_L / 10;
  for (let stripe = 0; stripe < 10; stripe += 1) {
    const color = stripe % 2 === 0 ? "#2f8f4e" : "#237743";
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD_W, stripeDepth + 0.03),
      new THREE.MeshLambertMaterial({ color }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, 0.012, -FIELD_L / 2 + stripeDepth / 2 + stripe * stripeDepth);
    scene.add(grass);
  }

  addFieldMarking(scene, 0, 0, FIELD_W, FIELD_L);
  addFieldMarking(scene, 0, FIELD_L / 2 - 3.5, 20, 7);
  addFieldMarking(scene, 0, -FIELD_L / 2 + 3.5, 20, 7);
  addFieldMarking(scene, 0, FIELD_L / 2 - 9, 44, 18);
  addFieldMarking(scene, 0, -FIELD_L / 2 + 9, 44, 18);
}

function addNetLines(scene: THREE.Scene, side: -1 | 1) {
  const frontZ = side * GOAL_FRONT_Z;
  const backZ = frontZ + side * GOAL_DEPTH;
  const material = new THREE.LineBasicMaterial({ color: "#dbeafe", transparent: true, opacity: 0.58 });
  const points: THREE.Vector3[] = [];
  for (let x = -GOAL_W / 2; x <= GOAL_W / 2 + 0.01; x += 2) {
    points.push(new THREE.Vector3(x, 0.18, frontZ), new THREE.Vector3(x, 0.18, backZ));
    points.push(new THREE.Vector3(x, 3.15, frontZ), new THREE.Vector3(x, 2.6, backZ));
    points.push(new THREE.Vector3(x, 0.18, backZ), new THREE.Vector3(x, 2.6, backZ));
  }
  for (let y = 0.2; y <= 3.15; y += 0.55) {
    points.push(new THREE.Vector3(-GOAL_W / 2, y, backZ), new THREE.Vector3(GOAL_W / 2, y, backZ));
    points.push(new THREE.Vector3(-GOAL_W / 2, y, frontZ), new THREE.Vector3(-GOAL_W / 2, Math.max(0.18, y - 0.35), backZ));
    points.push(new THREE.Vector3(GOAL_W / 2, y, frontZ), new THREE.Vector3(GOAL_W / 2, Math.max(0.18, y - 0.35), backZ));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  scene.add(new THREE.LineSegments(geometry, material));
  const curtain = new THREE.Mesh(
    new THREE.PlaneGeometry(GOAL_W, 2.7, 8, 5),
    new THREE.MeshBasicMaterial({ color: "#dbeafe", wireframe: true, transparent: true, opacity: 0.22 }),
  );
  curtain.position.set(0, 1.48, backZ);
  curtain.rotation.y = side > 0 ? Math.PI : 0;
  scene.add(curtain);
}

function addGoal(scene: THREE.Scene, side: -1 | 1) {
  const goalMat = new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.35 });
  const z = side * GOAL_FRONT_Z;
  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(GOAL_W, 0.34, 0.34), goalMat);
  crossbar.position.set(0, 3.2, z);
  const postA = new THREE.Mesh(new THREE.BoxGeometry(0.34, 3.2, 0.34), goalMat);
  postA.position.set(-GOAL_W / 2, 1.6, z);
  const postB = postA.clone();
  postB.position.x = GOAL_W / 2;
  scene.add(crossbar, postA, postB);
  addNetLines(scene, side);
}

function addLightweightStadium(scene: THREE.Scene) {
  const standMaterial = new THREE.MeshBasicMaterial({ color: "#334155" });
  const seatMaterial = new THREE.MeshBasicMaterial({ color: "#16a3b8" });
  const railMaterial = new THREE.MeshBasicMaterial({ color: "#d1fae5" });
  const adMaterial = new THREE.MeshBasicMaterial({ color: "#0f766e" });
  [
    { x: 0, z: FIELD_L / 2 + 12, w: FIELD_W + 18, d: 8 },
    { x: 0, z: -FIELD_L / 2 - 12, w: FIELD_W + 18, d: 8 },
    { x: FIELD_W / 2 + 11, z: 0, w: 7, d: FIELD_L + 18 },
    { x: -FIELD_W / 2 - 11, z: 0, w: 7, d: FIELD_L + 18 },
  ].forEach((stand) => {
    const base = new THREE.Mesh(new THREE.BoxGeometry(stand.w, 2.2, stand.d), standMaterial);
    base.position.set(stand.x, 1.1, stand.z);
    scene.add(base);
    const seats = new THREE.Mesh(new THREE.BoxGeometry(stand.w * 0.9, 0.18, stand.d * 0.74), seatMaterial);
    seats.position.set(stand.x, 2.35, stand.z);
    scene.add(seats);
  });

  const railA = new THREE.Mesh(new THREE.BoxGeometry(FIELD_W + 18, 0.14, 0.14), railMaterial);
  railA.position.set(0, 2.9, FIELD_L / 2 + 6.1);
  const railB = railA.clone();
  railB.position.z = -FIELD_L / 2 - 6.1;
  const railC = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, FIELD_L + 18), railMaterial);
  railC.position.set(FIELD_W / 2 + 6.1, 2.9, 0);
  const railD = railC.clone();
  railD.position.x = -FIELD_W / 2 - 6.1;
  scene.add(railA, railB, railC, railD);

  [-1, 1].forEach((side) => {
    const longBoard = new THREE.Mesh(new THREE.BoxGeometry(FIELD_W + 8, 1.0, 0.16), adMaterial);
    longBoard.position.set(0, 0.75, side * (FIELD_L / 2 + 4.7));
    scene.add(longBoard);
    const sideBoard = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.0, FIELD_L + 8), adMaterial);
    sideBoard.position.set(side * (FIELD_W / 2 + 4.7), 0.75, 0);
    scene.add(sideBoard);
  });
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

function createPlayer(id: string, team: TeamId, role: PlayerRole, line: PlayerLine, x: number, z: number, number: number, controlledBy?: "p1" | "p2") {
  const mesh = makeKit(team, role, controlledBy === "p2" ? "#fef08a" : "#ffffff", number);
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
    kickTimer: 0,
    actionCooldown: 0,
    tackleTimer: 0,
    tackleCooldown: 0,
    recoveryTimer: 0,
    catchTimer: 0,
    diveTimer: 0,
    diveSide: 0,
    celebrateTimer: 0,
    yellowCards: 0,
    sentOff: false,
    decisionCooldown: number * 0.035,
    carryTimer: 0,
    stuckTimer: 0,
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
    controlledBy,
  } satisfies PlayerBody;
}

function formationPlayers(mode: GameMode, half: 1 | 2) {
  const players: PlayerBody[] = [];
  (["home", "away"] as TeamId[]).forEach((team) => {
    const side = teamSide(team, half);
    const template = team === "home" ? FORMATION_OPTIONS[activeHomeFormation] : FORMATION_OPTIONS["4-3-3"];
    let fieldIndex = 1;
    template.forEach((slot) => {
      const assignedKey = activeHomeAssignments[slot.slot];
      const squadPlayer = team === "home" ? activeHomeSquad.find((item) => item.player_key === assignedKey) : null;
      const number = squadPlayer?.jersey_number ?? slot.defaultNumber;
      if (slot.line === "keeper") {
        players.push(createPlayer(`${team}-gk`, team, "keeper", "keeper", slot.x, side * (FIELD_L / 2 - 4), number));
      } else {
        const controlledBy = team === "home" && slot.line === "midfielder" && !players.some((player) => player.controlledBy === "p1")
          ? "p1"
          : undefined;
        players.push(createPlayer(`${team}-${fieldIndex}`, team, "field", slot.line, slot.x, side * slot.z, number, controlledBy));
        fieldIndex += 1;
      }
    });
  });
  return players;
}

function setFormationHomes(players: PlayerBody[], half: 1 | 2) {
  const fresh = formationPlayers("ai", half);
  players.forEach((player) => {
    const slot = fresh.find((item) => item.id === player.id);
    if (slot) player.home.copy(slot.home);
  });
}

export function ArcadeSoccerGame() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const keysRef = useRef(new Set<string>());
  const sceneRef = useRef<MatchRuntime | null>(null);
  const frameErrorRef = useRef("");
  const virtualControlsRef = useRef<VirtualControls>({ dir: new THREE.Vector3(), strength: 0, sprint: false });
  const joystickPointerRef = useRef<number | null>(null);
  const setupDirtyRef = useRef(false);
  const runtimeVersionRef = useRef(0);

  const [mode, setMode] = useState<GameMode>("ai");
  const [matchState, setMatchState] = useState<MatchState>("menu");
  const [score, setScore] = useState({ home: 0, away: 0 });
  const [gameClock, setGameClock] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [authStatus, setAuthStatus] = useState("");
  const [showTouchControls, setShowTouchControls] = useState(false);
  const [shotChargeUi, setShotChargeUi] = useState(0);
  const [shotChargePosition, setShotChargePosition] = useState({ x: 0, y: 0 });
  const [phaseUi, setPhaseUi] = useState<PlayPhase>("kickoff");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [joystickKnob, setJoystickKnob] = useState({ x: 0, y: 0 });
  const [onlineProfile, setOnlineProfile] = useState<OnlineProfile | null>(null);
  const [onlineUsername, setOnlineUsername] = useState("");
  const [onlineSearchId, setOnlineSearchId] = useState("");
  const [onlineStatus, setOnlineStatus] = useState("");
  const [incomingRequests, setIncomingRequests] = useState<MatchRequestRow[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<MatchRequestRow[]>([]);
  const [onlineMatch, setOnlineMatch] = useState<OnlineMatchRow | null>(null);
  const [authChecked, setAuthChecked] = useState(!hasSupabaseConfig);
  const [setupTab, setSetupTab] = useState<SetupTab>("team");
  const [selectedTeamKey, setSelectedTeamKey] = useState<FictionalTeamKey>(DEFAULT_TEAM_KEY);
  const [squadPlayers, setSquadPlayers] = useState<SquadPlayer[]>(() => defaultSquadPlayers());
  const [formationName, setFormationName] = useState<FormationKey>("4-3-3");
  const [formationAssignments, setFormationAssignments] = useState<Record<string, string>>(() => defaultFormationAssignments("4-3-3"));
  const [setupStatus, setSetupStatus] = useState("");

  const perfDebugBypass = typeof window !== "undefined"
    && process.env.NODE_ENV !== "production"
    && new URLSearchParams(window.location.search).has("perf");
  const playerLabel = user?.user_metadata?.full_name || user?.email || (perfDebugBypass ? "Perf Test" : "Player");
  const matchScore = useMemo(() => scoreMatch(score.home, score.away), [score]);
  const resultText = score.home > score.away ? "Win" : score.home < score.away ? "Lose" : "Draw";
  const chosenTeam = selectedTeamOption(selectedTeamKey);
  const isSignedIn = Boolean(user) || perfDebugBypass;

  useEffect(() => {
    applyActiveHomeSetup(selectedTeamKey, formationName, squadPlayers, formationAssignments);
  }, [formationAssignments, formationName, selectedTeamKey, squadPlayers]);

  const updateSquadPlayer = useCallback((playerKey: string, patch: Partial<SquadPlayer>) => {
    setupDirtyRef.current = true;
    setSquadPlayers((players) => players.map((player) => (
      player.player_key === playerKey ? { ...player, ...patch } : player
    )));
  }, []);

  const changeFormation = useCallback((nextFormation: FormationKey) => {
    setupDirtyRef.current = true;
    setFormationName(nextFormation);
    setFormationAssignments((current) => {
      const next = defaultFormationAssignments(nextFormation, squadPlayers);
      FORMATION_OPTIONS[nextFormation].forEach((slot) => {
        if (current[slot.slot]) next[slot.slot] = current[slot.slot];
      });
      return next;
    });
  }, [squadPlayers]);

  const selectTeam = useCallback((teamKey: FictionalTeamKey) => {
    setupDirtyRef.current = true;
    setSelectedTeamKey(teamKey);
    applyActiveHomeSetup(teamKey, formationName, squadPlayers, formationAssignments);
    setSetupStatus(`${selectedTeamOption(teamKey).name} selected. Save club setup to keep it online.`);
  }, [formationAssignments, formationName, squadPlayers]);

  const loadTeamSetup = useCallback(async (sessionUser = user) => {
    const supabase = getSupabaseClient();
    if (!supabase || !sessionUser) return;
    const [teamResult, squadResult, formationResult] = await Promise.all([
      supabase.from("teams").select("*").eq("user_id", sessionUser.id).maybeSingle(),
      supabase.from("squads").select("player_key,name,jersey_number,position").eq("user_id", sessionUser.id).order("jersey_number", { ascending: true }),
      supabase.from("formations").select("name,slot_assignments").eq("user_id", sessionUser.id).eq("is_active", true).maybeSingle(),
    ]);
    if (teamResult.error || squadResult.error || formationResult.error) {
      setSetupStatus("Team database is not ready yet. Applying the Supabase SQL will enable saving.");
      return;
    }
    if (setupDirtyRef.current) return;
    const teamKey = teamResult.data?.team_key as FictionalTeamKey | undefined;
    if (teamKey && TEAM_OPTIONS.some((team) => team.key === teamKey)) setSelectedTeamKey(teamKey);
    const loadedSquad = (squadResult.data ?? []) as SquadPlayer[];
    if (loadedSquad.length > 0) setSquadPlayers(loadedSquad);
    const loadedFormation = formationResult.data?.name as FormationKey | undefined;
    if (loadedFormation && FORMATION_OPTIONS[loadedFormation]) {
      setFormationName(loadedFormation);
      setFormationAssignments((formationResult.data?.slot_assignments as Record<string, string> | null) ?? defaultFormationAssignments(loadedFormation, loadedSquad.length ? loadedSquad : defaultSquadPlayers()));
    }
  }, [user]);

  const saveTeamSetup = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !user) {
      setSetupStatus("Sign in with Google before saving team setup.");
      return;
    }
    const team = selectedTeamOption(selectedTeamKey);
    setSetupStatus("Saving team setup...");
    const teamPayload = {
      user_id: user.id,
      team_key: team.key,
      team_name: team.name,
      primary_color: team.primary,
      secondary_color: team.secondary,
      accent_color: team.accent,
    };
    const teamSave = await supabase.from("teams").upsert(teamPayload, { onConflict: "user_id" });
    if (teamSave.error) {
      setSetupStatus(teamSave.error.message);
      return;
    }
    const squadPayload = squadPlayers.map((player) => ({
      user_id: user.id,
      player_key: player.player_key,
      name: player.name.trim() || "Player",
      jersey_number: clamp(Math.floor(Number(player.jersey_number) || 1), 1, 99),
      position: player.position.trim().toUpperCase() || "CM",
    }));
    const squadSave = await supabase.from("squads").upsert(squadPayload, { onConflict: "user_id,player_key" });
    if (squadSave.error) {
      setSetupStatus(squadSave.error.message);
      return;
    }
    await supabase.from("formations").update({ is_active: false }).eq("user_id", user.id);
    const formationSave = await supabase.from("formations").upsert({
      user_id: user.id,
      name: formationName,
      slot_assignments: formationAssignments,
      is_active: true,
    }, { onConflict: "user_id,name" });
    if (formationSave.error) {
      setSetupStatus(formationSave.error.message);
      return;
    }
    setupDirtyRef.current = false;
    setSetupStatus("Saved team, squad, and formation.");
  }, [formationAssignments, formationName, selectedTeamKey, squadPlayers, user]);

  const signInWithGoogle = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || typeof window === "undefined") {
      setAuthStatus("Google sign-in needs Supabase env vars.");
      return;
    }
    const redirectOrigin = window.location.hostname.includes("localhost")
      ? window.location.origin
      : "https://fifaonline.vercel.app";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectOrigin },
    });
    if (error) setAuthStatus(error.message);
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setOnlineProfile(null);
    setIncomingRequests([]);
    setOutgoingRequests([]);
    setOnlineMatch(null);
    setMatchState("menu");
    setAuthStatus("Signed out. Please sign in to play.");
  }, []);

  const loadOnlineProfile = useCallback(async (sessionUser = user) => {
    const supabase = getSupabaseClient();
    if (!supabase || !sessionUser) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, game_id")
      .eq("id", sessionUser.id)
      .maybeSingle();
    if (error) {
      setOnlineStatus("Online multiplayer tables are not ready yet.");
      return;
    }
    if (data) {
      setOnlineProfile(data as OnlineProfile);
      setOnlineUsername((data as OnlineProfile).username);
    }
  }, [user]);

  const fetchOnlineRequests = useCallback(async (sessionUser = user) => {
    const supabase = getSupabaseClient();
    if (!supabase || !sessionUser) return;
    const [incoming, outgoing, activeMatch] = await Promise.all([
      supabase.from("match_requests").select("*").eq("to_user", sessionUser.id).eq("status", "pending").order("created_at", { ascending: false }).limit(8),
      supabase.from("match_requests").select("*").eq("from_user", sessionUser.id).eq("status", "pending").order("created_at", { ascending: false }).limit(8),
      supabase.from("online_matches").select("*").or(`home_user.eq.${sessionUser.id},away_user.eq.${sessionUser.id}`).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (incoming.error || outgoing.error) {
      setOnlineStatus("Online multiplayer tables are not ready yet.");
      return;
    }
    setIncomingRequests((incoming.data ?? []) as MatchRequestRow[]);
    setOutgoingRequests((outgoing.data ?? []) as MatchRequestRow[]);
    setOnlineMatch((activeMatch.data ?? null) as OnlineMatchRow | null);
  }, [user]);

  const saveOnlineProfile = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !user) {
      setOnlineStatus("Sign in with Google to create an online ID.");
      return;
    }
    const username = onlineUsername.trim();
    if (!nicknameIsValid(username)) {
      setOnlineStatus("Username must be 2-16 letters, numbers, spaces, _ or -.");
      return;
    }
    const gameId = onlineProfile?.game_id ?? `FO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const { data, error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, username, game_id: gameId }, { onConflict: "id" })
      .select("id, username, game_id")
      .single();
    if (error) {
      setOnlineStatus(error.message);
      return;
    }
    setOnlineProfile(data as OnlineProfile);
    setOnlineStatus(`Online ID ready: ${(data as OnlineProfile).game_id}`);
  }, [onlineProfile?.game_id, onlineUsername, user]);

  const sendMatchRequest = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !user || !onlineProfile) {
      setOnlineStatus("Create an online ID before sending match requests.");
      return;
    }
    const gameId = onlineSearchId.trim().toUpperCase();
    if (!gameId) return;
    const { data: target, error: targetError } = await supabase
      .from("profiles")
      .select("id, username, game_id")
      .eq("game_id", gameId)
      .maybeSingle();
    if (targetError || !target) {
      setOnlineStatus("No user found with that ID.");
      return;
    }
    if ((target as OnlineProfile).id === user.id) {
      setOnlineStatus("You cannot challenge yourself.");
      return;
    }
    const { error } = await supabase.from("match_requests").insert({
      from_user: user.id,
      to_user: (target as OnlineProfile).id,
      status: "pending",
    });
    if (error) {
      setOnlineStatus(error.message);
      return;
    }
    setOnlineStatus(`Request sent to ${(target as OnlineProfile).username}.`);
    await fetchOnlineRequests();
  }, [fetchOnlineRequests, onlineProfile, onlineSearchId, user]);


  const requestTackle = useCallback((controller: "p1" | "p2") => {
    const active = sceneRef.current;
    const player = active?.players.find((item) => item.controlledBy === controller);
    if (!active || !player || active.state !== "playing" || active.phase !== "open") return;
    attemptTackle(player, active);
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

  const performMobileAction = useCallback((action: "pass" | "through" | "shoot" | "fullscreen") => {
    const active = sceneRef.current;
    const p1 = active?.players.find((player) => player.controlledBy === "p1");
    if (action === "fullscreen") {
      void requestGameFullscreen();
      return;
    }
    if (!active || !p1 || active.state !== "playing" || active.phase !== "open") return;
    if (action === "pass") performPass(p1, active, "short");
    if (action === "through") performPass(p1, active, "through");
    if (action === "shoot") shoot(p1, active, "shot");
  }, [requestGameFullscreen]);

  const resetPositions = useCallback((servingTeam: TeamId = "home") => {
    const active = sceneRef.current;
    if (!active) return;
    active.players.forEach((player) => {
      player.pos.copy(player.home);
      player.vel.set(0, 0, 0);
      player.heading = headingForHome(player.home.z);
      player.turnRate = 0;
      player.mesh.rotation.y = player.heading;
      player.mesh.position.copy(player.pos);
      player.runPhase = 0;
      player.kickTimer = 0;
      player.actionCooldown = 0;
      player.tackleTimer = 0;
      player.tackleCooldown = 0;
      player.recoveryTimer = 0;
      player.catchTimer = 0;
      player.diveTimer = 0;
      player.diveSide = 0;
      player.celebrateTimer = 0;
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
      animatePlayer(player, 0);
    });
    active.ballPos.set(0, BALL_RADIUS, 0);
    active.ballVel.set(0, 0, 0);
    active.cooldown = 1.2;
    active.possession = null;
    active.ballState = "loose";
    active.ballOwnerId = null;
    active.ballIgnorePlayerId = null;
    active.ballIgnoreTimer = 0;
    active.restartProtectionTeam = null;
    active.restartProtectionTimer = 0;
    active.goalKickLockPlayerId = null;
    active.goalKickLockTimer = 0;
    active.restartBoundaryGuardTimer = 0;
    active.p1IdleTimer = 0;
    active.p1Autopilot = false;
    active.pendingKickTarget = null;
    active.lastShotTap = 0;
    active.shotCharge = 0;
    active.shotChargingPlayerId = null;
    active.shotConsumed = false;
    active.tackleLockTimer = 0;
    active.lastTouchTeam = servingTeam;
    active.lastTouchPlayerId = null;
  }, []);

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
      resetPositions("home");
    }
    setMatchState("menu");
    setPhaseUi("kickoff");
    setShotChargeUi(0);
  }, [resetPositions]);

  const startMatch = useCallback((nextMode = mode) => {
    const active = sceneRef.current;
    if (!active) return;
    if (showTouchControls) void requestGameFullscreen();
    ensureAudio(active);
    if (!isSignedIn) {
      setAuthStatus("Sign in with Google before playing.");
      return;
    }
    applyActiveHomeSetup(selectedTeamKey, formationName, squadPlayers, formationAssignments);
    active.mode = nextMode;
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
    active.halftimeDone = false;
    active.eventText = "KICKOFF";
    active.eventTimer = 0;
    active.score = { home: 0, away: 0 };
    active.players.forEach((player) => active.scene.remove(player.mesh));
    active.players = formationPlayers(nextMode, 1);
    active.players.forEach((player) => active.scene.add(player.mesh));
    setMode(nextMode);
    setScore({ home: 0, away: 0 });
    setGameClock(0);
    resetPositions("home");
    if (ENABLE_BLOCKING_WALKOUT) {
      setPhaseUi("walkout");
      beginWalkout(active);
    } else {
      startDirectKickoff(active, "home");
      setPhaseUi(active.phase);
    }
    setMatchState("playing");
  }, [formationAssignments, formationName, isSignedIn, mode, requestGameFullscreen, resetPositions, selectedTeamKey, showTouchControls, squadPlayers]);

  const skipWalkout = useCallback(() => {
    const active = sceneRef.current;
    if (!active || active.state !== "playing") return;
    if (active.phase !== "walkout" && phaseUi !== "walkout") return;
    finishWalkoutToKickoff(active);
    setPhaseUi(active.phase);
  }, [phaseUi]);

  const respondToMatchRequest = useCallback(async (request: MatchRequestRow, status: "accepted" | "declined") => {
    const supabase = getSupabaseClient();
    if (!supabase || !user) return;
    const { error } = await supabase.from("match_requests").update({ status, responded_at: new Date().toISOString() }).eq("id", request.id).eq("to_user", user.id);
    if (error) {
      setOnlineStatus(error.message);
      return;
    }
    if (status === "accepted") {
      const { data: match, error: matchError } = await supabase
        .from("online_matches")
        .insert({ home_user: request.from_user, away_user: user.id, status: "active", state: { kickoff: Date.now() } })
        .select("*")
        .single();
      if (matchError) {
        setOnlineStatus(matchError.message);
        return;
      }
      const playersSave = await supabase.from("match_players").insert([
        { match_id: (match as OnlineMatchRow).id, user_id: request.from_user, team_side: "home", ready: true },
        { match_id: (match as OnlineMatchRow).id, user_id: user.id, team_side: "away", ready: true },
      ]);
      if (playersSave.error) {
        setOnlineStatus(playersSave.error.message);
        return;
      }
      setOnlineMatch(match as OnlineMatchRow);
      setOnlineStatus("Online room created. Choose Online mode and press Kick off when both players are ready.");
      setMode("online");
    } else {
      setOnlineStatus("Request declined.");
    }
    await fetchOnlineRequests();
  }, [fetchOnlineRequests, user]);

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
    const supabase = getSupabaseClient();
    if (!supabase) return undefined;
    void supabase.auth.getSession().then(({ data }) => {
      const sessionUser = data.session?.user ?? null;
      setUser(sessionUser);
      if (sessionUser) {
        const fallbackName = sessionUser.user_metadata?.full_name || sessionUser.email || "Player";
        setOnlineUsername((current) => current || String(fallbackName).slice(0, 16));
        void loadOnlineProfile(sessionUser);
        void loadTeamSetup(sessionUser);
        void fetchOnlineRequests(sessionUser);
      }
      setAuthChecked(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);
      if (sessionUser) {
        const fallbackName = sessionUser.user_metadata?.full_name || sessionUser.email || "Player";
        setOnlineUsername((current) => current || String(fallbackName).slice(0, 16));
        void loadOnlineProfile(sessionUser);
        void loadTeamSetup(sessionUser);
        void fetchOnlineRequests(sessionUser);
        setAuthStatus("");
      } else {
        setMatchState("menu");
      }
      setAuthChecked(true);
    });
    return () => data.subscription.unsubscribe();
  }, [fetchOnlineRequests, loadOnlineProfile, loadTeamSetup]);

  useEffect(() => {
    if (!user || !hasSupabaseConfig || matchState === "playing") return undefined;
    const supabase = getSupabaseClient();
    if (!supabase) return undefined;
    const timer = window.setInterval(() => {
      void fetchOnlineRequests(user);
    }, 4500);
    const channel = supabase
      .channel(`online-lobby-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "match_requests", filter: `to_user=eq.${user.id}` }, () => void fetchOnlineRequests(user))
      .on("postgres_changes", { event: "*", schema: "public", table: "match_requests", filter: `from_user=eq.${user.id}` }, () => void fetchOnlineRequests(user))
      .on("postgres_changes", { event: "*", schema: "public", table: "online_matches" }, () => void fetchOnlineRequests(user))
      .subscribe();
    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [fetchOnlineRequests, matchState, user]);

  useEffect(() => {
    if (!user || !onlineMatch || matchState !== "playing" || mode !== "online") return undefined;
    const supabase = getSupabaseClient();
    if (!supabase) return undefined;
    const sync = window.setInterval(() => {
      const active = sceneRef.current;
      if (!active) return;
      const controlled = active.players.find((player) => player.controlledBy === "p1");
      void supabase
        .from("online_matches")
        .update({
          state: {
            clock: active.gameClock,
            score: active.score,
            ball: { x: active.ballPos.x, y: active.ballPos.y, z: active.ballPos.z },
            player: controlled ? { x: controlled.pos.x, z: controlled.pos.z } : null,
            updatedBy: user.id,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", onlineMatch.id);
    }, 700);
    const channel = supabase
      .channel(`online-match-${onlineMatch.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "online_matches", filter: `id=eq.${onlineMatch.id}` }, () => {
        setOnlineStatus("Online match state synced.");
      })
      .subscribe();
    return () => {
      window.clearInterval(sync);
      void supabase.removeChannel(channel);
    };
  }, [matchState, mode, onlineMatch, user]);

  useEffect(() => {
    if (!isSignedIn) return;
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#86cfff");
    scene.fog = new THREE.Fog("#8fd3ff", 95, 210);

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

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(1);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = false;
    mount.appendChild(renderer.domElement);
    const pointer = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    const fieldPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const kickPoint = new THREE.Vector3();
    const onFieldPointerDown = (event: PointerEvent) => {
      const active = sceneRef.current;
      if (!active || active.state !== "playing" || active.phase !== "open" || event.button !== 0) return;
      noteP1Activity(active);
      const p1 = active.players.find((player) => player.controlledBy === "p1");
      if (!p1) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, active.camera);
      if (!raycaster.ray.intersectPlane(fieldPlane, kickPoint)) return;
      active.pendingKickTarget = kickPoint.clone().setY(BALL_RADIUS);
      kickTowardPoint(p1, active.pendingKickTarget, active);
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

    const players = formationPlayers("ai", 1);
    players.forEach((player) => scene.add(player.mesh));

    const runtime: MatchRuntime = {
      renderer,
      scene,
      camera,
      cameraLookAt: new THREE.Vector3(0, 0.9, 0),
      ball,
      players,
      frame: 0,
      matchTick: null,
      frameCount: 0,
      lastTime: performance.now(),
      lastRenderTime: 0,
      lastMatchUpdate: performance.now(),
      lastHudUpdate: 0,
      mode: "ai",
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
      score: { home: 0, away: 0 },
      cooldown: 0,
      possession: null,
      ballState: "loose",
      ballOwnerId: null,
      intendedReceiverId: null,
      ballIgnorePlayerId: null,
      ballIgnoreTimer: 0,
      pendingKickTarget: null,
      lastShotTap: 0,
      shotCharge: 0,
      shotChargingPlayerId: null,
      shotConsumed: false,
      tackleLockTimer: 0,
      audio: null,
      lastKickSound: 0,
      lastCheerSound: 0,
      lastTouchTeam: "home",
      lastTouchPlayerId: null,
      aiChanceCooldown: 0,
      restartProtectionTeam: null,
      restartProtectionTimer: 0,
      goalKickLockPlayerId: null,
      goalKickLockTimer: 0,
      restartBoundaryGuardTimer: 0,
      p1IdleTimer: 0,
      p1Autopilot: false,
      perfElement,
      perfFrames: 0,
      perfFrameTotal: 0,
      perfLastReport: performance.now(),
    };
    sceneRef.current = runtime;

    const onResize = () => {
      if (runtimeVersionRef.current !== runtimeVersion || sceneRef.current !== runtime || !mount) return;
      runtime.camera.aspect = mount.clientWidth / mount.clientHeight;
      runtime.camera.updateProjectionMatrix();
      runtime.renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    const runMatchTick = () => {
      if (runtimeVersionRef.current !== runtimeVersion || sceneRef.current !== runtime) return;
      const active = runtime;
      if (active.state !== "playing") return;
      const now = performance.now();
      const dt = Math.min(Math.max((now - active.lastMatchUpdate) / 1000, 0), 0.05);
      active.lastMatchUpdate = now;
      if (dt <= 0) return;
      const clockBeforeUpdate = active.gameClock;
      try {
        active.cooldown = Math.max(0, active.cooldown - dt);
        updateMatch(active, keysRef.current, dt, virtualControlsRef.current);
        active.frameCount += 1;
        if (frameErrorRef.current) frameErrorRef.current = "";
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (active.phase === "open" && active.gameClock === clockBeforeUpdate) {
          active.gameClock = Math.min(FULL_TIME_SECONDS, active.gameClock + dt * CLOCK_SPEED);
        }
        if (frameErrorRef.current !== message) {
          frameErrorRef.current = message;
          console.error("Fifa Online match update error", error);
        }
      }

      const chargingPlayer = active.shotChargingPlayerId
        ? active.players.find((player) => player.id === active.shotChargingPlayerId)
        : null;
      const shouldUpdateHud = performance.now() - active.lastHudUpdate > (chargingPlayer ? 90 : 180);
      if (shouldUpdateHud) {
        active.lastHudUpdate = performance.now();
        setScore({ ...active.score });
        setGameClock(active.gameClock);
        setPhaseUi(active.phase);
        setShotChargeUi(chargingPlayer ? active.shotCharge : 0);
        if (chargingPlayer) setShotChargePosition(playerScreenGaugePosition(active, chargingPlayer));
      }
      if (active.gameClock >= FULL_TIME_SECONDS) {
        active.state = "ended";
        setMatchState("ended");
      }
    };

    runtime.matchTick = window.setInterval(runMatchTick, 1000 / 20);

    const frame = (time: number) => {
      if (runtimeVersionRef.current !== runtimeVersion || sceneRef.current !== runtime) return;
      const active = runtime;
      const rawFrameMs = Math.max(0, time - active.lastTime);
      const dt = Math.min(rawFrameMs / 1000, 0.033);
      active.lastTime = time;
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
        active.frame = requestAnimationFrame(frame);
        return;
      }
      active.lastRenderTime = time;

      try {
        const controlledFocus = active.players.find((player) => player.controlledBy === "p1");
        const playerFocus = controlledFocus?.pos ?? active.ballPos;
        const blendedFocus = active.ballPos.clone().lerp(playerFocus, 0.22);
        const focusZ = clamp(blendedFocus.z, -FIELD_L / 2 - 10, FIELD_L / 2 + 10);
        const shouldFollowPlay = active.state === "playing" && active.phase !== "walkout" && active.phase !== "halftime";
        const desired = active.phase === "walkout"
          ? new THREE.Vector3(BROADCAST_CAMERA_X + 5, 11.2, -8)
          : shouldFollowPlay
            ? new THREE.Vector3(BROADCAST_CAMERA_X, BROADCAST_CAMERA_Y, focusZ + BROADCAST_CAMERA_Z_OFFSET)
            : new THREE.Vector3(
              BROADCAST_CAMERA_X,
              BROADCAST_CAMERA_Y,
              BROADCAST_CAMERA_Z,
            );
        desired.z = clamp(desired.z, -FIELD_L / 2 - 10, FIELD_L / 2 + 10);
        active.camera.position.lerp(desired, shouldFollowPlay || active.phase === "walkout" ? 1 - Math.pow(0.0008, dt) : 1);
        const desiredLookAt = active.phase === "walkout"
          ? new THREE.Vector3(-4, 1.45, 0)
          : shouldFollowPlay
            ? new THREE.Vector3(BROADCAST_LOOK_AT_X, BROADCAST_LOOK_AT_Y, focusZ)
            : new THREE.Vector3(
              BROADCAST_LOOK_AT_X,
              BROADCAST_LOOK_AT_Y,
              BROADCAST_LOOK_AT_Z,
            );
        active.cameraLookAt.lerp(desiredLookAt, shouldFollowPlay || active.phase === "walkout" ? 1 - Math.pow(0.0016, dt) : 1);
        active.camera.up.set(0, 1, 0);
        active.camera.lookAt(active.cameraLookAt);
        active.renderer.render(active.scene, active.camera);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (frameErrorRef.current !== message) {
          frameErrorRef.current = message;
          console.error("Fifa Online render error", error);
        }
      }
      active.frame = requestAnimationFrame(frame);
    };
    runtime.frame = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", onResize);
      if (runtimeVersionRef.current === runtimeVersion) runtimeVersionRef.current += 1;
      cancelAnimationFrame(runtime.frame);
      if (runtime.matchTick !== null) window.clearInterval(runtime.matchTick);
      runtime.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const material = object.material;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material.dispose();
      });
      runtime.renderer.dispose();
      runtime.renderer.domElement.removeEventListener("pointerdown", onFieldPointerDown);
      runtime.perfElement?.remove();
      if (runtime.renderer.domElement.parentElement === mount) {
        mount.removeChild(runtime.renderer.domElement);
      }
      if (sceneRef.current === runtime) sceneRef.current = null;
    };
  }, [isSignedIn]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      keysRef.current.add(event.code);
      const active = sceneRef.current;
      if (active?.state === "playing" && P1_ACTIVITY_KEYS.has(event.code)) noteP1Activity(active);
      if (!event.repeat && active?.state === "playing" && active.phase === "open") {
        if (event.code === "KeyE") {
          switchToBestManualPlayer(active, "p1");
          event.preventDefault();
          return;
        }
        const p1 = active.players.find((player) => player.controlledBy === "p1");
        if (event.code === "KeyD" && p1) {
          beginShotCharge(p1, active, keysRef.current);
          event.preventDefault();
          return;
        }
        if (p1) handleFifaActionKey(p1, event.code, keysRef.current, active);
      }
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "KeyA", "KeyD", "KeyE", "KeyS", "KeyW"].includes(event.code)) event.preventDefault();
    };
    const up = (event: KeyboardEvent) => {
      const active = sceneRef.current;
      if (event.code === "KeyD" && active?.state === "playing") {
        releaseShotCharge(active, keysRef.current);
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
  }, []);

  if (!isSignedIn) {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[#7dd3fc] text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.75),transparent_24%),radial-gradient(circle_at_80%_12%,rgba(253,224,71,0.7),transparent_20%),linear-gradient(135deg,#7dd3fc_0%,#a78bfa_48%,#fb7185_100%)]" />
        <div className="absolute -left-16 top-16 h-48 w-48 rounded-full bg-lime-300/45" />
        <div className="absolute -right-20 bottom-20 h-56 w-56 rounded-full bg-yellow-300/45" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-emerald-500 via-emerald-400 to-transparent" />
        <div className="absolute bottom-16 left-1/2 h-24 w-[120vw] -translate-x-1/2 rounded-[50%] border-t-[12px] border-white/70" />
        <div className="absolute left-[13%] top-[24%] h-24 w-20 rotate-[-8deg] rounded-[2rem] bg-cyan-400">
          <div className="absolute -top-9 left-5 h-12 w-12 rounded-full bg-amber-200" />
          <div className="absolute -top-12 left-6 h-6 w-10 rounded-full bg-slate-800" />
          <div className="absolute left-3 top-6 h-5 w-14 rounded-full bg-white/80" />
          <div className="absolute -bottom-9 left-2 h-12 w-5 rounded-full bg-blue-900" />
          <div className="absolute -bottom-9 right-2 h-12 w-5 rounded-full bg-blue-900" />
        </div>
        <div className="absolute right-[15%] top-[30%] h-24 w-20 rotate-[9deg] rounded-[2rem] bg-rose-500">
          <div className="absolute -top-9 left-5 h-12 w-12 rounded-full bg-orange-200" />
          <div className="absolute -top-12 left-4 h-7 w-12 rounded-full bg-yellow-900" />
          <div className="absolute left-3 top-6 h-5 w-14 rounded-full bg-white/85" />
          <div className="absolute -bottom-9 left-2 h-12 w-5 rounded-full bg-white" />
          <div className="absolute -bottom-9 right-2 h-12 w-5 rounded-full bg-white" />
        </div>
        <div className="absolute left-[42%] top-[26%] h-16 w-16 rounded-full border-[8px] border-slate-900 bg-white">
          <div className="absolute left-5 top-2 h-5 w-5 rounded-sm bg-slate-900" />
          <div className="absolute bottom-2 right-3 h-4 w-4 rounded-sm bg-slate-900" />
        </div>
        {Array.from({ length: 24 }).map((_, index) => (
          <span
            key={index}
            className="absolute h-3 w-2 rounded-full bg-white/80"
            style={{
              left: `${6 + (index * 37) % 88}%`,
              top: `${8 + (index * 19) % 52}%`,
              transform: `rotate(${index * 31}deg)`,
              backgroundColor: ["#fef08a", "#67e8f9", "#fda4af", "#bbf7d0"][index % 4],
            }}
          />
        ))}
        <section className="relative z-10 grid min-h-screen place-items-center px-5 py-10 text-center">
          <div className="w-full max-w-xl rounded-[2rem] border-4 border-white/70 bg-slate-950/70 p-6 sm:p-8">
            <div className="relative mx-auto mb-4 h-20 w-20 rounded-full border-4 border-white bg-white">
              <span className="absolute left-7 top-3 h-6 w-6 rounded-md bg-slate-950" />
              <span className="absolute bottom-4 left-4 h-5 w-5 rounded-md bg-slate-950" />
              <span className="absolute bottom-4 right-4 h-5 w-5 rounded-md bg-slate-950" />
            </div>
            <h1 className="text-5xl font-black tracking-normal text-white drop-shadow sm:text-7xl">Fifa Online</h1>
            <p className="mx-auto mt-3 max-w-md text-base font-bold text-cyan-50/90 sm:text-lg">
              Build your club, set your squad, and kick off colorful arcade football.
            </p>
            <button
              className="mt-7 w-full rounded-2xl bg-white px-6 py-4 text-lg font-black text-slate-950 shadow-xl transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-55"
              disabled={!hasSupabaseConfig || !authChecked}
              onClick={signInWithGoogle}
            >
              Sign in with Google
            </button>
            {!hasSupabaseConfig && <p className="mt-3 text-sm font-bold text-yellow-100">Supabase env vars are required before playing.</p>}
            {!authChecked && hasSupabaseConfig && <p className="mt-3 text-sm font-bold text-cyan-50/80">Checking login...</p>}
            {authStatus && <p className="mt-3 text-sm font-bold text-yellow-100">{authStatus}</p>}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07110c] text-white">
      <div ref={mountRef} className="absolute inset-0" aria-label="3D arcade soccer match" />
      <section className="pointer-events-none relative z-10 flex min-h-screen flex-col justify-between p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-normal sm:text-4xl">Fifa Online</h1>
            <p className="mt-1 text-sm text-emerald-100/70">11v11 arcade soccer · one active player · AI teammates</p>
            {matchState === "playing" && (
              <div className="mt-3 inline-flex items-center rounded-md border border-white/15 bg-black/70 px-3 py-2 text-sm font-black text-white">
                <span className="text-cyan-100">Home</span>
                <span className="mx-2 font-mono text-lg">{score.home} - {score.away}</span>
                <span className="text-rose-100">Away</span>
                <span className="mx-2 text-white/35">|</span>
                <span className="font-mono text-emerald-100">{formatSoccerClock(gameClock)}</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <div className="pointer-events-auto flex min-w-48 max-w-full items-center gap-2 rounded-md border border-white/10 bg-black/65 px-3 py-2">
              <UserCircle size={18} className="shrink-0 text-cyan-200" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold text-white">{playerLabel}</div>
                <div className="text-[10px] uppercase text-emerald-100/55">Signed in</div>
              </div>
              <button aria-label="Sign out" className="grid h-8 w-8 place-items-center rounded-md border border-white/10" onClick={signOut}>
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>
        <div />
      </section>
      {matchState === "playing" && (
        <button
          type="button"
          className="pointer-events-auto fixed right-4 top-28 z-[70] rounded-md border border-rose-200/30 bg-rose-500/85 px-4 py-2 text-xs font-black uppercase tracking-wide text-white active:bg-rose-400/85 sm:right-6"
          onClick={endMatch}
        >
          End game
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
      {ENABLE_BLOCKING_WALKOUT && matchState === "playing" && phaseUi === "walkout" && (
        <button
          type="button"
          className="pointer-events-auto fixed left-1/2 top-24 z-[70] -translate-x-1/2 rounded-full border border-white/20 bg-black/80 px-5 py-2 text-xs font-black uppercase tracking-wide text-white active:bg-white/15"
          style={{ touchAction: "manipulation" }}
          onClick={skipWalkout}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            skipWalkout();
          }}
        >
          Skip walkout
        </button>
      )}
      {matchState === "playing" && !showTouchControls && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-between px-4 sm:px-6">
          <button
            aria-label="Player one tackle"
            className="pointer-events-auto rounded-md border border-cyan-100/25 bg-cyan-300/20 px-4 py-3 text-sm font-black text-cyan-50 active:bg-cyan-200/30"
            onClick={() => requestTackle("p1")}
          >
            Tackle
          </button>
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
            style={{ left: "calc(env(safe-area-inset-left) + 1rem)", bottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
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
            className="pointer-events-auto absolute h-56 w-60 sm:h-60 sm:w-64"
            style={{ right: "calc(env(safe-area-inset-right) + 1rem)", bottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
          >
            <div className="absolute left-2 top-14 sm:left-4 sm:top-16">
              <TouchButton label="Through" tone="yellow" onPress={() => performMobileAction("through")} />
            </div>
            <div className="absolute bottom-1 left-0 sm:bottom-2 sm:left-2">
              <TouchButton label="Pass" tone="cyan" onPress={() => performMobileAction("pass")} />
            </div>
            <div className="absolute right-1 top-4 sm:right-2 sm:top-6">
              <TouchButton label="Shoot" tone="red" strong onPress={() => performMobileAction("shoot")} />
            </div>
          </div>

          <button
            className="pointer-events-auto absolute rounded-full border border-white/15 bg-black/55 px-4 py-2 text-xs font-black text-white active:bg-white/15"
            style={{ right: "calc(env(safe-area-inset-right) + 1rem)", top: "calc(env(safe-area-inset-top) + 5.6rem)" }}
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
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/65 p-4">
          <div className="w-full max-w-2xl rounded-md border border-emerald-300/25 bg-[#08130d]/96 p-5">
            <div className="mb-4 flex items-center gap-3">
              {matchState === "ended" ? <Trophy className="text-lime-300" /> : <Users className="text-cyan-300" />}
              <div>
                <h2 className="text-xl font-black">{matchState === "ended" ? `${resultText} ${score.home}-${score.away}` : "Clubhouse"}</h2>
                <p className="text-sm text-white/65">
                  {matchState === "ended" ? `Score value ${matchScore}` : "Set your fictional club, squad, formation, and match mode before kickoff."}
                </p>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-5 gap-2 text-xs font-black uppercase">
              {(["team", "squad", "formation", "match", "online"] as SetupTab[]).map((tab) => (
                <button
                  key={tab}
                  className={`rounded-md border px-2 py-2 ${setupTab === tab ? "border-cyan-200 bg-cyan-300/20 text-cyan-50" : "border-white/10 bg-white/5 text-white/65"}`}
                  onClick={() => setSetupTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>

            {setupTab === "team" && (
              <div className="mb-4 rounded-md border border-white/10 bg-white/5 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-black text-cyan-100">Team selection</div>
                  <div className="rounded-full border border-lime-200/25 bg-lime-300/15 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-lime-100">
                    Selected: {chosenTeam.name}
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {TEAM_OPTIONS.map((team) => (
                    <button
                      key={team.key}
                      type="button"
                      aria-pressed={selectedTeamKey === team.key}
                      className={`rounded-md border p-3 text-left transition ${selectedTeamKey === team.key ? "border-lime-200 bg-lime-300/15 ring-2 ring-lime-200/45" : "border-white/10 bg-black/25 hover:bg-white/10"}`}
                      onClick={() => selectTeam(team.key)}
                    >
                      <div className="mb-2 flex gap-1">
                        <span className="h-5 flex-1 rounded" style={{ backgroundColor: team.primary }} />
                        <span className="h-5 flex-1 rounded" style={{ backgroundColor: team.secondary }} />
                        <span className="h-5 flex-1 rounded" style={{ backgroundColor: team.accent }} />
                      </div>
                      <div className="font-black">{team.name}</div>
                      <div className="text-xs text-white/55">Kit preview</div>
                    </button>
                  ))}
                </div>
                <button type="button" className="mt-3 rounded-md bg-lime-300 px-4 py-2 text-sm font-black text-slate-950" onClick={saveTeamSetup}>
                  Save {chosenTeam.name} setup
                </button>
                {setupStatus && <p className="mt-2 text-xs text-cyan-100/75">{setupStatus}</p>}
              </div>
            )}

            {setupTab === "squad" && (
              <div className="mb-4 max-h-[46vh] overflow-auto rounded-md border border-white/10 bg-white/5 p-3">
                <div className="mb-3 text-sm font-black text-cyan-100">Squad management</div>
                <div className="space-y-2">
                  {squadPlayers.map((player) => (
                    <div key={player.player_key} className="grid grid-cols-[1fr_64px_84px] gap-2">
                      <input
                        className="rounded-md border border-white/10 bg-black/35 px-3 py-2 text-sm outline-none focus:border-cyan-300"
                        value={player.name}
                        onChange={(event) => updateSquadPlayer(player.player_key, { name: event.target.value })}
                      />
                      <input
                        className="rounded-md border border-white/10 bg-black/35 px-2 py-2 text-sm outline-none focus:border-cyan-300"
                        type="number"
                        min={1}
                        max={99}
                        value={player.jersey_number}
                        onChange={(event) => updateSquadPlayer(player.player_key, { jersey_number: clamp(Number(event.target.value), 1, 99) })}
                      />
                      <input
                        className="rounded-md border border-white/10 bg-black/35 px-2 py-2 text-sm uppercase outline-none focus:border-cyan-300"
                        value={player.position}
                        onChange={(event) => updateSquadPlayer(player.player_key, { position: event.target.value.toUpperCase().slice(0, 4) })}
                      />
                    </div>
                  ))}
                </div>
                <button className="mt-3 rounded-md bg-lime-300 px-4 py-2 text-sm font-black text-slate-950" onClick={saveTeamSetup}>
                  Save squad
                </button>
                {setupStatus && <p className="mt-2 text-xs text-cyan-100/75">{setupStatus}</p>}
              </div>
            )}

            {setupTab === "formation" && (
              <div className="mb-4 rounded-md border border-white/10 bg-white/5 p-3">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-black text-cyan-100">Formation setup</div>
                    <div className="text-xs text-white/55">Assign your squad to each slot.</div>
                  </div>
                  <select
                    className="rounded-md border border-white/10 bg-black/45 px-3 py-2 text-sm font-bold outline-none"
                    value={formationName}
                    onChange={(event) => changeFormation(event.target.value as FormationKey)}
                  >
                    {(Object.keys(FORMATION_OPTIONS) as FormationKey[]).map((formation) => (
                      <option key={formation} value={formation}>{formation}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {FORMATION_OPTIONS[formationName].map((slot) => (
                    <label key={slot.slot} className="grid grid-cols-[64px_1fr] items-center gap-2 rounded-md bg-black/25 px-3 py-2 text-sm">
                      <span className="font-black text-lime-100">{slot.label}</span>
                      <select
                        className="min-w-0 rounded-md border border-white/10 bg-black/45 px-2 py-2 text-sm outline-none"
                        value={formationAssignments[slot.slot] ?? ""}
                        onChange={(event) => {
                          setupDirtyRef.current = true;
                          setFormationAssignments((current) => ({ ...current, [slot.slot]: event.target.value }));
                        }}
                      >
                        {squadPlayers.map((player) => (
                          <option key={player.player_key} value={player.player_key}>
                            {player.jersey_number} · {player.name} · {player.position}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <button className="mt-3 rounded-md bg-lime-300 px-4 py-2 text-sm font-black text-slate-950" onClick={saveTeamSetup}>
                  Save formation
                </button>
                {setupStatus && <p className="mt-2 text-xs text-cyan-100/75">{setupStatus}</p>}
              </div>
            )}

            {setupTab === "match" && <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <ModeButton active={mode === "ai"} title="Player vs AI Team" onClick={() => setMode("ai")}>
                Control one {chosenTeam.name} player. Teammates and opponents are AI.
              </ModeButton>
              <ModeButton active={mode === "online"} title="Online 1v1 Lobby" onClick={() => setMode("online")}>
                Signed-in users can create an ID, send requests, and start a Supabase room.
              </ModeButton>
            </div>}

            {setupTab === "online" && (
              <div className="mb-4 rounded-md border border-cyan-200/20 bg-cyan-200/8 p-3">
                <div className="mb-2 text-sm font-black text-cyan-100">Online Multiplayer MVP</div>
                <div className="space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        className="min-w-0 flex-1 rounded-md border border-white/15 bg-black/35 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300"
                        maxLength={16}
                        placeholder="Username"
                        value={onlineUsername}
                        onChange={(event) => setOnlineUsername(event.target.value)}
                      />
                      <button className="rounded-md bg-cyan-300 px-4 py-2 text-sm font-bold text-slate-950" onClick={saveOnlineProfile}>
                        Save ID
                      </button>
                    </div>
                    {onlineProfile && (
                      <div className="rounded-md bg-black/30 px-3 py-2 text-sm">
                        Your ID: <span className="font-mono font-black text-lime-200">{onlineProfile.game_id}</span>
                      </div>
                    )}
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        className="min-w-0 flex-1 rounded-md border border-white/15 bg-black/35 px-3 py-2 text-sm uppercase text-white outline-none focus:border-cyan-300"
                        placeholder="Friend ID, e.g. FO-ABC123"
                        value={onlineSearchId}
                        onChange={(event) => setOnlineSearchId(event.target.value)}
                      />
                      <button className="rounded-md bg-lime-300 px-4 py-2 text-sm font-bold text-slate-950" onClick={sendMatchRequest}>
                        Send request
                      </button>
                    </div>
                    {incomingRequests.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-bold uppercase text-cyan-100/70">Incoming requests</div>
                        {incomingRequests.map((request) => (
                          <div key={request.id} className="flex items-center justify-between gap-2 rounded-md bg-white/7 px-3 py-2 text-sm">
                            <span className="font-mono">{request.from_user.slice(0, 8)}</span>
                            <div className="flex gap-2">
                              <button className="rounded bg-emerald-300 px-2 py-1 text-xs font-black text-slate-950" onClick={() => respondToMatchRequest(request, "accepted")}>Accept</button>
                              <button className="rounded bg-white/10 px-2 py-1 text-xs font-black text-white" onClick={() => respondToMatchRequest(request, "declined")}>Decline</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {outgoingRequests.length > 0 && (
                      <p className="text-xs text-white/60">{outgoingRequests.length} pending outgoing request(s).</p>
                    )}
                    {onlineMatch && (
                      <p className="rounded-md bg-emerald-300/15 px-3 py-2 text-xs text-emerald-100">Active room: {onlineMatch.id.slice(0, 8)}. Current MVP creates the room and lobby sync; full deterministic physics sync is documented as limited.</p>
                    )}
                    {onlineStatus && <p className="text-xs text-cyan-100/75">{onlineStatus}</p>}
                </div>
              </div>
            )}

            {setupTab === "match" && <div className="grid grid-cols-2 gap-3">
              <button
                className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-300 px-4 py-3 font-bold text-slate-950 transition hover:bg-emerald-200"
                onClick={() => startMatch(mode)}
              >
                <Play size={18} />
                Kick off
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-md border border-white/15 px-4 py-3 font-bold text-white transition hover:bg-white/10"
                onClick={() => startMatch(mode)}
              >
                <RotateCcw size={18} />
                Restart
              </button>
            </div>}

            {(authStatus || setupStatus) && (
              <div className="mt-5 border-t border-white/10 pt-4">
                {authStatus && <p className="text-sm text-cyan-100/75">{authStatus}</p>}
                {setupStatus && <p className="mt-2 text-sm text-cyan-100/75">{setupStatus}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function updateMatch(
  active: MatchRuntime,
  keys: Set<string>,
  dt: number,
  virtualControls?: VirtualControls,
) {
  const ball = active.ballPos;
  const ballVel = active.ballVel;
  const p1 = active.players.find((player) => player.controlledBy === "p1");
  const p2 = active.players.find((player) => player.controlledBy === "p2");
  const p1HasHumanInput = hasP1HumanInput(keys, virtualControls);
  active.ballIgnoreTimer = Math.max(0, active.ballIgnoreTimer - dt);
  active.tackleLockTimer = Math.max(0, active.tackleLockTimer - dt);
  active.aiChanceCooldown = Math.max(0, active.aiChanceCooldown - dt);
  active.restartProtectionTimer = Math.max(0, active.restartProtectionTimer - dt);
  active.goalKickLockTimer = Math.max(0, active.goalKickLockTimer - dt);
  active.restartBoundaryGuardTimer = Math.max(0, active.restartBoundaryGuardTimer - dt);
  if (active.goalKickLockTimer === 0) active.goalKickLockPlayerId = null;
  if (p1HasHumanInput) {
    active.p1IdleTimer = 0;
    active.p1Autopilot = false;
  } else if (active.state === "playing" && active.phase === "open") {
    active.p1IdleTimer += dt;
    if (active.p1IdleTimer >= 10) active.p1Autopilot = true;
  }
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
  if (active.restartProtectionTimer === 0) active.restartProtectionTeam = null;
  if (active.phase === "open" && active.eventTimer > 0) {
    active.eventTimer = Math.max(0, active.eventTimer - dt);
    if (active.eventTimer === 0) active.eventText = "PLAY";
  }
  const owner = ballOwner(active);
  if (!owner && active.ballState === "possessed") releasePossession(active, "loose");
  active.possession = owner?.team ?? null;

  if (active.phase === "open") {
    active.gameClock = Math.min(FULL_TIME_SECONDS, active.gameClock + dt * CLOCK_SPEED);
    if (!active.halftimeDone && active.gameClock >= HALF_TIME_SECONDS) {
      beginHalftime(active);
      return;
    }
  } else if (active.phase === "walkout") {
    active.phaseTimer = Math.max(0, active.phaseTimer - dt);
    const walkoutSettled = active.players.every((player) => player.pos.distanceTo(walkoutTarget(player)) < 0.7);
    if (walkoutSettled && active.phaseTimer < 5.4) active.phaseTimer = 0;
    if (active.phaseTimer <= 0) finishWalkoutToKickoff(active);
  } else {
    const actor = active.restartActorId ? active.players.find((player) => player.id === active.restartActorId) : null;
    const actorNeedsSpot = active.phase === "throw-in" || active.phase === "kickoff";
    const readyDistance = active.phase === "throw-in" ? 3.2 : active.phase === "goal-kick" ? 2.1 : 1.95;
    const actorReady = !actorNeedsSpot || Boolean(actor && actor.pos.distanceTo(active.restartSpot) < readyDistance);
    active.phaseTimer = Math.max(0, active.phaseTimer - dt * (actorReady ? 1 : 0.42));
    if (active.phaseTimer <= 0) resumeRestart(active);
  }

  active.players.forEach((player) => {
    if (player.sentOff) {
      player.vel.set(0, 0, 0);
      player.pos.set(FIELD_W / 2 + 12, 0, FIELD_L / 2 + 12 + player.number * 0.4);
      player.mesh.position.copy(player.pos);
      return;
    }
    const goalKickLocked = player.id === active.goalKickLockPlayerId || (active.phase === "goal-kick" && player.id === active.restartActorId);
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
    const input: PlayerInputState = active.phase === "open"
      ? player.controlledBy === "p1"
        ? active.p1Autopilot && !p1HasHumanInput
          ? cachedAiInput(player, active, dt)
          : playerInput(keys, "p1", virtualControls, active.camera)
        : player.controlledBy === "p2"
          ? playerInput(keys, "p2")
          : cachedAiInput(player, active, dt)
      : active.phase === "walkout"
        ? walkoutInput(player)
      : restartShapeInput(player, active);
    if (player.supportRunTimer > 0 && active.ballOwnerId !== player.id) {
      const supportDir = player.supportRunTarget.clone().sub(player.pos);
      if (supportDir.lengthSq() > 1) input.dir.lerp(supportDir.normalize(), 0.82).normalize();
    }
    const sprint = (input.sprint || player.supportRunTimer > 0) && player.stamina > 0.12;
    const speedScale = clamp(input.speedScale ?? 1, 0.35, 1);
    const maxSpeed = (player.role === "keeper" ? 5.6 : 12.1) * (sprint ? 1.25 : 1);
    player.stamina = clamp(player.stamina + (sprint ? -0.42 : 0.24) * dt, 0, 1);
    player.kickTimer = Math.max(0, player.kickTimer - dt);
    player.actionCooldown = Math.max(0, player.actionCooldown - dt);
    player.tackleTimer = Math.max(0, player.tackleTimer - dt);
    player.tackleCooldown = Math.max(0, player.tackleCooldown - dt);
    player.recoveryTimer = Math.max(0, player.recoveryTimer - dt);
    player.catchTimer = Math.max(0, player.catchTimer - dt);
    player.diveTimer = Math.max(0, player.diveTimer - dt);
    player.celebrateTimer = Math.max(0, player.celebrateTimer - dt);
    player.decisionCooldown = Math.max(0, player.decisionCooldown - dt);
    player.fallbackTimer = Math.max(0, player.fallbackTimer - dt);
    player.skillTimer = Math.max(0, player.skillTimer - dt);
    player.skillCooldown = Math.max(0, player.skillCooldown - dt);
    if (player.skillTimer === 0) player.skillMove = null;
    player.carryTimer = active.ballOwnerId === player.id ? player.carryTimer + dt : 0;
    player.supportRunTimer = Math.max(0, player.supportRunTimer - dt);
    const recoveryScale = player.recoveryTimer > 0 ? 0.48 : 1;
    movePlayer(player, input.dir, maxSpeed * recoveryScale * speedScale, dt, active);
    if (active.phase !== "walkout") clampPlayer(player);
    player.mesh.position.copy(player.pos);
    animatePlayer(player, dt);
    updateStuckState(player, input.dir, active, dt);
  });
  if (active.frameCount % 2 === 0) separatePlayers(active.players);
  handleGoalkeeperActions(active);
  updateAimIndicators(active, keys);

  if (active.phase === "open") {
    updateUserAutoSwitch(active);
    encourageAiFinishing(active);
    createLateAiChance(active);
    handleAction(p2, keys.has("Enter") || keys.has("ShiftRight"), active);
    if (keys.has("Space") && p1) attemptTackle(p1, active);
    if ((keys.has("Period") || keys.has("Numpad0")) && p2) attemptTackle(p2, active);
  }

  if (active.phase !== "open") {
    const actor = active.restartActorId ? active.players.find((player) => player.id === active.restartActorId) : null;
    if (active.phase === "throw-in" && actor) {
      const hands = throwInHandPoint(actor, active.restartDirection);
      ball.copy(hands);
      setPlayerHeading(actor, Math.atan2(active.restartDirection.x, active.restartDirection.z), dt, 7.5);
      poseThrower(actor, actor.pos.distanceTo(active.restartSpot) < 1.8);
    } else if (active.phase === "goal-kick" && actor) {
      const fixedDirection = upfieldKickDirection(active.restartTeam, active.half);
      actor.pos.copy(goalKickKeeperSpot(active.restartTeam, active.half));
      actor.vel.set(0, 0, 0);
      actor.turnRate = 0;
      actor.heading = headingFromDirection(fixedDirection);
      actor.mesh.rotation.y = actor.heading;
      actor.mesh.position.copy(actor.pos);
      ball.copy(goalKickBallSpot(actor, fixedDirection));
    } else if (active.phase !== "goal") {
      ball.copy(active.restartSpot);
    }
    ballVel.set(0, 0, 0);
  }

  const dribbler = ballOwner(active);
  if (active.phase === "open" && dribbler) {
    const dribblePoint = dribbler.role === "keeper" && dribbler.catchTimer > 0 ? keeperHandPoint(dribbler) : controlledBallPoint(dribbler);
    const attachSnapDistance = dribbler.controlledBy ? 0.95 : 1.35;
    const attachRate = dribbler.controlledBy ? 1 - Math.pow(0.00000000004, dt) : 1 - Math.pow(0.0000008, dt);
    if (dribbler.controlledBy || ball.distanceTo(dribblePoint) > attachSnapDistance) {
      ball.copy(dribblePoint);
    } else {
      ball.lerp(dribblePoint, attachRate);
    }
    if (dribbler.role !== "keeper" || dribbler.catchTimer <= 0) ball.y = BALL_RADIUS;
    ballVel.copy(dribbler.vel).multiplyScalar(dribbler.controlledBy ? 0.96 : 0.82);
  }

  active.players.forEach((player) => {
    if (player.id === active.ballOwnerId) return;
    if (active.ballOwnerId) return;
    const flatBall = new THREE.Vector3(ball.x, 0, ball.z);
    const delta = flatBall.sub(player.pos);
    const distance = delta.length();
    const minDistance = PLAYER_RADIUS + BALL_RADIUS;
    if (player.id === active.ballIgnorePlayerId) {
      const safelyClear = distance > minDistance + 1.25;
      if (active.ballIgnoreTimer > 0 || !safelyClear) return;
      active.ballIgnorePlayerId = null;
    }
    if (active.phase === "open" && distance < minDistance && distance > 0.001) {
      const normal = delta.normalize();
      if (!active.ballOwnerId && canControlBall(player, active)) {
        takePossession(player, active);
        return;
      }
      ball.x = player.pos.x + normal.x * minDistance;
      ball.z = player.pos.z + normal.z * minDistance;
      const approachSpeed = Math.max(0, player.vel.dot(normal) - ballVel.dot(normal) * 0.25);
      const push = clamp(approachSpeed * 0.28, 0.5, 3.8);
      ballVel.x += normal.x * push;
      ballVel.z += normal.z * push;
      if (push > 1.2) playKickSound(active, 0.35 + push * 0.08);
      active.lastTouchTeam = player.team;
      active.lastTouchPlayerId = player.id;
    }
  });

  if (active.phase === "open" && !active.ballOwnerId && active.ballState !== "kicked") {
    const receiver = nearestPlayer(active.players, ball);
    if (receiver && canControlBall(receiver, active)) takePossession(receiver, active);
  }

  capBallVelocity(ballVel);
  if (!active.ballOwnerId) {
    ballVel.y -= BALL_GRAVITY * dt;
    ball.addScaledVector(ballVel, dt);
    if (ball.y < BALL_RADIUS) {
      ball.y = BALL_RADIUS;
      if (ballVel.y < -1.2) ballVel.y = -ballVel.y * BALL_BOUNCE;
      else ballVel.y = 0;
      ballVel.x *= 0.97;
      ballVel.z *= 0.97;
    }
  }
  const crossedSideline = Math.abs(ball.x) > FIELD_W / 2;
  const groundFriction = ball.y <= BALL_RADIUS + 0.05 ? BALL_ROLLING_FRICTION : 0.94;
  ballVel.x *= Math.pow(groundFriction, dt);
  ballVel.z *= Math.pow(groundFriction, dt);
  if (new THREE.Vector3(ballVel.x, 0, ballVel.z).length() < BALL_STOP_SPEED && ball.y <= BALL_RADIUS + 0.05) {
    ballVel.multiplyScalar(Math.pow(0.82, dt));
    if (active.ballState === "kicked") active.ballState = "loose";
  }
  active.ball.position.copy(ball);
  active.ball.rotation.x += ballVel.z * dt / BALL_RADIUS;
  active.ball.rotation.z -= ballVel.x * dt / BALL_RADIUS;

  if (active.phase !== "open") return;

  if (active.restartBoundaryGuardTimer <= 0 && crossedSideline) {
    const spot = new THREE.Vector3(clamp(ball.x, -FIELD_W / 2, FIELD_W / 2), BALL_RADIUS, clamp(ball.z, -FIELD_L / 2 + 5, FIELD_L / 2 - 5));
    stopForRestart(active, "throw-in", opponent(active.lastTouchTeam), spot, `${opponent(active.lastTouchTeam).toUpperCase()} THROW-IN`);
    return;
  }

  const insideGoalMouth = Math.abs(ball.x) < GOAL_W / 2 - BALL_RADIUS * 0.35;
  const deepInNet = Math.abs(ball.z) > GOAL_SCORE_Z;
  if (deepInNet && insideGoalMouth) {
    const goalOwner: TeamId = ball.z > 0 === teamGoalZ("home", active.half) > 0 ? "home" : "away";
    const scoredBy = opponent(goalOwner);
    active.score[scoredBy] += 1;
    playGoalSound(active);
    celebrateGoal(active, goalOwner, scoredBy);
  } else if (active.restartBoundaryGuardTimer <= 0 && Math.abs(ball.z) > FIELD_L / 2 && !insideGoalMouth) {
    const goalOwner: TeamId = ball.z > 0 === teamGoalZ("home", active.half) > 0 ? "home" : "away";
    const attackingTeam = opponent(goalOwner);
    const lastByAttacker = active.lastTouchTeam === attackingTeam;
    if (lastByAttacker) {
      const spotZ = teamGoalZ(goalOwner, active.half) - Math.sign(teamGoalZ(goalOwner, active.half)) * 8;
      stopForRestart(active, "goal-kick", goalOwner, new THREE.Vector3(0, BALL_RADIUS, spotZ), `${goalOwner.toUpperCase()} GOAL KICK`);
    } else {
      const cornerX = ball.x < 0 ? -FIELD_W / 2 + 2 : FIELD_W / 2 - 2;
      const cornerZ = teamGoalZ(goalOwner, active.half);
      stopForRestart(active, "corner", attackingTeam, new THREE.Vector3(cornerX, BALL_RADIUS, cornerZ - Math.sign(cornerZ) * 2), `${attackingTeam.toUpperCase()} CORNER`);
    }
  }
}

function encourageAiFinishing(active: MatchRuntime) {
  let owner = ballOwner(active);
  if (!owner && active.gameClock > 15 * 60 && new THREE.Vector3(active.ballVel.x, 0, active.ballVel.z).length() < 5.5) {
    const flatBall = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
    const finisher = active.players
      .filter((player) => !player.controlledBy && player.role !== "keeper" && !player.sentOff && player.pos.distanceTo(flatBall) < 2.6)
      .sort((a, b) => a.pos.distanceTo(flatBall) - b.pos.distanceTo(flatBall))[0];
    if (finisher && Math.abs(attackingGoalZ(finisher.team, active.half) - finisher.pos.z) < 60) {
      takePossession(finisher, active);
      owner = finisher;
    }
  }
  if (!owner || owner.controlledBy || owner.role === "keeper" || owner.sentOff || active.cooldown > 0.05 || owner.actionCooldown > 0) return;
  const goalDistance = Math.abs(attackingGoalZ(owner.team, active.half) - owner.pos.z);
  const teamAttackSign = Math.sign(attackingGoalZ(owner.team, active.half));
  const furthestForward = active.players
    .filter((player) => player.team === owner.team && player.role !== "keeper" && !player.sentOff)
    .every((player) => player.id === owner.id || (player.pos.z - owner.pos.z) * teamAttackSign <= 1.2);
  const inScoringArea = goalDistance < 32 && Math.abs(owner.pos.x) < GOAL_W * 2.45;
  const mustShoot = furthestForward && goalDistance < 39 && Math.abs(owner.pos.x) < GOAL_W * 2.8;
  const lateMatchRisk = active.gameClock > 15 * 60 && goalDistance < 62 && Math.abs(owner.pos.x) < FIELD_W / 2 - 5;
  if (owner.carryTimer < (inScoringArea ? 0.12 : 0.34)) return;
  const blockers = opponentsBetween(owner, new THREE.Vector3(0, 0, attackingGoalZ(owner.team, active.half)), active.players, inScoringArea ? 7.5 : 5.2);
  if (mustShoot && blockers <= 5) {
    shoot(owner, active, "shot", goalDistance < 23 ? 1.92 : 1.72);
  } else if (inScoringArea && blockers <= 4) {
    shoot(owner, active, chooseAiShotStyle(owner, active, goalDistance, blockers), goalDistance < 24 ? 1.72 : 1.48);
  } else if (lateMatchRisk && blockers <= 4) {
    const goalZ = attackingGoalZ(owner.team, active.half);
    const targetX = clamp(-owner.pos.x * 0.24, -GOAL_W / 2 + 1.6, GOAL_W / 2 - 1.6);
    kickTowardPoint(owner, new THREE.Vector3(targetX, BALL_RADIUS, goalZ + Math.sign(goalZ) * (GOAL_DEPTH + 2.2)), active, "driven");
  }
}

function createLateAiChance(active: MatchRuntime) {
  if (active.aiChanceCooldown > 0 || active.score.home + active.score.away > 0 || active.gameClock < 28 * 60) return;
  const flatBall = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
  const candidate = active.players
    .filter((player) => !player.controlledBy && player.role !== "keeper" && !player.sentOff)
    .map((player) => {
      const goalDistance = Math.abs(attackingGoalZ(player.team, active.half) - player.pos.z);
      return { player, score: player.pos.distanceTo(flatBall) + goalDistance * 0.08 + (player.line === "forward" ? -3 : 0) };
    })
    .sort((a, b) => a.score - b.score)[0]?.player;
  if (!candidate) return;
  const goalZ = attackingGoalZ(candidate.team, active.half);
  const targetX = clamp(-candidate.pos.x * 0.18, -GOAL_W / 2 + 1.1, GOAL_W / 2 - 1.1);
  const target = new THREE.Vector3(targetX, BALL_RADIUS, goalZ + Math.sign(goalZ) * (GOAL_DEPTH + 3.2));
  releasePossession(active, "kicked");
  active.ballPos.copy(controlledBallPoint(candidate)).setY(1.35);
  active.ballVel.copy(target.sub(active.ballPos).setY(0).normalize().multiplyScalar(25.5));
  active.ballVel.y = 4.6;
  active.ballIgnorePlayerId = candidate.id;
  active.ballIgnoreTimer = 0.32;
  active.lastTouchTeam = candidate.team;
  active.lastTouchPlayerId = candidate.id;
  candidate.kickTimer = 0.42;
  candidate.actionCooldown = 0.6;
  active.eventText = "PLAY";
  active.eventTimer = 0;
  playKickSound(active, 0.76);
  active.aiChanceCooldown = 5.8;
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

function beginHalftime(active: MatchRuntime) {
  active.phase = "halftime";
  active.phaseTimer = 3.2;
  active.halftimeDone = true;
  active.eventText = "HALFTIME";
  active.eventTimer = 0;
  active.ballVel.set(0, 0, 0);
  active.players.forEach((player) => player.vel.set(0, 0, 0));
}

function celebrateGoal(active: MatchRuntime, concedingTeam: TeamId, scoredBy: TeamId) {
  const goalSide = Math.sign(active.ballPos.z || teamGoalZ(concedingTeam, active.half));
  active.phase = "goal";
  active.phaseTimer = 3;
  active.restartTeam = concedingTeam;
  active.restartSpot.set(0, BALL_RADIUS, 0);
  active.restartDirection.set(0, 0, Math.sign(attackingGoalZ(concedingTeam, active.half)));
  active.restartActorId = null;
  active.eventText = `${scoredBy.toUpperCase()} GOAL`;
  active.eventTimer = 0;
  active.ballPos.x = clamp(active.ballPos.x, -GOAL_W / 2 + BALL_RADIUS, GOAL_W / 2 - BALL_RADIUS);
  active.ballPos.z = goalSide * Math.min(GOAL_FRONT_Z + GOAL_DEPTH - BALL_RADIUS * 1.2, Math.abs(active.ballPos.z) + BALL_RADIUS * 0.55);
  active.ballVel.set(0, 0, 0);
  releasePossession(active, "loose");
  active.cooldown = Math.max(active.cooldown, 0.45);
  const scorer = active.lastTouchPlayerId ? active.players.find((player) => player.id === active.lastTouchPlayerId) : null;
  active.players.forEach((player) => {
    const closeToScorer = scorer ? player.pos.distanceTo(scorer.pos) < 18 : player.team === scoredBy;
    if (player.team === scoredBy && (closeToScorer || player.line === "forward")) {
      player.celebrateTimer = 2.85;
      player.supportRunTarget.copy(scorer?.pos ?? player.pos).add(new THREE.Vector3((player.number % 3 - 1) * 2.2, 0, 0));
    }
  });
}

function stopForRestart(active: MatchRuntime, phase: PlayPhase, team: TeamId, spot: THREE.Vector3, label: string) {
  active.phase = phase;
  active.phaseTimer = phase === "kickoff" ? 1.8 : phase === "goal-kick" ? 0.08 : 1.15;
  active.restartTeam = team;
  active.restartSpot.copy(spot);
  active.intendedReceiverId = null;
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
  arrangeSetPieceShape(active, phase, team, spot);
  if (phase === "goal-kick") {
    const actor = active.restartActorId ? active.players.find((player) => player.id === active.restartActorId) : null;
    const fixedDirection = upfieldKickDirection(team, active.half);
    active.restartDirection.copy(fixedDirection);
    active.goalKickLockPlayerId = actor?.id ?? null;
    active.goalKickLockTimer = 0.16;
    if (actor) {
      resetKeeperForSimpleGoalKick(actor, fixedDirection, active.half);
      active.ballPos.copy(goalKickBallSpot(actor, fixedDirection));
    }
  }
  active.eventText = `${label} · WAITING FOR KICK`;
  active.eventTimer = 0;
  if (phase !== "goal-kick") active.ballPos.copy(active.restartSpot);
  active.ballVel.set(0, 0, 0);
  releasePossession(active, "loose");
  active.cooldown = Math.max(active.cooldown, 0.45);
}

function arrangeSetPieceShape(active: MatchRuntime, phase: PlayPhase, team: TeamId, spot: THREE.Vector3) {
  if (phase === "halftime" || phase === "goal") return;
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
      if (phase === "goal-kick") {
        resetKeeperForSimpleGoalKick(player, upfieldKickDirection(team, active.half), active.half);
      } else {
        player.pos.copy(spot).setY(0);
        if (phase === "throw-in") player.pos.x = Math.sign(spot.x || 1) * (FIELD_W / 2 - 2.1);
      }
      player.vel.set(0, 0, 0);
      player.mesh.position.copy(player.pos);
      return;
    }
    const base = player.home.clone();
    if (phase === "goal-kick") {
      if (player.team === team) {
        base.z = teamGoalZ(team, active.half) - Math.sign(teamGoalZ(team, active.half)) * (player.line === "defender" ? 19 : player.line === "midfielder" ? 31 : 43);
      } else {
        base.z = clamp(teamGoalZ(team, active.half) - Math.sign(teamGoalZ(team, active.half)) * 23, -FIELD_L / 2 + 5, FIELD_L / 2 - 5);
      }
    } else if (phase === "corner" || (phase === "throw-in" && setPieceNearBox)) {
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

function executeSimpleGoalKick(active: MatchRuntime, actor: PlayerBody | null) {
  const keeper = actor?.role === "keeper"
    ? actor
    : active.players.find((player) => player.team === active.restartTeam && player.role === "keeper") ?? null;
  const direction = upfieldKickDirection(active.restartTeam, active.half);
  active.restartDirection.copy(direction);
  active.ballOwnerId = null;
  active.intendedReceiverId = null;
  active.possession = null;
  active.ballState = "kicked";
  active.restartActorId = null;
  active.phase = "open";
  active.phaseTimer = 0;
  active.restartBoundaryGuardTimer = 0.85;
  active.eventText = "PLAY";
  active.eventTimer = 0;
  active.cooldown = 0.18;
  active.restartProtectionTeam = active.restartTeam;
  active.restartProtectionTimer = 2.6;
  active.lastTouchTeam = active.restartTeam;
  active.lastTouchPlayerId = keeper?.id ?? null;
  if (keeper) {
    resetKeeperForSimpleGoalKick(keeper, direction, active.half);
    active.ballPos.copy(goalKickBallSpot(keeper, direction));
    keeper.kickTimer = 0.34;
    active.ballIgnorePlayerId = keeper.id;
    active.goalKickLockPlayerId = keeper.id;
    active.goalKickLockTimer = 0.38;
  } else {
    active.ballPos.copy(active.restartSpot).add(direction.clone().multiplyScalar(4.35)).setY(BALL_RADIUS);
    active.ballIgnorePlayerId = null;
    active.goalKickLockPlayerId = null;
    active.goalKickLockTimer = 0;
  }
  active.ballVel.set(0, 14.2, direction.z * 72);
  active.ballIgnoreTimer = 1.35;
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
    stopForRestart(active, "kickoff", "away", new THREE.Vector3(0, BALL_RADIUS, 0), "SECOND HALF");
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
    executeSimpleGoalKick(active, actor);
    return;
  }
  if (restartingPhase === "throw-in" && actor) {
    const receiver = chooseThrowInTarget(actor, active);
    if (receiver) active.restartDirection.copy(receiver.pos.clone().sub(actor.pos).setY(0).normalize());
  }
  const power = restartingPhase === "corner" ? 12 : restartingPhase === "throw-in" ? 16.5 : 4.2;
  const releasePoint = active.phase === "throw-in" && actor
    ? throwInHandPoint(actor, active.restartDirection).add(active.restartDirection.clone().multiplyScalar(0.58))
    : active.restartSpot;
  active.ballPos.copy(releasePoint);
  active.ballVel.copy(active.restartDirection).multiplyScalar(power);
  active.ballVel.y = restartingPhase === "corner" ? 6.5 : restartingPhase === "throw-in" ? 8.4 : 0;
  active.lastTouchTeam = active.restartTeam;
  active.lastTouchPlayerId = active.restartActorId;
  active.restartActorId = null;
  active.ballState = "kicked";
  active.ballOwnerId = null;
  active.ballIgnorePlayerId = actor?.id ?? null;
  active.ballIgnoreTimer = restartingPhase === "throw-in" ? 0.82 : 0.34;
  active.phase = "open";
  active.phaseTimer = 0;
  active.restartBoundaryGuardTimer = restartingPhase === "corner" ? 0.75 : restartingPhase === "throw-in" ? 0.55 : 0.35;
  active.eventText = showSecondHalfBanner ? "SECOND HALF" : "PLAY";
  active.eventTimer = showSecondHalfBanner ? 1.4 : 0;
  active.cooldown = 0.35;
  if (actor) {
    actor.kickTimer = restartingPhase === "throw-in" ? 0 : 0.46;
    if (restartingPhase === "throw-in") {
      actor.catchTimer = 0.18;
      poseThrower(actor, true);
    }
  }
  if (restartingPhase === "kickoff" && actor) {
    active.ballIgnorePlayerId = null;
    active.ballIgnoreTimer = 0;
    takePossession(actor, active);
    active.ballPos.copy(controlledBallPoint(actor));
  }
}

function restartShapeInput(player: PlayerBody, active: MatchRuntime) {
  const offset = player.team === active.restartTeam ? -Math.sign(attackingGoalZ(player.team, active.half)) * 5 : Math.sign(attackingGoalZ(player.team, active.half)) * 8;
  const target = player.home.clone();
  if (player.id === active.restartActorId) {
    target.copy(active.restartSpot);
    if (active.phase === "goal-kick") {
      target.sub(active.restartDirection.clone().multiplyScalar(1.75));
    }
    target.z = clamp(target.z, -GOAL_BACK_Z + 2, GOAL_BACK_Z - 2);
    if (active.phase === "throw-in") target.x = Math.sign(active.restartSpot.x || 1) * (FIELD_W / 2 - 2.1);
  } else if (active.phase !== "halftime" && player.line !== "keeper") {
    target.x = clamp(player.home.x * 0.72 + active.restartSpot.x * 0.18, -FIELD_W / 2 + 3, FIELD_W / 2 - 3);
    target.z = clamp(player.home.z + offset * 0.42, -FIELD_L / 2 + 4, FIELD_L / 2 - 4);
  }
  if (active.phase === "kickoff" && player.id !== active.restartActorId && player.role !== "keeper") {
    const ownSide = teamSide(player.team, active.half);
    target.z = ownSide > 0 ? Math.max(target.z, 2.4) : Math.min(target.z, -2.4);
  }
  const dir = target.sub(player.pos);
  return { dir: dir.lengthSq() > 0.5 ? dir.normalize() : dir.set(0, 0, 0), sprint: false };
}

function walkoutOrder(player: PlayerBody) {
  if (player.role === "keeper") return 0;
  const match = player.id.match(/-(\d+)$/);
  return match ? clamp(Number(match[1]), 1, 10) : clamp(player.number, 1, 10);
}

function walkoutTarget(player: PlayerBody) {
  const laneZ = player.team === "home" ? -4.2 : 4.2;
  const order = walkoutOrder(player);
  return new THREE.Vector3(-22 + order * 4.4, 0, laneZ);
}

function walkoutStart(player: PlayerBody) {
  const target = walkoutTarget(player);
  const order = walkoutOrder(player);
  return new THREE.Vector3(-FIELD_W / 2 - 18 - Math.min(order, 5) * 1.8, 0, target.z);
}

function beginWalkout(active: MatchRuntime) {
  active.phase = "walkout";
  active.phaseTimer = 7.2;
  active.eventText = "PLAYER WALKOUT";
  active.eventTimer = 0;
  active.cooldown = 0;
  active.ballOwnerId = null;
  active.ballState = "loose";
  active.possession = null;
  active.restartActorId = null;
  active.intendedReceiverId = null;
  active.ballPos.set(0, BALL_RADIUS, 0);
  active.ballVel.set(0, 0, 0);
  active.players.forEach((player) => {
    const start = walkoutStart(player);
    player.pos.copy(start);
    player.vel.set(0, 0, 0);
    player.turnRate = 0;
    player.heading = headingFromDirection(new THREE.Vector3(1, 0, 0));
    player.mesh.rotation.y = player.heading;
    player.mesh.position.copy(player.pos);
    player.lastPos.copy(player.pos);
  });
}

function finishWalkoutToKickoff(active: MatchRuntime) {
  resetKickoffShape(active);
  active.phase = "kickoff";
  active.phaseTimer = 1.15;
  active.restartTeam = "home";
  active.restartSpot.set(0, BALL_RADIUS, 0);
  active.restartDirection.copy(upfieldKickDirection("home", active.half));
  active.restartActorId = kickoffTaker(active.players, "home", active.restartSpot)?.id ?? null;
  active.eventText = "KICKOFF";
  active.eventTimer = 0;
  stageKickoffShape(active);
  active.ballPos.copy(active.restartSpot);
  active.ballVel.set(0, 0, 0);
}

function startDirectKickoff(active: MatchRuntime, team: TeamId) {
  resetKickoffShape(active);
  active.phase = "open";
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
  active.ballState = "loose";
  active.ballOwnerId = null;
  active.possession = null;
  active.intendedReceiverId = null;
  active.ballIgnorePlayerId = null;
  active.ballIgnoreTimer = 0;
  active.restartProtectionTeam = null;
  active.restartProtectionTimer = 0;
  active.restartBoundaryGuardTimer = 0;
  stageKickoffShape(active);
  const actor = active.restartActorId ? active.players.find((player) => player.id === active.restartActorId) : null;
  if (actor) {
    takePossession(actor, active);
    actor.heading = headingFromDirection(active.restartDirection);
    actor.mesh.rotation.y = actor.heading;
    active.ballPos.copy(controlledBallPoint(actor));
  }
  active.restartActorId = null;
}

function walkoutInput(player: PlayerBody): PlayerInputState {
  const target = walkoutTarget(player);
  const dir = target.sub(player.pos);
  return {
    dir: dir.lengthSq() > 0.18 ? dir.normalize() : dir.set(0, 0, 0),
    sprint: false,
    speedScale: 0.82,
  };
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
      player.pos.z = ownSide > 0 ? Math.max(player.pos.z, 3.4) : Math.min(player.pos.z, -3.4);
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

function separatePlayers(players: PlayerBody[]) {
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      const a = players[i];
      const b = players[j];
      if (Math.abs(a.pos.x - b.pos.x) > PERSONAL_SPACE || Math.abs(a.pos.z - b.pos.z) > PERSONAL_SPACE) continue;
      const delta = new THREE.Vector3(a.pos.x - b.pos.x, 0, a.pos.z - b.pos.z);
      const distance = delta.length();
      if (distance > 0.001 && distance < PERSONAL_SPACE) {
        const push = delta.multiplyScalar((PERSONAL_SPACE - distance) / distance * 0.5);
        if (a.role !== "keeper") a.pos.add(push);
        if (b.role !== "keeper") b.pos.sub(push);
        clampPlayer(a);
        clampPlayer(b);
        a.mesh.position.copy(a.pos);
        b.mesh.position.copy(b.pos);
      }
    }
  }
}

function handleGoalkeeperActions(active: MatchRuntime) {
  if (active.phase !== "open" || active.ballOwnerId) return;
  if (active.ballPos.y > 2.8) return;
  const flatBall = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
  active.players
    .filter((player) => player.role === "keeper")
    .forEach((keeper) => {
      if (keeper.id === active.goalKickLockPlayerId || keeper.id === active.ballIgnorePlayerId) return;
      const ownZ = teamGoalZ(keeper.team, active.half);
      const shotSpeed = active.ballVel.length();
      const inKeeperZone = Math.abs(active.ballPos.z - ownZ) < (shotSpeed > 9.2 ? 34 : 17) && Math.abs(active.ballPos.x) < GOAL_W / 2 + (shotSpeed > 9.2 ? 12 : 6);
      const movingTowardGoal = Math.sign(active.ballVel.z || ownZ - active.ballPos.z) === Math.sign(ownZ - active.ballPos.z);
      const closeEnough = keeper.pos.distanceTo(flatBall) < (movingTowardGoal ? 3.35 : 2.35);
      if (!inKeeperZone) return;
      if (!movingTowardGoal && !closeEnough) return;
      if (shotSpeed > 9.2) {
        const timeToGoal = Math.abs((ownZ - active.ballPos.z) / (active.ballVel.z || Math.sign(ownZ - active.ballPos.z) * 0.1));
        const predictedX = clamp(active.ballPos.x + active.ballVel.x * clamp(timeToGoal, 0, 0.62), -GOAL_W / 2 + 0.65, GOAL_W / 2 - 0.65);
        const lateralGap = predictedX - keeper.pos.x;
        keeper.vel.x += clamp(lateralGap * 0.68, -2.2, 2.2);
        const canDive = Math.abs(lateralGap) < 3.35 && Math.abs(active.ballPos.z - ownZ) < 13.8;
        const wellPositioned = Math.abs(lateralGap) < 1.12 && Math.abs(active.ballPos.z - ownZ) < 10.8;
        if (canDive && keeper.diveTimer <= 0.05) {
          keeper.diveSide = Math.sign(lateralGap || keeper.diveSide || 1);
          keeper.diveTimer = 0.7;
          keeper.recoveryTimer = Math.max(keeper.recoveryTimer, 0.28);
          keeper.vel.x = clamp(keeper.vel.x + keeper.diveSide * clamp(Math.abs(lateralGap) * 1.28, 1, 2.85), -4.8, 4.8);
          keeper.pos.x = clamp(keeper.pos.x + keeper.diveSide * clamp(Math.abs(lateralGap) * 0.14, 0.1, 0.34), -GOAL_W / 2 + 0.8, GOAL_W / 2 - 0.8);
        }
        const handContact = active.ballPos.distanceTo(keeperHandPoint(keeper)) < 1.1;
        const bodyContact = keeper.pos.distanceTo(flatBall) < 1.35 && active.ballPos.y < 2.15;
        const divingContact = keeper.diveTimer > 0 && Math.abs(active.ballPos.x - keeper.pos.x) < 1.95 && Math.abs(active.ballPos.z - keeper.pos.z) < 1.32 && active.ballPos.y < 2.48;
        if (!handContact && !bodyContact && !divingContact) return;
        keeper.diveSide = Math.sign(lateralGap || keeper.diveSide || 1);
        keeper.catchTimer = 0.46;
        keeper.recoveryTimer = Math.max(keeper.recoveryTimer, 0.36);
        active.ballVel.x += keeper.diveSide * clamp(shotSpeed * 0.22, 2.2, 4.6);
        active.ballVel.z *= wellPositioned ? -0.48 : -0.3;
        active.ballVel.y = Math.max(active.ballVel.y, 1.8);
        active.ballState = "loose";
        active.ballIgnorePlayerId = keeper.id;
        active.ballIgnoreTimer = 0.24;
        active.lastTouchTeam = keeper.team;
        active.lastTouchPlayerId = keeper.id;
        active.eventText = "PLAY";
        active.eventTimer = 0;
        return;
      }
      if (!closeEnough) return;
      keeper.catchTimer = 0.62;
      keeper.recoveryTimer = Math.max(keeper.recoveryTimer, 0.28);
      takePossession(keeper, active);
      active.ballPos.copy(keeperHandPoint(keeper));
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
  if (player.role === "keeper") {
    const lookAtBall = active.ballPos.clone().setY(0).sub(player.pos);
    desiredHeading = lookAtBall.lengthSq() > 0.2
      ? Math.atan2(lookAtBall.x, lookAtBall.z)
      : teamGoalZ(player.team, active.half) > 0 ? Math.PI : 0;
  } else if (hasIntent) {
    desiredHeading = Math.atan2(dir.x, dir.z);
  } else if (player.vel.lengthSq() < 0.04) {
    const lookAtBall = active.ballPos.clone().setY(0).sub(player.pos);
    if (lookAtBall.lengthSq() > 6) desiredHeading = Math.atan2(lookAtBall.x, lookAtBall.z);
  }
  const turnSpeed = player.role === "keeper" ? 3.9 : player.controlledBy ? 6.2 : 5.15;
  const turnGap = Math.abs(setPlayerHeading(player, desiredHeading, dt, turnSpeed));
  const acceleration = player.role === "keeper" ? 17 : player.controlledBy ? 32 : 27;
  const braking = player.role === "keeper" ? 34 : player.controlledBy ? 42 : 36;
  const flatBall = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
  const automatedControlled = player.controlledBy === "p1" && active.p1Autopilot;
  const urgentBallCommit = (!player.controlledBy || automatedControlled)
    && player.role !== "keeper"
    && active.phase === "open"
    && (active.intendedReceiverId === player.id || !active.ballOwnerId && flatBall.distanceTo(player.pos) < 8);
  let targetVel = new THREE.Vector3();
  if (hasIntent) {
    const turnScale = player.role === "keeper" || urgentBallCommit ? 1 : clamp(1 - turnGap / Math.PI, 0.18, 1);
    const travelDir = player.role === "keeper" || urgentBallCommit ? dir : forwardFromHeading(player.heading);
    targetVel = travelDir.multiplyScalar(maxSpeed * turnScale);
  }
  const delta = targetVel.sub(player.vel);
  const maxChange = (hasIntent ? acceleration : braking) * dt;
  if (delta.length() > maxChange) delta.setLength(maxChange);
  player.vel.add(delta);
  const traction = hasIntent ? 0.18 : 0.008;
  player.vel.multiplyScalar(Math.pow(traction, dt));
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
  const speed = player.vel.length();
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
    const divePose = Math.sin((1 - player.diveTimer / 0.7) * Math.PI);
    if (bodyRoot) {
      bodyRoot.position.x = player.diveSide * 0.44 * divePose;
      bodyRoot.position.y = -0.18 * divePose;
      bodyRoot.rotation.z = -player.diveSide * 1.08 * divePose;
      bodyRoot.rotation.x = -0.18 * divePose;
    }
    if (leftArm) {
      leftArm.rotation.x = -1.82;
      leftArm.rotation.z = -0.62 - player.diveSide * 0.42;
    }
    if (rightArm) {
      rightArm.rotation.x = -1.82;
      rightArm.rotation.z = 0.62 - player.diveSide * 0.42;
    }
    if (leftLeg) leftLeg.rotation.x = -0.62 * divePose;
    if (rightLeg) rightLeg.rotation.x = 0.42 * divePose;
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
  gain.gain.exponentialRampToValueAtTime(clamp(volume, 0.35, 1.45) * 0.52, start + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
  noise.buffer = buffer;
  noise.connect(filter);
  filter.connect(gain);
  thump.connect(gain);
  gain.connect(audio.destination);
  noise.start(start);
  thump.start(start);
  noise.stop(start + 0.09);
  thump.stop(start + 0.17);
}

function playGoalSound(active: MatchRuntime) {
  const now = performance.now();
  if (now - active.lastCheerSound < 900) return;
  active.lastCheerSound = now;
  if (!active.audio) {
    playTone(active, 392, 0.18, 0.028, "sine");
    return;
  }
  const audio = active.audio;
  const start = audio.currentTime;
  const cheer = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const gain = audio.createGain();
  const samples = Math.floor(audio.sampleRate * 1.85);
  const buffer = audio.createBuffer(1, samples, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < samples; i += 1) {
    const t = i / samples;
    const swell = Math.sin(Math.min(1, t * 2.2) * Math.PI * 0.5) * Math.pow(1 - t * 0.28, 1.1);
    data[i] = (Math.random() * 2 - 1) * swell * 0.72;
  }
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(920, start);
  filter.Q.setValueAtTime(0.8, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.2, start + 0.18);
  gain.gain.exponentialRampToValueAtTime(0.035, start + 1.85);
  cheer.buffer = buffer;
  cheer.connect(filter);
  filter.connect(gain);
  gain.connect(audio.destination);
  cheer.start(start);
  cheer.stop(start + 1.86);
  window.setTimeout(() => playTone(active, 523, 0.2, 0.025, "triangle"), 130);
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

function playerInput(keys: Set<string>, player: "p1" | "p2", virtualControls?: VirtualControls, camera?: THREE.PerspectiveCamera): PlayerInputState {
  const dir = new THREE.Vector3();
  if (player === "p1") {
    if (virtualControls && virtualControls.strength > 0.04) {
      const virtualDir = virtualControls.dir.clone();
      const axis = cameraRelativeAxis(camera);
      virtualDir.copy(axis.right.multiplyScalar(virtualControls.dir.x).add(axis.up.multiplyScalar(-virtualControls.dir.z)));
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
  if (keys.has("KeyI")) dir.z += 1;
  if (keys.has("KeyK")) dir.z -= 1;
  if (keys.has("KeyJ")) dir.x -= 1;
  if (keys.has("KeyL")) dir.x += 1;
  return { dir: dir.lengthSq() > 0 ? dir.normalize() : dir, sprint: keys.has("Slash") || keys.has("ControlRight"), speedScale: 1 };
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
  const urgent = active.phase !== "open"
    || active.intendedReceiverId === player.id
    || active.ballOwnerId === player.id
    || player.role === "keeper"
    || (owner?.team !== player.team && player.pos.distanceTo(owner?.pos ?? active.ballPos) < 7);
  player.aiInputTimer -= dt;
  if (urgent || player.aiInputTimer <= 0) {
    const next = aiInput(player, active);
    player.aiInputCache = cloneInput(next);
    player.aiInputTimer = urgent ? 0.08 : 0.16 + (player.number % 5) * 0.018;
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
  const flatBall = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
  const distanceToBall = flatBall.distanceTo(player.pos);
  const pressureIds = pressureFieldPlayers(active.players, player.team, active.ballPos, opponentHasBall ? 2 : active.ballOwnerId ? 1 : 2);
  const isPressing = pressureIds.includes(player.id);
  const closestOpponent = nearestOpponentTo(player, active.players);
  const committedReceiver = active.intendedReceiverId === player.id && active.ballState === "kicked";
  const committedCollector = !owner && active.ballState !== "possessed" && (committedReceiver || isPressing && distanceToBall < 20 || distanceToBall < 6.5);
  if (player.role !== "keeper" && committedCollector) {
    const ballLead = new THREE.Vector3(active.ballVel.x, 0, active.ballVel.z).multiplyScalar(committedReceiver ? 0.2 : 0.1);
    const collectTarget = flatBall.clone().add(ballLead);
    collectTarget.x = clamp(collectTarget.x, -FIELD_W / 2 + 2.5, FIELD_W / 2 - 2.5);
    collectTarget.z = clamp(collectTarget.z, -FIELD_L / 2 + 2.5, FIELD_L / 2 - 2.5);
    const direct = collectTarget.sub(player.pos);
    return { dir: direct.lengthSq() > 0.05 ? direct.normalize() : direct.set(0, 0, 0), sprint: distanceToBall > 4, speedScale: 1 };
  }
  if (player.role !== "keeper" && player.line === "defender") {
    const ballNearOwnBox = Math.abs(active.ballPos.z - ownZ) < 30;
    if (!owner && ballNearOwnBox && distanceToBall < 10) {
      const directBall = flatBall.sub(player.pos);
      return { dir: directBall.lengthSq() > 0.05 ? directBall.normalize() : directBall.set(0, 0, 0), sprint: distanceToBall > 3.4, speedScale: 1 };
    }
    if (opponentHasBall && owner && player.pos.distanceTo(owner.pos) < 8.5) {
      const toCarrier = owner.pos.clone().sub(player.pos).setY(0);
      if (toCarrier.lengthSq() > 0.25) {
        const carrierDistance = toCarrier.length();
        if (carrierDistance < 3.05 && player.decisionCooldown <= 0) {
          setPlayerHeading(player, headingFromDirection(toCarrier), 1 / 60, 24);
          attemptTackle(player, active);
          player.decisionCooldown = 0.34;
        }
        return { dir: toCarrier.normalize(), sprint: carrierDistance > 4.4, speedScale: 1 };
      }
    }
    const markTarget = opponentHasBall ? dangerousMarkTarget(player, active) : null;
    if (markTarget && !isPressing) {
      target.lerp(markTarget, 0.72);
    }
  }

  if (player.role === "keeper") {
    const ballThreat = Math.sign(active.ballPos.z - ownZ) !== Math.sign(attackingZ - ownZ) && Math.abs(active.ballPos.z - ownZ) < 28;
    const ballInOwnHalf = Math.sign(active.ballPos.z - ownZ) === -Math.sign(attackingZ);
    const baseDepth = ballThreat ? 1.8 : ballInOwnHalf ? 3.4 : 5.3;
    target.set(clamp(active.ballPos.x * 0.42, -GOAL_W / 2 + 1, GOAL_W / 2 - 1), 0, ownZ - Math.sign(ownZ) * baseDepth);
    const canIntercept = !active.ballOwnerId && Math.abs(active.ballPos.z - ownZ) < 16 && Math.abs(active.ballPos.x) < GOAL_W / 2 + 7;
    if (canIntercept) {
      target.x = clamp(active.ballPos.x, -GOAL_W / 2 + 0.7, GOAL_W / 2 - 0.7);
      target.z = clamp(active.ballPos.z, ownZ - Math.sign(ownZ) * 10, ownZ + Math.sign(ownZ) * (GOAL_DEPTH - 1.5));
    }
  } else if (teamHasBall) {
    const influence = formationBallInfluence(player, "attack");
    const ballLane = clamp(active.ballPos.x, -FIELD_W / 2 + 6, FIELD_W / 2 - 6);
    const weakSide = Math.sign(player.home.x || (player.number % 2 === 0 ? 1 : -1));
    target.lerp(flatBall, influence * 0.72);
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
        target.z += attackSign * Math.sin(active.gameClock * 0.08 + player.number) * 5.2;
        target.x += passAngle * 4.2;
      }
      const ownerDistance = target.distanceTo(owner?.pos ?? flatBall);
      if (ownerDistance < minSeparation) {
        const away = target.clone().sub(owner?.pos ?? flatBall).setY(0);
        if (away.lengthSq() < 0.1) away.set(weakSide, 0, attackSign * 0.35);
        target.add(away.normalize().multiplyScalar(minSeparation - ownerDistance + 2.5));
      }
    }
    if (player.line === "defender") {
      const upfieldProgress = clamp((active.ballPos.z - ownZ) * attackSign, 0, 54);
      const compactLine = player.home.z + attackSign * clamp(14 + upfieldProgress * 0.54, 14, 42);
      target.z = target.z * 0.28 + compactLine * 0.72;
      target.x = target.x * 0.54 + (player.home.x * 0.88 + weakSide * 2.2) * 0.46;
    }
  } else if (isPressing && (opponentHasBall || distanceToBall < 18)) {
    target.copy(pressingTarget(player, active));
    if (owner && owner.team !== player.team) {
      const blockLane = new THREE.Vector3(0, 0, teamGoalZ(player.team, active.half)).sub(owner.pos).setY(0).normalize();
      target.copy(owner.pos).add(blockLane.multiplyScalar(1.2));
      target.x += Math.sign(player.home.x || player.pos.x || 1) * 0.35;
      if (player.pos.distanceTo(owner.pos) < 3.05 && player.decisionCooldown <= 0) {
        setPlayerHeading(player, headingFromDirection(owner.pos.clone().sub(player.pos).setY(0)), 1 / 60, 20);
        attemptTackle(player, active);
        player.decisionCooldown = 0.42;
      }
    }
  } else if (player.line === "defender" && opponentHasBall && Math.abs(active.ballPos.z - ownZ) < 34) {
    const blockPoint = defensiveCoverTarget(player, active);
    target.lerp(blockPoint, formationBallInfluence(player, "defense") + 0.24);
    const markTarget = dangerousMarkTarget(player, active);
    if (markTarget) target.lerp(markTarget, 0.56);
    if (closestOpponent && Math.abs(closestOpponent.pos.z - ownZ) < 38) {
      target.lerp(closestOpponent.pos.clone().add(new THREE.Vector3(Math.sign(player.home.x || 1) * 1.8, 0, -Math.sign(attackingZ) * 1.6)), 0.35);
    }
    if (owner && owner.team !== player.team && Math.abs(attackingGoalZ(owner.team, active.half) - owner.pos.z) < 52) {
      const shootingLane = owner.pos.clone().lerp(new THREE.Vector3(0, 0, teamGoalZ(player.team, active.half)), 0.32);
      target.lerp(shootingLane, 0.36);
    }
  } else {
    const phase = opponentHasBall ? "defense" : "neutral";
    const influence = formationBallInfluence(player, phase);
    const coverTarget = opponentHasBall ? defensiveCoverTarget(player, active) : flatBall;
    target.lerp(coverTarget, influence);
    if (player.line === "defender" && opponentHasBall) {
      const ballAwayFromOwnGoal = clamp((active.ballPos.z - ownZ) * attackSign, 0, 48);
      if (ballAwayFromOwnGoal > 16) {
        const pushedLine = ownZ + attackSign * clamp(15 + ballAwayFromOwnGoal * 0.48, 15, 40);
        target.z = target.z * 0.38 + pushedLine * 0.62;
      }
      const markTarget = dangerousMarkTarget(player, active);
      if (markTarget) target.lerp(markTarget, 0.5);
    }
    if (!opponentHasBall && !active.ballOwnerId && distanceToBall < (player.line === "forward" ? 20 : 16)) {
      target.lerp(flatBall, 0.34);
    }
    if (opponentHasBall && closestOpponent && player.line !== "forward") {
      target.lerp(closestOpponent.pos.clone().add(new THREE.Vector3(Math.sign(player.home.x || 1) * 2.4, 0, -Math.sign(attackingZ) * 2)), player.line === "midfielder" ? 0.22 : 0.12);
    }
  }
  if (distanceToBall < 10 && !teamHasBall && !player.controlledBy && player.role !== "keeper" && (isPressing || committedCollector)) {
    target.lerp(flatBall, isPressing ? 0.56 : 0.28);
  }
  addOrganicVariation(player, target, active);
  addFormationMotion(player, target, active, teamHasBall, opponentHasBall, isPressing);
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
    if (player.role === "keeper" && player.carryTimer > 0.5 && player.decisionCooldown <= 0) {
      const acted = clearBall(player, active);
      player.decisionCooldown = acted ? 0.95 : 0.25;
      if (acted) return { dir: new THREE.Vector3(), sprint: false };
    }
    const passStyle = player.role === "keeper"
      ? (pressureCount > 0 ? "long" : "short")
      : pressured ? "short" : player.line === "defender" ? "long" : "through";
    const passTarget = choosePassTarget(player, active, passStyle);
    const openReceiver = passTarget ? nearestOpponentDistance(passTarget, active.players) : 0;
    const usefulPass = Boolean(passTarget && passIsUseful(player, passTarget, active, passStyle));
      const hasControlledTouch = player.carryTimer > (player.role === "keeper" ? 0.85 : pressured ? 0.5 : 0.72);
      const passOpportunity = Boolean(passTarget && usefulPass && hasControlledTouch && (pressured || openReceiver > 4.6 || player.carryTimer > 1.05));
    const blockers = opponentsBetween(player, new THREE.Vector3(0, 0, attackingZ), active.players, 7.5);
    const furthestForward = active.players
      .filter((item) => item.team === player.team && item.role !== "keeper" && !item.sentOff)
      .every((item) => item.id === player.id || (item.pos.z - player.pos.z) * attackSign <= 1.2);
    const fullPowerShootingChance = player.role !== "keeper"
      && furthestForward
      && goalDistance < 39
      && Math.abs(player.pos.x) < GOAL_W * 2.8
      && blockers <= 5;
    const closeShootingChance = player.role !== "keeper"
      && goalDistance < 34
      && Math.abs(player.pos.x) < GOAL_W * 2.6
      && opponentPressure(player, active.players, 4.8) < 6;
    const shootingLane = player.role !== "keeper"
      && goalDistance < 56
      && Math.abs(player.pos.x) < GOAL_W * 2.35
      && blockers <= (goalDistance < 24 ? 3 : 2)
      && opponentPressure(player, active.players, 4.4) < 5;
    const opponentKeeper = active.players.find((item) => item.team === opponent(player.team) && item.role === "keeper");
    const keeperPoorPosition = Boolean(opponentKeeper && Math.abs(opponentKeeper.pos.x - player.pos.x * 0.18) > 2.7);
    const midRangeShot = player.role !== "keeper"
      && goalDistance >= 24
      && goalDistance < 54
      && Math.abs(player.pos.x) < GOAL_W * 2.45
      && blockers <= 2
      && opponentPressure(player, active.players, 5.4) < 4
      && (keeperPoorPosition || nearestOpponentDistance(player, active.players) > 4.7 || player.line === "forward");
    const closeForwardThreat = player.role !== "keeper"
      && (player.line === "forward" || furthestForward)
      && goalDistance < 28
      && Math.abs(player.pos.x) < GOAL_W * 3.05;
    const closeShotLane = closeForwardThreat
      && blockers <= (goalDistance < 17 ? 3 : 2)
      && opponentPressure(player, active.players, 3.8) < 4;
    if (player.decisionCooldown <= 0) {
      let acted = false;
      const ownGoalDistance = Math.abs(teamGoalZ(player.team, active.half) - player.pos.z);
      if (player.line === "defender" && pressured && ownGoalDistance < 24) {
        acted = clearBall(player, active);
      }
      if (!acted && closeShotLane && player.carryTimer > 0.22) {
        acted = shoot(player, active, chooseAiShotStyle(player, active, goalDistance, blockers), goalDistance < 18 ? 2.25 : 1.95);
      }
      if (!acted && fullPowerShootingChance && player.carryTimer > 0.22) {
        acted = shoot(player, active, "shot", goalDistance < 22 ? 2.14 : 1.86);
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
      if (!acted && midRangeShot && player.carryTimer > 0.52) {
        acted = shoot(player, active, "shot", keeperPoorPosition ? 1.72 : 1.55);
      }
      if (!acted && (shootingLane || closeShootingChance) && player.carryTimer > (goalDistance < 22 ? 0.38 : 0.58)) {
        acted = shoot(player, active, chooseAiShotStyle(player, active, goalDistance, blockers), goalDistance > 30 ? 1.42 : 1.18);
      }
      if (!acted && passOpportunity) {
        acted = performPass(player, active, passStyle);
      }
      if (!acted && player.carryTimer > 0.48 && canDribbleIntoSpace(player, active)) {
        player.decisionCooldown = 0.32;
        return { dir: dribbleSpaceDirection(player, active), sprint: goalDistance > 18 };
      }
      if (!acted && passTarget && player.carryTimer > 1.7) {
        acted = performPass(player, active, player.role === "keeper" ? "long" : player.line === "forward" ? "short" : "through");
      }
      player.decisionCooldown = acted ? 0.72 + (player.number % 4) * 0.08 : 0.28;
    }
  } else if (opponentHasBall && isPressing && distanceToBall < 3.25 && player.decisionCooldown <= 0 && active.gameClock > 40) {
    const ownerNow = ballOwner(active);
    if (ownerNow) setPlayerHeading(player, headingFromDirection(ownerNow.pos.clone().sub(player.pos).setY(0)), 1 / 60, 24);
    attemptTackle(player, active);
    player.decisionCooldown = 0.32 + (player.number % 3) * 0.06;
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
  const wide = Math.sign(player.pos.x || player.home.x || (player.number % 2 ? -1 : 1)) * 0.28;
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

function beginAiSkillMove(player: PlayerBody, active: MatchRuntime, goalDistance: number, pressured: boolean, blockers: number) {
  if (player.controlledBy || player.role === "keeper" || player.skillCooldown > 0 || player.skillTimer > 0 || player.carryTimer < 0.32) return false;
  const nearBox = goalDistance < 34 && Math.abs(player.pos.x) < GOAL_W * 2.9;
  if (!nearBox || (!pressured && blockers < 2)) return false;
  const closest = nearestOpponentTo(player, active.players);
  player.skillSide = closest
    ? Math.sign(player.pos.x - closest.pos.x || (player.number % 2 === 0 ? 1 : -1))
    : player.number % 2 === 0 ? 1 : -1;
  if (goalDistance < 20 && blockers >= 2) player.skillMove = "shot-fake";
  else if (pressured && blockers <= 2) player.skillMove = "body-feint";
  else if (goalDistance < 28 && player.line === "forward") player.skillMove = "quick-turn";
  else if (blockers >= 3) player.skillMove = "fake-pass";
  else player.skillMove = "dribble-burst";
  player.skillTimer = player.skillMove === "dribble-burst" ? 0.34 : 0.46;
  player.skillCooldown = 2.1 + (player.number % 4) * 0.35;
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
  return new THREE.Vector3(side * 0.36, 0, attackSign).normalize();
}

function chooseAiShotStyle(player: PlayerBody, active: MatchRuntime, goalDistance: number, blockers: number): "shot" | "driven" | "finesse" | "chip" {
  const keeper = active.players.find((item) => item.team === opponent(player.team) && item.role === "keeper");
  const keeperGoalLine = keeper ? teamGoalZ(keeper.team, active.half) : 0;
  const keeperOut = Boolean(keeper && Math.abs(keeper.pos.z - keeperGoalLine) > 7.2);
  if (keeperOut && goalDistance < 34 && blockers <= 2) return "chip";
  if (goalDistance < 20 && blockers <= 3) return "driven";
  if (Math.abs(player.pos.x) > GOAL_W * 0.9 && goalDistance < 32 && blockers <= 2) return "finesse";
  return "shot";
}

function clearBall(player: PlayerBody, active: MatchRuntime) {
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const distance = player.role === "keeper" ? 78 : 42;
  const lateral = player.role === "keeper"
    ? clamp(-player.pos.x * 0.2 + (player.number % 2 === 0 ? 3 : -3), -5, 5)
    : (player.number % 2 === 0 ? 1 : -1) * 12;
  const target = player.pos.clone().add(new THREE.Vector3(lateral, BALL_RADIUS, attackSign * distance));
  const kicked = kickTowardPoint(player, target, active, "long");
  if (kicked && player.role === "keeper") {
    const clearDir = upfieldKickDirection(player.team, active.half);
    active.ballVel.copy(clearDir.multiplyScalar(50));
    active.ballVel.y = 12.4;
    active.ballIgnorePlayerId = player.id;
    active.ballIgnoreTimer = 0.9;
    active.restartProtectionTeam = player.team;
    active.restartProtectionTimer = 1.2;
    player.kickTimer = Math.max(player.kickTimer, 0.52);
  }
  return kicked;
}

function formationBallInfluence(player: PlayerBody, phase: "attack" | "defense" | "neutral") {
  if (player.line === "defender") return phase === "attack" ? 0.24 : phase === "defense" ? 0.4 : 0.22;
  if (player.line === "midfielder") return phase === "attack" ? 0.48 : phase === "defense" ? 0.54 : 0.34;
  if (player.line === "forward") return phase === "attack" ? 0.62 : phase === "defense" ? 0.32 : 0.42;
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

function defensiveCoverTarget(player: PlayerBody, active: MatchRuntime) {
  const ownZ = teamGoalZ(player.team, active.half);
  const ball = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
  const baseBlock = pointBetweenBallAndGoal(active.ballPos, ownZ, player);
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const laneSide = Math.sign(player.home.x || (player.number % 2 === 0 ? 1 : -1));
  if (player.line === "defender") {
    const lineZ = clamp(ball.z - attackSign * 9.5, ownZ - Math.sign(ownZ) * 24, ownZ - Math.sign(ownZ) * 6);
    return new THREE.Vector3(
      clamp(ball.x * 0.38 + player.home.x * 0.5 + laneSide * 2.2, -FIELD_W / 2 + 4, FIELD_W / 2 - 4),
      0,
      lineZ,
    ).lerp(baseBlock, 0.45);
  }
  if (player.line === "midfielder") {
    return baseBlock.add(new THREE.Vector3(laneSide * 2.8, 0, -attackSign * 5.8));
  }
  return player.home.clone().lerp(baseBlock, 0.28);
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

function performBackPass(player: PlayerBody, active: MatchRuntime) {
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const candidates = active.players
    .filter((item) => item.team === player.team && item.id !== player.id && item.role !== "keeper" && !item.sentOff)
    .map((teammate) => {
      const distance = teammate.pos.distanceTo(player.pos);
      const backward = (player.pos.z - teammate.pos.z) * attackSign;
      const open = nearestOpponentDistance(teammate, active.players);
      const laneBlockers = opponentsBetween(player, teammate.pos, active.players, 3.2);
      return {
        teammate,
        score: backward * 1.45 + clamp(open, 0, 12) * 1.7 - Math.abs(distance - 17) * 0.8 - laneBlockers * 8,
        distance,
        backward,
      };
    })
    .filter(({ distance, backward }) => distance > 6 && distance < 32 && backward > 2.2)
    .sort((a, b) => b.score - a.score);
  const receiver = candidates[0]?.teammate;
  if (!receiver) return false;
  active.pendingKickTarget = receiver.pos.clone();
  return kickTowardPoint(player, kickTargetForStyle(player, active, receiver, "short"), active, "short", receiver);
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

function activeShapeNudge() {
  return new THREE.Vector3();
}

function pressureFieldPlayers(players: PlayerBody[], team: TeamId, ball: THREE.Vector3, count: number) {
  return players
    .filter((player) => player.team === team && player.role !== "keeper")
    .sort((a, b) => a.pos.distanceTo(ball) - b.pos.distanceTo(ball))
    .slice(0, count)
    .map((player) => player.id);
}

function keepFormationRoam(player: PlayerBody, target: THREE.Vector3, pressing: boolean, teamHasBall = false, opponentHasBall = false) {
  if (player.role === "keeper") return;
  const roam = pressing
    ? 32
    : player.line === "defender"
      ? teamHasBall
        ? 43
        : opponentHasBall
          ? 25
          : 31
      : player.line === "midfielder"
        ? 31
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

function nearestPlayer(players: PlayerBody[], ball: THREE.Vector3): PlayerBody | null {
  let best: PlayerBody | null = null;
  let bestDistance = Infinity;
  players.forEach((player) => {
    const distance = player.pos.distanceTo(new THREE.Vector3(ball.x, 0, ball.z));
    if (distance < bestDistance) {
      best = player;
      bestDistance = distance;
    }
  });
  return best;
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
  active.possession = null;
  if (ballState !== "kicked") active.intendedReceiverId = null;
  if (ballState === "loose" && previousOwner?.team === "home") {
    switchToClosestTeammateToBall(active, "home", "p1");
  }
}

function setControlledPlayer(active: MatchRuntime, player: PlayerBody, controller: "p1" | "p2") {
  if (player.sentOff || player.role === "keeper") return false;
  const previous = active.players.find((item) => item.controlledBy === controller);
  if (previous?.id === player.id) return true;
  if (previous) {
    previous.controlledBy = undefined;
    if (previous.controlMarker) previous.controlMarker.visible = false;
  }
  player.controlledBy = controller;
  player.recoveryTimer = 0;
  player.actionCooldown = Math.min(player.actionCooldown, 0.06);
  if (player.controlMarker) player.controlMarker.visible = true;
  return true;
}

function switchToBestManualPlayer(active: MatchRuntime, controller: "p1" | "p2") {
  const current = active.players.find((player) => player.controlledBy === controller);
  const team: TeamId = controller === "p1" ? "home" : "away";
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

function switchToClosestTeammateToBall(active: MatchRuntime, team: TeamId, controller: "p1" | "p2") {
  const flatBall = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
  const next = active.players
    .filter((player) => player.team === team && player.role !== "keeper" && !player.sentOff)
    .sort((a, b) => a.pos.distanceTo(flatBall) - b.pos.distanceTo(flatBall))[0];
  if (next) setControlledPlayer(active, next, controller);
}

function autoSwitchToPossessor(active: MatchRuntime, player: PlayerBody) {
  if (player.sentOff) return;
  if (player.role === "keeper") {
    if (player.team !== "home") switchToClosestTeammateToBall(active, "home", "p1");
    return;
  }
  if (player.team === "home") setControlledPlayer(active, player, "p1");
  else switchToClosestTeammateToBall(active, "home", "p1");
}

function updateUserAutoSwitch(active: MatchRuntime) {
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

function currentAimDirection(player: PlayerBody, active: MatchRuntime, keys?: Set<string>) {
  if (active.pendingKickTarget && player.pos.distanceTo(active.pendingKickTarget) > 0.4) {
    return active.pendingKickTarget.clone().sub(player.pos).setY(0).normalize();
  }
  const keyboardDir = new THREE.Vector3();
  if (keys) {
    const axis = cameraRelativeAxis(active.camera);
    if (keys.has("ArrowUp")) keyboardDir.add(axis.up);
    if (keys.has("ArrowDown")) keyboardDir.sub(axis.up);
    if (keys.has("ArrowLeft")) keyboardDir.sub(axis.right);
    if (keys.has("ArrowRight")) keyboardDir.add(axis.right);
  }
  if (keyboardDir.lengthSq() > 0.02) return keyboardDir.normalize();
  return facingDirection(player);
}

function updateAimIndicators(active: MatchRuntime, keys: Set<string>) {
  active.players.forEach((player) => {
    const marker = player.controlMarker;
    if (marker instanceof THREE.Mesh && player.controlledBy === "p1") {
      marker.visible = active.state === "playing" && !player.sentOff;
      const material = marker.material;
      if (material instanceof THREE.MeshBasicMaterial) {
        material.color.set(active.p1Autopilot ? "#facc15" : "#ffffff");
        material.opacity = active.p1Autopilot ? 0.98 : 0.95;
      }
    }
    const arrow = player.aimArrow;
    if (!arrow) return;
    const visible = player.controlledBy === "p1" && active.ballOwnerId === player.id && active.state === "playing" && active.phase === "open" && !player.sentOff;
    arrow.visible = visible;
    if (!visible) return;
    const aim = currentAimDirection(player, active, keys);
    arrow.rotation.y = headingFromDirection(aim) - player.heading;
    arrow.position.y = 0.13;
  });
}

function playerScreenGaugePosition(active: MatchRuntime, player: PlayerBody) {
  const rect = active.renderer.domElement.getBoundingClientRect();
  const projected = player.pos.clone().add(new THREE.Vector3(0, 0.08, 0)).project(active.camera);
  return {
    x: rect.left + (projected.x * 0.5 + 0.5) * rect.width,
    y: rect.top + (-projected.y * 0.5 + 0.5) * rect.height + 22,
  };
}

function beginShotCharge(player: PlayerBody, active: MatchRuntime, keys: Set<string>) {
  if (active.phase !== "open") return false;
  const now = performance.now();
  const doubleTap = now - active.lastShotTap <= SHOT_DOUBLE_TAP_MS;
  active.lastShotTap = now;
  if (doubleTap) {
    active.shotCharge = 0;
    active.shotChargingPlayerId = null;
    active.shotConsumed = true;
    player.actionCooldown = 0;
    player.kickTimer = 0;
    return shoot(player, active, keys.has("KeyZ") ? "finesse" : "driven", 1.04);
  }
  if (player.actionCooldown > 0 || player.kickTimer > 0.05) return false;
  if (active.ballOwnerId !== player.id) return false;
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
  const style = keys.has("KeyZ") ? "finesse" : "shot";
  const powerScale = style === "finesse" ? 0.92 + charge * 0.42 : 0.95 + charge * 1.02;
  const kicked = shoot(player, active, style, powerScale);
  active.shotCharge = 0;
  active.shotChargingPlayerId = null;
  active.shotConsumed = false;
  return kicked;
}

function takePossession(player: PlayerBody, active: MatchRuntime) {
  active.ballState = "possessed";
  active.ballOwnerId = player.id;
  active.intendedReceiverId = null;
  active.possession = player.team;
  active.lastTouchTeam = player.team;
  active.lastTouchPlayerId = player.id;
  active.ballVel.copy(player.vel).multiplyScalar(0.78);
  active.pendingKickTarget = null;
  if (player.role === "keeper") {
    active.restartProtectionTeam = player.team;
    active.restartProtectionTimer = 1.6;
  }
  if (!player.controlledBy && player.role !== "keeper") {
    player.decisionCooldown = Math.max(player.decisionCooldown, 0.34);
    player.carryTimer = Math.max(player.carryTimer, 0.08);
  }
  autoSwitchToPossessor(active, player);
}

function canControlBall(player: PlayerBody, active: MatchRuntime) {
  if (active.ballOwnerId || active.phase !== "open") return false;
  if (player.id === active.goalKickLockPlayerId) return false;
  const flatBall = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
  const intendedReceiver = active.intendedReceiverId === player.id;
  if (player.id === active.ballIgnorePlayerId) {
    const ignoreDistance = player.pos.distanceTo(flatBall);
    if (active.ballIgnoreTimer > 0 || (active.ballState === "kicked" && ignoreDistance < PLAYER_RADIUS + BALL_RADIUS + 1.25)) return false;
    active.ballIgnorePlayerId = null;
  }
  if (active.restartProtectionTimer > 0 && active.restartProtectionTeam && player.team !== active.restartProtectionTeam) return false;
  const controlRange = active.ballState === "kicked"
    ? CONTROL_TOUCH_DISTANCE + (intendedReceiver ? 0.55 : 0)
    : CONTROL_TOUCH_DISTANCE + 0.32;
  const speedLimit = active.ballState === "kicked"
    ? intendedReceiver
      ? 23.5
      : player.role === "keeper" ? 10.5 : 15.2
    : 10.2;
  const playableHeight = player.role === "keeper" ? 2.4 : 1.35;
  return active.ballPos.y <= playableHeight && player.pos.distanceTo(flatBall) <= controlRange && active.ballVel.length() < speedLimit;
}

function kickTowardPoint(player: PlayerBody, target: THREE.Vector3, active: MatchRuntime, style: KickStyle = "shot", intendedReceiver?: PlayerBody, powerScale = 1) {
  if (active.cooldown > 0.05) return false;
  if (player.actionCooldown > 0 || player.kickTimer > 0.05 || player.tackleTimer > 0 || player.recoveryTimer > 0) return false;
  const flatBall = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
  const ownsBall = active.ballOwnerId === player.id;
  const followUpDriven = style === "driven" && active.lastTouchPlayerId === player.id;
  if (!ownsBall && player.pos.distanceTo(flatBall) > (followUpDriven ? 5.4 : 3.2)) return false;
  const direction = target.clone().setY(BALL_RADIUS).sub(active.ballPos).setY(0);
  if (direction.lengthSq() < 0.5) return false;
  const distance = clamp(direction.length(), 8, 70);
  const basePower = clamp(8.6 + distance * 0.24, 11.2, 24.6);
  let power = style === "short"
    ? clamp(17.2 + distance * 0.3, 18.2, 25.8)
    : style === "low-through"
      ? clamp(8 + distance * 0.17, 9.6, 15.5)
      : style === "through"
        ? clamp(9.1 + distance * 0.2, 11.2, 18.8)
        : style === "long" || style === "chip"
          ? clamp(12.4 + distance * 0.3, 17.2, 28.5)
          : style === "driven"
            ? clamp(basePower * 1.24, 16.2, 29.4)
            : style === "finesse"
              ? clamp(basePower * 1.02, 12.4, 22.4)
              : basePower;
  if (style === "shot" || style === "driven" || style === "finesse" || style === "chip") {
    power = clamp(power * powerScale, style === "finesse" ? 12 : 15, style === "driven" ? 34 : 38);
  }
  if (style === "finesse") direction.x += clamp(-player.pos.x * 0.18, -4.8, 4.8);
  releasePossession(active, "kicked");
  active.intendedReceiverId = intendedReceiver?.id ?? null;
  active.ballPos.copy(controlledBallPoint(player));
  active.ballPos.y = BALL_RADIUS;
  active.ballVel.copy(direction.normalize().multiplyScalar(power)).add(player.vel.clone().multiplyScalar(style === "driven" ? 0.06 : 0.12));
  active.ballVel.y = ballLiftForKick(style, distance);
  if (style === "shot") active.ballVel.y = clamp(active.ballVel.y + Math.max(0, powerScale - 0.9) * 4.15, 3.4, 9.7);
  if (style === "finesse") active.ballVel.y = clamp(active.ballVel.y + Math.max(0, powerScale - 0.86) * 1.8, 2.4, 5.6);
  if (style === "driven") active.ballVel.y = Math.min(active.ballVel.y, 0.65);
  capBallVelocity(active.ballVel);
  active.cooldown = style === "short" || style === "low-through" ? 0.2 : 0.28;
  active.ballIgnorePlayerId = player.id;
  active.ballIgnoreTimer = style === "shot" || style === "driven" || style === "finesse" || style === "chip" ? 0.18 : style === "short" ? 0.24 : 0.16;
  active.lastTouchTeam = player.team;
  active.lastTouchPlayerId = player.id;
  player.kickTimer = style === "long" || style === "chip" ? 0.5 : 0.42;
  player.actionCooldown = style === "short" || style === "low-through" ? ACTION_COOLDOWN : 0.34;
  playKickSound(active, power > 12 ? 1.22 : 0.92);
  return true;
}

function kickTargetForStyle(player: PlayerBody, active: MatchRuntime, teammate: PlayerBody, style: "short" | "long" | "through" | "low-through") {
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const receiverLead = teammate.vel.clone().multiplyScalar(style === "short" ? 0.2 : style === "long" ? 0.42 : style === "through" ? 0.32 : 0.2);
  const forwardLead = style === "through"
    ? 8.5
    : style === "low-through"
      ? 5.2
      : style === "long"
        ? 4.4
        : 0;
  const target = teammate.pos.clone()
    .add(receiverLead)
    .add(new THREE.Vector3(0, BALL_RADIUS, attackSign * forwardLead));
  if (style === "long" && (teammate.line === "forward" || Math.abs(teammate.pos.x) > FIELD_W * 0.26)) {
    target.x = clamp(teammate.pos.x + Math.sign(teammate.pos.x || player.pos.x || 1) * 2.2, -FIELD_W / 2 + 4, FIELD_W / 2 - 4);
    target.z = clamp(teammate.pos.z + attackSign * 6.5, -FIELD_L / 2 + 4, FIELD_L / 2 - 4);
  }
  if (style === "through" || style === "low-through") {
    target.z = clamp(Math.max((target.z - player.pos.z) * attackSign, 7) * attackSign + player.pos.z, -FIELD_L / 2 + 4, FIELD_L / 2 - 4);
  }
  target.x = clamp(target.x, -FIELD_W / 2 + 3, FIELD_W / 2 - 3);
  target.z = clamp(target.z, -FIELD_L / 2 + 3, FIELD_L / 2 - 3);
  return target;
}

function ballLiftForKick(style: KickStyle, distance: number) {
  if (style === "short" || style === "low-through" || style === "driven") return style === "driven" ? 0.45 : 0.25;
  if (style === "through") return clamp(distance * 0.075, 1.1, 2.8);
  if (style === "long") return clamp(distance * 0.18, 5.6, 11.4);
  if (style === "chip") return clamp(distance * 0.2, 6.8, 12.8);
  if (style === "finesse") return 2.4;
  return clamp(distance * 0.055, 2.2, 3.8);
}

function quickKickPoint(player: PlayerBody, active: MatchRuntime) {
  const goalZ = attackingGoalZ(player.team, active.half);
  const keeper = active.players.find((item) => item.team === opponent(player.team) && item.role === "keeper");
  const shotAngle = clamp(player.pos.x / (FIELD_W / 2), -1, 1);
  const keeperBias = keeper ? -Math.sign(keeper.pos.x - player.pos.x * 0.18 || player.pos.x || 1) : Math.sign(-player.pos.x || 1);
  const farPostBias = Math.sign(-shotAngle || keeperBias) * 1.35;
  const cornerAim = clamp(
    keeperBias * (GOAL_W / 2 - 1.25) + farPostBias - player.pos.x * 0.06,
    -GOAL_W / 2 + 0.95,
    GOAL_W / 2 - 0.95,
  );
  return new THREE.Vector3(
    cornerAim,
    BALL_RADIUS,
    goalZ + Math.sign(goalZ) * (GOAL_DEPTH + 1.8),
  );
}

function directionalKickPoint(player: PlayerBody, active: MatchRuntime, keys?: Set<string>) {
  const aim = currentAimDirection(player, active, keys);
  return player.pos.clone().add(aim.multiplyScalar(34)).setY(BALL_RADIUS);
}

function handleFifaActionKey(player: PlayerBody, code: string, keys: Set<string>, active: MatchRuntime) {
  if (code === "KeyC" && keys.has("KeyS")) {
    performPass(player, active, "short", true);
    return;
  }
  if (code === "KeyQ" && keys.has("KeyS")) {
    performPass(player, active, "low-through");
    return;
  }
  if (code === "KeyS") {
    if (keys.has("KeyC")) performPass(player, active, "short", true);
    else if (keys.has("KeyQ")) performPass(player, active, "low-through");
    else performPass(player, active, "short");
    return;
  }
  if (code === "KeyA") {
    performPass(player, active, "long");
    return;
  }
  if (code === "KeyW") {
    performPass(player, active, "through");
    return;
  }
}

function performPass(player: PlayerBody, active: MatchRuntime, style: "short" | "long" | "through" | "low-through", oneTwo = false) {
  const teammate = choosePassTarget(player, active, style);
  if (!teammate) return false;
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const target = kickTargetForStyle(player, active, teammate, style);
  active.pendingKickTarget = target.clone();
  const passed = kickTowardPoint(player, target, active, style, teammate);
  if (passed && oneTwo) {
    player.supportRunTimer = 1.9;
    player.supportRunTarget.copy(player.pos).add(new THREE.Vector3(clamp(-player.pos.x * 0.16, -4, 4), 0, attackSign * 18));
  }
  return passed;
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
        const laneBlockers = opponentsBetween(player, teammate.pos, active.players, 2.9);
        const directionScore = clamp(forward, -7, 7);
        const facingScore = facingDirection(player).dot(teammate.pos.clone().sub(player.pos).setY(0).normalize()) * 4.2;
        const distanceScore = 42 - Math.abs(distance - 15) * 1.35;
        return {
          teammate,
          score: distanceScore + directionScore + facingScore + clamp(open, 0, 10) * 1.85 - laneBlockers * 7.2,
          distance,
        };
      })
      .filter(({ distance }) => distance > 4.2 && distance < 31)
      .sort((a, b) => b.score - a.score)[0]?.teammate
      ?? candidates
        .filter((teammate) => !teammate.sentOff)
        .sort((a, b) => a.pos.distanceTo(player.pos) - b.pos.distanceTo(player.pos))[0]
      ?? null;
  }
  return candidates
    .map((teammate) => {
      const distance = teammate.pos.distanceTo(player.pos);
      const forward = (teammate.pos.z - player.pos.z) * attackSign;
      const open = nearestOpponentDistance(teammate, active.players);
      const laneGap = Math.abs(teammate.pos.x - player.pos.x);
      const laneBlockers = opponentsBetween(player, teammate.pos, active.players, 4.2);
      const targetDistance = style === "long" ? 36 : 23;
      const distanceScore = 38 - Math.abs(distance - targetDistance) * 1.05;
      const forwardScore = style === "long"
          ? clamp(forward * 0.72 + laneGap * 0.22, -8, 18)
          : clamp(forward * 1.35, -10, 28);
      const openScore = clamp(open, 0, 14) * 1.5;
      const throughRunBonus = (style === "through" || style === "low-through") && teammate.line === "forward" && forward > 3 ? 8 : 0;
      const sameLanePenalty = laneGap < 2.4 ? 3 : 0;
      return { teammate, score: distanceScore + forwardScore + openScore + throughRunBonus - sameLanePenalty - laneBlockers * 6.8 };
    })
    .filter(({ teammate }) => passIsUseful(player, teammate, active, style))
    .sort((a, b) => b.score - a.score)[0]?.teammate ?? null;
}

function passIsUseful(player: PlayerBody, receiver: PlayerBody, active: MatchRuntime, style: "short" | "long" | "through" | "low-through") {
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const forward = (receiver.pos.z - player.pos.z) * attackSign;
  const distance = receiver.pos.distanceTo(player.pos);
  const open = nearestOpponentDistance(receiver, active.players);
  if (style === "short") return distance < 28 && open > 0.8 && opponentsBetween(player, receiver.pos, active.players, 3.0) < 3;
  if (style === "long") return distance > 11 && distance < 58 && open > 2.4 && forward > -12 && opponentsBetween(player, receiver.pos, active.players, 5.4) < 3;
  if (style === "through" || style === "low-through") return distance > 7 && distance < 45 && open > 2.1 && forward > -2 && opponentsBetween(player, receiver.pos, active.players, 4.1) < 2;
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

function opponentsBetween(player: PlayerBody, target: THREE.Vector3, players: PlayerBody[], laneWidth: number) {
  const toTarget = target.clone().sub(player.pos).setY(0);
  const length = toTarget.length();
  if (length < 0.1) return 0;
  const forward = toTarget.normalize();
  return players.filter((item) => {
    if (item.team === player.team || item.sentOff) return false;
    const relative = item.pos.clone().sub(player.pos).setY(0);
    const along = relative.dot(forward);
    if (along < 0 || along > length) return false;
    const lateral = relative.sub(forward.clone().multiplyScalar(along)).length();
    return lateral < laneWidth;
  }).length;
}

function shoot(player: PlayerBody, active: MatchRuntime, style: "shot" | "driven" | "finesse" | "chip", powerScale = 1) {
  const target = quickKickPoint(player, active);
  if (style === "finesse") target.x = clamp(player.pos.x > 0 ? -GOAL_W / 2 + 2 : GOAL_W / 2 - 2, -GOAL_W / 2 + 1, GOAL_W / 2 - 1);
  if (style === "driven") target.z += Math.sign(target.z) * 1.2;
  return kickTowardPoint(player, target, active, style, undefined, powerScale);
}

function attemptTackle(player: PlayerBody, active: MatchRuntime) {
  if (player.sentOff || player.actionCooldown > 0 || player.tackleCooldown > 0 || player.recoveryTimer > 0 || active.tackleLockTimer > 0 || active.phase !== "open") return false;
  const owner = ballOwner(active);
  if (!owner || owner.team === player.team || owner.recoveryTimer > 0) return false;
  if (owner.role === "keeper" && active.restartProtectionTimer > 0 && active.restartProtectionTeam === owner.team) return false;
  const towardOwner = owner.pos.clone().sub(player.pos).setY(0);
  const distance = towardOwner.length();
  const facing = facingDirection(player);
  if (distance > 2.75 || (distance > 0.05 && facing.dot(towardOwner.normalize()) < 0.1)) return false;
  player.tackleCooldown = player.controlledBy ? 1.28 : 1.65;
  player.actionCooldown = 0.42;
  player.tackleTimer = 0.58;
  player.recoveryTimer = 0.72;
  player.vel.add(facing.clone().multiplyScalar(player.controlledBy ? 6.2 : 5.2));
  takePossession(player, active);
  active.ballPos.copy(controlledBallPoint(player));
  active.ballIgnorePlayerId = owner.id;
  active.ballIgnoreTimer = 0.42;
  active.tackleLockTimer = 0.92;
  owner.tackleCooldown = Math.max(owner.tackleCooldown, 1.2);
  owner.recoveryTimer = Math.max(owner.recoveryTimer, 0.62);
  const separation = player.pos.clone().sub(owner.pos).setY(0);
  if (separation.lengthSq() > 0.01) {
    separation.normalize().multiplyScalar(0.55);
    player.pos.add(separation);
    owner.pos.sub(separation);
  }
  active.cooldown = Math.max(active.cooldown, 0.24);
  return true;
}

function handleAction(player: PlayerBody | undefined, pressed: boolean, active: MatchRuntime) {
  if (!player || !pressed || active.cooldown > 0.05) return;
  kickTowardPoint(player, directionalKickPoint(player, active), active);
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
      className={`grid place-items-center rounded-full border text-center font-black uppercase leading-tight tracking-normal active:scale-95 ${
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

function ModeButton({ active, title, children, onClick }: { active: boolean; title: string; children: ReactNode; onClick: () => void }) {
  return (
    <button
      className={`rounded-md border px-4 py-3 text-left transition ${
        active ? "border-emerald-300 bg-emerald-300/15" : "border-white/10 bg-white/5 hover:bg-white/10"
      }`}
      onClick={onClick}
    >
      <div className="font-black">{title}</div>
      <div className="mt-1 text-sm text-white/60">{children}</div>
    </button>
  );
}
