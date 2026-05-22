"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import type { User } from "@supabase/supabase-js";
import { LogOut, Play, RotateCcw, Trophy, UserCircle, Users } from "lucide-react";
import { getSupabaseClient, hasSupabaseConfig } from "@/lib/supabase";

type GameMode = "ai" | "local";
type MatchState = "menu" | "playing" | "ended";
type TeamId = "home" | "away";
type PlayerRole = "field" | "keeper";
type PlayerLine = "keeper" | "defender" | "midfielder" | "forward" | "referee";
type PlayPhase = "open" | "halftime" | "kickoff" | "throw-in" | "goal-kick" | "corner" | "free-kick" | "offside";

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
  tackleTimer: number;
  tackleCooldown: number;
  recoveryTimer: number;
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
};

const FIELD_W = 64;
const FIELD_L = 96;
const GOAL_W = 16;
const PLAYER_RADIUS = 1.15;
const BALL_RADIUS = 0.72;
const CLOCK_SPEED = 18;
const HALF_TIME_SECONDS = 45 * 60;
const FULL_TIME_SECONDS = 90 * 60;
const BALL_MAX_SPEED = 20;
const BALL_ROLLING_FRICTION = 0.72;
const BALL_STOP_SPEED = 0.18;
const PERSONAL_SPACE = 1.75;
const DRIBBLE_DISTANCE = 1.3;
const CONTROL_TOUCH_DISTANCE = PLAYER_RADIUS + BALL_RADIUS + 0.45;
const SHOT_DOUBLE_TAP_MS = 260;
const TOUCHLINE_MARGIN = 4.6;
const GOAL_DEPTH = 4.8;

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
  const torso = new THREE.Mesh(
    createTorsoGeometry(),
    shirtMaterial,
  );
  torso.position.y = 1.58;
  torso.castShadow = true;

  const shoulderBand = new THREE.Mesh(
    new THREE.BoxGeometry(1.12, 0.15, 0.52),
    trimMaterial,
  );
  shoulderBand.position.y = 2.08;
  shoulderBand.castShadow = true;

  const shortsMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.68, 0.34, 0.42),
    shortsMaterial,
  );
  shortsMesh.position.y = 0.84;
  shortsMesh.castShadow = true;

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.15, 0.22, 8),
    skinMaterial,
  );
  neck.position.y = 2.24;
  neck.castShadow = true;

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.31, 10, 10),
    skinMaterial,
  );
  head.scale.set(0.9, 1.08, 0.92);
  head.position.y = 2.52;
  head.castShadow = true;

  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: hair, roughness: 0.7 }),
  );
  hairCap.scale.set(0.92, 0.58, 0.95);
  hairCap.position.y = 2.75;
  hairCap.castShadow = true;

  [-1, 1].forEach((side) => {
    const shoulder = new THREE.Group();
    shoulder.name = side < 0 ? "left-arm" : "right-arm";
    shoulder.position.set(side * 0.64, 2.02, 0);
    shoulder.rotation.z = side * 0.08;
    const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.4, 3, 6), shirtMaterial);
    upperArm.position.y = -0.25;
    const elbow = new THREE.Group();
    elbow.name = side < 0 ? "left-elbow" : "right-elbow";
    elbow.position.y = -0.5;
    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.082, 0.34, 3, 6), skinMaterial);
    forearm.position.y = -0.18;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 7), skinMaterial);
    hand.name = side < 0 ? "left-hand" : "right-hand";
    hand.position.y = -0.48;
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
    pivot.position.set(side * 0.22, 0.76, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.42, 3, 6), skinMaterial);
    thigh.position.y = -0.24;
    thigh.castShadow = true;
    const knee = new THREE.Group();
    knee.name = side < 0 ? "left-knee" : "right-knee";
    knee.position.y = -0.48;
    const calf = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.46, 3, 6), sockMaterial);
    calf.position.y = -0.24;
    calf.castShadow = true;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.48), bootMaterial);
    boot.position.set(0, -0.58, 0.15);
    boot.castShadow = true;
    knee.add(calf, boot);
    pivot.add(thigh, knee);
    bodyRoot.add(pivot);
  });

  bodyRoot.add(torso, shoulderBand, shortsMesh, neck, head, hairCap);
  const face = new THREE.Mesh(
    new THREE.SphereGeometry(0.29, 8, 8),
    skinMaterial,
  );
  face.scale.set(0.88, 0.96, 0.22);
  face.position.set(0, 2.51, 0.245);
  face.castShadow = true;
  bodyRoot.add(face);
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
    new THREE.SphereGeometry(BALL_RADIUS, 24, 18),
    new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.34, metalness: 0.02 }),
  );
  white.castShadow = true;
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
    const patch = new THREE.Mesh(new THREE.CircleGeometry(0.18, 5), patchMaterial);
    patch.position.copy(normal.multiplyScalar(BALL_RADIUS + 0.01));
    patch.lookAt(normal.clone().multiplyScalar(2));
    ball.add(patch);
  });
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
    new THREE.MeshStandardMaterial({ color: "#0f5f32", roughness: 0.86 }),
  );
  runoff.position.y = -0.08;
  runoff.receiveShadow = true;
  scene.add(runoff);

  const stripeDepth = FIELD_L / 10;
  for (let stripe = 0; stripe < 10; stripe += 1) {
    const color = stripe % 2 === 0 ? "#24864a" : "#1b743e";
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD_W, stripeDepth + 0.03),
      new THREE.MeshStandardMaterial({ color, roughness: 0.88 }),
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
  const frontZ = side * (FIELD_L / 2 + 1.2);
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
}

function addGoal(scene: THREE.Scene, side: -1 | 1) {
  const goalMat = new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.35 });
  const z = side * (FIELD_L / 2 + 1.2);
  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(GOAL_W, 0.34, 0.34), goalMat);
  crossbar.position.set(0, 3.2, z);
  const postA = new THREE.Mesh(new THREE.BoxGeometry(0.34, 3.2, 0.34), goalMat);
  postA.position.set(-GOAL_W / 2, 1.6, z);
  const postB = postA.clone();
  postB.position.x = GOAL_W / 2;
  scene.add(crossbar, postA, postB);
  addNetLines(scene, side);
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

  const crowdGeometry = new THREE.BoxGeometry(0.55, 0.55, 0.55);
  const crowdMaterial = new THREE.MeshStandardMaterial({ color: "#9ff6d0", roughness: 0.65 });
  const crowd = new THREE.InstancedMesh(crowdGeometry, crowdMaterial, 240);
  const matrix = new THREE.Matrix4();
  let index = 0;
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 60; i += 1) {
      const x = -FIELD_W / 2 - 6 + (i % 30) * ((FIELD_W + 12) / 29);
      const z = side * (FIELD_L / 2 + 9 + Math.floor(i / 30) * 2.2);
      const y = 2.6 + Math.floor(i / 30) * 1.2 + ((i * 7) % 5) * 0.08;
      matrix.makeTranslation(x, y, z);
      crowd.setMatrixAt(index, matrix);
      index += 1;
    }
    for (let i = 0; i < 60; i += 1) {
      const x = side * (FIELD_W / 2 + 8 + Math.floor(i / 30) * 2.1);
      const z = -FIELD_L / 2 - 5 + (i % 30) * ((FIELD_L + 10) / 29);
      const y = 2.6 + Math.floor(i / 30) * 1.2 + ((i * 11) % 5) * 0.08;
      matrix.makeTranslation(x, y, z);
      crowd.setMatrixAt(index, matrix);
      index += 1;
    }
  }
  scene.add(crowd);

  const railA = new THREE.Mesh(new THREE.BoxGeometry(FIELD_W + 18, 0.18, 0.18), railMaterial);
  railA.position.set(0, 3.8, FIELD_L / 2 + 6.2);
  const railB = railA.clone();
  railB.position.z = -FIELD_L / 2 - 6.2;
  const railC = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, FIELD_L + 18), railMaterial);
  railC.position.set(FIELD_W / 2 + 6.2, 3.8, 0);
  const railD = railC.clone();
  railD.position.x = -FIELD_W / 2 - 6.2;
  scene.add(railA, railB, railC, railD);
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
    tackleTimer: 0,
    tackleCooldown: 0,
    recoveryTimer: 0,
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
    tackleTimer: 0,
    tackleCooldown: 0,
    recoveryTimer: 0,
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

  const [mode, setMode] = useState<GameMode>("ai");
  const [matchState, setMatchState] = useState<MatchState>("menu");
  const [score, setScore] = useState({ home: 0, away: 0 });
  const [gameClock, setGameClock] = useState(0);
  const [eventText, setEventText] = useState("Kickoff");
  const [leaderboard, setLeaderboard] = useState<ScoreRow[]>([]);
  const [nickname, setNickname] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [authStatus, setAuthStatus] = useState("");

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
      player.tackleTimer = 0;
      player.tackleCooldown = 0;
      player.recoveryTimer = 0;
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
    active.pendingKickTarget = null;
    active.lastShotTap = 0;
    active.tackleLockTimer = 0;
    active.lastTouchTeam = servingTeam;
    active.lastTouchPlayerId = null;
  }, []);

  const startMatch = useCallback((nextMode = mode) => {
    const active = sceneRef.current;
    if (!active) return;
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
  }, [mode, resetPositions]);

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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
    addStadium(scene);

    addGoal(scene, -1);
    addGoal(scene, 1);

    const ball = createSoccerBall();
    scene.add(ball);

    const players = formationPlayers("ai", 1);
    players.forEach((player) => scene.add(player.mesh));
    const referee = createReferee();
    scene.add(referee.mesh);

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
        updateMatch(active, keysRef.current, dt);
        setScore({ ...active.score });
        setGameClock(active.gameClock);
        setEventText(active.eventText);
        if (active.gameClock >= FULL_TIME_SECONDS) {
          active.state = "ended";
          setMatchState("ended");
        }
      } else {
        active.ball.rotation.y += dt * 0.35;
      }

      const focus = active.mode === "local"
        ? active.ballPos
        : active.players.find((player) => player.controlledBy === "p1")?.pos ?? active.ballPos;
      active.camera.position.x += (focus.x * 0.35 - active.camera.position.x) * 0.06;
      active.camera.position.z += (focus.z + 43 - active.camera.position.z) * 0.06;
      active.camera.lookAt(focus.x, 0, focus.z - 6);
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
            <h1 className="text-2xl font-black tracking-normal sm:text-4xl">Arcade Soccer 3D</h1>
            <p className="mt-1 text-sm text-emerald-100/70">11v11 arcade soccer · one active player · AI teammates</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Metric label="Home" value={score.home} color="text-cyan-200" />
            <Metric label="Match" value={formatSoccerClock(gameClock)} />
            <Metric label="Away" value={score.away} color="text-rose-200" />
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
      {matchState === "playing" && (
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
      {matchState === "playing" && eventText !== "PLAY" && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
          <div className="rounded-md border border-white/15 bg-black/55 px-6 py-3 text-2xl font-black tracking-normal text-white shadow-2xl backdrop-blur">
            {eventText}
          </div>
        </div>
      )}

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

function updateMatch(active: MatchRuntime, keys: Set<string>, dt: number) {
  const ball = active.ballPos;
  const ballVel = active.ballVel;
  const p1 = active.players.find((player) => player.controlledBy === "p1");
  const p2 = active.players.find((player) => player.controlledBy === "p2");
  active.ballIgnoreTimer = Math.max(0, active.ballIgnoreTimer - dt);
  active.tackleLockTimer = Math.max(0, active.tackleLockTimer - dt);
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
    const actorNeedsSpot = active.phase === "throw-in" || active.phase === "kickoff";
    const actorReady = !actorNeedsSpot || Boolean(actor && actor.pos.distanceTo(active.restartSpot) < 1.95);
    if (actorReady) active.phaseTimer = Math.max(0, active.phaseTimer - dt);
    if (active.phaseTimer <= 0) resumeRestart(active);
  }

  active.players.forEach((player) => {
    const input = active.phase === "open"
      ? player.controlledBy === "p1"
        ? playerInput(keys, "p1")
        : player.controlledBy === "p2"
          ? playerInput(keys, "p2")
          : aiInput(player, active)
      : restartShapeInput(player, active);
    if (player.supportRunTimer > 0 && active.ballOwnerId !== player.id) {
      const supportDir = player.supportRunTarget.clone().sub(player.pos);
      if (supportDir.lengthSq() > 1) input.dir.lerp(supportDir.normalize(), 0.82).normalize();
    }
    const sprint = (input.sprint || player.supportRunTimer > 0) && player.stamina > 0.12;
    const maxSpeed = (player.role === "keeper" ? 5.2 : 11.2) * (sprint ? 1.25 : 1);
    player.stamina = clamp(player.stamina + (sprint ? -0.42 : 0.24) * dt, 0, 1);
    player.kickTimer = Math.max(0, player.kickTimer - dt);
    player.tackleTimer = Math.max(0, player.tackleTimer - dt);
    player.tackleCooldown = Math.max(0, player.tackleCooldown - dt);
    player.recoveryTimer = Math.max(0, player.recoveryTimer - dt);
    player.decisionCooldown = Math.max(0, player.decisionCooldown - dt);
    player.fallbackTimer = Math.max(0, player.fallbackTimer - dt);
    player.carryTimer = active.ballOwnerId === player.id ? player.carryTimer + dt : 0;
    player.supportRunTimer = Math.max(0, player.supportRunTimer - dt);
    const recoveryScale = player.recoveryTimer > 0 ? 0.48 : 1;
    movePlayer(player, input.dir, maxSpeed * recoveryScale, dt, active);
    clampPlayer(player);
    player.mesh.position.copy(player.pos);
    animatePlayer(player, dt);
    updateStuckState(player, input.dir, active, dt);
  });
  separatePlayers(active.players);
  updateReferee(active, dt);

  if (active.phase === "open") {
    handleAction(p2, keys.has("Enter") || keys.has("ShiftRight"), active);
    if (keys.has("KeyF") && p1) attemptTackle(p1, active);
    if ((keys.has("Period") || keys.has("Numpad0")) && p2) attemptTackle(p2, active);
  }

  if (active.phase !== "open") {
    const actor = active.restartActorId ? active.players.find((player) => player.id === active.restartActorId) : null;
    if (active.phase === "throw-in" && actor) {
      const hands = throwInHandPoint(actor, active.restartDirection);
      ball.copy(hands);
      setPlayerHeading(actor, Math.atan2(active.restartDirection.x, active.restartDirection.z), dt, 7.5);
      poseThrower(actor, actor.pos.distanceTo(active.restartSpot) < 1.8);
    } else {
      ball.copy(active.restartSpot);
    }
    ballVel.set(0, 0, 0);
  }

  const dribbler = ballOwner(active);
  if (active.phase === "open" && dribbler) {
    const dribblePoint = controlledBallPoint(dribbler);
    ball.lerp(dribblePoint, 1 - Math.pow(0.00002, dt));
    ball.y = BALL_RADIUS;
    ballVel.copy(dribbler.vel).multiplyScalar(0.92);
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
  if (!active.ballOwnerId) ball.addScaledVector(ballVel, dt);
  const crossedSideline = Math.abs(ball.x) > FIELD_W / 2;
  ballVel.multiplyScalar(Math.pow(BALL_ROLLING_FRICTION, dt));
  if (ballVel.length() < BALL_STOP_SPEED) {
    ballVel.set(0, 0, 0);
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

  if (Math.abs(ball.z) > FIELD_L / 2 && Math.abs(ball.x) < GOAL_W / 2 && active.cooldown <= 0) {
    const goalOwner: TeamId = ball.z > 0 === teamGoalZ("home", active.half) > 0 ? "home" : "away";
    const scoredBy = opponent(goalOwner);
    active.score[scoredBy] += 1;
    playGoalSound(active);
    stopForRestart(active, "kickoff", goalOwner, new THREE.Vector3(0, BALL_RADIUS, 0), `${scoredBy.toUpperCase()} GOAL`);
  } else if (Math.abs(ball.z) > FIELD_L / 2) {
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

function capBallVelocity(ballVel: THREE.Vector3) {
  const speed = ballVel.length();
  if (speed > BALL_MAX_SPEED) ballVel.multiplyScalar(BALL_MAX_SPEED / speed);
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

function stopForRestart(active: MatchRuntime, phase: PlayPhase, team: TeamId, spot: THREE.Vector3, label: string) {
  active.phase = phase;
  active.phaseTimer = phase === "kickoff" ? 1.8 : 1.25;
  active.restartTeam = team;
  active.restartSpot.copy(spot);
  if (phase === "kickoff") {
    resetKickoffShape(active);
    active.restartActorId = kickoffTaker(active.players, team, spot)?.id ?? null;
    active.restartDirection.set(0, 0, Math.sign(attackingGoalZ(team, active.half)));
    stageKickoffShape(active);
  } else if (phase === "throw-in") {
    active.restartDirection.set(spot.x > 0 ? -1 : 1, 0, Math.sign(attackingGoalZ(team, active.half)) * 0.35).normalize();
    active.restartActorId = nearestTeamPlayer(active.players, team, spot)?.id ?? null;
  } else {
    active.restartDirection.set(0, 0, Math.sign(attackingGoalZ(team, active.half)));
    active.restartActorId = phase === "corner" || phase === "free-kick" || phase === "goal-kick"
      ? nearestTeamPlayer(active.players, team, spot)?.id ?? null
      : null;
  }
  active.eventText = label;
  active.eventTimer = 0;
  active.ballPos.copy(active.restartSpot);
  active.ballVel.set(0, 0, 0);
  releasePossession(active, "loose");
  active.cooldown = Math.max(active.cooldown, 0.45);
}

function resumeRestart(active: MatchRuntime) {
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
  const power = restartingPhase === "corner" ? 7 : restartingPhase === "goal-kick" ? 9 : restartingPhase === "throw-in" ? 5.5 : 4.2;
  const kickoffActor = restartingPhase === "kickoff" ? kickoffTaker(active.players, active.restartTeam, active.restartSpot) : null;
  const actor = active.restartActorId ? active.players.find((player) => player.id === active.restartActorId) : kickoffActor;
  const releasePoint = active.phase === "throw-in" && actor
    ? actor.pos.clone().add(active.restartDirection.clone().multiplyScalar(PLAYER_RADIUS + BALL_RADIUS + 0.72)).setY(BALL_RADIUS)
    : active.restartSpot;
  active.ballPos.copy(releasePoint);
  active.ballVel.copy(active.restartDirection).multiplyScalar(power);
  active.lastTouchTeam = active.restartTeam;
  active.lastTouchPlayerId = active.restartActorId;
  active.restartActorId = null;
  active.ballState = "kicked";
  active.ballOwnerId = null;
  active.ballIgnorePlayerId = actor?.id ?? null;
  active.ballIgnoreTimer = restartingPhase === "throw-in" ? 0.42 : 0.24;
  active.phase = "open";
  active.phaseTimer = 0;
  active.eventText = showSecondHalfBanner ? "SECOND HALF" : "PLAY";
  active.eventTimer = showSecondHalfBanner ? 1.4 : 0;
  active.cooldown = 0.35;
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
    target.z = clamp(target.z, -FIELD_L / 2 + 2, FIELD_L / 2 - 2);
    if (active.phase === "throw-in") target.x += active.restartSpot.x > 0 ? 0.7 : -0.7;
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

function separatePlayers(players: PlayerBody[]) {
  for (let i = 0; i < players.length; i += 1) {
    for (let j = i + 1; j < players.length; j += 1) {
      const a = players[i];
      const b = players[j];
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
    desiredHeading = teamGoalZ(player.team, active.half) > 0 ? Math.PI : 0;
  } else if (hasIntent) {
    desiredHeading = Math.atan2(dir.x, dir.z);
  }
  const turnSpeed = player.line === "referee" ? 4.7 : player.role === "keeper" ? 3.4 : player.controlledBy ? 5.1 : 4.35;
  const turnGap = Math.abs(setPlayerHeading(player, desiredHeading, dt, turnSpeed));
  const acceleration = player.line === "referee" ? 15 : player.role === "keeper" ? 12 : player.controlledBy ? 21 : 17;
  const braking = player.role === "keeper" ? 18 : 24;
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
  if (!hasIntent) player.vel.multiplyScalar(Math.pow(0.025, dt));
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
  player.runPhase += speed * dt * (player.role === "keeper" ? 2.2 : 3.9);
  const strideScale = player.role === "keeper" ? 0.18 : 0.44;
  const stride = speed > 0.35 ? Math.sin(player.runPhase) * strideScale : 0;
  const lift = speed > 0.35 ? Math.max(0, Math.sin(player.runPhase)) * 0.26 : 0;
  const otherLift = speed > 0.35 ? Math.max(0, -Math.sin(player.runPhase)) * 0.26 : 0;
  const armSwing = -stride * 0.88;
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
    bodyRoot.rotation.x = speed > 0.35 && player.role !== "keeper" ? -0.11 - Math.min(speed / 160, 0.04) : 0;
    bodyRoot.rotation.y = speed > 0.35 ? cadence * 0.065 : 0;
    bodyRoot.rotation.z = speed > 0.35 ? balance * 0.028 + turnLean : 0;
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
  if (leftElbow) leftElbow.rotation.x = Math.max(0.08, -armSwing * 0.4);
  if (rightElbow) rightElbow.rotation.x = Math.max(0.08, armSwing * 0.4);

  if (player.kickTimer > 0) {
    const progress = 1 - player.kickTimer / 0.34;
    const kickArc = progress < 0.42 ? -progress * 1.35 : Math.sin((progress - 0.42) / 0.58 * Math.PI) * 1.05;
    if (rightLeg) rightLeg.rotation.x = kickArc;
    if (rightKnee) rightKnee.rotation.x = Math.max(0.08, -kickArc * 0.45);
    if (bodyRoot) bodyRoot.rotation.z += 0.06;
  }
  if (player.tackleTimer > 0) {
    const lunge = Math.sin((1 - player.tackleTimer / 0.42) * Math.PI);
    if (bodyRoot) bodyRoot.rotation.x = -0.2 * lunge;
    if (rightLeg) rightLeg.rotation.x = 0.82 * lunge;
    if (rightKnee) rightKnee.rotation.x = 0.12;
    if (leftArm) leftArm.rotation.x = -0.4 * lunge;
    if (rightArm) rightArm.rotation.x = 0.4 * lunge;
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

function playerInput(keys: Set<string>, player: "p1" | "p2") {
  const dir = new THREE.Vector3();
  if (player === "p1") {
    if (keys.has("ArrowUp")) dir.z -= 1;
    if (keys.has("ArrowDown")) dir.z += 1;
    if (keys.has("ArrowLeft")) dir.x -= 1;
    if (keys.has("ArrowRight")) dir.x += 1;
    return { dir: dir.lengthSq() > 0 ? dir.normalize() : dir, sprint: keys.has("ShiftLeft") };
  }
  if (keys.has("KeyI")) dir.z += 1;
  if (keys.has("KeyK")) dir.z -= 1;
  if (keys.has("KeyJ")) dir.x -= 1;
  if (keys.has("KeyL")) dir.x += 1;
  return { dir: dir.lengthSq() > 0 ? dir.normalize() : dir, sprint: keys.has("Slash") || keys.has("ControlRight") };
}

function aiInput(player: PlayerBody, active: MatchRuntime) {
  const attackingZ = attackingGoalZ(player.team, active.half);
  const ownZ = teamGoalZ(player.team, active.half);
  const target = player.home.clone();
  const owner = ballOwner(active);
  const teamHasBall = owner?.team === player.team;
  const opponentHasBall = owner?.team === opponent(player.team);
  const distanceToBall = active.ballPos.distanceTo(player.pos);
  const pressureIds = pressureFieldPlayers(active.players, player.team, active.ballPos, opponentHasBall ? 2 : 1);
  const isPressing = pressureIds.includes(player.id);

  if (player.role === "keeper") {
    target.set(clamp(active.ballPos.x * 0.45, -GOAL_W / 2 + 1, GOAL_W / 2 - 1), 0, ownZ - Math.sign(ownZ) * 3);
    if (Math.sign(active.ballVel.z) === Math.sign(ownZ - active.ballPos.z) && Math.abs(active.ballPos.z - ownZ) < 18) {
      target.x = clamp(active.ballPos.x, -GOAL_W / 2 + 0.8, GOAL_W / 2 - 0.8);
    }
  } else if (teamHasBall) {
    target.x = player.home.x * 0.72 + active.ballPos.x * 0.18;
    target.z = player.home.z + Math.sign(attackingZ) * (player.line === "forward" ? 7 : player.line === "midfielder" ? 4 : 1.8);
    if (owner?.id !== player.id) {
      const laneSeparation = Math.sign(player.home.x || (player.number % 2 === 0 ? 1 : -1)) * (player.line === "forward" ? 4.5 : 2.5);
      target.x += laneSeparation;
    }
  } else if (isPressing && (opponentHasBall || distanceToBall < 18)) {
    target.copy(active.ballPos);
    target.z -= Math.sign(attackingZ) * 2.2;
  } else if (player.line === "defender" && opponentHasBall && Math.abs(active.ballPos.z - ownZ) < 34) {
    target.x = clamp(active.ballPos.x + player.home.x * 0.15, -FIELD_W / 2 + 4, FIELD_W / 2 - 4);
    target.z = player.home.z;
  } else {
    target.x += active.ballPos.x * (player.line === "midfielder" ? 0.14 : 0.08);
    target.z += clamp(active.ballPos.z - player.home.z, -10, 10) * (player.line === "midfielder" ? 0.22 : 0.12);
  }
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
    const pressureCount = opponentPressure(player, active.players, 5.4);
    const pressured = pressureCount > 0;
    const passStyle = pressured ? "short" : player.line === "defender" ? "long" : "through";
    const passTarget = choosePassTarget(player, active, passStyle);
    const openReceiver = passTarget ? nearestOpponentDistance(passTarget, active.players) : 0;
    const passOpportunity = Boolean(passTarget && (pressured || openReceiver > 5.4 || player.carryTimer > 1.05));
    const shootingLane = goalDistance < 24 && Math.abs(player.pos.x) < GOAL_W * 1.4 && opponentPressure(player, active.players, 3.8) < 2;
    if (player.decisionCooldown <= 0) {
      let acted = false;
      if (passOpportunity) {
        acted = performPass(player, active, passStyle);
      }
      if (!acted && shootingLane) {
        acted = shoot(player, active, goalDistance < 14 ? "driven" : "shot");
      }
      if (!acted && passTarget && player.carryTimer > 1.7) {
        acted = performPass(player, active, player.line === "forward" ? "short" : "through");
      }
      player.decisionCooldown = acted ? 0.54 + (player.number % 4) * 0.06 : 0.22;
    }
  } else if (opponentHasBall && isPressing && distanceToBall < 2.65 && player.decisionCooldown <= 0) {
    attemptTackle(player, active);
    player.decisionCooldown = 0.38 + (player.number % 3) * 0.08;
  }

  const dir = target.sub(player.pos);
  return { dir: dir.lengthSq() > 0.06 ? dir.normalize() : activeShapeNudge(player, active), sprint: isPressing || player.supportRunTimer > 0 };
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
  const roam = pressing ? 23 : player.line === "defender" ? 10 : player.line === "midfielder" ? 15 : 17;
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
    .add(new THREE.Vector3(player.number % 2 === 0 ? 0.2 : -0.2, BALL_RADIUS, 0));
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
}

function canControlBall(player: PlayerBody, active: MatchRuntime) {
  if (active.ballOwnerId || active.phase !== "open") return false;
  if (player.id === active.ballIgnorePlayerId && active.ballIgnoreTimer > 0) return false;
  const flatBall = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
  const controlRange = active.ballState === "kicked" ? CONTROL_TOUCH_DISTANCE : CONTROL_TOUCH_DISTANCE + 0.32;
  return player.pos.distanceTo(flatBall) <= controlRange && active.ballVel.length() < (active.ballState === "kicked" ? 13.5 : 8.5);
}

function kickTowardPoint(player: PlayerBody, target: THREE.Vector3, active: MatchRuntime, style: KickStyle = "shot") {
  if (active.cooldown > 0.05) return false;
  const flatBall = new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z);
  const ownsBall = active.ballOwnerId === player.id;
  const followUpDriven = style === "driven" && active.lastTouchPlayerId === player.id;
  if (!ownsBall && player.pos.distanceTo(flatBall) > (followUpDriven ? 5.4 : 3.2)) return false;
  const direction = target.clone().setY(BALL_RADIUS).sub(active.ballPos).setY(0);
  if (direction.lengthSq() < 0.5) return false;
  if (isOffsidePass(player, active, direction.clone().normalize())) {
    stopForRestart(active, "offside", opponent(player.team), player.pos.clone().setY(BALL_RADIUS), "OFFSIDE");
    return true;
  }
  const distance = clamp(direction.length(), 8, 70);
  const basePower = clamp(5.5 + distance * 0.16, 7.2, 15.6);
  const power = style === "short"
    ? clamp(5 + distance * 0.12, 6.6, 10.4)
    : style === "low-through"
      ? clamp(6.2 + distance * 0.13, 8, 12.2)
      : style === "through"
        ? clamp(6.8 + distance * 0.15, 8.8, 13.8)
        : style === "long" || style === "chip"
          ? clamp(7.5 + distance * 0.18, 10.2, 16.4)
          : style === "driven"
            ? clamp(basePower * 1.08, 10.8, 17.2)
            : style === "finesse"
              ? clamp(basePower * 0.92, 9.2, 14.4)
              : basePower;
  if (style === "finesse") direction.x += clamp(-player.pos.x * 0.18, -4.8, 4.8);
  releasePossession(active, "kicked");
  active.ballPos.copy(controlledBallPoint(player));
  active.ballPos.y = BALL_RADIUS;
  active.ballVel.copy(direction.normalize().multiplyScalar(power)).add(player.vel.clone().multiplyScalar(style === "driven" ? 0.08 : 0.18));
  capBallVelocity(active.ballVel);
  active.cooldown = style === "short" || style === "low-through" ? 0.18 : 0.24;
  active.ballIgnorePlayerId = player.id;
  active.ballIgnoreTimer = 0.22;
  active.lastTouchTeam = player.team;
  active.lastTouchPlayerId = player.id;
  player.kickTimer = style === "long" || style === "chip" ? 0.42 : 0.34;
  playKickSound(active, power > 12 ? 0.78 : 0.58);
  return true;
}

function quickKickPoint(player: PlayerBody, active: MatchRuntime) {
  const goalZ = attackingGoalZ(player.team, active.half);
  return new THREE.Vector3(clamp(-player.pos.x * 0.18, -GOAL_W / 2 + 1.4, GOAL_W / 2 - 1.4), BALL_RADIUS, goalZ);
}

function handleFifaActionKey(player: PlayerBody, code: string, keys: Set<string>, active: MatchRuntime) {
  if (code === "KeyZ" && keys.has("KeyD")) {
    active.cooldown = 0;
    shoot(player, active, "finesse");
    return;
  }
  if (code === "KeyQ" && keys.has("KeyD")) {
    active.cooldown = 0;
    shoot(player, active, "chip");
    return;
  }
  if (code === "KeyC" && keys.has("KeyS")) {
    active.cooldown = 0;
    performPass(player, active, "short", true);
    return;
  }
  if (code === "KeyQ" && keys.has("KeyS")) {
    active.cooldown = 0;
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
    if (doubleTap) active.cooldown = 0;
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
  const passed = kickTowardPoint(player, target, active, style);
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
      const targetDistance = style === "short" ? 14 : style === "long" ? 34 : 24;
      const distanceScore = 32 - Math.abs(distance - targetDistance);
      const forwardScore = style === "short" ? clamp(forward, -6, 10) : clamp(forward * 1.2, -8, 26);
      return { teammate, score: distanceScore + forwardScore + clamp(open, 0, 12) * 1.4 };
    })
    .filter(({ teammate }) => style !== "short" || teammate.pos.distanceTo(player.pos) < 28)
    .sort((a, b) => b.score - a.score)[0]?.teammate ?? null;
}

function nearestOpponentDistance(player: PlayerBody, players: PlayerBody[]) {
  return players
    .filter((item) => item.team !== player.team)
    .reduce((distance, item) => Math.min(distance, item.pos.distanceTo(player.pos)), Infinity);
}

function opponentPressure(player: PlayerBody, players: PlayerBody[], radius: number) {
  return players.filter((item) => item.team !== player.team && item.pos.distanceTo(player.pos) < radius).length;
}

function shoot(player: PlayerBody, active: MatchRuntime, style: "shot" | "driven" | "finesse" | "chip") {
  const target = quickKickPoint(player, active);
  if (style === "finesse") target.x = clamp(player.pos.x > 0 ? -GOAL_W / 2 + 2 : GOAL_W / 2 - 2, -GOAL_W / 2 + 1, GOAL_W / 2 - 1);
  if (style === "driven") target.z -= Math.sign(target.z) * 1.8;
  return kickTowardPoint(player, target, active, style);
}

function attemptTackle(player: PlayerBody, active: MatchRuntime) {
  if (player.tackleCooldown > 0 || player.recoveryTimer > 0 || active.tackleLockTimer > 0 || active.phase !== "open") return false;
  const owner = ballOwner(active);
  if (!owner || owner.team === player.team || owner.recoveryTimer > 0) return false;
  const towardOwner = owner.pos.clone().sub(player.pos).setY(0);
  const distance = towardOwner.length();
  const facing = facingDirection(player);
  if (distance > 2.75 || (distance > 0.05 && facing.dot(towardOwner.normalize()) < 0.1)) return false;
  player.tackleCooldown = player.controlledBy ? 0.8 : 1.15;
  player.tackleTimer = 0.42;
  player.recoveryTimer = 0.28;
  const behind = facingDirection(owner).dot(player.pos.clone().sub(owner.pos).setY(0).normalize()) < -0.38;
  if (behind && Math.random() < 0.48) {
    stopForRestart(active, "free-kick", owner.team, owner.pos.clone().setY(BALL_RADIUS), `${owner.team.toUpperCase()} FREE KICK`);
    return true;
  }
  takePossession(player, active);
  active.ballPos.copy(controlledBallPoint(player));
  active.ballIgnorePlayerId = owner.id;
  active.ballIgnoreTimer = 0.42;
  active.tackleLockTimer = 0.56;
  owner.tackleCooldown = Math.max(owner.tackleCooldown, 0.95);
  owner.recoveryTimer = Math.max(owner.recoveryTimer, 0.48);
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
  kickTowardPoint(player, quickKickPoint(player, active), active);
}

function isOffsidePass(player: PlayerBody, active: MatchRuntime, passDirection: THREE.Vector3) {
  const attackSign = Math.sign(attackingGoalZ(player.team, active.half));
  if (Math.sign(passDirection.z) !== attackSign) return false;
  const attackers = active.players.filter((item) => item.team === player.team && item.id !== player.id && item.line === "forward");
  const defenders = active.players
    .filter((item) => item.team !== player.team)
    .map((item) => item.pos.z)
    .sort((a, b) => attackSign > 0 ? b - a : a - b);
  const secondLast = defenders[1] ?? defenders[0] ?? teamGoalZ(opponent(player.team), active.half);
  return attackers.some((attacker) => {
    const aheadOfBall = attackSign > 0 ? attacker.pos.z > active.ballPos.z + 2 : attacker.pos.z < active.ballPos.z - 2;
    const beyondLine = attackSign > 0 ? attacker.pos.z > secondLast + 1 : attacker.pos.z < secondLast - 1;
    const closeToLane = Math.abs(attacker.pos.x - player.pos.x) < 22;
    return aheadOfBall && beyondLine && closeToLane;
  });
}

function clampPlayer(player: PlayerBody) {
  const margin = player.role === "keeper" ? 2 : 1.6;
  player.pos.x = clamp(player.pos.x, -FIELD_W / 2 + margin, FIELD_W / 2 - margin);
  if (player.role === "keeper") {
    const goalZ = player.home.z;
    player.pos.z = clamp(player.pos.z, goalZ - 3, goalZ + 3);
  } else {
    player.pos.z = clamp(player.pos.z, -FIELD_L / 2 + margin, FIELD_L / 2 - margin);
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
