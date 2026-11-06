/* eslint-disable @typescript-eslint/no-explicit-any */

// Under a sub-URL (example.com/cars) the API lives at /cars/api —
// a bare "/api" reached the main site that shares the domain.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || `${process.env.NEXT_PUBLIC_BASE_PATH || ""}/api`;

export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

async function getAuthToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("auth_token");
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAuthToken();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  // Remove Content-Type for FormData
  if (options.body instanceof FormData) {
    delete (headers as Record<string, string>)["Content-Type"];
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      errorData = null;
    }
    throw new ApiError(
      errorData?.message || `Request failed with status ${response.status}`,
      response.status,
      errorData
    );
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export const auth = {
  sendOtp(email: string) {
    return request<ApiResponse<null>>("/auth/send-otp", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },
  verifyOtp(email: string, code: string) {
    return request<ApiResponse<{ token: string; user: any }>>("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    });
  },
  register(data: { name: string; email: string; phone: string; city: string }) {
    return request<ApiResponse<{ token: string; user: any }>>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  getProfile() {
    return request<ApiResponse<any>>("/auth/profile");
  },
  updateProfile(data: any) {
    return request<ApiResponse<any>>("/auth/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },
};

// ─── Ads ─────────────────────────────────────────────────────────────────────

export interface Ad {
  _id: string;
  slug: string;
  title: string;
  description: string;
  price: number;
  images: string[];
  category: Category;
  location: { city: string; state: string };
  condition: string;
  customFields: Record<string, string>;
  seller: { _id: string; name: string; image?: string; createdAt: string };
  isFeatured: boolean;
  status: "active" | "sold" | "pending" | "expired";
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  _id: string;
  name: string;
  slug: string;
  icon?: string;
  image?: string;
  parent?: string | null;
  children?: Category[];
  customFields?: CustomField[];
}

export interface CustomField {
  name: string;
  label: string;
  type: "text" | "select" | "checkbox" | "number";
  options?: string[];
  required?: boolean;
}

export const ads = {
  list(params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return request<ApiResponse<PaginatedResponse<Ad>>>(`/ads${qs}`);
  },
  featured() {
    return request<ApiResponse<Ad[]>>("/ads/featured");
  },
  getBySlug(slug: string) {
    return request<ApiResponse<Ad>>(`/ads/${slug}`);
  },
  create(data: FormData) {
    return request<ApiResponse<Ad>>("/ads", {
      method: "POST",
      body: data,
    });
  },
  update(id: string, data: FormData) {
    return request<ApiResponse<Ad>>(`/ads/${id}`, {
      method: "PUT",
      body: data,
    });
  },
  delete(id: string) {
    return request<ApiResponse<null>>(`/ads/${id}`, { method: "DELETE" });
  },
  myAds() {
    return request<ApiResponse<Ad[]>>("/ads/my-ads");
  },
};

// ─── Categories ──────────────────────────────────────────────────────────────

export const categories = {
  list() {
    return request<ApiResponse<Category[]>>("/categories");
  },
  getBySlug(slug: string) {
    return request<ApiResponse<Category>>(`/categories/${slug}`);
  },
};

// ─── Favourites ──────────────────────────────────────────────────────────────

export const favourites = {
  list() {
    return request<ApiResponse<Ad[]>>("/favourites");
  },
  toggle(adId: string) {
    return request<ApiResponse<{ isFavourite: boolean }>>("/favourites", {
      method: "POST",
      body: JSON.stringify({ adId }),
    });
  },
};

// ─── Chat ────────────────────────────────────────────────────────────────────

export interface ChatThread {
  _id: string;
  ad: Pick<Ad, "_id" | "title" | "images" | "price" | "slug">;
  participants: { _id: string; name: string; image?: string }[];
  lastMessage: { text: string; createdAt: string; senderId: string };
  unreadCount: number;
}

export interface Message {
  _id: string;
  threadId: string;
  senderId: string;
  text: string;
  type: "text" | "offer" | "image";
  offerAmount?: number;
  /** Present on offer messages — mirrors the linked Offer's status. */
  offerStatus?: "pending" | "accepted" | "rejected";
  createdAt: string;
}

export const chat = {
  threads() {
    return request<ApiResponse<ChatThread[]>>("/chat/threads");
  },
  messages(threadId: string) {
    return request<ApiResponse<Message[]>>(`/chat/threads/${threadId}/messages`);
  },
  send(threadId: string, data: { text: string; type?: string; offerAmount?: number }) {
    return request<ApiResponse<Message>>(`/chat/threads/${threadId}/messages`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  createThread(adId: string) {
    return request<ApiResponse<ChatThread>>("/chat/threads", {
      method: "POST",
      body: JSON.stringify({ adId }),
    });
  },
};
