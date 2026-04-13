import type { Recording, XCResponse } from "./types";

const isDev = import.meta.env.DEV;
const MIN_RECORDINGS_PER_SPECIES = 8;

function xcApiUrl(query: string): string {
  if (isDev) {
    const apiKey = import.meta.env.VITE_XC_API_KEY as string;
    return `/api/xc?query=${query}&key=${encodeURIComponent(apiKey)}&per_page=50`;
  }
  return `/.netlify/functions/xc?query=${query}`;
}

export function xcAudioUrl(id: string): string {
  if (isDev) {
    return `/audio/xc/${id}/download`;
  }
  return `https://xeno-canto.org/${id}/download`;
}

async function fetchRecordingsByQuery(query: string): Promise<Recording[]> {
  const url = xcApiUrl(query);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`xeno-canto API error: ${res.status}`);
  }
  const data: XCResponse = await res.json();
  return data.recordings;
}

function dedupeById(recordings: Recording[]): Recording[] {
  const seen = new Set<string>();
  const out: Recording[] = [];
  for (const rec of recordings) {
    if (seen.has(rec.id)) continue;
    seen.add(rec.id);
    out.push(rec);
  }
  return out;
}

export async function fetchRecordings(
  gen: string,
  sp: string,
): Promise<Recording[]> {
  const base = `gen:${gen}+sp:${sp}+cnt:singapore`;
  const [qualityA, qualityB] = await Promise.all([
    fetchRecordingsByQuery(`${base}+q:A`),
    fetchRecordingsByQuery(`${base}+q:B`),
  ]);
  const abRecordings = dedupeById([...qualityA, ...qualityB]);
  if (abRecordings.length >= MIN_RECORDINGS_PER_SPECIES) {
    return abRecordings;
  }

  const fallback = await fetchRecordingsByQuery(`${base}+q:%22>C%22`);
  return dedupeById([...abRecordings, ...fallback]);
}
