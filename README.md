# max-audio-player

[![npm](https://img.shields.io/npm/v/max-audio-player.svg)](https://www.npmjs.com/package/max-audio-player)
[![license](https://img.shields.io/npm/l/max-audio-player.svg)](./LICENSE)

Vue 3 audio player that plays **broken audio** (bad headers, truncated or
damaged WhatsApp/phone recordings) by repairing it in the browser with
[ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm). Healthy files play
natively and never download ffmpeg.

## Install

```bash
npm install max-audio-player
```

Requires Vue `^3.3`. `@ffmpeg/ffmpeg` and `@ffmpeg/util` are installed as dependencies.

## Usage

```vue
<script setup>
import { MaxAudioPlayer } from 'max-audio-player'
</script>

<template>
  <MaxAudioPlayer src="https://example.com/voice.mp4" autoplay @recovered="onFixed" />
</template>
```

Global registration:

```js
import MaxAudioPlayer from 'max-audio-player'
app.use(MaxAudioPlayer) // <MaxAudioPlayer src="…" />
```

## Vite setup (required)

ffmpeg runs in a web worker that Vite's dependency optimizer breaks. Add to `vite.config.js`:

```js
export default {
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
}
```

## How it works

1. Plays the file natively (fast path).
2. If the browser raises an error, downloads the bytes and repairs them with
   ffmpeg (`-err_detect ignore_err`), then plays the result as a blob URL.
3. If the download is blocked by CORS and `enable-wisp-proxy` is set, retries it through
   [libcurl.js](https://libcurl.js.org/) and your Wisp proxy.
4. If repair fails, shows an error (with a CORS hint when the download is blocked).

## Bypassing CORS with a Wisp proxy

```vue
<MaxAudioPlayer
  :src="url"
  enable-wisp-proxy
  wisp-proxy-url="wss://wisp.example.com/"
/>
```

You host the proxy yourself (e.g. [epoxy-server](https://github.com/MercuryWorkshop/epoxy-tls)
or [wisp-server-python](https://github.com/MercuryWorkshop/wisp-server-python)) behind TLS so
it is reachable as `wss://`. TLS stays end to end inside libcurl.js, so the proxy sees only the
destination host. Restrict it to the hosts you need — an open Wisp server is an open TCP proxy.
libcurl.js is LGPL-3.0-or-later.

## Props

| prop | default | description |
|---|---|---|
| `src` | required | audio URL |
| `recover` | `'auto'` | `'auto'`, `'always'` (repair first) or `'never'` |
| `format` | `'mp3'` | repaired output: `mp3`, `wav`, `ogg` |
| `autoplay`, `loop`, `controls`, `preload` | | passed to `<audio>` |
| `coreBaseURL` | jsDelivr `@ffmpeg/core@0.12.6/dist/esm` | self-host the ffmpeg core here |
| `fetchOptions` | | extra `fetch()` options for the repair download |
| `enableWispProxy` | `false` | retry CORS-blocked downloads through libcurl.js (needs `wispProxyUrl`) |
| `wispProxyUrl` | | [Wisp](https://github.com/MercuryWorkshop/wisp-protocol) proxy (`wss://…`). If the direct download is blocked by CORS, it is retried through [libcurl.js](https://libcurl.js.org/) |
| `showStatus` | `true` | built-in status text (or use the `status` slot) |

Events: `status`, `ready`, `recovered(blobUrl)`, `error(err)`.
Exposed: `audio`, `play()`, `pause()`. Other attributes fall through to `<audio>`.

## Utilities

```js
import { recoverAudio } from 'max-audio-player'
const playableUrl = await recoverAudio('https://example.com/broken.m4a', { format: 'mp3' })
```

## Limitations

- **CORS:** repair needs the file to be downloadable. If the host blocks
  `fetch`, set `enable-wisp-proxy` and `wisp-proxy-url` (a Wisp server, e.g. your own
  [wisp-server-python](https://github.com/MercuryWorkshop/wisp-server-python)) and
  the download is retried through libcurl.js, which tunnels TLS over a websocket
  and so bypasses CORS. The proxy sees the destination host, not the decrypted
  content. Without them, serve or proxy the file from your own origin.
- **Expired links:** signed URLs (e.g. WhatsApp/Facebook CDN `oe=` links) that
  have expired return 403/404 — there is nothing left to repair.
- First repair downloads ~30 MB of ffmpeg core (cached afterwards).

## License

MIT
