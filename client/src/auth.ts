const authTokenStorageKey = 'unityprep-auth-token';

export function getStoredAuthToken(): string | null {
  const token = localStorage.getItem(authTokenStorageKey);
  return token && token.trim().length > 0 ? token : null;
}

export function setStoredAuthToken(token: string): void {
  localStorage.setItem(authTokenStorageKey, token);
}

export function clearStoredAuthToken(): void {
  localStorage.removeItem(authTokenStorageKey);
}

export function getTelegramBotUsername(): string | null {
  const value = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined)?.trim();
  return value && value.length > 0 ? value : null;
}
