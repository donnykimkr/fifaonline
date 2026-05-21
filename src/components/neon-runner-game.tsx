"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import type { User } from "@supabase/supabase-js";
import { ChevronLeft, ChevronRight, Gem, LogOut, Medal, Play, RotateCcw, Trophy, UserCircle } from "lucide-react";
import { getSupabaseClient, hasSupabaseConfig } from "@/lib/supabase";

type GameState = "start" | "playing" | "gameOver" | "complete";
type TileKind = "normal" | "falling" | "jump";
type Row = { index: number; lanes: number[]; falling: number[]; jumps: number[] };
type ObstacleKind =
  | "riser"
  | "airCrusher"
  | "verticalHammer"
  | "horizontalHammer"
  | "laserCannon"
  | "signalBlock"
  | "floatingSpikes"
  | "wheel"
  | "slasher";
type Obstacle = {
  kind: ObstacleKind;
  row: number;
  lane: number;
  phase: number;
  speed: number;
  range?: number;
  lanes?: number[];
};
type GemItem = { row: number; lane: number; id: string };
type Theme = {
  name: string;
  background: string;
  fog: string;
  tile: string;
  tileGlow: string;
  edge: string;
  jump: string;
  jumpGlow: string;
  falling: string;
  fallingGlow: string;
  obstacle: string;
  obstacleGlow: string;
  gem: string;
  gemGlow: string;
  ball: string;
  ballGlow: string;
  overlayA: string;
  overlayB: string;
};
type Level = {
  id: number;
  title: string;
  rows: Row[];
  obstacles: Obstacle[];
  gems: GemItem[];
  speed: number;
  theme: Theme;
};
type LeaderboardRow = {
  id: string;
  nickname: string;
  score: number;
  gems: number;
  level: number;
  created_at: string;
};
type TileMesh = {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  edge: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  row: number;
  lane: number;
  kind: TileKind;
  baseX: number;
  baseY: number;
};

const LANES = [-2, -1, 0, 1, 2];
const MIN_LANE = LANES[0];
const MAX_LANE = LANES[LANES.length - 1];
const TILE_SIZE = 4;
const LANE_WIDTH = 2.8;
const BALL_RADIUS = 0.78;
const BALL_Y = 1.1;
const JUMP_DURATION = 0.72;
const JUMP_HEIGHT = 2.8;
const FALL_DELAY = 0.34;

const THEMES: Theme[] = [
  {
    name: "Aurora Grid",
    background: "#030712",
    fog: "#05101f",
    tile: "#0b1830",
    tileGlow: "#063752",
    edge: "#22d3ee",
    jump: "#143a52",
    jumpGlow: "#38bdf8",
    falling: "#321a2c",
    fallingGlow: "#fb7185",
    obstacle: "#fb3867",
    obstacleGlow: "#9f1239",
    gem: "#a3ff12",
    gemGlow: "#5f7f05",
    ball: "#d9ff4f",
    ballGlow: "#6b8d05",
    overlayA: "rgba(34,211,238,0.20)",
    overlayB: "rgba(163,255,18,0.14)",
  },
  {
    name: "Solar Drift",
    background: "#09050f",
    fog: "#150915",
    tile: "#1d1029",
    tileGlow: "#6d255e",
    edge: "#f59e0b",
    jump: "#32235f",
    jumpGlow: "#a78bfa",
    falling: "#3a140d",
    fallingGlow: "#f97316",
    obstacle: "#34d399",
    obstacleGlow: "#047857",
    gem: "#67e8f9",
    gemGlow: "#0891b2",
    ball: "#ffd166",
    ballGlow: "#b45309",
    overlayA: "rgba(245,158,11,0.18)",
    overlayB: "rgba(167,139,250,0.16)",
  },
  {
    name: "Ion Night",
    background: "#03030a",
    fog: "#080816",
    tile: "#121624",
    tileGlow: "#3730a3",
    edge: "#e879f9",
    jump: "#073b3a",
    jumpGlow: "#2dd4bf",
    falling: "#3a1029",
    fallingGlow: "#f43f5e",
    obstacle: "#facc15",
    obstacleGlow: "#a16207",
    gem: "#60a5fa",
    gemGlow: "#1d4ed8",
    ball: "#f0abfc",
    ballGlow: "#a21caf",
    overlayA: "rgba(232,121,249,0.18)",
    overlayB: "rgba(45,212,191,0.14)",
  },
];

const LEVEL_COUNT = 3;

function buildLevel(id: number): Level {
  const length = id === 1 ? 430 : id === 2 ? 540 : 660;
  const cells = Array.from({ length }, () => [".", ".", ".", ".", "."]);
  const obstacles: Obstacle[] = [];

  const laneIndex = (lane: number) => LANES.indexOf(lane);
  const put = (row: number, lane: number, value: string) => {
    const index = laneIndex(lane);
    if (row >= 0 && row < length && index >= 0) cells[row][index] = value;
  };
  const narrow = (row: number, lanes: number[], fill = ".") => {
    if (row < 0 || row >= length) return;
    cells[row] = [" ", " ", " ", " ", " "];
    lanes.forEach((lane) => put(row, lane, fill));
  };
  const hole = (row: number, lane: number) => put(row, lane, " ");
  const falling = (row: number, lane: number) => put(row, lane, "F");
  const gem = (row: number, lane: number) => put(row, lane, "G");
  const jump = (row: number, lane: number, landingLanes: number[], landingFalls = false) => {
    put(row, lane, "J");
    narrow(row + 1, []);
    narrow(row + 2, landingLanes, landingFalls ? "F" : ".");
  };
  const add = (kind: ObstacleKind, row: number, lane: number, speed: number, phase: number, range = 1, lanes?: number[]) => {
    obstacles.push({ kind, row, lane, speed, phase, range, lanes });
  };
  const addLaser = (row: number, lanes: number[], phase = 0) => {
    add("laserCannon", row, 0, 1, phase, 1, lanes.slice(0, 3));
  };
  const section = (start: number, end: number, step: number, callback: (row: number, index: number) => void) => {
    let index = 0;
    for (let row = start; row < end; row += step) {
      callback(row, index);
      index += 1;
    }
  };

  for (let row = 8; row < length - 6; row += id === 1 ? 13 : id === 2 ? 11 : 10) {
    gem(row, LANES[(row + id) % LANES.length]);
  }

  if (id === 1) {
    section(34, 170, 19, (row, index) => hole(row, LANES[(index + 1) % 5]));
    section(68, 250, 31, (row, index) => {
      narrow(row - 2, index % 2 ? [-2, -1, 0] : [0, 1, 2]);
      jump(row, LANES[(index * 2 + 1) % 5], [LANES[(index * 2 + 1) % 5], LANES[(index * 2 + 2) % 5]], index > 2);
    });
    section(150, 335, 17, (row, index) => falling(row, LANES[(index * 2) % 5]));
    section(220, 388, 29, (row, index) => narrow(row, index % 2 ? [-2, -1, 0] : [0, 1, 2]));
    section(260, 406, 36, (row, index) => {
      const lane = index % 2 ? -1 : 1;
      narrow(row - 2, [lane - 1, lane, lane + 1].filter((value) => LANES.includes(value)));
      jump(row, lane, [lane, Math.max(MIN_LANE, lane - 1)], true);
    });
    [
      [46, 0, 1.1, 0.2],
      [112, -1, 1.2, 0.8],
      [178, 1, 1.25, 1.6],
      [292, -2, 1.3, 0.4],
    ].forEach(([row, lane, speed, phase]) => add("riser", row, lane, speed, phase));
    [
      [86, -1, 1.25, 0.6],
      [202, 1, 1.3, 1.4],
      [332, 0, 1.4, 2.3],
    ].forEach(([row, lane, speed, phase]) => add("signalBlock", row, lane, speed, phase));
    add("wheel", 132, 0, 1.15, 1.6, 1.3);
    add("airCrusher", 238, 1, 1.25, 0.4);
    add("horizontalHammer", 354, 0, 1.25, 2.2, 1.7);
    addLaser(190, [-2, -1, 1], 0.2);
    addLaser(312, [-1, 0, 2], 1.1);
    addLaser(394, [-2, 0, 1], 2.0);
  } else if (id === 2) {
    for (let row = 38; row < length - 20; row += 18) {
      const holeIndex = Math.floor(row / 4) % LANES.length;
      hole(row, LANES[holeIndex]);
      hole(row + 1, LANES[(holeIndex + 2) % LANES.length]);
    }
    section(64, 500, 44, (row, index) => {
      const lane = LANES[(index * 2 + 4) % 5];
      narrow(row - 2, [lane, Math.max(MIN_LANE, lane - 1), Math.min(MAX_LANE, lane + 1)]);
      jump(row, lane, [lane], index % 2 === 0);
    });
    section(95, 520, 13, (row, index) => falling(row, LANES[(index + 2) % 5]));
    section(154, 498, 37, (row, index) => narrow(row, index % 2 ? [-2, -1, 0] : [0, 1, 2]));
    section(260, 522, 52, (row, index) => narrow(row, index % 2 ? [-2, -1] : [1, 2]));
    add("riser", 58, -1, 1.45, 0.1);
    add("verticalHammer", 91, 1, 1.35, 1.1);
    addLaser(122, [-2, 0, 2], 0.2);
    add("airCrusher", 158, -2, 1.5, 1.3);
    add("floatingSpikes", 192, 1, 1, 0);
    add("horizontalHammer", 224, 0, 1.45, 2.4, 2);
    add("wheel", 258, 0, 1.55, 0.7, 1.7);
    add("signalBlock", 294, -1, 1.7, 1.9);
    add("slasher", 328, 0, 1.8, 1.2, 2.2);
    addLaser(364, [-1, 0, 1], 2.1);
    add("airCrusher", 408, 2, 1.65, 0.8);
    add("horizontalHammer", 452, 0, 1.7, 1.5, 2.15);
    add("wheel", 496, 0, 1.8, 2.2, 2);
    addLaser(516, [-2, 1, 2], 0.9);
  } else {
    for (let row = 42; row < length - 12; row += 14) {
      hole(row, LANES[(row + 2) % 5]);
      if (row % 18 === 0) hole(row + 1, LANES[(row + 4) % 5]);
    }
    section(70, 632, 39, (row, index) => {
      const lane = LANES[(index * 3) % 5];
      narrow(row - 2, [lane, Math.max(MIN_LANE, lane - 1), Math.min(MAX_LANE, lane + 1)]);
      jump(row, lane, [lane], true);
    });
    section(88, 642, 9, (row, index) => falling(row, LANES[(index * 2 + 1) % 5]));
    section(132, 620, 31, (row, index) => narrow(row, [LANES[index % 5], LANES[(index + 1) % 5], LANES[(index + 2) % 5]]));
    section(250, 640, 47, (row, index) => narrow(row, index % 2 ? [-2, -1] : [1, 2]));
    add("riser", 62, 0, 1.7, 0.4);
    addLaser(96, [-2, -1, 1], 0.2);
    add("airCrusher", 132, 2, 1.7, 1.5);
    add("verticalHammer", 166, -1, 1.8, 0.6);
    add("horizontalHammer", 204, 0, 1.75, 2.2, 2.2);
    add("floatingSpikes", 242, 1, 1, 0);
    add("wheel", 278, 0, 1.85, 1.3, 2);
    add("signalBlock", 316, -2, 2, 0.7);
    add("slasher", 354, 0, 2.1, 1.6, 2.25);
    addLaser(392, [-2, 0, 2], 2.5);
    add("airCrusher", 432, -1, 1.95, 0.8);
    add("horizontalHammer", 474, 0, 2.05, 1.1, 2.35);
    add("slasher", 514, 0, 2.35, 2.6, 2.35);
    addLaser(548, [-1, 1, 2], 1.4);
    add("wheel", 586, 0, 2.2, 2.8, 2.2);
    add("verticalHammer", 620, 2, 2.1, 1.7);
  }

  const rows: Row[] = [];
  const gems: GemItem[] = [];
  cells.forEach((line, index) => {
    const lanes: number[] = [];
    const fallingTiles: number[] = [];
    const jumps: number[] = [];
    line.forEach((cell, cellIndex) => {
      if (cell === " ") return;
      const lane = LANES[cellIndex];
      lanes.push(lane);
      if (cell === "F") fallingTiles.push(lane);
      if (cell === "J") jumps.push(lane);
      if (cell === "G") gems.push({ row: index, lane, id: `${id}-${index}-${lane}` });
    });
    rows.push({ index, lanes, falling: fallingTiles, jumps });
  });

  return {
    id,
    title: THEMES[id - 1]?.name ?? THEMES[THEMES.length - 1].name,
    rows,
    gems,
    obstacles,
    speed: id === 1 ? 13.2 : id === 2 ? 15.2 : 17.2,
    theme: THEMES[id - 1] ?? THEMES[THEMES.length - 1],
  };
}

function laneToX(lane: number) {
  return lane * LANE_WIDTH;
}

function rowToZ(row: number) {
  return -row * TILE_SIZE;
}

function tileKey(row: number, lane: number) {
  return `${row}:${lane}`;
}

function nicknameIsValid(value: string) {
  return /^[a-zA-Z0-9 _-]{2,16}$/.test(value.trim());
}

function scoreIsValid(value: number) {
  return Number.isInteger(value) && value > 0;
}

function makeMaterial(color: string, emissive: string, emissiveIntensity = 0.7) {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity,
    roughness: 0.52,
    metalness: 0.18,
  });
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function createObstacleGroup(obstacle: Obstacle, theme: Theme) {
  const group = new THREE.Group();
  const danger = makeMaterial(theme.obstacle, theme.obstacleGlow, 1);
  const warning = makeMaterial("#fef08a", "#facc15", 1.1);
  const safe = makeMaterial("#4ade80", "#16a34a", 1);
  const dark = makeMaterial("#111827", theme.tileGlow, 0.55);

  if (obstacle.kind === "riser") {
    const block = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.8, 1.45), danger);
    block.name = "block";
    block.position.y = -0.62;
    group.add(block);
  }
  if (obstacle.kind === "airCrusher") {
    const head = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 2.2), danger);
    head.name = "head";
    const warningPlate = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 2.4), warning);
    warningPlate.name = "warning";
    warningPlate.position.y = 0.23;
    group.add(head, warningPlate);
  }
  if (obstacle.kind === "verticalHammer") {
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.2, 0.35), dark);
    shaft.name = "shaft";
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.75, 1.7), danger);
    head.name = "head";
    group.add(shaft, head);
  }
  if (obstacle.kind === "horizontalHammer") {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(3.25, 0.6, 1.1), danger);
    bar.name = "bar";
    bar.position.y = 1.05;
    group.add(bar);
  }
  if (obstacle.kind === "laserCannon") {
    LANES.forEach((lane) => {
      const targeted = (obstacle.lanes ?? []).includes(lane);
      const material = targeted ? danger : safe;
      const beam = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.16, 3.25), material);
      beam.name = `beam-${lane}`;
      beam.position.set(laneToX(lane), 1.08, 0);
      const warningLine = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.05, 3.45), targeted ? warning : safe);
      warningLine.name = `warning-${lane}`;
      warningLine.position.set(laneToX(lane), 0.34, 0);
      group.add(beam, warningLine);
    });
    const cannonA = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.1, 0.7), dark);
    cannonA.position.set(laneToX(-2.45), 0.8, 0);
    const cannonB = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.1, 0.7), dark);
    cannonB.position.set(laneToX(2.45), 0.8, 0);
    group.add(cannonA, cannonB);
  }
  if (obstacle.kind === "signalBlock") {
    const block = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.45, 1.45), safe);
    block.name = "signal";
    block.position.y = 0.95;
    group.add(block);
  }
  if (obstacle.kind === "floatingSpikes") {
    [-0.48, 0, 0.48].forEach((offset) => {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1, 4), danger);
      spike.position.set(offset, 2.25, 0);
      spike.rotation.x = Math.PI;
      group.add(spike);
    });
  }
  if (obstacle.kind === "wheel") {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.2, 12, 28), danger);
    wheel.name = "wheel";
    wheel.position.y = 0.9;
    wheel.rotation.y = Math.PI / 2;
    group.add(wheel);
  }
  if (obstacle.kind === "slasher") {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 0.78), danger);
    blade.name = "blade";
    blade.position.y = 1.18;
    blade.rotation.z = 0.55;
    group.add(blade);
  }

  group.position.set(laneToX(obstacle.lane), 0, rowToZ(obstacle.row));
  return group;
}

function updateObstacleGroup(obstacle: Obstacle, group: THREE.Group, time: number, progress: number, ballLane: number, ballY: number) {
  const seconds = time * 0.001;
  const phaseTime = seconds * obstacle.speed + obstacle.phase;
  const zDistance = progress + rowToZ(obstacle.row);
  const range = obstacle.range ?? 1;
  const laneX = laneToX(ballLane);
  let hit = false;

  group.visible = true;
  group.position.z = rowToZ(obstacle.row);

  if (obstacle.kind === "riser") {
    const lift = clamp01((7 - Math.abs(zDistance)) / 7);
    const block = group.getObjectByName("block");
    group.position.x = laneToX(obstacle.lane);
    if (block) block.position.y = -0.62 + lift * 1.6;
    hit = Math.abs(zDistance) < 1.1 && Math.abs(ballLane - obstacle.lane) < 0.45 && lift > 0.62 && ballY < 2.25;
  }

  if (obstacle.kind === "airCrusher") {
    const cycle = (Math.sin(phaseTime) + 1) / 2;
    const slam = cycle > 0.58 ? clamp01((cycle - 0.58) / 0.42) : 0;
    const head = group.getObjectByName("head");
    const warning = group.getObjectByName("warning") as THREE.Mesh | undefined;
    group.position.x = laneToX(obstacle.lane);
    if (head) head.position.y = 3.2 - slam * 2.25;
    if (warning?.material instanceof THREE.MeshStandardMaterial) warning.material.emissiveIntensity = 0.5 + cycle * 2;
    hit = Math.abs(zDistance) < 1.2 && Math.abs(ballLane - obstacle.lane) < 0.5 && slam > 0.72 && ballY < 2.25;
  }

  if (obstacle.kind === "verticalHammer") {
    const drop = (Math.sin(phaseTime) + 1) / 2;
    const head = group.getObjectByName("head");
    const shaft = group.getObjectByName("shaft");
    group.position.x = laneToX(obstacle.lane);
    if (head) head.position.y = 2.6 - drop * 1.75;
    if (shaft) shaft.position.y = 2.05 - drop * 0.8;
    hit = Math.abs(zDistance) < 1.05 && Math.abs(ballLane - obstacle.lane) < 0.5 && drop > 0.68 && ballY < 2.2;
  }

  if (obstacle.kind === "horizontalHammer") {
    const x = laneToX(obstacle.lane) + Math.sin(phaseTime) * LANE_WIDTH * range;
    group.position.x = x;
    group.rotation.y += 0.02;
    hit = Math.abs(zDistance) < 1.05 && Math.abs(laneX - x) < 1.55 && ballY < 2.1;
  }

  if (obstacle.kind === "laserCannon") {
    const targetedLanes = obstacle.lanes ?? [];
    const approach = -zDistance;
    const warning = approach < 24 && approach > 4.2;
    const active = approach <= 4.2 && approach > -1.05;
    group.position.x = 0;
    LANES.forEach((lane) => {
      const targeted = targetedLanes.includes(lane);
      const beam = group.getObjectByName(`beam-${lane}`);
      const warningLine = group.getObjectByName(`warning-${lane}`);
      if (beam) beam.visible = targeted && active;
      if (warningLine) {
        warningLine.visible = warning || active;
        const mesh = warningLine as THREE.Mesh;
        if (mesh.material instanceof THREE.MeshStandardMaterial) {
          mesh.material.emissiveIntensity = targeted ? (warning ? 1.8 + Math.sin(seconds * 18) * 0.65 : 1.1) : 0.65;
          mesh.material.opacity = targeted ? 1 : 0.55;
        }
      }
    });
    hit = active && Math.abs(zDistance) < 1.05 && targetedLanes.includes(Math.round(ballLane)) && ballY < 2.0;
  }

  if (obstacle.kind === "signalBlock") {
    const red = Math.sin(phaseTime) > 0.12;
    const signal = group.getObjectByName("signal") as THREE.Mesh | undefined;
    group.position.x = laneToX(obstacle.lane);
    if (signal?.material instanceof THREE.MeshStandardMaterial) {
      signal.material.color.set(red ? "#fb3867" : "#4ade80");
      signal.material.emissive.set(red ? "#9f1239" : "#16a34a");
    }
    hit = red && Math.abs(zDistance) < 1.1 && Math.abs(ballLane - obstacle.lane) < 0.5 && ballY < 2.2;
  }

  if (obstacle.kind === "floatingSpikes") {
    group.position.x = laneToX(obstacle.lane);
    group.rotation.y = Math.sin(seconds * 1.8 + obstacle.phase) * 0.2;
    hit = Math.abs(zDistance) < 1.05 && Math.abs(ballLane - obstacle.lane) < 0.55 && ballY > 2.05;
  }

  if (obstacle.kind === "wheel") {
    const x = laneToX(obstacle.lane) + Math.sin(phaseTime) * LANE_WIDTH * range;
    group.position.x = x;
    group.rotation.z -= 0.11 * obstacle.speed;
    hit = Math.abs(zDistance) < 1.05 && Math.abs(laneX - x) < 1.05 && ballY < 2.05;
  }

  if (obstacle.kind === "slasher") {
    const x = laneToX(obstacle.lane) + Math.sin(phaseTime * 1.55) * LANE_WIDTH * range;
    group.position.x = x;
    group.rotation.y = Math.sin(phaseTime) * 0.55;
    hit = Math.abs(zDistance) < 1.1 && Math.abs(laneX - x) < 1.45 && ballY < 2.25;
  }

  return hit;
}

export function NeonRunnerGame() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    ball: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
    obstacleMeshes: THREE.Group[];
    gemMeshes: Map<string, THREE.Mesh>;
    tileMeshes: Map<string, TileMesh>;
    frame: number;
    lastTime: number;
  } | null>(null);
  const runtimeRef = useRef({
    state: "start" as GameState,
    lane: 0,
    targetLane: 0,
    progress: 0,
    gems: new Set<string>(),
    jumped: new Set<string>(),
    fallingStarted: new Map<string, number>(),
    fallen: new Set<string>(),
    score: 0,
    levelId: 1,
    jumpStart: -1,
  });
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const [gameState, setGameState] = useState<GameState>("start");
  const [levelId, setLevelId] = useState(1);
  const [progress, setProgress] = useState(0);
  const [gemsCollected, setGemsCollected] = useState(0);
  const [score, setScore] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [nickname, setNickname] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [authStatus, setAuthStatus] = useState("");

  const level = useMemo(() => buildLevel(levelId), [levelId]);
  const gemIds = useMemo(() => new Set(level.gems.map((gem) => gem.id)), [level.gems]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const requestedLevel = Number(new URLSearchParams(window.location.search).get("level"));
    if (!Number.isInteger(requestedLevel)) return undefined;
    const timer = window.setTimeout(() => {
      const boundedLevel = Math.max(1, Math.min(LEVEL_COUNT, requestedLevel));
      runtimeRef.current.levelId = boundedLevel;
      setLevelId(boundedLevel);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const syncState = useCallback((next: GameState) => {
    runtimeRef.current.state = next;
    setGameState(next);
  }, []);

  const moveLane = useCallback((direction: -1 | 1) => {
    const runtime = runtimeRef.current;
    if (runtime.state !== "playing") return;
    runtime.targetLane = Math.max(MIN_LANE, Math.min(MAX_LANE, runtime.targetLane + direction));
  }, []);

  const resetRun = useCallback(
    (nextLevel = levelId) => {
      const boundedLevel = Math.max(1, Math.min(LEVEL_COUNT, nextLevel));
      runtimeRef.current = {
        state: "playing",
        lane: 0,
        targetLane: 0,
        progress: 0,
        gems: new Set<string>(),
        jumped: new Set<string>(),
        fallingStarted: new Map<string, number>(),
        fallen: new Set<string>(),
        score: 0,
        levelId: boundedLevel,
        jumpStart: -1,
      };
      setLevelId(boundedLevel);
      setProgress(0);
      setGemsCollected(0);
      setScore(0);
      setSaveStatus("");
      setTimeout(() => syncState("playing"), 0);
    },
    [levelId, syncState],
  );

  const fetchLeaderboard = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data } = await supabase
      .from("leaderboard")
      .select("id,nickname,score,gems,level,created_at")
      .order("score", { ascending: false })
      .limit(10);
    setLeaderboard((data ?? []) as LeaderboardRow[]);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || typeof window === "undefined") {
      setAuthStatus("Google sign-in needs Supabase env vars.");
      return;
    }
    setAuthStatus("Opening Google sign-in...");
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
    setSaveStatus("");
    setAuthStatus("Signed out. Playing as Guest.");
  }, []);

  const saveScore = useCallback(async () => {
    if (!user) {
      setSaveStatus("Sign in with Google to upload scores. Guest runs stay local.");
      return;
    }
    const cleanName = nickname.trim();
    if (!nicknameIsValid(cleanName)) {
      setSaveStatus("Nickname must be 2-16 letters, numbers, spaces, _ or -.");
      return;
    }
    if (!scoreIsValid(score)) {
      setSaveStatus("Finish a run with a positive score first.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setSaveStatus("Leaderboard is disabled until NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are added.");
      return;
    }
    setSaveStatus("Saving...");
    const { error } = await supabase.from("leaderboard").insert({
      user_id: user.id,
      nickname: cleanName,
      score,
      gems: gemsCollected,
      level: levelId,
    });
    if (error) {
      setSaveStatus(error.message);
      return;
    }
    setSaveStatus("Saved to leaderboard.");
    await fetchLeaderboard();
  }, [fetchLeaderboard, gemsCollected, levelId, nickname, score, user]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchLeaderboard();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchLeaderboard]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return undefined;

    const timer = window.setTimeout(() => {
      void supabase.auth.getSession().then(({ data }) => {
        const sessionUser = data.session?.user ?? null;
        setUser(sessionUser);
        if (sessionUser) {
          const fallbackName = sessionUser.user_metadata?.full_name || sessionUser.email || "Player";
          setNickname((current) => current || String(fallbackName).slice(0, 16));
        }
      });
    }, 0);

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);
      if (sessionUser) {
        const fallbackName = sessionUser.user_metadata?.full_name || sessionUser.email || "Player";
        setNickname((current) => current || String(fallbackName).slice(0, 16));
        setAuthStatus("");
      }
    });

    return () => {
      window.clearTimeout(timer);
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(level.theme.background);
    scene.fog = new THREE.Fog(level.theme.fog, 18, 128);

    const camera = new THREE.PerspectiveCamera(58, mount.clientWidth / mount.clientHeight, 0.1, 420);
    camera.position.set(0, 12, 15);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight("#d8f7ff", 1.05);
    const key = new THREE.DirectionalLight("#ffffff", 2.25);
    key.position.set(8, 18, 10);
    scene.add(ambient, key);

    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_RADIUS, 36, 36),
      new THREE.MeshStandardMaterial({
        color: level.theme.ball,
        emissive: level.theme.ballGlow,
        emissiveIntensity: 0.9,
        metalness: 0.25,
        roughness: 0.25,
      }),
    );
    ball.position.set(0, BALL_Y, 0);
    scene.add(ball);

    const finish = new THREE.Mesh(
      new THREE.BoxGeometry(15.5, 0.28, 0.8),
      makeMaterial("#ffffff", level.theme.edge, 1.55),
    );
    finish.position.set(0, 0.08, rowToZ(level.rows.length + 1));
    scene.add(finish);

    const tileMeshes = new Map<string, TileMesh>();
    level.rows.forEach((row) => {
      row.lanes.forEach((lane) => {
        const kind: TileKind = row.jumps.includes(lane) ? "jump" : row.falling.includes(lane) ? "falling" : "normal";
        const material =
          kind === "jump"
            ? makeMaterial(level.theme.jump, level.theme.jumpGlow, 1.25)
            : kind === "falling"
              ? makeMaterial(level.theme.falling, level.theme.fallingGlow, 0.95)
              : makeMaterial(level.theme.tile, level.theme.tileGlow, 0.68);
        const tile = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.3, 3.65), material);
        tile.position.set(laneToX(lane), 0, rowToZ(row.index));
        scene.add(tile);

        const edge = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.04, 0.1), makeMaterial(level.theme.edge, level.theme.edge, 0.9));
        edge.position.set(laneToX(lane), 0.18, rowToZ(row.index) + 1.78);
        scene.add(edge);

        if (kind === "jump") {
          const ramp = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.16, 1.05), makeMaterial(level.theme.jumpGlow, level.theme.jumpGlow, 1.2));
          ramp.position.set(laneToX(lane), 0.34, rowToZ(row.index) - 0.35);
          ramp.rotation.x = -0.22;
          scene.add(ramp);
        }

        tileMeshes.set(tileKey(row.index, lane), {
          mesh: tile,
          edge,
          row: row.index,
          lane,
          kind,
          baseX: laneToX(lane),
          baseY: 0,
        });
      });
    });

    const obstacleMeshes = level.obstacles.map((obstacle) => {
      const group = createObstacleGroup(obstacle, level.theme);
      scene.add(group);
      return group;
    });

    const gemMeshes = new Map<string, THREE.Mesh>();
    level.gems.forEach((gem) => {
      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.48),
        makeMaterial(level.theme.gem, level.theme.gemGlow, 1.25),
      );
      mesh.position.set(laneToX(gem.lane), 1.1, rowToZ(gem.row));
      scene.add(mesh);
      gemMeshes.set(gem.id, mesh);
    });

    sceneRef.current = { renderer, scene, camera, ball, obstacleMeshes, gemMeshes, tileMeshes, frame: 0, lastTime: performance.now() };

    const handleResize = () => {
      if (!mount || !sceneRef.current) return;
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      sceneRef.current.camera.aspect = width / height;
      sceneRef.current.camera.updateProjectionMatrix();
      sceneRef.current.renderer.setSize(width, height);
    };
    window.addEventListener("resize", handleResize);

    const animate = (time: number) => {
      const active = sceneRef.current;
      if (!active) return;
      const runtime = runtimeRef.current;
      const delta = Math.min((time - active.lastTime) / 1000, 0.04);
      active.lastTime = time;

      const jumpElapsed = runtime.jumpStart > 0 ? (time - runtime.jumpStart) / 1000 : Number.POSITIVE_INFINITY;
      const airborne = jumpElapsed < JUMP_DURATION;
      const jumpLift = airborne ? Math.sin((jumpElapsed / JUMP_DURATION) * Math.PI) * JUMP_HEIGHT : 0;
      if (!airborne) runtime.jumpStart = -1;

      if (runtime.state === "playing") {
        const speedBoost = 1 + (runtime.progress / ((level.rows.length - 1) * TILE_SIZE)) * (0.1 + level.id * 0.06);
        const currentSpeed = level.speed * speedBoost;
        runtime.progress += currentSpeed * delta;
        runtime.lane += (runtime.targetLane - runtime.lane) * Math.min(1, delta * 12);
        const currentRow = Math.round(runtime.progress / TILE_SIZE);
        const row = level.rows[currentRow];
        const lane = Math.round(runtime.lane);

        if (row) {
          const currentKey = tileKey(row.index, lane);
          if (row.jumps.includes(lane) && !runtime.jumped.has(currentKey) && !airborne) {
            runtime.jumped.add(currentKey);
            runtime.jumpStart = time;
          }
          if (row.falling.includes(lane) && !runtime.fallingStarted.has(currentKey)) {
            runtime.fallingStarted.set(currentKey, time);
          }
          if (!airborne && (!row.lanes.includes(lane) || runtime.fallen.has(currentKey))) {
            syncState("gameOver");
          }
        } else if (!airborne) {
          syncState("gameOver");
        }

        runtime.fallingStarted.forEach((startedAt, key) => {
          if (time - startedAt > FALL_DELAY * 1000) runtime.fallen.add(key);
        });

        level.gems.forEach((gem) => {
          if (!runtime.gems.has(gem.id) && Math.abs(runtime.progress + rowToZ(gem.row)) < 1.25 && Math.abs(runtime.lane - gem.lane) < 0.45) {
            runtime.gems.add(gem.id);
            active.gemMeshes.get(gem.id)?.scale.setScalar(0.001);
          }
        });

        level.obstacles.forEach((obstacle, index) => {
          const hit = updateObstacleGroup(
            obstacle,
            active.obstacleMeshes[index],
            time,
            runtime.progress,
            runtime.lane,
            BALL_Y + jumpLift,
          );
          if (hit) {
            syncState("gameOver");
          }
        });

        const distanceScore = Math.max(0, Math.floor(runtime.progress * 10));
        runtime.score = distanceScore + runtime.gems.size * 150;
        if (runtime.progress >= (level.rows.length - 1) * TILE_SIZE) {
          runtime.score += 1000 + level.id * 300;
          syncState("complete");
        }

        setProgress(runtime.progress);
        setGemsCollected(runtime.gems.size);
        setScore(runtime.score);
      }

      active.ball.position.set(laneToX(runtime.lane), BALL_Y + jumpLift, -runtime.progress);
      const displaySpeedBoost = 1 + (runtime.progress / ((level.rows.length - 1) * TILE_SIZE)) * (0.1 + level.id * 0.06);
      active.ball.rotation.x -= (level.speed * displaySpeedBoost * delta) / BALL_RADIUS;
      active.ball.rotation.z += (runtime.targetLane - runtime.lane) * delta * 2.6;
      active.camera.position.x += (active.ball.position.x * 0.23 - active.camera.position.x) * 0.06;
      active.camera.position.z += (active.ball.position.z + 15 - active.camera.position.z) * 0.08;
      active.camera.lookAt(active.ball.position.x, 0.65, active.ball.position.z - 12);

      if (runtime.state !== "playing") {
        level.obstacles.forEach((obstacle, index) => {
          updateObstacleGroup(obstacle, active.obstacleMeshes[index], time, runtime.progress, runtime.lane, BALL_Y + jumpLift);
        });
      }
      active.gemMeshes.forEach((mesh, id) => {
        if (!runtime.gems.has(id) && gemIds.has(id)) {
          mesh.rotation.y += delta * 2.8;
          mesh.position.y = 1.1 + Math.sin(time * 0.004) * 0.12;
        }
      });
      active.tileMeshes.forEach((tile, key) => {
        const startedAt = runtime.fallingStarted.get(key);
        const isFallen = runtime.fallen.has(key);
        if (tile.kind === "falling" && startedAt && !isFallen) {
          const shake = Math.sin(time * 0.08) * 0.08;
          tile.mesh.position.x = tile.baseX + shake;
          tile.edge.position.x = tile.baseX + shake;
          tile.mesh.material.color.set(level.theme.obstacle);
          tile.mesh.material.emissive.set(level.theme.fallingGlow);
        } else {
          tile.mesh.position.x += (tile.baseX - tile.mesh.position.x) * 0.18;
          tile.edge.position.x += (tile.baseX - tile.edge.position.x) * 0.18;
        }
        if (isFallen) {
          tile.mesh.position.y -= delta * 10;
          tile.edge.position.y -= delta * 10;
          tile.mesh.rotation.z += delta * 2.4;
          tile.edge.visible = false;
        }
      });

      active.renderer.render(active.scene, active.camera);
      active.frame = requestAnimationFrame(animate);
    };
    sceneRef.current.frame = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", handleResize);
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
  }, [gemIds, level, syncState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const code = event.code;
      if (key === "arrowleft" || key === "a" || code === "KeyA") {
        event.preventDefault();
        moveLane(-1);
      }
      if (key === "arrowright" || key === "d" || code === "KeyD") {
        event.preventDefault();
        moveLane(1);
      }
      if (event.key === "Enter" && runtimeRef.current.state !== "playing") resetRun(levelId);
    };
    window.addEventListener("keydown", onKeyDown, { passive: false, capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [levelId, moveLane, resetRun]);

  const progressPercent = Math.min(100, Math.floor((progress / ((level.rows.length - 1) * TILE_SIZE)) * 100));
  const canSave = gameState === "complete" || gameState === "gameOver";
  const playerLabel = user?.user_metadata?.full_name || user?.email || "Guest";
  const nextLevel = Math.min(levelId + 1, LEVEL_COUNT);
  const finishedFinalLevel = gameState === "complete" && levelId === LEVEL_COUNT;

  return (
    <main className="relative min-h-screen overflow-hidden text-white" style={{ backgroundColor: level.theme.background }}>
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 20% 10%, ${level.theme.overlayA}, transparent 32%), radial-gradient(circle at 80% 0%, ${level.theme.overlayB}, transparent 28%)`,
        }}
      />
      <div ref={mountRef} className="absolute inset-0" aria-label="3D neon five-lane tile runner game" />

      <section className="pointer-events-none relative z-10 flex min-h-screen flex-col justify-between p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-normal sm:text-4xl">Skyline Dash</h1>
            <p className="mt-1 text-sm text-cyan-100/75">
              Level {levelId} · {level.title} · 5 lanes
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <Metric label="Score" value={score} />
              <Metric label="Gems" value={gemsCollected} />
              <Metric label="Run" value={`${progressPercent}%`} />
            </div>
            <div className="pointer-events-auto flex min-w-48 max-w-full items-center gap-2 rounded-md border border-white/10 bg-black/35 px-3 py-2 shadow-2xl backdrop-blur">
              <UserCircle size={18} className="shrink-0 text-cyan-200" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold text-white">{playerLabel}</div>
                <div className="text-[10px] uppercase text-cyan-100/55">{user ? "Signed in" : "Guest mode"}</div>
              </div>
              {user ? (
                <button
                  aria-label="Sign out"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/10 text-cyan-100 transition hover:bg-white/10"
                  onClick={signOut}
                >
                  <LogOut size={15} />
                </button>
              ) : (
                <button
                  className="shrink-0 rounded-md bg-white px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!hasSupabaseConfig}
                  onClick={signInWithGoogle}
                >
                  Sign in with Google
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="pointer-events-auto mx-auto mb-5 flex w-full max-w-5xl items-end justify-between gap-3">
          <TouchButton label="Move left" onClick={() => moveLane(-1)}>
            <ChevronLeft size={32} />
          </TouchButton>
          <div className="hidden rounded-md border border-white/10 bg-black/35 px-4 py-3 text-center text-xs text-cyan-100/75 shadow-2xl backdrop-blur sm:block">
            A / Left Arrow · D / Right Arrow
          </div>
          <TouchButton label="Move right" onClick={() => moveLane(1)}>
            <ChevronRight size={32} />
          </TouchButton>
        </div>
      </section>

      <div
        className="absolute inset-0 z-20 sm:hidden"
        onClick={(event) => {
          if (gameState !== "playing") return;
          moveLane(event.clientX < window.innerWidth / 2 ? -1 : 1);
        }}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          touchStartRef.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEnd={(event) => {
          const start = touchStartRef.current;
          const touch = event.changedTouches[0];
          if (!start) return;
          const dx = touch.clientX - start.x;
          if (Math.abs(dx) > 32) moveLane(dx > 0 ? 1 : -1);
          touchStartRef.current = null;
        }}
      />

      {gameState !== "playing" && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/58 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-md border border-cyan-300/25 bg-[#080b17]/92 p-5 shadow-[0_0_45px_rgba(37,231,255,0.18)]">
            <div className="mb-4 flex items-center gap-3">
              {gameState === "complete" ? <Trophy className="text-lime-300" /> : <Medal className="text-cyan-300" />}
              <div>
                <h2 className="text-xl font-black">
                  {gameState === "start" && "Ready to roll"}
                  {gameState === "gameOver" && "Run ended"}
                  {gameState === "complete" && (finishedFinalLevel ? "Final level clear" : "Level complete")}
                </h2>
                <p className="text-sm text-white/65">
                  {gameState === "start"
                    ? "Move across five lanes, hit jump blocks, and watch for falling tiles."
                    : `Score ${score} · ${gemsCollected} gems`}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                className="inline-flex items-center justify-center gap-2 rounded-md bg-cyan-300 px-4 py-3 font-bold text-slate-950 transition hover:bg-cyan-200"
                onClick={() => resetRun(gameState === "complete" ? nextLevel : levelId)}
              >
                {gameState === "complete" && !finishedFinalLevel ? <ChevronRight size={18} /> : <Play size={18} />}
                {gameState === "complete" && !finishedFinalLevel ? "Next level" : "Start"}
              </button>
              <button
                className="inline-flex items-center justify-center gap-2 rounded-md border border-white/15 px-4 py-3 font-bold text-white transition hover:bg-white/10"
                onClick={() => resetRun(1)}
              >
                <RotateCcw size={18} />
                Restart
              </button>
            </div>

            <div className="mt-5 border-t border-white/10 pt-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold">
                <Gem size={16} className="text-lime-300" />
                Leaderboard
              </div>
              {!hasSupabaseConfig && (
                <p className="mb-3 text-sm text-amber-200/85">
                  Leaderboard is offline locally. Add Supabase env vars to enable online scores.
                </p>
              )}
              {hasSupabaseConfig && !user && (
                <p className="mb-3 text-sm text-cyan-100/75">Playing as Guest. Sign in with Google to upload leaderboard scores.</p>
              )}
              {authStatus && <p className="mb-3 text-sm text-cyan-100/75">{authStatus}</p>}
              <div className="space-y-2">
                {leaderboard.length === 0 ? (
                  <p className="text-sm text-white/55">No saved scores yet.</p>
                ) : (
                  leaderboard.map((entry, index) => (
                    <div key={entry.id} className="flex items-center justify-between rounded-md bg-white/6 px-3 py-2 text-sm">
                      <span className="truncate">
                        {index + 1}. {entry.nickname}
                      </span>
                      <span className="font-mono text-cyan-100">{entry.score}</span>
                    </div>
                  ))
                )}
              </div>

              {canSave && (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <input
                    className="min-w-0 flex-1 rounded-md border border-white/15 bg-black/35 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300"
                    maxLength={16}
                    placeholder="Nickname"
                    value={nickname}
                    onChange={(event) => setNickname(event.target.value)}
                  />
                  <button
                    className="rounded-md bg-lime-300 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!hasSupabaseConfig || !user}
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

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-20 rounded-md border border-white/10 bg-black/35 px-3 py-2 shadow-2xl backdrop-blur">
      <div className="text-[10px] uppercase text-cyan-100/60">{label}</div>
      <div className="font-mono text-lg font-black text-white">{value}</div>
    </div>
  );
}

function TouchButton({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      aria-label={label}
      className="grid h-16 w-16 place-items-center rounded-md border border-cyan-300/25 bg-black/35 text-cyan-100 shadow-2xl backdrop-blur transition hover:bg-cyan-300/15 active:scale-95"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
