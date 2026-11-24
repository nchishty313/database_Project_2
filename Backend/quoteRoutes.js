
const express = require("express");
const pool = require("./db");

const router = express.Router();

// -------------------------------------------
// STAFF AUTHENTICATION
// -------------------------------------------

function requireStaff(req, res, next) {
    if (!req.session || !req.session.staffId) {
        return res.status(401).json({
            message: "Staff login required."
        });
    }

    next();
}

// -------------------------------------------
// HELPERS
// -------------------------------------------

const allowedChargeTypes = new Set([
    "MATERIAL",
    "REMOVAL",
    "LABOR",
    "UNDERLAYMENT",
    "TRIM",
    "STAIRS",
    "DELIVERY",
    "OTHER"
]);

function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatDate(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }

    if (typeof value !== "string") {
        throw new Error("Invalid proposed date.");
    }

    const formatted = value.replace("T", " ");

    if (!/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/.test(formatted)) {
        throw new Error("Dates must use YYYY-MM-DD or YYYY-MM-DD HH:MM format.");
    }

    if (formatted.length === 10) {
        return formatted + " 00:00:00";
    }

    if (formatted.length === 16) {
        return formatted + ":00";
    }

    return formatted;
}

// -------------------------------------------
// CREATE QUOTATION
// POST /api/staff/projects/:projectId/quotes
// -------------------------------------------

router.post(
    "/staff/projects/:projectId/quotes",
    requireStaff,
    async (req, res) => {

        const projectId = Number(req.params.projectId);

        if (!Number.isSafeInteger(projectId) || projectId <= 0) {
            return res.status(400).json({
                message: "Invalid project ID."
            });
        }

        const {
            lines,
            waste_percent = 0,
            proposed_start = null,
            proposed_end = null,
            note = null
        } = req.body || {};

        if (!Array.isArray(lines) || lines.length === 0 || lines.length > 100) {
            return res.status(400).json({
                message: "Provide between 1 and 100 quotation lines."
            });
        }

        const wastePercent = Number(waste_percent);

        if (
            !Number.isFinite(wastePercent) ||
            wastePercent < 0 ||
            wastePercent > 100
        ) {
            return res.status(400).json({
                message: "Waste percentage must be between 0 and 100."
            });
        }

        let proposedStart;
        let proposedEnd;

        try {
            proposedStart = formatDate(proposed_start);
            proposedEnd = formatDate(proposed_end);
        } catch (error) {
            return res.status(400).json({
                message: error.message
            });
        }

        if (
            proposedStart &&
            proposedEnd &&
            proposedEnd < proposedStart
        ) {
            return res.status(400).json({
                message: "Proposed end date cannot be before start date."
            });
        }

        const preparedLines = [];

        let materialCost = 0;
        let laborCost = 0;
        let otherCharges = 0;

        for (const line of lines) {

            if (!line || !allowedChargeTypes.has(line.charge_type)) {
                return res.status(400).json({
                    message: "Invalid quotation charge type."
                });
            }

            const quantity = Number(line.quantity);
            const unitPrice = Number(line.unit_price);

            if (
                !Number.isFinite(quantity) ||
                quantity <= 0 ||
                !Number.isFinite(unitPrice) ||
                unitPrice < 0
            ) {
                return res.status(400).json({
                    message: "Quantity must be positive and unit price cannot be negative."
                });
            }

            const roomId = line.room_id == null
                ? null
                : Number(line.room_id);

            const productId = line.product_id == null
                ? null
                : Number(line.product_id);

            if (
                (roomId !== null &&
                    (!Number.isSafeInteger(roomId) || roomId <= 0)) ||
                (productId !== null &&
                    (!Number.isSafeInteger(productId) || productId <= 0))
            ) {
                return res.status(400).json({
                    message: "Invalid room or product ID."
                });
            }

            const lineAmount = roundMoney(quantity * unitPrice);

            if (
                !Number.isFinite(lineAmount) ||
                lineAmount > 9999999999.99
            ) {
                return res.status(400).json({
                    message: "Quotation line amount is too large."
                });
            }

            preparedLines.push({
                room_id: roomId,
                product_id: productId,
                charge_type: line.charge_type,
                description: line.description == null
                    ? null
                    : String(line.description).slice(0, 255),
                quantity,
                unit: line.unit == null
                    ? null
                    : String(line.unit).slice(0, 30),
                unit_price: unitPrice,
                line_amount: lineAmount
            });

            if (line.charge_type === "MATERIAL") {
                materialCost += lineAmount;
            } else if (line.charge_type === "LABOR") {
                laborCost += lineAmount;
            } else {
                otherCharges += lineAmount;
            }
        }

        materialCost = roundMoney(materialCost);
        laborCost = roundMoney(laborCost);
        otherCharges = roundMoney(otherCharges);

        const totalPrice = roundMoney(
            materialCost + laborCost + otherCharges
        );

        if (!Number.isFinite(totalPrice) || totalPrice > 9999999999.99) {
            return res.status(400).json({
                message: "Quotation total is too large."
            });
        }

        let connection;

        try {
            connection = await pool.getConnection();

            await connection.beginTransaction();

            // Lock the project while preparing its quotation.
            const [projects] = await connection.execute(
                `SELECT project_id, status
                 FROM project_requests
                 WHERE project_id = ?
                 FOR UPDATE`,
                [projectId]
            );

            if (projects.length === 0) {
                await connection.rollback();

                return res.status(404).json({
                    message: "Project not found."
                });
            }

            if (!["SUBMITTED", "QUOTED", "NEGOTIATING"].includes(projects[0].status)) {
                await connection.rollback();

                return res.status(400).json({
                    message: "Only submitted projects can receive a quotation."
                });
            }

            // Do not create a replacement for an accepted quotation.
            const [acceptedQuotes] = await connection.execute(
                `SELECT quote_id
                 FROM quotes
                 WHERE project_id = ?
                   AND status = 'ACCEPTED'
                 LIMIT 1`,
                [projectId]
            );

            if (acceptedQuotes.length > 0) {
                await connection.rollback();

                return res.status(409).json({
                    message: "This project already has an accepted quotation."
                });
            }

            // Verify that room IDs belong to this project.
            for (const line of preparedLines) {
                if (line.room_id !== null) {
                    const [rooms] = await connection.execute(
                        `SELECT room_id
                         FROM project_rooms
                         WHERE room_id = ?
                           AND project_id = ?`,
                        [line.room_id, projectId]
                    );

                    if (rooms.length === 0) {
                        await connection.rollback();

                        return res.status(400).json({
                            message: `Room ${line.room_id} does not belong to this project.`
                        });
                    }
                }
            }

            // Find the next quotation version.
            const [versions] = await connection.execute(
                `SELECT COALESCE(MAX(version_no), 0) AS latest_version
                 FROM quotes
                 WHERE project_id = ?`,
                [projectId]
            );

            const versionNo = Number(
                versions[0].latest_version
            ) + 1;

            // Older active quotations become superseded.
            await connection.execute(
                `UPDATE quotes
                 SET status = 'SUPERSEDED'
                 WHERE project_id = ?
                   AND status IN ('PROPOSED', 'COUNTERED')`,
                [projectId]
            );

            // Insert quotation header.
            const [quoteResult] = await connection.execute(
                `INSERT INTO quotes (
                    project_id,
                    prepared_by,
                    version_no,
                    waste_percent,
                    estimated_material_cost,
                    estimated_labor_cost,
                    other_net_charges,
                    total_price,
                    proposed_start,
                    proposed_end,
                    status,
                    note
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PROPOSED', ?)`,
                [
                    projectId,
                    req.session.staffId,
                    versionNo,
                    wastePercent,
                    materialCost,
                    laborCost,
                    otherCharges,
                    totalPrice,
                    proposedStart,
                    proposedEnd,
                    note == null ? null : String(note)
                ]
            );

            const quoteId = quoteResult.insertId;

            // Insert all quotation line items.
            for (const line of preparedLines) {
                await connection.execute(
                    `INSERT INTO quote_lines (
                        quote_id,
                        project_id,
                        room_id,
                        product_id,
                        charge_type,
                        description,
                        quantity,
                        unit,
                        unit_price,
                        line_amount
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        quoteId,
                        projectId,
                        line.room_id,
                        line.product_id,
                        line.charge_type,
                        line.description,
                        line.quantity,
                        line.unit,
                        line.unit_price,
                        line.line_amount
                    ]
                );
            }

            await connection.commit();

            return res.status(201).json({
                message: "Quotation created successfully.",
                quote_id: quoteId,
                project_id: projectId,
                version_no: versionNo,
                status: "PROPOSED",
                estimated_material_cost: materialCost,
                estimated_labor_cost: laborCost,
                other_net_charges: otherCharges,
                total_price: totalPrice,
                number_of_lines: preparedLines.length
            });

        } catch (error) {
            if (connection) {
                await connection.rollback();
            }

            console.error("Quotation creation error:", error);

            return res.status(500).json({
                message: "Unable to create quotation."
            });

        } finally {
            if (connection) {
                connection.release();
            }
        }
    }
);

// -------------------------------------------
// VIEW STAFF QUOTATIONS FOR A PROJECT
// GET /api/staff/projects/:projectId/quotes
// -------------------------------------------

router.get(
    "/staff/projects/:projectId/quotes",
    requireStaff,
    async (req, res) => {

        const projectId = Number(req.params.projectId);

        if (!Number.isSafeInteger(projectId) || projectId <= 0) {
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

            const [quotes] = await pool.execute(
                `SELECT
                    quote_id,
                    project_id,
                    prepared_by,
                    version_no,
                    quoted_at,
                    accepted_at,
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
                        room_id,
                        product_id,
                        charge_type,
                        description,
                        quantity,
                        unit,
                        unit_price,
                        line_amount
                     FROM quote_lines
                     WHERE quote_id = ?
                     ORDER BY quote_line_id`,
                    [quote.quote_id]
                );

                quote.lines = lines;
            }

            res.json(quotes);

        } catch (error) {
            console.error("Quotation retrieval error:", error);

            res.status(500).json({
                message: "Unable to load quotations."
            });
        }
    }
);

module.exports = router;
