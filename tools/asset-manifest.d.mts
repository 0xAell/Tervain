export interface ManifestAsset {
  path: string; group: string; kind: 'model' | 'texture' | 'image' | 'audio' | 'data'; bytes: number; sha256: string; shipped: boolean;
  sourceId?: string; licence: { id: string; status: string }; plan: 'replace' | 'keep' | 'rework' | 'drop'; replaceWith?: string;
  unreal: { type: string; folder: string; name: string; lod: number | null } | null;
}
export interface ManifestPack { title: string; publisher: string; url: string; verified: string }
export interface ManifestGroup {
  id: string; title: string; role: string; plan: ManifestAsset['plan']; why: string; source: string; fab: string | null;
  replaceWith: (ManifestPack & { with: ManifestPack[]; webTarget: ManifestPack | null }) | null; files: number; bytes: number;
}
export interface AssetManifest {
  about: string; generatedBy: string; plans: Record<string, string>;
  unrealConventions: { units: string; up: string; handedness: string; forward: string; contentRoot: string; prefixes: Record<string, string>; prefixSource: string; textureSuffixes: Record<string, string>; naming: string; lod: string; import: string };
  totals: { all: { files: number; bytes: number }; shipped: { files: number; bytes: number }; byPlan: Record<string, { files: number; bytes: number }> };
  fab: Record<string, { appliesTo?: string; brief: string; constraints: string; candidates: { title: string; publisher: string; url?: string | null; note?: string; verified: string }[] }>;
  groups: ManifestGroup[]; assets: ManifestAsset[];
}
export const ASSET_ROOTS: string[];
export function trackedAssetFiles(directory?: string): string[];
export function buildManifest(directory?: string): AssetManifest;
