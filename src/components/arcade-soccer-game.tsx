"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import * as THREE from "three";
import type { User } from "@supabase/supabase-js";
import { LogOut, Play, RotateCcw, Trophy, UserCircle, Users } from "lucide-react";
import { getSupabaseClient, hasSupabaseConfig } from "@/lib/supabase";

type GameMode = "ai" | "local";
type MatchState = "menu" | "playing" | "ended";
type TeamId = "home" | "away";
type PlayerRole = "field" | "keeper";
type PlayerLine = "keeper" | "defender" | "midfielder" | "forward" | "referee";
type PlayPhase = "open" | "goal" | "halftime" | "kickoff" | "throw-in" | "goal-kick" | "corner" | "free-kick" | "offside" | "penalty";

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
  controlledBy?: "p1" | "p2";
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

type ScoreRow = {
  id: string;
  nickname: string;
  score: number;
  goals_scored?: number;
  result?: string;
  gems?: number;
  level?: number;
  created_at: string;
};

type MatchRuntime = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  ball: THREE.Group;
  players: PlayerBody[];
  frame: number;
  lastTime: number;
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
  referee: PlayerBody;
  assistants: PlayerBody[];
  stadiumBoards: StadiumScoreboard[];
  crowdFans: THREE.Group[];
  ballPos: THREE.Vector3;
  ballVel: THREE.Vector3;
  score: { home: number; away: number };
  cooldown: number;
  possession: TeamId | null;
  ballState: BallState;
  ballOwnerId: string | null;
  ballIgnorePlayerId: string | null;
  ballIgnoreTimer: number;
  pendingKickTarget: THREE.Vector3 | null;
  lastShotTap: number;
  tackleLockTimer: number;
  audio: AudioContext | null;
  lastKickSound: number;
  lastCheerSound: number;
  lastTouchTeam: TeamId;
  lastTouchPlayerId: string | null;
  cardNotice: string;
  cardTimer: number;
  offsideFlagTimer: number;
  aiChanceCooldown: number;
  restartProtectionTeam: TeamId | null;
  restartProtectionTimer: number;
};

type StadiumScoreboard = {
  mesh: THREE.Mesh;
  texture: THREE.CanvasTexture;
  context: CanvasRenderingContext2D;
};

const FIELD_W = 64;
const FIELD_L = 96;
const GOAL_W = 16;
const PLAYER_RADIUS = 1.08;
const BALL_RADIUS = 0.46;
const CLOCK_SPEED = 18;
const HALF_TIME_SECONDS = 45 * 60;
const FULL_TIME_SECONDS = 90 * 60;
const BALL_MAX_SPEED = 34;
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
const PENALTY_SPOT_DISTANCE = 12;

const HOME_COLOR = "#38bdf8";
const AWAY_COLOR = "#fb7185";
const HOME_KEEPER_COLOR = "#facc15";
const AWAY_KEEPER_COLOR = "#a78bfa";

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

function teamSide(team: TeamId, half: 1 | 2) {
  return teamGoalZ(team, half) > 0 ? 1 : -1;
}

function opponent(team: TeamId): TeamId {
  return team === "home" ? "away" : "home";
}

function createNumberPanel(number: number, team: TeamId) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = team === "home" ? "#e0f2fe" : "#ffe4e6";
    context.strokeStyle = "#020617";
    context.lineWidth = 8;
    context.font = "bold 74px Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    const label = String(number);
    context.strokeText(label, 64, 66);
    context.fillText(label, 64, 66);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(0.66, 0.66),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  panel.name = "jersey-number";
  panel.position.set(0, 1.55, -0.49);
  panel.rotation.y = Math.PI;
  return panel;
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

function createGrassTexture(colorA: string, colorB: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = colorA;
    context.fillRect(0, 0, 256, 256);
    context.fillStyle = colorB;
    for (let y = 0; y < 256; y += 8) {
      context.globalAlpha = y % 16 === 0 ? 0.18 : 0.08;
      context.fillRect(0, y, 256, 2);
    }
    context.globalAlpha = 0.1;
    for (let i = 0; i < 900; i += 1) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      context.fillStyle = Math.random() > 0.5 ? "#d9f99d" : "#052e16";
      context.fillRect(x, y, 1, 1);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 12);
  return texture;
}

function makeHumanFigure({
  shirt,
  trim,
  shorts,
  skin = "#e8b88f",
  hair = "#3f2b1d",
  accent,
  numberPanel,
}: {
  shirt: string;
  trim: string;
  shorts: string;
  skin?: string;
  hair?: string;
  accent?: string;
  numberPanel?: THREE.Object3D;
}) {
  const group = new THREE.Group();
  const bodyRoot = new THREE.Group();
  bodyRoot.name = "body-root";
  const shirtMaterial = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.48, metalness: 0.03 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: trim, roughness: 0.56 });
  const shortsMaterial = new THREE.MeshStandardMaterial({ color: shorts, roughness: 0.56 });
  const skinMaterial = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.56 });
  const bootMaterial = new THREE.MeshStandardMaterial({ color: "#07101d", roughness: 0.48 });
  const hip = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.2, 0.38), shortsMaterial);
  hip.position.y = 1.06;
  hip.castShadow = true;
  const torso = new THREE.Mesh(
    createTorsoGeometry(),
    shirtMaterial,
  );
  torso.position.y = 1.58;
  torso.scale.set(0.98, 1.2, 0.86);
  torso.castShadow = true;

  const shoulderBand = new THREE.Mesh(
    new THREE.BoxGeometry(1.12, 0.14, 0.44),
    trimMaterial,
  );
  shoulderBand.position.y = 2.2;
  shoulderBand.castShadow = true;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.5, 0.42), shirtMaterial);
  chest.position.y = 1.94;
  chest.castShadow = true;

  const shortsMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.34, 0.38),
    shortsMaterial,
  );
  shortsMesh.position.y = 0.9;
  shortsMesh.castShadow = true;

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.15, 0.22, 8),
    skinMaterial,
  );
  neck.position.y = 2.34;
  neck.castShadow = true;

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 12, 10),
    skinMaterial,
  );
  head.scale.set(0.86, 1.16, 0.9);
  head.position.y = 2.64;
  head.castShadow = true;

  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.29, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: hair, roughness: 0.7 }),
  );
  hairCap.scale.set(0.9, 0.52, 0.94);
  hairCap.position.y = 2.88;
  hairCap.castShadow = true;

  [-1, 1].forEach((side) => {
    const shoulder = new THREE.Group();
    shoulder.name = side < 0 ? "left-arm" : "right-arm";
    shoulder.position.set(side * 0.58, 2.08, 0);
    shoulder.rotation.z = side * 0.18;
    const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.5, 4, 7), shirtMaterial);
    upperArm.position.y = -0.28;
    const elbow = new THREE.Group();
    elbow.name = side < 0 ? "left-elbow" : "right-elbow";
    elbow.position.y = -0.56;
    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.064, 0.4, 4, 7), skinMaterial);
    forearm.position.y = -0.22;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 7), skinMaterial);
    hand.name = side < 0 ? "left-hand" : "right-hand";
    hand.position.y = -0.54;
    upperArm.castShadow = true;
    forearm.castShadow = true;
    hand.castShadow = true;
    elbow.add(forearm, hand);
    shoulder.add(upperArm, elbow);
    bodyRoot.add(shoulder);
  });

  const sockMaterial = new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.58 });
  [-1, 1].forEach((side) => {
    const pivot = new THREE.Group();
    pivot.name = side < 0 ? "left-leg" : "right-leg";
    pivot.position.set(side * 0.2, 0.82, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.125, 0.66, 4, 7), skinMaterial);
    thigh.position.y = -0.36;
    thigh.castShadow = true;
    const knee = new THREE.Group();
    knee.name = side < 0 ? "left-knee" : "right-knee";
    knee.position.y = -0.72;
    const calf = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.62, 4, 7), sockMaterial);
    calf.position.y = -0.34;
    calf.castShadow = true;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.5), bootMaterial);
    boot.position.set(0, -0.76, 0.18);
    boot.castShadow = true;
    knee.add(calf, boot);
    pivot.add(thigh, knee);
    bodyRoot.add(pivot);
  });

  bodyRoot.add(hip, torso, chest, shoulderBand, shortsMesh, neck, head, hairCap);
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 10, 8),
    skinMaterial,
  );
  face.scale.set(0.82, 1.0, 0.2);
  face.position.set(0, 2.62, 0.21);
  face.castShadow = true;
  const featureMaterial = new THREE.MeshBasicMaterial({ color: "#1b120d" });
  [-1, 1].forEach((side) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 6), featureMaterial);
    eye.position.set(side * 0.078, 2.7, 0.405);
    bodyRoot.add(eye);
  });
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 5), skinMaterial);
  nose.position.set(0, 2.64, 0.42);
  nose.rotation.x = Math.PI / 2;
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.018, 0.012), featureMaterial);
  mouth.position.set(0, 2.54, 0.415);
  bodyRoot.add(face, nose, mouth);
  if (numberPanel) bodyRoot.add(numberPanel);
  group.add(bodyRoot);
  if (accent) {
    const marker = new THREE.Mesh(
      new THREE.TorusGeometry(1.08, 0.05, 8, 32),
      new THREE.MeshBasicMaterial({ color: accent }),
    );
    marker.rotation.x = Math.PI / 2;
    marker.position.y = 0.08;
    marker.name = "control-marker";
    marker.visible = false;
    group.add(marker);
  }
  return group;
}

function makeKit(team: TeamId, role: PlayerRole, accent: string, number: number) {
  const shirt = role === "keeper" ? (team === "home" ? HOME_KEEPER_COLOR : AWAY_KEEPER_COLOR) : (team === "home" ? HOME_COLOR : AWAY_COLOR);
  const trim = team === "home" ? "#075985" : "#881337";
  return makeHumanFigure({
    shirt,
    trim,
    shorts: role === "keeper" ? "#111827" : trim,
    hair: number % 3 === 0 ? "#111827" : number % 2 === 0 ? "#6b3f1f" : "#24160f",
    accent,
    numberPanel: createNumberPanel(number, team),
  });
}

function createSoccerBall() {
  const ball = new THREE.Group();
  const white = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 24, 16),
    new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.34, metalness: 0.02 }),
  );
  white.castShadow = true;
  ball.add(white);

  const patchMaterial = new THREE.MeshStandardMaterial({ color: "#111827", roughness: 0.46, side: THREE.DoubleSide });
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
    new THREE.SphereGeometry(BALL_RADIUS * 1.006, 16, 10),
    new THREE.MeshBasicMaterial({ color: "#64748b", wireframe: true, transparent: true, opacity: 0.3 }),
  );
  ball.add(seam);
  for (let i = 0; i < 3; i += 1) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(BALL_RADIUS * 0.74, 0.008, 5, 40),
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
  const runoffTexture = createGrassTexture("#116b38", "#0d512c");
  const runoff = new THREE.Mesh(
    new THREE.BoxGeometry(FIELD_W + TOUCHLINE_MARGIN * 2, 0.16, FIELD_L + TOUCHLINE_MARGIN * 2),
    new THREE.MeshStandardMaterial({ map: runoffTexture, color: "#d8ffe0", roughness: 0.94 }),
  );
  runoff.position.y = -0.08;
  runoff.receiveShadow = true;
  scene.add(runoff);

  const stripeDepth = FIELD_L / 10;
  for (let stripe = 0; stripe < 10; stripe += 1) {
    const color = stripe % 2 === 0 ? "#2f8f4e" : "#237743";
    const texture = createGrassTexture(color, stripe % 2 === 0 ? "#236f3f" : "#1b5f35");
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD_W, stripeDepth + 0.03),
      new THREE.MeshStandardMaterial({ map: texture, color: "#e6ffe9", roughness: 0.96 }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, 0.012, -FIELD_L / 2 + stripeDepth / 2 + stripe * stripeDepth);
    grass.receiveShadow = true;
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

function makeCrowdFan(color: string, skin = "#d8a174") {
  const fan = new THREE.Group();
  fan.name = "crowd-fan";
  const shirtMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.68 });
  const skinMaterial = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 });
  const trouserMaterial = new THREE.MeshStandardMaterial({ color: "#1f2937", roughness: 0.72 });
  const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.42, 0.16), shirtMaterial);
  shirt.position.y = 0.72;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 7, 7), skinMaterial);
  head.scale.set(0.9, 1.08, 0.9);
  head.position.y = 1.03;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#24160f", roughness: 0.7 }));
  hair.position.y = 1.12;
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.14, 0.14), trouserMaterial);
  hips.position.y = 0.45;
  [-1, 1].forEach((side) => {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.24, 2, 5), trouserMaterial);
    leg.position.set(side * 0.07, 0.28, 0);
    fan.add(leg);
  });
  [-1, 1].forEach((side) => {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.3, 2, 5), skinMaterial);
    arm.name = side < 0 ? "fan-left-arm" : "fan-right-arm";
    arm.position.set(side * 0.18, 0.82, 0);
    arm.rotation.z = side * 0.72;
    fan.add(arm);
  });
  fan.add(shirt, hips, head, hair);
  fan.userData.phase = Math.random() * Math.PI * 2;
  fan.userData.baseY = 0;
  return fan;
}

function addStadium(scene: THREE.Scene) {
  const standMaterial = new THREE.MeshStandardMaterial({ color: "#10251a", roughness: 0.78 });
  const railMaterial = new THREE.MeshStandardMaterial({ color: "#d1fae5", roughness: 0.38, metalness: 0.2 });
  [
    { x: 0, z: FIELD_L / 2 + 12, w: FIELD_W + 18, d: 10 },
    { x: 0, z: -FIELD_L / 2 - 12, w: FIELD_W + 18, d: 10 },
    { x: FIELD_W / 2 + 11, z: 0, w: 9, d: FIELD_L + 18 },
    { x: -FIELD_W / 2 - 11, z: 0, w: 9, d: FIELD_L + 18 },
  ].forEach((stand) => {
    for (let row = 0; row < 3; row += 1) {
      const tier = new THREE.Mesh(new THREE.BoxGeometry(stand.w, 1.4 + row * 0.8, stand.d), standMaterial);
      tier.position.set(stand.x, 0.7 + row * 0.7, stand.z + Math.sign(stand.z || 1) * row * 2);
      if (Math.abs(stand.x) > FIELD_W / 2) tier.position.x = stand.x + Math.sign(stand.x) * row * 2;
      tier.receiveShadow = true;
      scene.add(tier);
    }
  });

  const animatedFans: THREE.Group[] = [];
  const fanColors = [HOME_COLOR, AWAY_COLOR, "#f8fafc", "#22c55e", "#facc15"];
  for (let i = 0; i < 72; i += 1) {
    const fan = makeCrowdFan(fanColors[i % fanColors.length], i % 4 === 0 ? "#8d5524" : i % 3 === 0 ? "#f1c27d" : "#d8a174");
    const longSide = i % 2 === 0;
    const lane = Math.floor(i / 2);
    const side = i % 4 < 2 ? 1 : -1;
    if (longSide) {
      fan.position.set(-FIELD_W / 2 - 5 + (lane % 42) * ((FIELD_W + 10) / 41), 3.05 + (lane % 4) * 0.54, side * (FIELD_L / 2 + 7.3 + (lane % 4) * 1.55));
      fan.rotation.y = side > 0 ? Math.PI : 0;
    } else {
      fan.position.set(side * (FIELD_W / 2 + 7.3 + (lane % 4) * 1.55), 3.05 + (lane % 4) * 0.54, -FIELD_L / 2 - 5 + (lane % 42) * ((FIELD_L + 10) / 41));
      fan.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    }
    fan.userData.baseY = fan.position.y;
    scene.add(fan);
    animatedFans.push(fan);
  }

  const staticShirt = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 0.34, 0.14), new THREE.MeshStandardMaterial({ color: "#94a3b8", roughness: 0.7 }), 192);
  const staticHead = new THREE.InstancedMesh(new THREE.SphereGeometry(0.08, 5, 5), new THREE.MeshStandardMaterial({ color: "#d8a174", roughness: 0.62 }), 192);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < 192; i += 1) {
    const longSide = i % 2 === 0;
    const lane = Math.floor(i / 2);
    const side = i % 4 < 2 ? 1 : -1;
    const row = lane % 4;
    const x = longSide
      ? -FIELD_W / 2 - 6 + (lane % 48) * ((FIELD_W + 12) / 47)
      : side * (FIELD_W / 2 + 9.4 + row * 1.4);
    const z = longSide
      ? side * (FIELD_L / 2 + 9.4 + row * 1.4)
      : -FIELD_L / 2 - 6 + (lane % 48) * ((FIELD_L + 12) / 47);
    const y = 3.4 + row * 0.48;
    matrix.makeTranslation(x, y, z);
    staticShirt.setMatrixAt(i, matrix);
    matrix.makeTranslation(x, y + 0.27, z);
    staticHead.setMatrixAt(i, matrix);
  }
  scene.add(staticShirt, staticHead);

  const railA = new THREE.Mesh(new THREE.BoxGeometry(FIELD_W + 18, 0.18, 0.18), railMaterial);
  railA.position.set(0, 3.8, FIELD_L / 2 + 6.2);
  const railB = railA.clone();
  railB.position.z = -FIELD_L / 2 - 6.2;
  const railC = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, FIELD_L + 18), railMaterial);
  railC.position.set(FIELD_W / 2 + 6.2, 3.8, 0);
  const railD = railC.clone();
  railD.position.x = -FIELD_W / 2 - 6.2;
  scene.add(railA, railB, railC, railD);
  addAdvertisingBoards(scene);
  return animatedFans;
}

function makeAdTexture(label: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#07110c";
    context.fillRect(0, 0, 512, 128);
    context.fillStyle = color;
    context.fillRect(0, 0, 512, 8);
    context.fillRect(0, 120, 512, 8);
    context.font = "bold 46px Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#ecfeff";
    context.shadowColor = color;
    context.shadowBlur = 16;
    context.fillText(label, 256, 66);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addAdvertisingBoards(scene: THREE.Scene) {
  const ads = [
    ["NEON SPORTS", "#22d3ee"],
    ["VORTEX ENERGY", "#a3e635"],
    ["GOALNET", "#facc15"],
    ["SKYLINE FC", "#38bdf8"],
    ["BRAVE PLAY", "#fb923c"],
  ] as const;
  const placements = [
    { z: FIELD_L / 2 + 4.9, rot: 0, count: 6 },
    { z: -FIELD_L / 2 - 4.9, rot: Math.PI, count: 6 },
  ];
  placements.forEach((row) => {
    for (let i = 0; i < row.count; i += 1) {
      const [label, color] = ads[i % ads.length];
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(12, 1.35, 0.22),
        new THREE.MeshStandardMaterial({ map: makeAdTexture(label, color), emissive: color, emissiveIntensity: 0.12, roughness: 0.45 }),
      );
      board.position.set(-FIELD_W / 2 + 6 + i * 12.4, 0.9, row.z);
      board.rotation.y = row.rot;
      scene.add(board);
    }
  });
  [-1, 1].forEach((side) => {
    for (let i = 0; i < 8; i += 1) {
      const [label, color] = ads[(i + 2) % ads.length];
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(10.8, 1.35, 0.22),
        new THREE.MeshStandardMaterial({ map: makeAdTexture(label, color), emissive: color, emissiveIntensity: 0.1, roughness: 0.45 }),
      );
      board.position.set(side * (FIELD_W / 2 + 4.9), 0.9, -FIELD_L / 2 + 7 + i * 11.7);
      board.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      scene.add(board);
    }
  });
}

function createStadiumScoreboard(scene: THREE.Scene, position: THREE.Vector3, rotationY: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 192;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(13, 4.8, 0.35),
    new THREE.MeshStandardMaterial({ map: texture, emissive: "#164e63", emissiveIntensity: 0.15, roughness: 0.4 }),
  );
  mesh.position.copy(position);
  mesh.rotation.y = rotationY;
  scene.add(mesh);
  const board: StadiumScoreboard = { mesh, texture, context };
  drawStadiumScoreboard(board, { home: 0, away: 0 }, 0, "");
  return board;
}

function drawStadiumScoreboard(board: StadiumScoreboard, score: { home: number; away: number }, clock: number, eventText: string) {
  const { context } = board;
  context.clearRect(0, 0, 512, 192);
  context.fillStyle = "#020617";
  context.fillRect(0, 0, 512, 192);
  context.fillStyle = "#0f766e";
  context.fillRect(0, 0, 512, 12);
  context.fillRect(0, 180, 512, 12);
  context.font = "bold 34px Arial, sans-serif";
  context.textAlign = "center";
  context.fillStyle = "#ecfeff";
  context.fillText("FIFA ONLINE", 256, 42);
  context.font = "bold 58px Arial, sans-serif";
  context.fillStyle = "#67e8f9";
  context.fillText(`${score.home}`, 152, 112);
  context.fillStyle = "#fb7185";
  context.fillText(`${score.away}`, 360, 112);
  context.fillStyle = "#f8fafc";
  context.font = "bold 36px Arial, sans-serif";
  context.fillText(formatSoccerClock(clock), 256, 108);
  context.font = "bold 22px Arial, sans-serif";
  context.fillStyle = eventText.includes("GOAL") ? "#bef264" : "#cbd5e1";
  context.fillText(eventText.replace(" · WAITING FOR KICK", ""), 256, 154);
  board.texture.needsUpdate = true;
}

function createPlayer(id: string, team: TeamId, role: PlayerRole, line: PlayerLine, x: number, z: number, number: number, controlledBy?: "p1" | "p2") {
  const mesh = makeKit(team, role, controlledBy === "p2" ? "#fef08a" : "#ffffff", number);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = headingForHome(z);
  const marker = mesh.getObjectByName("control-marker");
  if (marker) marker.visible = Boolean(controlledBy);
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
    controlledBy,
  } satisfies PlayerBody;
}

function createReferee() {
  const mesh = makeHumanFigure({
    shirt: "#fbbf24",
    trim: "#111827",
    shorts: "#111827",
    hair: "#171717",
  });
  return {
    id: "referee",
    team: "home",
    role: "field",
    line: "referee",
    number: 0,
    home: new THREE.Vector3(0, 0, 4),
    pos: new THREE.Vector3(0, 0, 4),
    vel: new THREE.Vector3(),
    mesh,
    heading: 0,
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
    decisionCooldown: 0,
    carryTimer: 0,
    stuckTimer: 0,
    fallbackTimer: 0,
    fallbackTarget: new THREE.Vector3(0, 0, 4),
    lastPos: new THREE.Vector3(0, 0, 4),
    supportRunTimer: 0,
    supportRunTarget: new THREE.Vector3(0, 0, 4),
  } satisfies PlayerBody;
}

function createAssistantReferee(id: string, x: number) {
  const assistant = createReferee();
  assistant.id = id;
  assistant.line = "referee";
  assistant.pos.set(x, 0, 0);
  assistant.home.set(x, 0, 0);
  assistant.mesh.position.copy(assistant.pos);
  assistant.mesh.scale.setScalar(0.92);
  const flag = new THREE.Group();
  flag.name = "offside-flag";
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6), new THREE.MeshBasicMaterial({ color: "#f8fafc" }));
  pole.position.y = 1.25;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.24), new THREE.MeshBasicMaterial({ color: "#facc15", side: THREE.DoubleSide }));
  cloth.position.set(0.17, 1.52, 0);
  flag.add(pole, cloth);
  flag.position.set(0.48, 0, 0.12);
  assistant.mesh.add(flag);
  return assistant;
}

function formationPlayers(mode: GameMode, half: 1 | 2) {
  const rows = [
    { line: "defender" as const, z: 34, xs: [-22, -8, 8, 22], numbers: [2, 4, 5, 3] },
    { line: "midfielder" as const, z: 10, xs: [-15, 0, 15], numbers: [6, 8, 10] },
    { line: "forward" as const, z: -24, xs: [-17, 0, 17], numbers: [7, 9, 11] },
  ];
  const players: PlayerBody[] = [];
  (["home", "away"] as TeamId[]).forEach((team) => {
    const side = teamSide(team, half);
    players.push(createPlayer(`${team}-gk`, team, "keeper", "keeper", 0, side * (FIELD_L / 2 - 4), 1));
    let index = 1;
    rows.forEach((row) => {
      row.xs.forEach((x, slot) => {
        const controlledBy = team === "home" && row.line === "midfielder" && slot === 1
          ? "p1"
          : team === "away" && mode === "local" && row.line === "midfielder" && slot === 1
            ? "p2"
            : undefined;
        players.push(createPlayer(`${team}-${index}`, team, "field", row.line, x, side * row.z, row.numbers[slot], controlledBy));
        index += 1;
      });
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
  const virtualControlsRef = useRef<VirtualControls>({ dir: new THREE.Vector3(), strength: 0, sprint: false });
  const joystickPointerRef = useRef<number | null>(null);

  const [mode, setMode] = useState<GameMode>("ai");
  const [matchState, setMatchState] = useState<MatchState>("menu");
  const [score, setScore] = useState({ home: 0, away: 0 });
  const [gameClock, setGameClock] = useState(0);
  const [eventText, setEventText] = useState("Kickoff");
  const [cardNotice, setCardNotice] = useState("");
  const [leaderboard, setLeaderboard] = useState<ScoreRow[]>([]);
  const [nickname, setNickname] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [authStatus, setAuthStatus] = useState("");
  const [firstPerson, setFirstPerson] = useState(false);
  const [showTouchControls, setShowTouchControls] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [joystickKnob, setJoystickKnob] = useState({ x: 0, y: 0 });
  const firstPersonRef = useRef(false);
  const firstPersonYawRef = useRef(0);

  const playerLabel = user?.user_metadata?.full_name || user?.email || "Guest";
  const matchScore = useMemo(() => scoreMatch(score.home, score.away), [score]);
  const resultText = score.home > score.away ? "Win" : score.home < score.away ? "Lose" : "Draw";

  const fetchLeaderboard = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data } = await supabase
      .from("leaderboard")
      .select("*")
      .order("score", { ascending: false })
      .limit(10);
    setLeaderboard((data ?? []) as ScoreRow[]);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || typeof window === "undefined") {
      setAuthStatus("Google sign-in needs Supabase env vars.");
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) setAuthStatus(error.message);
  }, []);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setAuthStatus("Signed out. Playing as Guest.");
  }, []);

  const requestTackle = useCallback((controller: "p1" | "p2") => {
    const active = sceneRef.current;
    const player = active?.players.find((item) => item.controlledBy === controller);
    if (!active || !player || active.state !== "playing" || active.phase !== "open") return;
    attemptTackle(player, active);
  }, []);

  const toggleFirstPerson = useCallback(() => {
    firstPersonRef.current = !firstPersonRef.current;
    const active = sceneRef.current;
    const controlled = active?.players.find((player) => player.controlledBy === "p1");
    if (firstPersonRef.current && controlled) firstPersonYawRef.current = controlled.heading;
    setFirstPerson(firstPersonRef.current);
  }, []);

  const switchControlledPlayer = useCallback(() => {
    const active = sceneRef.current;
    if (!active || active.state !== "playing") return;
    const current = active.players.find((player) => player.controlledBy === "p1");
    const flatBall = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
    const candidates = active.players
      .filter((player) => player.team === "home" && player.role !== "keeper" && !player.sentOff && player.id !== current?.id)
      .sort((a, b) => a.pos.distanceTo(flatBall) - b.pos.distanceTo(flatBall));
    const next = candidates[0];
    if (!next) return;
    if (current) {
      current.controlledBy = undefined;
      const marker = current.mesh.getObjectByName("control-marker");
      if (marker) marker.visible = false;
    }
    next.controlledBy = "p1";
    const marker = next.mesh.getObjectByName("control-marker");
    if (marker) marker.visible = true;
    firstPersonYawRef.current = next.heading;
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

  const performMobileAction = useCallback((action: "pass" | "shoot" | "tackle" | "switch" | "first-person" | "fullscreen") => {
    const active = sceneRef.current;
    const p1 = active?.players.find((player) => player.controlledBy === "p1");
    if (action === "fullscreen") {
      void requestGameFullscreen();
      return;
    }
    if (action === "first-person") {
      toggleFirstPerson();
      return;
    }
    if (action === "switch") {
      switchControlledPlayer();
      return;
    }
    if (!active || !p1 || active.state !== "playing" || active.phase !== "open") return;
    if (action === "pass") performPass(p1, active, "short");
    if (action === "shoot") shoot(p1, active, "shot");
    if (action === "tackle") attemptTackle(p1, active);
  }, [requestGameFullscreen, switchControlledPlayer, toggleFirstPerson]);

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
    active.pendingKickTarget = null;
    active.lastShotTap = 0;
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
    setJoystickKnob({ x: knobX, y: knobY });
  }, []);

  const releaseJoystick = useCallback(() => {
    joystickPointerRef.current = null;
    virtualControlsRef.current.dir.set(0, 0, 0);
    virtualControlsRef.current.strength = 0;
    setJoystickKnob({ x: 0, y: 0 });
  }, []);

  const startMatch = useCallback((nextMode = mode) => {
    const active = sceneRef.current;
    if (!active) return;
    if (showTouchControls) void requestGameFullscreen();
    ensureAudio(active);
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
    active.halftimeDone = false;
    active.eventText = "KICKOFF";
    active.eventTimer = 0;
    active.score = { home: 0, away: 0 };
    active.players.forEach((player) => active.scene.remove(player.mesh));
    active.players = formationPlayers(nextMode, 1);
    active.players.forEach((player) => active.scene.add(player.mesh));
    active.scene.add(active.referee.mesh);
    setMode(nextMode);
    setScore({ home: 0, away: 0 });
    setGameClock(0);
    setEventText("KICKOFF");
    setSaveStatus("");
    resetPositions("home");
    active.restartActorId = kickoffTaker(active.players, "home", active.restartSpot)?.id ?? null;
    stageKickoffShape(active);
    setMatchState("playing");
  }, [mode, requestGameFullscreen, resetPositions, showTouchControls]);

  const saveScore = useCallback(async () => {
    if (mode !== "ai") {
      setSaveStatus("Online scores are only for Player vs AI mode.");
      return;
    }
    if (!user) {
      setSaveStatus("Sign in with Google to upload online scores. Guest matches stay local.");
      return;
    }
    const cleanName = nickname.trim();
    if (!nicknameIsValid(cleanName)) {
      setSaveStatus("Nickname must be 2-16 letters, numbers, spaces, _ or -.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setSaveStatus("Leaderboard is disabled until Supabase env vars are added.");
      return;
    }
    setSaveStatus("Saving...");
    const soccerPayload = {
      user_id: user.id,
      nickname: cleanName,
      score: matchScore,
      goals_scored: score.home,
      result: resultText.toLowerCase(),
      gems: score.home,
      level: resultText === "Win" ? 3 : resultText === "Draw" ? 2 : 1,
    };
    let { error } = await supabase.from("leaderboard").insert(soccerPayload);
    if (error && /goals_scored|result/i.test(error.message)) {
      const legacyPayload = {
        user_id: user.id,
        nickname: cleanName,
        score: matchScore,
        gems: score.home,
        level: resultText === "Win" ? 3 : resultText === "Draw" ? 2 : 1,
      };
      const fallback = await supabase.from("leaderboard").insert(legacyPayload);
      error = fallback.error;
    }
    if (error) {
      setSaveStatus(error.message);
      return;
    }
    setSaveStatus("Saved to leaderboard.");
    await fetchLeaderboard();
  }, [fetchLeaderboard, matchScore, mode, nickname, resultText, score.home, user]);

  useEffect(() => {
    const id = window.setTimeout(() => void fetchLeaderboard(), 0);
    return () => window.clearTimeout(id);
  }, [fetchLeaderboard]);

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
        setNickname((current) => current || String(fallbackName).slice(0, 16));
      }
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);
      if (sessionUser) {
        const fallbackName = sessionUser.user_metadata?.full_name || sessionUser.email || "Player";
        setNickname((current) => current || String(fallbackName).slice(0, 16));
        setAuthStatus("");
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#07110c");
    scene.fog = new THREE.Fog("#07110c", 75, 170);

    const camera = new THREE.PerspectiveCamera(48, mount.clientWidth / mount.clientHeight, 0.1, 260);
    camera.position.set(0, 49, 46);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);
    const pointer = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    const fieldPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const kickPoint = new THREE.Vector3();
    const onFieldPointerDown = (event: PointerEvent) => {
      const active = sceneRef.current;
      if (!active || active.state !== "playing" || active.phase !== "open" || event.button !== 0) return;
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

    scene.add(new THREE.HemisphereLight("#eaffff", "#153b22", 2.4));
    const sun = new THREE.DirectionalLight("#ffffff", 2.2);
    sun.position.set(16, 42, 28);
    sun.castShadow = true;
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
    const crowdFans = addStadium(scene);

    addGoal(scene, -1);
    addGoal(scene, 1);

    const ball = createSoccerBall();
    scene.add(ball);

    const players = formationPlayers("ai", 1);
    players.forEach((player) => scene.add(player.mesh));
    const referee = createReferee();
    scene.add(referee.mesh);
    const assistants = [createAssistantReferee("assistant-left", -FIELD_W / 2 - 1.9), createAssistantReferee("assistant-right", FIELD_W / 2 + 1.9)];
    assistants.forEach((assistant) => scene.add(assistant.mesh));
    const stadiumBoards = [
      createStadiumScoreboard(scene, new THREE.Vector3(0, 7.1, FIELD_L / 2 + 10.8), Math.PI),
      createStadiumScoreboard(scene, new THREE.Vector3(0, 7.1, -FIELD_L / 2 - 10.8), 0),
    ].filter(Boolean) as StadiumScoreboard[];

    sceneRef.current = {
      renderer,
      scene,
      camera,
      ball,
      players,
      frame: 0,
      lastTime: performance.now(),
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
      referee,
      assistants,
      stadiumBoards,
      crowdFans,
      ballPos: new THREE.Vector3(0, BALL_RADIUS, 0),
      ballVel: new THREE.Vector3(),
      score: { home: 0, away: 0 },
      cooldown: 0,
      possession: null,
      ballState: "loose",
      ballOwnerId: null,
      ballIgnorePlayerId: null,
      ballIgnoreTimer: 0,
      pendingKickTarget: null,
      lastShotTap: 0,
      tackleLockTimer: 0,
      audio: null,
      lastKickSound: 0,
      lastCheerSound: 0,
      lastTouchTeam: "home",
      lastTouchPlayerId: null,
      cardNotice: "",
      cardTimer: 0,
      offsideFlagTimer: 0,
      aiChanceCooldown: 0,
      restartProtectionTeam: null,
      restartProtectionTimer: 0,
    };

    const onResize = () => {
      const active = sceneRef.current;
      if (!active || !mount) return;
      active.camera.aspect = mount.clientWidth / mount.clientHeight;
      active.camera.updateProjectionMatrix();
      active.renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    const frame = (time: number) => {
      const active = sceneRef.current;
      if (!active) return;
      const dt = Math.min((time - active.lastTime) / 1000, 0.033);
      active.lastTime = time;

      if (active.state === "playing") {
        active.cooldown = Math.max(0, active.cooldown - dt);
        updateMatch(active, keysRef.current, dt, firstPersonRef.current, firstPersonYawRef, virtualControlsRef.current);
        animateCrowd(active, dt);
        setScore({ ...active.score });
        setGameClock(active.gameClock);
        setEventText(active.eventText);
        setCardNotice(active.cardTimer > 0 ? active.cardNotice : "");
        if (active.frame % 8 === 0) {
          active.stadiumBoards.forEach((board) => drawStadiumScoreboard(board, active.score, active.gameClock, active.eventText));
        }
        if (active.gameClock >= FULL_TIME_SECONDS) {
          active.state = "ended";
          setMatchState("ended");
        }
      } else {
        active.ball.rotation.y += dt * 0.35;
      }

      const controlledFocus = active.players.find((player) => player.controlledBy === "p1");
      const focus = active.mode === "local"
        ? active.ballPos
        : controlledFocus?.pos ?? active.ballPos;
      if (firstPersonRef.current && controlledFocus) {
        const forward = forwardFromHeading(firstPersonYawRef.current);
        controlledFocus.mesh.visible = false;
        const head = controlledFocus.pos.clone().add(new THREE.Vector3(0, 3.1, 0));
        active.camera.position.lerp(head.add(forward.clone().multiplyScalar(1.72)), 0.5);
        active.camera.lookAt(controlledFocus.pos.clone().add(forward.multiplyScalar(16)).setY(2.25));
      } else {
        if (controlledFocus) controlledFocus.mesh.visible = true;
        if (controlledFocus) firstPersonYawRef.current = controlledFocus.heading;
        active.camera.position.x += (focus.x * 0.35 - active.camera.position.x) * 0.06;
        active.camera.position.y += (49 - active.camera.position.y) * 0.08;
        active.camera.position.z += (focus.z + 43 - active.camera.position.z) * 0.06;
        active.camera.lookAt(focus.x, 0, focus.z - 6);
      }
      active.renderer.render(active.scene, active.camera);
      active.frame = requestAnimationFrame(frame);
    };
    sceneRef.current.frame = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", onResize);
      const active = sceneRef.current;
      if (!active) return;
      cancelAnimationFrame(active.frame);
      active.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const material = object.material;
        if (Array.isArray(material)) material.forEach((item) => item.dispose());
        else material.dispose();
      });
      active.renderer.dispose();
      active.renderer.domElement.removeEventListener("pointerdown", onFieldPointerDown);
      mount.removeChild(active.renderer.domElement);
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      keysRef.current.add(event.code);
      const active = sceneRef.current;
      if (!event.repeat && active?.state === "playing" && active.phase === "open") {
        const p1 = active.players.find((player) => player.controlledBy === "p1");
        if (p1) handleFifaActionKey(p1, event.code, keysRef.current, active);
      }
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "KeyA", "KeyD", "KeyS", "KeyW"].includes(event.code)) event.preventDefault();
    };
    const up = (event: KeyboardEvent) => keysRef.current.delete(event.code);
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#07110c] text-white">
      <div ref={mountRef} className="absolute inset-0" aria-label="3D arcade soccer match" />
      <section className="pointer-events-none relative z-10 flex min-h-screen flex-col justify-between p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-normal sm:text-4xl">Fifa Online</h1>
            <p className="mt-1 text-sm text-emerald-100/70">11v11 arcade soccer · one active player · AI teammates</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Metric label="Home" value={score.home} color="text-cyan-200" />
            <Metric label="Match" value={formatSoccerClock(gameClock)} />
            <Metric label="Away" value={score.away} color="text-rose-200" />
            <button
              className={`pointer-events-auto rounded-md border px-3 py-2 text-xs font-bold shadow-2xl backdrop-blur transition ${
                firstPerson ? "border-cyan-200 bg-cyan-300/20 text-cyan-50" : "border-white/10 bg-black/40 text-white hover:bg-white/10"
              }`}
              onClick={toggleFirstPerson}
            >
              {firstPerson ? "First-person" : "Broadcast"}
            </button>
            <div className="pointer-events-auto flex min-w-48 max-w-full items-center gap-2 rounded-md border border-white/10 bg-black/40 px-3 py-2 shadow-2xl backdrop-blur">
              <UserCircle size={18} className="shrink-0 text-cyan-200" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold text-white">{playerLabel}</div>
                <div className="text-[10px] uppercase text-emerald-100/55">{user ? "Signed in" : "Guest mode"}</div>
              </div>
              {user ? (
                <button aria-label="Sign out" className="grid h-8 w-8 place-items-center rounded-md border border-white/10" onClick={signOut}>
                  <LogOut size={15} />
                </button>
              ) : (
                <button
                  className="rounded-md bg-white px-3 py-2 text-xs font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!hasSupabaseConfig}
                  onClick={signInWithGoogle}
                >
                  Sign in with Google
                </button>
              )}
            </div>
          </div>
        </div>
        {matchState === "playing" && (
          <div className="mx-auto mb-4 rounded-md border border-white/10 bg-black/45 px-4 py-2 text-center text-xs text-emerald-50/80 shadow-2xl backdrop-blur">
            <span className="font-bold text-white">{eventText}</span>
            <span className="mx-2 text-white/35">·</span>
            P1 arrows move · S/A/W pass · D shoot · Z/Q/C modifiers · F tackle · Local P2 IJKL
          </div>
        )}
      </section>
      {matchState === "playing" && !showTouchControls && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-between px-4 sm:px-6">
          <button
            aria-label="Player one tackle"
            className="pointer-events-auto rounded-md border border-cyan-100/25 bg-cyan-300/15 px-4 py-3 text-sm font-black text-cyan-50 shadow-2xl backdrop-blur active:bg-cyan-200/30"
            onClick={() => requestTackle("p1")}
          >
            Tackle
          </button>
          {mode === "local" && (
            <button
              aria-label="Player two tackle"
              className="pointer-events-auto rounded-md border border-rose-100/25 bg-rose-300/15 px-4 py-3 text-sm font-black text-rose-50 shadow-2xl backdrop-blur active:bg-rose-200/30"
              onClick={() => requestTackle("p2")}
            >
              P2 Tackle
            </button>
          )}
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
            className="pointer-events-auto absolute h-32 w-32 rounded-full border border-cyan-100/25 bg-black/30 shadow-2xl backdrop-blur-md sm:h-40 sm:w-40"
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
            <div
              className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-100/45 bg-cyan-200/35 shadow-[0_0_24px_rgba(103,232,249,0.25)] sm:h-16 sm:w-16"
              style={{ transform: `translate(calc(-50% + ${joystickKnob.x}px), calc(-50% + ${joystickKnob.y}px))` }}
            />
          </div>

          <div
            className="pointer-events-auto absolute grid grid-cols-3 gap-2 max-[560px]:grid-cols-2 sm:gap-3"
            style={{ right: "calc(env(safe-area-inset-right) + 4.25rem)", bottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
          >
            <TouchButton label="Pass" onPress={() => performMobileAction("pass")} />
            <TouchButton label="Shoot" strong onPress={() => performMobileAction("shoot")} />
            <TouchButton
              label="Sprint"
              onDown={() => {
                virtualControlsRef.current.sprint = true;
              }}
              onUp={() => {
                virtualControlsRef.current.sprint = false;
              }}
            />
            <TouchButton label="Switch" onPress={() => performMobileAction("switch")} />
            <TouchButton label={firstPerson ? "View" : "FPV"} active={firstPerson} onPress={() => performMobileAction("first-person")} />
            <TouchButton label="Tackle" onPress={() => performMobileAction("tackle")} />
          </div>

          <button
            className="pointer-events-auto absolute rounded-full border border-white/15 bg-black/35 px-4 py-2 text-xs font-black text-white shadow-2xl backdrop-blur-md active:bg-white/15"
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
      {matchState === "playing" && eventText !== "PLAY" && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
          <div className="rounded-md border border-white/15 bg-black/55 px-6 py-3 text-2xl font-black tracking-normal text-white shadow-2xl backdrop-blur">
            {eventText}
          </div>
        </div>
      )}
      {matchState === "playing" && cardNotice ? (
        <div className="pointer-events-none absolute left-1/2 top-24 z-20 -translate-x-1/2 rounded-md border border-yellow-200/50 bg-black/70 px-5 py-3 text-sm font-black text-yellow-100 shadow-2xl backdrop-blur">
          {cardNotice}
        </div>
      ) : null}

      {matchState !== "playing" && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-md border border-emerald-300/25 bg-[#08130d]/94 p-5 shadow-[0_0_45px_rgba(16,185,129,0.18)]">
            <div className="mb-4 flex items-center gap-3">
              {matchState === "ended" ? <Trophy className="text-lime-300" /> : <Users className="text-cyan-300" />}
              <div>
                <h2 className="text-xl font-black">{matchState === "ended" ? `${resultText} ${score.home}-${score.away}` : "Choose match mode"}</h2>
                <p className="text-sm text-white/65">
                  {matchState === "ended" ? `Score value ${matchScore}` : "Fast 11v11 soccer with a lightweight stadium, readable AI, and arcade controls."}
                </p>
              </div>
            </div>

            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <ModeButton active={mode === "ai"} title="Player vs AI Team" onClick={() => setMode("ai")}>
                Control one cyan player. Teammates and opponents are AI.
              </ModeButton>
              <ModeButton active={mode === "local"} title="Local 1v1 Team Mode" onClick={() => setMode("local")}>
                P1 uses Arrow Keys. P2 uses IJKL. AI fills the rest.
              </ModeButton>
            </div>

            <div className="grid grid-cols-2 gap-3">
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
            </div>

            <div className="mt-5 border-t border-white/10 pt-4">
              <div className="mb-2 text-sm font-bold">Leaderboard</div>
              {!hasSupabaseConfig && <p className="mb-3 text-sm text-amber-200/85">Leaderboard is offline until Supabase env vars are added.</p>}
              {hasSupabaseConfig && !user && <p className="mb-3 text-sm text-cyan-100/75">Guest play is enabled. Sign in to upload Player vs AI scores.</p>}
              {authStatus && <p className="mb-3 text-sm text-cyan-100/75">{authStatus}</p>}
              <div className="space-y-2">
                {leaderboard.length === 0 ? (
                  <p className="text-sm text-white/55">No saved scores yet.</p>
                ) : (
                  leaderboard.map((entry, index) => (
                    <div key={entry.id} className="flex items-center justify-between rounded-md bg-white/6 px-3 py-2 text-sm">
                      <span className="truncate">{index + 1}. {entry.nickname}</span>
                      <span className="font-mono text-cyan-100">{entry.score}</span>
                    </div>
                  ))
                )}
              </div>
              {matchState === "ended" && (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <input
                    className="min-w-0 flex-1 rounded-md border border-white/15 bg-black/35 px-3 py-2 text-sm text-white outline-none focus:border-emerald-300"
                    maxLength={16}
                    placeholder="Nickname"
                    value={nickname}
                    onChange={(event) => setNickname(event.target.value)}
                  />
                  <button
                    className="rounded-md bg-lime-300 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!hasSupabaseConfig || !user || mode !== "ai"}
                    onClick={saveScore}
                  >
                    Save score
                  </button>
                </div>
              )}
              {saveStatus && <p className="mt-2 text-xs text-cyan-100/75">{saveStatus}</p>}
            </div>
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
  firstPersonMode = false,
  firstPersonYaw?: MutableRefObject<number>,
  virtualControls?: VirtualControls,
) {
  const ball = active.ballPos;
  const ballVel = active.ballVel;
  const p1 = active.players.find((player) => player.controlledBy === "p1");
  const p2 = active.players.find((player) => player.controlledBy === "p2");
  if (firstPersonMode && p1 && firstPersonYaw) {
    const turnInput = (keys.has("ArrowLeft") ? 1 : 0) - (keys.has("ArrowRight") ? 1 : 0);
    firstPersonYaw.current += turnInput * 2.65 * dt;
    firstPersonYaw.current = Math.atan2(Math.sin(firstPersonYaw.current), Math.cos(firstPersonYaw.current));
  } else if (p1 && firstPersonYaw) {
    firstPersonYaw.current = p1.heading;
  }
  active.ballIgnoreTimer = Math.max(0, active.ballIgnoreTimer - dt);
  active.tackleLockTimer = Math.max(0, active.tackleLockTimer - dt);
  active.cardTimer = Math.max(0, active.cardTimer - dt);
  active.offsideFlagTimer = Math.max(0, active.offsideFlagTimer - dt);
  active.aiChanceCooldown = Math.max(0, active.aiChanceCooldown - dt);
  active.restartProtectionTimer = Math.max(0, active.restartProtectionTimer - dt);
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
  } else {
    const actor = active.restartActorId ? active.players.find((player) => player.id === active.restartActorId) : null;
    const actorNeedsSpot = active.phase === "throw-in" || active.phase === "kickoff" || active.phase === "goal-kick";
    const readyDistance = active.phase === "throw-in" ? 3.2 : 1.95;
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
    const input: PlayerInputState = active.phase === "open"
      ? player.controlledBy === "p1"
        ? playerInput(keys, "p1", firstPersonMode, firstPersonYaw?.current ?? player.heading, virtualControls)
        : player.controlledBy === "p2"
          ? playerInput(keys, "p2")
          : aiInput(player, active)
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
    player.carryTimer = active.ballOwnerId === player.id ? player.carryTimer + dt : 0;
    player.supportRunTimer = Math.max(0, player.supportRunTimer - dt);
    const recoveryScale = player.recoveryTimer > 0 ? 0.48 : 1;
    movePlayer(player, input.dir, maxSpeed * recoveryScale * speedScale, dt, active);
    clampPlayer(player);
    player.mesh.position.copy(player.pos);
    animatePlayer(player, dt);
    updateStuckState(player, input.dir, active, dt);
  });
  if (active.frame % 2 === 0) separatePlayers(active.players);
  handleGoalkeeperActions(active);
  updateReferee(active, dt);
  updateAssistantReferees(active, dt);

  if (active.phase === "open") {
    encourageAiFinishing(active);
    createLateAiChance(active);
    handleAction(p2, keys.has("Enter") || keys.has("ShiftRight"), active);
    if (keys.has("KeyF") && p1) attemptTackle(p1, active);
    if ((keys.has("Period") || keys.has("Numpad0")) && p2) attemptTackle(p2, active);
    keepIdleControlledPossessionMoving(p1, keys, active);
  }

  if (active.phase !== "open") {
    const actor = active.restartActorId ? active.players.find((player) => player.id === active.restartActorId) : null;
    if (active.phase === "throw-in" && actor) {
      const hands = throwInHandPoint(actor, active.restartDirection);
      ball.copy(hands);
      setPlayerHeading(actor, Math.atan2(active.restartDirection.x, active.restartDirection.z), dt, 7.5);
      poseThrower(actor, actor.pos.distanceTo(active.restartSpot) < 1.8);
    } else if (active.phase !== "goal") {
      ball.copy(active.restartSpot);
    }
    ballVel.set(0, 0, 0);
  }

  const dribbler = ballOwner(active);
  if (active.phase === "open" && dribbler) {
    const dribblePoint = dribbler.role === "keeper" && dribbler.catchTimer > 0 ? keeperHandPoint(dribbler) : controlledBallPoint(dribbler);
    ball.lerp(dribblePoint, 1 - Math.pow(0.0000008, dt));
    if (dribbler.role !== "keeper" || dribbler.catchTimer <= 0) ball.y = BALL_RADIUS;
    ballVel.copy(dribbler.vel).multiplyScalar(0.82);
  }

  active.players.forEach((player) => {
    if (player.id === active.ballOwnerId) return;
    if (player.id === active.ballIgnorePlayerId && active.ballIgnoreTimer > 0) return;
    const flatBall = new THREE.Vector3(ball.x, 0, ball.z);
    const delta = flatBall.sub(player.pos);
    const distance = delta.length();
    const minDistance = PLAYER_RADIUS + BALL_RADIUS;
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
      if (push > 3.4 && player.vel.length() > 10 && active.cooldown <= 0.08) {
        stopForRestart(active, "free-kick", opponent(player.team), new THREE.Vector3(ball.x, BALL_RADIUS, ball.z), `${opponent(player.team).toUpperCase()} FREE KICK`);
      }
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

  if (crossedSideline) {
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
  } else if (Math.abs(ball.z) > FIELD_L / 2 && !insideGoalMouth) {
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

function keepIdleControlledPossessionMoving(player: PlayerBody | undefined, keys: Set<string>, active: MatchRuntime) {
  if (!player || active.ballOwnerId !== player.id || player.carryTimer < 1.1 || active.cooldown > 0.05) return;
  if (keys.has("ArrowUp") || keys.has("ArrowDown") || keys.has("ArrowLeft") || keys.has("ArrowRight")) return;
  const goalDistance = Math.abs(attackingGoalZ(player.team, active.half) - player.pos.z);
  const acted = (goalDistance < 42 || active.gameClock > 20 * 60 && goalDistance < 62) && Math.abs(player.pos.x) < GOAL_W * 2.8
    ? shoot(player, active, goalDistance < 18 ? "driven" : "shot")
    : performPass(player, active, "short") || performPass(player, active, "through");
  if (acted) {
    player.carryTimer = 0;
    player.decisionCooldown = 0.7;
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
  const inScoringArea = goalDistance < 32 && Math.abs(owner.pos.x) < GOAL_W * 2.45;
  const lateMatchRisk = active.gameClock > 15 * 60 && goalDistance < 62 && Math.abs(owner.pos.x) < FIELD_W / 2 - 5;
  if (owner.carryTimer < (inScoringArea ? 0.12 : 0.34)) return;
  const blockers = opponentsBetween(owner, new THREE.Vector3(0, 0, attackingGoalZ(owner.team, active.half)), active.players, inScoringArea ? 7.5 : 5.2);
  if (inScoringArea && blockers <= 4) {
    shoot(owner, active, goalDistance < 24 ? "driven" : "shot");
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
  active.eventText = `${candidate.team.toUpperCase()} SHOT`;
  active.eventTimer = 0.6;
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
  active.phaseTimer = 2.35;
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
      player.celebrateTimer = 2.2;
      player.supportRunTarget.copy(scorer?.pos ?? player.pos).add(new THREE.Vector3((player.number % 3 - 1) * 2.2, 0, 0));
    }
  });
}

function stopForRestart(active: MatchRuntime, phase: PlayPhase, team: TeamId, spot: THREE.Vector3, label: string) {
  active.phase = phase;
  active.phaseTimer = phase === "kickoff" ? 1.8 : phase === "goal-kick" ? 1.8 : phase === "penalty" ? 1.6 : 1.35;
  active.restartTeam = team;
  active.restartSpot.copy(spot);
  if (phase === "kickoff") {
    resetKickoffShape(active);
    active.restartActorId = kickoffTaker(active.players, team, spot)?.id ?? null;
    active.restartDirection.set(0, 0, Math.sign(attackingGoalZ(team, active.half)));
    stageKickoffShape(active);
  } else if (phase === "throw-in") {
    active.restartDirection.set(spot.x > 0 ? -1 : 1, 0, Math.sign(attackingGoalZ(team, active.half)) * 0.35).normalize();
    active.restartActorId = nearestTeamPlayer(active.players.filter((player) => !player.controlledBy), team, spot)?.id
      ?? nearestTeamPlayer(active.players, team, spot)?.id
      ?? null;
  } else {
    active.restartDirection.set(0, 0, Math.sign(attackingGoalZ(team, active.half)));
    active.restartActorId = phase === "penalty"
      ? bestPenaltyTaker(active.players, team, spot)?.id ?? null
      : phase === "goal-kick"
      ? active.players.find((player) => player.team === team && player.role === "keeper")?.id ?? null
      : phase === "corner" || phase === "free-kick"
        ? nearestTeamPlayer(active.players.filter((player) => !player.controlledBy), team, spot)?.id
          ?? nearestTeamPlayer(active.players, team, spot)?.id
          ?? null
      : null;
  }
  arrangeSetPieceShape(active, phase, team, spot);
  active.eventText = `${label} · WAITING FOR KICK`;
  active.eventTimer = 0;
  active.ballPos.copy(active.restartSpot);
  active.ballVel.set(0, 0, 0);
  releasePossession(active, "loose");
  active.cooldown = Math.max(active.cooldown, 0.45);
}

function bestPenaltyTaker(players: PlayerBody[], team: TeamId, spot: THREE.Vector3) {
  return players
    .filter((player) => player.team === team && player.role !== "keeper" && !player.sentOff)
    .sort((a, b) => {
      const lineScore = (line: PlayerLine) => line === "forward" ? 0 : line === "midfielder" ? 1 : 2;
      return lineScore(a.line) - lineScore(b.line) || a.pos.distanceTo(spot) - b.pos.distanceTo(spot);
    })[0] ?? null;
}

function arrangeSetPieceShape(active: MatchRuntime, phase: PlayPhase, team: TeamId, spot: THREE.Vector3) {
  if (phase === "halftime" || phase === "goal") return;
  const attackSign = Math.sign(attackingGoalZ(team, active.half));
  active.players.forEach((player) => {
    if (player.sentOff) return;
    if (player.id === active.restartActorId) {
      player.pos.copy(spot).setY(0);
      if (phase === "throw-in") player.pos.x = Math.sign(spot.x || 1) * (FIELD_W / 2 - 2.1);
      player.vel.set(0, 0, 0);
      player.mesh.position.copy(player.pos);
      return;
    }
    const side = player.team === team ? 1 : -1;
    const base = player.home.clone();
    if (phase === "goal-kick") {
      if (player.team === team) {
        base.z = teamGoalZ(team, active.half) - Math.sign(teamGoalZ(team, active.half)) * (player.line === "defender" ? 19 : player.line === "midfielder" ? 31 : 43);
      } else {
        base.z = clamp(teamGoalZ(team, active.half) - Math.sign(teamGoalZ(team, active.half)) * 23, -FIELD_L / 2 + 5, FIELD_L / 2 - 5);
      }
    } else if (phase === "corner") {
      base.x = clamp(base.x * 0.55 + spot.x * 0.35, -FIELD_W / 2 + 5, FIELD_W / 2 - 5);
      base.z = clamp(spot.z - attackSign * (player.team === team ? 11 + player.number % 8 : 8 + player.number % 7), -FIELD_L / 2 + 4, FIELD_L / 2 - 4);
    } else if (phase === "free-kick") {
      if (player.team === team) {
        const supportSide = player.number % 2 === 0 ? -1 : 1;
        base.x = clamp(base.x * 0.72 + spot.x * 0.2 + supportSide * (player.line === "forward" ? 3.5 : 1.8), -FIELD_W / 2 + 4, FIELD_W / 2 - 4);
        base.z = clamp(base.z * 0.58 + spot.z * 0.22 + attackSign * (player.line === "forward" ? 12 : player.line === "midfielder" ? 5 : -2), -FIELD_L / 2 + 4, FIELD_L / 2 - 4);
      } else if (player.role !== "keeper" && (player.line === "defender" || player.number === 6 || player.number === 8)) {
        const wallSlots = [-2.7, -0.9, 0.9, 2.7, 4.5];
        const wallIndex = player.line === "defender" ? [2, 4, 5, 3].indexOf(player.number) : player.number === 6 ? 4 : 5;
        const offset = wallSlots[clamp(wallIndex, 0, wallSlots.length - 1)] ?? 0;
        base.x = clamp(spot.x + offset, -FIELD_W / 2 + 4, FIELD_W / 2 - 4);
        base.z = clamp(spot.z + attackSign * 8.2, -FIELD_L / 2 + 5, FIELD_L / 2 - 5);
      } else {
        base.x = clamp(base.x * 0.82 + spot.x * 0.08, -FIELD_W / 2 + 4, FIELD_W / 2 - 4);
        base.z = clamp(base.z * 0.78 + spot.z * 0.08 - attackSign * 3, -FIELD_L / 2 + 4, FIELD_L / 2 - 4);
      }
    } else if (phase === "offside") {
      base.x = clamp(base.x * 0.75 + spot.x * 0.12, -FIELD_W / 2 + 4, FIELD_W / 2 - 4);
      base.z = clamp(base.z * 0.72 + spot.z * 0.12 + attackSign * side * 5, -FIELD_L / 2 + 4, FIELD_L / 2 - 4);
    } else if (phase === "penalty") {
      const defending = opponent(team);
      if (player.team === team && player.id !== active.restartActorId) base.set((player.number % 2 ? -1 : 1) * (10 + player.number % 8), 0, spot.z - attackSign * 11);
      else if (player.team === defending && player.role !== "keeper") base.set((player.number % 2 ? -1 : 1) * (12 + player.number % 7), 0, spot.z - attackSign * 12);
    }
    player.pos.copy(base);
    player.vel.set(0, 0, 0);
    clampPlayer(player);
    player.mesh.position.copy(player.pos);
    player.lastPos.copy(player.pos);
  });
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
    active.restartDirection.set(0, 0, Math.sign(attackingGoalZ(active.restartTeam, active.half))).normalize();
  }
  const kickoffActor = restartingPhase === "kickoff" ? kickoffTaker(active.players, active.restartTeam, active.restartSpot) : null;
  const actor = active.restartActorId ? active.players.find((player) => player.id === active.restartActorId) : kickoffActor;
  if (restartingPhase === "throw-in" && actor) {
    const receiver = chooseThrowInTarget(actor, active);
    if (receiver) active.restartDirection.copy(receiver.pos.clone().sub(actor.pos).setY(0).normalize());
  }
  if (restartingPhase === "goal-kick" && actor) {
    actor.heading = Math.atan2(active.restartDirection.x, active.restartDirection.z);
    actor.mesh.rotation.y = actor.heading;
    active.ballPos.copy(actor.pos.clone().add(active.restartDirection.clone().multiplyScalar(1.05)).setY(BALL_RADIUS));
  }
  const power = restartingPhase === "corner" ? 12 : restartingPhase === "goal-kick" ? 34 : restartingPhase === "throw-in" ? 9.2 : restartingPhase === "penalty" ? 18 : restartingPhase === "free-kick" ? 11 : 4.2;
  const releasePoint = active.phase === "throw-in" && actor
    ? throwInHandPoint(actor, active.restartDirection).add(active.restartDirection.clone().multiplyScalar(0.38))
    : active.restartSpot;
  active.ballPos.copy(releasePoint);
  active.ballVel.copy(active.restartDirection).multiplyScalar(power);
  active.ballVel.y = restartingPhase === "goal-kick" ? 14.8 : restartingPhase === "corner" ? 6.5 : restartingPhase === "throw-in" ? 4.8 : restartingPhase === "penalty" ? 1.4 : restartingPhase === "free-kick" ? 4.8 : 0;
  active.lastTouchTeam = active.restartTeam;
  active.lastTouchPlayerId = active.restartActorId;
  active.restartActorId = null;
  active.ballState = "kicked";
  active.ballOwnerId = null;
  active.ballIgnorePlayerId = actor?.id ?? null;
  active.ballIgnoreTimer = restartingPhase === "goal-kick" ? 1.15 : restartingPhase === "throw-in" ? 0.52 : restartingPhase === "penalty" ? 0.72 : 0.34;
  if (restartingPhase === "goal-kick") {
    active.restartProtectionTeam = active.restartTeam;
    active.restartProtectionTimer = 1.45;
  }
  active.phase = "open";
  active.phaseTimer = 0;
  active.eventText = showSecondHalfBanner ? "SECOND HALF" : "PLAY";
  active.eventTimer = showSecondHalfBanner ? 1.4 : 0;
  active.cooldown = 0.35;
  if (actor) {
    actor.kickTimer = restartingPhase === "throw-in" ? 0 : 0.46;
    if (restartingPhase === "throw-in") {
      actor.catchTimer = 0.18;
      poseThrower(actor, true);
    }
    if (restartingPhase === "goal-kick") actor.catchTimer = 0.2;
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
  const leftArm = player.mesh.getObjectByName("left-arm");
  const rightArm = player.mesh.getObjectByName("right-arm");
  const leftElbow = player.mesh.getObjectByName("left-elbow");
  const rightElbow = player.mesh.getObjectByName("right-elbow");
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
      return { player, score: 24 - Math.abs(distance - 12) + clamp(forward, -6, 10) + clamp(open, 0, 10) * 1.4 - laneBlockers * 5 };
    })
    .filter(({ player }) => player.pos.distanceTo(actor.pos) < 24)
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

function updateReferee(active: MatchRuntime, dt: number) {
  const referee = active.referee;
  const target = new THREE.Vector3(
    clamp(active.ballPos.x - Math.sign(active.ballVel.x || 1) * 7, -FIELD_W / 2 + 6, FIELD_W / 2 - 6),
    0,
    clamp(active.ballPos.z + 10, -FIELD_L / 2 + 8, FIELD_L / 2 - 8),
  );
  const dir = target.sub(referee.pos);
  movePlayer(referee, dir.lengthSq() > 1 ? dir.normalize() : dir.set(0, 0, 0), 7, dt, active);
  referee.mesh.position.copy(referee.pos);
  animatePlayer(referee, dt);
}

function updateAssistantReferees(active: MatchRuntime, dt: number) {
  const attackingTeam = active.possession ?? active.lastTouchTeam;
  const attackSign = Math.sign(attackingGoalZ(attackingTeam, active.half));
  const defenders = active.players
    .filter((player) => player.team === opponent(attackingTeam) && !player.sentOff)
    .map((player) => player.pos.z)
    .sort((a, b) => attackSign > 0 ? b - a : a - b);
  const defenderLine = defenders[1] ?? active.ballPos.z;
  const offsideLine = attackSign > 0 ? Math.min(defenderLine, active.ballPos.z) : Math.max(defenderLine, active.ballPos.z);
  active.assistants.forEach((assistant, index) => {
    const sideX = index === 0 ? -FIELD_W / 2 - 1.9 : FIELD_W / 2 + 1.9;
    const ballLead = clamp(active.ballVel.z * 0.22, -3.5, 3.5);
    const targetZ = clamp(offsideLine * 0.82 + active.ballPos.z * 0.18 + ballLead, -FIELD_L / 2 + 3, FIELD_L / 2 - 3);
    const deltaZ = targetZ - assistant.pos.z;
    const stepZ = clamp(deltaZ, -12.8 * dt, 12.8 * dt);
    assistant.vel.set(0, 0, Math.abs(stepZ) > 0.01 ? stepZ / Math.max(dt, 0.001) : 0);
    assistant.pos.x = sideX;
    assistant.pos.z += stepZ;
    assistant.pos.z = clamp(assistant.pos.z, -FIELD_L / 2 + 3, FIELD_L / 2 - 3);
    assistant.pos.x = sideX;
    assistant.mesh.position.copy(assistant.pos);
    assistant.heading = index === 0 ? Math.PI / 2 : -Math.PI / 2;
    assistant.mesh.rotation.y = assistant.heading;
    const flag = assistant.mesh.getObjectByName("offside-flag");
    if (flag) {
      flag.rotation.z = active.offsideFlagTimer > 0 ? (index === 0 ? -1.35 : 1.35) : 0;
      flag.rotation.x = active.offsideFlagTimer > 0 ? -0.28 : 0;
      flag.position.y = active.offsideFlagTimer > 0 ? 0.58 : 0;
    }
    animatePlayer(assistant, dt);
    const flagArm = assistant.mesh.getObjectByName(index === 0 ? "right-arm" : "left-arm");
    if (flagArm && active.offsideFlagTimer > 0) flagArm.rotation.z = index === 0 ? -1.55 : 1.55;
  });
}

function handleGoalkeeperActions(active: MatchRuntime) {
  if (active.phase !== "open" || active.ballOwnerId) return;
  if (active.ballPos.y > 2.8) return;
  const flatBall = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
  active.players
    .filter((player) => player.role === "keeper")
    .forEach((keeper) => {
      const ownZ = teamGoalZ(keeper.team, active.half);
      const inKeeperZone = Math.abs(active.ballPos.z - ownZ) < 17 && Math.abs(active.ballPos.x) < GOAL_W / 2 + 6;
      const movingTowardGoal = Math.sign(active.ballVel.z || ownZ - active.ballPos.z) === Math.sign(ownZ - active.ballPos.z);
      const closeEnough = keeper.pos.distanceTo(flatBall) < (movingTowardGoal ? 3.35 : 2.35);
      if (!inKeeperZone) return;
      const shotSpeed = active.ballVel.length();
      if (shotSpeed > 9.2) {
        const timeToGoal = Math.abs((ownZ - active.ballPos.z) / (active.ballVel.z || Math.sign(ownZ - active.ballPos.z) * 0.1));
        const predictedX = clamp(active.ballPos.x + active.ballVel.x * clamp(timeToGoal, 0, 0.62), -GOAL_W / 2 + 0.65, GOAL_W / 2 - 0.65);
        const lateralGap = predictedX - keeper.pos.x;
        const canDive = Math.abs(lateralGap) < 2.65 && Math.abs(active.ballPos.z - ownZ) < 11.5;
        const wellPositioned = Math.abs(lateralGap) < 1.05 && Math.abs(active.ballPos.z - ownZ) < 9.8;
        if (!wellPositioned && !canDive) return;
        keeper.diveSide = Math.sign(lateralGap || keeper.diveSide || 1);
        keeper.diveTimer = 0.7;
        keeper.catchTimer = 0.46;
        keeper.recoveryTimer = Math.max(keeper.recoveryTimer, 0.36);
        keeper.vel.x = clamp(keeper.vel.x + keeper.diveSide * clamp(Math.abs(lateralGap) * 1.45, 1.2, 2.8), -5.2, 5.2);
        keeper.pos.x = clamp(keeper.pos.x + keeper.diveSide * clamp(Math.abs(lateralGap) * 0.18, 0.12, 0.42), -GOAL_W / 2 + 0.8, GOAL_W / 2 - 0.8);
        active.ballVel.x += keeper.diveSide * clamp(shotSpeed * 0.22, 2.2, 4.6);
        active.ballVel.z *= wellPositioned ? -0.48 : -0.3;
        active.ballVel.y = Math.max(active.ballVel.y, 1.8);
        active.ballState = "loose";
        active.ballIgnorePlayerId = keeper.id;
        active.ballIgnoreTimer = 0.24;
        active.lastTouchTeam = keeper.team;
        active.lastTouchPlayerId = keeper.id;
        active.eventText = `${keeper.team.toUpperCase()} SAVE`;
        active.eventTimer = 0.7;
        return;
      }
      if (!closeEnough) return;
      keeper.catchTimer = 0.62;
      keeper.recoveryTimer = Math.max(keeper.recoveryTimer, 0.28);
      takePossession(keeper, active);
      active.ballPos.copy(keeperHandPoint(keeper));
      active.ballVel.set(0, 0, 0);
      active.eventText = `${keeper.team.toUpperCase()} KEEPER`;
      active.eventTimer = 0.8;
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
  }
  const turnSpeed = player.line === "referee" ? 5.4 : player.role === "keeper" ? 3.9 : player.controlledBy ? 6.2 : 5.15;
  const turnGap = Math.abs(setPlayerHeading(player, desiredHeading, dt, turnSpeed));
  const acceleration = player.line === "referee" ? 18 : player.role === "keeper" ? 17 : player.controlledBy ? 32 : 27;
  const braking = player.role === "keeper" ? 34 : player.controlledBy ? 42 : 36;
  let targetVel = new THREE.Vector3();
  if (hasIntent) {
    const turnScale = player.role === "keeper" ? 1 : clamp(1 - turnGap / Math.PI, 0.18, 1);
    const travelDir = player.role === "keeper" ? dir : forwardFromHeading(player.heading);
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
  if (player.controlledBy || player.line === "referee" || active.phase !== "open") {
    player.lastPos.copy(player.pos);
    return;
  }
  const moved = player.pos.distanceTo(player.lastPos);
  const expectsMotion = intent.lengthSq() > 0.05 && player.vel.length() > 0.12;
  player.stuckTimer = expectsMotion && moved < 0.055 ? player.stuckTimer + dt : Math.max(0, player.stuckTimer - dt * 1.6);
  if (player.stuckTimer > 0.95 && player.role !== "keeper") {
    const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
    const side = player.number % 2 === 0 ? 1 : -1;
    player.fallbackTarget.copy(player.home).add(new THREE.Vector3(side * (4 + player.number % 3), 0, attackSign * (player.line === "forward" ? 5 : 2.5)));
    player.fallbackTarget.x = clamp(player.fallbackTarget.x, -FIELD_W / 2 + 3, FIELD_W / 2 - 3);
    player.fallbackTarget.z = clamp(player.fallbackTarget.z, -FIELD_L / 2 + 3, FIELD_L / 2 - 3);
    player.fallbackTimer = 1.35;
    player.stuckTimer = 0;
  }
  player.lastPos.copy(player.pos);
}

function animatePlayer(player: PlayerBody, dt: number) {
  const speed = player.vel.length();
  player.runPhase += speed * dt * (player.role === "keeper" ? 1.55 : 2.65);
  const strideScale = player.role === "keeper" ? 0.26 : 0.68;
  const stride = speed > 0.35 ? Math.sin(player.runPhase) * strideScale : 0;
  const lift = speed > 0.35 ? 0.12 + Math.max(0, Math.sin(player.runPhase)) * 0.58 : 0.08;
  const otherLift = speed > 0.35 ? 0.12 + Math.max(0, -Math.sin(player.runPhase)) * 0.58 : 0.08;
  const armSwing = -stride * 0.95;
  const bodyRoot = player.mesh.getObjectByName("body-root");
  const leftLeg = player.mesh.getObjectByName("left-leg");
  const rightLeg = player.mesh.getObjectByName("right-leg");
  const leftKnee = player.mesh.getObjectByName("left-knee");
  const rightKnee = player.mesh.getObjectByName("right-knee");
  const leftArm = player.mesh.getObjectByName("left-arm");
  const rightArm = player.mesh.getObjectByName("right-arm");
  const leftElbow = player.mesh.getObjectByName("left-elbow");
  const rightElbow = player.mesh.getObjectByName("right-elbow");
  if (bodyRoot) {
    const cadence = Math.sin(player.runPhase);
    const balance = Math.cos(player.runPhase);
    const turnLean = clamp(player.turnRate * -0.018, -0.11, 0.11);
    bodyRoot.position.x = speed > 0.35 ? balance * (player.role === "keeper" ? 0.012 : 0.035) : 0;
    bodyRoot.position.y = speed > 0.35 ? Math.abs(Math.sin(player.runPhase * 2)) * 0.055 : 0;
    bodyRoot.position.z = 0;
    bodyRoot.rotation.x = speed > 0.35 && player.role !== "keeper" ? -0.11 - Math.min(speed / 160, 0.04) : 0;
    bodyRoot.rotation.y = speed > 0.35 ? cadence * 0.065 : 0;
    bodyRoot.rotation.z = speed > 0.35 ? balance * 0.028 + turnLean : 0;
    if (player.celebrateTimer > 0) {
      bodyRoot.position.y += Math.max(0, Math.sin(player.celebrateTimer * 14)) * 0.16;
      bodyRoot.rotation.z += Math.sin(player.celebrateTimer * 10) * 0.18;
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

function animateCrowd(active: MatchRuntime, dt: number) {
  const excitement = active.phase === "goal" ? 2.2 : active.ballPos.distanceTo(new THREE.Vector3(0, BALL_RADIUS, attackingGoalZ(active.lastTouchTeam, active.half))) < 26 ? 1.35 : 0.8;
  active.crowdFans.forEach((fan, index) => {
    fan.userData.phase = (fan.userData.phase ?? 0) + dt * (1.4 + (index % 5) * 0.18) * excitement;
    const phase = fan.userData.phase as number;
    fan.position.y = (fan.userData.baseY as number) + Math.max(0, Math.sin(phase)) * 0.18 * excitement;
    const leftArm = fan.getObjectByName("fan-left-arm");
    const rightArm = fan.getObjectByName("fan-right-arm");
    if (leftArm) leftArm.rotation.x = Math.sin(phase) * 0.7 - 0.2;
    if (rightArm) rightArm.rotation.x = Math.cos(phase * 1.08) * 0.7 - 0.2;
  });
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
  filter.frequency.setValueAtTime(170 * variation, start);
  filter.Q.setValueAtTime(1.1, start);
  thump.type = "triangle";
  thump.frequency.setValueAtTime(86 * variation, start);
  thump.frequency.exponentialRampToValueAtTime(52 * variation, start + 0.075);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(clamp(volume, 0.2, 0.8) * 0.18, start + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);
  noise.buffer = buffer;
  noise.connect(filter);
  filter.connect(gain);
  thump.connect(gain);
  gain.connect(audio.destination);
  noise.start(start);
  thump.start(start);
  noise.stop(start + 0.06);
  thump.stop(start + 0.12);
}

function playGoalSound(active: MatchRuntime) {
  const now = performance.now();
  if (now - active.lastCheerSound < 900) return;
  active.lastCheerSound = now;
  playTone(active, 392, 0.18, 0.028, "sine");
  window.setTimeout(() => playTone(active, 523, 0.22, 0.022, "sine"), 90);
}

function playerInput(keys: Set<string>, player: "p1" | "p2", firstPersonMode = false, firstPersonYaw = 0, virtualControls?: VirtualControls): PlayerInputState {
  const dir = new THREE.Vector3();
  if (player === "p1") {
    if (virtualControls && virtualControls.strength > 0.04) {
      const virtualDir = virtualControls.dir.clone();
      if (firstPersonMode) {
        const forward = forwardFromHeading(firstPersonYaw);
        const right = new THREE.Vector3(forward.z, 0, -forward.x);
        virtualDir.copy(right.multiplyScalar(virtualControls.dir.x).add(forward.multiplyScalar(-virtualControls.dir.z)));
      }
      return {
        dir: virtualDir.lengthSq() > 0 ? virtualDir.normalize() : virtualDir,
        sprint: virtualControls.sprint || keys.has("ShiftLeft"),
        speedScale: clamp(0.42 + virtualControls.strength * 0.58, 0.35, 1),
      };
    }
    if (firstPersonMode) {
      const forward = forwardFromHeading(firstPersonYaw);
      if (keys.has("ArrowUp")) dir.add(forward);
      if (keys.has("ArrowDown")) dir.sub(forward);
      return { dir: dir.lengthSq() > 0 ? dir.normalize() : dir, sprint: keys.has("ShiftLeft"), speedScale: 1 };
    }
    if (keys.has("ArrowUp")) dir.z -= 1;
    if (keys.has("ArrowDown")) dir.z += 1;
    if (keys.has("ArrowLeft")) dir.x -= 1;
    if (keys.has("ArrowRight")) dir.x += 1;
    return { dir: dir.lengthSq() > 0 ? dir.normalize() : dir, sprint: keys.has("ShiftLeft"), speedScale: 1 };
  }
  if (keys.has("KeyI")) dir.z += 1;
  if (keys.has("KeyK")) dir.z -= 1;
  if (keys.has("KeyJ")) dir.x -= 1;
  if (keys.has("KeyL")) dir.x += 1;
  return { dir: dir.lengthSq() > 0 ? dir.normalize() : dir, sprint: keys.has("Slash") || keys.has("ControlRight"), speedScale: 1 };
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
    target.lerp(flatBall, influence);
    target.x += weakSide * (player.line === "forward" ? 5.8 : player.line === "midfielder" ? 3.2 : 1.2);
    target.z += attackSign * (player.line === "forward" ? 16 : player.line === "midfielder" ? 8 : 2.6);
    if (owner?.id !== player.id) {
      const passAngle = player.number % 3 - 1;
      const supportDistance = player.line === "forward" ? 15 : player.line === "midfielder" ? 11 : 7;
      target.x = target.x * 0.52 + (ballLane + weakSide * (6.5 + Math.abs(passAngle) * 2.8)) * 0.48;
      target.z = target.z * 0.46 + (active.ballPos.z + attackSign * supportDistance) * 0.54;
      if (player.line === "forward") {
        const runBehind = clamp(active.ballPos.z + attackSign * (17 + (player.number % 3) * 4), -FIELD_L / 2 + 8, FIELD_L / 2 - 8);
        target.z = Math.abs(runBehind - attackingZ) < Math.abs(target.z - attackingZ) ? runBehind : target.z;
        target.x += weakSide * 3.4;
      }
      if (player.line === "midfielder") target.z += attackSign * Math.sin(active.gameClock * 0.08 + player.number) * 4.8;
    }
  } else if (isPressing && (opponentHasBall || distanceToBall < 18)) {
    target.copy(pressingTarget(player, active));
    target.x += Math.sign(player.home.x || player.pos.x || 1) * 1.4;
  } else if (player.line === "defender" && opponentHasBall && Math.abs(active.ballPos.z - ownZ) < 34) {
    const blockPoint = defensiveCoverTarget(player, active);
    target.lerp(blockPoint, formationBallInfluence(player, "defense") + 0.24);
    if (closestOpponent && Math.abs(closestOpponent.pos.z - ownZ) < 38) {
      target.lerp(closestOpponent.pos.clone().add(new THREE.Vector3(Math.sign(player.home.x || 1) * 1.8, 0, -Math.sign(attackingZ) * 1.6)), 0.35);
    }
  } else {
    const phase = opponentHasBall ? "defense" : "neutral";
    const influence = formationBallInfluence(player, phase);
    const coverTarget = opponentHasBall ? defensiveCoverTarget(player, active) : flatBall;
    target.lerp(coverTarget, influence);
    if (!opponentHasBall && !active.ballOwnerId && distanceToBall < (player.line === "forward" ? 20 : 16)) {
      target.lerp(flatBall, 0.34);
    }
    if (opponentHasBall && closestOpponent && player.line !== "forward") {
      target.lerp(closestOpponent.pos.clone().add(new THREE.Vector3(Math.sign(player.home.x || 1) * 2.4, 0, -Math.sign(attackingZ) * 2)), player.line === "midfielder" ? 0.22 : 0.12);
    }
  }
  if (distanceToBall < 10 && !teamHasBall && !player.controlledBy && player.role !== "keeper") {
    target.lerp(flatBall, isPressing ? 0.5 : 0.24);
  }
  addOrganicVariation(player, target, active);
  addFormationMotion(player, target, active, teamHasBall, opponentHasBall, isPressing);
  if (player.fallbackTimer > 0 && player.role !== "keeper" && owner?.id !== player.id) target.lerp(player.fallbackTarget, 0.82);
  keepFormationRoam(player, target, isPressing);
  steerAroundPlayers(player, active.players, target);

  if (owner?.id === player.id) {
    if (active.cooldown > 0.05) {
      const dir = target.sub(player.pos);
      return { dir: dir.lengthSq() > 0.1 ? dir.normalize() : dir.set(0, 0, 0), sprint: false };
    }
    const goalDistance = Math.abs(attackingZ - player.pos.z);
    const pressureCount = opponentPressure(player, active.players, player.role === "keeper" ? 7 : 5.4);
    const pressured = pressureCount > 0;
    if (player.role === "keeper" && player.carryTimer > 0.45 && player.decisionCooldown <= 0) {
      const acted = pressured || player.carryTimer > 1.2 ? clearBall(player, active) : performPass(player, active, "short");
      player.decisionCooldown = acted ? 0.8 : 0.25;
      if (acted) return { dir: new THREE.Vector3(), sprint: false };
    }
    const passStyle = player.role === "keeper"
      ? (pressureCount > 0 ? "long" : "short")
      : pressured ? "short" : player.line === "defender" ? "long" : "through";
    const passTarget = choosePassTarget(player, active, passStyle);
    const openReceiver = passTarget ? nearestOpponentDistance(passTarget, active.players) : 0;
    const usefulPass = Boolean(passTarget && passIsUseful(player, passTarget, active, passStyle));
    const hasControlledTouch = player.carryTimer > (player.role === "keeper" ? 0.85 : pressured ? 0.55 : 0.95);
    const passOpportunity = Boolean(passTarget && usefulPass && hasControlledTouch && (pressured || openReceiver > 5.6 || player.carryTimer > 1.25));
    const blockers = opponentsBetween(player, new THREE.Vector3(0, 0, attackingZ), active.players, 7.5);
    const closeShootingChance = player.role !== "keeper"
      && goalDistance < 34
      && Math.abs(player.pos.x) < GOAL_W * 2.6
      && opponentPressure(player, active.players, 4.8) < 6;
    const shootingLane = player.role !== "keeper"
      && goalDistance < 56
      && Math.abs(player.pos.x) < GOAL_W * 2.35
      && blockers <= (goalDistance < 24 ? 3 : 2)
      && opponentPressure(player, active.players, 4.4) < 5;
    if (player.decisionCooldown <= 0) {
      let acted = false;
      const ownGoalDistance = Math.abs(teamGoalZ(player.team, active.half) - player.pos.z);
      if (player.line === "defender" && pressured && ownGoalDistance < 24) {
        acted = clearBall(player, active);
      }
      if (!acted && passOpportunity && blockers > 3) {
        acted = performPass(player, active, passStyle);
      }
      if (!acted && (shootingLane || closeShootingChance) && player.carryTimer > (goalDistance < 22 ? 0.38 : 0.58)) {
        acted = shoot(player, active, goalDistance < 28 ? "driven" : "shot");
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
  } else if (opponentHasBall && isPressing && distanceToBall < 2.65 && player.decisionCooldown <= 0 && active.gameClock > 100) {
    attemptTackle(player, active);
    player.decisionCooldown = 0.38 + (player.number % 3) * 0.08;
  }

  const dir = target.sub(player.pos);
  return { dir: dir.lengthSq() > 0.06 ? dir.normalize() : activeShapeNudge(player, active), sprint: isPressing || player.supportRunTimer > 0 };
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

function clearBall(player: PlayerBody, active: MatchRuntime) {
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const distance = player.role === "keeper" ? 66 : 42;
  const lateral = player.role === "keeper"
    ? clamp(-player.pos.x * 0.45 + (player.number % 2 === 0 ? 4 : -4), -8, 8)
    : (player.number % 2 === 0 ? 1 : -1) * 12;
  const target = player.pos.clone().add(new THREE.Vector3(lateral, BALL_RADIUS, attackSign * distance));
  return kickTowardPoint(player, target, active, "long");
}

function formationBallInfluence(player: PlayerBody, phase: "attack" | "defense" | "neutral") {
  if (player.line === "defender") return phase === "attack" ? 0.16 : phase === "defense" ? 0.32 : 0.18;
  if (player.line === "midfielder") return phase === "attack" ? 0.36 : phase === "defense" ? 0.46 : 0.3;
  if (player.line === "forward") return phase === "attack" ? 0.52 : phase === "defense" ? 0.28 : 0.38;
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

function activeShapeNudge(player: PlayerBody, active: MatchRuntime) {
  if (player.role === "keeper") return new THREE.Vector3();
  const beat = active.gameClock * 0.08 + player.number * 0.91;
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  return new THREE.Vector3(Math.sin(beat), 0, attackSign * 0.55 + Math.cos(beat) * 0.25).normalize();
}

function pressureFieldPlayers(players: PlayerBody[], team: TeamId, ball: THREE.Vector3, count: number) {
  return players
    .filter((player) => player.team === team && player.role !== "keeper")
    .sort((a, b) => a.pos.distanceTo(ball) - b.pos.distanceTo(ball))
    .slice(0, count)
    .map((player) => player.id);
}

function keepFormationRoam(player: PlayerBody, target: THREE.Vector3, pressing: boolean) {
  if (player.role === "keeper") return;
  const roam = pressing ? 26 : player.line === "defender" ? 13 : player.line === "midfielder" ? 20 : 24;
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

function controlledBallPoint(player: PlayerBody) {
  const forward = facingDirection(player);
  if (forward.lengthSq() < 0.1) forward.set(0, 0, Math.sign(player.team === "home" ? -1 : 1));
  return player.pos.clone()
    .add(forward.multiplyScalar(DRIBBLE_DISTANCE))
    .add(new THREE.Vector3(player.number % 2 === 0 ? 0.08 : -0.08, BALL_RADIUS, 0));
}

function releasePossession(active: MatchRuntime, ballState: BallState) {
  active.ballState = ballState;
  active.ballOwnerId = null;
  active.possession = null;
}

function takePossession(player: PlayerBody, active: MatchRuntime) {
  active.ballState = "possessed";
  active.ballOwnerId = player.id;
  active.possession = player.team;
  active.lastTouchTeam = player.team;
  active.lastTouchPlayerId = player.id;
  active.ballVel.copy(player.vel).multiplyScalar(0.78);
  if (player.role === "keeper") {
    active.restartProtectionTeam = player.team;
    active.restartProtectionTimer = 1.6;
  }
  if (!player.controlledBy && player.role !== "keeper") {
    player.decisionCooldown = Math.max(player.decisionCooldown, 0.34);
    player.carryTimer = Math.max(player.carryTimer, 0.08);
  }
}

function canControlBall(player: PlayerBody, active: MatchRuntime) {
  if (active.ballOwnerId || active.phase !== "open") return false;
  if (player.id === active.ballIgnorePlayerId && active.ballIgnoreTimer > 0) return false;
  if (active.restartProtectionTimer > 0 && active.restartProtectionTeam && player.team !== active.restartProtectionTeam) return false;
  const flatBall = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
  const controlRange = active.ballState === "kicked" ? CONTROL_TOUCH_DISTANCE : CONTROL_TOUCH_DISTANCE + 0.32;
  const speedLimit = active.ballState === "kicked" ? (player.role === "keeper" ? 10.5 : 15.2) : 10.2;
  const playableHeight = player.role === "keeper" ? 2.4 : 1.35;
  return active.ballPos.y <= playableHeight && player.pos.distanceTo(flatBall) <= controlRange && active.ballVel.length() < speedLimit;
}

function kickTowardPoint(player: PlayerBody, target: THREE.Vector3, active: MatchRuntime, style: KickStyle = "shot", intendedReceiver?: PlayerBody) {
  if (active.cooldown > 0.05) return false;
  if (player.actionCooldown > 0 || player.kickTimer > 0.05 || player.tackleTimer > 0 || player.recoveryTimer > 0) return false;
  const flatBall = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
  const ownsBall = active.ballOwnerId === player.id;
  const followUpDriven = style === "driven" && active.lastTouchPlayerId === player.id;
  if (!ownsBall && player.pos.distanceTo(flatBall) > (followUpDriven ? 5.4 : 3.2)) return false;
  const direction = target.clone().setY(BALL_RADIUS).sub(active.ballPos).setY(0);
  if (direction.lengthSq() < 0.5) return false;
  if ((style === "short" || style === "long" || style === "through" || style === "low-through") && intendedReceiver && isOffsidePass(player, active, direction.clone().normalize(), intendedReceiver)) {
    active.offsideFlagTimer = 2.4;
    stopForRestart(active, "offside", opponent(player.team), player.pos.clone().setY(BALL_RADIUS), "OFFSIDE");
    return true;
  }
  const distance = clamp(direction.length(), 8, 70);
  const basePower = clamp(8.6 + distance * 0.24, 11.2, 24.6);
  const power = style === "short"
    ? clamp(7.1 + distance * 0.15, 8.4, 13.8)
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
  if (style === "finesse") direction.x += clamp(-player.pos.x * 0.18, -4.8, 4.8);
  releasePossession(active, "kicked");
  active.ballPos.copy(controlledBallPoint(player));
  active.ballPos.y = BALL_RADIUS;
  active.ballVel.copy(direction.normalize().multiplyScalar(power)).add(player.vel.clone().multiplyScalar(style === "driven" ? 0.06 : 0.12));
  active.ballVel.y = ballLiftForKick(style, distance);
  capBallVelocity(active.ballVel);
  active.cooldown = style === "short" || style === "low-through" ? 0.2 : 0.28;
  active.ballIgnorePlayerId = player.id;
  active.ballIgnoreTimer = style === "shot" || style === "driven" || style === "finesse" || style === "chip" ? 0.18 : 0.16;
  active.lastTouchTeam = player.team;
  active.lastTouchPlayerId = player.id;
  player.kickTimer = style === "long" || style === "chip" ? 0.5 : 0.42;
  player.actionCooldown = style === "short" || style === "low-through" ? ACTION_COOLDOWN : 0.34;
  playKickSound(active, power > 12 ? 0.78 : 0.58);
  return true;
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
  const keeperBias = keeper ? -Math.sign(keeper.pos.x || player.pos.x || 1) : Math.sign(-player.pos.x || 1);
  const cornerAim = clamp(keeperBias * (GOAL_W / 2 - 1.35) - player.pos.x * 0.08, -GOAL_W / 2 + 1.1, GOAL_W / 2 - 1.1);
  return new THREE.Vector3(
    cornerAim,
    BALL_RADIUS,
    goalZ + Math.sign(goalZ) * (GOAL_DEPTH + 1.8),
  );
}

function handleFifaActionKey(player: PlayerBody, code: string, keys: Set<string>, active: MatchRuntime) {
  if (code === "KeyZ" && keys.has("KeyD")) {
    shoot(player, active, "finesse");
    return;
  }
  if (code === "KeyQ" && keys.has("KeyD")) {
    shoot(player, active, "chip");
    return;
  }
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
  if (code !== "KeyD") return;

  const now = performance.now();
  const doubleTap = now - active.lastShotTap <= SHOT_DOUBLE_TAP_MS;
  active.lastShotTap = now;
  if (keys.has("KeyZ")) shoot(player, active, "finesse");
  else if (keys.has("KeyQ")) shoot(player, active, "chip");
  else {
    shoot(player, active, doubleTap ? "driven" : "shot");
  }
}

function performPass(player: PlayerBody, active: MatchRuntime, style: "short" | "long" | "through" | "low-through", oneTwo = false) {
  const teammate = choosePassTarget(player, active, style);
  if (!teammate) return false;
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const lead = style === "through" ? 7.2 : style === "low-through" ? 4.6 : style === "long" ? 2.8 : 0.9;
  const target = teammate.pos.clone()
    .add(teammate.vel.clone().multiplyScalar(style === "long" ? 0.3 : 0.18))
    .add(new THREE.Vector3(0, BALL_RADIUS, attackSign * lead));
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
  return candidates
    .map((teammate) => {
      const distance = teammate.pos.distanceTo(player.pos);
      const forward = (teammate.pos.z - player.pos.z) * attackSign;
      const open = nearestOpponentDistance(teammate, active.players);
      const laneGap = Math.abs(teammate.pos.x - player.pos.x);
      const laneBlockers = opponentsBetween(player, teammate.pos, active.players, style === "short" ? 2.6 : 4.2);
      const targetDistance = style === "short" ? 14 : style === "long" ? 34 : 24;
      const distanceScore = 32 - Math.abs(distance - targetDistance);
      const forwardScore = style === "short" ? clamp(forward, -8, 10) : clamp(forward * 1.05, -12, 24);
      const recycleBonus = player.line === "forward" && forward < 0 ? 4 : 0;
      const laneBonus = style === "long" ? clamp(laneGap * 0.25, 0, 5) : 0;
      return { teammate, score: distanceScore + forwardScore + clamp(open, 0, 12) * 1.55 + recycleBonus + laneBonus - laneBlockers * 7.5 };
    })
    .filter(({ teammate }) => style !== "short" || teammate.pos.distanceTo(player.pos) < 27)
    .filter(({ teammate }) => style === "short" || passIsUseful(player, teammate, active, style))
    .sort((a, b) => b.score - a.score)[0]?.teammate ?? null;
}

function passIsUseful(player: PlayerBody, receiver: PlayerBody, active: MatchRuntime, style: "short" | "long" | "through" | "low-through") {
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  const forward = (receiver.pos.z - player.pos.z) * attackSign;
  const distance = receiver.pos.distanceTo(player.pos);
  const open = nearestOpponentDistance(receiver, active.players);
  if (style === "short") return distance < 27 && open > 2.2;
  if (style === "long") return distance > 12 && distance < 52 && open > 2.8 && forward > -10 && opponentsBetween(player, receiver.pos, active.players, 4.8) < 3;
  if (style === "through" || style === "low-through") return distance > 8 && distance < 42 && open > 2.4 && forward > -4 && opponentsBetween(player, receiver.pos, active.players, 3.8) < 2;
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

function shoot(player: PlayerBody, active: MatchRuntime, style: "shot" | "driven" | "finesse" | "chip") {
  const target = quickKickPoint(player, active);
  if (style === "finesse") target.x = clamp(player.pos.x > 0 ? -GOAL_W / 2 + 2 : GOAL_W / 2 - 2, -GOAL_W / 2 + 1, GOAL_W / 2 - 1);
  if (style === "driven") target.z += Math.sign(target.z) * 1.2;
  return kickTowardPoint(player, target, active, style);
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
  const behind = facingDirection(owner).dot(player.pos.clone().sub(owner.pos).setY(0).normalize()) < -0.38;
  const severe = behind && player.vel.length() > 11.4 && distance > 1.7;
  const ownerGoalZ = attackingGoalZ(owner.team, active.half);
  const inPenaltyArea = Math.abs(owner.pos.z - teamGoalZ(player.team, active.half)) < 16 && Math.abs(owner.pos.x) < 22;
  const lastMan = isLastManFoul(player, owner, active);
  const shouldCallFoul = active.gameClock > 120 && ((behind && Math.random() < 0.38) || severe);
  if (shouldCallFoul) {
    issueCard(active, player, severe && (lastMan || Math.abs(ownerGoalZ - owner.pos.z) < 26) ? "red" : "yellow");
    if (inPenaltyArea) {
      const penaltyZ = teamGoalZ(player.team, active.half) - Math.sign(teamGoalZ(player.team, active.half)) * PENALTY_SPOT_DISTANCE;
      const spot = new THREE.Vector3(0, BALL_RADIUS, penaltyZ);
      const shotDir = new THREE.Vector3(clamp(-owner.pos.x * 0.15, -0.5, 0.5), 0, Math.sign(ownerGoalZ)).normalize();
      active.restartDirection.copy(shotDir);
      stopForRestart(active, "penalty", owner.team, spot, `${owner.team.toUpperCase()} PENALTY`);
    } else {
      stopForRestart(active, "free-kick", owner.team, owner.pos.clone().setY(BALL_RADIUS), `${owner.team.toUpperCase()} FREE KICK`);
    }
    return true;
  }
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

function isLastManFoul(defender: PlayerBody, attacker: PlayerBody, active: MatchRuntime) {
  const attackSign = Math.sign(attackingGoalZ(attacker.team, active.half));
  const defenders = active.players.filter((player) => player.team === defender.team && player.id !== defender.id && !player.sentOff);
  const aheadDefenders = defenders.filter((player) => (player.pos.z - attacker.pos.z) * attackSign > 0 && player.pos.distanceTo(attacker.pos) < 18);
  const goalDistance = Math.abs(attackingGoalZ(attacker.team, active.half) - attacker.pos.z);
  return goalDistance < 34 && aheadDefenders.length <= 1;
}

function issueCard(active: MatchRuntime, player: PlayerBody, card: "yellow" | "red") {
  if (card === "yellow") {
    player.yellowCards += 1;
    if (player.yellowCards >= 2) {
      player.sentOff = true;
      active.cardNotice = `${player.team.toUpperCase()} #${player.number} SECOND YELLOW · RED`;
    } else {
      active.cardNotice = `${player.team.toUpperCase()} #${player.number} YELLOW CARD`;
    }
  } else {
    player.sentOff = true;
    active.cardNotice = `${player.team.toUpperCase()} #${player.number} RED CARD`;
  }
  active.cardTimer = 2.2;
  active.eventText = active.cardNotice;
  active.eventTimer = 1.8;
}

function handleAction(player: PlayerBody | undefined, pressed: boolean, active: MatchRuntime) {
  if (!player || !pressed || active.cooldown > 0.05) return;
  kickTowardPoint(player, quickKickPoint(player, active), active);
}

function isOffsidePass(player: PlayerBody, active: MatchRuntime, passDirection: THREE.Vector3, receiver: PlayerBody) {
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  if (passDirection.z * attackSign <= 0.18) return false;
  if (receiver.team !== player.team || receiver.id === player.id || receiver.role === "keeper") return false;
  const opponentGoal = teamGoalZ(opponent(player.team), active.half);
  const inOpponentHalf = attackSign > 0 ? receiver.pos.z > 0 : receiver.pos.z < 0;
  const aheadOfBall = attackSign > 0 ? receiver.pos.z > active.ballPos.z + 0.8 : receiver.pos.z < active.ballPos.z - 0.8;
  if (!inOpponentHalf || !aheadOfBall) return false;
  const defenders = active.players
    .filter((item) => item.team !== player.team)
    .map((item) => item.pos.z)
    .sort((a, b) => attackSign > 0 ? b - a : a - b);
  const secondLast = defenders[1] ?? defenders[0] ?? opponentGoal;
  return attackSign > 0 ? receiver.pos.z > secondLast + 0.75 : receiver.pos.z < secondLast - 0.75;
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

function Metric({ label, value, color = "text-white" }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="min-w-20 rounded-md border border-white/10 bg-black/40 px-3 py-2 text-center shadow-2xl backdrop-blur">
      <div className="text-[10px] uppercase text-emerald-100/60">{label}</div>
      <div className={`font-mono text-lg font-black ${color}`}>{value}</div>
    </div>
  );
}

function TouchButton({
  label,
  active = false,
  strong = false,
  onPress,
  onDown,
  onUp,
}: {
  label: string;
  active?: boolean;
  strong?: boolean;
  onPress?: () => void;
  onDown?: () => void;
  onUp?: () => void;
}) {
  return (
    <button
      className={`grid h-14 w-14 place-items-center rounded-full border text-[10px] font-black uppercase tracking-normal shadow-2xl backdrop-blur-md active:scale-95 sm:h-16 sm:w-16 sm:text-[11px] ${
        active
          ? "border-cyan-100 bg-cyan-300/35 text-cyan-50"
          : strong
            ? "border-rose-100/35 bg-rose-300/25 text-rose-50"
            : "border-white/15 bg-black/35 text-white"
      }`}
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
        active ? "border-emerald-300 bg-emerald-300/15 shadow-[0_0_20px_rgba(16,185,129,0.18)]" : "border-white/10 bg-white/5 hover:bg-white/10"
      }`}
      onClick={onClick}
    >
      <div className="font-black">{title}</div>
      <div className="mt-1 text-sm text-white/60">{children}</div>
    </button>
  );
}
