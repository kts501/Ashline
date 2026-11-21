export class SoundEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public unlock(): void {
    if (this.muted || typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.noiseBuffer = this.buildNoiseBuffer(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private buildNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.35);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  public playFootstep(speedRatio: number, isSprinting: boolean): void {
    if (this.muted || !this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const pitchVar = 0.92 + Math.random() * 0.16;

    // Grit scrape
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = pitchVar * (isSprinting ? 1.15 : 0.95);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = (isSprinting ? 680 : 480) * pitchVar;
    filter.Q.value = 1.4;

    const gain = this.ctx.createGain();
    const vol = (0.06 + speedRatio * 0.08) * (isSprinting ? 1.25 : 1.0);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(vol, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.095);

    src.connect(filter).connect(gain).connect(this.ctx.destination);
    src.start(now);
    src.stop(now + 0.11);

    // Subtle boot heel thud
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(95 * pitchVar, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.065);

    const thudGain = this.ctx.createGain();
    thudGain.gain.setValueAtTime(vol * 0.9, now);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);

    osc.connect(thudGain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.075);
  }

  public playJump(): void {
    if (this.muted || !this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(320, now);
    filter.frequency.exponentialRampToValueAtTime(1100, now + 0.12);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

    src.connect(filter).connect(gain).connect(this.ctx.destination);
    src.start(now);
    src.stop(now + 0.15);
  }

  public playLanding(impactSpeed: number): void {
    if (this.muted || !this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const strength = Math.min(1, Math.max(0.2, impactSpeed / 12));

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.14);

    const thudGain = this.ctx.createGain();
    thudGain.gain.setValueAtTime(0.24 * strength, now);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

    osc.connect(thudGain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.17);

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 620;
    const gritGain = this.ctx.createGain();
    gritGain.gain.setValueAtTime(0.14 * strength, now);
    gritGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

    src.connect(filter).connect(gritGain).connect(this.ctx.destination);
    src.start(now);
    src.stop(now + 0.16);
  }

  public playExhausted(): void {
    if (this.muted || !this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(420, now);
    filter.frequency.exponentialRampToValueAtTime(220, now + 0.28);
    filter.Q.value = 2.0;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);

    src.connect(filter).connect(gain).connect(this.ctx.destination);
    src.start(now);
    src.stop(now + 0.34);
  }

  public playVault(): void {
    if (this.muted || !this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    // Hand slap on barrier
    const slap = this.ctx.createOscillator();
    slap.type = 'triangle';
    slap.frequency.setValueAtTime(145, now);
    slap.frequency.exponentialRampToValueAtTime(58, now + 0.07);
    const slapGain = this.ctx.createGain();
    slapGain.gain.setValueAtTime(0.14, now);
    slapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    slap.connect(slapGain).connect(this.ctx.destination);
    slap.start(now);
    slap.stop(now + 0.085);

    // Cloth/air vault rush
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(500, now);
    filter.frequency.exponentialRampToValueAtTime(1250, now + 0.16);
    filter.Q.value = 1.2;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    src.connect(filter).connect(gain).connect(this.ctx.destination);
    src.start(now);
    src.stop(now + 0.22);
  }

  public playClimb(): void {
    if (this.muted || !this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(420, now);
    filter.frequency.linearRampToValueAtTime(780, now + 0.14);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    src.connect(filter).connect(gain).connect(this.ctx.destination);
    src.start(now);
    src.stop(now + 0.19);
  }

  public playMantle(): void {
    if (this.muted || !this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    // Beat 1: Ledge catch impact
    const grabOsc = this.ctx.createOscillator();
    grabOsc.type = 'sine';
    grabOsc.frequency.setValueAtTime(120, now);
    grabOsc.frequency.exponentialRampToValueAtTime(42, now + 0.1);
    const grabGain = this.ctx.createGain();
    grabGain.gain.setValueAtTime(0.2, now);
    grabGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    grabOsc.connect(grabGain).connect(this.ctx.destination);
    grabOsc.start(now);
    grabOsc.stop(now + 0.13);

    // Beat 2: Pull-up strain & top-out scrape
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(340, now + 0.14);
    filter.frequency.exponentialRampToValueAtTime(860, now + 0.34);
    const pullGain = this.ctx.createGain();
    pullGain.gain.setValueAtTime(0.001, now);
    pullGain.gain.setValueAtTime(0.1, now + 0.14);
    pullGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
    src.connect(filter).connect(pullGain).connect(this.ctx.destination);
    src.start(now);
    src.stop(now + 0.38);
  }

  public playSlide(): void {
    if (this.muted || !this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.9;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1150, now);
    filter.frequency.exponentialRampToValueAtTime(340, now + 0.34);
    filter.Q.value = 0.85;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);

    src.connect(filter).connect(gain).connect(this.ctx.destination);
    src.start(now);
    src.stop(now + 0.36);
  }

  public playHookSwing(): void {
    if (this.muted || !this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 1.05;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(360, now + 0.04);
    filter.frequency.exponentialRampToValueAtTime(980, now + 0.16);
    filter.frequency.exponentialRampToValueAtTime(320, now + 0.25);
    filter.Q.value = 1.3;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);

    src.connect(filter).connect(gain).connect(this.ctx.destination);
    src.start(now);
    src.stop(now + 0.27);
  }

  public playHookImpact(): void {
    if (this.muted || !this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    // Low chest/jaw impact thud
    const thud = this.ctx.createOscillator();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(140, now);
    thud.frequency.exponentialRampToValueAtTime(44, now + 0.11);

    const thudGain = this.ctx.createGain();
    thudGain.gain.setValueAtTime(0.28, now);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);

    thud.connect(thudGain).connect(this.ctx.destination);
    thud.start(now);
    thud.stop(now + 0.14);

    // Crisp leather glove slap
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 1.18;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(920, now);
    filter.frequency.exponentialRampToValueAtTime(340, now + 0.08);
    filter.Q.value = 1.5;

    const snapGain = this.ctx.createGain();
    snapGain.gain.setValueAtTime(0.18, now);
    snapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

    src.connect(filter).connect(snapGain).connect(this.ctx.destination);
    src.start(now);
    src.stop(now + 0.1);
  }

  public playFollowUpSwing(): void {
    if (this.muted || !this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.92;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(280, now + 0.03);
    filter.frequency.exponentialRampToValueAtTime(820, now + 0.16);
    filter.frequency.exponentialRampToValueAtTime(250, now + 0.25);
    filter.Q.value = 1.45;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.125, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);

    src.connect(filter).connect(gain).connect(this.ctx.destination);
    src.start(now);
    src.stop(now + 0.27);
  }

  public playFollowUpImpact(): void {
    if (this.muted || !this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    // Deep solar-plexus body thud
    const thud = this.ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(102, now);
    thud.frequency.exponentialRampToValueAtTime(34, now + 0.16);

    const thudGain = this.ctx.createGain();
    thudGain.gain.setValueAtTime(0.32, now);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

    thud.connect(thudGain).connect(this.ctx.destination);
    thud.start(now);
    thud.stop(now + 0.19);

    // Muffled jacket/rib impact punch
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.88;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(680, now);
    filter.frequency.exponentialRampToValueAtTime(220, now + 0.12);

    const snapGain = this.ctx.createGain();
    snapGain.gain.setValueAtTime(0.22, now);
    snapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);

    src.connect(filter).connect(snapGain).connect(this.ctx.destination);
    src.start(now);
    src.stop(now + 0.14);
  }

  public dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
