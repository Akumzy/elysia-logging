import type { Context } from "elysia";
import { Log } from "./log";

// This creates a type that is like "json" | "common" | "short"
type LogFormatString = {
  [K in keyof typeof Log.prototype as K extends `format${infer Rest}`
    ? Lowercase<Rest>
    : never]: (typeof Log.prototype)[K];
};

// This is the type of a function that takes a LogObject and returns a string or a LogObject
type LogFormatMethod = (log: LogObject) => string | LogObject;

// This creates a LogFormat const that is like "JSON"="json", "COMMON"="common", "SHORT"="short"
type LogFormatRecord = Record<Uppercase<keyof LogFormatString>, string>;

//
export const LogFormat = {
  JSON: "json",
  COMMON: "common",
  SHORT: "short",
  // Add other methods here
} as const;

export type LogFormatType =
  | keyof LogFormatString
  | LogFormatMethod
  | LogFormatter
  | LogFormatRecord;

/**
 * Represents the basic authentication credentials.
 */
export type BasicAuth = {
  type: string;
  username: string;
  password: string;
};

/**
 * Represents the list of IP headers that can be used to retrieve the client's IP address.
 */
export type IPHeaders =
  | "x-forwarded-for"
  | "x-real-ip"
  | "x-client-ip"
  | "cf-connecting-ip"
  | "fastly-client-ip"
  | "x-cluster-client-ip"
  | "x-forwarded"
  | "forwarded-for"
  | "forwarded"
  | "appengine-user-ip"
  | "true-client-ip"
  | "cf-pseudo-ipv4";

/**
 * Represents a log object that contains detailed information about a request and its response.
 */
export type LogObject = {
  request: {
    ip?: string;
    requestID?: string;
    method: string;
    headers?: Record<string, string>;
    url: {
      path: string;
      params: Record<string, string>;
      queryString?: string;
    };
    body?: any; // Request body (could be JSON, form data, etc.)
    referer?: string; // Added to capture the Referer header
  };
  response: {
    status_code: number | string | undefined;
    time: number; // Duration in milliseconds
    headers?: Record<string, string>;
    body?: any; // Response body
    message?: string;
    referer?: string; // Added to capture any forwarded Referer in response
  };
  error?: string | object | Error;
  timestamp?: string; // Added for dashboard compatibility
};

/**
 * Options for the request logger middleware.
 */
export interface RequestLoggerOptions {
  level?: string;
  format?: LogFormatType;
  includeHeaders?: string[];
  skip?: (ctx: Context) => boolean;
  ipHeaders?: IPHeaders[];
  // Redaction options
  redactRequestBodyFields?: string[]; // Fields to redact in request body
  redactResponseBodyFields?: string[]; // Fields to redact in response body
  redactHeaders?: string[]; // Headers to redact
}

/**
 * Common Logger interface.
 */
export interface Logger {
  debug: <T extends unknown[]>(...args: T) => void;
  info: <T extends unknown[]>(...args: T) => void;
  warn: <T extends unknown[]>(...args: T) => void;
  error: <T extends unknown[]>(...args: T) => void;
}

/**
 * Interface for a log formatter.
 */
export interface LogFormatter {
  format(log: LogObject): string | LogObject;
}
