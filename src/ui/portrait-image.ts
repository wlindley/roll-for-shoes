export const MAX_PORTRAIT_DIMENSION = 256;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image file.'));
    img.src = src;
  });
}

export async function encodePortraitFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.size === 0) {
    throw new Error('Please select a valid image file.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    if (!(img.naturalWidth > 0 && img.naturalHeight > 0)) {
      throw new Error('Selected image has invalid dimensions.');
    }

    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    const target = Math.min(MAX_PORTRAIT_DIMENSION, side);

    const canvas = document.createElement('canvas');
    canvas.width = target;
    canvas.height = target;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to initialize image canvas.');
    }

    ctx.imageSmoothingEnabled = target < side;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, target, target);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, target, target);

    const webp = canvas.toDataURL('image/webp', 0.82);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function characterInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => (Array.from(part)[0] ?? '').toUpperCase())
    .join('');
}
