const express = require('express');
const multer = require('multer');
const Product = require('../models/Product');
const { nextSequence } = require('../models/Counter');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { productImageUpload } = require('../middleware/productUpload');
const { deleteCloudinaryImage } = require('../utils/cloudinary');
const { cleanDoc, cleanDocs } = require('../utils/format');

const router = express.Router();

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
    return file && file.path ? String(file.path) : '';
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
    productImageUpload.single('image'),
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
                    await deleteCloudinaryImage(image);
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
                await deleteCloudinaryImage(imageUrlForFile(req.file));
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
 * - If no new image: keep old image
 */
router.put(
    '/:id',
    authMiddleware,
    adminMiddleware,
    productImageUpload.single('image'),
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
                    await deleteCloudinaryImage(imageUrlForFile(req.file));
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
                    await deleteCloudinaryImage(imageUrlForFile(req.file));
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
                await deleteCloudinaryImage(existingProduct.image);
            }

            res.json({
                message: 'Product updated successfully',
                product: cleanDoc(updated)
            });
        } catch (error) {
            if (req.file) {
                await deleteCloudinaryImage(imageUrlForFile(req.file));
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

            await deleteCloudinaryImage(product.image);

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
                'Product image must be 2MB or smaller' : error.message
        });
    }

    if (error && error.message === 'Only JPEG, PNG, and WEBP product images are allowed') {
        return res.status(400).json({ message: error.message });
    }

    console.error('Product image upload error:', error);
    return res.status(500).json({
        message: 'Product image upload failed. Please try again.',
        error: error.message
    });
});

module.exports = router;
