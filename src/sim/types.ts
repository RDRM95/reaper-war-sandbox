export type Side = 'A' | 'B';
export type Faction = 'alliance' | 'cerberus' | 'reaper';
export type Silhouette = 'dreadnought' | 'cruiser' | 'frigate' | 'normandy' | 'valkyrie' | 'cerberus' | 'cerberus-capital' | 'cerberus-frigate' | 'reaper' | 'harbinger' | 'destroyer' | 'oculus';
export type WeaponKind = 'mac' | 'beam' | 'missile' | 'hades' | 'nova' | 'point';
export interface Weapon {kind: WeaponKind; name: string; damage: number; range: number; cooldown: number; pierce?: number; shieldMult?: number;}
export interface ShipSpec {
  id: string; name: string; faction: Faction; silhouette: Silhouette;
  role: 'capital' | 'line' | 'escort' | 'fighter';
  hp: number; shield: number; shieldRegen: number; speed: number; size: number;
  weapons: Weapon[]; description: string;
}
export interface Ship {
  id: number; spec: ShipSpec; side: Side; name: string;
  x: number; y: number; z: number; heading: number;
  vx: number; vy: number; hp: number; shield: number;
  lastHit: number; target: number | null; retargetAt: number;
  ready: number[]; wing: number; alive: boolean; kills: number;
}
export interface Shot {
  id: number; sx: number; sy: number; sz: number; ex: number; ey: number; ez: number;
  age: number; duration: number; kind: WeaponKind; side: Side; sourceId: number; targetId: number;
}
export interface Explosion {x: number; y: number; z: number; age: number; duration: number; size: number; side: Side;}
export interface BattleEvent {time: number; kind: 'kill'|'fire'|'start'|'finish'; message: string; side?: Side;}
export interface BattleStats {deployed: number; destroyed: number; capitalsLost: number; damageDone: number;}
export type Fleet = Record<string, number>;
export interface BattleConfig {a: Fleet; b: Fleet; seed: number;}
