export class Location {
  constructor({ name, lat = null, lng = null, stopId = null, address = null, source = null } = {}) {
    if (!name) throw new Error('Location requires a name');
    this.name = name;
    this.lat = lat != null ? Number(lat) : null;
    this.lng = lng != null ? Number(lng) : null;
    this.stopId = stopId;
    this.address = address;
    this.source = source;
  }

  get hasCoords() {
    return Number.isFinite(this.lat) && Number.isFinite(this.lng);
  }

  static fromJSON(obj) {
    return new Location(obj);
  }

  toJSON() {
    return {
      name: this.name,
      lat: this.lat,
      lng: this.lng,
      stopId: this.stopId,
      address: this.address,
      source: this.source,
    };
  }

  distanceTo(other) {
    if (!this.hasCoords || !other?.hasCoords) return null;
    const R = 6371000;
    const rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(other.lat - this.lat);
    const dLng = rad(other.lng - this.lng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(this.lat)) * Math.cos(rad(other.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
}
