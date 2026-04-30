/** Present on some API rows when XC redacts sensitive fields (e.g. restricted species). */
export interface XCRecordingMeta {
  redacted_fields?: Record<string, string>;
}

export interface XCRecording {
  source: "xc";
  id: string;
  gen: string;
  sp: string;
  en: string;
  cnt: string;
  loc: string;
  type: string;
  q: string;
  length: string;
  url: string;
  /** Omitted or empty when restricted; see `_meta.redacted_fields`. */
  file?: string;
  _meta?: XCRecordingMeta;
  rec?: string;
  lat?: string;
  lng?: string;
  alt?: string;
  date?: string;
  time?: string;
  sex?: string;
  stage?: string;
  method?: string;
  also?: string;
  rmk?: string;
  lic?: string;
  ssp?: string;
  group?: string;
  mic?: string;
  smp?: string;
  dvc?: string;
  "bird-seen"?: string;
  "playback-used"?: string;
  sono: {
    small: string;
    med: string;
    large: string;
    full: string;
  };
}

export interface XCResponse {
  numRecordings: string;
  numSpecies: string;
  page: number;
  numPages: number;
  recordings: Omit<XCRecording, "source">[];
}

export interface LocalRecording {
  source: "local";
  id: string;
  gen: string;
  sp: string;
  en: string;
  src: string;
  label: string;
  length: string;
}

export type Recording = XCRecording | LocalRecording;

export interface SpeciesAudioPool {
  xc: XCRecording[];
  local: LocalRecording[];
}

export interface Species {
  gen: string;
  sp: string;
  en: string;
  /** Same-origin path under `public/` (e.g. `/images/birds/gen-sp.webp`). */
  imageSrc?: string;
  /** Optional gallery link (e.g. iNaturalist taxon page). */
  morePhotosUrl?: string;
  /**
   * When true and local audio files exist, rounds for this species use only local
   * audio (no Xeno-Canto mixing or 25% XC floor). Also use when XC has no usable recordings.
   */
  audioLocalOnly?: boolean;
}

export interface GameState {
  pool: Map<string, SpeciesAudioPool>;
  current: Recording | null;
  streak: number;
  best: number;
  answered: boolean;
}
