---
title: FAQ
description: Frequently asked questions about INBOIL.
sidebar:
  order: 1
---

## General

### What is INBOIL?
A browser-based groove box and DAW. It runs entirely in your browser — no download, no account, no plugins required. Open the app and start making beats.

### What browsers are supported?
INBOIL requires a modern browser with **Web Audio API** and **AudioWorklet** support:
- Chrome 66+ (recommended)
- Firefox 76+
- Safari 14.1+
- Edge 79+

Mobile browsers work but the interface is optimized for desktop.

### Is my work saved?
Yes — projects **auto-save** to your browser's local storage (IndexedDB) on every edit. However, this means your data lives in **this browser only**. Use **EXPORT** to download a JSON backup that you can import anywhere.

### Can I use INBOIL offline?
The app works offline after the initial load (it's a PWA). However, the docs site requires an internet connection.

## Sound & Audio

### Why is there no sound?
1. Make sure playback is started (press **Space**)
2. Check that tracks aren't muted (**M** button)
3. Check browser volume and output device
4. Some browsers block audio until you interact with the page — click anywhere first

### Can I record audio output?
Yes — use the **REC ●** button in the System panel. It records a WAV file of the master output. Press REC to start, press again to stop and download.

### Can I use external MIDI controllers?
Yes — connect a USB or BLE MIDI keyboard and configure it in **SYSTEM → MIDI**. INBOIL supports note input, velocity, and channel routing.

### What audio format does Export produce?
**JSON** for project data (all patterns, scene, settings). **MIDI** export produces a standard .mid file. **WAV** recording captures the audio output in real-time.

## Patterns & Sequencing

### How many patterns can I have?
100 patterns per project.

### Can tracks have different step counts?
Yes — each track has an independent step count from **2 to 64**. Different step counts create polyrhythms.

### What is Per-Step Lock?
A way to change a sound parameter for just one step. Enable **LOCK ON** in the Dock, select a step, then turn knobs. That step gets its own sound settings while the rest of the pattern keeps the original.

## Scene Graph

### What's the difference between Loop and Scene mode?
**Loop** plays the current pattern on repeat. **Scene** traverses the scene graph starting from the root node, following edges to create longer arrangements with variation.

### Can the scene loop forever?
Yes — if your edges form a cycle (A → B → C → A), playback loops through those nodes indefinitely. Use weighted edges for variation so it never sounds exactly the same.

### What are Generative nodes?
Nodes that create musical content algorithmically instead of playing a stored pattern. Available engines: Turing Machine, Quantizer, and Tonnetz.

## Data & Privacy

### Where is my data stored?
All data stays in your browser's local **IndexedDB**. Nothing is sent to any server. There are no accounts, no cloud sync, and no analytics.

### How do I back up my work?
Use **EXPORT** in the System panel to download a JSON file containing your entire project. Import it later with **IMPORT** — even in a different browser.

### How do I start fresh?
Use **SYSTEM → NEW** to create a new empty project, or **FACTORY RESET** in the Help panel to clear everything and restore defaults.
