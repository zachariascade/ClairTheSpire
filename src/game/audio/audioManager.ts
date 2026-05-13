import { sfxLibrary, type SfxCategory, type SfxCue } from "./sfx";

type PlaySfxOptions = {
  cooldownMs?: number;
  playbackRateVariance?: number;
  volume?: number;
};

const DEFAULT_POOL_SIZE = 4;
const DEFAULT_SFX_VOLUME = 0.62;
const DEFAULT_PLAYBACK_RATE_VARIANCE = 0.045;
const DEFAULT_COOLDOWN_MS = 24;

const pools = new Map<SfxCue, HTMLAudioElement[]>();
const lastPlayedAt = new Map<SfxCue, number>();

const resolveAssetPath = (assetPath: string) => {
  const basePath = import.meta.env.BASE_URL;
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  const normalizedAsset = assetPath.startsWith("/") ? assetPath.slice(1) : assetPath;

  return `${normalizedBase}${normalizedAsset}`;
};

const getSfxPath = (cue: SfxCue) => {
  const [category, key] = cue.split(".") as [SfxCategory, string];
  const categoryLibrary = sfxLibrary[category] as Record<string, string> | undefined;

  return categoryLibrary?.[key] ?? null;
};

const createAudio = (cue: SfxCue) => {
  const path = getSfxPath(cue);

  if (!path) {
    return null;
  }

  const audio = new Audio(resolveAssetPath(path));
  audio.preload = "auto";
  return audio;
};

const getPlayableAudio = (cue: SfxCue) => {
  const pool = pools.get(cue) ?? [];
  const idleAudio = pool.find((audio) => audio.paused || audio.ended);

  if (idleAudio) {
    return idleAudio;
  }

  if (pool.length < DEFAULT_POOL_SIZE) {
    const audio = createAudio(cue);

    if (!audio) {
      return null;
    }

    pool.push(audio);
    pools.set(cue, pool);
    return audio;
  }

  return pool[0];
};

export const playSfx = (cue: SfxCue, options: PlaySfxOptions = {}) => {
  const now = performance.now();
  const cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const lastPlayed = lastPlayedAt.get(cue) ?? 0;

  if (now - lastPlayed < cooldownMs) {
    return;
  }

  const audio = getPlayableAudio(cue);

  if (!audio) {
    return;
  }

  lastPlayedAt.set(cue, now);
  audio.pause();
  audio.currentTime = 0;
  audio.volume = options.volume ?? DEFAULT_SFX_VOLUME;

  const variance = options.playbackRateVariance ?? DEFAULT_PLAYBACK_RATE_VARIANCE;
  audio.playbackRate = 1 + (Math.random() * 2 - 1) * variance;
  void audio.play().catch(() => {
    // Browsers may block playback until the first user gesture.
  });
};

export const preloadSfx = (cues: SfxCue[]) => {
  for (const cue of cues) {
    if (pools.has(cue)) {
      continue;
    }

    const audio = createAudio(cue);

    if (audio) {
      pools.set(cue, [audio]);
    }
  }
};
