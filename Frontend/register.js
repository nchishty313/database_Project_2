
const form = document.getElementById("registerForm");
const message = document.getElementById("message");

form.addEventListener("submit", async function(event) {

    event.preventDefault();

    const customer = {
        first_name: document.getElementById("first_name").value.trim(),
        last_name: document.getElementById("last_name").value.trim(),
        address: document.getElementById("address").value.trim(),
        phone: document.getElementById("phone").value.trim(),
        email: document.getElementById("email").value.trim(),
        password: document.getElementById("password").value
    };

    try {

        const response = await fetch(
            "http://localhost:5050/api/register",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                credentials: "include",
                body: JSON.stringify(customer)
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message);
        }

        message.style.color = "green";
        message.textContent =
            "Registration successful! Your Customer ID is "
            + result.client_id;

        form.reset();

    } catch (error) {

        message.style.color = "red";
        message.textContent = error.message;

    }

});
