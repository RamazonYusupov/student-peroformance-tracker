const API_BASE_URL =
  (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_API_BASE_URL || "http://localhost:8000";

function authHeaders() {
  const token = localStorage.getItem("teacher_token");
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function parseJson(response: Response) {
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.detail || "Request failed");
  }
  return response.json();
}

export const api = {
  login: async (username: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    return parseJson(response);
  },

  getDashboardSummary: async () => {
    const response = await fetch(`${API_BASE_URL}/api/dashboard/summary`, {
      headers: { ...authHeaders() },
    });
    return parseJson(response);
  },

  getDashboardGroupTrends: async (groupId?: string) => {
    const query = groupId ? `?group_id=${encodeURIComponent(groupId)}` : "";
    const response = await fetch(`${API_BASE_URL}/api/dashboard/group-trends${query}`, {
      headers: { ...authHeaders() },
    });
    return parseJson(response);
  },

  listTests: async () => {
    const response = await fetch(`${API_BASE_URL}/api/tests`, {
      headers: { ...authHeaders() },
    });
    return parseJson(response);
  },

  getTest: async (testId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/tests/${testId}`, {
      headers: { ...authHeaders() },
    });
    return parseJson(response);
  },

  createTest: async (payload: unknown) => {
    const response = await fetch(`${API_BASE_URL}/api/tests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });
    return parseJson(response);
  },

  updateTest: async (testId: string, payload: unknown) => {
    const response = await fetch(`${API_BASE_URL}/api/tests/${testId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });
    return parseJson(response);
  },

  deleteTest: async (testId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/tests/${testId}`, {
      method: "DELETE",
      headers: { ...authHeaders() },
    });
    return parseJson(response);
  },

  getResults: async (testId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/tests/${testId}/results`, {
      headers: { ...authHeaders() },
    });
    return parseJson(response);
  },

  getAnalytics: async (testId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/tests/${testId}/analytics`, {
      headers: { ...authHeaders() },
    });
    return parseJson(response);
  },

  getSubmission: async (submissionId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/submissions/${submissionId}`, {
      headers: { ...authHeaders() },
    });
    return parseJson(response);
  },

  gradeSubmission: async (submissionId: string, payload: unknown) => {
    const response = await fetch(
      `${API_BASE_URL}/api/submissions/${submissionId}/grade`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      },
    );
    return parseJson(response);
  },

  getGroupStudentProfile: async (groupId: string, studentId: string) => {
    const response = await fetch(
      `${API_BASE_URL}/api/groups/${groupId}/students/${encodeURIComponent(studentId)}/profile`,
      {
        headers: { ...authHeaders() },
      },
    );
    return parseJson(response);
  },

  getEntry: async (testId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/public/tests/${testId}/entry`);
    return parseJson(response);
  },

  startTest: async (testId: string, fullName: string, studentId?: string) => {
    const response = await fetch(`${API_BASE_URL}/api/public/tests/${testId}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: fullName, student_id: studentId || null }),
    });
    return parseJson(response);
  },

  submitTest: async (testId: string, payload: unknown) => {
    const response = await fetch(`${API_BASE_URL}/api/public/tests/${testId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return parseJson(response);
  },

  listGroups: async () => {
    const response = await fetch(`${API_BASE_URL}/api/groups`, {
      headers: { ...authHeaders() },
    });
    return parseJson(response);
  },

  createGroup: async (payload: unknown) => {
    const response = await fetch(`${API_BASE_URL}/api/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });
    return parseJson(response);
  },

  updateGroup: async (groupId: string, payload: unknown) => {
    const response = await fetch(`${API_BASE_URL}/api/groups/${groupId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(payload),
    });
    return parseJson(response);
  },

  deleteGroup: async (groupId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/groups/${groupId}`, {
      method: "DELETE",
      headers: { ...authHeaders() },
    });
    return parseJson(response);
  },
};
