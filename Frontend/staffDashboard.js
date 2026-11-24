
const API = "http://localhost:5050/api";

const productForm = document.getElementById("productForm");
const productTable = document.getElementById("productTable");
const message = document.getElementById("message");
const projectsContainer = document.getElementById("projectsContainer");
const projectsMessage = document.getElementById("projectsMessage");

let projectPhotoUrls = [];

// --------------------------------------------------
// HELPERS
// --------------------------------------------------

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
    const p = document.createElement("p");
    const strong = createTextElement("strong", label + ": ");
    p.appendChild(strong);
    p.appendChild(document.createTextNode(
        value === null || value === undefined || value === ""
            ? "Not provided" : String(value)
    ));
    container.appendChild(p);
}

function formatDate(value) {
    if (!value) return "Not provided";
    const text = String(value);
    const match = text.match(/^\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : text;
}

function formatMoney(value) {
    if (value === null || value === undefined || value === "") {
        return "Not provided";
    }
    const amount = Number(value);
    return Number.isFinite(amount)
        ? "$" + amount.toFixed(2) : "Not provided";
}

function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function readApiResponse(response) {
    const type = response.headers.get("content-type") || "";
    if (!type.includes("application/json")) {
        const body = await response.text();
        console.error("Unexpected API response:", body.slice(0, 300));
        throw new Error(`Unexpected server response (HTTP ${response.status}).`);
    }
    return response.json();
}

async function apiRequest(url, options = {}) {
    const response = await fetch(`${API}${url}`, {
        credentials: "include",
        ...options
    });
    const result = await readApiResponse(response);
    if (!response.ok) {
        throw new Error(result.message || "Request failed.");
    }
    return result;
}

// --------------------------------------------------
// STAFF SESSION
// --------------------------------------------------

async function checkStaffSession() {
    try {
        await apiRequest("/staff/me");
        return true;
    } catch (error) {
        if (/login|unauthorized|session|staff/i.test(error.message)) {
            window.location.href = "staffLogin.html";
        } else {
            showMessage(message, error.message, true);
        }
        return false;
    }
}

// --------------------------------------------------
// PRODUCT MANAGEMENT
// --------------------------------------------------

async function loadProducts() {
    try {
        const products = await apiRequest("/admin/products");
        productTable.replaceChildren();

        products.forEach(product => {
            const row = document.createElement("tr");

            function addCell(value) {
                row.appendChild(createTextElement("td", value));
            }

            addCell(product.product_id);
            addCell(product.product_name);
            addCell(product.category);
            addCell(`$${product.unit_price} / ${product.pricing_unit}`);

            const active = Number(product.active) === 1;
            addCell(active ? "Active" : "Inactive");

            const cell = document.createElement("td");
            const button = createTextElement(
                "button", active ? "Deactivate" : "Activate"
            );
            button.type = "button";
            button.className = "status-button";

            button.addEventListener("click", () => {
                updateProductStatus(product.product_id, !active);
            });

            cell.appendChild(button);
            row.appendChild(cell);
            productTable.appendChild(row);
        });
    } catch (error) {
        showMessage(message, error.message, true);
    }
}

productForm.addEventListener("submit", async event => {
    event.preventDefault();

    const value = id => document.getElementById(id).value.trim();

    const product = {
        product_name: value("product_name"),
        category: value("category"),
        brand: value("brand"),
        material_style: value("material_style"),
        color: value("color"),
        unit_price: Number(value("unit_price")),
        pricing_unit: value("pricing_unit"),
        dimensions: value("dimensions"),
        sqft_per_package: value("sqft_per_package") === ""
            ? null : Number(value("sqft_per_package")),
        description: value("description")
    };

    try {
        const result = await apiRequest("/admin/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(product)
        });

        showMessage(message, result.message);
        productForm.reset();
        await loadProducts();
    } catch (error) {
        showMessage(message, error.message, true);
    }
});

async function updateProductStatus(productId, active) {
    try {
        const result = await apiRequest(
            `/admin/products/${productId}/status`,
            {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ active })
            }
        );
        showMessage(message, result.message);
        await loadProducts();
    } catch (error) {
        showMessage(message, error.message, true);
    }
}

document.getElementById("refreshButton")
    .addEventListener("click", loadProducts);

// --------------------------------------------------
// CUSTOMER PROJECTS
// --------------------------------------------------

async function loadProjects() {
    showMessage(projectsMessage, "Loading customer project requests...");

    try {
        const projects = await apiRequest("/admin/projects");

        projectPhotoUrls.forEach(url => URL.revokeObjectURL(url));
        projectPhotoUrls = [];
        projectsContainer.replaceChildren();

        if (!Array.isArray(projects) || projects.length === 0) {
            showMessage(projectsMessage, "No customer project requests found.");
            return;
        }

        showMessage(
            projectsMessage,
            `${projects.length} project request(s) found.`
        );

        projects.forEach(displayProject);
    } catch (error) {
        showMessage(projectsMessage, error.message, true);
    }
}

// --------------------------------------------------
// DISPLAY PROJECT DETAILS
// --------------------------------------------------

function displayProject(project) {
    const card = document.createElement("div");
    card.className = "project-card";

    const headingRow = document.createElement("div");
    headingRow.className = "project-heading-row";
    headingRow.appendChild(
        createTextElement("h4", `Project #${project.project_id}`)
    );

    const status = createTextElement("span", project.status);
    status.className = "project-status";
    headingRow.appendChild(status);
    card.appendChild(headingRow);

    const customerName = [
        project.first_name, project.last_name
    ].filter(Boolean).join(" ");

    addProjectDetail(card, "Customer", customerName);
    addProjectDetail(card, "Email", project.email);
    addProjectDetail(card, "Phone", project.phone);
    addProjectDetail(card, "Installation Address", project.service_address);
    addProjectDetail(card, "Preferred Start Date",
        formatDate(project.preferred_start));
    addProjectDetail(card, "Preferred End Date",
        formatDate(project.preferred_end));
    addProjectDetail(card, "Proposed Budget",
        formatMoney(project.proposed_budget));
    addProjectDetail(card, "Total Area",
        `${Number(project.total_area_sqft).toFixed(2)} sq. ft.`);
    addProjectDetail(card, "Notes", project.notes);
    addProjectDetail(card, "Submitted At",
        formatDate(project.submitted_at));

    // ROOMS
    const roomsSection = document.createElement("div");
    roomsSection.className = "project-rooms";
    roomsSection.appendChild(createTextElement("h4", "Room Details"));

    const rooms = Array.isArray(project.rooms) ? project.rooms : [];

    if (rooms.length === 0) {
        roomsSection.appendChild(
            createTextElement("p", "No rooms found.")
        );
    } else {
        const wrapper = document.createElement("div");
        wrapper.className = "table-wrapper";
        const table = document.createElement("table");
        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");

        [
            "Room", "Flooring Product", "Length", "Width",
            "Area", "Existing Floor", "Removal", "Pattern"
        ].forEach(label => {
            headerRow.appendChild(createTextElement("th", label));
        });

        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");

        rooms.forEach(room => {
            const row = document.createElement("tr");
            const values = [
                room.room_name,
                room.product_name,
                room.length_ft == null ? "-" : `${room.length_ft} ft.`,
                room.width_ft == null ? "-" : `${room.width_ft} ft.`,
                `${room.area_sqft} sq. ft.`,
                room.existing_floor_type || "-",
                Number(room.removal_required) === 1 ? "Yes" : "No",
                room.installation_pattern || "-"
            ];

            values.forEach(value => {
                row.appendChild(createTextElement("td", value));
            });

            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        wrapper.appendChild(table);
        roomsSection.appendChild(wrapper);
    }

    card.appendChild(roomsSection);

    // PHOTOS
    const photoSection = document.createElement("div");
    photoSection.className = "project-photos";
    photoSection.appendChild(
        createTextElement("h4", "Project Photographs")
    );

    const photos = Array.isArray(project.photos) ? project.photos : [];

    if (photos.length === 0) {
        photoSection.appendChild(
            createTextElement("p", "No photographs uploaded.")
        );
    } else {
        const gallery = document.createElement("div");
        gallery.className = "photo-gallery";

        photos.forEach(photo => {
            const image = document.createElement("img");
            image.alt = `Project ${project.project_id} photograph`;
            image.loading = "lazy";
            loadStaffPhoto(photo.photo_id, image);
            gallery.appendChild(image);
        });

        photoSection.appendChild(gallery);
    }

    card.appendChild(photoSection);

    if (project.status === "REJECTED") {
        addProjectDetail(card, "Rejection Reason",
            project.rejection_reason);
    }

    // NEW: SHOW QUOTATION AND NEGOTIATION HISTORY
    if (["SUBMITTED", "QUOTED", "NEGOTIATING", "ACCEPTED"]
        .includes(project.status)) {
        addStaffQuotationHistory(card, project);
    }

    // NEW: ALLOW REVISED QUOTATIONS
    if (["SUBMITTED", "NEGOTIATING"].includes(project.status)) {
        addQuoteControls(card, project);
    }

    if (project.status === "SUBMITTED") {
        addRejectControls(card, project);
    }

    projectsContainer.appendChild(card);
}

// --------------------------------------------------
// NEW: STAFF QUOTATION AND NEGOTIATION HISTORY
// --------------------------------------------------

async function addStaffQuotationHistory(card, project) {
    const section = document.createElement("div");
    section.className = "staff-negotiation-section";
    section.style.marginTop = "20px";
    section.style.padding = "15px";
    section.style.border = "1px solid #ddd";
    section.style.borderRadius = "8px";

    section.appendChild(
        createTextElement("h4", "Quotation & Negotiation History")
    );

    const content = createTextElement(
        "p", "Loading quotation history..."
    );
    section.appendChild(content);
    card.appendChild(section);

    try {
        const id = project.project_id;

        const [quotes, history] = await Promise.all([
            apiRequest(`/staff/projects/${id}/quotes`),
            apiRequest(`/staff/projects/${id}/negotiations`)
        ]);

        content.replaceChildren();
        content.appendChild(
            createTextElement("h5", "Quotation Versions")
        );

        if (!Array.isArray(quotes) || quotes.length === 0) {
            content.appendChild(
                createTextElement("p", "No quotations yet.")
            );
        } else {
            quotes.forEach(quote => {
                const box = document.createElement("div");
                box.style.border = "1px solid #ddd";
                box.style.padding = "10px";
                box.style.marginBottom = "10px";

                addProjectDetail(box, "Quotation",
                    `#${quote.quote_id} — Version ${quote.version_no}`);
                addProjectDetail(box, "Status", quote.status);
                addProjectDetail(box, "Total",
                    formatMoney(quote.total_price));

                if (quote.note) {
                    addProjectDetail(box, "Staff Notes", quote.note);
                }

                content.appendChild(box);
            });
        }

        content.appendChild(
            createTextElement("h5", "Customer Negotiation History")
        );

        if (!Array.isArray(history) || history.length === 0) {
            content.appendChild(
                createTextElement("p", "No negotiation responses yet.")
            );
        } else {
            history.forEach(event => {
                const box = document.createElement("div");
                box.style.padding = "12px";
                box.style.marginBottom = "10px";
                box.style.borderLeft = "4px solid #245b75";
                box.style.background = "#f5f7f8";

                addProjectDetail(box, "From", event.sender_role);
                addProjectDetail(box, "Action", event.event_type);

                if (event.quote_id) {
                    addProjectDetail(box, "Quotation",
                        `#${event.quote_id}`);
                }

                addProjectDetail(box, "Message",
                    event.message || "No message provided.");

                if (event.created_at) {
                    addProjectDetail(box, "Date",
                        new Date(event.created_at).toLocaleString());
                }

                content.appendChild(box);
            });
        }
    } catch (error) {
        showMessage(content, error.message, true);
    }
}

// --------------------------------------------------
// STAFF-PROTECTED PROJECT PHOTOS
// --------------------------------------------------

async function loadStaffPhoto(photoId, imageElement) {
    try {
        const response = await fetch(
            `${API}/admin/photos/${photoId}`,
            { credentials: "include" }
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
            projectPhotoUrls = projectPhotoUrls.filter(
                item => item !== url
            );
            return;
        }

        imageElement.src = url;
    } catch (error) {
        imageElement.alt = "Photograph unavailable";
    }
}

// --------------------------------------------------
// CREATE ORIGINAL OR REVISED QUOTATION
// --------------------------------------------------

function addQuoteControls(card, project) {
    const section = document.createElement("div");
    section.className = "quote-section";
    section.style.marginTop = "20px";
    section.style.padding = "20px";
    section.style.background = "#ffffff";
    section.style.border = "1px solid #d9e0e5";
    section.style.borderRadius = "8px";

    const revised = project.status === "NEGOTIATING";

    section.appendChild(createTextElement(
        "h4",
        revised ? "Prepare Revised Quotation" : "Create Quotation"
    ));

    const area = Number(project.total_area_sqft);

    if (!Number.isFinite(area) || area <= 0) {
        section.appendChild(
            createTextElement("p", "Cannot create quotation: invalid project area.")
        );
        card.appendChild(section);
        return;
    }

    section.appendChild(createTextElement(
        "p", `Project Area: ${area.toFixed(2)} sq. ft.`
    ));

    const form = document.createElement("form");

    function createField(labelText, options = {}) {
        const wrapper = document.createElement("div");
        wrapper.style.marginBottom = "14px";

        const label = createTextElement("label", labelText);
        const input = document.createElement(
            options.multiline ? "textarea" : "input"
        );

        const inputId =
            `quote-${project.project_id}-${form.children.length}`;

        input.id = inputId;
        label.htmlFor = inputId;

        if (!options.multiline) {
            input.type = options.type || "number";
        }

        if (options.min !== undefined) input.min = String(options.min);
        if (options.max !== undefined) input.max = String(options.max);
        if (options.step !== undefined) input.step = String(options.step);
        if (options.value !== undefined) input.value = String(options.value);
        if (options.placeholder) input.placeholder = options.placeholder;
        if (options.required) input.required = true;

        wrapper.appendChild(label);
        wrapper.appendChild(input);
        form.appendChild(wrapper);
        return input;
    }

    const materialInput = createField(
        "Material Price per Sq. Ft. ($)",
        { min: 0, step: "0.01", required: true,
          placeholder: "Example: 4.25" }
    );

    const laborInput = createField(
        "Labor Price per Sq. Ft. ($)",
        { min: 0, step: "0.01", value: 0, required: true }
    );

    const otherInput = createField(
        "Other Charges ($)",
        { min: 0, step: "0.01", value: 0, required: true }
    );

    const wasteInput = createField(
        "Material Waste Allowance (%)",
        { min: 0, max: 100, step: "0.01", value: 0, required: true }
    );

    const noteInput = createField(
        "Quotation Notes",
        {
            multiline: true,
            placeholder: revised
                ? "Explain the revised quotation to the customer."
                : "Optional quotation notes"
        }
    );

    const totalDisplay = createTextElement(
        "p", "Estimated Total: $0.00"
    );
    totalDisplay.style.fontWeight = "bold";
    totalDisplay.style.fontSize = "18px";
    form.appendChild(totalDisplay);

    function getEstimate() {
        const materialRate = Number(materialInput.value);
        const laborRate = Number(laborInput.value);
        const other = Number(otherInput.value);
        const waste = Number(wasteInput.value);

        const values = [materialRate, laborRate, other, waste];

        if (
            values.some(x => !Number.isFinite(x) || x < 0) ||
            waste > 100
        ) {
            return null;
        }

        const materialQuantity =
            Math.round(area * (1 + waste / 100) * 1000) / 1000;

        const materialCost = roundMoney(
            materialQuantity * materialRate
        );
        const laborCost = roundMoney(area * laborRate);
        const total = roundMoney(
            materialCost + laborCost + other
        );

        if (!Number.isFinite(total) || !Number.isFinite(materialQuantity)) {
            return null;
        }

        return {
            materialRate, laborRate, other, waste,
            materialQuantity, materialCost, laborCost, total
        };
    }

    function calculateEstimate() {
        const estimate = getEstimate();
        totalDisplay.textContent = estimate
            ? `Estimated Total: $${estimate.total.toFixed(2)}`
            : "Estimated Total: Invalid amounts";
    }

    [materialInput, laborInput, otherInput, wasteInput]
        .forEach(input => {
            input.addEventListener("input", calculateEstimate);
        });

    calculateEstimate();

    const submitButton = createTextElement(
        "button",
        revised ? "Create Revised Quotation" : "Create Quotation"
    );
    submitButton.type = "submit";
    submitButton.className = "add-button";
    form.appendChild(submitButton);

    const resultMessage = document.createElement("p");
    resultMessage.setAttribute("role", "status");
    form.appendChild(resultMessage);

    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (!form.reportValidity()) return;

        const estimate = getEstimate();

        if (!estimate) {
            showMessage(
                resultMessage,
                "Please enter valid quotation amounts.",
                true
            );
            return;
        }

        const lines = [];

        if (estimate.materialRate > 0) {
            lines.push({
                charge_type: "MATERIAL",
                description: "Flooring material including waste allowance",
                quantity: estimate.materialQuantity,
                unit: "SQFT",
                unit_price: estimate.materialRate
            });
        }

        if (estimate.laborRate > 0) {
            lines.push({
                charge_type: "LABOR",
                description: "Flooring installation labor",
                quantity: area,
                unit: "SQFT",
                unit_price: estimate.laborRate
            });
        }

        if (estimate.other > 0) {
            lines.push({
                charge_type: "OTHER",
                description: "Additional project charges",
                quantity: 1,
                unit: "JOB",
                unit_price: estimate.other
            });
        }

        if (lines.length === 0) {
            showMessage(
                resultMessage,
                "Enter at least one charge greater than zero.",
                true
            );
            return;
        }

        const confirmed = window.confirm(
            `${revised ? "Create revised" : "Create"} quotation ` +
            `for Project #${project.project_id}?\n` +
            `Total: ${formatMoney(estimate.total)}`
        );

        if (!confirmed) return;

        submitButton.disabled = true;
        submitButton.textContent = "Creating Quotation...";

        try {
            const result = await apiRequest(
                `/staff/projects/${project.project_id}/quotes`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        lines,
                        waste_percent: estimate.waste,
                        note: noteInput.value.trim()
                    })
                }
            );

            showMessage(
                resultMessage,
                `Quotation #${result.quote_id} created successfully! ` +
                `Version: ${result.version_no}. ` +
                `Total: ${formatMoney(result.total_price)}.`
            );

            form.reset();
            calculateEstimate();

            await loadProjects();
        } catch (error) {
            showMessage(resultMessage, error.message, true);
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = revised
                ? "Create Revised Quotation"
                : "Create Quotation";
        }
    });

    section.appendChild(form);
    card.appendChild(section);
}

// --------------------------------------------------
// REJECT PROJECT REQUEST
// --------------------------------------------------

function addRejectControls(card, project) {
    const section = document.createElement("div");
    section.className = "reject-section";

    section.appendChild(
        createTextElement("h4", "Reject Project Request")
    );

    const label = createTextElement("label", "Reason for rejection");
    const reasonInput = document.createElement("textarea");
    reasonInput.placeholder =
        "Explain why this flooring request cannot be accepted.";
    reasonInput.maxLength = 2000;

    const inputId = `reject-reason-${project.project_id}`;
    reasonInput.id = inputId;
    label.htmlFor = inputId;

    const button = createTextElement("button", "Reject Project");
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

        if (!window.confirm(
            `Are you sure you want to reject Project #${project.project_id}?`
        )) return;

        button.disabled = true;

        try {
            await apiRequest(
                `/admin/projects/${project.project_id}/reject`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ reason })
                }
            );

            await loadProjects();
        } catch (error) {
            showMessage(actionMessage, error.message, true);
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

// --------------------------------------------------
// REFRESH PROJECTS
// --------------------------------------------------

document.getElementById("refreshProjectsButton")
    .addEventListener("click", loadProjects);

// --------------------------------------------------
// STAFF LOGOUT
// --------------------------------------------------

document.getElementById("logoutButton")
    .addEventListener("click", async () => {
        try {
            await apiRequest("/staff/logout", {
                method: "POST"
            });

            projectPhotoUrls.forEach(url => URL.revokeObjectURL(url));
            window.location.href = "staffLogin.html";
        } catch (error) {
            showMessage(message, error.message, true);
        }
    });

// --------------------------------------------------
// INITIALIZE STAFF DASHBOARD
// --------------------------------------------------

(async function() {
    const loggedIn = await checkStaffSession();

    if (loggedIn) {
        await Promise.all([
            loadProducts(),
            loadProjects()
        ]);
    }
})();
