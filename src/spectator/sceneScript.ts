import type { BattleConfig, Environment, FleetSpec, Side } from '@/simulation/types';
import { SHIP_CLASS_LIST } from '@/data/ships';

/** A scene is a shot list over a REAL deterministic battle, never a canned animation. */
export type SceneShot = 'wide' | 'cinematic' | 'follow' | 'reaper';
/** All modes use the same simulated ships and event timeline. */
export type ScenePresentation = 'directed' | 'continuous_pov' | 'explore';
export interface SceneBeat {
  at: number;
  shot: SceneShot;
  side?: Side;
  caption: string;
}
export interface SceneWave {
  at: number;
  side: Side;
  name: string;
  ships: Record<string, number>;
}
export interface SceneScript {
  title: string;
  environment?: Environment;
  beats: SceneBeat[];
  waves: SceneWave[];
  /** Director switches shots; POV pins a real gun; Explore never forces cuts. */
  presentation?: ScenePresentation;
  /** Optional primary-battery POV anchor, validated against the starting roster. */
  pov?: { side: Side; classId?: string };
}
const ENVIRONMENTS: readonly string[] = [
  'earth_orbit', 'palaven_orbit', 'thessia_orbit', 'rannoch_orbit',
  'surkesh_orbit', 'citadel', 'deep_space', 'relay',
];
const SHOTS: readonly string[] = ['wide', 'cinematic', 'follow', 'reaper'];
const PRESENTATIONS: readonly string[] = ['directed', 'continuous_pov', 'explore'];
const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const isSide = (x: unknown): x is Side => x === 'A' || x === 'B';
const cueTime = (x: unknown, label: string): number => {
  if (typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 3600)
    throw new Error(label + ' must be between 0 and 3600 seconds.');
  return x;
};
const brief = (x: unknown, fallback: string, max: number): string => {
  if (x === undefined) return fallback;
  if (typeof x !== 'string' || x.length > max) throw new Error('Invalid scene title or caption.');
  return x.trim();
};

/** Parse untrusted user-authored JSON: no eval, no arbitrary code execution. */
export function parseSceneScript(raw: string): SceneScript {
  if (raw.length > 32_000) throw new Error('Script is too large (32 KB maximum).');
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value)) throw new Error('Script must be one JSON object.');
  if (!Array.isArray(value.beats) || value.beats.length < 1 || value.beats.length > 64)
    throw new Error('Provide 1–64 timed camera beats.');
  if (value.waves !== undefined && (!Array.isArray(value.waves) || value.waves.length > 16))
    throw new Error('At most 16 reinforcement waves are permitted.');
  const presentation = value.presentation ?? 'directed';
  if (typeof presentation !== 'string' || !PRESENTATIONS.includes(presentation))
    throw new Error('Unknown scene presentation (directed, continuous_pov or explore).');
  let pov: SceneScript['pov'];
  if (value.pov !== undefined) {
    if (!isRecord(value.pov) || !isSide(value.pov.side))
      throw new Error('POV must specify side A or B.');
    if (value.pov.classId !== undefined &&
      (typeof value.pov.classId !== 'string' || !SHIP_CLASS_LIST.some(s => s.id === value.pov.classId)))
      throw new Error('Unknown ship class for POV.');
    pov = { side: value.pov.side, classId: value.pov.classId as string | undefined };
  }
  const environment = value.environment;
  if (environment !== undefined && (typeof environment !== 'string' || !ENVIRONMENTS.includes(environment)))
    throw new Error('Unknown battle environment.');
  const beats: SceneBeat[] = value.beats.map((beat: unknown, i: number): SceneBeat => {
    if (!isRecord(beat)) throw new Error('Beat ' + (i + 1) + ' must be an object.');
    const at = cueTime(beat.at, 'Beat ' + (i + 1));
    if (!SHOTS.includes(String(beat.shot))) throw new Error('Unknown camera shot in beat ' + (i + 1));
    if (beat.side !== undefined && !isSide(beat.side)) throw new Error('Beat side must be A or B.');
    return {
      at,
      shot: beat.shot as SceneShot,
      side: isSide(beat.side) ? beat.side : undefined,
      caption: brief(beat.caption, '', 150),
    };
  });
  beats.sort((a, b) => a.at - b.at);
  if (beats[0].at !== 0) throw new Error('First camera beat must begin at 0 seconds.');
  const waves: SceneWave[] = (value.waves ?? []).map((wave: unknown, i: number): SceneWave => {
    if (!isRecord(wave) || !isSide(wave.side) || !isRecord(wave.ships))
      throw new Error('Wave ' + (i + 1) + ' needs side A or B and a ships object.');
    const at = cueTime(wave.at, 'Wave ' + (i + 1));
    if (at < 1) throw new Error('Reinforcements must arrive after battle start.');
    const ships: Record<string, number> = {};
    for (const [id, count] of Object.entries(wave.ships)) {
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 0 || count > 5000)
        throw new Error('Wave ship counts must be integers from 0 to 5000.');
      if (count > 0) ships[id] = count;
    }
    if (!Object.keys(ships).length) throw new Error('Wave ' + (i + 1) + ' has no vessels.');
    return { at, side: wave.side, name: brief(wave.name, 'Incoming reinforcements', 80), ships };
  });
  if (waves.reduce((sum, w) => sum + Object.values(w.ships).reduce((a, b) => a + b, 0), 0) > 12_000)
    throw new Error('Script may add no more than 12,000 reinforcement hulls.');
  return {
    title: brief(value.title, 'Untitled engagement', 90),
    environment: environment as Environment | undefined,
    beats,
    waves: waves.sort((a, b) => a.at - b.at),
    presentation: presentation as ScenePresentation,
    pov,
  };
}

/** Add regular delayed FleetSpec deployments to the authoritative battle config. */
export function stageSceneConfig(base: BattleConfig, script: SceneScript): BattleConfig {
  if (script.presentation === 'continuous_pov') {
    const side = script.pov?.side ?? base.perspectiveSide;
    if (!base.fleets.some(f => f.side === side && (f.arrivalTime ?? 0) === 0 &&
      f.ships.some(ship => ship.count > 0 && (!script.pov?.classId || script.pov.classId === ship.classId))))
      throw new Error('The selected POV ship is absent from the starting fleet on side ' + side + '.');
  }
  const additional: FleetSpec[] = script.waves.map((wave, i) => {
    const parent = base.fleets.find(f => f.side === wave.side && (f.arrivalTime ?? 0) === 0);
    if (!parent) throw new Error('No starting fleet exists for side ' + wave.side);
    const ships = Object.entries(wave.ships).map(([classId, count]) => {
      const cls = SHIP_CLASS_LIST.find(s => s.id === classId);
      if (!cls || cls.faction !== parent.faction)
        throw new Error(classId + ' does not belong to side ' + wave.side + ' faction ' + parent.faction);
      return { classId, count };
    });
    return {
      ...parent,
      id: 'scene-wave-' + wave.side + '-' + i,
      name: wave.name,
      ships,
      arrivalTime: wave.at,
      // Dedicated arrival lanes rather than stacking on the starting fleet.
      position: { x: parent.position.x + (i % 3 - 1) * 14,
        y: parent.position.y + (i % 4 - 1.5) * 5,
        z: parent.position.z + (wave.side === 'A' ? -1 : 1) * (25 + i * 8) },
      heading: { ...parent.heading },
    };
  });
  return { ...base, name: script.title, environment: script.environment ?? base.environment,
    maxDuration: Math.max(base.maxDuration, script.beats[script.beats.length - 1].at + 30,
      ...script.waves.map(w => w.at + 45)),
    fleets: [...base.fleets, ...additional] };
}

export const DEFAULT_SCENE_SCRIPT = JSON.stringify({
  title: 'Charon Relay — Interception',
  environment: 'relay',
  beats: [
    { at: 0, shot: 'wide', caption: 'CHARON RELAY / OUTER SYSTEM' },
    { at: 14, shot: 'follow', side: 'A', caption: 'ALLIANCE BATTLE GROUP / APPROACH' },
    { at: 34, shot: 'reaper', side: 'B', caption: 'REAPER CONTACT / MULTIPLE CAPITAL SIGNATURES' },
    { at: 55, shot: 'cinematic', caption: 'WEAPONS FREE / AUTONOMOUS ENGAGEMENT' },
    { at: 80, shot: 'follow', side: 'A', caption: 'REINFORCEMENTS INBOUND' },
    { at: 115, shot: 'wide', caption: 'SITUATION DEVELOPING' },
    { at: 155, shot: 'cinematic', caption: '' },
  ],
  waves: [
    { at: 75, side: 'A', name: 'Alliance reserve squadron', ships: { alliance_frigate: 12 } },
    { at: 95, side: 'B', name: 'Reaper second wave', ships: { reaper_destroyer: 8 } },
  ],
}, null, 2);
