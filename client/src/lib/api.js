async function request(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  listLeads: () => request('GET', '/api/leads'),
  getLead: (id) => request('GET', `/api/leads/${id}`),
  createLead: (payload) => request('POST', '/api/leads', payload),
  setStatus: (id, status) => request('PATCH', `/api/leads/${id}`, { status }),
  addDiscussion: (id, payload) => request('POST', `/api/leads/${id}/discussions`, payload),
  clearFollowUp: (id) => request('DELETE', `/api/leads/${id}/follow-up`),
  insights: (id) => request('POST', `/api/leads/${id}/insights`),
};
