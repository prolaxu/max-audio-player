<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'
import { recoverAudio } from './recover.js'

defineOptions({ inheritAttrs: false })

const props = defineProps({
  src: { type: String, required: true },
  autoplay: Boolean,
  loop: Boolean,
  preload: { type: String, default: 'auto' },
  controls: { type: Boolean, default: true },
  /** 'auto' = repair only when native playback fails, 'always' = repair first, 'never' = plain <audio> */
  recover: { type: String, default: 'auto' },
  /** output format of the repaired audio: mp3 | wav | ogg */
  format: { type: String, default: 'mp3' },
  /** base URL of @ffmpeg/core (esm build) */
  coreBaseURL: String,
  /** extra options passed to fetch() when downloading for repair */
  fetchOptions: Object,
  /** show built-in status text */
  showStatus: { type: Boolean, default: true },
})
const emit = defineEmits(['status', 'recovered', 'error', 'ready'])

const audio = ref(null)
const playable = ref('')
const status = ref('idle') // idle | loading | downloading | repairing | ready | error
const message = ref('')
let blobUrl = null
let controller = null
let attempted = false

const MESSAGES = {
  loading: 'Loading audio…',
  downloading: 'Audio is damaged, downloading to repair…',
  repairing: 'Repairing audio…',
  ready: '',
}

function setStatus(s, msg) {
  status.value = s
  message.value = msg ?? MESSAGES[s] ?? ''
  emit('status', s)
}

function releaseBlob() {
  if (blobUrl) URL.revokeObjectURL(blobUrl)
  blobUrl = null
}

async function repair() {
  if (attempted || props.recover === 'never') return
  attempted = true
  controller = new AbortController()
  try {
    const url = await recoverAudio(props.src, {
      format: props.format,
      coreBaseURL: props.coreBaseURL,
      fetchOptions: props.fetchOptions,
      signal: controller.signal,
      onStep: (s) => setStatus(s),
    })
    releaseBlob()
    blobUrl = url
    playable.value = url
    emit('recovered', url)
  } catch (e) {
    if (e.name === 'AbortError') return
    const hint = e instanceof TypeError
      ? ' (the server probably blocks downloads from this site — CORS)'
      : ''
    setStatus('error', `Could not play or repair this audio: ${e.message}${hint}`)
    emit('error', e)
  }
}

watch(
  () => props.src,
  () => {
    controller?.abort()
    releaseBlob()
    attempted = false
    playable.value = props.recover === 'always' ? '' : props.src
    setStatus('loading')
    if (props.recover === 'always') repair()
  },
  { immediate: true },
)

function onError() {
  repair()
}
function onCanPlay() {
  if (status.value !== 'error') {
    setStatus('ready')
    emit('ready')
  }
}

onBeforeUnmount(() => {
  controller?.abort()
  releaseBlob()
})

defineExpose({
  audio,
  play: () => audio.value?.play(),
  pause: () => audio.value?.pause(),
})
</script>

<template>
  <div class="max-audio-player" :data-status="status">
    <audio
      ref="audio"
      v-bind="$attrs"
      :src="playable || undefined"
      :controls="controls"
      :autoplay="autoplay"
      :loop="loop"
      :preload="preload"
      @error="onError"
      @canplay="onCanPlay"
    />
    <slot name="status" :status="status" :message="message">
      <p v-if="showStatus && message" class="max-audio-player__status" :class="{ 'is-error': status === 'error' }">
        {{ message }}
      </p>
    </slot>
  </div>
</template>

<style scoped>
.max-audio-player audio { width: 100%; }
.max-audio-player__status { margin: 6px 0 0; font-size: 0.85rem; color: #666; }
.max-audio-player__status.is-error { color: #c0392b; }
</style>
