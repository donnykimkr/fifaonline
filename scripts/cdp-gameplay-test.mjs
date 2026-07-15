import { writeFile } from "node:fs/promises";

const [url, waitSeconds = "8", mode = "diagnostics"] = process.argv.slice(2);
const port = Number(process.env.CDP_PORT ?? "9225");
if (!url) throw new Error("Usage: node scripts/cdp-gameplay-test.mjs <url> [waitSeconds] [mode]");

const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" }).then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const callback = pending.get(message.id);
  if (!callback) return;
  pending.delete(message.id);
  if (message.error) callback.reject(new Error(message.error.message));
  else callback.resolve(message.result);
});
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  return result.result?.value;
};
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const dispatchKey = (type, key, code) => send("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode: key.startsWith("Arrow") ? { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 }[key] : key.charCodeAt(0) });
const readLifecycle = () => evaluate(`(() => {
  const canvas = document.querySelector('canvas');
  if (!canvas) return { error: 'no canvas' };
  const d = canvas.dataset;
  return {
    matchState: document.querySelector('main')?.dataset.matchState ?? null,
    playPhase: document.querySelector('main')?.dataset.playPhase ?? null,
    engineId: d.engineId,
    restartCount: d.restartCount,
    activeEngineCount: d.activeEngineCount,
    canvasCount: d.canvasCount,
    rafLoops: d.rafLoops,
    resizeListenerCount: d.resizeListenerCount,
    visibilityListenerCount: d.visibilityListenerCount,
    inputListenerSetCount: d.inputListenerSetCount,
    fullscreenListenerCount: d.fullscreenListenerCount,
    sceneNodes: d.sceneNodes,
    colliderCount: d.colliderCount,
    timerCount: d.timerCount,
    audioSourceCount: d.audioSourceCount,
    rendererGeometries: d.rendererGeometries,
    rendererTextures: d.rendererTextures,
    rendererCalls: d.rendererCalls,
    rendererTriangles: d.rendererTriangles,
    rendererDpr: d.rendererDpr,
    rendererPixels: d.rendererPixels,
    rendererCount: d.rendererCount,
    canvasBackingWidth: d.canvasBackingWidth,
    canvasBackingHeight: d.canvasBackingHeight,
    effectiveDpr: d.effectiveDpr,
    matchUpdatesThisFrame: d.matchUpdatesThisFrame,
    matchGeneration: d.matchGeneration,
    fullTimeHandled: d.fullTimeHandled,
    fullTimeTransitions: d.fullTimeTransitions,
    fps: d.fps,
    averageFrameMs: d.averageFrameMs,
    fullscreenActive: Boolean(document.fullscreenElement),
  };
})()`);
const waitForMatchState = async (state, timeoutMs = 12000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const current = await evaluate(`document.querySelector('main')?.dataset.matchState ?? null`);
    if (current === state) return true;
    await sleep(100);
  }
  return false;
};

await send("Runtime.enable");
await send("Page.enable");
await send("Page.bringToFront");
await sleep(850);
if (mode !== "start-screen") {
  await evaluate(`(() => {
    const kickoff = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim().toLowerCase() === 'kickoff');
    if (kickoff) kickoff.click();
    return Boolean(kickoff);
  })()`);
}
await sleep(1800);

if (mode === "ai-observe") {
  await evaluate(`(() => {
    const toggle = [...document.querySelectorAll('button')].find((button) => button.textContent?.replace(/\\s+/g, '') === 'AIOFF');
    toggle?.click();
    return Boolean(toggle);
  })()`);
  await sleep(500);
}

const lifecycleSamples = [];
if (mode === "lifecycle") {
  await dispatchKey("keyDown", "f", "KeyF");
  await dispatchKey("keyUp", "f", "KeyF");
  await sleep(500);
  lifecycleSamples.push({ iteration: 0, ...(await readLifecycle()) });
  for (let iteration = 1; iteration <= 10; iteration += 1) {
    await evaluate(`(() => {
      const settings = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Settings');
      settings?.click();
      return Boolean(settings);
    })()`);
    await sleep(120);
    await evaluate(`(() => {
      const exit = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Exit Game');
      exit?.click();
      return Boolean(exit);
    })()`);
    await sleep(180);
    await evaluate(`(() => {
      const kickoff = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim().toLowerCase() === 'kickoff');
      kickoff?.click();
      return Boolean(kickoff);
    })()`);
    await sleep(650);
    lifecycleSamples.push({ iteration, ...(await readLifecycle()) });
  }
}
if (mode === "lifecycle-events") {
  lifecycleSamples.push({ event: "initial", ...(await readLifecycle()) });
  for (let iteration = 0; iteration < 12; iteration += 1) {
    await send("Emulation.setDeviceMetricsOverride", {
      width: iteration % 2 === 0 ? 1280 : 1440,
      height: iteration % 2 === 0 ? 760 : 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(100);
  }
  await send("Emulation.clearDeviceMetricsOverride");
  await sleep(700);
  lifecycleSamples.push({ event: "after-resize", ...(await readLifecycle()) });

  const backgroundTarget = await send("Target.createTarget", { url: "about:blank", background: false });
  for (let iteration = 0; iteration < 5; iteration += 1) {
    await send("Target.activateTarget", { targetId: backgroundTarget.targetId });
    await sleep(500);
    await send("Target.activateTarget", { targetId: target.id });
    await send("Page.bringToFront");
    await sleep(500);
  }
  await send("Target.closeTarget", { targetId: backgroundTarget.targetId });
  lifecycleSamples.push({ event: "after-tab-switch", ...(await readLifecycle()) });

  await send("Page.reload", { ignoreCache: true });
  await sleep(1900);
  await evaluate(`(() => {
    const kickoff = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim().toLowerCase() === 'kickoff');
    kickoff?.click();
    return Boolean(kickoff);
  })()`);
  await sleep(1500);
  lifecycleSamples.push({ event: "after-refresh", ...(await readLifecycle()) });
}
if (mode === "fulltime-lifecycle") {
  await dispatchKey("keyDown", "f", "KeyF");
  await dispatchKey("keyUp", "f", "KeyF");
  await sleep(450);
  for (let iteration = 1; iteration <= 10; iteration += 1) {
    const reachedFullTime = await waitForMatchState("ended");
    lifecycleSamples.push({ iteration, event: "full-time", reachedFullTime, ...(await readLifecycle()) });
    if (!reachedFullTime) break;
    const restarted = await evaluate(`(() => {
      const kickoff = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim().toLowerCase() === 'kickoff');
      kickoff?.click();
      return Boolean(kickoff);
    })()`);
    const reachedPlaying = restarted && await waitForMatchState("playing", 3500);
    await sleep(1050);
    lifecycleSamples.push({ iteration, event: "restarted", reachedPlaying, ...(await readLifecycle()) });
    if (!reachedPlaying) break;
  }
}

const manualSamples = [];
if (mode === "central-dribble") {
  await sleep(250);
  const awayAttack = url.includes("away-attack");
  const forwardKey = awayAttack ? "ArrowRight" : "ArrowLeft";
  await dispatchKey("keyDown", forwardKey, forwardKey);
  for (let sample = 0; sample < 10; sample += 1) {
    await sleep(500);
    manualSamples.push(await evaluate(`(() => {
      const canvas = document.querySelector('canvas');
      return {
        sample: ${sample + 1},
        key: ${JSON.stringify(forwardKey)},
        owner: canvas?.dataset.ballOwner,
        player: canvas?.dataset.controlledPlayerId,
        x: canvas?.dataset.controlledPlayerX,
        z: canvas?.dataset.controlledPlayerZ,
        primary: canvas?.dataset.primaryPresserId,
        primaryLaneOffset: canvas?.dataset.primaryLaneOffset,
        primaryPositionLaneOffset: canvas?.dataset.primaryPositionLaneOffset,
        centralRouteProtected: canvas?.dataset.centralRouteProtected,
        aggressiveCloserCount: canvas?.dataset.aggressiveCloserCount,
      };
    })()`));
  }
  await dispatchKey("keyUp", forwardKey, forwardKey);
}
if (mode === "manual") {
  for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
    await dispatchKey("keyDown", key, key);
    await sleep(700);
    manualSamples.push(await evaluate(`(() => {
      const canvas = document.querySelector('canvas');
      return { key: ${JSON.stringify(key)}, id: canvas?.dataset.controlledPlayerId, x: canvas?.dataset.controlledPlayerX, z: canvas?.dataset.controlledPlayerZ, vx: canvas?.dataset.controlledVelocityX, vz: canvas?.dataset.controlledVelocityZ, aiRole: canvas?.dataset.manualControlledHasAiRole };
    })()`));
    await dispatchKey("keyUp", key, key);
    await sleep(180);
  }
}

await sleep(Math.max(0, Number(waitSeconds) * 1000 - 1800));
const diagnostics = await evaluate(`(() => {
  const canvas = document.querySelector('canvas');
  if (!canvas) return { error: 'no canvas' };
  const keys = [
    'phase','ballState','ballOwner','ballX','ballY','ballZ','fps','averageFrameMs','rafLoops','sceneNodes','playerCount','colliderCount',
    'aerialReceptionTestsRequested','aerialReceptionTestsRemaining','aerialReceptionTestsPassed','aerialReceptionTestsFailed',
    'aerialFirstTouches','lastAerialFirstTouchType','lastAerialFirstTouchDistance','lastFirstTouchProbeType','lastFirstTouchProbeDistance','lastFirstTouchProbeRadius','aerialReceiverId','aerialReceiverX','aerialReceiverZ','aerialArrivalTime','aerialTouchPlan','aerialLandingX','aerialLandingZ',
    'defensiveDangerPhase','defendersInsideTwelve','outfieldInsideTwentyEight','nearCarrierDefenders','closeCarrierDefenders',
    'primaryPresserId','secondaryCoverId','deepestThreatId','deepestMarkerId','deepestMarkerDistance','deepestMarkerGoalSide',
    'dangerousUnmarkedCount','duplicateMarkCount','unassignedDefenderCount','laneBlockerCount','defensiveRoles','manualControlledHasAiRole',
    'collisionResolutionsThisFrame','maxCollisionCorrection','maxDefenderFrameDisplacement','abnormalMovementClamps','maxDefenderSpeed',
    'tackleTestsRequested','tackleTestsPassed','tackleTestsFailed','interceptionTestsRequested','interceptionTestsPassed','interceptionTestsFailed',
    'keeperHandsTestsRequested','keeperHandsTestsPassed','keeperHandsTestsFailed','keeperBuildupTestsRequested','keeperBuildupTestsPassed','keeperBuildupTestsFailed',
    'looseBallTestsRequested','looseBallTestsPassed','looseBallTestsFailed','lastLooseBallReactionMs',
    'loftedPassTestsRequested','loftedPassTestsPassed','loftedPassTestsFailed','goalMouthTestsRequested','goalMouthTestsPassed','goalMouthTestsFailed',
    'goalLineStallCorrections','mechanicsTest','mechanicsTestPassed','mechanicsCurve','mechanicsLift','mechanicsReceiver',
    'possessionClaims','lastReceived','aiPassesHome','aiPassesAway','aiThroughPassOpportunities','aiThroughPassSafeDecisions',
    'aiProgressiveThroughPasses','aiCurveOpportunities','aiCurveSelected','aiCurvedPasses','aiCurvedShots','curvedKicks',
    'activeEngineCount','canvasCount','resizeListenerCount','visibilityListenerCount','inputListenerSetCount','fullscreenListenerCount','p1Autopilot','physicsStepsPerFrame','timerCount','audioSourceCount',
    'rendererCalls','rendererTriangles','rendererGeometries','rendererTextures','rendererDpr','rendererPixels','restartCount','restartSeed','keeperTracking',
    'kickChargeSamples','kickFullChargeSeconds','buildupMidfieldOptions','buildupDefenderOptions','aggressiveCloserCount','pressRoleCount','coverRoleCount',
    'keeperClaimAttempts','keeperClaims','keeperSmothers','emergencyBlockAttempts','emergencyBlocks','postWinRecoveries','postWinAbandons',
    'blockedPassCancellations','blockedPassAlternatives','boxFinishingDecisions','contextualSkillAttempts','contextualSkillsTriggered',
    'emergencyBlockTestsRequested','emergencyBlockTestsPassed','emergencyBlockTestsFailed',
    'blockedPassTestsRequested','blockedPassTestsPassed','blockedPassTestsFailed',
    'boxFinishTestsRequested','boxFinishTestsPassed','boxFinishTestsFailed',
    'skillTestsRequested','skillTestsPassed','skillTestsFailed',
    'passIntentTestsRequested','passIntentTestsRemaining','passIntentTestsPassed','passIntentTestsFailed',
    'passIntentsCreated','passIntentsResolved','passIntentsAbandoned','passIntentReceiver','passIntentState','receiverMarkerCount',
    'attackingPossessionTeam','attackingPossessionSeconds','primaryGoalSideProgress','primaryLaneOffset','primaryPositionGoalSideProgress','primaryPositionLaneOffset',
    'centralRouteProtected','attackingMidfieldersFinalThird','attackingFullbacksAdvanced','attackingCenterBackLineProgress',
    'rendererCount','canvasBackingWidth','canvasBackingHeight','effectiveDpr','matchUpdatesThisFrame','matchGeneration','fullTimeHandled','fullTimeTransitions',
    'goalKickTestsRequested','goalKickTestsRemaining','goalKickCount','goalKickState','goalKickReceiver','goalKickKeeperTeam','goalKickTargetTeam',
    'goalKickTargetSlot','goalKickTargetLine','goalKickSafetyScore','goalKickTargetDistance','goalKickLaneBlockers','goalKickReceiverPressure',
    'goalKickLandingPressure','goalKickShapeOptions','goalKickShapeLeft','goalKickShapeCenter','goalKickShapeRight','goalKickSameTeamTargets',
    'goalKickTeamMismatches','goalKickEmptyTargets','goalKickReleaseY'
  ];
  const result = Object.fromEntries(keys.map((key) => [key, canvas.dataset[key] ?? null]));
  result.visibleButtons = [...document.querySelectorAll('button')]
    .filter((button) => button.offsetParent !== null)
    .map((button) => button.textContent?.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return result;
})()`);
const screenshotPath = process.env.SCREENSHOT_PATH;
if (screenshotPath) {
  const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
}
console.log(JSON.stringify({ url, mode, manualSamples, lifecycleSamples, diagnostics, screenshotPath: screenshotPath ?? null }, null, 2));
await send("Page.close");
socket.close();
process.exit(0);
