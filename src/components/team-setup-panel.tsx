"use client";

import { useMemo, useState } from "react";
import {
  BODY_PRESETS,
  BODY_PRESET_IDS,
  FORMATION_KEYS,
  FORMATION_OPTIONS,
  changeFormation,
  randomizeTeam,
  roleOptionsForLine,
  updatePlayerSetup,
  updateTeamName,
  validateTeamSetup,
  type OfflineSettings,
  type TeamSetup,
  type TeamSide,
} from "@/lib/anonymous-team-setup";

type TeamSetupPanelProps = {
  settings: OfflineSettings;
  onChange: (settings: OfflineSettings) => void;
};

type Selection = { side: TeamSide; slotId: string } | null;

const sideTitle = (side: TeamSide) => side === "home" ? "Our Team" : "AI Team";

function teamForSide(settings: OfflineSettings, side: TeamSide) {
  return side === "home" ? settings.userTeam : settings.aiTeam;
}

function replaceTeam(settings: OfflineSettings, side: TeamSide, team: TeamSetup): OfflineSettings {
  return side === "home" ? { ...settings, userTeam: team } : { ...settings, aiTeam: team };
}

function FormationBoard({
  team,
  side,
  selected,
  onSelect,
}: {
  team: TeamSetup;
  side: TeamSide;
  selected: Selection;
  onSelect: (selection: Selection) => void;
}) {
  const validation = validateTeamSetup(team);
  const duplicateNumbers = new Set<number>();
  const seenNumbers = new Set<number>();
  Object.values(team.playersBySlot).forEach((player) => {
    if (seenNumbers.has(player.shirtNumber)) duplicateNumbers.add(player.shirtNumber);
    seenNumbers.add(player.shirtNumber);
  });

  return (
    <div>
      <div className="relative h-72 overflow-hidden rounded-md border border-emerald-100/20 bg-[#0d5b35] shadow-inner">
        <div className="absolute inset-[5%] border border-white/20" />
        <div className="absolute left-1/2 top-[5%] h-[90%] w-px -translate-x-1/2 bg-white/15" />
        <div className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15" />
        {FORMATION_OPTIONS[team.formationId].map((formationSlot) => {
          const player = team.playersBySlot[formationSlot.slot];
          const left = Math.max(8, Math.min(92, 50 + (formationSlot.x / 28) * 42));
          const top = Math.max(8, Math.min(92, 50 + (formationSlot.z / 52) * 42));
          const active = selected?.side === side && selected.slotId === formationSlot.slot;
          const duplicate = player ? duplicateNumbers.has(player.shirtNumber) : false;
          return (
            <button
              key={formationSlot.slot}
              type="button"
              className={`absolute min-h-12 min-w-14 -translate-x-1/2 -translate-y-1/2 border px-2 py-1 text-center text-[10px] font-black uppercase text-white transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 ${
                active
                  ? "border-cyan-100 bg-cyan-300 text-slate-950"
                  : duplicate
                    ? "border-rose-200 bg-rose-600"
                    : formationSlot.line === "keeper"
                      ? "border-amber-100/80 bg-amber-500/90"
                      : side === "home"
                        ? "border-white/60 bg-sky-500/90"
                        : "border-white/60 bg-rose-600/90"
              }`}
              style={{ left: `${left}%`, top: `${top}%` }}
              onClick={() => onSelect({ side, slotId: formationSlot.slot })}
              aria-label={`Edit ${sideTitle(side)} ${formationSlot.label}`}
            >
              <span className="block">{formationSlot.label}</span>
              <span className="mt-0.5 block text-sm leading-none">{player?.shirtNumber ?? "!"}</span>
            </button>
          );
        })}
      </div>
      {!validation.valid && (
        <p className="mt-2 text-xs font-bold text-rose-200">{validation.errors.join(" ")}</p>
      )}
    </div>
  );
}

export function TeamSetupPanel({ settings, onChange }: TeamSetupPanelProps) {
  const [selected, setSelected] = useState<Selection>(null);
  const selectedTeam = selected ? teamForSide(settings, selected.side) : null;
  const selectedPlayer = selectedTeam && selected ? selectedTeam.playersBySlot[selected.slotId] : null;
  const selectedFormationSlot = selectedTeam && selected
    ? FORMATION_OPTIONS[selectedTeam.formationId].find((entry) => entry.slot === selected.slotId) ?? null
    : null;
  const validation = useMemo(() => ({
    home: validateTeamSetup(settings.userTeam),
    away: validateTeamSetup(settings.aiTeam),
  }), [settings]);

  const updateSide = (side: TeamSide, transform: (team: TeamSetup) => TeamSetup) => {
    onChange(replaceTeam(settings, side, transform(teamForSide(settings, side))));
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-2">
        {(["home", "away"] as TeamSide[]).map((side) => {
          const team = teamForSide(settings, side);
          return (
            <section key={side} className="rounded-md border border-white/10 bg-white/[0.045] p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <label className="min-w-0 flex-1 text-xs font-black uppercase text-white/60">
                  {sideTitle(side)}
                  <input
                    value={team.name}
                    maxLength={18}
                    className="mt-1 w-full rounded border border-white/15 bg-black/25 px-3 py-2 text-base font-black normal-case text-white outline-none focus:border-cyan-200"
                    onChange={(event) => updateSide(side, (current) => updateTeamName(current, event.target.value, side === "home" ? "Futbol" : "Rivals"))}
                    aria-label={`${sideTitle(side)} name`}
                  />
                </label>
                <button
                  type="button"
                  className="rounded border border-white/15 bg-white/5 px-3 py-2 text-xs font-black uppercase text-white hover:bg-white/10"
                  onClick={() => updateSide(side, (current) => randomizeTeam(current, side))}
                >
                  Randomize
                </button>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {FORMATION_KEYS.map((formationId) => (
                  <button
                    key={formationId}
                    type="button"
                    className={`rounded border px-2 py-2 text-[11px] font-black ${
                      team.formationId === formationId
                        ? "border-emerald-100 bg-emerald-300 text-slate-950"
                        : "border-white/15 bg-white/5 text-white/75 hover:bg-white/10"
                    }`}
                    onClick={() => {
                      updateSide(side, (current) => changeFormation(current, side, formationId));
                      setSelected(null);
                    }}
                  >
                    {formationId}
                  </button>
                ))}
              </div>

              <div className="mt-4">
                <FormationBoard team={team} side={side} selected={selected} onSelect={setSelected} />
              </div>
            </section>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.045] p-4">
        <div className="text-xs font-bold text-white/60">
          {validation.home.valid && validation.away.valid ? "Both anonymous squads are valid: 11 players and unique numbers." : "Fix the highlighted team validation before kickoff."}
        </div>
        <button
          type="button"
          className="rounded bg-cyan-300 px-4 py-2 text-xs font-black uppercase text-slate-950 hover:bg-cyan-200"
          onClick={() => onChange({
            ...settings,
            userTeam: randomizeTeam(settings.userTeam, "home"),
            aiTeam: randomizeTeam(settings.aiTeam, "away"),
          })}
        >
          Randomize both teams
        </button>
      </div>

      {selected && selectedTeam && selectedPlayer && selectedFormationSlot && (
        <section className="rounded-md border border-cyan-100/20 bg-[#091a17] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black uppercase text-cyan-200/70">{sideTitle(selected.side)} · Anonymous player</div>
              <h3 className="mt-1 text-xl font-black">{selectedFormationSlot.label} · #{selectedPlayer.shirtNumber}</h3>
            </div>
            <button type="button" className="rounded border border-white/15 px-3 py-2 text-xs font-black" onClick={() => setSelected(null)}>Close</button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-xs font-black uppercase text-white/55">
              Position
              <input value={selectedFormationSlot.label} readOnly className="mt-1 w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-white/75" />
            </label>
            <label className="text-xs font-black uppercase text-white/55">
              Shirt number
              <input
                type="number"
                min="1"
                max="99"
                value={selectedPlayer.shirtNumber}
                className="mt-1 w-full rounded border border-white/15 bg-black/25 px-3 py-2 text-white outline-none focus:border-cyan-200"
                onChange={(event) => updateSide(selected.side, (current) => updatePlayerSetup(current, selected.slotId, {
                  shirtNumber: Math.max(1, Math.min(99, Math.trunc(Number(event.target.value) || 1))),
                }))}
              />
            </label>
            <label className="text-xs font-black uppercase text-white/55">
              Body preset
              <select
                value={selectedPlayer.bodyPresetId}
                className="mt-1 w-full rounded border border-white/15 bg-[#0c1815] px-3 py-2 text-white"
                onChange={(event) => updateSide(selected.side, (current) => updatePlayerSetup(current, selected.slotId, {
                  bodyPresetId: event.target.value as typeof selectedPlayer.bodyPresetId,
                }))}
              >
                {BODY_PRESET_IDS.map((presetId) => <option key={presetId} value={presetId}>{BODY_PRESETS[presetId].label}</option>)}
              </select>
            </label>
            <label className="text-xs font-black uppercase text-white/55">
              Preferred foot
              <select
                value={selectedPlayer.preferredFoot}
                className="mt-1 w-full rounded border border-white/15 bg-[#0c1815] px-3 py-2 text-white"
                onChange={(event) => updateSide(selected.side, (current) => updatePlayerSetup(current, selected.slotId, {
                  preferredFoot: event.target.value === "left" ? "left" : "right",
                }))}
              >
                <option value="right">Right</option>
                <option value="left">Left</option>
              </select>
            </label>
            <label className="text-xs font-black uppercase text-white/55">
              Role
              <select
                value={selectedPlayer.roleTags[0]}
                className="mt-1 w-full rounded border border-white/15 bg-[#0c1815] px-3 py-2 text-white"
                onChange={(event) => updateSide(selected.side, (current) => updatePlayerSetup(current, selected.slotId, {
                  roleTags: [event.target.value as typeof selectedPlayer.roleTags[number]],
                }))}
              >
                {roleOptionsForLine(selectedFormationSlot.line).map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            </label>
          </div>
        </section>
      )}
    </div>
  );
}
