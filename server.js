const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const pool = require('./config/db');
require('dotenv').config();

const employeeRoutes = require('./routes/employeesRoutes');
const companySettingsRoutes = require('./routes/companySettingsRoutes');
// ✅ Correct import
const attendanceRoutes = require('./routes/attendanceRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const holidayRoutes = require('./routes/holidayRoutes');
const remarkRoutes = require('./routes/remarkRoutes');



const app = express();
const port = process.env.PORT || 5000;

// Middleware
// app.use(cors());

const allowedOrigins = [
  process.env.FRONTEND_ORIGIN || 'https://marketing.realxr.in',
  'https://acusion.com',
  'http://localhost:5173',
  'https://hr.acusion.com'
];

// app.use((req, res, next) => {
//   console.log('GLOBAL REQ:', {
//     method: req.method,
//     originalUrl: req.originalUrl,
//     query: req.query,
//   });
//   next();
// });

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: true,
}));

app.use(express.json()); // ✅ Needed for POST body parsing

// Routes
app.use('/api/employees', employeeRoutes);  // ✅ Correct router
app.use('/api/company-settings', companySettingsRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leave', leaveRoutes);
app.use("/api/holidays", holidayRoutes);
app.use("/api/remarks", remarkRoutes);


// Serve static files from dist/ (Frontend build)
const clientDistPath = path.resolve(__dirname, 'dist');
app.use(express.static(clientDistPath, {
  maxAge: '1d',
  etag: true,
  lastModified: true,
}));

// SPA fallback - serve index.html for all non-API routes
app.get(/^(?!\/api(?:\/|$)).*/, (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Start server
app.listen(port, () => console.log('> Server is up and running on port: ' + port));
