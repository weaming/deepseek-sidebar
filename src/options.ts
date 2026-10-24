import { loadSettings, saveSetting, type AppSettings, type ExtractorName, type OutputFormat } from './settings';

export async function initializeOptions(): Promise<void> {
  const extractorButtons = document.querySelectorAll<HTMLButtonElement>('[data-extractor]');
  const formatButtons = document.querySelectorAll<HTMLButtonElement>('[data-format]');
  const savedStatus = document.getElementById('savedStatus');
  let statusTimer: ReturnType<typeof setTimeout> | undefined;

  function updateButtons(settings: AppSettings): void {
    for (const button of extractorButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.extractor === settings.extractor));
    }
    for (const button of formatButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.format === settings.format));
    }
  }

  function showSaved(): void {
    if (!savedStatus) return;
    clearTimeout(statusTimer);
    savedStatus.textContent = '设置已保存';
    statusTimer = setTimeout(() => { savedStatus.textContent = ''; }, 1800);
  }

  function showSaveError(): void {
    if (savedStatus) savedStatus.textContent = '保存失败，请重试';
  }

  let settings = await loadSettings();
  updateButtons(settings);

  for (const button of extractorButtons) {
    button.addEventListener('click', () => {
      const extractor = button.dataset.extractor as ExtractorName;
      settings = { ...settings, extractor };
      updateButtons(settings);
      void saveSetting('extractor', extractor).then(showSaved).catch(showSaveError);
    });
  }

  for (const button of formatButtons) {
    button.addEventListener('click', () => {
      const format = button.dataset.format as OutputFormat;
      settings = { ...settings, format };
      updateButtons(settings);
      void saveSetting('format', format).then(showSaved).catch(showSaveError);
    });
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;
    if (changes.extractor?.newValue === 'readability' || changes.extractor?.newValue === 'defuddle') {
      settings = { ...settings, extractor: changes.extractor.newValue };
    }
    if (changes.format?.newValue === 'text' || changes.format?.newValue === 'markdown') {
      settings = { ...settings, format: changes.format.newValue };
    }
    updateButtons(settings);
  });
}
