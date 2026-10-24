const RATING_STATUS_KEY = 'ratingPromptStatus';
const REQUIRED_OPENS = 5;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

interface RatingSettings {
  ratingPromptStatus?: string;
  hideUntil?: number;
}

interface SidebarOpenedResponse {
  count?: number;
  error?: string;
}

function shouldShowRatingPrompt(settings: RatingSettings, openCount: number): boolean {
  if (openCount < REQUIRED_OPENS || settings[RATING_STATUS_KEY] === 'reviewed') return false;
  return settings[RATING_STATUS_KEY] !== 'temp_hidden' || Date.now() >= (settings.hideUntil || 0);
}

function createRatingPrompt(): {
  prompt: HTMLDivElement;
  stars: HTMLButtonElement[];
  closeButton: HTMLButtonElement;
} {
  const prompt = document.createElement('div');
  prompt.className = 'rating-prompt';

  const text = document.createElement('span');
  text.className = 'rating-text';
  text.textContent = 'Enjoying the extension? Rate us!';

  const stars = document.createElement('div');
  stars.className = 'rating-stars';
  stars.setAttribute('aria-label', 'Rate this extension');

  for (let index = 1; index <= 5; index++) {
    const star = document.createElement('button');
    star.className = 'star';
    star.type = 'button';
    star.textContent = '★';
    star.setAttribute('aria-label', `${index} stars`);
    stars.appendChild(star);
  }

  const closeButton = document.createElement('button');
  closeButton.className = 'close-button';
  closeButton.type = 'button';
  closeButton.textContent = '×';
  closeButton.setAttribute('aria-label', 'Close rating prompt');

  prompt.append(text, stars, closeButton);
  return { prompt, stars: [...stars.children] as HTMLButtonElement[], closeButton };
}

function showRatingPrompt(): void {
  const { prompt, stars, closeButton } = createRatingPrompt();
  document.querySelector('main')?.appendChild(prompt);

  let animationInterval: ReturnType<typeof setInterval> | undefined;
  let animationTimeout: ReturnType<typeof setTimeout> | undefined;

  function updateStars(rating: number): void {
    stars.forEach((star, index) => star.classList.toggle('active', index < rating));
  }

  function hidePrompt(): void {
    clearInterval(animationInterval);
    clearTimeout(animationTimeout);
    prompt.classList.add('hidden');
    setTimeout(() => prompt.remove(), 300);
  }

  function animateStars(): void {
    stars.forEach((star, index) => {
      setTimeout(() => {
        if (!prompt.isConnected || prompt.classList.contains('hidden')) return;
        star.classList.add('animate');
        updateStars(index + 1);
        setTimeout(() => star.classList.remove('animate'), 500);
      }, index * 200);
    });
    animationTimeout = setTimeout(() => updateStars(0), 2000);
  }

  stars.forEach((star, index) => {
    star.addEventListener('mouseenter', () => updateStars(index + 1));
    star.addEventListener('focus', () => updateStars(index + 1));
    star.addEventListener('mouseleave', () => updateStars(0));
    star.addEventListener('blur', () => updateStars(0));
    star.addEventListener('click', async () => {
      try {
        await chrome.storage.local.set({ [RATING_STATUS_KEY]: 'reviewed', sidebarOpenCount: 0 });
        await chrome.tabs.create({ url: `https://chromewebstore.google.com/detail/${chrome.runtime.id}` });
        hidePrompt();
      } catch (error) {
        console.error('Failed to open rating page:', error);
      }
    });
  });

  closeButton.addEventListener('click', async () => {
    try {
      await chrome.storage.local.set({
        [RATING_STATUS_KEY]: 'temp_hidden',
        hideUntil: Date.now() + ONE_DAY_MS,
      });
      hidePrompt();
    } catch (error) {
      console.error('Failed to dismiss rating prompt:', error);
    }
  });

  animationTimeout = setTimeout(() => {
    animateStars();
    animationInterval = setInterval(animateStars, 10000);
  }, 1000);
}

async function initializeRatingPrompt(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage<{ type: string }, SidebarOpenedResponse>({ type: 'sidebarOpened' });
    if (response?.error) throw new Error(response.error);
    if (typeof response?.count !== 'number') throw new Error('Missing sidebar open count');

    const settings = await chrome.storage.local.get([RATING_STATUS_KEY, 'hideUntil']) as RatingSettings;
    if (shouldShowRatingPrompt(settings, response.count)) showRatingPrompt();
  } catch (error) {
    console.error('Failed to initialize rating prompt:', error);
  }
}

initializeRatingPrompt();
