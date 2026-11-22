const express = require("express");
const pool = require("./db");
const fs = require("fs");
const path = require("path");

const router = express.Router();

// Only logged-in staff can access these endpoints.
function requireStaff(req, res, next) {
    if (!req.session || !req.session.staffId) {
        return res.status(401).json({
            message: "Staff login required."
        });
    }
    next();
}

router.use("/admin", requireStaff);

// GET ALL CUSTOMER PROJECT REQUESTS
router.get("/admin/projects", async (req, res) => {
    try {
        const [projects] = await pool.execute(`
            SELECT
                p.project_id,
                p.client_id,
                p.service_address,
                p.preferred_start,
                p.preferred_end,
                p.proposed_budget,
                p.total_area_sqft,
                p.notes,
                p.status,
                p.rejection_reason,
                p.submitted_at,
                c.first_name,
                c.last_name,
                c.email,
                c.phone
            FROM project_requests p
            JOIN clients c ON c.client_id = p.client_id
            ORDER BY p.project_id DESC
        `);

        if (projects.length === 0) {
            return res.json([]);
        }

        const [rooms] = await pool.execute(`
            SELECT
                r.room_id,
                r.project_id,
                r.room_name,
                r.length_ft,
                r.width_ft,
                r.area_sqft,
                r.existing_floor_type,
                r.removal_required,
                r.installation_pattern,
                r.product_id,
                f.product_name,
                f.category,
                f.unit_price,
                f.pricing_unit
            FROM project_rooms r
            JOIN flooring_products f
                ON f.product_id = r.product_id
            ORDER BY r.room_id
        `);

        const [photos] = await pool.execute(`
            SELECT photo_id, project_id, uploaded_at
            FROM project_photos
            ORDER BY photo_id
        `);

        const roomsByProject = new Map();
        const photosByProject = new Map();

        for (const room of rooms) {
            if (!roomsByProject.has(room.project_id)) {
                roomsByProject.set(room.project_id, []);
            }
            roomsByProject.get(room.project_id).push(room);
        }

        for (const photo of photos) {
            if (!photosByProject.has(photo.project_id)) {
                photosByProject.set(photo.project_id, []);
            }
            photosByProject.get(photo.project_id).push({
                photo_id: photo.photo_id,
                uploaded_at: photo.uploaded_at,
                url: `/api/admin/photos/${photo.photo_id}`
            });
        }

        const result = projects.map(project => ({
            ...project,
            rooms: roomsByProject.get(project.project_id) || [],
            photos: photosByProject.get(project.project_id) || []
        }));

        res.json(result);

    } catch (error) {
        console.error("Staff projects error:", error);
        res.status(500).json({
            message: "Unable to retrieve project requests."
        });
    }
});

// VIEW A PROJECT PHOTO — STAFF ONLY
router.get("/admin/photos/:photoId", async (req, res) => {
    try {
        const photoId = Number(req.params.photoId);

        if (!Number.isSafeInteger(photoId) || photoId <= 0) {
            return res.status(400).json({
                message: "Invalid photo ID."
            });
        }

        const [rows] = await pool.execute(
            `SELECT storage_path
             FROM project_photos
             WHERE photo_id = ?`,
            [photoId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                message: "Photo not found."
            });
        }

        const storedPath = rows[0].storage_path.replace(/\\/g, "/");
        const filename = path.posix.basename(storedPath);

        if (
            !storedPath.startsWith("uploads/") ||
            !filename ||
            filename === "." ||
            filename === ".."
        ) {
            return res.status(400).json({
                message: "Invalid stored photo path."
            });
        }

        const filePath = path.join(__dirname, "uploads", filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                message: "Photo file not found on this server."
            });
        }

        const extension = path.extname(filename).toLowerCase();

        const mimeTypes = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp"
        };

        if (!mimeTypes[extension]) {
            return res.status(415).json({
                message: "Unsupported photo format."
            });
        }

        res.setHeader("Content-Type", mimeTypes[extension]);
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cache-Control", "private, no-store");

        res.sendFile(filePath);

    } catch (error) {
        console.error("Photo access error:", error);
        res.status(500).json({
            message: "Unable to retrieve photo."
        });
    }
});

// REJECT A SUBMITTED PROJECT WITH AN EXPLANATION
router.post("/admin/projects/:projectId/reject", async (req, res) => {
    try {
        const projectId = Number(req.params.projectId);
        const reason = req.body?.reason;

        if (!Number.isSafeInteger(projectId) || projectId <= 0) {
            return res.status(400).json({
                message: "Invalid project ID."
            });
        }

        if (
            typeof reason !== "string" ||
            reason.trim().length < 5 ||
            reason.trim().length > 2000
        ) {
            return res.status(400).json({
                message: "Please provide a rejection reason (5–2000 characters)."
            });
        }

        const [result] = await pool.execute(
            `UPDATE project_requests
             SET status = 'REJECTED',
                 rejection_reason = ?
             WHERE project_id = ?
               AND status = 'SUBMITTED'`,
            [reason.trim(), projectId]
        );

        if (result.affectedRows === 0) {
            return res.status(409).json({
                message: "Project not found or no longer awaiting review."
            });
        }

        res.json({
            message: "Project rejected successfully.",
            project_id: projectId,
            status: "REJECTED"
        });

    } catch (error) {
        console.error("Reject project error:", error);
        res.status(500).json({
            message: "Unable to reject project."
        });
    }
});

module.exports = router;


