import type { ReaderFont, ReaderSettings } from "../types/Book";

type SettingsProps = {
  settings: ReaderSettings;
  onChange: (settings: ReaderSettings) => void;
  onClose: () => void;
};

export function Settings({ settings, onChange, onClose }: SettingsProps) {
  const set = <Key extends keyof ReaderSettings>(key: Key, value: ReaderSettings[Key]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header>
          <div>
            <p className="eyebrow">Reading preferences</p>
            <h2 id="settings-title">Settings</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close settings">×</button>
        </header>

        <div className="setting-row">
          <span><label htmlFor="setting-wpm"><strong>Speed</strong></label><small>{settings.wpm} words per minute</small></span>
          <input id="setting-wpm" type="range" min="100" max="1000" step="10" value={settings.wpm} onChange={(event) => set("wpm", Number(event.target.value))} />
        </div>

        <div className="setting-row">
          <span><label htmlFor="setting-font-size"><strong>Word size</strong></label><small>{settings.fontSize}px maximum</small></span>
          <input id="setting-font-size" type="range" min="36" max="112" step="2" value={settings.fontSize} onChange={(event) => set("fontSize", Number(event.target.value))} />
        </div>

        <div className="setting-row setting-row--select">
          <span><label htmlFor="setting-font-family"><strong>Typeface</strong></label><small>Choose the reading voice</small></span>
          <select id="setting-font-family" value={settings.fontFamily} onChange={(event) => set("fontFamily", event.target.value as ReaderFont)}>
            <option value="sans">Sans</option>
            <option value="serif">Serif</option>
            <option value="mono">Mono</option>
          </select>
        </div>

        <div className="toggle-row">
          <span><label htmlFor="setting-adaptive-timing"><strong>Adaptive timing</strong></label><small>Give compounds and long words more time</small></span>
          <input id="setting-adaptive-timing" type="checkbox" checked={settings.adaptiveTiming} onChange={(event) => set("adaptiveTiming", event.target.checked)} />
        </div>

        <div className="toggle-row">
          <span><label htmlFor="setting-punctuation-pauses"><strong>Punctuation pauses</strong></label><small>Pause at clauses, sentences and paragraphs</small></span>
          <input id="setting-punctuation-pauses" type="checkbox" checked={settings.punctuationPauses} onChange={(event) => set("punctuationPauses", event.target.checked)} />
        </div>

        <div className="setting-pair">
          <label>
            <span>Comma pause</span>
            <input type="number" min="0" max="500" step="10" value={settings.commaPause} onChange={(event) => set("commaPause", Number(event.target.value))} />
            <small>milliseconds</small>
          </label>
          <label>
            <span>Sentence pause</span>
            <input type="number" min="0" max="1200" step="10" value={settings.sentencePause} onChange={(event) => set("sentencePause", Number(event.target.value))} />
            <small>milliseconds</small>
          </label>
        </div>

        <p className="shortcut-note"><kbd>Space</kbd> play · <kbd>←</kbd><kbd>→</kbd> move · <kbd>R</kbd> sentence · <kbd>F</kbd> Zen</p>
      </section>
    </div>
  );
}
