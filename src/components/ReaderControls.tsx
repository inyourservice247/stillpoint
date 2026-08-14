type ReaderControlsProps = {
  playing: boolean;
  wpm: number;
  onPrevious: () => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onWpmChange: (wpm: number) => void;
};

export function ReaderControls({
  playing,
  wpm,
  onPrevious,
  onTogglePlay,
  onNext,
  onWpmChange,
}: ReaderControlsProps) {
  return (
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
      <div className="wpm-stepper" aria-label="Reading speed">
        <button type="button" onClick={() => onWpmChange(wpm - 10)} aria-label="Decrease WPM">−</button>
        <output aria-live="polite"><strong>{wpm}</strong><span>WPM</span></output>
        <button type="button" onClick={() => onWpmChange(wpm + 10)} aria-label="Increase WPM">+</button>
      </div>
    </div>
  );
}
