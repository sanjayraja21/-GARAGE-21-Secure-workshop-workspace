# -GARAGE-21-Secure-workshop-workspace
Garage21 is a full-stack web application designed to help garages and vehicle service centres manage their daily operations from one place. It brings customer records, vehicle information, service jobs, appointments, estimates, invoices, payments, staff, and inventory into a single workshop management platform.

The application uses **React and Vite** for the frontend, **Python FastAPI** for the backend, and **MongoDB** for data storage. It also supports real-time WebSocket communication and an optional local AI assistant powered by Ollama.

## Features

- **Dashboard:** View workshop activity and operational summaries.
- **Customer management:** Maintain customer profiles and contact information.
- **Vehicle management:** Store vehicle details, registration information, odometer readings, VIN, and insurance expiry.
- **Appointments:** Create booking records and help prevent duplicate date/slot bookings.
- **Service management:** Create job cards and track repair progress through the service workflow.
- **Inspections and quality control:** Record vehicle inspections, QC checks, and test-drive information.
- **Estimates and invoices:** Calculate labour, parts, tax, invoice totals, payments, and outstanding balances.
- **Payments:** Maintain payment records.
- **Inventory and suppliers:** Manage spare parts, stock levels, suppliers, and purchase orders.
- **Staff management:** Maintain mechanic and employee information, attendance, and leave records.
- **Customer support:** Record feedback, complaints, maintenance reminders, and warranty information.
- **Reports:** View operational information and export job data to CSV.
- **Role-based access:** Separate access for administrators, customers, mechanics, and employees.
- **Security:** Password hashing, token-based authentication, protected backend routes, and role-based permission checks.
- **Responsive interface:** Designed for desktop, tablet, and mobile screens.

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, Vite, CSS |
| Backend | Python, FastAPI |
| Database | MongoDB |
| API documentation | FastAPI / Swagger UI |
| Real-time communication | WebSocket |
| Authentication | JWT and Argon2 password hashing |
| Optional local AI | Ollama |

## Project Structure

```text
Garage21/
├── backend/
│   ├── app/
│   │   ├── routers/
│   │   ├── auth.py
│   │   ├── database.py
│   │   ├── main.py
│   │   ├── permissions.py
│   │   ├── roles.py
│   │   └── schemas.py
│   ├── tests/
│   ├── .env.example
│   ├── requirements.txt
│   └── seed_demo.py
├── frontend/
│   ├── public/
│   ├── src/
│   ├── index.html
│   └── package.json
├── .gitignore
└── README.md
```

## Requirements

Install the following before running the project:

- Python 3.10 or newer
- Node.js LTS and npm
- MongoDB Community Server
- Visual Studio Code (recommended)

Ollama is optional and is only required if you want to use the local AI assistant.

