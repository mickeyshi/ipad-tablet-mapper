export class InputTiming {
  constructor() { this.reset(); }
  reset() { this.ages = []; this.gaps = []; this.last = null; }
  record(phase, timestamp, now, origin) {
    if (phase === 'down') this.last = null;
    const time = timestamp > 1e12 ? timestamp - origin : timestamp;
    const age = now - time;
    if (Number.isFinite(age) && age >= 0 && age < 10000) {
      this.ages.push(age); if (this.ages.length > 256) this.ages.shift();
    }
    if (phase === 'move' && this.last !== null) {
      const gap = time - this.last;
      if (Number.isFinite(gap) && gap > 0 && gap < 10000) {
        this.gaps.push(gap); if (this.gaps.length > 256) this.gaps.shift();
      }
    }
    this.last = phase === 'up' || phase === 'cancel' ? null : Number.isFinite(time) ? time : null;
  }
  summary() {
    const percentile = values => {
      if (!values.length) return null;
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.ceil(sorted.length * 0.95) - 1];
    };
    return { ageP95: percentile(this.ages), gapP95: percentile(this.gaps) };
  }
}
