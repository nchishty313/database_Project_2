
const form = document.getElementById("loginForm");
const message = document.getElementById("message");

form.addEventListener("submit", async function(event) {
    event.preventDefault();

    const credentials = {
        email: document.getElementById("email").value.trim().toLowerCase(),
        password: document.getElementById("password").value
    };

    try {
        const response = await fetch(
            "http://localhost:5050/api/login",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: "include",
                body: JSON.stringify(credentials)
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || "Login failed.");
        }

        message.style.color = "green";
        message.textContent = "Login successful! Redirecting...";

        window.location.href = "customerDashboard.html";

    } catch (error) {
        message.style.color = "red";
        message.textContent = error.message;
    }
});
