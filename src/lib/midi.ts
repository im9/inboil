import { midiIn, song, perf, fxPad } from './state.svelte.ts'
import { ui } from './state.svelte.ts'
import { engine } from './audio/engine.ts'

let access: MIDIAccess | null = null
let receiveTimer = 0
let engineReady = false
let enginePending = false

async function ensureEngine() {
  if (engineReady || enginePending) return
  enginePending = true
  await engine.init()
  engine.sendPattern(song, perf, fxPad)
  engineReady = true
  enginePending = false
}

export async function initMidi(): Promise<boolean> {
  if (!navigator.requestMIDIAccess) return false
  try {
    access = await navigator.requestMIDIAccess({ sysex: false })
    midiIn.available = true
    refreshDeviceList()
    access.onstatechange = refreshDeviceList
    return true
  } catch {
    return false
  }
}

function refreshDeviceList() {
  if (!access) return
  midiIn.devices = [...access.inputs.values()].map(input => ({
    id: input.id,
    name: input.name ?? 'Unknown',
    manufacturer: input.manufacturer ?? '',
    connected: input.state === 'connected',
  }))
}

export function startListening() {
  if (!access) return
  access.inputs.forEach(input => {
    input.onmidimessage = handleMessage
  })
}

export function stopListening() {
  if (!access) return
  access.inputs.forEach(input => {
    input.onmidimessage = null
  })
}

function handleMessage(e: MIDIMessageEvent) {
  if (!midiIn.enabled) return
  const data = e.data
  if (!data || data.length < 3) return

  const [status, note, velocity] = data
  const cmd = status & 0xf0
  const ch = (status & 0x0f) + 1

  // Channel filter
  if (midiIn.channel !== 0 && ch !== midiIn.channel) return

  // Device filter
  const port = e.target as MIDIInput
  if (midiIn.activeDeviceId && port.id !== midiIn.activeDeviceId) return

  // Activity indicator
  midiIn.receiving = true
  clearTimeout(receiveTimer)
  receiveTimer = window.setTimeout(() => { midiIn.receiving = false }, 300)

  // Ensure engine is initialized (first note triggers init)
  if (!engineReady) { void ensureEngine(); return }

  if (cmd === 0x90 && velocity > 0) {
    engine.triggerNote(ui.selectedTrack, note, velocity / 127)
  } else if (cmd === 0x80 || (cmd === 0x90 && velocity === 0)) {
    engine.releaseNoteByPitch(ui.selectedTrack, note)
  } else if (cmd === 0xb0) {
    handleCC(note, velocity)
  }
}

function handleCC(cc: number, value: number) {
  const norm = value / 127
  if (cc === 1) {
    // Mod wheel → DJ Filter X (cutoff sweep)
    fxPad.filter.x = norm
    fxPad.filter.on = value > 0
  }
}
