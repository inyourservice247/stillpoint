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
  onVoiceRateChange: (rate: number) => void;
};

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
  onVoiceRateChange,
}: ReaderControlsProps) {
  const silent = mode === "silent";

  return (
    <div className="reader-control-stack">
      <div className="reader-controls" aria-label="Reading controls">
        <button className="control-button control-button--quiet" type="button" onClick={onPrevious} aria-label="Previous word">
          <span aria-hidden="true">←</span>
        </button>
        <button className="control-button control-button--primary" type="button" onClick={onTogglePlay} aria-label={playing ? "Pause" : "Play"}>
          {playing ? (
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m8 5 11 7-11 7z" /></svg>
          )}
        </button>
        <button className="control-button control-button--quiet" type="button" onClick={onNext} aria-label="Next word">
          <span aria-hidden="true">→</span>
        </button>

        <details className="speed-dropup">
          <summary aria-label={silent ? `${displayWpm} words per minute` : `${voiceRate.toFixed(1)} times voice speed`}>
            <strong>{silent ? displayWpm : `${voiceRate.toFixed(1)}×`}</strong>
            <span>{silent ? (slowdownActive ? "SLOW" : "WPM") : "SPEED"}</span>
          </summary>
          <div className="speed-dropup__panel">
            <header><span>{silent ? "Reading speed" : "Voice speed"}</span><output>{silent ? `${wpm} WPM` : `${voiceRate.toFixed(1)}×`}</output></header>
            {silent ? (
              <div className="speed-stepper">
                <button type="button" onClick={() => onWpmChange(wpm - 10)} aria-label="Decrease WPM">−</button>
                <input type="range" min="100" max="1000" step="10" value={wpm} onChange={(event) => onWpmChange(Number(event.target.value))} aria-label="Words per minute" />
                <button type="button" onClick={() => onWpmChange(wpm + 10)} aria-label="Increase WPM">+</button>
              </div>
            ) : (
              <input type="range" min="0.6" max="2" step="0.1" value={voiceRate} onChange={(event) => onVoiceRateChange(Number(event.target.value))} aria-label="Voice speed" />
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
