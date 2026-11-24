const form = document.getElementById("staffLoginForm");
const message = document.getElementById("message");

form.addEventListener("submit", async function(event) {
    event.preventDefault();

    const credentials = {
        username: document.getElementById("username").value.trim(),
        password: document.getElementById("password").value
    };

    try {
        const response = await fetch(
            "http://localhost:5050/api/staff/login",
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
            throw new Error(result.message);
        }

        message.style.color = "green";
        message.textContent = "Login successful! Opening dashboard...";

        window.location.href = "staffDashboard.html";

    } catch (error) {
        message.style.color = "red";
        message.textContent = error.message;
    }
});


