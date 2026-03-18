import { fetchRecordings } from "./api";
import type { GameState, Recording, Species } from "./types";

export const SPECIES: Species[] = [
  { gen: "Eudynamys", sp: "scolopaceus", en: "Asian Koel" },
  { gen: "Gallus", sp: "gallus", en: "Red Junglefowl" },
  { gen: "Pycnonotus", sp: "goiavier", en: "Yellow-vented Bulbul" },
  { gen: "Acridotheres", sp: "javanicus", en: "Javan Myna" },
  { gen: "Geopelia", sp: "striata", en: "Zebra Dove" },
  { gen: "Columba", sp: "livia", en: "Rock Pigeon" },
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

const LS_KEY = "birdle-best";

function loadBest(): number {
  const val = localStorage.getItem(LS_KEY);
  return val ? parseInt(val, 10) : 0;
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
      const recs = await fetchRecordings(s.gen, s.sp);
      return { key: speciesKey(s), recs };
    }),
  );

  for (const { key, recs } of results) {
    state.pool.set(key, recs);
  }
}

export function pickRound(state: GameState): {
  rec: Recording;
  choices: Species[];
} {
  const speciesIndex = Math.floor(Math.random() * SPECIES.length);
  const correct = SPECIES[speciesIndex];
  const key = speciesKey(correct);
  const recs = state.pool.get(key);

  if (!recs || recs.length === 0) {
    throw new Error(`No recordings available for ${key}`);
  }

  const rec = recs[Math.floor(Math.random() * recs.length)];
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
