// Copyright 2021-2022 the Deno authors. All rights reserved. MIT license.
// Inlined from https://github.com/denoland/ga4

import { getCookies } from "@std/http/cookie";
import { STATUS_TEXT } from "@std/http/status";

const GA4_ENDPOINT_URL = "https://www.google-analytics.com/g/collect";
const SLOW_UPLOAD_THRESHOLD = 1_000;

export type Primitive = bigint | boolean | null | number | string;

export type Client = {
  id?: string; // Must have either `ip` or `id`.
  ip?: string;
  language?: string;
  headers: Headers;
};

export interface User {
  id?: string;
  properties: Record<string, Primitive>;
}

export interface Session {
  id: string;
  number: number;
  engaged: boolean;
  start?: boolean;
  hitCount: number;
}

export interface Page {
  location: string;
  title: string;
  referrer?: string;
  ignoreReferrer?: boolean;
  trafficType?: string;
  firstVisit?: boolean;
  newToSite?: boolean;
}

export interface Campaign {
  source?: string;
  medium?: string;
  id?: string;
  name?: string;
  content?: string;
  term?: string;
}

export interface Event {
  name: string;
  category?: string;
  label?: string;
  params: Record<string, Primitive>;
}

// Defaults to "page_view", but can be overridden/surpressed.
export type PrimaryEvent = Event | null;

export interface GA4Init {
  measurementId?: string;
  request: Request;
  response: Response;
  conn: { remoteAddr?: { hostname: string } };
}

export class GA4Report {
  measurementId?: string;
  client: Client;
  user: User;
  session?: Session;
  campaign?: Campaign;
  page: Page;
  events: [PrimaryEvent, ...Event[]];

  constructor({ measurementId, request, response, conn }: GA4Init) {
    this.measurementId = measurementId;
    this.client = {
      id: getClientId(request),
      ip: getClientIp(request, conn),
      language: getClientLanguage(request),
      headers: getClientHeaders(request),
    };
    this.user = { properties: {} };
    this.page = {
      location: request.url,
      title: getPageTitle(request, response),
      referrer: getPageReferrer(request),
      firstVisit: getFirstVisit(request),
    };
    this.campaign = getCampaignObject(request);
    this.events = [{ name: "page_view", params: {} }];
  }

  get event(): PrimaryEvent {
    return this.events[0];
  }

  set event(event: PrimaryEvent) {
    this.events[0] = event;
  }

  async send(): Promise<void> {
    // Short circuit if there are no events to report.
    if (!this.events.find(Boolean)) {
      return;
    }

    this.measurementId ??= process.env.GA4_MEASUREMENT_ID;
    if (!this.measurementId) {
      return this.warn(
        "GA4_MEASUREMENT_ID environment variable not set. " +
          "Google Analytics reporting disabled.",
      );
    }

    if (this.client.id == null) {
      if (this.client.ip == null) {
        return this.warn("either `client.id` or `client.ip` must be set.");
      }
      const material = [
        this.client.ip,
        this.client.headers.get("user-agent"),
        this.client.headers.get("sec-ch-ua"),
      ].join();
      this.client.id = await toDigest(material);
    }

    const queryParams: Record<string, string> = {};

    addShortParam(queryParams, "v", 2);
    addShortParam(queryParams, "tid", this.measurementId);

    addShortParam(queryParams, "cid", this.client.id);
    addShortParam(queryParams, "ul", this.client.language);
    addShortParam(queryParams, "_uip", this.client.ip);

    addShortParam(queryParams, "uid", this.user.id);
    for (const [name, value] of Object.entries(this.user.properties)) {
      addCustomParam(queryParams, "up", name, value);
    }

    addShortParam(queryParams, "cs", this.campaign?.source);
    addShortParam(queryParams, "cm", this.campaign?.medium);
    addShortParam(queryParams, "ci", this.campaign?.id);
    addShortParam(queryParams, "cn", this.campaign?.name);
    addShortParam(queryParams, "cc", this.campaign?.content);
    addShortParam(queryParams, "ck", this.campaign?.term);

    addShortParam(queryParams, "sid", this.session?.id);
    addShortParam(queryParams, "sct", this.session?.number);
    addShortParam(queryParams, "seg", this.session?.engaged);
    addShortParam(queryParams, "_s", this.session?.hitCount);

    addShortParam(queryParams, "dl", this.page.location);
    addShortParam(queryParams, "dr", this.page.referrer);
    addShortParam(queryParams, "dt", this.page.title);
    addShortParam(queryParams, "ir", this.page.ignoreReferrer, false);

    if (this.event != null) {
      addEventParams(queryParams, this.event);
      addShortParam(queryParams, "en", this.event.name);
      addShortParam(queryParams, "_fv", this.page.firstVisit, false);
      addShortParam(queryParams, "_nts", this.page.newToSite, false);
      addShortParam(queryParams, "_ss", this.session?.start, false);
    }

    const extraEvents = this.events.slice(1) as Event[];
    const eventParamsList = extraEvents.map((event) => {
      const eventParams: Record<string, string> = {};
      addShortParam(eventParams, "en", event.name);
      addEventParams(eventParams, event);
      return eventParams;
    });

    const url = Object.assign(new URL(GA4_ENDPOINT_URL), {
      search: String(new URLSearchParams(queryParams)),
    }).href;

    const headers = this.client.headers;

    const body = eventParamsList
      .map((eventParams) => new URLSearchParams(eventParams).toString())
      .join("\n");

    const request = new Request(url, { method: "POST", headers, body });

    try {
      const start = performance.now();
      const response = await fetch(request);
      const duration = performance.now() - start;

      if (this.session && response.ok) {
        if (this.event != null) {
          this.session.start = undefined;
        }
        const hitCount = this.events.filter(Boolean).length || 1;
        this.session.hitCount += hitCount;
      }

      if (response.status !== 204 || duration >= SLOW_UPLOAD_THRESHOLD) {
        this.warn(
          `${this.events.length} events uploaded in ${duration}ms. ` +
            `Response: ${response.status} ${response.statusText}`,
        );
      }
    } catch (err) {
      this.warn(`Upload failed: ${err}`);
    }
  }

  warn(message: unknown) {
    // deno-lint-ignore no-console
    console.warn(`GA4: ${message}`);
  }
}

function getClientId(request: Request): string | undefined {
  const cookies = getCookies(request.headers);
  return cookies._ga ? cookies._ga : undefined;
}

function getClientIp(request: Request, conn: { remoteAddr?: { hostname: string } }): string {
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    return xForwardedFor.split(/\s*,\s*/)[0];
  } else {
    return conn.remoteAddr?.hostname ?? "0.0.0.0";
  }
}

function getClientLanguage(request: Request): string | undefined {
  const acceptLanguage = request.headers.get("accept-language");
  if (acceptLanguage == null) {
    return;
  }
  const code = acceptLanguage
    .split(/[^a-z-]+/i)
    .filter(Boolean)
    .shift();
  if (code == null) {
    return undefined;
  }
  return code.toLowerCase();
}

function getClientHeaders(request: Request): Headers {
  const headerList = [...(request.headers as unknown as Iterable<[string, string]>)].filter(
    ([name, _value]) => {
      name = name.toLowerCase();
      return name === "user-agent" || name === "sec-ch-ua" || name.startsWith("sec-ch-ua-");
    },
  );
  return new Headers(headerList);
}

function getPageTitle(request: Request, response: Response): string {
  if ((request.method === "GET" || request.method === "HEAD") && isSuccess(response)) {
    return (
      new URL(request.url).pathname
        .replace(/\.[^/]*$/, "") // Remove file extension.
        .split(/\/+/) // Split into components.
        .map(decodeURIComponent) // Unescape.
        .map((s) => s.replace(/[\s_]+/g, " ")) // Underbars to spaces.
        .map((s) => s.replace(/@v?[\d.\s]+$/, "")) // Remove version number.
        .map((s) => s.trim()) // Trim leading/trailing whitespace.
        .filter(Boolean) // Remove empty path components.
        .join(" / ") || "/"
    );
  } else {
    return formatStatus(response).toLowerCase();
  }
}

function getPageReferrer(request: Request): string | undefined {
  const referrer = request.headers.get("referer");
  if (referrer !== null && new URL(referrer).host !== new URL(request.url).host) {
    return referrer;
  }
}

function getFirstVisit(request: Request): boolean | undefined {
  return getClientId(request) ? false : true;
}

function getCampaignObject(request: Request): Campaign {
  const url = new URL(request.url);
  return {
    name: url.searchParams.get("utm_campaign") || undefined,
    source: url.searchParams.get("utm_source") || undefined,
    medium: url.searchParams.get("utm_medium") || undefined,
    content: url.searchParams.get("utm_content") || undefined,
    term: url.searchParams.get("utm_term") || undefined,
  };
}

export function formatStatus(response: Response): string {
  let { status, statusText } = response;
  statusText ||= STATUS_TEXT[status as keyof typeof STATUS_TEXT] ?? "Invalid Status";
  return `${status} ${statusText}`;
}

export function isSuccess(response: Response): boolean {
  const { status } = response;
  return status >= 200 && status <= 299;
}

export function isRedirect(response: Response): boolean {
  const { status } = response;
  return status >= 300 && status <= 399;
}

export function isServerError(response: Response): boolean {
  const { status } = response;
  return status >= 500 && status <= 599;
}

function addShortParam(
  params: Record<string, string>,
  name: string,
  value?: Primitive,
  implicitDefault?: Primitive,
) {
  if (value === undefined || value === implicitDefault) {
    // Do nothing.
  } else if (typeof value === "boolean") {
    params[name] = value ? "1" : "0";
  } else {
    params[name] = String(value);
  }
}

function snakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase();
}

function addCustomParam(
  params: Record<string, string>,
  prefix: string,
  name: string,
  value?: Primitive,
) {
  if (value === undefined) {
    return;
  }
  name = snakeCase(name);
  if (typeof value === "number" || typeof value === "bigint") {
    params[`${prefix}n.${name}`] = String(value);
  } else {
    params[`${prefix}.${name}`] = String(value);
  }
}

function addEventParams(params: Record<string, string>, event: Event) {
  for (const prop of ["category", "label"] as const) {
    addCustomParam(params, "ep", `event_${prop}`, event[prop]);
  }
  for (const [name, value] of Object.entries(event.params)) {
    addCustomParam(params, "ep", name, value);
  }
}

const encoder = new TextEncoder();

async function toDigest(msg: string): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-1", encoder.encode(msg));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function isDocument(request: Request, response: Response): boolean {
  const fetchMode = request.headers.get("sec-fetch-mode");
  if (fetchMode != null) {
    return fetchMode === "navigate";
  }

  const disposition = response.headers.get("content-disposition");
  if (disposition != null && /^attachment\b/i.test(disposition)) {
    return true;
  }

  const accept = request.headers.get("accept");
  if (accept != null && /^text\/html\b/i.test(accept)) {
    return true;
  }

  const { method } = request;
  const referer = request.headers.get("referer");
  const userAgent = request.headers.get("user-agent");
  if (
    method === "GET" &&
    referer == null &&
    (userAgent == null || !userAgent.startsWith("Mozilla/")) &&
    (accept == null || accept === "*/*")
  ) {
    return true;
  }

  return false;
}
