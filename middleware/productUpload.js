const path = require('path');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { cloudinary } = require('../utils/cloudinary');

const ALLOWED_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp'
]);

function safePublicId(originalName) {
    const extension = path.extname(originalName || '');
    const baseName = path
        .basename(originalName || 'product-image', extension)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50) || 'product-image';

    return `${Date.now()}-${baseName}`;
}

const productImageStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: 'products',
        resource_type: 'image',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        public_id: (req, file) => safePublicId(file.originalname)
    }
});

const productImageUpload = multer({
    storage: productImageStorage,
    limits: {
        fileSize: 2 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
            return cb(new Error('Only JPEG, PNG, and WEBP product images are allowed'));
        }

        cb(null, true);
    }
});

module.exports = {
    productImageUpload
};
