
const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("./db");

const router = express.Router();

// CUSTOMER REGISTRATION
router.post("/register", async (req, res) => {
    try {
        const {
            first_name,
            last_name,
            address,
            phone,
            email,
            password
        } = req.body;

        if (
            !first_name || !last_name || !address ||
            !phone || !email || !password
        ) {
            return res.status(400).json({
                message: "Please fill in all required fields."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                message: "Password must contain at least 8 characters."
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const [existing] = await pool.execute(
            "SELECT client_id FROM clients WHERE email = ?",
            [normalizedEmail]
        );

        if (existing.length > 0) {
            return res.status(409).json({
                message: "This email is already registered."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const [result] = await pool.execute(
            `INSERT INTO clients
            (first_name, last_name, address, phone, email, password_hash)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [
                first_name.trim(),
                last_name.trim(),
                address.trim(),
                phone.trim(),
                normalizedEmail,
                passwordHash
            ]
        );

        res.status(201).json({
            message: "Registration successful.",
            client_id: result.insertId
        });

    } catch (error) {
        console.error("Registration error:", error);

        res.status(500).json({
            message: "Registration failed."
        });
    }
});


// CUSTOMER LOGIN
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required."
            });
        }

        const [rows] = await pool.execute(
            `SELECT client_id, first_name, last_name,
                    email, password_hash
             FROM clients
             WHERE email = ?`,
            [email.trim().toLowerCase()]
        );

        if (rows.length === 0) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        const client = rows[0];

        const validPassword = await bcrypt.compare(
            password,
            client.password_hash
        );

        if (!validPassword) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        // Prevent session fixation
        req.session.regenerate((err) => {
            if (err) {
                return res.status(500).json({
                    message: "Unable to create session."
                });
            }

            req.session.clientId = client.client_id;

            res.json({
                message: "Login successful.",
                client: {
                    client_id: client.client_id,
                    first_name: client.first_name,
                    last_name: client.last_name,
                    email: client.email
                }
            });
        });

    } catch (error) {
        console.error("Login error:", error);

        res.status(500).json({
            message: "Login failed."
        });
    }
});


// GET CURRENT CUSTOMER
router.get("/me", async (req, res) => {
    try {
        if (!req.session.clientId) {
            return res.status(401).json({
                message: "Please log in first."
            });
        }

        const [rows] = await pool.execute(
            `SELECT client_id, first_name, last_name,
                    address, phone, email
             FROM clients
             WHERE client_id = ?`,
            [req.session.clientId]
        );

        if (rows.length === 0) {
            return res.status(401).json({
                message: "Customer account not found."
            });
        }

        res.json(rows[0]);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Unable to retrieve customer."
        });
    }
});


// CUSTOMER LOGOUT
router.post("/logout", (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            return res.status(500).json({
                message: "Logout failed."
            });
        }

        res.clearCookie("connect.sid");

        res.json({
            message: "Logout successful."
        });
    });
});

module.exports = router;
