
const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("./db");

const router = express.Router();

// --------------------------------------------------
// AUTHENTICATION HELPERS
// --------------------------------------------------

function requireCustomer(req, res, next) {
    if (!req.session || !req.session.clientId) {
        return res.status(401).json({
            message: "Customer login required."
        });
    }
    next();
}

function requireStaff(req, res, next) {
    if (!req.session || !req.session.staffId) {
        return res.status(401).json({
            message: "Staff login required."
        });
    }
    next();
}

function validId(value) {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// --------------------------------------------------
// CUSTOMER REGISTRATION
// --------------------------------------------------

router.post("/register", async (req, res) => {
    try {
        const {
            first_name,
            last_name,
            address,
            phone,
            email,
            password
        } = req.body || {};

        const fields = [
            first_name, last_name, address,
            phone, email, password
        ];

        if (fields.some(
            value => typeof value !== "string" || !value.trim()
        )) {
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

        return res.status(201).json({
            message: "Registration successful.",
            client_id: result.insertId
        });

    } catch (error) {
        console.error("Registration error:", error);

        return res.status(500).json({
            message: "Registration failed."
        });
    }
});

// --------------------------------------------------
// CUSTOMER LOGIN
// --------------------------------------------------

router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body || {};

        if (
            typeof email !== "string" ||
            !email.trim() ||
            typeof password !== "string" ||
            !password
        ) {
            return res.status(400).json({
                message: "Email and password are required."
            });
        }

        const [rows] = await pool.execute(
            `SELECT
                client_id,
                first_name,
                last_name,
                email,
                password_hash
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

        // Prevent session fixation.
        req.session.regenerate(error => {
            if (error) {
                return res.status(500).json({
                    message: "Unable to create session."
                });
            }

            req.session.clientId = client.client_id;

            req.session.save(saveError => {
                if (saveError) {
                    return res.status(500).json({
                        message: "Unable to save session."
                    });
                }

                return res.json({
                    message: "Login successful.",
                    client: {
                        client_id: client.client_id,
                        first_name: client.first_name,
                        last_name: client.last_name,
                        email: client.email
                    }
                });
            });
        });

    } catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({
            message: "Login failed."
        });
    }
});

// --------------------------------------------------
// GET CURRENT CUSTOMER
// --------------------------------------------------

router.get("/me", async (req, res) => {
    if (!req.session || !req.session.clientId) {
        return res.status(401).json({
            message: "Please log in first."
        });
    }

    try {
        const [rows] = await pool.execute(
            `SELECT
                client_id,
                first_name,
                last_name,
                address,
                phone,
                email
             FROM clients
             WHERE client_id = ?`,
            [req.session.clientId]
        );

        if (rows.length === 0) {
            return res.status(401).json({
                message: "Customer account not found."
            });
        }

        return res.json(rows[0]);

    } catch (error) {
        console.error("Get customer error:", error);

        return res.status(500).json({
            message: "Unable to retrieve customer."
        });
    }
});

// --------------------------------------------------
// CUSTOMER LOGOUT
// --------------------------------------------------

router.post("/logout", (req, res) => {
    if (!req.session) {
        return res.json({
            message: "Logout successful."
        });
    }

    req.session.destroy(error => {
        if (error) {
            return res.status(500).json({
                message: "Logout failed."
            });
        }

        res.clearCookie("connect.sid");

        return res.json({
            message: "Logout successful."
        });
    });
});

// --------------------------------------------------
// GET CUSTOMER QUOTATION HISTORY
// GET /api/projects/:projectId/quotes
// --------------------------------------------------

router.get(
    "/projects/:projectId/quotes",
    requireCustomer,
    async (req, res) => {
        const projectId = validId(req.params.projectId);

        if (!projectId) {
            return res.status(400).json({
                message: "Invalid project ID."
            });
        }

        try {
            const [projects] = await pool.execute(
                `SELECT project_id
                 FROM project_requests
                 WHERE project_id = ?
                   AND client_id = ?`,
                [projectId, req.session.clientId]
            );

            if (projects.length === 0) {
                return res.status(404).json({
                    message: "Project not found."
                });
            }

            const [quotes] = await pool.execute(
                `SELECT
                    quote_id,
                    project_id,
                    version_no,
                    quoted_at,
                    waste_percent,
                    estimated_material_cost,
                    estimated_labor_cost,
                    other_net_charges,
                    total_price,
                    proposed_start,
                    proposed_end,
                    status,
                    note
                 FROM quotes
                 WHERE project_id = ?
                 ORDER BY version_no DESC`,
                [projectId]
            );

            for (const quote of quotes) {
                const [lines] = await pool.execute(
                    `SELECT
                        quote_line_id,
                        charge_type,
                        description,
                        quantity,
                        unit,
                        unit_price,
                        line_amount
                     FROM quote_lines
                     WHERE quote_id = ?
                       AND project_id = ?
                     ORDER BY quote_line_id`,
                    [quote.quote_id, projectId]
                );

                quote.lines = lines;
            }

            return res.json(quotes);

        } catch (error) {
            console.error("Quotation retrieval error:", error);

            return res.status(500).json({
                message: "Unable to load project quotations."
            });
        }
    }
);

// --------------------------------------------------
// CUSTOMER ACCEPT / REJECT / NEGOTIATE
// POST /api/projects/:projectId/quotes/:quoteId/respond
// --------------------------------------------------

router.post(
    "/projects/:projectId/quotes/:quoteId/respond",
    requireCustomer,
    async (req, res) => {
        const projectId = validId(req.params.projectId);
        const quoteId = validId(req.params.quoteId);

        if (!projectId || !quoteId) {
            return res.status(400).json({
                message: "Invalid project or quotation ID."
            });
        }

        const {
            action,
            message = "",
            counter_amount
        } = req.body || {};

        if (!["ACCEPT", "REJECT", "NEGOTIATE"].includes(action)) {
            return res.status(400).json({
                message: "Invalid quotation response."
            });
        }

        if (
            typeof message !== "string" ||
            message.length > 2000
        ) {
            return res.status(400).json({
                message: "Message must be 2000 characters or fewer."
            });
        }

        const customerMessage = message.trim();

        if (
            action === "REJECT" &&
            customerMessage.length < 5
        ) {
            return res.status(400).json({
                message: "Please provide a rejection reason of at least 5 characters."
            });
        }

        let counterAmount = null;

        if (action === "NEGOTIATE") {
            const amountString = String(
                counter_amount ?? ""
            ).trim();

            counterAmount = Number(amountString);

            if (
                !/^\d+(?:\.\d{1,2})?$/.test(amountString) ||
                !Number.isFinite(counterAmount) ||
                counterAmount <= 0 ||
                counterAmount > 9999999999.99
            ) {
                return res.status(400).json({
                    message: "Enter a valid counteroffer amount with up to two decimal places."
                });
            }

            if (customerMessage.length < 5) {
                return res.status(400).json({
                    message: "Please explain your counteroffer."
                });
            }
        }

        let connection;
        let inTransaction = false;

        try {
            connection = await pool.getConnection();
            await connection.beginTransaction();
            inTransaction = true;

            // Verify ownership and lock the project.
            const [projects] = await connection.execute(
                `SELECT
                    project_id,
                    client_id,
                    status,
                    service_address,
                    preferred_start,
                    preferred_end
                 FROM project_requests
                 WHERE project_id = ?
                   AND client_id = ?
                 FOR UPDATE`,
                [projectId, req.session.clientId]
            );

            if (projects.length === 0) {
                await connection.rollback();
                inTransaction = false;

                return res.status(404).json({
                    message: "Project not found."
                });
            }

            const project = projects[0];

            if (
                !["SUBMITTED", "QUOTED", "NEGOTIATING"]
                    .includes(project.status)
            ) {
                await connection.rollback();
                inTransaction = false;

                return res.status(409).json({
                    message: "This project cannot accept quotation responses."
                });
            }

            // Lock the requested quotation.
            const [quotes] = await connection.execute(
                `SELECT
                    quote_id,
                    project_id,
                    version_no,
                    status,
                    total_price,
                    proposed_start,
                    proposed_end
                 FROM quotes
                 WHERE quote_id = ?
                   AND project_id = ?
                 FOR UPDATE`,
                [quoteId, projectId]
            );

            if (quotes.length === 0) {
                await connection.rollback();
                inTransaction = false;

                return res.status(404).json({
                    message: "Quotation not found."
                });
            }

            const quote = quotes[0];

            if (quote.status !== "PROPOSED") {
                await connection.rollback();
                inTransaction = false;

                return res.status(409).json({
                    message: "This quotation has already been responded to or replaced."
                });
            }

            // Prevent responses to older versions.
            const [versions] = await connection.execute(
                `SELECT MAX(version_no) AS latest_version
                 FROM quotes
                 WHERE project_id = ?`,
                [projectId]
            );

            if (
                Number(quote.version_no) !==
                Number(versions[0].latest_version)
            ) {
                await connection.rollback();
                inTransaction = false;

                return res.status(409).json({
                    message: "Please respond to the latest quotation."
                });
            }

            let newQuoteStatus;
            let eventType;
            let eventMessage;
            let installationOrderId = null;

            // ACCEPT
            if (action === "ACCEPT") {
                newQuoteStatus = "ACCEPTED";
                eventType = "ACCEPTANCE";

                eventMessage = customerMessage ||
                    "Customer accepted the quotation.";

                await connection.execute(
                    `UPDATE quotes
                     SET status = 'ACCEPTED',
                         accepted_at = NOW()
                     WHERE quote_id = ?`,
                    [quoteId]
                );

                await connection.execute(
                    `UPDATE project_requests
                     SET status = 'ACCEPTED'
                     WHERE project_id = ?`,
                    [projectId]
                );

                const [orderResult] = await connection.execute(
                    `INSERT INTO installation_orders (
                        project_id,
                        accepted_quote_id,
                        service_address,
                        agreed_price,
                        scheduled_start,
                        scheduled_end,
                        status
                    )
                    VALUES (?, ?, ?, ?, ?, ?, 'SCHEDULED')`,
                    [
                        projectId,
                        quoteId,
                        project.service_address,
                        quote.total_price,
                        quote.proposed_start || project.preferred_start,
                        quote.proposed_end || project.preferred_end
                    ]
                );

                installationOrderId = orderResult.insertId;
            }

            // REJECT
            else if (action === "REJECT") {
                newQuoteStatus = "REJECTED";
                eventType = "REJECTION";
                eventMessage = customerMessage;

                await connection.execute(
                    `UPDATE quotes
                     SET status = 'REJECTED'
                     WHERE quote_id = ?`,
                    [quoteId]
                );

                // Project remains open for staff to send another quote.
            }

            // NEGOTIATE
            else {
                newQuoteStatus = "COUNTERED";
                eventType = "COUNTEROFFER";

                eventMessage =
                    `Customer counteroffer: $${counterAmount.toFixed(2)}. ` +
                    `Message: ${customerMessage}`;

                await connection.execute(
                    `UPDATE quotes
                     SET status = 'COUNTERED'
                     WHERE quote_id = ?`,
                    [quoteId]
                );

                await connection.execute(
                    `UPDATE project_requests
                     SET status = 'NEGOTIATING'
                     WHERE project_id = ?`,
                    [projectId]
                );
            }

            // Save negotiation history.
            await connection.execute(
                `INSERT INTO negotiation_events (
                    project_id,
                    quote_id,
                    sender_role,
                    event_type,
                    message
                )
                VALUES (?, ?, 'CLIENT', ?, ?)`,
                [
                    projectId,
                    quoteId,
                    eventType,
                    eventMessage
                ]
            );

            await connection.commit();
            inTransaction = false;

            return res.json({
                message:
                    action === "ACCEPT"
                        ? "Quotation accepted. Installation order created."
                        : action === "REJECT"
                            ? "Quotation rejected successfully."
                            : "Counteroffer submitted successfully.",
                project_id: projectId,
                quote_id: quoteId,
                quote_status: newQuoteStatus,
                installation_order_id: installationOrderId
            });

        } catch (error) {
            if (connection && inTransaction) {
                try {
                    await connection.rollback();
                } catch (rollbackError) {
                    console.error(
                        "Quotation rollback error:",
                        rollbackError
                    );
                }
            }

            console.error("Quotation response error:", error);

            return res.status(500).json({
                message: "Unable to process quotation response."
            });

        } finally {
            if (connection) {
                connection.release();
            }
        }
    }
);

// --------------------------------------------------
// NEW: STAFF NEGOTIATION HISTORY
// GET /api/staff/projects/:projectId/negotiations
// --------------------------------------------------

router.get(
    "/staff/projects/:projectId/negotiations",
    requireStaff,
    async (req, res) => {
        const projectId = validId(req.params.projectId);

        if (!projectId) {
            return res.status(400).json({
                message: "Invalid project ID."
            });
        }

        try {
            const [projects] = await pool.execute(
                `SELECT project_id
                 FROM project_requests
                 WHERE project_id = ?`,
                [projectId]
            );

            if (projects.length === 0) {
                return res.status(404).json({
                    message: "Project not found."
                });
            }

            const [events] = await pool.execute(
                `SELECT
                    event_id,
                    project_id,
                    quote_id,
                    sender_role,
                    event_type,
                    message,
                    created_at
                 FROM negotiation_events
                 WHERE project_id = ?
                 ORDER BY created_at ASC, event_id ASC`,
                [projectId]
            );

            return res.json(events);

        } catch (error) {
            console.error(
                "Staff negotiation history error:",
                error
            );

            return res.status(500).json({
                message: "Unable to load negotiation history."
            });
        }
    }
);

module.exports = router;
