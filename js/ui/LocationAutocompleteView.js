import { LoadingView } from './LoadingView.js';

export class LocationAutocompleteView {
  constructor({ onSelect, onClear, placeholder = '搜尋香港地圖地點、大廈或車站…', idPrefix = 'loc' }) {
    this.onSelect = onSelect;
    this.onClear = onClear;
    this.placeholder = placeholder;
    this.idPrefix = idPrefix;
    this._timer = null;
  }

  render(initialValue = '') {
    return `
      <div class="autocomplete-wrap" data-autocomplete="${this.idPrefix}">
        <input
          class="autocomplete-input"
          type="text"
          placeholder="${this.placeholder}"
          value="${this._esc(initialValue)}"
          autocomplete="off"
        />
        <div class="autocomplete-list" hidden></div>
      </div>
    `;
  }

  bind(root, autocompleteService) {
    const wrap = root.querySelector(`[data-autocomplete="${this.idPrefix}"]`);
    if (!wrap) return;
    const input = wrap.querySelector('.autocomplete-input');
    const list = wrap.querySelector('.autocomplete-list');

    input.addEventListener('input', () => {
      clearTimeout(this._timer);
      this.onClear?.();
      const q = input.value.trim();
      if (q.length < 1) {
        list.hidden = true;
        return;
      }

      this._timer = setTimeout(async () => {
        list.innerHTML = `<div class="autocomplete-status">${LoadingView.render('bars', '搜尋地點中…', { compact: true })}</div>`;
        list.hidden = false;

        const results = await autocompleteService.search(q);
        if (!results.length) {
          list.innerHTML = '<div class="autocomplete-status">找不到相符地點，請嘗試更具體的名稱</div>';
          return;
        }

        const badgeMap = {
          landmark: 'LM',
          hkdb: 'DB',
          hkgeo: 'GEO',
          osm: 'OSM',
          mtr: 'MTR',
          kmb: 'BM',
        };

        list.innerHTML = results
          .map(
            (loc, i) => `
              <div class="autocomplete-item" data-idx="${i}">
                <div class="autocomplete-body">
                  <div class="autocomplete-name">${this._esc(loc.name)}</div>
                  ${loc.address ? `<div class="autocomplete-sub">${this._esc(loc.address)}</div>` : ''}
                </div>
                <span class="card-badge">${badgeMap[loc.source] ?? '·'}</span>
              </div>
            `
          )
          .join('');

        list.querySelectorAll('.autocomplete-item').forEach((el) => {
          el.addEventListener('click', () => {
            const loc = results[Number(el.dataset.idx)];
            input.value = loc.name;
            list.hidden = true;
            this.onSelect(loc);
          });
        });
      }, 220);
    });

    input.addEventListener('blur', () => {
      setTimeout(() => { list.hidden = true; }, 220);
    });
  }

  setValue(root, text) {
    const wrap = root.querySelector(`[data-autocomplete="${this.idPrefix}"]`);
    const input = wrap?.querySelector('.autocomplete-input');
    if (input) input.value = text;
  }

  _esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
}
//(註：內容由 AI 生成)
