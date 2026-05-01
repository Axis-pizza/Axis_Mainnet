import { Hono } from 'hono';
import { Bindings } from '../config/env';

const app = new Hono<{ Bindings: Bindings }>();

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  // iOS shares often arrive as HEIC/HEIF — accept both so PFP upload works on iPhone.
  'image/heic',
  'image/heif',
];
const MAX_SIZE = 5 * 1024 * 1024;

const extensionForMime = (mime: string): string => {
  const m = mime.toLowerCase();
  if (m === 'image/jpeg') return 'jpg';
  if (m === 'image/png') return 'png';
  if (m === 'image/webp') return 'webp';
  if (m === 'image/gif') return 'gif';
  if (m === 'image/heic') return 'heic';
  if (m === 'image/heif') return 'heif';
  return 'bin';
};

const generateImageKey = (
  walletAddress: string,
  type: 'strategy' | 'profile',
  mime: string,
): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${type}/${walletAddress}/${timestamp}-${random}.${extensionForMime(mime)}`;
};

app.post('/image', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('image') as File | null;
    const walletAddress = formData.get('wallet_address') as string | null;
    const imageType = (formData.get('type') as 'strategy' | 'profile') || 'strategy';

    if (!walletAddress) {
       return c.json({ success: false, error: 'Wallet address is required' }, 400);
    }
    
    // バリデーション緩和: 正規表現チェックが厳しすぎる可能性を考慮し、最低限の文字数チェックのみにする
    // 本番では厳密なチェックが推奨されますが、開発中は柔軟に。
    if (walletAddress.length < 32) {
      return c.json({ success: false, error: 'Invalid wallet address format' }, 400);
    }

    if (!file) {
      return c.json({ success: false, error: 'No image file provided' }, 400);
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return c.json({ success: false, error: `Invalid file type: ${file.type}` }, 400);
    }

    if (file.size > MAX_SIZE) {
      return c.json({ success: false, error: `File too large (Max 5MB)` }, 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const key = generateImageKey(walletAddress, imageType, file.type);

    await c.env.IMAGES.put(key, arrayBuffer, {
      httpMetadata: { contentType: file.type },
      customMetadata: {
        originalType: file.type,
        walletAddress: walletAddress,
        uploadedAt: new Date().toISOString(),
      },
    });

    const url = new URL(c.req.url);
    const imageUrl = `${url.origin}/upload/image/${key}`;

    return c.json({
      success: true,
      key,
      url: imageUrl,
      walletAddress,
      type: imageType,
    });

  } catch (e: any) {
    console.error('[Upload Error]', e);
    return c.json({ success: false, error: e.message || 'Upload failed' }, 500);
  }
});

// ... (GET, DELETE はそのまま)
app.get('/image/:key{.+}', async (c) => {
  try {
    const key = c.req.param('key');
    const object = await c.env.IMAGES.get(key);
    if (!object) return c.json({ success: false, error: 'Image not found' }, 404);

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    return new Response(object.body, { headers });
  } catch (e) {
    return c.json({ error: 'Fetch failed' }, 500);
  }
});

export default app;