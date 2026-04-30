import type { LocalRecording } from "./types";

function speciesFolderKey(gen: string, sp: string): string {
  return `${gen}-${sp}`.toLowerCase();
}

function fileLabelFromPath(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}

type LocalAudioManifest = Record<string, string[]>;
let manifestPromise: Promise<LocalAudioManifest> | null = null;

async function loadLocalAudioManifest(): Promise<LocalAudioManifest> {
  if (!manifestPromise) {
    manifestPromise = fetch("/audio/local/manifest.json")
      .then(async (res) => {
        if (!res.ok) return {};
        return (await res.json()) as LocalAudioManifest;
      })
      .catch(() => ({}));
  }
  return manifestPromise;
}

export function getLocalRecordingsForSpecies(
  gen: string,
  sp: string,
  en: string,
): Promise<LocalRecording[]> {
  const key = speciesFolderKey(gen, sp);
  return loadLocalAudioManifest().then((manifest) => {
    const files = manifest[key] ?? [];
    return files.map((relativePath, idx) => ({
      source: "local",
      id: `local-${key}-${idx + 1}`,
      gen,
      sp,
      en,
      src: `/audio/local/${key}/${relativePath}`,
      label: fileLabelFromPath(relativePath),
      length: "",
    }));
  });
}

export async function getLocalRecordingCount(gen: string, sp: string): Promise<number> {
  const key = speciesFolderKey(gen, sp);
  const manifest = await loadLocalAudioManifest();
  return (manifest[key] ?? []).length;
}
