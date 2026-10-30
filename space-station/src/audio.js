// 외부 음원 없이 WebAudio로 만든 정거장 환경음 (낮은 팬 소리 + 느린 전자음)
export function createAmbience() {
  let ctx = null;
  let master = null;
  let on = false;

  function init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // 공조 팬: 저역 통과 노이즈
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    noise.connect(lp).connect(master);
    noise.start();

    // 저음 험(hum) + 아주 느린 떨림
    const hum = ctx.createOscillator();
    hum.type = 'sine';
    hum.frequency.value = 55;
    const humGain = ctx.createGain();
    humGain.gain.value = 0.06;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(humGain.gain);
    hum.connect(humGain).connect(master);
    hum.start();
    lfo.start();
    return true;
  }

  return {
    toggle() {
      if (!ctx && !init()) return false;
      on = !on;
      if (on && ctx.state === 'suspended') ctx.resume();
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.linearRampToValueAtTime(on ? 0.5 : 0, ctx.currentTime + 0.6);
      return on;
    },
  };
}
