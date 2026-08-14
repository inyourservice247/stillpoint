import type {
  FocusGuides,
  LongWordAssistance,
  OrpIntensity,
  ReaderContrast,
  ReaderFont,
  ReaderProfile,
  ReaderSettings,
  ReaderTheme,
  ReaderWeight,
} from "../types/Book";
import { applyProfile, updateAppearance } from "../utils/appearance";

type SettingsProps = {
  settings: ReaderSettings;
  onChange: (settings: ReaderSettings) => void;
  onClose: () => void;
};

type Choice<Value extends string | number> = { value: Value; label: string };

type ChoiceGroupProps<Value extends string | number> = {
  label: string;
  value: Value;
  choices: Array<Choice<Value>>;
  onChange: (value: Value) => void;
  className?: string;
};

function ChoiceGroup<Value extends string | number>({ label, value, choices, onChange, className = "" }: ChoiceGroupProps<Value>) {
  return (
    <div className={`choice-group ${className}`} role="group" aria-label={label}>
      {choices.map((choice) => (
        <button
          key={choice.value}
          type="button"
          aria-pressed={choice.value === value}
          onClick={() => onChange(choice.value)}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}

const PROFILE_CHOICES: Array<Choice<ReaderProfile>> = [
  { value: "focus", label: "Focus" },
  { value: "night", label: "Night" },
  { value: "paper", label: "Paper" },
  { value: "custom", label: "Custom" },
];
const THEME_CHOICES: Array<Choice<ReaderTheme>> = [
  { value: "dark", label: "Dark" },
  { value: "sepia", label: "Sepia" },
  { value: "light", label: "Light" },
];
const FONT_CHOICES: Array<Choice<ReaderFont>> = [
  { value: "sans", label: "Sans" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Mono" },
];
const WEIGHT_CHOICES: Array<Choice<ReaderWeight>> = [
  { value: 400, label: "Regular" },
  { value: 500, label: "Medium" },
  { value: 600, label: "Semi-bold" },
  { value: 700, label: "Bold" },
];
const ORP_CHOICES: Array<Choice<OrpIntensity>> = [
  { value: "subtle", label: "Subtle" },
  { value: "normal", label: "Normal" },
  { value: "strong", label: "Strong" },
];
const GUIDE_CHOICES: Array<Choice<FocusGuides>> = [
  { value: "off", label: "Off" },
  { value: "minimal", label: "Minimal" },
  { value: "strong", label: "Strong" },
];
const ASSISTANCE_CHOICES: Array<Choice<LongWordAssistance>> = [
  { value: "off", label: "Off" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];
const CONTRASTS: ReaderContrast[] = ["soft", "balanced", "crisp"];

export function Settings({ settings, onChange, onClose }: SettingsProps) {
  const set = <Key extends keyof ReaderSettings>(key: Key, value: ReaderSettings[Key]) => {
    onChange({ ...settings, [key]: value });
  };
  const setAppearance = <Key extends Parameters<typeof updateAppearance>[1]>(
    key: Key,
    value: Parameters<typeof updateAppearance<Key>>[2],
  ) => onChange(updateAppearance(settings, key, value));

  const chooseProfile = (profile: ReaderProfile) => {
    onChange(profile === "custom" ? { ...settings, profile } : applyProfile(settings, profile));
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

        <section className="settings-section" aria-labelledby="profile-heading">
          <h3 id="profile-heading">Reading profile</h3>
          <ChoiceGroup label="Reading profile" value={settings.profile} choices={PROFILE_CHOICES} onChange={chooseProfile} className="choice-group--profiles" />
        </section>

        <section className="settings-section" aria-labelledby="appearance-heading">
          <h3 id="appearance-heading">Appearance</h3>
          <div className="compact-setting">
            <span><strong>Theme</strong><small>Comfortable page tone</small></span>
            <ChoiceGroup label="Theme" value={settings.theme} choices={THEME_CHOICES} onChange={(value) => setAppearance("theme", value)} />
          </div>
          <div className="compact-setting">
            <span><strong>Font</strong><small>System font stacks</small></span>
            <ChoiceGroup label="Font" value={settings.fontFamily} choices={FONT_CHOICES} onChange={(value) => setAppearance("fontFamily", value)} />
          </div>
          <div className="range-setting">
            <span><label htmlFor="setting-font-size"><strong>Text size</strong></label><small>{settings.fontSize}px maximum</small></span>
            <div className="range-with-ends">
              <button type="button" onClick={() => setAppearance("fontSize", Math.max(36, settings.fontSize - 4))} aria-label="Decrease text size">A−</button>
              <input id="setting-font-size" type="range" min="36" max="112" step="2" value={settings.fontSize} onChange={(event) => setAppearance("fontSize", Number(event.target.value))} />
              <button type="button" onClick={() => setAppearance("fontSize", Math.min(112, settings.fontSize + 4))} aria-label="Increase text size">A+</button>
            </div>
          </div>
          <div className="compact-setting compact-setting--stacked">
            <span><strong>Weight</strong><small>Real font weight, without filters</small></span>
            <ChoiceGroup label="Text weight" value={settings.fontWeight} choices={WEIGHT_CHOICES} onChange={(value) => setAppearance("fontWeight", value)} />
          </div>
          <div className="range-setting">
            <span><label htmlFor="setting-contrast"><strong>Contrast</strong></label><small>Adjust reading crispness safely</small></span>
            <div className="contrast-control">
              <span>Soft</span>
              <input
                id="setting-contrast"
                type="range"
                min="0"
                max="2"
                step="1"
                value={CONTRASTS.indexOf(settings.textContrast)}
                onChange={(event) => setAppearance("textContrast", CONTRASTS[Number(event.target.value)])}
              />
              <span>Crisp</span>
            </div>
          </div>
        </section>

        <section className="settings-section" aria-labelledby="focus-heading">
          <h3 id="focus-heading">Focus</h3>
          <div className="compact-setting">
            <span><strong>Focus character</strong><small>ORP prominence</small></span>
            <ChoiceGroup label="Focus character intensity" value={settings.orpIntensity} choices={ORP_CHOICES} onChange={(value) => setAppearance("orpIntensity", value)} />
          </div>
          <div className="compact-setting">
            <span><strong>Focus guides</strong><small>Indicators around the fixed point</small></span>
            <ChoiceGroup label="Focus guides" value={settings.focusGuides} choices={GUIDE_CHOICES} onChange={(value) => setAppearance("focusGuides", value)} />
          </div>
        </section>

        <section className="settings-section" aria-labelledby="reading-heading">
          <h3 id="reading-heading">Reading</h3>
          <div className="range-setting">
            <span><label htmlFor="setting-wpm"><strong>Speed</strong></label><small>{settings.wpm} words per minute</small></span>
            <input id="setting-wpm" type="range" min="100" max="1000" step="10" value={settings.wpm} onChange={(event) => set("wpm", Number(event.target.value))} />
          </div>
          <div className="compact-setting compact-setting--stacked">
            <span><strong>Long-word assistance</strong><small>Extra time for complex words</small></span>
            <ChoiceGroup label="Long-word assistance" value={settings.longWordAssistance} choices={ASSISTANCE_CHOICES} onChange={(value) => set("longWordAssistance", value)} />
          </div>
          <div className="toggle-row">
            <span><label htmlFor="setting-adaptive-timing"><strong>Adaptive timing</strong></label><small>Apply long-word assistance during playback</small></span>
            <input id="setting-adaptive-timing" type="checkbox" checked={settings.adaptiveTiming} onChange={(event) => set("adaptiveTiming", event.target.checked)} />
          </div>
          <div className="toggle-row">
            <span><label htmlFor="setting-punctuation-pauses"><strong>Punctuation pauses</strong></label><small>Pause at clauses, sentences and paragraphs</small></span>
            <input id="setting-punctuation-pauses" type="checkbox" checked={settings.punctuationPauses} onChange={(event) => set("punctuationPauses", event.target.checked)} />
          </div>
          <details className="advanced-settings">
            <summary>Advanced pause lengths</summary>
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
          </details>
        </section>

        <p className="shortcut-note"><kbd>Space</kbd> play · hold <kbd>S</kbd> slow · <kbd>←</kbd><kbd>→</kbd> move · <kbd>R</kbd> sentence · <kbd>F</kbd> Zen</p>
      </section>
    </div>
  );
}
