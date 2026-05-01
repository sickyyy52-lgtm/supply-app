const fs = require('fs');
const path = require('path');

const MIME_EXT = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp'
};

function saveBase64Image(base64Data, folderName) {
    if (!base64Data || typeof base64Data !== 'string') {
        throw new Error('Image data is required');
    }

    const match = base64Data.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
        throw new Error('Invalid image format');
    }

    const mimeType = match[1].toLowerCase();
    const data = match[2];
    const ext = MIME_EXT[mimeType];

    if (!ext) {
        throw new Error('Unsupported image type');
    }

    const buffer = Buffer.from(data, 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
        throw new Error('Image too large. Max 5MB allowed');
    }

    const safeFolder = folderName || 'payment-proofs';
    const uploadDir = path.join(__dirname, '..', 'public', 'uploads', safeFolder);
    fs.mkdirSync(uploadDir, { recursive: true });

    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const fullPath = path.join(uploadDir, filename);
    fs.writeFileSync(fullPath, buffer);

    return `/uploads/${safeFolder}/${filename}`;
}

module.exports = {
    saveBase64Image
};
