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
  stamina: number;
  runPhase: number;
  controlledBy?: "p1" | "p2";
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
  referee: PlayerBody;
  ballPos: THREE.Vector3;
  ballVel: THREE.Vector3;
  score: { home: number; away: number };
  cooldown: number;
  possession: TeamId | null;
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
const TOUCHLINE_MARGIN = 4.6;
const GOAL_DEPTH = 4.8;

const HOME_COLOR = "#38bdf8";
const AWAY_COLOR = "#fb7185";
const HOME_KEEPER_COLOR = "#facc15";
const AWAY_KEEPER_COLOR = "#a78bfa";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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
    -0.5, 0.55, -0.24, 0.5, 0.55, -0.24, 0.5, 0.55, 0.24, -0.5, 0.55, 0.24,
    -0.31, -0.55, -0.2, 0.31, -0.55, -0.2, 0.31, -0.55, 0.2, -0.31, -0.55, 0.2,
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
  torso.position.y = 1.52;
  torso.castShadow = true;

  const shoulderBand = new THREE.Mesh(
    new THREE.BoxGeometry(1.04, 0.16, 0.5),
    trimMaterial,
  );
  shoulderBand.position.y = 1.98;
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
  neck.position.y = 2.14;
  neck.castShadow = true;

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 10, 10),
    skinMaterial,
  );
  head.scale.set(0.9, 1.08, 0.92);
  head.position.y = 2.44;
  head.castShadow = true;

  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: hair, roughness: 0.7 }),
  );
  hairCap.scale.set(0.92, 0.62, 0.95);
  hairCap.position.y = 2.69;
  hairCap.castShadow = true;

  [-1, 1].forEach((side) => {
    const shoulder = new THREE.Group();
    shoulder.name = side < 0 ? "left-arm" : "right-arm";
    shoulder.position.set(side * 0.58, 1.92, 0);
    shoulder.rotation.z = side * 0.08;
    const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.105, 0.34, 3, 6), shirtMaterial);
    upperArm.position.y = -0.22;
    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.3, 3, 6), skinMaterial);
    forearm.position.y = -0.58;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 7), skinMaterial);
    hand.name = side < 0 ? "left-hand" : "right-hand";
    hand.position.y = -0.86;
    upperArm.castShadow = true;
    forearm.castShadow = true;
    hand.castShadow = true;
    shoulder.add(upperArm, forearm, hand);
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
    const calf = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.46, 3, 6), sockMaterial);
    calf.position.y = -0.72;
    calf.castShadow = true;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.48), bootMaterial);
    boot.position.set(0, -1.04, 0.15);
    boot.castShadow = true;
    pivot.add(thigh, calf, boot);
    bodyRoot.add(pivot);
  });

  bodyRoot.add(torso, shoulderBand, shortsMesh, neck, head, hairCap);
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
    stamina: 1,
    runPhase: 0,
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
    stamina: 1,
    runPhase: 0,
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

  const resetPositions = useCallback((servingTeam: TeamId = "home") => {
    const active = sceneRef.current;
    if (!active) return;
    active.players.forEach((player) => {
      player.pos.copy(player.home);
      player.vel.set(0, 0, 0);
      player.mesh.position.copy(player.pos);
      player.runPhase = 0;
      animatePlayer(player, 0);
    });
    active.ballPos.set(0, BALL_RADIUS, 0);
    active.ballVel.set(0, 0, Math.sign(attackingGoalZ(servingTeam, active.half)) * 3.6);
    active.cooldown = 1.2;
    active.possession = null;
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
      referee,
      ballPos: new THREE.Vector3(0, BALL_RADIUS, 0),
      ballVel: new THREE.Vector3(),
      score: { home: 0, away: 0 },
      cooldown: 0,
      possession: null,
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
      mount.removeChild(active.renderer.domElement);
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      keysRef.current.add(event.code);
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(event.code)) event.preventDefault();
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
            P1 WASD · Space action · Shift sprint · P2 arrows · Enter action
          </div>
        )}
      </section>
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
                P1 controls cyan. P2 controls rose. AI fills the rest.
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
  const possession: PlayerBody | null = nearestPlayer(active.players, ball);
  active.possession = possession && possession.pos.distanceTo(ball) < 2.3 ? possession.team : null;

  if (active.phase === "open") {
    active.gameClock = Math.min(FULL_TIME_SECONDS, active.gameClock + dt * CLOCK_SPEED);
    if (!active.halftimeDone && active.gameClock >= HALF_TIME_SECONDS) {
      beginHalftime(active);
      return;
    }
  } else {
    const actor = active.restartActorId ? active.players.find((player) => player.id === active.restartActorId) : null;
    const actorReady = active.phase !== "throw-in" || Boolean(actor && actor.pos.distanceTo(active.restartSpot) < 1.95);
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
    const sprint = input.sprint && player.stamina > 0.12;
    const maxSpeed = (player.role === "keeper" ? 5.2 : 11.2) * (sprint ? 1.25 : 1);
    player.stamina = clamp(player.stamina + (sprint ? -0.42 : 0.24) * dt, 0, 1);
    const targetVel = input.dir.multiplyScalar(maxSpeed);
    player.vel.lerp(targetVel, 1 - Math.pow(0.001, dt));
    player.pos.addScaledVector(player.vel, dt);
    clampPlayer(player);
    player.mesh.position.copy(player.pos);
    animatePlayer(player, dt);
    facePlayer(player, active);
  });
  separatePlayers(active.players);
  updateReferee(active, dt);

  if (active.phase === "open") {
    handleAction(p1, keys.has("Space"), active);
    handleAction(p2, keys.has("Enter") || keys.has("ShiftRight"), active);
  }

  if (active.phase !== "open") {
    const actor = active.restartActorId ? active.players.find((player) => player.id === active.restartActorId) : null;
    if (active.phase === "throw-in" && actor) {
      ball.set(actor.pos.x, 2.6, actor.pos.z);
      poseThrower(actor, actor.pos.distanceTo(active.restartSpot) < 1.8);
    } else {
      ball.copy(active.restartSpot);
    }
    ballVel.set(0, 0, 0);
  }

  active.players.forEach((player) => {
    const flatBall = new THREE.Vector3(ball.x, 0, ball.z);
    const delta = flatBall.sub(player.pos);
    const distance = delta.length();
    const minDistance = PLAYER_RADIUS + BALL_RADIUS;
    if (active.phase === "open" && distance < minDistance && distance > 0.001) {
      const normal = delta.normalize();
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

  capBallVelocity(ballVel);
  ball.addScaledVector(ballVel, dt);
  const crossedSideline = Math.abs(ball.x) > FIELD_W / 2;
  ballVel.multiplyScalar(Math.pow(BALL_ROLLING_FRICTION, dt));
  if (ballVel.length() < BALL_STOP_SPEED) ballVel.set(0, 0, 0);
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
  active.ballVel.set(0, 0, 0);
  active.players.forEach((player) => player.vel.set(0, 0, 0));
}

function stopForRestart(active: MatchRuntime, phase: PlayPhase, team: TeamId, spot: THREE.Vector3, label: string) {
  active.phase = phase;
  active.phaseTimer = phase === "kickoff" ? 1.8 : 1.25;
  active.restartTeam = team;
  active.restartSpot.copy(spot);
  if (phase === "throw-in") {
    active.restartDirection.set(spot.x > 0 ? -1 : 1, 0, Math.sign(attackingGoalZ(team, active.half)) * 0.35).normalize();
    active.restartActorId = nearestTeamPlayer(active.players, team, spot)?.id ?? null;
  } else {
    active.restartDirection.set(0, 0, Math.sign(attackingGoalZ(team, active.half)));
    active.restartActorId = phase === "corner" || phase === "free-kick" || phase === "goal-kick"
      ? nearestTeamPlayer(active.players, team, spot)?.id ?? null
      : null;
  }
  active.eventText = label;
  active.ballPos.copy(active.restartSpot);
  active.ballVel.set(0, 0, 0);
  active.cooldown = Math.max(active.cooldown, 0.45);
}

function resumeRestart(active: MatchRuntime) {
  if (active.phase === "halftime") {
    active.half = 2;
    setFormationHomes(active.players, 2);
    active.players.forEach((player) => {
      player.pos.copy(player.home);
      player.vel.set(0, 0, 0);
      player.mesh.position.copy(player.pos);
    });
    stopForRestart(active, "kickoff", "away", new THREE.Vector3(0, BALL_RADIUS, 0), "SECOND HALF");
    return;
  }
  const power = active.phase === "corner" ? 7 : active.phase === "goal-kick" ? 9 : active.phase === "throw-in" ? 5.5 : 4.2;
  active.ballPos.copy(active.restartSpot);
  active.ballVel.copy(active.restartDirection).multiplyScalar(power);
  active.lastTouchTeam = active.restartTeam;
  active.lastTouchPlayerId = active.restartActorId;
  active.restartActorId = null;
  active.phase = "open";
  active.phaseTimer = 0;
  active.eventText = active.half === 2 ? "SECOND HALF" : "PLAY";
  active.cooldown = 0.35;
}

function restartShapeInput(player: PlayerBody, active: MatchRuntime) {
  const offset = player.team === active.restartTeam ? -Math.sign(attackingGoalZ(player.team, active.half)) * 5 : Math.sign(attackingGoalZ(player.team, active.half)) * 8;
  const target = player.home.clone();
  if (player.id === active.restartActorId) {
    target.copy(active.restartSpot);
    target.z = clamp(target.z, -FIELD_L / 2 + 2, FIELD_L / 2 - 2);
    if (active.phase === "throw-in") target.x += active.restartSpot.x > 0 ? 0.7 : -0.7;
  } else if (active.phase !== "halftime" && player.line !== "keeper") {
    target.x = clamp(active.restartSpot.x + (player.home.x * 0.35), -FIELD_W / 2 + 3, FIELD_W / 2 - 3);
    target.z = clamp(active.restartSpot.z + offset + (player.home.z - teamGoalZ(player.team, active.half)) * 0.08, -FIELD_L / 2 + 4, FIELD_L / 2 - 4);
  }
  const dir = target.sub(player.pos);
  return { dir: dir.lengthSq() > 0.5 ? dir.normalize() : dir.set(0, 0, 0), sprint: false };
}

function nearestTeamPlayer(players: PlayerBody[], team: TeamId, spot: THREE.Vector3) {
  return players
    .filter((player) => player.team === team && player.role !== "keeper")
    .reduce<PlayerBody | null>((best, player) => {
      if (!best) return player;
      return player.pos.distanceTo(spot) < best.pos.distanceTo(spot) ? player : best;
    }, null);
}

function poseThrower(player: PlayerBody, ready: boolean) {
  if (!ready) return;
  const leftArm = player.mesh.getObjectByName("left-arm");
  const rightArm = player.mesh.getObjectByName("right-arm");
  if (leftArm) leftArm.rotation.x = -2.3;
  if (rightArm) rightArm.rotation.x = -2.3;
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
  const targetVel = dir.lengthSq() > 1 ? dir.normalize().multiplyScalar(7) : dir.set(0, 0, 0);
  referee.vel.lerp(targetVel, 1 - Math.pow(0.003, dt));
  referee.pos.addScaledVector(referee.vel, dt);
  referee.mesh.position.copy(referee.pos);
  animatePlayer(referee, dt);
  faceVelocity(referee.mesh, referee.vel);
}

function faceVelocity(mesh: THREE.Object3D, velocity: THREE.Vector3) {
  if (velocity.lengthSq() > 0.18) mesh.rotation.set(0, Math.atan2(velocity.x, velocity.z), 0);
}

function facePlayer(player: PlayerBody, active: MatchRuntime) {
  if (player.role === "keeper") {
    player.mesh.rotation.set(0, teamGoalZ(player.team, active.half) > 0 ? Math.PI : 0, 0);
    return;
  }
  faceVelocity(player.mesh, player.vel);
}

function animatePlayer(player: PlayerBody, dt: number) {
  const speed = player.vel.length();
  player.runPhase += speed * dt * (player.role === "keeper" ? 2.4 : 4.6);
  const strideScale = player.role === "keeper" ? 0.22 : 0.52;
  const stride = speed > 0.35 ? Math.sin(player.runPhase) * strideScale : 0;
  const armSwing = -stride * 0.72;
  const bodyRoot = player.mesh.getObjectByName("body-root");
  const leftLeg = player.mesh.getObjectByName("left-leg");
  const rightLeg = player.mesh.getObjectByName("right-leg");
  const leftArm = player.mesh.getObjectByName("left-arm");
  const rightArm = player.mesh.getObjectByName("right-arm");
  if (bodyRoot) {
    bodyRoot.rotation.x = speed > 0.35 && player.role !== "keeper" ? -0.09 : 0;
    bodyRoot.rotation.z = clamp(-player.vel.x * (player.role === "keeper" ? 0.004 : 0.012), -0.12, 0.12);
  }
  if (leftLeg) leftLeg.rotation.x = stride;
  if (rightLeg) rightLeg.rotation.x = -stride;
  if (leftArm) leftArm.rotation.x = armSwing;
  if (rightArm) rightArm.rotation.x = -armSwing;
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
    if (keys.has("KeyW")) dir.z -= 1;
    if (keys.has("KeyS")) dir.z += 1;
    if (keys.has("KeyA")) dir.x -= 1;
    if (keys.has("KeyD")) dir.x += 1;
    return { dir: dir.lengthSq() > 0 ? dir.normalize() : dir, sprint: keys.has("ShiftLeft") };
  }
  if (keys.has("ArrowUp")) dir.z += 1;
  if (keys.has("ArrowDown")) dir.z -= 1;
  if (keys.has("ArrowLeft")) dir.x -= 1;
  if (keys.has("ArrowRight")) dir.x += 1;
  return { dir: dir.lengthSq() > 0 ? dir.normalize() : dir, sprint: keys.has("Slash") || keys.has("ControlRight") };
}

function aiInput(player: PlayerBody, active: MatchRuntime) {
  const attackingZ = attackingGoalZ(player.team, active.half);
  const ownZ = teamGoalZ(player.team, active.half);
  const target = player.home.clone();
  const nearest = nearestPlayer(active.players, active.ballPos);
  const teamHasBall = nearest?.team === player.team && nearest.pos.distanceTo(active.ballPos) < 3.2;
  const opponentHasBall = nearest && nearest.team !== player.team && nearest.pos.distanceTo(active.ballPos) < 4;
  const distanceToBall = active.ballPos.distanceTo(player.pos);
  const pressurePlayer = closestFieldPlayer(active.players, player.team, active.ballPos);

  if (player.role === "keeper") {
    target.set(clamp(active.ballPos.x * 0.45, -GOAL_W / 2 + 1, GOAL_W / 2 - 1), 0, ownZ - Math.sign(ownZ) * 3);
    if (Math.sign(active.ballVel.z) === Math.sign(ownZ - active.ballPos.z) && Math.abs(active.ballPos.z - ownZ) < 18) {
      target.x = clamp(active.ballPos.x, -GOAL_W / 2 + 0.8, GOAL_W / 2 - 0.8);
    }
  } else if (teamHasBall) {
    target.x = player.home.x + active.ballPos.x * 0.16;
    target.z = player.home.z + Math.sign(attackingZ) * (player.line === "forward" ? 8 : 4);
    if (nearest?.id === player.id) target.set(active.ballPos.x * 0.35, 0, attackingZ * 0.76);
  } else if (pressurePlayer?.id === player.id && (opponentHasBall || distanceToBall < 26)) {
    target.copy(active.ballPos);
    target.z -= Math.sign(attackingZ) * 6;
  } else if (player.line === "defender" && opponentHasBall && Math.abs(active.ballPos.z - ownZ) < 34) {
    target.x = clamp(active.ballPos.x + player.home.x * 0.15, -FIELD_W / 2 + 4, FIELD_W / 2 - 4);
    target.z = player.home.z;
  } else {
    target.x += active.ballPos.x * (player.line === "midfielder" ? 0.14 : 0.08);
    target.z += clamp(active.ballPos.z - player.home.z, -10, 10) * (player.line === "midfielder" ? 0.22 : 0.12);
  }
  keepFormationRoam(player, target, pressurePlayer?.id === player.id);
  steerAroundPlayers(player, active.players, target);

  if (nearest?.id === player.id && active.ballPos.distanceTo(player.pos) < 2.8) {
    if (active.cooldown > 0.05) {
      const dir = target.sub(player.pos);
      return { dir: dir.lengthSq() > 0.1 ? dir.normalize() : dir.set(0, 0, 0), sprint: false };
    }
    const goalZ = attackingGoalZ(player.team, active.half);
    active.ballVel.x += clamp((0 - active.ballPos.x) * 0.04, -2.2, 2.2);
    active.ballVel.z += Math.sign(goalZ - active.ballPos.z) * 7.5;
    capBallVelocity(active.ballVel);
    active.cooldown = 0.34;
    playKickSound(active, 0.55);
  }

  const dir = target.sub(player.pos);
  return { dir: dir.lengthSq() > 0.1 ? dir.normalize() : dir.set(0, 0, 0), sprint: false };
}

function closestFieldPlayer(players: PlayerBody[], team: TeamId, ball: THREE.Vector3) {
  return players
    .filter((player) => player.team === team && player.role !== "keeper")
    .reduce<PlayerBody | null>((best, player) => {
      if (!best) return player;
      return player.pos.distanceTo(ball) < best.pos.distanceTo(ball) ? player : best;
    }, null);
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

function handleAction(player: PlayerBody | undefined, pressed: boolean, active: MatchRuntime) {
  if (!player || !pressed || active.cooldown > 0.05) return;
  const distance = player.pos.distanceTo(new THREE.Vector3(active.ballPos.x, 0, active.ballPos.z));
  if (distance > 3.2) return;
  const goalZ = player.team === "home" ? -FIELD_L / 2 : FIELD_L / 2;
  const forward = new THREE.Vector3(0, 0, Math.sign(goalZ - player.pos.z));
  const toGoal = new THREE.Vector3(-player.pos.x * 0.025, 0, forward.z).normalize();
  const power = Math.abs(player.pos.z - goalZ) < 26 ? 14.5 : 9.5;
  if (isOffsidePass(player, active, toGoal)) {
    stopForRestart(active, "offside", opponent(player.team), player.pos.clone().setY(BALL_RADIUS), "OFFSIDE");
    return;
  }
  active.ballVel.x += toGoal.x * power;
  active.ballVel.z += toGoal.z * power;
  capBallVelocity(active.ballVel);
  active.cooldown = 0.28;
  active.lastTouchTeam = player.team;
  active.lastTouchPlayerId = player.id;
  playKickSound(active, power > 12 ? 0.78 : 0.58);
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
    const goalZ = player.team === "home" ? FIELD_L / 2 - 4 : -FIELD_L / 2 + 4;
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
