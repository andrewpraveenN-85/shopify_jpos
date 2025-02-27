require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const mysql = require("mysql2/promise");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON requests
app.use(bodyParser.json());

// Database connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Function to verify Shopify webhook signature
function verifyShopifyWebhook(req, res, next) {
    try {
        const hmac = req.headers["x-shopify-hmac-sha256"];
        const data = JSON.stringify(req.body);
        const secret = process.env.SHOPIFY_WEBHOOK_SECRET;

        if (!hmac || !secret) {
            return res.status(400).send("Missing webhook signature or secret.");
        }

        const hash = crypto.createHmac("sha256", secret).update(data).digest("base64");

        if (hmac === hash) {
            return next();
        } else {
            return res.status(401).send("Unauthorized");
        }
    } catch (error) {
        console.error("Webhook verification error:", error);
        return res.status(500).send("Internal Server Error");
    }
}

// Webhook endpoint to process orders
app.post("/webhook/shopify-order", verifyShopifyWebhook, async (req, res) => {
    try {
        const order = req.body;

        // Extract line items and update stock in your database
        for (const item of order.line_items) {
            const productId = item.sku;  // Assuming SKU matches your database product ID
            const quantity = item.quantity;

            // Call your database update function
            await updateStock(productId, quantity);
        }

        res.status(200).send("Stock updated successfully");
    } catch (error) {
        console.error("Error processing order:", error);
        res.status(500).send("Internal Server Error");
    }
});

// Function to update stock in the database
async function updateStock(productId, quantity) {
    const conn = await pool.getConnection();
    try {
        const [result] = await conn.execute(
            "UPDATE products SET stock = stock - ? WHERE sku = ?",
            [quantity, productId]
        );

        if (result.affectedRows === 0) {
            console.warn(`No product found with SKU: ${productId}`);
        } else {
            console.log(`Updated stock for ${productId}, reduced by ${quantity}`);
        }
    } catch (error) {
        console.error(`Database update error for ${productId}:`, error);
    } finally {
        conn.release();
    }
}

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
