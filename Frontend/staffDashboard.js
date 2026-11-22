const API = "http://localhost:5050/api";

const productForm = document.getElementById("productForm");
const productTable = document.getElementById("productTable");
const message = document.getElementById("message");


// CHECK ANNA'S LOGIN SESSION
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
        message.textContent = "Cannot connect to server.";
        return false;
    }
}


// LOAD ALL PRODUCTS
async function loadProducts() {
    try {
        const response = await fetch(`${API}/admin/products`, {
            credentials: "include"
        });

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
            addCell("$" + product.unit_price + " / " +
                    product.pricing_unit);
            addCell(Number(product.active) === 1
                ? "Active" : "Inactive");

            const actionCell = document.createElement("td");
            const button = document.createElement("button");

            button.className = "status-button";

            const currentlyActive = Number(product.active) === 1;

            button.textContent = currentlyActive
                ? "Deactivate" : "Activate";

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
        message.textContent = error.message;
    }
}


// ADD PRODUCT
productForm.addEventListener("submit", async function(event) {

    event.preventDefault();

    const product = {
        product_name: document.getElementById("product_name").value.trim(),
        category: document.getElementById("category").value.trim(),
        brand: document.getElementById("brand").value.trim(),
        material_style: document.getElementById("material_style").value.trim(),
        color: document.getElementById("color").value.trim(),
        unit_price: Number(document.getElementById("unit_price").value),
        pricing_unit: document.getElementById("pricing_unit").value,
        dimensions: document.getElementById("dimensions").value.trim(),
        sqft_per_package:
            document.getElementById("sqft_per_package").value === ""
            ? null
            : Number(document.getElementById("sqft_per_package").value),
        description: document.getElementById("description").value.trim()
    };

    try {
        const response = await fetch(`${API}/admin/products`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "include",
            body: JSON.stringify(product)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message);
        }

        message.style.color = "green";
        message.textContent = result.message;

        productForm.reset();

        await loadProducts();

    } catch (error) {
        message.style.color = "red";
        message.textContent = error.message;
    }

});


// ACTIVATE OR DEACTIVATE PRODUCT
async function updateProductStatus(productId, active) {

    try {
        const response = await fetch(
            `${API}/admin/products/${productId}/status`,
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
            throw new Error(result.message);
        }

        message.style.color = "green";
        message.textContent = result.message;

        await loadProducts();

    } catch (error) {
        message.style.color = "red";
        message.textContent = error.message;
    }
}


// REFRESH PRODUCTS
document.getElementById("refreshButton")
    .addEventListener("click", loadProducts);


// LOGOUT
document.getElementById("logoutButton")
    .addEventListener("click", async function() {

        try {
            const response = await fetch(`${API}/staff/logout`, {
                method: "POST",
                credentials: "include"
            });

            if (!response.ok) {
                throw new Error("Logout failed.");
            }

            window.location.href = "staffLogin.html";

        } catch (error) {
            message.style.color = "red";
            message.textContent = error.message;
        }
    });


// START DASHBOARD
(async function() {
    const loggedIn = await checkStaffSession();

    if (loggedIn) {
        await loadProducts();
    }
})();


