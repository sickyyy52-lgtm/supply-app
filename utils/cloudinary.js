const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
});

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

module.exports = {
    cloudinary,
    deleteCloudinaryImage
};
