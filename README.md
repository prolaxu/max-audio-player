# max-audio-player

Vue 3 audio player that plays broken audio (bad headers, truncated or damaged
WhatsApp/phone recordings) by repairing it in the browser with ffmpeg.wasm.

```vue
<script setup>
import { MaxAudioPlayer } from 'max-audio-player'
</script>
<template>
  <MaxAudioPlayer src="https://example.com/voice.mp4" />
</template>
```

Global: `app.use(MaxAudioPlayer)` then use `<MaxAudioPlayer src="…" />`.

## How it works
1. Plays the file natively (fast path, no ffmpeg downloaded).
2. If the browser raises an error, downloads the bytes and repairs them with
   ffmpeg (`-err_detect ignore_err`), then plays the result as a blob URL.

## Props
| prop | default | |
|---|---|---|
| `src` | required | audio URL |
| `recover` | `'auto'` | `'auto'` / `'always'` (repair first) / `'never'` |
| `format` | `'mp3'` | repaired output: `mp3`, `wav`, `ogg` |
| `autoplay`, `loop`, `controls`, `preload` | | passed to `<audio>` |
| `coreBaseURL` | jsDelivr `@ffmpeg/core@0.12.6/dist/esm` | self-host the core here |
| `fetchOptions` | | extra `fetch()` options for the repair download |
| `showStatus` | `true` | built-in status text (or use the `status` slot) |

Events: `status`, `ready`, `recovered(blobUrl)`, `error(err)`.
Exposed: `audio`, `play()`, `pause()`.

## Notes
- Repair needs the file to be downloadable with `fetch` (CORS). If the server
  blocks it, host/proxy the file on your own origin.
- Vite: add `optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] }`
  to `vite.config.js`, otherwise the ffmpeg worker fails to load.
- Utilities without the component: `recoverAudio(src)` returns a playable blob URL.
