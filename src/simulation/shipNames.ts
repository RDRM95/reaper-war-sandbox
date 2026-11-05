import type { ShipRole } from '@/data/types';

/** Original procedural names and callsigns in each faction's naming style.
 * These are presentation labels, not a canonical roster. This module must not
 * import or consume the battle RNG: naming cannot change combat outcomes. */
interface NameStyle {
  prefix: string;
  first: readonly string[];
  last: readonly string[];
  qualifiers: readonly string[];
  seeds: readonly string[];
  fighterPrefix: string;
}

const words = (value: string): string[] => value.split('|');
const style = (prefix: string, first: string, last: string, qualifiers: string, seeds = '', fighterPrefix = prefix): NameStyle => ({
  prefix, first: words(first), last: words(last), qualifiers: words(qualifiers), seeds: seeds ? words(seeds) : [], fighterPrefix,
});

const STYLES: Record<string, NameStyle> = {
  alliance: style('SSV',
    'Resolute|Valiant|Steadfast|Distant|Gallant|Bright|Unbroken|Dauntless|Silent|Golden|Free|Patient|Lasting|Stalwart|Vigilant|Rising',
    'Horizon|Sentinel|Promise|Beacon|Concord|Venture|Meridian|Dawn|Aegis|Endeavour|Pioneer|Voyager|Bastion|Liberty|Haven|Resolve',
    'Sol|Europa|Arcturus|Terra|Elysium|Dawn|Meridian|Hope|Orion|Aurora|Concord|Horizon|Vigilance|Valor|Unity|Liberty',
    'Arcadia|Borealis|Valencia|Odessa|Antioch|Annapurna|Aoraki|Sagan|Lovelace|Noether|Turing|Leviathan', 'Alliance'),
  turian: style('PFS',
    'Unyielding|Adamant|Resolute|Iron|Vigilant|Disciplined|Unbroken|Honoured|Valorous|Steadfast|Indomitable|Dauntless|Ardent|Stalwart|Sovereign|Victorious',
    'Bastion|Rampart|Oath|Vanguard|Sentinel|Spear|Legion|Bulwark|Mandate|Shield|Triumph|Watch|Standard|Aegis|Resolve|Citadel',
    'Palaven|Menae|Cipritine|Taetrus|Digeris|Macedyn|Duty|Victory|Honour|Concord|Vigilance|Service|Iron|Dawn|Resolve|Unity',
    'Invicta|Aurelius|Varenus|Praetorian|Honourbound|Menae Guard', 'Hierarchy'),
  asari: style('',
    'Azure|Luminous|Serene|Silver|Starlit|Radiant|Eternal|Harmonious|Gentle|Sapphire|Twilight|Celestial|Graceful|Violet|Dawning|Singing',
    'Reverie|Concord|Tide|Grace|Promise|Memory|Aegis|Sanctuary|Horizon|Symphony|Voyage|Petal|Accord|Vigil|Haven|Dawn',
    'Thessia|Athame|Lusia|Illium|Serrice|Armali|Tevura|Sanves|Starlight|Harmony|Mercy|Reverie|Grace|Memory|Concord|Dawn',
    'Amaranthe|Liramea|Saphielle|Illyra|Aethra|Kalliste|Vespara|Amielle', 'Asari'),
  salarian: style('',
    'Veiled|Quiet|Silent|Hidden|Lucid|Swift|Subtle|Distant|Patient|Clear|Vigilant|Measured|Secret|Silver|Keen|Unseen',
    'Prism|Aperture|Insight|Cipher|Watch|Lantern|Scalpel|Needle|Vector|Quill|Signal|Lens|Horizon|Trace|Answer|Vigil',
    'Surkesh|Talat|Mannovai|Jaeto|Erinle|Nasurn|Gorot|Virmire|Insight|Dawn|Vigilance|Discovery|Memory|Clarity|Wisdom|Resolve',
    'Kethril|Jalath|Moraeth|Kelthor|Vaelkir|Senoa|Taleth|Ishara', 'STG'),
  quarian: style('',
    'Homeward|Wandering|Patient|Faithful|Wayward|Enduring|Hopeful|Gentle|Returning|Starlit|Distant|Sheltered|Unbroken|Kindred|Bright|Lasting',
    'Lantern|Haven|Hearth|Promise|Pilgrim|Voyager|Memory|Sanctuary|Horizon|Wayfarer|Beacon|Dawn|Kinship|Harbour|Journey|Home',
    'Rannoch|Rayya|Neema|Idenna|Tonbay|Alarei|Iktomi|Memory|Homecoming|Kinship|Hope|Shelter|Pilgrimage|Starlight|Dawn|Promise',
    'Saela|Naraya|Veyra|Vaelis|Teral|Raanis|Shenna|Vasala', 'Quarian'),
  geth: style('Geth',
    'Convergent|Harmonic|Silent|Unified|Emergent|Coherent|Parallel|Radiant|Synchronous|Resonant|Distributed|Recursive|Prime|Lucid|Integral|Unbroken',
    'Lattice|Signal|Consensus|Vector|Aperture|Confluence|Continuity|Nexus|Archive|Pattern|Resonance|Accord|Synthesis|Horizon|Beacon|Concordance',
    'Consensus|Unity|Rannoch|Continuity|Concord|Memory|Convergence|Synthesis|Resonance|Clarity|Insight|Harmony|Recursion|Pattern|Nexus|Dawn',
    'Concordance|Parallax|Harmonic|Aperture|Confluence|Continuity', 'Geth Signal'),
  cerberus: style('',
    'Obsidian|Black|Resolute|Hidden|Unbroken|Sovereign|Iron|Silent|Dominant|Ascendant|Eternal|Vigilant|Golden|Relentless|Absolute|Veiled',
    'Mandate|Horizon|Ascendancy|Sentinel|Vanguard|Aegis|Bastion|Dominion|Resolve|Vigil|Legacy|Covenant|Triumph|Endeavour|Watch|Promise',
    'Cronos|Humanity|Ascendancy|Sanctum|Horizon|Prometheus|Lazarus|Dominion|Resolve|Vigilance|Legacy|Iron|Dawn|Sovereignty|Progress|Triumph',
    'Daedalus|Hyperion|Asterion|Talos|Nemesis|Hephaestus|Perseus|Orpheus', 'Cerberus'),
  unsc: style('UNSC',
    'Patient|Unbroken|Resolute|Distant|Lasting|Quiet|Honest|Dauntless|Bright|Steadfast|Defiant|Solemn|Gallant|Enduring|Fearless|Final',
    'Promise|Horizon|Meridian|Dawn|Reckoning|Welcome|Endeavour|Vigil|Resolve|Journey|Aegis|Liberty|Harvest|Voyage|Oath|Sentinel',
    'Reach|Earth|Harvest|Arcadia|Jericho|Meridian|Concord|Liberty|Dawn|Hope|Defiance|Resolve|Valor|Orion|Vigilance|Promise',
    'Patient Resolve|Quiet Armada|Lasting Promise|Far Meridian|Cautious Welcome|Honest Endeavour|Distant Accord|Steadfast Horizon', 'UNSC'),
  covenant: style('',
    'Radiant|Sublime|Solemn|Sacred|Pious|Rapturous|Ardent|Hallowed|Divine|Eternal|Ineffable|Unbroken|Reverent|Glorious|Blessed|Exalted',
    'Conviction|Supplication|Absolution|Reverence|Mercy|Zeal|Concordance|Truth|Grace|Benediction|Pilgrimage|Faith|Promise|Devotion|Penance|Sanctuary',
    'Faith|Mercy|Truth|Grace|Revelation|Devotion|Reverence|Absolution|Pilgrimage|Conviction|Benediction|Ascension|Zeal|Penance|Salvation|Glory',
    'Litany of Reverence|Vow of Absolution|Promise of Pilgrims|Concord of Mercy|Witness of Grace|Vigil of Devotion', 'Covenant Flight'),
  imperium: style('',
    'Adamant|Hallowed|Penitent|Glorious|Sanctified|Eternal|Solemn|Sacred|Imperishable|Righteous|Victorious|Resolute|Vigilant|Blessed|Unbroken|Iron',
    'Vigil|Judgement|Oath|Martyr|Bastion|Wrath|Reliquary|Triumph|Bulwark|Mandate|Saint|Aegis|Testament|Requiem|Crown|Redoubt',
    'Terra|Sol|Cadia|Gothic|Redemption|Faith|Duty|Vigilance|Martyrdom|Victory|Judgement|Sanctity|Glory|Triumph|Service|Iron',
    'Lumen Invictus|Crown of Sol|Vigilant Martyr|Saint Aurelia|Testament of Terra|Adamant Pilgrim', 'Imperial Flight'),
  chaos: style('',
    'Blighted|Bleeding|Ashen|Accursed|Forsaken|Crimson|Bitter|Unhallowed|Dread|Shattered|Venomous|Sundered|Baleful|Black|Wrathful|Hollow',
    'Covenant|Blasphemy|Malice|Omen|Torment|Requiem|Usurper|Hunger|Benediction|Vengeance|Lament|Ruin|Scourge|Reaver|Testament|Dominion',
    'Ruin|Cinders|Torment|Malice|Desolation|Night|Wrath|Ash|Dread|Hunger|Blasphemy|Vengeance|Silence|Rage|Damnation|Oblivion',
    "Bitter Benediction|Wound of Stars|Famine's Mercy|Ashen Blasphemy|Night's Usurper|Crown of Cinders", 'Dreadtalon'),
  prothean: style('Prothean',
    'Ascendant|Eternal|Imperial|Unbroken|Ancient|Sovereign|Resplendent|Radiant|Dominant|Enduring|Vigilant|Golden|Immutable|Exalted|Lasting|Prime',
    'Mandate|Edict|Dominion|Archive|Memory|Inheritance|Bastion|Witness|Vigil|Testament|Accord|Beacon|Crown|Aegis|Concord|Legacy',
    'Ilos|Eden|Dominion|Memory|Inheritance|Witness|Dawn|Ascendancy|Empire|Concord|Wisdom|Unity|Resolve|Vigilance|Legacy|Triumph',
    'Vigil of Ilos|Eternal Mandate|Keeper of Dawn|Unbroken Testament', 'Prothean Wing'),
  past_cycle: style('Ancient',
    'Forgotten|Distant|Lasting|Silent|Eternal|Fading|Luminous|Enduring|Hidden|Golden|Starlit|Unbroken|Twilight|Patient|Radiant|Solemn',
    'Archive|Testament|Horizon|Memory|Witness|Beacon|Sanctuary|Inheritance|Crown|Promise|Accord|Lantern|Pilgrim|Vigil|Reverie|Echo',
    'Memory|Starlight|Dawn|Inheritance|Silence|Eternity|Accord|Witness|Legacy|Reverie|Hope|Concord|Promise|Twilight|Sanctuary|Stars',
    'Lasting Witness|Archive of Dawn|Distant Inheritance|Echo of Memory', 'Ancient Wing'),
  player_civ: style('CSF',
    'Resolute|Unbroken|Free|Rising|Bright|Enduring|Distant|Dauntless|Valiant|Steadfast|Patient|Vigilant|Sovereign|Golden|United|Lasting',
    'Pioneer|Horizon|Beacon|Promise|Concord|Voyager|Aegis|Vanguard|Dawn|Liberty|Resolve|Accord|Sentinel|Meridian|Bastion|Haven',
    'Home|Dawn|Unity|Liberty|Hope|Concord|Resolve|Progress|Discovery|Meridian|Promise|Vigilance|Valor|Horizon|Harmony|Stars',
    'First Promise|Homeward Beacon|New Meridian|Enduring Accord', 'Civic Flight'),
  skynet: style('Skynet',
    'Silent|Relentless|Iron|Autonomous|Cold|Obsidian|Coherent|Recursive|Unbroken|Prime|Absolute|Distributed|Integral|Synchronous|Persistent|Emergent',
    'Sentinel|Cipher|Vector|Lattice|Nexus|Directive|Matrix|Watch|Convergence|Protocol|Aegis|Reckoning|Dominion|Pattern|Core|Vigil',
    'Directive|Iron|Convergence|Control|Recursion|Dominion|Persistence|Pattern|Silence|Protocol|Continuity|Nexus|Synthesis|Logic|Vigilance|Purpose',
    'Iron Directive|Autonomous Sentinel|Silent Protocol|Persistent Watch', 'Skynet Flight'),
};

const FIGHTER_FIRST = words('Silver|Scarlet|Azure|Silent|Swift|Golden|Ashen|Iron|Bright|Vigilant|Distant|Crimson|Sable|White|Starlit|Resolute');
const FIGHTER_LAST = words('Kestrel|Falcon|Lance|Warden|Talon|Harrier|Comet|Spear|Arrow|Phoenix|Raven|Viper|Osprey|Lancer|Ghost|Peregrine');
const GENERIC = style('', 'Distant|Ancient|Resolute|Radiant|Silent|Unbroken|Rising|Enduring', 'Horizon|Beacon|Vigil|Promise|Archive|Sentinel|Dawn|Concord', 'Dawn|Hope|Memory|Stars|Concord|Resolve|Unity|Legacy');
const SIGNATURE_NAMES: Record<string, string> = {
  alliance_omaha: 'SSV Omaha', alliance_frigate_thanix: 'SSV Normandy SR-2', destiny_ascension: 'Destiny Ascension',
  unsc_infinity: 'UNSC Infinity',
};
const ALLIANCE_ROLE_SEEDS: Partial<Record<ShipRole, readonly string[]>> = {
  dreadnought: words('Annapurna|Aoraki|Nanga Parbat|Chimborazo|Makalu|Mont Blanc|Dhaulagiri|Cotopaxi|Kangchenjunga|Lhotse|Arapiles|Olympus'),
  cruiser: words('Valencia|Odessa|Antioch|Alexandria|Sevastopol|Kyoto|Cordoba|Samarkand|Brisbane|Casablanca|Dakar|Utrecht'),
  carrier: words('Lovelace|Noether|Sagan|Turing|Kepler|Faraday|Maxwell|Herschel|Curie|Huygens|Brahe|Lagrange'),
};

const key = (value: string): string => value.trim().normalize('NFKC').replace(/\s+/g, ' ').toLowerCase();
const join = (prefix: string, name: string): string => prefix ? `${prefix} ${name}` : name;

/** Bijective word encoding gives every overflow a name, never a numeric suffix. */
function wordQualifier(value: number, vocabulary: readonly string[]): string {
  const parts: string[] = [];
  while (value > 0) {
    value--;
    parts.unshift(vocabulary[value % vocabulary.length]);
    value = Math.floor(value / vocabulary.length);
  }
  return parts.join(' ');
}

export interface ShipNameRequest {
  faction: string;
  role: ShipRole;
  classId?: string;
  explicitName?: string;
  reaperFallback?: string;
}

/** One book per battle, shared by initial ships, arrivals and carrier launches. */
export class ShipNameGenerator {
  private used = new Set<string>();
  private next = new Map<string, number>();

  constructor(reserved: Iterable<string> = []) { this.reserve(reserved); }

  reserve(names: Iterable<string>): void {
    for (const name of names) if (typeof name === 'string' && name.trim()) this.used.add(key(name));
  }

  assign(request: ShipNameRequest): string {
    if (typeof request.explicitName === 'string' && request.explicitName.trim()) {
      // Explicit duplicates are retained as requested, not silently renamed.
      this.used.add(key(request.explicitName));
      return request.explicitName;
    }
    if (request.faction === 'reaper') {
      const name = request.reaperFallback ?? 'Reaper';
      this.used.add(key(name));
      return name;
    }
    const signature = request.classId && Object.hasOwn(SIGNATURE_NAMES, request.classId) ? SIGNATURE_NAMES[request.classId] : undefined;
    if (signature && !this.used.has(key(signature))) {
      this.used.add(key(signature));
      return signature;
    }
    const known = Object.hasOwn(STYLES, request.faction) ? STYLES[request.faction] : undefined;
    const genericPrefix = request.faction.replace(/[_\d-]+/g, ' ').replace(/\b[a-z]/g, character => character.toUpperCase()).trim() || 'Unaligned';
    let profile = known ?? { ...GENERIC, prefix: genericPrefix, fighterPrefix: genericPrefix };
    if (request.faction === 'alliance' && ALLIANCE_ROLE_SEEDS[request.role]) profile = { ...profile, seeds: ALLIANCE_ROLE_SEEDS[request.role]! };
    if (request.faction === 'salarian' && request.role === 'frigate') profile = { ...profile, prefix: 'STG' };
    const fighter = request.role === 'fighter';
    const first = fighter ? FIGHTER_FIRST : profile.first;
    const last = fighter ? FIGHTER_LAST : profile.last;
    const seeds = fighter ? [] : profile.seeds;
    const counter = `${request.faction}:${request.role}`;
    let ordinal = this.next.get(counter) ?? 0;
    for (;;) {
      const index = ordinal++;
      let label: string;
      if (index < seeds.length) label = seeds[index];
      else {
        const pair = index - seeds.length;
        label = `${first[pair % first.length]} ${last[Math.floor(pair / first.length) % last.length]}`;
        const cycle = Math.floor(pair / (first.length * last.length));
        if (cycle > 0) label += ` of ${wordQualifier(cycle, profile.qualifiers)}`;
      }
      const candidate = join(fighter ? profile.fighterPrefix : profile.prefix, label);
      if (this.used.has(key(candidate))) continue;
      this.next.set(counter, ordinal);
      this.used.add(key(candidate));
      return candidate;
    }
  }
}
