# API Documentation

This document provides a complete list of all API endpoints available in the Acusion ERP Backend.

## Base URL
All APIs are prefixed with `/api`.

---

## 1. Employee APIs
**Base Path:** `/api/employees`
**File:** `routes/employeesRoutes.js`

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/login` | Public | Employee login. Returns an auth token. |
| `POST` | `/` | **Admin** | Create or update an employee record. |
| `DELETE` | `/:code` | **Admin** | Remove an employee by their employee code. |
| `GET` | `/` | Authenticated | List all employees. |
| `GET` | `/:code` | Authenticated | Get details of a specific employee by code. |
| `POST` | `/send-password-link` | **Admin** | Send a password setup email to an employee. |
| `POST` | `/set-password` | Public | Set a password using a token received in the email. |

---

## 2. Company Settings APIs
**Base Path:** `/api/company-settings`
**File:** `routes/companySettingsRoutes.js`

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/` | **Admin** | Create or update company-wide working hours (for a specific date range or default). |
| `GET` | `/` | **Admin** | List all saved company settings/configurations. |
| `GET` | `/by-date` | Authenticated | Get the work schedule applicable for a specific date (Query param: `?date=YYYY-MM-DD`). |

---

## 3. Attendance APIs
**Base Path:** `/api/attendance`
**File:** `routes/attendanceRoutes.js`

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | **Admin** | Fetch attendance records for all employees. |
| `GET` | `/my` | Authenticated | Fetch the logged-in employee's own attendance history. |
| `GET` | `/summary` | **Admin** | Get a daily attendance summary. |
| `POST` | `/recalculate` | **Admin** | Manually trigger attendance recalculation for a date range. |

---

## 4. Leave APIs
**Base Path:** `/api/leave`
**File:** `routes/leaveRoutes.js`

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/apply` | Authenticated | Apply for a new leave. |
| `GET` | `/my` | Authenticated | Get own leave history and current month's balance. |
| `POST` | `/admin/allocate` | **Admin** | Set monthly leave allocation rules. |
| `PUT` | `/:id` | **Admin** | Approve or reject a leave request. |
| `GET` | `/` | **Admin** | List all leave requests. |
| `GET` | `/admin/balances` | **Admin** | Get leave summaries/balances for all employees. |

---

## 5. Holiday APIs
**Base Path:** `/api/holidays`
**File:** `routes/holidayRoutes.js`

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/` | **Admin** | Create or update a holiday. |
| `GET` | `/` | Authenticated | List all holidays. |
| `DELETE` | `/:id` | **Admin** | Remove a holiday by ID. |

---

## 6. Remark APIs
**Base Path:** `/api/remarks`
**File:** `routes/remarkRoutes.js`

| Method | Endpoint | Access Level | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/create` | Authenticated | Submit a new remark (e.g., for attendance correction). |
| `GET` | `/my` | Authenticated | View own remarks and their status. |
| `GET` | `/pending` | **Admin** | View all pending remark requests. |
| `PUT` | `/accept/:id` | **Admin** | Accept a remark request. |
| `PUT` | `/reject/:id` | **Admin** | Reject a remark request. |
