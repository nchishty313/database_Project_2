
const API = "http://localhost:5050/api";

const productForm = document.getElementById("productForm");
const productTable = document.getElementById("productTable");
const message = document.getElementById("message");

const projectsContainer =
    document.getElementById("projectsContainer");

const projectsMessage =
    document.getElementById("projectsMessage");

// Keep track of temporary photo URLs so they can be cleaned up.
let projectPhotoUrls = [];

// GENERAL HELPERS
function showMessage(element, text, isError = false) {
    element.textContent = text;
    element.style.color = isError ? "#b33434" : "#16713c";
}

function createTextElement(tag, text) {
    const element = document.createElement(tag);
    element.textContent = text ?? "";
    return element;
}

function addProjectDetail(container, label, value) {
    const paragraph = document.createElement("p");
    const strong = document.createElement("strong");

    strong.textContent = label + ": ";
    paragraph.appendChild(strong);
    paragraph.appendChild(
        document.createTextNode(
            value === null ||
            value === undefined ||
            value === ""
                ? "Not provided"
                : String(value)
        )
    );

    container.appendChild(paragraph);
}

function formatDate(value) {
    if (!value) return "Not provided";

    const text = String(value);

    // Date-only values should not shift because of timezone.
    const match = text.match(/^\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];

    return text;
}

function formatMoney(value) {
    if (value === null ||
        value === undefined ||
        value === "") {
        return "Not provided";
    }

    const amount = Number(value);

    if (!Number.isFinite(amount)) {
        return "Not provided";
    }

    return "$" + amount.toFixed(2);
}

// CHECK STAFF LOGIN SESSION
async function checkStaffSession() {
    try {
        const response = await fetch(`${API}/staff/me`, {
            credentials: "include"
        });

        if (!response.ok) {
            window.location.href = "staffLogin.html";
            return false;
        }

        return true;

    } catch (error) {
        showMessage(
            message,
            "Cannot connect to server.",
            true
        );
        return false;
    }
}

// LOAD ALL PRODUCTS
async function loadProducts() {
    try {
        const response = await fetch(
            `${API}/admin/products`,
            { credentials: "include" }
        );

        if (response.status === 401) {
            window.location.href = "staffLogin.html";
            return;
        }

        if (!response.ok) {
            throw new Error("Unable to load products.");
        }

        const products = await response.json();

        productTable.replaceChildren();

        products.forEach(product => {
            const row = document.createElement("tr");

            function addCell(value) {
                const cell = document.createElement("td");
                cell.textContent = value ?? "";
                row.appendChild(cell);
            }

            addCell(product.product_id);
            addCell(product.product_name);
            addCell(product.category);
            addCell(
                "$" + product.unit_price +
                " / " + product.pricing_unit
            );
            addCell(
                Number(product.active) === 1
                    ? "Active"
                    : "Inactive"
            );

            const actionCell = document.createElement("td");
            const button = document.createElement("button");

            button.className = "status-button";

            const currentlyActive =
                Number(product.active) === 1;

            button.textContent = currentlyActive
                ? "Deactivate"
                : "Activate";

            button.addEventListener("click", () => {
                updateProductStatus(
                    product.product_id,
                    !currentlyActive
                );
            });

            actionCell.appendChild(button);
            row.appendChild(actionCell);
            productTable.appendChild(row);
        });

    } catch (error) {
        showMessage(message, error.message, true);
    }
}

// ADD PRODUCT
productForm.addEventListener(
    "submit",
    async function(event) {
        event.preventDefault();

        const product = {
            product_name:
                document.getElementById("product_name")
                    .value.trim(),

            category:
                document.getElementById("category")
                    .value.trim(),

            brand:
                document.getElementById("brand")
                    .value.trim(),

            material_style:
                document.getElementById("material_style")
                    .value.trim(),

            color:
                document.getElementById("color")
                    .value.trim(),

            unit_price:
                Number(
                    document.getElementById("unit_price").value
                ),

            pricing_unit:
                document.getElementById("pricing_unit").value,

            dimensions:
                document.getElementById("dimensions")
                    .value.trim(),

            sqft_per_package:
                document.getElementById("sqft_per_package")
                    .value === ""
                    ? null
                    : Number(
                        document.getElementById(
                            "sqft_per_package"
                        ).value
                    ),

            description:
                document.getElementById("description")
                    .value.trim()
        };

        try {
            const response = await fetch(
                `${API}/admin/products`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    credentials: "include",
                    body: JSON.stringify(product)
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.message || "Unable to add product."
                );
            }

            showMessage(message, result.message);

            productForm.reset();
            await loadProducts();

        } catch (error) {
            showMessage(message, error.message, true);
        }
    }
);

// ACTIVATE OR DEACTIVATE PRODUCT
async function updateProductStatus(productId, active) {
    try {
        const response = await fetch(
            `API/admin/products/{productId}/status`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: "include",
                body: JSON.stringify({ active })
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                result.message || "Unable to update product."
            );
        }

        showMessage(message, result.message);
        await loadProducts();

    } catch (error) {
        showMessage(message, error.message, true);
    }
}

// REFRESH PRODUCTS
document.getElementById("refreshButton")
    .addEventListener("click", loadProducts);

// LOAD CUSTOMER PROJECT REQUESTS
async function loadProjects() {
    showMessage(
        projectsMessage,
        "Loading customer project requests..."
    );

    try {
        const response = await fetch(
            `${API}/admin/projects`,
            {
                credentials: "include"
            }
        );

        if (response.status === 401) {
            window.location.href = "staffLogin.html";
            return;
        }

        if (!response.ok) {
            throw new Error(
                "Unable to load customer project requests."
            );
        }

        const projects = await response.json();

        // Remove old photo previews and their temporary URLs.
        projectPhotoUrls.forEach(url => URL.revokeObjectURL(url));
        projectPhotoUrls = [];

        projectsContainer.replaceChildren();

        if (projects.length === 0) {
            showMessage(
                projectsMessage,
                "No customer project requests found."
            );
            return;
        }

        showMessage(
            projectsMessage,
            `${projects.length} project request(s) found.`
        );

        for (const project of projects) {
            displayProject(project);
        }

    } catch (error) {
        showMessage(
            projectsMessage,
            error.message,
            true
        );
    }
}

// DISPLAY A PROJECT AND ITS DETAILS
function displayProject(project) {
    const card = document.createElement("div");
    card.className = "project-card";

    const headingRow = document.createElement("div");
    headingRow.className = "project-heading-row";

    const heading = createTextElement(
        "h4",
        `Project #${project.project_id}`
    );

    const status = createTextElement(
        "span",
        project.status
    );

    status.className = "project-status";

    headingRow.appendChild(heading);
    headingRow.appendChild(status);

    card.appendChild(headingRow);

    const customerName = [
        project.first_name,
        project.last_name
    ].filter(Boolean).join(" ");

    addProjectDetail(card, "Customer", customerName);
    addProjectDetail(card, "Email", project.email);
    addProjectDetail(card, "Phone", project.phone);

    addProjectDetail(
        card,
        "Installation Address",
        project.service_address
    );

    addProjectDetail(
        card,
        "Preferred Start Date",
        formatDate(project.preferred_start)
    );

    addProjectDetail(
        card,
        "Preferred End Date",
        formatDate(project.preferred_end)
    );

    addProjectDetail(
        card,
        "Proposed Budget",
        formatMoney(project.proposed_budget)
    );

    addProjectDetail(
        card,
        "Total Area",
        `${Number(project.total_area_sqft).toFixed(2)} sq. ft.`
    );

    addProjectDetail(card, "Notes", project.notes);

    addProjectDetail(
        card,
        "Submitted At",
        formatDate(project.submitted_at)
    );

    // ROOMS
    const roomsSection = document.createElement("div");
    roomsSection.className = "project-rooms";

    roomsSection.appendChild(
        createTextElement("h4", "Room Details")
    );

    const rooms = project.rooms || [];

    if (rooms.length === 0) {
        roomsSection.appendChild(
            createTextElement("p", "No rooms found.")
        );
    } else {
        const tableWrapper = document.createElement("div");
        tableWrapper.className = "table-wrapper";

        const table = document.createElement("table");

        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");

        [
            "Room",
            "Flooring Product",
            "Length",
            "Width",
            "Area",
            "Existing Floor",
            "Removal",
            "Pattern"
        ].forEach(label => {
            const th = createTextElement("th", label);
            headerRow.appendChild(th);
        });

        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");

        rooms.forEach(room => {
            const row = document.createElement("tr");

            const values = [
                room.room_name,
                room.product_name,
                room.length_ft == null
                    ? "-"
                    : `${room.length_ft} ft.`,
                room.width_ft == null
                    ? "-"
                    : `${room.width_ft} ft.`,
                `${room.area_sqft} sq. ft.`,
                room.existing_floor_type || "-",
                Number(room.removal_required) === 1
                    ? "Yes"
                    : "No",
                room.installation_pattern || "-"
            ];

            values.forEach(value => {
                row.appendChild(
                    createTextElement("td", value)
                );
            });

            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        tableWrapper.appendChild(table);
        roomsSection.appendChild(tableWrapper);
    }

    card.appendChild(roomsSection);

    // PHOTOGRAPHS
    const photosSection = document.createElement("div");
    photosSection.className = "project-photos";

    photosSection.appendChild(
        createTextElement("h4", "Project Photographs")
    );

    const photos = project.photos || [];

    if (photos.length === 0) {
        photosSection.appendChild(
            createTextElement("p", "No photographs uploaded.")
        );
    } else {
        const gallery = document.createElement("div");
        gallery.className = "photo-gallery";

        photos.forEach(photo => {
            const image = document.createElement("img");
            image.alt = `Project ${project.project_id} photograph`;
            image.loading = "lazy";

            // Fetch photos with the staff session cookie.
            loadStaffPhoto(photo.photo_id, image);

            gallery.appendChild(image);
        });

        photosSection.appendChild(gallery);
    }

    card.appendChild(photosSection);

    // REJECTION DETAILS
    if (project.status === "REJECTED") {
        addProjectDetail(
            card,
            "Rejection Reason",
            project.rejection_reason
        );
    }

    // ONLY SUBMITTED PROJECTS CAN BE REJECTED
    if (project.status === "SUBMITTED") {
        addRejectControls(card, project);
    }

    projectsContainer.appendChild(card);
}

// LOAD A STAFF-PROTECTED PHOTO
async function loadStaffPhoto(photoId, imageElement) {
    try {
        const response = await fetch(
            `API/admin/photos/{photoId}`,
            {
                credentials: "include"
            }
        );

        if (!response.ok) {
            throw new Error("Photo unavailable.");
        }

        const blob = await response.blob();

        if (!blob.type.startsWith("image/")) {
            throw new Error("Invalid photo response.");
        }

        const url = URL.createObjectURL(blob);
        projectPhotoUrls.push(url);

        if (!imageElement.isConnected) {
            URL.revokeObjectURL(url);
            projectPhotoUrls =
                projectPhotoUrls.filter(item => item !== url);
            return;
        }

        imageElement.src = url;

    } catch (error) {
        imageElement.alt = "Photograph unavailable";
    }
}

// ADD REJECTION CONTROLS
function addRejectControls(card, project) {
    const section = document.createElement("div");
    section.className = "reject-section";

    section.appendChild(
        createTextElement("h4", "Reject Project Request")
    );

    const label = createTextElement(
        "label",
        "Reason for rejection"
    );

    const reasonInput = document.createElement("textarea");

    reasonInput.placeholder =
        "Explain why this flooring request cannot be accepted.";

    reasonInput.maxLength = 2000;

    const inputId = `reject-reason-${project.project_id}`;
    reasonInput.id = inputId;
    label.htmlFor = inputId;

    const button = createTextElement(
        "button",
        "Reject Project"
    );

    button.type = "button";
    button.className = "reject-button";

    const actionMessage = document.createElement("p");
    actionMessage.className = "project-action-message";
    actionMessage.setAttribute("role", "status");

    button.addEventListener("click", async () => {
        const reason = reasonInput.value.trim();

        if (reason.length < 5) {
            showMessage(
                actionMessage,
                "Please enter a rejection reason of at least 5 characters.",
                true
            );
            return;
        }

        const confirmed = window.confirm(
            `Are you sure you want to reject Project #${project.project_id}?`
        );

        if (!confirmed) return;

        button.disabled = true;

        try {
            const response = await fetch(
                `API/admin/projects/{project.project_id}/reject`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    credentials: "include",
                    body: JSON.stringify({ reason })
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.message || "Unable to reject project."
                );
            }

            showMessage(
                projectsMessage,
                `Project #${project.project_id} rejected successfully.`
            );

            await loadProjects();

        } catch (error) {
            showMessage(
                actionMessage,
                error.message,
                true
            );
        } finally {
            button.disabled = false;
        }
    });

    section.appendChild(label);
    section.appendChild(reasonInput);
    section.appendChild(button);
    section.appendChild(actionMessage);

    card.appendChild(section);
}

// REFRESH PROJECT REQUESTS
document.getElementById("refreshProjectsButton")
    .addEventListener("click", loadProjects);

// LOGOUT
document.getElementById("logoutButton")
    .addEventListener("click", async function() {
        try {
            const response = await fetch(
                `${API}/staff/logout`,
                {
                    method: "POST",
                    credentials: "include"
                }
            );

            if (!response.ok) {
                throw new Error("Logout failed.");
            }

            projectPhotoUrls.forEach(url => {
                URL.revokeObjectURL(url);
            });

            window.location.href = "staffLogin.html";

        } catch (error) {
            showMessage(message, error.message, true);
        }
    });

// START DASHBOARD
(async function() {
    const loggedIn = await checkStaffSession();

    if (loggedIn) {
        await Promise.all([
            loadProducts(),
            loadProjects()
        ]);
    }
})();



