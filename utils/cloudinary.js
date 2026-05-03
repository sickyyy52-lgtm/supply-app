const cloudinaryUrlEnvKey = ['CLOUDINARY', 'URL'].join('_');
delete process.env[cloudinaryUrlEnvKey];

const cloudinary = require('cloudinary').v2;

const ALLOWED_IMAGE_MIME_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp'
]);
const MAX_BASE64_IMAGE_BYTES = 2 * 1024 * 1024;

if (!process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET) {
    console.error('Missing Cloudinary environment variables');
    console.error('Required: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET');
    process.exit(1);
}

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

function validateBase64Image(base64Data) {
    if (!base64Data || typeof base64Data !== 'string') {
        throw new Error('Image data is required');
    }

    const match = base64Data.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
        throw new Error('Invalid image format');
    }

    const mimeType = match[1].toLowerCase();
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
        throw new Error('Unsupported image type. Use JPEG, PNG, or WEBP');
    }

    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > MAX_BASE64_IMAGE_BYTES) {
        throw new Error('Image too large. Max 2MB allowed');
    }
}

function isCloudinaryConfigured() {
    return Boolean(
        process.env.CLOUDINARY_CLOUD_NAME &&
        process.env.CLOUDINARY_API_KEY &&
        process.env.CLOUDINARY_API_SECRET
    );
}

function cloudinaryPublicIdFromUrl(imageUrl) {
    if (!imageUrl || typeof imageUrl !== 'string') return '';

    try {
        const parsed = new URL(imageUrl);
        if (!parsed.hostname.includes('cloudinary.com')) return '';

        const uploadMarker = '/upload/';
        const uploadIndex = parsed.pathname.indexOf(uploadMarker);
        if (uploadIndex === -1) return '';

        const afterUpload = parsed.pathname.slice(uploadIndex + uploadMarker.length);
        const withoutVersion = afterUpload.replace(/^v\d+\//, '');
        const withoutExtension = withoutVersion.replace(/\.[a-zA-Z0-9]+$/, '');

        return decodeURIComponent(withoutExtension);
    } catch (error) {
        return '';
    }
}

async function deleteCloudinaryImage(imageUrl) {
    const publicId = cloudinaryPublicIdFromUrl(imageUrl);
    if (!publicId || !isCloudinaryConfigured()) return;

    try {
        await cloudinary.uploader.destroy(publicId, { invalidate: true });
    } catch (error) {
        console.error('Cloudinary image delete failed:', error.message);
    }
}

async function uploadBase64Image(base64Data, folderName = 'uploads') {
    validateBase64Image(base64Data);

    const result = await cloudinary.uploader.upload(base64Data, {
        folder: folderName,
        resource_type: 'image',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp']
    });

    return result.secure_url;
}

module.exports = {
    cloudinary,
    deleteCloudinaryImage,
    uploadBase64Image
};
