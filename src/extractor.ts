import { Readability } from '@mozilla/readability';
import Defuddle from 'defuddle';
import TurndownService from 'turndown';

type ExtractorName = 'readability' | 'defuddle';
type OutputFormat = 'text' | 'markdown';

interface ArticleContent {
  title: string;
  url: string;
  text: string;
  isTruncated: boolean;
}

export function createArticleContent(title: string, url: string, text: string): ArticleContent | undefined {
  const ARTICLE_LENGTH_LIMIT = 20000;
  const normalizedText = text.replace(/\n{3,}/g, '\n\n').trim();
  if (!normalizedText) return undefined;

  return {
    title,
    url,
    text: normalizedText.slice(0, ARTICLE_LENGTH_LIMIT),
    isTruncated: normalizedText.length > ARTICLE_LENGTH_LIMIT,
  };
}

function extractArticle(extractor: ExtractorName, format: OutputFormat): ArticleContent | undefined {
  const documentClone = document.cloneNode(true) as Document;
  let title = document.title;
  let contentHtml: string;

  if (extractor === 'defuddle') {
    const result = new Defuddle(documentClone, { useAsync: false }).parse();
    title = result.title || title;
    contentHtml = result.content ?? '';
  } else {
    const result = new Readability(documentClone).parse();
    if (!result) return undefined;
    title = result.title || title;
    contentHtml = result.content ?? '';
  }

  const contentDocument = new DOMParser().parseFromString(contentHtml, 'text/html');
  const text = format === 'markdown'
    ? new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' }).turndown(contentDocument.body)
    : contentDocument.body.innerText || contentDocument.body.textContent || '';

  return createArticleContent(title, location.href, text);
}

(globalThis as typeof globalThis & { deepseekSidebarExtractArticle: typeof extractArticle })
  .deepseekSidebarExtractArticle = extractArticle;
