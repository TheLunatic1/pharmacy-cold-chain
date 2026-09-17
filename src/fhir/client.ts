/**
 * Lightweight, robust HTTP client for HL7 FHIR R4 REST API interactions.
 * Connects to HAPI FHIR Public Sandbox or custom endpoint.
 */

import { CONFIG } from '../config.js';

export interface FhirResponse<T = Record<string, unknown>> {
  status: number;
  statusText: string;
  data: T;
}

export class FhirClient {
  private baseUrl: string;

  constructor(baseUrl: string = CONFIG.FHIR_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Perform HTTP GET against a FHIR endpoint
   */
  async get<T = Record<string, unknown>>(path: string): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}/${path.replace(/^\/+/, '')}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/fhir+json, application/json',
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`FHIR GET ${url} failed with HTTP ${response.status} (${response.statusText}): ${errorBody}`);
    }

    return (await response.json()) as T;
  }

  /**
   * Perform HTTP POST to create a FHIR resource
   */
  async post<T = Record<string, unknown>>(resourceType: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}/${resourceType}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/fhir+json, application/json',
        'Content-Type': 'application/fhir+json',
      },
      body: JSON.stringify(body),
    });

    if (response.status === 412) {
      // HAPI FHIR duplicate resource detection - extract existing ID and fetch it
      const errorBody = await response.text();
      const match = errorBody.match(new RegExp(`${resourceType}/([a-zA-Z0-9.-]+)`));
      if (match && match[1]) {
        const existingId = match[1];
        return this.get<T>(`${resourceType}/${existingId}`);
      }
      throw new Error(`FHIR POST ${url} returned 412 Precondition Failed: ${errorBody}`);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`FHIR POST ${url} failed with HTTP ${response.status} (${response.statusText}): ${errorBody}`);
    }

    const data = (await response.json()) as Record<string, unknown>;

    // If id is not in body, extract from Location header (e.g. "https://hapi.fhir.org/baseR4/Patient/123/_history/1")
    if (!data['id']) {
      const location = response.headers.get('location') || response.headers.get('content-location');
      if (location) {
        const match = location.match(new RegExp(`${resourceType}/([a-zA-Z0-9.-]+)`));
        if (match && match[1]) {
          data['id'] = match[1];
        }
      }
    }

    return data as T;
  }

  /**
   * Perform HTTP PUT to create or update a specific FHIR resource
   */
  async put<T = Record<string, unknown>>(resourceType: string, id: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}/${resourceType}/${id}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Accept': 'application/fhir+json, application/json',
        'Content-Type': 'application/fhir+json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`FHIR PUT ${url} failed with HTTP ${response.status} (${response.statusText}): ${errorBody}`);
    }

    return (await response.json()) as T;
  }

  /**
   * Perform a FHIR search with query parameters
   */
  async search<T = Record<string, unknown>>(
    resourceType: string,
    params: Record<string, string>
  ): Promise<T> {
    const searchParams = new URLSearchParams(params);
    const path = `${resourceType}?${searchParams.toString()}`;
    return this.get<T>(path);
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}
