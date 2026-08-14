import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LoadedBook, ReaderSettings } from "../types/Book";
import { getOrpFit, splitAtOrp } from "../utils/orp";
import { findSentenceStart, getTokenDuration } from "../utils/timing";
import { updateBookProgress, writeCheckpoint } from "../utils/storage";
import { ContextPreview } from "./ContextPreview";
import { ReaderControls } from "./ReaderControls";
import { Settings } from "./Settings";

type ReaderProps = {
  book: LoadedBook;
  settings: ReaderSettings;
  onSettingsChange: (settings: ReaderSettings) => void;
  onExit: () => void;
};

export function Reader({ book, settings, onSettingsChange, onExit }: ReaderProps) {
  const [currentIndex, setCurrentIndex] = useState(book.currentIndex);
  const [playing, setPlaying] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [zen, setZen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => typeof window === "undefined" ? 1200 : window.innerWidth);
  const readerRef = useRef<HTMLElement>(null);
  const currentIndexRef = useRef(currentIndex);
  const playingRef = useRef(playing);
  const lastCheckpoint = useRef(0);
  const lastDatabaseSave = useRef(0);
  const jumpSaveTimer = useRef<number | null>(null);

  const token = book.tokens[currentIndex] ?? book.tokens[0];
  const barProgress = book.tokens.length <= 1 ? 100 : (currentIndex / (book.tokens.length - 1)) * 100;
  const parts = useMemo(() => splitAtOrp(token?.text ?? "", token?.orpIndex), [token]);
  const orpFit = getOrpFit(token?.text ?? "", settings.fontSize, viewportWidth);

  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { playingRef.current = playing; }, [playing]);

  const persist = useCallback(async () => {
    const index = currentIndexRef.current;
    writeCheckpoint(book.id, index);
    lastCheckpoint.current = Date.now();
    lastDatabaseSave.current = Date.now();
    await updateBookProgress(book.id, index);
  }, [book.id]);

  const jumpTo = useCallback((nextIndex: number, pause = true) => {
    const clamped = Math.max(0, Math.min(Math.round(nextIndex), book.tokens.length - 1));
    if (pause) setPlaying(false);
    currentIndexRef.current = clamped;
    setCurrentIndex(clamped);
    writeCheckpoint(book.id, clamped);
    if (jumpSaveTimer.current) window.clearTimeout(jumpSaveTimer.current);
    jumpSaveTimer.current = window.setTimeout(() => {
      void updateBookProgress(book.id, currentIndexRef.current);
    }, 220);
  }, [book.id, book.tokens.length]);

  const togglePlay = useCallback(() => {
    if (playingRef.current) {
      setPlaying(false);
      void persist();
      return;
    }
    if (currentIndexRef.current >= book.tokens.length - 1) {
      currentIndexRef.current = 0;
      setCurrentIndex(0);
    }
    setPlaying(true);
  }, [book.tokens.length, persist]);

  const changeWpm = useCallback((nextWpm: number) => {
    onSettingsChange({ ...settings, wpm: Math.max(100, Math.min(1000, Math.round(nextWpm / 10) * 10)) });
  }, [onSettingsChange, settings]);

  const toggleZen = useCallback(async () => {
    if (!zen) {
      setZen(true);
      try { await readerRef.current?.requestFullscreen?.(); } catch { /* CSS Zen still works. */ }
    } else {
      setZen(false);
      if (document.fullscreenElement) await document.exitFullscreen();
    }
  }, [zen]);

  const leaveReader = useCallback(async () => {
    setPlaying(false);
    await persist();
    onExit();
  }, [onExit, persist]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => { if (!document.fullscreenElement) setZen(false); };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    if (!playing || !token) return;
    const timer = window.setTimeout(() => {
      setCurrentIndex((index) => {
        if (index >= book.tokens.length - 1) {
          setPlaying(false);
          queueMicrotask(persist);
          return index;
        }
        return index + 1;
      });
    }, getTokenDuration(token, settings));
    return () => window.clearTimeout(timer);
  }, [book.tokens.length, persist, playing, settings, token]);

  useEffect(() => {
    const now = Date.now();
    if (now - lastCheckpoint.current >= 1_000) {
      writeCheckpoint(book.id, currentIndex, now);
      lastCheckpoint.current = now;
    }
    if (playing && now - lastDatabaseSave.current >= 4_000) {
      lastDatabaseSave.current = now;
      void updateBookProgress(book.id, currentIndex);
    }
  }, [book.id, currentIndex, playing]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.code === "Escape") {
        setShowSettings(false);
        if (!document.fullscreenElement) setZen(false);
        return;
      }
      if (showSettings || target?.matches("input, textarea, select, [contenteditable='true']")) return;

      const jump = event.shiftKey ? 10 : 1;
      if (event.code === "Space") { event.preventDefault(); togglePlay(); }
      else if (event.code === "ArrowLeft") { event.preventDefault(); jumpTo(currentIndexRef.current - jump); }
      else if (event.code === "ArrowRight") { event.preventDefault(); jumpTo(currentIndexRef.current + jump); }
      else if (event.code === "ArrowUp") { event.preventDefault(); changeWpm(settings.wpm + 10); }
      else if (event.code === "ArrowDown") { event.preventDefault(); changeWpm(settings.wpm - 10); }
      else if (event.code === "KeyR") { event.preventDefault(); jumpTo(findSentenceStart(book.sentenceStarts, currentIndexRef.current)); }
      else if (event.code === "KeyF") { event.preventDefault(); void toggleZen(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [book.sentenceStarts, changeWpm, jumpTo, settings.wpm, showSettings, togglePlay, toggleZen]);

  useEffect(() => {
    const checkpoint = () => writeCheckpoint(book.id, currentIndexRef.current);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        checkpoint();
        if (playingRef.current) setPlaying(false);
        void updateBookProgress(book.id, currentIndexRef.current);
      }
    };
    window.addEventListener("beforeunload", checkpoint);
    window.addEventListener("pagehide", checkpoint);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", checkpoint);
      window.removeEventListener("pagehide", checkpoint);
      document.removeEventListener("visibilitychange", onVisibility);
      checkpoint();
    };
  }, [book.id]);

  const fontClass = `reader-font--${settings.fontFamily}`;
  const currentWordNumber = Math.min(currentIndex + 1, book.tokens.length);
  const remaining = Math.max(0, book.tokens.length - currentWordNumber);
  const completionPercentage = currentIndex <= 0 ? 0 : (currentWordNumber / book.tokens.length) * 100;

  return (
    <main ref={readerRef} className={`reader-shell ${fontClass} ${playing ? "reader--playing" : ""} ${zen ? "reader--zen" : ""}`}>
      <header className="reader-topbar reader-chrome">
        <button className="text-button" type="button" onClick={() => void leaveReader()}><span aria-hidden="true">←</span> Library</button>
        <p title={book.filename}>{book.filename}</p>
        <div>
          <button className="icon-button" type="button" onClick={() => setShowSettings(true)} aria-label="Open settings">Aa</button>
          <button className="icon-button" type="button" onClick={() => void toggleZen()} aria-label="Toggle fullscreen Zen mode">⌗</button>
        </div>
      </header>

      <section className="word-stage" aria-live="off" aria-label={`Current word: ${token?.cleanText ?? ""}`}>
        <span className="orp-tick orp-tick--top" aria-hidden="true" />
        <div className="orp-word" data-testid="orp-word" style={{ fontSize: `${orpFit.fontSize}px`, "--orp-side-scale": orpFit.sideScale } as React.CSSProperties}>
          <span className="orp-left">{parts.left}</span>
          <b className="orp-focal" data-testid="orp-focal">{parts.focal}</b>
          <span className="orp-right">{parts.right}</span>
        </div>
        <span className="orp-tick orp-tick--bottom" aria-hidden="true" />
      </section>

      <ContextPreview tokens={book.tokens} currentIndex={currentIndex} visible={!playing} />

      <section className="reader-lower reader-chrome">
        <div className="progress-copy">
          <strong>{completionPercentage.toFixed(2)}%</strong>
          <span>{new Intl.NumberFormat().format(currentWordNumber)} / {new Intl.NumberFormat().format(book.tokens.length)}</span>
          <small>{new Intl.NumberFormat().format(remaining)} words remaining</small>
        </div>
        <input
          className="progress-range"
          type="range"
          min="0"
          max={Math.max(0, book.tokens.length - 1)}
          value={currentIndex}
          onInput={(event) => jumpTo(Number(event.currentTarget.value))}
          aria-label="Book progress"
          style={{ "--reader-progress": `${barProgress}%` } as React.CSSProperties}
        />
        <ReaderControls
          playing={playing}
          wpm={settings.wpm}
          onPrevious={() => jumpTo(currentIndex - 1)}
          onTogglePlay={togglePlay}
          onNext={() => jumpTo(currentIndex + 1)}
          onWpmChange={changeWpm}
        />
      </section>

      {zen && <button className="zen-exit reader-chrome" type="button" onClick={() => void toggleZen()}>Exit Zen</button>}
      {showSettings && <Settings settings={settings} onChange={onSettingsChange} onClose={() => setShowSettings(false)} />}
    </main>
  );
}
