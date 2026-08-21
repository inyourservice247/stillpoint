import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LoadedBook, ReaderSettings } from "../types/Book";
import { getOrpFit, splitAtOrp } from "../utils/orp";
import { findSentenceStart, getTemporaryWpm, getTokenDuration } from "../utils/timing";
import { updateBookProgress, writeCheckpoint } from "../utils/storage";
import { ContextPreview } from "./ContextPreview";
import { ReaderControls } from "./ReaderControls";
import { Settings } from "./Settings";
import { useVoicePlayback } from "../hooks/useVoicePlayback";
import { normalizeVoiceRate } from "../utils/voice";

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
  const [slowdownActive, setSlowdownActive] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => typeof window === "undefined" ? 1200 : window.innerWidth);
  const readerRef = useRef<HTMLElement>(null);
  const currentIndexRef = useRef(currentIndex);
  const playingRef = useRef(playing);
  const slowdownRef = useRef(false);
  const lastCheckpoint = useRef(0);
  const lastDatabaseSave = useRef(0);
  const jumpSaveTimer = useRef<number | null>(null);

  const token = book.tokens[currentIndex] ?? book.tokens[0];
  const { wpm, longWordAssistance, adaptiveTiming, punctuationPauses, sentencePause, commaPause } = settings;
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

  const setVoiceIndex = useCallback((index: number) => {
    currentIndexRef.current = index;
    setCurrentIndex(index);
  }, []);

  const finishVoicePlayback = useCallback(() => {
    setPlaying(false);
    queueMicrotask(persist);
  }, [persist]);

  const voicePlayback = useVoicePlayback({
    book,
    settings,
    currentIndex,
    onIndex: setVoiceIndex,
    onFinish: finishVoicePlayback,
  });
  const cancelVoicePlayback = voicePlayback.cancel;

  const jumpTo = useCallback((nextIndex: number, pause = true) => {
    const clamped = Math.max(0, Math.min(Math.round(nextIndex), book.tokens.length - 1));
    if (pause) {
      setPlaying(false);
      cancelVoicePlayback();
    }
    currentIndexRef.current = clamped;
    setCurrentIndex(clamped);
    writeCheckpoint(book.id, clamped);
    if (jumpSaveTimer.current) window.clearTimeout(jumpSaveTimer.current);
    jumpSaveTimer.current = window.setTimeout(() => {
      void updateBookProgress(book.id, currentIndexRef.current);
    }, 220);
  }, [book.id, book.tokens.length, cancelVoicePlayback]);

  const togglePlay = useCallback(() => {
    if (playingRef.current) {
      setPlaying(false);
      if (settings.readingMode !== "silent") voicePlayback.pause();
      void persist();
      return;
    }
    if (currentIndexRef.current >= book.tokens.length - 1) {
      currentIndexRef.current = 0;
      setCurrentIndex(0);
    }
    if (settings.readingMode === "silent" || voicePlayback.start()) setPlaying(true);
  }, [book.tokens.length, persist, settings.readingMode, voicePlayback]);

  const changeWpm = useCallback((nextWpm: number) => {
    onSettingsChange({ ...settings, wpm: Math.max(100, Math.min(1000, Math.round(nextWpm / 10) * 10)) });
  }, [onSettingsChange, settings]);

  const changeSetting = useCallback(<Key extends keyof ReaderSettings>(key: Key, value: ReaderSettings[Key]) => {
    cancelVoicePlayback();
    setPlaying(false);
    onSettingsChange({ ...settings, [key]: value });
  }, [cancelVoicePlayback, onSettingsChange, settings]);

  const changeSettingsFromPanel = useCallback((nextSettings: ReaderSettings) => {
    const playbackSourceChanged = nextSettings.readingMode !== settings.readingMode
      || nextSettings.deviceVoice !== settings.deviceVoice
      || nextSettings.kokoroVoice !== settings.kokoroVoice;
    if (playbackSourceChanged) {
      cancelVoicePlayback();
      setPlaying(false);
    }
    onSettingsChange(nextSettings);
  }, [cancelVoicePlayback, onSettingsChange, settings.deviceVoice, settings.kokoroVoice, settings.readingMode]);

  const toggleZen = useCallback(async () => {
    if (!zen) {
      setZen(true);
      try { await readerRef.current?.requestFullscreen?.(); } catch { /* CSS Zen still works. */ }
    } else {
      setZen(false);
      if (document.fullscreenElement) await document.exitFullscreen();
    }
  }, [zen]);
  const closeSettings = useCallback(() => setShowSettings(false), []);

  const leaveReader = useCallback(async () => {
    setPlaying(false);
    voicePlayback.cancel();
    await persist();
    onExit();
  }, [onExit, persist, voicePlayback]);

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
    if (!playing || !token || settings.readingMode !== "silent") return;
    const timingSettings = {
      wpm: slowdownRef.current ? getTemporaryWpm(wpm) : wpm,
      longWordAssistance,
      adaptiveTiming,
      punctuationPauses,
      sentencePause,
      commaPause,
    };
    const timer = window.setTimeout(() => {
      setCurrentIndex((index) => {
        if (index >= book.tokens.length - 1) {
          setPlaying(false);
          queueMicrotask(persist);
          return index;
        }
        return index + 1;
      });
    }, getTokenDuration(token, timingSettings));
    return () => window.clearTimeout(timer);
  }, [adaptiveTiming, book.tokens.length, commaPause, longWordAssistance, persist, playing, punctuationPauses, sentencePause, settings.readingMode, token, wpm]);

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
      else if (event.code === "KeyS" && playingRef.current) {
        event.preventDefault();
        if (!slowdownRef.current) {
          slowdownRef.current = true;
          setSlowdownActive(true);
        }
      }
      else if (event.code === "ArrowLeft") { event.preventDefault(); jumpTo(currentIndexRef.current - jump); }
      else if (event.code === "ArrowRight") { event.preventDefault(); jumpTo(currentIndexRef.current + jump); }
      else if (event.code === "ArrowUp") { event.preventDefault(); changeWpm(settings.wpm + 10); }
      else if (event.code === "ArrowDown") { event.preventDefault(); changeWpm(settings.wpm - 10); }
      else if (event.code === "KeyR") { event.preventDefault(); jumpTo(findSentenceStart(book.sentenceStarts, currentIndexRef.current)); }
      else if (event.code === "KeyF") { event.preventDefault(); void toggleZen(); }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "KeyS" || !slowdownRef.current) return;
      slowdownRef.current = false;
      setSlowdownActive(false);
    };
    const releaseSlowdown = () => {
      slowdownRef.current = false;
      setSlowdownActive(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseSlowdown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", releaseSlowdown);
    };
  }, [book.sentenceStarts, changeWpm, jumpTo, settings.wpm, showSettings, togglePlay, toggleZen]);

  useEffect(() => {
    const checkpoint = () => writeCheckpoint(book.id, currentIndexRef.current);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        checkpoint();
        if (playingRef.current && settings.readingMode === "silent") {
          setPlaying(false);
        }
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
  }, [book.id, settings.readingMode]);

  const fontClass = `reader-font--${settings.fontFamily}`;
  const appearanceClasses = [
    `reader-theme--${settings.theme}`,
    `reader-contrast--${settings.textContrast}`,
    `reader-orp--${settings.orpIntensity}`,
    `reader-guides--${settings.focusGuides}`,
  ].join(" ");
  const displayWpm = slowdownActive ? getTemporaryWpm(settings.wpm) : settings.wpm;
  const currentWordNumber = Math.min(currentIndex + 1, book.tokens.length);
  const remaining = Math.max(0, book.tokens.length - currentWordNumber);
  const completionPercentage = currentIndex <= 0 ? 0 : (currentWordNumber / book.tokens.length) * 100;
  const estimatedSecondsRemaining = Math.round((remaining / (settings.readingMode === "silent" ? Math.max(1, displayWpm) : 165 * settings.voiceRate)) * 60);
  const estimatedMinutesRemaining = Math.ceil(estimatedSecondsRemaining / 60);
  const estimatedHoursRemaining = Math.floor(estimatedMinutesRemaining / 60);
  const estimatedMinuteRemainder = estimatedMinutesRemaining % 60;
  const estimatedTimeRemaining = remaining === 0
    ? "0 min"
    : estimatedSecondsRemaining < 60
      ? "<1 min"
      : estimatedHoursRemaining === 0
        ? `${estimatedMinutesRemaining} min`
        : estimatedMinuteRemainder === 0
          ? `${estimatedHoursRemaining} hr`
          : `${estimatedHoursRemaining} hr ${estimatedMinuteRemainder} min`;

  return (
    <main
      ref={readerRef}
      className={`reader-shell ${fontClass} ${appearanceClasses} ${playing ? "reader--playing" : ""} ${slowdownActive ? "reader--slowed" : ""} ${zen ? "reader--zen" : ""}`}
      style={{ "--reader-weight": settings.fontWeight } as React.CSSProperties}
    >
      <header className="reader-topbar reader-chrome">
        <button className="text-button" type="button" onClick={() => void leaveReader()}><span aria-hidden="true">←</span> Library</button>
        <p title={book.filename}>{book.filename}</p>
        <div>
          <button className="icon-button" type="button" onClick={() => setShowSettings(true)} aria-label="Open settings" title="Settings">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm9 3.5-2.1-1.1.2-2.4-2.6-1.5-1.9 1.4L12.5 7 12 4.7H9L8.5 7 6.4 8.4 4.5 7 1.9 8.5l.2 2.4L0 12l2.1 1.1-.2 2.4L4.5 17l1.9-1.4L8.5 17 9 19.3h3l.5-2.3 2.1-1.4 1.9 1.4 2.6-1.5-.2-2.4L21 12Z" /></svg>
          </button>
          <button className="icon-button" type="button" onClick={() => void toggleZen()} aria-label={zen ? "Exit fullscreen mode" : "Enter fullscreen mode"} title={zen ? "Exit fullscreen" : "Fullscreen"}>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 9V4h5v2H6v3H4Zm11-5h5v5h-2V6h-3V4ZM6 15v3h3v2H4v-5h2Zm12 0h2v5h-5v-2h3v-3Z" /></svg>
          </button>
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

      <section className="reader-lower">
        {voicePlayback.error && <p className="voice-error" role="alert">{voicePlayback.error}</p>}
        {settings.readingMode === "kokoro" && playing && voicePlayback.kokoroPlaybackStatus === "generating" && <p className="voice-status" role="status">Preparing the next spoken passage…</p>}
        {settings.readingMode === "kokoro" && voicePlayback.kokoroStatus === "ready" && (
          <p className="voice-status" role="status">
            {voicePlayback.kokoroBackend === "webgpu" ? "GPU accelerated" : "Processor mode"} · {Math.floor(voicePlayback.kokoroPreparedSeconds / 60)}:{Math.floor(voicePlayback.kokoroPreparedSeconds % 60).toString().padStart(2, "0")} prepared locally
          </p>
        )}
        <div className="progress-copy">
          <strong>{completionPercentage.toFixed(2)}%</strong>
          <span>{new Intl.NumberFormat().format(currentWordNumber)} / {new Intl.NumberFormat().format(book.tokens.length)}</span>
          <small>{new Intl.NumberFormat().format(remaining)} words · ~{estimatedTimeRemaining} left</small>
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
          displayWpm={displayWpm}
          slowdownActive={slowdownActive}
          onPrevious={() => jumpTo(currentIndex - 1)}
          onTogglePlay={togglePlay}
          onNext={() => jumpTo(currentIndex + 1)}
          onWpmChange={changeWpm}
          mode={settings.readingMode}
          voiceRate={settings.voiceRate}
          onVoiceRateChange={(rate) => changeSetting("voiceRate", normalizeVoiceRate(rate))}
        />
      </section>

      {zen && <button className="zen-exit reader-chrome" type="button" onClick={() => void toggleZen()}>Exit Zen</button>}
      {showSettings && (
        <Settings
          settings={settings}
          onChange={changeSettingsFromPanel}
          onClose={closeSettings}
          voices={voicePlayback.voices}
          speechAvailable={voicePlayback.speechAvailable}
          kokoroStatus={voicePlayback.kokoroStatus}
          kokoroProgress={voicePlayback.kokoroProgress}
          onPrepareKokoro={() => voicePlayback.prepareKokoro()}
          onRemoveKokoro={() => void voicePlayback.removeKokoro()}
        />
      )}
    </main>
  );
}
