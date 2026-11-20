export const TransportMode = Object.freeze({
  WALK: 'walk',
  MTR: 'mtr',
  BUS: 'bus',
  MINIBUS: 'minibus',
  FERRY: 'ferry',
});

export const ModeMeta = Object.freeze({
  walk:    { label: '步行', icon: '🚶', color: '#6b7280' },
  mtr:     { label: '港鐵', icon: '🚇', color: '#dc2626' },
  bus:     { label: '巴士', icon: '🚌', color: '#ea580c' },
  minibus: { label: '小巴', icon: '🚐', color: '#16a34a' },
  ferry:   { label: '渡輪', icon: '⛴️', color: '#0284c7' },
});

export const isTransit = (mode) => mode !== TransportMode.WALK;
