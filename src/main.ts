import "./style.css";
import { xcAudioUrl } from "./api";
import type { Recording } from "./types";
import {
  createGameState,
  getCorrectSpecies,
  loadRecordings,
  pickRound,
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
const locationEl = $("#location") as HTMLParagraphElement;
const sonoImg = $("#sono-img") as HTMLImageElement;
const xcLink = $("#xc-link") as HTMLAnchorElement;
const nextBtn = $("#next-btn") as HTMLButtonElement;
const streakEl = $("#streak") as HTMLSpanElement;
const bestEl = $("#best") as HTMLSpanElement;
const streakMsgEl = $("#streak-msg") as HTMLParagraphElement;
const loadingEl = $("#loading") as HTMLDivElement;
const gameEl = $("#game") as HTMLDivElement;
const errorEl = $("#error") as HTMLDivElement;
const challengeBannerEl = $("#challenge-banner") as HTMLDivElement;
const challengeBannerTextEl = $("#challenge-banner-text") as HTMLParagraphElement;
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
const SHARE_NAME_KEY = "birdle-share-name";
const DEFAULT_SHARE_NAME = "a birder";
let activeHighScore: number | null = null;
let pendingRunHighScore: number | null = null;

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
      if (Number.isFinite(m) && Number.isFinite(sec) && m >= 0 && sec >= 0) {
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
  const total =
    dur !== null && dur > 0 ? formatClock(dur) : "--:--";
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
    playerUnifiedFill.classList.toggle("player-unified-fill--full", pct >= 99.98);
  } else {
    playerUnifiedFill.style.width = "0%";
    playerUnifiedFill.classList.remove("player-unified-fill--full");
  }
  syncPlayerAria();
}

function updateTimeline() {
  renderTimelineUi();
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
    audio.play().then(() => setPlayIcon(true)).catch(() => setPlayIcon(false));
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
  const saved = localStorage.getItem(SHARE_NAME_KEY)?.trim() ?? "";
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
  shareNameInput.value = localStorage.getItem(SHARE_NAME_KEY)?.trim() ?? "";
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
  const safeScore = Number.isFinite(rawScore) && rawScore > 0 ? rawScore : null;
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

function setPlayIcon(playing: boolean) {
  iconPlay.classList.toggle("hidden", playing);
  iconPause.classList.toggle("hidden", !playing);
  syncPlayerAria();
}

function startRound() {
  const { rec, choices } = pickRound(state);

  resetTimelineForNewRound(rec);
  audio.src = xcAudioUrl(rec.id);
  audio.load();
  setPlayIcon(false);

  choicesEl.innerHTML = "";
  for (const s of choices) {
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.textContent = s.en;
    btn.addEventListener("click", () => handleGuess(s.en));
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
  if (isCorrect && state.best > prevBest) {
    pendingRunHighScore = state.best;
  } else if (!isCorrect && pendingRunHighScore !== null) {
    showHighScoreModal(pendingRunHighScore);
    pendingRunHighScore = null;
  }

  const buttons = choicesEl.querySelectorAll<HTMLButtonElement>(".choice-btn");
  for (const btn of buttons) {
    btn.disabled = true;
    if (btn.textContent === correct.en) {
      btn.classList.add("correct");
    } else if (btn.textContent === guessEn && !isCorrect) {
      btn.classList.add("wrong");
    }
  }

  feedbackText.textContent = isCorrect
    ? `Correct! That's the ${correct.en}.`
    : `Wrong! That was the ${correct.en}.`;
  feedbackText.className = isCorrect ? "text-correct" : "text-wrong";

  const rec = state.current!;
  const locParts = [rec.cnt, rec.loc].filter(Boolean);
  locationEl.textContent = locParts.length ? `Recorded in ${locParts.join(", ")}` : "";
  locationEl.classList.toggle("hidden", !locParts.length);
  const safeSonoUrl = ensureSafeExternalUrl(rec.sono.med);
  const safeXcUrl = ensureSafeExternalUrl(rec.url);
  sonoImg.src = safeSonoUrl === "about:blank" ? "" : safeSonoUrl;
  xcLink.href = safeXcUrl;

  feedbackEl.classList.remove("hidden");
}

playerUnified.addEventListener("click", () => {
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

nextBtn.addEventListener("click", () => startRound());
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
    setShareStatus("Could not copy automatically. The link is selected for manual copy.", true);
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
      title: "Birdle challenge",
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
    await loadRecordings(state);
    loadingEl.classList.add("hidden");
    gameEl.classList.remove("hidden");
    renderChallengeBannerFromLink();
    updateScore();
    startRound();
  } catch (err) {
    loadingEl.classList.add("hidden");
    errorEl.classList.remove("hidden");
    errorEl.textContent = `Failed to load recordings. Make sure your API key is set in .env. (${err})`;
  }
}

init();
