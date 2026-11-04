import { createLightTheme, type BrandVariants, type Theme } from '@fluentui/react-components';

// A calm "seedling" green brand ramp for Fluent UI v9 (10 = darkest … 160 = lightest).
const seeds: BrandVariants = {
  10: '#020905',
  20: '#0c1f13',
  30: '#10331d',
  40: '#134226',
  50: '#16512f',
  60: '#1a6139',
  70: '#1e7143',
  80: '#2f7d4f',
  90: '#46895f',
  100: '#5c966f',
  110: '#71a380',
  120: '#86b091',
  130: '#9bbda3',
  140: '#b0cab5',
  150: '#c5d8c8',
  160: '#dbe6dc',
};

export const theme: Theme = { ...createLightTheme(seeds) };
