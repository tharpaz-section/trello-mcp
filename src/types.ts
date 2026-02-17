export interface ApiSuccess {
  ok: true;
  [key: string]: unknown;
}

export interface ApiError {
  ok: false;
  error: string;
  detail?: string;
}

export type ApiResponse = ApiSuccess | ApiError;
