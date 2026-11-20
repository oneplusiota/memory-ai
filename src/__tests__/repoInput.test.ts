import { parseRepoInput } from '@/services/sync/repoInput';

describe('parseRepoInput', () => {
  it.each([
    ['oneplusiota/memory-data', 'oneplusiota', 'memory-data'],
    ['  oneplusiota/memory-data  ', 'oneplusiota', 'memory-data'],
    ['https://github.com/oneplusiota/memory-data', 'oneplusiota', 'memory-data'],
    ['https://github.com/oneplusiota/memory-data.git', 'oneplusiota', 'memory-data'],
    ['github.com/oneplusiota/memory-data/', 'oneplusiota', 'memory-data'],
    ['me/my.repo_name', 'me', 'my.repo_name'],
  ])('parses %s', (input, owner, repo) => {
    expect(parseRepoInput(input)).toEqual({ owner, repo });
  });

  it.each(['', 'justaname', 'a/b/c', '/repo', 'owner/', 'bad owner/repo', '-lead/repo'])('rejects %j', (input) => {
    expect(parseRepoInput(input)).toBeNull();
  });
});
