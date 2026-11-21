
const express = require("express");
const pool = require("./db");

const router = express.Router();

// Check whether customer is logged in
function requireClient(req, res, next) {
    if (!req.session.clientId) {
        return res.status(401).json({
            message: "Please log in to continue."
        });
    }

    next();
}


// SUBMIT PROJECT REQUEST
router.post("/projects", requireClient, async (req, res) => {
    const connection = await pool.getConnection();

    try {
        const {
            service_address,
            preferred_start,
            preferred_end,
            proposed_budget,
            notes,
            rooms
        } = req.body;

        if (!service_address || !service_address.trim()) {
            return res.status(400).json({
                message: "Service address is required."
            });
        }

        if (!Array.isArray(rooms) || rooms.length === 0) {
            return res.status(400).json({
                message: "At least one room is required."
            });
        }

        if (preferred_start && preferred_end &&
            preferred_end < preferred_start) {
            return res.status(400).json({
                message: "End date cannot be before start date."
            });
        }

        if (
            proposed_budget !== undefined &&
            proposed_budget !== null &&
            (!Number.isFinite(Number(proposed_budget)) ||
             Number(proposed_budget) < 0)
        ) {
            return res.status(400).json({
                message: "Invalid project budget."
            });
        }

        // Calculate room areas on the server
        const preparedRooms = [];

        for (const room of rooms) {
            const productId = Number(room.product_id);
            const length = room.length_ft == null
                ? null : Number(room.length_ft);
            const width = room.width_ft == null
                ? null : Number(room.width_ft);

            let area;

            if (!Number.isInteger(productId) || productId <= 0) {
                return res.status(400).json({
                    message: "Every room needs a valid flooring product."
                });
            }

            if (length !== null || width !== null) {
                if (
                    !Number.isFinite(length) ||
                    !Number.isFinite(width) ||
                    length <= 0 ||
                    width <= 0
                ) {
                    return res.status(400).json({
                        message: "Enter valid length and width for each room."
                    });
                }

                area = length * width;
            } else {
                area = Number(room.area_sqft);
            }

            if (!Number.isFinite(area) || area <= 0) {
                return res.status(400).json({
                    message: "Every room must have a positive area."
                });
            }

            if (!room.room_name || !room.room_name.trim()) {
                return res.status(400).json({
                    message: "Every room needs a name."
                });
            }

            preparedRooms.push({
                productId,
                roomName: room.room_name.trim(),
                length,
                width,
                area,
                existingFloorType: room.existing_floor_type || null,
                removalRequired: Boolean(room.removal_required),
                installationPattern: room.installation_pattern || null
            });
        }

        // Verify all selected products exist and are active
        const productIds = [
            ...new Set(preparedRooms.map(room => room.productId))
        ];

        const [products] = await connection.query(
            `SELECT product_id
             FROM flooring_products
             WHERE active = TRUE
             AND product_id IN (?)`,
            [productIds]
        );

        if (products.length !== productIds.length) {
            return res.status(400).json({
                message: "One or more selected products are unavailable."
            });
        }

        const totalArea = preparedRooms.reduce(
            (sum, room) => sum + room.area,
            0
        );

        await connection.beginTransaction();

        // Insert main project
        const [projectResult] = await connection.execute(
            `INSERT INTO project_requests
            (
                client_id,
                service_address,
                preferred_start,
                preferred_end,
                proposed_budget,
                total_area_sqft,
                notes,
                status,
                submitted_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', NOW())`,
            [
                req.session.clientId,
                service_address.trim(),
                preferred_start || null,
                preferred_end || null,
                proposed_budget ?? null,
                totalArea,
                notes || null
            ]
        );

        const projectId = projectResult.insertId;

        // Insert each room
        for (const room of preparedRooms) {
            await connection.execute(
                `INSERT INTO project_rooms
                (
                    project_id,
                    product_id,
                    room_name,
                    length_ft,
                    width_ft,
                    area_sqft,
                    existing_floor_type,
                    removal_required,
                    installation_pattern
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    projectId,
                    room.productId,
                    room.roomName,
                    room.length,
                    room.width,
                    room.area,
                    room.existingFloorType,
                    room.removalRequired,
                    room.installationPattern
                ]
            );
        }

        await connection.commit();

        res.status(201).json({
            message: "Project request submitted successfully.",
            project_id: projectId,
            total_area_sqft: totalArea,
            number_of_rooms: preparedRooms.length
        });

    } catch (error) {
        await connection.rollback();

        console.error("Project submission error:", error);

        res.status(500).json({
            message: "Unable to submit project request."
        });

    } finally {
        connection.release();
    }
});


// CUSTOMER VIEWS THEIR OWN PROJECTS
router.get("/projects/mine", requireClient, async (req, res) => {
    try {
        const [projects] = await pool.execute(
            `SELECT *
             FROM project_requests
             WHERE client_id = ?
             ORDER BY project_id DESC`,
            [req.session.clientId]
        );

        if (projects.length === 0) {
            return res.json([]);
        }

        const projectIds = projects.map(p => p.project_id);

        const [rooms] = await pool.query(
            `SELECT pr.*, fp.product_name
             FROM project_rooms pr
             JOIN flooring_products fp
               ON pr.product_id = fp.product_id
             WHERE pr.project_id IN (?)`,
            [projectIds]
        );

        const result = projects.map(project => ({
            ...project,
            rooms: rooms.filter(
                room => room.project_id === project.project_id
            )
        }));

        res.json(result);

    } catch (error) {
        console.error("Project retrieval error:", error);

        res.status(500).json({
            message: "Unable to retrieve projects."
        });
    }
});

module.exports = router;
