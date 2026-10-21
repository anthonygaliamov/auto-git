import * as vscode from 'vscode';

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/** Local time as `YYYY-MM-DDTHH:mm:ss.SSS+HH:MM`. */
export function localTimestamp(d: Date = new Date()): string {
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

export class Logger implements vscode.Disposable {
  private readonly channel = vscode.window.createOutputChannel('Auto Sync');

  info(message: string): void {
    this.channel.appendLine(`${localTimestamp()} ${message}`);
  }

  show(): void {
    this.channel.show(true);
  }

  dispose(): void {
    this.channel.dispose();
  }
}
