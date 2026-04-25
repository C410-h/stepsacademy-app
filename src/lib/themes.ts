export const THEMES = {
  hello: {
    name: 'Default',
    primary: '#520A70',
    accent: '#C1FE00',
    background: '#F5F0E6',
    text: '#1D1D1B',
    textOnPrimary: '#FFFFFF',
    textOnAccent: '#1D1D1B',
    // dark purple reads well on cream bg
    brandOnBg: '#520A70',
    textOnBrandOnBg: '#FFFFFF',
    // CTA buttons
    buttonBg: '#520A70',
    buttonText: '#FFFFFF',
    // check icon on done-step tiles (must pop against brandOnBg)
    stepCheckColor: '#C1FE00',
    card: '#FFFFFF',
    cardText: '#1D1D1B',
    muted: '#EDE8DC',
    mutedText: '#6B6860',
    border: '#D9D4CA',
  },
  ola: {
    name: 'Olá', // hidden from switcher
    primary: '#C1FE00',
    accent: '#1D1D1B',
    background: '#F9FFE6',
    text: '#1D1D1B',
    textOnPrimary: '#1D1D1B',
    textOnAccent: '#FFFFFF',
    // lime primary is invisible on pale bg — use near-black instead
    brandOnBg: '#1D1D1B',
    textOnBrandOnBg: '#FFFFFF',
    // CTA buttons use lime (primary) not near-black
    buttonBg: '#C1FE00',
    buttonText: '#1D1D1B',
    // check icon on done-step tiles (lime pops on near-black tile)
    stepCheckColor: '#C1FE00',
    card: '#FFFFFF',
    cardText: '#1D1D1B',
    muted: '#F0FFCC',
    mutedText: '#5A6A2A',
    border: '#D8EDAA',
  },
  bonjour: {
    name: 'Dark Mode',
    primary: '#15012A',
    accent: '#FF97CB',
    background: '#0D0118',
    text: '#F5F0E6',
    textOnPrimary: '#F5F0E6',
    textOnAccent: '#15012A',
    // pink accent reads well on dark bg — primary is too dark to see
    brandOnBg: '#FF97CB',
    textOnBrandOnBg: '#15012A',
    // CTA buttons use pink accent since primary is near-invisible on dark bg
    buttonBg: '#FF97CB',
    buttonText: '#15012A',
    // check icon on done-step tiles (white on pink tile)
    stepCheckColor: '#FFFFFF',
    card: '#1A0830',
    cardText: '#F5F0E6',
    muted: '#150225',
    mutedText: '#B8A8CC',
    border: '#2D0850',
  },
  hallo: {
    name: 'Soft Mode',
    primary: '#FF97CB',
    accent: '#520A70',
    background: '#FFF0F8',
    text: '#1D1D1B',
    textOnPrimary: '#1D1D1B',
    textOnAccent: '#FFFFFF',
    // pink primary is low-contrast on pale-pink bg — use purple accent instead
    brandOnBg: '#520A70',
    textOnBrandOnBg: '#FFFFFF',
    // CTA buttons use pink (primary)
    buttonBg: '#FF97CB',
    buttonText: '#1D1D1B',
    // check icon on done-step tiles (pink pops on purple tile)
    stepCheckColor: '#FF97CB',
    card: '#FFFFFF',
    cardText: '#1D1D1B',
    muted: '#FFE0F0',
    mutedText: '#7A3060',
    border: '#F0C0E0',
  },
  default: {
    name: 'Black & White',
    primary: '#1D1D1B',
    accent: '#F5F0E6',
    background: '#FFFFFF',
    text: '#1D1D1B',
    textOnPrimary: '#FFFFFF',
    textOnAccent: '#1D1D1B',
    // black primary always reads on white
    brandOnBg: '#1D1D1B',
    textOnBrandOnBg: '#FFFFFF',
    // CTA buttons
    buttonBg: '#1D1D1B',
    buttonText: '#FFFFFF',
    // check icon on done-step tiles (white on black tile)
    stepCheckColor: '#FFFFFF',
    card: '#FFFFFF',
    cardText: '#1D1D1B',
    muted: '#F4F4F5',
    mutedText: '#71717A',
    border: '#E4E4E7',
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
  root.style.setProperty('--theme-brand-on-bg', t.brandOnBg);
  root.style.setProperty('--theme-text-on-brand', t.textOnBrandOnBg);
  // CTA button colours — distinct from brandOnBg so Olá gets lime buttons not near-black
  root.style.setProperty('--theme-button-bg', t.buttonBg);
  root.style.setProperty('--theme-button-text', t.buttonText);
  // check icon on done-step tiles
  root.style.setProperty('--theme-step-check', t.stepCheckColor);
  // HSL versions so Tailwind opacity modifiers work (text-theme-brand/60 etc.)
  root.style.setProperty('--theme-brand', hexToHslChannels(t.brandOnBg));
  root.style.setProperty('--theme-on-brand', hexToHslChannels(t.textOnBrandOnBg));

  // --- Override shadcn HSL vars so bg-primary / bg-background etc auto-update ---
  root.style.setProperty('--primary', hexToHslChannels(t.primary));
  root.style.setProperty('--primary-foreground', hexToHslChannels(t.textOnPrimary));
  root.style.setProperty('--background', hexToHslChannels(t.background));
  root.style.setProperty('--foreground', hexToHslChannels(t.text));
  root.style.setProperty('--accent', hexToHslChannels(t.accent));
  root.style.setProperty('--accent-foreground', hexToHslChannels(t.textOnAccent));

  // --- Card, muted, border (needed for dark themes like Bonjour) ---
  root.style.setProperty('--card', hexToHslChannels(t.card));
  root.style.setProperty('--card-foreground', hexToHslChannels(t.cardText));
  root.style.setProperty('--muted', hexToHslChannels(t.muted));
  root.style.setProperty('--muted-foreground', hexToHslChannels(t.mutedText));
  root.style.setProperty('--border', hexToHslChannels(t.border));
  root.style.setProperty('--popover', hexToHslChannels(t.card));
  root.style.setProperty('--popover-foreground', hexToHslChannels(t.cardText));
  // secondary = muted so Badge variant="secondary" picks up theme muted, not purple
  root.style.setProperty('--secondary', hexToHslChannels(t.muted));
  root.style.setProperty('--secondary-foreground', hexToHslChannels(t.mutedText));
  // ring follows brand so focus rings match theme instead of hardcoded purple
  root.style.setProperty('--ring', hexToHslChannels(t.brandOnBg));

  // --- Body bg (covers pre-React mount area) ---
  document.body.style.background = t.background;
  document.body.style.color = t.text;
}
