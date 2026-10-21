import * as assert from 'node:assert';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { RepoDiscovery } from '../../../src/discovery';
import type { AutoGitExports } from '../../../src/extension';
import { realKey } from '../../../src/paths';

const KEYS = ['scanDepth', 'includeRepos', 'excludeRepos'];

describe('repository discovery', () => {
  let discovery: RepoDiscovery;
  let fixture: string;

  const repo = (rel: string): string => path.join(fixture, ...rel.split('/'));

  async function configure(values: Record<string, unknown>): Promise<string[]> {
    const config = vscode.workspace.getConfiguration('autoGit');
    for (const key of KEYS) {
      await config.update(key, key in values ? values[key] : undefined, vscode.ConfigurationTarget.Workspace);
    }
    await discovery.refresh();
    return Promise.all(discovery.getRepositories().map((r) => realKey(r.rootUri.fsPath))).then((keys) => keys.sort());
  }

  async function keys(...rels: string[]): Promise<string[]> {
    return (await Promise.all(rels.map((rel) => realKey(repo(rel))))).sort();
  }

  before(async () => {
    const fromEnv = process.env.AUTO_GIT_FIXTURE;
    assert.ok(fromEnv, 'AUTO_GIT_FIXTURE is not set');
    fixture = fromEnv;
    const ext = vscode.extensions.getExtension<AutoGitExports>('anthonygaliamov.auto-sync');
    assert.ok(ext);
    const exports = await ext.activate();
    const found = await exports.ready;
    assert.ok(found, 'discovery did not start');
    discovery = found.discovery;
  });

  afterEach(() => configure({}));

  it('never tracks a repo without a remote', async () => {
    const tracked = await configure({ scanDepth: 5 });
    assert.ok(!tracked.includes(await realKey(repo('local-only'))));
  });

  it('never tracks a repo without a remote, even when included by path', async () => {
    assert.deepStrictEqual(await configure({ includeRepos: [repo('local-only')] }), []);
  });

  it('never asks the Git extension to open a repo without a remote', async () => {
    // VS Code's own repository detection may still open it. This checks only what Auto Git asks for.
    const api = (discovery as unknown as { api: { openRepository: (uri: vscode.Uri) => Promise<unknown> } }).api;
    const original = api.openRepository.bind(api);
    const asked: string[] = [];
    api.openRepository = (uri) => {
      asked.push(uri.fsPath);
      return original(uri);
    };
    try {
      await configure({ scanDepth: 5, includeRepos: [repo('local-only')] });
    } finally {
      api.openRepository = original;
    }
    assert.ok(asked.length > 0, 'the spy saw no calls');
    const keys = await Promise.all(asked.map(realKey));
    assert.ok(!keys.includes(await realKey(repo('local-only'))), 'local-only was opened');
  });

  it('finds repos within the default depth', async () => {
    assert.deepStrictEqual(await configure({}), await keys('a', 'nested/b'));
  });

  it('finds deeper repos when scanDepth is raised', async () => {
    assert.deepStrictEqual(await configure({ scanDepth: 5 }), await keys('a', 'nested/b', 'nested/x/y/z/deep'));
  });

  it('finds nothing at depth 0 when the workspace folder is not a repo', async () => {
    assert.deepStrictEqual(await configure({ scanDepth: 0 }), []);
  });

  it('syncs only included repos', async () => {
    assert.deepStrictEqual(await configure({ includeRepos: [repo('nested/b')] }), await keys('nested/b'));
  });

  it('includes repos outside the scan depth', async () => {
    assert.deepStrictEqual(
      await configure({ includeRepos: [repo('nested/x/y/z/deep')] }),
      await keys('nested/x/y/z/deep'),
    );
  });

  it('skips excluded repos', async () => {
    assert.deepStrictEqual(await configure({ excludeRepos: [repo('a')] }), await keys('nested/b'));
  });

  it('lets exclude win over include', async () => {
    assert.deepStrictEqual(
      await configure({ includeRepos: [repo('a'), repo('nested/b')], excludeRepos: [repo('a')] }),
      await keys('nested/b'),
    );
  });
});
