import type { Species } from "./types";

const BIRD_IMAGES_BASE = "/images/birds";
const INAT_PROJECT_URL =
  "https://www.inaturalist.org/projects/nst2007-2026-bird-race";

export interface BirdImageCredit {
  label: string;
  sourceUrl?: string;
}

/** Slug for files in `public/images/birds/`: `gen-sp` in lowercase. */
export function speciesSlug(s: Pick<Species, "gen" | "sp">): string {
  return `${s.gen}-${s.sp}`.toLowerCase();
}

/** Default hero/thumb URL: `<slug>.webp` under `public/images/birds/`. */
export function defaultBirdImageSrc(s: Pick<Species, "gen" | "sp">): string {
  return `${BIRD_IMAGES_BASE}/${speciesSlug(s)}.webp`;
}

/**
 * Per-image credit mapping keyed by species slug (`gen-sp` lowercase).
 * Add/override entries here as you gather exact attribution per photo.
 */
const IMAGE_CREDIT_BY_SLUG: Record<string, BirdImageCredit> = {
  "acridotheres-javanicus": {
    label: "Photo: NST Bird Race (2007–2026) on iNaturalist",
    sourceUrl: INAT_PROJECT_URL,
  },
  "caprimulgus-macrurus": {
    label: "Photo: NST Bird Race (2007–2026) on iNaturalist",
    sourceUrl: INAT_PROJECT_URL,
  },
  "columba-livia": {
    label: "Photo: NST Bird Race (2007–2026) on iNaturalist",
    sourceUrl: INAT_PROJECT_URL,
  },
  "copsychus-saularis": {
    label: "Photo: NST Bird Race (2007–2026) on iNaturalist",
    sourceUrl: INAT_PROJECT_URL,
  },
  "corvus-splendens": {
    label: "Photo: NST Bird Race (2007–2026) on iNaturalist",
    sourceUrl: INAT_PROJECT_URL,
  },
  "eudynamys-scolopaceus": {
    label: "Photo: NST Bird Race (2007–2026) on iNaturalist",
    sourceUrl: INAT_PROJECT_URL,
  },
  "gallus-gallus": {
    label: "Photo: NST Bird Race (2007–2026) on iNaturalist",
    sourceUrl: INAT_PROJECT_URL,
  },
  "garrulax-leucolophus": {
    label: "Photo: NST Bird Race (2007–2026) on iNaturalist",
    sourceUrl: INAT_PROJECT_URL,
  },
  "geopelia-striata": {
    label: "Photo: NST Bird Race (2007–2026) on iNaturalist",
    sourceUrl: INAT_PROJECT_URL,
  },
  "pycnonotus-goiavier": {
    label: "Photo: NST Bird Race (2007–2026) on iNaturalist",
    sourceUrl: INAT_PROJECT_URL,
  },
  "todiramphus-chloris": {
    label: "Photo: NST Bird Race (2007–2026) on iNaturalist",
    sourceUrl: "https://www.inaturalist.org/observations/337907459",
  },
  "passer-montanus": {
    label: "Photo: NST Bird Race (2007–2026) on iNaturalist",
    sourceUrl: "https://www.inaturalist.org/observations/336659460",
  },
  "psilopogon-lineatus": {
    label: "Photo: NST Bird Race (2007–2026) on iNaturalist",
    sourceUrl: "https://www.inaturalist.org/observations/346087236",
  },
  "cinnyris-jugularis": {
    label: "Photo: NST Bird Race (2007–2026) on iNaturalist",
    sourceUrl: "https://www.inaturalist.org/observations/345825263",
  },
  "orthotomus-sutorius": {
    label: "Photo: NST Bird Race (2007–2026) on iNaturalist",
    sourceUrl: "https://www.inaturalist.org/observations/338556301",
  },
};

export function getBirdImageCredit(
  s: Pick<Species, "gen" | "sp">,
): BirdImageCredit | null {
  return IMAGE_CREDIT_BY_SLUG[speciesSlug(s)] ?? null;
}
