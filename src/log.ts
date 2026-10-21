import * as vscode from 'vscode';

export class Logger implements vscode.Disposable {
  private readonly channel = vscode.window.createOutputChannel('Auto Sync');

  info(message: string): void {
    this.channel.appendLine(`${new Date().toISOString()} ${message}`);
  }

  show(): void {
    this.channel.show(true);
  }

  dispose(): void {
    this.channel.dispose();
  }
}
