const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const Product = require('../models/Product');
const { nextSequence } = require('../models/Counter');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { cleanDoc, cleanDocs } = require('../utils/format');

const router = express.Router();

const uploadsDir = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const extension =
            path.extname(file.originalname || '').toLowerCase() || '.jpg';
        const safeBaseName =
            path
            .basename(file.originalname || 'product-image', extension)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 50) || 'product-image';

        cb(null, `${Date.now()}-${safeBaseName}${extension}`);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype || !file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image uploads are allowed'));
        }
        cb(null, true);
    }
});

function parsePrice(value) {
    const price = Number(value);
    if (!Number.isFinite(price) || price < 0) return null;
    return Number(price.toFixed(2));
}

function parseStock(value) {
    const stock = Number(value || 0);
    if (!Number.isInteger(stock) || stock < 0) return null;
    return stock;
}

function validateProductFields({
    name,
    category,
    price,
    stock,
    image,
    requireImageUpload = false
}) {
    if (!name || !String(name).trim()) {
        return 'Product name is required';
    }

    if (!category || !String(category).trim()) {
        return 'Category is required';
    }

    if (price === null) {
        return 'Price must be a valid non-negative number';
    }

    if (stock === null) {
        return 'Stock must be a valid non-negative integer';
    }

    if (requireImageUpload && !image) {
        return 'Product image upload is required';
    }

    if (!requireImageUpload && !image) {
        return 'Product image is required';
    }

    return '';
}

function imageUrlForFile(file) {
    if (!file || !file.filename) return '';
    return `/uploads/${file.filename}`;
}

function deleteUploadedFile(imageUrl) {
    if (!imageUrl || !String(imageUrl).startsWith('/uploads/')) {
        return;
    }

    const filePath = path.join(uploadsDir, path.basename(String(imageUrl)));
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

/**
 * GET /api/products
 */
router.get('/', async(req, res) => {
    try {
        const products = await Product.find({}).sort({ id: -1 });
        res.json(cleanDocs(products));
    } catch (error) {
        console.error('Products fetch error:', error);
        res.status(500).json({
            message: 'Error fetching products',
            error: error.message
        });
    }
});

/**
 * POST /api/products
 * Add new product (image required)
 */
router.post(
    '/',
    authMiddleware,
    adminMiddleware,
    upload.single('image'),
    async(req, res) => {
        try {
            console.log('ADD PRODUCT BODY:', req.body);
            console.log('ADD PRODUCT FILE:', req.file);

            const { name, category } = req.body || {};
            const price = parsePrice(req.body ? req.body.price : undefined);
            const stock = parseStock(req.body ? req.body.stock : undefined);
            const image = imageUrlForFile(req.file);

            const validationError = validateProductFields({
                name,
                category,
                price,
                stock,
                image,
                requireImageUpload: true
            });

            if (validationError) {
                if (req.file) {
                    deleteUploadedFile(image);
                }
                return res.status(400).json({ message: validationError });
            }

            const product = await Product.create({
                id: await nextSequence('product'),
                name: String(name).trim(),
                category: String(category).trim(),
                price,
                image: String(image).trim(),
                stock
            });

            res.json({
                message: 'Product added successfully',
                product: cleanDoc(product)
            });
        } catch (error) {
            console.error('Product add error:', error);
            if (req.file) {
                deleteUploadedFile(imageUrlForFile(req.file));
            }
            res.status(500).json({
                message: 'Error adding product',
                error: error.message
            });
        }
    }
);

/**
 * PUT /api/products/:id
 * Update product
 * - If new image is uploaded: replace old
 * - If no new image: keep old image (stable)
 */
router.put(
    '/:id',
    authMiddleware,
    adminMiddleware,
    upload.single('image'),
    async(req, res) => {
        const productId = Number(req.params.id);

        try {
            console.log('UPDATE PRODUCT BODY:', req.body);
            console.log('UPDATE PRODUCT FILE:', req.file);

            const { name, category } = req.body || {};
            const price = parsePrice(req.body ? req.body.price : undefined);
            const stock = parseStock(req.body ? req.body.stock : undefined);

            const existingProduct = await Product.findOne({ id: productId });
            if (!existingProduct) {
                if (req.file) {
                    deleteUploadedFile(imageUrlForFile(req.file));
                }
                return res.status(404).json({ message: 'Product not found' });
            }

            const image = req.file ?
                imageUrlForFile(req.file) :
                existingProduct.image;

            const validationError = validateProductFields({
                name,
                category,
                price,
                stock,
                image
            });

            if (validationError) {
                if (req.file) {
                    deleteUploadedFile(imageUrlForFile(req.file));
                }
                return res.status(400).json({ message: validationError });
            }

            const updated = await Product.findOneAndUpdate({ id: productId }, {
                name: String(name).trim(),
                category: String(category).trim(),
                price,
                image: String(image).trim(),
                stock
            }, { new: true });

            if (
                req.file &&
                existingProduct.image &&
                existingProduct.image !== image
            ) {
                deleteUploadedFile(existingProduct.image);
            }

            res.json({
                message: 'Product updated successfully',
                product: cleanDoc(updated)
            });
        } catch (error) {
            if (req.file) {
                deleteUploadedFile(imageUrlForFile(req.file));
            }
            console.error('Product update error:', error);
            res.status(500).json({
                message: 'Error updating product',
                error: error.message
            });
        }
    }
);

/**
 * DELETE /api/products/:id
 */
router.delete(
    '/:id',
    authMiddleware,
    adminMiddleware,
    async(req, res) => {
        try {
            const product = await Product.findOneAndDelete({
                id: Number(req.params.id)
            });

            if (!product) {
                return res.status(404).json({ message: 'Product not found' });
            }

            deleteUploadedFile(product.image);

            res.json({ message: 'Product deleted successfully' });
        } catch (error) {
            console.error('Product delete error:', error);
            res.status(500).json({
                message: 'Error deleting product',
                error: error.message
            });
        }
    }
);

// Multer error handler
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        return res.status(400).json({
            message: error.code === 'LIMIT_FILE_SIZE' ?
                'Image must be 5MB or smaller' : error.message
        });
    }

    if (error && error.message === 'Only image uploads are allowed') {
        return res.status(400).json({ message: error.message });
    }

    next(error);
});

module.exports = router;