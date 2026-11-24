
const API = "http://localhost:5050/api";

async function loadCustomer() {

    try {

        const response = await fetch(`${API}/me`, {
            credentials: "include"
        });

        if (!response.ok) {
            window.location.href = "login.html";
            return;
        }

        const customer = await response.json();

        document.getElementById("customerName").textContent =
            "Hello, " + customer.first_name + " " +
            customer.last_name;

        document.getElementById("customerEmail").textContent =
            customer.email;

    } catch (error) {
        alert("Unable to connect to server.");
    }
}

document.getElementById("logoutButton")
    .addEventListener("click", async function() {

        const response = await fetch(`${API}/logout`, {
            method: "POST",
            credentials: "include"
        });

        if (response.ok) {
            window.location.href = "login.html";
        } else {
            alert("Logout failed.");
        }
    });

loadCustomer();
