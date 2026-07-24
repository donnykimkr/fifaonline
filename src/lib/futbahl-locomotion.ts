import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

export type FutbahlLocomotionState =
  | "Idle"
  | "Jog"
  | "Sprint"
  | "StrafeLeft"
  | "StrafeRight"
  | "Backpedal"
  | "TurnLeft"
  | "TurnRight"
  | "Stop";

export const LOCOMOTION_CLIPS: Record<FutbahlLocomotionState, string> = {
  Idle: "Idle_Loop",
  Jog: "Jog_Fwd_Loop",
  Sprint: "Sprint_Loop",
  StrafeLeft: "Strafe_Left_Loop",
  StrafeRight: "Strafe_Right_Loop",
  Backpedal: "Jog_Back_Loop",
  TurnLeft: "Turn_Left",
  TurnRight: "Turn_Right",
  Stop: "Stop",
};

export const FUTBAHL_LOCOMOTION_ASSET = {
  path: "/models/futbahl-locomotion-prototype.glb",
  licensePath: "/models/futbahl-locomotion-prototype.LICENSE.txt",
  source: "Quaternius Universal Animation Library",
  license: "CC0 1.0",
  prototypeScale: 1.58,
} as const;

export type FutbahlLocomotionDebugSnapshot = {
  state: FutbahlLocomotionState;
  clip: string;
  totalSpeed: number;
  localForwardSpeed: number;
  localLateralSpeed: number;
  acceleration: number;
  angularVelocity: number;
  turnRate: number;
  playbackSpeed: number;
};

type MotionSample = {
  velocity: THREE.Vector3;
  heading: number;
  turnRate: number;
  dt: number;
};

const FALLBACK_CLIPS: Record<FutbahlLocomotionState, string[]> = {
  Idle: ["Idle_Loop"],
  Jog: ["Jog_Fwd_Loop", "Walk_Loop"],
  Sprint: ["Sprint_Loop", "Jog_Fwd_Loop"],
  StrafeLeft: ["Jog_Fwd_Loop", "Walk_Loop"],
  StrafeRight: ["Jog_Fwd_Loop", "Walk_Loop"],
  Backpedal: ["Walk_Loop", "Jog_Fwd_Loop"],
  TurnLeft: ["Walk_Loop", "Idle_Loop"],
  TurnRight: ["Walk_Loop", "Idle_Loop"],
  Stop: ["Idle_Loop", "Walk_Loop"],
};

const warnedMissingClips = new Set<string>();
let sharedAssetPromise: Promise<GLTF> | null = null;

function loadAsset() {
  sharedAssetPromise ??= new GLTFLoader().loadAsync(FUTBAHL_LOCOMOTION_ASSET.path);
  return sharedAssetPromise;
}

function shortestAngleDelta(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function damp(current: number, target: number, smoothing: number, dt: number) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-smoothing * dt));
}

function chooseState(
  speed: number,
  localForward: number,
  localLateral: number,
  acceleration: number,
  angularVelocity: number,
  previousSpeed: number,
): FutbahlLocomotionState {
  if (speed < 0.14) {
    if (previousSpeed > 0.85 && acceleration < -1.6) return "Stop";
    if (angularVelocity > 0.42) return "TurnLeft";
    if (angularVelocity < -0.42) return "TurnRight";
    return "Idle";
  }
  if (localForward < -0.55 && Math.abs(localForward) > Math.abs(localLateral) * 0.78) return "Backpedal";
  if (Math.abs(localLateral) > 0.72 && Math.abs(localLateral) > Math.abs(localForward) * 1.08) {
    return localLateral < 0 ? "StrafeLeft" : "StrafeRight";
  }
  return speed >= 7.35 ? "Sprint" : "Jog";
}

function actionPlaybackSpeed(state: FutbahlLocomotionState, speed: number) {
  if (state === "Sprint") return THREE.MathUtils.clamp(speed / 9.4, 0.72, 1.35);
  if (
    state === "Jog"
    || state === "StrafeLeft"
    || state === "StrafeRight"
    || state === "Backpedal"
  ) {
    return THREE.MathUtils.clamp(speed / 4.8, 0.62, 1.42);
  }
  if (state === "TurnLeft" || state === "TurnRight") return 0.9;
  return 1;
}

export class FutbahlLocomotionController {
  readonly root: THREE.Group;
  readonly missingClips: string[];

  private readonly host: THREE.Group;
  private readonly visualRoot: THREE.Group;
  private readonly fallbackBody: THREE.Object3D | null;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly availableClips: Map<string, THREE.AnimationClip>;
  private readonly debugElement: HTMLDivElement | null;
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private state: FutbahlLocomotionState = "Idle";
  private currentAction: THREE.AnimationAction | null = null;
  private currentClip = "";
  private previousSpeed = 0;
  private previousHeading = 0;
  private debugTimer = 0;
  private disposed = false;

  private constructor(
    host: THREE.Group,
    root: THREE.Group,
    animations: THREE.AnimationClip[],
    debugElement: HTMLDivElement | null,
  ) {
    this.host = host;
    this.root = root;
    this.debugElement = debugElement;
    this.fallbackBody = host.getObjectByName("body-root") ?? null;
    this.visualRoot = new THREE.Group();
    this.visualRoot.name = "futbahl-skeletal-locomotion-prototype";
    this.visualRoot.add(root);
    this.host.add(this.visualRoot);
    if (this.fallbackBody) this.fallbackBody.visible = false;

    root.scale.setScalar(FUTBAHL_LOCOMOTION_ASSET.prototypeScale);
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const cloned = materials.map((material) => {
        const next = material.clone();
        if (next instanceof THREE.MeshStandardMaterial || next instanceof THREE.MeshLambertMaterial) {
          next.color.set(object.name.toLowerCase().includes("joint") ? "#111827" : "#38bdf8");
          if (next instanceof THREE.MeshStandardMaterial) {
            next.roughness = 0.78;
            next.metalness = 0;
          }
        }
        return next;
      });
      object.material = Array.isArray(object.material) ? cloned : cloned[0];
    });

    const headBone = root.getObjectByName("DEF-head");
    if (headBone) {
      const hair = new THREE.Mesh(
        new THREE.SphereGeometry(0.135, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: "#2d1d15" }),
      );
      hair.name = "futbahl-original-hair-cap";
      hair.position.set(0, 0.14, 0);
      hair.scale.set(0.94, 0.62, 1.02);
      headBone.add(hair);
    }

    this.mixer = new THREE.AnimationMixer(root);
    this.availableClips = new Map(animations.map((clip) => [clip.name, clip]));
    this.missingClips = Object.values(LOCOMOTION_CLIPS).filter((clipName) => !this.availableClips.has(clipName));
    this.missingClips.forEach((clipName) => {
      if (warnedMissingClips.has(clipName)) return;
      warnedMissingClips.add(clipName);
      console.warn(`[Futbahl locomotion] Missing clip "${clipName}". A safe skeletal fallback clip will be used.`);
    });
    this.transitionTo("Idle", 0);
  }

  static async create(
    host: THREE.Group,
    debugElement: HTMLDivElement | null,
  ): Promise<FutbahlLocomotionController> {
    const gltf = await loadAsset();
    const clonedRoot = cloneSkeleton(gltf.scene) as THREE.Group;
    return new FutbahlLocomotionController(host, clonedRoot, gltf.animations, debugElement);
  }

  update({ velocity, heading, turnRate, dt }: MotionSample) {
    if (this.disposed) return;
    const safeDt = THREE.MathUtils.clamp(dt, 1 / 240, 0.05);
    const speed = Math.hypot(velocity.x, velocity.z);
    this.forward.set(Math.sin(heading), 0, Math.cos(heading));
    this.right.set(Math.cos(heading), 0, -Math.sin(heading));
    const localForward = velocity.dot(this.forward);
    const localLateral = velocity.dot(this.right);
    const acceleration = (speed - this.previousSpeed) / safeDt;
    const angularVelocity = shortestAngleDelta(this.previousHeading, heading) / safeDt;
    const nextState = chooseState(
      speed,
      localForward,
      localLateral,
      acceleration,
      angularVelocity,
      this.previousSpeed,
    );
    if (nextState !== this.state) this.transitionTo(nextState, 0.18);

    const playbackSpeed = actionPlaybackSpeed(this.state, speed);
    if (this.currentAction) this.currentAction.timeScale = playbackSpeed;
    const forwardLean = THREE.MathUtils.clamp(-acceleration * 0.0065, -0.13, 0.09);
    const lateralLean = THREE.MathUtils.clamp(-localLateral * 0.014, -0.1, 0.1);
    this.visualRoot.rotation.x = damp(this.visualRoot.rotation.x, forwardLean, 8.5, safeDt);
    this.visualRoot.rotation.z = damp(this.visualRoot.rotation.z, lateralLean, 8.5, safeDt);
    this.mixer.update(safeDt);

    this.previousSpeed = speed;
    this.previousHeading = heading;
    this.debugTimer -= safeDt;
    if (this.debugElement && this.debugTimer <= 0) {
      this.debugTimer = 0.1;
      this.renderDebug({
        state: this.state,
        clip: this.currentClip,
        totalSpeed: speed,
        localForwardSpeed: localForward,
        localLateralSpeed: localLateral,
        acceleration,
        angularVelocity,
        turnRate,
        playbackSpeed,
      });
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.host.remove(this.visualRoot);
    if (this.fallbackBody) this.fallbackBody.visible = true;
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose());
    });
  }

  private resolveClip(state: FutbahlLocomotionState) {
    const expected = LOCOMOTION_CLIPS[state];
    if (this.availableClips.has(expected)) return expected;
    return FALLBACK_CLIPS[state].find((clipName) => this.availableClips.has(clipName)) ?? "";
  }

  private transitionTo(state: FutbahlLocomotionState, fadeDuration: number) {
    const clipName = this.resolveClip(state);
    const clip = this.availableClips.get(clipName);
    if (!clip) return;
    let nextAction = this.actions.get(clipName);
    if (!nextAction) {
      nextAction = this.mixer.clipAction(clip);
      nextAction.setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY);
      this.actions.set(clipName, nextAction);
    }
    if (nextAction !== this.currentAction) {
      nextAction.reset().fadeIn(fadeDuration).play();
      this.currentAction?.fadeOut(fadeDuration);
      this.currentAction = nextAction;
    }
    this.state = state;
    this.currentClip = clipName;
  }

  private renderDebug(snapshot: FutbahlLocomotionDebugSnapshot) {
    if (!this.debugElement) return;
    this.debugElement.textContent = [
      "Futbahl locomotion prototype",
      `state: ${snapshot.state}`,
      `clip: ${snapshot.clip}`,
      `speed: ${snapshot.totalSpeed.toFixed(2)}`,
      `forward: ${snapshot.localForwardSpeed.toFixed(2)}`,
      `lateral: ${snapshot.localLateralSpeed.toFixed(2)}`,
      `accel: ${snapshot.acceleration.toFixed(2)}`,
      `angular: ${snapshot.angularVelocity.toFixed(2)}`,
      `turn rate: ${snapshot.turnRate.toFixed(2)}`,
      `playback: ${snapshot.playbackSpeed.toFixed(2)}`,
    ].join("\n");
  }
}
