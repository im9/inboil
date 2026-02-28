# ADR 020: Data Persistence & Storage Design

## Status: PROPOSED

## Context

inboil は現在すべての状態をメモリ上に保持しており、リロードでパターン編集内容が消える。今後、パターン保存、設定永続化、プリセット管理など複数の永続化ニーズが出てくる。一貫したストレージ設計を事前に定義しておくことで、各 ADR の実装時にバラバラな永続化方式が混在するのを防ぐ。

### 現状

| データ | 保存先 | 方式 |
|--------|--------|------|
| 言語設定 + 初回訪問フラグ | `localStorage['inboil']` | JSON (v1) |
| パターンバンク (100スロット) | メモリのみ | リロードで消失 |
| エフェクト設定 | メモリのみ | リロードで消失 |
| FXパッド状態 | メモリのみ | リロードで消失 |
| パフォーマンス設定 | メモリのみ | リロードで消失 |

## Proposed Design

### A. ストレージ階層

データの特性に応じて 2 層に分ける:

```
┌─────────────────────────────────────────┐
│         localStorage['inboil']          │  ← 軽量設定 (< 5KB)
│  { v, lang, visited, settings }         │
├─────────────────────────────────────────┤
│              IndexedDB                  │  ← パターン・プリセット (数MB)
│  Database: 'inboil'                     │
│  ├── Store: 'patterns'                  │
│  ├── Store: 'presets'                   │
│  └── Store: 'projects'                 │
└─────────────────────────────────────────┘
```

**localStorage** — 少量の設定データ:
- 言語、初回訪問、SYSTEM 設定 (ADR 018)
- 単一キー `inboil` に JSON で統合済み
- バージョンフィールド (`v`) でスキーマ変更に対応

**IndexedDB** — 大量・構造化データ:
- パターンバンク (100スロット × 8トラック × 最大64ステップ)
- ユーザープリセット (将来)
- プロジェクト単位のエクスポート (将来)

### B. localStorage スキーマ

```typescript
// 現在の v1
interface StoredPrefs {
  v: number         // スキーマバージョン
  lang: 'ja' | 'en'
  visited: boolean
}

// ADR 018 実装後の v2
interface StoredPrefsV2 {
  v: 2
  lang: 'ja' | 'en'
  visited: boolean
  settings: {
    randScope: 'trigs' | 'all'
    audioLatency: 'low' | 'balanced'
  }
}
```

**マイグレーション方針:**
- `v` が現在のバージョンと一致しない場合、デフォルト値にリセット
- 後方互換が必要な場合のみマイグレーション関数を書く
- 破壊的変更はバージョンを上げてリセットで対応 (設定は少量なので再設定コスト低い)

### C. IndexedDB スキーマ

```typescript
// Database: 'inboil', version: 1
const DB_NAME = 'inboil'
const DB_VERSION = 1

// Object Stores:

// 'patterns' — パターンバンク
// Key: pattern.id (1–100)
interface StoredPattern {
  id: number
  name: string
  bpm: number
  tracks: Track[]       // 既存の Track 型そのまま
  updatedAt: number     // Date.now() — 最終更新タイムスタンプ
  isFactory: boolean    // true = ファクトリープリセット (ID 1–20)
}

// 'presets' — シンセプリセット (将来: ADR 015)
// Key: auto-increment
interface StoredPreset {
  id?: number
  name: string
  synthType: SynthType
  voiceParams: Record<string, number>
  createdAt: number
}

// 'projects' — プロジェクト単位 (将来: エクスポート/インポート)
// Key: auto-increment
interface StoredProject {
  id?: number
  name: string
  patterns: StoredPattern[]
  effects: Effects
  createdAt: number
}
```

### D. アクセス層

IndexedDB の非同期性を吸収する薄いラッパー:

```typescript
// src/lib/storage.ts

class InboilDB {
  private db: IDBDatabase | null = null

  async open(): Promise<void> {
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains('patterns')) {
          db.createObjectStore('patterns', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('presets')) {
          db.createObjectStore('presets', { keyPath: 'id', autoIncrement: true })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  async savePattern(pattern: StoredPattern): Promise<void> { ... }
  async loadPattern(id: number): Promise<StoredPattern | null> { ... }
  async loadAllPatterns(): Promise<StoredPattern[]> { ... }
  async savePreset(preset: StoredPreset): Promise<number> { ... }
  async loadPresets(synthType?: SynthType): Promise<StoredPreset[]> { ... }
}

export const db = new InboilDB()
```

### E. 保存タイミング

| トリガー | 保存対象 | 方式 |
|---------|---------|------|
| パターン切替 (`switchPattern`) | 現在のパターン | IndexedDB |
| 再生停止 (`stop`) | 現在のパターン | IndexedDB |
| 設定変更 | prefs | localStorage (即時) |
| 言語切替 | prefs | localStorage (即時) |
| ブラウザ閉じ (`beforeunload`) | 現在のパターン | IndexedDB (ベストエフォート) |

**リアルタイム保存は不要** — ステップ編集やノブ操作のたびに保存するとパフォーマンスに影響。パターン切替・停止時の保存で十分。

### F. ファクトリープリセットの扱い

| 方針 | 内容 |
|------|------|
| 初回起動 | ファクトリー 20 パターンを IndexedDB に書き込み |
| 編集 | ファクトリーを上書き可能 (`isFactory` フラグは維持) |
| リセット | SYSTEM 設定から個別 or 全ファクトリーリセット可能 |
| コード内定義 | `FACTORY` 配列はソース上に残す (リセット用マスターデータ) |

### G. データサイズ見積もり

```
1 パターン ≈ 8 tracks × 64 steps × ~40 bytes/step + metadata
           ≈ 20 KB (worst case, 64 steps 全トラック)
           ≈ 5 KB (typical, 16 steps)

100 パターン ≈ 500 KB – 2 MB
プリセット 100個 ≈ 50 KB

合計: < 5 MB — IndexedDB の一般的な制限 (50–100 MB) の範囲内
```

### H. エクスポート/インポート (将来)

```typescript
// JSON ファイルとしてエクスポート
async function exportProject(): Promise<string> {
  const patterns = await db.loadAllPatterns()
  return JSON.stringify({ v: 1, patterns, effects, exportedAt: Date.now() })
}

// ファイルからインポート
async function importProject(json: string): Promise<void> {
  const data = JSON.parse(json)
  // バージョンチェック + バリデーション
  for (const p of data.patterns) await db.savePattern(p)
}
```

## Implementation Order

1. ~~localStorage 統合 (`inboil` 単一キー + version)~~ ✅
2. `src/lib/storage.ts` — IndexedDB ラッパー作成
3. パターン保存/読み込み — `switchPattern`, `stop` 時の自動保存
4. 初回起動時のファクトリー書き込み
5. `beforeunload` でのベストエフォート保存
6. SYSTEM 設定のファクトリーリセット機能
7. エクスポート/インポート UI

## Consequences

- **Positive:** データが永続化され、リロードしても編集内容が残る
- **Positive:** 2層分離 (localStorage / IndexedDB) で軽量設定と大量データを適切に管理
- **Positive:** 単一キー + バージョンで localStorage の散乱を防止
- **Positive:** IndexedDB は非同期・大容量・構造化クエリに対応
- **Positive:** エクスポート/インポートでデータのポータビリティを確保
- **Negative:** IndexedDB の非同期 API は localStorage より複雑
- **Negative:** ファクトリーリセット機能の UX 設計が必要
- **Negative:** `beforeunload` での保存は保証されない (ブラウザによる)
- **Dependency:** ADR 018 (Settings Panel) — settings フィールドの localStorage 永続化
- **Dependency:** ADR 015 (Presets) — presets ストアの利用
