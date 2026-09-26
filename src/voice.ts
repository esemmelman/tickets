type ResultEvent = { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> };
type Recognition = { continuous: boolean; interimResults: boolean; lang: string; onresult: ((event: ResultEvent) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null; start(): void; stop(): void; abort(): void };
type RecognitionConstructor = new () => Recognition;
export const recognitionConstructor = () => {
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
};
export class VoiceCapture {
  private recognition: Recognition | null = null;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private interval: ReturnType<typeof setInterval> | undefined;
  private fallback: ReturnType<typeof setTimeout> | undefined;
  private text = '';
  private previous = '';
  private lastSound = Date.now();
  private started = Date.now();
  private stopped = false;
  private finishing = false;
  private save = false;
  constructor(private callbacks: { hasContent?(): boolean; transcript(text: string): void; finish(text: string, save: boolean): void; error(message: string): void }) {}
  async start() {
    const Constructor = recognitionConstructor();
    if (!Constructor) { this.callbacks.error('Voice entry is unavailable in this browser. You can type a ticket below.'); return; }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (this.stopped) { this.release(); return; }
      this.context = new AudioContext();
      await this.context.resume();
      if (this.stopped) { this.release(); return; }
      const analyser = this.context.createAnalyser();
      analyser.fftSize = 1024;
      this.context.createMediaStreamSource(this.stream).connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      this.started = this.lastSound = Date.now();
      this.interval = setInterval(() => {
        analyser.getFloatTimeDomainData(data);
        const rms = Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length);
        if (rms > 0.018) this.lastSound = Date.now();
        if ((this.text.trim() || this.callbacks.hasContent?.()) && Date.now() - this.lastSound >= 3000) this.stop(true);
        else if (!(this.text.trim() || this.callbacks.hasContent?.()) && Date.now() - this.started > 20000) { this.callbacks.error('No speech detected. Tap the input to try again.'); this.stop(false); }
      }, 100);
      const recognition = new Constructor();
      this.recognition = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.onresult = event => {
        const current = Array.from(event.results).map(r => r[0].transcript).join(' ');
        this.text = [this.previous, current].filter(Boolean).join(' ');
        this.lastSound = Date.now();
        this.callbacks.transcript(this.text);
      };
      recognition.onerror = event => {
        if (this.stopped || this.finishing) return;
        if (event.error === 'no-speech') return;
        this.callbacks.error(event.error === 'not-allowed' ? 'Microphone access was denied. Allow it in your browser settings or type below.' : `Voice entry stopped (${event.error}). Your draft has been kept.`);
        this.stop(false);
      };
      recognition.onend = () => {
        if (this.stopped) return;
        if (this.finishing) { this.complete(); return; }
        // Android may end recognition before our silence timer; preserve text across restarts.
        this.previous = this.text;
        try { recognition.start(); } catch { this.callbacks.error('Voice entry stopped. Your draft has been kept.'); this.stop(false); }
      };
      recognition.start();
    } catch {
      if (!this.stopped) { this.callbacks.error('Could not start the microphone. Check permission or type your ticket.'); this.stop(false); }
    }
  }
  stop(save = false) {
    if (this.stopped || this.finishing) return;
    this.finishing = true;
    this.save = save;
    clearInterval(this.interval);
    this.fallback = setTimeout(() => this.complete(), 1200);
    if (this.recognition) { try { this.recognition.stop(); } catch { this.complete(); } }
    else this.complete();
  }
  private complete() {
    if (this.stopped) return;
    this.stopped = true;
    this.release();
    this.callbacks.finish(this.text, this.save);
  }
  cancel() { this.stopped = true; this.release(); }
  private release() {
    clearInterval(this.interval); clearTimeout(this.fallback);
    if (this.recognition) { this.recognition.onend = null; this.recognition.onresult = null; this.recognition.onerror = null; this.recognition.abort(); }
    this.stream?.getTracks().forEach(track => track.stop());
    void this.context?.close().catch(() => {});
  }
}
