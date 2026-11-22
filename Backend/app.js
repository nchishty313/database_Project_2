
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const session = require("express-session");
const pool = require("./db");

// Customer and product routes
const productRoutes = require("./productRoutes");
const clientRoutes = require("./clientRoutes");
const projectRoutes = require("./projectRoutes");

// Staff routes
const staffRoutes = require("./staffRoutes");
const staffProjectRoutes = require("./staffProjectRoutes");

const app = express();

// CORS configuration
app.use(cors({
    origin: "http://localhost",
    credentials: true
}));

// Middleware
app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax"
    }
}));

// Register customer and product API routes
app.use("/api", productRoutes);
app.use("/api", clientRoutes);
app.use("/api", projectRoutes);

// Register staff API routes
app.use("/api", staffRoutes);
app.use("/api", staffProjectRoutes);

// Database health check
app.get("/api/health", async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT 1 AS connected"
        );

        res.json({
            status: "ok",
            database:
                rows[0].connected === 1
                    ? "connected"
                    : "error"
        });

    } catch (error) {
        console.error(
            "Database connection error:",
            error.message
        );

        res.status(500).json({
            status: "error",
            database: "not connected"
        });
    }
});

// Start server
const PORT = process.env.PORT || 5050;

app.listen(PORT, () => {
    console.log(
        `Server running at http://localhost:${PORT}`
    );
});


