
const express = require("express");
const pool = require("./db");

const router = express.Router();

// CUSTOMER: VIEW ACTIVE FLOORING PRODUCTS
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
        console.error("Product retrieval error:", error);

        res.status(500).json({
            message: "Unable to retrieve products."
        });
    }
});

module.exports = router;
