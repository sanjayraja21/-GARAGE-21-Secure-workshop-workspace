const API_BASE = "http://127.0.0.1:8000/api";

export const getToken = () => sessionStorage.getItem("garage_pro_token");
export const setSession = (data) => { sessionStorage.setItem("garage_pro_token", data.access_token); sessionStorage.setItem("garage_pro_user", JSON.stringify(data.user)); };
export const clearSession = () => { sessionStorage.removeItem("garage_pro_token"); sessionStorage.removeItem("garage_pro_user"); };

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}), ...options.headers }
    });
  } catch {
    throw new Error("Cannot connect to FastAPI. Start the backend at http://127.0.0.1:8000.");
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && !path.startsWith("/auth/login") && !path.startsWith("/auth/register")) window.dispatchEvent(new Event("garage-pro-session-expired"));
  if (!response.ok) throw new Error(data.detail || `Request failed: ${response.status}`);
  return data;
}

export const api = {
  login: data => request("/auth/login", { method: "POST", body: JSON.stringify(data) }),
  register: data => request("/auth/register", { method: "POST", body: JSON.stringify(data) }),
  forgotPassword: data => request("/auth/forgot-password", { method: "POST", body: JSON.stringify(data) }),
  resetPassword: data => request("/auth/reset-password", { method: "POST", body: JSON.stringify(data) }),
  changePassword: data => request("/auth/change-password", { method: "POST", body: JSON.stringify(data) }),
  getMe: () => request("/auth/me"),
  getUsers: () => request("/users/"),
  getRoleSummary: () => request("/users/summary"),
  createUser: data => request("/users/", { method: "POST", body: JSON.stringify(data) }),
  updateUser: (id, data) => request(`/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) }),
  getCustomers: () => request("/customers/"),
  createCustomer: data => request("/customers/", { method: "POST", body: JSON.stringify(data) }),
  getVehicles: () => request("/vehicles/"),
  createVehicle: data => request("/vehicles/", { method: "POST", body: JSON.stringify(data) }),
  getJobs: () => request("/service-jobs/"),
  createJob: data => request("/service-jobs/", { method: "POST", body: JSON.stringify(data) }),
  updateJobStatus: (jobId, status) => request(`/service-jobs/${encodeURIComponent(jobId)}/status?status=${encodeURIComponent(status)}`, { method: "PATCH" }),
  getModules: () => request("/modules"),
  getModuleRecords: module => request(`/modules/${encodeURIComponent(module)}`),
  createModuleRecord: (module, data) => request(`/modules/${encodeURIComponent(module)}`, { method: "POST", body: JSON.stringify({ data }) }),
  updateModuleRecord: (module, recordId, data) => request(`/modules/${encodeURIComponent(module)}/${encodeURIComponent(recordId)}`, { method: "PATCH", body: JSON.stringify({ data }) }),
  getSummary: () => request("/reports/summary"),
  askAI: prompt => request("/ai/assistant", { method: "POST", body: JSON.stringify({ prompt }) })
};
