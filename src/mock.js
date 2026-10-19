// Synthetic fixtures for offline tests and the no-key demo mode.
// These are NOT Qloo data: names are invented placeholders so the public repo never stores Qloo responses.
const ENT = (id, name, subtype, extra = {}) => ({ entity_id: id, name, subtype, ...extra });

const SEARCH = {
  'urn:entity:artist': [ENT('mock-artist-1', 'Sample Oud Singer', 'urn:entity:artist')],
  'urn:entity:place': [ENT('mock-place-1', 'Sample Home Bakery', 'urn:entity:place', { properties: { geocode: { city: 'Home City' } } })],
  'urn:entity:movie': [ENT('mock-movie-1', 'Sample Family Drama', 'urn:entity:movie')],
  'urn:entity:tv_show': [ENT('mock-tv-1', 'Sample Ramadan Series', 'urn:entity:tv_show')],
};

export function mockFetch(path, q) {
  if (path === '/search') {
    const list = SEARCH[q.types] || SEARCH['urn:entity:artist'];
    return { results: list.map((e) => ({ ...e, name: `${e.name} (${q.query})` })) };
  }
  if (path === '/v2/tags') {
    return { results: { tags: [{ id: `urn:tag:mock:${(q['filter.query'] || 'x').toLowerCase().replace(/\W+/g, '_')}`, name: q['filter.query'], type: 'urn:tag:genre' }] } };
  }
  if (path === '/v2/insights' && q['filter.type'] === 'urn:heatmap') {
    // Synthetic grid points (not Qloo data).
    const pts = [['9x0qd', 40.761, -111.891, 0.91], ['9x0qd', 40.762, -111.889, 0.88], ['9x0q6', 40.721, -111.854, 0.84], ['9x0qf', 40.78, -111.86, 0.79]];
    return { results: { heatmap: pts.map(([g, lat, lon, a]) => ({ location: { latitude: lat, longitude: lon, geohash: g + 'xyz' }, query: { affinity: a, popularity: 0.5 } })) } };
  }
  if (path === '/v2/insights') {
    const type = q['filter.type'];
    const signals = (q['signal.interests.entities'] || '').split(',').filter(Boolean);
    const city = q['filter.location.query'] || q['signal.location.query'] || '';
    const n = Math.min(Number(q.take) || 5, 5);
    return {
      results: {
        entities: Array.from({ length: n }, (_, i) =>
          ENT(`mock-${type.split(':').pop()}-${i + 1}`, `Mock ${type.split(':').pop()} #${i + 1}${city ? ' in ' + city : ''}`, type, {
            properties: { geocode: { city: city || undefined }, address: city ? `${100 + i} Example St, ${city}` : undefined },
            tags: [{ name: 'mock tag' }],
            query: {
              affinity: +(0.95 - i * 0.07).toFixed(2),
              explainability: { 'signal.interests.entities': signals.map((id, j) => ({ entity_id: id, score: +(0.8 - j * 0.2 - i * 0.05).toFixed(2) })) },
            },
          })
        ),
      },
    };
  }
  return {};
}
