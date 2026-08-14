import { useEffect, useRef, useState } from "react";
import type { LibraryEntry } from "../types/Book";

type LibraryProps = {
  entries: LibraryEntry[];
  processing: boolean;
  error: string | null;
  onFile: (file: File) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
};

export function Library({ entries, processing, error, onFile, onOpen, onDelete }: LibraryProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<LibraryEntry | null>(null);

  useEffect(() => {
    if (!pendingDelete) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape") setPendingDelete(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingDelete]);

  const chooseFile = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
  };

  return (
    <main className="library-shell">
      <header className="library-header">
        <a className="brand" href="#top" aria-label="Stillpoint home">
          <span className="brand-mark" aria-hidden="true"><i>S</i></span>
          <span><strong>Stillpoint</strong><small>Local RSVP reader</small></span>
        </a>
        <p className="privacy-note"><span aria-hidden="true">●</span> Your files stay on this device.</p>
      </header>

      <section className="library-intro" id="top">
        <p className="eyebrow">Read at the speed of focus</p>
        <h1>One word.<br /><em>One steady point.</em></h1>
        <p>Open a plain-text book and read without eye movement or clutter. Your library and exact place are saved only in this browser.</p>
      </section>

      <section
        className={`drop-zone ${dragging ? "drop-zone--active" : ""}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
        onDrop={(event) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files); }}
        aria-label="Open a TXT file"
      >
        <input ref={fileInput} type="file" accept=".txt,text/plain" onChange={(event) => chooseFile(event.target.files)} hidden />
        <div className="file-symbol" aria-hidden="true">TXT</div>
        <div>
          <h2>{processing ? "Preparing your book…" : dragging ? "Drop to open" : "Open a .txt file"}</h2>
          <p>{processing ? "Normalizing and finding meaningful reading units." : "Choose a file or drop it here. Nothing is uploaded."}</p>
        </div>
        <button className="open-file-button" type="button" disabled={processing} onClick={() => fileInput.current?.click()}>
          {processing ? "Working…" : "Choose TXT"}
        </button>
      </section>

      {error && <p className="library-error" role="alert">{error}</p>}

      <section className="recent-section" aria-labelledby="recent-heading">
        <div className="section-heading">
          <div><p className="eyebrow">Saved locally</p><h2 id="recent-heading">Recent reading</h2></div>
          <span>{entries.length} {entries.length === 1 ? "file" : "files"}</span>
        </div>

        {entries.length === 0 ? (
          <div className="empty-library">
            <span className="empty-line" aria-hidden="true" />
            <p>Your first book will appear here with its reading position ready to resume.</p>
          </div>
        ) : (
          <div className="book-list">
            {entries.map((entry) => {
              const currentWord = entry.currentIndex === 0 ? 0 : Math.min(entry.currentIndex + 1, entry.totalTokens);
              return (
                <article className="book-row" key={entry.id}>
                  <button className="book-main" type="button" onClick={() => onOpen(entry.id)}>
                    <span className="book-title"><strong>{entry.filename}</strong><small>Opened {formatRelativeDate(entry.lastOpened)}</small></span>
                    <span className="book-progress-copy"><strong>{formatNumber(currentWord)} <i>/</i> {formatNumber(entry.totalTokens)}</strong><small>{entry.percentage.toFixed(2)}% complete</small></span>
                    <span className="book-meter" aria-hidden="true"><i style={{ width: `${entry.percentage}%` }} /></span>
                    <span className="resume-label">{entry.currentIndex > 0 ? "Resume" : "Begin"} <span aria-hidden="true">→</span></span>
                  </button>
                  <button className="delete-button" type="button" onClick={() => setPendingDelete(entry)} aria-label={`Delete ${entry.filename}`}>×</button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <footer className="library-footer">
        <p>No account · No analytics · No network storage</p>
        <a href="/licenses/original-rsvp-speed-reader.txt" target="_blank" rel="noreferrer">Based on RSVP Speed Reader by Awal Ariansyah · MIT</a>
      </footer>

      {pendingDelete && (
        <div className="settings-backdrop" role="presentation">
          <section className="delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <p className="eyebrow">Remove local file</p>
            <h2 id="delete-title">Delete “{pendingDelete.filename}”?</h2>
            <p>This removes the saved text and reading position from this browser.</p>
            <div>
              <button type="button" onClick={() => setPendingDelete(null)}>Cancel</button>
              <button type="button" className="danger-button" onClick={() => { onDelete(pendingDelete.id); setPendingDelete(null); }}>Delete</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function formatRelativeDate(timestamp: number): string {
  const days = Math.floor((Date.now() - timestamp) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(timestamp);
}
