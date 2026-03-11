/**
 * WAV Export — Real-time audio capture via MediaStreamDestination (ADR 030 Phase 2).
 * Captures master output to WAV. No external dependencies.
 *
 * Usage: startCapture(audioContext, sourceNode) → stopCapture() → returns WAV Blob.
 * For pattern bounce: play pattern, wait for cycle, stop capture.
 */

import { downloadBlob } from './midiExport.ts'

// ── WAV encoder ──────────────────────────────────────────────────────────────

function encodeWav(buffers: Float32Array[], sampleRate: number, normalize: boolean): Blob {
  const numChannels = buffers.length
  const length = buffers[0].length
  const bytesPerSample = 2  // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample
  const dataSize = length * blockAlign
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  // RIFF header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')

  // fmt chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)           // chunk size
  view.setUint16(20, 1, true)            // PCM format
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)  // byte rate
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)           // bits per sample

  // data chunk
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  // Find peak for normalization
  let peak = 1.0
  if (normalize) {
    peak = 0
    for (const ch of buffers) {
      for (let i = 0; i < length; i++) {
        const abs = Math.abs(ch[i])
        if (abs > peak) peak = abs
      }
    }
    if (peak < 0.001) peak = 1.0  // silence guard
    peak = peak / 0.944  // normalize to -0.5 dBFS
  }

  // Interleave and write 16-bit PCM
  let offset = 44
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = buffers[ch][i] / peak
      const clamped = Math.max(-1, Math.min(1, sample))
      view.setInt16(offset, clamped * 0x7FFF, true)
      offset += 2
    }
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

// ── Capture state ────────────────────────────────────────────────────────────

let mediaRecorder: MediaRecorder | null = null
let chunks: Blob[] = []
let destNode: MediaStreamAudioDestinationNode | null = null

export function isCapturing(): boolean {
  return mediaRecorder !== null && mediaRecorder.state === 'recording'
}

/**
 * Start capturing audio from the given source node.
 * Returns a promise that resolves with a WAV blob when stopCapture() is called.
 */
export function startCapture(ctx: AudioContext, source: AudioNode): Promise<Blob> {
  if (mediaRecorder) throw new Error('Already capturing')

  destNode = ctx.createMediaStreamDestination()
  source.connect(destNode)
  chunks = []

  mediaRecorder = new MediaRecorder(destNode.stream, {
    mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm',
  })

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }

  return new Promise<Blob>((resolve) => {
    mediaRecorder!.onstop = async () => {
      const webmBlob = new Blob(chunks, { type: 'audio/webm' })
      // Decode WebM to AudioBuffer, then re-encode as WAV
      const arrayBuf = await webmBlob.arrayBuffer()
      const audioBuf = await ctx.decodeAudioData(arrayBuf)
      const buffers: Float32Array[] = []
      for (let ch = 0; ch < audioBuf.numberOfChannels; ch++) {
        buffers.push(audioBuf.getChannelData(ch))
      }
      const wav = encodeWav(buffers, audioBuf.sampleRate, true)
      source.disconnect(destNode!)
      destNode = null
      mediaRecorder = null
      chunks = []
      resolve(wav)
    }
    mediaRecorder!.start()
  })
}

export function stopCapture(): void {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop()
  }
}

/**
 * Convenience: record one pattern cycle, then auto-stop and download WAV.
 * Caller must ensure playback is active. Listens for cycle event to stop.
 */
export async function bounceAndDownload(
  ctx: AudioContext,
  source: AudioNode,
  filename: string,
): Promise<void> {
  const blob = await startCapture(ctx, source)
  downloadBlob(blob, filename)
}
