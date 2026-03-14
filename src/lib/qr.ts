/**
 * Minimal QR Code generator (Version 1, 21×21, numeric/alphanumeric).
 * Zero dependencies — generates SVG path string for a QR code.
 *
 * Only supports short alphanumeric strings (up to ~25 chars for Version 1).
 * Sufficient for 4-character room codes like "A3F7".
 */

// QR Version 1: 21×21 modules, error correction level L
const SIZE = 21
const ALPHANUMERIC_TABLE = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:' as const

function encodeAlphanumeric(str: string): number[] {
  const bits: number[] = []
  // Mode indicator: alphanumeric = 0010
  pushBits(bits, 0b0010, 4)
  // Character count (9 bits for Version 1 alphanumeric)
  pushBits(bits, str.length, 9)
  // Encode pairs
  for (let i = 0; i < str.length; i += 2) {
    const a = ALPHANUMERIC_TABLE.indexOf(str[i])
    if (i + 1 < str.length) {
      const b = ALPHANUMERIC_TABLE.indexOf(str[i + 1])
      pushBits(bits, a * 45 + b, 11)
    } else {
      pushBits(bits, a, 6)
    }
  }
  // Terminator
  const capacity = 152 // Version 1-L data capacity in bits
  const termLen = Math.min(4, capacity - bits.length)
  pushBits(bits, 0, termLen)
  // Pad to byte boundary
  while (bits.length % 8 !== 0) bits.push(0)
  // Pad bytes
  const padBytes = [0b11101100, 0b00010001]
  let padIdx = 0
  while (bits.length < capacity) {
    pushBits(bits, padBytes[padIdx % 2], 8)
    padIdx++
  }
  return bits
}

function pushBits(arr: number[], value: number, count: number) {
  for (let i = count - 1; i >= 0; i--) {
    arr.push((value >> i) & 1)
  }
}

// Reed-Solomon error correction for Version 1-L (7 EC codewords)
function computeEC(data: number[]): number[] {
  // Generator polynomial coefficients for 7 EC codewords (log form)
  const gen = [0, 87, 229, 146, 149, 238, 102, 21]
  const ec = new Array(7).fill(0)
  for (const d of data) {
    const feedback = ec[0] ^ d
    for (let i = 0; i < 6; i++) ec[i] = ec[i + 1]
    ec[6] = 0
    if (feedback !== 0) {
      const fb = LOG[feedback]
      for (let i = 0; i < 7; i++) {
        ec[i] ^= EXP[(fb + gen[i]) % 255]
      }
    }
  }
  return ec
}

// GF(256) tables
const EXP = new Array(256)
const LOG = new Array(256)
{
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    x = (x << 1) ^ (x >= 128 ? 0x11d : 0)
  }
  EXP[255] = EXP[0]
}

function bitsToBytes(bits: number[]): number[] {
  const bytes: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0
    for (let j = 0; j < 8; j++) b = (b << 1) | (bits[i + j] || 0)
    bytes.push(b)
  }
  return bytes
}

function placeModules(data: number[], ec: number[]): number[][] {
  const grid: number[][] = Array.from({ length: SIZE }, () => new Array(SIZE).fill(-1))
  const reserved: boolean[][] = Array.from({ length: SIZE }, () => new Array(SIZE).fill(false))

  // Finder patterns (3 corners)
  function placeFinder(r: number, c: number) {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const rr = r + dr, cc = c + dc
        if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) continue
        const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6
        const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4
        const onBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6
        grid[rr][cc] = (inInner || (inOuter && onBorder)) ? 1 : 0
        reserved[rr][cc] = true
      }
    }
  }
  placeFinder(0, 0)
  placeFinder(0, SIZE - 7)
  placeFinder(SIZE - 7, 0)

  // Timing patterns
  for (let i = 8; i < SIZE - 8; i++) {
    grid[6][i] = i % 2 === 0 ? 1 : 0
    grid[i][6] = i % 2 === 0 ? 1 : 0
    reserved[6][i] = true
    reserved[i][6] = true
  }

  // Dark module
  grid[SIZE - 8][8] = 1
  reserved[SIZE - 8][8] = true

  // Reserve format info areas
  for (let i = 0; i < 8; i++) {
    reserved[8][i] = true
    reserved[8][SIZE - 1 - i] = true
    reserved[i][8] = true
    reserved[SIZE - 1 - i][8] = true
  }
  reserved[8][8] = true

  // Place data bits (upward/downward columns, right to left)
  const allBits: number[] = []
  for (const b of [...data, ...ec]) {
    for (let bit = 7; bit >= 0; bit--) allBits.push((b >> bit) & 1)
  }

  let bitIdx = 0
  for (let col = SIZE - 1; col >= 0; col -= 2) {
    if (col === 6) col = 5 // skip timing column
    const upward = ((SIZE - 1 - col) >> 1) % 2 === 0
    for (let i = 0; i < SIZE; i++) {
      const row = upward ? SIZE - 1 - i : i
      for (const dc of [0, -1]) {
        const c = col + dc
        if (c < 0 || reserved[row][c]) continue
        grid[row][c] = bitIdx < allBits.length ? allBits[bitIdx++] : 0
      }
    }
  }

  // Apply mask pattern 0 (checkerboard: (row + col) % 2 === 0)
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!reserved[r][c]) {
        if ((r + c) % 2 === 0) grid[r][c] ^= 1
      }
    }
  }

  // Format info (Version 1-L, mask 0)
  // Pre-computed: error correction level L (01), mask pattern 0 (000) → format bits with BCH
  const formatBits = [1,1,1,0,1,1,1,1,1,0,0,0,1,0,0]
  // Place format info
  const formatPositions = [
    // Around top-left finder
    [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]],
    // Around bottom-left and top-right finders
    [[SIZE-1,8],[SIZE-2,8],[SIZE-3,8],[SIZE-4,8],[SIZE-5,8],[SIZE-6,8],[SIZE-7,8],[8,SIZE-8],[8,SIZE-7],[8,SIZE-6],[8,SIZE-5],[8,SIZE-4],[8,SIZE-3],[8,SIZE-2],[8,SIZE-1]],
  ]
  for (const positions of formatPositions) {
    for (let i = 0; i < 15; i++) {
      const [r, c] = positions[i]
      grid[r][c] = formatBits[i]
    }
  }

  return grid
}

/**
 * Generate an SVG string for a QR code encoding the given text.
 * Returns a complete SVG element string.
 */
export function generateQrSvg(text: string, moduleSize = 4, margin = 2): string {
  const bits = encodeAlphanumeric(text.toUpperCase())
  const dataBytes = bitsToBytes(bits)
  const ecBytes = computeEC(dataBytes)
  const grid = placeModules(dataBytes, ecBytes)

  const totalSize = (SIZE + margin * 2) * moduleSize
  let path = ''
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] === 1) {
        const x = (c + margin) * moduleSize
        const y = (r + margin) * moduleSize
        path += `M${x},${y}h${moduleSize}v${moduleSize}h-${moduleSize}z`
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${totalSize}" height="${totalSize}"><rect width="${totalSize}" height="${totalSize}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`
}
