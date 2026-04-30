import "./style.css";
import { xcAudioUrl } from "./api";
import { getBirdImageCredit } from "./speciesMedia";
import type { Recording, XCRecording } from "./types";
import {
    createGameState,
    getCorrectSpecies,
    loadRecordings,
    pickRound,
    SPECIES,
    submitGuess,
} from "./game";

const $ = (sel: string) => document.querySelector(sel)!;

const audio = $("#audio") as HTMLAudioElement;
const playerUnified = $("#player-unified") as HTMLButtonElement;
const playerUnifiedFill = $("#player-unified-fill") as HTMLSpanElement;
const playerTimeEl = $("#player-time") as HTMLSpanElement;
const iconPlay = $(".icon-play") as Element;
const iconPause = $(".icon-pause") as Element;
const choicesEl = $("#choices") as HTMLDivElement;
const feedbackEl = $("#feedback") as HTMLDivElement;
const feedbackText = $("#feedback-text") as HTMLParagraphElement;
const soundTypeSummaryEl = $("#sound-type-summary") as HTMLParagraphElement;
const locationEl = $("#location") as HTMLParagraphElement;
const recordingDatetimeSummaryEl = $(
    "#recording-datetime-summary",
) as HTMLParagraphElement;
const sonoContainerEl = $("#sono-container") as HTMLDivElement;
const sonoImg = $("#sono-img") as HTMLImageElement;
const speciesImageWrapEl = $("#species-image-wrap") as HTMLDivElement;
const speciesImageEl = $("#species-image") as HTMLImageElement;
const imageCreditEl = $("#image-credit") as HTMLParagraphElement;
const speciesMorePhotosEl = $("#species-more-photos") as HTMLParagraphElement;
const recordingCreditEl = $("#recording-credit") as HTMLParagraphElement;
const nextBtn = $("#next-btn") as HTMLButtonElement;
const streakEl = $("#streak") as HTMLSpanElement;
const bestEl = $("#best") as HTMLSpanElement;
const streakMsgEl = $("#streak-msg") as HTMLParagraphElement;
const loadingEl = $("#loading") as HTMLDivElement;
const gameEl = $("#game") as HTMLDivElement;
const errorEl = $("#error") as HTMLDivElement;
const achievementsEl = $("#achievements") as HTMLDivElement;
const navGameBtn = $("#nav-game-btn") as HTMLButtonElement;
const navAchievementsBtn = $("#nav-achievements-btn") as HTMLButtonElement;
const achTotalCorrectEl = $("#ach-total-correct") as HTMLParagraphElement;
const achAccuracyEl = $("#ach-accuracy") as HTMLParagraphElement;
const achUnlockedCountEl = $("#ach-unlocked-count") as HTMLParagraphElement;
const achievementsGridEl = $("#achievements-grid") as HTMLDivElement;
const challengeBannerEl = $("#challenge-banner") as HTMLDivElement;
const challengeBannerTextEl = $(
    "#challenge-banner-text",
) as HTMLParagraphElement;
const highscoreModalEl = $("#highscore-modal") as HTMLDivElement;
const highscoreSubtitleEl = $("#highscore-subtitle") as HTMLParagraphElement;
const shareNameInput = $("#share-name") as HTMLInputElement;
const shareLinkInput = $("#share-link") as HTMLInputElement;
const sharePreviewEl = $("#share-preview") as HTMLParagraphElement;
const shareStatusEl = $("#share-status") as HTMLParagraphElement;
const copyShareBtn = $("#copy-share-btn") as HTMLButtonElement;
const nativeShareBtn = $("#native-share-btn") as HTMLButtonElement;
const closeHighscoreBtn = $("#close-highscore-btn") as HTMLButtonElement;

const state = createGameState();
const SHARE_NAME_KEY = "birdguessr-share-name";
const LEGACY_SHARE_NAME_KEY = "birdle-share-name";
const DEFAULT_SHARE_NAME = "a birder";
const LOADING_PHRASES = [
    "Teaching the choir to chirp...",
    "Warming up the warblers...",
    "Cueing the dawn chorus...",
    "Polishing the peep playlist...",
    "Summoning the songbirds...",
] as const;
let activeHighScore: number | null = null;
let pendingRunHighScore: number | null = null;
let hasUserInteractedWithAudio = false;
let hasStartedFirstRound = false;
type ViewName = "game" | "achievements";

function getRandomLoadingPhrase(): string {
    const idx = Math.floor(Math.random() * LOADING_PHRASES.length);
    return LOADING_PHRASES[idx];
}

function formatClock(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Seconds from API `length` (seconds string, or `m:ss` / `mm:ss`). */
function parseRecordingLengthSeconds(s: string): number | null {
    const trimmed = s.trim();
    if (!trimmed) return null;
    if (trimmed.includes(":")) {
        const parts = trimmed.split(":");
        if (parts.length === 2) {
            const m = Number(parts[0]);
            const sec = Number(parts[1]);
            if (
                Number.isFinite(m) &&
                Number.isFinite(sec) &&
                m >= 0 &&
                sec >= 0
            ) {
                return m * 60 + sec;
            }
        }
        return null;
    }
    const n = parseFloat(trimmed);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/** Prefer media metadata; fall back to xeno-canto `length` when duration is still unknown (e.g. cross-origin). */
function getEffectiveDuration(): number | null {
    const d = audio.duration;
    if (Number.isFinite(d) && d > 0 && d < Number.POSITIVE_INFINITY) {
        return d;
    }
    const rec = state.current;
    if (!rec) return null;
    return parseRecordingLengthSeconds(rec.length);
}

function formatTimeStamp(): string {
    const cur = formatClock(audio.currentTime);
    const dur = getEffectiveDuration();
    const total = dur !== null && dur > 0 ? formatClock(dur) : "--:--";
    return `${cur} / ${total}`;
}

function syncPlayerAria() {
    const dur = getEffectiveDuration();
    const cur = audio.currentTime;
    const playing = !audio.paused;
    if (dur !== null && dur > 0) {
        if (playing) {
            playerUnified.setAttribute(
                "aria-label",
                `Pause. ${formatClock(cur)} played of ${formatClock(dur)}.`,
            );
        } else {
            playerUnified.setAttribute(
                "aria-label",
                `Play bird song. ${formatClock(cur)} of ${formatClock(dur)}.`,
            );
        }
    } else {
        playerUnified.setAttribute(
            "aria-label",
            playing ? "Pause bird song" : "Play bird song",
        );
    }
}

let playbackRafId: number | null = null;

function stopPlaybackLoop() {
    if (playbackRafId !== null) {
        cancelAnimationFrame(playbackRafId);
        playbackRafId = null;
    }
}

function tickPlayback() {
    playbackRafId = null;
    if (audio.paused || audio.ended) return;
    renderTimelineUi();
    playbackRafId = requestAnimationFrame(tickPlayback);
}

function startPlaybackLoop() {
    stopPlaybackLoop();
    playbackRafId = requestAnimationFrame(tickPlayback);
}

function renderTimelineUi() {
    playerTimeEl.textContent = formatTimeStamp();
    const dur = getEffectiveDuration();
    if (dur !== null && dur > 0) {
        const pct = Math.min(100, Math.max(0, (audio.currentTime / dur) * 100));
        playerUnifiedFill.style.width = `${pct}%`;
        playerUnifiedFill.classList.toggle(
            "player-unified-fill--full",
            pct >= 99.98,
        );
    } else {
        playerUnifiedFill.style.width = "0%";
        playerUnifiedFill.classList.remove("player-unified-fill--full");
    }
    syncPlayerAria();
}

function updateTimeline() {
    renderTimelineUi();
}

function markUserInteractedWithAudio() {
    hasUserInteractedWithAudio = true;
}

function shouldAutoplayRound(isFirstRound: boolean): boolean {
    return !isFirstRound && hasUserInteractedWithAudio;
}

function resetTimelineForNewRound(rec: Recording) {
    stopPlaybackLoop();
    const apiLen = parseRecordingLengthSeconds(rec.length);
    playerTimeEl.textContent = `0:00 / ${
        apiLen !== null ? formatClock(apiLen) : "--:--"
    }`;
    playerUnifiedFill.style.width = "0%";
    playerUnifiedFill.classList.remove("player-unified-fill--full");
    playerUnified.setAttribute("aria-label", "Play bird song");
}

function togglePlayback() {
    if (audio.paused) {
        audio
            .play()
            .then(() => setPlayIcon(true))
            .catch(() => setPlayIcon(false));
    } else {
        audio.pause();
        setPlayIcon(false);
    }
}

function ensureSafeExternalUrl(url: string): string {
    const normalized = url.startsWith("//") ? `https:${url}` : url;
    try {
        const parsed = new URL(normalized);
        if (parsed.protocol === "https:" || parsed.protocol === "http:") {
            return parsed.toString();
        }
    } catch {
        // Fall through to safe fallback.
    }
    return "about:blank";
}

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function renderImageCredit(correct: { gen: string; sp: string }) {
    imageCreditEl.textContent = "";
    imageCreditEl.classList.add("hidden");

    const credit = getBirdImageCredit(correct);
    if (!credit) return;

    if (credit.sourceUrl) {
        const safeUrl = ensureSafeExternalUrl(credit.sourceUrl);
        if (safeUrl !== "about:blank") {
            const link = document.createElement("a");
            link.href = safeUrl;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = credit.label;
            imageCreditEl.append(link);
            imageCreditEl.classList.remove("hidden");
            return;
        }
    }

    imageCreditEl.textContent = credit.label;
    imageCreditEl.classList.remove("hidden");
}

function toTitleCase(value: string): string {
    return value.replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeSingleMeta(rawValue: string | undefined): string | null {
    const value = (rawValue ?? "").trim().replace(/\s+/g, " ");
    if (!value) return null;
    const lowered = value.toLowerCase();
    if (
        lowered === "not specified" ||
        lowered === "unknown" ||
        lowered === "unspecified" ||
        lowered === "n/a" ||
        lowered === "na"
    ) {
        return null;
    }
    return toTitleCase(value);
}

function buildRecordingDatetimeSummary(rec: XCRecording): string | null {
    const date = normalizeSingleMeta(rec.date);
    const time = normalizeSingleMeta(rec.time);
    if (date && time) return `Recorded on ${date} at ${time}.`;
    if (date) return `Recorded on ${date}.`;
    if (time) return `Recorded at ${time}.`;
    return null;
}

function buildSoundSummary(rawType: string): string | null {
    const types = rawType
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => toTitleCase(t.toLowerCase()))
        .join(", ");
    return types ? `Sound type: ${types}` : null;
}

const STREAK_MESSAGES: Record<number, string> = {
    2: "2 in a row!",
    3: "On a roll!",
    4: "Keep it up!",
    5: "Unstoppable!",
    7: "Bird expert!",
    10: "Incredible!",
};

function getStreakMessage(streak: number): string {
    if (streak < 2) return "";
    const keys = Object.keys(STREAK_MESSAGES)
        .map(Number)
        .filter((k) => k <= streak)
        .sort((a, b) => b - a);
    return keys.length ? STREAK_MESSAGES[keys[0]] : "";
}

function getShareName(): string {
    const fromInput = shareNameInput.value.trim();
    if (fromInput) return fromInput;
    const saved = (
        localStorage.getItem(SHARE_NAME_KEY) ??
        localStorage.getItem(LEGACY_SHARE_NAME_KEY) ??
        ""
    ).trim();
    return saved || DEFAULT_SHARE_NAME;
}

function buildShareText(name: string, score: number): string {
    return `Can you beat ${name}'s high score of ${score}?`;
}

function buildShareUrl(name: string, score: number): string {
    const url = new URL(window.location.href);
    url.searchParams.set("challengeName", name);
    url.searchParams.set("challengeScore", String(score));
    return url.toString();
}

function setShareStatus(message: string, isError = false) {
    shareStatusEl.textContent = message;
    shareStatusEl.classList.remove("hidden");
    shareStatusEl.classList.toggle("share-status-error", isError);
}

function refreshShareFields() {
    if (activeHighScore === null) return;
    const name = getShareName();
    const url = buildShareUrl(name, activeHighScore);
    shareLinkInput.value = url;
    sharePreviewEl.textContent = buildShareText(name, activeHighScore);
}

function closeHighScoreModal() {
    highscoreModalEl.classList.add("hidden");
    activeHighScore = null;
    shareStatusEl.classList.add("hidden");
}

function showHighScoreModal(score: number) {
    activeHighScore = score;
    highscoreSubtitleEl.textContent = `Congratulations, you set a new best of ${score}!`;
    shareNameInput.value = (
        localStorage.getItem(SHARE_NAME_KEY) ??
        localStorage.getItem(LEGACY_SHARE_NAME_KEY) ??
        ""
    ).trim();
    shareStatusEl.classList.add("hidden");
    refreshShareFields();
    highscoreModalEl.classList.remove("hidden");
    shareNameInput.focus();
}

function renderChallengeBannerFromLink() {
    const params = new URLSearchParams(window.location.search);
    const rawName = (params.get("challengeName") ?? "").trim();
    const rawScore = Number.parseInt(params.get("challengeScore") ?? "", 10);
    const safeName = rawName || DEFAULT_SHARE_NAME;
    const safeScore =
        Number.isFinite(rawScore) && rawScore > 0 ? rawScore : null;
    if (!safeScore) return;
    // Phase 1 keeps social metadata static. Query params personalize only in-app challenge text.
    challengeBannerTextEl.textContent = `Challenge: Can you beat ${safeName}'s high score of ${safeScore}?`;
    challengeBannerEl.classList.remove("hidden");
}

function updateScore() {
    streakEl.textContent = String(state.streak);
    bestEl.textContent = String(state.best);
    const msg = getStreakMessage(state.streak);
    streakMsgEl.textContent = msg;
    streakMsgEl.classList.toggle("hidden", !msg);
}

function setActiveView(view: ViewName) {
    const onGame = view === "game";
    gameEl.classList.toggle("hidden", !onGame);
    achievementsEl.classList.toggle("hidden", onGame);
    navGameBtn.classList.toggle("is-active", onGame);
    navAchievementsBtn.classList.toggle("is-active", !onGame);
    navGameBtn.setAttribute("aria-selected", String(onGame));
    navAchievementsBtn.setAttribute("aria-selected", String(!onGame));
}

function formatAccuracy(totalCorrect: number, totalWrong: number): string {
    const attempts = totalCorrect + totalWrong;
    if (attempts <= 0) return "-";
    return `${((totalCorrect / attempts) * 100).toFixed(1)}%`;
}

function setAccuracyColor(totalCorrect: number, totalWrong: number) {
    const attempts = totalCorrect + totalWrong;
    if (attempts <= 0) {
        achAccuracyEl.style.color = "";
        return;
    }
    const accuracy = totalCorrect / attempts;
    const hue = Math.round(accuracy * 120);
    achAccuracyEl.style.color = `hsl(${hue} 75% 42%)`;
}

function speciesStatsKey(gen: string, sp: string): string {
    return `${gen} ${sp}`;
}

function formatBirdAccuracy(correctCount: number, attempts: number): string {
    if (attempts <= 0) return "-";
    return `${((correctCount / attempts) * 100).toFixed(0)}%`;
}

function renderAchievements() {
    const { achievements } = state;
    const unlockedCount = SPECIES.reduce((count, species) => {
        const key = speciesStatsKey(species.gen, species.sp);
        return count + (achievements.species[key]?.unlocked ? 1 : 0);
    }, 0);

    achTotalCorrectEl.textContent = String(achievements.totalCorrect);
    achAccuracyEl.textContent = formatAccuracy(
        achievements.totalCorrect,
        achievements.totalWrong,
    );
    setAccuracyColor(achievements.totalCorrect, achievements.totalWrong);
    achUnlockedCountEl.textContent = `${unlockedCount} / ${SPECIES.length}`;

    achievementsGridEl.innerHTML = "";
    for (const species of SPECIES) {
        const key = speciesStatsKey(species.gen, species.sp);
        const speciesStats = achievements.species[key];
        const unlocked = Boolean(speciesStats?.unlocked);
        const correctCount = speciesStats?.correctCount ?? 0;
        const attempts = speciesStats?.attempts ?? 0;

        const card = document.createElement("article");
        card.className = `achievement-card${unlocked ? "" : " achievement-card--locked"}`;

        const thumbWrap = document.createElement("div");
        thumbWrap.className = "achievement-thumb-wrap";
        if (species.imageSrc) {
            const img = document.createElement("img");
            img.className = "achievement-thumb";
            img.src = species.imageSrc;
            img.alt = unlocked ? `${species.en} thumbnail` : "Locked bird thumbnail";
            thumbWrap.append(img);
        }

        const nameEl = document.createElement("p");
        nameEl.className = "achievement-name";
        nameEl.textContent = unlocked ? species.en : "???";

        const statsEl = document.createElement("p");
        statsEl.className = "achievement-card-stats";
        statsEl.textContent = unlocked
            ? `Correct ${correctCount} · Attempts ${attempts} · Accuracy ${formatBirdAccuracy(correctCount, attempts)}`
            : "Correct ? · Attempts ? · Accuracy ?";

        card.append(thumbWrap, nameEl, statsEl);
        achievementsGridEl.append(card);
    }
}

function setPlayIcon(playing: boolean) {
    iconPlay.classList.toggle("hidden", playing);
    iconPause.classList.toggle("hidden", !playing);
    syncPlayerAria();
}

function startRound() {
    const isFirstRound = !hasStartedFirstRound;
    hasStartedFirstRound = true;
    const { rec, choices } = pickRound(state);

    resetTimelineForNewRound(rec);
    audio.src = rec.source === "xc" ? xcAudioUrl(rec.id) : rec.src;
    audio.load();
    setPlayIcon(false);
    if (shouldAutoplayRound(isFirstRound)) {
        audio.play().then(() => setPlayIcon(true)).catch(() => setPlayIcon(false));
    }

    choicesEl.innerHTML = "";
    for (const s of choices) {
        const btn = document.createElement("button");
        btn.className = "choice-btn";
        btn.dataset.en = s.en;

        const common = document.createElement("span");
        common.className = "choice-common";
        common.textContent = s.en;

        const scientific = document.createElement("span");
        scientific.className = "choice-scientific";
        scientific.textContent = `${s.gen} ${s.sp}`;

        const textWrap = document.createElement("span");
        textWrap.className = "choice-text";
        textWrap.append(common, scientific);

        const thumbSlot = document.createElement("span");
        thumbSlot.className = "choice-thumb-slot";
        if (s.imageSrc) {
            const thumb = document.createElement("img");
            thumb.className = "choice-thumb";
            thumb.src = s.imageSrc;
            thumb.alt = `${s.en} — reference photo`;
            thumb.addEventListener("error", () => {
                thumb.classList.add("choice-thumb--missing");
            });
            thumbSlot.append(thumb);
        }
        btn.append(thumbSlot, textWrap);
        btn.addEventListener("click", () => {
            markUserInteractedWithAudio();
            handleGuess(s.en);
        });
        choicesEl.appendChild(btn);
    }

    feedbackEl.classList.add("hidden");
    choicesEl.classList.remove("hidden");
}

function handleGuess(guessEn: string) {
    if (state.answered) return;

    const prevBest = state.best;
    const isCorrect = submitGuess(state, guessEn);
    const correct = getCorrectSpecies(state.current!);
    updateScore();
    renderAchievements();
    if (isCorrect && state.best > prevBest) {
        pendingRunHighScore = state.best;
    } else if (!isCorrect && pendingRunHighScore !== null) {
        showHighScoreModal(pendingRunHighScore);
        pendingRunHighScore = null;
    }

    const buttons =
        choicesEl.querySelectorAll<HTMLButtonElement>(".choice-btn");
    for (const btn of buttons) {
        btn.disabled = true;
        const optionEn = btn.dataset.en ?? "";
        if (optionEn === correct.en) {
            btn.classList.add("correct");
        } else if (optionEn === guessEn && !isCorrect) {
            btn.classList.add("wrong");
        }
    }

    const commonName = escapeHtml(correct.en);
    const scientificName = `<em>${escapeHtml(correct.gen)} ${escapeHtml(correct.sp)}</em>`;
    feedbackText.innerHTML = isCorrect
        ? `Correct! That's the ${commonName} (${scientificName}).`
        : `Wrong! That was the ${commonName} (${scientificName}).`;
    feedbackText.className = isCorrect ? "text-correct" : "text-wrong";

    speciesImageWrapEl.classList.add("hidden");
    speciesImageEl.removeAttribute("src");
    speciesImageEl.onload = null;
    speciesImageEl.onerror = null;
    if (correct.imageSrc) {
        speciesImageEl.alt = `Illustration: ${correct.en}`;
        speciesImageEl.onload = () => {
            speciesImageWrapEl.classList.remove("hidden");
        };
        speciesImageEl.onerror = () => {
            speciesImageWrapEl.classList.add("hidden");
            speciesImageEl.removeAttribute("src");
            speciesImageEl.onload = null;
            speciesImageEl.onerror = null;
        };
        speciesImageEl.src = correct.imageSrc;
        if (speciesImageEl.complete && speciesImageEl.naturalHeight > 0) {
            speciesImageWrapEl.classList.remove("hidden");
        }
    } else {
        speciesImageEl.alt = "";
    }
    renderImageCredit(correct);

    speciesMorePhotosEl.textContent = "";
    speciesMorePhotosEl.classList.add("hidden");
    if (correct.morePhotosUrl) {
        const safeGallery = ensureSafeExternalUrl(correct.morePhotosUrl);
        if (safeGallery !== "about:blank") {
            const link = document.createElement("a");
            link.href = safeGallery;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = "More photos";
            speciesMorePhotosEl.append(link);
            speciesMorePhotosEl.classList.remove("hidden");
        }
    }

    const rec = state.current!;
    if (rec.source === "xc") {
        const locParts = [rec.cnt, rec.loc].filter(Boolean);
        locationEl.textContent = locParts.length
            ? `Recorded in ${locParts.join(", ")}`
            : "";
        locationEl.classList.toggle("hidden", !locParts.length);

        const soundSummary = buildSoundSummary(rec.type);
        soundTypeSummaryEl.textContent = soundSummary ?? "";
        soundTypeSummaryEl.classList.toggle("hidden", !soundSummary);

        const datetimeSummary = buildRecordingDatetimeSummary(rec);
        recordingDatetimeSummaryEl.textContent = datetimeSummary ?? "";
        recordingDatetimeSummaryEl.classList.toggle("hidden", !datetimeSummary);

        const safeSonoUrl = ensureSafeExternalUrl(rec.sono.med || rec.sono.large);
        if (safeSonoUrl !== "about:blank") {
            sonoImg.src = safeSonoUrl;
            sonoContainerEl.classList.remove("hidden");
        } else {
            sonoImg.src = "";
            sonoContainerEl.classList.add("hidden");
        }

        const safeXcUrl = ensureSafeExternalUrl(rec.url);
        const safeLicUrl = ensureSafeExternalUrl(rec.lic ?? "");
        const recordist = normalizeSingleMeta(rec.rec) ?? "unknown recordist";
        const sourceLink = `<a href="${safeXcUrl}" target="_blank" rel="noopener noreferrer">Xeno-canto</a>`;
        const licenseLink =
            safeLicUrl !== "about:blank"
                ? ` · <a href="${safeLicUrl}" target="_blank" rel="noopener noreferrer">Source recording license</a>`
                : "";
        recordingCreditEl.innerHTML = `Audio via ${sourceLink}, submitted by ${escapeHtml(recordist)}${licenseLink}.`;
        recordingCreditEl.classList.remove("hidden");
    } else {
        locationEl.textContent = "";
        locationEl.classList.add("hidden");
        soundTypeSummaryEl.textContent = "";
        soundTypeSummaryEl.classList.add("hidden");
        recordingDatetimeSummaryEl.textContent = "";
        recordingDatetimeSummaryEl.classList.add("hidden");
        sonoImg.src = "";
        sonoContainerEl.classList.add("hidden");
        recordingCreditEl.textContent = `Audio recorded by Jun Yu and Joshua (${rec.label}).`;
        recordingCreditEl.classList.remove("hidden");
    }

    feedbackEl.classList.remove("hidden");
}

playerUnified.addEventListener("click", () => {
    markUserInteractedWithAudio();
    togglePlayback();
});

playerUnified.addEventListener("keydown", (e) => {
    const dur = getEffectiveDuration();
    if (dur === null || dur <= 0) return;
    if (e.key === "ArrowLeft") {
        e.preventDefault();
        audio.currentTime = Math.max(0, audio.currentTime - 5);
        renderTimelineUi();
    } else if (e.key === "ArrowRight") {
        e.preventDefault();
        audio.currentTime = Math.min(dur, audio.currentTime + 5);
        renderTimelineUi();
    }
});

audio.addEventListener("loadedmetadata", () => updateTimeline());
audio.addEventListener("durationchange", () => updateTimeline());
audio.addEventListener("play", () => {
    startPlaybackLoop();
});
audio.addEventListener("pause", () => {
    stopPlaybackLoop();
    renderTimelineUi();
});
audio.addEventListener("ended", () => {
    stopPlaybackLoop();
    setPlayIcon(false);
    renderTimelineUi();
});

nextBtn.addEventListener("click", () => {
    markUserInteractedWithAudio();
    startRound();
});
navGameBtn.addEventListener("click", () => setActiveView("game"));
navAchievementsBtn.addEventListener("click", () => {
    renderAchievements();
    setActiveView("achievements");
});
closeHighscoreBtn.addEventListener("click", () => closeHighScoreModal());
highscoreModalEl.addEventListener("click", (e) => {
    if (e.target === highscoreModalEl) closeHighScoreModal();
});
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !highscoreModalEl.classList.contains("hidden")) {
        closeHighScoreModal();
    }
});
shareNameInput.addEventListener("input", () => {
    const trimmed = shareNameInput.value.trim();
    if (trimmed) {
        localStorage.setItem(SHARE_NAME_KEY, trimmed);
    } else {
        localStorage.removeItem(SHARE_NAME_KEY);
    }
    refreshShareFields();
});
copyShareBtn.addEventListener("click", async () => {
    if (activeHighScore === null) return;
    refreshShareFields();
    try {
        await navigator.clipboard.writeText(shareLinkInput.value);
        setShareStatus("Link copied.");
    } catch {
        shareLinkInput.select();
        setShareStatus(
            "Could not copy automatically. The link is selected for manual copy.",
            true,
        );
    }
});
nativeShareBtn.addEventListener("click", async () => {
    if (activeHighScore === null) return;
    refreshShareFields();
    if (!("share" in navigator)) {
        setShareStatus("Native share is not supported on this device.", true);
        return;
    }
    try {
        await navigator.share({
            title: "BirdGuessr challenge",
            text: sharePreviewEl.textContent ?? "",
            url: shareLinkInput.value,
        });
        setShareStatus("Shared successfully.");
    } catch {
        setShareStatus("Share was canceled or failed.", true);
    }
});
if (!("share" in navigator)) {
    nativeShareBtn.classList.add("hidden");
}

async function init() {
    try {
        loadingEl.textContent = getRandomLoadingPhrase();
        await loadRecordings(state);
        loadingEl.classList.add("hidden");
        setActiveView("game");
        renderChallengeBannerFromLink();
        updateScore();
        renderAchievements();
        startRound();
    } catch (err) {
        loadingEl.classList.add("hidden");
        errorEl.classList.remove("hidden");
        errorEl.textContent = `Failed to load recordings. Make sure your API key is set in .env. (${err})`;
    }
}

init();
