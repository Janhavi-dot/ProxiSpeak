/**
 * Haversine formula to compute distance between two coordinates in meters.
 * @param {number} lat1 Latitude of point 1
 * @param {number} lng1 Longitude of point 1
 * @param {number} lat2 Latitude of point 2
 * @param {number} lng2 Longitude of point 2
 * @returns {number} Distance in meters
 */
export function calculateHaversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // Earth's mean radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Format meters into a clean user-facing distance string.
 * @param {number} meters
 * @returns {string} e.g. "45 m", "850 m", "1.4 km"
 */
export function formatDistance(meters) {
  if (meters === undefined || meters === null || isNaN(meters)) {
    return "Unknown distance";
  }
  const m = Math.round(meters);
  if (m < 1000) {
    return `${m} m`;
  }
  const km = (m / 1000).toFixed(1);
  return `${km} km`;
}

/**
 * Validate that given values are valid geographic coordinates.
 * @param {number} lat
 * @param {number} lng
 * @returns {boolean}
 */
export function isValidCoordinate(lat, lng) {
  const nLat = Number(lat);
  const nLng = Number(lng);
  return (
    Number.isFinite(nLat) &&
    Number.isFinite(nLng) &&
    nLat >= -90 &&
    nLat <= 90 &&
    nLng >= -180 &&
    nLng <= 180
  );
}

/**
 * Create a GeoJSON Point object from latitude and longitude.
 * Note: GeoJSON coordinates are ALWAYS [longitude, latitude].
 */
export function createGeoJsonPoint(lat, lng) {
  return {
    type: "Point",
    coordinates: [Number(lng), Number(lat)],
  };
}
