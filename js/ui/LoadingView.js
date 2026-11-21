/**
 * 載入特效元件（純 CSS 動畫，零外部相依）：
 * - `volorf` (Volorf KbbRbZ): 三方塊循環滑動 112x112 載入動畫 (.container > .box1, .box2, .box3)，搭配全畫面暗色遮罩 (dimmer)
 * - `orbit`: 雙環反向軌道＋核心脈衝
 * - `bars`: 律動頻譜柱＋掃描光束（適合地點搜尋下拉）
 */
export class LoadingView {
  static render(variant = 'volorf', message = '載入中…', { compact = false, overlay = false } = {}) {
    const safeMsg = String(message).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
    const sizeCls = compact ? 'hk-loader--compact' : '';
    const ovCls = overlay ? 'hk-loader--overlay hk-loader--dimmer' : '';

    if (variant === 'volorf') {
      return `
        <div class="hk-loader hk-loader--volorf ${sizeCls} ${ovCls}" role="status" aria-live="polite" aria-busy="true">
          <div class="hk-loader-card">
            <div class="container" aria-hidden="true">
              <div class="box1"></div>
              <div class="box2"></div>
              <div class="box3"></div>
            </div>
            <div class="hk-loader-label">${safeMsg}</div>
            ${overlay ? '<div class="hk-loader-sub">正在分析港鐵、巴士及小巴最短轉乘路線…</div>' : ''}
          </div>
        </div>
      `;
    }

    if (variant === 'bars') {
      return `
        <div class="hk-loader hk-loader--bars ${sizeCls} ${ovCls}" role="status" aria-live="polite" aria-busy="true">
          <div class="hk-bars-stage" aria-hidden="true">
            <span class="hk-bar"></span>
            <span class="hk-bar"></span>
            <span class="hk-bar"></span>
            <span class="hk-bar"></span>
            <span class="hk-bar"></span>
          </div>
          <div class="hk-loader-label">${safeMsg}</div>
        </div>
      `;
    }

    return `
      <div class="hk-loader hk-loader--orbit ${sizeCls} ${ovCls}" role="status" aria-live="polite" aria-busy="true">
        <div class="hk-orbit-stage" aria-hidden="true">
          <span class="hk-orbit-ring hk-orbit-ring--outer"></span>
          <span class="hk-orbit-ring hk-orbit-ring--inner"></span>
          <span class="hk-orbit-core"></span>
        </div>
        <div class="hk-loader-label">${safeMsg}</div>
      </div>
    `;
  }

  static showDimmer(variant = 'volorf', message = '正在計算最短時間…') {
    this.hideDimmer();
    document.body.insertAdjacentHTML('beforeend', this.render(variant, message, { overlay: true }));
    document.body.classList.add('hk-modal-open');
  }

  static hideDimmer() {
    document.querySelectorAll('.hk-loader--dimmer').forEach((el) => el.remove());
    document.body.classList.remove('hk-modal-open');
  }
}
//(註：內容由 AI 生成)
