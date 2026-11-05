import type { FactionId } from './types';
import { CROSSOVER_FACTIONS } from './crossover';
import { SANDBOX_FACTIONS } from './auFactions';

export interface FactionDoctrine {
  /** Preferred fraction of max weapon range to fight at (0.5 = close in). */
  preferredRangeFactor: number;
  /** Willingness to withdraw damaged ships (0 = never, 1 = eager). */
  withdrawThreshold: number;
  /** How strongly the fleet concentrates fire on one target. */
  focusFire: number;
  /** Weight for protecting high-value units. */
  protectCapitals: number;
  /** Weight for preferring the most dangerous enemy as target. */
  threatPriority: number;
  /** Weight for finishing damaged enemies. */
  finishWounded: number;
  /** Formation discipline 0..1 (how tightly ships hold station). */
  cohesion: number;
  /** Reaction / reassessment interval in seconds. */
  decisionInterval: number;
  /** Aggression 0..1: advance vs hold. */
  aggression: number;
}

export interface FactionDef {
  id: FactionId;
  name: string;
  shortName: string;
  /** Primary UI accent colour. */
  colour: string;
  colourHex: number;
  engineColourHex: number;
  /** Omitted for the original Mass Effect factions. */
  universe?: 'mass_effect' | 'halo' | 'warhammer40k' | 'terminator';
  /** Available in crossover sandbox battles, never ordinary campaign production. */
  sandboxOnly?: boolean;
  doctrine: FactionDoctrine;
  description: string;
  /** Lines used by the communications panel; chosen per event type. */
  comms: Record<CommsEvent, string[]>;
}

export type CommsEvent =
  | 'battle_start'
  | 'engage'
  | 'focus_fire'
  | 'ally_lost'
  | 'capital_lost'
  | 'enemy_capital_lost'
  | 'enemy_destroyed'
  | 'withdraw'
  | 'victory'
  | 'defeat'
  | 'heavy_losses'
  | 'fighters_launch';

export const FACTIONS: Record<FactionId, FactionDef> = {
  alliance: {
    id: 'alliance',
    name: 'Systems Alliance Navy',
    shortName: 'Alliance',
    colour: '#4fa3ff',
    colourHex: 0x4fa3ff,
    engineColourHex: 0x4fb8ff,
    doctrine: {
      preferredRangeFactor: 0.85,
      withdrawThreshold: 0.25,
      focusFire: 0.7,
      protectCapitals: 0.6,
      threatPriority: 0.6,
      finishWounded: 0.5,
      cohesion: 0.8,
      decisionInterval: 2.0,
      aggression: 0.55,
    },
    description:
      'Disciplined combined-arms navy. Fights in layered formations: dreadnoughts and cruisers deliver concentrated mass accelerator fire while frigates screen and carriers launch fighter strikes.',
    comms: {
      battle_start: [
        'All ships, this is fleet command. Weapons free. Hold formation and pick your targets.',
        'Fifth Fleet, battle stations. We hold this orbit.',
        'Firing solutions on the lead Reaper. Dreadnoughts, fire on my mark.',
      ],
      engage: [
        'Engaging. Main guns are hot.',
        'Target locked. Spinal gun firing.',
        'Frigate squadrons, screen the capital ships. Torpedoes on the destroyers.',
      ],
      focus_fire: [
        'All ships, concentrate fire on the lead Reaper.',
        'Converge fire on the designated target. Overload those barriers.',
        'Hit it with everything. Do not let up.',
      ],
      ally_lost: [
        'We lost the {ship}. Close the gap.',
        '{ship} is gone. Keep firing.',
        'Hull breach on the {ship}... no survivors. Hold the line.',
      ],
      capital_lost: [
        'The {ship} is breaking up! All ships, maintain fire!',
        'We just lost a dreadnought. Fleet, adjust formation and cover the gap.',
      ],
      enemy_capital_lost: [
        'Reaper capital ship destroyed! It can be done, people!',
        'Confirmed kill on a capital Reaper. Reload and re-target.',
      ],
      enemy_destroyed: [
        'Destroyer down. Next target.',
        'Good hits. Reaper unit neutralised.',
      ],
      withdraw: [
        'Fall back to the secondary line. Cover the damaged ships.',
        'Damaged units withdraw. The rest of you hold.',
      ],
      victory: ['Orbit secured. All ships report status.', 'That is a victory. Pass the word to Hackett.'],
      defeat: [
        'Fleet strength is gone. All surviving ships, break off and regroup at the rendezvous.',
        'We cannot hold. Get the survivors out.',
      ],
      heavy_losses: [
        'Losses are exceeding projections. We need more firepower on those capital ships.',
        'Fleet command, we are being cut to pieces out here.',
      ],
      fighters_launch: ['Carriers, launch all squadrons. Torpedo runs on the destroyers.'],
    },
  },
  turian: {
    id: 'turian',
    name: 'Turian Hierarchy Navy',
    shortName: 'Hierarchy',
    colour: '#7fd1e8',
    colourHex: 0x7fd1e8,
    engineColourHex: 0x9fe0ff,
    doctrine: {
      preferredRangeFactor: 0.75,
      withdrawThreshold: 0.12,
      focusFire: 0.8,
      protectCapitals: 0.5,
      threatPriority: 0.7,
      finishWounded: 0.6,
      cohesion: 0.95,
      decisionInterval: 1.8,
      aggression: 0.75,
    },
    description:
      'The largest conventional fleet in Citadel space. Rigid formations, aggressive closure, and a strong dreadnought line.',
    comms: {
      battle_start: ['Maintain formation. Hold the line.', 'Hierarchy fleet, advance in echelon. Fire when in range.'],
      engage: ['Firing. Target acquired.', 'Spinal batteries engaging.'],
      focus_fire: ['Concentrate fire. Bring down the lead unit.'],
      ally_lost: ['{ship} destroyed. Close ranks.'],
      capital_lost: ['Dreadnought lost. Hold the line regardless.'],
      enemy_capital_lost: ['Reaper destroyed. For Palaven.'],
      enemy_destroyed: ['Target destroyed.'],
      withdraw: ['Damaged units withdraw by squadron.'],
      victory: ['The orbit is ours.'],
      defeat: ['Fleet combat-ineffective. Withdraw to the relay.'],
      heavy_losses: ['Losses are heavy. Keep firing.'],
      fighters_launch: ['Launch interceptors.'],
    },
  },
  asari: {
    id: 'asari',
    name: 'Asari Republics',
    shortName: 'Asari',
    colour: '#c08cff',
    colourHex: 0xc08cff,
    engineColourHex: 0xd0a8ff,
    doctrine: {
      preferredRangeFactor: 0.9,
      withdrawThreshold: 0.3,
      focusFire: 0.6,
      protectCapitals: 0.8,
      threatPriority: 0.6,
      finishWounded: 0.4,
      cohesion: 0.7,
      decisionInterval: 1.6,
      aggression: 0.45,
    },
    description: 'Technologically advanced fleets built around a few very powerful dreadnoughts.',
    comms: {
      battle_start: ['Republic fleet, engage at range.'],
      engage: ['Firing.'],
      focus_fire: ['Focus fire.'],
      ally_lost: ['{ship} lost.'],
      capital_lost: ['We have lost a dreadnought.'],
      enemy_capital_lost: ['The Reaper is destroyed.'],
      enemy_destroyed: ['Target neutralised.'],
      withdraw: ['Withdraw damaged vessels.'],
      victory: ['Thessia holds.'],
      defeat: ['Retreat.'],
      heavy_losses: ['Losses mounting.'],
      fighters_launch: ['Launch fighters.'],
    },
  },
  salarian: {
    id: 'salarian',
    name: 'Salarian Union',
    shortName: 'Salarian',
    colour: '#9fe08c',
    colourHex: 0x9fe08c,
    engineColourHex: 0xb8ffa0,
    doctrine: {
      preferredRangeFactor: 0.95,
      withdrawThreshold: 0.4,
      focusFire: 0.5,
      protectCapitals: 0.5,
      threatPriority: 0.8,
      finishWounded: 0.7,
      cohesion: 0.6,
      decisionInterval: 1.2,
      aggression: 0.35,
    },
    description: 'Intelligence-led precision strikes and electronic warfare.',
    comms: {
      battle_start: ['STG assets in position. Engage on data.'],
      engage: ['Firing.'],
      focus_fire: ['Focus on the identified weak point.'],
      ally_lost: ['{ship} lost.'],
      capital_lost: ['Capital unit lost.'],
      enemy_capital_lost: ['Reaper destroyed. Logging data.'],
      enemy_destroyed: ['Target eliminated.'],
      withdraw: ['Withdraw.'],
      victory: ['Objective achieved.'],
      defeat: ['Disengage.'],
      heavy_losses: ['Unsustainable losses.'],
      fighters_launch: ['Launch.'],
    },
  },
  quarian: {
    id: 'quarian',
    name: 'Quarian Migrant Fleet',
    shortName: 'Quarian',
    colour: '#f0d08c',
    colourHex: 0xf0d08c,
    engineColourHex: 0xffe0a0,
    doctrine: {
      preferredRangeFactor: 0.8,
      withdrawThreshold: 0.35,
      focusFire: 0.6,
      protectCapitals: 1.0,
      threatPriority: 0.5,
      finishWounded: 0.5,
      cohesion: 0.7,
      decisionInterval: 2.2,
      aggression: 0.4,
    },
    description: 'Fifty thousand ships, most of them civilian hulls pressed into service. Above all, protect the liveships.',
    comms: {
      battle_start: ['Heavy Fleet, screen the liveships.'],
      engage: ['Engaging.'],
      focus_fire: ['Concentrate fire.'],
      ally_lost: ['{ship} lost.'],
      capital_lost: ['We have lost a heavy ship.'],
      enemy_capital_lost: ['Reaper destroyed.'],
      enemy_destroyed: ['Target down.'],
      withdraw: ['Withdraw to the liveships.'],
      victory: ['Keelah se’lai.'],
      defeat: ['Retreat.'],
      heavy_losses: ['Losses heavy.'],
      fighters_launch: ['Launch fighters.'],
    },
  },
  geth: {
    id: 'geth',
    name: 'Geth Consensus',
    shortName: 'Geth',
    colour: '#d8e6ff',
    colourHex: 0xd8e6ff,
    engineColourHex: 0xe8f0ff,
    doctrine: {
      preferredRangeFactor: 0.8,
      withdrawThreshold: 0.1,
      focusFire: 0.9,
      protectCapitals: 0.5,
      threatPriority: 0.8,
      finishWounded: 0.8,
      cohesion: 0.95,
      decisionInterval: 0.6,
      aggression: 0.6,
    },
    description: 'Networked synthetic fleet: instant coordination and perfectly disciplined fire distribution.',
    comms: {
      battle_start: ['Consensus achieved. Engaging.'],
      engage: ['Firing.'],
      focus_fire: ['Fire distribution optimised.'],
      ally_lost: ['Platform lost.'],
      capital_lost: ['Dreadnought platform lost.'],
      enemy_capital_lost: ['Old Machine destroyed.'],
      enemy_destroyed: ['Target neutralised.'],
      withdraw: ['Repositioning.'],
      victory: ['Objective complete.'],
      defeat: ['Withdrawing.'],
      heavy_losses: ['Losses exceed model.'],
      fighters_launch: ['Launching.'],
    },
  },
  cerberus: {
    id: 'cerberus',
    name: 'Cerberus',
    shortName: 'Cerberus',
    colour: '#ff9a3c',
    colourHex: 0xff9a3c,
    engineColourHex: 0xffb060,
    doctrine: {
      preferredRangeFactor: 0.8,
      withdrawThreshold: 0.2,
      focusFire: 0.8,
      protectCapitals: 0.6,
      threatPriority: 0.7,
      finishWounded: 0.7,
      cohesion: 0.75,
      decisionInterval: 1.5,
      aggression: 0.7,
    },
    description: 'Human-supremacist paramilitary with advanced, specialised vessels and aggressive doctrine.',
    comms: {
      battle_start: ['Targeting solutions confirmed. Engage.'],
      engage: ['Firing.'],
      focus_fire: ['Concentrate fire on the priority target.'],
      ally_lost: ['{ship} lost.'],
      capital_lost: ['We have lost a capital ship.'],
      enemy_capital_lost: ['Target destroyed. Humanity endures.'],
      enemy_destroyed: ['Target eliminated.'],
      withdraw: ['Withdraw.'],
      victory: ['Objective complete. The Illusive Man will be pleased.'],
      defeat: ['Abort. Withdraw all assets.'],
      heavy_losses: ['Losses are unacceptable.'],
      fighters_launch: ['Launch fighters.'],
    },
  },
  reaper: {
    id: 'reaper',
    name: 'Reaper Harvest Fleet',
    shortName: 'Reapers',
    colour: '#ff3b2f',
    colourHex: 0xff3b2f,
    engineColourHex: 0xff2a1a,
    doctrine: {
      preferredRangeFactor: 0.7,
      withdrawThreshold: 0.0,
      focusFire: 0.85,
      protectCapitals: 0.2,
      threatPriority: 0.9,
      finishWounded: 0.3,
      cohesion: 0.9,
      decisionInterval: 0.8,
      aggression: 0.95,
    },
    description:
      'Ancient synthetic-organic capital ships with overwhelming technological superiority. They advance, kill the most dangerous threats first, and never withdraw.',
    comms: {
      battle_start: ['Organic resistance detected. Harvest proceeding.', 'Your fleets are insignificant. We are the harbinger of your ascendance.'],
      engage: ['Target designated. Terminating.', 'Resistance is irrelevant.'],
      focus_fire: ['Concentrating on primary threat.'],
      ally_lost: ['A unit has been lost. Unexpected.'],
      capital_lost: ['Capital unit destroyed. Organic resistance exceeds projected parameters.'],
      enemy_capital_lost: ['Organic capital ship eliminated. Harvest within parameters.'],
      enemy_destroyed: ['Organic vessel destroyed.'],
      withdraw: ['Repositioning. We do not retreat.'],
      victory: ['Resistance eliminated. The harvest continues.'],
      defeat: ['This outcome is... unanticipated. We will adapt.'],
      heavy_losses: ['Organic military development requires strategic re-evaluation.'],
      fighters_launch: ['Insignificant craft detected.'],
    },
  },
  ...CROSSOVER_FACTIONS,
  ...SANDBOX_FACTIONS,
};

export const getFaction = (id: FactionId): FactionDef => FACTIONS[id];
