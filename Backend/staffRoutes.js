
const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("./db");

const router = express.Router();

// ANNA LOGIN
router.post("/staff/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                message: "Username and password are required."
            });
        }

        const [rows] = await pool.execute(
            `SELECT staff_id, username, password_hash, display_name
             FROM staff_accounts
             WHERE username = ?`,
            [username.trim()]
        );

        if (rows.length === 0) {
            return res.status(401).json({
                message: "Invalid username or password."
            });
        }

        const staff = rows[0];

        const validPassword = await bcrypt.compare(
            password,
            staff.password_hash
        );

        if (!validPassword) {
            return res.status(401).json({
                message: "Invalid username or password."
            });
        }

        req.session.regenerate((error) => {
            if (error) {
                return res.status(500).json({
                    message: "Unable to create session."
                });
            }

            req.session.staffId = staff.staff_id;

            res.json({
                message: "Staff login successful.",
                staff: {
                    staff_id: staff.staff_id,
                    username: staff.username,
                    display_name: staff.display_name
                }
            });
        });

    } catch (error) {
        console.error("Staff login error:", error);

        res.status(500).json({
            message: "Staff login failed."
        });
    }
});


// CHECK ANNA'S SESSION
router.get("/staff/me", (req, res) => {
    if (!req.session.staffId) {
        return res.status(401).json({
            message: "Staff login required."
        });
    }

    res.json({
        staff_id: req.session.staffId
    });
});


// ANNA LOGOUT
router.post("/staff/logout", (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            return res.status(500).json({
                message: "Logout failed."
            });
        }

        res.clearCookie("connect.sid");

        res.json({
            message: "Staff logout successful."
        });
    });
});

module.exports = router;


