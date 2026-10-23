const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const ALLOWED_SCREENSHOT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const TYPE_ERROR = 'Use a PNG, JPEG or WebP screenshot.';
const SIZE_ERROR = 'Choose a screenshot no larger than 5 MB.';

export function reviewScreenshotFileError(file) {
  if (!ALLOWED_SCREENSHOT_TYPES.includes(file?.type)) return TYPE_ERROR;
  if (!Number.isFinite(file.size) || file.size <= 0) return 'This image is empty or could not be read.';
  if (file.size > MAX_SCREENSHOT_BYTES) return SIZE_ERROR;
  return null;
}

export function reviewScreenshotError(dataUrl) {
  if (!dataUrl) return null;
  const match = typeof dataUrl === 'string' && /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return TYPE_ERROR;
  if (match[2].length > Math.ceil(MAX_SCREENSHOT_BYTES / 3) * 4) return SIZE_ERROR;
  try {
    if (atob(match[2]).length > MAX_SCREENSHOT_BYTES) return SIZE_ERROR;
  } catch {
    return 'This image could not be read. Please select it again.';
  }
  return null;
}
