const express = require("express");
const pool = require("./db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const router = express.Router();

// PHOTO UPLOAD CONFIGURATION

const uploadDirectory = path.join(__dirname, "uploads");
fs.mkdirSync(uploadDirectory, { recursive: true });

const allowedPhotoTypes = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp"
};

const storage = multer.diskStorage({
    destination: function(req, file, callback) {
        callback(null, uploadDirectory);
    },

    filename: function(req, file, callback) {
        const extension = allowedPhotoTypes[file.mimetype];
        const filename = `${Date.now()}-${crypto.randomUUID()}${extension}`;
        callback(null, filename);
    }
});

const photoUpload = multer({
    storage,

    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 5
    },

    fileFilter: function(req, file, callback) {
        if (!allowedPhotoTypes[file.mimetype]) {
            return callback(
                new Error("Only JPG, PNG and WEBP photos are allowed.")
            );
        }

        callback(null, true);
    }
});

// CUSTOMER AUTHENTICATION

function requireClient(req, res, next) {
    if (!req.session.clientId) {
        return res.status(401).json({
            message: "Please log in to continue."
        });
    }

    next();
}

// VERIFY PROJECT OWNERSHIP

async function requireProjectOwner(req, res, next) {
    try {
        const projectId = Number(req.params.projectId);

        if (!Number.isInteger(projectId) || projectId <= 0) {
            return res.status(400).json({
                message: "Invalid project ID."
            });
        }

        const [rows] = await pool.execute(
            `SELECT project_id
             FROM project_requests
             WHERE project_id = ?
               AND client_id = ?`,
            [projectId, req.session.clientId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                message: "Project not found."
            });
        }

        req.projectId = projectId;
        next();

    } catch (error) {
        console.error("Project ownership error:", error);

        res.status(500).json({
            message: "Unable to verify project ownership."
        });
    }
}

// HANDLE PHOTO UPLOAD ERRORS

function handlePhotoUpload(req, res, next) {
    photoUpload.array("photos", 5)(req, res, async function(error) {
        if (!error) {
            return next();
        }

        await Promise.all(
            (req.files || []).map(file =>
                fs.promises.unlink(file.path).catch(() => {})
            )
        );

        let errorMessage = error.message;

        if (error instanceof multer.MulterError) {
            if (error.code === "LIMIT_FILE_SIZE") {
                errorMessage = "Each photo must be 5 MB or smaller.";
            }

            if (
                error.code === "LIMIT_FILE_COUNT" ||
                error.code === "LIMIT_UNEXPECTED_FILE"
            ) {
                errorMessage = "Maximum 5 photos allowed per project.";
            }
        }

        return res.status(400).json({
            message: errorMessage
        });
    });
}

// SUBMIT CUSTOMER PROJECT

router.post("/projects", requireClient, async (req, res) => {
    let connection;
    let transactionStarted = false;

    try {
        const {
            service_address,
            preferred_start,
            preferred_end,
            proposed_budget,
            notes,
            rooms
        } = req.body;

        if (
            typeof service_address !== "string" ||
            !service_address.trim()
        ) {
            return res.status(400).json({
                message: "Service address is required."
            });
        }

        if (!Array.isArray(rooms) || rooms.length === 0) {
            return res.status(400).json({
                message: "At least one room is required."
            });
        }

        if (
            preferred_start &&
            preferred_end &&
            preferred_end < preferred_start
        ) {
            return res.status(400).json({
                message: "End date cannot be before start date."
            });
        }

        if (
            proposed_budget !== undefined &&
            proposed_budget !== null &&
            proposed_budget !== "" &&
            (!Number.isFinite(Number(proposed_budget)) ||
                Number(proposed_budget) < 0)
        ) {
            return res.status(400).json({
                message: "Invalid project budget."
            });
        }

        // VALIDATE ROOMS AND CALCULATE AREA

        const preparedRooms = [];

        for (const room of rooms) {
            const productId = Number(room.product_id);

            const length = room.length_ft == null || room.length_ft === ""
                ? null
                : Number(room.length_ft);

            const width = room.width_ft == null || room.width_ft === ""
                ? null
                : Number(room.width_ft);

            let area;

            if (!Number.isInteger(productId) || productId <= 0) {
                return res.status(400).json({
                    message: "Every room needs a valid flooring product."
                });
            }

            if (length !== null || width !== null) {
                if (
                    length === null ||
                    width === null ||
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

            if (
                typeof room.room_name !== "string" ||
                !room.room_name.trim()
            ) {
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
                removalRequired: room.removal_required === true,
                installationPattern: room.installation_pattern || null
            });
        }

        // VERIFY PRODUCTS

        const productIds = [
            ...new Set(preparedRooms.map(room => room.productId))
        ];

        connection = await pool.getConnection();

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
        transactionStarted = true;

        // INSERT MAIN PROJECT

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
                proposed_budget === "" ? null : (proposed_budget ?? null),
                totalArea,
                notes || null
            ]
        );

        const projectId = projectResult.insertId;

        // INSERT PROJECT ROOMS

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
        transactionStarted = false;

        res.status(201).json({
            message: "Project request submitted successfully.",
            project_id: projectId,
            total_area_sqft: totalArea,
            number_of_rooms: preparedRooms.length
        });

    } catch (error) {
        if (connection && transactionStarted) {
            await connection.rollback();
        }

        console.error("Project submission error:", error);

        res.status(500).json({
            message: "Unable to submit project request."
        });

    } finally {
        if (connection) {
            connection.release();
        }
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

        const projectIds = projects.map(project => project.project_id);

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

// CUSTOMER UPLOADS PROJECT PHOTOS

router.post(
    "/projects/:projectId/photos",
    requireClient,
    requireProjectOwner,
    handlePhotoUpload,
    async (req, res) => {

        let connection;
        let transactionStarted = false;

        try {
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({
                    message: "Please select at least one photo."
                });
            }

            connection = await pool.getConnection();

            await connection.beginTransaction();
            transactionStarted = true;

            // LOCK PROJECT TO CHECK PHOTO LIMIT SAFELY

            const [projectRows] = await connection.execute(
                `SELECT project_id
                 FROM project_requests
                 WHERE project_id = ?
                   AND client_id = ?
                 FOR UPDATE`,
                [req.projectId, req.session.clientId]
            );

            if (projectRows.length === 0) {
                await connection.rollback();
                transactionStarted = false;

                await Promise.all(
                    req.files.map(file =>
                        fs.promises.unlink(file.path).catch(() => {})
                    )
                );

                return res.status(404).json({
                    message: "Project not found."
                });
            }

            // COUNT EXISTING PHOTOS

            const [countRows] = await connection.execute(
                `SELECT COUNT(*) AS photo_count
                 FROM project_photos
                 WHERE project_id = ?`,
                [req.projectId]
            );

            const existingCount = Number(countRows[0].photo_count);

            if (existingCount + req.files.length > 5) {
                await connection.rollback();
                transactionStarted = false;

                await Promise.all(
                    req.files.map(file =>
                        fs.promises.unlink(file.path).catch(() => {})
                    )
                );

                return res.status(400).json({
                    message: `This project already has ${existingCount} photo(s). A maximum of 5 photos is allowed per project.`
                });
            }

            // SAVE PHOTO PATHS IN DATABASE

            for (const file of req.files) {
                const storagePath = `uploads/${file.filename}`;

                await connection.execute(
                    `INSERT INTO project_photos
                    (project_id, storage_path)
                    VALUES (?, ?)`,
                    [req.projectId, storagePath]
                );
            }

            await connection.commit();
            transactionStarted = false;

            res.status(201).json({
                message: "Photos uploaded successfully.",
                project_id: req.projectId,
                photos_uploaded: req.files.length,
                total_photos: existingCount + req.files.length
            });

        } catch (error) {
            if (connection && transactionStarted) {
                await connection.rollback();
            }

            await Promise.all(
                (req.files || []).map(file =>
                    fs.promises.unlink(file.path).catch(() => {})
                )
            );

            console.error("Photo upload error:", error);

            res.status(500).json({
                message: "Unable to save project photos."
            });

        } finally {
            if (connection) {
                connection.release();
            }
        }
    }
);

module.exports = router;