import type {
  IPHeaders,
  LogObject,
  Logger,
  RequestLoggerOptions,
} from "./types";
import type { Elysia } from "elysia";
import { getIP, getFormattingMethodName } from "./helpers";
import { Log } from "./log";
import process from "process";

// Utility function to redact sensitive fields in an object
const redactFields = (obj: any, fieldsToRedact: string[]): any => {
  if (!obj || typeof obj !== "object") return obj;
  const redacted = { ...obj };
  for (const field of fieldsToRedact) {
    if (field in redacted) {
      redacted[field] = "[REDACTED]";
    }
    for (const key in redacted) {
      if (typeof redacted[key] === "object") {
        redacted[key] = redactFields(redacted[key], fieldsToRedact);
      }
    }
  }
  return redacted;
};

// Utility function to redact sensitive headers
const redactHeadersFn = (
  headers: Record<string, string>,
  headersToRedact: string[]
): Record<string, string> => {
  const redacted = { ...headers };
  for (const header of headersToRedact) {
    const headerLower = header.toLowerCase();
    for (const key in redacted) {
      if (key.toLowerCase() === headerLower) {
        redacted[key] = "[REDACTED]";
      }
    }
  }
  return redacted;
};

/**
 * List of IP headers to check in order of priority.
 *
 * @remarks
 * The order of the headers in this list determines the priority of the headers to use when determining the client IP address.
 * If the first header is not present, the second header is checked, and so on.
 */
export const headersToCheck: IPHeaders[] = [
  "x-forwarded-for", // X-Forwarded-For is the de-facto standard header
  "x-real-ip", // Nginx proxy/FastCGI
  "x-client-ip", // Apache [mod_remoteip](https://httpd.apache.org/docs/2.4/mod/mod_remoteip.html#page-header)
  "cf-connecting-ip", // Cloudflare
  "fastly-client-ip", // Fastly
  "x-cluster-client-ip", // GCP
  "x-forwarded", // RFC 7239
  "forwarded-for", // RFC 7239
  "forwarded", // RFC 7239
  "appengine-user-ip", // GCP
  "true-client-ip", // Akamai and Cloudflare
  "cf-pseudo-ipv4", // Cloudflare
];

/**
 * Creates a middleware function that logs incoming requests and outgoing responses using a storage adapter.
 *
 * @param logger - The logger object to use for logging. Defaults to console.
 * @param options - The options object to configure the middleware.
 * @param options.level - The log level to use. Defaults to "info".
 * @param options.format - The log format to use. Can be a string or a function. Defaults to "json".
 * @param options.skip - A function that returns true to skip logging for a specific request.
 * @param options.includeHeaders - An array of headers to include in the log.
 * @param options.ipHeaders - An array of headers to check for the client IP address.
 * @param options.storageAdapter - The storage adapter to persist logs. Defaults to ConsoleStorageAdapter.
 * @param options.redactRequestBodyFields - Fields to redact in request body (e.g., ["password", "token"]).
 * @param options.redactResponseBodyFields - Fields to redact in response body.
 * @param options.redactHeaders - Headers to redact (e.g., ["Authorization", "Referer"]).
 *
 * @returns A middleware function that logs incoming requests and outgoing responses.
 */
export const ElysiaLogging = (
  logger: Logger = console,
  options: RequestLoggerOptions = {}
) => {
  // Options
  const {
    level = "info",
    format = "json",
    skip = undefined,
    includeHeaders = [
      "x-forwarded-for",
      "authorization",
      "user-agent",
      "referer",
    ], // Added 'referer'
    ipHeaders = headersToCheck,
    redactRequestBodyFields = ["password", "token", "apiKey", "secret"],
    redactResponseBodyFields = ["token", "apiKey", "secret"],
    redactHeaders = ["authorization", "x-api-key", "referer"], // Added 'referer' to redact by default
  } = options;

  // If the formatting method does not exist, throw an error
  if (
    typeof format === "string" &&
    getFormattingMethodName(format) in Log.prototype === false
  ) {
    throw new Error(`Formatter '${format}' not found!`);
  }

  return (app: Elysia) => {
    app
      .derive((ctx) => {
        const clientIP = app.server
          ? getIP(ctx.request.headers, ipHeaders) ??
            app.server.requestIP(ctx.request)?.address ??
            undefined
          : undefined;
        return { ip: clientIP };
      })
      .onError((ctx) => {
        ctx.store = { error: ctx.error, ...ctx.store };
      })
      .onRequest((ctx) => {
        ctx.store = { requestStart: process.hrtime.bigint(), ...ctx.store };
      })
      .onAfterHandle((ctx) => {
        ctx.store = {
          responseSize: undefined,
          responseBody: ctx.response,
          responseHeaders: ctx.set.headers,
          ...ctx.store,
        };
      })
      .onAfterResponse(async (ctx) => {
        // Skip logging if skip function returns true
        if (skip && typeof skip === "function" && skip(ctx)) {
          return;
        }

        // Calculate duration
        let duration: number = 0;
        if (
          (ctx.store as { requestStart?: bigint }).requestStart !== undefined &&
          typeof (ctx.store as { requestStart?: bigint }).requestStart ===
            "bigint"
        ) {
          duration =
            Number(
              process.hrtime.bigint() -
                (ctx.store as { requestStart: bigint }).requestStart
            ) / 1e6; // Convert to milliseconds
        }

        // Capture request headers
        const requestHeaders: Record<string, string> = {};
        for (const header of includeHeaders) {
          if (ctx.request.headers.has(header)) {
            requestHeaders[header] = ctx.request.headers.get(header)!;
          }
        }

        // Redact sensitive headers
        const redactedRequestHeaders = redactHeadersFn(
          requestHeaders,
          redactHeaders
        );

        // Capture request body
        let requestBody: any = ctx.body;
        try {
          if (typeof requestBody === "string") {
            requestBody = JSON.parse(requestBody);
          }
        } catch (e) {
          // If body isn't JSON, keep it as is
        }
        const redactedRequestBody = redactFields(
          requestBody,
          redactRequestBodyFields
        );

        // Capture response body and headers
        let responseBody = (ctx.store as { responseBody?: any }).responseBody;
        try {
          if (typeof responseBody === "string") {
            responseBody = JSON.parse(responseBody);
          }
        } catch (e) {
          // If response isn't JSON, keep it as is
        }
        const redactedResponseBody = redactFields(
          responseBody,
          redactResponseBodyFields
        );

        const responseHeaders =
          (ctx.store as { responseHeaders?: Record<string, string> })
            .responseHeaders || {};
        const redactedResponseHeaders = redactHeadersFn(
          responseHeaders,
          redactHeaders
        );

        // Construct log object
        const logObject: LogObject = new Log({
          request: {
            ip: ctx.ip,
            method: ctx.request.method,
            url: {
              path: ctx.path,
              params: Object.fromEntries(
                new URLSearchParams(new URL(ctx.request.url).search)
              ),
              queryString: new URL(ctx.request.url).search,
            },
            headers: redactedRequestHeaders,
            body: redactedRequestBody,
            referer: redactedRequestHeaders["referer"] || undefined, // Capture Referer
          },
          response: {
            status_code: ctx.set.status,
            time: duration,
            headers: redactedResponseHeaders,
            body: redactedResponseBody,
            referer: redactedResponseHeaders["referer"] || undefined, // Capture Referer from response (if set)
          },
        }).log;

        if (
          (ctx.store as { error?: string | Error | object }).error !== undefined
        ) {
          logObject.error = (
            ctx.store as { error: string | Error | object }
          ).error;
        }

        // Add request ID
        logObject.request.requestID =
          ctx.request.headers.get("x-request-id") ||
          `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        let logOutput: string | LogObject;

        if (typeof format === "function") {
          logOutput = format(logObject);
        } else if (typeof format === "string") {
          const formattingMethod = getFormattingMethodName(format) as Exclude<
            Exclude<Exclude<keyof typeof Log.prototype, "prototype">, "log">,
            "error"
          >;
          logOutput = new Log(logObject)[formattingMethod]();
        } else {
          throw new Error(`Invalid formatting method type '${typeof format}'!`);
        }

        logger[level as keyof typeof logger](logOutput);
      });

    return app;
  };
};

export default ElysiaLogging;
