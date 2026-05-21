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

type PlayerBody = {
  id: string;
  team: TeamId;
  role: PlayerRole;
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
  ballPos: THREE.Vector3;
  ballVel: THREE.Vector3;
  score: { home: number; away: number };
  timeLeft: number;
  cooldown: number;
  possession: TeamId | null;
  audio: AudioContext | null;
  lastKickSound: number;
  lastCheerSound: number;
};

const FIELD_W = 64;
const FIELD_L = 96;
const GOAL_W = 16;
const PLAYER_RADIUS = 1.15;
const BALL_RADIUS = 0.72;
const MATCH_SECONDS = 150;

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

function makeKit(team: TeamId, role: PlayerRole, accent: string) {
  const color = role === "keeper" ? (team === "home" ? HOME_KEEPER_COLOR : AWAY_KEEPER_COLOR) : (team === "home" ? HOME_COLOR : AWAY_COLOR);
  const trim = team === "home" ? "#075985" : "#881337";
  const group = new THREE.Group();
  const bodyRoot = new THREE.Group();
  bodyRoot.name = "body-root";

  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.66, 1.08, 4, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.05 }),
  );
  torso.position.y = 1.45;
  torso.castShadow = true;

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.36, 10, 10),
    new THREE.MeshStandardMaterial({ color: "#f8d6b5", roughness: 0.5 }),
  );
  head.position.y = 2.35;
  head.castShadow = true;

  const armMaterial = new THREE.MeshStandardMaterial({ color: trim, roughness: 0.55 });
  [-1, 1].forEach((side) => {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.7, 3, 6), armMaterial);
    arm.position.set(side * 0.68, 1.43, 0);
    arm.rotation.z = side * 0.16;
    arm.castShadow = true;
    bodyRoot.add(arm);
  });

  const legMaterial = new THREE.MeshStandardMaterial({ color: role === "keeper" ? "#111827" : "#0f172a", roughness: 0.58 });
  [-1, 1].forEach((side) => {
    const pivot = new THREE.Group();
    pivot.name = side < 0 ? "left-leg" : "right-leg";
    pivot.position.set(side * 0.28, 0.88, 0);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.85, 3, 6), legMaterial);
    leg.position.y = -0.42;
    leg.castShadow = true;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.13, 0.42), new THREE.MeshStandardMaterial({ color: "#020617", roughness: 0.5 }));
    boot.position.set(0, -0.9, 0.09);
    boot.castShadow = true;
    pivot.add(leg, boot);
    bodyRoot.add(pivot);
  });

  bodyRoot.add(torso, head);

  const marker = new THREE.Mesh(
    new THREE.TorusGeometry(1.1, 0.05, 8, 32),
    new THREE.MeshBasicMaterial({ color: accent }),
  );
  marker.rotation.x = Math.PI / 2;
  marker.position.y = 0.08;
  marker.name = "control-marker";
  marker.visible = false;
  group.add(bodyRoot, marker);
  return group;
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

function createPlayer(id: string, team: TeamId, role: PlayerRole, x: number, z: number, controlledBy?: "p1" | "p2") {
  const mesh = makeKit(team, role, controlledBy === "p2" ? "#fef08a" : "#ffffff");
  mesh.position.set(x, 0, z);
  const marker = mesh.getObjectByName("control-marker");
  if (marker) marker.visible = Boolean(controlledBy);
  return {
    id,
    team,
    role,
    home: new THREE.Vector3(x, 0, z),
    pos: new THREE.Vector3(x, 0, z),
    vel: new THREE.Vector3(),
    mesh,
    stamina: 1,
    runPhase: 0,
    controlledBy,
  } satisfies PlayerBody;
}

function playerStart(mode: GameMode) {
  const rows = [
    { z: 34, xs: [-20, -7, 7, 20] },
    { z: 14, xs: [-18, 0, 18] },
    { z: -8, xs: [-10, 10] },
    { z: -26, xs: [0] },
  ];
  const players: PlayerBody[] = [createPlayer("home-gk", "home", "keeper", 0, FIELD_L / 2 - 4)];
  let homeIndex = 1;
  rows.forEach((row) => {
    row.xs.forEach((x) => {
      players.push(createPlayer(`home-${homeIndex}`, "home", "field", x, row.z, homeIndex === 5 ? "p1" : undefined));
      homeIndex += 1;
    });
  });

  players.push(createPlayer("away-gk", "away", "keeper", 0, -FIELD_L / 2 + 4));
  let awayIndex = 1;
  rows.forEach((row) => {
    row.xs.forEach((x) => {
      players.push(createPlayer(`away-${awayIndex}`, "away", "field", -x, -row.z, mode === "local" && awayIndex === 5 ? "p2" : undefined));
      awayIndex += 1;
    });
  });
  return players;
}

export function ArcadeSoccerGame() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const keysRef = useRef(new Set<string>());
  const sceneRef = useRef<MatchRuntime | null>(null);

  const [mode, setMode] = useState<GameMode>("ai");
  const [matchState, setMatchState] = useState<MatchState>("menu");
  const [score, setScore] = useState({ home: 0, away: 0 });
  const [timeLeft, setTimeLeft] = useState(MATCH_SECONDS);
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
    active.ballVel.set(0, 0, servingTeam === "home" ? -6 : 6);
    active.cooldown = 1.2;
    active.possession = null;
  }, []);

  const startMatch = useCallback((nextMode = mode) => {
    const active = sceneRef.current;
    if (!active) return;
    ensureAudio(active);
    active.mode = nextMode;
    active.state = "playing";
    active.score = { home: 0, away: 0 };
    active.timeLeft = MATCH_SECONDS;
    active.players.forEach((player) => active.scene.remove(player.mesh));
    active.players = playerStart(nextMode);
    active.players.forEach((player) => active.scene.add(player.mesh));
    setMode(nextMode);
    setScore({ home: 0, away: 0 });
    setTimeLeft(MATCH_SECONDS);
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
    camera.position.set(0, 58, 58);

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

    const field = new THREE.Mesh(
      new THREE.BoxGeometry(FIELD_W, 0.2, FIELD_L),
      new THREE.MeshStandardMaterial({ color: "#13733a", roughness: 0.72 }),
    );
    field.receiveShadow = true;
    scene.add(field);

    const lineMat = new THREE.MeshBasicMaterial({ color: "#eaffff", transparent: true, opacity: 0.68 });
    const centerLine = new THREE.Mesh(new THREE.BoxGeometry(FIELD_W, 0.04, 0.18), lineMat);
    centerLine.position.y = 0.08;
    scene.add(centerLine);
    const centerCircle = new THREE.Mesh(new THREE.TorusGeometry(8, 0.08, 8, 72), lineMat);
    centerCircle.rotation.x = Math.PI / 2;
    centerCircle.position.y = 0.1;
    scene.add(centerCircle);
    addFieldMarking(scene, 0, FIELD_L / 2 - 11, 26, 15);
    addFieldMarking(scene, 0, -FIELD_L / 2 + 11, 26, 15);
    addFieldMarking(scene, 0, FIELD_L / 2 - 20, 44, 30);
    addFieldMarking(scene, 0, -FIELD_L / 2 + 20, 44, 30);
    addStadium(scene);

    const goalMat = new THREE.MeshStandardMaterial({ color: "#f8fafc", roughness: 0.35 });
    [-1, 1].forEach((side) => {
      const z = side * (FIELD_L / 2 + 1.2);
      const crossbar = new THREE.Mesh(new THREE.BoxGeometry(GOAL_W, 0.45, 0.45), goalMat);
      crossbar.position.set(0, 3.2, z);
      const postA = new THREE.Mesh(new THREE.BoxGeometry(0.45, 3.2, 0.45), goalMat);
      postA.position.set(-GOAL_W / 2, 1.6, z);
      const postB = postA.clone();
      postB.position.x = GOAL_W / 2;
      scene.add(crossbar, postA, postB);
    });

    const ball = createSoccerBall();
    scene.add(ball);

    const players = playerStart("ai");
    players.forEach((player) => scene.add(player.mesh));

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
      ballPos: new THREE.Vector3(0, BALL_RADIUS, 0),
      ballVel: new THREE.Vector3(),
      score: { home: 0, away: 0 },
      timeLeft: MATCH_SECONDS,
      cooldown: 0,
      possession: null,
      audio: null,
      lastKickSound: 0,
      lastCheerSound: 0,
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
        active.timeLeft = Math.max(0, active.timeLeft - dt);
        active.cooldown = Math.max(0, active.cooldown - dt);
        updateMatch(active, keysRef.current, dt);
        setScore({ ...active.score });
        setTimeLeft(active.timeLeft);
        if (active.timeLeft <= 0) {
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
      active.camera.position.z += (focus.z + 52 - active.camera.position.z) * 0.06;
      active.camera.lookAt(focus.x, 0, focus.z - 8);
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
            <Metric label="Time" value={formatTime(timeLeft)} />
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
            P1 WASD · Space action · Shift sprint · P2 arrows · Enter action · Right Shift sprint
          </div>
        )}
      </section>

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

  active.players.forEach((player) => {
    const input = player.controlledBy === "p1" ? playerInput(keys, "p1") : player.controlledBy === "p2" ? playerInput(keys, "p2") : aiInput(player, active);
    const sprint = input.sprint && player.stamina > 0.12;
    const maxSpeed = (player.role === "keeper" ? 9 : 12) * (sprint ? 1.28 : 1);
    player.stamina = clamp(player.stamina + (sprint ? -0.42 : 0.24) * dt, 0, 1);
    const targetVel = input.dir.multiplyScalar(maxSpeed);
    player.vel.lerp(targetVel, 1 - Math.pow(0.001, dt));
    player.pos.addScaledVector(player.vel, dt);
    clampPlayer(player);
    player.mesh.position.copy(player.pos);
    animatePlayer(player, dt);
    if (player.vel.lengthSq() > 0.2) player.mesh.lookAt(player.pos.x + player.vel.x, 0, player.pos.z + player.vel.z);
  });

  handleAction(p1, keys.has("Space"), active);
  handleAction(p2, keys.has("Enter") || keys.has("ShiftRight"), active);

  active.players.forEach((player) => {
    const flatBall = new THREE.Vector3(ball.x, 0, ball.z);
    const delta = flatBall.sub(player.pos);
    const distance = delta.length();
    const minDistance = PLAYER_RADIUS + BALL_RADIUS;
    if (distance < minDistance && distance > 0.001) {
      const normal = delta.normalize();
      ball.x = player.pos.x + normal.x * minDistance;
      ball.z = player.pos.z + normal.z * minDistance;
      const push = Math.max(4, player.vel.length() * 0.85);
      ballVel.x += normal.x * push * dt * 8;
      ballVel.z += normal.z * push * dt * 8;
      playKickSound(active, 0.45);
    }
  });

  ball.addScaledVector(ballVel, dt);
  ball.x = clamp(ball.x, -FIELD_W / 2, FIELD_W / 2);
  if (Math.abs(ball.x) >= FIELD_W / 2) ballVel.x *= -0.58;
  ballVel.multiplyScalar(Math.pow(0.38, dt));
  active.ball.position.copy(ball);
  active.ball.rotation.x += ballVel.z * dt / BALL_RADIUS;
  active.ball.rotation.z -= ballVel.x * dt / BALL_RADIUS;

  if (Math.abs(ball.z) > FIELD_L / 2 && Math.abs(ball.x) < GOAL_W / 2 && active.cooldown <= 0) {
    const scoredBy: TeamId = ball.z < 0 ? "home" : "away";
    active.score[scoredBy] += 1;
    playGoalSound(active);
    resetRuntime(active, scoredBy === "home" ? "away" : "home");
  } else if (Math.abs(ball.z) > FIELD_L / 2) {
    ball.z = clamp(ball.z, -FIELD_L / 2, FIELD_L / 2);
    ballVel.z *= -0.48;
  }
}

function animatePlayer(player: PlayerBody, dt: number) {
  const speed = player.vel.length();
  player.runPhase += speed * dt * 5.2;
  const stride = speed > 0.35 ? Math.sin(player.runPhase) * 0.65 : 0;
  const bodyRoot = player.mesh.getObjectByName("body-root");
  const leftLeg = player.mesh.getObjectByName("left-leg");
  const rightLeg = player.mesh.getObjectByName("right-leg");
  if (bodyRoot) {
    bodyRoot.rotation.x = speed > 0.35 ? -0.14 : 0;
    bodyRoot.rotation.z = clamp(-player.vel.x * 0.018, -0.16, 0.16);
  }
  if (leftLeg) leftLeg.rotation.x = stride;
  if (rightLeg) rightLeg.rotation.x = -stride;
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
  if (now - active.lastKickSound < 110) return;
  active.lastKickSound = now;
  playTone(active, 92, 0.08, 0.035 * volume, "triangle");
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
  const attackingZ = player.team === "home" ? -FIELD_L / 2 : FIELD_L / 2;
  const ownZ = player.team === "home" ? FIELD_L / 2 : -FIELD_L / 2;
  const target = player.home.clone();
  const nearest = nearestPlayer(active.players, active.ballPos);
  const teamHasBall = nearest?.team === player.team && nearest.pos.distanceTo(active.ballPos) < 3.2;
  const opponentHasBall = nearest && nearest.team !== player.team && nearest.pos.distanceTo(active.ballPos) < 4;

  if (player.role === "keeper") {
    target.set(clamp(active.ballPos.x, -GOAL_W / 2 + 1, GOAL_W / 2 - 1), 0, ownZ - Math.sign(ownZ) * 3);
  } else if (teamHasBall) {
    target.set(player.home.x * 0.7, 0, attackingZ * 0.45);
    if (nearest?.id === player.id) target.set(0, 0, attackingZ);
  } else if (opponentHasBall || active.ballPos.distanceTo(player.pos) < 18) {
    target.copy(active.ballPos);
    if (player.team === "home" && active.ballPos.z < player.pos.z - 18) target.z += 8;
    if (player.team === "away" && active.ballPos.z > player.pos.z + 18) target.z -= 8;
  }

  if (nearest?.id === player.id && active.ballPos.distanceTo(player.pos) < 2.8) {
    const goalZ = player.team === "home" ? -FIELD_L / 2 : FIELD_L / 2;
    active.ballVel.x += (0 - active.ballPos.x) * 0.08;
    active.ballVel.z += Math.sign(goalZ - active.ballPos.z) * 12;
  }

  const dir = target.sub(player.pos);
  return { dir: dir.lengthSq() > 0.1 ? dir.normalize() : dir.set(0, 0, 0), sprint: false };
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
  const power = Math.abs(player.pos.z - goalZ) < 26 ? 26 : 16;
  active.ballVel.x += toGoal.x * power;
  active.ballVel.z += toGoal.z * power;
  active.cooldown = 0.22;
  playKickSound(active, 1);
}

function resetRuntime(active: MatchRuntime, servingTeam: TeamId) {
  active.players.forEach((player) => {
    player.pos.copy(player.home);
    player.vel.set(0, 0, 0);
    player.mesh.position.copy(player.pos);
    player.runPhase = 0;
    animatePlayer(player, 0);
  });
  active.ballPos.set(0, BALL_RADIUS, 0);
  active.ballVel.set(0, 0, servingTeam === "home" ? -7 : 7);
  active.cooldown = 1.15;
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

function formatTime(value: number) {
  const total = Math.max(0, Math.ceil(value));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
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
