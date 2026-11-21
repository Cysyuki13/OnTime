import { LoadingView } from './LoadingView.js';
import { LocationAutocompleteView } from './LocationAutocompleteView.js';
import { HKMapView } from './HKMapView.js';
import { Location } from '../models/Location.js';
import { CONFIG } from '../config.js';

export class EventFormView {
  constructor({ onSubmit, onCancel }) {
    this.onSubmit = onSubmit;
    this.onCancel = onCancel;
    this._originLocation = new Location(CONFIG.defaultOrigin);
    this._destLocation = null;

    this._mapView = new HKMapView({
      mode: 'picker',
      height: 250,
      defaultOpen: false,
      onPickLocation: (target, loc) => {
        if (target === 'origin') {
          this._originLocation = loc;
          this._originAutocomplete.setValue(this._root, loc.name);
          this._updateCoordBadge(this._root, 'origin', loc);
        } else {
          this._destLocation = loc;
          this._destAutocomplete.setValue(this._root, loc.name);
          this._updateCoordBadge(this._root, 'dest', loc);
        }
      },
    });

    this._originAutocomplete = new LocationAutocompleteView({
      idPrefix: 'origin',
      placeholder: '搜尋起點（或點擊右側定位／地圖圖示）…',
      onSelect: (loc) => {
        this._originLocation = loc;
        this._updateCoordBadge(this._root, 'origin', loc);
        this._mapView.setEndpoints({ origin: loc, focus: loc });
      },
      onClear: () => {
        this._originLocation = null;
        this._updateCoordBadge(this._root, 'origin', null);
        this._mapView.setEndpoints({ origin: null });
      },
    });

    this._destAutocomplete = new LocationAutocompleteView({
      idPrefix: 'dest',
      placeholder: '搜尋目的地（或點擊地圖圖示點選）…',
      onSelect: (loc) => {
        this._destLocation = loc;
        this._updateCoordBadge(this._root, 'dest', loc);
        this._mapView.setEndpoints({ destination: loc, focus: loc });
      },
      onClear: () => {
        this._destLocation = null;
        this._updateCoordBadge(this._root, 'dest', null);
        this._mapView.setEndpoints({ destination: null });
      },
    });
  }

  render() {
    return `
      <div class="card">
        <div class="card-title">新增行程</div>

        <div class="field">
          <label for="f-title">行程名稱</label>
          <input id="f-title" placeholder="例如：去科大上堂 / 中環開會" />
        </div>

        <div class="field">
          <label>出發起點</label>
          <div class="origin-row">
            ${this._originAutocomplete.render(this._originLocation.name)}
            <button type="button" class="btn btn-ghost btn-sm" id="btn-gps" title="使用目前 GPS 位置">定位</button>
          </div>
          <div class="selected-coords" id="coords-origin">
            座標：${this._originLocation.lat.toFixed(4)}, ${this._originLocation.lng.toFixed(4)}
          </div>
        </div>

        <div class="field">
          <div class="field-label-row">
            <label style="margin-bottom:0">目的地（地點搜尋或地圖選點）</label>
            ${this._mapView.renderToggleButton('地圖選點')}
          </div>
          ${this._destAutocomplete.render()}
          <div class="selected-coords" id="coords-dest" hidden></div>
        </div>

        <div class="field">
          ${this._mapView.render()}
        </div>

        <div class="field">
          <label for="f-time">希望到達時間</label>
          <input id="f-time" type="datetime-local" />
        </div>

        <button class="btn btn-primary btn-block" id="btn-save">規劃並儲存</button>
        <button class="btn btn-ghost btn-block" id="btn-cancel">取消</button>
      </div>
    `;
  }

  bind(root, autocompleteService) {
    this._root = root;
    this._originAutocomplete.bind(root, autocompleteService);
    this._destAutocomplete.bind(root, autocompleteService);
    this._mapView.bind(root);
    this._mapView.setEndpoints({ origin: this._originLocation, focus: this._originLocation });

    const input = root.querySelector('#f-time');
    const d = new Date(Date.now() + 90 * 60 * 1000);
    const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    input.value = localIso;

    const gpsBtn = root.querySelector('#btn-gps');
    gpsBtn?.addEventListener('click', async () => {
      const origGpsHtml = gpsBtn.innerHTML;
      gpsBtn.disabled = true;
      gpsBtn.innerHTML = LoadingView.render('orbit', '定位中…', { compact: true });
      try {
        const loc = await autocompleteService.getCurrentLocation();
        this._originLocation = loc;
        this._originAutocomplete.setValue(root, loc.name);
        this._updateCoordBadge(root, 'origin', loc);
        this._mapView.setEndpoints({ origin: loc, focus: loc });
      } catch (e) {
        alert(`無法獲取 GPS 位置：${e.message}\n你可直接輸入起點名稱搜尋或點擊地圖圖示點選。`);
      } finally {
        gpsBtn.disabled = false;
        gpsBtn.innerHTML = origGpsHtml;
      }
    });

    const saveBtn = root.querySelector('#btn-save');
    saveBtn.addEventListener('click', async () => {
      const title = root.querySelector('#f-title').value.trim();
      const timeVal = root.querySelector('#f-time').value;
      if (!title || !this._originLocation || !this._destLocation || !timeVal) {
        alert('請填寫名稱、選擇起點與目的地（可從下拉選單或地圖點選）、並設定時間');
        return;
      }
      saveBtn.disabled = true;
      LoadingView.showDimmer('volorf', '正在計算最短時間…');
      try {
        await this.onSubmit({
          title,
          origin: this._originLocation,
          destination: this._destLocation,
          targetArrival: new Date(timeVal),
        });
      } finally {
        LoadingView.hideDimmer();
        saveBtn.disabled = false;
      }
    });

    root.querySelector('#btn-cancel').addEventListener('click', () => {
      this._mapView.destroy();
      this.onCancel();
    });
  }

  _updateCoordBadge(root, type, loc) {
    const el = root?.querySelector(`#coords-${type}`);
    if (!el) return;
    if (loc?.hasCoords) {
      el.hidden = false;
      el.textContent = `座標：${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`;
    } else {
      el.hidden = true;
    }
  }
}
//(註：內容由 AI 生成)
