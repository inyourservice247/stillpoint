import type {
  FocusGuides,
  OrpIntensity,
  ReaderContrast,
  ReaderFont,
  ReaderProfile,
  ReaderSettings,
  ReaderTheme,
  ReaderWeight,
} from "../types/Book";

export type AppearanceSettings = Pick<ReaderSettings,
  "theme" | "fontFamily" | "fontSize" | "fontWeight" | "textContrast" | "orpIntensity" | "focusGuides"
>;

export const PROFILE_PRESETS: Record<Exclude<ReaderProfile, "custom">, AppearanceSettings> = {
  focus: {
    theme: "dark",
    fontFamily: "sans",
    fontSize: 76,
    fontWeight: 600,
    textContrast: "crisp",
    orpIntensity: "normal",
    focusGuides: "minimal",
  },
  night: {
    theme: "dark",
    fontFamily: "sans",
    fontSize: 72,
    fontWeight: 500,
    textContrast: "soft",
    orpIntensity: "subtle",
    focusGuides: "minimal",
  },
  paper: {
    theme: "sepia",
    fontFamily: "serif",
    fontSize: 74,
    fontWeight: 500,
    textContrast: "balanced",
    orpIntensity: "normal",
    focusGuides: "minimal",
  },
};

export const APPEARANCE_OPTIONS = {
  themes: ["dark", "sepia", "light"] as ReaderTheme[],
  fonts: ["sans", "serif", "mono"] as ReaderFont[],
  weights: [400, 500, 600, 700] as ReaderWeight[],
  contrasts: ["soft", "balanced", "crisp"] as ReaderContrast[],
  orpIntensities: ["subtle", "normal", "strong"] as OrpIntensity[],
  guides: ["off", "minimal", "strong"] as FocusGuides[],
};

export function applyProfile(settings: ReaderSettings, profile: Exclude<ReaderProfile, "custom">): ReaderSettings {
  return { ...settings, ...PROFILE_PRESETS[profile], profile };
}

export function inferProfile(settings: AppearanceSettings): ReaderProfile {
  for (const [profile, preset] of Object.entries(PROFILE_PRESETS)) {
    if ((Object.keys(preset) as Array<keyof AppearanceSettings>).every((key) => preset[key] === settings[key])) {
      return profile as Exclude<ReaderProfile, "custom">;
    }
  }
  return "custom";
}

export function updateAppearance<Key extends keyof AppearanceSettings>(
  settings: ReaderSettings,
  key: Key,
  value: AppearanceSettings[Key],
): ReaderSettings {
  const next = { ...settings, [key]: value };
  return { ...next, profile: inferProfile(next) };
}
