import { expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';
import { extractArticle } from '../src/prefill';

test('article extraction runs without module variables in the active tab', () => {
  const articleText = `第一段\n\n\n${'正文'.repeat(11000)}`;
  const document = {
    title: '测试文章',
    querySelector: () => ({ innerText: articleText }),
    body: { innerText: '页面导航' },
  };
  const location = { href: 'https://example.com/article' };

  const result = runInNewContext(`(${extractArticle.toString()})()`, { document, location });

  expect(result.title).toBe('测试文章');
  expect(result.url).toBe('https://example.com/article');
  expect(result.text).toStartWith('第一段\n\n正文');
  expect(result.text.length).toBe(20000);
  expect(result.isTruncated).toBe(true);
});
