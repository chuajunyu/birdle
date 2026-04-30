import { fetchRecordings } from "./api";
import { getLocalRecordingsForSpecies } from "./localAudio";
import { defaultBirdImageSrc } from "./speciesMedia";
import type { GameState, Recording, Species } from "./types";

function bird(
  gen: string,
  sp: string,
  en: string,
  morePhotosUrl?: string,
  audioLocalOnly?: boolean,
): Species {
  const base: Species = {
    gen,
    sp,
    en,
    imageSrc: defaultBirdImageSrc({ gen, sp }),
  };
  if (morePhotosUrl) base.morePhotosUrl = morePhotosUrl;
  if (audioLocalOnly) base.audioLocalOnly = true;
  return base;
}

export const SPECIES: Species[] = [
  bird("Eudynamys", "scolopaceus", "Asian Koel"),
  bird("Gallus", "gallus", "Red Junglefowl"),
  bird("Pycnonotus", "goiavier", "Yellow-vented Bulbul"),
  bird("Geopelia", "striata", "Zebra Dove"),
  bird("Columba", "livia", "Rock Dove"),
  bird("Corvus", "splendens", "House Crow"),
  bird("Garrulax", "leucolophus", "White-crested Laughingthrush"),
  bird("Caprimulgus", "macrurus", "Large-tailed Nightjar"),
  bird("Cinnyris", "jugularis", "Olive-backed Sunbird"),
  bird("Orthotomus", "sutorius", "Common Tailorbird"),
  bird("Todiramphus", "chloris", "Collared Kingfisher"),
  bird("Psilopogon", "lineatus", "Lineated Barbet"),
  bird("Passer", "montanus", "Eurasian Tree Sparrow"),
  bird("Spilopelia", "chinensis", "Spotted Dove"),
  bird("Copsychus", "saularis", "Oriental Magpie Robin", undefined, true),
  bird("Acridotheres", "javanicus", "Javan Myna", undefined, true),
];

function speciesKey(s: Species): string {
  return `${s.gen} ${s.sp}`;
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const LS_KEY = "birdguessr-best";
const LEGACY_LS_KEY = "birdle-best";
const XC_FLOOR = 0.25;
const LOCAL_SATURATION_COUNT = 6;

function loadBest(): number {
  const val = localStorage.getItem(LS_KEY) ?? localStorage.getItem(LEGACY_LS_KEY);
  if (!val) return 0;
  const parsed = Number.parseInt(val, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function saveBest(best: number): void {
  localStorage.setItem(LS_KEY, String(best));
}

export function createGameState(): GameState {
  return {
    pool: new Map(),
    current: null,
    streak: 0,
    best: loadBest(),
    answered: false,
  };
}

export async function loadRecordings(state: GameState): Promise<void> {
  const results = await Promise.all(
    SPECIES.map(async (s) => {
      const [xc, local] = await Promise.all([
        fetchRecordings(s.gen, s.sp),
        getLocalRecordingsForSpecies(s.gen, s.sp, s.en),
      ]);
      return { key: speciesKey(s), pool: { xc, local } };
    }),
  );

  for (const { key, pool } of results) {
    state.pool.set(key, pool);
  }

  for (const s of SPECIES) {
    const pool = state.pool.get(speciesKey(s));
    if (!pool || (pool.xc.length === 0 && pool.local.length === 0)) {
      throw new Error(
        `No audio for ${s.en} (${speciesKey(s)}): add .wav under public/audio/local/${`${s.gen}-${s.sp}`.toLowerCase()}/ or ensure Xeno-Canto returns recordings.`,
      );
    }
  }
}

function pickRandomLocal(pool: { local: Recording[] }): Recording | undefined {
  if (pool.local.length === 0) return undefined;
  return pool.local[Math.floor(Math.random() * pool.local.length)];
}

function pickRandomXc(pool: { xc: Recording[] }): Recording | undefined {
  if (pool.xc.length === 0) return undefined;
  return pool.xc[Math.floor(Math.random() * pool.xc.length)];
}

function pickRecordingFromPool(state: GameState, correct: Species): Recording {
  const key = speciesKey(correct);
  const pool = state.pool.get(key);
  if (!pool) {
    throw new Error(`No recordings available for ${key}`);
  }
  const hasXc = pool.xc.length > 0;
  const hasLocal = pool.local.length > 0;
  if (!hasXc && !hasLocal) {
    throw new Error(`No recordings available for ${key}`);
  }
  if (!hasXc && hasLocal) {
    return pickRandomLocal(pool)!;
  }
  if (hasXc && !hasLocal) {
    return pickRandomXc(pool)!;
  }

  if (correct.audioLocalOnly) {
    return pickRandomLocal(pool)!;
  }

  const localCount = pool.local.length;
  const localStrength = Math.min(localCount / LOCAL_SATURATION_COUNT, 1);
  const maxLocalShare = 1 - XC_FLOOR;
  const localShare = localStrength * maxLocalShare;
  const useLocal = Math.random() < localShare;

  const local = pickRandomLocal(pool);
  const xc = pickRandomXc(pool);
  const rec = useLocal ? local ?? xc : xc ?? local;
  if (!rec) {
    throw new Error(`No recordings available for ${key}`);
  }
  return rec;
}

export function pickRound(state: GameState): {
  rec: Recording;
  choices: Species[];
} {
  const speciesIndex = Math.floor(Math.random() * SPECIES.length);
  const correct = SPECIES[speciesIndex];
  const rec = pickRecordingFromPool(state, correct);
  state.current = rec;

  const others = SPECIES.filter((s) => s.en !== correct.en);
  const decoys = shuffle(others).slice(0, 2);
  const choices = shuffle([correct, ...decoys]);

  state.answered = false;
  return { rec, choices };
}

export function getCorrectSpecies(rec: Recording): Species {
  return SPECIES.find(
    (s) =>
      s.gen.toLowerCase() === rec.gen.toLowerCase() &&
      s.sp.toLowerCase() === rec.sp.toLowerCase(),
  )!;
}

export function submitGuess(state: GameState, guessEn: string): boolean {
  if (!state.current || state.answered) return false;

  const correct = getCorrectSpecies(state.current);
  const isCorrect = correct.en === guessEn;

  if (isCorrect) {
    state.streak++;
    if (state.streak > state.best) {
      state.best = state.streak;
      saveBest(state.best);
    }
  } else {
    state.streak = 0;
  }

  state.answered = true;
  return isCorrect;
}
