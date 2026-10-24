export type ExtractorName = 'readability' | 'defuddle';
export type OutputFormat = 'text' | 'markdown';

export interface AppSettings {
  extractor: ExtractorName;
  format: OutputFormat;
}

export const DEFAULT_SETTINGS: AppSettings = {
  extractor: 'defuddle',
  format: 'markdown',
};

export async function loadSettings(): Promise<AppSettings> {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return {
    extractor: settings.extractor === 'readability' ? 'readability' : 'defuddle',
    format: settings.format === 'text' ? 'text' : 'markdown',
  };
}

export async function saveSetting<Key extends keyof AppSettings>(key: Key, value: AppSettings[Key]): Promise<void> {
  await chrome.storage.sync.set({ [key]: value });
}
