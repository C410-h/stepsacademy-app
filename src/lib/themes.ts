export const THEMES = {
  hello: {
    name: 'Hello',
    primary: '#520A70',
    accent: '#C1FE00',
    background: '#F5F0E6',
    text: '#1D1D1B',
    textOnPrimary: '#FFFFFF',
    textOnAccent: '#1D1D1B',
  },
  ola: {
    name: 'Olá',
    primary: '#C1FE00',
    accent: '#1D1D1B',
    background: '#F9FFE6',
    text: '#1D1D1B',
    textOnPrimary: '#1D1D1B',
    textOnAccent: '#FFFFFF',
  },
  bonjour: {
    name: 'Bonjour',
    primary: '#15012A',
    accent: '#FF97CB',
    background: '#0D0118',
    text: '#F5F0E6',
    textOnPrimary: '#F5F0E6',
    textOnAccent: '#15012A',
  },
  hallo: {
    name: 'Hallo',
    primary: '#FF97CB',
    accent: '#520A70',
    background: '#FFF0F8',
    text: '#1D1D1B',
    textOnPrimary: '#1D1D1B',
    textOnAccent: '#FFFFFF',
  },
  default: {
    name: 'Clássico',
    primary: '#1D1D1B',
    accent: '#F5F0E6',
    background: '#FFFFFF',
    text: '#1D1D1B',
    textOnPrimary: '#FFFFFF',
    textOnAccent: '#1D1D1B',
  },
} as const;

export type ThemeKey = keyof typeof THEMES;

function hexToHslChannels(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function applyTheme(key: ThemeKey): void {
  const t = THEMES[key];
  const root = document.documentElement;

  // --- Hex vars (used by ThemeSwitcher and tailwind aliases) ---
  root.style.setProperty('--theme-primary', t.primary);
  root.style.setProperty('--theme-accent', t.accent);
  root.style.setProperty('--theme-background', t.background);
  root.style.setProperty('--theme-text', t.text);
  root.style.setProperty('--theme-text-on-primary', t.textOnPrimary);
  root.style.setProperty('--theme-text-on-accent', t.textOnAccent);

  // --- Override shadcn HSL vars so bg-primary / bg-background etc auto-update ---
  root.style.setProperty('--primary', hexToHslChannels(t.primary));
  root.style.setProperty('--primary-foreground', hexToHslChannels(t.textOnPrimary));
  root.style.setProperty('--background', hexToHslChannels(t.background));
  root.style.setProperty('--foreground', hexToHslChannels(t.text));
  // accent slot → theme accent
  root.style.setProperty('--accent', hexToHslChannels(t.accent));
  root.style.setProperty('--accent-foreground', hexToHslChannels(t.textOnAccent));

  // --- Body bg (covers pre-React mount area) ---
  document.body.style.background = t.background;
  document.body.style.color = t.text;
}
