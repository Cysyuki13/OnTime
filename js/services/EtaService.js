export class EtaService {
  // eslint-disable-next-line no-unused-vars
  async getNextArrival(_segment, _now = new Date()) {
    throw new Error('getNextArrival() must be implemented');
  }
}
