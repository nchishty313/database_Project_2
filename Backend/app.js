const express = require("express");
const cors = require("cors");
const session = require("express-session");
const pool = require("./db");

const productRoutes = require("./productRoutes");
const clientRoutes = require("./clientRoutes");
const projectRoutes = require("./projectRoutes");
const app = express();

// CORS
app.use(cors({
    origin: "http://localhost",
    credentials: true
}));

app.use(express.json());

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax"
    }
}));

// ROUTES
app.use("/api", productRoutes);
app.use("/api", clientRoutes);
app.use("/api", projectRoutes);
// Health check
app.get("/api/health", async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT 1 AS connected");

        res.json({
            status: "ok",
            database: rows[0].connected === 1
                ? "connected"
                : "error"
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            status: "error",
            database: "not connected"
        });
    }
});

const PORT = process.env.PORT || 5050;

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});