
const API = "http://localhost:5050/api";

const projectForm = document.getElementById("projectForm");
const roomsContainer = document.getElementById("roomsContainer");
const roomTemplate = document.getElementById("roomTemplate");
const addRoomButton = document.getElementById("addRoomButton");
const submitButton = document.getElementById("submitButton");
const message = document.getElementById("message");
const authMessage = document.getElementById("authMessage");
const photoInput = document.getElementById("projectPhotos");
const photoPreview = document.getElementById("photoPreview");
const photoCount = document.getElementById("photoCount");
const retryPhotoUploadButton =
    document.getElementById("retryPhotoUpload");

let products = [];
let customerLoggedIn = false;
let selectedPhotos = [];
let previewUrls = [];
let pendingPhotoProjectId = null;

// --------------------------------------------------
// GENERAL HELPERS
// --------------------------------------------------

function showMessage(element, text, type) {
    element.textContent = text;
    element.className = "message " + type;
}

function addDetail(container, label, value) {
    const paragraph = document.createElement("p");
    const strong = document.createElement("strong");

    strong.textContent = label + ": ";
    paragraph.appendChild(strong);
    paragraph.appendChild(
        document.createTextNode(String(value ?? "Not provided"))
    );

    container.appendChild(paragraph);
}

function formatMoney(value) {
    const amount = Number(value);
    return Number.isFinite(amount)
        ? "$" + amount.toFixed(2)
        : "Not provided";
}

async function readJson(response) {
    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            result.message || `Request failed (HTTP ${response.status}).`
        );
    }

    return result;
}

// --------------------------------------------------
// CHECK CUSTOMER LOGIN
// --------------------------------------------------

async function checkCustomer() {
    try {
        const response = await fetch(`${API}/me`, {
            credentials: "include"
        });

        if (!response.ok) {
            throw new Error(
                "Please log in before submitting a project."
            );
        }

        const customer = await response.json();

        customerLoggedIn = true;

        document.getElementById("customerInfo").textContent =
            `Logged in as ${customer.first_name} ${customer.last_name}`;

        authMessage.textContent = "";

        submitButton.disabled = false;
        addRoomButton.disabled = false;
        photoInput.disabled = false;

    } catch (error) {
        customerLoggedIn = false;

        document.getElementById("customerInfo").textContent =
            "Customer login required.";

        showMessage(authMessage, error.message, "error");

        const link = document.createElement("a");
        link.href = "login.html";
        link.textContent = " Go to Customer Login";
        authMessage.appendChild(link);

        submitButton.disabled = true;
        addRoomButton.disabled = true;
        photoInput.disabled = true;
    }
}

// --------------------------------------------------
// LOAD FLOORING PRODUCTS
// --------------------------------------------------

async function loadProducts() {
    try {
        const response = await fetch(`${API}/products`);
        products = await readJson(response);

        if (!Array.isArray(products)) {
            throw new Error("Invalid flooring product response.");
        }

        if (products.length === 0) {
            showMessage(
                message,
                "No active flooring products are available.",
                "error"
            );
        }

    } catch (error) {
        showMessage(message, error.message, "error");
    }
}

// --------------------------------------------------
// ROOM NUMBERS AND AREA
// --------------------------------------------------

function updateRoomNumbers() {
    const cards = roomsContainer.querySelectorAll(".room-card");

    cards.forEach((card, index) => {
        card.querySelector(".room-title").textContent =
            `Room ${index + 1}`;
    });
}

function calculateArea() {
    let total = 0;

    const cards = roomsContainer.querySelectorAll(".room-card");

    cards.forEach(card => {
        const length = Number(
            card.querySelector(".roomLength").value
        );

        const width = Number(
            card.querySelector(".roomWidth").value
        );

        const area = length > 0 && width > 0
            ? length * width
            : 0;

        card.querySelector(".areaValue").textContent =
            area.toFixed(2);

        total += area;
    });

    document.getElementById("totalArea").textContent =
        total.toFixed(2);
}

// --------------------------------------------------
// ADD ROOM
// --------------------------------------------------

function addRoom() {
    const fragment = roomTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".room-card");
    const productSelect = card.querySelector(".productSelect");

    products.forEach(product => {
        const option = document.createElement("option");

        option.value = product.product_id;
        option.textContent =
            `${product.product_name} - $${product.unit_price}/${product.pricing_unit}`;

        productSelect.appendChild(option);
    });

    card.querySelector(".roomLength").addEventListener(
        "input",
        calculateArea
    );

    card.querySelector(".roomWidth").addEventListener(
        "input",
        calculateArea
    );

    card.querySelector(".removeRoom").addEventListener(
        "click",
        function() {
            if (
                roomsContainer.querySelectorAll(".room-card").length <= 1
            ) {
                alert("At least one room is required.");
                return;
            }

            card.remove();
            updateRoomNumbers();
            calculateArea();
        }
    );

    roomsContainer.appendChild(fragment);
    updateRoomNumbers();
    calculateArea();
}

addRoomButton.addEventListener("click", function() {
    if (customerLoggedIn && pendingPhotoProjectId === null) {
        addRoom();
    }
});

// --------------------------------------------------
// PHOTO SELECTION
// --------------------------------------------------

photoInput.addEventListener("change", function() {
    const files = Array.from(photoInput.files);

    if (files.length > 5) {
        photoInput.value = "";
        showMessage(
            message,
            "You can select a maximum of 5 photos per project.",
            "error"
        );
        return;
    }

    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp"
    ];

    for (const file of files) {
        if (!allowedTypes.includes(file.type)) {
            photoInput.value = "";
            showMessage(
                message,
                "Only JPG, PNG and WEBP photos are allowed.",
                "error"
            );
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            photoInput.value = "";
            showMessage(
                message,
                `${file.name} is larger than 5 MB.`,
                "error"
            );
            return;
        }
    }

    selectedPhotos = files;
    showMessage(message, "", "");
    renderPhotoPreviews();
});

// --------------------------------------------------
// PHOTO PREVIEWS
// --------------------------------------------------

function renderPhotoPreviews() {
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    previewUrls = [];

    photoPreview.replaceChildren();

    photoCount.textContent =
        `${selectedPhotos.length} of 5 photographs selected`;

    selectedPhotos.forEach((file, index) => {
        const item = document.createElement("div");
        item.className = "photo-item";

        const image = document.createElement("img");
        const imageUrl = URL.createObjectURL(file);

        previewUrls.push(imageUrl);
        image.src = imageUrl;
        image.alt = `Project photograph ${index + 1}`;

        const name = document.createElement("p");
        name.textContent = file.name;

        const removeButton = document.createElement("button");
        removeButton.type = "button";
        removeButton.className = "remove";
        removeButton.textContent = "Remove";

        removeButton.addEventListener("click", function() {
            selectedPhotos.splice(index, 1);
            photoInput.value = "";
            renderPhotoPreviews();
        });

        item.appendChild(image);
        item.appendChild(name);
        item.appendChild(removeButton);
        photoPreview.appendChild(item);
    });
}

// --------------------------------------------------
// UPLOAD PROJECT PHOTOS
// --------------------------------------------------

async function uploadProjectPhotos(projectId) {
    if (selectedPhotos.length === 0) {
        return { photos_uploaded: 0 };
    }

    const formData = new FormData();

    selectedPhotos.forEach(file => {
        formData.append("photos", file);
    });

    const response = await fetch(
        `${API}/projects/${projectId}/photos`,
        {
            method: "POST",
            credentials: "include",
            body: formData
        }
    );

    return readJson(response);
}

// --------------------------------------------------
// RESET PROJECT FORM
// --------------------------------------------------

function resetAfterSuccessfulSubmission() {
    projectForm.reset();

    selectedPhotos = [];
    photoInput.value = "";

    previewUrls.forEach(url => URL.revokeObjectURL(url));
    previewUrls = [];

    photoPreview.replaceChildren();
    photoCount.textContent = "0 of 5 photographs selected";

    pendingPhotoProjectId = null;
    retryPhotoUploadButton.hidden = true;

    roomsContainer.replaceChildren();
    addRoom();
    calculateArea();

    submitButton.disabled = !customerLoggedIn;
    addRoomButton.disabled = !customerLoggedIn;
    photoInput.disabled = !customerLoggedIn;
}

// --------------------------------------------------
// RETRY PHOTO UPLOAD
// --------------------------------------------------

retryPhotoUploadButton.addEventListener(
    "click",
    async function() {
        if (
            !pendingPhotoProjectId ||
            selectedPhotos.length === 0
        ) {
            showMessage(
                message,
                "Please select the photos again before retrying.",
                "error"
            );
            return;
        }

        retryPhotoUploadButton.disabled = true;

        try {
            const projectId = pendingPhotoProjectId;
            const result = await uploadProjectPhotos(projectId);

            resetAfterSuccessfulSubmission();

            showMessage(
                message,
                `Photos uploaded successfully for Project #${projectId}.\nPhotos uploaded: ${result.photos_uploaded}`,
                "success"
            );

            await loadMyProjects();

        } catch (error) {
            showMessage(message, error.message, "error");

        } finally {
            retryPhotoUploadButton.disabled = false;
        }
    }
);

// --------------------------------------------------
// SUBMIT PROJECT
// --------------------------------------------------

projectForm.addEventListener("submit", async function(event) {
    event.preventDefault();

    if (!customerLoggedIn) {
        showMessage(
            message,
            "Please log in before submitting.",
            "error"
        );
        return;
    }

    if (pendingPhotoProjectId !== null) {
        showMessage(
            message,
            "Please finish uploading photos for your previous project first.",
            "error"
        );
        return;
    }

    if (!projectForm.reportValidity()) return;

    const startDate =
        document.getElementById("preferredStart").value;

    const endDate =
        document.getElementById("preferredEnd").value;

    if (startDate && endDate && endDate < startDate) {
        showMessage(
            message,
            "End date cannot be before start date.",
            "error"
        );
        return;
    }

    const roomCards =
        roomsContainer.querySelectorAll(".room-card");

    const rooms = [];

    for (const card of roomCards) {
        const room = {
            room_name:
                card.querySelector(".roomName").value.trim(),

            product_id:
                Number(card.querySelector(".productSelect").value),

            length_ft:
                Number(card.querySelector(".roomLength").value),

            width_ft:
                Number(card.querySelector(".roomWidth").value),

            existing_floor_type:
                card.querySelector(".existingFloor").value,

            removal_required:
                card.querySelector(".removalRequired").checked,

            installation_pattern:
                card.querySelector(".installationPattern").value
        };

        if (!room.product_id) {
            showMessage(
                message,
                "Please select a flooring product for every room.",
                "error"
            );
            return;
        }

        rooms.push(room);
    }

    const budgetValue =
        document.getElementById("budget").value;

    const projectData = {
        service_address:
            document.getElementById("serviceAddress").value.trim(),

        preferred_start: startDate || null,
        preferred_end: endDate || null,

        proposed_budget:
            budgetValue === "" ? null : Number(budgetValue),

        notes:
            document.getElementById("notes").value.trim(),

        rooms
    };

    try {
        submitButton.disabled = true;
        submitButton.textContent = "Submitting...";

        const response = await fetch(`${API}/projects`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "include",
            body: JSON.stringify(projectData)
        });

        const result = await readJson(response);
        const projectId = result.project_id;

        if (selectedPhotos.length > 0) {
            pendingPhotoProjectId = projectId;

            try {
                await uploadProjectPhotos(projectId);

            } catch (uploadError) {
                retryPhotoUploadButton.hidden = false;

                showMessage(
                    message,
                    `Project #${projectId} was submitted successfully, but photo upload failed: ${uploadError.message}\n\nYour project will not be submitted again. Select the photos again if needed, then click Retry Photo Upload.`,
                    "error"
                );

                return;
            }
        }

        const photoTotal = selectedPhotos.length;

        resetAfterSuccessfulSubmission();

        showMessage(
            message,
            `Project submitted successfully!\n\nProject ID: ${projectId}\nTotal Area: ${result.total_area_sqft} sq. ft.\nRooms: ${result.number_of_rooms}\nPhotos uploaded: ${photoTotal}`,
            "success"
        );

        await loadMyProjects();

    } catch (error) {
        showMessage(message, error.message, "error");

    } finally {
        submitButton.disabled =
            !customerLoggedIn || pendingPhotoProjectId !== null;

        submitButton.textContent = "Submit Project Request";
    }
});

// --------------------------------------------------
// LOAD CUSTOMER PROJECT HISTORY
// --------------------------------------------------

async function loadMyProjects() {
    const container = document.getElementById("myProjects");

    container.textContent = "Loading projects...";

    try {
        const response = await fetch(`${API}/projects/mine`, {
            credentials: "include"
        });

        const projects = await readJson(response);

        container.replaceChildren();

        if (!Array.isArray(projects) || projects.length === 0) {
            container.textContent =
                "You have not submitted any projects yet.";
            return;
        }

        projects.forEach(project => {
            const item = document.createElement("div");
            item.className = "project-item";

            const heading = document.createElement("h3");
            heading.textContent = `Project #${project.project_id}`;
            item.appendChild(heading);

            addDetail(item, "Address", project.service_address);

            addDetail(
                item,
                "Total Area",
                `${project.total_area_sqft} sq. ft.`
            );

            addDetail(item, "Status", project.status);

            // REJECTION REASON
            if (project.status === "REJECTED") {
                const rejectionBox = document.createElement("div");
                rejectionBox.className = "rejection-reason";

                addDetail(
                    rejectionBox,
                    "Reason for rejection",
                    project.rejection_reason ||
                        "No rejection reason was provided."
                );

                item.appendChild(rejectionBox);
            }

            // ROOM INFORMATION
            const roomsHeading = document.createElement("strong");
            roomsHeading.textContent = "Rooms:";
            item.appendChild(roomsHeading);

            if (Array.isArray(project.rooms)) {
                project.rooms.forEach(room => {
                    const roomInfo = document.createElement("p");

                    roomInfo.textContent =
                        `${room.room_name} — ` +
                        `${room.product_name} — ` +
                        `${room.area_sqft} sq. ft.`;

                    item.appendChild(roomInfo);
                });
            }

            container.appendChild(item);

            // CUSTOMER QUOTATIONS
            if (project.status !== "REJECTED") {
                loadCustomerQuotes(project.project_id, item);
            }
        });

    } catch (error) {
        container.textContent = error.message;
        console.error("Unable to load projects:", error);
    }
}

// --------------------------------------------------
// LOAD CUSTOMER QUOTATIONS
// --------------------------------------------------

async function loadCustomerQuotes(projectId, projectCard) {
    const section = document.createElement("div");
    section.className = "customer-quotes";

    section.style.marginTop = "20px";
    section.style.paddingTop = "15px";
    section.style.borderTop = "1px solid #ddd";

    const heading = document.createElement("h4");
    heading.textContent = "Project Quotations";
    section.appendChild(heading);

    const content = document.createElement("div");
    content.textContent = "Loading quotations...";

    section.appendChild(content);
    projectCard.appendChild(section);

    try {
        const response = await fetch(
            `${API}/projects/${projectId}/quotes`,
            {
                credentials: "include"
            }
        );

        const quotes = await readJson(response);

        content.replaceChildren();

        if (!Array.isArray(quotes) || quotes.length === 0) {
            content.textContent =
                "No quotation has been prepared yet.";
            return;
        }

        quotes.forEach((quote, index) => {
            const quoteCard = document.createElement("div");

            quoteCard.style.border = "1px solid #ddd";
            quoteCard.style.borderRadius = "6px";
            quoteCard.style.padding = "15px";
            quoteCard.style.marginBottom = "15px";

            const title = document.createElement("h4");
            title.textContent =
                `Quotation #${quote.quote_id} — Version ${quote.version_no}`;

            quoteCard.appendChild(title);

            addDetail(quoteCard, "Status", quote.status);

            if (quote.quoted_at) {
                addDetail(
                    quoteCard,
                    "Quotation Date",
                    new Date(quote.quoted_at).toLocaleDateString()
                );
            }

            addDetail(
                quoteCard,
                "Material Cost",
                formatMoney(quote.estimated_material_cost)
            );

            addDetail(
                quoteCard,
                "Labor Cost",
                formatMoney(quote.estimated_labor_cost)
            );

            addDetail(
                quoteCard,
                "Other Charges",
                formatMoney(quote.other_net_charges)
            );

            addDetail(
                quoteCard,
                "Waste Allowance",
                `${Number(quote.waste_percent).toFixed(2)}%`
            );

            const total = document.createElement("h4");
            total.textContent =
                `Total Quotation: ${formatMoney(quote.total_price)}`;

            quoteCard.appendChild(total);

            if (quote.proposed_start) {
                addDetail(
                    quoteCard,
                    "Proposed Start",
                    new Date(quote.proposed_start).toLocaleDateString()
                );
            }

            if (quote.proposed_end) {
                addDetail(
                    quoteCard,
                    "Proposed End",
                    new Date(quote.proposed_end).toLocaleDateString()
                );
            }

            if (quote.note) {
                addDetail(quoteCard, "Staff Notes", quote.note);
            }

            // QUOTATION BREAKDOWN
            const lines = Array.isArray(quote.lines)
                ? quote.lines
                : [];

            if (lines.length > 0) {
                const linesHeading = document.createElement("strong");
                linesHeading.textContent = "Quotation Breakdown:";
                quoteCard.appendChild(linesHeading);

                const list = document.createElement("ul");

                lines.forEach(line => {
                    const listItem = document.createElement("li");

                    listItem.textContent =
                        `${line.description || line.charge_type}: ` +
                        `${Number(line.quantity)} ${line.unit || ""} × ` +
                        `${formatMoney(line.unit_price)} = ` +
                        `${formatMoney(line.line_amount)}`;

                    list.appendChild(listItem);
                });

                quoteCard.appendChild(list);
            }

            // NEW: ACTIONS FOR THE LATEST PROPOSED QUOTATION
            if (
                index === 0 &&
                quote.status === "PROPOSED"
            ) {
                addQuotationResponseControls(
                    quoteCard,
                    projectId,
                    quote
                );
            }

            // EXISTING OR PREVIOUS RESPONSES
            if (quote.status === "COUNTERED") {
                const info = document.createElement("p");
                info.textContent =
                    "Your counteroffer has been submitted. " +
                    "Waiting for staff to review it.";

                quoteCard.appendChild(info);
            }

            if (quote.status === "ACCEPTED") {
                const info = document.createElement("p");
                info.textContent =
                    "Quotation accepted. An installation order has been created.";

                quoteCard.appendChild(info);
            }

            if (quote.status === "REJECTED") {
                const info = document.createElement("p");
                info.textContent =
                    "You rejected this quotation.";

                quoteCard.appendChild(info);
            }

            content.appendChild(quoteCard);
        });

    } catch (error) {
        content.textContent = error.message;

        console.error(
            `Unable to load quotations for Project #${projectId}:`,
            error
        );
    }
}

// --------------------------------------------------
// NEW: ACCEPT, REJECT, OR NEGOTIATE QUOTATION
// --------------------------------------------------

function addQuotationResponseControls(container, projectId, quote) {
    const section = document.createElement("div");
    section.className = "quote-response-controls";

    section.style.marginTop = "18px";
    section.style.paddingTop = "15px";
    section.style.borderTop = "1px solid #ddd";

    const heading = document.createElement("h4");
    heading.textContent = "Respond to Quotation";
    section.appendChild(heading);

    const buttonRow = document.createElement("div");
    buttonRow.style.display = "flex";
    buttonRow.style.flexWrap = "wrap";
    buttonRow.style.gap = "10px";

    const acceptButton = document.createElement("button");
    acceptButton.type = "button";
    acceptButton.textContent = "Accept Quotation";
    acceptButton.style.background = "#16713c";
    acceptButton.style.color = "white";

    const rejectButton = document.createElement("button");
    rejectButton.type = "button";
    rejectButton.textContent = "Reject Quotation";
    rejectButton.style.background = "#b33434";
    rejectButton.style.color = "white";

    const negotiateButton = document.createElement("button");
    negotiateButton.type = "button";
    negotiateButton.textContent = "Negotiate Price";
    negotiateButton.style.background = "#245b75";
    negotiateButton.style.color = "white";

    buttonRow.appendChild(acceptButton);
    buttonRow.appendChild(rejectButton);
    buttonRow.appendChild(negotiateButton);

    section.appendChild(buttonRow);

    const responseForm = document.createElement("form");
    responseForm.style.marginTop = "15px";
    responseForm.hidden = true;

    const responseTitle = document.createElement("h4");
    responseForm.appendChild(responseTitle);

    const counterLabel = document.createElement("label");
    counterLabel.textContent = "Your Counteroffer ($)";

    const counterInput = document.createElement("input");
    counterInput.type = "number";
    counterInput.min = "0.01";
    counterInput.max = "9999999999.99";
    counterInput.step = "0.01";

    const counterWrapper = document.createElement("div");
    counterWrapper.style.marginBottom = "12px";
    counterWrapper.appendChild(counterLabel);
    counterWrapper.appendChild(counterInput);

    responseForm.appendChild(counterWrapper);

    const reasonLabel = document.createElement("label");
    reasonLabel.textContent = "Message / Reason";

    const reasonInput = document.createElement("textarea");
    reasonInput.maxLength = 2000;
    reasonInput.rows = 3;
    reasonInput.placeholder = "Enter your reason or message.";

    responseForm.appendChild(reasonLabel);
    responseForm.appendChild(reasonInput);

    const formButtons = document.createElement("div");
    formButtons.style.display = "flex";
    formButtons.style.gap = "10px";
    formButtons.style.marginTop = "12px";

    const sendButton = document.createElement("button");
    sendButton.type = "submit";
    sendButton.textContent = "Submit Response";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Cancel";

    formButtons.appendChild(sendButton);
    formButtons.appendChild(cancelButton);
    responseForm.appendChild(formButtons);

    section.appendChild(responseForm);

    const resultMessage = document.createElement("p");
    resultMessage.setAttribute("role", "status");
    section.appendChild(resultMessage);

    let selectedAction = null;
    let submitting = false;

    function openResponseForm(action) {
        selectedAction = action;
        responseForm.hidden = false;
        resultMessage.textContent = "";

        counterWrapper.hidden = action !== "NEGOTIATE";
        counterInput.required = action === "NEGOTIATE";
        counterInput.value = "";
        reasonInput.value = "";

        responseTitle.textContent =
            action === "REJECT"
                ? "Reject This Quotation"
                : "Submit a Counteroffer";

        reasonLabel.textContent =
            action === "REJECT"
                ? "Reason for Rejection"
                : "Reason for Counteroffer";

        sendButton.textContent =
            action === "REJECT"
                ? "Submit Rejection"
                : "Submit Counteroffer";
    }

    function setBusy(busy) {
        submitting = busy;

        acceptButton.disabled = busy;
        rejectButton.disabled = busy;
        negotiateButton.disabled = busy;
        sendButton.disabled = busy;
        cancelButton.disabled = busy;
    }

    // SEND CUSTOMER RESPONSE TO BACKEND
    async function submitResponse(action, customerMessage, counterAmount) {
        if (submitting) return;

        setBusy(true);
        resultMessage.textContent = "Submitting your response...";

        try {
            const payload = {
                action,
                message: customerMessage
            };

            if (action === "NEGOTIATE") {
                payload.counter_amount = counterAmount;
            }

            const response = await fetch(
                `${API}/projects/${projectId}/quotes/${quote.quote_id}/respond`,
                {
                    method: "POST",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(payload)
                }
            );

            const result = await readJson(response);

            resultMessage.style.color = "#16713c";
            resultMessage.textContent = result.message;

            // Refresh projects and quotation statuses.
            await loadMyProjects();

        } catch (error) {
            resultMessage.style.color = "#b33434";
            resultMessage.textContent = error.message;

        } finally {
            setBusy(false);
        }
    }

    // ACCEPT QUOTATION
    acceptButton.addEventListener("click", function() {
        const confirmed = window.confirm(
            `Accept Quotation #${quote.quote_id} for ` +
            `${formatMoney(quote.total_price)}?\n\n` +
            "This will create an installation order."
        );

        if (!confirmed) return;

        submitResponse("ACCEPT", "", null);
    });

    // REJECT QUOTATION
    rejectButton.addEventListener("click", function() {
        openResponseForm("REJECT");
    });

    // NEGOTIATE PRICE
    negotiateButton.addEventListener("click", function() {
        openResponseForm("NEGOTIATE");
    });

    // CANCEL RESPONSE
    cancelButton.addEventListener("click", function() {
        responseForm.hidden = true;
        selectedAction = null;
        resultMessage.textContent = "";
    });

    // SUBMIT REJECTION OR COUNTEROFFER
    responseForm.addEventListener("submit", function(event) {
        event.preventDefault();

        if (!selectedAction || submitting) return;

        const customerMessage = reasonInput.value.trim();

        if (customerMessage.length < 5) {
            resultMessage.style.color = "#b33434";
            resultMessage.textContent =
                "Please enter a reason of at least 5 characters.";
            return;
        }

        if (selectedAction === "NEGOTIATE") {
            const amountText = counterInput.value.trim();
            const counterAmount = Number(amountText);

            if (
                !amountText ||
                !Number.isFinite(counterAmount) ||
                counterAmount <= 0 ||
                counterAmount > 9999999999.99 ||
                !/^\d+(\.\d{1,2})?$/.test(amountText)
            ) {
                resultMessage.style.color = "#b33434";
                resultMessage.textContent =
                    "Enter a valid counteroffer amount.";
                return;
            }

            const confirmed = window.confirm(
                `Submit a counteroffer of ${formatMoney(counterAmount)} ` +
                `for Quotation #${quote.quote_id}?`
            );

            if (!confirmed) return;

            submitResponse(
                "NEGOTIATE",
                customerMessage,
                counterAmount
            );

        } else if (selectedAction === "REJECT") {
            const confirmed = window.confirm(
                `Reject Quotation #${quote.quote_id}?`
            );

            if (!confirmed) return;

            submitResponse("REJECT", customerMessage, null);
        }
    });

    container.appendChild(section);
}

// --------------------------------------------------
// REFRESH PROJECTS BUTTON
// --------------------------------------------------

document.getElementById("refreshProjects")
    .addEventListener("click", loadMyProjects);

// --------------------------------------------------
// INITIALIZE PAGE
// --------------------------------------------------

async function initializePage() {
    await Promise.all([
        checkCustomer(),
        loadProducts()
    ]);

    addRoom();

    if (customerLoggedIn) {
        await loadMyProjects();
    }

    renderPhotoPreviews();
}

initializePage();
