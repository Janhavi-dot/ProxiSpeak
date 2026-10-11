const API_BASE = "http://localhost:5000";

function getToken() {
  return localStorage.getItem("proxispeak_token");
}

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = { ...options.headers };

  const token = getToken();
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  // If not FormData, default to application/json
  if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  auth: {
    register: (body) => request("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),
    login: (body) => request("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),
    getMe: () => request("/api/users/me"),
    updateProfile: (body) => request("/api/users/me", { method: "PATCH", body: JSON.stringify(body) }),
  },
  audio: {
    getNearby: ({ x, y, zone, lat, lng, radius = 250, category = "all", search = "", sort = "distance" }) => {
      const params = new URLSearchParams({
        radius: radius.toString(),
      });
      if (x !== undefined && y !== undefined) {
        params.append("x", x.toString());
        params.append("y", y.toString());
      }
      if (zone) params.append("zone", zone);
      if (lat !== undefined && lng !== undefined) {
        params.append("lat", lat.toString());
        params.append("lng", lng.toString());
      }
      if (category && category !== "all") params.append("category", category);
      if (search && search.trim()) params.append("search", search.trim());
      if (sort) params.append("sort", sort);
      return request(`/api/audio/nearby?${params.toString()}`);
    },
    upload: (formData) => request("/api/audio", { method: "POST", body: formData }),
    getMyAudio: () => request("/api/audio/mine/all"),
    getById: (id) => request(`/api/audio/${id}`),
    update: (id, body) => request(`/api/audio/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id) => request(`/api/audio/${id}`, { method: "DELETE" }),
  },
  health: () => request("/api/health"),
};
