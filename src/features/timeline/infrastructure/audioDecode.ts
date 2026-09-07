declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

interface AudioDecodeBase {
  blobUrl: string;
  audioContext: AudioContext;
  durationMs: number;
}

type AudioDecodeResult =
  | (AudioDecodeBase & { ok: true; buffer: AudioBuffer })
  | (AudioDecodeBase & { ok: false; buffer: null; error: string });

/** Decodes an audio file and retains its blob URL for timeline playback. */
export async function decodeAudioFile(
  file: File,
  audioContext?: AudioContext,
): Promise<AudioDecodeResult> {
  const AudioContextConstructor =
    window.AudioContext ?? window.webkitAudioContext;
  if (!audioContext && !AudioContextConstructor) {
    throw new Error("Web Audio API is unavailable");
  }
  const ctx = audioContext ?? new AudioContextConstructor();
  const blobUrl = URL.createObjectURL(file);

  try {
    const response = await fetch(blobUrl);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    return {
      buffer,
      ok: true,
      blobUrl,
      audioContext: ctx,
      durationMs: buffer.duration * 1000,
    };
  } catch (error: unknown) {
    return {
      buffer: null,
      ok: false,
      blobUrl,
      audioContext: ctx,
      durationMs: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
