import { expect, test } from 'bun:test';
import { createArticleContent } from '../src/extractor';

test('article content is normalized and truncated for insertion', () => {
  const articleText = `第一段\n\n\n${'正文'.repeat(11000)}`;
  const result = createArticleContent('测试文章', 'https://example.com/article', articleText);
  if (!result) throw new Error('应提取到文章正文');

  expect(result.title).toBe('测试文章');
  expect(result.url).toBe('https://example.com/article');
  expect(result.text).toStartWith('第一段\n\n正文');
  expect(result.text.length).toBe(20000);
  expect(result.isTruncated).toBe(true);
});
