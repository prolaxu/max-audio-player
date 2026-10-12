import MaxAudioPlayer from './MaxAudioPlayer.vue'

export { MaxAudioPlayer }
export { recoverAudio, repairWithFFmpeg, canDecode } from './recover.js'
export default {
  install(app) {
    app.component('MaxAudioPlayer', MaxAudioPlayer)
  },
}
