// Recovery pipeline: fetch bytes -> try native decode -> ffmpeg.wasm repair.
// ffmpeg is imported lazily, so it is only downloaded when a file is broken.

const DEFAULT_CORE_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm'

let ffmpegPromise = null
let queue = Promise.resolve()

function getFFmpeg(coreBaseURL = DEFAULT_CORE_BASE) {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import('@ffmpeg/ffmpeg'),
        import('@ffmpeg/util'),
      ])
      const ffmpeg = new FFmpeg()
      await ffmpeg.load({
        coreURL: await toBlobURL(`${coreBaseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${coreBaseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      })
      return ffmpeg
    })().catch((e) => {
      ffmpegPromise = null // allow retry
      throw e
    })
  }
  return ffmpegPromise
}

let libcurlPromise = null
let libcurlWisp = null

// libcurl.js tunnels the request over a Wisp websocket proxy, so the browser
// never makes a cross-origin request and CORS does not apply.
function getLibcurl(wispProxyUrl) {
  if (!libcurlPromise || libcurlWisp !== wispProxyUrl) {
    libcurlWisp = wispProxyUrl
    libcurlPromise = (async () => {
      const { libcurl } = await import('libcurl.js/bundled')
      await libcurl.load_wasm()
      libcurl.set_websocket(wispProxyUrl)
      return libcurl
    })().catch((e) => {
      libcurlPromise = null // allow retry
      throw e
    })
  }
  return libcurlPromise
}

async function toBytes(res) {
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

/**
 * Downloads `src`. A direct fetch() is tried first; if the browser blocks it
 * (CORS surfaces as a TypeError) and `wispProxyUrl` is set, it retries via libcurl.js.
 */
export async function fetchBytes(src, init, signal, wispProxyUrl) {
  try {
    return await toBytes(await fetch(src, { ...init, signal }))
  } catch (e) {
    if (!wispProxyUrl || !(e instanceof TypeError)) throw e
  }
  const libcurl = await getLibcurl(wispProxyUrl)
  return toBytes(await libcurl.fetch(src, { ...init, signal }))
}

export async function canDecode(bytes) {
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return false
  const ctx = new Ctx()
  try {
    await ctx.decodeAudioData(bytes.slice().buffer)
    return true
  } catch {
    return false
  } finally {
    ctx.close?.()
  }
}

const OUTPUTS = {
  mp3: { args: ['-b:a', '128k'], mime: 'audio/mpeg' },
  wav: { args: ['-c:a', 'pcm_s16le'], mime: 'audio/wav' },
  ogg: { args: ['-c:a', 'libvorbis'], mime: 'audio/ogg' },
}

export function repairWithFFmpeg(bytes, { format = 'mp3', coreBaseURL } = {}) {
  const out = OUTPUTS[format] || OUTPUTS.mp3
  const run = async () => {
    const ffmpeg = await getFFmpeg(coreBaseURL)
    const id = Math.random().toString(36).slice(2)
    const inName = `in-${id}`
    const outName = `out-${id}.${OUTPUTS[format] ? format : 'mp3'}`
    await ffmpeg.writeFile(inName, bytes)
    try {
      // Input type is auto-probed; -err_detect ignore_err skips damaged frames.
      const code = await ffmpeg.exec([
        '-err_detect', 'ignore_err',
        '-fflags', '+discardcorrupt+genpts',
        '-i', inName,
        '-vn', '-ac', '2', '-ar', '44100',
        ...out.args,
        outName,
      ])
      if (code !== 0) throw new Error('ffmpeg could not recover this file')
      const data = await ffmpeg.readFile(outName)
      if (!data || !data.length) throw new Error('Nothing recoverable in this file')
      return new Blob([data], { type: out.mime })
    } finally {
      ffmpeg.deleteFile(inName).catch(() => {})
      ffmpeg.deleteFile(outName).catch(() => {})
    }
  }
  // ffmpeg.wasm is single-threaded: serialize jobs.
  const job = queue.then(run, run)
  queue = job.catch(() => {})
  return job
}

/**
 * Returns a blob: URL that the browser can play.
 * @param {string} src
 * @param {{format?: string, coreBaseURL?: string, wispProxyUrl?: string, fetchOptions?: RequestInit, signal?: AbortSignal, onStep?: (s: string) => void}} opts
 */
export async function recoverAudio(src, opts = {}) {
  const { onStep = () => {}, fetchOptions, signal, wispProxyUrl } = opts
  onStep('downloading')
  const bytes = await fetchBytes(src, fetchOptions, signal, wispProxyUrl)
  onStep('repairing')
  const blob = await repairWithFFmpeg(bytes, opts)
  return URL.createObjectURL(blob)
}
