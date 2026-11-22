export const TransportMode = Object.freeze({
  WALK: 'walk',
  MTR: 'mtr',
  BUS: 'bus',
  MINIBUS: 'minibus',
  LRT: 'lrt', // 輕鐵 Light Rail
  TAXI: 'taxi',
});

const ICON_BASE = 'icons/modes';

/**
 * Mode metadata — icons are custom HK-style SVG assets.
 * Use modeIconHtml(mode) for consistent <img> rendering.
 */
export const ModeMeta = Object.freeze({
  walk: {
    label: '步行',
    icon: '🚶',
    iconUrl: `${ICON_BASE}/walk.svg`,
    color: '#4B5563',
  },
  mtr: {
    label: '港鐵',
    icon: '🚇',
    iconUrl: `${ICON_BASE}/mtr.svg`,
    color: '#C8102E',
  },
  bus: {
    label: '巴士',
    icon: '🚌',
    iconUrl: `${ICON_BASE}/kmb.svg`, // KMB-style icon for bus
    color: '#E30613',
  },
  minibus: {
    label: '小巴',
    icon: '🚐',
    iconUrl: `${ICON_BASE}/minibus.svg`,
    color: '#16A34A',
  },
  lrt: {
    label: '輕鐵',
    icon: '🚊',
    iconUrl: `${ICON_BASE}/lrt.svg`,
    color: '#C45C26',
  },
  taxi: {
    label: '的士',
    icon: '🚕',
    iconUrl: `${ICON_BASE}/taxi.svg`,
    color: '#C41E3A',
  },
});

export const isTransit = (mode) => mode !== TransportMode.WALK;

/** HTML snippet for a mode icon (img with emoji fallback text). */
export function modeIconHtml(mode, { size = 18, className = 'mode-icon-img' } = {}) {
  const meta = ModeMeta[mode];
  if (!meta) return `<span class="${className}">·</span>`;
  const url = meta.iconUrl;
  if (url) {
    return `<img class="${className}" src="${url}" width="${size}" height="${size}" alt="${meta.label}" draggable="false" />`;
  }
  return `<span class="${className}">${meta.icon}</span>`;
}
