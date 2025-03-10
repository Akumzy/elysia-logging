import type { LogObject } from "./types";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { formatDuration, parseBasicAuthHeader } from "./helpers";

/**
 * Log class
 *
 * This class is used to format the log object in different ways.
 *  - formatJson() returns the log object as is with enhanced details
 *  - formatCommon() returns the log object as a common log format (NCSA) string
 *  - formatShort() returns the log object as a short string (perfect for dev console)
 *
 * @param log Log object
 *
 * @returns Log object
 *
 * @example
 * const log = new Log(logObject);
 * console.log(log.formatCommon());
 * console.log(log.formatShort());
 * console.log(log.formatJson());
 **/
export class Log {
  // Properties
  private logObject: LogObject;

  // Constructor
  constructor(log: LogObject) {
    this.logObject = log;
  }

  // Getters and setters
  public set error(error: string | object | Error) {
    this.logObject.error = error;
  }

  public get log(): LogObject {
    return this.logObject;
  }

  /**
   * Returns the log object with enhanced details for JSON output, suitable for dashboard integration.
   *
   * @returns Enhanced Log object
   */
  formatJson(): LogObject {
    const requestId =
      this.logObject.request.requestID ||
      `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    return {
      ...this.logObject,
      request: {
        ...this.logObject.request,
        requestID: requestId,
      },
      response: {
        ...this.logObject.response,
        message: `${this.logObject.request.method} ${
          this.logObject.request.url.path
        } completed with status ${
          this.logObject.response.status_code
        } in ${formatDuration(this.logObject.response.time)}`,
      },
      timestamp: new Date().toISOString(), // Added for consistency with MongoDB storage
    };
  }

  /**
   * Formats the log object as a common log format (NCSA) string
   *
   * @see https://en.wikipedia.org/wiki/Common_Log_Format
   *
   * @returns Log object as a common log format (NCSA) string
   */
  formatCommon(): string {
    // Get basic auth user if set, else "-"
    const basicAuthUser: string =
      parseBasicAuthHeader(this.logObject.request.headers?.authorization ?? "")
        ?.username ?? "-";

    // Fallback for requestProtocol (TODO: Still not exposed by Elysia, tracking issue #324)
    const requestProtocol: string =
      this.logObject.request.headers?.["x-forwarded-proto"] ?? "HTTP/1.1";

    // Format date/time of the request (%d/%b/%Y:%H:%M:%S %z)
    const timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const zonedDate: Date = toZonedTime(Date.now(), timeZone);
    const formattedDate: string = format(zonedDate, "dd/MMM/yyyy:HH:mm:ss xx");

    // Fallback for responseSize (TODO: Still not exposed by Elysia, tracking issue #324)
    const responseSize: number | undefined = undefined;

    // Return formatted log string
    return `${
      this.logObject.request.ip
    } - ${basicAuthUser} [${formattedDate}] "${this.logObject.request.method} ${
      this.logObject.request.url.path
    } ${requestProtocol}" ${this.logObject.response.status_code} ${
      responseSize ?? "-"
    }`;
  }

  /**
   * Formats the log object as a short string (perfect for dev console)
   *
   * @returns Log object as a short string (perfect for dev console)
   */
  formatShort(): string {
    const durationInNanoseconds = this.logObject.response.time;
    const timeMessage: string = formatDuration(durationInNanoseconds);
    const queryString = Object.keys(this.logObject.request.url.params).length
      ? `?${new URLSearchParams(this.logObject.request.url.params).toString()}`
      : "";

    const requestUri = this.logObject.request.url.path + queryString;
    return `[${this.logObject.request.ip}] ${this.logObject.request.method} ${requestUri} ${this.logObject.response.status_code} (${timeMessage})`;
  }
}
