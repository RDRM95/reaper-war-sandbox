import * as THREE from 'three';

/**
 * Shared materials. Ships use a small palette per faction so that a fleet of
 * forty vessels costs few material switches.
 */

export interface FactionPalette {
  hull: THREE.MeshStandardMaterial;
  hullDark: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  engine: THREE.MeshStandardMaterial;
  windows: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
}

const std = (color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, metalness: 0.45, roughness: 0.5, ...opts });

export const PALETTES: Record<string, FactionPalette> = {
  alliance: {
    // Painted armour, not polished metal: a matt off-white over dark mechanical tiers. At the old metalness 0.5 and
    // roughness 0.42 sunlit faces measured 8.8 to 10.2 in scene-linear light and clipped to white on screen.
    hull: std(0xb4b9c0, { metalness: 0.16, roughness: 0.76, envMapIntensity: 0.8 }),
    hullDark: std(0x2c313a, { metalness: 0.4, roughness: 0.68 }),
    accent: std(0x2259ad, { metalness: 0.2, roughness: 0.6 }),
    engine: new THREE.MeshStandardMaterial({ color: 0x5fb8ff, emissive: 0x3c9dff, emissiveIntensity: 3.2, roughness: 0.3, metalness: 0 }),
    windows: new THREE.MeshStandardMaterial({ color: 0xcfe8ff, emissive: 0x9fd0ff, emissiveIntensity: 1.6, roughness: 0.6 }),
    glow: new THREE.MeshBasicMaterial({ color: 0x5fb8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
  },
  cerberus: {
    hull: std(0xe8e8e4, { metalness: 0.45, roughness: 0.38 }),
    hullDark: std(0x1a1b1e, { metalness: 0.7, roughness: 0.45 }),
    accent: std(0xff8a1f, { metalness: 0.3, roughness: 0.4 }),
    engine: new THREE.MeshStandardMaterial({ color: 0xffb060, emissive: 0xff9a3c, emissiveIntensity: 3, roughness: 0.3, metalness: 0 }),
    windows: new THREE.MeshStandardMaterial({ color: 0xfff0d8, emissive: 0xffd9a0, emissiveIntensity: 1.5 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
  },
  cerberus_black_fleet: {
    // Distinct from stock Cerberus white/orange: dark stealth plating with
    // restrained bone-grey upper facets, orange insignia and blue drive glow.
    hull: std(0x818b93, { metalness: 0.68, roughness: 0.42 }),
    hullDark: std(0x181b21, { metalness: 0.75, roughness: 0.43 }),
    accent: std(0xc58a39, { metalness: 0.44, roughness: 0.48 }),
    engine: new THREE.MeshStandardMaterial({ color: 0x6fbfff, emissive: 0x3d9be8, emissiveIntensity: 2.7, roughness: 0.3 }),
    windows: new THREE.MeshStandardMaterial({ color: 0xb4dcff, emissive: 0x8bc9ef, emissiveIntensity: 1.3 }),
    glow: new THREE.MeshBasicMaterial({ color: 0x64b7ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
  },
  reaper: {
    // Graphite and charcoal metal that still reads in deep space. The §7.8 values (0x0e1016 at metalness 0.85) put
    // the albedo near 1 % with almost no diffuse term: rendered, every Reaper was a flat black cut-out. These are a
    // mid-dark graphite at moderate metalness with broad highlights; recesses stay charcoal. No brown, no blue cast.
    hull: std(0x3d4149, { metalness: 0.62, roughness: 0.5, envMapIntensity: 1.2 }),
    hullDark: std(0x181b20, { metalness: 0.5, roughness: 0.62 }),
    accent: std(0x4b515c, { metalness: 0.68, roughness: 0.42, envMapIntensity: 1.5 }),
    engine: new THREE.MeshStandardMaterial({ color: 0xff5a1f, emissive: 0xff5a1f, emissiveIntensity: 3.6, roughness: 0.3, metalness: 0 }),
    windows: new THREE.MeshStandardMaterial({ color: 0xd01030, emissive: 0xd01030, emissiveIntensity: 2.5 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
  },
  asari: {
    hull: std(0xc4bcd9, { metalness: 0.45, roughness: 0.3 }),
    hullDark: std(0x3a3352, { metalness: 0.6, roughness: 0.4 }),
    accent: std(0x7a4fe0, { metalness: 0.35, roughness: 0.35 }),
    engine: new THREE.MeshStandardMaterial({ color: 0xd0a8ff, emissive: 0xb080ff, emissiveIntensity: 3, roughness: 0.3, metalness: 0 }),
    windows: new THREE.MeshStandardMaterial({ color: 0xf0e8ff, emissive: 0xc8b0ff, emissiveIntensity: 1.6 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xd0a8ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
  },
  salarian: {
    hull: std(0xb9c8b4, { metalness: 0.42, roughness: 0.36 }),
    hullDark: std(0x2d3b33, { metalness: 0.6, roughness: 0.45 }),
    accent: std(0x3f8f5a, { metalness: 0.35, roughness: 0.4 }),
    engine: new THREE.MeshStandardMaterial({ color: 0xb8ffa0, emissive: 0x8cff70, emissiveIntensity: 3, roughness: 0.3, metalness: 0 }),
    windows: new THREE.MeshStandardMaterial({ color: 0xeaffe0, emissive: 0xb8ffa0, emissiveIntensity: 1.6 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xb8ffa0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
  },
  geth: {
    hull: std(0xd8dde3, { metalness: 0.5, roughness: 0.35 }),
    hullDark: std(0x4a5260, { metalness: 0.7, roughness: 0.4 }),
    accent: std(0x8a98a8, { metalness: 0.6, roughness: 0.4 }),
    engine: new THREE.MeshStandardMaterial({ color: 0xe8f0ff, emissive: 0xc0d8ff, emissiveIntensity: 3, roughness: 0.3, metalness: 0 }),
    windows: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xd8e8ff, emissiveIntensity: 2.2 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xe8f0ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
  },
  quarian: {
    hull: std(0xb59d78, { metalness: 0.4, roughness: 0.6 }),
    hullDark: std(0x4a3f33, { metalness: 0.5, roughness: 0.6 }),
    accent: std(0x8c5a2b, { metalness: 0.4, roughness: 0.55 }),
    engine: new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffc060, emissiveIntensity: 2.6, roughness: 0.3, metalness: 0 }),
    windows: new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xffd890, emissiveIntensity: 1.4 }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
  },
  turian: {
    hull: std(0x8a98a8, { metalness: 0.6, roughness: 0.4 }),
    hullDark: std(0x2e3540, { metalness: 0.65 }),
    accent: std(0x7fd1e8),
    engine: new THREE.MeshStandardMaterial({ color: 0x9fe0ff, emissive: 0x7fd1ff, emissiveIntensity: 3 }),
    windows: new THREE.MeshStandardMaterial({ color: 0xe0f4ff, emissive: 0xa0e0ff, emissiveIntensity: 1.5 }),
    glow: new THREE.MeshBasicMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
  },
};

export const paletteFor = (faction: string): FactionPalette => PALETTES[faction] ?? PALETTES.alliance;

export const ADDITIVE_WHITE = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
