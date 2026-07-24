export type TeamSide = "home" | "away";
export type PlayerLine = "keeper" | "defender" | "midfielder" | "forward";
export type FormationKey = "4-2-3-1" | "4-3-3" | "4-4-2" | "3-5-2" | "3-2-4-1" | "3-2-2-3";
export type PreferredFoot = "left" | "right";
export type BodyPresetId = "balanced" | "tall" | "strong" | "quick" | "compact" | "agile";
export type TacticalRole =
  | "keeper"
  | "cover"
  | "stopper"
  | "wide-support"
  | "anchor"
  | "box-to-box"
  | "creator"
  | "runner"
  | "target"
  | "finisher";

export type FormationSlot = {
  slot: string;
  label: string;
  line: PlayerLine;
  x: number;
  z: number;
  defaultNumber: number;
};

export type AnonymousPlayerSetup = {
  id: string;
  slotId: string;
  position: string;
  shirtNumber: number;
  bodyPresetId: BodyPresetId;
  preferredFoot: PreferredFoot;
  roleTags: TacticalRole[];
};

export type TeamSetup = {
  name: string;
  formationId: FormationKey;
  playersBySlot: Record<string, AnonymousPlayerSetup>;
};

export type OfflineSettings = {
  version: 2;
  userTeam: TeamSetup;
  aiTeam: TeamSetup;
  homeColor: string;
  crowdVolume: number;
  commentaryVolume: number;
};

export type BodyPresetDefinition = {
  label: string;
  skin: string;
  hair: string;
  hairStyle: "short" | "buzz" | "curly";
  scale: [number, number, number];
  torsoWidth: number;
  shoulderWidth: number;
  legLength: number;
};

const slot = (
  name: string,
  line: PlayerLine,
  x: number,
  z: number,
  defaultNumber: number,
): FormationSlot => ({ slot: name, label: name, line, x, z, defaultNumber });

export const FORMATION_OPTIONS: Record<FormationKey, FormationSlot[]> = {
  "4-3-3": [
    slot("GK", "keeper", 0, 44, 1),
    slot("LB", "defender", -22, 34, 3),
    slot("LCB", "defender", -8, 34, 4),
    slot("RCB", "defender", 8, 34, 5),
    slot("RB", "defender", 22, 34, 2),
    slot("LCM", "midfielder", -15, 10, 6),
    slot("CM", "midfielder", 0, 10, 8),
    slot("RCM", "midfielder", 15, 10, 10),
    slot("LW", "forward", -17, -24, 7),
    slot("ST", "forward", 0, -24, 9),
    slot("RW", "forward", 17, -24, 11),
  ],
  "4-2-3-1": [
    slot("GK", "keeper", 0, 44, 1),
    slot("LB", "defender", -22, 34, 3),
    slot("LCB", "defender", -8, 34, 4),
    slot("RCB", "defender", 8, 34, 5),
    slot("RB", "defender", 22, 34, 2),
    slot("LDM", "midfielder", -9, 15, 6),
    slot("RDM", "midfielder", 9, 15, 8),
    slot("LW", "midfielder", -18, -6, 7),
    slot("CAM", "midfielder", 0, -8, 10),
    slot("RW", "midfielder", 18, -6, 11),
    slot("ST", "forward", 0, -27, 9),
  ],
  "4-4-2": [
    slot("GK", "keeper", 0, 44, 1),
    slot("LB", "defender", -22, 34, 3),
    slot("LCB", "defender", -8, 34, 4),
    slot("RCB", "defender", 8, 34, 5),
    slot("RB", "defender", 22, 34, 2),
    slot("LM", "midfielder", -22, 8, 7),
    slot("LCM", "midfielder", -7, 10, 6),
    slot("RCM", "midfielder", 7, 10, 8),
    slot("RM", "midfielder", 22, 8, 11),
    slot("LST", "forward", -8, -24, 9),
    slot("RST", "forward", 8, -24, 10),
  ],
  "3-5-2": [
    slot("GK", "keeper", 0, 44, 1),
    slot("LCB", "defender", -14, 34, 4),
    slot("CB", "defender", 0, 36, 5),
    slot("RCB", "defender", 14, 34, 2),
    slot("LWB", "midfielder", -25, 12, 3),
    slot("LCM", "midfielder", -10, 10, 6),
    slot("CDM", "midfielder", 0, 5, 8),
    slot("RCM", "midfielder", 10, 10, 10),
    slot("RWB", "midfielder", 25, 12, 11),
    slot("LST", "forward", -8, -24, 7),
    slot("RST", "forward", 8, -24, 9),
  ],
  "3-2-4-1": [
    slot("GK", "keeper", 0, 44, 1),
    slot("LCB", "defender", -14, 34, 4),
    slot("CB", "defender", 0, 36, 5),
    slot("RCB", "defender", 14, 34, 2),
    slot("LDM", "midfielder", -9, 17, 6),
    slot("RDM", "midfielder", 9, 17, 8),
    slot("LM", "midfielder", -24, -2, 7),
    slot("LAM", "midfielder", -8, -6, 10),
    slot("RAM", "midfielder", 8, -6, 11),
    slot("RM", "midfielder", 24, -2, 14),
    slot("ST", "forward", 0, -27, 9),
  ],
  "3-2-2-3": [
    slot("GK", "keeper", 0, 44, 1),
    slot("LCB", "defender", -14, 34, 4),
    slot("CB", "defender", 0, 36, 5),
    slot("RCB", "defender", 14, 34, 2),
    slot("LDM", "midfielder", -9, 17, 6),
    slot("RDM", "midfielder", 9, 17, 8),
    slot("LAM", "midfielder", -10, -3, 10),
    slot("RAM", "midfielder", 10, -3, 11),
    slot("LW", "forward", -19, -24, 7),
    slot("ST", "forward", 0, -28, 9),
    slot("RW", "forward", 19, -24, 14),
  ],
};

export const FORMATION_KEYS = Object.keys(FORMATION_OPTIONS) as FormationKey[];
export const BODY_PRESET_IDS: BodyPresetId[] = ["balanced", "tall", "strong", "quick", "compact", "agile"];

export const BODY_PRESETS: Record<BodyPresetId, BodyPresetDefinition> = {
  balanced: {
    label: "Balanced",
    skin: "#d6a47e",
    hair: "#2d1d15",
    hairStyle: "short",
    scale: [0.94, 0.94, 0.94],
    torsoWidth: 1,
    shoulderWidth: 0.24,
    legLength: 1,
  },
  tall: {
    label: "Tall",
    skin: "#e3b791",
    hair: "#3a2a20",
    hairStyle: "short",
    scale: [0.95, 1.02, 0.95],
    torsoWidth: 1.01,
    shoulderWidth: 0.25,
    legLength: 1.08,
  },
  strong: {
    label: "Strong",
    skin: "#9a6548",
    hair: "#1d1512",
    hairStyle: "buzz",
    scale: [0.98, 0.97, 0.98],
    torsoWidth: 1.1,
    shoulderWidth: 0.28,
    legLength: 1,
  },
  quick: {
    label: "Quick",
    skin: "#c78f69",
    hair: "#201713",
    hairStyle: "curly",
    scale: [0.92, 0.93, 0.92],
    torsoWidth: 0.96,
    shoulderWidth: 0.23,
    legLength: 1.03,
  },
  compact: {
    label: "Compact",
    skin: "#714732",
    hair: "#14110f",
    hairStyle: "short",
    scale: [0.91, 0.9, 0.91],
    torsoWidth: 1.02,
    shoulderWidth: 0.235,
    legLength: 0.95,
  },
  agile: {
    label: "Agile",
    skin: "#b77b57",
    hair: "#2a1c16",
    hairStyle: "buzz",
    scale: [0.92, 0.92, 0.92],
    torsoWidth: 0.94,
    shoulderWidth: 0.225,
    legLength: 0.99,
  },
};

const ROLES_BY_LINE: Record<PlayerLine, TacticalRole[]> = {
  keeper: ["keeper"],
  defender: ["cover", "stopper", "wide-support"],
  midfielder: ["anchor", "box-to-box", "creator", "runner"],
  forward: ["runner", "target", "finisher"],
};

export function roleOptionsForLine(line: PlayerLine) {
  return ROLES_BY_LINE[line];
}

function sanitizeName(value: unknown, fallback: string) {
  const cleaned = typeof value === "string"
    ? Array.from(value.trim().replace(/[<>\u0000-\u001f\u007f]/g, "")).slice(0, 18).join("")
    : "";
  return cleaned || fallback;
}

function isFormation(value: unknown): value is FormationKey {
  return typeof value === "string" && value in FORMATION_OPTIONS;
}

function isBodyPreset(value: unknown): value is BodyPresetId {
  return typeof value === "string" && BODY_PRESET_IDS.includes(value as BodyPresetId);
}

function lineRole(slotDefinition: FormationSlot, index = 0) {
  const roles = ROLES_BY_LINE[slotDefinition.line];
  if (slotDefinition.slot.includes("WB") || slotDefinition.slot === "LB" || slotDefinition.slot === "RB") return "wide-support" as TacticalRole;
  if (slotDefinition.slot.includes("DM")) return "anchor" as TacticalRole;
  if (slotDefinition.slot.includes("AM") || slotDefinition.slot === "CAM") return "creator" as TacticalRole;
  if (slotDefinition.line === "forward") return index % 2 === 0 ? "runner" : "finisher";
  return roles[index % roles.length];
}

function makeAnonymousPlayer(side: TeamSide, slotDefinition: FormationSlot, index: number): AnonymousPlayerSetup {
  return {
    id: `${side}-slot-${slotDefinition.slot}`,
    slotId: slotDefinition.slot,
    position: slotDefinition.label,
    shirtNumber: slotDefinition.defaultNumber,
    bodyPresetId: BODY_PRESET_IDS[index % BODY_PRESET_IDS.length],
    preferredFoot: slotDefinition.slot.startsWith("L") || slotDefinition.slot === "LW" ? "left" : "right",
    roleTags: [lineRole(slotDefinition, index)],
  };
}

export function createTeamSetup(side: TeamSide, name: string, formationId: FormationKey): TeamSetup {
  const playersBySlot = Object.fromEntries(
    FORMATION_OPTIONS[formationId].map((slotDefinition, index) => [
      slotDefinition.slot,
      makeAnonymousPlayer(side, slotDefinition, index),
    ]),
  );
  return { name: sanitizeName(name, side === "home" ? "Futbahl" : "Rivals"), formationId, playersBySlot };
}

export const DEFAULT_OFFLINE_SETTINGS: OfflineSettings = {
  version: 2,
  userTeam: createTeamSetup("home", "Futbahl", "4-3-3"),
  aiTeam: createTeamSetup("away", "Rivals", "4-3-3"),
  homeColor: "#38bdf8",
  crowdVolume: 0.45,
  commentaryVolume: 0,
};

function normalizePlayer(
  side: TeamSide,
  slotDefinition: FormationSlot,
  index: number,
  raw: unknown,
  usedNumbers: Set<number>,
): AnonymousPlayerSetup {
  const source = raw && typeof raw === "object" ? raw as Partial<AnonymousPlayerSetup> : {};
  let shirtNumber = Number.isInteger(source.shirtNumber) && Number(source.shirtNumber) >= 1 && Number(source.shirtNumber) <= 99
    ? Number(source.shirtNumber)
    : slotDefinition.defaultNumber;
  if (usedNumbers.has(shirtNumber)) {
    shirtNumber = slotDefinition.defaultNumber;
    while (usedNumbers.has(shirtNumber)) shirtNumber = shirtNumber % 99 + 1;
  }
  usedNumbers.add(shirtNumber);
  const allowedRoles = ROLES_BY_LINE[slotDefinition.line];
  const requestedRole = Array.isArray(source.roleTags) ? source.roleTags[0] : undefined;
  const role = requestedRole && allowedRoles.includes(requestedRole) ? requestedRole : lineRole(slotDefinition, index);
  return {
    id: `${side}-slot-${slotDefinition.slot}`,
    slotId: slotDefinition.slot,
    position: slotDefinition.label,
    shirtNumber,
    bodyPresetId: isBodyPreset(source.bodyPresetId) ? source.bodyPresetId : BODY_PRESET_IDS[index % BODY_PRESET_IDS.length],
    preferredFoot: source.preferredFoot === "left" ? "left" : "right",
    roleTags: [role],
  };
}

function normalizeTeam(raw: unknown, side: TeamSide, fallbackName: string, fallbackFormation: FormationKey): TeamSetup {
  const source = raw && typeof raw === "object" ? raw as Partial<TeamSetup> : {};
  const formationId = isFormation(source.formationId) ? source.formationId : fallbackFormation;
  const sourcePlayers = source.playersBySlot && typeof source.playersBySlot === "object" ? source.playersBySlot : {};
  const usedNumbers = new Set<number>();
  const playersBySlot = Object.fromEntries(FORMATION_OPTIONS[formationId].map((slotDefinition, index) => [
    slotDefinition.slot,
    normalizePlayer(side, slotDefinition, index, sourcePlayers[slotDefinition.slot], usedNumbers),
  ]));
  return {
    name: sanitizeName(source.name, fallbackName),
    formationId,
    playersBySlot,
  };
}

function legacyPlayersForFormation(source: Record<string, unknown>, formationId: FormationKey) {
  const legacyPlayers = source.selectedPlayersBySlot;
  if (!legacyPlayers || typeof legacyPlayers !== "object") return {};
  return Object.fromEntries(FORMATION_OPTIONS[formationId].flatMap((slotDefinition) => {
    const rawPlayer = (legacyPlayers as Record<string, unknown>)[slotDefinition.slot];
    if (!rawPlayer || typeof rawPlayer !== "object") return [];
    const legacyNumber = Number(
      (rawPlayer as Record<string, unknown>).shirtNumber
      ?? (rawPlayer as Record<string, unknown>).number,
    );
    return Number.isInteger(legacyNumber) && legacyNumber >= 1 && legacyNumber <= 99
      ? [[slotDefinition.slot, { shirtNumber: legacyNumber }]]
      : [];
  }));
}

export function normalizeOfflineSettings(value: unknown): OfflineSettings {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const legacyFormation = isFormation(source.formation) ? source.formation : "4-3-3";
  const legacyUserTeam = {
    name: source.userTeamName ?? source.homeTeamName,
    formationId: legacyFormation,
    playersBySlot: legacyPlayersForFormation(source, legacyFormation),
  };
  const userTeamSource = source.userTeam && typeof source.userTeam === "object"
    ? source.userTeam
    : legacyUserTeam;
  const aiTeamSource = source.aiTeam && typeof source.aiTeam === "object"
    ? source.aiTeam
    : {
        name: source.aiTeamName ?? source.awayTeamName,
        formationId: isFormation(source.aiFormation) ? source.aiFormation : "4-3-3",
        playersBySlot: {},
      };
  return {
    version: 2,
    userTeam: normalizeTeam(userTeamSource, "home", "Futbahl", legacyFormation),
    aiTeam: normalizeTeam(aiTeamSource, "away", "Rivals", "4-3-3"),
    homeColor: typeof source.homeColor === "string" && /^#[0-9a-f]{6}$/i.test(source.homeColor)
      ? source.homeColor
      : DEFAULT_OFFLINE_SETTINGS.homeColor,
    crowdVolume: Math.max(0, Math.min(1, Number(source.crowdVolume ?? DEFAULT_OFFLINE_SETTINGS.crowdVolume))),
    commentaryVolume: 0,
  };
}

export function changeFormation(team: TeamSetup, side: TeamSide, formationId: FormationKey): TeamSetup {
  const usedNumbers = new Set<number>();
  const playersBySlot = Object.fromEntries(FORMATION_OPTIONS[formationId].map((slotDefinition, index) => [
    slotDefinition.slot,
    normalizePlayer(side, slotDefinition, index, team.playersBySlot[slotDefinition.slot], usedNumbers),
  ]));
  return { ...team, formationId, playersBySlot };
}

function shuffle<T>(input: readonly T[], random = Math.random) {
  const result = [...input];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function randomizeTeam(team: TeamSetup, side: TeamSide, random = Math.random): TeamSetup {
  const slots = FORMATION_OPTIONS[team.formationId];
  const numberPool = shuffle(Array.from({ length: 99 }, (_, index) => index + 1), random);
  const presetPool = shuffle(BODY_PRESET_IDS, random);
  const playersBySlot = Object.fromEntries(slots.map((slotDefinition, index) => {
    const rolePool = shuffle(ROLES_BY_LINE[slotDefinition.line], random);
    const shirtNumber = slotDefinition.line === "keeper" ? 1 : numberPool.find((number) => number !== 1) ?? slotDefinition.defaultNumber;
    const numberIndex = numberPool.indexOf(shirtNumber);
    if (numberIndex >= 0) numberPool.splice(numberIndex, 1);
    return [slotDefinition.slot, {
      id: `${side}-slot-${slotDefinition.slot}`,
      slotId: slotDefinition.slot,
      position: slotDefinition.label,
      shirtNumber,
      bodyPresetId: presetPool[index % presetPool.length],
      preferredFoot: random() < 0.24 ? "left" : "right",
      roleTags: [rolePool[0] ?? lineRole(slotDefinition, index)],
    } satisfies AnonymousPlayerSetup];
  }));
  return { ...team, playersBySlot };
}

export function updateTeamName(team: TeamSetup, value: string, fallback: string): TeamSetup {
  return { ...team, name: sanitizeName(value, fallback) };
}

export function updatePlayerSetup(
  team: TeamSetup,
  slotId: string,
  patch: Partial<Pick<AnonymousPlayerSetup, "shirtNumber" | "bodyPresetId" | "preferredFoot" | "roleTags">>,
): TeamSetup {
  const current = team.playersBySlot[slotId];
  if (!current) return team;
  return {
    ...team,
    playersBySlot: {
      ...team.playersBySlot,
      [slotId]: { ...current, ...patch },
    },
  };
}

export function validateTeamSetup(team: TeamSetup) {
  const expectedSlots = FORMATION_OPTIONS[team.formationId];
  const players = expectedSlots.map((entry) => team.playersBySlot[entry.slot]).filter(Boolean);
  const numbers = players.map((player) => player.shirtNumber);
  const errors: string[] = [];
  if (!team.name.trim()) errors.push("Team name is required.");
  if (players.length !== 11) errors.push("Every formation slot must be filled.");
  if (expectedSlots.filter((entry) => entry.line === "keeper").length !== 1) errors.push("Formation must contain one goalkeeper.");
  if (numbers.some((number) => !Number.isInteger(number) || number < 1 || number > 99)) errors.push("Shirt numbers must be 1-99.");
  if (new Set(numbers).size !== numbers.length) errors.push("Shirt numbers must be unique within a team.");
  return { valid: errors.length === 0, errors };
}

export function runAnonymousSetupSelfTests(iterationsPerFormation = 100) {
  const failures: string[] = [];
  for (const formationId of FORMATION_KEYS) {
    for (let index = 0; index < iterationsPerFormation; index += 1) {
      const team = randomizeTeam(createTeamSetup("home", "Futbahl", formationId), "home");
      const result = validateTeamSetup(team);
      const players = Object.values(team.playersBySlot);
      const keepers = FORMATION_OPTIONS[formationId].filter((entry) => entry.line === "keeper");
      if (!result.valid || players.length !== 11 || keepers.length !== 1) {
        failures.push(`${formationId}:${index}:${result.errors.join("|")}`);
      }
    }
  }
  return { formations: FORMATION_KEYS.length, generated: FORMATION_KEYS.length * iterationsPerFormation, failures };
}
