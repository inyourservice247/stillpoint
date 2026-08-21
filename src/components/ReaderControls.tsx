import type { ReadingMode } from "../types/Book";

type ReaderControlsProps = {
  playing: boolean;
  wpm: number;
  displayWpm: number;
  slowdownActive: boolean;
  onPrevious: () => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onWpmChange: (wpm: number) => void;
  mode: ReadingMode;
  voiceRate: number;
  voices: SpeechSynthesisVoice[];
  selectedVoice: string;
  kokoroVoice: string;
  speechAvailable: boolean;
  onModeChange: (mode: ReadingMode) => void;
  onVoiceRateChange: (rate: number) => void;
  onDeviceVoiceChange: (voice: string) => void;
  onKokoroVoiceChange: (voice: string) => void;
};

const KOKORO_VOICES = [
  { value: "af_heart", label: "Heart · US" },
  { value: "af_bella", label: "Bella · US" },
  { value: "am_fenrir", label: "Fenrir · US" },
  { value: "bf_emma", label: "Emma · UK" },
  { value: "bm_fable", label: "Fable · UK" },
];

export function ReaderControls({
  playing,
  wpm,
  displayWpm,
  slowdownActive,
  onPrevious,
  onTogglePlay,
  onNext,
  onWpmChange,
  mode,
  voiceRate,
  voices,
  selectedVoice,
  kokoroVoice,
  speechAvailable,
  onModeChange,
  onVoiceRateChange,
  onDeviceVoiceChange,
  onKokoroVoiceChange,
}: ReaderControlsProps) {
  return (
    <div className="reader-control-stack">
      <div className="reading-mode-switch" role="group" aria-label="Reading mode">
        <button type="button" aria-pressed={mode === "silent"} onClick={() => onModeChange("silent")}>Silent RSVP</button>
        <button type="button" aria-pressed={mode === "device"} disabled={!speechAvailable} onClick={() => onModeChange("device")}>Voice + RSVP</button>
        <button type="button" aria-pressed={mode === "kokoro"} onClick={() => onModeChange("kokoro")}>Kokoro Natural</button>
      </div>
      {mode !== "silent" && (
        <div className="voice-controls">
          <label>
            <span>Voice</span>
            {mode === "device" ? (
              <select value={selectedVoice} onChange={(event) => onDeviceVoiceChange(event.target.value)}>
                <option value="">Device default</option>
                {voices.map((voice) => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} · {voice.lang}</option>)}
              </select>
            ) : (
              <select value={kokoroVoice} onChange={(event) => onKokoroVoiceChange(event.target.value)}>
                {KOKORO_VOICES.map((voice) => <option key={voice.value} value={voice.value}>{voice.label}</option>)}
              </select>
            )}
          </label>
          <label className="voice-rate">
            <span>Speed</span>
            <input type="range" min="0.6" max="2" step="0.1" value={voiceRate} onChange={(event) => onVoiceRateChange(Number(event.target.value))} />
            <output>{voiceRate.toFixed(1)}×</output>
          </label>
        </div>
      )}
      <div className="reader-controls" aria-label="Reading controls">
      <button className="control-button control-button--quiet" type="button" onClick={onPrevious} aria-label="Previous token">
        <span aria-hidden="true">←</span>
      </button>
      <button className="control-button control-button--primary" type="button" onClick={onTogglePlay} aria-label={playing ? "Pause" : "Play"}>
        <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
        <span>{playing ? "Pause" : "Read"}</span>
      </button>
      <button className="control-button control-button--quiet" type="button" onClick={onNext} aria-label="Next token">
        <span aria-hidden="true">→</span>
      </button>
      {mode === "silent" ? <div className="wpm-stepper" aria-label="Reading speed">
        <button type="button" onClick={() => onWpmChange(wpm - 10)} aria-label="Decrease WPM">−</button>
        <output aria-live="polite" aria-label={slowdownActive ? `Temporarily slowed to ${displayWpm} WPM` : `${displayWpm} WPM`}>
          <strong>{displayWpm}</strong><span>{slowdownActive ? "SLOW" : "WPM"}</span>
        </output>
        <button type="button" onClick={() => onWpmChange(wpm + 10)} aria-label="Increase WPM">+</button>
      </div> : <div className="voice-speed-readout" aria-label={`${voiceRate.toFixed(1)} times voice speed`}><strong>{voiceRate.toFixed(1)}×</strong><span>VOICE</span></div>}
      </div>
    </div>
  );
}
