import { useRef } from "react";
import type { BookChapter, ReadingMode } from "../types/Book";

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
  chapters: BookChapter[];
  currentIndex: number;
  onChapterChange: (index: number) => void;
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
  chapters,
  currentIndex,
  onChapterChange,
}: ReaderControlsProps) {
  const silent = mode === "silent";
  const chapterDetailsRef = useRef<HTMLDetailsElement>(null);
  const speedDetailsRef = useRef<HTMLDetailsElement>(null);
  const activeChapter = chapters.reduce<BookChapter | null>((active, chapter) => chapter.index <= currentIndex ? chapter : active, null);

  return (
    <div className="reader-control-stack">
      <div className={`reader-controls ${chapters.length ? "reader-controls--chapters" : ""}`} aria-label="Reading controls">
        {chapters.length > 0 && (
          <details ref={chapterDetailsRef} className="chapter-dropup">
            <summary aria-label={activeChapter ? `Chapters. Current chapter: ${activeChapter.title}` : "Chapters"} title="Chapters" onClick={() => speedDetailsRef.current?.removeAttribute("open")}>
              <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" /></svg>
            </summary>
            <div className="chapter-dropup__panel">
              <header><span>Chapters</span><small>{chapters.length}</small></header>
              <div>
                {chapters.map((chapter) => (
                  <button
                    key={`${chapter.index}:${chapter.title}`}
                    type="button"
                    aria-current={chapter === activeChapter ? "true" : undefined}
                    style={{ paddingInlineStart: `${12 + Math.min(3, chapter.level - 1) * 10}px` }}
                    onClick={() => {
                      chapterDetailsRef.current?.removeAttribute("open");
                      onChapterChange(chapter.index);
                    }}
                  >
                    <span>{chapter.title}</span><small>{chapter.level === 1 ? "Chapter" : `Heading ${chapter.level}`}</small>
                  </button>
                ))}
              </div>
            </div>
          </details>
        )}
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

        <details ref={speedDetailsRef} className="speed-dropup">
          <summary aria-label={silent ? `${displayWpm} words per minute` : `${voiceRate.toFixed(1)} times voice speed`} onClick={() => chapterDetailsRef.current?.removeAttribute("open")}>
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
