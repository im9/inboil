/**
 * Fatal error dialog state (ADR 091).
 * For critical errors that need user attention — not auto-dismissing like toasts.
 * Each error has a code for quick identification in bug reports.
 */

// ── Error code registry ──────────────────────────────────────────────

export interface ErrorDef {
  code: string
  en: string
  ja: string
  action?: 'reload' | 'export'
}

/** All known fatal error codes. Codes are prefixed by subsystem. */
const ERRORS: Record<string, ErrorDef> = {
  'AUD-001': {
    code: 'AUD-001',
    en: 'Audio engine failed to initialize. Check browser permissions or try reloading.',
    ja: 'オーディオエンジンの初期化に失敗しました。ブラウザの権限を確認するか、リロードしてください。',
    action: 'reload',
  },
  'AUD-002': {
    code: 'AUD-002',
    en: 'Audio worklet module failed to load.',
    ja: 'Audioワークレットモジュールの読み込みに失敗しました。',
    action: 'reload',
  },
  'AUD-003': {
    code: 'AUD-003',
    en: 'Could not decode audio sample.',
    ja: 'オーディオサンプルのデコードに失敗しました。',
  },
  'STG-001': {
    code: 'STG-001',
    en: 'IndexedDB is unavailable. Your data cannot be saved.',
    ja: 'IndexedDBが利用できません。データを保存できません。',
  },
  'STG-002': {
    code: 'STG-002',
    en: 'Project save failed. Export your project to avoid data loss.',
    ja: 'プロジェクトの保存に失敗しました。データ消失を防ぐためエクスポートしてください。',
    action: 'export',
  },
  'STG-003': {
    code: 'STG-003',
    en: 'OPFS storage is unavailable. Factory samples cannot be installed.',
    ja: 'OPFSストレージが利用できません。ファクトリーサンプルをインストールできません。',
  },
  'DAT-001': {
    code: 'DAT-001',
    en: 'Project data is corrupted and could not be loaded.',
    ja: 'プロジェクトデータが破損しているため、読み込めませんでした。',
  },
  'DAT-002': {
    code: 'DAT-002',
    en: 'Auto-save failed. Export your project to avoid data loss.',
    ja: '自動保存に失敗しました。データ消失を防ぐためエクスポートしてください。',
    action: 'export',
  },
  'UNK-001': {
    code: 'UNK-001',
    en: 'An unexpected error occurred.',
    ja: '予期しないエラーが発生しました。',
    action: 'reload',
  },
}

// ── State ────────────────────────────────────────────────────────────

export interface FatalError {
  code: string
  en: string
  ja: string
  action?: 'reload' | 'export'
  detail?: string     // stack trace or additional info
}

export const fatalError: { current: FatalError | null } = $state({ current: null })

/**
 * Show a fatal error dialog. Does not auto-dismiss — user must acknowledge.
 * @param code Error code from the registry (e.g. 'AUD-001')
 * @param detail Optional additional detail (stack trace, context)
 */
export function showFatalError(code: string, detail?: string): void {
  const def = ERRORS[code]
  if (def) {
    fatalError.current = { ...def, detail }
  } else {
    // Unknown code — show generic with the code itself
    fatalError.current = {
      code,
      en: `Error ${code}: ${detail ?? 'Unknown error'}`,
      ja: `エラー ${code}: ${detail ?? '不明なエラー'}`,
      action: 'reload',
      detail,
    }
  }
  console.error(`[fatal] ${code}`, detail ?? '')
}

export function dismissFatalError(): void {
  fatalError.current = null
}

/** Get all registered error codes (for documentation/testing). */
export function getErrorCodes(): Record<string, ErrorDef> {
  return { ...ERRORS }
}
