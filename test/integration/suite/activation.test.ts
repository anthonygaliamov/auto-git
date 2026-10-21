import * as assert from 'node:assert';
import * as vscode from 'vscode';

describe('extension activation', () => {
  it('activates', async () => {
    const ext = vscode.extensions.getExtension('anthonygaliamov.auto-sync');
    assert.ok(ext, 'extension not found');
    await ext.activate();
    assert.strictEqual(ext.isActive, true);
  });
});
