
const express = require("express");
const pool = require("./db");

const router = express.Router();

function requireStaff(req, res, next) {
    if (!req.session.staffId) {
        return res.status(401).json({
            message: "Anna's login is required."
        });
    }

    next();
}


// CUSTOMER: VIEW ACTIVE PRODUCTS
router.get("/products", async (req, res) => {
    try {
        const [products] = await pool.execute(
            `SELECT product_id, product_name, category,
                    brand, material_style, color,
                    unit_price, pricing_unit, dimensions,
                    sqft_per_package, description
             FROM flooring_products
             WHERE active = TRUE
             ORDER BY product_name`
        );

        res.json(products);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Unable to retrieve products."
        });
    }
});


// ANNA: VIEW ALL PRODUCTS
router.get("/admin/products", requireStaff, async (req, res) => {
    try {
        const [products] = await pool.execute(
            `SELECT *
             FROM flooring_products
             ORDER BY product_id DESC`
        );

        res.json(products);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Unable to retrieve products."
        });
    }
});


// ANNA: ADD PRODUCT
router.post("/admin/products", requireStaff, async (req, res) => {
    try {
        const {
            product_name,
            category,
            brand,
            material_style,
            color,
            unit_price,
            pricing_unit,
            dimensions,
            sqft_per_package,
            description
        } = req.body;

        if (!product_name || !category ||
            unit_price === undefined || !pricing_unit) {
            return res.status(400).json({
                message: "Product name, category, price and pricing unit are required."
            });
        }

        const price = Number(unit_price);

        if (!Number.isFinite(price) || price < 0) {
            return res.status(400).json({
                message: "Invalid product price."
            });
        }

        const validUnits = ["SQFT", "BOX", "PIECE"];

        if (!validUnits.includes(pricing_unit)) {
            return res.status(400).json({
                message: "Invalid pricing unit."
            });
        }

        const coverage = sqft_per_package == null ||
                         sqft_per_package === ""
            ? null : Number(sqft_per_package);

        if (
            coverage !== null &&
            (!Number.isFinite(coverage) || coverage <= 0)
        ) {
            return res.status(400).json({
                message: "Package coverage must be positive."
            });
        }

        const [result] = await pool.execute(
            `INSERT INTO flooring_products
            (
                product_name, category, brand,
                material_style, color, unit_price,
                pricing_unit, dimensions,
                sqft_per_package, description
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                product_name.trim(),
                category.trim(),
                brand || null,
                material_style || null,
                color || null,
                price,
                pricing_unit,
                dimensions || null,
                coverage,
                description || null
            ]
        );

        res.status(201).json({
            message: "Product added successfully.",
            product_id: result.insertId
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Unable to add product."
        });
    }
});


// ANNA: UPDATE PRODUCT
router.put("/admin/products/:id", requireStaff, async (req, res) => {
    try {
        const productId = Number(req.params.id);

        const {
            product_name,
            category,
            brand,
            material_style,
            color,
            unit_price,
            pricing_unit,
            dimensions,
            sqft_per_package,
            description
        } = req.body;

        const price = Number(unit_price);
        const validUnits = ["SQFT", "BOX", "PIECE"];

        if (
            !Number.isInteger(productId) ||
            productId <= 0 ||
            !product_name ||
            !category ||
            !Number.isFinite(price) ||
            price < 0 ||
            !validUnits.includes(pricing_unit)
        ) {
            return res.status(400).json({
                message: "Invalid product information."
            });
        }

        const coverage = sqft_per_package == null ||
                         sqft_per_package === ""
            ? null : Number(sqft_per_package);

        if (
            coverage !== null &&
            (!Number.isFinite(coverage) || coverage <= 0)
        ) {
            return res.status(400).json({
                message: "Invalid package coverage."
            });
        }

        const [result] = await pool.execute(
            `UPDATE flooring_products
             SET product_name = ?,
                 category = ?,
                 brand = ?,
                 material_style = ?,
                 color = ?,
                 unit_price = ?,
                 pricing_unit = ?,
                 dimensions = ?,
                 sqft_per_package = ?,
                 description = ?
             WHERE product_id = ?`,
            [
                product_name.trim(),
                category.trim(),
                brand || null,
                material_style || null,
                color || null,
                price,
                pricing_unit,
                dimensions || null,
                coverage,
                description || null,
                productId
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Product not found."
            });
        }

        res.json({
            message: "Product updated successfully."
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Unable to update product."
        });
    }
});


// ANNA: ACTIVATE OR DEACTIVATE PRODUCT
router.patch("/admin/products/:id/status", requireStaff, async (req, res) => {
    try {
        const productId = Number(req.params.id);
        const { active } = req.body;

        if (
            !Number.isInteger(productId) ||
            productId <= 0 ||
            typeof active !== "boolean"
        ) {
            return res.status(400).json({
                message: "Valid product ID and active status are required."
            });
        }

        const [result] = await pool.execute(
            `UPDATE flooring_products
             SET active = ?
             WHERE product_id = ?`,
            [active, productId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: "Product not found."
            });
        }

        res.json({
            message: "Product status updated."
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Unable to update product status."
        });
    }
});

module.exports = router;



