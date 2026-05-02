const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const Product = require('../models/Product');
const { nextSequence } = require('../models/Counter');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { cleanDoc, cleanDocs } = require('../utils/format');

const router = express.Router();

// Cloudinary config (env se: CLOUDINARY_URL)
cloudinary.config({
    cloudinary_url: process.env.CLOUDINARY_URL
});

// Multer memory storage (disk pe file nahi banega)
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
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
    if (!name || !String(name).trim()) return 'Product name is required';
    if (!category || !String(category).trim()) return 'Category is required';
    if (price === null) return 'Price must be a valid non-negative number';
    if (stock === null) return 'Stock must be a valid non-negative integer';
    if (requireImageUpload && !image) return 'Product image upload is required';
    if (!requireImageUpload && !image) return 'Product image is required';
    return '';
}

// Cloudinary upload helper
function uploadToCloudinary(fileBuffer, filename = 'product-image') {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
                resource_type: 'image',
                folder: 'nexts/products',
                public_id: `${Date.now()}-${filename}`
            },
            (error, result) => {
                if (error) {
                    console.error('Cloudinary upload error:', error);
                    return reject(new Error('Failed to upload image'));
                }
                resolve(result.secure_url); // https://res.cloudinary.com/...
            }
        );

        stream.end(fileBuffer);
    });
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
            const price = parsePrice(req.body ? .price);
            const stock = parseStock(req.body ? .stock);

            let imageUrl = '';
            if (req.file && req.file.buffer) {
                imageUrl = await uploadToCloudinary(
                    req.file.buffer,
                    req.file.originalname || 'product-image'
                );
            }

            const validationError = validateProductFields({
                name,
                category,
                price,
                stock,
                image: imageUrl,
                requireImageUpload: true
            });

            if (validationError) {
                return res.status(400).json({ message: validationError });
            }

            const product = await Product.create({
                id: await nextSequence('product'),
                name: String(name).trim(),
                category: String(category).trim(),
                price,
                image: imageUrl,
                stock
            });

            res.json({
                message: 'Product added successfully',
                product: cleanDoc(product)
            });
        } catch (error) {
            console.error('Product add error:', error);
            res.status(500).json({
                message: 'Error adding product',
                error: error.message
            });
        }
    }
);

/**
 * PUT /api/products/:id
 * Update product (image optional)
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
            const price = parsePrice(req.body ? .price);
            const stock = parseStock(req.body ? .stock);

            const existingProduct = await Product.findOne({ id: productId });
            if (!existingProduct) {
                return res.status(404).json({ message: 'Product not found' });
            }

            let imageUrl = existingProduct.image;
            if (req.file && req.file.buffer) {
                imageUrl = await uploadToCloudinary(
                    req.file.buffer,
                    req.file.originalname || 'product-image'
                );
            }

            const validationError = validateProductFields({
                name,
                category,
                price,
                stock,
                image: imageUrl
            });

            if (validationError) {
                return res.status(400).json({ message: validationError });
            }

            const updated = await Product.findOneAndUpdate({ id: productId }, {
                name: String(name).trim(),
                category: String(category).trim(),
                price,
                image: imageUrl,
                stock
            }, { new: true });

            res.json({
                message: 'Product updated successfully',
                product: cleanDoc(updated)
            });
        } catch (error) {
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

            // (Optional) yahan Cloudinary se image delete karne ka logic add kar sakte ho

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