import { StorageService } from '../services/StorageService.js';
import { EventService } from '../services/EventService.js';
import { NotificationService } from '../services/NotificationService.js';
import { PlaceAutocompleteService } from '../services/PlaceAutocompleteService.js';
import { UnifiedTransitEtaService } from '../services/UnifiedTransitEtaService.js';
import { EventListView } from '../ui/EventListView.js';
import { EventFormView } from '../ui/EventFormView.js';
import { EventDetailView } from '../ui/EventDetailView.js';
import { LoadingView } from '../ui/LoadingView.js';

export class AppController {
  constructor(root) {
    this.root = root;

    const storage = new StorageService();
    const notificationService = new NotificationService();
    this.autocompleteService = new PlaceAutocompleteService();
    const etaService = new UnifiedTransitEtaService();

    this.eventService = new EventService({
      storage, etaService, notificationService,
    });
    this.notificationService = notificationService;
  }

  async start() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch((e) => console.warn(e));
    }

    await this.notificationService.ensurePermission();
    this._showList();

    setInterval(() => this._autoRefresh(), 15 * 60 * 1000);
  }

  _showList() {
    const view = new EventListView({
      onAdd: () => this._showForm(),
      onSelect: (id) => this._showDetail(id),
    });
    LoadingView.hideDimmer();
    this.root.innerHTML = view.render(this.eventService.list());
    view.bind(this.root);
  }

  _showForm() {
    const view = new EventFormView({
      onCancel: () => this._showList(),
      onSubmit: async (input) => {
        await this.eventService.createEvent(input);
        this._showList();
      },
    });
    this.root.innerHTML = view.render();
    view.bind(this.root, this.autocompleteService);
  }

  _showDetail(id) {
    const event = this.eventService.getById(id);
    if (!event) return this._showList();

    const view = new EventDetailView({
      onBack: () => this._showList(),
      onDelete: async () => {
        if (confirm(`刪除「${event.title}」？`)) {
          await this.eventService.deleteEvent(id);
          this._showList();
        }
      },
      onRefresh: async () => {
        this._showLoadingOverlay('bars', '正在更新港鐵與九巴實時班次…');
        await this.eventService.refreshEvent(id);
        this._showDetail(id);
      },
      onSelectItinerary: async (itId) => {
        this._showLoadingOverlay('orbit', '正在套用選定路線…');
        await this.eventService.selectItinerary(id, itId);
        this._showDetail(id);
      },
      onUpdateRemarks: (itId, text) => {
        this.eventService.updateRemarks(id, itId, text);
        this._showDetail(id);
      },
      onToggleNotification: async (itId, enabled) => {
        await this.eventService.toggleItineraryNotification(id, itId, enabled);
        this._showDetail(id);
      },
      onUpdateTime: async (newTime) => {
        this._showLoadingOverlay('orbit', '正在重新計算最遲出發時間…');
        await this.eventService.updateTargetArrival(id, newTime);
        this._showDetail(id);
      },
      onUpdateEventDetails: async (details) => {
        this._showLoadingOverlay('orbit', '正在更新行程與路徑資訊…');
        await this.eventService.updateEventDetails(id, details);
        this._showDetail(id);
      },
    });
    LoadingView.hideDimmer();
    this.root.innerHTML = view.render(event);
    view.bind(this.root);
  }

  _showLoadingOverlay(variant, message) {
    LoadingView.showDimmer(variant, message);
  }

  async _autoRefresh() {
    const events = this.eventService.list();
    const upcoming = events.filter((e) => e.targetArrival > new Date());
    for (const e of upcoming) {
      try { await this.eventService.refreshEvent(e.id); }
      catch (err) { console.warn('[autoRefresh]', err); }
    }
  }
}
