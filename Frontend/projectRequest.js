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
const retryPhotoUploadButton = document.getElementById("retryPhotoUpload");

let products = [];
let customerLoggedIn = false;
let selectedPhotos = [];
let previewUrls = [];
let pendingPhotoProjectId = null;

// --------------------------------------------------
// DISPLAY MESSAGES
// --------------------------------------------------

function showMessage(element, text, type) {
    element.textContent = text;
    element.className = "message " + type;
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
            throw new Error("Please log in before submitting a project.");
        }

        const customer = await response.json();

        customerLoggedIn = true;

        document.getElementById("customerInfo").textContent =
            `Logged in as ${customer.first_name} ${customer.last_name}`;

        authMessage.textContent = "";

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
// LOAD AVAILABLE FLOORING PRODUCTS
// --------------------------------------------------

async function loadProducts() {
    try {
        const response = await fetch(`${API}/products`);

        if (!response.ok) {
            throw new Error("Unable to load flooring products.");
        }

        products = await response.json();

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
// UPDATE ROOM NUMBERS
// --------------------------------------------------

function updateRoomNumbers() {
    const roomCards = roomsContainer.querySelectorAll(".room-card");

    roomCards.forEach((card, index) => {
        card.querySelector(".room-title").textContent =
            `Room ${index + 1}`;
    });
}

// --------------------------------------------------
// CALCULATE ROOM AND TOTAL AREA
// --------------------------------------------------

function calculateArea() {
    let total = 0;

    const roomCards = roomsContainer.querySelectorAll(".room-card");

    roomCards.forEach(card => {
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
// ADD A NEW ROOM
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

    // RECALCULATE WHEN DIMENSIONS CHANGE

    card.querySelector(".roomLength").addEventListener(
        "input",
        calculateArea
    );

    card.querySelector(".roomWidth").addEventListener(
        "input",
        calculateArea
    );

    // REMOVE ROOM

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

// --------------------------------------------------
// ADD ROOM BUTTON
// --------------------------------------------------

addRoomButton.addEventListener("click", function() {
    if (customerLoggedIn && pendingPhotoProjectId === null) {
        addRoom();
    }
});

// --------------------------------------------------
// PHOTO SELECTION AND VALIDATION
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
// DISPLAY PHOTO PREVIEWS
// --------------------------------------------------

function renderPhotoPreviews() {

    previewUrls.forEach(url => URL.revokeObjectURL(url));
    previewUrls = [];

    photoPreview.innerHTML = "";

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
// UPLOAD PHOTOS AFTER PROJECT CREATION
// --------------------------------------------------

async function uploadProjectPhotos(projectId) {

    if (selectedPhotos.length === 0) {
        return {
            photos_uploaded: 0
        };
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

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            result.message || "Photo upload failed."
        );
    }

    return result;
}

// --------------------------------------------------
// RESET FORM AFTER SUCCESSFUL SUBMISSION
// --------------------------------------------------

function resetAfterSuccessfulSubmission() {

    projectForm.reset();

    selectedPhotos = [];

    photoInput.value = "";

    previewUrls.forEach(url => URL.revokeObjectURL(url));
    previewUrls = [];

    photoPreview.innerHTML = "";

    photoCount.textContent = "0 of 5 photographs selected";

    pendingPhotoProjectId = null;

    retryPhotoUploadButton.hidden = true;

    roomsContainer.innerHTML = "";

    addRoom();

    calculateArea();

    submitButton.disabled = !customerLoggedIn;
    addRoomButton.disabled = !customerLoggedIn;
    photoInput.disabled = !customerLoggedIn;
}

// --------------------------------------------------
// RETRY PHOTO UPLOAD WITHOUT CREATING ANOTHER PROJECT
// --------------------------------------------------

retryPhotoUploadButton.addEventListener("click", async function() {

    if (!pendingPhotoProjectId || selectedPhotos.length === 0) {

        showMessage(
            message,
            "Please select the photos again before retrying.",
            "error"
        );

        return;
    }

    retryPhotoUploadButton.disabled = true;

    try {

        const result = await uploadProjectPhotos(pendingPhotoProjectId);

        const completedProjectId = pendingPhotoProjectId;

        resetAfterSuccessfulSubmission();

        showMessage(
            message,
            `Photos uploaded successfully for Project #${completedProjectId}.\nPhotos uploaded: ${result.photos_uploaded}`,
            "success"
        );

        await loadMyProjects();

    } catch (error) {

        showMessage(message, error.message, "error");

    } finally {

        retryPhotoUploadButton.disabled = false;

    }
});

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

    if (!projectForm.reportValidity()) {
        return;
    }

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

            room_name: card.querySelector(".roomName").value.trim(),

            product_id: Number(
                card.querySelector(".productSelect").value
            ),

            length_ft: Number(
                card.querySelector(".roomLength").value
            ),

            width_ft: Number(
                card.querySelector(".roomWidth").value
            ),

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

    const budgetValue = document.getElementById("budget").value;

    const projectData = {

        service_address:
            document.getElementById("serviceAddress").value.trim(),

        preferred_start: startDate || null,

        preferred_end: endDate || null,

        proposed_budget:
            budgetValue === "" ? null : Number(budgetValue),

        notes: document.getElementById("notes").value.trim(),

        rooms

    };

    try {

        submitButton.disabled = true;
        submitButton.textContent = "Submitting...";

        // FIRST: SUBMIT THE PROJECT

        const response = await fetch(`${API}/projects`, {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            credentials: "include",

            body: JSON.stringify(projectData)

        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {

            throw new Error(
                result.message || "Project submission failed."
            );

        }

        const projectId = result.project_id;

        // SECOND: UPLOAD PHOTOS USING THE PROJECT ID

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

        // THIRD: RESET FORM

        resetAfterSuccessfulSubmission();

        showMessage(
            message,
            `Project submitted successfully!\n\nProject ID: ${projectId}\nTotal Area: ${result.total_area_sqft} sq. ft.\nRooms: ${result.number_of_rooms}\nPhotos uploaded: ${photoTotal}`,
            "success"
        );

        // FOURTH: REFRESH PROJECT HISTORY

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
// LOAD CUSTOMER'S PROJECT HISTORY
// --------------------------------------------------

async function loadMyProjects() {

    const projectsContainer =
        document.getElementById("myProjects");

    projectsContainer.textContent = "Loading projects...";

    try {

        const response = await fetch(`${API}/projects/mine`, {

            credentials: "include"

        });

        if (!response.ok) {
            throw new Error("Unable to load project history.");
        }

        const projects = await response.json();

        projectsContainer.innerHTML = "";

        if (projects.length === 0) {

            projectsContainer.textContent =
                "You have not submitted any projects yet.";

            return;
        }

        projects.forEach(project => {

            const item = document.createElement("div");

            item.className = "project-item";

            const heading = document.createElement("h3");

            heading.textContent =
                `Project #${project.project_id}`;

            item.appendChild(heading);

            const address = document.createElement("p");

            address.textContent =
                `Address: ${project.service_address}`;

            item.appendChild(address);

            const area = document.createElement("p");

            area.textContent =
                `Total Area: ${project.total_area_sqft} sq. ft.`;

            item.appendChild(area);

            const status = document.createElement("p");

            status.textContent =
                `Status: ${project.status}`;

            item.appendChild(status);

            const roomsHeading = document.createElement("strong");

            roomsHeading.textContent = "Rooms:";

            item.appendChild(roomsHeading);

            project.rooms.forEach(room => {

                const roomInfo = document.createElement("p");

                roomInfo.textContent =
                    `${room.room_name} — ${room.product_name} — ${room.area_sqft} sq. ft.`;

                item.appendChild(roomInfo);

            });

            projectsContainer.appendChild(item);

        });

    } catch (error) {

        projectsContainer.textContent = error.message;

    }

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