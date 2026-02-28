# ADR 019: Multi-Device Collaboration

## Status: PROPOSED

## Context

inboil はブラウザベースの DAW であり、URL にアクセスするだけでどのデバイスでも音楽制作ができる。この特性を活かし、同一ネットワーク上やBluetooth接続の複数デバイスを連携させ、友人のスマホや手元のタブレットなど、あらゆるデバイスを「楽器」として参加させるマルチデバイスコラボレーション機能を提案する。

### ユースケース

- **ライブジャム**: 友人がスマホでドラムパッド、自分がPCでシンセを操作
- **マルチタッチ拡張**: タブレットをFXパッドとして使い、PCでシーケンスを組む
- **ライブパフォーマンス**: 複数デバイスで各パートを分担し、即興セッションを行う

## Proposed Design

### A. 接続方式

2つの接続方式をサポート:

#### 1. WebRTC (同一ネットワーク / インターネット)

```
┌──────────────┐     WebRTC DataChannel     ┌──────────────┐
│   Host (PC)  │◄──────────────────────────►│  Guest (Phone)│
│  Full DAW UI │    low-latency P2P data    │  Controller   │
└──────────────┘                            └──────────────┘
```

- **シグナリング**: ホストがルームコードを生成 → ゲストが入力して接続
- **データ転送**: WebRTC DataChannel (低レイテンシー、P2P)
- **利点**: NAT越え可能、インターネット経由でもOK
- **シグナリングサーバー**: 軽量WebSocketサーバー or serverless (接続確立時のみ使用)

#### 2. Web Bluetooth (近距離)

```
┌──────────────┐     BLE GATT      ┌──────────────┐
│   Host (PC)  │◄─────────────────►│  Guest (Phone)│
│  Full DAW UI │   MIDI-like msgs  │  Controller   │
└──────────────┘                   └──────────────┘
```

- **プロトコル**: Web Bluetooth API (BLE GATT)
- **利点**: ネットワーク不要、超低レイテンシー
- **制限**: ブラウザサポートが限定的 (Chrome系のみ)、距離制限あり

### B. アーキテクチャ

```
Host Device (Authority)
├── AudioContext + WASM Engine (音声生成)
├── Pattern State (権威的状態)
├── Connection Manager
│   ├── WebRTC peer connections
│   └── BLE GATT server
└── State Sync (差分配信)

Guest Device (Controller)
├── Controller UI (タッチ操作に最適化)
├── Connection Client
│   ├── WebRTC data channel
│   └── BLE GATT client
└── Local State (ホストからのミラー)
```

**ホスト・ゲストモデル:**
- **ホスト**: 1台がオーディオエンジンとパターン状態の権威を持つ
- **ゲスト**: 操作入力を送信し、状態のミラーを受信する
- 音声生成はホストのみ — ゲストはコントローラーとして機能

### C. メッセージプロトコル

```typescript
// ゲスト → ホスト (操作)
type GuestMessage =
  | { type: 'trig'; track: number; step: number; on: boolean }
  | { type: 'velocity'; track: number; step: number; value: number }
  | { type: 'param'; track: number; key: string; value: number }
  | { type: 'perf'; action: 'fill' | 'reverse' | 'break'; active: boolean }
  | { type: 'transport'; action: 'play' | 'stop' }
  | { type: 'fxpad'; nodeId: string; x: number; y: number }

// ホスト → ゲスト (状態同期)
type HostMessage =
  | { type: 'state'; pattern: Pattern; playheads: number[] }
  | { type: 'delta'; path: string; value: unknown }
  | { type: 'playhead'; heads: number[] }
```

- **操作メッセージ**: 最小限のデータ (イベントのみ)
- **状態同期**: 初回は全状態、以後は差分 (JSON Patch or カスタム delta)
- **Playhead同期**: 高頻度 (ステップごと) だが極小データ

### D. ゲストUI (コントローラーモード)

ゲストデバイスはフルDAWではなく、タッチ最適化されたコントローラーUIを表示:

```
┌─────────────────────────────┐
│  inboil  GUEST  ●connected  │
├─────────────────────────────┤
│                             │
│   ┌─────┐ ┌─────┐ ┌─────┐  │
│   │KICK │ │SNARE│ │CLAP │  │
│   └─────┘ └─────┘ └─────┘  │
│   ┌─────┐ ┌─────┐ ┌─────┐  │
│   │C.HH │ │O.HH │ │ CYM │  │
│   └─────┘ └─────┘ └─────┘  │
│                             │
│   ┌───────────────────────┐ │
│   │      FX PAD           │ │
│   │                       │ │
│   └───────────────────────┘ │
│                             │
│   [FILL] [REV] [BRK]       │
└─────────────────────────────┘
```

ゲストのビューモードは切替可能:
- **Drum Pad**: トラックごとのパッドでリアルタイム演奏
- **FX Controller**: FXパッドのタッチ操作
- **Step Editor**: 特定トラックのステップ編集
- **Performance**: FILL/REV/BRK ボタン

### E. 接続フロー

```
Host                              Guest
  │                                 │
  ├─ [SYSTEM] → "HOST SESSION" ──► │
  │  ルームコード表示: "A3F7"       │
  │                                 │
  │                    ルームコード入力 ◄─┤
  │                    or QRコード読取   │
  │                                 │
  ├─ WebRTC signaling ────────────► │
  │◄──────────────── signaling ─────┤
  │                                 │
  ├─ P2P DataChannel established ──►│
  │                                 │
  ├─ Full state sync ─────────────►│
  │                                 │
  │◄──────── control messages ──────┤
  ├─── state deltas ──────────────►│
```

- ホストは SYSTEM 設定から「HOST SESSION」を開始
- 4文字のルームコード or QRコードで接続
- 接続確立後、ホストの全状態をゲストに同期

### F. State 拡張

```typescript
// state.svelte.ts に追加
interface SessionState {
  role: 'solo' | 'host' | 'guest'
  roomCode: string | null
  peers: { id: string; name: string }[]
  connected: boolean
}

export const session = $state<SessionState>({
  role: 'solo',
  roomCode: null,
  peers: [],
  connected: false,
})
```

### G. レイテンシー考慮

| 接続方式 | 想定レイテンシー | 用途 |
|---------|---------------|------|
| WebRTC (LAN) | 1–5ms | リアルタイムジャム |
| WebRTC (Internet) | 20–100ms | リモートコラボ |
| Web Bluetooth | 5–20ms | 近距離パフォーマンス |

- ドラムパッドのリアルタイム入力: LAN or BLE 推奨
- ステップ編集やパラメータ変更: どの接続方式でもOK
- 音声はホストのみで生成するため、ゲスト側の音声レイテンシーは問題にならない

## Implementation Order

1. **接続基盤**: WebRTC DataChannel によるP2P接続 (シグナリングサーバー含む)
2. **メッセージプロトコル**: 操作/状態同期メッセージの定義と送受信
3. **ホストモード**: SYSTEM設定からセッション開始、ルームコード生成
4. **ゲストモード**: ルームコード入力、接続、コントローラーUI
5. **状態同期**: 初回全同期 + 差分配信
6. **ゲストUI**: ドラムパッド、FXコントローラー等のビュー
7. **Web Bluetooth**: BLE接続の追加サポート
8. **QRコード**: QR生成/読取による簡易接続

## Consequences

- **Positive:** ブラウザだけで複数デバイスコラボが実現 — インストール不要
- **Positive:** 友人のスマホを即座に楽器化 — ジャムセッションのハードルが極めて低い
- **Positive:** ホスト・ゲストモデルにより状態管理がシンプル
- **Positive:** WebRTC P2P により低レイテンシーかつサーバーコスト最小
- **Negative:** シグナリングサーバーが必要 (接続確立時のみ)
- **Negative:** Web Bluetooth のブラウザサポートが限定的
- **Negative:** ネットワーク品質によりリアルタイム性が変動
- **Negative:** 複数ゲストの同時操作による競合の解決が必要
- **Dependency:** ADR 018 (Settings Panel) — ホスト/ゲスト設定のUI
