import { StorageAdapter, LogObject } from "../types";
import { Log } from "../log";
import { pino } from "pino";

/**
 * ConsoleStorageAdapter
 *
 * A storage adapter that logs entries to the console using Pino for formatting.
 * This adapter is intended for development or debugging purposes and does not persist data.
 */
export class ConsoleStorageAdapter implements StorageAdapter {
  private logger: pino.Logger;

  constructor() {
    this.logger = pino({
      transport: {
        target: "pino-pretty",
        options: { colorize: true },
      },
    });
  }

  async init(): Promise<void> {
    // No initialization needed for console logging
    console.log("ConsoleStorageAdapter initialized");
  }

  async saveLog(log: LogObject): Promise<void> {
    const formattedLog = new Log(log).formatJson(); // Use JSON format for consistency
    this.logger.info(formattedLog);
  }
}
